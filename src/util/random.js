/**
 * random.js
 * mulberry32: a tiny seedable pseudo-random generator, so training can be
 * reproduced exactly:  node cli.js train --seed 42
 * Returns a function that yields floats in [0, 1) like Math.random.
 */
function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { createRng };
