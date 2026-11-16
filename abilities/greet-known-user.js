/**
 * Example of an ability that DECLINES. If I know the user's name it greets them
 * personally; otherwise it returns null and the neural network answers instead.
 */
module.exports = {
  name: "greet-known-user",
  description: "Greets you by name once I know it",
  priority: 20, // above the built-ins, so it gets the first look
  patterns: [/^(?:hi|hello|hey)[!. ]*$/i],
  run: ({ facts }) => {
    const name = facts.get("name");
    if (!name) return null; // decline -> next ability / the model
    return `Hello again, ${name}! Good to see you.`;
  },
};
