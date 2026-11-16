#!/usr/bin/env node
/**
 * cli.js - command line entry point.  Run `node cli.js help`.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const { MiniLLMAgent } = require("./src/engine/agent");
const { loadConfig } = require("./src/engine/config");
const { loadConversations } = require("./src/engine/dataset");
const { trainModel, saveModel } = require("./src/engine/trainer");

const ROOT = __dirname;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

const HELP = `mini-llm - a from-scratch transformer with memory, abilities and plugins

Usage: node cli.js <command> [options]

  train                 Train the model on every file in your data folder
      --epochs N --lr X --dModel N --dHidden N --layers N --data DIR --seed N
  chat                  Interactive chat (type /help inside for commands)
      --temperature X --sampler NAME --maxNewTokens N --debug --persist
  ask "message"         Send one message and print the reply
  abilities             List all loaded abilities
  plugins               List all loaded plugins
  new ability <name>    Scaffold abilities/<name>.js   (add --json for a JSON ability)
  new plugin <name>     Scaffold plugins/<name>.js
  test                  Run the whole test-suite
  help                  Show this text
`;

function overridesFromFlags(flags) {
  const o = { generation: {}, memory: {}, training: {} };
  if (flags.temperature !== undefined) o.generation.temperature = Number(flags.temperature);
  if (flags.sampler) o.generation.sampler = String(flags.sampler);
  if (flags.maxNewTokens !== undefined) o.generation.maxNewTokens = Number(flags.maxNewTokens);
  if (flags.persist) o.memory.persist = true;
  if (flags.debug) o.logLevel = "debug";
  return o;
}

async function cmdTrain(flags) {
  const config = loadConfig({ rootDir: ROOT });
  const t = { ...config.training };
  for (const k of ["epochs", "lr", "dModel", "dHidden", "layers"]) if (flags[k] !== undefined) t[k] = Number(flags[k]);
  if (flags.data) t.dataDir = String(flags.data);

  const { pairs, files } = loadConversations(config.resolve(t.dataDir));
  console.log(`Training data: ${pairs.length} conversations from ${files.join(", ")}`);
  console.log("Hyper-parameters:", { epochs: t.epochs, lr: t.lr, dModel: t.dModel, dHidden: t.dHidden, layers: t.layers });

  const started = Date.now();
  const { model, tokenizer, history } = trainModel({
    pairs, hyper: t, seed: flags.seed !== undefined ? Number(flags.seed) : undefined,
    onEpoch: (epoch, loss) => {
      if (epoch === 1 || epoch % 20 === 0 || epoch === t.epochs) console.log(`Epoch ${epoch}/${t.epochs}  loss ${loss.toFixed(4)}`);
    },
  });
  const file = config.resolve(config.model.path);
  saveModel(file, model, tokenizer, { epochs: t.epochs, finalLoss: history[history.length - 1], pairs: pairs.length });
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s. Vocabulary: ${tokenizer.vocabSize} words. Saved to ${file}`);
}

async function cmdChat(flags) {
  const agent = await MiniLLMAgent.create({ rootDir: ROOT, config: overridesFromFlags(flags) });
  const debug = !!flags.debug;
  console.log("Mini LLM ready. Type a message, or /help for commands. Ctrl+C or 'exit' to quit.\n");

  const rl = readline.createInterface({ input: process.stdin });
  process.stdout.write("You: ");
  for await (const line of rl) {
    const text = line.trim();
    if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") break;
    if (text) {
      const r = await agent.respond(text);
      const tag = debug ? `  [${r.source}${r.ability ? ":" + r.ability : ""}, ${r.elapsedMs}ms]` : "";
      console.log(`Bot: ${r.text || "(...)"}${tag}\n`);
    }
    process.stdout.write("You: ");
  }
  await agent.shutdown();
  console.log("\nGoodbye!");
}

async function cmdAsk(positional, flags) {
  const message = positional.slice(1).join(" ");
  if (!message) { console.error('Usage: node cli.js ask "your message"'); process.exit(1); }
  const agent = await MiniLLMAgent.create({ rootDir: ROOT, config: overridesFromFlags(flags) });
  console.log((await agent.respond(message)).text);
  await agent.shutdown();
}

async function cmdList(kind) {
  const agent = await MiniLLMAgent.create({ rootDir: ROOT, loadModel: false });
  console.log((await agent.respond(`/${kind}`)).text);
}

const ABILITY_TEMPLATE = (name) => `/**
 * abilities/${name}.js - your custom ability. See ABILITIES.md.
 */
module.exports = {
  name: "${name}",
  description: "Describe what this ability does",
  priority: 0,                       // higher runs first (built-ins use 10)
  examples: ["example phrase"],

  // How it triggers - use patterns, keywords and/or match():
  patterns: [/^replace me$/i],

  // What it does. ctx has: input, match, facts, conversation, memory, agent, now()
  // Return a string, { text, meta }, or null to decline.
  run: ({ input, match, facts }) => {
    return "Hello from ${name}!";
  },
};
`;

const JSON_ABILITY_TEMPLATE = (name) => JSON.stringify({
  name, description: "Describe what this ability does", patterns: ["^replace me$"], response: "Hello from " + name + "!",
}, null, 2) + "\n";

const PLUGIN_TEMPLATE = (name) => `/**
 * plugins/${name}.js - your custom plugin. See PLUGINS.md.
 */
module.exports = {
  name: "${name}",
  version: "1.0.0",
  description: "Describe what this plugin does",
  defaults: {},                      // default settings (override in mini-llm.config.js)

  setup(api) {
    // api.on(hook, handler, { priority })
    api.on("response:final", (payload) => {
      api.log.debug("replied via", payload.source);
    });

    // api.registerAbility({...}) / api.registerCommand("name", {...}) are also available
  },

  teardown() {},
};
`;

function cmdNew(positional, flags) {
  const [, kind, name] = positional;
  if (!["ability", "plugin"].includes(kind) || !name || !/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
    console.error("Usage: node cli.js new ability|plugin <name>   (letters, digits, - and _)");
    process.exit(1);
  }
  const ext = kind === "ability" && flags.json ? "json" : "js";
  const dir = path.join(ROOT, kind === "ability" ? "abilities" : "plugins");
  const file = path.join(dir, `${name}.${ext}`);
  if (fs.existsSync(file)) { console.error(`Refusing to overwrite ${file}`); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  const body = kind === "plugin" ? PLUGIN_TEMPLATE(name) : ext === "json" ? JSON_ABILITY_TEMPLATE(name) : ABILITY_TEMPLATE(name);
  fs.writeFileSync(file, body);
  console.log(`Created ${path.relative(process.cwd(), file)}`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0] || "help";
  switch (command) {
    case "train": return cmdTrain(flags);
    case "chat": return cmdChat(flags);
    case "ask": return cmdAsk(positional, flags);
    case "abilities": return cmdList("abilities");
    case "plugins": return cmdList("plugins");
    case "new": return cmdNew(positional, flags);
    case "test": {
      const r = spawnSync(process.execPath, [path.join(ROOT, "test", "run-all.js")], { stdio: "inherit" });
      process.exit(r.status || 0);
      break;
    }
    default: console.log(HELP);
  }
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
