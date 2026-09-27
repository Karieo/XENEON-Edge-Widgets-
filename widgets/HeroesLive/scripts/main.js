/* HEROES LIVE — in-game quick reference: your hero's best build + personal record. */

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var state = loadLocal();
var heroes = [];
var poll = { heroesTimer: null, refTimer: null, inFlight: false };

var LEVELS = [1, 4, 7, 10, 13, 16, 20];

function onIcueDataUpdated() {
  var prevUrl = cfg.backendUrl;
  cfg = {
    backendUrl: String(Edge.prop("backendUrl", "")).trim().replace(/\/+$/, ""),
    gameType: state.gameType || String(Edge.prop("gameType", "Storm League")),
    textColor: Edge.prop("textColor", "#eef2f7"),
    accentColor: Edge.prop("accentColor", "#3ad6c8"),
    backgroundColor: Edge.prop("backgroundColor", "#0d1117"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));

  $("modeBtn").textContent = cfg.gameType.toUpperCase();

  if (prevUrl !== cfg.backendUrl || !heroes.length) fetchHeroes();
  renderPicker();
}

function loadLocal() {
  var s = Edge.store.load();
  return { myIndex: s.myIndex || 0, gameType: s.gameType || null };
}

function saveLocal() {
  Edge.store.save(state);
}

function backendFetch(path) {
  return fetch(cfg.backendUrl + path, { cache: "no-store" }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function setTag(text, s) {
  var tag = $("linkTag");
  tag.textContent = text;
  tag.dataset.state = s;
}

function fetchHeroes() {
  clearTimeout(poll.heroesTimer);
  if (!cfg.backendUrl) {
    setTag("NO LINK", "off");
    $("buildEmpty").hidden = false;
    return;
  }
  backendFetch("/api/edge/heroes").then(function (data) {
    var list = (data && data.heroes) || [];
    if (!list.length) { setTag("EMPTY", "off"); return; }
    heroes = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    state.myIndex = Math.min(state.myIndex, heroes.length - 1);
    setTag("LIVE", "on");
    renderPicker();
    fetchReference();
  }).catch(function () { setTag("OFFLINE", "off"); });
  poll.heroesTimer = setTimeout(fetchHeroes, 5 * 60 * 1000);
}

function currentHero() {
  return heroes.length ? heroes[((state.myIndex % heroes.length) + heroes.length) % heroes.length].name : null;
}

function renderPicker() {
  $("myName").textContent = currentHero() || "—";
}

function fetchReference() {
  var hero = currentHero();
  if (!hero || !cfg.backendUrl || poll.inFlight) return;
  poll.inFlight = true;
  var qs = "?hero=" + encodeURIComponent(hero) + "&game_type=" + encodeURIComponent(cfg.gameType);
  backendFetch("/api/edge/hero-reference" + qs).then(function (data) {
    renderReference(data);
    setTag("LIVE", "on");
  }).catch(function () {
    setTag("OFFLINE", "off");
  }).then(function () {
    poll.inFlight = false;
  });
}

function renderReference(data) {
  var personal = (data && data.personal) || {};
  $("personalGames").textContent = personal.games_played != null ? personal.games_played : "—";
  $("personalWr").textContent = personal.win_rate != null ? personal.win_rate.toFixed(1) + "%" : "—";

  var builds = (data && data.top_builds) || [];
  var best = builds[0];
  var line = $("talentLine");
  var empty = $("buildEmpty");
  line.innerHTML = "";

  if (best) {
    $("buildWr").textContent = "· " + (best.win_rate != null ? best.win_rate.toFixed(1) + "%" : "—") +
      " (" + (best.games_played || 0) + " games)";
    (best.build || []).forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = "talent";
      li.innerHTML = "<span class='talent__lvl'>" + LEVELS[i] + "</span><span class='talent__name'>" + esc(t || "—") + "</span>";
      line.appendChild(li);
    });
    empty.hidden = true;
  } else {
    $("buildWr").textContent = "";
    empty.hidden = false;
    empty.textContent = "> NO BUILD CACHED YET FOR " + hero_or_dash();
  }
}

function hero_or_dash() {
  return currentHero() || "THIS HERO";
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

Edge.press($("myPrev"), function () { state.myIndex--; saveLocal(); renderPicker(); fetchReference(); });
Edge.press($("myNext"), function () { state.myIndex++; saveLocal(); renderPicker(); fetchReference(); });

Edge.press($("modeBtn"), function () {
  var next = cfg.gameType === "Storm League" ? "Quick Match" : "Storm League";
  cfg.gameType = next;
  state.gameType = next;
  saveLocal();
  $("modeBtn").textContent = next.toUpperCase();
  fetchReference();
});

Edge.store.onExternalChange(function () {
  state = loadLocal();
  if (state.gameType) cfg.gameType = state.gameType;
  $("modeBtn").textContent = cfg.gameType.toUpperCase();
  renderPicker();
});
