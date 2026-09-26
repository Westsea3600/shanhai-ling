/* ============================================================
   《山海拾灵》主循环：状态机 / 相机 / 刷怪 / BOSS 重生
   随机事件 / 委托流转 / 传送 / 存读档 / 渲染管线
   ============================================================ */

var Game = {
  state: 'title',
  W: 960, H: 576,
  player: null,
  pets: [], mobs: [], shots: [], fx: [], floats: [], pickups: [],
  capture: null,
  map: null, mapCache: {},
  cam: { x: 0, y: 0 },
  shakeT: 0, shakeAmp: 0, flashT: 0, flashC: '',
  hurtFlash: 0,                                 /* 玩家受击红闪（独立通道，边缘径向红） */
  hitStopT: 0,                                  /* 顿帧：受击时全局时间减速 */
  time: 0, lastT: 0,
  sched: [],
  petMode: 'attack',
  spirits: [], team: [null, null, null],
  bag: {},
  dex: { seen: {}, caught: {}, beaten: {} },
  quests: {},                     /* {id: {p: 进度, ready}} 激活中 */
  questsDone: {},
  flags: {}, visited: {},
  bossState: {},                  /* {mapId: {alive, t}} */
  event: null, eventCd: 50,
  caravanNpc: null,
  stats: { statCatch: 0, statBossKill: 0, killedDijiang: false, killedQiongqi: false, killedZhulong: false, statPlus6: 0 },
  achv: {},
  playTime: 0,
  interactHint: '',
  bounty: null,                                /* 猎告赏金：{sp, map, n, p, gold, exp} */

  /* ===================== 开局 / 读档 ===================== */
  newGame: function (cls, name) {
    this.state = 'play';
    this.player = new Player(cls, name);
    this.mapCache = {};
    this.spirits = []; this.team = [null, null, null];
    this.bag = { huichun: 3, fusuo: 5, ningshen: 2 };
    var w = { sword: 'jian1', mage: 'zhang1', archer: 'gong1' }[cls];
    this.player.equip.weapon = { id: w, plus: 0 };
    this.player.recalc();
    this.player.hp = this.player.st.hp; this.player.mp = this.player.st.mp;
    this.dex = { seen: {}, caught: {}, beaten: {} };
    this.quests = { m1: { p: 0 } }; this.questsDone = {};
    this.flags = {}; this.visited = {};
    this.bossState = {};
    this.stats = { statCatch: 0, statBossKill: 0, killedDijiang: false, killedQiongqi: false, killedZhulong: false, statPlus6: 0 };
    this.achv = {};
    this.petMode = 'attack';
    this.playTime = 0;
    this.event = null; this.eventCd = 55;
    this.caravanNpc = null;
    this.bounty = null;
    this.gatherRestore = {};
    /* 序章过场（重开新档播一次；继续旅程不再播） */
    var self = this;
    UI.prologue(function () {
      UI.toast('欢迎来到山海世界！WASD 移动，鼠标左键攻击，Q/R 喝药。');
      UI.toast('主线【初试身手】已开始：击败 5 只野生灵物（右上角追踪，J 查看详情）');
      UI.toast('捕捉诀窍：先把灵物打到残血、带上异常状态再按 E——满血硬抓十投九空');
      UI.toast('升级获得灵纹，按 K 修炼技能（3 级起可选道途变种）');
    });
    this.gotoMap('village', 20, 17);
    this.save();
  },

  /* 采集冷却快照/恢复（防重开会话无限刷采集点） */
  snapshotGathers: function () {
    var out = {};
    /* 已被 LRU 淘汰但冷却仍在跑的图，先并入 */
    Object.keys(this.gatherRestore || {}).forEach(function (mid) { out[mid] = this.gatherRestore[mid]; }, this);
    Object.keys(this.mapCache).forEach(function (mid) {
      var gs = this.mapCache[mid].gathers || [];
      var cds = [];
      gs.forEach(function (g, i) { if (!g.ready) cds.push([i, Math.round(g.t)]); });
      if (cds.length) out[mid] = cds;
    }, this);
    return out;
  },
  restoreGathers: function (map) {
    var pend = this.gatherRestore && this.gatherRestore[map.id];
    if (!pend || !map.gathers) return;
    pend.forEach(function (r) {
      if (map.gathers[r[0]]) { map.gathers[r[0]].ready = false; map.gathers[r[0]].t = r[1]; }
    });
    delete this.gatherRestore[map.id];
  },
  gotoMap: function (id, tx, ty) {
    var def = MAPS[id];
    if (!this.mapCache[id]) this.mapCache[id] = new GameMap(id);
    this.map = this.mapCache[id];
    /* 烘焙大图 LRU：全图常驻 ~100MB 画布内存，只留最近 3 张（冷却状态先存档化） */
    var order = this._mapOrder || (this._mapOrder = []);
    if (order.indexOf(id) >= 0) order.splice(order.indexOf(id), 1);
    order.push(id);
    while (order.length > 3) {
      var drop = order.shift();
      if (drop === id) continue;
      if (this.mapCache[drop]) {
        var cds = [];
        (this.mapCache[drop].gathers || []).forEach(function (g, gi) { if (!g.ready) cds.push([gi, Math.round(g.t)]); });
        if (!this.gatherRestore) this.gatherRestore = {};
        if (cds.length) this.gatherRestore[drop] = cds;
        delete this.mapCache[drop];
      }
    }
    this.restoreGathers(this.map);
    if (tx === undefined) {
      var sp = this.map.spawn;
      tx = sp.x; ty = sp.y;
    }
    var free = this.map.nearestFreeTile(tx, ty);
    this.player.x = free.x * TILE + 16;
    this.player.y = free.y * TILE + 16;
    this.player.path = null;
    this.spawnProt = 2.5;                     /* 落地保护：传送门出口常挨着怪群（旧图的怪随数组一起重建，无需清仇恨） */
    this.mobs = []; this.shots = []; this.fx = []; this.floats = []; this.pickups = [];
    this.sched = [];                           /* 旧图的延时弹幕/剑雨不再跟随 */
    this.capture = null;
    this.visited[id] = { x: free.x, y: free.y };
    /* 灵宠跟随传送：血量/濒死状态从记录恢复（不再免费奶满） */
    this.refreshPets();
    this.pets.forEach(function (p) {
      p.x = this.player.x + U.rand(-30, 30);
      p.y = this.player.y + U.rand(-20, 20);
    }, this);
    /* BOSS 状态 */
    if (def.boss && !this.bossState[id]) {
      this.bossState[id] = { alive: !this.flags['boss_' + id], t: 0 };
    }
    this.spawnInitialMobs();
    this.camSnap();
    this.event = null; this.eventCd = U.rand(35, 55);
    this.caravanNpc = null;
    this.save();
    if (UI.open !== 'prologue') UI.toast('来到 ' + def.name + (def.safe ? '（安全区）' : '　推荐等级 Lv.' + def.lv[0] + '-' + def.lv[1]));
  },

  refreshPets: function () {
    var P = this.player;
    /* 先把在场灵宠的实时状态写回记录，重建后才不会"免费满血复活" */
    this.pets.forEach(function (p) {
      p.rec.hp = Math.max(1, Math.round(p.hp));
      p.rec.downT = p.downT > 0 ? p.downT : 0;
    });
    this.pets = [];
    for (var i = 0; i < 3; i++) {
      var uid = this.team[i];
      if (!uid) continue;
      var rec = this.spiritByUid(uid);
      if (!rec) continue;
      var pet = new PetActor(rec, i);
      pet.x = P.x + U.rand(-40, 40); pet.y = P.y + U.rand(-30, 30);
      this.pets.push(pet);
    }
    this.checkResonance();
  },

  /* ===================== 元素共鸣：三只出战灵物属性互异 → 全员 +8% 攻击 ===================== */
  checkResonance: function () {
    var pets = this.pets;
    var had = this.resonance || false;
    this.resonance = pets.length === 3 && (function () {
      var els = pets.map(function (p) { return p.sp.el; });
      return els[0] !== els[1] && els[0] !== els[2] && els[1] !== els[2];
    })();
    if (this.resonance) {
      pets.forEach(function (p) { p.st.atk = Math.round(p.st.atk * 1.08 * 10) / 10; });
      this.player.gainBuff('元素共鸣', { atk: 0.08 }, Infinity);
      if (!had) {
        this.toast('✦ 元素共鸣发动：三属性交汇，全员攻击 +8%');
        this.addFx({ type: 'ring', x: this.player.x, y: this.player.y, r: 10, maxR: 70, t: 0.5, dur: 0.5, color: '#e8c8ff' });
        this.stats.resonance = true;
        this.checkAchv();
      }
    } else if (had) {
      /* 阵容打散：撤 buff（recalc 回落） */
      this.player.buffs = this.player.buffs.filter(function (b) { return b.id !== '元素共鸣'; });
      this.player.recalc();
    }
  },
  spiritByUid: function (uid) {
    return this.spirits.filter(function (s) { return s.uid === uid; })[0] || null;
  },
  addSpirit: function (rec) {
    rec.uid = U.uid();
    this.spirits.push(rec);
    this.dexSeen(rec.sp);
    /* 自动补位：有空位则出战 */
    for (var i = 0; i < 3; i++) {
      if (!this.team[i]) { this.team[i] = rec.uid; break; }
    }
    this.refreshPets();
    /* 共鸣教学：满编但属性重复时提示混编价值 */
    if (this.pets.length === 3 && !this.resonance && !this.flags.hintReso) {
      this.flags.hintReso = 1;
      this.toast('编队小知识：三只互异属性的灵物同队可触发「元素共鸣」（全员攻击 +8%）');
    }
  },

  /* ===================== 刷怪 ===================== */
  spawnInitialMobs: function () {
    var def = this.map.def;
    if (!def.spawn) return;
    for (var i = 0; i < def.maxMob; i++) this.spawnOneMob(true);
    if (def.boss && this.bossState[this.map.id] && this.bossState[this.map.id].alive) this.spawnBoss();
  },
  spawnOneMob: function (initial) {
    var def = this.map.def;
    if (!def.spawn) return;
    var row = U.weighted(def.spawn.map(function (s) { return [s, s[3]]; }));
    var spId = row[0];
    var lv = U.randInt(row[1], row[2]);
    var m = new Monster(spId, lv, { elite: U.chance(0.07) });
    /* 出生点：离玩家 400+ 或全图随机（初始） */
    var tries = 0, tx, ty;
    do {
      tx = U.randInt(3, this.map.w - 4); ty = U.randInt(3, this.map.h - 4);
      tries++;
    } while (tries < 30 && (this.map.isSolid(tx, ty) ||
      (!initial && U.dist2(tx * TILE, ty * TILE, this.player.x, this.player.y) < 400 * 400) ||
      (initial && U.dist2(tx * TILE, ty * TILE, this.player.x, this.player.y) < 260 * 260)));
    m.x = tx * TILE + 16; m.y = ty * TILE + 16;
    m.home = { x: m.x, y: m.y };
    this.mobs.push(m);
  },
  spawnBoss: function () {
    var def = this.map.def;
    var pt = this.map.bossPt;
    var m = new Monster(def.boss.sp, def.boss.lv, { boss: true, hpMul: def.boss.hpMul });
    var free = this.map.nearestFreeTile(pt.x, pt.y);
    m.x = free.x * TILE + 16; m.y = free.y * TILE + 16;
    m.home = { x: m.x, y: m.y };
    this.mobs.push(m);
    SFX.play('boss');
    this.toast('守护者 ' + SPECIES[def.boss.sp].name + ' 现身了！');
  },
  updatePopulation: function (dt) {
    var def = this.map.def;
    if (!def.spawn) return;
    var wild = this.mobs.filter(function (m) { return !m.boss && !m.summoned; }).length;
    if (wild < def.maxMob && U.chance(dt * 0.35)) this.spawnOneMob(false);
    /* 太远的怪清理（BOSS 除外） */
    this.mobs = this.mobs.filter(function (m) {
      if (m.boss) return true;
      if (!m.alive) return false;
      return U.dist2(m.x, m.y, this.player.x, this.player.y) < 1500 * 1500;
    }, this);
    /* BOSS 重生倒计时 */
    var bid = this.map.id;
    if (def.boss && this.bossState[bid] && !this.bossState[bid].alive) {
      this.bossState[bid].t -= dt;
      if (this.bossState[bid].t <= 0) {
        this.bossState[bid].alive = true;
        this.bossState[bid].t = 0;
        this.spawnBoss();
      }
    }
  },

  /* ===================== 事件 ===================== */
  updateEvent: function (dt) {
    var self = this;
    if (this.map.def.safe) { this.event = null; return; }
    if (this.event) {
      this.event.t -= dt;
      if (this.event.t <= 0) {
        this.endEvent();
        return;
      }
      /* 兽潮：每 3 秒把怪拉向玩家（迁徙的温顺灵物除外） */
      if (this.event.type === 'frenzy' && this.event.t > 0) {
        this.mobs.forEach(function (m) {
          if (m.alive && !m.boss && !m.peaceful) { m.aggro = true; m.target = self.player; }
        });
      }
      return;
    }
    this.eventCd -= dt;
    if (this.eventCd <= 0) {
      this.eventCd = U.rand(70, 110);
      if (U.chance(0.6)) this.startEvent();
    }
  },
  startEvent: function () {
    /* 兽潮有等级门槛：Lv6 前不触发（新手保护） */
    var type = U.weighted([['migration', 3], ['frenzy', this.player.lv >= 6 ? 2 : 0], ['caravan', 3], ['treasure', 2]]);
    var self = this;
    if (type === 'migration') {
      this.event = { type: type, t: 40 };
      this.toast('✨ 灵物迁徙：一群温顺的灵物路过此地（40 秒）');
      var def = this.map.def;
      for (var i = 0; i < 6; i++) {
        var rec = U.choice(def.spawn);
        var m = new Monster(rec[0], U.randInt(rec[1], rec[2]), { peaceful: true });
        var ang = Math.random() * 6.28, d = U.rand(260, 420);
        var tx = U.clamp((this.player.x + Math.cos(ang) * d) / TILE, 3, this.map.w - 4) | 0;
        var ty = U.clamp((this.player.y + Math.sin(ang) * d) / TILE, 3, this.map.h - 4) | 0;
        var free = this.map.nearestFreeTile(tx, ty);
        m.x = free.x * TILE + 16; m.y = free.y * TILE + 16;
        m.home = { x: m.x, y: m.y };
        this.mobs.push(m);
      }
    } else if (type === 'frenzy') {
      this.event = { type: type, t: 25 };
      this.toast('⚠ 兽潮涌动：全图灵物躁动来袭！（25 秒）');
      SFX.play('boss');
    } else if (type === 'treasure') {
      /* 藏宝现世：玩家附近散落宝堆（金币/素材/少量装备），45 秒后沉没 */
      this.event = { type: type, t: 45 };
      this.toast('💰 藏宝现世：附近散落了上古遗藏（45 秒后沉没）');
      SFX.play('coin');
      for (var ti = 0; ti < 6; ti++) {
        var tang = Math.random() * 6.28, td = U.rand(60, 260);
        var tx4 = U.clamp(this.player.x + Math.cos(tang) * td, 60, this.map.w * TILE - 60);
        var ty4 = U.clamp(this.player.y + Math.sin(tang) * td, 60, this.map.h * TILE - 60);
        var ft4 = this.map.nearestFreeTile(tx4 / TILE, ty4 / TILE);
        var payload;
        if (ti === 0) {
          var pool = equipDropPool(this.player.lv);
          payload = { equip: { id: U.choice(pool), plus: 0 } };
        } else if (ti < 3) {
          payload = { gold: Math.round((30 + this.player.lv * 12) * U.rand(0.8, 1.4)) };
        } else {
          var tt2 = MAT_DROPS[this.map.def.theme] || MAT_DROPS.grass;
          payload = { item: [U.choice(tt2.map(function (r) { return r[0]; })), 2] };
        }
        var pk = new Pickup(ft4.x * TILE + 16, ft4.y * TILE + 16, payload);
        pk.t = 45;                              /* 与事件同步消失 */
        this.pickups.push(pk);
        this.addFx({ type: 'ring', x: pk.x, y: pk.y, r: 6, maxR: 34, t: 0.6, dur: 0.6, color: '#ffd740' });
      }
    } else {
      this.event = { type: type, t: 45 };
      this.toast('🛒 行脚商队路过：出现了稀有货摊（45 秒）');
      var ang2 = Math.random() * 6.28;
      var cx = U.clamp(this.player.x + Math.cos(ang2) * 160, 60, this.map.w * TILE - 60);
      var cy = U.clamp(this.player.y + Math.sin(ang2) * 160, 60, this.map.h * TILE - 60);
      var fx2 = this.map.nearestFreeTile(cx / TILE, cy / TILE);
      this.caravanNpc = { x: fx2.x * TILE + 16, y: fx2.y * TILE + 16 };
    }
  },
  endEvent: function () {
    if (this.event.type === 'caravan') this.caravanNpc = null;
    if (this.event.type === 'migration') {
      /* 迁徙结束：温顺灵物散去（不再滞留被后续兽潮卷入战斗） */
      this.mobs = this.mobs.filter(function (m) { return !m.peaceful; });
    }
    this.event = null;
  },

  /* ===================== 主循环 ===================== */
  boot: function (canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.lightCv = document.createElement('canvas');
    this.lightCv.width = this.W; this.lightCv.height = this.H;
    Input.init(canvas);
    var self = this;
    UI.boot();
    this._loopTick = 0;
    /* 全屏自适应：画面随窗口走（大屏看得多，小屏看得少），上限防性能炸裂 */
    this.resize();
    if (window.addEventListener) window.addEventListener('resize', function () { self.resize(); });
    requestAnimationFrame(function loop(t) {
      self.loop(t);
      requestAnimationFrame(loop);
    });
    /* rAF 停摆兜底：后台标签页 / 被挂起的 webview 里 rAF 可能整体暂停，
       用 setInterval 保底驱动（检测到 rAF 超过 120ms 没跑才接管） */
    setInterval(function () {
      if (performance.now() - self._loopTick > 120) self.loop(performance.now());
    }, 40);
  },
  resize: function () {
    var w = Math.round(U.clamp((window.innerWidth || 960), 560, 1920));
    var h = Math.round(U.clamp((window.innerHeight || 576), 380, 1200));
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    if (!this.cv) return;                      /* 无头测试桩：只改逻辑尺寸 */
    this.cv.width = w; this.cv.height = h;
    if (this.lightCv) { this.lightCv.width = w; this.lightCv.height = h; }
    this.g = this.cv.getContext('2d');
    if (this.map && this.player) this.camSnap();
  },
  toggleFullscreen: function () {
    try {
      var el = document.getElementById('app') || document.documentElement;
      if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
      else if (el.requestFullscreen) el.requestFullscreen();
    } catch (e) { }
  },
  loop: function (t) {
    this._loopTick = performance.now();
    Input.healStuck(this._loopTick);
    var dt = Math.min(0.05, (t - this.lastT) / 1000 || 0.016);
    this.lastT = t;
    this.time += dt;
    try {
      if (this.state === 'play' && !UI.isOpen() && !this.paused) {
        this.update(dt);
      }
      if (this.state === 'play' || this.state === 'title') this.render();
      if (this.state === 'play') UI.hud();
      UI.updateToasts(dt);
    } catch (e) {
      /* 按错误签名去重上报：同一处错误只刷一次控制台，但新错误不静默 */
      var sig = (e && e.message) || 'unknown';
      if (!this._errLog) this._errLog = {};
      if (!this._errLog[sig]) {
        this._errLog[sig] = 1;
        console.error(e);
      }
    }
    Input.endFrame();
  },
  update: function (dt) {
    /* 顿帧：全局时间减速到 14%（不完全冻结，对齐 demo 手法） */
    if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.14; }
    this.playTime += dt;
    var P = this.player;
    P.update(dt);
    this.pets.forEach(function (p) { p.update(dt); });
    this.mobs.forEach(function (m) { if (m.alive) m.update(dt); });
    var i;
    for (i = 0; i < this.shots.length; i++) this.shots[i].update(dt);
    for (i = 0; i < this.fx.length; i++) this.fx[i].update(dt);
    for (i = 0; i < this.floats.length; i++) this.floats[i].update(dt);
    for (i = 0; i < this.pickups.length; i++) this.pickups[i].update(dt);
    this.shots = this.shots.filter(function (s) { return !s.dead; });
    this.fx = this.fx.filter(function (f) { return !f.dead; });
    this.floats = this.floats.filter(function (f) { return !f.dead; });
    this.pickups = this.pickups.filter(function (p) { return !p.dead; });
    this.mobs = this.mobs.filter(function (m) { return m.alive; });
    /* schedule */
    for (i = this.sched.length - 1; i >= 0; i--) {
      this.sched[i].t -= dt;
      if (this.sched[i].t <= 0) {
        var fn = this.sched[i].fn;
        this.sched.splice(i, 1);
        fn();
      }
    }
    this.updatePopulation(dt);
    this.updateEvent(dt);
    this.updateInteract();
    this.checkHotkeys();
    /* 换图提示：等级超出本图推荐区间且存在可进的更高级图时，提醒一次 */
    if (!this.map.def.safe && P.lv > this.map.def.lv[1] + 2 && !this.flags['hintLv_' + this.map.id]) {
      var up = (this.map.def.portals || []).filter(function (p) { return P.lv >= (p.needLv || 1) && MAPS[p.to].lv[0] > Game.map.def.lv[1]; })[0];
      if (up) {
        this.flags['hintLv_' + this.map.id] = 1;
        this.toast('你已强过这片山泽（Lv.' + P.lv + '）——去传送门看看更高级的猎场吧（主线另有指引时以主线为准）。');
      }
    }
    /* 相机（地图比画面小时居中显示） */
    var txx = P.x - this.W / 2, tyy = P.y - this.H / 2;
    var maxX = this.map.w * TILE - this.W, maxY = this.map.h * TILE - this.H;
    this.cam.x = maxX > 0 ? U.clamp(U.lerp(this.cam.x, txx, Math.min(1, dt * 8)), 0, maxX) : maxX / 2;
    this.cam.y = maxY > 0 ? U.clamp(U.lerp(this.cam.y, tyy, Math.min(1, dt * 8)), 0, maxY) : maxY / 2;
    /* 采集点刷新 */
    (this.map.gathers || []).forEach(function (gd) {
      if (!gd.ready) {
        gd.t -= dt;
        if (gd.t <= 0) gd.ready = true;
      }
    });
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this._fNudgeCd > 0) this._fNudgeCd -= dt;
    if (this.spawnProt > 0) this.spawnProt -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.updateAchv();
  },
  camSnap: function () {
    var maxX = this.map.w * TILE - this.W, maxY = this.map.h * TILE - this.H;
    this.cam.x = maxX > 0 ? U.clamp(this.player.x - this.W / 2, 0, maxX) : maxX / 2;
    this.cam.y = maxY > 0 ? U.clamp(this.player.y - this.H / 2, 0, maxY) : maxY / 2;
  },
  shake: function (amp) { this.shakeT = 0.25; this.shakeAmp = amp; },
  pulseHit: function (dmg) { this.hitStopT = Math.max(this.hitStopT, Math.min(0.055, 0.020 + dmg * 0.0006)); },
  flash: function (c) { this.flashT = 0.3; this.flashC = c; },
  schedule: function (t, fn) { this.sched.push({ t: t, fn: fn }); },

  /* ===================== 交互 ===================== */
  nearestInteract: function () {
    var P = this.player, best = null, bd = 46 * 46;
    (this.map.def.portals || []).forEach(function (p) {
      var d = U.dist2(P.x, P.y, p.x * TILE + 16, p.y * TILE + 16);
      if (d < bd) { bd = d; best = { type: 'portal', p: p }; }
    });
    (this.map.def.npcs || []).forEach(function (n) {
      var d = U.dist2(P.x, P.y, n.x * TILE + 16, n.y * TILE + 16);
      if (d < bd) { bd = d; best = { type: 'npc', n: n }; }
    });
    (this.map.stelae || []).forEach(function (st) {
      var d = U.dist2(P.x, P.y, st.x * TILE + 16, st.y * TILE + 16);
      if (d < bd) { bd = d; best = { type: 'stela', st: st }; }
    });
    (this.map.gathers || []).forEach(function (gd) {
      if (!gd.ready) return;
      var d = U.dist2(P.x, P.y, gd.x, gd.y);
      if (d < bd) { bd = d; best = { type: 'gather', gd: gd }; }
    });
    if (this.map.def.board) {
      var b = this.map.def.board;
      var db = U.dist2(P.x, P.y, b.x * TILE + 16, b.y * TILE + 16);
      if (db < bd) { bd = db; best = { type: 'board' }; }
    }
    if (this.caravanNpc) {
      var d2 = U.dist2(P.x, P.y, this.caravanNpc.x, this.caravanNpc.y);
      if (d2 < bd) { bd = d2; best = { type: 'caravan' }; }
    }
    return best;
  },
  updateInteract: function () {
    var it = this.nearestInteract();
    if (!it) { this.interactHint = ''; return; }
    if (it.type === 'portal') {
      var need = it.p.needLv || 1;
      if (this.player.lv < need) this.interactHint = '【' + it.p.label + '】需要等级 Lv.' + need;
      else this.interactHint = '按 F 前往 ' + it.p.label;
    } else if (it.type === 'npc') {
      this.interactHint = '按 F 与 ' + it.n.name + ' 对话';
    } else if (it.type === 'stela') {
      this.interactHint = this.flags.stelaeFound && this.flags.stelaeFound[it.st.def.id]
        ? it.st.def.name + '（已读过）'
        : '按 F 读取「' + it.st.def.name + '」';
    } else if (it.type === 'gather') {
      this.interactHint = '按 F 采集「' + GATHER_DEFS[it.gd.kind].name + '」';
    } else if (it.type === 'board') {
      this.interactHint = this.bounty && this.bounty.p >= this.bounty.n ? '按 F 领取猎告赏金' : '按 F 查看猎告（赏金委托）';
    } else {
      this.interactHint = '按 F 逛逛行脚商队';
    }
  },
  checkHotkeys: function () {
    var P = this.player;
    if (Input.pressed('KeyE')) Battle.tryCapture(P);
    if (Input.pressed('KeyQ')) UI.usePotion('hp');
    if (Input.pressed('KeyR')) UI.usePotion('mp');
    if (Input.pressed('KeyF')) this.doInteract();
    if (Input.pressed('KeyT')) {
      P.auto = !P.auto;
      this.toast('自动战斗：' + (P.auto ? '开' : '关'));
    }
    if (Input.pressed('KeyH')) {
      this.petMode = { attack: 'defend', defend: 'follow', follow: 'attack' }[this.petMode];
      this.toast('灵宠战术：' + { attack: '进攻', defend: '防守', follow: '跟随' }[this.petMode]);
    }
    if (Input.pressed('KeyB')) UI.openMenu('bag');
    if (Input.pressed('KeyP')) UI.openMenu('spirit');
    if (Input.pressed('KeyJ')) UI.openMenu('quest');
    if (Input.pressed('KeyC')) UI.openMenu('char');
    if (Input.pressed('KeyK')) UI.openMenu('skill');
    if (Input.pressed('KeyM')) UI.openMenu('dex');   /* M 打开图鉴（D 已被向右移动占用） */
    /* Esc/Tab 已由 UI 层 document 监听统一接管（面板开时游戏循环停更，这里读不到） */
    if (Input.pressed('F5')) { this.save(); this.toast('已保存'); }
    /* 右键点地移动（快速单击也要响应：rclicked 一次性标志跨帧不丢） */
    if ((Input.mouse.rdown || Input.mouse.rclicked) && !this._rLatch) {
      this._rLatch = true;
      var wx = Input.mouse.x + this.cam.x, wy = Input.mouse.y + this.cam.y;
      var path = this.map.findPath(P.x, P.y, wx, wy);
      if (path) P.path = path;
    }
    if (!Input.mouse.rdown && !Input.mouse.rclicked) this._rLatch = false;
  },
  doInteract: function () {
    var it = this.nearestInteract();
    if (!it) {
      /* 赶路顺路按 F 时给个轻提示，不再无声无息（寻路中 hint 常为空） */
      if (this._fNudgeCd === undefined || this._fNudgeCd <= 0) {
        this._fNudgeCd = 1.5;
        this.nudge(this.player.x, this.player.y - 44, '附近没有可交互的目标（F 对话/采集/传送）');
      }
      return;
    }
    if (it.type === 'portal') {
      var p = it.p;
      if (this.player.lv < (p.needLv || 1)) {
        this.nudge(this.player.x, this.player.y - 50, '等级不足');
        return;
      }
      SFX.play('portal');
      /* 回到上一张图的入口旁 */
      var back = { tx: 4, ty: 17 };
      if (p.to === 'village') back = { tx: 37, ty: 17 };
      var target = MAPS[p.to];
      if (target.portals) {
        for (var i = 0; i < target.portals.length; i++) {
          if (target.portals[i].to === this.map.id) {
            back = { tx: target.portals[i].x + (target.portals[i].x > target.w / 2 ? -3 : 3), ty: target.portals[i].y };
          }
        }
      }
      this.gotoMap(p.to, back.tx, back.ty);
    } else if (it.type === 'npc') {
      UI.talk(it.n.id);
    } else if (it.type === 'stela') {
      this.readStela(it.st);
    } else if (it.type === 'gather') {
      this.doGather(it.gd);
    } else if (it.type === 'board') {
      UI.openBoard();
    } else {
      UI.openCaravan();
    }
  },

  /* ===================== 采集 ===================== */
  doGather: function (gd) {
    if (!gd.ready) return;
    var def = GATHER_DEFS[gd.kind];
    gd.ready = false;
    gd.t = U.rand(55, 100);
    var n = U.randInt(def.n[0], def.n[1]);
    var gold = U.randInt(def.gold[0], def.gold[1]);
    this.addItem(def.item, n);
    this.player.gold += gold;
    this.addFloat(gd.x, gd.y - 36, def.name + ' +' + n, '#8fe08f', 13);
    this.addFloat(gd.x, gd.y - 20, '+' + gold + ' 金', '#ffd740', 12);
    this.addFx({ type: 'ring', x: gd.x, y: gd.y, r: 4, maxR: 26, t: 0.4, dur: 0.4, color: '#8fe08f' });
    SFX.play('pick');
    this.save();
  },

  /* ===================== 猎告（无限赏金，赚灵石的活计） ===================== */
  genBounty: function () {
    /* 优先已踏足地图；一个野外都没去过时，按等级兜底给邻近图 */
    var maps = Object.keys(this.visited).filter(function (mid) { return MAPS[mid].spawn; });
    if (!maps.length) {
      maps = Object.keys(MAPS).filter(function (mid) {
        return MAPS[mid].spawn && MAPS[mid].lv[0] <= Game.player.lv + 2;
      });
    }
    if (!maps.length) return null;
    var mid = U.choice(maps);
    var row = U.weighted(MAPS[mid].spawn.map(function (r) { return [r, r[3]]; }));
    var rare = row[3] <= 6;
    var n = rare ? U.randInt(2, 4) : U.randInt(5, 10);
    var gold = Math.round((40 + this.player.lv * 9 + n * 8) * (rare ? 1.5 : 1));
    var exp = Math.round(n * (6 + this.player.lv * 1.0) * (rare ? 1.4 : 1));
    return { sp: row[0], map: mid, n: n, p: 0, gold: gold, exp: exp };
  },
  turnInBounty: function () {
    var b = this.bounty;
    if (!b || b.p < b.n) return false;
    this.player.gold += b.gold;
    this.player.exp += b.exp;
    this.addFloat(this.player.x, this.player.y - 50, '+' + b.gold + ' 金（猎告赏金）', '#ffd740', 14);
    while (this.player.lv < LEVEL_CAP && this.player.exp >= expToLevel(this.player.lv)) {
      this.player.exp -= expToLevel(this.player.lv);
      this.player.lv++;
      this.player.skillPts = (this.player.skillPts || 0) + 1;
      this.player.recalc();
      this.player.hp = this.player.st.hp; this.player.mp = this.player.st.mp;
      Game.addFloat(this.player.x, this.player.y - 70, '升级！Lv.' + this.player.lv, '#ffd740', 18);
    }
    this.bounty = null;
    SFX.play('coin');
    this.toast('猎告完成！赏金已入账。可再接新的猎告。');
    this.save();
    return true;
  },

  /* ===================== 山海遗刻 ===================== */
  stelaeCount: function () { return this.flags.stelaeFound ? Object.keys(this.flags.stelaeFound).length : 0; },
  readStela: function (st) {
    if (!this.flags.stelaeFound) this.flags.stelaeFound = {};
    if (this.flags.stelaeFound[st.def.id]) { UI.showStela(st.def, true); return; }
    this.flags.stelaeFound[st.def.id] = 1;
    SFX.play('levelup');
    Game.addFx({ type: 'ring', x: st.x * TILE + 16, y: st.y * TILE + 16, r: 10, maxR: 60, t: 0.6, dur: 0.6, color: '#ffd740' });
    this.questEvent('stelae', {});
    UI.showStela(st.def, false);
    var n = this.stelaeCount();
    if (n === STELAE.length) {
      this.toast('山海遗刻全部寻得！上古拾灵人的手记，如今由你续写。');
      this.flags.stelaeAll = 1;
      this.player.gold += 1000;
      this.addFloat(this.player.x, this.player.y - 50, '+1000 金（遗刻完璧）', '#ffd740', 14);
      /* 先杀烛龙后补碑：此刻补触发真结局判定 */
      if (this.stats.killedZhulong && !this.flags.trueEnding) this.victory();
    } else {
      this.toast('遗刻 ' + n + '/' + STELAE.length + '：「' + st.def.name + '」已录入图经');
    }
    this.save();
  },

  /* ===================== 拾取 ===================== */
  pickup: function (pk) {
    var pl = pk.payload;
    if (pl.gold) {
      this.player.gold += pl.gold;
      SFX.play('coin');
      this.addFloat(this.player.x, this.player.y - 44, '+' + pl.gold + ' 金', '#ffd740', 12);
    } else if (pl.item) {
      this.addItem(pl.item[0], pl.item[1]);
      SFX.play('pick');
    } else if (pl.equip) {
      this.player.equipBag.push({ id: pl.equip.id, plus: pl.equip.plus || 0 });
      SFX.play('pick');
      this.toast('拾取装备【' + equipName(pl.equip.id, pl.equip.plus || 0) + '】');
      this.checkAchv();
    }
  },
  addItem: function (id, n) {
    this.bag[id] = (this.bag[id] || 0) + n;
    this.addFloat(this.player.x, this.player.y - 40, ITEMS[id].name + ' ×' + n, '#cfd8dc', 12);
  },
  useItem: function (id) {
    var def = ITEMS[id];
    if (!def || !(this.bag[id] > 0)) return false;
    var P = this.player;
    if (def.type === 'use') {
      /* 药水/灵果共享 1.2 秒冷却：嗑药不能当无敌 */
      if ((P.itemCd || 0) > 0) { this.nudge(P.x, P.y - 40, '药力未化（稍候）'); return false; }
      /* 灵果：喂给出战灵宠（治疗/复活） */
      if (def.petHeal) {
        if (!this.pets.length) { this.nudge(P.x, P.y - 40, '没有出战灵宠'); return false; }
        var fed = false;
        this.pets.forEach(function (p) {
          if (p.downT > 0) {
            p.downT = 0;
            p.hp = Math.ceil(p.st.hp * (def.revivePct || 0.5));
            Game.addFloat(p.x, p.y - 34, p.sp.name + ' 复苏！', '#8fe08f', 14);
            Game.addFx({ type: 'heal', x: p.x, y: p.y, t: 0.5, dur: 0.5 });
            fed = true;
          } else if (p.hp < p.st.hp) {
            p.hp = Math.min(p.st.hp, p.hp + p.st.hp * def.petHeal);
            Game.addFloat(p.x, p.y - 34, '+' + Math.round(p.st.hp * def.petHeal), '#8fe08f', 12);
            fed = true;
          }
        });
        if (!fed) { this.nudge(P.x, P.y - 40, '灵宠们都状态良好'); return false; }
        SFX.play('heal');
        this.bag[id]--;
        if (this.bag[id] <= 0) delete this.bag[id];
        P.itemCd = 1.2;
        return true;
      }
      if (def.heal || def.healPct) {
        var healAmt = def.heal || Math.round(P.st.hp * def.healPct);
        if (P.hp >= P.st.hp) { this.nudge(P.x, P.y - 40, '生命已满'); return false; }
        P.hp = Math.min(P.st.hp, P.hp + healAmt);
        this.addFloat(P.x, P.y - 44, '+' + healAmt, '#8fe08f', 15);
        this.addFx({ type: 'heal', x: P.x, y: P.y, t: 0.5, dur: 0.5 });
      }
      if (def.mana) {
        if (P.mp >= P.st.mp) { this.nudge(P.x, P.y - 40, '魔力已满'); return false; }
        P.mp = Math.min(P.st.mp, P.mp + def.mana);
        this.addFloat(P.x, P.y - 44, '+' + def.mana + ' MP', '#8fc8f0', 15);
      }
      SFX.play('heal');
      this.bag[id]--;
      if (this.bag[id] <= 0) delete this.bag[id];
      P.itemCd = 1.2;
      return true;
    }
    return false;
  },

  /* ===================== 委托 ===================== */
  questEvent: function (type, data) {
    data = data || {};
    var self = this;
    Object.keys(this.quests).forEach(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      if (!q) return;
      var st = self.quests[qid];
      if (st.done) return;
      var g = q.goal;
      if (g.type === 'kill' && type === 'kill') {
        if (g.any || g.sp === data.sp) {
          if (!g.map || data.map === g.map) st.p++;
        }
      } else if (g.type === 'capture' && type === 'capture') {
        if (g.any || g.sp === data.sp) st.p++;
      } else if (g.type === 'shinyCapture' && type === 'capture') {
        if (data.shiny) st.p++;
      } else if (g.type === 'stelae' && type === 'stelae') {
        st.p = self.stelaeCount();
      } else if (g.type === 'captureOne' && type === 'capture') {
        if (g.sp.indexOf(data.sp) >= 0) st.p++;
      } else if (g.type === 'boss' && type === 'boss') {
        if (g.map === data.map) st.p++;
      }
      if (st.p >= g.n && !st.notified) {
        st.notified = 1;                       /* 只提示一次，不刷屏 */
        self.toast('委托【' + q.name + '】可以交付了（' + questGiveText(q) + '）');
      }
    });
    /* 猎告进度（不限地图，认物种） */
    if (type === 'kill' && this.bounty && data.sp === this.bounty.sp) {
      this.bounty.p++;
      if (this.bounty.p === this.bounty.n) this.toast('猎告目标已清空！回村口猎告牌领赏。');
    }
  },
  questReady: function (q) {
    var st = this.quests[q.id];
    if (!st || st.done) return false;
    var g = q.goal;
    if (g.type === 'item') return (this.bag[g.item] || 0) >= g.n;
    if (g.type === 'dex') return this.dexCaughtCount() >= g.n;
    if (g.type === 'stelae') return this.stelaeCount() >= g.n;
    if (g.type === 'shinyCapture') return st.p >= g.n;
    return st.p >= g.n;
  },
  turnInQuest: function (qid) {
    var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
    if (!q || !this.questReady(q)) return false;
    var g = q.goal;
    if (g.type === 'item') {
      this.bag[g.item] -= g.n;
      if (this.bag[g.item] <= 0) delete this.bag[g.item];
    }
    var r = q.reward || {};
    if (r.gold) this.player.gold += r.gold;
    if (r.items) r.items.forEach(function (it) { Game.addItem(it[0], it[1]); });
    if (r.exp) {
      this.player.exp += r.exp;
      while (this.player.lv < LEVEL_CAP && this.player.exp >= expToLevel(this.player.lv)) {
        this.player.exp -= expToLevel(this.player.lv);
        this.player.lv++;
        this.player.skillPts = (this.player.skillPts || 0) + 1;
        this.player.recalc();
        this.player.hp = this.player.st.hp; this.player.mp = this.player.st.mp;
        Game.addFloat(this.player.x, this.player.y - 60, '升级！Lv.' + this.player.lv, '#ffd740', 18);
      }
    }
    this.quests[qid].done = true;
    this.questsDone[qid] = 1;
    delete this.quests[qid];
    SFX.play('levelup');
    /* 主线后日谈：交付后弹过场对话 */
    if (q.after) {
      UI.afterDialog(q);
    } else {
      this.toast('完成委托【' + q.name + '】！');
    }
    /* 主线链：激活下一条 */
    if (q.main) {
      var next = QUESTS.filter(function (x) { return x.prev === qid; })[0];
      if (next) {
        var p0 = 0;
        /* 任意捕捉型主线：回填此前已完成的捕捉（新手在 m1 期间结的契不算白费） */
        if (next.goal.type === 'capture' && next.goal.any) p0 = Math.min(next.goal.n, this.stats.statCatch);
        this.quests[next.id] = { p: p0 };
        this.toast('新主线：【' + next.name + '】（' + questGiveText(next) + '）' +
          (p0 > 0 ? '（此前结契已计入 ' + p0 + '/' + next.goal.n + '）' : ''));
      }
    }
    this.save();
    return true;
  },
  acceptQuest: function (qid) {
    if (this.quests[qid]) return false;
    var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
    var p0 = 0;
    if (q.goal.type === 'stelae') p0 = this.stelaeCount();
    /* 单杀型 BOSS 委托：先杀后接不卡进度（重杀型 h3 语义不变） */
    if (q.goal.type === 'boss' && q.goal.n === 1 && this.flags['boss_' + q.goal.map]) p0 = 1;
    this.quests[qid] = { p: p0 };
    this.toast('接受委托【' + q.name + '】');
    return true;
  },

  /* ===================== 回调 ===================== */
  onMobKilled: function (mob, killer) {
    this.dexSeen(mob.spId);
    if (mob.boss) {
      var mapId = this.map.id;
      this.stats.statBossKill++;
      this.dexBeat(mob.spId);
      this.flags['boss_' + mapId] = 1;
      this.bossState[mapId] = { alive: false, t: this.map.def.boss.respawn };
      /* 唤魂随主消散：BOSS 倒下后不再留小怪看门 */
      this.mobs = this.mobs.filter(function (m) { return !m.summoned; });
      this.questEvent('boss', { map: mapId, sp: mob.spId });
      this.toast('击败守护者 ' + mob.sp.name + '！');
      if (mob.spId === 'dijiang' && !this.stats.killedDijiang) {
        this.stats.killedDijiang = true;
        this.victory();
      }
      if (mob.spId === 'qiongqi' && !this.stats.killedQiongqi) {
        this.stats.killedQiongqi = true;
        this.toast('风雪止息。北冥的传说落下帷幕。');
      }
      if (mob.spId === 'zhulong' && !this.stats.killedZhulong) {
        this.stats.killedZhulong = true;
        this.victory();
      }
      this.shake(10);
      this.flash('rgba(255,220,120,0.25)');
    } else {
      this.questEvent('kill', { sp: mob.spId, map: this.map.id });
    }
  },
  onPlayerLevel: function (lv) {
    this.checkAchv();
    /* 检查 level 类目标（当前无，保留钩子） */
  },
  onEvolve: function (to) { this.checkAchv(); },
  victory: function () {
    var self = this;
    SFX.play('levelup');
    this.flags.victory = 1;
    /* 真结局：烛龙倒下 + 八块遗刻寻得 */
    if (this.stats.killedZhulong && this.stelaeCount() >= STELAE.length) {
      this.flags.trueEnding = 1;
      UI.showTrueEnding();
    } else {
      UI.showEnding();
    }
  },
  playerDown: function () {
    var self = this;
    if (this._respawning) return;          /* 死亡演出期间不吃二次结算 */
    this._respawning = true;
    this._fadeGen = (this._fadeGen || 0) + 1;   /* 代号：期间发生读档则放弃本次回城 */
    var gen = this._fadeGen;
    this.flash('rgba(120,0,0,0.5)');
    SFX.play('fail');
    /* 死亡代价：损失 5% 现金（复活不再是免费回城券） */
    var lost = Math.floor(this.player.gold * 0.05);
    if (lost > 0) {
      this.player.gold -= lost;
      this.addFloat(this.player.x, this.player.y - 60, '-' + lost + ' 金', '#d89090', 14);
    }
    UI.fade(function () {
      if (self._fadeGen !== gen) return;   /* 已被读档/导档取代：不再覆盖 */
      self._respawning = false;
      self.player.hp = Math.round(self.player.st.hp * 0.7);
      self.player.mp = self.player.st.mp;
      self.player.status = {};
      self.gotoMap('village', 20, 17);
      self.toast('你在昏迷中被村民抬回了落霞村……' + (lost > 0 ? '（诊疗费 ' + lost + ' 金）' : ''));
    });
  },

  /* ===================== 图鉴 / 成就 ===================== */
  dexSeen: function (spId) { if (!this.dex.seen[spId]) this.dex.seen[spId] = 1; },
  dexCaughtUp: function (spId) {
    this.dex.caught[spId] = 1;
    this.dexSeen(spId);
    this.checkAchv();
  },
  dexBeat: function (spId) { this.dex.beaten[spId] = 1; this.dexSeen(spId); this.checkAchv(); },
  dexSeenCount: function () { return Object.keys(this.dex.seen).length; },
  dexCaughtCount: function () { return Object.keys(this.dex.caught).length; },
  updateAchv: function () {
    /* 富甲一方需要实时检查 */
    var self = this;
    ACHIEVEMENTS.forEach(function (a) {
      if (self.achv[a.id]) return;
      var s = {
        statCatch: self.stats.statCatch,
        dexCaught: self.dexCaughtCount(),
        statBossKill: self.stats.statBossKill,
        killedDijiang: self.stats.killedDijiang,
        killedQiongqi: self.stats.killedQiongqi,
        killedZhulong: self.stats.killedZhulong,
        stelaeAll: self.flags.stelaeAll || self.stelaeCount() >= STELAE.length,
        resonance: self.stats.resonance,
        statPlus6: self.stats.statPlus6,
        lv: self.player.lv,
        gold: self.player.gold
      };
      if (a.check(s)) {
        self.achv[a.id] = 1;
        self.toast('🏆 达成成就【' + a.name + '】');
        SFX.play('levelup');
      }
    });
  },
  checkAchv: function () { this.updateAchv(); },

  /* ===================== 存档 ===================== */
  SAVE_KEY: 'shanhai_save_v1',
  save: function () {
    if (!this.player) return;
    /* 灵宠实时状态落盘（防 F5 读档免费满血复活濒死灵宠） */
    this.pets.forEach(function (p) {
      p.rec.hp = Math.max(1, Math.round(p.hp));
      p.rec.downT = p.downT > 0 ? p.downT : 0;
    });
    var data = {
      v: 1,
      name: this.player.name, cls: this.player.cls,
      lv: this.player.lv, exp: this.player.exp, gold: this.player.gold,
      hp: this.player.hp, mp: this.player.mp,
      equip: this.player.equip, equipBag: this.player.equipBag,
      skill: this.player.skill, skillPts: this.player.skillPts,
      bag: this.bag, spirits: this.spirits, team: this.team,
      dex: this.dex, quests: this.quests, questsDone: this.questsDone,
      flags: this.flags, visited: this.visited, bossState: this.bossState,
      petMode: this.petMode, stats: this.stats, achv: this.achv,
      bounty: this.bounty,
      gatherCd: this.snapshotGathers(),
      mapId: this.map ? this.map.id : 'village',
      x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE),
      playTime: this.playTime
    };
    Store.set(this.SAVE_KEY, data);
  },
  load: function () {
    var d = Store.get(this.SAVE_KEY);
    if (!d) return false;
    /* 坏档防线：结构不全/数值坏死的档拒载，继续旅程不静默死机 */
    if (!CLASSES[d.cls]) { Store.del(this.SAVE_KEY); return false; }
    if (!MAPS[d.mapId]) d.mapId = 'village';
    if (typeof d.lv !== 'number' || !isFinite(d.lv) || d.lv < 1) d.lv = 1;
    if (typeof d.hp !== 'number' || !isFinite(d.hp) || d.hp < 1) d.hp = 0;
    if (typeof d.mp !== 'number' || !isFinite(d.mp) || d.mp < 0) d.mp = 0;
    var P = new Player(d.cls, d.name);
    P.lv = d.lv; P.exp = d.exp; P.gold = d.gold;
    P.equip = d.equip || P.equip;
    P.equipBag = d.equipBag || [];
    P.skill = d.skill || {};
    P.skillPts = typeof d.skillPts === 'number' ? d.skillPts : 1;
    P.recalc();
    P.hp = U.clamp(d.hp || P.st.hp, 1, P.st.hp);
    P.mp = U.clamp(d.mp || P.st.mp, 0, P.st.mp);
    this.player = P;
    this.bag = d.bag || {};
    this.spirits = d.spirits || [];
    this.team = d.team || [null, null, null];
    this.dex = d.dex || { seen: {}, caught: {}, beaten: {} };
    this.quests = d.quests || {};
    this.questsDone = d.questsDone || {};
    this.flags = d.flags || {};
    this.visited = d.visited || {};
    this.bossState = d.bossState || {};
    this.petMode = d.petMode || 'attack';
    this.stats = d.stats || this.stats;
    this.achv = d.achv || {};
    this.playTime = d.playTime || 0;
    this.bounty = d.bounty || null;
    this.mapCache = {};                          /* 读档重建地图：防跨档污染 */
    this.gatherRestore = d.gatherCd || {};
    /* 旧档兜底：bossState 缺失字段 */
    Object.keys(MAPS).forEach(function (mid) {
      if (MAPS[mid].boss && !this.bossState[mid]) {
        this.bossState[mid] = { alive: !this.flags['boss_' + mid], t: 0 };
      }
    }, this);
    this.gotoMap(d.mapId || 'village', d.x, d.y);
    this.event = null; this.eventCd = U.rand(35, 55);
    return true;
  },
  exportSave: function () {
    return JSON.stringify(Store.get(this.SAVE_KEY) || {});
  },
  importSave: function (json) {
    var backup = Store.get(this.SAVE_KEY);
    try {
      var d = JSON.parse(json);
      if (!d || !d.cls || !CLASSES[d.cls]) return false;
      /* 清洗：过滤掉引用不存在装备/灵物种族/道具/性格/地图的脏数据，防读档崩溃 */
      if (d.equip) Object.keys(d.equip).forEach(function (k) {
        if (d.equip[k] && !EQUIPS[d.equip[k].id]) d.equip[k] = null;
      });
      if (d.equipBag) d.equipBag = d.equipBag.filter(function (e) { return e && EQUIPS[e.id]; });
      if (d.spirits) d.spirits = d.spirits.filter(function (s) { return s && SPECIES[s.sp]; });
      if (d.spirits) d.spirits.forEach(function (s) {
        if (!TEMPERS[s.temper]) s.temper = 'calm';
        if (typeof s.iv !== 'number') s.iv = 8;
      });
      if (d.bag) {
        var cleanBag = {};
        Object.keys(d.bag).forEach(function (k) { if (ITEMS[k] && d.bag[k] > 0) cleanBag[k] = d.bag[k]; });
        d.bag = cleanBag;
      }
      if (!MAPS[d.mapId]) d.mapId = 'village';
      if (typeof d.x !== 'number' || !isFinite(d.x) || d.x < 1) d.x = 20;
      if (typeof d.y !== 'number' || !isFinite(d.y) || d.y < 1) d.y = 17;
      if (d.team) d.team = d.team.map(function (uid) {
        return d.spirits.some(function (s) { return s.uid === uid; }) ? uid : null;
      });
      Store.set(this.SAVE_KEY, d);
      try {
        return this.load();
      } catch (e) {
        /* 读档失败：回滚到导入前的存档，不能让坏档覆盖掉原进度 */
        if (backup) Store.set(this.SAVE_KEY, backup);
        return false;
      }
    } catch (e) { return false; }
  },

  /* ===================== 反馈工具 ===================== */
  addFloat: function (x, y, text, color, size) {
    if (this.floats.length >= 60) this.floats.shift();   /* 满压场景浮字有上限（对齐 fx=110 口径） */
    this.floats.push(new FloatText(x, y, text, color, size));
  },
  addFx: function (o) { if (this.fx.length < 110) this.fx.push(new Effect(o)); },
  toast: function (text) { UI.toast(text); },
  nudge: function (x, y, text) {
    /* 高频小提示：1.2 秒内同文本去重 */
    var now = this.time;
    if (this._lastNudge && this._lastNudge.text === text && now - this._lastNudge.t < 1.2) return;
    this._lastNudge = { text: text, t: now };
    this.addFloat(x, y, text, '#cfd8dc', 12);
  },

  /* ===================== 渲染 ===================== */
  render: function () {
    var g = this.g;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#141019';
    g.fillRect(0, 0, this.W, this.H);
    if (this.state === 'title' || !this.map) { return; }

    var shx = 0, shy = 0;
    if (this.shakeT > 0) {
      /* 连续正弦振荡（对齐 demo：freq 46 / 46*0.83，线性衰减包络） */
      shx = Math.sin(this.time * 46) * this.shakeAmp * 0.8 * this.shakeT / 0.25;
      shy = Math.cos(this.time * 38) * this.shakeAmp * 0.6 * this.shakeT / 0.25;
    }
    var cam = { x: Math.round(this.cam.x + shx), y: Math.round(this.cam.y + shy) };
    this.rcam = cam;

    /* 1. 地面 */
    this.map.drawGround(g, cam, this.W, this.H);

    /* 2. 传送门 */
    (this.map.def.portals || []).forEach(function (p) {
      var px = p.x * TILE + 16 - cam.x, py = p.y * TILE + 16 - cam.y;
      var ok = Game.player.lv >= (p.needLv || 1);
      g.save();
      g.globalAlpha = 0.85;
      var col = ok ? '#7ec8ff' : '#8a8a96';
      for (var i = 0; i < 3; i++) {
        var rr = 10 + i * 7 + Math.sin(Game.time * 3 + i) * 3;
        g.strokeStyle = U.rgba(col, 0.5 - i * 0.12);
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(px, py, rr, rr * 0.55, 0, 0, 6.28); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = col;
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'center';
      g.fillText(p.label + (ok ? '' : ' Lv' + p.needLv), px, py - 26);
      g.restore();
    });

    /* 3. Y 排序绘制：装饰 / NPC / 怪 / 宠 / 玩家 / 掉落 */
    var draws = [];
    this.map.deco.forEach(function (d) {
      /* 视口裁剪：屏幕外的装饰不进 Y 排序（最大图 200+ 装饰） */
      var dx0 = d.x * TILE - 16 - cam.x, dy0 = d.y * TILE - 48 - cam.y;
      if (dx0 < -70 || dx0 > this.W + 70 || dy0 < -90 || dy0 > this.H + 90) return;
      draws.push({ y: d.y * TILE + 20, fn: function () {
        g.drawImage(Sprites.decoCv(d.kind), dx0, dy0);
      } });
    }, this);
    (this.map.def.npcs || []).forEach(function (n) {
      draws.push({ y: n.y * TILE + 20, fn: function () {
        var cv = Sprites.npcCv(n.face, Math.floor(Game.time * 1.6) % 2);
        g.drawImage(cv, n.x * TILE - 16 - cam.x, n.y * TILE - 34 - cam.y);
        /* 头顶任务标记 */
        var mark = UI.npcMark(n.id);
        if (mark) {
          g.font = 'bold 16px sans-serif'; g.textAlign = 'center';
          g.fillStyle = mark === 'turnin' ? '#ffd740' : '#8fd8ff';
          g.fillText(mark === 'turnin' ? '!' : '?', n.x * TILE + 16 - cam.x, n.y * TILE - 42 - cam.y);
        }
      } });
    });
    if (this.caravanNpc) {
      draws.push({ y: this.caravanNpc.y, fn: function () {
        var cv = Sprites.npcCv('shopper', 0);
        g.drawImage(cv, Game.caravanNpc.x - 16 - cam.x, Game.caravanNpc.y - 34 - cam.y);
        g.drawImage(Sprites.decoCv('stall'), Game.caravanNpc.x - 32 - cam.x, Game.caravanNpc.y - 66 - cam.y);
        g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
        g.fillStyle = '#ffd740';
        g.fillText('行脚商队', Game.caravanNpc.x - cam.x, Game.caravanNpc.y - 52 - cam.y);
      } });
    }
    this.mobs.forEach(function (m) {
      if (m.x < cam.x - 80 || m.x > cam.x + Game.W + 80 || m.y < cam.y - 100 || m.y > cam.y + Game.H + 100) return;
      draws.push({ y: m.y, fn: function () { m.draw(g); } });
    });
    this.pets.forEach(function (p) {
      draws.push({ y: p.y, fn: function () { p.draw(g); } });
    });
    (this.map.gathers || []).forEach(function (gd) {
      if (!gd.ready) return;
      var spr = GATHER_DEFS[gd.kind].sprite;
      draws.push({ y: gd.y, fn: function () {
        g.drawImage(Sprites.decoCv(spr), Math.round(gd.x - 16 - cam.x), Math.round(gd.y - 48 - cam.y));
        /* 采集点微光提示 */
        g.save();
        g.globalAlpha = 0.5 + Math.sin(Game.time * 3 + gd.tx) * 0.25;
        g.fillStyle = '#aef0a0';
        g.fillRect(Math.round(gd.x - 1 - cam.x), Math.round(gd.y - 52 - cam.y), 2, 4);
        g.restore();
      } });
    });
    draws.push({ y: this.player.y, fn: function () { Game.player.draw(g); } });
    this.pickups.forEach(function (p) {
      draws.push({ y: p.y - 14, fn: function () { p.draw(g); } });
    });
    draws.sort(function (a, b) { return a.y - b.y; });
    draws.forEach(function (d) { d.fn(); });

    /* 4. 弹道 / 特效 / 浮字 */
    var i;
    for (i = 0; i < this.shots.length; i++) this.shots[i].draw(g);
    for (i = 0; i < this.fx.length; i++) this.fx[i].draw(g);
    for (i = 0; i < this.floats.length; i++) this.floats[i].draw(g);

    /* 5. 暗光（幽都山） */
    if (this.map.def.dark) {
      var lg = this.lightCv.getContext('2d');
      lg.clearRect(0, 0, this.W, this.H);
      lg.fillStyle = 'rgba(8,6,18,0.46)';
      lg.fillRect(0, 0, this.W, this.H);
      /* 光洞用预烘焙径向贴图缩放绘制（替代每帧 20+ 个 RadialGradient） */
      if (!Game._holeCv) {
        var hc = document.createElement('canvas');
        hc.width = 128; hc.height = 128;
        var hg2 = hc.getContext('2d');
        var hgrad = hg2.createRadialGradient(64, 64, 12, 64, 64, 64);
        hgrad.addColorStop(0, 'rgba(0,0,0,1)');
        hgrad.addColorStop(1, 'rgba(0,0,0,0)');
        hg2.fillStyle = hgrad;
        hg2.beginPath(); hg2.arc(64, 64, 64, 0, 6.28); hg2.fill();
        Game._holeCv = hc;
      }
      lg.globalCompositeOperation = 'destination-out';
      function hole(x, y, r) {
        lg.drawImage(Game._holeCv, x - cam.x - r, y - cam.y - r, r * 2, r * 2);
      }
      hole(this.player.x, this.player.y, 330);
      this.map.lights.forEach(function (L) { hole(L.x, L.y, L.r); });
      this.mobs.forEach(function (m) { if (m.alive) hole(m.x, m.y, 70); });
      lg.globalCompositeOperation = 'source-over';
      g.drawImage(this.lightCv, 0, 0);
    }

    /* 5.5 环境氛围：主题色罩 + 环境粒子 + 暗角 */
    this.drawAmbient(g);

    /* 6. 屏闪 */
    if (this.flashT > 0) {
      g.fillStyle = this.flashC;
      g.globalAlpha = U.clamp(this.flashT / 0.3, 0, 1);
      g.fillRect(0, 0, this.W, this.H);
      g.globalAlpha = 1;
    }

    /* 7. 低血警告 */
    var hpPct = this.player.hp / this.player.st.hp;
    if (hpPct < 0.3) {
      g.strokeStyle = 'rgba(220,50,40,' + (0.35 + Math.sin(this.time * 6) * 0.2) + ')';
      g.lineWidth = 24;
      g.strokeRect(0, 0, this.W, this.H);
    }

    /* 7.5 玩家受击红闪：边缘径向红 vignette（demo 手法，独立于 flashC） */
    if (this.hurtFlash > 0) {
      var hf = U.clamp(this.hurtFlash / 0.35, 0, 1);
      var hg = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.34, this.W / 2, this.H / 2, this.H * 0.85);
      hg.addColorStop(0, 'rgba(200,16,16,0)');
      hg.addColorStop(1, 'rgba(200,16,16,' + (0.55 * hf).toFixed(2) + ')');
      g.fillStyle = hg;
      g.fillRect(0, 0, this.W, this.H);
    }

    /* 8. 小地图（右下角，避开右上角的委托追踪/BOSS 倒计时） */
    var mm = 130;
    var mx = this.W - mm - 10, my = this.H - mm - 10;
    g.globalAlpha = 0.85;
    g.fillStyle = '#141019';
    g.fillRect(mx - 3, my - 3, mm + 6, mm + 6);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.map.miniCv, mx, my, mm, mm);
    /* 传送门/玩家/NPC/BOSS */
    function dot(wx, wy, color, s) {
      var dx = mx + wx / (Game.map.w * TILE) * mm, dy = my + wy / (Game.map.h * TILE) * mm;
      g.fillStyle = color;
      g.fillRect(dx - s / 2, dy - s / 2, s, s);
    }
    (this.map.def.portals || []).forEach(function (p) { dot(p.x * TILE, p.y * TILE, '#7ec8ff', 4); });
    (this.map.def.npcs || []).forEach(function (p) { dot(p.x * TILE, p.y * TILE, '#ffd740', 3); });
    this.mobs.forEach(function (m) { if (m.boss) dot(m.x, m.y, '#ff5040', 5); });
    dot(this.player.x, this.player.y, '#ffffff', 4);
    g.globalAlpha = 1;

    /* 9. 交互提示 */
    if (this.interactHint) {
      g.font = '13px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(16,12,24,0.75)';
      var w = g.measureText(this.interactHint).width + 20;
      g.fillRect(this.W / 2 - w / 2, this.H - 96, w, 22);
      g.fillStyle = '#ffe9b8';
      g.fillText(this.interactHint, this.W / 2, this.H - 81);
    }
    /* 10. 捕捉准星提示（与 tryCapture 共用同一目标选择，绝不各说各话） */
    var capTarget = null;
    if (!this.capture) capTarget = Battle.captureTarget(this.player, 300);
    if (capTarget) {
      var cxx = capTarget.x - cam.x, cyy = capTarget.y - capTarget.r - 54 - cam.y;
      g.font = '11px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      var ball0 = Battle.bestBall();
      var rateTxt = ball0 ? Math.round(U.clamp(Battle.captureRate(capTarget, ball0), 0, 1) * 100) + '%' : '无索';
      g.fillStyle = 'rgba(16,12,24,0.6)';
      var tw = g.measureText('E 捕捉 ' + rateTxt).width + 10;
      g.fillRect(cxx - tw / 2, cyy - 11, tw, 15);
      g.fillStyle = capTarget.hp < capTarget.st.hp * 0.35 ? '#a0f0a0' : 'rgba(255,220,140,0.9)';
      g.fillText('E 捕捉 ' + rateTxt, cxx, cyy);
    }
  },

  /* ===================== 环境氛围层 =====================
     主题色罩 + 环境粒子（雪落/火星/萤浮）+ 常驻暗角。
     粒子为纯时间函数（无状态），不参与 update。 */
  drawAmbient: function (g) {
    var amb = THEME_AMBIENT[this.map.def.theme];
    if (!amb) return;
    if (amb.tint) {
      g.fillStyle = amb.tint;
      g.fillRect(0, 0, this.W, this.H);
    }
    var dust = amb.dust;
    if (dust) {
      var theme = this.map.def.theme;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < dust[1]; i++) {
        var seed = i * 137.51;
        var baseX = (Math.sin(seed) * 0.5 + 0.5) * this.W;
        var baseY = (Math.sin(seed * 1.7) * 0.5 + 0.5) * this.H;
        var px, py, sz, al;
        if (theme === 'snow') {
          /* 雪：斜落 + 风摆 */
          var fall = (this.time * (34 + (i % 7) * 9) + seed * 5) % (this.H + 20) - 10;
          px = baseX + Math.sin(this.time * 1.1 + i) * 26;
          py = fall;
          sz = 1.5 + (i % 3) * 0.8;
          al = 0.5 + (i % 4) * 0.1;
          g.fillStyle = '#ffffff';
        } else if (theme === 'peach') {
          /* 花瓣：慢速飘落 + 大幅风摆，粉白双色 */
          var pfall = (this.time * (18 + (i % 5) * 6) + seed * 9) % (this.H + 24) - 12;
          px = baseX + Math.sin(this.time * 0.9 + i * 1.3) * 40;
          py = pfall;
          sz = 2.5 + (i % 2);
          al = 0.55 + (i % 3) * 0.12;
          g.fillStyle = i % 3 === 0 ? '#fae0e8' : '#f2b0c8';
        } else if (theme === 'volcano') {
          /* 火星：上升 + 摇曳，1/3 金色 */
          var rise = (this.time * (30 + (i % 5) * 10) + seed * 7) % (this.H + 30);
          px = baseX + Math.sin(this.time * 2.2 + i * 1.9) * 14;
          py = this.H - rise + 15;
          sz = 1.5 + (i % 3);
          al = 0.35 + (i % 3) * 0.12;
          g.fillStyle = i % 3 === 0 ? '#ffd060' : '#ff8040';
        } else {
          /* 萤尘：缓慢漂浮 */
          px = baseX + Math.cos(this.time * 0.6 + i * 1.7) * 16;
          py = baseY + Math.sin(this.time * 0.8 + i * 2.3) * 20;
          sz = 1.5;
          al = 0.18 + Math.sin(this.time * 1.5 + i) * 0.08 + 0.1;
          g.fillStyle = dust[0];
        }
        g.globalAlpha = al;
        g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      g.restore();
    }
    /* 常驻暗角（色调随主题，避免黑框与主题色打架） */
    var vg = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.42, this.W / 2, this.H / 2, this.H * 0.94);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(' + (amb.vg || '0,0,0') + ',' + amb.darkV + ')');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.W, this.H);
  }
};
