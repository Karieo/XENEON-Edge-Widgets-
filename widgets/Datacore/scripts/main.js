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
var lastTrack = "";
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
    claudeTarget: Edge.prop("claudeTarget", "web"),
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
  var cpu = settings.cpuSensor;
  var gpu = settings.gpuSensor;
  // Both pickers default to "the default temperature sensor", so until the
  // user picks, they're identical. In that case, find CPU/GPU by sensor kind.
  if ((!cpu || cpu === gpu) && autoPicked) {
    return { cpu: autoPicked.cpu || cpu, gpu: autoPicked.gpu || gpu, auto: true };
  }
  return { cpu: cpu, gpu: gpu, auto: false };
}

function rebuildSensors() {
  if (!sensors) {
    setSysStatus(Edge.inIcue() ? "> SENSOR BUS OFFLINE" : "> DEV MODE :: NO ICUE");
    return;
  }

  if ((!settings.cpuSensor || settings.cpuSensor === settings.gpuSensor) && !autoPicked) {
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

  [entry.el, entry.also].forEach(function (el) {
    if (!el) return;
    el.querySelector(".temp__num").textContent = Math.round(n);
    el.querySelector(".temp__unit").textContent = normalizeUnit(entry.units);
    el.dataset.state = tempState(n, entry.units);
  });
}

function markLost(entry) {
  [entry.el, entry.also].forEach(function (el) {
    if (!el) return;
    if (entry.kind === "extra") {
      el.querySelector(".extra__value").textContent = "LOST";
    } else {
      el.querySelector(".temp__num").textContent = "--";
      el.dataset.state = "idle";
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

// Finds CPU and GPU temperature sensors by kind when the user hasn't picked.
function autoPick() {
  autoPicked = {};
  return Edge.request(sensors, "getAllSensorIds").then(function (ids) {
    ids = Array.isArray(ids) ? ids : [];
    return Promise.all(ids.map(function (id) {
      return Promise.all([
        Edge.request(sensors, "getSensorType", id).catch(function () { return ""; }),
        Edge.request(sensors, "getSensorKind", id).catch(function () { return ""; }),
      ]).then(function (tk) { return { id: id, type: tk[0], kind: tk[1] }; });
    }));
  }).then(function (all) {
    var temps = all.filter(function (s) { return s.type === "temperature"; });
    var cpu = temps.find(function (s) { return s.kind === "cpu-temp"; }) ||
      temps.find(function (s) { return s.kind === "package"; });
    var gpu = temps.find(function (s) { return s.kind === "gpu-temp"; });
    autoPicked = { cpu: cpu && cpu.id, gpu: gpu && gpu.id };
  }).catch(function () {
    autoPicked = {};
  });
}

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
  var key = settings.claudeTarget === "app" ? "app" : "web";
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
