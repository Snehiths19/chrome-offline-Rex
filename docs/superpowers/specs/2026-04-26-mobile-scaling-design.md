# Mobile Scaling — Design Spec

**Goal:** Make Rex Run render crisply on high-DPI mobile screens and scale to fill the device width, without changing game logic or gameplay.

**Architecture:** One new function `initCanvasScale()` called once on page load. Two new constants `CANVAS_W: 600` and `CANVAS_H: 200` in `GAME_CONFIG` replace all `canvas.width`/`canvas.height` reads in game logic. Canvas bitmap is sized to `cssWidth × devicePixelRatio` for crisp rendering; `ctx.scale` maps 600×200 logical coordinates to the new bitmap. Canvas aspect ratio (3:1) and all gameplay physics stay unchanged. No resize on orientation change — sized once on load.

**Tech Stack:** Vanilla JS, canvas 2D API (600×200 internal resolution). Custom Node test harness.

---

## Problem

The canvas bitmap is fixed at 600×200 pixels. On a 390px-wide iPhone 14 (2× retina), the browser displays it at 780 physical pixels but only has 600 bitmap pixels — resulting in blurry rendering. On a 768px iPad, the 600px max-width cap leaves horizontal space unused.

---

## State machine

No state machine changes. `initCanvasScale` runs before `startGameOnce` and does not interact with `game.state`.

---

## `initCanvasScale()`

New function, called once immediately after `const ctx = canvas.getContext('2d')`:

```js
function initCanvasScale() {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = Math.min(window.innerWidth, 600);
  const cssH = Math.round(cssW / 3);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(canvas.width / 3); // derive from bitmap width to keep exact 3:1
  ctx.scale(canvas.width / GAME_CONFIG.CANVAS_W, canvas.height / GAME_CONFIG.CANVAS_H);
}
```

**Order matters:** `canvas.width = ...` resets the context transform, so `ctx.scale` must come after. After `initCanvasScale` returns, all drawing calls continue to use 600×200 logical coordinates — only the display layer changes.

**Desktop cap:** `Math.min(window.innerWidth, 600)` keeps the 600px cap on wide screens. On phones narrower than 600px, the canvas fills the full device width.

---

## `GAME_CONFIG` constants

Add to `GAME_CONFIG` (already exported to tests):

```js
CANVAS_W: 600,
CANVAS_H: 200,
```

---

## `canvas.width` / `canvas.height` replacements

All reads of `canvas.width` and `canvas.height` in game logic are replaced with `GAME_CONFIG.CANVAS_W` and `GAME_CONFIG.CANVAS_H`. Approximately 15 occurrences across:

- Background clear (`ctx.fillRect`)
- Cloud spawn x and respawn x
- Hill slot calculation
- Obstacle spawn gate
- Score HUD x position
- `drawIdleScreen`, `drawGetReadyOverlay`, `drawGameOverScreen` overlay centers

After the replacement, `canvas.width` and `canvas.height` are **only written** inside `initCanvasScale`.

---

## CSS change

Remove `max-width: 600px` from `#game-wrapper` in `style.css`. `initCanvasScale` sets `canvas.style.width` as an inline style, making the wrapper's max-width constraint irrelevant and potentially conflicting on tablets.

---

## Export for tests

In the Node exports block at the bottom of `script.js`:

```js
global.initCanvasScale = initCanvasScale;
```

---

## Testing

New `describe('Canvas scaling', ...)` block in `tests/game.test.js`. Three tests (108 → 111):

1. **`GAME_CONFIG.CANVAS_W` and `CANVAS_H` are correct** — assert `GAME_CONFIG.CANVAS_W === 600` and `GAME_CONFIG.CANVAS_H === 200`.

2. **`initCanvasScale` sets bitmap dimensions** — set `window.innerWidth = 390` and `window.devicePixelRatio = 2`; call `initCanvasScale()`; assert `canvas.width === 780` and `canvas.height === 260`; restore originals.

3. **`initCanvasScale` sets CSS display size** — same setup; assert `canvas.style.width === '390px'` and `canvas.style.height === '130px'`; restore originals.

All 108 existing tests must pass unchanged — game logic reads `GAME_CONFIG.CANVAS_W` (value: 600) instead of `canvas.width` (also 600 at test time), so behavior is identical.

---

## Out of scope

- Dynamic resize on orientation change — size once on load; users reload if they rotate
- Canvas aspect ratio change on portrait mobile — keep 3:1 to preserve jump physics
- Raising the 600px desktop cap for tablets — can be a follow-up tweak to `initCanvasScale`
- Animated or parallax background at higher resolutions — v1.1
