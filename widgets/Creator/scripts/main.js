/* CREATOR — YouTube channel stats via the YouTube Data API v3. */

var API = "https://www.googleapis.com/youtube/v3/";
var DAYS_SHOWN = 14;
var DAYS_KEPT = 40;
var MIN_REFETCH_MS = 2 * 60 * 1000; // don't hammer the API on quick restarts
var RECENT = 4;

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var store = Edge.store.load();
var timer = null;
var inFlight = false;

// ---- Settings ----------------------------------------------------------------

function onIcueDataUpdated() {
  var prev = cfg.channel + "|" + cfg.apiKey + "|" + cfg.refreshMinutes;
  cfg = {
    channel: String(Edge.prop("channel", "")).trim(),
    apiKey: String(Edge.prop("apiKey", "")).trim(),
    refreshMinutes: Math.max(5, Number(Edge.prop("refreshMinutes", 15))),
    theme: Edge.prop("theme", "light") === "dark" ? "dark" : "light",
    accentColor: Edge.prop("accentColor", "#ff0033"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement;
  root.dataset.theme = cfg.theme;
  root.style.setProperty("--st-red", cfg.accentColor);
  root.style.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));

  if (prev !== cfg.channel + "|" + cfg.apiKey + "|" + cfg.refreshMinutes) start();
  else render();
}

// Accepts "@handle", "handle", a channel ID, or a youtube.com URL.
function channelQuery(input) {
  var s = input.replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  var id = s.match(/(?:^|channel\/)(UC[\w-]{22})$/);
  if (id) return "id=" + id[1];
  var handle = s.replace(/^@/, "");
  return handle ? "forHandle=" + encodeURIComponent("@" + handle) : null;
}

function start() {
  clearInterval(timer);
  if (!cfg.channel || !cfg.apiKey || !channelQuery(cfg.channel)) {
    $("frame").dataset.state = "setup";
    setStatus(!cfg.apiKey && !cfg.channel ? "Set channel + API key in settings"
      : !cfg.apiKey ? "Add a YouTube API key in settings" : "Add a channel in settings");
    render();
    return;
  }
  var fresh = store.cache && store.cache.for === cfg.channel && Date.now() - store.cache.fetchedAt < MIN_REFETCH_MS;
  if (fresh) render(); else refresh();
  timer = setInterval(function () { if (!document.hidden) refresh(); }, cfg.refreshMinutes * 60000);
}

// ---- API ---------------------------------------------------------------------

function api(path) {
  return fetch(API + path + "&key=" + encodeURIComponent(cfg.apiKey), { cache: "no-store" }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok || body.error) {
        var msg = body.error && body.error.message ? body.error.message : "HTTP " + res.status;
        var reason = body.error && body.error.errors && body.error.errors[0] ? body.error.errors[0].reason : "";
        var err = new Error(msg);
        err.reason = reason;
        throw err;
      }
      return body;
    });
  });
}

function refresh() {
  if (inFlight) return;
  inFlight = true;
  setStatus("Updating…");
  var channel;
  api("channels?part=snippet,statistics,contentDetails&" + channelQuery(cfg.channel)).then(function (body) {
    channel = body.items && body.items[0];
    if (!channel) throw new Error("Channel not found: " + cfg.channel);
    var uploads = channel.contentDetails.relatedPlaylists.uploads;
    return api("playlistItems?part=contentDetails&maxResults=" + (RECENT + 1) + "&playlistId=" + uploads);
  }).then(function (body) {
    var ids = (body.items || []).map(function (it) { return it.contentDetails.videoId; });
    if (!ids.length) return { items: [] };
    return api("videos?part=snippet,statistics&id=" + ids.join(","));
  }).then(function (body) {
    var videos = (body.items || []).map(function (v) {
      var th = v.snippet.thumbnails || {};
      return {
        id: v.id,
        title: v.snippet.title,
        published: v.snippet.publishedAt,
        thumb: (th.maxres || th.high || th.medium || th.default || {}).url || "",
        views: Number(v.statistics.viewCount || 0),
        likes: v.statistics.likeCount != null ? Number(v.statistics.likeCount) : null,
        comments: v.statistics.commentCount != null ? Number(v.statistics.commentCount) : null,
      };
    }).sort(function (a, b) { return b.published.localeCompare(a.published); });

    var st = channel.statistics;
    if (store.cache && store.cache.for !== cfg.channel) { store.days = {}; store.videoSnaps = {}; }
    store.cache = {
      for: cfg.channel,
      fetchedAt: Date.now(),
      id: channel.id,
      title: channel.snippet.title,
      handle: channel.snippet.customUrl || "",
      avatar: ((channel.snippet.thumbnails || {}).medium || (channel.snippet.thumbnails || {}).default || {}).url || "",
      subs: st.hiddenSubscriberCount ? null : Number(st.subscriberCount),
      views: Number(st.viewCount),
      videoCount: Number(st.videoCount),
      videos: videos,
    };
    snapshot(store.cache);
    Edge.store.save(store);
    $("frame").dataset.state = "ok";
    setStatus("Updated " + clock(store.cache.fetchedAt));
    render();
  }).catch(function (err) {
    // Keep the last good numbers on screen and say what went wrong.
    $("frame").dataset.state = store.cache ? "stale" : "error";
    var why = err.reason === "quotaExceeded" ? "Daily API quota used up"
      : /API key not valid/i.test(err.message) ? "API key not valid"
      : err.message || "Network error";
    setStatus(why + (store.cache ? " · showing " + clock(store.cache.fetchedAt) : ""));
    render();
  }).then(function () {
    inFlight = false;
  });
}

// ---- History (saved per PC) --------------------------------------------------

function dayKey(t) {
  var d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function pad(n) { return String(n).padStart(2, "0"); }

// One {subs, views} reading per day (the latest), plus per-video view counts.
function snapshot(c) {
  var today = dayKey(c.fetchedAt);
  store.days = store.days || {};
  store.days[today] = { subs: c.subs, views: c.views };
  var keys = Object.keys(store.days).sort();
  keys.slice(0, Math.max(0, keys.length - DAYS_KEPT)).forEach(function (k) { delete store.days[k]; });

  store.videoSnaps = store.videoSnaps || {};
  var keep = {};
  c.videos.forEach(function (v) {
    var snaps = store.videoSnaps[v.id] || {};
    snaps[today] = v.views;
    keep[v.id] = snaps;
  });
  store.videoSnaps = keep;
}

// The closest reading from before today (null if none).
function priorDay(days, today) {
  var keys = Object.keys(days).filter(function (k) { return k < today; }).sort();
  return keys.length ? days[keys[keys.length - 1]] : null;
}

function dayOffset(key, n) {
  var d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

// ---- Render ------------------------------------------------------------------

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (Math.abs(n) >= 1e5) return Math.round(n / 1e3) + "K";
  return n.toLocaleString("en-US");
}

function signed(n) {
  return n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n));
}

function chip(el, label, n) {
  el.textContent = label + " " + signed(n);
  el.classList.toggle("up", n > 0);
  el.classList.toggle("down", n < 0);
}

function ago(iso) {
  var s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " hr ago";
  var d = Math.round(s / 86400);
  if (d < 14) return d + (d === 1 ? " day ago" : " days ago");
  if (d < 60) return Math.round(d / 7) + " weeks ago";
  return Math.round(d / 30) + " months ago";
}

function clock(t) {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function setStatus(text) { $("status").textContent = text; }

function render() {
  var c = store.cache && store.cache.for === cfg.channel ? store.cache : null;
  if (!c) { renderDaily(null); return; }

  $("avatar").src = c.avatar;
  $("chanName").textContent = c.title;
  $("chanHandle").textContent = c.handle;
  $("subs").textContent = c.subs == null ? "Hidden" : fmt(c.subs);
  $("views").textContent = fmt(c.views);
  $("videoCount").textContent = fmt(c.videoCount);

  var today = dayKey(Date.now());
  var days = store.days || {};
  var prior = priorDay(days, today);
  var weekAgo = (function () {
    for (var i = 7; i >= 1; i--) { var d = days[dayOffset(today, -i)]; if (d) return d; }
    return null;
  })();
  chip($("subsToday"), "today", prior && c.subs != null && prior.subs != null ? c.subs - prior.subs : null);
  chip($("subs7"), "7d", weekAgo && c.subs != null && weekAgo.subs != null ? c.subs - weekAgo.subs : null);
  $("viewsToday").textContent = prior ? signed(c.views - prior.views) : "—";

  renderDaily(days);

  var v = c.videos[0];
  $("latest").hidden = !v;
  if (v) {
    $("latestThumb").src = v.thumb;
    $("latestTitle").textContent = v.title;
    $("latestAge").textContent = ago(v.published);
    $("latestViews").textContent = fmt(v.views);
    $("latestLikes").textContent = v.likes == null ? "hidden" : fmt(v.likes);
    $("latestComments").textContent = v.comments == null ? "off" : fmt(v.comments);
    var snaps = (store.videoSnaps || {})[v.id] || {};
    var before = priorDay(snaps, today);
    chip($("latestDelta"), "since yesterday", before != null ? v.views - before : null);
  }

  var list = c.videos.slice(v ? 1 : 0, (v ? 1 : 0) + RECENT);
  var max = Math.max.apply(null, list.map(function (x) { return x.views; }).concat([1]));
  $("recent").innerHTML = "";
  list.forEach(function (x) {
    var li = document.createElement("li");
    li.innerHTML = '<img alt="" /><div class="rv"><div class="rv__title"></div>' +
      '<div class="rv__bar"><i></i></div><div class="rv__meta"></div></div>';
    li.querySelector("img").src = x.thumb;
    li.querySelector(".rv__title").textContent = x.title;
    li.querySelector(".rv__bar i").style.width = (x.views / max * 100).toFixed(1) + "%";
    li.querySelector(".rv__meta").textContent = fmt(x.views) + " views · " + ago(x.published);
    Edge.press(li, function () { Edge.openLink("https://www.youtube.com/watch?v=" + x.id); });
    $("recent").appendChild(li);
  });
}

// Views gained per day, from consecutive daily readings.
function renderDaily(days) {
  var today = dayKey(Date.now());
  var gains = [];
  for (var i = DAYS_SHOWN - 1; i >= 0; i--) {
    var k = dayOffset(today, -i);
    var cur = days && days[k];
    var prev = days ? priorDay(days, k) : null;
    gains.push(cur && prev ? { key: k, n: Math.max(0, cur.views - prev.views) } : null);
  }
  var max = Math.max.apply(null, gains.map(function (g) { return g ? g.n : 0; }).concat([1]));
  Edge.drawBars($("daily"), gains.map(function (g, i) {
    return g ? { pct: g.n / max * 100, state: i === DAYS_SHOWN - 1 ? "hot" : "normal" } : null;
  }), DAYS_SHOWN);
  var have = gains.filter(Boolean).length;
  $("axisStart").textContent = have < 2 ? "Fills in as daily readings build up" : dayOffset(today, -(DAYS_SHOWN - 1)).slice(5).replace("-", "/");
}

// ---- Taps --------------------------------------------------------------------

Edge.press($("latest"), function () {
  var v = store.cache && store.cache.videos[0];
  if (v) Edge.openLink("https://www.youtube.com/watch?v=" + v.id);
});

Edge.press($("chanCard"), function () {
  if (store.cache) Edge.openLink("https://studio.youtube.com/channel/" + store.cache.id);
});
