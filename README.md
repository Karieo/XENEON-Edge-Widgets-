# Xeneon Edge Widgets

Custom iCUE widgets for the Corsair Xeneon Edge (14.5" touch strip under the main monitor). Plain HTML/CSS/JS. The only build step is copying `shared/` into each widget and packaging it with Corsair's CLI.

| Widget | Status | What it does |
|---|---|---|
| **Edge Test Kit** | Ready to test | Runs the day-1 hardware checklist from `RESEARCH.md` on the device |
| **DATACORE** | v0.1, untested on hardware | CPU/GPU temps with 60 s trends + fans, now playing, clock, big ASK CLAUDE button |
| **OKTAI** | v0.1, untested on hardware | Oktai's table tracker for Drakkenheim (2014 rules): HP, hit dice, ki, superiority dice, Action Surge, Second Wind, contamination, rests, dice |
| **STRATUM DM** | v0.1, untested on hardware | Live initiative from DATACORE (read-only) with an encounter summary, round counter + round time, session timer, random complications and NPCs |
| **GAME HUD** | v0.1, untested on hardware | Motorsport-telemetry look: shift lights, huge FPS with a 60-second trace, GPU load, GPU temp, CPU temp. No touch controls |
| **FORGE** | v0.1, untested on hardware | Mini Forge Dad painting-session timer: session clock, per-stage splits, paint dry timer, who's painting, weekly/all-time log |
| **CREATOR** | v0.1, untested on hardware | YouTube channel stats: subscribers, views, 14-day views chart, latest upload, recent uploads. Light or dark |
| **ON AIR** | v0.1, untested on hardware | OBS control: record/stream with timers (hold to stop), scene buttons, mic/desktop mute with live meters, chapter marks, replay clips, recording health |

Widgets don't all share one look on purpose. DATACORE and STRATUM DM use the DATACORE terminal theme (they're tied to that app), OKTAI has a grim Drakkenheim theme, GAME HUD looks like race telemetry, FORGE looks like a hobby desk, CREATOR looks like a clean creator-studio dashboard (light or dark), and ON AIR looks like a broadcast console. Themes live in `shared/styles/` on top of a common `base.css`.

Read `RESEARCH.md` before changing anything. Section 0 lists what this repo learned about the iCUE widget rules and corrects a few wrong assumptions.

## Build

Needs Node.js 18+.

```bash
npm install          # installs icuewidget-cli locally
npm run build        # all widgets -> dist/*.icuewidget
npm run build -- Datacore
```

`tools/build.mjs` copies `shared/` into `widgets/<Name>/shared/` (gitignored), then runs `icuewidget package`, which validates first.

## Install on the Edge

1. iCUE 5.47 or newer.
2. iCUE → **Widgets** → **+** → pick the `.icuewidget` file from `dist/`.
3. Add the widget to the Edge at **Extra Large** (2536×696) size.
4. Open the widget's settings → second tab → turn **Custom Style** on. With it off, iCUE swaps in its default colors instead of the DATACORE palette.

## DATACORE settings

| Setting | Default | Notes |
|---|---|---|
| CPU Temperature | iCUE default temp sensor | Until you pick different CPU and GPU sensors, the widget auto-detects them by sensor kind and says so on screen |
| GPU Temperature | iCUE default temp sensor | |
| Extra Sensors (fans, load) | default fan | Up to 4 shown. Each entry's color is used for its underline |
| Warm At / Hot At | 70 / 85 °C | Cyan → amber → red. Converted automatically if iCUE reports °F |
| ASK CLAUDE Opens | claude.ai in browser | Switch to "Claude desktop app" to try `claude://` |
| Scanlines | on | Pure CSS |
| Text / Accent / Background / Transparency | DATACORE palette | Needs Custom Style on |

Also on screen: a 60-second trend graph under each temperature, a clock and date above ASK CLAUDE, and a visualizer in the now-playing panel. **The visualizer is decorative.** iCUE's media plugin exposes no audio levels, so it just animates while a track is loaded.

Layout by slot size: XL shows all three panels. L and S drop the media panel. M and vertical stack system over ASK CLAUDE (no trends or clock).

## OKTAI

Grim Drakkenheim look (iron, bone, rust) with a purple/green haze that thickens as contamination rises. Doesn't use the DATACORE theme.

| Control | Tap | Hold |
|---|---|---|
| − DMG / + HEAL | 1 HP | 5 HP |
| − TEMP / + TEMP | 1 temp HP | 5 temp HP |
| Hit Die d8 / d10 | spend one: rolls it + CON and heals that much (shown in the dice panel) | give one back |
| Resource tile (Ki, Superiority, Action Surge, Second Wind) | spend one | restore one |
| Contamination segment | set that level (tap the current top level to drop one) | |
| SHORT REST / LONG REST | nothing | confirm (about 1 s) |
| Dice (d20, ADV, DIS, superiority die, d6, d4) | roll | |

Damage comes off temp HP first. **2014 rules:** a short rest restores ki, superiority dice, Action Surge, and Second Wind (spend hit dice with their buttons to heal). A long rest also restores all HP, clears temp HP, and returns spent hit dice up to half your total (minimum 1), d10s first. Nothing touches contamination except you.

Settings: Max HP (default 60, **set this to Oktai's real max**), Ki 6, Superiority Dice 4, Superiority Die d8, Action Surge 1, Second Wind 1, Monk Hit Dice (d8) 6, Fighter Hit Dice (d10) 3, CON Modifier (default +1, **set this to Oktai's real CON mod**). State is saved per widget in iCUE's localStorage and survives restarts (pending test 4 in `RESEARCH.md`). Changing a max never loses what you've spent.

## STRATUM DM

| Panel | What it does |
|---|---|
| Initiative | Newest active encounter from DATACORE: initiative, name (PCs cyan, enemies rust), up to 3 conditions, HP bar. Hidden enemies are left out unless "Show Hidden Enemies" is on. Dead combatants are struck through. Tag shows LIVE / OFFLINE / NO LINK. Offline keeps the last good data on screen. |
| Encounter summary | Under the list: PCs up, enemies up/down, and total enemy HP left. Counts only what's on screen, so hidden enemies never leak through. |
| Round | Tap − / +. Hold − to reset to round 1. "This round" shows how long the current round has taken. |
| Session timer | Tap to start/pause. Hold to reset. Keeps counting through iCUE restarts. |
| COMPLICATION / NPC | Random pick, never the same one twice in a row. The last 3 results stay listed below, so you can find that NPC name again. Edit the lists in `widgets/StratumDM/scripts/tables.js`. |

**Setup:** in the widget settings, fill in **Supabase Project URL** (`https://<ref>.supabase.co`) and **Supabase Anon Key** from DATACORE's `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Anon/publishable key only, never the service key. It polls every 4 s by default (3–10 s setting) and pauses when hidden.

**Install the feed function (one time).** DATACORE's tables are only readable when you're signed in, so the anon key can't see `encounters` directly. Open DATACORE's Supabase project → SQL editor → paste all of `sql/edge_active_encounter.sql` → Run. It adds one read-only function that returns just the newest active fight with hidden enemies removed. It doesn't change any tables or policies, it's safe to re-run, and the file ends with a check query and an undo line. The widget uses the function automatically. Until it exists, the widget falls back to the table (which will likely come back empty), shows an install hint, and checks for the function again every minute.

**Still open:** DATACORE doesn't save whose turn it is (it's local state in the tracker page), so no row is highlighted yet. The widget highlights automatically once the encounter row has an `active_id` (the function would need that field added too).

## GAME HUD

Big glanceable stats for mid-game, styled like a race-car dash display (its own theme, not DATACORE). A row of 15 **shift lights** across the top fills as FPS climbs toward your target: green at or above it, yellow down to 60% of it, red below that, and the last three light purple when you're well past the target. FPS is the hero number, with the 60-second average, low, best (purple, like a fastest sector), and target beside it, and a 60-second line trace underneath with the target as a dashed line. Tiles show GPU load, GPU temp, and CPU temp in big numbers, each with a gauge bar and its own 60-second line trace (so you can see a GPU that is still climbing). Hot readings flash.

- **No touch.** The manifest sets `interactive: false`, so a tap on the HUD can't pull focus from your game.
- **Sensors match themselves.** Any sensor left on iCUE's default is swapped for the right kind automatically (`fps`, `gpu-load`, `gpu-temp`, `cpu-temp`/`package`). If you pick one yourself, it's kept.
- **FPS only exists while a game runs.** With no game, the FPS reads `--` and the panel dims. It picks the game back up when iCUE reports the sensor again.
- Slot sizes: XL shows everything. L and S show FPS + GPU temp. M shows FPS only.

Settings: FPS (sensor), GPU Load, GPU Temperature, CPU Temperature, FPS Target (default 120), Warm At / Hot At (70 / 85 °C), plus the usual colors.

## FORGE

A painting-session timer for Mini Forge Dad, styled like a hobby desk: walnut, parchment cards, brass plates, paint-pot buttons, and a handwritten log.

| Control | Tap | Hold |
|---|---|---|
| Stage pot (Prime, Basecoat, Wash, Layer, Highlight, Basing, Varnish) | switch to that stage (starts the clock if it isn't running) | |
| Start / Pause | start, pause, resume | |
| Finish | nothing | log the session and reset (about 1 s) |
| Dry | start or restart the dry countdown | cancel it |
| Who (top right) | Dad → Kiddo → both | |

- **Stage splits:** time is tracked per stage while the clock runs. Going back to a stage adds to its total. The log card shows this session's split bars live.
- **Log:** this week's hours (from Monday), all-time hours, and session count, plus the last 4 sessions in handwriting: date, project, time, and who painted. Sessions under a minute aren't logged. Up to 60 sessions are kept, saved on this PC.
- **Dry timer:** counts down from the Dry Timer setting (default 5 min), then flashes "Dry!" for a minute.
- The clock keeps running through an iCUE restart, like the STRATUM session timer.

Settings: Current Project (shown on the card and saved with each session), Painter A (default "Dad"), Painter B (default "Kiddo", **set to your son's name**), Dry Timer minutes, plus the usual colors.

Slot sizes: XL shows everything. L and S drop the log. M shows the session card only.

## CREATOR

YouTube channel stats for Mini Forge Dad (or any channel), in a clean "studio" look with rounded cards, Inter, and YouTube red. Theme setting: Light (default) or Dark.

- **Channel card:** avatar, name, subscribers (big), gains today and over 7 days, and video count. Tap it to open YouTube Studio.
- **Views card:** total views, views gained today, and a 14-day views-per-day bar chart (today in red).
- **Latest upload:** thumbnail, title, age, views/likes/comments, and views since yesterday. Tap it to open the video.
- **Recent uploads:** the next 4 videos with view bars. Tap one to open it.

**How the trend works:** YouTube's API only gives current totals, so the widget saves one reading per day on this PC and compares them. The daily chart and the "today" numbers fill in after it has run for a day or two. YouTube rounds subscriber counts above 1,000, so small subscriber changes can show as +0 for a while.

**Setup (about 5 minutes):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project (any name).
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → Credentials → **Create credentials → API key**. Then edit the key → **API restrictions → Restrict key → YouTube Data API v3**. That way a leaked key can't be used for anything else.
4. In the widget settings, paste the key into **YouTube API Key** and set **Channel** to your handle (`@yourhandle`), channel ID (`UC…`), or channel URL.

No sign-in or OAuth, and only public numbers are read. Each refresh uses 3 of the free 10,000 daily API units, so the default 15-minute refresh uses under 300 a day. Quick iCUE restarts reuse the last data instead of calling the API again. If a refresh fails (quota, bad key, offline), the last numbers stay on screen and the status line says why.

Settings: Channel, YouTube API Key, Refresh Every (5–60 min, default 15), Theme, Accent Color, Background Transparency.

Slot sizes: XL shows all four cards. L and S show channel + views. M shows the channel card only.

## ON AIR

OBS control over OBS's built-in WebSocket (OBS 28+). Nothing extra to install, and no Stream Deck app. Broadcast-console look: a glowing ON AIR light, tally-lit scene buttons, and segmented meters.

| Control | Tap | Hold |
|---|---|---|
| REC | start recording | stop recording (about 1 s, so a bump can't end a take) |
| Pause | pause / resume the recording | |
| Go live | start streaming | end the stream |
| Scene button | switch OBS to that scene (the live scene has a red border) | |
| Mic / Desktop | mute / unmute | |
| Mark | add a chapter marker to the recording | |
| Clip / Start buffer | save the replay buffer (or start it if it's off) | |

- **Live meters:** mic and desktop levels come straight from OBS, so you can catch a muted or dead mic before a long take. Tick marks show the peak, and the meter outlines red when you clip.
- **Health line:** FPS, dropped frames (amber at 1%+), CPU, and free disk space (amber under 10 GB).
- **Mark** only shows on OBS 30.2+ and needs **Hybrid MP4** as the recording format. **Clip** only shows if the replay buffer is enabled in OBS (Settings → Output → Replay Buffer). Both hide themselves when OBS doesn't support them.
- Up to 8 scenes, in the same order as OBS's scene list. OBS scene changes, mutes, and recording state update live from OBS events.
- If OBS isn't running, the widget retries every few seconds (backing off to 30 s) and reconnects on its own. A wrong password shows a clear message and doesn't keep retrying.

**Setup:** in OBS, open **Tools → WebSocket Server Settings**, tick **Enable WebSocket server**, then click **Show Connect Info** and copy the password into the widget's **OBS WebSocket Password** setting. Leave **OBS Address** as `ws://127.0.0.1:4455` unless you changed the port. Mic Source and Desktop Audio Source can stay blank to use OBS's Mic/Aux and Desktop Audio, or name specific OBS sources. Chapter Name (optional) names chapters "Name 1", "Name 2", and so on.

Slot sizes: XL shows everything. L and S show on-air + scenes. M shows the on-air panel only.

## Known limits

- **Touch focus:** on the stock iCUE dashboard, tapping the Edge may move the cursor and take focus from a full-screen game. That's the kill-switch test in `RESEARCH.md`. If it's bad, the UI can move to a local kiosk window; all iCUE calls live in `shared/scripts/icue-adapter.js` for that reason.
- **Media:** song and artist only. No play state, album art, volume, or playlist switching.
- **Sensors:** whatever iCUE exposes. Ryzen 9900X / RTX 5080 coverage is unconfirmed until the SENSORS test runs.
- The ASK CLAUDE button just opens a link. No API keys anywhere in this repo.

## Layout

```
shared/              one copy of the style, fonts, and iCUE adapter
  scripts/icue-adapter.js
  styles/base.css        structure shared by every widget
  styles/datacore.css    DATACORE theme
  styles/drakkenheim.css OKTAI theme
  styles/motorsport.css  GAME HUD theme
  styles/workshop.css    FORGE theme
  styles/studio.css      CREATOR theme (light + dark)
  styles/broadcast.css   ON AIR theme
  fonts/             Bebas Neue, Share Tech Mono, VT323, Cinzel, Barlow Condensed, Titillium Web, Zilla Slab, Caveat, Inter, Oswald, JetBrains Mono (SIL OFL, licenses included)
widgets/
  Datacore/
  EdgeTestKit/
  Oktai/
  StratumDM/
  GameHud/
  Forge/
  Creator/
  OnAir/
tools/build.mjs
RESEARCH.md
```

## Credits

- iCUE widget rules and plugin APIs: Corsair's WidgetBuilder documentation and `icuewidget-cli` (Apache-2.0).
- Design ideas (not code) from [Xenon](https://github.com/marcimastro98/Xenon) by Marcello Mastroeni, and from [vardek-widgets](https://github.com/vardekapp/vardek-widgets) (MIT).
- Palette and fonts from the DATACORE app (Karieo/DnD-Website).
- Fonts: Bebas Neue (Dharma Type), Share Tech Mono (Carrois), VT323 (Peter Hull), Cinzel (Natanael Gama), Barlow Condensed (Jeremy Tribby), Titillium Web (Accademia di Belle Arti di Urbino), Zilla Slab (Typotheque for Mozilla), Caveat (Impallari Type), Inter (Rasmus Andersson), Oswald (Vernon Adams), JetBrains Mono (JetBrains), all SIL Open Font License 1.1.
