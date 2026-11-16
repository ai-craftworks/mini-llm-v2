/**
 * activations.js
 * --------------
 * Non-linear activation functions and their derivatives, plus the
 * row-wise softmax used for turning scores into probabilities.
 * See math.md -> "Activation Functions" and "Softmax".
 */

const Matrix = require("./matrix");

function relu(m) {
  return m.map((v) => (v > 0 ? v : 0));
}

// Given the ORIGINAL input to relu (pre-activation) and the upstream
// gradient dOut, compute the gradient flowing back through relu.
function reluBackward(preActivation, dOut) {
  const result = new Matrix(dOut.rows, dOut.cols);
  for (let i = 0; i < dOut.rows; i++) {
    for (let j = 0; j < dOut.cols; j++) {
      result.data[i][j] = preActivation.data[i][j] > 0 ? dOut.data[i][j] : 0;
    }
  }
  return result;
}

// Leaky ReLU: like ReLU, but negative inputs get a small non-zero slope
// instead of being flattened to exactly 0. Plain ReLU units can get
// "stuck" forever if a unit's pre-activation goes negative for every
// training example (its gradient is then always exactly 0, so it can
// never recover). Leaky ReLU keeps a tiny gradient alive so units can
// still learn their way back. See math.md -> "Leaky ReLU".
const LEAK = 0.01;

function leakyRelu(m) {
  return m.map((v) => (v > 0 ? v : LEAK * v));
}

function leakyReluBackward(preActivation, dOut) {
  const result = new Matrix(dOut.rows, dOut.cols);
  for (let i = 0; i < dOut.rows; i++) {
    for (let j = 0; j < dOut.cols; j++) {
      const slope = preActivation.data[i][j] > 0 ? 1 : LEAK;
      result.data[i][j] = slope * dOut.data[i][j];
    }
  }
  return result;
}

function tanhMatrix(m) {
  return m.map((v) => Math.tanh(v));
}

function tanhBackward(tanhOutput, dOut) {
  // d/dx tanh(x) = 1 - tanh(x)^2
  const result = new Matrix(dOut.rows, dOut.cols);
  for (let i = 0; i < dOut.rows; i++) {
    for (let j = 0; j < dOut.cols; j++) {
      const t = tanhOutput.data[i][j];
      result.data[i][j] = (1 - t * t) * dOut.data[i][j];
    }
  }
  return result;
}

// Row-wise softmax with the standard "subtract max" trick for numerical
// stability. Rows containing -Infinity (from causal masking) are handled
// correctly because Math.exp(-Infinity) === 0.
function softmaxRows(m) {
  const result = new Matrix(m.rows, m.cols);
  for (let i = 0; i < m.rows; i++) {
    let max = -Infinity;
    for (let j = 0; j < m.cols; j++) {
      if (m.data[i][j] > max) max = m.data[i][j];
    }
    let sum = 0;
    const exps = new Array(m.cols);
    for (let j = 0; j < m.cols; j++) {
      const e = Math.exp(m.data[i][j] - max);
      exps[j] = e;
      sum += e;
    }
    for (let j = 0; j < m.cols; j++) {
      result.data[i][j] = exps[j] / sum;
    }
  }
  return result;
}

// Backprop through a row-wise softmax.
// Given softmax OUTPUT S and upstream gradient dS (same shape), returns
// the gradient with respect to the softmax INPUT (pre-softmax scores).
//   dz_j = s_j * (dS_j - sum_k(dS_k * s_k))
function softmaxRowsBackward(S, dS) {
  const result = new Matrix(S.rows, S.cols);
  for (let i = 0; i < S.rows; i++) {
    let dot = 0;
    for (let k = 0; k < S.cols; k++) dot += dS.data[i][k] * S.data[i][k];
    for (let j = 0; j < S.cols; j++) {
      result.data[i][j] = S.data[i][j] * (dS.data[i][j] - dot);
    }
  }
  return result;
}

module.exports = {
  relu,
  reluBackward,
  leakyRelu,
  leakyReluBackward,
  tanhMatrix,
  tanhBackward,
  softmaxRows,
  softmaxRowsBackward,
};
