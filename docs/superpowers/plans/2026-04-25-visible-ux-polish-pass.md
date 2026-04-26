# Visible UX Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 visible polish items (HUD redesign, hill colour interpolation, body background sync, micro-fixes) as a single `script.js`-only PR.

**Architecture:** All changes are confined to `script.js`. Three logical hunks — HUD redesign (font + score format + HI label), world visual fixes (hill colour + body background), micro-fixes (game-over "Best: 0" + dino animation in WAITING) — each independently reviewable but small enough to land as one PR.

**Tech Stack:** Vanilla JS, HTML5 Canvas, custom Node test harness (`node tests/game.test.js`).

---

## File map

| File | Role |
|---|---|
| `script.js` | Single source of truth — all 7 changes live here |
| `tests/game.test.js` | Existing test suite; tasks 3, 4, 5 add new `describe` blocks |

---

### Task 1: Add two config keys to GAME_CONFIG

**Files:**
- Modify: `script.js:158–160` (HUD section of `GAME_CONFIG`)

- [ ] **Step 1: Add the keys**

  In `GAME_CONFIG`, replace the existing HUD block:

  ```js
  // --- HUD ---
  SCORE_X_OFFSET:         150,    // pixels from right edge
  SCORE_Y:                 30,
  ```

  with:

  ```js
  // --- HUD ---
  SCORE_X_OFFSET:         150,    // pixels from right edge for the current-score label
  SCORE_Y:                 30,
  SCORE_HI_X_OFFSET:      110,    // additional px left of SCORE_X_OFFSET for the HI label
  SCORE_FONT_FAMILY:      "'Courier New', Courier, monospace",
  ```

- [ ] **Step 2: Run the test suite to confirm no regressions**

  ```
  node tests/game.test.js
  ```

  Expected: all existing tests pass (no test touches these keys directly).

- [ ] **Step 3: Commit**

  ```bash
  git add script.js
  git commit -m "feat(polish): add SCORE_FONT_FAMILY + SCORE_HI_X_OFFSET config keys"
  ```

---

### Task 2: Replace Arial with the monospace font stack everywhere

**Files:**
- Modify: `script.js` — 9 `ctx.font` assignments across 5 draw functions

The pattern is: `'NNpx Arial'` → `'NNpx ' + cfg('SCORE_FONT_FAMILY')`. Bold variants follow the same rule: `'bold NNpx Arial'` → `'bold NNpx ' + cfg('SCORE_FONT_FAMILY')`.

- [ ] **Step 1: Update `drawScore` (line ~652)**

  Change:
  ```js
  ctx.font = '20px Arial';
  ```
  To:
  ```js
  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ```

- [ ] **Step 2: Update `drawGetReadyOverlay` (lines ~673, ~675, ~680)**

  Change:
  ```js
  ctx.font = '28px Arial';
  ```
  To:
  ```js
  ctx.font = '28px ' + cfg('SCORE_FONT_FAMILY');
  ```

  Change:
  ```js
  ctx.font = '14px Arial';
  ```
  To:
  ```js
  ctx.font = '14px ' + cfg('SCORE_FONT_FAMILY');
  ```

  Change:
  ```js
  ctx.font = '48px Arial';
  ```
  To:
  ```js
  ctx.font = '48px ' + cfg('SCORE_FONT_FAMILY');
  ```

- [ ] **Step 3: Update `drawGameOverScreen` (lines ~692, ~695, ~699)**

  Change:
  ```js
  ctx.font = '40px Arial';
  ```
  To:
  ```js
  ctx.font = '40px ' + cfg('SCORE_FONT_FAMILY');
  ```

  Change (first `'20px Arial'` inside this function):
  ```js
  ctx.font = '20px Arial';
  ```
  To:
  ```js
  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ```

  Change:
  ```js
  ctx.font = '16px Arial';
  ```
  To:
  ```js
  ctx.font = '16px ' + cfg('SCORE_FONT_FAMILY');
  ```

- [ ] **Step 4: Update `drawMilestoneFlash` (line ~709)**

  Change:
  ```js
  ctx.font = 'bold 22px Arial';
  ```
  To:
  ```js
  ctx.font = 'bold 22px ' + cfg('SCORE_FONT_FAMILY');
  ```

- [ ] **Step 5: Update `drawNewBestBadge` (line ~721)**

  Change:
  ```js
  ctx.font = 'bold 14px Arial';
  ```
  To:
  ```js
  ctx.font = 'bold 14px ' + cfg('SCORE_FONT_FAMILY');
  ```

- [ ] **Step 6: Verify no remaining Arial references**

  ```bash
  grep -n "Arial" script.js
  ```

  Expected: no output.

- [ ] **Step 7: Run the test suite**

  ```
  node tests/game.test.js
  ```

  Expected: all existing tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add script.js
  git commit -m "feat(polish): replace Arial with monospace font stack across all HUD text"
  ```

---

### Task 3: Zero-padded score + HI label in `drawScore` (TDD)

**Files:**
- Modify: `script.js:638–656` (`drawScore`)
- Modify: `tests/game.test.js` (add describe block before the final line)

- [ ] **Step 1: Write the failing tests**

  Append this describe block to `tests/game.test.js` (before the closing of the file, after the last `});`):

  ```js
  describe('HUD score format (polish pass)', () => {
    it('score renders as zero-padded 5-digit string without "Score:" prefix', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origScore = game.score;
      const origPop = game.scorePopFrames;
      game.score = 42;
      game.scorePopFrames = 0;
      drawScore();
      ctx.fillText = origFill;
      game.score = origScore;
      game.scorePopFrames = origPop;
      assert(calls.some(t => t === '00042'),
        `Expected '00042' in HUD calls, got: ${JSON.stringify(calls)}`);
      assert(!calls.some(t => t.includes('Score:')),
        `Expected no 'Score:' prefix, got: ${JSON.stringify(calls)}`);
    });

    it('HI label appears in HUD when highScore > 0', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origHS = game.highScore;
      const origScore = game.score;
      const origPop = game.scorePopFrames;
      game.highScore = 150;
      game.score = 42;
      game.scorePopFrames = 0;
      drawScore();
      ctx.fillText = origFill;
      game.highScore = origHS;
      game.score = origScore;
      game.scorePopFrames = origPop;
      assert(calls.some(t => t.startsWith('HI ')),
        `Expected 'HI ...' label in HUD, got: ${JSON.stringify(calls)}`);
    });

    it('HI label absent when highScore is 0', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origHS = game.highScore;
      const origScore = game.score;
      const origPop = game.scorePopFrames;
      game.highScore = 0;
      game.score = 42;
      game.scorePopFrames = 0;
      drawScore();
      ctx.fillText = origFill;
      game.highScore = origHS;
      game.score = origScore;
      game.scorePopFrames = origPop;
      assert(!calls.some(t => t.startsWith('HI ')),
        `Expected no 'HI ...' label when highScore is 0, got: ${JSON.stringify(calls)}`);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```
  node tests/game.test.js
  ```

  Expected: the three new tests FAIL (score still renders as `'Score: 42'`, no `HI` label).

- [ ] **Step 3: Implement the new `drawScore`**

  Replace the entire `drawScore` function in `script.js`:

  ```js
  function drawScore() {
    const popping = game.scorePopFrames > 0 && isUpdatedMode() && !reducedMotion;
    if (popping) {
      // Brief 1.0 → 1.4 ease-out scale around the score's centre on death.
      const t = game.scorePopFrames / GAME_CONFIG.SCORE_POP_FRAMES; // 1 → 0
      const scale = 1 + t * 0.4;
      const cx = canvas.width - GAME_CONFIG.SCORE_X_OFFSET + 30;
      const cy = GAME_CONFIG.SCORE_Y - 8;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    const color = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
    ctx.fillStyle = color;
    ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
    ctx.textAlign = 'left';
    ctx.fillText(
      String(Math.floor(game.score)).padStart(5, '0'),
      canvas.width - GAME_CONFIG.SCORE_X_OFFSET,
      GAME_CONFIG.SCORE_Y
    );
    if (game.highScore > 0) {
      ctx.fillText(
        'HI ' + String(game.highScore).padStart(5, '0'),
        canvas.width - GAME_CONFIG.SCORE_X_OFFSET - GAME_CONFIG.SCORE_HI_X_OFFSET,
        GAME_CONFIG.SCORE_Y
      );
    }
    if (popping) ctx.restore();
  }
  ```

  Note: `cx` changed from `+ 50` to `+ 30` to re-centre the pop animation on the shorter 5-digit field.

- [ ] **Step 4: Run tests to confirm they pass**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass, including the 3 new ones.

- [ ] **Step 5: Commit**

  ```bash
  git add script.js tests/game.test.js
  git commit -m "feat(polish): zero-padded score + HI label in HUD"
  ```

---

### Task 4: Game over screen — format + "Best: 0" gate (TDD)

**Files:**
- Modify: `script.js:685–701` (`drawGameOverScreen`)
- Modify: `tests/game.test.js` (add describe block)

- [ ] **Step 1: Write the failing tests**

  Append to `tests/game.test.js`:

  ```js
  describe('Game over screen (polish pass)', () => {
    it('score on game over screen is zero-padded', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origScore = game.score;
      game.score = 87;
      drawGameOverScreen();
      ctx.fillText = origFill;
      game.score = origScore;
      assert(calls.some(t => t === '00087'),
        `Expected '00087' on game over screen, got: ${JSON.stringify(calls)}`);
      assert(!calls.some(t => t.includes('Score:')),
        `Expected no 'Score:' prefix on game over screen, got: ${JSON.stringify(calls)}`);
    });

    it('Best line hidden when highScore is 0', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origHS = game.highScore;
      game.highScore = 0;
      drawGameOverScreen();
      ctx.fillText = origFill;
      game.highScore = origHS;
      assert(!calls.some(t => t.toLowerCase().includes('best')),
        `Expected no Best line when highScore is 0, got: ${JSON.stringify(calls)}`);
    });

    it('Best line shown when highScore > 0', () => {
      const calls = [];
      const origFill = ctx.fillText;
      ctx.fillText = (text) => calls.push(String(text));
      const origHS = game.highScore;
      game.highScore = 250;
      drawGameOverScreen();
      ctx.fillText = origFill;
      game.highScore = origHS;
      assert(calls.some(t => t.toLowerCase().includes('best')),
        `Expected Best line when highScore > 0, got: ${JSON.stringify(calls)}`);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```
  node tests/game.test.js
  ```

  Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement the updated `drawGameOverScreen`**

  Replace the entire function:

  ```js
  function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    ctx.font = '40px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText(String(Math.floor(game.score)).padStart(5, '0'), canvas.width / 2, canvas.height / 2 - 10);

    if (game.highScore > 0) {
      ctx.fillText('BEST: ' + String(game.highScore).padStart(5, '0'), canvas.width / 2, canvas.height / 2 + 20);
    }

    ctx.font = '16px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 55);
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add script.js tests/game.test.js
  git commit -m "feat(polish): game over score zero-padded; hide Best line on first run"
  ```

---

### Task 5: Extract `getHillColor` helper + interpolate day→night (TDD)

**Files:**
- Modify: `script.js:543–565` (`drawHills`) — call the new helper
- Modify: `script.js` — add `getHillColor` immediately before `drawHills`
- Modify: `script.js:1170+` (Section 10 test exposure) — export `getHillColor`
- Modify: `tests/game.test.js` (add describe block)

Background: `getBackgroundColor(score)` already mirrors this pattern — check it around line 471 as a reference for style.

- [ ] **Step 1: Write the failing tests**

  Append to `tests/game.test.js`:

  ```js
  describe('Hill colour interpolation (polish pass)', () => {
    it('returns HILL_COLOR_DAY below DAY_NIGHT_START', () => {
      assertEquals(getHillColor(0),   GAME_CONFIG.HILL_COLOR_DAY, 'score 0 → day colour');
      assertEquals(getHillColor(299), GAME_CONFIG.HILL_COLOR_DAY, 'score 299 → day colour');
    });

    it('returns HILL_COLOR_NIGHT at or above DAY_NIGHT_END', () => {
      assertEquals(getHillColor(400),  GAME_CONFIG.HILL_COLOR_NIGHT, 'score 400 → night colour');
      assertEquals(getHillColor(1000), GAME_CONFIG.HILL_COLOR_NIGHT, 'score 1000 → night colour');
    });

    it('returns a valid interpolated hex colour in the transition window', () => {
      const mid = getHillColor(350); // midpoint between 300 and 400
      assert(mid !== GAME_CONFIG.HILL_COLOR_DAY,   'midpoint should not be day colour');
      assert(mid !== GAME_CONFIG.HILL_COLOR_NIGHT,  'midpoint should not be night colour');
      assert(/^#[0-9a-f]{6}$/.test(mid),           'must be a valid lowercase 6-digit hex colour');
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```
  node tests/game.test.js
  ```

  Expected: 3 new tests FAIL with "getHillColor is not defined".

- [ ] **Step 3: Add `getHillColor` immediately before `drawHills` (~line 543)**

  Insert this function:

  ```js
  function getHillColor(score) {
    if (score < GAME_CONFIG.DAY_NIGHT_START) return GAME_CONFIG.HILL_COLOR_DAY;
    if (score >= GAME_CONFIG.DAY_NIGHT_END)  return GAME_CONFIG.HILL_COLOR_NIGHT;
    if (reducedMotion) return GAME_CONFIG.HILL_COLOR_DAY; // snap — stays day until DAY_NIGHT_END
    const t = (score - GAME_CONFIG.DAY_NIGHT_START) /
              (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
    const parseHex = hex => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const day   = parseHex(GAME_CONFIG.HILL_COLOR_DAY);
    const night = parseHex(GAME_CONFIG.HILL_COLOR_NIGHT);
    const r = Math.round(day[0] + (night[0] - day[0]) * t);
    const g = Math.round(day[1] + (night[1] - day[1]) * t);
    const b = Math.round(day[2] + (night[2] - day[2]) * t);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  ```

- [ ] **Step 4: Update `drawHills` to call the helper**

  Replace the colour-selection line in `drawHills`:

  ```js
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START
    ? GAME_CONFIG.HILL_COLOR_NIGHT
    : GAME_CONFIG.HILL_COLOR_DAY;
  ```

  With:

  ```js
  ctx.fillStyle = getHillColor(game.score);
  ```

- [ ] **Step 5: Export `getHillColor` in Section 10 (test exposure)**

  Find the block starting with `if (typeof process !== 'undefined'...` near line 1170. Add this line alongside the other `global.getBackgroundColor` export:

  ```js
  global.getHillColor = getHillColor;
  ```

- [ ] **Step 6: Run tests to confirm they pass**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add script.js tests/game.test.js
  git commit -m "feat(polish): hill colour interpolates smoothly during day→night transition"
  ```

---

### Task 6: Body background syncs with canvas day/night

**Files:**
- Modify: `script.js:1037–1053` (WAITING branch of `gameLoop`)
- Modify: `script.js:1086` (RUNNING branch of `gameLoop`, after `drawBackground()`)
- Modify: `script.js:978–1007` (`resetGame`)

No test: the Node stub for `document` does not include `document.body`, so a DOM test would require restructuring the stub. Manual verification covers this (checklist at end of plan).

The implementation must guard against the missing `body` in Node — use `if (document.body)`.

- [ ] **Step 1: Add body sync in the WAITING branch**

  The WAITING branch currently reads:

  ```js
  if (game.state === STATE.WAITING) {
    game.graceFrames--;
    if (game.graceFrames <= 0) {
      game.state = STATE.RUNNING;
      announce('Go!');
    }
    drawBackground();
    drawHills();
    ...
  ```

  Add one line immediately after `drawBackground()`:

  ```js
    drawBackground();
    if (document.body) document.body.style.background = getBackgroundColor(game.score);
    drawHills();
  ```

- [ ] **Step 2: Add body sync in the RUNNING branch**

  The RUNNING branch calls `drawBackground()` around line 1086. Add the sync line immediately after it:

  ```js
    drawBackground();
    if (document.body) document.body.style.background = getBackgroundColor(game.score);
    runFeatureUpdates();
  ```

- [ ] **Step 3: Reset the body background in `resetGame`**

  `resetGame` is around line 978. Add this line near the end of the function, after the `announce(...)` call:

  ```js
    announce('New game. Press space or tap to jump.');
    if (document.body) document.body.style.background = '';
  ```

- [ ] **Step 4: Run tests**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass (the guard prevents any exception in Node).

- [ ] **Step 5: Commit**

  ```bash
  git add script.js
  git commit -m "feat(polish): page background syncs with canvas day/night colour"
  ```

---

### Task 7: Dino runs in place during WAITING countdown

**Files:**
- Modify: `script.js:1038` (WAITING branch of `gameLoop`)

- [ ] **Step 1: Add `game.animFrame++` to the WAITING branch**

  The WAITING branch starts at ~line 1037. Currently:

  ```js
  if (game.state === STATE.WAITING) {
    game.graceFrames--;
    if (game.graceFrames <= 0) {
  ```

  Change to:

  ```js
  if (game.state === STATE.WAITING) {
    game.graceFrames--;
    game.animFrame++;
    if (game.graceFrames <= 0) {
  ```

- [ ] **Step 2: Run tests**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add script.js
  git commit -m "feat(polish): dino animates during GET READY countdown"
  ```

---

### Task 8: Regression check + manual playtest

**Files:** none — verification only.

- [ ] **Step 1: Full test suite**

  ```
  node tests/game.test.js
  ```

  Expected: all tests pass. Count of tests should be at least 9 more than before this PR (3 HUD format tests + 2 game over tests + 3 hill colour tests + 2 carried-over test-count increase from prior tasks rounding to the describe boundary).

- [ ] **Step 2: Manual playtest checklist** (open `http://localhost:8080` via `npm run serve`)

  - [ ] Score displays as `00000`–`99999` (zero-padded, no "Score: " prefix).
  - [ ] All canvas text uses monospace font (GET READY, countdown, game over, milestone flash, NEW BEST badge).
  - [ ] `HI NNNNN` label appears in HUD after the first death; absent on a truly first run (clear localStorage first: `localStorage.clear()` in DevTools → reload).
  - [ ] Hill colour fades gradually from grey to dark blue between score 300 and 400 (reach score 300+ to verify).
  - [ ] Page background transitions to dark alongside the canvas during night.
  - [ ] Refreshing the page (back to WAITING) restores the body background to the CSS default (light grey surround).
  - [ ] Game over screen hides the "BEST" line on a fresh-localStorage first run; shows it on subsequent runs.
  - [ ] Dino runs in place during the GET READY countdown (visually animated, not frozen).
  - [ ] `reducedMotion` (toggle in OS accessibility settings): hill colour snaps at score 400 instead of interpolating; body background still syncs; particles still absent.
  - [ ] Classic mode: no regressions — font, score format, and micro-fixes apply equally.
  - [ ] Updated mode at high score (score 300+): sky tint, confetti, speed trail, milestone flash all still work.

- [ ] **Step 3: Push and open PR**

  ```bash
  git push origin initial-chrome-dino-game
  ```

  Open a PR from `initial-chrome-dino-game` targeting the repo's default branch. Title suggestion: `feat(polish): HUD redesign, hill interpolation, body sync, micro-fixes (P5)`.
