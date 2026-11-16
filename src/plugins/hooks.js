/**
 * hooks.js
 * The HookBus: named extension points that plugins subscribe to.
 *
 * A handler receives ONE mutable payload object and changes it in place
 * (async handlers are awaited). Handlers run one at a time, highest
 * `priority` first (ties: registration order). A handler that throws is
 * logged, reported on the "error" hook, and skipped; it never breaks the chat.
 */
const BUILTIN_HOOKS = [
  "agent:ready",      // { agent }
  "input:received",   // { text, original, response?, source?, meta }
  "ability:before",   // { ability, match, input, skip }
  "ability:after",    // { ability, input, response, meta }
  "generate:before",  // { text, temperature, maxNewTokens, sampler, topK, response? }
  "generate:after",   // { input, text, tokens }
  "response:final",   // { text, source, ability, input, meta }
  "memory:added",     // { turn }
  "error",            // { error, hook?, plugin?, stage, ability? }
  "agent:shutdown",   // { agent }
];

class HookBus {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.known = new Set(BUILTIN_HOOKS);
    this.handlers = new Map();
    this._seq = 0;
  }

  /** Declare a custom hook, e.g. "notes:saved". Must look like "namespace:event". */
  define(name) {
    if (!/^[a-z][a-z0-9-]*:[a-z0-9:-]+$/i.test(name)) {
      throw new Error(`Custom hook names must look like "namespace:event" (got "${name}")`);
    }
    this.known.add(name);
  }

  on(name, handler, { priority = 0, plugin = "core" } = {}) {
    if (!this.known.has(name)) {
      throw new Error(`Unknown hook "${name}". Valid hooks: ${[...this.known].join(", ")}`);
    }
    if (typeof handler !== "function") throw new Error(`Handler for "${name}" must be a function`);
    const list = this.handlers.get(name) || [];
    list.push({ handler, priority, plugin, seq: this._seq++ });
    this.handlers.set(name, list);
    return () => this.off(name, handler);
  }

  off(name, handler) {
    const list = this.handlers.get(name);
    if (list) this.handlers.set(name, list.filter((e) => e.handler !== handler));
  }

  removePlugin(plugin) {
    for (const [name, list] of this.handlers) this.handlers.set(name, list.filter((e) => e.plugin !== plugin));
  }

  count(name) {
    return (this.handlers.get(name) || []).length;
  }

  names() {
    return [...this.known];
  }

  async run(name, payload = {}) {
    const list = (this.handlers.get(name) || []).slice().sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const entry of list) {
      try {
        await entry.handler(payload);
      } catch (error) {
        if (this.logger) this.logger.error(`Hook "${name}" handler from "${entry.plugin}" failed: ${error.message}`);
        if (name !== "error") await this.run("error", { error, hook: name, plugin: entry.plugin, stage: "hook" });
      }
    }
    return payload;
  }
}

module.exports = { HookBus, BUILTIN_HOOKS };
