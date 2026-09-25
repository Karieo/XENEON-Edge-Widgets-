/* DATACORE — system temps, now playing, ASK CLAUDE. */

var CLAUDE_URLS = {
  web: "https://claude.ai",
  app: "claude://",
};

var RESYNC_MS = 5000; // safety net in case a sensorValueChanged signal is missed
var MEDIA_MS = 2000; // media plugin has no change signal, so poll lightly
var MAX_EXTRAS = 4;

var settings = {};
var sensors = null; // Sensors plugin once ready
var media = null; // Media plugin once ready
var watched = {}; // sensorId -> { el, kind: "temp" | "extra", units }
var autoPicked = null; // { cpu, gpu } when we pick sensors ourselves
var catalog = null; // Edge.sensorCatalog result, for auto-pick and second temps
var lastTrack = "";
var tempNow = { cpu: null, gpu: null }; // latest { v, units } per temp slot
var tempHistory = { cpu: [], gpu: [] }; // one { pct, state } sample per second
var TREND = 60; // seconds of temperature history
var timers = {};

var $ = function (id) { return document.getElementById(id); };

// ---- Settings ------------------------------------------------------------

function readSettings() {
  settings = {
    cpuSensor: Edge.prop("cpuSensor", ""),
    gpuSensor: Edge.prop("gpuSensor", ""),
    extraSensors: Edge.prop("extraSensors", []),
    warmAt: Number(Edge.prop("warmAt", 70)),
    hotAt: Number(Edge.prop("hotAt", 85)),
    claudeTarget: Edge.prop("claudeTarget", "app"), // claude:// confirmed on hardware 2026-09-25
    showScanlines: Edge.prop("showScanlines", true),
    textColor: Edge.prop("textColor", "#f0efe4"),
    accentColor: Edge.prop("accentColor", "#f5a623"),
    backgroundColor: Edge.prop("backgroundColor", "#0a0a0c"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  if (!Array.isArray(settings.extraSensors)) settings.extraSensors = [];
}

function applyStyle() {
  var root = document.documentElement.style;
  root.setProperty("--text-color", settings.textColor);
  root.setProperty("--accent-color", settings.accentColor);
  root.setProperty("--bg-color", settings.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - settings.transparency / 100));
  $("frame").classList.toggle("scanlines", settings.showScanlines !== false);
}

function onIcueInitialized() {
  onIcueDataUpdated();
}

function onIcueDataUpdated() {
  readSettings();
  applyStyle();
  rebuildSensors();
}

// ---- Sensors -------------------------------------------------------------

Edge.onPlugin("Sensorsdataprovider", function (plugin) {
  sensors = plugin;
  if (plugin.sensorValueChanged && plugin.sensorValueChanged.connect) {
    plugin.sensorValueChanged.connect(function (id, value) {
      if (watched[id]) renderValue(id, value);
    });
  }
  if (plugin.sensorUnitsChanged && plugin.sensorUnitsChanged.connect) {
    plugin.sensorUnitsChanged.connect(function (id, units) {
      if (watched[id]) { watched[id].units = units; refreshSensor(id); }
    });
  }
  rebuildSensors();
});

function temperatureIds() {
  // A picker left on iCUE's default (or empty) is auto-picked by device, so
  // the RTX wins over the Ryzen's built-in Radeon. A real choice always wins.
  var def = defaultTempId();
  function untouched(v) { return !v || v === def; }
  var cpu = settings.cpuSensor;
  var gpu = settings.gpuSensor;
  var ap = autoPicked || {};
  var ids = { cpu: cpu, gpu: gpu, auto: false };
  if (untouched(cpu) && ap.cpu) { ids.cpu = ap.cpu; ids.auto = true; }
  if (untouched(gpu) && ap.gpu) { ids.gpu = ap.gpu; ids.auto = true; }
  return ids;
}

function defaultTempId() {
  try { return sensors.getDefaultSensorIdBlock("temperature"); } catch (e) { return ""; }
}

function rebuildSensors() {
  if (!sensors) {
    setSysStatus(Edge.inIcue() ? "> SENSOR BUS OFFLINE" : "> DEV MODE :: NO ICUE");
    return;
  }

  if (!autoPicked) {
    autoPick().then(rebuildSensors);
    return;
  }

  watched = {};
  var ids = temperatureIds();
  bindTemp("cpu", ids.cpu);
  bindTemp("gpu", ids.gpu);

  var list = $("extras");
  list.innerHTML = "";
  settings.extraSensors.slice(0, MAX_EXTRAS).forEach(function (entry) {
    if (!entry || !entry.sensorId) return;
    var li = document.createElement("li");
    li.className = "extra";
    li.innerHTML = '<span class="extra__name">--</span><span class="extra__value">--</span>';
    if (entry.color) li.style.setProperty("--extra-color", entry.color);
    list.appendChild(li);
    watched[entry.sensorId] = { el: li, kind: "extra", units: "" };
    Edge.request(sensors, "getSensorName", entry.sensorId).then(function (name) {
      li.querySelector(".extra__name").textContent = shortName(name);
    }).catch(function () {});
  });

  Object.keys(watched).forEach(refreshSensor);
  setSysStatus(ids.auto ? "> AUTO-DETECTED :: PICK SENSORS IN SETTINGS" : "> SENSOR BUS ONLINE");

  clearInterval(timers.resync);
  timers.resync = setInterval(function () {
    if (!document.hidden) Object.keys(watched).forEach(refreshSensor);
  }, RESYNC_MS);
}

function bindTemp(slot, sensorId) {
  var el = $(slot);
  el.dataset.state = "idle";
  el.querySelector(".temp__num").textContent = "--";
  el.querySelector(".temp__unit").textContent = "";
  el.querySelector(".temp__name").textContent = sensorId ? "" : "NOT SET";
  if (!sensorId) return;
  // CPU and GPU could point at the same sensor; the later slot wins the map
  // entry, so keep a list of elements per sensor.
  var existing = watched[sensorId];
  watched[sensorId] = {
    el: el,
    also: existing ? existing.el : null,
    kind: "temp",
    units: "",
  };
  Edge.request(sensors, "getSensorName", sensorId).then(function (name) {
    el.querySelector(".temp__name").textContent = shortName(name);
  }).catch(function () {});

  // Show the chip's other temp (e.g. Temp #2) beside the main number.
  var box = el.querySelector(".temp__alt");
  var sib = Edge.siblingSensor(catalog, sensorId);
  box.hidden = !sib || !!watched[sib.id];
  if (box.hidden) return;
  box.querySelector(".temp__alt-name").textContent = sib.label;
  box.querySelector(".temp__alt-num").textContent = "--";
  watched[sib.id] = { el: box, kind: "alt", units: "" };
}

function refreshSensor(id) {
  var entry = watched[id];
  if (!entry || !sensors) return;
  var unitsP = entry.units ? Promise.resolve(entry.units) : Edge.request(sensors, "getSensorUnits", id);
  Promise.all([Edge.request(sensors, "getSensorValue", id), unitsP]).then(function (res) {
    entry.units = res[1] || "";
    renderValue(id, res[0]);
  }).catch(function () {
    markLost(entry);
  });
}

function renderValue(id, raw) {
  var entry = watched[id];
  if (!entry) return;
  var n = parseFloat(raw);
  if (isNaN(n)) { markLost(entry); return; }

  if (entry.kind === "extra") {
    entry.el.querySelector(".extra__value").textContent = formatExtra(n, entry.units);
    return;
  }
  if (entry.kind === "alt") {
    entry.el.querySelector(".temp__alt-num").textContent = Math.round(n) + "\u00b0";
    return;
  }

  [entry.el, entry.also].forEach(function (el) {
    if (!el) return;
    el.querySelector(".temp__num").textContent = Math.round(n);
    el.querySelector(".temp__unit").textContent = normalizeUnit(entry.units);
    el.dataset.state = tempState(n, entry.units);
    tempNow[el.id] = { v: n, units: entry.units };
  });
}

function markLost(entry) {
  [entry.el, entry.also].forEach(function (el) {
    if (!el) return;
    if (entry.kind === "extra") {
      el.querySelector(".extra__value").textContent = "LOST";
    } else if (entry.kind === "alt") {
      el.querySelector(".temp__alt-num").textContent = "--";
    } else {
      el.querySelector(".temp__num").textContent = "--";
      el.dataset.state = "idle";
      tempNow[el.id] = null;
    }
  });
}

function tempState(value, units) {
  var warm = settings.warmAt;
  var hot = settings.hotAt;
  if (/F/i.test(units || "")) {
    warm = warm * 9 / 5 + 32;
    hot = hot * 9 / 5 + 32;
  }
  if (value >= hot) return "hot";
  if (value >= warm) return "warm";
  return "normal";
}

function normalizeUnit(units) {
  if (!units) return "°";
  if (/^°/.test(units)) return units;
  if (/^[CF]$/i.test(units)) return "°" + units.toUpperCase();
  return units;
}

function formatExtra(n, units) {
  var u = (units || "").trim();
  var shown = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  if (/rpm/i.test(u)) return shown + " RPM";
  return shown + (u ? " " + normalizeUnit(u) : "");
}

function shortName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 28);
}

// Finds the CPU and GPU temperature sensors for pickers left on the default.
function autoPick() {
  autoPicked = {};
  return Edge.sensorCatalog(sensors).then(function (all) {
    catalog = all;
    autoPicked = { cpu: Edge.pickSensor(all, "cpu-temp"), gpu: Edge.pickSensor(all, "gpu-temp") };
  }).catch(function () {
    autoPicked = {};
  });
}

// ---- Temperature trends ----------------------------------------------------

function trendSample(t) {
  if (!t) return null;
  var c = /F/i.test(t.units || "") ? (t.v - 32) * 5 / 9 : t.v;
  return {
    pct: (c - 30) / (settings.hotAt + 10 - 30) * 100,
    state: tempState(t.v, t.units),
  };
}

setInterval(function () {
  ["cpu", "gpu"].forEach(function (slot) {
    tempHistory[slot].push(trendSample(tempNow[slot]));
    if (tempHistory[slot].length > TREND) tempHistory[slot].shift();
    if (!document.hidden) Edge.drawBars($(slot).querySelector(".spark"), tempHistory[slot], TREND);
  });
}, 1000);

// ---- Clock -----------------------------------------------------------------

function renderClock() {
  var now = new Date();
  $("clockTime").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("clockDate").textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

renderClock();
setInterval(renderClock, 5000);

// ---- Visualizer (decorative: iCUE exposes no audio levels) -----------------

(function buildViz() {
  var viz = $("viz");
  for (var i = 0; i < 32; i++) {
    var bar = document.createElement("i");
    bar.style.animationDuration = (0.55 + Math.random() * 0.9).toFixed(2) + "s";
    bar.style.animationDelay = (-Math.random()).toFixed(2) + "s";
    viz.appendChild(bar);
  }
})();

function setSysStatus(text) {
  $("sysStatus").textContent = text;
}

// ---- Media ---------------------------------------------------------------

Edge.onPlugin("Mediadataprovider", function (plugin) {
  media = plugin;
  pollMedia();
  clearInterval(timers.media);
  timers.media = setInterval(function () {
    if (!document.hidden) pollMedia();
  }, MEDIA_MS);
});

function pollMedia() {
  if (!media) return;
  Promise.all([
    Edge.request(media, "getSongName"),
    Edge.request(media, "getArtist"),
  ]).then(function (res) {
    var title = String(res[0] || "").trim();
    var artist = String(res[1] || "").trim();
    var key = title + "\u0000" + artist;
    if (key === lastTrack) return;
    lastTrack = key;
    $("trackTitle").textContent = title || "NO SIGNAL";
    $("trackArtist").textContent = artist || "—";
    $("frame").classList.toggle("has-track", !!title);
  }).catch(function () {});
}

function mediaCommand(method) {
  if (media && typeof media[method] === "function") {
    media[method]();
    setTimeout(pollMedia, 400);
  }
}

Edge.press($("btnPrev"), function () { mediaCommand("triggerPreviousTrack"); });
Edge.press($("btnPlay"), function () { mediaCommand("triggerPlayPause"); });
Edge.press($("btnNext"), function () { mediaCommand("triggerNextTrack"); });

// ---- ASK CLAUDE ----------------------------------------------------------

Edge.press($("btnClaude"), function () {
  var key = settings.claudeTarget === "web" ? "web" : "app";
  var url = CLAUDE_URLS[key];
  var how = Edge.openLink(url);
  var btn = $("btnClaude");
  btn.classList.add("is-firing");
  setTimeout(function () { btn.classList.remove("is-firing"); }, 700);
  $("commsStatus").textContent = how === "unavailable"
    ? "> LINK PLUGIN OFFLINE"
    : "> UPLINK OPENED :: " + (key === "app" ? "DESKTOP APP" : "CLAUDE.AI");
  clearTimeout(timers.comms);
  timers.comms = setTimeout(function () { $("commsStatus").textContent = "> READY"; }, 6000);
});
