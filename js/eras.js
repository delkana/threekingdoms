// ============================================================
//  The register of eras, and the loader that brings one in.
//
//  Each era is a folder under js/eras/ holding era.js (its manifest and
//  rules), data.js (map, houses, officers, scenarios), events.js, and the
//  generated geo.js and hexmaps.js. The engine files that follow are the
//  same for every age.
//
//  Choose one with ?era=<id> in the address; the choice is remembered.
//  The files are written into the page as it parses, so that the engine
//  below them finds its data already in place.
// ============================================================
const ERAS = [
  { id: 'threekingdoms', title: 'Romance of the Three Kingdoms', years: '189-320', dir: 'js/eras/threekingdoms' },
];
const ERA_FILES = ['era.js', 'data.js', 'events.js', 'geo.js', 'hexmaps.js'];

const ERA_ID = (() => {
  const known = (id) => ERAS.some((e) => e.id === id);
  try {
    const asked = new URLSearchParams(location.search).get('era');
    if (asked && known(asked)) { localStorage.setItem('rotk_era', asked); return asked; }
    const saved = localStorage.getItem('rotk_era');
    if (saved && known(saved)) return saved;
  } catch (e) { /* a browser that will not have its storage read */ }
  return ERAS[0].id;
})();
const ERA_DIR = (ERAS.find((e) => e.id === ERA_ID) || ERAS[0]).dir;

if (typeof document !== 'undefined' && document.write) {
  const v = (document.currentScript && document.currentScript.src.split('?v=')[1]) || '';
  for (const f of ERA_FILES) document.write(`<script src="${ERA_DIR}/${f}${v ? '?v=' + v : ''}"><\/script>`);
}
