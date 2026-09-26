/* PAINT RACK — paint recipes with swatches and per-recipe progress. */

var KIND_STEP = { spray: "Prime", base: "Base", shade: "Shade", layer: "Layer", contrast: "Contrast", technical: "Technical" };

var $ = function (id) { return document.getElementById(id); };
var recipes = [];
var st = null; // { sel, done: { recipeName: [stepIndex...] } }

function onIcueDataUpdated() {
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  var custom = [1, 2, 3].map(function (i) { return parseRecipe(Edge.prop("custom" + i, "")); }).filter(Boolean);
  recipes = custom.concat(RECIPES);
  if (!st) {
    var s = Edge.store.load();
    st = { sel: s.sel || "", done: s.done || {} };
  }
  if (!recipes.some(function (r) { return r.name === st.sel; })) st.sel = recipes[0].name;
  renderList();
  renderRecipe();
}

// "Night Lords: Kantor Blue, Nuln Oil, Altdorf Guard Blue"
function parseRecipe(raw) {
  raw = String(raw || "").trim();
  if (!raw) return null;
  var colon = raw.indexOf(":");
  var name = colon >= 0 ? raw.slice(0, colon).trim() : "My recipe";
  var paints = (colon >= 0 ? raw.slice(colon + 1) : raw).split(",").map(function (p) { return p.trim(); }).filter(Boolean);
  if (!paints.length) return null;
  return {
    name: name || "My recipe",
    group: "Mine",
    steps: paints.map(function (p, i) {
      var info = paintInfo(p);
      return [info.name, KIND_STEP[info.kind] || "Step " + (i + 1), ""];
    }),
  };
}

function current() { return recipes.find(function (r) { return r.name === st.sel; }); }
function doneList(r) { return st.done[r.name] || []; }
function save() { Edge.store.save(st); }

// ---- Render ------------------------------------------------------------------

function renderList() {
  var box = $("list");
  box.innerHTML = "";
  var lastGroup = "";
  recipes.forEach(function (r) {
    if (r.group !== lastGroup) {
      lastGroup = r.group;
      var h = document.createElement("div");
      h.className = "list__group";
      h.textContent = r.group;
      box.appendChild(h);
    }
    var b = document.createElement("button");
    b.className = "card" + (r.name === st.sel ? " on" : "");
    var bands = r.steps.map(function (s) { return '<i style="background:' + paintInfo(s[0]).hex + '"></i>'; }).join("");
    var done = doneList(r).length;
    b.innerHTML = '<span class="card__bands">' + bands + '</span><span class="card__name"></span>' +
      '<span class="card__meta">' + (done ? done + " / " + r.steps.length : r.steps.length + " steps") + "</span>";
    b.querySelector(".card__name").textContent = r.name;
    Edge.press(b, function () { st.sel = r.name; save(); renderList(); renderRecipe(); });
    box.appendChild(b);
  });
  var on = box.querySelector(".card.on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
}

function renderRecipe() {
  var r = current();
  var done = doneList(r);
  $("kicker").textContent = r.group;
  $("recipeName").textContent = r.name;
  var box = $("steps");
  box.innerHTML = "";
  box.dataset.count = r.steps.length;
  r.steps.forEach(function (s, i) {
    var info = paintInfo(s[0]);
    var li = document.createElement("li");
    li.className = "step" + (done.indexOf(i) >= 0 ? " done" : "");
    li.style.setProperty("--paint", info.hex);
    li.innerHTML =
      '<span class="blob"><b>' + (i + 1) + "</b></span>" +
      '<span class="step__how"></span><span class="step__paint"></span><span class="step__tip"></span>';
    li.querySelector(".step__how").textContent = s[1];
    li.querySelector(".step__paint").textContent = info.name;
    li.querySelector(".step__tip").textContent = s[2] || "";
    Edge.press(li, function () { toggle(r, i); });
    box.appendChild(li);
  });
  renderNext(r);
}

function renderNext(r) {
  var done = doneList(r);
  var idx = -1;
  for (var i = 0; i < r.steps.length; i++) if (done.indexOf(i) < 0) { idx = i; break; }
  var card = $("nextCard");
  var pct = Math.round(done.length / r.steps.length * 100);
  $("progressFill").style.width = pct + "%";
  $("progressText").textContent = done.length + " of " + r.steps.length + " done";
  if (idx < 0) {
    card.classList.add("finished");
    $("nextBlob").style.setProperty("--paint", "#3f8a4b");
    $("nextPaint").textContent = "All done!";
    $("nextHow").textContent = "Varnish and show it off";
    return;
  }
  card.classList.remove("finished");
  var s = r.steps[idx];
  var info = paintInfo(s[0]);
  $("nextBlob").style.setProperty("--paint", info.hex);
  $("nextPaint").textContent = info.name;
  $("nextHow").textContent = s[1] + (s[2] ? " · " + s[2] : "");
}

function toggle(r, i) {
  var done = doneList(r).slice();
  var at = done.indexOf(i);
  if (at >= 0) done.splice(at, 1); else done.push(i);
  st.done[r.name] = done;
  save();
  renderRecipe();
  renderList();
}

Edge.hold($("resetBtn"), function () {
  var r = current();
  delete st.done[r.name];
  save();
  renderRecipe();
  renderList();
});
