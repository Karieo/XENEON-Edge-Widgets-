/* HEROES DRAFT — matchup win rate + top talent builds from your Heroes Tracker backend. */

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var state = loadLocal();
var heroes = []; // [{name, role}], from /api/edge/heroes
var poll = { heroesTimer: null, matchupInFlight: false };

var LEVELS = [1, 4, 7, 10, 13, 16, 20];

// ---- Settings --------------------------------------------------------------

function onIcueDataUpdated() {
  var prevUrl = cfg.backendUrl;
  var prevType = cfg.gameType;
  cfg = {
    backendUrl: String(Edge.prop("backendUrl", "")).trim().replace(/\/+$/, ""),
    gameType: state.gameType || String(Edge.prop("gameType", "Storm League")),
    textColor: Edge.prop("textColor", "#eef2f7"),
    accentColor: Edge.prop("accentColor", "#e8b04b"),
    backgroundColor: Edge.prop("backgroundColor", "#0d1117"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));

  $("modeBtn").textContent = cfg.gameType.toUpperCase();

  if (prevUrl !== cfg.backendUrl) {
    heroes = [];
    fetchHeroes();
  } else if (!heroes.length) {
    fetchHeroes();
  }
  if (prevType !== cfg.gameType) fetchMatchup();

  renderPickers();
}

// ---- Local state (hero selection, saved per widget) ------------------------

function loadLocal() {
  var s = Edge.store.load();
  return { myIndex: s.myIndex || 0, enemyIndex: s.enemyIndex || 0, gameType: s.gameType || null };
}

function saveLocal() {
  Edge.store.save(state);
}

// ---- Backend fetch -----------------------------------------------------

function backendFetch(path) {
  return fetch(cfg.backendUrl + path, { cache: "no-store" }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function setTag(text, state2) {
  var tag = $("linkTag");
  tag.textContent = text;
  tag.dataset.state = state2;
}

function fetchHeroes() {
  if (!cfg.backendUrl) {
    setTag("NO LINK", "off");
    $("matchupEmpty").hidden = false;
    $("matchupEmpty").textContent = "> SET BACKEND URL IN SETTINGS";
    return;
  }
  backendFetch("/api/edge/heroes").then(function (data) {
    var list = (data && data.heroes) || [];
    if (!list.length) {
      setTag("EMPTY", "off");
      return;
    }
    heroes = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    state.myIndex = Math.min(state.myIndex, heroes.length - 1);
    state.enemyIndex = Math.min(state.enemyIndex, heroes.length - 1);
    setTag("LIVE", "on");
    renderPickers();
    fetchMatchup();
  }).catch(function () {
    setTag("OFFLINE", "off");
  });
  clearTimeout(poll.heroesTimer);
  poll.heroesTimer = setTimeout(fetchHeroes, 5 * 60 * 1000);
}

function currentHero(index) {
  return heroes.length ? heroes[((index % heroes.length) + heroes.length) % heroes.length].name : null;
}

function renderPickers() {
  $("myName").textContent = currentHero(state.myIndex) || "—";
  $("enemyName").textContent = currentHero(state.enemyIndex) || "—";
}

function fetchMatchup() {
  var hero = currentHero(state.myIndex);
  var enemy = currentHero(state.enemyIndex);
  $("buildsHero").textContent = hero || "—";
  if (!hero || !enemy || !cfg.backendUrl || poll.matchupInFlight) return;
  poll.matchupInFlight = true;

  var qs = "?hero=" + encodeURIComponent(hero) + "&enemy=" + encodeURIComponent(enemy) +
    "&game_type=" + encodeURIComponent(cfg.gameType);

  backendFetch("/api/edge/matchup" + qs).then(function (data) {
    renderMatchup(data);
    setTag("LIVE", "on");
  }).catch(function () {
    setTag("OFFLINE", "off");
  }).then(function () {
    poll.matchupInFlight = false;
  });
}

function renderMatchup(data) {
  var m = data && data.matchup;
  var empty = $("matchupEmpty");
  if (m && m.win_rate != null) {
    $("matchupWr").textContent = m.win_rate.toFixed(1) + "%";
    $("matchupGames").textContent = (m.games_played || 0) + " games";
    empty.hidden = true;
  } else {
    $("matchupWr").textContent = "—";
    $("matchupGames").textContent = "";
    empty.hidden = false;
    empty.textContent = "> NO CACHED DATA FOR THIS PAIRING YET";
  }

  var list = $("buildsList");
  list.innerHTML = "";
  var builds = (data && data.top_builds) || [];
  builds.forEach(function (b) {
    var li = document.createElement("li");
    li.className = "build";
    var talents = (b.build || []).map(function (t, i) {
      return "<span class='build__t'><b>" + LEVELS[i] + "</b>" + esc(t || "—") + "</span>";
    }).join("");
    li.innerHTML =
      "<div class='build__head'><span>" + (b.win_rate != null ? b.win_rate.toFixed(1) + "%" : "—") +
      "</span><span>" + (b.games_played || 0) + " games</span></div>" +
      "<div class='build__talents'>" + talents + "</div>";
    list.appendChild(li);
  });
  if (!builds.length) {
    list.innerHTML = "<li class='build build--empty'>&gt; NO BUILDS CACHED YET</li>";
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// ---- Controls ---------------------------------------------------------

Edge.press($("myPrev"), function () { state.myIndex--; saveLocal(); renderPickers(); fetchMatchup(); });
Edge.press($("myNext"), function () { state.myIndex++; saveLocal(); renderPickers(); fetchMatchup(); });
Edge.press($("enemyPrev"), function () { state.enemyIndex--; saveLocal(); renderPickers(); fetchMatchup(); });
Edge.press($("enemyNext"), function () { state.enemyIndex++; saveLocal(); renderPickers(); fetchMatchup(); });

Edge.press($("modeBtn"), function () {
  var next = cfg.gameType === "Storm League" ? "Quick Match" : "Storm League";
  cfg.gameType = next;
  state.gameType = next;
  saveLocal();
  $("modeBtn").textContent = next.toUpperCase();
  fetchMatchup();
});

Edge.store.onExternalChange(function () {
  state = loadLocal();
  if (state.gameType) cfg.gameType = state.gameType;
  $("modeBtn").textContent = cfg.gameType.toUpperCase();
  renderPickers();
});
