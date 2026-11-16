/** Tutorial plugin: blocks a user who sends more than `maxPerMinute` messages in a minute. */
module.exports = {
  name: "rate-limit",
  version: "1.0.0",
  description: "Blocks floods of messages",
  defaults: { maxPerMinute: 5, message: "Slow down a little!" },
  setup(api) {
    api.state.times = [];
    api.on("input:received", (p) => {
      if (p.text.startsWith("/")) return; // never block commands
      const now = Date.now();
      api.state.times = api.state.times.filter((t) => now - t < 60000);
      if (api.state.times.length >= api.config.maxPerMinute) {
        p.response = api.config.message; // short-circuits: abilities and model never run
        p.source = "plugin";
      } else api.state.times.push(now);
    }, { priority: 100 });
  },
};
