/* SYNE MOTH — headless touch test: one-screen fit, then every control through real pointer events. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const V = path.join(__dirname, '../vendor'), OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const mockAI = `window.__prompts = []; window.claude = { use: function (n) { if (n !== 'sample') return Promise.resolve(null); var f = function () { return Promise.reject({ code: 'upstream_error' }); }; f.json = function (p) { window.__prompts.push(p); return new Promise(function (r) { setTimeout(function () { r([{ root: 'F', type: 'M7' }, { root: 'G', type: 'MAJ' }, { root: 'E', type: 'm7' }]); }, 50); }); }; return Promise.resolve(f); } };`;
const mockMidi = `window.__sent = []; navigator.requestMIDIAccess = function () { var out = { id: 'o1', name: 'Test Synth', state: 'connected', type: 'output', send: function (d) { window.__sent.push(Array.from(d)); } }; return Promise.resolve({ outputs: new Map([['o1', out]]), inputs: new Map(), onstatechange: null }); };`;
const results = [], errors = [];
function check(name, ok, info) { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
(async () => {
  const browser = await chromium.launch();
  async function open(w, h, scheme) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme || 'light', hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(w + 'x' + h + ' ' + e.message));
    await p.route('**/*', r => { const u = r.request().url(); if (u.includes('react-dom')) return r.fulfill({ path: V + '/react-dom-18.3.1/package/umd/react-dom.production.min.js', contentType: 'text/javascript' }); if (u.includes('/react/')) return r.fulfill({ path: V + '/react-18.3.1/package/umd/react.production.min.js', contentType: 'text/javascript' }); if (u.startsWith('file:')) return r.continue(); return r.abort(); });
    await p.addInitScript(mockMidi); await p.addInitScript(mockAI);
    await p.goto('file://' + path.join(__dirname, '../dist/test.html')); await p.waitForTimeout(600);
    return p;
  }
  async function fits(p) {
    return p.evaluate(() => {
      const vh = innerHeight, vw = innerWidth, bad = [];
      document.querySelectorAll('.plate, .deck, .fb, .dev .sy-key, .keybed__keys > .sy-pad, .dialcell .sy-knob, .lcd, .wheel, .wordmark, .octs').forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom > vh + 0.5 || r.right > vw + 0.5 || r.left < -0.5 || r.top < -0.5) bad.push((el.className || '').toString().slice(0, 30) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round)); });
      const wm = document.querySelector('.wordmark').getBoundingClientRect(), fb = document.querySelector('.fb').getBoundingClientRect(); if (wm.right > fb.left + 0.5) bad.push('wordmark overlaps buttons');
      const lcd = document.querySelector('.lcd').getBoundingClientRect(); if (lcd.width < 150) bad.push('display too narrow ' + Math.round(lcd.width));
      const fbs = [...document.querySelectorAll('.fb')], lastFb = fbs[fbs.length - 1].getBoundingClientRect(); if (lcd.left < lastFb.right) bad.push('display not right of the buttons');
      if (fbs.map(f => f.textContent).join(',') !== 'Sound,Perform,FX,Key,BPM,Hold,Options') bad.push('button order ' + fbs.map(f => f.textContent).join(','));
      return { scroll: document.documentElement.scrollHeight > vh || document.documentElement.scrollWidth > vw, bad: bad.slice(0, 5), buttons: document.querySelectorAll('.fb').length };
    });
  }
  async function pdown(p, sel, id, fy) { const b = await p.locator(sel).first().boundingBox(); await p.dispatchEvent(sel, 'pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: b.x + b.width / 2, clientY: b.y + b.height * (fy || 0.5), button: 0, bubbles: true }); }
  async function pup(p, sel, id) { await p.dispatchEvent(sel, 'pointerup', { pointerId: id, pointerType: 'touch', clientX: 0, clientY: 0, button: 0, bubbles: true }); }
  async function press(p, sel, ms, id) { await pdown(p, sel, id || 5); await p.waitForTimeout(ms); await pup(p, sel, id || 5); await p.waitForTimeout(60); }
  async function drag(p, sel, dy) { const b = await p.locator(sel).first().boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x, y + dy * i / 10); await p.mouse.up(); await p.waitForTimeout(40); }
  const FN = id => `.fb .sy-push[aria-label="${id}"]`, DIAL = '.dialcell .sy-knob__body';
  const keysText = p => p.evaluate(() => [...document.querySelectorAll('.chords .sy-key__legend')].map(e => e.textContent).join(' '));

  for (const [w, h, s] of [[844, 390, 'light'], [844, 340, 'light'], [667, 375, 'light'], [932, 430, 'dark'], [740, 320, 'light'], [1280, 800, 'light']]) {
    const p = await open(w, h, s); const f = await fits(p);
    check(`fit ${w}x${h}`, !f.scroll && !f.bad.length && f.buttons === 7, f);
    await p.screenshot({ path: `${OUT}/m-${w}x${h}.png` }); await p.close();
  }
  const p = await open(844, 390);
  const G = () => p.evaluate(() => { const s = SyneChord.settings, st = SyneChord.st; return { preset: s.preset, perf: s.perfMode, key: s.keyMode, kroot: s.keyRoot, latch: s.latchPerf, bpm: s.bpm, fxOn: s.fxOn, delay: s.delay, vStep: s.vStep, oct: s.octave, root: st.root, last: st.last && st.last.name, notes: st.last && st.last.notes, owners: Object.keys(st.owners).length, mod: SyneChordUI.UI.mod, sticky: SyneChordUI.UI.sticky, sheet: SyneChordUI.UI.sheet }; });
  const state = sel => p.evaluate(s => { const b = document.querySelector(s); const fb = b.closest('.fb'); return { down: b.classList.contains('is-down'), open: fb ? fb.classList.contains('is-open') : null, led: fb ? !!fb.querySelector('.sy-led.is-on, .sy-led--on, [data-on="true"]') : null }; }, sel);
  const ledOn = id => p.evaluate(id => { const fb = document.querySelector(`.fb .sy-push[aria-label="${id}"]`).closest('.fb'); const l = fb.firstElementChild; return !l.className.includes('dark') && !l.className.includes('off'); }, id);
  const KEY = n => `.keybed .sy-pad[aria-label="${n}"]`, PAD = n => `.chords .sy-key[aria-label="${n} chord"]`;

  // ---- the plate
  check('7 buttons: no Notes, Chords, Volume, Loop or Bass', (await p.locator('.fb').count()) === 7 && !(await p.locator(FN('Notes')).count()) && !(await p.locator(FN('Chords')).count()) && (await p.locator('.wordmark').textContent()).includes('MOTH'));
  check('chord pads read MAJ MIN 7 m7 M7 SUS2 SUS4 DIM', (await keysText(p)) === 'MAJ MIN 7 m7 M7 SUS2 SUS4 DIM', await keysText(p));
  check('display corner shows the sound number', (await p.evaluate(() => SyneChordUI.displayModel().left)) === '45');

  // ---- Orchid logic: no pad chosen = single notes
  await pdown(p, KEY('D'), 11); await p.waitForTimeout(120); let g = await G();
  check('no pad chosen: key D plays the single note D', g.last === 'D' && g.notes.length === 1 && g.owners === 1, g);
  await pup(p, KEY('D'), 11); await p.waitForTimeout(60); check('...let go: silent', (await G()).owners === 0);
  // tap a pad: it lights and stays chosen, makes no sound by itself
  await press(p, PAD('MIN'), 80, 12); g = await G(); const minLit = await p.evaluate(s => !!document.querySelector(s + ' .sy-key__led'), PAD('MIN'));
  check('tap MIN: pad lights, stays chosen, plays nothing by itself', g.owners === 0 && minLit && (await p.evaluate(() => SyneChord.st.selType)) === 'MIN', g);
  const all = []; for (const k of ['C', 'D', 'E', 'F#', 'B♭']) { await press(p, KEY(k), 80); all.push((await G()).last); }
  check('...every key now plays a minor chord on its own root', all.join() === 'Cm,Dm,Em,F#m,B♭m', all);
  // every type
  const want = { MAJ: 'D', MIN: 'Dm', '7': 'D7', m7: 'Dm7', M7: 'Dmaj7', SUS2: 'Dsus2', SUS4: 'Dsus4', DIM: 'Ddim' }, got = {};
  for (const t of Object.keys(want)) { await press(p, PAD(t), 60, 12); await press(p, KEY('D'), 80); got[t] = (await G()).last; }
  check('each pad, then key D: D Dm D7 Dm7 Dmaj7 Dsus2 Dsus4 Ddim', Object.keys(want).every(t => got[t] === want[t]), got);
  await p.screenshot({ path: `${OUT}/m-pads.png` });
  // tap the lit pad again: back to single notes
  await press(p, PAD('DIM'), 60, 12); await press(p, KEY('G'), 80); g = await G();
  check('tap the lit pad again: unlit, keys play single notes', g.last === 'G' && g.notes.length === 1 && !(await p.evaluate(() => SyneChord.st.selType)), g);
  // hold a pad and play keys (momentary), then it stays chosen
  await pdown(p, PAD('m7'), 13); await p.waitForTimeout(60); await press(p, KEY('A'), 80, 14); const a1 = (await G()).last; await press(p, KEY('F'), 80, 15); const a2 = (await G()).last; await pup(p, PAD('m7'), 13); await p.waitForTimeout(60);
  check('hold m7 and play A, F: Am7, Fm7; m7 stays chosen', a1 === 'Am7' && a2 === 'Fm7' && (await p.evaluate(() => SyneChord.st.selType)) === 'm7', [a1, a2]);
  // press a pad while a key is held: the held key re-chords
  await pdown(p, KEY('C'), 16); await p.waitForTimeout(80); const c1 = (await G()).last; await press(p, PAD('MAJ'), 60, 17); const c2 = (await G()).last; await press(p, PAD('SUS4'), 60, 17); const c3 = (await G()).last; await pup(p, KEY('C'), 16); await p.waitForTimeout(60);
  check('hold C, press MAJ then SUS4: Cm7 -> C -> Csus4, silent after', c1 === 'Cm7' && c2 === 'C' && c3 === 'Csus4' && (await G()).owners === 0, [c1, c2, c3]);
  // two keys at once
  await press(p, PAD('MAJ'), 60, 12); await pdown(p, KEY('C'), 18); await pdown(p, KEY('G'), 19); await p.waitForTimeout(80); const both = (await G()).owners; await pup(p, KEY('C'), 18); await pup(p, KEY('G'), 19); await p.waitForTimeout(60);
  check('two keys at once: two chords, both released', both === 2 && (await G()).owners === 0, both);
  // display: edge to edge, no scrolling
  const disp = await p.evaluate(() => { const l = document.querySelector('.lcd'), c = l.querySelector('canvas'); return { lcd: l.clientWidth, cv: c.getBoundingClientRect().width }; });
  check('display dots run edge to edge in the glass', disp.cv >= disp.lcd - 12, disp);

  // ---- octave: left low, right high
  if (await p.evaluate(() => SyneChord.st.selType)) await press(p, PAD(await p.evaluate(() => SyneChord.st.selType)), 60, 12);
  { const t = await p.locator('.octs__track').boundingBox(); await p.mouse.click(t.x + t.width * 0.02, t.y + t.height / 2); await p.waitForTimeout(60); const lo = (await G()).oct, cl = await p.locator(KEY('C')).textContent();
    await p.mouse.click(t.x + t.width * 0.98, t.y + t.height / 2); await p.waitForTimeout(60); const hi = (await G()).oct, ch = await p.locator(KEY('C')).textContent();
    await press(p, KEY('C'), 80); const nHi = (await G()).notes[0];
    await p.mouse.click(t.x + t.width * 0.5, t.y + t.height / 2); await p.waitForTimeout(60); await press(p, KEY('C'), 80); const n0 = (await G()).notes[0];
    const ends = await p.evaluate(() => [...document.querySelectorAll('.octs__end')].map(e => e.textContent).join());
    check('octave slider: left = -2 (C2), right = +2 (C6), labels LO..HI, pitch follows', lo === -2 && hi === 2 && cl === 'C2' && ch === 'C6' && nHi === n0 + 24 && ends === 'LO,HI', { lo, hi, cl, ch, nHi, n0, ends }); }

  // ---- function buttons: tap opens a page and the button stays pressed in, tap again closes
  for (const [id, keys] of [['Sound', 'SOUND CUTOFF RESO ATTACK DECAY RELEASE LO-FI VOLUME'], ['Perform', 'STYLE RATE STRUM GATE HUMAN CHANCE ARP OCT'], ['FX', 'REVERB DELAY TIME FDBK CHORUS FILTER DRIVE WIDTH'], ['Key', 'SCALE ROOT OCTAVE KEYBOARD SPREAD'], ['BPM', 'TEMPO TAP SWING MIDI CLK']]) {
    const sel = FN(id); await pdown(p, sel, 1); await p.waitForTimeout(60); const during = await state(sel); await pup(p, sel, 1); await p.waitForTimeout(80);
    const open = await state(sel), kt = await keysText(p); await p.screenshot({ path: `${OUT}/m-page-${id}.png` });
    await press(p, sel, 80, 1); const closed = await state(sel), kt2 = await keysText(p);
    check(`${id}: pressed in while touched, stays in with its page, tap again pops out`, during.down && open.down && open.open && kt.trim() === keys && !closed.down && !closed.open && kt2 === 'MAJ MIN 7 m7 M7 SUS2 SUS4 DIM', { during, open, closed, kt }); }
  // switching pages directly
  await press(p, FN('Sound'), 80, 1); await press(p, FN('FX'), 80, 1); g = await G(); check('tap FX while Sound is open: FX page, Sound pops out', g.sticky === 'fx' && !(await state(FN('Sound'))).down && (await state(FN('FX'))).down, g); await press(p, FN('FX'), 80, 1);
  // pages: dial edits the picked parameter
  await press(p, FN('Sound'), 80, 1); const pre0 = (await G()).preset; await drag(p, DIAL, -40); g = await G(); check('Sound page: dial changes the sound; display says SOUND nn OF 69', g.preset !== pre0 && (await p.evaluate(() => SyneChordUI.displayModel().small)).includes('OF 69'), g);
  await press(p, '.chords .sy-key >> nth=1', 60, 8); await drag(p, DIAL, 60); check('...CUTOFF key + dial edits cutoff', (await p.evaluate(() => SyneChord.settings.eCut)) < 0.45);
  await press(p, '.chords .sy-key >> nth=6', 60, 8); await drag(p, DIAL, -60); check('...LO-FI', (await p.evaluate(() => SyneChord.settings.lofi)) > 0.2);
  await p.evaluate(() => { SyneChord.EDIT_KEYS.forEach(k => SyneChord.settings[k] = SyneChord.DEF[k]); SyneChord.applySound(); });
  await press(p, FN('Sound'), 80, 1);
  await press(p, FN('BPM'), 80, 1); await press(p, '.chords .sy-key >> nth=0', 60, 8); await drag(p, DIAL, -30); g = await G(); check('BPM page: TEMPO + dial', g.bpm !== 96, g.bpm);
  for (let i = 0; i < 4; i++) { await press(p, '.chords .sy-key >> nth=1', 40, 8); await p.waitForTimeout(460); } g = await G(); check('...TAP in time', g.bpm >= 95 && g.bpm <= 125, g.bpm);
  await press(p, FN('BPM'), 80, 1);
  // Key page: a key sets the key, plays nothing
  await press(p, FN('Key'), 80, 1); await press(p, KEY('E'), 80, 6); g = await G(); check('Key page: pressing E sets key E major, plays nothing', g.key === 'major' && g.kroot === 4 && g.owners === 0, g);
  await press(p, FN('Key'), 80, 1); if (await p.evaluate(() => SyneChord.st.selType)) await press(p, PAD(await p.evaluate(() => SyneChord.st.selType)), 60, 12); await press(p, KEY('A'), 80); g = await G(); check('...key of E, no pad: A plays its chord in the key (A)', g.last === 'A', g);
  await press(p, KEY('F#'), 80); check('...F# plays F#m', (await G()).last === 'F#m', (await G()).last);
  await press(p, FN('Key'), 750, 1); check('...long press Key: key off', (await G()).key === 'off');
  // long presses
  const perf0 = (await G()).perf; await press(p, FN('Perform'), 750, 1); g = await G(); check('long press Perform: on, light on, no page', g.perf > 0 && perf0 === 0 && !g.sticky && (await ledOn('Perform')), g);
  await press(p, FN('Perform'), 750, 1); check('...again: off, light off', (await G()).perf === 0 && !(await ledOn('Perform')));
  await press(p, FN('FX'), 750, 1); check('long press FX: FX off, light off', (await G()).fxOn === false && !(await ledOn('FX'))); await press(p, FN('FX'), 750, 1); check('...FX on, light on', (await G()).fxOn && (await ledOn('FX')));
  const s0 = (await G()).preset; await press(p, FN('Sound'), 750, 1); check('long press Sound: next sound', (await G()).preset === s0 + 1);
  // hold + turn
  const v0 = (await G()).bpm; await pdown(p, FN('BPM'), 1); await p.waitForTimeout(80); await press(p, '.chords .sy-key >> nth=0', 60, 8); await drag(p, DIAL, -20); await pup(p, FN('BPM'), 1); await p.waitForTimeout(60); g = await G();
  check('hold BPM + turn: changes tempo, page closes on release', g.bpm !== v0 && !g.mod && !g.sticky, g);
  // Hold
  await press(p, FN('Hold'), 80, 1); check('Hold: light on, button ivory (not a blue ball), not left pressed', (await G()).latch && (await ledOn('Hold')) && !(await state(FN('Hold'))).down && (await p.locator('.sy-push--cobalt').count()) === 0);
  await press(p, PAD('MAJ'), 60, 12); await press(p, KEY('C'), 80); check('...C MAJ keeps ringing', (await G()).owners === 1 && (await G()).last === 'C');
  await press(p, PAD('MIN'), 80); check('...MIN replaces it: Cm rings', (await G()).owners === 1 && (await G()).last === 'Cm');
  await p.screenshot({ path: `${OUT}/m-hold.png` });
  await press(p, FN('Hold'), 80, 1); check('...Hold off: silence, light off', (await G()).owners === 0 && !(await ledOn('Hold')));
  // dial with no page voices the chord
  await drag(p, DIAL, -20); check('dial with no page open: voicing', (await G()).vStep > 0); await p.evaluate(() => { SyneChord.settings.vStep = 0; });
  // wheels
  { const b = await p.locator('.wheel.is-pitch').boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2, b.y + 5, { steps: 6 });
    const bent = await p.evaluate(() => SyneChord.wheel.bend); await p.mouse.up(); await p.waitForTimeout(50); const back = await p.evaluate(() => SyneChord.wheel.bend);
    await p.evaluate(() => { SyneChordUI.UI.pick.fx = 0; SyneChord.settings.reverb = 0.1; SyneChord.changed(); }); await p.waitForTimeout(50);
    const m = await p.locator('.wheel:not(.is-pitch)').boundingBox(); await p.mouse.move(m.x + m.width / 2, m.y + m.height * 0.8); await p.mouse.down(); await p.mouse.move(m.x + m.width / 2, m.y + 5, { steps: 6 }); await p.mouse.up();
    check('pitch wheel bends and springs back; FX wheel rides reverb', bent > 0.5 && back === 0 && (await p.evaluate(() => SyneChord.settings.reverb)) > 0.4); }
  // computer keys
  await p.keyboard.down('4'); await p.keyboard.down('s'); await p.waitForTimeout(80); const ck = (await G()).last; await p.keyboard.up('4'); await p.keyboard.up('s'); await p.waitForTimeout(60);
  check('computer keys: S (D) then 4 = Dm7, all released', ck === 'Dm7' && (await G()).owners === 0, ck);
  // AI next chords
  { for (const k of ['C', 'A', 'F']) { await press(p, PAD(k === 'A' ? 'MIN' : 'MAJ'), 50, 12); await press(p, KEY(k), 100); }
    await p.waitForTimeout(1500); const ai = await p.evaluate(() => ({ ai: SyneChord.st.sugg.ai, names: SyneChord.st.sugg.items.map(i => i.name), small: SyneChordUI.displayModel().small, prompt: window.__prompts.slice(-1)[0] || '', dots: document.querySelectorAll('.k__dot.is-next').length }));
    await p.screenshot({ path: `${OUT}/m-ai.png` });
    check('Claude: TRY three chords, only playable types, on the display with key dots', ai.ai && ai.names.join(' ') === 'Fmaj7 G Em7' && ai.small.startsWith('TRY ') && ai.prompt.includes('M7 (major seventh)') && /C Am F/.test(ai.prompt) && ai.dots === 3, ai); }
  // user sound
  const us = await p.evaluate(() => { const n0 = SyneChord.soundCount(); SyneChord.saveUserSound(); return { n0, n1: SyneChord.soundCount(), left: SyneChordUI.displayModel().left }; }); check('save a user sound (numbered U1)', us.n0 === 69 && us.n1 === 70 && us.left === 'U1', us);
  // options + MIDI
  await press(p, FN('Options'), 80, 1); await p.waitForTimeout(350); check('Options opens', await p.evaluate(() => document.querySelector('.sheet').classList.contains('is-open')));
  check('no Playstyle rows and no sound-edit knobs in Options', !(await p.evaluate(() => /Playstyle|SUS key|m7 and M7|Cutoff|Reso|Lo-fi|Clear edits/.test(document.querySelector('.sheet').textContent))));
  check('nothing plays by itself: transport stopped, no loop', !(await p.evaluate(() => SyneChord.st.playing)) && (await p.evaluate(() => SyneChord.st.loop.layers.length)) === 0);
  await p.screenshot({ path: `${OUT}/m-options.png` });
  await p.locator('#sec-midi .ukey').first().click(); await p.waitForTimeout(250); check('MIDI connect', (await p.evaluate(() => SyneChord.MIDI.status)) === 'ready');
  await p.locator('.sheet__head .ukey').click(); await p.waitForTimeout(350); check('Done closes Options', !(await p.evaluate(() => document.querySelector('.sheet').classList.contains('is-open'))));
  await p.evaluate(() => { SyneChord.settings.perfMode = 5; SyneChord.settings.chordCh = 3; SyneChord.setBpm(120); });
  await press(p, PAD('MAJ'), 60, 12); await press(p, KEY('C'), 700); await p.waitForTimeout(400);
  const mp = await p.evaluate(() => { const on = {}, off = {}; window.__sent.forEach(d => { const k = (d[0] & 15) + 1 + ':' + d[1]; if ((d[0] & 0xf0) === 0x90) on[k] = (on[k] || 0) + 1; if ((d[0] & 0xf0) === 0x80) off[k] = (off[k] || 0) + 1; }); const ch = {}; window.__sent.forEach(d => { if ((d[0] & 0xf0) === 0x90) ch[(d[0] & 15) + 1] = 1; }); return { channels: Object.keys(ch), unpaired: Object.keys(on).filter(k => on[k] !== off[k]) }; });
  check('MIDI: played + chord streams, every note-on has its note-off', mp.channels.join() === '1,3' && !mp.unpaired.length, mp);
  // ---- a phone held sideways in an app that keeps the page upright (portrait viewport): the instrument is drawn turned
  { const q = await open(390, 844); await q.waitForTimeout(300);
    const t = await q.evaluate(() => ({ turned: !!document.querySelector('.fitwrap.is-turned'), prompt: !!document.querySelector('.rotate') }));
    const bb = async s => q.locator(s).first().boundingBox();
    const pl = await bb('.plate'), kb = await bb('.keybed');
    const fitsT = await q.evaluate(() => { const vw = innerWidth, vh = innerHeight, bad = []; document.querySelectorAll('.plate, .deck, .fb, .sy-key, .keybed__keys > .sy-pad, .lcd, .wheel').forEach(el => { const r = el.getClientRects()[0]; if (r && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)) bad.push(el.className.slice(0, 20)); }); return bad; });
    check('portrait phone: instrument drawn turned to fill the screen, no "turn your phone" wall', t.turned && !t.prompt && !fitsT.length && pl.x > kb.x, { t, fitsT, pl, kb });
    await q.screenshot({ path: `${OUT}/m-turned-390x844.png` });
    const tap = async s => { const b = await bb(s); await q.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await q.mouse.down(); await q.waitForTimeout(80); await q.mouse.up(); await q.waitForTimeout(60); };
    await tap('.chords .sy-key[aria-label="m7 chord"]'); await tap('.keybed .sy-pad[aria-label="A"]');
    check('...turned: tap m7 then A = Am7', (await q.evaluate(() => SyneChord.st.last && SyneChord.st.last.name)) === 'Am7');
    const v0 = await q.evaluate(() => SyneChord.settings.vStep); { const b = await bb('.dialcell .sy-knob__body'); const x = b.x + b.width / 2, y = b.y + b.height / 2; await q.mouse.move(x, y); await q.mouse.down(); for (let i = 1; i <= 8; i++) await q.mouse.move(x + i * 6, y); await q.mouse.up(); }
    check('...turned: dragging the dial toward the top of the turned screen turns it up', (await q.evaluate(() => SyneChord.settings.vStep)) > v0);
    { const b = await bb('.octs__track'); await q.mouse.click(b.x + b.width / 2, b.y + b.height * 0.97); }
    check('...turned: octave slider far (right) end = +2', (await q.evaluate(() => SyneChord.settings.octave)) === 2);
    { const b = await bb('.wheel.is-pitch'); const x = b.x + b.width / 2, y = b.y + b.height / 2; await q.mouse.move(x, y); await q.mouse.down(); for (let i = 1; i <= 6; i++) await q.mouse.move(x + i * 8, y); const bend = await q.evaluate(() => SyneChord.wheel.bend); await q.mouse.up(); check('...turned: pitch wheel pushed up bends up', bend > 0.4, bend); }
    await tap('.fb .sy-push[aria-label="Options"]'); await q.waitForTimeout(350); await q.screenshot({ path: `${OUT}/m-turned-options.png` });
    check('...turned: Options opens inside the turned instrument', await q.evaluate(() => document.querySelector('.sheet').classList.contains('is-open') && !!document.querySelector('.is-turned .sheet')));
    await q.close(); }
  console.log(results.join('\n')); console.log('PAGE ERRORS', errors);
  console.log(results.filter(r => r.startsWith('PASS')).length + ' passed, ' + results.filter(r => r.startsWith('FAIL')).length + ' failed');
  await browser.close();
})();
