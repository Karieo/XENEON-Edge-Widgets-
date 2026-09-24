/*
 * obs.js — minimal obs-websocket v5 client (OBS 28+, Tools → WebSocket Server Settings).
 * Handles Hello/Identify with password auth, requests with promises, events,
 * and reconnecting with backoff.
 */
(function (global) {
  "use strict";

  // Event subscription bits: all normal categories + InputVolumeMeters (high volume).
  var SUB_ALL = 2047;
  var SUB_VOLUME_METERS = 1 << 16;

  function Obs(opts) {
    this.url = opts.url;
    this.password = opts.password || "";
    this.onEvent = opts.onEvent || function () {};
    this.onState = opts.onState || function () {};
    this.ws = null;
    this.pending = {};
    this.nextId = 1;
    this.retryMs = 2000;
    this.closed = false;
    this.state = "idle";
    this.hello = null;
  }

  Obs.prototype.setState = function (s, detail) {
    this.state = s;
    this.onState(s, detail);
  };

  Obs.prototype.connect = function () {
    var self = this;
    self.closed = false;
    self.setState("connecting");
    var ws;
    try {
      ws = new WebSocket(self.url, "obswebsocket.json");
    } catch (e) {
      self.scheduleRetry("Bad address: " + self.url);
      return;
    }
    self.ws = ws;
    ws.onmessage = function (msg) {
      var m;
      try { m = JSON.parse(msg.data); } catch (e) { return; }
      self.handle(m);
    };
    ws.onclose = function (ev) {
      self.failAll("Disconnected");
      if (self.closed) return;
      // 4009 = authentication failed: don't hammer OBS with a wrong password.
      if (ev.code === 4009) { self.setState("auth", "Wrong OBS WebSocket password"); return; }
      self.scheduleRetry(self.state === "connected" ? "OBS closed the connection" : "OBS not reachable");
    };
    ws.onerror = function () { /* onclose follows */ };
  };

  Obs.prototype.scheduleRetry = function (why) {
    var self = this;
    self.setState("offline", why);
    clearTimeout(self.retryTimer);
    self.retryTimer = setTimeout(function () { if (!self.closed) self.connect(); }, self.retryMs);
    self.retryMs = Math.min(self.retryMs * 2, 30000);
  };

  Obs.prototype.close = function () {
    this.closed = true;
    clearTimeout(this.retryTimer);
    if (this.ws) try { this.ws.close(); } catch (e) {}
    this.failAll("Closed");
  };

  Obs.prototype.failAll = function (why) {
    var p = this.pending;
    this.pending = {};
    Object.keys(p).forEach(function (id) { p[id].reject(new Error(why)); });
  };

  Obs.prototype.handle = function (m) {
    var self = this;
    if (m.op === 0) { // Hello
      self.hello = m.d;
      var identify = { rpcVersion: 1, eventSubscriptions: SUB_ALL | SUB_VOLUME_METERS };
      var auth = m.d.authentication;
      if (!auth) { self.send(1, identify); return; }
      if (!self.password) { self.setState("auth", "OBS needs a password; add it in settings"); self.closed = true; self.ws.close(); return; }
      sha256b64(self.password + auth.salt).then(function (secret) {
        return sha256b64(secret + auth.challenge);
      }).then(function (answer) {
        identify.authentication = answer;
        self.send(1, identify);
      });
    } else if (m.op === 2) { // Identified
      self.retryMs = 2000;
      self.setState("connected", self.hello && self.hello.obsWebSocketVersion);
    } else if (m.op === 5) { // Event
      self.onEvent(m.d.eventType, m.d.eventData || {});
    } else if (m.op === 7) { // RequestResponse
      var entry = self.pending[m.d.requestId];
      if (!entry) return;
      delete self.pending[m.d.requestId];
      if (m.d.requestStatus && m.d.requestStatus.result) entry.resolve(m.d.responseData || {});
      else {
        var err = new Error((m.d.requestStatus && m.d.requestStatus.comment) || "Request failed");
        err.code = m.d.requestStatus && m.d.requestStatus.code;
        entry.reject(err);
      }
    }
  };

  Obs.prototype.send = function (op, d) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op: op, d: d }));
  };

  Obs.prototype.call = function (requestType, requestData) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.state !== "connected") { reject(new Error("Not connected")); return; }
      var id = "r" + self.nextId++;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.send(6, { requestType: requestType, requestId: id, requestData: requestData || {} });
      setTimeout(function () {
        if (self.pending[id]) { delete self.pending[id]; reject(new Error(requestType + " timed out")); }
      }, 5000);
    });
  };

  // ---- SHA-256 → base64 (WebCrypto when available, small JS fallback otherwise) ----

  function sha256b64(text) {
    var bytes = new TextEncoder().encode(text);
    var subtle = global.crypto && global.crypto.subtle;
    var p = subtle ? subtle.digest("SHA-256", bytes).then(function (b) { return new Uint8Array(b); })
                   : Promise.resolve(sha256js(bytes));
    return p.then(function (h) {
      var s = "";
      for (var i = 0; i < h.length; i++) s += String.fromCharCode(h[i]);
      return btoa(s);
    });
  }

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function sha256js(msg) {
    var len = msg.length;
    var total = ((len + 9 + 63) >> 6) << 6;
    var buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    var bits = len * 8;
    for (var b = 0; b < 8; b++) buf[total - 1 - b] = (b < 4 ? (bits >>> (b * 8)) : Math.floor(bits / 4294967296) >>> ((b - 4) * 8)) & 0xff;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) | (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & bb) ^ (a & c) ^ (bb & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = (h[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (h[i] >>> 8) & 0xff; out[i * 4 + 3] = h[i] & 0xff;
    }
    return out;
  }

  Obs.sha256b64 = sha256b64;
  Obs.sha256js = sha256js;
  global.Obs = Obs;
})(window);
