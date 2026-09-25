/* DAYBREAK — clock, weather (Open-Meteo), sun arc, countdowns. */

var REFRESH_MS = 15 * 60 * 1000;
var HOURS = 12;
var DAYS = 5;
var DEFAULT_COUNTS = ["Halloween | 10-31", "Christmas | 12-25", "", ""];

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var saved = Edge.store.load(); // { geo: {q, name, lat, lon}, wx: {data, at, units} }
var fetching = false;
var lastWxError = "";

// ---- Settings ------------------------------------------------------------

function onIcueDataUpdated() {
  var inIcue = Edge.inIcue();
  var prev = cfg;
  cfg = {
    city: String(Edge.prop("city", "")).trim(),
    units: Edge.prop("tempUnits", "f") === "c" ? "c" : "f",
    clock24: String(Edge.prop("clock24", false)) === "true",
    counts: [1, 2, 3, 4].map(function (i) { return inIcue ? Edge.prop("count" + i, "") : DEFAULT_COUNTS[i - 1]; }),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  document.documentElement.style.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  renderClock();
  renderCounts();
  if (cfg.city !== prev.city || cfg.units !== prev.units) refreshWeather();
  else renderWeather();
}

// ---- Weather -------------------------------------------------------------

function refreshWeather() {
  if (!cfg.city) {
    if (saved.wx && saved.wx.data && !Edge.inIcue()) { renderWeather(); return; } // dev preview
    showWxMessage("Set your city in settings");
    return;
  }
  var wx = saved.wx;
  var fresh = wx && wx.data && wx.units === cfg.units && saved.geo && saved.geo.q === cfg.city &&
    Date.now() - wx.at < REFRESH_MS - 30000;
  if (fresh) { renderWeather(); return; }
  if (fetching) return;
  fetching = true;
  geocode(cfg.city).then(function (geo) {
    return fetchForecast(geo).then(function (data) {
      saved.wx = { data: data, at: Date.now(), units: cfg.units };
      Edge.store.save(saved);
      lastWxError = "";
    });
  }).catch(function (err) {
    lastWxError = err && err.message ? err.message : "Weather unavailable";
  }).then(function () {
    fetching = false;
    renderWeather();
  });
}

function geocode(q) {
  if (saved.geo && saved.geo.q === q) return Promise.resolve(saved.geo);
  // "Leeds UK" -> name "Leeds"; Open-Meteo matches on the place name only.
  var parts = q.split(/[,\s]+/).filter(Boolean);
  var tries = [q, parts[0]].filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  var hint = parts.slice(1).join(" ").toLowerCase();

  function attempt(i) {
    if (i >= tries.length) return Promise.reject(new Error("City not found: " + q));
    var url = "https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=" + encodeURIComponent(tries[i]);
    return getJson(url).then(function (res) {
      var list = (res && res.results) || [];
      if (!list.length) return attempt(i + 1);
      var pick = list[0];
      if (hint) {
        var hit = list.find(function (r) {
          var hay = [r.country, r.country_code, r.admin1].join(" ").toLowerCase();
          return hay.indexOf(hint) >= 0 || (hint.length === 2 && String(r.country_code).toLowerCase() === hint);
        });
        if (hit) pick = hit;
      }
      saved.geo = { q: q, name: pick.name, region: pick.admin1 || pick.country || "", lat: pick.latitude, lon: pick.longitude };
      Edge.store.save(saved);
      return saved.geo;
    });
  }
  return attempt(0);
}

function fetchForecast(geo) {
  var url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + geo.lat + "&longitude=" + geo.lon +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
    "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max" +
    "&temperature_unit=" + (cfg.units === "c" ? "celsius" : "fahrenheit") +
    "&wind_speed_unit=" + (cfg.units === "c" ? "kmh" : "mph") +
    "&timezone=auto&forecast_days=7";
  return getJson(url);
}

function getJson(url) {
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
  return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error("Weather service error " + r.status);
    return r.json();
  }, function () {
    clearTimeout(timer);
    throw new Error("No connection to Open-Meteo");
  });
}

// Open-Meteo times are local to the city ("2026-09-25T06:58"), parsed as local.
function parseLocal(s) {
  var m = String(s).match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

var WMO = {
  0: ["Clear", "clear"], 1: ["Mostly clear", "clear"], 2: ["Partly cloudy", "partly"], 3: ["Overcast", "cloud"],
  45: ["Fog", "fog"], 48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Heavy drizzle", "rain"],
  56: ["Freezing drizzle", "sleet"], 57: ["Freezing drizzle", "sleet"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "sleet"], 67: ["Freezing rain", "sleet"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Showers", "rain"], 81: ["Showers", "rain"], 82: ["Heavy showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Storm and hail", "storm"], 99: ["Storm and hail", "storm"],
};

function wmo(code) { return WMO[code] || ["--", "cloud"]; }

// Flat, two-tone weather icons on a 64x64 grid.
function iconSvg(kind, day) {
  var sun = '<circle cx="32" cy="32" r="12" fill="#ffd45c"/><g stroke="#ffd45c" stroke-width="4" stroke-linecap="round">' +
    '<path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g>';
  var moon = '<path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12z" fill="#e9ecf7"/>';
  var cloud = function (y, c) {
    return '<path d="M18 ' + (48 + y) + 'h30a10 10 0 0 0 0-20 14 14 0 0 0-26-4 11 11 0 0 0-4 24z" fill="' + (c || "#eef2f8") + '"/>';
  };
  var drops = '<g stroke="#6cc3ff" stroke-width="4" stroke-linecap="round"><path d="M22 54l-3 7M32 54l-3 7M42 54l-3 7"/></g>';
  var flakes = '<g fill="#ffffff"><circle cx="21" cy="57" r="3"/><circle cx="32" cy="60" r="3"/><circle cx="43" cy="57" r="3"/></g>';
  var bolt = '<path d="M33 44l-7 11h6l-3 9 10-13h-6l4-7z" fill="#ffd45c"/>';
  var fog = '<g stroke="#dfe5ee" stroke-width="4" stroke-linecap="round"><path d="M12 26h40M8 36h44M14 46h38"/></g>';
  switch (kind) {
    case "clear": return day ? sun : moon;
    case "partly": return '<g transform="translate(-8 -8) scale(0.8)">' + (day ? sun : moon) + "</g>" + cloud(0);
    case "cloud": return cloud(-6, "#cfd6e2") + '<g transform="translate(6 4)">' + cloud(-2) + "</g>";
    case "fog": return fog;
    case "rain": return cloud(-8) + drops;
    case "sleet": return cloud(-8) + '<g stroke="#6cc3ff" stroke-width="4" stroke-linecap="round"><path d="M22 54l-3 7M42 54l-3 7"/></g><circle cx="32" cy="58" r="3" fill="#fff"/>';
    case "snow": return cloud(-8) + flakes;
    case "storm": return cloud(-10, "#b9c1cf") + bolt;
    default: return cloud(0);
  }
}

function showWxMessage(msg) {
  $("wxIcon").innerHTML = "";
  $("wxTemp").textContent = "--°";
  $("wxDesc").textContent = msg;
  $("wxMeta").textContent = "";
  $("hours").innerHTML = "";
  $("days").innerHTML = "";
}

function renderWeather() {
  var wx = saved.wx && saved.wx.data;
  if (!wx || !wx.current) {
    showWxMessage(lastWxError || (cfg.city ? "Loading weather…" : "Set your city in settings"));
    renderSky();
    return;
  }
  var cur = wx.current;
  var w = wmo(cur.weather_code);
  var day = cur.is_day !== 0;
  $("wxIcon").innerHTML = iconSvg(w[1], day);
  $("wxTemp").textContent = Math.round(cur.temperature_2m) + "°";
  var place = saved.geo ? saved.geo.name : "";
  $("wxDesc").textContent = w[0] + (place ? " · " + place : "");
  var windUnit = cfg.units === "c" ? "km/h" : "mph";
  var today = wx.daily;
  var meta = [
    "Feels " + Math.round(cur.apparent_temperature) + "°",
    "H " + Math.round(today.temperature_2m_max[0]) + "° L " + Math.round(today.temperature_2m_min[0]) + "°",
    Math.round(cur.wind_speed_10m) + " " + windUnit,
  ];
  if (today.precipitation_probability_max && today.precipitation_probability_max[0] >= 20) {
    meta.push(today.precipitation_probability_max[0] + "% rain");
  }
  $("wxMeta").textContent = meta.join("   ");
  $("credit").textContent = "Open-Meteo.com" + (lastWxError ? " · " + lastWxError : "") + " · " + ago(saved.wx.at);
  renderHours(wx);
  renderDays(wx);
  renderSky();
}

function ago(t) {
  var m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago";
}

// Next 12 hours as beads on stems: height follows temperature, blue fill
// at the foot shows the chance of rain.
function renderHours(wx) {
  var h = wx.hourly;
  var now = new Date();
  var start = 0;
  for (var i = 0; i < h.time.length; i++) {
    var t = parseLocal(h.time[i]);
    if (t && t.getTime() + 3600000 > now.getTime()) { start = i; break; }
  }
  var slice = [];
  for (var j = start; j < Math.min(start + HOURS, h.time.length); j++) {
    slice.push({ t: parseLocal(h.time[j]), temp: h.temperature_2m[j], code: h.weather_code[j], rain: h.precipitation_probability ? h.precipitation_probability[j] : 0, day: h.is_day ? h.is_day[j] !== 0 : true });
  }
  var temps = slice.map(function (s) { return s.temp; });
  var lo = Math.min.apply(null, temps);
  var hi = Math.max.apply(null, temps);
  var span = Math.max(hi - lo, 4);
  var box = $("hours");
  box.innerHTML = "";
  slice.forEach(function (s, k) {
    var col = document.createElement("div");
    col.className = "hour";
    var pos = (s.temp - lo) / span; // 0..1
    col.style.setProperty("--pos", pos.toFixed(3));
    col.style.setProperty("--rain", Math.max(0, Math.min(100, s.rain || 0)) + "%");
    col.innerHTML =
      '<span class="hour__temp">' + Math.round(s.temp) + '°</span>' +
      '<span class="hour__track"><i class="hour__rain"></i><i class="hour__stem"></i><i class="hour__bead"></i></span>' +
      '<svg class="hour__icon" viewBox="0 0 64 64">' + iconSvg(wmo(s.code)[1], s.day) + "</svg>" +
      '<span class="hour__label">' + (k === 0 ? "Now" : hourLabel(s.t)) + "</span>";
    box.appendChild(col);
  });
}

function hourLabel(t) {
  if (!t) return "";
  if (cfg.clock24) return String(t.getHours()).padStart(2, "0");
  var h = t.getHours() % 12 || 12;
  return h + (t.getHours() < 12 ? "a" : "p");
}

// Five days as range pills on one shared scale.
function renderDays(wx) {
  var d = wx.daily;
  var n = Math.min(DAYS, d.time.length);
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < n; i++) { lo = Math.min(lo, d.temperature_2m_min[i]); hi = Math.max(hi, d.temperature_2m_max[i]); }
  var span = Math.max(hi - lo, 1);
  var box = $("days");
  box.innerHTML = "";
  for (var k = 0; k < n; k++) {
    var date = parseLocal(d.time[k] + "T12:00");
    var row = document.createElement("div");
    row.className = "day";
    row.style.setProperty("--from", ((d.temperature_2m_min[k] - lo) / span * 100).toFixed(1) + "%");
    row.style.setProperty("--to", ((d.temperature_2m_max[k] - lo) / span * 100).toFixed(1) + "%");
    row.innerHTML =
      '<span class="day__name">' + (k === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" })) + "</span>" +
      '<svg class="day__icon" viewBox="0 0 64 64">' + iconSvg(wmo(d.weather_code[k])[1], true) + "</svg>" +
      '<span class="day__lo">' + Math.round(d.temperature_2m_min[k]) + "°</span>" +
      '<span class="day__bar"><i></i></span>' +
      '<span class="day__hi">' + Math.round(d.temperature_2m_max[k]) + "°</span>";
    box.appendChild(row);
  }
}

// ---- Clock, sky and sun arc -------------------------------------------------

function renderClock() {
  var now = new Date();
  var h = now.getHours();
  var m = String(now.getMinutes()).padStart(2, "0");
  var time = cfg.clock24 ? String(h).padStart(2, "0") + ":" + m : (h % 12 || 12) + ":" + m;
  $("time").innerHTML = time + (cfg.clock24 ? "" : '<small>' + (h < 12 ? "AM" : "PM") + "</small>");
  $("date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function sunTimes() {
  var d = saved.wx && saved.wx.data && saved.wx.data.daily;
  var now = new Date();
  if (d && d.sunrise) {
    // Find today's entry by date (the cache may be from yesterday).
    var key = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var i = d.time.indexOf(key);
    if (i >= 0) {
      return {
        rise: parseLocal(d.sunrise[i]), set: parseLocal(d.sunset[i]),
        nextRise: d.sunrise[i + 1] ? parseLocal(d.sunrise[i + 1]) : null,
        prevSet: i > 0 ? parseLocal(d.sunset[i - 1]) : null,
      };
    }
  }
  // No data: a plain 6:30 to 18:30 day.
  var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    rise: new Date(base.getTime() + 6.5 * 3600000), set: new Date(base.getTime() + 18.5 * 3600000),
    nextRise: new Date(base.getTime() + 30.5 * 3600000), prevSet: new Date(base.getTime() - 5.5 * 3600000),
    guess: true,
  };
}

function renderSky() {
  var now = new Date();
  var s = sunTimes();
  var t = now.getTime();
  var WIN = 45 * 60000;
  var phase = "night";
  if (Math.abs(t - s.rise) < WIN) phase = "dawn";
  else if (Math.abs(t - s.set) < WIN) phase = "dusk";
  else if (t > s.rise && t < s.set) phase = "day";
  $("frame").dataset.phase = phase;

  // Body position along the arc: the sun by day, the moon by night.
  var from, to, isDay = t >= s.rise && t <= s.set;
  if (isDay) { from = s.rise; to = s.set; }
  else if (t > s.set) { from = s.set; to = s.nextRise || new Date(s.rise.getTime() + 86400000); }
  else { from = s.prevSet || new Date(s.set.getTime() - 86400000); to = s.rise; }
  var f = Math.max(0, Math.min(1, (t - from) / (to - from)));
  var a = Math.PI * (1 - f);
  var body = $("arcBody");
  body.setAttribute("cx", (200 + 180 * Math.cos(a)).toFixed(1));
  body.setAttribute("cy", (110 - 100 * Math.sin(a)).toFixed(1));
  body.classList.toggle("moon", !isDay);
  $("arc").style.setProperty("--progress", f.toFixed(3));

  var fmt = function (d) { return d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !cfg.clock24 }) : "--"; };
  var dayLen = (s.set - s.rise) / 3600000;
  var line = "Sunrise " + fmt(s.rise) + "   Sunset " + fmt(s.set);
  if (!s.guess) line += "   " + Math.floor(dayLen) + "h " + Math.round((dayLen % 1) * 60) + "m of light";
  if (!isDay) line = moonPhase(now) + "   " + line;
  $("sunLine").textContent = line;
}

// Moon phase from a known new moon (2000-01-06 18:14 UTC), 29.53-day cycle.
function moonPhase(date) {
  var days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  var p = ((days % 29.530588) + 29.530588) % 29.530588 / 29.530588;
  var names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(p * 8) % 8];
}

// ---- Countdowns ------------------------------------------------------------

// "Label | 2026-10-31" (one day) or "Label | 10-31" (every year).
function parseCount(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  var bar = raw.lastIndexOf("|");
  var label = bar >= 0 ? raw.slice(0, bar).trim() : "";
  var when = (bar >= 0 ? raw.slice(bar + 1) : raw).trim();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var m = when.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  var date;
  if (m) {
    date = new Date(+m[1], m[2] - 1, +m[3]);
  } else if ((m = when.match(/^(\d{1,2})-(\d{1,2})$/))) {
    date = new Date(today.getFullYear(), m[1] - 1, +m[2]);
    if (date < today) date = new Date(today.getFullYear() + 1, m[1] - 1, +m[2]);
  } else {
    return null;
  }
  if (isNaN(date)) return null;
  var days = Math.round((date - today) / 86400000);
  return { label: label || when, date: date, days: days };
}

function renderCounts() {
  var list = cfg.counts.map(parseCount).filter(function (c) { return c && c.days >= 0; });
  list.sort(function (a, b) { return a.days - b.days; });
  var box = $("counts");
  box.innerHTML = "";
  box.dataset.count = list.length;
  if (!list.length) {
    box.innerHTML = '<div class="count count--empty">Add countdowns in settings</div>';
    return;
  }
  list.forEach(function (c) {
    var el = document.createElement("div");
    el.className = "count" + (c.days === 0 ? " count--today" : "");
    el.innerHTML =
      '<span class="count__num"></span><span class="count__unit"></span>' +
      '<span class="count__label"></span><span class="count__date"></span>';
    el.querySelector(".count__num").textContent = c.days === 0 ? "Today" : c.days;
    el.querySelector(".count__unit").textContent = c.days === 0 ? "" : c.days === 1 ? "day" : "days";
    el.querySelector(".count__label").textContent = c.label;
    var when = c.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    el.querySelector(".count__date").textContent = c.days === 0 ? when : (c.days === 1 ? "day" : "days") + " · " + when;
    box.appendChild(el);
  });
}

// ---- Timers ----------------------------------------------------------------

var lastMinute = -1;
setInterval(function () {
  var now = new Date();
  if (now.getMinutes() === lastMinute) return;
  lastMinute = now.getMinutes();
  renderClock();
  renderSky();
  if (now.getHours() === 0 && now.getMinutes() === 0) renderCounts();
  if (saved.wx && saved.wx.data) renderHours(saved.wx.data);
}, 1000);

setInterval(function () { if (!document.hidden) refreshWeather(); }, 60000);
