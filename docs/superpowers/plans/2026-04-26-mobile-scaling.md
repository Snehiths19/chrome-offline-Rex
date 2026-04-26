# Mobile Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rex Run render crisply on high-DPI mobile screens by adding `CANVAS_W`/`CANVAS_H` logical-coordinate constants and an `initCanvasScale()` function that sizes the canvas bitmap to `cssWidth × devicePixelRatio`.

**Architecture:** Two tasks. Task 1 adds `CANVAS_W: 600` and `CANVAS_H: 200` to `GAME_CONFIG` and replaces all `canvas.width`/`canvas.height` reads in game logic with those constants. Task 2 adds `initCanvasScale()` — called once after the canvas context is created — which sets the bitmap size for crisp DPR rendering and applies a `ctx.scale` so all existing 600×200 drawing coordinates continue to work unchanged. One CSS change removes the `max-width` cap on the wrapper. All game physics and gameplay are unaffected.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200 internal resolution). Custom Node test harness (`describe`/`it`/`assert`/`assertEquals`). Node binary: `"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"`.

---

## File map

| File | Change |
|---|---|
| `script.js` | Add `CANVAS_W`/`CANVAS_H` to `GAME_CONFIG`; replace ~35 `canvas.width`/`canvas.height` reads with constants; add `initCanvasScale()`; call it after `ctx`; add `innerWidth: 600` to window stub and `style: {}` to canvas stub; export `initCanvasScale`. |
| `style.css` | Remove `max-width: 600px` from `#game-wrapper`. |
| `tests/game.test.js` | New `describe('Canvas scaling', ...)` block — 3 tests (108 → 111). |

---

## Task 1: CANVAS_W/CANVAS_H constants and replacements

**Files:**
- Modify: `script.js`
- Modify: `tests/game.test.js`

---

- [ ] **Step 1: Write 1 failing test**

Append this block to `tests/game.test.js` immediately before the final block that starts with `if (typeof window !== 'undefined'` (currently at line 1392):

```js
describe('Canvas scaling', () => {
  it('GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200', () => {
    assertEquals(GAME_CONFIG.CANVAS_W, 600,
      'GAME_CONFIG.CANVAS_W should be 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200,
      'GAME_CONFIG.CANVAS_H should be 200');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "Canvas scaling\|CANVAS_W"
```

Expected: `FAILED` with something like `AssertionError: undefined !== 600`.

- [ ] **Step 3: Add `CANVAS_W` and `CANVAS_H` to `GAME_CONFIG`**

Find this in `script.js`:

```js
const GAME_CONFIG = Object.freeze({
  // --- Physics ---
```

Replace with:

```js
const GAME_CONFIG = Object.freeze({
  // --- Canvas logical dimensions ---
  CANVAS_W: 600,
  CANVAS_H: 200,

  // --- Physics ---
```

- [ ] **Step 4: Replace all `canvas.width` reads with `GAME_CONFIG.CANVAS_W`**

In `script.js`, use **replace_all** to replace `canvas.width` with `GAME_CONFIG.CANVAS_W`. This covers every occurrence — background clear, cloud/hill spawn, obstacle gate, score HUD, overlay centres. There are ~20 occurrences; all are reads (no writes exist yet — `initCanvasScale` is added in Task 2).

Verify the replacement was safe by running:

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected: 109 tests, 109 passed. If any test failed, inspect the diff and restore the specific line.

- [ ] **Step 5: Replace all `canvas.height` reads with `GAME_CONFIG.CANVAS_H`**

In `script.js`, use **replace_all** to replace `canvas.height` with `GAME_CONFIG.CANVAS_H`. This covers dino landing, ground Y, hill base, overlay centres — ~15 occurrences.

- [ ] **Step 6: Run full regression**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:

```
Total tests: 109
Passed: 109
All tests passed!
```

- [ ] **Step 7: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "refactor(canvas): introduce CANVAS_W/CANVAS_H constants"
```

---

## Task 2: `initCanvasScale()`, stub updates, CSS, and export

**Files:**
- Modify: `script.js`
- Modify: `style.css`
- Modify: `tests/game.test.js`

---

- [ ] **Step 1: Write 3 failing tests**

Find this in `tests/game.test.js`:

```js
describe('Canvas scaling', () => {
  it('GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200', () => {
    assertEquals(GAME_CONFIG.CANVAS_W, 600,
      'GAME_CONFIG.CANVAS_W should be 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200,
      'GAME_CONFIG.CANVAS_H should be 200');
  });
});
```

Replace with (add 3 more tests inside the same describe block):

```js
describe('Canvas scaling', () => {
  it('GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200', () => {
    assertEquals(GAME_CONFIG.CANVAS_W, 600,
      'GAME_CONFIG.CANVAS_W should be 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200,
      'GAME_CONFIG.CANVAS_H should be 200');
  });

  it('initCanvasScale sets bitmap width to cssW * dpr', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr        = window.devicePixelRatio;
    const origWidth      = canvas.width;
    const origHeight     = canvas.height;

    window.innerWidth       = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const bitmapW = canvas.width;
    const bitmapH = canvas.height;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;

    assertEquals(bitmapW, 780,
      'canvas.width should be Math.round(390 * 2) = 780');
    assertEquals(bitmapH, 260,
      'canvas.height should be Math.round(780 / 3) = 260');
  });

  it('initCanvasScale sets CSS display size', () => {
    const origInnerWidth  = window.innerWidth;
    const origDpr         = window.devicePixelRatio;
    const origWidth       = canvas.width;
    const origHeight      = canvas.height;
    const origStyleWidth  = canvas.style.width;
    const origStyleHeight = canvas.style.height;

    window.innerWidth       = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const styleW = canvas.style.width;
    const styleH = canvas.style.height;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;
    canvas.style.width      = origStyleWidth;
    canvas.style.height     = origStyleHeight;

    assertEquals(styleW, '390px',
      'canvas.style.width should be "390px"');
    assertEquals(styleH, '130px',
      'canvas.style.height should be "130px" (Math.round(390/3))');
  });
});
```

- [ ] **Step 2: Run to verify all 3 new tests fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "initCanvasScale"
```

Expected: all three new tests `FAILED` with `ReferenceError: initCanvasScale is not defined`.

- [ ] **Step 3: Add `style: {}` to the canvas stub in `script.js`**

Find this in `script.js` (Section 1, the `getElementById('gameCanvas')` return):

```js
      if (id === 'gameCanvas') {
        return {
          width: 600,
          height: 200,
          getContext: () => ({
```

Replace with:

```js
      if (id === 'gameCanvas') {
        return {
          width: 600,
          height: 200,
          style: {},
          getContext: () => ({
```

- [ ] **Step 4: Add `innerWidth: 600` to the `window` stub in `script.js`**

Find this in `script.js` (Section 1):

```js
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  };
```

Replace with:

```js
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    innerWidth: 600,
  };
```

- [ ] **Step 5: Add `initCanvasScale()` to `script.js`**

Find this in `script.js`:

```js
function startGameOnce() {
```

Add the new function immediately before it:

```js
function initCanvasScale() {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = Math.min(window.innerWidth, GAME_CONFIG.CANVAS_W);
  const cssH = Math.round(cssW / 3);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(canvas.width / 3);
  ctx.scale(canvas.width / GAME_CONFIG.CANVAS_W, canvas.height / GAME_CONFIG.CANVAS_H);
}

function startGameOnce() {
```

- [ ] **Step 6: Call `initCanvasScale()` after `ctx` is created**

Find this in `script.js`:

```js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const a11yLive = document.getElementById('a11y-live');
```

Replace with:

```js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
initCanvasScale();
const a11yLive = document.getElementById('a11y-live');
```

- [ ] **Step 7: Export `initCanvasScale` in the Node exports block**

Find this in `script.js`:

```js
  global.drawGameOverScreen = drawGameOverScreen;
```

Add immediately after it:

```js
  global.initCanvasScale = initCanvasScale;
```

- [ ] **Step 8: Remove `max-width` from `#game-wrapper` in `style.css`**

Find this in `style.css`:

```css
#game-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 600px;
  padding: 0 8px;
}
```

Replace with:

```css
#game-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 0 8px;
}
```

- [ ] **Step 9: Run to verify all 3 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "Canvas scaling\|initCanvasScale\|CANVAS_W"
```

Expected:

```
  PASSED: GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200
  PASSED: initCanvasScale sets bitmap width to cssW * dpr
  PASSED: initCanvasScale sets CSS display size
```

- [ ] **Step 10: Full regression check**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -5
```

Expected:

```
Total tests: 111
Passed: 111
All tests passed!
```

- [ ] **Step 11: Commit**

```bash
git add script.js style.css tests/game.test.js
git commit -m "feat(mobile-scaling): add initCanvasScale with DPR support"
```

---

## Verification checklist

After both tasks, confirm every spec requirement is covered:

- `GAME_CONFIG.CANVAS_W === 600` and `GAME_CONFIG.CANVAS_H === 200` — Task 1 Step 3
- All `canvas.width`/`canvas.height` reads in game logic replaced with constants — Task 1 Steps 4–5
- `initCanvasScale()` computes `cssW = min(innerWidth, 600)`, sizes bitmap to `cssW * dpr`, derives `canvas.height` from `canvas.width / 3`, applies `ctx.scale` — Task 2 Step 5
- Called once on load, before `startGameOnce` — Task 2 Step 6
- Node stubs have `style: {}` on canvas mock and `innerWidth: 600` on window — Task 2 Steps 3–4
- `max-width: 600px` removed from `#game-wrapper` — Task 2 Step 8
- `initCanvasScale` exported — Task 2 Step 7
- All 3 new tests pass; full suite 111/111 — Steps 9–10
