# Domain Context — Chrome Offline Rex

## Core Concepts

**DifficultyProfile** — the module that owns the relationship between score and game feel. It defines how fast the game moves at any given score, when obstacles spawn, and what type they are. All tunable numbers live here; the game loop reads from it rather than computing inline.

**Difficulty curve** — how speed and obstacle density scale with score. The curve starts gently, accelerates through the mid-game, and plateaus at a speed the player can sustain with focus. It is continuous (no sudden jumps at level boundaries) and sigmoid-shaped (slow ramp-up, steeper middle, soft plateau).

**Plateau** — the ceiling of the difficulty curve. Chosen to feel "focusable but demanding" — a skilled player can hold this speed indefinitely, but it is not forgiving of lapses in attention.

**Level** — a discrete score milestone (every 100 points) used for milestone flash effects and visual feedback only. Speed no longer steps at level boundaries; it increases continuously.
