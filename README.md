# Mini LLM v2 — a from-scratch transformer with memory, abilities and plugins

A tiny language model written **entirely from scratch in Node.js** — every matrix
operation, every layer, every line of backpropagation — with **zero npm
dependencies**. Version 2 turns it from a single script into a small *platform*
you can mould however you like:

| Feature | What it gives you | Guide |
|---|---|---|
| **Neural network** | A real (small) transformer: embeddings, causal self-attention, layer-norm, feed-forward, Adam optimizer | [docs/math.md](docs/math.md), [TRAINING.md](TRAINING.md) |
| **In-memory memory** | Short-term conversation memory + long-term facts + your own custom stores, optional save/load to JSON | [MEMORY.md](MEMORY.md) |
| **Abilities** | Programs *you* write (JS or JSON) that handle messages before the neural net does: calculators, lookups, games, anything | [ABILITIES.md](ABILITIES.md) |
| **Plugins** | Extend the system itself: hooks, commands, memory stores, sampling strategies, filters | [PLUGINS.md](PLUGINS.md) |
| **Slash commands** | `/help`, `/facts`, `/history`, `/set temperature 0.2`, ... (plugins can add more) | [DEVELOPMENT.md](DEVELOPMENT.md#slash-commands) |
| **Configuration** | One config file plus command-line flags | [CONFIGURATION.md](CONFIGURATION.md) |
| **Tests** | 70+ tests including numerical gradient checking of the backprop math | [DEVELOPMENT.md](DEVELOPMENT.md#testing) |

> This is a **learning project**, not a commercial product. It is trained on ~50
> tiny example conversations, so its neural chat is limited — which is exactly
> why abilities and plugins matter: you decide what it can *do*.

---

## 1. Requirements and installation

- [Node.js](https://nodejs.org/) **18 or newer** (`node -v` to check)
- Nothing else. There is nothing to `npm install`.

```bash
unzip mini-llm-v2.zip
cd mini-llm-v2
node cli.js help
```

A pre-trained model is included (`models/weights.json`), so you can chat immediately.

---

## 2. Quick start

```bash
node cli.js chat
```

```
You: hi
Bot: hello ! how are you ?          <- neural network
You: 2 + 2 * 5
Bot: 2 + 2 * 5 = 12                 <- built-in "calculator" ability
You: my name is Sam
Bot: Nice to meet you, Sam! I will remember your name.   <- memory
You: hello
Bot: Hello again, Sam! Good to see you.                  <- ability that uses memory
You: what did i just say
Bot: You said: "hello"                                   <- conversation memory
You: /facts
Bot: name = Sam                                          <- slash command
```

Add `--debug` to see *who* answered each message (`model`, `ability:calculator`, ...).

Other one-liners:

```bash
node cli.js ask "what is 12 * (3 + 4)"      # one message, one reply
node cli.js abilities                        # list abilities
node cli.js plugins                          # list plugins
node cli.js test                             # run the test-suite
```

---

## 3. How a message flows through the system

```
 your message
      │
      ▼
 [hook input:received]        plugins may rewrite it, or answer directly
      │
      ├── starts with /command? ──► run command ──────────────┐
      │                                                       │
      ▼                                                       │
 remember the user turn (conversation memory)                 │
      │                                                       │
      ▼                                                       │
 abilities, highest priority first                            │
   [hooks ability:before / ability:after]                     │
      │  an ability answers? ──────────────────────────────┐  │
      │  none answered (or all declined)                   │  │
      ▼                                                    │  │
 neural network generates a reply                          │  │
   [hooks generate:before / generate:after]                │  │
      │                                                    │  │
      ▼                                                    ▼  ▼
 [hook response:final]  ──► remember the bot turn ──► reply to you
```

The reply you get back from `agent.respond()` says where it came from:
`source` is one of `ability`, `model`, `command`, `plugin`, `fallback`, `empty`.

---

## 4. Teaching it new things — three levels

### Level 1 — Abilities (no neural network knowledge needed)

Create a file in `abilities/`:

```bash
node cli.js new ability greet-me
```

```js
// abilities/greet-me.js
module.exports = {
  name: "greet-me",
  description: "Says hello with the current time",
  patterns: [/^greet me$/i],
  run: ({ now }) => `Hello! It is ${now().toLocaleTimeString()}.`,
};
```

Restart the chat and type `greet me`. Prefer no code at all? Use a JSON ability
(`abilities/ping.json` is an example):

```json
{ "name": "ping", "patterns": ["^ping$"], "response": "pong" }
```

Full tutorial: **[ABILITIES.md](ABILITIES.md)**.

### Level 2 — Plugins (change how the system behaves)

```bash
node cli.js new plugin my-plugin
```

Plugins can rewrite input/output, add commands, register memory stores, add
sampling strategies, and more. Full tutorial: **[PLUGINS.md](PLUGINS.md)**.

### Level 3 — Training data and the network itself

Add conversations to `data/` and retrain:

```bash
# data/my-data.json
# [["what is your favorite food", "i enjoy electricity !"], ...]
node cli.js train
```

Details: **[TRAINING.md](TRAINING.md)**. Network internals: **[DEVELOPMENT.md](DEVELOPMENT.md)**
and the math in **[docs/math.md](docs/math.md)**.

---

## 5. Using it from your own code

```js
const { MiniLLMAgent } = require("./src");

const agent = await MiniLLMAgent.create();           // loads config, model, abilities, plugins

agent.abilities.register({                           // add an ability at runtime
  name: "shout",
  patterns: [/^shout (.+)$/i],
  run: ({ match }) => match[1].toUpperCase() + "!",
});

const reply = await agent.respond("shout hello");
console.log(reply.text, reply.source);               // "HELLO!"  "ability"

await agent.shutdown();                              // runs plugin teardown, saves memory if enabled
```

---

## 6. Project layout

```
mini-llm-v2/
├── cli.js                    command-line entry point
├── mini-llm.config.js        YOUR settings
├── abilities/                YOUR abilities (auto-loaded, .js or .json)
├── plugins/                  YOUR plugins   (auto-loaded, .js)
├── data/                     training conversations (.js / .json)
├── models/weights.json       trained model
├── examples/                 ready-to-copy abilities and plugins (not auto-loaded)
├── src/
│   ├── core/                 the neural network, from scratch (matrix, layers, model, optimizer, tokenizer)
│   ├── memory/               conversation memory, fact memory, memory manager
│   ├── abilities/            ability definition, registry, loader, built-in abilities
│   ├── plugins/              hook bus, plugin manager, built-in plugins
│   ├── engine/               agent, config, commands, samplers, generator, trainer, dataset
│   └── util/                 logger, template renderer, deep-merge, seedable RNG
├── test/                     test-suite (node:test, no dependencies)
├── README.md  DEVELOPMENT.md  ABILITIES.md  PLUGINS.md
├── MEMORY.md  CONFIGURATION.md  TRAINING.md
└── docs/                     math.md, matrix.md, tokenizer.md (ELI5 explanations of the math)
```

---

## 7. Built-in abilities

| Ability | Try saying |
|---|---|
| `calculator` | `2 + 3 * 4`, `what is 7 times 8`, `(10 - 4) / 3` |
| `datetime` | `what time is it`, `what's the date` |
| `remember` | `my name is Sam`, `remember my favorite color is blue` |
| `recall` | `what is my name`, `what do you know about me` |
| `forget` | `forget my name`, `forget everything` |
| `conversation-recall` | `what did i just say` |
| `help` | `help` |

Shipped examples in `abilities/`: `coin-flip`, `dice`, `ping` (JSON), `greet-known-user`.
More in `examples/abilities/`: `todo-list`, `unit-converter`, `echo` (JSON).

## 8. Slash commands

`/help` `/abilities` `/ability <name> on|off` `/plugins` `/facts` `/forget <key|all>`
`/history [n]` `/memory` `/reset [all]` `/save [file]` `/load [file]`
`/set temperature|maxNewTokens|topK|sampler <value>` `/samplers` `/stats`

## 9. Command-line reference

```
node cli.js train [--epochs N --lr X --dModel N --dHidden N --layers N --data DIR --seed N]
node cli.js chat  [--temperature X --sampler NAME --maxNewTokens N --debug --persist]
node cli.js ask "message"
node cli.js abilities | plugins
node cli.js new ability <name> [--json]
node cli.js new plugin <name>
node cli.js test
```

## 10. Known limitations (honest list)

- **The network only sees your current message.** Memory is available to abilities
  and plugins, but it is not fed into the network (the model was trained on
  single-turn pairs with a ~25-token window). See [MEMORY.md](MEMORY.md#memory-and-the-neural-network).
- Word-level tokenizer: unknown words become `<UNK>`.
- ~50 training conversations: it parrots patterns it has seen; it does not "know" things.
- Abilities and plugins are plain Node.js files and run with full privileges.
  **Only load code you trust.**

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `No trained model ... Abilities still work` | run `node cli.js train` |
| My ability never triggers | run `node cli.js abilities` (is it listed? any load warnings?). Another ability with higher `priority` may match first. See [ABILITIES.md](ABILITIES.md#debugging-checklist) |
| `Could not load ability file ...` | the message names the problem; fix the file and restart |
| New training words are `<UNK>` | the vocabulary is fixed at training time: retrain after editing `data/` |
| Training loss stuck | use `--lr 0.01` or lower. See [TRAINING.md](TRAINING.md#troubleshooting-training) |

## 12. Credits and further reading

- [docs/math.md](docs/math.md) – every formula with worked examples
- [docs/matrix.md](docs/matrix.md) – the `Matrix` class, explained like you're 5
- [docs/tokenizer.md](docs/tokenizer.md) – the tokenizer, explained like you're 5
