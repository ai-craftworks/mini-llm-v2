const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { ConversationMemory } = require("../src/memory/conversationMemory");
const { FactMemory } = require("../src/memory/factMemory");
const { MemoryManager } = require("../src/memory/memoryManager");
const { tempDir } = require("./helpers");

test("ConversationMemory keeps a sliding window of maxTurns", () => {
  const c = new ConversationMemory({ maxTurns: 3 });
  ["a", "b", "c", "d"].forEach((t, i) => c.add(i % 2 ? "bot" : "user", t));
  assert.strictEqual(c.size, 3);
  assert.deepStrictEqual(c.all().map((t) => t.text), ["b", "c", "d"]);
});

test("ConversationMemory.recent / last / search / transcript", () => {
  const c = new ConversationMemory();
  c.add("user", "Hello there"); c.add("bot", "Hi!"); c.add("user", "Second message");
  assert.strictEqual(c.recent("user", 0).text, "Second message");
  assert.strictEqual(c.recent("user", 1).text, "Hello there");
  assert.strictEqual(c.recent("user", 2), null);
  assert.strictEqual(c.last(1)[0].text, "Second message");
  assert.strictEqual(c.search("HELLO").length, 1);
  assert.match(c.transcript(), /You: Hello there\nBot: Hi!/);
  assert.throws(() => c.add("alien", "x"), /role/);
});

test("FactMemory is case-insensitive and supports find/delete/toObject", () => {
  const f = new FactMemory();
  f.set(" Name ", "Sam");
  assert.strictEqual(f.get("name"), "Sam");
  assert.ok(f.has("NAME"));
  assert.deepStrictEqual(f.toObject(), { name: "Sam" });
  f.set("favorite color", "blue");
  assert.deepStrictEqual(f.find("color"), ["favorite color"]);
  assert.ok(f.delete("name"));
  assert.strictEqual(f.get("name", "unknown"), "unknown");
  assert.throws(() => f.set("  ", 1), /empty/);
});

test("MemoryManager saves and restores conversation, facts and custom stores", () => {
  const file = path.join(tempDir(), "state.json");
  class Counter { constructor() { this.n = 0; } toJSON() { return { n: this.n }; } loadJSON(o) { this.n = o.n; } }

  const a = new MemoryManager({ file });
  a.conversation.add("user", "hello");
  a.facts.set("name", "Sam");
  a.registerStore("counter", new Counter()).n = 7;
  a.save();

  const b = new MemoryManager({ file });
  b.registerStore("counter", new Counter());
  assert.strictEqual(b.load(), true);
  assert.strictEqual(b.conversation.size, 1);
  assert.strictEqual(b.facts.get("name"), "Sam");
  assert.strictEqual(b.getStore("counter").n, 7);
  assert.strictEqual(new MemoryManager({ file: path.join(tempDir(), "none.json") }).load(), false);
});

test("MemoryManager rejects duplicate or reserved store names", () => {
  const m = new MemoryManager();
  m.registerStore("x", {});
  assert.throws(() => m.registerStore("x", {}), /already exists/);
  assert.throws(() => m.registerStore("facts", {}), /already exists/);
  assert.throws(() => m.registerStore("bad name!", {}), /Invalid/);
});

test("store data loaded before the store exists is kept, applied on registration, and re-saved", () => {
  const file = path.join(tempDir(), "state.json");
  class Counter { constructor() { this.n = 0; } toJSON() { return { n: this.n }; } loadJSON(o) { this.n = o.n; } }
  const a = new MemoryManager({ file });
  a.registerStore("counter", new Counter()).n = 5;
  a.save();

  const b = new MemoryManager({ file });
  b.load();                       // "counter" is not registered yet
  b.save();                       // must NOT drop the counter's data
  const c = new MemoryManager({ file });
  const store = c.registerStore("counter", new Counter());
  c.load();
  assert.strictEqual(store.n, 5);

  const d = new MemoryManager({ file });
  d.load();
  assert.strictEqual(d.registerStore("counter", new Counter()).n, 5); // applied on registration
});
