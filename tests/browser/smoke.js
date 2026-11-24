// Real-browser smoke test (T2, #131).
//
// Serves the repo over HTTP, opens the game in headless Chromium at desktop
// and phone sizes, and plays it the way a person would: start a run, jump,
// die, restart, toggle mute, Classic/Updated and Daily. It checks that the
// jump button and canvas fit on screen, that nothing logs a console error or
// throws, that the game still loads offline once the service worker is in,
// and that tests/test-runner.html passes every unit test in a real browser.
//
// Run locally: npm run test:browser
// Screenshots of each step land in tests/browser/screenshots/ (git-ignored);
// CI uploads them as a build artifact.

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { startServer } = require('./server');

const SHOTS = path.join(__dirname, 'screenshots');

const VIEWPORTS = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 } }, touch: false },
  { name: 'iphone-portrait', options: devices['iPhone 13'], touch: true, portrait: true },
  { name: 'pixel-portrait', options: devices['Pixel 7'], touch: true, portrait: true },
  { name: 'iphone-landscape', options: devices['iPhone 13 landscape'], touch: true },
  // The narrowest common Android width: the top row is tightest here (S4).
  {
    name: 'small-android',
    options: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
    touch: true,
    portrait: true,
  },
];

// --- Tiny reporting harness -------------------------------------------------

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  }
  return ok;
}

// Read a game value. `game`, `dino`, `STATE` and `audio` are top-level
// declarations in the game files (src/), so they are reachable by name from the page.
const read = (page, expr) => page.evaluate(expr);

async function waitFor(page, expr, timeout = 15000) {
  try {
    await page.waitForFunction(expr, null, { timeout, polling: 50 });
    return true;
  } catch {
    return false;
  }
}

function insideViewport(box, vp) {
  return (
    box &&
    box.x >= -0.5 &&
    box.y >= -0.5 &&
    box.x + box.width <= vp.width + 0.5 &&
    box.y + box.height <= vp.height + 0.5
  );
}

// Press the game's action the way this device would: Space on desktop, a tap
// on the big button on phones.
async function act(page, touch) {
  if (touch) await page.locator('#jump-btn').tap();
  else await page.keyboard.press('Space');
}

async function tapOrClick(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

// --- One device size --------------------------------------------------------

async function playOnDevice(browser, base, vp) {
  console.log(`\n${vp.name} (${vp.options.viewport.width}x${vp.options.viewport.height})`);
  const context = await browser.newContext({ ...vp.options });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => errors.push(`request failed: ${req.url()}`));
  const shot = (step) => page.screenshot({ path: path.join(SHOTS, `${vp.name}-${step}.png`) });

  await page.goto(`${base}/index.html`);
  check(
    'page loads and the game reaches the start screen',
    await waitFor(page, "game.state === 'IDLE'")
  );
  await shot('1-start');

  // Layout: the canvas and the jump button must be fully on screen.
  const size = page.viewportSize();
  const canvasBox = await page.locator('#gameCanvas').boundingBox();
  const jumpBox = await page.locator('#jump-btn').boundingBox();
  check('canvas fits on screen', insideViewport(canvasBox, size), JSON.stringify(canvasBox));
  // The big button only shows on touch screens; desktop uses Space or a click.
  const jumpVisible = await page.locator('#jump-btn').isVisible();
  if (vp.touch) {
    check(
      'jump button is visible and fits on screen',
      jumpVisible && insideViewport(jumpBox, size),
      JSON.stringify(jumpBox)
    );
  } else {
    check('jump button stays hidden on desktop', !jumpVisible);
  }
  for (const sel of ['#mute-btn', '#daily-btn', '#mode-toggle']) {
    const box = await page.locator(sel).boundingBox();
    check(`${sel} fits on screen`, insideViewport(box, size), JSON.stringify(box));
  }
  // Fullscreen button (S4): Chromium has the API, so it shows, fits and
  // overlaps none of the top-row buttons.
  const fsBtn = page.locator('#fullscreen-btn');
  check('fullscreen button shows where the API exists', await fsBtn.isVisible());
  const fsBox = await fsBtn.boundingBox();
  check('fullscreen button fits on screen', insideViewport(fsBox, size), JSON.stringify(fsBox));
  // Every pair in the top row stays at least 2px apart.
  const rowSels = ['#mute-btn', '#daily-btn', '#mode-toggle', '#fullscreen-btn'];
  const rowBoxes = [];
  for (const sel of rowSels) rowBoxes.push(await page.locator(sel).boundingBox());
  for (let i = 0; i < rowSels.length; i++) {
    for (let j = i + 1; j < rowSels.length; j++) {
      const a = rowBoxes[i];
      const b = rowBoxes[j];
      const apart =
        a.x + a.width + 2 <= b.x ||
        b.x + b.width + 2 <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      check(`${rowSels[i]} and ${rowSels[j]} do not overlap`, apart, JSON.stringify({ a, b }));
    }
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  check('no sideways scrolling', !overflow);

  // Portrait phones (S2): the one-time turn-sideways hint shows on a first
  // visit, and the canvas sits lower with the jump button near the bottom.
  const hintVisible = await page.locator('#rotate-hint').isVisible();
  if (vp.touch) {
    check(
      'big button says TAP TO START on the start screen',
      (await page.locator('#jump-btn').textContent()).trim() === 'TAP TO START'
    );
  }
  if (vp.portrait) {
    check('turn-sideways hint shows on a first portrait visit', hintVisible);
    check(
      'portrait canvas sits below the top third of the screen',
      canvasBox.y > size.height / 4,
      JSON.stringify(canvasBox)
    );
    check(
      'portrait jump button sits in the bottom quarter',
      jumpBox && jumpBox.y > (size.height * 3) / 4,
      JSON.stringify(jumpBox)
    );
  } else {
    check('turn-sideways hint stays hidden', !hintVisible);
  }

  // Start a run. The first visit keeps the full countdown.
  await act(page, vp.touch);
  check('action starts the countdown', await waitFor(page, "game.state === 'WAITING'", 3000));
  check(
    'countdown ends and the run starts',
    await waitFor(page, "game.state === 'RUNNING'", 10000)
  );
  check('the hint is gone once a run starts', !(await page.locator('#rotate-hint').isVisible()));
  // The big button says what a tap does now, at a fixed size (S3).
  const btnLabel = () => page.locator('#jump-btn').textContent();
  const btnBox = () => page.locator('#jump-btn').boundingBox();
  if (vp.touch) {
    check('big button says TAP TO JUMP in a run', (await btnLabel()).trim() === 'TAP TO JUMP');
  }
  const runBtnBox = vp.touch ? await btnBox() : null;

  // Jump straight away (nothing has spawned yet, so it is safe).
  await act(page, vp.touch);
  check('jump lifts the dino', await waitFor(page, 'dino.isJumping === true', 2000));
  await shot('2-jump');
  check('dino lands again', await waitFor(page, 'dino.isJumping === false', 3000));

  // Variable jump and fast fall with real input events (F3, desktop).
  if (!vp.touch) {
    // Height of the next flight above the ground, read every display frame.
    const flightPeak = () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            let min = dino.y;
            const tick = () => {
              min = Math.min(min, dino.y);
              if (dino.isJumping) requestAnimationFrame(tick);
              else resolve(GAME_CONFIG.CANVAS_H - dino.height - min);
            };
            requestAnimationFrame(tick);
          })
      );
    await page.evaluate(() => (game.obstacles.length = 0)); // keep the lane clear
    await page.keyboard.down('Space');
    const heldPeak = await flightPeak();
    await page.keyboard.up('Space');
    await page.evaluate(() => (game.obstacles.length = 0));
    const box = await page.locator('#gameCanvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const tapPeak = await flightPeak();
    check(
      `holding Space jumps higher than a quick click (${Math.round(heldPeak)} vs ${Math.round(tapPeak)}px)`,
      // Updated's lower take-off (M4) peaks about 93px held, 79 tapped.
      heldPeak > 85 && heldPeak > tapPeak + 8 && tapPeak < 100 && tapPeak > 55
    );
    await page.evaluate(() => (game.obstacles.length = 0));
    await page.keyboard.down('Space');
    await waitFor(page, 'dino.isJumping && dino.velocityY > -6', 2000);
    await page.keyboard.press('ArrowDown');
    check('Down drops the dino fast', await read(page, 'dino.dropping === true'));
    await page.keyboard.up('Space');
    check('dino lands after the drop', await waitFor(page, 'dino.isJumping === false', 2000));
  }

  // Portrait phones: the empty space below the canvas is a jump zone too.
  if (vp.portrait) {
    const box = await page.locator('#gameCanvas').boundingBox();
    // Keep the lane clear: at Chrome's start speed an obstacle can reach the
    // dino during this jump and end the run in the air.
    await page.evaluate(() => (game.obstacles.length = 0));
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 40);
    check('a tap below the canvas jumps', await waitFor(page, 'dino.isJumping === true', 2000));
    check('dino lands after the zone jump', await waitFor(page, 'dino.isJumping === false', 3000));
  }

  // Do nothing until an obstacle hits.
  check('the run ends on an obstacle', await waitFor(page, "game.state === 'DEAD'", 30000));
  const score = await read(page, 'Math.floor(game.score)');
  check('the run scored points', score > 0, `score ${score}`);
  // Let the Game Over card finish so the next press restarts.
  await waitFor(
    page,
    'Animations.deathShakeFrames <= 0 && Animations.deathAnimFrame >= deathAnimFrames()',
    5000
  );
  await shot('3-game-over');
  if (vp.touch) {
    check(
      'big button says TAP TO RESTART on Game Over',
      (await btnLabel()).trim() === 'TAP TO RESTART'
    );
    const deadBox = await btnBox();
    check(
      'the button keeps its size when the label changes',
      Math.abs(deadBox.width - runBtnBox.width) < 0.5 &&
        Math.abs(deadBox.height - runBtnBox.height) < 0.5,
      JSON.stringify([runBtnBox, deadBox])
    );
  }

  // Restart: after a death the countdown can be skipped.
  await act(page, vp.touch);
  const restarted = await waitFor(
    page,
    "game.state === 'WAITING' || game.state === 'RUNNING'",
    3000
  );
  check('action restarts after Game Over', restarted);
  await act(page, vp.touch);
  check(
    'a second press skips the countdown',
    await waitFor(page, "game.state === 'RUNNING'", 2000)
  );
  await shot('4-restart');

  // Switching apps or tabs pauses the run; coming back counts 3 2 1 first.
  const setVisibility = (state) =>
    page.evaluate((v) => {
      /* global Event */
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
      Object.defineProperty(document, 'hidden', { configurable: true, value: v === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  check('hiding the page pauses the run', (await read(page, 'game.state')) === 'PAUSED');
  const pausedScore = await read(page, 'game.score');
  await page.waitForTimeout(400);
  check('the score holds while hidden', (await read(page, 'game.score')) === pausedScore);
  await setVisibility('visible');
  check(
    'coming back starts the resume countdown',
    await waitFor(page, "game.state === 'PAUSED' && !game.pauseHidden", 1000)
  );
  await shot('4b-resume-countdown');
  check(
    'the run carries on after the countdown',
    await waitFor(page, "game.state === 'RUNNING' || game.state === 'DEAD'", 5000)
  );
  check(
    'the score picked up from where it paused',
    (await read(page, 'game.score')) >= pausedScore
  );

  // Mute toggles on and off.
  const mute = page.locator('#mute-btn');
  const wasMuted = await read(page, 'audio.muted');
  await tapOrClick(mute, vp.touch);
  check(
    'mute button toggles sound',
    (await read(page, 'audio.muted')) === !wasMuted &&
      (await mute.getAttribute('aria-pressed')) === String(!wasMuted)
  );
  await tapOrClick(mute, vp.touch);
  check('mute button toggles back', (await read(page, 'audio.muted')) === wasMuted);

  // Space on a focused button presses that button and nothing else (A2).
  if (!vp.touch) {
    await mute.evaluate((el) => el.blur()); // arrive by keyboard, as Tab would
    await mute.focus();
    // A run still going may end on its own; only a jump or a restart fails.
    const before = await read(page, '({ s: game.state, j: dino.isJumping })');
    await page.keyboard.press('Space');
    const after = await read(page, '({ s: game.state, j: dino.isJumping })');
    const noJump = before.s !== 'RUNNING' || before.j || !after.j || after.s === 'DEAD';
    const noRestart = before.s !== 'DEAD' || after.s === 'DEAD';
    check(
      'Space on the focused mute button mutes and does not jump or restart',
      (await read(page, 'audio.muted')) === !wasMuted && noJump && noRestart
    );
    await page.keyboard.press('Space');
    await mute.evaluate((el) => el.blur());
  }

  // After a mouse click on Mute, Space is a game key again (A2 follow-up).
  if (!vp.touch) {
    const mutedNow = await read(page, 'audio.muted');
    await mute.click();
    await page.keyboard.press('Space');
    check(
      'Space after clicking Mute does not press Mute again',
      (await read(page, 'audio.muted')) === !mutedNow
    );
    await mute.click();
    await mute.evaluate((el) => el.blur());
  }

  // Fullscreen on and off again (S4).
  await tapOrClick(fsBtn, vp.touch);
  check(
    'fullscreen button enters fullscreen',
    (await waitFor(page, '!!document.fullscreenElement', 3000)) &&
      (await fsBtn.getAttribute('aria-pressed')) === 'true'
  );
  await shot('4b-fullscreen');
  await tapOrClick(fsBtn, vp.touch);
  check(
    'fullscreen button exits cleanly',
    (await waitFor(page, '!document.fullscreenElement', 3000)) &&
      (await fsBtn.getAttribute('aria-pressed')) === 'false'
  );

  // Classic and back to Updated.
  await tapOrClick(page.locator('#mode-toggle [data-mode="classic"]'), vp.touch);
  check('Classic button switches mode', await waitFor(page, "game.mode === 'classic'", 2000));
  await shot('5-classic');
  await tapOrClick(page.locator('#mode-toggle [data-mode="updated"]'), vp.touch);
  check('Updated button switches mode back', await waitFor(page, "game.mode === 'updated'", 2000));

  // Daily on and off.
  const daily = page.locator('#daily-btn');
  await tapOrClick(daily, vp.touch);
  check(
    'Daily button starts the Daily Challenge',
    (await waitFor(page, "game.mode === 'daily'", 2000)) &&
      (await daily.getAttribute('aria-pressed')) === 'true'
  );
  await shot('6-daily');
  await tapOrClick(daily, vp.touch);
  check(
    'Daily button leaves the Daily Challenge',
    await waitFor(page, "game.mode === 'updated'", 2000)
  );

  check(
    'no console errors, page errors or failed requests',
    errors.length === 0,
    errors.slice(0, 5).join('\n      ')
  );
  await context.close();
}

// --- Offline: the service worker keeps the game playable ---------------------

async function checkOffline(browser, base) {
  console.log('\noffline (desktop)');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${base}/index.html`);
  const ready = await page
    .evaluate(() =>
      Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 10000)),
      ])
    )
    .catch(() => false);
  // `ready` resolves once the worker is active, i.e. its precache is filled.
  check('service worker installs', ready);
  await context.setOffline(true);
  let loaded = false;
  try {
    await page.reload();
    loaded = await waitFor(page, "typeof game !== 'undefined' && game.state === 'IDLE'", 10000);
  } catch {
    loaded = false;
  }
  check('game loads again with the network off', loaded);
  await context.close();
}

// --- A slow game file (C4) ------------------------------------------------

// The sprites can finish loading while the browser still waits for a later
// game file. The game must still start once that file arrives.
async function checkSlowGameFile(browser, base) {
  console.log('\nSlow game file (desktop)');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  await page.route('**/src/04-state.js*', async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ response });
  });
  await page.goto(`${base}/index.html`);
  check(
    'the game starts when a game file arrives after the sprites',
    await waitFor(page, "game.state === 'IDLE'", 10000)
  );
  check('no page errors while a game file is slow', errors.length === 0, errors.join('; '));
  await context.close();
}

// --- The ?tune=1 live tuning panel (dev only) -------------------------------

async function checkTunePanel(browser, base) {
  console.log('\n?tune=1 panel (desktop)');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  const scripts = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('request', (req) => scripts.push(req.url()));

  // A normal visit never fetches the panel.
  await page.goto(`${base}/index.html`);
  await waitFor(page, "game.state === 'IDLE'");
  check(
    'a normal visit does not load tune.js or show the panel',
    !scripts.some((u) => u.includes('tune.js')) && (await page.locator('#tune-panel').count()) === 0
  );

  await page.goto(`${base}/index.html?tune=1`);
  check('?tune=1 shows the panel', await waitFor(page, "!!document.getElementById('tune-panel')"));
  const rows = await page.locator('#tune-panel [data-key]').count();
  const keys = await read(page, 'TUNABLE_KEYS.length');
  check(`the panel lists every tunable key (${rows}/${keys})`, rows === keys && keys > 0);

  // Typing in a box changes the value live and does not start a run.
  const key = 'SKY_TINT_PEAK_ALPHA';
  const box = page.locator(`#tune-panel [data-key="${key}"] input[type="number"]`);
  await box.fill('0.3');
  await box.press('Enter');
  await box.press('Space');
  check('a typed value reaches GAME_TUNING and cfg()', (await read(page, `cfg('${key}')`)) === 0.3);
  check(
    'typing in the panel does not make the dino jump',
    (await read(page, 'game.state')) === 'IDLE'
  );
  await page.locator('#tune-panel button', { hasText: 'Save' }).click();
  check(
    'Save keeps the value in the browser',
    JSON.parse((await read(page, "localStorage.getItem('dino-tuning')")) || '{}')[key] === 0.3
  );
  await page.locator('#tune-panel button', { hasText: 'Reset' }).click();
  check(
    'Reset goes back to the default',
    (await read(page, `cfg('${key}') === GAME_CONFIG.${key}`)) === true
  );
  await page.screenshot({ path: path.join(SHOTS, 'desktop-tune-panel.png') });
  check('the panel logs no errors', errors.length === 0, errors.slice(0, 5).join('\n      '));
  await context.close();
}

// --- The unit-test page in a real browser -----------------------------------

async function checkTestRunner(browser, base) {
  console.log('\ntests/test-runner.html');
  const context = await browser.newContext();
  const page = await context.newPage();
  let summary = false;
  const errors = [];
  page.on('console', (msg) => {
    if (msg.text().includes('--- Test Summary ---')) summary = true;
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  await page.goto(`${base}/tests/test-runner.html`);
  const start = Date.now();
  while (!summary && Date.now() - start < 60000) await page.waitForTimeout(100);
  check('the page prints its Test Summary', summary);
  // `let` globals in a classic script are reachable by name, not via window.
  const totals = await page
    .evaluate('({ run: testsRun, passed: testsPassed })')
    .catch(() => ({ run: 0, passed: 0 }));
  check(
    `every unit test passes in the browser (${totals.passed}/${totals.run})`,
    totals.run > 0 && totals.passed === totals.run
  );
  // Every area file in tests/unit/files.js began, so none was silently skipped.
  const files = await page
    .evaluate('({ ran: testFiles.map((f) => f.name), want: UNIT_TEST_FILES })')
    .catch(() => ({ ran: [], want: ['?'] }));
  check(
    `every unit-test area file ran in the browser (${files.ran.length}/${files.want.length})`,
    files.want.length > 0 && files.want.every((name) => files.ran.includes(name)),
    `ran: ${files.ran.join(', ')}`
  );
  check(
    'the test page loads with no errors',
    errors.length === 0,
    errors.slice(0, 5).join('\n      ')
  );
  await context.close();
}

// --- Main -------------------------------------------------------------------

(async () => {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) await playOnDevice(browser, base, vp);
    await checkOffline(browser, base);
    await checkSlowGameFile(browser, base);
    await checkTunePanel(browser, base);
    await checkTestRunner(browser, base);
  } catch (err) {
    check('smoke test ran to the end', false, err.stack);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n--- Browser Smoke Summary ---\nPassed: ${passed}\nFailed: ${failed}`);
  console.log(`Screenshots: ${path.relative(process.cwd(), SHOTS)}/`);
  process.exit(failed > 0 ? 1 : 0);
})();
