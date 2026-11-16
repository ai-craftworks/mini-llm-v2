/**
 * mini-llm.config.js - YOUR settings. Anything you omit uses the default
 * (see src/engine/config.js and CONFIGURATION.md). Command-line flags override this file.
 */
module.exports = {
  // debug | info | warn | error | silent
  logLevel: "warn",

  model: { path: "models/weights.json" },

  training: {
    dataDir: "data",   // every .js/.json file in this folder is training data
    epochs: 700,
    lr: 0.008,
    dModel: 32,        // size of each word vector
    dHidden: 64,       // size of the feed-forward layer
    layers: 2,         // number of transformer blocks
    clipNorm: 5,       // gradient clipping (stability)
  },

  generation: {
    temperature: 0.7,  // 0 = always most likely word, higher = more random
    maxNewTokens: 20,
    sampler: "temperature", // temperature | greedy | topk | (any plugin sampler)
    topK: 5,
  },

  memory: {
    maxTurns: 50,        // conversation turns kept in RAM
    persist: false,      // true = load on start, save on exit
    file: "memory/state.json",
  },

  abilities: {
    builtin: true,       // calculator, datetime, remember, recall, forget, help, ...
    dir: "abilities",    // your own abilities (.js / .json)
    disabled: [],        // ability names to switch off, e.g. ["datetime"]
  },

  plugins: {
    builtin: ["stats"],  // built-ins: "stats", "logger"
    dir: "plugins",      // your own plugins (.js)
    disabled: [],        // plugin names to skip
    settings: {
      // per-plugin settings, e.g. logger: { file: "logs/chat.log" }
    },
  },

  fallbackResponse: "I am not sure how to respond to that yet. Try /help, add training data, or write an ability for it.",
};
