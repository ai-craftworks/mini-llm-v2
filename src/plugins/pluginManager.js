/**
 * pluginManager.js
 * Loads plugins and hands each one a private `api` object. Everything a
 * plugin registers (hooks, abilities, commands, stores, samplers) is
 * tracked so that unregister() can undo it completely.
 */
const fs = require("fs");
const path = require("path");
const { deepMerge } = require("../util/deepMerge");

class PluginManager {
  constructor({ agent }) {
    this.agent = agent;
    this.plugins = new Map();
  }

  async register(plugin, { source = "manual" } = {}) {
    if (!plugin || typeof plugin !== "object") throw new Error("A plugin must be an object (or a setup function)");
    const { name } = plugin;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
      throw new Error(`Plugin name must be letters/digits/-/_ (got ${JSON.stringify(name)})`);
    }
    if (this.plugins.has(name)) throw new Error(`Plugin "${name}" is already registered`);
    if (plugin.setup !== undefined && typeof plugin.setup !== "function") throw new Error(`Plugin "${name}": setup must be a function`);

    const userSettings = (this.agent.config.plugins.settings || {})[name] || {};
    const settings = deepMerge(plugin.defaults || {}, userSettings);
    const record = {
      name, version: plugin.version || "0.0.0", description: plugin.description || "", source, plugin,
      hooks: [], abilities: [], commands: [], stores: [], samplers: [],
    };
    const api = this._buildApi(record, settings);
    record.api = api;
    try {
      if (plugin.setup) await plugin.setup(api);
    } catch (error) {
      this._cleanup(record);
      throw new Error(`Plugin "${name}" setup failed: ${error.message}`);
    }
    this.plugins.set(name, record);
    return record;
  }

  _buildApi(record, settings) {
    const agent = this.agent;
    const name = record.name;
    return {
      name,
      version: record.version,
      config: settings,
      state: {},
      agent,
      log: agent.logger.child(`plugin:${name}`),
      on(hook, handler, opts = {}) {
        const off = agent.hooks.on(hook, handler, { ...opts, plugin: name });
        record.hooks.push({ hook, handler });
        return off;
      },
      defineHook: (hookName) => agent.hooks.define(hookName),
      registerAbility(def) {
        const ability = agent.abilities.register(def, { source: `plugin:${name}` });
        record.abilities.push(ability.name);
        return ability;
      },
      registerCommand(cmdName, spec) {
        agent.commands.register(cmdName, spec, { plugin: name });
        record.commands.push(cmdName);
      },
      registerStore(storeName, store) {
        agent.memory.registerStore(storeName, store);
        record.stores.push(storeName);
        return store;
      },
      registerSampler(samplerName, fn) {
        agent.samplers.register(samplerName, fn);
        record.samplers.push(samplerName);
      },
    };
  }

  _cleanup(record) {
    const a = this.agent;
    a.hooks.removePlugin(record.name);
    record.abilities.forEach((n) => a.abilities.unregister(n));
    record.commands.forEach((n) => a.commands.unregister(n));
    record.stores.forEach((n) => a.memory.unregisterStore(n));
    record.samplers.forEach((n) => a.samplers.unregister(n));
  }

  async unregister(name) {
    const record = this.plugins.get(name);
    if (!record) return false;
    try {
      if (record.plugin.teardown) await record.plugin.teardown(record.api);
    } catch (error) {
      this.agent.logger.warn(`Plugin "${name}" teardown failed: ${error.message}`);
    }
    this._cleanup(record);
    this.plugins.delete(name);
    return true;
  }

  async unregisterAll() {
    for (const name of [...this.plugins.keys()].reverse()) await this.unregister(name);
  }

  list() {
    return [...this.plugins.values()];
  }

  get(name) {
    return this.plugins.get(name) || null;
  }

  /** Load every *.js file in `dir` (skipping names in `disabled`). Returns { loaded, errors }. */
  async loadDir(dir, disabled = []) {
    const loaded = [];
    const errors = [];
    if (!fs.existsSync(dir)) return { loaded, errors };
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
      const base = path.basename(file, ".js");
      try {
        let exported = require(path.join(dir, file));
        if (exported && exported.default) exported = exported.default;
        const plugin = typeof exported === "function" ? { name: base, setup: exported } : exported;
        if (disabled.includes(plugin.name) || disabled.includes(base)) continue;
        await this.register(plugin, { source: `file:${file}` });
        loaded.push(plugin.name);
      } catch (error) {
        errors.push({ file, error: error.message });
        this.agent.logger.warn(`Could not load plugin file "${file}": ${error.message}`);
      }
    }
    return { loaded, errors };
  }
}

module.exports = { PluginManager };
