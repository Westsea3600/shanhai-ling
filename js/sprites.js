/* ============================================================
   《山海拾灵》程序化像素美术：网格原语 / 灵物立绘 / 玩家 / NPC
   瓦片 / 装饰 / 图标 —— 全部代码生成，零外部资源。
   管线：体型原型(arch) 打锚点 → 特征件(feat) 挂件 → 色阶 → 描边 → 缓存
   ============================================================ */

var Sprites = (function () {
  'use strict';
  var OUT = '#16121f';            /* 统一描边色（深紫黑，像素间足够对比） */
  var cache = {};                 /* 键控离屏画布缓存 */

  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function mk(key, w, h, fn) {
    if (cache[key]) return cache[key];
    var c = cv(w, h), g = c.getContext('2d');
    fn(g, c);
    cache[key] = c;
    return c;
  }

  /* ---------------- 网格原语 ---------------- */
  function Grid(w, h) {
    this.w = w; this.h = h;
    this.d = new Array(w * h);
  }
  Grid.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined;
    return this.d[y * this.w + x];
  };
  Grid.prototype.set = function (x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  };
  Grid.prototype.px = function (x, y, c) { this.set(x, y, c); };
  Grid.prototype.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Grid.prototype.ell = function (cx, cy, rx, ry, c) {
    for (var j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++)
      for (var i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        var dx = (i - cx) / rx, dy = (j - cy) / ry;
        if (dx * dx + dy * dy <= 1.02) this.set(i, j, c);
      }
  };
  Grid.prototype.ring = function (cx, cy, rx, ry, c) {
    for (var j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++)
      for (var i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        var dx = (i - cx) / rx, dy = (j - cy) / ry;
        var v = dx * dx + dy * dy;
        if (v <= 1.05 && v >= 0.55) this.set(i, j, c);
      }
  };
  Grid.prototype.line = function (x0, y0, x1, y1, c) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), i;
    for (i = 0; i <= n; i++) {
      this.set(Math.round(U.lerp(x0, x1, i / Math.max(1, n))), Math.round(U.lerp(y0, y1, i / Math.max(1, n))), c);
    }
  };
  Grid.prototype.mirrorX = function () {
    var x, y;
    for (y = 0; y < this.h; y++) for (x = 0; x < Math.floor(this.w / 2); x++) {
      var a = this.get(x, y), b = this.get(this.w - 1 - x, y);
      if (a === undefined && b !== undefined) this.set(x, y, b);
      else if (b === undefined && a !== undefined) this.set(this.w - 1 - x, y, a);
    }
  };
  Grid.prototype.flipX = function () {
    var n = new Grid(this.w, this.h), x, y;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) n.d[y * this.w + x] = this.get(this.w - 1 - x, y);
    return n;
  };
  Grid.prototype.outline = function (c) {
    var snap = this.d.slice(), x, y, i, j;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) {
      if (snap[y * this.w + x]) continue;
      var near = false;
      for (j = -1; j <= 1 && !near; j++) for (i = -1; i <= 1; i++) {
        var v = (x + i < 0 || y + j < 0 || x + i >= this.w || y + j >= this.h) ? undefined : snap[(y + j) * this.w + (x + i)];
        if (v) { near = true; break; }
      }
      if (near) this.set(x, y, c);
    }
  };
  Grid.prototype.celShade = function () {
    /* 上 1/4 提亮，下 1/4 压暗（保留描边） */
    var x, y;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) {
      var c = this.get(x, y);
      if (!c || c === OUT) continue;
      var t = y / this.h;
      if (t < 0.28) this.set(x, y, U.shade(c, 0.10));
      else if (t > 0.72) this.set(x, y, U.shade(c, -0.16));
    }
  };
  /* 方向光五档硬色阶：光源固定左上，按像素相对形心的朝向分档。
     对齐 demo 的 dcTones 手法——平涂色块变成有体积的像素光影 */
  Grid.prototype.lightRamp = function (strength) {
    strength = strength || 1;
    var x, y, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) {
      if (this.get(x, y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        n++;
      }
    }
    if (!n || maxX < 0) return;
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var rx = Math.max(1, (maxX - minX) / 2), ry = Math.max(1, (maxY - minY) / 2);
    var tones = [-0.17, -0.07, 0, 0.09, 0.17];
    for (y = minY; y <= maxY; y++) for (x = minX; x <= maxX; x++) {
      var c = this.get(x, y);
      if (!c || c === OUT) continue;
      var dx = (x - cx) / rx, dy = (y - cy) / ry;
      /* 光源方向 (-0.7,-0.7) 归一化后的点积 */
      var lit = (dx * -0.707 + dy * -0.707) / Math.max(1, Math.sqrt(dx * dx + dy * dy) * 0.9);
      var ti = lit < -0.45 ? 0 : lit < -0.12 ? 1 : lit < 0.12 ? 2 : lit < 0.45 ? 3 : 4;
      var off = tones[ti] * strength;
      if (off) this.set(x, y, U.shade(c, off));
    }
  };
  /* 轮廓内侧顶光：上/左邻空 → 提亮，下/右邻空 → 压暗（细杆跳过防整条腿全亮） */
  Grid.prototype.topLight = function () {
    var snap = this.d.slice(), x, y;
    function at(i, xx, yy) { return xx < 0 || yy < 0 || xx >= this.w || yy >= this.h ? undefined : snap[yy * this.w + xx]; }
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) {
      var c = snap[y * this.w + x];
      if (!c || c === OUT) continue;
      var up = at.call(this, 0, x, y - 1), dn = at.call(this, 0, x, y + 1);
      var le = at.call(this, 0, x - 1, y), ri = at.call(this, 0, x + 1, y);
      /* 上下皆空的细杆（尾梢/腿）不上下染色 */
      if (!up && !dn) { if (!le) this.set(x, y, U.shade(c, 0.14)); continue; }
      if (!up || !le) this.set(x, y, U.shade(c, 0.16));
      else if (!dn || !ri) this.set(x, y, U.shade(c, -0.13));
    }
  };
  Grid.prototype.render = function (scale, c) {
    scale = scale || 2;
    c = c || cv(this.w * scale, this.h * scale);
    var g = c.getContext('2d'), x, y;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) {
      var col = this.d[y * this.w + x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
    return c;
  };

  /* ============================================================
     灵物立绘：30×24 网格，右侧朝向，锚点写在 g.dc
     ============================================================ */
  var CW = 30, CH = 24;

  function shade2(a, c) { return U.shade(c, a); }

  /* —— 体型原型 —— */
  var ARCH = {
    quad: function (g, a) {          /* 四足兽（狸力/鹿蜀/火鼠/猼訑） */
      var c1 = a.c1, c2 = a.c2;
      g.ell(13, 13, 8.4, 5.4, c1);
      g.ell(13, 15.4, 8.0, 3.2, c2);
      g.ell(22.4, 9.4, 4.4, 3.8, c1);          /* 头 */
      g.rect(24, 10, 3, 2, c2);                 /* 吻部 */
      g.px(26, 10, c2); g.px(27, 11, shade2(-0.1, c2));
      g.rect(9, 17, 2, 6, c2); g.rect(16, 17, 2, 6, c2);   /* 前后腿 */
      g.rect(11, 17, 2, 5, shade2(-0.08, c2)); g.rect(18, 17, 2, 5, shade2(-0.08, c2));
      g.px(23, 8, '#1c1622');                   /* 眼 */
      g.dc = { hx: 22.4, hy: 9.4, tx: 5, ty: 12, bx: 13, by: 13 };
    },
    wolf: function (g, a) {          /* 狼 / 天狗：长腿尖吻 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(13, 12, 8.2, 4.4, c1);
      g.ell(13, 14.2, 7.6, 2.8, c2);
      g.ell(22.6, 9, 4.0, 3.2, c1);
      g.rect(24, 10, 4, 2, c2); g.px(28, 11, c1);         /* 尖吻 */
      g.px(23, 8, '#1c1622');
      g.rect(8, 15, 2, 8, c2); g.rect(15, 15, 2, 8, c2);
      g.rect(10, 15, 2, 7, shade2(-0.08, c2)); g.rect(17, 15, 2, 7, shade2(-0.08, c2));
      g.dc = { hx: 22.6, hy: 9, tx: 5, ty: 11, bx: 13, by: 12 };
    },
    cat: function (g, a) {           /* 猫型（讙/狰）：拱背细身 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(13, 12.6, 8.0, 4.2, c1);
      g.ell(13, 14.6, 7.4, 2.6, c2);
      g.ell(22.2, 9.6, 3.8, 3.4, c1);
      g.rect(24, 10, 3, 2, c2);
      g.px(23, 8.6, '#1c1622');
      g.rect(9, 16, 2, 6, c2); g.rect(16, 16, 2, 6, c2);
      g.rect(11, 16, 2, 5, shade2(-0.08, c2)); g.rect(18, 16, 2, 5, shade2(-0.08, c2));
      g.dc = { hx: 22.2, hy: 9.6, tx: 5, ty: 12, bx: 13, by: 12.6 };
    },
    ox: function (g, a) {            /* 夔：牛型壮硕 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(13, 12, 9.2, 6.2, c1);
      g.ell(13, 15, 8.6, 3.8, c2);
      g.ell(23, 10, 5.0, 4.4, c1);
      g.rect(25, 11, 3, 3, c2);
      g.px(24, 9, '#1c1622');
      g.rect(8, 17, 3, 6, c2); g.rect(16, 17, 3, 6, c2);
      g.rect(11, 17, 2, 5, shade2(-0.08, c2)); g.rect(19, 17, 2, 5, shade2(-0.08, c2));
      g.dc = { hx: 23, hy: 10, tx: 4, ty: 12, bx: 13, by: 12 };
    },
    fox: function (g, a) {           /* 九尾狐 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(13, 12.6, 7.4, 4.4, c1);
      g.ell(13, 14.6, 6.8, 2.8, c2);
      g.ell(22.6, 9.4, 4.0, 3.4, c1);          /* 三角脸 */
      g.px(25.4, 9.4, c1); g.px(26.4, 10.2, c1);
      g.px(23, 8.4, '#1c1622');
      g.px(24.6, 8.2, '#1c1622');
      g.rect(9, 16, 2, 7, c2); g.rect(16, 16, 2, 7, c2);
      g.rect(11, 16, 2, 5, shade2(-0.08, c2)); g.rect(18, 16, 2, 5, shade2(-0.08, c2));
      g.dc = { hx: 22.6, hy: 9.4, tx: 5, ty: 12, bx: 13, by: 12.6 };
    },
    turtle: function (g, a) {
      var c1 = a.c1, c2 = a.c2, c3 = a.c3;
      g.ell(14, 12, 9.4, 6.6, c3);              /* 壳底 */
      g.ell(14, 11, 8.6, 5.8, c1);              /* 壳面 */
      for (var i = 0; i < 3; i++) g.ell(10 + i * 4, 11, 1.4, 1.6, c3);  /* 甲纹 */
      g.ell(25, 12.6, 3.0, 2.4, c2);            /* 头 */
      g.px(26, 11.8, '#1c1622');
      g.rect(8, 17, 3, 3, c2); g.rect(17, 17, 3, 3, c2);
      g.rect(12, 18, 2, 3, shade2(-0.08, c2));
      g.dc = { hx: 25, hy: 12.6, tx: 5, ty: 14, bx: 14, by: 11 };
    },
    bird: function (g, a) {
      var c1 = a.c1, c2 = a.c2;
      g.ell(14, 13.4, 6.4, 5.4, c1);
      g.ell(14, 15.4, 6.0, 3.4, c2);
      g.ell(20.6, 8.6, 3.6, 3.2, c1);           /* 头 */
      g.px(23.4, 9.4, shade2(0.2, '#e8d8a0')); g.px(24.4, 9.0, '#e8d8a0');  /* 喙 */
      g.px(21, 8, '#1c1622');
      g.rect(12, 18, 1, 4, shade2(0.1, a.c3)); g.rect(16, 18, 1, 4, shade2(0.1, a.c3));  /* 腿 */
      g.px(11, 22, a.c3); g.px(15, 22, a.c3); g.px(12, 22, a.c3); g.px(16, 22, a.c3);    /* 爪 */
      g.dc = { hx: 20.6, hy: 8.6, tx: 7, ty: 13, bx: 14, by: 13.4 };
    },
    ape: function (g, a) {           /* 长右：直立猿 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(14, 13, 5.4, 6.2, c1);
      g.ell(14, 15, 4.8, 4.2, c2);
      g.ell(15, 5.4, 3.6, 3.4, c1);             /* 头 */
      g.px(16.4, 5, '#1c1622'); g.px(14, 5, '#1c1622');
      g.rect(8, 9, 2, 7, c1); g.rect(20, 9, 2, 7, c1);          /* 长臂 */
      g.rect(11, 19, 3, 4, c2); g.rect(16, 19, 3, 4, c2);       /* 短腿 */
      g.dc = { hx: 15, hy: 5.4, tx: 6, ty: 16, bx: 14, by: 13 };
    },
    fish: function (g, a) {          /* 文鳐鱼/何罗鱼 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(15, 12.6, 8.6, 4.8, c1);
      g.ell(15, 14.6, 8.0, 3.2, c2);
      /* 尾鳍 */
      g.line(6, 12, 3, 9, c2); g.line(6, 13, 2, 13, c2); g.line(6, 14, 3, 17, c2);
      g.ell(22.6, 12.2, 2.6, 2.4, c1);          /* 头 */
      g.px(23.6, 11.4, '#1c1622');
      g.rect(9, 8, 6, 2, c2);                   /* 背鳍 */
      g.rect(11, 17, 4, 2, shade2(-0.06, c2));  /* 腹鳍 */
      g.dc = { hx: 22.6, hy: 12.2, tx: 4, ty: 12.6, bx: 15, by: 12.6 };
    },
    serpent: function (g, a) {       /* 肥遗：S 形蛇 */
      var c1 = a.c1, c2 = a.c2;
      for (var t = 0; t <= 20; t++) {
        var x = 4 + t, y = 13 + Math.sin(t * 0.32) * 4.4;
        g.ell(x, y, 2.2, 2.0, c1);
        g.px(x, y + 1.4, c2);
      }
      g.ell(25.4, 10.4, 2.8, 2.4, c1);          /* 蛇头 */
      g.px(26, 9.6, '#1c1622');
      g.px(28.2, 11.2, shade2(0.15, a.c3));
      g.dc = { hx: 25.4, hy: 10.4, tx: 4, ty: 11, bx: 14, by: 13 };
    },
    wisp: function (g, a) {          /* 混灵/帝江：浮游灵 */
      var c1 = a.c1, c2 = a.c2;
      g.ell(15, 12, 8.0, 7.6, c1);
      g.ell(15, 13.6, 7.2, 5.6, c2);
      g.ell(12.4, 10.4, 2.2, 2.4, shade2(0.22, c1));
      g.px(17, 10, '#1c1622'); g.px(19.6, 10.6, '#1c1622');
      g.px(17.6, 13.4, '#1c1622'); g.px(18.8, 13, '#1c1622'); g.px(16.6, 13, '#1c1622');  /* 无面之纹 */
      g.dc = { hx: 15, hy: 9, tx: 4, ty: 14, bx: 15, by: 12 };
    }
  };

  /* —— 特征件（读取 g.dc 锚点） —— */
  var FEAT = {
    pointEars: function (g, a) { var d = g.dc; g.rect(d.hx - 2, d.hy - 6, 2, 4, a.c2); g.px(d.hx - 2, d.hy - 7, a.c2); },
    roundEars: function (g, a) { var d = g.dc; g.ell(d.hx - 2, d.hy - 4, 2.2, 2.2, a.c2); g.ell(d.hx - 2, d.hy - 4, 1.0, 1.0, shade2(0.14, a.c3)); },
    fourEars: function (g, a) {
      var d = g.dc;
      g.rect(d.hx - 4, d.hy - 5, 2, 3, a.c2); g.rect(d.hx - 1, d.hy - 6, 2, 4, a.c2);
      g.ell(d.hx - 3, d.hy + 1, 1.8, 1.8, a.c2); g.ell(d.hx + 1, d.hy + 1, 1.8, 1.8, a.c2);
    },
    snout: function (g, a) { var d = g.dc; g.ell(d.hx + 2.4, d.hy + 1, 2.2, 1.6, shade2(0.1, a.c2)); g.px(d.hx + 2, d.hy + 1, a.c3); g.px(d.hx + 3.4, d.hy + 1, a.c3); },
    tusk: function (g, a) { var d = g.dc; g.px(d.hx + 2, d.hy + 2.4, '#f0ead8'); g.px(d.hx + 3, d.hy + 3.2, '#f0ead8'); },
    curlHorn: function (g, a) { var d = g.dc; g.ring(d.hx - 1, d.hy - 5, 2.6, 2.6, shade2(0.16, a.c3)); },
    goldHorn: function (g, a) {
      var d = g.dc, hc = '#e8c860';
      g.line(d.hx - 1, d.hy - 3, d.hx - 2, d.hy - 6, hc);
      g.line(d.hx, d.hy - 3, d.hx - 1, d.hy - 6, hc);
      g.px(d.hx - 2, d.hy - 7, hc); g.px(d.hx - 1, d.hy - 7, '#fff0c0');
    },
    mane: function (g, a) { var d = g.dc; g.ell(d.hx - 4, d.hy + 1, 2.4, 3.4, shade2(0.12, a.c2)); g.ell(d.hx - 6, d.hy + 2, 2.0, 3.0, shade2(0.12, a.c2)); },
    flameMane: function (g, a) {
      var d = g.dc, f = '#ffb060';
      g.ell(d.hx - 4, d.hy + 1, 2.4, 3.2, '#e87030'); g.ell(d.hx - 5, d.hy + 2, 1.8, 2.6, f);
    },
    stripes: function (g, a) { var d = g.dc; for (var i = 0; i < 4; i++) g.rect(d.bx - 5 + i * 3.2, d.by - 3, 1.4, 6, shade2(-0.1, a.c3)); },
    shortTail: function (g, a) { var d = g.dc; g.ell(d.tx, d.ty, 2.6, 1.8, a.c2); },
    longTail: function (g, a) { var d = g.dc; g.line(d.tx, d.ty, d.tx - 4, d.ty - 2, a.c2); g.line(d.tx - 4, d.ty - 2, d.tx - 7, d.ty + 1, a.c2); },
    snakeTail: function (g, a) { var d = g.dc; g.line(d.tx, d.ty, d.tx - 4, d.ty - 3, a.c3); g.px(d.tx - 5, d.ty - 4, a.c3); },
    flameTail: function (g, a) {
      var d = g.dc;
      g.ell(d.tx - 1, d.ty, 3.0, 2.4, '#e87030'); g.ell(d.tx - 2, d.ty - 1, 1.8, 1.6, '#ffc060');
    },
    threeTail: function (g, a) { var d = g.dc; for (var i = -1; i <= 1; i++) g.line(d.tx, d.ty, d.tx - 5, d.ty + i * 3, a.c2); },
    fiveTail: function (g, a) { var d = g.dc; for (var i = -2; i <= 2; i++) g.line(d.tx, d.ty, d.tx - 5, d.ty + i * 2.4, a.c2); },
    nineTail: function (g, a) {
      var d = g.dc, i;
      for (i = -3; i <= 3; i++) {
        var ty = d.ty + i * 2.4;
        /* 尾根粗尾梢细：两段线宽模拟，尾尖亮点让每条尾巴可数 */
        g.line(d.tx, d.ty, d.tx - 3, ty, a.c2);
        g.line(d.tx - 3, ty, d.tx - 5, ty + (i < 0 ? -1 : 1), shade2(0.08, a.c2));
        g.set(Math.round(d.tx - 6), Math.round(ty + (i < 0 ? -1.4 : 1.4)), shade2(0.28, a.c1));
      }
    },
    wings: function (g, a) {
      var d = g.dc, wc = shade2(0.08, a.c2);
      g.ell(d.bx - 1, d.by - 4, 4.6, 3.0, wc);
      g.ell(d.bx - 3, d.by - 5.4, 3.4, 2.2, shade2(0.16, a.c1));
    },
    fourWing: function (g, a) {
      var d = g.dc, wc = shade2(0.1, a.c2);
      g.ell(d.bx - 2, d.by - 4, 3.6, 2.4, wc); g.ell(d.bx + 4, d.by - 3, 3.6, 2.4, wc);
      g.ell(d.bx - 1, d.by + 4, 3.2, 2.2, wc); g.ell(d.bx + 5, d.by + 3, 3.2, 2.2, wc);
    },
    crest: function (g, a) { var d = g.dc; g.line(d.hx - 1, d.hy - 4, d.hx - 2, d.hy - 8, a.c2); g.px(d.hx - 3, d.hy - 8, shade2(0.2, a.c1)); },
    finCrest: function (g, a) { var d = g.dc; g.line(d.bx - 2, d.by - 4.4, d.bx, d.by - 7, a.c2); g.line(d.bx + 1, d.by - 4.4, d.bx + 2, d.by - 6.4, a.c2); },
    oneEye: function (g, a) { var d = g.dc; g.ell(d.hx, d.hy - 0.6, 1.8, 1.8, '#f4f0e0'); g.px(d.hx, d.hy - 0.6, '#1c1622'); },
    threeHead: function (g, a) {
      var d = g.dc;
      g.ell(d.hx - 2, d.hy - 3.4, 2.8, 2.6, a.c1); g.px(Math.round(d.hx - 2), Math.round(d.hy - 4), '#1c1622');
      g.ell(d.hx + 2.2, d.hy - 2.6, 2.8, 2.6, a.c1); g.px(Math.round(d.hx + 2.4), Math.round(d.hy - 3.2), '#1c1622');
      g.px(Math.round(d.hx - 2), Math.round(d.hy - 2), '#e8b0b0'); g.px(Math.round(d.hx + 2.2), Math.round(d.hy - 1.4), '#e8b0b0');
    },
    twoBody: function (g, a) {
      var d = g.dc;
      /* 第二身 + 第二头：把"一首两身"画成看得出的双头双身 */
      g.ell(d.bx - 3, d.by + 5, 6.0, 3.4, shade2(-0.06, a.c1));
      g.ell(d.bx - 3, d.by + 6.4, 5.4, 2.4, shade2(-0.1, a.c2));
      g.ell(d.hx + 2.4, d.hy - 2.6, 2.4, 2.2, a.c1);
      g.px(Math.round(d.hx + 3), Math.round(d.hy - 3), '#1c1622');
    },
    tenBody: function (g, a) {
      var i;
      for (i = 0; i < 3; i++) {
        g.ell(g.dc.bx - 4 + i * 2, g.dc.by + 5 + (i % 2), 5.0 - i * 0.4, 2.8, shade2(-0.05 - i * 0.03, a.c1));
      }
    },
    oneLeg: function (g, a) {
      /* 毕方独足：清除原腿区域重画一条 */
      var d = g.dc, x, y;
      for (y = 17; y < 24; y++) for (x = 10; x < 19; x++) if (g.get(x, y)) g.set(x, y, null);
      g.rect(14, 18, 2, 5, shade2(0.1, a.c3)); g.px(13, 23, a.c3); g.px(14, 23, a.c3); g.px(15, 23, a.c3);
    },
    hornShell: function (g, a) {
      var d = g.dc;
      g.px(d.bx - 4, d.by - 6, '#d8d0c0'); g.px(d.bx, d.by - 6.6, '#d8d0c0'); g.px(d.bx + 4, d.by - 6, '#d8d0c0');
    },
    aura: function (g, a) { auraDots(g, a.c2, 7); },
    fireAura: function (g, a) { auraDots(g, '#ff9040', 9); },
    darkAura: function (g, a) { auraDots(g, '#7a5a9c', 9); },
    storm: function (g, a) { auraDots(g, '#ffe070', 8); },
    chaos: function (g, a) {
      var d = g.dc, i;
      for (i = 0; i < 8; i++) {
        var ang = i / 8 * Math.PI * 2;
        g.px(d.bx + Math.cos(ang) * 10.5, d.by + Math.sin(ang) * 9.5, i % 2 ? '#e8c860' : '#c89030');
      }
    }
  };
  function auraDots(g, col, n) {
    var d = g.dc, i;
    for (i = 0; i < n; i++) {
      var ang = i / n * Math.PI * 2;
      g.ell(d.bx + Math.cos(ang) * 10.6, d.by + Math.sin(ang) * 9.2, 1.0, 1.0, col);
    }
  }

  /* —— 灵物网格（供世界与面板复用） —— */
  function creatureGrid(spId, opt) {
    opt = opt || {};
    var sp = SPECIES[spId], a = sp.art;
    var g = new Grid(CW, CH);
    (ARCH[a.arch] || ARCH.quad)(g, a);
    (a.feat || []).forEach(function (f) { if (FEAT[f]) FEAT[f](g, a); });
    if (opt.walk) { /* 走路帧：整体下沉 1px + 耳尾抖动由绘制端处理 */
      g.set(CW - 1, CH - 2, null);
    }
    if (!opt.noLight) { g.lightRamp(1); g.topLight(); }
    g.outline(OUT);
    return g;
  }
  function creatureCv(spId, frame, flip, shiny) {
    return mk('cr|' + spId + '|' + (frame || 0) + '|' + (flip ? 1 : 0) + '|' + (shiny ? 1 : 0),
      CW * 2, CH * 2, function (g2, c) {
        var g = creatureGrid(spId, { noLight: flip });
        if (flip) {
          /* 翻转后重新烘焙光照：保持光源永远在画面左上，不随朝向镜像反转 */
          g = g.flipX();
          g.lightRamp(1);
          g.topLight();
          g.outline(OUT);
        }
        if (frame === 1) { /* 第二帧：整体上移 1 逻辑像素，模拟跑动起伏 */
          var g2b = new Grid(CW, CH), x, y;
          for (y = 0; y < CH - 1; y++) for (x = 0; x < CW; x++) g2b.d[y * CW + x] = g.get(x, y + 1);
          g = g2b;
        }
        g.render(2, c);
        if (shiny) { /* 闪光：外圈金色光粒 */
          g2.globalCompositeOperation = 'lighter';
          g2.fillStyle = 'rgba(255,220,120,0.5)';
          for (var i = 0; i < 10; i++) {
            var ang = i / 10 * Math.PI * 2;
            g2.fillRect(30 + Math.cos(ang) * 28, 24 + Math.sin(ang) * 22, 3, 3);
          }
          g2.globalCompositeOperation = 'source-over';
        }
      });
  }

  /* ============================================================
     玩家（16×22 网格）与武器
     ============================================================ */
  var SKIN = '#e8c8a0', HAIR = '#4a3626';
  function playerGrid(clsId, tier, frame, flip) {
    return mk('pl|' + clsId + '|' + tier + '|' + frame + '|' + (flip ? 1 : 0), 32, 44, function (g, c) {
      var gr = new Grid(16, 22);
      var tunic = ['#7a8a5a', '#6a7a90', '#7898a0', '#7c94b8'][tier];       /* 按装备档位换色（3=寒铁） */
      var trim = ['#5a6a40', '#4c5a6c', '#587880', '#5c7398'][tier];
      var bob = frame === 1 ? 1 : 0;
      /* 腿 */
      gr.rect(6, 16 + bob, 2, 5, '#3a3440'); gr.rect(9, 16 + (1 - bob), 2, 5, '#3a3440');
      gr.rect(6, 21 + bob, 2, 1, OUT); gr.rect(9, 21 + (1 - bob), 2, 1, OUT);
      /* 躯干 */
      gr.rect(5, 9, 7, 7, tunic);
      gr.rect(5, 15, 7, 1, trim);                  /* 腰带 */
      gr.px(8, 15, '#d8b860');
      /* 手臂（右手朝向 +x） */
      gr.rect(4, 10, 1, 5, tunic); gr.rect(12, 10, 1, 5, tunic);
      gr.px(4, 15, SKIN); gr.px(12, 15, SKIN);
      /* 头 */
      gr.ell(8, 5.4, 3.6, 3.4, SKIN);
      gr.rect(5, 1.6, 7, 2.6, HAIR); gr.rect(4.6, 2, 1.4, 3.4, HAIR); gr.rect(11, 2, 1.4, 3.4, HAIR);
      gr.px(9, 5, '#1c1622');                       /* 眼（朝右） */
      /* 职业标记 */
      if (clsId === 'sword') { gr.px(4, 10, '#c04040'); gr.px(12, 10, '#c04040'); }       /* 红肩带 */
      if (clsId === 'mage')  { gr.rect(5, 9, 7, 1, '#8ab0e0'); gr.px(8, 12, '#8ab0e0'); } /* 蓝纹 */
      if (clsId === 'archer'){ gr.px(4, 11, '#7cb342'); gr.px(12, 11, '#7cb342'); }       /* 绿羽 */
      gr.celShade();
      gr.outline(OUT);
      var g2 = flip ? gr.flipX() : gr;
      g2.render(2, c);
    });
  }

  /* 武器贴图（跟随朝向旋转，scale 2） */
  function weaponCv(wt, tier) {
    return mk('wp|' + wt + '|' + tier, 40, 16, function (g, c) {
      var gr = new Grid(20, 8);
      var cMetal = ['#b8c4cc', '#7e96a8', '#9fd8e8', '#c8ecfc'][tier];
      if (wt === 'sword') {
        gr.rect(3, 3, 11, 2, cMetal);
        gr.px(14, 3, U.shade(cMetal, 0.2)); gr.px(15, 4, U.shade(cMetal, 0.2));
        gr.rect(2, 2, 1, 4, '#8a6a3a'); gr.rect(0, 3, 2, 1, '#6a4e2a'); gr.rect(0, 4, 2, 1, '#6a4e2a');
      } else if (wt === 'staff') {
        gr.rect(2, 3, 13, 1, '#8a6a3a');
        gr.ell(16, 3.5, 2.2, 2.2, cMetal); gr.px(16, 3, U.shade(cMetal, 0.3));
      } else {
        /* 弓 */
        gr.ring(8, 4, 5, 5, '#a8804a');
        gr.line(12, 0, 12, 8, '#e8e0d0');
        gr.px(8, 4, '#a8804a');
      }
      gr.outline(OUT);
      gr.render(2, c);
    });
  }

  /* NPC 立绘 */
  function npcCv(faceId, frame) {
    return mk('npc|' + faceId + '|' + (frame || 0), 32, 44, function (g, c) {
      var gr = new Grid(16, 22);
      var P = {
        elder:   { robe: '#8a7a5a', hair: '#d8d0c4', hat: 0 },
        shopper: { robe: '#b06858', hair: '#3a2c20', hat: 1 },
        smith:   { robe: '#5c5c64', hair: '#30261c', hat: 2 },
        healer:  { robe: '#c8d8c0', hair: '#503a28', hat: 0 },
        lingyu:  { robe: '#6898b0', hair: '#2c2438', hat: 3 },
        kid:     { robe: '#d8a050', hair: '#4a3626', hat: 0 },
        herbalist:{ robe: '#7a9a5c', hair: '#584434', hat: 1 },
        walker:  { robe: '#a05838', hair: '#3c2c1e', hat: 2 },
        keeper:  { robe: '#4a4458', hair: '#242030', hat: 2 },
        fisher:  { robe: '#587890', hair: '#787060', hat: 1 },
        hunter:  { robe: '#6e7f95', hair: '#4c4238', hat: 4 }
      }[faceId] || { robe: '#888', hair: '#444', hat: 0 };
      var bob = frame === 1 ? 1 : 0;
      gr.rect(6, 16 + bob, 2, 5, '#3a3440'); gr.rect(9, 16 + (1 - bob), 2, 5, '#3a3440');
      gr.rect(5, 9, 7, 8, P.robe);
      gr.rect(5, 16, 7, 1, U.shade(P.robe, -0.15));
      gr.rect(4, 10, 1, 5, P.robe); gr.rect(12, 10, 1, 5, P.robe);
      gr.px(4, 15, SKIN); gr.px(12, 15, SKIN);
      gr.ell(8, 5.4, 3.6, 3.4, SKIN);
      gr.rect(5, 1.8, 7, 2.4, P.hair);
      if (P.hat === 1) { gr.rect(4, 1, 9, 1.6, U.shade(P.robe, -0.1)); gr.rect(6, 0, 5, 1, U.shade(P.robe, -0.1)); }
      if (P.hat === 2) { gr.rect(4.4, 0.4, 7.4, 1.8, '#4a4440'); }
      if (P.hat === 3) { gr.px(8, -0.4 + 1, '#d8b860'); gr.rect(7, 1, 3, 1, '#d8b860'); }
      if (P.hat === 4) { gr.rect(4.6, 0.6, 7, 1.8, '#e8eef4'); gr.rect(4.2, 2.2, 8, 1, '#c8d4dc'); }   /* 毛皮风帽 */
      gr.px(7, 5, '#1c1622'); gr.px(9, 5, '#1c1622');
      gr.celShade();
      gr.outline(OUT);
      gr.render(2, c);
    });
  }

  /* ============================================================
     瓦片（16×16，scale 2 = 32px）
     ============================================================ */
  var TILE_PALETTE = {
    grass:  { base: '#4e8a3c', sp1: '#5c9a48', sp2: '#427632' },
    peach:  { base: '#6a9a52', sp1: '#7cae62', sp2: '#548244' },
    sand:   { base: '#d8bc7e', sp1: '#e8cc90', sp2: '#c2a468' },
    dirt:   { base: '#8a7048', sp1: '#987e54', sp2: '#766040' },
    water:  { base: '#2e6ea0', sp1: '#3c7eb0', sp2: '#245a86' },
    lava:   { base: '#c84818', sp1: '#e86828', sp2: '#a03810' },
    rock:   { base: '#62626e', sp1: '#747480', sp2: '#50505c' },
    stone:  { base: '#7c7468', sp1: '#8c8478', sp2: '#6a6258' },
    cavef:  { base: '#3c3444', sp1: '#484050', sp2: '#302a38' },
    cavew:  { base: '#241e2c', sp1: '#2e2838', sp2: '#1a1622' },
    marsh:  { base: '#3d5c46', sp1: '#49684f', sp2: '#324a3a' },
    abyss:  { base: '#2a2440', sp1: '#38305a', sp2: '#1e1a30' },
    marshw: { base: '#2c5a54', sp1: '#386860', sp2: '#224640' },
    wood:   { base: '#8c6a42', sp1: '#9c7a50', sp2: '#785a38' },
    path:   { base: '#a08858', sp1: '#ac9464', sp2: '#8c7448' },
    snow:   { base: '#c8d4dc', sp1: '#d8e0e4', sp2: '#b4c0c8' }
  };
  function tileCv(kind, v) {
    return mk('tl|' + kind + '|' + v, TILE, TILE, function (g) {
      var p = TILE_PALETTE[kind] || TILE_PALETTE.grass;
      var rnd = mulberry32(kind.charCodeAt(0) * 31 + v * 977 + kind.length * 7);
      g.fillStyle = p.base; g.fillRect(0, 0, TILE, TILE);
      var i, speck;
      /* 低频斑块：2~3 大块，替代满屏噪点（demo 手法：底色平涂 + 低频变化） */
      for (i = 0; i < 3; i++) {
        speck = rnd();
        g.fillStyle = U.rgba(speck > 0.5 ? p.sp1 : p.sp2, 0.5);
        var bx = rnd() * TILE, by = rnd() * TILE, br = 6 + rnd() * 8;
        g.beginPath(); g.ellipse(bx, by, br, br * 0.6, rnd() * 3, 0, 6.28); g.fill();
      }
      if (kind === 'grass' || kind === 'marsh') {
        /* 草簇：4~6 处，每簇 2~3 根，顶端亮色高光（振幅足够肉眼可辨） */
        for (i = 0; i < 5; i++) {
          var gx = 3 + rnd() * (TILE - 7), gy = 4 + rnd() * (TILE - 8);
          var blades = 2 + (rnd() * 2 | 0);
          for (var b = 0; b < blades; b++) {
            var h2 = 2 + (rnd() * 2 | 0);
            g.fillStyle = U.shade(p.sp2, -0.08);
            g.fillRect(gx + b * 2, gy + 2 - h2, 1, h2 + 1);
            g.fillStyle = U.shade(p.sp1, 0.22);
            g.fillRect(gx + b * 2, gy + 1 - h2, 1, 1);
          }
        }
        if (rnd() < 0.4) { g.fillStyle = U.shade(p.sp1, 0.28); g.fillRect(rnd() * (TILE - 4), rnd() * (TILE - 4), 2, 1); }
      }
      if (kind === 'peach') {
        /* 桃林草地：草簇 + 飘落花瓣点 */
        for (i = 0; i < 3; i++) {
          var gx2 = 3 + rnd() * (TILE - 7), gy2 = 4 + rnd() * (TILE - 8);
          g.fillStyle = U.shade(p.sp2, -0.08);
          g.fillRect(gx2, gy2, 1, 3);
          g.fillStyle = U.shade(p.sp1, 0.22);
          g.fillRect(gx2, gy2 - 1, 1, 1);
        }
        for (i = 0; i < 3; i++) {
          g.fillStyle = i % 2 ? '#f2b8c8' : '#e8a0b8';
          g.fillRect(rnd() * (TILE - 3), rnd() * (TILE - 3), 2, 1);
        }
      }
      if (kind === 'sand') {
        /* 流沙：正弦沙纹（暗亮双线，对比拉满）+ 风蚀暗线 */
        for (i = 0; i < 3; i++) {
          var wy3 = 5 + i * 10 + rnd() * 4;
          g.lineWidth = 1;
          g.strokeStyle = U.rgba(p.sp2, 0.95);
          g.beginPath(); g.moveTo(0, wy3);
          for (var wx3 = 0; wx3 <= TILE; wx3 += 4) g.lineTo(wx3, wy3 + Math.sin(wx3 * 0.35 + v + i) * 2.5);
          g.stroke();
          g.strokeStyle = U.rgba(p.sp1, 0.8);
          g.beginPath(); g.moveTo(0, wy3 - 2);
          for (wx3 = 0; wx3 <= TILE; wx3 += 4) g.lineTo(wx3, wy3 - 2 + Math.sin(wx3 * 0.35 + v + i) * 2.5);
          g.stroke();
        }
        if (rnd() < 0.5) { g.fillStyle = U.rgba(p.sp1, 0.9); g.fillRect(rnd() * (TILE - 6), rnd() * (TILE - 3), 4, 1); }
      }
      if (kind === 'dirt' || kind === 'path') {
        /* 沙纹：正弦起伏 + 碎石点 */
        for (i = 0; i < 2; i++) {
          g.strokeStyle = U.rgba(p.sp2, 0.5); g.lineWidth = 1;
          g.beginPath();
          var wy = 6 + i * 12 + rnd() * 4;
          g.moveTo(0, wy);
          for (var wx = 0; wx <= TILE; wx += 4) g.lineTo(wx, wy + Math.sin(wx * 0.35 + v) * 2);
          g.stroke();
        }
        for (i = 0; i < 3; i++) { g.fillStyle = U.rgba(p.sp1, 0.7); g.fillRect(rnd() * (TILE - 3), rnd() * (TILE - 3), 2, 2); }
      }
      if (kind === 'water' || kind === 'marshw') {
        /* 三色横带 + 三层高光波纹 + 波线 */
        for (i = 0; i < 4; i++) {
          var y2 = i * 8 + (v % 2) * 3;
          g.fillStyle = [p.sp1, p.base, p.sp2][i % 3];
          g.globalAlpha = 0.5;
          g.fillRect(0, y2, TILE, 8);
          g.globalAlpha = 1;
        }
        for (i = 0; i < 3; i++) {
          var hx = rnd() * (TILE - 10), hy = 4 + rnd() * (TILE - 10);
          g.fillStyle = 'rgba(255,255,255,0.30)'; g.fillRect(hx, hy, 7, 2);
          g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(hx + 2, hy - 2, 4, 1);
        }
        g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(2, 14 + (v % 3) * 5); g.lineTo(14, 13 + (v % 3) * 5); g.stroke();
      }
      if (kind === 'lava') {
        /* 亮斑 + 暗流裂纹 */
        for (i = 0; i < 3; i++) {
          g.fillStyle = U.rgba(p.sp1, 0.8);
          g.fillRect(rnd() * (TILE - 6), rnd() * (TILE - 4), 5, 2);
        }
        g.strokeStyle = U.rgba(p.sp2, 0.75); g.lineWidth = 2;
        g.beginPath();
        g.moveTo(4, 2); g.lineTo(10, 10); g.lineTo(8, 20); g.lineTo(16, 26); g.lineTo(24, 15);
        g.stroke();
        g.fillStyle = 'rgba(255,220,120,0.6)'; g.fillRect(6 + v * 2, 24, 4, 2);
      }
      if (kind === 'rock' || kind === 'cavew') {
        g.strokeStyle = p.sp2; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(4, 2); g.lineTo(10, 10); g.lineTo(8, 20); g.lineTo(16, 24); g.lineTo(22, 14);
        g.stroke();
        g.fillStyle = p.sp1;
        g.fillRect(6 + rnd() * 8, 8 + rnd() * 10, 3, 2);
      }
      if (kind === 'rock' || kind === 'cavew' || kind === 'stone') {
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, TILE - 4, TILE, 4);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, TILE, 3);
      }
      if (kind === 'snow') {
        /* 雪面：平整底 + 冰晶亮点 + 蓝影斑 + 波痕（细节振幅拉大） */
        for (i = 0; i < 4; i++) {
          g.fillStyle = U.rgba(p.sp1, 0.95);
          g.fillRect(rnd() * (TILE - 3), rnd() * (TILE - 3), 2, 1);
        }
        if (rnd() < 0.6) {
          g.fillStyle = U.rgba(p.sp2, 0.55);
          g.beginPath(); g.ellipse(rnd() * TILE, rnd() * TILE, 7, 4, rnd() * 3, 0, 6.28); g.fill();
        }
        g.strokeStyle = U.rgba(p.sp2, 0.8); g.lineWidth = 1;
        g.beginPath();
        var sy2 = 8 + (v % 3) * 7;
        g.moveTo(0, sy2); g.bezierCurveTo(8, sy2 - 3, 20, sy2 + 3, TILE, sy2);
        g.stroke();
        if (rnd() < 0.35) { g.fillStyle = '#e8f8ff'; g.fillRect(rnd() * (TILE - 4) + 1, rnd() * (TILE - 4) + 1, 2, 2); }
      }
      if (kind === 'abyss') {
        /* 归墟虚壤：深紫底 + 星屑 + 裂纹微光 */
        for (i = 0; i < 3; i++) {
          g.fillStyle = rnd() < 0.5 ? '#8a7ad0' : '#b0a0e8';
          g.globalAlpha = 0.7;
          g.fillRect(rnd() * (TILE - 2), rnd() * (TILE - 2), 1, 1);
          g.globalAlpha = 1;
        }
        if (rnd() < 0.4) {
          g.strokeStyle = U.rgba('#6a5ab0', 0.6); g.lineWidth = 1;
          g.beginPath();
          g.moveTo(rnd() * TILE * 0.5, rnd() * TILE);
          g.lineTo(TILE * 0.6 + rnd() * TILE * 0.4, rnd() * TILE);
          g.stroke();
        }
      }
      if (kind === 'wood') {
        /* 木板缝 + 钉点 */
        g.strokeStyle = 'rgba(0,0,0,0.20)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, 10 + (v % 2) * 6); g.lineTo(TILE, 10 + (v % 2) * 6);
        g.moveTo(0, 22 - (v % 2) * 6); g.lineTo(TILE, 22 - (v % 2) * 6); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(4, 4 + (v % 2) * 6, 2, 2); g.fillRect(TILE - 6, 18 - (v % 2) * 6, 2, 2);
      }
      /* 通用细噪（少量，保持底色纯净） */
      for (i = 0; i < 8; i++) {
        speck = rnd();
        g.fillStyle = speck > 0.55 ? p.sp1 : p.sp2;
        g.globalAlpha = 0.5;
        g.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 2, 2);
      }
      g.globalAlpha = 1;
    });
  }

  /* 装饰物（Y 排序绘制，含碰撞由 world 决定） */
  function decoCv(kind) {
    return mk('dc|' + kind, 64, 80, function (g, c) {
      var gr = decoGrid(kind);
      gr.render(2, c);
    });
  }
  function decoGrid(kind) {
    var gr = new Grid(32, 40);
    /* 与上面一致的绘制逻辑，简化重写 */
    if (kind === 'tree') {
      gr.rect(14, 24, 4, 14, '#6a4e2a');
      gr.ell(16, 15, 11, 10, '#3e7a34'); gr.ell(13, 13, 7, 6, '#4c8c40'); gr.ell(20, 18, 6, 5, '#35682c');
      gr.px(12, 12, '#5c9c50'); gr.px(19, 13, '#5c9c50');
    } else if (kind === 'pine') {
      var i;
      gr.rect(15, 26, 3, 12, '#5c4426');
      for (i = 0; i < 4; i++) {
        var y = 26 - i * 6, w = 10 - i * 2;
        gr.rect(16 - w, y - 5, w * 2, 5, i % 2 ? '#2e6430' : '#38743a');
      }
    } else if (kind === 'boulder') {
      gr.ell(16, 30, 9, 7, '#6a6a76'); gr.ell(13, 28, 5, 4, '#7c7c88');
      gr.rect(7, 36, 18, 2, '#565662');
    } else if (kind === 'flower') {
      gr.px(16, 36, '#4c8c40'); gr.px(16, 35, '#4c8c40');
      gr.px(15, 34, '#e87898'); gr.px(17, 34, '#e87898'); gr.px(16, 33, '#f8b8c8'); gr.px(16, 35, '#e87898');
    } else if (kind === 'torch') {
      gr.rect(15, 26, 2, 12, '#5c4426');
      gr.ell(16, 23, 3, 4, '#ff9838'); gr.ell(16, 21, 1.8, 2.4, '#ffd868');
    } else if (kind === 'crystal') {
      gr.rect(14, 22, 4, 14, '#68b8d8'); gr.px(13, 26, '#8ad8f8'); gr.px(18, 30, '#4890b0'); gr.px(15, 20, '#a8e8f8');
    } else if (kind === 'reed') {
      var j;
      for (j = 0; j < 4; j++) gr.line(12 + j * 3, 38, 12 + j * 3 + (j % 2 ? 1 : -1), 26, '#5c8a48');
      gr.px(13, 25, '#c8a858'); gr.px(19, 25, '#c8a858');
    } else if (kind === 'mushroom') {
      gr.rect(15, 30, 2, 7, '#d8d0c0');
      gr.ell(16, 29, 5, 3, '#c05858'); gr.px(14, 28, '#e8d0d0'); gr.px(18, 29, '#e8d0d0');
    } else if (kind === 'bone') {
      gr.rect(12, 34, 8, 2, '#e0dccf');
      gr.px(11, 33, '#e0dccf'); gr.px(11, 36, '#e0dccf'); gr.px(20, 33, '#e0dccf'); gr.px(20, 36, '#e0dccf');
    } else if (kind === 'house') {
      var yy;
      gr.rect(6, 18, 20, 20, '#a88050');
      gr.rect(6, 18, 20, 2, '#8a6840');
      for (yy = 0; yy < 10; yy++) gr.rect(3 + Math.floor((9 - yy) * 0.9), 8 + yy, 26 - Math.floor((9 - yy) * 1.8), 1, yy % 2 ? '#8c4030' : '#7c3828');
      gr.rect(14, 26, 5, 8, '#5c4028');
      gr.rect(10, 22, 3, 3, '#f0e0a0'); gr.rect(20, 22, 3, 3, '#f0e0a0');
    } else if (kind === 'house2') {
      var y2;
      gr.rect(8, 14, 16, 24, '#987850');
      gr.rect(8, 14, 16, 2, '#7c5e38');
      for (y2 = 0; y2 < 12; y2++) gr.rect(5 + Math.floor((11 - y2) * 1.0), 2 + y2, 22 - Math.floor((11 - y2) * 2.0), 1, y2 % 2 ? '#4c6480' : '#3c5268');
      gr.rect(14, 24, 4, 14, '#4c3828');
      gr.rect(10, 18, 3, 3, '#f0e0a0'); gr.rect(19, 18, 3, 3, '#f0e0a0');
        } else if (kind === 'stall') {
      var xx;
      gr.rect(6, 24, 20, 14, '#8a6a42');
      for (xx = 0; xx < 6; xx++) gr.rect(6 + xx * 4, 24, 2, 14, xx % 2 ? '#a05838' : '#c8a040');
      gr.rect(4, 18, 24, 5, '#c05838'); gr.rect(4, 18, 24, 2, '#d87048');
    } else if (kind === 'snowpine') {
      var s1;
      gr.rect(15, 27, 3, 11, '#4c3a24');
      for (s1 = 0; s1 < 4; s1++) {
        var sy = 27 - s1 * 6, sw = 10 - s1 * 2;
        gr.rect(16 - sw, sy - 5, sw * 2, 5, s1 % 2 ? '#2c5c50' : '#356e60');
        gr.rect(16 - sw + 1, sy - 5, sw * 2 - 2, 2, '#e8eef4');   /* 压雪 */
      }
      gr.px(16, 1, '#e8eef4');
    } else if (kind === 'icecrystal') {
      gr.line(16, 38, 16, 22, '#9fd8e8');
      gr.line(16, 32, 11, 26, '#9fd8e8'); gr.line(16, 34, 21, 27, '#b8e8f4');
      gr.px(16, 21, '#e0f8ff'); gr.px(11, 25, '#e0f8ff');
      gr.ell(16, 38, 5, 2, U.shade('#9fd8e8', -0.2));
    } else if (kind === 'snowrock') {
      gr.ell(16, 31, 9, 6, '#8a94a2'); gr.ell(13, 29, 5, 3, '#a4b0bc');
      gr.rect(8, 30, 16, 2, U.shade('#8a94a2', -0.18));
      gr.ell(14, 26, 6, 2, '#e8eef4');
    } else if (kind === 'campfire') {
      gr.ell(16, 36, 7, 3, '#5a4432');
      gr.line(11, 36, 21, 33, '#6c503a'); gr.line(21, 36, 11, 33, '#6c503a');
      gr.ell(16, 30, 4, 5, '#ff8830'); gr.ell(16, 28, 2.4, 3, '#ffd868'); gr.px(16, 25, '#fff0c0');
    } else if (kind === 'peachtree') {
      /* 桃树：弯干虬枝 + 团簇粉冠 + 点点花瓣 */
      gr.rect(15, 22, 3, 7, '#6a4630');
      gr.rect(16, 29, 3, 8, '#5c3c28');          /* 主干微弯 */
      gr.line(16, 28, 9, 21, '#6a4630'); gr.line(17, 26, 24, 19, '#6a4630');
      gr.line(9, 21, 5, 17, '#5c3c28'); gr.line(24, 19, 28, 14, '#5c3c28');   /* 二级分叉 */
      gr.line(16, 27, 12, 22, '#6a4630'); gr.line(17, 25, 22, 21, '#6a4630');
      gr.ell(16, 12, 11, 8, '#e8a0b8'); gr.ell(11, 10, 6, 5, '#f2c0d0'); gr.ell(22, 13, 6, 5, '#d888a8');
      gr.ell(5, 14, 4, 3, '#d888a8'); gr.ell(27, 11, 4, 3, '#f2c0d0');        /* 枝头花团 */
      gr.px(10, 9, '#fae0e8'); gr.px(18, 12, '#fae0e8'); gr.px(14, 15, '#fff0f4'); gr.px(6, 12, '#fae0e8');
    } else if (kind === 'stela') {
      /* 山海遗刻：石碑 + 刻纹 */
      gr.rect(10, 14, 12, 24, '#7c7468');
      gr.rect(9, 12, 14, 4, '#8c8478');
      gr.rect(12, 18, 8, 1, '#b0a898'); gr.rect(12, 21, 6, 1, '#b0a898'); gr.rect(12, 24, 8, 1, '#b0a898'); gr.rect(12, 27, 5, 1, '#b0a898');
      gr.ell(16, 38, 8, 2, '#5c564c');
      gr.px(9, 13, '#a8a094'); gr.px(22, 15, '#a8a094');
    } else if (kind === 'deadwood') {
      /* 荒漠枯木 */
      gr.rect(15, 16, 3, 22, '#9c8868');
      gr.line(16, 22, 8, 15, '#9c8868'); gr.line(17, 20, 25, 12, '#9c8868');
      gr.line(8, 15, 5, 10, '#8a7858'); gr.line(25, 12, 28, 7, '#8a7858');
      gr.px(6, 9, '#8a7858'); gr.px(28, 6, '#8a7858');
    } else if (kind === 'cactus') {
      gr.rect(14, 16, 4, 20, '#5a9050');
      gr.rect(9, 20, 3, 8, '#5a9050'); gr.rect(9, 20, 6, 3, '#5a9050');
      gr.rect(20, 18, 3, 10, '#5a9050'); gr.rect(17, 18, 6, 3, '#5a9050');
      gr.px(16, 16, '#6ca860'); gr.px(10, 19, '#6ca860'); gr.px(22, 17, '#6ca860');
      gr.px(15, 14, '#e87898'); gr.px(17, 15, '#e87898');
    } else if (kind === 'voidshard') {
      /* 归墟浮晶：悬浮的裂隙晶体 */
      gr.line(16, 38, 16, 24, '#7a68c8');
      gr.line(16, 32, 10, 27, '#7a68c8'); gr.line(16, 30, 22, 26, '#9888e0');
      gr.px(16, 23, '#d0c8ff'); gr.px(10, 26, '#d0c8ff'); gr.px(22, 25, '#d0c8ff');
      gr.ell(16, 38, 5, 2, U.shade('#7a68c8', -0.25));
      gr.px(15, 20, '#fff');      /* 顶端星芒 */
    } else if (kind === 'herbnode') {
      /* 药草丛：可采集，多株攒簇 + 亮点 */
      var hb;
      for (hb = 0; hb < 5; hb++) {
        var hx = 10 + hb * 3, hy = 36 - (hb % 2) * 3;
        gr.line(hx, hy, hx + (hb % 2 ? 1 : -1), hy - 8, '#4c8c40');
        gr.ell(hx, hy - 9, 2.2, 2.0, hb % 2 ? '#7cb342' : '#8fca50');
      }
      gr.ell(16, 37, 9, 3, '#3a5c30');
      gr.px(13, 26, '#ffe98a'); gr.px(19, 28, '#ffe98a');
    } else if (kind === 'orenode') {
      /* 矿脉：岩壳夹亮矿 */
      gr.ell(16, 31, 10, 8, '#6a6a76');
      gr.ell(12, 28, 6, 5, '#7c7c88');
      gr.ell(20, 33, 5, 4, '#5c5c68');
      var or_;
      for (or_ = 0; or_ < 5; or_++) gr.px(11 + or_ * 3, 28 + (or_ % 2) * 4, or_ % 2 ? '#ffe98a' : '#d8c890');
      gr.rect(8, 37, 17, 2, '#565662');
    } else if (kind === 'crystalnode') {
      /* 晶簇：多棱晶柱 */
      gr.line(16, 38, 16, 20, '#a8c8e8');
      gr.line(16, 36, 10, 27, '#8fb8dc'); gr.line(16, 34, 22, 26, '#c0d8f0');
      gr.line(16, 30, 12, 23, '#8fb8dc'); gr.line(16, 31, 20, 22, '#c0d8f0');
      gr.px(16, 19, '#fff'); gr.px(12, 22, '#e0f0ff'); gr.px(20, 21, '#e0f0ff');
      gr.ell(16, 38, 7, 2, '#6a86a8');
    } else if (kind === 'sandnode') {
      /* 流金沙窝：沙堆 + 金屑 */
      gr.ell(16, 34, 11, 5, '#d8bc7e');
      gr.ell(13, 32, 6, 3, '#e8d090');
      var gd;
      for (gd = 0; gd < 6; gd++) gr.px(10 + gd * 2, 30 + (gd % 3), gd % 2 ? '#ffe98a' : '#f4d06a');
      gr.ell(16, 37, 12, 2, '#b89a5e');
    } else if (kind === 'board') {
      /* 猎告牌：木柱 + 告示 */
      gr.rect(15, 22, 2, 16, '#5c4426');
      gr.rect(6, 12, 20, 13, '#8a6a42');
      gr.rect(6, 12, 20, 2, '#a08050');
      gr.rect(9, 16, 6, 1, '#e8dcc0'); gr.rect(9, 18, 10, 1, '#d8ccb0'); gr.rect(9, 20, 8, 1, '#e8dcc0');
      gr.rect(17, 15, 6, 7, '#d8b870');
      gr.px(19, 17, '#6a3434'); gr.px(21, 18, '#6a3434');
    } else if (kind === 'bigtree') {
      /* 巨树：地标 */
      gr.rect(14, 26, 5, 13, '#5c4426');
      gr.ell(16, 14, 13, 10, '#35682c'); gr.ell(11, 11, 8, 6, '#4c8c40'); gr.ell(22, 15, 8, 6, '#3e7a34');
      gr.ell(16, 8, 7, 5, '#5c9c50');
      gr.px(9, 10, '#78b060'); gr.px(23, 12, '#78b060'); gr.px(16, 5, '#78b060');
    } else if (kind === 'pillar') {
      /* 遗迹石柱：断口 + 刻纹 */
      gr.rect(11, 14, 10, 24, '#8c8478');
      gr.rect(10, 12, 12, 3, '#9c9488');
      gr.rect(11, 14, 10, 2, '#7c7468');
      gr.rect(13, 20, 6, 1, '#a8a094'); gr.rect(13, 24, 6, 1, '#a8a094'); gr.rect(13, 28, 4, 1, '#a8a094');
      gr.px(11, 17, '#b0a898'); gr.rect(9, 37, 14, 2, '#565662');
    } else if (kind === 'gravestone') {
      /* 墓碑 */
      gr.ell(16, 24, 5, 6, '#7c7468');
      gr.rect(11, 24, 10, 13, '#7c7468');
      gr.rect(13, 26, 6, 1, '#5c564c'); gr.rect(14, 29, 4, 1, '#5c564c');
      gr.ell(16, 37, 8, 2, '#4c4650');
    } else if (kind === 'well') {
      /* 石井 */
      gr.ell(16, 30, 9, 5, '#8c8478');
      gr.ell(16, 30, 6, 3, '#2e5a80');
      gr.rect(8, 14, 2, 16, '#6a5a44'); gr.rect(22, 14, 2, 16, '#6a5a44');
      gr.line(9, 14, 23, 14, '#8a6a42'); gr.line(10, 14, 16, 10, '#8a6a42'); gr.line(22, 14, 16, 10, '#8a6a42');
      gr.rect(14, 16, 4, 3, '#5c4426');
    } else if (kind === 'totem') {
      /* 雷图腾柱 */
      gr.rect(13, 12, 6, 26, '#7a5c3a');
      gr.ell(16, 12, 5, 3, '#8a6a44');
      gr.rect(15, 17, 2, 6, '#ffd740');
      gr.px(13, 19, '#ffd740'); gr.px(19, 20, '#ffd740');
      gr.rect(11, 24, 10, 2, '#5c4426'); gr.rect(11, 28, 10, 2, '#5c4426');
      gr.px(16, 10, '#fff2b0');
    } else if (kind === 'runestone') {
      /* 符文石（雪原/归墟） */
      gr.ell(16, 24, 7, 9, '#9aa8b8');
      gr.ell(16, 22, 5, 6, '#b0c0d0');
      gr.px(14, 20, '#7fd8f0'); gr.px(18, 24, '#7fd8f0'); gr.px(16, 27, '#7fd8f0');
      gr.ell(16, 37, 8, 2, '#6a7888');
    }
    gr.lightRamp(0.8);
    gr.topLight();
    gr.outline(OUT);
    return gr;
  }

  /* ============================================================
     图标（面板/背包用，24×24）
     ============================================================ */
  function iconCv(kind, color) {
    return mk('ic|' + kind + '|' + color, 24, 24, function (g, c) {
      var gr = iconGrid(kind, color);
      gr.render(2, c);
    });
  }
  function iconGrid(kind, color) {
    var gr = new Grid(12, 12);
    if (kind === 'potion' || kind === 'mpotion') {
      gr.rect(5, 1, 2, 2, '#c8c0b0');
      gr.ell(6, 7, 3.4, 4.2, '#e8e4dc');
      gr.ell(6, 7.6, 2.4, 3.2, color);
      gr.px(4, 5, '#f8f8f4');
    } else if (kind === 'rope') {
      gr.ell(6, 6, 4.0, 4.0, color);
      gr.ring(6, 6, 2.4, 2.4, U.shade(color, -0.2));
      gr.ell(6, 6, 1.0, 1.0, U.shade(color, 0.3));
    } else if (kind === 'seal') {
      gr.rect(2, 2, 8, 8, color);
      gr.rect(3, 3, 6, 6, U.shade(color, -0.18));
      gr.rect(5, 5, 2, 2, U.shade(color, 0.25));
      gr.rect(1, 1, 2, 2, U.shade(color, 0.15)); gr.rect(9, 1, 2, 2, U.shade(color, 0.15));
    } else if (kind === 'scroll') {
      gr.rect(2, 3, 8, 6, '#e8dcc0');
      gr.rect(2, 2, 8, 1, color); gr.rect(2, 9, 8, 1, color);
      gr.rect(3, 5, 6, 1, '#b0a888'); gr.rect(3, 7, 4, 1, '#b0a888');
    } else if (kind === 'herb') {
      gr.px(6, 10, '#5c8a48'); gr.px(6, 9, '#5c8a48');
      gr.ell(5, 7, 2.2, 2.2, color); gr.ell(8, 6, 2.0, 2.0, U.shade(color, -0.1));
      gr.px(4, 5, U.shade(color, 0.2));
    } else if (kind === 'sand') {
      gr.rect(2, 8, 8, 3, color);
      gr.rect(3, 6, 6, 2, U.shade(color, 0.1));
      gr.px(6, 4, U.shade(color, 0.2)); gr.px(4, 5, U.shade(color, 0.15));
    } else if (kind === 'ingot') {
      gr.ell(6, 7, 4.2, 2.6, color);
      gr.ell(6, 6, 3.4, 1.6, U.shade(color, 0.25));
      gr.rect(2, 8, 8, 2, U.shade(color, -0.15));
    } else if (kind === 'feather') {
      gr.line(8, 10, 4, 3, color);
      gr.ell(5.6, 5, 2.0, 1.4, U.shade(color, 0.15));
      gr.ell(7, 7, 1.6, 1.2, U.shade(color, -0.05));
    } else if (kind === 'gem') {
      gr.rect(4, 3, 4, 6, color);
      gr.px(3, 4, color); gr.px(3, 7, color); gr.px(8, 4, color); gr.px(8, 7, color);
      gr.rect(5, 4, 1, 2, U.shade(color, 0.35));
    } else if (kind === 'bone') {
      gr.rect(4, 5, 4, 2, color);
      gr.px(3, 4, color); gr.px(3, 7, color); gr.px(8, 4, color); gr.px(8, 7, color);
    } else if (kind === 'kite') {
      gr.rect(4, 2, 4, 5, color);
      gr.px(3, 4, U.shade(color, -0.1)); gr.px(8, 4, U.shade(color, -0.1));
      gr.px(5, 7, '#e8dcc0'); gr.px(6, 8, '#e8dcc0'); gr.px(5, 9, '#e8dcc0');
      gr.line(6, 7, 4, 10, '#c8b890');
    } else if (kind === 'sword' || kind === 'zhang' || kind === 'gong') {
      if (kind === 'sword') {
        gr.rect(2, 5, 7, 2, color);
        gr.rect(1, 4, 1, 4, '#8a6a3a'); gr.rect(0, 5, 1, 2, '#6a4e2a');
        gr.px(9, 5, U.shade(color, 0.25)); gr.px(10, 6, U.shade(color, 0.25));
      } else if (kind === 'zhang') {
        gr.rect(2, 6, 7, 1, '#8a6a3a');
        gr.ell(10, 6, 1.6, 1.6, color); gr.px(10, 6, U.shade(color, 0.3));
      } else {
        gr.ring(6, 6, 4.4, 4.4, '#a8804a');
        gr.line(9, 2, 9, 10, '#e8e0d0');
        gr.px(6, 6, color);
      }
    } else if (kind === 'armor') {
      gr.rect(3, 3, 6, 6, color);
      gr.rect(2, 3, 1, 3, U.shade(color, -0.15)); gr.rect(9, 3, 1, 3, U.shade(color, -0.15));
      gr.rect(5, 3, 2, 1, U.shade(color, 0.2));
    } else if (kind === 'head') {
      gr.ell(6, 6, 3.6, 3.0, color);
      gr.rect(3, 6, 6, 3, U.shade(color, -0.1));
      gr.rect(2, 5, 1, 2, color); gr.rect(9, 5, 1, 2, color);
    } else if (kind === 'feet') {
      gr.rect(4, 4, 4, 4, color);
      gr.rect(3, 8, 6, 2, U.shade(color, -0.15));
    } else if (kind === 'amulet') {
      gr.px(6, 2, '#c8b890'); gr.px(6, 3, '#c8b890');
      gr.ell(6, 7, 3.0, 3.4, color);
      gr.px(5, 6, U.shade(color, 0.3));
    } else if (kind === 'charm') {
      gr.rect(3, 2, 6, 8, '#e8dcc0');
      gr.rect(4, 3, 4, 3, color);
      gr.rect(5, 8, 2, 1, '#b0a888');
    }
    gr.outline(OUT);
    return gr;
  }

  /* 面板头像：灵物立绘裁剪到内容包围盒 */
  function portraitCv(spId, shiny) {
    return mk('pt|' + spId + '|' + (shiny ? 1 : 0), 60, 48, function (g, c) {
      var gr = creatureGrid(spId);
      /* 包围盒 */
      var minX = 99, minY = 99, maxX = -1, maxY = -1, x, y;
      for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
        if (gr.get(x, y)) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      }
      if (maxX < 0) { minX = 0; minY = 0; maxX = CW - 1; maxY = CH - 1; }
      var w = maxX - minX + 1, h = maxY - minY + 1;
      var pad = 1, sc = Math.min(Math.floor(58 / (w + pad * 2)) || 1, Math.floor(46 / (h + pad * 2)) || 1);
      var rw = (w + pad * 2) * sc, rh = (h + pad * 2) * sc;
      var ox = Math.floor((60 - rw) / 2), oy = Math.floor((48 - rh) / 2);
      var sub = new Grid(w + pad * 2, h + pad * 2);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) sub.d[(y + pad) * (w + pad * 2) + (x + pad)] = gr.get(minX + x, minY + y);
      sub.render(sc, c);
      c._offX = ox; c._offY = oy;
      if (shiny) {
        g.fillStyle = 'rgba(255,220,120,0.35)';
        g.fillRect(0, 0, 60, 48);
      }
    });
  }
  function portraitUrl(spId, shiny) {
    var c = portraitCv(spId, shiny);
    if (!c._url) c._url = c.toDataURL();
    return c._url;
  }

  function url(c) { if (!c._url) c._url = c.toDataURL(); return c._url; }

  return {
    Grid: Grid,
    creatureGrid: creatureGrid,
    creatureCv: creatureCv,
    creatureUrl: function (spId, frame, flip, shiny) { return url(creatureCv(spId, frame, flip, shiny)); },
    playerCv: playerGrid,
    weaponCv: weaponCv,
    npcCv: npcCv,
    tileCv: tileCv,
    decoCv: decoCv,
    iconCv: iconCv,
    iconUrl: function (kind, color) { return url(iconCv(kind, color)); },
    portraitCv: portraitCv,
    portraitUrl: portraitUrl,
    OUT: OUT
  };
})();
