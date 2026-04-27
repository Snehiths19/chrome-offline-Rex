# Idle Screen — Design Spec

**Goal:** Replace the auto-starting countdown with a true first-load idle state: the game waits for the player to initiate before the GET READY countdown begins.

**Architecture:** One new `STATE.IDLE` constant. Page loads into `STATE.IDLE`. `handleAction()` transitions to the existing `STATE.WAITING` countdown on first input. `resetGame()` continues going to `STATE.WAITING` directly — restarts after death are unaffected. New `drawIdleScreen()` function; all changes in `script.js`.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200). Custom Node test harness.

---

## State machine

```
First load:   IDLE → [tap/space] → WAITING → RUNNING → DEAD → [tap] → WAITING → ...
Restart:                           WAITING → RUNNING → DEAD → [tap] → WAITING → ...
```

`STATE.IDLE` is entered only on the initial page load. `resetGame()` always transitions to `STATE.WAITING`, preserving the existing restart flow.

---

## New `STATE.IDLE` constant

Add alongside existing constants in the `STATE` object (Section 2):

```js
IDLE: 'IDLE',
```

---

## Initial game state

Change the initial `game.state` (Section 4) from `STATE.WAITING` to `STATE.IDLE`:

```js
state:       STATE.IDLE,
graceFrames: 0,
```

`graceFrames` starts at `0` — the countdown has not begun. `resetGame()` sets both fields when the player restarts, so the idle path and the restart path stay independent.

---

## `handleAction()` update

Add a branch for `STATE.IDLE` before (or alongside) the existing branches:

```js
if (game.state === STATE.IDLE) {
  game.state      = STATE.WAITING;
  game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  return;
}
```

No other changes to `handleAction()`.

---

## `drawIdleScreen()`

New function, placed alongside `drawGetReadyOverlay()` in the render section (Section 5):

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

Called in the game loop render phase when `game.state === STATE.IDLE`.

---

## Game loop render update

In the render section of `gameLoop()`, add the `STATE.IDLE` case alongside the existing overlay calls:

```js
if (game.state === STATE.IDLE)    drawIdleScreen();
if (game.state === STATE.WAITING) drawGetReadyOverlay();
if (game.state === STATE.DEAD)    drawGameOverScreen();
```

---

## Export for tests

In the Node exports block at the bottom of `script.js`:

```js
global.drawIdleScreen = drawIdleScreen;
```

---

## Testing

New `describe('Idle screen', ...)` block in `tests/game.test.js`. Four tests (113 → 117):

1. **`drawIdleScreen` does not throw** — call `drawIdleScreen()`; assert no throw
2. **`drawIdleScreen` renders game title** — spy on `ctx.fillText`; assert `calls.some(t => t === 'REX RUN')`
3. **`drawIdleScreen` renders start prompt** — assert `calls.some(t => t === 'TAP / PRESS SPACE TO START')`
4. **`handleAction` in `STATE.IDLE` transitions to `STATE.WAITING`** — set `game.state = STATE.IDLE`; call `handleAction()`; assert `game.state === STATE.WAITING` and `game.graceFrames === GAME_CONFIG.GRACE_FRAMES`; restore state

---

## Out of scope

- Animated idle (dino bounce, pulsing text) — v1.1
- "First run only" tutorial text or hints — v1.1
- Idle timeout (auto-start after inactivity) — not planned
