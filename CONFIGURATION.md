# CONFIGURATION.md

Final settings are built from three layers (later wins):

1. **Defaults** — `src/engine/config.js`
2. **Your file** — `mini-llm.config.js` in the project root (or `configPath` passed to `MiniLLMAgent.create`)
3. **Overrides** — command-line flags, or `MiniLLMAgent.create({ config: {...} })`

Objects are merged key by key; arrays and scalars replace the default.

## Full reference

```js
module.exports = {
  logLevel: "warn",             // debug | info | warn | error | silent

  model: { path: "models/weights.json" },

  training: {
    dataDir: "data",            // folder of .js/.json conversation files
    epochs: 700,                // passes over the data
    lr: 0.008,                  // Adam learning rate (keep <= 0.01 on tiny data)
    dModel: 32,                 // embedding size
    dHidden: 64,                // feed-forward width
    layers: 2,                  // transformer blocks
    clipNorm: 5,                // gradient clipping threshold
  },

  generation: {
    temperature: 0.7,           // 0 = greedy, higher = more random
    maxNewTokens: 20,
    sampler: "temperature",     // temperature | greedy | topk | plugin-provided
    topK: 5,                    // used by "topk"
  },

  memory: { maxTurns: 50, persist: false, file: "memory/state.json" },

  abilities: { builtin: true, dir: "abilities", disabled: [] },

  plugins: {
    builtin: ["stats"],         // available: "stats", "logger"
    dir: "plugins",
    disabled: [],               // plugin names (or file names) to skip
    settings: {},               // { pluginName: {...} } merged over each plugin's `defaults`
  },

  fallbackResponse: "I am not sure how to respond to that yet. ...",
};
```

| Key | Meaning |
|---|---|
| `logLevel` | `warn` shows problems (broken files, ability crashes). `debug` also shows plugin debug logs |
| `model.path` | where `train` writes and `chat` reads |
| `generation.*` | can also be changed live with `/set` |
| `memory.persist` | load on start, save on shutdown |
| `abilities.builtin` | `false` removes calculator, datetime, remember, recall, forget, conversation-recall, help |
| `abilities.disabled` | ability names to switch off (works for any ability) |
| `plugins.builtin` | which built-in plugins to enable |
| `plugins.settings.X` | settings for plugin `X`; see that plugin's docs |
| `fallbackResponse` | reply when nothing can answer (no model, or the model produced nothing) |

All relative paths are resolved against the project root (`config.rootDir`).

## Command-line overrides

| Flag | Overrides |
|---|---|
| `--temperature X` | `generation.temperature` |
| `--sampler NAME` | `generation.sampler` |
| `--maxNewTokens N` | `generation.maxNewTokens` |
| `--persist` | `memory.persist = true` |
| `--debug` | `logLevel = "debug"` and shows `[source:ability]` tags |
| `train --epochs/--lr/--dModel/--dHidden/--layers/--data/--seed` | `training.*` |

## Examples

Quiet, deterministic assistant that never uses the network's randomness:

```js
module.exports = { generation: { temperature: 0, sampler: "greedy" } };
```

Persistent memory and a chat log:

```js
module.exports = {
  memory: { persist: true },
  plugins: { builtin: ["stats", "logger"], settings: { logger: { file: "logs/chat.log" } } },
};
```

Abilities-only bot (no neural network): delete `models/weights.json`; unmatched input gets `fallbackResponse`.
