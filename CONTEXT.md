# Domain Context — Chrome Offline Rex

## Core Concepts

**DifficultyProfile** — the module that owns the relationship between score and game feel. It defines how fast the game moves at any given score, when obstacles spawn, and what type they are. All tunable numbers live here; the game loop reads from it rather than computing inline.

**Difficulty curve** — how speed and obstacle density scale with score. The curve starts gently, accelerates through the mid-game, and plateaus at a speed the player can sustain with focus. It is continuous (no sudden jumps at level boundaries) and sigmoid-shaped (slow ramp-up, steeper middle, soft plateau).

**Plateau** — the ceiling of the difficulty curve. Chosen to feel "focusable but demanding" — a skilled player can hold this speed indefinitely, but it is not forgiving of lapses in attention.

**Level** — a discrete score milestone (every 100 points) used for milestone flash effects and visual feedback only. Speed no longer steps at level boundaries; it increases continuously.

**Particles** — the module that owns the particle pool, kind definitions, and all emit/update/draw/reset behaviour. Callers invoke `Particles.emit(kind, x, y)` without knowing pool size, reduced-motion rules, or mode gating — all suppression logic lives inside. Visual-only: uses `Math.random()`, never `game.rng()`.

**Animations** — the module that owns all per-run animation countdown timers (death shake, death flash, score pop, milestone flash, new-best badge, copy flash, death score count-up). A single `Animations.reset()` call zeroes all counters at the start of each run. Handlers and draw functions read and write counters directly via `Animations.X`.

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
