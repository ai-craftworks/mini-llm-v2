/** stats plugin: counts replies by source and exposes /stats. */
module.exports = {
  name: "stats",
  version: "1.0.0",
  description: "Counts replies by source (ability / model / ...) and adds the /stats command",
  setup(api) {
    const s = api.state;
    s.total = 0;
    s.bySource = {};
    s.byAbility = {};
    api.on("response:final", (p) => {
      s.total++;
      s.bySource[p.source] = (s.bySource[p.source] || 0) + 1;
      if (p.ability) s.byAbility[p.ability] = (s.byAbility[p.ability] || 0) + 1;
    }, { priority: -100 }); // run last, after other plugins changed the payload
    api.registerCommand("stats", {
      description: "Reply statistics for this session",
      run: () => {
        const lines = [`replies: ${s.total}`];
        for (const [k, v] of Object.entries(s.bySource)) lines.push(`  from ${k}: ${v}`);
        for (const [k, v] of Object.entries(s.byAbility)) lines.push(`  ability ${k}: ${v}`);
        return lines.join("\n");
      },
    });
  },
};
