/* SYNE CHORD core — acceptance tests mapped to the spec's matrix (§15). Run: node tests/core.test.js */
var C = require('../src/core.js'), assert = require('assert');
var pass = 0, fail = 0;
function t(id, name, fn) { try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; console.log('FAIL', id, name, '\n   ', e.message); } }
var OFF = { enabled: false };
function chord(pc, held, ext, key, extra) { return C.chordFrom(Object.assign({ rootPc: pc, held: held || [], latched: null, ext: ext || [], key: key || OFF, playstyle: 'instant' }, extra || {})); }
function notes(spec, v, prev) { return C.render(spec, v || {}, prev); }

t('H-001', 'C major on C4 = 60 64 67', function () { assert.deepStrictEqual(notes(chord(0, ['MAJ'])), [60, 64, 67]); });
t('H-002', 'A minor = 57 60 64', function () { assert.deepStrictEqual(notes(chord(9, ['MIN'])), [57, 60, 64]); });
t('H-003', 'C + maj7 + 9 = C E G B D, named maj9', function () {
  var s = chord(0, ['MAJ'], ['maj7', '9']); assert.deepStrictEqual(notes(s), [60, 64, 67, 71, 74]); assert.strictEqual(C.chordName(s), 'Cmaj9');
});
t('H-004', 'C major key mode, press D = D minor', function () { var s = chord(2, [], [], { enabled: true, rootPc: 0, mode: 'major' }); assert.strictEqual(s.quality, 'minor'); assert.strictEqual(C.chordName(s), 'Dm'); });
t('H-005', 'A minor key mode, press F = F major', function () { var s = chord(5, [], [], { enabled: true, rootPc: 9, mode: 'minor' }); assert.strictEqual(s.quality, 'major'); assert.deepStrictEqual(C.pcsOf(s), [0, 5, 9]); });
t('H-005b', 'key mode: held quality overrides; B in C major is dim', function () {
  var k = { enabled: true, rootPc: 0, mode: 'major' };
  assert.strictEqual(chord(2, ['MAJ'], [], k).quality, 'major'); assert.strictEqual(chord(11, [], [], k).quality, 'dim');
  assert.strictEqual(C.chordName(chord(7, [], ['b7'], k)), 'G7'); assert.strictEqual(C.chordName(chord(0, [], ['b7'], k)), 'Cmaj7');
});
t('H-005c', 'key mode: out-of-scale root snaps visibly', function () { var s = chord(1, [], [], { enabled: true, rootPc: 0, mode: 'major' }); assert.strictEqual(s.snapped, true); assert.strictEqual(s.rootPc, 0); });
t('H-007', 'inversion +1: [60,64,67] -> [64,67,72]', function () { assert.deepStrictEqual(notes(chord(0, ['MAJ']), { step: 1 }), [64, 67, 72]); assert.deepStrictEqual(notes(chord(0, ['MAJ']), { step: 2 }), [67, 72, 76]); });
t('H-008', 'inversion -1: [60,64,67] -> [55,60,64]', function () { assert.deepStrictEqual(notes(chord(0, ['MAJ']), { step: -1 }), [55, 60, 64]); });
t('V-001', 'voicing preserves pitch classes and cardinality for all 12 roots x qualities', function () {
  ['MAJ', 'MIN', 'SUS', 'DIM'].forEach(function (q) { for (var pc = 0; pc < 12; pc++) for (var st = -6; st <= 6; st++) {
    var s = chord(pc, [q], ['b7']), n = notes(s, { step: st }), pcs = n.map(C.mod12).sort(function (a, b) { return a - b; });
    assert.strictEqual(n.length, 4); assert.deepStrictEqual(Array.from(new Set(pcs)), C.pcsOf(s));
  } });
});
t('V-002', 'smooth voice leading C -> F picks the near inversion', function () { var prev = [60, 64, 67], n = notes(chord(5, ['MAJ']), { smooth: true }, prev); assert.deepStrictEqual(n, [60, 65, 69]); });
t('N-001', 'names', function () {
  var cases = [[['MIN'], ['b7'], 'Cm7'], [['DIM'], ['b7'], 'Cm7♭5'], [['DIM'], ['6'], 'Cdim7'], [['MAJ'], ['9'], 'Cadd9'], [['MAJ'], ['b7', '9'], 'C9'], [['MAJ'], ['6', '9'], 'C6/9'],
    [['SUS'], ['b7'], 'C7sus4'], [['MAJ', 'DIM'], [], 'Caug'], [['MIN', 'SUS'], [], 'Csus2'], [['MAJ', 'MIN'], [], 'C5']];
  cases.forEach(function (c) { assert.strictEqual(C.chordName(chord(0, c[0], c[1])), c[2]); });
});
t('N-002', 'b7 + maj7: latest wins without clusters', function () {
  assert.deepStrictEqual(C.normalizeExtensions(['b7', 'maj7'], 'maj7', false), ['maj7']);
  assert.deepStrictEqual(C.normalizeExtensions(['b7', 'maj7'], 'b7', false), ['b7']);
  assert.deepStrictEqual(C.normalizeExtensions(['b7', 'maj7'], 'b7', true), ['b7', 'maj7']);
});
t('N-003', 'single note without quality (hold playstyle)', function () { var s = C.chordFrom({ rootPc: 4, held: [], latched: 'major', ext: [], key: OFF, playstyle: 'hold' }); assert.strictEqual(s.quality, 'single'); assert.deepStrictEqual(notes(s), [64]); });

var base = { bpm: 120, seed: 7, vel: 100, gate: 0.6, swing: 0.5, origin: 0 };
function ev(mode, ns, extra) { return C.perfEvents(Object.assign({}, base, { mode: mode, notes: ns, start: 0, end: 3840, from: 0, to: 3840 }, extra || {})); }
t('P-001', 'pattern onset grid identical for C vs Cmaj9', function () {
  ['pat:pulse8', 'pat:332', 'pat:rolling', 'pat:glass', 'pat:triplet'].forEach(function (m) {
    var a = ev(m, [60, 64, 67], { rateTicks: 240 }), b = ev(m, [60, 64, 67, 71, 74], { rateTicks: 240 });
    var on = function (x) { return Array.from(new Set(x.map(function (e) { return e.on; }))).join(','); };
    assert.strictEqual(on(a), on(b), m);
  });
});
t('P-002', 'arp cycle length follows note count', function () {
  var a = ev('arpUp', [60, 64, 67], { rateTicks: 240 }), b = ev('arpUp', [60, 64, 67, 71, 74], { rateTicks: 240 });
  assert.deepStrictEqual(a.slice(0, 4).map(function (e) { return e.pitch; }), [60, 64, 67, 60]);
  assert.deepStrictEqual(b.slice(0, 6).map(function (e) { return e.pitch; }), [60, 64, 67, 71, 74, 60]);
  var ud = ev('arpUpDown', [60, 64, 67], { rateTicks: 240 }); assert.deepStrictEqual(ud.slice(0, 5).map(function (e) { return e.pitch; }), [60, 64, 67, 64, 60]);
});
t('P-003', 'strum width 80ms -> onsets 0,80,160 ms', function () {
  var e = ev('strumUp', [60, 64, 67], { strumMs: 80, end: null, to: 99999 }), ms = e.map(function (x) { return Math.round(x.on / 960 * 500); });
  assert.deepStrictEqual(ms, [0, 80, 160]); e.forEach(function (x) { assert.strictEqual(x.off, null); });
});
t('P-004', 'seeded slop deterministic and bounded', function () {
  var a = JSON.stringify(ev('slop', [60, 64, 67, 71], { strumMs: 20 }));
  for (var i = 0; i < 10; i++) assert.strictEqual(JSON.stringify(ev('slop', [60, 64, 67, 71], { strumMs: 20 })), a);
  JSON.parse(a).forEach(function (e, i) { var ideal = C.msToTicks(i * 20 * 1.4, 120); assert(Math.abs(e.on - ideal) <= C.msToTicks(12.5, 120) || e.on === 0); assert(e.vel >= 1 && e.vel <= 127); });
});
t('P-005', 'hold vs one-shot: harp ends by itself, block waits for release, arp stops at release', function () {
  ev('harp', [60, 64, 67], { end: null, to: 99999 }).forEach(function (e) { assert(e.off !== null); });
  ev('block', [60, 64, 67], { end: null, to: 99999 }).forEach(function (e) { assert.strictEqual(e.off, null); });
  var a = ev('arpUp', [60, 64, 67], { end: 1000, to: 5000, rateTicks: 240 }); a.forEach(function (e) { assert(e.on < 1000 && e.off <= 1000); });
});
t('P-006', 'windowed rendering equals one-shot rendering (live scheduler == export)', function () {
  ['arpRandom', 'pat:basstop', 'arp2', 'pat:dream'].forEach(function (m) {
    var whole = ev(m, [60, 64, 67, 71], { rateTicks: 240, swing: 0.6 }), parts = [];
    for (var f = 0; f < 3840; f += 333) parts = parts.concat(ev(m, [60, 64, 67, 71], { rateTicks: 240, swing: 0.6, from: f, to: Math.min(3840, f + 333) }));
    assert.strictEqual(JSON.stringify(parts), JSON.stringify(whole), m);
  });
});
t('P-007', 'swing keeps bar length and moves only offbeats', function () {
  assert.strictEqual(C.swingTick(0, 0.66), 0); assert.strictEqual(C.swingTick(480, 0.66), 480); assert.strictEqual(C.swingTick(3840, 0.66), 3840); assert(Math.abs(C.swingTick(240, 0.6667) - 320) < 0.5);
});
t('B-001', 'bass for C/E follows the slash bass, not the lead inversion', function () {
  var s = chord(0, ['MAJ']); s.explicitBassPc = 4; var lead = notes(s, { step: 2 });
  assert.strictEqual(C.mod12(C.bassNoteFor(s, lead, 'FOLLOW', 0)), 4);
  var s2 = chord(0, ['MAJ']); assert.strictEqual(C.mod12(C.bassNoteFor(s2, notes(s2, { step: 1 }), 'FOLLOW', 0)), 0);
});
t('B-002', 'bass voicing walks chord tones: C -> C/E -> C/G -> C (octave up)', function () {
  var s = chord(0, ['MAJ']), n = notes(s);
  assert.deepStrictEqual([0, 1, 2, 3, -1].map(function (k) { return C.bassNoteFor(s, n, 'FOLLOW', 0, k); }), [36, 40, 43, 48, 31]);
});
t('P-008', 'every arp mode plays only chord tones (across its octaves) and is deterministic', function () {
  C.ARPS.forEach(function (a) {
    var n = [60, 64, 67, 71], e1 = ev(a[0], n, { rateTicks: 240, arpOct: 2 }), e2 = ev(a[0], n, { rateTicks: 240, arpOct: 2 });
    assert(e1.length >= 16, a[0]); assert.strictEqual(JSON.stringify(e1), JSON.stringify(e2));
    e1.forEach(function (x) { assert([0, 4, 7, 11].indexOf(x.pitch % 12) >= 0, a[0] + ' ' + x.pitch); });
  });
  var cv = ev('arpConverge', [60, 64, 67, 71], { rateTicks: 240 }).slice(0, 4).map(function (e) { return e.pitch; }); assert.deepStrictEqual(cv, [60, 71, 64, 67]);
  var pk = ev('arpPinky', [60, 64, 67], { rateTicks: 240 }).slice(0, 4).map(function (e) { return e.pitch; }); assert.deepStrictEqual(pk, [60, 67, 64, 67]);
  var o2 = ev('arpUp', [60, 64, 67], { rateTicks: 240, arpOct: 2 }).slice(0, 6).map(function (e) { return e.pitch; }); assert.deepStrictEqual(o2, [60, 64, 67, 72, 76, 79]);
});
t('P-009', 'pattern one-shot stops after one cycle; probability thins steps deterministically', function () {
  var a = ev('pat:pulse8', [60, 64, 67], { rateTicks: 240, end: null, to: 3840 * 3, oneShot: true }); a.forEach(function (e) { assert(e.on < 3840); });
  var full = ev('arpUp', [60, 64, 67], { rateTicks: 240 }).length, thin = ev('arpUp', [60, 64, 67], { rateTicks: 240, probability: 0.5 });
  assert(thin.length < full && thin.length > 2); assert.strictEqual(JSON.stringify(thin), JSON.stringify(ev('arpUp', [60, 64, 67], { rateTicks: 240, probability: 0.5 })));
});
t('V-003', 'split keyboard: C..F an octave below F#..B', function () {
  assert.strictEqual(C.rootMidi(0, 0, 'split'), 48); assert.strictEqual(C.rootMidi(5, 0, 'split'), 53); assert.strictEqual(C.rootMidi(6, 0, 'split'), 66); assert.strictEqual(C.rootMidi(11, 0, 'split'), 71);
});
t('B-003', 'bass plan per mode', function () {
  assert.deepStrictEqual([C.bassPlan('FOLLOW', true).bass, C.bassPlan('UNISON', true).bass, C.bassPlan('SINGLES', true).lead, C.bassPlan('SOLO', false).lead], [false, true, false, false]);
});
t('BT-002', '20 beats; 3/4 bars hold 12 steps', function () { assert.strictEqual(C.BEATS.length, 20); assert.strictEqual(C.barTicks(3, 4), 2880); assert.strictEqual(C.barTicks(6, 8), 2880); });
t('L-001', '4 bars at 120 BPM 4/4 = 8.0 s', function () { var ticks = 4 * 4 * C.PPQ; assert.strictEqual(ticks * 60 / (120 * C.PPQ), 8); });
t('BT-001', 'beats: 8 patterns, all on one 16th grid', function () {
  assert(C.BEATS.length >= 8);
  C.BEATS.forEach(function (b, i) { var e = C.beatEvents(i, 0, 0, 3840, 0.5); assert(e.length > 4); e.forEach(function (x) { assert.strictEqual(x.on % 240, 0); }); });
});
t('AI-001', 'C -> Am gives four diverse, defensible choices', function () {
  var h = [chord(0, ['MAJ']), chord(9, ['MIN'])], r = C.suggest(h, null, { unexpected: 0.5 });
  assert.strictEqual(r.items.length, 4); assert.strictEqual(r.key.rootPc, 0); assert.strictEqual(r.key.mode, 'major');
  var roots = r.items.map(function (c) { return c.spec.rootPc; }); assert.strictEqual(new Set(roots).size, 4);
  assert(r.items.some(function (c) { return c.spec.rootPc === 5 || c.spec.rootPc === 2; }), 'F or Dm expected: ' + r.items.map(function (c) { return C.chordName(c.spec) + ' ' + c.why; }).join(', '));
  console.log('      ', r.items.map(function (c) { return C.chordName(c.spec) + ' [' + c.why + ']'; }).join('  '));
});
t('AI-001b', 'G7 resolves: C ranked first', function () { var h = [chord(0, ['MAJ']), chord(5, ['MAJ']), chord(7, ['MAJ'], ['b7'])], r = C.suggest(h, null, { unexpected: 0 }); assert.strictEqual(C.chordName(r.items[0].spec), 'C'); });
t('AI-001c', 'unexpected adds non-diatonic colour', function () { var r = C.suggest([chord(0, ['MAJ'])], null, { unexpected: 1 }); assert(r.items.some(function (c) { return c.diatonic === false; })); console.log('      ', r.items.map(function (c) { return C.chordName(c.spec) + ' [' + c.why + ']'; }).join('  ')); });
t('M-005', 'type-1 SMF: C Am F G, re-imported at correct ticks', function () {
  var g = [[0, ['MAJ']], [9, ['MIN']], [5, ['MAJ']], [7, ['MAJ']]].map(function (c, i) { var s = chord(c[0], c[1]), n = notes(s); return { on: i * 3840, off: (i + 1) * 3840, notes: n, mode: 'block', seed: 1, vel: 100, bassMode: 'FOLLOW', bassNote: C.bassNoteFor(s, n, 'FOLLOW', 0) }; });
  var r = C.renderGestures(g, { bpm: 120, swing: 0.5 }), bytes = C.writeSMF({ bpm: 120, num: 4, den: 4, tracks: [{ name: 'Performance', ch: 1, notes: r.perf }, { name: 'Bass', ch: 2, notes: r.bass }, { name: 'Chords', ch: 3, notes: r.chord }] });
  var m = C.readSMF(bytes); assert.strictEqual(m.format, 1); assert.strictEqual(m.division, 960); assert.strictEqual(m.tracks.length, 4);
  var tempo = m.tracks[0].find(function (e) { return e.meta === 0x51; }); assert.deepStrictEqual(tempo.data, [0x07, 0xa1, 0x20]);
  var ons = m.tracks[1].filter(function (e) { return e.status === 0x90; }); assert.strictEqual(ons.length, 12);
  assert.deepStrictEqual(ons.slice(3, 6).map(function (e) { return [e.t, e.d1]; }), [[3840, 57], [3840, 60], [3840, 64]]);
  var offs = m.tracks[1].filter(function (e) { return e.status === 0x80; }); assert.strictEqual(offs.length, 12); offs.forEach(function (e) { assert.strictEqual(e.t % 3840, 0); });
  var b = m.tracks[2].filter(function (e) { return e.status === 0x90; }); b.forEach(function (e) { assert.strictEqual(e.ch, 2); });
  require('fs').writeFileSync(__dirname + '/c-am-f-g.mid', Buffer.from(bytes));
});
t('M-001', 'block chord stream: Cmaj7 -> 4 ons + 4 offs', function () {
  var s = chord(0, ['MAJ'], ['maj7']), n = notes(s), r = C.renderGestures([{ on: 0, off: 960, notes: n, mode: 'arpUp', rateIdx: 4, seed: 1, vel: 90 }], { bpm: 120 });
  assert.strictEqual(r.chord.length, 4); r.chord.forEach(function (e) { assert.strictEqual(e.on, 0); assert.strictEqual(e.off, 960); });
  assert.strictEqual(r.perf.length, 4);
});
t('Z-001', 'zip store: crc and structure', function () {
  assert.strictEqual(C.crc32(new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57])), 0xcbf43926);
  var z = C.zipStore([{ name: 'a.mid', data: new Uint8Array([1, 2, 3]) }]); assert.strictEqual(z[0], 0x50); require('fs').writeFileSync(__dirname + '/t.zip', Buffer.from(z));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
