/* ============================================================
   《山海拾灵》实体层：Actor 基类 / 玩家 / 灵宠 / 魔物(含BOSS)
   弹道 / 捕捉索 / 特效 / 浮字 / 掉落物
   依赖全局 Game（game.js 提供 mobs/pets/shots/fx/floats/pickups）
   ============================================================ */

/* ---------------- Actor 基类 ---------------- */
function Actor() {
  this.x = 0; this.y = 0; this.r = 12;
  this.vx = 0; this.vy = 0;
  this.kx = 0; this.ky = 0;               /* 击退 */
  this.face = 1;                           /* 1 右 -1 左 */
  this.walkT = 0;
  this.status = {};                        /* burn/poison/slow/shock/stun/root */
  this.hurtT = 0;                          /* 受击闪白计时 */
  this.alive = true;
}
Actor.prototype.tickStatus = function (dt) {
  var self = this, ticked = false;
  Object.keys(this.status).forEach(function (k) {
    var s = self.status[k];
    if (!s) return;
    s.t -= dt;
    if (s.t <= 0) { delete self.status[k]; return; }
    if (k === 'burn') {
      s.tick = (s.tick || 0) - dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        Battle.dotDamage(self, s.src, 'burn', 0.12);
      }
    } else if (k === 'poison') {
      s.tick = (s.tick || 0) - dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        Battle.dotDamage(self, s.src, 'poison', 0.06 * (s.stacks || 1));
      }
    }
  });
  /* 引导/受击计时 */
  if (this.hurtT > 0) this.hurtT -= dt;
};
Actor.prototype.applyStatus = function (id, src, dur) {
  if (!STATUS[id]) return;
  var s = this.status[id];
  if (s) {
    s.t = Math.max(s.t, dur);
    if (id === 'poison') s.stacks = Math.min(5, (s.stacks || 1) + 1);
    if (!s.src) s.src = src;
  } else {
    s = { t: dur, src: src, tick: 0.5 };
    if (id === 'poison') s.stacks = 1;
    this.status[id] = s;
  }
};
Actor.prototype.statusList = function () {
  var out = [];
  Object.keys(this.status).forEach(function (k) { if (k) out.push(k); });
  return out;
};
Actor.prototype.isStunned = function () { return !!this.status.stun; };
Actor.prototype.isRooted = function () { return !!this.status.root; };
Actor.prototype.speedMul = function () { return this.status.slow ? 0.65 : 1; };
/* 逐轴移动 + 击退 */
Actor.prototype.moveBy = function (dx, dy) {
  var map = Game.map;
  if (dx) {
    var nx = this.x + dx;
    if (!map.hitAt(nx, this.y, this.r)) this.x = nx;
  }
  if (dy) {
    var ny = this.y + dy;
    if (!map.hitAt(this.x, ny, this.r)) this.y = ny;
  }
  this.x = U.clamp(this.x, this.r + 8, map.w * TILE - this.r - 8);
  this.y = U.clamp(this.y, this.r + 8, map.h * TILE - this.r - 8);
};
Actor.prototype.applyKnock = function (ang, power) {
  this.kx += Math.cos(ang) * power;
  this.ky += Math.sin(ang) * power;
};
Actor.prototype.tickKnock = function (dt) {
  if (this.kx || this.ky) {
    this.moveBy(this.kx * dt, this.ky * dt);
    this.kx *= Math.pow(0.001, dt);
    this.ky *= Math.pow(0.001, dt);
    if (Math.abs(this.kx) < 2) this.kx = 0;
    if (Math.abs(this.ky) < 2) this.ky = 0;
  }
};
Actor.prototype.drawShadow = function (g) {
  g.fillStyle = 'rgba(16,10,20,0.40)';
  g.beginPath();
  g.ellipse(this.x - Game.cam.x, this.y - Game.cam.y + this.r * 0.9, this.r * 1.05, this.r * 0.42, 0, 0, Math.PI * 2);
  g.fill();
};

/* ---------------- 玩家 ---------------- */
function Player(clsId, name) {
  Actor.call(this);
  this.kind = 'player';
  this.cls = clsId; this.name = name || '无名客';
  this.lv = 1; this.exp = 0; this.gold = 120;
  this.hp = 0; this.mp = 0;
  this.st = { hp: 1, mp: 1, atk: 1, def: 1, spd: 120, crit: 0.05 };
  this.equip = { weapon: null, armor: null, head: null, feet: null, amulet: null, charm: null };
  this.equipBag = [];                       /* [{id, plus}] */
  this.cd = {};
  this.buffs = [];                          /* [{id, stats:{}, t}] */
  this.shield = 0;
  this.aim = 0;
  this.regenT = 0;
  this.combatT = 0;                         /* >0 视为战斗中（回魔打折） */
  this.auto = false;
  this.skill = {};                          /* 修炼：{sid: {lv, path}} */
  this.skillPts = 1;                        /* 灵纹：技能修炼点 */
  this.comboN = 0; this.comboT = 0;         /* 剑客被动：剑意层数 */
  this.recalc();
  this.hp = this.st.hp; this.mp = this.st.mp;
}
Player.prototype = Object.create(Actor.prototype);

Player.prototype.skills = function () {
  var self = this;
  return CLASSES[this.cls].skills.filter(function (s) { return s[0] <= self.lv; }).map(function (s) { return s[1]; });
};
/* 修炼后的有效技能（未修炼返回原始定义；pets/mobs 不走这里） */
Player.prototype.effSkill = function (sid) {
  var st = this.skill[sid];
  if (!st || !st.lv || st.lv <= 1) return SKILLS[sid];
  if (!this._effCache) this._effCache = {};
  var key = sid + '|' + st.lv + '|' + (st.path || '');
  if (!this._effCache[key]) this._effCache[key] = skillUpgradeDef(sid, st.lv, st.path);
  return this._effCache[key];
};
/* 修炼：path 在 2→3 级时必选；返回 true 表示成功 */
Player.prototype.skillUp = function (sid, path) {
  var st = this.skill[sid] || (this.skill[sid] = { lv: 1, path: null });
  if (st.lv >= SKILL_MAX_LV) return false;
  if (this.skillPts < 1) return false;
  var needPath = st.lv === 2;
  if (needPath && !SKILL_PATHS[path]) return false;
  if (needPath) st.path = path;
  this.skillPts--;
  st.lv++;
  this._effCache = null;
  return true;
};
Player.prototype.tier = function () {
  /* 立绘档位：已穿的最高档（寒铁 lv30 → 3） */
  var best = 0;
  Object.keys(this.equip).forEach(function (k) {
    var e = this.equip[k];
    if (!e) return;
    var t = EQUIPS[e.id].lv >= 30 ? 3 : EQUIPS[e.id].lv >= 20 ? 2 : EQUIPS[e.id].lv >= 10 ? 1 : 0;
    best = Math.max(best, t);
  }, this);
  return best;
};
Player.prototype.recalc = function () {
  var cls = CLASSES[this.cls], lv = this.lv;
  var st = {
    hp: cls.base.hp + cls.grow.hp * (lv - 1),
    mp: cls.base.mp + cls.grow.mp * (lv - 1),
    atk: cls.base.atk + cls.grow.atk * (lv - 1),
    def: cls.base.def + cls.grow.def * (lv - 1),
    spd: cls.base.spd + cls.grow.spd * (lv - 1),
    crit: 0.05 + (this.cls === 'archer' ? 0.05 : 0)   /* 鹰眼：弓手暴击 +5% */
  };
  Object.keys(this.equip).forEach(function (k) {
    var e = this.equip[k];
    if (!e) return;
    var es = equipStats(EQUIPS[e.id], e.plus || 0);
    ['atk', 'def', 'hp', 'mp', 'spd', 'crit'].forEach(function (s) {
      if (es[s]) st[s] += es[s];
    });
  }, this);
  /* 增益 */
  this.buffs.forEach(function (b) {
    Object.keys(b.stats || {}).forEach(function (s) {
      if (st[s] !== undefined) st[s] *= (1 + b.stats[s]);
    });
  });
  st.hp = Math.round(st.hp); st.mp = Math.round(st.mp);
  st.atk = Math.round(st.atk * 10) / 10; st.def = Math.round(st.def * 10) / 10;
  st.spd = Math.round(st.spd); st.crit = Math.round(st.crit * 100) / 100;
  this.st = st;
  this.hp = Math.min(this.hp, st.hp);
  this.mp = Math.min(this.mp, st.mp);
};
Player.prototype.gainBuff = function (id, stats, dur) {
  var exist = this.buffs.filter(function (b) { return b.id === id; })[0];
  if (exist) { exist.t = Math.max(exist.t, dur); return; }
  this.buffs.push({ id: id, stats: stats, t: dur });
  this.recalc();
};
Player.prototype.update = function (dt) {
  var st = this.st;
  /* 冷却与增益 */
  var keys = Object.keys(this.cd);
  for (var i = 0; i < keys.length; i++) if (this.cd[keys[i]] > 0) this.cd[keys[i]] -= dt;
  var expired = false;
  this.buffs.forEach(function (b) { b.t -= dt; if (b.t <= 0) expired = true; });
  if (expired) { this.buffs = this.buffs.filter(function (b) { return b.t > 0; }); this.recalc(); }
  if (this.combatT > 0) this.combatT -= dt;
  /* 剑意衰减：4 秒未命中清零 */
  if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.comboN = 0; }

  this.tickStatus(dt);
  this.tickKnock(dt);
  if (!this.alive) return;
  if (this.isStunned()) { this.walkT = 0; return; }

  /* --- 移动 --- */
  var mx = 0, my = 0;
  if (Input.down('KeyW') || Input.down('ArrowUp')) my -= 1;
  if (Input.down('KeyS') || Input.down('ArrowDown')) my += 1;
  if (Input.down('KeyA') || Input.down('ArrowLeft')) mx -= 1;
  if (Input.down('KeyD') || Input.down('ArrowRight')) mx += 1;
  if (mx || my) {
    this.path = null;                       /* 手动移动打断点地路径 */
    var len = Math.sqrt(mx * mx + my * my);
    var spd = st.spd * this.speedMul();
    if (!this.isRooted()) this.moveBy(mx / len * spd * dt, my / len * spd * dt);
    this.walkT += dt * 8;
  } else if (this.path && this.path.length && !this.isRooted()) {
    /* 点地移动 */
    var wp = this.path[0];
    var d = U.dist(this.x, this.y, wp.x, wp.y);
    if (d < 10) {
      this.path.shift();
      if (!this.path.length) this.path = null;
    } else {
      var spd2 = st.spd * this.speedMul();
      var ang = U.ang(this.x, this.y, wp.x, wp.y);
      var ox = this.x, oy = this.y;
      this.moveBy(Math.cos(ang) * spd2 * dt, Math.sin(ang) * spd2 * dt);
      if (U.dist(ox, oy, this.x, this.y) < spd2 * dt * 0.25) this.pathT = (this.pathT || 0) + dt;
      else this.pathT = 0;
      if (this.pathT > 0.7) { this.path = null; this.pathT = 0; }   /* 卡住放弃 */
      this.walkT += dt * 8;
    }
  } else {
    this.walkT = 0;
  }

  /* --- 朝向准星 --- */
  var wx = Input.mouse.x + Game.cam.x, wy = Input.mouse.y + Game.cam.y;
  this.aim = U.ang(this.x, this.y, wx, wy);
  var target = null;
  if (this.auto) {
    target = Battle.nearestMob(this.x, this.y, 520);
    if (target) this.aim = U.ang(this.x, this.y, target.x, target.y);
  }
  this.face = Math.cos(this.aim) >= 0 ? 1 : -1;

  /* --- 自动战斗：目标超出普攻距离时自动逼近（卡住转 BFS 寻路，路径存在时交给上方路径走） --- */
  if (this.auto && target && !mx && !my && !this.isRooted() && !this.path) {
    var autoD = U.dist(this.x, this.y, target.x, target.y);
    var autoRange = 50 + target.r;
    if (autoD > autoRange) {
      var autoA = U.ang(this.x, this.y, target.x, target.y);
      var aox = this.x, aoy = this.y;
      this.moveBy(Math.cos(autoA) * st.spd * this.speedMul() * dt, Math.sin(autoA) * st.spd * this.speedMul() * dt);
      this.walkT += dt * 8;
      if (U.dist(aox, aoy, this.x, this.y) < st.spd * dt * 0.3) {
        this.autoStuck = (this.autoStuck || 0) + dt;
        if (this.autoStuck > 0.35) {
          this.autoStuck = 0;
          var ap = Game.map.findPath(this.x, this.y, target.x, target.y);
          if (ap && ap.length) this.path = ap.slice(0, -1);
        }
      } else this.autoStuck = 0;
    }
  }

  /* --- 攻击输入（1~6 对应技能栏 6 格；普攻走左键/空格） --- */
  if (Input.mouse.down || Input.down('Space')) Battle.playerCast(this, 'basic', target);
  else if (this.auto && target) Battle.playerCast(this, 'basic', target);   /* 自动战斗自动出手 */
  if (Input.pressed('Digit1')) Battle.playerCast(this, 1, target);
  if (Input.pressed('Digit2')) Battle.playerCast(this, 2, target);
  if (Input.pressed('Digit3')) Battle.playerCast(this, 3, target);
  if (Input.pressed('Digit4')) Battle.playerCast(this, 4, target);
  if (Input.pressed('Digit5')) Battle.playerCast(this, 5, target);
  if (Input.pressed('Digit6')) Battle.playerCast(this, 6, target);

  /* --- 回复 --- */
  if (this.itemCd > 0) this.itemCd -= dt;
  this.regenT += dt;
  if (this.regenT >= 1) {
    this.regenT -= 1;
    var inCombat = this.combatT > 0;
    /* 战斗回魔 3.2%/秒：技能轮转可持续（原 1.2% 会把整个技能系统架空） */
    this.mp = Math.min(st.mp, this.mp + st.mp * (inCombat ? 0.032 : 0.05));
    if (!inCombat && this.hp < st.hp) this.hp = Math.min(st.hp, this.hp + st.hp * 0.02);
    if (Game.map.def.safe) this.hp = st.hp;
  }
};
Player.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  this.drawShadow(g);
  var frame = (Math.floor(this.walkT) % 2);
  var cv = Sprites.playerCv(this.cls, this.tier(), frame, this.face < 0);
  g.drawImage(cv, Math.round(sx - 16), Math.round(sy - 40));
  /* 武器：绕手部旋转 */
  var wt = CLASSES[this.cls].weapon;
  var wcv = Sprites.weaponCv(wt, this.tier());
  g.save();
  g.translate(Math.round(sx + this.face * 8), Math.round(sy - 12));
  g.rotate(this.aim);
  if (this.face < 0) g.scale(1, -1);
  g.drawImage(wcv, 2, -8);
  g.restore();
  /* 受击闪白 */
  if (this.hurtT > 0) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,120,120,' + (this.hurtT * 2.2).toFixed(2) + ')';
    g.fillRect(sx - 14, sy - 38, 28, 40);
    g.globalCompositeOperation = 'source-over';
  }
  this.drawStatusIcons(g, sx, sy - 46);
};
Actor.prototype.drawStatusIcons = function (g, sx, topY) {
  var list = this.statusList();
  for (var i = 0; i < list.length && i < 6; i++) {
    var st = STATUS[list[i]];
    g.fillStyle = st.color;
    g.fillRect(sx - 15 + i * 6, topY, 5, 5);
  }
};
Actor.prototype.drawHpBar = function (g, sx, sy, w, color) {
  if (this.hp >= this.st.hp) return;
  g.fillStyle = 'rgba(20,16,24,0.7)';
  g.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 5);
  g.fillStyle = color || '#e05656';
  g.fillRect(sx - w / 2, sy, Math.max(0, w * U.clamp(this.hp / this.st.hp, 0, 1)), 3);
};

/* ---------------- 灵宠 ---------------- */
function PetActor(rec, slot) {
  Actor.call(this);
  this.kind = 'pet';
  this.rec = rec;                            /* 存档记录 */
  this.sp = SPECIES[rec.sp];
  this.slot = slot;                          /* 编队位置 0..2 */
  this.r = 11;
  this.st = petStat(rec);
  if (rec.shiny) {
    this.st.hp = Math.round(this.st.hp * SHINY_MUL);
    this.st.atk = Math.round(this.st.atk * SHINY_MUL * 10) / 10;
    this.st.def = Math.round(this.st.def * SHINY_MUL * 10) / 10;
  }
  this.hp = (typeof rec.hp === 'number' && rec.hp > 0) ? Math.min(rec.hp, this.st.hp) : this.st.hp;
  this.cd = {};
  this.retargetT = 0;
  this.target = null;
  this.downT = rec.downT > 0 ? rec.downT : 0;  /* 濒死状态跟随记录（防换队刷新规避） */
  this.reviveT = 0;
  this.wanderA = Math.random() * 6.28;
}
PetActor.prototype = Object.create(Actor.prototype);
PetActor.prototype.down = function () {
  this.downT = 0.01;                         /* 濒死：脱战 8 秒归队；战斗中 14 秒也可撑伤归队（不再"死了就是死了"） */
  this.hp = 0;
  this.status = {};
};
PetActor.prototype.update = function (dt) {
  var keys = Object.keys(this.cd);
  for (var i = 0; i < keys.length; i++) if (this.cd[keys[i]] > 0) this.cd[keys[i]] -= dt;
  if (this.downT > 0) {
    var inCombat = Game.player.combatT > 0;
    var wait = inCombat ? 14 : 8;
    var back = inCombat ? 0.3 : 0.6;
    this.downT += dt;
    if (this.downT > wait) {
      this.hp = Math.ceil(this.st.hp * back);
      this.downT = 0;
      this.rec.downT = 0;
      Game.addFloat(this.x, this.y - 30, this.sp.name + (inCombat ? ' 强撑归队！' : ' 归队！'), '#8fe08f');
      Game.addFx({ type: 'heal', x: this.x, y: this.y, t: 0.5, dur: 0.5 });
    }
    return;
  }
  this.tickStatus(dt);
  this.tickKnock(dt);
  if (this.isStunned()) return;
  /* 脱战缓回：灵宠每秒回 2%（受伤不必回村） */
  this.regenT = (this.regenT || 0) + dt;
  if (this.regenT >= 1) {
    this.regenT -= 1;
    if (Game.player.combatT <= 0 && this.hp < this.st.hp) {
      this.hp = Math.min(this.st.hp, this.hp + this.st.hp * 0.02);
    }
  }

  var mode = Game.petMode;
  var P = Game.player;
  /* 索敌（不与捕捉抢怪：缚灵索束缚中的目标灵宠停手，交给主人） */
  this.retargetT -= dt;
  if (this.retargetT <= 0) {
    this.retargetT = 0.5;
    this.target = null;
    if (mode === 'attack') this.target = Battle.nearestMob(this.x, this.y, 420);
    else if (mode === 'defend') {
      var m = Battle.nearestMob(P.x, P.y, 240);
      if (m) this.target = m;
    }
  }
  if (Game.capture && this.target === Game.capture.target) this.target = null;
  if (this.target && (!this.target.alive || this.target.hp <= 0)) this.target = null;

  /* 技能决策：救场技（治疗/护盾）最高优先，输出技从强到弱（对齐怪物 AI）
     技能表按 (种族,等级) 缓存，别每帧 filter+map */
  var skKey = this.rec.sp + ':' + this.rec.lv;
  if (this._skKey !== skKey) { this._skKey = skKey; this._skills = petSkills(this.rec); }
  var skills = this._skills;
  var did = false;
  var P = Game.player;
  var allies = [P].concat(Game.pets.filter(function (p) { return p !== this && !p.downT; }), this);
  var low = null;
  allies.forEach(function (a) { if (!low || a.hp / a.st.hp < low.hp / low.st.hp) low = a; });
  for (var sh = 0; sh < skills.length && !did; sh++) {
    var shSk = SKILLS[skills[sh]];
    if ((this.cd[skills[sh]] || 0) > 0) continue;
    if (shSk.kind === 'heal' && low && low.hp / low.st.hp < 0.62) {
      Battle.petCast(this, skills[sh], low); did = true;
    } else if (shSk.kind === 'shield' && this.hp / this.st.hp < 0.65) {
      Battle.petCast(this, skills[sh], this); did = true;
    }
  }
  for (var s = skills.length - 1; s >= 0 && !did; s--) {
    var sk = SKILLS[skills[s]];
    if ((this.cd[skills[s]] || 0) > 0) continue;
    if (sk.kind === 'heal' || sk.kind === 'shield') continue;   /* 救场技已在上方处理 */
    if (sk.kind === 'buff') {
      if (Game.player.combatT > 0) { Battle.petCast(this, skills[s], this); did = true; }
    } else if (this.target) {
      var rng = sk.range || 50;
      var d = U.dist(this.x, this.y, this.target.x, this.target.y);
      if (d < rng + 60) { Battle.petCast(this, skills[s], this.target); did = true; }
    }
  }

  /* 移动 */
  var followPt = this.followPoint();
  if (this.target && !this.isRooted()) {
    var sk0 = SKILLS[skills[skills.length - 1]] || SKILLS.tackle;
    var wantRange = sk0.kind === 'shot' ? 140 : 40;
    var d2 = U.dist(this.x, this.y, this.target.x, this.target.y);
    if (d2 > wantRange + 30) {
      this.moveToward(this.target.x, this.target.y, dt);
    } else if (d2 < wantRange - 40 && sk0.kind === 'shot') {
      var away = U.ang(this.target.x, this.target.y, this.x, this.y);
      this.moveBy(Math.cos(away) * this.st.spd * 0.7 * dt, Math.sin(away) * this.st.spd * 0.7 * dt);
    } else {
      /* 游走 */
      this.wanderA += (Math.random() - 0.5) * 2;
      this.moveBy(Math.cos(this.wanderA) * 30 * dt, Math.sin(this.wanderA) * 30 * dt);
    }
  } else if (!this.isRooted()) {
    var fd = U.dist(this.x, this.y, followPt.x, followPt.y);
    if (fd > 26) this.moveToward(followPt.x, followPt.y, dt);
  }
};
PetActor.prototype.followPoint = function () {
  var P = Game.player;
  var ang = (this.slot - 1) * 2.2 + 1.6;
  return { x: P.x + Math.cos(ang) * 46, y: P.y + Math.sin(ang) * 40 };
};
PetActor.prototype.moveToward = function (tx, ty, dt) {
  /* BFS 路径跟随（卡住时自动寻路绕障） */
  if (this.path && this.path.length) {
    var wp2 = this.path[0];
    if (U.dist(this.x, this.y, wp2.x, wp2.y) < 12) {
      this.path.shift();
      if (!this.path.length) this.path = null;
    }
  }
  var goal = (this.path && this.path.length) ? this.path[0] : { x: tx, y: ty };
  var a = U.ang(this.x, this.y, goal.x, goal.y);
  var ox = this.x, oy = this.y;
  this.moveBy(Math.cos(a) * this.st.spd * this.speedMul() * dt, Math.sin(a) * this.st.spd * this.speedMul() * dt);
  var progressed = U.dist(ox, oy, this.x, this.y) > this.st.spd * dt * 0.3;
  if (progressed) {
    this.walkT += dt * 8;
    this.face = Math.cos(a) >= 0 ? 1 : -1;
    this.stuckT = 0;
  } else {
    /* 卡住：直走不通 → 限期 BFS；寻路失败则切向蹭边 */
    this.stuckT = (this.stuckT || 0) + dt;
    if (this.stuckT > 0.35) {
      this.stuckT = 0;
      var p = Game.map.findPath(this.x, this.y, tx, ty);
      if (p && p.length) this.path = p;
      else {
        a += (this.slot % 2 ? 1 : -1) * 1.2;
        this.moveBy(Math.cos(a) * this.st.spd * dt, Math.sin(a) * this.st.spd * dt);
      }
    }
  }
};
PetActor.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  if (this.downT > 0) {
    /* 濒死：倒地灰影 + 归队倒计时 */
    g.globalAlpha = 0.5;
    g.fillStyle = '#5a5462';
    g.beginPath(); g.ellipse(sx, sy + 8, 14, 7, 0, 0, 6.28); g.fill();
    g.globalAlpha = 1;
    var waitS = Math.max(0, Math.ceil((Game.player.combatT > 0 ? 14 : 8) - this.downT));
    g.fillStyle = '#c8c0d0';
    g.font = '10px sans-serif'; g.textAlign = 'center';
    g.fillText('濒死 ' + waitS + 's', sx, sy);
    return;
  }
  this.drawShadow(g);
  var frame = Math.floor(this.walkT) % 2;
  var cv = Sprites.creatureCv(this.rec.sp, frame, this.face < 0, this.rec.shiny);
  g.drawImage(cv, Math.round(sx - 30), Math.round(sy - 36));
  if (this.hurtT > 0) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,120,120,' + (this.hurtT * 2.2).toFixed(2) + ')';
    g.fillRect(sx - 28, sy - 34, 56, 40);
    g.globalCompositeOperation = 'source-over';
  }
  this.drawHpBar(g, sx, sy - 42, 30, '#78d878');
  this.drawStatusIcons(g, sx, sy - 50);
};

/* ---------------- 魔物 ---------------- */
function Monster(spId, lv, opt) {
  Actor.call(this);
  opt = opt || {};
  this.kind = 'mob';
  this.spId = spId;
  this.sp = SPECIES[spId];
  this.lv = lv;
  this.boss = !!opt.boss;
  this.elite = !!opt.elite;
  this.summoned = !!opt.summoned;
  this.shiny = !this.boss && U.chance(SHINY_RATE);
  this.peaceful = !!opt.peaceful;
  var g = 1 + (lv - 1) * 0.16;
  var mul = (this.shiny ? 1.3 : 1) * (this.elite ? 1.5 : 1);
  this.st = {
    hp: Math.round(this.sp.base.hp * g * mul * (this.boss ? (opt.hpMul || 3) : 1)),
    atk: Math.round(this.sp.base.atk * g * mul * (this.boss ? 1.6 : 1) * 10) / 10,
    def: Math.round(this.sp.base.def * g * mul * (this.boss ? 1.3 : 1) * 10) / 10,
    spd: this.sp.base.spd * (this.boss ? 1.05 : 1)
  };
  this.hp = this.st.hp;
  this.r = this.boss ? 22 : this.elite ? 15 : 12;
  this.skills = petSkills({ sp: spId, lv: lv });
  this.cd = {};
  this.home = { x: this.x, y: this.y };
  this.aggro = false;
  this.wanderA = Math.random() * 6.28;
  this.wanderT = 0;
  this.retargetT = 0;
  this.target = null;
  this.phase = 1;                            /* BOSS 阶段 */
  this.summonedT = 0;
}
Monster.prototype = Object.create(Actor.prototype);
Monster.prototype.aggroRange = function () {
  var sk = this.skills.length ? SKILLS[this.skills[this.skills.length - 1]] : null;
  var ranged = sk && sk.kind === 'shot';
  return this.peaceful ? 0 : (ranged ? 300 : 220) + (this.elite ? 60 : 0);
};
Monster.prototype.update = function (dt) {
  var keys = Object.keys(this.cd);
  for (var i = 0; i < keys.length; i++) if (this.cd[keys[i]] > 0) this.cd[keys[i]] -= dt;
  this.tickStatus(dt);
  this.tickKnock(dt);
  if (this.isStunned()) return;

  /* BOSS 阶段切换 */
  if (this.boss) this.checkPhase();

  /* 索敌 */
  this.retargetT -= dt;
  if (this.retargetT <= 0) {
    this.retargetT = 0.5;
    var range = this.aggroRange();
    var cand = null;
    if (!this.peaceful) {
      var P = Game.player;
      var pd = U.dist(this.x, this.y, P.x, P.y);
      if (pd < range || (P.combatT > 0 && pd < range * 1.8)) cand = P;
      if (!cand && (this.aggro || this.boss)) {
        for (var k = 0; k < Game.pets.length; k++) {
          var pet = Game.pets[k];
          if (pet.downT > 0) continue;
          var d = U.dist(this.x, this.y, pet.x, pet.y);
          if (d < range * 1.6) { cand = pet; break; }
        }
      }
    }
    this.target = cand;
    this.aggro = !!cand || this.aggro;
  }
  if (this.target && (this.target.hp <= 0 || (this.target.kind === 'pet' && this.target.downT > 0))) this.target = null;
  /* 复位脱战 */
  if (this.aggro && !this.target) {
    var hd = U.dist(this.x, this.y, this.home.x, this.home.y);
    if (hd > 6 && !this.boss && !this.peaceful) {
      this.moveToward(this.home.x, this.home.y, dt);
      this.hp = Math.min(this.st.hp, this.hp + this.st.hp * 0.06 * dt);
      return;
    }
  }

  if (this.target && !this.isRooted()) {
    /* 追击 / 施法 */
    var did = false;
    for (var s = this.skills.length - 1; s >= 0 && !did; s--) {
      var sid = this.skills[s], sk = SKILLS[sid];
      if ((this.cd[sid] || 0) > 0) continue;
      var rng = sk.range || 50;
      if (sk.kind === 'shot') rng = (sk.range || 320) - 40;
      if (sk.kind === 'aoe' || sk.kind === 'rain') rng = sk.radius || 100;
      if (sk.kind === 'dash') rng = 220;
      if (sk.kind === 'summon') rng = 400;
      var d3 = U.dist(this.x, this.y, this.target.x, this.target.y);
      if (d3 < rng) { Battle.mobCast(this, sid, this.target); did = true; }
    }
    var sk2 = SKILLS[this.skills[this.skills.length - 1]] || SKILLS.tackle;
    var want = sk2.kind === 'shot' ? 170 : (this.r + this.target.r + 8);
    var dd = U.dist(this.x, this.y, this.target.x, this.target.y);
    if (dd > want) this.moveToward(this.target.x, this.target.y, dt);
    else if (dd < want - 50 && sk2.kind === 'shot') {
      var away2 = U.ang(this.target.x, this.target.y, this.x, this.y);
      this.moveBy(Math.cos(away2) * this.st.spd * 0.7 * dt, Math.sin(away2) * this.st.spd * 0.7 * dt);
    }
  } else if (!this.isRooted()) {
    /* 游走 */
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = U.rand(1.5, 3.5);
      this.wanderA = Math.random() * Math.PI * 2;
    }
    var wd = U.dist(this.x, this.y, this.home.x, this.home.y);
    if (wd < 140 || this.boss) {
      var mv = Math.cos(this.wanderA) * 24 * dt, mv2 = Math.sin(this.wanderA) * 24 * dt;
      var nx = this.x + mv, ny = this.y + mv2;
      if (wd + Math.hypot(mv, mv2) < 150 || this.boss) this.moveBy(mv, mv2);
      this.walkT += dt * 4;
    } else {
      this.moveToward(this.home.x, this.home.y, dt);
    }
  }
};
Monster.prototype.moveToward = function (tx, ty, dt) {
  var a = U.ang(this.x, this.y, tx, ty);
  var ox = this.x, oy = this.y;
  this.moveBy(Math.cos(a) * this.st.spd * this.speedMul() * dt, Math.sin(a) * this.st.spd * this.speedMul() * dt);
  if (U.dist(ox, oy, this.x, this.y) > 0.4) {
    this.walkT += dt * 7;
    this.face = Math.cos(a) >= 0 ? 1 : -1;
    if (Math.abs(this.x - ox) < 0.1 && Math.abs(this.y - oy) < 0.1) {
      a += (this.wanderA = a + 1.1) - a;
      this.moveBy(Math.cos(a) * this.st.spd * dt, Math.sin(a) * this.st.spd * dt);
    }
  }
};
Monster.prototype.checkPhase = function () {
  var pct = this.hp / this.st.hp;
  if (this.phase === 1 && pct < 0.62) {
    this.phase = 2;
    this.st.atk = Math.round(this.st.atk * 1.18 * 10) / 10;
    this.st.spd *= 1.06;
    this.bossPhaseFx('狂暴二阶');
  } else if (this.phase === 2 && pct < 0.32) {
    this.phase = 3;
    this.st.atk = Math.round(this.st.atk * 1.14 * 10) / 10;
    this.st.spd *= 1.08;
    this.bossPhaseFx('狂暴三阶');
    /* 三阶段：唤魂 */
    Battle.bossSummon(this, 3);
  }
};
Monster.prototype.bossPhaseFx = function (label) {
  SFX.play('boss');
  Game.shake(12);
  Game.flash('rgba(255,60,40,0.25)');
  Game.addFloat(this.x, this.y - 50, '★ ' + label + ' ★', '#ff8060', 20);
  Game.addFx({ type: 'ring', x: this.x, y: this.y, r: 10, maxR: 200, t: 0.6, color: '#ff6040' });
};
Monster.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  this.drawShadow(g);
  var frame = Math.floor(this.walkT) % 2;
  var scale = this.boss ? 1.5 : this.elite ? 1.15 : 1;
  var cv = Sprites.creatureCv(this.spId, frame, this.face < 0, this.shiny);
  if (scale !== 1) {
    g.save();
    g.translate(Math.round(sx), Math.round(sy));
    g.scale(scale, scale);
    g.drawImage(cv, -30, -36);
    g.restore();
  } else {
    g.drawImage(cv, Math.round(sx - 30), Math.round(sy - 36));
  }
  if (this.boss) {
    /* BOSS 常驻光环：画在本体之后，加色发光椭圆从脚下铺出（一阶金、狂暴转红） */
    var aura0 = this.phase >= 3 ? '#ff4030' : this.phase >= 2 ? '#ff9030' : '#e8c060';
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.22 + Math.sin(Game.time * 3) * 0.06;
    g.fillStyle = aura0;
    g.beginPath(); g.ellipse(sx, sy + 8, 82, 30, 0, 0, 6.28); g.fill();
    g.globalAlpha = 0.85;
    g.strokeStyle = aura0; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(sx, sy + 8, 88 + Math.sin(Game.time * 3) * 4, 34, 0, 0, 6.28); g.stroke();
    g.restore();
  }
  /* BOSS / 精英标记 */
  if (this.boss || this.elite) {
    g.fillStyle = this.boss ? '#ffb040' : '#d890d8';
    g.font = this.boss ? 'bold 13px sans-serif' : '11px sans-serif';
    g.textAlign = 'center';
    g.fillText(this.boss ? '◆' : '▲', sx, sy - 40 * scale - 6);
  }
  if (this.hurtT > 0) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,120,120,' + (this.hurtT * 2.2).toFixed(2) + ')';
    g.fillRect(sx - 26 * scale, sy - 34 * scale, 52 * scale, 40 * scale);
    g.globalCompositeOperation = 'source-over';
  }
  if (this.hp < this.st.hp) this.drawHpBar(g, sx, sy - 44 * scale, this.boss ? 52 : 30);
  if (this.boss) {
    /* 狂暴阶段：环绕粒子 + 身体染色（每阶段递进可读；地面光环已由常驻 aura 承担） */
    var pct = this.hp / this.st.hp;
    if (this.phase >= 2) {
      var auraC = this.phase >= 3 ? '#ff4030' : '#ff9030';
      /* 环绕火星 */
      var nSpark = this.phase >= 3 ? 8 : 5, iSp;
      for (iSp = 0; iSp < nSpark; iSp++) {
        var spA = Game.time * 2.4 + iSp / nSpark * 6.28;
        g.fillStyle = iSp % 2 ? '#ffd040' : auraC;
        g.fillRect(sx + Math.cos(spA) * 34 - 2, sy - 6 + Math.sin(spA) * 20 - 2, 4, 4);
      }
      /* 身体染红 */
      g.globalAlpha = this.phase >= 3 ? 0.22 : 0.12;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#ff5020';
      g.fillRect(sx - 30 * scale, sy - 36 * scale, 60 * scale, 44 * scale);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      /* 阶段角标 */
      g.font = 'bold 11px sans-serif'; g.textAlign = 'left';
      g.fillStyle = '#ffd740';
      g.fillText('★'.repeat(this.phase - 1), sx + 18 * scale, sy - 46 * scale);
    }
  }
  this.drawStatusIcons(g, sx, sy - 52 * scale);
};

/* ---------------- 弹道 ---------------- */
function Projectile(o) {
  this.x = o.x; this.y = o.y;
  this.vx = o.vx; this.vy = o.vy;
  this.r = o.r || 5;
  this.ttl = o.ttl || 2;
  this.faction = o.faction;                   /* 'player' | 'mob' */
  this.owner = o.owner;
  this.atk = o.atk;
  this.power = o.power;
  this.el = o.el || 'none';
  this.style = o.style || 'bolt';
  this.pierce = o.pierce || 0;
  this.hitSet = [];
  this.status = o.status || null;             /* [id, chance] */
  this.skill = o.skill || null;
  this.av = o.av || 0;                        /* 角速度（螺旋弹幕） */
  this.dead = false;
  this.trail = [];                            /* 拖尾采样点（最多 16） */
}
Projectile.prototype.update = function (dt) {
  this.ttl -= dt;
  if (this.ttl <= 0) { this.dead = true; return; }
  if (this.av) {
    var a = Math.atan2(this.vy, this.vx) + this.av * dt;
    var sp = Math.hypot(this.vx, this.vy);
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
  }
  this.x += this.vx * dt; this.y += this.vy * dt;
  this.trail.push({ x: this.x, y: this.y });
  if (this.trail.length > 16) this.trail.shift();
  if (Game.map.shotBlockedAt(this.x, this.y)) {
    this.dead = true;
    Game.addFx({ type: 'hit', x: this.x, y: this.y, t: 0.25, el: this.el });
    return;
  }
  /* 命中检测 */
  var targets = this.faction === 'player' ? Game.mobs : [Game.player].concat(Game.pets);
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (!t || !t.alive) continue;
    if (t.kind === 'pet' && t.downT > 0) continue;
    if (this.hitSet.indexOf(t) >= 0) continue;
    if (U.dist2(this.x, this.y, t.x, t.y) < (this.r + t.r) * (this.r + t.r)) {
      Battle.projectileHit(this, t);
      this.hitSet.push(t);
      if (this.pierce > 0) { this.pierce--; }
      else { this.dead = true; return; }
    }
  }
};
Projectile.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  var c = ELEMENTS[this.el] ? ELEMENTS[this.el].color : '#cfd8dc';
  var ang = Math.atan2(this.vy, this.vx);
  /* --- 元素拖尾：沿轨迹渐显，各元素有签名形状 --- */
  if (this.trail.length > 3 && this.style !== 'arrow' && this.style !== 'rock') {
    var isFire = this.el === 'fire', isThunder = this.el === 'thunder', isWater = this.el === 'water';
    g.save();
    if (isFire) {
      for (var ti = 0; ti < this.trail.length; ti += 2) {
        var tp = this.trail[ti], ta = 0.05 + ti / this.trail.length * 0.45;
        g.globalAlpha = ta;
        g.fillStyle = ti % 4 < 2 ? '#ff9040' : '#ffd060';
        var ts = 2 + ti / this.trail.length * 3;
        g.fillRect(tp.x - Game.cam.x - ts / 2, tp.y - Game.cam.y - ts / 2 + Math.sin(Game.time * 20 + ti) * 1.5, ts, ts);
      }
    } else if (isThunder) {
      g.globalAlpha = 0.5; g.strokeStyle = '#ffe070'; g.lineWidth = 1.5;
      g.beginPath();
      for (var tj = 0; tj < this.trail.length; tj++) {
        var tq = this.trail[tj];
        var ox2 = tj < this.trail.length - 1 ? Math.sin(tj * 2.7 + Game.time * 30) * 2 : 0;
        if (tj === 0) g.moveTo(tq.x - Game.cam.x + ox2, tq.y - Game.cam.y);
        else g.lineTo(tq.x - Game.cam.x + ox2, tq.y - Game.cam.y);
      }
      g.stroke();
    } else if (isWater) {
      for (var tk = this.trail.length - 6; tk < this.trail.length; tk += 3) {
        if (tk < 0) continue;
        var tr = this.trail[tk];
        g.globalAlpha = 0.10 + (tk / this.trail.length) * 0.25;
        g.strokeStyle = c; g.lineWidth = 1;
        g.beginPath(); g.arc(tr.x - Game.cam.x, tr.y - Game.cam.y, 3 + (this.trail.length - tk) * 0.4, 0, 6.28); g.stroke();
      }
    } else {
      var last = this.trail[this.trail.length - 1];
      g.globalAlpha = 0.25; g.fillStyle = c;
      g.beginPath(); g.arc(last.x - Game.cam.x, last.y - Game.cam.y, this.r + 4, 0, 6.28); g.fill();
    }
    g.restore();
  }
  g.save();
  g.translate(sx, sy);
  g.rotate(ang);
  var style = this.style;
  if (style === 'arrow') {
    g.strokeStyle = '#e8dcc0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(6, 0); g.stroke();
    g.fillStyle = '#cfd8dc';
    g.beginPath(); g.moveTo(9, 0); g.lineTo(3, -3); g.lineTo(3, 3); g.fill();
  } else if (style === 'rock') {
    g.fillStyle = '#8c8478';
    g.beginPath(); g.arc(0, 0, this.r + 1, 0, 6.28); g.fill();
    g.fillStyle = '#6a6258'; g.fillRect(-2, -2, 3, 3);
  } else if (style === 'star') {
    g.fillStyle = '#fff8d8';
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-2, -5); g.lineTo(-2, 5); g.fill();
    g.globalAlpha = 0.5; g.fillStyle = c;
    g.beginPath(); g.arc(0, 0, this.r + 4, 0, 6.28); g.fill();
  } else {
    /* 元素弹 */
    g.globalAlpha = 0.35; g.fillStyle = c;
    g.beginPath(); g.arc(0, 0, this.r + 3, 0, 6.28); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = c;
    g.beginPath(); g.arc(0, 0, this.r, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.arc(-1, -1, this.r * 0.45, 0, 6.28); g.fill();
  }
  g.restore();
};

/* ---------------- 捕捉索（掷向目标灵物） ---------------- */
function CaptureBall(from, target, ballId) {
  this.kind = 'ball';
  this.x = from.x; this.y = from.y - 16;
  this.tx = target.x; this.ty = target.y - 10;
  this.t = 0;
  this.dur = 0.5;
  this.target = target;
  this.ballId = ballId;
  this.phase = 'fly';                        /* fly → shake(3) → done */
  this.shakeN = 0;
  this.shakeT = 0;
  this.sx = this.tx; this.sy = this.ty;      /* 定位后位置 */
  /* 单摇成功率 = 总捕获率^(1/3)：三摇全过才算结契，整体概率恰为 captureRate */
  this.successPer = Math.pow(Battle.captureRate(target, ballId), 1 / 3);
  this.dead = false;
  this.startX = this.x; this.startY = this.y;
}
CaptureBall.prototype.update = function (dt) {
  this.t += dt;
  if (this.phase === 'fly') {
    var p = U.clamp(this.t / this.dur, 0, 1);
    this.x = U.lerp(this.startX, this.tx, p);
    this.y = U.lerp(this.startY, this.ty, p) - Math.sin(p * Math.PI) * 40;
    if (p >= 1) {
      if (!this.target.alive || this.target.hp <= 0) {
        /* 目标死了：解除全局捕捉占用，别把 E 键锁死 */
        this.dead = true;
        Game.capture = null;
        Game.addFloat(this.tx, this.ty - 30, '目标已倒下', '#9aa8b0');
        return;
      }
      this.phase = 'shake';
      this.shakeT = 0.7;
      SFX.play('shake');
      this.target.stunned = true;
      this.target.status.stun = { t: 3.5, src: null, tick: 99 };
    }
  } else if (this.phase === 'shake') {
    /* 摇动期间目标被打死：捕捉失败，别对尸体结契（击杀+捕捉双结算红线） */
    if (!this.target.alive || this.target.hp <= 0) {
      this.dead = true;
      Game.capture = null;
      Game.addFloat(this.tx, this.ty - 30, '目标已倒下', '#9aa8b0');
      return;
    }
    this.shakeT -= dt;
    if (this.shakeT <= 0) {
      this.shakeN++;
      var ok = U.chance(this.successPer);
      if (!ok) {
        /* 逃脱 */
        this.dead = true;
        delete this.target.status.stun;
        this.target.aggro = true;
        this.target.target = Game.player;
        SFX.play('fail');
        Game.addFloat(this.target.x, this.target.y - 40, '挣脱了！', '#ffb080');
        Game.capture = null;
        return;
      }
      if (this.shakeN >= 3) {
        /* 捕获成功 */
        this.dead = true;
        SFX.play('catch');
        Battle.captureSuccess(this.target, this.ballId);
        Game.capture = null;
        return;
      }
      this.shakeT = 0.7;
      SFX.play('shake');
      Game.addFloat(this.target.x, this.target.y - 40 - this.shakeN * 12, '…', '#cfd8dc');
    }
  }
};
CaptureBall.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  var col = ITEMS[this.ballId].color;
  var wob = this.phase === 'shake' ? Math.sin(this.t * 22) * 4 : 0;
  /* 被束缚的灵物：头顶转圈眩晕星 + 轻微抖动，捕捉状态一眼可见 */
  if (this.phase === 'shake' && this.target && this.target.alive) {
    var tx = this.target.x - Game.cam.x, ty = this.target.y - this.target.r - 56 - Game.cam.y;
    var wob2 = Math.sin(this.t * 30) * 1.5;
    g.font = '10px sans-serif'; g.textAlign = 'center';
    for (var sI = 0; sI < 3; sI++) {
      var sA = this.t * 5 + sI * 2.1;
      g.fillStyle = '#ffe9a0';
      g.fillText('✦', tx + Math.cos(sA) * 12 + wob2, ty + Math.sin(sA) * 4);
    }
  }
  g.fillStyle = col;
  g.beginPath(); g.arc(sx + wob, sy, 7, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.arc(sx + wob - 2, sy - 2, 2.4, 0, 6.28); g.fill();
  g.strokeStyle = 'rgba(30,24,40,0.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(sx + wob, sy, 7, 0, 6.28); g.stroke();
};

/* ---------------- 特效 ---------------- */
function Effect(o) {
  U.extend(this, o);
  this.t = this.t || 0.3;
  this.dur = this.dur || this.t;
  this.seed = this.seed || Math.random() * 99;
  this.dead = false;
  /* 粒子初速缓存（elemBurst 用，seed 确定性） */
  if (this.type === 'elemBurst' && !this.parts) {
    this.parts = [];
    var rnd = mulberry32(Math.floor(this.seed * 1000));
    var n = this.n || 24;
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.28 + rnd() * 0.5;
      var v = (0.5 + rnd() * 0.8) * (this.spread || 70);
      this.parts.push({ a: a, v: v, w: 1.5 + rnd() * 2.5, gold: rnd() < 0.33 });
    }
  }
}
Effect.prototype.update = function (dt) {
  this.t -= dt;
  if (this.t <= 0) this.dead = true;
  if (this.type === 'ring') this.r = U.lerp(this.r, this.maxR, dt * 6);
};
Effect.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  var life = U.clamp(this.t / (this.dur || 0.3), 0, 1);
  var k = 1 - life;                             /* 进度 0→1 */
  switch (this.type) {
    case 'elemBurst': {
      /* 元素签名爆裂：粒子沿各自角度扩散 + 外圈冲击环（lighter） */
      var c = this.el && ELEMENTS[this.el] ? ELEMENTS[this.el].color : '#ffd080';
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < this.parts.length; i++) {
        var pt = this.parts[i];
        var d = pt.v * (0.3 + k * 0.7);
        var px = sx + Math.cos(pt.a) * d, py = sy + Math.sin(pt.a) * d - k * 8;
        g.globalAlpha = (1 - k) * 0.9;
        g.fillStyle = pt.gold ? '#ffe9a0' : c;
        var sz = pt.w * (1 - k * 0.5);
        g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      /* 白热芯闪光（双层：核 + 芯） */
      g.globalAlpha = (1 - k) * (1 - k) * 0.85;
      g.fillStyle = '#ffe9b0';
      g.beginPath(); g.arc(sx, sy, (this.spread || 70) * 0.34 * (1 - k * 0.4), 0, 6.28); g.fill();
      g.globalAlpha = (1 - k) * (1 - k) * (1 - k) * 0.95;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(sx, sy, (this.spread || 70) * 0.16, 0, 6.28); g.fill();
      g.restore();
      break;
    }
    case 'greatslash': {
      /* 三层弧：外宽弧 + 主弧 + 白刃芯（demo 手法） */
      var r = this.radius || 46;
      var a0 = this.ang - (this.arc || 1.8) / 2, a1 = this.ang + (this.arc || 1.8) / 2;
      var rr = r * (0.55 + k * 0.55);
      g.save();
      g.strokeStyle = 'rgba(255,220,160,0.45)'; g.lineWidth = 14 * (1 - k) + 3;
      g.beginPath(); g.arc(sx, sy, rr * 0.94, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(255,250,225,' + (0.95 * life + 0.05) + ')'; g.lineWidth = 7 * (1 - k) + 1.5;
      g.beginPath(); g.arc(sx, sy, rr, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,' + life + ')'; g.lineWidth = 2.5 * (1 - k) + 1;
      g.beginPath(); g.arc(sx, sy, rr * 0.97, a0 + 0.12, a1 - 0.12); g.stroke();
      g.restore();
      break;
    }
    case 'bolt': {
      /* 闪电：7 段折线双 pass（元素色外 + 白内），中段抖动最大 */
      var bc = this.el && ELEMENTS[this.el] ? ELEMENTS[this.el].color : '#ffe070';
      var x0 = this.x0 !== undefined ? this.x0 - Game.cam.x : sx, y0 = this.y0 !== undefined ? this.y0 - Game.cam.y : sy;
      var w2 = Math.sin(this.seed) * 26 * (1 - Math.abs(k - 0.5) * 2);
      g.save();
      for (var pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass === 0 ? bc : '#ffffff';
        g.lineWidth = pass === 0 ? 6 : 2;
        g.globalAlpha = life;
        g.beginPath(); g.moveTo(x0, y0);
        for (var sI = 1; sI <= 7; sI++) {
          var f = sI / 7;
          g.lineTo(U.lerp(x0, sx, f) + Math.sin(sI * 12.9 + this.seed) * w2 * 0.5,
            U.lerp(y0, sy, f) + Math.cos(sI * 9.7 + this.seed) * w2 * 0.3);
        }
        g.lineTo(sx, sy);
        g.stroke();
      }
      g.restore();
      break;
    }
    case 'meteor': {
      /* 两段式：k<0.62 拖尾下落，之后爆闪 */
      g.save();
      if (k < 0.62) {
        var fk = k / 0.62;
        var mx = sx + (1 - fk) * 90, my = sy - (1 - fk) * 150;
        g.globalAlpha = 0.9;
        g.strokeStyle = 'rgba(255,180,80,0.5)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(mx + 26, my - 44); g.lineTo(mx, my); g.stroke();
        g.fillStyle = '#ff9840';
        g.beginPath(); g.arc(mx, my, 7, 0, 6.28); g.fill();
        g.fillStyle = '#ffe9a0';
        g.beginPath(); g.arc(mx, my, 3.5, 0, 6.28); g.fill();
      } else {
        var ek = (k - 0.62) / 0.38;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1 - ek) * 0.9;
        g.fillStyle = '#ff8030';
        g.beginPath(); g.arc(sx, sy, (this.radius || 40) * (0.4 + ek * 0.8), 0, 6.28); g.fill();
        g.fillStyle = '#fff0c0';
        g.beginPath(); g.arc(sx, sy, (this.radius || 40) * 0.35 * (1 - ek * 0.5), 0, 6.28); g.fill();
      }
      g.restore();
      break;
    }
    case 'decal': {
      /* 地面残留：暗底盘 + 龟裂纹 + 后灭的火舌（衰减曲线 pow(1-k,0.45)） */
      var dr = this.radius || 30;
      g.save();
      g.globalAlpha = life * 0.8;
      g.fillStyle = '#1c0d06';
      g.beginPath(); g.ellipse(sx, sy, dr, dr * 0.55, 0, 0, 6.28); g.fill();
      g.globalAlpha = life * 0.5;
      g.strokeStyle = '#e86828'; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx - dr * 0.6, sy); g.lineTo(sx - dr * 0.2, sy - dr * 0.2);
      g.lineTo(sx + dr * 0.25, sy + dr * 0.05); g.lineTo(sx + dr * 0.6, sy - dr * 0.15);
      g.stroke();
      var fireA = Math.pow(1 - k, 0.45) * 0.7;
      if (fireA > 0.02) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fireA;
        g.fillStyle = '#ff9040';
        for (var fI = 0; fI < 3; fI++) {
          var fx = sx + Math.sin(this.seed + fI * 2.4) * dr * 0.4;
          var fh = 4 + Math.sin(Game.time * 14 + fI * 2 + this.seed) * 2.5;
          g.fillRect(fx - 1.5, sy - fh, 3, fh);
        }
      }
      g.restore();
      break;
    }
    case 'afterimage': {
      /* 残影：dash 用，白椭圆 lighter 渐隐 */
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = life * 0.35;
      g.fillStyle = this.color || '#dfe8ff';
      g.beginPath(); g.ellipse(sx, sy - 12, this.r || 14, 20, 0, 0, 6.28); g.fill();
      g.restore();
      break;
    }
    case 'hit': {
      var c = this.el && ELEMENTS[this.el] ? ELEMENTS[this.el].color : '#fff0c0';
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = life;
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * 6.28 + (this.x + this.y) * 0.7;
        var dd = 6 + (1 - life) * 10;
        g.fillStyle = i % 3 === 0 ? '#fff8e0' : c;
        g.fillRect(sx + Math.cos(a) * dd - 1.5, sy + Math.sin(a) * dd - 1.5, 3, 3);
      }
      g.restore();
      break;
    }
    case 'slash': {
      g.strokeStyle = 'rgba(255,250,220,' + life + ')';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(sx, sy, (this.radius || 40), this.ang - (this.arc || 1.8) / 2, this.ang + (this.arc || 1.8) / 2);
      g.stroke();
      break;
    }
    case 'boom': {
      var c2 = this.el && ELEMENTS[this.el] ? ELEMENTS[this.el].color : '#ffd080';
      g.globalAlpha = life * 0.8;
      g.fillStyle = U.rgba(c2, 0.7);
      g.beginPath(); g.arc(sx, sy, (this.radius || 50) * (1 - life * 0.5), 0, 6.28); g.fill();
      g.strokeStyle = c2; g.lineWidth = 3 * life + 1;
      g.beginPath(); g.arc(sx, sy, (this.radius || 50) * (1 - life) + (this.radius || 50) * life * 0.2, 0, 6.28); g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'ring': {
      g.globalAlpha = life;
      g.strokeStyle = this.color || '#fff';
      g.lineWidth = 3;
      g.beginPath(); g.arc(sx, sy, this.r, 0, 6.28); g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'heal': {
      g.globalAlpha = life;
      g.fillStyle = '#8fe08f';
      for (var j = 0; j < 4; j++) {
        g.fillRect(sx - 12 + j * 8, sy - 20 - (1 - life) * 24 + Math.sin(j) * 3, 3, 6);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'shield': {
      g.globalAlpha = life * 0.7;
      g.strokeStyle = '#8fc8f0'; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sy, 20 + (1 - life) * 6, 0, 6.28); g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'levelup': {
      g.globalAlpha = life;
      g.strokeStyle = '#ffd740'; g.lineWidth = 2;
      for (var k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(sx, sy, 16 + k * 10 + (1 - life) * 20, 0, 6.28);
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'evo': {
      g.globalAlpha = life;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(sx, sy, (1 - life) * 60, 0, 6.28); g.fill();
      g.strokeStyle = '#ffd740'; g.lineWidth = 3;
      g.beginPath(); g.arc(sx, sy, life * 70, 0, 6.28); g.stroke();
      g.globalAlpha = 1;
      break;
    }
  }
};

/* ---------------- 浮字 ---------------- */
function FloatText(x, y, text, color, size) {
  this.x = x; this.y = y; this.text = text;
  this.color = color || '#fff';
  this.size = size || 13;
  this.t = 1.1; this.dead = false;
  this.vx = U.rand(-14, 14);
  this.vy = size >= 16 ? -95 : -60;            /* 暴击大字弹得更高，随后重力坠回 */
}
FloatText.prototype.update = function (dt) {
  this.t -= dt;
  this.vy += 90 * dt;                           /* 重力 */
  this.y += this.vy * dt;
  this.x += this.vx * dt;
  if (this.t <= 0) this.dead = true;
};
FloatText.prototype.draw = function (g) {
  g.globalAlpha = U.clamp(this.t / 0.4, 0, 1);
  g.font = (this.size >= 18 ? 'bold ' : '') + this.size + 'px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(20,16,24,0.9)'; g.lineWidth = 3;
  g.strokeText(this.text, this.x - Game.cam.x, this.y - Game.cam.y);
  g.fillStyle = this.color;
  g.fillText(this.text, this.x - Game.cam.x, this.y - Game.cam.y);
  g.globalAlpha = 1;
};

/* ---------------- 掉落物 ---------------- */
function Pickup(x, y, payload) {
  this.x = x; this.y = y;
  this.groundY = y;                            /* 落点高度：抛物线坠回此处 */
  this.payload = payload;                      /* {gold:n} | {item:[id,n]} | {equip:{id,plus}} */
  this.vy = -U.rand(120, 200);
  this.vx = U.rand(-40, 40);
  this.t = 45;
  this.dead = false;
  this.magnet = false;
}
Pickup.prototype.update = function (dt) {
  this.t -= dt;
  if (this.t <= 0) { this.dead = true; return; }
  var P = Game.player;
  var d = U.dist(this.x, this.y, P.x, P.y);
  if (d < 60) this.magnet = true;
  if (this.magnet) {
    var a = U.ang(this.x, this.y, P.x, P.y);
    var pull = U.clamp((60 - d) * 12 + 120, 120, 500);
    this.x += Math.cos(a) * pull * dt;
    this.y += Math.sin(a) * pull * dt;
    if (d < 16) {
      this.dead = true;
      Game.pickup(this);
      return;
    }
  } else {
    /* 抛物线坠落，落回出生高度后停住（否则会无限下坠出世界） */
    this.x += this.vx * dt; this.vx *= 0.9;
    this.y += this.vy * dt; this.vy += 500 * dt;
    if (this.y >= this.groundY) { this.y = this.groundY; this.vy = 0; this.vx = 0; }
  }
};
Pickup.prototype.draw = function (g) {
  var sx = this.x - Game.cam.x, sy = this.y - Game.cam.y;
  var bob = Math.sin(Game.time * 4 + this.x) * 2;
  if (this.payload.gold) {
    g.fillStyle = '#ffd740';
    g.beginPath(); g.ellipse(sx, sy + bob, 5, 6, 0, 0, 6.28); g.fill();
    g.fillStyle = '#c8a020';
    g.fillRect(sx - 3, sy + bob + 1, 6, 2);
  } else if (this.payload.item) {
    var def = ITEMS[this.payload.item[0]];
    var icon = Sprites.iconCv(def.icon, def.color);
    g.drawImage(icon, sx - 9, sy - 9 + bob);
  } else if (this.payload.equip) {
    var ed = EQUIPS[this.payload.equip.id];
    var icon2 = Sprites.iconCv(ed.slot === 'weapon' ? ed.wt : ed.slot, ed.look.c);
    g.drawImage(icon2, sx - 9, sy - 9 + bob);
    g.strokeStyle = '#ffd740'; g.lineWidth = 1;
    g.strokeRect(sx - 10, sy - 10 + bob, 20, 20);
  }
  if (this.t < 5) {
    g.globalAlpha = Math.sin(Game.time * 10) * 0.4 + 0.6;
  }
  g.globalAlpha = 1;
};
