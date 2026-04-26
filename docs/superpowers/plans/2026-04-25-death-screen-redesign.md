# Death Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current game-over screen with a two-state layout — a side-by-side personal-best comparison on normal deaths, and a full-screen celebration on new records.

**Architecture:** Extract a pure `computeRunResult` function for testability, add two new `game` fields (`isNewBest`, `previousHighScore`) set by the death handler before `highScore` is updated, and rewrite `drawGameOverScreen` to branch on `game.isNewBest`. All changes are in `script.js` and `tests/game.test.js`.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200). Custom Node test harness (`describe`/`it`/`assert`/`assertEquals`). Node binary: `"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"`.

---

## File map

| File | Change |
|---|---|
| `script.js` | Task 1: add `computeRunResult` (Section 6, after `checkCollision`). Task 2: add `isNewBest`/`previousHighScore` to `game` object, update death handler, update `resetGame`, add export. Task 3: rewrite `drawGameOverScreen`. |
| `tests/game.test.js` | All tasks: append to a single new `describe('Death screen', ...)` block before the `// --- Test Summary ---` comment (currently at line 1267). |

---

## Task 1: `computeRunResult` pure function

**Files:**
- Modify: `script.js` (Section 6 — after the closing `}` of `checkCollision`, before `function jump`)
- Modify: `tests/game.test.js` (new `describe('Death screen', ...)` block before line 1267)

---

- [ ] **Step 1: Write 4 failing tests**

Append this block to `tests/game.test.js` immediately before the `// --- Test Summary ---` comment:

```js
describe('Death screen', () => {
  // --- computeRunResult ---

  it('computeRunResult: normal run returns isNewBest=false and gap delta', () => {
    const r = computeRunResult(847, 1050);
    assertEquals(r.isNewBest, false, 'not a new best when score < highScore');
    assertEquals(r.delta, 203, 'delta = highScore - score = 1050 - 847');
    assertEquals(r.previousHighScore, 1050, 'previousHighScore preserved');
  });

  it('computeRunResult: new record returns isNewBest=true and improvement delta', () => {
    const r = computeRunResult(1253, 1050);
    assertEquals(r.isNewBest, true, 'is a new best when score > highScore');
    assertEquals(r.delta, 203, 'delta = score - previousHighScore = 1253 - 1050');
    assertEquals(r.previousHighScore, 1050, 'previousHighScore is old highScore');
  });

  it('computeRunResult: first run (highScore=0) is always a new best', () => {
    const r = computeRunResult(500, 0);
    assertEquals(r.isNewBest, true, 'first run with highScore=0 is a new best');
    assertEquals(r.previousHighScore, 0, 'previousHighScore is 0 on first run');
  });

  it('computeRunResult: tie (score === highScore) is not a new best', () => {
    const r = computeRunResult(1000, 1000);
    assertEquals(r.isNewBest, false, 'tie is not a new best');
    assertEquals(r.delta, 0, 'delta is 0 on a tie');
  });
});
```

- [ ] **Step 2: Run to verify all 4 fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "computeRunResult"
```

Expected: all four lines show `FAILED` with `ReferenceError: computeRunResult is not defined`.

- [ ] **Step 3: Add `computeRunResult` to `script.js`**

Find the closing `}` of `checkCollision` followed by an empty line and `function jump`. Add the new function in that gap:

Find this code:
```js
  return dl < or_ && dr > ol && dt < ob && db > ot;
}

function jump() {
```

Replace with:
```js
  return dl < or_ && dr > ol && dt < ob && db > ot;
}

function computeRunResult(finalScore, currentHighScore) {
  const isNewBest = finalScore > currentHighScore || currentHighScore === 0;
  const previousHighScore = currentHighScore;
  const delta = isNewBest
    ? finalScore - previousHighScore
    : currentHighScore - finalScore;
  return { isNewBest, previousHighScore, delta };
}

function jump() {
```

- [ ] **Step 4: Export `computeRunResult` in the Node exports block**

Find this line near the bottom of `script.js`:
```js
  global.drawGameOverScreen = drawGameOverScreen;
```

Add immediately after it:
```js
  global.computeRunResult = computeRunResult;
```

- [ ] **Step 5: Run to verify all 4 tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "computeRunResult"
```

Expected:
```
  PASSED: computeRunResult: normal run returns isNewBest=false and gap delta
  PASSED: computeRunResult: new record returns isNewBest=true and improvement delta
  PASSED: computeRunResult: first run (highScore=0) is always a new best
  PASSED: computeRunResult: tie (score === highScore) is not a new best
```

- [ ] **Step 6: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:
```
Total tests: 108
Passed: 108
All tests passed!
```

- [ ] **Step 7: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(death-screen): add computeRunResult pure function"
```

---

## Task 2: `game` state fields + death handler + `resetGame`

**Files:**
- Modify: `script.js` (`game` object, death handler, `resetGame`, Node exports)
- Modify: `tests/game.test.js` (append 2 tests inside the existing `describe('Death screen', ...)` block)

---

- [ ] **Step 1: Write 2 failing tests**

Inside the `describe('Death screen', ...)` block (append after the last test before the closing `});`):

```js
  // --- game state fields + death handler ---

  it('death handler sets isNewBest and previousHighScore before updating highScore', () => {
    const origHS        = game.highScore;
    const origScore     = game.score;
    const origState     = game.state;
    const origObstacles = game.obstacles;
    const origLastObs   = game.lastObstacleX;
    const origNewBest   = game.isNewBest;
    const origPrevHS    = game.previousHighScore;

    game.highScore         = 1000;
    game.score             = 1200;
    game.state             = STATE.RUNNING;
    game.graceFrames       = 0;
    game.lastObstacleX     = canvas.width; // prevent an extra spawn firing
    // Obstacle overlapping dino: dino is at x=50,y=150,w=40,h=50.
    // Padded dino box: dl=58 dr=82 dt=158 db=198.
    // This obstacle: ol=63 or=77 ot=162 ob=200 — definitely collides.
    game.obstacles = [{ x: 60, y: 160, width: 20, height: 40 }];

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.state,             STATE.DEAD, 'collision should set DEAD');
    assertEquals(game.isNewBest,         true,       'score 1200 > highScore 1000 → new best');
    assertEquals(game.previousHighScore, 1000,       'previousHighScore should be pre-death highScore');
    assertEquals(game.highScore,         1200,       'highScore should be updated to 1200');

    game.highScore         = origHS;
    game.score             = origScore;
    game.state             = origState;
    game.obstacles         = origObstacles;
    game.lastObstacleX     = origLastObs;
    game.isNewBest         = origNewBest;
    game.previousHighScore = origPrevHS;
  });

  it('resetGame resets isNewBest to false and previousHighScore to 0', () => {
    game.isNewBest         = true;
    game.previousHighScore = 999;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.isNewBest,         false, 'isNewBest should be false after resetGame');
    assertEquals(game.previousHighScore, 0,     'previousHighScore should be 0 after resetGame');
  });
```

- [ ] **Step 2: Run to verify both fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "death handler\|resetGame resets isNewBest"
```

Expected: both tests fail — `game.isNewBest` is `undefined` because the fields haven't been added yet.

- [ ] **Step 3: Add `isNewBest` and `previousHighScore` to the `game` object**

Find this in `script.js`:
```js
  newBestFrames:    0,
  newBestShown:     false,
  rng:              mulberry32(Date.now() & 0xffffffff),
```

Replace with:
```js
  newBestFrames:    0,
  newBestShown:     false,
  isNewBest:         false,
  previousHighScore: 0,
  rng:              mulberry32(Date.now() & 0xffffffff),
```

- [ ] **Step 4: Update the death handler to use `computeRunResult`**

Find this exact block in `script.js` (inside the collision detection branch):
```js
      const finalScore = Math.floor(game.score);
      if (finalScore > game.highScore) {
        game.highScore = finalScore;
        localStorage.setItem('dino-high-score', game.highScore);
      }
```

Replace with:
```js
      const finalScore = Math.floor(game.score);
      const _runResult = computeRunResult(finalScore, game.highScore);
      game.isNewBest         = _runResult.isNewBest;
      game.previousHighScore = _runResult.previousHighScore;
      if (finalScore > game.highScore) {
        game.highScore = finalScore;
        localStorage.setItem('dino-high-score', game.highScore);
      }
```

- [ ] **Step 5: Add resets to `resetGame()`**

Find this in `script.js` inside `resetGame()`:
```js
  game.newBestFrames = 0;
  game.newBestShown = false;
  game.rng = mulberry32(Date.now() & 0xffffffff);
```

Replace with:
```js
  game.newBestFrames     = 0;
  game.newBestShown      = false;
  game.isNewBest         = false;
  game.previousHighScore = 0;
  game.rng = mulberry32(Date.now() & 0xffffffff);
```

- [ ] **Step 6: Run to verify both new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "death handler\|resetGame resets isNewBest"
```

Expected:
```
  PASSED: death handler sets isNewBest and previousHighScore before updating highScore
  PASSED: resetGame resets isNewBest to false and previousHighScore to 0
```

- [ ] **Step 7: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:
```
Total tests: 110
Passed: 110
All tests passed!
```

- [ ] **Step 8: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(death-screen): add isNewBest/previousHighScore state and wire death handler"
```

---

## Task 3: Rewrite `drawGameOverScreen`

**Files:**
- Modify: `script.js` (`drawGameOverScreen` function)
- Modify: `tests/game.test.js` (append 3 tests inside `describe('Death screen', ...)`)

---

- [ ] **Step 1: Write 3 failing tests**

Append inside the `describe('Death screen', ...)` block (before the closing `});`):

```js
  // --- drawGameOverScreen ---

  it('drawGameOverScreen normal state renders THIS RUN label', () => {
    const origNewBest = game.isNewBest;
    const origHS      = game.highScore;
    const origScore   = game.score;

    game.isNewBest  = false;
    game.highScore  = 1050;
    game.score      = 847;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest = origNewBest;
    game.highScore = origHS;
    game.score     = origScore;

    assert(calls.some(t => t === 'THIS RUN'),
      `Expected 'THIS RUN' in drawGameOverScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('drawGameOverScreen normal state renders gap delta value', () => {
    const origNewBest = game.isNewBest;
    const origHS      = game.highScore;
    const origScore   = game.score;

    game.isNewBest  = false;
    game.highScore  = 1050;
    game.score      = 847;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest = origNewBest;
    game.highScore = origHS;
    game.score     = origScore;

    assert(calls.some(t => t.includes('203')),
      `Expected a call containing '203' (the gap delta), got: ${JSON.stringify(calls)}`);
  });

  it('drawGameOverScreen new record state renders NEW BEST header', () => {
    const origNewBest = game.isNewBest;
    const origPrevHS  = game.previousHighScore;
    const origScore   = game.score;

    game.isNewBest         = true;
    game.previousHighScore = 1050;
    game.score             = 1253;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest         = origNewBest;
    game.previousHighScore = origPrevHS;
    game.score             = origScore;

    assert(calls.some(t => t.includes('NEW BEST')),
      `Expected a call containing 'NEW BEST', got: ${JSON.stringify(calls)}`);
  });
```

- [ ] **Step 2: Run to verify all 3 fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "THIS RUN\|gap delta\|NEW BEST header"
```

Expected: all three `FAILED` — the current `drawGameOverScreen` renders `GAME OVER` but not `THIS RUN` or `NEW BEST`.

- [ ] **Step 3: Rewrite `drawGameOverScreen` in `script.js`**

Replace the entire function (from `function drawGameOverScreen() {` through its closing `}`) with:

```js
function drawGameOverScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';

  if (game.isNewBest) {
    // New record — celebration takeover
    ctx.fillStyle = 'white';
    ctx.font = '15px ' + font;
    ctx.fillText('★  NEW BEST  ★', canvas.width / 2, canvas.height / 2 - 36);

    ctx.font = '42px ' + font;
    ctx.fillText(String(Math.floor(game.score)).padStart(5, '0'), canvas.width / 2, canvas.height / 2 - 4);

    if (game.previousHighScore > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '13px ' + font;
      const improvement = Math.floor(game.score) - game.previousHighScore;
      ctx.fillText('+' + improvement + ' over your previous best', canvas.width / 2, canvas.height / 2 + 28);
    }
  } else {
    // Normal death — side-by-side comparison
    const delta    = game.highScore - Math.floor(game.score);
    const scoreStr = String(Math.floor(game.score)).padStart(5, '0');
    const bestStr  = String(game.highScore).padStart(5, '0');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px ' + font;
    ctx.fillText('THIS RUN',  canvas.width * 0.2, canvas.height / 2 - 14);
    ctx.fillStyle = 'white';
    ctx.font = '28px ' + font;
    ctx.fillText(scoreStr,   canvas.width * 0.2, canvas.height / 2 + 14);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '16px ' + font;
    ctx.fillText('← ' + delta + ' →', canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '11px ' + font;
    ctx.fillText('from best', canvas.width / 2, canvas.height / 2 + 10);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px ' + font;
    ctx.fillText('YOUR BEST', canvas.width * 0.8, canvas.height / 2 - 14);
    ctx.font = '28px ' + font;
    ctx.fillText(bestStr,    canvas.width * 0.8, canvas.height / 2 + 14);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '13px ' + font;
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height - 16);
}
```

- [ ] **Step 4: Run to verify all 3 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "THIS RUN\|gap delta\|NEW BEST header"
```

Expected:
```
  PASSED: drawGameOverScreen normal state renders THIS RUN label
  PASSED: drawGameOverScreen normal state renders gap delta value
  PASSED: drawGameOverScreen new record state renders NEW BEST header
```

- [ ] **Step 5: Full regression check**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:
```
Total tests: 113
Passed: 113
All tests passed!
```

- [ ] **Step 6: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(death-screen): rewrite drawGameOverScreen with two-state layout"
```

---

## Verification checklist

After all three tasks, confirm every spec requirement is covered:

- `computeRunResult(847, 1050)` → `{ isNewBest: false, delta: 203, previousHighScore: 1050 }` — Task 1 test 1
- `computeRunResult(1253, 1050)` → `{ isNewBest: true, delta: 203, previousHighScore: 1050 }` — Task 1 test 2
- `computeRunResult(500, 0)` → `isNewBest: true, previousHighScore: 0` — Task 1 test 3
- `computeRunResult(1000, 1000)` → `isNewBest: false, delta: 0` — Task 1 test 4
- Death handler sets `game.isNewBest` and `game.previousHighScore` — Task 2 test 1
- `resetGame()` resets both fields — Task 2 test 2
- Normal death renders `THIS RUN` label — Task 3 test 1
- Normal death renders gap delta — Task 3 test 2
- New record renders `NEW BEST` header — Task 3 test 3
- Delta line omitted on first run (`previousHighScore === 0`) — guarded by `if (game.previousHighScore > 0)` in implementation
- No regressions — full 113-test suite passes
