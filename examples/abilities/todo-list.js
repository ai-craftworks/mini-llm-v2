/**
 * Example: an ability with its OWN memory store.
 * Try: "add buy milk to my todo list", "show my todo list", "clear my todo list"
 * Copy this file into abilities/ to enable it.
 */
class TodoStore {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  clear() { this.items = []; }
  toJSON() { return { items: this.items }; }
  loadJSON(obj) { this.items = obj.items || []; }
}

const store = new TodoStore();
let registered = false;

module.exports = {
  name: "todo-list",
  description: "Keeps a todo list: 'add X to my todo list', 'show my todo list'",
  priority: 15,
  match: (input) => {
    let m = /^add (.+) to my (?:todo|to-do) list$/i.exec(input.trim());
    if (m) return { action: "add", item: m[1] };
    if (/^show my (?:todo|to-do) list$/i.test(input.trim())) return { action: "show" };
    if (/^clear my (?:todo|to-do) list$/i.test(input.trim())) return { action: "clear" };
    return null;
  },
  run: ({ match, memory }) => {
    if (!registered) { // register the store with the agent's memory once (so it can be saved)
      if (!memory.getStore("todos")) memory.registerStore("todos", store);
      registered = true;
    }
    if (match.action === "add") { store.add(match.item); return `Added "${match.item}". You have ${store.items.length} item(s).`; }
    if (match.action === "clear") { store.clear(); return "Todo list cleared."; }
    return store.items.length ? "Your todo list:\n" + store.items.map((x, i) => `${i + 1}. ${x}`).join("\n") : "Your todo list is empty.";
  },
};
