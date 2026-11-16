/**
 * template.js
 * Minimal {{placeholder}} renderer used by declarative (JSON) abilities.
 *
 *   {{match.1}}          -> value looked up by dotted path in `scope`
 *   {{fact.name|friend}} -> same, but "friend" if the value is missing
 *
 * Missing values without a default render as an empty string.
 */
function lookup(scope, path) {
  let cur = scope;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function render(template, scope) {
  return String(template).replace(/\{\{\s*([\w.\-]+)(?:\|([^}]*))?\s*\}\}/g, (_, path, fallback) => {
    const value = lookup(scope, path);
    if (value === undefined || value === null || value === "") return fallback !== undefined ? fallback.trim() : "";
    return String(value);
  });
}

module.exports = { render, lookup };
