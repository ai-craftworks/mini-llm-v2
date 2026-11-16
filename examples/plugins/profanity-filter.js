/** Example: censors words in BOTH directions using hooks. Settings: { words: [...] } */
module.exports = {
  name: "profanity-filter",
  version: "1.0.0",
  description: "Masks unwanted words in user input and bot replies",
  defaults: { words: ["darn", "heck"], mask: "***" },
  setup(api) {
    const re = new RegExp(`\\b(${api.config.words.join("|")})\\b`, "gi");
    const clean = (s) => s.replace(re, api.config.mask);
    api.on("input:received", (p) => { p.text = clean(p.text); }, { priority: 50 });
    api.on("response:final", (p) => { p.text = clean(p.text); }, { priority: 50 });
  },
};
