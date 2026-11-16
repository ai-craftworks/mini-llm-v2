/**
 * selfAttention.js
 * ----------------
 * Single-head causal (masked) self-attention — the mechanism that lets
 * the model look back at earlier tokens in the sequence and decide how
 * much "attention" to pay to each one when predicting the next token.
 *
 * Steps (see math.md -> "Self-Attention" for the full derivation):
 *   1. Project input X into Queries (Q), Keys (K), Values (V)
 *   2. scores = Q * K^T / sqrt(dModel)
 *   3. Apply a causal mask: position i may only attend to positions <= i
 *      (a token can't "see the future" — this is what makes it useful
 *      for next-token prediction / language generation)
 *   4. weights = softmax(scores) row-wise
 *   5. context = weights * V
 *   6. output = context * Wo
 */

const Matrix = require("../matrix");
const { softmaxRows, softmaxRowsBackward } = require("../activations");

class SelfAttention {
  constructor(dModel) {
    this.dModel = dModel;
    const scale = 1 / Math.sqrt(dModel);
    this.Wq = Matrix.random(dModel, dModel, scale);
    this.Wk = Matrix.random(dModel, dModel, scale);
    this.Wv = Matrix.random(dModel, dModel, scale);
    this.Wo = Matrix.random(dModel, dModel, scale);

    this.dWq = Matrix.zeros(dModel, dModel);
    this.dWk = Matrix.zeros(dModel, dModel);
    this.dWv = Matrix.zeros(dModel, dModel);
    this.dWo = Matrix.zeros(dModel, dModel);
  }

  forward(X) {
    this.X = X;
    const seqLen = X.rows;

    this.Q = Matrix.multiply(X, this.Wq);
    this.K = Matrix.multiply(X, this.Wk);
    this.V = Matrix.multiply(X, this.Wv);

    const rawScores = Matrix.multiply(this.Q, Matrix.transpose(this.K));
    const scaled = Matrix.scale(rawScores, 1 / Math.sqrt(this.dModel));

    // Causal mask: position i cannot attend to position j > i.
    for (let i = 0; i < seqLen; i++) {
      for (let j = i + 1; j < seqLen; j++) {
        scaled.data[i][j] = -Infinity;
      }
    }

    this.attnWeights = softmaxRows(scaled); // seqLen x seqLen
    this.context = Matrix.multiply(this.attnWeights, this.V); // seqLen x dModel
    const out = Matrix.multiply(this.context, this.Wo);
    return out;
  }

  // dOut: seqLen x dModel, gradient w.r.t. this block's output
  backward(dOut) {
    const contextT = Matrix.transpose(this.context);
    this.dWo.copyFrom(Matrix.multiply(contextT, dOut));
    const dContext = Matrix.multiply(dOut, Matrix.transpose(this.Wo));

    // context = attnWeights * V
    const dAttnWeights = Matrix.multiply(dContext, Matrix.transpose(this.V));
    const dV = Matrix.multiply(Matrix.transpose(this.attnWeights), dContext);

    // backprop through the row-wise softmax
    const dScaled = softmaxRowsBackward(this.attnWeights, dAttnWeights);
    const dScores = Matrix.scale(dScaled, 1 / Math.sqrt(this.dModel));

    // scores = Q * K^T
    const dQ = Matrix.multiply(dScores, this.K);
    const dK = Matrix.multiply(Matrix.transpose(dScores), this.Q);

    // Q = X*Wq, K = X*Wk, V = X*Wv
    const XT = Matrix.transpose(this.X);
    this.dWq.copyFrom(Matrix.multiply(XT, dQ));
    this.dWk.copyFrom(Matrix.multiply(XT, dK));
    this.dWv.copyFrom(Matrix.multiply(XT, dV));

    const dX_fromQ = Matrix.multiply(dQ, Matrix.transpose(this.Wq));
    const dX_fromK = Matrix.multiply(dK, Matrix.transpose(this.Wk));
    const dX_fromV = Matrix.multiply(dV, Matrix.transpose(this.Wv));

    return Matrix.add(Matrix.add(dX_fromQ, dX_fromK), dX_fromV);
  }

  getParams() {
    return [
      { matrix: this.Wq, grad: this.dWq },
      { matrix: this.Wk, grad: this.dWk },
      { matrix: this.Wv, grad: this.dWv },
      { matrix: this.Wo, grad: this.dWo },
    ];
  }
}

module.exports = SelfAttention;
