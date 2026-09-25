/*
 * icue-adapter.js — the only file that talks to iCUE directly.
 *
 * Written from Corsair's documented plugin contract (requestId + asyncResponse
 * signal, plugin<Module>Events, plugin<Module>_initialized). If the widget UI
 * ever moves to a local server + kiosk window, swap this file and keep the rest.
 *
 * Everything degrades to a harmless fallback when opened in a normal browser,
 * so widgets can be developed without iCUE.
 */
(function (global) {
  "use strict";

  var Edge = {};

  // iCUE can declare its globals (iCUE_initialized, plugins, uniqueId, the
  // plugin flags and event hooks) as script-level let/const. Those are visible
  // to bare names but NOT as window properties, so every read and write of an
  // iCUE global goes through these two helpers instead of window[name].
  function readGlobal(name) {
    try {
      return Function("return typeof " + name + ' !== "undefined" ? ' + name + " : undefined")();
    } catch (e) {
      return global[name];
    }
  }

  // Bare assignment: updates iCUE's binding when it exists, else creates a
  // window property that iCUE can pick up later (same as the docs' examples).
  function writeGlobal(name, value) {
    try {
      Function("v", name + " = v;")(value);
    } catch (e) {
      global[name] = value;
    }
  }

  Edge.readGlobal = readGlobal;

  // ---- iCUE properties ---------------------------------------------------

  // iCUE injects each x-icue-property as a global. Depending on the context it
  // may live on window or only in the sandbox scope, so check both.
  Edge.prop = function (name, fallback) {
    if (Object.prototype.hasOwnProperty.call(global, name)) {
      var w = global[name];
      if (w !== undefined && w !== null && w !== "") return w;
    }
    var v = readGlobal(name);
    if (v !== undefined && v !== null && v !== "") return v;
    return fallback;
  };

  Edge.inIcue = function () {
    return readGlobal("iCUE_initialized") !== undefined || !!readGlobal("plugins");
  };

  Edge.icueReady = function () {
    return !!readGlobal("iCUE_initialized");
  };

  // ---- Plugins -----------------------------------------------------------

  // module: "Sensorsdataprovider" | "Mediadataprovider" | "Linkprovider"
  Edge.plugin = function (module) {
    var plugins = readGlobal("plugins");
    return plugins && plugins[module] ? plugins[module] : null;
  };

  Edge.pluginReady = function (module) {
    var flag = readGlobal("plugin" + module + "_initialized");
    return !!flag && !!Edge.plugin(module);
  };

  // Registers the plugin's onInitialized callback and fires it right away if
  // the plugin already loaded before this script ran.
  Edge.onPlugin = function (module, callback) {
    var fired = false;
    function once() {
      if (fired || !Edge.plugin(module)) return;
      fired = true;
      try { callback(Edge.plugin(module)); } catch (e) { console.error(module, e); }
    }
    writeGlobal("plugin" + module + "Events", { onInitialized: once });
    if (Edge.pluginReady(module)) once();
    // Belt and braces: if the hook is missed, pick the plugin up once it appears.
    var tries = 0;
    var poll = setInterval(function () {
      if (fired || ++tries > 30) { clearInterval(poll); return; }
      if (Edge.plugin(module)) once();
    }, 1000);
  };

  // One asyncResponse listener per plugin, shared by every request.
  var channels = typeof WeakMap === "function" ? new WeakMap() : null;
  var nextId = 1;

  function channelFor(plugin) {
    var ch = channels && channels.get(plugin);
    if (ch) return ch;
    ch = { pending: {} };
    if (plugin.asyncResponse && typeof plugin.asyncResponse.connect === "function") {
      plugin.asyncResponse.connect(function (id, value) {
        var entry = ch.pending[id];
        if (!entry) return;
        delete ch.pending[id];
        clearTimeout(entry.timer);
        entry.resolve(value);
      });
    }
    if (channels) channels.set(plugin, ch);
    return ch;
  }

  // Edge.request(plugin, "getSensorValue", sensorId) -> Promise
  Edge.request = function (plugin, method) {
    var args = Array.prototype.slice.call(arguments, 2);
    return new Promise(function (resolve, reject) {
      if (!plugin || typeof plugin[method] !== "function") {
        reject(new Error(method + " not available"));
        return;
      }
      var ch = channelFor(plugin);
      var id = nextId++;
      var timer = setTimeout(function () {
        delete ch.pending[id];
        reject(new Error(method + " timed out"));
      }, 5000);
      ch.pending[id] = { resolve: resolve, timer: timer };
      try {
        plugin[method].apply(plugin, [id].concat(args));
      } catch (e) {
        clearTimeout(timer);
        delete ch.pending[id];
        reject(e);
      }
    });
  };

  // ---- Links -------------------------------------------------------------

  // Opens in the system default browser via the Link plugin. A plain
  // window.open would load the page inside the widget instead.
  Edge.openLink = function (url) {
    // App schemes (claude://) were confirmed on hardware through window.open,
    // which hands them to Windows. Keep that path for anything not http(s).
    if (!/^https?:/i.test(url)) {
      global.open(url, "_blank", "noopener");
      return "browser";
    }
    var link = Edge.plugin("Linkprovider");
    if (link && typeof link.open === "function") {
      link.open(url);
      return "linkprovider";
    }
    if (!Edge.inIcue()) {
      global.open(url, "_blank", "noopener");
      return "browser";
    }
    return "unavailable";
  };

  // ---- Persistence -------------------------------------------------------

  // One JSON object per widget instance, keyed by iCUE's injected uniqueId.
  function storeKey() {
    var id = Edge.prop("uniqueId");
    return id ? String(id) : "dev:" + global.location.pathname;
  }

  Edge.store = {
    key: storeKey,
    load: function () {
      try {
        var raw = global.localStorage.getItem(storeKey());
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },
    save: function (data) {
      try {
        global.localStorage.setItem(storeKey(), JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    onExternalChange: function (callback) {
      global.addEventListener("storage", function (event) {
        if (event.key === storeKey()) callback(Edge.store.load());
      });
    },
  };

  // ---- Sensor auto-pick ----------------------------------------------------

  // Every sensor with the fields auto-pick needs: [{ id, type, kind, name, device }].
  Edge.sensorCatalog = function (plugin) {
    function ask(method, id) {
      return Edge.request(plugin, method, id).catch(function () { return ""; });
    }
    return Edge.request(plugin, "getAllSensorIds").then(function (ids) {
      ids = Array.isArray(ids) ? ids : [];
      return Promise.all(ids.map(function (id) {
        return Promise.all([ask("getSensorType", id), ask("getSensorKind", id), ask("getSensorName", id), ask("getSensorDeviceName", id)])
          .then(function (r) {
            return { id: id, type: String(r[0] || ""), kind: String(r[1] || ""), name: String(r[2] || ""), device: String(r[3] || "") };
          });
      }));
    });
  };

  // A Ryzen 9000 has a small Radeon iGPU next to the real card, so GPU picks
  // rank by device name: discrete first, integrated only as a last resort.
  var DGPU = /nvidia|geforce|\brtx\b|\bgtx\b|radeon\s+rx|\barc\s+[ab]\d/i;
  var IGPU = /radeon\(tm\)\s+graphics|radeon\s+graphics|intel.*(uhd|iris|hd graphics)|integrated/i;
  var CPU = /ryzen|threadripper|core\(tm\)|intel.*core|\bcpu\b|processor|package/i;
  var SIDE_LOAD = /memory|video|engine|decode|encode|bus|copy/i;

  function label(s) { return s.device + " " + s.name; }

  var ROLES = {
    "cpu-temp": function (s) {
      if (s.type !== "temperature" || DGPU.test(label(s)) || IGPU.test(label(s))) return -1;
      var score = 0;
      if (s.kind === "cpu-temp" || s.kind === "package") score += 10;
      if (CPU.test(label(s))) score += 5;
      return score || -1;
    },
    "gpu-temp": function (s) {
      if (s.type !== "temperature") return -1;
      return gpuScore(s, /^gpu/.test(s.kind));
    },
    "gpu-load": function (s) {
      if (s.type !== "load") return -1;
      var score = gpuScore(s, s.kind === "gpu-load");
      return score > 0 && SIDE_LOAD.test(s.name) ? score - 15 : score;
    },
    fps: function (s) { return s.type === "fps" ? 1 : -1; },
  };

  function gpuScore(s, kindMatch) {
    var dgpu = DGPU.test(label(s));
    var igpu = !dgpu && IGPU.test(label(s));
    if (!kindMatch && !dgpu && !igpu) return -1;
    return 30 + (dgpu ? 20 : 0) - (igpu ? 20 : 0) + (kindMatch ? 5 : 0);
  }

  // Best sensor id for a role ("cpu-temp" | "gpu-temp" | "gpu-load" | "fps"), or "".
  // "#1" beats "#2" on the same chip; other ties keep iCUE's order.
  Edge.pickSensor = function (catalog, role) {
    var rate = ROLES[role];
    var best = null;
    var bestScore = 0;
    (catalog || []).forEach(function (s) {
      var score = rate(s);
      if (score > 0 && /#\s*1\b/.test(s.name)) score += 1;
      if (score > bestScore) { best = s; bestScore = score; }
    });
    return best ? best.id : "";
  };

  // The other temperature sensor on the same device as `id` ("Temp #2" when
  // "Temp #1" is bound): { id, label } or null.
  Edge.siblingSensor = function (catalog, id) {
    if (!id || !catalog) return null;
    var me = catalog.find(function (s) { return s.id === id; });
    if (!me || !me.device) return null;
    var sib = catalog.find(function (s) {
      return s.id !== id && s.type === me.type && s.device === me.device;
    });
    if (!sib) return null;
    var tag = (sib.name.match(/#\s*\d+/) || [])[0];
    return { id: sib.id, label: (tag || sib.name).toUpperCase().slice(0, 12) };
  };

  // ---- Misc --------------------------------------------------------------

  // Holds a press for `ms` before firing `onLong`; a quick tap fires `onTap`.
  Edge.press = function (el, onTap, onLong, ms) {
    var timer = null;
    var longFired = false;
    ms = ms || 550;
    el.addEventListener("pointerdown", function () {
      longFired = false;
      el.classList.add("is-pressed");
      if (onLong) {
        timer = setTimeout(function () {
          longFired = true;
          onLong();
        }, ms);
      }
    });
    function end(fire) {
      clearTimeout(timer);
      el.classList.remove("is-pressed");
      if (fire && !longFired && onTap) onTap();
    }
    el.addEventListener("pointerup", function () { end(true); });
    el.addEventListener("pointerleave", function () { end(false); });
    el.addEventListener("pointercancel", function () { end(false); });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  };

  // Fires only after a full hold, so a stray tap mid-game can't trigger it.
  // Pair with the .btn.hold CSS, which fills the button while held.
  Edge.hold = function (el, onConfirm, ms) {
    ms = ms || 900;
    el.classList.add("hold");
    el.style.setProperty("--hold-ms", ms + "ms");
    Edge.press(el, null, onConfirm, ms);
  };

  // Uniform integer in [1, sides], without modulo bias.
  Edge.roll = function (sides) {
    var c = global.crypto;
    if (!c || !c.getRandomValues) return 1 + Math.floor(Math.random() * sides);
    var buf = new Uint32Array(1);
    var limit = Math.floor(0x100000000 / sides) * sides;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return 1 + (buf[0] % sides);
  };

  // Bar-graph trace. Keeps exactly `count` <span class="bar"> children in
  // `container` and draws `samples` (oldest first) right-aligned.
  // Each sample is null or { pct: 0-100, state: "normal" | "warm" | "hot" }.
  Edge.drawBars = function (container, samples, count) {
    var bars = container.querySelectorAll(".bar");
    if (bars.length !== count) {
      Array.prototype.forEach.call(bars, function (b) { b.remove(); });
      for (var i = 0; i < count; i++) {
        var b = document.createElement("span");
        b.className = "bar";
        container.appendChild(b);
      }
      bars = container.querySelectorAll(".bar");
    }
    var offset = count - samples.length;
    for (var j = 0; j < count; j++) {
      var s = j >= offset ? samples[j - offset] : null;
      bars[j].style.height = s ? Math.max(3, Math.min(100, s.pct)) + "%" : "0";
      bars[j].dataset.state = s ? s.state : "";
    }
  };

  global.Edge = Edge;
})(window);
