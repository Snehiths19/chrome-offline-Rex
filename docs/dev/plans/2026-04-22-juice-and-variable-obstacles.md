# Juice Pass + Variable Obstacles

**Date:** 2026-04-22
**Status:** Planning — awaiting approval

## Context

The game currently feels mechanically and sensorially flat in two ways:

1. **Obstacles are monotonous.** Every obstacle is the same 20×40 cactus sprite. Spacing follows a deterministic formula (`MAX_SPAWN_GAP - (speed - INITIAL_SPEED) × 100`, clamped to `MIN_SPAWN_GAP`), so at any given speed the gap is always identical. The rhythm is predictable and reads as "metronome."
2. **No tactile feedback.** Jumping, landing, scoring milestones, and dying are all silent and un-particle'd. Death is a 12-frame canvas shake with no flash or sound.

This plan addresses both: introduce obstacle variety + spacing jitter, then a juice pass (particles, synthesised SFX, death flash). Music is explicitly out of scope for v1 — procedurally-generated SFX via Web Audio API avoids adding asset files.

---

## Part A — Variable obstacles

### Obstacle taxonomy

Three ground-based types (no ducking mechanic required):

| Type        | Width × Height | Unlock score | Weight (before cap) | Notes |
|-------------|----------------|--------------|---------------------|-------|
| `smallCactus` | 20 × 40 | 0 | 50 | current cactus — baseline |
| `bigCactus`   | 28 × 55 | 100 | 30 | taller; tighter jump timing |
| `cactusCluster` | 50 × 40 | 250 | 20 | 2–3 small cacti glued together; wider object, same height |

Weights shift with score so later runs see more variety:
- `score < 100`: only `smallCactus`
- `100 ≤ score < 250`: 70% small, 30% big
- `score ≥ 250`: 50 / 30 / 20 (small / big / cluster)

Pick via `game.rng()` (seeded — see below) against cumulative weights.

### Spacing jitter

Replace the current deterministic gap threshold with a randomized range:

```
baseGap = clamp(MAX_SPAWN_GAP - (speed - INITIAL_SPEED) × SPAWN_GAP_SPEED_FACTOR,
                MIN_SPAWN_GAP, MAX_SPAWN_GAP)
actualGap = baseGap × (1 + rng.range(-0.25, 0.25))  // ±25% jitter
```

Store `nextSpawnAt` on `game` the moment an obstacle spawns, so the spawn decision becomes `game.lastObstacleX <= canvas.width - game.nextSpawnGap`. This keeps collision-safety guarantees (jitter range chosen so the smallest possible gap is still clearable by a standard jump).

**Reachability check**: smallest jitter'd gap at cap speed = `MIN_SPAWN_GAP × 0.75 = 255px`. A full jump covers ~384px horizontally at cap speed (airtime ≈ 50 frames × 5px/frame + width). Comfortably clearable. Worth adding a unit test asserting this.

### Seeded RNG

Add a tiny mulberry32 PRNG (~10 LOC) on `game.rng`. Re-seeded in `resetGame()` from `Date.now()`. Enables:
- Deterministic test fixtures.
- Future "daily seed" feature without refactoring.

### Sprite assets

For v1, render `bigCactus` and `cactusCluster` from the existing `cactus.png` by drawing the sprite scaled / tiled, so no new asset files are required. If authored sprites show up later, swap via a small lookup table in `drawObstacles`.

### Files touched (Part A)

- `script.js`
  - `GAME_CONFIG`: add `OBSTACLE_TYPES` table, `SPAWN_GAP_JITTER` (= 0.25).
  - New helpers: `pickObstacleType(score, rng)`, `mulberry32(seed)`.
  - `spawnObstacle()` now takes a type, sets width/height/drawMode accordingly.
  - `drawObstacles()` branches on obstacle.type: `smallCactus` → unchanged; `bigCactus` → `drawImage` with scaled h×w; `cactusCluster` → two `drawImage` calls side by side.
  - Game loop spawn block: switch to `game.nextSpawnGap` stored on reset.
  - `resetGame()`: reseed `game.rng`, clear `game.nextSpawnGap`.

- `tests/game.test.js`
  - Weight-distribution test: 10k rolls at score 400 stay within ±3% of declared weights.
  - Jitter-bounds test: sampled gaps always fall within `[baseGap × 0.75, baseGap × 1.25]`.
  - Reachability test: smallest possible gap is >= max horizontal jump distance at cap speed.
  - Update existing gap-enforcement test to accept the jittered range.

---

## Part B — Juice pass

### B1. Particles (canvas-based, no deps)

Add a tiny particle system: a pool of ~60 particle objects with `{ x, y, vx, vy, life, maxLife, color, size }`. Drawn as filled circles.

**Emit points:**
- **Jump takeoff** — 4–6 dust particles at dino's feet, low upward + sideways velocity. Grey/brown palette.
- **Landing** — 8–10 particles on touchdown, stronger sideways spread. Only when landing at normal velocity (not death).
- **Collision** — 20+ particles burst radially from collision point, red/orange palette.
- **Speed trail** — at cap speed (or within 10% of it), one faint particle per frame trailing behind dino.

**Respect reduced motion**: if `reducedMotion`, skip all emits (or emit half the count with longer lifetime, TBD — probably just skip).

### B2. Sound effects (Web Audio synthesis, no asset files)

Thin wrapper module at top of `script.js` (behind a `typeof window !== 'undefined' && window.AudioContext` guard):

```js
const audio = {
  ctx: null,
  ensure() { if (!this.ctx) this.ctx = new AudioContext(); return this.ctx; },
  blip(freq, duration, type = 'sine', gain = 0.05) { ... },
  jump()   { this.blip(400 + rand(-20, 20), 0.08, 'sine', 0.04); },
  land()   { this.blip(120, 0.05, 'sine', 0.05); },
  milestone() { this.blip(880, 0.1, 'triangle'); setTimeout(() => this.blip(1320, 0.1, 'triangle'), 80); },
  death()  { /* downward freq sweep on sawtooth */ },
};
```

**Browser autoplay policy**: `AudioContext` must be created after a user gesture. Initialise it on the first `handleAction()` call (any input unlocks audio). Before that, `audio.jump()` et al. no-op.

**Mute control**: add a mute button in `index.html` (top-right corner of canvas wrapper). Persist `localStorage['dino-muted']`. Default off.

### B3. Death flash + chromatic shift

On collision:
- Start a 6-frame white flash overlay (`fillStyle = 'rgba(255,255,255,alpha)'` full-canvas, alpha ramps 1 → 0).
- Increase death shake amplitude for first 3 frames (already exists — bump `DEATH_SHAKE_AMPLITUDE` from 4 to 7 for those frames).
- Cheap "chromatic aberration": draw `drawDino` three times offset by ±2px horizontally with red/blue tint via `globalCompositeOperation = 'screen'` — only on the first 3 post-death frames. Dropped if perf budget tight.

### B4. Score milestone celebration

At each level-up (existing "LEVEL X" flash), additionally:
- Emit a 20-particle confetti-like burst from the score HUD position (gold palette).
- Fire `audio.milestone()`.

### B5. Reduced-motion consideration

All Part B effects respect `reducedMotion`:
- Particles: skipped entirely.
- SFX: unaffected (sound is not motion).
- Death flash: kept but capped at one frame, no chromatic aberration.
- Milestone confetti: replaced with a simple text pop.

### Files touched (Part B)

- `script.js`
  - New sections: `audio`, `particles` (pool + `emit(kind, x, y)` + `updateParticles()` + `drawParticles()`).
  - Hook emits into `jump()`, landing branch of gameLoop, collision branch, milestone branch.
  - Death flash state on `game`: `deathFlashFrames`.
  - Call `audio.ensure()` in `handleAction()` to unlock audio.

- `index.html`
  - Add `<button id="mute-btn" aria-label="Mute sound">🔊</button>` (or SVG icon). Positioned absolute over the canvas top-right.

- `style.css`
  - Position + hover/focus states for `#mute-btn`.

- `tests/game.test.js`
  - Particle pool: emit/update/expire lifecycle test.
  - Audio guard: `audio.jump()` with no AudioContext is a no-op and doesn't throw.
  - Death flash lifecycle: 6 frames, counts down, zero when DEAD sub-state passes.

---

## Implementation phases

Ship small, land each phase on its own PR. Each phase keeps tests passing.

1. **RNG + spacing jitter** (~1 h). Minimal visual change; validates seeded RNG path + test updates.
2. **Obstacle types + scaled rendering** (~2 h). First real "variety" moment.
3. **Particle system + takeoff/landing emits** (~2 h).
4. **Collision particles + death flash** (~1 h).
5. **Web Audio SFX + mute button** (~2 h). Independent, could also be phase 3.
6. **Milestone confetti + audio** (~45 min).
7. **Polish pass**: adjust weights, jitter, particle counts, volumes from playtesting (~1 h).

Total: ~10 hours. Phases 1 and 2 together deliver the variety the user noticed; phases 3–7 deliver juice.

---

## Open questions (for the user)

1. **Web Audio SFX vs. sample files?** Synthesis means no asset downloads but the sounds are a bit chiptune. Sample files give nicer tones but add ~100 KB. I'd suggest synthesis for v1, revisit later.
2. **Adaptive music**: still out of scope? The scope here is SFX only; music is a bigger lift.
3. **Mute default**: off (sound on) or on (sound off)? Mobile users may prefer sound-off by default.
4. **Ducking / pterodactyls**: explicitly *not* in this plan, per today's conversation. Flag if you want it folded in — would restructure Part A.

---

## Verification

- `npm test` — all existing 23 tests + ~6 new tests pass.
- Manual playtest checklist:
  - [ ] Three obstacle types appear at their score thresholds.
  - [ ] Spacing feels less metronomic; no unreachable gaps after 10 runs to score 1000+.
  - [ ] Jump and land puff dust on every jump.
  - [ ] Death produces a flash + particle burst.
  - [ ] Milestone flash pops confetti and plays a ding.
  - [ ] Mute button silences audio and persists across reload.
  - [ ] With OS reduce-motion on: no particles, single-frame flash, SFX still plays.
  - [ ] Audio stays silent until first user input (browser autoplay policy honoured).

## Critical files

- `/home/user/chrome-offline-Rex/script.js`
- `/home/user/chrome-offline-Rex/index.html`
- `/home/user/chrome-offline-Rex/style.css`
- `/home/user/chrome-offline-Rex/tests/game.test.js`
