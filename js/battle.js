/* ============================================================
   《山海拾灵》战斗层：伤害管线 / 技能释放 / 元素连携
   捕捉 / 经验升级 / 进化 / 掉落
   全部通过 Battle.* 单点入口调用。
   ============================================================ */

var Battle = {

  /* ---------------- 查询 ---------------- */
  nearestMob: function (x, y, range) {
    var best = null, bd = range * range;
    for (var i = 0; i < Game.mobs.length; i++) {
      var m = Game.mobs[i];
      if (!m.alive || m.hp <= 0) continue;
      var d = U.dist2(x, y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  },

  /* ---------------- 伤害核心 ----------------
     atk × power/100 × 防御因子 × 元素克制 × 暴击 × 浮动 */
  calcHit: function (atk, atkLv, def, defLv, power) {
    var K = 60 + 13 * atkLv;
    var defFactor = K / (K + def * 1.8);
    return atk * (power / 100) * defFactor;
  },
  elemFactor: function (atkEl, defEl) { return elemMul(atkEl, defEl); },

  /* 统一命中入口：caster(Actor) 对 target(Actor) 打出 skill 的伤害 */
  applySkillHit: function (caster, target, sk, opts) {
    if (!target || target.hp <= 0) return;
    if (target.kind === 'player' && Game._respawning) return;
    opts = opts || {};
    var atkEl = sk.el || 'none';
    var defEl = target.sp ? target.sp.el : (target.kind === 'player' ? 'none' : 'none');
    var atkLv = caster.lv || 10;
    var power = sk.power * (opts.powerMul || 1);
    var base = this.calcHit(caster.st.atk, atkLv, target.st.def, target.lv || 1, power);
    /* 目标麻痹：雷伤 +25% */
    if (target.status.shock && atkEl === 'thunder') base *= 1.25;
    var ef = this.elemFactor(atkEl, defEl);
    base *= ef;
    /* 暴击 */
    var critChance = caster.kind === 'player' ? caster.st.crit : 0.06;
    var crit = U.chance(critChance);
    if (crit) base *= 1.8;
    base *= U.rand(0.9, 1.1);
    var dmg = Math.max(1, Math.round(base));

    /* 目标护盾 */
    if (target.shield > 0) {
      var absorb = Math.min(target.shield, dmg);
      target.shield -= absorb;
      dmg -= absorb;
      Game.addFx({ type: 'shield', x: target.x, y: target.y, t: 0.3 });
    }
    target.hp -= dmg;
    target.hurtT = 0.15;
    target.combatT = 3;
    if (caster.kind === 'player') caster.combatT = 3;
    /* 击退 */
    if (!opts.noKnock && sk.kind !== 'rain' && sk.kind !== 'chain') {
      target.applyKnock(U.ang(caster.x, caster.y, target.x, target.y), sk.kind === 'melee' ? 130 : 60);
    }
    /* 浮字 */
    var col = '#fff';
    if (ef > 1.1) col = '#ffd740';
    else if (ef < 0.9) col = '#9aa8b0';
    if (crit) col = '#ff8060';
    Game.addFloat(target.x + U.rand(-8, 8), target.y - 30, (crit ? '✦' : '') + dmg, col, crit ? 18 : 13);
    /* --- 命中反馈分级（对齐 demo）：普攻小飞溅；暴击叠元素爆裂+双冲击环 --- */
    Game.addFx({ type: 'hit', x: target.x, y: target.y - 10, t: 0.28, dur: 0.28, el: atkEl });
    if (crit) {
      var ec = ELEMENTS[atkEl] ? ELEMENTS[atkEl].color : '#ffd740';
      Game.addFx({ type: 'elemBurst', x: target.x, y: target.y - 10, t: 0.5, dur: 0.5, el: atkEl, n: 26, spread: 80 });
      Game.addFx({ type: 'ring', x: target.x, y: target.y - 6, r: 8, maxR: 26, t: 0.32, dur: 0.32, color: ec });
      Game.addFx({ type: 'ring', x: target.x, y: target.y - 6, r: 4, maxR: 16, t: 0.24, dur: 0.24, color: '#ffffff' });
      Game.shake(4 + Math.min(2, dmg * 0.002));
    }
    /* 受击顿帧：只有怪物挨打才给（玩家挨打开 hitStop 太难受） */
    if (target.kind === 'mob') Game.pulseHit(dmg);
    /* 火系命中偶尔留焦痕地斑 */
    if (atkEl === 'fire' && target.kind === 'mob' && U.chance(0.12)) {
      Game.addFx({ type: 'decal', x: target.x, y: target.y + 6, t: 2.2, dur: 2.2, radius: 26 });
    }
    /* 玩家受击：独立红闪通道（不与 flashC 抢占，防 BOSS 阶段闪被顶掉） */
    if (target.kind === 'player') {
      Game.shake(Math.min(7, dmg / Math.max(1, target.st.hp) * 90));
      Game.hurtFlash = Math.max(Game.hurtFlash || 0, 0.35);
    }
    SFX.play(crit ? 'crit' : 'hit');
    if (opts.combo !== false && (sk.el && sk.el !== 'none')) this.checkCombo(caster, target, sk);
    /* 状态附加 */
    if (sk.status && U.chance(sk.status[1]) && target.hp > 0) {
      this.applyStatusTo(target, sk.status[0], caster);
    }
    if (target.hp <= 0) this.onDeath(target, caster);
  },

  applyStatusTo: function (target, id, caster) {
    target.applyStatus(id, caster, STATUS[id].dur);
    Game.addFloat(target.x, target.y - 44, STATUS[id].name, STATUS[id].color, 12);
    SFX.play('stun');
  },

  /* ---------------- 元素连携（仅玩家侧：魔物命中不触发，防"怪打怪"） ---------------- */
  checkCombo: function (caster, target, sk) {
    if (!sk.el || sk.el === 'none') return;
    if (caster.kind !== 'player' && caster.kind !== 'pet') return;
    var now = Game.time;
    target._comboCd = target._comboCd || {};
    for (var i = 0; i < COMBOS.length; i++) {
      var cb = COMBOS[i];
      if (cb.need !== sk.el && cb.by !== sk.el) continue;
      var needStatus = target.status[cb.need], byEl = (sk.el === cb.by);
      if (!needStatus || !byEl) continue;
      if ((target._comboCd[cb.id] || 0) > now) return;
      target._comboCd[cb.id] = now + 2.5;
      this.fireCombo(caster, target, cb);
      return;
    }
  },
  fireCombo: function (caster, target, cb) {
    SFX.play('combo');
    Game.shake(5);
    Game.flash('rgba(255,180,255,0.14)');
    Game.addFloat(target.x, target.y - 52, '连携·' + cb.name + '！', '#ffb0e8', 16);
    Game.addFx({ type: 'elemBurst', x: target.x, y: target.y - 10, t: 0.5, dur: 0.5, el: cb.id === 'superconduct' ? 'thunder' : 'fire', n: 26, spread: cb.radius * 0.7 });
    Game.addFx({ type: 'boom', x: target.x, y: target.y - 10, t: 0.4, dur: 0.4, radius: cb.radius, el: 'thunder' });
    var hitList = [];
    if (cb.chain) {
      hitList.push(target);
      var pool = Game.mobs.filter(function (m) { return m.alive && m.hp > 0 && m !== target; });
      pool.sort(function (a, b) { return U.dist2(target.x, target.y, a.x, a.y) - U.dist2(target.x, target.y, b.x, b.y); });
      for (var i = 0; i < pool.length && hitList.length <= cb.chain; i++) hitList.push(pool[i]);
    } else {
      for (var j = 0; j < Game.mobs.length; j++) {
        var m = Game.mobs[j];
        if (m.alive && m.hp > 0 && U.dist2(m.x, m.y, target.x, target.y) < cb.radius * cb.radius) hitList.push(m);
      }
    }
    for (var k = 0; k < hitList.length; k++) {
      this.applySkillHit(caster, hitList[k], { name: cb.name, el: 'none', kind: 'aoe', power: cb.mult * 100 }, { combo: false, noKnock: false });
      if (cb.stun) this.applyStatusTo(hitList[k], 'stun', caster);
      if (cb.spread) this.applyStatusTo(hitList[k], cb.spread, caster);
      if (cb.id === 'detonate') this.applyStatusTo(hitList[k], 'burn', caster);  /* 爆燃刷新灼烧 */
    }
  },

  /* ---------------- DOT ---------------- */
  dotDamage: function (target, src, kind, pct) {
    if (!src || !src.st) return;
    var dmg = Math.max(1, Math.round(src.st.atk * pct));
    if (target.shield > 0) {
      var a = Math.min(target.shield, dmg);
      target.shield -= a; dmg -= a;
    }
    target.hp -= dmg;
    Game.addFloat(target.x + U.rand(-6, 6), target.y - 26, dmg, kind === 'burn' ? '#ff9060' : '#a8e060', 11);
    if (target.hp <= 0) this.onDeath(target, src);
  },

  /* ---------------- 玩家施法 ---------------- */
  /* slot: 'basic' 或技能序号 0..3 */
  playerCast: function (P, slot, autoTarget) {
    var skills = P.skills();
    var sid;
    if (slot === 'basic') sid = skills[0];
    else {
      sid = skills[slot];
      if (!sid) return;
    }
    var sk = SKILLS[sid];
    if ((P.cd[sid] || 0) > 0) return;
    if (P.mp < sk.mp) {
      if (slot !== 'basic') Game.nudge(P.x, P.y - 40, '魔力不足');
      return;
    }
    P.mp -= sk.mp;
    P.cd[sid] = sk.cd;
    var aim = P.aim;
    var tx = Input.mouse.x + Game.cam.x, ty = Input.mouse.y + Game.cam.y;
    if (autoTarget && slot === 'basic') { aim = U.ang(P.x, P.y, autoTarget.x, autoTarget.y); tx = autoTarget.x; ty = autoTarget.y; }
    this.castCommon(P, sk, aim, tx, ty);
  },

  /* 通用施法（玩家/灵宠/魔物共用演出与结算）；explicitTarget 供 heal/shield 指定目标 */
  castCommon: function (caster, sk, aim, tx, ty, explicitTarget) {
    var self = this;
    var el = sk.el || 'none';
    caster.walkT += 0.1;
    switch (sk.kind) {
      case 'melee': {
        /* 玩家侧大招感：三层弧 greatslash；怪仍是轻量 slash */
        if (caster.kind === 'player') {
          Game.addFx({ type: 'greatslash', x: caster.x + Math.cos(aim) * 14, y: caster.y - 8 + Math.sin(aim) * 14, t: 0.24, dur: 0.24, ang: aim, arc: sk.arc || 1.8, radius: sk.range || 46 });
        } else {
          Game.addFx({ type: 'slash', x: caster.x + Math.cos(aim) * 20, y: caster.y - 6 + Math.sin(aim) * 20, t: 0.18, dur: 0.18, ang: aim, arc: sk.arc || 1.8, radius: sk.range || 46 });
        }
        SFX.play('swing');
        this.hitArc(caster, aim, sk.range || 46, sk.arc || 1.8, sk);
        break;
      }
      case 'shot': {
        var n = sk.count || 1;
        for (var i = 0; i < n; i++) {
          var a = aim + (n > 1 ? U.lerp(-sk.spread, sk.spread, n === 1 ? 0.5 : i / (n - 1)) : 0);
          var speed = sk.speed || 400;
          Game.shots.push(this.makeProj(caster, sk, a, speed));
        }
        SFX.play('shot');
        break;
      }
      case 'aoe': {
        var cx2 = caster.x, cy2 = caster.y;
        if (sk.remote) {  /* 指定位置 */
          var dd = U.dist(caster.x, caster.y, tx, ty);
          if (dd > (sk.cast || 400)) {
            var cl = (sk.cast || 400) / dd;
            tx = caster.x + (tx - caster.x) * cl; ty = caster.y + (ty - caster.y) * cl;
          }
          cx2 = tx; cy2 = ty;
        }
        Game.addFx({ type: 'elemBurst', x: cx2, y: cy2, t: 0.5, dur: 0.5, el: el, n: 30, spread: sk.radius * 0.9 });
        Game.addFx({ type: 'boom', x: cx2, y: cy2, t: 0.45, dur: 0.45, radius: sk.radius, el: el });
        Game.addFx({ type: 'ring', x: cx2, y: cy2, r: 10, maxR: sk.radius * 0.8, t: 0.4, dur: 0.4, color: ELEMENTS[el] ? ELEMENTS[el].color : '#ffd740' });
        Game.shake(3 + Math.min(4, sk.radius * 0.02));
        SFX.play('boss');
        this.hitRadius(caster, cx2, cy2, sk.radius, sk);
        break;
      }
      case 'dash': {
        /* 突进：位移 + 残影 + 途经伤害 */
        var dx = Math.cos(aim), dy = Math.sin(aim);
        var steps = Math.ceil((sk.dash || 150) / 12);
        for (var s2 = 0; s2 < steps; s2++) {
          caster.x += dx * 12; caster.y += dy * 12;
          if (Game.map.hitAt(caster.x, caster.y, caster.r)) { caster.x -= dx * 12; caster.y -= dy * 12; break; }
          if (s2 % 2 === 0) Game.addFx({ type: 'afterimage', x: caster.x, y: caster.y, t: 0.3, dur: 0.3, r: caster.r });
        }
        Game.addFx({ type: 'greatslash', x: caster.x, y: caster.y - 8, t: 0.24, dur: 0.24, ang: aim, arc: 2.6, radius: sk.range || 50 });
        SFX.play('swing');
        this.hitArc(caster, aim, (sk.range || 50) + 20, 2.4, sk);
        break;
      }
      case 'chain': {
        /* 雷链：跳向最近敌人 */
        var cur = this.nearestMobInDir(caster, aim, 340);
        if (!cur) cur = this.nearestMob(caster.x, caster.y, 340);
        if (!cur) { Game.addFloat(caster.x, caster.y - 40, '没有目标', '#9aa8b0'); return; }
        var hit = [cur];
        var last = cur;
        for (var c2 = 0; c2 < (sk.jumps || 3); c2++) {
          var nxt = null, nd = 200 * 200;
          for (var mi = 0; mi < Game.mobs.length; mi++) {
            var mm = Game.mobs[mi];
            if (!mm.alive || mm.hp <= 0 || hit.indexOf(mm) >= 0) continue;
            var d3 = U.dist2(last.x, last.y, mm.x, mm.y);
            if (d3 < nd) { nd = d3; nxt = mm; }
          }
          if (!nxt) break;
          hit.push(nxt); last = nxt;
        }
        var prevPt = { x: caster.x, y: caster.y - 14 };
        for (var h2 = 0; h2 < hit.length; h2++) {
          Game.addFx({ type: 'bolt', x: hit[h2].x, y: hit[h2].y - 10, x0: prevPt.x, y0: prevPt.y, t: 0.3, dur: 0.3, el: 'thunder' });
          Game.addFx({ type: 'hit', x: hit[h2].x, y: hit[h2].y - 10, t: 0.28, dur: 0.28, el: 'thunder' });
          this.applySkillHit(caster, hit[h2], sk, { noKnock: true });
          prevPt = { x: hit[h2].x, y: hit[h2].y - 14 };
        }
        SFX.play('shot');
        break;
      }
      case 'rain': {
        /* 剑雨/星陨：目标区域延时多波（schedule 队列） */
        var txr = tx, tyr = ty;
        var dd2 = U.dist(caster.x, caster.y, txr, tyr);
        if (dd2 > (sk.cast || 420)) {
          var cl2 = (sk.cast || 420) / dd2;
          txr = caster.x + (txr - caster.x) * cl2; tyr = caster.y + (tyr - caster.y) * cl2;
        }
        Game.addFx({ type: 'ring', x: txr, y: tyr, r: 8, maxR: sk.radius, t: 0.8, dur: 0.8, color: ELEMENTS[el].color });
        var waves = sk.waves || 5;
        for (var w2 = 0; w2 < waves; w2++) {
          Game.schedule(w2 * ((sk.duration || 2.4) / waves), function () {
            if (Game.state !== 'play') return;
            for (var q = 0; q < (sk.count || 4); q++) {
              var ax = txr + U.rand(-sk.radius, sk.radius) * 0.8;
              var ay = tyr + U.rand(-sk.radius, sk.radius) * 0.8;
              Game.addFx({ type: 'meteor', x: ax, y: ay, t: 0.55, dur: 0.55, radius: 44 });
              Game.addFx({ type: 'boom', x: ax, y: ay, t: 0.35, dur: 0.35, radius: 44, el: el });
              if (el === 'fire' && q === 0) Game.addFx({ type: 'decal', x: ax, y: ay + 4, t: 2.4, dur: 2.4, radius: 24 });
              Game.shake(2);
              self.hitRadius(caster, ax, ay, 46, sk, 0.8);
            }
            SFX.play('boss');
          });
        }
        break;
      }
      case 'buff': {
        if (sk.dash) {
          var bx = Math.cos(aim) * sk.dash, by = Math.sin(aim) * sk.dash;
          var steps2 = Math.ceil(sk.dash / 10);
          for (var s3 = 0; s3 < steps2; s3++) {
            caster.x += Math.cos(aim) * 10; caster.y += Math.sin(aim) * 10;
            if (Game.map.hitAt(caster.x, caster.y, caster.r)) { caster.x -= Math.cos(aim) * 10; caster.y -= Math.sin(aim) * 10; break; }
          }
        }
        if (sk.buff) {
          var bstats = {};
          bstats[Object.keys(sk.buff)[0]] = Object.values(sk.buff)[0];
          caster.gainBuff && caster.gainBuff(sk.name, bstats, sk.buff.dur);
          if (caster.kind === 'pet') {
            /* 灵宠的威嚎 buff 玩家攻击 */
            Game.player.gainBuff(sk.name, { atk: 0.2 }, sk.buff.dur);
            Game.addFloat(caster.x, caster.y - 40, '威嚎！', '#ffd740');
          }
          Game.addFx({ type: 'shield', x: caster.x, y: caster.y, t: 0.5 });
        }
        SFX.play('heal');
        break;
      }
      case 'heal': {
        var tgt = explicitTarget;
        if (tgt) {
          var amt = Math.round(tgt.st.hp * sk.power / 100 + caster.st.atk * 0.5);
          tgt.hp = Math.min(tgt.st.hp, tgt.hp + amt);
          Game.addFloat(tgt.x, tgt.y - 40, '+' + amt, '#8fe08f');
          Game.addFx({ type: 'heal', x: tgt.x, y: tgt.y, t: 0.5, dur: 0.5 });
          SFX.play('heal');
        }
        break;
      }
      case 'shield': {
        var t2 = explicitTarget || caster;
        var amt2 = Math.round(t2.st.hp * (sk.shieldPct || 0.3));
        t2.shield = amt2;
        Game.addFloat(t2.x, t2.y - 40, '护盾 ' + amt2, '#8fc8f0');
        Game.addFx({ type: 'shield', x: t2.x, y: t2.y, t: 0.5 });
        SFX.play('heal');
        break;
      }
      case 'summon': {
        Battle.bossSummon(caster, sk.summonN || 2);
        break;
      }
    }
  },

  makeProj: function (caster, sk, ang, speed) {
    var style = 'bolt';
    if (caster.kind === 'player') {
      style = sk === SKILLS.shoot || sk === SKILLS.trishot || sk === SKILLS.stararrow ? 'arrow' : 'bolt';
    } else {
      style = sk.el === 'earth' ? 'rock' : 'bolt';
    }
    if (sk === SKILLS.stararrow) style = 'star';
    var r = 5 + (sk.wide || 0) / 4;
    return new Projectile({
      x: caster.x + Math.cos(ang) * 14, y: caster.y - 8 + Math.sin(ang) * 14,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: r, ttl: (sk.range || 400) / speed,
      faction: caster.kind === 'mob' ? 'mob' : 'player',
      owner: caster, atk: caster.st.atk,
      power: sk.power, el: sk.el || 'none', style: style,
      pierce: sk.pierce || 0, status: sk.status || null, skill: sk
    });
  },

  /* 扇形命中 */
  hitArc: function (caster, aim, range, arc, sk) {
    var hitAny = false;
    var targets = caster.kind === 'mob' ? [Game.player].concat(Game.pets) : Game.mobs;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t || !t.alive || t.hp <= 0) continue;
      if (t.kind === 'pet' && t.downT > 0) continue;
      var d = U.dist(caster.x, caster.y, t.x, t.y);
      if (d > range + t.r) continue;
      var a = U.ang(caster.x, caster.y, t.x, t.y);
      var diff = Math.abs(Math.atan2(Math.sin(a - aim), Math.cos(a - aim)));
      if (diff > arc / 2) continue;
      this.applySkillHit(caster, t, sk);
      hitAny = true;
    }
    return hitAny;
  },
  /* 圆形命中 */
  hitRadius: function (caster, cx, cy, radius, sk, powerMul) {
    var targets = caster.kind === 'mob' ? [Game.player].concat(Game.pets) : Game.mobs;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t || !t.alive || t.hp <= 0) continue;
      if (t.kind === 'pet' && t.downT > 0) continue;
      if (U.dist2(cx, cy, t.x, t.y) < (radius + t.r * 0.6) * (radius + t.r * 0.6)) {
        this.applySkillHit(caster, t, sk, { powerMul: powerMul || 1 });
      }
    }
  },
  nearestMobInDir: function (caster, aim, range) {
    var best = null, bs = -2;
    for (var i = 0; i < Game.mobs.length; i++) {
      var m = Game.mobs[i];
      if (!m.alive || m.hp <= 0) continue;
      var d = U.dist(caster.x, caster.y, m.x, m.y);
      if (d > range) continue;
      var a = U.ang(caster.x, caster.y, m.x, m.y);
      var dot = Math.cos(a - aim);
      if (dot > 0.4 && dot > bs) { bs = dot; best = m; }
    }
    return best;
  },

  /* 弹道命中结算 */
  projectileHit: function (proj, target) {
    this.applySkillHit(proj.owner, target, proj.skill || { name: '弹', el: proj.el, kind: 'shot', power: proj.power });
  },

  /* ---------------- 灵宠 / 魔物施法 ---------------- */
  petCast: function (pet, sid, target) {
    var sk = SKILLS[sid];
    if ((pet.cd[sid] || 0) > 0) return;
    pet.cd[sid] = sk.cd * 0.7;              /* 灵宠冷却略短 */
    if (sk.kind === 'heal' || sk.kind === 'shield') {
      this.castCommon(pet, sk, 0, 0, 0, target);
    } else if (sk.kind === 'buff') {
      this.castCommon(pet, sk, 0, 0, 0, null);
    } else {
      var aim = U.ang(pet.x, pet.y, target.x, target.y);
      pet.face = Math.cos(aim) >= 0 ? 1 : -1;
      this.castCommon(pet, sk, aim, target.x, target.y);
    }
  },
  mobCast: function (mob, sid, target) {
    var sk = SKILLS[sid];
    if ((mob.cd[sid] || 0) > 0) return;
    mob.cd[sid] = sk.cd * (mob.boss ? 0.9 : 1);
    var aim = U.ang(mob.x, mob.y, target.x, target.y);
    mob.face = Math.cos(aim) >= 0 ? 1 : -1;
    if (sk.spin) {
      /* 螺旋弹幕：4 个旋转发射器持续 2 秒 */
      for (var e = 0; e < 4; e++) {
        (function (phase) {
          var fired = 0;
          var emit = function () {
            if (!mob.alive || Game.state !== 'play') return;
            var a = phase + fired * 0.5;
            var p = Battle.makeProj(mob, sk, a, sk.speed || 260);
            p.av = 1.6; p.ttl = 2.4; p.r = 6;
            Game.shots.push(p);
            if (++fired < 12) Game.schedule(0.12, emit);
          };
          emit();
        })(e * Math.PI / 2 + Game.time);
      }
      SFX.play('boss');
      return;
    }
    if (sk.count && sk.spread > 3) {
      /* 环形弹幕 */
      for (var i = 0; i < sk.count; i++) {
        var a2 = aim + i / sk.count * sk.spread;
        Game.shots.push(this.makeProj(mob, sk, a2, sk.speed || 260));
      }
      SFX.play('shot');
      return;
    }
    this.castCommon(mob, sk, aim, target.x, target.y);
  },

  bossSummon: function (boss, n) {
    var spId = boss.sp.skills.some(function (s) { return SKILLS[s] && SKILLS[s].summonSp; })
      ? SKILLS[boss.sp.skills.filter(function (s) { return SKILLS[s].summonSp; })[0]].summonSp
      : 'hunling';
    for (var i = 0; i < n; i++) {
      var ang = i / n * Math.PI * 2;
      var m = new Monster(spId, Math.max(1, boss.lv - 4), { summoned: true });
      m.x = boss.x + Math.cos(ang) * 70; m.y = boss.y + Math.sin(ang) * 70;
      m.home = { x: m.x, y: m.y };
      m.aggro = true; m.target = Game.player;
      Game.mobs.push(m);
    }
    Game.addFx({ type: 'ring', x: boss.x, y: boss.y, r: 10, maxR: 120, t: 0.5, color: '#e8c860' });
    Game.addFloat(boss.x, boss.y - 60, '唤魂 ×' + n, '#e8c860', 15);
  },

  /* ---------------- 死亡结算 ---------------- */
  onDeath: function (target, killer) {
    if (target.hp > 0) return;
    if (target.kind === 'mob') {
      target.alive = false;
      SFX.play('die');
      Game.addFx({ type: 'boom', x: target.x, y: target.y - 10, t: 0.4, dur: 0.4, radius: 34, el: target.sp.el });
      this.gainExp(target);
      this.rollDrops(target);
      Game.onMobKilled(target, killer);
    } else if (target.kind === 'pet') {
      target.down();
    } else if (target.kind === 'player') {
      Game.playerDown();
    }
  },

  /* ---------------- 经验与升级 ---------------- */
  gainExp: function (mob) {
    var P = Game.player;
    var exp = Math.round(mob.sp.exp * (1 + mob.lv * 0.12) * (mob.shiny ? 3 : 1) * (mob.boss ? 1 : 1));
    var gold = Math.round((4 + mob.lv * 2.4) * (mob.shiny ? 4 : 1) * (mob.elite ? 2 : 1) * (mob.boss ? 6 : 1));
    P.exp += exp; P.gold += gold;
    Game.addFloat(mob.x, mob.y - 20, '+' + exp + ' exp', '#9fd8ff', 12);
    Game.addFloat(mob.x, mob.y - 4, '+' + gold + ' 金', '#ffd740', 12);   /* 金币即时入账，不再掉落（曾双发） */
    /* 灵宠分享 60% */
    var share = Math.round(exp * 0.6);
    Game.pets.forEach(function (pet) {
      if (pet.downT > 0) return;
      pet.rec.exp += share;
      pet.rec.killsWith = (pet.rec.killsWith || 0) + 1;
      while (pet.rec.lv < LEVEL_CAP && pet.rec.exp >= petExpToLevel(pet.rec.lv)) {
        pet.rec.exp -= petExpToLevel(pet.rec.lv);
        pet.rec.lv++;
        pet.st = petStat(pet.rec);
        if (pet.rec.shiny) { pet.st.hp = Math.round(pet.st.hp * SHINY_MUL); pet.st.atk = Math.round(pet.st.atk * SHINY_MUL * 10) / 10; pet.st.def = Math.round(pet.st.def * SHINY_MUL * 10) / 10; }
        if (Game.resonance) pet.st.atk = Math.round(pet.st.atk * 1.08 * 10) / 10;
        pet.hp = pet.st.hp;
        Game.addFloat(pet.x, pet.y - 46, pet.sp.name + ' Lv.' + pet.rec.lv, '#8fe08f', 15);
        Game.addFx({ type: 'levelup', x: pet.x, y: pet.y, t: 0.6, dur: 0.6 });
        this.checkEvolve(pet);
      }
      /* 进化条件可能先于升级满足（如高等级捕捉+并肩击杀）：每次击杀都检查 */
      this.checkEvolve(pet);
    }, this);
    /* 玩家升级 */
    while (P.lv < LEVEL_CAP && P.exp >= expToLevel(P.lv)) {
      P.exp -= expToLevel(P.lv);
      P.lv++;
      P.recalc();
      P.hp = P.st.hp; P.mp = P.st.mp;
      SFX.play('levelup');
      Game.addFloat(P.x, P.y - 60, '升级！Lv.' + P.lv, '#ffd740', 18);
      Game.addFx({ type: 'levelup', x: P.x, y: P.y, t: 0.8, dur: 0.8 });
      Game.onPlayerLevel(P.lv);
    }
  },

  /* ---------------- 进化 ---------------- */
  canEvolve: function (rec) {
    var sp = SPECIES[rec.sp];
    if (!sp.evo) return false;
    if (rec.lv < sp.evo.lv) return false;
    if (sp.evo.killsWith && (rec.killsWith || 0) < sp.evo.killsWith) return false;
    return true;
  },
  checkEvolve: function (pet) {
    if (!this.canEvolve(pet.rec)) return;
    var to = SPECIES[pet.rec.sp].evo.to;
    this.evolvePet(pet, to);
  },
  evolvePet: function (pet, to) {
    var old = pet.sp.name;
    pet.rec.sp = to;
    pet.sp = SPECIES[to];
    pet.st = petStat(pet.rec);
    if (pet.rec.shiny) { pet.st.hp = Math.round(pet.st.hp * SHINY_MUL); pet.st.atk = Math.round(pet.st.atk * SHINY_MUL * 10) / 10; pet.st.def = Math.round(pet.st.def * SHINY_MUL * 10) / 10; }
    if (Game.resonance) pet.st.atk = Math.round(pet.st.atk * 1.08 * 10) / 10;
    pet.hp = pet.st.hp;
    pet.skills = petSkills(pet.rec);
    SFX.play('evolve');
    Game.addFx({ type: 'evo', x: pet.x, y: pet.y - 10, t: 0.9, dur: 0.9 });
    Game.addFloat(pet.x, pet.y - 60, old + ' 进化为 ' + pet.sp.name + '！', '#ffd740', 17);
    Game.toast(old + ' 进化为 ' + pet.sp.name + '！');
    Game.dexCaughtUp(to);
    Game.save();                               /* 进化落盘 */
    Game.onEvolve(to);
  },

  /* ---------------- 捕捉 ---------------- */
  bestBall: function () {
    /* 低档优先：好索留给难得的灵物（E 投掷自动选最便宜可用档） */
    var bag = Game.bag;
    var order = ['fusuo', 'chijing', 'shanhaiyin'];
    for (var i = 0; i < order.length; i++) {
      if (bag[order[i]] > 0) return order[i];
    }
    return null;
  },
  tryCapture: function (P) {
    if (Game.capture) return;
    var ball = this.bestBall();
    if (!ball) { Game.nudge(P.x, P.y - 40, '没有缚灵索'); return; }
    /* 最近的可捕捉灵物 */
    var target = null, bd = 300 * 300;
    for (var i = 0; i < Game.mobs.length; i++) {
      var m = Game.mobs[i];
      if (!m.alive || m.hp <= 0) continue;
      if (m.boss) continue;
      if (m.summoned) continue;                 /* BOSS 唤魂不可捕捉 */
      var d = U.dist2(P.x, P.y, m.x, m.y);
      if (d < bd) { bd = d; target = m; }
    }
    if (!target) { Game.nudge(P.x, P.y - 40, '附近没有可捕捉的灵物'); return; }
    Game.bag[ball]--;
    if (Game.bag[ball] <= 0) delete Game.bag[ball];
    SFX.play('throw');
    var ball2 = new CaptureBall(P, target, ball);
    Game.capture = ball2;
    Game.shots.push(ball2);
  },
  captureRate: function (mob, ballId) {
    var base = mob.sp.catch;
    var ballMul = ITEMS[ballId].mul;
    var hpPct = U.clamp(mob.hp / mob.st.hp, 0, 1);
    var lvDiff = Game.player.lv - mob.lv;
    var lvMod = lvDiff >= 0 ? 1 : Math.max(0.2, 1 + lvDiff * 0.06);
    var statusBonus = 1;
    if (mob.status.stun) statusBonus = 1.5;
    else if (Object.keys(mob.status).length) statusBonus = 1.35;
    if (mob.shiny) statusBonus *= 0.75;
    var rate = base * ballMul * (1 - hpPct * 0.75) * lvMod * statusBonus;
    return U.clamp(rate, 0.02, 0.94);
  },
  captureSuccess: function (mob, ballId) {
    mob.alive = false;
    var rec = {
      sp: mob.spId, lv: mob.lv, exp: 0,
      iv: U.randInt(0, 15),
      temper: U.choice(Object.keys(TEMPERS)),
      shiny: !!mob.shiny,
      killsWith: 0
    };
    Game.addSpirit(rec);
    Game.addFx({ type: 'evo', x: mob.x, y: mob.y - 10, t: 0.8, dur: 0.8 });
    Game.addFloat(mob.x, mob.y - 50, '结契成功！' + SPECIES[mob.spId].name, '#ffd740', 16);
    Game.toast('成功收服 ' + SPECIES[mob.spId].name + '！（' + TEMPERS[rec.temper].name + '·资质 ' + rec.iv + '）');
    Game.stats.statCatch++;
    Game.dexCaughtUp(mob.spId);
    Game.questEvent('capture', { sp: mob.spId, shiny: !!mob.shiny });
    Game.checkAchv();
    if (mob.shiny) Game.toast('✨ 闪光灵物！');
    Game.save();   /* 结契是重要资产，立刻落盘 */
  },

  /* ---------------- 掉落 ---------------- */
  rollDrops: function (mob) {
    var theme = Game.map.def.theme;
    var table = MAT_DROPS[theme] || MAT_DROPS.grass;
    var n = mob.boss ? 4 : mob.elite ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var roll = Math.random(), acc = 0, drop = null;
      for (var j = 0; j < table.length; j++) {
        acc += table[j][1];
        if (roll < acc) { drop = table[j][0]; break; }
      }
      if (drop) Game.pickups.push(new Pickup(mob.x + U.rand(-14, 14), mob.y, { item: [drop, 1] }));
    }
    /* BOSS 固定掉落 + 唯一装备 */
    if (mob.boss) {
      var bd = Game.map.def.boss.drop || [];
      for (var b = 0; b < bd.length; b++) {
        Game.pickups.push(new Pickup(mob.x + U.rand(-20, 20), mob.y - 6, { item: [bd[b][0], bd[b][1]] }));
      }
      /* 首次掉唯一 */
      var uniqueDrop = { bifang: 'bifang_ling', zheng: null, gudiao: null, dijiang: 'dijiang_he', zhulong: 'zhulong_yan' }[mob.spId];
      if (uniqueDrop && !Game.flags['unique_' + uniqueDrop]) {
        Game.flags['unique_' + uniqueDrop] = 1;
        Game.pickups.push(new Pickup(mob.x, mob.y - 14, { equip: { id: uniqueDrop, plus: 0 } }));
        Game.toast('获得了唯一装备【' + EQUIPS[uniqueDrop].name + '】！');
      }
    }
    /* 装备掉落 */
    var chance = mob.boss ? 1 : mob.elite ? 0.3 : 0.045;
    if (U.chance(chance)) {
      var pool = equipDropPool(Game.player.lv);
      if (pool.length) {
        var eid = U.choice(pool);
        Game.pickups.push(new Pickup(mob.x + U.rand(-10, 10), mob.y - 8, { equip: { id: eid, plus: 0 } }));
      }
    }
    /* 缚灵索微量掉落 */
    if (!mob.boss && U.chance(0.06)) {
      Game.pickups.push(new Pickup(mob.x, mob.y + 6, { item: ['fusuo', 1] }));
    }
  }
};
