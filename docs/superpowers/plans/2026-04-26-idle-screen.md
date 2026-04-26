# Idle Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `STATE.IDLE` first-load state that shows a "REX RUN / TAP TO PRESS SPACE TO START" overlay and waits for player input before the existing GET READY countdown begins.

**Architecture:** One new state constant (`STATE.IDLE`), one new render function (`drawIdleScreen`), one new branch in `handleAction`, one new branch in `gameLoop`, and a one-line change to `startGameOnce`. No new files — all changes in `script.js` and `tests/game.test.js`. `resetGame` is unchanged; restarts always go to `STATE.WAITING` as before.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200 internal resolution). Custom Node test harness (`describe`/`it`/`assert`/`assertEquals`). Node binary: `"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"`.

---

## File map

| File | Change |
|---|---|
| `script.js` | Add `IDLE` to `STATE`; change `startGameOnce` to set `STATE.IDLE`; add `drawIdleScreen()`; add `STATE.IDLE` branch in `gameLoop`; add `STATE.IDLE` branch in `handleAction`; export `drawIdleScreen` and `handleAction`. |
| `tests/game.test.js` | New `describe('Idle screen', ...)` block before the `setTimeout(printSummary, 500)` call at line 1391. |

---

## Task 1: Idle screen (all changes)

**Files:**
- Modify: `script.js`
- Modify: `tests/game.test.js`

---

- [ ] **Step 1: Write 4 failing tests**

Append this block to `tests/game.test.js` immediately before the final block that starts with `if (typeof window !== 'undefined'` (currently at line 1391):

```js
describe('Idle screen', () => {
  it('drawIdleScreen does not throw', () => {
    let threw = false;
    try { drawIdleScreen(); } catch (e) { threw = true; }
    assert(!threw, 'drawIdleScreen should not throw');
  });

  it('drawIdleScreen renders REX RUN title', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(calls.some(t => t === 'REX RUN'),
      `Expected 'REX RUN' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('drawIdleScreen renders start prompt', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(calls.some(t => t === 'TAP / PRESS SPACE TO START'),
      `Expected 'TAP / PRESS SPACE TO START' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('handleAction in STATE.IDLE transitions to STATE.WAITING and sets graceFrames', () => {
    const origState      = game.state;
    const origGraceFrames = game.graceFrames;

    game.state = STATE.IDLE;
    handleAction();

    const newState  = game.state;
    const newGrace  = game.graceFrames;

    game.state      = origState;
    game.graceFrames = origGraceFrames;

    assertEquals(newState, STATE.WAITING,
      'handleAction in IDLE should transition to STATE.WAITING');
    assertEquals(newGrace, GAME_CONFIG.GRACE_FRAMES,
      'handleAction in IDLE should set graceFrames to GAME_CONFIG.GRACE_FRAMES');
  });
});
```

- [ ] **Step 2: Run to verify all 4 fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "Idle screen\|drawIdleScreen\|handleAction in STATE"
```

Expected: all four `FAILED` with `ReferenceError: drawIdleScreen is not defined` (or `handleAction is not defined`).

- [ ] **Step 3: Add `IDLE` to the `STATE` constant**

Find this in `script.js`:

```js
const STATE = Object.freeze({
  LOADING: 'LOADING',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});
```

Replace with:

```js
const STATE = Object.freeze({
  LOADING: 'LOADING',
  IDLE:    'IDLE',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});
```

- [ ] **Step 4: Change `startGameOnce` to enter `STATE.IDLE`**

Find this in `script.js`:

```js
function startGameOnce() {
  if (assetsStarted) return;
  assetsStarted = true;
  dino.y = canvas.height - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.WAITING;
  gameLoop();
}
```

Replace with:

```js
function startGameOnce() {
  if (assetsStarted) return;
  assetsStarted = true;
  dino.y = canvas.height - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.IDLE;
  gameLoop();
}
```

- [ ] **Step 5: Add `drawIdleScreen()` to `script.js`**

Find this line in `script.js`:

```js
function drawGetReadyOverlay() {
```

Add the new function immediately before it:

```js
function drawIdleScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';

  ctx.fillStyle = 'white';
  ctx.font = '22px ' + font;
  ctx.fillText('REX RUN', canvas.width / 2, canvas.height / 2 - 16);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '13px ' + font;
  ctx.fillText('TAP / PRESS SPACE TO START', canvas.width / 2, canvas.height / 2 + 12);
}

```

- [ ] **Step 6: Add `STATE.IDLE` branch to `gameLoop()`**

Find this comment+block in `script.js`:

```js
  // WAITING — grace-period countdown with GET READY overlay.
  if (game.state === STATE.WAITING) {
```

Add the IDLE branch immediately before it:

```js
  // IDLE — first-load waiting state; shows idle overlay until player initiates.
  if (game.state === STATE.IDLE) {
    game.animFrame++;
    drawBackground();
    if (document.body) document.body.style.background = getBackgroundColor(game.score);
    drawHills();
    drawGround();
    updateClouds();
    drawClouds();
    drawDino();
    drawIdleScreen();
    game.animationFrameId = requestAnimationFrame(gameLoop);
    return;
  }

  // WAITING — grace-period countdown with GET READY overlay.
  if (game.state === STATE.WAITING) {
```

- [ ] **Step 7: Add `STATE.IDLE` branch to `handleAction()`**

Find this in `script.js`:

```js
function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.RUNNING) {
    jump();
  } else if (game.state === STATE.DEAD) {
    resetGame();
    gameLoop();
  }
}
```

Replace with:

```js
function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.IDLE) {
    game.state       = STATE.WAITING;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  } else if (game.state === STATE.RUNNING) {
    jump();
  } else if (game.state === STATE.DEAD) {
    resetGame();
    gameLoop();
  }
}
```

- [ ] **Step 8: Export `drawIdleScreen` and `handleAction` in the Node exports block**

Find this line near the bottom of `script.js`:

```js
  global.drawGameOverScreen = drawGameOverScreen;
```

Add immediately after it:

```js
  global.drawIdleScreen = drawIdleScreen;
  global.handleAction   = handleAction;
```

- [ ] **Step 9: Run to verify all 4 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "Idle screen\|drawIdleScreen\|handleAction in STATE"
```

Expected:

```
  PASSED: drawIdleScreen does not throw
  PASSED: drawIdleScreen renders REX RUN title
  PASSED: drawIdleScreen renders start prompt
  PASSED: handleAction in STATE.IDLE transitions to STATE.WAITING and sets graceFrames
```

- [ ] **Step 10: Full regression check**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:

```
Total tests: 108
Passed: 108
All tests passed!
```

- [ ] **Step 11: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "feat(idle-screen): add STATE.IDLE first-load waiting state"
```

---

## Verification checklist

After the task, confirm every spec requirement is covered:

- `STATE.IDLE` constant exists — Step 3
- Page loads into `STATE.IDLE` via `startGameOnce` — Step 4
- `drawIdleScreen` renders `rgba(0,0,0,0.65)` overlay, `REX RUN` title, `TAP / PRESS SPACE TO START` prompt — Step 5
- `gameLoop` handles `STATE.IDLE`: draws background + idle overlay, schedules next frame — Step 6
- `handleAction` in `STATE.IDLE` transitions to `STATE.WAITING` and sets `graceFrames` — Step 7
- `resetGame` unchanged (always goes to `STATE.WAITING`) — no change needed
- All 4 tests pass; full suite 108/108 — Steps 9–10
