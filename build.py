import pathlib, shutil
R = pathlib.Path(__file__).parent
src = R / 'src'
out = R / 'dist'
(out / 'syne').mkdir(parents=True, exist_ok=True)
S16 = R / 'syne'   # the SYNE design-system bundle
for f in ('bundle.css', 'bundle.js'):
    shutil.copy(S16 / f, out / 'syne' / f)
tokens = (src / 'tokens.css').read_text()
css = (src / 'chord.css').read_text()
js = '\n'.join((src / f).read_text() for f in ('core.js', 'engine.js', 'ui.js'))
html = f'''<title>SYNE MOTH</title>
<meta name="description" content="SYNE MOTH: a one-octave keyboard and chord instrument with 81 sounds in four banks, arps and patterns, FX and MIDI out.">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="stylesheet" href="syne/bundle.css">
<style>
/* SYNE MOTH tokens come straight from the SYNE design system: Chalk on :root, Graphite for dark, and a finish switch that overrides both. */
{tokens}
{css}
</style>
<div id="app"></div>
<input type="file" id="sc-json" class="vh" tabindex="-1" aria-hidden="true" accept=".json,application/json">
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="syne/bundle.js"></script>
<script>
{js}
</script>
'''
(out / 'index.html').write_text(html)
# GitHub Pages serves the repo root as a plain page, so it gets its own document head: without the viewport tag a phone
# lays the page out 980 px wide and shrinks it
page_head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">'
  '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
  '<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{margin:0;height:100%;-webkit-text-size-adjust:100%}body{padding:0}</style></head><body>')
(R / 'index.html').write_text(page_head + html + '</body></html>')
print('ok', len(html))
# local test copy wrapped the way the artifact host wraps the page
skel = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'
(out / 'test.html').write_text(skel + html + '</body></html>')
