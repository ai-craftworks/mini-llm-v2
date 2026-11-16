/**
 * config.js
 * Defaults + merge logic. Final config = DEFAULTS <- mini-llm.config.js <- overrides.
 * The result also carries `rootDir` and `resolve(path)` to turn relative paths
 * (like "abilities") into absolute ones.
 */
const fs = require("fs");
const path = require("path");
const { deepMerge } = require("../util/deepMerge");

const DEFAULTS = {
  logLevel: "warn", // debug | info | warn | error | silent
  model: { path: "models/weights.json" },
  training: { dataDir: "data", epochs: 700, lr: 0.008, dModel: 32, dHidden: 64, layers: 2, clipNorm: 5 },
  generation: { temperature: 0.7, maxNewTokens: 20, sampler: "temperature", topK: 5 },
  memory: { maxTurns: 50, persist: false, file: "memory/state.json" },
  abilities: { builtin: true, dir: "abilities", disabled: [] },
  plugins: { builtin: ["stats"], dir: "plugins", disabled: [], settings: {} },
  fallbackResponse: "I am not sure how to respond to that yet. Try /help, add training data, or write an ability for it.",
};

function loadConfig({ rootDir = path.resolve(__dirname, "../.."), configPath, config: overrides = {} } = {}) {
  let fileConfig = {};
  const file = configPath ? path.resolve(configPath) : path.join(rootDir, "mini-llm.config.js");
  if (fs.existsSync(file)) fileConfig = require(file);
  else if (configPath) throw new Error(`Config file not found: ${file}`);

  const merged = deepMerge(deepMerge(DEFAULTS, fileConfig), overrides);
  merged.rootDir = rootDir;
  merged.resolve = (p) => (path.isAbsolute(p) ? p : path.join(rootDir, p));
  return merged;
}

module.exports = { DEFAULTS, loadConfig };
