/* STRATUM DM — live initiative (read-only) plus local table tools. */

var $ = function (id) { return document.getElementById(id); };
var cfg = {};
var local = loadLocal();
var poll = { timer: null, lastKey: "", encounter: null, inFlight: false, mode: "rpc", rpcRetryAt: 0 };
var lastPick = { comp: -1, npc: -1 };
var genCurrent = null; // { kind, text } now on screen
var genHistory = []; // earlier results, newest first
var GEN_KEEP = 3;

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
  poll.mode = "rpc";
  poll.rpcRetryAt = 0;
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

// Preferred source: the edge_active_encounter() function (sql/edge_active_encounter.sql).
// It returns only the newest active fight with hidden enemies removed, and it
// works with the anon key. If it isn't installed yet (404), fall back to reading
// the table directly, and retry the function every RPC_RETRY_MS.
var RPC_RETRY_MS = 60 * 1000;

function supabaseFetch(path, opts) {
  var headers = { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey, Accept: "application/json" };
  if (opts && opts.body) headers["Content-Type"] = "application/json";
  return fetch(cfg.supabaseUrl + path, {
    method: (opts && opts.method) || "GET",
    headers: headers,
    body: opts && opts.body,
    cache: "no-store",
  });
}

function loadViaRpc() {
  return supabaseFetch("/rest/v1/rpc/edge_active_encounter", { method: "POST", body: "{}" }).then(function (res) {
    if (res.status === 404) { var err = new Error("rpc missing"); err.rpcMissing = true; throw err; }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (enc) {
    if (Array.isArray(enc)) return enc[0] || null;
    return enc && typeof enc === "object" ? enc : null;
  });
}

function loadViaTable() {
  // Same query DATACORE's dashboard uses: newest active encounter.
  return supabaseFetch("/rest/v1/encounters?select=*&active=eq.true&order=updated_at.desc&limit=1").then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (rows) {
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  });
}

function fetchEncounter() {
  if (poll.inFlight) return;
  poll.inFlight = true;
  var useRpc = poll.mode !== "table" || Date.now() >= poll.rpcRetryAt;
  var load = useRpc
    ? loadViaRpc().then(function (enc) { poll.mode = "rpc"; return enc; }, function (err) {
        if (!err.rpcMissing) throw err;
        poll.mode = "table";
        poll.rpcRetryAt = Date.now() + RPC_RETRY_MS;
        return loadViaTable();
      })
    : loadViaTable();

  load.then(function (enc) {
    setTag("LIVE", "on", poll.mode === "rpc" ? "via edge_active_encounter()" : "via encounters table");
    // Skip DOM work when nothing changed since the last poll.
    var key = enc ? enc.id + "|" + (enc.updated_at || JSON.stringify(enc.combatants) + enc.round + enc.active_id) : "none";
    if (key === poll.lastKey) return;
    poll.lastKey = key;
    poll.encounter = enc;
    renderEncounter(enc, poll.mode === "table"
      ? "> NO ACTIVE ENCOUNTER :: IF A FIGHT IS RUNNING, INSTALL edge_active_encounter (SEE README)"
      : "> NO ACTIVE ENCOUNTER");
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
    $("initSum").innerHTML = "";
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
  renderSummary(shown);
}

// One line of pacing info. Uses only what's on screen, so hidden enemies
// never leak through the totals.
function renderSummary(shown) {
  var down = function (c) { return c.is_dead || (Number(c.hp_current) || 0) <= 0; };
  var pcs = shown.filter(function (c) { return c.type === "pc"; });
  var foes = shown.filter(function (c) { return c.type !== "pc"; });
  var foeCur = 0, foeMax = 0;
  foes.forEach(function (c) {
    foeCur += Math.max(0, Number(c.hp_current) || 0);
    foeMax += Math.max(0, Number(c.hp_max) || 0);
  });
  var pcsUp = pcs.filter(function (c) { return !down(c); }).length;
  var foesDown = foes.filter(down).length;
  var pct = foeMax ? Math.round(foeCur / foeMax * 100) : 0;
  $("initSum").innerHTML =
    '<span>PCS UP <b class="c-pc">' + pcsUp + "/" + pcs.length + "</b></span>" +
    '<span>ENEMIES <b class="c-foe">' + (foes.length - foesDown) + "</b> UP \u00b7 <b>" + foesDown + "</b> DOWN</span>" +
    '<span>ENEMY HP <b class="c-foe">' + foeCur + "/" + foeMax + "</b> (" + pct + "%)</span>";
}

// ---- Round + session timer (local, saved per widget) ----------------------

function loadLocal() {
  var s = Edge.store.load();
  return {
    round: s.round || 1,
    roundStart: s.roundStart || Date.now(), // when the current round began
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
  renderRoundTime();
}

function renderRoundTime() {
  var sec = Math.max(0, Math.floor((Date.now() - local.roundStart) / 1000));
  $("roundTime").textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function setRound(n) {
  if (n !== local.round) local.roundStart = Date.now();
  local.round = n;
  saveLocal();
  renderLocal();
}

setInterval(function () {
  if (document.hidden) return;
  if (local.timerStart) $("timer").textContent = formatTime(elapsedMs());
  renderRoundTime();
}, 1000);

Edge.press($("roundUp"), function () { setRound(local.round + 1); });
Edge.press($("roundDown"), function () {
  setRound(Math.max(1, local.round - 1));
}, function () {
  local.roundStart = Date.now(); // hold − to reset to round 1
  setRound(1);
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

function showGen(label, html, summary) {
  if (genCurrent) {
    genHistory.unshift(genCurrent);
    genHistory = genHistory.slice(0, GEN_KEEP);
  }
  genCurrent = { kind: label.replace("GEN://", ""), text: summary };
  $("genHist").innerHTML = genHistory.map(function (g) {
    return "<li><b>" + esc(g.kind) + "</b> " + esc(g.text) + "</li>";
  }).join("");
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
  var text = pick(COMPLICATIONS, "comp");
  showGen("GEN://COMPLICATION", '<p class="gen__text">' + esc(text) + "</p>", text);
});

Edge.press($("btnNpc"), function () {
  var name = pick(NPC_FIRST) + " " + pick(NPC_LAST);
  var role = pick(NPC_ROLES);
  var hook = pick(NPC_HOOKS, "npc");
  showGen("GEN://NPC",
    '<p class="gen__name">' + esc(name) + '</p>' +
    '<p class="gen__role">' + esc(role) + "</p>" +
    '<p class="gen__text">' + esc(hook.charAt(0).toUpperCase() + hook.slice(1)) + ".</p>",
    name + " \u00b7 " + role);
});

// The chip limit depends on slot size, so redraw if the slot changes.
window.addEventListener("resize", function () { renderEncounter(poll.encounter); });
