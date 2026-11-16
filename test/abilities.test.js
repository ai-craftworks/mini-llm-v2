const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { defineAbility } = require("../src/abilities/ability");
const { AbilityRegistry } = require("../src/abilities/registry");
const { loadAbilitiesFromDir } = require("../src/abilities/loader");
const { evaluate } = require("../src/abilities/builtin/mathParser");
const { makeAgent, tempDir } = require("./helpers");

test("defineAbility validates its input with helpful errors", () => {
  assert.throws(() => defineAbility(null), /object/);
  assert.throws(() => defineAbility({ name: "bad name", patterns: [/x/], run() {} }), /name/);
  assert.throws(() => defineAbility({ name: "a", run() {} }), /at least one of/);
  assert.throws(() => defineAbility({ name: "a", patterns: [/x/] }), /needs run/);
  assert.throws(() => defineAbility({ name: "a", patterns: [/x/], run: 5 }), /run must be a function/);
});

test("triggers: regex, string patterns, /regex/flags strings, keywords, match()", () => {
  const ctx = {};
  const a = defineAbility({ name: "a", patterns: [/^hi (\w+)$/i, "^yo$", "/^sup$/i"], run() {} });
  assert.strictEqual(a.test("Hi Bob", ctx)[1], "Bob");
  assert.ok(a.test("YO", ctx));
  assert.ok(a.test("SUP", ctx));
  assert.strictEqual(a.test("nothing", ctx), null);

  const k = defineAbility({ name: "k", keywords: ["weather"], run() {} });
  assert.ok(k.test("what is the Weather today", ctx));
  assert.strictEqual(k.test("weathervane", ctx), null); // whole words only

  const m = defineAbility({ name: "m", match: (s) => (s.length > 3 ? { len: s.length } : false), run() {} });
  assert.strictEqual(m.test("hello", ctx).len, 5);
  assert.strictEqual(m.test("hi", ctx), null);
});

test("global-flag regexes do not leak state between calls", () => {
  const a = defineAbility({ name: "g", patterns: [/cat/g], run() {} });
  assert.ok(a.test("cat", {}));
  assert.ok(a.test("cat", {}));
});

test("registry: priority order, duplicates, enable/disable", () => {
  const r = new AbilityRegistry();
  r.register({ name: "low", patterns: [/x/], run: () => "low" });
  r.register({ name: "high", priority: 5, patterns: [/x/], run: () => "high" });
  assert.deepStrictEqual(r.candidates("x", {}).map((c) => c.ability.name), ["high", "low"]);
  assert.throws(() => r.register({ name: "low", patterns: [/y/], run() {} }), /already registered/);
  r.disable("high");
  assert.deepStrictEqual(r.candidates("x", {}).map((c) => c.ability.name), ["low"]);
  r.enable("high");
  assert.strictEqual(r.candidates("x", {}).length, 2);
  assert.throws(() => r.disable("ghost"), /Unknown ability/);
});

test("registry survives an ability whose match() throws", () => {
  const r = new AbilityRegistry();
  r.register({ name: "bad", match: () => { throw new Error("boom"); }, run() {} });
  r.register({ name: "good", patterns: [/x/], run() {} });
  assert.deepStrictEqual(r.candidates("x", {}).map((c) => c.ability.name), ["good"]);
});

test("loader loads .js/.json files and reports broken ones without crashing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "ok.js"), 'module.exports = { name: "ok", patterns: [/ok/], run: () => "ok" };');
  fs.writeFileSync(path.join(dir, "many.js"), 'module.exports = [{ name: "m1", patterns: [/m1/], response: "1" }, { name: "m2", patterns: [/m2/], response: "2" }];');
  fs.writeFileSync(path.join(dir, "decl.json"), '{ "name": "decl", "patterns": ["^d$"], "response": "D" }');
  fs.writeFileSync(path.join(dir, "broken.js"), "module.exports = { name: 'broken' };");
  fs.writeFileSync(path.join(dir, "syntax.json"), "{ not json");
  const r = new AbilityRegistry();
  const { loaded, errors } = loadAbilitiesFromDir(dir, r, { warn() {} });
  assert.deepStrictEqual(loaded.sort(), ["decl", "m1", "m2", "ok"]);
  assert.deepStrictEqual(errors.map((e) => e.file).sort(), ["broken.js", "syntax.json"]);
  assert.deepStrictEqual(loadAbilitiesFromDir(path.join(dir, "missing"), r).loaded, []);
});

test("math parser: precedence, parentheses, unary minus, right-associative ^, errors", () => {
  assert.strictEqual(evaluate("2+3*4"), 14);
  assert.strictEqual(evaluate("(10-4)/3"), 2);
  assert.strictEqual(evaluate("-2^2"), -4);
  assert.strictEqual(evaluate("2^3^2"), 512);
  assert.strictEqual(evaluate("7 % 4"), 3);
  assert.strictEqual(evaluate("1.5*2"), 3);
  assert.throws(() => evaluate("1/0"), /divide by zero/);
  assert.throws(() => evaluate("2+"), /end of expression/);
  assert.throws(() => evaluate("(1+2"), /closing/);
  assert.throws(() => evaluate("2 $ 3"), /Unexpected character/);
});

test("built-in abilities answer through the agent", async () => {
  const agent = await makeAgent();
  assert.strictEqual((await agent.respond("what is 7 times 8")).text, "7 * 8 = 56");
  assert.strictEqual((await agent.respond("(2 + 3) * 4")).text, "(2 + 3) * 4 = 20");
  assert.match((await agent.respond("10 / 0")).text, /divide by zero/);
  assert.notStrictEqual((await agent.respond("42")).source, "ability"); // no operator: not a calculation

  agent.now = () => new Date("2030-05-06T07:08:09");
  assert.match((await agent.respond("what time is it")).text, /^It is .*7:08:09/);
  assert.match((await agent.respond("what's the date")).text, /Mon May 06 2030/);

  assert.match((await agent.respond("my name is Sam Lee")).text, /Sam Lee/);
  assert.strictEqual((await agent.respond("what is my name")).text, "Your name is Sam Lee.");
  assert.match((await agent.respond("remember my favorite color is blue")).text, /favorite color is blue/);
  assert.strictEqual((await agent.respond("what is my favorite color?")).text, "Your favorite color is blue.");
  assert.match((await agent.respond("what do you know about me")).text, /name = Sam Lee, favorite color = blue/);
  assert.match((await agent.respond("forget my name")).text, /forgot your name/);
  assert.match((await agent.respond("what is my name")).text, /do not know your name/);
  assert.match((await agent.respond("forget everything")).text, /forgotten everything/);
  assert.strictEqual(agent.memory.facts.size, 0);
  assert.match((await agent.respond("help")).text, /calculator: /);
});

test("conversation-recall reads conversation memory", async () => {
  const agent = await makeAgent();
  await agent.respond("1 + 1");
  assert.strictEqual((await agent.respond("what did i just say")).text, 'You said: "1 + 1"');
});

test("an ability can decline, letting the next one answer", async () => {
  const agent = await makeAgent();
  agent.abilities.register({ name: "decliner", priority: 99, patterns: [/^\d+ \+ \d+$/], run: () => null });
  agent.abilities.register({ name: "thrower", priority: 98, patterns: [/^\d+ \+ \d+$/], run: () => { throw new Error("oops"); } });
  const r = await agent.respond("1 + 2");
  assert.strictEqual(r.ability, "calculator");
});

test("declarative abilities: response templates, capture groups, facts, remember", async () => {
  const agent = await makeAgent();
  agent.abilities.register({ name: "echo", patterns: ["^say (.+)$"], response: "{{match.1}} for {{fact.name|you}}" });
  assert.strictEqual((await agent.respond("say cheese")).text, "cheese for you");
  agent.abilities.register({ name: "pet", patterns: ["^my pet is (\\w+)$"], remember: { pet: "{{match.1}}" }, response: "Nice, {{fact.pet}}!" });
  assert.strictEqual((await agent.respond("my pet is Rex")).text, "Nice, Rex!");
  assert.strictEqual(agent.memory.facts.get("pet"), "Rex");
  agent.abilities.register({ name: "multi", patterns: [/^pick$/], responses: ["only"] });
  assert.strictEqual((await agent.respond("pick")).text, "only");
});

test("user ability files shipped in abilities/ work (coin, dice, ping, greet-known-user)", async () => {
  const agent = await makeAgent({}, { rootDir: path.resolve(__dirname, "..") });
  agent.rng = () => 0.1;
  assert.strictEqual((await agent.respond("flip a coin")).text, "Heads!");
  agent.rng = () => 0.9;
  assert.strictEqual((await agent.respond("flip a coin")).text, "Tails!");
  assert.strictEqual((await agent.respond("roll a d20")).text, "You rolled a 19 (d20).");
  assert.strictEqual((await agent.respond("roll a die")).text, "You rolled a 6 (d6).");
  assert.strictEqual((await agent.respond("ping")).text, "pong");
  assert.notStrictEqual((await agent.respond("hello")).ability, "greet-known-user"); // unknown name -> declines
  await agent.respond("my name is Ada");
  assert.strictEqual((await agent.respond("hello")).text, "Hello again, Ada! Good to see you.");
});

test("example abilities in examples/abilities work", async () => {
  const dir = tempDir();
  for (const f of fs.readdirSync(path.resolve(__dirname, "../examples/abilities"))) {
    fs.copyFileSync(path.resolve(__dirname, "../examples/abilities", f), path.join(dir, f));
  }
  const agent = await makeAgent({ abilities: { dir: "abilities" } }, { rootDir: path.dirname(dir) });
  // load the copied examples explicitly
  const { loadAbilitiesFromDir: load } = require("../src/abilities/loader");
  const { loaded, errors } = load(dir, agent.abilities);
  assert.deepStrictEqual(errors, []);
  for (const n of ["echo", "todo-list", "unit-converter"]) assert.ok(loaded.includes(n), n);
  assert.match((await agent.respond("convert 10 km to miles")).text, /10 km = 6\.21 miles/);
  assert.match((await agent.respond("convert 100 c to f")).text, /100 c = 212 f/);
  assert.match((await agent.respond("add buy milk to my todo list")).text, /Added "buy milk"/);
  assert.match((await agent.respond("show my todo list")).text, /1\. buy milk/);
  assert.ok(agent.memory.getStore("todos"));
  assert.strictEqual((await agent.respond("say hello")).text, "hello (said for you)");
});
