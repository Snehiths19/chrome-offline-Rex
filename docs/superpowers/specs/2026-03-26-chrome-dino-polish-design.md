# Chrome Dino Game — Mechanic Fixes & Visual Polish

**Date:** 2026-03-26
**Branch:** initial-chrome-dino-game
**Scope:** Approach B — full polish pass on `script.js` and `style.css`

---

## 1. Mechanic Fixes

### Jump Feel
- **Problem:** `jumpPower = -15` + `gravity = 0.5` lets the dino reach ~225px on a 200px canvas — it jumps off-screen.
- **Fix:** Set `jumpPower = -10`, `gravity = 0.8`. Peak height ~62px. Snappier arc, comfortable clearance over the 40px cactus.

### Obstacle Spacing
- **Problem:** Obstacles spawn every `spawnInterval` frames regardless of where the previous cactus is, causing cluster spawns at high speed.
- **Fix:** Track `lastObstacleX`. Only spawn a new obstacle when the last one has moved at least 300px from the right edge (i.e., `lastObstacleX <= canvas.width - 300`).

### Difficulty Curve
- **Problem:** Speed has no cap and ramps at `+0.5` per 100pts; spawn interval floors at 60 frames — game becomes unplayable quickly.
- **Fix:**
  - Cap `currentSpeed` at `5`
  - Reduce ramp to `+0.3` per 100pts
  - Floor `spawnInterval` at `80` frames
  - Game gets meaningfully harder but stays playable past score 500.

---

## 2. Visual Polish

### Clouds
- 3 clouds generated at game start with randomised x, y (top third of canvas), and scroll speed (0.3–0.6× game speed for parallax depth).
- Each cloud = 3 overlapping `ctx.arc` circles in white/light gray.
- When a cloud exits the left edge it resets to the right with a new random y.
- No new image assets required.

### Day/Night Cycle
- **Score 0–299:** White background (current look).
- **Score 300–399:** Smooth linear interpolation from white → dark blue-gray (`#1a1a2e`).
- **Score 400+:** Full night — dark background, 10–15 static white star dots, score/text inverts to white.
- Ground and obstacle rendering unchanged; only background color and text color shift.

### Game Over UI & High Score
- High score persisted in `localStorage` under key `dino-high-score`, updated on every game over.
- Game Over overlay (rendered on canvas) shows:
  - "GAME OVER"
  - "Score: X"
  - "Best: Y"
  - "Tap / Press Space to Restart"
- Text color adapts to day (dark text) vs night (white text).
- No changes to `index.html` layout.

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `script.js` | Jump/gravity constants, obstacle gap logic, difficulty caps, cloud rendering, day/night cycle, high score logic |
| `style.css` | No changes required |
| `index.html` | No changes required |

---

## 4. Out of Scope (Next Phase)

- Flying obstacles (pterodactyls)
- Duck mechanic
- Audio / sound effects
- Modular file split
