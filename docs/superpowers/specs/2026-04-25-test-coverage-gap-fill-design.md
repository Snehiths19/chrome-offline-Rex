# Test Coverage Gap Fill — Design Spec

**Date:** 2026-04-25
**Status:** Approved — ready for implementation planning
**Scope:** Pass 2 of 2. Fills the three test coverage gaps left out-of-scope by the visible UX polish pass (P5/PR #23). All changes are `script.js` (2-line export addition) and `tests/game.test.js` only.

---

## Context

PRs #19–23 completed a bug-fix pass (P1), feature registry (P2), live-tuning (P3), docs (P4), and visible UX polish (P5). The P5 spec explicitly deferred five test items to this pass. Two of those were completed as part of P5 implementation (HUD high-score rendering tests, hill colour interpolation tests). Three remain:

- `getBackgroundColor` interpolation — boundary and `reducedMotion` paths untested.
- `audio.land()` and `audio.death()` — short-circuit behaviours only covered by a "does not throw" bundle test, not individually.
- `announce()` — no tests; not exported.

---

## Section 1 — `getBackgroundColor` interpolation

**Existing coverage:** score 0 (`#ffffff`), score 350 (`#8d8d97`), score 400 (`#1a1a2e`), and stars-init at score 400.

**Gaps:**

### 1a. Boundary at DAY_NIGHT_START (score 300)

The formula uses `if (s < DAY_NIGHT_START) return '#ffffff'`, so score exactly 300 falls through to the interpolation path with `t = 0`. At `t = 0` the channels are `r = g = 255`, `b = 255`, which produces `#ffffff`. This is worth pinning as an explicit boundary regression guard.

Test: `getBackgroundColor(300) === '#ffffff'`

### 1b. reducedMotion snap

Under `reducedMotion`, the function returns `'#ffffff'` for any score in the `[DAY_NIGHT_START, DAY_NIGHT_END)` window (no interpolation), and `'#1a1a2e'` for score ≥ `DAY_NIGHT_END`. Currently no test exercises the `reducedMotion` path.

Tests:
- `getBackgroundColor(350)` under `reducedMotion = true` returns `'#ffffff'`
- `getBackgroundColor(400)` under `reducedMotion = true` returns `'#1a1a2e'`

**Note on `reducedMotion`:** It is a module-level `const` read once from `window.matchMedia`. In Node the stub returns `{ matches: false }`, so `reducedMotion === false` by default. Tests must temporarily set `global.reducedMotion = true` before the call and restore it after.

**Wait — `reducedMotion` is a `const`.** It cannot be reassigned. The correct approach is to replace the `const` declaration with a `let` in `script.js` **or** export it so tests can verify the snap behaviour through a different angle.

**Resolution:** Do not change the `const`. Instead, test the `reducedMotion` snap indirectly through `getHillColor`, which was already extracted as a pure function that accepts `score` and reads `reducedMotion` internally. Since `reducedMotion` cannot be overridden in Node (it's `const false`), the `reducedMotion` snap path for `getBackgroundColor` is **not testable without a script.js refactor** that is out of scope for this pass.

**Revised scope for Section 1:** 1 new test only — the `DAY_NIGHT_START` boundary (1a). The `reducedMotion` gap is noted as a known limitation; addressing it would require converting `reducedMotion` to a `let` or adding a seam, which is a separate refactor.

Files touched: `tests/game.test.js` — expand `Day/Night Cycle` describe block.

---

## Section 2 — `audio.land()` and `audio.death()`

**Existing coverage:** Both methods are called inside the "does not throw when ctx is unavailable" test and the "short-circuits in classic mode" test (which calls `jump`, `land`, and `death` together without isolating each). Neither has an individual test for its short-circuit path.

**What to add:** 4 new tests mirroring the existing `audio.jump()` isolation tests.

### 2a. `land()` short-circuits in classic mode

`land()` delegates to `blip()`, which has `if (this.muted || !isUpdatedMode()) return` before calling `ensure()`. In classic mode `isUpdatedMode()` returns false, so `ensure()` is never reached.

Test: spy on `audio.ensure`; call `audio.land()` in classic mode; assert `ensureCalls === 0`. Restore mode afterward.

### 2b. `land()` short-circuits when muted

Same spy pattern. Set `audio.setMuted(true)` before the call; assert `ensureCalls === 0`. Restore muted state afterward.

### 2c. `death()` short-circuits in classic mode

`death()` has its own `if (this.muted || !isUpdatedMode()) return` guard before calling `ensure()`. Same spy pattern in classic mode.

### 2d. `death()` short-circuits when muted

Same spy pattern with `audio.setMuted(true)`.

Files touched: `tests/game.test.js` — expand `Audio` describe block.

---

## Section 3 — `announce()`

**Current state:** `announce()` is not exported. `a11yLive` (the DOM reference it writes to) is not exported. No tests exist.

**Fix:** Add two lines to the Node test-exposure block in `script.js`:

```js
global.announce  = announce;
global.a11yLive  = a11yLive;
```

In Node, `a11yLive` is the stub object returned by `document.getElementById('a11y-live')` — a plain object with a writable `textContent` property. This makes both the function and its target observable from tests.

**Tests (2 new):**

- `announce('hello')` sets `a11yLive.textContent` to `'hello'`.
- A second call `announce('world')` overwrites `a11yLive.textContent` to `'world'`.

The null guard (`if (a11yLive && typeof a11yLive.textContent !== 'undefined')`) is already in the production code. In Node, `a11yLive` is always the stub (never null), so only the happy path is tested here. Testing the null guard would require a way to nullify `a11yLive` post-load, which is not worth the complexity.

Files touched: `script.js` — Node exports block (2 lines). `tests/game.test.js` — new `announce()` describe block.

---

## Architecture summary

| Section | Tests added | script.js change |
|---|---|---|
| `getBackgroundColor` boundary | 1 | none |
| `audio.land()` short-circuits | 2 | none |
| `audio.death()` short-circuits | 2 | none |
| `announce()` | 2 | 2-line export addition |
| **Total** | **7** | **2 lines** |

All changes are in `tests/game.test.js` (7 new tests) and `script.js` (2 lines in the Node exports block). No logic changes. No HTML or CSS changes.

---

## Verification checklist

- [ ] `getBackgroundColor(300)` returns `'#ffffff'` (boundary at DAY_NIGHT_START, `t = 0`).
- [ ] `audio.land()` does not call `ensure()` in classic mode.
- [ ] `audio.land()` does not call `ensure()` when muted.
- [ ] `audio.death()` does not call `ensure()` in classic mode.
- [ ] `audio.death()` does not call `ensure()` when muted.
- [ ] `announce('hello')` sets `a11yLive.textContent` to `'hello'`.
- [ ] `announce('world')` after `announce('hello')` overwrites `textContent` to `'world'`.
- [ ] `npm test` passes — count is exactly 7 more than the baseline on the branch this PR targets.
- [ ] No existing tests broken.
