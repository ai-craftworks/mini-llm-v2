# MEMORY.md — the in-memory system

Everything lives in RAM and is owned by `agent.memory` (a `MemoryManager`).
Nothing touches disk unless you turn persistence on.

```
agent.memory
├── conversation   ConversationMemory  short-term transcript (sliding window)
├── facts          FactMemory          long-term key/value facts
└── stores         Map of custom stores registered by plugins/abilities
```

## 1. Conversation memory (short-term)

A list of **turns**: `{ id, role: "user" | "bot", text, timestamp, meta }`.
Only the newest `memory.maxTurns` (default 50) are kept; older turns fall off.

| Method | Returns | Notes |
|---|---|---|
| `add(role, text, meta?)` | turn | role must be `"user"` or `"bot"` |
| `all()` | turns[] (copy) | oldest first |
| `last(n = 1, role?)` | turns[] | the newest `n` (optionally only one role) |
| `recent(role, fromEnd = 0)` | turn or `null` | `0` = newest of that role, `1` = the one before |
| `search(text)` | turns[] | case-insensitive substring |
| `transcript(n?)` | string | `You: ...` / `Bot: ...` lines |
| `clear()` | | empties the window |
| `size` | number | current turn count |
| `toJSON()` / `loadJSON(obj)` | | used by save/load |

**Important:** when an ability runs, the *current* user message is already in memory.
So "the previous thing the user said" is `conversation.recent("user", 1)`, not `0`
(this is how the `conversation-recall` built-in works).

Bot turns carry `meta: { source, ability }`, so you can see which ability produced them.
Slash commands are **not** remembered.

## 2. Fact memory (long-term)

Key → value pairs about the user or world, e.g. `name → "Sam"`. Keys are
**case-insensitive** and trimmed (`" Name "` and `"name"` are the same fact).
Each entry stores `{ value, updatedAt, source }`.

| Method | Notes |
|---|---|
| `set(key, value, { source }?)` | throws on empty key |
| `get(key, fallback?)` | value, or `fallback` |
| `getEntry(key)` | `{ value, updatedAt, source }` or `null` |
| `has(key)` / `delete(key)` / `clear()` | |
| `keys()` | all keys |
| `find(text)` | keys containing `text` |
| `toObject()` | plain `{ key: value }` (what templates use as `fact`) |
| `size` | count |

```js
run: ({ facts }) => {
  facts.set("city", "Paris", { source: "ability:my-ability" });
  return `I will remember ${facts.get("city")}`;
}
```

## 3. Custom stores

Need your own structure (a todo list, notes, a score table)? Register a store:

```js
class ScoreStore {
  constructor() { this.scores = {}; }
  toJSON() { return { scores: this.scores }; }     // optional: needed to be SAVED
  loadJSON(o) { this.scores = o.scores || {}; }    // optional: needed to be RESTORED
  clear() { this.scores = {}; }                    // optional: called by /reset all
}
agent.memory.registerStore("scores", new ScoreStore());
agent.memory.getStore("scores");
```

Store names: letters/digits/`-`/`_`; `conversation` and `facts` are reserved; duplicates throw.
Inside a plugin use `api.registerStore(name, store)` — it is removed automatically when the plugin is unregistered.
Working examples: `examples/abilities/todo-list.js`, `examples/plugins/notes-plugin.js`.

## 4. Saving and loading

Memory is **RAM only by default**. To persist:

```js
// mini-llm.config.js
memory: { maxTurns: 50, persist: true, file: "memory/state.json" }
```

With `persist: true` the agent loads the file at start-up (if it exists) and saves it on
`agent.shutdown()` (the chat command does this when you type `exit`). Manual control:

| How | What |
|---|---|
| `/save [file]`, `/load [file]` | in the chat |
| `agent.memory.save(file?)` | returns the path; creates folders |
| `agent.memory.load(file?)` | `true` if loaded, `false` if the file does not exist |
| `agent.memory.snapshot()` / `restore(snap)` | in-memory copy, no disk |
| `agent.memory.clearAll()` | wipes conversation, facts and custom stores |

File format (`memory/state.json`): `{ version, savedAt, conversation, facts, stores }`.

**Stores registered late are safe.** If the file contains data for a store that is not registered
yet when `load()` runs (for example an ability registers its store lazily), that data is held aside
and applied the moment `registerStore(name, ...)` is called. Until then it is kept and written back
on the next save, so it is never lost.

## 5. Memory and the neural network

The network was trained on single turns, with a context window of ~25 tokens. **Memory is
not fed into it.** Memory influences replies through:

1. **Abilities** — read `facts`/`conversation` and answer (`recall`, `greet-known-user`, ...).
2. **Plugins** — use `generate:before` to change the text the network sees, e.g. a plugin that
   rewrites "what is my name" using a fact, or `response:final` to personalize replies:

```js
// plugins/personalize.js
module.exports = {
  name: "personalize",
  setup(api) {
    api.on("response:final", (p) => {
      const name = api.agent.memory.facts.get("name");
      if (name && p.source === "model") p.text = `${p.text} (${name})`;
    });
  },
};
```

To make the *network itself* context-aware you would train it on multi-turn sequences
(see [TRAINING.md](TRAINING.md#ideas-for-going-further)).

## 6. Resetting

`/reset` clears only the conversation; `/reset all` clears everything;
`/forget <key>` / `/forget all` clears facts.
