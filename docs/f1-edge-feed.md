# F1 Edge feed (for PIT WALL)

> PIT WALL's default source doesn't need this feed: it reads OpenF1 and Jolpica directly
> (`widgets/PitWall/scripts/source.js`), the same way the static F1 dashboard does. This
> feed is the optional **Dashboard feed URL** source, for a dashboard with a server (for
> example one that holds an OpenF1 sponsor login and can share live timing).

PIT WALL reads one small JSON document from your F1 dashboard. The dashboard does the
heavy lifting (OpenF1, Jolpica, caching); the widget only draws what it's given.

## Endpoint

`GET <dashboard>/api/edge` → `application/json`

- **CORS:** the widget runs from a local file inside iCUE, so the response must include
  `Access-Control-Allow-Origin: *`. It's read-only public F1 data, so that's safe.
- **No auth.** Don't put keys in the widget; the dashboard holds anything secret.
- **Caching:** the widget polls every 60 s normally, every 3 s while `live` is set, and
  every 15 s in the 30 minutes before a session. Cache upstream calls on the dashboard side.
- Every field except `version` is optional. Missing sections are just hidden.

## Shape (version 1)

```jsonc
{
  "version": 1,
  "updated": "2026-10-04T12:34:56Z",          // when the dashboard built this

  "next": {                                   // next (or current) race weekend
    "round": 18,
    "season": 2026,
    "name": "Singapore Grand Prix",
    "circuit": "Marina Bay",
    "country": "Singapore",
    "sessions": [                             // UTC ISO times; widget shows local time
      { "name": "FP1",        "start": "2026-10-02T09:30:00Z" },
      { "name": "Qualifying", "start": "2026-10-03T13:00:00Z" },
      { "name": "Race",       "start": "2026-10-04T12:00:00Z" }
    ]
  },

  "live": {                                   // null or absent when nothing is running
    "session": "Race",                        // Race | Sprint | Qualifying | FP1 ...
    "lap": 34, "totalLaps": 62,               // omit for timed sessions
    "remaining": "12:31",                     // optional, for timed sessions
    "status": "green",                        // green | yellow | sc | vsc | red | chequered
    "drivers": [
      {
        "pos": 1, "number": 1, "code": "VER",
        "team": "Red Bull Racing", "color": "#3671C6",
        "gap": "LEADER",                      // to leader: "LEADER", "+1.234", "+1 LAP"
        "interval": "",                       // to car ahead, same format
        "tyre": "M",                          // S | M | H | I | W
        "tyreAge": 12, "pits": 1,
        "fastest": false,                     // holds fastest lap
        "out": false,                         // retired / DNF
        "inPit": false
      }
    ]
  },

  "standings": {
    "drivers": [
      { "pos": 1, "code": "NOR", "name": "Lando Norris", "team": "McLaren",
        "color": "#FF8000", "points": 312 }
    ],
    "constructors": [
      { "pos": 1, "name": "McLaren", "color": "#FF8000", "points": 598 }
    ]
  }
}
```

## Where the data usually comes from

| Feed field | Source the dashboard can use |
|---|---|
| `next` | Jolpica `/ergast/f1/current/next.json` (race + session times) |
| `standings` | Jolpica `/ergast/f1/current/driverstandings.json`, `constructorstandings.json` |
| `live` | OpenF1 `position`, `intervals`, `stints`, `pit`, `race_control`, `laps` for `session_key=latest` |
| `color` | OpenF1 `drivers` (`team_colour`) |

A full sample lives in `widgets/PitWall/scripts/sample.js` (`PITWALL_SAMPLE`); PIT WALL shows it when no
dashboard URL is set, so you can see the layout before the endpoint exists.
