/* STRATUM DM — live initiative (read-only) plus local table tools. */

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var local = loadLocal();
var poll = { timer: null, lastKey: "", encounter: null, inFlight: false };
var lastPick = { comp: -1, npc: -1 };

// ---- Settings ------------------------------------------------------------

function onIcueDataUpdated() {
  var prev = cfg.supabaseUrl + "|" + cfg.anonKey + "|" + cfg.pollSeconds;
  cfg = {
    supabaseUrl: String(Edge.prop("supabaseUrl", "")).trim().replace(/\/+$/, ""),
    anonKey: String(Edge.prop("anonKey", "")).trim(),
    pollSeconds: Math.min(10, Math.max(3, Number(Edge.prop("pollSeconds", 4)))),
    showHidden: Edge.prop("showHidden", false) === true,
    showScanlines: Edge.prop("showScanlines", true) !== false,
    textColor: Edge.prop("textColor", "#f0efe4"),
    accentColor: Edge.prop("accentColor", "#f5a623"),
    backgroundColor: Edge.prop("backgroundColor", "#0a0a0c"),
    transparency: Number(Edge.prop("transparency", 0)),
  };
  var root = document.documentElement.style;
  root.setProperty("--text-color", cfg.textColor);
  root.setProperty("--accent-color", cfg.accentColor);
  root.setProperty("--bg-color", cfg.backgroundColor);
  root.setProperty("--widget-opacity", String(1 - cfg.transparency / 100));
  $("frame").classList.toggle("scanlines", cfg.showScanlines);

  if (prev !== cfg.supabaseUrl + "|" + cfg.anonKey + "|" + cfg.pollSeconds) startPolling();
  else renderEncounter(poll.encounter);
  renderLocal();
}

// ---- Live initiative (Supabase REST, read-only) ---------------------------

function startPolling() {
  clearInterval(poll.timer);
  poll.lastKey = "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl) || !cfg.anonKey) {
    setTag("NO LINK", "off");
    poll.encounter = null;
    renderEncounter(null, "> NO LINK :: SET SUPABASE URL + ANON KEY IN SETTINGS");
    return;
  }
  fetchEncounter();
  poll.timer = setInterval(function () {
    if (!document.hidden) fetchEncounter();
  }, cfg.pollSeconds * 1000);
}

function fetchEncounter() {
  if (poll.inFlight) return;
  poll.inFlight = true;
  // Same query DATACORE's dashboard uses: newest active encounter.
  var url = cfg.supabaseUrl + "/rest/v1/encounters?select=*&active=eq.true&order=updated_at.desc&limit=1";
  fetch(url, {
    headers: { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey, Accept: "application/json" },
    cache: "no-store",
  }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (rows) {
    var enc = Array.isArray(rows) && rows.length ? rows[0] : null;
    setTag("LIVE", "on");
    // Skip DOM work when nothing changed since the last poll.
    var key = enc ? enc.id + "|" + (enc.updated_at || JSON.stringify(enc.combatants) + enc.round + enc.active_id) : "none";
    if (key === poll.lastKey) return;
    poll.lastKey = key;
    poll.encounter = enc;
    renderEncounter(enc, "> NO ACTIVE ENCOUNTER");
  }).catch(function (err) {
    // Keep showing the last good data, just mark it stale.
    setTag("OFFLINE", "off", err && err.message);
    if (!poll.encounter) renderEncounter(null, "> LINK FAILED :: " + (err && err.message ? err.message : "network"));
  }).then(function () {
    poll.inFlight = false;
  });
}

function setTag(text, state, title) {
  var tag = $("linkTag");
  tag.textContent = text;
  tag.dataset.state = state;
  tag.title = title || "";
}

function renderEncounter(enc, emptyText) {
  var list = $("initList");
  var empty = $("initEmpty");
  if (!enc) {
    list.innerHTML = "";
    $("encName").textContent = "";
    if (emptyText) empty.textContent = emptyText;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  var all = Array.isArray(enc.combatants) ? enc.combatants : [];
  var shown = all
    .filter(function (c) { return cfg.showHidden || c.type === "pc" || !c.hidden; })
    .sort(function (a, b) { return (b.initiative || 0) - (a.initiative || 0); });

  // DATACORE doesn't save whose turn it is yet. If an `active_id` field
  // ever appears on the encounter, highlight it automatically.
  var activeId = enc.active_id || enc.activeId || null;
  $("encName").textContent = (enc.name || "ENCOUNTER") + " · R" + (enc.round || 1);

  var maxChips = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--max-chips"), 10) || 3;

  list.innerHTML = "";
  shown.forEach(function (c) {
    var li = document.createElement("li");
    li.className = "cb cb--" + (c.type === "pc" ? "pc" : "enemy");
    if (c.is_dead) li.classList.add("cb--dead");
    if (c.hidden) li.classList.add("cb--hidden");
    if (activeId && c.id === activeId) li.classList.add("cb--active");

    var max = Math.max(1, Number(c.hp_max) || 1);
    var cur = Math.max(0, Number(c.hp_current) || 0);
    var pct = Math.min(100, cur / max * 100);
    var conds = Array.isArray(c.conditions) ? c.conditions : [];

    li.innerHTML =
      '<span class="cb__init"></span>' +
      '<span class="cb__name"></span>' +
      '<span class="cb__conds"></span>' +
      '<span class="cb__hp"><span class="cb__bar"><i></i></span><span class="cb__hpnum"></span></span>';
    li.querySelector(".cb__init").textContent = c.initiative != null ? c.initiative : "–";
    li.querySelector(".cb__name").textContent = c.name || "?";
    li.querySelector(".cb__bar i").style.width = pct + "%";
    li.querySelector(".cb__bar").dataset.level = pct <= 25 ? "low" : pct <= 50 ? "mid" : "ok";
    li.querySelector(".cb__hpnum").textContent = cur + "/" + max;
    var condEl = li.querySelector(".cb__conds");
    conds.slice(0, maxChips).forEach(function (name) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = String(name).toUpperCase();
      condEl.appendChild(chip);
    });
    if (conds.length > maxChips) {
      var more = document.createElement("span");
      more.className = "chip chip--more";
      more.textContent = "+" + (conds.length - maxChips);
      condEl.appendChild(more);
    }
    list.appendChild(li);
  });

  if (!shown.length) {
    empty.textContent = "> ENCOUNTER HAS NO VISIBLE COMBATANTS";
    empty.hidden = false;
  }
}

// ---- Round + session timer (local, saved per widget) ----------------------

function loadLocal() {
  var s = Edge.store.load();
  return {
    round: s.round || 1,
    timerMs: s.timerMs || 0, // time banked while paused
    timerStart: s.timerStart || null, // epoch ms when running
  };
}

function saveLocal() {
  Edge.store.save(local);
}

function elapsedMs() {
  return local.timerMs + (local.timerStart ? Date.now() - local.timerStart : 0);
}

function formatTime(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor(s / 60) % 60;
  return h + ":" + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function renderLocal() {
  $("round").textContent = local.round;
  $("timer").textContent = formatTime(elapsedMs());
  $("timerBtn").textContent = local.timerStart ? "PAUSE" : (local.timerMs ? "RESUME" : "START");
  $("frame").classList.toggle("timer-running", !!local.timerStart);
}

setInterval(function () {
  if (local.timerStart && !document.hidden) $("timer").textContent = formatTime(elapsedMs());
}, 1000);

Edge.press($("roundUp"), function () { local.round++; saveLocal(); renderLocal(); });
Edge.press($("roundDown"), function () {
  local.round = Math.max(1, local.round - 1); saveLocal(); renderLocal();
}, function () {
  local.round = 1; saveLocal(); renderLocal(); // hold − to reset to round 1
});

Edge.press($("timerBtn"), function () {
  if (local.timerStart) {
    local.timerMs += Date.now() - local.timerStart;
    local.timerStart = null;
  } else {
    local.timerStart = Date.now();
  }
  saveLocal();
  renderLocal();
}, function () {
  local.timerMs = 0;
  local.timerStart = null;
  saveLocal();
  renderLocal();
});

Edge.store.onExternalChange(function () {
  local = loadLocal();
  renderLocal();
});

// ---- Random tables --------------------------------------------------------

function pick(list, slot) {
  if (!list.length) return "";
  var i;
  do { i = Edge.roll(list.length) - 1; } while (list.length > 1 && i === lastPick[slot]);
  if (slot) lastPick[slot] = i;
  return list[i];
}

function showGen(label, html) {
  $("genLabel").textContent = label;
  var out = $("genOut");
  out.innerHTML = html;
  out.classList.remove("flash");
  void out.offsetWidth;
  out.classList.add("flash");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

Edge.press($("btnComp"), function () {
  showGen("GEN://COMPLICATION", '<p class="gen__text">' + esc(pick(COMPLICATIONS, "comp")) + "</p>");
});

Edge.press($("btnNpc"), function () {
  var name = pick(NPC_FIRST) + " " + pick(NPC_LAST);
  var role = pick(NPC_ROLES);
  var hook = pick(NPC_HOOKS, "npc");
  showGen("GEN://NPC",
    '<p class="gen__name">' + esc(name) + '</p>' +
    '<p class="gen__role">' + esc(role) + "</p>" +
    '<p class="gen__text">' + esc(hook.charAt(0).toUpperCase() + hook.slice(1)) + ".</p>");
});

// The chip limit depends on slot size, so redraw if the slot changes.
window.addEventListener("resize", function () { renderEncounter(poll.encounter); });
