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
  stats: { statCatch: 0, statBossKill: 0, killedDijiang: false, statPlus6: 0 },
  achv: {},
  playTime: 0,
  interactHint: '',

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
    this.stats = { statCatch: 0, statBossKill: 0, killedDijiang: false, statPlus6: 0 };
    this.achv = {};
    this.petMode = 'attack';
    this.playTime = 0;
    this.event = null; this.eventCd = 55;
    this.caravanNpc = null;
    UI.toast('欢迎来到山海世界！按 F 与村民对话，WASD 移动。');
    this.gotoMap('village', 20, 17);
    this.save();
  },

  gotoMap: function (id, tx, ty) {
    var def = MAPS[id];
    if (!this.mapCache[id]) this.mapCache[id] = new GameMap(id);
    this.map = this.mapCache[id];
    if (tx === undefined) {
      var sp = this.map.spawn;
      tx = sp.x; ty = sp.y;
    }
    var free = this.map.nearestFreeTile(tx, ty);
    this.player.x = free.x * TILE + 16;
    this.player.y = free.y * TILE + 16;
    this.player.path = null;
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
    UI.toast('来到 ' + def.name + (def.safe ? '（安全区）' : '　推荐等级 Lv.' + def.lv[0] + '-' + def.lv[1]));
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
    var type = U.weighted([['migration', 3], ['frenzy', 2], ['caravan', 3]]);
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
  loop: function (t) {
    this._loopTick = performance.now();
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
      if (!this._errOnce) { this._errOnce = true; console.error(e); }
    }
    Input.endFrame();
  },
  update: function (dt) {
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
    /* 相机 */
    var txx = P.x - this.W / 2, tyy = P.y - this.H / 2;
    this.cam.x = U.clamp(U.lerp(this.cam.x, txx, Math.min(1, dt * 8)), 0, this.map.w * TILE - this.W);
    this.cam.y = U.clamp(U.lerp(this.cam.y, tyy, Math.min(1, dt * 8)), 0, this.map.h * TILE - this.H);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.updateAchv();
  },
  camSnap: function () {
    this.cam.x = U.clamp(this.player.x - this.W / 2, 0, this.map.w * TILE - this.W);
    this.cam.y = U.clamp(this.player.y - this.H / 2, 0, this.map.h * TILE - this.H);
  },
  shake: function (amp) { this.shakeT = 0.25; this.shakeAmp = amp; },
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
    if (Input.pressed('KeyM')) UI.openMenu('dex');   /* M 打开图鉴（D 已被向右移动占用） */
    /* Esc/Tab 已由 UI 层 document 监听统一接管（面板开时游戏循环停更，这里读不到） */
    if (Input.pressed('F5')) { this.save(); this.toast('已保存'); }
    /* 右键点地移动 */
    if (Input.mouse.rdown && !this._rLatch) {
      this._rLatch = true;
      var wx = Input.mouse.x + this.cam.x, wy = Input.mouse.y + this.cam.y;
      var path = this.map.findPath(P.x, P.y, wx, wy);
      if (path) P.path = path;
    }
    if (!Input.mouse.rdown) this._rLatch = false;
  },
  doInteract: function () {
    var it = this.nearestInteract();
    if (!it) return;
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
    } else {
      UI.openCaravan();
    }
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
      if (def.heal) {
        if (P.hp >= P.st.hp) { this.nudge(P.x, P.y - 40, '生命已满'); return false; }
        P.hp = Math.min(P.st.hp, P.hp + def.heal);
        this.addFloat(P.x, P.y - 44, '+' + def.heal, '#8fe08f', 15);
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
  },
  questReady: function (q) {
    var st = this.quests[q.id];
    if (!st || st.done) return false;
    var g = q.goal;
    if (g.type === 'item') return (this.bag[g.item] || 0) >= g.n;
    if (g.type === 'dex') return this.dexCaughtCount() >= g.n;
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
        this.player.recalc();
        this.player.hp = this.player.st.hp; this.player.mp = this.player.st.mp;
        Game.addFloat(this.player.x, this.player.y - 60, '升级！Lv.' + this.player.lv, '#ffd740', 18);
      }
    }
    this.quests[qid].done = true;
    this.questsDone[qid] = 1;
    delete this.quests[qid];
    SFX.play('levelup');
    this.toast('完成委托【' + q.name + '】！');
    /* 主线链：激活下一条 */
    if (q.main) {
      var next = QUESTS.filter(function (x) { return x.prev === qid; })[0];
      if (next) {
        this.quests[next.id] = { p: 0 };
        this.toast('新主线：【' + next.name + '】（' + questGiveText(next) + '）');
      }
    }
    this.save();
    return true;
  },
  acceptQuest: function (qid) {
    if (this.quests[qid]) return false;
    this.quests[qid] = { p: 0 };
    var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
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
      this.questEvent('boss', { map: mapId, sp: mob.spId });
      this.toast('击败守护者 ' + mob.sp.name + '！');
      if (mob.spId === 'dijiang' && !this.stats.killedDijiang) {
        this.stats.killedDijiang = true;
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
    UI.showEnding();
  },
  playerDown: function () {
    var self = this;
    if (this._respawning) return;          /* 死亡演出期间不吃二次结算 */
    this._respawning = true;
    this.flash('rgba(120,0,0,0.5)');
    SFX.play('fail');
    UI.fade(function () {
      self._respawning = false;
      self.player.hp = Math.round(self.player.st.hp * 0.7);
      self.player.mp = self.player.st.mp;
      self.player.status = {};
      self.gotoMap('village', 20, 17);
      self.toast('你在昏迷中被村民抬回了落霞村……');
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
    var data = {
      v: 1,
      name: this.player.name, cls: this.player.cls,
      lv: this.player.lv, exp: this.player.exp, gold: this.player.gold,
      hp: this.player.hp, mp: this.player.mp,
      equip: this.player.equip, equipBag: this.player.equipBag,
      bag: this.bag, spirits: this.spirits, team: this.team,
      dex: this.dex, quests: this.quests, questsDone: this.questsDone,
      flags: this.flags, visited: this.visited, bossState: this.bossState,
      petMode: this.petMode, stats: this.stats, achv: this.achv,
      mapId: this.map ? this.map.id : 'village',
      x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE),
      playTime: this.playTime
    };
    Store.set(this.SAVE_KEY, data);
  },
  load: function () {
    var d = Store.get(this.SAVE_KEY);
    if (!d) return false;
    var P = new Player(d.cls, d.name);
    P.lv = d.lv; P.exp = d.exp; P.gold = d.gold;
    P.equip = d.equip || P.equip;
    P.equipBag = d.equipBag || [];
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
    try {
      var d = JSON.parse(json);
      if (!d || !d.cls || !CLASSES[d.cls]) return false;
      /* 清洗：过滤掉引用不存在装备/灵物种族的脏数据，防读档崩溃 */
      if (d.equip) Object.keys(d.equip).forEach(function (k) {
        if (d.equip[k] && !EQUIPS[d.equip[k].id]) d.equip[k] = null;
      });
      if (d.equipBag) d.equipBag = d.equipBag.filter(function (e) { return e && EQUIPS[e.id]; });
      if (d.spirits) d.spirits = d.spirits.filter(function (s) { return s && SPECIES[s.sp]; });
      if (d.team) d.team = d.team.map(function (uid) {
        return d.spirits.some(function (s) { return s.uid === uid; }) ? uid : null;
      });
      Store.set(this.SAVE_KEY, d);
      return this.load();
    } catch (e) { return false; }
  },

  /* ===================== 反馈工具 ===================== */
  addFloat: function (x, y, text, color, size) { this.floats.push(new FloatText(x, y, text, color, size)); },
  addFx: function (o) { this.fx.push(new Effect(o)); },
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
      shx = Math.sin(this.time * 70) * this.shakeAmp * this.shakeT / 0.25;
      shy = Math.cos(this.time * 63) * this.shakeAmp * this.shakeT / 0.25;
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
      draws.push({ y: d.y * TILE + 20, fn: function () {
        g.drawImage(Sprites.decoCv(d.kind), d.x * TILE - 16 - cam.x, d.y * TILE - 48 - cam.y);
      } });
    });
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
      lg.fillStyle = 'rgba(8,6,18,0.74)';
      lg.fillRect(0, 0, this.W, this.H);
      function hole(x, y, r) {
        var grad = lg.createRadialGradient(x - cam.x, y - cam.y, r * 0.2, x - cam.x, y - cam.y, r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        lg.globalCompositeOperation = 'destination-out';
        lg.fillStyle = grad;
        lg.beginPath(); lg.arc(x - cam.x, y - cam.y, r, 0, 6.28); lg.fill();
        lg.globalCompositeOperation = 'source-over';
      }
      hole(this.player.x, this.player.y, 300);
      this.map.lights.forEach(function (L) { hole(L.x, L.y, L.r); });
      this.mobs.forEach(function (m) { if (m.alive) hole(m.x, m.y, 60); });
      g.drawImage(this.lightCv, 0, 0);
    }

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
    /* 10. 捕捉准星提示 */
    if (Input.pressed) { }
    var capTarget = null;
    if (!this.capture) {
      for (var c = 0; c < this.mobs.length; c++) {
        var mm2 = this.mobs[c];
        if (mm2.alive && !mm2.boss && !mm2.summoned && U.dist2(mm2.x, mm2.y, this.player.x, this.player.y) < 300 * 300) { capTarget = mm2; break; }
      }
    }
    if (capTarget) {
      var cxx = capTarget.x - cam.x, cyy = capTarget.y - capTarget.r - 54 - cam.y;
      g.font = '11px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,220,140,0.9)';
      g.fillText('E 捕捉', cxx, cyy);
    }
  }
};
