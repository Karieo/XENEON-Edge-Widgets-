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

  // ---- iCUE properties ---------------------------------------------------

  // iCUE injects each x-icue-property as a global. Depending on the context it
  // may live on window or only in the sandbox scope, so check both.
  Edge.prop = function (name, fallback) {
    if (Object.prototype.hasOwnProperty.call(global, name)) {
      var w = global[name];
      if (w !== undefined && w !== null && w !== "") return w;
    }
    try {
      var v = Function("return typeof " + name + ' !== "undefined" ? ' + name + " : undefined")();
      if (v !== undefined && v !== null && v !== "") return v;
    } catch (e) {}
    return fallback;
  };

  Edge.inIcue = function () {
    return typeof global.iCUE_initialized !== "undefined";
  };

  Edge.icueReady = function () {
    return typeof global.iCUE_initialized !== "undefined" && !!global.iCUE_initialized;
  };

  // ---- Plugins -----------------------------------------------------------

  // module: "Sensorsdataprovider" | "Mediadataprovider" | "Linkprovider"
  Edge.plugin = function (module) {
    return global.plugins && global.plugins[module] ? global.plugins[module] : null;
  };

  Edge.pluginReady = function (module) {
    var flag = global["plugin" + module + "_initialized"];
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
    global["plugin" + module + "Events"] = { onInitialized: once };
    if (Edge.pluginReady(module)) once();
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

  global.Edge = Edge;
})(window);
