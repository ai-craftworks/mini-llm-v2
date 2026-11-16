/**
 * embedding.js
 * ------------
 * An embedding layer is just a big lookup table: one row of numbers
 * (a "vector") per possible token id. Row `i` of `this.weights` IS the
 * learned vector representation of token `i`.
 *
 * Used twice in this project:
 *   - token embedding: maps word-id -> meaning vector
 *   - positional embedding: maps position-in-sequence -> position vector
 *
 * See math.md -> "Embeddings".
 */

const Matrix = require("../matrix");

class Embedding {
  constructor(vocabSize, dModel) {
    this.vocabSize = vocabSize;
    this.dModel = dModel;
    this.weights = Matrix.random(vocabSize, dModel, 0.1);
    this.grad = Matrix.zeros(vocabSize, dModel);
    this.lastIds = null;
  }

  // ids: array of integers, e.g. [3, 17, 2] for a 3-token sequence
  // returns: seqLen x dModel matrix, one row per token
  forward(ids) {
    this.lastIds = ids;
    const out = new Matrix(ids.length, this.dModel);
    for (let i = 0; i < ids.length; i++) {
      out.data[i] = this.weights.data[ids[i]].slice();
    }
    return out;
  }

  // dOut: seqLen x dModel gradient flowing back into the embedded vectors.
  // We scatter-add each row's gradient back into the row of `grad` that
  // corresponds to the token id used at that position (a token used
  // twice in a sequence accumulates gradient from both positions).
  backward(dOut) {
    for (let i = 0; i < this.lastIds.length; i++) {
      const id = this.lastIds[i];
      const gradRow = this.grad.data[id];
      for (let j = 0; j < this.dModel; j++) {
        gradRow[j] += dOut.data[i][j];
      }
    }
  }

  zeroGrad() {
    this.grad = Matrix.zeros(this.vocabSize, this.dModel);
  }

  getParams() {
    return [{ matrix: this.weights, grad: this.grad }];
  }
}

module.exports = Embedding;
