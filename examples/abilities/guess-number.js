/**
 * Tutorial ability: a number-guessing game that keeps its state in FACT memory.
 * Try: "play guess", then "guess 50", "guess 75", ...
 */
module.exports = {
  name: "guess-number",
  description: "Number guessing game: 'play guess', then 'guess <number>'",
  priority: 15,
  match: (input) => {
    if (/^play guess(?:ing)?(?: game)?$/i.test(input.trim())) return { action: "start" };
    const m = /^guess (\d+)$/i.exec(input.trim());
    return m ? { action: "guess", value: parseInt(m[1], 10) } : null;
  },
  run: ({ match, facts, rng }) => {
    if (match.action === "start") {
      facts.set("guess-target", Math.floor(rng() * 100) + 1, { source: "ability:guess-number" });
      facts.set("guess-count", 0);
      return "I picked a number from 1 to 100. Say 'guess <number>'.";
    }
    if (!facts.has("guess-target")) return "We are not playing yet. Say 'play guess' first.";
    const target = facts.get("guess-target");
    const tries = facts.get("guess-count") + 1;
    facts.set("guess-count", tries);
    if (match.value === target) {
      facts.delete("guess-target");
      facts.delete("guess-count");
      return `Correct! The number was ${target}. You needed ${tries} guess(es).`;
    }
    return match.value < target ? "Higher!" : "Lower!";
  },
};
