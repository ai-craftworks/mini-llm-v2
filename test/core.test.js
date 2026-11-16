const test = require("node:test");
const assert = require("node:assert");
const Matrix = require("../src/core/matrix");
const { Tokenizer, splitIntoWords } = require("../src/core/tokenizer");
const { trainModel } = require("../src/engine/trainer");
const { generateText } = require("../src/engine/generator");
const { greedy } = require("../src/engine/samplers");

test("Matrix.multiply matches the hand-worked example", () => {
  const a = Matrix.fromArray2D([[1, 2], [3, 4]]);
  const b = Matrix.fromArray2D([[5, 6], [7, 8]]);
  assert.deepStrictEqual(Matrix.multiply(a, b).data, [[19, 22], [43, 50]]);
});

test("Matrix.multiply rejects mismatched shapes", () => {
  assert.throws(() => Matrix.multiply(Matrix.zeros(2, 3), Matrix.zeros(2, 3)), /shape mismatch/);
});

test("Matrix.add broadcasts a 1-row matrix", () => {
  const a = Matrix.fromArray2D([[1, 2, 3], [4, 5, 6]]);
  const b = Matrix.fromRowVector([100, 200, 300]);
  assert.deepStrictEqual(Matrix.add(a, b).data, [[101, 202, 303], [104, 205, 306]]);
});

test("Matrix.transpose, scale, sumRows, copyFrom keeps identity", () => {
  const a = Matrix.fromArray2D([[1, 2, 3], [4, 5, 6]]);
  assert.deepStrictEqual(Matrix.transpose(a).data, [[1, 4], [2, 5], [3, 6]]);
  assert.deepStrictEqual(Matrix.scale(a, 2).data[1], [8, 10, 12]);
  assert.deepStrictEqual(a.sumRows().data, [[5, 7, 9]]);
  const target = Matrix.zeros(1, 1);
  const same = target.copyFrom(Matrix.fromArray2D([[9, 9]]));
  assert.strictEqual(same, target);
  assert.deepStrictEqual(target.data, [[9, 9]]);
});

test("splitIntoWords separates punctuation and lowercases", () => {
  assert.deepStrictEqual(splitIntoWords("Hi there!"), ["hi", "there", "!"]);
  assert.deepStrictEqual(splitIntoWords("   "), []);
});

test("Tokenizer encodes, decodes, uses <UNK>, and round-trips through JSON", () => {
  const t = new Tokenizer();
  t.buildVocab(["hi", "hello there !"]);
  assert.strictEqual(t.vocabSize, 5 + 4);
  assert.deepStrictEqual(t.encode("hi there!"), [5, 7, 8]);
  assert.strictEqual(t.encode("bye")[0], t.id("<UNK>"));
  assert.strictEqual(t.decode([1, 5, 7, 8, 3]), "hi there!");
  const t2 = new Tokenizer();
  t2.loadJSON(JSON.parse(JSON.stringify(t.toJSON())));
  assert.deepStrictEqual(t2.encode("hello"), t.encode("hello"));
});

test("training with the same seed is exactly reproducible", () => {
  const pairs = [["hi", "hello !"]];
  const hyper = { epochs: 5, lr: 0.01, dModel: 8, dHidden: 16, layers: 1, clipNorm: 5 };
  const a = trainModel({ pairs, hyper, seed: 3 });
  const b = trainModel({ pairs, hyper, seed: 3 });
  const c = trainModel({ pairs, hyper, seed: 4 });
  assert.deepStrictEqual(a.history, b.history);
  assert.notDeepStrictEqual(a.history, c.history);
});

test("trainModel actually learns: loss falls and the model reproduces a trained reply", () => {
  const pairs = [["hi", "hello there !"], ["bye", "goodbye !"], ["thanks", "you are welcome !"]];
  const { model, tokenizer, history } = trainModel({
    pairs, seed: 7, hyper: { epochs: 250, lr: 0.01, dModel: 16, dHidden: 32, layers: 1, clipNorm: 5 },
  });
  assert.ok(history[history.length - 1] < history[0] * 0.25, `loss ${history[0]} -> ${history[history.length - 1]}`);
  const out = generateText({ model, tokenizer, text: "hi", sampler: greedy, maxNewTokens: 10 });
  assert.strictEqual(out.text, "hello there!");
});
