/** Example ability: flips a virtual coin. Uses ctx.rng so tests can control randomness. */
module.exports = {
  name: "coin-flip",
  description: "Flips a coin: 'flip a coin'",
  examples: ["flip a coin", "toss a coin"],
  patterns: [/\b(?:flip|toss)\s+a\s+coin\b/i],
  run: ({ rng }) => (rng() < 0.5 ? "Heads!" : "Tails!"),
};
