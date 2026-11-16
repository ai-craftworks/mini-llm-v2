/** Tutorial ability: reverses text. Try: reverse hello world */
module.exports = {
  name: "reverse-text",
  description: "Reverses text: 'reverse hello'",
  examples: ["reverse hello world"],
  patterns: [/^reverse\s+(.+)$/i],
  run: ({ match }) => [...match[1]].reverse().join(""),
};
