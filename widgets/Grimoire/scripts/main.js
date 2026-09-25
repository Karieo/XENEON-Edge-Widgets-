/* GRIMOIRE — 5e (2014) rules quick reference. Text in srd.js (SRD 5.1, CC-BY-4.0). */

var $ = function (id) { return document.getElementById(id); };
var view = null; // { tab, entry }
var startTab = null;

function onIcueDataUpdated() {
  document.documentElement.style.setProperty("--widget-opacity", String(1 - Number(Edge.prop("transparency", 0)) / 100));
  var wanted = Edge.prop("startTab", "conditions");
  if (!view || wanted !== startTab) {
    startTab = wanted;
    var saved = Edge.store.load();
    // Reopen where you left off unless the setting changed.
    if (saved.tab && saved.start === wanted && tabByKey(saved.tab)) view = { tab: saved.tab, entry: saved.entry };
    else view = { tab: tabByKey(wanted) ? wanted : SRD_TABS[0].key, entry: null };
    renderRibbons();
    showTab(view.tab, view.entry);
  }
}

function tabByKey(key) {
  return SRD_TABS.find(function (t) { return t.key === key; }) || null;
}

function renderRibbons() {
  var nav = $("ribbons");
  nav.innerHTML = "";
  SRD_TABS.forEach(function (t) {
    var b = document.createElement("button");
    b.className = "ribbon";
    b.dataset.tab = t.key;
    b.textContent = t.title;
    Edge.press(b, function () { showTab(t.key, null); });
    nav.appendChild(b);
  });
}

function showTab(key, entryName) {
  var tab = tabByKey(key);
  view.tab = key;
  Array.prototype.forEach.call($("ribbons").children, function (b) { b.classList.toggle("on", b.dataset.tab === key); });
  $("tabTitle").textContent = tab.title;
  var chips = $("chips");
  chips.innerHTML = "";
  chips.dataset.count = tab.entries.length;
  if (tab.entries.length > 9) chips.dataset.dense = ""; else delete chips.dataset.dense;
  tab.entries.forEach(function (e) {
    var c = document.createElement("button");
    c.className = "chip";
    c.textContent = e.name;
    c.dataset.name = e.name;
    Edge.press(c, function () { showEntry(e); });
    chips.appendChild(c);
  });
  var entry = tab.entries.find(function (e) { return e.name === entryName; }) || tab.entries[0];
  showEntry(entry);
}

function showEntry(e) {
  view.entry = e.name;
  Array.prototype.forEach.call($("chips").children, function (c) { c.classList.toggle("on", c.dataset.name === e.name); });
  $("entryName").textContent = e.name;
  $("entryTag").textContent = e.tag || "";
  var body = $("entryBody");
  body.innerHTML = "";
  if (e.table) {
    var t = document.createElement("table");
    e.table.forEach(function (row, i) {
      var tr = document.createElement("tr");
      row.forEach(function (cell) {
        var td = document.createElement(i === 0 ? "th" : "td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    body.appendChild(t);
  }
  if (e.lines) {
    var ul = document.createElement("ul");
    e.lines.forEach(function (l) {
      var li = document.createElement("li");
      li.textContent = l;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }
  var leaf = $("leaf");
  leaf.classList.remove("turn");
  void leaf.offsetWidth;
  leaf.classList.add("turn");
  fitBody();
  Edge.store.save({ tab: view.tab, entry: view.entry, start: startTab });
}

// Long entries shrink their text a little rather than scroll.
function fitBody() {
  var body = $("entryBody");
  var scale = 1;
  body.style.setProperty("--fit", "1");
  while (body.scrollHeight > body.clientHeight + 2 && scale > 0.55) {
    scale -= 0.05;
    body.style.setProperty("--fit", scale.toFixed(2));
  }
}

window.addEventListener("resize", fitBody);
