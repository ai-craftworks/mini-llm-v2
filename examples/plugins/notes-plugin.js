/**
 * Example: a "full" plugin. It registers a memory store, an ability that writes to it,
 * a command that reads it, and defines + fires a CUSTOM hook ("notes:saved").
 */
class NotesStore {
  constructor() { this.notes = []; }
  add(text) { this.notes.push({ text, at: Date.now() }); return this.notes.length; }
  toJSON() { return { notes: this.notes }; }
  loadJSON(o) { this.notes = o.notes || []; }
  clear() { this.notes = []; }
}

module.exports = {
  name: "notes",
  version: "1.0.0",
  description: "Take notes: 'note: buy milk', then /notes",
  setup(api) {
    const store = api.registerStore("notes", new NotesStore());
    api.defineHook("notes:saved");

    api.registerAbility({
      name: "take-note",
      description: "Saves a note: 'note: <text>'",
      priority: 15,
      patterns: [/^note:\s*(.+)$/i],
      run: async ({ match, agent }) => {
        const n = store.add(match[1]);
        await agent.hooks.run("notes:saved", { text: match[1], count: n });
        return `Saved note #${n}.`;
      },
    });

    api.registerCommand("notes", {
      description: "List saved notes",
      run: () => (store.notes.length ? store.notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n") : "No notes yet."),
    });
  },
};
