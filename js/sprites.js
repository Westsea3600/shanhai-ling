/* ============================================================
   《山海拾灵》程序化像素美术：网格原语 / 灵物立绘 / 玩家 / NPC
   瓦片 / 装饰 / 图标 —— 全部代码生成，零外部资源。
   管线：体型原型(arch) 打锚点 → 特征件(feat) 挂件 → 色阶 → 描边 → 缓存
   ============================================================ */

var Sprites = (function () {
  'use strict';
  var OUT = '#241c2b';            /* 统一描边色 */
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
    g.celShade();
    g.outline(OUT);
    return g;
  }
  function creatureCv(spId, frame, flip, shiny) {
    return mk('cr|' + spId + '|' + (frame || 0) + '|' + (flip ? 1 : 0) + '|' + (shiny ? 1 : 0),
      CW * 2, CH * 2, function (g2, c) {
        var g = creatureGrid(spId);
        if (flip) g = g.flipX();
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
      var tunic = ['#7a8a5a', '#6a7a90', '#7898a0'][tier];       /* 按装备档位换色 */
      var trim = ['#5a6a40', '#4c5a6c', '#587880'][tier];
      var bob = frame === 1 ? 1 : 0;
      /* 腿 */
      gr.rect(6, 16 + bob, 2, 5, '#3a3440'); gr.rect(9, 16 + (1 - bob), 2, 5, '#3a3440');
      gr.rect(6, 21 + bob, 2, 1, '#241c2b'); gr.rect(9, 21 + (1 - bob), 2, 1, '#241c2b');
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
      var cMetal = ['#b8c4cc', '#7e96a8', '#9fd8e8'][tier];
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
        fisher:  { robe: '#587890', hair: '#787060', hat: 1 }
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
    dirt:   { base: '#8a7048', sp1: '#987e54', sp2: '#766040' },
    water:  { base: '#2e6ea0', sp1: '#3c7eb0', sp2: '#245a86' },
    lava:   { base: '#c84818', sp1: '#e86828', sp2: '#a03810' },
    rock:   { base: '#62626e', sp1: '#747480', sp2: '#50505c' },
    stone:  { base: '#7c7468', sp1: '#8c8478', sp2: '#6a6258' },
    cavef:  { base: '#3c3444', sp1: '#484050', sp2: '#302a38' },
    cavew:  { base: '#241e2c', sp1: '#2e2838', sp2: '#1a1622' },
    marsh:  { base: '#3d5c46', sp1: '#49684f', sp2: '#324a3a' },
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
      for (i = 0; i < 22; i++) {
        speck = rnd();
        g.fillStyle = speck > 0.55 ? p.sp1 : p.sp2;
        g.fillRect(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), 2, 2);
      }
      if (kind === 'water' || kind === 'marshw' || kind === 'lava') {
        g.fillStyle = p.sp1;
        for (i = 0; i < 4; i++) {
          var y = 3 + i * 7 + (v % 2) * 2, x = ((i * 9 + v * 5) % 24);
          g.fillRect(x, y, 6, 2);
        }
      }
      if (kind === 'rock' || kind === 'cavew') {
        g.strokeStyle = p.sp2; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(4, 2); g.lineTo(10, 10); g.lineTo(8, 20); g.lineTo(16, 24); g.lineTo(22, 14);
        g.stroke();
      }
      if (kind === 'rock' || kind === 'cavew' || kind === 'stone') {
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, TILE - 4, TILE, 4);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, TILE, 3);
      }
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
    }
    gr.celShade();
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
