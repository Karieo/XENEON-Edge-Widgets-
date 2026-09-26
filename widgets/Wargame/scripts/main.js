/* WARGAME — two-player Warhammer 40,000 (10th edition) game tracker. */

var PHASES = ["Command", "Movement", "Shooting", "Charge", "Fight"];
var ROUNDS = 5;
var CAPS = { primary: 50, secondary: 40, cp: 99 };

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var game = null;
var toastTimer = null;

// ---- Settings ------------------------------------------------------------

function onIcueDataUpdated() {
  cfg = {
    names: { 1: Edge.prop("p1Name", "Dad"), 2: Edge.prop("p2Name", "Kiddo") },
    armies: { 1: Edge.prop("p1Army", "Space Marines"), 2: Edge.prop("p2Army", "Orks") },
    colors: { 1: Edge.prop("p1Color", "#2f6fd6"), 2: Edge.prop("p2Color", "#3f9a3a") },
    startCp: Number(Edge.prop("startCp", 0)),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  document.documentElement.style.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  [1, 2].forEach(function (p) {
    var side = $("side" + p);
    side.style.setProperty("--army", cfg.colors[p]);
    field(side, "name").textContent = cfg.names[p];
    field(side, "army").textContent = cfg.armies[p];
  });
  if (!game) load();
  render();
}

function field(side, f) { return side.querySelector('[data-f="' + f + '"]'); }

// ---- Game state ------------------------------------------------------------

function freshGame(first) {
  return {
    round: 1,
    first: first || 1,
    active: first || 1,
    phase: 0,
    over: false,
    cpGranted: [],
    p: {
      1: { primary: 0, secondary: 0, cp: cfg.startCp, ready: false },
      2: { primary: 0, secondary: 0, cp: cfg.startCp, ready: false },
    },
  };
}

function load() {
  var s = Edge.store.load();
  game = s.game && s.game.p ? s.game : freshGame(1);
  if (!s.game) grantCommandCp();
}

function save() {
  Edge.store.save({ game: game });
}

// Which turn of the round this is: 0 = first player, 1 = second.
function turnIndex() { return game.active === game.first ? 0 : 1; }

// 10th edition: both players gain 1CP at the start of every Command phase.
function grantCommandCp() {
  var key = game.round + "-" + turnIndex();
  if (game.phase !== 0 || game.cpGranted.indexOf(key) >= 0) return false;
  game.cpGranted.push(key);
  game.p[1].cp += 1;
  game.p[2].cp += 1;
  return true;
}

function nextPhase() {
  if (game.over) return;
  if (game.phase < PHASES.length - 1) {
    game.phase += 1;
  } else if (turnIndex() === 0) {
    game.active = other(game.active);
    game.phase = 0;
  } else if (game.round < ROUNDS) {
    game.round += 1;
    game.active = game.first;
    game.phase = 0;
  } else {
    game.over = true;
    save();
    render();
    return;
  }
  if (grantCommandCp()) toast("Command phase: +1 CP each");
  save();
  render();
}

// Hold NEXT to step back (CP already granted stays granted).
function prevPhase() {
  if (game.over) { game.over = false; }
  else if (game.phase > 0) game.phase -= 1;
  else if (turnIndex() === 1) { game.active = game.first; game.phase = PHASES.length - 1; }
  else if (game.round > 1) { game.round -= 1; game.active = other(game.first); game.phase = PHASES.length - 1; }
  else return;
  toast("Back to " + PHASES[game.phase]);
  save();
  render();
}

function other(p) { return p === 1 ? 2 : 1; }

function bump(p, key, delta) {
  var s = game.p[p];
  var before = s[key];
  s[key] = Math.max(0, Math.min(CAPS[key], s[key] + delta));
  if (s[key] === before) {
    if (delta > 0 && key !== "cp") toast(capName(key) + " is capped at " + CAPS[key]);
    return;
  }
  save();
  render();
  pulse(p, key);
}

function capName(key) { return key.charAt(0).toUpperCase() + key.slice(1); }

function total(p) {
  var s = game.p[p];
  return Math.min(100, s.primary + s.secondary + (s.ready ? 10 : 0));
}

// ---- Render ----------------------------------------------------------------

function render() {
  if (!game) return;
  var frame = $("frame");
  frame.dataset.active = game.active;
  frame.dataset.over = game.over ? "yes" : "no";
  [1, 2].forEach(function (p) {
    var side = $("side" + p);
    var s = game.p[p];
    field(side, "primary").textContent = s.primary;
    field(side, "secondary").textContent = s.secondary;
    field(side, "cp").textContent = s.cp;
    field(side, "total").textContent = total(p);
    side.querySelector(".ready").classList.toggle("on", s.ready);
  });
  Array.prototype.forEach.call($("pips").children, function (pip, i) {
    pip.className = i + 1 < game.round ? "done" : i + 1 === game.round ? "now" : "";
  });
  $("turn").textContent = game.over ? "Game over" : cfg.names[game.active] + "'s turn";
  $("turn").style.setProperty("--army", cfg.colors[game.active]);
  Array.prototype.forEach.call($("phases").children, function (li, i) {
    li.className = game.over ? "done" : i < game.phase ? "done" : i === game.phase ? "now" : "";
  });
  var last = game.round === ROUNDS && turnIndex() === 1 && game.phase === PHASES.length - 1;
  $("nextBtn").textContent = game.over ? "Final" : last ? "End game" : game.phase === PHASES.length - 1 ? "End turn" : "Next phase";
  var banner = $("banner");
  if (game.over) {
    var a = total(1), b = total(2);
    banner.textContent = a === b ? "Draw, " + a + " to " + b : cfg.names[a > b ? 1 : 2] + " wins, " + Math.max(a, b) + " to " + Math.min(a, b);
    banner.classList.add("show");
  } else {
    banner.classList.remove("show");
  }
}

function pulse(p, key) {
  var el = field($("side" + p), key);
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1800);
}

// ---- Wiring ----------------------------------------------------------------

[1, 2].forEach(function (p) {
  var side = $("side" + p);
  Array.prototype.forEach.call(side.querySelectorAll(".stat"), function (btn) {
    var key = btn.dataset.k;
    Edge.press(btn, function () { bump(p, key, 1); }, function () { bump(p, key, -1); });
  });
  Edge.press(side.querySelector(".ready"), function () {
    game.p[p].ready = !game.p[p].ready;
    toast(cfg.names[p] + (game.p[p].ready ? ": Battle Ready +10" : ": Battle Ready off"));
    save();
    render();
  });
  // Before anything happens, tap a name to choose who goes first.
  Edge.press(side.querySelector(".side__head"), function () {
    if (game.round === 1 && game.phase === 0 && turnIndex() === 0 && game.first !== p) {
      game.first = p;
      game.active = p;
      save();
      render();
      toast(cfg.names[p] + " goes first");
    }
  });
});

Edge.press($("nextBtn"), nextPhase, prevPhase);
Edge.hold($("newBtn"), function () {
  game = freshGame(game ? game.first : 1);
  grantCommandCp();
  save();
  render();
  toast("New game. " + cfg.names[game.first] + " goes first");
});
