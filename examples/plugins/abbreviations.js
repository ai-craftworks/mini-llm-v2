/** Tutorial plugin: expands text-speak before abilities and the model see it. */
module.exports = {
  name: "abbreviations",
  version: "1.0.0",
  description: "Expands pls/thx/u/r/btw in user input",
  defaults: { map: { pls: "please", thx: "thanks", u: "you", r: "are", btw: "by the way" } },
  setup(api) {
    const words = Object.keys(api.config.map);
    const re = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
    api.on("input:received", (p) => {
      p.text = p.text.replace(re, (w) => api.config.map[w.toLowerCase()]);
    }, { priority: 90 });
  },
};
