# SYNE MOTH

A one-octave chord instrument for the browser, built on the SYNE design system and modelled on the way the Telepathic Instruments Orchid plays. It is designed for an iPhone held sideways.

**Play it:** open `index.html` (or the GitHub Pages site for this repo).

## How it plays

- **Pads and keys (the Orchid way).** The eight pads are MAJ, MIN, 7, m7, M7, SUS2, SUS4 and DIM.
  - Tap a pad and it lights up; every key then plays that chord on its own root.
  - Hold a pad while you play to use it for just those notes.
  - Press a pad while holding keys to change their chord.
  - Tap the lit pad again to go back to single notes.
- **Key.** With a key set and no pad lit, every key plays its own chord in that key.
- **Function buttons:** Sound, Perform, FX, Key, BPM, Hold and Options.
  - Tap a button to open its page on the pads; the dial sets the parameter you pick.
  - Long-press switches the function on or off.
  - A light above a button means the function is on.
  - A button that stays pressed in has its page open.
- **Sounds.** 69 original patches in three banks, each built the way its instrument builds a voice:
  - **D-50 style** (LA synthesis: a sampled-style attack over a synth body);
  - **Juno-60 style** (one DCO with PWM and sub, a 24 dB filter and BBD chorus);
  - **DX7 style** (six-operator FM).
- **Sound page.** Cutoff, resonance, attack, decay, release and lo-fi.
- **Perform.** Strums, 14 arpeggiators and 12 patterns.
- **FX.** Reverb, delay, chorus, filter, drive and width; the FX wheel rides the effect you pick.
- **BPM page.** Tempo, tap tempo, swing and MIDI clock.
- **Display.** The sound number sits in the corner, and TRY shows three chords to play next.
  - Inside Claude, the page asks Claude for these.
  - Elsewhere it uses the built-in harmony engine.
- **MIDI out.** Uses Web MIDI (desktop Chrome, Edge or Firefox), and you can save a MIDI file of the session.
- **Phone.** If the app keeps the page upright, the instrument is drawn turned sideways so it still fills the screen.

The patch names are original and none of them copies a factory preset. This project is not affiliated with Roland, Yamaha or Telepathic Instruments.

## Build

```
python3 build.py      # writes index.html (and dist/) from src/
```

- **`src/core.js`:** music theory, voicing, arpeggiators and patterns, the harmony suggestions, and MIDI files.
- **`src/engine.js`:** the audio graph, the three synth engines and the sound bank, plus the FX, clock and MIDI router.
- **`src/ui.js`:** the interface, written in React 18 with the SYNE components in `syne/`.

## Tests

The tests need Playwright and a local copy of React 18.3.1 UMD in `vendor/`.

```
node tests/core.test.js   # music core
node tests/sounds.js      # every patch rendered offline: speaks, finite, level-matched, releases
node tests/browser.js     # every control driven by touch, at six screen sizes plus a turned phone
```
