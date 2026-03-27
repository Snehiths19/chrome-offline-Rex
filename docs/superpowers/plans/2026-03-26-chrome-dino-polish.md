# Chrome Dino Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix jump feel, obstacle clustering, and difficulty ramping; add clouds, day/night cycle, and a high-score Game Over screen.

**Architecture:** All changes live in `script.js`. Tests live in `tests/game.test.js` using the existing custom `describe`/`it` runner. Each task is one self-contained behaviour change followed by a commit.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Node for tests, localStorage for high score persistence.

**Commit message format:** `feat(dino): Task N — <description>`

**TDD guard:** If a test passes BEFORE you write the implementation, the test is wrong — rewrite it so it fails first.

---

## Test Command

```bash
node tests/game.test.js
```

**Why this works in Node:** `script.js` has a Node guard at the top that stubs `document`, `requestAnimationFrame` (via `setImmediate`), `cancelAnimationFrame`, `Image`, and `window`. These stubs are already present. The `window.onload` summary block in the test file does NOT fire in Node (it just sets a property on the `{}` stub). To verify results, scan the output for `PASSED:` and `FAILED:` lines — if all lines say `PASSED:`, the suite is green.

---

## File Map

| File | What changes |
|------|-------------|
| `script.js` | All implementation changes (constants, spawning, rendering) |
| `tests/game.test.js` | New tests appended for each task |

No new files. `index.html` and `style.css` are untouched.

---

## Before You Start — Setup Step (do this first)

Clone the repo and confirm existing tests pass:

```bash
git clone https://github.com/Snehiths19/chrome-offline-Rex.git
cd chrome-offline-Rex
git checkout initial-chrome-dino-game
node tests/game.test.js
```

Expected output: four `PASSED:` lines (Jump, Obstacle Spawning, Collision Detection, Scoring). No `FAILED:` lines.

### Expand the Node ctx mock

The current mock in `script.js` is missing methods needed for cloud and star rendering (Tasks 4 and 5). Find this block inside the `if (typeof process !== 'undefined' && process.versions && process.versions.node)` guard at the top of `script.js`:

```js
getContext: () => ({
  drawImage: () => {},
  clearRect: () => {},
  fillRect: () => {},
  fillText: () => {},
}),
```

Replace it with:

```js
getContext: () => ({
  drawImage: () => {},
  clearRect: () => {},
  fillRect: () => {},
  fillText: () => {},
  arc: () => {},
  beginPath: () => {},
  closePath: () => {},
  fill: () => {},
  stroke: () => {},
  moveTo: () => {},
  lineTo: () => {},
  measureText: () => ({ width: 0 }),
  fillStyle: '',
  strokeStyle: '',
  font: '',
  textAlign: '',
}),
```

### Add localStorage stub

Inside the same `if (typeof process !== 'undefined' ...)` block, after `global.cancelAnimationFrame`, add:

```js
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
```

### Commit the setup

```bash
git add script.js
git commit -m "chore: expand Node ctx mock and add localStorage stub for tests"
node tests/game.test.js  # confirm still all PASSED
```

---

## Task 1: Fix Jump Feel

**What is currently broken:** `jumpPower = -15`, `gravity = 0.5` → peak height = 225px on a 200px canvas. The dino visually flies off the top of the screen.

**What the fix is:** `jumpPower = -10`, `gravity = 0.8` → peak height = 62.5px.

**Files:**
- Modify: `script.js` — `jumpPower`, `gravity` constants; confirm ground check uses `canvas.height - dino.height`
- Test: `tests/game.test.js`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('Dinosaur Jump', ...)` in `tests/game.test.js`:

```js
it('should have a peak jump height of ~62.5px', () => {
  resetGame();
  // Target: jumpPower=-10, gravity=0.8 → peak = 10^2 / (2*0.8) = 62.5px
  // This test is written against the TARGET values, so it fails until constants are updated.
  const expectedPeak = 62.5;
  jump();
  let minY = dino.y;
  const groundY = canvas.height - dino.height;
  for (let i = 0; i < 60; i++) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;
    if (dino.y < minY) minY = dino.y;
    if (dino.y >= groundY) { dino.y = groundY; dino.isJumping = false; break; }
  }
  const actualPeak = groundY - minY;
  assert(Math.abs(actualPeak - expectedPeak) <= 2,
    `Peak height ${actualPeak.toFixed(1)}px should be ~${expectedPeak}px. ` +
    `If this passes before changing constants, the test is wrong — rewrite it.`);
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
node tests/game.test.js
```

Expected: FAILED — actual peak ~225, expected ~62.5. If it passes, the test is wrong — see TDD guard above.

- [ ] **Step 3: Fix constants in `script.js`**

Find:
```js
  jumpPower: -15,
  gravity: 0.5,
```

Change to:
```js
  jumpPower: -10,
  gravity: 0.8,
```

- [ ] **Step 4: Confirm ground check is dynamic**

Search `script.js` for the jump landing block. It should read `dino.y >= canvas.height - dino.height`, not `dino.y >= 150`. If you find the hardcoded `150`, replace it with `canvas.height - dino.height`.

- [ ] **Step 5: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

- [ ] **Step 6: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 1 — fix jump height (jumpPower=-10, gravity=0.8)"
```

---

## Task 2: Gap-Based Obstacle Spawning

**Files:**
- Modify: `script.js` — add `lastObstacleX`, replace frame-timer spawn with gap check, update `updateObstacles` and `resetGame`
- Test: `tests/game.test.js`

**Goal:** Obstacles only spawn once the previous one is ≥300px from the right edge. This task does NOT remove the per-obstacle `.speed` property — that is handled in Task 3.

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `tests/game.test.js`:

```js
describe('Obstacle Gap Enforcement', () => {
  it('should not spawn a second obstacle until the first is 300px from right edge', () => {
    resetGame();

    spawnObstacle();
    assertEquals(obstacles.length, 1, 'Should have 1 obstacle after first spawn');

    // Obstacle spawns at canvas.width (600). Gap check: lastObstacleX <= canvas.width - 300 (300)
    // 600 <= 300 is false → should not spawn
    lastObstacleX = obstacles[0].x; // sync manually
    assert(!(lastObstacleX <= canvas.width - 300), 'Gap not met — should not spawn yet');

    // Move obstacle past threshold (301px inward from right edge)
    obstacles[0].x = canvas.width - 301; // x = 299
    lastObstacleX = obstacles[0].x;
    assert(lastObstacleX <= canvas.width - 300, 'Gap met — should spawn now');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `lastObstacleX is not defined`

- [ ] **Step 3: Add `lastObstacleX` to module scope**

With the other module-level variables, add:

```js
let lastObstacleX = -300; // Negative so first spawn triggers on frame 1
```

- [ ] **Step 4: Update `updateObstacles` to track `lastObstacleX`**

At the end of `updateObstacles`, after the existing `for` loop, add:

```js
  // Track rightmost (most recently spawned) obstacle for gap enforcement
  // obstacles is push-append: [oldest ... newest]; [length-1] is always newest
  lastObstacleX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -300;
```

- [ ] **Step 5: Replace frame-timer spawn in `gameLoop`**

Find:
```js
  if (frameCount % spawnInterval === 0) {
    spawnObstacle();
  }
```

Replace with:
```js
  if (lastObstacleX <= canvas.width - 300) {
    spawnObstacle();
    lastObstacleX = canvas.width; // Prevent double-spawn same frame
  }
```

- [ ] **Step 6: Remove `frameCount` and `spawnInterval` declarations**

Remove:
```js
let spawnInterval = 120;
let frameCount = 0;
```

Remove `frameCount++` from `gameLoop`.

Remove `frameCount = 0; spawnInterval = 120;` from `resetGame()`.

Add `lastObstacleX = -300;` to `resetGame()`.

- [ ] **Step 7: Clean up Node expose block**

At the bottom of `script.js`, remove any `expose('frameCount', ...)` or `expose('spawnInterval', ...)` if present.

Add:
```js
  expose('lastObstacleX', { get: () => lastObstacleX, set: v => { lastObstacleX = v; } });
```

- [ ] **Step 8: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 2 — replace frame-timer spawning with 300px gap enforcement"
```

---

## Task 3: Difficulty Curve Cap

**Files:**
- Modify: `script.js` — remove `obstacleSpeed` const, remove `.speed` from spawned obstacle objects, update `updateObstacles` to use `currentSpeed`, update ramp and cap
- Test: `tests/game.test.js`

**Goal:** Speed caps at 5, ramps +0.3/100pts. All obstacles share `currentSpeed` looked up each frame — no stale per-obstacle speed.

**Note on current state:** After Task 2, obstacles still have a `.speed` property set in `spawnObstacle`. This task removes it. The Task 3 test verifies the removal.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.js`:

```js
describe('Difficulty Curve', () => {
  it('should cap speed at 5 regardless of score', () => {
    resetGame();
    score = 2000;
    const level = Math.floor(score / 100);
    const simulatedSpeed = Math.min(2 + level * 0.3, 5);
    assertEquals(simulatedSpeed, 5, `Speed at score 2000 should be 5, got ${simulatedSpeed}`);
  });

  it('should not set a .speed property on spawned obstacles', () => {
    resetGame();
    spawnObstacle();
    assert(obstacles[0].speed === undefined,
      `Obstacle should not have .speed (got: ${obstacles[0].speed}). Remove 'speed' from spawnObstacle().`);
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
node tests/game.test.js
```

Expected: second test fails — obstacle has `.speed` set.

- [ ] **Step 3: Remove `obstacleSpeed` const**

Find and delete:
```js
const obstacleSpeed = 2;
```

- [ ] **Step 4: Remove `.speed` from `spawnObstacle`**

In `spawnObstacle`, the obstacle object should be:
```js
  const obstacle = {
    x: canvas.width,
    y: canvas.height - obstacleHeight,
    width: obstacleWidth,
    height: obstacleHeight,
  };
```

Remove the `speed: ...` line.

- [ ] **Step 5: Update `updateObstacles` to use `currentSpeed`**

Find:
```js
    obstacles[i].x -= obstacles[i].speed;
```

Replace with:
```js
    obstacles[i].x -= currentSpeed;
```

- [ ] **Step 6: Update difficulty ramp and cap in `gameLoop`**

Find:
```js
  const level = Math.floor(score / 100);
  currentSpeed = 2 + level * 0.5;
  spawnInterval = Math.max(60, 120 - level * 10);
```

Replace with:
```js
  const level = Math.floor(score / 100);
  currentSpeed = Math.min(2 + level * 0.3, 5);
```

(The `spawnInterval` line was already removed in Task 2.)

- [ ] **Step 7: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

- [ ] **Step 8: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 3 — cap speed at 5, ramp +0.3/100pts, remove per-obstacle speed"
```

---

## Task 4: Clouds

**Files:**
- Modify: `script.js` — add `clouds` array, `initClouds()`, `updateClouds()`, `drawClouds()`; call in game loop and reset; expose via existing patterns
- Test: `tests/game.test.js`

**Goal:** 3 parallax clouds, arc-drawn, scroll at 0.3–0.6× `currentSpeed` (speed is fixed at init — does not re-scale as difficulty increases). No new image assets.

**Export pattern:** `script.js` already has an `expose()` helper (defined inside the Node guard at the bottom) and uses `global.fnName = fnName` for functions. Use the same pattern for new additions.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.js`:

```js
describe('Clouds', () => {
  it('should initialise 3 clouds with x, y, speed', () => {
    resetGame(); // calls initClouds after this task
    assertEquals(clouds.length, 3, 'Should have 3 clouds after resetGame');
    clouds.forEach((c, i) => {
      assert(typeof c.x === 'number', `Cloud ${i} missing x`);
      assert(c.y >= 10 && c.y <= 50, `Cloud ${i} y=${c.y} should be 10–50`);
      assert(c.speed > 0, `Cloud ${i} speed should be positive`);
    });
  });

  it('should move clouds left each frame via updateClouds', () => {
    resetGame();
    clouds[0].x = 300; // Place well inside canvas to avoid wrap
    updateClouds();
    assert(clouds[0].x < 300, `Cloud x (${clouds[0].x}) should be < 300 after updateClouds`);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `clouds is not defined`

- [ ] **Step 3: Add cloud state and functions to `script.js`**

After the ground image declarations, add:

```js
// Clouds
const clouds = [];

function initClouds() {
  clouds.length = 0;
  for (let i = 0; i < 3; i++) {
    clouds.push({
      x: Math.random() * canvas.width,
      y: 10 + Math.random() * 40,
      speed: (0.3 + Math.random() * 0.3) * currentSpeed, // static after init
    });
  }
}

function updateClouds() {
  clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x + 60 < 0) {
      c.x = canvas.width + 20;
      c.y = 10 + Math.random() * 40;
    }
  });
}

function drawClouds() {
  ctx.fillStyle = '#e8e8e8';
  clouds.forEach(c => {
    [[0, 0, 18], [-18, 8, 14], [18, 8, 14]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
```

- [ ] **Step 4: Call `initClouds()` at game start and in `resetGame()`**

In `onImageLoad`, after `dino.y = canvas.height - dino.height`, add:
```js
    initClouds();
```

In `resetGame()`, add:
```js
  initClouds();
```

- [ ] **Step 5: Call `updateClouds()` and `drawClouds()` in `gameLoop`**

In `gameLoop`, after `drawGround()` and before `drawObstacles()`, add:
```js
  updateClouds();
  drawClouds();
```

- [ ] **Step 6: Expose for Node tests**

In the Node expose block at the bottom, add:
```js
  expose('clouds', { get: () => clouds });
  global.initClouds = initClouds;
  global.updateClouds = updateClouds;
  global.drawClouds = drawClouds;
```

- [ ] **Step 7: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

- [ ] **Step 8: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 4 — add parallax clouds (arc-drawn, no new assets)"
```

---

## Task 5: Day/Night Cycle + Stars

**Files:**
- Modify: `script.js` — add `getBackgroundColor()`, `stars` array, `starsInitialised` flag, `drawBackground()`; replace `ctx.clearRect` in `gameLoop`; update `drawScore` text color; reset stars in `resetGame`
- Test: `tests/game.test.js`

**Goal:** White at score 0–299, smooth interpolation to `#1a1a2e` at 300–399, full night with 12 static stars at 400+. Text switches to white at score 300. High score is shown **only on the Game Over screen** (Task 6) — NOT during active play.

**Star lifecycle:** Stars are initialised lazily once when `score >= 400` inside `drawBackground()`, stored in `stars[]`, rendered every frame (static — no flicker). On `resetGame()`, `stars.length = 0` and `starsInitialised = false` so the next game starts clean. `drawBackground()` is called as the very first draw call each frame (before clouds, obstacles, dino), so the sky fill clears the canvas.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.js`:

```js
describe('Day/Night Cycle', () => {
  it('should return #ffffff at score 0', () => {
    assertEquals(getBackgroundColor(0), '#ffffff',
      `Expected #ffffff at score 0, got ${getBackgroundColor(0)}`);
  });

  it('should return #1a1a2e at score 400', () => {
    assertEquals(getBackgroundColor(400), '#1a1a2e',
      `Expected #1a1a2e at score 400, got ${getBackgroundColor(400)}`);
  });

  it('should return an intermediate color at score 350', () => {
    const color = getBackgroundColor(350);
    assert(color !== '#ffffff' && color !== '#1a1a2e',
      `Score 350 should be intermediate, got ${color}`);
  });

  it('should initialise stars once at score 400 and not re-init on second call', () => {
    resetGame();
    assert(!starsInitialised, 'starsInitialised should be false after reset');
    assertEquals(stars.length, 0, 'stars should be empty after reset');

    // Simulate first init
    if (!starsInitialised) {
      for (let i = 0; i < 12; i++) stars.push({ x: Math.random() * 600, y: Math.random() * 100 });
      starsInitialised = true;
    }
    assertEquals(stars.length, 12, 'Should have 12 stars after init');

    // Second attempt — should be blocked
    const before = stars.length;
    if (!starsInitialised) {
      for (let i = 0; i < 12; i++) stars.push({ x: 0, y: 0 });
    }
    assertEquals(stars.length, before, 'Stars should not be re-initialised');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `getBackgroundColor is not defined`

- [ ] **Step 3: Add night state and functions**

After the cloud declarations, add:

```js
// Day/Night state
const stars = [];
let starsInitialised = false;

function getBackgroundColor(s) {
  if (s < 300) return '#ffffff';
  if (s >= 400) return '#1a1a2e';
  const t = (s - 300) / 100;
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawBackground() {
  // Fill sky — this clears the canvas each frame
  ctx.fillStyle = getBackgroundColor(score);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Lazy init stars once when score crosses 400
  if (score >= 400 && !starsInitialised) {
    for (let i = 0; i < 12; i++) {
      stars.push({ x: Math.random() * canvas.width, y: Math.random() * 100 });
    }
    starsInitialised = true;
  }

  // Draw static stars
  if (starsInitialised) {
    ctx.fillStyle = '#ffffff';
    stars.forEach(s => ctx.fillRect(s.x, s.y, 2, 2));
  }
}
```

- [ ] **Step 4: Replace `ctx.clearRect` in `gameLoop` with `drawBackground()`**

Find:
```js
  ctx.clearRect(0, 0, canvas.width, canvas.height);
```

Replace with:
```js
  drawBackground(); // sky fill + stars; must be first draw call each frame
```

- [ ] **Step 5: Update `drawScore` text color**

Find:
```js
  ctx.fillStyle = 'black';
```

Replace with:
```js
  ctx.fillStyle = score >= 300 ? '#ffffff' : '#000000';
```

- [ ] **Step 6: Reset star state in `resetGame()`**

Add:
```js
  stars.length = 0;
  starsInitialised = false;
```

- [ ] **Step 7: Expose for Node tests**

In the Node expose block, add:
```js
  expose('stars', { get: () => stars });
  expose('starsInitialised', { get: () => starsInitialised, set: v => { starsInitialised = v; } });
  global.getBackgroundColor = getBackgroundColor;
  global.drawBackground = drawBackground;
```

- [ ] **Step 8: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 5 — day/night cycle with smooth transition and static stars at score 400+"
```

---

## Task 6: Game Over Overlay + High Score

**Files:**
- Modify: `script.js` — add `highScore` loaded from localStorage, update on collision, rewrite `drawGameOverScreen`
- Test: `tests/game.test.js`

**Scope:** High score is displayed ONLY on the Game Over screen. It is NOT shown as a HUD element during active play.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.js`:

```js
describe('High Score', () => {
  it('should update highScore and localStorage when score exceeds best', () => {
    resetGame();
    localStorage.setItem('dino-high-score', '50');
    highScore = 50;
    score = 100;

    if (Math.floor(score) > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('dino-high-score', highScore);
    }

    assertEquals(highScore, 100, `highScore should be 100, got ${highScore}`);
    assertEquals(localStorage.getItem('dino-high-score'), '100',
      'localStorage should store updated value');
  });

  it('should NOT update highScore when score is lower', () => {
    highScore = 200;
    score = 50;

    if (Math.floor(score) > highScore) {
      highScore = Math.floor(score);
    }

    assertEquals(highScore, 200, 'highScore should stay at 200');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `highScore is not defined`

- [ ] **Step 3: Add `highScore` to module scope**

With the other module-level variables, add:

```js
let highScore = parseInt(localStorage.getItem('dino-high-score') || '0');
```

- [ ] **Step 4: Update high score on game over**

In the collision block in `gameLoop`, before `drawGameOverScreen()`:

```js
      if (Math.floor(score) > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('dino-high-score', highScore);
      }
```

- [ ] **Step 5: Rewrite `drawGameOverScreen`**

```js
function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';

  ctx.font = '40px Arial';
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

  ctx.font = '20px Arial';
  ctx.fillText('Score: ' + Math.floor(score), canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillText('Best: ' + highScore, canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = '16px Arial';
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 55);
}
```

- [ ] **Step 6: Expose `highScore` for Node tests**

```js
  expose('highScore', { get: () => highScore, set: v => { highScore = v; } });
```

- [ ] **Step 7: Run all tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass. Count `PASSED:` lines — should match total test count.

- [ ] **Step 8: Browser smoke test**

Open `index.html` in a browser. Verify:
- [ ] Dino jumps to a reasonable height (not off-screen)
- [ ] Obstacles do not cluster
- [ ] Clouds scroll in the background
- [ ] Sky darkens past score 300; stars appear at score 400
- [ ] Score text turns white at score 300
- [ ] Game Over shows "Score: X" and "Best: Y"
- [ ] Reload the page — "Best: Y" persists from previous session

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(dino): Task 6 — high score persistence and updated Game Over overlay"
```

---

## Done

All 6 tasks complete. The game now has:
- Tuned jump arc (~62.5px peak, snappy feel)
- Gap-enforced obstacle spawning (300px minimum, no clusters)
- Capped difficulty curve (speed 2→5, plateaus at score ~1000)
- Parallax clouds (3 arc-drawn, no new assets)
- Day/night cycle with smooth transition and static stars at score 400+
- High score on Game Over screen, persisted across sessions via localStorage
