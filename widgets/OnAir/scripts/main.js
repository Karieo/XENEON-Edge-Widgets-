/* ON AIR — OBS control over obs-websocket v5. */

var POLL_MS = 1000; // record/stream timecode
var STATS_MS = 2000; // health line
var MAX_SCENES = 8;
var HOLD_MS = 900;

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var obs = null;
var timers = {};
var toastTimer = null;
var live = {
  rec: false, recPaused: false, stream: false,
  scenes: [], program: "",
  mic: "", desk: "", mute: {},
  canChapter: false, replay: null, // replay: null = unavailable, false = off, true = running
};

// ---- Settings ------------------------------------------------------------------

function onIcueDataUpdated() {
  var prev = cfg.obsAddress + "|" + cfg.obsPassword;
  cfg = {
    obsAddress: String(Edge.prop("obsAddress", "ws://127.0.0.1:4455")).trim(),
    obsPassword: String(Edge.prop("obsPassword", "")),
    micSource: String(Edge.prop("micSource", "")).trim(),
    desktopSource: String(Edge.prop("desktopSource", "")).trim(),
    showStream: Edge.prop("showStream", true) !== false,
    chapterName: String(Edge.prop("chapterName", "")).trim(),
    accentColor: Edge.prop("accentColor", "#ff2b2b"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--bc-red", cfg.accentColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  $("streamRow").hidden = !cfg.showStream;
  if (prev !== cfg.obsAddress + "|" + cfg.obsPassword) connect();
  else if (obs && obs.state === "connected") loadAudioSources();
}

function normalizeAddress(a) {
  if (!a) return "ws://127.0.0.1:4455";
  if (!/^wss?:\/\//i.test(a)) a = "ws://" + a;
  if (!/:\d+$/.test(a.replace(/\/+$/, ""))) a = a.replace(/\/+$/, "") + ":4455";
  return a;
}

// ---- Connection ----------------------------------------------------------------

function connect() {
  if (obs) obs.close();
  clearInterval(timers.poll);
  clearInterval(timers.stats);
  obs = new Obs({
    url: normalizeAddress(cfg.obsAddress),
    password: cfg.obsPassword,
    onState: onConnState,
    onEvent: onObsEvent,
  });
  obs.connect();
}

function onConnState(state, detail) {
  $("frame").dataset.conn = state;
  if (state === "connected") {
    $("conn").textContent = "OBS connected";
    loadAll();
    timers.poll = setInterval(function () { if (!document.hidden) pollOutputs(); }, POLL_MS);
    timers.stats = setInterval(function () { if (!document.hidden) pollStats(); }, STATS_MS);
  } else {
    clearInterval(timers.poll);
    clearInterval(timers.stats);
    $("conn").textContent = state === "connecting" ? "Connecting…"
      : state === "auth" ? detail
      : (detail || "OBS offline") + " · retrying";
    if (state !== "connecting") { $("health").textContent = "—"; setMeters({}); }
  }
}

function loadAll() {
  obs.call("GetVersion").then(function (v) {
    live.canChapter = (v.availableRequests || []).indexOf("CreateRecordChapter") >= 0;
    renderTools();
  }).catch(function () {});
  loadScenes();
  loadAudioSources();
  obs.call("GetReplayBufferStatus").then(function (r) { live.replay = !!r.outputActive; renderTools(); },
    function () { live.replay = null; renderTools(); }); // not configured in OBS
  pollOutputs();
  pollStats();
}

function loadScenes() {
  obs.call("GetSceneList").then(function (r) {
    // OBS lists scenes bottom-up; show them in the same order as the OBS UI.
    live.scenes = (r.scenes || []).slice().sort(function (a, b) { return b.sceneIndex - a.sceneIndex; })
      .map(function (s) { return s.sceneName; });
    live.program = r.currentProgramSceneName || "";
    renderScenes();
  }).catch(function () {});
}

function loadAudioSources() {
  obs.call("GetSpecialInputs").then(function (sp) {
    live.mic = cfg.micSource || sp.mic1 || "";
    live.desk = cfg.desktopSource || sp.desktop1 || "";
    [live.mic, live.desk].forEach(function (name) {
      if (!name) return;
      obs.call("GetInputMute", { inputName: name }).then(function (r) {
        live.mute[name] = !!r.inputMuted;
        renderAudio();
      }).catch(function () {});
    });
    renderAudio();
  }).catch(function () {});
}

function pollOutputs() {
  obs.call("GetRecordStatus").then(function (r) {
    live.rec = !!r.outputActive;
    live.recPaused = !!r.outputPaused;
    $("recTc").textContent = live.rec ? tc(r.outputDuration) : "00:00:00";
    renderOutputs();
  }).catch(function () {});
  if (!cfg.showStream) return;
  obs.call("GetStreamStatus").then(function (r) {
    live.stream = !!r.outputActive;
    live.streamReconnecting = !!r.outputReconnecting;
    $("streamTc").textContent = live.stream ? tc(r.outputDuration) : "";
    renderOutputs();
  }).catch(function () {});
}

function pollStats() {
  obs.call("GetStats").then(function (s) {
    var total = s.outputTotalFrames || 0;
    var dropped = s.outputSkippedFrames || 0;
    var renderTotal = s.renderTotalFrames || 0;
    var lagged = s.renderSkippedFrames || 0;
    var pct = total ? dropped / total * 100 : 0;
    var disk = s.availableDiskSpace; // MB
    var bad = pct >= 1 || (renderTotal && lagged / renderTotal >= 0.01) || (disk != null && disk < 10240);
    $("health").innerHTML =
      "<span>" + (s.activeFps || 0).toFixed(0) + " fps</span>" +
      "<span" + (pct >= 1 ? ' class="warn"' : "") + ">" + dropped + " dropped (" + pct.toFixed(1) + "%)</span>" +
      "<span>CPU " + (s.cpuUsage || 0).toFixed(0) + "%</span>" +
      "<span" + (disk != null && disk < 10240 ? ' class="warn"' : "") + ">" + (disk == null ? "?" : (disk / 1024).toFixed(0)) + " GB free</span>";
    $("health").classList.toggle("bad", !!bad);
  }).catch(function () {});
}

// ---- Events --------------------------------------------------------------------

function onObsEvent(type, d) {
  switch (type) {
    case "CurrentProgramSceneChanged":
      live.program = d.sceneName; renderScenes(); break;
    case "SceneListChanged":
    case "SceneCreated":
    case "SceneRemoved":
    case "SceneNameChanged":
      loadScenes(); break;
    case "RecordStateChanged":
      live.rec = !!d.outputActive;
      if (d.outputState === "OBS_WEBSOCKET_OUTPUT_PAUSED") live.recPaused = true;
      if (d.outputState === "OBS_WEBSOCKET_OUTPUT_RESUMED" || !d.outputActive) live.recPaused = false;
      renderOutputs(); break;
    case "StreamStateChanged":
      live.stream = !!d.outputActive; renderOutputs(); break;
    case "ReplayBufferStateChanged":
      live.replay = !!d.outputActive; renderTools(); break;
    case "ReplayBufferSaved":
      toast("Clip saved"); break;
    case "InputMuteStateChanged":
      live.mute[d.inputName] = !!d.inputMuted; renderAudio(); break;
    case "InputNameChanged":
      if (d.oldInputName === live.mic) live.mic = d.inputName;
      if (d.oldInputName === live.desk) live.desk = d.inputName;
      renderAudio(); break;
    case "InputVolumeMeters":
      var levels = {};
      (d.inputs || []).forEach(function (inp) { levels[inp.inputName] = inp.inputLevelsMul || []; });
      setMeters(levels); break;
    case "ExitStarted":
      toast("OBS is closing"); break;
  }
}

// ---- Render --------------------------------------------------------------------

function tc(ms) {
  var s = Math.floor((ms || 0) / 1000);
  return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
}

function pad(n) { return String(n).padStart(2, "0"); }

function renderOutputs() {
  var f = $("frame");
  f.dataset.rec = live.rec ? (live.recPaused ? "paused" : "on") : "off";
  f.dataset.stream = live.stream ? (live.streamReconnecting ? "reconnecting" : "on") : "off";
  $("recLabel").textContent = live.rec ? "Hold to stop" : "Rec";
  $("pauseBtn").textContent = live.recPaused ? "Resume" : "Pause";
  $("pauseBtn").disabled = !live.rec;
  $("streamBtn").textContent = live.stream ? "Hold to end" : "Go live";
  renderTools();
}

function renderScenes() {
  var grid = $("scenes");
  var names = live.scenes.slice(0, MAX_SCENES);
  grid.dataset.count = names.length;
  grid.innerHTML = "";
  names.forEach(function (name) {
    var b = document.createElement("button");
    b.className = "btn scene" + (name === live.program ? " program" : "");
    b.textContent = name;
    Edge.press(b, function () {
      if (name === live.program) return;
      obs.call("SetCurrentProgramScene", { sceneName: name }).catch(function (e) { toast(e.message); });
    });
    grid.appendChild(b);
  });
  $("sceneLive").textContent = live.program ? "· " + live.program : "";
  if (live.scenes.length > MAX_SCENES) $("sceneLive").textContent += " (first " + MAX_SCENES + " shown)";
}

function renderAudio() {
  [["mic", "micStrip", "micBtn"], ["desk", "deskStrip", "deskBtn"]].forEach(function (x) {
    var name = live[x[0]];
    var strip = $(x[1]);
    strip.hidden = !name;
    if (!name) return;
    strip.querySelector(".strip__name").textContent = name;
    var muted = !!live.mute[name];
    strip.classList.toggle("muted", muted);
    $(x[2]).textContent = muted ? "Muted" : "Live";
  });
}

// OBS sends linear levels per channel: [magnitude, peak, inputPeak]. Map -60..0 dB to 0..100%.
function toPct(mul) {
  if (!mul || mul <= 0) return 0;
  var db = 20 * Math.log10(mul);
  return Math.max(0, Math.min(100, (db + 60) / 60 * 100));
}

function setMeters(levels) {
  [["mic", "micStrip"], ["desk", "deskStrip"]].forEach(function (x) {
    var chans = levels[live[x[0]]] || [];
    var mag = 0, peak = 0;
    chans.forEach(function (c) { mag = Math.max(mag, c[0] || 0); peak = Math.max(peak, c[1] || 0); });
    var strip = $(x[1]);
    var lv = toPct(mag), pk = toPct(peak);
    strip.querySelector(".meter__cover").style.height = (100 - lv) + "%";
    strip.querySelector(".meter__peak").style.bottom = pk + "%";
    strip.dataset.level = pk >= 95 ? "clip" : pk >= 80 ? "hot" : "ok";
  });
}

function renderTools() {
  var mark = $("markBtn");
  mark.hidden = !live.canChapter;
  mark.disabled = !live.rec;
  var clip = $("clipBtn");
  clip.hidden = live.replay === null;
  clip.textContent = live.replay ? "Clip" : "Start buffer";
}

function toast(text) {
  var el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

// ---- Controls ------------------------------------------------------------------

function call(type, data, okText) {
  if (!obs || obs.state !== "connected") { toast("OBS not connected"); return Promise.resolve(); }
  return obs.call(type, data).then(function (r) { if (okText) toast(okText); return r; }, function (e) { toast(e.message); });
}

// REC and GO LIVE: tap starts, a full hold stops (so a bumped screen can't end a take).
function startStop(btn, isOn, startType, stopType, startText, stopText) {
  btn.classList.add("hold");
  btn.style.setProperty("--hold-ms", HOLD_MS + "ms");
  Edge.press(btn, function () {
    if (!isOn()) call(startType, null, startText);
    else toast("Hold to stop");
  }, function () {
    if (isOn()) call(stopType, null, stopText);
  }, HOLD_MS);
}

startStop($("recBtn"), function () { return live.rec; }, "StartRecord", "StopRecord", "Recording", "Recording saved");
startStop($("streamBtn"), function () { return live.stream; }, "StartStream", "StopStream", "Going live", "Stream ended");

Edge.press($("pauseBtn"), function () { if (live.rec) call("ToggleRecordPause"); });

Edge.press($("micBtn"), function () { if (live.mic) call("ToggleInputMute", { inputName: live.mic }); });
Edge.press($("deskBtn"), function () { if (live.desk) call("ToggleInputMute", { inputName: live.desk }); });

var chapterCount = 0;
Edge.press($("markBtn"), function () {
  if (!live.rec) return;
  chapterCount++;
  var data = cfg.chapterName ? { chapterName: cfg.chapterName + " " + chapterCount } : {};
  call("CreateRecordChapter", data, "Chapter marked").then(function (r) {
    if (r === undefined) chapterCount--;
  });
});

Edge.press($("clipBtn"), function () {
  if (live.replay) call("SaveReplayBuffer");
  else call("StartReplayBuffer", null, "Replay buffer on");
});
