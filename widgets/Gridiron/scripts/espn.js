/*
 * espn.js — reads ESPN's public NFL scoreboard and standings (no key; the
 * same unofficial endpoints most scoreboard apps use) and flattens them.
 *
 *   Espn.scoreboard() -> Promise<{ week, season, games: [...] }>
 *   Espn.standings()  -> Promise<[{ name, teams: [...] }]>
 *
 * The API is undocumented, so every field is read defensively: anything
 * missing is left out rather than breaking the widget.
 */
(function (global) {
  "use strict";

  var BASE = "https://site.api.espn.com/apis";
  var SCOREBOARD = BASE + "/site/v2/sports/football/nfl/scoreboard";
  var STANDINGS = BASE + "/v2/sports/football/nfl/standings";

  function getJSON(url) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 10000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error("ESPN replied " + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  function hex(c) { return c ? "#" + String(c).replace(/^#/, "") : null; }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }

  function side(c) {
    var t = c.team || {};
    var rec = (c.records || []).find(function (r) { return r.type === "total" || r.name === "overall"; }) || (c.records || [])[0];
    return {
      id: String(t.id || ""),
      abbr: t.abbreviation || "",
      name: t.shortDisplayName || t.displayName || t.abbreviation || "",
      color: hex(t.color) || "#555",
      alt: hex(t.alternateColor) || "#999",
      logo: t.logo || "",
      score: num(c.score),
      record: rec ? rec.summary : "",
      winner: !!c.winner,
    };
  }

  function game(ev) {
    var comp = (ev.competitions || [])[0] || {};
    var cs = comp.competitors || [];
    var home = cs.find(function (c) { return c.homeAway === "home"; }) || cs[0] || {};
    var away = cs.find(function (c) { return c.homeAway === "away"; }) || cs[1] || {};
    var st = (comp.status || ev.status || {});
    var type = st.type || {};
    var sit = comp.situation || null;
    var h = side(home), a = side(away);
    var poss = null;
    if (sit && sit.possession) poss = String(sit.possession) === h.id ? "home" : String(sit.possession) === a.id ? "away" : null;
    var net = (comp.broadcasts || []).map(function (b) { return (b.names || []).join("/"); }).filter(Boolean).join(", ");
    return {
      id: String(ev.id || comp.id || ""),
      start: Date.parse(ev.date || comp.date),
      state: type.state || "pre", // pre | in | post
      final: !!type.completed,
      detail: type.shortDetail || type.detail || "",
      period: st.period || 0,
      clock: st.displayClock || "",
      home: h,
      away: a,
      possession: poss,
      down: sit ? sit.shortDownDistanceText || sit.downDistanceText || "" : "",
      spot: sit ? sit.possessionText || "" : "",
      redZone: !!(sit && sit.isRedZone),
      lastPlay: sit && sit.lastPlay ? sit.lastPlay.text || "" : "",
      network: net,
    };
  }

  function scoreboard() {
    return getJSON(SCOREBOARD).then(function (d) {
      var week = d.week && d.week.number;
      var season = d.season && d.season.year;
      var type = d.season && d.season.type; // 1 pre, 2 regular, 3 post
      return {
        week: week || null,
        season: season || null,
        seasonType: type || null,
        games: (d.events || []).map(game).filter(function (g) { return g.home.abbr && g.away.abbr; }),
      };
    });
  }

  // Standings come as a tree (league > conference > division). Collect every
  // node that carries standings entries; prefer divisions.
  function tables(node, out) {
    if (!node || typeof node !== "object") return out;
    if (node.standings && Array.isArray(node.standings.entries) && node.standings.entries.length) {
      out.push({ name: node.name || node.abbreviation || "", full: node.name || "", entries: node.standings.entries });
    }
    (node.children || []).forEach(function (c) { tables(c, out); });
    return out;
  }

  function stat(entry, name) {
    var s = (entry.stats || []).find(function (x) { return x.name === name || x.type === name; });
    return s ? (s.value != null ? s.value : num(s.displayValue)) : null;
  }

  function toTable(t) {
    var teams = t.entries.map(function (e) {
      var team = e.team || {};
      return {
        abbr: team.abbreviation || "",
        name: team.shortDisplayName || team.displayName || "",
        color: hex(team.color) || "#555",
        w: stat(e, "wins") || 0,
        l: stat(e, "losses") || 0,
        t: stat(e, "ties") || 0,
        pct: stat(e, "winPercent"),
      };
    }).sort(function (a, b) { return (b.pct != null ? b.pct : b.w) - (a.pct != null ? a.pct : a.w) || b.w - a.w; });
    var name = t.name.replace(/^American Football Conference/, "AFC").replace(/^National Football Conference/, "NFC");
    return { name: name, teams: teams };
  }

  var DIV = /\b(AFC|NFC)\b.*\b(East|West|North|South)\b/i;

  function standings() {
    return getJSON(STANDINGS + "?level=3").then(function (d) {
      var all = tables(d, []);
      var divs = all.filter(function (t) { return DIV.test(t.name) || DIV.test(t.full); });
      if (divs.length) return divs.map(toTable);
      if (all.length) return all.map(toTable); // conference tables if divisions aren't split out
      return getJSON(STANDINGS).then(function (d2) { return tables(d2, []).map(toTable); });
    });
  }

  global.Espn = { scoreboard: scoreboard, standings: standings, _game: game };
})(window);
