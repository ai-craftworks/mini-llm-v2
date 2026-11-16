/**
 * transformerBlock.js
 * -------------------
 * One full transformer "block": attention lets tokens exchange
 * information, then a per-token feed-forward network lets the model
 * think about what it just gathered.
 *
 * This uses the "Pre-Norm" layout (LayerNorm BEFORE each sub-layer,
 * not after), the same layout modern transformers like GPT-2 use:
 *
 *   X -> LayerNorm -> SelfAttention -> (+X)         = Y
 *   Y -> LayerNorm -> Dense->LeakyReLU->Dense -> (+Y) = out
 *
 * Why this matters (see math.md -> "Pre-Norm vs Post-Norm"): the
 * residual path carries the RAW, un-normalized signal all the way
 * through the network. Normalizing before each sub-layer (instead of
 * after the residual add) keeps that raw path fully intact, which
 * makes gradients much better behaved and training far more reliable
 * — the original 2017 "post-norm" design is known to be difficult to
 * train without extra tricks like learning-rate warmup.
 */

const Matrix = require("../matrix");
const SelfAttention = require("./selfAttention");
const Dense = require("./dense");
const LayerNorm = require("./layerNorm");
const { leakyRelu, leakyReluBackward } = require("../activations");

class TransformerBlock {
  constructor(dModel, dHidden) {
    this.attn = new SelfAttention(dModel);
    this.ln1 = new LayerNorm(dModel);
    this.ff1 = new Dense(dModel, dHidden);
    this.ff2 = new Dense(dHidden, dModel);
    this.ln2 = new LayerNorm(dModel);
  }

  forward(X) {
    this.X = X;

    const norm1 = this.ln1.forward(X);
    const attnOut = this.attn.forward(norm1);
    const Y = Matrix.add(X, attnOut); // residual carries raw X forward

    const norm2 = this.ln2.forward(Y);
    this.norm2 = norm2;
    const ffPreRelu = this.ff1.forward(norm2);
    this.ffPreRelu = ffPreRelu;
    const ffHidden = leakyRelu(ffPreRelu);
    const ffOut = this.ff2.forward(ffHidden);

    const out = Matrix.add(Y, ffOut); // residual carries raw Y forward
    return out;
  }

  backward(dOut) {
    // out = Y + ffOut -> gradient passes to BOTH branches unchanged
    const dY_fromResidual = dOut;
    const dFfOut = dOut;

    const dFfHidden = this.ff2.backward(dFfOut);
    const dFfPreRelu = leakyReluBackward(this.ffPreRelu, dFfHidden);
    const dNorm2 = this.ff1.backward(dFfPreRelu);
    const dY_fromFF = this.ln2.backward(dNorm2);

    const dY = Matrix.add(dY_fromResidual, dY_fromFF);

    // Y = X + attnOut -> gradient passes to BOTH branches unchanged
    const dX_fromResidual = dY;
    const dAttnOut = dY;

    const dNorm1 = this.attn.backward(dAttnOut);
    const dX_fromAttn = this.ln1.backward(dNorm1);

    return Matrix.add(dX_fromResidual, dX_fromAttn);
  }

  getParams() {
    return [
      ...this.attn.getParams(),
      ...this.ln1.getParams(),
      ...this.ff1.getParams(),
      ...this.ff2.getParams(),
      ...this.ln2.getParams(),
    ];
  }
}

module.exports = TransformerBlock;
