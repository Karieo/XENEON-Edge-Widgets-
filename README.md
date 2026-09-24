# Xeneon Edge Widgets

Custom iCUE widgets for the Corsair Xeneon Edge (14.5" touch strip under the main monitor). Plain HTML/CSS/JS. The only build step is copying `shared/` into each widget and packaging it with Corsair's CLI.

| Widget | Status | What it does |
|---|---|---|
| **Edge Test Kit** | Ready to test | Runs the day-1 hardware checklist from `RESEARCH.md` on the device |
| **DATACORE** | v0.1, untested on hardware | CPU/GPU temps + fans, now playing, big ASK CLAUDE button |
| OKTAI / STRATUM DM | Not started | Part 2, after DATACORE is tested on the Edge |

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

## Known limits

- **Touch focus:** on the stock iCUE dashboard, tapping the Edge may move the cursor and take focus from a full-screen game. That's the kill-switch test in `RESEARCH.md`. If it's bad, the UI can move to a local kiosk window; all iCUE calls live in `shared/scripts/icue-adapter.js` for that reason.
- **Media:** song and artist only. No play state, album art, volume, or playlist switching.
- **Sensors:** whatever iCUE exposes. Ryzen 9900X / RTX 5080 coverage is unconfirmed until the SENSORS test runs.
- The ASK CLAUDE button just opens a link. No API keys anywhere in this repo.

## Layout

```
shared/              one copy of the style, fonts, and iCUE adapter
  scripts/icue-adapter.js
  styles/datacore.css
  fonts/             Bebas Neue, Share Tech Mono, VT323 (SIL OFL, licenses included)
widgets/
  Datacore/
  EdgeTestKit/
tools/build.mjs
RESEARCH.md
```

## Credits

- iCUE widget rules and plugin APIs: Corsair's WidgetBuilder documentation and `icuewidget-cli` (Apache-2.0).
- Design ideas (not code) from [Xenon](https://github.com/marcimastro98/Xenon) by Marcello Mastroeni, and from [vardek-widgets](https://github.com/vardekapp/vardek-widgets) (MIT).
- Palette and fonts from the DATACORE app (Karieo/DnD-Website).
- Fonts: Bebas Neue (Dharma Type), Share Tech Mono (Carrois), VT323 (Peter Hull), all SIL Open Font License 1.1.
