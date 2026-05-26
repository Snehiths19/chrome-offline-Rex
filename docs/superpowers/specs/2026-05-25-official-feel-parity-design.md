# Official Chrome Dino — Feel Parity Pass

- **Date:** 2026-05-25
- **Status:** Approved (design); pending spec review before planning
- **Scope owner:** Snehith
- **Topic slug:** official-feel-parity

## Problem

The game "plays different" from the official `chrome://dino`. Investigation found
**three independent causes**, two of which the player consciously feels (floaty
jump, wrong obstacle spacing) and one they feel without isolating (everything too
fast):

1. **Frame-based physics on a 144 Hz display.** `gameLoop()` (script.js:1515) steps
   physics once per rendered frame with no time delta, e.g. `dino.velocityY +=
   dino.gravity; dino.y += dino.velocityY` (script.js:1482-1483). This is correct
   only at 60 Hz. The dev machine runs at **144 Hz**, so the whole game — motion
   *and* score — runs at **144 / 60 = 2.4×** the official speed in wall-clock time.
   The official scales every step by `deltaTime / (1000/60)` and is therefore
   identical at any refresh rate.

2. **Floaty jump tuning.** `GRAVITY 0.48` (vs official `0.6`) makes the dino fall
   slowly and hang at the apex; `JUMP_POWER -12` (vs official `-10`) launches it
   higher. Together: a tall, slow, floaty arc. The official is a lower, snappier
   "pop." Note this is independent of refresh rate — the arc *shape* is identical
   at any FPS; only the tuning controls float.

3. **Inverted gap model.** Current spawn gap *shrinks* with speed
   (`MAX_SPAWN_GAP 600` shrinking by `SPAWN_GAP_SPEED_FACTOR 50` per +1 speed,
   computeNextSpawnGap at script.js:444). The official gap *grows* with speed via
   `width × speed + minGap × 0.6`. This is the "gaps feel off" complaint.

## Goal

Make the existing game **move like the official** — feel parity only. The same
game, retuned and re-clocked so that what happens on screen matches `chrome://dino`.

## Non-goals (explicitly out of scope)

- Ducking / fast-fall (down arrow `SPEED_DROP`).
- Pterodactyl (bird) obstacles.
- Multi-box collision (official approximates each sprite with several boxes; we
  keep the single padded hitbox).
- Sprite-accuracy / asset parity.

These are deferred. This pass is purely about how the game *moves*.

## Official baseline reference

Verified against the faithful mirror `github.com/wayou/t-rex-runner` (`index.js`),
a clean extraction of Chromium's `components/neterror/resources/offline.js`.

| Constant | Official value |
|---|---|
| `SPEED` (start) | 6 |
| `MAX_SPEED` | 13 |
| `ACCELERATION` | 0.001 / frame (linear) |
| `GRAVITY` | 0.6 |
| `INITIAL_JUMP_VELOCITY` | -10 (Trex), scaled `- speed/10` at launch |
| `GAP_COEFFICIENT` | 0.6 |
| `MAX_GAP_COEFFICIENT` | 1.5 |
| obstacle `minGap` | cactus 120, pterodactyl 150 |
| distance coefficient | 0.025 |
| `FPS` / `msPerFrame` | 60 / 16.67 ms |

## Design

Three changes, all confined to the loop, `GAME_CONFIG`, and the spawn/score logic.
Modes (classic / updated / daily), juice, atmosphere, day/night, audio, HUD, idle
screen, and mobile scaling are untouched.

### 1. Fixed-timestep loop (Section 8)

Decision: **fixed-timestep accumulator** (chosen over deltaTime-scaling and
60 fps-cap). It fixes the 2.4× speed bug, keeps the existing combined state
handlers stepping by fixed amounts (minimal change), and preserves the
daily-challenge determinism contract.

The accumulator drives the **existing** `STATE_HANDLERS[state]()` once per fixed
1/60 s step — no handler split. Drawing happens inside the handler as today; on a
144 Hz display most frames run 1 step (≈ every 2.4 rAF callbacks) and the rest run
0 (the canvas simply retains the last image), so the game updates and renders at a
true 60 Hz — exactly like the official. (Splitting update from draw to render at
144 Hz would only redraw identical frames without render interpolation, which is
out of scope; revisit later if true 144 Hz smoothness is wanted.)

```js
const MS_PER_STEP = 1000 / 60, MAX_STEPS = 5;
let lastTime, accumulator = 0;          // reset in resetGame()

function gameLoop(now) {
  game.animationFrameId = requestAnimationFrame(gameLoop);
  if (now === undefined) {              // no-arg: single fixed step (tests + kickoff)
    STATE_HANDLERS[game.state]();
    return;
  }
  if (lastTime === undefined) lastTime = now;     // first timestamped frame: 0 delta
  let frame = now - lastTime; lastTime = now;
  if (frame > 250) frame = MS_PER_STEP;           // tab was backgrounded — don't fast-forward
  accumulator += frame;
  let steps = 0;
  while (accumulator >= MS_PER_STEP && steps < MAX_STEPS) {
    STATE_HANDLERS[game.state]();
    accumulator -= MS_PER_STEP;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;        // spiral-of-death clamp
}
```

The **no-arg single-step path** is load-bearing: tests call `gameLoop()` (no
timestamp) to advance exactly one frame, and the browser/init kickoff calls it the
same way before rAF takes over with timestamps. This keeps the existing test suite
driving the game unchanged — only assertions whose numbers change from retuning
need editing.

Beneficial side effect: all frame-counted animations (death shake, score pop,
milestone, idle bob) currently run 2.4× too fast at 144 Hz. Because a "step" is now
a true 1/60 s, they self-correct with no per-counter changes.

**Determinism:** a run executes the same number of fixed steps at 60 or 144 Hz, so
seeded-RNG draws (obstacle type, gap jitter, hill respawn) occur in the same order
and the daily challenge stays reproducible. The `cancelAnimationFrame` invariant
(CLAUDE.md) is unchanged.

### 2. Tuning — official numbers (`GAME_CONFIG`, Section 2)

| Key | Current | New |
|---|---|---|
| `GRAVITY` | 0.48 | **0.6** |
| `JUMP_POWER` | -12 | **-10** |
| `INITIAL_SPEED` | 3.0 | **6** |
| acceleration model | sigmoid | **linear**, `+0.001`/step, cap `SPEED_CAP 13` |

`dino.gravity` / `dino.jumpPower` already read from config (script.js:331-332), so
those propagate automatically.

**Speed model change.** Today speed is a pure function of score:
`DifficultyProfile.speedAtScore()` (sigmoid, script.js:473-475), reassigned every
frame (script.js:1404). Replace with **accumulation**:

```js
game.currentSpeed = Math.min(game.currentSpeed + ACCELERATION, SPEED_CAP);
```

per fixed step, starting at `INITIAL_SPEED`. Retire `PLATEAU_SPEED`,
`RAMP_MIDPOINT`, `RAMP_STEEPNESS`, and `speedAtScore()`. Call sites that read
`speedAtScore(score)` (e.g. `nextObstacle`, resetGame at script.js:1334) read
`game.currentSpeed` instead. Day/night is unaffected — it keys off **score** at
300 (`DAY_NIGHT_START`), not speed.

Optional fidelity touch (one line, easy to drop): at launch, scale jump velocity by
speed — `dino.velocityY = dino.jumpPower - game.currentSpeed / 10` — so jump
*distance* stays roughly constant as speed climbs. Included by default.

### 3. Gap model + scoring

**Gap** (`computeNextSpawnGap`, script.js:444). Replace shrink-with-speed model
with the official:

```js
const minGap = Math.round(typeWidth * speed + typeMinGap * GAP_COEFFICIENT); // 0.6
const maxGap = Math.round(minGap * MAX_GAP_COEFFICIENT);                      // 1.5
gap = minGap + Math.floor(rng() * (maxGap - minGap + 1));   // rng = game.rng — determinism preserved
```

Add per-type `minGap` to `OBSTACLE_TYPES` (small/big 120, cluster 150) and config
keys `GAP_COEFFICIENT 0.6`, `MAX_GAP_COEFFICIENT 1.5`. Retire `MAX_SPAWN_GAP`,
`MIN_SPAWN_GAP`, `SPAWN_GAP_SPEED_FACTOR`. Keep `SPAWN_GAP_JITTER`? No — the
official's `rand(minGap, minGap×1.5)` already supplies the jitter; remove the
separate jitter term to avoid double-randomizing.

**Scoring** (`game.score += SCORE_INCREMENT`, script.js:1400). Replace frame-count
scoring with distance-based, matching the official's accelerating climb:

```js
game.distance += game.currentSpeed;          // per fixed step
game.score = game.distance * DISTANCE_COEFFICIENT;   // 0.025
```

Add `DISTANCE_COEFFICIENT 0.025`; retire `SCORE_INCREMENT`. Milestone/`SCORE_PER_LEVEL`
logic keys off `Math.floor(score)` and is unaffected.

## High-score migration

Distance-based scoring is a different numeric scale than the old frame-based score,
so stored `dino-high-score` (and `dino-daily-best`) are no longer comparable. On
first load of the new version, **clear the stored best once**, guarded by a version
key in localStorage so it happens exactly once:

```js
if (localStorage.getItem('dino-score-scale') !== 'v2') {
  localStorage.removeItem('dino-high-score');
  localStorage.removeItem('dino-daily-best');
  localStorage.setItem('dino-score-scale', 'v2');
}
```

*(Alternative, if vetoed at review: keep frame-based scoring entirely. Fixed-timestep
already fixes the 2.4× inflation, so the score-too-fast problem is solved either
way — distance scoring is purely for matching the official's accelerating climb.)*

## Testing strategy

Tests assert against `game.*` state, not pixels (CLAUDE.md test harness).

- **Update** existing assertions whose numbers change: jump apex height (new
  gravity/velocity), spawn-gap expectations, score progression.
- **Add:**
  - *Fixed-step determinism:* driving the loop with variable frame times produces
    identical `game.*` state after N simulated seconds as a clean 60 Hz run.
  - *Gap formula:* `computeNextSpawnGap` output matches `width×speed + minGap×0.6`
    bounds for representative speeds.
  - *Distance scoring:* `score == distance × 0.025`.
  - *Speed ramp:* `currentSpeed` rises linearly from 6, caps at 13.
  - *Daily determinism preserved:* same seed → same obstacle sequence after all
    changes.
- `npm test` and `npm run lint` must pass (CI + Pages deploy gates).

## Risks

- **Loop change** could disturb how tests drive frames. Mitigation: the no-arg
  single-step path preserves the exact `gameLoop()` semantics tests rely on, so the
  driving mechanism is unchanged; only retuned-number assertions move.
- **Spiral-of-death** on a stalled/backgrounded tab. Mitigation: `frame > 250`
  reset and `steps < 5` clamp.
- **High-score reset** is user-visible. Mitigation: one-time, version-guarded;
  documented above.

## Resolved decisions

1. Fidelity: feel parity only (no duck / birds / sprite work).
2. Engine fix: fixed-timestep accumulator.
3. Speed ramp: exact official (linear from 6, retire sigmoid).
4. Scoring: distance-based with one-time high-score clear (vetoable at review).
