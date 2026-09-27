/*
 * espn.js — reads ESPN's public NFL scoreboard and standings (no key; the
 * same unofficial endpoints most scoreboard apps use) and flattens them.
 *
 *   Espn.scoreboard() -> Promise<{ week, season, games: [...] }>
 *   Espn.standings()  -> Promise<[{ name, teams: [...] }]>
 *   Espn.summary(id)  -> Promise<{ drive, scoring, leaders, stats, winProb, info }>
 *
 * The API is undocumented, so every field is read defensively: anything
 * missing is left out rather than breaking the widget.
 */
(function (global) {
  "use strict";

  var BASE = "https://site.api.espn.com/apis";
  var SCOREBOARD = BASE + "/site/v2/sports/football/nfl/scoreboard";
  var STANDINGS = BASE + "/v2/sports/football/nfl/standings";
  var SUMMARY = BASE + "/site/v2/sports/football/nfl/summary";
  var GAMECAST = "https://www.espn.com/nfl/game/_/gameId/";

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
      lines: (c.linescores || []).map(function (l) { return num(l.value != null ? l.value : l.displayValue); }),
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
    var link = (ev.links || []).find(function (l) { return (l.rel || []).indexOf("summary") >= 0 && /^https:\/\/(www\.)?espn\.com\//.test(l.href || ""); });
    var venue = comp.venue || {};
    var addr = venue.address || {};
    var odds = (comp.odds || [])[0] || {};
    var wx = ev.weather || comp.weather || null;
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
      distance: sit ? num(sit.distance) : null,
      downNum: sit ? num(sit.down) : null,
      downText: sit ? sit.downDistanceText || "" : "",
      timeouts: sit ? { home: num(sit.homeTimeouts), away: num(sit.awayTimeouts) } : null,
      link: link ? link.href : GAMECAST + String(ev.id || comp.id || ""),
      venue: [venue.fullName, [addr.city, addr.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      weather: wx ? [wx.temperature != null ? wx.temperature + "°" : "", wx.displayValue || ""].filter(Boolean).join(" ") : "",
      odds: [odds.details, odds.overUnder != null ? "O/U " + odds.overUnder : ""].filter(Boolean).join(" · "),
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

  // ---- Gamecast (one game) ----

  function playLine(p) {
    var st = p.start || {};
    return { text: p.text || (p.type && p.type.text) || "", dd: st.downDistanceText || st.shortDownDistanceText || "", scoring: !!p.scoringPlay };
  }

  function drive(d) {
    if (!d) return null;
    var plays = (d.plays || []).map(playLine).filter(function (p) { return p.text; }).reverse();
    return {
      team: String((d.team && d.team.id) || ""),
      abbr: (d.team && d.team.abbreviation) || "",
      description: d.description || "",
      result: d.displayResult || d.result || "",
      plays: plays,
    };
  }

  // leaders: [{ team:{id}, leaders:[{ name, displayName, leaders:[{ displayValue, athlete }] }] }]
  function leaders(list) {
    var byCat = {};
    var order = [];
    (list || []).forEach(function (t) {
      var id = String((t.team && t.team.id) || "");
      (t.leaders || []).forEach(function (cat) {
        var top = (cat.leaders || [])[0];
        if (!top) return;
        var key = cat.name || cat.displayName;
        if (!byCat[key]) { byCat[key] = { label: (cat.displayName || key).replace(/ Yards$/, ""), teams: {} }; order.push(key); }
        var a = top.athlete || {};
        byCat[key].teams[id] = { name: a.shortName || a.displayName || "", pos: (a.position && a.position.abbreviation) || "", value: top.displayValue || "" };
      });
    });
    return order.map(function (k) { return byCat[k]; });
  }

  var STAT_PICK = ["totalYards", "netPassingYards", "rushingYards", "firstDowns", "thirdDownEff", "turnovers", "totalPenaltiesYards", "sacksYardsLost", "possessionTime"];

  function stats(teams) {
    var t = teams || [];
    if (t.length < 2) return [];
    var ids = t.map(function (x) { return String((x.team && x.team.id) || ""); });
    var rows = [];
    STAT_PICK.forEach(function (name) {
      var vals = t.map(function (x) { return (x.statistics || []).find(function (s) { return s.name === name; }); });
      if (!vals[0] || !vals[1]) return;
      var r = { label: vals[0].label || name, teams: {} };
      r.teams[ids[0]] = vals[0].displayValue;
      r.teams[ids[1]] = vals[1].displayValue;
      rows.push(r);
    });
    return rows;
  }

  function summary(id) {
    return getJSON(SUMMARY + "?event=" + encodeURIComponent(id)).then(function (d) {
      var dr = d.drives || {};
      var prev = dr.previous || [];
      var wp = (d.winprobability || []);
      var last = wp.length ? wp[wp.length - 1] : null;
      var gi = d.gameInfo || {};
      var v = gi.venue || {};
      var addr = v.address || {};
      return {
        drive: drive(dr.current) || drive(prev[prev.length - 1]),
        live: !!dr.current,
        scoring: (d.scoringPlays || []).map(function (p) {
          return {
            team: String((p.team && p.team.id) || ""),
            abbr: (p.team && p.team.abbreviation) || "",
            kind: (p.type && (p.type.abbreviation || p.type.text)) || "",
            text: p.text || "",
            period: (p.period && p.period.number) || 0,
            clock: (p.clock && p.clock.displayValue) || "",
            away: num(p.awayScore),
            home: num(p.homeScore),
          };
        }),
        leaders: leaders(d.leaders),
        stats: stats(d.boxscore && d.boxscore.teams),
        winProb: last && typeof last.homeWinPercentage === "number" ? last.homeWinPercentage : null,
        info: {
          venue: [v.fullName, [addr.city, addr.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
          weather: gi.weather ? [gi.weather.temperature != null ? gi.weather.temperature + "°" : "", gi.weather.displayValue || ""].filter(Boolean).join(" ") : "",
          attendance: gi.attendance ? Number(gi.attendance).toLocaleString("en-US") : "",
        },
      };
    });
  }

  global.Espn = { scoreboard: scoreboard, standings: standings, summary: summary, _game: game };
})(window);
