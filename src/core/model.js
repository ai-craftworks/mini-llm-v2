/**
 * model.js
 * --------
 * Wires together every piece into one small language model:
 *
 *   token ids
 *      |
 *      v
 *   token embedding  +  positional embedding
 *      |
 *      v
 *   TransformerBlock x N   (attention + feed-forward, causal)
 *      |
 *      v
 *   output projection (Dense: dModel -> vocabSize)
 *      |
 *      v
 *   logits (one row per position, one column per vocabulary word)
 *
 * The logits are turned into a probability distribution over the next
 * token by softmax (done in loss.js during training, and in chat.js
 * during generation).
 */

const Matrix = require("./matrix");
const Embedding = require("./layers/embedding");
const Dense = require("./layers/dense");
const LayerNorm = require("./layers/layerNorm");
const TransformerBlock = require("./layers/transformerBlock");

class MiniLLM {
  constructor({ vocabSize, dModel, dHidden, maxLen, numLayers }) {
    this.vocabSize = vocabSize;
    this.dModel = dModel;
    this.dHidden = dHidden;
    this.maxLen = maxLen;
    this.numLayers = numLayers;

    this.tokenEmbed = new Embedding(vocabSize, dModel);
    this.posEmbed = new Embedding(maxLen, dModel);
    this.blocks = [];
    for (let i = 0; i < numLayers; i++) {
      this.blocks.push(new TransformerBlock(dModel, dHidden));
    }
    // Final LayerNorm after the last block (standard practice with
    // pre-norm transformers) so the output projection always sees a
    // nicely-scaled input regardless of how many blocks came before.
    this.finalNorm = new LayerNorm(dModel);
    this.outputProj = new Dense(dModel, vocabSize);
  }

  // ids: array of token ids, length = seqLen (seqLen must be <= maxLen)
  // returns: seqLen x vocabSize matrix of raw logits
  forward(ids) {
    const tok = this.tokenEmbed.forward(ids);
    const positions = ids.map((_, i) => i);
    const pos = this.posEmbed.forward(positions);
    let X = Matrix.add(tok, pos);

    for (const block of this.blocks) {
      X = block.forward(X);
    }
    X = this.finalNorm.forward(X);

    return this.outputProj.forward(X);
  }

  // dLogits: seqLen x vocabSize gradient of the loss w.r.t. the logits
  backward(dLogits) {
    let dX = this.outputProj.backward(dLogits);
    dX = this.finalNorm.backward(dX);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      dX = this.blocks[i].backward(dX);
    }
    this.tokenEmbed.backward(dX);
    this.posEmbed.backward(dX);
  }

  getParams() {
    return [
      ...this.tokenEmbed.getParams(),
      ...this.posEmbed.getParams(),
      ...this.blocks.flatMap((b) => b.getParams()),
      ...this.finalNorm.getParams(),
      ...this.outputProj.getParams(),
    ];
  }

  zeroGrad() {
    for (const { grad } of this.getParams()) {
      for (let i = 0; i < grad.rows; i++) grad.data[i].fill(0);
    }
  }

  // Serialize all learned weights to a plain JS object (JSON-able).
  toJSON() {
    return {
      config: {
        vocabSize: this.vocabSize,
        dModel: this.dModel,
        dHidden: this.dHidden,
        maxLen: this.maxLen,
        numLayers: this.numLayers,
      },
      params: this.getParams().map((p) => p.matrix.data),
    };
  }

  loadJSON(obj) {
    const params = this.getParams();
    obj.params.forEach((data, idx) => {
      params[idx].matrix.data = data;
    });
  }
}

module.exports = MiniLLM;
