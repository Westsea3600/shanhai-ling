/* ============================================================
   《山海拾灵》核心层：工具 / 随机 / 噪声 / 输入 / 音效 / 存档
   纯浏览器 JS，无依赖；node 下由 test/harness.js 提供 DOM 桩。
   ============================================================ */

/* ---------------- 通用工具 ---------------- */
var U = {
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  rand: function (a, b) { return a + Math.random() * (b - a); },
  randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  choice: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance: function (p) { return Math.random() < p; },
  extend: function (dst, src) { for (var k in src) dst[k] = src[k]; return dst; },
  dist: function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); },
  dist2: function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  ang: function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
  uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  fmt: function (n) { n = Math.floor(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : '' + n; },
  timeText: function (s) {
    s = Math.max(0, Math.ceil(s));
    return s >= 60 ? (Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒') : (s + ' 秒');
  },
  mmss: function (s) {
    s = Math.max(0, Math.ceil(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  },
  rgba: function (hex, a) {
    var c = (hex || '#ffffff').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return 'rgba(' + parseInt(c.slice(0, 2), 16) + ',' + parseInt(c.slice(2, 4), 16) + ',' + parseInt(c.slice(4, 6), 16) + ',' + a + ')';
  },
  /* 加权抽取，list = [[item, weight], ...] */
  weighted: function (list) {
    var t = 0, i;
    for (i = 0; i < list.length; i++) t += list[i][1];
    var r = Math.random() * t;
    for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  },
  shade: function (hex, amt) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    r = U.clamp(Math.round(r + 255 * amt), 0, 255); g = U.clamp(Math.round(g + 255 * amt), 0, 255); b = U.clamp(Math.round(b + 255 * amt), 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
};

/* 可复现随机（种子） */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* 值噪声（地图生成用） */
function makeNoise(seed) {
  var rnd = mulberry32(seed), p = new Array(512), i;
  for (i = 0; i < 256; i++) p[i] = i;
  for (i = 255; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
  for (i = 0; i < 256; i++) p[256 + i] = p[i];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad(h, x, y) { var u = h & 1 ? x : -x, v = h & 2 ? y : -y; return u + v; }
  return function (x, y) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = fade(x), v = fade(y);
    var A = p[X] + Y, B = p[X + 1] + Y;
    var n = U.lerp(U.lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
      U.lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v);
    return (n + 1) / 2;
  };
}

/* ---------------- 输入 ---------------- */
var Input = {
  keys: {}, once: {}, mouse: { x: 0, y: 0, down: false, clicked: false, rdown: false },
  init: function (canvas) {
    var self = this;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', function (e) {
      /* 正在输入框里打字时放行默认行为（空格/方向键/F5 归浏览器与文本编辑） */
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'F5', 'F11'].indexOf(e.code) >= 0) e.preventDefault();
      if (!self.keys[e.code]) self.once[e.code] = true;
      self.keys[e.code] = true;
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    window.addEventListener('blur', function () { self.keys = {}; });
    /* 右键用于点地移动，屏蔽页面原生菜单 */
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (!canvas) return;
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      self.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      self.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) { self.mouse.down = true; self.mouse.clicked = true; }
      if (e.button === 2) { self.mouse.rdown = true; }
      e.preventDefault();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) self.mouse.down = false;
      if (e.button === 2) self.mouse.rdown = false;
    });
  },
  down: function (c) { return !!this.keys[c]; },
  pressed: function (c) { return !!this.once[c]; },
  endFrame: function () { this.once = {}; this.mouse.clicked = false; }
};

/* ---------------- 音效（WebAudio 合成，零外部资源） ---------------- */
var SFX = {
  ctx: null, on: true, vol: 0.2,
  boot: function () {
    if (this.ctx || typeof window === 'undefined') return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { this.ctx = new AC(); } catch (e) { } }
  },
  beep: function (freq, dur, type, vol, slide) {
    if (!this.on) return; this.boot(); if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime((vol || 1) * this.vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  },
  noise: function (dur, vol) {
    if (!this.on) return; this.boot(); if (!this.ctx) return;
    try {
      var sr = this.ctx.sampleRate, len = Math.floor(sr * dur);
      var buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = this.ctx.createBufferSource(); s.buffer = buf;
      var g = this.ctx.createGain(); g.gain.value = (vol || 1) * this.vol * 0.8;
      s.connect(g); g.connect(this.ctx.destination); s.start();
    } catch (e) { }
  },
  play: function (n) {
    switch (n) {
      case 'hit': this.beep(320, 0.07, 'square', 0.7, 0.5); break;
      case 'hurt': this.beep(180, 0.14, 'sawtooth', 0.9, 0.4); break;
      case 'crit': this.beep(660, 0.10, 'square', 1.0, 1.6); this.noise(0.08, 0.6); break;
      case 'shot': this.beep(720, 0.06, 'triangle', 0.5, 0.6); break;
      case 'swing': this.noise(0.07, 0.35); break;
      case 'die': this.beep(300, 0.30, 'sawtooth', 0.8, 0.25); break;
      case 'levelup': [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { SFX.beep(f, 0.16, 'triangle', 0.8); }, i * 80); }); break;
      case 'pick': this.beep(880, 0.06, 'triangle', 0.5, 1.4); break;
      case 'coin': this.beep(1046, 0.05, 'square', 0.4, 1.5); break;
      case 'throw': this.beep(520, 0.12, 'sine', 0.7, 1.5); break;
      case 'shake': this.beep(360, 0.07, 'sine', 0.5, 0.9); break;
      case 'catch': [784, 988, 1318].forEach(function (f, i) { setTimeout(function () { SFX.beep(f, 0.18, 'sine', 0.9); }, i * 110); }); break;
      case 'fail': this.beep(220, 0.22, 'sawtooth', 0.7, 0.5); break;
      case 'ui': this.beep(640, 0.04, 'square', 0.28); break;
      case 'buy': this.beep(760, 0.07, 'square', 0.5, 1.3); setTimeout(function () { SFX.beep(1000, 0.08, 'square', 0.4); }, 70); break;
      case 'heal': [660, 880].forEach(function (f, i) { setTimeout(function () { SFX.beep(f, 0.14, 'sine', 0.6); }, i * 90); }); break;
      case 'evolve': [392, 523, 659, 784, 1046, 1318].forEach(function (f, i) { setTimeout(function () { SFX.beep(f, 0.2, 'triangle', 0.9); }, i * 120); }); break;
      case 'boss': this.beep(110, 0.6, 'sawtooth', 1.0, 0.6); this.noise(0.5, 0.7); break;
      case 'portal': this.beep(440, 0.3, 'sine', 0.6, 2.2); break;
      case 'combo': this.beep(880, 0.1, 'triangle', 0.8, 1.5); break;
      case 'stun': this.beep(200, 0.15, 'square', 0.5, 0.5); break;
    }
  }
};

/* ---------------- 存档封装（localStorage 不可用时退化为内存） ---------------- */
var Store = {
  ok: (function () {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem('__t', '1'); localStorage.removeItem('__t');
      return true;
    } catch (e) { return false; }
  })(),
  mem: {},
  set: function (k, v) {
    var s = JSON.stringify(v);
    if (this.ok) { try { localStorage.setItem(k, s); return true; } catch (e) { } }
    this.mem[k] = s; return false;
  },
  get: function (k) {
    var s = this.ok ? localStorage.getItem(k) : this.mem[k];
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  },
  del: function (k) {
    if (this.ok) { try { localStorage.removeItem(k); } catch (e) { } }
    delete this.mem[k];
  }
};
