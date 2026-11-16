/**
 * samplers.js
 * A sampler turns the model's probability list into ONE chosen token id.
 *   sampler(probs, { temperature, topK, rng, step, generated }) => tokenId
 * Built-ins: "temperature" (default), "greedy", "topk". Plugins add more.
 */
function argmax(probs) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return best;
}

function drawFrom(weights, rng) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

const temperature = (probs, { temperature = 1, rng = Math.random } = {}) => {
  if (temperature <= 0.0001) return argmax(probs);
  return drawFrom(probs.map((p) => Math.pow(Math.max(p, 1e-12), 1 / temperature)), rng);
};

const greedy = (probs) => argmax(probs);

const topk = (probs, { topK = 5, temperature = 1, rng = Math.random } = {}) => {
  const ranked = probs.map((p, id) => [p, id]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(1, topK));
  if (temperature <= 0.0001) return ranked[0][1];
  const weights = ranked.map(([p]) => Math.pow(Math.max(p, 1e-12), 1 / temperature));
  return ranked[drawFrom(weights, rng)][1];
};

class SamplerRegistry {
  constructor() {
    this.samplers = new Map();
    this.builtin = new Set(["temperature", "greedy", "topk"]);
    this.samplers.set("temperature", temperature);
    this.samplers.set("greedy", greedy);
    this.samplers.set("topk", topk);
  }

  register(name, fn) {
    if (typeof fn !== "function") throw new Error(`Sampler "${name}" must be a function`);
    if (this.samplers.has(name)) throw new Error(`Sampler "${name}" already exists`);
    this.samplers.set(name, fn);
  }

  unregister(name) {
    if (this.builtin.has(name)) return false;
    return this.samplers.delete(name);
  }

  get(name) {
    const fn = this.samplers.get(name);
    if (!fn) throw new Error(`Unknown sampler "${name}". Available: ${this.list().join(", ")}`);
    return fn;
  }

  list() {
    return [...this.samplers.keys()];
  }
}

module.exports = { SamplerRegistry, argmax, temperature, greedy, topk };
