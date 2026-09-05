// ============================================================
//  UI layer: start screen, map, panels, dialogs
// ============================================================

const UI = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = Game.fmt;
  const FREE_COLOR = '#6b6b52';
  const ITEM_ICON = { weapon: '⚔', horse: '🐎', book: '📜', seal: '🜲', armor: '🛡' };
  const itemBadge = (o) => Game.itemsOf(o.name).map((it) => `<span class="item-badge" title="${esc(it.name)}: ${esc(it.desc)}">${ITEM_ICON[it.type] || '✦'}</span>`).join('');
  const SKILL_ABBR = { cavalry: 'Cav', naval: 'Nav', siege: 'Sge', stratagem: 'Str', guardian: 'Grd', admin: 'Adm', orator: 'Ora' };
  const skillTags = (o) => (o.skills || []).map((s) => `<span class="skill-tag" title="${esc(SKILL_INFO[s].label)}: ${esc(SKILL_INFO[s].desc)}">${SKILL_ABBR[s] || s}</span>`).join('');
  const rankTag = (o) => (o.rank ? `<span class="rank-tag" title="Court rank: ${esc(Game.RANKS[o.rank])}">${Game.RANKS[o.rank][0]}</span> ` : '');
  const tieNote = (o) => { const g = Game.bondGroup(o.name); const parts = []; if (g) parts.push('bound to ' + g.filter((n) => n !== o.name).join(', ')); return parts.length ? `<span class="hint" title="${esc(parts.join('; '))}"> ⛓</span>` : ''; };

  let selected = null;
  let modalHandlers = {};
  let modalLocked = false;

  // ---------- boot ----------
  let scenarioId = '190';
  function init() {
    const sel = $('#scenario-select');
    sel.innerHTML = SCENARIOS.map((sc) => `<option value="${sc.id}">${sc.year} AD — ${esc(sc.title)}</option>`).join('');
    try { const saved = localStorage.getItem('rotk_scenario'); if (saved && SCENARIOS.some((sc) => sc.id === saved)) { sel.value = saved; scenarioId = saved; } } catch (e) { /* ignore */ }
    const applyScenarioText = () => { const sc = SCENARIOS.find((x) => x.id === scenarioId); $('#scenario-title').textContent = sc.title; $('#scenario-intro').textContent = sc.intro; renderStart(); };
    sel.addEventListener('change', () => { scenarioId = sel.value; try { localStorage.setItem('rotk_scenario', scenarioId); } catch (e) { /* ignore */ } applyScenarioText(); });
    applyScenarioText();
    $('#btn-continue').hidden = !Game.hasSave();
    $('#btn-continue').addEventListener('click', () => { if (Game.load()) { selected = null; showGame(); } else { alert('That save comes from an older map and cannot be loaded.'); $('#btn-continue').hidden = true; } });
    $('#btn-endturn').addEventListener('click', endTurn);
    $('#btn-overview').addEventListener('click', showOverview);
    $('#btn-officers').addEventListener('click', showOfficers);
    $('#btn-save').addEventListener('click', () => { Game.save(); Game.log('Game saved.', 'sys'); renderLog(); toast('Game saved.'); });
    $('#btn-menu').addEventListener('click', () => { stopAuto(); showMenu(); });
    $('#btn-diplomacy').addEventListener('click', showDiplomacy);
    $('#btn-objectives').addEventListener('click', showObjectives);
    $('#btn-stats').addEventListener('click', showStats);
    $('#btn-wiki').addEventListener('click', () => showWiki());
    $('#btn-help').addEventListener('click', showHelp);
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('game-screen').hidden) return;
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const modalOpen = !$('#modal').hidden;
      const k = e.key;
      if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); if (!modalOpen) showHelp(); return; }
      if (modalOpen) return;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); endTurn(); }
      else if (k === 'o' || k === 'O') showObjectives();
      else if (k === 'd' || k === 'D') showDiplomacy();
      else if (k === 'r' || k === 'R') showOverview();
      else if (k === 'f' || k === 'F') showOfficers();
      else if (k === 's' || k === 'S') showStats();
      else if (k === 'l' || k === 'L') showWiki();
      else if (k === 'm' || k === 'M') showMenu();
      else if (k === '+' || k === '=') zoomAt(1.3, VB.x + VB.w / 2, VB.y + VB.h / 2);
      else if (k === '-' || k === '_') zoomAt(1 / 1.3, VB.x + VB.w / 2, VB.y + VB.h / 2);
      else if (k === 'Home' || k === '0') resetView();
      else if (k.startsWith('Arrow')) { const step = VB.w * 0.08; if (k === 'ArrowLeft') VB.x -= step; if (k === 'ArrowRight') VB.x += step; if (k === 'ArrowUp') VB.y -= step; if (k === 'ArrowDown') VB.y += step; clampView(); applyViewBox(); e.preventDefault(); }
      else if (k === 'Tab') { e.preventDefault(); const S = Game.state(); if (S.observer) return; const mine = Game.factionProvinces(S.player).filter((p) => Game.idleOfficers(p.id).length); if (!mine.length) return; const i = mine.findIndex((p) => p.id === selected); selected = mine[(i + 1) % mine.length].id; renderMap(); renderPanel(); }
    });
    $('#btn-auto').addEventListener('click', toggleAuto);
    initAutoSpeed();
    $('#btn-observe').addEventListener('click', () => startGame(null));
    initMapControls();
    initTooltip();
    $('#map').addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const g = e.target.closest('.prov');
      if (!g) return;
      selected = g.dataset.id;
      renderMap(); renderPanel();
    });
    $('#modal-box').addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && modalHandlers[el.dataset.act]) { modalHandlers[el.dataset.act](el, e); return; }
      const bio = e.target.closest('.bio-link'); if (bio) { showWiki(bio.dataset.bio); return; }
      const li = e.target.closest('.pick li');
      if (li) togglePick(li);
    });
    $('#modal-box').addEventListener('input', (e) => { if (modalHandlers.oninput) modalHandlers.oninput(e); });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !modalLocked) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalLocked) closeModal(); });
  }

  function factionStrength(f) {
    const cities = f.cities.reduce((s, c) => s + PROVINCES.find((p) => p.id === c).tier * 8, 0);
    const officers = OFFICERS.filter((o) => o[6] === f.id).reduce((s, o) => s + (o[1] + o[2] + o[3] + o[4] + o[5]) / 50, 0);
    return cities + officers;
  }

  function renderStart() {
    const sc = SCENARIOS.find((x) => x.id === scenarioId);
    const list = sc.base ? FACTIONS : Object.entries(sc.houses).filter(([id, h]) => !h.dead && (h.cities && h.cities.length || h.guestOf)).map(([id, h]) => { const base = FACTIONS.find((f) => f.id === id); return { id, name: h.name || (base ? base.name : id), color: h.color || (base ? base.color : '#888'), cities: (h.cities || []).map((c) => c.replace('?', '')), blurb: base ? base.blurb : 'A house of this age.', playable: base ? base.playable : true, guestOf: h.guestOf, officers: (h.officers || []).length }; });
    const strength = (f) => (sc.base ? factionStrength(f) : f.cities.length * 10 + f.officers * 2);
    const ranked = [...list].sort((a, b) => strength(b) - strength(a));
    const grid = $('#faction-grid');
    grid.innerHTML = list.map((f) => {
      const rank = ranked.indexOf(f);
      const stars = 1 + Math.floor((rank / list.length) * 5);
      const n = sc.base ? OFFICERS.filter((o) => o[6] === f.id).length : f.officers;
      const cities = f.cities.length ? f.cities.map((c) => (PROVINCES.find((p) => p.id === c) || { name: c }).name).join(', ') : (f.guestOf ? `in exile under ${esc((FACTIONS.find((x) => x.id === f.guestOf) || {}).name || f.guestOf)}` : 'no cities');
      return `<div class="fcard${f.playable === false ? ' fcard-npc' : ''}" style="--fc:${f.color}" data-fid="${f.id}">
        <span class="fstars" title="${f.playable === false ? 'Not playable' : 'Difficulty'}">${f.playable === false ? 'AI only' : '★'.repeat(stars) + '☆'.repeat(5 - stars)}</span>
        <h3>${esc(f.name)}</h3>
        <div class="fmeta">${esc(cities)} · ${n} officers</div>
        <div class="fblurb">${esc(f.blurb)}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.fcard:not(.fcard-npc)').forEach((c) => c.addEventListener('click', () => startGame(c.dataset.fid)));
  }

  function startGame(fid) {
    Game.newGame(fid, { historicalDeaths: $('#opt-hist-deaths').checked, difficulty: $('#opt-difficulty').value, scenario: scenarioId });
    if (!fid) {
      selected = null;
      showGame();
      // (observer)
      openModal(`<h3>Observer mode</h3>
        <p>Every warlord is played by the AI. Step through the months with <b>Next Month</b>, or press <b>Auto</b> to let the era unfold on its own. Click any city to inspect it, and use <b>Realm</b>, <b>Officers</b> and <b>Diplomacy</b> to follow the balance of power.</p>
        <div class="modal-actions"><button class="btn btn-gold" data-act="close">Watch</button></div>`, { close: closeModal });
      return;
    }
    const f = FACTIONS.find((x) => x.id === fid) || { name: Game.fname(fid), blurb: 'A house of this age.' };
    const home = Game.factionProvinces(fid)[0];
    selected = home ? home.id : null;
    showGame();
    openModal(`<h3>${esc(Game.fname(fid))}</h3>
      <p>${esc(f.blurb)}</p>
      <p><b>How to play.</b> Each month, every officer in a city may perform one command: develop the land, recruit and train soldiers, search for gold, recruit wandering talents, or lead an army against a neighbouring city. Gold comes from commerce, food from agriculture. Soldiers eat food every month, and hungry soldiers desert.</p>
      <p>Battles are decided by troop numbers, the <b>WAR</b> and <b>LDR</b> of the commanders, training, and the city's walls. A commander with high <b>INT</b> may spring stratagems. Duels between champions can swing morale.</p>
      <p>Use <b>Diplomacy</b> to send envoys: a ceasefire buys ${Game.CEASEFIRE_MONTHS} months of peace, an alliance binds both houses for ${Game.ALLIANCE_MONTHS / 12} years (renewable in its last year), and allies can be asked to join your wars. Gifts warm relations. Breaking a treaty stains your name with every lord.</p>
      <p>Officers age, grow and die. ${Game.getOption('historicalDeaths') ? 'Scripted historical deaths are <b>on</b>: the famous will fall on their historical dates unless war takes them first.' : 'Scripted historical deaths are <b>off</b>: fate is left to chance.'} When a lord dies, an heir takes the seat.</p>
      <p>Keep your officers loyal with rewards, capture enemy officers and win them over, and unite all ${Object.keys(Game.state().provinces).length} cities of the land.</p>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Begin</button></div>`, { close: closeModal });
  }

  function showGame() {
    $('#start-screen').hidden = true;
    $('#game-screen').hidden = false;
    ensureMapBase();
    resetView();
    renderAll();
  }

  function backToMenu() {
    stopAuto();
    $('#game-screen').hidden = true;
    $('#start-screen').hidden = false;
    $('#btn-continue').hidden = !Game.hasSave();
  }

  // ---------- rendering ----------
  function renderAll() { renderTop(); renderMap(); renderPanel(); renderLog(); }

  function renderTop() {
    const S = Game.state();
    $('#tb-date').textContent = `${Game.dateStr()} · ${Game.season()}`;
    $('#btn-auto').hidden = !S.observer;
    $('#auto-speed').hidden = !S.observer;
    $('#auto-pause-wrap').hidden = !S.observer;
    $('#btn-endturn').textContent = S.observer ? 'Next Month ▶' : 'End Month ▶';
    if (S.observer) {
      const alive = Object.values(S.factions).filter((f) => f.alive);
      const all = Object.values(S.provinces);
      $('#tb-faction').innerHTML = `👁 Observer`;
      $('#tb-stats').innerHTML = [
        ['Houses', alive.length], ['Free cities', all.filter((p) => !p.owner).length], ['Troops', fmt(all.reduce((s, p) => s + p.troops, 0))],
        ['Officers', Object.values(S.officers).filter((o) => o.faction && !o.captive).length],
        ['Treaties', Object.entries(S.diplomacy).filter(([k, d]) => d.status !== 'neutral' && k.split('|').every((f) => S.factions[f].alive)).length],
      ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
      return;
    }
    const f = Game.fac(S.player);
    $('#tb-faction').innerHTML = `<span class="chip" style="background:${f.color}"></span>${esc(f.name)}${f.title ? ` <small class="persona" title="Your title; it lends legitimacy to envoys and recruitment and allows ${Game.titleOf(S.player).slots} generals">${esc(Game.titleOf(S.player).name)}</small>` : ''}${f.hasEmperor ? ' <span title="The Emperor is at your court">👑</span>' : ''}${f.guest ? ` <span class="observer-badge" title="In exile">guest of ${esc(Game.fname(f.host))}</span>` : ''}`;
    const provs = Game.factionProvinces(S.player);
    const sum = (k) => provs.reduce((s, p) => s + p[k], 0);
    const idle = provs.reduce((s, p) => s + Game.idleOfficers(p.id).length, 0);
    $('#tb-stats').innerHTML = [
      ['Cities', provs.length], ['Troops', fmt(sum('troops'))], ['Gold', fmt(sum('gold'))], ['Food', fmt(sum('food'))],
      ['Officers', Game.factionOfficers(S.player).length], ['Idle', f.guest ? Game.factionOfficers(S.player).filter((o) => !o.acted).length : idle], ['Prestige', f.prestige || 0],
      ...(f.guest ? [['Favour', f.favor], ['Household', fmt(f.household.troops)]] : []),
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  }

  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
  }

  // ---------- map: static terrain + dynamic layer, pan & zoom ----------
  const VB = { x: 0, y: 0, w: TERRAIN.W, h: TERRAIN.H };
  let suppressClick = false;

  function ensureMapBase() {
    const svg = $('#map');
    if (!svg.querySelector('#terrain')) {
      svg.innerHTML = `<g id="terrain">${TERRAIN.svg()}</g><g id="dyn"></g>`;
      applyViewBox();
    }
  }

  function renderMap() {
    ensureMapBase();
    const S = Game.state();
    const pos = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));
    let roads = '', glyphs = '';
    const GLYPH = { pass: '▲', river: '≋', sea: '≋' };
    for (const [a, b, type, via] of ROADS) {
      const hl = selected && (a === selected || b === selected);
      const mods = Game.battleModifiers(a, b);
      const points = [[pos[a].x, pos[a].y], ...(via || []), [pos[b].x, pos[b].y]];
      roads += `<path class="road road-${type}${hl ? ' hl' : ''}${mods.blocked ? ' closed' : ''}" d="${TERRAIN.smoothPath(points)}"/>`;
      if (type !== 'plain') {
        const mid = via && via.length ? via[Math.floor((via.length - 1) / 2)] : [(pos[a].x + pos[b].x) / 2, (pos[a].y + pos[b].y) / 2];
        glyphs += `<text class="road-glyph g-${type}${mods.blocked ? ' closed' : ''}" x="${mid[0]}" y="${mid[1] + 4}" text-anchor="middle">${mods.blocked ? '❄' : GLYPH[type]}</text>`;
      }
    }
    roads += glyphs;
    renderTerritory();
    const selOwner = selected ? Game.prov(selected).owner : null;
    let nodes = '';
    for (const P of PROVINCES) {
      const p = S.provinces[P.id];
      const color = p.owner ? Game.fac(p.owner).color : FREE_COLOR;
      const cls = ['prov'];
      if (P.id === selected) cls.push('selected');
      if (!S.observer && selected && selOwner === S.player && S.adj[selected].includes(P.id) && p.owner !== S.player && Game.canAttack(S.player, p.owner)) cls.push('target');
      if (isDark(color)) cls.push('dark');
      const officers = p.owner ? Game.officersIn(P.id, p.owner).length : 0;
      const hasRuler = p.owner && Game.rulerOf(p.owner).city === P.id;
      nodes += `<g class="${cls.join(' ')}" data-id="${P.id}" transform="translate(${P.x},${P.y})">
        <rect x="-48" y="-21" width="96" height="42" rx="6" fill="${color}"/>
        <text class="pn" text-anchor="middle" y="-4">${hasRuler ? '★ ' : ''}${esc(P.name)}</text>
        <text class="pt" text-anchor="middle" y="12">⚔ ${fmt(p.troops)}${officers ? `  ☗ ${officers}` : ''}</text>
      </g>`;
    }
    $('#dyn').innerHTML = roads + nodes;
    renderLegend();
  }

  // Territory shading: a coarse grid of land cells, each tinted by the nearest city's owner.
  let TERR_CELLS = null;
  const CELL = 22, REACH = 150;
  function territoryCells() {
    if (TERR_CELLS) return TERR_CELLS;
    TERR_CELLS = [];
    for (let y = 0; y < TERRAIN.H; y += CELL) for (let x = 0; x < TERRAIN.W; x += CELL) {
      const cx = x + CELL / 2, cy = y + CELL / 2;
      if (TERRAIN.isSea(cx, cy)) continue;
      let best = null, bd = REACH * REACH;
      for (const P of PROVINCES) { const d = (P.x - cx) ** 2 + (P.y - cy) ** 2; if (d < bd) { bd = d; best = P.id; } }
      if (best) TERR_CELLS.push({ x, y, city: best });
    }
    return TERR_CELLS;
  }
  let showTerritory = false;
  try { showTerritory = localStorage.getItem('rotk_territory') === '1'; } catch (e) { /* storage unavailable */ }
  function setTerritory(on) {
    showTerritory = !!on;
    try { localStorage.setItem('rotk_territory', on ? '1' : '0'); } catch (e) { /* ignore */ }
    const b = $('#toggle-territory');
    if (b) { b.classList.toggle('on', showTerritory); b.title = `Territory shading (${showTerritory ? 'on' : 'off'})`; }
    renderTerritory();
  }
  function renderTerritory() {
    const S = Game.state();
    const slot = $('#territory-slot'); if (!slot) return;
    if (!showTerritory) { slot.innerHTML = ''; return; }
    const paths = {};
    for (const c of territoryCells()) {
      const owner = S.provinces[c.city].owner; if (!owner) continue;
      paths[owner] = (paths[owner] || '') + `M${c.x},${c.y}h${CELL}v${CELL}h-${CELL}z`;
    }
    slot.innerHTML = `<g clip-path="url(#landClip)"><g filter="url(#soft)">${Object.entries(paths).map(([f, d]) => `<path d="${d}" fill="${Game.fac(f).color}" class="terr"/>`).join('')}</g></g>`;
  }

  function renderLegend() {
    const S = Game.state();
    $('#legend').innerHTML = Object.values(S.factions).filter((f) => f.alive)
      .map((f) => `<span class="lg"><i style="background:${f.color}"></i>${esc(f.name)}</span>`).join('') +
      `<span class="lg"><i style="background:${FREE_COLOR}"></i>Unclaimed</span>`;
  }

  // ---------- hover tooltip ----------
  function tooltipHtml(pid) {
    const S = Game.state();
    const p = Game.prov(pid), P = PROVINCES.find((x) => x.id === pid);
    const offs = p.owner ? Game.officersIn(pid, p.owner) : [];
    const color = p.owner ? Game.fac(p.owner).color : FREE_COLOR;
    let html = `<div class="tt-head"><span class="chip" style="background:${color}"></span><b>${esc(P.name)}</b><span class="tt-owner">${esc(Game.fname(p.owner))}</span></div>
      <div class="tt-row">⚔ ${fmt(p.troops)} troops · walls ${p.defense} · training ${p.training}${Game.hasShipyard(p) ? ` · fleet ${p.fleet}` : ''}</div>
      <div class="tt-row">gold ${fmt(p.gold)} · food ${fmt(p.food)} · pop ${fmt(p.pop)}</div>`;
    if (p.traits && p.traits.length) html += `<div class="tt-row tt-traits">${p.traits.map((t) => `<span class="trait" title="${esc(TRAIT_INFO[t].desc)}">${esc(TRAIT_INFO[t].label)}</span>`).join('')}</div>`;
    if (offs.length) { const gov = Game.governorOf(p); html += `<div class="tt-row tt-offs">${offs.map((o) => `${Game.isRuler(o) ? '★ ' : ''}${gov && gov.name === o.name ? '⚖ ' : ''}${esc(o.name)}${Game.itemsOf(o.name).length ? ' ' + Game.itemsOf(o.name).map((it) => ITEM_ICON[it.type] || '✦').join('') : ''}`).join(', ')}</div>`; }
    const free = Game.freeOfficersIn(pid);
    if (free.length) html += `<div class="tt-row tt-free">Unaffiliated: ${free.map((o) => esc(o.name)).join(', ')}</div>`;
    if (!S.observer && p.owner && p.owner !== S.player) {
      const rel = Game.relation(S.player, p.owner);
      html += `<div class="tt-row"><span class="rel-${Game.relationWord(rel)}">${Game.relationWord(rel)} (${rel})</span> · ${treatyLabel(S.player, p.owner)}</div>`;
    }
    if (selected && selected !== pid && S.adj[selected].includes(pid)) {
      const m = Game.battleModifiers(selected, pid);
      const t = Game.roadType(selected, pid);
      html += `<div class="tt-row tt-road">Road from ${esc(Game.pname(selected))}: ${t}${m.blocked ? ' — ' + esc(m.blocked) : ''}${m.notes.length && !m.blocked ? '<br>' + m.notes.map(esc).join('<br>') : ''}</div>`;
    }
    return html;
  }
  function initTooltip() {
    const tip = $('#tip'), wrap = $('#map-wrap'), svg = $('#map');
    let cur = null;
    svg.addEventListener('pointerover', (e) => { const g = e.target.closest('.prov'); if (g) { cur = g.dataset.id; tip.innerHTML = tooltipHtml(cur); tip.hidden = false; } });
    svg.addEventListener('pointermove', (e) => {
      if (tip.hidden) return;
      const g = e.target.closest('.prov');
      if (!g) { tip.hidden = true; cur = null; return; }
      if (g.dataset.id !== cur) { cur = g.dataset.id; tip.innerHTML = tooltipHtml(cur); }
      const r = wrap.getBoundingClientRect();
      let x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
      if (x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 12;
      if (y + tip.offsetHeight > r.height - 8) y = e.clientY - r.top - tip.offsetHeight - 12;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    svg.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.prov')) { tip.hidden = true; cur = null; } });
    svg.addEventListener('pointerdown', () => { tip.hidden = true; });
  }

  function applyViewBox() { $('#map').setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`); }
  function clampView() {
    VB.x = Math.max(-VB.w * 0.6, Math.min(TERRAIN.W - VB.w * 0.4, VB.x));
    VB.y = Math.max(-VB.h * 0.6, Math.min(TERRAIN.H - VB.h * 0.4, VB.y));
  }
  function zoomAt(factor, cx, cy) {
    const nw = Math.max(TERRAIN.W / 6, Math.min(TERRAIN.W * 1.4, VB.w / factor));
    const f = VB.w / nw;
    VB.x = cx - (cx - VB.x) / f; VB.y = cy - (cy - VB.y) / f;
    VB.w = nw; VB.h = VB.h / f;
    clampView(); applyViewBox();
  }
  function resetView() { VB.x = 0; VB.y = 0; VB.w = TERRAIN.W; VB.h = TERRAIN.H; applyViewBox(); }
  function svgPoint(clientX, clientY) {
    const svg = $('#map'); const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function unitsPerPixel() { const r = $('#map').getBoundingClientRect(); return Math.max(VB.w / r.width, VB.h / r.height); }

  function initMapControls() {
    const svg = $('#map');
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = svgPoint(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });
    const pointers = new Map();
    let dragStart = null, pinchStart = null;
    svg.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, vx: VB.x, vy: VB.y, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), w: VB.w, h: VB.h, mid: svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2) };
        dragStart = null;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const f = dist / pinchStart.dist;
        const nw = Math.max(TERRAIN.W / 6, Math.min(TERRAIN.W * 1.4, pinchStart.w / f));
        const real = pinchStart.w / nw;
        VB.w = nw; VB.h = pinchStart.h / real;
        VB.x = pinchStart.mid.x - (pinchStart.mid.x - VB.x) / 1; VB.y = pinchStart.mid.y - (pinchStart.mid.y - VB.y) / 1;
        clampView(); applyViewBox();
        return;
      }
      if (dragStart) {
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        if (!dragStart.moved && Math.hypot(dx, dy) > 4) { dragStart.moved = true; svg.classList.add('dragging'); }
        if (dragStart.moved) {
          const upp = unitsPerPixel();
          VB.x = dragStart.vx - dx * upp; VB.y = dragStart.vy - dy * upp;
          clampView(); applyViewBox();
        }
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (dragStart && dragStart.moved) suppressClick = true;
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) { dragStart = null; svg.classList.remove('dragging'); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    $('#zoom-in').addEventListener('click', () => zoomAt(1.3, VB.x + VB.w / 2, VB.y + VB.h / 2));
    $('#zoom-out').addEventListener('click', () => zoomAt(1 / 1.3, VB.x + VB.w / 2, VB.y + VB.h / 2));
    $('#zoom-reset').addEventListener('click', resetView);
    $('#toggle-territory').addEventListener('click', () => setTerritory(!showTerritory));
    setTerritory(showTerritory);
  }

  function loyClass(l) { return l < 50 ? 'loy-lo' : l < 80 ? 'loy-ok' : 'loy-hi'; }

  function officerTable(list, opts = {}) {
    if (!list.length) return '<div class="hint">No officers here.</div>';
    return `<table class="off"><tr><th>Name</th><th>Age</th><th>LDR</th><th>WAR</th><th>INT</th><th>POL</th><th>CHR</th>${opts.loyalty ? '<th>LOY</th>' : ''}${opts.city ? '<th>City</th>' : ''}${opts.faction ? '<th>House</th>' : ''}${opts.status ? '<th></th>' : ''}</tr>
      ${list.map((o) => `<tr class="${o.acted && opts.status ? 'acted' : ''}">
        <td class="n">${Game.isRuler(o) ? '<span class="crown">★</span> ' : ''}${rankTag(o)}<span class="${BIOS[o.name] ? 'bio-link' : ''}" data-bio="${esc(o.name)}">${esc(o.name)}</span>${itemBadge(o)}${skillTags(o)}</td>
        <td class="num">${Game.age(o)}</td>
        <td class="num">${o.ldr}</td><td class="num">${o.war}</td><td class="num">${o.int}</td><td class="num">${o.pol}</td><td class="num">${o.chr}</td>
        ${opts.loyalty ? `<td class="num ${loyClass(o.loyalty)}">${Game.isRuler(o) ? '—' : o.loyalty}</td>` : ''}
        ${opts.city ? `<td>${esc(Game.pname(o.city))}</td>` : ''}
        ${opts.faction ? `<td><span class="chip" style="background:${o.faction ? Game.fac(o.faction).color : FREE_COLOR}"></span> ${esc(Game.fname(o.faction))}</td>` : ''}
        ${opts.status ? `<td>${o.acted ? 'done' : ''}</td>` : ''}
      </tr>`).join('')}</table>`;
  }

  function renderPanel() {
    const S = Game.state();
    if (!selected) { $('#panel').innerHTML = overviewHtml(); bindPanel(); return; }
    const p = Game.prov(selected);
    const P = PROVINCES.find((x) => x.id === selected);
    const mine = !S.observer && p.owner === S.player;
    const ownerColor = p.owner ? Game.fac(p.owner).color : FREE_COLOR;
    const income = Math.floor(p.comm * 1.2 + p.pop / 5000) - Math.floor(p.troops * 0.01);
    const harvest = Math.floor(p.agri * 4);
    const upkeep = Math.floor(p.troops * 0.1);
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div>`;

    const meGuest = !S.observer && S.factions[S.player].guest;
    let html = `${meGuest ? '<div class="hint"><a href="#" id="back-exile">◂ Back to your household in exile</a></div>' : ''}<div class="ph"><h2>${esc(P.name)}</h2><div class="owner"><span class="chip" style="background:${ownerColor}"></span>${esc(Game.fname(p.owner))}</div></div>${CITY_NOTES[P.id] ? `<div class="hint" style="font-style:italic">${esc(CITY_NOTES[P.id])}</div>` : ''}
      <div class="grid2">
        <div class="kv"><span>Troops</span><b>${fmt(p.troops)}</b></div>
        <div class="kv"><span>Training</span><b>${p.training}</b></div>
        <div class="kv"><span>Gold</span><b>${fmt(p.gold)} <small style="color:var(--muted)">(+${fmt(income)}/mo)</small></b></div>
        <div class="kv"><span>Food</span><b>${fmt(p.food)} <small style="color:var(--muted)">(${harvest - upkeep >= 0 ? '+' : ''}${fmt(harvest - upkeep)}/mo)</small></b></div>
        <div><div class="kv"><span>Agriculture</span><b>${p.agri}</b></div>${bar(p.agri, 999)}</div>
        <div><div class="kv"><span>Commerce</span><b>${p.comm}</b></div>${bar(p.comm, 999)}</div>
        <div><div class="kv"><span>Walls</span><b>${p.defense}</b></div>${bar(p.defense, 999)}</div>
        <div class="kv"><span>Population</span><b>${fmt(p.pop)}</b></div>
        ${Game.hasShipyard(p) ? `<div><div class="kv"><span>Fleet</span><b>${p.fleet}</b></div>${bar(p.fleet, 100)}</div>` : ''}
        <div><div class="kv"><span>Order</span><b class="${p.order < 30 ? 'loy-lo' : p.order < 60 ? 'loy-ok' : 'loy-hi'}" title="Below 60 income suffers; below 30 no levies; below 20 revolt is possible">${p.order}</b></div>${bar(p.order, 100)}</div>
        <div class="kv"><span>Trade links</span><b title="Adjacent cities of your house or allies; each adds 8% income. A hostile border costs 10%.">${p.tradeLinks || 0}${p.hostileBorder ? ' · front' : ''}</b></div>
      </div>
      ${p.traits && p.traits.length ? `<div class="traits">${p.traits.map((t) => `<span class="trait" title="${esc(TRAIT_INFO[t].desc)}">${esc(TRAIT_INFO[t].label)}</span>`).join('')}</div>` : ''}`;

    const offs = p.owner ? Game.officersIn(selected, p.owner) : [];
    const gov = Game.governorOf(p);
    html += `<div class="sec">Officers (${offs.length})${gov ? ` · governor ${esc(gov.name)} <span class="hint" title="The highest-POL officer present governs: +${(gov.pol / 10).toFixed(0)}% income${gov.ldr >= 60 ? `, defence ×${(1 + gov.ldr / 1000).toFixed(2)}` : ''}">(POL ${gov.pol})</span>` : ''}</div>${officerTable(offs, { loyalty: mine, status: mine })}`;

    const guests = Object.values(S.officers).filter((o) => o.city === selected && o.faction && o.faction !== p.owner && !o.captive && S.factions[o.faction].guest);
    if (guests.length) {
      const byHouse = {};
      for (const g of guests) (byHouse[g.faction] = byHouse[g.faction] || []).push(g);
      for (const [fid, list] of Object.entries(byHouse)) html += `<div class="sec">Guests: the house of ${esc(Game.fname(fid))} in exile</div>${officerTable(list)}`;
    }
    const free = Game.freeOfficersIn(selected);
    if (free.length) {
      html += `<div class="sec">Unaffiliated talents</div>${officerTable(free)}`;
      if (mine) html += `<div class="cmds">${free.map((o) => `<button data-cmd="recruitOfficer" data-target="${esc(o.name)}">Recruit ${esc(o.name)}</button>`).join('')}</div>`;
    }
    if (mine) {
      const caps = Game.captivesIn(selected, S.player);
      if (caps.length) html += `<div class="sec">Prisoners</div><div class="hint">${caps.map((c) => esc(c.name)).join(', ')} (awaiting judgement)</div>`;
    }

    if (mine) {
      const idle = Game.idleOfficers(selected);
      const canAttack = Game.enemyNeighbors(selected).some((n) => Game.canAttack(S.player, n.owner) && !Game.battleModifiers(selected, n.id).blocked);
      const canMove = Game.neighbors(selected).some((n) => n.owner === S.player);
      html += `<div class="sec">Commands</div>
        <div class="row" style="margin:2px 0 6px"><label title="Standing order for when this city is attacked">Defence</label><select data-posture="1"><option value="hold" ${p.posture === 'hold' ? 'selected' : ''}>Hold the walls (+8%)</option><option value="sally" ${p.posture === 'sally' ? 'selected' : ''}>Sally out (attackers lose more, walls count less)</option><option value="ambush" ${p.posture === 'ambush' ? 'selected' : ''}>Ambush (needs a cleverer commander than theirs)</option></select></div>
        <div class="hint">${idle.length ? `${idle.length} officer${idle.length > 1 ? 's' : ''} ready to act.` : 'All officers have acted this month.'}</div>
        <div class="cmds">
          <button data-cmd="agri" ${!idle.length ? 'disabled' : ''}>Farm (${Game.COST.develop}g)</button>
          <button data-cmd="comm" ${!idle.length ? 'disabled' : ''}>Trade (${Game.COST.develop}g)</button>
          <button data-cmd="fortify" ${!idle.length ? 'disabled' : ''}>Fortify (${Game.COST.fortify}g)</button>
          <button data-cmd="train" ${!idle.length ? 'disabled' : ''}>Train</button>
          <button data-cmd="recruit" ${!idle.length ? 'disabled' : ''}>Conscript (${Game.COST.recruit}g)</button>
          <button data-cmd="search" ${!idle.length ? 'disabled' : ''}>Search</button>
          <button data-cmd="reward">Reward (${Game.COST.reward}g)</button>
          <button data-cmd="pacify" ${!idle.length ? 'disabled' : ''} title="Restore order">Pacify (${Game.COST.pacify}g)</button>
          <button data-cmd="appoint" title="Grant a court rank">Appoint rank</button>
          <button data-cmd="plot" ${!idle.length || !Game.plotTargets(selected).length ? 'disabled' : ''} title="Schemes against a neighbouring city">Plot</button>
          <button data-cmd="bestow" ${offs.some((o) => Game.itemsOf(o.name).length) && offs.length > 1 ? '' : 'disabled'} title="Give a treasure to another officer here">Bestow treasure</button>
          <button data-cmd="buyfood" ${p.gold <= 0 ? 'disabled' : ''}>Buy Food</button>
          ${Game.hasShipyard(p) ? `<button data-cmd="ships" ${!idle.length ? 'disabled' : ''}>Build Ships (${Game.COST.ships}g)</button><button data-cmd="transfer" ${!canMove ? 'disabled' : ''}>Transfer</button>` : `<button data-cmd="transfer" class="wide" ${!canMove ? 'disabled' : ''}>Transfer</button>`}
          <button data-cmd="attack" class="wide btn-red" ${!idle.length || !canAttack ? 'disabled' : ''}>⚔ Attack</button>
        </div>`;
    } else {
      const from = S.observer || !Game.canAttack(S.player, p.owner) ? [] : Game.neighbors(selected).filter((n) => n.owner === S.player && Game.idleOfficers(n.id).length && !Game.battleModifiers(n.id, selected).blocked);
      if (from.length) {
        html += `<div class="sec">Attack from</div><div class="cmds">${from.map((n) => `<button class="btn-red" data-cmd="attackFrom" data-from="${n.id}">${esc(Game.pname(n.id))} (${fmt(n.troops)})</button>`).join('')}</div>`;
      }
      if (p.owner && p.owner !== S.player) {
        const fp = Game.factionProvinces(p.owner);
        html += `<div class="sec">${esc(Game.fname(p.owner))}</div><div class="hint">${fp.length} cities · ${fmt(Game.totalTroops(p.owner))} troops · ${Game.factionOfficers(p.owner).length} officers</div>`;
        if (!S.observer) {
          const rel = Game.relation(S.player, p.owner), st = Game.treatyStatus(S.player, p.owner);
          html += `<div class="hint">Relations: <span class="rel-${Game.relationWord(rel)}">${Game.relationWord(rel)} (${rel})</span> · <span class="st-${st}">${treatyLabel(S.player, p.owner)}</span></div>`;
        } else {
          const al = Game.allies(p.owner).map(Game.fname);
          html += `<div class="hint">Allies: ${al.length ? esc(al.join(', ')) : 'none'}</div>`;
        }
      }
    }
    $('#panel').innerHTML = html;
    bindPanel();
  }
  function bindPanel() {
    $('#panel').querySelectorAll('.bio-link').forEach((el) => el.addEventListener('click', () => showWiki(el.dataset.bio)));
    $('#panel').querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => command(b.dataset.cmd, b.dataset)));
    const post = $('#panel [data-posture]'); if (post) post.addEventListener('change', () => { const r = Game.setPosture(selected, post.value); toast(r.msg); });
    const back = $('#back-exile'); if (back) back.addEventListener('click', (e) => { e.preventDefault(); selected = null; renderMap(); renderPanel(); });
  }

  // ---------- exile: the house without a city ----------
  function exileHtml() {
    const S = Game.state(); const F = S.factions[S.player];
    const seat = Game.hostSeat(S.player);
    const offs = Game.factionOfficers(S.player);
    const idle = offs.filter((o) => !o.acted && Game.prov(o.city).owner === F.host);
    const host = Game.fac(F.host);
    const free = Game.freeOfficersIn(seat);
    const targets = Game.exileTargets(S.player);
    const hostCities = Game.factionProvinces(F.host).length;
    const favWord = F.favor >= 75 ? 'honoured guest' : F.favor >= 50 ? 'welcome' : F.favor >= 25 ? 'tolerated' : 'a burden';
    const bar = (v, max, color) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%;background:${color}"></i></div>`;
    let html = `<div class="ph"><h2>In exile</h2><div class="owner"><span class="chip" style="background:${host.color}"></span>guest of ${esc(host.name)}</div></div>
      <div class="hint">Your house has no city. It shelters at <b>${esc(Game.pname(seat))}</b>. Earn your host's favour and petition for a fief, gather a household army and seize a town of your own, or seek a better patron. After twelve years without a home the followers drift away.</div>
      <div class="grid2">
        <div><div class="kv"><span>Favour</span><b>${F.favor} · ${favWord}</b></div>${bar(F.favor, 100, F.favor >= 50 ? 'var(--green)' : 'var(--red)')}</div>
        <div class="kv"><span>Household troops</span><b>${fmt(F.household.troops)}</b></div>
        <div class="kv"><span>Household gold</span><b>${fmt(F.household.gold)}</b></div>
        <div class="kv"><span>Months in exile</span><b>${S.turn - F.guestSince}</b></div>
        <div class="kv"><span>Host's cities</span><b>${hostCities}</b></div>
        <div class="kv"><span>Prestige</span><b>${F.prestige || 0}</b></div>
      </div>
      <div class="sec">Officers (${offs.length})</div>${officerTable(offs, { loyalty: true, status: true })}`;
    if (free.length) html += `<div class="sec">Unaffiliated talents at court</div>${officerTable(free)}<div class="cmds">${free.map((o) => `<button data-cmd="exRecruit" data-target="${esc(o.name)}">Recruit ${esc(o.name)}</button>`).join('')}</div>`;
    const dis = idle.length ? '' : 'disabled';
    html += `<div class="sec">Actions</div>
      <div class="hint">${idle.length ? `${idle.length} officer${idle.length > 1 ? 's' : ''} ready to act.` : 'All officers have acted this month.'}</div>
      <div class="cmds">
        <button data-cmd="exServe" ${dis} title="Work for the host: favour and a stipend">Serve the host</button>
        <button data-cmd="exPetition" ${dis || (F.petitionUntil > S.turn || hostCities < 2 ? 'disabled' : '')} title="Ask for a fief">Petition for a fief${F.petitionUntil > S.turn ? ` (${F.petitionUntil - S.turn}m)` : ''}</button>
        <button data-cmd="exRaise" ${dis || (F.household.gold < 150 ? 'disabled' : '')} title="Gather volunteers (150 gold)">Raise volunteers</button>
        <button data-cmd="exFight" ${dis} title="Lead the host's men against his enemies">Fight for the host</button>
        <button data-cmd="exPatron" ${dis} title="Move the household to another lord's court">Seek a new patron</button>
        <button data-cmd="exSeize" class="btn-red" ${dis || (!targets.length || F.household.troops <= 0 ? 'disabled' : '')} title="Attack a neighbouring city with the household army">⚔ Seize a city</button>
      </div>
      ${targets.length ? `<div class="hint">Within reach of ${esc(Game.pname(seat))}: ${targets.map((t) => `${esc(Game.pname(t.id))} (${esc(Game.fname(t.owner))}, ${fmt(t.troops)})`).join('; ')}</div>` : `<div class="hint">No city within reach of ${esc(Game.pname(seat))} can be attacked from here.</div>`}`;
    return html;
  }

  function exileCommand(cmd, data) {
    const S = Game.state(); const F = S.factions[S.player];
    const idle = Game.factionOfficers(S.player).filter((o) => !o.acted && Game.prov(o.city).owner === F.host);
    const done = (r) => { if (!r.ok) { result(r); return; } renderAll(); showResult(r.msg, () => {}); };
    switch (cmd) {
      case 'exServe': return chooseOfficer('Serve the host', `Your officer works a month for <b>${esc(Game.fname(F.host))}</b>: he improves the host's city and earns favour (from <b>POL</b>) and a stipend for the household purse.`, idle, (o) => `favour +${Math.floor(2 + o.pol / 25 + (o.chr >= 80 ? 1 : 0))} · ${60 + o.pol}g`, (n) => done(Game.exileServe(S.player, n)));
      case 'exPetition': return chooseOfficer('Petition for a fief', `Send an envoy to ask <b>${esc(Game.fname(F.host))}</b> for a border town. Odds rest on favour (${F.favor}), the envoy's <b>CHR</b> and <b>POL</b>, your prestige and the size of the host's realm. Failure costs favour, and the host will not be asked again for six months.`, idle, (o) => `${Math.round(Game.petitionChance(S.player, o) * 100)}%`, (n) => done(Game.exilePetition(S.player, n)));
      case 'exRaise': return chooseOfficer('Raise volunteers', 'Spend 150 gold from the household purse to gather men to your banner. Numbers depend on <b>LDR</b> and <b>CHR</b>. A camp larger than half the host\'s garrison makes him uneasy.', idle, (o) => `≈ ${fmt(((o.ldr + o.chr) / 2) * 15 + 100 + (F.prestige || 0) * 5)}`, (n) => done(Game.exileRaise(S.player, n)));
      case 'exFight': return chooseOfficer('Fight for the host', 'Lead the host\'s soldiers against raiders on his border. Success (from <b>WAR</b> and <b>LDR</b>) earns favour and prestige.', idle, (o) => `${Math.round((0.35 + (o.war + o.ldr) / 400) * 100)}%`, (n) => done(Game.exileFight(S.player, n)));
      case 'exRecruit': { const t = Game.off(data.target); return chooseOfficer(`Recruit ${t.name}`, `Persuade <b>${esc(t.name)}</b> to join a house without a city. Prestige helps.`, idle, (o) => `${Math.round(Game.recruitChance(o, t, Game.rulerOf(S.player).chr, S.player) * 100)}%`, (n) => done(Game.exileRecruit(S.player, n, t.name))); }
      case 'exPatron': {
        const lords = Object.values(S.factions).filter((h) => h.alive && !h.raider && !h.guest && h.id !== S.player && h.id !== F.host && Game.factionProvinces(h.id).length).sort((a, b) => Game.relation(S.player, b.id) - Game.relation(S.player, a.id));
        if (!lords.length) { result({ ok: false, msg: 'No other lord would take you in.' }); return; }
        openModal(`<h3>Seek a new patron</h3><p>Leave the court of ${esc(Game.fname(F.host))} (relations -15, prestige -3) and move the whole household to another lord. Favour starts at 40 with the new host.</p>
          <div class="row"><label>New patron</label><select id="ex-host" style="flex:1">${lords.map((h) => `<option value="${h.id}">${esc(h.name)} — ${Game.factionProvinces(h.id).length} cities · ${Game.relationWord(Game.relation(S.player, h.id))} (${Game.relation(S.player, h.id)})</option>`).join('')}</select></div>
          <p class="hint">An officer must carry the request:</p>${pickList(idle)}
          <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">Depart</button></div>`, {
          cancel: closeModal, ok: () => { const n = picked()[0]; if (!n) return; closeModal(); done(Game.exileSeekPatron(S.player, n, $('#ex-host').value)); },
        });
        return;
      }
      case 'exSeize': {
        const targets = Game.exileTargets(S.player); const seat = Game.hostSeat(S.player);
        const refresh = () => {
          const t = $('#ex-target').value; const n = Math.min(+$('#ex-troops').value, F.household.troops); $('#ex-range').value = n;
          const names = picked(); if (!names.length) { $('#ex-est').innerHTML = '<span class="hint">Choose commanders.</span>'; return; }
          const to = Game.prov(t); const m = Game.battleModifiers(seat, t); const att = names.map(Game.off); const def = to.owner ? Game.officersIn(t, to.owner) : [];
          const mx = (l, k, d) => (l.length ? Math.max(...l.map((o) => o[k])) : d);
          const aPow = n * (1 - m.loss) * (0.5 + mx(att, 'war', 50) / 100) * (0.7 + mx(att, 'ldr', 50) / 250) * (0.7 + 60 / 300) * m.att;
          const dPow = to.troops * (0.5 + mx(def, 'war', to.owner ? 40 : 50) / 100) * (0.7 + mx(def, 'ldr', to.owner ? 40 : 50) / 250) * (0.7 + to.training / 300) * (1 + to.defense / 1000) * m.def;
          const r = dPow > 0 ? aPow / dPow : 9;
          const label = r > 2.2 ? ['Overwhelming', 'var(--green)'] : r > 1.5 ? ['Favourable', '#9fd69f'] : r > 1.1 ? ['Slight edge', 'var(--gold2)'] : r > 0.8 ? ['Even – risky', '#ffb86b'] : ['Unfavourable', '#e29a8f'];
          $('#ex-est').innerHTML = `<span style="color:${label[1]}">${label[0]}</span> <small style="color:var(--muted)">(ratio ${r.toFixed(2)})</small>${m.notes.length ? `<div class="hint">${m.notes.map(esc).join('<br>')}</div>` : ''}`;
        };
        openModal(`<h3>Seize a city from ${esc(Game.pname(seat))}</h3>
          <p>March the household army on a neighbouring city. Win, and your house has a home again; lose, and the survivors limp back to the host's court.</p>
          <div class="row"><label>Target</label><select id="ex-target" style="flex:1">${targets.map((t) => `<option value="${t.id}">${esc(Game.pname(t.id))} — ${esc(Game.fname(t.owner))} · ${fmt(t.troops)} troops · walls ${t.defense}</option>`).join('')}</select></div>
          <p class="hint">Commanders (up to 3):</p>${pickList(idle, { multi: true, max: 3 })}
          <div class="row"><label>Troops</label><input type="number" id="ex-troops" min="1" max="${F.household.troops}" value="${F.household.troops}"><span class="max">of ${fmt(F.household.troops)}</span></div>
          <input type="range" id="ex-range" min="1" max="${F.household.troops}" value="${F.household.troops}">
          <div class="row"><label>Outlook</label><span id="ex-est"></span></div>
          <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">March!</button></div>`, {
          cancel: closeModal, onpick: refresh,
          oninput: (e) => { if (e.target.id === 'ex-range') $('#ex-troops').value = e.target.value; refresh(); },
          ok: () => { const res = Game.exileSeize(S.player, $('#ex-target').value, picked(), +$('#ex-troops').value); if (!res.ok) { result(res); return; } closeModal(); renderAll(); showBattle(res.report, () => handleCaptives(renderAll)); },
        });
        refresh();
        return;
      }
    }
  }

  function overviewHtml() {
    const S = Game.state();
    const rows = Object.values(S.factions).map((f) => ({ f, cities: Game.factionProvinces(f.id).length, troops: Game.totalTroops(f.id), offs: Game.factionOfficers(f.id).length }))
      .sort((a, b) => b.cities - a.cities || b.troops - a.troops);
    const me = !S.observer && S.factions[S.player];
    if (me && me.guest) return exileHtml();
    return `<div class="ph"><h2>The Realm</h2><div class="owner">${esc(Game.dateStr())}</div></div>
      <div class="hint">Select a city on the map to inspect it.</div>
      <ul class="factlist">${rows.map((r) => `<li><span class="chip" style="background:${r.f.color}"></span><span class="fn ${r.f.alive ? '' : 'dead'}">${esc(r.f.name)}${r.f.id === S.player ? ' (you)' : ''}</span><small>${r.cities} cities · ${fmt(r.troops)} troops · ${r.offs} off.</small></li>`).join('')}</ul>`;
  }

  function renderLog() {
    const S = Game.state();
    $('#log').innerHTML = S.log.slice(0, 120).map((l) => `<div class="log-line ${l.cls}"><span class="lt">${l.t}</span>${esc(l.text)}</div>`).join('');
  }

  function toast(msg) { Game.log(msg, 'sys'); renderLog(); }

  // ---------- modal helpers ----------
  function openModal(html, handlers = {}, lock = false) {
    modalHandlers = handlers; modalLocked = lock;
    $('#modal-box').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; modalHandlers = {}; modalLocked = false; }

  function togglePick(li) {
    const list = li.closest('.pick');
    const multi = list.dataset.multi === '1';
    const max = parseInt(list.dataset.max || '99', 10);
    if (!multi) list.querySelectorAll('li.sel').forEach((x) => { if (x !== li) x.classList.remove('sel'); });
    if (li.classList.contains('sel')) li.classList.remove('sel');
    else if (multi && list.querySelectorAll('li.sel').length >= max) return;
    else li.classList.add('sel');
    if (modalHandlers.onpick) modalHandlers.onpick();
  }
  const picked = (sel = '.pick') => [...$('#modal-box').querySelectorAll(`${sel} li.sel`)].map((li) => li.dataset.name);

  function pickList(officers, { multi = false, max = 3, extra = () => '', id = '' } = {}) {
    if (!officers.length) return '<div class="hint">No available officers.</div>';
    return `<ul class="pick" ${id ? `id="${id}"` : ''} data-multi="${multi ? 1 : 0}" data-max="${max}">${officers.map((o) => `<li data-name="${esc(o.name)}"><span class="nm">${Game.isRuler(o) ? '★ ' : ''}${esc(o.name)}${itemBadge(o)}</span><span class="st">Age ${Game.age(o)} · LDR ${o.ldr} · WAR ${o.war} · INT ${o.int} · POL ${o.pol} · CHR ${o.chr}</span><span class="ex">${extra(o)}</span></li>`).join('')}</ul>`;
  }

  function chooseOfficer(title, desc, officers, extra, onChoose) {
    openModal(`<h3>${esc(title)}</h3><p>${desc}</p>${pickList(officers, { extra })}
      <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">Confirm</button></div>`, {
      cancel: closeModal,
      ok: () => { const n = picked()[0]; if (!n) return; closeModal(); onChoose(n); },
    });
  }

  function result(res) {
    if (!res.ok) { openModal(`<h3>Cannot do that</h3><p>${esc(res.msg)}</p><div class="modal-actions"><button class="btn btn-gold" data-act="close">OK</button></div>`, { close: closeModal }); return false; }
    renderAll();
    return true;
  }

  // ---------- commands ----------
  function command(cmd, data) {
    if (cmd.startsWith('ex')) return exileCommand(cmd, data);
    const pid = selected;
    const idle = Game.idleOfficers(pid);
    const S = Game.state();
    switch (cmd) {
      case 'agri':
        return chooseOfficer('Develop agriculture', `Spend ${Game.COST.develop} gold to improve farmland. Gain depends on <b>POL</b>.`, idle, (o) => `≈ +${Math.floor(o.pol / 4 + 5)}`, (n) => result(Game.develop(pid, n, 'agri')));
      case 'comm':
        return chooseOfficer('Develop commerce', `Spend ${Game.COST.develop} gold to expand markets. Gain depends on <b>POL</b>.`, idle, (o) => `≈ +${Math.floor(o.pol / 4 + 5)}`, (n) => result(Game.develop(pid, n, 'comm')));
      case 'fortify':
        return chooseOfficer('Fortify walls', `Spend ${Game.COST.fortify} gold to raise the city's defenses. Gain depends on <b>LDR</b>.`, idle, (o) => `≈ +${Math.floor(o.ldr / 4 + 4)}`, (n) => result(Game.fortify(pid, n)));
      case 'train':
        return chooseOfficer('Train troops', 'Drill the garrison to raise training (max 100). Gain depends on <b>LDR</b> and <b>WAR</b>.', idle, (o) => `≈ +${Math.floor(o.ldr / 8 + o.war / 20 + 1)}`, (n) => result(Game.train(pid, n)));
      case 'recruit':
        return chooseOfficer('Conscript soldiers', `Spend ${Game.COST.recruit} gold to raise troops from the population. Numbers depend on <b>LDR</b> and <b>CHR</b>. New recruits lower training.`, idle, (o) => `≈ ${fmt(((o.ldr + o.chr) / 2) * 25 + 200)}`, (n) => result(Game.recruitTroops(pid, n)));
      case 'search':
        return chooseOfficer('Search the city', 'Collect taxes and tribute, and perhaps discover hidden stores. Depends on <b>INT</b>.', idle, (o) => `≈ ${fmt(o.int * 2 + 125)}g`, (n) => result(Game.search(pid, n)));
      case 'recruitOfficer': {
        const t = Game.off(data.target);
        const ruler = Game.rulerOf(S.player);
        return chooseOfficer(`Recruit ${t.name}`, `Send an envoy to persuade <b>${esc(t.name)}</b> (LDR ${t.ldr} · WAR ${t.war} · INT ${t.int} · POL ${t.pol} · CHR ${t.chr}) to join you. Success depends on the envoy's <b>CHR</b> and your own.`, idle,
          (o) => `${Math.round(Game.recruitChance(o, t, ruler.chr) * 100)}% chance`, (n) => result(Game.recruitOfficer(pid, n, t.name)));
      }
      case 'reward': {
        const list = Game.officersIn(pid, S.player).filter((o) => !Game.isRuler(o));
        return chooseOfficer('Reward an officer', `Spend ${Game.COST.reward} gold on gifts to raise loyalty. Officers below 50 loyalty may defect.`, list, (o) => `loyalty ${o.loyalty}`, (n) => result(Game.reward(pid, n)));
      }
      case 'buyfood': return buyFoodDialog(pid);
      case 'pacify':
        return chooseOfficer('Pacify the city', `Spend ${Game.COST.pacify} gold settling disputes and feeding the poor. Gain depends on <b>POL</b> and <b>CHR</b>; Administrators and Orators do half again as well. Order below 60 cuts income, below 30 stops levies, below 20 risks revolt.`, idle, (o) => `≈ +${Math.floor((3 + o.pol / 6 + o.chr / 10 + 2) * ((o.skills || []).some((s) => s === 'admin' || s === 'orator') ? 1.5 : 1))}`, (n) => result(Game.pacify(pid, n)));
      case 'appoint': {
        const list = Game.officersIn(pid, S.player).filter((o) => !Game.isRuler(o) && (o.rank || 0) < 3);
        return chooseOfficer('Appoint a court rank', `Ranks cost gold (${Game.RANK_COST.slice(1).join(' / ')}) and raise loyalty by 10 with a lasting floor. Your title (${esc(Game.titleOf(S.player).name)}) allows ${Game.titleOf(S.player).slots} generals and marshals.`, list, (o) => `${o.rank ? Game.RANKS[o.rank] + ' → ' : ''}${Game.RANKS[(o.rank || 0) + 1]} (${Game.RANK_COST[(o.rank || 0) + 1]}g) · loyalty ${o.loyalty}`, (n) => result(Game.appoint(pid, n)));
      }
      case 'plot': return plotDialog(pid);
      case 'bestow': {
        const holders = Game.officersIn(pid, S.player).filter((o) => Game.itemsOf(o.name).length);
        return chooseOfficer('Bestow a treasure', 'Choose the officer who gives up his treasure. Giving a treasure raises the receiver\'s loyalty by 10.', holders, (o) => Game.itemsOf(o.name).map((it) => it.name).join(', '), (from) => {
          const others = Game.officersIn(pid, S.player).filter((o) => o.name !== from);
          chooseOfficer(`Bestow the ${Game.itemsOf(from)[0].name}`, `Who receives it?`, others, (o) => `loyalty ${o.loyalty}`, (to) => result(Game.bestow(pid, from, to)));
        });
      }
      case 'ships':
        return chooseOfficer('Build warships', `Spend ${Game.COST.ships} gold to launch ships (fleet max 100). Gain depends on <b>LDR</b> and <b>INT</b>. Fleets decide river crossings and sea lanes, for attack and defence.`, idle, (o) => `≈ +${Math.floor(o.ldr / 6 + o.int / 10 + 2)}`, (n) => result(Game.buildShips(pid, n)));
      case 'transfer': return transferDialog(pid);
      case 'attack': return attackDialog(pid, null);
      case 'attackFrom': return attackDialog(data.from, pid);
    }
  }

  function plotDialog(pid) {
    const S = Game.state();
    const targets = Game.plotTargets(pid);
    const idle = Game.idleOfficers(pid).sort((a, b) => b.int - a.int);
    const kinds = [['spy', 'Spy', 'Learn the city\'s state, its least loyal officer, and rumours of hidden treasures.'], ['unrest', 'Stir unrest', 'Spread rumours: order falls by 6 to 30. Sometimes traced back to you.'], ['sabotage', 'Sabotage', 'Fire the granaries and undermine a wall. Often traced back to you.'], ['incite', 'Incite defection', 'Turn a disloyal officer; he joins you here if he comes. Needs a target officer.'], ['assassinate', 'Assassinate', 'Kill an officer. Low odds; your agent may be caught and the whole land will suspect you. Needs a target officer.']];
    const refresh = () => {
      const kind = $('#pl-kind').value, t = $('#pl-target').value;
      const offs = Game.prov(t).owner ? Game.officersIn(t, Game.prov(t).owner) : [];
      const needOfficer = kind === 'incite' || kind === 'assassinate';
      $('#pl-officer-row').hidden = !needOfficer;
      $('#pl-officer').innerHTML = offs.map((o) => `<option value="${esc(o.name)}">${esc(o.name)} · loyalty ${o.loyalty} · LDR ${o.ldr}${Game.isRuler(o) ? ' (lord)' : ''}</option>`).join('');
      $('#pl-desc').textContent = kinds.find((k) => k[0] === kind)[2] + ` Cost ${Game.COST.plots[kind]} gold.`;
    };
    openModal(`<h3>Plots from ${esc(Game.pname(pid))}</h3>
      <div class="row"><label>Target city</label><select id="pl-target" style="flex:1">${targets.map((t) => `<option value="${t.id}">${esc(Game.pname(t.id))} — ${esc(Game.fname(t.owner))} · order ${t.order}</option>`).join('')}</select></div>
      <div class="row"><label>Scheme</label><select id="pl-kind" style="flex:1">${kinds.map((k) => `<option value="${k[0]}">${k[1]} (${Game.COST.plots[k[0]]}g)</option>`).join('')}</select></div>
      <div class="row" id="pl-officer-row" hidden><label>Against</label><select id="pl-officer" style="flex:1"></select></div>
      <p class="hint" id="pl-desc"></p>
      <p class="hint">The agent (best <b>INT</b> first; Stratagem helps; Orators incite better):</p>${pickList(idle)}
      <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">Set the plot in motion</button></div>`, {
      cancel: closeModal, oninput: refresh,
      ok: () => { const n = picked()[0]; if (!n) return; const r = Game.plot(pid, n, $('#pl-target').value, $('#pl-kind').value, $('#pl-officer').value); if (!r.ok) { result(r); return; } closeModal(); renderAll(); showResult(r.msg, () => {}); },
    });
    refresh();
  }

  function handleTitle(done) {
    const S = Game.state(); const pt = S.pendingTitle;
    if (!pt || pt.fid !== S.player) { done(); return; }
    const t = TITLES[pt.tier];
    openModal(`<h3>A title within reach</h3>
      <p>Your prestige and your ${Game.factionProvinces(S.player).length} cities entitle you to the rank of <b>${esc(t.name)}</b>. Taking it lends legitimacy to your envoys and recruiters and lets you name ${t.slots === 99 ? 'any number of' : t.slots} generals${pt.tier === 4 ? ', but to mount the throne is to declare yourself the Han\'s successor: every lord will call you a usurper' : ', though the other lords will resent the presumption a little'}.</p>
      <div class="modal-actions"><button data-act="no">Not yet</button><button class="btn btn-gold" data-act="yes">Assume the title</button></div>`, {
      yes: () => { const r = Game.assumeTitle(S.player, pt.tier); renderAll(); showResult(r.msg, done); },
      no: () => { S.pendingTitle = null; closeModal(); done(); },
    }, true);
  }

  function buyFoodDialog(pid) {
    const p = Game.prov(pid);
    const rateFor = (g) => (g > 2000 ? 3 : g > 800 ? 4 : 5);
    const refresh = () => {
      const g = Math.max(0, Math.min(+$('#bf-gold').value || 0, p.gold));
      $('#bf-out').textContent = `${fmt(g)} gold → ${fmt(g * rateFor(g))} food (rate ${rateFor(g)}:1)`;
    };
    openModal(`<h3>Buy food in ${esc(Game.pname(pid))}</h3>
      <p>Merchants sell grain for gold. Small purchases get 5 food per gold, large ones 4 or 3. No officer is needed.</p>
      <div class="row"><label>Gold</label><input type="number" id="bf-gold" min="1" max="${p.gold}" value="${Math.min(500, p.gold)}"><span class="max">of ${fmt(p.gold)}</span></div>
      <div class="row"><label>You receive</label><span id="bf-out"></span></div>
      <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">Buy</button></div>`, {
      cancel: closeModal,
      oninput: refresh,
      ok: () => { const res = Game.buyFood(pid, +$('#bf-gold').value); if (res.ok) closeModal(); result(res); },
    });
    refresh();
  }

  function transferDialog(pid) {
    const S = Game.state();
    const p = Game.prov(pid);
    const dests = Game.neighbors(pid).filter((n) => n.owner === S.player);
    const idle = Game.idleOfficers(pid);
    openModal(`<h3>Transfer from ${esc(Game.pname(pid))}</h3>
      <div class="row"><label>Destination</label><select id="tr-dest">${dests.map((d) => `<option value="${d.id}">${esc(Game.pname(d.id))} (${fmt(d.troops)} troops)</option>`).join('')}</select></div>
      <div class="row"><label>Troops</label><input type="number" id="tr-troops" min="0" max="${p.troops}" value="0"><span class="max">max ${fmt(p.troops)}</span></div>
      <div class="row"><label>Gold</label><input type="number" id="tr-gold" min="0" max="${p.gold}" value="0"><span class="max">max ${fmt(p.gold)}</span></div>
      <div class="row"><label>Food</label><input type="number" id="tr-food" min="0" max="${p.food}" value="0"><span class="max">max ${fmt(p.food)}</span></div>
      <p class="hint">Officers to move (troops need at least one escort):</p>
      ${pickList(idle, { multi: true, max: 99 })}
      <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">Transfer</button></div>`, {
      cancel: closeModal,
      ok: () => {
        const res = Game.transfer(pid, $('#tr-dest').value, {
          troops: +$('#tr-troops').value, gold: +$('#tr-gold').value, food: +$('#tr-food').value, officers: picked(),
        });
        if (res.ok) closeModal();
        result(res);
      },
    });
  }

  function estimate(fromId, toId, names, troops) {
    const from = Game.prov(fromId), to = Game.prov(toId);
    const att = names.map(Game.off);
    const def = to.owner ? Game.officersIn(toId, to.owner) : [];
    const mx = (l, k, d) => (l.length ? Math.max(...l.map((o) => o[k])) : d);
    const m = Game.battleModifiers(fromId, toId);
    const aPow = troops * (1 - m.loss) * (0.5 + mx(att, 'war', 50) / 100) * (0.7 + mx(att, 'ldr', 50) / 250) * (0.7 + from.training / 300) * m.att;
    const dPow = to.troops * (0.5 + mx(def, 'war', to.owner ? 40 : 50) / 100) * (0.7 + mx(def, 'ldr', to.owner ? 40 : 50) / 250) * (0.7 + to.training / 300) * (1 + to.defense / 1000) * m.def;
    const r = dPow > 0 ? aPow / dPow : 9;
    const label = r > 2.2 ? ['Overwhelming', 'var(--green)'] : r > 1.5 ? ['Favourable', '#9fd69f'] : r > 1.1 ? ['Slight edge', 'var(--gold2)'] : r > 0.8 ? ['Even – risky', '#ffb86b'] : ['Unfavourable', '#e29a8f'];
    return `<span style="color:${label[1]}">${label[0]}</span> <small style="color:var(--muted)">(strength ratio ${r.toFixed(2)})</small>${m.notes.length ? `<div class="hint">${m.notes.map(esc).join('<br>')}</div>` : ''}`;
  }

  function attackDialog(fromId, presetTarget) {
    const S = Game.state();
    const p = Game.prov(fromId);
    const targets = Game.enemyNeighbors(fromId).filter((n) => Game.canAttack(S.player, n.owner) && !Game.battleModifiers(fromId, n.id).blocked);
    const closed = Game.enemyNeighbors(fromId).filter((n) => Game.canAttack(S.player, n.owner) && Game.battleModifiers(fromId, n.id).blocked);
    const idle = Game.idleOfficers(fromId);
    const defaultTroops = Math.floor(p.troops * 0.7);
    const targetHtml = (t) => {
      const def = t.owner ? Game.officersIn(t.id, t.owner) : [];
      return `<option value="${t.id}" ${t.id === presetTarget ? 'selected' : ''}>${esc(Game.pname(t.id))} — ${esc(Game.fname(t.owner))} · ${fmt(t.troops)} troops · walls ${t.defense}${def.length ? ` · ${def.map((o) => o.name).join(', ')}` : ''}</option>`;
    };
    const refresh = () => {
      const t = $('#at-target').value;
      const n = Math.min(+$('#at-troops').value, p.troops);
      $('#at-troops-range').value = n;
      $('#at-est').innerHTML = picked().length ? estimate(fromId, t, picked(), n) : '<span class="hint">Choose commanders.</span>';
      const to = Game.prov(t);
      const def = to.owner ? Game.officersIn(t, to.owner) : [];
      $('#at-def').innerHTML = def.length ? officerTable(def) : '<div class="hint">Defended by local garrison only.</div>';
    };
    openModal(`<h3>Attack from ${esc(Game.pname(fromId))}</h3>
      <div class="row"><label>Target</label><select id="at-target" style="flex:1">${targets.map(targetHtml).join('')}</select></div>
      ${closed.length ? `<div class="hint">Closed this season: ${closed.map((n) => `${esc(Game.pname(n.id))} (${esc(Game.battleModifiers(fromId, n.id).blocked)})`).join('; ')}</div>` : ''}
      <div id="at-def"></div>
      <p class="hint">Commanders (up to 3). Best WAR and LDR count in battle; best INT enables stratagems.</p>
      ${pickList(idle, { multi: true, max: 3 })}
      <div class="row"><label>Troops</label><input type="number" id="at-troops" min="1" max="${p.troops}" value="${defaultTroops}"><span class="max">of ${fmt(p.troops)} · costs ${fmt(defaultTroops * 0.1)} food</span></div>
      <input type="range" id="at-troops-range" min="1" max="${p.troops}" value="${defaultTroops}">
      <div class="row"><label>Stance</label><select id="at-stance" style="flex:1"><option value="standard">Standard</option><option value="assault">Assault · strength ×1.15, losses ×1.2</option><option value="siege">Siege · walls count 30% less, ×0.9, longer</option><option value="feint">Feint · schemes twice as likely, ×0.92</option></select></div>
      <div class="row"><label>Stratagem</label><select id="at-strat" style="flex:1"><option value="auto">Improvise (needs a clever commander to matter)</option><option value="fire">Fire attack · big blow once, not in winter</option><option value="flood">Flood · river crossing with fleet 40+</option><option value="discord">Sow discord · turn a disloyal defender before battle</option></select></div>
      <div class="hint">A stratagem needs a commander with INT 75 or more; Stratagem skill helps.</div>
      <div class="row"><label>Outlook</label><span id="at-est"></span></div>
      <div class="modal-actions"><button data-act="cancel">Cancel</button><button class="btn btn-gold" data-act="ok">March!</button></div>`, {
      cancel: closeModal,
      onpick: refresh,
      oninput: (e) => {
        if (e.target.id === 'at-troops-range') $('#at-troops').value = e.target.value;
        refresh();
      },
      ok: () => {
        const res = Game.attack(fromId, $('#at-target').value, picked(), +$('#at-troops').value, { stance: $('#at-stance').value, stratagem: $('#at-strat').value });
        if (!res.ok) { result(res); return; }
        closeModal();
        renderAll();
        showBattle(res.report, () => handleCaptives(renderAll));
      },
    });
    refresh();
  }

  // ---------- battle report ----------
  function showBattle(R, onClose) {
    const S = Game.state();
    const attackerWon = R.result === 'captured' || R.result === 'raided';
    const playerWon = (R.attacker === S.player && attackerWon) || (R.defender === S.player && !attackerWon);
    const involved = R.attacker === S.player || R.defender === S.player;
    const banner = involved ? `<div class="result-banner ${playerWon ? 'win' : 'lose'}">${playerWon ? 'Victory!' : 'Defeat'}</div>` : '';
    openModal(`<h3>Battle of ${esc(Game.pname(R.to))}</h3>
      ${banner}
      <div class="battle">
        <div class="rounds">${R.lines.map((l) => `<div class="${l.cls}">${esc(l.text)}</div>`).join('')}</div>
        <div>Attackers: ${fmt(R.startA)} → ${fmt(R.endA)} &nbsp;·&nbsp; Defenders: ${fmt(R.startD)} → ${fmt(R.endD)}</div>
      </div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Continue</button></div>`, {
      close: () => { closeModal(); if (onClose) onClose(); },
    }, true);
  }

  // ---------- captives ----------
  function handleCaptives(done) {
    const S = Game.state();
    const c = S.pendingCaptives.find((x) => x.captor === S.player);
    if (!c) { if (done) done(); return; }
    const o = Game.off(c.name);
    const chance = Math.round(Game.captiveChance(S.player, o) * 100);
    const from = c.from ? Game.fname(c.from) : 'no one';
    openModal(`<h3>Prisoner: ${esc(o.name)}</h3>
      <div class="captive-card"><div class="cn">${esc(o.name)}</div><div class="cs">Age ${Game.age(o)} · LDR ${o.ldr} · WAR ${o.war} · INT ${o.int} · POL ${o.pol} · CHR ${o.chr}<br>Served ${esc(from)} with loyalty ${o.loyalty}.</div></div>
      <p>${esc(o.name)} is brought before you in chains. What is your will?</p>
      <div class="modal-actions">
        <button data-act="release">Release</button>
        <button class="btn-red" data-act="execute">Execute</button>
        <button class="btn btn-gold" data-act="recruit">Recruit (${chance}%)</button>
      </div>`, {
      recruit: () => { const r = Game.resolveCaptive(c.name, 'recruit'); showResult(r.msg, () => handleCaptives(done)); },
      release: () => { const r = Game.resolveCaptive(c.name, 'release'); showResult(r.msg, () => handleCaptives(done)); },
      execute: () => { const r = Game.resolveCaptive(c.name, 'execute'); showResult(r.msg, () => handleCaptives(done)); },
    }, true);
  }

  function showResult(msg, next) {
    openModal(`<p style="font-size:15px">${esc(msg)}</p><div class="modal-actions"><button class="btn btn-gold" data-act="ok">Continue</button></div>`, { ok: () => { closeModal(); next(); } }, true);
  }

  // ---------- end of month ----------
  function endTurn() {
    const S = Game.state();
    if (S.observer) {
      const notices = Game.endTurn();
      renderAll();
      if (S.over) { stopAuto(); showGameOver(); return; }
      if (notices.length && !autoTimer) showNotices(notices, () => {});
      return;
    }
    if (S.pendingCaptives.some((c) => c.captor === S.player)) { handleCaptives(endTurn); return; }
    const F = S.factions[S.player];
    const idle = F.guest ? Game.factionOfficers(S.player).filter((o) => !o.acted && Game.prov(o.city).owner === F.host).length : Game.factionProvinces(S.player).reduce((s, p) => s + Game.idleOfficers(p.id).length, 0);
    const afterTurn = () => handleDecisions(() => handleTitle(() => handleSuccession(() => handleProposals(() => handleCaptives(renderAll)))));
    const go = () => {
      const notices = Game.endTurn();
      if (S.factions[S.player].guest) selected = null;
      renderAll();
      if (S.over) { if (notices.length) showNotices(notices, showGameOver); else showGameOver(); return; }
      if (notices.length) showNotices(notices, afterTurn);
      else afterTurn();
    };
    if (idle > 0) {
      openModal(`<h3>End the month?</h3><p>${idle} officer${idle > 1 ? 's have' : ' has'} not acted yet.</p>
        <div class="modal-actions"><button data-act="cancel">Go back</button><button class="btn btn-gold" data-act="ok">End month</button></div>`, { cancel: closeModal, ok: () => { closeModal(); go(); } });
    } else go();
  }

  function showNotices(notices, done) {
    const S = Game.state();
    openModal(`<h3>${esc(Game.dateStr())} — Reports</h3>
      <div class="notices">${notices.map((n, i) => `<div class="n ${n.cls}">${esc(n.text)}${n.report ? `<button class="btn-sm" data-act="rep" data-i="${i}">View battle</button>` : ''}</div>`).join('')}</div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Continue</button></div>`, {
      close: () => { closeModal(); done(); },
      rep: (el) => showBattle(notices[+el.dataset.i].report, () => showNotices(notices, done)),
    }, true);
  }

  function showGameOver() {
    const S = Game.state();
    if (S.over === 'observer') {
      openModal(`<div class="gameover"><h2>The Land is United</h2>
        <p>In ${esc(Game.dateStr())}, ${esc(Game.fname(S.winner))} brought every city under one banner. A new dynasty begins.</p>
        <div class="modal-actions" style="justify-content:center"><button data-act="close">Keep looking</button><button class="btn btn-gold" data-act="menu">Return to menu</button></div></div>`, { close: closeModal, menu: () => { closeModal(); backToMenu(); } }, true);
      return;
    }
    const win = S.over === 'victory';
    openModal(`<div class="gameover"><h2>${win ? 'The Land is United!' : 'Your House Has Fallen'}</h2>
      <p>${win ? `In ${esc(Game.dateStr())}, ${esc(Game.fname(S.player))} brought all the cities of China under one banner. A new dynasty begins.` : `In ${esc(Game.dateStr())}, the last city of ${esc(Game.fname(S.player))} fell. History will remember your struggle.`}</p>
      <div class="modal-actions" style="justify-content:center"><button class="btn btn-gold" data-act="menu">Return to menu</button></div></div>`, { menu: () => { closeModal(); backToMenu(); } }, true);
  }

  // ---------- info screens ----------
  function showOverview() {
    const S = Game.state();
    const rows = Object.values(S.factions).map((f) => {
      const provs = Game.factionProvinces(f.id);
      return { f, cities: provs.length, troops: Game.totalTroops(f.id), gold: provs.reduce((s, p) => s + p.gold, 0), food: provs.reduce((s, p) => s + p.food, 0), offs: Game.factionOfficers(f.id).length, names: provs.map((p) => Game.pname(p.id)).join(', ') };
    }).sort((a, b) => b.cities - a.cities || b.troops - a.troops);
    openModal(`<h3>The Realm — ${esc(Game.dateStr())}</h3>
      <table class="overview"><tr><th></th><th>Warlord</th><th>Cities</th><th>Troops</th><th>Gold</th><th>Food</th><th>Officers</th><th>Prestige</th></tr>
      ${rows.map((r) => `<tr><td><span class="chip" style="background:${r.f.color}"></span></td><td class="${r.f.alive ? '' : 'dead'}">${r.f.hasEmperor ? '👑 ' : ''}${esc(r.f.name)}${r.f.id === S.player ? ' (you)' : ''}${(r.f.persona || []).length ? ` <small class="persona">${esc((r.f.persona || []).join(', '))}</small>` : ''}${r.f.phase === 'unifying' ? ' <small class="persona" style="color:#e29a8f" title="Holds half the realm: it signs no treaties, tears up old ones and attacks on every front until the land is one">unifying the realm</small>' : r.f.phase === 'hegemon' ? ' <small class="persona" title="The largest power: it governs, courts the second power and finishes small neighbours; others band against it">hegemon</small>' : r.f.phase === 'consolidating' ? ' <small class="persona" title="The largest power, pausing to restore order in its restless cities before marching again">consolidating</small>' : Game.leaderHouse() === r.f.id ? ' <small class="persona" title="Holds a third of the map; others will band against him">leading power</small>' : ''}<br><small class="${r.names ? 'cities' : ''}" style="color:var(--muted)">${esc(r.names) || (r.f.alive ? (r.f.guest ? `in exile under ${esc(Game.fname(r.f.host))}` : '') : 'destroyed')}</small></td><td class="num">${r.cities}</td><td class="num">${fmt(r.troops)}</td><td class="num">${fmt(r.gold)}</td><td class="num">${fmt(r.food)}</td><td class="num">${r.offs}</td><td class="num">${r.f.prestige || 0}</td></tr>`).join('')}</table>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, { close: closeModal });
  }

  // ---------- officer roster: filterable and sortable ----------
  const roster = { key: 'war', dir: -1, q: '', house: '' };
  function rosterTable(list, all) {
    const cols = [['name', 'Name'], ['age', 'Age'], ['ldr', 'LDR'], ['war', 'WAR'], ['int', 'INT'], ['pol', 'POL'], ['chr', 'CHR'], ['loyalty', 'LOY'], ['city', 'City']];
    if (all) cols.push(['house', 'House']);
    const th = cols.map(([k, l]) => `<th data-act="sort" data-key="${k}" class="sortable${roster.key === k ? ' sorted' : ''}" title="Sort by ${l}">${l}${roster.key === k ? (roster.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    if (!list.length) return `<table class="off"><tr>${th}${all ? '' : '<th></th>'}</tr></table><div class="hint">No officers match.</div>`;
    return `<table class="off"><tr>${th}${all ? '' : '<th></th>'}</tr>${list.map((o) => `<tr class="${o.acted && !all ? 'acted' : ''}">
      <td class="n">${Game.isRuler(o) ? '<span class="crown">★</span> ' : ''}${rankTag(o)}${esc(o.name)}${itemBadge(o)}${skillTags(o)}</td><td class="num">${Game.age(o)}</td>
      <td class="num">${o.ldr}</td><td class="num">${o.war}</td><td class="num">${o.int}</td><td class="num">${o.pol}</td><td class="num">${o.chr}</td>
      <td class="num ${loyClass(o.loyalty)}">${Game.isRuler(o) ? '—' : o.loyalty}</td><td>${esc(Game.pname(o.city))}</td>
      ${all ? `<td><span class="chip" style="background:${Game.fac(o.faction).color}"></span> ${esc(Game.fname(o.faction))}</td>` : `<td>${o.acted ? 'done' : ''}</td>`}</tr>`).join('')}</table>`;
  }

  function showOfficers() {
    const S = Game.state();
    const all = S.observer;
    const base = () => Object.values(S.officers).filter((o) => !o.captive && (all ? o.faction : o.faction === S.player));
    const houses = all ? Object.values(S.factions).filter((f) => f.alive).sort((a, b) => a.name.localeCompare(b.name)) : [];
    const render = () => {
      const q = roster.q.trim().toLowerCase();
      const list = base().filter((o) => (!roster.house || o.faction === roster.house) &&
        (!q || o.name.toLowerCase().includes(q) || Game.pname(o.city).toLowerCase().includes(q) || (o.faction && Game.fname(o.faction).toLowerCase().includes(q))));
      const k = roster.key;
      const val = (o) => k === 'age' ? Game.age(o) : k === 'city' ? Game.pname(o.city) : k === 'house' ? Game.fname(o.faction) : k === 'loyalty' ? (Game.isRuler(o) ? 101 : o.loyalty) : o[k];
      list.sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb; return c * roster.dir || a.name.localeCompare(b.name); });
      $('#roster-body').innerHTML = rosterTable(list, all);
      $('#roster-count').textContent = `${list.length} officer${list.length === 1 ? '' : 's'}`;
    };
    openModal(`<h3>${all ? 'Officers of the realm' : `Officers of ${esc(Game.fname(S.player))}`}</h3>
      <div class="roster-controls">
        <input type="text" id="roster-q" placeholder="Filter by name, city${all ? ' or house' : ''}…" value="${esc(roster.q)}">
        ${all ? `<select id="roster-house"><option value="">All houses</option>${houses.map((f) => `<option value="${f.id}" ${roster.house === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>` : ''}
        <span id="roster-count" class="hint"></span>
      </div>
      <p class="hint">Click a column heading to sort; click again to reverse.</p>
      <div id="roster-body"></div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, {
      close: closeModal,
      sort: (el) => {
        const k = el.dataset.key;
        if (roster.key === k) roster.dir = -roster.dir;
        else { roster.key = k; roster.dir = (k === 'name' || k === 'city' || k === 'house') ? 1 : -1; }
        render();
      },
      oninput: (e) => {
        if (e.target.id === 'roster-q') roster.q = e.target.value;
        if (e.target.id === 'roster-house') roster.house = e.target.value;
        render();
      },
    });
    if (!all) roster.house = '';
    render();
  }

  // ---------- statistics ----------
  function showStats() {
    const S = Game.state();
    const H = S.history;
    const ids = [...new Set(H.flatMap((h) => Object.keys(h.houses)))];
    const alive = Object.values(S.factions).filter((f) => f.alive && !f.raider);
    const chart = (key, title, maxOverride) => {
      if (H.length < 2) return `<div class="hint">${title}: not enough years yet.</div>`;
      const W = 640, Hh = 220, padL = 36, padB = 24;
      const max = maxOverride || Math.max(1, ...H.flatMap((h) => Object.values(h.houses).map((x) => x[key])));
      const x = (i) => padL + (i / (H.length - 1)) * (W - padL - 10);
      const y = (v) => Hh - padB - (v / max) * (Hh - padB - 10);
      const lines = ids.map((id) => { const pts = H.map((h, i) => (h.houses[id] ? `${x(i).toFixed(1)},${y(h.houses[id][key]).toFixed(1)}` : null)); const segs = []; let cur = []; for (const p of pts) { if (p) cur.push(p); else { if (cur.length > 1) segs.push(cur); cur = []; } } if (cur.length > 1) segs.push(cur); const color = (S.factions[id] || {}).color || '#888'; return segs.map((sg) => `<polyline points="${sg.join(' ')}" fill="none" stroke="${color}" stroke-width="2" opacity="0.9"/>`).join(''); }).join('');
      const ticks = [0, 0.5, 1].map((t) => `<text x="${padL - 4}" y="${y(max * t) + 4}" text-anchor="end" class="ax">${fmt(max * t)}</text><line x1="${padL}" x2="${W - 10}" y1="${y(max * t)}" y2="${y(max * t)}" class="grid"/>`).join('');
      const years = H.map((h, i) => (i % Math.ceil(H.length / 8) === 0 || i === H.length - 1 ? `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle" class="ax">${h.year}</text>` : '')).join('');
      return `<div class="sec">${title}</div><svg class="chart" viewBox="0 0 ${W} ${Hh}">${ticks}${lines}${years}</svg>`;
    };
    const legend = alive.map((f) => `<span class="lg"><i style="background:${f.color}"></i>${esc(f.name)}</span>`).join(' ');
    const dead = Object.values(S.factions).filter((f) => !f.alive).length;
    openModal(`<h3>Statistics — ${esc(Game.dateStr())}</h3>
      <div class="grid2">
        <div class="kv"><span>Battles fought</span><b>${fmt(S.stats.battles)}</b></div><div class="kv"><span>Cities captured</span><b>${fmt(S.stats.captures)}</b></div>
        <div class="kv"><span>Officers dead</span><b>${fmt(S.stats.deaths)}</b></div><div class="kv"><span>Officers living</span><b>${Object.keys(S.officers).length}</b></div>
        <div class="kv"><span>Houses living</span><b>${alive.length}</b></div><div class="kv"><span>Houses fallen</span><b>${dead}</b></div>
      </div>
      <div class="legend-bar" style="border:none;background:none;padding:4px 0">${legend}</div>
      ${chart('cities', 'Cities held, by year', Object.keys(S.provinces).length)}
      ${chart('troops', 'Troops under arms, by year')}
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, { close: closeModal });
  }

  // ---------- encyclopaedia ----------
  function showWiki(focus) {
    const S = Game.state();
    const names = Object.keys(BIOS).sort();
    const entry = (n) => { const o = S.officers[n]; return `<div class="wiki-entry" id="wiki-${esc(n).replace(/\W/g, '_')}"><b>${esc(n)}</b> <span class="hint">${o ? `${esc(Game.fname(o.faction))}, age ${Game.age(o)}, at ${esc(Game.pname(o.city))}` : 'not living in this age'}</span><div>${esc(BIOS[n])}</div></div>`; };
    const events = EVENTS.filter((e) => !e.minor && !e.repeat).map((e) => `<div class="wiki-entry"><b>${esc(e.title)}</b> <span class="hint">${e.from[0]}–${e.to[0]}${S.eventsFired[e.id] ? ' · happened' : ''}</span></div>`).join('');
    const cities = Object.entries(CITY_NOTES).filter(([k, v]) => v && S.provinces[k]).map(([k, v]) => `<div class="wiki-entry"><b>${esc(Game.pname(k))}</b> <span class="hint">${esc(Game.fname(S.provinces[k].owner))}</span><div>${esc(v)}</div></div>`).join('');
    openModal(`<h3>Encyclopaedia</h3>
      <div class="roster-controls"><input type="text" id="wiki-q" placeholder="Filter…"><span class="hint" id="wiki-count"></span></div>
      <div class="sec">People</div><div id="wiki-people">${names.map(entry).join('')}</div>
      <div class="sec">Cities</div><div id="wiki-cities">${cities}</div>
      <div class="sec">Events of the age</div><div id="wiki-events">${events}</div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, {
      close: closeModal,
      oninput: (e) => { if (e.target.id !== 'wiki-q') return; const q = e.target.value.toLowerCase(); let n = 0; $('#modal-box').querySelectorAll('.wiki-entry').forEach((el) => { const show = !q || el.innerText.toLowerCase().includes(q); el.hidden = !show; if (show) n++; }); $('#wiki-count').textContent = `${n} entries`; },
    });
    if (focus) { const el = document.getElementById('wiki-' + focus.replace(/\W/g, '_')); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('wiki-focus'); } }
  }

  // ---------- help ----------
  function showHelp() {
    openModal(`<h3>Help</h3>
      <div class="sec">Keyboard</div>
      <table class="overview">
        <tr><td><kbd>Space</kbd> / <kbd>Enter</kbd></td><td>End the month</td><td><kbd>Tab</kbd></td><td>Cycle through your cities with idle officers</td></tr>
        <tr><td><kbd>R</kbd></td><td>Realm</td><td><kbd>F</kbd></td><td>Officers</td></tr>
        <tr><td><kbd>D</kbd></td><td>Diplomacy</td><td><kbd>O</kbd></td><td>Objectives</td></tr>
        <tr><td><kbd>S</kbd></td><td>Statistics</td><td><kbd>L</kbd></td><td>Lore (encyclopaedia)</td></tr>
        <tr><td><kbd>M</kbd></td><td>Menu (save, load, undo)</td><td><kbd>?</kbd></td><td>This help</td></tr>
        <tr><td><kbd>+</kbd> / <kbd>−</kbd></td><td>Zoom</td><td><kbd>Arrows</kbd>, <kbd>Home</kbd></td><td>Pan the map, refit</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close a dialog</td><td></td><td></td></tr>
      </table>
      <div class="sec">The month</div>
      <p class="hint">Every officer in a city acts once a month. Farm, Trade, Fortify and Train build the city; Conscript raises troops (needs order 30+); Search finds gold and hidden treasures; Pacify restores order; Appoint grants ranks; Plot works against a neighbour; Transfer moves men and goods; Attack sends up to three commanders with a stance and, for a clever commander, a stratagem. Set each city\'s defence posture in its panel. Diplomacy, Objectives, treasures and exile have their own screens. The README explains every rule.</p>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, { close: closeModal });
  }

  function showMenu() {
    openModal(`<h3>Menu</h3>
      <div class="cmds">
        <button data-act="undo" class="wide" ${Game.canUndo() && !Game.state().observer ? '' : 'disabled'} title="Take back everything you did this month">↶ Undo this month</button>
        <button data-act="save">Quick save</button>
        <button data-act="load" ${Game.hasSave() ? '' : 'disabled'}>Quick load</button>
        ${[1, 2, 3].map((n) => { const info = Game.slotInfo(n); return `<button data-act="save${n}">Save slot ${n}${info ? '' : ' (empty)'}</button><button data-act="load${n}" ${info ? '' : 'disabled'} title="${info ? esc(info.label) : ''}">Load slot ${n}${info ? ': ' + esc(info.label) : ''}</button>`; }).join('')}
        <button class="wide" data-act="hist">${Game.getOption('historicalDeaths') ? '☑' : '☐'} Scripted historical deaths</button>
        <button class="wide btn-red" data-act="quit">Quit to title (unsaved progress is lost)</button>
      </div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, {
      close: closeModal,
      save: () => { Game.save(); closeModal(); toast('Game saved.'); },
      undo: () => { if (Game.undoMonth()) { closeModal(); selected = null; renderAll(); toast('The month begins again.'); } },
      save1: () => { Game.save(1); closeModal(); toast('Saved to slot 1.'); }, save2: () => { Game.save(2); closeModal(); toast('Saved to slot 2.'); }, save3: () => { Game.save(3); closeModal(); toast('Saved to slot 3.'); },
      load1: () => { if (Game.load(1)) { selected = null; closeModal(); renderAll(); toast('Loaded slot 1.'); } }, load2: () => { if (Game.load(2)) { selected = null; closeModal(); renderAll(); toast('Loaded slot 2.'); } }, load3: () => { if (Game.load(3)) { selected = null; closeModal(); renderAll(); toast('Loaded slot 3.'); } },
      load: () => { if (Game.load()) { selected = null; closeModal(); renderAll(); toast('Game loaded.'); } else { closeModal(); toast('Saved game is from an older map and cannot be loaded.'); } },
      quit: () => { closeModal(); backToMenu(); },
      hist: () => { Game.setOption('historicalDeaths', !Game.getOption('historicalDeaths')); renderLog(); showMenu(); },
    });
  }

  // ---------- diplomacy ----------
  function treatyLabel(a, b) {
    const S = Game.state();
    const st = Game.treatyStatus(a, b);
    const d = S.diplomacy[a < b ? `${a}|${b}` : `${b}|${a}`];
    if (st === 'ceasefire') return `Ceasefire (${Math.max(0, d.until - S.turn)} months left)`;
    if (st === 'alliance') return `Alliance (${Math.max(0, d.until - S.turn)} months left)`;
    return 'No treaty';
  }

  function showDiplomacy() {
    const S = Game.state();
    if (S.observer) return showDiplomacyObserver();
    const me = S.player;
    const rows = Object.values(S.factions).filter((f) => f.alive && f.id !== me)
      .map((f) => ({ f, cities: Game.factionProvinces(f.id).length, troops: Game.totalTroops(f.id), rel: Game.relation(me, f.id), st: Game.treatyStatus(me, f.id), border: Game.bordering(me, f.id) }))
      .sort((a, b) => (b.border ? 1 : 0) - (a.border ? 1 : 0) || b.cities - a.cities);
    const gold = Game.factionProvinces(me).reduce((s, p) => s + p.gold, 0);
    const envoys = Game.factionOfficers(me).filter((o) => !o.acted && !Game.isRuler(o) && Game.prov(o.city).owner === me).length;
    openModal(`<h3>Diplomacy — ${esc(Game.fname(me))}</h3>
      <p class="hint">Envoys cost gold from their city (ceasefire ${Game.DIP_COST.ceasefire}, alliance ${Game.DIP_COST.alliance}, joint war ${Game.DIP_COST.joint}) and use up the officer's month. ${envoys} officer${envoys === 1 ? '' : 's'} available as envoys. Treasury: ${fmt(gold)} gold.</p>
      <table class="dipl"><tr><th></th><th>House</th><th>Strength</th><th>Relations</th><th>Treaty</th><th></th></tr>
      ${rows.map((r) => `<tr>
        <td><span class="chip" style="background:${r.f.color}"></span></td>
        <td>${esc(r.f.name)}${r.border ? ' <small style="color:var(--muted)">(neighbour)</small>' : ''}${(r.f.persona || []).length ? `<br><small class="persona">${esc((r.f.persona || []).join(', '))}</small>` : ''}${r.f.treachery > 0 ? ` <small class="persona" style="color:#e29a8f" title="Has broken treaties or struck right after a ceasefire lapsed">untrustworthy ×${r.f.treachery}</small>` : ''}</td>
        <td>${r.cities} cities · ${fmt(r.troops)}</td>
        <td class="rel-${Game.relationWord(r.rel)}">${Game.relationWord(r.rel)} (${r.rel})</td>
        <td class="st-${r.st}">${treatyLabel(me, r.f.id)}</td>
        <td class="acts">
          <button class="btn-sm" data-act="gift" data-f="${r.f.id}">Gift</button>
          ${r.st === 'neutral' ? `<button class="btn-sm" data-act="cease" data-f="${r.f.id}">Ceasefire</button>` : ''}
          ${r.st !== 'alliance' ? `<button class="btn-sm" data-act="ally" data-f="${r.f.id}">Alliance</button>` : `<button class="btn-sm" data-act="joint" data-f="${r.f.id}">Joint war</button>${(S.diplomacy[me < r.f.id ? `${me}|${r.f.id}` : `${r.f.id}|${me}`].until - S.turn) <= 12 ? `<button class="btn-sm" data-act="ally" data-f="${r.f.id}">Renew</button>` : ''}`}
          ${r.st !== 'neutral' ? `<button class="btn-sm btn-red" data-act="break" data-f="${r.f.id}">Break</button>` : ''}
        </td></tr>`).join('')}</table>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, {
      close: closeModal,
      gift: (el) => giftDialog(el.dataset.f),
      cease: (el) => envoyDialog(el.dataset.f, 'ceasefire'),
      ally: (el) => envoyDialog(el.dataset.f, 'alliance'),
      joint: (el) => jointDialog(el.dataset.f),
      break: (el) => {
        const t = el.dataset.f;
        openModal(`<h3>Break the ${Game.treatyStatus(me, t)} with ${esc(Game.fname(t))}?</h3><p>Relations with ${esc(Game.fname(t))} will collapse and every other lord will think less of you.</p>
          <div class="modal-actions"><button data-act="cancel">Keep it</button><button class="btn btn-red" data-act="ok">Break it</button></div>`, {
          cancel: showDiplomacy,
          ok: () => { const r = Game.breakTreaty(me, t); showResult(r.msg, () => { renderAll(); showDiplomacy(); }); },
        });
      },
    });
  }

  function envoyList(me, target, type) {
    return Game.factionOfficers(me).filter((o) => !o.acted && !Game.isRuler(o) && Game.prov(o.city).owner === me)
      .sort((a, b) => (b.chr + b.pol) - (a.chr + a.pol));
  }

  function envoyDialog(target, type) {
    const S = Game.state(); const me = S.player;
    const list = envoyList(me, target, type);
    const desc = type === 'ceasefire'
      ? `Propose a ${Game.CEASEFIRE_MONTHS}-month ceasefire to <b>${esc(Game.fname(target))}</b>. Weaker houses accept readily; the strong rarely do. Success depends on the envoy's <b>CHR</b> and <b>POL</b> and on relations (${Game.relationWord(Game.relation(me, target))}).`
      : `Propose a ${Game.ALLIANCE_MONTHS / 12}-year alliance to <b>${esc(Game.fname(target))}</b>. Allies never attack each other and can be asked to join wars; a standing alliance is renewed for another term. Friendly relations, a shared enemy, and your own strength all help.`;
    const treasures = Game.houseItems(me);
    chooseOfficer(`Send an envoy — ${type}`, desc + (treasures.length ? `<div class="row" style="margin-top:8px"><label>Sweetener</label><select id="env-item" style="flex:1"><option value="">— none —</option>${treasures.map((it) => `<option value="${it.id}">${esc(it.name)} · odds +${Math.round(Math.min(0.35, Game.itemValue(it) / 100) * 100)}%</option>`).join('')}</select></div><div class="hint">A treasure offered as a concession passes to their lord if they accept.</div>` : ''), list,
      (o) => `${Math.round(Game.acceptChance(me, target, type, o) * 100)}% · ${esc(Game.pname(o.city))} (${fmt(Game.prov(o.city).gold)}g)`,
      (n) => { const sel = $('#env-item'); const r = Game.proposeTreaty(me, target, type, n, sel && sel.value ? sel.value : null); if (!r.ok) { result(r); return; } renderAll(); showResult(r.msg, showDiplomacy); });
    if (!list.length) return;
    modalHandlers.cancel = showDiplomacy;
  }

  function jointDialog(ally) {
    const S = Game.state(); const me = S.player;
    const enemies = Object.values(S.factions).filter((f) => f.alive && f.id !== me && f.id !== ally && Game.bordering(ally, f.id) && Game.treatyStatus(ally, f.id) === 'neutral' && Game.treatyStatus(me, f.id) === 'neutral');
    if (!enemies.length) { showResult(`${Game.fname(ally)} shares no border with a house you could both fight.`, showDiplomacy); return; }
    openModal(`<h3>Ask ${esc(Game.fname(ally))} to join a war</h3>
      <p>If they agree, their armies will favour that enemy for six months.</p>
      <div class="row"><label>Against</label><select id="jw-enemy" style="flex:1">${enemies.map((f) => `<option value="${f.id}">${esc(f.name)} — ${Game.factionProvinces(f.id).length} cities · ${fmt(Game.totalTroops(f.id))} troops</option>`).join('')}</select></div>
      <div class="modal-actions"><button data-act="cancel">Back</button><button class="btn btn-gold" data-act="ok">Choose envoy</button></div>`, {
      cancel: showDiplomacy,
      ok: () => {
        const enemy = $('#jw-enemy').value;
        const list = envoyList(me, ally, 'joint');
        chooseOfficer('Send an envoy — joint war', `Ask <b>${esc(Game.fname(ally))}</b> to march against <b>${esc(Game.fname(enemy))}</b>.`, list,
          (o) => `${Math.round(Game.acceptChance(me, ally, 'joint', o) * 100)}% · ${esc(Game.pname(o.city))} (${fmt(Game.prov(o.city).gold)}g)`,
          (n) => { const r = Game.requestJointAttack(me, ally, enemy, n); if (!r.ok) { result(r); return; } renderAll(); showResult(r.msg, showDiplomacy); });
        if (list.length) modalHandlers.cancel = showDiplomacy;
      },
    });
  }

  function giftDialog(target) {
    const S = Game.state(); const me = S.player;
    const cities = Game.factionProvinces(me).filter((p) => p.gold > 0).sort((a, b) => b.gold - a.gold);
    if (!cities.length) { showResult('You have no gold to give.', showDiplomacy); return; }
    const refresh = () => {
      const g = Math.max(0, +$('#gf-gold').value || 0);
      $('#gf-out').textContent = `Relations +${Math.min(20, 3 + Math.floor(g / 100))}`;
      $('#gf-gold').max = Game.prov($('#gf-city').value).gold;
    };
    const treasures = Game.houseItems(me);
    openModal(`<h3>Gifts for ${esc(Game.fname(target))}</h3>
      <p>Relations now: <span class="rel-${Game.relationWord(Game.relation(me, target))}">${Game.relationWord(Game.relation(me, target))} (${Game.relation(me, target)})</span>. Gifts need no envoy. Gold gives up to +20; a treasure gives more, and the Imperial Seal most of all.</p>
      ${treasures.length ? `<div class="row"><label>Treasure</label><select id="gf-item" style="flex:1"><option value="">— gold only —</option>${treasures.map((it) => `<option value="${it.id}">${esc(it.name)} (held by ${esc(S.items[it.id].owner)}) · relations +${Math.min(35, Game.itemValue(it))}</option>`).join('')}</select></div>` : ''}
      <div class="row"><label>From city</label><select id="gf-city">${cities.map((c) => `<option value="${c.id}">${esc(Game.pname(c.id))} (${fmt(c.gold)} gold)</option>`).join('')}</select></div>
      <div class="row"><label>Gold</label><input type="number" id="gf-gold" min="1" value="${Math.min(300, cities[0].gold)}"></div>
      <div class="row"><label>Effect</label><span id="gf-out"></span></div>
      <div class="modal-actions"><button data-act="cancel">Back</button><button class="btn btn-gold" data-act="ok">Send</button></div>`, {
      cancel: showDiplomacy, oninput: refresh,
      ok: () => { const sel = $('#gf-item'); if (sel && sel.value) { const r = Game.giftItem(me, target, sel.value); if (!r.ok) { result(r); return; } renderAll(); showResult(r.msg, showDiplomacy); return; } const r = Game.sendGift(me, target, $('#gf-city').value, +$('#gf-gold').value); if (!r.ok) { result(r); return; } renderAll(); showResult(r.msg, showDiplomacy); },
    });
    refresh();
  }

  // ---------- historical decisions ----------
  function handleDecisions(done) {
    const S = Game.state();
    const d = S.pendingDecisions[0];
    if (!d) { done(); return; }
    const ev = EVENTS.find((e) => e.id === d.id);
    if (!ev) { Game.decide(0, 0); handleDecisions(done); return; }
    openModal(`<h3>${esc(ev.title)}</h3>
      <p>${ev.decision.prompt(eventApiForUi(), S, d.ctx)}</p>
      <div class="modal-actions">${ev.decision.options.map((o, i) => `<button class="${i === 0 ? 'btn btn-gold' : ''}" data-act="opt" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`, {
      opt: (el) => { const r = Game.decide(0, +el.dataset.i); renderAll(); showResult(r.msg, () => handleDecisions(done)); },
    }, true);
  }
  // prompts only need names and the like; pass a small read-only helper set
  function eventApiForUi() { return { pname: Game.pname, fname: Game.fname, rulerOf: Game.rulerOf, factionProvinces: Game.factionProvinces, relation: Game.relation }; }

  function showObjectives() {
    const S = Game.state();
    const houses = S.observer ? Object.values(S.factions).filter((f) => f.alive && OBJECTIVES.some((o) => o.house === f.id)) : [S.factions[S.player]];
    const statusHtml = (ob) => {
      const st = Game.objectiveStatus(ob);
      const cls = st.state === 'done' ? 'good' : st.state === 'missed' ? 'bad' : st.state === 'future' ? 'sys' : '';
      const label = st.state === 'done' ? `✓ completed ${S.objectivesDone[`${ob.house}:${ob.id}`]}` : st.state === 'missed' ? `✗ missed (by ${ob.to})` : st.state === 'future' ? `from ${ob.from}` : `${st.progress ? st.progress + ' · ' : ''}until ${ob.to}`;
      return `<div class="n ${cls}"><b>${esc(ob.title)}</b> <span class="hint">${label}</span><br>${esc(ob.desc)}</div>`;
    };
    const fired = EVENTS.filter((e) => S.eventsFired[e.id]).map((e) => esc(e.title)).join(', ');
    let body = '';
    for (const h of houses) {
      const list = OBJECTIVES.filter((o) => o.house === h.id);
      body += `<div class="sec"><span class="chip" style="background:${h.color}"></span> ${esc(h.name)} · prestige ${h.prestige || 0}${h.hasEmperor ? ' · 👑 holds the Emperor' : ''}</div>`;
      body += list.length ? `<div class="notices">${list.map(statusHtml).join('')}</div>` : '<div class="hint">This house has no recorded destiny. Write your own.</div>';
    }
    openModal(`<h3>Objectives${S.observer ? ' of the realm' : ''}</h3>
      <p class="hint">Objectives are drawn from history. Completing one grants troops, gold, officers or prestige. Prestige raises recruitment odds, steadies loyalty and warms other lords to your envoys.</p>
      ${body}
      <div class="sec">Treasures of the realm</div>
      <table class="overview"><tr><th></th><th>Treasure</th><th>Effect</th><th>Held by</th></tr>
      ${Game.ITEMS.map((it) => { const st = S.items[it.id]; const holder = st.owner && S.officers[st.owner] ? S.officers[st.owner] : null; const where = holder ? `${esc(holder.name)} <small style="color:var(--muted)">(${esc(Game.fname(holder.faction))})</small>` : (S.observer || (st.city && S.provinces[st.city].owner === S.player)) ? `<span class="hint">hidden somewhere in ${esc(Game.pname(st.city))}</span>` : '<span class="hint">whereabouts unknown</span>'; return `<tr><td>${ITEM_ICON[it.type] || '✦'}</td><td>${esc(it.name)}</td><td><small>${esc(it.desc)}</small></td><td>${where}</td></tr>`; }).join('')}</table>
      <div class="sec">Events so far</div><div class="hint">${fired || 'None yet.'}</div>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, { close: closeModal });
  }

  function handleSuccession(done) {
    const S = Game.state();
    const ps = S.pendingSuccession;
    if (!ps || ps.fid !== S.player || !S.factions[S.player].alive) { done(); return; }
    const cands = ps.candidates.map(Game.off).filter((o) => o && o.faction === S.player && !o.captive);
    if (cands.length < 2) { S.pendingSuccession = null; done(); return; }
    const current = S.factions[S.player].ruler;
    openModal(`<h3>The seat of the house</h3>
      <p>Your lord is dead. <b>${esc(current)}</b> has taken the seat for now, but the council awaits your choice of heir. The ruler's <b>CHR</b> steadies the loyalty of every officer.</p>
      ${pickList(cands, { extra: (o) => `loyalty ${o.loyalty}${o.name === current ? ' · presumptive' : ''}` })}
      <div class="modal-actions"><button class="btn btn-gold" data-act="ok">Confirm heir</button></div>`, {
      ok: () => {
        const n = picked()[0] || current;
        const r = Game.chooseHeir(S.player, n);
        closeModal(); renderAll();
        showResult(r.ok ? r.msg : `${current} keeps the seat.`, done);
      },
    }, true);
  }

  function handleProposals(done) {
    const S = Game.state();
    const pr = S.pendingProposals[0];
    if (!pr) { done(); return; }
    const from = Game.fac(pr.from);
    if (!from || !from.alive) { Game.respondProposal(0, false); handleProposals(done); return; }
    const rel = Game.relation(S.player, pr.from);
    const text = pr.type === 'ceasefire' ? `proposes a ${Game.CEASEFIRE_MONTHS}-month ceasefire. Neither side may attack the other until it expires.`
      : pr.type === 'alliance' ? `proposes a ${Game.ALLIANCE_MONTHS / 12}-year alliance. Allies never attack each other and may call on one another in war.`
      : `asks you to join a war against <b>${esc(Game.fname(pr.enemy))}</b>. If you agree, your name is bound to the campaign for six months.`;
    openModal(`<h3>An envoy from ${esc(from.name)}</h3>
      <div class="captive-card"><div class="cn">${esc(pr.envoy)}</div><div class="cs">Envoy of ${esc(from.name)} · ${Game.factionProvinces(pr.from).length} cities · ${fmt(Game.totalTroops(pr.from))} troops<br>Relations: <span class="rel-${Game.relationWord(rel)}">${Game.relationWord(rel)} (${rel})</span> · ${treatyLabel(S.player, pr.from)}</div></div>
      <p>${esc(from.name)} ${text}${pr.sweetener && S.items[pr.sweetener] && S.items[pr.sweetener].owner ? ` As a token of good faith the envoy carries the <b>${esc(Game.itemData(pr.sweetener).name)}</b>, yours if you accept.` : ''}</p>
      <div class="modal-actions"><button data-act="no">Decline</button><button class="btn btn-gold" data-act="yes">Accept</button></div>`, {
      yes: () => { const r = Game.respondProposal(0, true); renderAll(); showResult(r.msg, () => handleProposals(done)); },
      no: () => { const r = Game.respondProposal(0, false); renderAll(); showResult(r.msg, () => handleProposals(done)); },
    }, true);
  }

  function showDiplomacyObserver() {
    const S = Game.state();
    const alive = Object.values(S.factions).filter((f) => f.alive);
    const pacts = Object.entries(S.diplomacy).filter(([k, d]) => d.status !== 'neutral' && k.split('|').every((f) => S.factions[f].alive));
    const rows = alive.map((f) => {
      const al = Game.allies(f.id).map(Game.fname);
      const cf = alive.filter((g) => g.id !== f.id && Game.treatyStatus(f.id, g.id) === 'ceasefire').map((g) => g.name);
      const foes = alive.filter((g) => g.id !== f.id && Game.relation(f.id, g.id) <= -40).map((g) => g.name);
      return `<tr><td><span class="chip" style="background:${f.color}"></span></td><td>${esc(f.name)}</td><td class="st-alliance">${esc(al.join(', ')) || '<span class="st-neutral">—</span>'}</td><td class="st-ceasefire">${esc(cf.join(', ')) || '<span class="st-neutral">—</span>'}</td><td class="rel-Hostile">${esc(foes.join(', ')) || '<span class="st-neutral">—</span>'}</td></tr>`;
    });
    openModal(`<h3>Treaties of the realm — ${esc(Game.dateStr())}</h3>
      <p class="hint">${pacts.length} active treat${pacts.length === 1 ? 'y' : 'ies'} among ${alive.length} houses.</p>
      <table class="dipl"><tr><th></th><th>House</th><th>Allies</th><th>Ceasefires</th><th>Hostile toward</th></tr>${rows.join('')}</table>
      <div class="modal-actions"><button class="btn btn-gold" data-act="close">Close</button></div>`, { close: closeModal });
  }

  // ---------- observer auto-play ----------
  let autoTimer = null;
  function autoInterval() { const v = parseInt($('#auto-speed').value, 10); return Number.isFinite(v) ? v : 600; }
  function startAutoTimer() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      const S = Game.state();
      const notices = Game.endTurn();
      renderAll();
      if (S.over) { stopAuto(); showGameOver(); return; }
      const majors = notices.filter((n) => n.major);
      if (majors.length && $('#auto-pause').checked) { stopAuto(); showMajorEvents(majors); }
    }, autoInterval());
  }
  function showMajorEvents(majors) {
    openModal(`<h3>${esc(Game.dateStr())} — a turning point</h3>
      <div class="notices">${majors.map((n) => `<div class="n ${n.cls}">${esc(n.text)}${n.report ? '<button class="btn-sm" data-act="rep">View battle</button>' : ''}</div>`).join('')}</div>
      <div class="modal-actions"><button data-act="close">Keep looking</button><button class="btn btn-gold" data-act="resume">▶▶ Resume auto</button></div>`, {
      close: closeModal,
      resume: () => { closeModal(); toggleAuto(); },
      rep: () => { const r = majors.find((n) => n.report); if (r) showBattle(r.report, () => showMajorEvents(majors)); },
    }, true);
  }
  function toggleAuto() {
    if (autoTimer) { stopAuto(); return; }
    closeModal();
    startAutoTimer();
    $('#btn-auto').textContent = '■ Stop';
    $('#btn-auto').classList.add('on');
  }
  function initAutoSpeed() {
    const pause = $('#auto-pause');
    try { const savedP = localStorage.getItem('rotk_auto_pause'); if (savedP !== null) pause.checked = savedP === '1'; } catch (e) { /* ignore */ }
    pause.addEventListener('change', () => { try { localStorage.setItem('rotk_auto_pause', pause.checked ? '1' : '0'); } catch (e) { /* ignore */ } });
    const sel = $('#auto-speed');
    try { const saved = localStorage.getItem('rotk_auto_speed'); if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved; } catch (e) { /* ignore */ }
    sel.addEventListener('change', () => {
      try { localStorage.setItem('rotk_auto_speed', sel.value); } catch (e) { /* ignore */ }
      if (autoTimer) startAutoTimer();   // apply the new pace at once
    });
  }
  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    const b = $('#btn-auto');
    if (b) { b.textContent = '▶▶ Auto'; b.classList.remove('on'); }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', UI.init);
