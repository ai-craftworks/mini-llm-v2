/**
 * trainer.js
 * Builds the vocabulary, trains the network (next-token prediction with
 * teacher forcing + Adam), and saves/loads trained models.
 */
const fs = require("fs");
const path = require("path");
const { Tokenizer } = require("../core/tokenizer");
const MiniLLM = require("../core/model");
const Adam = require("../core/optimizer");
const { softmaxCrossEntropy } = require("../core/loss");
const Matrix = require("../core/matrix");
const { createRng } = require("../util/random");

function buildSequences(pairs, tokenizer) {
  const BOS = tokenizer.id("<BOS>");
  const SEP = tokenizer.id("<SEP>");
  const EOS = tokenizer.id("<EOS>");
  return pairs.map(([user, bot]) => [BOS, ...tokenizer.encode(user), SEP, ...tokenizer.encode(bot), EOS]);
}

/**
 * @param {Array<[string,string]>} pairs
 * @param {object} hyper { epochs, lr, dModel, dHidden, layers, clipNorm }
 * @param {function} onEpoch (epoch, avgLoss) => void
 * @param {number} seed optional; same seed + same data = identical training run
 * @returns {{ model, tokenizer, history: number[] }}
 */
function trainModel({ pairs, hyper, onEpoch = () => {}, seed }) {
  const previousRng = Matrix.rng;
  const rng = seed === undefined ? Math.random : createRng(seed);
  Matrix.rng = rng; // weight initialisation uses this source
  try {
    return runTraining({ pairs, hyper, onEpoch, rng });
  } finally {
    Matrix.rng = previousRng;
  }
}

function runTraining({ pairs, hyper, onEpoch, rng }) {
  const tokenizer = new Tokenizer();
  tokenizer.buildVocab(pairs.flat());
  const sequences = buildSequences(pairs, tokenizer);
  const maxLen = Math.max(...sequences.map((s) => s.length)) + 2;

  const model = new MiniLLM({
    vocabSize: tokenizer.vocabSize, dModel: hyper.dModel, dHidden: hyper.dHidden, maxLen, numLayers: hyper.layers,
  });
  const optimizer = new Adam(model.getParams(), hyper.lr);
  const history = [];

  for (let epoch = 1; epoch <= hyper.epochs; epoch++) {
    const order = sequences.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let total = 0;
    for (const idx of order) {
      const seq = sequences[idx];
      const logits = model.forward(seq.slice(0, -1));
      const { loss, dLogits } = softmaxCrossEntropy(logits, seq.slice(1));
      model.zeroGrad();
      model.backward(dLogits);
      optimizer.step({ clip: true, maxNorm: hyper.clipNorm || 5 });
      total += loss;
    }
    const avg = total / sequences.length;
    history.push(avg);
    onEpoch(epoch, avg);
  }
  return { model, tokenizer, history };
}

function saveModel(file, model, tokenizer, meta = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ model: model.toJSON(), tokenizer: tokenizer.toJSON(), meta: { trainedAt: new Date().toISOString(), ...meta } }));
}

function loadModel(file) {
  const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
  const tokenizer = new Tokenizer();
  tokenizer.loadJSON(saved.tokenizer);
  const model = new MiniLLM(saved.model.config);
  model.loadJSON(saved.model);
  return { model, tokenizer, meta: saved.meta || {} };
}

module.exports = { trainModel, saveModel, loadModel, buildSequences };
