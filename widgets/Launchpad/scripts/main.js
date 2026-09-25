/* LAUNCHPAD — big touch tiles that open apps and sites. */

var TILE_COUNT = 10;
// Same as the data-default values in index.html (used outside iCUE).
var DEFAULT_TILES = [
  "Steam | steam://open/games", "Discord | discord://", "Claude | claude://",
  "YouTube | https://www.youtube.com", "Apple Music | https://music.apple.com",
  "DnD Beyond | https://www.dndbeyond.com", "Drive | https://drive.google.com",
  "Settings | ms-settings:",
];
var PALETTE = ["#ff5a36", "#2d6bff", "#14b87a", "#f4c20d", "#9b5cff", "#ff3d7f", "#00b3c7", "#ff8f1f", "#5b6cff", "#3fbf4f"];

// Simple 24x24 line icons, picked by keywords in the label or link.
var ICONS = {
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  spark: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  play: '<rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M10 9v6l5-3z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  dice: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z"/><path d="M12 2.5v5M3.5 7.5L12 13l8.5-5.5M12 13v8.5M7.5 10l4.5 7.5 4.5-7.5z"/>',
  folder: '<path d="M3 6.5h6.5l2 2.5H21v10H3z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  brush: '<path d="M14 4l6 6-8 8H6v-6z"/><path d="M11 7l6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  arrow: '<path d="M6 18L18 6M9 6h9v9"/>',
};

var RULES = [
  [/steam|epic|xbox|battle\.?net|game|gog|ubisoft|riot/i, "game"],
  [/discord|slack|teams|chat|messenger|whatsapp/i, "chat"],
  [/claude/i, "spark"],
  [/youtube|twitch|video|netflix|plex|vlc/i, "play"],
  [/music|spotify|tidal|itunes|soundcloud/i, "music"],
  [/dnd|d&d|beyond|roll20|foundry|dice|drakkenheim/i, "dice"],
  [/drive|folder|file|explorer|dropbox|onedrive/i, "folder"],
  [/settings|icue|control/i, "gear"],
  [/mail|outlook/i, "mail"],
  [/calendar/i, "calendar"],
  [/paint|forge|warhammer|citadel|miniature/i, "brush"],
];

var $ = function (id) { return document.getElementById(id); };
var tiles = [];
var toastTimer = null;

function onIcueDataUpdated() {
  var root = document.documentElement.style;
  root.setProperty("--text-color", Edge.prop("textColor", "#ffffff"));
  root.setProperty("--bg-color", Edge.prop("backgroundColor", "#0c0d10"));
  root.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  $("frame").dataset.labels = String(Edge.prop("showLabels", true)) !== "false" ? "on" : "off";

  var next = [];
  for (var i = 1; i <= TILE_COUNT; i++) {
    var t = parseTile(Edge.inIcue() ? Edge.prop("tile" + i, "") : DEFAULT_TILES[i - 1]);
    if (t) next.push(t);
  }
  if (JSON.stringify(next) === JSON.stringify(tiles)) return;
  tiles = next;
  render();
}

// "Label | link" -> { label, url }. A bare link works too.
function parseTile(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  var bar = raw.indexOf("|");
  var label = bar >= 0 ? raw.slice(0, bar).trim() : "";
  var url = (bar >= 0 ? raw.slice(bar + 1) : raw).trim();
  if (!url) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = "https://" + url; // "youtube.com"
  if (!label) label = labelFromUrl(url);
  return { label: label, url: url };
}

function labelFromUrl(url) {
  var m = url.match(/^https?:\/\/(?:www\.)?([^/.]+)/i) || url.match(/^([a-z0-9-]+):/i);
  var s = m ? m[1] : url;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function iconFor(t) {
  var hay = t.label + " " + t.url;
  for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(hay)) return ICONS[RULES[i][1]];
  return /^https?:/i.test(t.url) ? ICONS.globe : ICONS.arrow;
}

function render() {
  var grid = $("grid");
  grid.innerHTML = "";
  grid.dataset.count = tiles.length;
  // Two rows on the wide slots; columns follow the tile count.
  var cols = Math.max(1, Math.ceil(tiles.length / 2));
  grid.style.setProperty("--cols", cols);
  grid.style.setProperty("--cols-l", Math.min(cols, 4));
  if (!tiles.length) {
    grid.innerHTML = '<div class="empty">Add tiles in the widget settings</div>';
    return;
  }
  tiles.forEach(function (t, i) {
    var b = document.createElement("button");
    b.className = "tile";
    b.style.setProperty("--tile", PALETTE[i % PALETTE.length]);
    b.innerHTML =
      '<svg class="tile__icon" viewBox="0 0 24 24" aria-hidden="true">' + iconFor(t) + "</svg>" +
      '<span class="tile__label"></span><span class="tile__scheme"></span>';
    b.querySelector(".tile__label").textContent = t.label;
    b.querySelector(".tile__scheme").textContent = schemeOf(t.url);
    Edge.press(b, function () { launch(t, b); });
    grid.appendChild(b);
  });
}

function schemeOf(url) {
  var m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  if (m) return m[1];
  var scheme = url.split(":")[0];
  return url.indexOf("://") > 0 ? scheme + "://" : scheme + ":";
}

function launch(t, el) {
  var how = Edge.openLink(t.url);
  el.classList.remove("launched");
  void el.offsetWidth; // restart the flash animation
  el.classList.add("launched");
  toast(how === "unavailable" ? "Link plugin unavailable" : "Opening " + t.label);
}

function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1600);
}
