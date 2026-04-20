# Chrome Offline Rex

A clone of the Chrome offline dinosaur game, built with vanilla JavaScript and HTML5 Canvas.

**Play it here:** https://snehiths19.github.io/chrome-offline-Rex/

## Controls

| Action | Input |
|--------|-------|
| Jump | Space / Arrow Up / W / Click / Tap |
| Restart | Space / Tap after Game Over |

## Features

- Smooth jump arc with tuned physics
- Gap-enforced obstacle spawning (no clustering)
- Speed ramps up every 100 points, capped at 5×
- Parallax clouds
- Day/night cycle — sky darkens at score 300, stars appear at 400
- High score tracked across sessions via `localStorage`
- Mobile-friendly with on-screen jump button
- Respects `prefers-reduced-motion`; announces game state to screen readers
- Falls back to simple rectangles if sprite assets fail to load

## Run Locally

Requires a local HTTP server (direct file open causes CORS issues with assets):

```bash
# Python
python3 -m http.server 8080

# or via npm script (same thing)
npm run serve
```

Then open `http://localhost:8080`.

## Development

```bash
npm install         # install ESLint + Prettier (optional, for local dev)
npm test            # run the game test suite under Node
npm run lint        # lint script.js and tests
npm run format      # auto-format source files
```

See [`docs/dev/`](docs/dev/) for design specs and internal implementation plans.
