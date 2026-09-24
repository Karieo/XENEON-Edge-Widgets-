/* Edge Test Kit — runs the RESEARCH.md day-1 checklist on the device. */

var SUPABASE_PROBE = "https://vmgtaxapklstqytygwyb.supabase.co/rest/v1/";

var $ = function (id) { return document.getElementById(id); };
var envLogged = false;

function log(line) {
  var t = new Date().toLocaleTimeString([], { hour12: false });
  var el = $("log");
  el.textContent = "[" + t + "] " + line + "\n" + el.textContent;
  if (el.textContent.length > 20000) el.textContent = el.textContent.slice(0, 20000);
}

// ---- 4. Storage: bump a boot counter on every load -----------------------

var store = Edge.store.load();
store.boots = (store.boots || 0) + 1;
store.firstSeen = store.firstSeen || new Date().toISOString();
store.lastBoot = new Date().toISOString();
var saved = Edge.store.save(store);
$("boot").textContent = ":: BOOT #" + store.boots;

function onIcueInitialized() {
  if (!envLogged) logEnv();
}

// ---- i. Environment -------------------------------------------------------

function logEnv() {
  envLogged = true;
  var chrome = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || "?";
  var icue = typeof iCUE !== "undefined" ? iCUE : null;
  log("ENV viewport " + innerWidth + "x" + innerHeight + " @" + devicePixelRatio + "x, Chromium " + chrome);
  log("ENV iCUE_initialized=" + Edge.icueReady() +
    " lang=" + (icue && icue.iCUELanguage) +
    " fpsLimit=" + (icue && icue.fpsLimit) +
    " tempUnit=" + (icue && typeof icue.defaultTemperatureUnit === "function" ? icue.defaultTemperatureUnit() : "?"));
  log("ENV uniqueId=" + (Edge.prop("uniqueId") ? "yes" : "NO") +
    " plugins: sensors=" + Edge.pluginReady("Sensorsdataprovider") +
    " media=" + Edge.pluginReady("Mediadataprovider") +
    " link=" + Edge.pluginReady("Linkprovider"));
  log("ENV mediaDevices=" + !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) +
    " SpeechRecognition=" + !!(window.SpeechRecognition || window.webkitSpeechRecognition));
}

// ---- 1/2. Tap -------------------------------------------------------------

var taps = 0;
$("tTap").addEventListener("pointerup", function (e) {
  taps++;
  log("TAP #" + taps + " pointerType=" + e.pointerType + " at " + Math.round(e.clientX) + "," + Math.round(e.clientY) +
    " — now check: did your game lose focus?");
});

// ---- 3. Sensors -----------------------------------------------------------

Edge.press($("tSensors"), function () {
  var s = Edge.plugin("Sensorsdataprovider");
  if (!s) { log("SENSORS plugin not available"); return; }
  log("SENSORS listing...");
  Edge.request(s, "getAllSensorIds").then(function (ids) {
    ids = Array.isArray(ids) ? ids : [];
    log("SENSORS found " + ids.length);
    return Promise.all(ids.map(function (id) {
      var q = function (m) { return Edge.request(s, m, id).catch(function () { return "?"; }); };
      return Promise.all([q("getSensorType"), q("getSensorKind"), q("getSensorName"),
        q("getSensorDeviceName"), q("getSensorValue"), q("getSensorUnits")])
        .then(function (r) {
          return r[0] + "/" + r[1] + " | " + r[2] + " | " + r[3] + " | " + r[4] + " " + r[5] + " | id=" + id;
        });
    }));
  }).then(function (lines) {
    if (!lines) return;
    lines.sort().reverse().forEach(log);
    log("SENSORS type/kind | name | device | value | id");
  }).catch(function (err) { log("SENSORS error: " + err.message); });
});

// ---- 4. Storage -----------------------------------------------------------

Edge.press($("tStorage"), function () {
  var now = Edge.store.load();
  now.taps = (now.taps || 0) + 1;
  var ok = Edge.store.save(now);
  log("STORAGE key=" + Edge.store.key().slice(0, 12) + "… boots=" + now.boots + " storageTaps=" + now.taps +
    " firstSeen=" + now.firstSeen + " saveOk=" + ok + " (bootSaveOk=" + saved + ")");
  log("STORAGE restart iCUE, then reboot: BOOT # and storageTaps should keep counting up");
});

// ---- 5. Links -------------------------------------------------------------

Edge.press($("tWeb"), function () {
  log("LINK https://claude.ai via " + Edge.openLink("https://claude.ai") + " — did it open in your default browser?");
});

Edge.press($("tApp"), function () {
  log("LINK claude:// via " + Edge.openLink("claude://") + " — did the Claude desktop app launch?");
});

// ---- Media ----------------------------------------------------------------

Edge.press($("tMedia"), function () {
  var m = Edge.plugin("Mediadataprovider");
  if (!m) { log("MEDIA plugin not available"); return; }
  Promise.all([Edge.request(m, "getSongName"), Edge.request(m, "getArtist")]).then(function (r) {
    log("MEDIA song=\"" + r[0] + "\" artist=\"" + r[1] + "\"");
  }).catch(function (err) { log("MEDIA error: " + err.message); });
});

// ---- 6. Network -----------------------------------------------------------

// No key is sent. A 401 JSON reply means the network path and permission work.
Edge.press($("tFetch"), function () {
  log("FETCH " + SUPABASE_PROBE + " (watch for a permission prompt)");
  var started = Date.now();
  fetch(SUPABASE_PROBE, { method: "GET", cache: "no-store" }).then(function (res) {
    return res.text().then(function (body) {
      log("FETCH status=" + res.status + " in " + (Date.now() - started) + "ms body=" + body.slice(0, 120));
      log("FETCH " + (res.status === 401 ? "OK: reached Supabase (401 expected without a key)" : "reached server, unexpected status"));
    });
  }).catch(function (err) {
    log("FETCH failed: " + err.name + " " + err.message + " (blocked, denied, or CORS)");
  });
});

// ---- 7. Microphone --------------------------------------------------------

Edge.press($("tMic"), function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    log("MIC getUserMedia not available in this WebView");
    return;
  }
  log("MIC requesting (watch for a permission prompt)...");
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    var track = stream.getAudioTracks()[0];
    log("MIC granted: " + (track ? track.label || "unnamed device" : "no track") + " — talk for 3 seconds");
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { stop(); return; }
    var ctx = new Ctx();
    var analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    var buf = new Uint8Array(analyser.fftSize);
    var peak = 0;
    var tick = setInterval(function () {
      analyser.getByteTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
    }, 50);
    setTimeout(function () {
      clearInterval(tick);
      ctx.close();
      stop();
      log("MIC peak level " + Math.round(peak / 128 * 100) + "% " + (peak > 6 ? "(audio received)" : "(silence — check device)"));
    }, 3000);
    function stop() { stream.getTracks().forEach(function (t) { t.stop(); }); }
  }).catch(function (err) {
    log("MIC failed: " + err.name + " " + err.message);
  });
});

// ---- 8. Apple Music ---------------------------------------------------------

// Each tap tries the next URL form of the same link, to learn which one opens
// the Apple Music app on Windows instead of the web player.
var musicTry = 0;
Edge.press($("tMusic"), function () {
  var link = String(Edge.prop("musicLink", "https://music.apple.com/us/browse")).trim();
  var rest = link.replace(/^[a-z]+:\/\//i, "");
  var variants = [
    "https://" + rest,
    "music://" + rest,
    "musics://" + rest,
    "itmss://" + rest,
  ];
  var i = musicTry % variants.length;
  musicTry++;
  var url = variants[i];
  log("MUSIC try " + (i + 1) + "/" + variants.length + ": " + url + " via " + Edge.openLink(url) +
    " — did the Apple Music app, a browser, or nothing open? Did it start playing?");
});

Edge.press($("tEnv"), logEnv);

// Opened outside iCUE (dev), log env right away.
if (!Edge.inIcue()) logEnv();
