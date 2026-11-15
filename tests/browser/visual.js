// Screenshot comparisons (T4, #134).
//
// Renders key screens of the game canvas (start, running by day, night, Game
// Over, Daily result) at a desktop and a phone size, then compares each to a
// stored reference image in tests/browser/references/. A screen fails when
// more than a small share of its pixels changed; the failure writes a
// side-by-side image (reference | now | changed pixels in red) to
// tests/browser/visual-diffs/, which CI uploads.
//
// Every screen is made deterministic before it is drawn: a fixed run seed,
// a seeded Math.random (clouds, stars, particles), a fixed clock (Daily
// number), and the game loop driven by hand one 60Hz slice at a time, so no
// animation is mid-flight when the picture is taken.
//
// Run:                 npm run test:visual
// Update references:   npm run test:visual -- --update
// Only the canvas is compared. Page buttons use system fonts that differ
// between machines; the smoke test (smoke.js) covers their layout.

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { startServer } = require('./server');

const REFS = path.join(__dirname, 'references');
const DIFFS = path.join(__dirname, 'visual-diffs');
const UPDATE = process.argv.includes('--update');

// A pixel counts as changed when any channel moves by more than this (0-255),
// and a screen fails when more than this share of its pixels changed.
const CHANNEL_TOLERANCE = 16;
const MAX_CHANGED_SHARE = 0.002; // 0.2%

const FIXED_TIME = '2026-07-01T12:00:00Z';

const VIEWPORTS = [
  // Desktop renders at 2x, like a laptop's retina screen. At 1x, two Linux
  // machines hint the canvas text differently enough to fail a comparison.
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } },
  { name: 'phone', options: devices['iPhone 13'] },
];

// Each scene sets the game up through page-side helpers (installed below)
// and leaves the canvas showing the screen to capture.
const SCENES = [
  {
    name: 'start',
    run: () => {
      window.__scene('updated', 1001);
      game.state = STATE.IDLE;
      window.__step(1);
    },
  },
  {
    name: 'running-day',
    run: () => {
      window.__scene('updated', 2002);
      window.__untilRunning();
      window.__step(150, true);
    },
  },
  {
    name: 'night',
    run: () => {
      window.__scene('updated', 3003);
      window.__untilRunning();
      game.score = 720; // past the day-to-night ramp
      window.__step(180, true);
    },
  },
  {
    name: 'resume-countdown',
    run: () => {
      window.__scene('updated', 6006);
      window.__untilRunning();
      window.__step(150, true);
      /* global pauseRun, resumeRun */
      pauseRun();
      resumeRun();
      window.__step(30);
    },
  },
  {
    name: 'game-over',
    run: () => {
      window.__scene('updated', 4004);
      game.highScore = 10; // a new record: NEW BEST and the improvement line
      window.__untilRunning();
      window.__untilDeadAndSettled();
    },
  },
  {
    name: 'classic-game-over',
    // A first-ever run (stored best 0): the plain score, no NEW BEST (R3).
    run: () => {
      window.__scene('classic', 4004);
      window.__untilRunning();
      window.__untilDeadAndSettled();
    },
  },
  {
    name: 'game-over-miss',
    run: () => {
      window.__scene('updated', 4004);
      game.highScore = 999; // a miss: THIS RUN beside YOUR BEST
      window.__untilRunning();
      window.__untilDeadAndSettled();
    },
  },
  {
    name: 'daily-result',
    run: () => {
      window.__scene('daily', 5005);
      window.__untilRunning();
      window.__untilDeadAndSettled();
    },
  },
];

// Installed in the page before the game files run.
function pageSetup() {
  // Seeded Math.random so cosmetic randomness draws the same every time.
  let s = 1;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;
  window.__seedRandom = (seed) => {
    s = seed;
  };
  window.addEventListener('load', () => {
    // One 60Hz slice, with no frame left scheduled afterwards.
    window.__step = (n, autopilot) => {
      for (let i = 0; i < n; i++) {
        /* global game, dino, STATE, jump, gameLoop, replayRunSeed, resetGame */
        if (autopilot && game.state === STATE.RUNNING && !dino.isJumping) {
          const ahead = game.obstacles
            .filter((o) => o.x + o.width > dino.x)
            .sort((a, b) => a.x - b.x)[0];
          if (ahead) {
            const frames = (ahead.x - (dino.x + dino.width)) / game.currentSpeed;
            if (frames <= 12 + Math.ceil(ahead.width / game.currentSpeed / 2)) {
              dino.jumpHeld = true; // a held press: the full jump (F3)
              jump();
            }
          }
        }
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
      }
    };
    window.__scene = (mode, seed) => {
      cancelAnimationFrame(game.animationFrameId);
      window.__seedRandom(seed);
      game.mode = mode;
      game.highScore = 0;
      game.dailyBest = 0;
      game.state = STATE.IDLE;
      replayRunSeed(seed);
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    };
    window.__untilRunning = () => {
      for (let i = 0; i < 1000 && game.state !== STATE.RUNNING; i++) window.__step(1);
    };
    window.__untilDeadAndSettled = () => {
      for (let i = 0; i < 5000 && game.state !== STATE.DEAD; i++) window.__step(1);
      // Shake, flash and the Game Over count-up all finish, then hold.
      window.__step(240);
    };
  });
}

// Compare two PNGs inside the browser (no image libraries needed). Returns
// the changed-pixel count and, when asked, a side-by-side PNG as a data URL.
async function comparePngs(page, expectedB64, actualB64) {
  return page.evaluate(
    async ({ a, b, tol }) => {
      const load = (b64) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = 'data:image/png;base64,' + b64;
        });
      const [ea, eb] = [await load(a), await load(b)];
      if (ea.width !== eb.width || ea.height !== eb.height) {
        return { sizeMismatch: `${ea.width}x${ea.height} vs ${eb.width}x${eb.height}` };
      }
      const w = ea.width;
      const h = ea.height;
      const pixels = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h);
      };
      // Compare 2x2 averages, not single pixels: two machines' rasterisers
      // shade the same glyph edge a little differently, and averaging washes
      // that out, while a real change (a new colour, a moved or different
      // shape) survives it.
      const sw = Math.floor(w / 2);
      const sh = Math.floor(h / 2);
      const shrink = (img) => {
        const src = pixels(img).data;
        const data = new Float32Array(sw * sh * 4);
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            for (let c = 0; c < 4; c++) {
              const at = (yy, xx) => src[(yy * w + xx) * 4 + c];
              data[(y * sw + x) * 4 + c] =
                (at(2 * y, 2 * x) +
                  at(2 * y, 2 * x + 1) +
                  at(2 * y + 1, 2 * x) +
                  at(2 * y + 1, 2 * x + 1)) /
                4;
            }
          }
        }
        return { data };
      };
      const pa = shrink(ea);
      const pb = shrink(eb);
      const out = document.createElement('canvas');
      out.width = w * 3;
      out.height = h;
      const ox = out.getContext('2d');
      ox.drawImage(ea, 0, 0);
      ox.drawImage(eb, w, 0);
      const diff = ox.createImageData(w, h);
      // Max channel difference between pixel i of `p` and pixel j of `q`.
      const dist = (p, i, q, j) =>
        Math.max(
          Math.abs(p.data[i] - q.data[j]),
          Math.abs(p.data[i + 1] - q.data[j + 1]),
          Math.abs(p.data[i + 2] - q.data[j + 2]),
          Math.abs(p.data[i + 3] - q.data[j + 3])
        );
      // True when pixel (x, y) of `p` has a close match within one pixel in
      // `q`. Text and sprite edges can land half a pixel apart on another
      // machine's rasteriser; a real change (a new colour, a moved or
      // different glyph) has no such match nearby.
      const nearMatch = (p, q, x, y) => {
        const i = (y * sw + x) * 4;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
            if (dist(p, i, q, (ny * sw + nx) * 4) <= tol) return true;
          }
        }
        return false;
      };
      let changed = 0;
      const grey = (y, x) => {
        const i = (Math.min(y, sh - 1) * sw + Math.min(x, sw - 1)) * 4;
        return (pa.data[i] + pa.data[i + 1] + pa.data[i + 2]) / 3;
      };
      const isChanged = new Uint8Array(sw * sh);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          if (dist(pa, i, pb, i) > tol && !(nearMatch(pa, pb, x, y) && nearMatch(pb, pa, x, y))) {
            isChanged[y * sw + x] = 1;
            changed++;
          }
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const bx = Math.min(x >> 1, sw - 1);
          const by = Math.min(y >> 1, sh - 1);
          const g = grey(by, bx);
          diff.data.set(
            isChanged[by * sw + bx] ? [255, 0, 0, 255] : [g, g, g, 70],
            (y * w + x) * 4
          );
        }
      }
      ox.fillStyle = '#fff';
      ox.fillRect(w * 2, 0, w, h);
      ox.putImageData(diff, w * 2, 0);
      return { changed, total: sw * sh, sideBySide: changed ? out.toDataURL('image/png') : null };
    },
    { a: expectedB64, b: actualB64, tol: CHANNEL_TOLERANCE }
  );
}

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `\n      ${detail}` : ''}`);
}

(async () => {
  fs.rmSync(DIFFS, { recursive: true, force: true });
  fs.mkdirSync(DIFFS, { recursive: true });
  fs.mkdirSync(REFS, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const blank = await (await browser.newContext()).newPage();
  console.log(`\nScreenshot comparisons${UPDATE ? ' (updating references)' : ''}`);
  try {
    for (const vp of VIEWPORTS) {
      // Reduced motion off, and no service worker so every load is fresh.
      const context = await browser.newContext({
        ...vp.options,
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.clock.setFixedTime(new Date(FIXED_TIME));
      await page.addInitScript(pageSetup);
      await page.goto(`${base}/index.html`);
      await page.waitForFunction("typeof window.__scene === 'function' && game.state === 'IDLE'");
      for (const scene of SCENES) {
        await page.evaluate(scene.run);
        // The canvas's own pixels, not a crop of the page: a page crop gains
        // or loses a row when the layout puts the canvas on a half pixel.
        const png = Buffer.from(
          (
            await page.evaluate(() => document.getElementById('gameCanvas').toDataURL('image/png'))
          ).split(',')[1],
          'base64'
        );
        const name = `${vp.name}-${scene.name}.png`;
        const refFile = path.join(REFS, name);
        if (UPDATE) {
          fs.writeFileSync(refFile, png);
          console.log(`  wrote references/${name}`);
          continue;
        }
        if (!fs.existsSync(refFile)) {
          fs.writeFileSync(path.join(DIFFS, name), png);
          check(name, false, 'no reference yet; run npm run test:visual -- --update');
          continue;
        }
        const result = await comparePngs(
          blank,
          fs.readFileSync(refFile).toString('base64'),
          png.toString('base64')
        );
        if (result.sizeMismatch) {
          fs.writeFileSync(path.join(DIFFS, name), png);
          check(name, false, `size changed: ${result.sizeMismatch}`);
          continue;
        }
        const share = result.changed / result.total;
        const ok = share <= MAX_CHANGED_SHARE;
        if (result.changed) {
          const out = path.join(DIFFS, name.replace('.png', '-diff.png'));
          fs.writeFileSync(out, Buffer.from(result.sideBySide.split(',')[1], 'base64'));
        }
        check(
          `${name} matches (${(share * 100).toFixed(3)}% of pixels changed)`,
          ok,
          `side by side: ${path.relative(process.cwd(), DIFFS)}/${name.replace('.png', '-diff.png')}`
        );
      }
      check(`${vp.name}: no page errors`, errors.length === 0, errors.join('; '));
      await context.close();
    }
  } catch (err) {
    check('screenshot comparisons ran to the end', false, err.stack);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n--- Screenshot Summary ---\nPassed: ${passed}\nFailed: ${failed}`);
  if (failed && !UPDATE) {
    console.log('If the change was intended, update references: npm run test:visual -- --update');
  }
  process.exit(failed > 0 ? 1 : 0);
})();
