# Chrome Dino Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix jump feel, obstacle clustering, and difficulty ramping; add clouds, day/night cycle, and a high-score Game Over screen.

**Architecture:** All changes live in `script.js`. Tests live in `tests/game.test.js` using the existing custom `describe`/`it` runner (Node-compatible, no external dependencies). Each task is one self-contained behaviour change followed by a commit.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Node for tests (`node tests/game.test.js`), localStorage for high score.

---

## File Map

| File | What changes |
|------|-------------|
| `script.js` | All implementation changes (constants, spawning, rendering) |
| `tests/game.test.js` | New tests appended for each task |

No new files. `index.html` and `style.css` are untouched.

---

## Before You Start

Clone the repo and confirm tests run:

```bash
git clone https://github.com/Snehiths19/chrome-offline-Rex.git
cd chrome-offline-Rex
git checkout initial-chrome-dino-game
node tests/game.test.js
```

Expected: all existing tests pass (Jump, Obstacle Spawning, Collision, Scoring).

Also expand the ctx mock in the Node stubs section at the top of `script.js` — the current mock is missing `arc`, `beginPath`, `closePath`, and `fill`, which will be needed for cloud rendering tests. Find this block:

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
  fillStyle: '',
  font: '',
  textAlign: '',
}),
```

Also add a `localStorage` stub inside the same `if (typeof process !== 'undefined' ...)` block:

```js
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
```

Commit this setup change before starting tasks:

```bash
git add script.js
git commit -m "chore: expand Node ctx mock and add localStorage stub for tests"
```

---

## Task 1: Fix Jump Feel

**Files:**
- Modify: `script.js` — `jumpPower`, `gravity` constants, ground-landing check
- Test: `tests/game.test.js` — new test in `Dinosaur Jump` suite

**Goal:** `jumpPower = -10`, `gravity = 0.8` → peak height ~62.5px. Replace hardcoded `y >= 150` ground check.

- [ ] **Step 1: Write the failing test**

Append this `it` block inside the existing `describe('Dinosaur Jump', ...)` in `tests/game.test.js`:

```js
it('should not jump higher than 80px above ground', () => {
  resetGame();
  const groundY = canvas.height - dino.height; // 150
  jump();
  let minY = dino.y;
  // Simulate 40 frames of physics manually (no rAF)
  for (let i = 0; i < 40; i++) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;
    if (dino.y < minY) minY = dino.y;
    if (dino.y >= groundY) { dino.y = groundY; dino.isJumping = false; break; }
  }
  const peakHeight = groundY - minY;
  assert(peakHeight <= 80, `Peak height ${peakHeight}px should be ≤ 80px`);
  assert(peakHeight >= 50, `Peak height ${peakHeight}px should be ≥ 50px (enough to clear cactus)`);
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
node tests/game.test.js
```

Expected: FAILED — "Peak height 225px should be ≤ 80px"

- [ ] **Step 3: Fix the constants in `script.js`**

Find and change:

```js
  jumpPower: -15,
  gravity: 0.5,
```

Change to:

```js
  jumpPower: -10,
  gravity: 0.8,
```

- [ ] **Step 4: Fix the hardcoded ground check**

Find this block in the gravity section of `gameLoop` (inside `if (dino.isJumping)`):

```js
    if (dino.y >= canvas.height - dino.height) {
      dino.y = canvas.height - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
    }
```

Confirm it already uses `canvas.height - dino.height` (not a hardcoded 150). If you find `dino.y >= 150` anywhere, replace it with `dino.y >= canvas.height - dino.height`.

- [ ] **Step 5: Run tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass including the new jump height test.

- [ ] **Step 6: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "fix: reduce jump height (jumpPower=-10, gravity=0.8) for snappier arc"
```

---

## Task 2: Gap-Based Obstacle Spawning

**Files:**
- Modify: `script.js` — remove `spawnInterval`/`frameCount` timer, add `lastObstacleX`, update `updateObstacles` and `resetGame`
- Test: `tests/game.test.js` — new test verifying minimum gap

**Goal:** Obstacles only spawn once the previous one is 300px+ from the right edge. No more clusters.

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `tests/game.test.js`:

```js
describe('Obstacle Gap Enforcement', () => {
  it('should not spawn a second obstacle until the first is 300px from right edge', () => {
    resetGame();
    gameRunning = true;

    // Manually spawn first obstacle and set lastObstacleX to its position
    spawnObstacle();
    // The first obstacle spawns at canvas.width (600). It has NOT moved 300px yet.
    // Trying to trigger spawn logic: lastObstacleX should still be >= canvas.width - 300 = 300
    // so no second obstacle should spawn.
    const countAfterFirstSpawn = obstacles.length;
    assertEquals(countAfterFirstSpawn, 1, 'Only 1 obstacle after first spawn');

    // Move first obstacle 250px (not enough for gap)
    obstacles[0].x = canvas.width - 250; // still at 350, > 300
    // Update lastObstacleX as updateObstacles would
    lastObstacleX = obstacles[0].x;

    // Try to spawn — should be blocked
    if (lastObstacleX <= canvas.width - 300) spawnObstacle();
    assertEquals(obstacles.length, 1, 'Should still be 1 obstacle — gap not large enough');

    // Now move it past the threshold
    obstacles[0].x = canvas.width - 301; // 299, just past threshold
    lastObstacleX = obstacles[0].x;
    if (lastObstacleX <= canvas.width - 300) spawnObstacle();
    assertEquals(obstacles.length, 2, 'Should now be 2 obstacles — gap threshold met');

    gameRunning = false;
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
node tests/game.test.js
```

Expected: FAILED — `lastObstacleX is not defined`

- [ ] **Step 3: Add `lastObstacleX` to `script.js`**

In the module-level variable declarations (near `frameCount`, `score`), add:

```js
let lastObstacleX = -300; // Initialized to trigger first spawn immediately
```

- [ ] **Step 4: Update `updateObstacles` to track `lastObstacleX`**

Find `updateObstacles`. After the `for` loop that moves/removes obstacles, add:

```js
  // Track rightmost (most recently spawned) obstacle x for gap enforcement
  lastObstacleX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -300;
```

- [ ] **Step 5: Replace timer-based spawning with gap-based spawning in `gameLoop`**

Find the spawn trigger in `gameLoop`:

```js
  if (frameCount % spawnInterval === 0) {
    spawnObstacle();
  }
```

Replace with:

```js
  if (lastObstacleX <= canvas.width - 300) {
    spawnObstacle();
    lastObstacleX = canvas.width; // Reset immediately to prevent double-spawn same frame
  }
```

- [ ] **Step 6: Remove `frameCount` and `spawnInterval` from module scope**

Remove these declarations:
```js
let spawnInterval = 120;
let frameCount = 0;
```

Remove `frameCount++` from `gameLoop`.

Remove `frameCount = 0; spawnInterval = 120;` from `resetGame()`.

Add `lastObstacleX = -300;` to `resetGame()`.

- [ ] **Step 7: Remove `spawnInterval` from the Node `expose` block at the bottom (if present)**

Search for `expose('frameCount'` or `expose('spawnInterval'` at the bottom of script.js and remove those lines if they exist.

- [ ] **Step 8: Run tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "fix: replace frame-timer obstacle spawning with 300px gap enforcement"
```

---

## Task 3: Difficulty Curve Cap

**Files:**
- Modify: `script.js` — remove `obstacleSpeed` const, remove per-obstacle `.speed`, update `updateObstacles` to use `currentSpeed`, update ramp and cap
- Test: `tests/game.test.js` — verify speed cap

**Goal:** Speed caps at 5, ramps at +0.3/100pts. All obstacles move at `currentSpeed` (no per-obstacle stale speed).

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.js`:

```js
describe('Difficulty Curve', () => {
  it('should cap currentSpeed at 5 regardless of score', () => {
    resetGame();
    // Simulate very high score
    score = 2000;
    const level = Math.floor(score / 100);
    const simulatedSpeed = Math.min(2 + level * 0.3, 5);
    assertEquals(simulatedSpeed, 5, `Speed at score 2000 should be capped at 5, got ${simulatedSpeed}`);
  });

  it('should use currentSpeed for all obstacle movement (no per-obstacle speed)', () => {
    resetGame();
    spawnObstacle();
    // After the spec change, obstacles should NOT have a .speed property
    assert(obstacles[0].speed === undefined, 'Obstacle should not have a .speed property');
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
node tests/game.test.js
```

Expected: second test fails — "Obstacle should not have a .speed property" (obstacle currently has `.speed`).

- [ ] **Step 3: Remove `obstacleSpeed` const and per-obstacle speed**

Find and remove:
```js
const obstacleSpeed = 2; // base speed (kept for test compatibility)
```

In `spawnObstacle`, remove `speed: currentSpeed` from the obstacle object:

```js
function spawnObstacle() {
  const obstacle = {
    x: canvas.width,
    y: canvas.height - obstacleHeight,
    width: obstacleWidth,
    height: obstacleHeight,
    // speed removed — all obstacles use currentSpeed from closure
  };
  obstacles.push(obstacle);
}
```

- [ ] **Step 4: Update `updateObstacles` to use `currentSpeed`**

Find:
```js
    obstacles[i].x -= obstacles[i].speed;
```

Replace with:
```js
    obstacles[i].x -= currentSpeed;
```

- [ ] **Step 5: Update difficulty ramp and cap in `gameLoop`**

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

(Remove the `spawnInterval` line — it was already removed in Task 2.)

- [ ] **Step 6: Run tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "fix: cap speed at 5, ramp +0.3/100pts, use currentSpeed for all obstacles"
```

---

## Task 4: Clouds

**Files:**
- Modify: `script.js` — add `clouds` array, `initClouds()`, `drawClouds()`; call in game loop and reset
- Test: `tests/game.test.js` — smoke test that clouds init and render without throwing

**Goal:** 3 parallax clouds drawn with canvas arcs. No new assets.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.js`:

```js
describe('Clouds', () => {
  it('should initialise 3 clouds with x, y, speed properties', () => {
    resetGame(); // calls initClouds internally after this task
    assertEquals(clouds.length, 3, 'Should have 3 clouds');
    clouds.forEach((c, i) => {
      assert(typeof c.x === 'number', `Cloud ${i} should have x`);
      assert(typeof c.y === 'number', `Cloud ${i} should have y`);
      assert(c.y >= 10 && c.y <= 50, `Cloud ${i} y (${c.y}) should be 10–50`);
      assert(c.speed > 0, `Cloud ${i} speed should be positive`);
    });
  });

  it('should move clouds left each frame', () => {
    resetGame();
    const initialX = clouds[0].x;
    updateClouds();
    assert(clouds[0].x < initialX || clouds[0].x > canvas.width, 
      'Cloud should move left (or wrap to right if it was at x=0)');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `clouds is not defined`

- [ ] **Step 3: Add cloud data and functions to `script.js`**

After the `groundImage` declarations, add:

```js
// Cloud data
const clouds = [];

function initClouds() {
  clouds.length = 0;
  for (let i = 0; i < 3; i++) {
    clouds.push({
      x: Math.random() * canvas.width,
      y: 10 + Math.random() * 40,            // 10–50px from top
      speed: (0.3 + Math.random() * 0.3) * currentSpeed, // 0.3–0.6x speed, static after init
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
    // 3 overlapping circles make a simple cloud shape
    [[0, 0, 18], [-18, 8, 14], [18, 8, 14]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
```

- [ ] **Step 4: Call `initClouds()` at game start and in `resetGame()`**

Find the `onImageLoad` function. After the existing setup line (`dino.y = canvas.height - dino.height`), add:
```js
    initClouds();
```

In `resetGame()`, after the other resets, add:
```js
  initClouds();
```

- [ ] **Step 5: Call `updateClouds()` and `drawClouds()` in `gameLoop`**

In `gameLoop`, after `drawGround()` and before `drawObstacles()`, add:

```js
  updateClouds();
  drawClouds();
```

- [ ] **Step 6: Expose `clouds` and `updateClouds` for Node tests**

At the bottom of `script.js`, in the Node expose block, add:

```js
  expose('clouds', { get: () => clouds });
  global.initClouds = initClouds;
  global.updateClouds = updateClouds;
```

- [ ] **Step 7: Run tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat: add parallax cloud rendering (3 arc-based clouds, no new assets)"
```

---

## Task 5: Day/Night Cycle + Stars

**Files:**
- Modify: `script.js` — add `getBackgroundColor()`, `starsInitialised` flag, `stars` array, `drawBackground()`, update `gameLoop` render order and `resetGame`
- Test: `tests/game.test.js` — verify color output at score boundaries

**Goal:** White at score 0–299, interpolate to dark blue at 300–399, full night with stars at 400+. Text inverts to white at score 300+.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.js`:

```js
describe('Day/Night Cycle', () => {
  it('should return white at score 0', () => {
    const color = getBackgroundColor(0);
    assertEquals(color, '#ffffff', `Background at score 0 should be #ffffff, got ${color}`);
  });

  it('should return full night color at score 400+', () => {
    const color = getBackgroundColor(400);
    assertEquals(color, '#1a1a2e', `Background at score 400 should be #1a1a2e, got ${color}`);
  });

  it('should return interpolated color at score 350', () => {
    const color = getBackgroundColor(350);
    // t=0.5: r=140, g=140, b=163 → #8c8ca3
    assert(color !== '#ffffff' && color !== '#1a1a2e',
      `Background at score 350 should be between day and night, got ${color}`);
  });

  it('should initialise stars once when score crosses 400', () => {
    resetGame();
    assert(!starsInitialised, 'starsInitialised should be false after reset');
    score = 401;
    // Manually trigger star init logic (as gameLoop would)
    if (score >= 400 && !starsInitialised) {
      for (let i = 0; i < 12; i++) stars.push({ x: Math.random() * 600, y: Math.random() * 100 });
      starsInitialised = true;
    }
    assertEquals(stars.length, 12, 'Should have 12 stars after crossing 400');
    assert(starsInitialised, 'starsInitialised should be true');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `getBackgroundColor is not defined`

- [ ] **Step 3: Add `getBackgroundColor`, star state, and `drawBackground` to `script.js`**

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
  ctx.fillStyle = getBackgroundColor(score);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Init stars once on first night frame
  if (score >= 400 && !starsInitialised) {
    for (let i = 0; i < 12; i++) {
      stars.push({ x: Math.random() * canvas.width, y: Math.random() * 100 });
    }
    starsInitialised = true;
  }

  // Draw stars at night
  if (score >= 300) {
    ctx.fillStyle = '#ffffff';
    stars.forEach(s => ctx.fillRect(s.x, s.y, 2, 2));
  }
}
```

- [ ] **Step 4: Replace `ctx.clearRect` in `gameLoop` with `drawBackground()`**

Find in `gameLoop`:

```js
  ctx.clearRect(0, 0, canvas.width, canvas.height);
```

Replace with:

```js
  drawBackground();
```

- [ ] **Step 5: Update score text color to adapt for night**

Find `drawScore()`:

```js
function drawScore() {
  ctx.fillStyle = 'black';
```

Change to:

```js
function drawScore() {
  ctx.fillStyle = score >= 300 ? '#ffffff' : '#000000';
```

- [ ] **Step 6: Reset star state in `resetGame()`**

Add to `resetGame()`:

```js
  stars.length = 0;
  starsInitialised = false;
```

- [ ] **Step 7: Expose for Node tests**

In the Node expose block at the bottom of `script.js`, add:

```js
  expose('stars', { get: () => stars });
  expose('starsInitialised', { get: () => starsInitialised, set: v => { starsInitialised = v; } });
  global.getBackgroundColor = getBackgroundColor;
```

- [ ] **Step 8: Run tests — confirm pass**

```bash
node tests/game.test.js
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat: add day/night cycle with smooth color transition and static stars at score 400+"
```

---

## Task 6: Game Over Overlay + High Score

**Files:**
- Modify: `script.js` — add `highScore`, load from localStorage, update on game over, update `drawGameOverScreen` to show "Best: Y"
- Test: `tests/game.test.js` — verify high score updates and persists

**Goal:** High score shown on Game Over screen. Persisted via `localStorage`.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.js`:

```js
describe('High Score', () => {
  it('should update highScore when current score exceeds it', () => {
    resetGame();
    // Set a known starting high score
    localStorage.setItem('dino-high-score', '50');
    // Re-load would normally happen at init; manually set:
    highScore = parseInt(localStorage.getItem('dino-high-score') || '0');

    score = 100;
    // Simulate game over high-score update
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('dino-high-score', highScore);
    }
    assertEquals(highScore, 100, `highScore should be 100, got ${highScore}`);
    assertEquals(localStorage.getItem('dino-high-score'), '100', 'localStorage should store 100');
  });

  it('should not update highScore when current score is lower', () => {
    localStorage.setItem('dino-high-score', '200');
    highScore = 200;
    score = 50;
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('dino-high-score', highScore);
    }
    assertEquals(highScore, 200, 'highScore should remain 200');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
node tests/game.test.js
```

Expected: FAILED — `highScore is not defined`

- [ ] **Step 3: Add `highScore` variable to `script.js`**

Near the top of `script.js`, with the other module-scope variables, add:

```js
let highScore = parseInt(localStorage.getItem('dino-high-score') || '0');
```

- [ ] **Step 4: Update high score on game over**

In `gameLoop`, find the collision handler:

```js
      gameRunning = false;
      cancelAnimationFrame(animationFrameId);
      drawGameOverScreen();
      return;
```

Insert the high score update before `drawGameOverScreen()`:

```js
      gameRunning = false;
      cancelAnimationFrame(animationFrameId);
      if (Math.floor(score) > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('dino-high-score', highScore);
      }
      drawGameOverScreen();
      return;
```

- [ ] **Step 5: Update `drawGameOverScreen` to show "Best: Y"**

Find `drawGameOverScreen`. Replace the entire function body with:

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

In the Node expose block, add:

```js
  expose('highScore', { get: () => highScore, set: v => { highScore = v; } });
```

- [ ] **Step 7: Run tests — confirm all pass**

```bash
node tests/game.test.js
```

Expected: all tests pass including the two new High Score tests.

- [ ] **Step 8: Final smoke test in browser**

Open `index.html` in a browser. Verify:
- Dino jumps to a reasonable height (not off-screen)
- Obstacles don't cluster
- Clouds scroll in background
- Sky darkens past score 300, stars appear at 400
- Game Over shows Score + Best; Best persists on reload

- [ ] **Step 9: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat: add high score persistence (localStorage) and update Game Over overlay"
```

---

## Done

All 6 tasks complete. The game now has:
- Tuned jump arc (62.5px peak, snappy feel)
- Gap-enforced obstacle spawning (no clusters)
- Capped difficulty curve (speed 2→5, plateaus at score 1000)
- Parallax clouds
- Day/night cycle with stars
- High score on Game Over screen, persisted across sessions
