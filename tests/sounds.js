/* SYNE MOTH — every factory sound rendered offline: it must speak, stay finite, sit near the common level and fall silent after release.
   A short tap on a slow pad must still sound (the release starts from wherever the attack had got to). */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const V = require('path').join(__dirname, '../vendor');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*', r => { const u = r.request().url(); if (u.includes('react-dom')) return r.fulfill({ path: V + '/react-dom-18.3.1/package/umd/react-dom.production.min.js', contentType: 'text/javascript' }); if (u.includes('/react/')) return r.fulfill({ path: V + '/react-18.3.1/package/umd/react.production.min.js', contentType: 'text/javascript' }); if (u.startsWith('file:')) return r.continue(); return r.abort(); });
  await p.goto('file://' + require('path').join(__dirname, '../dist/test.html')); await p.waitForTimeout(400);
  const res = await p.evaluate(async () => { const out = []; for (let i = 0; i < SyneChord.FACTORY; i++) { const a = await SyneChord.renderTest(i, [57, 60, 64, 67], 2.5, 5); const t = await SyneChord.renderTest(i, [60], 0.2, 4); out.push({ a, tap: t.peak }); } return out; });
  let fail = 0;
  res.forEach(({ a, tap }) => { const m = Math.max(a.rms, 0.75 * a.early), ok = !a.bad && a.peak < 1 && m > 0.045 && m < 0.2 && a.tail < 0.001 && tap > 0.004;
    if (!ok) { fail++; console.log('FAIL', a.name, JSON.stringify({ m: +m.toFixed(3), peak: +a.peak.toFixed(2), bad: a.bad, tail: a.tail, tap })); } });
  const fams = {}; res.forEach(r => fams[r.a.family] = (fams[r.a.family] || 0) + 1);
  console.log(res.length - fail + ' of ' + res.length + ' sounds pass', JSON.stringify(fams), 'page errors', errs.length); await b.close(); process.exit(fail ? 1 : 0);
})();
