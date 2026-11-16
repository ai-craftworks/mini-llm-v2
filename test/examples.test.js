/** Every example in examples/ (used by the tutorials) must work. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { makeAgent, tempDir } = require("./helpers");
const { loadAbilitiesFromDir } = require("../src/abilities/loader");

const EX = path.resolve(__dirname, "../examples");

test("example ability: reverse-text", async () => {
  const agent = await makeAgent();
  agent.abilities.register(require(path.join(EX, "abilities/reverse-text.js")));
  assert.strictEqual((await agent.respond("reverse hello world")).text, "dlrow olleh");
});

test("example ability: guess-number is a stateful game kept in fact memory", async () => {
  const agent = await makeAgent();
  agent.abilities.register(require(path.join(EX, "abilities/guess-number.js")));
  agent.rng = () => 0.49; // target = 50
  assert.match((await agent.respond("guess 10")).text, /not playing/);
  assert.match((await agent.respond("play guess")).text, /1 to 100/);
  assert.strictEqual((await agent.respond("guess 10")).text, "Higher!");
  assert.strictEqual((await agent.respond("guess 90")).text, "Lower!");
  assert.match((await agent.respond("guess 50")).text, /Correct! The number was 50. You needed 3/);
  assert.strictEqual(agent.memory.facts.has("guess-target"), false);
});

test("example ability: joke-teller (JSON, several replies)", async () => {
  const agent = await makeAgent();
  const { loaded, errors } = loadAbilitiesFromDir(path.join(EX, "abilities"), agent.abilities, { warn() {} });
  assert.deepStrictEqual(errors, []);
  assert.ok(loaded.includes("joke-teller"));
  assert.match((await agent.respond("tell me a joke")).text, /programmers|binary|SQL/);
});

test("example plugin: rate-limit blocks floods but never commands", async () => {
  const agent = await makeAgent({ plugins: { builtin: [], settings: { "rate-limit": { maxPerMinute: 2 } } } });
  await agent.plugins.register(require(path.join(EX, "plugins/rate-limit.js")));
  assert.strictEqual((await agent.respond("1 + 1")).source, "ability");
  assert.strictEqual((await agent.respond("2 + 2")).source, "ability");
  const blocked = await agent.respond("3 + 3");
  assert.deepStrictEqual([blocked.text, blocked.source], ["Slow down a little!", "plugin"]);
  assert.strictEqual((await agent.respond("/memory")).source, "command");
});

test("example plugin: abbreviations expands text-speak", async () => {
  const agent = await makeAgent();
  await agent.plugins.register(require(path.join(EX, "plugins/abbreviations.js")));
  agent.abilities.register({ name: "parrot", patterns: [/^say (.+)$/], run: ({ match }) => match[1] });
  assert.strictEqual((await agent.respond("say pls thx u")).text, "please thanks you");
});

test("example plugin: auto-save writes memory after every reply and restores on start", async () => {
  const root = tempDir();
  const a = await makeAgent({}, { rootDir: root });
  await a.plugins.register(require(path.join(EX, "plugins/auto-save.js")));
  await a.respond("my name is Zed"); // no shutdown() call
  const b = await makeAgent({}, { rootDir: root });
  await b.plugins.register(require(path.join(EX, "plugins/auto-save.js")));
  await b.hooks.run("agent:ready", { agent: b });
  assert.strictEqual(b.memory.facts.get("name"), "Zed");
});
