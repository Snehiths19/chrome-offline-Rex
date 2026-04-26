# CLAUDE.md

Architecture reference for contributors and future Claude Code sessions. Optimised for "I need to land a small change in 5 minutes."

## Project at a glance

Single-file vanilla-JS clone of Chrome's offline dino game. Render target is a `<canvas>` driven by `requestAnimationFrame`. No bundler, no framework, no runtime dependencies — `npm` is for ESLint/Prettier only.

- Game logic: `script.js` (~1200 LOC, sectioned)
- Tests: `tests/game.test.js` (custom harness, runs under Node)
- HTML shell: `index.html` (canvas + UI buttons)
- Styles: `style.css`
- Deploy: GitHub Pages via `.github/workflows/pages.yml`
- Live: https://snehiths19.github.io/chrome-offline-Rex/

## Quick start for a new change

```bash
npm test                       # runs the full suite under Node
npm run lint                   # ESLint script.js + tests
npm run serve                  # local server on :8080
```

The lint and test gates also run in CI on every push (`.github/workflows/ci.yml`) and as a deploy gate on `pages.yml`.

## File map

```
script.js                         # game logic (single source of truth)
index.html                        # canvas + UI buttons; cache-bust via __VERSION__
style.css
tests/game.test.js                # custom describe/it; no JSDOM; canvas/document stubbed
.github/workflows/pages.yml       # test → cache-bust → Pages deploy
.github/workflows/ci.yml          # tests on every push/PR
docs/dev/specs/                   # internal design specs (don't touch)
docs/dev/plans/                   # internal implementation plans (don't touch)
package.json                      # npm scripts: test, lint, format, serve
eslint.config.js, .prettierrc.json
```

## `script.js` section layout

The file is divided into numbered sections. Add new code inside the section it belongs to; don't append at EOF.

1. **Section 1 — Node stubs** (~line 1). Browser-API shims so `script.js` can be `require`d under Node. Browsers skip this block.
2. **Section 2 — Configuration** (~line 65). `GAME_CONFIG` (frozen) plus the `cfg`/`loadTuning`/`saveTuning` live-tuning hook.
3. **Section 3 — Asset loading** (~line 280). Sprite preload with timeout fallback.
4. **Section 4 — Game state** (~line 380). `STATE` enum, `MODES`, the `game` object, the `mulberry32` seeded RNG, `audio` object.
5. **Section 5 — Rendering** (~line 470). Pure draw functions: `drawBackground`, `drawDino`, `drawObstacles`, `drawClouds`, `drawHills`, `drawSkyTint`, `drawDeathFlash`, `drawScore`, `drawMilestoneFlash`, `drawNewBestBadge`, etc.
6. **Feature registry** (~line 770). `FEATURES` array + `runFeatureUpdates` + `runFeatureDraws(layer)`. Declarative ordering for ambient features (hills, clouds, particles, skyTint).
7. **Section 6 — Physics & game logic** (~line 800). `spawnObstacle`, `pickObstacleType`, `computeNextSpawnGap`, collision, `jump`, `resetGame`.
8. **Section 7 — Input handlers** (~line 870). Keyboard + mouse + touch. Mute and mode-toggle buttons live here too.
9. **Section 8 — Game loop** (~line 970). Three branches: WAITING, RUNNING, DEAD. RUNNING uses the feature registry; WAITING and DEAD are hand-written.
10. **Section 9 — Initialisation** (~line 1160). Loads assets, sets state, kicks off the loop.
11. **Section 10 — Test exposure** (~line 1170). Node-only globals so tests can poke internals.

### Adding a visual tunable

1. Add the key to `GAME_CONFIG` near related visual config.
2. At the call site, read via `cfg('KEY')` instead of a literal.
3. Add a test in `describe('Live-tuning hook (PR-P3)', ...)` if behaviour-sensitive.

**Never** route physics/spawning/scoring/hitbox values through `cfg()`. Determinism depends on those reading `GAME_CONFIG.X` directly.

### Adding a gameplay parameter

1. Add the key to `GAME_CONFIG`.
2. At the call site, read via `GAME_CONFIG.KEY` directly. **Not** `cfg()`.
3. Update or add a test under the relevant existing `describe` block.

### Adding a new ambient feature

1. Write `update<Foo>` and `draw<Foo>` in Section 5.
2. Add an entry to the `FEATURES` array with the right `layer`:
   - `'background'` — drawn between `drawBackground` and `drawGround`.
   - `'foreground'` — drawn after `drawObstacles`.
   - `'overlay'` — drawn after HUD.
3. Self-gate inside the function (`if (!isUpdatedMode() || reducedMotion) return;`). Do not gate at the registry level.
4. Update the `Feature registry (PR-P2)` test's id-snapshot.
5. If the feature has tunable visuals, add config keys + route through `cfg()`.

### Adding a test

Append a `describe`/`it` block. Manage state by snapshot-mutate-restore inside each `it`:

```js
it('does the thing', () => {
  const orig = game.someField;
  game.someField = ...;
  // assertions
  game.someField = orig;
});
```

The harness has no JSDOM. Canvas and document are stubbed at the top of `script.js`. Spying on `ctx` methods works via direct property assignment; restore at end of test.

## Determinism contract

`game.rng()` is the **only** source of gameplay-affecting randomness. It's seeded from `Date.now()` at each `resetGame()`. Used for: hill init/respawn, obstacle spawn-gap jitter, obstacle type selection.

`Math.random()` is reserved for **cosmetic** randomness only — particle emit jitter, cloud positions, audio pitch wobble, star positions. These don't perturb the gameplay-determinism contract because they don't influence collision, scoring, or spawn timing.

Live-tuning overrides (`window.GAME_TUNING`) apply to **visuals only**. Physics, spawning, scoring, and hitboxes read `GAME_CONFIG.X` directly — they're not routed through `cfg()`.

## Modes & reduced-motion

```js
const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated' });
function isUpdatedMode() { return game.mode === MODES.UPDATED; }
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

`reducedMotion` is read once at module load. Each ambient feature self-gates internally:

| Feature | reducedMotion=true | mode=classic |
|---|---|---|
| Hills | no scroll | no draw |
| Clouds | no movement | drawn faintly |
| Particles | 25% count, 50% life | not emitted |
| Sky-tint flash | suppressed | suppressed |

## `localStorage` keys

| Key | Format | Written by | Read by |
|---|---|---|---|
| `dino-mode` | `'classic'` / `'updated'` | `setMode()` | `loadMode()` at boot |
| `dino-muted` | `'0'` / `'1'` | `audio.setMuted` | `audio.muted` init |
| `dino-high-score` | integer string | death handler | `game.highScore` init |
| `dino-tuning` | JSON | `saveTuning()` | `loadTuning()` at boot |

## Test harness

Custom `describe`/`it` with `assert`/`assertEquals`/`assertNotEquals`. No Jest, no Mocha, no JSDOM. Tests run as a single Node script via `node tests/game.test.js`.

The Node stubs at the top of `script.js` provide just enough of `window`, `document`, `Image`, `localStorage`, `requestAnimationFrame`, and `matchMedia` to let the rest of the file load. Canvas methods are no-ops; tests assert against `game.*` state, not pixels.

To run a single block in the browser, open `tests/test-runner.html` (if present) or load `tests/game.test.js` from devtools. Console output uses ANSI/CSS styling for pass/fail.

## Deploy pipeline

`.github/workflows/pages.yml`:

1. **Test job** — runs `node tests/game.test.js` under Node 20. Failures block deploy.
2. **Deploy job** — runs `sed` to inject `${GITHUB_SHA::7}` into `script.js?v=__VERSION__` and `style.css?v=__VERSION__` in `index.html`. This forces browsers to re-fetch on every push.
3. **Pages publish** — uploads the repo root as an artifact and deploys to GitHub Pages.

Local dev keeps `__VERSION__` literal in the URL — browsers ignore the unknown query string and serve normally.

## Live-tuning workflow

```js
// In DevTools after the page loads:
GAME_TUNING.SKY_TINT_PEAK_ALPHA = 0.3        // pulse stronger
GAME_TUNING.HILL_COLOR_DAY = '#b8b8b8'        // greyer hills
GAME_TUNING.DEATH_SHAKE_FREQ = 2.5            // faster shake
saveTuning()                                  // persist
location.reload()                             // verify hydration

// Reset:
localStorage.removeItem('dino-tuning')
location.reload()
```

Read the `cfg()` block at the top of `script.js` Section 2 for the full list of safe-to-tune keys (and the explicit "do not tune physics" warning).

## Where design history lives

`docs/dev/specs/` and `docs/dev/plans/` carry the original design decisions and implementation plans for past phases. Treat these as a historical record — read for context, but don't rewrite or delete them as part of unrelated work.
