/* PIT WALL — F1 on the Edge, drawn from the dashboard's /api/edge feed
   (see docs/f1-edge-feed.md). No URL set: shows PITWALL_SAMPLE. */

var POLL_IDLE = 60000;
var POLL_NEAR = 15000; // within 30 min of a session
var POLL_LIVE = 3000;
var NEAR_MS = 30 * 60000;
var TYRES = { S: "#e8002d", M: "#ffd12e", H: "#f0f0ec", I: "#43b047", W: "#0067ad" };
var FLAGS = {
  green: ["Green flag", "#1db954"], yellow: ["Yellow flag", "#ffd12e"], sc: ["Safety car", "#ffb000"],
  vsc: ["Virtual safety car", "#ffb000"], red: ["Red flag", "#e10600"], chequered: ["Chequered flag", "#ffffff"],
};

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var feed = null; // last good feed
var fetchedAt = 0;
var lastError = "";
var pollTimer = null;
var ui = null; // { view, tab, pinnedView }

// ---- Settings ------------------------------------------------------------------

function onIcueDataUpdated() {
  var prevUrl = cfg.url;
  cfg = {
    url: String(Edge.prop("dashboardUrl", "")).trim(),
    me: String(Edge.prop("myDriver", "")).trim().toUpperCase().slice(0, 3),
    clock24: String(Edge.prop("clock24", false)) === "true",
  };
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  if (!ui) {
    var s = Edge.store.load();
    ui = { view: null, tab: s.tab === "constructors" ? "constructors" : "drivers", cached: s.feed || null, cachedAt: s.at || 0 };
    // Show the last feed right away; a fresh one replaces it in a moment.
    if (ui.cached && cfg.url) { feed = ui.cached; fetchedAt = ui.cachedAt; }
  }
  if (cfg.url !== prevUrl) { lastError = ""; poll(); }
  else render();
}

function feedUrl(u) {
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  return /\/api\//.test(u) ? u : u.replace(/\/+$/, "") + "/api/edge";
}

// ---- Polling ---------------------------------------------------------------------

function poll() {
  clearTimeout(pollTimer);
  if (!cfg.url) {
    feed = PITWALL_SAMPLE;
    fetchedAt = Date.now();
    render();
    return; // sample data doesn't change
  }
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var t = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
  fetch(feedUrl(cfg.url), { cache: "no-store", signal: ctl ? ctl.signal : undefined })
    .then(function (r) {
      if (!r.ok) throw new Error("Dashboard replied " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || typeof data !== "object") throw new Error("Not a PIT WALL feed");
      feed = data;
      fetchedAt = Date.now();
      lastError = "";
      Edge.store.save({ tab: ui.tab, feed: data, at: fetchedAt });
    })
    .catch(function (e) {
      lastError = e && e.name === "AbortError" ? "Dashboard not answering" : (e && e.message) || "Dashboard unreachable";
      if (/Failed to fetch|NetworkError/i.test(lastError)) lastError = "Can't reach dashboard (check URL and CORS)";
    })
    .then(function () {
      clearTimeout(t);
      render();
      pollTimer = setTimeout(poll, nextDelay());
    });
}

function nextDelay() {
  if (document.hidden) return POLL_IDLE;
  if (feed && feed.live) return POLL_LIVE;
  var n = nextSession();
  if (n && Math.abs(n.at - Date.now()) < NEAR_MS) return POLL_NEAR;
  return POLL_IDLE;
}

document.addEventListener("visibilitychange", function () { if (!document.hidden && cfg.url) poll(); });

// ---- Render ----------------------------------------------------------------------

function render() {
  var frame = $("frame");
  var hasLive = !!(feed && feed.live && feed.live.drivers && feed.live.drivers.length);
  // Live timing takes over automatically, unless you picked Weekend by hand.
  if (!hasLive) ui.view = null; // next session starts on the tower again
  var view = hasLive ? (ui.view || "live") : "weekend";
  frame.dataset.view = view;
  frame.dataset.hasLive = hasLive ? "yes" : "no";
  Array.prototype.forEach.call(document.querySelectorAll(".view"), function (b) { b.classList.toggle("on", b.dataset.view === view); });
  renderSource();
  if (!feed) {
    $("empty").textContent = lastError || "Loading…";
    frame.dataset.empty = "yes";
    return;
  }
  frame.dataset.empty = "no";
  if (view === "live") renderLive(feed.live); else renderWeekend();
}

function renderSource() {
  var el = $("src");
  if (!cfg.url) { el.textContent = "Sample data"; el.className = "bar__src warn"; return; }
  if (lastError) {
    el.textContent = lastError + (fetchedAt ? " · showing " + ago(fetchedAt) : "");
    el.className = "bar__src bad";
    return;
  }
  el.textContent = feed && feed.live ? "Live" : "Updated " + ago(fetchedAt);
  el.className = "bar__src" + (feed && feed.live ? " live" : "");
}

function ago(t) {
  var s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? "just now" : s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago";
}

// ---- Live timing -----------------------------------------------------------------

function renderLive(live) {
  $("sessName").textContent = live.session || "Session";
  var lapText = "";
  var frac = 0;
  if (live.totalLaps) {
    lapText = "Lap " + (live.lap || 0) + " / " + live.totalLaps;
    frac = (live.lap || 0) / live.totalLaps;
  } else if (live.remaining) {
    lapText = live.remaining + " left";
  }
  $("sessLap").textContent = lapText;
  $("lapFill").style.width = Math.max(0, Math.min(100, frac * 100)) + "%";
  var f = FLAGS[live.status] || null;
  var flag = $("flag");
  flag.textContent = f ? f[0] : "";
  flag.style.setProperty("--flag", f ? f[1] : "transparent");
  $("frame").dataset.status = live.status || "none";
  var fl = live.drivers.find(function (d) { return d.fastest; });
  $("fastest").innerHTML = fl ? '<span class="purple"></span>Fastest lap <b></b>' : "";
  if (fl) $("fastest").querySelector("b").textContent = fl.code;

  var tower = $("tower");
  tower.innerHTML = "";
  var drivers = live.drivers.slice().sort(function (a, b) { return (a.pos || 99) - (b.pos || 99); });
  tower.dataset.count = drivers.length;
  drivers.forEach(function (d) {
    var row = document.createElement("div");
    row.className = "trow" + (d.out ? " out" : "") + (d.inPit ? " pit" : "") + (cfg.me && d.code === cfg.me ? " me" : "");
    row.style.setProperty("--team", d.color || "#888");
    var gap = d.pos === 1 ? "Leader" : d.interval || d.gap || "";
    row.innerHTML =
      '<span class="trow__pos"></span><i class="trow__team"></i><span class="trow__code"></span>' +
      '<span class="trow__gap"></span>' +
      '<span class="tyre"><i></i><em></em></span>' +
      '<span class="trow__tag"></span>';
    row.querySelector(".trow__pos").textContent = d.pos || "";
    row.querySelector(".trow__code").textContent = d.code || "";
    row.querySelector(".trow__gap").textContent = d.out ? "OUT" : gap;
    var tyre = row.querySelector(".tyre");
    if (d.tyre && !d.out) {
      tyre.style.setProperty("--tyre", TYRES[d.tyre] || "#999");
      tyre.querySelector("i").textContent = d.tyre;
      tyre.querySelector("em").textContent = d.tyreAge != null ? d.tyreAge : "";
    } else {
      tyre.hidden = true;
    }
    row.querySelector(".trow__tag").textContent = d.inPit ? "PIT" : d.fastest ? "FL" : "";
    tower.appendChild(row);
  });
}

// ---- Weekend and standings -------------------------------------------------------

function sessionsOf() {
  var n = feed && feed.next;
  if (!n || !Array.isArray(n.sessions)) return [];
  return n.sessions.map(function (s) { return { name: s.name, at: Date.parse(s.start) }; })
    .filter(function (s) { return !isNaN(s.at); })
    .sort(function (a, b) { return a.at - b.at; });
}

// The next session that hasn't started (or started under 2 h ago and has no live data).
function nextSession() {
  var now = Date.now();
  var list = sessionsOf();
  for (var i = 0; i < list.length; i++) if (list[i].at > now) return list[i];
  return null;
}

function renderWeekend() {
  var n = feed.next || {};
  $("round").textContent = n.round ? "Round " + n.round + (n.season ? " · " + n.season : "") : "";
  $("raceName").textContent = n.name || "No race scheduled";
  $("raceWhere").textContent = [n.circuit, n.country].filter(Boolean).join(" · ");
  renderCountdown();

  var box = $("sessions");
  box.innerHTML = "";
  var next = nextSession();
  sessionsOf().forEach(function (s) {
    var li = document.createElement("li");
    li.className = s.at < Date.now() ? "done" : next && s.at === next.at ? "next" : "";
    li.innerHTML = '<span class="s__name"></span><span class="s__day"></span><span class="s__time"></span>';
    li.querySelector(".s__name").textContent = s.name;
    var d = new Date(s.at);
    li.querySelector(".s__day").textContent = d.toLocaleDateString([], { weekday: "short" });
    li.querySelector(".s__time").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !cfg.clock24 });
    box.appendChild(li);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".ttab"), function (b) { b.classList.toggle("on", b.dataset.tab === ui.tab); });
  var rows = $("rows");
  rows.innerHTML = "";
  var st = feed.standings || {};
  var list = (ui.tab === "constructors" ? st.constructors : st.drivers) || [];
  var top = list.length ? list[0].points || 1 : 1;
  list.forEach(function (r) {
    var li = document.createElement("li");
    var mine = ui.tab === "drivers" && cfg.me && r.code === cfg.me;
    li.className = "srow" + (mine ? " me" : "");
    li.style.setProperty("--team", r.color || "#888");
    li.style.setProperty("--share", Math.max(2, (r.points || 0) / top * 100) + "%");
    li.innerHTML = '<span class="srow__pos"></span><i class="srow__team"></i><span class="srow__name"></span>' +
      '<span class="srow__bar"><i></i></span><span class="srow__pts"></span>';
    li.querySelector(".srow__pos").textContent = r.pos;
    li.querySelector(".srow__name").textContent = ui.tab === "drivers" ? (r.name || r.code) : r.name;
    li.querySelector(".srow__pts").textContent = r.points;
    rows.appendChild(li);
  });
  if (!list.length) rows.innerHTML = '<li class="srow srow--empty">No standings in the feed</li>';
  rows.dataset.tab = ui.tab;
}

function renderCountdown() {
  var next = nextSession();
  if (!next) {
    $("countLabel").textContent = sessionsOf().length ? "Weekend complete" : "";
    $("countClock").textContent = "";
    return;
  }
  var ms = next.at - Date.now();
  var d = Math.floor(ms / 86400000);
  var h = Math.floor(ms / 3600000) % 24;
  var m = Math.floor(ms / 60000) % 60;
  var s = Math.floor(ms / 1000) % 60;
  var pad = function (v) { return String(v).padStart(2, "0"); };
  $("countLabel").textContent = next.name + " in";
  $("countClock").innerHTML = (d ? d + "<small>d</small> " : "") + pad(h) + "<small>h</small> " + pad(m) + "<small>m</small>" +
    (d ? "" : " " + pad(s) + "<small>s</small>");
}

// ---- Wiring ------------------------------------------------------------------------

Array.prototype.forEach.call(document.querySelectorAll(".view"), function (b) {
  Edge.press(b, function () { ui.view = b.dataset.view; render(); });
});
Array.prototype.forEach.call(document.querySelectorAll(".ttab"), function (b) {
  Edge.press(b, function () {
    ui.tab = b.dataset.tab;
    Edge.store.save({ tab: ui.tab, feed: cfg.url ? feed : null, at: fetchedAt });
    render();
  });
});

var shownNext = null;
setInterval(function () {
  if (document.hidden || !feed) return;
  var n = nextSession();
  var key = n ? n.at : 0;
  if (key !== shownNext) { shownNext = key; render(); return; } // a session just started
  if ($("frame").dataset.view === "weekend") renderCountdown();
  renderSource();
}, 1000);
