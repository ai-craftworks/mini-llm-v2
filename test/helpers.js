const fs = require("fs");
const os = require("os");
const path = require("path");
const { MiniLLMAgent } = require("../src/engine/agent");
const { createLogger } = require("../src/util/logger");

/** A fresh, empty project folder (so tests never touch your real abilities/plugins). */
function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mini-llm-test-"));
}

/** Agent with no model, no plugins and silent logging, unless overridden. */
async function makeAgent(overrides = {}, options = {}) {
  const rootDir = options.rootDir || tempDir();
  return MiniLLMAgent.create({
    rootDir,
    loadModel: false,
    logger: createLogger({ level: "silent" }),
    config: { plugins: { builtin: [] }, ...overrides },
    ...options,
  });
}

module.exports = { tempDir, makeAgent };
