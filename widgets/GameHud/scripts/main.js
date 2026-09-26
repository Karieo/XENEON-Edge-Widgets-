/* GAME HUD — FPS with a 60 s trace, GPU load, GPU temp, CPU temp. */

var WINDOW = 60; // seconds of FPS fpsHistory
var RESYNC_MS = 2000; // safety net in case a sensorValueChanged signal is missed
var IDLE_AFTER = 3; // seconds without FPS before showing "no game"

// Each slot finds its sensor by role when left on the iCUE default
// (see Edge.pickSensor: the RTX wins over the Ryzen's built-in Radeon).
var SLOTS = {
  fps: { prop: "fpsSensor", type: "fps", role: "fps" },
  gpuLoad: { prop: "gpuLoadSensor", type: "load", role: "gpu-load" },
  gpuTemp: { prop: "gpuTempSensor", type: "temperature", role: "gpu-temp" },
  cpuTemp: { prop: "cpuTempSensor", type: "temperature", role: "cpu-temp" },
};

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var sensors = null;
var catalog = null; // Edge.sensorCatalog result
var bound = {}; // slot -> sensorId
var alt = {}; // temp slot -> { id, label } of the chip's other temp sensor
var latest = {}; // sensorId -> number
var units = {}; // sensorId -> units string
var fpsHistory = []; // FPS samples, oldest first (null = no reading)
var TILES = ["gpuLoad", "gpuTemp", "cpuTemp"];
var tileHistory = { gpuLoad: [], gpuTemp: [], cpuTemp: [] }; // { pct, state } per second
var idleFor = IDLE_AFTER;
var timers = {};

// ---- Settings ------------------------------------------------------------

function onIcueDataUpdated() {
  cfg = {
    fpsTarget: Number(Edge.prop("fpsTarget", 120)),
    warmAt: Number(Edge.prop("warmAt", 70)),
    hotAt: Number(Edge.prop("hotAt", 85)),
    textColor: Edge.prop("textColor", "#f4f5f7"),
    accentColor: Edge.prop("accentColor", "#e8202a"),
    backgroundColor: Edge.prop("backgroundColor", "#07080a"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  $("fpsTargetOut").textContent = cfg.fpsTarget;
  bindSlots();
  renderTrace();
}

// ---- Sensor wiring -------------------------------------------------------

Edge.onPlugin("Sensorsdataprovider", function (plugin) {
  sensors = plugin;
  if (plugin.sensorValueChanged && plugin.sensorValueChanged.connect) {
    plugin.sensorValueChanged.connect(function (id, value) {
      if (!isBound(id)) return;
      latest[id] = parseFloat(value);
      renderSlots();
    });
  }
  // Games start and stop, so the FPS sensor can come and go.
  ["sensorAdded", "sensorRemoved"].forEach(function (sig) {
    if (plugin[sig] && plugin[sig].connect) {
      plugin[sig].connect(function () {
        clearTimeout(timers.recatalog);
        timers.recatalog = setTimeout(function () { catalog = null; loadCatalog(); }, 500);
      });
    }
  });
  loadCatalog();
  clearInterval(timers.resync);
  timers.resync = setInterval(function () { if (!document.hidden) resync(); }, RESYNC_MS);
});

function loadCatalog() {
  if (!sensors) return;
  Edge.sensorCatalog(sensors).then(function (list) {
    catalog = list;
    bindSlots();
  }).catch(function () {
    catalog = [];
    bindSlots();
  });
}

function defaultIdFor(type) {
  try { return sensors.getDefaultSensorIdBlock(type); } catch (e) { return ""; }
}

function bindSlots() {
  if (!sensors) return;
  bound = {};
  Object.keys(SLOTS).forEach(function (key) {
    var slot = SLOTS[key];
    var chosen = Edge.prop(slot.prop, "");
    // Only override a sensor the user never changed from iCUE's default.
    var untouched = !chosen || chosen === defaultIdFor(slot.type);
    var auto = catalog ? Edge.pickSensor(catalog, slot.role) : "";
    bound[key] = untouched && auto ? auto : chosen;
  });
  alt = {};
  ["gpuTemp", "cpuTemp"].forEach(function (key) {
    var sib = Edge.siblingSensor(catalog, bound[key]);
    if (sib) alt[key] = sib;
    var box = $(key).querySelector(".tile__alt");
    box.hidden = !sib;
    if (sib) box.querySelector(".tile__alt-name").textContent = sib.label;
  });
  Object.keys(bound).forEach(function (key) {
    var id = bound[key];
    var tile = tileFor(key);
    if (!id) { if (tile) tile.querySelector(".tile__name").textContent = "NOT SET"; return; }
    Promise.all([
      Edge.request(sensors, "getSensorName", id).catch(function () { return ""; }),
      Edge.request(sensors, "getSensorDeviceName", id).catch(function () { return ""; }),
    ]).then(function (r) {
      var label = sensorLabel(String(r[1] || ""), String(r[0] || "")).toUpperCase().slice(0, 34);
      if (tile) tile.querySelector(".tile__name").textContent = label;
      else $("fpsName").textContent = label ? ":: " + label : "";
    }).catch(function () {});
  });
  resync();
}

// "NVIDIA GeForce RTX 5080" + "Temp #1" -> "RTX 5080 · Temp #1", so each tile
// shows which chip it reads (the Ryzen's built-in Radeon is a GPU too).
function sensorLabel(device, name) {
  var dev = device
    .replace(/\((tm|r)\)/gi, "")
    .replace(/^(amd|nvidia|intel)\s+/i, "")
    .replace(/^geforce\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!dev || name.indexOf(dev) >= 0) return name;
  return name ? dev + " \u00b7 " + name : dev;
}

function isBound(id) {
  for (var k in bound) if (bound[k] === id) return true;
  for (var a in alt) if (alt[a].id === id) return true;
  return false;
}

function resync() {
  if (!sensors) return;
  var ids = Object.keys(bound).map(function (k) { return bound[k]; })
    .concat(Object.keys(alt).map(function (k) { return alt[k].id; }));
  ids.forEach(function (id) {
    if (!id) return;
    var u = units[id] ? Promise.resolve(units[id]) : Edge.request(sensors, "getSensorUnits", id);
    Promise.all([Edge.request(sensors, "getSensorValue", id), u]).then(function (r) {
      units[id] = r[1] || "";
      latest[id] = parseFloat(r[0]);
      renderSlots();
    }).catch(function () {
      delete latest[id];
      renderSlots();
    });
  });
}

// ---- FPS fpsHistory: one sample per second ----------------------------------

setInterval(function () {
  var v = latest[bound.fps];
  var live = typeof v === "number" && !isNaN(v) && v > 0;
  idleFor = live ? 0 : idleFor + 1;
  fpsHistory.push(live ? v : null);
  if (fpsHistory.length > WINDOW) fpsHistory.shift();
  TILES.forEach(function (key) {
    var t = latest[bound[key]];
    var ok = bound[key] && typeof t === "number" && !isNaN(t);
    tileHistory[key].push(ok ? tileLevel(key, t) : null);
    if (tileHistory[key].length > WINDOW) tileHistory[key].shift();
  });
  renderFpsStats();
  renderTrace();
  renderSparks();
}, 1000);

// ---- Render --------------------------------------------------------------

function tileFor(key) {
  return key === "fps" ? null : $(key);
}

function renderSlots() {
  var fps = latest[bound.fps];
  var live = typeof fps === "number" && !isNaN(fps) && fps > 0;
  $("fpsNum").textContent = live ? Math.round(fps) : "--";
  renderRev(live ? fps : null);
  $("frame").dataset.fps = live ? fpsState(fps) : (idleFor >= IDLE_AFTER ? "idle" : $("frame").dataset.fps);

  TILES.forEach(function (key) {
    var tile = $(key);
    var id = bound[key];
    var v = latest[id];
    var ok = id && typeof v === "number" && !isNaN(v);
    tile.querySelector(".tile__num").textContent = ok ? Math.round(v) : "--";
    if (tile.dataset.kind !== "load") {
      tile.querySelector(".tile__unit").textContent = /F/i.test(units[id] || "") ? "°F" : "°C";
    }
    var lvl = ok ? tileLevel(key, v) : null;
    tile.dataset.state = lvl ? lvl.state : "idle";
    tile.querySelector(".tbar i").style.width = lvl ? lvl.pct + "%" : "0";
    if (alt[key]) {
      var a = latest[alt[key].id];
      tile.querySelector(".tile__alt-num").textContent = typeof a === "number" && !isNaN(a) ? Math.round(a) + "°" : "--";
    }
  });
}

// Where a tile reading sits on its bar (0-100) and which color it gets.
function tileLevel(key, v) {
  if ($(key).dataset.kind === "load") {
    return { pct: Math.min(100, Math.max(0, v)), state: v >= 95 ? "warm" : "normal" };
  }
  var t = toC(v, units[bound[key]]);
  return {
    pct: Math.min(100, Math.max(0, (t - 30) / (cfg.hotAt + 10 - 30) * 100)),
    state: t >= cfg.hotAt ? "hot" : t >= cfg.warmAt ? "warm" : "normal",
  };
}

function renderSparks() {
  TILES.forEach(function (key) {
    drawLine($(key).querySelector(".spark"), tileHistory[key]);
  });
}

function toC(v, u) {
  return /F/i.test(u || "") ? (v - 32) * 5 / 9 : v;
}

function fpsState(fps) {
  if (fps >= cfg.fpsTarget) return "normal";
  if (fps >= cfg.fpsTarget * 0.6) return "warm";
  return "hot";
}

function renderFpsStats() {
  var vals = fpsHistory.filter(function (v) { return v !== null; });
  if (!vals.length) {
    $("fpsAvg").textContent = "--";
    $("fpsLow").textContent = "--";
    $("fpsBest").textContent = "--";
    if (idleFor >= IDLE_AFTER) {
      $("fpsNum").textContent = "--";
      $("frame").dataset.fps = "idle";
      renderRev(null);
    }
    return;
  }
  var sum = vals.reduce(function (a, b) { return a + b; }, 0);
  $("fpsAvg").textContent = Math.round(sum / vals.length);
  $("fpsLow").textContent = Math.round(Math.min.apply(null, vals));
  $("fpsBest").textContent = Math.round(Math.max.apply(null, vals));
}

function renderTrace() {
  var vals = fpsHistory.filter(function (v) { return v !== null; });
  var peak = Math.max.apply(null, vals.concat([0]));
  var scale = Math.max(cfg.fpsTarget * 1.25, peak * 1.05, 1);
  drawLine($("trace"), fpsHistory.map(function (v) {
    return v ? { pct: v / scale * 100, state: fpsState(v) } : null;
  }));
  var y = 100 - cfg.fpsTarget / scale * 100;
  $("traceTarget").setAttribute("y1", y);
  $("traceTarget").setAttribute("y2", y);
}

// Telemetry-style line trace in an SVG with viewBox 0 0 600 100.
// Gaps (null samples) break the line. Newest sample sits at the right edge.
function drawLine(svg, samples) {
  var n = WINDOW;
  var offset = n - samples.length;
  var stroke = "";
  var fill = "";
  var seg = [];
  var last = null;
  function flush() {
    if (!seg.length) return;
    stroke += "M" + seg.join("L");
    fill += "M" + seg[0].split(",")[0] + ",100L" + seg.join("L") + "L" + seg[seg.length - 1].split(",")[0] + ",100Z";
    seg = [];
  }
  for (var i = 0; i < n; i++) {
    var smp = i >= offset ? samples[i - offset] : null;
    if (!smp) { flush(); continue; }
    var x = (i / (n - 1) * 600).toFixed(1);
    var y = (100 - Math.max(2, Math.min(100, smp.pct))).toFixed(1);
    seg.push(x + "," + y);
    last = smp;
  }
  flush();
  svg.querySelector(".line__stroke").setAttribute("d", stroke);
  svg.querySelector(".line__fill").setAttribute("d", fill);
  svg.dataset.state = last ? last.state : "";
}

// ---- Shift lights ------------------------------------------------------------

// 15 LEDs fill left to right as FPS approaches the target, in the current
// status color. The last three only light (purple) when you're well above it.
var REV_LEDS = 15;

function renderRev(fps) {
  var rev = $("rev");
  if (rev.childElementCount !== REV_LEDS) {
    rev.innerHTML = "";
    for (var i = 0; i < REV_LEDS; i++) rev.appendChild(document.createElement("i"));
  }
  var live = typeof fps === "number" && !isNaN(fps) && fps > 0;
  var ratio = live ? fps / cfg.fpsTarget : 0;
  var lit = Math.min(REV_LEDS, Math.round(ratio * 12));
  var state = live ? fpsState(fps) : "";
  Array.prototype.forEach.call(rev.children, function (led, i) {
    var on = i < lit;
    led.className = on ? (i >= 12 ? "on best" : "on " + state) : "";
  });
}
