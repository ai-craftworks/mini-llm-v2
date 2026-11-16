/** Example ability: rolls dice. Shows capture groups in ctx.match. */
module.exports = {
  name: "dice",
  description: "Rolls a die: 'roll a d6', 'roll d20', 'roll a die'",
  examples: ["roll a d6", "roll d20", "roll a die"],
  patterns: [/\broll\s+(?:a\s+)?d(\d{1,4})\b/i, /\broll\s+(?:a\s+)?die\b/i],
  run: ({ match, rng }) => {
    const sides = match[1] ? parseInt(match[1], 10) : 6;
    if (sides < 2) return "A die needs at least 2 sides.";
    return `You rolled a ${Math.floor(rng() * sides) + 1} (d${sides}).`;
  },
};
