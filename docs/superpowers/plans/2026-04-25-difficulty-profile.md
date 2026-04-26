# DifficultyProfile Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the step-wise level speed formula with a sigmoid difficulty curve, extracted into a testable `DifficultyProfile` module that owns how score maps to speed and obstacle parameters.

**Architecture:** `DifficultyProfile` is a plain object added to `script.js` after `pickObstacleType`. It has two methods: `speedAtScore(score)` uses a sigmoid to produce smooth, continuous speed — gentle start, steepest around score 300 (day/night transition), plateau near `PLATEAU_SPEED` (11.5 px/frame); `obstacleParamsAt(score, rng, mode)` returns `{ gap, type }` by calling the existing `computeNextSpawnGap` and `pickObstacleType` helpers with the computed speed, preserving the original RNG consumption order. The game loop RUNNING branch replaces its inline `INITIAL_SPEED + level * SPEED_INCREMENT` formula with `DifficultyProfile.speedAtScore(game.score)`. Three new config keys are added (`PLATEAU_SPEED`, `RAMP_MIDPOINT`, `RAMP_STEEPNESS`) and one is removed (`SPEED_INCREMENT`).

**Tech Stack:** Vanilla JS, custom Node test harness (`describe`/`it`/`assert`/`assertEquals`). Node binary: `"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"` (standard `node` is not in PATH on this machine).

---

## File map

| File | Change |
|---|---|
| `script.js` | GAME_CONFIG: add 3 sigmoid keys after `SPEED_INCREMENT` (Task 1); remove `SPEED_INCREMENT` and update `SCORE_PER_LEVEL` comment (Task 3). New `DifficultyProfile` object after `pickObstacleType` line ~419 (Tasks 1–2). Game loop RUNNING block: replace 3-line speed formula with 1-line sigmoid call (Task 3). Obstacle spawn block: replace separate `pickObstacleType` + `computeNextSpawnGap` calls with `obstacleParamsAt` (Task 3). `resetGame`: replace `computeNextSpawnGap` call (Task 3). Node exports block: add `DifficultyProfile` (Task 1). |
| `tests/game.test.js` | New `DifficultyProfile` describe block, 9 tests split across Tasks 1–2. Update 1 existing test in the `Difficulty Curve` block (Task 3). |

---

## Task 1: Add sigmoid config keys and implement `DifficultyProfile.speedAtScore` (TDD)

**Files:**
- Modify: `script.js` (GAME_CONFIG, new `DifficultyProfile` object, Node exports block)
- Modify: `tests/game.test.js` (new describe block with 4 tests)

### Context

The sigmoid formula is:
```
speed(score) = INITIAL_SPEED + (PLATEAU_SPEED - INITIAL_SPEED) × sigmoid(RAMP_STEEPNESS × (score − RAMP_MIDPOINT))
```
where `sigmoid(x) = 1 / (1 + Math.exp(-x))`.

At `RAMP_MIDPOINT` (300): `sigmoid(0) = 0.5` exactly, so speed = midpoint between INITIAL and PLATEAU = 8.75. This is the only analytically exact value and the cleanest test anchor.

At score 0: `sigmoid(-3) ≈ 0.047`, so speed ≈ 6.26 — just above `INITIAL_SPEED` (6.0). The curve starts very gently.

At score 600: `sigmoid(3) ≈ 0.953`, so speed ≈ 11.24 — close to `PLATEAU_SPEED` (11.5) but not there yet.

The curve plateaus asymptotically. It never reaches PLATEAU_SPEED exactly, but gets within 0.1 by score ~600.

---

- [ ] **Step 1: Add three config keys to `GAME_CONFIG` in `script.js`**

Find (around line 73–74):
```js
  SPEED_INCREMENT:          1.0,  // speed added per level — 7 levels to cap
  SCORE_PER_LEVEL:        100,    // score points per level-up
```

Replace with:
```js
  SPEED_INCREMENT:          1.0,  // speed added per level — 7 levels to cap
  PLATEAU_SPEED:           11.5,  // sigmoid ceiling — focusable-but-demanding speed the curve approaches
  RAMP_MIDPOINT:          300,    // score where acceleration is steepest (day/night transition)
  RAMP_STEEPNESS:           0.01, // sigmoid slope — controls how quickly speed rises through the midpoint
  SCORE_PER_LEVEL:        100,    // score points per level-up
```

- [ ] **Step 2: Write 4 failing tests in `tests/game.test.js`**

Add this describe block immediately before the `if (typeof window !== 'undefined' ...` line at the very end of the file (currently line 1312 — goes after the closing `});` of `Hill colour interpolation (polish pass)`):

```js
describe('DifficultyProfile', () => {
  it('speedAtScore returns exactly the midpoint speed at RAMP_MIDPOINT', () => {
    const expected = GAME_CONFIG.INITIAL_SPEED +
      (GAME_CONFIG.PLATEAU_SPEED - GAME_CONFIG.INITIAL_SPEED) / 2;
    assertEquals(
      DifficultyProfile.speedAtScore(GAME_CONFIG.RAMP_MIDPOINT), expected,
      'At RAMP_MIDPOINT the sigmoid is exactly 0.5, so speed must be the midpoint between INITIAL and PLATEAU'
    );
  });

  it('speedAtScore is slightly above INITIAL_SPEED at score 0 — curve starts gently', () => {
    const speed = DifficultyProfile.speedAtScore(0);
    assert(speed > GAME_CONFIG.INITIAL_SPEED,
      `Score 0 speed ${speed} should be above INITIAL_SPEED ${GAME_CONFIG.INITIAL_SPEED}`);
    assert(speed < GAME_CONFIG.INITIAL_SPEED + 0.5,
      `Score 0 speed ${speed} should still be close to INITIAL_SPEED — gentle start`);
  });

  it('speedAtScore never exceeds PLATEAU_SPEED', () => {
    for (const score of [500, 1000, 5000]) {
      const speed = DifficultyProfile.speedAtScore(score);
      assert(speed <= GAME_CONFIG.PLATEAU_SPEED,
        `Score ${score} speed ${speed} must not exceed PLATEAU_SPEED ${GAME_CONFIG.PLATEAU_SPEED}`);
    }
  });

  it('speedAtScore is monotonically increasing', () => {
    const s0   = DifficultyProfile.speedAtScore(0);
    const s100 = DifficultyProfile.speedAtScore(100);
    const s300 = DifficultyProfile.speedAtScore(300);
    const s600 = DifficultyProfile.speedAtScore(600);
    assert(s0 < s100 && s100 < s300 && s300 < s600,
      `Speed must strictly increase: ${s0} < ${s100} < ${s300} < ${s600}`);
  });
});
```

- [ ] **Step 3: Run to verify all 4 tests fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A5 "DifficultyProfile"
```

Expected (ReferenceError because `DifficultyProfile` doesn't exist yet):
```
DifficultyProfile
  FAILED: speedAtScore returns exactly the midpoint speed at RAMP_MIDPOINT
  FAILED: speedAtScore is slightly above INITIAL_SPEED at score 0 — curve starts gently
  FAILED: speedAtScore never exceeds PLATEAU_SPEED
  FAILED: speedAtScore is monotonically increasing
```

- [ ] **Step 4: Add `DifficultyProfile` to `script.js`**

Insert after the closing `}` of `pickObstacleType` (line ~419) and before `const MODES` (line ~421). Find the blank line between them and insert:

```js
const DifficultyProfile = {
  speedAtScore(score) {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT } = GAME_CONFIG;
    return INITIAL_SPEED + (PLATEAU_SPEED - INITIAL_SPEED) *
      (1 / (1 + Math.exp(-RAMP_STEEPNESS * (score - RAMP_MIDPOINT))));
  },
  obstacleParamsAt(score, rng, mode) {
    const speed = this.speedAtScore(score);
    const type = pickObstacleType(rng, score, mode);
    return {
      gap:  computeNextSpawnGap(rng, speed, mode),
      type,
    };
  },
};

```

(Both methods live here: `speedAtScore` is tested now; `obstacleParamsAt` is tested in Task 2. The RNG order — type first, then gap — matches the original spawn block order and preserves determinism.)

- [ ] **Step 5: Export `DifficultyProfile` in the Node exports block**

Find in `script.js` (near the end of the if-block):
```js
  global.saveTuning = saveTuning;
  global.announce = announce;
```

Replace with:
```js
  global.saveTuning = saveTuning;
  global.DifficultyProfile = DifficultyProfile;
  global.announce = announce;
```

- [ ] **Step 6: Run tests — verify 4 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A5 "DifficultyProfile"
```

Expected:
```
DifficultyProfile
  PASSED: speedAtScore returns exactly the midpoint speed at RAMP_MIDPOINT
  PASSED: speedAtScore is slightly above INITIAL_SPEED at score 0 — curve starts gently
  PASSED: speedAtScore never exceeds PLATEAU_SPEED
  PASSED: speedAtScore is monotonically increasing
```

- [ ] **Step 7: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 99
Passed: 99
All tests passed!
```

- [ ] **Step 8: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(difficulty): add sigmoid config keys and DifficultyProfile.speedAtScore"
```

---

## Task 2: Add `DifficultyProfile.obstacleParamsAt` tests

**Files:**
- Modify: `tests/game.test.js` (5 new tests inside the `DifficultyProfile` describe block)

### Context

`obstacleParamsAt` is already implemented (Task 1). This task pins its contract with tests. The method calls `pickObstacleType` first (consuming 1 RNG call in updated mode), then `computeNextSpawnGap` (consuming 1 RNG call in updated mode). In classic mode neither call consumes RNG — all gaps and types are deterministic.

The constant-RNG test (`rng = () => 0.99`) uses a roll of 0.99 × totalWeight to exercise the last-eligible-type path. At score 250 in updated mode: eligible types are small (weight 50), big (weight 30), cluster (weight 20), totalWeight = 100, roll = 99 → cluster wins.

---

- [ ] **Step 1: Add 5 tests inside the existing `DifficultyProfile` describe block**

Find the closing `});` of the `DifficultyProfile` describe block (the last `});` before `if (typeof window !== 'undefined' ...`). Insert these 5 tests before that closing `});`:

```js
  it('obstacleParamsAt returns an object with a numeric gap and a typed obstacle', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.obstacleParamsAt(0, rng, MODES.CLASSIC);
    assert(typeof params.gap === 'number',
      'gap must be a number');
    assert(params.type && typeof params.type.id === 'string',
      'type must be an obstacle-type object with an id string');
  });

  it('obstacleParamsAt classic mode: gap shrinks as score rises', () => {
    const rng = mulberry32(42); // not consumed in classic mode — safe to reuse
    const paramsLow  = DifficultyProfile.obstacleParamsAt(0,   rng, MODES.CLASSIC);
    const paramsHigh = DifficultyProfile.obstacleParamsAt(500, rng, MODES.CLASSIC);
    assert(paramsHigh.gap < paramsLow.gap,
      `Gap at score 500 (${paramsHigh.gap}) should be less than gap at score 0 (${paramsLow.gap}) — higher speed means shorter gap`);
  });

  it('obstacleParamsAt classic mode: type is always small cactus', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.obstacleParamsAt(500, rng, MODES.CLASSIC);
    assertEquals(params.type.id, 'small',
      'Classic mode must always return the small cactus');
  });

  it('obstacleParamsAt updated mode: gap is within valid range at score 0', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.obstacleParamsAt(0, rng, MODES.UPDATED);
    assert(params.gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `Gap (${params.gap}) must be at least MIN_SPAWN_GAP (${GAME_CONFIG.MIN_SPAWN_GAP})`);
    assert(params.gap <= Math.round(GAME_CONFIG.MAX_SPAWN_GAP * 1.35),
      `Gap (${params.gap}) must not far exceed MAX_SPAWN_GAP (${GAME_CONFIG.MAX_SPAWN_GAP})`);
  });

  it('obstacleParamsAt updated mode: cluster cactus returned at score 250 with max roll', () => {
    const rng = () => 0.99; // constant roll — pushes weighted pick to last eligible type
    const params = DifficultyProfile.obstacleParamsAt(250, rng, MODES.UPDATED);
    assertEquals(params.type.id, 'cluster',
      'At score 250 with max rng roll, all three types eligible and cluster wins the weighted draw');
  });

```

- [ ] **Step 2: Run and verify all 5 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "obstacleParamsAt"
```

Expected:
```
  PASSED: obstacleParamsAt returns an object with a numeric gap and a typed obstacle
  PASSED: obstacleParamsAt classic mode: gap shrinks as score rises
  PASSED: obstacleParamsAt classic mode: type is always small cactus
  PASSED: obstacleParamsAt updated mode: gap is within valid range at score 0
  PASSED: obstacleParamsAt updated mode: cluster cactus returned at score 250 with max roll
```

- [ ] **Step 3: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 104
Passed: 104
All tests passed!
```

- [ ] **Step 4: Commit**

```bash
git add tests/game.test.js
git commit -m "test(difficulty): pin obstacleParamsAt behaviour with 5 tests"
```

---

## Task 3: Wire game loop to DifficultyProfile; clean up config

**Files:**
- Modify: `script.js` (4 edits)
- Modify: `tests/game.test.js` (1 test updated in-place)

### Context

Three places in `script.js` compute speed or obstacle params directly:

1. **RUNNING block** (~line 1097–1101 before this task; line numbers shift by +17 after Tasks 1–2 insert code). The 3-line `Math.min(INITIAL_SPEED + level * SPEED_INCREMENT, SPEED_CAP)` becomes 1 line calling `DifficultyProfile.speedAtScore(game.score)`. Keep the `level` variable — it's used for milestone-flash detection immediately after.

2. **Obstacle spawn block** (2 lines in the `if (game.lastObstacleX <= ...)` check). Replace `pickObstacleType(...)` + `computeNextSpawnGap(...)` with a single `DifficultyProfile.obstacleParamsAt(...)` call.

3. **`resetGame`** (1 line). Replace `computeNextSpawnGap(game.rng, game.currentSpeed, game.mode)` with `DifficultyProfile.obstacleParamsAt(game.score, game.rng, game.mode).gap`. At reset, `game.score = 0`, so the initial gap is computed from score 0 (speed ≈ 6.26), giving a gap very close to `MAX_SPAWN_GAP`.

The existing test `'should cap currentSpeed at SPEED_CAP regardless of score'` in the `Difficulty Curve` describe block will fail because `speedAtScore(2000) ≈ 11.5` ≠ `SPEED_CAP (13.0)`. Update this test to assert the sigmoid plateau behaviour instead.

---

- [ ] **Step 1: Replace the speed formula in the RUNNING block of `script.js`**

Find (the 3-line formula in the RUNNING section — search for the exact string `SPEED_INCREMENT`):
```js
  const level = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.currentSpeed = Math.min(
    GAME_CONFIG.INITIAL_SPEED + level * GAME_CONFIG.SPEED_INCREMENT,
    GAME_CONFIG.SPEED_CAP
  );
```

Replace with:
```js
  const level = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.currentSpeed = DifficultyProfile.speedAtScore(game.score);
```

- [ ] **Step 2: Replace the obstacle spawn calls in `script.js`**

Find (inside the `if (game.lastObstacleX <= canvas.width - game.nextSpawnGap)` block):
```js
    spawnObstacle(pickObstacleType(game.rng, game.score, game.mode));
    game.lastObstacleX = canvas.width;
    game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed, game.mode);
```

Replace with:
```js
    const params = DifficultyProfile.obstacleParamsAt(game.score, game.rng, game.mode);
    spawnObstacle(params.type);
    game.lastObstacleX = canvas.width;
    game.nextSpawnGap = params.gap;
```

- [ ] **Step 3: Replace the `resetGame` spawn gap call in `script.js`**

Find (inside `resetGame`):
```js
  game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed, game.mode);
```

Replace with:
```js
  game.nextSpawnGap = computeNextSpawnGap(game.rng, DifficultyProfile.speedAtScore(game.score), game.mode);
```

(Derives speed from score 0 via `speedAtScore` rather than passing `game.currentSpeed`. Does not call `pickObstacleType` here since only the gap is needed at reset — avoids consuming an extra RNG call for an obstacle type that's immediately discarded.)

- [ ] **Step 4: Remove `SPEED_INCREMENT` and update `SCORE_PER_LEVEL` comment in `GAME_CONFIG`**

Find:
```js
  SPEED_INCREMENT:          1.0,  // speed added per level — 7 levels to cap
  PLATEAU_SPEED:           11.5,  // sigmoid ceiling — focusable-but-demanding speed the curve approaches
```

Replace with (remove the SPEED_INCREMENT line entirely):
```js
  PLATEAU_SPEED:           11.5,  // sigmoid ceiling — focusable-but-demanding speed the curve approaches
```

Then find:
```js
  SCORE_PER_LEVEL:        100,    // score points per level-up
```

Replace with:
```js
  SCORE_PER_LEVEL:        100,    // score points per level — used for milestone flash effects only
```

- [ ] **Step 5: Update the `Difficulty Curve` test in `tests/game.test.js`**

Find (the entire test body, around line 726–737):
```js
  it('should cap currentSpeed at SPEED_CAP regardless of score', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;

    game.score = 2000;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.currentSpeed, GAME_CONFIG.SPEED_CAP,
      `currentSpeed at score 2000 should equal SPEED_CAP (${GAME_CONFIG.SPEED_CAP}), got ${game.currentSpeed}`);
  });
```

Replace with:
```js
  it('currentSpeed approaches PLATEAU_SPEED at high score and never exceeds it', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;

    game.score = 2000;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assert(game.currentSpeed <= GAME_CONFIG.PLATEAU_SPEED,
      `currentSpeed at score 2000 (${game.currentSpeed}) must not exceed PLATEAU_SPEED (${GAME_CONFIG.PLATEAU_SPEED})`);
    assert(game.currentSpeed > GAME_CONFIG.PLATEAU_SPEED - 0.1,
      `currentSpeed at score 2000 (${game.currentSpeed}) should be very close to PLATEAU_SPEED — sigmoid has converged`);
  });
```

- [ ] **Step 6: Run the full suite**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 104
Passed: 104
All tests passed!
```

(95 baseline + 9 new DifficultyProfile tests = 104. The Difficulty Curve test was updated in-place, not added, so count stays 104.)

- [ ] **Step 7: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(difficulty): wire game loop to DifficultyProfile sigmoid curve"
```

---

## Task 4: Regression check and curve sanity

**Files:** none (read-only verification)

- [ ] **Step 1: Run the full suite**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1
```

Expected final lines:
```
Total tests: 104
Passed: 104
All tests passed!
```

- [ ] **Step 2: Print the speed curve for a quick sanity read**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" -e "require('./script.js'); [0,100,200,300,400,500,600,700].forEach(s => console.log('score', s, '→', DifficultyProfile.speedAtScore(s).toFixed(2)))"
```

Expected output (approximate — check shape, not exact digits):
```
score 0 → 6.26
score 100 → 6.66
score 200 → 7.48
score 300 → 8.75
score 400 → 10.02
score 500 → 10.85
score 600 → 11.24
score 700 → 11.39
```

The curve should: start close to 6 (gentle), steepen most around 300 (the jump from 7.48 to 8.75 to 10.02 spans 100-point intervals), then flatten above 500. Values must never reach or exceed 11.5.
