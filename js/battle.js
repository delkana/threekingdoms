// ============================================================
//  Tactical battle rules (in progress). Shared by the battle-map viewer
//  and, later, the battle engine itself.
// ============================================================

const BATTLE = (() => {
  // How an army deploys on the hex map. Units are 5,000 strong; a remainder fills a smaller unit at the end.
  // If that would put more than 20 units on the field, the unit size rises to 6,000, then 7,000, and so on
  // until the army fits in 20 units. An army smaller than a unit is one unit.
  const MAX_UNITS = 20, BASE_UNIT = 5000, STEP = 1000;
  function unitSize(troops) {
    let size = BASE_UNIT;
    while (Math.ceil(troops / size) > MAX_UNITS) size += STEP;
    return size;
  }
  function splitArmy(troops) {
    troops = Math.max(0, Math.floor(troops));
    if (!troops) return [];
    const size = unitSize(troops);
    const full = Math.floor(troops / size), rem = troops - full * size;
    const units = new Array(full).fill(size);
    if (rem > 0) units.push(rem);
    return units;
  }
  const describeSplit = (units) => {
    if (!units.length) return 'no troops';
    const groups = []; for (const u of units) { const g = groups.find((x) => x.size === u); if (g) g.n++; else groups.push({ size: u, n: 1 }); }
    return `${units.length} unit${units.length === 1 ? '' : 's'}: ${groups.map((g) => `${g.n} × ${g.size.toLocaleString()}`).join(' and ')}`;
  };

  // Officers ride with the largest friendly units: the best commander (LDR + WAR) takes the largest unit, the next
  // the next largest, and so on. With more officers than units the surplus double up, again from the largest down.
  function attachOfficers(units, officers) {
    const order = units.map((troops, i) => ({ i, troops })).sort((a, b) => b.troops - a.troops || a.i - b.i);
    const offs = [...officers].sort((a, b) => (b.ldr + b.war) - (a.ldr + a.war));
    const out = units.map((troops) => ({ troops, officers: [] }));
    offs.forEach((o, k) => { if (order.length) out[order[k % order.length].i].officers.push(o.name); });
    return out;
  }

  // Terrain rules for the hex maps: movement points to enter, defence modifier, blocks line of sight, cavalry may charge through.
  const TERRAIN = {
    '~': { name: 'Sea',      move: null, def: -0.50, los: false, charge: false, note: 'Ships sail it; foot and horse may swim across only with a full day’s movement, and men in the water fight at half strength and are easy prey.' },
    'l': { name: 'Lake',     move: null, def: -0.50, los: false, charge: false, note: 'Ships sail it; foot and horse may swim across only with a full day’s movement, and men in the water fight at half strength and are easy prey.' },
    'r': { name: 'River',    move: null, def: -0.50, los: false, charge: false, note: 'Ships sail it; foot and horse may ford it only with a full day’s movement, fighting at half strength and easy prey while in the water.' },
    's': { name: 'Stream',   move: 2,    def: -0.10, los: false, charge: false, note: 'Fordable everywhere but slow; no charge across it.' },
    'm': { name: 'Mountain', move: null, def: 0,     los: true,  charge: false, note: 'Impassable except along a road (3 points, no charge).' },
    'h': { name: 'Hills',    move: 2,    def: 0.25,  los: true,  charge: false, note: 'Higher ground: archers on hills shoot one hex further.' },
    'f': { name: 'Forest',   move: 2,    def: 0.15,  los: true,  charge: false, note: 'Hides units from view until adjacent; fire stratagems burn it.' },
    'w': { name: 'Marsh',    move: 3,    def: -0.20, los: false, charge: false, note: 'Units bog down; a flood stratagem drowns those caught here.' },
    'a': { name: 'Farmland', move: 1,    def: 0,     los: false, charge: true,  note: 'Open ground; burning it costs the city food.' },
    'p': { name: 'Plain',    move: 1,    def: 0,     los: false, charge: true,  note: 'Open ground.' },
    'C': { name: 'City',     move: 1,    def: 0.40,  los: true,  charge: false, note: 'Inside the walls; the last stand. Taking the centre wins the battle.' },
    'W': { name: 'Wall',     move: null, def: 0.60,  los: true,  charge: false, note: 'Only entered by breaching (siege engines) or after a gate falls; defenders on walls shoot two hexes.' },
    'G': { name: 'Gate',     move: 2,    def: 0.50,  los: true,  charge: false, note: 'The way in. Storming a gate costs the attacker double; a rammed gate falls after three assaults.' },
  };
  // a hex a unit may stand on (roads make mountains and water crossable)
  const standable = (t, road) => TERRAIN[t] && (TERRAIN[t].move !== null || (road && t !== '~' && t !== 'l'));

  // ---- hex helpers (odd-r, pointy-top; row 0 north) ----
  const oddr2cube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
  const hexDist = (c1, r1, c2, r2) => { const a = oddr2cube(c1, r1), b = oddr2cube(c2, r2); return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); };
  const neighbours = (c, r, w, h) => (r & 1 ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]).map(([dc, dr]) => [c + dc, r + dr]).filter(([cc, rr]) => cc >= 0 && cc < w && rr >= 0 && rr < h);

  // Defenders hold the gates first, then the walls, then the city itself, then the ground just outside.
  function deployDefender(map, units, exit = null) {
    const at = (c, r) => map.terrain[r * map.w + c]; const spots = []; const prio = { G: 0, W: 1, C: 2 };
    for (let r = 0; r < map.h; r++) for (let c = 0; c < map.w; c++) { const t = at(c, r); if (t in prio) spots.push({ c, r, p: prio[t], d: hexDist(c, r, 6, 5), e: exit ? hexDist(c, r, exit.c, exit.r) : 0 }); }
    spots.sort((a, b) => a.p - b.p || a.e - b.e || a.d - b.d);
    const out = []; const used = new Set();
    for (const s of spots) { if (out.length >= units.length) break; out.push({ c: s.c, r: s.r, troops: units[out.length] }); used.add(`${s.c},${s.r}`); }
    // overflow spills outside the walls, nearest first, on standable ground
    if (out.length < units.length) {
      const ring = []; for (let r = 0; r < map.h; r++) for (let c = 0; c < map.w; c++) { const t = at(c, r); if (!(t in prio) && standable(t, map.roads[r * map.w + c] === '1')) ring.push({ c, r, d: hexDist(c, r, 6, 5) }); }
      ring.sort((a, b) => a.d - b.d);
      for (const s of ring) { if (out.length >= units.length) break; out.push({ c: s.c, r: s.r, troops: units[out.length] }); }
    }
    return out;
  }
  // Attackers deploy around the exit their road leaves by: the exit hex first, then outward from it along
  // standable ground, staying at least three hexes from the walls.
  // navigable water: sea, lakes and the great rivers (streams are too shallow for warships)
  const NAV = '~lr';
  const navigable = (t) => NAV.includes(t);
  // ships take the water hexes nearest to `near` (the attacker's exit, or the city for its own fleet)
  function deployNaval(map, near, units, taken = new Set()) {
    const water = [];
    for (let r = 0; r < map.h; r++) for (let c = 0; c < map.w; c++) if (navigable(map.terrain[r * map.w + c]) && !taken.has(`${c},${r}`)) water.push([c, r]);
    water.sort((a, b) => hexDist(a[0], a[1], near.c, near.r) - hexDist(b[0], b[1], near.c, near.r));
    return water.slice(0, units.length).map(([c, r], i) => ({ c, r, troops: units[i] }));
  }
  const navalHexes = (map) => { let n = 0; for (const t of map.terrain) if (navigable(t)) n++; return n; };
  // how many men a city's fleet can carry: the fleet rating is a 0-100 measure of its warships
  const fleetCapacity = (fleet) => Math.floor((fleet || 0) * 250);
  function deployAttacker(map, exit, units) {
    const at = (c, r) => map.terrain[r * map.w + c];
    const seen = new Set([`${exit.c},${exit.r}`]); const queue = [[exit.c, exit.r]]; const order = [];
    while (queue.length && order.length < units.length) {
      const [c, r] = queue.shift();
      if (standable(at(c, r), map.roads[r * map.w + c] === '1') && hexDist(c, r, 6, 5) >= 3 && !'CWG'.includes(at(c, r))) order.push([c, r]);
      for (const [nc, nr] of neighbours(c, r, map.w, map.h)) { const k = `${nc},${nr}`; if (!seen.has(k)) { seen.add(k); queue.push([nc, nr]); } }
    }
    return order.map(([c, r], i) => ({ c, r, troops: units[i] }));
  }


  // ============================================================
  //  The battle engine. A battle is a plain state object (kept in the
  //  strategic state so it saves and loads) and is advanced one day at a
  //  time. Each day the attacker's units act, then the defender's; then
  //  food is eaten, reinforcements arrive and victory is checked.
  //  Units: { id, side 'A'|'D', fid, troops, max, training, war, ldr, int, officers:[names], morale, c, r, mp, acted, from }
  // ============================================================
  const MP_PER_DAY = 3, FOOD_PER_MAN_DAY = 0.1 / 30, VOLLEY_RANGE = 2, GATE_HITS = 3;
  const key = (c, r) => `${c},${r}`;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));

  function terrainAt(B, c, r) { const m = HEXMAPS[B.city]; return c >= 0 && c < m.w && r >= 0 && r < m.h ? m.terrain[r * m.w + c] : null; }
  const roadAt = (B, c, r) => { const m = HEXMAPS[B.city]; return HEXMAPS[B.city].roads[r * m.w + c] === '1'; };
  const unitAt = (B, c, r) => B.units.find((u) => u.c === c && u.r === r);
  const gateOpen = (B, c, r) => (B.gates[key(c, r)] || 0) >= GATE_HITS;
  const anyGateOpen = (B) => Object.values(B.gates).some((h) => h >= GATE_HITS);
  const insideWalls = (t) => 'CWG'.includes(t);

  // movement cost to enter a hex for a unit of `side`; null = cannot
  function enterCost(B, u, c, r) {
    const t = terrainAt(B, c, r); if (t === null) return null;
    const road = roadAt(B, c, r); const rule = TERRAIN[t];
    if (unitAt(B, c, r)) return null;   // occupied
    if (u.naval) {   // ships: one point per water hex; a landing on a free shore hex outside the walls ends the day's movement
      if (navigable(t)) return 1;
      if (insideWalls(t) || !standable(t, road)) return null;
      return u.mp;   // the whole remaining movement, so a landing is always the last step
    }
    if (navigable(t) && !road) return u.mp === MP_PER_DAY ? MP_PER_DAY : null;   // fording or swimming takes the whole day
    if (t === 'W') { if (u.side === 'D') return 1; return anyGateOpen(B) ? 2 : null; }
    if (t === 'C') { if (u.side === 'D') return 1; return anyGateOpen(B) ? 1 : null; }
    if (t === 'G') { if (u.side === 'D') return 1; return gateOpen(B, c, r) ? 2 : null; }   // a barred gate must be rammed open first
    if (rule.move === null) return road ? (t === 'm' ? 3 : 2) : null;
    return road && rule.move > 1 ? 1 : rule.move;
  }
  // Dijkstra from the unit's hex: returns { key: { cost, prev } } for all hexes reachable at any cost
  function reach(B, u, maxCost = Infinity) {
    const m = HEXMAPS[B.city]; const dist = { [key(u.c, u.r)]: { cost: 0, prev: null, c: u.c, r: u.r } };
    const open = [[0, u.c, u.r]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [cost, c, r] = open.shift();
      if (cost > (dist[key(c, r)] || { cost: 1e9 }).cost) continue;
      if (u.naval && cost > 0 && !navigable(terrainAt(B, c, r))) continue;   // a landed ship's men go no further today
      for (const [nc, nr] of neighbours(c, r, m.w, m.h)) {
        const step = enterCost(B, u, nc, nr); if (step === null) continue;
        const nc2 = cost + step; if (nc2 > maxCost) continue;
        const k = key(nc, nr); if (!dist[k] || nc2 < dist[k].cost) { dist[k] = { cost: nc2, prev: key(c, r), c: nc, r: nr }; open.push([nc2, nc, nr]); }
      }
    }
    return dist;
  }
  const canReach = (B, u) => Object.values(reach(B, u, u.mp)).filter((d) => d.cost > 0);

  function bestStat(u, offs, k, fallback) { return offs.length ? Math.max(...offs.map((o) => o[k])) : fallback; }
  function strength(B, u, ctx) {
    const offs = u.officers.map((n) => ctx.officer(n)).filter((o) => o && !(B.wounded && B.wounded[o.name]));
    const war = bestStat(u, offs, 'war', 40), ldr = bestStat(u, offs, 'ldr', 40);
    return u.troops * (0.5 + war / 100) * (0.7 + ldr / 250) * (0.7 + u.training / 300) * (0.6 + 0.4 * u.morale / 100) * (u.naval ? 0.7 + (u.fleet || 0) / 200 : 1);
  }
  function defenceBonus(B, u) {
    const t = terrainAt(B, u.c, u.r); let b = u.naval ? 0.15 : TERRAIN[t].def;   // water's -0.50 applies to men in it, never to ships
    if (t === 'G' && gateOpen(B, u.c, u.r)) b = 0;   // a broken gate shelters no one
    if (u.side === 'D' && 'WG'.includes(t)) b += Math.min(0.4, (B.walls || 0) / 1000);   // the city's walls add to the ring
    return b;
  }
  const sideUnits = (B, side) => B.units.filter((u) => u.side === side);
  const sidePower = (B, side, ctx) => sideUnits(B, side).reduce((a, u) => a + strength(B, u, ctx), 0);
  const sideTroops = (B, side) => sideUnits(B, side).reduce((a, u) => a + u.troops, 0);
  const label = (u, ctx) => (u.officers.length ? `${u.officers[0]}'s ${u.naval ? 'ships' : 'column'}` : ctx && ctx.fname && u.fid ? `${u.naval ? 'a squadron' : 'an unled column'} of ${ctx.fname(u.fid)}` : u.side === 'A' ? (u.naval ? 'an attacking squadron' : 'an unled attacking column') : (u.naval ? 'boats of the garrison' : 'unled men of the garrison'));
  const PLACE = { G: 'at the gate', W: 'on the walls', C: 'in the city', h: 'on the hills', m: 'in the mountains', f: 'in the woods', w: 'in the marsh', a: 'in the fields', s: 'by the stream', r: 'at the river' };
  const place = (B, c, r) => PLACE[terrainAt(B, c, r)] || 'on the plain';
  function log(B, text, cls = '') { B.log.push({ day: B.day, text, cls }); if (B.log.length > 400) B.log.shift(); }

  // a unit breaks: half its men are lost, the rest go home at the end; officers escape or are taken
  function breakUnit(B, u, cause, ctx) {
    B.units = B.units.filter((x) => x.id !== u.id);
    const fled = Math.floor(u.troops * 0.5);
    B[u.side === 'A' ? 'att' : 'def'].fled += fled;
    for (const n of u.officers) {
      const r = Math.random();
      if (r < 0.04 && !(ctx && ctx.guarded && ctx.guarded(n))) { log(B, `${n} falls in the rout!`, 'bad'); if (ctx && ctx.kill) ctx.kill(n, `killed in the rout before ${ctx.pname(B.city)}`); continue; }
      if (r < 0.65) { log(B, `${n} escapes the rout.`); continue; }
      B.captives.push({ name: n, by: u.side === 'A' ? 'D' : 'A' }); log(B, `${n} is taken prisoner!`, 'bad');
    }
    for (const f of B.units) if (f.side === u.side && hexDist(f.c, f.r, u.c, u.r) <= 1) f.morale = Math.max(0, f.morale - 6);
    log(B, `${label(u, ctx)} ${cause} ${place(B, u.c, u.r)}: ${fled.toLocaleString()} men scatter.`, u.side === 'A' ? 'def' : 'att');
  }
  // one unit strikes another; the defender strikes back at reduced weight
  function fight(B, u, v, ctx, ranged = false) {
    const tu = terrainAt(B, u.c, u.r), tv = terrainAt(B, v.c, v.r);
    let pu = strength(B, u, ctx) * (!u.naval && 'rsl~'.includes(tu) ? 0.5 : 1);
    if (!u.naval && v.naval) pu *= 0.6;   // men on the bank against boats
    if (u.naval && !v.naval && !ranged) pu *= 0.85;   // marines fighting from the boats
    if (tv === 'G' && !gateOpen(B, v.c, v.r) && !ranged) pu *= 0.7;   // storming a held gate is hard
    if (ranged) pu *= 0.35;
    const pv = strength(B, v, ctx) * (1 + defenceBonus(B, v));
    const lossV = Math.round(v.troops * Math.min(0.35, 0.12 * Math.pow(pu / Math.max(1, pv), 1.0) * rnd(0.8, 1.2)));
    const lossU = ranged ? 0 : Math.round(u.troops * Math.min(0.25, 0.075 * Math.pow(pv / Math.max(1, pu), 0.8) * rnd(0.8, 1.2)));
    v.troops -= lossV; u.troops -= lossU; B.lastBlood = B.day;
    if (!ranged && tv === 'G' && !gateOpen(B, v.c, v.r)) { B.gates[key(v.c, v.r)] = (B.gates[key(v.c, v.r)] || 0) + 1; if (gateOpen(B, v.c, v.r)) log(B, `The gate at ${key(v.c, v.r)} is broken open!`, 'att'); }
    const rv = lossV / Math.max(1, v.troops + lossV), ru = lossU / Math.max(1, u.troops + lossU);
    if (rv > ru * 1.3) { v.morale = Math.max(0, v.morale - 12); u.morale = Math.min(100, u.morale + 3); } else if (!ranged && ru > rv * 1.3) { u.morale = Math.max(0, u.morale - 8); v.morale = Math.min(100, v.morale + 3); }
    u.acted = true;
    log(B, `${label(u, ctx)} ${ranged ? 'looses arrows at' : 'attacks'} ${label(v, ctx)} ${place(B, v.c, v.r)}: ${lossV.toLocaleString()} fall${lossU ? `, ${lossU.toLocaleString()} of the attackers` : ''}.`, u.side === 'A' ? 'att' : 'def');
    if (v.troops <= v.max * 0.12 || v.morale < 15) breakUnit(B, v, v.troops <= v.max * 0.12 ? 'is destroyed' : 'breaks and flees', ctx);
    if (u.troops <= u.max * 0.12 || u.morale < 15) breakUnit(B, u, u.troops <= u.max * 0.12 ? 'is destroyed' : 'breaks and flees', ctx);
  }

  // ---- single combat ----
  // the champion of a unit: its best fighter still on his feet
  const champion = (B, u, ctx) => u.officers.map((n) => ctx.officer(n)).filter((o) => o && !(B.wounded && B.wounded[o.name])).sort((a, b) => b.war - a.war)[0] || null;
  function duel(B, u, v, ctx) {
    const a = champion(B, u, ctx), d = champion(B, v, ctx); if (!a || !d) return null;
    B.wounded = B.wounded || {};
    const bonus = (o) => (ctx.duelBonus ? ctx.duelBonus(o.name) : 0);
    const pA = Math.min(0.95, Math.max(0.05, Math.pow(a.war, 3) / (Math.pow(a.war, 3) + Math.pow(d.war, 3)) + bonus(a) - bonus(d)));
    const bouts = ri(3, 60); const aWins = Math.random() < pA; const w = aWins ? a : d, l = aWins ? d : a; const wu = aWins ? u : v, lu = aWins ? v : u;
    log(B, `${a.name} rides out and crosses arms with ${d.name}! After ${bouts} bout${bouts > 1 ? 's' : ''} ${w.name} ${['unhorses', 'drives back', 'wounds', 'overcomes'][ri(0, 3)]} ${l.name}.`, 'duel');
    wu.morale = Math.min(100, wu.morale + 12); lu.morale = Math.max(0, lu.morale - 15);
    for (const f of B.units) { if (f === wu || f === lu) continue; if (f.side === wu.side && hexDist(f.c, f.r, wu.c, wu.r) <= 2) f.morale = Math.min(100, f.morale + 4); if (f.side === lu.side && hexDist(f.c, f.r, lu.c, lu.r) <= 2) f.morale = Math.max(0, f.morale - 5); }
    const r = Math.random();
    if (r < 0.10 && !(ctx.guarded && ctx.guarded(l.name))) { lu.officers = lu.officers.filter((n) => n !== l.name); log(B, `${l.name} is slain in the duel!`, 'bad'); if (ctx.kill) ctx.kill(l.name, `slain in single combat by ${w.name}`); }
    else if (r < 0.28) { lu.officers = lu.officers.filter((n) => n !== l.name); B.captives.push({ name: l.name, by: wu.side }); log(B, `${l.name} is dragged from the saddle and taken prisoner!`, 'bad'); }
    else { B.wounded[l.name] = true; log(B, `${l.name} is wounded and carried back to his lines; he fights no more in this battle.`, lu.side === 'A' ? 'def' : 'att'); }
    B.duels = (B.duels || 0) + 1; B.lastBlood = B.day;
    if (lu.morale < 15 && B.units.includes(lu)) breakUnit(B, lu, 'breaks and flees', ctx);
    return { winner: w.name, loser: l.name, aWins };
  }
  // a challenge may be issued by an unacted unit beside an enemy, once per pair per day, when both have a champion
  const canChallenge = (B, u, v, ctx) => !u.acted && u.side !== v.side && hexDist(u.c, u.r, v.c, v.r) === 1 && !!champion(B, u, ctx) && !!champion(B, v, ctx) && !(B.duelsToday && B.duelsToday[u.id + ':' + v.id]);
  // the AI takes up a challenge when its champion is nearly a match, and issues one when its champion is a match and then some
  const aiAcceptsDuel = (B, u, v, ctx) => { const a = champion(B, u, ctx), d = champion(B, v, ctx); return !!(a && d && (d.war >= a.war - 12 || Math.random() < 0.15)); };
  const wantsChallenge = (B, u, v, ctx) => { const a = champion(B, u, ctx), d = champion(B, v, ctx); return !!(a && d && a.war >= 70 && d.war >= 50 && a.war >= d.war - 5 && Math.random() < 0.15); };
  function declineDuel(B, u, v, ctx) {
    const a = champion(B, u, ctx), d = champion(B, v, ctx);
    v.morale = Math.max(0, v.morale - 6); u.morale = Math.min(100, u.morale + 4);
    log(B, `${a.name} rides out and calls for ${d.name}; ${d.name} declines, and the ${v.side === 'D' ? 'garrison' : 'besiegers'} mutter at it.`, u.side === 'A' ? 'att' : 'def');
  }
  // the challenger's side decides at once when the challenged side is the AI; a player must answer from the battle screen
  function challengeNow(B, u, v, ctx) {
    B.duelsToday = B.duelsToday || {}; B.duelsToday[u.id + ':' + v.id] = true;
    if (aiAcceptsDuel(B, u, v, ctx)) duel(B, u, v, ctx); else declineDuel(B, u, v, ctx);
  }
  function melee(B, u, v, ctx) {
    if (canChallenge(B, u, v, ctx) && wantsChallenge(B, u, v, ctx)) {
      B.duelsToday = B.duelsToday || {}; B.duelsToday[u.id + ':' + v.id] = true;
      if ((v.side === 'A' ? B.att : B.def).control === 'player') { B.pendingChallenge = { u: u.id, v: v.id }; u.acted = true; return; }
      if (aiAcceptsDuel(B, u, v, ctx)) { duel(B, u, v, ctx); if (!B.units.includes(u) || !B.units.includes(v)) return; } else declineDuel(B, u, v, ctx);
    }
    fight(B, u, v, ctx);
  }
  // the player's answer to an AI challenge; the deferred attack then goes ahead
  function answerChallenge(B, accept, ctx) {
    const pc = B.pendingChallenge; if (!pc) return false; B.pendingChallenge = null;
    const u = B.units.find((x) => x.id === pc.u), v = B.units.find((x) => x.id === pc.v); if (!u || !v) return false;
    u.acted = false;
    if (accept) { duel(B, u, v, ctx); if (!B.units.includes(u) || !B.units.includes(v)) { u.acted = true; return true; } } else declineDuel(B, u, v, ctx);
    fight(B, u, v, ctx); return true;
  }
  const autoAnswer = (B, ctx) => { const pc = B.pendingChallenge; if (!pc) return false; const u = B.units.find((x) => x.id === pc.u), v = B.units.find((x) => x.id === pc.v); return !!(u && v && aiAcceptsDuel(B, u, v, ctx)); };

  // ---- turning an enemy officer in the field ----
  // the cleverest officer on the field writes the letters; a wavering officer may cross over, and a commander brings his unit with him
  const envoyOf = (B, side, ctx) => sideUnits(B, side).flatMap((u) => u.officers.map((n) => ctx.officer(n))).filter((o) => o && !(B.wounded && B.wounded[o.name])).sort((a, b) => b.int - a.int)[0] || null;
  function subornChance(B, side, v, o, gold, ctx) {
    const envoy = envoyOf(B, side, ctx); if (!envoy) return 0;
    const losing = sidePower(B, v.side, ctx) < sidePower(B, side, ctx) * 0.8;
    let c = 0.05 + (70 - o.loyalty) / 100 + (envoy.int - 60) / 300 + gold / 4000 + (losing ? 0.15 : 0) + (v.morale < 50 ? 0.1 : 0) + (o.loyalty < 40 ? 0.1 : 0);
    if (o.loyalty >= 70) c = Math.min(c, 0.05);
    return Math.max(0, Math.min(0.8, c));
  }
  function subornTargets(B, side, ctx) {
    const enemy = side === 'A' ? 'D' : 'A'; const fid = side === 'A' ? B.attF : B.defF; const out = [];
    if (!ctx.canDefect || !envoyOf(B, side, ctx)) return out;
    for (const v of sideUnits(B, enemy)) for (const n of v.officers) { const o = ctx.officer(n); if (!o || (B.suborned && B.suborned[n]) || !ctx.canDefect(n, fid)) continue; out.push({ unit: v.id, name: n, loyalty: o.loyalty, lead: v.officers[0] === n, troops: v.troops, chance: subornChance(B, side, v, o, 0, ctx) }); }
    return out.sort((a, b) => b.chance - a.chance);
  }
  function suborn(B, side, unitId, name, gold, ctx) {
    const v = B.units.find((x) => x.id === unitId); const o = v && ctx.officer(name);
    if (!v || !o || !v.officers.includes(name) || v.side === side) return { ok: false, msg: 'No such officer on the field.' };
    B.suborned = B.suborned || {}; if (B.suborned[name]) return { ok: false, msg: `${name} has already been approached.` };
    const fid = side === 'A' ? B.attF : B.defF; if (!ctx.canDefect || !ctx.canDefect(name, fid)) return { ok: false, msg: `${name} would never turn.` };
    const envoy = envoyOf(B, side, ctx); if (!envoy) return { ok: false, msg: 'No officer of yours is on the field to write the letters.' };
    if (gold > 0 && !ctx.spendGold(side, gold)) return { ok: false, msg: 'Not enough gold.' };
    B.suborned[name] = true; const chance = subornChance(B, side, v, o, gold, ctx);
    if (Math.random() < chance) {
      const lead = v.officers[0] === name; const enemy = v.side;
      if (lead) {
        const others = v.officers.filter((n) => n !== name); v.officers = [name];
        v.side = side; v.fid = fid; v.acted = true; v.mp = 0; v.morale = Math.max(40, v.morale - 10); v.max = v.troops;
        for (const n of others) { const home = sideUnits(B, enemy)[0]; if (home) { home.officers.push(n); log(B, `${n} refuses to follow and rides to ${home.officers[0] || 'the nearest'} unit.`); } else log(B, `${n} refuses to follow and slips away.`); }
      } else { v.officers = v.officers.filter((n) => n !== name); const eu = sideUnits(B, side).find((x) => x.officers.includes(envoy.name)) || sideUnits(B, side)[0]; if (eu) eu.officers.push(name); }
      ctx.defect(name, fid);
      for (const f of sideUnits(B, enemy)) f.morale = Math.max(0, f.morale - 6);
      const msg = lead ? `${name} goes over to ${ctx.fname(fid)} with ${v.troops.toLocaleString()} men!` : `${name} slips across the lines to ${ctx.fname(fid)}!`;
      log(B, `${envoy.name}'s letters find their mark: ${msg}`, side === 'A' ? 'att' : 'def'); B.lastBlood = B.day;
      return { ok: true, turned: true, msg };
    }
    if (ctx.raiseLoyalty) ctx.raiseLoyalty(name, 5);
    log(B, `${name} spurns ${envoy.name}'s letters${gold ? ' and keeps the gold' : ''}.`, '');
    return { ok: true, turned: false, msg: `${name} spurns the offer${gold ? ' and keeps the gold' : ''}.` };
  }

  // ---- player and AI actions ----
  function moveUnit(B, u, c, r) {
    const d = reach(B, u, u.mp)[key(c, r)]; if (!d || d.cost === 0) return false;
    u.c = c; u.r = r; u.mp -= d.cost;
    if (u.naval && !navigable(terrainAt(B, c, r))) { u.naval = false; u.mp = 0; log(B, `${label(u)} lands ${place(B, c, r)}.`, u.side === 'A' ? 'att' : 'def'); }
    return true;
  }
  // an attacker beside a barred, unheld gate spends its action on the ram
  function ramGate(B, u, c, r) {
    if (u.acted || u.side !== 'A' || terrainAt(B, c, r) !== 'G' || hexDist(u.c, u.r, c, r) !== 1 || unitAt(B, c, r) || gateOpen(B, c, r)) return false;
    B.gates[key(c, r)] = (B.gates[key(c, r)] || 0) + 1; u.acted = true;
    log(B, gateOpen(B, c, r) ? `${label(u)} breaks the gate open!` : `${label(u)} sets the ram against the gate (${(B.gates[key(c, r)] || 0)} of ${GATE_HITS} blows).`, 'att');
    return true;
  }
  const rammableFor = (B, u) => { const m = HEXMAPS[B.city]; return neighbours(u.c, u.r, m.w, m.h).filter(([c, r]) => terrainAt(B, c, r) === 'G' && !unitAt(B, c, r) && !gateOpen(B, c, r)); };
  function attackUnit(B, u, v, ctx, opts = {}) {
    if (u.acted || u.side === v.side) return false;
    const dist = hexDist(u.c, u.r, v.c, v.r);
    if (dist === 1) { if (opts.duel && canChallenge(B, u, v, ctx)) { challengeNow(B, u, v, ctx); if (!B.units.includes(u) || !B.units.includes(v) || u.acted) return true; } fight(B, u, v, ctx); return true; }
    if (dist <= VOLLEY_RANGE && (u.naval || 'WGh'.includes(terrainAt(B, u.c, u.r)))) { fight(B, u, v, ctx, true); return true; }
    return false;
  }
  const targetsFor = (B, u) => B.units.filter((v) => v.side !== u.side && (hexDist(u.c, u.r, v.c, v.r) === 1 || (hexDist(u.c, u.r, v.c, v.r) <= VOLLEY_RANGE && (u.naval || 'WGh'.includes(terrainAt(B, u.c, u.r))))));

  // shortest path (ignoring the day's MP) toward any of the goal hexes; returns the first step's key or null
  function stepToward(B, u, goals) {
    const dist = reach(B, u, Infinity); let best = null;
    for (const g of goals) { const d = dist[g]; if (d && (!best || d.cost < best.cost)) best = d; }
    if (!best) return null;
    // walk back to the farthest hex on the path within this day's MP
    let cur = best, last = null;
    while (cur && cur.prev) { if (cur.cost <= u.mp) { last = cur; break; } cur = dist[cur.prev]; }
    return last ? key(last.c, last.r) : null;
  }
  // a ship's day: shoot or board what is in reach; attackers sail for the shore nearest the walls and land there, defenders hold the water
  function aiShip(B, u, side, ctx, gates, centre) {
    const m = HEXMAPS[B.city];
    const targets = targetsFor(B, u).sort((a, b) => strength(B, a, ctx) - strength(B, b, ctx));
    const adjacent = targets.filter((v) => hexDist(u.c, u.r, v.c, v.r) === 1);
    if (adjacent.length && strength(B, u, ctx) >= strength(B, adjacent[0], ctx) * (1 + defenceBonus(B, adjacent[0])) * 0.8) { melee(B, u, adjacent[0], ctx); return; }
    if (targets.length) { fight(B, u, targets[0], ctx, true); return; }
    if (side === 'D') return;   // the garrison's boats keep station
    // land where the shore is nearest the walls, once within a few hexes of it; otherwise sail on toward it
    const shore = []; for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) { const t = m.terrain[r * m.w + c]; if (!navigable(t) && !insideWalls(t) && standable(t, m.roads[r * m.w + c] === '1') && !unitAt(B, c, r) && neighbours(c, r, m.w, m.h).some(([nc, nr]) => navigable(terrainAt(B, nc, nr)))) shore.push([c, r]); }
    shore.sort((a, b) => hexDist(a[0], a[1], 6, 5) - hexDist(b[0], b[1], 6, 5));
    const best = shore[0]; if (!best) return;
    const dist = reach(B, u, Infinity); const landing = dist[key(best[0], best[1])];
    if (landing && landing.cost <= u.mp && hexDist(best[0], best[1], 6, 5) <= 4) { moveUnit(B, u, best[0], best[1]); return; }
    const step = stepToward(B, u, [key(best[0], best[1])]);
    if (step) { const [c, r] = step.split(',').map(Number); if (navigable(terrainAt(B, c, r)) || hexDist(c, r, 6, 5) <= 4) moveUnit(B, u, c, r); }
  }
  function aiSide(B, side, ctx) {
    const m = HEXMAPS[B.city]; const enemy = side === 'A' ? 'D' : 'A';
    const mine = sideUnits(B, side), foes = sideUnits(B, enemy);
    if (!mine.length || !foes.length) return;
    const ratio = sidePower(B, side, ctx) / Math.max(1, sidePower(B, enemy, ctx));
    const centre = key(6, 5);
    const gates = []; for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (m.terrain[r * m.w + c] === 'G') gates.push(key(c, r));
    const pending = B.arrivals.some((a) => a.side === side && a.day > B.day);
    const foodDays = side === 'A' ? B.att.food / Math.max(1, sideTroops(B, 'A') * FOOD_PER_MAN_DAY) : Infinity;
    for (const u of mine) {
      if (!B.units.includes(u)) continue;
      if (u.naval) { aiShip(B, u, side, ctx, gates, centre); continue; }
      // fight anything in reach that is worth fighting
      const targets = targetsFor(B, u).sort((a, b) => strength(B, a, ctx) * (1 + defenceBonus(B, a)) - strength(B, b, ctx) * (1 + defenceBonus(B, b)));
      const attackable = targets.filter((v) => hexDist(u.c, u.r, v.c, v.r) === 1);
      const worth = (v) => strength(B, u, ctx) >= strength(B, v, ctx) * (1 + defenceBonus(B, v)) * (side === 'A' ? 0.7 : 0.9);
      if (side === 'D') {
        const t = terrainAt(B, u.c, u.r);
        // an unheld gate with enemies at it: the nearest wall unit steps onto it
        if (insideWalls(t) && t !== 'G') {
          const threatened = gates.map((k) => k.split(',').map(Number)).filter(([gc, gr]) => !unitAt(B, gc, gr) && !gateOpen(B, gc, gr) && foes.some((f) => hexDist(f.c, f.r, gc, gr) <= 2)).sort((a, b) => hexDist(u.c, u.r, a[0], a[1]) - hexDist(u.c, u.r, b[0], b[1]));
          if (threatened.length && hexDist(u.c, u.r, threatened[0][0], threatened[0][1]) <= 2 && !mine.some((o) => o !== u && hexDist(o.c, o.r, threatened[0][0], threatened[0][1]) < hexDist(u.c, u.r, threatened[0][0], threatened[0][1]))) { const step = stepToward(B, u, [key(threatened[0][0], threatened[0][1])]); if (step) { const [c, r] = step.split(',').map(Number); moveUnit(B, u, c, r); } }
        }
        if (targets.length && !attackable.length) { fight(B, u, targets[0], ctx, true); continue; }   // volley from the walls
        if (attackable.length && (worth(attackable[0]) || !insideWalls(t))) { melee(B, u, attackable[0], ctx); continue; }
        if (!insideWalls(t)) { const goal = stepToward(B, u, gates.concat([centre]).filter((k) => !unitAt(B, +k.split(',')[0], +k.split(',')[1]))); if (goal) { const [c, r] = goal.split(',').map(Number); moveUnit(B, u, c, r); } }
        continue;
      }
      // attacker
      const stalled = B.day - (B.lastBlood || 0) > 14;   // a fortnight without a fight: no more waiting
      const assault = ratio >= 0.9 || foodDays < 4 || ((!pending || stalled) && ratio >= 0.6);
      if (!assault) { if (attackable.length && worth(attackable[0])) melee(B, u, attackable[0], ctx); continue; }   // wait for the reinforcements
      if (attackable.length && (worth(attackable[0]) || terrainAt(B, attackable[0].c, attackable[0].r) === 'G')) { melee(B, u, attackable[0], ctx); continue; }
      const ram = rammableFor(B, u); if (ram.length) { ramGate(B, u, ram[0][0], ram[0][1]); continue; }
      // march: through an open gate to the centre, or up to the nearest gate (a hex beside it, since barred gates cannot be entered)
      const m2 = HEXMAPS[B.city];
      const besideGates = []; for (const g of gates) { const [gc, gr] = g.split(',').map(Number); if (gateOpen(B, gc, gr)) { if (!unitAt(B, gc, gr)) besideGates.push(g); } else for (const [nc, nr] of neighbours(gc, gr, m2.w, m2.h)) if (!insideWalls(terrainAt(B, nc, nr)) && !unitAt(B, nc, nr)) besideGates.push(key(nc, nr)); }
      const goals = anyGateOpen(B) ? [centre].concat(besideGates) : besideGates;
      const step = stepToward(B, u, goals);
      if (step) { const [c, r] = step.split(',').map(Number); if (moveUnit(B, u, c, r)) { const again = targetsFor(B, u).filter((v) => hexDist(u.c, u.r, v.c, v.r) === 1); const ram2 = rammableFor(B, u); if (again.length && !u.acted && (worth(again[0]) || terrainAt(B, again[0].c, again[0].r) === 'G')) melee(B, u, again[0], ctx); else if (ram2.length && !u.acted) ramGate(B, u, ram2[0][0], ram2[0][1]); } }
      else if (attackable.length) melee(B, u, attackable[0], ctx);
    }
    // letters to a wavering enemy officer, now and then, with gold if there is gold to spare
    if (ctx.canDefect && ctx.gold && Math.random() < 0.15) { const ts = subornTargets(B, side, ctx); const g = Math.min(ctx.gold(side), 800); if (ts.length && g >= 200 && ts[0].chance + g / 4000 >= 0.3) suborn(B, side, ts[0].unit, ts[0].name, g, ctx); }
    // the attacker gives up when the fight is hopeless
    const stalledOut = B.day - (B.lastBlood || 0) > 14 && ratio < 0.6;
    if (side === 'A' && (((!pending || stalledOut) && ((sideTroops(B, 'A') < B.att.start * 0.3 && ratio < 1) || (foodDays < 1 && ratio < 1) || ratio < 0.35 || stalledOut)) || B.day >= 120)) { if (B.day >= 120) log(B, 'Four months before the walls: the siege is abandoned.', 'def'); withdraw(B, 'A', ctx); }
  }

  function withdraw(B, side, ctx) {
    if (B.over) return;
    if (side === 'A') { B.att.fled += sideTroops(B, 'A'); B.units = B.units.filter((u) => u.side !== 'A'); B.over = { result: 'withdrawn' }; log(B, `${ctx.fname(B.att.fid)} breaks off the siege and withdraws.`, 'def'); }
    else { B.def.fled += sideTroops(B, 'D'); B.units = B.units.filter((u) => u.side !== 'D'); B.over = { result: 'captured' }; log(B, `The garrison abandons the city and slips away.`, 'att'); }
  }

  // ---- the day ----
  function deployArrival(B, a, ctx) {
    const m = HEXMAPS[B.city];
    const exit = a.exit || (a.side === 'A' ? B.att.exit : B.def.exit) || m.exits[0];
    const afloat = shipShare(a.troops, a.fleet, exit && (exit.type === 'river' || exit.type === 'sea'), m);
    const all = attachOfficers(splitArmy(a.troops - afloat).concat(splitArmy(afloat)), a.officers.map((n) => ctx.officer(n)).filter(Boolean));
    const nLand = splitArmy(a.troops - afloat).length; const units = all.slice(0, nLand), ships = all.slice(nLand);
    for (const [i, pos] of deployNaval(m, exit, ships.map((u) => u.troops), new Set(B.units.map((x) => key(x.c, x.r)))).entries()) B.units.push(makeUnit(B, a.side, a.fid, ships[i].troops, a.training || 50, ships[i].officers, pos.c, pos.r, a.from, ctx, true, a.fleet));
    const spots = deployAttacker(m, exit, units.map((u) => u.troops)).filter((s) => !unitAt(B, s.c, s.r));
    // fall back to any free standable hex near the exit
    let i = 0;
    for (const u of units) {
      let s = spots[i++];
      if (!s) { const free = []; for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (!unitAt(B, c, r) && standable(m.terrain[r * m.w + c], m.roads[r * m.w + c] === '1') && !insideWalls(m.terrain[r * m.w + c])) free.push({ c, r, d: hexDist(c, r, exit.c, exit.r) }); free.sort((x, y) => x.d - y.d); s = free[0]; }
      if (!s) break;
      B.units.push(makeUnit(B, a.side, a.fid, u.troops, a.training || 50, u.officers, s.c, s.r, a.from, ctx));
    }
    if (a.side === 'A') B.att.food += a.food || 0; else ctx.cityFood(a.food || 0);
    if (a.side === 'A') B.att.start += a.troops;
    log(B, `${ctx.fname(a.fid)} reinforces the ${a.side === 'A' ? 'besiegers' : 'garrison'} with ${a.troops.toLocaleString()} men${a.officers.length ? ` under ${a.officers.join(', ')}` : ''}${a.food ? ` and ${a.food.toLocaleString()} food` : ''}.`, a.side === 'A' ? 'att' : 'def');
  }
  function makeUnit(B, side, fid, troops, training, officers, c, r, from, ctx, naval = false, fleet = 0) {
    const offs = officers.map((n) => ctx.officer(n)).filter(Boolean);
    return { id: ++B.nextId, side, fid, troops, max: troops, training, officers, morale: Math.min(100, 70 + Math.round(bestStat(null, offs, 'ldr', 40) / 4)), c, r, mp: MP_PER_DAY, acted: false, from, naval, fleet };
  }
  // split an army between ships and the shore: a water road puts most of it afloat, a land road a third, as far as the fleet can carry
  function shipShare(troops, fleet, byWater, map) {
    if (!fleet || navalHexes(map) < 3) return 0;
    return Math.min(Math.floor(troops * (byWater ? 0.6 : 0.3)), fleetCapacity(fleet));
  }
  function checkOver(B, ctx) {
    if (B.over) return;
    const A = sideUnits(B, 'A'), D = sideUnits(B, 'D');
    if (!A.length) { B.over = { result: 'annihilated' }; log(B, `The besieging army is destroyed.`, 'def'); return; }
    if (!D.length) { B.over = { result: 'captured' }; log(B, `The last defenders fall. ${ctx.pname(B.city)} is taken!`, 'att'); return; }
    const dInside = D.filter((u) => insideWalls(terrainAt(B, u.c, u.r)));
    const centreHeld = A.some((u) => u.c === 6 && u.r === 5) && (!dInside.length || sideTroops(B, 'D') < sideTroops(B, 'A') * 0.3);
    if (centreHeld) { B.over = { result: 'captured' }; log(B, `The attackers hold the heart of ${ctx.pname(B.city)}. The city has fallen!`, 'att'); }
  }
  function beginDay(B) { B.day++; B.dayInMonth++; B.duelsToday = {}; for (const u of B.units) { u.mp = MP_PER_DAY; u.acted = false; } }
  function endDay(B, ctx) {
    // food
    const eatA = Math.ceil(sideTroops(B, 'A') * FOOD_PER_MAN_DAY), eatD = Math.ceil(sideTroops(B, 'D') * FOOD_PER_MAN_DAY);
    B.att.food -= eatA; const starvedD = !ctx.cityFood(-eatD);
    if (B.att.food < 0) { B.att.food = 0; for (const u of sideUnits(B, 'A')) { u.morale = Math.max(0, u.morale - 6); u.troops -= Math.floor(u.troops * 0.02); } if (B.day % 3 === 0) log(B, 'The besiegers are out of grain; men desert by night.', 'def'); }
    if (starvedD) { for (const u of sideUnits(B, 'D')) { u.morale = Math.max(0, u.morale - 6); u.troops -= Math.floor(u.troops * 0.02); } if (B.day % 3 === 0) log(B, 'The granaries of the city are empty; the garrison starves.', 'att'); }
    for (const u of [...B.units]) if (u.troops <= u.max * 0.12 || u.morale < 15) breakUnit(B, u, 'melts away', ctx);
    // a night's rest steadies every unit, idle ones most
    for (const u of B.units) u.morale = Math.min(100, u.morale + (u.acted ? 2 : 4));
    // arrivals
    for (const a of B.arrivals.filter((x) => x.day <= B.day && !x.done)) { a.done = true; deployArrival(B, a, ctx); }
    B.arrivals = B.arrivals.filter((x) => !x.done);
    checkOver(B, ctx);
    ctx.syncCity(B);
    if (B.replay) B.replay.push({ day: B.day, units: B.units.map((u) => ({ id: u.id, side: u.side, fid: u.fid, troops: u.troops, officers: u.officers.slice(0, 1), c: u.c, r: u.r })), gates: { ...B.gates }, log: B.log.filter((l) => l.day === B.day).map((l) => l.text) });
  }
  // a whole day with both sides played by the AI (or one side by the AI when the other has already acted)
  function runDay(B, ctx, playerSide = null) {
    if (B.over) return;
    beginDay(B);
    if (playerSide !== 'A') aiSide(B, 'A', ctx);
    if (!B.over) checkOver(B, ctx);
    if (!B.over && playerSide !== 'D') aiSide(B, 'D', ctx);
    endDay(B, ctx);
  }

  // ---- creation ----
  function create({ city, attF, defF, fromCity, troops, food, officers, training, walls, exit, cityTroops, cityOfficers, cityTraining, control, ctx, record, fleet = 0, cityFleet = 0 }) {
    const m = HEXMAPS[city];
    const B = { city, attF, defF, day: 0, dayInMonth: 0, startedTurn: ctx.turn(), nextId: 0, units: [], arrivals: [], gates: {}, captives: [], log: [], over: null, walls,
      att: { fid: attF, from: fromCity, food, start: troops, fled: 0, exit, control: control.A, asked: false, fleet },
      def: { fid: defF, fled: 0, exit: null, control: control.D, asked: false, fleet: cityFleet }, replay: record ? [] : null };
    // the attacker: part of the army aboard ship when it has a fleet and there is water to sail
    const afloat = shipShare(troops, fleet, exit && (exit.type === 'river' || exit.type === 'sea'), m);
    const aAll = attachOfficers(splitArmy(troops - afloat).concat(splitArmy(afloat)), officers.map((n) => ctx.officer(n)).filter(Boolean));
    const nLand = splitArmy(troops - afloat).length; const aLand = aAll.slice(0, nLand), aShips = aAll.slice(nLand);
    for (const [i, pos] of deployAttacker(m, exit, aLand.map((u) => u.troops)).entries()) B.units.push(makeUnit(B, 'A', attF, aLand[i].troops, training, aLand[i].officers, pos.c, pos.r, fromCity, ctx));
    const takenA = new Set(B.units.map((u) => key(u.c, u.r)));
    for (const [i, pos] of deployNaval(m, exit || { c: 6, r: 0 }, aShips.map((u) => u.troops), takenA).entries()) B.units.push(makeUnit(B, 'A', attF, aShips[i].troops, training, aShips[i].officers, pos.c, pos.r, fromCity, ctx, true, fleet));
    // the garrison: a quarter of it mans the city's own boats when the water runs close by
    const nearWater = (() => { let n = 0; for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (navigable(m.terrain[r * m.w + c]) && hexDist(c, r, 6, 5) <= 3) n++; return n; })();
    const dAfloat = cityFleet && nearWater >= 2 ? Math.min(Math.floor(cityTroops * 0.25), fleetCapacity(cityFleet), nearWater * 5000) : 0;
    const dAll = attachOfficers(splitArmy(cityTroops - dAfloat).concat(splitArmy(dAfloat)), cityOfficers.map((n) => ctx.officer(n)).filter(Boolean));
    const nD = splitArmy(cityTroops - dAfloat).length; const dLand = dAll.slice(0, nD), dShips = dAll.slice(nD);
    for (const [i, pos] of deployDefender(m, dLand.map((u) => u.troops), exit).entries()) B.units.push(makeUnit(B, 'D', defF, dLand[i].troops, cityTraining, dLand[i].officers, pos.c, pos.r, city, ctx));
    const takenD = new Set(B.units.map((u) => key(u.c, u.r)));
    for (const [i, pos] of deployNaval(m, { c: 6, r: 5 }, dShips.map((u) => u.troops), takenD).entries()) B.units.push(makeUnit(B, 'D', defF, dShips[i].troops, cityTraining, dShips[i].officers, pos.c, pos.r, city, ctx, true, cityFleet));
    log(B, `${ctx.fname(attF)} marches on ${ctx.pname(city)} with ${troops.toLocaleString()} men in ${aAll.length} units${afloat ? `, ${afloat.toLocaleString()} of them aboard ship` : ''}; ${defF ? ctx.fname(defF) : 'the town'} holds it with ${cityTroops.toLocaleString()}${dAfloat ? `, ${dAfloat.toLocaleString()} of them on the water` : ''}.`);
    return B;
  }
  function addArrival(B, { side, fid, from, troops, food, officers, training, days, exit, fleet }) {
    B.arrivals.push({ side, fid, from, troops, food: food || 0, officers: officers || [], training: training || 50, day: B.day + days, exit: exit || null, done: false, fleet: fleet || 0 });
  }

  return { MAX_UNITS, BASE_UNIT, MP_PER_DAY, FOOD_PER_MAN_DAY, GATE_HITS, unitSize, splitArmy, describeSplit, attachOfficers, TERRAIN, standable, navigable, fleetCapacity, shipShare, hexDist, neighbours, deployDefender, deployAttacker, deployNaval,
    create, addArrival, runDay, beginDay, endDay, aiSide, moveUnit, attackUnit, duel, champion, canChallenge, aiAcceptsDuel, answerChallenge, autoAnswer, melee, subornTargets, subornChance, suborn, ramGate, rammableFor, targetsFor, reach, canReach, withdraw, strength, defenceBonus, sideTroops, sideUnits, sidePower, terrainAt, enterCost, checkOver, anyGateOpen, gateOpen, log };
})();
