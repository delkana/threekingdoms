// ============================================================
//  Shared renderer for the 13 x 12 hex battle maps: relief underlay,
//  water tiles with shorelines, terrain tints and glyphs, roads, the
//  walled city with its banner, exits, labels, and unit tokens.
//  Used by hexmaps.html (the browser) and the battle screen in ui.js.
// ============================================================
const HEXVIEW = (() => {
  const TERRAIN = {
    '~': { name: 'Sea',      color: 'rgba(0,0,0,0)',         swatch: '#1f4a63' },
    'l': { name: 'Lake',     color: 'rgba(0,0,0,0)',         swatch: '#3f7fa3' },
    'r': { name: 'River',    color: 'rgba(60,120,170,0.18)',  swatch: '#4f93b8' },
    's': { name: 'Stream',   color: 'rgba(90,150,190,0.14)',  swatch: '#7fb3d0' },
    'm': { name: 'Mountain', color: 'rgba(120,110,95,0.30)',  swatch: '#6e665a' },
    'h': { name: 'Hills',    color: 'rgba(150,120,70,0.22)',  swatch: '#7a6a45' },
    'f': { name: 'Forest',   color: 'rgba(40,90,45,0.35)',    swatch: '#3d5a34' },
    'w': { name: 'Marsh',    color: 'rgba(70,120,110,0.32)',  swatch: '#4f6b57' },
    'a': { name: 'Farmland', color: 'rgba(190,175,80,0.16)',  swatch: '#8a8a48' },
    'p': { name: 'Plain',    color: 'rgba(0,0,0,0)',         swatch: '#57633e' },
    'C': { name: 'City',     color: 'rgba(160,120,60,0.55)',  swatch: '#8b6d3a' },
    'W': { name: 'Wall',     color: 'rgba(200,170,110,0.62)', swatch: '#a89060' },
    'G': { name: 'Gate',     color: 'rgba(230,180,80,0.70)',  swatch: '#c9a24a' },
  };
  const HEX_KM = 5, CC = 6, CR = 5;
  const byId = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));
  let uid = 0;
    // geometry: hex size s (centre to corner); the city hex is the origin of the km frame
  const centre = (c, r, s) => { const hw = Math.sqrt(3) * s; return [hw * (c + (r & 1) * 0.5) + hw / 2 + 2, s * 1.5 * r + s + 2]; };
  const hexPts = (cx, cy, s) => { const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`); } return pts.join(' '); };
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // Catmull-Rom spline through every vertex, as the strategic map draws its rivers
  function spline(p) { if (p.length < 3) return `M${f1(p[0][0])},${f1(p[0][1])} L${f1(p[1][0])},${f1(p[1][1])}`; let d = `M${f1(p[0][0])},${f1(p[0][1])}`; for (let i = 0; i < p.length - 1; i++) { const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)]; d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`; } return d; }

  function render(id, s, full, o = {}) {
    const m = HEXMAPS[id], P = byId[id]; const tintsOn = o.tints !== false, coordsOn = !!o.coords; const ownerOf = o.ownerOf || (() => null), ownerColor = o.ownerColor || (() => '#6e6a60'); const hw = Math.sqrt(3) * s; const k = hw / HEX_KM;   // svg px per km
    const [ox, oy] = centre(CC, CR, s); const km = ([x, y]) => [ox + x * k, oy - y * k];
    const W = hw * (m.w + 0.5) + 4, H = s * 1.5 * (m.h - 1) + 2 * s + 4;
    const u = ++uid; const tints = !full || tintsOn;
    const isWater = (t) => '~lrs'.includes(t);
    const WATER_FILL = { '~': `url(#sea${u})`, 'l': '#3a7398', 'r': '#3b7fa6', 's': '#5a9cbd' };
    const atT = (c, r) => (c >= 0 && c < m.w && r >= 0 && r < m.h ? m.terrain[r * m.w + c] : null);
    const dirsFor = (r) => (r & 1 ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]);   // E SE SW W NW NE
    const cornerOf = (cx, cy, i) => { const a = Math.PI / 180 * (60 * i - 30); return [cx + s * Math.cos(a), cy + s * Math.sin(a)]; };
    const ix = ox + m.img.x0 * k, iy = oy - m.img.y1 * k, iw = m.img.w * k, ih = m.img.h * k;
    let out = `<defs>
      <radialGradient id="sea${u}" cx="0.7" cy="0.5" r="0.9"><stop offset="0" stop-color="#244a5e"/><stop offset="1" stop-color="#162d3b"/></radialGradient>
      <pattern id="waves${u}" width="40" height="18" patternUnits="userSpaceOnUse"><path d="M0,9 Q10,4 20,9 T40,9" fill="none" stroke="rgba(160,210,235,0.10)" stroke-width="1"/></pattern>
      <radialGradient id="vig${u}" cx="0.5" cy="0.5" r="0.72"><stop offset="0.75" stop-color="rgba(20,16,12,0)"/><stop offset="1" stop-color="rgba(20,16,12,0.55)"/></radialGradient>
      <clipPath id="frame${u}"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
      <filter id="glow${u}" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>
      <pattern id="roof${u}" width="${f1(s / 3)}" height="${f1(s / 4)}" patternUnits="userSpaceOnUse"><rect width="${f1(s / 3)}" height="${f1(s / 4)}" fill="#6b5030"/><path d="M0,${f1(s / 4)} Q${f1(s / 6)},${f1(s / 16)} ${f1(s / 3)},${f1(s / 4)}" fill="none" stroke="rgba(255,225,170,0.35)" stroke-width="${f1(s / 30)}"/></pattern>
    </defs>
    <g clip-path="url(#frame${u})">
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sea${u})"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#waves${u})"/>
    <image href="img/hex/${id}.png" x="${f1(ix)}" y="${f1(iy)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="none"/>`;
    // hex tints and grid
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      const t = m.terrain[r * m.w + c]; const [cx, cy] = centre(c, r, s); const wall = 'WGC'.includes(t);
      out += `<polygon class="hex" points="${hexPts(cx, cy, s)}" fill="${isWater(t) ? WATER_FILL[t] : wall ? (t === 'C' ? `url(#roof${u})` : 'rgba(90,70,40,0.55)') : tints ? TERRAIN[t].color : 'rgba(0,0,0,0)'}"${full ? ` data-c="${c}" data-r="${r}"` : ''}/>`;
      if (t === '~') out += `<polygon points="${hexPts(cx, cy, s)}" fill="url(#waves${u})" stroke="none"/>`;
    }
    // the shoreline: a pale line with a soft glow along every edge where water meets land
    let shore = '';
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      const t = m.terrain[r * m.w + c]; if (!isWater(t)) continue; const [cx, cy] = centre(c, r, s);
      dirsFor(r).forEach(([dc, dr], i) => { const n = atT(c + dc, r + dr); if (n === null || isWater(n)) return; const a = cornerOf(cx, cy, i), b = cornerOf(cx, cy, (i + 1) % 6); shore += `M${f1(a[0])},${f1(a[1])} L${f1(b[0])},${f1(b[1])} `; });
    }
    if (shore) out += `<path d="${shore}" fill="none" stroke="rgba(160,215,240,0.28)" stroke-width="${f1(s / 5)}" stroke-linecap="round"/><path d="${shore}" fill="none" stroke="rgba(215,240,250,0.75)" stroke-width="${f1(s / 16)}" stroke-linecap="round"/>`;
    // lakes, rivers, coast
    // terrain glyphs
    if (full) for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      const t = m.terrain[r * m.w + c]; const [cx, cy] = centre(c, r, s);
      if (t === 'm') out += `<path d="M${f1(cx - 8)},${f1(cy + 5)} L${f1(cx - 2)},${f1(cy - 6)} L${f1(cx + 3)},${f1(cy + 5)} Z M${f1(cx + 1)},${f1(cy + 6)} L${f1(cx + 6)},${f1(cy - 2)} L${f1(cx + 10)},${f1(cy + 6)} Z" fill="#5a5040" stroke="#241f18" stroke-width="0.8" opacity="0.9"/>`;
      else if (t === 'h') out += `<path d="M${f1(cx - 7)},${f1(cy + 3)} Q${f1(cx - 3)},${f1(cy - 4)} ${f1(cx + 1)},${f1(cy + 3)} M${f1(cx)},${f1(cy + 4)} Q${f1(cx + 4)},${f1(cy - 2)} ${f1(cx + 8)},${f1(cy + 4)}" fill="none" stroke="rgba(230,205,160,0.45)" stroke-width="1.1"/>`;
      else if (t === 'f') out += [[-5, 2], [1, -3], [5, 3]].map(([dx, dy]) => `<circle cx="${f1(cx + dx)}" cy="${f1(cy + dy)}" r="3.2" fill="#2f5a34" stroke="#1d3a22" stroke-width="0.7"/>`).join('');
      else if (t === 'w') out += `<path d="M${f1(cx - 7)},${f1(cy - 2)} q3,-3 6,0 t6,0 M${f1(cx - 5)},${f1(cy + 4)} q3,-3 6,0 t6,0" fill="none" stroke="rgba(150,210,190,0.55)" stroke-width="1"/>`;
      else if (t === 'a') out += `<path d="M${f1(cx - 7)},${f1(cy - 3)} h14 M${f1(cx - 7)},${f1(cy + 1)} h14 M${f1(cx - 7)},${f1(cy + 5)} h14" fill="none" stroke="rgba(220,205,120,0.35)" stroke-width="0.9" stroke-dasharray="2 2"/>`;
      if (coordsOn) out += `<text class="coord" x="${f1(cx)}" y="${f1(cy - s * 0.58)}" text-anchor="middle">${c},${r}</text>`;
    }
    // roads: dotted gold like the strategic map, paler where they bridge water
    const isRoad = (c, r) => c >= 0 && c < m.w && r >= 0 && r < m.h && (m.roads[r * m.w + c] === '1' || 'GC'.includes(m.terrain[r * m.w + c]));
    const nb = (c, r) => (r & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]).map(([dc, dr]) => [c + dc, r + dr]);
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
      if (!isRoad(c, r)) continue; const [x1, y1] = centre(c, r, s); const water = 'rsl'.includes(m.terrain[r * m.w + c]);
      for (const [nc, nr] of nb(c, r)) if (isRoad(nc, nr) && (nr > r || (nr === r && nc > c))) { const [x2, y2] = centre(nc, nr, s); const w2 = 'rsl'.includes(m.terrain[nr * m.w + nc]); out += `<line class="road-line${water || w2 ? ' bridge' : ''}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" style="stroke-width:${f1(s / 11)}"/>`; }
    }
    // the city: a continuous wall along the outer edge of the ring, towers at its corners, gaps and gate-houses where roads enter,
    // an inner wall for great cities, and the owner's banner over the centre
    {
      const at = (c, r) => (c >= 0 && c < m.w && r >= 0 && r < m.h ? m.terrain[r * m.w + c] : ' ');
      const DIRS = (r) => (r & 1 ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]);   // E SE SW W NW NE
      const corner = (cx, cy, i) => { const a = Math.PI / 180 * (60 * i - 30); return [cx + s * Math.cos(a), cy + s * Math.sin(a)]; };
      const wallEdges = (isWall, isInside) => {
        const edges = [], gates = [];
        for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) {
          if (!isWall(at(c, r))) continue; const [cx, cy] = centre(c, r, s);
          DIRS(r).forEach(([dc, dr], i) => {
            const t = at(c + dc, r + dr); if (isInside(t) || isWall(t)) return;
            const a = corner(cx, cy, i), b = corner(cx, cy, (i + 1) % 6);
            const road = c + dc >= 0 && c + dc < m.w && r + dr >= 0 && r + dr < m.h && m.roads[(r + dr) * m.w + c + dc] === '1';
            if (at(c, r) === 'G' && road) gates.push([a, b]); else edges.push([a, b]);
          });
        }
        return { edges, gates };
      };
      const drawWall = ({ edges, gates }, cls) => {
        let g = `<g class="${cls}">`;
        for (const [a, b] of edges) g += `<line class="wall-line" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`;
        for (const [a, b] of edges) g += `<line class="wall-top" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-dasharray="${f1(s / 9)} ${f1(s / 14)}"/>`;
        const seen = new Set();
        for (const [a, b] of edges) for (const v of [a, b]) { const key = `${Math.round(v[0])},${Math.round(v[1])}`; if (seen.has(key)) continue; seen.add(key); g += `<rect class="tower" x="${f1(v[0] - s / 9)}" y="${f1(v[1] - s / 9)}" width="${f1(s * 2 / 9)}" height="${f1(s * 2 / 9)}"/>`; }
        for (const [a, b] of gates) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; g += `<g transform="translate(${f1(mx)},${f1(my)}) rotate(${f1(ang)})"><rect class="gate" x="${f1(-s / 3)}" y="${f1(-s / 6)}" width="${f1(s * 2 / 3)}" height="${f1(s / 3)}" rx="1"/><path d="M${f1(-s / 9)},${f1(s / 6)} v${f1(-s / 6)} a${f1(s / 9)},${f1(s / 9)} 0 0 1 ${f1(s * 2 / 9)},0 v${f1(s / 6)}" fill="#1e1913"/></g>`; }
        return g + '</g>';
      };
      out += drawWall(wallEdges((t) => t === 'W' || t === 'G', (t) => t === 'C'), 'wall-outer');
      if (P.tier >= 3) out += drawWall(wallEdges((t) => t === 'C', (t) => false), 'wall-inner');
      if (full) {
        const [cx, cy] = centre(CC, CR, s); const col = ownerColor(id); const owner = ownerOf(id);
        out += `<line x1="${f1(cx)}" y1="${f1(cy + s * 0.3)}" x2="${f1(cx)}" y2="${f1(cy - s * 1.1)}" stroke="#2a1f12" stroke-width="2"/><path d="M${f1(cx)},${f1(cy - s * 1.1)} h${f1(s * 0.75)} l${f1(-s * 0.18)},${f1(s * 0.22)} l${f1(s * 0.18)},${f1(s * 0.22)} h${f1(-s * 0.75)} z" fill="${col}" stroke="rgba(0,0,0,0.6)" stroke-width="0.8"/>`;
        out += `<text class="city-name" x="${f1(cx)}" y="${f1(cy + s * 0.85)}" text-anchor="middle" style="font-size:${f1(s * 0.42)}px">${P.name}</text>`;
        if (owner) out += `<text class="city-name" x="${f1(cx)}" y="${f1(cy + s * 1.3)}" text-anchor="middle" style="font-size:${f1(s * 0.33)}px;font-weight:normal;fill:#f0dcae">${owner.name}</text>`;
      }
    }
    // labels: rivers by name at their midpoint, the sea, and the exits
    if (full) {
      const named = {};
      for (const rv of m.rivers) { if (!rv.n || rv.r > 7 || named[rv.n] || rv.pts.length < 3) continue; named[rv.n] = 1; const mid = rv.pts[Math.floor(rv.pts.length / 2)], nxt = rv.pts[Math.min(rv.pts.length - 1, Math.floor(rv.pts.length / 2) + 1)]; const [x, y] = km(mid), [x2, y2] = km(nxt); let ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180; out += `<text class="geo-label" x="${f1(x)}" y="${f1(y - 5)}" transform="rotate(${f1(ang)} ${f1(x)} ${f1(y - 5)})" text-anchor="middle" style="font-size:${rv.r <= 3 ? 12 : 10}px">${rv.n}${rv.r <= 6 ? ' River' : ''}</text>`; }
      for (const l of m.lakes) if (l.n) { const cx = l.pts.reduce((a, p) => a + p[0], 0) / l.pts.length, cy = l.pts.reduce((a, p) => a + p[1], 0) / l.pts.length; const [x, y] = km([cx, cy]); out += `<text class="geo-label" x="${f1(x)}" y="${f1(y)}" text-anchor="middle" style="font-size:9px">${l.n}</text>`; }
      if (m.coast.length) { const seaHexes = []; for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (m.terrain[r * m.w + c] === '~') seaHexes.push(centre(c, r, s)); if (seaHexes.length > 3) { const sx = seaHexes.reduce((a, p) => a + p[0], 0) / seaHexes.length, sy = seaHexes.reduce((a, p) => a + p[1], 0) / seaHexes.length; out += `<text class="geo-label" x="${f1(sx)}" y="${f1(sy)}" text-anchor="middle" style="font-size:13px">${P.lat < 25 ? 'South China Sea' : P.lon > 119.5 && P.lat < 33 ? 'East China Sea' : P.lat > 36.5 ? 'Bohai' : 'Yellow Sea'}</text>`; } }
      out += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig${u})" pointer-events="none"/>`;
    }
    out += '</g>';
    if (full) {
      for (const e of m.exits) { const [cx, cy] = centre(e.c, e.r, s); const dx = e.c === 0 ? -1 : e.c === m.w - 1 ? 1 : 0, dy = e.r === 0 ? -1 : e.r === m.h - 1 ? 1 : 0; const anchor = dx < 0 ? 'end' : dx > 0 ? 'start' : 'middle'; const g = e.type === 'pass' ? '▲' : e.type === 'plain' ? '' : '≋'; const lx = cx + dx * (hw * 0.75), ly = cy + dy * (s * 1.25) + (dy < 0 ? -4 : 4); const own = ownerOf(e.to); const oname = own ? own.name : 'unclaimed'; const est = oname.length * 4.6;
        const chipX = anchor === 'start' ? lx : anchor === 'end' ? lx - est - 9 : lx - est / 2 - 9; const textX = anchor === 'start' ? lx + 10 : anchor === 'end' ? lx - est - 9 + 10 : lx + 5;
        out += `<text class="exit-label" x="${f1(lx)}" y="${f1(ly)}" text-anchor="${anchor}">${g ? `<tspan class="exit-glyph">${g}</tspan> ` : ''}${byId[e.to].name}</text>`;
        out += `<rect class="owner-chip" x="${f1(chipX)}" y="${f1(ly + 5)}" width="7" height="7" rx="1.5" fill="${ownerColor(e.to)}"/><text class="exit-label" x="${f1(textX)}" y="${f1(ly + 11.5)}" text-anchor="${anchor === 'end' ? 'start' : anchor === 'middle' ? 'middle' : 'start'}" style="font-size:9px;fill:rgba(220,200,160,0.75)">${oname}</text>`; }
    }
    return { svg: out, W, H };
  }

  // unit tokens: strength and lead officer in the house colour, a morale bar, and a marker for the selected unit
  function unitsSvg(units, s, selectedId) {
    const hw = Math.sqrt(3) * s; let g = '<g class="units">';
    for (const u of units) {
      const [cx, cy] = centre(u.c, u.r, s); const k = u.troops >= 1000 ? `${(u.troops / 1000).toFixed(u.troops % 1000 ? 1 : 0)}k` : u.troops; const o = u.officers && u.officers.length ? u.officers[0] + (u.officers.length > 1 ? ` +${u.officers.length - 1}` : '') : '';
      g += `<g class="unit-token${u.id === selectedId ? ' sel' : ''}${u.acted ? ' acted' : ''}" data-unit="${u.id}"><rect class="unit" x="${f1(cx - hw * 0.42)}" y="${f1(cy - s * 0.5)}" width="${f1(hw * 0.84)}" height="${f1(s)}" rx="3" fill="${u.color}"/><text class="unit-n" x="${f1(cx)}" y="${f1(cy - 1)}" text-anchor="middle" style="font-size:${f1(s * 0.37)}px">${k}</text>${o ? `<text class="unit-o" x="${f1(cx)}" y="${f1(cy + s * 0.33)}" text-anchor="middle" style="font-size:${f1(s * 0.25)}px">${o}</text>` : ''}${u.morale != null ? `<rect x="${f1(cx - hw * 0.42)}" y="${f1(cy + s * 0.5 - 2)}" width="${f1(hw * 0.84 * u.morale / 100)}" height="2" fill="${u.morale > 50 ? '#9fd69f' : u.morale > 25 ? '#e0b55a' : '#e29a8f'}"/>` : ''}</g>`;
    }
    return g + '</g>';
  }
  // highlight hexes (reachable moves, attack targets, gates to ram)
  function highlightSvg(cells, s, cls) { return cells.map(([c, r]) => { const [cx, cy] = centre(c, r, s); return `<polygon class="hl ${cls}" points="${hexPts(cx, cy, s)}" data-c="${c}" data-r="${r}"/>`; }).join(''); }
  return { TERRAIN, render, centre, hexPts, unitsSvg, highlightSvg, byId };
})();
