/**
 * commands.js
 * Slash commands (/help, /facts, ...). Commands run INSTEAD of normal chat:
 * they never touch conversation memory and never reach the neural network.
 * Plugins add their own with api.registerCommand().
 */
class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }

  register(name, spec, { plugin = "core" } = {}) {
    if (typeof spec === "function") spec = { run: spec };
    if (!/^[a-z][a-z0-9-_]*$/i.test(name)) throw new Error(`Invalid command name "${name}"`);
    if (!spec || typeof spec.run !== "function") throw new Error(`Command "${name}" needs a run(args, ctx) function`);
    const key = name.toLowerCase();
    if (this.commands.has(key)) throw new Error(`Command "/${key}" already exists`);
    this.commands.set(key, { name: key, description: spec.description || "", run: spec.run, plugin });
  }

  unregister(name) {
    return this.commands.delete(name.toLowerCase());
  }

  has(name) {
    return this.commands.has(name.toLowerCase());
  }

  list() {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async run(name, args, ctx) {
    const cmd = this.commands.get(name.toLowerCase());
    if (!cmd) throw new Error(`Unknown command /${name}`);
    const out = await cmd.run(args, ctx);
    return out === undefined || out === null ? "" : String(out);
  }
}

function registerBuiltinCommands(agent) {
  const c = agent.commands;
  const fmtTime = (t) => new Date(t).toLocaleString();

  c.register("help", { description: "List all commands", run: () =>
    "Commands:\n" + c.list().map((x) => `  /${x.name.padEnd(10)} ${x.description}`).join("\n") });

  c.register("abilities", { description: "List abilities (priority, source, on/off)", run: () =>
    agent.abilities.list().map((a) => `${a.enabled ? "[on] " : "[off]"} ${a.name} (priority ${a.priority}, ${a.source}) - ${a.description}`).join("\n") || "No abilities." });

  c.register("ability", { description: "/ability <name> on|off", run: (args) => {
    const [name, state] = args.trim().split(/\s+/);
    if (!name || !["on", "off"].includes(state)) return "Usage: /ability <name> on|off";
    state === "on" ? agent.abilities.enable(name) : agent.abilities.disable(name);
    return `Ability "${name}" is now ${state}.`;
  } });

  c.register("plugins", { description: "List loaded plugins", run: () =>
    agent.plugins.list().map((p) => `${p.name}@${p.version} (${p.source}) - ${p.description}`).join("\n") || "No plugins loaded." });

  c.register("facts", { description: "Show remembered facts", run: () => {
    const f = agent.memory.facts.toObject();
    const keys = Object.keys(f);
    return keys.length ? keys.map((k) => `${k} = ${f[k]}`).join("\n") : "No facts remembered.";
  } });

  c.register("forget", { description: "/forget <key> or /forget all", run: (args) => {
    const key = args.trim();
    if (!key) return "Usage: /forget <key> | /forget all";
    if (key === "all") { agent.memory.facts.clear(); return "All facts forgotten."; }
    return agent.memory.facts.delete(key) ? `Forgot "${key}".` : `No fact named "${key}".`;
  } });

  c.register("history", { description: "/history [n] show recent conversation turns", run: (args) => {
    const n = parseInt(args, 10) || 10;
    return agent.memory.conversation.last(n).map((t) => `[${fmtTime(t.timestamp)}] ${t.role}: ${t.text}`).join("\n") || "Conversation is empty.";
  } });

  c.register("memory", { description: "Memory usage summary", run: () => {
    const m = agent.memory;
    const stores = [...m.stores.keys()];
    return `conversation turns: ${m.conversation.size}/${m.conversation.maxTurns}\nfacts: ${m.facts.size}\ncustom stores: ${stores.length ? stores.join(", ") : "(none)"}`;
  } });

  c.register("reset", { description: "/reset clears the conversation; /reset all clears facts too", run: (args) => {
    if (args.trim() === "all") { agent.memory.clearAll(); return "All memory cleared."; }
    agent.memory.conversation.clear();
    return "Conversation cleared (facts kept).";
  } });

  c.register("save", { description: "/save [file] write memory to a JSON file", run: (args) => {
    const file = args.trim() ? agent.config.resolve(args.trim()) : agent.config.resolve(agent.config.memory.file);
    agent.memory.save(file);
    return `Memory saved to ${file}`;
  } });

  c.register("load", { description: "/load [file] restore memory from a JSON file", run: (args) => {
    const file = args.trim() ? agent.config.resolve(args.trim()) : agent.config.resolve(agent.config.memory.file);
    return agent.memory.load(file) ? `Memory loaded from ${file}` : `No memory file at ${file}`;
  } });

  c.register("set", { description: "/set temperature|maxNewTokens|topK|sampler <value>", run: (args) => {
    const [key, value] = args.trim().split(/\s+/);
    const g = agent.config.generation;
    if (key === "temperature" || key === "topK" || key === "maxNewTokens") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return `"${value}" is not a valid number.`;
      g[key] = n;
    } else if (key === "sampler") {
      agent.samplers.get(value); // throws if unknown
      g.sampler = value;
    } else return "Usage: /set temperature|maxNewTokens|topK|sampler <value>";
    return `generation.${key} = ${g[key]}`;
  } });

  c.register("samplers", { description: "List sampling strategies", run: () =>
    agent.samplers.list().map((s) => (s === agent.config.generation.sampler ? `* ${s}` : `  ${s}`)).join("\n") });
}

module.exports = { CommandRegistry, registerBuiltinCommands };
