// ============================================================
//  Historical events, decisions, objectives and destiny paths.
//
//  Each event has a date window and a `when` test that returns a context
//  object (or null) when the situation on the map allows it to fire. Plain
//  events then run `apply`; decision events offer options, which the player
//  chooses in a popup and the AI picks by weight. Events fire once unless
//  marked `repeat` (then at most once a year). Late-game events are written
//  against roles (the Emperor's holder, the kingdom behind the passes, the
//  power on the Yangtze) so they still happen in an ahistoric world.
//
//  `E` is the helper API exposed by the engine (see game.js: eventApi).
// ============================================================

// ---- helpers for the later age ----
const DYNASTY = { caocao: 'Wei', liubei: 'Han', sunjian: 'Wu', yuanshao: 'Zhao', yuanshu: 'Zhong', liuzhang: 'Shu', liubiao: 'Chu', mateng: 'Liang', gongsundu: 'Yan', gongsunzan: 'Ji', dongzhuo: 'Qin', lubu: 'Jin', zhanglu: 'Hanning', liuyao: 'Yue', taoqian: 'Xu' };
const dynastyName = (S, fid) => DYNASTY[fid] || `${S.factions[fid].ruler.split(' ')[0]} dynasty`;
const flags = (S) => (S.flags = S.flags || {});
const bigHouses = (E, S, min) => Object.values(S.factions).filter((f) => f.alive && !f.raider && !f.guest && E.factionProvinces(f.id).length >= min);
const REBEL_COLORS = ['#a52a2a', '#6b4c9a', '#2f6f6f', '#8a7a2a', '#9c4f96', '#4f7942', '#b5651d', '#5f6f9f'];
const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '');
const seatOf = (E, fid) => E.rulerOf(fid).city;
// the house's city facing `other` with the most troops
const frontCity = (E, S, fid, other) => E.factionProvinces(fid).filter((p) => S.adj[p.id].some((n) => S.provinces[n].owner === other)).sort((a, b) => b.troops - a.troops)[0] || null;

const EVENTS = [
  // ---------------------------------------------------------- Liu Bei
  {
    id: 'xu-bequest', title: 'Tao Qian bequeaths Xu Province',
    from: [194, 12], to: [196, 12],
    when: (E, S) => {
      const lb = S.factions.liubei, tq = S.factions.taoqian;
      if (!lb || !lb.alive || !tq || !tq.alive) return null;
      if (S.provinces.xiapi.owner !== 'taoqian') return null;
      if (!(E.relation('liubei', 'taoqian') >= 10 || (lb.guest && lb.host === 'taoqian'))) return null;
      return { cities: ['xiapi', 'xiaopei', 'langya', 'pengcheng'].filter((c) => S.provinces[c].owner === 'taoqian') };
    },
    apply: (E, S, ctx) => {
      const names = E.factionOfficers('taoqian').map((o) => o.name);
      for (const c of ctx.cities) E.transferCity(c, 'liubei');
      for (const n of names) E.joinHouse(n, 'liubei', 70);
      E.dissolveHouse('taoqian');
      E.wake('liubei', 'xiapi');
      E.prestige('liubei', 15);
      return `Dying, Tao Qian entrusts Xu Province to Liu Bei: "Only you can bring peace to this land." ${E.pname('xiapi')}${ctx.cities.length > 1 ? ' and ' + ctx.cities.slice(1).map(E.pname).join(', ') : ''} pass to the house of Liu Bei, and ${names.join(', ')} enter his service.`;
    },
  },
  {
    id: 'xinye-grant', title: 'Liu Biao grants Xinye',
    from: [201, 1], to: [203, 12],
    when: (E, S) => {
      const lb = S.factions.liubei, lbi = S.factions.liubiao;
      if (!lb || !lb.alive || !lbi || !lbi.alive) return null;
      if (S.provinces.xinye.owner !== 'liubiao') return null;
      if (E.factionProvinces('liubei').length > 0) return null; // only for a landless Liu Bei
      if (E.relation('liubei', 'liubiao') < -20) return null;
      return {};
    },
    apply: (E, S) => {
      E.transferCity('xinye', 'liubei');
      E.wake('liubei', 'xinye');
      E.shiftRelation('liubei', 'liubiao', 30);
      E.ceasefire('liubei', 'liubiao', 24);
      E.prestige('liubei', 10);
      return 'Liu Biao receives his kinsman Liu Bei with honour and grants him Xinye to guard the northern border of Jing Province.';
    },
  },
  {
    id: 'three-visits', title: 'Three visits to the thatched cottage',
    from: [207, 1], to: [209, 6],
    when: (E, S) => {
      if (S.officers['Zhuge Liang']) return null;
      const owners = ['xinye', 'xiangyang'].map((c) => S.provinces[c].owner).filter((f) => f && S.factions[f].alive && !S.factions[f].raider);
      if (!owners.length) return null;
      let fid = owners.includes('liubei') ? 'liubei' : owners.sort((a, b) => E.rulerOf(b).chr - E.rulerOf(a).chr)[0];
      if (E.rulerOf(fid).chr < 75) return null;
      const city = S.provinces.xinye.owner === fid ? 'xinye' : 'xiangyang';
      return { fid, city };
    },
    apply: (E, S, ctx) => {
      E.addOfficer({ name: 'Zhuge Liang', ldr: 88, war: 55, int: 100, pol: 98, chr: 92, faction: ctx.fid, city: ctx.city, loyalty: 100, born: 181 });
      E.prestige(ctx.fid, 10);
      return `${E.rulerOf(ctx.fid).name} calls three times at a thatched cottage in the hills near ${E.pname(ctx.city)}. On the third visit the Sleeping Dragon, Zhuge Liang, agrees to serve.`;
    },
  },
  {
    id: 'liu-zhang-invites', title: 'Liu Zhang invites Liu Bei into Shu',
    from: [211, 1], to: [213, 12],
    when: (E, S) => {
      const lb = S.factions.liubei, lz = S.factions.liuzhang;
      if (!lb || !lb.alive || !lz || !lz.alive || lb.guest) return null;
      if (E.factionProvinces('liubei').length < 2) return null;
      if (E.factionProvinces('liuzhang').length < 2 || S.provinces.chengdu.owner !== 'liuzhang') return null;
      if (E.bordering('liubei', 'liuzhang')) return null;
      const gate = E.factionProvinces('liuzhang').find((p) => ['yongan', 'zitong'].includes(p.id)) || E.factionProvinces('liuzhang').find((p) => p.id !== 'chengdu');
      return gate ? { gate: gate.id } : null;
    },
    decision: {
      house: 'liubei',
      prompt: (E, S, ctx) => `Liu Zhang, fearful of Zhang Lu and Cao Cao, invites Liu Bei to enter Shu and take command of its defence. He offers ${E.pname(ctx.gate)} as a base. Zhang Song whispers that Shu could be yours.`,
      options: [
        { label: 'Accept and enter Shu', ai: 0.8, apply: (E, S, ctx) => {
          E.transferCity(ctx.gate, 'liubei');
          E.shiftRelation('liubei', 'liuzhang', -40);
          E.prestige('liubei', -5);
          return `Liu Bei marches into Shu as Liu Zhang's guest and takes ${E.pname(ctx.gate)} as his base. Liu Zhang's officers mutter that the wolf has been let into the fold.`;
        } },
        { label: 'Decline out of loyalty to kin', ai: 0.2, apply: (E) => { E.prestige('liubei', 10); return 'Liu Bei declines to raise a hand against his kinsman. The land admires his virtue, and Shu remains beyond his reach.'; } },
      ],
    },
  },
  // ---------------------------------------------------------- the Sun family
  {
    id: 'sun-quan', minor: true, title: 'Sun Quan comes of age',
    from: [196, 1], to: [200, 3],
    when: (E, S) => {
      const su = S.factions.sunjian;
      if (!su || !su.alive || S.officers['Sun Quan']) return null;
      const home = E.factionProvinces('sunjian')[0];
      return { city: home ? home.id : E.rulerOf('sunjian').city };
    },
    apply: (E, S, ctx) => {
      E.addOfficer({ name: 'Sun Quan', ldr: 82, war: 70, int: 78, pol: 85, chr: 90, faction: 'sunjian', city: ctx.city, loyalty: 100, born: 182 });
      return 'Sun Quan, second son of the Tiger of Jiangdong, comes of age and takes his place among the officers of the house.';
    },
  },
  {
    id: 'jiangdong-expedition', title: "Sun Ce's Jiangdong expedition",
    from: [194, 6], to: [199, 12],
    when: (E, S) => {
      const su = S.factions.sunjian;
      if (!su || !su.alive) return null;
      const owned = E.factionProvinces('sunjian').map((p) => p.id);
      if (owned.length > 4) return null;
      if (owned.some((c) => ['jianye', 'wu', 'kuaiji', 'chaisang', 'lujiang'].includes(c))) return null;
      const order = ['lujiang', 'chaisang', 'jianye', 'wu'];
      let landing = order.find((c) => !S.provinces[c].owner);
      if (!landing) landing = order.find((c) => { const o = S.provinces[c].owner; return o && o !== 'sunjian' && !S.factions[o].raider && E.factionProvinces(o).length <= 2 && E.treatyStatus('sunjian', o) === 'neutral'; });
      if (!landing) return null;
      return { landing, changsha: S.provinces.changsha.owner === 'sunjian' };
    },
    decision: {
      house: 'sunjian',
      prompt: (E, S, ctx) => `Yuan Shu covets the Imperial Seal that Sun Jian found in the ruins of Luoyang. ${E.rulerOf('sunjian').name} could trade it for soldiers and sail down the Yangtze to carve out a realm in Jiangdong, landing at ${E.pname(ctx.landing)}.${ctx.changsha ? ' Changsha would have to be left behind.' : ''}`,
      options: [
        { label: 'Sail for Jiangdong', ai: 0.85, apply: (E, S, ctx) => {
          const prev = S.provinces[ctx.landing].owner;
          E.transferCity(ctx.landing, 'sunjian');
          const p = S.provinces[ctx.landing];
          p.troops += 15000; p.training = Math.max(p.training, 70); p.fleet = Math.max(p.fleet || 0, 40); p.food += 30000; p.gold += 2000;
          E.moveHouse('sunjian', ctx.landing);   // the household sails before Changsha is given up
          if (ctx.changsha) { const cs = S.provinces.changsha; p.troops += Math.floor(cs.troops * 0.5); cs.troops -= Math.floor(cs.troops * 0.5); E.transferCity('changsha', S.factions.liubiao && S.factions.liubiao.alive ? 'liubiao' : null); }
          for (const n of ['Zhou Yu', 'Lu Su', 'Zhang Zhao']) E.joinHouse(n, 'sunjian', 90, ctx.landing, true);
          if (S.factions.yuanshu && S.factions.yuanshu.alive) { E.shiftRelation('sunjian', 'yuanshu', 30); E.ceasefire('sunjian', 'yuanshu', 24); const st = S.items['imperial-seal']; const yr = E.rulerOf('yuanshu'); if (st && st.owner && S.officers[st.owner] && S.officers[st.owner].faction === 'sunjian' && yr) E.giveItem('imperial-seal', yr.name); }
          E.prestige('sunjian', 15);
          return `${E.rulerOf('sunjian').name} hands the Imperial Seal to Yuan Shu, gathers his father's veterans and sails east. The house lands at ${E.pname(ctx.landing)}${prev ? ', driving out ' + E.fname(prev) : ''}. Zhou Yu, Lu Su and Zhang Zhao rally to the banner of the Sun.`;
        } },
        { label: 'Stay in Jing', ai: 0.15, apply: (E) => { E.prestige('sunjian', 5); return 'The house of Sun keeps the Seal and its place in the middle Yangtze, and Jiangdong must wait.'; } },
      ],
    },
  },
  // ---------------------------------------------------------- the Emperor
  {
    id: 'emperor', title: 'The Emperor finds a protector',
    from: [196, 1], to: [198, 12],
    when: (E, S) => {
      if (Object.values(S.factions).some((f) => f.hasEmperor)) return null;
      const cand = ['xuchang', 'luoyang', 'changan'].map((c) => S.provinces[c].owner).filter((f) => f && S.factions[f].alive && !S.factions[f].raider);
      if (!cand.length) return null;
      const fid = cand.includes('caocao') ? 'caocao' : cand[0];
      const city = ['xuchang', 'luoyang', 'changan'].find((c) => S.provinces[c].owner === fid);
      return { fid, city };
    },
    apply: (E, S, ctx) => {
      S.factions[ctx.fid].hasEmperor = true;
      E.prestige(ctx.fid, 30);
      for (const f of Object.keys(S.factions)) if (f !== ctx.fid && S.factions[f].alive) E.shiftRelation(ctx.fid, f, 10);
      return `The young Emperor, hungry and half-forgotten, is escorted to ${E.pname(ctx.city)} under the protection of ${E.fname(ctx.fid)}. Edicts now go out in the Emperor's name, and the other lords must weigh their words.`;
    },
  },
  // ---------------------------------------------------------- Cao Cao
  {
    id: 'yan-province', title: 'Cao Cao takes Yan Province',
    from: [192, 4], to: [193, 12],
    when: (E, S) => {
      const cc = S.factions.caocao, ld = S.factions.liudai;
      if (!cc || !cc.alive || !ld || !ld.alive) return null;
      if (S.officers['Liu Dai']) return null; // fires only once Liu Dai is dead
      if (S.provinces.puyang.owner !== 'liudai' || !E.bordering('caocao', 'liudai')) return null;
      return {};
    },
    apply: (E, S) => {
      const names = E.factionOfficers('liudai').map((o) => o.name);
      E.transferCity('puyang', 'caocao');
      for (const n of names) E.joinHouse(n, 'caocao', 65);
      E.dissolveHouse('liudai');
      E.prestige('caocao', 10);
      return `With Liu Dai dead, the officials of Yan Province invite Cao Cao to take charge. Puyang and the Yellow River crossings pass to him${names.length ? ', and ' + names.join(', ') + ' enter his service' : ''}.`;
    },
  },

  // ---------------------------------------------------------- Cao Cao
  {
    id: 'dian-wei', minor: true, title: 'Dian Wei takes service',
    from: [191, 1], to: [193, 12],
    when: (E, S) => { const cc = S.factions.caocao; const o = S.officers['Dian Wei']; return cc && cc.alive && !cc.guest && o && !o.faction && !o.captive && E.factionProvinces('caocao').length ? {} : null; },
    apply: (E, S) => { E.joinHouse('Dian Wei', 'caocao', 95, E.rulerOf('caocao').city, true); return 'Xiahou Dun brings to Cao Cao a giant who lifts the camp banner one-handed. Dian Wei becomes the captain of his guard.'; },
  },
  {
    id: 'guo-jia', minor: true, title: 'Xun Yu recommends Guo Jia',
    from: [196, 1], to: [198, 12],
    when: (E, S) => { const cc = S.factions.caocao; const o = S.officers['Guo Jia']; return cc && cc.alive && !cc.guest && o && !o.faction && !o.captive && E.factionProvinces('caocao').length ? {} : null; },
    apply: (E, S) => { E.joinHouse('Guo Jia', 'caocao', 92, E.rulerOf('caocao').city, true); E.prestige('caocao', 5); return '"This is the man who will help me finish my great work," says Cao Cao after one conversation with the young strategist Guo Jia.'; },
  },
  {
    id: 'xu-chu', minor: true, title: 'Xu Chu and his village',
    from: [197, 1], to: [199, 12],
    when: (E, S) => { const cc = S.factions.caocao; const o = S.officers['Xu Chu']; return cc && cc.alive && !cc.guest && o && !o.faction && !o.captive && E.factionProvinces('caocao').length ? {} : null; },
    apply: (E, S) => { E.joinHouse('Xu Chu', 'caocao', 92, E.rulerOf('caocao').city, true); E.troops('caocao', 2000); return 'Xu Chu, who once dragged an ox backwards by the tail, comes over to Cao Cao with the fighting men of his village.'; },
  },
  {
    id: 'cao-song', title: 'The murder of Cao Song',
    from: [193, 6], to: [194, 6],
    when: (E, S) => { const cc = S.factions.caocao, tq = S.factions.taoqian; return cc && cc.alive && tq && tq.alive && E.treatyStatus('caocao', 'taoqian') === 'neutral' ? {} : null; },
    apply: (E, S) => { E.shiftRelation('caocao', 'taoqian', -60); E.warTarget('caocao', 'taoqian', 18); return "Cao Cao's father, travelling to join his son, is murdered by soldiers of Xu Province. Cao Cao swears to wash Xu in blood."; },
  },
  {
    id: 'zhang-xiu', title: 'Zhang Xiu surrenders at Wan',
    from: [197, 1], to: [198, 12],
    when: (E, S) => { const cc = S.factions.caocao; const o = S.officers['Zhang Xiu']; return cc && cc.alive && S.provinces.wan.owner === 'caocao' && o && !o.faction && !o.captive ? {} : null; },
    decision: {
      house: 'caocao',
      prompt: () => 'Zhang Xiu offers to surrender Wan and his veteran cavalry. Jia Xu, his adviser, stands at his shoulder; your officers warn that a man who surrenders once may turn again.',
      options: [
        { label: 'Accept the surrender', ai: 0.8, apply: (E, S) => { E.joinHouse('Zhang Xiu', 'caocao', 45, 'wan', true); if (S.officers['Jia Xu'] && !S.officers['Jia Xu'].faction) E.joinHouse('Jia Xu', 'caocao', 75, 'wan', true); S.provinces.wan.troops += 4000; return 'Zhang Xiu bends the knee at Wan and 4,000 riders join the army. His loyalty is thin, and Jia Xu watches everything.'; } },
        { label: 'Refuse and drive him out', ai: 0.2, apply: (E) => { E.prestige('caocao', 3); return 'Cao Cao refuses the turncoat. Zhang Xiu rides west, and Wan is quiet.'; } },
      ],
    },
  },
  {
    id: 'wuchao', title: 'Wuchao burns',
    from: [200, 2], to: [201, 12],
    when: (E, S) => {
      const cc = S.factions.caocao, ys = S.factions.yuanshao;
      if (!cc || !cc.alive || !ys || !ys.alive || !E.bordering('caocao', 'yuanshao') || E.treatyStatus('caocao', 'yuanshao') !== 'neutral') return null;
      const troops = (f) => E.factionProvinces(f).reduce((a, p) => a + p.troops, 0);
      if (troops('yuanshao') < troops('caocao') * 1.2) return null;
      const front = E.factionProvinces('yuanshao').filter((p) => S.adj[p.id].some((n) => S.provinces[n].owner === 'caocao')).sort((a, b) => b.troops - a.troops)[0];
      return front ? { city: front.id } : null;
    },
    apply: (E, S, ctx) => {
      const p = S.provinces[ctx.city];
      p.troops = Math.floor(p.troops * 0.6); p.food = Math.floor(p.food * 0.4);
      E.prestige('caocao', 15); E.prestige('yuanshao', -10); E.shiftRelation('caocao', 'yuanshao', -30);
      const turned = ['Zhang He', 'Gao Lan'].filter((n) => S.officers[n] && S.officers[n].faction === 'yuanshao');
      const dest = E.factionProvinces('caocao').find((q) => S.adj[q.id].includes(ctx.city)) || E.factionProvinces('caocao')[0];
      for (const n of turned) E.joinHouse(n, 'caocao', 70, dest.id, true);
      return `Xu You, slighted at Yuan Shao's court, rides to Cao Cao with the secret of the granaries at Wuchao. A night raid burns them; the army at ${E.pname(ctx.city)} melts away hungry${turned.length ? ', and ' + turned.join(' and ') + ' go over to Cao Cao' : ''}.`;
    },
  },
  {
    id: 'duke-of-wei', title: 'Duke of Wei',
    from: [213, 1], to: [216, 12],
    when: (E, S) => { const cc = S.factions.caocao; return cc && cc.alive && cc.hasEmperor && E.factionProvinces('caocao').length >= 8 ? {} : null; },
    decision: {
      house: 'caocao',
      prompt: () => 'The court proposes to name Cao Cao Duke of Wei with the Nine Bestowments, a step no minister has taken since the founding of the Han. Xun Yu counsels against it: "A true minister does not seek such things."',
      options: [
        { label: 'Accept the title', ai: 0.85, apply: (E, S) => { E.prestige('caocao', 20); E.gold('caocao', 5000); for (const f of Object.keys(S.factions)) if (f !== 'caocao' && S.factions[f].alive) E.shiftRelation('caocao', f, -10); const xy = S.officers['Xun Yu']; if (xy && xy.faction === 'caocao') xy.loyalty = Math.max(0, xy.loyalty - 40); return 'Cao Cao is enfeoffed as Duke of Wei. The realm understands what it means. Xun Yu withdraws from court in silence.'; } },
        { label: 'Decline, for now', ai: 0.15, apply: (E) => { E.prestige('caocao', 10); return 'Cao Cao declines the Nine Bestowments three times, as ritual demands, and the scholars praise his modesty.'; } },
      ],
    },
  },
  // ---------------------------------------------------------- Yuan Shao
  {
    id: 'yuan-tan-joins', minor: true, title: 'Yuan Tan takes up his post',
    from: [190, 4], to: [193, 12],
    when: (E, S) => { const ys = S.factions.yuanshao; const o = S.officers['Yuan Tan']; return ys && ys.alive && !ys.guest && o && !o.faction && !o.captive && E.factionProvinces('yuanshao').length ? {} : null; },
    apply: (E, S) => { E.joinHouse('Yuan Tan', 'yuanshao', 90, E.rulerOf('yuanshao').city, true); return "Yuan Shao's eldest son Yuan Tan is given a command in his father's army."; },
  },
  {
    id: 'jieqiao', title: 'The Battle of Jieqiao',
    from: [191, 6], to: [193, 12],
    when: (E, S) => {
      const ys = S.factions.yuanshao, gz = S.factions.gongsunzan;
      if (!ys || !ys.alive || !gz || !gz.alive || !E.bordering('yuanshao', 'gongsunzan') || E.treatyStatus('yuanshao', 'gongsunzan') !== 'neutral') return null;
      const front = E.factionProvinces('gongsunzan').filter((p) => S.adj[p.id].some((n) => S.provinces[n].owner === 'yuanshao')).sort((a, b) => b.troops - a.troops)[0];
      return front ? { city: front.id } : null;
    },
    apply: (E, S, ctx) => {
      const p = S.provinces[ctx.city]; p.troops = Math.floor(p.troops * 0.7);
      E.prestige('yuanshao', 10); E.shiftRelation('yuanshao', 'gongsunzan', -40); E.warTarget('yuanshao', 'gongsunzan', 24);
      return `At Jieqiao, Gongsun Zan's White Horse cavalry charges a thin line of crossbowmen under Qu Yi and is shot to pieces. The garrison of ${E.pname(ctx.city)} is broken, and the war for Hebei begins in earnest.`;
    },
  },
  {
    id: 'tian-feng', title: "Tian Feng's counsel",
    from: [199, 6], to: [200, 12],
    when: (E, S) => { const ys = S.factions.yuanshao, cc = S.factions.caocao; return ys && ys.alive && cc && cc.alive && E.bordering('yuanshao', 'caocao') && E.treatyStatus('yuanshao', 'caocao') === 'neutral' ? {} : null; },
    decision: {
      house: 'yuanshao',
      prompt: () => 'Tian Feng urges patience: "Cao Cao is skilled in war. Hold the river, harass his borders, and in three years he falls without a battle." Guo Tu and the young hotheads call for a march on Xuchang now.',
      options: [
        { label: 'March on Cao Cao now', ai: 0.7, apply: (E, S) => { const tf = S.officers['Tian Feng']; if (tf && tf.faction === 'yuanshao') tf.loyalty = Math.max(0, tf.loyalty - 40); E.warTarget('yuanshao', 'caocao', 18); return 'Yuan Shao has Tian Feng thrown in prison for cowardice and orders the host south. The die is cast.'; } },
        { label: 'Heed Tian Feng and wait', ai: 0.3, apply: (E, S) => { E.ceasefire('yuanshao', 'caocao', 12); E.prestige('yuanshao', 5); return 'Yuan Shao holds the line of the Yellow River and lets Cao Cao exhaust himself elsewhere. The scholars call it wisdom; the generals grumble.'; } },
      ],
    },
  },
  {
    id: 'yuan-shang', minor: true, title: 'Yuan Shang comes of age',
    from: [196, 1], to: [200, 12],
    when: (E, S) => { const ys = S.factions.yuanshao; return ys && ys.alive && !ys.guest && !S.officers['Yuan Shang'] && E.factionProvinces('yuanshao').length ? {} : null; },
    apply: (E, S) => { E.addOfficer({ name: 'Yuan Shang', ldr: 68, war: 72, int: 55, pol: 52, chr: 62, faction: 'yuanshao', city: E.rulerOf('yuanshao').city, loyalty: 100, born: 176 }); return "Yuan Shang, Yuan Shao's favourite youngest son, handsome and headstrong, joins the officers of the house. Court factions begin to form around the brothers."; },
  },
  {
    id: 'yuan-brothers', title: 'The Yuan brothers quarrel',
    from: [200, 1], to: [210, 12],
    when: (E, S) => {
      const ys = S.factions.yuanshao;
      if (!ys || !ys.alive || ys.guest || S.officers['Yuan Shao']) return null;   // only after Yuan Shao is dead
      const yt = S.officers['Yuan Tan'];
      if (!yt || yt.faction !== 'yuanshao' || yt.captive || ys.ruler === 'Yuan Tan') return null;
      const cities = E.factionProvinces('yuanshao');
      if (cities.length < 4) return null;
      const seat = E.rulerOf('yuanshao').city;
      const base = cities.find((p) => p.id === yt.city && p.id !== seat) || cities.filter((p) => p.id !== seat).sort((a, b) => b.troops - a.troops)[0];
      if (!base) return null;
      const second = cities.find((p) => p.id !== seat && p.id !== base.id && S.adj[base.id].includes(p.id));
      return { cities: second ? [base.id, second.id] : [base.id] };
    },
    apply: (E, S, ctx) => {
      const heir = E.rulerOf('yuanshao').name;
      const officers = ['Guo Tu'].filter((n) => S.officers[n] && S.officers[n].faction === 'yuanshao');
      E.foundHouse({ id: 'yuantan', name: 'Yuan Tan', ruler: 'Yuan Tan', color: '#d7bde2', cities: ctx.cities, officers, aggr: 1.1, persona: ['reckless'] });
      E.prestige('yuanshao', -10);
      return `Passed over for his younger brother ${heir}, Yuan Tan raises his own banner over ${ctx.cities.map(E.pname).join(' and ')}${officers.length ? ' with ' + officers.join(', ') : ''}. Hebei is divided against itself.`;
    },
  },
  // ---------------------------------------------------------- Dong Zhuo
  {
    id: 'coalition', title: 'The coalition against Dong Zhuo',
    from: [190, 1], to: [190, 3],
    when: (E, S) => {
      const dz = S.factions.dongzhuo; if (!dz || !dz.alive) return null;
      const members = ['yuanshao', 'yuanshu', 'caocao', 'sunjian', 'liudai', 'zhangyang', 'zhangchao', 'kongrong', 'taoqian', 'liubei'].filter((f) => S.factions[f] && S.factions[f].alive && !S.factions[f].guest);
      return members.length >= 3 ? { members } : null;
    },
    apply: (E, S, ctx) => {
      for (const a of ctx.members) for (const b of ctx.members) if (a < b) E.shiftRelation(a, b, 15);
      for (const f of ctx.members) { E.shiftRelation(f, 'dongzhuo', -20); if (E.bordering(f, 'dongzhuo')) E.warTarget(f, 'dongzhuo', 12); }
      E.prestige('yuanshao', 10);
      const names = ctx.members.filter((f) => f !== 'yuanshao').map((f) => E.fname(f));
      return `At Suanzao the lords swear an oath against Dong Zhuo and elect Yuan Shao their leader. ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} raise their banners with him, Zhang Chao of Guangling among the first, and Sun Jian marches north.`;
    },
  },
  {
    id: 'burn-luoyang', title: 'The burning of Luoyang',
    from: [190, 3], to: [191, 6],
    when: (E, S) => { const dz = S.factions.dongzhuo; return dz && dz.alive && S.provinces.luoyang.owner === 'dongzhuo' && S.provinces.changan.owner === 'dongzhuo' ? {} : null; },
    decision: {
      house: 'dongzhuo',
      prompt: () => 'The coalition presses toward Luoyang from three sides. Li Ru advises abandoning the eastern capital: burn the city, drive the people west, loot the imperial tombs, and rule from Chang\u2019an behind the passes.',
      options: [
        { label: 'Burn Luoyang and move west', ai: 0.75, apply: (E, S) => {
          const ly = S.provinces.luoyang, ca = S.provinces.changan;
          const moved = Math.floor(ly.troops * 0.7);
          ly.troops -= moved; ca.troops += moved;
          ly.defense = Math.floor(ly.defense * 0.4); ly.pop = Math.floor(ly.pop * 0.6); ly.comm = Math.floor(ly.comm * 0.5); ly.agri = Math.floor(ly.agri * 0.7);
          ca.gold += 8000 + Math.floor(ly.gold * 0.8); ly.gold = Math.floor(ly.gold * 0.2); ca.food += Math.floor(ly.food * 0.6); ly.food = Math.floor(ly.food * 0.4); ca.pop += Math.floor(ly.pop * 0.3);
          for (const o of E.factionOfficers('dongzhuo')) if (o.city === 'luoyang') o.city = 'changan';
          E.prestige('dongzhuo', -15);
          for (const f of Object.keys(S.factions)) if (f !== 'dongzhuo' && S.factions[f].alive) E.shiftRelation('dongzhuo', f, -10);
          return 'Luoyang burns for days. The court and a million weeping people are driven west to Chang\u2019an, the tombs of the Han emperors are stripped of their gold, and a ruin is left for the coalition to occupy.';
        } },
        { label: 'Hold the capital', ai: 0.25, apply: (E, S) => { E.prestige('dongzhuo', 5); S.provinces.luoyang.defense = Math.min(999, S.provinces.luoyang.defense + 60); return 'Dong Zhuo will not run. The walls of Luoyang are strengthened and the army digs in to meet the coalition.'; } },
      ],
    },
  },
  {
    id: 'wang-yun', title: "Wang Yun's plot",
    from: [192, 3], to: [193, 6],
    when: (E, S) => {
      const dz = S.factions.dongzhuo, o = S.officers['Dong Zhuo'], lb = S.officers['L\u00fc Bu'];
      if (!dz || !dz.alive || !o || o.faction !== 'dongzhuo' || o.captive || !lb || lb.faction !== 'dongzhuo' || lb.captive) return null;
      return { seat: o.city };
    },
    decision: {
      house: 'dongzhuo',
      prompt: () => 'Minister Wang Yun has been whispering to L\u00fc Bu: the tyrant struck him with a halberd in a fit of rage, the girl Diaochan has been promised to both men, and the Han would forgive the one who ends this. Li Ru urges you to bind L\u00fc Bu with gifts before it is too late.',
      options: [
        { label: 'Shower L\u00fc Bu with gold and titles', ai: 0.25, apply: (E, S, ctx) => { const p = S.provinces[ctx.seat]; const cost = Math.min(3000, p.gold); p.gold -= cost; S.officers['L\u00fc Bu'].loyalty = Math.min(100, S.officers['L\u00fc Bu'].loyalty + 35); E.prestige('dongzhuo', -5); return `Dong Zhuo heaps gold and honours on L\u00fc Bu and calls him his son before the court. The plot withers, and Wang Yun retires to his estates.`; } },
        { label: 'Laugh at the rumours', ai: 0.75, apply: (E, S, ctx) => {
          E.kill('Dong Zhuo', "at the palace gates, speared by L\u00fc Bu in Wang Yun's plot");
          const lb = S.officers['L\u00fc Bu'];
          const house = S.factions.dongzhuo;
          const cities = E.factionProvinces('dongzhuo');
          const companions = ['Zhang Liao'].filter((n) => S.officers[n] && S.officers[n].faction === 'dongzhuo');
          let text = 'Dong Zhuo rides to the palace and is met at the gate by L\u00fc Bu\u2019s halberd. "I have an edict to slay the traitor!" The tyrant is dead, and his corpse is left in the street with a wick burning in its navel.';
          const seat = house.alive && E.rulerOf('dongzhuo') ? E.rulerOf('dongzhuo').city : null;
          const base = cities.find((p) => p.id === lb.city && p.id !== seat) || cities.find((p) => p.id !== seat);
          if (lb && house.alive && cities.length >= 2 && base) {
            if (E.foundHouse({ id: 'lubu', name: 'L\u00fc Bu', ruler: 'L\u00fc Bu', color: '#b22222', cities: [base.id], officers: companions, wanderer: true, aggr: 1.5, absorb: false, persona: ['treacherous', 'reckless'] })) {
              if (S.officers['Chen Gong'] && !S.officers['Chen Gong'].faction) E.joinHouse('Chen Gong', 'lubu', 85, base.id, true);
              text += ` L\u00fc Bu seizes ${E.pname(base.id)} and raises his own banner${companions.length ? ' with ' + companions.join(', ') : ''}. Dong Zhuo\u2019s old generals rally to ${E.rulerOf('dongzhuo') ? E.rulerOf('dongzhuo').name : 'a new master'}.`;
            }
          } else if (lb) {
            lb.faction = null; lb.loyalty = 0; for (const n of companions) { S.officers[n].faction = null; S.officers[n].loyalty = 0; }
            text += ' L\u00fc Bu flees the capital with his household, a sword for hire.';
          }
          return text;
        } },
      ],
    },
  },
  {
    id: 'emperor-flees', title: 'The Emperor escapes Chang\u2019an',
    from: [195, 1], to: [196, 6],
    when: (E, S) => { const dz = S.factions.dongzhuo; return dz && dz.alive && dz.hasEmperor && !S.officers['Dong Zhuo'] ? {} : null; },
    apply: (E, S) => { S.factions.dongzhuo.hasEmperor = false; E.prestige('dongzhuo', -10); return 'While Dong Zhuo\u2019s old generals brawl over the ruins of his power, the young Emperor slips out of Chang\u2019an with a handful of loyal ministers and begins a hungry journey east, looking for a protector.'; },
  },
  {
    id: 'li-guo-feud', title: 'Li Jue and Guo Si turn on each other',
    from: [195, 1], to: [196, 12],
    when: (E, S) => { const dz = S.factions.dongzhuo; const a = S.officers['Li Jue'], b = S.officers['Guo Si']; return dz && dz.alive && !S.officers['Dong Zhuo'] && a && b && a.faction === 'dongzhuo' && b.faction === 'dongzhuo' && !a.captive && !b.captive ? { seat: E.rulerOf('dongzhuo').city } : null; },
    apply: (E, S, ctx) => { const p = S.provinces[ctx.seat]; p.troops = Math.floor(p.troops * 0.75); p.pop = Math.floor(p.pop * 0.9); for (const n of ['Li Jue', 'Guo Si']) S.officers[n].loyalty = Math.max(0, S.officers[n].loyalty - 30); E.prestige('dongzhuo', -10); return `Li Jue and Guo Si, each convinced the other means to murder him, fight in the streets of ${E.pname(ctx.seat)} for months. The city is wrecked and a quarter of the army dies for nothing.`; },
  },
  // ---------------------------------------------------------- exile
  {
    id: 'exile-slander', minor: true, title: 'A slander at court',
    from: [190, 1], to: [260, 12],
    when: (E, S) => {
      const gs = Object.values(S.factions).filter((f) => f.alive && f.guest && S.turn - f.guestSince >= 6 && f.favor >= 30);
      if (!gs.length || Math.random() > 0.03) return null;
      const F = gs[Math.floor(Math.random() * gs.length)];
      return { fid: F.id, host: F.host };
    },
    repeat: true,
    apply: (E, S, ctx) => { const F = S.factions[ctx.fid]; F.favor = Math.max(0, F.favor - 12); return `A minister at ${E.fname(ctx.host)}'s court whispers that ${E.fname(ctx.fid)} means to steal the province. Favour -12.`; },
  },
  {
    id: 'exile-invitation', minor: true, title: 'An invitation from afar',
    from: [190, 1], to: [260, 12],
    when: (E, S) => {
      const gs = Object.values(S.factions).filter((f) => f.alive && f.guest && S.turn - f.guestSince >= 12 && f.favor < 45);
      if (!gs.length || Math.random() > 0.04) return null;
      const F = gs[Math.floor(Math.random() * gs.length)];
      const lords = Object.values(S.factions).filter((h) => h.alive && !h.raider && !h.guest && h.id !== F.id && h.id !== F.host && E.factionProvinces(h.id).length >= 3 && E.relation(F.id, h.id) >= 0);
      if (!lords.length) return null;
      return { fid: F.id, lord: lords[Math.floor(Math.random() * lords.length)].id };
    },
    repeat: true,
    decision: {
      house: null,
      prompt: (E, S, ctx) => `${E.fname(ctx.lord)} sends a letter to ${E.fname(ctx.fid)}: "A man of your fame is wasted in that small court. Come to me, and you shall have soldiers and honour." Favour with your present host is low.`,
      options: [
        { label: 'Accept and move the household', ai: 0.6, apply: (E, S, ctx) => { const F = S.factions[ctx.fid]; const old = F.host; const seat = E.rulerOf(ctx.lord).city; for (const o of E.factionOfficers(ctx.fid)) { o.city = seat; o.acted = true; } F.host = ctx.lord; F.favor = 55; F.guestSince = S.turn; E.shiftRelation(ctx.fid, old, -10); E.shiftRelation(ctx.fid, ctx.lord, 15); return `${E.fname(ctx.fid)} accepts and rides to ${E.pname(seat)}, where ${E.fname(ctx.lord)} receives him with honour.`; } },
        { label: 'Stay loyal to the present host', ai: 0.4, apply: (E, S, ctx) => { const F = S.factions[ctx.fid]; F.favor = Math.min(100, F.favor + 10); E.prestige(ctx.fid, 3); return `${E.fname(ctx.fid)} declines the offer and shows the letter to his host, who is moved by such loyalty. Favour +10.`; } },
      ],
    },
  },
  {
    id: 'exile-brothers', minor: true, title: 'The sworn brothers grow restless',
    from: [190, 1], to: [260, 12],
    when: (E, S) => {
      const gs = Object.values(S.factions).filter((f) => f.alive && f.guest && S.turn - f.guestSince >= 18 && f.household.troops >= 2000);
      if (!gs.length || Math.random() > 0.04) return null;
      const F = gs[Math.floor(Math.random() * gs.length)];
      return { fid: F.id };
    },
    repeat: true,
    apply: (E, S, ctx) => { const F = S.factions[ctx.fid]; const n = Math.floor(F.household.troops * 0.15) + 500; F.household.troops += n; F.favor = Math.max(0, F.favor - 4); return `The officers of ${E.fname(ctx.fid)} chafe at living on another man's rice. They drill the household troops and draw ${n} more men to the banner; the host notices (favour -4).`; },
  },

  // ---------------------------------------------------------- treasures
  {
    id: 'seal-found', title: 'The Imperial Seal in the well',
    from: [191, 1], to: [192, 12],
    when: (E, S) => { const su = S.factions.sunjian; const st = S.items['imperial-seal']; return su && su.alive && st && !st.owner && E.rulerOf('sunjian') ? {} : null; },
    apply: (E, S) => { const r = E.rulerOf('sunjian'); E.giveItem('imperial-seal', r.name); return `Camped in the ruins of Luoyang, ${r.name}\u2019s men see a light in a well and draw up a woman\u2019s corpse with a jade seal at her neck: the Hereditary Seal of the Han. ${r.name} hides it and says nothing.`; },
  },
  // ---------------------------------------------------------- L\u00fc Bu
  {
    id: 'lubu-household', minor: true, title: 'L\u00fc Bu\u2019s household',
    from: [190, 1], to: [230, 12],
    when: (E, S) => { const lb = S.factions.lubu; return lb && lb.alive && !S.officers['Hou Cheng'] && E.factionProvinces('lubu').length ? { city: E.rulerOf('lubu').city } : null; },
    apply: (E, S, ctx) => {
      for (const [n, l, w, i, p, c, b, loy] of [['Hou Cheng', 58, 66, 38, 30, 35, 160, 45], ['Song Xian', 55, 64, 32, 28, 30, 162, 45], ['Wei Xu', 54, 65, 30, 26, 30, 163, 45], ['Diaochan', 20, 10, 70, 60, 100, 175, 100]])
        E.addOfficer({ name: n, ldr: l, war: w, int: i, pol: p, chr: c, faction: 'lubu', city: ctx.city, loyalty: loy, born: b });
      return `Hou Cheng, Song Xian and Wei Xu, captains of the old Bing Province cavalry, follow L\u00fc Bu, and the famous beauty Diaochan rides at his side. Whether the captains stay loyal is another matter.`;
    },
  },
  {
    id: 'lubu-puyang', title: 'Chen Gong\u2019s plan for Puyang',
    from: [193, 6], to: [195, 12],
    when: (E, S) => {
      const lb = S.factions.lubu, cc = S.factions.caocao;
      if (!lb || !lb.alive || !cc || !cc.alive || S.provinces.puyang.owner !== 'caocao') return null;
      if (E.factionProvinces('caocao').length < 2) return null;
      return { troops: S.provinces.puyang.troops };
    },
    decision: {
      house: 'lubu',
      prompt: (E, S, ctx) => `Chen Gong brings word from Puyang: Zhang Miao and the gentry of Yan Province are ready to open the gates to L\u00fc Bu while Cao Cao campaigns elsewhere. The garrison is ${ctx.troops.toLocaleString()} strong. "Take Yan," says Chen Gong, "and the Central Plain is yours."`,
      options: [
        { label: 'Seize Puyang', ai: 0.8, apply: (E, S) => { E.transferCity('puyang', 'lubu'); S.provinces.puyang.troops += 8000; E.moveHouse('lubu', 'puyang'); if (S.factions.lubu.guest) E.wake('lubu', 'puyang'); E.shiftRelation('lubu', 'caocao', -50); E.warTarget('caocao', 'lubu', 24); return 'The gates of Puyang open to L\u00fc Bu and the gentry of Yan declare for him. Cao Cao turns his whole army around. The war for the Central Plain has begun.'; } },
        { label: 'Refuse the gamble', ai: 0.2, apply: (E) => { E.prestige('lubu', 3); return 'L\u00fc Bu will not stake everything on a plot. Chen Gong shakes his head.'; } },
      ],
    },
  },
  {
    id: 'lubu-xiapi', title: 'L\u00fc Bu takes Xiapi',
    from: [196, 1], to: [197, 12],
    when: (E, S) => {
      const lb = S.factions.lubu, liu = S.factions.liubei;
      if (!lb || !lb.alive || !liu || !liu.alive || S.provinces.xiapi.owner !== 'liubei') return null;
      const near = (lb.guest && lb.host === 'liubei') || E.bordering('lubu', 'liubei');
      return near ? { troops: S.provinces.xiapi.troops } : null;
    },
    decision: {
      house: 'lubu',
      prompt: (E, S, ctx) => `Liu Bei has marched out to fight Yuan Shu and left Xiapi thinly held (${ctx.troops.toLocaleString()} men). Cao Bao, an officer within, offers to open the gates. Liu Bei has treated you as a friend.`,
      options: [
        { label: 'Take Xiapi', ai: 0.75, apply: (E, S) => { E.transferCity('xiapi', 'lubu'); E.moveHouse('lubu', 'xiapi'); if (S.factions.lubu.guest) E.wake('lubu', 'xiapi'); E.shiftRelation('lubu', 'liubei', -60); E.prestige('lubu', -10); return 'By night L\u00fc Bu\u2019s riders are inside Xiapi. Liu Bei\u2019s family is taken and his base is gone; the land learns what L\u00fc Bu\u2019s friendship is worth.'; } },
        { label: 'Keep faith with Liu Bei', ai: 0.25, apply: (E) => { E.prestige('lubu', 12); E.shiftRelation('lubu', 'liubei', 20); return 'L\u00fc Bu, for once, keeps faith. Liu Bei never forgets it.'; } },
      ],
    },
  },
  {
    id: 'halberd-shot', title: 'The shot at the halberd',
    from: [196, 6], to: [198, 6],
    when: (E, S) => {
      const lb = S.factions.lubu, liu = S.factions.liubei, ys = S.factions.yuanshu;
      if (!lb || !lb.alive || !liu || !liu.alive || !ys || !ys.alive) return null;
      if (!E.factionProvinces('lubu').length) return null;
      if (!(E.bordering('lubu', 'yuanshu') || E.bordering('liubei', 'yuanshu'))) return null;
      if (E.treatyStatus('liubei', 'yuanshu') !== 'neutral') return null;
      return {};
    },
    decision: {
      house: 'lubu',
      prompt: () => 'Yuan Shu\u2019s general Ji Ling marches on Liu Bei with thirty thousand men and sends L\u00fc Bu gifts to stay out of it. L\u00fc Bu invites both to a feast and plants his halberd a hundred and fifty paces off: "If I hit the side-blade with one arrow, both of you go home."',
      options: [
        { label: 'Shoot the halberd', ai: 0.7, apply: (E, S) => { E.ceasefire('liubei', 'yuanshu', 12); E.prestige('lubu', 10); E.shiftRelation('lubu', 'liubei', 20); E.shiftRelation('lubu', 'yuanshu', 5); return 'The arrow sings and strikes the side-blade square. Ji Ling and Liu Bei, dumbfounded, drink to peace and go home. All the land talks of L\u00fc Bu\u2019s arrow.'; } },
        { label: 'Let Ji Ling crush Liu Bei', ai: 0.3, apply: (E, S) => { E.shiftRelation('lubu', 'yuanshu', 20); E.shiftRelation('lubu', 'liubei', -30); E.warTarget('yuanshu', 'liubei', 12); return 'L\u00fc Bu pockets Yuan Shu\u2019s gifts and looks the other way while Ji Ling falls on Liu Bei.'; } },
      ],
    },
  },
  {
    id: 'white-gate', title: 'The White Gate Tower',
    from: [198, 9], to: [199, 12],
    when: (E, S) => {
      const lb = S.factions.lubu, cc = S.factions.caocao;
      if (!lb || !lb.alive || lb.guest || !cc || !cc.alive || !E.bordering('lubu', 'caocao')) return null;
      const troops = (f) => E.factionProvinces(f).reduce((a, p) => a + p.troops, 0);
      if (troops('caocao') < troops('lubu') * 1.5) return null;
      const seat = E.rulerOf('lubu').city;
      if (!S.adj[seat].some((n) => S.provinces[n].owner === 'caocao')) return null;
      return { seat };
    },
    apply: (E, S, ctx) => {
      const traitors = ['Hou Cheng', 'Song Xian', 'Wei Xu'].filter((n) => S.officers[n] && S.officers[n].faction === 'lubu');
      const lubu = S.officers['L\u00fc Bu'], zl = S.officers['Zhang Liao'], cg = S.officers['Chen Gong'];
      const others = E.factionOfficers('lubu').filter((o) => o.city === ctx.seat && o.name !== 'L\u00fc Bu' && o.name !== 'Zhang Liao' && o.name !== 'Chen Gong' && !traitors.includes(o.name));
      E.transferCity(ctx.seat, 'caocao');
      for (const n of traitors) E.joinHouse(n, 'caocao', 40, ctx.seat, true);
      if (zl && zl.city === ctx.seat) E.joinHouse('Zhang Liao', 'caocao', 80, ctx.seat, true);
      if (cg && cg.city === ctx.seat) E.kill('Chen Gong', 'walking to the block with his head held high after the fall of the White Gate');
      for (const o of others) { o.faction = null; o.loyalty = 0; }
      let text = `Cao Cao floods the moat and lays siege to ${E.pname(ctx.seat)}. After weeks of drink and despair, Hou Cheng, Song Xian and Wei Xu bind L\u00fc Bu while he sleeps and open the gates.`;
      if (lubu && lubu.city === ctx.seat) {
        if (S.options.historicalDeaths) { E.kill('L\u00fc Bu', 'strangled at the White Gate Tower, begging for his life while Liu Bei reminded Cao Cao of Ding Yuan and Dong Zhuo'); text += ' L\u00fc Bu begs for his life; Liu Bei murmurs "Remember Ding Yuan and Dong Zhuo," and the mightiest warrior of the age is strangled.'; }
        else { E.capture('L\u00fc Bu', 'caocao'); text += ' L\u00fc Bu is dragged before Cao Cao in chains.'; }
      }
      if (zl) text += ' Zhang Liao, who alone shows no fear, is spared and enters Cao Cao\u2019s service.';
      if (cg) text += ' Chen Gong refuses every plea and walks to the block.';
      return text;
    },
  },

  {
    id: 'yuan-shu-emperor', title: 'Yuan Shu proclaims himself Emperor',
    from: [197, 1], to: [199, 12],
    when: (E, S) => {
      const ys = S.factions.yuanshu; const st = S.items['imperial-seal'];
      if (!ys || !ys.alive || ys.guest || !st.owner || !S.officers[st.owner] || S.officers[st.owner].faction !== 'yuanshu') return null;
      return {};
    },
    decision: {
      house: 'yuanshu',
      prompt: () => 'With the Imperial Seal in his hands, Yuan Shu\u2019s flatterers whisper that the prophecy "the one who replaces the Han shall be on the high road" points to him. To proclaim himself Emperor would rally the ambitious and outrage everyone else.',
      options: [
        { label: 'Proclaim the Zhong dynasty', ai: 0.7, apply: (E, S) => { E.troops('yuanshu', 10000); E.gold('yuanshu', 3000); E.prestige('yuanshu', -20); for (const f of Object.keys(S.factions)) if (f !== 'yuanshu' && S.factions[f].alive) E.shiftRelation('yuanshu', f, -35); return 'Yuan Shu dons the yellow robes at Shouchun and names his dynasty Zhong. Ten thousand adventurers flock to him; every lord in the land calls him a traitor.'; } },
        { label: 'Keep the Seal quietly', ai: 0.3, apply: (E) => { E.prestige('yuanshu', 5); return 'Yuan Shu locks the Seal away and bides his time. The flatterers are disappointed.'; } },
      ],
    },
  },
  {
    id: 'edict', title: 'The Edict of Protection',
    from: [190, 1], to: [260, 12],
    when: (E, S) => { const h = Object.values(S.factions).find((f) => f.alive && f.hasEmperor); const st = S.items['edict']; return h && st && !st.owner && S.eventsFired['emperor'] && E.rulerOf(h.id) ? { fid: h.id } : null; },
    apply: (E, S, ctx) => { E.giveItem('edict', E.rulerOf(ctx.fid).name); return `The Emperor, grateful for his rescue, issues an edict naming ${E.rulerOf(ctx.fid).name} Protector of the Han. It is a scrap of silk, and worth an army.`; },
  },
  {
    id: 'red-hare-gift', title: 'Cao Cao gives Guan Yu the Red Hare',
    from: [196, 1], to: [210, 12],
    when: (E, S) => { const gy = S.officers['Guan Yu']; const st = S.items['red-hare']; return gy && gy.faction === 'caocao' && !gy.captive && st.owner && S.officers[st.owner] && S.officers[st.owner].faction === 'caocao' && st.owner !== 'Guan Yu' ? {} : null; },
    apply: (E, S) => { E.giveItem('red-hare', 'Guan Yu'); S.officers['Guan Yu'].loyalty = Math.min(100, S.officers['Guan Yu'].loyalty + 15); return 'Cao Cao showers Guan Yu with gifts and at last presents him with the Red Hare. Guan Yu bows in thanks: "With this horse I can reach my brother in a day." Cao Cao is silent.'; },
  },
  {
    id: 'changban-sword', title: 'Zhao Yun at Changban',
    from: [208, 6], to: [209, 12],
    when: (E, S) => { const zy = S.officers['Zhao Yun']; const st = S.items['sword-of-heaven']; return zy && zy.faction === 'liubei' && !zy.captive && S.factions.liubei.alive && st.owner && S.officers[st.owner] && S.officers[st.owner].faction === 'caocao' && E.bordering('liubei', 'caocao') ? { from: st.owner } : null; },
    apply: (E, S, ctx) => { E.giveItem('sword-of-heaven', 'Zhao Yun'); E.prestige('liubei', 5); return `In the rout at Changban, Zhao Yun cuts his way through Cao Cao\u2019s army with Liu Bei\u2019s infant son at his breast and takes the Sword of Heaven from ${ctx.from}.`; },
  },

  {
    id: 'red-cliffs', title: 'The Battle of Red Cliffs',
    from: [208, 9], to: [210, 6],
    when: (E, S) => {
      const su = S.factions.sunjian; if (!su || !su.alive || su.guest) return null;
      // a northern power on the Yangtze, hostile to the Sun, far larger
      const north = Object.values(S.factions).find((f) => f.alive && f.id !== 'sunjian' && !f.raider && E.factionProvinces(f.id).length >= 12 && E.treatyStatus('sunjian', f.id) === 'neutral' && ['xiangyang', 'jiangling', 'jiangxia', 'lujiang'].some((c) => S.provinces[c].owner === f.id));
      if (!north) return null;
      const front = E.factionProvinces(north.id).filter((p) => ['jiangxia', 'jiangling', 'lujiang', 'xiangyang'].includes(p.id) && S.adj[p.id].some((n) => S.provinces[n].owner === 'sunjian' || (S.factions.liubei && S.provinces[n].owner === 'liubei' && E.treatyStatus('sunjian', 'liubei') === 'alliance'))).sort((a, b) => b.troops - a.troops)[0];
      if (!front) return null;
      const sunFleet = E.factionProvinces('sunjian').reduce((m, p) => Math.max(m, p.fleet || 0), 0);
      return { north: north.id, front: front.id, sunFleet, northFleet: front.fleet || 0, ally: S.factions.liubei && S.factions.liubei.alive && E.treatyStatus('sunjian', 'liubei') === 'alliance' };
    },
    apply: (E, S, ctx) => {
      const p = S.provinces[ctx.front];
      const sunWins = ctx.sunFleet + 20 > ctx.northFleet + (S.month >= 6 && S.month <= 8 ? 15 : 0);
      if (sunWins) {
        const lost = Math.floor(p.troops * 0.6); p.troops -= lost; p.fleet = Math.floor((p.fleet || 0) * 0.3);
        E.prestige('sunjian', 25); if (ctx.ally) E.prestige('liubei', 15); E.prestige(ctx.north, -20);
        S.factions[ctx.north].lastLoss = S.turn;
        E.shiftRelation('sunjian', ctx.north, -30);
        return `${E.fname(ctx.north)}\u2019s vast army camps on the north bank at ${E.pname(ctx.front)}, its ships chained together against the winter chop, its northern soldiers sick with the river fever. A feigned surrender, a south-east wind in the night, and fire ships from the Sun fleet: the chained fleet burns to the waterline and ${lost.toLocaleString()} men die in the flames and the water. The south is saved, and ${E.fname(ctx.north)} rides home through the mud of Huarong.${ctx.ally ? ' Liu Bei\u2019s men harry the retreat and take their share of the glory.' : ''}`;
      }
      const sunFront = E.factionProvinces('sunjian').filter((q) => S.adj[q.id].includes(ctx.front)).sort((a, b) => b.troops - a.troops)[0];
      if (sunFront) { const lost = Math.floor(sunFront.troops * 0.4); sunFront.troops -= lost; }
      E.prestige(ctx.north, 15); E.prestige('sunjian', -15);
      S.factions.sunjian.lastLoss = S.turn;
      return `${E.fname(ctx.north)}\u2019s fleet, better found than the Sun expected, forces the crossing at ${E.pname(ctx.front)}. The wind never turns, the fire ships are cut off, and the Sun army on the far bank is broken. Jiangdong trembles.`;
    },
  },
  // ---------------------------------------------------------- the later age: dynasties
  {
    id: 'han-abdication', title: 'The Han abdicates', repeat: true,
    from: [210, 1], to: [280, 12],
    when: (E, S) => {
      if (S.hanEnded) return null;
      const H = Object.values(S.factions).find((f) => f.alive && f.hasEmperor && !f.raider);
      if (!H || (H.title || 0) < 3 || E.factionProvinces(H.id).length < 16) return null;
      if (H.ruler === 'Cao Cao' && S.year < 219) return null;   // he would not, while he lived
      if ((flags(S).abdicationDeclined || 0) > S.turn) return null;
      return { fid: H.id };
    },
    decision: {
      prompt: (E, S, ctx) => `The ministers petition the Emperor to yield the throne to ${E.rulerOf(ctx.fid).name}, whose house has protected the court and holds half the land. Omens are reported; memorials arrive daily. The Han has reigned four hundred years.`,
      options: [
        { label: 'Accept the abdication and found a dynasty', ai: 0.7, apply: (E, S, ctx) => {
          const F = S.factions[ctx.fid]; const name = dynastyName(S, ctx.fid);
          F.title = 4; F.dynasty = name; F.name = name; F.prestige = Math.min(100, (F.prestige || 0) + 25);
          S.hanEnded = { turn: S.turn, by: ctx.fid, dynasty: name };
          for (const f of Object.values(S.factions)) if (f.alive && f.id !== ctx.fid) E.shiftRelation(ctx.fid, f.id, -25);
          const gone = E.factionOfficers(ctx.fid).filter((o) => o.name !== F.ruler && o.loyalty < 55 && o.pol >= 70).slice(0, 2);
          for (const o of gone) { o.faction = null; o.loyalty = 0; }
          return `The last Emperor of the Han yields the seals of state. ${E.rulerOf(ctx.fid).name} ascends the altar at ${E.pname(seatOf(E, ctx.fid))} and proclaims the dynasty of ${name}. The other lords call him a usurper${gone.length ? `, and ${gone.map((o) => o.name).join(' and ')} resign their offices rather than serve` : ''}.`;
        } },
        { label: 'Refuse: remain the protector of the Han', ai: 0.3, apply: (E, S, ctx) => { E.prestige(ctx.fid, 10); flags(S).abdicationDeclined = S.turn + 60; return `${E.rulerOf(ctx.fid).name} refuses the throne three times and sends the petitioners away. The scholars of the realm praise a loyalty rarer than victories.`; } },
      ],
    },
  },
  {
    id: 'rival-emperor', title: 'A rival emperor', repeat: true,
    from: [210, 1], to: [280, 12],
    when: (E, S) => {
      if (!S.hanEnded) return null;
      const cand = bigHouses(E, S, 8).filter((f) => f.id !== S.hanEnded.by && (f.title || 0) === 3 && ((flags(S).rivalDeclined || {})[f.id] || 0) <= S.turn)
        .sort((a, b) => E.factionProvinces(b.id).length - E.factionProvinces(a.id).length)[0];
      return cand ? { fid: cand.id } : null;
    },
    decision: {
      prompt: (E, S, ctx) => `${S.hanEnded.dynasty} has deposed the Han. Your officers urge you to answer usurpation with a throne of your own: proclaim yourself Emperor, so that the land knows where legitimacy lies.`,
      options: [
        { label: 'Proclaim yourself Emperor', ai: 0.7, apply: (E, S, ctx) => {
          const F = S.factions[ctx.fid]; const name = dynastyName(S, ctx.fid);
          F.title = 4; F.dynasty = name; F.name = name; E.prestige(ctx.fid, 15);
          for (const f of Object.values(S.factions)) if (f.alive && f.id !== ctx.fid) E.shiftRelation(ctx.fid, f.id, f.id === S.hanEnded.by ? -40 : -15);
          return `${E.rulerOf(ctx.fid).name} ascends the throne at ${E.pname(seatOf(E, ctx.fid))} as Emperor of ${name}. Two suns now hang in the sky, and every lord must choose which to bow to.`;
        } },
        { label: 'Decline the title', ai: 0.3, apply: (E, S, ctx) => { E.prestige(ctx.fid, 5); (flags(S).rivalDeclined = flags(S).rivalDeclined || {})[ctx.fid] = S.turn + 48; return `${E.rulerOf(ctx.fid).name} declines: "One usurper is enough for the age."`; } },
      ],
    },
  },
  // ---------------------------------------------------------- the fall of Guan Yu and Yiling
  {
    id: 'guan-yu-falls', title: 'The white-robed crossing',
    from: [215, 1], to: [260, 12],
    when: (E, S) => {
      const lb = S.factions.liubei, su = S.factions.sunjian;
      if (!lb || !lb.alive || !su || !su.alive || lb.guest || su.guest) return null;
      if (E.treatyStatus('liubei', 'sunjian') !== 'alliance' || S.provinces.jiangling.owner !== 'liubei') return null;
      const gy = S.officers['Guan Yu']; if (!gy || gy.faction !== 'liubei' || gy.captive) return null;
      const from = frontCity(E, S, 'sunjian', 'liubei'); if (!from || !S.adj.jiangling.includes(from.id)) return null;
      if (Math.random() > 0.12) return null;
      return { fid: 'sunjian', from: from.id };
    },
    decision: {
      house: 'sunjian',
      prompt: (E, S, ctx) => `Guan Yu holds Jiangling for Liu Bei and treats the Sun house with open contempt. L\u00fc Meng proposes to hide soldiers in merchant boats and take the city by surprise while the alliance still stands. It would break your word before all the land.`,
      options: [
        { label: 'Cross in white robes and seize Jiangling', ai: 0.65, apply: (E, S, ctx) => {
          E.breakTreaty('sunjian', 'liubei');
          const taken = E.officersIn('jiangling', 'liubei').map((o) => o.name);
          E.transferCity('jiangling', 'sunjian');
          const gy = S.officers['Guan Yu'];
          const cut = gy && (gy.city === 'jiangling' || S.adj.jiangling.includes(gy.city));
          for (const n of taken) if (n !== 'Guan Yu') E.capture(n, 'sunjian');
          let tail = '';
          if (cut) { E.kill('Guan Yu', 'beheaded at Linju after refusing to bow to Sun Quan'); tail = ' Guan Yu, cut off with his army melting away, is taken on the road to Linju and beheaded when he refuses to bow.'; }
          E.prestige('sunjian', 10); E.prestige('liubei', -10); E.shiftRelation('liubei', 'sunjian', -60);
          flags(S).guanyuFall = S.turn;
          return `L\u00fc Meng\u2019s soldiers, dressed as merchants, slip up the river from ${E.pname(ctx.from)} and take Jiangling without a fight.${tail}`;
        } },
        { label: 'Keep faith with the alliance', ai: 0.35, apply: (E, S) => { E.prestige('sunjian', 8); return 'Sun Quan sends L\u00fc Meng away. "We swore an oath at Red Cliffs." The alliance holds, for now.'; } },
      ],
    },
  },
  {
    id: 'zhang-fei-murdered', minor: true, title: 'Zhang Fei murdered',
    from: [215, 1], to: [260, 12],
    when: (E, S) => { const f = flags(S); const zf = S.officers['Zhang Fei']; return f.guanyuFall && S.turn - f.guanyuFall <= 24 && zf && zf.faction === 'liubei' && !zf.captive && Math.random() < 0.15 ? {} : null; },
    apply: (E, S) => { E.kill('Zhang Fei', 'murdered in his sleep by two of his own officers, who fled with his head to Wu'); E.shiftRelation('liubei', 'sunjian', -30); return 'Drunk with grief for his brother and cruel to his men, Zhang Fei is murdered in his tent. The killers flee downriver to Sun Quan.'; },
  },
  {
    id: 'yiling', title: 'Yiling',
    from: [215, 1], to: [260, 12],
    when: (E, S) => {
      const f = flags(S); if (!f.guanyuFall || f.yiling || S.turn - f.guanyuFall < 3 || S.turn - f.guanyuFall > 30) return null;
      const lb = S.factions.liubei, su = S.factions.sunjian; if (!lb || !lb.alive || !su || !su.alive || lb.guest) return null;
      const front = frontCity(E, S, 'liubei', 'sunjian'); if (!front) return null;
      return { fid: 'liubei', front: front.id };
    },
    decision: {
      house: 'liubei',
      prompt: (E, S, ctx) => `Guan Yu is dead and Jiangling lost. Every general begs Liu Bei to march east and avenge his brother; Zhao Yun alone warns that the enemy of the Han is in the north, not on the Yangtze.`,
      options: [
        { label: 'March east and avenge Guan Yu', ai: 0.6, apply: (E, S, ctx) => { const p = S.provinces[ctx.front]; p.troops += 25000; p.training = Math.max(p.training, 70); p.food += 60000; E.warTarget('liubei', 'sunjian', 30); E.prestige('liubei', 5); flags(S).yiling = 'war'; flags(S).yilingTurn = S.turn; return `Liu Bei gathers the whole strength of Shu at ${E.pname(ctx.front)} and swears to drink the blood of the Sun. The river road to Wu fills with his camps.`; } },
        { label: 'Swallow the grief and make peace', ai: 0.4, apply: (E, S) => { E.ceasefire('liubei', 'sunjian', 36); E.prestige('liubei', -5); flags(S).yiling = 'peace'; return 'Liu Bei weeps for three days and then sends envoys to Wu. The alliance is dead, but the war is not fought.'; } },
      ],
    },
  },
  {
    id: 'yiling-fire', title: 'Fire along the river',
    from: [215, 1], to: [260, 12],
    when: (E, S) => {
      const f = flags(S); if (f.yiling !== 'war' || f.yilingFired || S.turn - f.yilingTurn < 6 || S.turn - f.yilingTurn > 24) return null;
      const lb = S.factions.liubei, su = S.factions.sunjian; if (!lb || !lb.alive || !su || !su.alive || !E.canAttack('liubei', 'sunjian')) return null;
      const front = frontCity(E, S, 'liubei', 'sunjian'); if (!front || front.troops < 15000 || Math.random() > 0.2) return null;
      return { front: front.id };
    },
    apply: (E, S, ctx) => { const p = S.provinces[ctx.front]; const lost = Math.floor(p.troops * 0.45); p.troops -= lost; E.prestige('liubei', -15); S.factions.liubei.lastLoss = S.turn; flags(S).yilingFired = S.turn; return `The Shu camps stretch for miles along the river at ${E.pname(ctx.front)}, strung out in the summer heat. Lu Xun waits, then fires them all in one night. ${lost.toLocaleString()} men are lost and the army flees west.`; },
  },
  // ---------------------------------------------------------- the northern expeditions
  {
    id: 'northern-memorial', title: 'The memorial on the expedition', repeat: true,
    from: [218, 1], to: [280, 12],
    when: (E, S) => {
      const f = flags(S); if (f.expedition && S.factions[f.expedition.fid] && S.factions[f.expedition.fid].alive) return null;
      if ((f.expeditionDeclined || 0) > S.turn) return null;
      const W = S.provinces.hanzhong.owner; if (!W || S.provinces.chengdu.owner !== W || !S.factions[W].alive) return null;
      const N = S.provinces.changan.owner || S.provinces.tianshui.owner; if (!N || N === W || !S.factions[N].alive || !E.canAttack(W, N)) return null;
      if (E.factionProvinces(N).length < E.factionProvinces(W).length * 1.6) return null;
      const strat = E.factionOfficers(W).filter((o) => o.name !== S.factions[W].ruler && o.int >= 90).sort((a, b) => b.int - a.int)[0];
      if (!strat || Math.random() > 0.2) return null;
      return { fid: W, n: N, strategist: strat.name };
    },
    decision: {
      prompt: (E, S, ctx) => `${ctx.strategist} presents a memorial: "The realm is divided and ${E.fname(ctx.n)} holds the north with thrice our strength. If we do not attack, we shall surely be destroyed; if we attack, we may yet restore the Han." He asks leave to march from Hanzhong against ${E.pname(S.provinces.changan.owner === ctx.n ? 'changan' : 'tianshui')}.`,
      options: [
        { label: 'Launch the northern expedition', ai: 0.7, apply: (E, S, ctx) => { const p = S.provinces.hanzhong; p.troops += 15000; p.training = Math.max(p.training, 75); p.food += 40000; E.warTarget(ctx.fid, ctx.n, 36); E.prestige(ctx.fid, 5); flags(S).expedition = { turn: S.turn, fid: ctx.fid, n: ctx.n, strategist: ctx.strategist }; return `${ctx.strategist} leads the army out of Hanzhong. The banners of ${E.fname(ctx.fid)} fill the Qinling valleys, and the north stirs uneasily.`; } },
        { label: 'Guard the passes and build strength', ai: 0.3, apply: (E, S, ctx) => { for (const p of E.factionProvinces(ctx.fid)) p.order = Math.min(100, p.order + 8); S.provinces.hanzhong.defense = Math.min(999, S.provinces.hanzhong.defense + 100); flags(S).expeditionDeclined = S.turn + 60; return `${E.rulerOf(ctx.fid).name} thanks ${ctx.strategist} and bids him wait. The walls of Hanzhong rise higher and the granaries fill.`; } },
      ],
    },
  },
  {
    id: 'jieting', minor: true, title: 'Jieting', repeat: true,
    from: [218, 1], to: [280, 12],
    when: (E, S) => {
      const x = flags(S).expedition; if (!x || S.turn - x.turn > 36 || !S.factions[x.fid] || !S.factions[x.fid].alive || !S.factions[x.n] || !S.factions[x.n].alive) return null;
      const front = frontCity(E, S, x.fid, x.n); if (!front || front.troops < 8000 || Math.random() > 0.12) return null;
      return { fid: x.fid, front: front.id, strategist: x.strategist };
    },
    apply: (E, S, ctx) => {
      const p = S.provinces[ctx.front]; const lost = Math.floor(p.troops * 0.3); p.troops -= lost; E.prestige(ctx.fid, -5);
      const rash = E.officersIn(ctx.front, ctx.fid).filter((o) => o.name !== ctx.strategist && o.name !== S.factions[ctx.fid].ruler && o.int < 70).sort((a, b) => b.war - a.war)[0];
      if (rash) { E.killQuiet(rash.name, `executed by his own lord for abandoning the water at Jieting`); return `${rash.name}, disdaining the water, camps on the hilltop at Jieting and is surrounded; ${lost.toLocaleString()} men are lost and the advance collapses. ${ctx.strategist} has him executed with tears in his eyes.`; }
      return `A commander camps carelessly on the hilltop at Jieting and is cut off from water; ${lost.toLocaleString()} men are lost and the advance falls back to ${E.pname(ctx.front)}.`;
    },
  },
  {
    id: 'wooden-oxen', minor: true, title: 'Wooden oxen and gliding horses', repeat: true,
    from: [218, 1], to: [280, 12],
    when: (E, S) => { const x = flags(S).expedition; return x && S.turn - x.turn <= 60 && S.factions[x.fid] && S.factions[x.fid].alive && S.officers[x.strategist] && S.provinces.hanzhong.owner === x.fid && Math.random() < 0.1 ? { fid: x.fid, strategist: x.strategist } : null; },
    apply: (E, S, ctx) => { S.provinces.hanzhong.food += 40000; S.provinces.hanzhong.training = Math.min(100, S.provinces.hanzhong.training + 5); return `${ctx.strategist} devises wooden oxen and gliding horses to carry grain over the mountain roads. The granaries of Hanzhong fill and the army drills through the winter.`; },
  },
  {
    id: 'fallen-star', title: 'A star falls at Wuzhang',
    from: [218, 1], to: [280, 12],
    when: (E, S) => { const x = flags(S).expedition; return x && !flags(S).starFell && !S.officers[x.strategist] && S.factions[x.fid] && S.factions[x.fid].alive ? { fid: x.fid, strategist: x.strategist } : null; },
    apply: (E, S, ctx) => { for (const p of E.factionProvinces(ctx.fid)) p.order = Math.max(0, p.order - 10); E.prestige(ctx.fid, -10); const F = S.factions[ctx.fid]; F.warTarget = null; F.caution = Math.max(F.caution || 1, 1.4); flags(S).starFell = S.turn; return `A great star falls red over the camp at Wuzhang. ${ctx.strategist} is dead, and the army of ${E.fname(ctx.fid)} turns for home in silence. "A dead ${ctx.strategist.split(' ')[0]} frightens off the living," the northerners jeer, but the age of expeditions is over.`; },
  },
  // ---------------------------------------------------------- the regent's coup
  {
    id: 'regent-coup', title: 'The regent', repeat: true,
    from: [215, 1], to: [280, 12],
    when: (E, S) => {
      for (const H of bigHouses(E, S, 6)) {
        if (((flags(S).coupChecked || {})[H.id] || 0) > S.turn) continue;
        const R = E.rulerOf(H.id); if (!R) continue;
        const weak = E.age(R) <= 16 || R.ldr + R.war + R.int + R.pol + R.chr < 250;
        if (!weak) continue;
        const M = E.factionOfficers(H.id).filter((o) => o.name !== R.name && o.int >= 85 && o.pol >= 80 && E.age(o) >= 38 && E.age(o) <= 72 && o.loyalty <= 85).sort((a, b) => b.int + b.pol - a.int - a.pol)[0];
        if (!M || Math.random() > 0.06) continue;
        return { fid: H.id, m: M.name, r: R.name };
      }
      return null;
    },
    decision: {
      prompt: (E, S, ctx) => `${ctx.m} governs the realm in all but name while ${ctx.r} sits the seat. His clients fill the offices and his brothers hold the gates. Some whisper that he means to take the state; others that without him it would fall.`,
      options: [
        { label: 'Strip him of office', ai: 0.4, apply: (E, S, ctx) => {
          const M = S.officers[ctx.m]; (flags(S).coupChecked = flags(S).coupChecked || {})[ctx.fid] = S.turn + 60;
          if (M.city !== seatOf(E, ctx.fid) && Math.random() < 0.5) {
            E.foundHouse({ id: `rebel-${slug(ctx.m)}-${S.turn}`, name: ctx.m, ruler: ctx.m, color: REBEL_COLORS[S.turn % REBEL_COLORS.length], cities: [M.city], aggr: 1.2, persona: ['schemer'] });
            return `${ctx.m}, stripped of his seals, refuses to come to court. From ${E.pname(M.city)} he raises troops in his own name, and the realm has two masters.`;
          }
          M.faction = null; M.loyalty = 0; return `${ctx.m} is stripped of his offices and retires to his estates. The court breathes again, though its ablest hand is gone.`;
        } },
        { label: 'Trust him with the state', ai: 0.6, apply: (E, S, ctx) => {
          const F = S.factions[ctx.fid]; const M = S.officers[ctx.m]; (flags(S).coupChecked = flags(S).coupChecked || {})[ctx.fid] = S.turn + 60;
          if (Math.random() < 0.45) {
            const old = S.officers[ctx.r]; const houseName = E.fname(ctx.fid);
            F.ruler = ctx.m; F.name = F.dynasty || ctx.m; M.loyalty = 100; M.city = seatOf(E, ctx.fid) === M.city ? M.city : M.city;
            if (old) { old.loyalty = 30; }
            for (const o of E.factionOfficers(ctx.fid)) if (o.name !== ctx.m) o.loyalty = Math.max(0, o.loyalty - 10);
            E.prestige(ctx.fid, -10);
            for (const f of Object.values(S.factions)) if (f.alive && f.id !== ctx.fid) E.shiftRelation(ctx.fid, f.id, -10);
            return `${ctx.m} seizes the gates and the arsenal while ${ctx.r} is at the tombs. The seat of ${houseName} passes to the house of ${ctx.m.split(' ')[0]} without a battle; ${ctx.r} is kept in silk and silence.`;
          }
          M.loyalty = 100; for (const p of E.factionProvinces(ctx.fid)) p.order = Math.min(100, p.order + 5);
          return `${ctx.m} kneels and swears before the ancestral tablets. He governs faithfully, and the realm prospers under his hand.`;
        } },
      ],
    },
  },
  // ---------------------------------------------------------- the Nanman
  {
    id: 'meng-huo-submits', title: 'Seven times captured, seven times released',
    from: [190, 1], to: [280, 12],
    when: (E, S) => {
      const mh = S.factions.menghuo, o = S.officers['Meng Huo'];
      if (!mh || mh.alive || !o || flags(S).nanman) return null;
      const X = S.provinces.jianning.owner; if (!X || !S.factions[X].alive || S.factions[X].raider) return null;
      if (!(o.faction === X || o.captive === X || (!o.faction && o.city === 'jianning'))) return null;
      return { fid: X };
    },
    decision: {
      prompt: (E, S, ctx) => `Meng Huo, king of the Nanman, is in your hands, and Jianning lies under your banners. Seven times he has been taken and seven times he has sworn to fight again. The hill tribes will never be held by garrisons alone.`,
      options: [
        { label: 'Pardon him and make him king under your suzerainty', ai: 0.6, apply: (E, S, ctx) => {
          const o = S.officers['Meng Huo']; o.captive = null; o.faction = null; S.pendingCaptives = S.pendingCaptives.filter((c) => c.name !== 'Meng Huo');
          const kin = ['Zhu Rong', 'Meng You'].filter((n) => S.officers[n] && !S.officers[n].captive && (!S.officers[n].faction || S.officers[n].faction === ctx.fid));
          E.foundHouse({ id: 'menghuo', name: 'Meng Huo', ruler: 'Meng Huo', color: '#7b1fa2', cities: ['jianning'], officers: kin, aggr: 0.2, persona: ['cautious'] });
          E.setRelation(ctx.fid, 'menghuo', 80); E.ally(ctx.fid, 'menghuo', 600); E.gold(ctx.fid, 3000); E.prestige(ctx.fid, 15);
          flags(S).nanman = S.turn;
          return `Meng Huo weeps: "The southern people will never rebel again." He returns to Jianning as king of the Nanman under ${E.fname(ctx.fid)}, and the tribute of the hills comes north each year.`;
        } },
        { label: 'Keep the land and garrison it', ai: 0.4, apply: (E, S, ctx) => { const o = S.officers['Meng Huo']; if (o && !o.faction) { o.faction = ctx.fid; o.loyalty = 40; o.captive = null; S.pendingCaptives = S.pendingCaptives.filter((c) => c.name !== 'Meng Huo'); } S.provinces.jianning.order = Math.max(0, S.provinces.jianning.order - 20); flags(S).nanman = S.turn; return `${E.fname(ctx.fid)} keeps Jianning under its own governors. The hills grumble and the garrison sleeps badly.`; } },
      ],
    },
  },
  // ---------------------------------------------------------- the world at large
  {
    id: 'frontier-revolt', title: 'A general declares for himself', repeat: true,
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      for (const H of bigHouses(E, S, 7)) {
        const seat = seatOf(E, H.id);
        for (const p of E.factionProvinces(H.id)) {
          if (p.id === seat || S.adj[seat].includes(p.id)) continue;
          if (!S.adj[p.id].some((n) => S.provinces[n].owner !== H.id)) continue;
          const G = E.officersIn(p.id, H.id).filter((o) => o.name !== H.ruler && o.war >= 75 && o.loyalty < 45).sort((a, b) => b.war - a.war)[0];
          if (G && Math.random() < 0.05) return { fid: H.id, g: G.name, city: p.id };
        }
      }
      return null;
    },
    apply: (E, S, ctx) => { E.foundHouse({ id: `rebel-${slug(ctx.g)}-${S.turn}`, name: ctx.g, ruler: ctx.g, color: REBEL_COLORS[(S.turn * 7) % REBEL_COLORS.length], cities: [ctx.city], aggr: 1.3, persona: ['reckless'] }); return `${ctx.g}, long unpaid and unhonoured, raises his own banner over ${E.pname(ctx.city)} and declares that he serves ${E.fname(ctx.fid)} no longer.`; },
  },
  {
    id: 'brothers-war', title: 'The brothers\u2019 war', repeat: true,
    from: [192, 1], to: [280, 12],
    when: (E, S) => {
      for (const H of bigHouses(E, S, 8)) {
        const ls = H.lastSuccession; if (!ls || !ls.rival || S.turn - ls.turn > 6 || (flags(S).splitChecked || {})[H.id] === ls.turn) continue;
        (flags(S).splitChecked = flags(S).splitChecked || {})[H.id] = ls.turn;
        const R = S.officers[ls.rival]; const seat = seatOf(E, H.id);
        if (!R || R.faction !== H.id || R.captive || R.city === seat || S.provinces[R.city].owner !== H.id) continue;
        if (Math.random() > 0.35) continue;
        const own = E.factionProvinces(H.id).map((p) => p.id);
        const cities = [R.city, ...S.adj[R.city].filter((n) => own.includes(n) && n !== seat)].slice(0, Math.max(1, Math.floor(own.length / 3)));
        return { fid: H.id, r: R.name, cities, heir: H.ruler };
      }
      return null;
    },
    apply: (E, S, ctx) => { E.foundHouse({ id: `split-${slug(ctx.r)}-${S.turn}`, name: ctx.r, ruler: ctx.r, color: REBEL_COLORS[(S.turn * 3) % REBEL_COLORS.length], cities: ctx.cities, aggr: 1.1, persona: ['reckless'] }); return `${ctx.r} refuses to bow to ${ctx.heir}. The officers of ${ctx.cities.map((c) => E.pname(c)).join(', ')} declare for him, and the house that ruled them is split in two.`; },
  },
  {
    id: 'great-plague', title: 'The great plague', repeat: true,
    from: [195, 1], to: [280, 12],
    when: (E, S) => (Math.random() < 0.004 ? {} : null),
    apply: (E, S) => {
      for (const p of Object.values(S.provinces)) { p.pop = Math.floor(p.pop * 0.92); p.order = Math.max(0, (p.order || 50) - 4); }
      const dead = E.officers().filter((o) => Math.random() < (E.age(o) > 55 ? 0.06 : 0.015)).slice(0, 12);
      const notable = [...dead].sort((a, b) => (b.ldr + b.war + b.int + b.pol) - (a.ldr + a.war + a.int + a.pol)).slice(0, 4).map((o) => o.name);
      for (const o of dead) E.killQuiet(o.name, 'of the plague');
      return `Pestilence sweeps the land from the Yellow River to the Yangtze. Villages stand empty and the markets fall silent.${notable.length ? ` Among the dead are ${notable.join(', ')}.` : ''}`;
    },
  },
  {
    id: 'tribes-rise', title: 'The tribes rise', repeat: true,
    from: [190, 1], to: [280, 12],
    when: (E, S) => {
      const cands = ['longxi', 'xiliang', 'wudu', 'danyang', 'jianan', 'zangke', 'hepu'].map((c) => S.provinces[c]).filter((p) => p.owner && S.factions[p.owner].alive && !S.factions[p.owner].raider && p.troops < 4000 && p.order < 55);
      if (!cands.length || Math.random() > 0.04) return null;
      const p = cands[Math.floor(Math.random() * cands.length)];
      return { city: p.id, fid: p.owner };
    },
    apply: (E, S, ctx) => {
      const tribe = { longxi: 'the Qiang', xiliang: 'the Qiang', wudu: 'the Di', danyang: 'the Shanyue', jianan: 'the Shanyue', zangke: 'the Yi of the hills', hepu: 'the Li of the coast' }[ctx.city];
      const seat = seatOf(E, ctx.fid); for (const o of E.officersIn(ctx.city, ctx.fid)) o.city = seat;
      E.transferCity(ctx.city, null); const p = S.provinces[ctx.city]; p.troops = 9000; p.order = 40;
      return `With the garrison of ${E.pname(ctx.city)} thin and its people restless, ${tribe} rise and drive out the officials of ${E.fname(ctx.fid)}. The city answers to no lord.`;
    },
  },
  // ---------------------------------------------------------- Jing: the house of Liu Biao
  {
    id: 'cai-faction', title: 'The Cai faction',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const H = S.factions.liubiao; if (!H || !H.alive || H.guest || H.ruler === 'Liu Biao') return null;
      const ls = H.lastSuccession; if (!ls || S.turn - ls.turn > 2) return null;
      if (E.factionProvinces('liubiao').length < 4 || S.provinces.xiangyang.owner !== 'liubiao') return null;
      const cai = S.officers['Cai Mao']; if (!cai || cai.faction !== 'liubiao' || cai.captive) return null;
      return { fid: 'liubiao', heir: H.ruler };
    },
    decision: {
      house: 'liubiao',
      prompt: (E, S, ctx) => `Liu Biao is dead. Before the mourning is over, Cai Mao and his sister, the late lord\u2019s widow, produce a testament naming the boy Liu Cong heir and fill the gates of Xiangyang with their clients. ${ctx.heir} holds the seat by right, but the Cai hold the city.`,
      options: [
        { label: 'Accept the Cai settlement: Liu Cong takes the seat', ai: 0.55, apply: (E, S, ctx) => {
          const H = S.factions.liubiao;
          const cong = E.addOfficer({ name: 'Liu Cong', ldr: 35, war: 25, int: 50, pol: 55, chr: 50, faction: 'liubiao', city: 'xiangyang', loyalty: 100, born: 194 });
          cong.faction = 'liubiao'; cong.city = 'xiangyang';
          H.ruler = 'Liu Cong'; H.name = H.dynasty || 'Liu Cong';
          for (const n of ['Cai Mao', 'Kuai Yue']) if (S.officers[n] && S.officers[n].faction === 'liubiao') S.officers[n].loyalty = 100;
          const old = S.officers[ctx.heir]; let tail = '';
          if (old && S.provinces.jiangxia.owner === 'liubiao' && E.factionProvinces('liubiao').length >= 3) {
            E.foundHouse({ id: `liuqi-${S.turn}`, name: old.name, ruler: old.name, color: '#3aa6a0', cities: ['jiangxia'], aggr: 0.8, persona: ['cautious'] });
            tail = ` ${old.name} refuses to serve his half-brother\u2019s regents and withdraws to Jiangxia with its garrison, a lord in his own right.`;
          } else if (old) { old.loyalty = 40; tail = ` ${old.name} swallows the insult and keeps his silence.`; }
          E.prestige('liubiao', -10);
          return `The Cai faction enthrone the boy Liu Cong at Xiangyang and govern Jing in his name.${tail}`;
        } },
        { label: 'Purge the Cai and hold the seat', ai: 0.45, apply: (E, S, ctx) => {
          for (const n of ['Cai Mao', 'Kuai Yue']) { const o = S.officers[n]; if (o && o.faction === 'liubiao') { o.faction = null; o.loyalty = 0; } }
          for (const p of E.factionProvinces('liubiao')) p.order = Math.max(0, p.order - 10);
          E.prestige('liubiao', 5);
          return `${ctx.heir} strikes first: Cai Mao and Kuai Yue are driven from Xiangyang and their clients scattered. Jing keeps its lord, but the great families remember.`;
        } },
      ],
    },
  },
  {
    id: 'surrender-of-jing', title: 'The surrender of Jing',
    from: [200, 1], to: [280, 12],
    when: (E, S) => {
      const H = S.factions.liubiao; if (!H || !H.alive || H.guest || H.ruler === 'Liu Biao' || S.provinces.xiangyang.owner !== 'liubiao') return null;
      const mine = E.factionProvinces('liubiao').length;
      const G = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== 'liubiao' && E.bordering(f.id, 'liubiao') && E.canAttack(f.id, 'liubiao') && E.factionProvinces(f.id).length >= mine * 2 && E.totalTroops(f.id) >= E.totalTroops('liubiao') * 2)
        .sort((a, b) => E.totalTroops(b.id) - E.totalTroops(a.id))[0];
      if (!G || Math.random() > 0.15) return null;
      return { fid: 'liubiao', g: G.id };
    },
    decision: {
      house: 'liubiao',
      prompt: (E, S, ctx) => `${E.fname(ctx.g)}\u2019s host darkens the northern horizon and the court of Xiangyang is of one mind: Kuai Yue and the great families counsel surrender, "for the lord of Jing may keep his rank, and the people their lives." Only the young officers would fight.`,
      options: [
        { label: 'Submit and surrender the north of Jing', ai: 0.6, apply: (E, S, ctx) => {
          const north = ['xiangyang', 'xinye', 'wan', 'jiangling', 'jiangxia', 'shangyong'].filter((c) => S.provinces[c].owner === 'liubiao');
          const names = north.map(E.pname);
          for (const c of north) { const offs = E.officersIn(c, 'liubiao').map((o) => o.name); E.transferCity(c, ctx.g); for (const n of offs) E.joinHouse(n, ctx.g, 60, c, true); }
          E.setRelation('liubiao', ctx.g, 40); E.prestige('liubiao', -20); E.prestige(ctx.g, 15);
          if (S.factions.liubiao.alive && E.factionProvinces('liubiao').length) { E.ceasefire('liubiao', ctx.g, 60); return `The seals of ${names.join(', ')} are carried north to ${E.fname(ctx.g)}. The house of Liu Biao lives on south of the river, a client of the power it feared.`; }
          return `The seals of ${names.join(', ')} are carried north to ${E.fname(ctx.g)}, and the house of Liu Biao is no more. Its officers take service with the conqueror.`;
        } },
        { label: 'Refuse and hold the walls', ai: 0.4, apply: (E, S, ctx) => {
          S.provinces.xiangyang.defense = Math.min(999, S.provinces.xiangyang.defense + 120); E.prestige('liubiao', 10);
          const gone = ['Kuai Yue', 'Cai Mao'].filter((n) => S.officers[n] && S.officers[n].faction === 'liubiao' && !S.officers[n].captive);
          for (const n of gone) E.joinHouse(n, ctx.g, 70, null, true);
          E.warTarget(ctx.g, 'liubiao', 18);
          return `The young lord of Jing refuses. The walls of Xiangyang are manned${gone.length ? `, though ${gone.join(' and ')} slip away north by night` : ''}, and ${E.fname(ctx.g)} makes ready for war.`;
        } },
      ],
    },
  },
  // ---------------------------------------------------------- Yuan Shu
  {
    id: 'honey-and-famine', title: 'Honey and famine',
    from: [198, 1], to: [280, 12],
    when: (E, S) => {
      const Y = S.factions.yuanshu; if (!Y || !Y.alive || Y.guest || Y.ruler !== 'Yuan Shu' || !S.eventsFired['yuan-shu-emperor']) return null;
      return Math.random() < 0.2 ? { seat: seatOf(E, 'yuanshu') } : null;
    },
    apply: (E, S, ctx) => {
      for (const p of E.factionProvinces('yuanshu')) { p.order = Math.max(0, p.order - 15); p.food = Math.floor(p.food * 0.5); }
      const rebels = ['Lei Bo', 'Chen Lan'].filter((n) => S.officers[n] && S.officers[n].faction === 'yuanshu' && !S.officers[n].captive);
      const hills = E.factionProvinces('yuanshu').find((p) => p.id !== ctx.seat);
      let tail = '';
      if (rebels.length && hills) { E.foundHouse({ id: `bandits-${S.turn}`, name: rebels[0], ruler: rebels[0], color: '#7a5c3a', cities: [hills.id], officers: rebels.slice(1), aggr: 1.4, persona: ['treacherous'] }); tail = ` ${rebels.join(' and ')} take their men into the hills and hold ${E.pname(hills.id)} as bandits.`; }
      else if (rebels.length) { for (const n of rebels) { S.officers[n].faction = null; S.officers[n].loyalty = 0; } tail = ` ${rebels.join(' and ')} desert with their men.`; }
      E.prestige('yuanshu', -10);
      return `The Emperor of Zhong feasts on a hundred dishes while his people eat bark. The granaries are empty, the roads full of the starving, and the army melts away.${tail}`;
    },
  },
  {
    id: 'yuan-remnant', title: 'The remnant of the Yuan',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const Y = S.factions.yuanshu; if (!Y || Y.alive || flags(S).yuanRemnant) return null;
      const cand = ['jianye', 'lujiang', 'shouchun'].map((c) => S.provinces[c].owner).filter((f) => f && S.factions[f].alive && !S.factions[f].raider);
      if (!cand.length) return null;
      return { fid: cand.includes('sunjian') ? 'sunjian' : cand[0] };
    },
    apply: (E, S, ctx) => {
      E.gold(ctx.fid, 4000);
      const seat = seatOf(E, ctx.fid);
      E.addOfficer({ name: 'Yuan Yao', ldr: 50, war: 42, int: 60, pol: 66, chr: 62, faction: ctx.fid, city: seat, loyalty: 75, born: 180 });
      flags(S).yuanRemnant = S.turn;
      return `Yuan Shu\u2019s son Yuan Yao arrives at ${E.pname(seat)} with his father\u2019s remaining treasure and his sister, seeking the protection of ${E.fname(ctx.fid)}. The gold is welcome; the marriage more so.`;
    },
  },
  // ---------------------------------------------------------- Liu Zhang and Shu
  {
    id: 'zhao-wei-revolt', title: 'Zhao Wei\u2019s revolt',
    from: [198, 1], to: [280, 12],
    when: (E, S) => {
      const L = S.factions.liuzhang; if (!L || !L.alive || L.guest || E.factionProvinces('liuzhang').length < 3) return null;
      const zw = S.officers['Zhao Wei']; if (!zw || zw.faction !== 'liuzhang' || zw.captive) return null;
      if (zw.city === seatOf(E, 'liuzhang') || S.provinces[zw.city].owner !== 'liuzhang' || Math.random() > 0.08) return null;
      return { city: zw.city };
    },
    apply: (E, S, ctx) => { E.foundHouse({ id: `rebel-zhaowei-${S.turn}`, name: 'Zhao Wei', ruler: 'Zhao Wei', color: '#a0522d', cities: [ctx.city], aggr: 1.3, persona: ['reckless'] }); S.provinces[ctx.city].troops += 6000; return `Zhao Wei, commander of the eastern marches, turns the Dongzhou soldiers against the lord who paid them and raises his banner over ${E.pname(ctx.city)}. Shu is at war with itself.`; },
  },
  {
    id: 'liu-zhang-gates', title: 'Opening the gates of Chengdu',
    from: [212, 1], to: [280, 12],
    when: (E, S) => {
      const L = S.factions.liuzhang; if (!L || !L.alive || L.guest || S.provinces.chengdu.owner !== 'liuzhang') return null;
      const cd = S.provinces.chengdu;
      const X = S.adj.chengdu.map((c) => S.provinces[c]).filter((p) => p.owner && p.owner !== 'liuzhang' && S.factions[p.owner].alive && !S.factions[p.owner].raider && E.canAttack(p.owner, 'liuzhang') && p.troops >= cd.troops * 1.5 && E.factionProvinces(p.owner).length >= E.factionProvinces('liuzhang').length)
        .sort((a, b) => b.troops - a.troops)[0];
      if (!X || Math.random() > 0.15) return null;
      return { fid: 'liuzhang', x: X.owner, from: X.id };
    },
    decision: {
      house: 'liuzhang',
      prompt: (E, S, ctx) => `${E.fname(ctx.x)}\u2019s army stands before Chengdu. The city has grain for a year and thirty thousand men, and every officer swears to fight; but Liu Zhang looks at the crowded streets and says, "Father and son, we have ruled Shu twenty years and given the people nothing but war."`,
      options: [
        { label: 'Open the gates and spare the people', ai: 0.55, apply: (E, S, ctx) => {
          const cities = E.factionProvinces('liuzhang').map((p) => p.id);
          const offs = E.factionOfficers('liuzhang').map((o) => o.name);
          for (const c of cities) E.transferCity(c, ctx.x);
          for (const n of offs) E.joinHouse(n, ctx.x, n === 'Liu Zhang' ? 50 : 65, null, true);
          if (S.factions.liuzhang.alive) E.dissolveHouse('liuzhang');
          E.prestige(ctx.x, 15); E.setRelation(ctx.x, 'liuzhang', 30);
          return `Liu Zhang rides out of Chengdu and hands over the seals of Shu. ${E.fname(ctx.x)} enters the city without a fight; the people line the streets, and the officers of Shu take new service.`;
        } },
        { label: 'Hold out behind the walls', ai: 0.45, apply: (E, S, ctx) => {
          S.provinces.chengdu.defense = Math.min(999, S.provinces.chengdu.defense + 150); E.prestige('liuzhang', 5);
          const gone = ['Fa Zheng', 'Meng Da'].filter((n) => S.officers[n] && S.officers[n].faction === 'liuzhang' && !S.officers[n].captive);
          for (const n of gone) E.joinHouse(n, ctx.x, 80, ctx.from, true);
          return `Liu Zhang bars the gates. The walls of Chengdu are the highest in the west, and the siege will be long${gone.length ? `; but ${gone.join(' and ')} go over to the besiegers with the maps of the city` : ''}.`;
        } },
      ],
    },
  },
  // ---------------------------------------------------------- Shi Xie and the far south
  {
    id: 'shixie-tribute', minor: true, title: 'Tribute of the south', repeat: true,
    from: [190, 1], to: [280, 12],
    when: (E, S) => {
      const X = S.factions.shixie; if (!X || !X.alive || X.guest || E.factionProvinces('shixie').length > 4) return null;
      const emp = Object.values(S.factions).find((f) => f.alive && f.hasEmperor && f.id !== 'shixie');
      const nb = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== 'shixie' && E.bordering(f.id, 'shixie')).sort((a, b) => E.totalTroops(b.id) - E.totalTroops(a.id))[0];
      const to = nb || emp; if (!to || Math.random() > 0.06) return null;
      return { to: to.id };
    },
    apply: (E, S, ctx) => { E.gold('shixie', -600); E.gold(ctx.to, 600); E.shiftRelation('shixie', ctx.to, 20); E.ceasefire('shixie', ctx.to, 24); return `Shi Xie sends north a train of pearls, ivory, tortoiseshell and incense for ${E.fname(ctx.to)}, with letters of the most elegant humility. The far south buys another two years of peace.`; },
  },
  {
    id: 'shi-hui-revolt', title: 'Shi Hui\u2019s revolt',
    from: [200, 1], to: [280, 12],
    when: (E, S) => {
      const X = S.factions.shixie; if (!X || !X.alive || X.guest || X.ruler === 'Shi Xie' || flags(S).shiHui) return null;
      const O = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== 'shixie' && E.treatyStatus('shixie', f.id) !== 'neutral' && E.totalTroops(f.id) >= E.totalTroops('shixie') * 3 && E.bordering(f.id, 'shixie'))
        .sort((a, b) => E.totalTroops(b.id) - E.totalTroops(a.id))[0];
      if (!O || Math.random() > 0.2) return null;
      return { o: O.id, ruler: X.ruler };
    },
    apply: (E, S, ctx) => { E.breakTreaty('shixie', ctx.o); E.setRelation('shixie', ctx.o, -60); E.warTarget(ctx.o, 'shixie', 24); E.prestige('shixie', -10); flags(S).shiHui = S.turn; return `${ctx.ruler} will not bow as his father did. He seizes the ports, turns away ${E.fname(ctx.o)}\u2019s inspector and stops the tribute. The overlord\u2019s fleet is already gathering.`; },
  },
  // ---------------------------------------------------------- successors everywhere
  {
    id: 'young-lord', title: 'The young lord', repeat: true,
    from: [190, 1], to: [280, 12],
    when: (E, S) => {
      for (const H of bigHouses(E, S, 4)) {
        const ls = H.lastSuccession; if (!ls || S.turn - ls.turn > 1 || ((flags(S).youngLord || {})[H.id] || 0) > S.turn) continue;
        const R = E.rulerOf(H.id); if (!R) continue;
        if (!(E.age(R) <= 18 || R.ldr + R.war + R.int + R.pol + R.chr < 260)) continue;
        const N = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== H.id && E.bordering(f.id, H.id) && E.canAttack(f.id, H.id)).sort((a, b) => E.totalTroops(b.id) - E.totalTroops(a.id))[0];
        if (!N) continue;
        return { fid: H.id, r: R.name, n: N.id };
      }
      return null;
    },
    apply: (E, S, ctx) => {
      (flags(S).youngLord = flags(S).youngLord || {})[ctx.fid] = S.turn + 60;
      E.warTarget(ctx.n, ctx.fid, 12); const N = S.factions[ctx.n]; N.caution = Math.min(N.caution || 1, 0.85);
      for (const o of E.factionOfficers(ctx.fid)) if (o.name !== ctx.r && o.loyalty < 60) o.loyalty = Math.max(0, o.loyalty - 15);
      return `${ctx.r} takes the seat of ${E.fname(ctx.fid)} untried. ${E.fname(ctx.n)} sharpens its swords at the news, and the older officers wonder aloud whom they now serve.`;
    },
  },
  // ---------------------------------------------------------- Ma Teng and the west
  {
    id: 'brothers-of-liang', title: 'The brothers of Liang',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const M = S.factions.mateng; if (!M || !M.alive || M.guest || E.factionProvinces('mateng').length < 2) return null;
      const hs = S.officers['Han Sui']; if (!hs || hs.faction !== 'mateng' || hs.captive || hs.name === M.ruler) return null;
      return Math.random() < 0.06 ? { fid: 'mateng', city: hs.city } : null;
    },
    decision: {
      house: 'mateng',
      prompt: (E, S, ctx) => `Han Sui and ${E.rulerOf('mateng').name} swore brotherhood on the Tao years ago; now their households feud, a wife is dead, and Han Sui\u2019s riders no longer answer the summons from ${E.pname(ctx.city)}.`,
      options: [
        { label: 'Buy peace with gold and a rank', ai: 0.5, apply: (E, S, ctx) => { E.gold('mateng', -1500); const hs = S.officers['Han Sui']; hs.loyalty = 95; hs.rank = Math.max(hs.rank || 0, 2); return `${E.rulerOf('mateng').name} sends Han Sui gold, horses and a general\u2019s seal, and the two old men weep and drink together. The Liang riders ride as one again.`; } },
        { label: 'Let the feud run its course', ai: 0.5, apply: (E, S, ctx) => {
          const hs = S.officers['Han Sui'];
          if (ctx.city !== seatOf(E, 'mateng') && S.provinces[ctx.city].owner === 'mateng') { E.foundHouse({ id: `hansui-${S.turn}`, name: 'Han Sui', ruler: 'Han Sui', color: '#b08850', cities: [ctx.city], aggr: 1.1, persona: ['reckless'] }); return `Han Sui raises his own banner over ${E.pname(ctx.city)}. Liang is at war with itself, brother against sworn brother.`; }
          hs.faction = null; hs.loyalty = 0; return `Han Sui rides away into the Qiang country with his household. The brotherhood of Liang is finished.`;
        } },
      ],
    },
  },
  {
    id: 'summoned-to-court', title: 'Summoned to court',
    from: [205, 1], to: [280, 12],
    when: (E, S) => {
      const M = S.factions.mateng; if (!M || !M.alive || M.guest || M.ruler !== 'Ma Teng' || flags(S).maTengCourt) return null;
      const mc = S.officers['Ma Chao']; if (!mc || mc.faction !== 'mateng' || mc.captive) return null;
      const H = Object.values(S.factions).find((f) => f.alive && f.hasEmperor && !f.raider && f.id !== 'mateng'); if (!H) return null;
      return Math.random() < 0.1 ? { fid: 'mateng', h: H.id } : null;
    },
    decision: {
      house: 'mateng',
      prompt: (E, S, ctx) => `An edict arrives from the Emperor\u2019s court at ${E.pname(seatOf(E, ctx.h))}: Ma Teng is named to high office and bidden to come and take it up, leaving the west to his son. Everyone knows whose hand wrote the edict. To refuse is to defy ${E.fname(ctx.h)}; to go is to live as a hostage in silk.`,
      options: [
        { label: 'Obey the summons and hand the west to Ma Chao', ai: 0.6, apply: (E, S, ctx) => {
          const M = S.factions.mateng; M.ruler = 'Ma Chao'; M.name = M.dynasty || 'Ma Chao'; S.officers['Ma Chao'].loyalty = 100;
          E.joinHouse('Ma Teng', ctx.h, 80, seatOf(E, ctx.h), true);
          E.shiftRelation('mateng', ctx.h, 30); flags(S).maTengCourt = { host: ctx.h, turn: S.turn };
          return `Ma Teng rides east with his household to serve at court, and the west passes to Ma Chao. ${E.fname(ctx.h)} treats the old lord with every honour, and watches him.`;
        } },
        { label: 'Refuse the edict', ai: 0.4, apply: (E, S, ctx) => { E.shiftRelation('mateng', ctx.h, -30); E.prestige('mateng', 5); flags(S).maTengCourt = 'refused'; return `Ma Teng sends the envoy back with a gift of horses and no answer. The men of Liang cheer; ${E.fname(ctx.h)} does not forget.`; } },
      ],
    },
  },
  {
    id: 'hostages-at-court', title: 'Hostages at court',
    from: [205, 1], to: [280, 12],
    when: (E, S) => {
      const c = flags(S).maTengCourt; if (!c || typeof c !== 'object') return null;
      const mt = S.officers['Ma Teng']; const M = S.factions.mateng, H = S.factions[c.host];
      if (!mt || mt.faction !== c.host || !M || !M.alive || !H || !H.alive) return null;
      const struck = (M.lastAttackTarget === c.host && S.turn - M.lastAttackTurn <= 2) || M.warTarget === c.host;
      return struck ? { host: c.host } : null;
    },
    apply: (E, S, ctx) => { E.kill('Ma Teng', 'executed at the capital together with his household, when his son took up arms against his host'); for (const n of ['Ma Tie', 'Ma Xiu']) if (S.officers[n] && S.officers[n].faction === ctx.host) E.killQuiet(n, 'executed with his father'); E.setRelation('mateng', ctx.host, -100); flags(S).maTengCourt = 'executed'; return `Word of Ma Chao\u2019s rising reaches the court. Ma Teng and every member of his household in the capital are put to death, and the west swears vengeance.`; },
  },
  {
    id: 'tong-pass', title: 'Tong Pass',
    from: [208, 1], to: [280, 12],
    when: (E, S) => {
      const M = S.factions.mateng; if (!M || !M.alive || M.guest) return null;
      const mc = S.officers['Ma Chao']; if (!mc || mc.faction !== 'mateng' || mc.captive) return null;
      const G = S.provinces.changan.owner; if (!G || G === 'mateng' || !S.factions[G].alive || S.factions[G].raider || !E.canAttack('mateng', G)) return null;
      if (E.factionProvinces(G).length < E.factionProvinces('mateng').length * 2 || !E.bordering('mateng', G)) return null;
      const front = frontCity(E, S, 'mateng', G); if (!front || Math.random() > 0.12) return null;
      return { g: G, front: front.id };
    },
    apply: (E, S, ctx) => { const p = S.provinces[ctx.front]; p.troops += 12000; p.training = Math.min(100, p.training + 10); E.warTarget('mateng', ctx.g, 24); E.prestige('mateng', 5); S.factions.mateng.aggr = Math.max(S.factions.mateng.aggr, 1.4); return `Ma Chao raises the Qiang and the Di. Ten thousand frontier riders gather at ${E.pname(ctx.front)}, and the Splendid leads them against ${E.fname(ctx.g)} at Tong Pass.`; },
  },
  {
    id: 'ma-chao-seeks-master', title: 'Ma Chao seeks a master',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const M = S.factions.mateng; if (!M || M.alive) return null;
      const mc = S.officers['Ma Chao']; if (!mc || mc.captive || mc.faction) return null;
      const hz = S.provinces.hanzhong.owner, cd = S.provinces.chengdu.owner;
      const to = [hz, cd].find((f) => f && S.factions[f].alive && !S.factions[f].raider && !S.factions[f].guest);
      return to ? { to } : null;
    },
    apply: (E, S, ctx) => {
      const seat = seatOf(E, ctx.to); E.joinHouse('Ma Chao', ctx.to, 70, seat, true);
      const md = S.officers['Ma Dai']; if (md && !md.faction && !md.captive) E.joinHouse('Ma Dai', ctx.to, 70, seat, true);
      S.provinces[seat].troops += 5000; flags(S).maChaoHost = { fid: ctx.to, turn: S.turn };
      return `Ma Chao, his father\u2019s house destroyed and his family slaughtered, rides in from the Qiang country with his cousin Ma Dai and a retinue of frontier horsemen, and offers his sword to ${E.fname(ctx.to)}.`;
    },
  },
  {
    id: 'ma-chao-rides-west', title: 'Ma Chao rides west',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const h = flags(S).maChaoHost; if (!h || S.turn - h.turn < 12) return null;
      const mc = S.officers['Ma Chao']; if (!mc || mc.captive || mc.faction !== h.fid) return null;
      const W = S.provinces.chengdu.owner; if (!W || W === h.fid || !S.factions[W].alive || S.factions[W].raider || S.factions[W].guest) return null;
      if (E.factionProvinces(W).length < 4 || Math.random() > 0.1) return null;
      return { from: h.fid, to: W };
    },
    apply: (E, S, ctx) => { const seat = seatOf(E, ctx.to); E.joinHouse('Ma Chao', ctx.to, 90, seat, true); const md = S.officers['Ma Dai']; if (md && md.faction === ctx.from && !md.captive) E.joinHouse('Ma Dai', ctx.to, 85, seat, true); flags(S).maChaoHost = null; E.shiftRelation(ctx.from, ctx.to, -15); return `Slandered at ${E.fname(ctx.from)}\u2019s court and trusted by no one there, Ma Chao slips away with Ma Dai and rides to ${E.pname(seat)}, where ${E.rulerOf(ctx.to).name} receives him as a brother.`; },
  },
  // ---------------------------------------------------------- Gongsun Zan and the north
  {
    id: 'liu-yu', title: 'Liu Yu',
    from: [192, 1], to: [196, 12],
    when: (E, S) => { const G = S.factions.gongsunzan; return G && G.alive && !G.guest && Math.random() < 0.15 ? { fid: 'gongsunzan' } : null; },
    decision: {
      house: 'gongsunzan',
      prompt: () => `Liu Yu, Governor of You Province, is beloved by the people and the tribes alike, and he has never approved of Gongsun Zan\u2019s wars. His treasury and his levies sit within reach. He could be seized on a charge of treason; or he could be left to his benevolence.`,
      options: [
        { label: 'Seize Liu Yu on a charge of treason', ai: 0.6, apply: (E, S) => { E.gold('gongsunzan', 3000); S.provinces[seatOf(E, 'gongsunzan')].troops += 8000; E.prestige('gongsunzan', -20); for (const p of E.factionProvinces('gongsunzan')) p.order = Math.max(0, p.order - 10); for (const f of Object.values(S.factions)) if (f.alive && f.id !== 'gongsunzan') E.shiftRelation('gongsunzan', f.id, -10); return `Liu Yu is beheaded in the market of Ji on a forged charge. His treasury and his levies pass to Gongsun Zan, and the whole north calls him a murderer.`; } },
        { label: 'Spare him', ai: 0.4, apply: (E) => { E.prestige('gongsunzan', 10); return `Gongsun Zan lets the old governor be. "Let him feed the people; I will fight the wars." The north thinks better of him for it.`; } },
      ],
    },
  },
  {
    id: 'white-riders', minor: true, title: 'The White Riders', repeat: true,
    from: [190, 1], to: [280, 12],
    when: (E, S) => {
      const G = S.factions.gongsunzan; if (!G || !G.alive || G.guest) return null;
      const raider = ['wuhuan', 'xianbei'].map((f) => S.factions[f]).find((f) => f && f.alive && G.lastAttackTarget === f.id && S.turn - G.lastAttackTurn <= 3 && S.turn - (f.lastLoss || -99) <= 3);
      return raider ? { raider: raider.id } : null;
    },
    apply: (E, S, ctx) => { E.prestige('gongsunzan', 5); for (const p of E.factionProvinces('gongsunzan')) p.training = Math.min(100, p.training + 5); E.shiftRelation('gongsunzan', ctx.raider, -20); return `Gongsun Zan\u2019s White Riders run down the ${E.fname(ctx.raider)} horsemen and bring back their herds. The tribes teach their children to fear white horses.`; },
  },
  {
    id: 'zhao-yun-leaves', title: 'Zhao Yun takes leave',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const G = S.factions.gongsunzan, L = S.factions.liubei; if (!G || !G.alive || !L || !L.alive) return null;
      const zy = S.officers['Zhao Yun']; if (!zy || zy.faction !== 'gongsunzan' || zy.captive) return null;
      const faltering = E.factionProvinces('gongsunzan').length <= 2 || S.turn - (G.lastLoss || -99) <= 12 || S.year >= 200;
      return faltering && Math.random() < 0.1 ? { fid: 'gongsunzan' } : null;
    },
    decision: {
      house: 'gongsunzan',
      prompt: () => `Zhao Yun asks leave to go home and mourn his elder brother. Everyone at court knows where the road from his home leads: to Liu Bei, whom he has loved since they shared a tent in the coalition years.`,
      options: [
        { label: 'Let him go with honour', ai: 0.6, apply: (E, S) => { const L = S.factions.liubei; const dest = L.guest ? E.rulerOf('liubei').city : seatOf(E, 'liubei'); E.joinHouse('Zhao Yun', 'liubei', 100, dest, true); E.prestige('gongsunzan', 5); E.shiftRelation('gongsunzan', 'liubei', 20); return `Gongsun Zan gives Zhao Yun a white horse and lets him ride. He does not come back; he is Liu Bei\u2019s man now, and will be to the end of his days.`; } },
        { label: 'Refuse him leave', ai: 0.4, apply: (E, S) => { S.officers['Zhao Yun'].loyalty = Math.max(0, S.officers['Zhao Yun'].loyalty - 30); return `Zhao Yun is kept at his post. He serves without complaint and without warmth, and his eyes turn south whenever Liu Bei\u2019s name is spoken.`; } },
      ],
    },
  },
  {
    id: 'tower-of-yijing', title: 'The tower of Yijing',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const G = S.factions.gongsunzan; if (!G || !G.alive || G.guest || flags(S).yijing || E.factionProvinces('gongsunzan').length > 2) return null;
      const foe = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== 'gongsunzan' && E.bordering(f.id, 'gongsunzan') && E.canAttack(f.id, 'gongsunzan') && E.totalTroops(f.id) >= E.totalTroops('gongsunzan') * 3).sort((a, b) => E.totalTroops(b.id) - E.totalTroops(a.id))[0];
      return foe && Math.random() < 0.2 ? { fid: 'gongsunzan', foe: foe.id } : null;
    },
    decision: {
      house: 'gongsunzan',
      prompt: (E, S, ctx) => `${E.fname(ctx.foe)} presses from every side. At Yijing Gongsun Zan has built a tower of iron gates and earthen walls ten fathoms high, with grain for ten years. He could shut himself in and let the storm blow itself out; his generals outside would be left to fend for themselves.`,
      options: [
        { label: 'Withdraw into the tower', ai: 0.6, apply: (E, S, ctx) => { const seat = S.provinces[seatOf(E, 'gongsunzan')]; seat.defense = 999; seat.food += 80000; for (const o of E.factionOfficers('gongsunzan')) if (o.name !== 'Gongsun Zan') o.loyalty = Math.max(0, o.loyalty - 20); flags(S).yijing = { turn: S.turn }; return `Gongsun Zan shuts the iron gates of Yijing with his women and his grain and lets no man in. "When my generals are hard pressed I will not save them, lest they learn to rely on me." They learn instead to despise him.`; } },
        { label: 'Sally forth with the White Riders', ai: 0.4, apply: (E, S, ctx) => { const seat = S.provinces[seatOf(E, 'gongsunzan')]; seat.troops += 6000; seat.training = Math.min(100, seat.training + 10); E.prestige('gongsunzan', 5); E.warTarget('gongsunzan', ctx.foe, 12); return `Gongsun Zan will not die behind walls. The White Riders pour out of Yijing for one more campaign.`; } },
      ],
    },
  },
  {
    id: 'yijing-despair', minor: true, title: 'Despair in the tower', repeat: true,
    from: [195, 1], to: [280, 12],
    when: (E, S) => { const y = flags(S).yijing; const G = S.factions.gongsunzan; return y && typeof y === 'object' && G && G.alive && S.turn - y.turn <= 48 && Math.random() < 0.08 ? {} : null; },
    apply: (E, S) => { for (const o of E.factionOfficers('gongsunzan')) if (o.name !== 'Gongsun Zan') o.loyalty = Math.max(0, o.loyalty - 8); for (const p of E.factionProvinces('gongsunzan')) p.order = Math.max(0, p.order - 5); return `Behind the iron gates Gongsun Zan sees no one but his women and his soothsayers. Outside, his officers go unpaid and unvisited, and their letters come back unopened.`; },
  },
  // ---------------------------------------------------------- Zhang Lu and Hanzhong
  {
    id: 'charity-houses', minor: true, title: 'The charity houses', repeat: true,
    from: [190, 1], to: [280, 12],
    when: (E, S) => { const Z = S.factions.zhanglu; return Z && Z.alive && !Z.guest && S.provinces.hanzhong.owner === 'zhanglu' && Math.random() < 0.08 ? {} : null; },
    apply: (E, S) => {
      const p = S.provinces.hanzhong; p.order = Math.min(100, p.order + 8); p.pop = Math.floor(p.pop * 1.04); p.food += 5000;
      const great = Object.values(S.factions).filter((f) => f.alive && !f.raider && f.id !== 'zhanglu').sort((a, b) => E.factionProvinces(b.id).length - E.factionProvinces(a.id).length).slice(0, 2);
      for (const f of great) E.shiftRelation('zhanglu', f.id, -5);
      return `The Celestial Masters open charity houses along the roads of Hanzhong where any traveller may eat his fill of rice and meat. Refugees pour in from the wars; the great lords sneer at the "rice thieves".`;
    },
  },
  {
    id: 'yang-songs-price', title: 'Yang Song\u2019s price',
    from: [195, 1], to: [280, 12],
    when: (E, S) => {
      const Z = S.factions.zhanglu; if (!Z || !Z.alive || Z.guest || S.provinces.hanzhong.owner !== 'zhanglu' || flags(S).yangSong) return null;
      const A = Object.entries(Z.attackedBy || {}).filter(([f, t]) => S.turn - t <= 3 && S.factions[f] && S.factions[f].alive && !S.factions[f].raider).map(([f]) => f)[0]; if (!A) return null;
      const gen = E.factionOfficers('zhanglu').filter((o) => o.name !== Z.ruler && o.war >= 85 && !o.captive).sort((a, b) => b.war - a.war)[0]; if (!gen) return null;
      return Math.random() < 0.3 ? { fid: 'zhanglu', a: A, gen: gen.name } : null;
    },
    decision: {
      house: 'zhanglu',
      prompt: (E, S, ctx) => `Yang Song, greediest of Zhang Lu\u2019s ministers, has taken ${E.fname(ctx.a)}\u2019s gold and whispers that ${ctx.gen} means to go over to the enemy. ${ctx.gen} has heard the whispers too. Yang Song will hold his tongue, for a price.`,
      options: [
        { label: 'Pay Yang Song and keep the general', ai: 0.5, apply: (E, S, ctx) => { E.gold('zhanglu', -1200); const g = S.officers[ctx.gen]; g.loyalty = Math.min(100, g.loyalty + 10); flags(S).yangSong = S.turn; return `Zhang Lu pays. Yang Song falls silent, ${ctx.gen} is sent a robe and a horse, and the walls of Hanzhong keep their best defender.`; } },
        { label: 'Refuse the bribe-taker', ai: 0.5, apply: (E, S, ctx) => { E.joinHouse(ctx.gen, ctx.a, 75, null, true); flags(S).yangSong = S.turn; return `Zhang Lu will not be blackmailed. The whispers grow until ${ctx.gen}, fearing the executioner more than the enemy, rides out of Hanzhong and surrenders to ${E.fname(ctx.a)}.`; } },
      ],
    },
  },
  {
    id: 'sealed-granaries', title: 'The sealed granaries',
    from: [210, 1], to: [280, 12],
    when: (E, S) => {
      const Z = S.factions.zhanglu; if (!Z || !Z.alive || Z.guest || S.provinces.hanzhong.owner !== 'zhanglu') return null;
      const mine = E.factionProvinces('zhanglu').length;
      const G = S.adj.hanzhong.map((c) => S.provinces[c].owner).filter((f) => f && f !== 'zhanglu' && S.factions[f].alive && !S.factions[f].raider && E.canAttack(f, 'zhanglu') && E.factionProvinces(f).length >= mine * 2.5)
        .sort((a, b) => E.totalTroops(b) - E.totalTroops(a))[0];
      return G && Math.random() < 0.12 ? { fid: 'zhanglu', g: G } : null;
    },
    decision: {
      house: 'zhanglu',
      prompt: (E, S, ctx) => `${E.fname(ctx.g)}\u2019s army has forced the Yangping pass and stands before Hanzhong. Zhang Lu\u2019s brother would burn the granaries and flee into the Ba hills. Zhang Lu answers: "The granaries belong to the state. Seal them, and let the conqueror find them full."`,
      options: [
        { label: 'Surrender with the granaries sealed', ai: 0.6, apply: (E, S, ctx) => {
          const cities = E.factionProvinces('zhanglu').map((p) => p.id); const offs = E.factionOfficers('zhanglu').map((o) => o.name);
          for (const c of cities) E.transferCity(c, ctx.g);
          for (const n of offs) E.joinHouse(n, ctx.g, n === 'Zhang Lu' ? 90 : 75, null, true);
          const zl = S.officers['Zhang Lu']; if (zl) zl.rank = Math.max(zl.rank || 0, 2);
          if (S.factions.zhanglu.alive) E.dissolveHouse('zhanglu');
          E.prestige(ctx.g, 15); E.gold(ctx.g, 2000);
          return `Zhang Lu comes out of Hanzhong and kneels, the granaries sealed and full behind him. ${E.rulerOf(ctx.g).name}, moved, makes him a marquis and treats his officers with honour. The Celestial Masters\u2019 state passes without a fire lit.`;
        } },
        { label: 'Hold the Yangping pass', ai: 0.4, apply: (E, S, ctx) => { const p = S.provinces.hanzhong; p.defense = Math.min(999, p.defense + 150); p.troops += 5000; E.prestige('zhanglu', 5); E.warTarget(ctx.g, 'zhanglu', 18); return `Zhang Lu\u2019s brother has his way. The pass is manned, the granaries guarded, and Hanzhong waits for the storm.`; } },
      ],
    },
  },
];

// Objectives: hold a set of cities (or a custom test) within a window, for a reward.
const OBJECTIVES = [
  { id: 'lb-xu', house: 'liubei', title: 'Master of Xu Province', desc: 'Hold Xiapi and Xiaopei.', from: 190, to: 205, hold: ['xiapi', 'xiaopei'],
    reward: (E, S) => { E.troops('liubei', 8000); E.prestige('liubei', 10); return '8,000 veterans of Xu rally to Liu Bei, and his name is spoken with respect.'; } },
  { id: 'lb-jing-north', house: 'liubei', title: 'Guardian of the Han River', desc: 'Hold Xinye and Jiangxia.', from: 200, to: 215, hold: ['xinye', 'jiangxia'],
    reward: (E, S) => { E.gold('liubei', 3000); E.prestige('liubei', 10); return 'The scholars of Jing Province flock to Liu Bei, bringing gifts and counsel.'; } },
  { id: 'lb-jing-south', house: 'liubei', title: 'The four commanderies', desc: 'Hold Jiangling, Changsha, Wuling, Guiyang and Lingling.', from: 205, to: 225, hold: ['jiangling', 'changsha', 'wuling', 'guiyang', 'lingling'],
    reward: (E, S) => { E.gold('liubei', 5000); E.food('liubei', 40000); E.prestige('liubei', 15); return 'Southern Jing yields its harvests and its taxes to Liu Bei.'; } },
  { id: 'lb-shu', house: 'liubei', title: 'Lord of Shu', desc: 'Hold Chengdu.', from: 208, to: 235, hold: ['chengdu'],
    reward: (E, S) => { E.prestige('liubei', 25); E.troops('liubei', 10000); return 'The Land of Abundance is his. Liu Bei is proclaimed King of Hanzhong by his officers.'; } },

  { id: 'sun-jiangdong', house: 'sunjian', title: 'Jiangdong united', desc: 'Hold Jianye, Wu and Kuaiji.', from: 190, to: 215, hold: ['jianye', 'wu', 'kuaiji'],
    reward: (E, S) => {
      E.prestige('sunjian', 20); E.gold('sunjian', 4000);
      const city = ['jianye', 'wu'].find((c) => S.provinces[c].owner === 'sunjian') || 'jianye';
      E.addOfficer({ name: 'Lü Meng', ldr: 84, war: 86, int: 72, pol: 60, chr: 66, faction: 'sunjian', city, loyalty: 95, born: 178 });
      return 'All Jiangdong bows to the house of Sun. The young warrior Lü Meng, still half a ruffian, is taken into service.';
    } },
  { id: 'sun-revenge', house: 'sunjian', title: "Avenge the Tiger", desc: 'Take Jiangxia, where Sun Jian fell.', from: 192, to: 220, hold: ['jiangxia'],
    reward: (E, S) => {
      E.prestige('sunjian', 10);
      const gn = S.officers['Gan Ning'];
      if (gn && !gn.faction) { E.joinHouse('Gan Ning', 'sunjian', 80, 'jiangxia', true); return "Jiangxia falls and Sun Jian's death is avenged. The pirate Gan Ning, impressed, brings his river-fighters over to the Sun."; }
      return "Jiangxia falls and Sun Jian's death is avenged.";
    } },
  { id: 'sun-yangtze', house: 'sunjian', title: 'Lord of the Great River', desc: 'Hold Jianye, Chaisang, Jiangxia and Jiangling.', from: 200, to: 235, hold: ['jianye', 'chaisang', 'jiangxia', 'jiangling'],
    reward: (E, S) => { E.prestige('sunjian', 20); for (const c of ['jianye', 'chaisang', 'jiangxia', 'jiangling']) { const p = S.provinces[c]; if (p.owner === 'sunjian') p.fleet = Math.min(100, (p.fleet || 0) + 30); } return 'From Jiangling to the sea the Yangtze belongs to the Sun, and its fleets are the terror of the river.'; } },

  { id: 'lubu-yan', house: 'lubu', title: 'Master of Yan Province', desc: 'Hold Puyang and Chenliu.', from: 192, to: 199, hold: ['puyang', 'chenliu'],
    reward: (E, S) => { E.troops('lubu', 8000); E.prestige('lubu', 10); return 'The gentry of Yan Province throw in their lot with L\u00fc Bu, and eight thousand levies join his banner.'; } },
  { id: 'lubu-xu', house: 'lubu', title: 'Lord of Xu', desc: 'Hold Xiapi and Xiaopei.', from: 195, to: 205, hold: ['xiapi', 'xiaopei'],
    reward: (E, S) => { E.prestige('lubu', 15); E.gold('lubu', 4000); return 'L\u00fc Bu styles himself Governor of Xu Province and the court, having no choice, confirms it.'; } },
  { id: 'sun-seal', house: 'sunjian', title: 'Keeper of the Seal', desc: 'Still hold the Imperial Seal in 195.', from: 195, to: 197, custom: (E, S) => { const st = S.items['imperial-seal']; return !!(st.owner && S.officers[st.owner] && S.officers[st.owner].faction === 'sunjian'); },
    reward: (E, S) => { E.prestige('sunjian', 10); return 'The Sun have kept the Seal through the coalition years. Men say the Mandate favours Jiangdong.'; } },
  { id: 'cc-emperor', house: 'caocao', title: 'Protector of the Han', desc: 'Have the Emperor at your court.', from: 190, to: 220, custom: (E, S) => !!S.factions.caocao.hasEmperor,
    reward: (E, S) => { E.gold('caocao', 3000); return 'Cao Cao is named Excellency of Works. Talented men across the land seek his favour.'; } },
  { id: 'cc-north', house: 'caocao', title: 'Master of the North', desc: 'Hold Ye, Puyang, Chenliu and Xuchang.', from: 195, to: 215, hold: ['ye', 'puyang', 'chenliu', 'xuchang'],
    reward: (E, S) => { E.prestige('caocao', 20); E.troops('caocao', 12000); return 'The Central Plain is Cao Cao’s. Surrendered levies swell his ranks.'; } },

  { id: 'ys-hebei', house: 'yuanshao', title: 'Lord of Hebei', desc: 'Hold Ye, Nanpi, Zhongshan and Beiping.', from: 190, to: 205, hold: ['ye', 'nanpi', 'zhongshan', 'beiping'],
    reward: (E, S) => { E.prestige('yuanshao', 20); E.gold('yuanshao', 6000); return 'The four provinces of the north acknowledge Yuan Shao. Tribute flows to Ye.'; } },
  { id: 'dz-court', house: 'dongzhuo', title: 'Keeper of the capital', desc: 'Still hold Luoyang and Chang’an together in 192, when the coalition should have taken them.', from: 192, to: 194, hold: ['luoyang', 'changan'],
    reward: (E, S) => { E.gold('dongzhuo', 5000); return 'The treasuries of two capitals are Dong Zhuo’s to plunder.'; } },
  { id: 'mt-guanzhong', house: 'mateng', title: 'Master of Guanzhong', desc: 'Hold Chang’an.', from: 190, to: 215, hold: ['changan'],
    reward: (E, S) => { E.prestige('mateng', 15); E.troops('mateng', 8000); return 'The Qiang and the men of Liang follow Ma Teng into the old capital.'; } },
];

// Destiny: the AI of these houses prefers these targets in these years.
const DESTINY = {
  liubei: [
    { from: 190, to: 196, targets: ['xiapi', 'xiaopei', 'beihai', 'langya'] },
    { from: 197, to: 207, targets: ['xinye', 'jiangxia', 'runan', 'xiangyang'] },
    { from: 208, to: 214, targets: ['jiangling', 'changsha', 'wuling', 'guiyang', 'lingling', 'jiangxia'] },
    { from: 211, to: 230, targets: ['yongan', 'jiangzhou', 'zitong', 'chengdu', 'hanzhong'] },
  ],
  sunjian: [
    { from: 190, to: 194, targets: ['jiangxia', 'lujiang', 'chaisang'] },
    { from: 194, to: 201, targets: ['jianye', 'wu', 'kuaiji', 'chaisang', 'lujiang'] },
    { from: 202, to: 208, targets: ['jiangxia', 'yuzhang', 'chaisang', 'lujiang', 'shouchun'] },
    { from: 209, to: 235, targets: ['jiangling', 'changsha', 'guiyang', 'wuling', 'lingling', 'shouchun'] },
  ],
  lubu: [
    { from: 192, to: 195, targets: ['puyang', 'chenliu', 'hongnong', 'luoyang', 'xuchang'] },
    { from: 196, to: 199, targets: ['xiapi', 'xiaopei', 'langya', 'puyang'] },
  ],
  caocao: [
    { from: 190, to: 196, targets: ['puyang', 'xuchang', 'xiaopei', 'luoyang'] },
    { from: 197, to: 207, targets: ['xiapi', 'runan', 'ye', 'nanpi', 'zhongshan', 'beiping'] },
    { from: 208, to: 230, targets: ['xiangyang', 'xinye', 'wan', 'hanzhong', 'changan'] },
  ],
};
