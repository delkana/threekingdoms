// Strategic AI benchmark: observer games, abstract battles for speed. Reports unification, stalls, attacks and captures.
// Usage: node tools/aibench.js [games] [years]
const fs = require('fs'), vm = require('vm'), path = require('path');
const era = process.env.ERA || 'threekingdoms';
const root = path.join(__dirname, '..', 'js');
const eraDir = path.join(root, 'eras', era);
const load = (f) => fs.readFileSync(path.join(fs.existsSync(path.join(eraDir, f)) ? eraDir : root, f), 'utf8');
const src = ['era.js', 'data.js', 'events.js', 'hexmaps.js', 'battle.js', 'game.js'].map(load).join('\n');
const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(ctx); vm.runInContext(src + '\nthis.Game = Game;', ctx); const { Game } = ctx;
const games = +(process.argv[2] || 10), years = +(process.argv[3] || 50);
let unified = 0, yearsSum = 0, battles = 0, captures = 0, stalls = 0, transfers = 0, churn = 0; const t0 = Date.now(); const ends = [];
for (let g = 0; g < games; g++) {
  Game.newGame(null); const S = Game.state(); S.options.tactical = false;
  let lastChange = S.turn, ownersKey = '', stalled = false; const lastFlip = {}; let prevOwner = Object.fromEntries(Object.values(S.provinces).map((p) => [p.id, p.owner]));
  for (let m = 0; m < years * 12; m++) {
    Game.endTurn();
    for (const p of Object.values(S.provinces)) if (p.owner !== prevOwner[p.id]) { if (lastFlip[p.id] != null && S.turn - lastFlip[p.id] <= 12) churn++; lastFlip[p.id] = S.turn; prevOwner[p.id] = p.owner; }
    const key = Object.values(S.provinces).map((p) => p.owner || '-').join(','); if (key !== ownersKey) { ownersKey = key; lastChange = S.turn; }
    if (S.turn - lastChange >= 120 && !stalled) { stalled = true; stalls++; }
    if (S.over) { unified++; yearsSum += S.year - 190; break; }
  }
  battles += S.stats.battles || 0; captures += S.stats.captures || 0; transfers += S.stats.transfers || 0;
  const alive = Object.values(S.factions).filter((f) => f.alive && !f.raider).map((f) => `${f.name}:${Game.factionProvinces(f.id).length}`);
  ends.push(S.over ? `won ${S.year}` : `${alive.length} houses (${alive.slice(0, 3).join(', ')})`);
}
console.log({ games, years, unified: `${unified}/${games}`, avgYearsToUnify: unified ? Math.round(yearsSum / unified) : null, stalls, battles, captures, captureRate: battles ? (captures / battles).toFixed(2) : null, recapturesWithinAYear: churn, seconds: Math.round((Date.now() - t0) / 1000) });
console.log(ends.join(' | '));
