/* SYNE MOTH — engine: audio graph, 60 factory sounds + 30 user sounds, FX, bass, beats, one clock, performers, looper, MIDI router, storage. */
(function () {
  'use strict';
  var M = window.SyneChordCore, PPQ = M.PPQ, STEP16 = M.STEP16;
  var LOOKAHEAD = 0.14, TICK_MS = 25, STORE = 'syne-chord-v1', SLOTS = 'syne-chord-loops-v1';
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ================= factory sounds: three banks of original patches, each built the way its instrument builds a voice =================
     D-50     a short sampled-style attack (breath, chiff, mallet, plucked string, glass, bow) laid over a sustaining synth body
              and a decaying bell partial, through a lush chorus: linear-arithmetic layering.
     JUNO-60  one oscillator per voice (saw, a pulse with PWM, a sub an octave down, noise) into a resonant 24 dB low-pass and
              one envelope, through a two-speed stereo bucket-brigade chorus.
     DX7      up to six sine operators in stacks, with feedback, their own envelopes, velocity and key scaling.
     The patch names are our own; none is a copy of a factory preset. */
  function J(name, o) { return Object.assign({ name: name, family: 'JUNO-60', engine: 'juno', saw: 1, pulse: 0, pw: 0, pwm: 0, sub: 0, noise: 0, cut: 1800, res: 1, env: 1500, kbd: 0.5, hpf: 0,
    a: 0.005, d: 0.6, s: 0.6, r: 0.4, gate: false, lfo: 0.6, lfoCut: 0, lfoPitch: 0, lfoDelay: 0, bbd: 1, gain: 0.3 }, o); }
  function L(name, o) { return Object.assign({ name: name, family: 'D-50', engine: 'la', att: 'none', attLvl: 0.6, w1: 'sawtooth', w2: 'sawtooth', det: 8, oct2: 0, body: 1, cut: 1800, res: 1,
    fenv: 800, fa: 0.01, fd: 0.6, fs: 0.4, a: 0.01, d: 1, s: 0.8, r: 1, bell: 0, bellR: 2, bellM: 3.5, bellIdx: 1.5, bellDec: 1.2, air: 0, shim: 5, shimRate: 0.3, bbd: 4, gain: 0.28 }, o); }
  /* an operator: ratio, level (a carrier's amplitude, a modulator's index), attack, decay, sustain (fraction of level), release, extras */
  function op(r, lvl, a, d, s, rel, x) { return Object.assign({ r: r, lvl: lvl, a: a, d: d, s: s, rel: rel, det: 0, fb: 0, vs: 0.3, ks: 0.3 }, x); }
  function X(name, o) { return Object.assign({ name: name, family: 'DX7', engine: 'dx', ops: [], c: [0], m: [], cut: 14000, res: 0.5, a: 0.002, d: 1, s: 1, r: 0.5, trem: 0, bbd: 0, gain: 0.32 }, o); }
  var PRESETS = [
    /* ---- D-50 ---- */
    L('CRYSTAL CHOIR', { att: 'glass', attLvl: 0.35, det: 9, cut: 1400, fenv: 600, a: 0.5, d: 2, s: 0.85, r: 2, bell: 0.35, bellR: 2, bellM: 3.5, bellIdx: 1.5, bellDec: 1.6, air: 0.25, shim: 6 }),
    L('BREATH PAD', { att: 'breath', attLvl: 0.6, w1: 'square', w2: 'triangle', det: 7, cut: 1100, fenv: 300, a: 0.35, s: 0.85, r: 1.6, air: 0.35 }),
    L('DIGITAL HARP', { att: 'pluck', attLvl: 0.8, w1: 'triangle', w2: 'sine', oct2: 12, det: 4, cut: 2000, a: 0.002, d: 1.6, s: 0, r: 0.8, bell: 0.2, bellR: 4, bellDec: 0.5, body: 0.6 }),
    L('NOMAD PAD', { det: 14, cut: 700, fenv: 2200, fa: 2.5, fd: 3, fs: 0.5, a: 1.2, d: 2, s: 0.9, r: 2.5, shim: 10, air: 0.15 }),
    L('SPARKLE STACK', { att: 'glass', attLvl: 0.7, w1: 'square', w2: 'sawtooth', oct2: 12, cut: 2600, fenv: 1200, d: 0.3, s: 0, r: 0.3, bell: 0.4, bellR: 3, bellDec: 0.4 }),
    L('PIPE BREATH', { att: 'chiff', attLvl: 0.5, w1: 'sine', w2: 'triangle', oct2: 12, det: 3, cut: 3000, fenv: 0, a: 0.06, s: 0.9, r: 0.3, air: 0.4, shim: 12, shimRate: 5 }),
    L('SOUNDTRACK', { w2: 'square', det: 10, cut: 400, fenv: 3000, fa: 3, fd: 4, fs: 0.6, a: 1.5, s: 0.9, r: 3, bell: 0.15, bellR: 1.5, bellDec: 3, shim: 8 }),
    L('GLASS VOICES', { att: 'breath', attLvl: 0.3, w1: 'triangle', det: 12, cut: 1600, fenv: 400, a: 0.7, s: 0.9, r: 2, bell: 0.25, bellR: 4, air: 0.5 }),
    L('PCM PIANO', { att: 'mallet', attLvl: 0.8, w1: 'triangle', det: 3, cut: 1800, fenv: 1600, fd: 0.8, fs: 0.1, d: 2.2, s: 0, r: 0.5, shim: 2 }),
    L('MALLET LA', { att: 'mallet', attLvl: 1, w1: 'sine', w2: 'sine', oct2: 12, det: 2, cut: 4000, fenv: 0, d: 0.5, s: 0, r: 0.3, body: 0.5, shim: 0 }),
    L('STAB ORCHESTRA', { att: 'bow', attLvl: 0.7, det: 15, oct2: 12, cut: 2400, fenv: 2000, fd: 0.3, d: 0.35, s: 0.1, r: 0.3 }),
    L('ARCTIC BELLS', { att: 'glass', attLvl: 0.9, w1: 'sine', w2: 'sine', oct2: 12, cut: 5000, fenv: 0, d: 2, s: 0, r: 1.5, bell: 0.7, bellR: 3.5, bellIdx: 2, bellDec: 2.5, shim: 4, body: 0.5 }),
    L('WARM HORN LA', { att: 'chiff', attLvl: 0.3, w2: 'square', det: 5, cut: 600, fenv: 1800, fa: 0.12, fd: 0.5, fs: 0.5, a: 0.08, s: 0.8, r: 0.4, shim: 3 }),
    L('TRIBAL PLUCK', { att: 'pluck', attLvl: 0.9, w1: 'square', w2: 'triangle', cut: 1500, fenv: 1500, fd: 0.2, fs: 0, d: 0.4, s: 0, r: 0.3, body: 0.5, shim: 0 }),
    L('SHIMMER STRINGS', { att: 'bow', attLvl: 0.4, det: 16, cut: 2200, fenv: 500, a: 0.4, s: 0.9, r: 1.5, shim: 12, bell: 0.1, bellR: 4 }),
    L('SPACE VOX', { att: 'breath', attLvl: 0.4, w1: 'triangle', w2: 'square', det: 8, cut: 1000, res: 3, fenv: 400, a: 0.6, s: 0.9, r: 2, air: 0.6, shim: 9 }),
    L('KALIMBA LA', { att: 'mallet', attLvl: 0.9, w1: 'sine', w2: 'sine', oct2: 24, det: 0, cut: 6000, fenv: 0, d: 0.7, s: 0, r: 0.4, bell: 0.4, bellR: 5.4, bellDec: 0.6, body: 0.6, shim: 0 }),
    L('VAPOR PAD', { w2: 'triangle', det: 20, cut: 900, fenv: 400, a: 1.8, s: 1, r: 3, air: 0.3, bell: 0.15, bellR: 2, bellDec: 2 }),
    L('STEEL GUITAR LA', { att: 'pluck', attLvl: 1, w1: 'sawtooth', w2: 'square', det: 4, cut: 1300, fenv: 1200, fd: 0.4, fs: 0, d: 1.6, s: 0, r: 0.3, body: 0.35, shim: 0 }),
    L('DUSK BELL PAD', { att: 'glass', attLvl: 0.5, det: 10, cut: 1000, fenv: 500, a: 0.8, s: 0.9, r: 2.2, bell: 0.5, bellR: 2, bellM: 3, bellIdx: 2.5, bellDec: 2.2 }),
    /* ---- JUNO-60 ---- */
    J('STRING MACHINE', { saw: 1, cut: 2600, res: 0.8, env: 400, kbd: 0.6, hpf: 180, a: 0.35, d: 1, s: 0.9, r: 1.2, bbd: 2 }),
    J('PWM PAD', { saw: 0, pulse: 1, pw: 0.1, pwm: 0.7, lfo: 0.55, cut: 2200, env: 600, a: 0.45, d: 1.5, s: 0.85, r: 1.4, bbd: 1 }),
    J('POLY BRASS', { saw: 1, sub: 0.3, cut: 480, res: 1.5, env: 3200, a: 0.06, d: 0.5, s: 0.55, r: 0.25, bbd: 1 }),
    J('SOFT SAW PAD', { saw: 1, pulse: 0.4, pwm: 0.4, cut: 1300, env: 900, a: 0.6, d: 2, s: 0.8, r: 1.8, bbd: 2 }),
    J('SQUARE ORGAN', { saw: 0, pulse: 1, sub: 0.6, cut: 3000, env: 0, kbd: 0.8, gate: true, r: 0.05, bbd: 1 }),
    J('HOLLOW PULSE', { saw: 0, pulse: 1, pw: 0.3, cut: 1800, res: 2, env: 1000, a: 0.01, d: 0.8, s: 0.5, r: 0.5, bbd: 1 }),
    J('SWEEP PAD', { saw: 1, pulse: 0.5, pwm: 0.5, cut: 500, res: 4, lfoCut: 900, lfo: 0.18, a: 0.8, d: 2, s: 0.9, r: 2, env: 300, bbd: 2 }),
    J('PLUCK 60', { gain: 0.38, saw: 1, cut: 380, res: 3, env: 4500, d: 0.25, s: 0, r: 0.3, bbd: 1 }),
    J('CHORUS KEYS', { saw: 0.6, pulse: 1, pw: 0.15, cut: 900, env: 2500, d: 0.9, s: 0.2, r: 0.4, bbd: 2 }),
    J('NIGHT STRINGS', { saw: 1, pulse: 0.6, pwm: 0.5, cut: 1500, env: 300, hpf: 300, a: 0.5, d: 1, s: 0.95, r: 1.6, lfoPitch: 6, lfoDelay: 0.8, lfo: 5.2, bbd: 3 }),
    J('SUB BASS 60', { saw: 0.6, pulse: 0.4, sub: 1, cut: 300, res: 1.5, env: 1400, kbd: 0.3, d: 0.35, s: 0.3, r: 0.12, bbd: 0 }),
    J('SAW BASS 60', { saw: 1, sub: 0.7, cut: 220, res: 5, env: 2200, kbd: 0.3, d: 0.2, s: 0.15, r: 0.1, bbd: 0 }),
    J('RESO SWEEP', { saw: 1, cut: 320, res: 9, env: 0, lfoCut: 1500, lfo: 0.25, a: 0.2, d: 1, s: 1, r: 0.8, bbd: 1 }),
    J('FLUTE 60', { saw: 0, pulse: 1, cut: 850, res: 1, env: 300, kbd: 0.9, noise: 0.1, a: 0.06, d: 1, s: 0.9, r: 0.2, lfoPitch: 10, lfoDelay: 0.4, lfo: 5.5, bbd: 1 }),
    J('BELL PULSE', { saw: 0, pulse: 1, pw: 0.35, cut: 2400, res: 8, env: 600, kbd: 1, a: 0.002, d: 1.2, s: 0, r: 0.9, bbd: 2 }),
    J('DUSTY POLY', { saw: 1, pulse: 0.5, pw: 0.2, cut: 1100, env: 1500, d: 0.7, s: 0.45, r: 0.5, noise: 0.05, bbd: 1 }),
    J('WARM ROOM', { saw: 0.7, pulse: 0.7, pwm: 0.3, cut: 900, env: 700, a: 0.15, d: 1.2, s: 0.7, r: 1, bbd: 2 }),
    J('CLAV 60', { gain: 0.46, saw: 0, pulse: 1, pw: 0.38, hpf: 600, cut: 1200, res: 2.5, env: 4000, d: 0.2, s: 0.1, r: 0.08, bbd: 0 }),
    J('HARP 60', { saw: 0.8, pulse: 0.5, cut: 700, env: 3000, d: 1.2, s: 0, r: 1, bbd: 2 }),
    J('SLOW HORNS', { saw: 1, cut: 420, env: 2400, a: 0.3, d: 1, s: 0.7, r: 0.6, lfoPitch: 8, lfoDelay: 0.6, lfo: 5, bbd: 1 }),
    J('NOISE WIND', { saw: 0.15, noise: 1, cut: 1200, res: 6, env: 0, lfoCut: 1000, lfo: 0.1, a: 1, d: 1, s: 1, r: 2, bbd: 2 }),
    J('PULSE ARP', { gain: 0.38, saw: 0, pulse: 1, pwm: 0.6, lfo: 0.7, cut: 1600, res: 2, env: 2000, d: 0.18, s: 0.1, r: 0.15, bbd: 1 }),
    J('POLY STAB 60', { saw: 1, pulse: 0.5, sub: 0.4, cut: 900, res: 2, env: 4000, d: 0.18, s: 0.1, r: 0.2, bbd: 2 }),
    J('HIGH STRINGS', { saw: 1, hpf: 700, cut: 5000, env: 0, a: 0.2, d: 1, s: 1, r: 1, bbd: 2 }),
    /* ---- DX7 ---- */
    X('CLASSIC FM EP', { c: [0, 2], m: [[1, 0], [3, 2]], trem: 0.12, r: 0.5, ops: [op(1, 0.8, 0.001, 3.2, 0, 0.5), op(1, 1.4, 0.001, 1.2, 0.15, 0.5, { vs: 0.7, ks: 0.4 }), op(1, 0.45, 0.001, 1.6, 0, 0.4, { det: 3 }), op(14, 1.3, 0.001, 0.18, 0, 0.2, { vs: 0.9, ks: 0.6 })] }),
    X('SATIN FM EP', { c: [0, 2], m: [[1, 0], [3, 2]], trem: 0.2, r: 0.6, ops: [op(1, 0.8, 0.002, 3.4, 0, 0.6), op(1, 0.8, 0.002, 1.4, 0.1, 0.5, { vs: 0.8, ks: 0.5 }), op(1, 0.4, 0.002, 2, 0, 0.5, { det: -4 }), op(14, 0.6, 0.001, 0.12, 0, 0.2, { vs: 0.9, ks: 0.6 })] }),
    X('GLASS FM EP', { c: [0, 2, 4], m: [[1, 0], [3, 2], [5, 4]], trem: 0.1, r: 0.5, ops: [op(1, 0.7, 0.001, 3, 0, 0.5), op(1, 1.8, 0.001, 1, 0.2, 0.5, { vs: 0.7, ks: 0.5 }), op(1, 0.4, 0.001, 1.8, 0, 0.4, { det: 4 }), op(14, 1.6, 0.001, 0.2, 0, 0.2, { vs: 0.9, ks: 0.6 }), op(1, 0.3, 0.001, 2.4, 0, 0.5, { det: -5 }), op(1, 0.8, 0.001, 0.8, 0.2, 0.4, { fb: 0.4 })] }),
    X('BRIGHT FM PIANO', { c: [0, 2, 4], m: [[1, 0], [3, 2], [5, 4]], r: 0.4, ops: [op(1, 0.7, 0.001, 2.6, 0, 0.4), op(1, 2, 0.001, 0.9, 0.1, 0.4, { vs: 0.7, ks: 0.5 }), op(1, 0.5, 0.001, 2.2, 0, 0.4, { det: 2 }), op(3, 1.3, 0.001, 0.5, 0, 0.3, { vs: 0.7, ks: 0.5 }), op(2, 0.2, 0.001, 1, 0, 0.3), op(7, 1.5, 0.001, 0.06, 0, 0.1, { vs: 0.8 })] }),
    X('TUBULAR CHIMES', { c: [0, 2], m: [[1, 0], [3, 2]], r: 2, ops: [op(1, 0.7, 0.001, 5, 0, 2), op(3.5, 2.2, 0.001, 3, 0, 2, { vs: 0.5 }), op(1, 0.5, 0.001, 4, 0, 2, { det: 2 }), op(5.19, 1.2, 0.001, 1.4, 0, 1)] }),
    X('CHURCH BELL', { c: [0, 2], m: [[1, 0], [3, 2]], r: 2.5, ops: [op(1, 0.7, 0.001, 4.5, 0, 2.5), op(1.41, 3, 0.001, 3.5, 0, 2), op(0.5, 0.35, 0.001, 5, 0, 2.5), op(2.76, 1.2, 0.001, 1.5, 0, 1.5)] }),
    X('GLOCK', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.9, ops: [op(1, 0.7, 0.001, 1.8, 0, 0.9), op(3.5, 1.5, 0.001, 0.5, 0, 0.5), op(5.4, 0.3, 0.001, 0.8, 0, 0.6), op(1, 0.6, 0.001, 0.3, 0, 0.3)] }),
    X('VIBRAPHONE', { c: [0, 2], m: [[1, 0], [3, 2]], trem: 0.45, r: 0.8, ops: [op(1, 0.8, 0.001, 3.5, 0, 0.8), op(4, 0.7, 0.001, 0.2, 0, 0.3, { vs: 0.6 }), op(4, 0.15, 0.001, 0.6, 0, 0.5), op(1, 0.3, 0.001, 0.1, 0, 0.1)] }),
    X('MARIMBA FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.3, ops: [op(1, 0.8, 0.001, 0.55, 0, 0.3), op(4, 1.4, 0.001, 0.06, 0, 0.1, { vs: 0.7 }), op(3.99, 0.25, 0.001, 0.12, 0, 0.1), op(1, 0.5, 0.001, 0.05, 0, 0.05)] }),
    X('STEEL DRUM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.5, ops: [op(1, 0.8, 0.001, 1, 0, 0.5), op(2.24, 1.2, 0.001, 0.15, 0, 0.2, { vs: 0.6 }), op(2, 0.3, 0.001, 0.5, 0, 0.4), op(1, 0.6, 0.001, 0.1, 0, 0.1)] }),
    X('WOOD PERC', { c: [0], m: [[1, 0]], r: 0.1, ops: [op(1, 0.9, 0.001, 0.12, 0, 0.08), op(3.4, 2, 0.001, 0.03, 0, 0.05)] }),
    X('KOTO PLUCK', { c: [0], m: [[1, 0], [2, 0]], r: 0.5, ops: [op(1, 0.9, 0.001, 0.9, 0, 0.5), op(3, 2.5, 0.001, 0.15, 0, 0.2, { vs: 0.6 }), op(1, 1, 0.001, 0.4, 0, 0.3, { fb: 0.7 })] }),
    X('HARP FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.9, ops: [op(1, 0.8, 0.001, 2.4, 0, 0.9), op(2, 1, 0.001, 0.3, 0, 0.3), op(1, 0.4, 0.001, 1.8, 0, 0.8, { det: 4 }), op(4, 0.6, 0.001, 0.1, 0, 0.1)] }),
    X('CLAV FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.08, ops: [op(1, 0.7, 0.001, 0.5, 0.25, 0.08), op(3, 3, 0.001, 0.25, 0.3, 0.1, { vs: 0.8 }), op(2, 0.3, 0.001, 0.3, 0.1, 0.08), op(5, 2, 0.001, 0.05, 0, 0.05)] }),
    X('DRAWBAR FM', { c: [0, 1, 2, 3, 4, 5], m: [], trem: 0.2, r: 0.06, ops: [op(0.5, 0.5, 0.005, 1, 1, 0.06), op(1, 0.6, 0.005, 1, 1, 0.06), op(1.5, 0.3, 0.005, 1, 1, 0.06), op(2, 0.35, 0.005, 1, 1, 0.06), op(3, 0.2, 0.005, 1, 1, 0.06), op(4, 0.15, 0.005, 1, 1, 0.06, { fb: 0.2 })] }),
    X('PERC ORGAN', { c: [0, 1, 2, 3], m: [], r: 0.06, ops: [op(0.5, 0.45, 0.004, 1, 1, 0.06), op(1, 0.6, 0.004, 1, 1, 0.06), op(2, 0.4, 0.004, 1, 1, 0.06), op(3, 0.5, 0.001, 0.25, 0, 0.06)] }),
    X('BRASS SECTION', { c: [0, 1, 2], m: [[3, 0], [3, 1], [3, 2]], r: 0.25, ops: [op(1, 0.5, 0.05, 1, 0.85, 0.25), op(1, 0.5, 0.05, 1, 0.85, 0.25, { det: 6 }), op(1, 0.5, 0.05, 1, 0.85, 0.25, { det: -6 }), op(1, 1.6, 0.08, 0.6, 0.7, 0.25, { fb: 0.5, vs: 0.6 })] }),
    X('SOFT HORNS', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.4, ops: [op(1, 0.6, 0.09, 1, 0.9, 0.4), op(1, 1, 0.14, 1, 0.75, 0.4, { vs: 0.5 }), op(1, 0.4, 0.1, 1, 0.9, 0.4, { det: 5 }), op(2, 0.4, 0.2, 1, 0.6, 0.4)] }),
    X('STRING FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.8, bbd: 2, ops: [op(1, 0.6, 0.35, 1, 0.9, 0.8), op(1, 1.1, 0.5, 1, 0.9, 0.8, { fb: 0.3 }), op(1, 0.6, 0.4, 1, 0.9, 0.8, { det: 9 }), op(1, 1, 0.45, 1, 0.85, 0.8, { det: -7, fb: 0.3 })] }),
    X('ICE PAD FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 1.6, bbd: 2, ops: [op(1, 0.6, 0.8, 2, 0.8, 1.6), op(3, 0.8, 1, 2, 0.8, 1.6), op(1, 0.5, 1.2, 2, 0.9, 1.6, { det: 6 }), op(7, 0.3, 1.5, 2, 0.7, 1.6)] }),
    X('REED FM', { c: [0], m: [[1, 0], [2, 1]], r: 0.15, ops: [op(1, 0.9, 0.03, 1, 0.9, 0.15), op(1, 1.5, 0.05, 1, 0.8, 0.15, { fb: 0.5 }), op(3, 0.6, 0.05, 1, 0.8, 0.15)] }),
    X('FLUTE FM', { c: [0], m: [[1, 0]], r: 0.2, ops: [op(1, 0.9, 0.06, 1, 0.9, 0.2), op(1, 0.45, 0.02, 0.3, 0.3, 0.2)] }),
    X('FM BASS', { c: [0], m: [[1, 0], [2, 1]], r: 0.12, ops: [op(0.5, 1, 0.001, 1.2, 0.4, 0.12), op(0.5, 2.2, 0.001, 0.35, 0.2, 0.12, { fb: 0.6, vs: 0.6 }), op(1, 1.2, 0.001, 0.1, 0, 0.1)] }),
    X('SLAP FM BASS', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.1, ops: [op(0.5, 1, 0.001, 0.9, 0.3, 0.1), op(0.5, 3, 0.001, 0.12, 0.25, 0.1, { vs: 0.8 }), op(1, 0.35, 0.001, 0.08, 0, 0.05), op(7, 3, 0.001, 0.03, 0, 0.03)] }),
    X('SYNTH PLUCK FM', { c: [0, 2], m: [[1, 0], [3, 2]], r: 0.3, bbd: 1, ops: [op(1, 0.7, 0.001, 0.35, 0, 0.3), op(1, 3, 0.001, 0.12, 0, 0.2, { fb: 0.4 }), op(2, 0.3, 0.001, 0.3, 0, 0.3, { det: 5 }), op(1, 2, 0.001, 0.1, 0, 0.1)] })
  ];
  /* level trims, measured offline so every sound sits at the same loudness (see tests/sounds.js) */
  var LEVELS = {"STRING MACHINE":1.51, "PWM PAD":1.83, "POLY BRASS":2.37, "SOFT SAW PAD":1.31, "SQUARE ORGAN":1.26, "HOLLOW PULSE":3.11, "SWEEP PAD":1.1, "PLUCK 60":3.2, "CHORUS KEYS":1.82, "NIGHT STRINGS":1.01, "SUB BASS 60":2.35, "SAW BASS 60":3.2, "RESO SWEEP":1.21, "FLUTE 60":1.5, "BELL PULSE":3.2, "DUSTY POLY":1.88, "WARM ROOM":1.41, "CLAV 60":3.2, "HARP 60":2.23, "SLOW HORNS":1.98, "NOISE WIND":2.42, "PULSE ARP":3.2, "POLY STAB 60":3.16, "HIGH STRINGS":2.03, "CRYSTAL CHOIR":1.21, "BREATH PAD":0.88, "DIGITAL HARP":1.65, "NOMAD PAD":1.44, "SPARKLE STACK":1.18, "PIPE BREATH":0.93, "SOUNDTRACK":1.06, "GLASS VOICES":1.17, "PCM PIANO":0.83, "MALLET LA":1.19, "STAB ORCHESTRA":2.21, "ARCTIC BELLS":0.74, "WARM HORN LA":0.99, "TRIBAL PLUCK":1.63, "SHIMMER STRINGS":1.3, "SPACE VOX":0.9, "KALIMBA LA":1.04, "VAPOR PAD":1.38, "STEEL GUITAR LA":1.62, "DUSK BELL PAD":1.12, "CLASSIC FM EP":1.03, "SATIN FM EP":0.88, "GLASS FM EP":1.36, "BRIGHT FM PIANO":1.8, "TUBULAR CHIMES":1.17, "CHURCH BELL":1.38, "GLOCK":1.64, "VIBRAPHONE":1.34, "MARIMBA FM":2.15, "STEEL DRUM":1.69, "WOOD PERC":1.87, "KOTO PLUCK":1.17, "HARP FM":1.04, "CLAV FM":1.97, "DRAWBAR FM":1.29, "PERC ORGAN":1.16, "BRASS SECTION":0.76, "SOFT HORNS":0.87, "STRING FM":0.75, "ICE PAD FM":1.13, "REED FM":0.6, "FLUTE FM":0.59, "FM BASS":0.84, "SLAP FM BASS":1.01, "SYNTH PLUCK FM":3.2, "SOFT POLY":1.54, "VELVET PAD":1.48, "GLASS SAW":1.68, "PLUCK SAW":2.41, "BIG CHORDS":1.71, "LO-FI WARBLE":1.45, "TINE EP":0.74, "DREAM EP":0.56, "FELT KEYS":0.59, "MUSIC BOX":0.92, "CRYSTAL":0.88, "AURORA":0.89};
  PRESETS.forEach(function (p) { p.lv = LEVELS[p.name] || 1; });
  var FACTORY = PRESETS.length, FAMILIES = [];
  PRESETS.forEach(function (p, i) { if (!FAMILIES.length || FAMILIES[FAMILIES.length - 1].name !== p.family) FAMILIES.push({ name: p.family, first: i }); });
  var DEFAULT_SOUND = PRESETS.findIndex(function (p) { return p.name === 'CLASSIC FM EP'; });

  /* ================= state ================= */
  var DELAY_DIVS = [{ id: '1/16', b: 0.25 }, { id: '1/8', b: 0.5 }, { id: '1/8D', b: 0.75 }, { id: '1/4', b: 1 }, { id: '1/4D', b: 1.5 }, { id: '1/2', b: 2 }];
  var QUANTS = [{ id: 'OFF', t: 0 }, { id: '1/4', t: PPQ }, { id: '1/8', t: PPQ / 2 }, { id: '1/8T', t: PPQ / 3 }, { id: '1/16', t: PPQ / 4 }, { id: '1/16T', t: PPQ / 6 }, { id: '1/32', t: PPQ / 8 }];
  var METERS = [[4, 4], [3, 4], [6, 8]];
  var DEF = {
    preset: DEFAULT_SOUND, tone: 1, eCut: 0.5, eRes: 0.5, eAtk: 0.5, eDec: 0.5, eRel: 0.5, lofi: 0, aiNext: true, character: 0.12, volume: 0.8,
    reverb: 0.3, delay: 0.0, delayDiv: 2, delayFb: 0.35, chorus: 0.25, filter: 0.5, width: 0.5, fxOn: true,
    perfMode: 0, rateIdx: M.RATE_DEFAULT, strumMs: 28, gate: 0.6, swing: 0.5, bpm: 96, latchPerf: false,
    arpOct: 1, humanize: 0, probability: 1, patGate: 'hold',
    keyRoot: 0, keyMode: 'off', chromatic: false, kbMode: 'octave',
    bassMode: 0, bassLevel: 0.7, bassOct: 0, bassStep: 0, bassPat: 1,
    beat: -1, beatLevel: 0.7, meter: 0, loopBars: 4, quant: 4, quantStr: 1, metro: false,
    vStep: 0, octave: 0, spread: 0, smooth: true,
    playstyle: 'instant', extMode: 'add', susType: 'sus4', clusters: false, velTouch: true, unexpected: 0.5,
    midiOn: false, outId: '', perfCh: 1, bassCh: 2, chordCh: 0, clockOut: false,
    haptics: true, clicks: true, finish: 'auto', userSounds: [], uiv: 6, chordsOn: false, turnRight: false
  };
  var settings = Object.assign({}, DEF, { userSounds: [] });
  var st = {
    heldQ: [], latchedQ: 'major', latchedExt: [], heldExt: [], latestExt: null,
    owners: {}, root: 0, padHeld: {}, selType: null, last: null, history: [], sugg: { items: [], key: null }, suggToken: 0,
    playing: false, origin: 0, beatCursor: 0, clockCursor: 0, metroCursor: 0, beatNow: -1,
    loop: { state: 'empty', lenTicks: 0, bars: 4, layers: [], redo: [], origin: 0, recStart: 0, recEnd: 0, cursor: 0, dub: null },
    take: [], uiStep: -1, voices: 0, bouncing: false
  };
  function meter() { return METERS[settings.meter] || METERS[0]; }
  function barT() { var m = meter(); return M.barTicks(m[0], m[1]); }
  function stepsPerBar() { return Math.round(barT() / STEP16); }
  var subs = [], msg = null;
  function changed() { subs.forEach(function (f) { try { f(); } catch (e) {} }); scheduleSave(); }
  function say(l, r, ms) { msg = { l: l, r: r || '', until: performance.now() + (ms || 1200) }; changed(); }

  /* the sound in use: a factory preset, or a user sound (a factory engine plus its own tone and FX) */
  function soundCount() { return FACTORY + settings.userSounds.length; }
  function soundAt(i) { return i < FACTORY ? PRESETS[i] : Object.assign({}, PRESETS[settings.userSounds[i - FACTORY].base], { name: settings.userSounds[i - FACTORY].name, family: 'USER' }); }
  function patch() { return soundAt(clamp(settings.preset, 0, soundCount() - 1)); }
  var EDIT_KEYS = ['eCut', 'eRes', 'eAtk', 'eDec', 'eRel', 'lofi'];
  var FX_KEYS = EDIT_KEYS.concat(['character', 'reverb', 'delay', 'delayDiv', 'delayFb', 'chorus', 'filter', 'width']);
  function selectSound(i) {
    settings.preset = clamp(i, 0, soundCount() - 1);
    if (i >= FACTORY) { var u = settings.userSounds[i - FACTORY]; FX_KEYS.forEach(function (k) { if (u[k] !== undefined) settings[k] = u[k]; }); }
    else EDIT_KEYS.forEach(function (k) { settings[k] = DEF[k]; });
    applySound(); changed();
  }
  function saveUserSound() {
    if (settings.userSounds.length >= 30) { say('30 SAVED', 'DELETE ONE FIRST', 1500); return false; }
    var base = settings.preset < FACTORY ? settings.preset : settings.userSounds[settings.preset - FACTORY].base, u = { base: base, name: 'USER ' + (settings.userSounds.length + 1) };
    FX_KEYS.forEach(function (k) { u[k] = settings[k]; });
    settings.userSounds.push(u); settings.preset = FACTORY + settings.userSounds.length - 1; say('SAVED', u.name + ' · FROM ' + PRESETS[base].name, 1600); changed(); return true;
  }
  function deleteUserSound() {
    if (settings.preset < FACTORY) { say('FACTORY SOUND', 'ONLY USER SOUNDS DELETE', 1400); return; }
    settings.userSounds.splice(settings.preset - FACTORY, 1); settings.userSounds.forEach(function (u, i) { u.name = 'USER ' + (i + 1); });
    settings.preset = Math.min(settings.preset, soundCount() - 1); say('DELETED', '', 1100); applySound(); changed();
  }

  /* ================= audio graph =================
     lead voices -> lead bus -> tone -> drive -> tremolo -> chorus -> filter (LP/HP) -> lead out -+-> master -> limiter
                                                                         reverb and delay sends -+
     bass -> bass bus ;  drums -> drum bus ;  everything meets at the master limiter */
  var ctx = null, G = {}, drums = null, voices = [], bassVoice = null;
  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.12;
    G.master = ctx.createGain(); G.master.connect(comp); comp.connect(ctx.destination); G.out = comp;
    G.lead = ctx.createGain(); G.tone = ctx.createBiquadFilter(); G.tone.type = 'lowpass'; G.tone.Q.value = 0.5;
    G.drive = ctx.createWaveShaper(); G.drive.oversample = '2x';
    G.trem = ctx.createGain(); G.tremLfo = ctx.createOscillator(); G.tremDepth = ctx.createGain(); G.tremLfo.frequency.value = 4.8; G.tremLfo.connect(G.tremDepth); G.tremDepth.connect(G.trem.gain); G.tremLfo.start();
    /* the patch's own chorus, a stereo bucket-brigade pair swept in antiphase: mode I, II, I+II, or the lush LA ensemble */
    G.pcDry = ctx.createGain(); G.pcWet = ctx.createGain(); G.lead.connect(G.pcDry); G.pcDry.connect(G.tone); G.pcWet.connect(G.tone);
    G.pcLfo = ctx.createOscillator(); G.pcLfo.type = 'triangle'; G.pcLfo.frequency.value = 0.513; G.pcLfo.start();
    [1, -1].forEach(function (sgn, i) {
      var d = ctx.createDelay(0.03), dep = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      d.delayTime.value = 0.0035; dep.gain.value = 0; G.pcLfo.connect(dep); dep.connect(d.delayTime); G['pcDep' + i] = dep; G['pcSgn' + i] = sgn;
      G.lead.connect(d); if (pan) { pan.pan.value = sgn * 0.9; d.connect(pan); pan.connect(G.pcWet); } else d.connect(G.pcWet);
    });
    /* the patch LFO (PWM, filter and pitch sweeps of the DCO voices) and a loop of white noise */
    G.plfo = ctx.createOscillator(); G.plfo.type = 'triangle'; G.plfo.frequency.value = 0.6; G.plfo.start();
    G.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); (function (d, r) { for (var i = 0; i < d.length; i++) d[i] = r() * 2 - 1; })(G.noise.getChannelData(0), M.mulberry(17));
    /* lo-fi: fewer bits, a closing low-pass and tape wow and flutter on every voice */
    G.crush = ctx.createWaveShaper(); G.tone.connect(G.crush); G.crush.connect(G.drive);
    G.pmod = ctx.createGain(); G.wow = ctx.createOscillator(); G.wow.frequency.value = 0.55; G.wowAmt = ctx.createGain(); G.wowAmt.gain.value = 0; G.wow.connect(G.wowAmt); G.wowAmt.connect(G.pmod); G.wow.start();
    G.flut = ctx.createOscillator(); G.flut.frequency.value = 6.8; G.flutAmt = ctx.createGain(); G.flutAmt.gain.value = 0; G.flut.connect(G.flutAmt); G.flutAmt.connect(G.pmod); G.flut.start(); G.drive.connect(G.trem);
    /* chorus: two modulated delays, spread left and right */
    G.chIn = ctx.createGain(); G.chDry = ctx.createGain(); G.chWet = ctx.createGain(); G.trem.connect(G.chIn); G.chIn.connect(G.chDry);
    G.chLfo = ctx.createOscillator(); G.chLfo.frequency.value = 0.55; G.chLfo.start(); G.chLfo2 = ctx.createOscillator(); G.chLfo2.frequency.value = 0.83; G.chLfo2.start();
    [0.011, 0.017].forEach(function (dt, i) {
      var d = ctx.createDelay(0.05), dep = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      d.delayTime.value = dt; dep.gain.value = 0.002; (i ? G.chLfo2 : G.chLfo).connect(dep); dep.connect(d.delayTime); G['chDep' + i] = dep;
      G.chIn.connect(d); if (pan) { pan.pan.value = i ? 0.75 : -0.75; d.connect(pan); pan.connect(G.chWet); } else d.connect(G.chWet);
    });
    /* bus filter: one knob, low-pass below centre, high-pass above */
    G.lp = ctx.createBiquadFilter(); G.lp.type = 'lowpass'; G.lp.Q.value = 0.9; G.hp = ctx.createBiquadFilter(); G.hp.type = 'highpass'; G.hp.Q.value = 0.9;
    G.chDry.connect(G.lp); G.chWet.connect(G.lp); G.lp.connect(G.hp);
    G.leadOut = ctx.createGain(); G.hp.connect(G.leadOut); G.leadOut.connect(G.master);
    /* reverb */
    G.rev = ctx.createConvolver(); G.rev.buffer = impulse(3.2); G.revSend = ctx.createGain(); G.revRet = ctx.createGain(); G.revRet.gain.value = 0.9;
    G.revPre = ctx.createBiquadFilter(); G.revPre.type = 'highpass'; G.revPre.frequency.value = 220;
    G.revSend.connect(G.revPre); G.revPre.connect(G.rev); G.rev.connect(G.revRet); G.revRet.connect(G.master);
    /* tempo delay, ping-ponged */
    G.dlySend = ctx.createGain(); G.dlyL = ctx.createDelay(4); G.dlyR = ctx.createDelay(4); G.dlyFb = ctx.createGain(); G.dlyLp = ctx.createBiquadFilter(); G.dlyLp.type = 'lowpass'; G.dlyLp.frequency.value = 3600;
    var mL = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(), mR = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (mL.pan) { mL.pan.value = -0.7; mR.pan.value = 0.7; }
    G.dlySend.connect(G.dlyL); G.dlyL.connect(G.dlyLp); G.dlyLp.connect(mL); G.dlyLp.connect(G.dlyR); G.dlyR.connect(mR); G.dlyR.connect(G.dlyFb); G.dlyFb.connect(G.dlyL);
    G.dlyRet = ctx.createGain(); mL.connect(G.dlyRet); mR.connect(G.dlyRet); G.dlyRet.connect(G.master); G.dlyRet.connect(G.revSend);
    G.leadOut.connect(G.revSend); G.leadOut.connect(G.dlySend);
    G.bass = ctx.createGain(); G.bassOut = ctx.createGain(); G.bass.connect(G.bassOut); G.bassOut.connect(G.master);
    var bRev = ctx.createGain(); bRev.gain.value = 0.1; G.bassOut.connect(bRev); bRev.connect(G.revSend);
    G.drums = ctx.createGain(); G.drums.connect(G.master); var dRev = ctx.createGain(); dRev.gain.value = 0.12; G.drums.connect(dRev); dRev.connect(G.revSend);
    G.click = ctx.createGain(); G.click.gain.value = 0.35; G.click.connect(G.master);
    /* mod wheel: one shared vibrato, its depth set by the wheel */
    G.vib = ctx.createOscillator(); G.vib.frequency.value = 5.6; G.vibAmt = ctx.createGain(); G.vibAmt.gain.value = 0; G.vib.connect(G.vibAmt); G.vibAmt.connect(G.pmod); G.vib.start();
    drums = makeDrums();
    applySound(true);
    return ctx;
  }
  function impulse(sec) {
    var len = Math.round(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate), r = M.mulberry(99);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c), lp = 0; for (var i = 0; i < len; i++) { var t = i / len; lp = lp * (0.2 + 0.7 * t) + (r() * 2 - 1) * (0.8 - 0.7 * t); d[i] = lp * Math.pow(1 - t, 2.4) * (i < 400 ? i / 400 : 1) * 0.6; } }
    return b;
  }
  function crushCurve(bits) { var n = 4096, c = new Float32Array(n), q = Math.pow(2, bits - 1); for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * q) / q; } return c; }
  function driveCurve(k) { var n = 1024, c = new Float32Array(n), a = 1 + k * 14; for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); } return c; }
  function smooth(param, v, tc) { if (!ctx) return; param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, tc || 0.02); }
  function delaySeconds() { return Math.min(3.9, 60 / settings.bpm * DELAY_DIVS[clamp(settings.delayDiv, 0, DELAY_DIVS.length - 1)].b); }
  var BBD = [null, { r: 0.513, d: 0.0017 }, { r: 0.863, d: 0.0017 }, { r: 7.5, d: 0.00028 }, { r: 0.31, d: 0.0024 }];
  function applySound(now) {
    if (!ctx) return;
    var s = settings, p = patch(), on = s.fxOn ? 1 : 0;
    smooth(G.master.gain, Math.pow(s.volume, 1.6) * 0.9);
    smooth(G.tone.frequency, Math.min(18000, 400 * Math.pow(45, s.tone)) * Math.pow(0.11, s.lofi));
    if (now || G._lofi !== s.lofi) { G._lofi = s.lofi; G.crush.curve = s.lofi > 0.01 ? crushCurve(12 - s.lofi * 8) : null; }
    smooth(G.wowAmt.gain, s.lofi * 16); smooth(G.flutAmt.gain, s.lofi * 5);
    var ch = on * s.character;
    if (now || G._char !== ch) { G.drive.curve = driveCurve(ch); G._char = ch; }
    smooth(G.lead.gain, 1 - ch * 0.45);
    var cw = on * s.chorus; smooth(G.chWet.gain, cw * 0.85); smooth(G.chDry.gain, 1 - cw * 0.3); smooth(G.chDep0.gain, 0.0008 + cw * 0.0045); smooth(G.chDep1.gain, 0.0008 + cw * 0.0045);
    var bb = BBD[p.bbd || 0]; smooth(G.pcWet.gain, bb ? 0.62 : 0); smooth(G.pcDry.gain, bb ? 0.72 : 1); smooth(G.pcLfo.frequency, bb ? bb.r : 0.5, 0.05);
    smooth(G.pcDep0.gain, bb ? bb.d : 0); smooth(G.pcDep1.gain, bb ? -bb.d : 0); smooth(G.plfo.frequency, p.lfo && p.engine === 'juno' ? p.lfo : 0.6, 0.05);
    smooth(G.tremDepth.gain, (p.trem || 0) * 0.35); smooth(G.trem.gain, 1 - (p.trem || 0) * 0.35);
    var f = on ? s.filter : 0.5;
    smooth(G.lp.frequency, f < 0.5 ? 180 * Math.pow(110, f / 0.5) : 20000, 0.03); smooth(G.hp.frequency, f > 0.5 ? 20 * Math.pow(150, (f - 0.5) / 0.5) : 10, 0.03);
    smooth(G.revSend.gain, on * s.reverb * 0.7);
    smooth(G.dlySend.gain, on * s.delay * 0.6); smooth(G.dlyFb.gain, Math.min(0.88, s.delayFb)); var ds = delaySeconds(); smooth(G.dlyL.delayTime, ds / 2, 0.05); smooth(G.dlyR.delayTime, ds / 2, 0.05);
    var plan = M.bassPlan(M.BASS_MODES[s.bassMode], false);
    smooth(G.leadOut.gain, plan.lead ? 1 : 0);
    smooth(G.bassOut.gain, s.bassMode === 0 ? 0 : s.bassLevel * 0.9);
    smooth(G.drums.gain, s.beatLevel * 0.8);
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function nyq(x) { return Math.min(ctx.sampleRate * 0.45, Math.max(20, x)); }
  /* sampled-style attacks for the LA family, rendered once per pitch and kept */
  var ATK = {}, atkN = 0;
  function attackBuf(type, pitch) {
    var sr = ctx.sampleRate, key = type + ':' + pitch + ':' + sr; if (ATK[key]) return ATK[key];
    if (atkN > 180) { ATK = {}; atkN = 0; }
    var f = mtof(pitch), rnd = M.mulberry(pitch * 31 + type.length), len, b, d, i, k;
    function mk(sec) { len = Math.round(sec * sr); b = ctx.createBuffer(1, len, sr); d = b.getChannelData(0); }
    function partials(list, att) { for (k = 0; k < list.length; k++) { var pf = f * list[k][0]; if (pf > sr * 0.42) continue; var w = 2 * Math.PI * pf / sr; for (i = 0; i < len; i++) d[i] += Math.sin(w * i) * list[k][1] * Math.exp(-i / (sr * list[k][2])) * Math.min(1, i / (sr * att)); } }
    if (type === 'pluck') {        /* a plucked string: a burst of noise recirculating through a one-period delay */
      mk(1.4); var N = Math.max(2, Math.round(sr / f)), ring = new Float32Array(N), lp = 0, idx = 0, damp = 0.9965 - Math.min(0.006, f / 400000);
      for (i = 0; i < N; i++) { lp = lp * 0.4 + (rnd() * 2 - 1) * 0.6; ring[i] = lp; }
      for (i = 0; i < len; i++) { var cur = ring[idx], nx = ring[(idx + 1) % N]; ring[idx] = (cur + nx) * 0.5 * damp; d[i] = cur; idx = (idx + 1) % N; }
    } else if (type === 'mallet') { mk(0.7); partials([[1, 1, 0.22], [3.93, 0.45, 0.06], [9.4, 0.25, 0.02]], 0.0015); for (i = 0; i < sr * 0.004; i++) d[i] += (rnd() * 2 - 1) * 0.5 * (1 - i / (sr * 0.004)); }
    else if (type === 'glass') { mk(1.1); partials([[2, 0.6, 0.5], [5.04, 0.45, 0.3], [8.97, 0.3, 0.16], [13.2, 0.2, 0.08]], 0.002); }
    else if (type === 'breath' || type === 'bow') {  /* noise through a resonator tuned near the note */
      mk(type === 'bow' ? 0.4 : 0.55); var fc = Math.min(type === 'bow' ? f * 3 : f * 2, sr * 0.3), rr = type === 'bow' ? 0.97 : 0.985, th = 2 * Math.PI * fc / sr, y1 = 0, y2 = 0, ph = 0;
      for (i = 0; i < len; i++) { var x = rnd() * 2 - 1, y = x * (1 - rr) + 2 * rr * Math.cos(th) * y1 - rr * rr * y2; y2 = y1; y1 = y; var t = i / sr;
        var env = Math.min(1, t / (type === 'bow' ? 0.04 : 0.025)) * Math.exp(-t / (type === 'bow' ? 0.15 : 0.13));
        if (type === 'bow') { ph = (ph + f / sr) % 1; y = y * 0.7 + (ph * 2 - 1) * 0.08; } d[i] = y * env; }
    } else if (type === 'chiff') { mk(0.14); var pv = 0, w2 = 2 * Math.PI * f * 2 / sr; for (i = 0; i < len; i++) { var n = rnd() * 2 - 1, t2 = i / sr; d[i] = ((n - pv) * 0.6 * Math.exp(-t2 / 0.025) + Math.sin(w2 * i) * 0.5 * Math.exp(-t2 / 0.03)) * Math.min(1, t2 / 0.002); pv = n; } }
    else { mk(0.3); var p2 = 0; for (i = 0; i < len; i++) { var t3 = i / sr; p2 += 2 * Math.PI * f * (1 + Math.exp(-t3 / 0.03)) / sr; d[i] = Math.sin(p2) * Math.exp(-t3 / 0.08); } }
    var pk = 0; for (i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    var fade = Math.round(sr * 0.04); for (i = 0; i < len; i++) { d[i] *= 0.9 / (pk || 1); if (i > len - fade) d[i] *= (len - i) / fade; }
    ATK[key] = b; atkN++; return b;
  }
  /* a DX-style operator with feedback: the exact spectrum of y = sin(wt + b·y), sum of 2·J_n(n·b)/(n·b)·sin(nwt) */
  var FBW = {};
  function besselJ(n, x) { var s = 0, S = 120; for (var k = 0; k < S; k++) { var tau = (k + 0.5) * Math.PI / S; s += Math.cos(n * tau - x * Math.sin(tau)); } return s / S; }
  function fbWave(fb) {
    var q = Math.round(fb * 20) / 20, key = q + ':' + ctx.sampleRate; if (FBW[key]) return FBW[key];
    var beta = q * 1.5, H = 40, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (var n = 1; n <= H; n++) im[n] = beta < 1e-4 ? (n === 1 ? 1 : 0) : 2 * besselJ(n, n * beta) / (n * beta);
    return (FBW[key] = ctx.createPeriodicWave(re, im));
  }
  /* an envelope segment set: v0, a linear ramp to v1 over a, then a glide toward v2. Returned so a release can start from wherever it is */
  function env(param, t, a, v0, v1, v2, tc) { a = Math.max(0.001, a); tc = Math.max(0.005, tc); param.setValueAtTime(v0, t); param.linearRampToValueAtTime(v1, t + a); param.setTargetAtTime(v2, t + a, tc); return { t: t, a: a, v0: v0, v1: v1, v2: v2, tc: tc }; }
  function envAt(e, tt) { var dt = tt - e.t; if (dt <= 0) return e.v0; if (dt < e.a) return e.v0 + (e.v1 - e.v0) * dt / e.a; return e.v2 + (e.v1 - e.v2) * Math.exp(-(dt - e.a) / e.tc); }
  function release(param, e, tt, target, tc) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(tt);
    else { param.cancelScheduledValues(tt); if (e) { var v = envAt(e, tt); if (tt < e.t + e.a) param.linearRampToValueAtTime(v, tt); else param.setValueAtTime(v, tt); } }
    param.setTargetAtTime(target, tt, Math.max(0.005, tc));
  }
  function envTo(param, peak, a, d, s, t) { return env(param, t, a, 0, peak, peak * s, d / 3); }
  function tapLfo(dst, V) { if (!G.plfo) return; G.plfo.connect(dst); V.taps.push(dst); }

  /* DCO POLY: saw + PWM pulse (a saw minus a delayed copy of itself) + sub + noise, an optional high-pass, a 24 dB low-pass, one envelope */
  function junoVoice(p, f, v, t, V, filt) {
    var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; V.nodes.push(o);
    var mix = ctx.createGain(); mix.gain.value = 0.5;
    if (p.saw) { var sg = ctx.createGain(); sg.gain.value = p.saw; o.connect(sg); sg.connect(mix); }
    if (p.pulse) {
      var dl = ctx.createDelay(0.1), pa = ctx.createGain(), pb = ctx.createGain(); pa.gain.value = p.pulse * 0.6; pb.gain.value = -p.pulse * 0.6;
      dl.delayTime.value = Math.max(0.04, 0.5 - p.pw) / f; o.connect(pa); o.connect(dl); dl.connect(pb); pa.connect(mix); pb.connect(mix);
      if (p.pwm) { var pg = ctx.createGain(); pg.gain.value = Math.min(p.pwm * 0.4, 0.46 - p.pw) / f; tapLfo(pg, V); pg.connect(dl.delayTime); }
    }
    if (p.sub) { var so = ctx.createOscillator(), sbg = ctx.createGain(); so.type = 'square'; so.frequency.value = f / 2; sbg.gain.value = p.sub * 0.55; so.connect(sbg); sbg.connect(mix); V.nodes.push(so); }
    if (p.noise && G.noise) { var ns = ctx.createBufferSource(), ng = ctx.createGain(); ns.buffer = G.noise; ns.loop = true; ns.loopEnd = G.noise.duration; ng.gain.value = p.noise * 0.6; ns.connect(ng); ng.connect(mix); V.nodes.push(ns); }
    var head = mix;
    if (p.hpf) { var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hpf; hp.Q.value = 0.6; mix.connect(hp); head = hp; }
    var f1 = ctx.createBiquadFilter(); f1.type = 'lowpass'; f1.Q.value = 0.55; head.connect(f1); f1.connect(filt);
    var base = p.cut * Math.pow(f / 261.6, p.kbd) * (0.85 + 0.15 * v), top = base + p.env * (0.6 + 0.4 * v);
    [f1.frequency, filt.frequency].forEach(function (fp) {
      V.rels.push([fp, nyq(base), Math.max(0.01, p.r / 4), env(fp, t, Math.max(0.003, p.a), nyq(base), nyq(top), nyq(base + (top - base) * p.s), p.d / 3)]);
      if (p.lfoCut) { var lc = ctx.createGain(); lc.gain.value = p.lfoCut; tapLfo(lc, V); lc.connect(fp); }
    });
    if (p.lfoPitch) { var lp = ctx.createGain(); lp.gain.setValueAtTime(0, t); lp.gain.linearRampToValueAtTime(p.lfoPitch, t + 0.05 + p.lfoDelay); tapLfo(lp, V); lp.connect(o.detune); if (so) lp.connect(so.detune); }
  }

  /* LA DIGITAL: an attack transient and a bell partial straight to the output, a two-partial body through the envelopes */
  function laVoice(p, f, v, t, V, filt, out0, peak) {
    /* the attack and bell skip the body's envelopes but not the cutoff edit */
    var out = out0; if (p.cutMul && p.cutMul < 1) { out = ctx.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = nyq(16000 * Math.pow(p.cutMul, 1.2)); out.Q.value = 0.7; out.connect(out0); }
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), mix = ctx.createGain(); o1.type = p.w1; o2.type = p.w2;
    o1.frequency.value = f; o2.frequency.value = f * Math.pow(2, p.oct2 / 12); o1.detune.value = -p.det; o2.detune.value = p.det;
    mix.gain.value = 0.5 * p.body; o1.connect(mix); o2.connect(mix); mix.connect(filt); V.nodes.push(o1, o2);
    if (p.shim) { var sl = ctx.createOscillator(), sa = ctx.createGain(), sb = ctx.createGain(); sl.isLfo = true; sl.frequency.value = p.shimRate * (0.9 + 0.2 * Math.random()); sa.gain.value = p.shim; sb.gain.value = -p.shim; sl.connect(sa); sl.connect(sb); sa.connect(o1.detune); sb.connect(o2.detune); V.nodes.push(sl); }
    if (p.air && G.noise) { var ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ag = ctx.createGain(); ns.buffer = G.noise; ns.loop = true; ns.loopEnd = G.noise.duration; ns.isLfo = true;
      bp.type = 'bandpass'; bp.frequency.value = nyq(f * 2.5); bp.Q.value = 1.4; ag.gain.value = p.air * 0.9; ns.connect(bp); bp.connect(ag); ag.connect(filt); V.nodes.push(ns); }
    var base = p.cut * (0.6 + 0.4 * v), top = base + p.fenv * (0.5 + 0.5 * v);
    filt.frequency.setValueAtTime(nyq(base), t); filt.frequency.linearRampToValueAtTime(nyq(top), t + Math.max(0.003, p.fa)); filt.frequency.setTargetAtTime(nyq(base + (top - base) * p.fs), t + Math.max(0.003, p.fa), Math.max(0.01, p.fd / 3));
    if (p.bell) {
      var bc = ctx.createOscillator(), bm = ctx.createOscillator(), bi = ctx.createGain(), bg = ctx.createGain(), bf = f * p.bellR;
      if (bf < ctx.sampleRate * 0.4) {
        bc.frequency.value = bf; bm.frequency.value = bf * p.bellM; bi.gain.setValueAtTime(p.bellIdx * bf * p.bellM * (0.5 + 0.5 * v), t); bi.gain.setTargetAtTime(0, t, p.bellDec / 4);
        bm.connect(bi); bi.connect(bc.frequency); bc.connect(bg); bg.connect(out);
        V.nodes.push(bc, bm); V.rels.push([bg.gain, 0, 0.06, envTo(bg.gain, peak * p.bell * 1.4, 0.002, p.bellDec, 0, t)]);
      }
    }
    if (p.att !== 'none') { var src = ctx.createBufferSource(), tg = ctx.createGain(); src.buffer = attackBuf(p.att, Math.round(12 * Math.log2(f / 440) + 69)); tg.gain.value = peak * p.attLvl * 1.6; src.connect(tg); tg.connect(out); V.nodes.push(src); V.rels.push([tg.gain, 0, Math.max(0.03, p.r / 5)]); }
  }

  /* SIX-OP FM: operators wired by the patch's algorithm; a modulator's level is its index, scaled by velocity and by key */
  function dxVoice(p, f, v, t, V, dest, pitch) {
    var oscs = [], gains = [], ksBase = Math.pow(2, -(pitch - 60) / 12);
    p.ops.forEach(function (o, i) {
      var osc = ctx.createOscillator(); if (o.fb) osc.setPeriodicWave(fbWave(o.fb)); var fr = f * o.r; osc.frequency.value = fr; osc.detune.value = o.det || 0;
      var g = ctx.createGain(); g.gain.value = 0; osc.connect(g);
      var car = p.c.indexOf(i) >= 0, vel = 1 - o.vs + o.vs * v, ks = Math.pow(ksBase, o.ks * 0.5);
      var lvl = car ? o.lvl * (fr < ctx.sampleRate * 0.45 ? 1 : 0) : o.lvl * fr * vel * Math.min(1.6, ks) * (p.idxMul || 1);
      V.rels.push([g.gain, 0, Math.max(0.01, o.rel / 4), envTo(g.gain, lvl, o.a, o.d, o.s, t)]);
      oscs.push(osc); gains.push(g); V.nodes.push(osc);
    });
    p.m.forEach(function (w) { gains[w[0]].connect(oscs[w[1]].frequency); });
    p.c.forEach(function (i) { gains[i].connect(dest); });
    dest.gain && (dest.gain.value = 1 / Math.sqrt(p.c.length));
  }

  /* the sound editor: cutoff, resonance, attack, decay and release as offsets on the patch (0.5 = as designed) */
  function edited(p) {
    var s = settings, kc = (s.eCut - 0.5) * 2, ka = (s.eAtk - 0.5) * 2, kd = (s.eDec - 0.5) * 2, kr = (s.eRel - 0.5) * 2;
    if (!kc && !ka && !kd && !kr && s.eRes === 0.5) return p;
    var cm = Math.pow(2, kc * 3), Dm = Math.pow(4, kd);
    function A(a) { return a * Math.pow(8, ka) + Math.max(0, ka) * 0.6; }
    function Rr(r) { return r * Math.pow(4, kr) + Math.max(0, kr) * 1.2; }
    var e = Object.assign({}, p, { cutMul: cm, a: A(p.a), d: p.d * Dm, r: Rr(p.r), cut: p.cut * cm, res: clamp((p.res || 0.7) * Math.pow(2, (s.eRes - 0.5) * 4.5), 0.3, 24) });
    if (p.fa !== undefined) { e.fa = A(p.fa); e.fd = p.fd * Dm; }
    if (p.bellDec) e.bellDec = p.bellDec * Dm;
    if (p.engine === 'juno') { e.lfoCut = p.lfoCut * Math.min(1.5, cm); e.env = p.env * Math.min(2, cm); }
    if (p.engine === 'la') e.fenv = p.fenv * Math.min(2, cm);
    if (p.engine === 'dx') { e.idxMul = Math.pow(cm, cm < 1 ? 0.45 : 0.3); e.ops = p.ops.map(function (o) { return Object.assign({}, o, { a: A(o.a), d: o.d * Dm, rel: Rr(o.rel) }); }); e.r = Math.max.apply(null, e.ops.map(function (o) { return o.rel; })); }
    return e;
  }
  /* one lead voice. Every node is created here and torn down after release. */
  function leadVoice(pitch, vel, t) {
    var p = edited(patch()), f = mtof(pitch), v = vel / 127, out = ctx.createGain(), amp = ctx.createGain(), V = { nodes: [], rels: [], taps: [] }, nodes = V.nodes, peak = p.gain * (0.35 + 0.65 * v * v) * (p.lv || 1);
    out.gain.value = 1; amp.gain.value = 0; amp.connect(out);
    /* width: each pitch class sits at its own place in the stereo field */
    if (ctx.createStereoPanner) { var pn = ctx.createStereoPanner(); pn.pan.value = settings.fxOn ? (((pitch * 7) % 12) / 11 * 2 - 1) * settings.width * 0.8 : 0; out.connect(pn); pn.connect(G.lead); } else out.connect(G.lead);
    var filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = p.res || 0.7; filt.connect(amp);
    var bright = 0.55 + 0.45 * v, ae = p;
    if (p.engine === 'juno') { junoVoice(p, f, v, t, V, filt); if (p.gate) ae = { a: 0.003, d: 1, s: 1, r: p.r }; }
    else if (p.engine === 'la') laVoice(p, f, v, t, V, filt, out, peak);
    else if (p.engine === 'dx') { var sum = ctx.createGain(); sum.connect(filt); filt.frequency.value = nyq(p.cutMul < 1 ? Math.min(p.cut, f * 24 * Math.pow(p.cutMul, 1.6)) : p.cut); dxVoice(p, f, v, t, V, sum, pitch); ae = { a: 0.002, d: 1, s: 1, r: p.r }; }
    else if (p.engine === 'analog') {
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = p.w1; o2.type = p.w2; o1.frequency.value = f; o2.frequency.value = f * Math.pow(2, (p.oct2 || 0) / 12); o1.detune.value = -p.det; o2.detune.value = p.det;
      var mix = ctx.createGain(); mix.gain.value = 0.5; o1.connect(mix); o2.connect(mix); mix.connect(filt); nodes.push(o1, o2);
      if (p.sub) { var so = ctx.createOscillator(), sg = ctx.createGain(); so.type = 'sine'; so.frequency.value = f / 2; sg.gain.value = p.sub; so.connect(sg); sg.connect(filt); nodes.push(so); }
      var base = p.cut * bright, top = Math.min(18000, base + p.fenv * bright);
      filt.frequency.setValueAtTime(base, t); filt.frequency.linearRampToValueAtTime(top, t + p.fa); filt.frequency.setTargetAtTime(base + (top - base) * p.fs, t + p.fa, p.fd / 3);
      if (p.lfo) { var lf = ctx.createOscillator(), lg = ctx.createGain(); lf.isLfo = true; lf.frequency.value = p.lfo; lg.gain.value = p.lfoAmt; lf.connect(lg); lg.connect(filt.frequency); nodes.push(lf); }
    } else {
      var car = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(); car.type = p.w || 'sine'; car.frequency.value = f; md.frequency.value = f * p.ratio;
      var i0 = p.idx * f * bright, i1 = p.idxS * f * bright;
      mg.gain.setValueAtTime(i0, t); mg.gain.setTargetAtTime(i1, t + 0.005, p.idxD / 3); md.connect(mg); mg.connect(car.frequency); car.connect(filt); nodes.push(car, md);
      if (p.bell) { var b = ctx.createOscillator(), bg = ctx.createGain(); b.frequency.value = f * 14.02; bg.gain.setValueAtTime(p.bell * 0.12 * v, t); bg.gain.setTargetAtTime(0, t, 0.06); b.connect(bg); bg.connect(amp); nodes.push(b); }
      if (p.lfo) { var lf2 = ctx.createOscillator(), lg2 = ctx.createGain(); lf2.isLfo = true; lf2.frequency.value = p.lfo; lg2.gain.value = p.lfoAmt * f; lf2.connect(lg2); lg2.connect(car.frequency); nodes.push(lf2); }
      if (p.sub) { var s2 = ctx.createOscillator(), sg2 = ctx.createGain(); s2.frequency.value = f / 2; sg2.gain.value = p.sub; s2.connect(sg2); sg2.connect(filt); nodes.push(s2); }
      filt.frequency.value = Math.min(16000, p.cut * (0.6 + 0.6 * v));
    }
    var ampEnv = envTo(amp.gain, peak, ae.a, ae.d, ae.s, t);
    nodes.forEach(function (n) { n.start(t); });
    var pitched = nodes.filter(function (n) { return !n.isLfo; }); wheelOn(pitched);
    var c0 = ctx, g0 = G;
    var vc = { t: t, pitch: pitch, done: false, pitched: pitched, stop: function (when) {
      if (vc.done) return; vc.done = true; var tt = Math.max(when, c0.currentTime);
      if (tt <= t) { out.gain.setValueAtTime(0, t); tt = t; }
      release(amp.gain, ampEnv, tt, 0, Math.max(0.01, ae.r / 4));
      V.rels.forEach(function (r) { release(r[0], r[3], tt, r[1], r[2]); });
      var end = tt + ae.r * 1.6 + 0.05; nodes.forEach(function (n) { try { n.stop(end); } catch (e) {} });
      nodes[0].onended = function () { wheelOff(pitched); V.taps.forEach(function (d) { try { g0.plfo.disconnect(d); } catch (e) {} }); try { out.disconnect(); } catch (e) {} var k = voices.indexOf(vc); if (k >= 0) voices.splice(k, 1); };
    } };
    voices.push(vc);
    var live = voices.filter(function (x) { return !x.done; });
    if (live.length > 24) live[0].stop(t);            /* steal the oldest */
    return vc;
  }
  function bassSynth(pitch, vel, t) {
    var f = mtof(pitch), amp = ctx.createGain(), filt = ctx.createBiquadFilter(), o = ctx.createOscillator(), sub = ctx.createOscillator(), sg = ctx.createGain(), v = vel / 127;
    o.type = 'sawtooth'; sub.type = 'square'; o.frequency.value = f; sub.frequency.value = f / 2; sg.gain.value = 0.35;
    if (bassVoice && !bassVoice.done && bassVoice.t < t) { o.frequency.setValueAtTime(mtof(bassVoice.pitch), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); }
    filt.type = 'lowpass'; filt.Q.value = 4; filt.frequency.setValueAtTime(180 + 1400 * v, t); filt.frequency.setTargetAtTime(160 + 300 * v, t, 0.08);
    o.connect(filt); sub.connect(sg); sg.connect(filt); filt.connect(amp); amp.connect(G.bass);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.42 * (0.5 + 0.5 * v), t + 0.004); amp.gain.setTargetAtTime(0.3 * (0.5 + 0.5 * v), t + 0.01, 0.2);
    o.start(t); sub.start(t); wheelOn([o, sub]); bassVoices.push([o, sub]);
    var vc = { t: t, pitch: pitch, done: false, stop: function (when) { if (vc.done) return; vc.done = true; var tt = Math.max(when, ctx.currentTime, t); amp.gain.cancelScheduledValues(tt); amp.gain.setTargetAtTime(0, tt, 0.03); o.stop(tt + 0.3); sub.stop(tt + 0.3); o.onended = function () { wheelOff([o, sub]); bassVoices = bassVoices.filter(function (x) { return x[0] !== o; }); try { amp.disconnect(); } catch (e) {} }; } };
    return vc;
  }
  function makeDrums() {
    var sr = ctx.sampleRate, r = M.mulberry(5);
    function buf(sec, fn) { var n = Math.round(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = fn(i / sr, i); return b; }
    function noise() { return r() * 2 - 1; }
    var hp = 0, ph = 0;
    return [
      buf(0.5, function (t) { if (!t) ph = 0; ph += 2 * Math.PI * (48 + 110 * Math.exp(-t / 0.03)) / sr; return Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t / 0.18)) * 0.95; }),
      buf(0.3, function (t) { return (Math.sin(2 * Math.PI * 190 * t) * 0.5 * Math.exp(-t / 0.05) + noise() * 0.6 * Math.exp(-t / 0.09)) * 0.8; }),
      buf(0.08, function (t) { var n = noise(); var y = n - hp; hp = n * 0.6; return y * 0.45 * Math.exp(-t / 0.018); }),
      buf(0.4, function (t) { var n = noise(); var y = n - hp; hp = n * 0.6; return y * 0.4 * Math.exp(-t / 0.12); }),
      buf(0.3, function (t) { var e = 0; [0, 0.01, 0.02].forEach(function (s) { if (t >= s) e = Math.max(e, Math.exp(-(t - s) / 0.007)); }); if (t > 0.02) e = Math.max(e, 0.6 * Math.exp(-(t - 0.02) / 0.08)); return noise() * e * 0.7; }),
      buf(0.06, function (t) { return (Math.sin(2 * Math.PI * 1650 * t) * 0.7 + noise() * 0.3) * Math.exp(-t / 0.01); }),
      buf(0.5, function (t) { return Math.sin(2 * Math.PI * (110 + 40 * Math.exp(-t / 0.05)) * t) * Math.exp(-t / 0.2) * 0.8; }),
      buf(0.12, function (t) { return noise() * Math.min(1, t / 0.01) * Math.exp(-t / 0.035) * 0.35; })
    ];
  }
  function playDrum(voice, vel, t) { if (!ctx) return; var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = drums[voice]; g.gain.value = vel / 127; s.connect(g); g.connect(G.drums); s.start(t); }
  function click(t, accent) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1760 : 1180; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(g); g.connect(G.click); o.start(t); o.stop(t + 0.06); }

  /* ================= one clock: ticks <-> audio time ================= */
  var anchor = { time: 0, tick: 0, bpm: DEF.bpm };
  function nowT() { return ctx ? ctx.currentTime : 0; }
  function tickAt(time) { return anchor.tick + (time - anchor.time) * anchor.bpm * PPQ / 60; }
  function timeAt(tick) { return anchor.time + (tick - anchor.tick) * 60 / (anchor.bpm * PPQ); }
  function nowTick() { return tickAt(nowT()); }
  function setBpm(b) { b = clamp(Math.round(b), 40, 240); if (ctx) { var t = nowT(); anchor = { time: t, tick: tickAt(t), bpm: b }; } else anchor.bpm = b; settings.bpm = b; applySound(); }

  /* ================= MIDI router ================= */
  var MIDI = { status: navigator.requestMIDIAccess ? 'off' : 'unsupported', detail: '', access: null, outs: [], out: null, counts: {}, log: [], pending: [] };
  function midiTs(audioTime) { return performance.now() + Math.max(0, (audioTime - nowT()) * 1000); }
  function midiLog(kind, ch, a, b, ts) { MIDI.log.unshift({ t: ts, kind: kind, ch: ch, a: a, b: b }); if (MIDI.log.length > 40) MIDI.log.length = 40; MIDI.dirty = true; }
  function rawSend(bytes, ts) { if (!MIDI.out) return; try { MIDI.out.send(bytes, ts); } catch (e) { MIDI.status = 'error'; MIDI.detail = String(e.message || e); } }
  function mNoteOn(ch, p, v, audioTime) {
    if (!ch || !MIDI.out) return; var k = ch + ':' + p, ts = midiTs(audioTime);
    MIDI.counts[k] = (MIDI.counts[k] || 0) + 1;
    if (MIDI.counts[k] === 1) { rawSend([0x90 | (ch - 1), p, clamp(v | 0, 1, 127)], ts); midiLog('ON', ch, p, v, ts); }
  }
  function mNoteOff(ch, p, audioTime) {
    if (!ch || !MIDI.out) return; var k = ch + ':' + p, ts = midiTs(audioTime);
    if (!MIDI.counts[k]) return;
    MIDI.counts[k]--;
    if (!MIDI.counts[k]) { delete MIDI.counts[k]; rawSend([0x80 | (ch - 1), p, 0], ts); midiLog('OFF', ch, p, 0, ts); }
  }
  function midiPanic(port) {
    var out = port || MIDI.out; if (!out) return;
    Object.keys(MIDI.counts).forEach(function (k) { var a = k.split(':'); try { out.send([0x80 | (a[0] - 1), +a[1], 0]); } catch (e) {} });
    for (var c = 0; c < 16; c++) try { out.send([0xb0 | c, 64, 0]); out.send([0xb0 | c, 123, 0]); out.send([0xb0 | c, 120, 0]); } catch (e) {}
    MIDI.counts = {}; midiLog('PANIC', 0, 0, 0, performance.now());
  }
  function listOuts() {
    MIDI.outs = []; if (!MIDI.access) return;
    MIDI.access.outputs.forEach(function (o) { MIDI.outs.push({ id: o.id, name: o.name || 'MIDI out', state: o.state }); });
  }
  function selectOut(id) {
    if (MIDI.out && MIDI.out.id !== id) { midiPanic(MIDI.out); } /* note-offs go to the old port before the move */
    MIDI.out = null; MIDI.counts = {};
    if (MIDI.access && id) { var o = MIDI.access.outputs.get(id); if (o && o.state === 'connected') MIDI.out = o; }
    if (!MIDI.out && MIDI.access && MIDI.outs.length && !id) { var first = MIDI.access.outputs.get(MIDI.outs[0].id); if (first) MIDI.out = first; }
    settings.outId = MIDI.out ? MIDI.out.id : (id || '');
    MIDI.status = !MIDI.access ? MIDI.status : MIDI.out ? 'ready' : MIDI.outs.length ? 'select' : 'nodevice';
    changed();
  }
  function requestMidi() {
    if (!navigator.requestMIDIAccess) { MIDI.status = 'unsupported'; MIDI.detail = 'This browser has no Web MIDI. Export a MIDI file instead.'; changed(); return Promise.resolve(false); }
    MIDI.status = 'requesting'; changed();
    return navigator.requestMIDIAccess({ sysex: false }).then(function (acc) {
      MIDI.access = acc; settings.midiOn = true; listOuts(); selectOut(settings.outId);
      acc.onstatechange = function (e) {
        var port = e.port; listOuts();
        if (MIDI.out && port && port.id === MIDI.out.id && port.state === 'disconnected') { MIDI.out = null; MIDI.counts = {}; MIDI.status = 'lost'; MIDI.detail = (port.name || 'Device') + ' disconnected'; say('MIDI LOST', '', 1600); }
        else if (!MIDI.out && port && port.type === 'output' && port.state === 'connected' && (port.id === settings.outId || !settings.outId)) selectOut(port.id);
        changed();
      };
      return true;
    }).catch(function (e) {
      MIDI.status = 'denied'; MIDI.detail = (e && e.name === 'SecurityError') || /permission|denied|not allowed|policy/i.test(String(e && e.message)) ? 'MIDI access was blocked here (permission or embedded-page policy).' : String((e && e.message) || e);
      changed(); return false;
    });
  }

  /* ================= note records: one pipeline for audio and MIDI ================= */
  /* rec: { stream:'perf'|'bass'|'chord', pitch, vel, onT, offT|null, voice, committed } */
  var recs = [];
  function startRec(stream, pitch, vel, onT, offT) {
    var r = { stream: stream, pitch: pitch, vel: vel, onT: onT, offT: offT, committed: false, voice: null };
    if (stream === 'perf') r.voice = leadVoice(pitch, vel, onT);
    if (stream === 'bass') {
      if (bassVoice && !bassVoice.done) { var prev = recs.find(function (x) { return x.stream === 'bass' && x.voice === bassVoice && !x.committed; }); if (prev) { prev.offT = Math.min(prev.offT === null ? Infinity : prev.offT, onT); commit(prev); } else bassVoice.stop(onT); }
      r.voice = bassVoice = bassSynth(pitch, vel, onT);
    }
    var ch = stream === 'perf' ? settings.perfCh : stream === 'bass' ? settings.bassCh : settings.chordCh;
    r.ch = ch; mNoteOn(ch, pitch, vel, onT);
    recs.push(r); st.voices = voices.length;
    if (stream === 'perf') flash[pitch % 12] = onT;
    return r;
  }
  function commit(r) { if (r.committed) return; r.committed = true; var t = Math.max(r.offT, r.onT); if (r.voice) r.voice.stop(t); mNoteOff(r.ch, r.pitch, t + 0.0005); }
  function endRec(r, t) { if (r.committed) return; r.offT = Math.max(r.onT, r.offT === null ? t : Math.min(r.offT, t)); commit(r); }
  function pumpRecs(horizon) { recs = recs.filter(function (r) { if (!r.committed && r.offT !== null && r.offT < horizon) commit(r); return !r.committed; }); }
  var flash = {};

  /* ================= performers ================= */
  var seq = 1;
  function perfMode() { return M.PERF_MODES[settings.perfMode]; }
  function makePerformer(id, spec, rendered, o) {
    o = o || {}; var m = o.mode ? M.PERF_MODES.find(function (x) { return x.id === o.mode; }) : perfMode(), t = nowT() + 0.006, start = o.start !== undefined ? o.start : tickAt(t);
    if (o.start === undefined && m.kind === 'grid' && st.playing) { var q = STEP16, rel = start - st.origin; start = st.origin + Math.ceil(rel / q - 0.12) * q; if (start < tickAt(t)) start += q; }
    var single = spec.quality === 'single', plan = M.bassPlan(M.BASS_MODES[settings.bassMode], single);
    var bassMode = o.bassMode || (plan.bass ? M.BASS_MODES[settings.bassMode] : 'OFF');
    var pf = {
      id: id, spec: spec, notes: rendered, chordNotes: rendered.slice(), mode: m.id, kind: m.kind, rateIdx: o.rateIdx !== undefined ? o.rateIdx : settings.rateIdx, gate: o.gate !== undefined ? o.gate : settings.gate,
      strumMs: o.strumMs !== undefined ? o.strumMs : settings.strumMs, seed: o.seed || ((seq++ * 7919) % 100000), vel: o.vel || 100, start: start, end: o.end === undefined ? null : o.end,
      cursor: start, bassMode: bassMode, bassNote: o.bassNote !== undefined ? o.bassNote : M.bassNoteFor(spec, rendered, bassMode, settings.bassOct, settings.bassStep), bassCursor: start,
      bassPat: o.bassPat !== undefined ? o.bassPat : settings.bassPat, lead: o.lead !== undefined ? o.lead : plan.lead,
      arpOct: o.arpOct !== undefined ? o.arpOct : settings.arpOct, humanize: o.humanize !== undefined ? o.humanize : settings.humanize, probability: o.probability !== undefined ? o.probability : settings.probability,
      oneShot: o.oneShot !== undefined ? o.oneShot : settings.patGate === 'oneshot',
      recs: [], loop: !!o.loop, latched: !!o.latched
    };
    st.owners[id] = pf;
    /* raw block chord stream: held chord, no arpeggiation */
    if (settings.chordCh) pf.chordRecs = rendered.map(function (p) { return startRec('chord', p, pf.vel, Math.max(nowT(), timeAt(start)), pf.end === null ? null : timeAt(pf.end)); });
    servicePerformer(pf, pf.kind === 'shot' ? start + PPQ * 12 : tickAt(nowT() + LOOKAHEAD));
    return pf;
  }
  function servicePerformer(pf, horizonTick) {
    if (pf.cursor < horizonTick) {
      var evs = pf.lead === false ? [] : M.perfEvents({ mode: pf.mode, notes: pf.notes, start: pf.start, end: pf.end, from: pf.cursor, to: horizonTick, rateTicks: (M.RATES[pf.rateIdx] || M.RATES[M.RATE_DEFAULT]).t, gate: pf.gate, strumMs: pf.strumMs, bpm: anchor.bpm, seed: pf.seed, vel: pf.vel, swing: settings.swing, origin: st.origin,
        arpOct: pf.arpOct, humanize: pf.humanize, probability: pf.probability, oneShot: pf.oneShot });
      evs.forEach(function (e) {
        var onT = Math.max(nowT(), timeAt(e.on)), offT = e.off === null || e.off === undefined ? null : timeAt(e.off);
        pf.recs.push(startRec('perf', e.pitch, e.vel, onT, offT));
      });
      var third = pf.spec && pf.spec.quality === 'minor' ? 3 : pf.spec && /sus/.test(pf.spec.quality) ? 5 : 4;
      M.bassEvents(pf.bassMode, pf.bassNote, pf.start, pf.end, pf.bassCursor, horizonTick, true, pf.bassPat, third).forEach(function (e) {
        pf.recs.push(startRec('bass', e.pitch, e.vel, Math.max(nowT(), timeAt(e.on)), e.off === null || e.off === undefined ? null : timeAt(e.off)));
      });
      pf.cursor = horizonTick; pf.bassCursor = horizonTick;
    }
    pf.recs = pf.recs.filter(function (r) { return !r.committed; });
  }
  function releasePerformer(id, atTick) {
    var pf = st.owners[id]; if (!pf) return;
    var t = atTick !== undefined ? Math.max(nowT(), timeAt(atTick)) : nowT();
    if (pf.kind !== 'shot') pf.recs.forEach(function (r) { endRec(r, t); });
    else pf.recs.forEach(function (r) { if (r.stream === 'bass') endRec(r, t); });
    (pf.chordRecs || []).forEach(function (r) { endRec(r, t); });
    if (pf.end === null) pf.end = Math.max(pf.start, tickAt(t));
    delete st.owners[id];
    if (pf.gesture) { pf.gesture.closeAt(tickAt(t)); }
  }
  /* live chord change on a held root: compute the difference in actual pitches, never accumulate */
  function retune(pf, spec, rendered) {
    var old = pf.notes; pf.spec = spec; pf.notes = rendered;
    if (pf.kind === 'hold' && settings.extMode === 'retrigger' && pf.lead !== false) { /* release the old voicing, trigger the new one whole */
      var tr = nowT(); pf.recs.forEach(function (r) { if (r.stream === 'perf') endRec(r, tr); }); rendered.forEach(function (p) { pf.recs.push(startRec('perf', p, pf.vel, tr + 0.002, null)); });
    } else if (pf.kind === 'hold' && pf.lead !== false) {
      var t = nowT();
      pf.recs.forEach(function (r) { if (r.stream === 'perf' && rendered.indexOf(r.pitch) < 0) endRec(r, t); });
      rendered.forEach(function (p) { if (old.indexOf(p) < 0 || !pf.recs.some(function (r) { return r.stream === 'perf' && r.pitch === p && !r.committed; })) pf.recs.push(startRec('perf', p, pf.vel, t, null)); });
    }
    if (pf.chordRecs) { var t2 = nowT(); pf.chordRecs.forEach(function (r) { if (rendered.indexOf(r.pitch) < 0) endRec(r, t2); }); pf.chordRecs = pf.chordRecs.filter(function (r) { return !r.committed; }); rendered.forEach(function (p) { if (!pf.chordRecs.some(function (r) { return r.pitch === p; })) pf.chordRecs.push(startRec('chord', p, pf.vel, t2, null)); }); }
    var nb = M.bassNoteFor(spec, rendered, M.BASS_MODES[settings.bassMode], settings.bassOct, settings.bassStep);
    if (nb !== pf.bassNote) { pf.bassNote = nb; if (pf.bassMode !== 'PATTERN' && pf.bassMode !== 'OFF') { var tb = nowT(); pf.recs.forEach(function (r) { if (r.stream === 'bass') endRec(r, tb); }); pf.recs.push(startRec('bass', nb, 104, tb, null)); } }
    if (pf.gesture) pf.gesture.update(rendered, pf.bassNote);
  }

  /* ================= gestures: what the player does, as the chord engine sees it ================= */
  function keyCtx() { return { enabled: settings.keyMode !== 'off', rootPc: settings.keyRoot, mode: settings.keyMode }; }
  function extList() { var s = {}; st.latchedExt.concat(st.heldExt).forEach(function (e) { s[e] = 1; }); return Object.keys(s); }
  /* the Orchid way: a chord pad held, or the last one tapped, sets the chord every key plays on its own root.
     No pad chosen: with a key set, each key plays its chord in the key; with none, plain notes. */
  function specFor(rootPc) {
    var kc = keyCtx(), held = Object.keys(st.padHeld).sort(function (a, b) { return st.padHeld[a] - st.padHeld[b]; }), type = held.length ? held[held.length - 1] : st.selType;
    var sn = kc.enabled && !settings.chromatic ? M.snapToScale(rootPc, kc) : null, root = sn ? sn.pc : rootPc;
    if (type) { var sp = typeSpec(type, root); sp.pressedPc = rootPc; sp.snapped = !!(sn && sn.snapped); return sp; }
    if (kc.enabled) return M.chordFrom({ rootPc: rootPc, held: [], latched: null, ext: [], key: kc, playstyle: 'simple', chromaticAllowed: settings.chromatic });
    return { rootPc: root, quality: 'single', extensions: [], source: 'manual', snapped: !!(sn && sn.snapped), pressedPc: rootPc };
  }
  function voicing() { return { step: settings.vStep, octave: settings.octave, spread: settings.spread, smooth: settings.smooth, kb: settings.kbMode }; }
  function renderSpec(spec) { return M.render(spec, voicing(), st.last && st.last.notes); }
  function noteOnRoot(id, rootPc, vel, specOverride) {
    ensureAudio();
    if (st.owners[id]) releasePerformer(id);
    if (settings.latchPerf) Object.keys(st.owners).forEach(function (k) { var o = st.owners[k]; if (o.latched) releasePerformer(k); });
    var spec = specOverride || specFor(rootPc), notes = renderSpec(spec);
    var pf = makePerformer(id, spec, notes, { vel: vel, latched: settings.latchPerf && perfMode().kind !== 'shot' });
    pf.rootPc = rootPc; pf.held = true; pf.prevRef = st.last && st.last.notes; if (spec.quality === 'single') st.root = spec.rootPc;
    st.last = { spec: spec, notes: notes, name: nameFor(spec, pf), bass: pf.bassNote, at: performance.now(), snapped: spec.snapped };
    if (spec.quality !== 'single') { st.history.push(spec); if (st.history.length > 8) st.history.shift(); refreshSuggestions(); }
    captureGesture(pf);
    if (spec.snapped) say('SNAP ' + M.spellPc(spec.pressedPc, keyCtx()) + '>' + M.spellPc(spec.rootPc, keyCtx()), '', 900);
    changed(); return pf;
  }
  function nameFor(spec, pf) { var bm = M.BASS_MODES[settings.bassMode]; return M.chordName(spec, keyCtx(), bm !== 'OFF' && spec.quality !== 'single' ? M.mod12(pf.bassNote) : spec.explicitBassPc); }
  function rebass() {
    Object.keys(st.owners).forEach(function (k) { var pf = st.owners[k]; if (pf.loop) return; retune(pf, pf.spec, pf.notes); if (st.last) { st.last.name = nameFor(pf.spec, pf); st.last.bass = pf.bassNote; } });
    changed();
  }
  function noteOffRoot(id) {
    var pf = st.owners[id]; if (!pf) return;
    if (pf.latched) { pf.held = false; changed(); return; }
    releasePerformer(id); changed();
  }
  /* quality / extension keys changed. SIMPLE: the chord is fixed at the root press. ADVANCED: a quality or extension pressed after the
     root turns it into that chord, and letting go keeps it. FREE: both pressing and letting go re-shape the held chord. */
  function liveUpdate(isRelease) {
    if (settings.playstyle === 'simple') return;
    if (isRelease && settings.playstyle === 'advanced') return;
    Object.keys(st.owners).forEach(function (k) {
      var pf = st.owners[k]; if (pf.loop || pf.rootPc === undefined || pf.spec.source === 'suggestion') return;
      var spec = specFor(pf.rootPc), n = M.render(spec, voicing(), pf.prevRef);
      if (n.join() !== pf.notes.join()) { retune(pf, spec, n); st.last = { spec: spec, notes: n, name: nameFor(spec, pf), bass: pf.bassNote, at: performance.now() }; }
    });
    changed();
  }
  function revoice() {
    Object.keys(st.owners).forEach(function (k) { var pf = st.owners[k]; if (pf.loop) return; var n = M.render(pf.spec, voicing(), pf.prevRef); if (n.join() !== pf.notes.join()) { retune(pf, pf.spec, n); if (st.last) { st.last.notes = n; } } });
    if (st.last && !Object.keys(st.owners).length) st.last.notes = M.render(st.last.spec, voicing(), null);
  }
  function qualityDown(q) { if (st.heldQ.indexOf(q) < 0) st.heldQ.push(q); if (settings.playstyle === 'instant' && settings.keyMode === 'off') st.latchedQ = M.comboQuality(st.heldQ, settings.susType); liveUpdate(); }
  function qualityUp(q, tapOnly) {
    var wasOnly = st.heldQ.length === 1;
    st.heldQ = st.heldQ.filter(function (x) { return x !== q; });
    if (settings.playstyle === 'instant' && settings.keyMode === 'off' && wasOnly && tapOnly && st._prevLatch === M.comboQuality([q], settings.susType)) st.latchedQ = null;
    liveUpdate(true);
  }
  function extDown(e) {
    st.latestExt = e;
    if (settings.playstyle === 'instant') { var i = st.latchedExt.indexOf(e); if (i >= 0) st.latchedExt.splice(i, 1); else st.latchedExt.push(e); st.latchedExt = M.normalizeExtensions(st.latchedExt, e, settings.clusters); }
    else if (st.heldExt.indexOf(e) < 0) st.heldExt.push(e);
    liveUpdate();
  }
  function extUp(e) { if (settings.playstyle !== 'instant') { st.heldExt = st.heldExt.filter(function (x) { return x !== e; }); liveUpdate(true); } }
  /* ================= the eight chord pads: each plays its chord on the root last picked on the keyboard ================= */
  var TYPES = [['MAJ', 'major', []], ['MIN', 'minor', []], ['7', 'major', ['b7']], ['m7', 'minor', ['b7']], ['M7', 'major', ['maj7']], ['SUS2', 'sus2', []], ['SUS4', 'sus4', []], ['DIM', 'dim', []]];
  function typeSpec(type, rootPc) { var t = TYPES.filter(function (x) { return x[0] === type; })[0]; return { rootPc: rootPc, quality: t[1], extensions: t[2].slice(), source: 'manual', snapped: false, pressedPc: rootPc, type: type }; }
  function typeOf(spec) {
    var q = spec.quality, e = spec.extensions || [];
    if (q === 'minor') return e.indexOf('b7') >= 0 ? 'm7' : 'MIN';
    if (q === 'dim') return 'DIM'; if (q === 'sus2') return 'SUS2'; if (q === 'sus4') return 'SUS4';
    return e.indexOf('b7') >= 0 ? '7' : e.indexOf('maj7') >= 0 ? 'M7' : 'MAJ';
  }
  /* a pad: pressing it makes its chord the one every key plays (and re-chords any key already held); a quick tap on the
     chosen pad, with no key played meanwhile, clears it back to single notes */
  var padSeq = 0, padInfo = {};
  function padDown(type) {
    padInfo[type] = { was: st.selType === type, t: performance.now(), keys: 0 };
    st.padHeld[type] = ++padSeq; st.selType = type; rechord(); changed();
  }
  function padUp(type) {
    var inf = padInfo[type] || {}; delete st.padHeld[type];
    if (inf.was && !inf.keys && performance.now() - inf.t < 400) { st.selType = null; }
    else if (!Object.keys(st.padHeld).length) st.selType = type;
    changed();
  }
  function rechord() {
    Object.keys(st.owners).forEach(function (k) {
      var pf = st.owners[k]; if (pf.loop || pf.rootPc === undefined || (!pf.held && !pf.latched)) return;
      var spec = specFor(pf.rootPc), n = M.render(spec, voicing(), pf.prevRef);
      if (n.join() !== pf.notes.join() || spec.type !== pf.spec.type) { retune(pf, spec, n); pf.spec = spec; st.last = { spec: spec, notes: n, name: nameFor(spec, pf), bass: pf.bassNote, at: performance.now() }; if (spec.quality !== 'single') { st.history.push(spec); if (st.history.length > 8) st.history.shift(); refreshSuggestions(); } }
    });
  }
  function keyDown(id, pc, vel) { Object.keys(padInfo).forEach(function (t) { padInfo[t].keys++; }); return noteOnRoot(id, pc, vel); }
  function releaseAll(includeLatched) { Object.keys(st.owners).forEach(function (k) { var o = st.owners[k]; if (!o.loop && (includeLatched || !o.latched)) releasePerformer(k); }); st.heldQ = []; st.heldExt = []; changed(); }
  /* ================= wheels: pitch bend (+/- 2 semitones, springs back) and modulation (vibrato) ================= */
  var wheel = { bend: 0, mod: 0, sentBend: null, sentMod: null }, bassVoices = [];
  function wheelOn(oscs) { oscs.forEach(function (n) { n._base = n.detune.value; n.detune.value = n._base + wheel.bend * 200; try { (G.pmod || G.vibAmt).connect(n.detune); } catch (e) {} }); }
  function wheelOff(oscs) { oscs.forEach(function (n) { try { (G.pmod || G.vibAmt).disconnect(n.detune); } catch (e) {} }); }
  function midiWheels() {
    if (!MIDI.out) return;
    var b = Math.round((wheel.bend + 1) / 2 * 16383), m = Math.round(wheel.mod * 127), ts = performance.now();
    [settings.perfCh, settings.bassCh, settings.chordCh].forEach(function (ch) {
      if (!ch) return;
      if (b !== wheel.sentBend) rawSend([0xe0 | (ch - 1), b & 127, (b >> 7) & 127], ts);
      if (m !== wheel.sentMod) rawSend([0xb0 | (ch - 1), 1, m], ts);
    });
    if (b !== wheel.sentBend) midiLog('BEND', settings.perfCh, b, 0, ts); if (m !== wheel.sentMod) midiLog('MOD', settings.perfCh, m, 0, ts);
    wheel.sentBend = b; wheel.sentMod = m;
  }
  function setBend(v) {
    wheel.bend = clamp(v, -1, 1);
    if (ctx) { var t = ctx.currentTime; voices.forEach(function (vc) { if (!vc.done && vc.pitched) vc.pitched.forEach(function (n) { n.detune.setTargetAtTime(n._base + wheel.bend * 200, t, 0.008); }); }); bassVoices.forEach(function (os) { os.forEach(function (n) { n.detune.setTargetAtTime(n._base + wheel.bend * 200, t, 0.008); }); }); }
    midiWheels();
  }
  /* the FX wheel also travels as MIDI: reverb 91, chorus 93, delay 94, filter 74, the rest on general-purpose CCs */
  var FX_CC = { reverb: 91, chorus: 93, delay: 94, delayFb: 95, filter: 74, character: 12, width: 13, delayDiv: 14 };
  function sendFxCC(key, norm) { var cc = FX_CC[key], ch = settings.perfCh; if (!cc || !ch || !MIDI.out) return; var v = Math.round(clamp(norm, 0, 1) * 127); if (wheel['cc' + cc] === v) return; wheel['cc' + cc] = v; rawSend([0xb0 | (ch - 1), cc, v], performance.now()); midiLog('CC' + cc, ch, v, 0, performance.now()); }
  function setMod(v) { wheel.mod = clamp(v, 0, 1); if (ctx) smooth(G.vibAmt.gain, wheel.mod * wheel.mod * 45, 0.03); midiWheels(); }
  function panic() {
    setBend(0);
    Object.keys(st.owners).forEach(function (k) { releasePerformer(k); });
    recs.forEach(function (r) { r.offT = nowT(); commit(r); }); recs = [];
    voices.slice().forEach(function (v) { v.stop(nowT()); }); if (bassVoice) bassVoice.stop(nowT());
    midiPanic(); st.heldQ = []; st.heldExt = []; say('ALL OFF', '', 900);
  }

  /* ================= harmony suggestions (off the audio path, stale results dropped) ================= */
  function refreshSuggestions() {
    var token = ++st.suggToken, key = settings.keyMode !== 'off' ? keyCtx() : null, hist = st.history.slice();
    setTimeout(function () {
      if (token !== st.suggToken) return;
      var r = M.suggest(hist, key, { unexpected: settings.unexpected, seed: hist.length + 1 });
      if (token !== st.suggToken) return;
      var keep = st.sugg.ai && st.sugg.sig === aiSig(hist) ? st.sugg : null;
      var seen = {}, items = r.items.map(function (c) { return typeSpec(typeOf(c.spec), c.spec.rootPc); }).filter(function (sp) { var k = sp.rootPc + sp.type; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 3);
      st.sugg = keep || { items: items.map(function (sp) { return { spec: sp, name: M.chordName(sp, r.key), notes: M.render(sp, voicing(), st.last && st.last.notes) }; }), key: r.key, ai: false };
      changed(); aiNext(hist);
    }, 0);
  }
  /* ================= the next three chords, asked of Claude =================
     After you stop changing chords for a moment, the progression so far goes to Claude, which answers with three chords
     the instrument can play. Until it answers (or if it can't), the offline suggestions above stand in. */
  var AI = { fn: null, off: false, timer: 0, busy: '', state: 'none' };
  try { if (window.claude && window.claude.use) window.claude.use('sample').then(function (f) { AI.fn = f; AI.state = f ? 'ready' : 'none'; changed(); }).catch(function () {}); } catch (e) {}
  var PCN = { C: 0, 'B#': 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, FB: 4, F: 5, 'E#': 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11, CB: 11 };
  function aiSig(hist) { return hist.slice(-6).map(function (h) { return M.chordName(h, { enabled: false }); }).join(' ') + '|' + (settings.keyMode !== 'off' ? settings.keyRoot + settings.keyMode : '') + '|' + settings.unexpected; }
  function aiNext(hist) {
    clearTimeout(AI.timer);
    if (!AI.fn || AI.off || !settings.aiNext || !hist.length) return;
    var sig = aiSig(hist); if (sig === AI.busy || (st.sugg.ai && st.sugg.sig === sig)) return;
    AI.timer = setTimeout(function () {
      var kc = settings.keyMode !== 'off' ? keyCtx() : null, names = hist.slice(-6).map(function (h) { return M.chordName(h, kc || { enabled: false }); });
      var flavour = ['familiar and safe', 'balanced: one familiar, one fresh, one surprising', 'adventurous and unexpected'][Math.round(settings.unexpected * 2)];
      var prompt = 'You suggest chords for a player on a chord instrument. They just played, oldest first: ' + names.join(' ') + '.' +
        (kc ? ' They are playing in ' + M.spellPc(kc.rootPc, kc) + ' ' + kc.mode + '.' : '') +
        ' Suggest the 3 best chords to play next, best first. Make them ' + flavour + '.' +
        ' The instrument can only play these chord types: MAJ (major triad), MIN (minor triad), 7 (dominant seventh), m7 (minor seventh), M7 (major seventh), SUS2, SUS4, DIM (diminished triad).' +
        ' Each chord is a root (C, C#, Db, D, ... B) and one of those types. Reply with only a JSON array of 3 objects, no repeats: [{"root":"F","type":"M7"}]';
      AI.busy = sig; AI.state = 'asking'; changed();
      AI.fn.json(prompt, { modelTier: 'quick' }).then(function (arr) {
        AI.busy = ''; AI.state = 'ready';
        if (!Array.isArray(arr) || aiSig(st.history) !== sig) { changed(); return; }
        var items = arr.slice(0, 3).map(function (c) {
          var pc = PCN[String(c && c.root || '').trim().toUpperCase().replace('♯', '#').replace('♭', 'B')], ty = String(c && c.type || '').trim();
          var hit = TYPES.filter(function (x) { return x[0] === ty; })[0] || (/^(maj|min|sus2|sus4|dim)$/i.test(ty) ? TYPES.filter(function (x) { return x[0] === ty.toUpperCase(); })[0] : null);
          if (pc === undefined || !hit) return null;
          var spec = typeSpec(hit[0], pc); spec.source = 'suggestion';
          return { spec: spec, name: M.chordName(spec, kc || { enabled: false }), notes: M.render(spec, voicing(), st.last && st.last.notes) };
        }).filter(Boolean);
        if (items.length) { st.sugg = { items: items, key: st.sugg.key, ai: true, sig: sig }; }
        changed();
      }).catch(function (e) {
        AI.busy = ''; var c = e && e.code;
        if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled' || c === 'capability_removed') { AI.off = true; AI.state = 'off'; }
        else AI.state = c === 'rate_limited' ? 'busy' : 'ready';
        changed();
      });
    }, 900);
  }

  /* ================= transport, beats, metronome, MIDI clock ================= */
  function play(atTick) {
    ensureAudio(); if (st.playing) return;
    var t = nowT() + 0.06; st.playing = true; st.origin = atTick !== undefined ? atTick : tickAt(t);
    st.beatCursor = st.origin; st.metroCursor = st.origin; st.clockCursor = st.origin; st.beatNow = settings.beat;
    if (settings.clockOut && MIDI.out) { rawSend([0xfa], midiTs(timeAt(st.origin))); midiLog('START', 0, 0, 0, performance.now()); }
    if (st.loop.state === 'stopped' || st.loop.state === 'playing') { st.loop.state = 'playing'; st.loop.origin = st.origin; st.loop.cursor = st.origin; }
    changed();
  }
  function stop() {
    if (!st.playing) return; st.playing = false;
    if (settings.clockOut && MIDI.out) { rawSend([0xfc], performance.now()); midiLog('STOP', 0, 0, 0, performance.now()); }
    Object.keys(st.owners).forEach(function (k) { if (st.owners[k].loop) releasePerformer(k); });
    var L = st.loop;
    if (L.state === 'countin' || L.state === 'recording') finishFirstPass(true);
    if (L.dub) endOverdub();
    if (L.state === 'playing') L.state = 'stopped';
    st.uiStep = -1; changed();
  }

  /* ================= looper: musical events, not audio ================= */
  var gid = 1;
  function captureGesture(pf) {
    var L = st.loop, tk = pf.start, g = null;
    var base = { notes: pf.notes.slice(), chordNotes: pf.notes.slice(), mode: pf.mode, rateIdx: pf.rateIdx, gate: pf.gate, strumMs: pf.strumMs, seed: pf.seed, vel: pf.vel, bassMode: pf.bassMode, bassNote: pf.bassNote, bassPat: pf.bassPat,
      lead: pf.lead, arpOct: pf.arpOct, humanize: pf.humanize, probability: pf.probability, oneShot: pf.oneShot, name: st.last ? st.last.name : '' };
    /* take: everything played, for a MIDI file even without a loop */
    var tg = Object.assign({ id: gid++, on: tk, off: null }, base); st.take.push(tg); if (st.take.length > 96) st.take.shift();
    if ((L.state === 'recording' && tk >= L.recStart - STEP16 && tk < L.recEnd) || (L.state === 'countin' && tk >= L.recStart - PPQ / 4)) {
      var rel = Math.max(0, tk - L.recStart); g = Object.assign({ id: gid++, on: quant(rel), off: null, _rawOn: rel, _layer: L.layers[0] }, base); L.layers[0].gestures.push(g);
    } else if (L.dub && tk >= L.dub.start) {
      var r2 = ((tk - L.origin) % L.lenTicks + L.lenTicks) % L.lenTicks; g = Object.assign({ id: gid++, on: quant(r2) % L.lenTicks, off: null, _rawOn: r2, _held: tk, _layer: L.dub.layer }, base); L.dub.layer.gestures.push(g);
    }
    pf.gesture = {
      closeAt: function (offTick) {
        if (tg.off === null) tg.off = offTick;
        if (g && g.off === null) { var dur = offTick - tk; g.off = Math.min(L.lenTicks || (L.recEnd - L.recStart), Math.max(g.on + STEP16 / 2, g.on + dur)); }
      },
      update: function (notes, bassNote) { /* a live change inside a held gesture becomes a new gesture from here on */
        var at = nowTick(); this.closeAt(at); var npf = { start: at, notes: notes, mode: pf.mode, rateIdx: pf.rateIdx, gate: pf.gate, strumMs: pf.strumMs, seed: pf.seed, vel: pf.vel, bassMode: pf.bassMode, bassNote: bassNote, bassPat: pf.bassPat, lead: pf.lead, arpOct: pf.arpOct, humanize: pf.humanize, probability: pf.probability, oneShot: pf.oneShot };
        captureGesture(npf); pf.gesture = npf.gesture;
      }
    };
  }
  /* non-destructive in spirit: the raw onset is kept on the gesture (_rawOn); strength pulls it part or all of the way to the grid */
  function quant(t) { var q = (QUANTS[settings.quant] || QUANTS[0]).t; if (!q) return Math.round(t); var g = Math.round(t / q) * q; return Math.round(t + (g - t) * clamp(settings.quantStr, 0, 1)); }
  function rec() {
    ensureAudio(); var L = st.loop;
    var BAR = barT();
    if (L.state === 'empty') {
      L.layers = [{ id: 'base', gestures: [] }]; L.redo = [];
      if (!settings.loopBars) { /* FREE: starts now, no count-in; the next LOOP press sets the length */
        L.free = true; L.bars = 0; if (!st.playing) play(); L.recStart = nowTick(); L.lenTicks = 0; L.recEnd = Infinity; L.state = 'recording'; changed(); return;
      }
      L.free = false; L.bars = settings.loopBars; L.lenTicks = L.bars * BAR;
      if (!st.playing) { play(); L.recStart = st.origin + BAR; L.state = 'countin'; }
      else { var rel = nowTick() - st.origin, nb = Math.ceil(rel / BAR - 0.02) * BAR; L.recStart = st.origin + nb; L.state = 'countin'; }
      L.recEnd = L.recStart + L.lenTicks; changed(); return;
    }
    if (L.state === 'recording' && L.free) { /* close the free loop, rounded to the nearest quarter note */
      L.lenTicks = Math.max(PPQ, Math.round((nowTick() - L.recStart) / PPQ) * PPQ); L.recEnd = L.recStart + L.lenTicks; L.bars = +(L.lenTicks / BAR).toFixed(2);
      finishFirstPass(false); changed(); return;
    }
    if (L.state === 'countin' || L.state === 'recording') { say('RECORDING', 'WAIT', 900); return; }
    if (L.state === 'stopped') { play(); }
    if (L.dub) { endOverdub(); return; }
    var start = nowTick(); L.dub = { start: start, end: start + L.lenTicks, layer: { id: 'od' + gid++, gestures: [] } };
    Object.keys(st.owners).forEach(function (k) { var o = st.owners[k]; if (!o.loop) captureGestureLate(o); });
    changed();
  }
  function captureGestureLate(o) { /* a chord already held when overdub starts is recorded from the dub start */ var save = o.start; o.start = Math.max(o.start, st.loop.dub.start); captureGesture(o); o.start = save; }
  function endOverdub() {
    var L = st.loop, d = L.dub; if (!d) return; L.dub = null;
    d.layer.gestures.forEach(function (g) { if (g.off === null) g.off = Math.min(L.lenTicks, Math.max(g.on + STEP16, g.on + (nowTick() - g._held))); });
    d.layer.gestures = d.layer.gestures.filter(function (g) { return g.off > g.on; });
    if (d.layer.gestures.length) { L.layers.push(d.layer); L.redo = []; say('LAYER ' + L.layers.length, '', 900); } else say('NO NOTES', '', 900);
    changed();
  }
  function finishFirstPass(aborted) {
    var L = st.loop, base = L.layers[0];
    if (!L.lenTicks) L.lenTicks = Math.max(PPQ, Math.round((nowTick() - L.recStart) / PPQ) * PPQ);
    base.gestures.forEach(function (g) { if (g.off === null) g.off = L.lenTicks; g.off = Math.min(g.off, L.lenTicks); g.on = Math.min(g.on, L.lenTicks - 1); });
    base.gestures = base.gestures.filter(function (g) { return g.off > g.on; });
    if (!base.gestures.length) { L.state = 'empty'; L.layers = []; say(aborted ? 'REC STOP' : 'EMPTY LOOP', '', 1200); return; }
    L.state = st.playing ? 'playing' : 'stopped'; L.origin = L.recStart; L.cursor = L.recEnd;
    say(L.free ? 'FREE LOOP' : 'LOOP ' + L.bars + ' BAR' + (L.bars > 1 ? 'S' : ''), L.free ? (L.lenTicks / PPQ) + ' BEATS' : '', 1200);
  }
  /* undo and redo act on finished overdub layers only, never on the base pass and never on what is still recording */
  function undoLayer() { var L = st.loop; if (L.dub) { L.dub = null; say('DUB OFF', '', 900); changed(); return; } if (L.layers.length > 1) { (L.redo = L.redo || []).push(L.layers.pop()); say('UNDO', 'LAYER ' + (L.layers.length + 1) + ' OFF', 900); } else say('NOTHING TO UNDO', 'CLEAR TO START OVER', 1100); changed(); }
  function redoLayer() { var L = st.loop; if (L.redo && L.redo.length) { L.layers.push(L.redo.pop()); say('REDO', 'LAYER ' + L.layers.length, 900); } else say('NOTHING TO REDO', '', 1000); changed(); }
  function emptyLoop() { return { state: 'empty', lenTicks: 0, bars: settings.loopBars, layers: [], redo: [], origin: 0, recStart: 0, recEnd: 0, cursor: 0, dub: null }; }
  function clearLoop() { Object.keys(st.owners).forEach(function (k) { if (st.owners[k].loop) releasePerformer(k); }); st.loop = emptyLoop(); say('LOOP CLEAR', '', 1000); changed(); }
  /* saved loops: eight slots on this device */
  function slots() { try { return JSON.parse(localStorage.getItem(SLOTS) || '[]'); } catch (e) { return []; } }
  function saveSlot(i) {
    var L = st.loop; if (!L.layers.length || L.state === 'countin' || L.state === 'recording') { say('NO LOOP', 'RECORD ONE FIRST', 1300); return; }
    var a = slots(); a[i] = { bars: L.bars, lenTicks: L.lenTicks, bpm: settings.bpm, meter: settings.meter, layers: L.layers.map(function (l) { return { id: l.id, gestures: l.gestures.map(clean) }; }), at: new Date().toISOString() };
    try { localStorage.setItem(SLOTS, JSON.stringify(a)); say('SAVED', 'LOOP SLOT ' + (i + 1), 1200); } catch (e) { say('NOT SAVED', 'STORAGE FULL', 1400); }
    changed();
  }
  function loadSlot(i) {
    var d = slots()[i]; if (!d) { say('EMPTY SLOT', '', 1000); return; }
    stop(); Object.keys(st.owners).forEach(function (k) { if (st.owners[k].loop) releasePerformer(k); });
    st.loop = emptyLoop(); st.loop.state = 'stopped'; st.loop.bars = d.bars; st.loop.lenTicks = d.lenTicks; st.loop.layers = d.layers;
    settings.meter = d.meter || 0; setBpm(d.bpm || settings.bpm); say('LOADED', 'LOOP SLOT ' + (i + 1), 1200); changed();
  }
  function serviceLoop(horizon) {
    var L = st.loop;
    if (L.state === 'countin' && nowTick() >= L.recStart) { L.state = 'recording'; changed(); }
    if (L.state === 'recording' && nowTick() >= L.recEnd) { finishFirstPass(false); Object.keys(st.owners).forEach(function (k) { var o = st.owners[k]; if (!o.loop && o.gesture) { /* still held: its loop copy ends at the seam */ } }); changed(); }
    if (L.dub && nowTick() >= L.dub.end) endOverdub();
    if (L.state !== 'playing' || !st.playing) return;
    if (L.cursor >= horizon) return;
    var from = L.cursor, len = L.lenTicks;
    var c0 = Math.floor((from - L.origin) / len), c1 = Math.floor((horizon - L.origin) / len);
    for (var c = c0; c <= c1; c++) {
      var o = L.origin + c * len;
      L.layers.forEach(function (layer) {
        if (L.dub && layer === L.dub.layer) return;
        layer.gestures.forEach(function (g) {
          var on = o + g.on; if (on < from || on >= horizon) return;
          makePerformer('loop:' + layer.id + ':' + g.id + ':' + c, M.chordFrom({ rootPc: 0, held: [], ext: [], key: { enabled: false } }), g.notes, { loop: true, start: on, end: o + g.off, mode: g.mode, rateIdx: g.rateIdx, gate: g.gate, strumMs: g.strumMs, seed: g.seed, vel: g.vel,
            bassMode: g.bassMode || 'OFF', bassNote: g.bassNote, bassPat: g.bassPat, lead: g.lead, arpOct: g.arpOct, humanize: g.humanize, probability: g.probability, oneShot: g.oneShot });
          st.loopName = g.name; st.loopNameAt = timeAt(on);
        });
      });
    }
    L.cursor = horizon;
  }
  function retireLoopPerformers() {
    var tk = nowTick();
    Object.keys(st.owners).forEach(function (k) { var o = st.owners[k]; if (o.loop && o.end !== null && tk >= o.end + 2 && o.cursor >= o.end) { delete st.owners[k]; } });
  }

  /* ================= the scheduler ================= */
  var timer = null, lastUi = 0;
  function pass() {
    if (!ctx) return;
    var t = nowT(), horizonT = t + LOOKAHEAD, horizon = tickAt(horizonT);
    serviceLoop(horizon);
    Object.keys(st.owners).forEach(function (k) { servicePerformer(st.owners[k], horizon); });
    retireLoopPerformers();
    if (st.playing) {
      /* a new beat waits for the next bar line, so the groove never jumps mid-bar */
      var BAR = barT(), spb = stepsPerBar();
      if (st.beatNow !== settings.beat) { var nextBar = st.origin + Math.ceil((st.beatCursor - st.origin) / BAR - 1e-6) * BAR; if (st.beatNow === -1 || st.beatCursor <= st.origin + 1) nextBar = st.beatCursor; if (horizon > nextBar) { if (st.beatNow >= 0 && nextBar > st.beatCursor) M.beatEvents(st.beatNow, st.origin, st.beatCursor, nextBar, settings.swing, spb).forEach(function (e) { playDrum(e.voice, e.vel, Math.max(t, timeAt(e.on))); }); st.beatCursor = Math.max(st.beatCursor, nextBar); st.beatNow = settings.beat; } }
      if (st.beatNow >= 0) M.beatEvents(st.beatNow, st.origin, st.beatCursor, horizon, settings.swing, spb).forEach(function (e) { playDrum(e.voice, e.vel, Math.max(t, timeAt(e.on))); });
      st.beatCursor = horizon;
      var L = st.loop, metroOn = L.state === 'countin' || (settings.metro && (L.state === 'recording' || L.dub)), beatT = meter()[1] === 8 ? PPQ / 2 : PPQ;
      for (var b = Math.ceil((st.metroCursor - st.origin) / beatT) * beatT + st.origin; b < horizon; b += beatT) if (b >= st.metroCursor && metroOn) click(Math.max(t, timeAt(b)), ((b - st.origin) % BAR) === 0);
      st.metroCursor = horizon;
      if (settings.clockOut && MIDI.out) { var cs = PPQ / 24; for (var c = Math.ceil((st.clockCursor - st.origin) / cs) * cs + st.origin; c < horizon; c += cs) if (c >= st.clockCursor) rawSend([0xf8], midiTs(Math.max(t, timeAt(c)))); }
      st.clockCursor = horizon;
      var step = Math.floor((tickAt(t) - st.origin) / STEP16);
      if (step !== st.uiStep) { st.uiStep = step; changed(); }
    }
    pumpRecs(horizonT);
    var p = performance.now(); if (MIDI.dirty && p - lastUi > 120) { MIDI.dirty = false; lastUi = p; changed(); }
  }
  function startClock() { if (!timer) timer = setInterval(pass, TICK_MS); }

  /* ================= export ================= */
  function exportData() {
    var L = st.loop, gestures, bpm = settings.bpm, label;
    if (L.layers.length && L.state !== 'countin' && L.state !== 'recording') { gestures = [].concat.apply([], L.layers.map(function (l) { return l.gestures; })); label = 'loop'; }
    else {
      var take = st.take.filter(function (g) { return g.off !== null; }); if (!take.length) return null;
      var BAR = barT(), t0 = Math.floor(take[0].on / BAR) * BAR; gestures = take.map(function (g) { return Object.assign({}, g, { on: g.on - t0, off: g.off - t0 }); }); label = 'take';
    }
    var r = M.renderGestures(gestures, { bpm: bpm, swing: settings.swing, origin: 0 });
    var tracks = [{ name: 'SYNE MOTH performance', ch: settings.perfCh || 1, notes: r.perf }, { name: 'SYNE MOTH bass', ch: settings.bassCh || 2, notes: r.bass }, { name: 'SYNE MOTH block chords', ch: settings.chordCh || 3, notes: r.chord }];
    if (label === 'loop' && settings.beat >= 0) {
      var dn = []; M.beatEvents(settings.beat, 0, 0, L.lenTicks, settings.swing, stepsPerBar()).forEach(function (e) { dn.push({ pitch: M.DRUM_GM[e.voice], on: e.on, off: e.on + 60, vel: e.vel }); });
      tracks.push({ name: 'SYNE MOTH beat', ch: 10, notes: dn });
    }
    var mt = meter(), bytes = M.writeSMF({ bpm: bpm, num: mt[0], den: mt[1], title: 'SYNE MOTH ' + label, tracks: tracks.filter(function (t) { return t.notes.length; }) });
    return { bytes: bytes, label: label, counts: { perf: r.perf.length, bass: r.bass.length, chord: r.chord.length } };
  }
  function project() {
    return { schemaVersion: 1, app: 'SYNE MOTH', id: 'syne-moth', name: 'SYNE MOTH project', modifiedAtISO: new Date().toISOString(), tempoBPM: settings.bpm, meter: { numerator: meter()[0], denominator: meter()[1] },
      key: { rootPc: settings.keyRoot, mode: settings.keyMode, enabled: settings.keyMode !== 'off' }, settings: settings,
      loops: st.loop.layers.length ? [{ id: 'loop1', bars: st.loop.bars, lengthTicks: st.loop.lenTicks, layers: st.loop.layers.map(function (l) { return { id: l.id, events: l.gestures.map(clean) }; }) }] : [] };
  }
  function clean(g) { var o = {}; Object.keys(g).forEach(function (k) { if (k[0] !== '_') o[k] = g[k]; }); return o; }
  function loadProject(p, silent) {
    if (!p || p.schemaVersion !== 1 || !p.settings) throw new Error('not a SYNE MOTH project');
    var s = p.settings; Object.keys(DEF).forEach(function (k) { if (s[k] !== undefined && typeof s[k] === typeof DEF[k]) settings[k] = s[k]; });
    /* migrate earlier builds: space/movement became reverb/chorus, HOLD playstyle became SIMPLE */
    if (s.space !== undefined && s.reverb === undefined) settings.reverb = s.space;
    if (s.movement !== undefined && s.chorus === undefined) settings.chorus = s.movement;
    if (settings.playstyle === 'hold') settings.playstyle = 'simple';
    /* SYNE MOTH has no bass, loop or beat controls: anything saved by an earlier build is switched off */
    if (s.uiv !== 4 && s.uiv !== 5) { settings.bassMode = 0; settings.beat = -1; }
    if (s.uiv !== 6) { settings.preset = DEFAULT_SOUND; settings.userSounds = []; settings.chordsOn = false; settings.tone = 1; EDIT_KEYS.forEach(function (k) { settings[k] = DEF[k]; }); settings.uiv = 6; }
    if (['instant', 'simple', 'advanced', 'free'].indexOf(settings.playstyle) < 0) settings.playstyle = 'instant';
    if (!Array.isArray(settings.userSounds)) settings.userSounds = []; settings.userSounds = settings.userSounds.filter(function (u) { return u && u.base >= 0 && u.base < FACTORY; }).slice(0, 30);
    settings.preset = clamp(settings.preset | 0, 0, soundCount() - 1); settings.perfMode = clamp(settings.perfMode | 0, 0, M.PERF_MODES.length - 1); settings.beat = clamp(settings.beat | 0, -1, M.BEATS.length - 1);
    settings.bassMode = clamp(settings.bassMode | 0, 0, M.BASS_MODES.length - 1); settings.rateIdx = clamp(settings.rateIdx | 0, 0, M.RATES.length - 1); settings.meter = clamp(settings.meter | 0, 0, METERS.length - 1);
    settings.quant = clamp(settings.quant | 0, 0, QUANTS.length - 1); settings.delayDiv = clamp(settings.delayDiv | 0, 0, DELAY_DIVS.length - 1); settings.bassPat = clamp(settings.bassPat | 0, 0, M.BASS_PATTERNS.length - 1);
    if ([0, 1, 2, 4, 8, 16].indexOf(settings.loopBars) < 0) settings.loopBars = 4;
    anchor.bpm = settings.bpm = clamp(settings.bpm, 40, 240);
    /* SYNE MOTH has no looper: a loop saved by an earlier build is dropped so nothing ever plays by itself */
    var lp = null; st.loop = { state: 'empty', lenTicks: 0, bars: 4, layers: [], redo: [], origin: 0, recStart: 0, recEnd: 0, cursor: 0, dub: null };
    if (lp && lp.layers && lp.layers.length) {
      st.loop = { state: 'stopped', bars: lp.bars || 4, lenTicks: lp.lengthTicks || (lp.bars || 4) * barT(), redo: [], layers: lp.layers.map(function (l) { return { id: l.id, gestures: (l.events || []).filter(function (g) { return g && g.notes && g.off > g.on; }) }; }), origin: 0, recStart: 0, recEnd: 0, cursor: 0, dub: null };
    }
    applySound(); if (!silent) say('LOADED', '', 1200); changed();
  }
  /* ================= bounce: one pass of the loop, rendered from the master output to a WAV ================= */
  function bounce() {
    return new Promise(function (resolve, reject) {
      var L = st.loop; if (!L.layers.length || L.state === 'countin' || L.state === 'recording') { reject(new Error('no loop')); return; }
      ensureAudio(); startClock(); if (st.playing) stop(); releaseAll(true);
      var sp = ctx.createScriptProcessor(4096, 2, 2), sink = ctx.createGain(), bufs = [[], []], frames = 0, sr = ctx.sampleRate;
      sink.gain.value = 0; G.out.connect(sp); sp.connect(sink); sink.connect(ctx.destination);
      var need = Math.round((L.lenTicks * 60 / (settings.bpm * PPQ) + 2.2) * sr), started = false;
      sp.onaudioprocess = function (e) {
        if (!started) return;
        for (var c = 0; c < 2; c++) bufs[c].push(new Float32Array(e.inputBuffer.getChannelData(c)));
        frames += e.inputBuffer.length;
        if (frames >= need) {
          started = false; sp.onaudioprocess = null; try { G.out.disconnect(sp); sp.disconnect(); sink.disconnect(); } catch (x) {}
          stop(); st.bouncing = false; changed();
          resolve(wav(bufs, Math.min(frames, need), sr));
        }
      };
      st.bouncing = true; say('BOUNCING', 'ONE PASS + TAIL', Math.round(need / sr * 1000) + 400);
      setTimeout(function () { started = true; play(); }, 60);
    });
  }
  /* renders one sound offline (no FX bus) and measures it: used by the tests to check every patch speaks, stays finite and sits at a sane level */
  function renderTest(i, notes, hold, tail, vel) {
    var sr = 44100, off = new OfflineAudioContext(2, Math.round((hold + tail) * sr), sr), keep = { ctx: ctx, G: G, voices: voices, preset: settings.preset };
    ctx = off; G = { lead: off.createGain(), vibAmt: off.createGain(), plfo: off.createOscillator(), noise: null };
    G.noise = off.createBuffer(1, sr, sr); (function (d, r) { for (var k = 0; k < d.length; k++) d[k] = r() * 2 - 1; })(G.noise.getChannelData(0), M.mulberry(3));
    G.lead.connect(off.destination); voices = []; settings.preset = i; var p = patch(); G.plfo.type = 'triangle'; G.plfo.frequency.value = p.engine === 'juno' && p.lfo ? p.lfo : 0.6; G.plfo.start();
    var wb = wheel.bend; wheel.bend = 0;
    try { notes.map(function (n) { return leadVoice(n, vel || 100, 0.01); }).forEach(function (v) { v.stop(0.01 + hold); }); }
    finally { wheel.bend = wb; ctx = keep.ctx; G = keep.G; voices = keep.voices; settings.preset = keep.preset; }
    return off.startRendering().then(function (buf) {
      var d = buf.getChannelData(0), n = d.length, h = Math.round(hold * sr), pk = 0, sq = 0, bad = 0, zc = 0, last = 0, earlySq = 0, e = Math.round(0.3 * sr);
      var dsq = 0, prev = 0; for (var k = 0; k < n; k++) { var x = d[k]; if (!isFinite(x)) { bad++; continue; } if (k < h) { dsq += (x - prev) * (x - prev); prev = x; } pk = Math.max(pk, Math.abs(x)); if (k < h) { sq += x * x; if ((x >= 0) !== (last >= 0)) zc++; last = x; } if (k < e) earlySq += x * x; }
      var tailPk = 0; for (k = n - Math.round(0.05 * sr); k < n; k++) tailPk = Math.max(tailPk, Math.abs(d[k]));
      return { name: p.name, family: p.family, peak: pk, rms: Math.sqrt(sq / h), early: Math.sqrt(earlySq / e), bad: bad, zc: zc / hold, bright: Math.sqrt(dsq / (sq || 1)) * sr / (2 * Math.PI), tail: tailPk };
    });
  }
  function wav(bufs, n, sr) {
    var out = new DataView(new ArrayBuffer(44 + n * 4)), w = function (o, str) { for (var i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
    var o = 44, idx = 0;
    for (var b = 0; b < bufs[0].length && idx < n; b++) for (var i = 0; i < bufs[0][b].length && idx < n; i++, idx++) for (var c = 0; c < 2; c++) { var v = Math.max(-1, Math.min(1, bufs[c][b][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return new Uint8Array(out.buffer);
  }
  var saveT = null;
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(STORE, JSON.stringify(project())); } catch (e) {} }, 400); }
  function restore() { try { var raw = localStorage.getItem(STORE); if (raw) loadProject(JSON.parse(raw), true); } catch (e) { try { localStorage.setItem(STORE + '-corrupt-' + Date.now(), localStorage.getItem(STORE)); } catch (x) {} } }

  /* interruptions: release owned voices, never leave a stuck note */
  document.addEventListener('visibilitychange', function () { if (document.hidden) { releaseAll(false); } });
  window.addEventListener('pagehide', function () { releaseAll(true); midiPanic(); });
  window.addEventListener('blur', function () { releaseAll(false); });

  window.SyneChord = {
    M: M, PRESETS: PRESETS, settings: settings, DEF: DEF, st: st, MIDI: MIDI, flash: flash,
    subscribe: function (f) { subs.push(f); return function () { subs.splice(subs.indexOf(f), 1); }; }, changed: changed, say: say, msg: function () { return msg && msg.until > performance.now() ? msg : null; },
    ensureAudio: function () { var c = ensureAudio(); startClock(); return c; }, audioState: function () { return ctx ? ctx.state : 'none'; }, now: nowT, nowTick: nowTick, timeAt: timeAt,
    applySound: applySound, setBpm: setBpm, keyCtx: keyCtx, specFor: specFor, renderSpec: renderSpec, voicing: voicing,
    noteOnRoot: noteOnRoot, noteOffRoot: noteOffRoot, rebass: rebass, setBend: setBend, setMod: setMod, sendFxCC: sendFxCC, wheel: wheel, qualityDown: function (q) { st._prevLatch = st.latchedQ; qualityDown(q); }, qualityUp: qualityUp, extDown: extDown, extUp: extUp, extList: extList, liveUpdate: liveUpdate, revoice: revoice,
    releaseAll: releaseAll, panic: panic, play: play, stop: stop, rec: rec, undoLayer: undoLayer, clearLoop: clearLoop, refreshSuggestions: refreshSuggestions,
    requestMidi: requestMidi, selectOut: selectOut, midiPanic: midiPanic, exportData: exportData, project: project, loadProject: loadProject, restore: restore,
    activeCount: function () { return Object.keys(st.owners).filter(function (k) { return !st.owners[k].loop; }).length; },
    sounding: function () { var s = {}; recs.forEach(function (r) { if (r.stream === 'perf' && r.onT <= nowT() + 0.01) s[r.pitch] = 1; }); return s; },
    get BAR() { return barT(); }, barT: barT, stepsPerBar: stepsPerBar, METERS: METERS, QUANTS: QUANTS, DELAY_DIVS: DELAY_DIVS, FACTORY: FACTORY, FAMILIES: FAMILIES, AI: AI, TYPES: TYPES, padDown: padDown, padUp: padUp, keyDown: keyDown, typeOf: typeOf, EDIT_KEYS: EDIT_KEYS, renderTest: renderTest,
    soundCount: soundCount, soundAt: soundAt, selectSound: selectSound, saveUserSound: saveUserSound, deleteUserSound: deleteUserSound, delaySeconds: delaySeconds,
    redoLayer: redoLayer, saveSlot: saveSlot, loadSlot: loadSlot, slots: slots, bounce: bounce
  };
})();
