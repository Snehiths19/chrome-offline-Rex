# Chrome Dino Game — Mechanic Fixes & Visual Polish

**Date:** 2026-03-26
**Branch:** initial-chrome-dino-game
**Scope:** Approach B — full polish pass on `script.js` only

---

## Assumptions

- Canvas internal dimensions: **600×200px** (as defined in `index.html`)
- Starting game speed: **2px/frame** (`currentSpeed = 2` in current code)
- Cactus height: **40px**

---

## 1. Mechanic Fixes

### Jump Feel
- **Problem:** `jumpPower = -15` + `gravity = 0.5` → peak height = 15² / (2 × 0.5) = **225px** on a 200px canvas. The dino flies off-screen.
- **Fix:** Set `jumpPower = -10`, `gravity = 0.8` → peak height = 10² / (2 × 0.8) = **62.5px**. That gives ~22.5px clearance over the 40px cactus — comfortable and snappy.

### Obstacle Spacing
- **Problem:** Obstacles spawn every `spawnInterval` frames regardless of where the previous cactus is, causing clusters at high speed.
- **Fix:** Add `let lastObstacleX = -300` (initialized so the first spawn is immediate on frame 1).
  - `lastObstacleX` tracks the **left-edge x position** of the **most recently spawned** obstacle, updated each frame via `updateObstacles`.
  - Spawn condition: only spawn when `lastObstacleX <= canvas.width - 300` (i.e. the last cactus has moved at least 300px inward from the right edge).
  - The 300px gap is **fixed in pixels** (not speed-scaled). At higher speed obstacles close faster, which naturally increases challenge without further compression of gaps.
  - The frame-based `spawnInterval` timer is **removed** and replaced entirely by this gap check.

### Difficulty Curve
- **Starting speed:** `currentSpeed = 2` (unchanged)
- **Cap:** `currentSpeed` capped at **5** (3-unit range from start to max)
- **Ramp:** `+0.3` per 100pts (was `+0.5`)
- **Spawn interval floor:** removed (replaced by gap-based spawning above)
- Result: speed plateaus at score ~1000, giving players a long playable window

---

## 2. Visual Polish

### Clouds
- **Initialised once** at game start: array of 3 cloud objects, each with random `x` (spread across canvas width), `y` (between 10 and 50px), and `speed` (random between `0.3 × currentSpeed` and `0.6 × currentSpeed` at time of init — re-evaluated per cloud on reset).
- At starting speed 2: cloud speeds range **0.6–1.2px/frame** — perceptible parallax.
- Each cloud drawn as 3 overlapping `ctx.arc` circles (white/light gray fill, no stroke).
- Each frame: `cloud.x -= cloud.speed`. When `cloud.x + cloudWidth < 0`, reset to `x = canvas.width + 20` with a new random `y`.
- No new image assets required.

### Day/Night Cycle
| Score | Background | Text color |
|-------|-----------|------------|
| 0–299 | White `#ffffff` | Dark `#000000` |
| 300–399 | Interpolates white → `#1a1a2e` | Switches to **white at score 300** |
| 400+ | `#1a1a2e` (full night) | White `#ffffff` |

- **Interpolation:** `t = (score - 300) / 100` (clamped 0–1). Each RGB channel linearly interpolated between the two colors. Applied as `ctx.fillStyle` background fill each frame — not CSS.
- **Stars:** Initialised **once** when `score` first crosses 400, stored in a `stars` array of 12 objects with random `x`, `y`. Rendered each frame from that array (static — no flicker). Stars are cleared/reset on `resetGame()`.

### Game Over Overlay & High Score
- **Game loop behaviour:** on collision, `gameRunning = false` and `cancelAnimationFrame` is called (existing behaviour, preserved). The loop halts — the canvas is **frozen** at the moment of collision.
- **Overlay:** semi-transparent dark fill (`rgba(0, 0, 0, 0.6)`) drawn over the frozen canvas state.
- **High score:** stored in `localStorage` under key `dino-high-score`. Updated at game over if `score > highScore`.
- **Overlay text (centred):**
  - "GAME OVER" (large)
  - "Score: X" 
  - "Best: Y"
  - "Tap / Press Space to Restart" (small)
- **Text color:** white (readable over the dark overlay regardless of day/night state).

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `script.js` | Jump/gravity constants, `lastObstacleX` gap-based spawning, difficulty cap, cloud array + rendering, day/night interpolation + stars, high score `localStorage` logic |
| `style.css` | No changes |
| `index.html` | No changes |

---

## 4. Out of Scope (Next Phase)

- Flying obstacles (pterodactyls)
- Duck mechanic
- Audio / sound effects
- Modular file split
