/** Example: converts km<->miles and C<->F. Try "convert 10 km to miles", "convert 100 f to c". */
const CONVERSIONS = {
  "km->miles": (v) => v * 0.621371,
  "miles->km": (v) => v / 0.621371,
  "c->f": (v) => (v * 9) / 5 + 32,
  "f->c": (v) => ((v - 32) * 5) / 9,
};

module.exports = {
  name: "unit-converter",
  description: "Converts km/miles and C/F: 'convert 10 km to miles'",
  priority: 15,
  patterns: [/^convert\s+(-?\d+(?:\.\d+)?)\s*(km|miles|c|f)\s+to\s+(km|miles|c|f)$/i],
  run: ({ match }) => {
    const [, value, from, to] = match;
    const fn = CONVERSIONS[`${from.toLowerCase()}->${to.toLowerCase()}`];
    if (!fn) return `I cannot convert ${from} to ${to}.`;
    return `${value} ${from} = ${Number(fn(parseFloat(value)).toFixed(2))} ${to}`;
  },
};
