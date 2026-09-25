/*
 * sound.js — procedural ambience with the Web Audio API. Nothing is sampled:
 * every layer is noise, filters and oscillators, shaped live.
 *
 *   Sound.start()            create the audio graph (needs a user gesture)
 *   Sound.setLevel(key, 0-100)
 *   Sound.setMaster(0-100)
 *   Sound.pause() / resume() / playing()
 *   Sound.analyser()         AnalyserNode on the master output, for the scope
 */
(function (global) {
  "use strict";

  var ctx = null;
  var master = null;
  var scope = null;
  var buffers = {};
  var layers = {};
  var levels = {};
  var masterLevel = 60;
  var ticker = null;

  // Per-layer loudness at 100%, so the layers sit together at equal settings.
  // Balanced by measurement: each layer alone at 70% lands near -23 dBFS RMS.
  var BASE = { rain: 2.75, wind: 4.9, fire: 1.8, stream: 1.5, night: 4.2, thunder: 3.0, drone: 2.5, brown: 1.8 };

  // ---- Noise ---------------------------------------------------------------

  function makeNoise(kind, seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === "white") {
        d[i] = w;
      } else if (kind === "pink") {
        // Paul Kellet's economy pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02; // brown: integrated white
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  function loop(kind) {
    var s = ctx.createBufferSource();
    s.buffer = buffers[kind];
    s.loop = true;
    s.start(0, Math.random() * s.buffer.duration);
    return s;
  }

  function filter(type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  function gain(v) {
    var g = ctx.createGain();
    g.gain.value = v;
    return g;
  }

  function chain() {
    for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    return arguments[arguments.length - 1];
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // A short filtered noise hit: rain drops, fire crackles.
  function burst(dest, t, opts) {
    var s = ctx.createBufferSource();
    s.buffer = buffers.white;
    var f = filter(opts.type || "bandpass", opts.freq, opts.q || 1);
    var g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.amp, t + (opts.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    chain(s, f, g, dest);
    s.start(t, Math.random() * (s.buffer.duration - 1), opts.dur + 0.05);
  }

  // ---- Layers --------------------------------------------------------------
  // Each returns { out: GainNode, tick?: function(time, level) }.

  var BUILD = {
    rain: function () {
      var out = gain(0);
      chain(loop("pink"), filter("highpass", 500), filter("lowpass", 6500), gain(0.9), out);
      var patter = gain(0.5);
      patter.connect(out);
      return {
        out: out,
        tick: function (t, lvl) {
          var n = Math.round(rand(0, 3 + lvl / 12));
          for (var i = 0; i < n; i++) {
            burst(patter, t + rand(0, 0.05), { freq: rand(1800, 5200), q: rand(2, 6), amp: rand(0.05, 0.3), dur: rand(0.01, 0.04) });
          }
        },
      };
    },

    wind: function () {
      var out = gain(0);
      var bp = filter("bandpass", 500, 0.7);
      var swell = gain(0.8);
      chain(loop("brown"), bp, swell, out);
      var next = 0;
      return {
        out: out,
        tick: function (t) {
          if (t < next) return;
          next = t + rand(1.2, 3);
          bp.frequency.setTargetAtTime(rand(220, 950), t, 1.4);
          swell.gain.setTargetAtTime(rand(0.35, 1), t, 1.8);
        },
      };
    },

    fire: function () {
      var out = gain(0);
      chain(loop("brown"), filter("lowpass", 320), gain(0.9), out);
      var crackle = gain(0.8);
      crackle.connect(out);
      return {
        out: out,
        tick: function (t, lvl) {
          if (Math.random() < 0.35 + lvl / 250) {
            burst(crackle, t + rand(0, 0.05), { type: "highpass", freq: rand(1200, 4200), amp: rand(0.1, 0.55), dur: rand(0.005, 0.03) });
          }
          if (Math.random() < 0.02) { // a log pops
            burst(crackle, t + 0.02, { type: "bandpass", freq: rand(500, 1200), q: 1.5, amp: 0.8, dur: 0.12 });
          }
        },
      };
    },

    stream: function () {
      var out = gain(0);
      chain(loop("pink"), filter("lowpass", 1400), gain(0.6), out);
      var bubbles = [0, 1, 2].map(function () {
        var f = filter("bandpass", rand(400, 1600), 9);
        chain(loop("white"), f, gain(1.6), out);
        return f;
      });
      return {
        out: out,
        tick: function (t) {
          bubbles.forEach(function (f) {
            if (Math.random() < 0.5) f.frequency.setTargetAtTime(rand(350, 1800), t, 0.03);
          });
        },
      };
    },

    night: function () {
      var out = gain(0);
      chain(loop("pink"), filter("lowpass", 900), gain(0.25), out);
      // Two crickets at different pitches and rhythms.
      var crickets = [{ f: 4400, every: 0.9 }, { f: 3800, every: 1.35 }].map(function (c) {
        var osc = ctx.createOscillator();
        osc.frequency.value = c.f;
        var g = gain(0);
        chain(osc, g, out);
        osc.start();
        return { g: g, every: c.every, next: 0 };
      });
      return {
        out: out,
        tick: function (t) {
          crickets.forEach(function (c) {
            if (t < c.next) return;
            c.next = t + c.every * rand(0.85, 1.2);
            for (var i = 0; i < 3; i++) {
              var s = t + 0.05 + i * 0.045;
              c.g.gain.setValueAtTime(0, s);
              c.g.gain.linearRampToValueAtTime(0.5, s + 0.008);
              c.g.gain.linearRampToValueAtTime(0, s + 0.03);
            }
          });
        },
      };
    },

    thunder: function () {
      var out = gain(0);
      var next = 0;
      return {
        out: out,
        tick: function (t, lvl) {
          if (!next) next = t + rand(3, 8);
          if (t < next) return;
          next = t + rand(18, 50) * (1.4 - lvl / 100);
          var s = ctx.createBufferSource();
          s.buffer = buffers.brown;
          s.loop = true; // a long roll can outlast the buffer
          var lp = filter("lowpass", rand(140, 320));
          var g = gain(0);
          var len = rand(4, 8);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(rand(0.7, 1.2), t + rand(0.1, 0.5));
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          lp.frequency.setTargetAtTime(90, t + 0.5, len / 3);
          chain(s, lp, g, out);
          s.start(t, Math.random() * 5, len + 0.2);
        },
      };
    },

    drone: function () {
      var out = gain(0);
      var lp = filter("lowpass", 380, 2);
      chain(lp, out);
      [[55, "sine", 0.5], [55.7, "sine", 0.5], [82.4, "triangle", 0.18], [110.3, "sine", 0.08]].forEach(function (o) {
        var osc = ctx.createOscillator();
        osc.type = o[1];
        osc.frequency.value = o[0];
        chain(osc, gain(o[2]), lp);
        osc.start();
      });
      var next = 0;
      return {
        out: out,
        tick: function (t) {
          if (t < next) return;
          next = t + rand(3, 6);
          lp.frequency.setTargetAtTime(rand(220, 620), t, 2.5);
        },
      };
    },

    brown: function () {
      var out = gain(0);
      chain(loop("brown"), filter("lowpass", 900), out);
      return { out: out };
    },
  };

  // ---- Public API ----------------------------------------------------------

  function start() {
    if (ctx) { resume(); return true; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    buffers.white = makeNoise("white", 3);
    buffers.pink = makeNoise("pink", 4);
    buffers.brown = makeNoise("brown", 6);
    master = gain(0);
    scope = ctx.createAnalyser();
    scope.fftSize = 2048;
    // Safety limiter so stacked layers and thunder never clip.
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    chain(master, limiter, scope, ctx.destination);
    Object.keys(BUILD).forEach(function (key) {
      var layer = BUILD[key]();
      layer.out.connect(master);
      layers[key] = layer;
      applyLevel(key);
    });
    applyMaster();
    // Schedule events ~60 ms ahead of the audio clock.
    ticker = setInterval(function () {
      if (!ctx || ctx.state !== "running") return;
      var t = ctx.currentTime + 0.06;
      Object.keys(layers).forEach(function (key) {
        var lvl = levels[key] || 0;
        if (lvl > 0 && layers[key].tick) layers[key].tick(t, lvl);
      });
    }, 50);
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function curve(v) { return Math.pow(Math.max(0, Math.min(100, v)) / 100, 2); }

  function applyLevel(key) {
    if (!layers[key]) return;
    layers[key].out.gain.setTargetAtTime(BASE[key] * curve(levels[key] || 0), ctx.currentTime, 0.25);
  }

  function applyMaster(timeConst) {
    if (master) master.gain.setTargetAtTime(curve(masterLevel) * 1.2, ctx.currentTime, timeConst || 0.15);
  }

  function resume() { if (ctx && ctx.state !== "running") ctx.resume(); }

  global.Sound = {
    start: start,
    started: function () { return !!ctx; },
    playing: function () { return !!ctx && ctx.state === "running"; },
    pause: function () { if (ctx) ctx.suspend(); },
    resume: resume,
    setLevel: function (key, v) { levels[key] = v; if (ctx) applyLevel(key); },
    setMaster: function (v, fadeSeconds) { masterLevel = v; if (ctx) applyMaster(fadeSeconds ? fadeSeconds / 3 : 0); },
    analyser: function () { return scope; },
    layerKeys: function () { return Object.keys(BUILD); },
  };
})(window);
