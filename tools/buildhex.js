// Build js/hexmaps.js and img/hex/<city>.png: a 13 x 12 hex battle map for every city, drawn from the real ground.
//
//   node tools/buildhex.js [tileCacheDir] [naturalEarthDir]
//
// Each hex is about 5 km across. For every city the tool:
//   - fetches zoom-10 Terrarium elevation tiles (about 130 m per sample) and renders a hillshaded relief PNG of the
//     battlefield with the same light, exaggeration and colour ramp as the strategic relief (tools/buildrelief.js);
//   - classifies each hex from that fine elevation (mean height above the city and ruggedness) into plain, hills or
//     mountain, and from the Natural Earth 10m rivers and coast into river, stream, lake or sea;
//   - keeps the real river, lake and coast geometry (clipped to the battlefield, in km east/north of the city) so the
//     viewer can draw them as vectors in the main map's style;
//   - places the walls at the centre and runs roads from the gates to the map edge in the true bearing of each
//     neighbouring city, so an attacker arrives from the side his city really lies on.
// Layout is pointy-top, odd rows shifted right ("odd-r"); row 0 is north; the city is at column 6, row 5.
//
// Terrain codes:  ~ sea   l lake   r river   s stream   m mountain   h hills   f forest   w marsh   a farmland
//                 p plain   C city   W wall   G gate        Roads are a separate 0/1 layer.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const W = 13, H = 12, HEX_KM = 5, CC = 6, CR = 5;
const PX_PER_KM = 4;                                   // relief raster resolution
const ERA_ID = process.env.ERA || 'threekingdoms';
const ERA_DIR = path.join(__dirname, '..', 'js', 'eras', ERA_ID);
const ERA = (() => { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ERA_DIR, 'era.js'), 'utf8') + ';this.E = ERA;', c); return c.E; })();
const MAP = ERA.map;
const project = (lon, lat) => [(lon - MAP.lon0) * MAP.kx, (MAP.lat1 - lat) * MAP.ky];
const cacheDir = process.argv[2] || path.join(__dirname, 'relief-tiles');
const neDir = process.argv[3] || process.argv[2] || path.join(__dirname, 'naturalearth');
const Z = 10, N = 1 << Z, TILE = 256;

// ---- game data ----
const root = ERA_DIR;
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + fs.readFileSync(path.join(root, 'geo.js'), 'utf8') + '; this.PROVINCES = PROVINCES; this.ROADS = ROADS; this.GEO = GEO; this.FLOOD_PLAIN = FLOOD_PLAIN;', ctx);
const { PROVINCES, ROADS, GEO, FLOOD_PLAIN } = ctx;

// ---- PNG codec (as in buildrelief.js) ----
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, ctype = 0; const idat = [];
  while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; } else if (type === 'IDAT') idat.push(data); pos += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype]; const stride = w * bpp; const out = Buffer.alloc(h * stride); let p = 0;
  for (let y = 0; y < h; y++) { const f = raw[p++], row = y * stride, prev = (y - 1) * stride; for (let i = 0; i < stride; i++) { const x = raw[p++], a = i >= bpp ? out[row + i - bpp] : 0, b = y > 0 ? out[prev + i] : 0, c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0; let v = x; if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1); else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[row + i] = v & 255; } }
  return { w, h, bpp, data: out };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function encodePNG(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 1; for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = (rgb[y * stride + i] - (i >= 3 ? rgb[y * stride + i - 3] : 0)) & 255; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- elevation tiles ----
const merc = (lon, lat) => { const r = lat * Math.PI / 180; return [(lon + 180) / 360 * N * TILE, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N * TILE]; };
const tiles = new Map();
async function tile(x, y) {
  const key = `${x},${y}`; if (tiles.has(key)) return tiles.get(key);
  const dir = path.join(cacheDir, 'z10'); const file = path.join(dir, `${Z}_${x}_${y}.png`);
  if (!fs.existsSync(file)) { const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`); if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); }
  const png = decodePNG(fs.readFileSync(file)); const el = new Float32Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) { const o = i * png.bpp; el[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768; }
  tiles.set(key, el); return el;
}
async function elevation(lon, lat) {   // bilinear
  const [px, py] = merc(lon, lat); const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  const at = async (x, y) => (await tile(Math.floor(x / TILE), Math.floor(y / TILE)))[(y % TILE) * TILE + (x % TILE)];
  return (await at(x0, y0)) * (1 - fx) * (1 - fy) + (await at(x0 + 1, y0)) * fx * (1 - fy) + (await at(x0, y0 + 1)) * (1 - fx) * fy + (await at(x0 + 1, y0 + 1)) * fx * fy;
}

// ---- colour, as the strategic relief ----
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const RAMP = [[-50, '#2f3c2c'], [150, '#37402c'], [400, '#42432c'], [800, '#4f4a31'], [1400, '#5c5538'], [2200, '#6b6244'], [3200, '#7b7256'], [4200, '#908a78'], [5500, '#a8a59c']].map(([h, c]) => [h, hex(c)]);
function tint(h) { if (h <= RAMP[0][0]) return RAMP[0][1]; for (let i = 1; i < RAMP.length; i++) if (h <= RAMP[i][0]) { const [h0, c0] = RAMP[i - 1], [h1, c1] = RAMP[i]; const t = (h - h0) / (h1 - h0); return [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * t); } return RAMP[RAMP.length - 1][1]; }

// ---- Natural Earth water: raw 10m files when present, else the strategic map's simplified data ----
const readJson = (name) => { const f = path.join(neDir, name); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const RAW = { land: readJson('ne_10m_land.json') || readJson('ne_50m_land.json'), rivers: readJson('ne_10m_rivers_lake_centerlines.json'), lakes: readJson('ne_10m_lakes.json') };
const SKIP = new Set(['Lancang', 'Nu', 'Salween', 'Hong', 'Da', 'Nmai', 'Mytinge', 'Tongtian', 'Yalong', 'Nanpan', 'Zuo', 'You', 'Xar Moron', 'Shandian', 'Rong', 'Mekong', 'Black', 'Red']);
const rings = (g) => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const lines = (g) => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
// pre-index the raw features by bounding box so 58 cities do not scan 11 MB of rivers each
function indexFeatures(fc, getParts) {
  if (!fc) return [];
  const out = [];
  for (const f of fc.features) { if (!f.geometry) continue; for (const part of getParts(f)) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of part) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } out.push({ part, bbox: [x0, y0, x1, y1], props: f.properties }); } }
  return out;
}
const RIVERS = indexFeatures(RAW.rivers, (f) => { const P = f.properties; const n = P.name || P.name_en || ''; return SKIP.has(n) || P.scalerank > 9 || /Lake/.test(P.featurecla || '') ? [] : lines(f.geometry); });
const LAND = indexFeatures(RAW.land, (f) => rings(f.geometry).map((r) => r[0]));
const LAKES = indexFeatures(RAW.lakes, (f) => rings(f.geometry).map((r) => r[0]));

function clipPolygon(ring, box) {
  const [X0, Y0, X1, Y1] = box;
  const edges = [(p) => p[0] >= X0, (p) => p[0] <= X1, (p) => p[1] >= Y0, (p) => p[1] <= Y1];
  const inter = [(a, b) => [X0, a[1] + (b[1] - a[1]) * (X0 - a[0]) / (b[0] - a[0])], (a, b) => [X1, a[1] + (b[1] - a[1]) * (X1 - a[0]) / (b[0] - a[0])], (a, b) => [a[0] + (b[0] - a[0]) * (Y0 - a[1]) / (b[1] - a[1]), Y0], (a, b) => [a[0] + (b[0] - a[0]) * (Y1 - a[1]) / (b[1] - a[1]), Y1]];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) { const inp = out; out = []; for (let i = 0; i < inp.length; i++) { const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length]; const ci = edges[e](cur), pi = edges[e](prev); if (ci) { if (!pi) out.push(inter[e](prev, cur)); out.push(cur); } else if (pi) out.push(inter[e](prev, cur)); } }
  return out;
}
function clipLine(line, box) {   // pieces inside the box, with the crossing points added so lines reach the edge
  const [X0, Y0, X1, Y1] = box; const inside = (p) => p[0] >= X0 && p[0] <= X1 && p[1] >= Y0 && p[1] <= Y1;
  const cross = (a, b) => { // point where segment a-b leaves/enters the box (Liang-Barsky, first hit)
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - X0], [dx, X1 - a[0]], [-dy, a[1] - Y0], [dy, Y1 - a[1]]]) { if (p === 0) { if (q < 0) return null; continue; } const t = q / p; if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; } }
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
  };
  const pieces = []; let cur = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i], prev = line[i - 1];
    if (inside(p)) { if (!cur.length && prev && !inside(prev)) { const c = cross(prev, p); if (c) cur.push(c[0]); } cur.push(p); }
    else { if (cur.length) { const c = cross(prev, p); if (c) cur.push(c[1]); pieces.push(cur); cur = []; } else if (prev && !inside(prev)) { const c = cross(prev, p); if (c && c[0] !== c[1]) pieces.push(c); } }
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((p) => p.length >= 2);
}
const bboxHit = (b, box) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]);
const distToLine = (pts, x, y) => { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1; let t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)))); } return best; };
function inside(poly, x, y) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }

// ---- hex helpers (odd-r) ----
const oddr2cube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
const cube2oddr = (x, y, z) => [x + (z - (z & 1)) / 2, z];
const cubeRound = (x, y, z) => { let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z); const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z); if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry; return [rx, ry, rz]; };
const hexDist = (c1, r1, c2, r2) => { const a = oddr2cube(c1, r1), b = oddr2cube(c2, r2); return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); };
function hexLine(c1, r1, c2, r2) { const a = oddr2cube(c1, r1), b = oddr2cube(c2, r2); const n = hexDist(c1, r1, c2, r2); const out = []; for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; const [x, y, z] = cubeRound(a[0] + (b[0] - a[0]) * t + 1e-6, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 1e-6); const [c, r] = cube2oddr(x, y, z); if (c >= 0 && c < W && r >= 0 && r < H) out.push([c, r]); } return out; }
function neighbours(c, r) { const [x, y, z] = oddr2cube(c, r); return [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]].map(([dx, dy, dz]) => cube2oddr(x + dx, y + dy, z + dz)).filter(([cc, rr]) => cc >= 0 && cc < W && rr >= 0 && rr < H); }
const hexKm = (c, r) => [((c + (r & 1) * 0.5) - (CC + (CR & 1) * 0.5)) * HEX_KM, -(r - CR) * HEX_KM * 0.866];   // km east, km north of the city
const HEX_R = HEX_KM / Math.sqrt(3);
function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 16777216; }; }
const r1 = (v) => Math.round(v * 100) / 100;

(async () => {
  const byId = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));
  const adj = {}; for (const [a, b, type] of ROADS) { (adj[a] = adj[a] || []).push({ to: b, type }); (adj[b] = adj[b] || []).push({ to: a, type }); }
  const imgDir = path.join(__dirname, '..', 'img', 'hex'); fs.mkdirSync(imgDir, { recursive: true });
  const out = {};
  // the battlefield window in km around the city, the same for every city
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const [x, y] = hexKm(c, r); minX = Math.min(minX, x - HEX_KM / 2); maxX = Math.max(maxX, x + HEX_KM / 2); minY = Math.min(minY, y - HEX_R); maxY = Math.max(maxY, y + HEX_R); }
  const M = 1.5; minX -= M; maxX += M; minY -= M; maxY += M;
  const PW = Math.round((maxX - minX) * PX_PER_KM), PH = Math.round((maxY - minY) * PX_PER_KM);

  for (const P of PROVINCES) {
    const rnd = rng(P.id);
    const kmLon = 111.32 * Math.cos(P.lat * Math.PI / 180), kmLat = 110.57;
    const toKm = ([lon, lat]) => [(lon - P.lon) * kmLon, (lat - P.lat) * kmLat];
    const box = [P.lon + minX / kmLon, P.lat + minY / kmLat, P.lon + maxX / kmLon, P.lat + maxY / kmLat];   // lon/lat box
    const cityElev = await elevation(P.lon, P.lat);

    // 1. fine elevation raster
    const E = new Float32Array(PW * PH);
    for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) { const x = minX + (px + 0.5) / PX_PER_KM, y = maxY - (py + 0.5) / PX_PER_KM; E[py * PW + px] = await elevation(P.lon + x / kmLon, P.lat + y / kmLat); }

    // 2. water geometry in km
    let coast = LAND.length ? LAND.filter((f) => bboxHit(f.bbox, box)).map((f) => clipPolygon(f.part, box)).filter((r) => r.length >= 3).map((r) => r.map(toKm)) : null;
    if (!coast) { const box2 = [project(box[0], box[3]), project(box[2], box[1])]; coast = GEO.land.map((poly) => clipPolygon(poly, [box2[0][0], box2[0][1], box2[1][0], box2[1][1]])).filter((r) => r.length >= 3).map((r) => r.map(([x, y]) => toKm([MAP.lon0 + x / MAP.kx, MAP.lat1 - y / MAP.ky]))); }
    // a window that lies wholly on land needs no coast at all
    const fullLand = coast.some((r) => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return Math.min(...xs) <= minX + 0.01 && Math.max(...xs) >= maxX - 0.01 && Math.min(...ys) <= minY + 0.01 && Math.max(...ys) >= maxY - 0.01 && r.length <= 5; });
    if (fullLand) coast = [];
    const lakes = LAKES.filter((f) => bboxHit(f.bbox, box)).map((f) => ({ n: (f.props.name || '').replace(/ Hu$/, ''), pts: clipPolygon(f.part, box).map(toKm) })).filter((l) => l.pts.length >= 3);
    const rivers = [];
    for (const f of RIVERS) { if (!bboxHit(f.bbox, box)) continue; for (const piece of clipLine(f.part, box)) rivers.push({ n: f.props.name_en || f.props.name || '', r: f.props.scalerank, pts: piece.map(toKm).map(([x, y]) => [r1(x), r1(y)]) }); }
    const landAt = (x, y) => (coast.length ? coast.some((r) => inside(r, x, y)) : true);
    const lakeAt = (x, y) => lakes.some((l) => inside(l.pts, x, y));

    // 3. classify hexes from the raster and the water
    const cells = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const [x, y] = hexKm(c, r);
      const vals = [];
      for (let py = Math.max(0, Math.floor((maxY - (y + HEX_R)) * PX_PER_KM)); py < Math.min(PH, Math.ceil((maxY - (y - HEX_R)) * PX_PER_KM)); py++) for (let px = Math.max(0, Math.floor((x - HEX_KM / 2 - minX) * PX_PER_KM)); px < Math.min(PW, Math.ceil((x + HEX_KM / 2 - minX) * PX_PER_KM)); px++) { const kx = minX + (px + 0.5) / PX_PER_KM - x, ky = maxY - (py + 0.5) / PX_PER_KM - y; if (Math.hypot(kx, ky) <= HEX_R * 0.95) vals.push(E[py * PW + px]); }
      const mean = vals.reduce((a, v) => a + v, 0) / (vals.length || 1); const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length || 1));
      const riverRank = rivers.reduce((best, rv) => (distToLine(rv.pts, x, y) <= (rv.r <= 6 ? 2.6 : 1.8) && (best === null || rv.r < best) ? rv.r : best), null);
      cells.push({ c, r, x, y, mean, sd, land: landAt(x, y), lake: lakeAt(x, y), river: riverRank });
    }
    const terrain = cells.map((h) => {
      if (!h.land) return '~';
      if (h.lake) return 'l';
      if (h.river !== null) return h.river <= 6 ? 'r' : 's';
      const rel = h.mean - cityElev;
      if (rel > 550 || h.sd > 110) return 'm';
      if (rel > 180 || h.sd > 45) return 'h';
      return 'p';
    });
    // 4. the city and its walls
    const inner = P.tier >= 3 ? 1 : 0;
    for (const h of cells) { const d = hexDist(h.c, h.r, CC, CR); if (d <= inner) terrain[h.r * W + h.c] = 'C'; else if (d === inner + 1) terrain[h.r * W + h.c] = 'W'; }
    // 4b. rivers run unbroken: every hex a river line passes through is water, joined hex to hex so there are no gaps,
    //     and a river cuts through the wall ring and the town itself if that is where it flows (the city's heart is kept)
    const nearestHex = (x, y) => { let best = null, bd = 1e9; for (const h of cells) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } } return bd <= HEX_KM * 0.62 ? best : null; };
    for (const rv of rivers) {
      const code = rv.r <= 6 ? 'r' : 's'; let prev = null;
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const [x1, y1] = rv.pts[i], [x2, y2] = rv.pts[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (HEX_KM * 0.25)));
        for (let k = 0; k <= n; k++) {
          const h = nearestHex(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n); if (!h) { prev = null; continue; }
          const path = prev && (prev.c !== h.c || prev.r !== h.r) ? hexLine(prev.c, prev.r, h.c, h.r) : [[h.c, h.r]];
          for (const [c, r] of path) {
            const j = r * W + c; const t = terrain[j];
            if (c === CC && r === CR) continue;                       // the heart of the city stays dry
            if (t === '~' || t === 'l' || t === 'r') continue;         // already water
            if (t === 's' && code === 'r') { terrain[j] = 'r'; continue; }
            if (t !== 's') terrain[j] = code;
          }
          prev = h;
        }
      }
    }
    // 5. roads toward the neighbours
    const roads = new Array(W * H).fill(0); const exits = [];
    for (const { to, type } of adj[P.id] || []) {
      const Q = byId[to]; const dx = (Q.lon - P.lon) * kmLon, dy = (Q.lat - P.lat) * kmLat; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
      let exit = null;
      for (let k = 1; k < 60; k++) { const kx = ux * k * HEX_KM * 0.5, ky = uy * k * HEX_KM * 0.5; let best = null, bd = 1e9; for (const h of cells) { const d = Math.hypot(h.x - kx, h.y - ky); if (d < bd) { bd = d; best = h; } } if (bd > HEX_KM) break; exit = best; }
      if (!exit) continue;
      for (const [c, r] of hexLine(CC, CR, exit.c, exit.r)) { const i = r * W + c; if (terrain[i] === 'C') continue; if (terrain[i] === 'W') terrain[i] = 'G'; else if (!'~lrs'.includes(terrain[i])) roads[i] = 1; }   // no roads on water: rivers are forded, not bridged
      exits.push({ to, type, c: exit.c, r: exit.r });
    }
    // 6. dressing
    const flood = FLOOD_PLAIN.includes(P.id) || P.traits.includes('river');
    for (const h of cells) {
      const i = h.r * W + h.c; const t = terrain[i]; if (!'ph'.includes(t) || roads[i]) continue;
      const d = hexDist(h.c, h.r, CC, CR);
      const wet = neighbours(h.c, h.r).some(([c, r]) => 'rl~s'.includes(terrain[r * W + c]));
      if (t === 'p' && wet && h.mean - cityElev < 25 && rnd() < (flood ? 0.4 : 0.15)) { terrain[i] = 'w'; continue; }
      const forestP = (t === 'h' ? 0.4 : 0.1) + (P.lat < 30 ? 0.12 : 0) - (d <= 3 ? 0.08 : 0);
      if (rnd() < forestP) { terrain[i] = 'f'; continue; }
      if (t === 'p' && d >= 2 && d <= 4 && rnd() < 0.55) terrain[i] = 'a';
    }
    // 7. the relief image: hillshade + ramp, as the strategic map
    const az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, ZF = 2.0, mpp = 1000 / PX_PER_KM;
    const rgb = Buffer.alloc(PW * PH * 3);
    for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
      const e = (x, y) => E[Math.min(PH - 1, Math.max(0, y)) * PW + Math.min(PW - 1, Math.max(0, x))];
      const dzdx = (e(px + 1, py) - e(px - 1, py)) / (2 * mpp), dzdy = (e(px, py + 1) - e(px, py - 1)) / (2 * mpp);
      const slope = Math.atan(ZF * Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
      const shade = Math.max(0, Math.min(1, Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect)));
      const c = tint(Math.max(0, E[py * PW + px])); const light = Math.max(0.3, Math.min(1.45, 1 + 1.1 * (shade - 0.707)));
      const o = (py * PW + px) * 3; for (let k = 0; k < 3; k++) rgb[o + k] = Math.max(0, Math.min(255, Math.round(c[k] * light / 4) * 4));
    }
    fs.writeFileSync(path.join(imgDir, `${P.id}.png`), encodePNG(PW, PH, rgb));

    out[P.id] = { w: W, h: H, elev: Math.round(cityElev), terrain: terrain.join(''), roads: roads.join(''), exits,
      img: { x0: r1(minX), y1: r1(maxY), w: r1(maxX - minX), h: r1(maxY - minY) },
      coast: coast.map((r) => r.map(([x, y]) => [r1(x), r1(y)])), lakes: lakes.map((l) => ({ n: l.n, pts: l.pts.map(([x, y]) => [r1(x), r1(y)]) })), rivers };
    process.stdout.write('.');
  }
  const text = `// Generated by tools/buildhex.js from Terrarium elevation (zoom 10) and Natural Earth 10m water around each city. Do not edit by hand.
// 13 x 12 hexes of about 5 km, pointy-top, odd rows shifted right, row 0 north, city at column 6 row 5.
// terrain: ~ sea  l lake  r river  s stream  m mountain  h hills  f forest  w marsh  a farmland  p plain  C city  W wall  G gate
// roads: 1 where a road crosses the hex. exits: the edge hex each neighbour's road leaves by.
// img: the relief PNG's window in km east/north of the city (x0, top y1, width, height); coast/lakes/rivers: real geometry in the same km frame.
const HEXMAPS = ${JSON.stringify(out)};
`;
  fs.writeFileSync(path.join(root, 'hexmaps.js'), text);
  const sizes = fs.readdirSync(imgDir).reduce((a, f) => a + fs.statSync(path.join(imgDir, f)).size, 0);
  console.log(`\njs/hexmaps.js written for ${Object.keys(out).length} cities (${Math.round(text.length / 1024)} KB); relief images ${PW}x${PH} px, ${Math.round(sizes / 1024)} KB in all`);
})().catch((e) => { console.error(e); process.exit(1); });
