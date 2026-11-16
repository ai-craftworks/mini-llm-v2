/**
 * builtin/index.js
 * Abilities that ship with the project (priority 10). They are ordinary
 * ability definitions: read them as examples for writing your own.
 */
const { evaluate } = require("./mathParser");

const WORD_OPS = [
  [/\bmultiplied by\b|\btimes\b/g, "*"],
  [/\bdivided by\b|\bover\b/g, "/"],
  [/\bplus\b/g, "+"],
  [/\bminus\b/g, "-"],
  [/\bto the power of\b/g, "^"],
  [/[×x](?=\s*[\d(])/g, "*"],
  [/÷/g, "/"],
];

function extractExpression(input) {
  let s = input.toLowerCase().trim().replace(/[?=!]+$/g, "").trim();
  s = s.replace(/^(what is|what's|whats|calculate|calc|compute|solve)\s+/, "");
  for (const [re, rep] of WORD_OPS) s = s.replace(re, ` ${rep} `);
  s = s.trim();
  if (!/^[\d\s+\-*/%^().]+$/.test(s)) return null;
  if (!/\d/.test(s) || !/[+\-*/%^]/.test(s.replace(/^\s*[-+]/, ""))) return null;
  return s;
}

const calculator = {
  name: "calculator",
  description: "Does arithmetic: 2 + 3 * 4, (10 - 4) / 3, what is 7 times 8",
  priority: 10,
  examples: ["2 + 2", "what is 12 * (3 + 4)", "10 divided by 4"],
  match: (input) => {
    const expr = extractExpression(input);
    return expr ? { expr } : null;
  },
  run: ({ match }) => {
    try {
      const value = evaluate(match.expr);
      if (!Number.isFinite(value)) return "That result is not a finite number.";
      return `${match.expr.replace(/\s+/g, " ")} = ${Number(value.toFixed(10))}`;
    } catch (e) {
      return `I could not calculate that: ${e.message}.`;
    }
  },
};

const datetime = {
  name: "datetime",
  description: "Tells the current time or date",
  priority: 10,
  examples: ["what time is it", "what's the date"],
  patterns: [
    /\bwhat(?:'s| is)?\s+(?:the\s+)?time\b/i,
    /\bwhat\s+time\s+is\s+it\b/i,
    /\bcurrent\s+time\b/i,
    /\bwhat(?:'s| is)?\s+(?:the\s+|today'?s\s+)?(?:date|day)\b/i,
    /\bwhat\s+day\s+is\s+(?:it|today)\b/i,
  ],
  run: ({ input, now }) => {
    const d = now();
    const wantsDate = /date|day/i.test(input) && !/time/i.test(input);
    return wantsDate ? `Today is ${d.toDateString()}.` : `It is ${d.toLocaleTimeString()}.`;
  },
};

const remember = {
  name: "remember",
  description: "Remembers facts about you: 'my name is Sam', 'remember my city is Paris'",
  priority: 10,
  examples: ["my name is Sam", "call me Sam", "remember my favorite color is blue"],
  match: (input) => {
    let m = /\b(?:my name is|call me|i am called)\s+([a-z][\w'-]*(?:\s+[a-z][\w'-]*)?)/i.exec(input);
    if (m) return { key: "name", value: m[1].trim() };
    m = /^remember (?:that )?my ([\w ]+?) is (.+?)[.!]*$/i.exec(input.trim());
    if (m) return { key: m[1].trim(), value: m[2].trim() };
    return null;
  },
  run: ({ match, facts }) => {
    facts.set(match.key, match.value, { source: "ability:remember" });
    if (match.key === "name") return `Nice to meet you, ${match.value}! I will remember your name.`;
    return `Got it. I will remember that your ${match.key} is ${match.value}.`;
  },
};

const recall = {
  name: "recall",
  description: "Recalls remembered facts: 'what is my name', 'what do you know about me'",
  priority: 10,
  examples: ["what is my name", "who am i", "what do you remember about me"],
  match: (input) => {
    const s = input.trim().replace(/[?!.]+$/g, "");
    if (/^(?:what do you (?:remember|know) about me|what have i told you)$/i.test(s)) return { all: true };
    if (/^(?:who am i|do you (?:know|remember) my name)$/i.test(s)) return { key: "name" };
    const m = /^(?:what(?:'s| is)|do you (?:know|remember)) my ([\w ]+)$/i.exec(s);
    return m ? { key: m[1].trim() } : null;
  },
  run: ({ match, facts }) => {
    if (match.all) {
      if (!facts.size) return "I do not know anything about you yet. Try 'my name is ...'.";
      return "Here is what I remember: " + Object.entries(facts.toObject()).map(([k, v]) => `${k} = ${v}`).join(", ") + ".";
    }
    if (facts.has(match.key)) return `Your ${match.key} is ${facts.get(match.key)}.`;
    return `I do not know your ${match.key} yet. Tell me with 'remember my ${match.key} is ...'.`;
  },
};

const forget = {
  name: "forget",
  description: "Forgets facts: 'forget my name', 'forget everything'",
  priority: 10,
  examples: ["forget my name", "forget everything"],
  match: (input) => {
    const s = input.trim().replace(/[?!.]+$/g, "");
    if (/^forget (?:everything|all)(?: about me)?$/i.test(s)) return { all: true };
    const m = /^forget my ([\w ]+)$/i.exec(s);
    return m ? { key: m[1].trim() } : null;
  },
  run: ({ match, facts }) => {
    if (match.all) { facts.clear(); return "Done. I have forgotten everything I knew about you."; }
    return facts.delete(match.key) ? `Okay, I forgot your ${match.key}.` : `I did not know your ${match.key} anyway.`;
  },
};

const conversationRecall = {
  name: "conversation-recall",
  description: "Remembers what you said earlier in this chat: 'what did I just say'",
  priority: 10,
  examples: ["what did i just say", "what did i say before"],
  patterns: [/^what did i (?:just )?(?:say|ask)(?: before| earlier)?\??$/i],
  run: ({ conversation }) => {
    const previous = conversation.recent("user", 1); // 0 is the current message
    return previous ? `You said: "${previous.text}"` : "You have not said anything before that.";
  },
};

const help = {
  name: "help",
  description: "Lists what I can do",
  priority: 10,
  examples: ["help", "what abilities do you have"],
  patterns: [/^help\??$/i, /^(?:what|list)\b.*\babilities\b/i],
  run: ({ agent }) => {
    const lines = agent.abilities.list({ includeDisabled: false }).map((a) => `- ${a.name}: ${a.description || "(no description)"}`);
    return `I can chat (neural network) and I have these abilities:\n${lines.join("\n")}\nType /help for commands.`;
  },
};

module.exports = [calculator, datetime, remember, recall, forget, conversationRecall, help];
module.exports.extractExpression = extractExpression;
