/* SYNE MOTH — interface. Landscape. Hold a function button, then turn a dial or press a key. */
(function () {
  'use strict';
  var E = window.SyneChord, M = E.M, S = window.Syne, R = window.React, h = R.createElement;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef, useLayoutEffect = R.useLayoutEffect;
  var FB = S.feedback, set = E.settings, st = E.st;
  var UI = { sheet: false, sheetFocus: null, downloads: null, mod: null, used: false, taps: [] };
  function cx() { var o = []; for (var i = 0; i < arguments.length; i++) if (arguments[i]) o.push(arguments[i]); return o.join(' '); }
  function feel(k, v) { try { FB.play(k, v); } catch (e) {} }
  /* the design system plays the click sounds; the buzz is driven from here (nativeOnly hands it over) so it reaches an
     iPhone too. iOS Safari only fires its haptic (a hidden native switch) inside a user gesture, and for touch that is the
     finger lifting, not landing: a tap asked for outside one is kept and played on the next lift */
  function syncFeedback() { FB.configure({ haptics: set.haptics, sound: set.clicks, volume: 0.3, nativeOnly: true }); }
  var HAP = (function () {
    var UA = navigator.userAgent || '', IOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var VIB = typeof navigator.vibrate === 'function', pats = FB.patterns || {}, el = null, act = 0, pending = 0, lastTap = 0, lastVib = 0, count = 0;
    function tap() {
      count++; lastTap = performance.now();
      try { if (!el) { var l = document.createElement('label'); l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'; var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; l.appendChild(i); document.body.appendChild(l); el = l; } el.click(); } catch (e) {}
    }
    function begin() { act++; if (pending && performance.now() - pending < 900) { pending = 0; if (performance.now() - lastTap > 35) tap(); } }
    function end() { act = Math.max(0, act - 1); }
    ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (t) { window.addEventListener(t, begin, true); window.addEventListener(t, end, false); });
    FB.subscribe(function (kind, k) {
      if (!set.haptics) return;
      var t = performance.now();
      if (VIB && pats[kind] && t - lastVib > ((kind === 'tick' || kind === 'grain') ? 30 : 0)) { lastVib = t; var p = k < 0.6 ? pats[kind].map(function (x, i) { return i % 2 ? x : Math.max(1, Math.round(x * k * 1.4)); }) : pats[kind]; try { navigator.vibrate(p); } catch (e) {} count++; }
      if (!IOS || kind === 'grain' || kind === 'release') return;
      if (act) { if (t - lastTap > 35) tap(); } else pending = t;
    });
    return { ios: IOS, vibrate: VIB, count: function () { return count; }, tap: tap };
  })();
  /* the light-finish styling keys off .is-light, worked out from the panel colour actually on screen, so it holds whatever
     sets the theme: the Options finish, the phone's appearance, or a host forcing light or dark */
  function markLight() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--chassis').trim(), m = c.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i), l = 1;
    if (m) l = (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
    document.documentElement.classList.toggle('is-light', l > 0.5);
  }
  function applyFinish() { var f = set.finish; if (f === 'chalk' || f === 'graphite') document.documentElement.setAttribute('data-finish', f); else document.documentElement.removeAttribute('data-finish'); markLight(); }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', markLight); new MutationObserver(markLight).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-finish', 'style'] }); } catch (e) {}
  function setS(k, v) { set[k] = v; E.applySound(); E.changed(); }
  function show(big, small, ms) { E.say(big, small, ms || 1400); }
  window.addEventListener('keydown', function (e) { if (e.key === 'Tab') document.documentElement.classList.add('kbd'); }, true);
  window.addEventListener('pointerdown', function () { document.documentElement.classList.remove('kbd'); E.ensureAudio(); }, true);
  if (window.claude && window.claude.use) { try { window.claude.use('downloads').then(function (d) { UI.downloads = d; E.changed(); }).catch(function () {}); } catch (e) {} }

  var KEYS = M.MODE_LIST, BARS = [1, 2, 4, 8, 16, 0];
  function barsLabel(b) { return b === 0 ? 'FREE' : b + (b > 1 ? ' BARS' : ' BAR'); }
  var MODE_SHORT = { off: '', major: 'MAJ', minor: 'MIN', hminor: 'HMIN', dorian: 'DOR', mixolydian: 'MIX', lydian: 'LYD', phrygian: 'PHR' };
  function pct(v) { return Math.round(v * 100) + '%'; }
  function keyName(pc) { return M.spellPc(pc, set.keyMode !== 'off' ? E.keyCtx() : { enabled: true, rootPc: pc, mode: 'major' }); }
  function perfLabel(i) { return M.PERF_MODES[i].label.replace(/^P\d /, ''); }
  function off(v) { var r = Math.round((v - 0.5) * 200); return r === 0 ? 'AS DESIGNED' : (r > 0 ? '+' : '') + r + '%'; }
  function signed(v) { var r = Math.round(v); return (r > 0 ? '+' : '') + r; }
  var mem = { perf: 5, scale: 'major', bass: 1 };
  function bankOf(i) { if (i >= E.FACTORY) return E.FAMILIES.length - 1; var b = 0; E.FAMILIES.forEach(function (f, k) { if (i >= f.first) b = k; }); return b; }
  function soundNo(n) { return n < E.FACTORY ? String(n + 1).padStart(2, '0') : 'U' + (n - E.FACTORY + 1); }
  function soundSub(n) { return 'SOUND ' + soundNo(n) + ' OF ' + E.soundCount() + ' · ' + E.soundAt(n).family; }

  /* ================= one dial. Alone it voices the chord; while a function button is held, the eight chord keys
     become that function's parameters and the dial sets the one picked ================= */
  function P(key, short, o) { return Object.assign({ key: key, short: short, min: 0, max: 1, fmt: pct, set: function (v) { setS(key, v); } }, o); }
  function D(key, short, list, o) { return P(key, short, Object.assign({ min: 0, max: list.length - 1, detents: list.length, fmt: function (v) { return list[Math.round(v)]; }, set: function (v) { setS(key, Math.round(v)); } }, o)); }
  var PARAMS = {
    sound: [
      P('preset', 'SOUND', { get: function () { return set.preset; }, range: function () { return [0, E.soundCount() - 1, E.soundCount()]; }, fmt: function (v) { return E.soundAt(Math.round(v)).name; }, set: function (v) { var i = Math.round(v); if (i !== set.preset) E.selectSound(i); } }),
      P('eCut', 'CUTOFF', { center: 0.5, fmt: off }), P('eRes', 'RESO', { center: 0.5, fmt: off }),
      P('eAtk', 'ATTACK', { center: 0.5, fmt: off }), P('eDec', 'DECAY', { center: 0.5, fmt: off }), P('eRel', 'RELEASE', { center: 0.5, fmt: off }),
      P('lofi', 'LO-FI', { fmt: function (v) { return v < 0.01 ? 'CLEAN' : pct(v); } }), P('volume', 'VOLUME')],
    perform: [
      P('perfMode', 'STYLE', { min: 0, max: M.PERF_MODES.length - 1, detents: M.PERF_MODES.length, fmt: function (v) { return perfLabel(Math.round(v)); }, set: function (v) { var i = Math.round(v); setS('perfMode', i); if (i) mem.perf = i; } }),
      D('rateIdx', 'RATE', M.RATES.map(function (r) { return r.id; })),
      P('strumMs', 'STRUM', { min: 5, max: 120, step: 1, fmt: function (v) { return Math.round(v) + ' MS'; }, set: function (v) { setS('strumMs', Math.round(v)); } }),
      P('gate', 'GATE', { min: 0.05 }),
      P('humanize', 'HUMAN'), P('probability', 'CHANCE'),
      D('arpOct', 'ARP OCT', ['1 OCT', '2 OCT', '3 OCT', '4 OCT'], { get: function () { return set.arpOct - 1; }, set: function (v) { setS('arpOct', Math.round(v) + 1); } })],
    fx: [
      P('reverb', 'REVERB'), P('delay', 'DELAY'), D('delayDiv', 'TIME', E.DELAY_DIVS.map(function (d) { return d.id; })), P('delayFb', 'FDBK', { max: 0.9 }),
      P('chorus', 'CHORUS'), P('filter', 'FILTER', { center: 0.5, fmt: function (v) { return v < 0.48 ? 'LP ' + Math.round((0.5 - v) * 200) + '%' : v > 0.52 ? 'HP ' + Math.round((v - 0.5) * 200) + '%' : 'OPEN'; } }),
      P('character', 'DRIVE'), P('width', 'WIDTH')],
    key: [
      D('keyMode', 'SCALE', KEYS.map(function (m) { return m[1]; }), { get: function () { return Math.max(0, KEYS.findIndex(function (m) { return m[0] === set.keyMode; })); }, set: function (v) { var m = KEYS[Math.round(v)][0]; if (m !== set.keyMode) { setS('keyMode', m); if (m !== 'off') mem.scale = m; E.refreshSuggestions(); } } }),
      P('keyRoot', 'ROOT', { min: 0, max: 11, detents: 12, fmt: function (v) { return keyName(Math.round(v)); }, set: function (v) { var i = Math.round(v); if (i !== set.keyRoot) { setS('keyRoot', i); E.refreshSuggestions(); } } }),
      P('octave', 'OCTAVE', { min: -2, max: 2, detents: 5, center: 0, fmt: function (v) { return 'OCT ' + signed(v); }, set: function (v) { var r = Math.round(v); if (r !== set.octave) { setS('octave', r); E.revoice(); } } }),
      D('kbMode', 'KEYBOARD', ['OCTAVE', 'SPLIT'], { get: function () { return set.kbMode === 'split' ? 1 : 0; }, set: function (v) { var m = Math.round(v) ? 'split' : 'octave'; if (m !== set.kbMode) { setS('kbMode', m); E.revoice(); } } }),
      D('spread', 'SPREAD', ['CLOSE', 'OPEN', 'WIDE'], { set: function (v) { var r = Math.round(v); if (r !== set.spread) { setS('spread', r); E.revoice(); } } })],
    bass: [
      D('bassMode', 'MODE', M.BASS_MODES, { set: function (v) { var i = Math.round(v); if (i !== set.bassMode) { setS('bassMode', i); if (i) mem.bass = i; E.rebass(); } } }),
      P('bassLevel', 'LEVEL'),
      P('bassStep', 'VOICING', { min: -6, max: 6, detents: 13, center: 0, fmt: function (v) { var r = Math.round(v); return r === 0 ? 'ROOT' : 'TONE ' + signed(r); }, set: function (v) { var r = Math.round(v); if (r !== set.bassStep) { set.bassStep = r; E.rebass(); } } }),
      P('bassOct', 'OCTAVE', { min: -1, max: 1, detents: 3, center: 0, fmt: function (v) { return 'OCT ' + signed(v); }, set: function (v) { var r = Math.round(v); if (r !== set.bassOct) { setS('bassOct', r); E.rebass(); } } }),
      D('bassPat', 'PATTERN', M.BASS_PATTERNS.map(function (b) { return b.label; }))],
    loop: [
      D('loopBars', 'LENGTH', BARS.map(barsLabel), { get: function () { return Math.max(0, BARS.indexOf(set.loopBars)); }, set: function (v) { setS('loopBars', BARS[Math.round(v)]); } }),
      D('quant', 'QUANTIZE', E.QUANTS.map(function (q) { return q.id; })), P('quantStr', 'STRENGTH'),
      D('meter', 'METER', E.METERS.map(function (m) { return m[0] + '/' + m[1]; }), { set: function (v) { var i = Math.round(v); if (i === set.meter) return; if (st.loop.layers.length) { show('CLEAR THE LOOP', 'FIRST TO CHANGE METER'); return; } setS('meter', i); } })],
    bpm: [
      P('bpm', 'TEMPO', { min: 40, max: 240, step: 1, fmt: function (v) { return Math.round(v) + ' BPM'; }, set: function (v) { E.setBpm(v); E.changed(); } }),
      P('bpm', 'TAP', { tap: true, min: 40, max: 240, step: 1, fmt: function (v) { return Math.round(v) + ' BPM'; }, set: function (v) { E.setBpm(v); E.changed(); } }),
      P('swing', 'SWING', { min: 0.5, max: 0.7 }),
      D('clockOut', 'MIDI CLK', ['OFF', 'ON'], { get: function () { return set.clockOut ? 1 : 0; }, set: function (v) { setS('clockOut', Math.round(v) === 1); } })],
    volume: [P('volume', 'MASTER')]
  };
  UI.pick = {};
  function paramList(mod) { return PARAMS[mod] || null; }
  function paramOf(mod) { var l = paramList(mod); if (!l) return null; var i = Math.min(UI.pick[mod] || 0, l.length - 1); return l[i]; }
  function specOf(p) {
    var r = p.range ? p.range() : [p.min, p.max, p.detents];
    return { label: p.short, min: r[0], max: r[1], detents: r[2], step: p.step, center: p.center, value: p.get ? p.get() : set[p.key], fmt: p.fmt, set: p.set };
  }
  function dialSpec(mod) {
    var p = paramOf(mod); if (p) return specOf(p);
    return { label: 'Voicing', min: -12, max: 12, detents: 25, center: 0, value: set.vStep, fmt: function (v) { var r = Math.round(v); return r === 0 ? 'ROOT POS' : 'INV ' + signed(r); }, set: function (v) { var r = Math.round(v); if (r !== set.vStep) { set.vStep = r; E.revoice(); E.changed(); } } };
  }

  /* ================= function buttons ================= */
  var FNS = [['sound', 'Sound', 'sound'], ['perform', 'Perform', 'pattern'], ['fx', 'FX', 'wave'], ['key', 'Key', 'grid'], ['bpm', 'BPM', 'tempo'], ['hold', 'Hold', 'ring'], ['options', 'Options', 'plus']];
  var HINT = {
    sound: 'LONG PRESS: NEXT SOUND', perform: 'LONG PRESS: PERFORM ON/OFF', fx: 'LONG PRESS: FX ON/OFF', key: 'PRESS A KEY TO SET IT · LONG PRESS: KEY ON/OFF', volume: ''
  };
  function fnLed(id) {
    var L = st.loop;
    switch (id) {
      case 'perform': return set.perfMode ? ['signal'] : null;
      case 'fx': return set.fxOn ? ['signal'] : null;
      case 'key': return set.keyMode !== 'off' ? ['signal'] : null;
      case 'bass': return set.bassMode ? ['signal'] : null;
      case 'loop': return L.state === 'countin' ? ['red', 'fast'] : L.state === 'recording' ? ['red'] : L.dub ? ['red', 'slow'] : L.state === 'playing' && st.playing ? ['green'] : L.layers.length ? ['amber'] : null;
      case 'bpm': return st.playing && st.uiStep % 4 === 0 ? ['green'] : null;
      case 'hold': return set.latchPerf ? ['signal'] : null;
      case 'options': return E.MIDI.status === 'ready' ? ['green'] : /denied|lost|error/.test(E.MIDI.status) ? ['red'] : null;
      default: return null;
    }
  }
  /* a tap opens the button's page and it stays open: the chord keys show its settings and the dial sets them, until the
     same button is tapped again (or another one is). Holding a button and turning the dial works too, and lets go with it.
     A long press with nothing touched is the button's own action: next sound, perform / FX / key on or off. */
  var holdTimer = null;
  function unstick() { UI.sticky = null; UI.mod = null; E.changed(); }
  function touchSticky() {}
  function fnDown(id) {
    if (UI.sticky) { var was = UI.sticky; UI.sticky = null; if (was === id) { UI.closing = true; UI.mod = null; feel('press', 0.7); E.changed(); return; } }
    UI.mod = id; UI.used = false; UI.t0 = performance.now(); feel('press');
  }
  function fnUp(id) {
    if (UI.closing) { UI.closing = false; return; }
    feel('release');
    var dur = performance.now() - UI.t0, page = !!paramList(id);
    if (UI.used) { if (UI.mod === id) UI.mod = null; E.changed(); return; }
    if (page && dur < 550) { UI.sticky = id; UI.mod = id; E.changed(); return; }
    if (UI.mod === id) UI.mod = null;
    if (page) fnLong(id); else fnTap(id);
    E.changed();
  }
  function fnLong(id) { fnTap(id); }
  function fnTap(id) {
    var L = st.loop;
    switch (id) {
      case 'sound': var n = (set.preset + 1) % E.soundCount(); E.selectSound(n); show(E.soundAt(n).name, soundSub(n)); break;
      case 'perform': if (set.perfMode) { mem.perf = set.perfMode; setS('perfMode', 0); } else setS('perfMode', mem.perf || 5); show(perfLabel(set.perfMode), set.perfMode ? 'PERFORM ON' : 'BLOCK CHORDS'); break;
      case 'fx': setS('fxOn', !set.fxOn); show(set.fxOn ? 'FX ON' : 'FX OFF', set.fxOn ? 'EFFECTS IN' : 'DRY'); break;
      case 'key': if (set.keyMode !== 'off') { mem.scale = set.keyMode; setS('keyMode', 'off'); show('KEY OFF', 'FREE ROOTS'); } else { setS('keyMode', mem.scale || 'major'); show(keyName(set.keyRoot) + ' ' + MODE_SHORT[set.keyMode], 'KEY ON · ROOTS PLAY THE KEY'); } E.refreshSuggestions(); break;
      case 'bass': if (set.bassMode) { mem.bass = set.bassMode; setS('bassMode', 0); show('BASS OFF', ''); } else { setS('bassMode', mem.bass || 1); show('BASS ' + M.BASS_MODES[set.bassMode], 'BASS ON'); } E.rebass(); break;
      case 'loop':
        if (L.state === 'empty') { E.rec(); show(set.loopBars ? 'COUNT IN' : 'RECORDING', set.loopBars ? 'RECORDING ' + barsLabel(set.loopBars) : 'FREE LOOP · TAP LOOP TO CLOSE IT'); }
        else if (L.state === 'recording' && L.free) E.rec();
        else if (L.state === 'countin' || L.state === 'recording') show('RECORDING', 'HOLD LOOP TO STOP');
        else if (L.state === 'stopped') { E.play(); show('LOOP', 'PLAYING'); }
        else { E.rec(); show(st.loop.dub ? 'OVERDUB' : 'LAYER ' + st.loop.layers.length, st.loop.dub ? 'TAP LOOP TO FINISH' : 'TAP LOOP TO LAYER AGAIN'); }
        break;
      case 'bpm': tapTempo(); break;
      case 'hold': var v = !set.latchPerf; setS('latchPerf', v); if (!v) E.releaseAll(true); show(v ? 'HOLD ON' : 'HOLD OFF', v ? 'RINGS ON' : 'STOPS ON RELEASE'); break;
      case 'options': UI.sheet = true; E.changed(); break;
      case 'volume': show('VOLUME ' + pct(set.volume), 'HOLD VOLUME AND TURN THE DIAL'); break;
    }
  }
  function tapTempo() {
    var t = performance.now(); UI.taps = UI.taps.filter(function (x) { return t - x < 2000; }); UI.taps.push(t);
    if (UI.taps.length >= 2) { var a = UI.taps.slice(-5), d = (a[a.length - 1] - a[0]) / (a.length - 1); E.setBpm(60000 / d); show(set.bpm + ' BPM', 'TAP TEMPO'); } else show(set.bpm + ' BPM', 'KEEP TAPPING');
    E.changed();
  }
  function loopHold() {
    var L = st.loop; feel('clunk');
    if (L.dub) { E.undoLayer(); return; }
    if (st.playing) { E.stop(); show('STOP', L.layers.length ? 'TAP LOOP TO PLAY · HOLD TO UNDO' : ''); return; }
    if (L.layers.length > 1) { E.undoLayer(); return; }
    if (L.layers.length === 1) { E.clearLoop(); return; }
    show('NO LOOP', 'TAP LOOP TO RECORD');
  }

  /* ================= display: 120 x 24 dots ================= */
  var DW = 120, DH = 24, FONT = {};
  Object.keys(S.font).forEach(function (k) { FONT[k] = S.font[k].split('.'); });
  var LOWER = { a: '00000.00000.01110.00001.01111.10001.01111', d: '00001.00001.01101.10011.10001.10001.01111', g: '00000.01111.10001.10001.01111.00001.01110',
    i: '00100.00000.01100.00100.00100.00100.01110', j: '00010.00000.00110.00010.00010.10010.01100', m: '00000.00000.11010.10101.10101.10101.10001',
    s: '00000.00000.01111.10000.01110.00001.11110', u: '00000.00000.10001.10001.10001.10011.01101', '♭': '10000.10000.10110.11001.10001.10010.11100', '°': '01100.10010.10010.01100.00000.00000.00000', '·': '00000.00000.00000.00100.00000.00000.00000' };
  Object.keys(LOWER).forEach(function (k) { FONT[k] = LOWER[k].split('.'); });
  function glyph(c) { return FONT[c] || FONT[c.toUpperCase()] || FONT['?']; }
  function px(b, x, y) { if (x >= 0 && x < DW && y >= 0 && y < DH) b[y * DW + x] = 1; }
  function draw(b, x, y, s, sc) { s = String(s); sc = sc || 1; for (var n = 0; n < s.length; n++) { var g = glyph(s[n]); for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) if (g[r][c] === '1') for (var a = 0; a < sc; a++) for (var bb = 0; bb < sc; bb++) px(b, x + c * sc + a, y + r * sc + bb); x += 6 * sc; } return x; }
  function tw(s, sc) { return String(s).length * 6 * (sc || 1) - (sc || 1); }
  function displayModel() {
    var m = E.msg(), L = st.loop, act = E.activeCount() > 0, last = st.last, big, small, right = '', left = soundNo(set.preset);
    if (UI.mod && paramList(UI.mod)) { var k = dialSpec(UI.mod); big = k.fmt(k.value); if (UI.mod === 'sound' && k.label !== 'SOUND') big = k.label + ' ' + big;
      if (UI.mod === 'sound' && k.label === 'SOUND') small = (set.preset + 1) + '/' + E.soundCount() + ' · ' + E.soundAt(set.preset).family; else small = UI.mod.toUpperCase() + ' · ' + k.label; }
    else if (m) { big = m.l; small = m.r; }
    else {
      big = last ? last.name : 'SYNE MOTH';
      if (!act && L.state === 'playing' && st.playing && st.loopName) big = st.loopName;
      var beat = Math.floor(st.uiStep / 4) % 4, bar = Math.floor(st.uiStep / 16);
      if (L.state === 'countin') small = 'COUNT IN ' + (4 - beat) + ' · RECORDING STARTS ON 1';
      else if (L.state === 'recording') small = 'REC BAR ' + (Math.max(0, bar - 1) % L.bars + 1) + ' OF ' + L.bars;
      else if (act && last) small = last.notes.map(function (n) { return M.spellPc(n, E.keyCtx()); }).join(' ');
      else if (st.sugg.items.length && st.history.length) small = 'TRY ' + st.sugg.items.map(function (i) { return i.name; }).join('  ');
      else small = st.selType ? 'PLAY ANY KEY' : 'PICK A PAD';
      if (false && L.state !== 'countin' && L.state !== 'recording') small = (st.playing ? '▶ ' : '') + set.bpm + ' BPM · ' + small;
    }
    var progress = null;
    if (st.playing && L.lenTicks && L.state !== 'empty') { var o = L.state === 'countin' ? L.recStart - E.BAR : L.state === 'recording' ? L.recStart : L.origin, len = L.state === 'countin' ? E.BAR : L.lenTicks; progress = (((E.nowTick() - o) % len) + len) % len / len; }
    else if (st.playing) progress = ((st.uiStep % 16) + 1) / 16;
    return { big: big || '', small: small || '', right: right, left: left, progress: progress };
  }
  /* the display runs edge to edge: the dots keep their size and the matrix grows columns to fill the glass. Nothing scrolls:
     a bottom line too long for one row takes two, with the top line set small above it */
  function wrap(t, n) { var words = String(t).split(' '), lines = [''], k = 0; words.forEach(function (w) { var c = lines[k] ? lines[k] + ' ' + w : w; if (c.length <= n || !lines[k]) lines[k] = c; else lines[++k] = w; }); return lines.map(function (l) { return l.slice(0, n); }); }
  function Display(p) {
    var ref = useRef(null), box = useRef(null);
    useEffect(function () {
      var cv = ref.current, ctx2 = cv.getContext('2d'), alive = true, lastKey = '', raf = 0;
      function frame() {
        if (!alive) return;
        var d = displayModel(), bw = box.current.clientWidth - 8, bh = box.current.clientHeight - 8;
        var pitch = Math.max(1.2, bh / DH), cols = Math.max(96, Math.floor(bw / pitch)); if (cols * pitch > bw) pitch = bw / cols;
        var key = JSON.stringify(d) + pitch + cols + document.documentElement.getAttribute('data-finish');
        if (key !== lastKey) {
          lastKey = key; DW = cols;
          var w = DW * pitch, hh = DH * pitch, dpr = window.devicePixelRatio || 1;
          if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); cv.style.width = w + 'px'; cv.style.height = hh + 'px'; }
          var b = new Uint8Array(DW * DH), cw = d.left ? tw(d.left) + 3 : 0, room = DW - 2 * cw, maxc = Math.floor((DW + 1) / 6);
          if (d.left) draw(b, 0, 0, d.left);
          function centre(t, y, sc) { draw(b, Math.round((DW - tw(t, sc)) / 2), y, t, sc); }
          if (tw(d.small) <= DW) {
            if (tw(d.big, 2) <= room) centre(d.big, 0, 2);
            else centre(String(d.big).slice(0, Math.floor((room + 1) / 6)), 4, 1);
            if (d.progress !== null) { var n = Math.round(Math.max(0, Math.min(1, d.progress)) * DW), x0 = Math.round((DW - n) / 2); for (var x = 0; x < n; x += 2) px(b, x0 + x, 15); }
            centre(d.small, 17, 1);
          } else {
            centre(String(d.big).slice(0, Math.floor((room + 1) / 6)), 0, 1);
            var ls = wrap(d.small, maxc).slice(0, 2); centre(ls[0], 8, 1); if (ls[1]) centre(ls[1], 16, 1);
          }
          var cs = getComputedStyle(cv), on = cs.getPropertyValue('--lcd-on').trim() || '#1e241a', offc = cs.getPropertyValue('--lcd-off').trim() || '#b2bba1', rr = pitch * 0.42;
          ctx2.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2.clearRect(0, 0, w, hh);
          [[0, offc], [1, on]].forEach(function (pass) {
            ctx2.fillStyle = pass[1]; ctx2.beginPath();
            for (var y = 0; y < DH; y++) for (var x2 = 0; x2 < DW; x2++) if (b[y * DW + x2] === pass[0]) { var cxp = x2 * pitch + pitch / 2, cyp = y * pitch + pitch / 2; ctx2.moveTo(cxp + rr, cyp); ctx2.arc(cxp, cyp, rr, 0, Math.PI * 2); }
            ctx2.fill();
          });
        }
        raf = requestAnimationFrame(frame);
      }
      frame();
      return function () { alive = false; cancelAnimationFrame(raf); };
    }, []);
    return h('div', { className: 'lcd', ref: box }, h('canvas', { ref: ref, role: 'img', 'aria-label': 'Display' }));
  }

  /* ================= pointer plumbing ================= */
  var down = {};
  function isDown(k) { return !!(down[k] && Object.keys(down[k]).length); }
  function markDown(k, id) { (down[k] = down[k] || {})[id] = 1; }
  function markUp(k, id) { if (down[k] && down[k][id]) { delete down[k][id]; return true; } return false; }
  function pressable(k, onDown, onUp) {
    return {
      onPointerDown: function (e) { if (e.button > 0) return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} markDown(k, e.pointerId); onDown(e); E.changed(); },
      onPointerUp: function (e) { if (markUp(k, e.pointerId)) { onUp(e); E.changed(); } },
      onPointerCancel: function (e) { if (markUp(k, e.pointerId)) { onUp(e); E.changed(); } },
      onLostPointerCapture: function (e) { if (markUp(k, e.pointerId)) { onUp(e); E.changed(); } },
      onContextMenu: function (e) { e.preventDefault(); }
    };
  }
  function velFrom(e) { if (!set.velTouch) return 100; var r = e.currentTarget.getBoundingClientRect(); return Math.round(64 + Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))) * 63); }

  /* a function button: the light above it is on whenever the button is active: its page open, or its function on
     (FX on, Hold on, Perform on...); the button stays pressed in while its page is open */
  function FnButton(p) {
    var id = p.def[0], open = UI.sticky === id || UI.mod === id, led = fnLed(id) || (open ? ['signal'] : null), d = isDown('f' + id) || open;
    return h('div', { className: cx('fb', open && 'is-open') },
      h(S.Led, { size: 6, flat: true, on: !!led, dark: !led, color: led ? led[0] : 'signal', blink: led && led[1] }),
      h('button', Object.assign({ type: 'button', 'aria-label': p.def[1], 'aria-expanded': PARAMS[id] ? open : undefined, 'aria-pressed': id === 'hold' ? !!set.latchPerf : undefined, className: cx('sy-push', 'sy-push--ivory', d && 'is-down') },
        pressable('f' + id, function () { fnDown(id); }, function () { fnUp(id); })),
        h('span', { className: 'sy-push__cap' }),
        h('span', { className: 'sy-push__legend' }, h(S.Glyph, { name: p.def[2], size: 12 }))),
      h('span', { className: cx('sy-legend', open && 'is-on') }, p.def[1]));
  }

  /* ================= chord keys ================= */
  var QK = ['DIM', 'MIN', 'MAJ', 'SUS'], XK = [['6', '6'], ['b7', 'm7'], ['maj7', 'M7'], ['9', '9']];
  function DishKey(p) {
    return h('button', Object.assign({ type: 'button', className: cx('sy-key', p.cls, p.down && 'is-down'), 'aria-pressed': !!p.on, 'aria-label': p.aria }, p.handlers),
      h('span', { className: 'sy-key__dish' }),
      p.on ? h(S.Led, { className: 'sy-key__led', on: true, flat: true, size: 9, color: 'signal' }) : null,
      h('span', { className: 'sy-key__legend' }, p.legend));
  }
  function ParamKeys(mod) {
    var list = paramList(mod), sel = Math.min(UI.pick[mod] || 0, list.length - 1), cells = [];
    for (var i = 0; i < 8; i++) (function (i) {
      var p = list[i];
      if (!p) { cells.push(h('button', { key: i, type: 'button', className: 'sy-key is-blank', disabled: true, 'aria-hidden': true }, h('span', { className: 'sy-key__dish' }))); return; }
      cells.push(h(DishKey, { key: i, cls: 'k-param', down: isDown('pk' + i), on: i === sel, legend: p.short, aria: mod + ' ' + p.short,
        handlers: pressable('pk' + i, function () { UI.used = true; touchSticky(); UI.pick[mod] = i; feel('latch'); if (p.tap) { tapTempo(); return; } var k = specOf(p); show(k.fmt(k.value), mod.toUpperCase() + ' · ' + p.short); }, function () {}) }));
    })(i);
    return h('div', { className: 'sy-strip chords is-params', role: 'group', 'aria-label': mod + ' parameters' }, h('div', { className: 'sy-strip__row' }, cells));
  }
  /* the eight chord pads, Orchid style: a pad chooses the chord every key plays (lit while chosen). Hold one and play keys,
     or tap one and it stays chosen; tap the chosen pad again for single notes. A pad pressed while keys are held re-chords them */
  function ChordKeys() {
    if (UI.mod && paramList(UI.mod)) return ParamKeys(UI.mod);
    return h('div', { className: 'sy-strip chords', role: 'group', 'aria-label': 'Chord pads' },
      h('div', { className: 'sy-strip__row' }, E.TYPES.map(function (t, i) {
        var id = t[0];
        return h(DishKey, { key: id, cls: /7$/.test(id) ? 'k-ext' : '', down: isDown('c' + i), on: st.selType === id, legend: id, aria: id + ' chord',
          handlers: pressable('c' + i, function () { feel('latch'); E.padDown(id); }, function () { feel('release', 0.6); E.padUp(id); var sel = st.selType; show(sel ? sel + ' CHORDS' : 'NOTES', sel ? 'ON EVERY KEY' : 'NO PAD LIT', 1000); }) });
      })));
  }

  /* ================= the dial ================= */
  function Dial(p) {
    var mod = UI.mod && paramList(UI.mod) ? UI.mod : null, k = dialSpec(mod);
    return h('div', { className: cx('dial', mod && 'is-routed') }, h(S.Knob, { key: (mod || 'base') + ':' + (UI.pick[mod] || 0), variant: 'black', pointer: 'line', ticks: p.ticks ? 13 : undefined, size: p.size, min: k.min, max: k.max,
      step: k.detents ? undefined : (k.step || (k.max - k.min) / 200), detents: k.detents, center: k.center, value: k.value,
      onChange: function (v) { if (UI.mod) UI.used = true; touchSticky(); k.set(v); }, label: k.label, showValue: true, format: k.fmt, dragPx: 190 }));
  }

  /* ================= wheels: a ribbed drum in a slot. Pitch springs back to centre; mod stays where you leave it ================= */
  function Wheel(p) {
    var ref = useRef(null), dragging = useState(false), val = p.value;
    /* felt as it turns: a tick every 1/24 of travel, a firmer notch at centre and at each end */
    function haptic(v) {
      var bucket = Math.round(v * 24), last = ref.current._b;
      if (bucket === last) return; ref.current._b = bucket;
      if (p.bipolar && bucket === 0) feel('notch'); else if (v <= (p.bipolar ? -1 : 0) || v >= 1) feel('detent'); else feel('tick', 0.8);
    }
    function setFrom(e, start) { var r = ref.current.getBoundingClientRect(), dy = (start.y - e.clientY) / (r.height * 0.42); var v = p.bipolar ? Math.max(-1, Math.min(1, start.v + dy)) : Math.max(0, Math.min(1, start.v + dy / 2)); haptic(v); p.onChange(v); }
    function down(e) { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} E.ensureAudio(); ref.current._s = { y: e.clientY, v: val, id: e.pointerId }; ref.current._b = Math.round(val * 24); dragging[1](true); feel('press', 0.5); }
    function move(e) { var s0 = ref.current._s; if (!s0 || s0.id !== e.pointerId) return; setFrom(e, s0); }
    function up(e) { var s0 = ref.current._s; if (!s0 || s0.id !== e.pointerId) return; ref.current._s = null; dragging[1](false); if (p.bipolar) { p.onChange(0); feel('notch'); } else feel('release'); }
    var travel = p.bipolar ? val : val * 2 - 1, ribs = (-travel * 34).toFixed(1);
    return h('div', { className: 'wheelcol' },
      h('div', { className: cx('wheel', dragging[0] && 'is-dragging', p.bipolar && 'is-pitch'), ref: ref, role: 'slider', 'aria-label': p.label, 'aria-valuemin': p.bipolar ? -1 : 0, 'aria-valuemax': 1, 'aria-valuenow': Math.round(val * 100) / 100, tabIndex: 0,
        onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up,
        onKeyDown: function (e) { var d = e.key === 'ArrowUp' ? 0.1 : e.key === 'ArrowDown' ? -0.1 : 0; if (d) { e.preventDefault(); p.onChange(Math.max(p.bipolar ? -1 : 0, Math.min(1, val + d))); } } },
        h('div', { className: 'wheel__slot' }),
        h('div', { className: 'wheel__drum', style: { '--ribs': ribs + 'px', '--tilt': (travel * 26).toFixed(1) + '%' } }, h('span', { className: 'wheel__mark' })),
        p.bipolar ? h('span', { className: 'wheel__centre', 'aria-hidden': true }) : null),
      h('span', { className: 'sy-readout' }, p.readout !== undefined ? p.readout : p.bipolar ? (val === 0 ? '0' : (val > 0 ? '+' : '') + (val * 2).toFixed(1)) : Math.round(val * 100)),
      h('span', { className: 'sy-legend' }, p.label));
  }

  /* the FX wheel plays whichever effect is picked under FX (REVERB to start): ride it while you play */
  function FxWheel() {
    var l = paramList('fx'), p = l[Math.min(UI.pick.fx || 0, l.length - 1)], sp = specOf(p), norm = (sp.value - sp.min) / (sp.max - sp.min);
    return h(Wheel, { label: 'FX', value: norm, readout: p.short,
      onChange: function (v) { var raw = sp.min + v * (sp.max - sp.min); sp.set(sp.detents ? Math.round(raw) : raw); if (!set.fxOn) setS('fxOn', true); var nv = sp.detents ? Math.round(raw) : raw; E.say(sp.fmt(nv), 'FX WHEEL · ' + p.short, 900); E.sendFxCC(p.key, v); E.changed(); } });
  }

  /* ================= octave slider: a short ribbed slide set into the rail, five detents from -2 to +2 ================= */
  function OctSlider() {
    var ref = useRef(null), o = set.octave;
    /* low on the left, high on the right, like the keyboard */
    function at(e) { var r = ref.current.getBoundingClientRect(); return Math.max(-2, Math.min(2, Math.round((e.clientX - r.left) / r.width * 4) - 2)); }
    function go(n) { if (n === set.octave) return; feel('detent'); setS('octave', n); E.revoice(); show('OCTAVE ' + signed(n), 'C' + (4 + n)); }
    return h('div', { className: 'octs' },
      h('span', { className: 'octs__lbl' }, 'OCT'), h('span', { className: 'octs__end', 'aria-hidden': true }, 'LO'),
      h('div', { className: 'octs__track', ref: ref, role: 'slider', tabIndex: 0, 'aria-label': 'Octave', 'aria-valuemin': -2, 'aria-valuemax': 2, 'aria-valuenow': o,
        onPointerDown: function (e) { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} E.ensureAudio(); ref.current._d = e.pointerId; feel('press', 0.4); go(at(e)); },
        onPointerMove: function (e) { if (ref.current._d === e.pointerId) go(at(e)); },
        onPointerUp: function () { ref.current._d = null; }, onPointerCancel: function () { ref.current._d = null; },
        onKeyDown: function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); go(Math.min(2, o + 1)); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); go(Math.max(-2, o - 1)); } } },
        [-2, -1, 0, 1, 2].map(function (n) { return h('i', { key: n, className: cx('octs__tick', n === 0 && 'is-zero'), style: { left: ((n + 2) * 25) + '%' } }); }),
        h('span', { className: 'octs__cap', style: { left: ((o + 2) * 25) + '%' } })),
      h('span', { className: 'octs__end', 'aria-hidden': true }, 'HI'),
      h('span', { className: 'octs__val sy-readout' }, signed(o)));
  }

  /* ================= keyboard ================= */
  /* a real octave: seven naturals running up under a rail, five sharps standing on them */
  var NAT = [0, 2, 4, 5, 7, 9, 11], SHARP = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]];
  function Keyboard() {
    var keyOn = set.keyMode !== 'off', kc = E.keyCtx(), sc = keyOn ? M.MODES[set.keyMode].map(function (x) { return (x + set.keyRoot) % 12; }) : null;
    var act = E.activeCount() > 0 && st.last, tones = act ? st.last.notes.map(function (n) { return n % 12; }) : [];
    var nexts = !act && st.sugg.items.length ? st.sugg.items.map(function (i) { return i.spec.rootPc; }) : [], picking = UI.mod === 'key';
    var ww = 100 / 7;
    function cName(pc, oct) { var n = M.spellPc(pc, kc); return pc === 0 ? n + ((set.kbMode === 'split' ? 3 : 4) + oct) : n; }
    function key(pc, sharp, style) {
      var k = 'kb' + pc, d = isDown(k), lit = tones.indexOf(pc) >= 0, out = keyOn && sc.indexOf(pc) < 0 && !set.chromatic, pick = picking && pc === set.keyRoot;
      var dot = nexts.indexOf(pc) >= 0 ? 'is-next' : keyOn && !out ? 'is-scale' : null;
      return h('button', Object.assign({ key: pc, type: 'button', className: cx('sy-pad', sharp ? 'k-b' : 'k-w', lit && 'is-lit', d && 'is-down', out && !picking && 'is-out', pick && 'is-pick'), style: style, 'aria-label': M.spellPc(pc, kc) },
        pressable(k, function (e) {
          if (UI.mod === 'key') { UI.used = true; touchSticky(); feel('detent'); if (set.keyMode === 'off') set.keyMode = mem.scale || 'major'; setS('keyRoot', pc); E.refreshSuggestions(); show(keyName(pc) + ' ' + MODE_SHORT[set.keyMode], 'KEY SET'); return; }
          feel('thump', 0.8); E.keyDown('p' + e.pointerId, pc, velFrom(e));
        }, function (e) { E.noteOffRoot('p' + e.pointerId); })),
        dot ? h('span', { className: 'k__dot ' + dot }) : null,
        h('span', { className: 'k__name' }, cName(pc, set.octave)));
    }
    function octave(make, oct) {
      return NAT.map(function (pc, i) { return make(pc, false, { left: 'calc(' + (i * ww) + '% + 1.5px)', width: 'calc(' + ww + '% - 3px)' }, oct); })
        .concat(SHARP.map(function (b) { var w = ww * 0.6; return make(b[0], true, { left: (b[1] * ww - w / 2) + '%', width: w + '%' }, oct); }));
    }
    return h('div', { className: 'keys' },
      h('div', { className: 'keybed', role: 'group', 'aria-label': 'Keyboard' },
        h('div', { className: 'keybed__keys' }, octave(key, set.octave)),
        h('div', { className: 'keybed__rail' }, h(OctSlider), h('span', { className: 'rail__oct' }, (st.selType ? st.selType + ' CHORDS' : keyOn ? 'KEY CHORDS' : 'SINGLE NOTES') + (keyOn ? ' · KEY ' + keyName(set.keyRoot) + ' ' + MODE_SHORT[set.keyMode] : '') + (set.kbMode === 'split' ? ' · SPLIT' : '')))));
  }

  /* ================= files ================= */
  function fileName(ext) { var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); }; return 'syne-moth-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.' + ext; }
  function anchorSave(blob, name) { try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return true; } catch (e) { return false; } }
  function exportMidi() {
    var x = E.exportData(); if (!x) { show('NOTHING YET', 'PLAY SOMETHING FIRST'); feel('error'); return; }
    var mid = fileName('mid');
    if (UI.downloads) UI.downloads.save({ filename: mid.replace('.mid', '-midi.zip'), data: new Blob([M.zipStore([{ name: mid, data: x.bytes }])]) }).then(function () { show('SAVED', x.label.toUpperCase() + ' MIDI FILE'); }).catch(function (e) { if (e && e.code !== 'declined') anchorSave(new Blob([x.bytes], { type: 'audio/midi' }), mid); });
    else if (anchorSave(new Blob([x.bytes], { type: 'audio/midi' }), mid)) show('SAVED', x.label.toUpperCase() + ' MIDI FILE');
  }
  function exportWav() {
    UI.sheet = false; E.changed();
    E.bounce().then(function (bytes) {
      var name = fileName('wav');
      if (UI.downloads) UI.downloads.save({ filename: name.replace('.wav', '-wav.zip'), data: new Blob([M.zipStore([{ name: name, data: bytes }])]) }).then(function () { show('SAVED', 'WAV OF THE LOOP'); }).catch(function (e) { if (e && e.code !== 'declined') anchorSave(new Blob([bytes], { type: 'audio/wav' }), name); });
      else if (anchorSave(new Blob([bytes], { type: 'audio/wav' }), name)) show('SAVED', 'WAV OF THE LOOP');
    }).catch(function () { show('NO LOOP', 'RECORD A LOOP FIRST'); feel('error'); });
  }
  function exportJson() {
    var txt = JSON.stringify(E.project(), null, 1), name = fileName('json');
    if (UI.downloads) UI.downloads.save({ filename: name, data: txt }).then(function () { show('SAVED', 'PROJECT FILE'); }).catch(function () {});
    else anchorSave(new Blob([txt], { type: 'application/json' }), name);
  }

  /* ================= options ================= */
  function Section(p) { return h('section', { className: 'sh__sec', id: p.id }, h('h3', { className: 'sh__h' }, p.title), p.children); }
  function SRow(p) { return h('div', { className: cx('sh__row', p.stack && 'sh__row--stack') }, h('div', { className: 'sh__k' }, h('span', null, p.label), p.sub ? h('small', null, p.sub) : null), p.children); }
  function Seg(p) { return h(S.Segmented, { label: p.label, items: p.items, value: Math.max(0, p.value), onChange: p.onChange, itemHeight: 30 }); }
  function Pill(p) { return h(S.PillSwitch, { label: p.label, checked: !!p.checked, ledColor: p.color, onChange: p.onChange }); }
  function SmallKnob(p) { return h(S.Knob, Object.assign({ variant: 'knurl', pointer: 'signal', size: 42, showValue: true, dragPx: 150 }, p)); }
  function HoldBtn(p) {
    var s = useState(false), tm = useRef(null);
    function start(e) { e.preventDefault(); s[1](true); feel('press'); tm.current = setTimeout(function () { s[1](false); p.onHold(); }, 1200); }
    function stop() { clearTimeout(tm.current); s[1](false); }
    return h('button', { type: 'button', className: cx('ukey', 'hold', s[0] && 'is-arming'), onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop }, h('span', { className: 'hold__fill' }), h('span', null, p.label));
  }
  var MIDI_TEXT = { off: ['Not connected', 'white'], unsupported: ['This browser has no Web MIDI', 'red'], requesting: ['Asking for access…', 'amber'], denied: ['Blocked here', 'red'], nodevice: ['No MIDI outputs found', 'amber'], select: ['Pick an output', 'amber'], ready: ['Connected', 'green'], lost: ['Disconnected', 'red'], error: ['Send failed', 'red'] };
  function chFmt(v) { v = Math.round(v); return v === 0 ? 'OFF' : 'CH ' + v; }
  function Sheet() {
    var open = UI.sheet, MI = E.MIDI, mt = MIDI_TEXT[MI.status] || [MI.status, 'amber'], body = useRef(null);
    useEffect(function () { if (open && body.current) body.current.scrollTop = 0; }, [open]);
    var x = E.exportData();
    var log = MI.log.slice(0, 5).map(function (l) { return /PANIC|START|STOP/.test(l.kind) ? l.kind : (l.kind + '  CH' + l.ch + '  ' + M.noteName(l.a, E.keyCtx()) + (l.kind === 'ON' ? '  V' + l.b : '')); }).join('\n');
    function close() { UI.sheet = false; feel('release'); E.changed(); }
    var chanKnob = function (key, lbl) { return h(SmallKnob, { key: key, label: lbl, min: 0, max: 16, detents: 17, value: set[key], format: chFmt, onChange: function (v) { v = Math.round(v); if (v !== set[key]) { E.midiPanic(); setS(key, v); } } }); };
    return h('div', { className: cx('sheet', open && 'is-open'), 'aria-hidden': !open },
      h('div', { className: 'sheet__scrim', onClick: close }),
      h('div', { className: 'sheet__panel', role: 'dialog', 'aria-modal': true, 'aria-label': 'Options' },
        h('div', { className: 'sheet__head' }, h('div', { className: 'sheet__title' }, h('b', null, 'Options'), h('span', null, 'SYNE MOTH')), h('button', { type: 'button', className: 'ukey', onClick: close }, 'Done')),
        h('div', { className: 'sheet__body', ref: body },
          h(Section, { title: 'MIDI out', id: 'sec-midi' },
            h('div', { className: 'sh__status' }, h(S.Led, { size: 8, flat: true, on: MI.status !== 'off', dark: MI.status === 'off', color: mt[1] }), mt[0] + (MI.out ? ' · ' + MI.out.name : '')),
            MI.detail ? h('p', { className: 'sh__note' }, MI.detail) : null,
            h('div', { className: 'sh__btns' },
              h('button', { type: 'button', className: 'ukey', disabled: MI.status === 'unsupported' || MI.status === 'requesting', onClick: function () { feel('press'); E.ensureAudio(); E.requestMidi(); } }, h(S.Glyph, { name: 'midi', size: 12 }), MI.access ? 'Rescan' : 'Connect'),
              h('button', { type: 'button', className: 'ukey', onClick: function () { feel('press'); E.panic(); } }, 'All notes off')),
            MI.outs.length > 1 ? h('div', { className: 'ports', role: 'radiogroup', 'aria-label': 'MIDI output' }, MI.outs.map(function (o) {
              var sel = MI.out && MI.out.id === o.id; return h('button', { key: o.id, type: 'button', role: 'radio', 'aria-checked': sel, className: cx('ukey port', sel && 'is-sel'), onClick: function () { feel('detent'); E.selectOut(o.id); } }, h(S.Led, { size: 5, flat: true, on: sel, dark: !sel, color: 'green' }), o.name);
            })) : null,
            h('div', { className: 'sh__knobs', style: { '--n': 3 } }, chanKnob('perfCh', 'Played'), chanKnob('bassCh', 'Bass'), chanKnob('chordCh', 'Chord')),
            h('p', { className: 'sh__note' }, 'Played sends exactly what you hear. Bass has its own channel. Chord sends the held block chord with no arpeggio; it starts off so notes don\'t double.'),
            h(SRow, { label: 'Send MIDI clock', sub: 'Start, stop and 24 per beat while playing' }, h(Pill, { label: 'Clock', checked: set.clockOut, onChange: function (v) { setS('clockOut', v); } })),
            h('pre', { className: 'mon', 'aria-label': 'MIDI monitor' }, log || 'MIDI MONITOR'),
            h('p', { className: 'sh__note' }, 'Live MIDI needs Web MIDI: desktop Chrome, Edge or Firefox. iPhone browsers don\'t have it; save a MIDI file instead.')),
          h(Section, { title: 'Save', id: 'sec-export' },
            h('div', { className: 'sh__btns' },
              h('button', { type: 'button', className: 'ukey', disabled: !x, onClick: function () { feel('press'); exportMidi(); } }, h(S.Glyph, { name: 'out', size: 12 }), 'MIDI file of this session'),
              h('button', { type: 'button', className: 'ukey', onClick: function () { feel('press'); exportJson(); } }, 'Project file'),
              h('button', { type: 'button', className: 'ukey', onClick: function () { feel('press'); document.getElementById('sc-json').click(); } }, 'Open project'))),
          h(Section, { title: 'Sound', id: 'sec-sound' },
            h(SRow, { label: soundNo(set.preset) + '  ' + E.soundAt(set.preset).name, sub: (set.preset < E.FACTORY ? E.soundAt(set.preset).family + ' bank · factory sound' : 'User sound · saved with its edits and FX') + ' · ' + set.userSounds.length + ' of 30 user sounds saved' }),
            h('div', { className: 'sh__btns' },
              h('button', { type: 'button', className: 'ukey', onClick: function () { feel('press'); E.saveUserSound(); } }, h(S.Glyph, { name: 'write', size: 12 }), 'Save as user sound'),
              set.preset >= E.FACTORY ? h('button', { type: 'button', className: 'ukey', onClick: function () { feel('error'); E.deleteUserSound(); } }, 'Delete this user sound') : null),
            h('div', { className: 'sh__knobs', style: { '--n': 2 } },
              h(SmallKnob, { key: 'v', label: 'Volume', min: 0, max: 1, value: set.volume, format: pct, onChange: function (v) { setS('volume', v); } }),
              h(SmallKnob, { key: 'w', label: 'Width', min: 0, max: 1, value: set.width, format: pct, onChange: function (v) { setS('width', v); } })),
            h(SRow, { label: 'FX', sub: 'Long-press FX to switch every effect off and on' }, h(Pill, { label: 'FX', checked: set.fxOn, onChange: function (v) { setS('fxOn', v); } }))),
          h(Section, { title: 'Perform', id: 'sec-perform' },
            h('div', { className: 'sh__knobs', style: { '--n': 4 } },
              h(SmallKnob, { key: 'g', label: 'Gate', min: 0.05, max: 1, value: set.gate, format: pct, onChange: function (v) { setS('gate', v); } }),
              h(SmallKnob, { key: 'sw', label: 'Swing', min: 0.5, max: 0.7, value: set.swing, format: pct, onChange: function (v) { setS('swing', v); } }),
              h(SmallKnob, { key: 'hu', label: 'Humanize', min: 0, max: 1, value: set.humanize, format: pct, onChange: function (v) { setS('humanize', v); } }),
              h(SmallKnob, { key: 'pr', label: 'Probability', min: 0, max: 1, value: set.probability, format: pct, onChange: function (v) { setS('probability', v); } })),
            h(SRow, { stack: true, label: 'Arp octaves', sub: 'How far up the arpeggiators climb' }, h(Seg, { label: 'Arp octaves', items: ['1 OCT', '2 OCT', '3 OCT', '4 OCT'], value: set.arpOct - 1, onChange: function (i) { setS('arpOct', i + 1); } })),
            h(SRow, { stack: true, label: 'Pattern gate', sub: 'Hold: plays while held. Latch: keeps going until the next chord. One-shot: one pass' }, h(Seg, { label: 'Pattern gate', items: ['HOLD', 'LATCH', 'ONE-SHOT'], value: set.latchPerf ? 1 : set.patGate === 'oneshot' ? 2 : 0, onChange: function (i) { setS('patGate', i === 2 ? 'oneshot' : 'hold'); setS('latchPerf', i === 1); if (i !== 1) E.releaseAll(true); } }))),
          h(Section, { title: 'Play', id: 'sec-play' },
            h(SRow, { stack: true, label: 'Keyboard', sub: 'Octave: one octave of roots. Split: C to F an octave below F# to B' }, h(Seg, { label: 'Keyboard', items: ['OCTAVE', 'SPLIT'], value: set.kbMode === 'split' ? 1 : 0, onChange: function (i) { setS('kbMode', i ? 'split' : 'octave'); E.revoice(); } })),
            h(SRow, { label: 'Smooth voice leading', sub: 'Each chord takes the inversion nearest the last' }, h(Pill, { label: 'Smooth', checked: set.smooth, onChange: function (v) { setS('smooth', v); } })),
            h(SRow, { stack: true, label: 'Spread' }, h(Seg, { label: 'Spread', items: ['CLOSE', 'OPEN', 'WIDE'], value: set.spread, onChange: function (i) { setS('spread', i); E.revoice(); } })),
            h(SRow, { label: 'Touch velocity', sub: 'Press low on a key to play louder' }, h(Pill, { label: 'Velocity', checked: set.velTouch, onChange: function (v) { setS('velTouch', v); } })),
            h(SRow, { label: 'Any root in key mode', sub: 'Off: keys outside the scale snap to the nearest root in it' }, h(Pill, { label: 'Chromatic', checked: set.chromatic, onChange: function (v) { setS('chromatic', v); } }))),
          h(Section, { title: 'Next chords', id: 'sec-next' },
            h(SRow, { label: 'Ask Claude', sub: E.AI.state === 'off' ? 'Not allowed here, so the built-in suggestions are used' : E.AI.state === 'none' ? 'Not available in this view; the built-in suggestions are used' : 'After you pause, Claude picks three chords to try next (TRY on the display, dots on the keys). It uses your Claude account' },
              h(Pill, { label: 'AI', checked: set.aiNext && E.AI.state !== 'off', onChange: function (v) { setS('aiNext', v); E.refreshSuggestions(); } })),
            h(SRow, { stack: true, label: 'Flavour', sub: 'How safe or surprising the next chords are' }, h(Seg, { label: 'Flavour', items: ['FAMILIAR', 'BALANCED', 'UNEXPECTED'], value: Math.round(set.unexpected * 2), onChange: function (i) { setS('unexpected', i / 2); E.refreshSuggestions(); } }))),
          h(Section, { title: 'Machine', id: 'sec-machine' },
            h(SRow, { stack: true, label: 'Finish' }, h(Seg, { label: 'Finish', items: ['AUTO', 'CHALK', 'GRAPHITE'], value: ['auto', 'chalk', 'graphite'].indexOf(set.finish), onChange: function (i) { setS('finish', ['auto', 'chalk', 'graphite'][i]); applyFinish(); } })),
            h(SRow, { stack: true, label: 'Phone turned sideways', sub: 'Which way you turn the phone when the app keeps the page upright' }, h(Seg, { label: 'Turned', items: ['TOP TO THE LEFT', 'TOP TO THE RIGHT'], value: set.turnRight ? 1 : 0, onChange: function (i) { setS('turnRight', i === 1); } })),
            h(SRow, { label: 'Haptics' }, h(Pill, { label: 'Haptic', checked: set.haptics, onChange: function (v) { setS('haptics', v); syncFeedback(); } })),
            h(SRow, { label: 'Key clicks' }, h(Pill, { label: 'Clicks', checked: set.clicks, onChange: function (v) { setS('clicks', v); syncFeedback(); } })),
            h(HoldBtn, { label: 'Hold to reset all settings', onHold: function () { var keep = set.userSounds; Object.keys(E.DEF).forEach(function (k) { set[k] = E.DEF[k]; }); set.userSounds = keep; E.setBpm(set.bpm); E.applySound(); applyFinish(); syncFeedback(); show('RESET', 'FACTORY SETTINGS'); feel('error'); } })),
          h(Section, { title: 'How it plays', id: 'sec-controls' },
            h('dl', { className: 'combos' },
              [['Pads and keys', 'Like the Orchid: a pad chooses the chord and every key plays it on its own root. Hold a pad while you play, or tap it and it stays lit. Tap the lit pad again for single notes. Press a pad while holding keys to change their chord'],
                ['Key', 'With a key set and no pad lit, every key plays its own chord in that key'],
                ['BPM', 'Tempo, tap tempo (tap the TAP key in time), swing, MIDI clock'],
                ['Lights and buttons', 'A light above a button means that function is on. A button that stays pressed in has its page open on the pads'],
                ['Display', 'The number in the corner is the sound. After you play chords, TRY shows three good chords to play next'],
                ['Tap a button', 'Sound, Perform, FX and Key open their page and it stays open: the chord keys show its settings, the dial sets the one you pick. Tap the button again to close it'],
                ['Long press', 'Sound: next sound. Perform, FX, Key: on or off'], ['Hold + dial', 'Hold a button and turn the dial with another finger; it closes when you let go'],
                ['Sound', E.FACTORY + ' factory sounds plus your own, and an editor on the Sound page: cutoff, resonance, attack, decay, release, lo-fi. Save an edit as a user sound in Options'],
                ['D-50', 'Sounds in the style of the Roland D-50: a short sampled-style attack (breath, chiff, mallet, plucked string, glass, bow) over a synth body and a bell partial'],
                ['JUNO-60', 'Sounds in the style of the Roland Juno-60: one oscillator per voice (saw, PWM pulse, sub, noise), a resonant 24 dB filter and the two-speed chorus'],
                ['DX7', 'Sounds in the style of the Yamaha DX7: up to six FM operators in stacks with feedback, velocity and key scaling. All patches are original; not affiliated with Roland or Yamaha'], ['Perform', 'Block, strums, slop, 14 arps, harp and 12 patterns. Rate, strum, gate, humanize, chance, arp octaves'],
                ['FX', 'Reverb, delay, delay time, feedback, chorus, filter, drive, width. The FX wheel rides the one you picked'], ['Key', 'Scale, root, octave, keyboard split, spread. Or press a key while the page is open to set the root'],
                ['Hold', 'The last chord or note keeps ringing after you let go, until the next one'], ['Dial', 'With no page open it voices the chord: each click lifts the lowest note an octave'],
                ['Wheels', 'Pitch bends two semitones and springs back. FX rides the effect picked under FX'], ['Octave', 'The slider on the rail: left is lower, right is higher, two octaves each way'],
                
                ['Computer keys', 'A W S E D F T G Y H U J play C to B. 1-8 are the eight pads. Esc all off']]
                .map(function (c) { return [h('dt', { key: c[0] + 't' }, c[0]), h('dd', { key: c[0] + 'd' }, c[1])]; }))))));
  }

  /* ================= computer keyboard ================= */
  var KMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };
  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || UI.sheet) return; var k = e.key.toLowerCase(), n = parseInt(k, 10);
    if (KMAP[k] !== undefined) { E.ensureAudio(); markDown('kb' + KMAP[k], 'k'); E.keyDown('k' + k, KMAP[k], 100); }
    else if (n >= 1 && n <= 8) { markDown('c' + (n - 1), 'k'); E.padDown(E.TYPES[n - 1][0]); }
    else if (k === 'escape') E.panic();
    else return;
    E.changed();
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase(), n = parseInt(k, 10);
    if (KMAP[k] !== undefined) { markUp('kb' + KMAP[k], 'k'); E.noteOffRoot('k' + k); }
    else if (n >= 1 && n <= 8) { markUp('c' + (n - 1), 'k'); E.padUp(E.TYPES[n - 1][0]); }
    else return;
    E.changed();
  });
  function dropAll() { down = {}; UI.mod = null; E.changed(); }
  window.addEventListener('blur', dropAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) dropAll(); });

  /* ================= app ================= */
  /* the room the instrument really has: the #app box (inside whatever the host reserves at the top and bottom, such as
     Claude's title bar or the status bar) less the notch insets at the sides */
  var probe = null;
  function insets() {
    if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(probe); }
    var cs = getComputedStyle(probe); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
  }
  function measure() {
    var app = document.getElementById('app'), ins = insets();
    return { w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight, l: ins.l, r: ins.r, ww: window.innerWidth, wh: window.innerHeight };
  }
  function useViewport() {
    var s = useState(measure);
    useEffect(function () {
      var f = function () { s[1](measure()); }, ro = window.ResizeObserver ? new ResizeObserver(f) : null;
      window.addEventListener('resize', f); window.addEventListener('orientationchange', f); if (ro) ro.observe(document.getElementById('app'));
      var t = setTimeout(f, 300);
      return function () { clearTimeout(t); window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f); if (ro) ro.disconnect(); };
    }, []);
    return s[0];
  }
  /* a phone held sideways in an app that keeps the page upright: the instrument is drawn turned a quarter, and every
     pointer position and element box is read back in the instrument's own (unturned) frame, so dials, wheels, the
     octave slider and touch velocity all work exactly as they do the right way up */
  var XF = null;
  (function () {
    var cxD = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'clientX'), cyD = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'clientY'), gbr = Element.prototype.getBoundingClientRect;
    UI.rawRect = function (el) { return gbr.call(el); };
    if (!cxD || !cyD || !cxD.get || typeof DOMMatrix === 'undefined') return;
    function loc(e) { return XF.inv.transformPoint(new DOMPoint(cxD.get.call(e), cyD.get.call(e))); }
    Object.defineProperty(MouseEvent.prototype, 'clientX', { configurable: true, enumerable: true, get: function () { return XF ? loc(this).x : cxD.get.call(this); } });
    Object.defineProperty(MouseEvent.prototype, 'clientY', { configurable: true, enumerable: true, get: function () { return XF ? loc(this).y : cyD.get.call(this); } });
    Element.prototype.getBoundingClientRect = function () {
      var r = gbr.call(this); if (!XF) return r;
      var ps = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(function (q) { return XF.inv.transformPoint(new DOMPoint(q[0], q[1])); });
      var xs = ps.map(function (q) { return q.x; }), ys = ps.map(function (q) { return q.y; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      return new DOMRect(x0, y0, Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0);
    };
  })();
  function isPhone() { try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600; } catch (e) { return false; } }
  function App() {
    var vp = useViewport(), tick = useState(0);
    useEffect(function () {
      var pending = false;
      var off = E.subscribe(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; tick[1](function (x) { return x + 1; }); }); });
      document.getElementById('sc-json').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(function (t) { try { E.loadProject(JSON.parse(t)); applyFinish(); syncFeedback(); } catch (x) { show('NOT A PROJECT', 'CHOOSE A SYNE MOTH FILE'); feel('error'); } }); try { e.target.value = ''; } catch (x) {} });
      E.restore(); applyFinish(); syncFeedback(); E.setBpm(set.bpm); show('SYNE MOTH', 'PICK A PAD', 3000);
      return off;
    }, []);
    /* only a phone held upright is asked to turn; a narrow window anywhere else (a side panel, a small Mac window)
       gets the whole landscape instrument, laid out at 740 x 340 and scaled down to fit */
    /* sv: the landscape room the layout below is sized for. Turned, it is the #app box on its side; otherwise the #app box
       less any notch inset beyond the shell's own 10 px side padding */
    var phone = isPhone(), turned = phone && vp.h > vp.w;
    var sv = turned ? { w: vp.h, h: vp.w } : { w: vp.w - Math.max(0, vp.l - 10) - Math.max(0, vp.r - 10), h: vp.h };
    var narrow = sv.w < 660 || sv.h < 330 || sv.h > sv.w * 1.05;   /* too narrow or too short (a browser's bars in landscape): lay out larger and scale to fit */
    var scale = 1, box = sv;
    if (narrow) { box = { w: 740, h: Math.round(Math.max(340, Math.min(520, 740 * sv.h / sv.w))) }; scale = Math.min(sv.w / box.w, sv.h / box.h, 1); }
    var mx = null;
    if (turned) {
      var sw = box.w * scale, sh = box.h * scale;
      mx = set.turnRight ? new DOMMatrix([0, -scale, scale, 0, (vp.w - sh) / 2, vp.h - (vp.h - sw) / 2]) : new DOMMatrix([0, scale, -scale, 0, vp.w - (vp.w - sh) / 2, (vp.h - sw) / 2]);
    }
    /* pointer positions are in screen space, so the inverse also takes off where the #app box sits on screen */
    var ao = mx && UI.rawRect ? UI.rawRect(document.getElementById('app')) : { left: 0, top: 0 };
    XF = mx ? { m: mx, inv: new DOMMatrix().translate(ao.left, ao.top).multiply(mx).inverse() } : null;
    /* sized from the screen so everything fits one landscape screen */
    var W = Math.min(box.w, 1040) - 20, H = Math.min(box.h, 520) - 12;
    var gap = Math.round(Math.max(6, Math.min(12, H * 0.025)));
    /* the display takes a fixed, modest width; the seven buttons share everything else */
    var lcdW = Math.round(Math.max(180, Math.min(290, W * 0.27))), fgap = 0;
    var fw = Math.floor(Math.max(36, Math.min(76, (W - 24 - 2 * gap - 64 - lcdW - 10) / 7))), pp = Math.round(Math.max(24, Math.min(38, fw - 18, H * 0.095)));
    var plateH = pp + 54, deckH = H - plateH - gap;
    var wheelW = Math.round(Math.max(34, Math.min(46, W * 0.05))), leftW = wheelW * 2 + 14 + 16;
    var ck = Math.round(Math.max(38, Math.min(70, (W - leftW - gap - 7 * 5 - 14) / 8, deckH * 0.3)));
    var dialSize = Math.round(Math.max(44, Math.min(leftW - 34, ck + 10))), ticks = false;
    var shellStyle = mx ? { position: 'absolute', left: 0, top: 0, width: box.w + 'px', height: box.h + 'px', transform: mx.toString(), transformOrigin: '0 0' } : narrow ? { position: 'absolute', left: Math.max(0, (vp.w - box.w * scale) / 2) + 'px', top: Math.max(0, (vp.h - box.h * scale) / 2) + 'px', width: box.w + 'px', height: box.h + 'px', transform: 'scale(' + scale + ')', transformOrigin: '0 0' } : null;
    var inner = h('div', { className: 'shell', style: shellStyle },
      h('div', { className: 'dev', style: { '--gap': gap + 'px', '--fgap': fgap + 'px', '--fw': fw + 'px', '--pp': pp + 'px', '--lcdw': lcdW + 'px', '--ck': ck + 'px' } },
        h('div', { className: 'plate' },
          h('div', { className: 'wordmark', 'aria-label': 'SYNE MOTH' }, h('span', { className: 'wordmark__syne' }, 'SYNE', h('sup', null, '™')), h('span', { className: 'wordmark__model' }, 'MOTH')),
          h('div', { className: 'grp' }, FNS.map(function (d) { return h(FnButton, { key: d[0], def: d }); })),
          h(Display)),
        h('div', { className: 'deck', style: { '--left': leftW + 'px', '--wheel': wheelW + 'px' } },
          h('div', { className: 'dialcell' }, h(Dial, { size: dialSize, ticks: ticks })),
          h(ChordKeys),
          h('div', { className: 'wheels' },
            h(Wheel, { label: 'Pitch', bipolar: true, value: E.wheel.bend, onChange: function (v) { E.setBend(v); E.changed(); } }),
            h(FxWheel)),
          h(Keyboard))),
      narrow && !mx ? null : h(Sheet));
    return mx || narrow ? h('div', { className: cx('fitwrap', mx && 'is-turned') }, inner, narrow && !mx ? h(Sheet) : null) : inner;
  }
  window.SyneChordUI = { HAP: HAP, UI: UI, displayModel: displayModel, dialSpec: dialSpec, PARAMS: PARAMS };
  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
