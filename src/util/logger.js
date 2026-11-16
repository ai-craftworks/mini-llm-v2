/**
 * logger.js
 * A tiny leveled logger. Levels: debug < info < warn < error < silent.
 * `sink(level, tag, args)` can replace console output (used by tests).
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function createLogger({ level = "warn", prefix = "", sink = null } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.warn;

  function emit(lvl, args) {
    if (LEVELS[lvl] < threshold) return;
    const tag = prefix ? `[${prefix}]` : "";
    if (sink) return sink(lvl, tag, args);
    const fn = lvl === "error" ? console.error : lvl === "warn" ? console.warn : console.log;
    fn(`[${lvl}]${tag}`, ...args);
  }

  return {
    level,
    debug: (...a) => emit("debug", a),
    info: (...a) => emit("info", a),
    warn: (...a) => emit("warn", a),
    error: (...a) => emit("error", a),
    child(childPrefix) {
      return createLogger({ level, prefix: prefix ? `${prefix}:${childPrefix}` : childPrefix, sink });
    },
  };
}

module.exports = { createLogger, LEVELS };
