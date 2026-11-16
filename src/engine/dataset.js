/**
 * dataset.js
 * Loads training conversations from a folder. Every *.js / *.json file can
 * hold an array of pairs:  [["hi","hello !"], ...]  or  [{ user, bot }, ...].
 */
const fs = require("fs");
const path = require("path");

function normalizePair(item, file, index) {
  let user, bot;
  if (Array.isArray(item)) [user, bot] = item;
  else if (item && typeof item === "object") ({ user, bot } = item);
  if (typeof user !== "string" || typeof bot !== "string" || !user.trim() || !bot.trim()) {
    throw new Error(`${file}: item #${index} must be ["user text", "bot text"] or { user, bot }`);
  }
  return [user, bot];
}

function loadConversations(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Training data folder not found: ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => /\.(js|json)$/i.test(f)).sort();
  const pairs = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const data = full.endsWith(".json") ? JSON.parse(fs.readFileSync(full, "utf-8")) : require(full);
    if (!Array.isArray(data)) throw new Error(`${file}: must export/contain an array of conversation pairs`);
    data.forEach((item, i) => pairs.push(normalizePair(item, file, i)));
  }
  if (!pairs.length) throw new Error(`No training pairs found in ${dir}`);
  return { pairs, files };
}

module.exports = { loadConversations, normalizePair };
