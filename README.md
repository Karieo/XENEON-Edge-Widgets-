# Xeneon Edge Widgets

Custom iCUE widgets for the Corsair Xeneon Edge (14.5" touch strip under the main monitor). Plain HTML/CSS/JS. The only build step is copying `shared/` into each widget and packaging it with Corsair's CLI.

| Widget | Status | What it does |
|---|---|---|
| **Edge Test Kit** | Ready to test | Runs the day-1 hardware checklist from `RESEARCH.md` on the device |
| **DATACORE** | v0.1, untested on hardware | CPU/GPU temps + fans, now playing, big ASK CLAUDE button |
| **OKTAI** | v0.1, untested on hardware | Oktai's table tracker for Drakkenheim (2014 rules): HP, ki, superiority dice, Action Surge, Second Wind, contamination, rests, dice |
| **STRATUM DM** | v0.1, untested on hardware | Live initiative from DATACORE (read-only), round counter, session timer, random complications and NPCs |
| **GAME HUD** | v0.1, untested on hardware | Huge FPS with a 60-second trace, GPU load, GPU temp, CPU temp. No touch controls |

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

Layout by slot size: XL shows all three panels. L and S drop the media panel. M and vertical stack system over ASK CLAUDE.

## OKTAI

Grim Drakkenheim look (iron, bone, rust) with a purple/green haze that thickens as contamination rises. Doesn't use the DATACORE theme.

| Control | Tap | Hold |
|---|---|---|
| − DMG / + HEAL | 1 HP | 5 HP |
| − TEMP / + TEMP | 1 temp HP | 5 temp HP |
| Resource tile (Ki, Superiority, Action Surge, Second Wind) | spend one | restore one |
| Contamination segment | set that level (tap the current top level to drop one) | |
| SHORT REST / LONG REST | nothing | confirm (about 1 s) |
| Dice (d20, ADV, DIS, superiority die, d6, d4) | roll | |

Damage comes off temp HP first. **2014 rules:** a short rest restores ki, superiority dice, Action Surge, and Second Wind. A long rest also restores all HP and clears temp HP. Nothing touches contamination except you.

Settings: Max HP (default 60, **set this to Oktai's real max**), Ki 6, Superiority Dice 4, Superiority Die d8, Action Surge 1, Second Wind 1. State is saved per widget in iCUE's localStorage and survives restarts (pending test 4 in `RESEARCH.md`). Changing a max never loses what you've spent.

## STRATUM DM

| Panel | What it does |
|---|---|
| Initiative | Newest active encounter from DATACORE: initiative, name (PCs cyan, enemies rust), up to 3 conditions, HP bar. Hidden enemies are left out unless "Show Hidden Enemies" is on. Dead combatants are struck through. Tag shows LIVE / OFFLINE / NO LINK. Offline keeps the last good data on screen. |
| Round | Tap − / +. Hold − to reset to round 1. |
| Session timer | Tap to start/pause. Hold to reset. Keeps counting through iCUE restarts. |
| COMPLICATION / NPC | Random pick, never the same one twice in a row. Edit the lists in `widgets/StratumDM/scripts/tables.js`. |

**Setup:** in the widget settings, fill in **Supabase Project URL** (`https://<ref>.supabase.co`) and **Supabase Anon Key** from DATACORE's `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Anon/publishable key only, never the service key. It polls every 4 s by default (3–10 s setting) and pauses when hidden.

**Two open items before this is fully live** (details in `RESEARCH.md` §0.6):
1. Whether the anon key can read `encounters` depends on DATACORE's RLS, which I couldn't see. If the panel shows "NO ACTIVE ENCOUNTER" during a fight, RLS is blocking it. There's a proposed fix, but it needs your OK before anything runs.
2. DATACORE doesn't save whose turn it is (it's local state in the tracker page), so no row is highlighted yet. The widget highlights automatically once the encounter row has an `active_id`.

## GAME HUD

Big glanceable stats for mid-game. FPS is the hero: cyan at or above your target, amber down to 60% of it, red below that. Under it is a 60-second trace with the target as a dashed line, plus the 60-second average and low. Tiles show GPU load, GPU temp, and CPU temp in big numbers, each with its own 60-second trend graph (so you can see a GPU that is still climbing), using the same warm/hot colors as DATACORE.

- **No touch.** The manifest sets `interactive: false`, so a tap on the HUD can't pull focus from your game.
- **Sensors match themselves.** Any sensor left on iCUE's default is swapped for the right kind automatically (`fps`, `gpu-load`, `gpu-temp`, `cpu-temp`/`package`). If you pick one yourself, it's kept.
- **FPS only exists while a game runs.** With no game, the FPS reads `--` and the panel dims. It picks the game back up when iCUE reports the sensor again.
- Slot sizes: XL shows everything. L and S show FPS + GPU temp. M shows FPS only.

Settings: FPS (sensor), GPU Load, GPU Temperature, CPU Temperature, FPS Target (default 120), Warm At / Hot At (70 / 85 °C), Scanlines, plus the usual colors.

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
  fonts/             Bebas Neue, Share Tech Mono, VT323, Cinzel, Barlow Condensed (SIL OFL, licenses included)
widgets/
  Datacore/
  EdgeTestKit/
  Oktai/
  StratumDM/
  GameHud/
tools/build.mjs
RESEARCH.md
```

## Credits

- iCUE widget rules and plugin APIs: Corsair's WidgetBuilder documentation and `icuewidget-cli` (Apache-2.0).
- Design ideas (not code) from [Xenon](https://github.com/marcimastro98/Xenon) by Marcello Mastroeni, and from [vardek-widgets](https://github.com/vardekapp/vardek-widgets) (MIT).
- Palette and fonts from the DATACORE app (Karieo/DnD-Website).
- Fonts: Bebas Neue (Dharma Type), Share Tech Mono (Carrois), VT323 (Peter Hull), Cinzel (Natanael Gama), Barlow Condensed (Jeremy Tribby), all SIL Open Font License 1.1.
