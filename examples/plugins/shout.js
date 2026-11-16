/** Example: a command plugin. "/shout hello" -> "HELLO!" and a toggle for UPPERCASE replies. */
module.exports = {
  name: "shout",
  version: "1.0.0",
  description: "Adds /shout and /loud on|off",
  setup(api) {
    api.state.loud = false;
    api.registerCommand("shout", { description: "/shout <text> prints it in capitals", run: (args) => args.toUpperCase() + "!" });
    api.registerCommand("loud", {
      description: "/loud on|off makes every reply UPPERCASE",
      run: (args) => { api.state.loud = args.trim() === "on"; return `loud mode ${api.state.loud ? "on" : "off"}`; },
    });
    api.on("response:final", (p) => { if (api.state.loud && p.source !== "command") p.text = p.text.toUpperCase(); }, { priority: 10 });
  },
};
