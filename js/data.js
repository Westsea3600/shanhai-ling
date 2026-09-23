/* ============================================================
   《山海拾灵》数据层：元素 / 状态 / 连携 / 职业 / 灵物 / 技能
   道具 / 装备 / 地图 / 委托 / 成就 / 通用现算函数
   约定：本文件只放数据与纯函数，不引用运行时对象。
   ============================================================ */

/* ---------------- 元素与克制 ---------------- */
var ELEMENTS = {
  fire:  { name: '火', color: '#ff7043' },
  wood:  { name: '木', color: '#7cb342' },
  water: { name: '水', color: '#4fc3f7' },
  earth: { name: '土', color: '#c9b8a2' },
  wind:  { name: '风', color: '#d5f0e0' },
  thunder: { name: '雷', color: '#ffd740' },
  none:  { name: '无', color: '#cfd8dc' }
};
/* 火→木→水→火 ；雷→风→土→雷 */
var ELEM_WHEEL = { fire: 'wood', wood: 'water', water: 'fire', thunder: 'wind', wind: 'earth', earth: 'thunder' };
function elemMul(atk, def) {
  if (!atk || !def || atk === 'none' || def === 'none') return 1;
  if (atk === def) return 0.8;
  if (ELEM_WHEEL[atk] === def) return 1.5;
  if (ELEM_WHEEL[def] === atk) return 0.67;
  return 1;
}

/* ---------------- 异常状态 ---------------- */
var STATUS = {
  burn:  { name: '灼烧', color: '#ff6b35', dur: 8,   desc: '每 0.5 秒受到施放者攻击 12% 的火焰伤害' },
  poison:{ name: '滋毒', color: '#8bd450', dur: 10,  desc: '每 0.5 秒受到伤害，最多叠 5 层，每层 6%' },
  slow:  { name: '缓流', color: '#4fc3f7', dur: 5,   desc: '移动速度 -35%' },
  shock: { name: '麻痹', color: '#ffd740', dur: 8,   desc: '受到的雷系伤害 +25%' },
  stun:  { name: '眩晕', color: '#eceff1', dur: 1.0, desc: '无法行动' },
  root:  { name: '束缚', color: '#a5d6a7', dur: 1.4, desc: '无法移动（仍可攻击）' }
};

/* ---------------- 元素连携：命中带状态的敌人 + 对应元素 → 引爆 ---------------- */
var COMBOS = [
  { id: 'detonate', name: '爆燃', need: 'burn',   by: 'wind',   mult: 1.7, radius: 95,  desc: '灼烧 + 风系命中 → 大范围爆燃并刷新灼烧' },
  { id: 'overload', name: '过载', need: 'burn',   by: 'thunder',mult: 1.9, radius: 70,  stun: 0.9, desc: '灼烧 + 雷系命中 → 爆发伤害并眩晕 0.9 秒' },
  { id: 'poisonburst', name: '毒爆', need: 'poison', by: 'fire',mult: 1.5, radius: 100, spread: 'poison', desc: '滋毒 + 火系命中 → 爆炸并向周围扩散滋毒' },
  { id: 'superconduct', name: '超导', need: 'shock',  by: 'water',mult: 1.6, radius: 60, chain: 3, desc: '麻痹 + 水系命中 → 连锁跳向 3 个敌人' },
  { id: 'tidesink', name: '潮陷', need: 'slow',   by: 'earth', mult: 1.8, radius: 80,  stun: 0.8, desc: '缓流 + 土系命中 → 重击并眩晕 0.8 秒' }
];

/* ---------------- 职业 ---------------- */
var CLASSES = {
  sword: {
    name: '剑客', weapon: 'sword', desc: '近身连斩，硬朗扎实',
    base: { hp: 135, mp: 60, atk: 13, def: 7, spd: 130 },
    grow: { hp: 16, mp: 4, atk: 2.5, def: 1.3, spd: 1.2 },
    skills: [[1, 'slash'], [3, 'airslash'], [7, 'swordspin'], [12, 'swordrain']]
  },
  mage: {
    name: '术士', weapon: 'staff', desc: '元素法术，范围压制',
    base: { hp: 100, mp: 115, atk: 15, def: 4.5, spd: 122 },
    grow: { hp: 11, mp: 9, atk: 2.8, def: 0.9, spd: 1.0 },
    skills: [[1, 'bolt'], [3, 'fireblast'], [7, 'zapchain'], [12, 'starfall']]
  },
  archer: {
    name: '弓手', weapon: 'bow', desc: '游走点杀，身轻如燕',
    base: { hp: 112, mp: 80, atk: 12, def: 5.5, spd: 142 },
    grow: { hp: 13, mp: 6, atk: 2.3, def: 1.1, spd: 1.4 },
    skills: [[1, 'shoot'], [3, 'trishot'], [7, 'windstep'], [12, 'stararrow']]
  }
};

/* ---------------- 技能 ----------------
   kind: melee | shot | aoe | dash | buff | heal | shield | rain | chain | summon
   power: 伤害倍率(%)；status: [id, 概率]；pet: true 表示灵物可用 */
var SKILLS = {
  /* --- 玩家技能 --- */
  slash:     { name: '挥斩', el: 'none', kind: 'melee', power: 100, mp: 0, cd: 0.42, range: 52, arc: 2.0, desc: '朝准星方向挥出扇形斩击' },
  airslash:  { name: '破空斩', el: 'none', kind: 'dash', power: 130, mp: 12, cd: 5, dash: 190, range: 46, arc: 2.2, desc: '向前突进 190 码并挥出重斩' },
  swordspin: { name: '剑气纵横', el: 'none', kind: 'aoe', power: 95, mp: 26, cd: 8, radius: 95, knock: 130, desc: '剑气以自身为中心向外旋斩一圈' },
  swordrain: { name: '万剑诀', el: 'none', kind: 'rain', power: 62, mp: 60, cd: 22, radius: 110, waves: 5, count: 4, duration: 2.4, desc: '唤出剑雨，5 波 × 4 剑覆盖目标区域' },
  bolt:      { name: '灵弹', el: 'none', kind: 'shot', power: 100, mp: 0, cd: 0.55, speed: 430, range: 430, desc: '射出一发灵力弹' },
  fireblast: { name: '炎爆术', el: 'fire', kind: 'aoe', power: 150, mp: 20, cd: 6, radius: 85, status: ['burn', 0.5], remote: true, cast: 420, desc: '在准星处炸开火球，50% 灼烧' },
  zapchain:  { name: '雷链', el: 'thunder', kind: 'chain', power: 115, mp: 24, cd: 7, jumps: 3, status: ['shock', 0.4], desc: '闪电在敌人间连锁跳跃 3 次' },
  starfall:  { name: '星陨术', el: 'fire', kind: 'rain', power: 68, mp: 65, cd: 24, radius: 120, waves: 6, count: 3, duration: 2.8, status: ['burn', 0.25], remote: true, cast: 440, desc: '星陨陨石连轰目标区域 2.8 秒' },
  shoot:     { name: '射击', el: 'none', kind: 'shot', power: 100, mp: 0, cd: 0.5, speed: 520, range: 470, desc: '射出一支羽箭' },
  trishot:   { name: '连珠箭', el: 'none', kind: 'shot', power: 72, mp: 12, cd: 4, count: 3, spread: 0.22, speed: 520, range: 470, desc: '一次射出 3 支箭' },
  windstep:  { name: '疾风步', el: 'wind', kind: 'buff', power: 0, mp: 15, cd: 9, dash: 130, buff: { spd: 0.38, dur: 4 }, desc: '向前疾掠，4 秒内移速 +38%' },
  stararrow: { name: '贯星箭', el: 'wind', kind: 'shot', power: 320, mp: 55, cd: 20, speed: 760, range: 640, pierce: 99, wide: 16, desc: '蓄力射出贯穿一切的星辉长箭' },

  /* --- 灵物技能（pet:true，玩家不可学） --- */
  tackle:    { name: '撞击', el: 'none', kind: 'melee', power: 100, mp: 0, cd: 1.3, range: 42, arc: 1.8, pet: true },
  bite:      { name: '撕咬', el: 'none', kind: 'melee', power: 140, mp: 0, cd: 2.6, range: 46, arc: 1.6, pet: true },
  peck:      { name: '啄击', el: 'none', kind: 'melee', power: 110, mp: 0, cd: 1.6, range: 44, arc: 1.8, pet: true },
  spark:     { name: '火花', el: 'fire', kind: 'shot', power: 95, mp: 3, cd: 1.9, speed: 340, range: 300, status: ['burn', 0.2], pet: true },
  foxfire:   { name: '狐火', el: 'fire', kind: 'shot', power: 108, mp: 5, cd: 2.2, speed: 330, range: 310, status: ['burn', 0.3], pet: true },
  nineflame: { name: '九尾焰', el: 'fire', kind: 'shot', power: 64, mp: 10, cd: 3.2, count: 3, spread: 0.5, speed: 350, range: 320, status: ['burn', 0.35], pet: true },
  vinewhip:  { name: '藤鞭', el: 'wood', kind: 'melee', power: 100, mp: 4, cd: 2.0, range: 52, arc: 2.2, status: ['root', 0.15], pet: true },
  leafstorm: { name: '叶刃', el: 'wood', kind: 'shot', power: 92, mp: 4, cd: 1.8, speed: 360, range: 310, pet: true },
  poisonfang:{ name: '毒牙', el: 'wood', kind: 'melee', power: 120, mp: 5, cd: 2.4, range: 44, arc: 1.6, status: ['poison', 0.4], pet: true },
  toxicfog:  { name: '毒雾', el: 'wood', kind: 'aoe', power: 70, mp: 12, cd: 7, radius: 85, status: ['poison', 0.6], pet: true },
  bubble:    { name: '泡沫', el: 'water', kind: 'shot', power: 85, mp: 3, cd: 1.7, speed: 330, range: 290, status: ['slow', 0.3], pet: true },
  watergun:  { name: '水枪', el: 'water', kind: 'shot', power: 100, mp: 4, cd: 1.9, speed: 350, range: 310, pet: true },
  waterpulse:{ name: '水脉', el: 'water', kind: 'shot', power: 115, mp: 6, cd: 2.6, speed: 340, range: 320, status: ['slow', 0.25], pet: true },
  tide:      { name: '潮涌', el: 'water', kind: 'aoe', power: 105, mp: 14, cd: 8, radius: 90, status: ['slow', 0.5], pet: true },
  rocksmash: { name: '碎岩', el: 'earth', kind: 'melee', power: 130, mp: 5, cd: 2.5, range: 46, arc: 1.8, status: ['stun', 0.2], pet: true },
  rockfall:  { name: '落石', el: 'earth', kind: 'aoe', power: 110, mp: 13, cd: 7.5, radius: 90, status: ['stun', 0.25], pet: true },
  shellshield:{ name: '龟甲护壁', el: 'water', kind: 'shield', power: 0, mp: 10, cd: 12, shieldPct: 0.3, pet: true },
  warcry:    { name: '威嚎', el: 'none', kind: 'buff', power: 0, mp: 8, cd: 14, buff: { atk: 0.2, dur: 6 }, pet: true },
  healight:  { name: '愈光', el: 'wood', kind: 'heal', power: 26, mp: 12, cd: 6, pet: true },
  windblade: { name: '风刃', el: 'wind', kind: 'shot', power: 95, mp: 3, cd: 1.8, speed: 380, range: 320, pet: true },
  windfang:  { name: '风牙', el: 'wind', kind: 'melee', power: 125, mp: 5, cd: 2.4, range: 48, arc: 1.8, status: ['root', 0.12], pet: true },
  thunderjolt:{ name: '电击', el: 'thunder', kind: 'shot', power: 95, mp: 4, cd: 1.9, speed: 430, range: 330, status: ['shock', 0.35], pet: true },
  paralyzeclaw:{ name: '麻痹爪', el: 'thunder', kind: 'melee', power: 115, mp: 6, cd: 2.4, range: 44, arc: 1.6, status: ['shock', 0.6], pet: true },
  thunderhoof:{ name: '雷蹄', el: 'thunder', kind: 'melee', power: 140, mp: 6, cd: 2.8, range: 48, arc: 1.8, pet: true },
  stormcall:{ name: '召雷', el: 'thunder', kind: 'aoe', power: 120, mp: 16, cd: 9, radius: 95, status: ['shock', 0.4], pet: true },

  /* --- 守护者专属技（玩家与灵物永远学不到；datacheck 红线） --- */
  boss_flamefan: { name: '炎羽扇', el: 'fire', kind: 'aoe', power: 150, mp: 0, cd: 4.5, radius: 110, status: ['burn', 0.5], bossOnly: true },
  boss_skyfall:  { name: '天火坠', el: 'fire', kind: 'rain', power: 60, mp: 0, cd: 9, radius: 105, waves: 4, count: 3, duration: 2.0, status: ['burn', 0.3], bossOnly: true },
  boss_clawcombo:{ name: '裂爪连击', el: 'fire', kind: 'melee', power: 165, mp: 0, cd: 3.2, range: 66, arc: 2.4, bossOnly: true },
  boss_firedash: { name: '炎袭突进', el: 'fire', kind: 'dash', power: 140, mp: 0, cd: 6.5, dash: 240, range: 60, arc: 2.0, status: ['burn', 0.4], bossOnly: true },
  boss_emberstorm:{ name: '烬火风暴', el: 'fire', kind: 'aoe', power: 110, mp: 0, cd: 10, radius: 150, status: ['burn', 0.5], bossOnly: true },
  boss_dive:     { name: '俯冲攫击', el: 'wind', kind: 'dash', power: 150, mp: 0, cd: 5.5, dash: 260, range: 60, arc: 2.2, bossOnly: true },
  boss_gale:     { name: '裂风刃', el: 'wind', kind: 'shot', power: 105, mp: 0, cd: 2.6, count: 3, spread: 0.35, speed: 400, range: 420, bossOnly: true },
  boss_tornado:  { name: '魂缚旋风', el: 'wind', kind: 'aoe', power: 115, mp: 0, cd: 9, radius: 140, status: ['root', 0.35], bossOnly: true },
  boss_chaosring: { name: '浑沌环', el: 'none', kind: 'shot', power: 95, mp: 0, cd: 3.2, count: 10, spread: 6.283, speed: 260, range: 520, bossOnly: true },
  boss_spiral:   { name: '魂旋弹幕', el: 'none', kind: 'shot', power: 80, mp: 0, cd: 7.5, count: 5, spread: 0.9, speed: 300, range: 520, spin: true, bossOnly: true },
  boss_darkdash: { name: '浑沌冲撞', el: 'none', kind: 'dash', power: 170, mp: 0, cd: 6, dash: 300, range: 70, arc: 2.4, bossOnly: true },
  boss_summon:   { name: '唤魂', el: 'none', kind: 'summon', power: 0, mp: 0, cd: 18, summonSp: 'hunling', summonN: 2, bossOnly: true }
};

/* ---------------- 灵物种族（山海经） ----------------
   art: 程序化立绘参数（arch 体型原型 + feat 特征件 + 色板） */
var SPECIES = {
  /* —— 青丘泽 —— */
  lili: {
    name: '狸力', el: 'earth', rare: 1, base: { hp: 58, atk: 9, def: 6, spd: 108 }, catch: 0.5, exp: 9,
    desc: '状如豚而有距，见则多土功。性憨，好拱土。',
    art: { arch: 'quad', c1: '#e0bc94', c2: '#9c7a52', c3: '#54371e', feat: ['snout', 'shortTail'] },
    skills: [[1, 'tackle'], [4, 'rocksmash']],
    evo: { to: 'shangao', lv: 14, killsWith: 15 }
  },
  xuangui: {
    name: '旋龟', el: 'water', rare: 1, base: { hp: 74, atk: 7, def: 12, spd: 82 }, catch: 0.42, exp: 10,
    desc: '鸟首虺尾，声如破木。佩之可防聋。',
    art: { arch: 'turtle', c1: '#5d8a58', c2: '#43683f', c3: '#2d462b', feat: ['snakeTail'] },
    skills: [[1, 'bubble'], [5, 'shellshield']],
    evo: { to: 'xuangui2', lv: 14 }
  },
  lusu: {
    name: '鹿蜀', el: 'wood', rare: 2, base: { hp: 62, atk: 8, def: 7, spd: 120 }, catch: 0.45, exp: 11,
    desc: '马身虎纹白首，佩之宜子孙。',
    art: { arch: 'quad', c1: '#f0e4c4', c2: '#b09a6d', c3: '#5c4a28', feat: ['mane', 'stripes', 'longTail'] },
    skills: [[1, 'tackle'], [5, 'healight']],
    evo: { to: 'wenma', lv: 15 }
  },
  /* —— 若木林 —— */
  huoshu: {
    name: '火鼠', el: 'fire', rare: 2, base: { hp: 50, atk: 11, def: 4, spd: 132 }, catch: 0.48, exp: 10,
    desc: '生于火山，其毛织为布，污烧而洁。',
    art: { arch: 'quad', c1: '#f49060', c2: '#c05830', c3: '#6c2810', feat: ['roundEars', 'flameTail'] },
    skills: [[1, 'spark'], [5, 'bite']],
    evo: { to: 'huohuan', lv: 14 }
  },
  changyou: {
    name: '长右', el: 'water', rare: 2, base: { hp: 64, atk: 9, def: 6, spd: 116 }, catch: 0.4, exp: 12,
    desc: '状如禺而四耳，见则郡县大水。',
    art: { arch: 'ape', c1: '#6d8fb0', c2: '#4d6d8c', c3: '#324a61', feat: ['fourEars', 'longTail'] },
    skills: [[1, 'bubble'], [6, 'watergun']]
  },
  boyi: {
    name: '猼訑', el: 'wind', rare: 2, base: { hp: 68, atk: 8, def: 9, spd: 106 }, catch: 0.38, exp: 13,
    desc: '九尾四耳，其目在背，佩之不畏。',
    art: { arch: 'quad', c1: '#d6d0c4', c2: '#b0a89a', c3: '#7a746a', feat: ['curlHorn', 'nineTail'] },
    skills: [[1, 'windblade'], [6, 'warcry']],
    evo: { to: 'fengbo', lv: 16 }
  },
  jiuweihu: {
    name: '九尾狐', el: 'fire', rare: 4, base: { hp: 60, atk: 13, def: 5, spd: 126 }, catch: 0.16, exp: 26,
    desc: '青丘之山有兽，九尾而食人，见则天下太平。',
    art: { arch: 'fox', c1: '#f0a060', c2: '#d87838', c3: '#9c5420', feat: ['nineTail', 'pointEars'] },
    skills: [[1, 'foxfire'], [8, 'nineflame']],
    evo: { to: 'tushanjun', lv: 20 }
  },
  quru: {
    name: '瞿如', el: 'wood', rare: 2, base: { hp: 56, atk: 9, def: 5, spd: 119 }, catch: 0.42, exp: 11,
    desc: '鸟身人面三首，其鸣自呼。',
    art: { arch: 'bird', c1: '#7fae72', c2: '#5c8a52', c3: '#3d5e37', feat: ['crest', 'wings'] },
    skills: [[1, 'peck'], [6, 'leafstorm']]
  },
  /* —— 炎波火泽 —— */
  wenyao: {
    name: '文鳐鱼', el: 'water', rare: 3, base: { hp: 62, atk: 12, def: 5, spd: 138 }, catch: 0.34, exp: 16,
    desc: '鸟翼鱼身，夜飞而游西海，见则丰穰。',
    art: { arch: 'fish', c1: '#6fb8d8', c2: '#4a8cae', c3: '#2f5f78', feat: ['wings', 'finCrest'] },
    skills: [[1, 'watergun'], [7, 'waterpulse']]
  },
  tiangou: {
    name: '天狗', el: 'wind', rare: 3, base: { hp: 76, atk: 12, def: 8, spd: 128 }, catch: 0.3, exp: 20,
    desc: '状如狸而白首，可御凶。',
    art: { arch: 'wolf', c1: '#cfd6dd', c2: '#9daab6', c3: '#66727d', feat: ['pointEars', 'longTail'] },
    skills: [[1, 'bite'], [7, 'windfang']],
    evo: { to: 'yuxiong', lv: 18, killsWith: 20 }
  },
  huan: {
    name: '讙', el: 'thunder', rare: 3, base: { hp: 60, atk: 14, def: 5, spd: 124 }, catch: 0.28, exp: 20,
    desc: '独目三尾，声如百音，可御凶服妖。',
    art: { arch: 'cat', c1: '#c9b8e0', c2: '#a08cc4', c3: '#6d5a8c', feat: ['oneEye', 'threeTail'] },
    skills: [[1, 'thunderjolt'], [8, 'paralyzeclaw']]
  },
  /* —— 幽都山 —— */
  heluo: {
    name: '何罗鱼', el: 'water', rare: 3, base: { hp: 80, atk: 11, def: 9, spd: 98 }, catch: 0.3, exp: 21,
    desc: '一首而十身，食之已痈。',
    art: { arch: 'fish', c1: '#8fb8c8', c2: '#64909f', c3: '#3f6370', feat: ['tenBody', 'finCrest'] },
    skills: [[1, 'bubble'], [8, 'tide']]
  },
  feiyi: {
    name: '肥遗', el: 'wood', rare: 3, base: { hp: 70, atk: 13, def: 6, spd: 110 }, catch: 0.3, exp: 18,
    desc: '一首两身，其状如蛇，见则大旱。',
    art: { arch: 'serpent', c1: '#9fbf6a', c2: '#7a9c4a', c3: '#516a30', feat: ['twoBody'] },
    skills: [[1, 'poisonfang'], [8, 'toxicfog']]
  },
  qitu: {
    name: '鵸鵌', el: 'wind', rare: 4, base: { hp: 66, atk: 13, def: 6, spd: 126 }, catch: 0.26, exp: 22,
    desc: '三首六尾而善笑，服之不寐。',
    art: { arch: 'bird', c1: '#c8a0c8', c2: '#9c749c', c3: '#6a4d6a', feat: ['threeHead', 'wings'] },
    skills: [[1, 'windblade'], [9, 'windfang']]
  },
  hunling: {
    name: '混灵', el: 'none', rare: 3, base: { hp: 66, atk: 12, def: 7, spd: 104 }, catch: 0.3, exp: 18,
    desc: '幽都游魂凝成的小灵，居无定所。',
    art: { arch: 'wisp', c1: '#a8b8d8', c2: '#7888b0', c3: '#4a5878', feat: ['aura'] },
    skills: [[1, 'tackle'], [8, 'bubble']]
  },
  /* —— 雷泽 —— */
  kui: {
    name: '夔', el: 'thunder', rare: 5, base: { hp: 88, atk: 16, def: 10, spd: 114 }, catch: 0.2, exp: 30,
    desc: '状如牛，苍身而无角一足，出入水则必风雨。',
    art: { arch: 'ox', c1: '#8ca8b8', c2: '#68828f', c3: '#435860', feat: ['oneLeg', 'storm'] },
    skills: [[1, 'thunderjolt'], [10, 'stormcall']]
  },

  /* —— 进化形态（野外不直接出现，由低阶进化而来；高图也可刷少量） —— */
  shangao: {
    name: '山膏', el: 'earth', rare: 3, base: { hp: 96, atk: 15, def: 12, spd: 102 }, catch: 0, exp: 24, evolved: true,
    desc: '逐麋之山有兽，善骂，如豚。狸力长成后的样子。',
    art: { arch: 'quad', c1: '#dcb06e', c2: '#8c6a3a', c3: '#4c3818', feat: ['tusk', 'shortTail'] },
    skills: [[1, 'tackle'], [1, 'rocksmash'], [10, 'rockfall']]
  },
  xuangui2: {
    name: '玄龟', el: 'water', rare: 3, base: { hp: 118, atk: 11, def: 19, spd: 80 }, catch: 0, exp: 24, evolved: true,
    desc: '旋龟历劫而成的玄色巨龟，甲如城垣。',
    art: { arch: 'turtle', c1: '#3f5a68', c2: '#2c414c', c3: '#1a2a31', feat: ['snakeTail', 'hornShell'] },
    skills: [[1, 'bubble'], [1, 'shellshield'], [10, 'tide']]
  },
  wenma: {
    name: '文马', el: 'wood', rare: 3, base: { hp: 100, atk: 14, def: 11, spd: 126 }, catch: 0, exp: 25, evolved: true,
    desc: '缟身朱鬣，目若黄金，乘之寿千岁。',
    art: { arch: 'quad', c1: '#e8ddc0', c2: '#c2b48c', c3: '#87795a', feat: ['mane', 'stripes', 'goldHorn'] },
    skills: [[1, 'tackle'], [1, 'healight'], [10, 'leafstorm']]
  },
  huohuan: {
    name: '火浣兽', el: 'fire', rare: 3, base: { hp: 84, atk: 17, def: 8, spd: 134 }, catch: 0, exp: 24, evolved: true,
    desc: '火鼠千年而生火羽，浴火而行，毛色如焰。',
    art: { arch: 'quad', c1: '#f07040', c2: '#c04820', c3: '#802e12', feat: ['flameTail', 'flameMane'] },
    skills: [[1, 'spark'], [1, 'bite'], [10, 'foxfire']]
  },
  fengbo: {
    name: '风猼', el: 'wind', rare: 3, base: { hp: 104, atk: 13, def: 14, spd: 116 }, catch: 0, exp: 25, evolved: true,
    desc: '猼訑长成，九尾展开如帆，行处生风。',
    art: { arch: 'quad', c1: '#e2ddd2', c2: '#bcb5a6', c3: '#827c70', feat: ['curlHorn', 'nineTail', 'wings'] },
    skills: [[1, 'windblade'], [1, 'warcry'], [10, 'windfang']]
  },
  tushanjun: {
    name: '涂山君', el: 'fire', rare: 5, base: { hp: 94, atk: 21, def: 10, spd: 130 }, catch: 0, exp: 40, evolved: true,
    desc: '九尾狐之大成者，通身霜白，尾焰如虹。',
    art: { arch: 'fox', c1: '#f4f0ea', c2: '#d8b890', c3: '#a08860', feat: ['nineTail', 'pointEars', 'goldHorn'] },
    skills: [[1, 'foxfire'], [1, 'nineflame'], [12, 'warcry']]
  },
  yuxiong: {
    name: '御凶', el: 'wind', rare: 4, base: { hp: 112, atk: 18, def: 12, spd: 136 }, catch: 0, exp: 32, evolved: true,
    desc: '天狗长成，白首苍躯，御百凶。',
    art: { arch: 'wolf', c1: '#eceff1', c2: '#b8c4cc', c3: '#7c8a94', feat: ['pointEars', 'longTail', 'goldHorn'] },
    skills: [[1, 'bite'], [1, 'windfang'], [11, 'windblade']]
  },

  /* —— 守护者（不可捕捉，图鉴凭击败收录） —— */
  bifang: {
    name: '毕方', el: 'fire', rare: 5, base: { hp: 130, atk: 17, def: 10, spd: 118 }, catch: 0, exp: 90, boss: true,
    desc: '见则其邑有讹火。独足青羽的炎之守护者。',
    art: { arch: 'bird', c1: '#e05840', c2: '#b03020', c3: '#7c1e12', feat: ['oneLeg', 'crest', 'wings', 'fireAura'] },
    skills: [[1, 'boss_flamefan'], [1, 'boss_skyfall']]
  },
  zheng: {
    name: '狰', el: 'fire', rare: 5, base: { hp: 150, atk: 19, def: 12, spd: 128 }, catch: 0, exp: 140, boss: true,
    desc: '章莪之山有兽，五尾一角，其音如击石。炎波火泽的主人。',
    art: { arch: 'cat', c1: '#d04838', c2: '#a02c20', c3: '#6c1a12', feat: ['fiveTail', 'goldHorn', 'fireAura'] },
    skills: [[1, 'boss_clawcombo'], [1, 'boss_firedash'], [1, 'boss_emberstorm']]
  },
  gudiao: {
    name: '蛊雕', el: 'wind', rare: 5, base: { hp: 165, atk: 21, def: 13, spd: 136 }, catch: 0, exp: 200, boss: true,
    desc: '状如雕而有角，音如婴儿，食人。幽都山的阴影。',
    art: { arch: 'bird', c1: '#4a4a6a', c2: '#33334d', c3: '#20202f', feat: ['goldHorn', 'wings', 'darkAura'] },
    skills: [[1, 'boss_dive'], [1, 'boss_gale'], [1, 'boss_tornado']]
  },
  dijiang: {
    name: '帝江', el: 'none', rare: 5, base: { hp: 210, atk: 23, def: 15, spd: 120 }, catch: 0, exp: 320, boss: true,
    desc: '识歌舞，浑敦无面目。雷泽深处的终焉守护者。',
    art: { arch: 'wisp', c1: '#e8c860', c2: '#c09838', c3: '#8c6c1e', feat: ['chaos', 'fourWing'] },
    skills: [[1, 'boss_chaosring'], [1, 'boss_spiral'], [1, 'boss_darkdash'], [1, 'boss_summon']]
  }
};

/* 进化条件现算文案（不许手写，防漂移） */
function evoText(sp) {
  if (!sp.evo) return '';
  var parts = ['等级 ≥ ' + sp.evo.lv];
  if (sp.evo.killsWith) parts.push('并肩击杀 ≥ ' + sp.evo.killsWith);
  return parts.join('，');
}

/* ---------------- 灵物个体 ---------------- */
/* 性格：捕捉时随机，四维小幅修正 */
var TEMPERS = {
  brave:   { name: '勇敢', stats: { atk: 0.08, def: -0.04 }, desc: '攻击 +8%，防御 -4%' },
  timid:   { name: '胆小', stats: { spd: 0.08, atk: -0.04 }, desc: '速度 +8%，攻击 -4%' },
  calm:    { name: '冷静', stats: { def: 0.06, spd: -0.03 }, desc: '防御 +6%，速度 -3%' },
  lively:  { name: '活泼', stats: { spd: 0.06, hp: -0.02 }, desc: '速度 +6%，生命 -2%' },
  stubborn:{ name: '固执', stats: { atk: 0.05, spd: -0.04 }, desc: '攻击 +5%，速度 -4%' },
  gentle:  { name: '温柔', stats: { hp: 0.07, atk: -0.03 }, desc: '生命 +7%，攻击 -3%' }
};
/* 资质 0~15，影响最终面板 */
function petStat(spRec) {
  var sp = SPECIES[spRec.sp], lv = spRec.lv;
  var ivM = 1 + (spRec.iv || 0) * 0.012;            /* 资质 0~15 → ×1.00~1.18 */
  var tp = TEMPERS[spRec.temper] || { stats: {} };
  var t = function (k) { return 1 + (tp.stats[k] || 0); };
  var g = 1 + (lv - 1) * 0.115;
  return {
    hp: Math.round(sp.base.hp * g * ivM * t('hp')),
    atk: Math.round(sp.base.atk * g * ivM * t('atk') * 10) / 10,
    def: Math.round(sp.base.def * g * ivM * t('def') * 10) / 10,
    spd: Math.round(sp.base.spd * (1 + (lv - 1) * 0.01) * ivM * t('spd'))
  };
}
function petSkills(spRec) {
  return SPECIES[spRec.sp].skills.filter(function (s) { return s[0] <= spRec.lv; }).map(function (s) { return s[1]; });
}
function petExpToLevel(lv) { return Math.floor(8 * Math.pow(lv, 1.7)); }

/* 闪光：约 1/90，属性 ×1.28 */
var SHINY_RATE = 1 / 90, SHINY_MUL = 1.28;

/* ---------------- 道具 ---------------- */
var ITEMS = {
  /* 消耗 */
  huichun:   { name: '回春散', type: 'use', heal: 60,  price: 30,  icon: 'potion', color: '#e05656', desc: '回复 60 点生命' },
  dahun:     { name: '大还丹', type: 'use', heal: 180, price: 110, icon: 'potion', color: '#d0342c', desc: '回复 180 点生命' },
  ningshen:  { name: '凝神露', type: 'use', mana: 50,  price: 32,  icon: 'mpotion', color: '#4f8fd8', desc: '回复 50 点魔力' },
  shenquan:  { name: '神泉水', type: 'use', mana: 130, price: 115, icon: 'mpotion', color: '#2f6fc0', desc: '回复 130 点魔力' },
  /* 捕捉 */
  fusuo:     { name: '缚灵索', type: 'ball', mul: 1.0, price: 60,  icon: 'rope', color: '#c8b490', desc: '投掷捕捉野生灵物（基础）' },
  chijing:   { name: '赤晶索', type: 'ball', mul: 1.75, price: 180, icon: 'rope', color: '#e07040', desc: '捕捉率 ×1.75 的缚灵索' },
  shanhaiyin:{ name: '山海印', type: 'ball', mul: 2.7, price: 520, icon: 'seal', color: '#e8c040', desc: '上古印玺，捕捉率 ×2.7' },
  /* 传送 */
  chuansongfu:{ name: '传送符', type: 'teleport', price: 80, icon: 'scroll', color: '#8fd8a8', desc: '传送至任意已踏足的地图（安全区免费传送）' },
  /* 素材 */
  yaocao:    { name: '药草', type: 'mat', price: 14, icon: 'herb', color: '#7cb342', desc: '青丘泽常见的灵草，可入药' },
  lingsha:   { name: '灵砂', type: 'mat', price: 22, icon: 'sand', color: '#d8c890', desc: '灵气凝成的细砂' },
  xuantie:   { name: '玄铁', type: 'mat', price: 45, icon: 'ingot', color: '#78909c', desc: '强化装备的必需材料' },
  huohuanyu: { name: '火浣羽', type: 'mat', price: 60, icon: 'feather', color: '#f07040', desc: '火泽灵物脱落的耐焰羽' },
  leiguang:  { name: '雷光石', type: 'mat', price: 75, icon: 'gem', color: '#ffd740', desc: '含着雷光的矿石' },
  shougu:    { name: '兽骨', type: 'mat', price: 18, icon: 'bone', color: '#e0dccf', desc: '灵兽的遗骨，铁匠收这个' }
};
var ITEM_TYPE_ORDER = { use: 0, ball: 1, teleport: 2, mat: 3, key: 4 };

/* ---------------- 装备 ----------------
   slot: weapon | armor | head | feet | amulet | charm
   档位：青铜(1) 玄铁(10) 灵玉(20) */
var EQUIP_TIERS = [
  { id: 1, name: '青铜', lv: 1 },
  { id: 2, name: '玄铁', lv: 10 },
  { id: 3, name: '灵玉', lv: 20 }
];
var EQUIPS = {
  /* 剑 */
  jian1: { name: '青铜剑', slot: 'weapon', wt: 'sword', lv: 1, atk: 5, price: 120, look: { shape: 'jian', c: '#b8c4cc' } },
  jian2: { name: '玄铁重剑', slot: 'weapon', wt: 'sword', lv: 10, atk: 14, price: 640, look: { shape: 'jian', c: '#7e96a8' } },
  jian3: { name: '灵玉长锋', slot: 'weapon', wt: 'sword', lv: 20, atk: 26, price: 2100, look: { shape: 'jian', c: '#9fd8e8' } },
  /* 杖 */
  zhang1: { name: '桃木杖', slot: 'weapon', wt: 'staff', lv: 1, atk: 5, mp: 15, price: 120, look: { shape: 'zhang', c: '#c8a878' } },
  zhang2: { name: '玄晶法杖', slot: 'weapon', wt: 'staff', lv: 10, atk: 14, mp: 40, price: 640, look: { shape: 'zhang', c: '#8fa8e0' } },
  zhang3: { name: '灵珠天权', slot: 'weapon', wt: 'staff', lv: 20, atk: 26, mp: 80, price: 2100, look: { shape: 'zhang', c: '#c8a0f0' } },
  /* 弓 */
  gong1: { name: '桑木弓', slot: 'weapon', wt: 'bow', lv: 1, atk: 5, spd: 3, price: 120, look: { shape: 'gong', c: '#b89058' } },
  gong2: { name: '玄铁战弓', slot: 'weapon', wt: 'bow', lv: 10, atk: 14, spd: 6, price: 640, look: { shape: 'gong', c: '#78909c' } },
  gong3: { name: '灵玉鸣弦', slot: 'weapon', wt: 'bow', lv: 20, atk: 26, spd: 10, price: 2100, look: { shape: 'gong', c: '#8fe0d0' } },
  /* 衣甲 */
  yi1: { name: '粗布短褐', slot: 'armor', lv: 1, def: 3, hp: 20, price: 100, look: { c: '#a89878' } },
  yi2: { name: '玄铁轻铠', slot: 'armor', lv: 10, def: 9, hp: 90, price: 560, look: { c: '#708898' } },
  yi3: { name: '灵玉法衣', slot: 'armor', lv: 20, def: 16, hp: 200, mp: 40, price: 1900, look: { c: '#88c8d8' } },
  /* 头冠 */
  mao1: { name: '青布头巾', slot: 'head', lv: 1, def: 2, hp: 12, price: 80, look: { c: '#8a9a70' } },
  mao2: { name: '玄铁盔', slot: 'head', lv: 10, def: 6, hp: 50, price: 440, look: { c: '#68808c' } },
  mao3: { name: '灵玉冠', slot: 'head', lv: 20, def: 11, hp: 110, mp: 25, price: 1500, look: { c: '#90d0c8' } },
  /* 足履 */
  xue1: { name: '草鞋', slot: 'feet', lv: 1, def: 1, spd: 4, price: 70, look: { c: '#c8b070' } },
  xue2: { name: '玄铁靴', slot: 'feet', lv: 10, def: 4, spd: 8, hp: 40, price: 400, look: { c: '#607880' } },
  xue3: { name: '踏云履', slot: 'feet', lv: 20, def: 7, spd: 14, price: 1350, look: { c: '#a8e0d8' } },
  /* 佩饰 */
  pei1: { name: '骨哨', slot: 'amulet', lv: 1, atk: 2, price: 90, look: { c: '#e0dccf' } },
  pei2: { name: '雷纹玉佩', slot: 'amulet', lv: 10, atk: 5, crit: 0.04, price: 480, look: { c: '#d8c860' } },
  pei3: { name: '苍龙玉佩', slot: 'amulet', lv: 20, atk: 10, crit: 0.08, price: 1650, look: { c: '#70a8e0' } },
  /* 护符 */
  fu1: { name: '平安符', slot: 'charm', lv: 1, hp: 15, mp: 10, price: 85, look: { c: '#e8b8b8' } },
  fu2: { name: '镇岳符', slot: 'charm', lv: 10, hp: 70, def: 3, price: 460, look: { c: '#b8c8a8' } },
  fu3: { name: '归墟符', slot: 'charm', lv: 20, hp: 160, mp: 50, def: 5, price: 1580, look: { c: '#a8c0e8' } },
  /* 唯一装备（BOSS 掉落，不进商店与随机池） */
  bifang_ling: { name: '毕方羽翎', slot: 'amulet', lv: 12, atk: 8, crit: 0.06, price: 0, unique: true, look: { c: '#f06030' }, desc: '毕方的翎羽，火光不熄' },
  dijiang_he:  { name: '帝江之核', slot: 'charm', lv: 26, hp: 220, mp: 60, atk: 6, def: 6, price: 0, unique: true, look: { c: '#e8c860' }, desc: '浑沌之心，六识皆空' }
};
var SLOT_ORDER = { weapon: 0, armor: 1, head: 2, feet: 3, amulet: 4, charm: 5 };
var SLOT_NAME = { weapon: '武器', armor: '衣甲', head: '头冠', feet: '足履', amulet: '佩饰', charm: '护符' };
var WT_NAME = { sword: '剑', staff: '杖', bow: '弓' };

/* 强化：+1..+6，每级 +8% 基础数值（生命取 8%），费用递增 */
var PLUS_MUL = [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.48];
function plusCost(def, plus) { return { xuantie: plus + 1, gold: def.price > 0 ? Math.round(def.price * 0.25 * (plus + 1)) : 200 * (plus + 1) }; }
function equipStats(def, plus) {
  var m = 1 + (PLUS_MUL[plus] || 0);
  var st = {};
  ['atk', 'def', 'hp', 'mp', 'spd', 'crit'].forEach(function (k) {
    if (def[k]) st[k] = Math.round(def[k] * (k === 'crit' ? 1 : m) * 10) / 10;
  });
  return st;
}
function equipName(id, plus) { return EQUIPS[id].name + (plus ? ' +' + plus : ''); }

/* ---------------- 地图 ---------------- */
var TILE = 32;
var MAPS = {
  village: {
    name: '落霞村', theme: 'village', w: 46, h: 34, seed: 20260901, lv: [1, 1], safe: true,
    portals: [
      { x: 39, y: 17, to: 'qingqiu', tx: 4, ty: 17, label: '青丘泽' }
    ],
    npcs: [
      { id: 'elder', name: '村长·姜石', x: 20, y: 12, role: 'quest', face: 'elder', lines: '主线委托' },
      { id: 'shopper', name: '杂货商·幺妹', x: 14, y: 19, role: 'shop', face: 'shopper', lines: '买点啥子？' },
      { id: 'smith', name: '铁匠·石敢当', x: 28, y: 19, role: 'smith', face: 'smith', lines: '叮叮当当！' },
      { id: 'healer', name: '灵医·白芷', x: 24, y: 9, role: 'heal', face: 'healer', lines: '创伤要早治。' },
      { id: 'lingyu', name: '御灵师·青鸟', x: 32, y: 12, role: 'lingyu', face: 'lingyu', lines: '灵物之道，在于交心。' }
    ]
  },
  qingqiu: {
    name: '青丘泽', theme: 'grass', w: 62, h: 44, seed: 20260902, lv: [2, 7], maxMob: 12,
    spawn: [['lili', 2, 5, 30], ['xuangui', 2, 6, 22], ['lusu', 3, 7, 20], ['huoshu', 4, 7, 14], ['jiuweihu', 6, 7, 2]],
    portals: [
      { x: 3, y: 17, to: 'village', tx: 37, ty: 17, label: '落霞村' },
      { x: 58, y: 21, to: 'ruomu', tx: 4, ty: 22, label: '若木林', needLv: 6 }
    ],
    npcs: [{ id: 'tongzi', name: '拾穗童子', x: 22, y: 30, role: 'quest', face: 'kid', lines: '我的纸鸢飞走了……' }]
  },
  ruomu: {
    name: '若木林', theme: 'forest', w: 64, h: 46, seed: 20260903, lv: [6, 12], maxMob: 13,
    spawn: [['huoshu', 6, 10, 24], ['changyou', 6, 11, 22], ['quru', 7, 12, 20], ['boyi', 8, 12, 16], ['jiuweihu', 9, 12, 4], ['lili', 6, 9, 14]],
    boss: { sp: 'bifang', lv: 12, hpMul: 11, respawn: 120, drop: [['huohuanyu', 2], ['dahun', 2]] },
    portals: [
      { x: 3, y: 22, to: 'qingqiu', tx: 56, ty: 21, label: '青丘泽' },
      { x: 60, y: 16, to: 'yanbo', tx: 4, ty: 24, label: '炎波火泽', needLv: 11 }
    ],
    npcs: [{ id: 'caiyao', name: '采药人·杜蘅', x: 18, y: 10, role: 'quest', face: 'herbalist', lines: '林子深处的雾有毒。' }]
  },
  yanbo: {
    name: '炎波火泽', theme: 'volcano', w: 64, h: 46, seed: 20260904, lv: [11, 17], maxMob: 13,
    spawn: [['wenyao', 11, 15, 22], ['tiangou', 12, 17, 20], ['huan', 12, 17, 18], ['huohuan', 14, 17, 8], ['shangao', 13, 17, 8]],
    boss: { sp: 'zheng', lv: 17, hpMul: 14, respawn: 170, drop: [['huohuanyu', 3], ['xuantie', 4]] },
    portals: [
      { x: 3, y: 24, to: 'ruomu', tx: 58, ty: 16, label: '若木林' },
      { x: 31, y: 4, to: 'youdu', tx: 31, ty: 41, label: '幽都山', needLv: 15 }
    ],
    npcs: [{ id: 'xingzhe', name: '火泽行者·燧', x: 48, y: 34, role: 'quest', face: 'walker', lines: '别踩亮着的地皮。' }]
  },
  youdu: {
    name: '幽都山', theme: 'cave', w: 60, h: 44, seed: 20260905, lv: [15, 21], maxMob: 13, dark: true,
    spawn: [['heluo', 15, 19, 20], ['feiyi', 15, 20, 20], ['hunling', 16, 21, 18], ['qitu', 17, 21, 10], ['xuangui2', 16, 20, 6]],
    boss: { sp: 'gudiao', lv: 21, hpMul: 16, respawn: 210, drop: [['leiguang', 2], ['shanhaiyin', 1]] },
    portals: [
      { x: 31, y: 41, to: 'yanbo', tx: 31, ty: 6, label: '炎波火泽' },
      { x: 4, y: 8, to: 'leize', tx: 56, ty: 22, label: '雷泽', needLv: 20 }
    ],
    npcs: [{ id: 'shouling', name: '守陵人·烛九', x: 20, y: 20, role: 'quest', face: 'keeper', lines: '幽都的夜很长。' }]
  },
  leize: {
    name: '雷泽', theme: 'marsh', w: 66, h: 46, seed: 20260906, lv: [20, 26], maxMob: 14,
    spawn: [['kui', 20, 26, 18], ['huan', 20, 25, 16], ['tiangou', 20, 25, 14], ['heluo', 20, 24, 12], ['tushanjun', 23, 26, 3], ['yuxiong', 21, 25, 5]],
    boss: { sp: 'dijiang', lv: 26, hpMul: 22, respawn: 260, drop: [['leiguang', 4], ['shanhaiyin', 2]] },
    portals: [
      { x: 57, y: 22, to: 'youdu', tx: 6, ty: 8, label: '幽都山' }
    ],
    npcs: [{ id: 'yufu', name: '雷泽渔父', x: 16, y: 32, role: 'quest', face: 'fisher', lines: '雷声越近，鱼越肥。' }]
  }
};
var LEVEL_CAP = 30;
function expToLevel(lv) { return Math.floor(12 * Math.pow(lv, 1.7)); }

/* ---------------- 委托 ---------------- */
var QUESTS = [
  /* 主线 */
  { id: 'm1', main: true, giver: 'elder', giverMap: 'village', name: '初试身手', lv: 1,
    text: '村外的青丘泽近来灵物躁动。去击败 5 只野生灵物，让它们记起对人的敬畏。',
    goal: { type: 'kill', any: true, n: 5 }, reward: { gold: 120, exp: 60, items: [['huichun', 3]] } },
  { id: 'm2', main: true, giver: 'elder', giverMap: 'village', name: '缚灵之道', lv: 2, prev: 'm1',
    text: '御灵师青鸟说，与其杀戮，不如结契。用缚灵索捕捉 1 只野生灵物，带回来给她看。',
    goal: { type: 'capture', any: true, n: 1 }, reward: { gold: 150, exp: 90, items: [['fusuo', 5], ['ningshen', 2]] } },
  { id: 'm3', main: true, giver: 'lingyu', giverMap: 'village', name: '拾遗青丘', lv: 3, prev: 'm2',
    text: '青丘泽的狸力与旋龟最适合初学御灵。捕捉一只狸力或一只旋龟。',
    goal: { type: 'captureOne', sp: ['lili', 'xuangui'], n: 1 }, reward: { gold: 200, exp: 130, items: [['yaocao', 3]] } },
  { id: 'm4', main: true, giver: 'elder', giverMap: 'village', name: '若木之影', lv: 8, prev: 'm3',
    text: '若木林深处有独足火鸟毕方作祟，青羽过处，讹火四起。请击败守护者·毕方。',
    goal: { type: 'boss', map: 'ruomu', n: 1 }, reward: { gold: 600, exp: 500, items: [['chijing', 3]] } },
  { id: 'm5', main: true, giver: 'elder', giverMap: 'village', name: '炎波之心', lv: 13, prev: 'm4',
    text: '炎波火泽的主人狰醒了。五尾一角，其音如击石。击败守护者·狰。',
    goal: { type: 'boss', map: 'yanbo', n: 1 }, reward: { gold: 900, exp: 900, items: [['dahun', 2], ['shenquan', 2]] } },
  { id: 'm6', main: true, giver: 'elder', giverMap: 'village', name: '幽都暗影', lv: 17, prev: 'm5',
    text: '幽都山里有食人的蛊雕。守陵人烛九说，它的叫声像婴儿。击败守护者·蛊雕。',
    goal: { type: 'boss', map: 'youdu', n: 1 }, reward: { gold: 1300, exp: 1500, items: [['shanhaiyin', 1]] } },
  { id: 'm7', main: true, giver: 'lingyu', giverMap: 'village', name: '雷泽之约', lv: 20, prev: 'm6',
    text: '雷泽的夔，苍身无角，一足入水则风雨至。若能与它结契，雷泽有救。捕捉一只夔。',
    goal: { type: 'capture', sp: 'kui', n: 1 }, reward: { gold: 1600, exp: 2000, items: [['dahun', 3]] } },
  { id: 'm8', main: true, giver: 'elder', giverMap: 'village', name: '混沌终焉', lv: 23, prev: 'm7',
    text: '雷泽最深处的鼓声，是浑敦无面目的帝江。它识歌舞，却不识悲悯。击败终焉守护者·帝江。',
    goal: { type: 'boss', map: 'leize', n: 1 }, reward: { gold: 3000, exp: 4000, items: [['shanhaiyin', 3]] } },
  /* 支线 */
  { id: 's1', side: true, giver: 'tongzi', giverMap: 'qingqiu', name: '纸鸢与风', lv: 2,
    text: '拾穗童子的纸鸢掉进了青丘泽。帮他采 6 株药草来换新的风筝线吧。',
    goal: { type: 'item', item: 'yaocao', n: 6 }, reward: { gold: 100, exp: 60, items: [['huichun', 2]] } },
  { id: 's2', side: true, giver: 'caiyao', giverMap: 'ruomu', name: '偷药的长右', lv: 6,
    text: '长右这些水猿整夜偷采药材。替杜蘅击败 8 只长右。',
    goal: { type: 'kill', sp: 'changyou', n: 8 }, reward: { gold: 220, exp: 200, items: [['ningshen', 2]] } },
  { id: 's3', side: true, giver: 'xingzhe', giverMap: 'yanbo', name: '火浣之羽', lv: 11,
    text: '火浣羽能在岩浆里捞东西。给燧带 4 根火浣羽回来。',
    goal: { type: 'item', item: 'huohuanyu', n: 4 }, reward: { gold: 380, exp: 320, items: [['dahun', 1]] } },
  { id: 's4', side: true, giver: 'shouling', giverMap: 'youdu', name: '幽都清道', lv: 15,
    text: '游魂越聚越多了。在幽都山击败任意 10 只灵物，替烛九清一清路。',
    goal: { type: 'kill', any: true, n: 10, map: 'youdu' }, reward: { gold: 500, exp: 450, items: [['shenquan', 2]] } },
  { id: 's5', side: true, giver: 'yufu', giverMap: 'leize', name: '一首十身', lv: 20,
    text: '何罗鱼一首十身，最难钓。帮渔父捕捉 1 只何罗鱼，他要看看是不是同一条。',
    goal: { type: 'capture', sp: 'heluo', n: 1 }, reward: { gold: 800, exp: 700, items: [['shanhaiyin', 1]] } },
  { id: 's6', side: true, giver: 'elder', giverMap: 'village', name: '图鉴广记', lv: 5,
    text: '姜石想重修《山海图经》。收录 12 种灵物（捕捉即收录）。',
    goal: { type: 'dex', n: 12 }, reward: { gold: 600, exp: 400, items: [['dahun', 3]] } },
  { id: 's7', side: true, giver: 'smith', giverMap: 'village', name: '铁砧缺铁', lv: 6,
    text: '石敢当的玄铁见底了。带 5 块玄铁回来，他给你打个好价钱。',
    goal: { type: 'item', item: 'xuantie', n: 5 }, reward: { gold: 350, exp: 250, items: [['chijing', 3]] } },
  { id: 's8', side: true, giver: 'lingyu', giverMap: 'village', name: '御灵高手', lv: 8,
    text: '累计捕捉 8 只野生灵物，青鸟教你真正的御灵术。',
    goal: { type: 'capture', any: true, n: 8 }, reward: { gold: 800, exp: 600, items: [['shanhaiyin', 2]] } }
];
function questGiveText(q) {
  var who = { elder: '村长·姜石', lingyu: '御灵师·青鸟', tongzi: '拾穗童子', caiyao: '采药人·杜蘅', xingzhe: '火泽行者·燧', shouling: '守陵人·烛九', yufu: '雷泽渔父', smith: '铁匠·石敢当' };
  return (who[q.giver] || '') + '（' + MAPS[q.giverMap].name + '）';
}

/* ---------------- 成就 ---------------- */
var ACHIEVEMENTS = [
  { id: 'first_catch', name: '初次结契', desc: '捕捉第一只野生灵物', check: function (s) { return s.statCatch >= 1; } },
  { id: 'dex_8', name: '图鉴·入门', desc: '收录 8 种灵物', check: function (s) { return s.dexCaught >= 8; } },
  { id: 'dex_16', name: '图鉴·饱览', desc: '收录 16 种灵物', check: function (s) { return s.dexCaught >= 16; } },
  { id: 'boss_1', name: '首胜守护者', desc: '击败任一守护者', check: function (s) { return s.statBossKill >= 1; } },
  { id: 'boss_3', name: '三镇群凶', desc: '累计击败守护者 3 次', check: function (s) { return s.statBossKill >= 3; } },
  { id: 'boss_dijiang', name: '混沌终焉', desc: '击败帝江，见证终章', check: function (s) { return s.killedDijiang; } },
  { id: 'plus_6', name: '百炼成钢', desc: '把一件装备强化到 +6', check: function (s) { return s.statPlus6 >= 1; } },
  { id: 'lv_10', name: '小有名气', desc: '冒险者等级达到 10', check: function (s) { return s.lv >= 10; } },
  { id: 'lv_30', name: '山海行者', desc: '冒险者等级达到 30（满级）', check: function (s) { return s.lv >= 30; } },
  { id: 'rich', name: '富甲一方', desc: '持有 10000 金', check: function (s) { return s.gold >= 10000; } }
];

/* ---------------- 商店货单 ---------------- */
var SHOP_STOCK = ['huichun', 'dahun', 'ningshen', 'shenquan', 'fusuo', 'chijing', 'shanhaiyin', 'chuansongfu'];
var SMITH_STOCK = ['jian1', 'jian2', 'zhang1', 'zhang2', 'gong1', 'gong2', 'yi1', 'yi2', 'mao1', 'mao2', 'xue1', 'xue2', 'pei1', 'pei2', 'fu1', 'fu2'];

/* 行脚商（随机事件）货单：比村里多一档 */
var CARAVAN_STOCK = ['jian3', 'zhang3', 'gong3', 'yi3', 'mao3', 'xue3', 'pei3', 'fu3', 'shanhaiyin', 'dahun', 'shenquan'];

/* ---------------- 掉落表（按地图主题） ---------------- */
var MAT_DROPS = {
  grass:   [['yaocao', 0.45], ['lingsha', 0.3], ['shougu', 0.2]],
  forest:  [['yaocao', 0.3], ['lingsha', 0.35], ['xuantie', 0.15], ['shougu', 0.2]],
  volcano: [['huohuanyu', 0.3], ['xuantie', 0.35], ['lingsha', 0.2], ['shougu', 0.15]],
  cave:    [['xuantie', 0.4], ['lingsha', 0.3], ['shougu', 0.2], ['leiguang', 0.1]],
  marsh:   [['leiguang', 0.35], ['xuantie', 0.3], ['lingsha', 0.2], ['yaocao', 0.15]]
};
/* 装备随机掉落：等级窗口 + 概率 */
var EQUIP_DROP_CHANCE = { normal: 0.045, elite: 0.3, boss: 1 };
function equipDropPool(lv) {
  /* 按玩家可见等级窗口给出候选（非唯一） */
  var pool = [];
  Object.keys(EQUIPS).forEach(function (id) {
    var d = EQUIPS[id];
    if (d.unique) return;
    if (d.lv <= lv + 3 && d.lv >= lv - 12) pool.push(id);
  });
  return pool;
}

/* ---------------- 排序器（所有列表共用一套口径） ---------------- */
function cmpItemId(a, b) {
  var da = ITEMS[a], db = ITEMS[b];
  var ta = ITEM_TYPE_ORDER[da.type] || 9, tb = ITEM_TYPE_ORDER[db.type] || 9;
  if (ta !== tb) return ta - tb;
  return (da.price - db.price) || (a < b ? -1 : 1);
}
function cmpEquipDef(a, b) {
  var da = EQUIPS[a], db = EQUIPS[b];
  var sa = SLOT_ORDER[da.slot], sb = SLOT_ORDER[db.slot];
  if (sa !== sb) return sa - sb;
  return da.lv - db.lv || (a < b ? -1 : 1);
}
function cmpSpeciesId(a, b) {
  var fa = speciesFamilyTop(a), fb = speciesFamilyTop(b);
  if (fa !== fb) return speciesFamilyLevel(fa) - speciesFamilyLevel(fb) || (fa < fb ? -1 : 1);
  return speciesDepth(a) - speciesDepth(b);
}
function speciesDepth(id) {
  var d = 0, cur = id, guard = 0;
  while (guard++ < 10) {
    var pre = speciesPre(cur);
    if (!pre) break;
    cur = pre; d++;
  }
  return d;
}
function speciesPre(id) {
  var r = null;
  Object.keys(SPECIES).forEach(function (k) {
    if (SPECIES[k].evo && SPECIES[k].evo.to === id) r = k;
  });
  return r;
}
function speciesFamilyTop(id) {
  var cur = id, guard = 0;
  while (guard++ < 10) {
    var pre = speciesPre(cur);
    if (!pre) return cur;
    cur = pre;
  }
  return cur;
}
function speciesFamilyLevel(id) {
  /* 家族按“最早能遇到它的等级”排：取家族内最低 base 等级入口 */
  var min = 99;
  Object.keys(MAPS).forEach(function (mid) {
    var m = MAPS[mid];
    if (!m.spawn) return;
    m.spawn.forEach(function (s) {
      if (speciesFamilyTop(s[0]) === id) min = Math.min(min, s[1]);
    });
  });
  return min === 99 ? 50 : min;
}
