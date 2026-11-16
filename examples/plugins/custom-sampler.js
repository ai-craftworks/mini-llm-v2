/** Example: registers a new sampling strategy, "top-p" (nucleus sampling). Use: /set sampler top-p */
module.exports = {
  name: "top-p-sampler",
  version: "1.0.0",
  description: "Adds nucleus (top-p) sampling",
  defaults: { p: 0.9 },
  setup(api) {
    api.registerSampler("top-p", (probs, { rng = Math.random, temperature = 1 }) => {
      const ranked = probs.map((prob, id) => [prob, id]).sort((a, b) => b[0] - a[0]);
      const nucleus = [];
      let cum = 0;
      for (const item of ranked) { nucleus.push(item); cum += item[0]; if (cum >= api.config.p) break; }
      const weights = nucleus.map(([prob]) => Math.pow(Math.max(prob, 1e-12), 1 / Math.max(temperature, 0.01)));
      let r = rng() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < nucleus.length; i++) { r -= weights[i]; if (r <= 0) return nucleus[i][1]; }
      return nucleus[nucleus.length - 1][1];
    });
  },
};
