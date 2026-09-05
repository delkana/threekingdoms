// Battle calibration: win rate of an attack vs. estimated strength ratio.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/../js/data.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../js/events.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../js/game.js', 'utf8');
const ctx = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.Game = Game;', ctx);
const { Game } = ctx;

const DEF = +process.argv[2] || 220; // wall value of the defender
const trials = 300;
const attNames = ['Xiahou Dun', 'Cao Ren', 'Xun Yu'];
for (const ratio of [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5]) {
  let wins = 0, lossA = 0, lossD = 0;
  for (let i = 0; i < trials; i++) {
    Game.newGame('caocao');
    const S = Game.state();
    const from = S.provinces.chenliu, to = S.provinces.xiapi;
    to.defense = DEF; to.troops = 15000; to.training = 55; from.training = 55; from.food = 1e9;
    const def = Game.officersIn('xiapi', 'taoqian');
    const mx = (l, k) => Math.max(...l.map((o) => o[k]));
    const att = attNames.map(Game.off);
    const dPow = to.troops * (0.5 + mx(def, 'war') / 100) * (0.7 + mx(def, 'ldr') / 250) * (0.7 + to.training / 300) * (1 + to.defense / 500);
    const perTroop = (0.5 + mx(att, 'war') / 100) * (0.7 + mx(att, 'ldr') / 250) * (0.7 + from.training / 300);
    const troops = Math.round((ratio * dPow) / perTroop);
    from.troops = troops + 1;
    const r = Game.attack('chenliu', 'xiapi', attNames, troops);
    if (!r.ok) { console.log(r.msg); process.exit(1); }
    if (r.report.result === 'captured') wins++;
    lossA += r.report.startA - r.report.endA; lossD += r.report.startD - r.report.endD;
  }
  console.log(`walls ${DEF} ratio ${ratio.toFixed(1)}: win ${(wins / trials * 100).toFixed(0)}%  avg losses att ${Math.round(lossA / trials)} def ${Math.round(lossD / trials)}`);
}
