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
    '~': { name: 'Sea',      move: null, def: 0,     los: false, charge: false, note: 'Impassable; ships only.' },
    'l': { name: 'Lake',     move: null, def: 0,     los: false, charge: false, note: 'Impassable.' },
    'r': { name: 'River',    move: null, def: 0,     los: false, charge: false, note: 'Crossed only at bridges and fords; a unit attacked while crossing fights at half strength.' },
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
  function deployDefender(map, units) {
    const at = (c, r) => map.terrain[r * map.w + c]; const spots = []; const prio = { G: 0, W: 1, C: 2 };
    for (let r = 0; r < map.h; r++) for (let c = 0; c < map.w; c++) { const t = at(c, r); if (t in prio) spots.push({ c, r, p: prio[t], d: hexDist(c, r, 6, 5) }); }
    spots.sort((a, b) => a.p - b.p || a.d - b.d);
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

  return { MAX_UNITS, BASE_UNIT, unitSize, splitArmy, describeSplit, attachOfficers, TERRAIN, standable, hexDist, neighbours, deployDefender, deployAttacker };
})();
