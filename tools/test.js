// Headless test suite. Run with: node tools/test.js
// Loads the game scripts in a sandbox and checks data integrity, long simulations and the main systems.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..', 'js');
const src = ['data.js', 'events.js', 'hexmaps.js', 'battle.js', 'game.js', 'geo.js', 'terrain.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const ctx = { localStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = v; } }, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.Game = Game; this.PROVINCES = PROVINCES; this.FACTIONS = FACTIONS; this.OFFICERS = OFFICERS; this.ROADS = ROADS; this.HISTORICAL_DEATHS = HISTORICAL_DEATHS; this.LATER_OFFICERS = LATER_OFFICERS; this.ITEMS = ITEMS; this.EVENTS = EVENTS; this.OBJECTIVES = OBJECTIVES; this.SCENARIOS = SCENARIOS; this.INITIAL_RELATIONS = INITIAL_RELATIONS; this.OFFICER_SKILLS = OFFICER_SKILLS; this.OFFICER_TIES = OFFICER_TIES; this.SCENARIO_CREATED = SCENARIO_CREATED; this.TERRAIN = TERRAIN; this.GEO = GEO; this.MAP = MAP; this.BATTLE = BATTLE; this.HEXMAPS = HEXMAPS;', ctx);
const G = ctx;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 2).join('\n       ')); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };

console.log('data integrity');
test('every road joins two known cities and the map is connected', () => {
  const ids = new Set(G.PROVINCES.map((p) => p.id));
  for (const [a, b] of G.ROADS) assert(ids.has(a) && ids.has(b), `road ${a}-${b}`);
  const adj = {}; for (const [a, b] of G.ROADS) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  const seen = new Set([G.PROVINCES[0].id]); const q = [G.PROVINCES[0].id];
  while (q.length) { const x = q.pop(); for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
  assert(seen.size === G.PROVINCES.length, 'disconnected cities: ' + G.PROVINCES.filter((p) => !seen.has(p.id)).map((p) => p.id));
});
test('the real-geography map renders and every city stands on land', () => {
  assert(G.GEO.land.length >= 3 && G.GEO.rivers.length >= 50 && G.GEO.lakes.length >= 5, 'geo data');
  for (const p of G.PROVINCES) { assert(p.x >= 0 && p.x <= G.MAP.W && p.y >= 0 && p.y <= G.MAP.H, `${p.id} off canvas`); assert(!G.TERRAIN.isSea(p.x, p.y), `${p.id} is in the sea`); }
  assert(G.TERRAIN.isSea(...G.MAP.project(122.5, 35)), 'Yellow Sea is sea'); assert(!G.TERRAIN.isSea(...G.MAP.project(112, 34)), 'the central plain is land');
  assert(G.TERRAIN.svg().length > 50000, 'svg');
});
test('cities do not overlap on the canvas', () => {
  for (let i = 0; i < G.PROVINCES.length; i++) for (let j = i + 1; j < G.PROVINCES.length; j++) { const a = G.PROVINCES[i], b = G.PROVINCES[j]; assert(Math.abs(a.x - b.x) >= 98 || Math.abs(a.y - b.y) >= 44, `${a.id} overlaps ${b.id}`); }
});
test('every faction city exists and is owned once; every ruler sits in his own city', () => {
  const ids = new Set(G.PROVINCES.map((p) => p.id)); const owners = {};
  for (const f of G.FACTIONS) for (const c of f.cities) { assert(ids.has(c), `${f.id} city ${c}`); assert(!owners[c], `double owner ${c}`); owners[c] = f.id; }
  for (const f of G.FACTIONS) { const r = G.OFFICERS.find((o) => o[0] === f.ruler); assert(r && r[6] === f.id && f.cities.includes(r[7]), `ruler ${f.ruler} misplaced`); }
});
test('officers are unique, placed in real cities, with birth years', () => {
  const ids = new Set(G.PROVINCES.map((p) => p.id)); const names = new Set();
  for (const o of G.OFFICERS) { assert(!names.has(o[0]), 'duplicate ' + o[0]); names.add(o[0]); assert(ids.has(o[7]), `${o[0]} city ${o[7]}`); assert(typeof o[9] === 'number', `${o[0]} birth year`); }
  for (const r of G.LATER_OFFICERS) { assert(!names.has(r[0]), 'later officer clashes: ' + r[0]); assert(ids.has(r[8]), `${r[0]} city`); }
});
test('scripted deaths, skills, ties and item owners name real officers', () => {
  const names = new Set([...G.OFFICERS.map((o) => o[0]), ...G.LATER_OFFICERS.map((r) => r[0]), ...G.SCENARIO_CREATED.map((c) => c[0])]);
  for (const d of G.HISTORICAL_DEATHS) assert(names.has(d[0]), 'death of unknown ' + d[0]);
  for (const n of Object.keys(G.OFFICER_SKILLS)) assert(names.has(n), 'skills for unknown ' + n);
  for (const g of G.OFFICER_TIES.bonds) for (const n of g) assert(names.has(n), 'bond for unknown ' + n);
  for (const it of G.ITEMS) if (it.owner) assert(names.has(it.owner), 'item owner unknown ' + it.owner);
  const ids = new Set(G.PROVINCES.map((p) => p.id));
  for (const it of G.ITEMS) if (it.city) assert(ids.has(it.city), 'item city unknown ' + it.city);
});
test('relations and scenarios reference real houses and cities', () => {
  const fids = new Set(G.FACTIONS.map((f) => f.id)); const ids = new Set(G.PROVINCES.map((p) => p.id));
  for (const r of G.INITIAL_RELATIONS) assert(fids.has(r[0]) && fids.has(r[1]), 'relation ' + r);
  for (const sc of G.SCENARIOS) if (sc.houses) for (const [fid, h] of Object.entries(sc.houses)) for (const c of h.cities || []) assert(ids.has(c.replace('?', '')), `${sc.id} ${fid} city ${c}`);
});

console.log('systems');
test('a fresh game has a valid ruler for every house and the Emperor with Dong Zhuo', () => {
  G.Game.newGame(null); const S = G.Game.state();
  for (const f of Object.values(S.factions)) { const r = S.officers[f.ruler]; assert(r && r.faction === f.id, `ruler ${f.ruler}`); }
  assert(S.factions.dongzhuo.hasEmperor, 'emperor');
});
test('battle: a 1.4 strength ratio wins most of the time', () => {
  let wins = 0; const n = 60;
  for (let i = 0; i < n; i++) { G.Game.newGame('caocao'); const S = G.Game.state(); S.options.tactical = false; S.provinces.xiaopei.troops = 10000; S.provinces.xiaopei.defense = 200; S.provinces.chenliu.troops = 40000; S.provinces.chenliu.food = 1e6; const r = G.Game.attack('chenliu', 'xiaopei', ['Xiahou Dun', 'Cao Ren', 'Xun Yu'], 30000); assert(r.ok, r.msg); if (r.report.result === 'captured') wins++; }
  assert(wins / n > 0.8, `win rate ${wins}/${n}`);
});
test('tactical battle: sieges resolve within four months and reach the map; player battles wait, save and auto-fight', () => {
  for (const id of Object.keys(G.HEXMAPS)) assert(G.HEXMAPS[id].terrain.length === 156 && G.HEXMAPS[id].exits.length >= 1, `hex map ${id}`);
  let captured = 0, days = 0;
  for (let i = 0; i < 6; i++) {
    G.Game.newGame(null); const S = G.Game.state(); S.provinces.chenliu.troops = 30000; S.provinces.chenliu.food = 200000; S.provinces.xuchang.troops = 8000; S.provinces.xuchang.owner = 'yuanshu';
    for (const o of G.Game.factionOfficers('caocao')) o.acted = false;
    const r = G.Game.attack('chenliu', 'xuchang', ['Xiahou Dun', 'Cao Ren', 'Xun Yu'], 25000);
    assert(r.ok && r.report && r.report.tactical, 'AI-vs-AI battle resolves at once: ' + JSON.stringify(r).slice(0, 80));
    assert(!S.battles.xuchang, 'battle cleared'); if (r.report.result === 'captured') { captured++; assert(S.provinces.xuchang.owner === 'caocao', 'owner changed'); }
    const last = r.report.lines[r.report.lines.length - 1]; const m = last && last.text.match(/Day (\d+)/); if (m) days = Math.max(days, +m[1]);
  }
  assert(captured >= 3, `captures ${captured}/6`); assert(days <= 125, 'siege length ' + days);
  G.Game.newGame('caocao'); const S = G.Game.state(); S.provinces.chenliu.troops = 30000; S.provinces.chenliu.food = 99999;
  const r = G.Game.attack('chenliu', 'xuchang', ['Xiahou Dun', 'Cao Ren'], 20000); assert(r.ok && r.battle === 'xuchang' && S.battles.xuchang, 'player battle created');
  assert(G.Game.battleBeginDay('xuchang').ok && S.battles.xuchang.phase === 'player', 'day begins for the player');
  G.Game.save(); assert(G.Game.load() && G.Game.state().battles.xuchang, 'battle survives save and load');
  assert(G.Game.battleAutoMonth('xuchang').ok, 'auto month');
});
test('champions, letters, ransom and favours: duels and defections happen in sieges; favours are owed and repaid', () => {
  let duels = 0, letters = 0, lines = 0;
  for (let i = 0; i < 12; i++) {
    G.Game.newGame(null); const S = G.Game.state(); S.provinces.chenliu.troops = 30000; S.provinces.chenliu.food = 200000; S.provinces.chenliu.gold = 3000; S.provinces.xuchang.owner = 'yuanshu'; S.provinces.xuchang.troops = 12000; S.provinces.xuchang.gold = 3000;
    const ys = G.Game.factionOfficers('yuanshu').filter((o) => !G.Game.isRuler(o)).slice(0, 3); for (const o of ys) { o.city = 'xuchang'; o.acted = false; o.loyalty = 50; }
    for (const o of G.Game.factionOfficers('caocao')) o.acted = false;
    const r = G.Game.attack('chenliu', 'xuchang', ['Xiahou Dun', 'Cao Ren', 'Xun Yu'], 25000); assert(r.ok && r.report, 'battle');
    for (const l of r.report.lines) { lines++; if (/crosses arms|declines/.test(l.text)) duels++; if (/letters/.test(l.text)) letters++; }
  }
  assert(duels >= 1, `duels or challenges ${duels} in ${lines} lines`); assert(letters >= 1, `letters ${letters}`);
  // favours: an ally who marches is owed one; a gift of 400 repays it
  G.Game.newGame('caocao'); const S = G.Game.state(); S.provinces.chenliu.troops = 30000; S.provinces.chenliu.food = 99999; S.provinces.xuchang.owner = 'yuanshu'; S.provinces.xuchang.troops = 9000; S.provinces.runan.owner = 'sunjian'; S.provinces.runan.troops = 20000;
  const sj = G.Game.factionOfficers('sunjian').filter((o) => !G.Game.isRuler(o)).slice(0, 2); for (const o of sj) { o.city = 'runan'; o.acted = false; }
  S.diplomacy['caocao|sunjian'] = { status: 'alliance', until: S.turn + 60, rel: 80 };
  for (const o of G.Game.factionOfficers('caocao')) o.acted = false;
  assert(G.Game.attack('chenliu', 'xuchang', ['Xiahou Dun', 'Cao Ren'], 21000).ok, 'player battle');
  let got = false; for (let i = 0; i < 30 && !got; i++) { S.battles.xuchang.att.asked = false; for (const o of sj) o.acted = false; if (/from Sun Jian/.test(G.Game.battleMessengers('xuchang', { own: [], allies: ['sunjian'] }).msg)) got = true; }
  assert(got && G.Game.favorsOwed('caocao', 'sunjian') === 1, 'favour owed after aid');
  S.provinces.chenliu.gold = 1000; assert(G.Game.sendGift('caocao', 'sunjian', 'chenliu', 400).ok && G.Game.favorsOwed('caocao', 'sunjian') === 0, 'gift repays the favour');
  assert(G.Game.sendGift('caocao', 'sunjian', 'chenliu', 0, 2000).ok, 'a gift of food');
  // ransom price and the loyalty gate on recruitment
  const o = G.Game.off('Ji Ling'); assert(G.Game.ransomPrice(o) > 300, 'ransom price'); o.loyalty = 95; assert(G.Game.captiveChance('caocao', o) === 0, 'a loyal man of a living house cannot be recruited'); o.loyalty = 40; assert(G.Game.captiveChance('caocao', o) > 0, 'a wavering one can');
});
test('outstations: every city can raise something; they pay, are held and sacked in battle, and stay ruined until rebuilt', () => {
  G.Game.newGame(null);
  for (const id of Object.keys(G.HEXMAPS)) assert(G.Game.availableSites(id).some((a) => a.ok), `${id} has no ground for any outstation`);
  G.Game.newGame('caocao'); const S = G.Game.state(); const p = S.provinces.chenliu; p.gold = 20000;
  const offs = G.Game.factionOfficers('caocao').filter((o) => !G.Game.isRuler(o));
  for (const a of G.Game.availableSites('chenliu')) { if (!a.ok) continue; const o = offs.find((x) => !x.acted && x.city === 'chenliu'); if (!o) break; assert(G.Game.buildSite('chenliu', o.name, a.type).ok, 'build ' + a.type); }
  assert(p.sites.length >= 3, 'sites built ' + p.sites.length);
  for (const st of p.sites) { const t = G.HEXMAPS.chenliu.terrain[st.r * 13 + st.c]; assert(!'CWG~lrs'.includes(t), `${st.type} stands on ${t}`); }
  const gold0 = p.gold; for (const o of offs) o.acted = true; G.Game.endTurn(); assert(p.gold > gold0, 'outstations pay');
  S.provinces.puyang.owner = 'yuanshao'; S.provinces.puyang.troops = 40000; S.provinces.puyang.food = 90000; p.troops = 8000;
  const ys = G.Game.factionOfficers('yuanshao').filter((o) => !G.Game.isRuler(o)).slice(0, 3); for (const o of ys) { o.city = 'puyang'; o.acted = false; }
  assert(G.Game.attack('puyang', 'chenliu', ys.map((o) => o.name), 30000).ok, 'attack'); const B = S.battles.chenliu; assert(B.sites.length === p.sites.length, 'sites on the field');
  for (let d = 0; d < 30 && S.battles.chenliu; d++) G.Game.battleEndDay('chenliu', true);
  const sacked = B.log.filter((l) => /to the torch/.test(l.text)).length; assert(sacked >= 1, 'the AI sacks'); assert(p.sites.filter((s) => s.damaged).length === sacked, 'ruins persist');
  const ruined = p.sites.findIndex((s) => s.damaged); p.owner = 'caocao'; const o2 = G.Game.factionOfficers('caocao').find((o) => !G.Game.isRuler(o) && !o.captive); o2.city = 'chenliu'; o2.acted = false; p.gold = 5000;
  const rr = G.Game.repairSite('chenliu', o2.name, ruined); assert(rr.ok && !p.sites[ruined].damaged, 'rebuilt: ' + rr.msg);
});
test('treaties block attacks; broken treaties cost reputation', () => {
  G.Game.newGame('caocao'); const S = G.Game.state();
  S.diplomacy['caocao|yuanshao'] = { rel: 0, status: 'ceasefire', until: 99, cooldown: 0 };
  const r = G.Game.attack('chenliu', 'ye', ['Xiahou Dun'], 1000); assert(!r.ok, 'attack should be blocked');
  G.Game.breakTreaty('caocao', 'yuanshao'); assert(S.factions.caocao.treachery === 1, 'treachery');
});
test('exile: a wandering lord survives the loss of his last city', () => {
  let survived = 0;
  for (let i = 0; i < 5; i++) { G.Game.newGame(null); const S = G.Game.state(); S.provinces.pingyuan.troops = 100; S.provinces.pingyuan.defense = 0; S.provinces.ye.troops = 40000; for (let t = 0; t < 24 && S.factions.liubei.alive && S.provinces.pingyuan.owner === 'liubei'; t++) G.Game.endTurn(); if (S.factions.liubei.alive) survived++; }
  assert(survived >= 3, `Liu Bei survived ${survived}/5`);
});
test('items: search finds hidden treasures and stats move with them', () => {
  G.Game.newGame('liubei'); const S = G.Game.state(); S.items['art-of-war'].city = 'pingyuan';
  const before = S.officers['Liu Bei'].int; let tries = 0;
  while (!S.items['art-of-war'].owner && tries < 60) { tries++; for (const o of G.Game.factionOfficers('liubei')) o.acted = false; G.Game.search('pingyuan', 'Liu Bei'); }
  assert(S.items['art-of-war'].owner === 'Liu Bei', 'not found'); assert(S.officers['Liu Bei'].int === before + 5, 'INT bonus');
  G.Game.bestow('pingyuan', 'Liu Bei', 'Guan Yu'); assert(S.items['art-of-war'].owner === 'Guan Yu' && S.officers['Liu Bei'].int === before, 'bestow');
});
test('ranks, titles and order behave', () => {
  G.Game.newGame('caocao'); const S = G.Game.state(); S.provinces.chenliu.gold = 9000;
  assert(G.Game.appoint('chenliu', 'Xiahou Dun').ok, 'appoint'); assert(S.officers['Xiahou Dun'].rank === 1, 'rank');
  S.provinces.chenliu.order = 10; assert(!G.Game.recruitTroops('chenliu', 'Cao Ren').ok, 'levy blocked by disorder');
  assert(G.Game.pacify('chenliu', 'Xun Yu').ok && S.provinces.chenliu.order > 10, 'pacify');
  S.factions.caocao.prestige = 40; for (const c of ['xuchang', 'puyang', 'xiaopei', 'runan', 'luoyang', 'wan', 'xiapi']) S.provinces[c].owner = 'caocao';
  assert(G.Game.eligibleTitle('caocao') >= 2, 'eligible for Duke'); assert(G.Game.assumeTitle('caocao', 2).ok && S.factions.caocao.title === 2, 'assume');
});
test('every scenario starts consistent and runs ten years without error', () => {
  for (const sc of G.SCENARIOS) {
    G.Game.newGame(null, { scenario: sc.id }); const S = G.Game.state();
    assert(S.year === sc.year, sc.id + ' year');
    for (const f of Object.values(S.factions)) if (f.alive) { const r = S.officers[f.ruler]; assert(r && r.faction === f.id, `${sc.id}: ruler ${f.ruler} of ${f.id}`); }
    for (let t = 0; t < 120; t++) G.Game.endTurn();
    for (const f of Object.values(S.factions)) if (f.alive) { const r = S.officers[f.ruler]; assert(r && r.faction === f.id, `${sc.id} after 10y: ruler ${f.ruler}`); }
  }
});
test('thirty-year observer runs stay consistent, populated and eventful', () => {
  for (let i = 0; i < 3; i++) {
    G.Game.newGame(null); const S = G.Game.state();
    for (let t = 0; t < 360; t++) G.Game.endTurn();
    for (const f of Object.values(S.factions)) if (f.alive) { const r = S.officers[f.ruler]; assert(r && r.faction === f.id, 'ruler ' + f.id); }
    for (const o of Object.values(S.officers)) for (const k of ['ldr', 'war', 'int', 'pol', 'chr']) assert(o[k] >= 1 && o[k] <= 100, `${o.name} ${k}=${o[k]}`);
    assert(Object.keys(S.officers).length >= 70, 'officers ' + Object.keys(S.officers).length);
    assert(Object.keys(S.eventsFired).length >= 6, 'events fired ' + Object.keys(S.eventsFired).length);
    assert(S.history.length >= 29, 'history snapshots');
  }
});
test('save, load and undo round-trip', () => {
  G.Game.newGame('caocao'); const S = G.Game.state(); const gold = S.provinces.chenliu.gold;
  G.Game.develop('chenliu', 'Xun Yu', 'agri'); assert(S.provinces.chenliu.gold === gold - 200, 'spent');
  assert(G.Game.undoMonth(), 'undo'); assert(G.Game.state().provinces.chenliu.gold === gold, 'restored');
  G.Game.save(2); assert(G.Game.hasSave(2) && G.Game.slotInfo(2).label.includes('Cao Cao'), 'slot'); assert(G.Game.load(2), 'load');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
