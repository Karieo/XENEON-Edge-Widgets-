/* OKTAI — Oktai Khang tracker, D&D 2014 rules. */

var CONTAM_MAX = 6;
var HISTORY = 5;

// Resources track how many are *spent*, so changing a max in settings
// never loses what's been used this session.
var RESOURCES = {
  ki: { prop: "kiMax", fallback: 6 },
  sup: { prop: "supMax", fallback: 4 },
  surge: { prop: "surgeMax", fallback: 1 },
  wind: { prop: "windMax", fallback: 1 },
};

// 2014 rules: ki (Monk), superiority dice, Action Surge, and Second Wind all
// come back on a short rest. A long rest restores those plus all HP.
// Contamination is never touched by resting.
var SHORT_REST = ["ki", "sup", "surge", "wind"];

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var state = loadState();
var toastTimer = null;

function loadState() {
  var s = Edge.store.load();
  return {
    hp: typeof s.hp === "number" ? s.hp : null, // null = full
    temp: s.temp || 0,
    used: Object.assign({ ki: 0, sup: 0, surge: 0, wind: 0, hd8: 0, hd10: 0 }, s.used),
    contam: s.contam || 0,
    rolls: Array.isArray(s.rolls) ? s.rolls.slice(0, HISTORY) : [],
  };
}

function save() {
  Edge.store.save(state);
}

Edge.store.onExternalChange(function () {
  state = loadState();
  render();
});

// ---- Settings ------------------------------------------------------------

function onIcueDataUpdated() {
  cfg = {
    maxHp: Math.max(1, Number(Edge.prop("maxHp", 60))),
    supDie: String(Edge.prop("supDie", "d8")),
    hd8: Math.max(0, Number(Edge.prop("hdMonk", 6))),
    hd10: Math.max(0, Number(Edge.prop("hdFighter", 3))),
    conMod: Number(Edge.prop("conMod", 1)),
    textColor: Edge.prop("textColor", "#ddd4c2"),
    accentColor: Edge.prop("accentColor", "#c8a45a"),
    backgroundColor: Edge.prop("backgroundColor", "#0c0d0f"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  Object.keys(RESOURCES).forEach(function (k) {
    var r = RESOURCES[k];
    cfg[k] = Math.max(0, Number(Edge.prop(r.prop, r.fallback)));
  });

  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  Array.prototype.forEach.call(document.querySelectorAll(".supDieLabel"), function (el) {
    el.textContent = cfg.supDie;
  });
  render();
}

// ---- Render --------------------------------------------------------------

function hpNow() {
  return state.hp === null ? cfg.maxHp : Math.min(state.hp, cfg.maxHp);
}

function render() {
  if (!cfg.maxHp) return;
  var hp = hpNow();
  $("hpCur").textContent = hp;
  $("hpMax").textContent = "/" + cfg.maxHp;
  $("hpTemp").textContent = state.temp;
  var pct = hp / cfg.maxHp;
  $("hpFill").style.width = (pct * 100) + "%";
  $("hpTempBar").style.width = Math.min(100, state.temp / cfg.maxHp * 100) + "%";
  $("frame").dataset.hp = hp === 0 ? "down" : pct <= 0.25 ? "low" : pct <= 0.5 ? "mid" : "ok";

  Array.prototype.forEach.call(document.querySelectorAll(".res__tile"), function (tile) {
    var key = tile.dataset.key;
    var max = cfg[key];
    var used = Math.min(state.used[key], max);
    tile.hidden = max === 0;
    tile.querySelector(".res__count").textContent = (max - used) + "/" + max;
    var pips = tile.querySelector(".pips");
    if (pips.childElementCount !== max) {
      pips.innerHTML = "";
      for (var i = 0; i < max; i++) pips.appendChild(document.createElement("i"));
    }
    Array.prototype.forEach.call(pips.children, function (pip, i) {
      pip.classList.toggle("spent", i >= max - used);
    });
    tile.classList.toggle("empty", used >= max);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".hd__btn"), function (btn) {
    var key = "hd" + btn.dataset.hd;
    var left = cfg[key] - Math.min(state.used[key], cfg[key]);
    btn.hidden = cfg[key] === 0;
    btn.querySelector(".hd__count").textContent = left + "/" + cfg[key];
    btn.classList.toggle("empty", left <= 0);
  });

  renderContam();
  renderHistory();
}

function renderContam() {
  var track = $("contamTrack");
  if (!track.childElementCount) {
    for (var lvl = CONTAM_MAX; lvl >= 1; lvl--) {
      var seg = document.createElement("button");
      seg.className = "contam__seg";
      seg.dataset.level = lvl;
      seg.textContent = lvl;
      track.appendChild(seg);
      bindContam(seg, lvl);
    }
  }
  Array.prototype.forEach.call(track.children, function (seg) {
    seg.classList.toggle("on", Number(seg.dataset.level) <= state.contam);
  });
  $("contamLevel").textContent = state.contam;
  document.documentElement.style.setProperty("--haze", String(state.contam / CONTAM_MAX));
  // Drifting fog kicks in at level 3 and is full at 6.
  document.documentElement.style.setProperty("--fog", String(Math.max(0, state.contam - 2) / (CONTAM_MAX - 2)));
}

function bindContam(seg, lvl) {
  // Tap a level to set it; tap the current top level to drop one.
  Edge.press(seg, function () {
    state.contam = state.contam === lvl ? lvl - 1 : lvl;
    save();
    render();
  });
}

function renderHistory() {
  $("diceHistory").innerHTML = state.rolls.map(function (r) {
    return "<span>" + r.label + " <b>" + r.total + "</b></span>";
  }).join("");
}

// ---- HP ------------------------------------------------------------------

function damage(n) {
  var fromTemp = Math.min(state.temp, n);
  state.temp -= fromTemp;
  state.hp = Math.max(0, hpNow() - (n - fromTemp));
  save();
  render();
}

function heal(n) {
  state.hp = Math.min(cfg.maxHp, hpNow() + n);
  save();
  render();
}

function tempHp(delta) {
  state.temp = Math.max(0, state.temp + delta);
  save();
  render();
}

Edge.press($("btnDmg"), function () { damage(1); }, function () { damage(5); });
Edge.press($("btnHeal"), function () { heal(1); }, function () { heal(5); });
Edge.press($("btnTempDown"), function () { tempHp(-1); }, function () { tempHp(-5); });
Edge.press($("btnTempUp"), function () { tempHp(1); }, function () { tempHp(5); });

// ---- Resources -----------------------------------------------------------

Array.prototype.forEach.call(document.querySelectorAll(".res__tile"), function (tile) {
  var key = tile.dataset.key;
  Edge.press(tile, function () {
    // Tap spends one.
    if (state.used[key] < cfg[key]) { state.used[key]++; save(); render(); }
  }, function () {
    // Long-press restores one.
    if (state.used[key] > 0) { state.used[key]--; save(); render(); }
  });
});

// ---- Rests ---------------------------------------------------------------

Edge.hold($("btnShort"), function () {
  SHORT_REST.forEach(function (k) { state.used[k] = 0; });
  save();
  render();
  toast("Short rest: ki, superiority, surge, second wind restored");
});

Edge.hold($("btnLong"), function () {
  SHORT_REST.forEach(function (k) { state.used[k] = 0; });
  state.hp = null;
  state.temp = 0;
  // 2014: regain spent hit dice up to half your total (minimum 1), d10s first.
  var regain = Math.max(1, Math.floor((cfg.hd8 + cfg.hd10) / 2));
  ["hd10", "hd8"].forEach(function (k) {
    var back = Math.min(regain, state.used[k]);
    state.used[k] -= back;
    regain -= back;
  });
  save();
  render();
  toast("Long rest: HP, resources, and half your hit dice back. Contamination stays.");
});

function toast(text) {
  var el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
}

// ---- Dice ----------------------------------------------------------------

function dieSides(label) {
  return Number(String(label).replace(/\D/g, "")) || 20;
}

function roll(kind) {
  var r;
  if (kind === "adv" || kind === "dis") {
    var a = Edge.roll(20), b = Edge.roll(20);
    var total = kind === "adv" ? Math.max(a, b) : Math.min(a, b);
    r = { label: kind.toUpperCase(), total: total, detail: a + " · " + b };
  } else {
    var label = kind === "sup" ? cfg.supDie : kind;
    var n = Edge.roll(dieSides(label));
    r = { label: label, total: n, detail: label };
  }
  showRoll(r);
  state.rolls.unshift({ label: r.label, total: r.total });
  state.rolls = state.rolls.slice(0, HISTORY);
  save();
  renderHistory();
}

function showRoll(r) {
  var crit = (r.label === "d20" || r.label === "ADV" || r.label === "DIS") && (r.total === 20 || r.total === 1);
  $("diceNum").textContent = r.total;
  $("diceDetail").textContent = r.detail;
  var result = $("diceNum").parentNode;
  result.dataset.crit = crit ? (r.total === 20 ? "hit" : "miss") : "";
  result.classList.remove("rolled");
  void result.offsetWidth; // restart the animation
  result.classList.add("rolled");
}

// ---- Hit dice --------------------------------------------------------------

// Tap spends one: rolls it + CON (minimum 0) and heals that much.
// Hold gives one back (for a mis-tap).
Array.prototype.forEach.call(document.querySelectorAll(".hd__btn"), function (btn) {
  var sides = Number(btn.dataset.hd);
  var key = "hd" + sides;
  Edge.press(btn, function () {
    if (state.used[key] >= cfg[key]) return;
    state.used[key]++;
    var die = Edge.roll(sides);
    var gain = Math.max(0, die + cfg.conMod);
    var before = hpNow();
    state.hp = Math.min(cfg.maxHp, before + gain);
    var mod = cfg.conMod >= 0 ? "+" + cfg.conMod : String(cfg.conMod);
    var r = { label: "HD" + sides, total: gain, detail: "d" + sides + " " + die + " " + mod };
    showRoll(r);
    state.rolls.unshift({ label: r.label, total: r.total });
    state.rolls = state.rolls.slice(0, HISTORY);
    save();
    render();
    toast("Hit die d" + sides + ": +" + (state.hp - before) + " HP");
  }, function () {
    if (state.used[key] > 0) { state.used[key]--; save(); render(); }
  });
});

Array.prototype.forEach.call(document.querySelectorAll(".die"), function (btn) {
  Edge.press(btn, function () { roll(btn.dataset.roll); });
});
