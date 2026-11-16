/** Example plugin: measures how long each reply takes and logs it at debug level. */
module.exports = {
  name: "timer",
  version: "1.0.0",
  description: "Logs reply time at debug level (run chat with --debug)",
  setup(api) {
    api.on("input:received", () => { api.state.start = Date.now(); }, { priority: 100 });
    api.on("response:final", (p) => {
      p.meta.timerMs = Date.now() - api.state.start;
      api.log.debug(`reply via ${p.source} took ${p.meta.timerMs}ms`);
    }, { priority: -50 });
  },
};
