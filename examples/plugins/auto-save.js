/** Tutorial plugin: saves memory to disk after every bot reply (instead of only on exit). */
module.exports = {
  name: "auto-save",
  version: "1.0.0",
  description: "Saves memory after every reply",
  defaults: { file: "memory/state.json" },
  setup(api) {
    const file = api.agent.config.resolve(api.config.file);
    api.on("response:final", () => api.agent.memory.save(file), { priority: -200 });
    api.on("agent:ready", () => api.agent.memory.load(file)); // restore on start-up too
  },
};
