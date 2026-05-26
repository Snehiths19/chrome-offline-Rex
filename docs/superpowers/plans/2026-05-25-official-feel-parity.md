# Official Chrome Dino Feel-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing dino game *move* like the official `chrome://dino` — framerate-independent timing plus official tuning (gravity, jump, speed, gap, scoring). Feel parity only; no duck/birds/sprite work.

**Architecture:** A fixed-timestep accumulator drives the existing `STATE_HANDLERS` once per 1/60 s step (fixing the 144 Hz → 2.4× speed bug) while a no-arg single-step path keeps the current test suite driving frames unchanged. Tuning, gap, and scoring then move to the official model. Daily-challenge determinism is preserved because the seeded RNG call order is unchanged and a run executes the same number of fixed steps at any refresh rate.

**Tech Stack:** Vanilla JS, single `script.js`, custom Node test harness (`tests/game.test.js`), no bundler. Spec: `docs/superpowers/specs/2026-05-25-official-feel-parity-design.md`.

**Verification gates (run after every task):**
- `npm test` — full suite under Node, must be green.
- `npm run lint` — ESLint, must be clean.

**Determinism rules (do not violate):** physics/spawning/scoring read `GAME_CONFIG.X` directly (never `cfg()`). `game.rng()` is the only gameplay randomness; preserve the call order **type-pick first, gap-roll second** inside `nextObstacle`.

---

## Task 1: Framerate-independent fixed-timestep loop

Replaces the per-rAF stepping with a time accumulator. After this task the game runs at a true 60 Hz on any monitor; tuning is still the old values.

**Files:**
- Modify: `script.js` — `gameLoop()` (≈ line 1515), `resetGame()` (≈ line 1309), add module vars just above `gameLoop`.
- Test: `tests/game.test.js` — append a new `describe('Fixed-timestep loop', …)` block at end of file (before the final EOF).

- [ ] **Step 1: Write the failing determinism test**

Append to `tests/game.test.js`:

```js
describe('Fixed-timestep loop', () => {
  const MS = 1000 / 60;

  // Drive the loop with explicit timestamps and report how many physics
  // steps (game.animFrame ticks) ran over the timeline.
  function runTimeline(frameCount, deltaPerFrame) {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    game.rng = mulberry32(2024);      // pin RNG so both timelines spawn identically
    const startAnim = game.animFrame;
    let t = 1000;
    gameLoop(t);                       // baseline frame — establishes lastTime, runs 0 steps
    cancelAnimationFrame(game.animationFrameId);
    for (let i = 0; i < frameCount; i++) {
      t += deltaPerFrame;
      gameLoop(t);
      cancelAnimationFrame(game.animationFrameId);
    }
    return game.animFrame - startAnim;
  }

  it('runs the same number of physics steps per wall-clock second regardless of refresh rate', () => {
    const steps60  = runTimeline(60,  MS);        // 60 frames * 16.67ms ≈ 1000ms
    const steps144 = runTimeline(144, MS / 2.4);  // 144 frames * 6.94ms ≈ 1000ms
    assert(steps60 >= 58 && steps60 <= 62,   `60Hz: expected ~60 steps, got ${steps60}`);
    assert(steps144 >= 58 && steps144 <= 62, `144Hz: expected ~60 steps (not ~144), got ${steps144}`);
    assert(Math.abs(steps60 - steps144) <= 2, `step counts must match across refresh rates: 60Hz=${steps60}, 144Hz=${steps144}`);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npm test`
Expected: FAIL — current `gameLoop` ignores its argument and runs one handler per call, so the 144-call timeline produces ~144 steps, tripping `steps144 <= 62` and the `<= 2` difference assertion.

- [ ] **Step 3: Implement the accumulator loop**

In `script.js`, just above `function gameLoop()` (≈ line 1515), add module state:

```js
// Fixed-timestep clock. Physics advances in MS_PER_STEP chunks so the game runs
// at a true 60 Hz on any refresh rate. lastTime/accumulator reset in resetGame().
const MS_PER_STEP = 1000 / 60;
const MAX_CATCHUP_STEPS = 5;
let loopLastTime;            // undefined until the first timestamped frame
let loopAccumulator = 0;
```

Replace the whole `gameLoop` function:

```js
function gameLoop(now) {
  game.animationFrameId = requestAnimationFrame(gameLoop);

  // No-arg call = advance exactly one fixed step. Used by tests and by the
  // kickoff/restart sites before the browser starts supplying timestamps.
  if (now === undefined) {
    STATE_HANDLERS[game.state]();
    return;
  }

  if (loopLastTime === undefined) loopLastTime = now;   // first timestamped frame: 0 delta
  let frame = now - loopLastTime;
  loopLastTime = now;
  if (frame > 250) frame = MS_PER_STEP;                 // backgrounded tab — don't fast-forward
  loopAccumulator += frame;

  let steps = 0;
  while (loopAccumulator >= MS_PER_STEP && steps < MAX_CATCHUP_STEPS) {
    STATE_HANDLERS[game.state]();
    loopAccumulator -= MS_PER_STEP;
    steps++;
  }
  if (steps === MAX_CATCHUP_STEPS) loopAccumulator = 0; // sustained-slowness clamp
}
```

In `resetGame()`, add the clock reset right after `dino.isJumping = false;` (≈ line 1312):

```js
  loopAccumulator = 0;
  loopLastTime = undefined;
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `npm test`
Expected: the new determinism test PASSES, and **all existing tests still pass** (they call `gameLoop()` with no argument → single-step path → identical behaviour to before).

- [ ] **Step 5: Add clamp guard tests, verify PASS**

Append inside the same `describe('Fixed-timestep loop', …)` block:

```js
  it('clamps catch-up to MAX_CATCHUP_STEPS on sustained slow frames', () => {
    resetGame(); game.graceFrames = 0; game.state = STATE.RUNNING; game.rng = mulberry32(1);
    const start = game.animFrame;
    let t = 1000; gameLoop(t); cancelAnimationFrame(game.animationFrameId);   // baseline
    t += 100;     gameLoop(t); cancelAnimationFrame(game.animationFrameId);   // 100ms → 6 wanted, clamp 5
    assert(game.animFrame - start <= 5, `catch-up must clamp to 5 steps, got ${game.animFrame - start}`);
  });

  it('treats a backgrounded-tab gap as a single step', () => {
    resetGame(); game.graceFrames = 0; game.state = STATE.RUNNING; game.rng = mulberry32(1);
    const start = game.animFrame;
    let t = 1000; gameLoop(t);  cancelAnimationFrame(game.animationFrameId);  // baseline
    t += 5000;    gameLoop(t);  cancelAnimationFrame(game.animationFrameId);  // 5s gap → frame>250 → 1 step
    assertEquals(game.animFrame - start, 1, 'a >250ms frame should advance exactly one step');
  });
```

Run: `npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat: framerate-independent fixed-timestep game loop"
```

---

## Task 2: Jump & gravity tuning (kill the float)

**Files:**
- Modify: `script.js` — `GAME_CONFIG.GRAVITY`, `GAME_CONFIG.JUMP_POWER` (≈ lines 78-79).
- Test: `tests/game.test.js` — `describe('Dinosaur Jump')` peak-height test (≈ lines 116-134).

- [ ] **Step 1: Update the peak-height test to the new expected value**

The new arc (v₀ = −10, g = 0.6) peaks at ≈ 78px (discrete integration), versus ≈ 144px today. Replace lines 116-134:

```js
  it('should have a peak jump height of ~78px', () => {
    // jumpPower=-10, gravity=0.6 → discrete peak ≈ 78px (official-feel snappy arc)
    resetGame();
    game.state = STATE.RUNNING;
    const expectedPeak = 78;
    jump();
    let minY = dino.y;
    const groundY = GAME_CONFIG.CANVAS_H - dino.height;
    for (let i = 0; i < 60; i++) {
      dino.velocityY += dino.gravity;
      dino.y += dino.velocityY;
      if (dino.y < minY) minY = dino.y;
      if (dino.y >= groundY) { dino.y = groundY; dino.isJumping = false; break; }
    }
    const actualPeak = groundY - minY;
    assert(Math.abs(actualPeak - expectedPeak) <= 5,
      `Peak height ${actualPeak.toFixed(1)}px should be ~${expectedPeak}px. ` +
      `If this passes before changing constants, the test is wrong — rewrite it.`);
  });
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npm test`
Expected: FAIL — with the current gravity 0.48 / jumpPower −12 the peak is ≈ 144px, far outside `78 ± 5`.

- [ ] **Step 3: Apply the official tuning**

In `script.js` `GAME_CONFIG`, change two lines:

```js
  JUMP_POWER:              -10,   // negative = upward impulse applied on jump (official)
  GRAVITY:                  0.6,  // added to velocityY each frame while airborne (official)
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `npm test`
Expected: the peak-height test PASSES (≈ 78px); the other Dinosaur Jump tests (jump up/down, ignore-when-not-running) still pass — they don't assert exact heights.

- [ ] **Step 5: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat: official jump tuning (gravity 0.6, jump velocity -10)"
```

---

## Task 3: Official obstacle-gap model

Replaces the shrink-with-speed fixed-pixel gap with the official `width × speed + minGap × 0.6`, randomized up to ×1.5. Gap now depends on the chosen obstacle's width/minGap, so `nextObstacle` computes type first, then gap.

**Files:**
- Modify: `script.js` — `GAME_CONFIG` (add `GAP_COEFFICIENT`, `MAX_GAP_COEFFICIENT`, per-type `minGap`; remove `MAX_SPAWN_GAP`, `MIN_SPAWN_GAP`, `SPAWN_GAP_SPEED_FACTOR`, `SPAWN_GAP_JITTER`), `game.nextSpawnGap` default (≈ line 521), `computeNextSpawnGap` (≈ line 444), `DifficultyProfile.nextObstacle` (≈ line 477), its call site in `handleRunning` (≈ line 1442), and `resetGame` gap init (≈ line 1334).
- Test: `tests/game.test.js` — `describe('Obstacle Gap Enforcement')` (225-260), `describe('Spawn Gap Jitter')` (262-303), and the gap-related `it`s inside `describe('DifficultyProfile')` (1587-1625).

- [ ] **Step 1: Rewrite the gap tests to the official formula**

Replace `describe('Obstacle Gap Enforcement', …)` (lines 225-260) with:

```js
describe('Obstacle Gap Enforcement', () => {
  it('does not spawn a second obstacle until the official gap threshold is met', () => {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    game.rng = () => 0.5;                 // mid-range gap roll, deterministic
    game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
    game.nextSpawnGap = 100;             // small threshold so frame 1 spawns

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'first obstacle spawns on frame 1');

    // Recomputed gap must sit within the official band for the spawned type at this speed.
    const type   = game.obstacles[0].type ? GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === game.obstacles[0].type) : GAME_CONFIG.OBSTACLE_TYPES[0];
    const minGap = Math.round(type.width * game.currentSpeed + type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);
    assert(game.nextSpawnGap >= minGap && game.nextSpawnGap <= maxGap,
      `recomputed gap ${game.nextSpawnGap} must be in [${minGap}, ${maxGap}]`);

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'no new obstacle until gap distance elapses');

    game.obstacles[0].x = GAME_CONFIG.CANVAS_W - (game.nextSpawnGap + 1);
    game.lastObstacleX  = game.obstacles[0].x;
    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 2, 'second obstacle spawns once gap threshold met');
  });
});
```

> Note: if `spawnObstacle` does not record the type id on the obstacle, the `find(...)` falls back to the small cactus — the band still bounds the value. Do not add a `.type` field to obstacles just for this test (the Difficulty Curve test asserts obstacles carry no extra props).

Replace `describe('Spawn Gap Jitter', …)` (lines 262-303) with:

```js
describe('Spawn Gap (official model)', () => {
  function band(type, speed) {
    const minGap = Math.round(type.width * speed + type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    return { minGap, maxGap: Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT) };
  }

  it('gap stays within [minGap, minGap*MAX_GAP_COEFFICIENT] for the chosen type', () => {
    const speed = 8;
    const rng = mulberry32(12345);
    for (let i = 0; i < 500; i++) {
      const { type, gap } = DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng, speed);
      const { minGap, maxGap } = band(type, speed);
      assert(gap >= minGap && gap <= maxGap,
        `gap ${gap} for type ${type.id} at speed ${speed} must be in [${minGap}, ${maxGap}]`);
    }
  });

  it('gap grows with speed (official: width*speed dominates)', () => {
    const rng = () => 0.5;  // fixed mid roll isolates the speed term
    const slow = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    const fast = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 13);
    assert(fast.gap > slow.gap,
      `gap at speed 13 (${fast.gap}) should exceed gap at speed 6 (${slow.gap})`);
  });

  it('produces gap variety across spawns (breaks the metronome)', () => {
    const rng = mulberry32(7);
    const gaps = new Set();
    for (let i = 0; i < 50; i++) gaps.add(DifficultyProfile.nextObstacle(100, MODES.UPDATED, rng, 8).gap);
    assert(gaps.size >= 5, `expected gap variety; got ${gaps.size} distinct values`);
  });

  it('mulberry32 is deterministic given same seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 10; i++) assertEquals(a(), b(), 'same seed → same sequence');
  });
});
```

Inside `describe('DifficultyProfile', …)`, replace the gap-related `it`s (lines 1587-1625) with:

```js
  it('nextObstacle returns a numeric gap and a typed obstacle', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    assert(typeof params.gap === 'number', 'gap must be a number');
    assert(params.type && typeof params.type.id === 'string', 'type must have an id string');
  });

  it('nextObstacle classic mode: gap grows as speed rises', () => {
    const rng = () => 0.5;
    const low  = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    const high = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 13);
    assert(high.gap > low.gap, `gap at speed 13 (${high.gap}) should exceed speed 6 (${low.gap})`);
  });

  it('nextObstacle classic mode: type is always small cactus', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng, 10);
    assertEquals(params.type.id, 'small', 'classic mode always returns the small cactus');
  });

  it('nextObstacle updated mode: gap within official band at low speed', () => {
    const rng = mulberry32(42);
    const speed = 6;
    const params = DifficultyProfile.nextObstacle(0, MODES.UPDATED, rng, speed);
    const minGap = Math.round(params.type.width * speed + params.type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);
    assert(params.gap >= minGap && params.gap <= maxGap,
      `gap ${params.gap} must be in [${minGap}, ${maxGap}]`);
  });

  it('nextObstacle updated mode: cluster cactus returned at score 250 with max roll', () => {
    const rng = () => 0.99;  // type pick (call 1) → last eligible; gap roll (call 2) → top of band
    const params = DifficultyProfile.nextObstacle(250, MODES.UPDATED, rng, 8);
    assertEquals(params.type.id, 'cluster', 'at score 250 with max roll, cluster wins the weighted draw');
  });
```

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `npm test`
Expected: FAIL — `GAP_COEFFICIENT` / `MAX_GAP_COEFFICIENT` / per-type `minGap` are undefined and `nextObstacle` ignores the new `speed` argument, so the band math is `NaN`/wrong.

- [ ] **Step 3: Add the new config, remove the old gap config**

In `GAME_CONFIG`, replace the `--- Spawning ---` block (lines 95-100) with:

```js
  // --- Spawning (official gap model) ---
  GRACE_FRAMES:           240,    // ~4 s at 60 fps before first obstacle appears
  GAP_COEFFICIENT:          0.6,  // official: minGap = width*speed + typeMinGap*GAP_COEFFICIENT
  MAX_GAP_COEFFICIENT:      1.5,  // official: gap randomized up to minGap * this
```

Add a `minGap` to each entry in `OBSTACLE_TYPES` (lines 110-114):

```js
  OBSTACLE_TYPES: Object.freeze([
    Object.freeze({ id: 'small',   width: 20, height: 40, unlockScore:   0, weight: 50, render: 'single', minGap: 120 }),
    Object.freeze({ id: 'big',     width: 30, height: 55, unlockScore: 100, weight: 30, render: 'single', minGap: 120 }),
    Object.freeze({ id: 'cluster', width: 50, height: 40, unlockScore: 250, weight: 20, render: 'double', minGap: 150 }),
  ]),
```

Change the `game.nextSpawnGap` default (line 521) — `MAX_SPAWN_GAP` is gone:

```js
  nextSpawnGap:     0,            // set by resetGame() via computeNextSpawnGap
```

- [ ] **Step 4: Rewrite `computeNextSpawnGap` and `nextObstacle`**

Replace `computeNextSpawnGap` (lines 444-453) with:

```js
// Official gap model: gap scales with the chosen obstacle's width and the current
// speed, randomized within [minGap, minGap*MAX_GAP_COEFFICIENT]. The rng() draw is
// the second seeded call per spawn (type pick is first) — order is load-bearing
// for the daily-challenge determinism contract.
function computeNextSpawnGap(rng, speed, type) {
  const minGap = Math.round(type.width * speed + type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
  const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);
  return minGap + Math.floor(rng() * (maxGap - minGap + 1));
}
```

Replace `DifficultyProfile.nextObstacle` (lines 477-486) with a version that takes the current speed and passes the chosen type into the gap calc:

```js
  nextObstacle(score, mode, rng, speed) {
    // RNG call order is load-bearing: type roll first, gap roll second.
    const type = pickObstacleType(rng, score, mode);
    return {
      type,
      gap: computeNextSpawnGap(rng, speed, type),
    };
  },
```

> `DifficultyProfile.speedAtScore` is still present and untouched here — Task 4 removes it.

- [ ] **Step 5: Update the two call sites**

In `handleRunning` (line 1442), pass the current speed:

```js
    const params = DifficultyProfile.nextObstacle(game.score, game.mode, game.rng, game.currentSpeed);
```

In `resetGame` (line 1334), compute the initial gap from the small cactus at the starting speed (no longer via `speedAtScore`):

```js
  game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed, GAME_CONFIG.OBSTACLE_TYPES[0]);
```

- [ ] **Step 6: Run the tests, verify they PASS**

Run: `npm test`
Expected: all gap tests PASS. If any other test references a removed key (`MAX_SPAWN_GAP`, `MIN_SPAWN_GAP`, `SPAWN_GAP_SPEED_FACTOR`, `SPAWN_GAP_JITTER`), grep and fix it — only the blocks rewritten above should reference them.

- [ ] **Step 7: Lint + commit**

```bash
npm run lint
git add script.js tests/game.test.js
git commit -m "feat: official obstacle-gap model (width*speed + minGap*0.6)"
```

---

## Task 4: Linear speed model

Replaces the sigmoid `speedAtScore` with the official linear acceleration: start at 6, add 0.001 per step, cap at `SPEED_CAP` (13).

**Files:**
- Modify: `script.js` — `GAME_CONFIG` (`INITIAL_SPEED` → 6, add `ACCELERATION`, remove `PLATEAU_SPEED`/`RAMP_MIDPOINT`/`RAMP_STEEPNESS`), remove `DifficultyProfile.speedAtScore` (≈ 472-476), the speed assignment in `handleRunning` (≈ 1404), and the speed-trail gate that referenced `PLATEAU_SPEED` (≈ 1434).
- Test: `tests/game.test.js` — `describe('Difficulty Curve')` (751-773) and the `speedAtScore` `it`s in `describe('DifficultyProfile')` (1553-1585).

- [ ] **Step 1: Rewrite the speed tests**

Replace the first `it` in `describe('Difficulty Curve', …)` (lines 752-765) with:

```js
  it('currentSpeed accelerates by ACCELERATION each step and caps at SPEED_CAP', () => {
    resetGame(); game.state = STATE.RUNNING; game.graceFrames = 0;
    const s0 = game.currentSpeed;
    assertEquals(s0, GAME_CONFIG.INITIAL_SPEED, 'run starts at INITIAL_SPEED');

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    game.obstacles.length = 0;   // keep the dino alive for the rest of the checks
    assert(Math.abs(game.currentSpeed - (s0 + GAME_CONFIG.ACCELERATION)) < 1e-9,
      `one step should add ACCELERATION; got ${game.currentSpeed} from ${s0}`);

    game.currentSpeed = GAME_CONFIG.SPEED_CAP - GAME_CONFIG.ACCELERATION / 2;
    game.obstacles.length = 0;
    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.currentSpeed, GAME_CONFIG.SPEED_CAP, 'speed clamps at SPEED_CAP');
  });
```

Delete the four `speedAtScore` `it`s in `describe('DifficultyProfile', …)` (lines 1553-1585: "midpoint speed", "slightly above INITIAL_SPEED", "never exceeds PLATEAU_SPEED", "monotonically increasing"). They test a function that no longer exists.

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `npm test`
Expected: FAIL — `ACCELERATION` is undefined (`NaN` comparison) and the old midpoint test still expects sigmoid behaviour.

- [ ] **Step 3: Update config — linear speed, remove sigmoid keys**

In `GAME_CONFIG` replace the physics speed lines (80-84) with:

```js
  INITIAL_SPEED:            6.0,  // obstacle scroll speed at run start (official)
  SPEED_CAP:               13.0,  // max scroll speed (official MAX_SPEED)
  ACCELERATION:             0.001, // linear speed gain per fixed step (official)
```

(Delete `PLATEAU_SPEED`, `RAMP_MIDPOINT`, `RAMP_STEEPNESS`.)

- [ ] **Step 4: Replace the speed function with accumulation**

Delete `DifficultyProfile.speedAtScore` (lines 472-476). The object becomes just `nextObstacle`:

```js
const DifficultyProfile = {
  nextObstacle(score, mode, rng, speed) {
    const type = pickObstacleType(rng, score, mode);
    return { type, gap: computeNextSpawnGap(rng, speed, type) };
  },
};
```

In `handleRunning`, replace the speed assignment (line 1404):

```js
  game.currentSpeed = Math.min(game.currentSpeed + GAME_CONFIG.ACCELERATION, GAME_CONFIG.SPEED_CAP);
```

Replace the speed-trail gate that referenced `PLATEAU_SPEED` (line 1434) with a fraction of the cap:

```js
  if (isUpdatedMode() && game.currentSpeed >= GAME_CONFIG.SPEED_CAP * 0.85) {
```

`resetGame` already sets `game.currentSpeed = GAME_CONFIG.INITIAL_SPEED` (line 1321) — no change needed; it now starts at 6.

- [ ] **Step 5: Run the tests, verify they PASS**

Run: `npm test`
Expected: PASS. Grep for any remaining `speedAtScore` / `PLATEAU_SPEED` / `RAMP_` references and remove them — there should be none outside what this task changed.

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add script.js tests/game.test.js
git commit -m "feat: official linear speed ramp (start 6, +0.001/step, cap 13)"
```

---

## Task 5: Distance-based scoring + high-score migration

Switches scoring from `+0.1/frame` to the official distance × 0.025 (accelerating climb), and clears the now-incompatible stored high score exactly once.

**Files:**
- Modify: `script.js` — `GAME_CONFIG` (add `DISTANCE_COEFFICIENT`, remove `SCORE_INCREMENT`), add `game.distance` field (≈ line 524) and reset it (≈ resetGame line 1318), the scoring line in `handleRunning` (≈ line 1400), add `migrateScoreScale()` near `ScoreStore` (≈ line 231), and expose it (Section 10).
- Test: `tests/game.test.js` — extend `describe('Scoring')` (207-223).

- [ ] **Step 1: Write the failing scoring + migration tests**

Add two `it`s inside `describe('Scoring', …)` (after line 222, before the closing `});`):

```js
  it('score equals accumulated distance times DISTANCE_COEFFICIENT', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    for (let i = 0; i < 10; i++) { gameLoop(); cancelAnimationFrame(game.animationFrameId); }
    assert(Math.abs(game.score - game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT) < 1e-9,
      `score ${game.score} must equal distance ${game.distance} * ${GAME_CONFIG.DISTANCE_COEFFICIENT}`);
    assert(game.score > 0, 'score should have advanced over 10 steps');
  });

  it('migrateScoreScale clears pre-v2 scores exactly once', () => {
    localStorage.setItem('dino-high-score', '9999');
    localStorage.setItem('dino-daily-best', '4242');
    localStorage.removeItem('dino-score-scale');
    migrateScoreScale();
    assertEquals(localStorage.getItem('dino-high-score'), null, 'pre-v2 high score cleared');
    assertEquals(localStorage.getItem('dino-daily-best'), null, 'pre-v2 daily best cleared');
    assertEquals(localStorage.getItem('dino-score-scale'), 'v2', 'scale marked v2');
    // second run is a no-op
    localStorage.setItem('dino-high-score', '50');
    migrateScoreScale();
    assertEquals(localStorage.getItem('dino-high-score'), '50', 'already-migrated: no further clearing');
  });
```

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `npm test`
Expected: FAIL — `DISTANCE_COEFFICIENT` undefined (so `game.score` uses old `SCORE_INCREMENT` and the equality is false) and `migrateScoreScale` is not defined.

- [ ] **Step 3: Add config, distance state, and the migration function**

In `GAME_CONFIG`, replace the `SCORE_INCREMENT` line (86):

```js
  DISTANCE_COEFFICIENT:     0.025, // official: score = distance * this (accelerating climb)
```

Add a `distance` field to the `game` object, right after `score: 0,` (line 524):

```js
  distance:         0,
```

Add the migration function immediately after the `ScoreStore` object (after line 231):

```js
// One-time score-scale migration. v2 switched to distance-based scoring, so
// pre-v2 high scores live on an incompatible scale — clear them once, guarded by
// a version key so it never repeats.
function migrateScoreScale() {
  if (localStorage.getItem('dino-score-scale') === 'v2') return;
  localStorage.removeItem('dino-high-score');
  localStorage.removeItem('dino-daily-best');
  localStorage.removeItem('dino-daily-date');
  localStorage.setItem('dino-score-scale', 'v2');
}
migrateScoreScale();
```

> Placement matters: this must run **before** `game.highScore = ScoreStore.loadHighScore()` (line 525) so the boot read sees the cleared value.

- [ ] **Step 4: Switch `handleRunning` to distance-based scoring**

Replace the score line (1400) — accumulate distance using the current speed, then derive score (keep `game.animFrame++` on the next line):

```js
  game.distance += game.currentSpeed;
  game.score = game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT;
```

In `resetGame`, reset distance next to `game.score = 0;` (line 1318):

```js
  game.distance = 0;
```

- [ ] **Step 5: Expose `migrateScoreScale` to tests**

In Section 10 (the `if (typeof process …)` block, ≈ line 1581 near `global.ScoreStore`), add:

```js
  global.migrateScoreScale = migrateScoreScale;
```

- [ ] **Step 6: Run the tests, verify they PASS**

Run: `npm test`
Expected: PASS — including the pre-existing `describe('Scoring')` "increment" test (distance still grows the score) and the `describe('High Score')` block (saves/loads still work on the new scale).

- [ ] **Step 7: Lint + commit**

```bash
npm run lint
git add script.js tests/game.test.js
git commit -m "feat: distance-based scoring + one-time high-score scale migration"
```

---

## Task 6: Full verification, docs, and manual feel check

**Files:**
- Modify: `script.js` Section 2 comment header if it still lists removed keys; `CONTEXT.md` and `CLAUDE.md` (record the new invariants).
- No test file changes expected unless the full run surfaces a straggler.

- [ ] **Step 1: Full green gate**

Run: `npm test`
Expected: entire suite PASS.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Grep for orphaned references to removed keys**

Run: `git grep -nE "SCORE_INCREMENT|MAX_SPAWN_GAP|MIN_SPAWN_GAP|SPAWN_GAP_SPEED_FACTOR|SPAWN_GAP_JITTER|PLATEAU_SPEED|RAMP_MIDPOINT|RAMP_STEEPNESS|speedAtScore" -- script.js tests/`
Expected: no output. If anything remains, fix it (likely a comment) and re-run the green gate.

- [ ] **Step 3: Record the new invariants in CONTEXT.md / CLAUDE.md**

Add to the "Known invariants" section of `CLAUDE.md`:
- **Fixed-timestep loop.** `gameLoop(now)` accumulates real time and steps `STATE_HANDLERS` in fixed `MS_PER_STEP` (1/60 s) chunks. A **no-arg `gameLoop()` call advances exactly one step** — tests and the kickoff/restart sites rely on this. `loopAccumulator`/`loopLastTime` reset in `resetGame()`.
- **Score scale is v2 (distance-based).** `score = distance × DISTANCE_COEFFICIENT`. `migrateScoreScale()` clears pre-v2 stored scores once, guarded by the `dino-score-scale` key.

Update the `localStorage` keys table in `CLAUDE.md` to add `dino-score-scale` (`'v2'`, written by `migrateScoreScale()`).

- [ ] **Step 4: Manual feel check in the browser**

Run: `npm run serve`
Open `http://localhost:8080`. Confirm by feel against `chrome://dino` (open side by side):
- Jump is a lower, snappier "pop" — no float/hang.
- Game starts at a brisk pace (not slow) and accelerates smoothly.
- Obstacle spacing feels official; spacing widens as speed climbs.
- On this 144 Hz monitor the game no longer runs ~2.4× too fast.
- High score started fresh (one-time reset) and climbs at a believable rate.

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md CONTEXT.md script.js
git commit -m "docs: record fixed-timestep + distance-scoring invariants"
```

---

## Self-review notes (author)

- **Spec coverage:** §1 fixed-timestep → Task 1; §2 tuning (gravity/jump) → Task 2, (speed) → Task 4; §3 gap → Task 3, scoring → Task 5; high-score migration → Task 5; testing strategy → tests in every task; out-of-scope items (duck/birds/multi-box/sprite) → not implemented, as intended. The optional `velocity − speed/10` jump-distance touch from the spec is **deliberately dropped** (YAGNI: it complicates the jump tests and the user's complaint was float + gaps, not high-speed jump distance); revisit later if desired.
- **Type/name consistency:** module vars `MS_PER_STEP`, `MAX_CATCHUP_STEPS`, `loopLastTime`, `loopAccumulator`; config keys `ACCELERATION`, `GAP_COEFFICIENT`, `MAX_GAP_COEFFICIENT`, `DISTANCE_COEFFICIENT`, per-type `minGap`; `nextObstacle(score, mode, rng, speed)`; `migrateScoreScale()` — used identically across tasks.
- **Determinism:** RNG order (type then gap) preserved in `nextObstacle`; fixed steps keep step-count framerate-independent; no physics value routed through `cfg()`.
