# Chrome Offline Rex

A clone of the Chrome offline dinosaur game, built with vanilla JavaScript and HTML5 Canvas.

**Play it here:** https://snehiths19.github.io/chrome-offline-Rex/

## Controls

| Action | Input |
|--------|-------|
| Jump | Space / Arrow Up / W / Click / Tap |
| Restart | Space / Tap after Game Over |
| Switch mode | Click the segmented Classic / Updated toggle above the canvas |
| Mute / unmute | Click the speaker icon |

## Features

- Smooth jump arc with tuned physics
- Gap-enforced obstacle spawning (no clustering)
- Speed ramps up every 100 points, capped at 5×
- Two visual modes — Classic (faithful baseline) and Updated (parallax hills, milestone sky-tint, particles, audio)
- Death flash + screen shake on collision; HUD score pop on game over
- Mid-ground parallax hills in Updated mode
- Milestone banner at every 100-point threshold; "New Best!" banner on high-score break
- Audio mute toggle (persisted across sessions)
- Particle effects on jump and crash (suppressed under `prefers-reduced-motion`)
- Parallax clouds
- Day/night cycle — sky darkens at score 300, stars appear at 400
- High score tracked across sessions via `localStorage`
- Mobile-friendly with on-screen jump button
- Pace is locked to a 60Hz sim clock, so a 120Hz phone matches a 60Hz desktop
- Respects `prefers-reduced-motion`; announces game state to screen readers
- Falls back to simple rectangles if sprite assets fail to load

## Modes

The mode toggle above the canvas switches between two flavours:

- **Classic** — closest to the original Chrome offline dino. Pure dino-clone parity, fixed visual baseline.
- **Updated** — adds layered parallax hills, sky-tint at score milestones, particle effects, and Web Audio SFX. Same physics, same spawn schedule, same RNG seed semantics — only visuals change.

The choice persists in `localStorage` under `dino-mode`. Updated is the default.

## Run Locally

Requires a local HTTP server (direct file open causes CORS issues with assets):

```bash
# Python
python3 -m http.server 8080

# or via npm script (same thing)
npm run serve
```

Then open `http://localhost:8080`.

`?qaHz=1` paints a static corner readout of the measured sim rate and the display rate (`sim 60  raf 120`). It is for Playtest, not players. Off, it changes nothing. On a 60Hz screen both numbers stay near 60. On a 120Hz phone, `raf` stays near 120 and `sim` stays near 60 — the run should still feel like desktop. The label does not pulse, so reduced motion does not hide it.

## Development

```bash
npm install         # install ESLint + Prettier (optional, for local dev)
npm test            # run the game test suite under Node
npm run lint        # lint script.js and tests
npm run format      # auto-format source files
```

See [`docs/dev/`](docs/dev/) for design specs and internal implementation plans.

> Working on this codebase with Claude Code (or onboarding as a contributor)? See [`CLAUDE.md`](CLAUDE.md) for the architecture overview.
