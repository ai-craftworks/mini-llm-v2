/**
 * loss.js
 * -------
 * Softmax + Cross-Entropy loss, combined into one function because their
 * combined gradient has a beautifully simple form:
 *
 *   dLoss/dLogits = softmax(logits) - oneHot(target)
 *
 * See math.md -> "Cross-Entropy Loss" for the full derivation.
 */

const Matrix = require("./matrix");
const { softmaxRows } = require("./activations");

// logits: seqLen x vocabSize
// targetIds: array of length seqLen, the correct "next token" id for each position
function softmaxCrossEntropy(logits, targetIds) {
  const probs = softmaxRows(logits);
  const seqLen = logits.rows;
  let loss = 0;
  const dLogits = new Matrix(logits.rows, logits.cols);

  for (let i = 0; i < seqLen; i++) {
    const target = targetIds[i];
    const p = Math.max(probs.data[i][target], 1e-12);
    loss += -Math.log(p);
    for (let j = 0; j < logits.cols; j++) {
      const indicator = j === target ? 1 : 0;
      dLogits.data[i][j] = (probs.data[i][j] - indicator) / seqLen;
    }
  }

  loss /= seqLen;
  return { loss, dLogits, probs };
}

module.exports = { softmaxCrossEntropy };
