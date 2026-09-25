/* QUESTS — pixel-RPG chore board: daily quests, XP, levels, streaks, reward. */

var QUEST_COUNT = 8;
var DEFAULT_QUESTS = [
  "Make your bed | 10", "Brush teeth (morning) | 5", "Homework | 20", "Read for 20 minutes | 15",
  "Tidy your room | 15", "Help with dinner | 10", "Brush teeth (night) | 5",
];
var DEFAULT_REWARD = "Pick the movie | 300";

// 16x16 sprites, one string per row. Letters index into the palette.
var HERO = [
  "......kkkk......",
  ".....kssssk.....",
  "....kssssssk....",
  "....kshhhhsk....",
  "....khffffhk....",
  "....kfekkefk....",
  "....kffffffk....",
  ".....kffffk.....",
  "...kkbbbbbbkk...",
  "..kfkbbyybbkfk..",
  "..kfkbbyybbkfk..",
  "..kk.bbbbbb.kk..",
  ".....pppppp.....",
  ".....pp..pp.....",
  ".....kk..kk.....",
  "....kkk..kkk....",
];
var CHEST_SHUT = [
  "................",
  "................",
  "................",
  "..kkkkkkkkkkkk..",
  ".kwwwwwwwwwwwwk.",
  ".kwWWWWWWWWWWwk.",
  ".kwwwwwwwwwwwwk.",
  ".kkkkkkggkkkkkk.",
  ".kwwwwwgyywwwwk.",
  ".kwWWWWgyyWWWwk.",
  ".kwwwwwwggwwwwk.",
  ".kwWWWWWWWWWWwk.",
  ".kwwwwwwwwwwwwk.",
  ".kkkkkkkkkkkkkk.",
  "................",
  "................",
];
var CHEST_OPEN = [
  "..y.....y....y..",
  "....y.......y...",
  "..kkkkkkkkkkkk..",
  ".kwWWWWWWWWWWwk.",
  ".kwwwwwwwwwwwwk.",
  ".kkyyyyyyyyyykk.",
  ".kyyYyyyYyyyyyk.",
  ".kkkkkkggkkkkkk.",
  ".kwwwwwgyywwwwk.",
  ".kwWWWWgyyWWWwk.",
  ".kwwwwwwggwwwwk.",
  ".kwWWWWWWWWWWwk.",
  ".kwwwwwwwwwwwwk.",
  ".kkkkkkkkkkkkkk.",
  "................",
  "................",
];
var PALETTE = {
  k: "#1a1030", s: "#9aa3b5", h: "#5d6780", f: "#f2c9a0", e: "#1a1030",
  b: "#3d7bd9", y: "#ffd23f", Y: "#fff3b0", p: "#5a3a8c",
  w: "#b86b2a", W: "#d9913f", g: "#8a8f99",
};

var $ = function (id) { return document.getElementById(id); };
var cfg = { quests: [], reward: null, hero: "Kiddo" };
var st = null; // saved state
var popTimer = null;

// ---- Settings and state ------------------------------------------------------

function onIcueDataUpdated() {
  var inIcue = Edge.inIcue();
  cfg.hero = Edge.prop("heroName", "Kiddo");
  cfg.quests = [];
  for (var i = 1; i <= QUEST_COUNT; i++) {
    var q = parseLine(inIcue ? Edge.prop("quest" + i, "") : DEFAULT_QUESTS[i - 1], 10);
    if (q) cfg.quests.push(q);
  }
  cfg.reward = parseLine(inIcue ? Edge.prop("reward", "") : DEFAULT_REWARD, 300);
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  if (!st) load();
  rollDay();
  render();
}

// "Quest name | 15" -> { label, xp }
function parseLine(raw, fallbackXp) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  var bar = raw.lastIndexOf("|");
  var label = (bar >= 0 ? raw.slice(0, bar) : raw).trim();
  var xp = bar >= 0 ? parseInt(raw.slice(bar + 1), 10) : fallbackXp;
  if (!label) return null;
  return { label: label, xp: isNaN(xp) || xp < 0 ? fallbackXp : Math.min(xp, 9999) };
}

function load() {
  var s = Edge.store.load();
  st = {
    xp: s.xp || 0,
    day: s.day || dayKey(new Date()),
    done: Array.isArray(s.done) ? s.done : [], // quest labels done today
    streak: s.streak || 0,
    lastFull: s.lastFull || "",
    week: s.week || {}, // dayKey -> 0..1 share of quests done
    claimed: s.claimed || 0,
  };
}

function save() { Edge.store.save(st); }

function dayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function addDays(key, n) {
  var p = key.split("-");
  return dayKey(new Date(+p[0], p[1] - 1, +p[2] + n));
}

// New day: clear the board. The streak survives only if yesterday was full.
function rollDay() {
  var today = dayKey(new Date());
  if (st.day === today) return;
  st.day = today;
  st.done = [];
  if (st.lastFull !== addDays(today, -1)) st.streak = 0;
  // Keep two weeks of history.
  Object.keys(st.week).forEach(function (k) { if (k < addDays(today, -14)) delete st.week[k]; });
  save();
}

function isDone(q) { return st.done.indexOf(q.label) >= 0; }

function toggle(q, el) {
  rollDay();
  var levelBefore = levelOf(st.xp);
  if (isDone(q)) {
    st.done.splice(st.done.indexOf(q.label), 1);
    st.xp = Math.max(0, st.xp - q.xp);
  } else {
    st.done.push(q.label);
    st.xp += q.xp;
    hop();
    popup("+" + q.xp + " XP", el);
  }
  var doneCount = cfg.quests.filter(isDone).length;
  st.week[st.day] = cfg.quests.length ? doneCount / cfg.quests.length : 0;
  if (doneCount === cfg.quests.length && cfg.quests.length && st.lastFull !== st.day) {
    st.streak = st.lastFull === addDays(st.day, -1) ? st.streak + 1 : 1;
    st.lastFull = st.day;
    setTimeout(function () { popup("All quests done! Streak " + st.streak, null, "big"); }, 700);
  }
  if (levelOf(st.xp) > levelBefore) setTimeout(function () { popup("LEVEL UP! LV " + levelOf(st.xp), null, "big"); }, 350);
  save();
  render();
}

function claimReward() {
  if (!cfg.reward || spendable() < cfg.reward.xp) {
    popup(cfg.reward ? "Need " + (cfg.reward.xp - spendable()) + " more XP" : "No reward set", null);
    return;
  }
  st.claimed += cfg.reward.xp;
  save();
  render();
  $("chestBox").classList.add("opened");
  drawSprite($("chestArt"), CHEST_OPEN);
  popup("Reward! " + cfg.reward.label, null, "big");
  setTimeout(function () { $("chestBox").classList.remove("opened"); render(); }, 3500);
}

// XP toward rewards: everything earned minus what rewards already cost.
function spendable() { return Math.max(0, st.xp - st.claimed); }

// Level L starts at 50 * L * (L - 1) XP: 0, 100, 300, 600, 1000...
function levelOf(xp) {
  var l = 1;
  while (50 * (l + 1) * l <= xp) l++;
  return l;
}
function levelStart(l) { return 50 * l * (l - 1); }

// ---- Render ------------------------------------------------------------------

function render() {
  $("heroLabel").textContent = cfg.hero;
  var lv = levelOf(st.xp);
  var from = levelStart(lv), to = levelStart(lv + 1);
  $("level").textContent = lv;
  $("xpText").textContent = (st.xp - from) + " / " + (to - from);
  renderSegments($("xpBar"), (st.xp - from) / (to - from), 20);

  var alive = st.lastFull === st.day || st.lastFull === addDays(st.day, -1);
  var streak = alive ? st.streak : 0;
  $("streak").innerHTML = streak ? '<i class="flame"></i>' + streak + " day" + (streak === 1 ? "" : "s") : "No streak yet";
  renderWeek();

  var box = $("quests");
  box.innerHTML = "";
  box.dataset.count = cfg.quests.length;
  var todayXp = 0;
  cfg.quests.forEach(function (q) {
    var done = isDone(q);
    if (done) todayXp += q.xp;
    var b = document.createElement("button");
    b.className = "quest" + (done ? " done" : "");
    b.innerHTML = '<span class="quest__box"></span><span class="quest__label"></span><span class="quest__xp"></span>';
    b.querySelector(".quest__label").textContent = q.label;
    b.querySelector(".quest__xp").textContent = q.xp + " XP";
    Edge.press(b, function () { toggle(q, b); });
    box.appendChild(b);
  });
  if (!cfg.quests.length) box.innerHTML = '<div class="empty">Add quests in the widget settings</div>';
  $("todayXp").textContent = todayXp + " XP";

  var r = cfg.reward;
  $("rewardName").textContent = r ? r.label : "Set a reward";
  var have = spendable();
  $("rewardFill").style.width = r ? Math.min(100, have / Math.max(1, r.xp) * 100) + "%" : "0";
  $("rewardCost").textContent = r ? (have >= r.xp ? "Hold to open!" : have + " / " + r.xp + " XP") : "";
  $("chestBox").classList.toggle("ready", !!r && have >= r.xp);
  if (!$("chestBox").classList.contains("opened")) drawSprite($("chestArt"), CHEST_SHUT);
}

function renderSegments(el, frac, n) {
  if (el.children.length !== n) {
    el.innerHTML = "";
    for (var i = 0; i < n; i++) el.appendChild(document.createElement("i"));
  }
  var lit = Math.round(Math.max(0, Math.min(1, frac)) * n);
  Array.prototype.forEach.call(el.children, function (c, i) { c.className = i < lit ? "on" : ""; });
}

function renderWeek() {
  var box = $("week");
  box.innerHTML = "";
  for (var i = 6; i >= 0; i--) {
    var key = addDays(st.day, -i);
    var p = key.split("-");
    var d = new Date(+p[0], p[1] - 1, +p[2]);
    var share = st.week[key] || 0;
    var cell = document.createElement("div");
    cell.className = "wk" + (i === 0 ? " wk--today" : "") + (share >= 1 ? " wk--full" : share > 0 ? " wk--part" : "");
    cell.innerHTML = '<span class="wk__gem"></span><span class="wk__day">' + "SMTWTFS".charAt(d.getDay()) + "</span>";
    box.appendChild(cell);
  }
}

function drawSprite(svg, rows) {
  var out = "";
  rows.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      var c = PALETTE[row.charAt(x)];
      if (c) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + c + '"/>';
    }
  });
  svg.innerHTML = out;
}

function hop() {
  var s = $("sprite");
  s.classList.remove("hop");
  void s.getBoundingClientRect();
  s.classList.add("hop");
}

function popup(msg, anchor, kind) {
  var el = $("pop");
  el.textContent = msg;
  el.className = "pop show" + (kind ? " " + kind : "");
  if (anchor) {
    var r = anchor.getBoundingClientRect();
    el.style.left = r.left + r.width / 2 + "px";
    el.style.top = r.top + "px";
  } else {
    el.style.left = "50%";
    el.style.top = "40%";
  }
  clearTimeout(popTimer);
  popTimer = setTimeout(function () { el.className = "pop"; }, kind ? 2200 : 900);
}

// ---- Wiring --------------------------------------------------------------------

drawSprite($("sprite"), HERO);
Edge.hold($("chestBox"), claimReward, 900);
setInterval(function () {
  if (!st) return;
  var before = st.day;
  rollDay();
  if (st.day !== before) render();
}, 30000);
