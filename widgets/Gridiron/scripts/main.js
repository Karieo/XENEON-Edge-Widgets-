/* GRIDIRON — NFL Sunday on the Edge. Scores from ESPN's public scoreboard
   (scripts/espn.js). Games that don't fit rotate in pages; the side panel
   shows scoring plays while games are live and division standings otherwise. */

var POLL_LIVE = 20000;
var POLL_NEAR = 60000; // a kickoff within 30 min
var POLL_TODAY = 5 * 60000;
var POLL_IDLE = 15 * 60000;
var NEAR_MS = 30 * 60000;
var STAND_MS = 6 * 3600000;
var PAGE_MS = 12000;
var PEEK_MS = 20000; // standings stay up this long after a tap on live days
var TOAST_MS = 6000;
var FEED_MAX = 8;
var DIV_ORDER = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

var $ = function (id) { return document.getElementById(id); };
var cfg = null;
var board = null; // last good scoreboard
var boardAt = 0;
var table = null; // last good standings
var tableAt = 0;
var lastError = "";
var pollTimer = null;
var ui = null;

// ---- Settings ------------------------------------------------------------------

function onIcueDataUpdated() {
  var first = !cfg;
  cfg = {
    fav: String(Edge.prop("favoriteTeam", "") || "").replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3),
    redZone: String(Edge.prop("redZone", true)) !== "false",
  };
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  $("frame").dataset.rz = cfg.redZone ? "on" : "off";
  if (first) {
    var s = Edge.store.load();
    ui = {
      div: typeof s.div === "string" ? s.div : null,
      feed: Array.isArray(s.feed) ? s.feed.filter(function (p) { return Date.now() - p.t < 12 * 3600000; }) : [],
      page: 0,
      peekUntil: 0,
      prev: null, // { gameId: { h, a, rz } } from the last poll
    };
    if (s.board) { board = s.board; boardAt = s.at || 0; }
    if (s.table) { table = s.table; tableAt = s.tableAt || 0; }
    Edge.press($("standPanel"), nextDivision);
    Edge.press($("feedPanel"), peekStandings);
    Edge.press($("games"), nextPage);
    setInterval(turnPage, PAGE_MS);
    setInterval(renderSource, 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    window.addEventListener("resize", function () { renderGames(); });
    render();
    poll();
  } else {
    render();
  }
}

function persist() {
  Edge.store.save({ div: ui.div, feed: ui.feed, board: board, at: boardAt, table: table, tableAt: tableAt });
}

// ---- Polling ---------------------------------------------------------------------

function poll() {
  clearTimeout(pollTimer);
  var wantTable = !table || Date.now() - tableAt > STAND_MS;
  Espn.scoreboard()
    .then(function (b) {
      detectChanges(b);
      board = b;
      boardAt = Date.now();
      lastError = "";
    })
    .catch(function (e) {
      var msg = e && e.name === "AbortError" ? "not answering" : (e && e.message) || "unreachable";
      lastError = /Failed to fetch|NetworkError|Load failed/i.test(msg) ? "Can't reach ESPN" : "ESPN: " + msg;
    })
    .then(function () {
      if (!wantTable) return;
      return Espn.standings().then(function (t) {
        if (t && t.length) { table = sortDivisions(t); tableAt = Date.now(); }
      }, function () { /* keep the old table; the scoreboard error line covers outages */ });
    })
    .then(function () {
      persist();
      render();
      pollTimer = setTimeout(poll, nextDelay());
    });
}

function nextDelay() {
  var games = board ? board.games : [];
  if (games.some(function (g) { return g.state === "in"; })) return POLL_LIVE;
  var now = Date.now();
  var pre = games.filter(function (g) { return g.state === "pre" && g.start; });
  if (pre.some(function (g) { return g.start - now < NEAR_MS; })) return POLL_NEAR;
  if (pre.some(function (g) { return g.start - now < 12 * 3600000; })) return POLL_TODAY;
  return POLL_IDLE;
}

function sortDivisions(t) {
  return t.slice().sort(function (a, b) {
    var ia = DIV_ORDER.indexOf(a.name), ib = DIV_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a.name < b.name ? -1 : 1);
  });
}

// ---- Scoring plays and red-zone alerts --------------------------------------------

function kindOf(pts) {
  if (pts >= 6) return "Touchdown";
  if (pts === 3) return "Field goal";
  if (pts === 2) return "2 points";
  if (pts === 1) return "Extra point";
  return pts + " points";
}

function detectChanges(b) {
  var prev = ui.prev;
  var next = {};
  var toasts = [];
  b.games.forEach(function (g) {
    var cur = { h: g.home.score, a: g.away.score, rz: g.redZone };
    next[g.id] = cur;
    var p = prev && prev[g.id];
    if (!p || g.state === "pre") return; // first sight of a game: nothing to compare
    [["a", g.away], ["h", g.home]].forEach(function (s) {
      var d = (cur[s[0]] || 0) - (p[s[0]] || 0);
      if (d <= 0) return;
      var line = g.away.abbr + " " + (g.away.score || 0) + "-" + (g.home.score || 0) + " " + g.home.abbr;
      var play = { t: Date.now(), abbr: s[1].abbr, color: s[1].color, kind: kindOf(d), line: line, pts: d };
      ui.feed.unshift(play);
      if (d >= 2) toasts.push({ cls: d >= 6 ? "td" : "score", color: s[1].color, text: s[1].abbr + " " + play.kind.toLowerCase(), sub: line });
    });
    if (cfg.redZone && g.redZone && !p.rz && g.state === "in") {
      var who = g.possession === "home" ? g.home : g.possession === "away" ? g.away : null;
      toasts.push({ cls: "rz", color: "#e3262e", text: "Red zone" + (who ? " · " + who.abbr : ""), sub: [g.down, g.spot].filter(Boolean).join(" at ") || g.away.abbr + " at " + g.home.abbr });
    }
  });
  ui.feed = ui.feed.slice(0, FEED_MAX);
  ui.prev = next;
  toasts.forEach(showToast);
}

var toastQueue = [];
var toastBusy = false;

function showToast(t) {
  toastQueue.push(t);
  if (!toastBusy) drainToasts();
}

function drainToasts() {
  var t = toastQueue.shift();
  var el = $("toast");
  if (!t) { toastBusy = false; el.classList.remove("show"); return; }
  toastBusy = true;
  el.className = "toast " + t.cls;
  el.style.setProperty("--team", t.color || "#888");
  el.innerHTML = "<b></b><span></span>";
  el.querySelector("b").textContent = t.text;
  el.querySelector("span").textContent = t.sub || "";
  void el.offsetWidth; // restart the slide-in
  el.classList.add("show");
  setTimeout(drainToasts, toastQueue.length ? TOAST_MS / 2 : TOAST_MS);
}

// ---- Render ----------------------------------------------------------------------

function ordered() {
  if (!board) return [];
  var rank = function (g) {
    if (cfg.fav && (g.home.abbr === cfg.fav || g.away.abbr === cfg.fav)) return 0;
    if (g.state === "in") return cfg.redZone && g.redZone ? 1 : 2;
    if (g.state === "pre") return 3;
    return 4;
  };
  return board.games.slice().sort(function (a, b) {
    var d = rank(a) - rank(b);
    if (d) return d;
    if (a.state === "post" && b.state === "post") return b.start - a.start; // newest finals first
    return (a.start || 0) - (b.start || 0);
  });
}

function render() {
  renderHeader();
  renderGames();
  renderSide();
  renderSource();
}

function renderHeader() {
  var wk = "NFL";
  if (board && board.week) {
    wk = board.seasonType === 1 ? "Preseason Wk " + board.week : board.seasonType === 3 ? playoffRound(board.week) : "Week " + board.week;
  }
  $("week").textContent = wk;
  var g = board ? board.games : [];
  var n = function (st) { return g.filter(function (x) { return x.state === st; }).length; };
  var parts = [];
  if (n("in")) parts.push(n("in") + " live");
  if (n("pre")) parts.push(n("pre") + " upcoming");
  if (n("post")) parts.push(n("post") + " final");
  $("counts").textContent = parts.join(" · ");
}

function playoffRound(w) {
  return ["Wild Card", "Divisional", "Conference", "Pro Bowl", "Super Bowl"][w - 1] || "Playoffs";
}

function capacity() {
  var cs = getComputedStyle($("games"));
  var c = parseInt(cs.getPropertyValue("--cols"), 10) || 1;
  var r = parseInt(cs.getPropertyValue("--rows"), 10) || 1;
  return c * r;
}

function renderGames() {
  var el = $("games");
  var games = ordered();
  var per = capacity();
  var pages = Math.max(1, Math.ceil(games.length / per));
  if (ui.page >= pages) ui.page = 0;
  el.innerHTML = "";
  el.dataset.pages = pages;
  if (!games.length) {
    var e = document.createElement("div");
    e.className = "games__empty";
    e.textContent = board ? "No games on the schedule this week" : lastError || "Loading the slate…";
    el.appendChild(e);
  }
  games.slice(ui.page * per, ui.page * per + per).forEach(function (g) { el.appendChild(tile(g)); });
  var dots = $("pages");
  dots.innerHTML = "";
  if (pages > 1) for (var i = 0; i < pages; i++) {
    var d = document.createElement("i");
    if (i === ui.page) d.className = "on";
    dots.appendChild(d);
  }
}

function nextPage() {
  var pages = Number($("games").dataset.pages) || 1;
  if (pages < 2) return;
  ui.page = (ui.page + 1) % pages;
  ui.pagedAt = Date.now();
  renderGames();
}

function turnPage() {
  // Hold the page for a while after a tap so it doesn't jump out from under you.
  if (ui.pagedAt && Date.now() - ui.pagedAt < PAGE_MS * 2) return;
  var pages = Number($("games").dataset.pages) || 1;
  if (pages < 2) return;
  ui.page = (ui.page + 1) % pages;
  renderGames();
}

function tile(g) {
  var t = document.createElement("div");
  var fav = cfg.fav && (g.home.abbr === cfg.fav || g.away.abbr === cfg.fav);
  t.className = "game " + g.state + (fav ? " fav" : "") + (g.state === "in" && g.redZone ? " rz" : "");
  t.innerHTML =
    '<div class="game__row away"></div><div class="game__row home"></div>' +
    '<div class="game__foot"><span class="game__status"></span><span class="game__sit"></span></div>';
  fillRow(t.querySelector(".away"), g, g.away, "away");
  fillRow(t.querySelector(".home"), g, g.home, "home");
  t.querySelector(".game__status").textContent = statusText(g);
  var sit = "";
  if (g.state === "in") sit = [g.down, g.spot].filter(Boolean).join(" at ");
  else if (g.state === "pre") sit = g.network;
  t.querySelector(".game__sit").textContent = sit;
  if (g.state === "in" && g.redZone) t.querySelector(".game__foot").insertAdjacentHTML("afterbegin", '<b class="rzTag">RED ZONE</b>');
  return t;
}

function fillRow(row, g, s, which) {
  row.style.setProperty("--team", s.color);
  row.style.setProperty("--alt", s.alt);
  if (g.state === "post" && !s.winner && (g.home.winner || g.away.winner)) row.classList.add("lost");
  if (g.possession === which && g.state === "in") row.classList.add("ball");
  row.innerHTML = '<i class="chip"></i><span class="abbr"></span><span class="rec"></span><span class="poss"></span><span class="score"></span>';
  row.querySelector(".abbr").textContent = s.abbr;
  row.querySelector(".rec").textContent = s.record || "";
  row.querySelector(".score").textContent = g.state === "pre" || s.score == null ? "" : s.score;
}

function statusText(g) {
  if (g.state === "pre") return kickoff(g.start);
  if (g.state === "post") return g.detail && /final/i.test(g.detail) ? g.detail : "Final";
  if (/half/i.test(g.detail)) return "Halftime";
  if (/end of/i.test(g.detail)) return g.detail.replace(/ quarter/i, "").replace(/(\d)(st|nd|rd|th)/, "Q$1");
  var q = g.period > 4 ? (g.period > 5 ? g.period - 4 + "OT" : "OT") : "Q" + (g.period || 1);
  return q + (g.clock ? " " + g.clock : "");
}

function kickoff(t) {
  if (!t) return "TBD";
  var d = new Date(t);
  var h = d.getHours(), m = d.getMinutes();
  var time = (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "AM" : "PM");
  var today = new Date();
  var same = d.toDateString() === today.toDateString();
  return (same ? "" : DAYS[d.getDay()] + " ") + time;
}

// ---- Side panel -------------------------------------------------------------------

function renderSide() {
  var live = board && board.games.some(function (g) { return g.state === "in"; });
  var showFeed = live && Date.now() > ui.peekUntil;
  $("frame").dataset.side = showFeed ? "feed" : "standings";
  renderFeed();
  renderStandings();
}

function renderFeed() {
  var ol = $("plays");
  ol.innerHTML = "";
  if (!ui.feed.length) {
    ol.innerHTML = '<li class="plays__none">Scoring plays show up here as they happen</li>';
    return;
  }
  ui.feed.forEach(function (p) {
    var li = document.createElement("li");
    li.className = "play" + (p.pts >= 6 ? " td" : "");
    li.style.setProperty("--team", p.color || "#888");
    li.innerHTML = '<i class="chip"></i><b></b><span class="play__kind"></span><span class="play__line"></span>';
    li.querySelector("b").textContent = p.abbr;
    li.querySelector(".play__kind").textContent = p.kind;
    li.querySelector(".play__line").textContent = p.line;
    ol.appendChild(li);
  });
}

function currentDivision() {
  if (!table || !table.length) return null;
  var d = ui.div && table.find(function (x) { return x.name === ui.div; });
  if (!d && cfg.fav) d = table.find(function (x) { return x.teams.some(function (t) { return t.abbr === cfg.fav; }); });
  return d || table[0];
}

function renderStandings() {
  var d = currentDivision();
  var ol = $("stand");
  ol.innerHTML = "";
  $("divName").textContent = d ? d.name : "Standings";
  if (!d) {
    ol.innerHTML = '<li class="stand__none">Standings load with the scores</li>';
    return;
  }
  var playing = {};
  (board ? board.games : []).forEach(function (g) {
    if (g.state === "in") { playing[g.home.abbr] = 1; playing[g.away.abbr] = 1; }
  });
  d.teams.forEach(function (t, i) {
    var li = document.createElement("li");
    li.className = "team" + (t.abbr === cfg.fav ? " fav" : "") + (playing[t.abbr] ? " playing" : "");
    li.style.setProperty("--team", t.color);
    li.innerHTML = '<span class="team__pos"></span><i class="chip"></i><span class="team__abbr"></span><span class="team__name"></span><span class="team__rec"></span>';
    li.querySelector(".team__pos").textContent = i + 1;
    li.querySelector(".team__abbr").textContent = t.abbr;
    li.querySelector(".team__name").textContent = t.name;
    li.querySelector(".team__rec").textContent = t.w + "-" + t.l + (t.t ? "-" + t.t : "");
    ol.appendChild(li);
  });
}

function nextDivision() {
  if (!table || !table.length) return;
  var cur = currentDivision();
  var i = table.indexOf(cur);
  ui.div = table[(i + 1) % table.length].name;
  if (ui.peekUntil) ui.peekUntil = Date.now() + PEEK_MS;
  persist();
  renderStandings();
}

function peekStandings() {
  ui.peekUntil = Date.now() + PEEK_MS;
  renderSide();
  setTimeout(renderSide, PEEK_MS + 50);
}

// ---- Source line ------------------------------------------------------------------

function renderSource() {
  var el = $("src");
  if (lastError) {
    el.textContent = lastError + (boardAt ? " · showing " + ago(boardAt) : "");
    el.className = "top__src bad";
    return;
  }
  var live = board && board.games.some(function (g) { return g.state === "in"; });
  el.textContent = board ? (live ? "Live · ESPN" : "ESPN · updated " + ago(boardAt)) : "";
  el.className = "top__src" + (live ? " live" : "");
}

function ago(t) {
  var s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? "just now" : s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago";
}
