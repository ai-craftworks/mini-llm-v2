/**
 * registry.js
 * Holds every ability and decides which ones apply to a message.
 */
const { defineAbility } = require("./ability");

class AbilityRegistry {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.abilities = new Map();
    this._seq = 0;
  }

  register(def, { source = "manual", replace = false } = {}) {
    const ability = defineAbility(def);
    if (this.abilities.has(ability.name) && !replace) {
      throw new Error(`Ability "${ability.name}" is already registered (existing source: ${this.abilities.get(ability.name).source})`);
    }
    ability.source = source;
    ability._order = this._seq++;
    this.abilities.set(ability.name, ability);
    return ability;
  }

  unregister(name) {
    return this.abilities.delete(name);
  }

  get(name) {
    return this.abilities.get(name) || null;
  }

  has(name) {
    return this.abilities.has(name);
  }

  enable(name) {
    const a = this.get(name);
    if (!a) throw new Error(`Unknown ability "${name}"`);
    a.enabled = true;
  }

  disable(name) {
    const a = this.get(name);
    if (!a) throw new Error(`Unknown ability "${name}"`);
    a.enabled = false;
  }

  /** All abilities, highest priority first. */
  list({ includeDisabled = true } = {}) {
    return [...this.abilities.values()]
      .filter((a) => includeDisabled || a.enabled)
      .sort((a, b) => b.priority - a.priority || a._order - b._order);
  }

  /** Enabled abilities whose trigger matches `input`, best first: [{ ability, match }]. */
  candidates(input, ctx) {
    const out = [];
    for (const ability of this.list({ includeDisabled: false })) {
      try {
        const match = ability.test(input, ctx);
        if (match) out.push({ ability, match });
      } catch (error) {
        if (this.logger) this.logger.warn(`Ability "${ability.name}" trigger failed: ${error.message}`);
      }
    }
    return out;
  }
}

module.exports = { AbilityRegistry };
