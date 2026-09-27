/*
 * source.js — builds a PIT WALL feed (docs/f1-edge-feed.md, version 1) straight
 * from the same public APIs the F1 dashboard (Karieo/F1-Dashboard) uses:
 * OpenF1 for the live session and Jolpica (Ergast successor) for the schedule
 * and standings. Helpers mirror the dashboard's so both show the same numbers.
 *
 *   PitSource.build() -> Promise<feed>
 *
 * Each endpoint has its own refresh interval, so calling build() every few
 * seconds only re-fetches what is due.
 *
 * OpenF1 access (openf1.org/auth.html): data from 30 min before a session to
 * 30 min after it is "live" and needs a paid sponsor account; everything else
 * is free, limited to 3 requests/s and 30/min. This widget never stores a
 * login, so during that window it reports the lock instead of polling, and
 * afterwards shows the session's final classification (free, fetched rarely).
 */
(function (global) {
  "use strict";

  var OPENF1 = "https://api.openf1.org/v1";
  var JOLPICA = "https://api.jolpi.ca/ergast/f1";

  // Refresh intervals (ms) per endpoint.
  // Session results after the window don't change, so they're fetched rarely.
  var EVERY = {
    session: 60000, drivers: 600000, position: 600000, intervals: 600000,
    stints: 600000, pit: 600000, raceControl: 600000, next: 3600000, standings: 600000,
  };
  var WINDOW = 30 * 60000;      // OpenF1's paid "live" margin around a session
  var SHOW_FINAL_FOR = 6 * 3600000; // keep showing final results this long
  var liveLocked = null;        // session_key whose live window we're waiting out

  var COMPOUND = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };

  // Same fallback idea as the dashboard; OpenF1's team_colour wins when known.
  var TEAM_COLOR_FALLBACK = [
    [/red bull/i, "#3671C6"], [/racing bulls|^rb|visa/i, "#6692FF"], [/ferrari/i, "#E8002D"],
    [/mercedes/i, "#27F4D2"], [/mclaren/i, "#FF8000"], [/aston/i, "#229971"], [/alpine/i, "#0093CC"],
    [/williams/i, "#64C4FF"], [/sauber|audi|kick/i, "#52E252"], [/haas/i, "#B6BABD"], [/cadillac/i, "#C0C0C0"],
  ];

  var cache = {}; // name -> { at, data }
  var sessionKey = null;

  function qs(params) {
    return Object.keys(params).filter(function (k) { return params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
  }

  function fetchJSON(url) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      clearTimeout(t);
      if (r.status === 401 || r.status === 403) { var e = new Error("locked"); e.locked = true; throw e; }
      if (r.status === 429) throw new Error("rate limited, slowing down");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  // Fetch `name` if its interval has passed; otherwise reuse the cached copy.
  // A failed refresh keeps the old copy (and rethrows only if there is none).
  function due(name, url, force) {
    var c = cache[name];
    if (c && !force && Date.now() - c.at < EVERY[name]) return Promise.resolve(c.data);
    return fetchJSON(url).then(function (data) {
      cache[name] = { at: Date.now(), data: data };
      return data;
    }, function (err) {
      if (c) return c.data;
      throw err;
    });
  }

  function latestPerDriver(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var prev = map[row.driver_number];
      if (!prev || new Date(row.date) >= new Date(prev.date)) map[row.driver_number] = row;
    });
    return map;
  }

  function currentStints(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var prev = map[row.driver_number];
      if (!prev || row.stint_number >= prev.stint_number) map[row.driver_number] = row;
    });
    return map;
  }

  function fmtGap(v) {
    if (v === null || v === undefined) return "LEADER";
    if (typeof v === "string") return v;
    return "+" + v.toFixed(3);
  }

  function fmtInterval(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return "+" + v.toFixed(3);
  }

  function teamColor(name, hex) {
    if (hex) return "#" + String(hex).replace(/^#/, "");
    for (var i = 0; i < TEAM_COLOR_FALLBACK.length; i++) if (TEAM_COLOR_FALLBACK[i][0].test(name || "")) return TEAM_COLOR_FALLBACK[i][1];
    return "#5f676f";
  }

  // Flag state from the most recent race-control messages.
  function flagFrom(rc) {
    var msgs = (rc || []).slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var status = "green";
    msgs.forEach(function (m) {
      var text = String(m.message || "").toUpperCase();
      var flag = String(m.flag || "").toUpperCase();
      var scope = String(m.scope || "").toUpperCase();
      if (/CHEQUERED/.test(flag)) status = "chequered";
      else if (flag === "RED") status = "red";
      else if (/VIRTUAL SAFETY CAR DEPLOYED|VSC DEPLOYED/.test(text)) status = "vsc";
      else if (/SAFETY CAR DEPLOYED/.test(text)) status = "sc";
      else if (/SAFETY CAR IN THIS LAP|VSC ENDING|VIRTUAL SAFETY CAR ENDING/.test(text)) status = status === "sc" || status === "vsc" ? status : "green";
      else if (flag === "GREEN" || flag === "CLEAR" && scope === "TRACK") status = "green";
      else if ((flag === "YELLOW" || flag === "DOUBLE YELLOW") && scope !== "SECTOR" && status === "green") status = "yellow";
    });
    return status;
  }

  function currentLap(rc) {
    var lap = 0;
    (rc || []).forEach(function (m) { if (m.lap_number > lap) lap = m.lap_number; });
    return lap;
  }

  // ---- Sections ----------------------------------------------------------------

  // Returns { live, locked }: `live` is the tower data (final results after a
  // session), `locked` is set while OpenF1's paid live window is open.
  function buildLive() {
    return due("session", OPENF1 + "/sessions?" + qs({ session_key: "latest" })).then(function (rows) {
      var s = Array.isArray(rows) ? rows[0] : null;
      if (!s) return { live: null };
      var now = Date.now();
      var start = Date.parse(s.date_start), end = Date.parse(s.date_end);
      if (now < start - WINDOW) return { live: null };
      if (now <= end + WINDOW) {
        // Paid window: don't poll locked endpoints. The weekend view carries on.
        liveLocked = s.session_key;
        return { live: null, locked: { session: s.session_name || "Session", until: end + WINDOW } };
      }
      if (now > end + WINDOW + SHOW_FINAL_FOR) return { live: null };
      if (s.session_key !== sessionKey) {
        sessionKey = s.session_key;
        ["drivers", "position", "intervals", "stints", "pit", "raceControl"].forEach(function (k) { delete cache[k]; });
      }
      var key = { session_key: s.session_key };
      return Promise.all([
        due("drivers", OPENF1 + "/drivers?" + qs(key)),
        due("position", OPENF1 + "/position?" + qs(key)),
        due("intervals", OPENF1 + "/intervals?" + qs(key)).catch(function () { return []; }),
        due("stints", OPENF1 + "/stints?" + qs(key)).catch(function () { return []; }),
        due("pit", OPENF1 + "/pit?" + qs(key)).catch(function () { return []; }),
        due("raceControl", OPENF1 + "/race_control?" + qs(key)).catch(function () { return []; }),
      ]).then(function (r) {
        var drivers = {};
        (r[0] || []).forEach(function (d) { drivers[d.driver_number] = d; });
        var pos = latestPerDriver(r[1]);
        var gaps = latestPerDriver(r[2]);
        var stints = currentStints(r[3]);
        var pits = r[4] || [];
        var rc = r[5] || [];
        var lap = currentLap(rc);
        var list = Object.keys(pos).map(function (n) {
          var p = pos[n], d = drivers[n] || {}, g = gaps[n] || {}, st = stints[n];
          var myPits = pits.filter(function (x) { return String(x.driver_number) === n; });
          var lastPit = myPits.length ? Date.parse(myPits[myPits.length - 1].date) : 0;
          return {
            pos: p.position,
            number: +n,
            code: d.name_acronym || "#" + n,
            team: d.team_name || "",
            color: teamColor(d.team_name, d.team_colour),
            gap: p.position === 1 ? "LEADER" : fmtGap(g.gap_to_leader),
            interval: p.position === 1 ? "" : fmtInterval(g.interval),
            tyre: st ? COMPOUND[String(st.compound).toUpperCase()] || "" : "",
            tyreAge: st && st.tyre_age_at_start != null && lap ? st.tyre_age_at_start + Math.max(0, lap - (st.lap_start || lap)) : null,
            pits: myPits.length,
            inPit: !!lastPit && Date.now() - lastPit < 40000,
            fastest: false,
            out: false,
          };
        }).sort(function (a, b) { return a.pos - b.pos; });
        list.forEach(function (d) { d.inPit = false; }); // results: nobody is "in the pit" any more
        return {
          live: list.length ? {
            session: (s.session_name || s.session_type || "Session") + " · Final",
            final: true,
            lap: lap || undefined,
            status: "chequered",
            drivers: list,
          } : null,
        };
      });
    }).catch(function (e) {
      if (e && e.locked) return { live: null, locked: { session: "Session", until: 0 } };
      throw e;
    });
  }

  var SESSION_FIELDS = [
    ["FirstPractice", "FP1"], ["SecondPractice", "FP2"], ["ThirdPractice", "FP3"],
    ["SprintQualifying", "Sprint Quali"], ["SprintShootout", "Sprint Shootout"], ["Sprint", "Sprint"], ["Qualifying", "Qualifying"],
  ];

  function iso(o) {
    if (!o || !o.date) return null;
    return o.date + "T" + (o.time || "00:00:00Z");
  }

  function buildNext() {
    return due("next", JOLPICA + "/current/next.json").then(function (data) {
      var race = data && data.MRData && data.MRData.RaceTable && data.MRData.RaceTable.Races && data.MRData.RaceTable.Races[0];
      if (!race) return null;
      var sessions = SESSION_FIELDS.map(function (f) { return race[f[0]] ? { name: f[1], start: iso(race[f[0]]) } : null; })
        .filter(Boolean);
      sessions.push({ name: "Race", start: iso(race) });
      var c = race.Circuit || {};
      return {
        round: +race.round,
        season: +race.season,
        name: race.raceName,
        circuit: c.circuitName,
        country: c.Location ? c.Location.country : "",
        sessions: sessions.filter(function (s) { return s.start; }),
      };
    });
  }

  function buildStandings() {
    return Promise.all([
      due("standings", JOLPICA + "/current/driverStandings.json"),
      (function () {
        var c = cache.constructors;
        if (c && Date.now() - c.at < EVERY.standings) return Promise.resolve(c.data);
        return fetchJSON(JOLPICA + "/current/constructorStandings.json").then(function (d) {
          cache.constructors = { at: Date.now(), data: d };
          return d;
        }, function (e) { if (c) return c.data; throw e; });
      })(),
    ]).then(function (r) {
      var dl = pick(r[0], "DriverStandings");
      var cl = pick(r[1], "ConstructorStandings");
      // Colors: OpenF1's team colours for the current session when we have them.
      var byTeam = {};
      var drv = cache.drivers && cache.drivers.data;
      (drv || []).forEach(function (d) { if (d.team_name && d.team_colour) byTeam[d.team_name.toLowerCase()] = d.team_colour; });
      var color = function (name) {
        var hex = null;
        Object.keys(byTeam).forEach(function (t) { if (!hex && (t.indexOf(String(name).toLowerCase()) >= 0 || String(name).toLowerCase().indexOf(t) >= 0)) hex = byTeam[t]; });
        return teamColor(name, hex);
      };
      return {
        drivers: dl.map(function (s) {
          var d = s.Driver || {}, team = s.Constructors && s.Constructors[0] ? s.Constructors[0].name : "";
          return { pos: +s.position || +s.positionText || 0, code: d.code || "", name: (d.givenName || "") + " " + (d.familyName || ""), team: team, color: color(team), points: +s.points };
        }),
        constructors: cl.map(function (s) {
          var name = s.Constructor ? s.Constructor.name : "";
          return { pos: +s.position || 0, name: name, color: color(name), points: +s.points };
        }),
      };
    });
  }

  function pick(data, field) {
    var lists = data && data.MRData && data.MRData.StandingsTable && data.MRData.StandingsTable.StandingsLists;
    return (lists && lists[0] && lists[0][field]) || [];
  }

  // ---- Public ------------------------------------------------------------------------

  function build() {
    var errors = [];
    var soft = function (p, label) {
      return p.catch(function (e) { errors.push(label + ": " + (e && e.message || "failed")); return null; });
    };
    return Promise.all([soft(buildLive(), "OpenF1"), soft(buildNext(), "Schedule"), soft(buildStandings(), "Standings")])
      .then(function (r) {
        if (!r[0] && !r[1] && !r[2] && errors.length) throw new Error(errors[0]);
        var l = r[0] || {};
        return { version: 1, updated: new Date().toISOString(), live: l.live || null, liveLocked: l.locked || null, next: r[1], standings: r[2], warnings: errors };
      });
  }

  global.PitSource = { build: build, _flagFrom: flagFrom, _reset: function () { cache = {}; sessionKey = null; } };
})(window);
