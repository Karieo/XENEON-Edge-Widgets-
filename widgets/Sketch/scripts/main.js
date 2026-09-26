/* SKETCH — finger chalkboard. Strokes are kept as points (0..1 of the board),
   so pages redraw crisply at any size and undo is exact. */

var CHALKS = ["#f1eee4", "#ffd166", "#ff8fa3", "#7ad3ff", "#9be58a", "#c9a7ff"];
var SIZES = [0.008, 0.016, 0.03]; // line width as a share of board height
var PAGES = 3;
var MAX_STROKES = 400;

var $ = function (id) { return document.getElementById(id); };
var canvas = $("canvas");
var g = canvas.getContext("2d");
var st = null; // { page, color, size, pages: [[stroke...], ...] }
var drawing = null;
var W = 0, H = 0, DPR = 1;
var cache = document.createElement("canvas"); // finished strokes of this page
var cacheOk = false;

function onIcueDataUpdated() {
  var root = document.documentElement.style;
  root.setProperty("--board", Edge.prop("boardColor", "#1f3a2e"));
  root.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  if (!st) {
    var s = Edge.store.load();
    st = {
      page: s.page || 0,
      color: typeof s.color === "number" ? s.color : 0,
      size: typeof s.size === "number" ? s.size : 1,
      erase: false,
      pages: Array.isArray(s.pages) && s.pages.length === PAGES ? s.pages : [[], [], []],
    };
    buildTray();
    resize();
  }
}

function save() {
  var ok = Edge.store.save({ page: st.page, color: st.color, size: st.size, pages: st.pages });
  if (!ok) { // storage full: drop the oldest strokes on this page and retry
    st.pages[st.page].splice(0, 50);
    Edge.store.save({ page: st.page, color: st.color, size: st.size, pages: st.pages });
  }
}

// ---- Drawing -------------------------------------------------------------------

function resize() {
  var r = $("board").getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  invalidate();
  redraw();
}

function redraw() {
  var page = st.pages[st.page];
  var live = drawing ? page.length - 1 : page.length; // strokes before the one in progress
  if (!cacheOk) {
    cache.width = canvas.width;
    cache.height = canvas.height;
    var cg = cache.getContext("2d");
    var real = g;
    g = cg;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (var i = 0; i < live; i++) drawStroke(page[i], i);
    g = real;
    cacheOk = true;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(cache, 0, 0);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (drawing) drawStroke(drawing, page.length - 1);
  $("hint").hidden = page.length > 0;
}

function invalidate() { cacheOk = false; }

// Chalk: a solid core, then a seeded speckle knocked out along the path.
function drawStroke(s, seed) {
  var pts = s.p;
  if (!pts.length) return;
  var lw = s.w * H;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = lw;
  if (s.e) {
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "#000";
    g.lineWidth = lw * 2.4;
  } else {
    g.strokeStyle = s.c;
    g.globalAlpha = 0.92;
  }
  g.beginPath();
  g.moveTo(pts[0][0] * W, pts[0][1] * H);
  if (pts.length === 1) g.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);
  for (var i = 1; i < pts.length; i++) {
    var mx = (pts[i - 1][0] + pts[i][0]) / 2 * W, my = (pts[i - 1][1] + pts[i][1]) / 2 * H;
    g.quadraticCurveTo(pts[i - 1][0] * W, pts[i - 1][1] * H, mx, my);
  }
  g.lineTo(pts[pts.length - 1][0] * W, pts[pts.length - 1][1] * H);
  g.stroke();
  if (!s.e) {
    var rnd = seeded(seed + 1);
    g.globalCompositeOperation = "destination-out";
    g.globalAlpha = 0.5;
    for (var k = 0; k < pts.length; k++) {
      for (var d = 0; d < 3; d++) {
        var r = lw * (0.08 + rnd() * 0.18);
        g.beginPath();
        g.arc(pts[k][0] * W + (rnd() - 0.5) * lw, pts[k][1] * H + (rnd() - 0.5) * lw, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
}

function seeded(n) {
  var x = (n * 9301 + 49297) % 233280;
  return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

function point(e) {
  var r = canvas.getBoundingClientRect();
  return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)];
}

canvas.addEventListener("pointerdown", function (e) {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  drawing = { c: CHALKS[st.color], w: SIZES[st.size], e: st.erase || undefined, p: [point(e)] };
  invalidate(); // cache everything before this stroke
  st.pages[st.page].push(drawing);
  redraw();
});

canvas.addEventListener("pointermove", function (e) {
  if (!drawing) return;
  var p = point(e);
  var last = drawing.p[drawing.p.length - 1];
  // Skip points closer than ~0.3% of the board: smaller saves, same look.
  if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.003) return;
  drawing.p.push(p);
  redraw();
});

function endStroke() {
  if (!drawing) return;
  drawing = null;
  var page = st.pages[st.page];
  if (page.length > MAX_STROKES) page.splice(0, page.length - MAX_STROKES);
  invalidate();
  redraw();
  save();
}

canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

// ---- Tray ----------------------------------------------------------------------

function buildTray() {
  var box = $("chalks");
  CHALKS.forEach(function (c, i) {
    var b = document.createElement("button");
    b.className = "chalk";
    b.style.setProperty("--chalk", c);
    Edge.press(b, function () { st.color = i; st.erase = false; save(); renderTray(); });
    box.appendChild(b);
  });
  var pages = $("pages");
  for (var i = 0; i < PAGES; i++) {
    (function (i) {
      var b = document.createElement("button");
      b.className = "page";
      b.textContent = i + 1;
      Edge.press(b, function () { st.page = i; save(); invalidate(); redraw(); renderTray(); });
      pages.appendChild(b);
    })(i);
  }
  Edge.press($("sizeBtn"), function () { st.size = (st.size + 1) % SIZES.length; save(); renderTray(); });
  Edge.press($("eraseBtn"), function () { st.erase = !st.erase; renderTray(); });
  Edge.press($("undoBtn"), function () { st.pages[st.page].pop(); save(); invalidate(); redraw(); });
  Edge.hold($("clearBtn"), function () { st.pages[st.page] = []; save(); invalidate(); redraw(); });
  renderTray();
}

function renderTray() {
  Array.prototype.forEach.call($("chalks").children, function (b, i) { b.classList.toggle("on", !st.erase && i === st.color); });
  Array.prototype.forEach.call($("pages").children, function (b, i) {
    b.classList.toggle("on", i === st.page);
    b.classList.toggle("used", st.pages[i].length > 0);
  });
  $("eraseBtn").classList.toggle("on", st.erase);
  $("sizeBtn").dataset.size = st.size;
  $("sizeBtn").style.setProperty("--chalk", CHALKS[st.color]);
}

window.addEventListener("resize", function () { if (st) resize(); });
