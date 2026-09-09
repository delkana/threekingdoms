// Build js/geo.js from Natural Earth (public domain) coastline, river and lake data.
//
//   node tools/buildmap.js [dataDir]
//
// Needs three GeoJSON files in dataDir (default: tools/naturalearth). Missing files are downloaded from
// https://github.com/martynafford/natural-earth-geojson (Natural Earth vectors converted to GeoJSON):
//   50m/physical/ne_50m_land.json, 10m/physical/ne_10m_rivers_lake_centerlines.json, 10m/physical/ne_10m_lakes.json
// The features are clipped to the game's window on China, projected with the same projection as js/data.js
// (MAP), simplified, and written as compact polylines/polygons in canvas coordinates.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// keep in step with MAP in js/data.js
const ERA_ID = process.env.ERA || 'threekingdoms';
const ERA_DIR = path.join(__dirname, '..', 'js', 'eras', ERA_ID);
const ERA = (() => { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ERA_DIR, 'era.js'), 'utf8') + ';this.E = ERA;', c); return c.E; })();
const MAP = ERA.map;
const project = (lon, lat) => [(lon - MAP.lon0) * MAP.kx, (MAP.lat1 - lat) * MAP.ky];
const BOX = { lon0: MAP.lon0 - 0.5, lon1: MAP.lon0 + MAP.W / MAP.kx + 0.5, lat0: MAP.lat1 - MAP.H / MAP.ky - 0.5, lat1: MAP.lat1 + 0.5 };

const dir = process.argv[2] || path.join(__dirname, 'naturalearth');
const FILES = {
  land: '50m/physical/ne_50m_land.json',
  rivers: '10m/physical/ne_10m_rivers_lake_centerlines.json',
  lakes: '10m/physical/ne_10m_lakes.json',
};
async function load(key) {
  const file = path.join(dir, path.basename(FILES[key]));
  if (!fs.existsSync(file)) {
    const url = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/' + FILES[key];
    console.log('downloading ' + url);
    const res = await fetch(url); if (!res.ok) throw new Error('download failed: ' + res.status);
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- geometry helpers (all in lon/lat until projection) ----
function clipPolygon(ring) {   // Sutherland-Hodgman against BOX
  const edges = [
    (p) => p[0] >= BOX.lon0, (p) => p[0] <= BOX.lon1, (p) => p[1] >= BOX.lat0, (p) => p[1] <= BOX.lat1,
  ];
  const inter = [
    (a, b) => [BOX.lon0, a[1] + (b[1] - a[1]) * (BOX.lon0 - a[0]) / (b[0] - a[0])],
    (a, b) => [BOX.lon1, a[1] + (b[1] - a[1]) * (BOX.lon1 - a[0]) / (b[0] - a[0])],
    (a, b) => [a[0] + (b[0] - a[0]) * (BOX.lat0 - a[1]) / (b[1] - a[1]), BOX.lat0],
    (a, b) => [a[0] + (b[0] - a[0]) * (BOX.lat1 - a[1]) / (b[1] - a[1]), BOX.lat1],
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) { if (!pi) out.push(inter[e](prev, cur)); out.push(cur); }
      else if (pi) out.push(inter[e](prev, cur));
    }
  }
  return out;
}
function clipLine(line) {   // split a polyline into the pieces inside BOX
  const inside = (p) => p[0] >= BOX.lon0 && p[0] <= BOX.lon1 && p[1] >= BOX.lat0 && p[1] <= BOX.lat1;
  const pieces = []; let cur = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (inside(p)) { cur.push(p); }
    else if (cur.length) { pieces.push(cur); cur = []; }
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((p) => p.length >= 2);
}
function simplify(pts, tol) {   // Douglas-Peucker on projected points
  if (pts.length <= 2) return pts;
  const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const dist2 = (p, a, b) => { const l2 = sq(a, b); if (!l2) return sq(p, a); let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2; t = Math.max(0, Math.min(1, t)); return sq(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); };
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) { const d = dist2(pts[i], pts[s], pts[e]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD > tol * tol) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const round = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
const area = (ring) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a / 2); };
const rings = (geom) => geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
const lines = (geom) => geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];

(async () => {
  const [land, rivers, lakes] = await Promise.all([load('land'), load('rivers'), load('lakes')]);

  // land: outer rings only (holes at this scale are inland seas we do not need), clipped and simplified
  const landOut = [];
  for (const f of land.features) for (const poly of rings(f.geometry)) {
    const clipped = clipPolygon(poly[0]); if (clipped.length < 3) continue;
    const pts = simplify(clipped.map((c) => project(c[0], c[1])), 1.2).map(round);
    if (pts.length >= 3 && area(pts) > 40) landOut.push(pts);
  }

  // rivers: skip the great rivers of South-East Asia and Tibet that only clip the corners of the window
  const SKIP = new Set(['Lancang', 'Nu', 'Salween', 'Hong', 'Da', 'Nmai', 'Mytinge', 'Tongtian', 'Yalong', 'Nanpan', 'Zuo', 'You', 'Xar Moron', 'Shandian', 'Rong', 'Mekong', 'Black', 'Red']);
  const riverOut = [];
  for (const f of rivers.features) {
    if (!f.geometry) continue;
    const P = f.properties; const name = P.name || P.name_en || '';
    if (SKIP.has(name) || P.scalerank > 9) continue;
    for (const line of lines(f.geometry)) for (const piece of clipLine(line)) {
      const pts = simplify(piece.map((c) => project(c[0], c[1])), 0.9).map(round);
      if (pts.length >= 2) riverOut.push({ n: P.name_en || name, r: P.scalerank, lake: /Lake/.test(P.featurecla || ''), pts });
    }
  }

  // lakes: the larger ones of the Chinese lowlands
  const WANT = /^(Dongting|Poyang|Tai|Hongze|Chao|Gaoyou|Weishan|Liangzi|Hong|Dianchi|Qinghai|Nan|Luoma|Shijiu) Hu$/;
  const lakeOut = [];
  for (const f of lakes.features) {
    if (!f.geometry || !WANT.test(f.properties.name || '')) continue;
    for (const poly of rings(f.geometry)) {
      const clipped = clipPolygon(poly[0]); if (clipped.length < 3) continue;
      const pts = simplify(clipped.map((c) => project(c[0], c[1])), 0.8).map(round);
      if (pts.length >= 3 && area(pts) > 15) lakeOut.push({ n: f.properties.name.replace(/ Hu$/, ''), pts });
    }
  }

  const out = `// Generated by tools/buildmap.js from Natural Earth (public domain, naturalearthdata.com). Do not edit by hand.
// Coastline (50m), rivers and lakes (10m) clipped to the game's window on China and projected to canvas coordinates.
const GEO = ${JSON.stringify({ land: landOut, rivers: riverOut, lakes: lakeOut })};
`;
  fs.writeFileSync(path.join(ERA_DIR, 'geo.js'), out);
  console.log(`land polygons ${landOut.length} (${landOut.reduce((a, p) => a + p.length, 0)} pts), rivers ${riverOut.length} pieces (${riverOut.reduce((a, r) => a + r.pts.length, 0)} pts), lakes ${lakeOut.length}; ${ERA_ID}/geo.js ${Math.round(out.length / 1024)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
