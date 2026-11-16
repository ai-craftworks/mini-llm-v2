/**
 * logger plugin: records every exchange as a JSON line, to the console or a file.
 * Enable it:  plugins.builtin: ["stats", "logger"]
 * Settings:   plugins.settings.logger = { file: "logs/chat.log" }  (omit file for console)
 */
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "logger",
  version: "1.0.0",
  description: "Logs every exchange as JSON lines (console or file)",
  defaults: { file: null },
  setup(api) {
    const file = api.config.file ? api.agent.config.resolve(api.config.file) : null;
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (obj) => {
      const line = JSON.stringify({ time: new Date().toISOString(), ...obj });
      if (file) fs.appendFileSync(file, line + "\n");
      else console.error(line);
    };
    api.on("input:received", (p) => write({ event: "input", text: p.text }));
    api.on("response:final", (p) => write({ event: "response", text: p.text, source: p.source, ability: p.ability || null }), { priority: -100 });
    api.on("error", (p) => write({ event: "error", stage: p.stage, message: p.error.message }));
  },
};
