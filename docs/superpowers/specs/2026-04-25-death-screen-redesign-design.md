# Death Screen Redesign — Design Spec

**Goal:** Replace the current game-over screen with a two-state layout that shows a personal best delta on every death and a celebration takeover on a new record.

**Architecture:** Two rendering states driven by two new fields on `game` (`isNewBest`, `previousHighScore`) set in the death handler before `highScore` is updated. `drawGameOverScreen()` branches on `game.isNewBest`. No new files — all changes in `script.js`.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200 internal resolution). Custom Node test harness.

---

## Two-state architecture

`drawGameOverScreen()` has two exclusive rendering paths:

| State | Condition | Layout |
|---|---|---|
| Normal death | `game.isNewBest === false` | Side-by-side: THIS RUN \| gap \| YOUR BEST |
| New record | `game.isNewBest === true` | Celebration takeover: ★ NEW BEST ★ / score / delta |

### New `game` fields

Add to the `game` object initialisation (Section 4):

```js
isNewBest:         false,
previousHighScore: 0,
```

### Death handler update

In the RUNNING → DEAD transition, capture state *before* updating `highScore`:

```js
const finalScore = Math.floor(game.score);
game.isNewBest = finalScore > game.highScore || game.highScore === 0;
game.previousHighScore = game.highScore;
if (finalScore > game.highScore) {
  game.highScore = finalScore;
  localStorage.setItem('dino-high-score', game.highScore);
}
```

`game.highScore === 0` covers the first run — it is always treated as a new record.

### `resetGame()` additions

Reset both fields alongside existing state resets:

```js
game.isNewBest         = false;
game.previousHighScore = 0;
```

---

## Normal death screen

Rendered when `game.isNewBest === false`.

**Layout (canvas 600×200, centred vertically):**

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   THIS RUN          ← 203 →          YOUR BEST              │
│    00847           from best           01050                 │
│                                                              │
│              Tap / Press Space to restart                    │
└──────────────────────────────────────────────────────────────┘
```

- Full canvas dark overlay: `rgba(0,0,0,0.75)`
- Left column (`canvas.width * 0.2`): `THIS RUN` label (12px, `rgba(255,255,255,0.5)`) above score (28px, white)
- Centre (`canvas.width / 2`): `← {delta} →` (16px, `rgba(255,255,255,0.5)`) above `from best` (11px, `rgba(255,255,255,0.35)`)
- Right column (`canvas.width * 0.8`): `YOUR BEST` label (12px, `rgba(255,255,255,0.5)`) above high score (28px, `rgba(255,255,255,0.5)` — not competing with current score)
- Restart prompt: 13px, `rgba(255,255,255,0.35)`, bottom-centre (`canvas.height - 16`)
- No "GAME OVER" text — the overlay and layout make the state self-evident

**Delta value:** `game.highScore - Math.floor(game.score)`, always positive in this state.

---

## New record screen

Rendered when `game.isNewBest === true`.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                     ★  NEW BEST  ★                          │
│                        01253                                 │
│               +203 over your previous best                   │
│                                                              │
│              Tap / Press Space to restart                    │
└──────────────────────────────────────────────────────────────┘
```

- Full canvas dark overlay: `rgba(0,0,0,0.75)`
- `★ NEW BEST ★`: 15px, letter-spacing 3px, white, centred (`canvas.height / 2 - 36`)
- Score: 42px, white, centred (`canvas.height / 2 - 4`)
- Delta line: `+{delta} over your previous best`, 13px, `rgba(255,255,255,0.5)`, centred (`canvas.height / 2 + 28`). **Omitted entirely when `game.previousHighScore === 0`** (first run)
- Restart prompt: 13px, `rgba(255,255,255,0.35)`, bottom-centre (`canvas.height - 16`)
- `★` characters are plain unicode — no assets

**Delta value:** `Math.floor(game.score) - game.previousHighScore`, always positive in this state.

---

## Testing

New `describe('Death screen', ...)` block in `tests/game.test.js`. Five tests:

1. **`drawGameOverScreen` normal state does not throw** — set `game.isNewBest = false`, `game.highScore = 1050`, `game.score = 847`; call `drawGameOverScreen()`; assert no throw
2. **Delta value is correct** — `game.highScore - Math.floor(game.score)` equals 203 given the above values
3. **`drawGameOverScreen` new record state does not throw** — set `game.isNewBest = true`, `game.previousHighScore = 1050`, `game.score = 1253`; call `drawGameOverScreen()`; assert no throw
4. **First run suppresses delta line** — assert `game.previousHighScore === 0` is the condition; set `game.isNewBest = true`, `game.previousHighScore = 0`; assert condition holds
5. **Death handler sets flags correctly** — set `game.highScore = 1000`, `game.score = 1200`; trigger the death score-update block; assert `game.isNewBest === true` and `game.previousHighScore === 1000`

---

## Out of scope

- Animation (count-up, fade-in) — v1.1
- Sound on new record — handled by existing `audio.milestone()` hook, wired separately
- Leaderboard — explicitly out of scope (personal best only)
