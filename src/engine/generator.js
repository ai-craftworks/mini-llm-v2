/**
 * generator.js
 * Autoregressive text generation with the trained network:
 *   <BOS> user words <SEP>  ->  predict a token, append it, repeat until <EOS>.
 */
const { softmaxRows } = require("../core/activations");

function generateText({ model, tokenizer, text, sampler, temperature = 0.7, maxNewTokens = 20, topK = 5, rng = Math.random }) {
  const BOS = tokenizer.id("<BOS>");
  const SEP = tokenizer.id("<SEP>");
  const EOS = tokenizer.id("<EOS>");

  // The model has a fixed context size (maxLen). Keep the END of long inputs.
  let userIds = tokenizer.encode(text);
  const maxUser = Math.max(1, model.maxLen - 3);
  if (userIds.length > maxUser) userIds = userIds.slice(userIds.length - maxUser);

  const ids = [BOS, ...userIds, SEP];
  const generated = [];

  for (let step = 0; step < maxNewTokens; step++) {
    if (ids.length >= model.maxLen) break;
    const logits = model.forward(ids);
    const last = logits.data[logits.rows - 1];
    const probs = softmaxRows({ rows: 1, cols: last.length, data: [last] }).data[0];
    const next = sampler(probs, { temperature, topK, rng, step, generated });
    if (next === EOS) break;
    generated.push(next);
    ids.push(next);
  }
  return { text: tokenizer.decode(generated), tokens: generated };
}

module.exports = { generateText };
