// ============================================================
//  Game engine: state, commands, battles, economy, AI
// ============================================================

const Game = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const COST = { develop: 200, fortify: 300, recruit: 300, reward: 200, ships: 300, pacify: 100, resettle: 600, plots: { spy: 100, incite: 500, unrest: 300, sabotage: 400, assassinate: 800 } };
  // Roads (typed, with waypoints) define adjacency
  const roadKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const ROAD_MAP = Object.fromEntries(ROADS.map((r) => [roadKey(r[0], r[1]), { type: r[2], via: r[3] || [] }]));
  const roadInfo = (a, b) => ROAD_MAP[roadKey(a, b)] || null;
  const roadType = (a, b) => { const r = roadInfo(a, b); return r ? r.type : null; };
  function buildAdj() {
    const adj = {};
    for (const p of PROVINCES) adj[p.id] = [];
    for (const [a, b] of ROADS) { adj[a].push(b); adj[b].push(a); }
    return adj;
  }
  const provData = (id) => PROVINCES.find((p) => p.id === id);
  const hasTrait = (p, t) => (p.traits || []).includes(t);
  const hasShipyard = (p) => hasTrait(p, 'river') || hasTrait(p, 'coast');
  const isNorth = (pid) => provData(pid).y < 560;
  const isSouth = (pid) => provData(pid).y > 640;
  const isWinter = () => S.month === 12 || S.month <= 2;
  const isSpring = () => S.month >= 3 && S.month <= 5;
  const isSummer = () => S.month >= 6 && S.month <= 8;
  // Economy tuning knobs
  const WALL_DIV = 1000;        // defense bonus = 1 + walls / WALL_DIV
  const FOOD_PER_AGRI = 4;     // monthly food from agriculture
  const HARVEST_MULT = 12;     // extra food per agriculture point in month 9
  const FOOD_UPKEEP = 0.1;     // food per soldier per month
  const GOLD_UPKEEP = 0.01;    // gold per soldier per month
  let quiet = false;           // suppress domestic log lines (AI turns)
  const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
  const MILITIA = { name: 'Local militia', ldr: 50, war: 50, int: 40, pol: 40, chr: 40 };
  const GARRISON = { name: 'Garrison captain', ldr: 40, war: 40, int: 35, pol: 35, chr: 35 };

  let S = null;

  // ---------- state creation ----------
  function newGame(playerId, options = {}) {
    const provinces = {};
    for (const p of PROVINCES) {
      const f = FACTIONS.find((f) => f.cities.includes(p.id));
      const t = p.tier;
      const capital = f && f.cities[0] === p.id;
      provinces[p.id] = {
        id: p.id,
        owner: f ? f.id : null,
        troops: f ? [0, 7000, 12000, 20000][t] + (capital ? 4000 : 0) : [0, 3000, 4500, 6000][t],
        gold: [0, 900, 1600, 3000][t],
        food: [0, 18000, 32000, 60000][t],
        agri: [0, 160, 260, 400][t] + ri(-30, 30),
        comm: [0, 120, 220, 340][t] + ri(-30, 30),
        defense: [0, 100, 220, 360][t],
        pop: [0, 120000, 250000, 450000][t] + ri(-20000, 20000),
        training: f ? 55 : 35,
        traits: p.traits || [],
        fleet: (p.traits || []).some((t) => t === 'river' || t === 'coast') ? (f ? 20 : 10) : 0,
        order: f ? 70 : 45, posture: 'hold',
      };
    }
    const adj = buildAdj();

    const officers = {};
    for (const o of OFFICERS) {
      officers[o[0]] = { name: o[0], ldr: o[1], war: o[2], int: o[3], pol: o[4], chr: o[5], faction: o[6], city: o[7], loyalty: o[8], born: o[9], acted: false, captive: null, skills: OFFICER_SKILLS[o[0]] || [], rank: 0 };
    }
    const factions = {};
    for (const f of FACTIONS) factions[f.id] = { id: f.id, name: f.name, ruler: f.ruler, color: f.color, aggr: f.aggr, alive: true, raider: !!f.raider, wanderer: !!f.wanderer, prestige: 0, guest: false, host: null, guestSince: 0, hasEmperor: !!f.emperor, favor: 0, household: { troops: 0, gold: 0 }, petitionUntil: 0, persona: f.persona || [], treachery: 0, lastLoss: -99, lastAttackTurn: -99, lastAttackTarget: null, plan: null, caution: 1, title: 0, phase: 'rising', attackedBy: {}, gains: [], reserve: null };

    S = {
      year: SCENARIO.year, month: SCENARIO.month, turn: 1,
      player: playerId || null, observer: !playerId, provinces, adj, officers, factions,
      diplomacy: {}, pendingProposals: [], pendingSuccession: null, favors: {}, pendingAid: [],
      options: { historicalDeaths: options.historicalDeaths !== false, difficulty: options.difficulty || 'normal' },
      pendingTitle: null, history: [], stats: { battles: 0, captures: 0, deaths: 0 },
      eventsFired: {}, objectivesDone: {}, pendingDecisions: [], battles: {},
      items: {}, arrived: {},
      log: [], notices: [], pendingCaptives: [], over: null, winner: null,
    };
    for (const [a, b, v] of INITIAL_RELATIONS) setRelation(a, b, v);
    if (options.scenario && options.scenario !== '190') applyScenario(SCENARIOS.find((x) => x.id === options.scenario));
    for (const it of ITEMS) { S.items[it.id] = { id: it.id, owner: null, city: it.city || null }; if (it.owner && S.officers[it.owner]) giveItem(it.id, it.owner, true); else if (it.owner) S.items[it.id].city = (OFFICERS.find((r) => r[0] === it.owner) || [])[7] || 'luoyang'; }
    if (S.observer) log('You observe the age of chaos unfold. Every warlord acts on his own.', 'sys');
    const SC = SCENARIOS.find((x) => x.id === (options.scenario || '190')) || SCENARIOS[0];
    S.scenario = SC.id;
    log(`${SC.title}. ${SC.intro}`, 'sys');
    snapshotMonth();
    const note = HISTORY_NOTES[`${S.year}-${S.month}`];
    if (note) log(note, 'hist');
    return S;
  }

  // ---------- scenarios other than 190 ----------
  function applyScenario(SC) {
    if (!SC) return;
    S.year = SC.year; S.month = SC.month;
    // everything unowned, everyone free, every house dead; then rebuild from the scenario
    for (const p of Object.values(S.provinces)) { p.owner = null; p.troops = 4000; p.order = 45; }
    for (const F of Object.values(S.factions)) { F.alive = false; F.hasEmperor = false; F.guest = false; F.host = null; }
    const deadBy = new Set(HISTORICAL_DEATHS.filter((dd) => dd[1] < SC.year || (dd[1] === SC.year && dd[2] < SC.month)).map((dd) => dd[0]));
    for (const o of Object.values(S.officers)) { o.faction = null; o.loyalty = 0; if (deadBy.has(o.name)) delete S.officers[o.name]; }
    // later officers whose year has come
    for (const r of LATER_OFFICERS) { const [name, ldr, war, int_, pol, chr, born, year, city] = r; if (year <= SC.year && !S.officers[name] && !deadBy.has(name)) { S.officers[name] = { name, ldr, war, int: int_, pol, chr, faction: null, city, loyalty: 0, born, acted: false, captive: null, skills: OFFICER_SKILLS[name] || [], rank: 0 }; S.arrived[name] = 0; } }
    const create = (name) => { const c = SCENARIO_CREATED.find((x) => x[0] === name); if (!c || S.officers[name]) return; S.officers[name] = { name, ldr: c[1], war: c[2], int: c[3], pol: c[4], chr: c[5], faction: null, city: 'luoyang', loyalty: 0, born: c[6], acted: false, captive: null, skills: OFFICER_SKILLS[name] || [], rank: 0 }; };
    for (const [fid, h] of Object.entries(SC.houses)) {
      if (h.dead) continue;
      const base = FACTIONS.find((f) => f.id === fid);
      const F = S.factions[fid] || (S.factions[fid] = { id: fid, name: h.name || fid, ruler: h.ruler, color: h.color || '#888', aggr: h.aggr || 1, alive: true, raider: false, wanderer: !!h.wanderer, prestige: 0, guest: false, host: null, guestSince: 0, hasEmperor: false, favor: 0, household: { troops: 0, gold: 0 }, petitionUntil: 0, persona: h.persona || [], treachery: 0, lastLoss: -99, lastAttackTurn: -99, lastAttackTarget: null, plan: null, caution: 1, title: 0 });
      F.alive = true; F.title = h.title || 0; F.prestige = (h.title || 0) * 12;
      const rulerName = h.ruler.replace('*', '');
      if (h.ruler.endsWith('*')) create(rulerName);
      F.ruler = rulerName; F.name = h.name || (base ? base.name : rulerName);
      if (h.name && base && h.name !== base.name) F.name = h.name;
      const cities = (h.cities || []).map((c) => c.replace('?', '')).filter((c) => S.provinces[c]);
      for (const c of cities) { const p = S.provinces[c]; p.owner = fid; const tier = provData(c).tier; p.troops = Math.floor(([0, 7000, 12000, 20000][tier] + (c === cities[0] ? 4000 : 0)) * (h.garrison || 1)); p.order = 70; p.gold = [0, 900, 1600, 3000][tier]; p.food = [0, 18000, 32000, 60000][tier]; if (h.walls) p.defense = Math.min(999, p.defense + h.walls); if (h.fleet && hasShipyard(p)) p.fleet = Math.max(p.fleet || 0, h.fleet); if (h.training) p.training = h.training; }
      const seat = cities[0] || null;
      for (let n of h.officers || []) {
        const optional = n.endsWith('?'); n = n.replace(/[?*]/g, '');
        if (!S.officers[n]) { create(n); if (!S.officers[n]) continue; }
        if (optional && Math.random() < 0.5) continue;
        const o = S.officers[n]; if (o.faction && n !== rulerName) continue; o.faction = fid; o.loyalty = n === rulerName ? 100 : 80 + ri(0, 15); o.city = seat || o.city;
      }
      if (!S.officers[rulerName]) { F.alive = false; continue; }
      S.officers[rulerName].faction = fid; S.officers[rulerName].loyalty = 100;
      if (h.guestOf && S.factions[h.guestOf]) { F.guest = true; F.host = h.guestOf; F.guestSince = 0; F.favor = 50; F.household = { troops: 2000, gold: 500 }; }
      else if (!cities.length) F.alive = false;
      // spread officers a little: each city beyond the seat gets a couple
      if (cities.length > 1) { const offs = factionOfficers(fid).filter((o) => o.name !== rulerName); let i = 0; for (const c of cities.slice(1)) for (let k = 0; k < 2 && i < offs.length - 2; k++, i++) offs[offs.length - 1 - i].city = c; }
    }
    // guests sit at their host's seat
    for (const F of Object.values(S.factions)) if (F.alive && F.guest && S.factions[F.host]) { const seat = rulerOf(F.host) ? rulerOf(F.host).city : null; if (seat) for (const o of allOfficers()) if (o.faction === F.id) o.city = seat; }
    if (SC.emperor && S.factions[SC.emperor] && S.factions[SC.emperor].alive) S.factions[SC.emperor].hasEmperor = true;
    for (const [a, b, t] of SC.treaties || []) if (S.factions[a] && S.factions[b] && S.factions[a].alive && S.factions[b].alive) { const dd = dip(a, b); dd.status = t; dd.until = t === 'ceasefire' ? 24 : ALLIANCE_MONTHS; }
    for (const [a, b, v] of SC.relations || []) if (S.factions[a] && S.factions[b]) setRelation(a, b, v);
    // events whose windows have closed are treated as fired
    for (const ev of EVENTS) if (ev.to[0] < SC.year || (ev.to[0] === SC.year && ev.to[1] < SC.month)) S.eventsFired[ev.id] = true;
    // unclaimed cities get militia
    for (const p of Object.values(S.provinces)) if (!p.owner) p.troops = 4000 + provData(p.id).tier * 1000;
  }

  // ---------- helpers ----------
  const state = () => S;
  const prov = (id) => S.provinces[id];
  const off = (name) => S.officers[name];
  const fac = (id) => (id ? S.factions[id] : null);
  const pname = (id) => PROVINCES.find((p) => p.id === id).name;
  const fname = (id) => (id ? S.factions[id].name : 'Unclaimed');
  const dateStr = () => `Year ${S.year}, Month ${S.month}`;
  const season = () => SEASONS[S.month - 1];

  function log(text, cls = '') {
    S.log.unshift({ t: `${S.year}.${S.month}`, text, cls });
    if (S.log.length > 300) S.log.length = 300;
  }
  function notice(text, cls = '', extra = {}) { S.notices.push({ text, cls, ...extra }); log(text, cls); }

  const allOfficers = () => Object.values(S.officers);
  const officersIn = (pid, fid) => allOfficers().filter((o) => o.city === pid && o.faction === fid && !o.captive);
  const freeOfficersIn = (pid) => allOfficers().filter((o) => o.city === pid && o.faction === null && !o.captive);
  const idleOfficers = (pid) => officersIn(pid, prov(pid).owner).filter((o) => !o.acted);
  const captivesIn = (pid, fid) => allOfficers().filter((o) => o.city === pid && o.captive === fid);
  const factionOfficers = (fid) => allOfficers().filter((o) => o.faction === fid && !o.captive);
  const factionProvinces = (fid) => Object.values(S.provinces).filter((p) => p.owner === fid);
  const rulerOf = (fid) => off(S.factions[fid].ruler);
  const isRuler = (o) => o.faction && S.factions[o.faction].ruler === o.name;
  const neighbors = (pid) => S.adj[pid].map(prov);
  const enemyNeighbors = (pid) => neighbors(pid).filter((n) => n.owner !== prov(pid).owner);
  const best = (list, stat, fallback) => (list.length ? Math.max(...list.map((o) => o[stat])) : fallback[stat]);
  const totalTroops = (fid) => factionProvinces(fid).reduce((s, p) => s + p.troops, 0);
  const hasSkill = (o, sk) => !!(o && o.skills && o.skills.includes(sk));
  const partyHas = (list, sk) => list.some((o) => hasSkill(o, sk));
  // officer ties
  const bondGroup = (name) => OFFICER_TIES.bonds.find((g) => g.includes(name)) || null;
  const bonded = (a, b) => { const g = bondGroup(a); return !!(g && g.includes(b) && a !== b); };
  const areEnemies = (a, b) => OFFICER_TIES.enemies.some((p) => (p[0] === a && p[1] === b) || (p[1] === a && p[0] === b));
  const areRivals = (a, b) => OFFICER_TIES.rivals.some((p) => (p[0] === a && p[1] === b) || (p[1] === a && p[0] === b));
  // the living house, other than `except`, whose ruler is bonded to this officer
  function bondedRuler(o, except) { const g = bondGroup(o.name); if (!g) return null; for (const F of Object.values(S.factions)) if (F.alive && F.id !== except && g.includes(F.ruler) && F.ruler !== o.name) return F.id; return null; }
  // titles and legitimacy
  const titleOf = (fid) => TITLES[Math.min(S.factions[fid].title || 0, TITLES.length - 1)];
  function eligibleTitle(fid) {
    const F = S.factions[fid]; const cities = factionProvinces(fid).length; let best = 0;
    for (const t of TITLES) { if (t.tier === 4) { if ((F.hasEmperor && cities >= 16) || cities >= t.cities) best = 4; } else if ((F.prestige || 0) >= t.prestige && cities >= t.cities) best = t.tier; }
    return best;
  }
  const legitimacy = (fid) => (S.factions[fid].title || 0) * 0.03;
  // difficulty multipliers
  const diff = () => (S.options && S.options.difficulty) || 'normal';
  const overextension = (fid) => Math.max(0, factionProvinces(fid).length - 16);
  const incomeMult = (fid) => (diff() === 'easy' ? (fid === S.player ? 1.2 : 0.9) : diff() === 'hard' ? (fid === S.player ? 1 : 1.2) : 1) * Math.max(0.75, 1 - 0.01 * overextension(fid));
  const governorOf = (p) => { if (!p.owner) return null; const offs = officersIn(p.id, p.owner); return offs.length ? offs.reduce((m, o) => (o.pol > m.pol ? o : m)) : null; };
  const has = (fid, t) => !!(S.factions[fid] && (S.factions[fid].persona || []).includes(t));
  const totalCities = () => Object.keys(S.provinces).length;
  // the runaway leader: a living house holding a third of the map or more
  function leaderHouse() { const n = totalCities(); const f = Object.values(S.factions).filter((x) => x.alive && !x.raider).sort((a, b) => factionProvinces(b.id).length - factionProvinces(a.id).length)[0]; return f && factionProvinces(f.id).length * 3 >= n ? f.id : null; }
  const borderTroops = (a, b) => factionProvinces(a).filter((p) => S.adj[p.id].some((n) => prov(n).owner === b)).reduce((s, p) => s + p.troops, 0);

  function fail(msg) { return { ok: false, msg }; }
  function ok(msg, cls = '') { if (!quiet) log(msg, cls); return { ok: true, msg }; }

  function useOfficer(name, pid) {
    const o = off(name);
    if (!o || o.city !== pid || o.faction !== prov(pid).owner || o.captive) return fail(`${name} is not available here.`);
    if (o.acted) return fail(`${name} has already acted this month.`);
    return null;
  }

  // ---------- domestic commands ----------
  function develop(pid, name, type) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    if (p.gold < COST.develop) return fail(`Not enough gold (need ${COST.develop}).`);
    const o = off(name);
    const gain = Math.floor((o.pol / 4 + ri(0, 10)) * (hasSkill(o, 'admin') ? 1.5 : 1));
    p.gold -= COST.develop;
    const key = type === 'agri' ? 'agri' : 'comm';
    const before = p[key];
    p[key] = clamp(p[key] + gain, 0, 999);
    o.acted = true;
    const label = key === 'agri' ? 'agriculture' : 'commerce';
    return ok(`${o.name} developed ${label} in ${pname(pid)}: ${before} → ${p[key]}.`);
  }

  // ---------- outstations ----------
  const sitesOf = (p) => p.sites || (p.sites = []);
  const hasSite = (p, type) => sitesOf(p).some((x) => x.type === type && !x.damaged);
  const siteName = (type) => (SITE_TYPES[type] || { label: type }).label;
  // where a kind of site could stand on the city's hex map: the right ground, outside the walls, near the roads
  function siteSpots(pid, type) {
    const m = HEXMAPS[pid]; const T = SITE_TYPES[type]; if (!m || !T) return [];
    const P = provData(pid); const p = prov(pid); const used = new Set(sitesOf(p).map((x) => `${x.c},${x.r}`));
    if (T.coast && !hasTrait(p, 'coast')) return [];
    if (T.water && !hasShipyard(p)) return [];
    if (type === 'pasture' && !(hasTrait(p, 'horses') || P.lat >= 34.5)) return [];
    const out = [];
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      const t = m.terrain[r * m.w + c]; const i = r * m.w + c; const dist = BATTLE.hexDist(c, r, 6, 5);
      if (!T.hexes.includes(t) || used.has(`${c},${r}`) || dist < T.near[0] || dist > T.near[1]) continue;
      if (T.road && m.roads[i] !== '1') continue;
      if (T.water && !BATTLE.neighbours(c, r, m.w, m.h).some(([nc, nr]) => BATTLE.navigable(m.terrain[nr * m.w + nc]))) continue;
      const nearRoad = BATTLE.neighbours(c, r, m.w, m.h).some(([nc, nr]) => m.roads[nr * m.w + nc] === '1') || m.roads[i] === '1';
      out.push({ c, r, score: dist + (nearRoad ? 0 : 1.5) });
    }
    return out.sort((a, b) => a.score - b.score);
  }
  function availableSites(pid) {
    const p = prov(pid);
    return SITE_ORDER.map((type) => { const T = SITE_TYPES[type]; const have = sitesOf(p).filter((x) => x.type === type).length; const spots = have >= T.max ? [] : siteSpots(pid, type); return { type, label: T.label, glyph: T.glyph, cost: T.cost, desc: T.desc, have, max: T.max, ok: spots.length > 0 && have < T.max, spot: spots[0] || null }; });
  }
  function buildSite(pid, name, type) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const a = availableSites(pid).find((x) => x.type === type);
    if (!a || !a.ok) return fail(`No place for a ${siteName(type).toLowerCase()} at ${pname(pid)}.`);
    if (p.gold < a.cost) return fail(`Not enough gold (need ${a.cost}).`);
    p.gold -= a.cost; off(name).acted = true;
    sitesOf(p).push({ type, c: a.spot.c, r: a.spot.r, damaged: false, built: S.turn });
    return ok(`${name} raised a ${siteName(type).toLowerCase()} outside ${pname(pid)}.`, 'good');
  }
  function repairSite(pid, name, index) {
    const p = prov(pid); const st = sitesOf(p)[index]; if (!st || !st.damaged) return fail('Nothing to repair there.');
    const e = useOfficer(name, pid); if (e) return e;
    const cost = Math.floor(SITE_TYPES[st.type].cost / 2); if (p.gold < cost) return fail(`Not enough gold (need ${cost}).`);
    p.gold -= cost; off(name).acted = true; st.damaged = false;
    return ok(`${name} rebuilt the ${siteName(st.type).toLowerCase()} outside ${pname(pid)}.`, 'good');
  }
  const siteGold = (p) => sitesOf(p).reduce((a, x) => a + (x.damaged ? 0 : (SITE_TYPES[x.type].gold || 0)), 0);
  const siteFood = (p) => sitesOf(p).filter((x) => x.type === 'village' && !x.damaged).length * SITE_TYPES.village.food * (hasTrait(p, 'grain') ? 1.25 : 1);
  const buildCost = (p, base, kind) => Math.floor(base * (kind === 'walls' && hasSite(p, 'mine') ? 0.8 : 1) * (hasSite(p, 'lumber') ? 0.7 : 1));
  // a raider's loot from an outstation, and its ruin
  function sackSiteFor(B, i, u) {
    const p = prov(B.city); const st = sitesOf(p)[i]; if (!st) return null;
    const home = prov(B.att.from); const T = SITE_TYPES[st.type]; const name = T.label.toLowerCase(); let text = '', food = 0;
    st.damaged = true;
    const loot = (gold) => { if (home && home.owner === B.attF) home.gold += gold; text = `${fmt(gold)} gold carried off`; };
    if (st.type === 'mine') loot(400 + ri(0, 200));
    else if (st.type === 'salt') loot(500 + ri(0, 200));
    else if (st.type === 'market') { loot(300 + ri(0, 200)); const F = S.factions[B.attF]; if (F) F.prestige = clamp((F.prestige || 0) - 3, 0, 100); text += '; the sack is remembered against the sacker'; }
    else if (st.type === 'docks') { loot(150 + ri(0, 100)); p.fleet = Math.max(0, (p.fleet || 0) - 30); text += ', and the boats burn'; }
    else if (st.type === 'lumber') loot(100 + ri(0, 100));
    else if (st.type === 'village') { food = Math.min(p.food, 2000 + ri(0, 1000)); p.food -= food; p.pop = Math.max(1000, Math.floor(p.pop * 0.98)); text = `${fmt(food)} grain taken, the people driven off`; }
    else if (st.type === 'pasture') { if (home && home.owner === B.attF) home.training = clamp(home.training + 5, 0, 100); loot(100 + ri(0, 100)); text += ', the herds driven away'; }
    else if (st.type === 'tower') text = 'the beacon thrown down';
    if (p.owner === S.player || B.attF === S.player) notice(`The ${name} outside ${pname(B.city)} is sacked by ${fname(B.attF)}.`, B.attF === S.player ? 'good' : 'bad');
    return { name, text, food };
  }
  function fortify(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const cost = buildCost(p, COST.fortify, 'walls');
    if (p.gold < cost) return fail(`Not enough gold (need ${cost}).`);
    const o = off(name);
    const gain = Math.floor(o.ldr / 4 + ri(0, 8));
    p.gold -= cost;
    const before = p.defense;
    p.defense = clamp(p.defense + gain, 0, 999);
    o.acted = true;
    return ok(`${o.name} strengthened the walls of ${pname(pid)}: ${before} → ${p.defense}.`);
  }

  function train(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const o = off(name);
    const gain = Math.floor(o.ldr / 8 + o.war / 20 + ri(0, 3));
    const before = p.training;
    p.training = clamp(p.training + gain, 0, 100);
    o.acted = true;
    return ok(`${o.name} drilled the troops of ${pname(pid)}: training ${before} → ${p.training}.`);
  }

  function recruitTroops(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const rc = COST.recruit * (diff() === 'hard' && p.owner === S.player ? 1.3 : 1);
    if (p.gold < rc) return fail(`Not enough gold (need ${Math.round(rc)}).`);
    if (p.pop < 30000) return fail('The population is too small to conscript from.');
    if ((p.order || 0) < 30) return fail(`${pname(pid)} is in turmoil (order ${p.order}); no one will answer the levy. Pacify it first.`);
    const o = off(name);
    let n = Math.floor(((o.ldr + o.chr) / 2) * 25 + ri(0, 400));
    n = Math.floor(n * Math.min(1, 0.3 + (p.order || 0) / 100));
    const horses = hasTrait(p, 'horses');
    if (horses) n = Math.floor(n * 1.25);
    n = Math.min(n, Math.floor(p.pop * 0.04));
    p.gold -= Math.round(rc);
    p.pop -= Math.floor(n * 0.7);
    // green recruits dilute training (frontier riders less so)
    p.training = Math.round((p.training * p.troops + (horses || hasSite(p, 'pasture') ? 45 : 30) * n) / (p.troops + n));
    p.troops += n;
    o.acted = true;
    return ok(`${o.name} recruited ${fmt(n)} soldiers in ${pname(pid)}.`);
  }

  function search(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const o = off(name);
    o.acted = true;
    const hidden = hiddenItemsIn(pid);
    if (hidden.length && Math.random() < 0.12 + o.int / 400) {
      const it = hidden[0];
      giveItem(it.id, o.name, true);
      const text = `${o.name}, searching ${pname(pid)}, uncovers the ${it.name}! ${it.desc}`;
      if (p.owner === S.player) notice(text, 'good'); else log(text, 'good');
      return { ok: true, msg: text };
    }
    const r = Math.random();
    if (r < 0.12) {
      const food = Math.floor(o.int * 20 + ri(0, 1500));
      p.food += food;
      return ok(`${o.name} uncovered a hidden granary in ${pname(pid)}: +${fmt(food)} food.`);
    }
    const gold = Math.floor(o.int * 2 + ri(0, 250));
    p.gold += gold;
    return ok(`${o.name} searched ${pname(pid)} and collected ${fmt(gold)} gold in taxes and tribute.`);
  }

  function recruitChance(recruiter, target, rulerChr, fid) {
    const diff = (target.ldr + target.war + target.int + target.pol + target.chr) / 5;
    const F = fid ? S.factions[fid] : null;
    const bonus = F ? (F.prestige || 0) / 400 + (F.hasEmperor ? 0.1 : 0) : 0;
    return clamp(((recruiter.chr + rulerChr) / 2 + 40 - diff) / 100 + bonus, 0.1, 0.95);
  }

  function recruitOfficer(pid, name, targetName) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const o = off(name); const t = off(targetName);
    if (!t || t.faction !== null || t.city !== pid) return fail(`${targetName} cannot be recruited here.`);
    o.acted = true;
    if (areEnemies(t.name, rulerOf(p.owner).name)) return ok(`${t.name} will never serve ${rulerOf(p.owner).name}.`, 'bad');
    const kin = bondedRuler(t, p.owner); if (kin) return ok(`${t.name} will not take service while his kinsman ${fname(kin)} rules elsewhere.`, 'bad');
    const chance = recruitChance(o, t, rulerOf(p.owner).chr, p.owner) + (hasSkill(o, 'orator') ? 0.15 : 0) + legitimacy(p.owner);
    if (Math.random() < chance) {
      t.faction = p.owner; t.loyalty = 60 + ri(0, 20);
      return ok(`${t.name} has joined ${fname(p.owner)}, persuaded by ${o.name}!`, 'good');
    }
    return ok(`${t.name} politely declined ${o.name}'s invitation.`, 'bad');
  }

  // Restore order in a restless city.
  function pacify(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    if (p.gold < COST.pacify) return fail(`Not enough gold (need ${COST.pacify}).`);
    const o = off(name);
    let gain = Math.floor(3 + o.pol / 6 + o.chr / 10 + ri(0, 4));
    if (hasSkill(o, 'admin') || hasSkill(o, 'orator')) gain = Math.floor(gain * 1.5);
    p.gold -= COST.pacify; const before = p.order; p.order = clamp(p.order + gain, 0, 100); o.acted = true;
    return ok(`${o.name} settled disputes and fed the poor in ${pname(pid)}: order ${before} → ${p.order}.`);
  }
  const popCapOf = (p) => [0, 260000, 520000, 900000][provData(p.id).tier];
  // Bring settlers to empty land: the answer to a countryside bled white by decades of levies
  function resettle(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    if (p.gold < COST.resettle) return fail(`Not enough gold (need ${COST.resettle}).`);
    if (p.order < 40) return fail('Nobody settles in a lawless city: restore order first.');
    const cap = popCapOf(p); if (p.pop >= cap * 0.95) return fail(`${pname(pid)} is as full as its land can feed.`);
    const o = off(name);
    const gain = Math.min(cap - p.pop, Math.floor(cap * 0.006 + o.pol * 25 + ri(0, 800)) * (hasSkill(o, 'admin') ? 1.4 : 1));
    p.gold -= COST.resettle; const before = p.pop; p.pop += Math.floor(gain); p.order = clamp(p.order + 1, 0, 100); o.acted = true;
    return ok(`${o.name} brought settlers and refugees to the empty fields of ${pname(pid)}: population ${fmt(before)} → ${fmt(p.pop)}.`);
  }
  function setPosture(pid, posture) {
    const p = prov(pid); if (!['hold', 'sally', 'ambush'].includes(posture)) return fail('Unknown posture.');
    p.posture = posture; return { ok: true, msg: `${pname(pid)} will ${posture === 'hold' ? 'hold its walls' : posture === 'sally' ? 'sally out against attackers' : 'lay ambushes for attackers'}.` };
  }
  // Court ranks: cost gold, lift loyalty and set a floor under it. The ruler's title limits how many generals and marshals he may name.
  function appoint(pid, name) {
    const p = prov(pid); const o = off(name);
    if (!o || o.city !== pid || o.faction !== p.owner) return fail('Officer is not here.');
    if (isRuler(o)) return fail('The lord holds no rank but his own.');
    const next = (o.rank || 0) + 1; if (next >= RANKS.length) return fail(`${o.name} already holds the highest rank.`);
    const cost = RANK_COST[next]; if (p.gold < cost) return fail(`Not enough gold (need ${cost}).`);
    if (next >= 2) { const slots = titleOf(p.owner).slots; const held = factionOfficers(p.owner).filter((x) => (x.rank || 0) >= 2 && x.name !== o.name).length; if (held >= slots) return fail(`A ${titleOf(p.owner).name} may name only ${slots} generals and marshals. Win a higher title first.`); }
    p.gold -= cost; o.rank = next; o.loyalty = clamp(o.loyalty + 10, 0, 100);
    return ok(`${o.name} is named ${RANKS[next]}. Loyalty rises to ${o.loyalty}.`, 'good');
  }
  const loyaltyFloor = (o) => (o.rank ? 40 + 15 * o.rank : 0);
  // Assume a title the house is entitled to. Jealous lords cool toward the claimant.
  function assumeTitle(fid, tier) {
    const F = S.factions[fid]; const elig = eligibleTitle(fid);
    if (tier > elig) return fail('Your house has not earned that title yet.');
    if (tier <= (F.title || 0)) return fail('You already hold that rank or better.');
    F.title = tier; F.prestige = clamp((F.prestige || 0) + 5 * tier, 0, 100);
    for (const f of Object.keys(S.factions)) if (f !== fid && S.factions[f].alive) shiftRelation(fid, f, tier === 4 ? -30 : -5 * tier);
    S.pendingTitle = null;
    const text = tier === 4 ? `${rulerOf(fid).name} ascends the throne and proclaims a new dynasty! The other lords call him a usurper.` : `${rulerOf(fid).name} assumes the title of ${TITLES[tier].name}.`;
    notice(text, 'hist', { major: tier >= 3 });
    return { ok: true, msg: text };
  }
  function processTitles() {
    for (const F of Object.values(S.factions)) {
      if (!F.alive || F.raider || F.guest) continue;
      const elig = eligibleTitle(F.id);
      if (elig <= (F.title || 0)) continue;
      if (F.id === S.player) { if (!S.pendingTitle) S.pendingTitle = { fid: F.id, tier: elig }; continue; }
      const p = has(F.id, 'cautious') ? 0.35 : has(F.id, 'reckless') || has(F.id, 'treacherous') ? 0.9 : 0.7;
      if (Math.random() < p / 6) assumeTitle(F.id, elig);
    }
  }
  // AI ranks: honour the best officers when rich
  function aiAppoint(fid) {
    for (const p of factionProvinces(fid)) {
      if (p.gold < 2500) continue;
      const cand = officersIn(p.id, fid).filter((o) => !isRuler(o) && (o.rank || 0) < 3 && o.loyalty < 90).sort((a, b) => (b.war + b.ldr) - (a.war + a.ldr))[0];
      if (cand) appoint(p.id, cand.name);
    }
  }

  // ---------- plots: schemes against a neighbouring city ----------
  const plotTargets = (pid) => { const p = prov(pid); return neighbors(pid).filter((n) => n.owner && n.owner !== p.owner && canAttack(p.owner, n.owner)); };
  function plot(pid, name, targetCity, kind, targetOfficer) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    const t = prov(targetCity);
    if (!plotTargets(pid).some((x) => x.id === targetCity)) return fail('That city is not a valid target for a plot.');
    const cost = COST.plots[kind]; if (cost == null) return fail('Unknown plot.');
    if (p.gold < cost) return fail(`Not enough gold (need ${cost}).`);
    const o = off(name); const me = p.owner, them = t.owner;
    p.gold -= cost; o.acted = true;
    const skill = o.int / 100 + (hasSkill(o, 'stratagem') ? 0.1 : 0);
    const detected = (base) => Math.random() < base;
    if (kind !== 'spy' && hasSite(t, 'tower') && Math.random() < 0.5) { shiftRelation(me, them, -10); return ok(`The sentries of the watchtower at ${pname(targetCity)} catch ${o.name}'s agents on the road. Relations with ${fname(them)} suffer.`, 'bad'); }
    if (kind === 'spy') {
      const hidden = hiddenItemsIn(targetCity).map((it) => it.name);
      const offs = officersIn(targetCity, them).sort((a, b) => a.loyalty - b.loyalty);
      const weakest = offs[0];
      return ok(`${o.name}'s agents report from ${pname(targetCity)}: order ${t.order}, ${fmt(t.troops)} men, walls ${t.defense}, fleet ${t.fleet || 0}, ${fmt(t.gold)} gold and ${fmt(t.food)} food. ${weakest ? `${weakest.name} is the least content of its officers (loyalty ${weakest.loyalty}).` : 'No officers hold it.'} ${hidden.length ? 'Rumour speaks of treasures hidden there: ' + hidden.join(', ') + '.' : 'No treasures are rumoured there.'}`, 'good');
    }
    if (kind === 'unrest') {
      const drop = Math.floor(6 + skill * 20 + ri(0, 6)); t.order = clamp(t.order - drop, 0, 100);
      if (detected(0.4)) { shiftRelation(me, them, -10); return ok(`${o.name}'s agents spread rumours in ${pname(targetCity)}: order -${drop}. The plot is traced back to you; relations with ${fname(them)} suffer.`, 'good'); }
      return ok(`${o.name}'s agents spread rumours in ${pname(targetCity)}: order -${drop}. No one knows who paid them.`, 'good');
    }
    if (kind === 'sabotage') {
      const w = Math.floor(t.defense * (0.08 + skill * 0.08)), f = Math.floor(t.food * (0.1 + skill * 0.1));
      t.defense -= w; t.food -= f;
      const standing = sitesOf(t).filter((x) => !x.damaged); if (standing.length && Math.random() < 0.4) { const st = pick(standing); st.damaged = true; log(`${o.name}'s men burn the ${siteName(st.type).toLowerCase()} outside ${pname(targetCity)}.`, 'strat'); }
      if (detected(0.45)) { shiftRelation(me, them, -15); return ok(`${o.name}'s men fire the granaries and undermine a wall at ${pname(targetCity)}: walls -${w}, food -${fmt(f)}. They are caught; relations with ${fname(them)} suffer.`, 'good'); }
      return ok(`${o.name}'s men fire the granaries and undermine a wall at ${pname(targetCity)}: walls -${w}, food -${fmt(f)}.`, 'good');
    }
    const tgt = off(targetOfficer);
    if (!tgt || tgt.city !== targetCity || tgt.faction !== them || tgt.captive) return fail('That officer is not in the target city.');
    if (kind === 'incite') {
      if (isRuler(tgt)) return fail('A lord cannot be incited against himself.');
      if (bondGroup(tgt.name) && bondedRuler(tgt, me) === them) return fail(`${tgt.name} is bound by oath to his lord.`);
      const chance = clamp((o.int - tgt.loyalty) / 100 + 0.25 + (hasSkill(o, 'orator') ? 0.1 : 0) + legitimacy(me), 0.03, 0.85);
      if (Math.random() < chance) {
        tgt.faction = me; tgt.city = pid; tgt.loyalty = 55 + ri(0, 15); tgt.rank = 0;
        shiftRelation(me, them, -20);
        return ok(`${o.name}'s letters find their mark: ${tgt.name} slips out of ${pname(targetCity)} by night and joins you at ${pname(pid)}!`, 'good');
      }
      tgt.loyalty = clamp(tgt.loyalty + 5, 0, 100);
      if (detected(0.4)) shiftRelation(me, them, -15);
      return ok(`${tgt.name} burns ${o.name}'s letter unread. His loyalty hardens.`, 'bad');
    }
    if (kind === 'assassinate') {
      const chance = clamp(skill * 0.35 * ((110 - tgt.ldr) / 100) - (guarded(tgt) ? 0.1 : 0), 0.02, 0.3);
      if (Math.random() < chance) {
        shiftRelation(me, them, -40);
        const spoils = itemsOf(tgt.name);
        killOfficer(tgt, `by an assassin's blade in ${pname(targetCity)}`, false);
        return ok(`${o.name}'s assassin finds ${tgt.name} in ${pname(targetCity)}. The deed is done${spoils.length ? ', though the ' + spoils.map((it) => it.name).join(' and ') + ' are lost in the confusion' : ''}. All the land suspects your hand.`, 'good');
      }
      shiftRelation(me, them, -30);
      if (Math.random() < 0.5) { o.captive = them; o.city = targetCity; S.pendingCaptives.push({ name: o.name, captor: them, city: targetCity, from: me }); return ok(`The assassin fails and talks under torture. ${o.name} is seized in ${pname(targetCity)} as the plot's author!`, 'bad'); }
      return ok(`The assassin is cut down at ${tgt.name}'s door. ${o.name} escapes, but ${fname(them)} knows who sent him.`, 'bad');
    }
    return fail('Unknown plot.');
  }
  function aiPlots(fid) {
    if (!has(fid, 'schemer') && !has(fid, 'treacherous')) return;
    const F = S.factions[fid]; if (!F.plan || !F.plan.enemy) return;
    const p = prov(F.plan.hammer); if (!p || p.owner !== fid || p.gold < 1500 || Math.random() > 0.2) return;
    const t = prov(F.plan.target); if (!t.owner || !plotTargets(p.id).some((x) => x.id === t.id)) return;
    const o = idleOfficers(p.id).sort((a, b) => b.int - a.int)[0]; if (!o || o.int < 70) return;
    const weak = officersIn(t.id, t.owner).filter((x) => !isRuler(x) && x.loyalty < 60).sort((a, b) => a.loyalty - b.loyalty)[0];
    if (weak && p.gold >= COST.plots.incite) plot(p.id, o.name, t.id, 'incite', weak.name);
    else if (t.order > 40 && p.gold >= COST.plots.unrest) plot(p.id, o.name, t.id, 'unrest');
  }

  // Buy food from merchants. No officer needed. Rate worsens the more you buy at once.
  function buyFood(pid, gold) {
    const p = prov(pid);
    gold = Math.floor(gold);
    if (gold <= 0 || gold > p.gold) return fail('Not enough gold.');
    const rate = gold > 2000 ? 3 : gold > 800 ? 4 : 5;
    const food = gold * rate;
    p.gold -= gold; p.food += food;
    return ok(`Merchants in ${pname(pid)} sold ${fmt(food)} food for ${fmt(gold)} gold.`);
  }

  function buildShips(pid, name) {
    const p = prov(pid); const e = useOfficer(name, pid); if (e) return e;
    if (!hasShipyard(p)) return fail(`${pname(pid)} has no river or sea to launch ships on.`);
    const cost = buildCost(p, COST.ships, 'ships');
    if (p.gold < cost) return fail(`Not enough gold (need ${cost}).`);
    if (p.fleet >= 100) return fail('The fleet is already at full strength.');
    const o = off(name);
    const gain = Math.floor(o.ldr / 6 + o.int / 10 + ri(0, 5)) * (hasSite(p, 'docks') ? 2 : 1);
    p.gold -= cost;
    const before = p.fleet;
    p.fleet = clamp(p.fleet + gain, 0, 100);
    o.acted = true;
    return ok(`${o.name} built warships at ${pname(pid)}: fleet ${before} → ${p.fleet}.`);
  }

  // Terrain, fleets and season modifiers for an attack from one city to a neighbour.
  function battleModifiers(fromId, toId) {
    const from = prov(fromId), to = prov(toId);
    const type = roadType(fromId, toId);
    const m = { type, att: 1, def: 1, loss: 0, blocked: null, notes: [] };
    if (!type) return m;
    if (type === 'pass') {
      m.def *= 1.3; m.notes.push('Mountain pass: defenders ×1.30.');
      if (isWinter() && isNorth(fromId) && isNorth(toId)) m.blocked = 'Snow closes the pass until spring.';
    } else if (type === 'river' && isWinter() && isNorth(fromId) && isNorth(toId)) {
      m.frozen = true; m.notes.push('The river is frozen: the army crosses on the ice, fleets count for nothing.');
    } else if (type === 'river' || type === 'sea') {
      const af = from.fleet || 0, df = to.fleet || 0;
      const sea = type === 'sea';
      const flood = !sea && isSummer();
      const attF = sea ? 0.5 + af / 200 : flood ? 0.6 + af / 250 : 0.7 + af / 333;
      const defF = sea ? 1 + df / 400 : 1 + df / 500;
      m.att *= attF; m.def *= defF;
      const need = sea ? 40 : 30;
      if (af < need) m.loss = (sea ? 0.15 : 0.1) * (1 - af / need) * (flood ? 1.3 : 1);
      if (flood) m.notes.push('Summer: the river runs high and fast; boats matter more than ever.');
      m.notes.push(`${sea ? 'Sea lane' : 'River crossing'}: attackers ×${attF.toFixed(2)} (fleet ${af}), defenders ×${defF.toFixed(2)} (fleet ${df}).`);
      if (m.loss > 0.005) m.notes.push(`Short of ships: about ${Math.round(m.loss * 100)}% of the army would be lost in the crossing.`);
    }
    if (isSummer() && isSouth(toId)) { m.att *= 0.85; m.notes.push('Summer monsoon in the south: attackers ×0.85.'); }
    const gov = governorOf(to);
    if (gov && gov.ldr >= 60) { m.def *= 1 + gov.ldr / 1000; m.notes.push(`Governor ${gov.name} organises the defence: ×${(1 + gov.ldr / 1000).toFixed(2)}.`); }
    return m;
  }

  function reward(pid, targetName) {
    const p = prov(pid); const t = off(targetName);
    if (!t || t.city !== pid || t.faction !== p.owner) return fail('Officer is not here.');
    if (p.gold < COST.reward) return fail(`Not enough gold (need ${COST.reward}).`);
    if (t.loyalty >= 100) return fail(`${t.name} is already completely loyal.`);
    p.gold -= COST.reward;
    const before = t.loyalty;
    t.loyalty = clamp(t.loyalty + 8 + ri(0, 6), 0, 100);
    return ok(`${t.name} received gifts. Loyalty ${before} → ${t.loyalty}.`);
  }

  function transfer(fromId, toId, { troops = 0, gold = 0, food = 0, officers = [] }) {
    const a = prov(fromId), b = prov(toId);
    if (a.owner !== b.owner || !a.owner) return fail('Destination must be one of your own cities.');
    if (!S.adj[fromId].includes(toId)) return fail('Destination must be adjacent.');
    troops = Math.floor(troops); gold = Math.floor(gold); food = Math.floor(food);
    if (troops > a.troops || gold > a.gold || food > a.food || troops < 0 || gold < 0 || food < 0) return fail('Not enough resources.');
    if (troops > 0 && officers.length === 0) return fail('At least one officer must lead troops.');
    for (const n of officers) { const e = useOfficer(n, fromId); if (e) return e; }
    if (S.battles && S.battles[toId] && troops > 0) {   // the city is under siege: the column joins the defence within one to ten days
      const B = S.battles[toId];
      for (const n of officers) off(n).acted = true;
      a.troops -= troops; a.gold -= gold; a.food -= food;
      BATTLE.addArrival(B, { side: 'D', fid: a.owner, from: fromId, troops, food, officers, training: a.training, days: ri(1, 10), exit: battleExitToward(toId, fromId) });
      log(`${fname(a.owner)} sends ${fmt(troops)} men from ${pname(fromId)} to relieve ${pname(toId)}.`, 'war');
      return ok(`${fmt(troops)} men march from ${pname(fromId)} to relieve besieged ${pname(toId)}; they will arrive within ten days.`);
    }
    if (officers.length >= officersIn(fromId, a.owner).length && officersIn(fromId, a.owner).length > 0 && troops < a.troops) {
      // allowed, but the city will be left with no officer
    }
    a.troops -= troops; b.troops += troops;
    a.gold -= gold; b.gold += gold;
    a.food -= food; b.food += food;
    if (troops > 0) b.training = Math.round((b.training * (b.troops - troops) + a.training * troops) / b.troops);
    for (const n of officers) { const o = off(n); o.city = toId; o.acted = true; }
    const parts = [];
    if (troops) parts.push(`${fmt(troops)} troops`);
    if (gold) parts.push(`${fmt(gold)} gold`);
    if (food) parts.push(`${fmt(food)} food`);
    if (officers.length) parts.push(officers.join(', '));
    return ok(`Moved ${parts.join(', ')} from ${pname(fromId)} to ${pname(toId)}.`);
  }

  // ---------- battle ----------
  function attack(fromId, toId, officerNames, troops, tactics = {}) {
    const a = prov(fromId), b = prov(toId);
    if (!a.owner) return fail('No owner.');
    if (b.owner === a.owner) return fail('Cannot attack your own city.');
    if (!S.adj[fromId].includes(toId)) return fail('Target must be adjacent.');
    if (b.owner && !canAttack(a.owner, b.owner)) return fail(`You have a ${treatyStatus(a.owner, b.owner)} with ${fname(b.owner)}. Break it through diplomacy first.`);
    if (S.battles && S.battles[toId]) return fail(`${pname(toId)} is already under siege.`);
    const mods = battleModifiers(fromId, toId);
    if (mods.blocked) return fail(mods.blocked);
    troops = Math.floor(troops);
    if (troops <= 0 || troops > a.troops) return fail('Invalid troop count.');
    if (!officerNames.length) return fail('Choose at least one officer to command the army.');
    if (officerNames.length > 3) return fail('At most three officers may lead one army.');
    for (const n of officerNames) { const e = useOfficer(n, fromId); if (e) return e; }
    if (a.food < troops * 0.1) return fail('Not enough food to supply the campaign (need 10% of troop count).');
    a.food -= Math.floor(troops * 0.1);
    const A = S.factions[a.owner];
    A.lastAttackTurn = S.turn; A.lastAttackTarget = b.owner;
    if (b.owner) { const dd = dip(a.owner, b.owner); if (dd.expiredAt && dd.proposer === a.owner && S.turn - dd.expiredAt <= 3) { A.treachery = (A.treachery || 0) + 1; dd.expiredAt = 0; log(`${fname(a.owner)} let a ceasefire lapse and struck ${fname(b.owner)} at once. The lords take note.`, 'bad'); } }
    if (tacticalOn() && HEXMAPS[toId]) return startBattle(fromId, toId, officerNames, troops, tactics);
    const report = resolveBattle(fromId, toId, officerNames, troops, { tactics });
    return { ok: true, report };
  }

  function resolveBattle(fromId, toId, officerNames, troops, opts = {}) {
    const from = prov(fromId), to = prov(toId);
    const attF = opts.attF || from.owner, defF = to.owner;
    const external = !!opts.external;
    const attOfficers = officerNames.map(off);
    const defOfficers = defF ? officersIn(toId, defF) : [];
    const tactics = opts.tactics || {};
    const stance = ['assault', 'siege', 'feint', 'standard'].includes(tactics.stance) ? tactics.stance : 'standard';
    // defender posture: the player sets a standing order; AI houses decide on the day
    let posture = to.posture || 'hold';
    if (defF && defF !== S.player) {
      const bestInt = defOfficers.length ? Math.max(...defOfficers.map((o) => o.int)) : 0;
      posture = bestInt >= 85 && Math.random() < 0.5 ? 'ambush' : to.troops >= troops * 1.1 && Math.random() < 0.5 ? 'sally' : 'hold';
    }
    const R = { from: fromId, to: toId, attacker: attF, defender: defF, attOfficers: officerNames, defOfficers: defOfficers.map((o) => o.name), lines: [], result: null, captives: [] };
    const L = (text, cls = '') => R.lines.push({ text, cls });
    for (const o of attOfficers) o.acted = true;

    let a = troops, d = to.troops;
    const a0 = a, d0 = d;
    if (!external) from.troops -= troops;
    R.startA = a0; R.startD = d0;
    const fromTraining = external ? 60 : from.training;
    const mods = battleModifiers(fromId, toId);
    mods.external = external;
    R.mods = mods;

    const aFallback = MILITIA, dFallback = defF ? GARRISON : MILITIA;
    const aWar = best(attOfficers, 'war', aFallback), aLdr = best(attOfficers, 'ldr', aFallback), aInt = best(attOfficers, 'int', aFallback);
    const dWar = best(defOfficers, 'war', dFallback), dLdr = best(defOfficers, 'ldr', dFallback), dInt = best(defOfficers, 'int', dFallback);
    const aIntName = attOfficers.length ? attOfficers.reduce((m, o) => (o.int > m.int ? o : m)).name : 'The attackers';
    const dIntName = defOfficers.length ? defOfficers.reduce((m, o) => (o.int > m.int ? o : m)).name : 'The defenders';

    L(`${fname(attF)} marches ${fmt(a0)} troops from ${pname(fromId)} against ${pname(toId)} (${fname(defF)}, ${fmt(d0)} defenders, walls ${to.defense}).`, 'head');
    L(`Commanders: ${officerNames.join(', ')} vs ${defOfficers.length ? R.defOfficers.join(', ') : dFallback.name}.`);
    for (const n of mods.notes) L(n, 'terrain');
    let aMorale = 1, dMorale = 1;
    // stances, postures and skills
    let stanceAtt = 1, stanceLoss = 1, wallMult = 1, stratMultA = 1, stratMultD = 1, postureDef = 1, ambushRounds = 0;
    if (stance === 'assault') { stanceAtt = 1.15; stanceLoss = 1.2; L('The attackers storm the walls head-on: strength ×1.15, losses ×1.2.', 'strat'); }
    if (stance === 'siege') { wallMult *= 0.7; stanceAtt = 0.9; L('The attackers invest the city with engines and mines: walls count 30% less, strength ×0.9, a longer siege.', 'strat'); }
    if (stance === 'feint') { stratMultA *= 2; stanceAtt = 0.92; L('The attackers feint and probe, waiting for a chance: schemes twice as likely, strength ×0.92.', 'strat'); }
    if (partyHas(attOfficers, 'siege')) { wallMult *= 0.7; L(`${attOfficers.find((o) => hasSkill(o, 'siege')).name}'s siegecraft: walls count 30% less.`, 'strat'); }
    if (partyHas(attOfficers, 'cavalry')) { const horse = hasTrait(from, 'horses') || mods.frozen; stanceAtt *= horse ? 1.15 : 1.08; L(`${attOfficers.find((o) => hasSkill(o, 'cavalry')).name} leads the cavalry: strength ×${horse ? '1.15' : '1.08'}.`, 'strat'); }
    if (partyHas(attOfficers, 'stratagem')) stratMultA *= 1.6;
    if (partyHas(defOfficers, 'stratagem')) stratMultD *= 1.6;
    if (partyHas(defOfficers, 'guardian')) { postureDef *= 1.1; L(`${defOfficers.find((o) => hasSkill(o, 'guardian')).name} holds the walls: defence ×1.1.`, 'strat'); }
    if (defOfficers.length && posture === 'hold') { postureDef *= 1.08; L('The defenders hold their walls: defence ×1.08.', 'strat'); }
    if (defOfficers.length && posture === 'sally') { postureDef *= 0.92; stanceLoss *= 1.25; L('The defenders sally out to meet the attack: defence ×0.92, attacker losses ×1.25.', 'strat'); }
    if (defOfficers.length && posture === 'ambush') { if (dInt > aInt) { ambushRounds = 2; L(`${dIntName} has laid ambushes on the approaches!`, 'strat'); } else { postureDef *= 0.95; L('The defenders wait in ambush, but the attackers see it coming: defence ×0.95.', 'strat'); } }
    // a chosen stratagem, if the commander is clever enough
    let scheme = tactics.stratagem && aInt >= 75 ? tactics.stratagem : 'auto';
    if (scheme === 'fire' && isWinter()) { scheme = 'auto'; L('Too wet and cold for fire; the commander falls back on improvisation.', 'strat'); }
    if (scheme === 'flood' && !(mods.type === 'river' && (from.fleet || 0) >= 40)) scheme = 'auto';
    let schemeUsed = false;
    if (scheme === 'discord' && defOfficers.length) {
      const weak = defOfficers.filter((o) => !isRuler(o) && o.loyalty < 60 && !bondGroup(o.name)).sort((x, y) => x.loyalty - y.loyalty)[0];
      if (weak && Math.random() < 0.25 + (aInt - weak.loyalty) / 200) { weak.faction = attF; weak.city = external ? fromId : fromId; weak.loyalty = 55; L(`${aIntName} sows discord: ${weak.name} opens correspondence and goes over to the attackers before the battle!`, 'strat'); defOfficers.splice(defOfficers.indexOf(weak), 1); R.defOfficers = defOfficers.map((o) => o.name); }
      else L(`${aIntName}'s letters to the garrison find no takers.`, 'strat');
      dMorale *= 0.9; schemeUsed = true;
    }
    if (mods.loss > 0.005) {
      const drowned = Math.round(a * mods.loss);
      a -= drowned;
      L(`${fmt(drowned)} soldiers are lost to the water before the army lands.`, 'bad');
    }

    if (attOfficers.length && defOfficers.length && Math.random() < 0.45) {
      const ca = attOfficers.reduce((m, o) => (o.war > m.war ? o : m));
      const cd = defOfficers.reduce((m, o) => (o.war > m.war ? o : m));
      L(`${ca.name} rides before the walls and challenges ${cd.name} to single combat!`, 'duel');
      const pA = clamp(Math.pow(ca.war, 3) / (Math.pow(ca.war, 3) + Math.pow(cd.war, 3)) + duelBonus(ca) - duelBonus(cd), 0.05, 0.95);
      const bouts = ri(3, 60);
      if (Math.random() < pA) {
        dMorale = 0.82;
        L(`After ${bouts} bouts ${ca.name} unhorses ${cd.name}! The defenders' morale wavers.`, 'duel');
        if (Math.random() < 0.08 && !guarded(cd)) { const spoils = itemsOf(cd.name); L(`${cd.name} is slain on the field!`, 'bad'); for (const it of spoils) { giveItem(it.id, ca.name, true); L(`${ca.name} takes the ${it.name} from the fallen.`, 'good'); } killOfficer(cd, `slain in a duel by ${ca.name} before ${pname(toId)}`); }
      } else {
        aMorale = 0.82;
        L(`After ${bouts} bouts ${cd.name} drives ${ca.name} back! The attackers lose heart.`, 'duel');
        if (Math.random() < 0.08 && !guarded(ca)) { const spoils = itemsOf(ca.name); L(`${ca.name} is slain on the field!`, 'bad'); for (const it of spoils) { giveItem(it.id, cd.name, true); L(`${cd.name} takes the ${it.name} from the fallen.`, 'good'); } killOfficer(ca, `slain in a duel by ${cd.name} before ${pname(toId)}`); }
      }
    }

    const maxRounds = stance === 'siege' ? 16 : 12;
    for (let r = 1; r <= maxRounds; r++) {
      const aPow = a * (0.5 + aWar / 100) * (0.7 + aLdr / 250) * (0.7 + fromTraining / 300) * aMorale * mods.att * stanceAtt;
      const dPow = d * (0.5 + dWar / 100) * (0.7 + dLdr / 250) * (0.7 + to.training / 300) * (1 + (to.defense * wallMult) / WALL_DIV) * dMorale * mods.def * postureDef;
      let dmgD = aPow * 0.075 * rnd(0.8, 1.2);
      let dmgA = dPow * 0.075 * rnd(0.8, 1.2) * stanceLoss;
      let note = '';
      if (ambushRounds > 0) { dmgA *= 1.6; ambushRounds--; note = ` Arrows and boulders rain from the ${pick(['hillsides', 'reed beds', 'ruined farmsteads'])}: the ambush bites!`; }
      if (!schemeUsed && scheme === 'fire' && Math.random() < (aInt - dInt + 30) / 200) { dmgD *= 2.5; schemeUsed = true; note = ` ${aIntName}'s fire attack! Flames race through the ${pick(['camp', 'granaries', 'siege lines'])} and the defenders break in panic.`; }
      else if (!schemeUsed && scheme === 'flood' && r === 1) { dmgD *= 2.2; wallMult *= 0.7; schemeUsed = true; note = ` ${aIntName} breaks the dykes: the river pours into ${pname(toId)} and its walls crumble!`; }
      else if (!note && aInt > dInt && Math.random() < ((aInt - dInt) / 140) * stratMultA) {
        dmgD *= 1.9; note = ` ${aIntName}'s ${pick(['fire attack', 'night raid', 'feigned retreat', 'sabotage of the gates'])} throws the defenders into chaos!`;
      } else if (!note && dInt > aInt && Math.random() < ((dInt - aInt) / 140) * stratMultD) {
        dmgA *= 1.9; note = ` ${dIntName} springs an ${pick(['ambush', 'unexpected sortie', 'trap of boulders and arrows'])} on the attackers!`;
      }
      a = Math.max(0, Math.round(a - dmgA));
      d = Math.max(0, Math.round(d - dmgD));
      L(`Round ${r}: attackers ${fmt(a)}, defenders ${fmt(d)}.${note}`, note ? 'strat' : '');
      if (d <= 0) { R.result = 'captured'; break; }
      if (a <= 0) { R.result = 'annihilated'; break; }
      if (a < a0 * 0.2) { R.result = 'retreat'; L('The army is too battered to continue. It withdraws.', 'bad'); break; }
    }
    if (!R.result) { R.result = 'retreat'; L('The siege drags on without a breakthrough. The attackers withdraw.', 'bad'); }

    R.endA = a; R.endD = d;
    to.troops = d;
    settleBattle(R, a, a0, attOfficers, defOfficers, external);
    return R;
  }

  // What happens after the fighting, shared by the abstract battle and the tactical one: the city changes hands
  // or the attackers go home, then the record, relations, reputation and reports.
  function settleBattle(R, a, a0, attOfficers, defOfficers, external) {
    const from = prov(R.from), to = prov(R.to); const attF = R.attacker, defF = R.defender; const fromId = R.from, toId = R.to;
    const L = (text, cls = '') => R.lines.push({ text, cls });
    if (R.result === 'captured' && S.factions[attF].raider) {
      R.result = 'raided';
      const loot = Math.floor(to.gold * 0.6), grain = Math.floor(to.food * 0.4);
      to.gold -= loot; to.food -= grain; to.pop = Math.floor(to.pop * 0.95);
      to.defense = Math.max(0, Math.floor(to.defense * 0.8)); to.order = clamp((to.order || 50) - 15, 0, 100);
      from.gold += loot; from.food += grain; from.troops += a;
      L(`The riders of ${fname(attF)} sack ${pname(toId)}, carrying off ${fmt(loot)} gold and ${fmt(grain)} food, and vanish back into the steppe.`, 'bad');
    } else if (R.result === 'captured') {
      captureCity(R, attOfficers, defOfficers, a);
    } else {
      if (external) S.factions[attF].household.troops += a; else from.troops += a;
      if (R.result === 'annihilated') {
        L(`The army of ${fname(attF)} is destroyed beneath the walls of ${pname(toId)}!`, 'bad');
        // commanders scatter home
      } else {
        L(`${fname(attF)} retreats to ${pname(fromId)} with ${fmt(a)} survivors.`, 'bad');
      }
      // wall damage from the siege
      to.defense = Math.max(0, to.defense - ri(5, 25));
    }
    const summary = R.result === 'captured'
      ? `${fname(attF)} captured ${pname(toId)} from ${fname(defF)}!`
      : R.result === 'raided'
        ? `${fname(attF)}'s riders sacked ${pname(toId)} (${fname(defF)})!`
        : `${fname(attF)}'s attack on ${pname(toId)} was repelled by ${fname(defF)}.`;
    log(summary, 'war');
    S.stats.battles++; if (R.result === 'captured') S.stats.captures++;
    if (defF) shiftRelation(attF, defF, -25);
    if (defF) { S.factions[defF].attackedBy = S.factions[defF].attackedBy || {}; S.factions[defF].attackedBy[attF] = S.turn; }
    if (R.result === 'captured') { const A = S.factions[attF]; A.gains = (A.gains || []).filter((t) => S.turn - t < 36); A.gains.push(S.turn); }
    if (R.result === 'captured' || R.result === 'raided') { if (defF) S.factions[defF].lastLoss = S.turn; }
    else { S.factions[attF].lastLoss = S.turn; S.factions[attF].caution = Math.min(1.5, (S.factions[attF].caution || 1) + 0.15); }
    if (R.result === 'captured' && a > a0 * 0.7) S.factions[attF].caution = Math.max(0.85, (S.factions[attF].caution || 1) - 0.1);
    if (attF === S.player || defF === S.player || (S.observer && R.result !== 'retreat' && R.result !== 'annihilated')) S.notices.push({ text: summary, cls: 'war', report: R });
  }

  function captureCity(R, attOfficers, defOfficers, remaining) {
    const to = prov(R.to), from = prov(R.from);
    const attF = R.attacker, defF = R.defender;
    const L = (text, cls = '') => R.lines.push({ text, cls });
    L(`The gates of ${pname(R.to)} fall! ${fname(attF)} takes the city.`, 'good');

    to.owner = attF;
    to.troops = remaining;
    to.order = clamp(25 + (has(attF, 'honourable') ? 10 : 0) - (has(attF, 'treacherous') ? 5 : 0), 0, 100);
    to.posture = 'hold';
    to.training = R.mods && R.mods.external ? 60 : from.training;
    to.defense = Math.max(0, Math.floor(to.defense * 0.7));
    to.pop = Math.floor(to.pop * 0.95);
    // a beloved lord's people follow him: part of the population leaves with the defeated house
    if (defF && rulerOf(defF) && rulerOf(defF).chr >= 88 && !S.factions[defF].raider) {
      const leaving = Math.floor(to.pop * 0.06); to.pop -= leaving;
      const dest = factionProvinces(defF).filter((q) => q.id !== R.to).sort((a, b) => (S.adj[R.to].includes(b.id) ? 1 : 0) - (S.adj[R.to].includes(a.id) ? 1 : 0))[0];
      if (dest) { dest.pop += leaving; dest.food += Math.floor(leaving / 10); L(`${fmt(leaving)} of the people of ${pname(R.to)} follow ${rulerOf(defF).name} on the road to ${pname(dest.id)}.`); }
      else { const F = S.factions[defF]; F.household = F.household || { troops: 0, gold: 0 }; F.household.troops += Math.floor(leaving / 25); L(`The people of ${pname(R.to)} follow ${rulerOf(defF).name} into the wilderness; the young men take up arms for him.`); }
    }
    for (const o of attOfficers) o.city = R.to;

    // captives previously held here by the old owner are freed: home if their house lives, else masterless
    for (const c of captivesIn(R.to, defF)) {
      c.captive = null;
      if (c.faction && S.factions[c.faction].alive && factionProvinces(c.faction).length) { c.city = nearestOwnedCity(R.to, c.faction).id; L(`${c.name} is freed from the dungeons and returns to ${fname(c.faction)}.`); }
      else { c.faction = null; c.loyalty = 0; L(`${c.name} is freed from the dungeons.`); }
    }

    if (defF) {
      const remainingCities = factionProvinces(defF);
      const destroyed = remainingCities.length === 0;
      // a wandering lord slips away with most of his companions rather than being taken
      const exile = destroyed && S.factions[defF].wanderer;
      const flight = destroyed && !exile && S.adj[R.to].some((n) => !prov(n).owner);   // a masterless city next door: the remnant seizes it
      const escapees = [];
      for (const o of defOfficers.filter((x) => S.officers[x.name])) {
        const ruler = isRuler(o);
        const swift = canEscape(o);
        if ((exile || flight) && (swift || Math.random() < (ruler ? 0.9 : 0.7))) {
          escapees.push(o);
        } else if (!destroyed && (swift || Math.random() < (ruler ? 0.75 : 0.6))) {
          const refuge = nearestOwnedCity(R.to, defF);
          o.city = refuge.id;
          L(`${o.name} escapes to ${pname(refuge.id)}${swift ? ' on his famous horse' : ''}.`);
        } else if (destroyed && !ruler && Math.random() < 0.35) {
          o.faction = null; o.loyalty = 0;
          o.city = pick(Object.keys(S.provinces).filter((id) => id !== R.to));
          L(`${o.name} slips away into hiding.`);
        } else {
          o.captive = attF; o.city = R.to;
          R.captives.push(o.name);
          L(`${o.name} is captured!`, 'good');
        }
      }
      if (flight && escapees.some(isRuler) && fleeToEmpty(defF, R.to, R.startD * 0.3, to.gold * 0.3)) {
        L(`${fname(defF)} is not finished: the remnant of the house rides for masterless ground.`, 'head');
      } else if (exile && escapees.length && (goGuest(defF, R.to, attF, R.startD * 0.2, to.gold * 0.2) || fleeToEmpty(defF, R.to, R.startD * 0.3, to.gold * 0.3))) {
        const F = S.factions[defF];
        if (!escapees.some(isRuler)) { const heir = escapees.reduce((m, o) => (heirScore(defF, o) > heirScore(defF, m) ? o : m)); F.ruler = heir.name; F.name = F.dynasty || heir.name; heir.loyalty = 100; L(`With his lord taken, ${heir.name} leads the remnant of the house.`, 'head'); }
        to.gold = Math.floor(to.gold * 0.8);
        L(`${escapees.map((o) => o.name).join(', ')} escape with ${fmt(Math.floor(R.startD * 0.2))} loyal soldiers to ${pname(rulerOf(F.host).city)} and shelter as guests of ${fname(F.host)}.`, 'head');
        S.notices.push({ text: `${fname(defF)} has lost his last city and lives in exile under ${fname(F.host)}.`, cls: 'hist', major: true });
      } else if (destroyed) {
        S.factions[defF].alive = false;
        L(`The house of ${fname(defF)} is no more!`, 'head');
        log(`${fname(defF)} has been destroyed by ${fname(attF)}.`, 'hist');
        // any captives held elsewhere by the destroyed faction go free
        for (const o of allOfficers()) if (o.captive === defF) { o.captive = null; o.faction = null; }
        // ruler stops being anyone's ruler; a captured ruler is treated like any officer
        for (const o of allOfficers()) if (o.faction === defF && !o.captive) { o.faction = null; o.loyalty = 0; }
        S.notices.push({ text: `${fname(defF)} has been destroyed by ${fname(attF)}.`, cls: 'hist', major: true });
      }
    }
    for (const n of R.captives) S.pendingCaptives.push({ name: n, captor: attF, city: R.to, from: defF });
    // the Emperor follows the city
    if (defF && S.factions[defF].hasEmperor && rulerOf(defF) && rulerOf(defF).city === R.to) {
      S.factions[defF].hasEmperor = false; S.factions[attF].hasEmperor = true;
      L(`The Emperor falls into the hands of ${fname(attF)}!`, 'head');
      notice(`The Emperor has passed into the keeping of ${fname(attF)}.`, 'hist', { major: true });
    }
    // guests sheltering here move on with their host, or find a new one
    for (const g of allOfficers().filter((o) => o.city === R.to && o.faction && o.faction !== attF && o.faction !== defF && !o.captive)) {
      const G = S.factions[g.faction];
      if (!G || !G.alive || !G.guest) continue;
      if (G.host === defF && factionProvinces(defF).length) { g.city = nearestOwnedCity(R.to, defF).id; }
      else if (!goGuest(g.faction, R.to, attF)) dissolveHouse(g.faction);
    }
  }

  // A lord who loses his last city may seize a masterless one next door with the remnant of his army instead of vanishing.
  function fleeToEmpty(fid, fromCity, troops = 0, gold = 0) {
    const F = S.factions[fid]; if (!F || !F.alive || factionProvinces(fid).length) return false;
    const empty = S.adj[fromCity].map(prov).filter((p) => !p.owner).sort((a, b) => a.troops - b.troops)[0];
    if (!empty) return false;
    empty.owner = fid; empty.troops = Math.floor(empty.troops * 0.5 + troops); empty.gold += Math.floor(gold); empty.order = Math.max(empty.order || 45, 55); empty.posture = 'hold';
    for (const o of allOfficers()) if (o.faction === fid && !o.captive) o.city = empty.id;
    F.lastLoss = S.turn;
    notice(`${fname(fid)}, driven from ${pname(fromCity)}, seizes masterless ${pname(empty.id)} with the remnant of the army.`, 'hist', { major: fid === S.player });
    return true;
  }

  // ---------- wandering houses: exile as a guest ----------
  function goGuest(fid, fromCity, exclude, troops = 0, gold = 0, forced = null) {
    const F = S.factions[fid];
    const candidates = Object.values(S.factions).filter((h) => h.alive && !h.raider && !h.guest && h.id !== fid && h.id !== exclude && factionProvinces(h.id).length);
    if (!candidates.length) return false;
    const near = candidates.filter((h) => S.adj[fromCity].some((n) => prov(n).owner === h.id));
    const pool = near.length ? near : candidates;
    // a wanderer prefers hosts who hold the cities of his destiny, and kinsmen of his own surname
    const dest = destinyTargets(fid);
    const kin = (h) => rulerOf(h.id) && familyName(rulerOf(h.id).name) === familyName(rulerOf(fid) ? rulerOf(fid).name : F.ruler);
    const hostScore = (h) => { const seat = rulerOf(h.id) ? rulerOf(h.id).city : factionProvinces(h.id)[0].id; const weakNear = neighbors(seat).filter((n) => n.owner !== h.id && (!n.owner || n.troops < 6000)).length; return relation(fid, h.id) + weakNear * 12 + factionProvinces(h.id).length * 3 + factionProvinces(h.id).filter((p) => dest.has(p.id)).length * 15 + (kin(h) ? 12 : 0); };
    const host = forced && S.factions[forced] && S.factions[forced].alive && factionProvinces(forced).length ? S.factions[forced] : pool.reduce((m, h) => (hostScore(h) > hostScore(m) ? h : m));
    const seat = rulerOf(host.id) ? rulerOf(host.id).city : factionProvinces(host.id)[0].id;
    for (const o of allOfficers()) if (o.faction === fid && !o.captive) { o.city = seat; o.acted = true; }
    const wasGuest = F.guest;
    // a born wanderer like Liu Bei may fall four times before the land gives him up; other lords twice
    if (!wasGuest) { F.exiles = (F.exiles || 0) + 1; if (!F.wanderer && F.exiles > 2) { log(`${F.name} has lost everything for the third time; no lord will shelter such a house again.`, 'hist'); return false; } }
    F.guest = true; F.host = host.id; F.guestSince = S.turn; F.favor = kin(host) ? 62 : 50; F.petitionUntil = 0;
    F.household = F.household || { troops: 0, gold: 0 };
    F.household.troops += Math.floor(troops); F.household.gold += Math.floor(gold);
    shiftRelation(fid, host.id, 15);
    log(`${fname(fid)} takes shelter as a guest of ${fname(host.id)} at ${pname(seat)}${F.household.troops ? ` with ${fmt(F.household.troops)} loyal soldiers` : ''}.`, 'hist');
    return true;
  }
  function wake(fid, cityId) {
    const F = S.factions[fid];
    if (!F.alive) return;
    const patron = F.guest && F.host && S.factions[F.host] && S.factions[F.host].alive && prov(cityId).owner === F.host ? F.host : null;   // a fief granted by the host makes a vassal, not a rival
    if (prov(cityId).owner !== fid) transferCity(cityId, fid);
    for (const o of allOfficers()) if (o.faction === fid && !o.captive && prov(o.city).owner !== fid) { o.city = cityId; }
    const p = prov(cityId);
    if (F.household) { p.troops += F.household.troops; p.gold += F.household.gold; F.household = { troops: 0, gold: 0 }; }
    if (patron) { const d = dip(fid, patron); d.status = 'alliance'; d.until = S.turn + 60; setRelation(fid, patron, Math.max(relation(fid, patron), 40)); }
    if (F.guest) log(`${fname(fid)} leaves the court of ${fname(F.host)} and raises his banner over ${pname(cityId)}.`, 'hist');
    F.guest = false; F.host = null; F.favor = 0;
  }
  const hostSeat = (fid) => {
    const F = S.factions[fid]; const r = rulerOf(fid); const H = F.host && S.factions[F.host];
    if (H && H.alive) { if (r && prov(r.city).owner === F.host) return r.city; const h = rulerOf(F.host); if (h) return h.city; const c = factionProvinces(F.host)[0]; if (c) return c.id; }
    return r ? r.city : Object.keys(S.provinces)[0];
  };
  function useGuestOfficer(fid, name) {
    const F = S.factions[fid]; const o = off(name);
    if (!F || !F.guest) return fail('Your house is not in exile.');
    if (!o || o.faction !== fid || o.captive) return fail(`${name} is not of your house.`);
    if (o.acted) return fail(`${name} has already acted this month.`);
    if (prov(o.city).owner !== F.host) return fail(`${name} is not at the host's court.`);
    return null;
  }
  // ---- exile actions ----
  function exileServe(fid, name) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const F = S.factions[fid], o = off(name), p = prov(o.city);
    const key = p.agri <= p.comm ? 'agri' : 'comm';
    const gain = Math.floor(o.pol / 8 + ri(0, 5));
    p[key] = clamp(p[key] + gain, 0, 999);
    if (o.war >= 70) p.training = clamp(p.training + Math.floor(o.ldr / 16), 0, 100);
    const fav = Math.floor(2 + o.pol / 25 + (o.chr >= 80 ? 1 : 0));
    F.favor = clamp(F.favor + fav, 0, 100);
    const stipend = 60 + o.pol;
    F.household.gold += stipend;
    o.acted = true;
    return ok(`${o.name} served ${fname(F.host)} at ${pname(p.id)}: favour +${fav}, and a stipend of ${stipend} gold for the household.`);
  }
  function petitionChance(fid, o) {
    const F = S.factions[fid]; const cities = factionProvinces(F.host).length;
    return clamp((F.favor - 45) / 100 + o.chr / 400 + o.pol / 500 + (F.prestige || 0) / 300 + (cities - 2) * 0.05, 0.03, 0.85);
  }
  function exilePetition(fid, name) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const F = S.factions[fid], o = off(name);
    if (F.petitionUntil > S.turn) return fail(`${fname(F.host)} will not hear another petition for ${F.petitionUntil - S.turn} month(s).`);
    const hostCities = factionProvinces(F.host);
    if (hostCities.length < 2) return fail(`${fname(F.host)} has only one city and nothing to grant.`);
    o.acted = true; F.petitionUntil = S.turn + 6;
    if (S.factions[F.host].phase && S.factions[F.host].phase !== 'rising') { F.favor = clamp(F.favor - 3, 0, 100); return ok(`${fname(F.host)} rules half the land and grants no fiefs to guests. ${o.name} is sent away with fine words. Favour -3.`, 'bad'); }
    if (Math.random() < petitionChance(fid, o)) {
      const seat = hostSeat(fid);
      const dest = destinyTargets(fid);
      const exposure = (p) => neighbors(p.id).filter((n) => n.owner !== F.host && n.owner !== fid && (!n.owner || canAttack(n.owner, F.host))).length;
      const grant = hostCities.filter((p) => p.id !== seat).sort((a, b) => (dest.has(b.id) ? 1 : 0) - (dest.has(a.id) ? 1 : 0) || exposure(a) - exposure(b) || a.troops - b.troops)[0];
      const host = F.host;
      wake(fid, grant.id);
      shiftRelation(fid, host, 20);
      concludeTreaty(fid, host, 'ceasefire');
      const msg = `${o.name} pleads the house's case, and ${fname(host)} grants ${pname(grant.id)} as a fief. ${fname(fid)} is a lord once more!`;
      (fid === S.player || S.observer) ? notice(msg, 'hist', { major: true }) : log(msg, 'hist');
      return { ok: true, msg };
    }
    F.favor = clamp(F.favor - 5, 0, 100);
    return ok(`${o.name} petitions for a fief, but ${fname(F.host)} puts him off with fine words. Favour -5.`, 'bad');
  }
  function exileRecruit(fid, name, targetName) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const o = off(name), t = off(targetName);
    if (!t || t.faction !== null || t.city !== o.city) return fail(`${targetName} cannot be recruited here.`);
    o.acted = true;
    if (Math.random() < recruitChance(o, t, rulerOf(fid).chr, fid)) { t.faction = fid; t.loyalty = 60 + ri(0, 20); return ok(`${t.name} throws in his lot with the exiled house of ${fname(fid)}.`, 'good'); }
    return ok(`${t.name} will not follow a lord without a city.`, 'bad');
  }
  function exileRaise(fid, name) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const F = S.factions[fid], o = off(name);
    if (F.household.gold < 150) return fail('The household purse needs 150 gold to raise volunteers.');
    const n = Math.floor(((o.ldr + o.chr) / 2) * 15 + ri(0, 200) + (F.prestige || 0) * 5);
    F.household.gold -= 150; F.household.troops += n; o.acted = true;
    const seat = prov(hostSeat(fid));
    let note = '';
    if (F.household.troops > seat.troops * 0.5) { F.favor = clamp(F.favor - 3, 0, 100); note = ` ${fname(F.host)} eyes the growing camp uneasily (favour -3).`; }
    return ok(`${o.name} gathers ${fmt(n)} volunteers to the household banner (${fmt(F.household.troops)} in all).${note}`);
  }
  function exileFight(fid, name) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const F = S.factions[fid], o = off(name), p = prov(o.city);
    const enemies = neighbors(p.id).filter((n) => n.owner !== F.host && (!n.owner || treatyStatus(F.host, n.owner) === 'neutral'));
    if (!enemies.length) return fail(`${fname(F.host)} has no enemies near ${pname(p.id)} to fight.`);
    o.acted = true;
    const power = (o.war + o.ldr) / 2;
    if (Math.random() < 0.35 + power / 200) {
      const fav = Math.floor(4 + power / 20); F.favor = clamp(F.favor + fav, 0, 100);
      F.prestige = clamp((F.prestige || 0) + 2, 0, 100);
      p.training = clamp(p.training + 3, 0, 100);
      return ok(`${o.name} leads ${fname(F.host)}'s riders against raiders from ${pname(pick(enemies).id)} and returns with heads on his saddle. Favour +${fav}, prestige +2.`, 'good');
    }
    F.household.troops = Math.max(0, F.household.troops - Math.floor(F.household.troops * 0.05));
    return ok(`${o.name} skirmishes on ${fname(F.host)}'s border without much to show for it.`);
  }
  function exileSeekPatron(fid, name, newHost) {
    const e = useGuestOfficer(fid, name); if (e) return e;
    const F = S.factions[fid], H = S.factions[newHost];
    if (!H || !H.alive || H.raider || H.guest || newHost === fid || newHost === F.host || !factionProvinces(newHost).length) return fail('That lord cannot take you in.');
    const old = F.host;
    shiftRelation(fid, old, -15);
    const seat = rulerOf(newHost) ? rulerOf(newHost).city : factionProvinces(newHost)[0].id;
    for (const o of allOfficers()) if (o.faction === fid && !o.captive) { o.city = seat; o.acted = true; }
    F.host = newHost; F.favor = 40; F.guestSince = S.turn; F.petitionUntil = S.turn + 3;
    F.prestige = clamp((F.prestige || 0) - 3, 0, 100);
    shiftRelation(fid, newHost, 10);
    const msg = `${fname(fid)} takes leave of ${fname(old)} and rides to the court of ${fname(newHost)} at ${pname(seat)}.`;
    log(msg, 'hist');
    return { ok: true, msg };
  }
  function exileTargets(fid) {
    const F = S.factions[fid]; const seat = hostSeat(fid);
    return neighbors(seat).filter((n) => n.owner !== F.host && canAttack(fid, n.owner) && !battleModifiers(seat, n.id).blocked);
  }
  function exileSeize(fid, toId, officerNames, troops) {
    const F = S.factions[fid];
    if (!F.guest) return fail('Your house is not in exile.');
    for (const n of officerNames) { const e = useGuestOfficer(fid, n); if (e) return e; }
    if (!officerNames.length || officerNames.length > 3) return fail('Choose one to three commanders.');
    const seat = hostSeat(fid);
    if (!exileTargets(fid).some((t) => t.id === toId)) return fail('That city cannot be attacked from here.');
    troops = Math.floor(troops);
    if (troops <= 0 || troops > F.household.troops) return fail('Not enough household troops.');
    F.household.troops -= troops;
    const report = resolveBattle(seat, toId, officerNames, troops, { attF: fid, external: true });
    if (report.result === 'captured') {
      wake(fid, toId);
      notice(`${fname(fid)} storms ${pname(toId)} with his household troops and is a lord again!`, 'hist', { major: true });
    }
    return { ok: true, report };
  }
  function aiExile(fid) {
    const F = S.factions[fid];
    const H = S.factions[F.host];
    if (!H || !H.alive || !factionProvinces(F.host).length) { const at = rulerOf(fid) ? rulerOf(fid).city : null; if (!at || !goGuest(fid, at, F.host)) dissolveHouse(fid); return; }
    const seat = hostSeat(fid);
    const idle = () => factionOfficers(fid).filter((o) => !o.acted && prov(o.city).owner === F.host);
    // seize a weak neighbour when the household can take it
    const targets = exileTargets(fid);
    // do not seize a town that a giant next door will take straight back
    const safe = targets.filter((t) => !neighbors(t.id).some((n) => n.owner && n.owner !== F.host && n.owner !== t.owner && canAttack(n.owner, fid) && n.troops > F.household.troops * 2));
    if (safe.length && F.household.troops >= 3000) {
      const others = idle().filter((o) => !isRuler(o));
      const party = (others.length ? others : idle()).sort((a, b) => b.war - a.war).slice(0, 3);
      if (party.length) {
        const dest = destinyTargets(fid); const fated = safe.filter((x) => dest.has(x.id));
        const t = (fated.length ? fated : safe).reduce((m, x) => (defStrength(x) < defStrength(m) ? x : m));
        const m = battleModifiers(seat, t.id);
        const bar = dest.size && !dest.has(t.id) ? 1.7 : 1.25;   // a lord with a destiny does not scatter his strength on stray towns
        if (attStrength(F.household.troops * (1 - m.loss), party, { training: 60 }) * m.att > defStrength(t) * m.def * bar) { exileSeize(fid, t.id, party.map((o) => o.name), F.household.troops); if (!F.guest) return; }
      }
    }
    if (F.favor < 12 && Math.random() < 0.5) {
      const alt = Object.values(S.factions).filter((h) => h.alive && !h.raider && !h.guest && h.id !== fid && h.id !== F.host && factionProvinces(h.id).length).sort((a, b) => relation(fid, b.id) - relation(fid, a.id))[0];
      const o = idle()[0];
      if (alt && o) { exileSeekPatron(fid, o.name, alt.id); return; }
    }
    for (const o of idle()) {
      const free = freeOfficersIn(o.city);
      if (free.length && o.chr >= 70) { exileRecruit(fid, o.name, free[0].name); continue; }
      if (F.favor >= 60 && F.petitionUntil <= S.turn && factionProvinces(F.host).length >= 2 && !(S.factions[F.host].phase && S.factions[F.host].phase !== 'rising') && Math.random() < 0.6) { exilePetition(fid, o.name); continue; }
      if (F.household.gold >= 150 && F.household.troops < 12000 && o.ldr >= 70 && Math.random() < 0.5) { exileRaise(fid, o.name); continue; }
      if (o.war >= 80 && Math.random() < 0.4 && neighbors(o.city).some((n) => n.owner !== F.host)) { exileFight(fid, o.name); continue; }
      exileServe(fid, o.name);
    }
  }
  function dissolveHouse(fid) {
    const F = S.factions[fid];
    if (!F || !F.alive) return;
    F.alive = false; F.guest = false; F.host = null;
    for (const p of factionProvinces(fid)) { p.owner = null; p.troops = Math.floor(p.troops * 0.5); }
    for (const o of allOfficers()) { if (o.captive === fid) { o.captive = null; o.faction = null; } if (o.faction === fid && !o.captive) { o.faction = null; o.loyalty = 0; } }
    S.pendingCaptives = S.pendingCaptives.filter((c) => c.captor !== fid);
  }
  // Move a city to another owner (or to no one). Officers of the old owner in it are left masterless.
  function transferCity(cityId, toFid) {
    const p = prov(cityId); const prev = p.owner;
    if (prev === toFid) return;
    p.owner = toFid;
    for (const o of allOfficers()) if (o.city === cityId && o.faction === prev && prev && !o.captive && toFid !== prev) { o.faction = null; o.loyalty = 0; }
    if (prev && S.factions[prev].alive && !factionProvinces(prev).length && !S.factions[prev].guest) {
      if (!(S.factions[prev].wanderer && goGuest(prev, cityId, toFid, p.troops * 0.2, p.gold * 0.2)) && !fleeToEmpty(prev, cityId, p.troops * 0.3, p.gold * 0.3)) dissolveHouse(prev);
    }
  }
  function processGuests() {
    for (const F of Object.values(S.factions)) {
      if (!F.alive || !F.guest) continue;
      const months = S.turn - F.guestSince;
      const host = S.factions[F.host];
      if (!host || !host.alive || !factionProvinces(F.host).length) {
        const seatCity = rulerOf(F.id) ? rulerOf(F.id).city : null;
        if (!seatCity || !goGuest(F.id, seatCity, null)) { notice(`The house of ${F.name}, without a protector, scatters to the winds.`, 'hist'); dissolveHouse(F.id); }
        continue;
      }
      F.exileTotal = (F.exileTotal || 0) + 1;   // counted across every host and every stint
      if (months >= (F.wanderer ? 240 : 144) || F.exileTotal >= (F.wanderer ? 300 : 180)) { notice(`After long years in exile, the followers of ${F.name} drift away and the house is no more.`, 'hist'); dissolveHouse(F.id); continue; }
      // the household eats from the host's granary; a big camp wears out its welcome
      F.household = F.household || { troops: 0, gold: 0 };
      const seatP = prov(hostSeat(F.id));
      const eat = Math.floor(F.household.troops * FOOD_UPKEEP);
      if (seatP.food >= eat) seatP.food -= eat; else { const lost = Math.floor(F.household.troops * 0.1); F.household.troops -= lost; seatP.food = 0; }
      if (F.household.troops > 5000) F.favor = clamp(F.favor - 1, 0, 100);
      if ((F.prestige || 0) > (host.prestige || 0) + 20 && Math.random() < 0.05) {
        F.favor = clamp(F.favor - 15, 0, 100);
        const t = `${host.name} grows suspicious of his famous guest ${F.name}; the court whispers that a dragon does not stay long in a pond. Favour -15.`;
        (F.id === S.player) ? notice(t, 'bad') : log(t, 'bad');
      }
      if (F.favor <= 0) {
        const t = `${host.name} has had enough of ${F.name} and sends him away.`;
        (F.id === S.player) ? notice(t, 'bad') : log(t, 'bad');
        const seatCity = hostSeat(F.id);
        if (!goGuest(F.id, seatCity, F.host)) { notice(`Turned away everywhere, the house of ${F.name} scatters.`, 'hist'); dissolveHouse(F.id); }
        continue;
      }
      // a generous host may grant a border town to a favoured guest
      const hostCities = factionProvinces(F.host);
      if (months >= 24 && hostCities.length >= 2 && F.favor >= 70 && Math.random() < 0.1 && !(host.phase && host.phase !== 'rising')) {
        const seat = rulerOf(F.host).city;
        const grant = hostCities.filter((p) => p.id !== seat).sort((a, b) => a.troops - b.troops)[0];
        if (grant) {
          wake(F.id, grant.id);
          shiftRelation(F.id, F.host || host.id, 20);
          concludeTreaty(F.id, host.id, 'ceasefire');
          notice(`${host.name} grants ${pname(grant.id)} to his guest ${F.name}, who raises his own banner once more.`, 'hist', { major: true });
        }
      }
    }
  }

  function nearestOwnedCity(pid, fid) {
    const owned = factionProvinces(fid);
    const adjOwned = owned.filter((p) => S.adj[pid].includes(p.id));
    if (adjOwned.length) return pick(adjOwned);
    const here = PROVINCES.find((p) => p.id === pid);
    return owned.reduce((m, p) => {
      const q = PROVINCES.find((x) => x.id === p.id), mq = PROVINCES.find((x) => x.id === m.id);
      return Math.hypot(q.x - here.x, q.y - here.y) < Math.hypot(mq.x - here.x, mq.y - here.y) ? p : m;
    });
  }

  // ---------- captives ----------
  // A living house must have a lord of its own; if the lord is gone mid-month, run the succession now.
  function ensureRuler(fid) {
    const F = S.factions[fid];
    if (!F || !F.alive) return null;
    const r = off(F.ruler);
    if (r && r.faction === fid) return r;
    succession(fid, `${F.ruler} is lost to the house of ${F.name}.`);
    return F.alive ? off(F.ruler) : null;
  }

  function captiveChance(captorFid, o) {
    const ruler = ensureRuler(captorFid);
    if (!ruler) return 0;
    if (areEnemies(o.name, ruler.name)) return 0;
    if (bondedRuler(o, captorFid)) return 0;   // will not abandon a brother who still rules
    const originalLoyalty = o.faction && S.factions[o.faction].alive ? o.loyalty : Math.min(o.loyalty, 60);
    if (originalLoyalty >= 70 && o.faction && S.factions[o.faction].alive && factionProvinces(o.faction).length) return 0;   // a loyal man of a living house cannot be turned
    let c = (ruler.chr - originalLoyalty + 45) / 100;
    if (o.faction && S.factions[o.faction].ruler === o.name) { if (S.factions[o.faction].alive) return 0; c = Math.min(c, 0.35); }
    return clamp(c, 0.05, 0.9);
  }

  const ransomPrice = (o) => 300 + (o.ldr + o.war + o.int + o.pol + o.chr) * 3;
  function resolveCaptive(name, action) {
    const idx = S.pendingCaptives.findIndex((c) => c.name === name);
    if (idx < 0) return fail('No such captive.');
    const c = S.pendingCaptives.splice(idx, 1)[0];
    const o = off(name);
    if (!o) return fail(`${name} is no longer among the living.`);
    if (action === 'ransom') {
      const house = c.from && S.factions[c.from] && S.factions[c.from].alive && o.faction === c.from && factionProvinces(c.from).length ? c.from : null;
      const price = ransomPrice(o);
      if (!house) { S.pendingCaptives.splice(idx, 0, c); return fail(`${o.name} has no house left to pay for him.`); }
      const payer = factionProvinces(house).sort((x, y) => y.gold - x.gold)[0];
      const willing = payer && payer.gold >= price && (house === S.player || price <= payer.gold * 0.6 || o.war + o.int >= 150 || relation(house, c.captor) >= 0);
      if (!willing) { c.ransomRefused = true; S.pendingCaptives.splice(idx, 0, c); return fail(`${fname(house)} will not pay ${fmt(price)} gold for ${o.name}.`); }
      payer.gold -= price; prov(c.city).gold += price; shiftRelation(house, c.captor, 3);
      releaseCaptive(o, c);
      return ok(`${fname(house)} pays ${fmt(price)} gold and ${o.name} goes home.`, 'dip');
    }
    if (action === 'recruit') {
      const chance = captiveChance(c.captor, o);
      if (chance <= 0) { releaseCaptive(o, c); return ok(`${o.name} is the lord of a living house and will never serve another. ${fname(c.captor)} lets him go.`, 'bad'); }
      if (Math.random() < chance) {
        o.captive = null; o.faction = c.captor; o.city = c.city; o.loyalty = 50 + ri(0, 20);
        return ok(`${o.name} swears allegiance to ${fname(c.captor)}.`, 'good');
      }
      releaseCaptive(o, c);
      return ok(`${o.name} refuses to serve ${fname(c.captor)} and is released.`, 'bad');
    }
    if (action === 'execute') {
      const text = `${o.name} was executed by ${fname(c.captor)}. The officers of the realm are uneasy.`;
      const ownersPlayer = o.faction === S.player;
      for (const it of itemsOf(o.name)) { const r = rulerOf(c.captor); if (r) { giveItem(it.id, r.name, true); log(`${r.name} takes the ${it.name} from the condemned.`, 'good'); } }
      killOfficer(o, `by execution at the hands of ${fname(c.captor)}`);
      for (const x of factionOfficers(c.captor)) x.loyalty = clamp(x.loyalty - 4, 0, 100);
      if (ownersPlayer && c.captor !== S.player) notice(text, 'bad');
      return ok(text, 'bad');
    }
    releaseCaptive(o, c);
    return ok(`${o.name} was released by ${fname(c.captor)}.`);
  }

  function releaseCaptive(o, c) {
    o.captive = null;
    if (o.faction && S.factions[o.faction].alive && factionProvinces(o.faction).length) {
      o.city = nearestOwnedCity(c.city, o.faction).id;
    } else if (o.faction && S.factions[o.faction].alive && S.factions[o.faction].guest && rulerOf(o.faction)) {
      o.city = rulerOf(o.faction).city;   // rejoin the house in exile
    } else {
      o.faction = null; o.loyalty = 0;
    }
  }

  // ---------- turn processing ----------
  // ---------- treasures ----------
  const itemData = (id) => ITEMS.find((i) => i.id === id);
  const itemsOf = (name) => Object.values(S.items).filter((i) => i.owner === name).map((i) => itemData(i.id));
  const hiddenItemsIn = (pid) => Object.values(S.items).filter((i) => !i.owner && i.city === pid).map((i) => itemData(i.id));
  function giveItem(id, name, silent = false) {
    const it = itemData(id), st = S.items[id], o = off(name);
    if (!it || !st || !o) return false;
    if (st.owner) takeItem(id);
    st.owner = name; st.city = null;
    for (const [k, v] of Object.entries(it.bonus || {})) o[k] = clamp(o[k] + v, 1, 100);
    if (it.prestige && o.faction) { const F = S.factions[o.faction]; F.prestige = clamp((F.prestige || 0) + it.prestige, 0, 100); }
    if (!silent) log(`${o.name} now holds the ${it.name}.`, 'good');
    return true;
  }
  function takeItem(id) {
    const it = itemData(id), st = S.items[id];
    if (!st || !st.owner) return;
    const o = off(st.owner);
    if (o) {
      for (const [k, v] of Object.entries(it.bonus || {})) o[k] = clamp(o[k] - v, 1, 100);
      if (it.prestige && o.faction) { const F = S.factions[o.faction]; F.prestige = clamp((F.prestige || 0) - it.prestige, 0, 100); }
      st.city = o.city;
    }
    st.owner = null;
  }
  // when an officer dies, his treasures are lost in his city until someone finds them
  function dropItems(name, city) {
    for (const st of Object.values(S.items)) if (st.owner === name) { takeItem(st.id); st.city = city || st.city; }
  }
  function bestow(pid, fromName, toName) {
    const p = prov(pid), a = off(fromName), b = off(toName);
    if (!a || !b || a.city !== pid || b.city !== pid || a.faction !== p.owner || b.faction !== p.owner) return fail('Both officers must be in this city and of your house.');
    const held = itemsOf(fromName);
    if (!held.length) return fail(`${fromName} holds no treasure.`);
    const it = held[0];
    giveItem(it.id, toName, true);
    b.loyalty = clamp(b.loyalty + 10, 0, 100);
    return ok(`${a.name} presents the ${it.name} to ${b.name}, whose loyalty rises to ${b.loyalty}.`, 'good');
  }
  const duelBonus = (o) => itemsOf(o.name).reduce((s, it) => s + (it.duel || 0), 0);
  const guarded = (o) => itemsOf(o.name).some((it) => it.guard);
  const itemValue = (it) => (it.type === 'seal' ? 30 : 12 + Object.values(it.bonus || {}).reduce((a, b) => a + b, 0) * 2 + (it.escape ? 4 : 0) + (it.guard ? 4 : 0));
  const houseItems = (fid) => Object.values(S.items).filter((i) => i.owner && S.officers[i.owner] && S.officers[i.owner].faction === fid && !S.officers[i.owner].captive).map((i) => itemData(i.id));
  // gift a treasure to another lord
  function giftItem(fid, target, itemId) {
    const it = itemData(itemId), st = S.items[itemId];
    if (!it || !st || !st.owner || !S.officers[st.owner] || S.officers[st.owner].faction !== fid) return fail('You do not hold that treasure.');
    if (!S.factions[target] || !S.factions[target].alive) return fail('That house no longer exists.');
    const r = rulerOf(target); if (!r) return fail('That house has no lord to receive it.');
    const gain = Math.min(35, itemValue(it));
    giveItem(itemId, r.name, true);
    shiftRelation(fid, target, gain);
    return ok(`${fname(fid)} sends the ${it.name} to ${fname(target)}. ${r.name} is delighted; relations improve by ${gain}.`, 'dip');
  }
  const canEscape = (o) => itemsOf(o.name).some((it) => it.escape);

  // ---------- new blood: later generations and local talents ----------
  const TALENT_CAP = 70;
  function talentName() {
    for (let i = 0; i < 40; i++) {
      const n = `${pick(SURNAMES)} ${pick(GIVEN)}`;
      if (!S.officers[n] && !OFFICERS.some((r) => r[0] === n) && !LATER_OFFICERS.some((r) => r[0] === n)) return n;
    }
    return null;
  }
  function processArrivals() {
    // 1. historical figures come of age or come forward on their year (spread across the months)
    for (const r of LATER_OFFICERS) {
      const [name, ldr, war, int_, pol, chr, born, year, city, pref] = r;
      if (year !== S.year || S.officers[name] || S.arrived[name]) continue;
      const month = 1 + (name.length * 7 + city.length * 3) % 12;
      if (S.month !== month) continue;
      S.arrived[name] = S.turn;
      const house = pref && S.factions[pref] && S.factions[pref].alive && !S.factions[pref].guest && factionProvinces(pref).length ? pref : null;
      const where = house ? (prov(city).owner === house ? city : factionProvinces(house)[0].id) : city;
      S.officers[name] = { name, ldr, war, int: int_, pol, chr, faction: house, city: where, loyalty: house ? 80 : 0, born, acted: false, captive: null, skills: OFFICER_SKILLS[name] || [], rank: 0 };
      const text = house ? `${name} enters the service of ${fname(house)} at ${pname(where)}.` : `${name}, a talent of some repute, appears at ${pname(where)} looking for a lord.`;
      (house === S.player || prov(where).owner === S.player) ? notice(text, 'good') : log(text, 'good');
    }
    // 2. when the realm runs thin, local worthies come forward in the cities of living houses
    const living = allOfficers().filter((o) => !o.captive).length;
    const target = 120;
    // houses that have grown faster than their courts draw talent to them
    const short = Object.values(S.factions).filter((f) => f.alive && !f.raider && !f.guest && factionProvinces(f.id).length >= 2 && factionOfficers(f.id).length < factionProvinces(f.id).length * 1.2);
    const pull = short.length && living < 170 ? 0.15 : 0;
    S.generatedTalents = S.generatedTalents || 0;
    const wellDry = S.generatedTalents >= TALENT_CAP || S.year > 245;   // the age of heroes ends: no endless supply of nameless worthies
    if (!wellDry && (Math.random() < pull || (living < target && Math.random() < Math.min(0.9, 0.25 + (target - living) / 40)))) {
      const owned = Object.values(S.provinces).filter((p) => p.owner && !S.factions[p.owner].raider);
      // weight cities by their house's shortage of officers per city
      const weighted = owned.map((p) => { const f = S.factions[p.owner]; const ratio = factionOfficers(f.id).length / Math.max(1, factionProvinces(f.id).length); return { p, w: Math.max(0.2, 2.2 - ratio) }; });
      const total = weighted.reduce((a, x) => a + x.w, 0); let r = Math.random() * total; let p = weighted.length ? weighted[weighted.length - 1].p : pick(Object.values(S.provinces));
      for (const x of weighted) { r -= x.w; if (r <= 0) { p = x.p; break; } }
      const name = talentName();
      if (name) {
        S.generatedTalents++;
        const late = S.generatedTalents > TALENT_CAP * 0.6 ? 6 : 0;   // the later worthies are lesser men
        const q = (base) => clamp(Math.round(base - late + (Math.random() + Math.random() - 1) * 22), 20, 92);
        const kind = Math.random();
        const o = kind < 0.45 ? { ldr: q(66), war: q(70), int: q(45), pol: q(42), chr: q(52) } : kind < 0.8 ? { ldr: q(50), war: q(38), int: q(70), pol: q(72), chr: q(58) } : { ldr: q(62), war: q(58), int: q(62), pol: q(60), chr: q(64) };
        S.officers[name] = { name, ...o, faction: null, city: p.id, loyalty: 0, born: S.year - ri(20, 32), acted: false, captive: null, skills: Math.random() < 0.3 ? [pick(Object.keys(SKILL_INFO))] : [], rank: 0 };
        const text = `${name}, ${kind < 0.45 ? 'a fighter of local renown' : kind < 0.8 ? 'a scholar of some learning' : 'a capable man of good family'}, comes forward at ${pname(p.id)}.`;
        p.owner === S.player ? notice(text, 'good') : log(text, 'good');
      }
    }
  }

  // ---------- ageing and death ----------
  const age = (o) => S.year - (o.born == null ? S.year - 35 : o.born);
  function deathChancePerMonth(a) {
    const yearly = a < 45 ? 0.003 : a < 55 ? 0.015 : a < 65 ? 0.04 : a < 75 ? 0.1 : a < 85 ? 0.25 : 0.5;
    return yearly / 12;
  }
  const familyName = (name) => name.split(' ')[0];
  function heirScore(fid, o) {
    const fam = familyName(S.factions[fid].ruler) === familyName(o.name) ? 60 : 0;
    return fam + o.ldr + o.chr + o.pol / 2 + o.int / 2;
  }
  const heirCandidates = (fid) => factionOfficers(fid).filter((o) => !isRuler(o)).sort((a, b) => heirScore(fid, b) - heirScore(fid, a));

  function killOfficer(o, cause, scripted = false) {
    if (!S.officers[o.name]) return;
    const fid = o.faction, wasRuler = isRuler(o), captor = o.captive;
    const text = `${o.name} has died ${cause} at the age of ${age(o)}.`;
    S.stats.deaths++;
    dropItems(o.name, o.city);
    delete S.officers[o.name];
    S.pendingCaptives = S.pendingCaptives.filter((c) => c.name !== o.name);
    if (S.pendingSuccession && S.pendingSuccession.candidates) S.pendingSuccession.candidates = S.pendingSuccession.candidates.filter((n) => n !== o.name);
    if (wasRuler && fid && S.factions[fid].alive) { succession(fid, text); return; }
    if (scripted) { notice(text, 'hist', { major: true }); return; }
    (fid === S.player || captor === S.player) ? notice(text, 'bad') : log(text, 'bad');
  }

  function succession(fid, deathText) {
    const F = S.factions[fid];
    const cands = heirCandidates(fid);
    if (!cands.length) {
      F.alive = false;
      for (const p of factionProvinces(fid)) { p.owner = null; p.troops = Math.floor(p.troops * 0.5); }
      for (const o of allOfficers()) if (o.captive === fid) { o.captive = null; o.faction = null; }
      S.pendingCaptives = S.pendingCaptives.filter((c) => c.captor !== fid);
      notice(`${deathText} With no heir, the house of ${F.name} dissolves and its cities fall into anarchy.`, 'hist', { major: true });
      return;
    }
    const heir = cands[0];
    F.lastLoss = S.turn;
    F.ruler = heir.name; F.name = F.dynasty || heir.name; heir.loyalty = 100;
    F.lastSuccession = { turn: S.turn, rival: cands[1] ? cands[1].name : null };
    for (const o of factionOfficers(fid)) if (o.name !== heir.name) o.loyalty = clamp(o.loyalty - ri(5, 15), 0, 100);
    notice(`${deathText} ${heir.name} succeeds as lord of the house.`, 'hist', { major: true });
    if (fid === S.player && cands.length > 1) S.pendingSuccession = { fid, candidates: cands.map((c) => c.name) };
    else checkRestorations();
  }

  function chooseHeir(fid, name) {
    const F = S.factions[fid]; const o = off(name);
    if (!o || o.faction !== fid || o.captive) return fail(`${name} cannot take the seat.`);
    const old = off(F.ruler);
    if (old && old.name !== name) old.loyalty = 90;
    F.ruler = name; F.name = F.dynasty || name; o.loyalty = 100;
    F.lastSuccession = { turn: S.turn, rival: (S.pendingSuccession && S.pendingSuccession.candidates || []).find((n) => n !== name) || null };
    S.pendingSuccession = null;
    checkRestorations();
    return ok(`${name} takes the seat of the house.`, 'hist');
  }

  const scriptedDeath = (name) => HISTORICAL_DEATHS.find((d) => d[0] === name);
  const scriptedOn = () => !!(S.options && S.options.historicalDeaths);

  function processAgeing() {
    const newYear = S.month === 1;
    // scripted deaths fire first, on their historical date
    if (scriptedOn()) {
      for (const [name, y, m, cause] of HISTORICAL_DEATHS) {
        if (y === S.year && m === S.month && S.officers[name]) killOfficer(S.officers[name], cause, true);
      }
    }
    for (const o of allOfficers()) {
      const a = age(o);
      if (newYear) {
        if (a <= 22) for (const k of ['war', 'ldr', 'int']) if (o[k] < 95) o[k] += 1;
        if (a >= 60) o.war = Math.max(10, o.war - ri(0, 2));
        if (a >= 70) o.ldr = Math.max(10, o.ldr - ri(0, 2));
      }
      // with scripted history on, officers whose day is still to come rarely die early
      const sd = scriptedOn() ? scriptedDeath(o.name) : null;
      const damp = sd && (sd[1] > S.year || (sd[1] === S.year && sd[2] > S.month)) ? 0.1 : 1;
      if (Math.random() < deathChancePerMonth(a) * damp) {
        const where = o.city ? ` in ${pname(o.city)}` : '';
        const cause = a >= 65 ? pick([`of old age${where}`, `peacefully${where}`, `after a long illness${where}`]) : pick([`of illness${where}`, `of a sudden fever${where}`, `of wounds that never healed${where}`]);
        killOfficer(o, cause);
      }
    }
  }

  // ---------- historical events, decisions, objectives ----------
  let _eventApi = null;
  const api = () => _eventApi || (_eventApi = {
    prov, off, fname, pname, rulerOf, relation, shiftRelation, factionOfficers, factionProvinces, bordering, treatyStatus,
    transferCity, wake, dissolveHouse, breakTreaty, age, heirCandidates, totalTroops, canAttack, setRelation, officersIn, governorOf,
    officers: () => allOfficers().filter((o) => !o.captive),
    ceasefire: (a, b, months) => { const d = dip(a, b); d.status = 'ceasefire'; d.until = S.turn + months; },
    ally: (a, b, months) => { const d = dip(a, b); d.status = 'alliance'; d.until = S.turn + months; },
    setTitle: (fid, tier) => { const F = S.factions[fid]; if (F) F.title = tier; },
    goGuestTo: (fid, hostId, troops = 0, gold = 0) => { const r = rulerOf(fid); return r ? goGuest(fid, r.city, null, troops, gold, hostId) : false; },
    killQuiet: (name, cause) => { const o = off(name); if (o) killOfficer(o, cause, false); },
    prestige: (fid, n) => { const F = S.factions[fid]; if (F) F.prestige = clamp((F.prestige || 0) + n, 0, 100); },
    gold: (fid, n) => { const p = factionProvinces(fid)[0]; if (p) p.gold += n; },
    food: (fid, n) => { const p = factionProvinces(fid)[0]; if (p) p.food += n; },
    troops: (fid, n) => { const p = factionProvinces(fid)[0]; if (p) p.troops += n; },
    addOfficer: (spec) => { if (S.officers[spec.name]) return S.officers[spec.name]; S.officers[spec.name] = { acted: false, captive: null, skills: OFFICER_SKILLS[spec.name] || [], rank: 0, ...spec }; return S.officers[spec.name]; },
    // bring an officer into a house: free officers always, others only if `force`
    joinHouse: (name, fid, loyalty = 70, city = null, force = false) => {
      const o = off(name); if (!o || o.captive) return false;
      if (o.faction && o.faction !== fid && !force) return false;
      o.faction = fid; o.loyalty = loyalty;
      if (city) o.city = city; else if (prov(o.city).owner !== fid) { const p = factionProvinces(fid)[0]; if (p) o.city = p.id; }
      return true;
    },
    moveHouse: (fid, cityId) => { for (const o of allOfficers()) if (o.faction === fid && !o.captive) o.city = cityId; },
    kill: (name, cause) => { const o = off(name); if (o) killOfficer(o, cause, true); },
    giveItem: (id, name) => giveItem(id, name, true), takeItem, itemsOf, houseItems,
    capture: (name, captor) => { const o = off(name); if (!o || !S.factions[captor]) return; o.captive = captor; S.pendingCaptives.push({ name, captor, city: o.city, from: o.faction }); },
    warTarget: (fid, target, months) => { const F = S.factions[fid]; if (F && S.factions[target]) { F.warTarget = target; F.warTargetUntil = S.turn + months; } },
    // Found a new house mid-game from cities and officers of an existing one
    foundHouse: ({ id, name, ruler, color, cities, officers = [], wanderer = false, aggr = 1, absorb = true, persona = [] }) => {
      if (S.factions[id] && S.factions[id].alive) return false;
      const r = off(ruler); if (!r || r.captive || !cities.length) return false;
      const prev = prov(cities[0]).owner;
      S.factions[id] = { id, name, ruler, color, aggr, alive: true, raider: false, wanderer, prestige: 5, guest: false, host: null, guestSince: 0, hasEmperor: false, favor: 0, household: { troops: 0, gold: 0 }, petitionUntil: 0, persona, treachery: 0, lastLoss: -99, lastAttackTurn: -99, lastAttackTarget: null, plan: null, caution: 1 };
      for (const c of cities) { if (prov(c).owner === id) continue; const p = prov(c); const old = p.owner; p.owner = id;
        // the old house's ruler is never absorbed: he withdraws to another of his cities if he has one
        const oldRuler = old ? rulerOf(old) : null; const refuge = old ? factionProvinces(old).find((q) => q.id !== c) : null;
        for (const o of allOfficers()) if (o.city === c && o.faction === old && !o.captive) { if ((oldRuler && o === oldRuler || !absorb) && refuge) { o.city = refuge.id; continue; } o.faction = id; o.loyalty = 75; } if (old && S.factions[old].alive && !factionProvinces(old).length && !S.factions[old].guest) { if (!(S.factions[old].wanderer && goGuest(old, c, id))) dissolveHouse(old); } }
      r.faction = id; r.loyalty = 100; r.captive = null; if (prov(r.city).owner !== id) r.city = cities[0];
      for (const n of officers) { const o = off(n); if (o && !o.captive) { o.faction = id; o.loyalty = Math.max(o.loyalty, 80); if (prov(o.city).owner !== id) o.city = cities[0]; } }
      if (prev && S.factions[prev]) setRelation(id, prev, -60);
      return true;
    },
  });
  const inWindow = (from, to) => { const t = S.year * 12 + S.month, a = from[0] * 12 + from[1], b = to[0] * 12 + to[1]; return t >= a && t <= b; };

  function processEvents() {
    for (const ev of EVENTS) {
      if ((S.eventsFired[ev.id] && !ev.repeat) || !inWindow(ev.from, ev.to)) continue;
      if (S.pendingDecisions.some((d) => d.id === ev.id)) continue;
      if (ev.repeat && S.eventsFired[ev.id] && S.turn - S.eventsFired[ev.id] < 12) continue;
      let ctx;
      try { ctx = ev.when(api(), S); } catch (e) { ctx = null; }
      if (!ctx) continue;
      if (ev.decision) {
        const house = ev.decision.house || ctx.fid;
        if (house === S.player) { S.pendingDecisions.push({ id: ev.id, ctx }); continue; }
        // AI: weighted choice
        const opts = ev.decision.options; const total = opts.reduce((a, o) => a + o.ai, 0);
        let r = Math.random() * total, pick = opts[opts.length - 1];
        for (const o of opts) { r -= o.ai; if (r <= 0) { pick = o; break; } }
        S.eventsFired[ev.id] = ev.repeat ? S.turn : true;
        const text = pick.apply(api(), S, ctx);
        notice(`${ev.title}: ${text}`, 'hist', { major: !ev.minor });
      } else {
        S.eventsFired[ev.id] = ev.repeat ? S.turn : true;
        const text = ev.apply(api(), S, ctx);
        notice(`${ev.title}: ${text}`, 'hist', { major: !ev.minor });
      }
    }
  }
  function decide(index, optionIndex) {
    const d = S.pendingDecisions.splice(index, 1)[0];
    if (!d) return fail('No such decision.');
    const ev = EVENTS.find((e) => e.id === d.id);
    S.eventsFired[ev.id] = ev.repeat ? S.turn : true;
    const opt = ev.decision.options[optionIndex] || ev.decision.options[ev.decision.options.length - 1];
    const text = opt.apply(api(), S, d.ctx);
    return ok(`${ev.title}: ${text}`, 'hist');
  }
  function objectiveStatus(ob) {
    const key = `${ob.house}:${ob.id}`;
    if (S.objectivesDone[key]) return { state: 'done' };
    if (S.year > ob.to) return { state: 'missed' };
    if (S.year < ob.from) return { state: 'future' };
    if (ob.hold) { const have = ob.hold.filter((c) => S.provinces[c].owner === ob.house).length; return { state: 'active', progress: `${have}/${ob.hold.length}`, complete: have === ob.hold.length }; }
    return { state: 'active', progress: '', complete: !!ob.custom(api(), S) };
  }
  function processObjectives() {
    for (const ob of OBJECTIVES) {
      const F = S.factions[ob.house];
      if (!F || !F.alive) continue;
      const st = objectiveStatus(ob);
      if (st.state !== 'active' || !st.complete) continue;
      S.objectivesDone[`${ob.house}:${ob.id}`] = `${S.year}.${S.month}`;
      const text = ob.reward(api(), S);
      const line = `${fname(ob.house)} — ${ob.title}: ${text}`;
      (ob.house === S.player || S.observer) ? notice(line, 'hist', { major: true }) : log(line, 'hist');
    }
  }
  const destinyTargets = (fid) => { const list = DESTINY[fid]; if (!list) return new Set(); return new Set(list.filter((d) => S.year >= d.from && S.year <= d.to).flatMap((d) => d.targets)); };

  // ---------- diplomacy ----------
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  function dip(a, b) {
    const k = pairKey(a, b);
    if (!S.diplomacy[k]) S.diplomacy[k] = { rel: 0, status: 'neutral', until: 0, cooldown: 0 };
    return S.diplomacy[k];
  }
  const relation = (a, b) => (a && b && a !== b ? dip(a, b).rel : 0);
  function setRelation(a, b, v) { dip(a, b).rel = clamp(Math.round(v), -100, 100); }
  function shiftRelation(a, b, dv) { if (a && b && a !== b) setRelation(a, b, dip(a, b).rel + dv); }
  function treatyStatus(a, b) {
    if (!a || !b || a === b) return 'neutral';
    const d = dip(a, b);
    if (d.status === 'alliance' && !d.until) d.until = S.turn + ALLIANCE_MONTHS;   // older saves: alliances had no term
    if ((d.status === 'ceasefire' || d.status === 'alliance') && d.until <= S.turn) { d.status = 'neutral'; }
    return d.status;
  }
  const canAttack = (a, b) => !b || treatyStatus(a, b) === 'neutral';
  const allies = (fid) => Object.keys(S.factions).filter((f) => f !== fid && S.factions[f].alive && treatyStatus(fid, f) === 'alliance');
  function relationWord(v) { return v <= -40 ? 'Hostile' : v <= -10 ? 'Cold' : v < 20 ? 'Neutral' : v < 50 ? 'Friendly' : 'Close'; }
  function bordering(a, b) {
    return factionProvinces(a).some((p) => neighbors(p.id).some((n) => n.owner === b));
  }
  function sharedEnemy(a, b) {
    return Object.keys(S.factions).some((f) => f !== a && f !== b && S.factions[f].alive && bordering(a, f) && bordering(b, f) && treatyStatus(a, f) === 'neutral' && treatyStatus(b, f) === 'neutral');
  }
  const DIP_COST = { ceasefire: 300, alliance: 500, joint: 200 };
  const CEASEFIRE_MONTHS = 12;
  const ALLIANCE_MONTHS = 60;   // an alliance is sworn for five years and must then be renewed

  // Probability that `to` accepts a proposal of `type` from `from`.
  function acceptChance(from, to, type, envoy) {
    const F = S.factions[to];
    let c = type === 'ceasefire' ? 0.4 : type === 'alliance' ? 0.15 : 0.3;
    c += relation(from, to) / 200;
    if (envoy) c += ((envoy.chr + envoy.pol) / 2 - 60) / 200;
    const sf = totalTroops(from), st = totalTroops(to);
    if (type === 'ceasefire') {
      if (st < sf) c += 0.25;
      if (st > sf * 2) c -= 0.2;
    } else if (type === 'alliance') {
      if (sf > st) c += 0.15;
      if (sharedEnemy(from, to)) c += 0.2;
      if (bordering(from, to) && F.aggr >= 1.2) c -= 0.15;
      if (relation(from, to) < 0) c -= 0.15;
    } else if (type === 'joint') {
      c += 0.1;
    }
    c -= (F.aggr - 1) * 0.2;
    const P = S.factions[from];
    c += (P.prestige || 0) / 500 + (P.hasEmperor ? 0.1 : 0) + legitimacy(from) + (envoy && hasSkill(envoy, 'orator') ? 0.08 : 0);
    if (diff() === 'hard' && from === S.player) c -= 0.1;
    // reputation: treaty-breakers and those who let ceasefires lapse to strike are not trusted
    c -= Math.min(0.45, 0.15 * (P.treachery || 0));
    if (has(from, 'treacherous')) c -= 0.1;
    if (has(to, 'cautious')) c += 0.1;
    if (type === 'ceasefire' || type === 'alliance') {
      const sf = totalTroops(from), st = totalTroops(to);
      const desperate = st < sf * 0.6;   // a house about to be crushed cannot be picky
      // a "sold" ceasefire: the proposer is fighting someone else and wants a free hand, then our turn comes
      const busyElsewhere = (P.plan && P.plan.enemy && P.plan.enemy !== to) || (S.turn - (P.lastAttackTurn || -99) <= 6 && P.lastAttackTarget && P.lastAttackTarget !== to);
      if (busyElsewhere && sf > st * 0.9 && !desperate) c -= 0.3;
      // massing on our border while talking peace
      if (borderTroops(from, to) > borderTroops(to, from) * 1.3 && !desperate) c -= 0.15;
      // the runaway leader gets no help, except from the cautious who would rather bend than break
      if (leaderHouse() === from) c += has(to, 'cautious') || has(to, 'builder') ? 0.15 : -0.4;
      // a hegemon takes peace only from the desperate, or from the second power it wants to court
      const H = S.factions[to];
      if (H.phase === 'unifying') return 0.03;   // the war of unification admits no truce
      if (H.phase && H.phase !== 'rising') { const sp = secondPower(to); if (lastFoe(to) === from && !desperate) c -= 0.6; else if (!(desperate || (sp && sp.id === from))) c -= 0.3; }
      // honourable houses remember broken words
      if (has(to, 'honourable') && (P.treachery || 0) > 0) c -= 0.15;
    }
    if (type === 'joint' && P.jointAgainst && leaderHouse() === P.jointAgainst) c += 0.3;
    return clamp(c, 0.03, 0.9);
  }

  function findEnvoy(fid, name) {
    const o = off(name);
    if (!o || o.faction !== fid || o.captive) return fail(`${name} is not available.`);
    if (o.acted) return fail(`${name} has already acted this month.`);
    if (prov(o.city).owner !== fid) return fail(`${name} is not in one of your cities.`);
    return o;
  }

  function proposeTreaty(fid, target, type, envoyName, sweetener = null) {
    if (!S.factions[target] || !S.factions[target].alive) return fail('That house no longer exists.');
    const d = dip(fid, target);
    if (type === 'alliance' && d.status === 'alliance' && d.until - S.turn > 12) return fail(`You are already allied for ${d.until - S.turn} more months; the pact can be renewed in its last year.`);
    if (type === 'ceasefire' && d.status !== 'neutral') return fail(`You already have a ${d.status} with ${fname(target)}.`);
    if (d.cooldown > S.turn && fid === S.player) return fail(`${fname(target)} will not receive another envoy for ${d.cooldown - S.turn} month(s).`);
    const envoy = findEnvoy(fid, envoyName); if (!envoy.name) return envoy;
    const city = prov(envoy.city);
    if (city.gold < DIP_COST[type]) return fail(`${pname(city.id)} needs ${DIP_COST[type]} gold to fund the embassy.`);
    city.gold -= DIP_COST[type];
    envoy.acted = true;
    d.cooldown = S.turn + 6;
    if (target === S.player) {
      S.pendingProposals.push({ from: fid, type, envoy: envoy.name, sweetener: swOk ? sweetener : null });
      return { ok: true, msg: `${envoy.name} sets out for ${fname(target)}'s court.`, pending: true };
    }
    const sw = sweetener ? itemData(sweetener) : null;
    const swOk = sw && S.items[sweetener].owner && S.officers[S.items[sweetener].owner] && S.officers[S.items[sweetener].owner].faction === fid;
    const chance = acceptChance(fid, target, type, envoy) + (swOk ? Math.min(0.35, itemValue(sw) / 100) : 0);
    if (Math.random() < chance) {
      if (swOk) { const r = rulerOf(target); if (r) giveItem(sweetener, r.name, true); }
      concludeTreaty(fid, target, type);
      return { ok: true, accepted: true, msg: `${fname(target)} accepts${swOk ? `, and the ${sw.name} changes hands` : ''}! ${type === 'alliance' ? 'An alliance is sworn' : 'A ceasefire is agreed'} between ${fname(fid)} and ${fname(target)}.` };
    }
    shiftRelation(fid, target, 3);
    return { ok: true, accepted: false, msg: `${fname(target)} receives ${envoy.name} politely but declines the ${type}.` };
  }

  function concludeTreaty(a, b, type) {
    const d = dip(a, b);
    const renewal = d.status === 'alliance' && type === 'alliance';
    d.status = type; d.proposer = a;
    d.until = type === 'ceasefire' ? S.turn + CEASEFIRE_MONTHS : S.turn + ALLIANCE_MONTHS;
    shiftRelation(a, b, type === 'alliance' ? (renewal ? 10 : 20) : 10);
    const text = type === 'alliance' ? (renewal ? `${fname(a)} and ${fname(b)} have renewed their alliance for ${ALLIANCE_MONTHS / 12} more years.` : `${fname(a)} and ${fname(b)} have sworn a ${ALLIANCE_MONTHS / 12}-year alliance.`) : `${fname(a)} and ${fname(b)} have agreed a ${CEASEFIRE_MONTHS}-month ceasefire.`;
    (a === S.player || b === S.player) ? notice(text, 'dip') : log(text, 'dip');
  }

  function respondProposal(index, accept) {
    const pr = S.pendingProposals.splice(index, 1)[0];
    if (!pr) return fail('No such proposal.');
    if (!S.factions[pr.from].alive) return ok(`${fname(pr.from)} no longer exists.`);
    if (pr.type === 'ransom') {
      const c = S.pendingCaptives.find((x) => x.name === pr.officer && x.captor === pr.from); const o = off(pr.officer);
      if (!c || !o || o.captive !== pr.from) return ok(`${pr.officer} is no longer held by ${fname(pr.from)}.`);
      if (!accept) return ok(`You refuse to pay for ${pr.officer}; his fate is in ${fname(pr.from)}'s hands.`, 'dip');
      const payer = factionProvinces(S.player).sort((x, y) => y.gold - x.gold)[0];
      if (!payer || payer.gold < pr.price) return fail(`No city of yours holds ${fmt(pr.price)} gold; the envoy leaves without an answer.`);
      const r = resolveCaptive(pr.officer, 'ransom'); return r.ok ? ok(`You pay ${fmt(pr.price)} gold and ${pr.officer} comes home.`, 'dip') : r;
    }
    if (accept) {
      if (pr.type === 'joint') {
        S.factions[S.player].warTarget = pr.enemy; S.factions[S.player].warTargetUntil = S.turn + 6;
        return ok(`You agree to join ${fname(pr.from)} against ${fname(pr.enemy)}.`, 'dip');
      }
      if (pr.sweetener && S.items[pr.sweetener] && S.items[pr.sweetener].owner) { const r = rulerOf(S.player); if (r) giveItem(pr.sweetener, r.name, true); }
      concludeTreaty(pr.from, S.player, pr.type);
      return ok(`You accept the ${pr.type} with ${fname(pr.from)}${pr.sweetener ? `, and the ${itemData(pr.sweetener).name} is yours` : ''}.`, 'dip');
    }
    shiftRelation(pr.from, S.player, -5);
    return ok(`You send ${fname(pr.from)}'s envoy away empty-handed.`, 'dip');
  }

  // ---------- favours between allies ----------
  // a house that marches to an ally's battle is owed a favour; the debt is repaid by marching in turn, or by a gift worth 400 or more
  const favorKey = (a, b) => `${a}>${b}`;   // a owes b
  const favorsOwed = (a, b) => (a && b && S.favors && S.favors[favorKey(a, b)]) || 0;
  function addFavor(debtor, creditor, why) {
    if (!debtor || !creditor || debtor === creditor) return null;
    S.favors = S.favors || {};
    if (favorsOwed(creditor, debtor) > 0) { S.favors[favorKey(creditor, debtor)]--; log(`${fname(creditor)} repays the favour owed to ${fname(debtor)}${why ? ` (${why})` : ''}.`, 'dip'); return 'repaid'; }
    S.favors[favorKey(debtor, creditor)] = favorsOwed(debtor, creditor) + 1;
    const text = `${fname(debtor)} now owes ${fname(creditor)} a favour${why ? ` (${why})` : ''}.`; if (debtor === S.player || creditor === S.player) notice(text, 'dip'); else log(text, 'dip');
    return 'owed';
  }
  function settleFavor(debtor, creditor) { if (favorsOwed(debtor, creditor) > 0) { S.favors[favorKey(debtor, creditor)]--; return true; } return false; }
  // an AI ally next to a battle asks the player to march; the battle waits for the player's month
  function askPlayerAid(B, fid, side, fromCity) {
    S.pendingAid = S.pendingAid || [];
    if (S.pendingAid.some((a) => a.city === B.city && a.from === fid)) return;
    const owed = favorsOwed(S.player, fid);
    S.pendingAid.push({ from: fid, city: B.city, side, fromCity, turn: S.turn });
    B.awaitPlayer = true;
    notice(`${fname(fid)} asks for your aid in the ${side === 'A' ? 'siege' : 'defence'} of ${pname(B.city)}${owed ? `; you owe them ${owed} favour${owed > 1 ? 's' : ''}` : ''}. Men and grain can march from ${pname(fromCity)} before the month ends.`, 'dip', { major: true });
  }
  function declineAid(index) {
    const a = (S.pendingAid || []).splice(index, 1)[0]; if (!a) return fail('No such request.');
    const owed = favorsOwed(S.player, a.from); shiftRelation(S.player, a.from, -(5 + 5 * owed));
    return ok(owed ? `You turn ${fname(a.from)} away though you owe them ${owed} favour${owed > 1 ? 's' : ''}; they will remember it.` : `You send ${fname(a.from)}'s rider back with regrets.`, 'dip');
  }
  // the AI repays what it owes with gifts when it has gold to spare
  function aiRepayFavors(fid) {
    for (const [k, n] of Object.entries(S.favors || {})) {
      if (n <= 0) continue; const [debtor, creditor] = k.split('>'); if (debtor !== fid || !S.factions[creditor] || !S.factions[creditor].alive) continue;
      const p = factionProvinces(fid).sort((x, y) => y.gold - x.gold)[0]; if (!p || p.gold < 1200 || Math.random() > 0.2) continue;
      const r = sendGift(fid, creditor, p.id, 500);
      if (r.ok) { if (creditor === S.player) notice(`${fname(fid)} sends 500 gold in gifts, repaying the favour owed to you.`, 'dip'); else log(`${fname(fid)} sends gifts to ${fname(creditor)} to repay a favour.`, 'dip'); }
    }
  }
  function sendGift(fid, target, pid, gold, food = 0) {
    const p = prov(pid);
    gold = Math.floor(gold || 0); food = Math.floor(food || 0);
    if (p.owner !== fid || gold < 0 || food < 0 || gold + food <= 0 || gold > p.gold || food > p.food) return fail('Not enough gold or food in that city.');
    if (!S.factions[target] || !S.factions[target].alive) return fail('That house no longer exists.');
    p.gold -= gold; p.food -= food;
    const seat = rulerOf(target) && prov(rulerOf(target).city) && prov(rulerOf(target).city).owner === target ? prov(rulerOf(target).city) : factionProvinces(target)[0];
    if (seat) { seat.gold += gold; seat.food += food; }
    const value = gold + food / 10;
    const gain = Math.min(20, 3 + Math.floor(value / 100));
    shiftRelation(fid, target, gain);
    const settled = value >= 400 && settleFavor(fid, target);
    const what = [gold ? `${fmt(gold)} gold` : '', food ? `${fmt(food)} food` : ''].filter(Boolean).join(' and ');
    return ok(`${fname(fid)} sent ${what} in gifts to ${fname(target)}. Relations improve by ${gain}.${settled ? ' The favour owed is repaid.' : ''}`, 'dip');
  }

  function breakTreaty(fid, target) {
    const d = dip(fid, target);
    if (d.status === 'neutral') return fail('There is no treaty to break.');
    const was = d.status;
    d.status = 'neutral'; d.until = 0;
    S.factions[fid].treachery = (S.factions[fid].treachery || 0) + 1;
    shiftRelation(fid, target, was === 'alliance' ? -60 : -40);
    for (const f of Object.keys(S.factions)) if (f !== fid && f !== target && S.factions[f].alive) shiftRelation(fid, f, -10);
    const text = `${fname(fid)} has broken its ${was} with ${fname(target)}! The other lords take note.`;
    (fid === S.player || target === S.player) ? notice(text, 'bad') : log(text, 'bad');
    return { ok: true, msg: text };
  }

  function requestJointAttack(fid, ally, enemy, envoyName) {
    if (treatyStatus(fid, ally) !== 'alliance') return fail('Only allies can be asked to join a war.');
    if (!S.factions[enemy] || !S.factions[enemy].alive) return fail('That house no longer exists.');
    if (treatyStatus(ally, enemy) !== 'neutral') return fail(`${fname(ally)} has a ${treatyStatus(ally, enemy)} with ${fname(enemy)}.`);
    if (!bordering(ally, enemy)) return fail(`${fname(ally)} shares no border with ${fname(enemy)}.`);
    const envoy = findEnvoy(fid, envoyName); if (!envoy.name) return envoy;
    const city = prov(envoy.city);
    if (city.gold < DIP_COST.joint) return fail(`${pname(city.id)} needs ${DIP_COST.joint} gold to fund the embassy.`);
    city.gold -= DIP_COST.joint; envoy.acted = true;
    if (ally === S.player) {
      S.pendingProposals.push({ from: fid, type: 'joint', enemy, envoy: envoy.name });
      return { ok: true, pending: true, msg: `${envoy.name} rides to ${fname(ally)}.` };
    }
    S.factions[fid].jointAgainst = enemy;
    const agreed = Math.random() < acceptChance(fid, ally, 'joint', envoy);
    S.factions[fid].jointAgainst = null;
    if (agreed) {
      S.factions[ally].warTarget = enemy; S.factions[ally].warTargetUntil = S.turn + 6;
      return ok(`${fname(ally)} agrees to march against ${fname(enemy)}!`, 'dip');
    }
    return ok(`${fname(ally)} is not ready to go to war with ${fname(enemy)}.`, 'dip');
  }

  function aiDiplomacy(fid) {
    const F = S.factions[fid];
    const envoys = factionOfficers(fid).filter((o) => !o.acted && !isRuler(o) && prov(o.city).owner === fid && prov(o.city).gold >= 500);
    if (!envoys.length) return;
    const envoy = envoys.reduce((m, o) => (o.chr + o.pol > m.chr + m.pol ? o : m));
    const mine = totalTroops(fid);
    const others = Object.keys(S.factions).filter((f) => f !== fid && S.factions[f].alive);
    const leader = leaderHouse();
    const hostileN = others.filter((f) => bordering(fid, f) && treatyStatus(fid, f) === 'neutral' && dip(fid, f).cooldown <= S.turn);
    // when only one rival is left, a treaty with him is a treaty against unification: it is torn up once the odds are overwhelming
    const foe = lastFoe(fid);
    if (foe && treatyStatus(fid, foe) !== 'neutral' && mine > totalTroops(foe) * (has(fid, 'honourable') ? 3 : 1.8) && Math.random() < 0.35) { breakTreaty(fid, foe); return; }
    const strongest = hostileN.sort((a, b) => totalTroops(b) - totalTroops(a))[0];
    // 0. the war of unification: no envoys, no gifts, and every treaty with a weaker rival is torn up
    if (F.phase === 'unifying') {
      const bound = others.filter((f) => !S.factions[f].raider && treatyStatus(fid, f) !== 'neutral' && mine > totalTroops(f) * 1.5);
      if (bound.length && Math.random() < 0.5) { const f = bound.sort((a, b) => totalTroops(b) - totalTroops(a))[0]; log(`${fname(fid)} holds half the realm and will brook no rival: the ${treatyStatus(fid, f)} with ${fname(f)} is renounced.`, 'bad'); breakTreaty(fid, f); }
      return;
    }
    // 0a. the hegemon courts the second power so the rest cannot unite, and asks nothing of the others
    if (F.phase && F.phase !== 'rising') {
      const sp = secondPower(fid);
      if (lastFoe(fid)) return;   // the war of unification: no gifts and no treaties for the last rival
      if (sp && bordering(fid, sp.id)) {
        if (treatyStatus(fid, sp.id) === 'neutral' && dip(fid, sp.id).cooldown <= S.turn && Math.random() < 0.5) { const sw = houseItems(fid).filter((it) => it.type !== 'seal').sort((a, b) => itemValue(a) - itemValue(b))[0]; proposeTreaty(fid, sp.id, relation(fid, sp.id) >= 20 ? 'alliance' : 'ceasefire', envoy.name, sw && Math.random() < 0.5 ? sw.id : null); return; }
        const rich = factionProvinces(fid).filter((p) => p.gold > 3000)[0];
        if (rich && relation(fid, sp.id) < 40 && Math.random() < 0.4) { sendGift(fid, sp.id, rich.id, 500); return; }
      }
      return;
    }
    // 0a2. renew an alliance about to lapse when it still serves: a shared enemy, or a stronger partner one would rather not fight
    for (const a of allies(fid)) {
      const d = dip(fid, a);
      if (d.until - S.turn > 12 || d.cooldown > S.turn) continue;
      const useful = sharedEnemy(fid, a) || (bordering(fid, a) && totalTroops(a) > mine * 0.8) || relation(fid, a) >= 50;
      if (useful && !lastFoe(fid) && Math.random() < 0.35) { proposeTreaty(fid, a, 'alliance', envoy.name); return; }
    }
    // 0a3. a house with nowhere left to march (every neighbour under treaty) for a year picks the weakest, coolest ally and ends the pact
    if (F.idleSince && S.turn - F.idleSince >= 12) {
      const cand = allies(fid).filter((a) => bordering(fid, a) && mine > totalTroops(a) * (has(fid, 'honourable') ? 2.5 : 1.5)).sort((x, y) => relation(fid, x) - relation(fid, y))[0];
      if (cand && Math.random() < 0.2) { log(`${fname(fid)} finds its alliance with ${fname(cand)} has served its purpose.`, 'dip'); breakTreaty(fid, cand); return; }
    }
    // 0b. small houses facing a hegemon: the cautious bandwagon, the bold balance
    if (leader && leader !== fid && bordering(fid, leader) && (has(fid, 'cautious') || has(fid, 'builder')) && treatyStatus(fid, leader) === 'neutral' && dip(fid, leader).cooldown <= S.turn && Math.random() < 0.4) { proposeTreaty(fid, leader, 'ceasefire', envoy.name); return; }
    // 0. coalition: when one house runs away with the map, its neighbours band together
    if (leader && leader !== fid && bordering(fid, leader) && !has(fid, 'cautious')) {
      const partners = others.filter((f) => f !== leader && bordering(f, leader) && treatyStatus(fid, f) !== 'alliance' && dip(fid, f).cooldown <= S.turn && relation(fid, f) > -30);
      if (partners.length && Math.random() < 0.5) { proposeTreaty(fid, partners[0], 'alliance', envoy.name); return; }
      const al = allies(fid).filter((a) => bordering(a, leader) && treatyStatus(a, leader) === 'neutral' && (!S.factions[a].warTarget || S.factions[a].warTargetUntil <= S.turn) && dip(fid, a).cooldown <= S.turn);
      if (al.length && Math.random() < 0.5) { dip(fid, al[0]).cooldown = S.turn + 6; requestJointAttack(fid, al[0], leader, envoy.name); return; }
    }
    // 1. ask the strongest hostile neighbour for a ceasefire when badly outmatched
    if (strongest && totalTroops(strongest) > mine * 1.6 && Math.random() < 0.5) { const sw = houseItems(fid).filter((it) => it.type !== 'seal').sort((a, b) => itemValue(a) - itemValue(b))[0]; proposeTreaty(fid, strongest, 'ceasefire', envoy.name, sw && Math.random() < 0.4 ? sw.id : null); return; }
    // 1b. sell a ceasefire on a secondary front to free a hand for the main war (others may see through it)
    if (F.plan && F.plan.enemy && !has(fid, 'honourable')) {
      const side = hostileN.filter((f) => f !== F.plan.enemy && totalTroops(f) > mine * 0.5);
      if (side.length && Math.random() < 0.35) { proposeTreaty(fid, side[0], 'ceasefire', envoy.name); return; }
    }
    // 1c. ask an ally to join the main war
    if (F.plan && F.plan.enemy && S.factions[F.plan.enemy]) {
      const al = allies(fid).filter((a) => bordering(a, F.plan.enemy) && treatyStatus(a, F.plan.enemy) === 'neutral' && (!S.factions[a].warTarget || S.factions[a].warTargetUntil <= S.turn) && dip(fid, a).cooldown <= S.turn);
      if (al.length && Math.random() < 0.4) { dip(fid, al[0]).cooldown = S.turn + 6; requestJointAttack(fid, al[0], F.plan.enemy, envoy.name); return; }
    }
    // 2. alliances with friendly houses that share an enemy or lie far away
    const friends = others.filter((f) => relation(fid, f) >= 25 && treatyStatus(fid, f) !== 'alliance' && dip(fid, f).cooldown <= S.turn && (sharedEnemy(fid, f) || !bordering(fid, f)));
    if (friends.length && Math.random() < 0.3) { proposeTreaty(fid, pick(friends), 'alliance', envoy.name); return; }
    // 3. ask an ally to join a war against a shared neighbour
    const al = allies(fid).filter((a) => !S.factions[a].warTarget || S.factions[a].warTargetUntil <= S.turn);
    for (const a of al) {
      const target = others.find((e) => e !== a && bordering(fid, e) && bordering(a, e) && treatyStatus(fid, e) === 'neutral' && treatyStatus(a, e) === 'neutral');
      if (target && Math.random() < 0.25 && dip(fid, a).cooldown <= S.turn) { dip(fid, a).cooldown = S.turn + 6; requestJointAttack(fid, a, target, envoy.name); return; }
    }
    // 3b. treacherous houses break a treaty when the partner is weak and the prize is near
    if (has(fid, 'treacherous') && Math.random() < 0.06) {
      const mark = others.find((f) => treatyStatus(fid, f) !== 'neutral' && bordering(fid, f) && totalTroops(f) < mine * 0.4);
      if (mark) { breakTreaty(fid, mark); return; }
    }
    // 4. gifts to a stronger, unfriendly neighbour when rich
    const rich = factionProvinces(fid).filter((p) => p.gold > 3000);
    if (rich.length && strongest && relation(fid, strongest) < 20 && Math.random() < 0.3) sendGift(fid, strongest, rich[0].id, 300);
  }

  let monthStart = null;
  function snapshotMonth() { try { monthStart = JSON.stringify(S); } catch (e) { monthStart = null; } }
  function undoMonth() { if (!monthStart) return false; S = JSON.parse(monthStart); return true; }
  const canUndo = () => !!monthStart;
  // ---------- a founder reclaims his house ----------
  // If the founding lord of a fallen house comes to rule another house (by succession, coup or a new banner),
  // that house becomes his original house again: its id, colour, persona and unfired events all return.
  const FOUNDERS = Object.fromEntries(FACTIONS.map((f) => [f.ruler, f.id]).concat([['L\u00fc Bu', 'lubu']]));
  const rekey = (v, from, to) => (v === from ? to : v);
  function restoreHouse(fid, origId) {
    const F = S.factions[fid]; const base = FACTIONS.find((f) => f.id === origId);
    const dead = S.factions[origId];
    const R = { ...F, id: origId, color: base ? base.color : (dead ? dead.color : F.color), persona: base ? base.persona || [] : (dead ? dead.persona : F.persona), aggr: base ? base.aggr : F.aggr, name: F.dynasty || F.ruler, wanderer: base ? !!base.wanderer : F.wanderer };
    S.factions[origId] = R;
    F.alive = false; F.guest = false; F.host = null; F.hasEmperor = false;
    for (const p of Object.values(S.provinces)) if (p.owner === fid) p.owner = origId;
    for (const o of allOfficers()) { if (o.faction === fid) o.faction = origId; if (o.captive === fid) o.captive = origId; }
    for (const c of S.pendingCaptives) { c.captor = rekey(c.captor, fid, origId); c.from = rekey(c.from, fid, origId); }
    for (const pr of S.pendingProposals || []) pr.from = rekey(pr.from, fid, origId);
    if (S.favors) S.favors = Object.fromEntries(Object.entries(S.favors).map(([k, v]) => [k.split('>').map((x) => rekey(x, fid, origId)).join('>'), v]));
    for (const a of S.pendingAid || []) a.from = rekey(a.from, fid, origId);
    for (const [k, d] of Object.entries(S.diplomacy)) {
      const [a, b] = k.split('|'); if (a !== fid && b !== fid) continue;
      const na = rekey(a, fid, origId), nb = rekey(b, fid, origId); if (na === nb) { delete S.diplomacy[k]; continue; }
      S.diplomacy[na < nb ? `${na}|${nb}` : `${nb}|${na}`] = d; delete S.diplomacy[k];
    }
    for (const f of Object.values(S.factions)) {
      if (f.host === fid) f.host = origId;
      if (f.warTarget === fid) f.warTarget = origId;
      if (f.lastAttackTarget === fid) f.lastAttackTarget = origId;
      if (f.plan && f.plan.enemy === fid) f.plan.enemy = origId;
      if (f.attackedBy && f.attackedBy[fid] != null) { f.attackedBy[origId] = f.attackedBy[fid]; delete f.attackedBy[fid]; }
    }
    if (S.player === fid) S.player = origId;
    if (S.hanEnded && S.hanEnded.by === fid) S.hanEnded.by = origId;
    notice(`${R.ruler}, master now of the house he inherited, raises again the banner of his own: the house of ${R.name} lives once more.`, 'hist', { major: true });
  }
  function checkRestorations() {
    for (const F of Object.values(S.factions)) {
      if (!F.alive) continue;
      const orig = FOUNDERS[F.ruler];
      if (orig && orig !== F.id && S.factions[orig] && !S.factions[orig].alive) restoreHouse(F.id, orig);
    }
  }


  // ============================================================
  //  Tactical battles: the hex-map engine in js/battle.js, driven from here.
  //  One battle per city; it lives in S.battles[city] and is advanced a day at a time.
  //  Battles between AI houses are fought out at once (thirty days a month); a
  //  battle the player is part of waits for the battle screen.
  // ============================================================
  const tacticalOn = () => !(S.options && S.options.tactical === false);
  const battleExitToward = (city, fromId) => { const m = HEXMAPS[city]; return (m.exits.find((e) => e.to === fromId) || m.exits[0] || null); };
  const battleCtx = (B) => ({
    officer: (n) => off(n), fname, pname, turn: () => S.turn,
    kill: (n, cause) => { const o = off(n); if (o) killOfficer(o, cause); },
    guarded: (n) => { const o = off(n); return o ? guarded(o) : false; },
    duelBonus: (n) => { const o = off(n); return o ? duelBonus(o) : 0; },
    // who may be turned in the field: no rulers, no sworn brothers, no one who hates the new lord, and only the wavering
    canDefect: (n, toFid) => { const o = off(n); if (!o || o.captive || !toFid || !S.factions[toFid] || !S.factions[toFid].alive || o.faction === toFid) return false; if (isRuler(o) || bondGroup(o.name)) return false; const r = rulerOf(toFid); if (r && areEnemies(o.name, r.name)) return false; return o.loyalty < 70; },
    defect: (n, toFid) => {
      const o = off(n); if (!o || !B.att) return; const from = o.faction;
      o.faction = toFid; o.loyalty = 55; o.acted = true; o.city = toFid === B.attF ? B.att.from : B.city;
      B.att.officers = B.att.officers.filter((x) => x !== n); B.def.officers = B.def.officers.filter((x) => x !== n); (toFid === B.attF ? B.att : B.def).officers.push(n);
      const text = `${n} deserts ${fname(from)} for ${fname(toFid)} on the field before ${pname(B.city)}.`; if (from === S.player || toFid === S.player) notice(text, 'strat'); else log(text, 'strat');
    },
    raiseLoyalty: (n, d) => { const o = off(n); if (o) o.loyalty = clamp(o.loyalty + d, 0, 100); },
    sackSite: (i, u) => sackSiteFor(B, i, u), siteName,
    gold: (side) => { const p = prov(side === 'A' && B.att ? B.att.from : B.city); return p ? p.gold : 0; },
    spendGold: (side, n) => { const p = prov(side === 'A' && B.att ? B.att.from : B.city); if (!p || p.gold < n) return false; p.gold -= n; return true; },
    cityFood: (d) => { const p = prov(B.city); if (d >= 0) { p.food += d; return true; } if (p.food + d < 0) { p.food = 0; return false; } p.food += d; return true; },
    syncCity: (b) => { const p = prov(b.city); if (!b.defF || p.owner === b.defF) p.troops = BATTLE.sideTroops(b, 'D'); },
  });
  const playerSideOf = (B) => (B.att.control === 'player' ? 'A' : B.def.control === 'player' ? 'D' : null);
  const battleFor = (city) => (S.battles && S.battles[city]) || null;
  const playerBattles = () => Object.values(S.battles || {}).filter((B) => playerSideOf(B) && !B.over);

  function startBattle(fromId, toId, officerNames, troops, tactics) {
    const a = prov(fromId), b = prov(toId); const attF = a.owner, defF = b.owner;
    a.troops -= troops;
    const exit = battleExitToward(toId, fromId);
    const defOfficers = defF ? officersIn(toId, defF).map((o) => o.name) : [];
    const mods = battleModifiers(fromId, toId);
    const B = BATTLE.create({ city: toId, attF, defF, fromCity: fromId, troops, food: Math.floor(troops * 0.1), officers: officerNames, training: a.training, walls: b.defense, exit,
      cityTroops: b.troops, cityOfficers: defOfficers, cityTraining: b.training, control: { A: attF === S.player ? 'player' : 'ai', D: defF === S.player ? 'player' : 'ai' }, ctx: battleCtx({ city: toId }), record: !!(S.observer && S.options && S.options.watchBattles),
      fleet: mods.frozen ? 0 : (a.fleet || 0), cityFleet: mods.frozen ? 0 : (b.fleet || 0), sites: sitesOf(b) });
    B.tactics = tactics || {}; B.startD = b.troops; B.att.officers = [...officerNames]; B.def.officers = [...defOfficers]; B.phase = 'idle';
    S.battles[toId] = B;
    if (attF !== S.player) aiCallReinforcements(B, 'A');
    if (defF && defF !== S.player) aiCallReinforcements(B, 'D');
    battleCtx(B).syncCity(B);
    const text = `${fname(attF)} lays siege to ${pname(toId)} with ${fmt(troops)} men${defF ? `; ${fname(defF)} holds it with ${fmt(b.troops)}` : ''}.`;
    log(text, 'war');
    if (defF === S.player) notice(`${text} The battle awaits you.`, 'war', { major: true });
    if (!playerSideOf(B) && !B.awaitPlayer) runBattleMonth(B);
    return { ok: true, battle: toId, report: B.report || null };
  }
  // neighbours and allies march to the field: the attacker's within one to ten days, the defender's in fifteen to twenty
  function aiCallReinforcements(B, side) {
    const fid = side === 'A' ? B.attF : B.defF; if (!fid) return;
    const F = S.factions[fid]; if (!F || !F.alive) return;
    const days = () => (side === 'A' ? ri(1, 10) : ri(15, 20));
    for (const n of S.adj[B.city]) {
      const p = prov(n); if (!p.owner || n === B.att.from) continue;
      const own = p.owner === fid, allied = !own && treatyStatus(fid, p.owner) === 'alliance' && !S.factions[p.owner].guest;
      if (allied && p.owner === S.player && !S.observer) { askPlayerAid(B, fid, side, n); continue; }
      const owed = allied ? favorsOwed(p.owner, fid) : 0, owing = allied ? favorsOwed(fid, p.owner) : 0;
      const ally = allied && (relation(fid, p.owner) >= (side === 'A' ? 40 : 30) || owed > 0) && Math.random() < (side === 'A' ? 0.5 : 0.6) + 0.3 * Math.min(2, owed) - 0.15 * Math.min(2, owing);
      if (!own && !ally) continue;
      if (own && side === 'D' && (F.attackedBy || {})[B.attF] !== S.turn) { /* the messenger rides anyway */ }
      const spare = own ? spareTroops(fid, p) : Math.floor(p.troops * 0.3);
      const send = Math.floor(own ? spare * (side === 'A' ? 0.5 : 0.4) : spare);
      if (send < 2000) continue;
      const idle = idleOfficers(n).filter((o) => !isRuler(o)).sort((x, y) => y.war - x.war); const escort = idle[0];
      if (!escort) continue;
      escort.acted = true; p.troops -= send; const food = Math.min(p.food, Math.floor(send * 0.1)); p.food -= food;
      BATTLE.addArrival(B, { side, fid: p.owner, from: n, troops: send, food, officers: [escort.name], training: p.training, days: days(), exit: battleExitToward(B.city, n), fleet: p.fleet || 0 });
      BATTLE.log(B, `${fname(p.owner)} sends ${fmt(send)} men from ${pname(n)} to ${side === 'A' ? 'join the siege' : 'relieve the city'}.`, side === 'A' ? 'att' : 'def');
      if (!own) { shiftRelation(fid, p.owner, 5); addFavor(fid, p.owner, `aid at ${pname(B.city)}`); }
    }
    B[side === 'A' ? 'att' : 'def'].asked = true;
  }
  // what the player may ask for, and the asking
  function battleRequests(city) {
    const B = battleFor(city); if (!B) return null; const side = playerSideOf(B); if (!side) return null;
    const fid = side === 'A' ? B.attF : B.defF;
    const own = [], allies = [];
    for (const n of S.adj[city]) { const p = prov(n); if (!p.owner || n === B.att.from) continue; if (p.owner === fid) own.push({ city: n, troops: p.troops, spare: spareTroops(fid, p), food: p.food, officers: idleOfficers(n).filter((o) => !isRuler(o)).map((o) => o.name) }); else if (treatyStatus(fid, p.owner) === 'alliance' && !S.factions[p.owner].guest) allies.push({ fid: p.owner, city: n, troops: p.troops, relation: relation(fid, p.owner) }); }
    return { side, asked: B[side === 'A' ? 'att' : 'def'].asked, own, allies, days: side === 'A' ? '1 to 10' : '15 to 20' };
  }
  function battleMessengers(city, { own = [], allies = [] }) {
    const B = battleFor(city); if (!B) return fail('No battle there.'); const side = playerSideOf(B); if (!side) return fail('Not your battle.');
    const fid = side === 'A' ? B.attF : B.defF; const days = () => (side === 'A' ? ri(1, 10) : ri(15, 20)); const sent = [];
    for (const r of own) {
      const p = prov(r.city); if (p.owner !== fid || !S.adj[city].includes(r.city)) continue;
      const troops = Math.max(0, Math.min(p.troops, Math.floor(r.troops || 0))), food = Math.max(0, Math.min(p.food, Math.floor(r.food || 0)));
      if (troops <= 0) continue; const o = r.officer ? off(r.officer) : null; if (!o || o.city !== r.city || o.acted || o.faction !== fid) continue;
      o.acted = true; p.troops -= troops; p.food -= food;
      BATTLE.addArrival(B, { side, fid, from: r.city, troops, food, officers: [o.name], training: p.training, days: days(), exit: battleExitToward(city, r.city), fleet: p.fleet || 0 });
      sent.push(`${fmt(troops)} from ${pname(r.city)}`);
    }
    for (const af of allies) {
      const A = S.factions[af]; if (!A || !A.alive || treatyStatus(fid, af) !== 'alliance') continue;
      const cities = S.adj[city].filter((n) => prov(n).owner === af); if (!cities.length) continue;
      const chance = 0.35 + relation(fid, af) / 200 + (side === 'D' ? 0.1 : 0) + 0.3 * Math.min(2, favorsOwed(af, fid)) - 0.15 * Math.min(2, favorsOwed(fid, af));
      if (Math.random() > chance) { BATTLE.log(B, `${fname(af)} sends regrets and no soldiers.`, ''); shiftRelation(fid, af, -5); continue; }
      const n = cities.sort((x, y) => prov(y).troops - prov(x).troops)[0]; const p = prov(n); const send = Math.floor(p.troops * 0.3); if (send < 1000) continue;
      const idle = idleOfficers(n).filter((o) => !isRuler(o)).sort((x, y) => y.war - x.war); const escort = idle[0]; if (!escort) continue;
      escort.acted = true; p.troops -= send; const food = Math.min(p.food, Math.floor(send * 0.1)); p.food -= food;
      BATTLE.addArrival(B, { side, fid: af, from: n, troops: send, food, officers: [escort.name], training: p.training, days: days(), exit: battleExitToward(city, n), fleet: p.fleet || 0 });
      shiftRelation(fid, af, 5); addFavor(fid, af, `aid at ${pname(city)}`); sent.push(`${fmt(send)} from ${fname(af)}`);
    }
    B[side === 'A' ? 'att' : 'def'].asked = true;
    return ok(sent.length ? `Messengers ride out. On the way: ${sent.join(', ')} (arriving in ${side === 'A' ? '1 to 10' : '15 to 20'} days).` : 'The messengers ride out, but no help is coming.');
  }
  // during a strategic turn: a house on either side (or an ally) sends more men and grain from a neighbouring city
  function reinforceBattle(fromId, city, { troops = 0, food = 0, officers = [] }) {
    const B = battleFor(city); if (!B) return fail('No battle there.');
    const p = prov(fromId); if (!p.owner || !S.adj[city].includes(fromId)) return fail('Only a neighbouring city can send help.');
    const side = p.owner === B.attF || (B.attF && treatyStatus(p.owner, B.attF) === 'alliance' && B.defF !== p.owner) ? 'A' : p.owner === B.defF || (B.defF && treatyStatus(p.owner, B.defF) === 'alliance') ? 'D' : null;
    if (!side) return fail('Your house has no side in that battle.');
    troops = Math.floor(troops); food = Math.floor(food);
    if (troops <= 0 && food <= 0) return fail('Send some troops or food.');
    if (troops > p.troops || food > p.food) return fail('Not enough there.');
    if (troops > 0 && !officers.length) return fail('An officer must lead the column.');
    for (const n of officers) { const e = useOfficer(n, fromId); if (e) return e; }
    for (const n of officers) off(n).acted = true;
    p.troops -= troops; p.food -= food;
    const house = side === 'A' ? B.attF : B.defF;
    if (p.owner !== house) { B.helpers = B.helpers || {}; if (!B.helpers[p.owner]) { B.helpers[p.owner] = true; shiftRelation(house, p.owner, 5); addFavor(house, p.owner, `aid at ${pname(city)}`); } if (p.owner === S.player) S.pendingAid = (S.pendingAid || []).filter((a) => a.city !== city); }
    BATTLE.addArrival(B, { side, fid: p.owner, from: fromId, troops, food, officers, training: p.training, days: ri(1, 10), exit: battleExitToward(city, fromId), fleet: p.fleet || 0 });
    BATTLE.log(B, `${fname(p.owner)} sends ${troops ? fmt(troops) + ' men' : 'a grain train'}${food ? ` and ${fmt(food)} food` : ''} from ${pname(fromId)}.`, side === 'A' ? 'att' : 'def');
    return ok(`The column leaves ${pname(fromId)} for ${pname(city)} and will arrive within ten days.`);
  }
  // the AI does the same in its turn for battles it is part of
  function aiReinforceBattles(fid) {
    for (const B of Object.values(S.battles)) {
      if (B.over) continue;
      const side = fid === B.attF ? 'A' : fid === B.defF ? 'D' : (B.attF && treatyStatus(fid, B.attF) === 'alliance' && fid !== B.defF) ? 'A' : (B.defF && treatyStatus(fid, B.defF) === 'alliance') ? 'D' : null;
      if (!side || B.startedTurn === S.turn) continue;   // this month's opening call was already made
      const mine = BATTLE.sideTroops(B, side), theirs = BATTLE.sideTroops(B, side === 'A' ? 'D' : 'A');
      const house = side === 'A' ? B.attF : B.defF;
      if (mine > theirs * 1.5 && fid !== B.defF && !(fid !== house && favorsOwed(fid, house) > 0)) continue;   // a favour owed is a debt to march
      for (const n of S.adj[B.city]) {
        const p = prov(n); if (p.owner !== fid) continue;
        const spare = spareTroops(fid, p); const send = Math.floor(spare * 0.5); const escort = idleOfficers(n).filter((o) => !isRuler(o)).sort((x, y) => y.war - x.war)[0];
        const food = Math.min(Math.floor(p.food * 0.2), 6000);
        if ((send >= 2000 && escort) || (side === 'A' && B.att.food < BATTLE.sideTroops(B, 'A') * BATTLE.FOOD_PER_MAN_DAY * 10 && food > 500)) reinforceBattle(n, B.city, { troops: send >= 2000 && escort ? send : 0, food, officers: send >= 2000 && escort ? [escort.name] : [] });
      }
    }
  }
  function runBattleMonth(B) {
    const ctx = battleCtx(B);
    while (!B.over && B.dayInMonth < 30) BATTLE.runDay(B, ctx);
    if (B.over) finishBattle(B);
  }
  // the player's day: the attacker moves first, so a defending player sees the AI's moves before acting
  function battleBeginDay(city) {
    const B = battleFor(city); if (!B || B.over || B.phase === 'player' || B.dayInMonth >= 30) return fail('No day to begin.');
    const ctx = battleCtx(B); BATTLE.beginDay(B);
    if (B.att.control === 'ai') BATTLE.aiSide(B, 'A', ctx);
    BATTLE.checkOver(B, ctx); B.phase = 'player';
    if (B.over) finishBattle(B);
    return ok('The day begins.');
  }
  function battleEndDay(city, auto = false) {
    const B = battleFor(city); if (!B || B.over) return fail('No battle.');
    if (B.phase !== 'player') battleBeginDay(city); if (B.over) return ok('over');
    const ctx = battleCtx(B); const ps = playerSideOf(B);
    if (B.pendingChallenge) BATTLE.answerChallenge(B, auto ? BATTLE.autoAnswer(B, ctx) : false, ctx);   // an unanswered challenge is declined
    if (!B.over && auto && ps && !B.autoActed) { B.autoActed = true; BATTLE.aiSide(B, ps, ctx); }
    if (!B.over && B.def.control === 'ai' && !B.defActed) { B.defActed = true; BATTLE.aiSide(B, 'D', ctx); }
    if (B.pendingChallenge) { if (auto) BATTLE.answerChallenge(B, BATTLE.autoAnswer(B, ctx), ctx); else { B.endPending = true; BATTLE.checkOver(B, ctx); if (B.over) finishBattle(B); return ok('challenge'); } }   // the AI has called out a champion; the player answers before the day ends
    BATTLE.checkOver(B, ctx);
    if (!B.over) BATTLE.endDay(B, ctx);
    B.phase = 'idle'; B.autoActed = false; B.defActed = false; B.endPending = false;
    if (B.over) finishBattle(B);
    return ok('The day ends.');
  }
  function battleAnswerChallenge(city, accept) {
    const B = battleFor(city); if (!B || !B.pendingChallenge) return fail('No challenge.');
    const ctx = battleCtx(B); BATTLE.answerChallenge(B, !!accept, ctx); BATTLE.checkOver(B, ctx);
    if (B.over) { finishBattle(B); return ok('over'); }
    if (B.endPending) return battleEndDay(city);
    return ok(accept ? 'The champions ride out.' : 'The challenge is declined.');
  }
  function battleSack(city, unitId) { const B = battleFor(city); if (!B || B.phase !== 'player') return fail('Begin the day first.'); const u = B.units.find((x) => x.id === unitId); if (!u || u.side !== playerSideOf(B)) return fail('Not your unit.'); return BATTLE.sack(B, u, battleCtx(B)) ? ok('The place burns.') : fail('Nothing to sack here.'); }
  function battleSubornTargets(city) { const B = battleFor(city); if (!B) return []; const ps = playerSideOf(B); return ps ? BATTLE.subornTargets(B, ps, battleCtx(B)) : []; }
  function battleGold(city) { const B = battleFor(city); if (!B) return 0; const ps = playerSideOf(B); return ps ? battleCtx(B).gold(ps) : 0; }
  function battleSuborn(city, unitId, name, gold) {
    const B = battleFor(city); if (!B || B.over) return fail('No battle.'); const ps = playerSideOf(B); if (!ps || B.phase !== 'player') return fail('Not your turn.');
    const r = BATTLE.suborn(B, ps, unitId, name, Math.max(0, Math.floor(gold || 0)), battleCtx(B));
    if (r.ok) { BATTLE.checkOver(B, battleCtx(B)); if (B.over) finishBattle(B); }
    return r.ok ? ok(r.msg, r.turned ? 'good' : '') : fail(r.msg);
  }
  function battleAutoMonth(city) { const B = battleFor(city); if (!B) return fail('No battle.'); while (!B.over && B.dayInMonth < 30) battleEndDay(city, true); return ok('done'); }
  function battleMove(city, unitId, c, r) { const B = battleFor(city); if (!B || B.phase !== 'player') return fail('Begin the day first.'); const u = B.units.find((x) => x.id === unitId); if (!u || u.side !== playerSideOf(B)) return fail('Not your unit.'); return BATTLE.moveUnit(B, u, c, r) ? ok('Moved.') : fail('That hex is out of reach.'); }
  function battleAttack(city, unitId, targetId, opts = {}) { const B = battleFor(city); if (!B || B.phase !== 'player') return fail('Begin the day first.'); const u = B.units.find((x) => x.id === unitId), v = B.units.find((x) => x.id === targetId); if (!u || !v || u.side !== playerSideOf(B)) return fail('Not your unit.'); if (u.acted) return fail('That unit has already fought today.'); const r = BATTLE.attackUnit(B, u, v, battleCtx(B), opts); if (r) BATTLE.checkOver(B, battleCtx(B)); if (B.over) finishBattle(B); return r ? ok('Attack made.') : fail('Out of reach.'); }
  function battleRam(city, unitId, c, r) { const B = battleFor(city); if (!B || B.phase !== 'player') return fail('Begin the day first.'); const u = B.units.find((x) => x.id === unitId); if (!u || u.side !== playerSideOf(B)) return fail('Not your unit.'); return BATTLE.ramGate(B, u, c, r) ? ok('The ram strikes.') : fail('No gate to ram from there.'); }
  function battleWithdraw(city) { const B = battleFor(city); if (!B || B.over) return fail('No battle.'); const ps = playerSideOf(B); if (!ps) return fail('Not your battle.'); BATTLE.withdraw(B, ps, battleCtx(B)); finishBattle(B); return ok(ps === 'A' ? 'The siege is abandoned.' : 'The garrison slips away and the city is lost.'); }

  function finishBattle(B) {
    if (!S.battles[B.city]) return;
    const from = prov(B.att.from), to = prov(B.city); const attF = B.attF, defF = B.defF;
    const attNames = [...new Set([...B.att.officers, ...B.arrivals.map((a) => a.officers).flat()])];
    const R = { from: B.att.from, to: B.city, attacker: attF, defender: defF, attOfficers: attNames, defOfficers: B.def.officers, lines: B.log.map((l) => ({ text: `Day ${l.day}: ${l.text}`, cls: l.cls === 'att' ? 'war' : l.cls === 'def' ? 'strat' : l.cls })), result: null, captives: [], tactical: true, mods: battleModifiers(B.att.from, B.city) };
    const captured = new Set(B.captives.map((c) => c.name));
    for (const c of B.captives) { const o = off(c.name); const captor = c.by === 'A' ? attF : defF; if (!o || !captor || !S.factions[captor] || !S.factions[captor].alive || o.captive) continue; if (isRuler(o) && S.factions[o.faction] && S.factions[o.faction].alive && factionProvinces(o.faction).length) { R.lines.push({ text: `${o.name} is spirited away by his guards.`, cls: '' }); continue; } o.captive = captor; S.pendingCaptives.push({ name: o.name, captor, city: B.city, from: o.faction }); }
    const attOff = attNames.map(off).filter((o) => o && !captured.has(o.name) && o.faction === attF);
    const defOff = defF ? officersIn(B.city, defF).filter((o) => !captured.has(o.name)) : [];
    const a = BATTLE.sideTroops(B, 'A') + B.att.fled, d = BATTLE.sideTroops(B, 'D') + Math.floor(B.def.fled * 0.5);
    R.startA = B.att.start; R.startD = B.startD; R.endA = a; R.endD = d;
    const res = B.over ? B.over.result : 'withdrawn';
    R.result = res === 'captured' ? 'captured' : res === 'annihilated' ? 'annihilated' : 'retreat';
    delete S.battles[B.city];
    // the city may have changed hands or lost its lord while the siege ran
    if (to.owner !== defF) { R.result = 'retreat'; R.lines.push({ text: `${pname(B.city)} is no longer held by ${defF ? fname(defF) : 'anyone'}; the siege is lifted.`, cls: '' }); }
    if (!S.factions[attF] || !S.factions[attF].alive) { R.result = 'annihilated'; }
    to.troops = d;
    if (R.result !== 'captured') { to.food += Math.floor(B.att.food * 0); }
    settleBattle(R, a, B.att.start, attOff, defOff, false);
    if (R.result !== 'captured') from.food += Math.floor(B.att.food);   // the baggage train comes home
    R.replay = B.replay || null; R.city = B.city;
    B.report = R;
    return R;
  }
  // month roll-over: recruits raised in a besieged city join the wall, and AI battles fight the new month at once
  function processBattlesForNewMonth() {
    for (const B of Object.values(S.battles)) {
      if (B.over) { finishBattle(B); continue; }
      const p = prov(B.city);
      if (p.owner !== B.defF || !S.factions[B.attF] || !S.factions[B.attF].alive) { if (!B.over) B.over = { result: p.owner !== B.defF ? 'retreat' : 'annihilated' }; finishBattle(B); continue; }
      const extra = p.troops - BATTLE.sideTroops(B, 'D');
      if (extra > 500) { BATTLE.addArrival(B, { side: 'D', fid: B.defF, from: B.city, troops: extra, food: 0, officers: [], training: p.training, days: 1, exit: null }); p.troops -= extra; }
      B.dayInMonth = 0; B.phase = 'idle';
      if (!playerSideOf(B) && !B.awaitPlayer) runBattleMonth(B);
    }
  }
  // the player's unfinished battles are fought out by the AI before the month can end
  function autoResolvePlayerBattles() {
    for (const B of playerBattles()) battleAutoMonth(B.city);
    // allies' battles that waited on the player's answer: an unanswered plea from a house owed a favour is remembered
    for (const a of S.pendingAid || []) { const B = S.battles[a.city]; const helped = B && B.helpers && B.helpers[S.player]; if (!helped && favorsOwed(S.player, a.from) > 0) shiftRelation(S.player, a.from, -3); }
    S.pendingAid = [];
    for (const B of Object.values(S.battles)) if (B.awaitPlayer && !B.over) { B.awaitPlayer = false; runBattleMonth(B); }
  }

  function endTurn() {
    S.notices = [];
    checkRestorations();
    autoResolvePlayerBattles();
    // resolve any captives the player left unhandled: release them
    for (const c of [...S.pendingCaptives]) if (c.captor === S.player) resolveCaptive(c.name, 'release');
    // proposals the player ignored are declined; decisions left unanswered take the last option
    while (S.pendingProposals.length) respondProposal(0, false);
    while (S.pendingDecisions.length) { const ev = EVENTS.find((e) => e.id === S.pendingDecisions[0].id); decide(0, ev.decision.options.length - 1); }

    const order = Object.keys(S.factions).filter((f) => f !== S.player && S.factions[f].alive);
    order.sort(() => Math.random() - 0.5);
    for (const fid of order) { if (S.factions[fid].alive) aiTurn(fid); }

    advanceMonth();
    processBattlesForNewMonth();
    checkGameOver();
    snapshotMonth();
    return S.notices;
  }

  function advanceMonth() {
    S.month++; S.turn++;
    if (S.month > 12) { S.month = 1; S.year++; }
    const harvest = S.month === 9;
    // treaties: expiring ceasefires, relations drifting back toward neutral
    for (const k of Object.keys(S.diplomacy)) {
      const d = S.diplomacy[k];
      const [a, b] = k.split('|');
      if (d.status === 'ceasefire' && d.until <= S.turn && S.factions[a].alive && S.factions[b].alive) {
        d.status = 'neutral'; d.expiredAt = S.turn;
        const text = `The ceasefire between ${fname(a)} and ${fname(b)} has expired.`;
        (a === S.player || b === S.player) ? notice(text, 'dip') : log(text, 'dip');
      }
      if (d.status === 'alliance' && d.until && d.until <= S.turn && S.factions[a].alive && S.factions[b].alive) {
        d.status = 'neutral'; d.cooldown = Math.max(d.cooldown || 0, S.turn + 3);
        const text = `The alliance between ${fname(a)} and ${fname(b)} has run its five-year course and was not renewed.`;
        (a === S.player || b === S.player) ? notice(text, 'dip') : log(text, 'dip');
      }
      if (d.status === 'alliance' && Math.random() < 0.3) d.rel = clamp(d.rel + 1, -100, 100);
      else if (d.rel !== 0 && Math.random() < 0.4) d.rel += d.rel > 0 ? -1 : 1;
    }
    for (const f of Object.values(S.factions)) if (f.warTarget && f.warTargetUntil <= S.turn) { f.warTarget = null; }
    if (S.turn % 36 === 0) for (const f of Object.values(S.factions)) if (f.treachery > 0) f.treachery -= 1;   // old sins fade
    for (const p of Object.values(S.provinces)) {
      if (!p.owner) {
        p.troops = Math.min(p.troops + 150, 6000);
        p.gold += 20; p.food += 200;
        p.order = clamp((p.order == null ? 45 : p.order) + (p.order < 50 ? 1 : 0), 0, 100);
        continue;
      }
      const gov = governorOf(p);
      // trade: links to friendly neighbours pay; a hostile border costs
      const links = neighbors(p.id).filter((n) => n.owner && (n.owner === p.owner || treatyStatus(p.owner, n.owner) === 'alliance')).length;
      const hostileBorder = neighbors(p.id).some((n) => n.owner && n.owner !== p.owner && treatyStatus(p.owner, n.owner) === 'neutral');
      const tradeMult = (1 + 0.08 * Math.min(4, links)) * (hostileBorder ? 0.9 : 1);
      p.order = p.order == null ? 70 : p.order;
      const orderMult = 0.5 + p.order / 200;
      const govMult = gov ? 1 + (gov.pol / 1000) * (hasSkill(gov, 'admin') ? 2 : 1) : 1;
      const income = Math.floor((p.comm * 1.2 + p.pop / 5000) * (hasTrait(p, 'salt') ? 1.2 : 1) * (S.factions[p.owner].hasEmperor ? 1.1 : 1) * govMult * tradeMult * orderMult * incomeMult(p.owner));
      p.tradeLinks = links; p.hostileBorder = hostileBorder;
      p.gold += income + siteGold(p);
      p.gold = Math.max(0, p.gold - Math.floor(p.troops * GOLD_UPKEEP));
      p.food += Math.floor((p.agri * FOOD_PER_AGRI + (harvest ? p.agri * HARVEST_MULT : 0)) * (hasTrait(p, 'grain') ? 1.25 : 1)) + Math.floor(siteFood(p));
      const upkeep = Math.floor(p.troops * FOOD_UPKEEP * (isWinter() ? 1.1 : 1));
      p.food -= upkeep;
      if (p.food < 0) {
        const lost = Math.floor(p.troops * 0.12);
        p.troops -= lost; p.food = 0; p.order = clamp(p.order - 10, 0, 100);
        S.factions[p.owner].lastLoss = S.turn;
        const t = `Famine in ${pname(p.id)}: ${fmt(lost)} soldiers deserted for lack of food.`;
        if (p.owner === S.player) notice(t, 'bad'); else log(t, 'bad');
      }
      const popCap = popCapOf(p);
      const atPeace = !S.adj[p.id].some((n) => prov(n).owner && prov(n).owner !== p.owner && canAttack(p.owner, prov(n).owner));
      const settlers = p.owner && (p.order == null || p.order >= 55) && p.pop < popCap * 0.45 ? Math.floor(popCap * 0.0006) : 0;   // refugees return to orderly, half-empty land
      p.pop += Math.floor(p.pop * 0.004 * (isSpring() ? 1.5 : 1) * (atPeace ? 1.25 : 1) * (1 + 0.1 * sitesOf(p).filter((x) => x.type === 'village' && !x.damaged).length) * Math.max(0, 1 - p.pop / popCap)) + settlers;
      // order: a garrison and a governor keep the peace; neglect breeds revolt
      const garrisoned = p.troops >= p.pop / 60 || officersIn(p.id, p.owner).length > 0;
      const realm = factionProvinces(p.owner).length;
      const strain = realm > 16 ? Math.min(3, Math.floor((realm - 16) / 6) + 1) : 0;   // a realm past a dozen cities frays at the edges
      const cityGov = officersIn(p.id, p.owner).length > 0;
      p.order = clamp(p.order + (garrisoned ? (gov && hasSkill(gov, 'admin') ? 3 : 2) : -3) - (cityGov ? Math.max(0, strain - 1) : strain), 0, 100);
      // encirclement: a stronghold of a house down to its last towns, with enemies on every road and a larger host outside, is cut off from supply
      if (factionProvinces(p.owner).length <= 3 && S.adj[p.id].length) {
        const ring = neighbors(p.id);
        const cut = ring.every((q) => q.owner && q.owner !== p.owner && canAttack(q.owner, p.owner) && !S.factions[q.owner].raider);
        const outside = ring.reduce((a, q) => a + q.troops, 0);
        if (cut && outside > p.troops * 1.2) {
          p.troops -= Math.floor(p.troops * 0.03); p.order = clamp(p.order - 2, 0, 100); p.food = Math.max(0, p.food - Math.floor(p.food * 0.03));
          if (S.turn % 6 === 0) { const t = `${pname(p.id)} is cut off on every side; deserters slip over the walls of ${fname(p.owner)}'s last stronghold by night.`; (p.owner === S.player) ? notice(t, 'bad') : log(t, 'bad'); }
        }
      }
      if (p.order < 20 && Math.random() < 0.1) {
        const owner = p.owner; const refuge = factionProvinces(owner).find((q) => q.id !== p.id && S.adj[p.id].includes(q.id)) || factionProvinces(owner).find((q) => q.id !== p.id);
        for (const o of officersIn(p.id, owner)) { if (refuge) o.city = refuge.id; else { o.faction = null; o.loyalty = 0; } }
        p.owner = null; p.troops = Math.floor(p.troops * 0.5); p.order = 50; p.posture = 'hold';
        const t = `${pname(p.id)} rises in revolt against ${fname(owner)} and throws off its garrison!`;
        (owner === S.player) ? notice(t, 'bad', { major: true }) : log(t, 'bad');
        S.factions[owner].lastLoss = S.turn;
        if (S.factions[owner].alive && !factionProvinces(owner).length && !S.factions[owner].guest) { if (!(S.factions[owner].wanderer && goGuest(owner, p.id, null)) && !fleeToEmpty(owner, p.id, p.troops * 0.3, 0)) dissolveHouse(owner); }
        continue;
      }
      // summer floods on the lower Yellow River
      if (isSummer() && FLOOD_PLAIN.includes(p.id) && Math.random() < 0.06) {
        const lossA = ri(15, 45), lossF = Math.floor(p.food * 0.25), dead = Math.floor(p.troops * 0.05);
        p.agri = Math.max(0, p.agri - lossA); p.food -= lossF; p.troops -= dead;
        const t = `The Yellow River bursts its banks at ${pname(p.id)}: agriculture -${lossA}, food -${fmt(lossF)}, ${fmt(dead)} soldiers drowned.`;
        p.owner === S.player ? notice(t, 'bad') : log(t, 'bad');
      }
      // random events
      const r = Math.random();
      if (r < 0.025) {
        const g = Math.floor(p.agri * 10); p.food += g;
        const t = `Bumper harvest in ${pname(p.id)}: +${fmt(g)} food.`;
        p.owner === S.player ? notice(t, 'good') : log(t, 'good');
      } else if (r < 0.045) {
        const lossA = ri(10, 40), lossF = Math.floor(p.food * 0.2);
        p.agri = Math.max(0, p.agri - lossA); p.food -= lossF;
        const t = `Floods ravage ${pname(p.id)}: agriculture -${lossA}, food -${fmt(lossF)}.`;
        p.owner === S.player ? notice(t, 'bad') : log(t, 'bad');
      } else if (r < 0.06) {
        const dead = Math.floor(p.troops * 0.1);
        p.troops -= dead; p.pop = Math.floor(p.pop * 0.97);
        const t = `Plague sweeps ${pname(p.id)}: ${fmt(dead)} soldiers perish.`;
        p.owner === S.player ? notice(t, 'bad') : log(t, 'bad');
      } else if (r < 0.075) {
        const g = Math.floor(p.gold * 0.25); p.gold -= g;
        const t = `Bandits raid the treasury of ${pname(p.id)}: -${fmt(g)} gold.`;
        p.owner === S.player ? notice(t, 'bad') : log(t, 'bad');
      }
    }
    if (harvest) notice('Autumn harvest: granaries across the land are filled.', 'good');
    if (S.month === 3) notice('Spring. The population swells, the fields are sown, and the snows melt from the northern passes.', 'sys');
    if (S.month === 6) notice('Summer. Monsoon rains bog down campaigns in the south, and the Yellow River runs dangerously high.', 'sys');
    if (S.month === 12) notice('Winter. Snow closes the passes of the north, and armies in camp eat a tenth more.', 'sys');

    // a living house must always have a lord of its own; heal any inconsistency by succession
    for (const F of Object.values(S.factions)) if (F.alive) ensureRuler(F.id);
    // loyalty drift and defection
    for (const o of allOfficers()) {
      o.acted = false;
      if (!o.faction || o.captive || isRuler(o)) continue;
      const ruler = rulerOf(o.faction);
      if (!ruler) continue;
      if (Math.random() < 0.35) {
        if (ruler.chr >= 90 || (S.factions[o.faction].prestige || 0) >= 50 || (S.factions[o.faction].title || 0) >= 2) o.loyalty = clamp(o.loyalty + 1, 0, 100);
        else if (ruler.chr < 70) o.loyalty = clamp(o.loyalty - 1, 0, 100);
      }
      // ties: kin and sworn brothers of the lord are steadfast; brothers in the same house steady each other; rivals grate
      if (bonded(o.name, ruler.name)) o.loyalty = 100;
      else if (factionOfficers(o.faction).some((x) => x !== o && bonded(o.name, x.name))) o.loyalty = Math.max(o.loyalty, 85);
      if (factionOfficers(o.faction).some((x) => x !== o && areRivals(o.name, x.name)) && Math.random() < 0.5) o.loyalty = clamp(o.loyalty - 1, 0, 100);
      if (areEnemies(o.name, ruler.name) && Math.random() < 0.5) o.loyalty = clamp(o.loyalty - 2, 0, 100);
      if (loyaltyFloor(o) && o.loyalty < loyaltyFloor(o)) o.loyalty = loyaltyFloor(o);
      // a sworn brother or kinsman who rules another house calls him home
      const kinLord = bondedRuler(o, o.faction);
      if (kinLord && !isRuler(o) && Math.random() < 0.1) {
        const oldF = o.faction; const dest = rulerOf(kinLord).city;
        o.faction = kinLord; o.city = dest; o.loyalty = 100; o.rank = 0;
        const text = `${o.name} slips away from ${fname(oldF)} to rejoin his sworn kinsman ${fname(kinLord)} at ${pname(dest)}.`;
        (oldF === S.player || kinLord === S.player) ? notice(text, 'hist') : log(text, 'hist');
        continue;
      }
      if (bondGroup(o.name) && factionOfficers(o.faction).some((x) => x !== o && bonded(o.name, x.name))) continue;   // the bonded never desert their brothers
      if (o.loyalty < 35 && Math.random() < 0.12) {
        const targets = enemyNeighbors(o.city).filter((n) => n.owner);
        const oldF = o.faction;
        if (targets.length) {
          const t = pick(targets);
          o.faction = t.owner; o.city = t.id; o.loyalty = 60 + ri(0, 15);
          const text = `${o.name} has defected from ${fname(oldF)} to ${fname(t.owner)}!`;
          (oldF === S.player || t.owner === S.player) ? notice(text, 'bad') : log(text, 'bad');
        } else {
          o.faction = null; o.loyalty = 0;
          const text = `${o.name} has abandoned ${fname(oldF)} and gone into hiding.`;
          oldF === S.player ? notice(text, 'bad') : log(text, 'bad');
        }
      }
    }
    processGuests();
    processEvents();
    processObjectives();
    processAgeing();
    processArrivals();
    processTitles();
    if (S.month === 1) S.history.push({ year: S.year, houses: Object.fromEntries(Object.values(S.factions).filter((f) => f.alive && !f.raider).map((f) => [f.id, { name: f.name, color: f.color, cities: factionProvinces(f.id).length, troops: totalTroops(f.id) }])), officers: allOfficers().length });
    const note = HISTORY_NOTES[`${S.year}-${S.month}`];
    if (note) notice(note, 'hist');
  }

  function checkGameOver() {
    if (S.observer) {
      const alive = Object.values(S.factions).filter((f) => f.alive);
      if (alive.length <= 1 && !Object.values(S.provinces).some((p) => !p.owner)) { S.over = 'observer'; S.winner = alive[0] ? alive[0].id : null; }
      return;
    }
    const mine = factionProvinces(S.player).length;
    if (!S.factions[S.player].alive) { S.over = 'defeat'; return; }
    if (mine === 0 && !S.factions[S.player].guest) { S.over = 'defeat'; return; }
    const total = Object.keys(S.provinces).length;
    if (mine === total) { S.over = 'victory'; return; }
  }

  // ---------- AI ----------
  function aiTurn(fid) {
    quiet = true;
    try { aiTurnInner(fid); } finally { quiet = false; }
  }

  // Strength estimates shared by the AI (mirror the battle formula's first round)
  function defStrength(t) {
    const tOff = t.owner ? officersIn(t.id, t.owner) : [];
    const fb = t.owner ? GARRISON : MILITIA;
    return t.troops * (0.5 + best(tOff, 'war', fb) / 100) * (0.7 + best(tOff, 'ldr', fb) / 250) * (0.7 + t.training / 300) * (1 + t.defense / WALL_DIV);
  }
  function attStrength(troops, party, p) {
    return troops * (0.5 + best(party, 'war', MILITIA) / 100) * (0.7 + best(party, 'ldr', MILITIA) / 250) * (0.7 + p.training / 300);
  }
  // How many soldiers a city can feed and draw from its population
  const sustainCap = (p) => Math.floor(Math.min(p.agri * 50, p.pop * 0.22));
  function aiParty(pid) {
    let idle = idleOfficers(pid).filter((o) => !isRuler(o)).sort((x, y) => y.war - x.war);
    if (!idle.length) idle = idleOfficers(pid);
    return idle.slice(0, 3);
  }

  // ---------- AI: personality, planning and play ----------
  const baseThreshold = (fid) => { const F = S.factions[fid]; let th = Math.max(1.05, 1.25 / F.aggr); if (has(fid, 'reckless')) th -= 0.1; if (has(fid, 'cautious')) th += 0.1; return Math.min(1.5, Math.max(0.95, th)); };
  const spareTroops = (fid, p) => { const hostileN = neighbors(p.id).filter((n) => n.owner !== fid && n.owner && canAttack(fid, n.owner)); const safe = Math.max(3000, ...hostileN.map((n) => n.troops * 0.6)); return Math.max(0, p.troops - safe); };
  const isFront = (fid, p) => neighbors(p.id).some((n) => n.owner !== fid && (!n.owner || canAttack(fid, n.owner)));
  const threatOn = (fid, p) => Math.max(0, ...neighbors(p.id).filter((n) => n.owner && n.owner !== fid && canAttack(fid, n.owner)).map((n) => n.troops));
  const nextHop = (fid, fromId, toId) => {   // BFS through own cities
    if (fromId === toId) return null;
    const prevMap = { [fromId]: null }; const q = [fromId];
    while (q.length) { const x = q.shift(); for (const n of S.adj[x]) { if (prevMap[n] !== undefined || prov(n).owner !== fid) continue; prevMap[n] = x; if (n === toId) { let cur = n; while (prevMap[cur] !== fromId) cur = prevMap[cur]; return cur; } q.push(n); } }
    return null;
  };

  // ---------- the largest power thinks differently ----------
  function detectPhase(fid) {
    const F = S.factions[fid];
    const mine = factionProvinces(fid); const n = mine.length;
    const others = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== fid).map((f) => factionProvinces(f.id).length);
    const second = Math.max(0, ...others);
    const total = Object.keys(S.provinces).length;
    if (n >= 12 && (n * 2 >= total || (n * 5 >= total * 2 && n >= second * 2.5))) { F.phase = 'unifying'; F.consolidatingSince = 0; return F.phase; }   // steamroll what is left
    const hegemon = n >= 10 && (n >= second * 1.5 || leaderHouse() === fid);
    if (!hegemon) { F.phase = 'rising'; return F.phase; }
    const avgOrder = mine.reduce((a, p) => a + p.order, 0) / Math.max(1, n);
    const lowOrder = mine.filter((p) => p.order < 50).length;
    const recentGains = (F.gains || []).filter((t) => S.turn - t < 24).length;
    const wants = (avgOrder < 62 || lowOrder >= 3 || recentGains >= 4) ? 'consolidating' : 'hegemon';
    // digesting has a limit: after two years the court demands the war be finished, and the last rival is never left in peace
    if (wants === 'consolidating') { if (!F.consolidatingSince) F.consolidatingSince = S.turn; } else F.consolidatingSince = 0;
    F.phase = wants === 'consolidating' && (S.turn - F.consolidatingSince > 24 || lastFoe(fid)) ? 'hegemon' : wants;
    return F.phase;
  }
  // the last rival: when every other lord is gone (or a guest), there is nothing left to court
  const rivals = (fid) => Object.values(S.factions).filter((f) => f.alive && !f.raider && !f.guest && f.id !== fid);
  const lastFoe = (fid) => { const r = rivals(fid); return r.length === 1 ? r[0].id : null; };
  const coalitionAgainst = (fid) => Object.entries(S.factions[fid].attackedBy || {}).filter(([f, t]) => S.turn - t <= 12 && S.factions[f] && S.factions[f].alive && !S.factions[f].raider).map(([f]) => f);
  const secondPower = (fid) => Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== fid).sort((a, b) => factionProvinces(b.id).length - factionProvinces(a.id).length)[0] || null;
  // Realm cohesion. The AI wants a compact realm with a short frontier, not a scatter of cities across the map:
  // it prefers targets that touch several of its own cities, that reunite separated blocks of its land, and that
  // turn frontier cities into interior ones rather than pushing a lonely salient into enemy country.
  const isForeign = (fid, n) => n.owner !== fid && (!n.owner || canAttack(fid, n.owner));
  function realmComponents(fid) {
    const comp = {}; let k = 0;
    for (const p of factionProvinces(fid)) {
      if (comp[p.id] !== undefined) continue;
      k++; const q = [p.id]; comp[p.id] = k;
      while (q.length) { const x = q.pop(); for (const n of S.adj[x]) if (prov(n).owner === fid && comp[n] === undefined) { comp[n] = k; q.push(n); } }
    }
    return { comp, count: k };
  }
  function cohesion(fid, t, comps) {
    const nb = neighbors(t.id);
    const mineNb = nb.filter((n) => n.owner === fid);
    const foreign = nb.filter((n) => isForeign(fid, n)).length;
    const joins = new Set(mineNb.map((n) => comps.comp[n.id])).size >= 2;
    // frontier change: t joins the front if anything hostile still touches it; my neighbours whose only hostile neighbour was t leave it
    let delta = foreign ? 1 : 0;
    for (const n of mineNb) if (isFront(fid, n) && !neighbors(n.id).some((m) => m.id !== t.id && isForeign(fid, m))) delta -= 1;
    return { mineNb: mineNb.length, foreign, joins, delta, salient: mineNb.length === 1 && foreign >= 3 };
  }
  // a linchpin is a city whose loss would cut the realm in two: the AI holds it and reinforces it first
  function isLinchpin(fid, pid) {
    const mineNb = S.adj[pid].filter((n) => prov(n).owner === fid);
    if (mineNb.length < 2) return false;
    const seen = new Set([mineNb[0]]); const q = [mineNb[0]];
    while (q.length) { const x = q.pop(); for (const n of S.adj[x]) if (n !== pid && prov(n).owner === fid && !seen.has(n)) { seen.add(n); q.push(n); } }
    return mineNb.some((n) => !seen.has(n));
  }
  // multiplier on the strength an AI demands before an opportunistic strike: a strike that lengthens the line must be very favourable
  const cohesionBar = (co) => Math.max(0.8, 1 + 0.2 * Math.max(0, co.delta) + (co.salient ? 0.25 : 0) - (co.joins ? 0.25 : 0) - 0.05 * Math.max(0, co.mineNb - 1));

  // Govern the realm: interior garrisons feed the frontier, administrators go inland, generals go out,
  // a reserve waits in the middle, and the succession is prepared.
  function aiHegemon(fid) {
    const F = S.factions[fid];
    const mine = factionProvinces(fid);
    const seat = rulerOf(fid).city;
    const fronts = mine.filter((p) => isFront(fid, p));
    const interior = mine.filter((p) => !isFront(fid, p));
    // 1. reserve: the interior city with the most troops nearest the fronts
    const reserve = interior.length ? interior.reduce((m, p) => (p.troops > m.troops ? p : m)) : null;
    F.reserve = reserve ? reserve.id : null;
    // 2. interior cities keep a peacekeeping garrison and push the rest toward the front (or the reserve)
    for (const p of interior) {
      if (reserve && p.id === reserve.id) continue;
      const keep = F.phase === 'unifying' ? Math.max(1200, Math.floor(p.pop / 120)) : Math.max(3000, Math.floor(p.pop / 60));
      const spare = p.troops - keep;
      const idle = idleOfficers(p.id).filter((o) => !isRuler(o));
      if (spare < (F.phase === 'unifying' ? 800 : 2500) || !idle.length || officersIn(p.id, fid).length < (p.order >= 60 ? 1 : 2)) continue;   // a quiet interior town may be left to its magistrates
      const dest = fronts.length ? fronts.reduce((m, f) => ((threatOn(fid, f) / Math.max(1, f.troops)) > (threatOn(fid, m) / Math.max(1, m.troops)) ? f : m)) : reserve;
      if (!dest) continue;
      const hop = S.adj[p.id].includes(dest.id) ? dest.id : nextHop(fid, p.id, dest.id);
      if (!hop) continue;
      const escort = idle.filter((o) => !hasSkill(o, 'admin')).sort((a, b) => b.war - a.war)[0] || idle[0];
      transfer(p.id, hop, { troops: Math.floor(spare * 0.8), gold: Math.floor(Math.max(0, p.gold - 1500) * 0.5), food: Math.floor(Math.max(0, p.food - p.troops * FOOD_UPKEEP * 8) * 0.5), officers: [escort.name] });
    }
    // 3. the reserve rides to whichever border is in danger
    if (reserve) {
      const danger = fronts.filter((f) => threatOn(fid, f) > f.troops * 1.1).sort((a, b) => (threatOn(fid, b) - b.troops) - (threatOn(fid, a) - a.troops))[0];
      const idle = idleOfficers(reserve.id).filter((o) => !isRuler(o));
      if (danger && idle.length && reserve.troops > 4000) {
        const hop = S.adj[reserve.id].includes(danger.id) ? danger.id : nextHop(fid, reserve.id, danger.id);
        if (hop) transfer(reserve.id, hop, { troops: Math.floor(reserve.troops * 0.7), officers: [idle.sort((a, b) => b.war - a.war)[0].name] });
      } else if (!danger && idle.length && F.plan && prov(F.plan.hammer).owner === fid && F.plan.hammer !== reserve.id && reserve.troops > (F.phase === 'unifying' ? 3000 : 12000)) {
        // no border in danger: the reserve does not sit idle but marches to the main blow (a hegemon keeps a core at home; a unifier sends nearly all)
        const hop = S.adj[reserve.id].includes(F.plan.hammer) ? F.plan.hammer : nextHop(fid, reserve.id, F.plan.hammer);
        if (hop) transfer(reserve.id, hop, { troops: Math.floor(reserve.troops * (F.phase === 'unifying' ? 0.8 : 0.5)), food: Math.floor(Math.max(0, reserve.food - reserve.troops * FOOD_UPKEEP * 6) * 0.4), officers: [idle.sort((a, b) => b.war - a.war)[0].name] });
      }
    }
    // 4. administrators inland, to the richest interior cities without one
    for (const p of interior.sort((a, b) => b.comm - a.comm).slice(0, 4)) {
      if (officersIn(p.id, fid).some((o) => hasSkill(o, 'admin'))) continue;
      const donor = mine.find((d) => d.id !== p.id && S.adj[d.id].includes(p.id) && officersIn(d.id, fid).length >= 2 && idleOfficers(d.id).some((o) => hasSkill(o, 'admin') && !isRuler(o)));
      if (donor) { const adm = idleOfficers(donor.id).find((o) => hasSkill(o, 'admin') && !isRuler(o)); transfer(donor.id, p.id, { officers: [adm.name] }); }
    }
    // 5. new or restless cities get an officer to sit on them
    for (const p of mine.filter((q) => q.order < 55 && officersIn(q.id, fid).length === 0)) {
      const donor = mine.find((d) => S.adj[d.id].includes(p.id) && officersIn(d.id, fid).length >= 2 && idleOfficers(d.id).some((o) => !isRuler(o)));
      if (donor) { const o = idleOfficers(donor.id).filter((x) => !isRuler(x)).sort((a, b) => b.pol - a.pol)[0]; transfer(donor.id, p.id, { officers: [o.name] }); }
    }
    // 6. the succession and the ambitious: kin and marshals ranked and kept close, restless generals not left in rich far cities
    const seatP = prov(seat);
    for (const o of factionOfficers(fid)) {
      if (isRuler(o)) continue;
      const kin = bonded(o.name, rulerOf(fid).name);
      const ambitious = (o.war + o.ldr) / 2 >= 85 && o.loyalty < 75;
      if ((kin || ambitious) && (o.rank || 0) < 3 && prov(o.city).owner === fid && prov(o.city).gold >= RANK_COST[(o.rank || 0) + 1]) appoint(o.city, o.name);
      if (kin && o.city !== seat && !o.acted && prov(o.city).owner === fid && !isFront(fid, prov(o.city))) { const hop = S.adj[o.city].includes(seat) ? seat : nextHop(fid, o.city, seat); if (hop && officersIn(o.city, fid).length >= 2) transfer(o.city, hop, { officers: [o.name] }); }
      if (ambitious && !kin && !o.acted && prov(o.city).owner === fid && prov(o.city).gold > 4000 && o.city !== seat) { const hop = S.adj[o.city].includes(seat) ? seat : nextHop(fid, o.city, seat); if (hop && officersIn(o.city, fid).length >= 2) transfer(o.city, hop, { officers: [o.name] }); }
    }
    // 7. titles: a hegemon takes what it is owed, at once; without the Emperor, his court is the prize
    const elig = eligibleTitle(fid);
    if (elig > (F.title || 0)) assumeTitle(fid, elig);
    if (!F.hasEmperor) { const holder = Object.values(S.factions).find((f) => f.hasEmperor && f.alive && f.id !== fid); if (holder && bordering(fid, holder.id) && canAttack(fid, holder.id)) { F.warTarget = holder.id; F.warTargetUntil = S.turn + 6; } }
    // 8. under a coalition, give ground at the edges and strike the nearest member with everything
    const coal = coalitionAgainst(fid);
    if (coal.length >= 2) {
      const near = coal.filter((c) => bordering(fid, c)).sort((a, b) => totalTroops(a) - totalTroops(b))[0];
      if (near) { F.warTarget = near; F.warTargetUntil = S.turn + 6; }
    }
  }

  // Choose the main war for the month: enemy house (or free city), hammer city, target city.
  function makePlan(fid) {
    const F = S.factions[fid]; const th = baseThreshold(fid);
    const destiny = destinyTargets(fid); const leader = leaderHouse();
    const warTarget = F.warTarget && F.warTargetUntil > S.turn && S.factions[F.warTarget] && S.factions[F.warTarget].alive ? F.warTarget : null;
    let best = null; const comps = realmComponents(fid);
    // a split realm wants to grow back together: distance of every city from the block that holds the seat
    let distMain = null;
    if (comps.count > 1) {
      const seatComp = comps.comp[rulerOf(fid).city]; distMain = {};
      const q = factionProvinces(fid).filter((p) => comps.comp[p.id] === seatComp).map((p) => p.id); for (const c of q) distMain[c] = 0;
      while (q.length) { const x = q.shift(); for (const n of S.adj[x]) if (distMain[n] === undefined) { distMain[n] = distMain[x] + 1; q.push(n); } }
    }
    for (const p of factionProvinces(fid)) {
      const party = officersIn(p.id, fid).filter((o) => !isRuler(o)).sort((a, b) => b.war - a.war).slice(0, 3);
      if (!party.length) continue;
      const reinforce = neighbors(p.id).filter((n) => n.owner === fid).reduce((s, n) => s + spareTroops(fid, n) * 0.8, 0);
      const potential = p.troops * 0.7 + reinforce;
      for (const t of neighbors(p.id)) {
        if (t.owner === fid || !canAttack(fid, t.owner) || (S.battles && S.battles[t.id])) continue;
        const m = battleModifiers(p.id, t.id); if (m.blocked) continue;
        let ratio = (attStrength(potential * (1 - m.loss), party, p) * m.att) / Math.max(1, defStrength(t) * m.def);
        let score = ratio;
        if (!t.owner) score += 0.25;
        if (destiny.has(t.id)) score += 0.3;
        if (t.owner && t.owner === warTarget) score += 0.4;
        if (t.owner && S.turn - (S.factions[t.owner].lastLoss || -99) <= 6) score += 0.25;     // opportunism
        if (t.owner && t.owner === leader && leader !== fid) score += 0.3;                      // coalition
        if (t.owner && relation(fid, t.owner) <= -30) score += 0.1;
        if (t.owner && S.factions[t.owner].raider) score += 0.15;                              // stamp out raiders
        const richness = (t.gold + t.food / 10) / 20000; if (F.raider) score += richness;      // raiders want loot
        const co = cohesion(fid, t, comps);
        if (!F.raider) {
          score += 0.12 * Math.min(3, co.mineNb - 1);                                            // hug my own land
          score -= 0.15 * Math.max(-3, Math.min(3, co.delta));                                   // shorten the frontier
          if (co.joins) score += 0.45;                                                           // reunite a split realm
          if (distMain && distMain[t.id] !== undefined && distMain[p.id] !== undefined && distMain[t.id] < distMain[p.id]) score += 0.35;   // a step back toward the seat
          if (co.salient && !destiny.has(t.id) && t.owner !== warTarget) score -= 0.3;          // no lonely salients
        }
        if (F.phase !== 'rising') {
          // the largest power: finish small neighbours, shorten the frontier, strike the second power decisively, avoid new fronts
          if (t.owner && factionProvinces(t.owner).length <= 2) score += 0.5;
          score -= 0.1 * Math.max(-3, Math.min(3, co.delta));                                   // the hegemon cares even more for a tidy line
          const sp = secondPower(fid);
          if (t.owner && sp && t.owner === sp.id && totalTroops(fid) >= totalTroops(sp.id) * 2 && rulerOf(sp.id) && rulerOf(sp.id).city === t.id) score += 0.3;
          if (F.phase !== 'unifying' && t.owner && F.plan && F.plan.enemy && t.owner !== F.plan.enemy && factionProvinces(t.owner).length > 2) score -= 0.3;
          if (F.phase === 'unifying' && t.owner) score += 0.2 + 0.4 / Math.max(1, factionProvinces(t.owner).length);   // finish the small ones, then the rest
          if (F.phase === 'consolidating' && t.owner && factionProvinces(t.owner).length > 2) score -= 0.6;   // digest first
        }
        if (!best || score > best.score) best = { enemy: t.owner, hammer: p.id, target: t.id, score, ratio, since: S.turn };
      }
    }
    const cur = F.plan;
    const valid = cur && prov(cur.hammer).owner === fid && prov(cur.target).owner === cur.enemy && prov(cur.target).owner !== fid && S.adj[cur.hammer].includes(cur.target) && canAttack(fid, cur.enemy);
    if (valid && S.turn - cur.since < 9 && (!best || best.score < cur.score * 1.4)) { return cur; }
    F.plan = best; return best;
  }

  function aiPrisoners(fid) {
    for (const c of [...S.pendingCaptives]) {
      if (c.captor !== fid) continue;
      const o0 = off(c.name);
      if (o0 && c.from === S.player && !c.ransomAsked && S.factions[S.player] && S.factions[S.player].alive && factionProvinces(S.player).length && Math.random() < 0.5) { c.ransomAsked = true; S.pendingProposals.push({ from: fid, type: 'ransom', officer: c.name, price: ransomPrice(o0), envoy: (rulerOf(fid) || { name: fname(fid) }).name }); continue; }
      if (c.ransomAsked && S.pendingProposals.some((pr) => pr.type === 'ransom' && pr.officer === c.name)) continue;   // waiting on the answer
      let w = { recruit: 0.7, release: 0.22, execute: 0.08 };
      if (has(fid, 'honourable')) w = { recruit: 0.5, release: 0.5, execute: 0 };
      if (has(fid, 'schemer')) w = { recruit: 0.85, release: 0.12, execute: 0.03 };
      if (has(fid, 'treacherous')) w = { recruit: 0.5, release: 0.15, execute: 0.35 };
      const o = off(c.name); if (o && c.from && S.factions[c.from] && S.factions[c.from].ruler === c.name && has(fid, 'treacherous')) w = { recruit: 0.2, release: 0.1, execute: 0.7 };
      const r = Math.random(); resolveCaptive(c.name, r < w.recruit ? 'recruit' : r < w.recruit + w.release ? 'release' : 'execute');
    }
  }

  function aiTurnInner(fid) {
    const F = S.factions[fid];
    if (!ensureRuler(fid)) return;
    if (F.guest) { aiExile(fid); return; }
    F.caution = Math.max(1, (F.caution || 1) - 0.05);
    aiPrisoners(fid);
    if (Math.random() < 0.6) aiDiplomacy(fid);
    aiAppoint(fid);
    aiPlots(fid);
    if (tacticalOn()) aiReinforceBattles(fid);
    aiRepayFavors(fid);
    const hostile = (n) => n.owner !== fid && canAttack(fid, n.owner);
    const comps = realmComponents(fid);
    const phase = detectPhase(fid);
    if (phase !== 'rising') aiHegemon(fid);
    const plan = makePlan(fid);
    if (!plan) { if (!F.idleSince) F.idleSince = S.turn; } else F.idleSince = 0;   // months with nothing to attack: see aiDiplomacy
    const th = phase === 'unifying' ? 1.1 * (diff() === 'hard' ? 0.95 : diff() === 'easy' ? 1.1 : 1) : baseThreshold(fid) * (F.caution || 1) * (diff() === 'hard' ? 0.95 : diff() === 'easy' ? 1.1 : 1) * Math.min(1.3, 1 + 0.015 * overextension(fid));
    const provs = factionProvinces(fid);
    const aiTactics = (H, T, party) => { const bestInt = Math.max(...party.map((o) => o.int)); const ratio = attStrength(H.troops * 0.7, party, H) / Math.max(1, defStrength(T)); const stance = T.defense >= 350 && (partyHas(party, 'siege') || ratio < 1.6) ? 'siege' : ratio >= 1.8 ? 'assault' : bestInt >= 85 ? 'feint' : 'standard'; const m = battleModifiers(H.id, T.id); const lowLoy = T.owner && officersIn(T.id, T.owner).some((o) => !isRuler(o) && o.loyalty < 60); const stratagem = bestInt < 75 ? 'auto' : lowLoy && has(fid, 'schemer') ? 'discord' : m.type === 'river' && (H.fleet || 0) >= 40 ? 'flood' : !isWinter() && bestInt >= 80 ? 'fire' : 'auto'; return { stance, stratagem }; };

    // rewards for wavering officers, before they think of leaving
    for (const o of factionOfficers(fid)) { const p = prov(o.city); if (o.loyalty < 70 && p.owner === fid && p.gold >= 400) reward(p.id, o.name); }
    // recruit free officers
    for (const p of provs) for (const fo of freeOfficersIn(p.id)) { const idle = idleOfficers(p.id); if (!idle.length) break; recruitOfficer(p.id, idle.reduce((m, o) => (o.chr > m.chr ? o : m)).name, fo.name); }
    // emergency food
    for (const p of provs) { const fm = p.food / Math.max(1, p.troops * FOOD_UPKEEP); if (fm < 4 && p.gold > 1200) buyFood(p.id, Math.min(p.gold - 600, 2500)); }

    // 1. defence: evacuate hopeless towns, reinforce threatened ones
    const attacked = new Set();
    const linchpins = new Set(factionProvinces(fid).filter((p) => isLinchpin(fid, p.id)).map((p) => p.id));
    for (const p of factionProvinces(fid).sort((a, b) => (linchpins.has(b.id) ? 1 : 0) - (linchpins.has(a.id) ? 1 : 0) || threatOn(fid, b) - threatOn(fid, a))) {
      const threat = threatOn(fid, p); if (!threat) continue;
      const seat = rulerOf(fid).city;
      const friends = neighbors(p.id).filter((n) => n.owner === fid);
      const bridge = linchpins.has(p.id);   // the link between two halves of the realm is held to the last
      if (threat > p.troops * (bridge ? 5 : 3) && p.id !== seat && friends.length && p.troops > 800) {
        const dest = friends.reduce((m, n) => (n.troops > m.troops ? n : m));
        const idle = idleOfficers(p.id);
        if (idle.length) transfer(p.id, dest.id, { troops: p.troops - 500, gold: Math.max(0, p.gold - 200), food: Math.max(0, p.food - 2000), officers: idle.map((o) => o.name) });
        continue;
      }
      if (threat > p.troops * (bridge ? 0.9 : 1.2)) {
        for (const d of friends) {
          if (threatOn(fid, d) > d.troops) continue;
          const spare = spareTroops(fid, d); const idle = idleOfficers(d.id).filter((o) => !isRuler(o));
          if (spare >= 2000 && idle.length && officersIn(d.id, fid).length >= 2) transfer(d.id, p.id, { troops: Math.floor(spare * 0.7), officers: [idle.reduce((m, o) => (o.war > m.war ? o : m)).name] });
        }
      }
    }

    // 2. the main war: stage toward the hammer, move commanders, strike when ready
    if (plan && prov(plan.hammer).owner === fid) {
      const H = prov(plan.hammer), T = prov(plan.target);
      const m = battleModifiers(H.id, T.id);
      const need = (defStrength(T) * m.def * th) / (m.att * (1 - m.loss));
      const party = aiParty(H.id);
      const keepHome = phase === 'unifying' ? 0.15 : neighbors(H.id).filter((n) => n.owner && hostile(n)).length > 1 ? 0.35 : 0.2;
      const send = Math.floor(H.troops * (1 - keepHome));
      const smallPrey = !T.owner || factionProvinces(T.owner).length <= 2 || T.owner === lastFoe(fid);
      const ready = party.length && send >= 3000 && attStrength(send, party, H) > need && H.food > send * 0.15 && !(phase === 'consolidating' && !smallPrey);
      if (ready) { attack(H.id, T.id, party.map((o) => o.name), send, aiTactics(H, T, party)); attacked.add(H.id); }
      else {
        // gather: neighbours send spare troops and a strong commander; interior cities route troops one hop closer
        for (const d of factionProvinces(fid)) {
          if (d.id === H.id) continue;
          const idle = idleOfficers(d.id).filter((o) => !isRuler(o));
          if (!idle.length || officersIn(d.id, fid).length < (phase !== 'rising' && !isFront(fid, d) && d.order >= 60 ? 1 : 2)) continue;
          const hop = S.adj[d.id].includes(H.id) ? H.id : nextHop(fid, d.id, H.id);
          if (!hop) continue;
          const spare = isFront(fid, d) ? spareTroops(fid, d) : Math.max(0, d.troops - (phase === 'unifying' ? 1200 : 2500));
          if (spare < 2000) continue;
          const escort = idle.reduce((mm, o) => (o.war > mm.war ? o : mm));
          const keepGov = governorOf(d); if (keepGov && keepGov.name === escort.name && idle.length < 2) continue;
          transfer(d.id, hop, { troops: Math.floor(spare * 0.8), gold: Math.floor(Math.max(0, d.gold - 1000) * 0.3), food: Math.floor(Math.max(0, d.food - d.troops * FOOD_UPKEEP * 6) * 0.5), officers: [escort.name] });
        }
      }
    }
    // 3. opportunistic strikes elsewhere when very favourable
    for (const p of factionProvinces(fid)) {
      if (attacked.has(p.id)) continue;
      for (const t of neighbors(p.id).filter(hostile)) {
        if (S.battles && S.battles[t.id]) continue;
        const party = aiParty(p.id); if (!party.length) break;
        const m = battleModifiers(p.id, t.id); if (m.blocked) continue;
        const send = Math.floor(p.troops * (phase === 'unifying' ? 0.75 : 0.65));
        const bonus = t.owner && S.turn - (S.factions[t.owner].lastLoss || -99) <= 6 ? 0.85 : 1;
        const bar = F.raider ? 1 : phase === 'unifying' ? 0.9 : 1.2 * cohesionBar(cohesion(fid, t, comps));
        if (send >= 3000 && attStrength(send * (1 - m.loss), party, p) * m.att > defStrength(t) * m.def * th * bonus * bar && p.food > send * 0.15) { attack(p.id, t.id, party.map((o) => o.name), send, aiTactics(p, t, party)); attacked.add(p.id); break; }
      }
    }

    // 4. officers: keep the wavering away from the border; send POL to the interior, WAR to the front
    for (const p of factionProvinces(fid)) {
      const idle = idleOfficers(p.id).filter((o) => !isRuler(o));
      if (!idle.length || officersIn(p.id, fid).length < 2) continue;
      const friends = neighbors(p.id).filter((n) => n.owner === fid);
      if (!friends.length) continue;
      if (isFront(fid, p)) {
        const shaky = idle.find((o) => o.loyalty < 50);
        const interior = friends.find((n) => !isFront(fid, n));
        if (shaky && interior) transfer(p.id, interior.id, { officers: [shaky.name] });
      } else {
        const front = friends.filter((n) => isFront(fid, n) && officersIn(n.id, fid).length < 3).sort((a, b) => threatOn(fid, b) - threatOn(fid, a))[0];
        const general = idle.filter((o) => o.war >= 78).sort((a, b) => b.war - a.war)[0];
        if (front && general && idle.length >= 2) transfer(p.id, front.id, { officers: [general.name] });
      }
    }

    // 5. domestic work: phased build order, personality, and spending the hoard
    const year = S.year;
    for (const p of factionProvinces(fid)) {
      const front = isFront(fid, p); const threat = threatOn(fid, p);
      const tier = provData(p.id).tier; const tierCap = 8000 + tier * 4000;
      const passCity = S.adj[p.id].some((n) => roadType(p.id, n) === 'pass' && prov(n).owner !== fid);
      for (const o of idleOfficers(p.id)) {
        const foodMonths = p.food / Math.max(1, p.troops * FOOD_UPKEEP);
        const cap = Math.max(tierCap, sustainCap(p)) * (has(fid, 'reckless') ? 1.1 : 1);
        const wantTroops = p.troops < cap && (p.troops < threat * 1.1 || p.troops < tierCap || (front && p.gold > 2000) || p.gold > 4000);
        const needFleet = hasShipyard(p) && p.fleet < (p.gold > 4000 ? 80 : 60) && neighbors(p.id).some((n) => hostile(n) && ['river', 'sea'].includes(roadType(p.id, n.id)));
        const rich = p.gold > 4000;
        const builder = has(fid, 'builder');
        if (p.order < (phase === 'rising' ? 55 : 70) && p.gold >= COST.pacify) pacify(p.id, o.name);
        else if (p.gold >= COST.resettle && p.order >= 40 && p.pop < popCapOf(p) * (p.gold > 6000 ? 0.6 : 0.4)) resettle(p.id, o.name);
        else if (p.gold >= COST.develop && (foodMonths < 8 || p.agri < 200) && p.agri < 999) develop(p.id, o.name, 'agri');
        else if (rich && foodMonths < 12) buyFood(p.id, 2000), search(p.id, o.name);
        else if (needFleet && p.gold >= COST.ships) buildShips(p.id, o.name);
        else if (p.gold >= COST.recruit && wantTroops && p.pop > 60000 && foodMonths > 6) recruitTroops(p.id, o.name);
        else if (year <= 194 && p.gold >= COST.develop && p.comm < 500) develop(p.id, o.name, 'comm');
        else if (p.gold >= COST.fortify && front && p.defense < (phase !== 'rising' ? 700 : passCity ? 600 : builder ? 550 : 450)) fortify(p.id, o.name);
        else if (p.gold >= COST.develop && p.comm < (builder ? 900 : 750)) develop(p.id, o.name, 'comm');
        else if (p.gold >= COST.develop && p.agri < 999 && (p.troops > p.agri * 40 || builder)) develop(p.id, o.name, 'agri');
        else if (p.gold >= 900 && sitesOf(p).some((x) => x.damaged)) repairSite(p.id, o.name, sitesOf(p).findIndex((x) => x.damaged));
        else if (p.gold >= (front ? 2500 : 1500) && availableSites(p.id).some((x) => x.ok && x.cost <= p.gold - 600)) buildSite(p.id, o.name, availableSites(p.id).find((x) => x.ok && x.cost <= p.gold - 600).type);
        else if (rich && p.gold >= COST.fortify && p.defense < 700) fortify(p.id, o.name);
        else if (rich && hasShipyard(p) && p.fleet < 90 && p.gold >= COST.ships) buildShips(p.id, o.name);
        else if (p.training < 85) train(p.id, o.name);
        else search(p.id, o.name);
      }
      // gifts from the hoard to a stronger, unfriendly neighbour
      if (p.gold > 6000) { const strong = neighbors(p.id).filter((n) => n.owner && n.owner !== fid && totalTroops(n.owner) > totalTroops(fid) && relation(fid, n.owner) < 0)[0]; if (strong) sendGift(fid, strong.owner, p.id, 400); }
    }
  }

  // ---------- persistence ----------
  const slotKey = (slot) => (slot ? `rotk_save_${slot}` : 'rotk_save');
  function save(slot) { localStorage.setItem(slotKey(slot), JSON.stringify(S)); return true; }
  function slotInfo(slot) { try { const raw = localStorage.getItem(slotKey(slot)); if (!raw) return null; const j = JSON.parse(raw); const F = j.factions && j.player ? j.factions[j.player] : null; return { label: `${F ? F.name : 'Observer'} — Year ${j.year}, Month ${j.month}`, scenario: j.scenario }; } catch (e) { return null; } }
  function load(slot) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // saves from an older map (different city set) cannot be loaded
    if (!parsed.provinces || Object.keys(parsed.provinces).length !== PROVINCES.length || PROVINCES.some((p) => !parsed.provinces[p.id])) return false;
    S = parsed;
    // older saves: backfill fields added later
    S.diplomacy = S.diplomacy || {}; S.pendingProposals = S.pendingProposals || []; S.pendingSuccession = S.pendingSuccession || null; S.favors = S.favors || {}; S.pendingAid = S.pendingAid || []; S.battles = S.battles || {};
    S.options = S.options || { historicalDeaths: true };
    S.adj = buildAdj();
    for (const f of Object.values(S.factions)) { const d = FACTIONS.find((x) => x.id === f.id); if (f.raider == null) f.raider = !!(d && d.raider); if (f.wanderer == null) f.wanderer = !!(d && d.wanderer); if (f.prestige == null) f.prestige = 0; if (f.guest == null) { f.guest = false; f.host = null; f.guestSince = 0; } if (f.hasEmperor == null) f.hasEmperor = false; if (f.favor == null) f.favor = f.guest ? 50 : 0; if (!f.household) f.household = { troops: 0, gold: 0 }; if (f.petitionUntil == null) f.petitionUntil = 0; const dd = FACTIONS.find((x) => x.id === f.id); if (!f.persona) f.persona = (dd && dd.persona) || []; if (f.treachery == null) f.treachery = 0; if (f.lastLoss == null) f.lastLoss = -99; if (f.lastAttackTurn == null) f.lastAttackTurn = -99; if (f.caution == null) f.caution = 1; if (!f.phase) f.phase = 'rising'; if (!f.attackedBy) f.attackedBy = {}; if (!f.gains) f.gains = []; }
    if (!S.items) { S.items = {}; for (const it of ITEMS) S.items[it.id] = { id: it.id, owner: null, city: it.city || null }; }
    S.arrived = S.arrived || {}; S.history = S.history || []; S.stats = S.stats || { battles: 0, captures: 0, deaths: 0 };
    snapshotMonth();
    S.eventsFired = S.eventsFired || {}; S.objectivesDone = S.objectivesDone || {}; S.pendingDecisions = S.pendingDecisions || []; S.battles = S.battles || {};
    for (const p of Object.values(S.provinces)) { const d = provData(p.id); p.traits = d.traits || []; if (p.fleet == null) p.fleet = 0; if (p.order == null) p.order = p.owner ? 70 : 45; if (!p.posture) p.posture = 'hold'; if (!p.sites) p.sites = []; }
    for (const o of allOfficers()) { if (!o.skills) o.skills = OFFICER_SKILLS[o.name] || []; if (o.rank == null) o.rank = 0; }
    for (const f of Object.values(S.factions)) if (f.title == null) f.title = 0;
    if (S.pendingTitle === undefined) S.pendingTitle = null; if (!S.options.difficulty) S.options.difficulty = 'normal';
    for (const o of allOfficers()) if (o.born == null) { const row = OFFICERS.find((r) => r[0] === o.name); o.born = row ? row[9] : S.year - 35; }
    return true;
  }
  function hasSave(slot) { return !!localStorage.getItem(slotKey(slot)); }

  return {
    newGame, state, prov, off, fac, pname, fname, dateStr, season, fmt,
    officersIn, freeOfficersIn, idleOfficers, captivesIn, factionOfficers, factionProvinces, rulerOf, isRuler, neighbors, enemyNeighbors, totalTroops,
    develop, fortify, train, recruitTroops, search, recruitOfficer, recruitChance, reward, buyFood, transfer, attack,
    resolveCaptive, captiveChance, endTurn, aiTurn, save, load, hasSave, COST, log,
    relation, relationWord, treatyStatus, canAttack, allies, bordering, acceptChance, proposeTreaty, respondProposal, sendGift, breakTreaty, requestJointAttack, DIP_COST, CEASEFIRE_MONTHS, ALLIANCE_MONTHS,
    age, heirCandidates, chooseHeir,
    roadInfo, roadType, battleModifiers, buildShips, hasShipyard, hasTrait,
    decide, objectiveStatus, destinyTargets,
    itemsOf, hiddenItemsIn, itemData, bestow, ITEMS, governorOf, leaderHouse, houseItems, giftItem, itemValue,
    SCENARIOS, undoMonth, canUndo, slotInfo, BIOS, CITY_NOTES, detectPhase,
    pacify, resettle, setPosture, battleFor, playerBattles, playerSideOf, battleRequests, battleMessengers, reinforceBattle, battleBeginDay, battleEndDay, battleAutoMonth, battleMove, battleAttack, battleRam, battleWithdraw, tacticalOn, battleAnswerChallenge, battleSuborn, battleSubornTargets, battleGold, favorsOwed, declineAid, ransomPrice, availableSites, buildSite, repairSite, battleSack, siteName, buildCost, appoint, assumeTitle, eligibleTitle, titleOf, plot, plotTargets, hasSkill, bondGroup, bonded, areEnemies, areRivals, bondedRuler, RANKS, RANK_COST, TITLES, SKILL_INFO,
    hostSeat, exileServe, exilePetition, petitionChance, exileRecruit, exileRaise, exileFight, exileSeekPatron, exileTargets, exileSeize,
    getOption: (k) => !!(S && S.options && S.options[k]),
    setOption: (k, v) => { if (S) { S.options = S.options || {}; S.options[k] = !!v; log(`${k === 'historicalDeaths' ? 'Scripted historical deaths' : k} ${v ? 'enabled' : 'disabled'}.`, 'sys'); } },
    HISTORICAL_DEATHS,
  };
})();
