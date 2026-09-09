// ============================================================
//  The era pack: Romance of the Three Kingdoms, 189-320.
//
//  Everything the engine needs to know about *this* age lives in this
//  folder: era.js (the manifest below), data.js (the map, houses,
//  officers, titles and scenarios), events.js (the history), geo.js
//  (coastlines and rivers, generated) and hexmaps.js (the battle maps,
//  generated). The engine in js/ knows no names, no dates and no
//  dynasties; it reads this object for the few rules that differ
//  between ages.
// ============================================================
const ERA = {
  id: 'threekingdoms',
  title: 'Romance of the Three Kingdoms',
  sigil: '三國志',
  blurb: 'The Han is falling. Unite the realm under your rule.',

  // where this era's generated pictures live
  assets: {
    relief: 'img/eras/threekingdoms/relief.png',
    hex: 'img/eras/threekingdoms/hex/',
  },

  // the map window: an equirectangular projection, shared by the game and by
  // tools/buildmap.js, buildrelief.js and buildhex.js, which generate from it
  map: { W: 1400, H: 1180, lon0: 100.5, lat1: 42.4, kx: 56, ky: 55.5 },

  rules: {
    // champions ride out to call each other to single combat
    duels: true,
    // how a walled city is broken: 'gates' (rams at the wall) or 'artillery'
    // (siege trains batter the gate from as far as they can shoot)
    siege: 'gates',
    // a court that grants ranks and titles to its officers
    titles: true,
    // the prize that lends legitimacy: whoever holds it recruits, treats and
    // taxes better. Its bonus to income and to envoys is in the engine.
    legitimacy: { enabled: true, label: 'the Emperor' },
  },
};
