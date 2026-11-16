# PLUGINS.md — create custom plugins (step by step)

A **plugin** changes how the *system* behaves. Where an [ability](ABILITIES.md) answers one kind of message,
a plugin can:

- **listen to hooks** at every stage (rewrite input, block messages, post-process replies, tweak sampling);
- **register** abilities, slash commands, memory stores and sampling strategies;
- keep its own **state** and **settings**;
- be **unloaded cleanly** (everything it registered disappears).

Contents: [Step 1 first plugin](#step-1--your-first-plugin) · [2 anatomy & api](#step-2--anatomy-and-the-api-object) ·
[3 hooks](#step-3--hooks-rewrite-input-and-output) · [4 settings](#step-4--settings) · [5 abilities](#step-5--register-an-ability) ·
[6 commands](#step-6--register-a-slash-command) · [7 stores](#step-7--memory-stores-and-custom-hooks) · [8 sampler](#step-8--register-a-sampler) ·
[9 short-circuit](#step-9--short-circuit-block-or-answer-early) · [10 state](#step-10--state-lifecycle-and-teardown) ·
[11 order](#step-11--ordering-with-priority) · [12 errors](#step-12--errors-are-isolated) · [13 other ways](#step-13--other-ways-to-load-a-plugin) ·
[14 testing](#step-14--test-your-plugin) · [Reference](#reference) · [Recipes](#recipes) · [Debugging](#debugging-checklist) · [Best practices](#best-practices)

---

## Step 1 — Your first plugin

```bash
node cli.js new plugin greeter
```

This writes `plugins/greeter.js`. Replace it with:

```js
// plugins/greeter.js
module.exports = {
  name: "greeter",
  version: "1.0.0",
  description: "Adds a friendly sign-off to ability replies",
  defaults: { signoff: "Have a nice day!" },

  setup(api) {
    api.on("response:final", (payload) => {
      if (payload.source === "ability") payload.text += " " + api.config.signoff;
    });
  },
};
```

Run `node cli.js plugins` — `greeter` is listed with source `file:greeter.js`. Then:

```
$ node cli.js chat
You: 2 + 2
Bot: 2 + 2 = 4 Have a nice day!
```

**What happened?** At start-up the agent `require`s every `.js` file in `plugins/`, validates the object, and calls
`setup(api)` once. You subscribed to the `response:final` hook; it runs after every reply and receives a **mutable payload**
(`{ text, source, ability, input, meta }`). Changing `payload.text` changes what the user sees.

---

## Step 2 — Anatomy and the `api` object

```js
module.exports = {
  name: "my-plugin",           // REQUIRED. Unique. Letters, digits, - and _
  version: "1.0.0",            // optional, shown in /plugins
  description: "…",            // optional, shown in /plugins
  defaults: { },               // optional default settings (Step 4)
  setup(api) { },              // optional; may be async. Called once at load
  teardown(api) { },           // optional; may be async. Called on unload/shutdown
};
```

`setup` receives a private **`api`** — the only thing a plugin normally needs:

| Member | Purpose |
|---|---|
| `api.name`, `api.version` | the plugin's identity |
| `api.config` | settings = `defaults` merged with `config.plugins.settings[name]` |
| `api.state` | an empty object for your own data (per plugin, lives until unload) |
| `api.log` | logger: `debug`, `info`, `warn`, `error` (prefixed `[plugin:name]`) |
| `api.agent` | the whole agent (memory, abilities, config, hooks, …) for advanced use |
| `api.on(hook, handler, { priority })` | subscribe to a hook; returns an `off()` function |
| `api.defineHook("ns:event")` | declare a custom hook other plugins can use |
| `api.registerAbility(def)` | add an [ability](ABILITIES.md) |
| `api.registerCommand(name, fn \| { description, run })` | add a `/name` command |
| `api.registerStore(name, store)` | add a memory store (returns it) |
| `api.registerSampler(name, fn)` | add a sampling strategy |

Everything registered through `api` is tracked and **removed automatically** when the plugin unloads (or if `setup` throws).

---

## Step 3 — Hooks: rewrite input and output

A handler gets **one mutable payload** and edits it in place. Async handlers are awaited. See the
[hook table](#hooks) below. Example — expand text-speak before anything else sees it
(`examples/plugins/abbreviations.js`):

```js
module.exports = {
  name: "abbreviations",
  version: "1.0.0",
  description: "Expands pls/thx/u/r/btw in user input",
  defaults: { map: { pls: "please", thx: "thanks", u: "you", r: "are", btw: "by the way" } },
  setup(api) {
    const words = Object.keys(api.config.map);
    const re = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
    api.on("input:received", (p) => {
      p.text = p.text.replace(re, (w) => api.config.map[w.toLowerCase()]);
    }, { priority: 90 });
  },
};
```

Copy it to `plugins/`, restart, and `say pls thx u` reaches abilities as `say please thanks you`.

Other things hooks can do:

```js
// change the neural network's sampling for every reply
api.on("generate:before", (g) => { g.temperature = 0.3; g.maxNewTokens = 12; });

// post-process generated text only (not ability replies)
api.on("generate:after", (g) => { g.text = g.text.replace(/\bi am\b/g, "I am"); });

// veto one ability
api.on("ability:before", (p) => { if (p.ability.name === "datetime") p.skip = true; });

// decorate ability replies
api.on("ability:after", (p) => { p.response += " ✔"; });

// log every new memory turn
api.on("memory:added", ({ turn }) => api.log.info(turn.role, turn.text));
```

---

## Step 4 — Settings

`defaults` in the plugin are merged (deeply) with `plugins.settings.<name>` from `mini-llm.config.js`:

```js
// mini-llm.config.js
plugins: {
  settings: {
    greeter: { signoff: "See you soon!" },
  },
},
```

Inside the plugin, `api.config.signoff` is now `"See you soon!"`; any key you do not set keeps its default.
Read settings **inside** `setup`/handlers via `api.config` (not at `require` time).

---

## Step 5 — Register an ability

Plugins can bundle abilities. They get source `plugin:<name>` and are removed on unload:

```js
module.exports = {
  name: "bundle",
  setup(api) {
    api.registerAbility({
      name: "bundle-hello",
      description: "Replies to 'bundle'",
      patterns: [/^bundle$/],
      response: "bundled!",           // or run: (ctx) => ...
    });
  },
};
```

Use this when an ability needs shared state or settings from the plugin (`api.config`, `api.state`).

---

## Step 6 — Register a slash command

Commands run when the message starts with `/name`. They bypass memory, abilities and the network, and return a string.
`examples/plugins/shout.js`:

```js
module.exports = {
  name: "shout",
  version: "1.0.0",
  description: "Adds /shout and /loud on|off",
  setup(api) {
    api.state.loud = false;
    api.registerCommand("shout", { description: "/shout <text> prints it in capitals", run: (args) => args.toUpperCase() + "!" });
    api.registerCommand("loud", {
      description: "/loud on|off makes every reply UPPERCASE",
      run: (args) => { api.state.loud = args.trim() === "on"; return `loud mode ${api.state.loud ? "on" : "off"}`; },
    });
    api.on("response:final", (p) => { if (api.state.loud && p.source !== "command") p.text = p.text.toUpperCase(); }, { priority: 10 });
  },
};
```

```
You: /shout hello
Bot: HELLO!
You: /loud on
You: hi
Bot: HELLO! HOW ARE YOU?
```

`run(args, ctx)` gets the raw text after the command name (`args`) and `{ agent }`. A shorthand is allowed:
`api.registerCommand("ping", () => "pong")`. Command names: letters/digits/`-`/`_`; duplicates (e.g. `/help`) throw. `/help` lists yours automatically.

---

## Step 7 — Memory stores and custom hooks

A full plugin: it registers a **store**, an **ability** that writes to it, a **command** that reads it, and defines + fires a
**custom hook** others can subscribe to — `examples/plugins/notes-plugin.js`:

```js
class NotesStore {
  constructor() { this.notes = []; }
  add(text) { this.notes.push({ text, at: Date.now() }); return this.notes.length; }
  toJSON() { return { notes: this.notes }; }      // saved by /save and memory.persist
  loadJSON(o) { this.notes = o.notes || []; }
  clear() { this.notes = []; }                    // called by /reset all
}

module.exports = {
  name: "notes",
  version: "1.0.0",
  description: "Take notes: 'note: buy milk', then /notes",
  setup(api) {
    const store = api.registerStore("notes", new NotesStore());
    api.defineHook("notes:saved");                // custom hooks must look like "namespace:event"

    api.registerAbility({
      name: "take-note",
      description: "Saves a note: 'note: <text>'",
      priority: 15,
      patterns: [/^note:\s*(.+)$/i],
      run: async ({ match, agent }) => {
        const n = store.add(match[1]);
        await agent.hooks.run("notes:saved", { text: match[1], count: n });   // fire it
        return `Saved note #${n}.`;
      },
    });

    api.registerCommand("notes", {
      description: "List saved notes",
      run: () => (store.notes.length ? store.notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n") : "No notes yet."),
    });
  },
};
```

Another plugin can now react: `api.on("notes:saved", ({ text }) => api.log.info("saved", text))`.
Since stores register during `setup` (before memory loads), their saved data is restored automatically when `memory.persist` is on.
More on stores: [MEMORY.md](MEMORY.md#3-custom-stores).

---

## Step 8 — Register a sampler

A **sampler** picks the next word from the model's probabilities. Signature:
`(probs, { temperature, topK, rng, step, generated }) => tokenId`, where `probs[i]` is the probability of token `i`.
`examples/plugins/custom-sampler.js` adds nucleus (top-p) sampling:

```js
module.exports = {
  name: "top-p-sampler",
  version: "1.0.0",
  description: "Adds nucleus (top-p) sampling",
  defaults: { p: 0.9 },
  setup(api) {
    api.registerSampler("top-p", (probs, { rng = Math.random, temperature = 1 }) => {
      const ranked = probs.map((prob, id) => [prob, id]).sort((a, b) => b[0] - a[0]);
      const nucleus = [];
      let cum = 0;
      for (const item of ranked) { nucleus.push(item); cum += item[0]; if (cum >= api.config.p) break; }
      const weights = nucleus.map(([prob]) => Math.pow(Math.max(prob, 1e-12), 1 / Math.max(temperature, 0.01)));
      let r = rng() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < nucleus.length; i++) { r -= weights[i]; if (r <= 0) return nucleus[i][1]; }
      return nucleus[nucleus.length - 1][1];
    });
  },
};
```

Use it: `/set sampler top-p` in the chat, `--sampler top-p` on the command line, or `generation.sampler: "top-p"` in the config.
`/samplers` lists everything available. Return the **token id** (an integer index into `probs`). If the configured sampler does not
exist the agent warns and falls back to `"temperature"`.

---

## Step 9 — Short-circuit, block, or answer early

On `input:received` (and `generate:before`), set `payload.response` and the agent **stops processing** and replies with it
(`source` = `payload.source || "plugin"`); abilities and the network never run and the message is not remembered.
`examples/plugins/rate-limit.js`:

```js
module.exports = {
  name: "rate-limit",
  version: "1.0.0",
  description: "Blocks floods of messages",
  defaults: { maxPerMinute: 5, message: "Slow down a little!" },
  setup(api) {
    api.state.times = [];
    api.on("input:received", (p) => {
      if (p.text.startsWith("/")) return;                 // never block commands
      const now = Date.now();
      api.state.times = api.state.times.filter((t) => now - t < 60000);
      if (api.state.times.length >= api.config.maxPerMinute) {
        p.response = api.config.message;
        p.source = "plugin";
      } else api.state.times.push(now);
    }, { priority: 100 });                                 // run before other plugins
  },
};
```

`generate:before` + `response` is handy to **bypass the network** for some inputs:
`api.on("generate:before", (g) => { if (g.text.includes("price")) g.response = "I cannot talk about prices."; })`.

---

## Step 10 — State, lifecycle and teardown

- `api.state` is yours: counters, caches, timers.
- `setup(api)` runs once (await-ed if async). `teardown(api)` runs when the plugin is unregistered or on `agent.shutdown()`:
  close files, clear timers.
- Start-up event: `api.on("agent:ready", ({ agent }) => ...)` (fires after *everything* is loaded; your plugin sees it because it subscribed during setup).

```js
module.exports = {
  name: "heartbeat",
  setup(api) {
    api.state.timer = setInterval(() => api.log.debug("alive"), 60000);
    api.state.timer.unref();                    // do not keep Node alive just for this
  },
  teardown(api) { clearInterval(api.state.timer); },
};
```

---

## Step 11 — Ordering with priority

For each hook, handlers run **highest `priority` first** (default 0); equal priorities run in registration order
(built-in plugins, then `plugins/` files alphabetically). Convention used by the shipped plugins:

| Priority | Use |
|---|---|
| 100 | gatekeepers (rate limit, auth) that must run first |
| 50–90 | input cleaning (profanity, abbreviations) |
| 0 | ordinary logic |
| −50…−100 | observers that must see the *final* text (timer, logger, stats) |
| −200 | last step (auto-save) |

Example: the `profanity-filter` runs at 50 on `response:final`, so `stats`/`logger` (−100) record the already-filtered text.

---

## Step 12 — Errors are isolated

If a handler throws: the error is logged, the `error` hook runs (`{ error, hook, plugin, stage: "hook" }`), the handler is skipped and the
chat continues. If `setup()` throws, the plugin is rolled back (nothing it registered stays) and you get
`Plugin "x" setup failed: ...` in the log. A central error reporter:

```js
module.exports = {
  name: "error-reporter",
  setup(api) {
    api.on("error", ({ error, stage, plugin, ability }) => {
      console.error(`[${stage}] ${plugin || ability || "core"}: ${error.message}`);
    });
  },
};
```

(An error inside an `error` handler is only logged — it never recurses.)

---

## Step 13 — Other ways to load a plugin

**A function instead of an object** — the file name becomes the plugin name:

```js
// plugins/hello.js
module.exports = (api) => {
  api.registerCommand("hello", () => "Hello from a function plugin!");
};
```

**From code**, at any time:

```js
const agent = await MiniLLMAgent.create();
await agent.plugins.register({ name: "inline", setup(api) { api.registerCommand("inline", () => "hi"); } });
agent.plugins.list();                  // [{ name, version, description, source, ... }]
await agent.plugins.unregister("inline");   // removes hooks, abilities, commands, stores, samplers; runs teardown
```

**Disable a plugin** without deleting it: `plugins: { disabled: ["timer"] }` (plugin name or file name).
**Built-in plugins** are enabled by name: `plugins: { builtin: ["stats", "logger"] }`.
**Another folder:** `plugins: { dir: "my-plugins" }`.

---

## Step 14 — Test your plugin

```js
// test/greeter.test.js
const test = require("node:test");
const assert = require("node:assert");
const { makeAgent } = require("./helpers");

test("greeter appends the sign-off to ability replies", async () => {
  const agent = await makeAgent({ plugins: { builtin: [], settings: { greeter: { signoff: "Bye!" } } } });
  await agent.plugins.register(require("../plugins/greeter.js"));
  const reply = await agent.respond("2 + 2");
  assert.strictEqual(reply.text, "2 + 2 = 4 Bye!");
});

test("rate-limit blocks the 3rd message", async () => {
  const agent = await makeAgent({ plugins: { builtin: [], settings: { "rate-limit": { maxPerMinute: 2 } } } });
  await agent.plugins.register(require("../examples/plugins/rate-limit.js"));
  await agent.respond("1 + 1"); await agent.respond("2 + 2");
  const blocked = await agent.respond("3 + 3");
  assert.deepStrictEqual([blocked.text, blocked.source], ["Slow down a little!", "plugin"]);
});

test("everything a plugin registered disappears on unregister", async () => {
  const agent = await makeAgent();
  await agent.plugins.register(require("../examples/plugins/shout.js"));
  assert.ok(agent.commands.has("shout"));
  await agent.plugins.unregister("shout");
  assert.strictEqual(agent.commands.has("shout"), false);
});
```

Run with `node --test test/greeter.test.js` (or `npm test`). Tips: pass `plugins: { builtin: [] }` for a quiet agent; set
`agent.now` / `agent.rng` for determinism; use `agent.hooks.run("name", payload)` to trigger a hook directly.

---

## Reference

### Hooks

Payload fields in **bold** are meant to be changed. Higher `priority` first.

| Hook | When | Payload |
|---|---|---|
| `agent:ready` | after start-up | `{ agent }` |
| `input:received` | a message arrives | `{ **text**, original, **response**, **source**, **meta** }` — set `response` to answer immediately |
| `ability:before` | an ability is about to run | `{ ability, **match**, input, **skip** }` |
| `ability:after` | an ability answered | `{ ability, input, **response**, **meta** }` |
| `generate:before` | before the network runs | `{ **text**, **temperature**, **maxNewTokens**, **sampler**, **topK**, **response** }` |
| `generate:after` | network produced text | `{ input, **text**, tokens }` |
| `response:final` | just before replying | `{ **text**, **source**, **ability**, input, **meta** }` |
| `memory:added` | a turn was stored | `{ turn }` |
| `error` | a hook/ability/command failed | `{ error, stage, hook?, plugin?, ability? }` |
| `agent:shutdown` | `agent.shutdown()` | `{ agent }` |
| `namespace:event` | custom | whatever you fire with `agent.hooks.run(name, payload)` |

`payload.meta` objects from `input:received`, abilities and `response:final` are merged into `result.meta`.
Unknown hook names throw an error that lists the valid ones.

### `api.on` options

`{ priority: number }` — default `0`. Returns an `off()` function to unsubscribe early.

### Built-in plugins

| Plugin | Enable | Adds |
|---|---|---|
| `stats` (on by default) | `plugins.builtin: ["stats"]` | `/stats` — counts replies per source and ability |
| `logger` | `plugins.builtin: ["stats", "logger"]` | JSON-lines log of input, responses and errors. Setting: `plugins.settings.logger.file = "logs/chat.log"` (omit to print to stderr) |

Shipped user plugin: `plugins/timer.js` (reply timing at debug level; run `node cli.js chat --debug`).
Examples (copy into `plugins/`): `abbreviations`, `auto-save`, `custom-sampler`, `notes-plugin`, `profanity-filter`, `rate-limit`, `shout`.

---

## Recipes

**Auto-save memory after every reply** (`examples/plugins/auto-save.js`)
```js
module.exports = {
  name: "auto-save",
  defaults: { file: "memory/state.json" },
  setup(api) {
    const file = api.agent.config.resolve(api.config.file);
    api.on("response:final", () => api.agent.memory.save(file), { priority: -200 });
    api.on("agent:ready", () => api.agent.memory.load(file));
  },
};
```

**Personalize model replies using memory**
```js
module.exports = {
  name: "personalize",
  setup(api) {
    api.on("response:final", (p) => {
      const name = api.agent.memory.facts.get("name");
      if (name && p.source === "model") p.text += ` (${name})`;
    });
  },
};
```

**Count topics (analytics)**
```js
module.exports = {
  name: "topics",
  setup(api) {
    api.state.counts = {};
    api.on("input:received", (p) => {
      for (const w of p.text.toLowerCase().split(/\W+/).filter((w) => w.length > 4)) api.state.counts[w] = (api.state.counts[w] || 0) + 1;
    }, { priority: -10 });
    api.registerCommand("topics", () => Object.entries(api.state.counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => `${w}: ${n}`).join("\n") || "No data yet.");
  },
};
```

**Replace the network for a topic** (route to your own code)
```js
api.on("generate:before", (g) => {
  if (/\bhoroscope\b/i.test(g.text)) g.response = "The stars say: write more tests.";
});
```

**Make the network sound calmer** (`generate:before`)
```js
api.on("generate:before", (g) => { g.temperature = Math.min(g.temperature, 0.4); });
```

---

## Debugging checklist

1. `node cli.js plugins` — is it listed? If not, look for `Could not load plugin file "x": ...` (syntax error, missing/invalid `name`, setup threw).
2. `Unknown hook "x". Valid hooks: ...` — hook names are exact: `response:final`, not `response.final`.
3. Handler does nothing? Handlers must **mutate the payload** (`p.text = ...`); returning a value does nothing.
4. Wrong order? Print with `api.log.debug` (run chat with `--debug`) and adjust `priority`.
5. `Plugin "x" is already registered` — two files export the same `name`.
6. `Ability/Command/Store "x" already exists` — a name clash with a built-in or another plugin.
7. Plugin works alone but not with others? An earlier plugin may be short-circuiting `input:received` — check priorities.
8. Reload: plugins load at start-up; restart after editing.

## Best practices

- Keep `setup` fast and side-effect free apart from registering things; do I/O lazily.
- Put tunables in `defaults` so users can change them in `mini-llm.config.js` without editing your file.
- Always use `api.registerX` (not direct registry calls) so unloading cleans up.
- Observers (logging/stats) use negative priority; gatekeepers use high positive priority.
- Never block the event loop in a handler; `await` async work.
- Plugins are trusted code with full access (`api.agent`): only load files you wrote or reviewed.
