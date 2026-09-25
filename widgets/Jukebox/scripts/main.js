/* JUKEBOX — now playing on a record, album art, recently played, playlists. */

var POLL_MS = 2000;
var RECENT_MAX = 6;
var ART_CACHE_MAX = 60;
var DEFAULT_LISTS = [
  "Painting | https://music.apple.com/us/browse",
  "D&D Night | https://music.apple.com/us/search?term=dungeons%20and%20dragons%20ambience",
  "", "",
];

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var media = null;
var now = { title: "", artist: "" };
var playing = false; // the Media plugin has no play state, so this is our best guess
var st = null; // { recent: [...], art: { key: {art, album, url} } }
var toastTimer = null;
var jsonpSeq = 0;

// ---- Settings ------------------------------------------------------------------

function onIcueDataUpdated() {
  var inIcue = Edge.inIcue();
  cfg = {
    lists: [1, 2, 3, 4].map(function (i) { return parseList(inIcue ? Edge.prop("playlist" + i, "") : DEFAULT_LISTS[i - 1]); }).filter(Boolean),
    lookupArt: String(Edge.prop("lookupArt", true)) !== "false",
    accent: Edge.prop("accentColor", "#e8475f"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--accent-color", cfg.accent);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  if (!st) {
    var s = Edge.store.load();
    st = { recent: Array.isArray(s.recent) ? s.recent : [], art: s.art || {} };
  }
  renderPlaylists();
  renderRecent();
  renderNow();
}

function parseList(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  var bar = raw.indexOf("|");
  var name = bar >= 0 ? raw.slice(0, bar).trim() : "";
  var url = (bar >= 0 ? raw.slice(bar + 1) : raw).trim();
  if (!url) return null;
  return { name: name || "Playlist", url: url };
}

// ---- Media -------------------------------------------------------------------

Edge.onPlugin("Mediadataprovider", function (plugin) {
  media = plugin;
  poll();
  setInterval(function () { if (!document.hidden) poll(); }, POLL_MS);
});

function poll() {
  if (!media) return;
  Promise.all([
    Edge.request(media, "getSongName").catch(function () { return ""; }),
    Edge.request(media, "getArtist").catch(function () { return ""; }),
  ]).then(function (r) {
    var title = String(r[0] || "").trim();
    var artist = String(r[1] || "").trim();
    if (title === now.title && artist === now.artist) return;
    var had = !!now.title;
    now = { title: title, artist: artist };
    if (title) {
      playing = true; // a new track almost always means music is playing
      remember(title, artist);
      lookupArt(title, artist);
    } else if (had) {
      playing = false;
    }
    renderNow();
  });
}

function control(method, label) {
  if (!media || typeof media[method] !== "function") { toast("Media controls unavailable"); return; }
  try { media[method](); } catch (e) { toast("Media controls unavailable"); return; }
  if (method === "triggerPlayPause") { playing = !playing; renderNow(); }
  else { flashArm(); setTimeout(poll, 700); }
  if (label) toast(label);
}

// ---- Album art (iTunes Search API, no key) -------------------------------------

function artKey(title, artist) { return (artist + "|" + title).toLowerCase(); }

function lookupArt(title, artist) {
  var key = artKey(title, artist);
  if (!cfg.lookupArt || st.art[key]) { renderNow(); return; }
  var term = encodeURIComponent((artist + " " + title).replace(/\(.*?\)|\[.*?\]|feat\..*/gi, " ").trim());
  var url = "https://itunes.apple.com/search?media=music&entity=song&limit=1&term=" + term;
  itunes(url).then(function (res) {
    var hit = res && res.results && res.results[0];
    st.art[key] = hit ? {
      art: String(hit.artworkUrl100 || "").replace(/100x100bb/, "600x600bb"),
      album: hit.collectionName || "",
      url: hit.trackViewUrl || "",
      year: hit.releaseDate ? String(hit.releaseDate).slice(0, 4) : "",
    } : { art: "", album: "" };
    trimArt();
    Edge.store.save(st);
    renderNow();
    renderRecent();
  }).catch(function () { /* keep the plain label; try again next time this song plays */ });
}

// fetch first; if CORS blocks it, fall back to JSONP, which iTunes supports.
function itunes(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("itunes " + r.status);
    return r.json();
  }).catch(function () { return jsonp(url); });
}

function jsonp(url) {
  return new Promise(function (resolve, reject) {
    var name = "__jukeboxCb" + (++jsonpSeq);
    var s = document.createElement("script");
    var timer = setTimeout(function () { cleanup(); reject(new Error("timeout")); }, 8000);
    function cleanup() { clearTimeout(timer); delete window[name]; s.remove(); }
    window[name] = function (data) { cleanup(); resolve(data); };
    s.onerror = function () { cleanup(); reject(new Error("jsonp")); };
    s.src = url + "&callback=" + name;
    document.head.appendChild(s);
  });
}

function trimArt() {
  var keys = Object.keys(st.art);
  if (keys.length <= ART_CACHE_MAX) return;
  var keep = {};
  st.recent.forEach(function (r) { var k = artKey(r.title, r.artist); if (st.art[k]) keep[k] = st.art[k]; });
  keys.slice(-ART_CACHE_MAX / 2).forEach(function (k) { keep[k] = st.art[k]; });
  st.art = keep;
}

// ---- Recently played -----------------------------------------------------------

function remember(title, artist) {
  st.recent = st.recent.filter(function (r) { return !(r.title === title && r.artist === artist); });
  st.recent.unshift({ title: title, artist: artist, at: Date.now() });
  st.recent = st.recent.slice(0, RECENT_MAX + 1); // the first one is "now"
  Edge.store.save(st);
  renderRecent();
}

// ---- Render --------------------------------------------------------------------

function renderNow() {
  var frame = $("frame");
  var has = !!now.title;
  frame.dataset.state = has ? (playing ? "playing" : "paused") : "idle";
  $("title").textContent = has ? now.title : "Nothing playing";
  $("artist").textContent = has ? now.artist || "Unknown artist" : media ? "Start music on your PC" : "Waiting for iCUE media";
  $("kicker").textContent = has ? (playing ? "Now playing" : "Paused") : "Jukebox";
  var info = has ? st.art[artKey(now.title, now.artist)] : null;
  $("album").textContent = info && info.album ? info.album + (info.year ? " · " + info.year : "") : "";
  setArt(info && info.art);
  fitTitle();
}

function setArt(url) {
  var label = $("label");
  var backdrop = $("backdrop");
  if (url) {
    label.style.backgroundImage = 'url("' + url + '")';
    backdrop.style.backgroundImage = 'url("' + url + '")';
    label.classList.add("has-art");
  } else {
    label.style.backgroundImage = "";
    backdrop.style.backgroundImage = "";
    label.classList.remove("has-art");
  }
  $("labelText").textContent = now.title ? initials(now.artist || now.title) : "JUKEBOX";
}

function initials(s) {
  return String(s).split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase();
}

// Long titles step down in size (by length, so it doesn't depend on font loading).
function fitTitle() {
  var n = $("title").textContent.length;
  var f = n <= 16 ? 1 : n <= 26 ? 0.82 : n <= 40 ? 0.66 : 0.55;
  $("title").style.setProperty("--fit", String(f));
}

function renderRecent() {
  var box = $("recent");
  box.innerHTML = "";
  var list = st.recent.filter(function (r) { return !(r.title === now.title && r.artist === now.artist); }).slice(0, RECENT_MAX);
  if (!list.length) {
    box.innerHTML = '<div class="recent__empty">Songs you play show up here</div>';
    return;
  }
  list.forEach(function (r) {
    var info = st.art[artKey(r.title, r.artist)];
    var b = document.createElement("button");
    b.className = "tile";
    if (info && info.art) b.style.backgroundImage = 'url("' + info.art.replace("600x600bb", "200x200bb") + '")';
    else b.classList.add("tile--blank");
    b.innerHTML = '<span class="tile__t"></span><span class="tile__a"></span>';
    b.querySelector(".tile__t").textContent = r.title;
    b.querySelector(".tile__a").textContent = r.artist;
    // Tap: open the song in Apple Music (or search for it).
    Edge.press(b, function () {
      var url = info && info.url ? info.url : "https://music.apple.com/us/search?term=" + encodeURIComponent(r.artist + " " + r.title);
      Edge.openLink(url);
      toast("Opening " + r.title);
    });
    box.appendChild(b);
  });
}

function renderPlaylists() {
  var box = $("playlists");
  box.innerHTML = "";
  box.dataset.count = cfg.lists.length;
  cfg.lists.forEach(function (l) {
    var b = document.createElement("button");
    b.className = "plist";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 11h11M4 16h7M17 14v6M17 20a2 2 0 1 1-2-2h2"/></svg><span></span>';
    b.querySelector("span").textContent = l.name;
    Edge.press(b, function () {
      Edge.openLink(l.url);
      toast("Opening " + l.name);
    });
    box.appendChild(b);
  });
}

function flashArm() {
  var arm = $("arm");
  arm.classList.remove("lift");
  void arm.offsetWidth;
  arm.classList.add("lift");
}

function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1600);
}

// ---- Wiring ----------------------------------------------------------------------

Edge.press($("playBtn"), function () { control("triggerPlayPause"); });
Edge.press($("prevBtn"), function () { control("triggerPreviousTrack", "Previous"); });
Edge.press($("nextBtn"), function () { control("triggerNextTrack", "Next"); });
Edge.press($("record"), function () { control("triggerPlayPause"); });
window.addEventListener("resize", fitTitle);
