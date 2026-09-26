/* FORGE — Mini Forge Dad painting-session timer. */

var KEEP_SESSIONS = 60;
var MIN_LOG_MS = 60 * 1000; // sessions shorter than a minute aren't logged
var DRY_DONE_SHOW_MS = 60 * 1000; // how long "dry" stays lit after the countdown
var PAINT = {}; // stage -> color, read from the buttons

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var st = loadState();
var toastTimer = null;

// ---- State -------------------------------------------------------------------

function loadState() {
  var s = Edge.store.load();
  return {
    runStart: s.runStart || null, // epoch ms while running
    banked: s.banked || 0, // session time banked while paused
    stage: s.stage || null,
    stageRunStart: s.stageRunStart || null,
    stageBanked: s.stageBanked || 0,
    splits: s.splits || {}, // stage -> ms, finished pieces this session
    order: s.order || [], // stages in first-used order
    sessionStart: s.sessionStart || null,
    who: s.who || "A",
    dryUntil: s.dryUntil || null,
    sessions: Array.isArray(s.sessions) ? s.sessions : [],
  };
}

function save() { Edge.store.save(st); }

Edge.store.onExternalChange(function () { st = loadState(); render(); });

function now() { return Date.now(); }
function sessionMs() { return st.banked + (st.runStart ? now() - st.runStart : 0); }
function stageMs() { return st.stageBanked + (st.stageRunStart ? now() - st.stageRunStart : 0); }

// ---- Settings ----------------------------------------------------------------

function onIcueDataUpdated() {
  cfg = {
    project: String(Edge.prop("project", "Space Marine Captain")),
    painterA: String(Edge.prop("painterA", "Dad")),
    painterB: String(Edge.prop("painterB", "Kiddo")),
    dryMinutes: Math.max(1, Number(Edge.prop("dryMinutes", 5))),
    textColor: Edge.prop("textColor", "#f0e4c8"),
    accentColor: Edge.prop("accentColor", "#c9973f"),
    backgroundColor: Edge.prop("backgroundColor", "#1e140e"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  render();
}

// ---- Session -----------------------------------------------------------------

function start() {
  if (st.runStart) return;
  st.runStart = now();
  st.sessionStart = st.sessionStart || st.runStart;
  if (st.stage) st.stageRunStart = st.runStart;
}

function pause() {
  if (!st.runStart) return;
  var t = now();
  st.banked += t - st.runStart;
  st.runStart = null;
  if (st.stageRunStart) {
    st.stageBanked += t - st.stageRunStart;
    st.stageRunStart = null;
  }
}

// Folds the running stage into the session's splits.
function commitStage() {
  if (!st.stage) return;
  var ms = stageMs();
  if (ms > 0) {
    if (st.order.indexOf(st.stage) < 0) st.order.push(st.stage);
    st.splits[st.stage] = (st.splits[st.stage] || 0) + ms;
  }
  st.stageBanked = 0;
  st.stageRunStart = st.runStart ? now() : null;
}

function selectStage(name) {
  if (name === st.stage) return;
  commitStage();
  st.stage = name;
  st.stageBanked = 0;
  if (!st.runStart) start(); // tapping a stage starts the clock
  st.stageRunStart = now();
  save();
  render();
}

function finish() {
  commitStage();
  var total = sessionMs();
  if (total >= MIN_LOG_MS) {
    st.sessions.unshift({
      at: st.sessionStart || now(),
      project: cfg.project,
      who: whoLabel(st.who),
      ms: total,
      splits: st.order.map(function (k) { return [k, st.splits[k]]; }),
    });
    st.sessions = st.sessions.slice(0, KEEP_SESSIONS);
    toast("Logged " + fmtDur(total) + " on " + cfg.project);
  } else {
    toast(total ? "Under a minute, not logged" : "Nothing to log yet");
  }
  st.runStart = null;
  st.banked = 0;
  st.stage = null;
  st.stageRunStart = null;
  st.stageBanked = 0;
  st.splits = {};
  st.order = [];
  st.sessionStart = null;
  save();
  render();
}

function whoLabel(w) {
  if (w === "B") return cfg.painterB;
  if (w === "both") return cfg.painterA + " & " + cfg.painterB;
  return cfg.painterA;
}

// ---- Controls ----------------------------------------------------------------

Edge.press($("runBtn"), function () {
  if (st.runStart) pause(); else start();
  save();
  render();
});

Edge.hold($("finishBtn"), finish, 1000);

Edge.press($("who"), function () {
  st.who = st.who === "A" ? "B" : st.who === "B" ? "both" : "A";
  save();
  render();
});

Array.prototype.forEach.call(document.querySelectorAll(".stage"), function (btn) {
  PAINT[btn.dataset.stage] = btn.style.getPropertyValue("--paint");
  Edge.press(btn, function () { selectStage(btn.dataset.stage); });
});

// Dry timer: tap starts (or restarts) the countdown, hold cancels.
Edge.press($("dryBtn"), function () {
  st.dryUntil = now() + cfg.dryMinutes * 60000;
  save();
  render();
}, function () {
  st.dryUntil = null;
  save();
  render();
});

// ---- Render ------------------------------------------------------------------

function fmtClock(ms) {
  var s = Math.floor(ms / 1000);
  return Math.floor(s / 3600) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
}

function fmtDur(ms) {
  var m = Math.round(ms / 60000);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + pad(m % 60) + "m";
}

function pad(n) { return String(n).padStart(2, "0"); }

function weekStart() {
  var d = new Date();
  var day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function render() {
  if (!cfg.project) return;
  var running = !!st.runStart;
  var total = sessionMs();
  $("frame").dataset.run = running ? "on" : total ? "paused" : "idle";
  $("projectLabel").textContent = cfg.project;
  $("who").textContent = whoLabel(st.who);
  $("clock").textContent = fmtClock(total);
  $("runBtn").textContent = running ? "Pause" : total ? "Resume" : "Start";
  $("stageNow").innerHTML = st.stage
    ? '<i style="background:' + PAINT[st.stage] + '"></i>' + st.stage + " · " + fmtClock(stageMs()).replace(/^0:/, "")
    : (total ? "No stage picked" : "Pick a stage to start");

  $("started").textContent = st.sessionStart
    ? "Started " + new Date(st.sessionStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (running ? "" : " \u00b7 paused")
    : "";

  Array.prototype.forEach.call(document.querySelectorAll(".stage"), function (btn) {
    btn.classList.toggle("active", btn.dataset.stage === st.stage);
  });

  renderDry();
  renderSplits();
  renderLog(total);
}

function renderDry() {
  var btn = $("dryBtn");
  var left = st.dryUntil ? st.dryUntil - now() : null;
  if (left !== null && left > 0) {
    var s = Math.ceil(left / 1000);
    $("dryTime").textContent = Math.floor(s / 60) + ":" + pad(s % 60);
    btn.dataset.state = "running";
  } else if (left !== null && left > -DRY_DONE_SHOW_MS) {
    $("dryTime").textContent = "Dry!";
    btn.dataset.state = "done";
  } else {
    $("dryTime").textContent = cfg.dryMinutes + ":00";
    btn.dataset.state = "";
  }
}

function renderSplits() {
  var rows = st.order.slice();
  var live = {};
  rows.forEach(function (k) { live[k] = st.splits[k] || 0; });
  if (st.stage) {
    if (rows.indexOf(st.stage) < 0) rows.push(st.stage);
    live[st.stage] = (live[st.stage] || 0) + stageMs();
  }
  var max = Math.max.apply(null, rows.map(function (k) { return live[k]; }).concat([1]));
  $("splits").innerHTML = rows.length ? rows.map(function (k) {
    return '<div class="split' + (k === st.stage ? " split--live" : "") + '">' +
      '<span class="split__name">' + k + "</span>" +
      '<span class="split__bar"><i style="width:' + (live[k] / max * 100).toFixed(1) + "%;background:" + PAINT[k] + '"></i></span>' +
      '<span class="split__time">' + fmtDur(live[k]) + "</span></div>";
  }).join("") : '<div class="splits__empty ws-hand">Stage times show up here as you paint.</div>';
}

function renderLog(current) {
  var ws = weekStart();
  var week = current, all = current;
  st.sessions.forEach(function (s) {
    all += s.ms;
    if (s.at >= ws) week += s.ms;
  });
  $("statWeek").textContent = fmtDur(week);
  $("statAll").textContent = fmtDur(all);
  $("statCount").textContent = st.sessions.length;

  $("history").innerHTML = st.sessions.slice(0, 4).map(function (s) {
    var d = new Date(s.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return "<li><b>" + esc(d) + "</b> " + esc(s.project) + " — " + fmtDur(s.ms) + " <span>(" + esc(s.who) + ")</span></li>";
  }).join("");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function toast(text) {
  var el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

setInterval(function () { if (!document.hidden) render(); }, 1000);
