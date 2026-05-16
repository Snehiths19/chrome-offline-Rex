# Daily Challenge

**Date:** 2026-05-01
**Status:** Approved

## Goal

Add a daily challenge mode that seeds `game.rng` from the current calendar date, giving all players the same obstacle sequence each day. Replayability hook: players return to beat their daily best. No backend required.

---

## Design decisions

See ADRs:
- `docs/adr/0001-daily-challenge-as-separate-button.md` — why daily is a button, not a third mode
- `docs/adr/0002-daily-challenge-unlimited-attempts.md` — why unlimited attempts, not one-and-done

---

## Domain terms

See `CONTEXT.md` — Daily Challenge section. Key terms: **daily seed**, **daily number**, **daily best**, **share result**.

---

## Seed + daily number

```js
// Daily seed: YYYYMMDD integer — same for every player on the same calendar day
function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Daily number: days since project epoch (Day 1 = 2026-03-01)
const DAILY_EPOCH_MS = new Date('2026-03-01T00:00:00Z').getTime();
function dailyNumber() {
  return Math.floor((Date.now() - DAILY_EPOCH_MS) / 86400000) + 1;
}
```

`dailySeed()` replaces `Date.now() & 0xffffffff` as the `mulberry32` seed in `resetGame()` when `isDailyMode()` is true.

---

## localStorage keys (additions)

| Key | Format | Written by | Read by |
|---|---|---|---|
| `dino-daily-date` | YYYYMMDD integer string | `saveDailyBest()` | `loadDailyBest()` at boot |
| `dino-daily-best` | integer string | `saveDailyBest()` | `game.dailyBest` init |

`loadDailyBest()` compares `dino-daily-date` against today's `dailySeed()`. If they differ, the stored best is stale — return 0 and let `resetGame()` start fresh.

---

## MODES change

```js
const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated', DAILY: 'daily' });
function isDailyMode()   { return game.mode === MODES.DAILY; }
function isUpdatedMode() { return game.mode === MODES.UPDATED || game.mode === MODES.DAILY; }
```

`isDailyMode()` is new. `isUpdatedMode()` gains the `|| isDailyMode()` clause so all Updated-mode features (particles, audio, obstacle variety, hills) activate automatically in daily mode.

`MODES.DAILY` is never persisted to `dino-mode` — the daily button is a session-level activation, not a remembered preference.

---

## `game` object additions

```js
dailyBest:    loadDailyBest(),   // today's best score; 0 if date changed since last visit
```

---

## `resetGame()` change

```js
game.rng = isDailyMode()
  ? mulberry32(dailySeed())
  : mulberry32(Date.now() & 0xffffffff);
```

---

## HUD changes (`drawScore()`)

When `isDailyMode()`:

1. **Top-left badge** — render `📅 DAILY #N` in small monospace at `(12, SCORE_Y)`.
2. **Top-right scores** — replace `HI` label with `TODAY`; show `game.dailyBest` instead of `game.highScore`.

When not in daily mode, `drawScore()` is unchanged.

---

## Game Over screen changes (death handler + `drawDeathScreen()`)

When `isDailyMode()`:

1. Update `game.dailyBest` if current score exceeds it, then call `saveDailyBest()`.
2. Render `TODAY BEST: XXXXX` line below the score line.
3. Render a `📋 Copy result` text button below the restart prompt.

`📋 Copy result` is hit-tested in the existing mouse/touch handler. On activation:

```js
function shareDailyResult() {
  const text = [
    `Rex Daily #${dailyNumber()} 🦕`,
    `Score: ${Math.floor(game.score)}`,
    `https://snehiths19.github.io/chrome-offline-Rex/`,
  ].join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}
```

No UI feedback needed beyond the button text momentarily changing to `✓ Copied` for ~1.5 s (driven by a `game.copyFlashFrames` counter, similar to existing flash counters).

---

## UI / HTML changes

`index.html`: add `<button id="daily-btn" aria-label="Daily challenge">📅</button>` alongside `#mute-btn`.

When daily mode is active, add class `daily-active` to `#game-wrapper` (or equivalent container). CSS hides the Classic/Updated mode toggle while this class is present:

```css
.daily-active #mode-btn { display: none; }
```

When daily mode is deactivated (player presses the daily button again, or navigates away and back), remove the class and restore the toggle.

---

## Files touched

| File | What changes |
|---|---|
| `script.js` | MODES, isUpdatedMode, new helpers (dailySeed, dailyNumber, loadDailyBest, saveDailyBest, shareDailyResult), resetGame, drawScore, drawDeathScreen, death handler, input handler, Section 10 test exposure |
| `index.html` | Add `#daily-btn` |
| `style.css` | Position `#daily-btn`; `.daily-active #mode-btn { display: none; }` |
| `tests/game.test.js` | New describe blocks (see below) |
| `CONTEXT.md` | Daily Challenge section (already written) |
| `docs/adr/` | Two ADRs (already written) |

---

## Tests

```
describe('Daily seed')
  it('dailySeed() returns an 8-digit YYYYMMDD integer')
  it('dailySeed() is the same when called twice on the same day')

describe('Daily number')
  it('dailyNumber() returns a positive integer')
  it('dailyNumber() is greater for a later date')

describe('Daily best persistence')
  it('loadDailyBest() returns 0 when stored date does not match today')
  it('loadDailyBest() returns stored value when date matches today')
  it('saveDailyBest() stores score and today date; subsequent loadDailyBest returns it')

describe('Share result')
  it('shareDailyResult() returns a string containing the daily number and score')
  it('shareDailyResult() does not throw when navigator.clipboard is unavailable')

describe('Daily mode RNG seeding')
  it('resetGame() in daily mode seeds rng from dailySeed(), not Date.now()')
  it('two resets in daily mode produce the same obstacle type sequence')
```

---

## Implementation phases

1. **Seed + daily number utilities + tests** — `dailySeed()`, `dailyNumber()`, `loadDailyBest()`, `saveDailyBest()`. No visible change. (~45 min)
2. **MODES + resetGame hook** — add `MODES.DAILY`, update `isUpdatedMode()`, wire `resetGame()`. Tests for deterministic replay. (~30 min)
3. **Daily button + mode-toggle hide** — HTML + CSS + input handler. Daily mode now activatable. (~30 min)
4. **HUD badge + TODAY label** — update `drawScore()`. (~20 min)
5. **Death screen: daily best + share button** — update death handler + `drawDeathScreen()` + `shareDailyResult()`. (~45 min)
6. **Polish pass** — copyFlash feedback, button active state, test on mobile. (~30 min)

Total: ~3.5 hours.

---

## Verification checklist

- [ ] Same date produces the same obstacle sequence across two browser tabs
- [ ] Daily best persists across page reloads on the same day
- [ ] Daily best resets to 0 on the next day (verify by temporarily overriding `dailySeed()` return value)
- [ ] Classic/Updated toggle is hidden while daily mode is active; restored when deactivated
- [ ] Share button copies correctly formatted text to clipboard
- [ ] Share button shows `✓ Copied` feedback for ~1.5 s
- [ ] `npm test` — all existing tests + ~8 new tests pass
- [ ] With OS reduce-motion on: particles suppressed, audio unchanged, HUD badge visible
