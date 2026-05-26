# Domain Context — Chrome Offline Rex

## Design Pillars

**Flow** — the primary emotion the game is designed to create. A great run feels like time disappeared: the player stops thinking and just reacts. Every design decision should be evaluated against whether it protects or breaks this rhythm.
_Avoid_: fun, enjoyment, engagement (too broad)

**Atmosphere** — the peripheral world that deepens the flow state in Updated mode: scrolling hills, clouds, particles, day/night cycle. Atmosphere should be noticed only when the player is already in the zone — never demanding attention or drawing the eye away from the obstacle lane. It is a servant of Flow, not a separate goal.
_Avoid_: visuals, juice, polish (too generic)

**Classic mode** — the "pure flow" experience: no atmosphere, one obstacle type, nothing between the player and the obstacle. Its minimalism is intentional, not a deficiency. Classic should never receive atmospheric features — doing so would betray its identity. It is not an inferior Updated mode; it is a different answer to the same Flow pillar.
_Avoid_: stripped-down mode, legacy mode, basic mode

**One shared run** — the third pillar: once per day, every player faces the same obstacle sequence. Gives scores meaning and creates a social moment via the Share Result. The "shared" context belongs at the edges of the run (pre-run framing, post-run result screen) — not during the run, where it induces anxiety and breaks Flow. The in-run Daily badge violates this and should be removed from the HUD.
_Avoid_: daily mode, social feature, leaderboard

**Restart countdown** — the GET READY countdown shown in the WAITING state before each run. On first run: shown in full (builds anticipation for a new player). On restart after death: skippable by pressing space, so a player already in flow-mindset can return to RUNNING immediately without waiting 4 seconds.
_Avoid_: grace period, warmup, delay

## Core Concepts

**Cluster obstacle** — the obstacle type that unlocks at score 250, rendered as two side-by-side cacti. It must be visually distinct from the small and big cacti so a player encountering it for the first time reads "two obstacles" at a glance. An unrecognisable first encounter at score 250+ is a fairness break, not an earned surprise — the player has invested a long run before losing to something confusing.
_Avoid_: double cactus, pair obstacle, twin obstacle

**Obstacle** — any on-screen hazard the dino must jump over.
_Avoid_: enemy, object

**Obstacle type** — the category of a spawned obstacle (e.g. small cactus, cluster cactus).
_Avoid_: obstacle kind, obstacle variant

**Spawn gap** — the pixel distance between the right edge of the canvas and the trigger point for the next obstacle spawn.
_Avoid_: gap, spacing, next gap

**Jitter** — a random ±variation applied to the **spawn gap** in updated mode to prevent metronomic spacing. Only applied in updated mode; classic-mode spawn gaps are deterministic.
_Avoid_: randomness, variation

**Score** — the primary measure of how far a run has progressed; the sole input to the difficulty curve. Computed as `game.distance × DISTANCE_COEFFICIENT` (v2 scale), where `game.distance` accumulates `game.currentSpeed` each fixed step. `migrateScoreScale()` clears any pre-v2 stored scores on first boot after the upgrade.
_Avoid_: distance, points

**Speed** — the obstacle scroll speed in pixels per fixed step (1/60 s). Increases linearly by `ACCELERATION` per step from `INITIAL_SPEED`, capped at `SPEED_CAP`.
_Avoid_: velocity, game speed, scroll speed

**Initial speed** — the speed at the start of a run — the lowest point of the difficulty curve (value: `INITIAL_SPEED`).
_Avoid_: start speed, base speed

**DifficultyProfile** — the module that owns the relationship between score and game feel. It defines how fast the game moves at any given score, when obstacles spawn, and what type they are. All tunable numbers live here; the game loop reads from it rather than computing inline.

**Difficulty curve** — how speed and obstacle density scale with score. Speed increases linearly from `INITIAL_SPEED` by `ACCELERATION` each fixed step (1/60 s), capping at `SPEED_CAP`. Obstacle density follows the official gap model: `spawn gap = round(obstacleWidth × speed + minGap × GAP_COEFFICIENT)`, randomised up to `MAX_GAP_COEFFICIENT`. The curve is continuous (no sudden jumps at level boundaries).

**Plateau** — the ceiling of the difficulty curve, reached when `game.currentSpeed` hits `SPEED_CAP`. Chosen to feel "focusable but demanding" — a skilled player can hold this speed indefinitely, but it is not forgiving of lapses in attention. The plateau is communicated to the player exactly once per run via a light peripheral cue (e.g. a brief particle burst or flash) when they first reach it — never repeated, never prominent enough to break the obstacle lane's focus. The cue reframes failure at high score from "this is impossible" to "I've reached the hard part, now I need to hold it." Atmosphere rules apply: the signal must stay peripheral.

**Level** — a discrete score milestone (every 100 points) used for milestone flash effects and visual feedback only. Speed no longer steps at level boundaries; it increases continuously.

**Particles** — the module that owns the particle pool, kind definitions, and all emit/update/draw/reset behaviour. Callers invoke `Particles.emit(kind, x, y)` without knowing pool size, reduced-motion rules, or mode gating — all suppression logic lives inside. Visual-only: uses `Math.random()`, never `game.rng()`.

**Animations** — the module that owns all per-run animation countdown timers (death shake, death flash, score pop, milestone flash, new-best badge, copy flash, death score count-up). A single `Animations.reset()` call zeroes all counters at the start of each run. Handlers and draw functions read and write counters directly via `Animations.X`.

## Randomness

**RNG** — the seeded pseudo-random number generator used for all in-run randomness; shared between obstacle type selection and spawn gap jitter to preserve determinism. Consumed in a fixed order (type first, gap second) per spawn — swapping breaks deterministic replay. `Math.random()` is reserved for cosmetic effects only (particles, clouds, audio pitch).
_Avoid_: random, rand

## Daily Challenge

**Daily Challenge** — a play mode in which the obstacle sequence is seeded from the current calendar date, giving every player the same run each day. Activated by a dedicated button; always runs in Updated mode.
_Avoid_: daily mode, date mode, challenge mode

**Daily seed** — an integer derived from the current date in YYYYMMDD format (e.g. `20260501`) used as the RNG seed for a daily challenge run. Recomputed each day; the same seed produces the same obstacle sequence for all players.
_Avoid_: date seed, daily RNG

**Daily number** — the count of days since the project epoch (2026-03-01), shown as `#N` in the HUD badge and share text. Day 1 = 2026-03-01.
_Avoid_: day number, challenge number

**Daily best** — the player's highest score on today's daily challenge run, stored separately from all-time best. Resets automatically when the calendar date changes.
_Avoid_: daily high score, today's score, daily record

**Share result** — a clipboard-copied text summarising the player's daily best, available from the Game Over screen during a daily challenge run. Format: `Rex Daily #N 🦕 / Score: X / <url>`.
_Avoid_: share score, copy result, clipboard share

## Relationships

- A **Daily Challenge** run uses one **Daily seed** derived from the current date
- The **Daily seed** is the sole input to `game.rng` for a daily challenge run, replacing the `Date.now()` seed used in free play
- The **Daily number** is computed from the same date as the **Daily seed** but is display-only — it does not influence the obstacle sequence
- **Daily best** is independent of all-time best; both are shown on the Game Over screen when in Daily Challenge
- A **Share result** references both the **Daily number** and the **Daily best**

## Flagged Ambiguities

- **"speed cap"** (`SPEED_CAP`) is the single hard ceiling for `game.currentSpeed`. It also doubles as the particle-trail threshold (trail activates at 85 % of `SPEED_CAP`). **Plateau** is the domain-level name for this ceiling — prefer **plateau** in design discussions; use "speed cap" only when referring to the code constant.
- **"gap"** is overloaded: it can mean the on-screen pixel distance between obstacles (a rendering concept) or `nextSpawnGap` (the trigger threshold). Always qualify: **spawn gap** for the game-logic threshold.
