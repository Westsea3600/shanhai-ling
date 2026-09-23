/* ============================================================
   《山海拾灵》界面层：HUD / 面板 / 对话 / 商店 / 铁匠 / 标题
   单 overlay 容器 + innerHTML 整块重绘 + data-act 事件委托
   ============================================================ */

var UI = {
  open: '',           /* 当前面板：'' | menu | dialog | shop | smith | caravan | ending */
  menuTab: 'char',
  talkNpc: null,
  toasts: [],

  boot: function () {
    var self = this;
    this.$overlay = document.getElementById('overlay');
    this.$hud = document.getElementById('hud');
    this.$toasts = document.getElementById('toasts');
    this.$fade = document.getElementById('fade');
    /* 面板打开时游戏循环停更，Esc 必须在 document 层接管（开→关弹窗，再按→关面板） */
    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        if (self.open === 'title' || self.open === 'ending' || self.open === 'prologue') return;   /* 序章有自己的翻页键 */
        if (self.open) {
          var popup = document.querySelector('.popup-box');
          if (popup) { popup.remove(); return; }
          self.close();
        } else if (Game.state === 'play') {
          self.openMenu('sys');   /* 无面板时 Esc 打开系统页 */
        }
      } else if (self.open === 'title' && e.code === 'Enter') {
        var btn = document.querySelector('[data-act="start"]');
        if (btn) btn.click();
      }
    });
    /* 事件委托 */
    this.$overlay.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== self.$overlay) {
        if (el.getAttribute && el.getAttribute('data-act')) {
          var act = el.getAttribute('data-act');
          var arg = el.getAttribute('data-arg');
          self.action(act, arg, el);
          e.stopPropagation();
          return;
        }
        el = el.parentNode;
      }
      /* 点空白关闭（序章点空白=翻页） */
      if (e.target === self.$overlay && self.open && self.open !== 'ending') {
        if (self.open === 'prologue' && self._prologueNext) { self._prologueNext(); return; }
        self.close();
      }
    });
    this.$overlay.addEventListener('dblclick', function (e) {
      var el = e.target;
      while (el && el !== self.$overlay) {
        if (el.getAttribute && el.getAttribute('data-dbl')) {
          self.action(el.getAttribute('data-dbl'), el.getAttribute('data-arg'), el);
          e.stopPropagation();
          return;
        }
        el = el.parentNode;
      }
    });
    this.buildHud();
    this.showTitle();
  },

  isOpen: function () { return !!this.open; },

  /* ===================== 标题画面 ===================== */
  showTitle: function () {
    Game.state = 'title';
    this.open = 'title';
    this.$hud.classList.add('hidden');
    var hasSave = !!Store.get(Game.SAVE_KEY);
    var cls = Game.player ? Game.player.cls : (this._pickCls || 'sword');
    var cards = Object.keys(CLASSES).map(function (id) {
      var c = CLASSES[id];
      return '<div class="cls-card' + (cls === id ? ' sel' : '') + '" data-act="pickCls" data-arg="' + id + '">' +
        '<img class="cls-sprite" src="' + Sprites.playerCv(id, 0, 0, false).toDataURL() + '">' +
        '<img class="cls-weapon" src="' + Sprites.weaponCv(c.weapon, 0).toDataURL() + '">' +
        '<div class="cls-name">' + c.name + '</div>' +
        '<div class="cls-desc">' + c.desc + '</div>' +
        '<div class="cls-stats">生命 ' + c.base.hp + ' · 攻击 ' + c.base.atk + '<br>防御 ' + c.base.def + ' · 速度 ' + c.base.spd + '</div>' +
        '<div class="cls-skills">' + c.skills.map(function (s) { return 'Lv.' + s[0] + ' ' + SKILLS[s[1]].name; }).join('　') + '</div>' +
        '</div>';
    }).join('');
    this.$overlay.innerHTML =
      '<div class="title-wrap">' +
      '<div class="title-logo">山海拾灵</div>' +
      '<div class="title-sub">— 御灵 · 山海 · 行 —</div>' +
      '<div class="title-cards">' + cards + '</div>' +
      '<div class="title-row"><input id="nameInput" maxlength="6" placeholder="你的名字（最多6字）" value="' + (Game.player ? Game.player.name : '') + '"></div>' +
      '<div class="title-row">' +
      '<button class="btn big" data-act="start">启程</button>' +
      (hasSave ? '<button class="btn big ghost" data-act="continue">继续旅程</button>' : '') +
      '</div>' +
      '<div class="title-help">WASD 移动 · 鼠标左键攻击 · 1-4 技能 · E 捕捉 · F 对话/传送 · Q/R 喝药 · B 背包 · P 灵宠 · J 委托 · C 角色 · M 图鉴</div>' +
      '</div>';
    this.$overlay.classList.add('show');
  },

  /* ===================== HUD ===================== */
  buildHud: function () {
    this.$hud.classList.remove('hidden');
    var sb = document.getElementById('skillBar');
    sb.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var d = document.createElement('div');
      d.className = 'skill-slot';
      d.innerHTML = '<div class="sk-cd"></div><span class="sk-key"></span><span class="sk-name"></span>';
      sb.appendChild(d);
    }
    var qb = document.getElementById('quickBar');
    qb.innerHTML =
      '<div class="skill-slot sm" id="qHp"><span class="sk-key">Q</span><span class="sk-name"></span><span class="sk-cd"></span></div>' +
      '<div class="skill-slot sm" id="qMp"><span class="sk-key">R</span><span class="sk-name"></span><span class="sk-cd"></span></div>' +
      '<div class="skill-slot sm" id="qBall"><span class="sk-key">E</span><span class="sk-name"></span></div>';
  },
  _el: function (id) { return document.getElementById(id); },
  hud: function () {
    if (Game.state !== 'play') return;
    var P = Game.player;
    if (!P) return;
    this._el('pName').textContent = P.name;
    this._el('pLv').textContent = 'Lv.' + P.lv;
    var hpPct = U.clamp(P.hp / P.st.hp * 100, 0, 100);
    this._el('pHpFill').style.width = hpPct + '%';
    this._el('pHpTxt').textContent = Math.ceil(P.hp) + '/' + P.st.hp;
    var mpPct = U.clamp(P.mp / P.st.mp * 100, 0, 100);
    this._el('pMpFill').style.width = mpPct + '%';
    this._el('pMpTxt').textContent = Math.floor(P.mp) + '/' + P.st.mp;
    var xpNeed = expToLevel(P.lv);
    this._el('pXpFill').style.width = (P.lv >= LEVEL_CAP ? 100 : U.clamp(P.exp / xpNeed * 100, 0, 100)) + '%';
    this._el('pXpTxt').textContent = P.lv >= LEVEL_CAP ? 'MAX' : Math.floor(P.exp / xpNeed * 100) + '%';
    this._el('pGold').textContent = U.fmt(P.gold);
    this._el('mapName').textContent = Game.map.def.name + (Game.map.def.safe ? '' : '　Lv.' + Game.map.def.lv[0] + '-' + Game.map.def.lv[1]);
    /* 头像 */
    var port = this._el('pPortrait');
    if (!port._cls || port._cls !== P.cls) {
      port._cls = P.cls;
      port.style.background = 'url(' + Sprites.playerCv(P.cls, P.tier(), 0, false).toDataURL() + ') center/contain no-repeat';
    }
    /* 技能栏 */
    var skills = P.skills();
    var sb = this._el('skillBar');
    for (var i = 0; i < 4; i++) {
      var slot = sb.children[i];
      if (!slot) break;
      var sid = skills[i];
      if (slot._sid !== sid) {
        slot._sid = sid;
        var sk = SKILLS[sid];
        slot.querySelector('.sk-name').textContent = sk ? sk.name : '';
        slot.querySelector('.sk-key').textContent = (i + 1);
        slot.title = sk ? (sk.name + '：' + (sk.desc || '') + (sk.mp ? '（' + sk.mp + ' MP）' : '')) : '';
        var elc = sk && sk.el !== 'none' ? ELEMENTS[sk.el].color : '#cfd8dc';
        slot.style.background = U.rgba(elc, 0.18);
      }
      var cd = sid ? (P.cd[sid] || 0) : 0;
      var maxCd = sid ? SKILLS[sid].cd : 1;
      slot.querySelector('.sk-cd').style.height = (cd > 0 ? U.clamp(cd / maxCd * 100, 0, 100) : 0) + '%';
      slot.classList.toggle('oncd', cd > 0);
      /* 冷却剩余秒数直接标在键位上 */
      var keyEl = slot.querySelector('.sk-key');
      var wantKey = (i + 1);
      if (cd > 0.05) { var t2 = cd.toFixed(1); if (keyEl._t !== t2) { keyEl.textContent = t2; keyEl._t = t2; } }
      else if (keyEl._t !== wantKey) { keyEl.textContent = wantKey; keyEl._t = wantKey; }
    }
    /* 快捷栏 */
    this._potionChip('qHp', ['huichun', 'dahun']);
    this._potionChip('qMp', ['ningshen', 'shenquan']);
    var ballN = (Game.bag.fusuo || 0) + (Game.bag.chijing || 0) + (Game.bag.shanhaiyin || 0);
    var qb = this._el('qBall');
    qb.querySelector('.sk-name').textContent = ballN > 0 ? ballN : '—';
    qb.classList.toggle('oncd', ballN <= 0);
    qb.title = '缚灵索 ×' + (Game.bag.fusuo || 0) + '　赤晶索 ×' + (Game.bag.chijing || 0) + '　山海印 ×' + (Game.bag.shanhaiyin || 0);
    /* 灵宠栏 */
    var hudPets = this._el('hudPets');
    var key = Game.pets.map(function (p) { return p.rec.uid + ':' + p.rec.lv + ':' + (p.downT > 0 ? 1 : 0); }).join('|') + '#' + Game.petMode;
    if (hudPets._key !== key) {
      hudPets._key = key;
      var html = Game.pets.map(function (p) {
        var down = p.downT > 0;
        var hpP = U.clamp(p.hp / p.st.hp * 100, 0, 100);
        return '<div class="pet-chip' + (down ? ' down' : '') + '">' +
          '<img src="' + Sprites.portraitUrl(p.rec.sp, p.rec.shiny) + '">' +
          '<div class="pet-mini"><div class="pet-nm">' + p.sp.name + ' Lv.' + p.rec.lv + (p.rec.shiny ? '✨' : '') + '</div>' +
          '<div class="pet-hp"><i style="width:' + (down ? 0 : hpP) + '%"></i></div></div></div>';
      }).join('');
      if (!Game.pets.length) html = '<div class="pet-chip none">无出战灵宠（P 键编队）</div>';
      hudPets.innerHTML = html;
    }
    /* 模式芯片 */
    this._el('petMode').innerHTML = (Game.resonance ? '<b class="reso">✦共鸣</b>　' : '') + '灵宠：<b data-act="cyclePetMode">' +
      { attack: '进攻', defend: '防守', follow: '跟随' }[Game.petMode] + '</b>　|　自动：<b data-act="cycleAuto">' + (P.auto ? '开' : '关') + '</b>';
    /* BOSS 倒计时 */
    var bt = this._el('bossTimer');
    var bs = Game.bossState[Game.map.id];
    if (Game.map.def.boss && bs && !bs.alive) {
      bt.style.display = '';
      bt.innerHTML = '◆ ' + SPECIES[Game.map.def.boss.sp].name + ' 重生：' + U.timeText(bs.t);
    } else bt.style.display = 'none';
    /* 事件条 */
    var et = this._el('eventTrack');
    if (Game.event) {
      et.style.display = '';
      var names = { migration: '✨ 灵物迁徙', frenzy: '⚠ 兽潮涌动', caravan: '🛒 行脚商队', treasure: '💰 藏宝现世' };
      et.innerHTML = names[Game.event.type] + '　<em>' + Math.ceil(Game.event.t) + 's</em>';
    } else et.style.display = 'none';
    /* 委托追踪（最多 3 行，更多折叠，避免顶到 BOSS 倒计时） */
    var qt = this._el('questTrack');
    var qh = '', shownN = 0, hiddenN = 0;
    function qProg(q, st) {
      var g = q.goal;
      if (g.type === 'item') return Math.min((Game.bag[g.item] || 0), g.n) + '/' + g.n;
      if (g.type === 'dex') return Math.min(Game.dexCaughtCount(), g.n) + '/' + g.n;
      if (g.type === 'stelae') return Math.min(Game.stelaeCount(), g.n) + '/' + g.n;
      return Math.min(st.p, g.n) + '/' + g.n;
    }
    Object.keys(Game.quests).forEach(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      if (!q) return;
      var st = Game.quests[qid];
      var ready = Game.questReady(q);
      var prog = qProg(q, st);
      if (shownN < 3) {
        qh += '<div class="qt-line' + (ready ? ' ready' : '') + '">' + (q.main ? '★' : '◈') + ' ' + q.name +
          (ready ? ' <em>✔ 可交付</em>' : ' <em>' + prog + '</em>') + '</div>';
        shownN++;
      } else hiddenN++;
    });
    if (hiddenN > 0) qh += '<div class="qt-line dim">…还有 ' + hiddenN + ' 项（J 查看）</div>';
    if (!qh) qh = '<div class="qt-line dim">暂无进行中的委托</div>';
    if (qt._h !== qh) { qt._h = qh; qt.innerHTML = qh; }
  },
  _potionChip: function (id, order) {
    var el = this._el(id);
    var total = 0, first = null;
    order.forEach(function (i) {
      total += Game.bag[i] || 0;
      if (!first && Game.bag[i] > 0) first = ITEMS[i];
    });
    el.querySelector('.sk-name').textContent = total > 0 ? total : '—';
    el.classList.toggle('oncd', total <= 0);
    el.title = first ? first.name + '（' + first.desc + '）' : '没有药水';
  },
  usePotion: function (type) {
    var order = type === 'hp' ? ['huichun', 'dahun'] : ['ningshen', 'shenquan'];
    for (var i = 0; i < order.length; i++) {
      if (Game.bag[order[i]] > 0) { Game.useItem(order[i]); return; }
    }
    Game.nudge(Game.player.x, Game.player.y - 40, type === 'hp' ? '没有血药' : '没有蓝药');
  },

  /* ===================== 通用面板 ===================== */
  openMenu: function (tab) {
    this.open = 'menu';
    this.menuTab = tab || this.menuTab;
    this.renderMenu();
    SFX.play('ui');
  },
  close: function () {
    this.open = '';
    this.$overlay.innerHTML = '';
    this.$overlay.classList.remove('show');
  },
  renderMenu: function () {
    var tabs = [
      ['char', '角色(C)'], ['bag', '背包(B)'], ['spirit', '灵宠(P)'],
      ['dex', '图鉴(D)'], ['quest', '委托(J)'], ['sys', '系统']
    ];
    var body = this['tab_' + this.menuTab]();
    this.$overlay.innerHTML =
      '<div class="menu-box">' +
      '<div class="menu-tabs">' + tabs.map(function (t) {
        return '<span class="mtab' + (t[0] === UI.menuTab ? ' sel' : '') + '" data-act="tab" data-arg="' + t[0] + '">' + t[1] + '</span>';
      }).join('') +
      '<span class="mtab close-x" data-act="close">✕ Esc</span></div>' +
      '<div class="menu-body">' + body + '</div></div>';
    this.$overlay.classList.add('show');
  },

  /* ---------- 角色 ---------- */
  tab_char: function () {
    var P = Game.player;
    var slots = Object.keys(SLOT_NAME).map(function (slot) {
      var e = P.equip[slot];
      if (!e) return '<div class="eq-slot empty" data-act="hint" data-arg="未装备"><span>' + SLOT_NAME[slot] + '</span><em>—</em></div>';
      var d = EQUIPS[e.id];
      return '<div class="eq-slot" data-act="unequip" data-arg="' + slot + '" title="点击卸下">' +
        '<img src="' + Sprites.iconUrl(d.slot === 'weapon' ? d.wt : d.slot, d.look.c) + '">' +
        '<span>' + SLOT_NAME[slot] + '</span><em>' + equipName(e.id, e.plus || 0) + '</em></div>';
    }).join('');
    var st = P.st;
    var achv = ACHIEVEMENTS.map(function (a) {
      var got = Game.achv[a.id];
      return '<div class="achv' + (got ? ' got' : '') + '">' + (got ? '🏆' : '◻') + ' <b>' + a.name + '</b> ' + a.desc + '</div>';
    }).join('');
    var skills = P.skills().map(function (sid, i) {
      var sk = SKILLS[sid];
      return '<div class="sk-row"><b>' + (i + 1) + ' ' + sk.name + '</b>' +
        '<span class="el-tag" style="color:' + (sk.el !== 'none' ? ELEMENTS[sk.el].color : '#cfd8dc') + '">' + (sk.el !== 'none' ? ELEMENTS[sk.el].name : '无') + '</span>' +
        '<span>' + (sk.desc || '') + '</span></div>';
    }).join('');
    return '<div class="two-col">' +
      '<div class="col">' +
      '<div class="sec-title">' + P.name + ' · ' + CLASSES[P.cls].name + ' · Lv.' + P.lv + '（经验 ' + Math.floor(P.exp) + '/' + expToLevel(P.lv) + '）</div>' +
      '<div class="stat-grid">' +
      '<span>生命</span><b>' + Math.ceil(P.hp) + ' / ' + st.hp + '</b>' +
      '<span>魔力</span><b>' + Math.floor(P.mp) + ' / ' + st.mp + '</b>' +
      '<span>攻击</span><b>' + st.atk + '</b>' +
      '<span>防御</span><b>' + st.def + '</b>' +
      '<span>速度</span><b>' + st.spd + '</b>' +
      '<span>暴击</span><b>' + Math.round(st.crit * 100) + '%</b>' +
      '<span>金币</span><b class="gold">' + P.gold + '</b>' +
      '<span>游玩</span><b>' + U.timeText(Game.playTime) + '</b>' +
      '</div>' +
      '<div class="sec-title">装备（点击卸下）</div>' +
      '<div class="eq-grid">' + slots + '</div>' +
      '</div><div class="col">' +
      '<div class="sec-title">技能</div>' + skills +
      '<div class="sec-title">成就（' + Object.keys(Game.achv).length + '/' + ACHIEVEMENTS.length + '）</div>' +
      '<div class="achv-list">' + achv + '</div>' +
      '</div></div>';
  },

  /* ---------- 背包 ---------- */
  tab_bag: function () {
    var P = Game.player;
    var items = Object.keys(Game.bag).sort(cmpItemId).map(function (id) {
      var d = ITEMS[id];
      return '<div class="item-cell" data-act="itemInfo" data-arg="' + id + '" data-dbl="useItem" title="' + d.name + ' ×' + Game.bag[id] + '">' +
        '<img src="' + Sprites.iconUrl(d.icon, d.color) + '">' +
        '<span class="ic-n">' + Game.bag[id] + '</span>' +
        '<span class="ic-name">' + d.name + '</span></div>';
    }).join('') || '<div class="dim">背包空空如也</div>';
    var equips = P.equipBag.length ? P.equipBag.map(function (e, idx) {
      var d = EQUIPS[e.id];
      var st = equipStats(d, e.plus || 0);
      var stStr = Object.keys(st).map(function (k) {
        return { atk: '攻', def: '防', hp: '命', mp: '魔', spd: '速', crit: '暴' }[k] + '+' + st[k];
      }).join(' ');
      return '<div class="equip-row" data-act="equipInfo" data-arg="' + idx + '" data-dbl="equip" title="' + equipName(e.id, e.plus || 0) + '">' +
        '<img src="' + Sprites.iconUrl(d.slot === 'weapon' ? d.wt : d.slot, d.look.c) + '">' +
        '<div><b>' + equipName(e.id, e.plus || 0) + '</b>' +
        '<div class="dim">' + SLOT_NAME[d.slot] + ' · 需 Lv.' + d.lv + ' · ' + stStr + '</div></div>' +
        '<span class="tag">' + (e.plus ? '+' + e.plus : '') + '</span></div>';
    }).join('') : '<div class="dim">没有备用装备</div>';
    return '<div class="sec-title">道具（双击直接使用）</div>' +
      '<div class="item-grid">' + items + '</div>' +
      '<div class="sec-title">装备（双击装备）</div>' +
      '<div class="equip-list">' + equips + '</div>' +
      '<div class="dim tip">提示：传送符点击后选择目的地；装备也可在铁匠处强化（+6 上限）</div>';
  },

  /* ---------- 灵宠 ---------- */
  tab_spirit: function () {
    var teamHtml = [0, 1, 2].map(function (i) {
      var uid = Game.team[i];
      var rec = uid ? Game.spiritByUid(uid) : null;
      if (!rec) return '<div class="team-slot empty"><span>出战位 ' + (i + 1) + '</span><em>空</em></div>';
      var st = petStat(rec);
      return '<div class="team-slot" data-act="untteam" data-arg="' + i + '">' +
        '<img src="' + Sprites.portraitUrl(rec.sp, rec.shiny) + '">' +
        '<div><b>' + SPECIES[rec.sp].name + (rec.shiny ? '✨' : '') + ' Lv.' + rec.lv + '</b>' +
        '<div class="dim">' + TEMPERS[rec.temper].name + ' · 资质 ' + rec.iv + ' · ' + ELEMENTS[SPECIES[rec.sp].el].name + '系</div></div>' +
        '<span class="tag">出战</span></div>';
    }).join('');
    var list = Game.spirits.map(function (rec) {
      var inTeam = Game.team.indexOf(rec.uid) >= 0;
      var st = petStat(rec);
      var evo = SPECIES[rec.sp].evo;
      var evoStr = evo ? ('进化 → ' + SPECIES[evo.to].name + '（' + evoText(SPECIES[rec.sp]) +
        '｜并肩击杀 ' + (rec.killsWith || 0) + '/' + (evo.killsWith || 0) + '）') : '已是大成形态';
      return '<div class="spirit-row" data-act="spiritInfo" data-arg="' + rec.uid + '">' +
        '<img src="' + Sprites.portraitUrl(rec.sp, rec.shiny) + '">' +
        '<div class="sp-main"><b>' + SPECIES[rec.sp].name + (rec.shiny ? '✨' : '') + '</b> Lv.' + rec.lv +
        '<div class="dim">' + TEMPERS[rec.temper].name + ' · 资质 ' + rec.iv + ' · 攻' + st.atk + ' 防' + st.def + ' 血' + st.hp + ' 速' + st.spd + '</div>' +
        '<div class="dim">' + evoStr + '</div></div>' +
        (inTeam ? '<span class="tag">出战中</span>' : '<button class="btn xs" data-act="team" data-arg="' + rec.uid + '">出战</button>') +
        '</div>';
    }).join('') || '<div class="dim">还没有灵物——去野外按 E 捕捉吧！</div>';
    return '<div class="sec-title">出战编队（最多 3 只，点击出战位可撤下）</div>' +
      '<div class="team-grid">' + teamHtml + '</div>' +
      '<div class="sec-title">灵物一览（点击查看详情，出战者随行获得 60% 经验）</div>' +
      '<div class="spirit-list">' + list + '</div>';
  },

  /* ---------- 图鉴 ---------- */
  tab_dex: function () {
    var ids = Object.keys(SPECIES).sort(cmpSpeciesId);
    var caught = Game.dexCaughtCount();
    var cells = ids.map(function (id) {
      var sp = SPECIES[id];
      var seen = Game.dex.seen[id], got = Game.dex.caught[id], beat = Game.dex.beaten[id];
      var state = got ? 'got' : (beat ? 'beat' : (seen ? 'seen' : 'unk'));
      var known = !!(seen || got || beat);
      var nm = known ? sp.name : '？？？';
      var borderC = ['#8a8a96', '#7ec8ff', '#7ec8ff', '#c8a0ff', '#ffb060', '#ff7040'][sp.rare] || '#8a8a96';
      return '<div class="dex-cell ' + state + '" data-act="dexInfo" data-arg="' + id + '" style="border-color:' + (known ? borderC : '#4a3f5a') + '">' +
        (state === 'unk' ? '<div class="silh">?</div>' : '<img src="' + Sprites.portraitUrl(id, false) + '">') +
        '<span>' + nm + '</span>' +
        (known && sp.boss ? '<i class="boss-tag">守护者</i>' : '') +
        (known && sp.evolved ? '<i class="evo-tag">进化</i>' : '') +
        '</div>';
    }).join('');
    return '<div class="sec-title">山海图鉴　收录 ' + caught + ' / ' + Object.keys(SPECIES).length +
      '（捕捉即收录 · 守护者凭击败收录 · 进化形态凭进化收录）</div>' +
      '<div class="sec-title">山海遗刻　' + Game.stelaeCount() + ' / ' + STELAE.length +
      '（散布各图的古碑，走近按 F 读取——集齐可获遗刻完璧之赏）</div>' +
      '<div class="dex-grid">' + STELAE.map(function (st) {
        var got = Game.flags.stelaeFound && Game.flags.stelaeFound[st.id];
        return '<div class="dex-cell ' + (got ? 'got' : 'unk') + '" title="' + (got ? st.name + '（' + MAPS[st.map].name + '）' : '未发现 · ' + MAPS[st.map].name) + '">' +
          (got ? '<span>◈</span>' : '<div class="silh">?</div>') +
          '<span>' + (got ? st.name : MAPS[st.map].name + '？') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="dex-grid">' + cells + '</div>';
  },

  /* ---------- 委托 ---------- */
  tab_quest: function () {
    var active = Object.keys(Game.quests).map(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      var st = Game.quests[qid];
      var ready = Game.questReady(q);
      var prog;
      if (q.goal.type === 'item') prog = Math.min((Game.bag[q.goal.item] || 0), q.goal.n) + '/' + q.goal.n;
      else if (q.goal.type === 'dex') prog = Math.min(Game.dexCaughtCount(), q.goal.n) + '/' + q.goal.n;
      else if (q.goal.type === 'stelae') prog = Math.min(Game.stelaeCount(), q.goal.n) + '/' + q.goal.n;
      else prog = Math.min(st.p, q.goal.n) + '/' + q.goal.n;
      return '<div class="quest-row' + (ready ? ' ready' : '') + '">' +
        '<b>' + (q.main ? '★ 主线' : q.hidden ? '◇ 隐线' : '◈ 支线') + ' · ' + q.name + '</b>' +
        '<div>' + q.text + '</div>' +
        '<div class="dim">委托人：' + questGiveText(q) + (ready ? '　<em class="ok">✔ 可交付</em>' : '　进度 ' + prog) + '</div></div>';
    }).join('') || '<div class="dim">没有进行中的委托</div>';
    var done = Object.keys(Game.questsDone).map(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      return q ? '<div class="quest-row done"><b>✔ ' + q.name + '</b></div>' : '';
    }).join('');
    var acceptable = QUESTS.filter(function (q) {
      return !q.main && !q.hidden && !Game.quests[q.id] && !Game.questsDone[q.id];
    }).map(function (q) {
      return '<div class="quest-row avail"><b>◈ ' + q.name + '</b><div>' + q.text + '</div>' +
        '<div class="dim">委托人：' + questGiveText(q) + ' · 去找 TA 接取</div></div>';
    }).join('');
    return '<div class="sec-title">进行中</div>' + active +
      '<div class="sec-title">可接取（支线）</div>' + (acceptable || '<div class="dim">暂无可接取的支线</div>') +
      (done ? '<div class="sec-title">已完成</div>' + done : '');
  },

  /* ---------- 系统 ---------- */
  tab_sys: function () {
    return '<div class="sys-col">' +
      '<button class="btn" data-act="save">保存进度（F5）</button>' +
      '<button class="btn" data-act="toggleSfx">音效：' + (SFX.on ? '开' : '关') + '</button>' +
      '<button class="btn ghost" data-act="showExport">导出存档</button>' +
      '<button class="btn ghost" data-act="showImport">导入存档</button>' +
      '<button class="btn danger" data-act="toTitle">回到标题（自动保存）</button>' +
      '</div>' +
      '<div class="sec-title">操作说明</div>' +
      '<div class="help-grid">' +
      '<span>WASD / 方向键</span><b>移动</b>' +
      '<span>鼠标左键 / 空格</span><b>普通攻击（朝准星）</b>' +
      '<span>1 ~ 4</span><b>职业技能</b>' +
      '<span>右键</span><b>点地移动</b>' +
      '<span>E</span><b>投掷缚灵索捕捉</b>' +
      '<span>F</span><b>对话 / 传送门</b>' +
      '<span>Q / R</span><b>血药 / 魔药</b>' +
      '<span>T</span><b>自动战斗开关</b>' +
      '<span>H</span><b>灵宠战术：进攻/防守/跟随</b>' +
      '<span>B P J C M</span><b>背包 / 灵宠 / 委托 / 角色 / 图鉴</b>' +
      '<span>Esc / Tab</span><b>系统菜单</b>' +
      '</div>' +
      '<div class="sec-title">属性克制</div>' +
      '<div class="dim">火→木→水→火　雷→风→土→雷（克制 ×1.5，被克 ×0.67，同属性 ×0.8）<br>' +
      '连携：灼烧+风=爆燃 · 灼烧+雷=过载 · 滋毒+火=毒爆 · 麻痹+水=超导 · 缓流+土=潮陷</div>';
  },

  /* ===================== 对话 ===================== */
  npcMark: function (npcId) {
    var ready = false, canAccept = false;
    Object.keys(Game.quests).forEach(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      if (q && q.giver === npcId && Game.questReady(q)) ready = true;
    });
    QUESTS.forEach(function (q) {
      if (q.giver !== npcId) return;
      if (q.main) return;
      if (!Game.quests[q.id] && !Game.questsDone[q.id] && Game.player.lv >= q.lv - 2) canAccept = true;
      if (Game.quests[q.id] && !Game.questsDone[q.id]) canAccept = true;
    });
    if (ready) return 'turnin';
    if (canAccept) return 'quest';
    return null;
  },
  talk: function (npcId) {
    this.open = 'dialog';
    this.talkNpc = npcId;
    var npc = null;
    (Game.map.def.npcs || []).forEach(function (n) { if (n.id === npcId) npc = n; });
    if (!npc) { this.close(); return; }
    var opts = [];
    /* 委托交互 */
    Object.keys(Game.quests).forEach(function (qid) {
      var q = QUESTS.filter(function (x) { return x.id === qid; })[0];
      if (q && q.giver === npcId && Game.questReady(q)) {
        opts.push({ act: 'turnin', arg: qid, label: '交付委托【' + q.name + '】' });
      }
    });
    QUESTS.forEach(function (q) {
      if (q.giver !== npcId || q.main) return;
      if (!Game.quests[q.id] && !Game.questsDone[q.id] && Game.player.lv >= q.lv - 2) {
        opts.push({ act: 'accept', arg: q.id, label: '（接取）' + q.name + '：' + q.text });
      }
    });
    /* 角色功能 */
    if (npc.role === 'shop') opts.push({ act: 'shop', label: '看看货（买卖）' });
    if (npc.role === 'smith') opts.push({ act: 'smith', label: '打造与强化（铁匠铺）' });
    if (npc.role === 'heal') opts.push({ act: 'healAll', label: '请帮我治疗（免费）' });
    if (npcId === 'elder') opts.push({ act: 'lore', arg: 'elder', label: '聊聊天' });
    if (npcId === 'lingyu') opts.push({ act: 'lore', arg: 'lingyu', label: '请教御灵之道' });
    opts.push({ act: 'close', label: '告辞' });
    var line = npc.lines || '……';
    /* 分支对话：按 flags/进度现算，取第一条满足项（fallback 到 NPC 默认台词） */
    var lore = line;
    if (NPC_LINES[npcId]) {
      for (var li = 0; li < NPC_LINES[npcId].length; li++) {
        var LN = NPC_LINES[npcId][li];
        if (!LN.if || LN.if(Game)) { lore = LN.t; break; }
      }
    }
    var face = npc.face;
    this.$overlay.innerHTML =
      '<div class="dialog-box">' +
      '<div class="dlg-head"><img class="dlg-face" src="' + Sprites.npcCv(face, 0).toDataURL() + '">' +
      '<div><b>' + npc.name + '</b><div class="dim">' + (Game.map.def.name) + '</div></div></div>' +
      '<div class="dlg-text">' + lore + '</div>' +
      '<div class="dlg-opts">' + opts.map(function (o, i) {
        return '<div class="dlg-opt" data-act="' + o.act + '" data-arg="' + (o.arg || '') + '">' + o.label + '</div>';
      }).join('') + '</div></div>';
    this.$overlay.classList.add('show');
    SFX.play('ui');
  },

  /* ===================== 商店 ===================== */
  shopTab: 'buy',
  openShop: function (stockList, title) {
    this.open = 'shop';
    this.shopStock = stockList || SHOP_STOCK;
    this.shopTitle = title || '落霞村 · 杂货铺';
    this.shopTab = 'buy';
    this.renderShop();
    SFX.play('ui');
  },
  renderShop: function () {
    var P = Game.player;
    var body;
    if (this.shopTab === 'buy') {
      body = this.shopStock.map(function (id) {
        var d = ITEMS[id];
        if (!d) {
          /* 商队货单里的装备：走装备渲染与购买管线 */
          var ed = EQUIPS[id];
          if (!ed) return '';
          if (ed.slot === 'weapon' && ed.wt !== CLASSES[P.cls].weapon) return '';
          var stS = equipStats(ed, 0);
          var stStr = Object.keys(stS).map(function (k) {
            return { atk: '攻', def: '防', hp: '命', mp: '魔', spd: '速', crit: '暴' }[k] + '+' + stS[k];
          }).join(' ');
          return '<div class="shop-row">' +
            '<img src="' + Sprites.iconUrl(ed.slot === 'weapon' ? ed.wt : ed.slot, ed.look.c) + '">' +
            '<div class="sp-main"><b>' + ed.name + (ed.unique ? '（唯一）' : '') + '</b>' +
            '<div class="dim">' + SLOT_NAME[ed.slot] + ' · 需 Lv.' + ed.lv + ' · ' + stStr + '</div></div>' +
            '<span class="price">' + ed.price + ' 金</span>' +
            '<button class="btn xs" data-act="buyEquip" data-arg="' + id + '"' + (P.gold < ed.price ? ' disabled' : '') + '>买</button>' +
            '</div>';
        }
        return '<div class="shop-row">' +
          '<img src="' + Sprites.iconUrl(d.icon, d.color) + '">' +
          '<div class="sp-main"><b>' + d.name + '</b><div class="dim">' + d.desc + '</div></div>' +
          '<span class="price">' + d.price + ' 金</span>' +
          '<button class="btn xs" data-act="buyItem" data-arg="' + id + '"' + (P.gold < d.price ? ' disabled' : '') + '>买</button>' +
          '</div>';
      }).join('');
    } else {
      var sellList = Object.keys(Game.bag).filter(function (id) {
        return ITEMS[id].price > 0 && ITEMS[id].type !== 'key';
      }).sort(cmpItemId);
      body = sellList.map(function (id) {
        var d = ITEMS[id];
        return '<div class="shop-row">' +
          '<img src="' + Sprites.iconUrl(d.icon, d.color) + '">' +
          '<div class="sp-main"><b>' + d.name + '</b> ×' + Game.bag[id] + '</div>' +
          '<span class="price">卖 ' + Math.floor(d.price * 0.6) + ' 金</span>' +
          '<button class="btn xs" data-act="sellItem" data-arg="' + id + '">卖</button>' +
          '</div>';
      }).join('') || '<div class="dim">没有可出售的东西</div>';
    }
    this.$overlay.innerHTML =
      '<div class="menu-box"><div class="menu-tabs">' +
      '<span class="mtab' + (this.shopTab === 'buy' ? ' sel' : '') + '" data-act="shopTab" data-arg="buy">购买</span>' +
      '<span class="mtab' + (this.shopTab === 'sell' ? ' sel' : '') + '" data-act="shopTab" data-arg="sell">出售</span>' +
      '<span class="mtab gold-tab">💰 ' + P.gold + '</span>' +
      '<span class="mtab close-x" data-act="close">✕</span></div>' +
      '<div class="menu-body">' + body + '</div></div>';
    this.$overlay.classList.add('show');
  },
  openCaravan: function () {
    this.openShop(CARAVAN_STOCK, '行脚商队 · 稀有货');
  },

  /* ===================== 铁匠 ===================== */
  smithTab: 'buy',
  openSmith: function () {
    this.open = 'smith';
    this.smithTab = 'buy';
    this.renderSmith();
    SFX.play('ui');
  },
  renderSmith: function () {
    var P = Game.player;
    var body = '';
    if (this.smithTab === 'buy') {
      body = '<div class="dim tip">武器按职业选择（当前 ' + CLASSES[P.cls].name + ' 只能用' + WT_NAME[CLASSES[P.cls].weapon] + '）</div>' +
        SMITH_STOCK.map(function (id) {
          var d = EQUIPS[id];
          if (d.slot === 'weapon' && d.wt !== CLASSES[P.cls].weapon) return '';
          var st = equipStats(d, 0);
          var stStr = Object.keys(st).map(function (k) {
            return { atk: '攻', def: '防', hp: '命', mp: '魔', spd: '速', crit: '暴' }[k] + '+' + st[k];
          }).join(' ');
          return '<div class="shop-row">' +
            '<img src="' + Sprites.iconUrl(d.slot === 'weapon' ? d.wt : d.slot, d.look.c) + '">' +
            '<div class="sp-main"><b>' + d.name + '</b>' +
            '<div class="dim">' + SLOT_NAME[d.slot] + ' · 需 Lv.' + d.lv + ' · ' + stStr + '</div></div>' +
            '<span class="price">' + d.price + ' 金</span>' +
            '<button class="btn xs" data-act="buyEquip" data-arg="' + id + '"' + (P.gold < d.price ? ' disabled' : '') + '>买</button></div>';
        }).join('');
    } else if (this.smithTab === 'plus') {
      var rows = [];
      Object.keys(P.equip).forEach(function (slot) {
        var e = P.equip[slot];
        if (e) rows.push({ e: e, where: 'equipped:' + slot });
      });
      P.equipBag.forEach(function (e, i) { rows.push({ e: e, where: 'bag:' + i }); });
      body = '<div class="dim tip">强化 +1 ~ +6，每级基础数值 +8%。材料：玄铁（当前 ' + (Game.bag.xuantie || 0) + ' 块）</div>' +
        (rows.map(function (r) {
          var d = EQUIPS[r.e.id];
          var plus = r.e.plus || 0;
          var cost = plusCost(d, plus);
          var can = plus < 6 && Game.bag.xuantie >= cost.xuantie && P.gold >= cost.gold;
          return '<div class="shop-row">' +
            '<img src="' + Sprites.iconUrl(d.slot === 'weapon' ? d.wt : d.slot, d.look.c) + '">' +
            '<div class="sp-main"><b>' + equipName(r.e.id, plus) + '</b>' +
            '<div class="dim">下一级：+' + (plus + 1) + '（需 玄铁×' + cost.xuantie + ' · ' + cost.gold + ' 金）' + (plus >= 6 ? ' 已满级' : '') + '</div></div>' +
            (plus < 6 ? '<button class="btn xs" data-act="plus" data-arg="' + r.where + '"' + (can ? '' : ' disabled') + '>强化</button>' : '') +
            '</div>';
        }).join('') || '<div class="dim">没有可强化的装备</div>');
    } else {
      body = P.equipBag.map(function (e, idx) {
        var d = EQUIPS[e.id];
        if (d.unique) return '';   /* 唯一装备谢绝回收，防误卖绝版 */
        return '<div class="shop-row">' +
          '<img src="' + Sprites.iconUrl(d.slot === 'weapon' ? d.wt : d.slot, d.look.c) + '">' +
          '<div class="sp-main"><b>' + equipName(e.id, e.plus || 0) + '</b><div class="dim">' + SLOT_NAME[d.slot] + ' · 需 Lv.' + d.lv + '</div></div>' +
          '<span class="price">卖 ' + Math.floor((d.price || 300) * 0.6 * (1 + (e.plus || 0) * 0.1)) + ' 金</span>' +
          '<button class="btn xs" data-act="sellEquip" data-arg="' + idx + '">卖</button></div>';
      }).join('') || '<div class="dim">背包里没有装备</div>';
    }
    this.$overlay.innerHTML =
      '<div class="menu-box"><div class="menu-tabs">' +
      '<span class="mtab' + (this.smithTab === 'buy' ? ' sel' : '') + '" data-act="smithTab" data-arg="buy">购买</span>' +
      '<span class="mtab' + (this.smithTab === 'plus' ? ' sel' : '') + '" data-act="smithTab" data-arg="plus">强化</span>' +
      '<span class="mtab' + (this.smithTab === 'sell' ? ' sel' : '') + '" data-act="smithTab" data-arg="sell">出售</span>' +
      '<span class="mtab gold-tab">💰 ' + P.gold + '</span>' +
      '<span class="mtab close-x" data-act="close">✕</span></div>' +
      '<div class="menu-body">' + body + '</div></div>';
    this.$overlay.classList.add('show');
  },

  /* ===================== 详情弹窗（复用 dialog 样式；先关旧的，避免 id 叠加） ===================== */
  popup: function (html) {
    this.closePopup();
    var box = document.createElement('div');
    box.className = 'popup-box';
    box.innerHTML = html + '<div class="dlg-opt" data-act="closePopup">关闭</div>';
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    this.$overlay.appendChild(box);
  },
  closePopup: function () {
    var list = document.querySelectorAll('.popup-box');
    for (var i = 0; i < list.length; i++) list[i].remove();
  },

  /* ===================== 山海遗刻 / 后日谈 / 序章 ===================== */
  showStela: function (def, reread) {
    this.open = 'stela';
    this.$overlay.innerHTML =
      '<div class="ending-box stela-box">' +
      '<div class="ending-title">◈ ' + def.name + (reread ? ' · 重读' : ' · 遗刻出土') + ' ◈</div>' +
      '<div class="ending-text">' + def.txt + '</div>' +
      '<div class="dim">—— 上古拾灵人手记 · 山海图经卷首</div>' +
      '<button class="btn big" data-act="close">合上手记</button>' +
      '</div>';
    this.$overlay.classList.add('show');
    SFX.play('ui');
  },
  afterDialog: function (q) {
    this.open = 'after';
    var who = questGiveText(q);
    this.$overlay.innerHTML =
      '<div class="dialog-box">' +
      '<div class="dlg-head"><div><b>' + who + '</b><div class="dim">委托完成 · ' + q.name + '</div></div></div>' +
      '<div class="dlg-text">' + q.after + '</div>' +
      '<div class="dlg-opts"><div class="dlg-opt" data-act="close">（继续旅程）</div></div>' +
      '</div>';
    this.$overlay.classList.add('show');
    SFX.play('heal');
  },

  /* 序章过场：全屏文字卡，点击/回车翻页 */
  PROLOGUE: [
    { title: '· 山海拾灵 ·', lines: [
      '上古有山，有海，有灵。',
      '人与灵物立约，互不相负——那一代人，被称作「拾灵人」。',
      '后来，盟约散佚，守护者沉睡，山海沉默了三千年。'
    ] },
    { title: '· 躁动的时代 ·', lines: [
      '落霞村的钟又响了。',
      '灵物躁动，守护者一个接一个醒来，山海之间的商路断了，图经散了。',
      '村长姜石说：需要一个拿起武器、也肯伸出手的人。'
    ] },
    { title: '· 启程 ·', lines: [
      '击败灵物，或与之结契——用剑，也用心。',
      'WASD 移动 · 鼠标左键攻击 · E 捕捉 · F 对话',
      '山海之路，自落霞村始。'
    ] }
  ],
  prologue: function (onEnd) {
    var self = this;
    this.open = 'prologue';
    var page = 0;
      function render() {
      var c = self.PROLOGUE[page];
      self.$overlay.innerHTML =
        '<div class="prologue-box" data-act="prologueNext"><div class="prologue-title">' + c.title + '</div>' +
        c.lines.map(function (l) { return '<div class="prologue-line">' + l + '</div>'; }).join('') +
        '<div class="prologue-hint">点击 / 回车 翻页（' + (page + 1) + '/' + self.PROLOGUE.length + '）</div></div>';
      self.$overlay.classList.add('show');
    }
    function next() {
      page++;
      if (page >= self.PROLOGUE.length) {
        if (document.removeEventListener) document.removeEventListener('keydown', keyHandler);
        self._prologueNext = null;
        self.close();
        onEnd && onEnd();
        return;
      }
      render();
      SFX.play('ui');
    }
    function keyHandler(e) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); next(); }
    }
    document.addEventListener('keydown', keyHandler);
    this._prologueNext = next;
    render();
    SFX.play('portal');
  },

  /* ===================== 结局 ===================== */
  showEnding: function () {
    this.open = 'ending';
    var P = Game.player;
    var more = Game.stats.killedZhulong
      ? '烛龙合眼，昼夜各归其位。<br>可是归墟之底似乎还有更深的传说——若八块山海遗刻尽数寻得，真相将再启。'
      : '山海重归安宁，而你的图经才刚刚翻开第一页。';
    this.$overlay.innerHTML =
      '<div class="ending-box">' +
      '<div class="ending-title">· 混沌终焉 ·</div>' +
      '<div class="ending-text">雷声停了。<br>帝江识歌舞，却不识悲悯；如今它化作光点，散入云海。<br>' +
      more + '<br><br>' +
      '—— ' + P.name + ' · ' + CLASSES[P.cls].name + ' Lv.' + P.lv + ' ——<br>' +
      '收录灵物 ' + Game.dexCaughtCount() + ' 种 · 击败守护者 ' + Game.stats.statBossKill + ' 次 · 结契 ' + Game.stats.statCatch + ' 只</div>' +
      '<button class="btn big" data-act="close">继续游玩（世界仍在）</button>' +
      '</div>';
    this.$overlay.classList.add('show');
  },
  showTrueEnding: function () {
    this.open = 'ending';
    var P = Game.player;
    this.$overlay.innerHTML =
      '<div class="ending-box true-ending">' +
      '<div class="ending-title">· 遗刻完璧 · 昼夜各归 ·</div>' +
      '<div class="ending-text">' +
      '八块遗刻次第亮起，像八盏等了三千年的灯。<br>' +
      '烛龙之睛在你掌心睁开——你终于读懂了碑文最末那行小字：<br><br>' +
      '「拾灵人不是驯服灵物的人，是被山海选中、替它记住这一切的人。」<br><br>' +
      '风从北冥吹来，卷着桃花瓣、雪粒、沙与火星。<br>' +
      '那是所有先行者的问候，也是山海对你说：欢迎回家。<br><br>' +
      '—— ' + P.name + ' · ' + CLASSES[P.cls].name + ' Lv.' + P.lv + ' · 山海图经 卷终 ——<br>' +
      '灵物 ' + Game.dexCaughtCount() + '/' + Object.keys(SPECIES).length + ' · 遗刻 ' + Game.stelaeCount() + '/' + STELAE.length +
      ' · 守护者 ' + Game.stats.statBossKill + ' 战 · 结契 ' + Game.stats.statCatch + ' 只 · 游历 ' + U.timeText(Game.playTime) + '</div>' +
      '<button class="btn big" data-act="close">继续游玩（山海永在）</button>' +
      '</div>';
    this.$overlay.classList.add('show');
  },

  /* ===================== 过场淡入 ===================== */
  fade: function (fn) {
    var f = this.$fade;
    f.style.opacity = '1';
    setTimeout(function () {
      fn();
      f.style.opacity = '0';
    }, 420);
  },

  /* ===================== toast ===================== */
  toast: function (text) {
    var self = this;
    var t = { text: text, t: 4, el: null };
    this.toasts.push(t);
    if (this.toasts.length > 4) this.toasts.shift();
    this.renderToasts();
  },
  renderToasts: function () {
    this.$toasts.innerHTML = this.toasts.map(function (t) {
      return '<div class="toast" style="opacity:' + U.clamp(t.t / 1.2, 0, 1) + '">' + t.text + '</div>';
    }).join('');
  },
  updateToasts: function (dt) {
    var changed = false;
    for (var i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= dt;
      if (this.toasts[i].t <= 0) { this.toasts.splice(i, 1); changed = true; }
    }
    if (changed || this.toasts.length) this.renderToasts();
  },

  /* ===================== 动作分发 ===================== */
  action: function (act, arg, el) {
    var P = Game.player;
    switch (act) {
      /* 标题 */
      case 'pickCls':
        this._pickCls = arg;
        Array.prototype.forEach.call(document.querySelectorAll('.cls-card'), function (c) { c.classList.remove('sel'); });
        el.classList.add('sel');
        break;
      case 'start': {
        var name = (document.getElementById('nameInput') || {}).value || '无名客';
        var cls = this._pickCls || 'sword';
        Game.newGame(cls, name.trim().slice(0, 6) || '无名客');
        /* 序章正在播就不关面板（序章自带收尾 close），否则照常关闭 */
        if (this.open !== 'prologue') this.close();
        Game.state = 'play';
        this.buildHud();
        break;
      }
      case 'continue':
        if (Game.load()) {
          this.close();
          Game.state = 'play';
          this.buildHud();
        }
        break;
      /* 面板 */
      case 'tab': this.menuTab = arg; this.renderMenu(); break;
      case 'close': this.close(); break;
      case 'hint': break;
      /* 角色装备 */
      case 'unequip': {
        var e = P.equip[arg];
        if (!e) break;
        P.equip[arg] = null;
        P.equipBag.push(e);
        P.recalc();
        this.renderMenu();
        SFX.play('ui');
        break;
      }
      /* 背包（单击延迟弹详情，给双击让路） */
      case 'useItem':
        clearTimeout(this._pendPopup);
        this.useItemAction(arg);
        break;
      case 'itemInfo':
        clearTimeout(this._pendPopup);
        this._pendPopup = setTimeout(function () { UI.itemInfo(arg); }, 280);
        break;
      case 'equip':
        clearTimeout(this._pendPopup);
        this.equipAction(parseInt(arg, 10));
        break;
      case 'equipInfo':
        clearTimeout(this._pendPopup);
        this._pendPopup = setTimeout(function () { UI.equipInfo(parseInt(arg, 10)); }, 280);
        break;
      case 'teleportTo': this.teleportTo(arg); break;
      /* 灵宠 */
      case 'team': {
        var rec = Game.spiritByUid(arg);
        if (!rec) break;
        var slot = Game.team.indexOf(null);
        if (slot < 0) { Game.toast('出战位已满（3 只），先撤下一只'); break; }
        Game.team[slot] = arg;
        Game.refreshPets();
        this.renderMenu();
        SFX.play('ui');
        break;
      }
      case 'untteam': {
        Game.team[parseInt(arg, 10)] = null;
        Game.refreshPets();
        this.renderMenu();
        break;
      }
      case 'spiritInfo': this.spiritInfo(arg); break;
      case 'release': this.releaseSpirit(arg); break;
      case 'dexInfo': this.dexInfo(arg); break;
      /* 系统 */
      case 'save': Game.save(); Game.toast('已保存'); this.renderMenu(); break;
      case 'toggleSfx': SFX.on = !SFX.on; this.renderMenu(); break;
      case 'showExport': this.popup('<div class="sec-title">存档导出（复制保存）</div><textarea class="save-io" readonly>' + Game.exportSave() + '</textarea>'); break;
      case 'showImport': this.popup('<div class="sec-title">存档导入（粘贴后点导入）</div><textarea class="save-io" id="importBox"></textarea><div class="dlg-opt" data-act="doImport">导入并覆盖</div>'); break;
      case 'doImport': {
        var txt = (document.getElementById('importBox') || {}).value || '';
        if (Game.importSave(txt)) {
          this.closePopup();
          this.close();
          Game.state = 'play';
          this.buildHud();
          Game.toast('导入成功');
        } else Game.toast('导入失败：格式不对');
        break;
      }
      case 'toTitle': Game.save(); this.showTitle(); break;
      /* 对话 */
      case 'turnin': Game.turnInQuest(arg); if (this.open !== 'after') this.talk(this.talkNpc); break;
      case 'accept': Game.acceptQuest(arg); this.talk(this.talkNpc); break;
      case 'shop': this.openShop(SHOP_STOCK); break;
      case 'smith': this.openSmith(); break;
      case 'healAll': {
        P.hp = P.st.hp; P.mp = P.st.mp;
        Game.pets.forEach(function (p) { p.hp = p.st.hp; p.downT = 0; });
        SFX.play('heal');
        Game.toast('治疗完成，神清气爽！');
        this.talk(this.talkNpc);
        break;
      }
      case 'lore': this.talk(this.talkNpc); break;
      /* 商店 */
      case 'shopTab': this.shopTab = arg; this.renderShop(); break;
      case 'buyItem': {
        var d = ITEMS[arg];
        if (P.gold >= d.price) {
          P.gold -= d.price;
          Game.addItem(arg, 1);
          SFX.play('buy');
          Game.save();
          this.renderShop();
        }
        break;
      }
      case 'sellItem': {
        var d2 = ITEMS[arg];
        P.gold += Math.floor(d2.price * 0.6);
        Game.bag[arg]--;
        if (Game.bag[arg] <= 0) delete Game.bag[arg];
        SFX.play('coin');
        Game.save();
        this.renderShop();
        break;
      }
      case 'buyEquip': {
        var ed = EQUIPS[arg];
        if (P.gold >= ed.price) {
          P.gold -= ed.price;
          P.equipBag.push({ id: arg, plus: 0 });
          SFX.play('buy');
          Game.toast('购得【' + ed.name + '】（在背包中双击装备）');
          Game.save();
          if (this.open === 'smith') this.renderSmith();
          else this.renderShop();
        }
        break;
      }
      case 'sellEquip': {
        var idx = parseInt(arg, 10);
        var e2 = P.equipBag[idx];
        if (!e2) break;
        P.gold += Math.floor((EQUIPS[e2.id].price || 300) * 0.6 * (1 + (e2.plus || 0) * 0.1));
        P.equipBag.splice(idx, 1);
        SFX.play('coin');
        Game.save();
        this.renderSmith();
        break;
      }
      case 'plus': {
        var parts = arg.split(':');
        var e3 = null;
        if (parts[0] === 'equipped') e3 = P.equip[parts[1]];
        else e3 = P.equipBag[parseInt(parts[1], 10)];
        if (!e3) break;
        var d3 = EQUIPS[e3.id];
        var cost = plusCost(d3, e3.plus || 0);
        if ((e3.plus || 0) >= 6) break;
        if ((Game.bag.xuantie || 0) < cost.xuantie || P.gold < cost.gold) break;
        Game.bag.xuantie -= cost.xuantie;
        if (Game.bag.xuantie <= 0) delete Game.bag.xuantie;
        P.gold -= cost.gold;
        e3.plus = (e3.plus || 0) + 1;
        if (e3.plus >= 6) Game.stats.statPlus6 = (Game.stats.statPlus6 || 0) + 1;
        P.recalc();
        SFX.play('levelup');
        Game.toast('强化成功！' + equipName(e3.id, e3.plus));
        Game.checkAchv();
        Game.save();
        this.renderSmith();
        break;
      }
      case 'smithTab': this.smithTab = arg; this.renderSmith(); break;
      /* HUD 芯片 */
      case 'cyclePetMode': {
        Game.petMode = { attack: 'defend', defend: 'follow', follow: 'attack' }[Game.petMode];
        Game.toast('灵宠战术：' + { attack: '进攻', defend: '防守', follow: '跟随' }[Game.petMode]);
        break;
      }
      case 'cycleAuto': {
        P.auto = !P.auto;
        Game.toast('自动战斗：' + (P.auto ? '开' : '关'));
        break;
      }
      /* popup */
      case 'closePopup': this.closePopup(); break;
      case 'prologueNext': if (this._prologueNext) this._prologueNext(); break;
    }
  },

  /* ---------- 背包动作 ---------- */
  useItemAction: function (id) {
    var d = ITEMS[id];
    if (d.type === 'use') {
      if (Game.useItem(id)) { if (this.open === 'menu' && this.menuTab === 'bag') this.renderMenu(); }
    } else if (d.type === 'teleport') {
      this.teleportPicker();
    } else if (d.type === 'ball') {
      Game.toast('捕捉索要在野外按 E 使用');
    }
  },
  itemInfo: function (id) {
    var d = ITEMS[id];
    var use = d.type === 'use' || d.type === 'teleport';
    this.popup('<div class="sec-title">' + d.name + ' ×' + (Game.bag[id] || 0) + '</div>' +
      '<div class="dim">' + d.desc + '</div>' +
      '<div class="dim">价值 ' + d.price + ' 金</div>' +
      (use ? '<div class="dlg-opt" data-act="useItem" data-arg="' + id + '">使用</div>' : ''));
  },
  equipAction: function (idx) {
    var P = Game.player;
    var e = P.equipBag[idx];
    if (!e) return;
    var d = EQUIPS[e.id];
    /* 等级限制 */
    if (P.lv < d.lv) { Game.toast('等级不足（需要 Lv.' + d.lv + '）'); return; }
    /* 武器类型限制 */
    if (d.slot === 'weapon' && d.wt !== CLASSES[P.cls].weapon) {
      Game.toast(CLASSES[P.cls].name + '无法使用' + WT_NAME[d.wt]);
      return;
    }
    var old = P.equip[d.slot];
    P.equip[d.slot] = e;
    P.equipBag.splice(idx, 1);
    if (old) P.equipBag.push(old);
    P.recalc();
    SFX.play('buy');
    Game.toast('装备了【' + equipName(e.id, e.plus || 0) + '】');
    Game.save();
    this.renderMenu();
  },
  equipInfo: function (idx) {
    var e = Game.player.equipBag[idx];
    if (!e) return;
    var d = EQUIPS[e.id];
    var st = equipStats(d, e.plus || 0);
    var stStr = Object.keys(st).map(function (k) {
      return { atk: '攻击', def: '防御', hp: '生命', mp: '魔力', spd: '速度', crit: '暴击率' }[k] + ' +' + st[k];
    }).join('　');
    var cur = Game.player.equip[d.slot];
    var curStr = cur ? equipName(cur.id, cur.plus || 0) + '（' + equipStats(EQUIPS[cur.id], cur.plus || 0).atk + ' 攻）' : '空';
    this.popup('<div class="sec-title">' + equipName(e.id, e.plus || 0) + '</div>' +
      '<div class="dim">' + SLOT_NAME[d.slot] + ' · 需求等级 Lv.' + d.lv + (d.unique ? ' · <b class="gold">唯一</b>' : '') + '</div>' +
      '<div>' + stStr + '</div>' +
      '<div class="dim">当前该部位：' + curStr + '</div>' +
      '<div class="dlg-opt" data-act="equip" data-arg="' + idx + '">装备</div>');
  },
  teleportPicker: function () {
    var list = Object.keys(Game.visited).filter(function (mid) { return mid !== Game.map.id; }).map(function (mid) {
      return '<div class="dlg-opt" data-act="teleportTo" data-arg="' + mid + '">' + MAPS[mid].name +
        (MAPS[mid].safe ? '（安全区）' : '　Lv.' + MAPS[mid].lv[0] + '-' + MAPS[mid].lv[1]) + '</div>';
    }).join('') || '<div class="dim">还没有其他去过的地方</div>';
    this.popup('<div class="sec-title">传送符 · 选择目的地</div><div class="dim tip">传送到安全区不消耗传送符</div>' + list);
  },
  teleportTo: function (mid) {
    if (!Game.visited[mid]) return;
    var cost = MAPS[mid].safe ? 0 : 1;
    if (cost > 0) {
      if (!(Game.bag.chuansongfu > 0)) { Game.toast('没有传送符'); return; }
      Game.bag.chuansongfu--;
      if (Game.bag.chuansongfu <= 0) delete Game.bag.chuansongfu;
    }
    SFX.play('portal');
    this.closePopup();
    this.close();
    Game.gotoMap(mid, Game.visited[mid].x, Game.visited[mid].y);
  },
  spiritInfo: function (uid) {
    var rec = Game.spiritByUid(uid);
    if (!rec) return;
    var sp = SPECIES[rec.sp];
    var st = petStat(rec);
    var skills = petSkills(rec).map(function (sid) {
      var sk = SKILLS[sid];
      return sk.name + '（' + (sk.el !== 'none' ? ELEMENTS[sk.el].name : '无') + '系 · ' + sk.power + '%）';
    }).join('　');
    var evo = sp.evo
      ? '进化为 <b>' + SPECIES[sp.evo.to].name + '</b>：' + evoText(sp) +
      '（当前等级 ' + rec.lv + '，并肩击杀 ' + (rec.killsWith || 0) + '）'
      : '已是大成形态';
    this.popup('<div class="sec-title">' + sp.name + (rec.shiny ? ' ✨闪光' : '') + ' Lv.' + rec.lv + '</div>' +
      '<img class="big-face" src="' + Sprites.portraitUrl(rec.sp, rec.shiny) + '">' +
      '<div class="dim">' + sp.desc + '</div>' +
      '<div>属性：<span style="color:' + ELEMENTS[sp.el].color + '">' + ELEMENTS[sp.el].name + '</span>系 · ' +
      TEMPERS[rec.temper].name + '（' + TEMPERS[rec.temper].desc + '） · 资质 ' + rec.iv + '/15</div>' +
      '<div>生命 ' + st.hp + ' · 攻击 ' + st.atk + ' · 防御 ' + st.def + ' · 速度 ' + st.spd + '</div>' +
      '<div class="dim">技能：' + skills + '</div>' +
      '<div class="dim">' + evo + '</div>' +
      '<div class="dlg-opt danger-opt" data-act="release" data-arg="' + uid + '">放归山野（永久失去）</div>');
  },
  releaseSpirit: function (uid) {
    Game.spirits = Game.spirits.filter(function (s) { return s.uid !== uid; });
    for (var i = 0; i < 3; i++) if (Game.team[i] === uid) Game.team[i] = null;
    Game.refreshPets();
    this.closePopup();
    this.renderMenu();
    Game.toast('已放归山野。山高水长，后会有期。');
  },
  dexInfo: function (id) {
    var sp = SPECIES[id];
    var got = Game.dex.caught[id], seen = Game.dex.seen[id], beat = Game.dex.beaten[id];
    if (!got && !seen && !beat) { Game.toast('尚未见过这种灵物'); return; }
    var pre = speciesPre(id);
    var evoInfo = sp.evo ? ('进化 → ' + SPECIES[sp.evo.to].name + '（' + evoText(sp) + '）') : '无进化';
    var preInfo = pre ? ('由 ' + SPECIES[pre].name + ' 进化而来') : '';
    this.popup('<div class="sec-title">' + sp.name + (got ? '　✔ 已收录' : beat ? '　◆ 已击败' : '　已遇见') + '</div>' +
      '<img class="big-face" src="' + Sprites.portraitUrl(id, false) + '">' +
      '<div class="dim">' + sp.desc + '</div>' +
      '<div>属性：<span style="color:' + ELEMENTS[sp.el].color + '">' + ELEMENTS[sp.el].name + '</span>系 · ' +
      (sp.boss ? '守护者（不可捕捉）' : sp.evolved ? '进化形态（由低阶进化获得）' : '野生可捕捉 · 捕捉基数 ' + sp.catch) + '</div>' +
      (got || beat ? '<div class="dim">基础：生命 ' + sp.base.hp + ' · 攻击 ' + sp.base.atk + ' · 防御 ' + sp.base.def + ' · 速度 ' + sp.base.spd + '</div>' : '') +
      '<div class="dim">' + evoInfo + (preInfo ? '　·　' + preInfo : '') + '</div>');
  }
};

/* 页面入口 */
window.addEventListener('DOMContentLoaded', function () {
  var canvas = document.getElementById('game');
  Game.boot(canvas);
});
