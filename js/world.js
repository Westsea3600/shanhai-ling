/* ============================================================
   《山海拾灵》世界层：地图生成 / 碰撞 / 连通性 / 烘焙渲染 / 寻路
   主题驱动：grass | forest | volcano | cave | marsh | village
   ============================================================ */

/* 瓦片种类 → 行走 / 弹道阻挡 */
var TILE_SOLID = { w: 1, l: 1, r: 1, k: 1, cw: 1 };      /* 阻挡行走 */
var TILE_SHOT_BLOCK = { r: 1, k: 1, cw: 1 };              /* 只挡高障碍，水/岩浆不挡 */

function GameMap(id) {
  this.id = id;
  var def = MAPS[id];
  this.def = def;
  this.w = def.w; this.h = def.h;
  this.t = new Array(this.w * this.h);        /* 瓦片种类 */
  this.block = new Array(this.w * this.h);    /* 装饰占格覆盖层 */
  this.deco = [];                             /* Y 排序装饰 */
  this.lights = [];                           /* 光源（dark 地图） */
  this.generate();
  this.bake();
}

GameMap.prototype.idx = function (x, y) { return y * this.w + x; };

GameMap.prototype.generate = function () {
  var d = this.def, W = this.w, H = this.h, i, j;
  var rnd = mulberry32(d.seed);
  var n1 = makeNoise(d.seed), n2 = makeNoise(d.seed ^ 0x9e3779b9);
  var theme = d.theme;

  /* ---- 1. 基础噪声地形 ---- */
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var v = n1(x / 10, y / 10) * 0.65 + n2(x / 5.5, y / 5.5) * 0.35;
    var t;
    if (theme === 'grass') {
      if (v < 0.30) t = 'w';
      else if (v > 0.78) t = 'r';
      else t = 'g';
    } else if (theme === 'forest') {
      if (v < 0.24) t = 'w';
      else if (v > 0.72) t = 'g2';           /* 密林地块（行走，但画树） */
      else t = 'g';
    } else if (theme === 'volcano') {
      if (v < 0.32) t = 'l';
      else if (v > 0.80) t = 'r';
      else t = 's';
    } else if (theme === 'cave') {
      t = rnd() < 0.44 ? 'cw' : 'cf';
    } else if (theme === 'marsh') {
      if (v < 0.30) t = 'mw';
      else if (v > 0.82) t = 'r';
      else t = 'm';
    } else if (theme === 'snow') {
      if (v < 0.28) t = 'w';                  /* 冰湖 */
      else if (v > 0.78) t = 'r';             /* 冰壁 */
      else t = 'sn';
    } else if (theme === 'peach') {
      if (v < 0.16) t = 'w';
      else if (v > 0.74) t = 'g2';            /* 密林（桃树） */
      else t = 'pg';
    } else if (theme === 'desert') {
      if (v < 0.20) t = 'w';                  /* 绿洲水泽 */
      else if (v > 0.80) t = 'r';             /* 风蚀岩 */
      else t = 'sa';
    } else if (theme === 'abyss') {
      if (v < 0.18) t = 'w';                  /* 虚空之渊（不可渡） */
      else if (v > 0.76) t = 'r';             /* 裂界岩 */
      else t = 'ab';
    } else { /* village */
      t = 'wd';
    }
    this.t[this.idx(x, y)] = t;
  }

  /* ---- 1.5 地表变化：草原/林间/桃林的裸土斑块（低频第三噪声） ---- */
  if (theme === 'grass' || theme === 'forest' || theme === 'peach') {
    var n3 = makeNoise(d.seed ^ 0x51ab3f);
    var floorCh = theme === 'peach' ? 'pg' : 'g';
    for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) {
      if (this.t[this.idx(x, y)] !== floorCh) continue;
      var dv = n3(x / 8, y / 8);
      if (dv > 0.74) this.t[this.idx(x, y)] = 'dt';
      else if (dv < 0.16) this.t[this.idx(x, y)] = floorCh === 'g' ? 'g2' : 'pg';
    }
  }

  /* ---- 2. 洞窟：元胞自动机平滑 ---- */
  if (theme === 'cave') {
    var src = this.t.slice(), rounds = 5;
    for (var r = 0; r < rounds; r++) {
      var snap = src.slice();
      for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
        var walls = 0;
        for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) {
          if (!i && !j) continue;
          if (snap[this.idx(x + i, y + j)] === 'cw') walls++;
        }
        src[this.idx(x, y)] = walls >= 5 ? 'cw' : 'cf';
      }
    }
    this.t = src;
  }

  /* 边界封闭 */
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
      this.t[this.idx(x, y)] = (theme === 'cave') ? 'cw' : (theme === 'volcano' || theme === 'snow') ? 'r' : 'k';
    }
  }

  /* ---- 4. 关键点：出生点 / 传送门 / NPC / BOSS ---- */
  var cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  this.spawn = { x: cx, y: cy };
  var keys = [{ x: cx, y: cy }];
  (d.portals || []).forEach(function (p) { keys.push({ x: p.x, y: p.y }); });
  (d.npcs || []).forEach(function (p) { keys.push({ x: p.x, y: p.y }); });
  if (d.board) keys.push({ x: d.board.x, y: d.board.y + 2 });   /* 牌前落脚点也算关键点 */
  if (d.boss) {
    this.bossPt = { x: W - 8, y: 8 };
    keys.push(this.bossPt);
  }
  /* 去重 */
  var seen = {}, uniq = [];
  keys.forEach(function (k) { var kk = k.x + ',' + k.y; if (!seen[kk]) { seen[kk] = 1; uniq.push(k); } });
  keys = uniq;

  /* ---- 5. Prim（曼哈顿）MST 走廊连接关键点 ---- */
  var inTree = [keys[0]], rest = keys.slice(1);
  while (rest.length) {
    var best = null, bi = -1, bj = -1;
    for (i = 0; i < inTree.length; i++) for (j = 0; j < rest.length; j++) {
      var dist = Math.abs(inTree[i].x - rest[j].x) + Math.abs(inTree[i].y - rest[j].y);
      if (!best || dist < best.dist) best = { a: inTree[i], b: rest[j], dist: dist, bi: i, bj: j };
    }
    this.carve(best.a, best.b);
    inTree.push(rest.splice(best.bj, 1)[0]);
  }

  /* ---- 6. 关键点周围清出平台 ---- */
  var self = this;
  keys.forEach(function (k) {
    for (j = -2; j <= 2; j++) for (i = -2; i <= 2; i++) {
      var x2 = U.clamp(k.x + i, 1, W - 2), y2 = U.clamp(k.y + j, 1, H - 2);
      self.t[self.idx(x2, y2)] = self.floorOf(self.t[self.idx(x2, y2)]);
    }
  });
  if (d.boss) {  /* BOSS 平台更大 */
    for (j = -4; j <= 4; j++) for (i = -4; i <= 4; i++) {
      var bx = U.clamp(this.bossPt.x + i, 1, W - 2), by = U.clamp(this.bossPt.y + j, 1, H - 2);
      if (i * i + j * j <= 18) this.t[this.idx(bx, by)] = this.floorOf(this.t[this.idx(bx, by)]);
    }
  }

  /* ---- 7. 装饰与占格 ---- */
  this.block = new Array(W * H);
  this.placeDeco(rnd);

  /* ---- 7.5 山海遗刻：本图的古碑（不占格，交互层另算） ---- */
  this.stelae = [];
  if (typeof STELAE !== 'undefined') {
    var mapId0 = this.id;
    STELAE.forEach(function (st) {
      if (st.map !== mapId0) return;
      var ft = self.nearestFreeTile
        ? self.nearestFreeTile(st.x, st.y)
        : { x: st.x, y: st.y };
      self.stelae.push({ def: st, x: ft.x, y: ft.y });
      self.deco.push({ kind: 'stela', x: ft.x, y: ft.y });
    });
  }

  /* ---- 7.6 地标：每图主题化的小建筑群（确定性，不挡关键点） ---- */
  this.placeLandmarks(rnd);

  /* ---- 8. 孤岛兜底 ---- */
  this.connectPockets();

  /* ---- 9. 采集点：主题表加权布点（游戏层负责刷新与交互） ---- */
  this.spawnGathers(rnd);
};

/* 地标蓝图：中心装饰 + 卫星装饰（solid 控制占格） */
GameMap.prototype.placeLandmarks = function (rnd) {
  var self = this, theme = this.def.theme;
  var plans = {
    grass: [['bigtree', [[0, 0, true]]], ['pillar', [[0, 0, true], [2, 1, true], [-2, -1, true]]]],
    forest: [['bigtree', [[0, 0, true], [2, 2, true], [-3, 1, true]]], ['well', [[0, 0, true]]]],
    peach: [['bigtree', [[0, 0, true], [-2, 2, true]]], ['well', [[0, 0, true]]]],
    volcano: [['totem', [[0, 0, true], [2, 0, true], [-2, 0, true], [0, -2, true]]], ['pillar', [[0, 0, true]]]],
    cave: [['gravestone', [[0, 0, true], [2, 1, true], [-1, 2, true], [2, -1, true]]], ['pillar', [[0, 0, true], [1, 2, true]]]],
    marsh: [['totem', [[0, 0, true], [-2, 1, true]]], ['bigtree', [[0, 0, true]]]],
    snow: [['runestone', [[0, 0, true], [3, 0, true], [-3, 0, true], [0, 3, true]]], ['pillar', [[0, 0, true]]]],
    desert: [['pillar', [[0, 0, true], [3, 1, true], [-3, -1, true], [1, -3, true]]], ['gravestone', [[0, 0, true], [2, 0, true]]]],
    abyss: [['runestone', [[0, 0, true], [2, 2, true], [-2, -2, true]]], ['pillar', [[0, 0, true], [0, 3, true]]]],
    village: [['well', [[12, 26, true]]]]
  };
  var list = plans[theme];
  if (!list) return;
  list.forEach(function (plan) {
    /* 找一个离关键点足够远的落点（确定性尝试 40 次） */
    var best = null;
    for (var t = 0; t < 40; t++) {
      var lx = 6 + Math.floor(rnd() * (self.w - 12)), ly = 6 + Math.floor(rnd() * (self.h - 12));
      var d2 = self.dist2Key(lx, ly);
      if (!best || d2 > best.d2) best = { x: lx, y: ly, d2: d2 };
      if (d2 > 100) break;
    }
    plan[1].forEach(function (off) {
      var px = U.clamp(best.x + off[0], 2, self.w - 3), py = U.clamp(best.y + off[1], 2, self.h - 3);
      /* 地标脚下清出地面再放置 */
      for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
        var cx = U.clamp(px + i, 1, self.w - 2), cy = U.clamp(py + j, 1, self.h - 2);
        var cur = self.t[self.idx(cx, cy)];
        if (TILE_SOLID[cur]) self.t[self.idx(cx, cy)] = self.floorOf(cur);
      }
      self.deco.push({ kind: plan[0], x: px, y: py });
      if (off[2]) self.block[self.idx(px, py)] = 1;
    });
  });
};

/* 采集点：9~13 个，落在可达格上，离关键点 3 格外 */
GameMap.prototype.spawnGathers = function (rnd) {
  this.gathers = [];
  var table = GATHER_THEMES[this.def.theme];
  if (!table || this.def.safe) return;           /* 村庄安全区不设采集点 */
  var n = 9 + Math.floor(rnd() * 5);
  var guard = 0;
  while (this.gathers.length < n && guard++ < 300) {
    var x = 3 + Math.floor(rnd() * (this.w - 6)), y = 3 + Math.floor(rnd() * (this.h - 6));
    if (this.isSolid(x, y) || this.block[this.idx(x, y)]) continue;
    if (!this.reach || !this.reach[this.idx(x, y)]) continue;   /* 只落在可达区 */
    if (this.dist2Key(x, y) < 9) continue;
    if (this.gathers.some(function (g) { return Math.abs(g.tx - x) + Math.abs(g.ty - y) < 4; })) continue;
    var kind = U.weighted(table.map(function (r) { return r; }));
    this.gathers.push({ kind: kind, tx: x, ty: y, x: x * TILE + 16, y: y * TILE + 16, ready: true, t: 0 });
  }
};

/* 走廊：宽 3，先走长轴；主脊铺路砖（踏出的路） */
GameMap.prototype.carve = function (a, b) {
  var self = this;
  function carveCell(x, y, spine) {
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var x2 = U.clamp(x + i, 1, self.w - 2), y2 = U.clamp(y + j, 1, self.h - 2);
      var cur = self.t[self.idx(x2, y2)];
      self.block[self.idx(x2, y2)] = 0;      /* 走廊清掉装饰占格，防地标封路 */
      self.t[self.idx(x2, y2)] = self.floorOf(cur);
      /* 路面：走廊主脊的地面格铺成小径（水面/岩浆保留） */
      if (spine && i === 0 && j === 0 && cur !== 'w' && cur !== 'mw' && cur !== 'l') {
        self.t[self.idx(x2, y2)] = 'p';
      }
    }
  }
  var x = a.x, y = a.y;
  var dx = b.x > x ? 1 : -1, dy = b.y > y ? 1 : -1;
  if (Math.abs(b.x - x) > Math.abs(b.y - y)) {
    while (x !== b.x) { carveCell(x, y, true); x += dx; }
    while (y !== b.y) { carveCell(x, y, true); y += dy; }
  } else {
    while (y !== b.y) { carveCell(x, y, true); y += dy; }
    while (x !== b.x) { carveCell(x, y, true); x += dx; }
  }
  carveCell(b.x, b.y, true);
};
GameMap.prototype.floorOf = function (t) {
  switch (t) {
    case 'w': return this.def.theme === 'snow' ? 'sn' : this.def.theme === 'desert' ? 'sa' : this.def.theme === 'abyss' ? 'ab' : 'g';
    case 'l': return 's';
    case 'r': return this.def.theme === 'snow' ? 'sn' : this.def.theme === 'desert' ? 'sa' : this.def.theme === 'abyss' ? 'ab' : 'g';
    case 'k': return 'g';
    case 'cw': return 'cf';
    case 'g2': return 'g2';
    case 'mw': return 'm';
    default: return t;
  }
};

GameMap.prototype.placeDeco = function (rnd) {
  var self = this, d = this.def, theme = d.theme;
  function walkable(x, y) {
    var t = self.t[self.idx(x, y)];
    return t && !TILE_SOLID[t] && !self.block[self.idx(x, y)];
  }
  function nearKey(x, y, r) {
    var r2 = r * r;
    if (self.dist2Key(x, y) < r2) return true;
    return false;
  }
  function put(kind, x, y, solid) {
    self.deco.push({ kind: kind, x: x, y: y });
    if (solid) {
      self.block[self.idx(x, y)] = 1;
      if (TILE_SOLID[self.t[self.idx(x + 1, y)] || ''] === undefined) { }
    }
  }
  var counts = { tree: 0, pine: 0, boulder: 0, flower: 0, torch: 0, crystal: 0, reed: 0, mushroom: 0, bone: 0, house: 0, stall: 0 };
  if (theme === 'grass') {
    for (var i = 0; i < this.w * this.h * 0.012; i++) {
      var x = 2 + Math.floor(rnd() * (this.w - 4)), y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !nearKey(x, y, 3)) put('tree', x, y, true);
    }
  } else if (theme === 'forest') {
    /* 密林地块上放树，g 上也放一部分 */
    for (var y2 = 2; y2 < this.h - 2; y2++) for (var x2 = 2; x2 < this.w - 2; x2++) {
      var t = this.t[this.idx(x2, y2)];
      if ((t === 'g2' && rnd() < 0.75) || (t === 'g' && rnd() < 0.05)) {
        if (!this.block[this.idx(x2, y2)] && !nearKey(x2, y2, 3)) {
          put(rnd() < 0.5 ? 'tree' : 'pine', x2, y2, true);
          /* 密林树占格使其不可走 */
          this.block[this.idx(x2, y2)] = 1;
          if (t === 'g2' && rnd() < 0.6) this.t[this.idx(x2, y2)] = 'g';
        }
      }
    }
  } else if (theme === 'volcano') {
    for (i = 0; i < this.w * this.h * 0.012; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !nearKey(x, y, 3)) put('boulder', x, y, true);
    }
  } else if (theme === 'cave') {
    for (i = 0; i < this.w * this.h * 0.006; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !nearKey(x, y, 3)) put(rnd() < 0.5 ? 'crystal' : 'boulder', x, y, rnd() < 0.7);
    }
    /* 火把：沿走廊每隔一段 */
    (d.portals || []).forEach(function (p) {
      self.deco.push({ kind: 'torch', x: p.x + 1, y: p.y });
      self.lights.push({ x: (p.x + 1) * TILE + 16, y: p.y * TILE + 16, r: 120 });
    });
    if (d.boss) {
      self.deco.push({ kind: 'torch', x: this.bossPt.x - 4, y: this.bossPt.y });
      self.lights.push({ x: (this.bossPt.x - 4) * TILE + 16, y: this.bossPt.y * TILE + 16, r: 140 });
    }
  } else if (theme === 'marsh') {
    for (i = 0; i < this.w * this.h * 0.02; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !nearKey(x, y, 2)) {
        var k = rnd();
        put(k < 0.45 ? 'reed' : k < 0.8 ? 'mushroom' : 'boulder', x, y, k >= 0.8);
      }
    }
  } else if (theme === 'snow') {
    for (i = 0; i < this.w * this.h * 0.014; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !nearKey(x, y, 3)) {
        var sk = rnd();
        put(sk < 0.5 ? 'snowpine' : sk < 0.72 ? 'icecrystal' : 'snowrock', x, y, sk < 0.5 || sk >= 0.72);
      }
    }
    /* 冰湖边緣的冰晶点缀（不占格，避开关键点） */
    for (i = 0; i < this.w * this.h * 0.006; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      var tx2 = this.t[this.idx(x, y)];
      if (tx2 === 'sn' && walkable(x, y) && !nearKey(x, y, 2) && rnd() < 0.5) put('icecrystal', x, y, false);
    }
  } else if (theme === 'peach') {
    /* 密林地块放桃树，散地放花 */
    for (var py = 2; py < this.h - 2; py++) for (var px2 = 2; px2 < this.w - 2; px2++) {
      var pt = this.t[this.idx(px2, py)];
      if ((pt === 'g2' && rnd() < 0.7) || (pt === 'pg' && rnd() < 0.045)) {
        if (!this.block[this.idx(px2, py)] && !nearKey(px2, py, 3)) {
          put('peachtree', px2, py, true);
          if (pt === 'g2' && rnd() < 0.6) this.t[this.idx(px2, py)] = 'pg';
        }
      }
    }
    for (var i2 = 0; i2 < this.w * this.h * 0.012; i2++) {
      var fx3 = 2 + Math.floor(rnd() * (this.w - 4)), fy3 = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(fx3, fy3) && !nearKey(fx3, fy3, 2)) put('flower', fx3, fy3, false);
    }
  } else if (theme === 'desert') {
    for (var di = 0; di < this.w * this.h * 0.011; di++) {
      var dx3 = 2 + Math.floor(rnd() * (this.w - 4)), dy3 = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(dx3, dy3) && !nearKey(dx3, dy3, 3)) {
        var dk = rnd();
        put(dk < 0.34 ? 'deadwood' : dk < 0.62 ? 'cactus' : 'boulder', dx3, dy3, true);
      }
    }
    /* 绿洲边緣芦苇 */
    for (di = 0; di < this.w * this.h * 0.005; di++) {
      dx3 = 2 + Math.floor(rnd() * (this.w - 4)); dy3 = 2 + Math.floor(rnd() * (this.h - 4));
      var dt2 = this.t[this.idx(dx3, dy3)];
      if (dt2 === 'sa' && walkable(dx3, dy3) && rnd() < 0.5) put('reed', dx3, dy3, false);
    }
  } else if (theme === 'abyss') {
    for (var ai = 0; ai < this.w * this.h * 0.012; ai++) {
      var ax2 = 2 + Math.floor(rnd() * (this.w - 4)), ay2 = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(ax2, ay2) && !nearKey(ax2, ay2, 3)) {
        var ak = rnd();
        put(ak < 0.55 ? 'voidshard' : 'boulder', ax2, ay2, true);
      }
    }
    /* 归墟光源：浮晶自带幽光 */
    this.deco.forEach(function (dc) {
      if (dc.kind === 'voidshard' && rnd() < 0.35) {
        self.lights.push({ x: dc.x * TILE + 16, y: dc.y * TILE + 16, r: 100 });
      }
    });
  } else if (theme === 'village') {
    /* 村庄：商店摊位、房子、猎告牌、装饰 */
    put('stall', 14, 20, true); put('house', 28, 20, true); put('house2', 20, 15, true);
    put('house2', 33, 9, true); put('house', 10, 27, true);
    if (d.board) {
      put('board', d.board.x, d.board.y, true);
      /* 牌前清出宽敞行走位（5×3：牌子不与房线合成堵墙，寻路有横向绕行空间） */
      for (var bj = -1; bj <= 1; bj++) for (var bi = -2; bi <= 2; bi++) {
        var vx = U.clamp(d.board.x + bi, 1, this.w - 2), vy = U.clamp(d.board.y + 2 + bj, 1, this.h - 2);
        if (TILE_SOLID[this.t[this.idx(vx, vy)] || '']) this.t[this.idx(vx, vy)] = 'wd';
      }
    }
    for (i = 0; i < 14; i++) {
      x = 3 + Math.floor(rnd() * (this.w - 6)); y = 3 + Math.floor(rnd() * (this.h - 6));
      if (walkable(x, y) && !nearKey(x, y, 2)) put('flower', x, y, false);
    }
  }
  /* 花与骨：点缀（grass/forest 地面） */
  if (theme === 'grass' || theme === 'forest') {
    for (i = 0; i < this.w * this.h * 0.015; i++) {
      x = 2 + Math.floor(rnd() * (this.w - 4)); y = 2 + Math.floor(rnd() * (this.h - 4));
      if (walkable(x, y) && !this.block[this.idx(x, y)]) this.deco.push({ kind: rnd() < 0.8 ? 'flower' : 'bone', x: x, y: y });
    }
  }
};

GameMap.prototype.dist2Key = function (x, y) {
  var d = this.def, best = 1e9;
  function upd(kx, ky) { var dx = kx - x, dy = ky - y; best = Math.min(best, dx * dx + dy * dy); }
  upd(this.spawn.x, this.spawn.y);
  (d.portals || []).forEach(function (p) { upd(p.x, p.y); });
  (d.npcs || []).forEach(function (p) { upd(p.x, p.y); });
  if (this.bossPt) upd(this.bossPt.x, this.bossPt.y);
  return best;
};

/* 从出生点 flood fill，把不连通的洞用走廊接回来 */
GameMap.prototype.connectPockets = function () {
  var self = this;
  function reachMap() {
    var seen = new Array(self.w * self.h), q = [self.spawn];
    seen[self.idx(self.spawn.x, self.spawn.y)] = 1;
    while (q.length) {
      var c = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var x = c.x + d[0], y = c.y + d[1];
        if (x < 1 || y < 1 || x >= self.w - 1 || y >= self.h - 1) return;
        if (seen[self.idx(x, y)]) return;
        if (self.isSolid(x, y)) return;
        seen[self.idx(x, y)] = 1;
        q.push({ x: x, y: y });
      });
    }
    return seen;
  }
  var seen = reachMap();
  /* 关键点必须可达 */
  var d = this.def;
  var keys = [];
  (d.portals || []).forEach(function (p) { keys.push(p); });
  (d.npcs || []).forEach(function (p) { keys.push(p); });
  if (this.bossPt) keys.push(this.bossPt);
  (this.stelae || []).forEach(function (st) { keys.push({ x: st.x, y: st.y }); });
  var fixed = 0;
  keys.forEach(function (k) {
    if (!seen[self.idx(k.x, k.y)]) {
      self.carve(self.spawn, k);
      fixed++;
    }
  });
  if (fixed) seen = reachMap();
  this.reach = seen;
};

/* ---------------- 碰撞查询 ---------------- */
GameMap.prototype.isSolid = function (tx, ty) {
  if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
  var i = this.idx(tx, ty);
  if (TILE_SOLID[this.t[i]]) return true;
  if (this.block[i]) return true;
  return false;
};
GameMap.prototype.blockShot = function (tx, ty) {
  if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
  var i = this.idx(tx, ty);
  if (TILE_SHOT_BLOCK[this.t[i]]) return true;
  if (this.block[i]) return true;   /* 树/巨石同样挡弹道 */
  return false;
};
/* 圆形四角采样 */
GameMap.prototype.hitAt = function (px, py, r) {
  var s = Math.max(3, r * 0.62);
  return this.isSolid(Math.floor((px - s) / TILE), Math.floor((py - s) / TILE)) ||
    this.isSolid(Math.floor((px + s) / TILE), Math.floor((py - s) / TILE)) ||
    this.isSolid(Math.floor((px - s) / TILE), Math.floor((py + s) / TILE)) ||
    this.isSolid(Math.floor((px + s) / TILE), Math.floor((py + s) / TILE));
};
GameMap.prototype.shotBlockedAt = function (px, py) {
  return this.blockShot(Math.floor(px / TILE), Math.floor(py / TILE));
};

/* 找最近的可行走格（落点兜底） */
GameMap.prototype.nearestFreeTile = function (tx, ty) {
  tx = U.clamp(Math.floor(tx), 1, this.w - 2);
  ty = U.clamp(Math.floor(ty), 1, this.h - 2);
  if (!this.isSolid(tx, ty)) return { x: tx, y: ty };
  for (var r = 1; r <= 10; r++) {
    for (var j = -r; j <= r; j++) for (var i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      var x = tx + i, y = ty + j;
      if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) continue;
      if (!this.isSolid(x, y)) return { x: x, y: y };
    }
  }
  return { x: Math.floor(this.w / 2), y: Math.floor(this.h / 2) };
};

/* ---------------- 限定窗口 BFS 寻路（点地移动） ---------------- */
GameMap.prototype.findPath = function (sx, sy, gx, gy) {
  sx = Math.floor(sx / TILE); sy = Math.floor(sy / TILE);
  gx = Math.floor(gx / TILE); gy = Math.floor(gy / TILE);
  if (this.isSolid(gx, gy)) {
    var nf = this.nearestFreeTile(gx, gy);
    gx = nf.x; gy = nf.y;
  }
  var W = this.w, H = this.h;
  var x0 = Math.max(1, Math.min(sx, gx) - 8), x1 = Math.min(W - 2, Math.max(sx, gx) + 8);
  var y0 = Math.max(1, Math.min(sy, gy) - 8), y1 = Math.min(H - 2, Math.max(sy, gy) + 8);
  if (gx < x0 || gx > x1 || gy < y0 || gy > y1) return null;
  var win = (x1 - x0 + 1), hgt = (y1 - y0 + 1);
  if (win * hgt > 2800) return null;
  var prev = new Int32Array(win * hgt).fill(-1);
  var seen = new Uint8Array(win * hgt);
  var queue = new Int32Array(win * hgt);
  var qh = 0, qt = 0;
  function node(x, y) { return (y - y0) * win + (x - x0); }
  var s = node(sx, sy), g = node(gx, gy);
  seen[s] = 1; queue[qt++] = s;
  var found = false;
  while (qh < qt) {
    var cur = queue[qh++];
    if (cur === g) { found = true; break; }
    var cx2 = cur % win + x0, cy2 = Math.floor(cur / win) + y0;
    for (var d = 0; d < 4; d++) {
      var dx = [1, -1, 0, 0][d], dy = [0, 0, 1, -1][d];
      var nx = cx2 + dx, ny = cy2 + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      if (this.isSolid(nx, ny)) continue;
      var nd = node(nx, ny);
      if (seen[nd]) continue;
      seen[nd] = 1; prev[nd] = cur; queue[qt++] = nd;
    }
  }
  if (!found) return null;
  var path = [], c = g;
  while (c !== s && c >= 0) {
    path.push({ x: (c % win + x0) * TILE + 16, y: (Math.floor(c / win) + y0) * TILE + 16 });
    c = prev[c];
  }
  path.reverse();
  return path;
};

/* ---------------- 烘焙渲染 ---------------- */
var TILE_VIS = {
  g: 'grass', g2: 'grass', dt: 'dirt', p: 'path', w: 'water', l: 'lava',
  r: 'rock', k: 'rock', s: 'stone', cf: 'cavef', cw: 'cavew',
  m: 'marsh', mw: 'marshw', wd: 'wood', sn: 'snow', pg: 'peach', sa: 'sand', ab: 'abyss'
};
GameMap.prototype.bake = function () {
  var W = this.w, H = this.h;
  var c = document.createElement('canvas');
  c.width = W * TILE; c.height = H * TILE;
  var g = c.getContext('2d');
  var rnd = mulberry32(this.def.seed + 77);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var kind = TILE_VIS[this.t[this.idx(x, y)]] || 'grass';
    var v = Math.floor(rnd() * 4);
    g.drawImage(Sprites.tileCv(kind, v), x * TILE, y * TILE);
  }
  /* 水域边缘提亮：水格上方是地面 → 画一条浅色岸线 */
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var t = this.t[this.idx(x, y)];
    if (t === 'w' || t === 'mw' || t === 'l') {
      var above = y > 0 ? this.t[this.idx(x, y - 1)] : t;
      if (above !== t && !TILE_SOLID[above]) {
        g.fillStyle = t === 'l' ? 'rgba(255,160,60,0.5)' : 'rgba(220,240,255,0.35)';
        g.fillRect(x * TILE, y * TILE, TILE, 3);
      }
    }
  }
  /* ---- 边缘光影第二遍：低洼暗、高耸投影（对齐 demo bake 手法） ---- */
  var LOW = { w: 1, l: 1, mw: 1 };                    /* 低洼地形 */
  var HIGH = { r: 1, k: 1, cw: 1 };                   /* 高耸障碍 */
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var tt = this.t[this.idx(x, y)];
    var up2 = y > 0 ? this.t[this.idx(x, y - 1)] : tt;
    var dn2 = y < H - 1 ? this.t[this.idx(x, y + 1)] : tt;
    if (LOW[tt]) {
      /* 低洼顶部的岸沿阴影 + 底部受光 */
      if (!LOW[up2] && !HIGH[up2]) {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * TILE, y * TILE, TILE, 5);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x * TILE, y * TILE + 5, TILE, 4);
      }
      if (!LOW[dn2] && !HIGH[dn2]) {
        g.fillStyle = tt === 'l' ? 'rgba(255,140,60,0.22)' : 'rgba(220,240,255,0.18)';
        g.fillRect(x * TILE, y * TILE + TILE - 4, TILE, 4);
      }
    } else if (HIGH[tt]) {
      /* 高障碍：自身顶部受光；脚下地面投影 */
      if (!HIGH[up2]) {
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x * TILE, y * TILE, TILE, 3);
      }
      if (!HIGH[dn2] && !LOW[dn2]) {
        g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x * TILE, (y + 1) * TILE, TILE, 7);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x * TILE, (y + 1) * TILE + 7, TILE, 6);
      }
    }
  }
  /* 冰湖：水面格铺冷色，与普通水区分 */
  if (this.def.theme === 'snow') {
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (this.t[this.idx(x, y)] === 'w') {
        g.fillStyle = 'rgba(150,210,240,0.45)';
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
  this.baked = c;
  /* 小地图 */
  var mc = document.createElement('canvas');
  mc.width = W; mc.height = H;
  var mg = mc.getContext('2d');
  var MINI_COLOR = { g: '#4e8a3c', g2: '#427632', dt: '#8a7048', w: '#2e6ea0', l: '#c84818', r: '#62626e', k: '#62626e', s: '#7c7468', cf: '#3c3444', cw: '#241e2c', m: '#3d5c46', mw: '#2c5a54', wd: '#8c6a42', p: '#a08858', sn: '#c8d4dc', pg: '#6a9a52', sa: '#d8bc7e', ab: '#2a2440' };
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    mg.fillStyle = MINI_COLOR[this.t[this.idx(x, y)]] || '#4e8a3c';
    mg.fillRect(x, y, 1, 1);
  }
  this.miniCv = mc;
};

/* 传送门绘制数据（静态圆环动画由 game 层画） */
GameMap.prototype.drawGround = function (g, cam, vw, vh) {
  g.drawImage(this.baked, -cam.x, -cam.y);
};

/* ---------------- 环境氛围（game.drawAmbient 消费） ----------------
   tint: 全屏色罩；darkV: 暗角强度；vg: 暗角色调 rgb；dust: 环境粒子 {色,数量} */
var THEME_AMBIENT = {
  grass:   { tint: null, darkV: 0.28, vg: '8,14,6',   dust: ['#b8e890', 10] },
  forest:  { tint: 'rgba(30,60,50,0.08)', darkV: 0.34, vg: '4,12,8', dust: ['#a8e8c0', 12] },
  volcano: { tint: 'rgba(255,90,16,0.11)', darkV: 0.32, vg: '36,8,0', dust: ['#ffb060', 16] },
  cave:    { tint: 'rgba(20,18,50,0.06)', darkV: 0.32, vg: '4,4,14', dust: ['#8fa8e0', 8] },
  marsh:   { tint: 'rgba(60,90,80,0.10)', darkV: 0.36, vg: '6,14,10', dust: ['#b0d8a8', 10] },
  snow:    { tint: 'rgba(150,200,240,0.08)', darkV: 0.30, vg: '16,26,46', dust: ['#ffffff', 22] },
  peach:   { tint: 'rgba(255,190,210,0.07)', darkV: 0.30, vg: '26,12,16', dust: ['#f2c0d0', 24] },
  desert:  { tint: 'rgba(240,190,110,0.10)', darkV: 0.34, vg: '30,20,4', dust: ['#e8cc90', 20] },
  abyss:   { tint: 'rgba(60,40,110,0.12)', darkV: 0.42, vg: '8,4,22', dust: ['#b0a0e8', 14] },
  village: { tint: 'rgba(255,200,120,0.05)', darkV: 0.24, vg: '10,8,4', dust: ['#ffe9a0', 6] }
};
