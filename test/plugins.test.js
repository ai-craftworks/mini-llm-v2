const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { HookBus } = require("../src/plugins/hooks");
const { makeAgent, tempDir } = require("./helpers");

const EXAMPLES = path.resolve(__dirname, "../examples/plugins");

test("hooks run by priority (high first), then registration order", async () => {
  const bus = new HookBus({ logger: { error() {} } });
  const order = [];
  bus.on("input:received", () => order.push("low"), { priority: -5 });
  bus.on("input:received", () => order.push("first-default"));
  bus.on("input:received", () => order.push("high"), { priority: 5 });
  bus.on("input:received", () => order.push("second-default"));
  await bus.run("input:received", {});
  assert.deepStrictEqual(order, ["high", "first-default", "second-default", "low"]);
});

test("hooks: unknown names are rejected, custom hooks can be defined", () => {
  const bus = new HookBus({});
  assert.throws(() => bus.on("nope", () => {}), /Unknown hook "nope"/);
  assert.throws(() => bus.define("bad"), /namespace:event/);
  bus.define("my:event");
  assert.doesNotThrow(() => bus.on("my:event", () => {}));
});

test("a throwing handler is isolated and reported on the error hook", async () => {
  const errors = [];
  const bus = new HookBus({ logger: { error() {} } });
  bus.on("error", (p) => errors.push(p.error.message));
  bus.on("input:received", () => { throw new Error("boom"); });
  bus.on("input:received", (p) => { p.ran = true; });
  const payload = await bus.run("input:received", {});
  assert.strictEqual(payload.ran, true);
  assert.deepStrictEqual(errors, ["boom"]);
});

test("plugin: setup receives api; hooks can rewrite input and output", async () => {
  const agent = await makeAgent();
  await agent.plugins.register({
    name: "rewriter",
    defaults: { suffix: "?!" },
    setup(api) {
      api.on("input:received", (p) => { p.text = p.text.replace("plus", "+"); });
      api.on("response:final", (p) => { p.text += api.config.suffix; });
    },
  });
  assert.strictEqual((await agent.respond("1 plus 1")).text, "1 + 1 = 2?!");
});

test("plugin settings come from config.plugins.settings and override defaults", async () => {
  const agent = await makeAgent({ plugins: { builtin: [], settings: { cfg: { greeting: "yo" } } } });
  let seen;
  await agent.plugins.register({ name: "cfg", defaults: { greeting: "hi", other: 1 }, setup(api) { seen = api.config; } });
  assert.deepStrictEqual(seen, { greeting: "yo", other: 1 });
});

test("plugin can short-circuit with input:received.response (model/abilities never run)", async () => {
  const agent = await makeAgent();
  await agent.plugins.register({ name: "gate", setup(api) { api.on("input:received", (p) => { if (p.text === "secret") p.response = "blocked"; }); } });
  const r = await agent.respond("secret");
  assert.deepStrictEqual([r.text, r.source], ["blocked", "plugin"]);
  assert.strictEqual(agent.memory.conversation.recent("user"), null); // never reached memory
});

test("ability:before can skip, ability:after can edit the reply", async () => {
  const agent = await makeAgent();
  await agent.plugins.register({
    name: "ab",
    setup(api) {
      api.on("ability:before", (p) => { if (p.ability.name === "calculator" && p.input.includes("99")) p.skip = true; });
      api.on("ability:after", (p) => { p.response += " [checked]"; });
    },
  });
  assert.strictEqual((await agent.respond("1 + 1")).text, "1 + 1 = 2 [checked]");
  assert.notStrictEqual((await agent.respond("99 + 1")).source, "ability");
});

test("plugins can register abilities, commands, stores, samplers - and unregister removes ALL of it", async () => {
  const agent = await makeAgent();
  await agent.plugins.register({
    name: "bundle",
    setup(api) {
      api.registerAbility({ name: "bundle-ability", patterns: [/^bundle$/], response: "bundled" });
      api.registerCommand("bundlecmd", () => "cmd-ok");
      api.registerStore("bundle-store", { items: [] });
      api.registerSampler("bundle-sampler", () => 0);
      api.on("response:final", () => {});
    },
  });
  assert.strictEqual((await agent.respond("bundle")).text, "bundled");
  assert.strictEqual((await agent.respond("/bundlecmd")).text, "cmd-ok");
  assert.ok(agent.memory.getStore("bundle-store"));
  assert.ok(agent.samplers.list().includes("bundle-sampler"));

  assert.ok(await agent.plugins.unregister("bundle"));
  assert.strictEqual(agent.abilities.has("bundle-ability"), false);
  assert.strictEqual(agent.commands.has("bundlecmd"), false);
  assert.strictEqual(agent.memory.getStore("bundle-store"), null);
  assert.strictEqual(agent.samplers.list().includes("bundle-sampler"), false);
  assert.strictEqual(agent.hooks.count("response:final"), 0);
});

test("a plugin whose setup() throws is rolled back completely", async () => {
  const agent = await makeAgent();
  await assert.rejects(agent.plugins.register({
    name: "half",
    setup(api) { api.registerAbility({ name: "half-ability", patterns: [/x/], response: "x" }); throw new Error("setup broke"); },
  }), /setup failed: setup broke/);
  assert.strictEqual(agent.abilities.has("half-ability"), false);
  assert.strictEqual(agent.plugins.get("half"), null);
});

test("plugin validation: bad names, duplicates, bad setup", async () => {
  const agent = await makeAgent();
  await assert.rejects(agent.plugins.register({ name: "bad name" }), /Plugin name/);
  await assert.rejects(agent.plugins.register({ name: "p", setup: 3 }), /setup must be a function/);
  await agent.plugins.register({ name: "dup" });
  await assert.rejects(agent.plugins.register({ name: "dup" }), /already registered/);
});

test("teardown() runs on unregister and on agent.shutdown()", async () => {
  const agent = await makeAgent();
  let torn = 0;
  await agent.plugins.register({ name: "t1", teardown() { torn++; } });
  await agent.plugins.register({ name: "t2", teardown() { torn++; } });
  await agent.plugins.unregister("t1");
  await agent.shutdown();
  assert.strictEqual(torn, 2);
});

test("loadDir: loads object and function-style plugins, skips disabled, reports broken files", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "a.js"), 'module.exports = { name: "a", setup(api) { api.registerCommand("acmd", () => "A"); } };');
  fs.writeFileSync(path.join(dir, "b.js"), 'module.exports = (api) => api.registerCommand("bcmd", () => "B");');
  fs.writeFileSync(path.join(dir, "off.js"), 'module.exports = { name: "off", setup(api) { api.registerCommand("offcmd", () => "!"); } };');
  fs.writeFileSync(path.join(dir, "broken.js"), 'module.exports = { name: "broken", setup() { throw new Error("nope"); } };');
  const agent = await makeAgent();
  const { loaded, errors } = await agent.plugins.loadDir(dir, ["off"]);
  assert.deepStrictEqual(loaded.sort(), ["a", "b"]);
  assert.deepStrictEqual(errors.map((e) => e.file), ["broken.js"]);
  assert.strictEqual((await agent.respond("/bcmd")).text, "B");
  assert.strictEqual(agent.commands.has("offcmd"), false);
});

test("built-in stats plugin counts replies and adds /stats", async () => {
  const agent = await makeAgent({ plugins: { builtin: ["stats"] } });
  await agent.respond("1 + 1");
  await agent.respond("2 + 2");
  await agent.respond("blah blah");
  const out = (await agent.respond("/stats")).text;
  assert.match(out, /replies: 3/); // /stats itself is not counted until after it runs
  assert.match(out, /from ability: 2/);
  assert.match(out, /ability calculator: 2/);
});

test("built-in logger plugin writes JSON lines to a file", async () => {
  const root = tempDir();
  const agent = await makeAgent({ plugins: { builtin: ["logger"], settings: { logger: { file: "logs/chat.log" } } } }, { rootDir: root });
  await agent.respond("1 + 1");
  const lines = fs.readFileSync(path.join(root, "logs/chat.log"), "utf-8").trim().split("\n").map(JSON.parse);
  assert.deepStrictEqual(lines.map((l) => l.event), ["input", "response"]);
  assert.strictEqual(lines[1].ability, "calculator");
});

test("example plugin: profanity-filter masks input and output", async () => {
  const agent = await makeAgent();
  await agent.plugins.register(require(path.join(EXAMPLES, "profanity-filter.js")));
  agent.abilities.register({ name: "parrot", patterns: [/^repeat (.+)$/], run: ({ match }) => match[1] });
  assert.strictEqual((await agent.respond("repeat well darn it")).text, "well *** it");
});

test("example plugin: shout adds commands and an uppercase mode", async () => {
  const agent = await makeAgent();
  await agent.plugins.register(require(path.join(EXAMPLES, "shout.js")));
  assert.strictEqual((await agent.respond("/shout hello")).text, "HELLO!");
  await agent.respond("/loud on");
  agent.abilities.register({ name: "p2", patterns: [/^say hi$/], run: () => "hi there" });
  assert.strictEqual((await agent.respond("say hi")).text, "HI THERE");
});

test("example plugin: notes registers a store, ability, command and fires a custom hook", async () => {
  const agent = await makeAgent();
  await agent.plugins.register(require(path.join(EXAMPLES, "notes-plugin.js")));
  const fired = [];
  agent.hooks.on("notes:saved", (p) => fired.push(p.text));
  assert.strictEqual((await agent.respond("note: buy milk")).text, "Saved note #1.");
  assert.strictEqual((await agent.respond("/notes")).text, "1. buy milk");
  assert.deepStrictEqual(fired, ["buy milk"]);
  assert.strictEqual(agent.memory.getStore("notes").notes.length, 1);
});

test("the shipped plugins/timer.js loads", async () => {
  const agent = await makeAgent({}, { rootDir: path.resolve(__dirname, "..") });
  assert.ok(agent.plugins.get("timer"));
  const r = await agent.respond("1 + 1");
  assert.strictEqual(typeof r.meta.timerMs, "number");
});
