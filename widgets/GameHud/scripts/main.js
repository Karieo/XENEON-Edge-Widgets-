/* GAME HUD — FPS with a 60 s trace, GPU load, GPU temp, CPU temp. */

var WINDOW = 60; // seconds of FPS fpsHistory
var RESYNC_MS = 2000; // safety net in case a sensorValueChanged signal is missed
var IDLE_AFTER = 3; // seconds without FPS before showing "no game"

// Each slot finds its sensor by type/kind when left on the iCUE default.
var SLOTS = {
  fps: { prop: "fpsSensor", type: "fps", match: function (s) { return s.type === "fps"; } },
  gpuLoad: { prop: "gpuLoadSensor", type: "load", match: function (s) { return s.kind === "gpu-load"; } },
  gpuTemp: { prop: "gpuTempSensor", type: "temperature", match: function (s) { return s.kind === "gpu-temp"; } },
  cpuTemp: {
    prop: "cpuTempSensor", type: "temperature",
    match: function (s) { return s.type === "temperature" && (s.kind === "cpu-temp" || s.kind === "package"); },
  },
};

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var sensors = null;
var catalog = null; // [{ id, type, kind }] from getAllSensorIds
var bound = {}; // slot -> sensorId
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
    showScanlines: Edge.prop("showScanlines", true) !== false,
    textColor: Edge.prop("textColor", "#f0efe4"),
    accentColor: Edge.prop("accentColor", "#f5a623"),
    backgroundColor: Edge.prop("backgroundColor", "#0a0a0c"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  $("frame").classList.toggle("scanlines", cfg.showScanlines);
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
  Edge.request(sensors, "getAllSensorIds").then(function (ids) {
    ids = Array.isArray(ids) ? ids : [];
    return Promise.all(ids.map(function (id) {
      return Promise.all([
        Edge.request(sensors, "getSensorType", id).catch(function () { return ""; }),
        Edge.request(sensors, "getSensorKind", id).catch(function () { return ""; }),
      ]).then(function (tk) { return { id: id, type: tk[0], kind: tk[1] }; });
    }));
  }).then(function (list) {
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
    var auto = catalog && catalog.find(slot.match);
    bound[key] = untouched && auto ? auto.id : chosen;
  });
  Object.keys(bound).forEach(function (key) {
    var id = bound[key];
    var tile = tileFor(key);
    if (!id) { if (tile) tile.querySelector(".tile__name").textContent = "NOT SET"; return; }
    Edge.request(sensors, "getSensorName", id).then(function (name) {
      var label = String(name || "").toUpperCase().slice(0, 30);
      if (tile) tile.querySelector(".tile__name").textContent = label;
      else $("fpsName").textContent = label ? ":: " + label : "";
    }).catch(function () {});
  });
  resync();
}

function isBound(id) {
  for (var k in bound) if (bound[k] === id) return true;
  return false;
}

function resync() {
  if (!sensors) return;
  Object.keys(bound).forEach(function (key) {
    var id = bound[key];
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
    tile.dataset.state = ok ? tileLevel(key, v).state : "idle";
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
    var spark = $(key).querySelector(".spark");
    var bars = ensureBars(spark);
    var hist = tileHistory[key];
    var offset = WINDOW - hist.length;
    for (var j = 0; j < WINDOW; j++) {
      var smp = j >= offset ? hist[j - offset] : null;
      bars[j].style.height = smp ? Math.max(3, smp.pct) + "%" : "0";
      bars[j].dataset.state = smp ? smp.state : "";
    }
  });
}

function ensureBars(container) {
  var bars = container.querySelectorAll(".bar");
  if (bars.length === WINDOW) return bars;
  Array.prototype.forEach.call(bars, function (b) { b.remove(); });
  for (var i = 0; i < WINDOW; i++) {
    var b = document.createElement("span");
    b.className = "bar";
    container.appendChild(b);
  }
  return container.querySelectorAll(".bar");
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
    if (idleFor >= IDLE_AFTER) {
      $("fpsNum").textContent = "--";
      $("frame").dataset.fps = "idle";
    }
    return;
  }
  var sum = vals.reduce(function (a, b) { return a + b; }, 0);
  $("fpsAvg").textContent = Math.round(sum / vals.length);
  $("fpsLow").textContent = Math.round(Math.min.apply(null, vals));
}

function renderTrace() {
  var bars = ensureBars($("trace"));
  var peak = Math.max.apply(null, fpsHistory.filter(function (v) { return v !== null; }).concat([0]));
  var scale = Math.max(cfg.fpsTarget * 1.25, peak * 1.05, 1);
  var offset = WINDOW - fpsHistory.length; // newest sample sits at the right edge
  for (var j = 0; j < WINDOW; j++) {
    var v = j >= offset ? fpsHistory[j - offset] : null;
    bars[j].style.height = v ? Math.max(2, v / scale * 100) + "%" : "0";
    bars[j].dataset.state = v ? fpsState(v) : "";
  }
  $("traceTarget").style.bottom = (cfg.fpsTarget / scale * 100) + "%";
}
