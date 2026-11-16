# CLAUDE.md

Architecture reference for contributors and future Claude Code sessions. Optimised for "I need to land a small change in 5 minutes."

## Project at a glance

Vanilla-JS clone of Chrome's offline dino game. Render target is a `<canvas>` driven by `requestAnimationFrame`. No bundler, no framework, no runtime dependencies — `npm` is for ESLint/Prettier only.

- Game logic: `src/01-node-stubs.js` … `src/10-test-exposure.js` (~4,850 lines, one file per section, loaded in order as plain `<script>` tags; `src/files.js` is the list)
- Tests: `tests/unit/*.test.js`, one file per area, on the shared `tests/harness.js` (custom harness, runs under Node and in a browser)
- HTML shell: `index.html` (canvas + UI buttons)
- Styles: `style.css`
- Deploy: GitHub Pages via `.github/workflows/pages.yml`
- Live: https://snehiths19.github.io/chrome-offline-Rex/

## Quick start for a new change

```bash
npm test                       # runs the full suite under Node (unit tests + golden-run replays)
npm run test:replay            # only the golden-run replays
npm run coverage               # same suite, plus line/branch coverage of the game files in src/
npm run test:browser           # plays the game in headless Chromium at desktop + phone sizes
npm run test:visual            # compares key screens to tests/browser/references/ (-- --update to re-record)
npm run lint                   # ESLint the game files (src/) + tests
npm run format                 # Prettier: run before committing
npm run format:check           # what CI checks
npm run serve                  # local server on :8080
```

The lint, format and test gates also run in CI on pull requests and on pushes to any branch except `master` (`.github/workflows/ci.yml`) and as a deploy gate on `pages.yml`.

## File map

```
src/files.js                      # GAME_FILES: the game files in load order, plus loadGame()/gameSource() for Node
src/01-node-stubs.js              # Section 1 … one file per section (see the layout below)
src/10-test-exposure.js           # Section 10
index.html                        # canvas + UI buttons; cache-bust via __VERSION__
style.css
tune.js                           # dev-only ?tune=1 live tuning panel (loaded by src/09-init.js only with that flag; not precached)
sw.js                             # service worker: precaches the offline shell (cache name = deploy SHA)
manifest.webmanifest              # Add to Home Screen: name, fullscreen, landscape, icons
icons/                            # app icons built from assets/dino-stationary.png (assets/ untouched)
share-card.png                    # 1200x630 link-preview image for Open Graph / Twitter tags (not precached)
tests/harness.js                  # custom describe/it/assert + Node/browser helpers; loads the game files once
tests/unit.test.js                # Node runner: harness, then every area file, then a per-file summary
tests/unit/files.js               # the area files and their order (Node and the browser page both read it)
tests/unit/<area>.test.js         # physics, spawning, rendering, effects, daily, shell, qa
tests/test-runner.html            # the same unit tests in a real browser
tests/replay.test.js              # golden-run replays (Node only), stored runs in tests/golden/
tests/browser/smoke.js            # real-browser smoke test (Playwright); screenshots/ is git-ignored
tests/browser/visual.js           # screenshot comparisons against tests/browser/references/*.png
.github/workflows/pages.yml       # test → cache-bust → Pages deploy
.github/workflows/ci.yml          # lint, format check, tests on every push/PR
.github/workflows/automerge.yml   # merge queue for PRs labelled `automerge`
docs/dev/specs/                   # internal design specs (don't touch)
docs/dev/plans/                   # internal implementation plans (don't touch)
package.json                      # npm scripts: test, lint, format, serve
eslint.config.mjs, .prettierrc.json
```

## Game files and section layout

The game is ten plain classic scripts in `src/`, one per numbered section, with no bundler (C4, #109). `index.html` loads them with one `<script>` tag each, in order, and classic scripts share one global scope, so every file sees the top-level names of the others, as if it were still one file. Node loads the same list the same way: `require('./src/files.js').loadGame()` runs each file with `vm.runInThisContext`, in order, in one global scope. `gameSource()` returns all of it as one string for tests that scan the code.

Rules that come with the split:

- **No load-time calls into a later file.** A function declaration is only hoisted within its own file, so top-level code (a table, a constant, a call at load) may only use names from its own file or an earlier one. Inside a function body anything goes, because everything has loaded before it runs. `QA_FLAGS` in `02-config.js` wraps the two draws that live in `05-rendering.js` in arrow functions for this reason. Breaking the rule throws a `ReferenceError` the moment the tests load the game.
- **Events can run between files.** A browser may fire an image's `onload`, a timer or an input event after one game file and before the next. So nothing starts the game until both the sprites and the files are ready: `bootWhenReady('assets')` in `03-assets.js` and `bootWhenReady('files')` at the end of `09-init.js`, through `bootGate`. The smoke test delays `04-state.js` to check it. For the same reason an event handler registered at load (resize, the mode and Daily buttons) checks `bootGate.files` before it reaches a later file.
- **A new game file** goes in `GAME_FILES` (`src/files.js`), `index.html` (with `?v=__VERSION__`), `tests/test-runner.html` and `sw.js` `PRECACHE_URLS`, in the same order. The `Game files (C4)` tests in `tests/unit/shell.test.js` fail until all four agree.
- **Lint knows the shared scope.** `eslint.config.mjs` reads `GAME_FILES` and gives each file the other files' top-level names as globals, and counts a name another file uses as used.

Add new code to the file for the section it belongs to; don't start a new file for a small change.

1. **`src/01-node-stubs.js` — Section 1, Node stubs.** Browser-API shims so the game files can run under Node. Browsers skip this block.
2. **`src/02-config.js` — Section 2, Configuration.** `GAME_CONFIG` (frozen), the `cfg`/`loadTuning`/`saveTuning` live-tuning hook, `ScoreStore` (all localStorage score persistence), the `STATE` enum, `reducedMotion`/`setReducedMotion`, the QA switchboard (`QA_FLAGS`: one row per `?qaX=1` playtest flag, with its hold, gate and draw; `qa.x` says whether a flag is on, tests flip one with `setQaFlag('x', on)` and parse with `readQaFlag('x', search)`; the per-flag `drawQa*` overlays sit just above it; the bulk of this file), and the `audio` object.
3. **`src/03-assets.js` — Section 3, Asset loading.** `canvas`/`ctx`, `a11yLive`/`announce`, `dino`, sprite preload with timeout fallback, and the canvas-sizing shell helpers (`computeCanvasCssWidth`, `fitCanvasCssSize`, `initCanvasScale`, `handleResize`).
4. **`src/04-state.js` — Section 4, Game state.** The `mulberry32` seeded RNG, `DifficultyProfile.nextObstacle()` (type + gap; `pickObstacleType` and `computeNextSpawnGap` are internal helpers, not exported), `MODES`/`loadMode`, daily seed helpers, the `game` object, `Animations`, `setMode`, daily share, and the death-log debug tools.
5. **`src/05-rendering.js` — Section 5, Rendering.** Pure draw functions: `drawBackground`, `drawDino`, `drawObstacles`, `drawClouds`, `drawHills`, `drawSkyTint`, `drawDeathFlash`, `drawScore`, `drawMilestoneFlash`, `drawNewBestBadge`, etc. Also `isDailyMode`/`isUpdatedMode` and `Particles`.
6. **Feature registry** (end of `src/05-rendering.js`). `FEATURES` array + `runFeatureUpdates` + `runFeatureDraws(layer)`. Declarative ordering for ambient features (hills, clouds, speed streaks, particles, skyTint).
7. **`src/06-physics.js` — Section 6, Physics & game logic.** `spawnObstacle`, `updateObstacles`, `checkCollision`, `computeRunResult`, `jump`.
8. **`src/07-input.js` — Section 7, Input handlers.** `handleAction`, keyboard + mouse + touch. Jump, mute, mode-toggle, share and daily buttons live here too.
9. **`src/08-loop.js` — Section 8, Game loop.** `resetGame`, each state's update step (`updateIdle`, `updateWaiting`, `updateRunning`, `updateDead`: counters, physics, spawning, scoring, collision, emits, no canvas) and draw step (`drawIdle`, `drawWaiting`, `drawRunning`, `drawDead`: paint only) in `STATE_STEPS`, the 60Hz sim clock (`SIM_FRAME_MS`, `simStepsForFrame`), `runSimFrame` (QA holds + one update), `drawFrame` (one draw + QA overlays) and `gameLoop`. `gameLoop` spends rAF time in 60Hz sim slices, runs one update per slice, then draws once; a display frame that owes no slice neither updates nor draws. The slice that dies draws the death scene. RUNNING uses the feature registry (`runFeatureUpdates` in the update, `runFeatureDraws` in the draw). `handleX()` / `STATE_HANDLERS` run one update then one draw, which is what tests drive. New gameplay goes in an update step; anything that touches `ctx` or the page goes in a draw step.
10. **`src/09-init.js` — Section 9, Initialisation.** Registers the service worker and loads the `?tune=1` panel. (Sprites, state and the first loop start from the asset loaders in `03-assets.js`.)
11. **`src/10-test-exposure.js` — Section 10, Test exposure.** Node-only globals so tests can poke internals.

### Adding a visual tunable

1. Add the key to `GAME_CONFIG` near related visual config.
2. At the call site, read via `cfg('KEY')` instead of a literal.
3. Add the key to `TUNABLE_KEYS` (just below `cfg()` in Section 2) so the `?tune=1` panel shows it. A unit test fails until the list matches the `cfg('...')` calls.
4. Add a test in `describe('Live-tuning hook (PR-P3)', ...)` if behaviour-sensitive.

**Never** route physics/spawning/scoring/hitbox values through `cfg()`. Determinism depends on those reading `GAME_CONFIG.X` directly.

### Adding a QA playtest flag

Add one row to `QA_FLAGS` (id, `?param`, and if it shows an overlay: `hold`, `gate`, `latch`, `count`, `draw`). `readQaFlags()`, `resetGame()`, `advanceQaFlags()` and `drawQaFlags()` pick it up; the row order is the advance and draw order. A flag must never touch score, speed, gaps, hitboxes or `game.rng()`.

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

Add a `describe`/`it` block to the area file it belongs to in `tests/unit/`: `physics` (jump, collision, score, speed, states, restart, sim clock), `spawning` (obstacle types and gaps), `rendering` (sky, hills, clouds, stars, ground, dino, HUD and screens), `effects` (particles, dust, flashes, shakes, pops, badges, pulses), `daily`, `shell` (audio, mode toggle, sizing, storage, tuning, feature registry, offline) or `qa` (`?qa…=1` flags and the death log). A new area is a new file that starts with `beginTestFile('<area>');` plus one entry in `tests/unit/files.js`. Top-level helpers in one area file share a global scope with the others in the browser, so give them names no other file uses. Manage state by snapshot-mutate-restore inside each `it`:

```js
it('does the thing', () => {
  const orig = game.someField;
  game.someField = ...;
  // assertions
  game.someField = orig;
});
```

The harness has no JSDOM. Canvas and document are stubbed in `src/01-node-stubs.js`. Spying on `ctx` methods works via direct property assignment; restore at end of test. The Node canvas stub's `save()`/`restore()` do nothing, so a test that draws and then reads `ctx.globalAlpha` (or leaves it changed) should set or put back the value itself; area files run in a different order than they would if they were one file, and must not depend on what an earlier file left behind.

## Determinism contract

`game.rng()` is the **only** source of gameplay-affecting randomness. It's seeded from `Date.now()` at each `resetGame()`. Used for: hill init/respawn, obstacle spawn-gap jitter, obstacle type selection.

`Math.random()` is reserved for **cosmetic** randomness only — particle emit jitter, cloud positions, audio pitch wobble, star positions. These don't perturb the gameplay-determinism contract because they don't influence collision, scoring, or spawn timing.

Live-tuning overrides (`window.GAME_TUNING`) apply to **visuals only**. Physics, spawning, scoring, and hitboxes read `GAME_CONFIG.X` directly — they're not routed through `cfg()`.

## Modes & reduced-motion

```js
const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated', DAILY: 'daily' });
function isDailyMode()   { return game.mode === MODES.DAILY; }
function isUpdatedMode() { return game.mode === MODES.UPDATED || game.mode === MODES.DAILY; }
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

`MODES.DAILY` is activated by the `#daily-btn` button (not persisted to `dino-mode`). `isUpdatedMode()` returns `true` for both UPDATED and DAILY, so all juice/variety features apply in daily runs.

`reducedMotion` is read once at module load. Each ambient feature self-gates internally:

| Feature | reducedMotion=true | mode=classic |
|---|---|---|
| Hills | no scroll | no draw |
| Clouds | no movement | drawn faintly |
| Particles | 25% count, 50% life | not emitted |
| Sky-tint flash | suppressed | suppressed |
| Speed streaks | not drawn | not drawn |
| Squash/stretch, slam kick | off | off |

## `localStorage` keys

| Key | Format | Written by | Read by |
|---|---|---|---|
| `dino-mode` | `'classic'` / `'updated'` | `setMode()` | `loadMode()` at boot |
| `dino-muted` | `'0'` / `'1'` | `audio.setMuted` | `audio.muted` init |
| `dino-high-score` | integer string | `ScoreStore.saveHighScore()` | `ScoreStore.loadHighScore()` |
| `dino-tuning` | JSON | `saveTuning()` | `loadTuning()` at boot |
| `dino-daily-date` | YYYYMMDD integer string | `ScoreStore.saveDailyBest()` | `ScoreStore.loadDailyBest()` |
| `dino-daily-best` | integer string | `ScoreStore.saveDailyBest()` | `ScoreStore.loadDailyBest()` |
| `dino-rotate-hint-seen` | `'1'` once seen | `markRotateHintSeen()` | `rotateHintSeen()` |

Every read and write goes through `safeStorage.get(key, fallback)` / `safeStorage.set(key, value)` in Section 2, never `localStorage` directly.

## Test harness

Custom `describe`/`it` with `assert`/`assertEquals`/`assertNotEquals`. No Jest, no Mocha, no JSDOM. Unit tests live in one file per area under `tests/unit/`, on the shared `tests/harness.js`. `node tests/unit.test.js` loads the harness (which loads the game files once), runs each area file in the order `tests/unit/files.js` gives, and prints one line per file then the totals; `npm test` runs it and then the golden-run replays.

The Node stubs in `src/01-node-stubs.js` provide just enough of `window`, `document`, `Image`, `localStorage`, `requestAnimationFrame`, and `matchMedia` to let the rest of the file load. Canvas methods are no-ops; tests assert against `game.*` state, not pixels.

The same suite also runs in a real browser: `npm run serve`, then open http://localhost:8080/tests/test-runner.html and read the console (it ends with the same Test Summary). The page carries the `index.html` shell so the game finds its buttons, and loads the harness and the same area files, in the same order, after the sprites finish loading. Console output uses CSS styling for pass/fail.

Keep a new test passing in both places. A browser will not let a test replace `location`, `document.body`, `document.documentElement`, an element's `style`, or `navigator.clipboard` by plain assignment, so use the helpers in `tests/harness.js`: `setPageQuery()`/`savePageQuery()` for `?qa…` flags, `overrideDocumentProp()`, `stubElementStyle()`/`restoreElementStyle()`, and `Object.defineProperty` for other getters. Use `testGlobal`, not Node's `global`.

### Real-browser smoke test

`npm run test:browser` serves the repo on a random local port and drives the real page in headless Chromium (Playwright, pinned in `package.json`) at five sizes: desktop 1280x800, iPhone 13 and Pixel 7 portrait, iPhone 13 landscape, and a narrow 320x640 Android phone. On each it starts a run, jumps, dies, restarts (skipping the countdown), toggles mute, fullscreen, Classic/Updated and Daily, and checks that the canvas, jump button (touch only; it stays hidden on desktop) and top-row buttons fit on screen without overlapping with no sideways scroll. Any console error, page error or failed request fails it. It then checks the game reloads with the network off once the service worker is in, and opens `tests/test-runner.html` and fails unless every unit test passes there too.

It reads game state by name (`game.state`, `dino.isJumping`, `audio.muted`), so renaming those top-level declarations means updating `tests/browser/smoke.js`. Screenshots of each step go to `tests/browser/screenshots/` (git-ignored). CI runs it as the `browser` job on every push and PR and uploads the screenshots as the `browser-screenshots` artifact, so a PR with a visible change can link those instead of hand-made ones. `pages.yml` runs the same job as a deploy gate. In this cloud environment Chromium is preinstalled; elsewhere run `npx playwright install chromium` once.

### Screenshot comparisons

`npm run test:visual` draws five key screens on the game canvas (start, running by day, night, Game Over, Daily result) at desktop 1280x800 (rendered at 2x) and iPhone 13 sizes, and compares each with `tests/browser/references/<size>-<screen>.png`. The comparison works on 2x2-pixel averages: a block counts as changed when a channel moves by more than 16/255 and no block within one step matches, and a screen fails when more than 0.2% of blocks changed. That absorbs the small glyph-edge differences between two Linux machines while a colour change, a moved sprite or a different digit still fails. On a failure it writes a side-by-side image (reference, now, changed blocks in red) to `tests/browser/visual-diffs/`, which CI uploads with the smoke screenshots.

Each screen is made deterministic first: a fixed run seed per screen (`replayRunSeed`), a seeded `Math.random`, a fixed clock (`2026-07-01`, for the Daily number), no service worker, and the loop stopped and stepped by hand one 60Hz slice at a time. Only the canvas's own bitmap (`toDataURL`) is compared, not a page crop: the page buttons use system fonts that differ between machines, and a crop gains or loses a row when the layout puts the canvas on a half pixel. When a visual change is intended, run `npm run test:visual -- --update`, look at the new images, and commit them with the change. References recorded in this cloud environment match GitHub's runners (checked on the PR that added this); desktop renders at 2x because at 1x the two machines hint canvas text differently enough to fail.

### Coverage

`npm run coverage` runs `npm test` (unit tests and replays) under `c8` and prints line, branch and function coverage for the game files in `src/`; an HTML report with per-line detail lands in `coverage/index.html` (git-ignored). CI prints the same summary on every push and PR, in the log and on the run's summary page. It is information only: there is no threshold and it never fails the build. V8 counts comment and blank lines as covered, so read the per-function view in the HTML report, not just the headline number.
### Golden-run replays

`tests/replay.test.js` (run by `npm test`, or alone with `npm run test:replay`) plays whole runs through the real `gameLoop()`, one 60Hz slice at a time, from the files in `tests/golden/`. Each file holds a mode, a fixed run seed and the frames the player jumps on, then what must happen: every obstacle's spawn frame, type and gap, each jump's take-off/landing/peak, the death frame and the final score. A mismatch prints the changed values and fails. The set covers Classic, Updated and a fixed-seed Daily, a run past the plateau (score 640+), runs that die early and a run of short hops and fast falls (each file can also list the frames the player lets go of jump, `releases`, and fast-falls, `drops`). It also replays with every `cfg()` key overridden in `GAME_TUNING` and expects an identical run, which is how the determinism contract is enforced.

When a gameplay change is intended, re-record with `npm run test:replay -- --update` (an autopilot re-plans the jump frames), check the golden diff in git makes sense, and commit it with the change. A refactor that is not meant to change gameplay must not need a re-record. Node only: the browser runner does not load it.

### Using `/tdd` in this project

When running `/tdd`, tests must only use globals exported in the `Section 10 — Test exposure` block in `src/10-test-exposure.js` (the `if (typeof process !== 'undefined' ...)` block). Canvas draw calls are no-ops — assert against `game.*` state, not pixels. `ctx.drawImage` and similar can be spied on by reassigning the property and restoring after the test.

## How pull requests merge

The default and deploy branch is `initial-chrome-dino-game` (there is no `master`). The owner is not a coder and has given standing approval for Claude to merge its own PRs once checks pass, so PRs should not wait on a human.

1. Open the PR against `initial-chrome-dino-game` and make sure `npm test`, `npm run lint` and `npm run format:check` pass locally.
2. When the PR is finished, add the **`automerge`** label. Leave it off (or open a draft) while work is still in progress.
3. `.github/workflows/automerge.yml` (the merge queue) takes labelled, non-draft PRs one at a time, oldest first. It merges each with the latest base, runs lint, format check and tests on the combined code, checks the base has not moved meanwhile (if it has, it tests again), then squash-merges, starts the Pages deploy and moves on to the next PR. It also runs hourly as a safety net.
4. If the combined code fails or conflicts, the queue removes the label and comments on the PR with the run link. Fix the branch (merge the base in; don't force-push someone else's branch) and add the label again.

Merges made by the queue use the workflow token, which does not fire `push` workflows, so the queue starts `pages.yml` itself. A human or Claude merging by hand still triggers the normal push deploy.

## Deploy pipeline

`.github/workflows/pages.yml`:

1. **Test job** — under Node 20, runs `npm ci`, then `npm run lint`, `npm run format:check` and `npm test`. A lint error, unformatted code or a failing test blocks deploy. Lint warnings print but do not block. A parallel **browser job** runs `npm run test:browser`; deploy waits for both.
2. **Deploy job** — runs `sed` to inject `${GITHUB_SHA::7}` into every `src/*.js?v=__VERSION__` and `style.css?v=__VERSION__` in `index.html`, and into the offline cache name in `sw.js`. This forces browsers to re-fetch on every deploy.
3. **Pages publish** — uploads the repo root as an artifact and deploys to GitHub Pages.

Local dev keeps `__VERSION__` literal in the URL — browsers ignore the unknown query string and serve normally.

## Live-tuning workflow

The easy way: open the game with `?tune=1` (for example http://localhost:8080/?tune=1 or the live site). `tune.js` adds a panel with a slider, colour picker or text box for every key in `TUNABLE_KEYS`. Changes show on the next frame. **Save** keeps them in this browser (`dino-tuning`), **Reset** puts every key back to its default, and **Copy** copies the changed values as `GAME_CONFIG` lines. When it looks right, paste those lines into `GAME_CONFIG`, Reset the panel, and ship only the final values in a PR, instead of adding a QA flag per tweak. The panel can only reach `TUNABLE_KEYS`, which are all visual; the golden replays check that overriding every one of them leaves a run unchanged.

The same thing from DevTools:

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

Read the `cfg()` block in `src/02-config.js` for the full list of safe-to-tune keys (and the explicit "do not tune physics" warning).

## Known invariants

Rules that apply across all call sites. Violating these silently misbehaves rather than crashes — so they must be checked during any refactor that touches the affected code.

**`cancelAnimationFrame` before restarting the loop.** Any code path that calls `resetGame()` + `gameLoop()` must first call `cancelAnimationFrame(game.animationFrameId)`, or a duplicate loop is created and the game runs at double speed. Current compliant sites: `setMode()`, daily-mode toggle, `handleAction()` (DEAD→restart branch). Pattern: `cancelAnimationFrame(game.animationFrameId); resetGame(); gameLoop();`

**All storage goes through `safeStorage`.** Browsers that block storage throw on every `localStorage` access, and one unguarded read at module load stops the game booting. `safeStorage.get` returns the fallback when the read throws, and `safeStorage.set` keeps a failed write in memory so it still reads back this session. Never call `localStorage` directly outside `safeStorage`.

**`game.rng()` is the only source of gameplay randomness.** Obstacle type, spawn-gap jitter, hill init/respawn all use `game.rng()`. `Math.random()` is reserved for purely cosmetic effects (particles, clouds, audio pitch). Swapping them breaks the daily-challenge determinism contract.

**Physics/spawning/scoring read `GAME_CONFIG.X` directly — never via `cfg()`.** `cfg()` is for visual tunables only. Any physics or spawning value routed through `cfg()` would allow live-tuning overrides to perturb the determinism contract.

**Sim steps are 60Hz, not the display refresh.** `gameLoop(timestamp)` accumulates rAF time and runs the state's update step once per `SIM_FRAME_MS` (1/60s) slice, at most `MAX_SIM_STEPS` slices per animation frame, then draws once. A frame that owes nothing neither updates nor draws, so a 120Hz display does not double score, speed, spawn timing, jump physics, or particle emits. `gameLoop()` with no timestamp — the test harness, and the kickoff after `resetGame()` — is exactly one slice and does not write the rAF clock. `resetGame()` clears the accumulator so a hitch cannot burst into the next run.

**New boot files go in `sw.js` `PRECACHE_URLS`.** Any file the game fetches at boot (a new sprite, stylesheet, or script) must be added to the precache list, or the installed app breaks offline. The `Installable and offline (PL1)` tests check that every sprite the game loads and every icon is precached, and the `Game files (C4)` tests check every game file is. `pages.yml` rewrites `__VERSION__` in both `index.html` and `sw.js`.

## Where design history lives

`docs/dev/specs/` and `docs/dev/plans/` carry the original design decisions and implementation plans for past phases. Treat these as a historical record — read for context, but don't rewrite or delete them as part of unrelated work.

## Design pillars

Three pillars define what the game is trying to make the player feel. Every new feature must serve at least one — if it doesn't, it doesn't belong.

1. **Flow** — primary emotion. A great run feels like time disappeared. Any feature that snaps the player out of rhythm is a design problem.
2. **Atmosphere** — deepens flow in Updated mode (hills, clouds, particles, day/night). Must stay peripheral — never drawing the eye away from the obstacle lane. Never added to Classic mode.
3. **One shared run** — the Daily Challenge. Social context (badge, share result) belongs at the edges of the run only, not during gameplay.

## CONTEXT.md as a live working document

`CONTEXT.md` is the authoritative glossary for domain terms and architectural decisions. During any grilling or planning session:

- **Check it first** before naming a new concept — does a term already exist?
- **Update it immediately** when a term is resolved or sharpened — don't batch
- **Add invariants** (see above) when a new one is identified during grilling
- Future sessions opening `CONTEXT.md` should already know what was decided and why, without having to re-derive it
