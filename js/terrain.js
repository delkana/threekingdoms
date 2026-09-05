// ============================================================
//  Static map background drawn on real geography.
//  Coastlines, rivers and lakes come from Natural Earth (public
//  domain) via js/geo.js, already projected to the canvas by
//  tools/buildmap.js with the MAP projection in js/data.js.
//  Mountain ranges, the steppe, the Great Wall and labels are
//  placed here by longitude/latitude and projected the same way.
//  Also exposes isSea(x, y) for territory shading.
// ============================================================

const TERRAIN = (() => {
  const W = MAP.W, H = MAP.H;
  const P = (lon, lat) => MAP.project(lon, lat);
  const f1 = (v) => (Math.round(v * 10) / 10).toString();

  // deterministic jitter so the map looks the same every render
  let seed = 20250904;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pts = (arr) => arr.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');

  // Mountain ranges: from -> to (lon/lat), count, glyph size
  const RANGES = [
    { a: [100.6, 39.0], b: [102.6, 37.6], n: 8, s: 9 },      // Qilian
    { a: [105.6, 34.0], b: [110.8, 33.6], n: 16, s: 10 },    // Qinling
    { a: [107.4, 32.3], b: [110.0, 32.0], n: 8, s: 9 },      // Daba
    { a: [109.6, 30.7], b: [110.6, 31.3], n: 5, s: 8 },      // Wu Mountains, the gorges
    { a: [113.3, 38.0], b: [113.9, 36.3], n: 6, s: 7 },      // Taihang
    { a: [115.6, 40.7], b: [119.2, 40.6], n: 9, s: 8 },      // Yan Mountains
    { a: [115.3, 31.4], b: [116.6, 31.1], n: 5, s: 7 },      // Dabie
    { a: [110.2, 25.3], b: [112.5, 25.3], n: 7, s: 8 },      // Nanling (west)
    { a: [113.4, 25.2], b: [115.4, 25.0], n: 6, s: 8 },      // Nanling (east)
    { a: [117.0, 27.6], b: [118.5, 25.9], n: 7, s: 9 },      // Wuyi
    { a: [101.6, 27.2], b: [103.0, 26.1], n: 6, s: 9 },      // Yunnan plateau
    { a: [103.6, 24.7], b: [105.6, 24.1], n: 6, s: 9 },
    { a: [108.4, 28.6], b: [110.0, 27.6], n: 5, s: 8 },      // Wuling range
    { a: [108.0, 41.3], b: [112.6, 41.0], n: 6, s: 7 },      // Yinshan
    { a: [117.0, 36.3], b: [117.3, 36.1], n: 2, s: 8 },      // Mount Tai
    { a: [124.6, 42.1], b: [125.5, 41.2], n: 4, s: 8 },      // Changbai
    { a: [103.2, 33.4], b: [104.6, 32.2], n: 5, s: 9 },      // Min Mountains, west of the Shu basin
  ].map((r) => ({ a: P(...r.a), b: P(...r.b), n: r.n, s: r.s }));
  const PLATEAU = (() => { const [x0, y0] = P(100.5, 37.0), [x1, y1] = P(102.4, 29.0); return { x0, y0, x1, y1, n: 22, s: 12 }; })();

  // The Great Wall of the Han, roughly, from the Hexi corridor to Liaodong
  const WALL = [[100.6, 39.9], [103.6, 38.6], [105.9, 37.5], [107.6, 37.9], [109.7, 39.4], [111.6, 40.2], [113.9, 40.5], [116.0, 40.6], [118.2, 40.5], [119.9, 40.3], [121.4, 41.0], [123.0, 41.6]].map((c) => P(...c));
  // the steppe north of the wall
  const STEPPE = [[100.5, 42.4], [125.5, 42.4], [125.5, 41.9], [123.0, 41.8], [121.4, 41.2], [119.9, 40.5], [118.2, 40.7], [116.0, 40.8], [113.9, 40.7], [111.6, 40.4], [109.7, 39.6], [107.6, 38.1], [105.9, 37.7], [103.6, 38.8], [100.5, 40.1]].map((c) => P(...c));

  // [text, lon, lat, rotation, size]
  const LABELS = [
    ['Bohai', 119.8, 38.7, 0, 14], ['Yellow Sea', 122.6, 35.0, 0, 16], ['East China Sea', 123.6, 29.0, -70, 16],
    ['South China Sea', 115.5, 21.5, 0, 16], ['Gulf of Tonkin', 107.6, 21.6, 0, 10],
    ['Yellow River', 106.0, 40.4, -3, 12], ['Yangtze', 109.0, 30.4, 10, 12], ['Han River', 111.1, 33.0, 55, 10], ['Huai', 115.9, 33.35, 8, 10], ['Wei', 107.6, 34.5, 5, 9],
    ['Qinling', 108.4, 33.5, 0, 11], ['Nanling', 112.2, 24.9, 0, 11], ['Taihang', 113.7, 37.2, 72, 9], ['Wuyi', 117.9, 26.6, 42, 10], ['Daba', 108.7, 31.9, 0, 9],
    ['Great Wall', 110.5, 39.9, -3, 10], ['Gobi', 104.0, 41.9, 0, 13], ['Tibetan Plateau', 101.0, 33.0, -74, 13], ['Liaodong', 122.7, 40.2, 0, 10],
    ['Dongting', 112.8, 29.15, 0, 8], ['Poyang', 116.3, 29.0, 0, 8], ['Taihu', 120.2, 31.15, 0, 7], ['Shu', 104.6, 30.2, 0, 11],
  ];

  function mountain(x, y, s) {
    const h = s * (0.8 + rnd() * 0.5), w = s * (0.9 + rnd() * 0.4);
    const x1 = x - w, x2 = x + w, yb = y + h * 0.45, yt = y - h * 0.55;
    return `<path d="M${x1.toFixed(1)},${yb.toFixed(1)} L${x.toFixed(1)},${yt.toFixed(1)} L${x2.toFixed(1)},${yb.toFixed(1)} Z" class="mtn"/>` +
      `<path d="M${x.toFixed(1)},${yt.toFixed(1)} L${x2.toFixed(1)},${yb.toFixed(1)} L${(x + w * 0.25).toFixed(1)},${yb.toFixed(1)} Z" class="mtn-lit"/>`;
  }
  function range(r) {
    let out = '';
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i < r.n; i++) {
      const t = (i + 0.5) / r.n + (rnd() - 0.5) * 0.06;
      const off = (rnd() - 0.5) * r.s * 1.6;
      out += mountain(r.a[0] + dx * t + nx * off, r.a[1] + dy * t + ny * off, r.s);
    }
    return out;
  }
  function plateau(p) {
    let out = '';
    for (let i = 0; i < p.n; i++) out += mountain(p.x0 + rnd() * (p.x1 - p.x0), p.y0 + rnd() * (p.y1 - p.y0), p.s * (0.7 + rnd() * 0.6));
    return out;
  }

  // Smooth a polyline with quadratic curves through segment midpoints; endpoints are exact. Used for roads.
  function smoothPath(p) {
    if (p.length < 3) return `M${p[0][0]},${p[0][1]} L${p[1][0]},${p[1][1]}`;
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      d += ` Q${p[i][0]},${p[i][1]} ${mx},${my}`;
    }
    const last = p[p.length - 1];
    d += ` L${last[0]},${last[1]}`;
    return d;
  }
  const linePath = (p) => 'M' + p.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' L');
  const polyPath = (p) => linePath(p) + ' Z';

  // ---- water ----
  const LAND_PATH = GEO.land.map(polyPath).join(' ');
  function river(r) {
    const d = linePath(r.pts);
    const major = r.r <= 3, mid = r.r <= 6;
    const bank = major ? 5.2 : mid ? 3.6 : 2.2, w = major ? 3 : mid ? 2 : 1.1;
    return `<path d="${d}" class="river-bank" style="stroke-width:${bank}"/><path d="${d}" class="river" style="stroke-width:${w}"/>` +
      (mid ? `<path d="${d}" class="river-glint" style="stroke-width:${major ? 1 : 0.7}"/>` : '');
  }

  function inside(poly, x, y) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  const seaCache = new Map();
  function isSea(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const key = ((x * 4) | 0) * 100000 + ((y * 4) | 0);
    if (seaCache.has(key)) return seaCache.get(key);
    let land = false;
    for (const poly of GEO.land) if (inside(poly, x, y)) { land = true; break; }
    if (land) for (const l of GEO.lakes) if (inside(l.pts, x, y)) { land = false; break; }
    seaCache.set(key, !land);
    return !land;
  }

  function svg() {
    seed = 20250904;
    const [sx, sy] = P(113.5, 26.0), [bx, by] = P(105.0, 30.6);
    return `
      <defs>
        <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b3526"/><stop offset="0.45" stop-color="#34342a"/><stop offset="1" stop-color="#2c3a2c"/>
        </linearGradient>
        <radialGradient id="seaGrad" cx="0.75" cy="0.45" r="0.9">
          <stop offset="0" stop-color="#244a5e"/><stop offset="1" stop-color="#162d3b"/>
        </radialGradient>
        <pattern id="dunes" width="14" height="10" patternUnits="userSpaceOnUse">
          <path d="M0,7 Q3.5,3 7,7 T14,7" fill="none" stroke="rgba(230,200,140,0.18)" stroke-width="1"/>
        </pattern>
        <pattern id="waves" width="40" height="18" patternUnits="userSpaceOnUse">
          <path d="M0,9 Q10,4 20,9 T40,9" fill="none" stroke="rgba(160,210,235,0.10)" stroke-width="1"/>
        </pattern>
        <filter id="coastGlow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
        <clipPath id="landClip"><path d="${LAND_PATH}"/></clipPath>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#seaGrad)"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#waves)"/>
      <path d="${LAND_PATH}" fill="none" stroke="#8fc3dc" stroke-width="12" opacity="0.28" filter="url(#coastGlow)"/>
      <path d="${LAND_PATH}" fill="url(#landGrad)"/>
      <g clip-path="url(#landClip)">
        <polygon points="${pts(STEPPE)}" fill="#4a4030" opacity="0.75"/>
        <polygon points="${pts(STEPPE)}" fill="url(#dunes)"/>
        <ellipse cx="${f1(sx)}" cy="${f1(sy)}" rx="420" ry="200" fill="#2f5a34" opacity="0.18"/>
        <ellipse cx="${f1(bx)}" cy="${f1(by)}" rx="130" ry="110" fill="#3f6a3a" opacity="0.14"/>
      </g>
      <g id="territory-slot"></g>
      <g class="mountains">${RANGES.map(range).join('')}${plateau(PLATEAU)}</g>
      <g class="rivers">${GEO.rivers.filter((r) => !r.lake).map(river).join('')}${GEO.lakes.map((l) => `<path d="${polyPath(l.pts)}" class="lake"/>`).join('')}</g>
      <path d="${LAND_PATH}" class="coast"/>
      <polyline points="${pts(WALL)}" class="wall"/>
      <g class="geo-labels">${LABELS.map(([t, lon, lat, rot, size]) => { const [x, y] = P(lon, lat); return `<text x="${f1(x)}" y="${f1(y)}" transform="rotate(${rot} ${f1(x)} ${f1(y)})" style="font-size:${size}px">${t}</text>`; }).join('')}</g>`;
  }

  return { svg, W, H, isSea, smoothPath };
})();
