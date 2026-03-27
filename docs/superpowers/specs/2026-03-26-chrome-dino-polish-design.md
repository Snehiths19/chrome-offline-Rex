# Chrome Dino Game — Mechanic Fixes & Visual Polish

**Date:** 2026-03-26
**Branch:** initial-chrome-dino-game
**Scope:** Approach B — full polish pass on `script.js` only

---

## Assumptions

- Canvas internal dimensions: **600×200px** (as defined in `index.html`)
- Starting game speed: **2px/frame** (`currentSpeed = 2` in current code)
- Cactus height: **40px**
- Dino height: **50px** → ground level = `canvas.height - dino.height = 150px`

---

## 1. Mechanic Fixes

### Jump Feel
- **Problem:** `jumpPower = -15` + `gravity = 0.5` → peak height = 15² / (2 × 0.5) = **225px** on a 200px canvas. The dino flies off-screen.
- **Fix:**
  - Set `jumpPower = -10`, `gravity = 0.8` → peak height = 10² / (2 × 0.8) = **62.5px**. ~22.5px clearance over the 40px cactus.
  - Replace the hardcoded ground check (`dino.y >= 150`) in the gravity block with `dino.y >= canvas.height - dino.height`. The existing `resetGame()` already uses this form correctly.

### Obstacle Spacing
- **Problem:** Obstacles spawn every `spawnInterval` frames regardless of where the previous cactus is, causing clusters at high speed.
- **Fix:**
  - Declare `let lastObstacleX = -300` at module scope (value ensures first spawn triggers immediately).
  - Remove the `spawnInterval`/`frameCount` timer entirely. Replace the spawn condition with: spawn when `lastObstacleX <= canvas.width - 300`.
  - In `updateObstacles`, after moving all obstacles, update: `lastObstacleX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -300`. (`obstacles` is a push-append array so index `length - 1` is always the most recently spawned.)
  - The 300px gap is **fixed in pixels** (not speed-scaled). At higher speed obstacles close faster, which naturally increases challenge.
  - Also reset `lastObstacleX = -300` in `resetGame()`.

### Difficulty Curve
- **Starting speed:** `currentSpeed = 2` (unchanged)
- **Cap:** `currentSpeed` capped at **5**
- **Ramp:** `+0.3` per 100pts (was `+0.5`)
- **Per-obstacle speed property:** Remove `speed` from each obstacle object. In `updateObstacles`, move every obstacle by `currentSpeed` (looked up each frame) rather than `obstacle.speed`. Remove the `obstacleSpeed` const.
- Result: all on-screen obstacles always move at the current global speed; no stale-speed inconsistency.
- Speed plateaus at score ~1000.

---

## 2. Visual Polish

### Clouds
- Declare `const clouds = []` and `initClouds()` function called once at game start and in `resetGame()`.
- 3 cloud objects: random `x` (spread 0–600), `y` (10–50px), `speed` (0.3–0.6 × `currentSpeed` at init time). Cloud speed is **static after init** — it does not re-scale as `currentSpeed` increases. This is intentional; clouds will feel progressively slower relative to obstacles as difficulty grows, reinforcing depth.
- Each cloud drawn as 3 overlapping `ctx.arc` circles (white/light gray `#e0e0e0`, no stroke).
- Each frame in `gameLoop`: `cloud.x -= cloud.speed`. When `cloud.x + 60 < 0` (approx cloud width), reset `cloud.x = canvas.width + 20`, new random `y`.
- No new image assets.

### Day/Night Cycle
| Score | Background | Text / score color |
|-------|-----------|------------|
| 0–299 | White `#ffffff` | Dark `#000000` |
| 300–399 | Interpolates white → `#1a1a2e` | White `#ffffff` (switches at score 300) |
| 400+ | `#1a1a2e` | White `#ffffff` |

- **Interpolation:** `t = Math.min((score - 300) / 100, 1)`. Interpolate each RGB channel: `r = Math.round(255 + (26 - 255) * t)` etc. Applied as `ctx.fillStyle` for the background `fillRect` each frame.
- **Stars:** Use `let starsInitialised = false` and `const stars = []`.
  - When `score >= 400 && !starsInitialised`: populate `stars` with 12 objects `{ x: random 0–600, y: random 0–100 }`, set `starsInitialised = true`.
  - Each frame at night: draw each star as a 2px white `fillRect`.
  - In `resetGame()`: `stars.length = 0; starsInitialised = false`.

### Game Over Overlay & High Score
- **Game loop:** on collision, existing `gameRunning = false` + `cancelAnimationFrame` preserved. Canvas freezes.
- **Overlay:** `rgba(0, 0, 0, 0.75)` fill (preserving existing alpha; the 0.75 from current code is kept).
- **High score:** `let highScore = parseInt(localStorage.getItem('dino-high-score') || '0')`. At game over: `if (score > highScore) { highScore = Math.floor(score); localStorage.setItem('dino-high-score', highScore); }`.
- **Overlay text (centred on canvas):**
  - "GAME OVER" — 40px
  - "Score: X" — 20px
  - "Best: Y" — 20px
  - "Tap / Press Space to Restart" — 16px
- **Text color:** white (always — readable over dark overlay).

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `script.js` | Jump/gravity constants, ground check fix, `lastObstacleX` gap spawning, `obstacleSpeed` removal, difficulty cap, cloud init + rendering, day/night interpolation, star init + flag, high score `localStorage` |
| `style.css` | No changes |
| `index.html` | No changes |

---

## 4. Out of Scope (Next Phase)

- Flying obstacles (pterodactyls)
- Duck mechanic
- Audio / sound effects
- Modular file split
