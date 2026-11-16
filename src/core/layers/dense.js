/**
 * dense.js
 * --------
 * A fully-connected ("linear") layer: out = X * W + b
 *   X: (n x inputSize)   - one row per token/sample
 *   W: (inputSize x outputSize) - learned weight matrix
 *   b: (1 x outputSize)  - learned bias, broadcast to every row
 *
 * This single building block is reused for the feed-forward network
 * inside each transformer block AND for the final output projection
 * that turns hidden vectors into vocabulary logits.
 *
 * See math.md -> "Dense / Linear layers" and "Backpropagation".
 */

const Matrix = require("../matrix");

class Dense {
  constructor(inputSize, outputSize) {
    // Small random init scaled by 1/sqrt(inputSize) keeps initial
    // activations from exploding or vanishing (see math.md).
    const scale = 1 / Math.sqrt(inputSize);
    this.W = Matrix.random(inputSize, outputSize, scale);
    this.b = Matrix.zeros(1, outputSize);
    this.dW = Matrix.zeros(inputSize, outputSize);
    this.db = Matrix.zeros(1, outputSize);
    this.lastInput = null;
  }

  forward(X) {
    this.lastInput = X;
    return Matrix.add(Matrix.multiply(X, this.W), this.b);
  }

  // dOut: n x outputSize gradient of the loss w.r.t. this layer's output.
  // Returns dX: n x inputSize gradient to keep propagating backward.
  backward(dOut) {
    const XT = Matrix.transpose(this.lastInput);
    this.dW.copyFrom(Matrix.multiply(XT, dOut));
    this.db.copyFrom(dOut.sumRows());
    const WT = Matrix.transpose(this.W);
    return Matrix.multiply(dOut, WT);
  }

  getParams() {
    return [
      { matrix: this.W, grad: this.dW },
      { matrix: this.b, grad: this.db },
    ];
  }
}

module.exports = Dense;
