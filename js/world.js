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
    } else { /* village */
      t = 'wd';
    }
    this.t[this.idx(x, y)] = t;
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

  /* ---- 3. 边界封闭 ---- */
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
      this.t[this.idx(x, y)] = (theme === 'cave') ? 'cw' : (theme === 'volcano') ? 'r' : 'k';
    }
  }

  /* ---- 4. 关键点：出生点 / 传送门 / NPC / BOSS ---- */
  var cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  this.spawn = { x: cx, y: cy };
  var keys = [{ x: cx, y: cy }];
  (d.portals || []).forEach(function (p) { keys.push({ x: p.x, y: p.y }); });
  (d.npcs || []).forEach(function (p) { keys.push({ x: p.x, y: p.y }); });
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

  /* ---- 8. 孤岛兜底 ---- */
  this.connectPockets();
};

/* 走廊：宽 3，先走长轴 */
GameMap.prototype.carve = function (a, b) {
  var self = this;
  function carveCell(x, y) {
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var x2 = U.clamp(x + i, 1, self.w - 2), y2 = U.clamp(y + j, 1, self.h - 2);
      self.t[self.idx(x2, y2)] = self.floorOf(self.t[self.idx(x2, y2)]);
    }
  }
  var x = a.x, y = a.y;
  var dx = b.x > x ? 1 : -1, dy = b.y > y ? 1 : -1;
  if (Math.abs(b.x - x) > Math.abs(b.y - y)) {
    while (x !== b.x) { carveCell(x, y); x += dx; }
    while (y !== b.y) { carveCell(x, y); y += dy; }
  } else {
    while (y !== b.y) { carveCell(x, y); y += dy; }
    while (x !== b.x) { carveCell(x, y); x += dx; }
  }
  carveCell(b.x, b.y);
};
/* 障碍瓦片 → 对应的地面瓦片（走廊挖穿用） */
GameMap.prototype.floorOf = function (t) {
  switch (t) {
    case 'w': return 'g';
    case 'l': return 's';
    case 'r': return 'g';
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
  } else if (theme === 'village') {
    /* 村庄：商店摊位、房子、装饰 */
    put('stall', 14, 20, true); put('house', 28, 20, true); put('house2', 20, 15, true);
    put('house2', 33, 9, true); put('house', 10, 27, true);
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
  g: 'grass', g2: 'grass', p: 'path', w: 'water', l: 'lava',
  r: 'rock', k: 'rock', s: 'stone', cf: 'cavef', cw: 'cavew',
  m: 'marsh', mw: 'marshw', wd: 'wood', sn: 'snow'
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
  this.baked = c;
  /* 小地图 */
  var mc = document.createElement('canvas');
  mc.width = W; mc.height = H;
  var mg = mc.getContext('2d');
  var MINI_COLOR = { g: '#4e8a3c', g2: '#427632', w: '#2e6ea0', l: '#c84818', r: '#62626e', k: '#62626e', s: '#7c7468', cf: '#3c3444', cw: '#241e2c', m: '#3d5c46', mw: '#2c5a54', wd: '#8c6a42', p: '#a08858' };
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
