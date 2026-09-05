// ============================================================
//  Historical events, decisions, objectives and destiny paths.
//
//  Each event has a date window and a `when` test that returns a context
//  object (or null) when the situation on the map allows it to fire. Plain
//  events then run `apply`; decision events offer options, which the player
//  chooses in a popup and the AI picks by weight. Everything fires once.
//
//  `E` is the helper API exposed by the engine (see game.js: eventApi).
// ============================================================

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
      return { cities: ['xiapi', 'xiaopei', 'langya'].filter((c) => S.provinces[c].owner === 'taoqian') };
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
];

// Objectives: hold a set of cities (or a custom test) within a window, for a reward.
const OBJECTIVES = [
  { id: 'lb-xu', house: 'liubei', title: 'Master of Xu Province', desc: 'Hold Xiapi and Xiaopei.', from: 190, to: 205, hold: ['xiapi', 'xiaopei'],
    reward: (E, S) => { E.troops('liubei', 8000); E.prestige('liubei', 10); return '8,000 veterans of Xu rally to Liu Bei, and his name is spoken with respect.'; } },
  { id: 'lb-jing-north', house: 'liubei', title: 'Guardian of the Han River', desc: 'Hold Xinye and Jiangxia.', from: 200, to: 215, hold: ['xinye', 'jiangxia'],
    reward: (E, S) => { E.gold('liubei', 3000); E.prestige('liubei', 10); return 'The scholars of Jing Province flock to Liu Bei, bringing gifts and counsel.'; } },
  { id: 'lb-jing-south', house: 'liubei', title: 'The four commanderies', desc: 'Hold Jiangling, Changsha, Wuling and Guiyang.', from: 205, to: 225, hold: ['jiangling', 'changsha', 'wuling', 'guiyang'],
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
    { from: 208, to: 214, targets: ['jiangling', 'changsha', 'wuling', 'guiyang', 'jiangxia'] },
    { from: 211, to: 230, targets: ['yongan', 'jiangzhou', 'zitong', 'chengdu', 'hanzhong'] },
  ],
  sunjian: [
    { from: 190, to: 194, targets: ['jiangxia', 'lujiang', 'chaisang'] },
    { from: 194, to: 201, targets: ['jianye', 'wu', 'kuaiji', 'chaisang', 'lujiang'] },
    { from: 202, to: 208, targets: ['jiangxia', 'yuzhang', 'chaisang', 'lujiang', 'shouchun'] },
    { from: 209, to: 235, targets: ['jiangling', 'changsha', 'guiyang', 'wuling', 'shouchun'] },
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
