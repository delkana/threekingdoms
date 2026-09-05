// Headless balance harness: node tools/sim.js [years] [playerFaction] [runs]
const fs = require('fs');
const vm = require('vm');
const years = +process.argv[2] || 10;
const player = process.argv[3] || 'shixie';
const runs = +process.argv[4] || 1;

const src = fs.readFileSync(__dirname + '/../js/data.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../js/events.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../js/game.js', 'utf8');
const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.Game = Game; this.FACTIONS = FACTIONS;', ctx);
const { Game, FACTIONS } = ctx;

for (let run = 0; run < runs; run++) {
  Game.newGame(player);
  const S = Game.state();
  let battles = 0, captures = 0, famines = 0;
  const yearly = [];
  for (let t = 0; t < years * 12; t++) {
    const before = Object.fromEntries(Object.values(S.provinces).map((p) => [p.id, p.owner]));
    const logLen = S.log.length;
    Game.aiTurn(player); Game.endTurn();
    for (const p of Object.values(S.provinces)) if (before[p.id] !== p.owner) captures++;
    // fresh log entries are at the front
    const fresh = S.log.slice(0, Math.max(0, S.log.length - logLen + 40));
    battles += fresh.filter((l) => l.cls === 'war').length;
    famines += fresh.filter((l) => l.text.startsWith('Famine')).length;
    if (S.month === 1) {
      const alive = Object.values(S.factions).filter((f) => f.alive);
      const top = alive.map((f) => ({ f, n: Game.factionProvinces(f.id).length, tr: Game.totalTroops(f.id) })).sort((a, b) => b.n - a.n || b.tr - a.tr);
      const totalGold = Object.values(S.provinces).reduce((s, p) => s + p.gold, 0);
      const totalFood = Object.values(S.provinces).reduce((s, p) => s + p.food, 0);
      const totalTroops = Object.values(S.provinces).reduce((s, p) => s + p.troops, 0);
      yearly.push(`${S.year}: alive ${alive.length}, captures so far ${captures}, battles ${battles}, famines ${famines} | troops ${Math.round(totalTroops / 1000)}k gold ${Math.round(totalGold / 1000)}k food ${Math.round(totalFood / 1000)}k | ` +
        top.slice(0, 5).map((x) => `${x.f.name} ${x.n}c/${Math.round(x.tr / 1000)}k`).join(', '));
    }
    if (S.over) { yearly.push(`GAME OVER: ${S.over} in ${Game.dateStr()}`); break; }
  }
  console.log(`--- run ${run + 1} (player ${player}) ---`);
  console.log(yearly.join('\n'));
  const p = Game.factionProvinces(player)[0];
  if (p) console.log(`player city ${p.id}: troops ${p.troops} gold ${p.gold} food ${p.food} agri ${p.agri} comm ${p.comm} def ${p.defense}`);
}
