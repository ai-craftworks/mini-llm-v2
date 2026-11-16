/**
 * deepMerge.js
 * Recursively merge plain objects. Arrays and non-plain values in `source`
 * REPLACE the value in `target` (they are not merged). Neither input is mutated.
 */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = { deepMerge, isPlainObject };
