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

  /* --- 雪原灵物技能 --- */
  frostfang: { name: '霜牙', el: 'water', kind: 'melee', power: 125, mp: 5, cd: 2.4, range: 46, arc: 1.7, status: ['slow', 0.35], pet: true },
  icelance:  { name: '冰锥', el: 'water', kind: 'shot', power: 102, mp: 4, cd: 1.9, speed: 380, range: 330, status: ['slow', 0.3], pet: true },
  snowstorm: { name: '唤雪', el: 'water', kind: 'aoe', power: 108, mp: 14, cd: 8, radius: 92, status: ['slow', 0.5], pet: true },

  /* --- 桃林 / 流沙灵物技能 --- */
  petalswirl:{ name: '落英', el: 'wood', kind: 'shot', power: 96, mp: 4, cd: 1.8, speed: 360, range: 320, pet: true },
  moonray:   { name: '月华', el: 'wood', kind: 'heal', power: 30, mp: 12, cd: 7, pet: true },
  sandshot:  { name: '飞沙', el: 'earth', kind: 'shot', power: 98, mp: 4, cd: 1.8, speed: 370, range: 320, status: ['slow', 0.2], pet: true },
  scorchfang:{ name: '燎牙', el: 'fire', kind: 'melee', power: 135, mp: 5, cd: 2.5, range: 46, arc: 1.7, status: ['burn', 0.25], pet: true },

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
  boss_summon:   { name: '唤魂', el: 'none', kind: 'summon', power: 0, mp: 0, cd: 18, summonSp: 'hunling', summonN: 2, bossOnly: true },

  /* --- 穷奇专属技（雪原守护者；bossOnly 红线） --- */
  boss_icyroar:  { name: '霜啸', el: 'water', kind: 'aoe', power: 110, mp: 0, cd: 7, radius: 135, status: ['slow', 0.6], bossOnly: true },
  boss_frostspike: { name: '冰锥环', el: 'water', kind: 'shot', power: 88, mp: 0, cd: 3.4, count: 8, spread: 6.283, speed: 300, range: 480, bossOnly: true },
  boss_snowblind: { name: '雪盲风', el: 'wind', kind: 'rain', power: 56, mp: 0, cd: 10, radius: 110, waves: 4, count: 3, duration: 2.2, bossOnly: true },
  boss_galedash: { name: '凶影袭', el: 'wind', kind: 'dash', power: 128, mp: 0, cd: 5.5, dash: 270, range: 66, arc: 2.3, bossOnly: true },

  /* --- 猰貐专属技（流沙守护者；bossOnly 红线） --- */
  boss_devour:   { name: '吞噬', el: 'earth', kind: 'melee', power: 135, mp: 0, cd: 3.0, range: 72, arc: 2.6, bossOnly: true },
  boss_sandwave: { name: '沙浪扇', el: 'earth', kind: 'shot', power: 92, mp: 0, cd: 2.8, count: 5, spread: 0.85, speed: 340, range: 440, status: ['slow', 0.3], bossOnly: true },
  boss_quake:    { name: '地裂震', el: 'earth', kind: 'aoe', power: 112, mp: 0, cd: 9, radius: 145, status: ['stun', 0.3], bossOnly: true },
  boss_dunecharge: { name: '沙丘冲锋', el: 'earth', kind: 'dash', power: 125, mp: 0, cd: 6, dash: 280, range: 68, arc: 2.2, bossOnly: true },

  /* --- 烛龙专属技（归墟终焉守护者；bossOnly 红线） --- */
  boss_daynight: { name: '昼夜轮转', el: 'fire', kind: 'aoe', power: 108, mp: 0, cd: 8, radius: 160, status: ['burn', 0.4], bossOnly: true },
  boss_voidspiral: { name: '虚界星旋', el: 'none', kind: 'shot', power: 78, mp: 0, cd: 7.5, count: 6, spread: 0.9, speed: 300, range: 520, spin: true, bossOnly: true },
  boss_timedevour: { name: '噬时之咬', el: 'fire', kind: 'dash', power: 120, mp: 0, cd: 6, dash: 300, range: 72, arc: 2.4, status: ['burn', 0.4], bossOnly: true },
  boss_starfall2: { name: '焚天星陨', el: 'fire', kind: 'rain', power: 54, mp: 0, cd: 11, radius: 125, waves: 5, count: 3, duration: 2.6, status: ['burn', 0.3], bossOnly: true }
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

  /* —— 北冥雪原 —— */
  sushuang: {
    name: '鹔鹴', el: 'water', rare: 3, base: { hp: 72, atk: 12, def: 8, spd: 122 }, catch: 0.3, exp: 24,
    desc: '雪原灵禽，羽毛青黄如霜，栖于冰湖之上。',
    art: { arch: 'bird', c1: '#b8d8e8', c2: '#8aabc0', c3: '#5a7488', feat: ['crest', 'wings'] },
    skills: [[1, 'icelance'], [8, 'snowstorm']]
  },
  yao: {
    name: '狕', el: 'water', rare: 3, base: { hp: 68, atk: 14, def: 6, spd: 130 }, catch: 0.28, exp: 23,
    desc: '独山之兽，状如雪豹而白身，行于风雪无声。',
    art: { arch: 'cat', c1: '#e8eef4', c2: '#b8c8d8', c3: '#8296aa', feat: ['pointEars', 'longTail', 'stripes'] },
    skills: [[1, 'frostfang'], [8, 'icelance']],
    evo: { to: 'xuekui', lv: 27, killsWith: 18 }
  },
  qizhong: {
    name: '跂踵', el: 'wind', rare: 4, base: { hp: 74, atk: 14, def: 7, spd: 126 }, catch: 0.24, exp: 27,
    desc: '状如鸮而一足彘尾，其鸣自呼。雪原人闻声则闭户。',
    art: { arch: 'bird', c1: '#c8c0d8', c2: '#9a92b4', c3: '#645e7e', feat: ['oneLeg', 'crest', 'wings'] },
    skills: [[1, 'windblade'], [9, 'windfang']]
  },

  /* —— 桃林秘境 —— */
  chenghuang: {
    name: '乘黄', el: 'wood', rare: 4, base: { hp: 82, atk: 12, def: 10, spd: 118 }, catch: 0.18, exp: 26,
    desc: '其状如狐而背上有角，乘之寿千岁。桃林最深处的祥瑞。',
    art: { arch: 'fox', c1: '#f0e4b8', c2: '#d0b878', c3: '#94793e', feat: ['goldHorn', 'longTail', 'aura'] },
    skills: [[1, 'tackle'], [7, 'moonray'], [11, 'leafstorm']]
  },
  taoyao_lu: {
    name: '桃夭鹿', el: 'wood', rare: 2, base: { hp: 66, atk: 9, def: 8, spd: 118 }, catch: 0.42, exp: 13,
    desc: '栖于桃林的鹿蜀一族，毛色染了三分春意。',
    art: { arch: 'quad', c1: '#f2d4c8', c2: '#c89aa0', c3: '#7c5460', feat: ['mane', 'stripes', 'longTail'] },
    skills: [[1, 'tackle'], [5, 'petalswirl']],
    evo: { to: 'wenma', lv: 15 }
  },

  /* —— 流沙荒漠 —— */
  manman: {
    name: '蛮蛮', el: 'wind', rare: 3, base: { hp: 64, atk: 13, def: 6, spd: 132 }, catch: 0.28, exp: 22,
    desc: '崇吾之山有鸟，状如凫而一翼一目，相得乃飞。',
    art: { arch: 'bird', c1: '#d8b8c8', c2: '#a88aa0', c3: '#6e5468', feat: ['oneEye', 'wings', 'crest'] },
    skills: [[1, 'windblade'], [8, 'windfang']]
  },
  bo: {
    name: '驳', el: 'fire', rare: 3, base: { hp: 84, atk: 15, def: 9, spd: 124 }, catch: 0.26, exp: 24,
    desc: '中曲之山有兽，状如马而白身黑尾，食虎豹，可以御兵。',
    art: { arch: 'quad', c1: '#ece8e0', c2: '#b0aa9e', c3: '#3a3430', feat: ['oneEye', 'goldHorn', 'longTail'] },
    skills: [[1, 'scorchfang'], [9, 'spark']],
    evo: { to: 'huohuan', lv: 20, killsWith: 15 }
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
  xuekui: {
    name: '雪魁', el: 'water', rare: 4, base: { hp: 122, atk: 19, def: 13, spd: 128 }, catch: 0, exp: 38, evolved: true,
    desc: '狕历风雪而成的大成形态，通身霜白，目若寒星。',
    art: { arch: 'cat', c1: '#f4f8fc', c2: '#c8d8e8', c3: '#8ea6ba', feat: ['pointEars', 'longTail', 'goldHorn', 'mane'] },
    skills: [[1, 'frostfang'], [1, 'icelance'], [12, 'snowstorm']]
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
  },
  qiongqi: {
    name: '穷奇', el: 'wind', rare: 5, base: { hp: 240, atk: 22, def: 17, spd: 138 }, catch: 0, exp: 420, boss: true,
    desc: '状如虎而生双翼，闻人争讼则佐不直者。北冥雪原的风雪之主。',
    art: { arch: 'wolf', c1: '#5a6a8c', c2: '#3e4a66', c3: '#242e44', feat: ['goldHorn', 'wings', 'storm', 'fiveTail'] },
    skills: [[1, 'boss_galedash'], [1, 'boss_frostspike'], [1, 'boss_icyroar'], [1, 'boss_snowblind']]
  },
  yayu: {
    name: '猰貐', el: 'earth', rare: 5, base: { hp: 185, atk: 20, def: 16, spd: 116 }, catch: 0, exp: 280, boss: true,
    desc: '少咸之山有兽，蛇身人面而食人，其音如婴儿。流沙荒漠的梦魇。',
    art: { arch: 'serpent', c1: '#c8a878', c2: '#9c7c50', c3: '#68523a', feat: ['oneEye', 'goldHorn', 'darkAura'] },
    skills: [[1, 'boss_devour'], [1, 'boss_sandwave'], [1, 'boss_quake'], [1, 'boss_dunecharge']]
  },
  kun: {
    name: '鲲', el: 'water', rare: 5, base: { hp: 130, atk: 20, def: 14, spd: 108 }, catch: 0.12, exp: 46,
    desc: '北冥有鱼，其名为鲲，鲲之大，不知其几千里也。归墟中见到的，是它的少年时代。',
    art: { arch: 'wisp', c1: '#6a9ad0', c2: '#4a729e', c3: '#2c4a6a', feat: ['wings', 'aura'] },
    skills: [[1, 'waterpulse'], [12, 'tide']]
  },
  zhulong: {
    name: '烛龙', el: 'fire', rare: 5, base: { hp: 300, atk: 24, def: 19, spd: 124 }, catch: 0, exp: 640, boss: true,
    desc: '钟山之神，视为昼，瞑为夜，吹为冬，呼为夏。归墟之底的终焉之影。',
    art: { arch: 'serpent', c1: '#d05840', c2: '#a03428', c3: '#601c14', feat: ['goldHorn', 'fireAura', 'storm'] },
    skills: [[1, 'boss_daynight'], [1, 'boss_voidspiral'], [1, 'boss_timedevour'], [1, 'boss_starfall2']]
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
  shougu:    { name: '兽骨', type: 'mat', price: 18, icon: 'bone', color: '#e0dccf', desc: '灵兽的遗骨，铁匠收这个' },
  bingpo:    { name: '冰魄', type: 'mat', price: 85, icon: 'gem', color: '#8fe0f0', desc: '雪原冰湖深处凝出的不化之冰' },
  shajin:    { name: '流金沙', type: 'mat', price: 70, icon: 'sand', color: '#e8c878', desc: '荒漠风蚀出的金屑砂，锻造掺料' },
  kite:      { name: '燕子纸鸢', type: 'mat', price: 40, icon: 'kite', color: '#e88a9a', desc: '拾穗童子亲手扎的纸鸢，尾巴上还系着铃铛' }
};
var ITEM_TYPE_ORDER = { use: 0, ball: 1, teleport: 2, mat: 3, key: 4 };

/* ---------------- 装备 ----------------
   slot: weapon | armor | head | feet | amulet | charm
   档位：青铜(1) 玄铁(10) 灵玉(20) 寒铁(30) */
var EQUIP_TIERS = [
  { id: 1, name: '青铜', lv: 1 },
  { id: 2, name: '玄铁', lv: 10 },
  { id: 3, name: '灵玉', lv: 20 },
  { id: 4, name: '寒铁', lv: 30 }
];
var EQUIPS = {
  /* 剑 */
  jian1: { name: '青铜剑', slot: 'weapon', wt: 'sword', lv: 1, atk: 5, price: 120, look: { shape: 'jian', c: '#b8c4cc' } },
  jian2: { name: '玄铁重剑', slot: 'weapon', wt: 'sword', lv: 10, atk: 14, price: 640, look: { shape: 'jian', c: '#7e96a8' } },
  jian3: { name: '灵玉长锋', slot: 'weapon', wt: 'sword', lv: 20, atk: 26, price: 2100, look: { shape: 'jian', c: '#9fd8e8' } },
  jian4: { name: '寒铁断岳', slot: 'weapon', wt: 'sword', lv: 30, atk: 40, def: 3, price: 5200, look: { shape: 'jian', c: '#a8d8f0' } },
  /* 杖 */
  zhang1: { name: '桃木杖', slot: 'weapon', wt: 'staff', lv: 1, atk: 5, mp: 15, price: 120, look: { shape: 'zhang', c: '#c8a878' } },
  zhang2: { name: '玄晶法杖', slot: 'weapon', wt: 'staff', lv: 10, atk: 14, mp: 40, price: 640, look: { shape: 'zhang', c: '#8fa8e0' } },
  zhang3: { name: '灵珠天权', slot: 'weapon', wt: 'staff', lv: 20, atk: 26, mp: 80, price: 2100, look: { shape: 'zhang', c: '#c8a0f0' } },
  zhang4: { name: '寒铁衔星杖', slot: 'weapon', wt: 'staff', lv: 30, atk: 40, mp: 130, price: 5200, look: { shape: 'zhang', c: '#a8d8f0' } },
  /* 弓 */
  gong1: { name: '桑木弓', slot: 'weapon', wt: 'bow', lv: 1, atk: 5, spd: 3, price: 120, look: { shape: 'gong', c: '#b89058' } },
  gong2: { name: '玄铁战弓', slot: 'weapon', wt: 'bow', lv: 10, atk: 14, spd: 6, price: 640, look: { shape: 'gong', c: '#78909c' } },
  gong3: { name: '灵玉鸣弦', slot: 'weapon', wt: 'bow', lv: 20, atk: 26, spd: 10, price: 2100, look: { shape: 'gong', c: '#8fe0d0' } },
  gong4: { name: '寒铁落雁弓', slot: 'weapon', wt: 'bow', lv: 30, atk: 40, spd: 15, crit: 0.03, price: 5200, look: { shape: 'gong', c: '#a8d8f0' } },
  /* 衣甲 */
  yi1: { name: '粗布短褐', slot: 'armor', lv: 1, def: 3, hp: 20, price: 100, look: { c: '#a89878' } },
  yi2: { name: '玄铁轻铠', slot: 'armor', lv: 10, def: 9, hp: 90, price: 560, look: { c: '#708898' } },
  yi3: { name: '灵玉法衣', slot: 'armor', lv: 20, def: 16, hp: 200, mp: 40, price: 1900, look: { c: '#88c8d8' } },
  yi4: { name: '寒铁玄甲', slot: 'armor', lv: 30, def: 24, hp: 340, price: 4800, look: { c: '#b8d8e8' } },
  /* 头冠 */
  mao1: { name: '青布头巾', slot: 'head', lv: 1, def: 2, hp: 12, price: 80, look: { c: '#8a9a70' } },
  mao2: { name: '玄铁盔', slot: 'head', lv: 10, def: 6, hp: 50, price: 440, look: { c: '#68808c' } },
  mao3: { name: '灵玉冠', slot: 'head', lv: 20, def: 11, hp: 110, mp: 25, price: 1500, look: { c: '#90d0c8' } },
  mao4: { name: '寒铁星盔', slot: 'head', lv: 30, def: 16, hp: 180, mp: 40, price: 3600, look: { c: '#a8d0e8' } },
  /* 足履 */
  xue1: { name: '草鞋', slot: 'feet', lv: 1, def: 1, spd: 4, price: 70, look: { c: '#c8b070' } },
  xue2: { name: '玄铁靴', slot: 'feet', lv: 10, def: 4, spd: 8, hp: 40, price: 400, look: { c: '#607880' } },
  xue3: { name: '踏云履', slot: 'feet', lv: 20, def: 7, spd: 14, price: 1350, look: { c: '#a8e0d8' } },
  xue4: { name: '寒铁凌波靴', slot: 'feet', lv: 30, def: 11, spd: 20, price: 3200, look: { c: '#b0d8f0' } },
  /* 佩饰 */
  pei1: { name: '骨哨', slot: 'amulet', lv: 1, atk: 2, price: 90, look: { c: '#e0dccf' } },
  pei2: { name: '雷纹玉佩', slot: 'amulet', lv: 10, atk: 5, crit: 0.04, price: 480, look: { c: '#d8c860' } },
  pei3: { name: '苍龙玉佩', slot: 'amulet', lv: 20, atk: 10, crit: 0.08, price: 1650, look: { c: '#70a8e0' } },
  pei4: { name: '寒铁覆海佩', slot: 'amulet', lv: 30, atk: 16, crit: 0.1, price: 4000, look: { c: '#88c0e8' } },
  /* 护符 */
  fu1: { name: '平安符', slot: 'charm', lv: 1, hp: 15, mp: 10, price: 85, look: { c: '#e8b8b8' } },
  fu2: { name: '镇岳符', slot: 'charm', lv: 10, hp: 70, def: 3, price: 460, look: { c: '#b8c8a8' } },
  fu3: { name: '归墟符', slot: 'charm', lv: 20, hp: 160, mp: 50, def: 5, price: 1580, look: { c: '#a8c0e8' } },
  fu4: { name: '寒铁镇渊符', slot: 'charm', lv: 30, hp: 260, mp: 80, def: 8, price: 3800, look: { c: '#98bce0' } },
  /* 唯一装备（BOSS 掉落，不进商店与随机池） */
  bifang_ling: { name: '毕方羽翎', slot: 'amulet', lv: 12, atk: 8, crit: 0.06, price: 0, unique: true, look: { c: '#f06030' }, desc: '毕方的翎羽，火光不熄' },
  dijiang_he:  { name: '帝江之核', slot: 'charm', lv: 26, hp: 220, mp: 60, atk: 6, def: 6, price: 0, unique: true, look: { c: '#e8c860' }, desc: '浑沌之心，六识皆空' },
  zhulong_yan: { name: '烛龙之睛', slot: 'amulet', lv: 34, atk: 14, crit: 0.1, mp: 40, price: 0, unique: true, look: { c: '#ff5030' }, desc: '视为昼，瞑为夜——烛龙的眼，如今看着你' }
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
      { x: 58, y: 21, to: 'ruomu', tx: 4, ty: 22, label: '若木林', needLv: 6 },
      { x: 30, y: 4, to: 'taolin', tx: 26, ty: 32, label: '桃林秘境', needLv: 9 }
    ],
    npcs: [{ id: 'tongzi', name: '拾穗童子', x: 22, y: 30, role: 'quest', face: 'kid', lines: '我的纸鸢飞走了……' }]
  },
  taolin: {
    name: '桃林秘境', theme: 'peach', w: 54, h: 38, seed: 20260908, lv: [9, 14], maxMob: 11,
    spawn: [['taoyao_lu', 9, 13, 26], ['quru', 9, 13, 20], ['lusu', 9, 12, 16], ['chenghuang', 11, 14, 5], ['huoshu', 9, 12, 10]],
    portals: [
      { x: 26, y: 34, to: 'qingqiu', tx: 30, ty: 7, label: '青丘泽' }
    ],
    npcs: [{ id: 'taozao', name: '守林人·桃夭', x: 24, y: 30, role: 'quest', face: 'healer', lines: '桃花开多久，我就守多久。' }]
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
      { x: 31, y: 4, to: 'youdu', tx: 31, ty: 41, label: '幽都山', needLv: 15 },
      { x: 56, y: 40, to: 'liusha', tx: 5, ty: 22, label: '流沙荒漠', needLv: 16 }
    ],
    npcs: [{ id: 'xingzhe', name: '火泽行者·燧', x: 48, y: 34, role: 'quest', face: 'walker', lines: '别踩亮着的地皮。' }]
  },
  liusha: {
    name: '流沙荒漠', theme: 'desert', w: 62, h: 44, seed: 20260909, lv: [16, 22], maxMob: 13,
    spawn: [['manman', 16, 20, 22], ['bo', 17, 22, 18], ['huan', 16, 20, 16], ['feiyi', 16, 19, 12], ['shangao', 17, 21, 10]],
    boss: { sp: 'yayu', lv: 22, hpMul: 18, respawn: 240, drop: [['shajin', 3], ['xuantie', 4]] },
    portals: [
      { x: 3, y: 22, to: 'yanbo', tx: 53, ty: 40, label: '炎波火泽' }
    ],
    npcs: [{ id: 'tuoling', name: '沙行客·驼铃', x: 18, y: 26, role: 'quest', face: 'walker', lines: '沙子底下埋着旧王朝的名字。' }]
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
      { x: 57, y: 22, to: 'youdu', tx: 6, ty: 8, label: '幽都山' },
      { x: 8, y: 6, to: 'beiming', tx: 56, ty: 22, label: '北冥雪原', needLv: 25 }
    ],
    npcs: [{ id: 'yufu', name: '雷泽渔父', x: 16, y: 32, role: 'quest', face: 'fisher', lines: '雷声越近，鱼越肥。' }]
  },
  beiming: {
    name: '北冥雪原', theme: 'snow', w: 64, h: 46, seed: 20260907, lv: [25, 31], maxMob: 14,
    spawn: [['sushuang', 25, 30, 22], ['yao', 25, 30, 20], ['qizhong', 26, 31, 16], ['xuekui', 28, 31, 4], ['yuxiong', 26, 30, 8]],
    boss: { sp: 'qiongqi', lv: 31, hpMul: 26, respawn: 300, drop: [['bingpo', 3], ['shanhaiyin', 2]] },
    portals: [
      { x: 58, y: 22, to: 'leize', tx: 10, ty: 6, label: '雷泽' },
      { x: 8, y: 40, to: 'guixu', tx: 30, ty: 6, label: '归墟', needLv: 32 }
    ],
    npcs: [{ id: 'lieren', name: '雪原猎户·白罴', x: 20, y: 24, role: 'quest', face: 'hunter', lines: '风雪要把山都埋了。' }]
  },
  guixu: {
    name: '归墟', theme: 'abyss', w: 58, h: 42, seed: 20260910, lv: [32, 36], maxMob: 12, dark: true,
    spawn: [['kun', 32, 36, 16], ['xuekui', 32, 35, 14], ['tushanjun', 32, 34, 12], ['kui', 32, 35, 10], ['yuxiong', 32, 34, 10]],
    boss: { sp: 'zhulong', lv: 36, hpMul: 30, respawn: 360, drop: [['shanhaiyin', 3], ['bingpo', 3]] },
    portals: [
      { x: 30, y: 38, to: 'beiming', tx: 10, ty: 40, label: '北冥雪原' }
    ],
    npcs: []
  }
};
var LEVEL_CAP = 38;
function expToLevel(lv) { return Math.floor(12 * Math.pow(lv, 1.7)); }

/* ---------------- 委托 ---------------- */
var QUESTS = [
  /* 主线 */
  { id: 'm1', main: true, giver: 'elder', giverMap: 'village', name: '初试身手', lv: 1,
    text: '村外的青丘泽近来灵物躁动。去击败 5 只野生灵物，让它们记起对人的敬畏。',
    goal: { type: 'kill', any: true, n: 5 }, reward: { gold: 120, exp: 60, items: [['huichun', 3]] },
    after: "干得漂亮。灵物是认拳头也认善意的——你今天两样都露了一手。" },
  { id: 'm2', main: true, giver: 'elder', giverMap: 'village', name: '缚灵之道', lv: 2, prev: 'm1',
    text: '御灵师青鸟说，与其杀戮，不如结契。用缚灵索捕捉 1 只野生灵物，带回来给她看。',
    goal: { type: 'capture', any: true, n: 1 }, reward: { gold: 150, exp: 90, items: [['fusuo', 5], ['ningshen', 2]] },
    after: "结契不是驯服，是相互点头。从今天起，你不是一个人在山海之间走了。" },
  { id: 'm3', main: true, giver: 'lingyu', giverMap: 'village', name: '拾遗青丘', lv: 3, prev: 'm2',
    text: '青丘泽的狸力与旋龟最适合初学御灵。捕捉一只狸力或一只旋龟。',
    goal: { type: 'captureOne', sp: ['lili', 'xuangui'], n: 1 }, reward: { gold: 200, exp: 130, items: [['yaocao', 3]] },
    after: "好眼力。开头顺了，后面的路再长，也不过是把这个道理走到更远的地方。" },
  { id: 'm4', main: true, giver: 'elder', giverMap: 'village', name: '若木之影', lv: 8, prev: 'm3',
    text: '若木林深处有独足火鸟毕方作祟，青羽过处，讹火四起。请击败守护者·毕方。',
    goal: { type: 'boss', map: 'ruomu', n: 1 }, reward: { gold: 600, exp: 500, items: [['chijing', 3]] },
    after: "毕方折羽，讹火熄了。若木林的雾散开那天，姜石在村口等你到很晚。" },
  { id: 'm5', main: true, giver: 'elder', giverMap: 'village', name: '炎波之心', lv: 13, prev: 'm4',
    text: '炎波火泽的主人狰醒了。五尾一角，其音如击石。击败守护者·狰。',
    goal: { type: 'boss', map: 'yanbo', n: 1 }, reward: { gold: 900, exp: 900, items: [['dahun', 2], ['shenquan', 2]] },
    after: "狰的吼声停了，火泽的地面凉了下来。五尾一角的传说，往后由你来讲。" },
  { id: 'm6', main: true, giver: 'elder', giverMap: 'village', name: '幽都暗影', lv: 17, prev: 'm5',
    text: '幽都山里有食人的蛊雕。守陵人烛九说，它的叫声像婴儿。击败守护者·蛊雕。',
    goal: { type: 'boss', map: 'youdu', n: 1 }, reward: { gold: 1300, exp: 1500, items: [['shanhaiyin', 1]] },
    after: "蛊雕食人，也食人心里的光。你把它斩落的那刻，幽都的灯好像亮了一分。" },
  { id: 'm7', main: true, giver: 'lingyu', giverMap: 'village', name: '雷泽之约', lv: 20, prev: 'm6',
    text: '雷泽的夔，苍身无角，一足入水则风雨至。若能与它结契，雷泽有救。捕捉一只夔。',
    goal: { type: 'capture', sp: 'kui', n: 1 }, reward: { gold: 1600, exp: 2000, items: [['dahun', 3]] },
    after: "夔入水则风雨至——可它如今跟在你身边，风雨成了你的仪仗。雷泽有救了。" },
  { id: 'm8', main: true, giver: 'elder', giverMap: 'village', name: '混沌终焉', lv: 23, prev: 'm7',
    text: '雷泽最深处的鼓声，是浑敦无面目的帝江。它识歌舞，却不识悲悯。击败终焉守护者·帝江。',
    goal: { type: 'boss', map: 'leize', n: 1 }, reward: { gold: 3000, exp: 4000, items: [['shanhaiyin', 3]] },
    after: "鼓声停了。帝江识歌舞，却不识悲悯；你识悲悯，所以你赢了。山海重归安宁——去吧，把图经写满。" },
  { id: 'm9', main: true, giver: 'lieren', giverMap: 'beiming', name: '风雪之主', lv: 25, prev: 'm8',
    text: '北冥的风雪三年不歇，猎户说那是穷奇的翅膀在扇动。状如虎而生双翼，佐不直而毁忠良。请击败风雪之主·穷奇。',
    goal: { type: 'boss', map: 'beiming', n: 1 }, reward: { gold: 4200, exp: 5600, items: [['shanhaiyin', 3], ['dahun', 3]] },
    after: "风雪止息。穷奇佐不直而毁忠良，如今它的翅膀再也扇不动一场雪。北冥的太阳升起来了——姜石说，山海图经的最后一页，该写你的名字了。" },
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
    goal: { type: 'capture', any: true, n: 8 }, reward: { gold: 800, exp: 600, items: [['shanhaiyin', 2]] } },
  { id: 's9', side: true, giver: 'lieren', giverMap: 'beiming', name: '冰湖惊禽', lv: 25,
    text: '鹔鹴把猎户的鱼抢了个精光。替白罴击败 8 只鹔鹴，教它们长长记性。',
    goal: { type: 'kill', sp: 'sushuang', n: 8 }, reward: { gold: 1500, exp: 1300, items: [['shenquan', 3]] } },
  { id: 's10', side: true, giver: 'lieren', giverMap: 'beiming', name: '不化之冰', lv: 26,
    text: '冰魄是打制寒铁的好料子。给白罴带回 6 块冰魄，他拿祖传的雪罴皮裘跟你换。',
    goal: { type: 'item', item: 'bingpo', n: 6 }, reward: { gold: 1700, exp: 1500, items: [['dahun', 3], ['chijing', 5]] } },
  { id: 'm10', main: true, giver: 'elder', giverMap: 'village', name: '归墟之底', lv: 31, prev: 'm9',
    text: '北冥之北有归墟，万水之所归——烛龙蛰伏其间，视为昼，瞑为夜。若它睁眼，山海将再无黑夜。请前往归墟，击败终焉之影·烛龙。',
    goal: { type: 'boss', map: 'guixu', n: 1 }, reward: { gold: 6800, exp: 9000, items: [['shanhaiyin', 4], ['dahun', 4]] },
    after: '烛龙合上了眼。昼与夜各归其位，万水在归墟深处安静地打着旋。你把烛龙之睛握在手心——那不是战利品，是山海托付给你的目光。旅程结束了，而图经才刚刚写满第一卷。' },
  /* —— 支线扩充（每图铺满） —— */
  { id: 's11', side: true, giver: 'healer', giverMap: 'village', name: '药圃补种', lv: 4,
    text: '白芷的药圃被踩烂了。带 8 株药草回来，她教你怎么辨识灵草。',
    goal: { type: 'item', item: 'yaocao', n: 8 }, reward: { gold: 220, exp: 150, items: [['huichun', 4]] } },
  { id: 's12', side: true, giver: 'shopper', giverMap: 'village', name: '货担两端', lv: 4,
    text: '幺妹要进山收皮货，可青丘泽的灵物最近不太安分。替她清掉 12 只，壮壮胆。',
    goal: { type: 'kill', any: true, n: 12, map: 'qingqiu' }, reward: { gold: 260, exp: 200, items: [['fusuo', 4]] } },
  { id: 's13', side: true, giver: 'tongzi', giverMap: 'qingqiu', name: '风鸢新线', lv: 5,
    text: '童子想要用灵物筋腱做的新风筝线。帮他捕捉 2 只任意灵物（战斗中按 E）。',
    goal: { type: 'capture', any: true, n: 2 }, reward: { gold: 200, exp: 160, items: [['kite', 1]] } },
  { id: 's14', side: true, giver: 'tongzi', giverMap: 'qingqiu', name: '童谣里的九尾', lv: 6,
    text: '村里童谣唱"青丘有狐九条尾"。把传说里的九尾狐带一只回来给童子开开眼。',
    goal: { type: 'capture', sp: 'jiuweihu', n: 1 }, reward: { gold: 500, exp: 380, items: [['chijing', 3]] } },
  { id: 's15', side: true, giver: 'taozao', giverMap: 'taolin', name: '桃夭灼灼', lv: 9,
    text: '桃夭想给桃林添新客。捕捉 2 只桃夭鹿，她替它们在林间备好了草窝。',
    goal: { type: 'capture', sp: 'taoyao_lu', n: 2 }, reward: { gold: 420, exp: 340, items: [['ningshen', 3]] } },
  { id: 's16', side: true, giver: 'taozao', giverMap: 'taolin', name: '落英如雨', lv: 10,
    text: '瞿如鸟啄食花苞，扰了桃林的清净。替桃夭击败 6 只瞿如。',
    goal: { type: 'kill', sp: 'quru', n: 6 }, reward: { gold: 380, exp: 320, items: [['huichun', 3]] } },
  { id: 's17', side: true, giver: 'caiyao', giverMap: 'ruomu', name: '深林药引', lv: 7,
    text: '杜蘅的药方缺一味灵砂引子。带 6 份灵砂回来，药香能飘满整个林子。',
    goal: { type: 'item', item: 'lingsha', n: 6 }, reward: { gold: 300, exp: 260, items: [['ningshen', 2], ['huichun', 2]] } },
  { id: 's18', side: true, giver: 'caiyao', giverMap: 'ruomu', name: '独足火羽', lv: 9,
    text: '火鼠的毛织布防火。捕捉 2 只火鼠，杜蘅要给采药人缝防火的袖套。',
    goal: { type: 'capture', sp: 'huoshu', n: 2 }, reward: { gold: 360, exp: 300, items: [['huohuanyu', 1]] } },
  { id: 's19', side: true, giver: 'xingzhe', giverMap: 'yanbo', name: '火浣布', lv: 13,
    text: '六根火浣羽能织一方火浣布。燧说那是过火泽的保命家当。',
    goal: { type: 'item', item: 'huohuanyu', n: 6 }, reward: { gold: 620, exp: 520, items: [['dahun', 2]] } },
  { id: 's20', side: true, giver: 'xingzhe', giverMap: 'yanbo', name: '炎波净化', lv: 12,
    text: '火泽的灵物被狰的煞气熏得躁动。击败炎波任意 15 只灵物，替燧泄一泄地火。',
    goal: { type: 'kill', any: true, n: 15, map: 'yanbo' }, reward: { gold: 560, exp: 480, items: [['shenquan', 2]] } },
  { id: 's21', side: true, giver: 'tuoling', giverMap: 'liusha', name: '沙海的旅人', lv: 17,
    text: '驼铃的驼队被比翼的蛮蛮撞散了三回。替他击败 8 只蛮蛮，让驼铃再响起来。',
    goal: { type: 'kill', sp: 'manman', n: 8 }, reward: { gold: 780, exp: 700, items: [['ningshen', 3]] } },
  { id: 's22', side: true, giver: 'tuoling', giverMap: 'liusha', name: '比翼难飞', lv: 18,
    text: '蛮蛮一翼一目，相得乃飞。驼铃想看真正的比翼——捕捉 1 只蛮蛮带给他。',
    goal: { type: 'capture', sp: 'manman', n: 1 }, reward: { gold: 820, exp: 760, items: [['chijing', 4]] } },
  { id: 's23', side: true, giver: 'tuoling', giverMap: 'liusha', name: '驳影食虎', lv: 19,
    text: '驳，食虎豹，可以御兵。驼铃的商路尽头有虎豹出没——捕捉 1 只驳，护他一程。',
    goal: { type: 'capture', sp: 'bo', n: 1 }, reward: { gold: 900, exp: 840, items: [['shanhaiyin', 1]] } },
  { id: 's24', side: true, giver: 'shouling', giverMap: 'youdu', name: '长夜守灯', lv: 15,
    text: '混灵绕着长明灯打转，灯芯都要被扑灭了。替烛九打散 10 只混灵。',
    goal: { type: 'kill', sp: 'hunling', n: 10 }, reward: { gold: 520, exp: 460, items: [['shenquan', 2]] } },
  { id: 's25', side: true, giver: 'shouling', giverMap: 'youdu', name: '十身之秘', lv: 16,
    text: '烛九守陵半生，没弄明白何罗鱼的十身怎么长。击败 6 只何罗鱼，捡些鳞片给他琢磨。',
    goal: { type: 'kill', sp: 'heluo', n: 6 }, reward: { gold: 560, exp: 520, items: [['dahun', 2]] } },
  { id: 's26', side: true, giver: 'yufu', giverMap: 'leize', name: '雷泽垂钓', lv: 21,
    text: '渔父的鱼钩要淬雷光。带 5 块雷光石来，他给你看真正的雷泽钓法。',
    goal: { type: 'item', item: 'leiguang', n: 5 }, reward: { gold: 950, exp: 820, items: [['shenquan', 3]] } },
  { id: 's27', side: true, giver: 'yufu', giverMap: 'leize', name: '夔鼓再响', lv: 20,
    text: '雷泽有夔，出入水则必风雨，其光如日月，其声如雷。捕捉 1 只夔——渔父等这声鼓响等了三十年。',
    goal: { type: 'capture', sp: 'kui', n: 1 }, reward: { gold: 1400, exp: 1300, items: [['shanhaiyin', 2]] } },
  { id: 's28', side: true, giver: 'lieren', giverMap: 'beiming', name: '狕踪', lv: 25,
    text: '狕行于风雪无声。白罴年轻时追过一条，没追上。替他捕捉 1 只狕，圆个旧梦。',
    goal: { type: 'capture', sp: 'yao', n: 1 }, reward: { gold: 1300, exp: 1200, items: [['chijing', 4]] } },
  { id: 's29', side: true, giver: 'lieren', giverMap: 'beiming', name: '雪原清道', lv: 26,
    text: '风雪封路，猎户的套索全废了。击败北冥任意 14 只灵物，把路趟开。',
    goal: { type: 'kill', any: true, n: 14, map: 'beiming' }, reward: { gold: 1500, exp: 1400, items: [['dahun', 3]] } },
  { id: 's30', side: true, giver: 'lingyu', giverMap: 'village', name: '图鉴·山海遗篇', lv: 16,
    text: '青鸟说，《山海图经》的遗篇要凑齐 22 种灵物才能装订。去把它们都带回来吧。',
    goal: { type: 'dex', n: 22 }, reward: { gold: 1600, exp: 1300, items: [['shanhaiyin', 2], ['dahun', 2]] } },
  { id: 's31', side: true, giver: 'smith', giverMap: 'village', name: '玄铁急单', lv: 13,
    text: '石敢当接了村里农具的大单子，玄铁见底。带 8 块玄铁回来，他给你打个大折扣。',
    goal: { type: 'item', item: 'xuantie', n: 8 }, reward: { gold: 600, exp: 480, items: [['chijing', 3]] } },
  { id: 's32', side: true, giver: 'elder', giverMap: 'village', name: '村中的怪谈', lv: 12,
    text: '最近村里怪谈四起：夜里有紫光闪过。姜石说那是讙——击败 5 只讙，让村子睡个安稳觉。',
    goal: { type: 'kill', sp: 'huan', n: 5 }, reward: { gold: 500, exp: 420, items: [['ningshen', 3]] } },
  { id: 's33', side: true, giver: 'taozao', giverMap: 'taolin', name: '秘境巡礼', lv: 11,
    text: '桃林深处很少有人走到。替桃夭在秘境里击败 12 只任意灵物，替她把林子巡一遍。',
    goal: { type: 'kill', any: true, n: 12, map: 'taolin' }, reward: { gold: 460, exp: 400, items: [['huichun', 3], ['kite', 1]] } },
  /* —— 隐藏委托（高难 / 长线） —— */
  { id: 'h1', side: true, hidden: true, giver: 'lingyu', giverMap: 'village', name: '闪光之约', lv: 14,
    text: '青鸟年轻时见过一只通体流光的灵物，至今念念不忘。捕捉 1 只闪光灵物，她教你御灵的至高心法。',
    goal: { type: 'shinyCapture', n: 1 }, reward: { gold: 2600, exp: 2200, items: [['shanhaiyin', 3]] } },
  { id: 'h2', side: true, hidden: true, giver: 'elder', giverMap: 'village', name: '遗刻寻踪', lv: 10,
    text: '山海之间立着八块古碑，刻着上古御灵人的手记。找到并读取 4 块遗刻，回来告诉姜石。',
    goal: { type: 'stelae', n: 4 }, reward: { gold: 1200, exp: 1000, items: [['shanhaiyin', 2]] } },
  { id: 'h3', side: true, hidden: true, giver: 'tuoling', giverMap: 'liusha', name: '沙海之王', lv: 21,
    text: '猰貐每醒一次，沙海就吞掉一条商路。三次击败猰貐，让驼铃的商队永远走得安心。（它沉睡后约四分钟醒来一次）',
    goal: { type: 'boss', map: 'liusha', n: 3 }, reward: { gold: 3000, exp: 2600, items: [['shanhaiyin', 2], ['dahun', 4]] } }
];
function questGiveText(q) {
  var who = { elder: '村长·姜石', lingyu: '御灵师·青鸟', tongzi: '拾穗童子', caiyao: '采药人·杜蘅', xingzhe: '火泽行者·燧', shouling: '守陵人·烛九', yufu: '雷泽渔父', smith: '铁匠·石敢当', lieren: '雪原猎户·白罴', taozao: '守林人·桃夭', tuoling: '沙行客·驼铃' };
  return (who[q.giver] || '') + '（' + MAPS[q.giverMap].name + '）';
}

/* ---------------- 山海遗刻（8 块古碑，散布各图；读取收集，长线剧情） ---------------- */
var STELAE = [
  { id: 'st_qingqiu', map: 'qingqiu', x: 40, y: 10, name: '青丘之刻',
    txt: '「青丘之山有兽焉，其音如婴儿。上古拾灵人于此立约：不猎尽，不绝嗣，取一还三。」' },
  { id: 'st_taolin', map: 'taolin', x: 46, y: 8, name: '桃林之刻',
    txt: '「桃林者，夸父之杖所化也。杖弃道旁，生为邓林。拾灵人过此，当思先行者之志。」' },
  { id: 'st_ruomu', map: 'ruomu', x: 50, y: 36, name: '若木之刻',
    txt: '「若木生于西极，其华照地。碑下埋着第一代拾灵人的缚灵索——索上无结，因为那时人与灵物之间还没有猜疑。」' },
  { id: 'st_yanbo', map: 'yanbo', x: 18, y: 8, name: '炎波之刻',
    txt: '「火泽之底，睡着不肯熄灭的旧世界。拾灵人留下警告：火可以取暖，也可以烧掉回家的路。」' },
  { id: 'st_liusha', map: 'liusha', x: 48, y: 10, name: '流沙之刻',
    txt: '「流沙三百里，掩过城池与名姓。碑文最末一行小字：如果有人读到此处，请替我记着，这里曾有人唱歌。」' },
  { id: 'st_youdu', map: 'youdu', x: 48, y: 32, name: '幽都之刻',
    txt: '「幽都之下，黑水之滨。拾灵人不点灯——他们记得每一位故去同伴的名字，而名字比灯更亮。」' },
  { id: 'st_leize', map: 'leize', x: 14, y: 10, name: '雷泽之刻',
    txt: '「雷泽有雷神，龙身而人头，鼓其腹则雷。拾灵人立碑于此：敬畏不是恐惧，是懂得对方为何发怒。」' },
  { id: 'st_beiming', map: 'beiming', x: 16, y: 36, name: '北冥之刻',
    txt: '「北冥有鱼，其名为鲲。碑上刻着历代拾灵人最终的归处——他们都变成了风，继续在山海之间行走。现在，轮到你走这条路了。」' }
];

/* ---------------- NPC 分支对话（按 flags/进度现算；取第一条满足项） ---------------- */
var NPC_LINES = {
  elder: [
    { if: function (G) { return G.flags.victory && G.stats.killedQiongqi; }, t: '风雪与混沌都平定了。孩子，《山海图经》该续写下卷了——执笔人写你的名字。' },
    { if: function (G) { return G.flags.victory; }, t: '雷泽太平了，可北冥的风还没停。猎户白罴捎信来，说穷奇的翅膀扇得雪下个不停……' },
    { if: function (G) { return !G.questsDone.m4; }, t: '这世道，灵物躁动，守护者也不再安眠。山海图经散佚，还望行侠重拾。' },
    { if: function (G) { return !G.questsDone.m8; }, t: '守护者一个接一个地醒。村子靠你撑着，孩子——走稳些。' },
    { t: '村口的老槐树又绿了一茬。山海的路还长，慢慢走。' }
  ],
  lingyu: [
    { if: function (G) { return G.stats.statCatch >= 10; }, t: '你身上的灵气越来越杂——不，是热闹。它们信任你，这是御灵师一辈子求不来的东西。' },
    { if: function (G) { return G.stats.statCatch >= 3; }, t: '结契不是驯服，是相互点头。你做得不错，别松手。' },
    { t: '灵物如友：喂它药、带它战、莫弃它。血量越低越好捕捉，带上异常状态更佳。' }
  ],
  smith: [
    { if: function (G) { return (G.stats.statPlus6 || 0) >= 1; }, t: '好家伙，+6 的物件你都搞出来了！石敢当我服你，以后打铁给你留头炉。' },
    { t: '叮叮当当！玄铁不够就吱声，你的家伙什儿我可都记着账呢。' }
  ],
  healer: [
    { if: function (G) { return G.player.hp < G.player.st.hp * 0.5; }, t: '伤成这样还硬撑？坐下，让白芷看看。' },
    { t: '创伤要早治。药不够就来找我，别拿命省药钱。' }
  ],
  shopper: [
    { if: function (G) { return G.player.gold >= 5000; }, t: '哎哟财主来了！今天上等货色随便挑，不买也喝口茶。' },
    { t: '买点啥子？缚灵索、药、传送符，都是过日子的硬货。' }
  ],
  taozao: [
    { if: function (G) { return G.dex.caught.chenghuang; }, t: '你见过乘黄了？那可是桃林的福气……它肯跟你走，说明你心里也有一片桃林。' },
    { t: '桃花开多久，我就守多久。外面的世界太吵，这儿的风都是甜的。' }
  ],
  tuoling: [
    { if: function (G) { return G.flags.boss_liusha; }, t: '猰貐的叫声停了。沙还是那片沙，但商队的驼铃敢在夜里响了——这份人情，驼铃记着。' },
    { t: '沙子底下埋着旧王朝的名字。猰貐一叫，名字就往外翻。帮我把那条路清出来吧。' }
  ],
  lieren: [
    { if: function (G) { return G.stats.killedQiongqi; }, t: '风停了。三十年了，头一回听清冰湖底下的鱼声。谢谢你，年轻人。' },
    { if: function (G) { return G.flags.boss_leize; }, t: '雷泽的鼓声停了？那穷奇该醒着了——它趁乱扇风雪三年了。往北走，替这片雪原出口气。' },
    { t: '风雪要把山都埋了。往北的路不好走，多带些药。' }
  ],
  tongzi: [
    { if: function (G) { return G.questsDone.s13; }, t: '新纸鸢飞得可高了！等我长大，也要当拾灵人，飞得比纸鸢还高！' },
    { t: '我的纸鸢飞走了……风把它带到北边的桃林去了。' }
  ],
  caiyao: [
    { if: function (G) { return G.questsDone.s2; }, t: '长右安分多了。这林子的雾啊，是树在呼吸——别怕它，读懂它。' },
    { t: '林子深处的雾有毒。你若闻到甜味，就赶紧回头。' }
  ],
  xingzhe: [
    { if: function (G) { return G.flags.boss_yanbo; }, t: '狰睡了，地火顺了。南边的流沙你也去得——顺着岩浆冷掉的黑石子走。' },
    { t: '别踩亮着的地皮。' }
  ],
  shouling: [
    { if: function (G) { return G.flags.boss_youdu; }, t: '蛊雕的影子散了，灯芯稳了。守陵人的夜，终于能打个盹。' },
    { t: '幽都的夜很长。灯别灭，人也别停。' }
  ],
  yufu: [
    { if: function (G) { return G.flags.boss_leize; }, t: '帝江的鼓声停了，雷泽的水面平得像镜子——镜子里的你，像个真正的拾灵人了。' },
    { t: '雷声越近，鱼越肥。但也别贪，雷泽水底下的东西，比鱼老得多。' }
  ]
};

/* ---------------- 成就 ---------------- */
var ACHIEVEMENTS = [
  { id: 'first_catch', name: '初次结契', desc: '捕捉第一只野生灵物', check: function (s) { return s.statCatch >= 1; } },
  { id: 'dex_8', name: '图鉴·入门', desc: '收录 8 种灵物', check: function (s) { return s.dexCaught >= 8; } },
  { id: 'dex_16', name: '图鉴·饱览', desc: '收录 16 种灵物', check: function (s) { return s.dexCaught >= 16; } },
  { id: 'dex_22', name: '图鉴·通志', desc: '收录 22 种灵物', check: function (s) { return s.dexCaught >= 22; } },
  { id: 'boss_1', name: '首胜守护者', desc: '击败任一守护者', check: function (s) { return s.statBossKill >= 1; } },
  { id: 'boss_3', name: '三镇群凶', desc: '累计击败守护者 3 次', check: function (s) { return s.statBossKill >= 3; } },
  { id: 'boss_dijiang', name: '混沌终焉', desc: '击败帝江，见证终章', check: function (s) { return s.killedDijiang; } },
  { id: 'boss_qiongqi', name: '风雪止息', desc: '击败穷奇，风雪之主的传说落幕', check: function (s) { return s.killedQiongqi; } },
  { id: 'boss_zhulong', name: '昼夜各归', desc: '击败烛龙，见证山海的黎明', check: function (s) { return s.killedZhulong; } },
  { id: 'stelae_all', name: '遗刻完璧', desc: '寻得全部八块山海遗刻', check: function (s) { return s.stelaeAll; } },
  { id: 'resonance', name: '元素共鸣', desc: '以三只不同属性的灵物组成共鸣编队', check: function (s) { return s.resonance; } },
  { id: 'plus_6', name: '百炼成钢', desc: '把一件装备强化到 +6', check: function (s) { return s.statPlus6 >= 1; } },
  { id: 'lv_10', name: '小有名气', desc: '冒险者等级达到 10', check: function (s) { return s.lv >= 10; } },
  { id: 'lv_30', name: '山海行者', desc: '冒险者等级达到 30', check: function (s) { return s.lv >= 30; } },
  { id: 'rich', name: '富甲一方', desc: '持有 10000 金', check: function (s) { return s.gold >= 10000; } }
];

/* ---------------- 商店货单 ---------------- */
var SHOP_STOCK = ['huichun', 'dahun', 'ningshen', 'shenquan', 'fusuo', 'chijing', 'shanhaiyin', 'chuansongfu'];
var SMITH_STOCK = ['jian1', 'jian2', 'jian3', 'jian4', 'zhang1', 'zhang2', 'zhang3', 'zhang4', 'gong1', 'gong2', 'gong3', 'gong4', 'yi1', 'yi2', 'yi3', 'yi4', 'mao1', 'mao2', 'mao3', 'mao4', 'xue1', 'xue2', 'xue3', 'xue4', 'pei1', 'pei2', 'pei3', 'pei4', 'fu1', 'fu2', 'fu3', 'fu4'];

/* 行脚商（随机事件）货单：比村里多一档 */
var CARAVAN_STOCK = ['jian3', 'zhang3', 'gong3', 'yi3', 'mao3', 'xue3', 'pei3', 'fu3', 'jian4', 'zhang4', 'gong4', 'yi4', 'mao4', 'xue4', 'pei4', 'fu4', 'shanhaiyin', 'dahun', 'shenquan'];

/* ---------------- 掉落表（按地图主题） ---------------- */
var MAT_DROPS = {
  grass:   [['yaocao', 0.45], ['lingsha', 0.3], ['shougu', 0.2]],
  forest:  [['yaocao', 0.3], ['lingsha', 0.35], ['xuantie', 0.15], ['shougu', 0.2]],
  volcano: [['huohuanyu', 0.3], ['xuantie', 0.35], ['lingsha', 0.2], ['shougu', 0.15]],
  cave:    [['xuantie', 0.4], ['lingsha', 0.3], ['shougu', 0.2], ['leiguang', 0.1]],
  marsh:   [['leiguang', 0.35], ['xuantie', 0.3], ['lingsha', 0.2], ['yaocao', 0.15]],
  snow:    [['bingpo', 0.3], ['leiguang', 0.28], ['xuantie', 0.22], ['yaocao', 0.2]],
  peach:   [['yaocao', 0.4], ['lingsha', 0.3], ['shougu', 0.15], ['xuantie', 0.15]],
  desert:  [['shajin', 0.32], ['xuantie', 0.3], ['lingsha', 0.22], ['shougu', 0.16]],
  abyss:   [['bingpo', 0.3], ['leiguang', 0.28], ['xuantie', 0.22], ['shougu', 0.18]]
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
