/**
 * loader.js
 * Loads user abilities from a folder. Every *.js or *.json file may export /
 * contain ONE ability definition or an ARRAY of them. Broken files are
 * reported and skipped; they never crash the agent.
 */
const fs = require("fs");
const path = require("path");

function loadAbilitiesFromDir(dir, registry, logger) {
  const loaded = [];
  const errors = [];
  if (!fs.existsSync(dir)) return { loaded, errors };

  const files = fs.readdirSync(dir).filter((f) => /\.(js|json)$/i.test(f)).sort();
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      let exported = full.endsWith(".json") ? JSON.parse(fs.readFileSync(full, "utf-8")) : require(full);
      if (exported && exported.default) exported = exported.default;
      const defs = Array.isArray(exported) ? exported : [exported];
      for (const def of defs) {
        const ability = registry.register(def, { source: `file:${file}` });
        loaded.push(ability.name);
      }
    } catch (error) {
      errors.push({ file, error: error.message });
      if (logger) logger.warn(`Could not load ability file "${file}": ${error.message}`);
    }
  }
  return { loaded, errors };
}

module.exports = { loadAbilitiesFromDir };
