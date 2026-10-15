/* SYNE CHORD — music core. Pure, deterministic, no audio, no DOM.
   ChordEngine · VoicingEngine · PerformanceEngine · BassEngine · BeatEngine · HarmonySuggestions · SMF + ZIP writers. */
(function (root) {
  'use strict';
  var PPQ = 960, STEP16 = PPQ / 4;

  /* ================= theory ================= */
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  var MIXED = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];
  var FLAT_KEYS_MAJ = { 5: 1, 10: 1, 3: 1, 8: 1, 1: 1, 6: 1 };
  var MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], hminor: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10]
  };
  var MODE_LIST = [['off', 'OFF'], ['major', 'MAJOR'], ['minor', 'MINOR'], ['hminor', 'HARM MIN'], ['dorian', 'DORIAN'], ['mixolydian', 'MIXOLYD'], ['lydian', 'LYDIAN'], ['phrygian', 'PHRYGIAN']];
  var QUALITIES = { major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], power: [0, 7] };
  var EXT_IV = { '6': 9, 'b7': 10, 'maj7': 11, '9': 14 };
  var EXT_ORDER = ['6', 'b7', 'maj7', '9'];

  function mod12(n) { return ((n % 12) + 12) % 12; }
  function relMinorTonicFlat(rootPc, mode) {
    var rel = mode === 'major' || mode === 'lydian' || mode === 'mixolydian' ? rootPc : mod12(rootPc + 3);
    return !!FLAT_KEYS_MAJ[rel];
  }
  function spellPc(pc, key) {
    pc = mod12(pc);
    if (key && key.enabled && key.mode !== 'off') return (relMinorTonicFlat(key.rootPc, key.mode) ? FLAT : SHARP)[pc];
    return MIXED[pc];
  }
  function noteName(m, key) { return spellPc(m, key) + (Math.floor(m / 12) - 1); }

  /* ================= ChordEngine ================= */
  /* explicit quality from held/latched quality keys. Combos are SYNE alternate chords. */
  function comboQuality(set, susType) {
    var has = function (k) { return set.indexOf(k) >= 0; };
    if (has('MAJ') && has('DIM')) return 'aug';
    if (has('MIN') && has('SUS')) return 'sus2';
    if (has('MAJ') && has('MIN')) return 'power';
    if (has('SUS') && has('DIM')) return susType === 'sus2' ? 'sus4' : 'sus2';
    if (has('MAJ')) return 'major';
    if (has('MIN')) return 'minor';
    if (has('SUS')) return susType || 'sus4';
    if (has('DIM')) return 'dim';
    return null;
  }
  /* b7 and maj7 together: latest wins unless experimental clusters are on */
  function normalizeExtensions(list, latest, clusters) {
    var out = EXT_ORDER.filter(function (e) { return list.indexOf(e) >= 0; });
    if (!clusters && out.indexOf('b7') >= 0 && out.indexOf('maj7') >= 0) {
      var drop = latest === 'maj7' ? 'b7' : 'maj7';
      out = out.filter(function (e) { return e !== drop; });
    }
    return out;
  }
  function scaleOf(key) { return MODES[key.mode] || MODES.major; }
  /* Key Mode: a chromatic root outside the scale snaps to the nearest diatonic degree (down on a tie) unless chromaticAllowed */
  function snapToScale(pc, key) {
    var sc = scaleOf(key), rel = mod12(pc - key.rootPc);
    if (sc.indexOf(rel) >= 0) return { pc: pc, snapped: false, degree: sc.indexOf(rel) };
    for (var d = 1; d < 6; d++) {
      var lo = mod12(rel - d), hi = mod12(rel + d);
      if (sc.indexOf(lo) >= 0) return { pc: mod12(key.rootPc + lo), snapped: true, degree: sc.indexOf(lo) };
      if (sc.indexOf(hi) >= 0) return { pc: mod12(key.rootPc + hi), snapped: true, degree: sc.indexOf(hi) };
    }
    return { pc: pc, snapped: false, degree: 0 };
  }
  /* diatonic chord computed from pitch classes (not a canned quality map) */
  function diatonic(degree, key, seventh) {
    var sc = scaleOf(key), n = sc.length;
    function iv(k) { var d = degree + k, o = Math.floor(d / n) * 12; return sc[d % n] + o - sc[degree]; }
    var third = iv(2), fifth = iv(4), q;
    if (third === 4 && fifth === 7) q = 'major'; else if (third === 3 && fifth === 7) q = 'minor';
    else if (third === 3 && fifth === 6) q = 'dim'; else if (third === 4 && fifth === 8) q = 'aug'; else q = 'major';
    var ext = [];
    if (seventh) { var sv = iv(6); ext.push(sv === 11 ? 'maj7' : sv === 10 ? 'b7' : '6'); }
    return { rootPc: mod12(key.rootPc + sc[degree]), quality: q, extensions: ext };
  }
  /* the one place a gesture becomes a chord */
  function chordFrom(o) {
    /* o: { rootPc, held:[], latched:quality|null, ext:[], key, playstyle, susType, clusters, latestExt, chromaticAllowed } */
    var key = o.key || { enabled: false }, pc = o.rootPc, explicitQ = o.held && o.held.length ? comboQuality(o.held, o.susType) : null;
    var ext = normalizeExtensions(o.ext || [], o.latestExt, o.clusters), snapped = false;
    if (!explicitQ && key.enabled && key.mode !== 'off') {
      var sn = o.chromaticAllowed ? { pc: pc, snapped: false, degree: scaleOf(key).indexOf(mod12(pc - key.rootPc)) } : snapToScale(pc, key);
      if (sn.degree >= 0) {
        var wantsSeventh = ext.indexOf('b7') >= 0 || ext.indexOf('maj7') >= 0;
        var d = diatonic(sn.degree, key, wantsSeventh);
        var rest = ext.filter(function (e) { return e !== 'b7' && e !== 'maj7'; });
        return { rootPc: d.rootPc, quality: d.quality, extensions: normalizeExtensions(d.extensions.concat(rest), null, true), source: 'key-mode', snapped: sn.snapped, pressedPc: pc };
      }
    }
    var q = explicitQ || (o.playstyle === 'instant' ? o.latched : null);
    if (!q) return { rootPc: pc, quality: 'single', extensions: [], source: 'manual', snapped: false, pressedPc: pc };
    return { rootPc: pc, quality: q, extensions: ext, source: 'manual', snapped: false, pressedPc: pc };
  }
  function intervalsOf(spec) {
    if (spec.quality === 'single') return [0];
    var iv = QUALITIES[spec.quality].slice();
    (spec.extensions || []).forEach(function (e) { iv.push(EXT_IV[e]); });
    return iv.sort(function (a, b) { return a - b; });
  }
  function pcsOf(spec) { var s = {}; intervalsOf(spec).forEach(function (i) { s[mod12(spec.rootPc + i)] = 1; }); return Object.keys(s).map(Number).sort(function (a, b) { return a - b; }); }
  function suffix(spec) {
    var q = spec.quality, e = spec.extensions || [], has = function (x) { return e.indexOf(x) >= 0; };
    var s6 = has('6'), s7 = has('b7'), m7 = has('maj7'), s9 = has('9'), both7 = s7 && m7;
    if (q === 'single') return '';
    if (q === 'power') return '5' + (s9 ? '(add9)' : '') + (s6 ? '(add6)' : '');
    var base;
    if (q === 'major') {
      if (both7) base = '7(maj7)';
      else if (s7) base = s9 ? '9' : '7';
      else if (m7) base = s9 ? 'maj9' : 'maj7';
      else if (s6) base = s9 ? '6/9' : '6';
      else base = s9 ? 'add9' : '';
      if (s6 && (s7 || m7)) base += '(add13)';
      return base;
    }
    if (q === 'minor') {
      if (both7) base = 'm7(maj7)';
      else if (s7) base = s9 ? 'm9' : 'm7';
      else if (m7) base = s9 ? 'm(maj9)' : 'm(maj7)';
      else if (s6) base = s9 ? 'm6/9' : 'm6';
      else base = s9 ? 'm(add9)' : 'm';
      if (s6 && (s7 || m7)) base += '(add13)';
      return base;
    }
    if (q === 'dim') {
      if (s7 && !m7) base = 'm7♭5'; else if (s6 && !s7 && !m7) base = 'dim7'; else if (m7) base = 'dim(maj7)'; else base = 'dim';
      if (s6 && (s7 || m7)) base += '(add6)';
      return base + (s9 ? '(add9)' : '');
    }
    if (q === 'aug') {
      base = s7 ? 'aug7' : m7 ? 'maj7#5' : 'aug';
      return base + (s6 ? '(add6)' : '') + (s9 ? '(add9)' : '');
    }
    /* sus */
    var su = q === 'sus2' ? 'sus2' : 'sus4';
    if (s7) base = (s9 ? '9' : '7') + su; else if (m7) base = (s9 ? 'maj9' : 'maj7') + su; else if (s6) base = '6' + su; else base = su;
    if (s9 && !s7 && !m7) base += '(add9)';
    if (s6 && (s7 || m7)) base += '(add6)';
    return base;
  }
  function chordName(spec, key, bassPc) {
    var n = spellPc(spec.rootPc, key) + suffix(spec);
    if (bassPc !== undefined && bassPc !== null && mod12(bassPc) !== mod12(spec.rootPc)) n += '/' + spellPc(bassPc, key);
    return n;
  }

  /* ================= VoicingEngine ================= */
  /* keyboard modes. OCTAVE: one octave, each root in a comfortable window (F3..E4) so chords sit together.
     SPLIT: a two-octave split, the left six keys (C..F) an octave below the right six (F#..B): C3..F3 and F#4..B4. */
  function rootMidi(pc, octave, kb) {
    pc = mod12(pc);
    var r = kb === 'split' ? (pc < 6 ? 48 + pc : 60 + pc) : 53 + mod12(pc - 5);
    return r + 12 * (octave || 0);
  }
  function baseNotes(spec, octave, kb) {
    var r = rootMidi(spec.rootPc, octave, kb);
    return intervalsOf(spec).map(function (i) { return r + i; });
  }
  function sortN(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  /* +1: lowest goes up an octave. -1: highest comes down. Pitch classes and cardinality preserved. */
  function invert(notes, step) {
    var n = sortN(notes);
    if (n.length < 2) return n;
    for (var i = 0; i < Math.abs(step); i++) {
      if (step > 0) { var lo = n.shift(); n.push(lo + 12); }
      else { var hi = n.pop(); n.unshift(hi - 12); }
      n = sortN(n);
    }
    return n;
  }
  function spread(notes, amt) {
    if (!amt || notes.length < 3) return notes;
    var n = sortN(notes);
    for (var i = 1; i < n.length - (amt >= 2 ? 0 : 1); i += 2) n[i] += 12;
    return sortN(n);
  }
  function keepInRange(n, lo, hi) {
    n = sortN(n); var g = 0;
    while (n[n.length - 1] > hi && n[0] - 12 >= lo && g++ < 8) n = n.map(function (x) { return x - 12; });
    while (n[0] < lo && n[n.length - 1] + 12 <= hi && g++ < 16) n = n.map(function (x) { return x + 12; });
    return n.map(function (x) { return Math.max(0, Math.min(127, x)); });
  }
  function leadCost(prev, cand) {
    if (!prev || !prev.length) return 0;
    var c = 0, used = {};
    cand.forEach(function (x) { var best = 1e9, bi = -1; prev.forEach(function (p, j) { var d = Math.abs(p - x) + (used[j] ? 2 : 0); if (d < best) { best = d; bi = j; } }); used[bi] = 1; c += best; });
    var lo = cand[0], hi = cand[cand.length - 1];
    c += 0.3 * (Math.max(0, 48 - lo) + Math.max(0, hi - 86));
    return c;
  }
  function voiceLead(prev, base) {
    var best = null, bc = 1e9;
    for (var k = -4; k <= 4; k++) {
      var c = invert(base, k), cost = leadCost(prev, c) + Math.abs(k) * 0.01;
      if (cost < bc) { bc = cost; best = c; }
    }
    return best;
  }
  function render(spec, v, prevNotes) {
    /* v: { step, octave, spread, smooth, kb } */
    v = v || {};
    var base = baseNotes(spec, v.octave || 0, v.kb);
    var n = v.smooth && prevNotes && prevNotes.length && spec.quality !== 'single' ? voiceLead(prevNotes, base) : base;
    n = invert(n, v.step || 0);
    n = spread(n, v.spread || 0);
    return keepInRange(n, 24, 108);
  }

  /* ================= Bass ================= */
  /* the spec's six modes. FOLLOW: one bass note for each chord. UNISON: single notes too. SINGLES: a single note plays the bass only.
     SOLO: the lead is muted. PATTERN: step motifs from root, fifth and octave. */
  var BASS_MODES = ['OFF', 'FOLLOW', 'UNISON', 'SINGLES', 'SOLO', 'PATTERN'];
  var BASS_PATTERNS = [
    { id: 'pulse', label: 'PULSE', seq: [0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'root5', label: 'ROOT-5', seq: [0, null, 7, null, 12, null, 7, null] },
    { id: 'octave', label: 'OCTAVES', seq: [0, 12, 0, 12, 0, 12, 0, 12] },
    { id: 'drive', label: 'DRIVE', seq: [0, 0, 12, 0, 0, 7, 0, 12] },
    { id: 'push', label: 'PUSH', seq: [0, null, null, 0, null, 7, null, 12] },
    { id: 'walk', label: 'WALK', seq: [0, null, 4, null, 7, null, 9, null] }
  ];
  function bassNoteFor(spec, notes, mode, octave, step) {
    var pc = spec.explicitBassPc !== undefined ? spec.explicitBassPc : spec.rootPc, oct = octave || 0;
    if (step && spec.quality !== 'single') { /* bass voicing: walk the chord tones, C -> C/E -> C/G ... */
      var tones = []; intervalsOf(spec).forEach(function (i) { var t = mod12(i); if (tones.indexOf(t) < 0) tones.push(t); });
      var n = tones.length, idx = ((step % n) + n) % n; oct += Math.floor(step / n);
      pc = mod12(spec.rootPc + tones[idx]);
    }
    return Math.max(24, Math.min(60, 33 + mod12(pc - 9) + 12 * oct));  /* A1..G#2 */
  }
  /* does this mode sound a bass note for this gesture, and does the lead play? */
  function bassPlan(mode, single) {
    switch (mode) {
      case 'FOLLOW': return { bass: !single, lead: true };
      case 'UNISON': return { bass: true, lead: true };
      case 'SINGLES': return { bass: true, lead: !single };
      case 'SOLO': return { bass: true, lead: false };
      case 'PATTERN': return { bass: true, lead: true, pattern: true };
      default: return { bass: false, lead: true };
    }
  }
  /* bass events in a tick window. end null = still held. */
  function bassEvents(mode, note, start, end, from, to, fifthOk, patIdx, third) {
    var out = [];
    if (mode === 'OFF') return out;
    if (mode !== 'PATTERN') {
      if (start >= from && start < to) out.push({ pitch: note, on: start, off: end, vel: 104 });
      return out;
    }
    var stepT = PPQ / 2, seq = (BASS_PATTERNS[patIdx || 0] || BASS_PATTERNS[0]).seq;
    var k0 = Math.max(0, Math.ceil((from - start) / stepT));
    for (var k = k0; ; k++) {
      var on = start + k * stepT; if (on >= to) break; if (end !== null && on >= end) break;
      var iv = seq[k % 8]; if (iv === null) continue;
      if (iv === 7 && fifthOk === false) iv = 12;
      if (iv === 4 && third !== undefined) iv = third;
      out.push({ pitch: note + iv, on: on, off: Math.min(on + stepT * 0.8, end === null ? Infinity : end), vel: k % 2 ? 92 : 108 });
    }
    return out;
  }

  /* ================= PerformanceEngine ================= */
  var RATES = [{ id: '1/2', t: PPQ * 2 }, { id: '1/4', t: PPQ }, { id: '1/8', t: PPQ / 2 }, { id: '1/8T', t: PPQ / 3 }, { id: '1/16', t: PPQ / 4 }, { id: '1/16T', t: PPQ / 6 }, { id: '1/32', t: PPQ / 8 }];
  var RATE_DEFAULT = 4;
  function P(id, label, len, steps, rateT) { return { id: id, label: label, lengthSteps: len, steps: steps, rateTicks: rateT || null }; }
  function stp(s, sel, dur, vel, oct) { return { s: s, sel: sel, dur: dur || 1, vel: vel || 100, oct: oct || 0 }; }
  var ALL = { kind: 'all' }, TOP = { kind: 'top' }, BOT = { kind: 'bottom' };
  function IX(i) { return { kind: 'index', index: i }; }
  var PATTERNS = [
    P('pulse8', 'PULSE 8THS', 16, [0, 2, 4, 6, 8, 10, 12, 14].map(function (s) { return stp(s, ALL, 0.8, s % 4 ? 88 : 108); })),
    P('offbeat', 'OFFBEAT', 16, [2, 6, 10, 14].map(function (s) { return stp(s, ALL, 0.6, 104); })),
    P('332', '3-3-2', 16, [0, 3, 6, 8, 11, 14].map(function (s, i) { return stp(s, ALL, 1.4, i % 3 === 0 ? 110 : 92); })),
    P('rolling', 'ROLLING', 16, Array.from({ length: 16 }, function (_, s) { return stp(s, IX(s), 0.9, s % 4 ? 84 : 104); })),
    P('basstop', 'BASS + TOP', 16, [stp(0, BOT, 3, 110), stp(4, TOP, 2, 92), stp(8, BOT, 3, 104), stp(12, TOP, 2, 92), stp(14, IX(1), 1, 80)]),
    P('glass', 'BROKEN GLASS', 16, [stp(0, IX(0), 1, 104), stp(2, IX(2), 1, 86), stp(5, TOP, 2, 96), stp(9, IX(1), 1, 84), stp(11, IX(3), 1, 90), stp(14, TOP, 1, 80, 1)]),
    P('dream', 'DREAM PULSE', 16, [0, 4, 6, 10, 12].map(function (s, i) { return stp(s, ALL, i % 2 ? 1.8 : 3.6, i === 0 ? 86 : 70); })),
    P('triplet', 'TRIPLET MOTION', 12, Array.from({ length: 12 }, function (_, s) { var up = [0, 1, 2, 3, 2, 1]; return stp(s, IX(up[s % 6]), 0.85, s % 3 ? 82 : 104); }), PPQ / 3),
    P('skank', 'SKANK', 16, [2, 6, 10, 14].map(function (s) { return stp(s, ALL, 0.35, 108); }).concat([stp(0, BOT, 1.5, 96), stp(8, BOT, 1.5, 90)])),
    P('clave', 'CLAVE 3-2', 16, [0, 3, 6, 10, 12].map(function (s) { return stp(s, ALL, 0.9, 104); })),
    P('gallop', 'GALLOP', 16, [0, 3, 4, 7, 8, 11, 12, 15].map(function (s, i) { return stp(s, i % 2 ? TOP : ALL, 0.7, i % 2 ? 84 : 106); })),
    P('cascade', 'CASCADE', 16, Array.from({ length: 16 }, function (_, s) { var d = [3, 2, 1, 0]; return stp(s, IX(d[s % 4] + (s >= 8 ? 1 : 0)), 1.6, s % 4 ? 78 : 100, s >= 8 ? 1 : 0); }))
  ];
  var ARPS = [
    ['arpUp', 'ARP UP'], ['arpDown', 'ARP DOWN'], ['arpUpDown', 'ARP UP/DN'], ['arpUpDownX', 'ARP UP/DN+'], ['arpDownUp', 'ARP DN/UP'],
    ['arpConverge', 'ARP CONVERGE'], ['arpDiverge', 'ARP DIVERGE'], ['arpPinky', 'ARP PINKY'], ['arpThumb', 'ARP THUMB'],
    ['arpRandom', 'ARP RANDOM'], ['arpWalk', 'ARP WALK'], ['arpChord', 'ARP CHORD'], ['arp2', 'ARP 2OCT'], ['arp3', 'ARP 3OCT']
  ];
  var PERF_MODES = [
    { id: 'block', label: 'BLOCK', kind: 'hold' }, { id: 'strumUp', label: 'STRUM UP', kind: 'hold' }, { id: 'strumDown', label: 'STRUM DOWN', kind: 'hold' },
    { id: 'strum2', label: 'STRUM 2OCT', kind: 'hold' }, { id: 'slop', label: 'SLOP', kind: 'hold' }
  ].concat(ARPS.map(function (a) { return { id: a[0], label: a[1], kind: 'grid', arp: true }; }))
    .concat([{ id: 'harp', label: 'HARP', kind: 'shot' }, { id: 'harpLoop', label: 'HARP LOOP', kind: 'grid' }])
    .concat(PATTERNS.map(function (p, i) { return { id: 'pat:' + p.id, label: 'P' + (i + 1) + ' ' + p.label, kind: 'grid', pattern: p }; }));
  function modeIndex(id) { for (var i = 0; i < PERF_MODES.length; i++) if (PERF_MODES[i].id === id) return i; return 0; }

  function mulberry(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seeded(seed, idx) { return mulberry((seed * 2654435761 + idx * 40503) >>> 0)(); }
  function resolveSelector(sel, notes) {
    var n = sortN(notes), N = n.length; if (!N) return [];
    switch (sel.kind) {
      case 'all': return n;
      case 'top': return [n[N - 1]];
      case 'bottom': return [n[0]];
      case 'rest': return [];
      case 'index': return [n[((sel.index % N) + N) % N]];
      default: return [n[0]];
    }
  }
  /* the note pool an arp walks: the chord across `oct` octaves */
  function arpPool(notes, oct) { var n = sortN(notes), out = []; for (var o = 0; o < Math.max(1, oct || 1); o++) n.forEach(function (x) { if (x + 12 * o <= 108) out.push(x + 12 * o); }); return out; }
  /* one cycle of the arp, as a list of pitches (or arrays of pitches for ARP CHORD) */
  function arpOrder(id, notes, cycle, seed, oct) {
    var fixed = id === 'arp2' ? 2 : id === 'arp3' ? 3 : 0;
    var n = arpPool(notes, fixed || oct || 1), N = n.length, rev = n.slice().reverse(), i;
    switch (id) {
      case 'arpDown': return rev;
      case 'arpUpDown': return N < 2 ? n : n.concat(n.slice(1, N - 1).reverse());
      case 'arpUpDownX': return N < 2 ? n : n.concat(rev);
      case 'arpDownUp': return N < 2 ? rev : rev.concat(n.slice(1, N - 1));
      case 'arpConverge': var cv = []; for (i = 0; i < Math.ceil(N / 2); i++) { cv.push(n[i]); if (N - 1 - i !== i) cv.push(n[N - 1 - i]); } return cv;
      case 'arpDiverge': var md = Math.floor((N - 1) / 2), dv = [n[md]]; for (i = 1; dv.length < N; i++) { if (md + i < N) dv.push(n[md + i]); if (md - i >= 0 && dv.length < N) dv.push(n[md - i]); } return dv;
      case 'arpPinky': var pk = []; n.slice(0, N - 1).forEach(function (x) { pk.push(x, n[N - 1]); }); return N < 2 ? n : pk;
      case 'arpThumb': var th = []; n.slice(1).forEach(function (x) { th.push(n[0], x); }); return N < 2 ? n : th;
      case 'arpRandom': /* a shuffled bag per cycle: every note once per window */
        var bag = n.slice(), r = mulberry((seed + cycle * 7919) >>> 0);
        for (i = bag.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
        return bag;
      case 'arpChord': return N < 2 ? n : [n[0], n.slice(1)];
      default: return n;
    }
  }
  /* the random walk needs its own state: step +/-1 through the pool, deterministic from the seed */
  function walkIndex(seed, k, N) { var p = 0; for (var i = 1; i <= k; i++) { p += seeded(seed, i) < 0.5 ? -1 : 1; if (p < 0) p = 1; if (p >= N) p = N - 2; } return Math.max(0, Math.min(N - 1, p)); }
  function msToTicks(ms, bpm) { return ms * bpm * PPQ / 60000; }
  /* Swing: offbeat 16ths move later; bar length unchanged. Piecewise-linear inside each 8th. */
  function swingTick(t, swing, origin) {
    if (!swing || swing <= 0.5) return t;
    var o = origin || 0, rel = t - o, pair = 2 * STEP16, base = Math.floor(rel / pair) * pair, x = rel - base, d = (swing - 0.5) * pair;
    var y = x < STEP16 ? x * (STEP16 + d) / STEP16 : STEP16 + d + (x - STEP16) * (STEP16 - d) / STEP16;
    return o + base + y;
  }
  /* how long one cycle of a grid mode lasts, for one-shot patterns */
  function cycleTicks(m, notes, o) {
    if (m.pattern) return (m.pattern.rateTicks || o.rateTicks || STEP16) * m.pattern.lengthSteps;
    if (m.id === 'harpLoop') return null;
    return (o.rateTicks || STEP16) * Math.max(1, arpOrder(m.id, notes, 0, o.seed || 1, o.arpOct).length);
  }
  /* Events whose onset lies in [from, to). end null means the gesture is still held. Every event: pitch, on, off (tick or null = until release), vel.
     opts: { mode, notes, start, end, from, to, rateTicks, gate, strumMs, bpm, seed, vel, swing, origin, arpOct, humanize, probability, oneShot } */
  function perfEvents(o) {
    var m = PERF_MODES.find(function (x) { return x.id === o.mode; }) || PERF_MODES[0];
    var notes = sortN(o.notes || []), out = [], vel = o.vel || 100, end = o.end === undefined ? null : o.end;
    if (!notes.length) return out;
    if (o.oneShot && m.kind === 'grid') { var cl = cycleTicks(m, notes, o); if (cl) end = end === null ? o.start + cl : Math.min(end, o.start + cl); }
    var hum = o.humanize || 0, prob = o.probability === undefined ? 1 : o.probability, seed = o.seed || 1;
    function push(p, on, off, v, idx) {
      if (idx !== undefined && m.kind === 'grid') {
        if (prob < 1 && idx > 0 && seeded(seed + 101, idx) > prob) return;
        if (hum > 0) { on += msToTicks((seeded(seed + 202, idx) * 2 - 1) * 18 * hum, o.bpm || 120); v += (seeded(seed + 303, idx) * 2 - 1) * 24 * hum; on = Math.max(o.start, on); if (off !== null) off = Math.max(on + 10, off); }
      }
      if (on >= o.from && on < o.to && (end === null || on < end || on === o.start)) out.push({ pitch: Math.max(0, Math.min(127, p)), on: on, off: off === null ? end : (end === null ? off : Math.min(off, end)), vel: Math.max(1, Math.min(127, Math.round(v))) });
    }
    if (m.kind === 'hold') {
      var list = notes, sp = msToTicks(o.strumMs || 25, o.bpm || 120);
      if (m.id === 'strumDown') list = notes.slice().reverse();
      if (m.id === 'strum2') list = notes.concat(notes.map(function (x) { return x + 12; })).filter(function (x, i, a) { return x <= 108 && a.indexOf(x) === i; }).slice(0, 10);
      list.forEach(function (p, i) {
        var on = o.start + (m.id === 'block' ? 0 : i * sp), v = vel;
        if (m.id === 'slop') { on += msToTicks((seeded(seed, i * 2) * 2 - 1) * 12, o.bpm || 120) + i * sp * 0.4; v += (seeded(seed, i * 2 + 1) * 2 - 1) * 8; on = Math.max(o.start, on); }
        push(p, on, null, m.id === 'block' ? v : v - i * 2);
      });
      return out;
    }
    var harpPool = function () { var pool = []; [0, 12, 24].forEach(function (oc) { notes.forEach(function (x) { if (x + oc <= 108) pool.push(x + oc); }); }); return pool; };
    var hs = msToTicks(o.strumMs ? Math.max(18, o.strumMs) : 40, o.bpm || 120);
    if (m.kind === 'shot') { /* harp: one finite sweep up three octaves */
      harpPool().forEach(function (p, i) { push(p, o.start + i * hs, o.start + i * hs + PPQ * 1.5, vel - i); });
      return out;
    }
    if (m.id === 'harpLoop') { /* the sweep repeats every bar-length phrase while held */
      var pool = harpPool(), period = Math.max(PPQ, Math.ceil((pool.length * hs + PPQ / 2) / PPQ) * PPQ);
      for (var c2 = Math.max(0, Math.floor((o.from - o.start) / period) - 1); ; c2++) {
        var base2 = o.start + c2 * period; if (base2 >= o.to) break; if (end !== null && base2 >= end) break;
        pool.forEach(function (p, i) { push(p, base2 + i * hs, base2 + i * hs + PPQ, vel - i, c2 * 100 + i); });
      }
      return out;
    }
    var gate = o.gate === undefined ? 0.6 : o.gate;
    if (m.pattern) {
      var pat = m.pattern, rt = pat.rateTicks || o.rateTicks || STEP16, L = pat.lengthSteps;
      var c0 = Math.max(0, Math.floor((o.from - o.start) / (rt * L)) - 1);
      for (var c = c0; ; c++) {
        var cyc = o.start + c * rt * L; if (cyc >= o.to) break; if (end !== null && cyc >= end) break;
        pat.steps.forEach(function (st, si) {
          var on0 = cyc + st.s * rt, on = rt === STEP16 ? swingTick(on0, o.swing, o.origin) : on0;
          resolveSelector(st.sel, notes).forEach(function (p, pi) { push(p + 12 * st.oct, on, on + Math.max(0.2 * rt, st.dur * rt * gate / 0.6), vel * st.vel / 100, (c * 64 + si) * 8 + pi); });
        });
      }
      return out;
    }
    var r = o.rateTicks || STEP16, k0 = Math.max(0, Math.floor((o.from - o.start) / r));
    for (var k = k0; ; k++) {
      var on1 = o.start + k * r; if (on1 >= o.to) break; if (end !== null && on1 >= end && k > 0) break;
      var ord0 = arpOrder(m.id, notes, 0, seed, o.arpOct), L2 = Math.max(1, ord0.length), cyc2 = Math.floor(k / L2);
      var ord = m.id === 'arpRandom' ? arpOrder(m.id, notes, cyc2, seed, o.arpOct) : ord0;
      var p2 = m.id === 'arpWalk' ? ord[walkIndex(seed, k, L2)] : ord[k % L2];
      var onS = (r === STEP16 || r === PPQ / 2) ? swingTick(on1, o.swing, o.origin) : on1;
      var vv = vel * (k % 4 === 0 ? 1 : 0.86);
      (Array.isArray(p2) ? p2 : [p2]).forEach(function (pp, pi) { push(pp, onS, onS + r * gate, Array.isArray(p2) ? vv * 0.85 : vv, k * 8 + pi); });
    }
    return out;
  }

  /* ================= BeatEngine ================= */
  /* drum voices: 0 kick 1 snare 2 closed hat 3 open hat 4 clap 5 rim 6 tom 7 shaker */
  var DRUM_GM = [36, 38, 42, 46, 39, 37, 45, 70];
  function bp(str) { return str.replace(/ /g, '').split('').map(function (c) { return c === 'x' ? 1 : c === 'o' ? 0.6 : 0; }); }
  function B(id, label, rows) { return { id: id, label: label, rows: rows.map(function (r) { return r ? bp(r) : null; }) }; }
  var _ = null;
  var BEATS = [
    B('four', 'FOUR FLOOR', ['x...x...x...x...', '....x.......x...', '..x...x...x...x.', '..............o.', _, _, _, 'o.o.o.o.o.o.o.o.']),
    B('boom', 'BOOM BAP', ['x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', _, _, '..........o.....', _, _]),
    B('half', 'HALF TIME', ['x.........x.....', '........x.......', 'x.x.x.x.x.x.x.x.', '......o.......o.', _, _, _, _]),
    B('motor', 'MOTORIK', ['x...x...x...x...', '....x.......x...', 'xxxxxxxxxxxxxxxx', _, _, _, _, _]),
    B('bossa', 'BOSSA', ['x..x x..x x..x x', _, 'x.x.x.x.x.x.x.x.', _, _, 'x..x..x...x..x..', _, _]),
    B('shuffle', 'SHUFFLE', ['x.....x.x.......', '....x.......x...', 'x..x..x..x..x..x', _, _, _, _, _]),
    B('breaks', 'BREAKS', ['x.x.......x.....', '....x..o.o..x...', 'x.x.x.x.x.x.x.x.', _, _, _, _, '..o...o...o...o.']),
    B('lofi', 'LO-FI', ['x......xx.......', '....x.......x...', 'x.xox.xox.xox.xo', _, '............o...', _, '..............o.', _]),
    B('disco', 'DISCO', ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..o...o...o...o.', '....x.......x...', _, _, _]),
    B('funk', 'FUNK', ['x..x..x...x..x..', '....x..o.o..x..o', 'xxxxxxxxxxxxxxxx', _, _, _, _, _]),
    B('trap', 'TRAP', ['x......x..x.....', '........x.......', 'x.x.xxx.x.x.xx.x', _, '........x.......', _, _, _]),
    B('dembow', 'DEMBOW', ['x...x...x...x...', '...x..x....x..x.', 'x.x.x.x.x.x.x.x.', _, _, _, _, 'o.o.o.o.o.o.o.o.']),
    B('garage', '2-STEP', ['x.........x.....', '....x.......x...', '..x.x.x...x.x.x.', _, _, '.......o.......o', _, '.o.o.o.o.o.o.o.o']),
    B('dnb', 'BREAKBEAT', ['x.........x.....', '....x.......x..o', 'x.x.x.x.x.x.x.x.', _, _, _, _, _]),
    B('reggae', 'ONE DROP', ['........x.......', '........x.......', 'x.x.x.x.x.x.x.x.', _, _, '....x.......x...', _, _]),
    B('afro', 'AFRO', ['x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', _, _, 'x..x..x...x.x...', '......x.......x.', 'oxoxoxoxoxoxoxox']),
    B('house', 'HOUSE', ['x...x...x...x...', _, '..x...x...x...x.', '..x...x...x...x.', '....x.......x...', _, _, 'x.x.x.x.x.x.x.x.']),
    B('march', 'MARCH', ['x.......x.......', 'x.xxx.x.x.xxx.x.', _, _, _, _, _, _]),
    B('waltz', 'WALTZ 3/4', ['x...........', '....x...x...', 'x.x.x.x.x.x.', _, _, _, _, _]),
    B('brush', 'BRUSHES', ['x.......x.......', _, _, _, _, '....x.......x...', _, 'xoxxoxxoxxoxxoxx'])
  ];
  /* stepsPerBar: 16 in 4/4, 12 in 3/4 and 6/8; a pattern shorter or longer than the bar wraps on its own length */
  function beatEvents(beatIdx, origin, from, to, swing, stepsPerBar) {
    var b = BEATS[beatIdx]; if (!b) return [];
    var spb = stepsPerBar || 16, out = [], k0 = Math.max(0, Math.floor((from - origin) / STEP16));
    for (var k = k0; ; k++) {
      var t0 = origin + k * STEP16; if (t0 >= to) break;
      var t = swingTick(t0, swing, origin); if (t < from) continue;
      var pos = k % spb;
      b.rows.forEach(function (row, voice) { if (!row) return; var v = row[pos % row.length]; if (v) out.push({ voice: voice, on: t, vel: Math.round(v * 112 + (pos === 0 ? 12 : pos % 4 === 0 ? 6 : 0)) }); });
    }
    return out;
  }
  function barTicks(num, den) { return Math.round((num || 4) * PPQ * 4 / (den || 4)); }

  /* ================= HarmonySuggestions (rule-based, explainable) ================= */
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function specKey(s) { return s.rootPc + ':' + s.quality + ':' + (s.extensions || []).join(','); }
  function inferKey(history) {
    if (!history.length) return { rootPc: 0, mode: 'major', enabled: true, inferred: true };
    var best = null, bs = -1e9;
    for (var t = 0; t < 12; t++) ['major', 'minor'].forEach(function (md) {
      var sc = MODES[md].map(function (x) { return mod12(x + t); }), s = 0;
      history.forEach(function (h, i) { var w = 0.6 + 0.4 * (i + 1) / history.length; var p = pcsOf(h); s += w * p.filter(function (x) { return sc.indexOf(x) >= 0; }).length / p.length; });
      if (mod12(history[0].rootPc) === t) s += 0.35;
      if (md === 'minor' && history[0].quality === 'minor' && history[0].rootPc === t) s += 0.2;
      if (md === 'major' && history[0].quality === 'major' && history[0].rootPc === t) s += 0.2;
      if (s > bs) { bs = s; best = { rootPc: t, mode: md, enabled: true, inferred: true }; }
    });
    return best;
  }
  function romanFor(spec, key) {
    var rel = mod12(spec.rootPc - key.rootPc), sc = scaleOf(key), deg = sc.indexOf(rel), r;
    if (deg >= 0) r = ROMAN[deg];
    else { var up = sc.indexOf(mod12(rel - 1)), dn = sc.indexOf(mod12(rel + 1)); r = dn >= 0 ? '♭' + ROMAN[dn] : up >= 0 ? '#' + ROMAN[up] : '?'; }
    if (spec.quality === 'minor' || spec.quality === 'dim') r = r.toLowerCase();
    if (spec.quality === 'dim') r += '°'; if (spec.quality === 'aug') r += '+';
    if ((spec.extensions || []).indexOf('b7') >= 0) r += '7';
    return r;
  }
  function fnOf(spec, key) {
    var rel = mod12(spec.rootPc - key.rootPc);
    if (rel === 0 || rel === 9 || rel === 4 || rel === 3) return 'T';
    if (rel === 5 || rel === 2 || rel === 8) return 'S';
    if (rel === 7 || rel === 11 || rel === 10) return 'D';
    return 'X';
  }
  var FLOW = { T: { T: 0.45, S: 0.85, D: 0.65, X: 0.4 }, S: { T: 0.6, S: 0.4, D: 0.95, X: 0.45 }, D: { T: 1, S: 0.25, D: 0.35, X: 0.4 }, X: { T: 0.7, S: 0.6, D: 0.6, X: 0.3 } };
  function suggest(history, keyIn, opts) {
    opts = opts || {};
    var u = opts.unexpected === undefined ? 0.5 : opts.unexpected, seed = opts.seed || 1;
    var key = keyIn && keyIn.enabled && keyIn.mode !== 'off' ? keyIn : inferKey(history);
    var minorish = key.mode === 'minor' || key.mode === 'hminor' || key.mode === 'phrygian' || key.mode === 'dorian';
    var last = history.length ? history[history.length - 1] : null, cands = [];
    function add(spec, reason, diat) { spec.extensions = spec.extensions || []; cands.push({ spec: spec, reason: reason, diatonic: diat }); }
    var sc = scaleOf(key);
    for (var d = 0; d < sc.length; d++) {
      var tri = diatonic(d, key, false); add({ rootPc: tri.rootPc, quality: tri.quality }, null, true);
      if (d === 4 || d === 1) { var sv = diatonic(d, key, true); add({ rootPc: sv.rootPc, quality: sv.quality, extensions: sv.extensions }, null, true); }
    }
    [1, 2, 3, 4, 5].forEach(function (d) {
      var target = mod12(key.rootPc + sc[d]), tq = diatonic(d, key, false).quality; if (tq === 'dim') return;
      add({ rootPc: mod12(target + 7), quality: 'major', extensions: ['b7'], target: target }, 'V7/' + romanFor({ rootPc: target, quality: tq }, key), false);
    });
    if (!minorish) {
      add({ rootPc: mod12(key.rootPc + 5), quality: 'minor' }, 'BORROWED iv', false);
      add({ rootPc: mod12(key.rootPc + 10), quality: 'major' }, 'BORROWED ♭VII', false);
      add({ rootPc: mod12(key.rootPc + 8), quality: 'major' }, 'BORROWED ♭VI', false);
      add({ rootPc: mod12(key.rootPc + 3), quality: 'major' }, 'BORROWED ♭III', false);
    } else {
      add({ rootPc: mod12(key.rootPc + 7), quality: 'major', extensions: ['b7'] }, 'HARMONIC V7', false);
      add({ rootPc: mod12(key.rootPc + 5), quality: 'major' }, 'DORIAN IV', false);
    }
    add({ rootPc: mod12(key.rootPc + 7), quality: 'sus4' }, 'SUSPENDED V', false);
    if (last && last.quality === 'major') add({ rootPc: mod12(last.rootPc + 9), quality: 'minor' }, 'RELATIVE MIN', null);
    if (last && last.quality === 'minor') add({ rootPc: mod12(last.rootPc + 3), quality: 'major' }, 'RELATIVE MAJ', null);
    if (opts.tritone && last && (last.extensions || []).indexOf('b7') >= 0) add({ rootPc: mod12(last.rootPc + 6), quality: 'major', extensions: ['b7'] }, 'TRITONE SUB', false);

    var lastP = last ? pcsOf(last) : null, recent = history.slice(-4).map(specKey), scPcs = sc.map(function (x) { return mod12(x + key.rootPc); });
    var lastIsDom = last && last.quality === 'major' && ((last.extensions || []).indexOf('b7') >= 0 || mod12(last.rootPc - key.rootPc) === 7);
    var seen = {};
    cands = cands.filter(function (c) { var k = specKey(c.spec); if (seen[k]) return false; seen[k] = 1; return true; });
    cands.forEach(function (c, i) {
      var p = pcsOf(c.spec);
      var keyFit = p.filter(function (x) { return scPcs.indexOf(x) >= 0; }).length / p.length;
      var vl = 1, common = 0.5;
      if (lastP) {
        var mv = 0; p.forEach(function (x) { var b = 12; lastP.forEach(function (y) { var dd = Math.abs(x - y); b = Math.min(b, dd, 12 - dd); }); mv += b; });
        vl = 1 - Math.min(1, mv / (p.length * 3.5)); common = p.filter(function (x) { return lastP.indexOf(x) >= 0; }).length / p.length;
      }
      var res = lastIsDom || (last && last.target !== undefined) ? 0.15 : 0.5;
      if (lastIsDom && mod12(c.spec.rootPc - last.rootPc) === 5) res = 1;
      if (last && last.target !== undefined && c.spec.rootPc === last.target) res = 1;
      if (c.spec.target !== undefined && last) res = 0.65;
      var flow = last ? FLOW[fnOf(last, key)][fnOf(c.spec, key)] : (c.spec.rootPc === key.rootPc ? 1 : 0.5);
      var k = specKey(c.spec), nov = recent.indexOf(k) >= 0 ? (recent[recent.length - 1] === k ? 0 : 0.35) : (c.diatonic === false ? 0.9 : 0.7);
      c.score = 0.25 * keyFit * (1 - 0.7 * u) + 0.20 * vl + 0.15 * res + 0.15 * flow + 0.10 * common + 0.10 * nov * (0.6 + 1.6 * u) + 0.05 * (opts.pref ? (opts.pref[k] || 0) : 0)
        + 0.012 * seeded(seed, i);
      if (last && k === specKey(last)) c.score -= 1;
      c.features = { keyFit: keyFit, voiceLead: vl, resolution: res, flow: flow, common: common, novelty: nov };
      c.roman = romanFor(c.spec, key);
      c.why = c.reason || (res === 1 ? 'RESOLVES ' + c.roman : c.roman + (common >= 0.5 && lastP ? ' · COMMON TONES' : vl > 0.75 && lastP ? ' · SMOOTH' : ' · ' + ({ T: 'HOME', S: 'LIFT', D: 'TENSION', X: 'COLOUR' })[fnOf(c.spec, key)]));
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var out = [], roots = {}, chrom = 0, maxChrom = u < 0.3 ? 1 : u < 0.7 ? 2 : 3;
    cands.forEach(function (c) {
      if (out.length >= 4) return;
      if (roots[c.spec.rootPc]) return;
      if (c.diatonic === false && chrom >= maxChrom) return;
      var cat = (c.reason || '').split(/[\/ ]/)[0]; if (cat && out.some(function (o) { return (o.reason || '').split(/[\/ ]/)[0] === cat; })) return;
      out.push(c); roots[c.spec.rootPc] = 1; if (c.diatonic === false) chrom++;
    });
    if (u >= 0.3 && !out.some(function (c) { return c.diatonic === false; })) {
      var alt = cands.find(function (c) { return c.diatonic === false && !roots[c.spec.rootPc]; });
      if (alt) out[3] = alt;
    }
    out.forEach(function (c) { delete c.spec.target; c.spec.source = 'suggestion'; });
    return { key: key, items: out };
  }

  /* ================= SMF writer (type 1, 960 PPQ) ================= */
  function vlq(n) { n = Math.max(0, Math.round(n)); var b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; }
  function str(s) { return Array.from(s).map(function (c) { return c.charCodeAt(0) & 0x7f; }); }
  function trackChunk(events, name) {
    /* events: {t, data:[...]}; offs before ons at equal tick */
    var ev = events.slice().sort(function (a, b) { return a.t - b.t || a.order - b.order; });
    var bytes = [];
    if (name) bytes = bytes.concat([0, 0xff, 0x03], vlq(name.length), str(name));
    var last = 0;
    ev.forEach(function (e) { var t = Math.round(e.t); bytes = bytes.concat(vlq(t - last), e.data); last = t; });
    bytes = bytes.concat([0, 0xff, 0x2f, 0]);
    var len = bytes.length;
    return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255].concat(bytes);
  }
  function notesToEvents(notes, ch) {
    var out = [];
    notes.forEach(function (n) {
      var on = Math.round(n.on), off = Math.max(on + 1, Math.round(n.off));
      out.push({ t: on, order: 1, data: [0x90 | (ch - 1), n.pitch, Math.max(1, Math.min(127, n.vel || 100))] });
      out.push({ t: off, order: 0, data: [0x80 | (ch - 1), n.pitch, 0] });
    });
    return out;
  }
  function writeSMF(o) {
    /* o: { bpm, num, den, tracks:[{name, ch, notes:[{pitch,on,off,vel}]}] } */
    var mpq = Math.round(60000000 / o.bpm), den = o.den || 4, dpow = Math.round(Math.log(den) / Math.LN2);
    var meta = [{ t: 0, order: 0, data: [0xff, 0x51, 0x03, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255] }, { t: 0, order: 0, data: [0xff, 0x58, 0x04, o.num || 4, dpow, 24, 8] }];
    var chunks = [trackChunk(meta, o.title || 'SYNE CHORD')];
    o.tracks.forEach(function (t) { chunks.push(trackChunk(notesToEvents(t.notes, t.ch), t.name)); });
    var head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, chunks.length, (PPQ >> 8) & 255, PPQ & 255];
    var all = head; chunks.forEach(function (c) { all = all.concat(c); });
    return new Uint8Array(all);
  }
  /* tiny reader, used by the tests to re-import an export */
  function readSMF(u8) {
    var p = 0; function u32() { var v = (u8[p] << 24 | u8[p + 1] << 16 | u8[p + 2] << 8 | u8[p + 3]) >>> 0; p += 4; return v; } function u16() { var v = u8[p] << 8 | u8[p + 1]; p += 2; return v; }
    function rv() { var v = 0, b; do { b = u8[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; }
    if (u32() !== 0x4d546864) throw new Error('no MThd'); u32(); var fmt = u16(), nt = u16(), div = u16(), tracks = [];
    for (var i = 0; i < nt; i++) {
      if (u32() !== 0x4d54726b) throw new Error('no MTrk'); var len = u32(), end = p + len, t = 0, evs = [], run = 0;
      while (p < end) {
        t += rv(); var st = u8[p];
        if (st === 0xff) { p++; var ty = u8[p++], l = rv(); evs.push({ t: t, meta: ty, data: Array.from(u8.slice(p, p + l)) }); p += l; continue; }
        if (st & 0x80) { run = st; p++; }
        var hi = run & 0xf0, d1 = u8[p++], d2 = (hi === 0xc0 || hi === 0xd0) ? 0 : u8[p++];
        evs.push({ t: t, status: hi, ch: (run & 15) + 1, d1: d1, d2: d2 });
      }
      tracks.push(evs);
    }
    return { format: fmt, division: div, tracks: tracks };
  }

  /* ================= ZIP (store) — the only archive the viewer's save sheet accepts for a .mid ================= */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipStore(files) {
    var parts = [], central = [], offset = 0;
    function le16(n) { return [n & 255, (n >>> 8) & 255]; } function le32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = str(f.name), data = f.data, crc = crc32(data);
      var lh = [0x50, 0x4b, 3, 4].concat(le16(20), le16(0), le16(0), le16(0), le16(0x21), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), name);
      parts.push(new Uint8Array(lh), data);
      central.push([0x50, 0x4b, 1, 2].concat(le16(20), le16(20), le16(0), le16(0), le16(0), le16(0x21), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), name));
      offset += lh.length + data.length;
    });
    var cd = [].concat.apply([], central), end = [0x50, 0x4b, 5, 6].concat(le16(0), le16(0), le16(files.length), le16(files.length), le32(cd.length), le32(offset), le16(0));
    parts.push(new Uint8Array(cd), new Uint8Array(end));
    var total = parts.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(total), q = 0;
    parts.forEach(function (b) { out.set(b, q); q += b.length; });
    return out;
  }

  /* render a recorded gesture list (loop/take) to note lists for export or audit */
  function renderGestures(gestures, s) {
    /* s: { bpm, swing, origin } ; gesture: {on, off, notes, mode, rateIdx, gate, strumMs, seed, vel, bassMode, bassNote, chordNotes, arpOct, humanize, probability, oneShot, lead, bassPat} */
    var perf = [], bass = [], chord = [];
    gestures.forEach(function (g) {
      var off = Math.max(g.off, g.on + 1), pm = PERF_MODES.find(function (x) { return x.id === g.mode; });
      if (g.lead !== false) perfEvents({ mode: g.mode, notes: g.notes, start: g.on, end: off, from: g.on, to: off, rateTicks: RATES[g.rateIdx === undefined ? RATE_DEFAULT : g.rateIdx].t, gate: g.gate, strumMs: g.strumMs, bpm: s.bpm, seed: g.seed, vel: g.vel, swing: s.swing, origin: s.origin || 0, arpOct: g.arpOct, humanize: g.humanize, probability: g.probability, oneShot: g.oneShot })
        .forEach(function (e) { perf.push({ pitch: e.pitch, on: e.on, off: e.off === null || e.off === undefined ? off : (pm && pm.kind === 'shot' ? e.off : Math.min(e.off, off)), vel: e.vel }); });
      if (g.bassMode && g.bassMode !== 'OFF' && g.bassNote !== null && g.bassNote !== undefined) bassEvents(g.bassMode, g.bassNote, g.on, off, g.on, off, true, g.bassPat).forEach(function (e) { bass.push({ pitch: e.pitch, on: e.on, off: e.off === null ? off : e.off, vel: e.vel }); });
      (g.chordNotes || g.notes).forEach(function (p) { chord.push({ pitch: p, on: g.on, off: off, vel: g.vel || 100 }); });
    });
    return { perf: perf, bass: bass, chord: chord };
  }

  var api = {
    PPQ: PPQ, STEP16: STEP16, MODES: MODES, MODE_LIST: MODE_LIST, QUALITIES: QUALITIES, EXT_ORDER: EXT_ORDER, RATES: RATES, PATTERNS: PATTERNS, PERF_MODES: PERF_MODES, ARPS: ARPS, RATE_DEFAULT: RATE_DEFAULT, BASS_PATTERNS: BASS_PATTERNS, bassPlan: bassPlan, barTicks: barTicks, modeIndex: modeIndex, rootMidi: rootMidi, arpOrder: arpOrder, cycleTicks: cycleTicks,
    BASS_MODES: BASS_MODES, BEATS: BEATS, DRUM_GM: DRUM_GM, SHARP: SHARP, FLAT: FLAT,
    mod12: mod12, spellPc: spellPc, noteName: noteName, comboQuality: comboQuality, normalizeExtensions: normalizeExtensions, snapToScale: snapToScale, diatonic: diatonic,
    chordFrom: chordFrom, intervalsOf: intervalsOf, pcsOf: pcsOf, chordName: chordName, suffix: suffix, baseNotes: baseNotes, invert: invert, spread: spread, voiceLead: voiceLead, render: render,
    bassNoteFor: bassNoteFor, bassEvents: bassEvents, perfEvents: perfEvents, swingTick: swingTick, msToTicks: msToTicks, seeded: seeded, mulberry: mulberry, resolveSelector: resolveSelector,
    beatEvents: beatEvents, suggest: suggest, inferKey: inferKey, romanFor: romanFor, specKey: specKey, writeSMF: writeSMF, readSMF: readSMF, zipStore: zipStore, crc32: crc32, renderGestures: renderGestures
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SyneChordCore = api;
})(typeof window !== 'undefined' ? window : this);
