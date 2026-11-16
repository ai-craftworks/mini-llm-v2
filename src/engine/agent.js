/**
 * agent.js
 * MiniLLMAgent: the object you talk to. It owns the model, memory,
 * abilities, plugins, commands and samplers, and runs this pipeline:
 *
 *  input -> [hook input:received] -> slash command? -> remember user turn
 *        -> abilities (priority order; [hooks ability:before/after])
 *        -> neural network ([hooks generate:before/after])
 *        -> [hook response:final] -> remember bot turn -> reply
 */
const fs = require("fs");
const { loadConfig } = require("./config");
const { createLogger } = require("../util/logger");
const { HookBus } = require("../plugins/hooks");
const { PluginManager } = require("../plugins/pluginManager");
const builtinPlugins = require("../plugins/builtin");
const { AbilityRegistry } = require("../abilities/registry");
const { loadAbilitiesFromDir } = require("../abilities/loader");
const builtinAbilities = require("../abilities/builtin");
const { MemoryManager } = require("../memory/memoryManager");
const { CommandRegistry, registerBuiltinCommands } = require("./commands");
const { SamplerRegistry } = require("./samplers");
const { generateText } = require("./generator");
const { loadModel } = require("./trainer");

/** Accepts a string, { text, meta }, or nothing (= decline). */
function normalizeAbilityResult(out) {
  if (out === null || out === undefined || out === false) return null;
  if (typeof out === "string") return { text: out, meta: {} };
  if (typeof out === "object" && typeof out.text === "string") return { text: out.text, meta: out.meta || {} };
  throw new Error("An ability must return a string, { text, meta }, or null/undefined to decline");
}

class MiniLLMAgent {
  constructor({ config, logger, model = null, tokenizer = null, modelMeta = {} }) {
    this.config = config;
    this.logger = logger;
    this.model = model;
    this.tokenizer = tokenizer;
    this.modelMeta = modelMeta;
    this.hooks = new HookBus({ logger });
    this.abilities = new AbilityRegistry({ logger });
    this.commands = new CommandRegistry();
    this.samplers = new SamplerRegistry();
    this.memory = new MemoryManager({ maxTurns: config.memory.maxTurns, file: config.resolve(config.memory.file) });
    this.plugins = new PluginManager({ agent: this });
    this.now = () => new Date();
    this.rng = Math.random;
  }

  /**
   * options: { rootDir, configPath, config (overrides), loadModel (default true),
   *            model, tokenizer (supply your own), logger }
   */
  static async create(options = {}) {
    const config = loadConfig(options);
    const logger = options.logger || createLogger({ level: config.logLevel });
    let { model = null, tokenizer = null } = options;
    let modelMeta = {};
    if (!model && options.loadModel !== false) {
      const file = config.resolve(config.model.path);
      if (fs.existsSync(file)) ({ model, tokenizer, meta: modelMeta } = loadModel(file));
      else logger.warn(`No trained model at ${file}. Run "node cli.js train". Abilities still work.`);
    }
    const agent = new MiniLLMAgent({ config, logger, model, tokenizer, modelMeta });
    await agent._init();
    return agent;
  }

  async _init() {
    const { config, logger } = this;
    if (config.abilities.builtin) {
      for (const def of builtinAbilities) this.abilities.register(def, { source: "builtin" });
    }
    registerBuiltinCommands(this);

    if (config.memory.persist) this.memory.load();

    for (const name of config.plugins.builtin || []) {
      if (!builtinPlugins[name]) { logger.warn(`Unknown built-in plugin "${name}"`); continue; }
      await this.plugins.register(builtinPlugins[name], { source: "builtin" });
    }
    await this.plugins.loadDir(config.resolve(config.plugins.dir), config.plugins.disabled);
    loadAbilitiesFromDir(config.resolve(config.abilities.dir), this.abilities, logger);
    for (const name of config.abilities.disabled || []) if (this.abilities.has(name)) this.abilities.disable(name);

    await this.hooks.run("agent:ready", { agent: this });
  }

  async _remember(role, text, meta) {
    const turn = this.memory.conversation.add(role, text, meta);
    await this.hooks.run("memory:added", { turn });
    return turn;
  }

  _abilityContext(text) {
    return {
      input: text, agent: this, config: this.config, log: this.logger.child("ability"),
      memory: this.memory, facts: this.memory.facts, conversation: this.memory.conversation,
      now: this.now, rng: this.rng,
    };
  }

  /** Send one message; resolves to { text, source, ability?, meta }. */
  async respond(input) {
    const started = Date.now();
    const original = String(input === undefined || input === null ? "" : input);
    const payload = { text: original.trim(), original, response: undefined, source: undefined, meta: {} };
    await this.hooks.run("input:received", payload);

    const text = String(payload.text === undefined || payload.text === null ? "" : payload.text).trim();
    let result;

    if (payload.response !== undefined && payload.response !== null) {
      result = { text: String(payload.response), source: payload.source || "plugin", ability: null };
    } else if (!text) {
      result = { text: "", source: "empty", ability: null };
    } else if (text.startsWith("/") && this.commands.has(text.slice(1).split(/\s+/)[0])) {
      const [name, ...rest] = text.slice(1).split(/\s+/);
      try {
        result = { text: await this.commands.run(name, rest.join(" "), { agent: this }), source: "command", ability: null, command: name };
      } catch (error) {
        await this.hooks.run("error", { error, stage: "command", plugin: undefined });
        result = { text: `Command failed: ${error.message}`, source: "command", ability: null, command: name };
      }
    } else {
      await this._remember("user", text);
      result = await this._route(text);
    }

    result.meta = { ...(payload.meta || {}), ...(result.meta || {}) };
    const final = { text: result.text, source: result.source, ability: result.ability, input: text, meta: result.meta };
    await this.hooks.run("response:final", final);
    result = { ...result, text: String(final.text), source: final.source, ability: final.ability, meta: final.meta };

    if (result.source !== "command" && result.source !== "empty") await this._remember("bot", result.text, { source: result.source, ability: result.ability });
    result.elapsedMs = Date.now() - started;
    return result;
  }

  async _route(text) {
    const ctx = this._abilityContext(text);
    for (const { ability, match } of this.abilities.candidates(text, ctx)) {
      const before = { ability, match, input: text, skip: false };
      await this.hooks.run("ability:before", before);
      if (before.skip) continue;
      try {
        const out = normalizeAbilityResult(await ability.run({ ...ctx, match: before.match, ability }));
        if (!out) continue; // ability declined
        const after = { ability, input: text, response: out.text, meta: out.meta };
        await this.hooks.run("ability:after", after);
        return { text: after.response, source: "ability", ability: ability.name, meta: after.meta };
      } catch (error) {
        this.logger.warn(`Ability "${ability.name}" failed: ${error.message}`);
        await this.hooks.run("error", { error, stage: "ability", ability: ability.name });
      }
    }
    return this._generate(text);
  }

  async _generate(text) {
    const g = this.config.generation;
    const gen = { text, temperature: g.temperature, maxNewTokens: g.maxNewTokens, sampler: g.sampler, topK: g.topK, response: undefined };
    await this.hooks.run("generate:before", gen);
    if (gen.response !== undefined && gen.response !== null) return { text: String(gen.response), source: "plugin", ability: null };
    if (!this.model) return { text: this.config.fallbackResponse, source: "fallback", ability: null };

    let samplerFn;
    try {
      samplerFn = this.samplers.get(gen.sampler);
    } catch (error) {
      this.logger.warn(error.message + " - using \"temperature\"");
      samplerFn = this.samplers.get("temperature");
    }
    const out = generateText({
      model: this.model, tokenizer: this.tokenizer, text: gen.text, sampler: samplerFn,
      temperature: gen.temperature, maxNewTokens: gen.maxNewTokens, topK: gen.topK, rng: this.rng,
    });
    const after = { input: text, text: out.text, tokens: out.tokens };
    await this.hooks.run("generate:after", after);
    if (!String(after.text).trim()) return { text: this.config.fallbackResponse, source: "fallback", ability: null };
    return { text: after.text, source: "model", ability: null };
  }

  async shutdown() {
    await this.hooks.run("agent:shutdown", { agent: this });
    await this.plugins.unregisterAll();
    if (this.config.memory.persist) this.memory.save();
  }
}

module.exports = { MiniLLMAgent, normalizeAbilityResult };
