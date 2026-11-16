# DEVELOPMENT.md — complete developer documentation

This document explains how the whole project works, module by module, with the public API of
each part. Companion guides: [ABILITIES.md](ABILITIES.md), [PLUGINS.md](PLUGINS.md),
[MEMORY.md](MEMORY.md), [TRAINING.md](TRAINING.md), [CONFIGURATION.md](CONFIGURATION.md).
The maths lives in [docs/math.md](docs/math.md), [docs/matrix.md](docs/matrix.md) and [docs/tokenizer.md](docs/tokenizer.md).

Contents: [1 Principles](#1-design-principles) · [2 Layers](#2-the-big-picture) · [3 Neural core](#3-the-neural-core-srccore) ·
[4 Engine](#4-the-engine-srcengine) · [5 The agent](#5-the-agent-srcengineagentjs) · [6 Hooks](#6-hook-reference) ·
[7 Abilities](#7-abilities-internals) · [8 Plugins](#8-plugins-internals) · [Slash commands](#slash-commands) ·
[9 Memory](#9-memory-internals) · [10 Samplers](#10-samplers) · [11 CLI](#11-the-cli) · [Testing](#testing) · [13 Extending](#13-extending-the-project) · [14 Conventions](#14-conventions-and-gotchas)

---

## 1. Design principles

1. **No dependencies.** Only Node built-ins (`fs`, `path`, `readline`, `child_process`, `node:test`).
2. **Everything from scratch** where it teaches something: matrices, layers, backprop, Adam, tokenizer, sampler, expression parser.
3. **User code never crashes the chat.** Broken ability/plugin files are reported and skipped; a throwing ability or hook is caught, reported on the `error` hook, and the chat continues.
4. **Everything is registered, nothing is global.** Abilities, commands, samplers, stores and hooks belong to one `MiniLLMAgent`, and plugins can be unloaded cleanly.
5. **Deterministic when asked.** `rng` and `now` are injectable; training takes a `seed`.

## 2. The big picture

```
cli.js ──► MiniLLMAgent (src/engine/agent.js)
              ├── model + tokenizer         (src/core, loaded from models/weights.json)
              ├── hooks: HookBus            (src/plugins/hooks.js)
              ├── plugins: PluginManager    (src/plugins/pluginManager.js)
              ├── abilities: AbilityRegistry(src/abilities/registry.js)
              ├── commands: CommandRegistry (src/engine/commands.js)
              ├── samplers: SamplerRegistry (src/engine/samplers.js)
              └── memory: MemoryManager     (src/memory/memoryManager.js)
```

Directory map:

| Path | Purpose |
|---|---|
| `src/core/matrix.js` | `Matrix` class (multiply, add with broadcasting, transpose, scale, map, sumRows, copyFrom, seedable `Matrix.rng`) |
| `src/core/activations.js` | relu, leakyRelu, tanh, row-wise softmax and their backward passes |
| `src/core/layers/*.js` | `Embedding`, `Dense`, `LayerNorm`, `SelfAttention`, `TransformerBlock` — each has `forward`, `backward`, `getParams` |
| `src/core/model.js` | `MiniLLM`: embeddings → N blocks → final norm → output projection; `toJSON`/`loadJSON` |
| `src/core/loss.js` | combined softmax + cross-entropy and its gradient |
| `src/core/optimizer.js` | `Adam` + `clipGradients` |
| `src/core/tokenizer.js` | word-level `Tokenizer`, `splitIntoWords`, special tokens |
| `src/engine/trainer.js` | `trainModel`, `saveModel`, `loadModel`, `buildSequences` |
| `src/engine/dataset.js` | `loadConversations(dir)` |
| `src/engine/generator.js` | `generateText(...)` autoregressive loop |
| `src/engine/samplers.js` | `SamplerRegistry`, `temperature`, `greedy`, `topk` |
| `src/engine/config.js` | `DEFAULTS`, `loadConfig` |
| `src/engine/commands.js` | `CommandRegistry` and the built-in slash commands |
| `src/engine/agent.js` | `MiniLLMAgent` |
| `src/abilities/*` | `defineAbility`, `AbilityRegistry`, `loadAbilitiesFromDir`, built-in abilities, `mathParser` |
| `src/plugins/*` | `HookBus`, `PluginManager`, built-in plugins (`stats`, `logger`) |
| `src/memory/*` | `ConversationMemory`, `FactMemory`, `MemoryManager` |
| `src/util/*` | `logger`, `template`, `deepMerge`, `random` |
| `src/index.js` | public exports |

## 3. The neural core (`src/core`)

### 3.1 Architecture

```
token ids ─► token embedding + position embedding
          ─► TransformerBlock × layers:   X → LN → SelfAttention → +X → LN → Dense→LeakyReLU→Dense → +
          ─► final LayerNorm ─► output Dense (dModel → vocabSize) ─► logits (one row per position)
```

It is a **pre-norm** decoder-only transformer (GPT-2 layout) with **single-head causal** attention.
Why pre-norm and leaky-ReLU, and the two bugs found while building this, are told in the
"debugging story" below.

### 3.2 Every layer follows the same contract

```js
const out = layer.forward(X);          // caches what backward needs
const dX  = layer.backward(dOut);      // fills the layer's gradient matrices IN PLACE, returns dLoss/dX
layer.getParams();                     // [{ matrix, grad }, ...]  (references!)
```

| Layer | Forward | Backward (what it computes) |
|---|---|---|
| `Embedding(vocab, d)` | row lookup `weights[id]` | scatter-adds `dOut` rows into `grad[id]` |
| `Dense(in, out)` | `X·W + b` | `dW = Xᵀ·dOut`, `db = Σrows dOut`, `dX = dOut·Wᵀ` |
| `LayerNorm(d)` | `γ·(x−μ)/√(σ²+ε)+β` per row | the standard 3-term formula (see math.md §7) |
| `SelfAttention(d)` | `softmax(mask(QKᵀ/√d))V·Wo` | chain rule through the matmuls and the softmax Jacobian |
| `TransformerBlock` | pre-norm attention + FFN with residuals | reverses both residual branches (gradient copies to both) |

### 3.3 The model

```js
const MiniLLM = require("./src/core/model");
const model = new MiniLLM({ vocabSize, dModel: 32, dHidden: 64, maxLen: 25, numLayers: 2 });
const logits = model.forward([1, 5, 6, 2]);   // Matrix: 4 × vocabSize
model.zeroGrad(); model.backward(dLogits);
model.getParams();                             // every learnable matrix + its gradient
model.toJSON(); model.loadJSON(saved);
```

`maxLen` is the position-embedding table size: sequences longer than it cannot be processed.
`generateText` therefore truncates long user input and stops generating at `maxLen`.

### 3.4 Loss and optimizer

`softmaxCrossEntropy(logits, targets)` returns `{ loss, dLogits, probs }` with
`dLogits = (softmax − oneHot)/seqLen`. `Adam` keeps first/second moment estimates per parameter;
`step({ clip, maxNorm })` clips the global gradient norm first.

### 3.5 The two bugs worth remembering

1. **Post-norm stalls.** With LayerNorm applied *after* each residual add, every path through the network is
   normalized, which caps the output scale and training plateaued. Pre-norm keeps a clean residual path.
2. **Gradient-reference bug.** `Adam` stores references to each parameter's gradient `Matrix`. Early `backward()`
   code *reassigned* `this.dW = new Matrix`, silently detaching the optimizer from the real gradients (only
   embeddings, which mutate in place, kept learning). Fix: `Matrix.copyFrom()` — **always update gradient matrices
   in place; never reassign them.** Numerical gradient checking passed throughout, so gradient correctness and
   optimizer wiring must be tested separately (`test/core.test.js` trains a tiny model end-to-end for this reason).

### 3.6 Reproducibility

`Matrix.random` draws from `Matrix.rng` (default `Math.random`). `trainModel({ seed })` swaps in a
seeded generator (`src/util/random.js`, mulberry32) for weight initialization **and** data shuffling,
then restores the previous source.

## 4. The engine (`src/engine`)

### 4.1 `config.js`

`loadConfig({ rootDir, configPath, config })` → merged config with `rootDir` and `resolve(p)`.
See [CONFIGURATION.md](CONFIGURATION.md). Defaults live in `DEFAULTS`.

### 4.2 `dataset.js`

`loadConversations(dir)` → `{ pairs, files }`. Validates every item and names the offending file/index.

### 4.3 `trainer.js`

| Function | Purpose |
|---|---|
| `buildSequences(pairs, tokenizer)` | `[BOS, user…, SEP, bot…, EOS]` id arrays |
| `trainModel({ pairs, hyper, onEpoch, seed })` | builds vocab, trains, returns `{ model, tokenizer, history }` |
| `saveModel(file, model, tokenizer, meta)` | writes JSON `{ model, tokenizer, meta }` |
| `loadModel(file)` | returns `{ model, tokenizer, meta }` |

### 4.4 `generator.js`

`generateText({ model, tokenizer, text, sampler, temperature, maxNewTokens, topK, rng })`
→ `{ text, tokens }`. Loop: build `[BOS, ...userIds, SEP]`, run the model, softmax the **last row**,
call `sampler(probs, { temperature, topK, rng, step, generated })`, stop at `<EOS>` or `maxLen`/`maxNewTokens`.

### 4.5 Slash commands

`CommandRegistry`: `register(name, spec | fn, { plugin })`, `unregister(name)`, `has(name)`, `list()`, `run(name, args, ctx)`.
A spec is `{ description, run(args, ctx) }`; `args` is the raw text after the command name; return a string.
Commands bypass memory and the network. Unknown `/words` are treated as normal messages.

Built-ins: `help abilities ability plugins facts forget history memory reset save load set samplers` (+ `stats` from the stats plugin).

## 5. The agent (`src/engine/agent.js`)

```js
const agent = await MiniLLMAgent.create({
  rootDir,            // project root (default: this project)
  configPath,         // alternative config file
  config: { ... },    // overrides merged last
  loadModel: true,    // false = abilities-only (used by tests)
  model, tokenizer,   // supply a model yourself
  logger,             // custom logger (src/util/logger createLogger)
});
```

Start-up order (`_init`): built-in abilities → built-in commands → memory load (if `persist`) →
built-in plugins → plugins folder → abilities folder → apply `abilities.disabled` → hook `agent:ready`.

Properties: `config`, `logger`, `model`, `tokenizer`, `hooks`, `abilities`, `commands`, `samplers`, `memory`, `plugins`,
`now` (function returning a `Date`; replace for tests), `rng` (replace for tests).

### `await agent.respond(text)` → result

```js
{ text, source, ability, meta, elapsedMs, command? }
// source: "ability" | "model" | "command" | "plugin" | "fallback" | "empty"
```

Exact algorithm:

1. Build payload `{ text: trimmed, original, response, source, meta }`; run hook **`input:received`**.
2. If a plugin set `payload.response` → that is the answer (`source` = `payload.source || "plugin"`). Skip to 7.
3. Empty text → `source: "empty"`.
4. Text starting with `/name` where `name` is a registered command → run it (errors become "Command failed: …"). Skip memory.
5. Otherwise remember the user turn (hook **`memory:added`**), then **route**:
   for each matching enabled ability (priority desc, registration order): hook **`ability:before`** (may set `skip`),
   `await ability.run(ctx)`; a `null`/`undefined`/`false` result means *decline* (try next); a throw is
   caught → hook **`error`** → try next; success → hook **`ability:after`** (may edit `response`/`meta`).
6. If no ability answered → **generate**: hook **`generate:before`** (may edit parameters or set `response`),
   no model → fallback; else sample with the chosen sampler; hook **`generate:after`**; empty text → fallback.
7. Hook **`response:final`** (last chance to edit `text`, `source`, `meta`); remember the bot turn (not for commands/empty).

`agent.shutdown()` runs hook `agent:shutdown`, unregisters all plugins (calling `teardown`), and saves memory if `persist`.

### Ability context (`ctx` passed to `run` and `match`)

| Field | Meaning |
|---|---|
| `input` | the (hook-processed, trimmed) user text |
| `match` | **run only**: what the trigger produced (regex match array, or your `match()` return value) |
| `ability` | **run only**: the ability object |
| `facts` | `agent.memory.facts` |
| `conversation` | `agent.memory.conversation` |
| `memory` | the whole `MemoryManager` (custom stores via `memory.getStore`) |
| `agent` | the agent (registry access, config, hooks…) |
| `config` | final config |
| `log` | logger (`log.debug/info/warn/error`) |
| `now()` | current `Date` (injectable) |
| `rng()` | random float in [0,1) (injectable) |

(`match(input, ctx)` receives the same context without `match`/`ability`.)

## 6. Hook reference

Handlers get one **mutable payload**. Priority: higher number first (default 0). A throwing handler is isolated.

| Hook | Payload (mutable fields in **bold**) | Typical use |
|---|---|---|
| `agent:ready` | `{ agent }` | one-time start-up work |
| `input:received` | `{ **text**, original, **response**, **source**, **meta** }` | clean/translate input, block messages, answer directly |
| `ability:before` | `{ ability, **match**, input, **skip** }` | veto an ability, alter its match |
| `ability:after` | `{ ability, input, **response**, **meta** }` | post-process ability replies |
| `generate:before` | `{ **text**, **temperature**, **maxNewTokens**, **sampler**, **topK**, **response** }` | change the prompt or sampling; bypass the model |
| `generate:after` | `{ input, **text**, tokens }` | filter generated text |
| `response:final` | `{ **text**, **source**, **ability**, input, **meta** }` | final formatting, logging, stats |
| `memory:added` | `{ turn }` | react to new turns |
| `error` | `{ error, stage, hook?, plugin?, ability? }` | central error reporting |
| `agent:shutdown` | `{ agent }` | flush resources |
| *custom* | whatever you pass | `api.defineHook("ns:event")`, then `agent.hooks.run("ns:event", payload)` |

`HookBus`: `on(name, fn, { priority, plugin })` → returns an `off()` function; `off(name, fn)`; `run(name, payload)` (async, returns payload);
`define(name)`; `removePlugin(name)`; `count(name)`; `names()`. Unknown hook names throw and list the valid ones.

## 7. Abilities internals

- `defineAbility(def)` (`src/abilities/ability.js`) validates and normalizes. Compiles `patterns` (RegExp, `"^regex$"` strings → case-insensitive,
  `"/regex/flags"` strings), strips `g`/`y` flags (stateful flags would make matches flaky), builds whole-word `keywords` regexes,
  and synthesizes `run` for declarative definitions. Returns an object with `test(input, ctx)` → match or `null`.
  Trigger order inside one ability: `patterns`, then `keywords`, then `match()`.
- `AbilityRegistry`: `register(def, { source, replace })`, `unregister`, `get`, `has`, `enable`, `disable`, `list({ includeDisabled })`,
  `candidates(input, ctx)`. A trigger that throws is logged and skipped.
- `loadAbilitiesFromDir(dir, registry, logger)` → `{ loaded, errors }`.
- Built-ins live in `src/abilities/builtin/index.js` (priority 10). The calculator uses `mathParser.js`, a recursive-descent parser
  (no `eval`): `expr → term → unary → power → atom` with correct precedence and right-associative `^`.
- Priority: user abilities default to `0`, built-ins use `10`. Give yours `> 10` to override a built-in.

## 8. Plugins internals

`PluginManager.register(plugin, { source })` validates, merges `defaults` with `config.plugins.settings[name]`, builds the plugin's private
`api`, awaits `setup(api)`. Every registration made through `api` is recorded, so `unregister(name)` (and a failed `setup`) removes
hooks, abilities, commands, stores and samplers, and calls `teardown(api)`. See [PLUGINS.md](PLUGINS.md) for the full `api`.
`loadDir(dir, disabled)` accepts `module.exports = { name, setup }` **or** `module.exports = (api) => {...}` (name = file name).
Built-in plugins: `stats` (adds `/stats`), `logger` (JSON lines to console or `settings.logger.file`).

## 9. Memory internals

See [MEMORY.md](MEMORY.md). `MemoryManager` also keeps a `pending` map so store data loaded before a store registers is
never lost.

## 10. Samplers

`sampler(probs, { temperature, topK, rng, step, generated }) → tokenId`.
- `temperature`: `p^(1/T)` renormalized then drawn; `T ≤ 0.0001` = greedy.
- `greedy`: argmax. `topk`: keep the K most likely, then temperature-draw among them.
Register more via plugins (`api.registerSampler`) — [PLUGINS.md](PLUGINS.md#step-8--register-a-sampler).

## 11. The CLI

`cli.js` parses `--flag value` / `--flag` and positional arguments by hand. `chat` reads stdin with `readline`'s async iterator so
messages are processed strictly one at a time (important because `respond` is async); piped input works too.
`new ability|plugin <name>` writes templates and refuses to overwrite.

## Testing

```bash
npm test                 # or: node cli.js test   (runs test/*.test.js with node:test)
npm run gradcheck        # only the numerical gradient check
node --test test/abilities.test.js
```

| File | Covers |
|---|---|
| `gradcheck.test.js` | analytic vs numeric gradients for every parameter matrix |
| `core.test.js` | Matrix, tokenizer, training reproducibility, "the model really learns" |
| `memory.test.js` | sliding window, facts, persistence, late store registration |
| `abilities.test.js` | validation, triggers, priority, decline, JSON abilities, loader errors, math parser, built-ins, shipped & example abilities |
| `plugins.test.js` | hook ordering/isolation, short-circuit, rollback, teardown, loaders, built-in & example plugins |
| `examples.test.js` | every example file the tutorials use (reverse-text, guess-number, joke-teller, rate-limit, abbreviations, auto-save) |
| `agent.test.js` | config, pipeline, commands, samplers, error handling, persistence, the shipped model |

Test helpers (`test/helpers.js`): `makeAgent(configOverrides, options)` builds a silent, model-less agent in a temp folder; set
`agent.now`/`agent.rng` for deterministic time/randomness. Tiny models in tests use a fixed `seed` and `lr ≤ 0.01`.

## 13. Extending the project

| Goal | Where |
|---|---|
| New skill for the bot | [ABILITIES.md](ABILITIES.md) |
| Change behaviour of the pipeline | [PLUGINS.md](PLUGINS.md) |
| New slash command | `api.registerCommand` in a plugin (or `commands.js` for a core command) |
| New sampling strategy | `api.registerSampler` |
| New layer / activation | add to `src/core`, follow the forward/backward/getParams contract, add it to `TransformerBlock`/`MiniLLM`, run `npm run gradcheck` |
| Multi-head attention | duplicate Q/K/V per head, concatenate before `Wo`; gradient-check it |
| Different tokenizer | implement `encode/decode/id/buildVocab/toJSON/loadJSON/vocabSize` and use it in `trainer.js` |
| Streaming output | call the sampler loop yourself (see `generator.js`) and print each token |

## 14. Conventions and gotchas

- Names (abilities, plugins, stores, commands): letters, digits, `-`, `_`.
- Never reassign a gradient `Matrix`; use `copyFrom`.
- Abilities that need randomness or time should use `ctx.rng()` / `ctx.now()` so they can be tested.
- Return `null` from `run` to decline; return a string to answer. Anything else (e.g. a number) is an error.
- Regexes with the `g` flag are safe (flags are stripped), but still prefer none.
- Template placeholders (`{{fact.name}}`) only accept `[\w.-]` keys; facts with spaces need a JS ability.
- Plugins and abilities execute arbitrary code: treat the `abilities/` and `plugins/` folders like source code.
