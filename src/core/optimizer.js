/**
 * optimizer.js
 * ------------
 * Adam optimizer, implemented from scratch. Adam keeps a running
 * average of each parameter's gradient (m, "momentum") and of its
 * squared gradient (v), and uses them to adapt the effective learning
 * rate per-parameter. This converges much faster and more reliably
 * than plain gradient descent on a small, noisy dataset like ours.
 *
 * See math.md -> "Gradient Descent" and "Adam Optimizer".
 */

const Matrix = require("./matrix");

// Gradient clipping: if the combined size ("L2 norm") of every gradient
// value across every parameter exceeds maxNorm, shrink them all down
// proportionally. Without this, a few large gradients early in training
// can push weights (especially attention's Wq/Wk) to extreme values in
// one step. That makes softmax attention saturate into a hard one-hot
// pattern, which has an almost-exactly-zero gradient (see math.md ->
// "Vanishing Gradients & Gradient Clipping") — the network gets stuck
// with no way to recover. Clipping keeps every update gentle enough
// that this doesn't happen.
function clipGradients(params, maxNorm = 5.0) {
  let totalSq = 0;
  for (const { grad } of params) {
    for (let i = 0; i < grad.rows; i++) {
      for (let j = 0; j < grad.cols; j++) {
        totalSq += grad.data[i][j] * grad.data[i][j];
      }
    }
  }
  const norm = Math.sqrt(totalSq);
  if (norm > maxNorm) {
    const scale = maxNorm / norm;
    for (const { grad } of params) {
      for (let i = 0; i < grad.rows; i++) {
        for (let j = 0; j < grad.cols; j++) {
          grad.data[i][j] *= scale;
        }
      }
    }
  }
  return norm;
}

class Adam {
  constructor(params, lr = 0.01, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
    // params: array of { matrix, grad } references, as produced by
    // model.getParams(). We mutate `matrix.data` in place on each step.
    this.params = params;
    this.lr = lr;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.t = 0;
    this.m = params.map((p) => Matrix.zeros(p.matrix.rows, p.matrix.cols));
    this.v = params.map((p) => Matrix.zeros(p.matrix.rows, p.matrix.cols));
  }

  step({ clip = true, maxNorm = 5.0 } = {}) {
    if (clip) clipGradients(this.params, maxNorm);
    this.t++;
    const { beta1, beta2, eps, lr, t } = this;
    const biasCorrection1 = 1 - Math.pow(beta1, t);
    const biasCorrection2 = 1 - Math.pow(beta2, t);

    this.params.forEach(({ matrix, grad }, idx) => {
      const m = this.m[idx];
      const v = this.v[idx];
      for (let i = 0; i < matrix.rows; i++) {
        for (let j = 0; j < matrix.cols; j++) {
          const g = grad.data[i][j];
          m.data[i][j] = beta1 * m.data[i][j] + (1 - beta1) * g;
          v.data[i][j] = beta2 * v.data[i][j] + (1 - beta2) * g * g;

          const mHat = m.data[i][j] / biasCorrection1;
          const vHat = v.data[i][j] / biasCorrection2;

          matrix.data[i][j] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
        }
      }
    });
  }
}

module.exports = Adam;
module.exports.clipGradients = clipGradients;
