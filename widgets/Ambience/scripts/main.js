/* AMBIENCE — mixer UI for sound.js: scenes, knobs, scope, sleep timer. */

var CHANNELS = [
  { key: "rain", name: "Rain" },
  { key: "wind", name: "Wind" },
  { key: "fire", name: "Fire" },
  { key: "stream", name: "Stream" },
  { key: "night", name: "Night" },
  { key: "thunder", name: "Thunder" },
  { key: "drone", name: "Dungeon" },
  { key: "brown", name: "Hush" },
];

var SCENES = [
  { name: "Rainy Study", hint: "painting", levels: { rain: 65, thunder: 25, wind: 15 } },
  { name: "Campfire", hint: "stories", levels: { fire: 70, night: 45, wind: 20 } },
  { name: "Storm", hint: "drama", levels: { rain: 85, wind: 65, thunder: 75 } },
  { name: "Dungeon", hint: "D&D", levels: { drone: 60, wind: 20, stream: 25, fire: 15 } },
  { name: "Forest Night", hint: "bedtime", levels: { night: 60, stream: 40, wind: 15 } },
  { name: "Focus", hint: "homework", levels: { brown: 65, rain: 20 } },
];

var SLEEP_STEPS = [0, 15, 30, 60];
var FADE_SECONDS = 20;

var $ = function (id) { return document.getElementById(id); };
var st = null; // { levels, muted, master, scene }
var sleep = { minutes: 0, endsAt: 0, timer: null };
var knobs = {};

function onIcueDataUpdated() {
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  if (!st) {
    var s = Edge.store.load();
    st = {
      levels: s.levels || {},
      muted: s.muted || {},
      master: typeof s.master === "number" ? s.master : Number(Edge.prop("startVolume", 60)),
      scene: s.scene || "",
    };
    build();
    CHANNELS.forEach(function (c) { Sound.setLevel(c.key, effective(c.key)); });
    Sound.setMaster(st.master);
    render();
  }
}

function effective(key) { return st.muted[key] ? 0 : st.levels[key] || 0; }

function save() { Edge.store.save(st); }

// ---- Build UI ------------------------------------------------------------------

function build() {
  var grid = $("scenes");
  SCENES.forEach(function (sc) {
    var b = document.createElement("button");
    b.className = "scene";
    b.dataset.name = sc.name;
    b.innerHTML = '<span class="scene__name"></span><span class="scene__hint"></span>';
    b.querySelector(".scene__name").textContent = sc.name;
    b.querySelector(".scene__hint").textContent = sc.hint;
    Edge.press(b, function () { applyScene(sc); });
    grid.appendChild(b);
  });

  var box = $("channels");
  CHANNELS.forEach(function (c) {
    var ch = document.createElement("div");
    ch.className = "channel";
    ch.dataset.key = c.key;
    ch.innerHTML =
      '<span class="lamp"></span>' +
      '<div class="knob"><i></i></div>' +
      '<span class="knob__value"></span>' +
      '<span class="knob__label"></span>';
    ch.querySelector(".knob__label").textContent = c.name;
    box.appendChild(ch);
    knobs[c.key] = ch;
    dial(ch.querySelector(".knob"), function () { return st.levels[c.key] || 0; }, function (v) {
      st.levels[c.key] = v;
      st.muted[c.key] = false;
      st.scene = "";
      Sound.setLevel(c.key, v);
    }, function () {
      // Tap: mute or unmute (unmuting a silent knob brings it to 50).
      if (!st.levels[c.key]) { st.levels[c.key] = 50; st.muted[c.key] = false; }
      else st.muted[c.key] = !st.muted[c.key];
      st.scene = "";
      Sound.setLevel(c.key, effective(c.key));
    });
  });

  dial($("masterKnob"), function () { return st.master; }, function (v) {
    st.master = v;
    Sound.setMaster(v);
  }, null);

  Edge.press($("playBtn"), togglePlay);
  Edge.press($("sleepBtn"), cycleSleep);
}

// Drag up/down to turn a knob (a full sweep is ~40% of the widget height).
// A tap with no drag calls onTap. Any touch also starts the audio.
function dial(el, get, set, onTap) {
  var startY = 0, startV = 0, moved = false, active = false;
  el.addEventListener("pointerdown", function (e) {
    ensureAudio();
    active = true;
    moved = false;
    startY = e.clientY;
    startV = get();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add("is-pressed");
  });
  el.addEventListener("pointermove", function (e) {
    if (!active) return;
    var dy = startY - e.clientY;
    if (!moved && Math.abs(dy) < 6) return;
    moved = true;
    var span = Math.max(160, window.innerHeight * 0.4);
    var v = Math.round(Math.max(0, Math.min(100, startV + dy / span * 100)));
    set(v);
    render();
  });
  function end() {
    if (!active) return;
    active = false;
    el.classList.remove("is-pressed");
    if (!moved && onTap) onTap();
    save();
    render();
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

// ---- Actions -------------------------------------------------------------------

function ensureAudio() {
  if (!Sound.started()) {
    Sound.start();
    CHANNELS.forEach(function (c) { Sound.setLevel(c.key, effective(c.key)); });
    Sound.setMaster(st.master);
  } else if (!Sound.playing()) {
    Sound.resume();
  }
  setTimeout(render, 100);
}

function applyScene(sc) {
  ensureAudio();
  st.levels = {};
  st.muted = {};
  CHANNELS.forEach(function (c) {
    st.levels[c.key] = sc.levels[c.key] || 0;
    Sound.setLevel(c.key, st.levels[c.key]);
  });
  st.scene = sc.name;
  if (sleep.fading) { sleep.fading = false; Sound.setMaster(st.master); }
  save();
  render();
}

function togglePlay() {
  if (Sound.playing()) {
    Sound.pause();
  } else {
    ensureAudio();
    if (!CHANNELS.some(function (c) { return effective(c.key) > 0; })) applyScene(SCENES[0]);
  }
  setTimeout(render, 100);
}

function cycleSleep() {
  var i = SLEEP_STEPS.indexOf(sleep.minutes);
  sleep.minutes = SLEEP_STEPS[(i + 1) % SLEEP_STEPS.length];
  clearInterval(sleep.timer);
  sleep.fading = false;
  if (sleep.minutes) {
    ensureAudio();
    sleep.endsAt = Date.now() + sleep.minutes * 60000;
    sleep.timer = setInterval(sleepTick, 1000);
  }
  renderSleep();
}

function sleepTick() {
  var left = sleep.endsAt - Date.now();
  if (left <= FADE_SECONDS * 1000 && !sleep.fading) {
    sleep.fading = true;
    Sound.setMaster(0, FADE_SECONDS);
  }
  if (left <= 0) {
    clearInterval(sleep.timer);
    sleep.minutes = 0;
    sleep.fading = false;
    Sound.pause();
    Sound.setMaster(st.master);
    render();
  }
  renderSleep();
}

// ---- Render --------------------------------------------------------------------

function render() {
  CHANNELS.forEach(function (c) {
    var ch = knobs[c.key];
    var v = st.levels[c.key] || 0;
    var on = effective(c.key) > 0;
    ch.style.setProperty("--v", v);
    ch.classList.toggle("muted", !!st.muted[c.key] && v > 0);
    ch.classList.toggle("on", on);
    ch.querySelector(".knob__value").textContent = st.muted[c.key] && v > 0 ? "mute" : v;
  });
  $("masterKnob").style.setProperty("--v", st.master);
  Array.prototype.forEach.call($("scenes").children, function (b) { b.classList.toggle("on", b.dataset.name === st.scene); });
  var playing = Sound.playing();
  $("frame").dataset.playing = playing ? "yes" : "no";
  $("playLabel").textContent = playing ? "Pause" : "Play";
  renderSleep();
}

function renderSleep() {
  var t = $("sleepText");
  if (!sleep.minutes) { t.textContent = "Off"; return; }
  var left = Math.max(0, sleep.endsAt - Date.now());
  var m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  t.textContent = m + ":" + String(s).padStart(2, "0");
}

// Phosphor oscilloscope of the master output.
function drawScope() {
  var canvas = $("scope");
  var g = canvas.getContext("2d");
  var data = null;
  function frame() {
    var an = Sound.analyser();
    if (an && !data) data = new Uint8Array(an.fftSize);
    var w = canvas.width, h = canvas.height;
    g.fillStyle = "rgba(6, 20, 12, 0.35)"; // leaves a short afterglow
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(90, 255, 160, 0.12)";
    g.lineWidth = 1;
    for (var x = 0; x <= w; x += w / 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (var y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = "#7dffb2";
    g.shadowColor = "#3dff8f";
    g.shadowBlur = 8;
    g.lineWidth = 3;
    g.beginPath();
    if (data && Sound.playing()) {
      an.getByteTimeDomainData(data);
      var step = data.length / w;
      for (var i = 0; i < w; i++) {
        var v = (data[Math.floor(i * step)] - 128) / 128;
        var py = h / 2 - v * h * 1.6;
        if (i === 0) g.moveTo(i, py); else g.lineTo(i, py);
      }
    } else {
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
    }
    g.stroke();
    g.shadowBlur = 0;
    if (!document.hidden) requestAnimationFrame(frame);
    else setTimeout(function () { requestAnimationFrame(frame); }, 1000);
  }
  frame();
}

drawScope();
