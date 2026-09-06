# Romance of the Three Kingdoms

A browser-based, turn-based strategy game set in 190 AD, the year the coalition
rose against Dong Zhuo. Pick one of 23 warlords and unite the 58 cities of China (two more houses, the Wuhuan and Xianbei nomads, are AI-only).

## The map

The map is drawn on real geography. Coastlines, rivers and lakes come from
[Natural Earth](https://www.naturalearthdata.com/) (public domain): the 50m
coastline and the 10m rivers and lakes, clipped to a window on China from
100.5E to 125.5E and 42.4N to 21.1N, projected onto a 1400 by 1180 canvas
(equirectangular, compressed 15% north-south) and simplified. That gives the
Bohai, the Shandong and Liaodong peninsulas, Hainan and Taiwan, the Yellow
River's Ordos loop, the Wei, Fen, Han, Huai, Yangtze, Jialing, Min, Xiang, Gan,
Xi and Liao rivers and some sixty smaller ones, and Dongting, Poyang, Tai,
Hongze and Chao lakes in their true shapes.

The terrain itself is real too. `img/relief.png` is a hillshaded relief built
from elevation data (the Mapzen Terrarium tiles on AWS Open Data, which derive
from SRTM, GMTED and ETOPO1) by `tools/buildrelief.js`: the tiles are
reprojected into the game's projection, lit from the north-west with vertical
exaggeration so that hills read at this scale, and tinted by height in the
game's palette from green-olive lowland through olive-brown hills to the pale
grey of the Tibetan plateau. The Sichuan basin, the Loess plateau, the Qinling,
Taihang, Nanling and Wuyi ranges and the Yunnan highlands all appear where they
really are. The Gobi steppe pattern, the Great Wall and the sea and range labels
are placed by longitude and latitude in `js/terrain.js`.

Every city carries the real longitude and latitude of its historical seat
(Chang'an at Xi'an, Ye near Handan, Jianye at Nanjing, Jiaozhi at Hanoi, and so
on) and is projected with the same constants, with a nudge of a few pixels where
neighbours such as Wan, Xinye and Xiangyang would otherwise overlap. Roads bow
gently between their cities. Drag to pan, use the mouse wheel or pinch to zoom,
and use the buttons in the corner to zoom or refit. The terrain is drawn once;
only cities and roads redraw each turn.

To rebuild the geography (for example after changing the projection in
`MAP`), run `node tools/buildmap.js`, which downloads the three Natural Earth
GeoJSON files into `tools/naturalearth/` on first use and writes `js/geo.js`,
and `node tools/buildrelief.js`, which fetches a hundred elevation tiles into
`tools/relief-tiles/` and writes `img/relief.png`. Neither needs any package.

Fifty-eight cities span from Xiangping in Liaodong to Jiaozhi on the Gulf of
Tonkin, with passes such as Hongnong, Wudu, Shangyong, Zitong and Yong'an
guarding the routes between regions, and Jiangling, Chaisang and Jianye
anchoring the Yangtze. The latest twelve fill the gaps the real map exposed:
Pengcheng, the true capital of Xu; Lingling, fourth of the southern Jing
commanderies; Hedong on the Fen and Shangdang on the Taihang, tying the
north-west to the north; Danyang and Guangling either side of the lower
Yangtze; Longxi and Wudu on the Shu-Wei frontier; Zangke, which links Nanzhong
to the south; Hepu on the pearl coast between Nanhai and Jiaozhi; Jian'an behind the Wuyi
mountains on the Fujian coast; and Donglai at the tip of Shandong.

The 109 roads were laid out on the real geography: rivers are crossed where
the fords and ferries were (Puban, Mengjin, the Three Gorges, the Qiantang),
passes sit where the mountains force them (Tong, Hukou, Jingxing, Yanmen,
Juyong, Wusheng, Meiling, the Lingqu canal), and long diagonal roads of the
old drawn map that ran through mountains, such as Chang'an to Jinyang or
Yuzhang to Kuaiji, are gone in favour of the valleys and corridors that were
actually used.
The ◧ button in the map corner toggles territory shading in each house's
colour (off by default; the choice is remembered). Hovering a city shows its
garrison, officers, traits, and the road from your selected city.

### Roads and terrain

Every road has a type, drawn differently on the map and marked with a glyph:

- **Plain** roads have no effect.
- **Mountain passes** (▲) give defenders +30%. Passes in the north are closed
  by snow from the twelfth month to the second.
- **River crossings** and **sea lanes** (≋) are decided by fleets. River and
  coastal cities can **Build Ships** (fleet 0 to 100). Attacking across water
  with a weak fleet cuts your strength and drowns part of the army; a strong
  defending fleet makes the shore harder still.

### Regional traits

- **Granary** (Shu, Jiangling, Changsha, Jiangnan): +25% food.
- **Horse country** (the north-west and Youzhou): +25% recruits, better trained.
- **Salt and trade** (the coast): +20% gold.
- **River port** and **Sea coast**: may build ships.

### Seasons

Spring speeds population growth and reopens the passes. Summer brings the
monsoon, which weakens attacks in the south, and floods on the lower Yellow
River. Autumn brings the harvest. Winter closes the northern passes and raises
food upkeep by a tenth.

No build step and no dependencies: plain HTML, CSS and JavaScript.

## Running

Open `index.html` directly, or serve the folder so the browser can load the
scripts normally:

```bash
python -m http.server 8931
```

Then visit <http://localhost:8931/>. The game saves to the browser's
`localStorage` via the Save button or the Menu.

## How to play

- Each **month**, every officer in a city can perform one command.
- **Farm / Trade** raise agriculture and commerce (gold from commerce each month,
  food from agriculture, with a big harvest in month 9).
- **Conscript** raises troops from the population. **Train** raises the
  garrison's training. **Fortify** raises the walls.
- **Search** collects gold. **Buy Food** trades gold for grain without using an
  officer. **Reward** raises an officer's loyalty; officers under 35 loyalty may
  defect.
- **Recruit** unaffiliated talents found in your cities. Success depends on the
  envoy's charisma and your ruler's.
- **Transfer** troops, gold, food and officers between adjacent cities.
- **Attack** an adjacent city with up to three commanders. Battles use troop
  numbers, the commanders' WAR and LDR, training and walls. High INT unlocks
  stratagems, and champions may duel before the walls. Captured officers can be
  recruited, released or executed.
- Soldiers eat food and cost gold every month. Starving soldiers desert.

Win by owning every city. Lose when your last city falls.

## The houses of 190

Besides the sixteen famous warlords and Gongsun Du of Liaodong, six minor
houses hold cities that would otherwise be unclaimed: Liu Dai, Inspector of Yan
Province, at Puyang; Zhang Yang, master of Bing Province, at Jinyang and
Shangdang; Zhang Yan and his Black Mountain bandits at Zhongshan; the old
loyalist Lu Kang at Lujiang; Zhang Chao, Administrator of Guangling and a lord
of the coalition, with his devoted lieutenant Zang Hong; and Meng Huo, king of
the Nanman tribes, at Jianning with Zhu Rong and Meng You, a standing threat to
Shu. Tao Qian holds Langya and Pengcheng, Liu Zhang holds Yong'an, Dong Zhuo
holds Hedong, Ma Teng holds Longxi, Shi Xie holds Hepu and Sun Jian holds
Lingling as well as Changsha, as their authority did in fact. Twelve cities
start unclaimed.

Beyond the Great Wall, **Tadun's Wuhuan** hold Liucheng in Liaoxi. They are a
raider house: they never occupy a city they defeat, but sack it for gold and
food, kill part of the garrison, and ride home, leaving the northern border a
tempting target for the next lord. They cannot be played, only fought, and they
are not slain for good until someone takes Liucheng itself. Further west,
**Kebineng's Xianbei** hold Danhan on the steppe above Jinyang and raid Bing and
You provinces the same way, and the two nomad houses have no love for each
other.

The **Officers** screen lists every officer of your house (or, in observer mode,
of the realm). Type to filter by name, city or house, pick a house from the
dropdown, and click any column heading to sort; click again to reverse.

## History, destiny and prestige

The **Objectives** screen shows your house's historical goals, each with a
window of years and a reward: holding Xu Province as Liu Bei, uniting Jiangdong
as the Sun, sheltering the Emperor as Cao Cao, and so on. Rewards are troops,
gold, food, officers (Lü Meng, Gan Ning) and **Prestige**, a 0 to 100 measure
that raises recruitment odds, steadies loyalty and warms other lords to your
envoys. The screen also lists the historical events that have fired.

Events fire on their dates when the map allows. Some are **decisions**: the
player's house is asked, the AI chooses by weighted odds.

- **The coalition** (190): the eastern lords swear their oath at Suanzao under
  Yuan Shao. Yuan Shu, Cao Cao, Sun Jian, Liu Dai, Zhang Yang, Zhang Chao,
  Kong Rong, Tao Qian and Liu Bei warm to one another, turn against Dong Zhuo,
  and those on his borders take him as their war aim for a year.
- **Liu Bei**: Tao Qian bequeaths Xu Province; Liu Biao grants Xinye; three
  visits win Zhuge Liang; Liu Zhang invites him into Shu (decision).
- **The Sun**: Sun Quan comes of age; the Jiangdong expedition (decision) trades
  the Imperial Seal to Yuan Shu for troops and sails east to found a realm on
  the lower Yangtze.
- **Cao Cao**: Dian Wei, Guo Jia and Xu Chu take service if still free; his
  father is murdered in Xu, turning him against Tao Qian; Zhang Xiu offers to
  surrender Wan (decision); he inherits Yan Province after Liu Dai's death;
  Xu You's defection burns the granaries at Wuchao and brings Zhang He and Gao
  Lan over; the court offers him the title Duke of Wei (decision).
- **Yuan Shao**: Yuan Tan takes up his post; Jieqiao breaks Gongsun Zan's
  cavalry; Tian Feng counsels against war with Cao Cao (decision); Yuan Shang
  comes of age; after Yuan Shao's death, a passed-over Yuan Tan splits Hebei by
  founding his own house.
- **Dong Zhuo**: he begins holding the Emperor; Li Ru urges him to burn Luoyang
  and rule from Chang'an (decision); Wang Yun's plot (decision) can end with
  Lü Bu's halberd and with Lü Bu founding a wandering house of his own with
  Zhang Liao and Chen Gong; the Emperor escapes the leaderless court; Li Jue
  and Guo Si tear the remnant apart.
- **Everyone**: the Emperor finds a protector in 196 if he is loose (a lasting
  bonus to gold, recruitment and diplomacy), and he passes to whoever captures
  the court that holds him.
- **Lü Bu** (once his house exists): his Bing Province captains and Diaochan
  join him; Chen Gong offers to open Puyang behind Cao Cao's back (decision);
  he can take Xiapi from a trusting Liu Bei (decision); the shot at the halberd
  can halt Yuan Shu's war on Liu Bei (decision); and when Cao Cao besieges his
  seat with overwhelming force, his captains bind him in his sleep and open the
  gates: the White Gate Tower. Zhang Liao is spared and joins Cao Cao, Chen Gong
  walks to the block, and Lü Bu is strangled or, with scripted deaths off,
  delivered to Cao Cao in chains.
- **Treasures**: Sun Jian finds the Imperial Seal in a well in the ruins of
  Luoyang in 191, and hands it to Yuan Shu if the Sun sail for Jiangdong.

### The later age

The first twenty years are thick with scripted history; from about 215 the
events are written against roles rather than names, so they fire in whatever
world the game has produced.

- **The Han abdicates.** The house that holds the Emperor with a King's title
  and sixteen cities is offered the throne (Cao Cao himself refuses while he
  lives). Accepting founds a dynasty: the house takes a dynastic name (Wei,
  Han, Wu, Zhong, Liang, Yan and so on) that survives its successions, gains
  prestige, and loses the goodwill of every other lord and a Han loyalist or
  two. Every rival house of King's rank may then **proclaim its own emperor**.
- **The white-robed crossing.** If the Liu and Sun houses are allied and Liu
  Bei's house holds Jiangling with Guan Yu in Jing, the Sun house is offered
  Lü Meng's stratagem: break the alliance, take Jiangling by stealth, and Guan
  Yu dies on the road to Linju. Zhang Fei may then be murdered by his own men,
  and Liu Bei chooses between **Yiling**, marching east with the whole strength
  of Shu at the risk of Lu Xun's fire, and swallowing his grief.
- **The northern expeditions.** A kingdom holding Hanzhong and Chengdu against
  a northern power more than half again its size, with a strategist of INT 90
  or better, is asked leave to march. The expedition brings Jieting (a rash
  commander loses the water and his head), wooden oxen that fill the granaries,
  and, when the strategist dies, the star falling at Wuzhang and the end of the
  age of expeditions.
- **The regent.** A weak or child ruler with a dominant minister invites the
  Gaoping Tombs: strip the regent of office and he may raise his own banner, or
  trust him and risk the seat passing to his family without a battle.
- **Seven times captured.** When Meng Huo's house falls and he is in the
  conqueror's hands, the conqueror may pardon him and restore him as a
  tributary king of the Nanman, bound by a fifty-year alliance.
- **The quieter houses.** When Liu Biao dies the **Cai faction** try to
  enthrone the boy Liu Cong; the rightful heir may withdraw to Jiangxia as a
  lord of his own. A giant on Jing's border brings the **surrender of Jing**
  decision. Yuan Shu's empire ends in **honey and famine**, his generals
  taking to the hills, and his **remnant** carries the family gold to the
  Yangtze power. Liu Zhang faces **Zhao Wei's revolt** of the Dongzhou troops
  and, with an army at his gates, the choice to **open Chengdu** or watch Fa
  Zheng and Meng Da defect. Shi Xie buys peace with **tribute of the south**;
  his heir may raise **Shi Hui's revolt** against the overlord. And any house
  whose seat passes to a **young lord** finds its neighbours bolder and its
  officers restless for a year.
- **The west and the north.** Ma Teng's sworn brother Han Sui feuds with him
  (**the brothers of Liang**) and may found his own house; the Emperor's holder
  **summons Ma Teng to court**, and if the Ma house then takes up arms against
  that host, the **hostages at court** are executed. Ma Chao raises the Qiang
  at **Tong Pass**, and when his house falls he **seeks a master** at Hanzhong
  or Chengdu, then **rides west** to the Shu kingdom. Gongsun Zan chooses
  whether to murder **Liu Yu**, earns prestige with his **White Riders**
  against the nomads, may let **Zhao Yun take leave** for Liu Bei, and at the
  end withdraws into **the tower of Yijing**, where despair eats his officers'
  loyalty. Zhang Lu's **charity houses** draw refugees and scorn, **Yang Song's
  price** costs him gold or his best general, and **the sealed granaries** let
  him surrender Hanzhong with honour to a giant at the pass.
- **Kong Rong, Tao Qian and Liu Yao.** Kong Rong may send Taishi Ci through
  the **siege of Beihai** to fetch Liu Bei, and later **go to court** and hand
  Beihai to a neighbour. Tao Qian judges **Que Xuan's false emperor** and hires
  or refuses **the Taishan bandits**. Taishi Ci takes **his road** to his
  kinsman Liu Yao and fights **the duel at Shenting** against the Sun lord,
  after which he serves the winner.
- **Liu Bei goes west.** With the enemy two to one on every road, Liu Bei can
  choose **flight to Jing**: abandon the east with a third of his army and
  become his kinsman's guest before the walls fall. Later, allied to or hosted
  by the Sun house, he may be **lent Jiangling**, his base for the march into
  Shu. Two rules help him survive: a beloved lord's people follow him when a
  city falls, and any lord who loses his last city seizes a masterless city
  next door with the remnant of his army rather than vanishing. Wanderers also
  prefer hosts who hold their destiny cities and kinsmen of their own surname.
- **The world at large.** A frontier general of low loyalty declares for
  himself and founds a house. A succession with a rival heir away from the seat
  may split a large realm in two. A great plague empties cities and kills
  officers every generation or so. The Qiang, Di, Shanyue, Yi and Li rise in
  thinly held frontier cities and throw out their governors.

## New blood

Officers die, so the realm is replenished in two ways. Some 140 historical
figures of the second and third generations arrive on their debut years, from
Yu Jin and Zhou Tai in the early 190s through Lu Xun, Sima Yi, Pang Tong, Cao Pi
and Jiang Wei to Deng Ai, Zhong Hui and Zhuge Zhan in the 240s. Each appears in
a historically apt city; if the house they served still lives and holds a city
they join it at once, otherwise they wait there as free talents for whoever
holds the town. Several carry scripted deaths of their own. In addition,
whenever fewer than about 120 officers are alive, local worthies come forward
in the cities of living houses: fighters, scholars and capable men of good
family with generated names and middling stats, free to be recruited.

Talent favours the under-staffed. A house with fewer officers than cities
draws extra worthies, and they appear in the cities of the houses that need
them most, so an unlikely house that suddenly rises to ten cities is not
stranded with a staff of four. The well is not bottomless: at most seventy
generated worthies appear in a game, the later ones are lesser men, and none
come forward after 245. Past that the realm lives on the officers it has.

## Treasures

Sixteen named treasures give their holder stat bonuses and are shown as badges
beside officers' names (hover for the effect). Weapons raise WAR (Lü Bu's Sky
Piercer, Guan Yu's Green Dragon Blade, Zhang Fei's Serpent Spear, Cao Cao's
Sword of Trust, Sun Jian's Ancient Ingot Blade); horses raise LDR, help in
duels, and let their rider escape when a city falls (Red Hare, Shadow Runner,
Hex Mark, Zhao Yun's White Dragon); books raise INT, POL or CHR (The Art of War,
the Taiping Manual, the Spring and Autumn Annals); the Imperial Seal grants its
holder's house 10 prestige while kept.

Twenty-nine treasures in all: weapons, horses, books, seals and armour (whose
wearer cannot be slain in a duel). Ten start in famous hands; the rest lie
hidden in cities and are turned up by the **Search** command, with better odds
for high INT. **Bestow** hands a treasure to another officer in the same city
and raises his loyalty by 10. Treasures stay with an officer who is captured or
defects, fall to the captor's lord if he is executed, pass to the victor when
their holder falls in a duel, and are lost in the city where he dies of other
causes until someone finds them again. The Objectives screen lists every
treasure and who holds it.

Treasures are also currency. In **Diplomacy**, a gift may be a treasure rather
than gold, worth far more goodwill (the Imperial Seal most of all), and an
envoy proposing a ceasefire or alliance may carry a treasure as a
**sweetener**: it raises the odds, and passes to the other lord if he accepts.
AI houses in dire straits will do the same. Treasures also drive history: the
Seal lets Yuan Shu proclaim himself Emperor in 197 (decision), the Emperor's
protector receives the Edict of Protection, Cao Cao gives Guan Yu the Red Hare
if the two are ever in one house, and Zhao Yun wins the Sword of Heaven at
Changban.

Liu Bei, the Sun and (after Wang Yun's plot) Lü Bu are **wandering houses**.
When such a house loses its last city, its lord and most of his companions
escape into exile as guests of the friendliest neighbouring lord instead of
being destroyed, taking a fifth of the garrison and treasury with them as a
private household.

Exile is its own phase of play, shown in a dedicated panel. **Favour** with the
host (0 to 100) is its currency: it rises when you help and falls when you are
a burden or a threat, and at zero the host sends you away. Each officer may act
once a month:

- **Serve the host**: improve his city for favour and a stipend.
- **Petition for a fief**: ask for a border town; odds from favour, the envoy's
  CHR and POL, prestige and the host's size. Success ends the exile.
- **Recruit** unaffiliated officers at court. **Raise volunteers** for the
  household army with household gold. **Fight for the host** against his
  enemies for favour and prestige.
- **Seek a new patron**: move the whole household to another lord's court.
- **Seize a city**: march the household army on a neighbouring city. Win, and
  the house has a home again.

Household troops eat from the host's granary and a big camp wears out its
welcome; a famous guest makes his host suspicious; rival ministers slander you;
distant lords send invitations; restless sworn brothers swell the ranks. Events
can still restore the house, and a favoured guest may simply be granted a town.
After twelve years without a home the followers drift away. AI houses in exile
serve, petition, raise men and seize towns by the same rules.

AI houses with a recorded **destiny** prefer historically apt targets in each
era, so an AI Liu Bei drifts toward Xu, then Jing, then Shu, and the Sun push
into Jiangdong and up the Yangtze. Event, objective and destiny tables live in
`js/events.js`.

## How the AI plays

Each AI house plans a **theatre** every month: it picks a main enemy (weighing
weakness, destiny, grudges, the coalition against a runaway leader, and
opportunism against a house that just lost a battle, a city, a harvest or its
lord), chooses a **hammer** city facing the weakest enemy town, and gathers
spare troops and its best commanders there over a few months, routing
reinforcements one hop at a time through its own lands, before striking when
the odds clear its threshold. A repelled attack makes it more cautious for a
while; an easy victory makes it press on. Elsewhere it strikes only when the
odds are very favourable, reinforces towns a neighbour is massing against,
and evacuates hopeless border towns toward the interior.

Officers are placed by role: high-WAR generals drift to the front, wavering
officers are moved away from enemy borders, and the highest-POL officer in each
city is its **governor**, adding up to a tenth to income and, with LDR 60 or
more, a little to the defence. The economy follows a build order (food first,
then commerce, then walls and fleets) and rich houses spend their hoards on
grain, walls, ships, troops and gifts instead of sitting on them.

The AI also keeps its realm **compact**. Every candidate target is scored for
cohesion: cities that touch several of its own towns are preferred, targets
that reunite two separated blocks of its land get a large bonus, targets that
turn frontier towns into interior ones are preferred over those that lengthen
the line, and a lonely salient into enemy country (one friendly neighbour,
three hostile ones) is avoided unless destiny or a declared war demands it. A
house whose land has been cut in two plans its war back toward the seat.
Opportunistic strikes must clear a higher bar when they would lengthen the
frontier. In defence, a **linchpin** (a city whose loss would split the realm)
is reinforced first and held to the last rather than evacuated.

Every house has a **persona** shown in the Realm and Diplomacy screens:
*schemer* (recruits prisoners), *honourable* (releases prisoners, keeps its
word), *treacherous* (executes prisoners, breaks treaties on the weak),
*cautious* (defends, accepts peace), *reckless* (attacks early) and *builder*
(develops and fortifies). When one house holds a third of the map, its
neighbours ally against it and call joint wars, and nobody accepts its envoys.

AI houses also **sell ceasefires**: a house fighting one war will offer peace on
another border to free its hands. The other side is not naive. A proposal is
refused more often when the proposer is stronger and busy with another war,
when it is massing troops on the border while talking peace, when it has a
record of breaking treaties or striking as soon as a ceasefire it proposed
lapsed (that record is shown as *untrustworthy* and fades over years), and
always when it is the runaway leader. Only a house on the brink of destruction
accepts peace on any terms.

### The hegemon

The largest power thinks differently. A house with ten or more cities and half
again as many as anyone else (or one holding a third of the map) enters the
**hegemon** phase, shown on the Realm screen. It governs rather than merely
fights: interior garrisons flow to the front, a reserve army waits in a central
city and rides to whichever border is in danger, administrators go inland to
restless towns, generals go out, and the ruler's kin and the ambitious are
ranked and kept close to the seat. It takes titles eagerly, aims for the
Emperor's holder, courts the second power with gifts and treaties so the rest
cannot unite, asks nothing of the others, and accepts peace only from the
desperate or from that second power. It prefers to finish small neighbours and
shorten its line, avoids opening new fronts, and lands a decisive blow on the
second power's capital when it is twice as strong.

When order frays across the realm (many restless towns, or too many recent
conquests) the hegemon **consolidates**: it pacifies, fortifies and digests
instead of attacking anyone but small prey. Consolidation lasts at most two
years, and never applies against the last rival. A hegemon grants no fiefs to
guests in exile, and its neighbours that are cautious or builders bandwagon
with it rather than resist.

### Unifying the realm

A house that holds half the map (or two fifths of it and two and a half times
the second power) stops playing politics: the Realm screen marks it *unifying
the realm*. It signs no treaties and accepts none, renounces every existing
pact with a rival it outweighs by half, and attacks on every front where it has
even odds rather than waiting for overwhelming ones; the main blow commits
nearly the whole hammer garrison. Its interior towns are stripped to a token
garrison, a quiet town may be left to its magistrates while its only officer
marches the levies out, and the central reserve rides to the main offensive
whenever no border is in danger. Smaller rivals are finished first.

Two supporting rules keep the last stands from lasting forever. A stronghold of
a house down to three towns or fewer, with enemies on every road and a larger
host camped outside, is **cut off**: it loses three per cent of its soldiers
and grain a month and its order frays. And populations drained by decades of
war **recover**: growth is faster the emptier a city is, and settlers return to
orderly land that stands below two fifths of its ceiling, so the land can raise
armies again instead of sinking into an exhausted stalemate.

### Finishing the war

Alliances are sworn for five years and lapse unless renewed, so a map cannot
freeze into a web of eternal pacts. AI houses renew alliances that still serve
them (a shared enemy, a stronger neighbour, close relations) and, when they have
had nowhere to march for a year because every neighbour is under treaty, end
the pact with their weakest and coolest ally. Once only one rival remains, no
house courts it: treaties with the last foe are torn up as soon as the odds are
overwhelming, and the hegemon never signs new ones with it. `node tools/endgame.js`
measures how often fifty-year games end in unification and reports any ten-year
stalls.

## Battles, skills and plots

Attacks are fought with a **stance**: standard, assault (strength ×1.15, losses
×1.2), siege (walls count 30% less, ×0.9, a longer fight) or feint (schemes
twice as likely, ×0.92). A commander with INT 75 or more may choose a
**stratagem**: fire (a great blow once, never in winter), flood (a river
crossing with fleet 40 or more) or sowing discord (turning a disloyal defender
before the battle). Each city has a standing **defence posture**: hold the
walls, sally out, or lay ambushes that bite if the defender's best mind
outclasses the attacker's. AI houses choose all of these for themselves.

Officers may carry **skills**, shown as tags: Cavalry, Naval, Siege, Stratagem,
Guardian, Administrator and Orator, each changing battle, development,
recruitment or diplomacy. **Ties** between officers matter: sworn brothers and
close kin (Liu Bei's brothers, the Cao and Xiahou clan, the Sun family, the Ma
family...) never desert each other, hold loyalty 100 under a bonded lord, will
not serve while a brother rules another house, and slip away to rejoin him;
enemies (Ma Chao and Cao Cao, Zhang Fei and Lü Bu) will not serve each other;
rivals in one house grate on each other.

**Plots** from a city against a hostile neighbour, run by a high-INT officer:
spy (garrison, weakest officer, rumours of treasures), stir unrest, sabotage,
incite a disloyal officer to defect, or assassinate (low odds, grave risk).
Schemers and treacherous AI houses plot too.

## Order, trade, ranks and titles

Every city has an **order** value. It falls when a city is taken, sacked,
starved or left without garrison or officers, and in realms of more than a
dozen cities it frays at the edges; it rises with a garrison, a governor, and
the **Pacify** command. Low order cuts income, stops levies, and below 20 risks
revolt. Over-large realms also pay for their size: income and eagerness for war
fall a little for every city past twelve. Trade links to friendly neighbours add
8% income each; a hostile border costs 10%. Seasons matter on the water: summer
floods make river crossings harder without ships, and frozen northern rivers in
winter can be crossed on the ice, where cavalry shine.

Officers may be given **court ranks** (Colonel, General, Marshal) for gold,
raising loyalty with a lasting floor; the ruler's **title** (Lord, Marquis,
Duke, King, Emperor), offered when prestige and cities allow, lends legitimacy to
envoys and recruiters and sets how many generals he may name. The Emperor's
rank is the Han's succession: every lord will resent it.

## Scenarios and difficulty

The title screen offers six starts: 190 (the coalition), 194 (Cao Cao and Lü
Bu), 200 (Guandu), 208 (Red Cliffs), 219 (Hanzhong and Fancheng) and 225 (the
Three Kingdoms), each with its own houses, rosters, titles, treaties and holder
of the Emperor. Later starts thin the great power's garrisons and strengthen
the small kingdoms' walls and fleets, as terrain and rivers did in fact. The
Battle of Red Cliffs is a grand event: a northern power massing on the Yangtze
against the Sun is burned out by fire ships if the Sun fleets are the stronger.
Difficulty (easy, normal, hard) adjusts income and the AI's boldness and
coldness toward the player's envoys.

## Screens and controls

The map is the screen. A single top bar carries your house, the date and
season, the vital figures (cities, troops, gold, food, officers, idle officers
and prestige; for the observer, houses, free cities and treaties) and badges
for anything waiting on you: idle officers (click to cycle their cities),
captives and envoys. Beside them sit End Month, the auto-play controls in
observer mode, the Realm, Officers, Diplomacy and Objectives tabs, and a ≡ menu
holding Statistics, Lore, Help, the legend, Hide interface, Save and the main
menu.

The map fills everything below the bar, cropped to the screen's shape rather
than letterboxed, so a wide screen opens on the heartland and pans north and
south. Zoomed right out, cities show only their names; zoom in and the troop
and officer counts appear. City boxes and road glyphs stop growing once they
reach a comfortable size on screen, so zooming in opens ground between cities
instead of enlarging labels. Clicking a city slides its panel in over the
right-hand side of the map; close it with × or Esc and bring it back with the
tab on the right edge. The legend of houses is an overlay behind the ▤ button
beside the zoom controls. The latest chronicle entry runs in a strip along the
bottom with a count of unread entries; click it to open the full chronicle over
the map. **H** hides the whole interface to watch the map.

**Statistics** charts cities and troops by house over the years and counts
battles, captures and deaths. **Lore** is an encyclopaedia of forty
biographies, city notes and the events of the age; officer names with a dotted
underline open their entry. **Help** lists the keyboard shortcuts: Space or
Enter ends the month, Tab cycles your cities with idle officers, R, F, D, O, S,
L and M open the screens, H hides the interface, + and − zoom, the arrows pan,
Home refits, Esc closes a dialog, the chronicle or the panel. The main menu
offers **Undo this month**, a quick save and three named save slots.

`node tools/test.js` runs the headless test suite: data integrity, battles,
treaties, exile, treasures, ranks, every scenario, thirty-year simulations, and
save, load and undo.

## Diplomacy

The **Diplomacy** button lists every living house with its strength, your
relations (Hostile to Close) and any treaty.

- **Gift** gold to warm relations. No envoy needed.
- **Ceasefire** (12 months) and **Alliance** (five years, renewable in its last
  year with the **Renew** button) are proposed by sending an envoy. The envoy's CHR and POL, your relations, relative strength and any
  shared enemy all affect the odds, which are shown before you choose. The
  embassy costs gold from the envoy's city and uses up the officer's month.
- Allies can be asked for a **Joint war** against a house that borders both of
  you. If they agree, their armies favour that enemy for six months.
- Neither side can attack across a treaty. **Break** it first; doing so wrecks
  relations with that house and costs reputation with every other lord.
- AI houses propose treaties too. Their envoys arrive at the end of the month,
  and you accept or decline on the spot. Attacking a house sours relations,
  and relations drift back toward neutral over time.

## Ageing and death

Every officer has a historical birth year and an age shown in all rosters.

- Officers aged 22 and under gain a point of WAR, LDR and INT each new year.
  From 60, WAR slowly declines; from 70, LDR as well.
- Each month an officer may die of illness or old age. The odds are tiny before
  45 and climb steeply past 65. Champions who lose a duel have a small chance
  of being slain outright, and captured officers can be executed, by you or by
  AI lords.
- When a ruler dies, the house passes to an heir: kin of the ruler's family are
  preferred, then the officer with the best leadership, charisma and judgement.
  The house takes the heir's name, and the other officers' loyalty wobbles.
  If it is your house and several candidates exist, you choose the heir.
- A house whose ruler dies with no officers left dissolves, and its cities fall
  into anarchy as free cities.

### Scripted historical deaths (optional)

A checkbox on the title screen, also toggled from the in-game Menu, turns on
scripted deaths for about eighty famous figures: Hua Xiong in 191, Sun Jian in
191, Dong Zhuo in 192, Lü Bu in 198, Yuan Shao in 202, Cao Cao in 220, Liu Bei
in 223, and so on through 240. Each fires on its historical month if the
officer is still alive, with a period-flavoured cause, and shows in the
chronicle in the historical colour. While the option is on, officers who still
have a date ahead of them are far less likely to die of random illness, so the
history mostly plays out, though war, duels and the executioner can still take
them early. The table lives in `HISTORICAL_DEATHS` in `js/data.js`.

## Observer mode

Choose **Observe the era** on the title screen to watch all twenty-five houses
play against each other. Step with **Next Month** or press **Auto** to run
continuously at the pace you choose (very slow to fast); the chronicle, city
panels, Realm, Officers and Diplomacy screens stay available for inspection.
With **Pause on major events** ticked (the default), Auto stops and shows a
popup whenever history turns: a house founded or destroyed, a lord's death and
succession, an exile beginning or ending, the Emperor changing hands, a
scripted event or famous death, or a completed objective. Untick it to let the
era run uninterrupted.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page shell |
| `css/style.css` | Styling |
| `js/data.js` | Scenario data: map, roads, factions, officers, deaths |
| `js/events.js` | Historical events, decisions, objectives, destiny paths |
| `js/geo.js` | Generated: Natural Earth coastline, rivers and lakes in canvas coordinates |
| `js/terrain.js` | Static map background drawn from `geo.js` plus mountains, steppe, wall and labels |
| `tools/buildmap.js` | Rebuilds `js/geo.js` from Natural Earth data |
| `img/relief.png` | Generated: hillshaded elevation relief of the map window |
| `tools/buildrelief.js` | Rebuilds `img/relief.png` from open elevation tiles |
| `hexmaps.html`, `js/hexmaps.js`, `img/hex/` | Battle-map viewer, generated hex data and per-city relief images |
| `tools/buildhex.js` | Rebuilds the hex battle maps from elevation tiles and Natural Earth water |
| `js/game.js` | Engine: state, commands, battles, economy, AI, save/load |
| `js/ui.js` | Map rendering, panels, dialogs |
| `tools/sim.js` | Headless multi-year simulation for balance testing |
| `tools/battlesim.js` | Attack win-rate versus strength ratio |

## A founder reclaims his house

If the founding lord of a fallen house, Cao Cao say, is taken into another
house and later comes to rule it, whether by succession, by a regent's coup or
by raising a new banner, that house becomes his own again. It takes back his
house's colour, name, persona and identity, so the events written for Cao Cao
fire for it once more and the map flips to blue. The old dead house is gone for
good; treaties, captives, guests and war aims all carry over.

## Exile has limits

An ordinary house may fall into exile twice; the third time it loses its last
city no lord will shelter it and the house is finished, and twelve years in
exile, counted across every host and every stint, also end it. The born
wanderers (Liu Bei, Lü Bu, the Suns) have no fall limit but may spend at most
twenty years in one stint and twenty-five in all. In exile a lord never leads
the household's raids himself, the household seizes only towns that no giant
next door can take straight back, and it prefers the cities of its destiny.
A fief granted by a host is an interior city of the host's realm, chosen to
match the guest's destiny where possible, and the grant binds host and vassal
in a five-year alliance.

## Battle maps

`hexmaps.html` (also under **Battle maps** in the game's ≡ menu, which opens
the selected city) shows a 13 × 12 hex battlefield for every city, the ground
on which tactical battles will be fought. Each hex is about 5 km. The maps are
generated by `tools/buildhex.js` from real data: hillshaded relief at 130 m
detail from zoom-10 elevation tiles in the strategic map's palette, the true
courses of rivers, lakes and coast from Natural Earth 10m data drawn in the
same three-layer style, hexes classified from the fine elevation into plain,
hills and mountain, and forest, marsh and farmland seeded per city. The city
stands at the centre behind a continuous wall with towers and gate-houses
(great cities have an inner wall too), flying the banner of whoever holds it in
your saved game, and roads run from the gates to the map edge in the true
bearing of each neighbouring city, labelled with that city's name and the
colour of its current holder, so an attacker arrives from the side his city
really lies on. The panel proposes the rules each terrain will carry:
movement cost, defence bonus, whether it blocks sight, whether cavalry may
charge. `node tools/buildhex.js` rebuilds `js/hexmaps.js` and the relief
images in `img/hex/`.

The battle rules themselves live in `js/battle.js` and the viewer previews the
first of them, **deployment**. An army splits into units of 5,000, the
remainder filling a smaller unit at the end; if that would put more than twenty
units on the field the unit size rises to 6,000, then 7,000, and so on until
the army fits (so 104,000 men form 17 units of 6,000 and one of 2,000). Officers
ride with the largest friendly units, the best commander (LDR + WAR) with the
largest, and surplus officers double up from the largest down. Defenders hold
the gates first, then the walls, then the city; attackers form up at the exit
of the road they arrive by, at least three hexes from the walls. The panel lets
you pick which neighbour attacks and shows both armies as they would stand.

## Tactical battles

With **Tactical battles on the hex maps** switched on (the ≡ menu; it is on by
default), an attack on a city is fought out on that city's 13 × 12 hex map, one
day per turn. Battles between AI houses are fought at once, thirty days a month;
a battle the player is part of waits for the battle screen, which opens when you
attack, from the ⚔ badge in the top bar, or from the besieged city's panel. You
may fight each day yourself, let your generals fight a day or the rest of the
month, or withdraw. **End Month** will not pass an undecided battle of yours
without asking: fight it, or let the generals finish the month.

**Days.** Armies deploy as described under *Battle maps*. A unit has three
movement points a day (roads cost one, hills, forest and streams two, marsh
three); it may fight once, either against a neighbour or, from walls, gates,
hills or ships, with arrows two hexes away and no reply. Casualties follow
strength (men, the best WAR and LDR among the unit's officers, training, morale)
against the defender's strength and ground; a unit that loses far more than it
inflicts loses morale, and it breaks when its morale or numbers fail. A barred
gate must be rammed three times, or its defenders broken, before attackers can
pass the walls; the city falls when attackers hold its heart with no defenders
left inside the walls (or the garrison reduced to less than a third of the
besiegers), or when every defender is gone. Attackers move first each day.

**Food.** The besiegers bring a tenth of their number in grain and eat every
day; the garrison eats from the granary. Hunger costs men and morale.

**Help.** When a battle begins the AI calls its neighbouring cities and its
allies: attackers' help arrives within one to ten days, a defender's in fifteen
to twenty. The player sends messengers once from the battle screen, choosing
how many men and how much grain each neighbouring city sends and which allies
to ask; allies answer according to relations and favours owed. A battle not
decided by the month's end continues into the next month, and during the normal
turn any neighbouring city of either house (or an ally's) may send men and grain
to it, arriving within ten days; a transfer into a besieged city does the same.
Recruits raised in a besieged city join its walls at the month's turn. A siege
that sees no blood for a fortnight forces the attacker to assault or go home,
and no siege lasts beyond four months.

**Champions.** When a unit with officers attacks a unit with officers, its best
fighter may first call the enemy's champion out to single combat; the AI does
the same to the player, who answers from the battle screen. Either side may
decline at a small cost in morale. The duel follows the same odds as the old
challenges (WAR cubed, treasures counting); the loser's unit and its neighbours
lose heart, the winner's gain it, and the loser is wounded for the rest of the
battle, or taken prisoner, or slain. Each pair may cross arms once a day.

**Letters.** The cleverest officer on the field may write to a wavering enemy
officer (loyalty under 70, not a ruler, not a sworn brother, not an enemy of the
lord who courts him). The chance rises with low loyalty, the envoy's INT, gold
sent with the letters (spent whether or not he comes), a losing fight and low
morale. A commander who turns brings his whole unit over; another officer slips
across alone. Each officer can be approached once a battle; a refusal hardens
him a little. The AI writes letters too when it has gold to spare.

**Officers of a broken unit** mostly escape (about two thirds); some are taken
prisoner and a few fall. Prisoners are judged at the month's end: release,
execute, **ransom** (a price from 300 gold upward by the officer's stats, which
his house pays if it can afford it and thinks him worth it) or recruit, which is
only possible when his loyalty is below 70 or his house is gone. An AI house
holding one of your officers may send an envoy offering him back for gold.

**Ships.** A city with a fleet puts men aboard: most of an army that comes by a
river or sea road, a third of one that comes by land (as far as the fleet can
carry, 250 men per point of fleet), and a quarter of a garrison whose walls stand
by the water. Ships move one point per hex on sea, lake and river, shoot two
hexes away, are hard to attack from the bank, fight with their fleet's skill,
and may land on a free shore hex outside the walls, which ends their day and
makes them foot soldiers. Foot and horse may also ford or swim across a river,
lake or sea hex, but only with a full day's movement in hand, and men in the
water fight at half strength and defend at half. Roads never run over water:
where a road meets a river the army fords it.
Frozen northern rivers carry no ships. Rivers on the hex maps are carved as
unbroken paths, through the walls and the town itself where they flow.

**Favours.** A house that marches to an ally's battle is owed a favour, shown in
the Diplomacy screen. An ally next to your battle who owes you one is far more
likely to answer your messengers; one you owe is less so. When an AI ally next
to one of your cities goes to war, its rider asks you for men before the month
ends (the battle waits for your answer): send help from the city panel or the
rider's prompt, or decline, which costs relations, dearly if you owed them.
Favours are repaid by marching in turn or with a gift worth 400 or more (gold,
or food at a tenth of its weight); the AI repays with gifts when it has gold.

**Watching.** In observer mode, **Replay AI battles** records each siege so the
month's battle reports offer a day-by-day replay on the map.

## Population

Every city's population grows (faster in spring, faster at peace, and faster
the further it stands below its ceiling) toward a limit set by its size: about
260,000 for a town, 520,000 for a city and 900,000 for a great city. Orderly
cities below half their ceiling draw a trickle of settlers back, and the
**Resettle** command (600 gold) brings refugees to empty fields in a single
season. A levy takes men from the fields but some of their households remain,
so conscription costs the land seven people for every ten soldiers rather than
one for one. Sustainable levies are capped at 22% of the population. Population caps sustainable
levies, shrinks when a city is sacked or conscripted, and no longer depends on
a regional trait.

## Balance tools

```bash
node tools/sim.js 20 liubiao 1
```

Simulates 20 years with every faction, including the named "player", run by
the AI, and prints a yearly summary of the realm.

```bash
node tools/battlesim.js 300
```

Prints how often an attack succeeds at a given strength ratio against walls of
the given value. The main tuning knobs live at the top of `js/game.js`.

```bash
node tools/endgame.js 8
```

Runs eight fifty-year observer games and reports when (or whether) each ends in
unification, how many realms are split into separate blocks, and any ten-year
stall together with the treaties holding it in place.

```bash
node tools/test.js
```

Runs the headless test suite.
