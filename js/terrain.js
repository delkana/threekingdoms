// ============================================================
//  Static map background: coast and seas, rivers and lakes,
//  mountain ranges, steppe, the Great Wall and labels.
//  Coordinates match the 1400 x 1050 canvas used by PROVINCES.
//  Also exposes isSea(x, y) for territory shading.
// ============================================================

const TERRAIN = (() => {
  const W = 1400, H = 1050;

  // deterministic jitter so the map looks the same every render
  let seed = 20250904;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pts = (arr) => arr.map((p) => p.join(',')).join(' ');

  // Coastline from Liaodong (north) to the Gulf of Tonkin (south). Land lies west of it.
  const COAST = [
    [1400, 130], [1340, 150], [1300, 185], [1280, 205], [1260, 170], [1240, 120], [1200, 105], [1150, 120],
    [1110, 150], [1075, 190], [1065, 225], [1120, 226], [1180, 222], [1250, 212], [1290, 232], [1270, 262],
    [1215, 292], [1175, 318], [1160, 360], [1165, 410], [1190, 470], [1230, 530], [1290, 590], [1345, 630],
    [1360, 690], [1330, 730], [1300, 760], [1290, 810], [1250, 870], [1180, 930], [1100, 975], [1010, 1005],
    [950, 1030], [860, 1040], [790, 1035], [760, 1050], [720, 1040], [690, 1020], [640, 1030], [600, 1050],
  ];
  const SEA_POLY = [...COAST, [1400, 1050], [1400, 130]];

  // Rivers. `to` names what the mouth joins: another river, 'sea' or 'lake'. Mouths are snapped onto
  // the parent's rendered curve (or the coastline) at build time so every junction closes.
  const RIVERS = [
    // the two great rivers
    { name: 'yellow',  w: 4,   to: 'sea',     p: [[150, 130], [260, 90], [420, 70], [560, 80], [680, 110], [700, 200], [690, 300], [665, 325], [720, 330], [790, 350], [860, 335], [905, 320], [960, 305], [1030, 262], [1078, 212]] },
    { name: 'yangtze', w: 4.5, to: 'sea',     p: [[120, 520], [200, 600], [300, 660], [450, 660], [540, 690], [565, 700], [620, 715], [690, 705], [760, 690], [840, 650], [900, 690], [930, 735], [1010, 690], [1090, 650], [1150, 625], [1240, 600], [1300, 605], [1345, 630]] },
    // Yellow River tributaries
    { name: 'wei',     w: 2.5, to: 'yellow',  p: [[320, 330], [380, 372], [490, 385], [600, 352], [665, 325]] },
    { name: 'jing',    w: 1.5, to: 'wei',     p: [[400, 280], [450, 340], [490, 385]] },
    { name: 'fen',     w: 2,   to: 'yellow',  p: [[770, 120], [760, 210], [725, 280], [690, 300]] },
    { name: 'luo',     w: 1.8, to: 'yellow',  p: [[630, 430], [700, 365], [720, 330]] },
    { name: 'qi',      w: 1.6, to: 'yellow',  p: [[820, 230], [855, 290], [880, 325], [905, 320]] },
    // Yangtze tributaries
    { name: 'min',     w: 2,   to: 'yangtze', p: [[290, 500], [300, 590], [330, 640], [380, 660]] },
    { name: 'jialing', w: 2,   to: 'yangtze', p: [[470, 520], [440, 590], [450, 660]] },
    { name: 'han',     w: 3,   to: 'yangtze', p: [[470, 445], [500, 470], [615, 500], [660, 560], [700, 605], [770, 650], [840, 650]] },
    { name: 'yuan',    w: 1.8, to: 'lake',    p: [[480, 800], [560, 765], [622, 745]] },
    { name: 'xiang',   w: 2.5, to: 'lake',    p: [[760, 930], [740, 815], [720, 760], [678, 745]] },
    { name: 'dongting-out', w: 2.2, to: 'yangtze', p: [[652, 732], [690, 705]] },
    { name: 'gan',     w: 2.5, to: 'lake',    p: [[860, 960], [930, 880], [1000, 825], [980, 795]] },
    { name: 'poyang-out',   w: 2.2, to: 'yangtze', p: [[975, 752], [965, 715]] },
    { name: 'wusong',  w: 1.5, to: 'yangtze', p: [[1222, 665], [1290, 660], [1345, 630]] },
    // Huai system
    { name: 'huai',    w: 3,   to: 'sea',     p: [[790, 505], [870, 520], [960, 510], [1040, 535], [1090, 550], [1180, 525], [1180, 475]] },
    { name: 'ying',    w: 1.6, to: 'huai',    p: [[850, 400], [880, 445], [925, 480], [960, 510]] },
    // others
    { name: 'pearl',   w: 2.5, to: 'sea',     p: [[720, 960], [800, 985], [880, 1005], [940, 1032]] },
    { name: 'red',     w: 2,   to: 'sea',     p: [[440, 940], [560, 995], [640, 1030]] },
    { name: 'liao',    w: 2,   to: 'sea',     p: [[1290, 20], [1290, 80], [1255, 130]] },
    { name: 'luan',    w: 1.5, to: 'sea',     p: [[1000, 60], [1040, 110], [1080, 165]] },
  ];

  const LAKES = [
    { cx: 650, cy: 745, rx: 40, ry: 24 },   // Dongting
    { cx: 975, cy: 775, rx: 24, ry: 34 },   // Poyang
    { cx: 1200, cy: 665, rx: 22, ry: 14 },  // Taihu
  ];

  // Mountain ranges: from -> to, count, glyph size
  const RANGES = [
    { a: [140, 280], b: [260, 320], n: 9, s: 9 },      // Qilian
    { a: [330, 420], b: [680, 412], n: 16, s: 10 },    // Qinling
    { a: [480, 560], b: [640, 560], n: 8, s: 9 },      // Daba
    { a: [590, 735], b: [650, 680], n: 5, s: 8 },      // Wu Mountains / gorges
    { a: [800, 150], b: [830, 250], n: 6, s: 7 },      // Taihang
    { a: [830, 70], b: [1050, 90], n: 9, s: 8 },       // Yan Mountains
    { a: [880, 590], b: [960, 600], n: 5, s: 7 },      // Dabie
    { a: [640, 975], b: [780, 985], n: 7, s: 8 },      // Nanling (west)
    { a: [870, 955], b: [1000, 932], n: 6, s: 8 },     // Nanling (east)
    { a: [1080, 850], b: [1170, 930], n: 7, s: 9 },    // Wuyi
    { a: [240, 720], b: [320, 780], n: 6, s: 9 },      // Yunnan plateau
    { a: [420, 860], b: [520, 920], n: 6, s: 9 },
    { a: [430, 700], b: [500, 720], n: 4, s: 8 },
    { a: [400, 40], b: [650, 50], n: 6, s: 7 },        // Yinshan
    { a: [1035, 298], b: [1050, 318], n: 2, s: 8 },    // Mount Tai
    { a: [1240, 40], b: [1380, 100], n: 5, s: 8 },     // Changbai
  ];
  const PLATEAU = { x0: 40, y0: 380, x1: 230, y1: 760, n: 26, s: 12 };

  const WALL = [[250, 150], [400, 120], [560, 110], [700, 130], [820, 90], [960, 85], [1080, 110]];

  const LABELS = [
    ['Bohai', 1165, 172, 0, 14], ['Yellow Sea', 1290, 430, 0, 16], ['East China Sea', 1330, 830, -70, 16],
    ['South China Sea', 1130, 1030, 0, 16], ['Gulf of Tonkin', 665, 1044, 0, 10],
    ['Yellow River', 500, 62, -3, 12], ['Yangtze', 545, 738, 12, 12], ['Han River', 655, 545, 55, 10], ['Huai', 1030, 522, 8, 10], ['Wei', 430, 398, 5, 9],
    ['Qinling', 540, 445, 0, 11], ['Nanling', 720, 1000, 0, 11], ['Taihang', 845, 210, 72, 9], ['Wuyi', 1140, 900, 42, 10], ['Daba', 560, 582, 0, 9],
    ['Great Wall', 610, 98, -3, 10], ['Gobi', 330, 55, 0, 13], ['Tibetan Plateau', 120, 560, -74, 13], ['Liaodong', 1245, 140, 0, 10],
    ['Dongting', 650, 749, 0, 8], ['Poyang', 975, 778, 0, 8], ['Taihu', 1200, 668, 0, 7],
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

  // Smooth a polyline with quadratic curves through segment midpoints; endpoints are exact.
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

  // Catmull-Rom spline through every vertex, as cubic Beziers (rivers must pass through their vertices).
  function splineControls(p, i) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    return [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
  }
  function splinePath(p) {
    if (p.length < 3) return `M${p[0][0]},${p[0][1]} L${p[1][0]},${p[1][1]}`;
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const [, c1, c2, p2] = splineControls(p, i);
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  // Dense sampling of the same spline, for snapping junctions.
  function splineSamples(p, per = 14) {
    const out = [];
    if (p.length < 3) return polylineSamples(p, per);
    for (let i = 0; i < p.length - 1; i++) {
      const [p1, c1, c2, p2] = splineControls(p, i);
      for (let k = 0; k < per; k++) {
        const t = k / per, u = 1 - t;
        out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
                  u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
      }
    }
    out.push(p[p.length - 1]);
    return out;
  }
  function polylineSamples(p, per = 10) {
    const out = [];
    for (let i = 0; i < p.length - 1; i++) for (let k = 0; k < per; k++) { const t = k / per; out.push([p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]); }
    out.push(p[p.length - 1]);
    return out;
  }
  function nearest(samples, pt) {
    let best = samples[0], bd = Infinity;
    for (const q of samples) { const d = (q[0] - pt[0]) ** 2 + (q[1] - pt[1]) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }

  // Resolve river geometry once: snap mouths onto parents or the coast, and overshoot so the join is hidden.
  let RIVER_GEOM = null;
  function riverGeometry() {
    if (RIVER_GEOM) return RIVER_GEOM;
    const byName = Object.fromEntries(RIVERS.map((r) => [r.name, r]));
    const resolved = {}, samples = {};
    const coastSamples = polylineSamples(COAST, 12);
    const overshoot = (pts, target, len) => {
      const prev = pts[pts.length - 2];
      const dx = target[0] - prev[0], dy = target[1] - prev[1], L = Math.hypot(dx, dy) || 1;
      return [target[0] + (dx / L) * len, target[1] + (dy / L) * len];
    };
    const resolve = (r) => {
      if (resolved[r.name]) return resolved[r.name];
      const pts = r.p.map((q) => q.slice());
      const last = pts[pts.length - 1];
      if (r.to === 'sea') {
        pts[pts.length - 1] = overshoot(pts, nearest(coastSamples, last), 8);   // into the sea; the sea is drawn on top
      } else if (r.to && r.to !== 'lake' && byName[r.to]) {
        resolve(byName[r.to]);
        pts[pts.length - 1] = overshoot(pts, nearest(samples[r.to], last), byName[r.to].w * 0.6); // under the parent's bank
      }
      resolved[r.name] = pts;
      samples[r.name] = splineSamples(pts);
      return pts;
    };
    for (const r of RIVERS) resolve(r);
    // draw order: tributaries first, parents on top of them
    const depth = (r) => (r.to && byName[r.to] ? 1 + depth(byName[r.to]) : 0);
    const order = [...RIVERS].sort((a, b) => depth(b) - depth(a));
    RIVER_GEOM = order.map((r) => ({ r, d: splinePath(resolved[r.name]) }));
    return RIVER_GEOM;
  }

  function river({ r, d }) {
    // dark bank underneath, lit water on top, thin highlight along the middle for the big rivers
    let out = `<path d="${d}" class="river-bank" style="stroke-width:${r.w + 2.4}"/>` +
      `<path d="${d}" class="river" style="stroke-width:${r.w}"/>`;
    if (r.w >= 3) out += `<path d="${d}" class="river-glint" style="stroke-width:${Math.max(0.8, r.w * 0.3)}"/>`;
    return out;
  }

  // Ray-casting point-in-polygon against the sea polygon.
  function isSea(x, y) {
    if (x >= W) return true;
    let inside = false;
    const P = SEA_POLY;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function svg() {
    seed = 20250904;
    const seaPoly = pts(SEA_POLY);
    const steppe = pts([[0, 0], [700, 0], [690, 100], [560, 80], [420, 70], [260, 90], [150, 130], [60, 260], [0, 300]]);
    return `
      <defs>
        <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b3526"/><stop offset="0.45" stop-color="#34342a"/><stop offset="1" stop-color="#2c3a2c"/>
        </linearGradient>
        <radialGradient id="seaGrad" cx="0.7" cy="0.5" r="0.8">
          <stop offset="0" stop-color="#244a5e"/><stop offset="1" stop-color="#162d3b"/>
        </radialGradient>
        <pattern id="dunes" width="14" height="10" patternUnits="userSpaceOnUse">
          <path d="M0,7 Q3.5,3 7,7 T14,7" fill="none" stroke="rgba(230,200,140,0.18)" stroke-width="1"/>
        </pattern>
        <pattern id="waves" width="40" height="18" patternUnits="userSpaceOnUse">
          <path d="M0,9 Q10,4 20,9 T40,9" fill="none" stroke="rgba(160,210,235,0.10)" stroke-width="1"/>
        </pattern>
        <filter id="coastGlow"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="7"/></filter>
        <clipPath id="landClip"><path clip-rule="evenodd" d="M0,0 H${W} V${H} H0 Z M${SEA_POLY.map((p) => p.join(',')).join(' L')} Z"/></clipPath>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#landGrad)"/>
      <polygon points="${steppe}" fill="#4a4030" opacity="0.75"/>
      <polygon points="${steppe}" fill="url(#dunes)"/>
      <ellipse cx="880" cy="880" rx="520" ry="230" fill="#2f5a34" opacity="0.18"/>
      <ellipse cx="330" cy="620" rx="150" ry="120" fill="#3f6a3a" opacity="0.14"/>
      <g id="territory-slot"></g>
      <g class="mountains">${RANGES.map(range).join('')}${plateau(PLATEAU)}</g>
      <g class="rivers">${riverGeometry().map(river).join('')}${LAKES.map((l) => `<ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}" class="lake"/>`).join('')}</g>
      <polygon points="${seaPoly}" fill="#8fc3dc" opacity="0.35" filter="url(#coastGlow)"/>
      <polygon points="${seaPoly}" fill="url(#seaGrad)"/>
      <polygon points="${seaPoly}" fill="url(#waves)"/>
      <polyline points="${pts(COAST)}" class="coast"/>
      <polyline points="${pts(WALL)}" class="wall"/>
      <g class="geo-labels">${LABELS.map(([t, x, y, rot, size]) => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" style="font-size:${size}px">${t}</text>`).join('')}</g>`;
  }

  return { svg, W, H, isSea, smoothPath };
})();
