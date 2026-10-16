/* SYNE MOTH — haptics: every control, by real touch, on an iPhone (Taptic via the hidden switch) and an Android phone
   (navigator.vibrate). Each interaction must produce a haptic; with Haptics off in Options, none may. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const V = path.join(__dirname, '../vendor');
const results = []; function check(n, ok, info) { results.push((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
const UAS = { iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' };
(async () => {
  const b = await chromium.launch(), errors = [];
  for (const dev of ['iphone', 'android']) {
    const c = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: UAS[dev] }); const p = await c.newPage();
    p.on('pageerror', e => errors.push(dev + ' ' + e.message));
    await p.route('**/*', r => { const u = r.request().url(); if (u.includes('react-dom')) return r.fulfill({ path: V + '/react-dom-18.3.1/package/umd/react-dom.production.min.js' }); if (u.includes('/react/')) return r.fulfill({ path: V + '/react-18.3.1/package/umd/react.production.min.js' }); if (u.startsWith('file:')) return r.continue(); return r.abort(); });
    await p.addInitScript(dev === 'android' ? 'window.__vib = 0; navigator.vibrate = function () { window.__vib++; return true; };' : 'Object.defineProperty(navigator, "vibrate", { value: undefined });');
    await p.goto('file://' + path.join(__dirname, '../dist/test.html')); await p.waitForTimeout(600);
    const n = () => p.evaluate(d => d === 'android' ? window.__vib : SyneChordUI.HAP.count(), dev);
    const bb = s => p.locator(s).first().boundingBox();
    const tap = async s => { const q = await bb(s); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2); await p.waitForTimeout(90); };
    const drag = async (s, dx, dy) => { const q = await bb(s); const x = q.x + q.width / 2, y = q.y + q.height / 2; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(x + dx * i / 8, y + dy * i / 8); await p.mouse.up(); await p.waitForTimeout(90); };
    const cases = [
      ['keyboard key', () => tap('.keybed .sy-pad[aria-label="E"]')],
      ['black key', () => tap('.keybed .sy-pad[aria-label="F#"]')],
      ['chord pad', () => tap('.chords .sy-key[aria-label="MIN chord"]')],
      ['function button (open page)', () => tap('.fb .sy-push[aria-label="Sound"]')],
      ['page key', () => tap('.chords .sy-key >> nth=1')],
      ['dial turn', () => drag('.dialcell .sy-knob__body', 0, -50)],
      ['function button (close page)', () => tap('.fb .sy-push[aria-label="Sound"]')],
      ['Hold', () => tap('.fb .sy-push[aria-label="Hold"]')],
      ['pitch wheel', () => drag('.wheel.is-pitch', 0, -40)],
      ['FX wheel', () => drag('.wheel:not(.is-pitch)', 0, -40)],
      ['octave slider', () => tap('.octs__track')],
      ['Options', () => tap('.fb .sy-push[aria-label="Options"]')],
    ];
    await tap('.keybed .sy-pad[aria-label="C"]');   // first touch wakes things
    for (const [name, act] of cases) { const a = await n(); await act(); await p.waitForTimeout(60); const d = (await n()) - a; check(`${dev}: ${name} gives a haptic`, d >= 1, d); }
    // Options closes; Haptics off silences everything
    await p.locator('.sheet__head .ukey').click(); await p.waitForTimeout(350);
    await p.evaluate(() => { SyneChord.settings.haptics = false; });
    const a0 = await n(); await tap('.keybed .sy-pad[aria-label="D"]'); await tap('.chords .sy-key[aria-label="MAJ chord"]'); await drag('.dialcell .sy-knob__body', 0, -30);
    check(`${dev}: Haptics off in Options: no haptics`, (await n()) === a0);
    await c.close();
  }
  console.log(results.join('\n')); console.log('PAGE ERRORS', errors);
  console.log(results.filter(r => r.startsWith('PASS')).length + ' passed, ' + results.filter(r => r.startsWith('FAIL')).length + ' failed');
  await b.close();
})();
