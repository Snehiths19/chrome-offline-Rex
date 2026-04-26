# Visible UX Polish Pass — Design Spec

**Date:** 2026-04-25
**Status:** Approved — ready for implementation planning
**Scope:** Pass 1 of 2. All changes are `script.js`-only. No HTML, CSS, or asset changes required.

---

## Context

PRs #19–22 (P1–P4) completed a polish pass focused on bug fixes, the feature registry, live-tuning, and docs. The game is now feature-rich but has several visible rough edges that affect how it reads and feels to players:

- The HUD only shows the current score; there is no in-game high-score display.
- All text uses plain `Arial`, which reads as a browser default rather than an arcade game.
- Score is formatted as `"Score: 42"` — wordy, not arcade-style.
- Hill colour snaps abruptly during the day→night transition while the sky smoothly interpolates.
- The page body stays light grey when the canvas goes dark at night, breaking immersion.
- The game over screen shows "Best: 0" on a player's first run.
- The dino is completely static during the GET READY countdown.

This pass fixes all seven items in one focused PR.

---

## Section 1 — HUD redesign

### 1a. Font

Replace all hardcoded `'NNpx Arial'` in `script.js` with a monospace stack. Add a single config key:

```js
SCORE_FONT_FAMILY: "'Courier New', Courier, monospace",
```

Route it through `cfg('SCORE_FONT_FAMILY')` so it is live-tunable. Every canvas text call — `drawScore`, `drawGetReadyOverlay`, `drawGameOverScreen`, `drawMilestoneFlash`, `drawNewBestBadge` — derives its font family from this key. Only the size part (`'20px'`, `'40px'`, etc.) stays hardcoded per call site.

### 1b. Score format

Drop the `'Score: '` prefix. Display the current score as a zero-padded 5-digit integer:

```js
String(Math.floor(game.score)).padStart(5, '0')
```

Range: `00000`–`99999`. Matches the Chrome T-Rex display convention.

### 1c. High-score in HUD

Add a `HI NNNNN` label to the left of the current score in `drawScore()`. Layout:

```
HI 00312    00487          ← approximate positions
```

- `HI` label + zero-padded best at `x = canvas.width - SCORE_X_OFFSET - 110` (new config key `SCORE_HI_X_OFFSET = 110`).
- Current score at `x = canvas.width - SCORE_X_OFFSET` (unchanged).
- Both labels use the same `game.score >= DAY_NIGHT_START` colour switch already in `drawScore`.
- The `HI` label is **only rendered when `game.highScore > 0`**. On a first run the right side shows only the current score.

Files touched: `script.js` — `GAME_CONFIG` (2 new keys), `drawScore`.

---

## Section 2 — World visual fixes

### 2a. Hill colour interpolation

`drawHills()` currently selects `HILL_COLOR_DAY` vs `HILL_COLOR_NIGHT` with a hard threshold at `DAY_NIGHT_START` (score 300). The sky (`getBackgroundColor`) smoothly interpolates between score 300 and 400 (`DAY_NIGHT_END`). Hills should match.

Fix: extract the day-to-night interpolation factor `t` and lerp the hill RGB values across the same window:

```js
// t = 0 at DAY_NIGHT_START, 1 at DAY_NIGHT_END, clamped
const t = reducedMotion ? (score >= DAY_NIGHT_END ? 1 : 0)
        : Math.max(0, Math.min(1, (score - DAY_NIGHT_START) / (DAY_NIGHT_END - DAY_NIGHT_START)));
```

The two hill colour hex strings (`HILL_COLOR_DAY = '#cdcdcd'`, `HILL_COLOR_NIGHT = '#3a3a55'`) are already in `GAME_CONFIG`. Parse them to RGB at draw time, lerp each channel, reconstruct as a hex string. No new config keys needed.

Under `reducedMotion`, snap at `DAY_NIGHT_END` (same behaviour as the background).

Files touched: `script.js` — `drawHills`.

### 2b. Body background sync

The page body (`background-color: #f0f0f0` in `style.css`) stays light grey while the canvas fades to `#1a1a2e` at night, making the canvas look like a floating panel rather than an immersive game.

Fix: one line in the RUNNING branch of `gameLoop` after `drawBackground()`:

```js
document.body.style.background = getBackgroundColor(game.score);
```

Reset to `'#ffffff'` in `resetGame()` so a fresh game starts white.

Called once per frame at 60 fps — this is a single style property write, no layout reflow, negligible cost.

Files touched: `script.js` — RUNNING branch of `gameLoop`, `resetGame`.

---

## Section 3 — Micro-fixes

### 3a. Game over "Best: 0"

`drawGameOverScreen()` unconditionally renders `'Best: ' + game.highScore`. On a first run `game.highScore` is 0.

Fix: gate the best line on `game.highScore > 0`. When there is no recorded best, the game over screen shows only GAME OVER, the current score, and the restart prompt.

Files touched: `script.js` — `drawGameOverScreen`.

### 3b. Dino animation in WAITING

During the GET READY countdown, `game.animFrame` is never incremented, so `drawDino()` always renders run-frame 0. The dino is visually frozen.

Fix: add `game.animFrame++` to the WAITING branch of `gameLoop`, immediately after `game.graceFrames--`. The dino will cycle through its two-frame run animation while the countdown ticks.

Files touched: `script.js` — WAITING branch of `gameLoop`.

---

## Architecture summary

All seven changes are confined to `script.js`. No HTML or CSS edits. The changes are grouped into three independently reviewable hunks but small enough to ship in a single PR.

| Hunk | Functions changed | New config keys |
|---|---|---|
| HUD redesign | `drawScore` | `SCORE_FONT_FAMILY`, `SCORE_HI_X_OFFSET` |
| World visual fixes | `drawHills`, `gameLoop` (RUNNING), `resetGame` | none |
| Micro-fixes | `drawGameOverScreen`, `gameLoop` (WAITING) | none |

---

## Verification checklist

- [ ] Score displays as `00000`–`99999` (zero-padded, no "Score: " prefix).
- [ ] All canvas text uses the monospace font stack.
- [ ] `HI NNNNN` appears in HUD after the first run ends; absent on the very first run.
- [ ] Hill colour fades gradually from grey to dark blue between score 300 and 400.
- [ ] Page background transitions to dark at night alongside the canvas.
- [ ] `resetGame()` restores the body background to white.
- [ ] Game over screen hides "Best" line when high score is 0.
- [ ] Dino runs in place during the GET READY countdown.
- [ ] `reducedMotion`: hill colour snaps (no interpolation), body background still syncs.
- [ ] Classic mode: no regressions — font, score format, and micro-fixes apply equally.
- [ ] `npm test` passes — no existing tests broken.

---

## Out of scope (Pass 2)

- Tests for `getBackgroundColor` interpolation.
- Tests for the new HUD high-score rendering.
- Tests for `audio.land()` and `audio.death()`.
- Tests for hill colour interpolation.
- Tests for `announce()`.
