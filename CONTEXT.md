# Domain Context — Chrome Offline Rex

## Design Pillars

**Flow** — the primary emotion the game is designed to create. A great run feels like time disappeared: the player stops thinking and just reacts. Every design decision should be evaluated against whether it protects or breaks this rhythm.
_Avoid_: fun, enjoyment, engagement (too broad)

**Atmosphere** — the peripheral world that deepens the flow state in Updated mode: scrolling hills, clouds, particles, day/night cycle. Atmosphere should be noticed only when the player is already in the zone — never demanding attention or drawing the eye away from the obstacle lane. It is a servant of Flow, not a separate goal.
_Avoid_: visuals, juice, polish (too generic)

**Classic mode** — the "pure flow" experience: no atmosphere, one obstacle type, nothing between the player and the obstacle. Its minimalism is intentional, not a deficiency. Classic should never receive atmospheric features — doing so would betray its identity. It is not an inferior Updated mode; it is a different answer to the same Flow pillar.
_Avoid_: stripped-down mode, legacy mode, basic mode

**One shared run** — the third pillar: once per day, every player faces the same obstacle sequence. Gives scores meaning and creates a social moment via the Share Result. The "shared" context belongs at the edges of the run (pre-run framing, post-run result screen) — not during the run, where it induces anxiety and breaks Flow. The in-run Daily badge and the in-run TODAY label are off the HUD during WAITING and RUNNING. Pre-run framing is the quiet shared-course line on the GET READY overlay, and only then. A miss keeps TODAY BEST on the Game Over screen beside this run. A death that beats today takes over with the new today best celebration. The share result stays available after the run, and a single death-screen hint points at sharing once the score count-up finishes.
_Avoid_: daily mode, social feature, leaderboard

**Restart countdown** — the GET READY countdown shown in the WAITING state before each run. On first run: shown in full (builds anticipation for a new player). On restart after death: skippable by pressing space, so a player already in flow-mindset can return to RUNNING immediately without waiting 4 seconds.
_Avoid_: grace period, warmup, delay

## Core Concepts

**Cluster obstacle** — the obstacle type that unlocks at score 250, drawn as two full small-cactus sprites with one small cactus of sky between them so a first encounter reads as two cacti at a glance. The cactus art's arms run to the edge of the sprite, so the leftover space inside the hitbox still reads as one mass. The sprites may overhang the hitbox equally; the sky between them stays inside the hitbox, and the gap is narrower than the dino, so it is not a lane. The hitbox width, unlock score, and weight stay on `GAME_CONFIG` and are not part of the draw. An unrecognisable first encounter at score 250+ is a fairness break, not an earned surprise — the player has invested a long run before losing to something confusing.
_Avoid_: double cactus, pair obstacle, twin obstacle

**Obstacle** — any on-screen hazard the dino must jump over.
_Avoid_: enemy, object

**Obstacle type** — the category of a spawned obstacle (e.g. small cactus, cluster cactus).
_Avoid_: obstacle kind, obstacle variant

**Spawn gap** — the pixel distance between the right edge of the canvas and the trigger point for the next obstacle spawn. In Updated and Daily, once the shrinking curve would leave less than one focused jump between obstacles, the gap scales with speed so the time between them holds. Classic keeps the shrinking pixel gap.
_Avoid_: gap, spacing, next gap

**Jitter** — a random ±variation applied to the **spawn gap** in updated mode to prevent metronomic spacing. Only applied in updated mode; classic-mode spawn gaps are deterministic.
_Avoid_: randomness, variation

**Score** — the primary measure of how far a run has progressed; the sole input to the difficulty curve.
_Avoid_: distance, points

**Speed** — the obstacle scroll speed in pixels per frame at the current score.
_Avoid_: velocity, game speed, scroll speed

**Initial speed** — the speed at score 0 — the lowest point of the difficulty curve.
_Avoid_: start speed, base speed

**Ramp midpoint** — the score value where the difficulty curve's rate of change is steepest; the inflection point of the sigmoid.
_Avoid_: midpoint, acceleration point

**Ramp steepness** — a tuning coefficient that controls how sharply speed rises around the ramp midpoint.
_Avoid_: slope, sigmoid slope

**DifficultyProfile** — the module that owns the relationship between score and game feel. It defines how fast the game moves at any given score, when obstacles spawn, and what type they are. All tunable numbers live here; the game loop reads from it rather than computing inline.

**Difficulty curve** — how speed and obstacle density scale with score. The curve starts gently, accelerates through the mid-game, and plateaus at a speed the player can sustain with focus. It is continuous (no sudden jumps at level boundaries) and sigmoid-shaped (slow ramp-up, steeper middle, soft plateau).

**Plateau** — the ceiling of the difficulty curve. Chosen to feel "focusable but demanding" — a skilled player can hold this speed indefinitely, but it is not forgiving of lapses in attention. The curve approaches plateau speed and never quite touches it, so the player is told they have arrived the first time speed reaches 98% of plateau speed (about score 641 on the current curve). That cue is a brief cool particle puff at the dino's heel — once per run, never a center message, never repeated. Classic never shows it. Under prefers-reduced-motion the puff is damped like other particles. It reframes a late failure from "this is impossible" to "I've reached the hard part, now I need to hold it."

**Level** — a discrete score milestone (every 100 points) used for milestone flash effects and visual feedback only. Speed no longer steps at level boundaries; it increases continuously.

**Particles** — the module that owns the particle pool, kind definitions, and all emit/update/draw/reset behaviour. Callers invoke `Particles.emit(kind, x, y)` without knowing pool size, reduced-motion rules, or mode gating — all suppression logic lives inside. Visual-only: uses `Math.random()`, never `game.rng()`.

**Animations** — the module that owns all per-run animation countdown timers (death shake, death flash, score pop, milestone flash, new-best badge, copy flash, death score count-up). A single `Animations.reset()` call zeroes all counters at the start of each run. Handlers and draw functions read and write counters directly via `Animations.X`.

## Randomness

**RNG** — the seeded pseudo-random number generator used for all in-run randomness; shared between obstacle type selection and spawn gap jitter to preserve determinism. Consumed in a fixed order (type first, gap second) per spawn — swapping breaks deterministic replay. `Math.random()` is reserved for cosmetic effects only (particles, clouds, audio pitch).
_Avoid_: random, rand

**Run seed** — the integer actually passed to the RNG when a run starts. A Daily Challenge uses the **daily seed**. Free play uses `Date.now()` masked to 32 bits. Stored on the run so a reported free-play death can be seeded again with `replayRunSeed`.
_Avoid_: random seed, session id

**Death log** — an opt-in JSON snapshot for unfairness reports: mode, score, run seed, speed, recent spawn gaps (pixels and approximate time), and obstacle types. Off unless the page is opened with `?debug=1` or DevTools calls `enableDeathLog()`. It does not change the run. Press L while it is on to copy the current snapshot.
_Avoid_: replay, telemetry, input log

## Daily Challenge

**Daily Challenge** — a play mode in which the obstacle sequence is seeded from the current calendar date, giving every player the same run each day. Activated by a dedicated button; always runs in Updated mode.
_Avoid_: daily mode, date mode, challenge mode

**Daily seed** — an integer derived from the current date in YYYYMMDD format (e.g. `20260501`) used as the RNG seed for a daily challenge run. Recomputed each day; the same seed produces the same obstacle sequence for all players.
_Avoid_: date seed, daily RNG

**Daily number** — the count of days since the project epoch (2026-03-01), shown as `#N` on the Game Over screen and in the share text. Day 1 = 2026-03-01. It is not drawn on the in-run HUD.
_Avoid_: day number, challenge number

**Daily best** — the player's highest score on today's daily challenge run, stored separately from all-time best. Resets automatically when the calendar date changes.
_Avoid_: daily high score, today's score, daily record

**Share result** — a clipboard-copied text summarising the player's daily best, available from the Game Over screen during a daily challenge run. Format: `Rex Daily #N 🦕 / Score: X / <url>`.
_Avoid_: share score, copy result, clipboard share

**Pre-run framing** — the quiet line on the GET READY overlay during a Daily Challenge, shown only while state is WAITING. Copy: "Same course as everyone today". Static text, no motion. Classic and Updated never show it. It is not drawn during RUNNING, and it does not replace TODAY BEST or the share result on Game Over.
_Avoid_: daily banner, in-run badge, today label

**Death-screen hint** — one static line on the Daily Challenge Game Over screen, drawn only after the score count-up finishes, in the same moment the Copy result button appears. Copy: "Share TODAY BEST with Copy result". It points at the existing share button. It does not replace the share button, the comparison on a miss, or the new today best celebration. Classic and Updated never show it. It is not drawn during WAITING or RUNNING. No motion.
_Avoid_: share modal, in-run share prompt, copy banner

**New today best** — the Game Over celebration when a Daily Challenge death beats **Daily best**, including the first run of the day. On-screen copy: "★  NEW TODAY BEST  ★" and the run score, in the same takeover as free-play new best. A miss, including a tie, keeps the THIS RUN / TODAY BEST comparison. The death-screen hint and Copy result still appear after the score count-up. Static text, no extra motion. Classic and Updated never show it. Not drawn during WAITING or RUNNING.
_Avoid_: daily record, new daily high, today record

## Relationships

- A **Daily Challenge** run uses one **Daily seed** derived from the current date; that value is the run's **run seed**
- A free-play **run seed** is the clock value captured at reset, not the daily seed
- A **death log** is written only while debug is on, and it reads the **run seed** without changing spawns
- The **Daily seed** is the sole input to `game.rng` for a daily challenge run, replacing the `Date.now()` seed used in free play
- The **Daily number** is computed from the same date as the **Daily seed** but is display-only — it does not influence the obstacle sequence
- **Daily best** is independent of all-time best; both are shown on the Game Over screen when in Daily Challenge
- A **Share result** references both the **Daily number** and the **Daily best**
- **Pre-run framing** is drawn only on the Daily Challenge GET READY overlay (WAITING). It is absent in RUNNING and in Classic and Updated free play
- A **Death-screen hint** is drawn only on a settled Daily Challenge Game Over screen, under both the comparison and a **New today best**. It names the Copy result button, and it is absent in WAITING, RUNNING, Classic, and Updated
- A **New today best** replaces the THIS RUN / TODAY BEST pair on that Game Over screen only. The **Death-screen hint** and **Share result** still appear once the count-up finishes
- A Daily Challenge death that does not beat **Daily best**, including a tie, keeps the comparison layout

## Flagged Ambiguities

- **"speed cap"** appears in code as `SPEED_CAP` (kept for the particle-trail threshold) but is distinct from **plateau** — `SPEED_CAP` is a hard ceiling for particle effects, while **plateau** is the soft ceiling the difficulty curve targets. Prefer **plateau** in domain discussion; reserve "speed cap" for talking about the particle threshold specifically.
- **"gap"** is overloaded: it can mean the on-screen pixel distance between obstacles (a rendering concept) or `nextSpawnGap` (the trigger threshold). Always qualify: **spawn gap** for the game-logic threshold.
