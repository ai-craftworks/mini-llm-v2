/** Numerical gradient checking: proves every hand-written backward() is correct. */
const test = require("node:test");
const assert = require("node:assert");
const MiniLLM = require("../src/core/model");
const { softmaxCrossEntropy } = require("../src/core/loss");

test("analytical gradients match numerical gradients", () => {
  const model = new MiniLLM({ vocabSize: 12, dModel: 8, dHidden: 16, maxLen: 10, numLayers: 2 });
  const input = [1, 2, 3, 4, 5];
  const target = [2, 3, 4, 5, 6];
  const lossOf = () => softmaxCrossEntropy(model.forward(input), target).loss;

  const { dLogits } = softmaxCrossEntropy(model.forward(input), target);
  model.zeroGrad();
  model.backward(dLogits);

  const eps = 1e-5;
  let worst = 0;
  for (const { matrix, grad } of model.getParams()) {
    for (let s = 0; s < 4; s++) {
      const i = Math.floor(Math.random() * matrix.rows);
      const j = Math.floor(Math.random() * matrix.cols);
      const orig = matrix.data[i][j];
      matrix.data[i][j] = orig + eps; const plus = lossOf();
      matrix.data[i][j] = orig - eps; const minus = lossOf();
      matrix.data[i][j] = orig;
      const numeric = (plus - minus) / (2 * eps);
      const analytic = grad.data[i][j];
      worst = Math.max(worst, Math.abs(numeric - analytic) / (Math.abs(numeric) + Math.abs(analytic) + 1e-8));
    }
  }
  assert.ok(worst < 1e-2, `max relative error ${worst}`);
});
