const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { makeAgent, tempDir } = require("./helpers");
const { trainModel } = require("../src/engine/trainer");
const { loadConfig } = require("../src/engine/config");
const { temperature, greedy, topk, argmax } = require("../src/engine/samplers");

let tiny;
function tinyModel() {
  if (!tiny) {
    tiny = trainModel({
      pairs: [["hi", "hello there !"], ["bye", "goodbye !"]],
      seed: 7,
      hyper: { epochs: 250, lr: 0.01, dModel: 16, dHidden: 32, layers: 1, clipNorm: 5 },
    });
  }
  return tiny;
}

test("config: defaults < file < overrides, with resolve()", () => {
  const c = loadConfig({ rootDir: tempDir(), config: { generation: { temperature: 0.1 } } });
  assert.strictEqual(c.generation.temperature, 0.1);
  assert.strictEqual(c.generation.maxNewTokens, 20); // default kept
  assert.ok(path.isAbsolute(c.resolve("abilities")));
  assert.throws(() => loadConfig({ configPath: "/nope/missing.js" }), /not found/);
});

test("with no model, unmatched input gets the fallback response", async () => {
  const agent = await makeAgent({ fallbackResponse: "FALLBACK" });
  const r = await agent.respond("tell me something");
  assert.deepStrictEqual([r.text, r.source], ["FALLBACK", "fallback"]);
});

test("empty input yields an empty reply and is not remembered", async () => {
  const agent = await makeAgent();
  const r = await agent.respond("   ");
  assert.deepStrictEqual([r.text, r.source], ["", "empty"]);
  assert.strictEqual(agent.memory.conversation.size, 0);
});

test("normal turns are remembered; commands are not", async () => {
  const agent = await makeAgent();
  await agent.respond("1 + 1");
  await agent.respond("/memory");
  const turns = agent.memory.conversation.all();
  assert.deepStrictEqual(turns.map((t) => t.role), ["user", "bot"]);
  assert.strictEqual(turns[1].meta.ability, "calculator");
});

test("built-in commands: help, abilities, ability on/off, facts, forget, history, reset, set, samplers", async () => {
  const agent = await makeAgent();
  assert.match((await agent.respond("/help")).text, /\/facts/);
  assert.match((await agent.respond("/abilities")).text, /\[on\]\s+calculator/);
  await agent.respond("/ability calculator off");
  assert.notStrictEqual((await agent.respond("1 + 1")).ability, "calculator");
  await agent.respond("/ability calculator on");
  assert.strictEqual((await agent.respond("1 + 1")).ability, "calculator");

  await agent.respond("my name is Kim");
  assert.match((await agent.respond("/facts")).text, /name = Kim/);
  assert.match((await agent.respond("/history 2")).text, /user: my name is Kim/);
  assert.match((await agent.respond("/forget name")).text, /Forgot/);
  assert.match((await agent.respond("/facts")).text, /No facts/);
  await agent.respond("/reset");
  assert.strictEqual(agent.memory.conversation.size, 0);

  assert.match((await agent.respond("/set temperature 0.2")).text, /0\.2/);
  assert.strictEqual(agent.config.generation.temperature, 0.2);
  assert.match((await agent.respond("/set temperature abc")).text, /not a valid number/);
  assert.match((await agent.respond("/set sampler nope")).text, /Command failed: Unknown sampler/);
  assert.match((await agent.respond("/samplers")).text, /\* temperature/);
});

test("unknown slash text is treated as a normal message", async () => {
  const agent = await makeAgent();
  const r = await agent.respond("/definitely-not-a-command");
  assert.strictEqual(r.source, "fallback");
});

test("model generation runs when no ability matches; hooks can change sampling", async () => {
  const { model, tokenizer } = tinyModel();
  const agent = await makeAgent({ generation: { temperature: 0, sampler: "greedy" } }, { model, tokenizer });
  const r = await agent.respond("hi");
  assert.deepStrictEqual([r.text, r.source], ["hello there!", "model"]);

  await agent.plugins.register({
    name: "force-bye",
    setup(api) { api.on("generate:before", (g) => { g.text = "bye"; }); },
  });
  assert.strictEqual((await agent.respond("hi")).text, "goodbye!");

  await agent.plugins.register({
    name: "post",
    setup(api) { api.on("generate:after", (g) => { g.text = g.text.toUpperCase(); }); },
  });
  assert.strictEqual((await agent.respond("hi")).text, "GOODBYE!");
});

test("generate:before can answer directly via payload.response", async () => {
  const { model, tokenizer } = tinyModel();
  const agent = await makeAgent({}, { model, tokenizer });
  await agent.plugins.register({ name: "ans", setup(api) { api.on("generate:before", (g) => { g.response = "from plugin"; }); } });
  const r = await agent.respond("zzz");
  assert.deepStrictEqual([r.text, r.source], ["from plugin", "plugin"]);
});

test("a plugin sampler can be selected by config and is used for generation", async () => {
  const { model, tokenizer } = tinyModel();
  const agent = await makeAgent({ generation: { sampler: "always-eos" } }, { model, tokenizer });
  const EOS = tokenizer.id("<EOS>");
  await agent.plugins.register({ name: "eos", setup(api) { api.registerSampler("always-eos", () => EOS); } });
  const r = await agent.respond("hi"); // sampler stops immediately -> empty -> fallback
  assert.strictEqual(r.source, "fallback");
});

test("unknown sampler in config falls back to temperature instead of crashing", async () => {
  const { model, tokenizer } = tinyModel();
  const agent = await makeAgent({ generation: { sampler: "ghost", temperature: 0 } }, { model, tokenizer });
  assert.strictEqual((await agent.respond("hi")).source, "model");
});

test("samplers: argmax, greedy, temperature(0), topk behave", () => {
  const probs = [0.1, 0.6, 0.3];
  assert.strictEqual(argmax(probs), 1);
  assert.strictEqual(greedy(probs), 1);
  assert.strictEqual(temperature(probs, { temperature: 0 }), 1);
  assert.strictEqual(topk(probs, { topK: 1 }), 1);
  assert.strictEqual(topk(probs, { topK: 2, rng: () => 0 }), 1);
  const picks = new Set();
  for (let i = 0; i < 200; i++) picks.add(temperature(probs, { temperature: 1, rng: Math.random }));
  assert.ok(picks.size > 1);
});

test("an error thrown by an ability reaches the error hook and the chat continues", async () => {
  const agent = await makeAgent();
  const seen = [];
  agent.hooks.on("error", (p) => seen.push(`${p.stage}:${p.ability}`));
  agent.abilities.register({ name: "crash", priority: 50, patterns: [/^crash$/], run: () => { throw new Error("kaboom"); } });
  const r = await agent.respond("crash");
  assert.strictEqual(r.source, "fallback");
  assert.deepStrictEqual(seen, ["ability:crash"]);
});

test("an ability returning the wrong type is reported, not fatal", async () => {
  const agent = await makeAgent();
  agent.abilities.register({ name: "wrong", priority: 50, patterns: [/^wrong$/], run: () => 42 });
  assert.strictEqual((await agent.respond("wrong")).source, "fallback");
});

test("ability may return { text, meta } and meta reaches the result", async () => {
  const agent = await makeAgent();
  agent.abilities.register({ name: "rich", patterns: [/^rich$/], run: () => ({ text: "ok", meta: { score: 7 } }) });
  const r = await agent.respond("rich");
  assert.strictEqual(r.meta.score, 7);
});

test("async abilities are awaited", async () => {
  const agent = await makeAgent();
  agent.abilities.register({ name: "slow", patterns: [/^slow$/], run: async () => { await new Promise((r) => setTimeout(r, 10)); return "done"; } });
  assert.strictEqual((await agent.respond("slow")).text, "done");
});

test("memory persistence: shutdown saves, a new agent loads", async () => {
  const root = tempDir();
  const cfg = { memory: { persist: true, file: "memory/state.json" } };
  const a = await makeAgent(cfg, { rootDir: root });
  await a.respond("my name is Robin");
  await a.shutdown();
  assert.ok(fs.existsSync(path.join(root, "memory/state.json")));
  const b = await makeAgent(cfg, { rootDir: root });
  assert.strictEqual(b.memory.facts.get("name"), "Robin");
  assert.strictEqual((await b.respond("what is my name")).text, "Your name is Robin.");
});

test("conversation window respects memory.maxTurns", async () => {
  const agent = await makeAgent({ memory: { maxTurns: 4 } });
  for (let i = 0; i < 5; i++) await agent.respond(`${i} + 1`);
  assert.strictEqual(agent.memory.conversation.size, 4);
});

test("abilities.disabled in config switches built-ins off", async () => {
  const agent = await makeAgent({ abilities: { disabled: ["calculator"] } });
  assert.notStrictEqual((await agent.respond("1 + 1")).ability, "calculator");
});

test("the shipped trained model answers a trained prompt", async () => {
  const root = path.resolve(__dirname, "..");
  if (!fs.existsSync(path.join(root, "models/weights.json"))) return; // not trained yet
  const { MiniLLMAgent } = require("../src/engine/agent");
  const { createLogger } = require("../src/util/logger");
  const agent = await MiniLLMAgent.create({ rootDir: root, logger: createLogger({ level: "silent" }), config: { generation: { temperature: 0, sampler: "greedy" } } });
  const r = await agent.respond("thank you");
  assert.strictEqual(r.source, "model");
  assert.strictEqual(r.text, "you are welcome!");
});
