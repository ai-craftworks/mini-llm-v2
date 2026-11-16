/**
 * ability.js
 * defineAbility() validates a user-written ability definition and normalizes it.
 *
 * An ability is a small program that handles a message INSTEAD of the neural
 * network. Definition fields:
 *
 *   name         (required) unique id, letters/digits/-/_
 *   description  text shown by "help" and /abilities
 *   priority     number, higher runs first (default 0; built-ins use 10)
 *   enabled      default true
 *   examples     array of example phrases (documentation only)
 *
 *  HOW IT TRIGGERS (provide at least one):
 *   patterns     array of RegExp, or strings ("^ping$" or "/ping/i")
 *   keywords     array of words; triggers when any appears as a whole word
 *   match(input, ctx)   function; return falsy for "no", true/array/object for "yes"
 *
 *  WHAT IT DOES (provide one):
 *   run(ctx)     function (sync or async). Return a string, { text, meta }, or
 *                null/undefined/false to DECLINE (the next ability, or the model, tries).
 *   response / responses   declarative reply template(s), {{placeholders}} allowed
 *   remember     declarative facts to store, e.g. { name: "{{match.1}}" }
 */
const { render } = require("../util/template");
const { lookup } = require("../util/template");

function toRegExp(p, abilityName) {
  if (p instanceof RegExp) return new RegExp(p.source, p.flags.replace(/[gy]/g, ""));
  if (typeof p !== "string") throw new Error(`Ability "${abilityName}": patterns must be RegExp or string`);
  const literal = /^\/(.+)\/([a-z]*)$/.exec(p);
  if (literal) return new RegExp(literal[1], literal[2].replace(/[gy]/g, ""));
  return new RegExp(p, "i");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defineAbility(def) {
  if (!def || typeof def !== "object") throw new Error("Ability definition must be an object");
  const name = def.name;
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
    throw new Error(`Ability name must be letters/digits/-/_ (got ${JSON.stringify(name)})`);
  }

  const patterns = (def.patterns || []).map((p) => toRegExp(p, name));
  const keywords = (def.keywords || []).map(String);
  const matchFn = def.match;
  if (matchFn !== undefined && typeof matchFn !== "function") throw new Error(`Ability "${name}": match must be a function`);
  if (!patterns.length && !keywords.length && !matchFn) {
    throw new Error(`Ability "${name}" needs at least one of: patterns, keywords, match()`);
  }
  const keywordRegexes = keywords.map((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`, "i"));

  let run = def.run;
  if (run !== undefined && typeof run !== "function") throw new Error(`Ability "${name}": run must be a function`);
  if (!run) {
    const replies = def.responses || (def.response !== undefined ? [def.response] : null);
    if (!replies && !def.remember) throw new Error(`Ability "${name}" needs run(), response(s), or remember`);
    run = (ctx) => {
      const scope = {
        input: ctx.input,
        match: ctx.match,
        fact: ctx.facts.toObject(),
        date: ctx.now().toDateString(),
        time: ctx.now().toLocaleTimeString(),
      };
      if (def.remember) {
        for (const [k, v] of Object.entries(def.remember)) ctx.facts.set(k, render(v, scope), { source: `ability:${name}` });
        scope.fact = ctx.facts.toObject();
      }
      if (!replies) return "OK.";
      return render(replies[Math.floor(Math.random() * replies.length)], scope);
    };
  }

  return {
    name,
    description: def.description || "",
    priority: typeof def.priority === "number" ? def.priority : 0,
    enabled: def.enabled !== false,
    examples: def.examples || [],
    patterns,
    keywords,
    run,
    source: "manual",
    /** Returns a truthy match result, or null. */
    test(input, ctx) {
      for (const re of patterns) {
        const m = re.exec(input);
        if (m) return m;
      }
      for (let i = 0; i < keywordRegexes.length; i++) {
        const m = keywordRegexes[i].exec(input);
        if (m) return m;
      }
      if (matchFn) {
        const r = matchFn(input, ctx);
        if (!r) return null;
        return r === true ? [input] : r;
      }
      return null;
    },
  };
}

module.exports = { defineAbility, toRegExp, lookup };
