// Build img/relief.png: a hillshaded, elevation-tinted relief of the map window from real terrain data.
//
//   node tools/buildrelief.js [tileCacheDir]
//
// Elevation comes from the Mapzen/Tilezen "Terrarium" tiles on AWS Open Data (public, no key):
//   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png   (elevation = R*256 + G + B/256 - 32768)
// which derive from SRTM, GMTED and ETOPO1. Tiles at zoom 7 covering the window are fetched once into the cache
// directory (default tools/relief-tiles), reprojected from Web Mercator into the game's MAP projection, shaded
// with a north-west light, tinted by height in the game's palette and written as a PNG. No dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// keep in step with MAP in js/data.js
const MAP = { W: 1400, H: 1180, lon0: 100.5, lat1: 42.4, kx: 56, ky: 55.5 };
const Z = 7, N = 1 << Z, TILE = 256;
const cacheDir = process.argv[2] || path.join(__dirname, 'relief-tiles');

// ---- minimal PNG codec (8-bit, non-interlaced) ----
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, ctype = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype]; const stride = w * bpp; const out = Buffer.alloc(h * stride); let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], row = y * stride, prev = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[p++], a = i >= bpp ? out[row + i - bpp] : 0, b = y > 0 ? out[prev + i] : 0, c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v = x;
      if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[row + i] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function encodePNG(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 1; for (let i = 0; i < stride; i++) raw[y * (stride + 1) + 1 + i] = (rgb[y * stride + i] - (i >= 3 ? rgb[y * stride + i - 3] : 0)) & 255; }   // Sub filter
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiles ----
const merc = (lon, lat) => { const r = lat * Math.PI / 180; return [(lon + 180) / 360 * N * TILE, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N * TILE]; };
async function fetchTile(x, y) {
  const file = path.join(cacheDir, `${Z}_${x}_${y}.png`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const png = decodePNG(fs.readFileSync(file));
  const el = new Float32Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) { const o = i * png.bpp; el[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768; }
  return el;
}

// ---- colour ----
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
// height (m) -> colour, in the game's dark parchment palette: green-olive lowland, olive-brown hills, grey-brown highlands, pale plateau
const RAMP = [[-50, '#2f3c2c'], [150, '#37402c'], [400, '#42432c'], [800, '#4f4a31'], [1400, '#5c5538'], [2200, '#6b6244'], [3200, '#7b7256'], [4200, '#908a78'], [5500, '#a8a59c']].map(([h, c]) => [h, hex(c)]);
function tint(h) {
  if (h <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (h <= RAMP[i][0]) { const [h0, c0] = RAMP[i - 1], [h1, c1] = RAMP[i]; const t = (h - h0) / (h1 - h0); return [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * t); }
  return RAMP[RAMP.length - 1][1];
}

(async () => {
  fs.mkdirSync(cacheDir, { recursive: true });
  const [px0, py0] = merc(MAP.lon0, MAP.lat1), [px1, py1] = merc(MAP.lon0 + MAP.W / MAP.kx, MAP.lat1 - MAP.H / MAP.ky);
  const tx0 = Math.floor(px0 / TILE), tx1 = Math.floor(px1 / TILE), ty0 = Math.floor(py0 / TILE), ty1 = Math.floor(py1 / TILE);
  console.log(`fetching ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles at zoom ${Z}`);
  const tiles = new Map(); const jobs = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push([x, y]);
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(async ([x, y]) => tiles.set(`${x},${y}`, await fetchTile(x, y))));
  const sample = (px, py) => {   // bilinear elevation at mercator pixel coordinates
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const at = (x, y) => { const t = tiles.get(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`); if (!t) return 0; return t[(y % TILE) * TILE + (x % TILE)]; };
    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
  };

  const { W, H } = MAP; const E = new Float32Array(W * H);
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) { const lon = MAP.lon0 + (cx + 0.5) / MAP.kx, lat = MAP.lat1 - (cy + 0.5) / MAP.ky; const [px, py] = merc(lon, lat); E[cy * W + cx] = sample(px, py); }

  // hillshade: light from the north-west, 45 degrees up, with vertical exaggeration so gentle hills still read
  const az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, ZF = 3.2;
  const rgb = Buffer.alloc(W * H * 3);
  for (let cy = 0; cy < H; cy++) {
    const lat = MAP.lat1 - (cy + 0.5) / MAP.ky;
    const mx = 111320 * Math.cos(lat * Math.PI / 180) / MAP.kx, my = 111320 / MAP.ky;   // metres per pixel
    for (let cx = 0; cx < W; cx++) {
      const e = (x, y) => E[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
      const dzdx = (e(cx + 1, cy) - e(cx - 1, cy)) / (2 * mx), dzdy = (e(cx, cy + 1) - e(cx, cy - 1)) / (2 * my);
      const slope = Math.atan(ZF * Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
      let shade = Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect);
      shade = Math.max(0, Math.min(1, shade));
      const h = E[cy * W + cx]; const c = tint(h);
      const light = Math.max(0.3, Math.min(1.45, 1 + 1.1 * (shade - 0.707)));   // flat ground keeps the palette colour; sunlit slopes brighten, shadowed ones darken
      const o = (cy * W + cx) * 3;
      for (let k = 0; k < 3; k++) rgb[o + k] = Math.max(0, Math.min(255, Math.round(c[k] * light / 4) * 4));   // quantised for a smaller file
    }
  }
  const png = encodePNG(W, H, rgb);
  const out = path.join(__dirname, '..', 'img', 'relief.png'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, png);
  let lo = 1e9, hi = -1e9; for (let i = 0; i < E.length; i++) { if (E[i] < lo) lo = E[i]; if (E[i] > hi) hi = E[i]; }
  console.log(`img/relief.png ${Math.round(png.length / 1024)} KB, elevation ${Math.round(lo)} to ${Math.round(hi)} m`);
})().catch((e) => { console.error(e); process.exit(1); });
