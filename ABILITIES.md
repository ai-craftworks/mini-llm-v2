# ABILITIES.md — create your own abilities (step by step)

An **ability** is a small program that *you* write. When a message matches the ability's
trigger, the ability answers **instead of the neural network**. Abilities are how you give
the bot real skills: maths, games, lookups, memory, anything JavaScript can do.

**Which tool for which job?**

| You want… | Use |
|---|---|
| The bot to *do* something exact (calculate, remember, fetch, play a game) | **Ability** (this guide) |
| To change *how the system behaves* (filter text, add commands, new sampling) | [Plugin](PLUGINS.md) |
| The bot to *talk* differently in free-form chat | [Training data](TRAINING.md) |

Contents: [Step 1 first ability](#step-1--your-first-ability) · [2 anatomy](#step-2--anatomy-of-an-ability) ·
[3 triggers](#step-3--triggers-patterns-keywords-match) · [4 capture groups](#step-4--capture-groups) ·
[5 memory](#step-5--use-memory) · [6 decline](#step-6--decline-to-answer) · [7 async](#step-7--async-abilities) ·
[8 priority](#step-8--priority-and-conflicts) · [9 JSON](#step-9--json-abilities-no-code) · [10 stores](#step-10--your-own-memory-store) ·
[11 runtime](#step-11--register-at-runtime-or-from-a-plugin) · [12 tests](#step-12--test-your-ability) · [Reference](#reference) ·
[Recipes](#recipes) · [Debugging](#debugging-checklist) · [Best practices](#best-practices)

---

## Step 1 — Your first ability

Generate a template:

```bash
node cli.js new ability reverse-text
```

This creates `abilities/reverse-text.js`. Replace its contents with:

```js
// abilities/reverse-text.js
module.exports = {
  name: "reverse-text",
  description: "Reverses text: 'reverse hello'",
  examples: ["reverse hello world"],
  patterns: [/^reverse\s+(.+)$/i],
  run: ({ match }) => [...match[1]].reverse().join(""),
};
```

Start the chat and try it:

```
$ node cli.js chat
You: reverse hello world
Bot: dlrow olleh
```

Check it loaded: `node cli.js abilities` lists `reverse-text` with source `file:reverse-text.js`.
Abilities in `abilities/` load automatically every time the agent starts. (A copy of this one is in
`examples/abilities/reverse-text.js`.)

**What just happened?** The agent compared your message with every ability's trigger (`patterns`).
`/^reverse\s+(.+)$/i` matched, so `run()` was called with `match` = the regex result
(`match[1]` is the text after "reverse "). The string it returned became the reply.

---

## Step 2 — Anatomy of an ability

```js
module.exports = {
  name: "my-ability",            // REQUIRED. Unique. Letters, digits, - and _
  description: "What it does",   // shown by /abilities and "help"
  priority: 0,                   // higher runs first (built-ins use 10)
  enabled: true,                 // false = registered but off
  examples: ["phrase"],          // documentation only

  // HOW IT TRIGGERS — at least one of these:
  patterns: [/regex/i, "^string$"],
  keywords: ["weather"],
  match: (input, ctx) => null,

  // WHAT IT DOES — one of these:
  run: async (ctx) => "reply",   // string | { text, meta } | null (= decline)
  // response: "text {{match.1}}"    (declarative, see Step 9)
  // responses: ["a", "b"]
  // remember: { key: "{{match.1}}" }
};
```

A file may export **one** ability or an **array** of abilities:

```js
module.exports = [ { name: "a", /* ... */ }, { name: "b", /* ... */ } ];
```

**Names** must be unique across built-ins, files and plugins; a clash is reported as
`Ability "x" is already registered (existing source: ...)`.

---

## Step 3 — Triggers: patterns, keywords, match()

An ability triggers if **any** of its triggers hit (checked in the order patterns → keywords → `match`).

### 3a. `patterns`

An array of regular expressions. Three accepted forms:

```js
patterns: [
  /^hello (\w+)$/i,        // a RegExp
  "^ping$",                // a string -> compiled as a case-insensitive RegExp
  "/^pong$/i",             // a "/regex/flags" string (handy in JSON)
]
```

Tips: anchor with `^...$` for whole-message commands; leave anchors off for "anywhere in the sentence"
(`/\bjoke\b/i`). Matching happens on the trimmed message *after* input hooks ran.

### 3b. `keywords`

```js
keywords: ["weather", "forecast"]   // whole-word, case-insensitive: "Weather today?" yes; "weathervane" no
```

### 3c. `match(input, ctx)`

Use code when a regex is not enough. Return a falsy value for "no", or `true`/an array/an object for "yes".
Whatever you return is passed to `run` as `ctx.match`:

```js
match: (input) => {
  const m = /^add (.+) to my list$/i.exec(input.trim());
  return m ? { item: m[1] } : null;
},
run: ({ match }) => `Added ${match.item}`,
```

`match` receives the same `ctx` as `run` (minus `match`/`ability`), so it can look at memory:
`match: (input, { facts }) => facts.has("name") && /^who am i$/i.test(input)`.

---

## Step 4 — Capture groups

With `patterns`, `ctx.match` is the regex result: `match[0]` is the whole match, `match[1]`, `match[2]`… are your `( )` groups,
`match.groups` holds named groups.

Rolling dice (this ability ships as `abilities/dice.js`):

```js
module.exports = {
  name: "dice",
  description: "Rolls a die: 'roll a d6', 'roll d20', 'roll a die'",
  patterns: [/\broll\s+(?:a\s+)?d(\d{1,4})\b/i, /\broll\s+(?:a\s+)?die\b/i],
  run: ({ match, rng }) => {
    const sides = match[1] ? parseInt(match[1], 10) : 6;   // 2nd pattern has no group
    if (sides < 2) return "A die needs at least 2 sides.";
    return `You rolled a ${Math.floor(rng() * sides) + 1} (d${sides}).`;
  },
};
```

Note `rng()` instead of `Math.random()`: the same function in production, but tests can replace it (Step 12).

---

## Step 5 — Use memory

`ctx.facts` is long-term memory, `ctx.conversation` is the transcript, `ctx.memory` is everything
(see [MEMORY.md](MEMORY.md)). A game that keeps its state in facts — `examples/abilities/guess-number.js`:

```js
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
```

```
You: play guess
Bot: I picked a number from 1 to 100. Say 'guess <number>'.
You: guess 50
Bot: Higher!
```

Reading the conversation: the **current** message is already in memory, so the previous user message is
`conversation.recent("user", 1)`:

```js
run: ({ conversation }) => {
  const prev = conversation.recent("user", 1);
  return prev ? `Before that you said: "${prev.text}"` : "Nothing before that.";
}
```

---

## Step 6 — Decline to answer

Return `null` (or `undefined`/`false`) and the agent tries the **next** matching ability, and finally the neural network.
`abilities/greet-known-user.js` greets you by name *only when it knows it*:

```js
module.exports = {
  name: "greet-known-user",
  description: "Greets you by name once I know it",
  priority: 20,
  patterns: [/^(?:hi|hello|hey)[!. ]*$/i],
  run: ({ facts }) => {
    const name = facts.get("name");
    if (!name) return null;                       // decline -> the neural network answers
    return `Hello again, ${name}! Good to see you.`;
  },
};
```

```
You: hello            -> neural network ("hi there ! how can i help you ?")
You: my name is Ada
You: hello            -> "Hello again, Ada! Good to see you."
```

---

## Step 7 — Async abilities

`run` may be `async`; the agent awaits it. Anything Node can do works (files, the network with Node's built-in `fetch`, timers):

```js
// abilities/ip-address.js  (needs internet)
module.exports = {
  name: "ip-address",
  description: "Tells your public IP",
  patterns: [/^what is my ip$/i],
  run: async () => {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) return "I could not reach the service.";
    const data = await res.json();
    return `Your public IP is ${data.ip}.`;
  },
};
```

If `run` throws, the error is logged, reported on the `error` hook, and the agent moves on to the next
ability/network — your chat never crashes. Still, handle expected failures yourself and give a friendly message.

---

## Step 8 — Priority and conflicts

When several abilities match, the one with the **highest `priority`** runs first; ties go to whichever was registered first
(built-ins, then plugins, then files in alphabetical order). If it declines, the next one runs.

| Priority | Used by |
|---|---|
| 20 | `greet-known-user` (shipped example) |
| 15 | `todo-list`, `guess-number`, `unit-converter`, `joke-teller`, … (examples) |
| 10 | all built-ins |
| 0 (default) | your abilities unless you set one |

To **override a built-in**, give your ability priority above 10 and a trigger that matches the same phrase,
or switch the built-in off: `/ability datetime off` or `abilities: { disabled: ["datetime"] }` in the config.
See which one answered with `node cli.js chat --debug` (`[ability:name]`).

---

## Step 9 — JSON abilities (no code)

A `.json` file in `abilities/` is a **declarative** ability: patterns plus a reply template. No JavaScript.

```json
{
  "name": "ping",
  "description": "Replies pong",
  "patterns": ["^ping$"],
  "response": "pong"
}
```

| Field | Meaning |
|---|---|
| `name`, `description`, `priority`, `enabled`, `examples` | as in JS abilities |
| `patterns` | strings only: `"^ping$"` (case-insensitive) or `"/regex/flags"` |
| `keywords` | whole-word triggers |
| `response` | one reply template |
| `responses` | several templates; one is picked at random |
| `remember` | `{ "factKey": "template" }` stored before replying |

**Templates** use `{{path}}` placeholders:

| Placeholder | Value |
|---|---|
| `{{input}}` | the user's message |
| `{{match.1}}`, `{{match.2}}` | regex capture groups (`{{match.0}}` = whole match) |
| `{{fact.name}}` | a remembered fact (keys with only letters/digits/`_`/`-`) |
| `{{date}}`, `{{time}}` | current date / time |
| `{{fact.name\|friend}}` | with a default if missing or empty |

Example that **learns** (declarative memory):

```json
{
  "name": "learn-pet",
  "patterns": ["^my pet is (\\w+)$"],
  "remember": { "pet": "{{match.1}}" },
  "response": "{{match.1}} sounds lovely! I will remember your pet."
}
```
(In JSON, backslashes are doubled: `\\w`.) Then another JSON ability can answer `what is my pet` with `"response": "Your pet is {{fact.pet|a mystery}}."`.

Random replies — `examples/abilities/joke-teller.json`:

```json
{ "name": "joke-teller", "patterns": ["\\bjoke\\b"], "priority": 15,
  "responses": ["Joke one", "Joke two", "Joke three"] }
```

JSON abilities cannot decline, call functions, or use `match()`; switch to a `.js` file when you need logic.

---

## Step 10 — Your own memory store

When facts (flat key/value) are not enough, keep a structure and register it so it can be listed, cleared and **saved**
(see [MEMORY.md](MEMORY.md#3-custom-stores)). Complete example: `examples/abilities/todo-list.js`:

```js
class TodoStore {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  clear() { this.items = []; }
  toJSON() { return { items: this.items }; }
  loadJSON(obj) { this.items = obj.items || []; }
}
const store = new TodoStore();
let registered = false;

module.exports = {
  name: "todo-list",
  description: "Keeps a todo list: 'add X to my todo list', 'show my todo list'",
  priority: 15,
  match: (input) => {
    let m = /^add (.+) to my (?:todo|to-do) list$/i.exec(input.trim());
    if (m) return { action: "add", item: m[1] };
    if (/^show my (?:todo|to-do) list$/i.test(input.trim())) return { action: "show" };
    if (/^clear my (?:todo|to-do) list$/i.test(input.trim())) return { action: "clear" };
    return null;
  },
  run: ({ match, memory }) => {
    if (!registered) { if (!memory.getStore("todos")) memory.registerStore("todos", store); registered = true; }
    if (match.action === "add") { store.add(match.item); return `Added "${match.item}". You have ${store.items.length} item(s).`; }
    if (match.action === "clear") { store.clear(); return "Todo list cleared."; }
    return store.items.length ? "Your todo list:\n" + store.items.map((x, i) => `${i + 1}. ${x}`).join("\n") : "Your todo list is empty.";
  },
};
```

Copy it into `abilities/` to enable it. For cleaner code, register stores in a [plugin](PLUGINS.md#step-7--memory-stores-and-custom-hooks)
(its `setup` runs once at start-up and unregisters automatically).

---

## Step 11 — Register at runtime or from a plugin

Without files, from your own code:

```js
const { MiniLLMAgent } = require("./src");
const agent = await MiniLLMAgent.create();

agent.abilities.register({ name: "shout", patterns: [/^shout (.+)$/i], run: ({ match }) => match[1].toUpperCase() + "!" });
agent.abilities.disable("shout");     // turn off
agent.abilities.enable("shout");
agent.abilities.unregister("shout");  // remove
agent.abilities.list();               // all abilities, highest priority first
```

From a plugin: `api.registerAbility({...})` (removed automatically when the plugin unloads). Registering a duplicate
name throws; pass `{ replace: true }` as the 2nd argument to `agent.abilities.register(def, { replace: true })` to overwrite.

In chat: `/abilities` lists them, `/ability <name> on|off` toggles.

---

## Step 12 — Test your ability

Tests use Node's built-in runner. The helper builds a quiet agent with no model in a temp folder:

```js
// test/my-ability.test.js
const test = require("node:test");
const assert = require("node:assert");
const { makeAgent } = require("./helpers");

test("reverse-text reverses", async () => {
  const agent = await makeAgent();
  agent.abilities.register(require("../examples/abilities/reverse-text.js"));
  const reply = await agent.respond("reverse abc");
  assert.strictEqual(reply.text, "cba");
  assert.strictEqual(reply.ability, "reverse-text");
  assert.strictEqual(reply.source, "ability");
});

test("guess-number with a fixed random number", async () => {
  const agent = await makeAgent();
  agent.abilities.register(require("../examples/abilities/guess-number.js"));
  agent.rng = () => 0.49;                       // target becomes 50
  await agent.respond("play guess");
  assert.strictEqual((await agent.respond("guess 10")).text, "Higher!");
});
```

Run: `node --test test/my-ability.test.js` (or `npm test` for everything — your file is picked up automatically
because it ends in `.test.js`). Control time with `agent.now = () => new Date("2030-01-01T10:00:00")`.
To test an ability **file** exactly as the agent loads it: `makeAgent({}, { rootDir: <folder containing abilities/> })`.

---

## Reference

### Return values of `run`

| Return | Meaning |
|---|---|
| `"text"` | the reply |
| `{ text: "…", meta: { … } }` | the reply plus metadata (appears in `result.meta`; readable by plugins) |
| `null` / `undefined` / `false` | **decline**: next ability, then the network |
| anything else (number, object without `text`…) | error: reported, agent continues |

### `ctx` fields

`input`, `match`, `ability`, `facts`, `conversation`, `memory`, `agent`, `config`, `log`, `now()`, `rng()` — details in
[DEVELOPMENT.md](DEVELOPMENT.md#ability-context-ctx-passed-to-run-and-match).

### Hooks that affect abilities

`ability:before` (veto with `skip = true`), `ability:after` (edit `response`/`meta`) — [PLUGINS.md](PLUGINS.md).

### Built-in abilities (read their source: `src/abilities/builtin/index.js`)

`calculator`, `datetime`, `remember`, `recall`, `forget`, `conversation-recall`, `help`.

---

## Recipes

**Word counter**
```js
module.exports = {
  name: "word-count",
  description: "Counts words: 'count words in <text>'",
  patterns: [/^count words in (.+)$/i],
  run: ({ match }) => `That is ${match[1].trim().split(/\s+/).length} word(s).`,
};
```

**Random choice**
```js
module.exports = {
  name: "pick-one",
  description: "Picks from options: 'pick pizza or pasta or sushi'",
  patterns: [/^pick (.+? or .+)$/i],
  run: ({ match, rng }) => {
    const options = match[1].split(/\s+or\s+/i);
    return `I pick: ${options[Math.floor(rng() * options.length)]}`;
  },
};
```

**Countdown to a date**
```js
module.exports = {
  name: "days-until",
  description: "'days until 2030-01-01'",
  patterns: [/^days until (\d{4}-\d{2}-\d{2})$/i],
  run: ({ match, now }) => {
    const target = new Date(match[1] + "T00:00:00");
    if (Number.isNaN(target.getTime())) return "That is not a valid date.";
    return `${Math.ceil((target - now()) / 86400000)} day(s) to go.`;
  },
};
```

**Remember a birthday and recall it** (JSON only)
```json
[
  { "name": "set-birthday", "patterns": ["^my birthday is (.+)$"], "remember": { "birthday": "{{match.1}}" }, "response": "Got it: {{match.1}}." },
  { "name": "get-birthday", "patterns": ["^when is my birthday"], "response": "Your birthday is {{fact.birthday|unknown - tell me with 'my birthday is ...'}}." }
]
```
(A `.json` file may hold an array of abilities.)

**Call another ability from yours**: use `agent`:
```js
run: async ({ agent }) => (await agent.respond("what time is it")).text
```
(Beware of infinite recursion; this also adds turns to memory.)

---

## Debugging checklist

1. **Is it loaded?** `node cli.js abilities`. Missing? Run with logging: set `logLevel: "info"` or look for `Could not load ability file "x": ...` warnings (syntax error, duplicate name, no trigger...).
2. **Is it on?** `[on]`/`[off]` in `/abilities`; also check `abilities.disabled` in the config.
3. **Does the trigger match?** Test the regex alone: `node -e "console.log(/^reverse\s+(.+)$/i.exec('reverse abc'))"`. Remember input hooks may change the text first, and messages are trimmed.
4. **Is another ability winning?** Run `node cli.js chat --debug` and look at `[ability:name]`. Raise your `priority`.
5. **Did it decline?** `run` returning `undefined` (for example a forgotten `return`) is a decline!
6. **Did it throw?** Watch the console for `Ability "x" failed: ...` or add a plugin on the `error` hook.
7. **Reload:** abilities load at start-up, so restart the chat after editing a file.
8. **Isolate:** write a test (Step 12) and run only that file.

## Best practices

- One ability, one job; give it a clear `description` (it appears in `help`).
- Anchor commands with `^...$` so normal sentences do not trigger them accidentally.
- Prefer `ctx.rng()` / `ctx.now()` over `Math.random()` / `new Date()` — testable.
- Keep state in `facts` or a registered store, not in module variables: memory can be saved, reset and inspected.
- Validate input and return friendly errors rather than throwing.
- Decline (`return null`) when you cannot help, so other abilities or the network can answer.
- Abilities are trusted code: never put untrusted files in `abilities/`, and never `eval` user text (the built-in calculator uses a parser for this reason).
