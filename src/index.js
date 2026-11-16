/** Public API: require("./src") */
const { MiniLLMAgent } = require("./engine/agent");
const { defineAbility } = require("./abilities/ability");
const { loadConfig, DEFAULTS } = require("./engine/config");
const { trainModel, saveModel, loadModel } = require("./engine/trainer");
const { loadConversations } = require("./engine/dataset");
const { ConversationMemory } = require("./memory/conversationMemory");
const { FactMemory } = require("./memory/factMemory");
const { BUILTIN_HOOKS } = require("./plugins/hooks");

module.exports = {
  MiniLLMAgent, defineAbility, loadConfig, DEFAULTS, trainModel, saveModel, loadModel,
  loadConversations, ConversationMemory, FactMemory, BUILTIN_HOOKS,
};
