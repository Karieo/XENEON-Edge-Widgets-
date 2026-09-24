# RESEARCH.md: Xeneon Edge Widget Deep Dive

## 0. Session 1 findings (2026-09-24) — read this first

This session ran in a cloud container with no Edge attached, so none of the section 6 hardware tests have run yet. The **Edge Test Kit** widget (`widgets/EdgeTestKit`) runs them on the device. Results go in section 0.3.

Source of truth used: Corsair's **WidgetBuilder Kit** (skill file + docs snapshot, vendored in the Xenon repo under `WidgetBuilder/`) and the official **`icuewidget-cli` 0.4.47** from npm (Apache-2.0). docs.elgato.com was blocked from the container, so anything below marked *unverified* came only from the original notes.

### 0.1 Corrections to the notes below

| Original claim | What the kit/CLI actually says |
|---|---|
| Edge widget is 2560×720 | Widget **slots** are S 840×344, M 840×696, L 1688×696, **XL 2536×696** (horizontal). DATACORE targets XL and hides panels in smaller slots. |
| FPS plugin exists ("see docs") | **No FPS plugin.** FPS is a sensor type (`fps`) in the Sensors plugin. |
| Copy `common/plugins/` wrappers into the widget | The official wrappers ship inside the iCUE install (`<iCUE>/widgets/common/plugins/`), not in any public download. The copies in Xenon's repo are Xenon's own rewrite under its non-commercial license, so we don't copy them. `shared/scripts/icue-adapter.js` implements the same documented `requestId` → `asyncResponse` pattern from scratch. |
| Official plugins: Sensors, Media, Link, Stream Deck, File System, Notifications, Device Action | This docs snapshot lists only **Sensors, Media, Link** as supported. Stream Deck / File System / Notifications / Device Action are *unverified* — check docs.elgato.com from the PC before planning v2 around them. |
| Manifest `permissions` array (`url`, `file`, `microphone`…) | **Not in this docs snapshot or the CLI validator.** *Unverified.* The test kit deliberately declares no permissions, so test 6/7 shows whether iCUE prompts at runtime for undeclared access. |

### 0.2 New rules learned (not in the original notes)

- **iCUE parses `<head>` as strict XML** on import. Every void tag (`<meta>`, `<link>`) must self-close (`/>`), or import fails with "Missing Title Element". The CLI validator now catches this.
- `data-type` must be one of: slider, switch, color, combobox, search-combobox, tab-buttons, textfield, media-selector, sensors-combobox, sensors-factory. Anything else → "Invalid meta parameter data type".
- `icueEvents = {...}` must be a **bare assignment** (no `var`/`let`/`const`) or iCUE may not see it.
- Properties may be injected on `window` *or* only in a sandbox scope. Read them through a helper that checks both (`Edge.prop`).
- Sensors push updates via the `sensorValueChanged(sensorId, value)` signal, so no tight polling is needed. DATACORE listens to it and resyncs every 5 s as a safety net. Media has no change signal, so it polls every 2 s and skips DOM work when nothing changed. Both pause when the page is hidden.
- Both CPU and GPU `sensors-combobox` default to the same "default temperature sensor". DATACORE detects that and auto-picks by sensor kind (`cpu-temp`/`package`, `gpu-temp`) until you choose in settings.
- The Media plugin has **no play/pause state**, only song name and artist. The play button is a toggle.
- `iCUE.fpsLimit` defaults to **30** fps for widget rendering; keep animations cheap.
- Personalization order Corsair expects: textColor, accentColor, backgroundColor, (backgroundMedia, bgBrightness, glassBlur), transparency, placed in the last settings group. The Edge adds a "Custom Style" toggle to that group; **with Custom Style off, iCUE substitutes its own colors**, so turn it on to get the DATACORE palette.
- `onUpdateRequested`-style programmatic refreshes: max 10/s.

### 0.3 Day-1 hardware results (fill in on the PC)

Import `dist/EdgeTestKit.icuewidget`, put it on the Edge at XL size, and tap through. The log panel shows results; screenshot it.

| # | Test | Kit button | Result |
|---|---|---|---|
| 1 | Hello-world imports and shows | (the kit itself) | _pending_ |
| 2 | Tap registers (`pointerType`?) / steals game focus? **Kill switch** | TAP | _pending_ |
| 3 | CPU/GPU temps + fans available; sensor IDs | SENSORS | _pending_ |
| 4 | localStorage survives iCUE restart + reboot | STORAGE (BOOT # climbs) | _pending_ |
| 5a | `https://claude.ai` opens in default browser | CLAUDE.AI | _pending_ |
| 5b | `claude://` launches desktop app | CLAUDE:// | _pending_ |
| 6 | Supabase fetch: prompt? data? (401 = reachable) | SUPABASE | _pending_ |
| 7 | Mic prompt; `getUserMedia` returns audio | MIC | _pending_ |
| 8 | Apple Music link: which form (https, music://, musics://, itmss://) opens the Windows app? Does it play? Set your playlist link in widget settings; each tap tries the next form | APPLE MUSIC | _pending_ |
| + | Media plugin reads song/artist | MEDIA | _pending_ |
| i | Chromium version, viewport, plugin flags | ENV | _pending_ |

### 0.4 License check

| Project | License | Decision |
|---|---|---|
| Xenon (marcimastro98) | Custom non-commercial, attribution required | Read only. No code copied. |
| vardek-widgets | **MIT** | Safe to borrow with credit. Nothing copied so far. |
| EdgeHub (skyphoenix-it/XeneonEdge_Linux) | Could not check: repo is private, renamed, or deleted (GitHub asked for login) | Don't copy anything until the license is confirmed. |
| icuewidget-cli (Corsair) | Apache-2.0 | Used as a dev dependency for validate/package. |
| Bebas Neue, Share Tech Mono, VT323 | SIL OFL 1.1 | Bundled in `shared/fonts/` with their license files. |
| Corsair WidgetBuilder docs (via Xenon repo) | Corsair documentation | Read for reference only. |

---


---

### 1. The big decision: native iCUE widget vs. local app

There are two ways to put custom UI on the Edge.

**A. Native iCUE widget** (our plan)
- A folder with `index.html` + `manifest.json` + an icon, packaged into a `.icuewidget` file and imported through iCUE.
- It runs inside iCUE's embedded browser: QtWebEngine 6.9.3, which is Chromium 130. Requires iCUE 5.47 or newer.
- Pros: small, no background service, official plugins for sensors and media.
- Con: **touch focus.** Xenon's author reports that on the stock iCUE dashboard, tapping the Edge moves the mouse cursor over and takes focus from whatever game is running. Only a real native window can prevent that.

**B. Local server + native kiosk window** (Xenon's approach)
- A small local Node service serves the dashboard, and a borderless native app (Xenon uses Tauri) shows it full-screen on the Edge.
- Pros: "game-safe touch" (taps don't steal game focus), no iCUE sandbox limits, reusable anywhere (browser, phone, iFrame).
- Con: much more work. It needs an installer, a startup task, and unsigned-exe antivirus headaches (Xenon gets flagged by Defender and blocked by Smart App Control).

**Decision: start with A.** Write the widget UI as plain, self-contained HTML/CSS/JS with the iCUE-specific calls isolated in one adapter file. If touch-focus stealing turns out to be annoying mid-game, the same UI can move into a local server + kiosk shell later without a rewrite.
**Kill switch:** if tapping the Edge minimizes or unfocuses full-screen games during testing, schedule the kiosk-shell spike.

---

### 2. iCUE widget essentials

**Tooling**
- CLI: `npm install -g icuewidget-cli`, then `icuewidget init <Name>`, `icuewidget validate <Name>`, `icuewidget package <Name>`.
- Packaging requires the CLI; files alone won't import.
- Install: iCUE, then Widgets, the **+** button, then select the `.icuewidget` file.

**Required files:** `index.html`, `manifest.json`, `icon.svg` or `icon.png`.

**Manifest rules**
- Required fields: `author`, `id`, `name`, `description`, `version` (semver), `preview_icon`, `min_framework_version`, `min_app_version`, `os`, `supported_devices`.
- `id` is reverse-DNS: lowercase letters, digits, `-`, and `.` only. Use `com.karieo.<widget>`.
- `os`: currently `windows` only.
- `supported_devices`: `{ "type": "dashboard_lcd" }` is the Edge.
- **`"interactive": true` is required for touch.** It defaults to false.
- `required_plugins` uses the format `namespace:Name:version`.

**HTML conventions**
- `<title>` = widget name. `<link rel="icon">` = selector icon.
- Optional `x-icue-widget-preview` meta tag: 128×56 PNG.
- Optional `x-icue-widget-group`: groups variants in the widget selector. Use it for a "DATACORE" group.
- User settings = `<meta name="x-icue-property" ...>` tags. Each becomes a **global JS variable**. Organize them with a `<script type="application/json" id="x-icue-groups">` block.
- Control types: color, combobox, media-selector, search-combobox, sensors-combobox, sensors-factory, slider, switch, tab-buttons, textfield.
- **Edge-specific:** a property group containing `textColor`, `accentColor`, or `backgroundColor` automatically gets a "Custom Style" toggle. Use those exact names so theming plugs into iCUE's system.

**Lifecycle**
- iCUE injects its globals before your scripts run: a flag named `iCUE_initialized`, a `device` object, and plugin objects.
- Hooks: `icueEvents = { onICUEInitialized, onDataUpdated }`. Also call init manually if `iCUE_initialized` is already true, to handle late loading.
- Plugins: `plugin<Module>Events = { onInitialized }`, then check the `plugin<Module>_initialized` flag and use `window.plugins.<Module>`.

**Persistence (solves Oktai's counters)**
- Standard `localStorage` works and survives iCUE restarts.
- Key by the injected `uniqueId` variable and store one JSON object per widget instance.
- Listen for the `storage` event to stay in sync.

**Wrappers:** copy `common/plugins/` (for example `IcueWidgetApiWrapper.js`, `SimpleSensorApiWrapper.js`, `SimpleMediaApiWrapper.js`) from the docs bundle **into the widget folder**. Never reference iCUE install paths.

---

### 3. Plugins: what they actually do

| Plugin | Manifest string | What it gives us | Notes |
|---|---|---|---|
| Sensors | `widgetbuilder.sensorsdataprovider:Sensors:1.0` | Temps, fans, loads from connected devices | Async with requestId. Sensor pickers via the `sensors-combobox`/`sensors-factory` controls. **TEST:** confirm Ryzen 9900X + RTX 5080 sensors show up. |
| Media | `widgetbuilder.mediadataprovider:Media:1.0` | Song name, artist, play/pause, next, previous | **That's all.** No album art, no playlist switching, no volume. |
| Link | `widgetbuilder.linkprovider:Url:1.0` | `open(url)` in the system default browser | A plain `window.open` opens *inside* the widget instead. **TEST:** whether a `claude://` URL launches the desktop app. |
| Stream Deck | `widgetbuilder.streamdeck:StreamDeck:1.0` | Creates a **virtual Stream Deck** key grid (columns × rows) and sends key presses to the Stream Deck software | Needs Elgato's Stream Deck app running (it may prompt for authentication). Icons come back as data URLs. This is the path to OBS/scene control without building OBS integration ourselves. |
| FPS | (see docs) | In-game FPS | Not explored yet. Worth a look for the system monitor. |
| Device Action | (see docs) | Corsair device actions | Not explored yet. |
| File System | `widgetbuilder.filesystemprovider:FileSystem:1.0` | Watches files and folders for changes | iCUE 5.51+. Needs file/folder permissions. Could feed a widget from a local JSON file. |
| Notifications | `widgetbuilder.notificationsprovider:Notifications:1.0` | Count of incoming system notifications | iCUE 5.45+. |

**Network and permissions**
- Declare a `permissions` array in the manifest: `url` (domain + port), `file`, `folder`, and hardware types (microphone, camera, speaker, screen).
- Pre-declared permissions are shown at install. Undeclared access triggers a runtime Allow/Deny prompt.
- For the Stratum panel: `{ "type": "url", "domain": "vmgtaxapklstqytygwyb.supabase.co", "port": 443 }`.
- Always `.catch()` fetches, since permission can be denied or revoked. Show a fallback state.
- Voice (v2): a `microphone` permission exists. **TEST:** whether Web Speech / `getUserMedia` actually work inside QtWebEngine.

---

### 4. Lessons from community projects

**Xenon** (github.com/marcimastro98/Xenon)
- License: **custom non-commercial.** Personal read/run/modify is allowed; no selling or rebranding; forks must keep attribution. → **Borrow ideas, don't copy code** unless it's trivial, and credit it if we do.
- Layout: dense, glanceable tiles with comfortable touch targets, designed for a short, very wide panel. A bento grid, tiles, pages.
- Temps: they use LibreHardwareMonitor + PawnIO (and `nvidia-smi` for NVIDIA GPUs) because stock sensors can be limited. Try the iCUE Sensors plugin first; fall back to `nvidia-smi` only if the GPU data is missing.
- Performance: a file indexer re-read the entire C: drive about every 20 seconds and burned a CPU core. → **Keep polling light:** sensors about every 1–2 s, Supabase every 3–5 s, and pause polling when data is unchanged or hidden.
- Media: iCUE's embedded WebView rejects some MP4 files. They convert to **WebM (VP8, 30 fps)**. → Use WebM for any animated backgrounds (scanlines, etc.) or go pure CSS.
- AI: voice + chat via Gemini or local Ollama. Useful for v2 voice-Claude design, and it matches the Ollama-on-the-5080 idea.
- Remote: Sunshine + Tailscale + Moonlight, the same stack Clay already plans.

**EdgeHub** (github.com/skyphoenix-it/XeneonEdge_Linux)
- License: **MIT OR Apache-2.0.** Safe to borrow code, with credit.
- Linux-native, but the design ideas carry over: swipeable pages, a theme + accent-color system, and landscape and portrait layouts.

**Vardek add-on widgets** (github.com/vardekapp/vardek-widgets)
- macOS Edge dashboard. License not checked yet; check before copying.
- Uses a grid sizing convention (8×2 full strip, 4×2 half, 2×1 small). Good mental model for our layouts: the system monitor as 8×2, Oktai as 8×2, small tools as 4×2.
- Philosophy: small single-purpose widgets that do one thing well (retro LCD watch, day/night map, progress bars).

**What people use the stock widgets for (TechPowerUp review)**
- Sensor charts and gauges (CPU/GPU/SSD temps, fans, loads) are the most popular.
- Media + volume/mixer widgets when the Edge is within reach.
- App launch buttons, clocks, slideshows, iFrame/website embeds, Windows notifications.
- Edge can also be switched to plain monitor mode by unchecking "Show iCUE Widgets".

---

### 5. Impact on our builds

| Build | Change based on research |
|---|---|
| System monitor v1 | Add `"interactive": true`. Use `textColor`/`accentColor`/`backgroundColor` property names. Check the FPS plugin. |
| ASK CLAUDE button | Link plugin, system browser. Test the `claude://` scheme. Voice in v2 depends on the mic TEST. |
| OKTAI tracker | Persistence = `localStorage[uniqueId]`. No file permissions needed. |
| STRATUM DM panel | URL permission for the Supabase domain. Poll 3–5 s. Handle denied-permission states. Quick alternative to test first: the stock iFrame/website widget pointed at DATACORE's combat page. |
| Scene soundtrack | **Cut from the Media plugin plan.** It can't switch playlists. If still wanted later, use the Spotify Web API over a URL permission. |
| OBS / stream deck (v2) | Use the Stream Deck plugin's virtual deck plus the Stream Deck app's OBS actions, instead of writing OBS websocket code. |

### 6. Test checklist (day 1 on hardware)
1. `icuewidget init` a hello-world, package it, import it, and confirm it shows on the Edge.
2. With `interactive: true`: does a tap register? Does it steal focus from a full-screen game? (This is the kill-switch test.)
3. Sensors: are CPU and GPU temps and fan speeds available? List the sensor IDs.
4. `localStorage` survives an iCUE restart and a reboot.
5. Link plugin: does `https://claude.ai` open in the default browser? Does `claude://` launch the desktop app?
6. `fetch` to Supabase with the URL permission: what does the permission prompt look like, and do we get data?
7. Microphone: is the permission prompt shown? Does `getUserMedia` return audio? (Decides v2 voice.)
