# Heroes Tracker edge feed (for HEROES DRAFT and HEROES LIVE)

Both widgets read small JSON documents from your Heroes Tracker backend
(`Karieo/Heroes-Tracker`, running on bastion — see that repo's
`BASTION_SETUP.md`). The backend does the heavy lifting (polling
HeroesProfile, caching, rank-bracket filtering); the widgets only draw what
they're given, and never see a HeroesProfile API key.

**CORS:** the widgets run from local files inside iCUE, so every response
must include `Access-Control-Allow-Origin: *`. It's read-only personal game
data, so that's safe — the backend's `/api/edge/*` routes already set this
(see `Heroes-Tracker/backend/app.py`).

**No auth.** Don't put a HeroesProfile token in either widget; the backend
holds it.

## `GET /api/edge/heroes`

Used by both widgets to build the hero picker (cycled with the &lsaquo;/&rsaquo;
buttons instead of typed, since the Edge is a touch strip).

```jsonc
{
  "heroes": [
    { "name": "Alarak", "role": "Assassin" },
    { "name": "Ana", "role": "Support" }
  ]
}
```

## `GET /api/edge/matchup?hero=&enemy=&game_type=` (HEROES DRAFT)

```jsonc
{
  "hero": "Alarak",
  "enemy": "Malfurion",
  "game_type": "Storm League",
  "rank_tier": "Diamond",
  "matchup": { "win_rate": 54.2, "games_played": 812 },   // null if not cached yet
  "top_builds": [
    { "build": ["Talent A", "...7 total, levels 1/4/7/10/13/16/20"], "win_rate": 58.1, "games_played": 340 }
  ]
}
```

## `GET /api/edge/hero-reference?hero=&game_type=` (HEROES LIVE)

```jsonc
{
  "hero": "Alarak",
  "game_type": "Storm League",
  "rank_tier": "Diamond",
  "rank_stats": { "win_rate": 51.3, "pick_rate": 4.1, "ban_rate": 2.0, "games_played": 9021 },
  "top_builds": [ /* same shape as above, up to 5 */ ],
  "personal": { "games_played": 12, "win_rate": 66.7 }   // Clay's own record with this hero
}
```

## Polling

Both widgets refresh the hero list every 5 minutes and the matchup/reference
data on every hero/enemy/game-type change (plus whenever iCUE reinitializes
the widget). Cache upstream HeroesProfile calls on the backend side — see
`Heroes-Tracker/backend/scheduler.py`'s poll intervals.
