/* @ds-bundle: {"format":4,"namespace":"Syne","components":[{"name":"Panel"},{"name":"Legend"},{"name":"Glyph"},{"name":"Grille"},{"name":"Led"},{"name":"Meter"},{"name":"DotMatrix"},{"name":"Key"},{"name":"KeyStrip"},{"name":"PushButton"},{"name":"Segmented"},{"name":"PadGrid"},{"name":"StepGrid"},{"name":"Knob"},{"name":"Dial"},{"name":"Selector"},{"name":"Lever"},{"name":"Fader"},{"name":"Toggle"},{"name":"Rocker"},{"name":"SlideSwitch"},{"name":"PillSwitch"},{"name":"Jack"}]} */
(function () {
  'use strict';
  var R = window.React;
  var h = R.createElement, useState = R.useState, useRef = R.useRef, useEffect = R.useEffect;

  function cx() { var o = []; for (var i = 0; i < arguments.length; i++) if (arguments[i]) o.push(arguments[i]); return o.join(' '); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function def(v, d) { return v === undefined || v === null ? d : v; }
  function quant(v, min, step) { if (!step) return v; var q = Math.round((v - min) / step) * step + min; return Math.round(q * 1e6) / 1e6; }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ==================================================================
     FEEDBACK ENGINE
     Three channels, fired together on the physical event:
       1. Vibration API (Android browsers)       — patterns per mechanism
       2. Taptic Engine (iOS 18+ Safari)          — via a hidden native <input switch>
       3. Mechanical sound                        — synthesised per mechanism:
          noise transients (contact), resonant bodies (plastic/metal),
          friction grains (faders, slides) and springs (toggles).
     ================================================================== */
  var FB = { haptics: true, sound: true, volume: 0.5, ctx: null, bus: null, noise: null, lastVib: 0, lastTap: 0, last: {} };
  var UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  var CAN_VIBRATE = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  var IS_IOS = /iP(hone|ad|od)/.test(UA) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var HAS_AUDIO = !!(window.AudioContext || window.webkitAudioContext);

  var tapEl = null;
  function taptic() {
    if (!IS_IOS) return;
    try {
      if (!tapEl) {
        var l = document.createElement('label');
        l.setAttribute('aria-hidden', 'true');
        l.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
        var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
        l.appendChild(i); (document.body || document.documentElement).appendChild(l); tapEl = l;
      }
      tapEl.click();
    } catch (e) {}
  }

  function ac() {
    if (!HAS_AUDIO) return null;
    if (!FB.ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      try { FB.ctx = new C({ latencyHint: 'interactive' }); } catch (e) { try { FB.ctx = new C(); } catch (e2) { return null; } }
    }
    if (FB.ctx.state === 'suspended') { try { FB.ctx.resume(); } catch (e) {} }
    return FB.ctx;
  }
  function bus(a) {
    if (!FB.bus || FB.bus.context !== a) {
      var comp = a.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.001; comp.release.value = 0.05;
      var g = a.createGain(); g.connect(comp); comp.connect(a.destination); FB.bus = g;
    }
    FB.bus.gain.value = FB.volume;
    return FB.bus;
  }
  function noise(a) {
    if (FB.noise && FB.noise.sampleRate === a.sampleRate) return FB.noise;
    var n = a.sampleRate, b = a.createBuffer(1, n, n), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    FB.noise = b; return b;
  }
  function jit(f) { return f * (0.94 + Math.random() * 0.12); }
  /* a filtered noise transient: the contact, the scrape */
  function burst(a, t, o) {
    var s = a.createBufferSource(); s.buffer = noise(a);
    var f = a.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.f; f.Q.value = o.q || 1;
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.g, t + 0.0007); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    s.connect(f); f.connect(g); g.connect(bus(a)); s.start(t, Math.random() * 0.6); s.stop(t + o.d + 0.03);
  }
  /* a decaying resonance: the plastic shell, the metal spring */
  function ring(a, t, o) {
    var osc = a.createOscillator(); osc.type = o.wave || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.d);
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.g, t + 0.0012); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    osc.connect(g); g.connect(bus(a)); osc.start(t); osc.stop(t + o.d + 0.03);
  }
  var SOUNDS = {
    tick:    function (a, t, k) { burst(a, t, { f: jit(5200), q: 3, d: 0.003, g: 0.22 * k }); },
    detent:  function (a, t, k) { burst(a, t, { f: jit(3000), q: 2.4, d: 0.005, g: 0.5 * k }); ring(a, t, { f: jit(3400), d: 0.012, g: 0.05 * k }); },
    notch:   function (a, t, k) { burst(a, t, { f: jit(1900), q: 2, d: 0.008, g: 0.75 * k }); ring(a, t, { f: jit(1250), d: 0.035, g: 0.12 * k }); burst(a, t + 0.013, { f: jit(4200), q: 3, d: 0.003, g: 0.2 * k }); },
    press:   function (a, t, k) { burst(a, t, { f: jit(3600), q: 2, d: 0.003, g: 0.32 * k }); burst(a, t + 0.006, { type: 'lowpass', f: jit(1100), q: 0.7, d: 0.022, g: 0.9 * k }); ring(a, t + 0.006, { f: jit(380), d: 0.045, g: 0.16 * k }); },
    release: function (a, t, k) { burst(a, t, { f: jit(2600), q: 2, d: 0.004, g: 0.22 * k }); ring(a, t, { f: jit(640), d: 0.025, g: 0.05 * k }); },
    latch:   function (a, t, k) { SOUNDS.press(a, t, k); burst(a, t + 0.02, { f: jit(1500), q: 1.5, d: 0.006, g: 0.45 * k }); ring(a, t + 0.02, { f: jit(900), d: 0.03, g: 0.08 * k }); },
    snap:    function (a, t, k) { burst(a, t, { f: jit(2200), q: 2, d: 0.003, g: 0.22 * k }); burst(a, t + 0.009, { f: jit(1500), q: 1.2, d: 0.011, g: 1.0 * k }); ring(a, t + 0.009, { f: jit(880), d: 0.04, g: 0.16 * k }); ring(a, t + 0.009, { f: jit(4300), d: 0.09, g: 0.02 * k }); },
    clunk:   function (a, t, k) { burst(a, t, { f: jit(2400), q: 2, d: 0.004, g: 0.3 * k }); burst(a, t + 0.006, { type: 'lowpass', f: jit(700), q: 0.8, d: 0.038, g: 1.0 * k }); ring(a, t + 0.006, { f: jit(240), d: 0.065, g: 0.24 * k }); },
    slide:   function (a, t, k) { for (var i = 0; i < 5; i++) burst(a, t + i * 0.018, { f: jit(2600), q: 0.9, d: 0.016, g: 0.07 * k }); burst(a, t + 0.095, { f: jit(1700), q: 1.5, d: 0.008, g: 0.8 * k }); ring(a, t + 0.095, { f: jit(700), d: 0.03, g: 0.1 * k }); },
    thump:   function (a, t, k) { ring(a, t, { f: jit(160), f1: 55, d: 0.09, g: 0.55 * k }); burst(a, t, { type: 'lowpass', f: jit(520), q: 0.7, d: 0.028, g: 0.5 * k }); },
    jack:    function (a, t, k) { burst(a, t, { f: jit(3200), q: 1, d: 0.032, g: 0.12 * k }); burst(a, t + 0.034, { f: jit(1800), q: 2, d: 0.006, g: 0.9 * k }); ring(a, t + 0.034, { f: jit(2600), d: 0.022, g: 0.07 * k }); ring(a, t + 0.034, { f: jit(520), d: 0.045, g: 0.1 * k }); },
    unplug:  function (a, t, k) { burst(a, t, { f: jit(2000), q: 2, d: 0.005, g: 0.5 * k }); burst(a, t + 0.006, { f: jit(3600), q: 1, d: 0.025, g: 0.1 * k }); },
    grain:   function (a, t, k) { burst(a, t, { f: jit(1500 + 1800 * k), q: 0.6, d: 0.03, g: 0.04 + 0.11 * k }); },
    error:   function (a, t, k) { ring(a, t, { f: 180, wave: 'square', d: 0.05, g: 0.07 * k }); ring(a, t + 0.09, { f: 150, wave: 'square', d: 0.07, g: 0.07 * k }); }
  };
  var VIBRATE = { tick: [2], detent: [5], notch: [12], press: [9], release: [3], latch: [9, 24, 6], snap: [3, 8, 14], clunk: [20], slide: [2, 14, 2, 14, 2, 34, 10], thump: [26], jack: [4, 28, 14], unplug: [8], grain: [1], error: [30, 60, 30, 60, 30] };
  var TAPS = { tick: [0], detent: [0], notch: [0, 45], press: [0], release: [], latch: [0, 40], snap: [0], clunk: [0], slide: [0, 95], thump: [0], jack: [0, 40], unplug: [0], grain: [], error: [0, 90, 180] };
  var LIMIT = { tick: 16, detent: 12, grain: 22, notch: 40 };
  var ALIAS = { click: 'press', thunk: 'latch' };
  var LISTENERS = [];
  /* what each mechanism maps to on a native haptic engine, for apps in a native shell */
  var NATIVE = {
    tick:    { ios: 'UISelectionFeedbackGenerator',             android: 'CLOCK_TICK' },
    detent:  { ios: 'UIImpactFeedbackGenerator(.rigid, 0.6)',   android: 'SEGMENT_FREQUENT_TICK' },
    notch:   { ios: 'UIImpactFeedbackGenerator(.rigid, 1.0)',   android: 'SEGMENT_TICK' },
    press:   { ios: 'UIImpactFeedbackGenerator(.medium)',       android: 'VIRTUAL_KEY' },
    release: { ios: 'UIImpactFeedbackGenerator(.soft, 0.4)',    android: 'VIRTUAL_KEY_RELEASE' },
    latch:   { ios: 'UIImpactFeedbackGenerator(.heavy)',        android: 'CONFIRM' },
    snap:    { ios: 'UIImpactFeedbackGenerator(.rigid)',        android: 'TOGGLE_ON' },
    clunk:   { ios: 'UIImpactFeedbackGenerator(.heavy)',        android: 'LONG_PRESS' },
    slide:   { ios: 'UIImpactFeedbackGenerator(.light) ×2',     android: 'GESTURE_END' },
    thump:   { ios: 'UIImpactFeedbackGenerator(.soft)',         android: 'KEYBOARD_PRESS' },
    jack:    { ios: 'UIImpactFeedbackGenerator(.rigid) ×2',     android: 'CONFIRM' },
    unplug:  { ios: 'UIImpactFeedbackGenerator(.light)',        android: 'KEYBOARD_RELEASE' },
    grain:   { ios: 'none',                                      android: 'TEXT_HANDLE_MOVE' },
    error:   { ios: 'UINotificationFeedbackGenerator(.error)',  android: 'REJECT' }
  };

  function feel(kind, k) {
    kind = ALIAS[kind] || kind;
    k = k === undefined ? 1 : clamp(k, 0, 1);
    var t = now();
    var lim = LIMIT[kind];
    if (lim && FB.last[kind] && t - FB.last[kind] < lim) return;
    FB.last[kind] = t;
    for (var li = 0; li < LISTENERS.length; li++) { try { LISTENERS[li](kind, k); } catch (e) {} }
    if (FB.haptics && !FB.nativeOnly) {
      var pat = VIBRATE[kind];
      if (CAN_VIBRATE && pat && (t - FB.lastVib > ((kind === 'tick' || kind === 'grain') ? 30 : 0))) {
        FB.lastVib = t;
        var p = k < 0.6 ? pat.map(function (x, i) { return i % 2 ? x : Math.max(1, Math.round(x * k * 1.4)); }) : pat;
        try { navigator.vibrate(p); } catch (e) {}
      }
      var taps = TAPS[kind];
      if (IS_IOS && taps && taps.length && t - FB.lastTap > 38) {
        FB.lastTap = t;
        taps.forEach(function (ms) { if (ms === 0) taptic(); else setTimeout(taptic, ms); });
      }
    }
    if (FB.sound) {
      var a = ac(), s = SOUNDS[kind];
      if (a && s) { try { s(a, a.currentTime + 0.002, k); } catch (e) {} }
    }
  }
  /* wake the audio clock on the first touch so the first click isn't late */
  try {
    var wake = function () { if (FB.sound) ac(); };
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    document.addEventListener('keydown', wake, { capture: true });
  } catch (e) {}

  var feedback = {
    play: feel,
    tick: function (k) { feel('tick', k); }, detent: function (k) { feel('detent', k); }, notch: function (k) { feel('notch', k); },
    press: function (k) { feel('press', k); }, release: function (k) { feel('release', k); }, latch: function (k) { feel('latch', k); },
    snap: function (k) { feel('snap', k); }, clunk: function (k) { feel('clunk', k); }, slide: function (k) { feel('slide', k); },
    thump: function (k) { feel('thump', k); }, jack: function (k) { feel('jack', k); }, error: function (k) { feel('error', k); },
    click: function (k) { feel('press', k); }, thunk: function (k) { feel('latch', k); },
    friction: function (speed) { feel('grain', clamp(speed / 1.5, 0.12, 1)); },
    subscribe: function (fn) { LISTENERS.push(fn); return function () { var i = LISTENERS.indexOf(fn); if (i >= 0) LISTENERS.splice(i, 1); }; },
    native: NATIVE,
    configure: function (o) { o = o || {}; ['haptics', 'sound', 'volume', 'nativeOnly'].forEach(function (k) { if (o[k] !== undefined) FB[k] = o[k]; }); if (o.sound) ac(); },
    settings: function () { return { haptics: FB.haptics, sound: FB.sound, volume: FB.volume, nativeOnly: !!FB.nativeOnly }; },
    capabilities: function () { return { vibrate: CAN_VIBRATE, taptic: IS_IOS, audio: HAS_AUDIO }; },
    kinds: Object.keys(SOUNDS),
    patterns: VIBRATE
  };

  /* ==================================================================
     SHARED BEHAVIOUR
     ================================================================== */
  function useControlled(value, initial, onChange) {
    var s = useState(initial);
    var controlled = value !== undefined;
    var cur = controlled ? value : s[0];
    var ref = useRef(cur); ref.current = cur;
    function set(v) { if (v === ref.current) return; ref.current = v; if (!controlled) s[1](v); if (onChange) onChange(v); }
    return [cur, set, ref];
  }
  function capture(e) { var el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch (_) {} if (el.focus) { try { el.focus({ preventScroll: true }); } catch (_) {} } return el; }
  function listen(el, mv, up) {
    function done(ev) { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', done); el.removeEventListener('pointercancel', done); if (up) up(ev); }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', done); el.addEventListener('pointercancel', done);
  }
  /* relative drag (vertical by default). shift = fine. reports speed in px/ms */
  function dragRelative(e, o) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    var el = capture(e), lx = e.clientX, ly = e.clientY, lt = now(), acc = o.start;
    if (o.onStart) o.onStart();
    listen(el, function (ev) {
      var d = o.axis === 'x' ? ev.clientX - lx : ly - ev.clientY, t = now();
      var speed = Math.abs(d) / Math.max(1, t - lt);
      lx = ev.clientX; ly = ev.clientY; lt = t;
      acc = clamp(acc + d / o.px * (o.max - o.min) * (ev.shiftKey ? 0.15 : 1), o.min, o.max);
      o.onMove(acc, speed);
    }, o.onEnd);
  }
  /* circular drag around the element centre. reports speed in deg/ms */
  function dragCircular(e, o) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    var el = capture(e), r = el.getBoundingClientRect(), cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
    function ang(ev) { return Math.atan2(ev.clientX - cxp, cyp - ev.clientY) * 180 / Math.PI; }
    var la = ang(e), lt = now(), acc = o.start;
    if (o.onStart) o.onStart();
    listen(el, function (ev) {
      var a = ang(ev), d = a - la; if (d > 180) d -= 360; if (d < -180) d += 360; la = a;
      var t = now(), speed = Math.abs(d) / Math.max(1, t - lt); lt = t;
      acc = clamp(acc + d / o.sweep * (o.max - o.min) * (ev.shiftKey ? 0.2 : 1), o.min, o.max);
      o.onMove(acc, speed / 2);
    }, o.onEnd);
  }
  /* press: down + up sounds like a real switch (contact, bottom-out, spring return) */
  function usePress(onDown, onUp) {
    var s = useState(false), downRef = useRef(false);
    function up() { if (!downRef.current) return; downRef.current = false; s[1](false); if (onUp) onUp(); }
    function down() { if (downRef.current) return; downRef.current = true; s[1](true); if (onDown) onDown(); }
    return {
      down: s[0],
      handlers: {
        onPointerDown: function (e) { if (e.button !== undefined && e.button !== 0) return; down(); },
        onPointerUp: up, onPointerLeave: up, onPointerCancel: up,
        onKeyDown: function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(); },
        onKeyUp: function (e) { if (e.key === ' ' || e.key === 'Enter') up(); }
      }
    };
  }
  var LED_VAR = { signal: 'signal', red: 'led-red', amber: 'led-amber', green: 'led-green', blue: 'led-blue', white: 'led-white', cobalt: 'cobalt' };

  /* ==================================================================
     SURFACES
     ================================================================== */
  function Screw(p) { return h('span', { className: 'sy-screw sy-screw--' + p.pos, style: { '--r': p.r + 'deg' }, 'aria-hidden': true }); }
  function Panel(p) {
    var variant = p.variant || 'chassis';
    var screws = def(p.screws, variant === 'module');
    var style = Object.assign({}, p.style);
    if (p.padding !== undefined) style.padding = typeof p.padding === 'number' ? p.padding + 'px' : p.padding;
    if (p.width !== undefined) style.width = typeof p.width === 'number' ? p.width + 'px' : p.width;
    return h('div', { className: cx('sy-panel', 'sy-panel--' + variant, p.className), style: style, role: p.title ? 'group' : undefined, 'aria-label': p.title },
      screws ? [h(Screw, { key: 1, pos: 'tl', r: 28 }), h(Screw, { key: 2, pos: 'tr', r: -16 }), h(Screw, { key: 3, pos: 'bl', r: 64 }), h(Screw, { key: 4, pos: 'br', r: 8 })] : null,
      p.title || p.index ? h('div', { className: 'sy-panel__head' },
        h('span', { className: 'sy-legend sy-legend--ink' }, p.title || ''),
        p.index ? h('span', { className: 'sy-panel__index' }, p.index) : null) : null,
      p.children);
  }
  function Legend(p) {
    var tone = p.tone || 'muted';
    return h('span', { className: cx('sy-legend', p.size === 'sm' && 'sy-legend--sm', tone !== 'muted' && 'sy-legend--' + tone, p.className), style: p.style },
      p.mark ? h('span', { className: 'sy-legend__mark sy-legend__mark--' + p.mark, 'aria-hidden': true }) : null,
      p.children);
  }

  /* glyphs: 16-unit grid, 1.5 stroke, round caps. ['p', d] stroke path · ['f', d] filled path · ['c', cx, cy, r] ring · ['d', cx, cy, r] dot */
  var GLYPHS = {
    sine: [['p', 'M1.5 8C3.4 2.2 5.6 2.2 8 8S12.6 13.8 14.5 8']],
    triangle: [['p', 'M1.5 9.5L4.8 3.5L11.2 12.5L14.5 6.5']],
    saw: [['p', 'M1.5 12L8 4V12L14.5 4']],
    square: [['p', 'M1.5 12V4H8V12H14.5V4']],
    pulse: [['p', 'M1 12H4V4H6.5V12H11V4H13.5V12H15']],
    wave: [['p', 'M1.5 9.5C3.8 9.5 4 5.5 6.3 5.5S8.7 10.5 11 10.5S13.4 7 14.5 7']],
    envelope: [['p', 'M1.5 12.5L4.5 3.5L7.5 7.5H11L14.5 12.5']],
    bars: [['p', 'M3 13V8M6.3 13V3M9.7 13V6M13 13V9.5']],
    level: [['p', 'M3 13V11.5M6.3 13V9M9.7 13V6M13 13V3']],
    dot: [['d', 8, 8, 3.6]],
    ring: [['c', 8, 8, 4.2]],
    grid: [['d', 4, 4, 1.15], ['d', 8, 4, 1.15], ['d', 12, 4, 1.15], ['d', 4, 8, 1.15], ['d', 8, 8, 1.15], ['d', 12, 8, 1.15], ['d', 4, 12, 1.15], ['d', 8, 12, 1.15], ['d', 12, 12, 1.15]],
    dash: [['p', 'M3 8H13']],
    plus: [['p', 'M8 3V13M3 8H13']],
    minus: [['p', 'M3 8H13']],
    play: [['f', 'M5 3.2L12.8 8L5 12.8Z']],
    stop: [['f', 'M4.2 4.2H11.8V11.8H4.2Z']],
    record: [['d', 8, 8, 4.6]],
    mic: [['p', 'M8 1.8A2.6 2.6 0 0 1 10.6 4.4V8A2.6 2.6 0 0 1 5.4 8V4.4A2.6 2.6 0 0 1 8 1.8Z'], ['p', 'M3.2 7.5A4.8 4.8 0 0 0 12.8 7.5M8 12.4V14.5']],
    'mic-off': [['p', 'M8 1.8A2.6 2.6 0 0 1 10.6 4.4V8A2.6 2.6 0 0 1 5.4 8V4.4A2.6 2.6 0 0 1 8 1.8Z'], ['p', 'M3.2 7.5A4.8 4.8 0 0 0 12.8 7.5M8 12.4V14.5M2 2L14 14']],
    headphones: [['p', 'M2.5 11V8A5.5 5.5 0 0 1 13.5 8V11'], ['f', 'M2 9.5H4.6V14H2Z'], ['f', 'M11.4 9.5H14V14H11.4Z']],
    speaker: [['p', 'M2.5 6H5L8.5 3V13L5 10H2.5Z'], ['p', 'M11 5.5A3.5 3.5 0 0 1 11 10.5']],
    power: [['p', 'M8 1.8V7.5M4.6 4.3A5 5 0 1 0 11.4 4.3']],
    sync: [['p', 'M13 8A5 5 0 0 1 4 11M3 8A5 5 0 0 1 12 5M12 2.5V5H9.5M4 13.5V11H6.5']],
    midi: [['c', 8, 8, 6], ['d', 4.6, 8, .9], ['d', 11.4, 8, .9], ['d', 5.6, 5.2, .9], ['d', 10.4, 5.2, .9], ['d', 8, 4.2, .9]],
    pattern: [['p', 'M2.5 2.5H6.5V6.5H2.5ZM9.5 2.5H13.5V6.5H9.5ZM2.5 9.5H6.5V13.5H2.5ZM9.5 9.5H13.5V13.5H9.5Z']],
    tempo: [['p', 'M4.2 14L6.8 2H9.2L11.8 14ZM8 10.5L12.5 4']],
    write: [['p', 'M3 13L3.8 10.2L10.8 3.2L12.8 5.2L5.8 12.2Z']],
    shift: [['p', 'M8 2.5L13.2 8H10.4V13H5.6V8H2.8Z']],
    sound: [['p', 'M2 8H4L5.5 4L7.5 12L9.5 2.5L11.5 13.5L13 8H14']],
    loop: [['p', 'M4 5.5H11.5A2.5 2.5 0 0 1 11.5 10.5H4.5M6 3.5L4 5.5L6 7.5']],
    out: [['c', 8, 8, 5.5], ['d', 8, 8, 2]]
  };
  function Glyph(p) {
    var g = GLYPHS[p.name] || GLYPHS.dot, size = p.size || 16, sw = def(p.stroke, 1.5);
    return h('svg', { className: cx('sy-glyph', p.className), width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', role: p.title ? 'img' : undefined, 'aria-label': p.title, 'aria-hidden': p.title ? undefined : true, style: p.style },
      g.map(function (el, i) {
        if (el[0] === 'p') return h('path', { key: i, d: el[1] });
        if (el[0] === 'f') return h('path', { key: i, d: el[1], fill: 'currentColor', stroke: 'none' });
        if (el[0] === 'c') return h('circle', { key: i, cx: el[1], cy: el[2], r: el[3] });
        return h('circle', { key: i, cx: el[1], cy: el[2], r: el[3], fill: 'currentColor', stroke: 'none' });
      }));
  }
  function Grille(p) {
    var cols = p.cols || 9, rows = p.rows || 7, pitch = p.pitch || 10, hole = p.hole || 2.4;
    var grille = h('div', { className: cx('sy-grille', p.round && 'sy-grille--round'), role: 'presentation',
      style: { width: cols * pitch + 'px', height: rows * pitch + 'px', '--gp': pitch + 'px', '--gh': hole + 'px' } });
    if (!p.label) return h('div', { className: p.className }, grille);
    return h('div', { className: cx('sy-ctl', p.className), style: { gap: '12px' } }, grille, h('span', { className: 'sy-legend sy-legend--ink' }, p.label));
  }

  /* ==================================================================
     INDICATORS
     ================================================================== */
  function Led(p) {
    var on = def(p.on, true), size = p.size || 10;
    var bezel = def(p.bezel, size >= 10 && !p.flat);
    var led = h('span', {
      className: cx('sy-led', 'sy-led--' + (p.color || 'signal'), bezel && 'sy-led--bezel', p.flat && 'sy-led--flat', p.flat && p.dark && 'sy-led--dark', on && 'is-on', on && p.blink && 'is-blink-' + p.blink, p.className),
      style: { '--ls': size + 'px' }, role: p.label ? undefined : 'presentation', 'aria-hidden': p.label ? undefined : true
    });
    if (!p.label) return led;
    return h('span', { className: cx('sy-led-row', p.labelPosition === 'below' && 'sy-led-row--below') }, led, h('span', { className: cx('sy-legend', p.size && p.size < 8 && 'sy-legend--sm', on && p.labelTone === 'ink' && 'sy-legend--ink') }, p.label));
  }

  function useBallistics(target, attack, release) {
    var s = useState(target), cur = useRef(target);
    useEffect(function () {
      var raf, last = now();
      function step() {
        var t = now(), dt = Math.min(64, t - last); last = t;
        var tau = target > cur.current ? attack : release;
        cur.current += (target - cur.current) * (1 - Math.exp(-dt / tau));
        if (Math.abs(target - cur.current) < 0.0015) { cur.current = target; s[1](target); return; }
        s[1](cur.current); raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
      return function () { cancelAnimationFrame(raf); };
    }, [target, attack, release]);
    return s[0];
  }
  function Meter(p) {
    var variant = p.variant || 'needle';
    var v = clamp(def(p.value, 0), 0, 1);
    var shown = useBallistics(v, variant === 'needle' ? def(p.attack, 120) : def(p.attack, 10), variant === 'needle' ? def(p.release, 300) : def(p.release, 140));
    var aria = { role: 'meter', 'aria-label': p.label || 'Level', 'aria-valuemin': 0, 'aria-valuemax': 1, 'aria-valuenow': Math.round(v * 100) / 100 };
    if (variant === 'bar') {
      var n = p.segments || 12, lit = Math.round(shown * n), warnAt = Math.round(n * def(p.warn, 0.75)), segs = [];
      for (var i = 0; i < n; i++) segs.push(h('span', { key: i, className: cx('sy-ladder__seg', i >= n - 1 ? 'sy-ladder__seg--peak' : i >= warnAt ? 'sy-ladder__seg--warn' : null, i < lit && 'is-on') }));
      return h('div', Object.assign({ className: cx('sy-meter-ctl', p.className) }, aria),
        h('div', { className: cx('sy-ladder', p.orientation === 'vertical' && 'sy-ladder--vertical') }, segs),
        p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
    }
    var W = def(p.width, 168), Hh = Math.round(W * 0.56), cxp = W / 2, cyp = Hh + 30, r = W * 0.62, S = 50, hotFrom = def(p.hot, 0.72);
    function pt(f, rr) { var a = (-S + 2 * S * f) * Math.PI / 180; return [cxp + rr * Math.sin(a), cyp - rr * Math.cos(a)]; }
    function arc(f0, f1, rr) { var a = pt(f0, rr), b = pt(f1, rr); return 'M ' + a[0] + ' ' + a[1] + ' A ' + rr + ' ' + rr + ' 0 0 1 ' + b[0] + ' ' + b[1]; }
    var scale = p.scale || [['-20', 0], ['-10', 0.25], ['-7', 0.38], ['-5', 0.48], ['-3', 0.6], ['0', 0.72], ['+3', 1]];
    var ticks = scale.map(function (s, i) {
      var hot = s[1] >= hotFrom, a = pt(s[1], r - 14), b = pt(s[1], r - 6), t = pt(s[1], r + 3);
      return h('g', { key: i },
        h('line', { className: cx('sy-vu__tick', hot && 'sy-vu__tick--hot'), x1: a[0], y1: a[1], x2: b[0], y2: b[1] }),
        h('text', { className: cx('sy-vu__num', hot && 'sy-vu__num--hot'), x: t[0], y: t[1], textAnchor: 'middle' }, s[0]));
    });
    var tip = pt(shown, r - 4), base = pt(shown, 36);
    return h('div', Object.assign({ className: cx('sy-meter-ctl', p.className) }, aria),
      h('div', { className: 'sy-vu' },
        h('svg', { width: W, height: Hh, viewBox: '0 0 ' + W + ' ' + Hh },
          h('rect', { className: 'sy-vu__face', x: 0, y: 0, width: W, height: Hh, rx: 2 }),
          h('path', { className: 'sy-vu__arc', d: arc(0, hotFrom, r - 14) }),
          h('path', { className: 'sy-vu__arc sy-vu__arc--hot', d: arc(hotFrom, 1, r - 12) }),
          ticks,
          h('text', { className: 'sy-vu__unit', x: cxp, y: Hh - 14, textAnchor: 'middle' }, p.unit || 'VU'),
          h('line', { className: 'sy-vu__needle', x1: base[0], y1: base[1], x2: tip[0], y2: tip[1] }),
          h('rect', { className: 'sy-vu__hub', x: cxp - 18, y: Hh - 7, width: 36, height: 7 }))),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  /* 5x7 dot-matrix font */
  var FONT_SRC = {
    'A': '01110.10001.10001.10001.11111.10001.10001', 'B': '11110.10001.10001.11110.10001.10001.11110',
    'C': '01110.10001.10000.10000.10000.10001.01110', 'D': '11100.10010.10001.10001.10001.10010.11100',
    'E': '11111.10000.10000.11110.10000.10000.11111', 'F': '11111.10000.10000.11110.10000.10000.10000',
    'G': '01110.10001.10000.10111.10001.10001.01111', 'H': '10001.10001.10001.11111.10001.10001.10001',
    'I': '01110.00100.00100.00100.00100.00100.01110', 'J': '00111.00010.00010.00010.00010.10010.01100',
    'K': '10001.10010.10100.11000.10100.10010.10001', 'L': '10000.10000.10000.10000.10000.10000.11111',
    'M': '10001.11011.10101.10101.10001.10001.10001', 'N': '10001.10001.11001.10101.10011.10001.10001',
    'O': '01110.10001.10001.10001.10001.10001.01110', 'P': '11110.10001.10001.11110.10000.10000.10000',
    'Q': '01110.10001.10001.10001.10101.10010.01101', 'R': '11110.10001.10001.11110.10100.10010.10001',
    'S': '01111.10000.10000.01110.00001.00001.11110', 'T': '11111.00100.00100.00100.00100.00100.00100',
    'U': '10001.10001.10001.10001.10001.10001.01110', 'V': '10001.10001.10001.10001.10001.01010.00100',
    'W': '10001.10001.10001.10101.10101.10101.01010', 'X': '10001.10001.01010.00100.01010.10001.10001',
    'Y': '10001.10001.10001.01010.00100.00100.00100', 'Z': '11111.00001.00010.00100.01000.10000.11111',
    '0': '01110.10001.10011.10101.11001.10001.01110', '1': '00100.01100.00100.00100.00100.00100.01110',
    '2': '01110.10001.00001.00010.00100.01000.11111', '3': '11111.00010.00100.00010.00001.10001.01110',
    '4': '00010.00110.01010.10010.11111.00010.00010', '5': '11111.10000.11110.00001.00001.10001.01110',
    '6': '00110.01000.10000.11110.10001.10001.01110', '7': '11111.00001.00010.00100.01000.01000.01000',
    '8': '01110.10001.10001.01110.10001.10001.01110', '9': '01110.10001.10001.01111.00001.00010.01100',
    ' ': '00000.00000.00000.00000.00000.00000.00000', '.': '00000.00000.00000.00000.00000.01100.01100',
    ',': '00000.00000.00000.00000.01100.00100.01000', ':': '00000.01100.01100.00000.01100.01100.00000',
    '-': '00000.00000.00000.11111.00000.00000.00000', '+': '00000.00100.00100.11111.00100.00100.00000',
    '/': '00000.00001.00010.00100.01000.10000.00000', '%': '11000.11001.00010.00100.01000.10011.00011',
    '#': '01010.01010.11111.01010.11111.01010.01010', '>': '01000.00100.00010.00001.00010.00100.01000',
    '<': '00010.00100.01000.10000.01000.00100.00010', '!': '00100.00100.00100.00100.00100.00000.00100',
    '?': '01110.10001.00001.00010.00100.00000.00100', '_': '00000.00000.00000.00000.00000.00000.11111',
    '=': '00000.00000.11111.00000.11111.00000.00000', '*': '00000.00100.10101.01110.10101.00100.00000',
    "'": '01100.00100.01000.00000.00000.00000.00000', '(': '00010.00100.01000.01000.01000.00100.00010',
    ')': '01000.00100.00010.00010.00010.00100.01000', '[': '01110.01000.01000.01000.01000.01000.01110',
    ']': '01110.00010.00010.00010.00010.00010.01110', '|': '00100.00100.00100.00100.00100.00100.00100',
    '▶': '10000.11000.11100.11110.11100.11000.10000', '■': '00000.11111.11111.11111.11111.11111.00000',
    '●': '00000.01110.11111.11111.11111.01110.00000', '♪': '00100.00110.00101.00100.01100.11100.11000',
    '█': '11111.11111.11111.11111.11111.11111.11111', '↑': '00100.01110.10101.00100.00100.00100.00100',
    '↓': '00100.00100.00100.00100.10101.01110.00100'
  };
  var FONT = {};
  Object.keys(FONT_SRC).forEach(function (k) { FONT[k] = FONT_SRC[k].split('.').map(function (r) { return r.split('').map(function (c) { return c === '1'; }); }); });
  function glyph5x7(ch) { return FONT[ch] || FONT[ch.toUpperCase()] || FONT['?']; }
  function lineColumns(str) {
    var cols = [];
    Array.from(String(str)).forEach(function (ch, i) {
      var g = glyph5x7(ch);
      if (i > 0) cols.push([0, 0, 0, 0, 0, 0, 0]);
      for (var x = 0; x < 5; x++) { var col = []; for (var y = 0; y < 7; y++) col.push(g[y][x] ? 1 : 0); cols.push(col); }
    });
    return cols;
  }
  function readVar(el, name, fallback) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; }
  function DotMatrix(p) {
    var ref = useRef(null), box = useRef(null);
    var lines = p.lines !== undefined ? (Array.isArray(p.lines) ? p.lines : [p.lines]) : (p.text !== undefined ? String(p.text).split('\n') : ['']);
    var cols = p.cols || 16, rows = p.rows || Math.max(1, lines.length), pitch = p.pitch || 4, pad = 1;
    var dotW = cols * 6 - 1 + pad * 2, dotH = rows * 8 - 1 + pad * 2;
    var key = JSON.stringify([lines, cols, rows, pitch, p.align, p.graph, p.scroll, p.invert, p.cursor, p.speed]);
    useEffect(function () {
      var cv = ref.current; if (!cv) return;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(dotW * pitch * dpr); cv.height = Math.round(dotH * pitch * dpr);
      cv.style.width = dotW * pitch + 'px'; cv.style.height = dotH * pitch + 'px';
      var ctx = cv.getContext('2d'), colsData = lines.map(lineColumns), raf = null, start = now(), alive = true;
      function draw() {
        var t = now();
        var on = readVar(box.current || cv, '--lcd-on', '#1e241a'), off = readVar(box.current || cv, '--lcd-off', '#b2bba1');
        var grid = []; for (var y = 0; y < dotH; y++) grid.push(new Uint8Array(dotW));
        var anim = false;
        if (p.graph) {
          var g = p.graph, nb = dotW - pad * 2;
          for (var x = 0; x < nb; x++) {
            var val = clamp(g[Math.floor(x / nb * g.length)] || 0, 0, 1), hg = Math.round(val * (dotH - pad * 2));
            for (var yy = 0; yy < hg; yy++) grid[dotH - pad - 1 - yy][pad + x] = 1;
          }
        } else {
          colsData.forEach(function (lc, li) {
            if (li >= rows) return;
            var top = pad + li * 8, avail = cols * 6 - 1, offset = 0, data = lc;
            if (p.scroll && lc.length > avail) {
              anim = true;
              var blank = [0, 0, 0, 0, 0, 0, 0], loop = lc.concat([blank, blank, blank, blank, blank, blank]);
              var o = Math.floor((t - start) / 1000 * (p.speed || 14)) % loop.length;
              data = []; for (var k = 0; k < avail; k++) data.push(loop[(o + k) % loop.length]);
            } else {
              var al = p.align || 'left';
              if (al === 'center') offset = Math.floor((avail - lc.length) / 2); else if (al === 'right') offset = avail - lc.length;
              offset = Math.max(0, offset);
            }
            data.forEach(function (col, c2) {
              var X = pad + offset + c2; if (X >= dotW - pad) return;
              for (var y = 0; y < 7; y++) if (col[y]) grid[top + y][X] = 1;
            });
            if (p.cursor !== undefined && p.cursor !== null && p.cursor >= 0 && li === (p.cursorLine || 0)) {
              anim = true;
              if (Math.floor((t - start) / 500) % 2 === 0) { var c0 = pad + p.cursor * 6, cy = Math.min(dotH - 1, top + 7); for (var cc = 0; cc < 5; cc++) if (c0 + cc < dotW - pad) grid[cy][c0 + cc] = 1; }
            }
          });
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, dotW * pitch, dotH * pitch);
        var rad = pitch * 0.4;
        for (var y2 = 0; y2 < dotH; y2++) for (var x2 = 0; x2 < dotW; x2++) {
          var lit = grid[y2][x2]; if (p.invert) lit = !lit;
          ctx.fillStyle = lit ? on : off;
          ctx.beginPath(); ctx.arc(x2 * pitch + pitch / 2, y2 * pitch + pitch / 2, rad, 0, Math.PI * 2); ctx.fill();
        }
        if (anim && alive) raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
      var mo = new MutationObserver(function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      var onMq = function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
      if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
      return function () { alive = false; cancelAnimationFrame(raf); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq); };
    }, [key]);
    return h('div', { className: cx('sy-dm', p.className), ref: box, role: 'img', 'aria-label': p.ariaLabel || lines.join(' ') }, h('canvas', { ref: ref }));
  }

  /* ==================================================================
     KEYS & PADS
     ================================================================== */
  function Key(p) {
    var latch = !!p.latch;
    var st = useControlled(p.pressed, !!p.defaultPressed, p.onChange);
    var pr = usePress(function () { feel(latch ? 'latch' : 'press'); }, function () { if (!latch) feel('release'); });
    var isDown = pr.down || (latch && st[0]);
    var lit = p.lit !== undefined ? p.lit : (latch && st[0] && p.ledColor !== undefined && p.led === undefined);
    var btn = h('button', Object.assign({
      type: 'button', disabled: p.disabled,
      className: cx('sy-key', p.size && p.size !== 'md' && 'sy-key--' + p.size, isDown && 'is-down', p.className),
      'aria-pressed': latch ? st[0] : undefined, 'aria-label': p.ariaLabel || p.label || p.legend || p.glyph,
      onClick: function () { if (latch) st[1](!st[2].current); if (p.onPress) p.onPress(); }
    }, pr.handlers),
      h('span', { className: 'sy-key__dish' }),
      p.number !== undefined ? h('span', { className: 'sy-key__num' }, p.number) : null,
      p.glyph ? h('span', { className: 'sy-key__glyph' }, h(Glyph, { name: p.glyph })) : null,
      p.legend ? h('span', { className: 'sy-key__legend' }, p.legend) : null,
      lit ? h(Led, { className: 'sy-key__led', on: true, flat: true, size: 9, color: p.ledColor || 'signal' }) : null);
    if (!p.label && p.led === undefined) return btn;
    return h('span', { className: 'sy-ctl' },
      p.led !== undefined ? h(Led, { on: !!p.led, color: p.ledColor || 'signal', size: 6, flat: true, blink: p.ledBlink }) : null,
      btn,
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function KeyStrip(p) {
    var items = (p.items || []).map(function (it) { return typeof it === 'string' ? { label: it } : it; });
    var mode = p.mode || 'radio';
    var initial = mode === 'toggle' ? items.map(function () { return false; }) : (mode === 'radio' ? 0 : -1);
    var st = useControlled(p.value, def(p.defaultValue, initial), p.onChange);
    var held = useState(-1);
    var size = p.size || 'md', px = size === 'sm' ? 40 : size === 'lg' ? 72 : 56;
    function isOn(i) { return mode === 'radio' ? st[0] === i : mode === 'toggle' ? !!st[0][i] : false; }
    return h('div', { className: cx('sy-ctl', p.className), style: { alignItems: 'flex-start' } },
      h('div', { className: 'sy-strip', role: mode === 'radio' ? 'radiogroup' : 'group', 'aria-label': p.label },
        h('div', { className: 'sy-strip__row' }, items.map(function (it, i) {
          var down = held[0] === i || isOn(i);
          return h('button', {
            key: i, type: 'button', role: mode === 'radio' ? 'radio' : undefined,
            'aria-checked': mode === 'radio' ? isOn(i) : undefined, 'aria-pressed': mode === 'toggle' ? isOn(i) : undefined,
            'aria-label': it.label || it.glyph || ('Key ' + (i + 1)),
            className: cx('sy-key', size !== 'md' && 'sy-key--' + size, down && 'is-down'),
            onPointerDown: function (e) { if (e.button) return; held[1](i); feel(mode === 'momentary' ? 'press' : (mode === 'radio' && isOn(i) ? 'press' : 'latch')); },
            onPointerUp: function () { if (held[0] === i) { held[1](-1); if (mode === 'momentary') feel('release'); } },
            onPointerLeave: function () { if (held[0] === i) held[1](-1); },
            onClick: function () {
              if (mode === 'radio') st[1](i);
              else if (mode === 'toggle') { var n = st[2].current.slice(); n[i] = !n[i]; st[1](n); }
              if (p.onPress) p.onPress(i);
            },
            onKeyDown: function (e) {
              if (mode !== 'radio') return;
              var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (d) { e.preventDefault(); var n = (st[0] + d + items.length) % items.length; st[1](n); feel('latch'); var sib = e.currentTarget.parentNode.children[n]; if (sib) sib.focus(); }
            }
          },
            h('span', { className: 'sy-key__dish' }),
            it.glyph ? h('span', { className: 'sy-key__glyph' }, h(Glyph, { name: it.glyph })) : null,
            it.legend ? h('span', { className: 'sy-key__legend' }, it.legend) : null,
            (isOn(i) && p.indicator !== false && !it.glyph) || it.lit ? h(Led, { className: 'sy-key__led', on: true, flat: true, size: 10, color: p.ledColor || 'signal' }) : null);
        }))),
      p.showLabels !== false && items.some(function (it) { return it.label; }) ? h('div', { className: 'sy-strip__labels' },
        items.map(function (it, i) { return h('span', { key: i, className: cx('sy-legend', isOn(i) && 'sy-legend--ink'), style: { width: px + 'px' } }, it.label || ''); })) : null);
  }

  function PushButton(p) {
    var latch = !!p.latch;
    var st = useControlled(p.pressed, !!p.defaultPressed, p.onChange);
    var pr = usePress(function () { feel(latch ? 'latch' : 'press'); }, function () { if (!latch) feel('release'); });
    var lit = p.lit !== undefined ? p.lit : (latch && st[0]);
    var isDown = pr.down || (latch && st[0]);
    var btn = h('button', Object.assign({
      type: 'button', disabled: p.disabled,
      className: cx('sy-push', 'sy-push--' + (p.color || 'ivory'), p.size && p.size !== 'md' && 'sy-push--' + p.size, isDown && 'is-down', lit && 'is-lit', p.className),
      'aria-pressed': latch ? st[0] : undefined, 'aria-label': p.ariaLabel || p.label || p.legend,
      onClick: function () { if (latch) st[1](!st[2].current); if (p.onPress) p.onPress(); }
    }, pr.handlers),
      h('span', { className: 'sy-push__cap' }),
      p.legend ? h('span', { className: 'sy-push__legend' }, p.legend) : null);
    if (!p.label && p.led === undefined) return btn;
    return h('span', { className: 'sy-ctl' },
      p.led !== undefined ? h(Led, { on: p.led === 'auto' ? lit || isDown : !!p.led, color: p.ledColor || 'signal', size: 6, flat: true }) : null,
      btn,
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Segmented(p) {
    var items = (p.items || []).map(function (it) { return typeof it === 'string' ? { label: it } : it; });
    var variant = p.variant || 'keys';
    var st = useControlled(p.value, def(p.defaultValue, 0), p.onChange);
    function set(i) { i = (i + items.length) % items.length; if (i !== st[2].current) { feel(variant === 'keys' ? 'latch' : 'detent'); st[1](i); } }
    var style = {}; if (p.itemWidth) style['--sw'] = p.itemWidth + 'px'; if (p.itemHeight) style['--sh'] = p.itemHeight + 'px';
    return h('div', { className: cx('sy-ctl', p.className) },
      h('div', { className: cx('sy-seg', 'sy-seg--' + variant), role: 'radiogroup', 'aria-label': p.label, style: style },
        items.map(function (it, i) {
          var on = st[0] === i;
          return h('button', { key: i, type: 'button', role: 'radio', 'aria-checked': on, 'aria-label': it.label || it.glyph, tabIndex: on ? 0 : -1,
            className: cx('sy-seg__item', on && 'is-active'),
            onPointerDown: function (e) { if (e.button) return; set(i); },
            onClick: function (e) { if (e.detail === 0) set(i); },
            onKeyDown: function (e) {
              var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!d) return; e.preventDefault(); var n = (st[2].current + d + items.length) % items.length; set(n);
              var sib = e.currentTarget.parentNode.children[n]; if (sib) sib.focus();
            } },
            it.glyph ? h(Glyph, { name: it.glyph, size: it.size || 18 }) : h('span', { className: 'sy-seg__label' }, it.label));
        })),
      p.label && p.showLabel !== false ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Pad(p) {
    var down = useState(false), flash = useState(false), timer = useRef(null);
    function hit(e) {
      var vel = 0.85;
      if (e && e.pointerType && e.pointerType !== 'mouse' && e.pressure && e.pressure !== 0.5) vel = clamp(0.35 + e.pressure * 0.8, 0.3, 1);
      down[1](true); flash[1](true);
      clearTimeout(timer.current); timer.current = setTimeout(function () { flash[1](false); }, 16);
      feel('thump', vel);
      if (p.onHit) p.onHit(vel);
    }
    useEffect(function () { return function () { clearTimeout(timer.current); }; }, []);
    var size = p.size ? { '--ps': p.size + 'px' } : undefined;
    return h('button', { type: 'button', 'aria-label': p.ariaLabel, 'aria-pressed': p.toggle ? !!p.lit : undefined,
      className: cx('sy-pad', p.color && 'sy-pad--' + p.color, p.lit && 'is-lit', p.playing && 'is-play', down[0] && 'is-down', flash[0] && 'is-flash'),
      style: size,
      onPointerDown: function (e) { if (e.button) return; hit(e); },
      onPointerUp: function () { down[1](false); }, onPointerLeave: function () { down[1](false); }, onPointerCancel: function () { down[1](false); },
      onKeyDown: function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hit(null); } },
      onKeyUp: function (e) { if (e.key === ' ' || e.key === 'Enter') down[1](false); } });
  }
  function PadGrid(p) {
    var n = p.count || 16, cols = p.columns || 4, mode = p.mode || 'trigger';
    var init = []; for (var i = 0; i < n; i++) init.push(false);
    var st = useControlled(p.lit, p.defaultLit || init, p.onChange);
    var flashLit = useState(-1);
    var colors = p.colors || [];
    var cells = [];
    for (var j = 0; j < n; j++) (function (j) {
      var lit = mode === 'toggle' ? !!st[0][j] : (!!st[0][j] || flashLit[0] === j);
      cells.push(h(Pad, { key: j, ariaLabel: (p.labels && p.labels[j]) || ('Pad ' + (j + 1)), size: p.size, toggle: mode === 'toggle',
        color: colors[j] || p.color || 'signal', lit: lit, playing: p.playhead === j,
        onHit: function (vel) {
          if (mode === 'toggle') { var a = st[2].current.slice(); a[j] = !a[j]; st[1](a); }
          else { flashLit[1](j); setTimeout(function () { flashLit[1](function (x) { return x === j ? -1 : x; }); }, 180); }
          if (p.onHit) p.onHit(j, vel);
        } }));
    })(j);
    return h('div', { className: cx('sy-ctl', p.className) },
      h('div', { className: 'sy-pads', role: 'group', 'aria-label': p.label || 'Pads', style: { gridTemplateColumns: 'repeat(' + cols + ', auto)' } }, cells),
      p.label && p.showLabel ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function StepGrid(p) {
    var n = p.count || 16;
    var init = []; for (var i = 0; i < n; i++) init.push(false);
    var st = useControlled(p.steps, p.defaultSteps || init, p.onChange);
    var cols = p.columns || 4, cells = [];
    for (var j = 0; j < n; j++) (function (j) {
      var on = !!st[0][j], play = p.playhead === j;
      cells.push(h('div', { key: j, className: 'sy-step' },
        h(Led, { on: on || play, color: play ? 'signal' : (p.ledColor || 'red'), size: 6, flat: true }),
        h(Key, { size: p.size || 'sm', number: p.numbers === false ? undefined : (p.labels ? p.labels[j] : j + 1),
          ariaLabel: 'Step ' + (j + 1), latch: true, pressed: on,
          onChange: function (v) { var a = st[2].current.slice(); a[j] = v; st[1](a); } })));
    })(j);
    return h('div', { className: cx('sy-steps', p.className), style: { gridTemplateColumns: 'repeat(' + cols + ', auto)' }, role: 'group', 'aria-label': p.label || 'Steps' }, cells);
  }

  /* ==================================================================
     ROTARY
     ================================================================== */
  var KNOB_PX = { xs: 40, sm: 48, md: 72, lg: 116, xl: 150 };
  var KNOB_PTR = { ivory: 'dot', knurl: 'dot', alu: 'line', black: 'signal', smooth: 'line' };
  function Knob(p) {
    var min = def(p.min, 0), max = def(p.max, 1), range = (max - min) || 1;
    var step = p.detents ? range / (p.detents - 1) : p.step;
    var st = useControlled(p.value, def(p.defaultValue, min), p.onChange);
    var bucket = useRef(null), drag = useState(false);
    var size = typeof p.size === 'number' ? p.size : KNOB_PX[p.size || 'md'];
    var sweep = def(p.sweep, 300), variant = p.variant || 'ivory', ptr = p.pointer || KNOB_PTR[variant] || 'dot';
    var mode = p.drag || 'vertical';
    function bucketOf(v) { return step ? Math.round((v - min) / step) : Math.round((v - min) / range * 48); }
    function change(raw, speed) {
      var v = clamp(raw, min, max);
      if (p.center !== undefined && Math.abs(v - p.center) < range * def(p.centerSnap, 0.03)) v = p.center;
      v = quant(v, min, step);
      var prev = st[2].current;
      if (v === prev) return;
      var b = bucketOf(v);
      if (p.center !== undefined && (v === p.center || (prev - p.center) * (v - p.center) < 0)) feel('notch');
      else if (b !== bucket.current) feel(step ? 'detent' : 'tick', (speed || 0) > 1.2 ? 0.55 : 1);
      bucket.current = b;
      st[1](v);
    }
    var frac = (st[0] - min) / range, angle = -sweep / 2 + sweep * frac;
    var ticks = null;
    if (p.ticks) {
      var t = [], W = size + 40, cs = W / 2, r1 = size / 2 + 6, r2 = size / 2 + 11;
      for (var i = 0; i < p.ticks; i++) {
        var a = (-sweep / 2 + sweep * i / (p.ticks - 1)) * Math.PI / 180;
        var major = i === 0 || i === p.ticks - 1 || (p.ticks % 2 === 1 && i === (p.ticks - 1) / 2);
        var rr = major ? r2 + 3 : r2;
        t.push(h('line', { key: i, className: major ? 'is-major' : undefined, x1: cs + r1 * Math.sin(a), y1: cs - r1 * Math.cos(a), x2: cs + rr * Math.sin(a), y2: cs - rr * Math.cos(a) }));
      }
      ticks = h('svg', { className: 'sy-knob__scale', viewBox: '0 0 ' + W + ' ' + W, 'aria-hidden': true }, t);
    }
    var fine = step || range / 100;
    function onKey(e) {
      var k = e.key, v = st[2].current, big = range / 10;
      if (k === 'ArrowUp' || k === 'ArrowRight') v += fine; else if (k === 'ArrowDown' || k === 'ArrowLeft') v -= fine;
      else if (k === 'PageUp') v += big; else if (k === 'PageDown') v -= big;
      else if (k === 'Home') v = min; else if (k === 'End') v = max; else return;
      e.preventDefault(); bucket.current = bucketOf(st[2].current); change(v, 0);
    }
    var shown = p.format ? p.format(st[0]) : (Math.round(st[0] * 100) / 100).toString();
    var style = { '--sz': size + 'px' };
    if (size <= 56) { style['--kn-a'] = '2.8deg'; style['--kn-b'] = '6deg'; }
    var wrapStyle = {}; if (p.ticks) wrapStyle.margin = '14px'; if (p.marker) wrapStyle.marginLeft = '30px';
    return h('div', { className: cx('sy-ctl sy-knob', 'sy-knob--' + variant, mode === 'circular' && 'sy-knob--circular', drag[0] && 'is-dragging', step && 'is-detented', p.className), style: style },
      p.led !== undefined ? h(Led, { className: 'sy-knob__led', on: !!p.led, color: p.ledColor || 'signal', size: 6, flat: true, dark: !p.led }) : null,
      h('div', { className: 'sy-knob__wrap', style: wrapStyle },
        ticks,
        p.marker ? h('span', { className: 'sy-knob__marker', 'aria-hidden': true }) : null,
        h('div', {
          className: 'sy-knob__body', tabIndex: p.disabled ? -1 : 0, role: 'slider',
          'aria-label': p.label || 'Knob', 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': st[0], 'aria-valuetext': shown,
          onPointerDown: function (e) {
            if (p.disabled) return;
            bucket.current = bucketOf(st[2].current);
            var o = { start: st[2].current, min: min, max: max, px: def(p.dragPx, 180), sweep: sweep, onMove: change, onStart: function () { drag[1](true); }, onEnd: function () { drag[1](false); } };
            if (mode === 'circular') dragCircular(e, o); else dragRelative(e, o);
          },
          onWheel: function (e) { if (p.disabled || !p.wheel) return; bucket.current = bucketOf(st[2].current); change(st[2].current - Math.sign(e.deltaY) * fine, 0); },
          onDoubleClick: function () { if (p.defaultValue !== undefined) { bucket.current = null; change(p.defaultValue, 0); } },
          onKeyDown: onKey
        },
          h('div', { className: 'sy-knob__skirt' }),
          h('div', { className: 'sy-knob__shade' }),
          h('div', { className: 'sy-knob__face' },
            h('div', { className: 'sy-knob__rot', style: { transform: 'rotate(' + angle + 'deg)' } }, h('span', { className: 'sy-knob__ptr sy-knob__ptr--' + ptr }))))),
      p.showValue ? h('span', { className: 'sy-readout' }, shown) : null,
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Dial(p) {
    var min = def(p.min, 0), max = def(p.max, 100), range = (max - min) || 1;
    var st = useControlled(p.value, def(p.defaultValue, min + range * 0.25), p.onChange);
    var size = p.size || 140, sweep = def(p.sweep, 300), start = -sweep / 2;
    var majors = p.labels || [min, min + range / 4, min + range / 2, min + range * 3 / 4, max];
    var minor = def(p.minorTicks, 60);
    var W = size + 84, c = W / 2, kr = size / 2, ra = kr + 10, r1 = kr + 17, r2 = kr + 22, rl = kr + 34;
    var drag = useState(false), last = useRef(null);
    function ang(v) { return start + sweep * (v - min) / range; }
    function pol(a, r) { a = a * Math.PI / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; }
    function change(raw, speed) {
      var v = clamp(raw, min, max); if (p.step) v = quant(v, min, p.step);
      var prev = st[2].current; if (v === prev) return;
      var mi = Math.floor((v - min) / range * minor), pmi = Math.floor((prev - min) / range * minor);
      var crossedMajor = majors.some(function (m) { return (prev - m) * (v - m) <= 0 && v !== prev; });
      if (crossedMajor) feel('detent'); else if (mi !== pmi) feel('tick', (speed || 0) > 1.2 ? 0.55 : 1);
      st[1](v);
    }
    var ticks = [];
    for (var i = 0; i <= minor; i++) {
      var a = start + sweep * i / minor, pA = pol(a, r1), pB = pol(a, r2);
      ticks.push(h('line', { key: 't' + i, className: 'sy-dial__tick sy-dial__tick--minor', x1: pA[0], y1: pA[1], x2: pB[0], y2: pB[1] }));
    }
    var labels = majors.map(function (m, i) {
      var a = ang(m), pA = pol(a, r1 - 1), pB = pol(a, r2 + 6), pl = pol(a, rl);
      return h('g', { key: 'm' + i },
        h('line', { className: 'sy-dial__tick', x1: pA[0], y1: pA[1], x2: pB[0], y2: pB[1], strokeWidth: 1.4 }),
        h('text', { className: 'sy-dial__num', x: pl[0], y: pl[1] + 4, textAnchor: 'middle' }, p.format ? p.format(m) : m));
    });
    var va = ang(st[0]), s0 = pol(start, ra), s1 = pol(va, ra);
    var large = (va - start) > 180 ? 1 : 0;
    var arcD = 'M ' + s0[0] + ' ' + s0[1] + ' A ' + ra + ' ' + ra + ' 0 ' + large + ' 1 ' + s1[0] + ' ' + s1[1];
    var trackEnd = pol(start + sweep, ra), trackD = 'M ' + s0[0] + ' ' + s0[1] + ' A ' + ra + ' ' + ra + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + trackEnd[0] + ' ' + trackEnd[1];
    var fine = p.step || range / 100;
    return h('div', { className: cx('sy-ctl sy-dial', p.className) },
      h('div', { className: 'sy-dial__wrap', style: { width: W + 'px', height: W + 'px' } },
        h('svg', { className: 'sy-dial__scale', width: W, height: W, viewBox: '0 0 ' + W + ' ' + W, 'aria-hidden': true },
          h('path', { className: 'sy-dial__track', d: trackD }),
          ticks, labels,
          va > start + 0.5 ? h('path', { className: 'sy-dial__arc', d: arcD }) : null,
          h('g', { transform: 'rotate(' + va + ' ' + c + ' ' + c + ')' },
            h('rect', { className: 'sy-dial__nub', x: c - 5, y: c - ra - 9, width: 10, height: 20, rx: 2.5 }),
            h('rect', { className: 'sy-dial__nub-hl', x: c - 3.5, y: c - ra - 7.5, width: 2, height: 16, rx: 1 }))),
        h('div', { className: 'sy-dial__body', style: { left: c - kr + 'px', top: c - kr + 'px', width: size + 'px', height: size + 'px' },
          tabIndex: 0, role: 'slider', 'aria-label': p.label || 'Dial', 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': Math.round(st[0] * 100) / 100,
          onPointerDown: function (e) { dragCircular(e, { start: st[2].current, min: min, max: max, sweep: sweep, onMove: change, onStart: function () { drag[1](true); }, onEnd: function () { drag[1](false); } }); },
          onKeyDown: function (e) {
            var v = st[2].current;
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v += fine; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v -= fine;
            else if (e.key === 'PageUp') v += range / 10; else if (e.key === 'PageDown') v -= range / 10;
            else if (e.key === 'Home') v = min; else if (e.key === 'End') v = max; else return;
            e.preventDefault(); change(v, 0);
          } },
          h('div', { className: 'sy-dial__ring' }),
          h('div', { className: 'sy-dial__face', style: { transform: 'rotate(' + va + 'deg)' } }),
          h('div', { className: 'sy-dial__light' }))),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Selector(p) {
    var opts = (p.options || []).map(function (o) { return typeof o === 'string' ? { label: o } : o; });
    var n = Math.max(opts.length, 1), variant = p.variant || 'bar';
    var st = useControlled(p.value, def(p.defaultValue, 0), p.onChange);
    var spread = def(p.spread, variant === 'arrow' ? Math.min(108, (n - 1) * 18) : Math.min(270, (n - 1) * 40));
    function angleOf(i) { return n === 1 ? 0 : -spread / 2 + spread * i / (n - 1); }
    function set(i) { i = clamp(i, 0, n - 1); if (i !== st[2].current) { feel('clunk', 0.8); st[1](i); } }
    function onKey(e) {
      var d = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
      if (variant === 'arrow' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) d = -d;
      if (!d) return; e.preventDefault(); set(st[2].current + d);
    }
    function track(e, cxp, cyp, base) {
      e.preventDefault();
      var el = capture(e);
      function pick(ev) {
        var r = el.getBoundingClientRect(), x = ev.clientX - (r.left + cxp(r)), y = ev.clientY - (r.top + cyp(r));
        var a = Math.atan2(x, -y) * 180 / Math.PI + base, best = 0, bd = 1e9;
        for (var i = 0; i < n; i++) { var dd = Math.abs(angleOf(i) - a); if (dd < bd) { bd = dd; best = i; } }
        set(best);
      }
      listen(el, pick);
    }
    var aria = { role: 'slider', tabIndex: 0, 'aria-label': p.label || 'Selector', 'aria-valuemin': 0, 'aria-valuemax': n - 1, 'aria-valuenow': st[0], 'aria-valuetext': opts[st[0]] ? opts[st[0]].label : '', onKeyDown: onKey };
    if (variant === 'arrow') {
      var W = 240, H = 236, px = 70, py = H / 2, R1 = 104, R2 = 118;
      var marks = opts.map(function (o, i) {
        var a = angleOf(i) * Math.PI / 180, x1 = px + R1 * Math.cos(a), y1 = py + R1 * Math.sin(a), x2 = px + R2 * Math.cos(a), y2 = py + R2 * Math.sin(a);
        return h('g', { key: i, onClick: function () { set(i); } },
          h('polyline', { className: 'sy-sel__leader', points: x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' + (x2 + 12) + ',' + y2 }),
          h('text', { className: cx('sy-sel__num', i === st[0] && 'is-active'), x: x2 + 18, y: y2 + 4 }, o.label));
      });
      return h('div', { className: cx('sy-ctl sy-sel sy-sel--arrow', p.className) },
        h('svg', Object.assign({ width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'sy-sel__body', style: { borderRadius: 0, background: 'none', boxShadow: 'none', position: 'static' },
          onPointerDown: function (e) { track(e, function () { return px; }, function () { return py; }, -90); } }, aria),
          marks,
          h('g', { className: 'sy-sel__pointer', style: { transform: 'rotate(' + angleOf(st[0]) + 'deg)', transformOrigin: px + 'px ' + py + 'px' } },
            h('path', { d: 'M ' + (px - 46) + ' ' + (py - 18) + ' Q ' + (px - 60) + ' ' + py + ' ' + (px - 46) + ' ' + (py + 18) + ' L ' + (px + 34) + ' ' + (py + 18) + ' L ' + (px + 86) + ' ' + (py + 2.5) + ' Q ' + (px + 90) + ' ' + py + ' ' + (px + 86) + ' ' + (py - 2.5) + ' L ' + (px + 34) + ' ' + (py - 18) + ' Z' }),
            h('path', { className: 'sy-sel__pointer-sheen', d: 'M ' + (px - 46) + ' ' + (py - 15) + ' L ' + (px + 33) + ' ' + (py - 15) + ' L ' + (px + 80) + ' ' + (py - 1) }))),
        p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
    }
    var size = typeof p.size === 'number' ? p.size : KNOB_PX[p.size || 'md'];
    var c = size / 2, Rr = size / 2 + 18;
    return h('div', { className: cx('sy-ctl sy-sel', p.className), style: { '--sz': size + 'px' } },
      h('div', { className: 'sy-sel__wrap' },
        opts.map(function (o, i) {
          var a = angleOf(i) * Math.PI / 180;
          return h('span', { key: i, className: cx('sy-sel__label', o.tone === 'signal' && 'sy-sel__label--signal', i === st[0] && 'is-active'),
            style: { left: c + Rr * Math.sin(a) + 'px', top: c - Rr * Math.cos(a) + 'px' }, onClick: function () { set(i); } }, o.label);
        }),
        h('div', Object.assign({ className: 'sy-sel__body', onPointerDown: function (e) { track(e, function (r) { return r.width / 2; }, function (r) { return r.height / 2; }, 0); } }, aria),
          h('div', { className: 'sy-sel__face' }),
          h('div', { className: 'sy-sel__rot', style: { transform: 'rotate(' + angleOf(st[0]) + 'deg)' } },
            h('div', { className: 'sy-sel__bar' }, h('span', { className: 'sy-sel__tick' }))))),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Lever(p) {
    var opts = (p.options || ['10', '20', '30']).map(String), n = opts.length;
    var st = useControlled(p.value, def(p.defaultValue, 0), p.onChange);
    var W = 150, H = 170, P0 = [34, 150], P1 = [34, 34], P2 = [112, 18];
    function bez(t) { var u = 1 - t; return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]; }
    function tan(t) { return [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])]; }
    var ts = opts.map(function (_, i) { return n === 1 ? 0 : 0.02 + 0.93 * i / (n - 1); }), pts = ts.map(bez);
    function set(i) { i = clamp(i, 0, n - 1); if (i !== st[2].current) { feel('clunk', 0.9); st[1](i); } }
    var cur = pts[st[0]] || pts[0], tg = tan(ts[st[0]] || 0), ang = Math.atan2(tg[1], tg[0]) * 180 / Math.PI + 90;
    function onDown(e) {
      e.preventDefault();
      var el = capture(e);
      function pick(ev) {
        var r = el.getBoundingClientRect(), sx = W / r.width, x = (ev.clientX - r.left) * sx, y = (ev.clientY - r.top) * sx, best = 0, bd = 1e9;
        pts.forEach(function (q, i) { var d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (d < bd) { bd = d; best = i; } });
        set(best);
      }
      pick(e); listen(el, pick);
    }
    var d = 'M ' + P0.join(' ') + ' Q ' + P1.join(' ') + ' ' + P2.join(' ');
    return h('div', { className: cx('sy-ctl sy-lever', p.className) },
      h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H },
        h('path', { className: 'sy-lever__track', d: d }),
        h('path', { className: 'sy-lever__track-hl', d: d, transform: 'translate(-1.5 0)' }),
        pts.map(function (q, i) {
          var tq = tan(ts[i]), len = Math.hypot(tq[0], tq[1]), nx = -tq[1] / len, ny = tq[0] / len;
          return h('text', { key: i, className: cx('sy-lever__opt', i === st[0] && 'is-active'), x: q[0] + nx * 16 + 2, y: q[1] + ny * 16 + 4 }, opts[i]);
        }),
        h('g', { className: 'sy-lever__handle', style: { transform: 'translate(' + cur[0] + 'px,' + cur[1] + 'px) rotate(' + ang + 'deg)' } },
          h('rect', { x: -22, y: -7, width: 34, height: 14, rx: 2.5 }),
          h('rect', { className: 'sy-lever__handle-hl', x: -20, y: -5.5, width: 30, height: 2.5, rx: 1 })),
        h('rect', { className: 'sy-lever__hit', x: 0, y: 0, width: W, height: H, fill: 'transparent', tabIndex: 0, role: 'slider',
          'aria-label': p.label || 'Lever', 'aria-valuemin': 0, 'aria-valuemax': n - 1, 'aria-valuenow': st[0], 'aria-valuetext': opts[st[0]],
          onPointerDown: onDown,
          onKeyDown: function (e) { var dd = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0; if (!dd) return; e.preventDefault(); set(st[2].current + dd); } })),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  /* ==================================================================
     LINEAR
     ================================================================== */
  function Fader(p) {
    var min = def(p.min, 0), max = def(p.max, 10), range = (max - min) || 1;
    var st = useControlled(p.value, def(p.defaultValue, min), p.onChange);
    var len = def(p.length, 200), cap = p.cap || 'black';
    var bucket = useRef(null);
    function change(raw, speed) {
      var v = clamp(raw, min, max);
      if (p.center !== undefined && Math.abs(v - p.center) < range * def(p.centerSnap, 0.03)) v = p.center;
      v = quant(v, min, p.step);
      var prev = st[2].current; if (v === prev) return;
      var b = p.step ? Math.round((v - min) / p.step) : Math.round((v - min) / range * 24);
      if (p.center !== undefined && (v === p.center || (prev - p.center) * (v - p.center) < 0)) feel('notch');
      else if (p.step && b !== bucket.current) feel('detent', 0.8);
      else if (!p.step && speed) feel('grain', clamp(speed / 1.2, 0.12, 1));
      bucket.current = b; st[1](v);
    }
    var frac = (st[0] - min) / range;
    var scale = p.scale === false ? null : (p.scale || [max, (max + min) / 2, min]);
    var minor = def(p.minorTicks, 3), lines = [], texts = [];
    if (scale) {
      var nMaj = scale.length;
      for (var i = 0; i < nMaj; i++) {
        var y = 10 + len * i / (nMaj - 1);
        lines.push(h('line', { key: 'M' + i, className: 'is-major', x1: 22, x2: 34, y1: y, y2: y }));
        texts.push(h('text', { key: 'T' + i, x: 17, y: y + 3.5, textAnchor: 'end' }, scale[i]));
        if (i < nMaj - 1) for (var k = 1; k <= minor; k++) { var yy = y + (len / (nMaj - 1)) * k / (minor + 1); lines.push(h('line', { key: 'm' + i + '-' + k, x1: 28, x2: 34, y1: yy, y2: yy })); }
      }
    }
    var fine = p.step || range / 100;
    return h('div', { className: cx('sy-fader', 'sy-fader--' + cap, p.className) },
      h('div', { className: 'sy-fader__body' },
        scale ? h('svg', { className: 'sy-fader__scale', width: 36, height: len + 20, 'aria-hidden': true }, lines, texts) : null,
        h('div', { className: 'sy-fader__track', style: { height: len + 'px', marginTop: '10px', marginBottom: '10px' },
          onPointerDown: function (e) {
            if (e.target !== e.currentTarget) return;
            var r = e.currentTarget.getBoundingClientRect(); bucket.current = null;
            change(max - (e.clientY - r.top) / r.height * range, 0); feel('detent');
          } },
          h('div', { className: 'sy-fader__cap', style: { top: (1 - frac) * 100 + '%' }, tabIndex: 0, role: 'slider', 'aria-orientation': 'vertical',
            'aria-label': p.label || 'Fader', 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': st[0],
            onPointerDown: function (e) { bucket.current = p.step ? Math.round((st[2].current - min) / p.step) : null; dragRelative(e, { start: st[2].current, min: min, max: max, px: len, onMove: change }); },
            onKeyDown: function (e) {
              var v = st[2].current;
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v += fine; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v -= fine;
              else if (e.key === 'Home') v = min; else if (e.key === 'End') v = max; else return;
              e.preventDefault(); change(v, 0.3);
            } }))),
      p.showValue ? h('span', { className: 'sy-readout' }, p.format ? p.format(st[0]) : Math.round(st[0] * 10) / 10) : null,
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  /* ==================================================================
     SWITCHES
     ================================================================== */
  /* over-center: the part resists, then snaps once dragged past its spring */
  function useOverCenter(st, axis, threshold, onCommit) {
    var pull = useState(0), drag = useRef(null);
    function commit(v) { drag.current && (drag.current.done = true); pull[1](0); onCommit(v); }
    return {
      pull: pull[0],
      handlers: {
        onPointerDown: function (e) {
          if (e.button) return;
          capture(e); drag.current = { x: e.clientX, y: e.clientY, moved: false, done: false };
          pull[1](0.0001);
          var el = e.currentTarget;
          listen(el, function (ev) {
            var dg = drag.current; if (!dg || dg.done) return;
            var on = st[2].current;
            var d = axis === 'y' ? (on ? ev.clientY - dg.y : dg.y - ev.clientY) : (on ? dg.x - ev.clientX : ev.clientX - dg.x);
            if (Math.abs(d) > 3) dg.moved = true;
            var f = clamp(d / threshold, 0, 1);
            if (f >= 1) commit(!on); else pull[1](f * 0.45);
          }, function () {
            var dg = drag.current; drag.current = null;
            if (dg && !dg.done && !dg.moved) commit(!st[2].current);
            else pull[1](0);
          });
        },
        onClick: function (e) { if (e.detail === 0) commit(!st[2].current); }
      }
    };
  }

  function Toggle(p) {
    var variant = p.variant || 'chrome';
    var st = useControlled(p.checked, def(p.defaultChecked, true), p.onChange);
    var oc = useOverCenter(st, 'y', variant === 'mini' ? 12 : 18, function (v) { feel(variant === 'mini' ? 'slide' : 'snap'); st[1](v); });
    var labels = p.labels || ['ON', 'OFF'];
    var btn = h('button', Object.assign({ type: 'button', role: 'switch', 'aria-checked': st[0], 'aria-label': p.label || labels[0], disabled: p.disabled,
      className: cx('sy-toggle', 'sy-toggle--' + variant, !st[0] && 'is-off', oc.pull > 0 && 'is-pulling'), style: { '--pull': oc.pull },
      onKeyDown: function (e) {
        if (e.key === 'ArrowUp' && !st[2].current) { e.preventDefault(); feel('snap'); st[1](true); }
        if (e.key === 'ArrowDown' && st[2].current) { e.preventDefault(); feel('snap'); st[1](false); }
      } }, oc.handlers),
      variant === 'mini'
        ? [h('span', { key: 's', className: 'sy-toggle__slot' }), h('span', { key: 'k', className: 'sy-toggle__slider' })]
        : [h('span', { key: 'n', className: 'sy-toggle__nut' }), h('span', { key: 'b', className: 'sy-toggle__bat' })]);
    var showLabels = p.showLabels !== undefined ? p.showLabels : variant === 'mini';
    return h('div', { className: cx('sy-ctl', p.className) },
      h('div', { className: cx('sy-toggle-ctl', variant === 'mini' && 'sy-toggle-ctl--mini') },
        showLabels ? h('div', { className: 'sy-toggle__labels', style: variant === 'mini' ? { height: '56px', textAlign: 'center', alignItems: 'center' } : undefined },
          h('span', { className: cx('sy-legend sy-legend--sm', st[0] && 'sy-legend--ink') }, labels[0]),
          variant === 'mini' ? btn : null,
          h('span', { className: cx('sy-legend sy-legend--sm', !st[0] && 'sy-legend--ink') }, labels[1])) : null,
        variant === 'mini' && showLabels ? null : btn),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function Rocker(p) {
    var color = p.color || 'signal';
    var st = useControlled(p.checked, !!p.defaultChecked, p.onChange);
    var pushing = useState(false);
    function commit() { pushing[1](false); feel('clunk'); st[1](!st[2].current); }
    return h('div', { className: cx('sy-ctl', p.className) },
      p.led ? h(Led, { on: st[0], color: p.ledColor || 'signal', size: 6, flat: true }) : null,
      h('button', { type: 'button', role: 'switch', 'aria-checked': st[0], 'aria-label': p.label || 'Rocker', disabled: p.disabled,
        className: cx('sy-rocker', 'sy-rocker--' + color, st[0] && 'is-on', pushing[0] && 'is-pushing'),
        onPointerDown: function (e) { if (e.button) return; pushing[1](true); feel('tick', 0.6); },
        onPointerUp: function () { if (pushing[0]) commit(); },
        onPointerLeave: function () { pushing[1](false); }, onPointerCancel: function () { pushing[1](false); },
        onClick: function (e) { if (e.detail === 0) commit(); } },
        h('span', { className: 'sy-rocker__face' }, color === 'black' || p.dot ? h('span', { className: 'sy-rocker__dot' }) : null)),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  /* a draggable sliding part: follows the finger, snaps to the nearest end */
  function useSlider(st, travel, kind) {
    var x = useState(null), drag = useRef(null);
    function set(v) { if (v !== st[2].current) { feel(kind); st[1](v); } }
    return {
      x: x[0],
      handlers: {
        onPointerDown: function (e) {
          if (e.button) return;
          var el = capture(e); drag.current = { sx: e.clientX, base: st[2].current ? travel : 0, moved: false, lt: now(), lx: e.clientX };
          listen(el, function (ev) {
            var dg = drag.current; if (!dg) return;
            var d = ev.clientX - dg.sx; if (Math.abs(d) > 3) dg.moved = true;
            if (!dg.moved) return;
            var t = now(); var sp = Math.abs(ev.clientX - dg.lx) / Math.max(1, t - dg.lt); dg.lt = t; dg.lx = ev.clientX;
            if (sp > 0.05) feel('grain', clamp(sp / 1.4, 0.15, 0.7));
            x[1](clamp(dg.base + d, 0, travel));
          }, function (ev) {
            var dg = drag.current; drag.current = null;
            if (!dg) return;
            if (!dg.moved) { x[1](null); set(!st[2].current); return; }
            var pos = clamp(dg.base + (ev.clientX - dg.sx), 0, travel);
            x[1](null); set(pos > travel / 2);
          });
        },
        onClick: function (e) { if (e.detail === 0) set(!st[2].current); },
        onKeyDown: function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); set(true); } if (e.key === 'ArrowLeft') { e.preventDefault(); set(false); } }
      },
      set: set
    };
  }

  function SlideSwitch(p) {
    var st = useControlled(p.checked, !!p.defaultChecked, p.onChange);
    var travel = 34, sl = useSlider(st, travel, 'slide');
    var x = sl.x !== null ? sl.x : (st[0] ? travel : 0);
    return h('div', { className: cx('sy-ctl', p.className) },
      h('div', { className: 'sy-slide-ctl' },
        p.left !== undefined ? h('span', { className: cx(typeof p.left === 'string' && 'sy-legend sy-legend--sm', !st[0] && 'is-active'), onClick: function () { sl.set(false); }, style: { cursor: 'pointer' } }, typeof p.left === 'string' && GLYPHS[p.left] ? h(Glyph, { name: p.left }) : p.left) : null,
        h('button', Object.assign({ type: 'button', role: 'switch', 'aria-checked': st[0], 'aria-label': p.label || 'Switch', disabled: p.disabled,
          className: cx('sy-slide', st[0] && 'is-on', sl.x !== null && 'is-dragging'), style: { '--x': x + 'px' } }, sl.handlers),
          h('span', { className: 'sy-slide__cap' })),
        p.right !== undefined ? h('span', { className: cx(typeof p.right === 'string' && 'sy-legend sy-legend--sm', st[0] && 'is-active'), onClick: function () { sl.set(true); }, style: { cursor: 'pointer' } }, typeof p.right === 'string' && GLYPHS[p.right] ? h(Glyph, { name: p.right }) : p.right) : null),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  function PillSwitch(p) {
    var variant = p.variant || 'ivory';
    var st = useControlled(p.checked, def(p.defaultChecked, true), p.onChange);
    var travel = 60, sl = useSlider({ 0: !st[0], 1: function (v) { st[1](!v); }, 2: { get current() { return !st[2].current; } } }, travel, 'slide');
    /* knob sits left when on, uncovering the lamp; slides right over it when off */
    var x = sl.x !== null ? sl.x : (st[0] ? 0 : travel);
    return h('div', { className: cx('sy-ctl', p.className) },
      h('button', Object.assign({ type: 'button', role: 'switch', 'aria-checked': st[0], 'aria-label': p.label || 'Switch', disabled: p.disabled,
        className: cx('sy-pill', 'sy-pill--' + variant, st[0] && 'is-on', sl.x !== null && 'is-dragging'), style: { '--x': x + 'px' } }, sl.handlers, {
          onKeyDown: function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); var want = e.key === 'ArrowLeft'; if (want !== st[2].current) { feel('slide'); st[1](want); } } } }),
        h(Led, { className: 'sy-pill__lamp', on: st[0], color: p.ledColor || (variant === 'black' ? 'white' : 'green'), size: 8, flat: true }),
        h('span', { className: 'sy-pill__knob' })),
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  /* ==================================================================
     MODULAR
     ================================================================== */
  function Jack(p) {
    var st = useControlled(p.patched, !!p.defaultPatched, p.onChange);
    var jack = h('button', { type: 'button', role: 'switch', 'aria-checked': st[0], 'aria-label': (p.label || 'Jack') + (st[0] ? ', patched' : ''),
      className: cx('sy-jack', st[0] && 'is-patched'), style: p.cable ? { '--cc': 'var(--' + (LED_VAR[p.cable] || p.cable) + ')' } : undefined,
      onClick: function () { var v = !st[2].current; feel(v ? 'jack' : 'unplug'); st[1](v); } },
      h('span', { className: 'sy-jack__nut' }), h('span', { className: 'sy-jack__socket' }), h('span', { className: 'sy-jack__hole' }), h('span', { className: 'sy-jack__plug' }));
    if (!p.label && !p.glyph) return jack;
    return h('div', { className: cx('sy-ctl', p.className), style: p.glyph ? { flexDirection: 'row', gap: '10px' } : undefined },
      jack,
      p.glyph ? h('span', { style: { color: 'var(--ink-muted)' } }, h(Glyph, { name: p.glyph, size: 14 })) : null,
      p.label ? h('span', { className: 'sy-legend' }, p.label) : null);
  }

  var api = {
    Panel: Panel, Legend: Legend, Glyph: Glyph, Grille: Grille, Led: Led, Meter: Meter, DotMatrix: DotMatrix,
    Key: Key, KeyStrip: KeyStrip, PushButton: PushButton, Segmented: Segmented, Pad: Pad, PadGrid: PadGrid, StepGrid: StepGrid,
    Knob: Knob, Dial: Dial, Selector: Selector, Lever: Lever, Fader: Fader,
    Toggle: Toggle, Rocker: Rocker, SlideSwitch: SlideSwitch, PillSwitch: PillSwitch, Jack: Jack,
    feedback: feedback, glyphs: Object.keys(GLYPHS), font: FONT_SRC
  };
  window.Syne = Object.assign(window.Syne || {}, api);
})();
