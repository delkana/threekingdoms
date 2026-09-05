// Endgame diagnostic: run 50-year observer games and report unification, stalls (ten years with no city changing hands
// between the surviving houses), realm fragmentation and the treaties that hold a stall in place.
// Usage: node tools/endgame.js [runs]
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..', 'js');
const src = ['data.js', 'events.js', 'game.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.Game = Game;', ctx);
const { Game } = ctx;
const runs = +(process.argv[2] || 8);

function fragmentation(S) {
  let split = 0, houses = 0;
  for (const f of Object.values(S.factions)) {
    if (!f.alive || f.raider) continue;
    const mine = Game.factionProvinces(f.id); if (mine.length < 3) continue;
    houses++;
    const own = new Set(mine.map((p) => p.id)); const seen = new Set(); let k = 0;
    for (const p of mine) {
      if (seen.has(p.id)) continue;
      k++; const q = [p.id]; seen.add(p.id);
      while (q.length) { const x = q.pop(); for (const n of S.adj[x]) if (own.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    }
    if (k > 1) split++;
  }
  return `${split}/${houses} split`;
}
const top = (S, n) => Object.values(S.factions).filter((f) => f.alive && !f.raider).map((f) => [f.name, Game.factionProvinces(f.id).length]).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x.join(' ')).join(', ');

let unifiedCount = 0, stalls = 0;
for (let r = 0; r < runs; r++) {
  Game.newGame(null); const S = Game.state();
  let sig = null, since = 0, unified = null, stall = '';
  for (let y = 0; y < 50 && !unified; y++) {
    for (let t = 0; t < 12; t++) Game.endTurn();
    const alive = Object.values(S.factions).filter((f) => f.alive && !f.raider && !f.guest).sort((a, b) => Game.factionProvinces(b.id).length - Game.factionProvinces(a.id).length);
    if (alive.length <= 1) { unified = S.year; break; }
    const s = alive.map((f) => f.id + Game.factionProvinces(f.id).length).join(',');
    if (s === sig) since++; else { sig = s; since = 0; }
    if (since >= 10 && !stall) {
      const treaties = [];
      for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) { const st = Game.treatyStatus(alive[i].id, alive[j].id); if (st !== 'neutral') treaties.push(`${alive[i].name}-${alive[j].name}:${st}`); }
      stall = `${S.year} STALL ${alive.map((f) => `${f.name} ${Game.factionProvinces(f.id).length} (${f.phase || 'rising'})`).join(' | ')} treaties: ${treaties.join(', ') || 'none'}`;
      stalls++;
    }
  }
  if (unified) unifiedCount++;
  console.log(`r${r} unified: ${unified || 'no by ' + S.year} | ${fragmentation(S)} | top: ${top(S, 3)}${stall ? '\n    ' + stall : ''}`);
}
console.log(`\nunified ${unifiedCount}/${runs} within 50 years, ${stalls} ten-year stalls`);
