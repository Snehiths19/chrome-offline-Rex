# Test Coverage Gap Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the three test coverage gaps deferred from the visible UX polish pass (P5): `announce()` tests, `getBackgroundColor` boundary test, and dedicated `audio.land()` / `audio.death()` short-circuit tests.

**Architecture:** Two files change — `script.js` gains a 2-line export addition so `announce` and `a11yLive` are reachable from tests; `tests/game.test.js` gains 7 new tests spread across three existing describe blocks and one new one. No logic changes in `script.js`.

**Tech Stack:** Vanilla JS, custom Node test harness (`describe`/`it`/`assert`/`assertEquals`). Node binary: `"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"` (standard `node` is not in PATH on this machine).

---

## File map

| File | Change |
|---|---|
| `script.js` | Add 2 lines to the Node exports block (lines 1217–1218 area) |
| `tests/game.test.js` | Task 1: new `announce()` describe block (2 tests). Task 2: 1 test inside `Day/Night Cycle`. Task 3: 4 tests inside `Audio (PR-B)`. |

---

## Task 1: Export `announce` + `a11yLive` and add `announce()` tests

**Files:**
- Modify: `script.js` (Node exports block, after line 1217)
- Modify: `tests/game.test.js` (new describe block before `// --- Test Summary ---` comment)

### Context

`announce()` writes a screen-reader message to `a11yLive.textContent`. Neither is exported, so tests cannot observe the side effect today. The fix is two export lines in `script.js`, plus two tests.

In Node, `a11yLive` is the stub object returned by `document.getElementById('a11y-live')`:
```js
{ addEventListener: () => {}, setAttribute: () => {}, dataset: {}, textContent: '' }
```
`textContent` is a writable plain property, so `announce('hello')` sets it to `'hello'` and we can read it back.

---

- [ ] **Step 1: Write the two failing tests**

Append this describe block to `tests/game.test.js`, immediately before the `// --- Test Summary ---` comment (which currently starts at line 1083):

```js
describe('announce() accessibility helper', () => {
  it('sets a11yLive.textContent to the announced message', () => {
    announce('hello');
    assertEquals(a11yLive.textContent, 'hello',
      'announce should write message to a11y live region');
  });

  it('overwrites textContent on repeated calls', () => {
    announce('first');
    announce('second');
    assertEquals(a11yLive.textContent, 'second',
      'second announce should overwrite the first');
  });
});

```

- [ ] **Step 2: Run to verify both tests fail**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A2 "announce"
```

Expected output contains:
```
FAILED: sets a11yLive.textContent to the announced message
FAILED: overwrites textContent on repeated calls
```
(Both fail with `ReferenceError: announce is not defined` because the export hasn't been added yet.)

- [ ] **Step 3: Add the two export lines to `script.js`**

Find the end of the Node exports block. The last two lines currently are:
```js
  global.loadTuning = loadTuning;
  global.saveTuning = saveTuning;
```

Add immediately after `global.saveTuning = saveTuning;`:
```js
  global.announce  = announce;
  global.a11yLive  = a11yLive;
```

The block should look like this after the edit:
```js
  global.cfg = cfg;
  global.loadTuning = loadTuning;
  global.saveTuning = saveTuning;
  global.announce  = announce;
  global.a11yLive  = a11yLive;
```

- [ ] **Step 4: Run tests and verify both pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep -A1 "announce"
```

Expected output contains:
```
announce() accessibility helper
  PASSED: sets a11yLive.textContent to the announced message
  PASSED: overwrites textContent on repeated calls
```

- [ ] **Step 5: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 80
Passed: 80
All tests passed!
```

- [ ] **Step 6: Commit**

```bash
git add script.js tests/game.test.js
git commit -m "test(coverage): export announce+a11yLive and add announce() tests"
```

---

## Task 2: `getBackgroundColor` boundary test at DAY_NIGHT_START

**Files:**
- Modify: `tests/game.test.js` (inside existing `Day/Night Cycle` describe block)

### Context

The existing tests cover score 0 (`#ffffff`), score 350 (`#8d8d97`), and score 400 (`#1a1a2e`). Score 300 is the boundary where the interpolation window begins. The code path is:

```js
// s < DAY_NIGHT_START (300) → returns '#ffffff' directly
// s >= DAY_NIGHT_END  (400) → returns '#1a1a2e' directly
// else: t = (s - 300) / (400 - 300) → interpolate
```

At score 300, `s < DAY_NIGHT_START` is `300 < 300` = false, so it falls through to interpolation with `t = 0`. At `t = 0`: `r = g = 255`, `b = 255` → `'#ffffff'`. This boundary pin guards against a future off-by-one breaking the transition start.

---

- [ ] **Step 1: Add the boundary test inside the existing `Day/Night Cycle` describe block**

Find this closing line in `tests/game.test.js`:
```js
  it('should return the correct interpolated color at score 350', () => {
    assertEquals(getBackgroundColor(350), '#8d8d97',
      `Score 350 (t=0.5) should produce midpoint color #8d8d97`);
  });
```

Insert the new test immediately after it (before the `it('should initialise stars...')` test):

```js
  it('returns #ffffff at DAY_NIGHT_START (score 300, t=0 boundary)', () => {
    assertEquals(getBackgroundColor(300), '#ffffff',
      'Score 300 is the first frame of the interpolation window — t=0 still produces white');
  });

```

- [ ] **Step 2: Run and verify the new test passes**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "DAY_NIGHT_START\|score 300"
```

Expected:
```
  PASSED: returns #ffffff at DAY_NIGHT_START (score 300, t=0 boundary)
```

- [ ] **Step 3: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 81
Passed: 81
All tests passed!
```

- [ ] **Step 4: Commit**

```bash
git add tests/game.test.js
git commit -m "test(coverage): pin getBackgroundColor boundary at DAY_NIGHT_START"
```

---

## Task 3: `audio.land()` and `audio.death()` short-circuit tests

**Files:**
- Modify: `tests/game.test.js` (inside existing `Audio (PR-B)` describe block)

### Context

`audio.land()` calls `this.blip()`, which has `if (this.muted || !isUpdatedMode()) return` before it ever calls `this.ensure()`. `audio.death()` has the same guard directly: `if (this.muted || !isUpdatedMode()) return`. Both functions are already called in the existing "does not throw" bundle test, but neither has an isolated short-circuit test. The pattern to follow is the existing `audio.jump()` spy tests.

The spy technique: temporarily replace `audio.ensure` with a counting function, call the audio method, restore `audio.ensure`, assert the count is 0.

---

- [ ] **Step 1: Add 4 tests inside the existing `Audio (PR-B)` describe block**

Find the closing `});` of the `Audio (PR-B)` block (currently after the `audio.jump() does not call ctx oscillator when muted` test, around line 503). Insert these 4 tests before that closing `});`:

```js
  it('audio.land() does not call ensure() in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.land();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Classic mode: land() should not reach ensure()');
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('audio.land() does not call ensure() when muted', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(true);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.land();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted: land() should not reach ensure()');
    audio.setMuted(false);
  });

  it('audio.death() does not call ensure() in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Classic mode: death() should not reach ensure()');
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('audio.death() does not call ensure() when muted', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(true);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted: death() should not reach ensure()');
    audio.setMuted(false);
  });

```

- [ ] **Step 2: Run and verify all 4 new tests pass**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | grep "land\|death"
```

Expected output contains all four:
```
  PASSED: audio.land() does not call ensure() in classic mode
  PASSED: audio.land() does not call ensure() when muted
  PASSED: audio.death() does not call ensure() in classic mode
  PASSED: audio.death() does not call ensure() when muted
```

- [ ] **Step 3: Verify no regressions**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1 | tail -6
```

Expected:
```
Total tests: 85
Passed: 85
All tests passed!
```

- [ ] **Step 4: Commit**

```bash
git add tests/game.test.js
git commit -m "test(coverage): dedicated short-circuit tests for audio.land() and audio.death()"
```

---

## Task 4: Regression check

**Files:** none (read-only verification)

- [ ] **Step 1: Run the full test suite**

```bash
"C:\Users\snehi\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" tests/game.test.js 2>&1
```

Expected final lines:
```
Total tests: 85
Passed: 85
All tests passed!
```

If the test count differs from 85, count the new tests manually: 2 (announce) + 1 (getBackgroundColor boundary) + 4 (audio.land/death) = 7 additions over the 78-test baseline. If the base branch already includes the P5 merge (88 tests), the expected count is 95.

- [ ] **Step 2: Verify all spec items are covered**

Check each item from the verification checklist in `docs/superpowers/specs/2026-04-25-test-coverage-gap-fill-design.md`:
- `getBackgroundColor(300)` returns `'#ffffff'` — covered by Task 2
- `audio.land()` does not call `ensure()` in classic mode — covered by Task 3
- `audio.land()` does not call `ensure()` when muted — covered by Task 3
- `audio.death()` does not call `ensure()` in classic mode — covered by Task 3
- `audio.death()` does not call `ensure()` when muted — covered by Task 3
- `announce('hello')` sets `a11yLive.textContent` to `'hello'` — covered by Task 1
- `announce('world')` overwrites to `'world'` — covered by Task 1
- No existing tests broken — confirmed by full suite pass
