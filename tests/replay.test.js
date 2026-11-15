// Golden-run replay tests (T3, #132).
//
// Each golden run is a fixed seed, a mode and a scripted list of jump frames.
// The harness plays the whole run headlessly through the real game loop, one
// 60Hz sim slice at a time, and records what happened: every obstacle that
// spawned (frame, type and the gap that was consumed), the frame the dino
// died on, and the final score. The recording must match the stored file in
// tests/golden/ exactly. Any change to physics, spawning, scoring, hitboxes
// or the game.rng() call order shows up as a readable diff.
//
// Re-record on purpose (after an intended gameplay change):
//   npm run test:replay -- --update
// That re-plans the jump frames with a simple autopilot and rewrites every
// golden file. Review the diff in git before committing it.
//
// Node only: it reads and writes files. Uses only what Section 10 exposes.

const { loadGame, gameSource } = require('../src/files.js');
loadGame();
const fs = require('fs');
const path = require('path');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.argv.includes('--update');
const MAX_FRAMES = 8000; // ~2 minutes of play (score ~780); a run that never dies stops here

// The golden runs. `autopilot` only matters when re-recording: it is how
// early the planner jumps (frames before contact) and how many obstacles it
// clears before it stops jumping, which is how a run is made to die early.
const RUNS = [
  { name: 'classic-long-run', mode: 'classic', seed: 12345, autopilot: { lead: 0 } },
  { name: 'classic-early-death', mode: 'classic', seed: 777, autopilot: { lead: 0, clear: 2 } },
  { name: 'updated-plateau', mode: 'updated', seed: 20261115, autopilot: { lead: 0 } },
  { name: 'updated-early-death', mode: 'updated', seed: 4242, autopilot: { lead: 0, clear: 4 } },
  // Daily uses a fixed seed (not today's), so the run is the same every day.
  { name: 'daily-fixed-seed', mode: 'daily', seed: 20260101, autopilot: { lead: 0 } },
];

// --- Running one run ------------------------------------------------------

// Put the game into a clean, known state for `mode` with `seed` queued, then
// leave it in WAITING exactly as a player's restart would.
function startRun(mode, seed) {
  cancelAnimationFrame(game.animationFrameId);
  game.mode = mode;
  game.highScore = 0;
  game.dailyBest = 0;
  game.state = STATE.IDLE;
  replayRunSeed(seed);
  resetGame();
  // Skip the countdown the same way every time: run the grace frames.
}

// Play one sim slice: exactly what a 60Hz tick does in the browser.
function step() {
  gameLoop();
  cancelAnimationFrame(game.animationFrameId);
}

// Play a whole run. `jumpAt` is a Set of frames (game.animFrame values while
// RUNNING) on which the player presses jump. `planner`, when given, decides
// jumps live instead and its choices are returned so they can be stored.
function playRun(spec, jumpAt, planner) {
  startRun(spec.mode, spec.seed);
  const seen = new Set();
  const obstacles = [];
  const jumps = [];
  const flights = [];
  let flight = null;
  let pendingGap = game.nextSpawnGap;
  let frames = 0;
  while (game.state !== STATE.RUNNING && frames++ < MAX_FRAMES) step();

  while (game.state === STATE.RUNNING && game.animFrame < MAX_FRAMES) {
    const frame = game.animFrame;
    const press = planner ? planner(frame) : jumpAt.has(frame);
    if (press && !dino.isJumping) {
      handleAction();
      jumps.push(frame);
    }
    step();
    for (const obs of game.obstacles) {
      if (seen.has(obs)) continue;
      seen.add(obs);
      obstacles.push({ frame: game.animFrame, type: obs.type, gap: pendingGap });
      pendingGap = game.nextSpawnGap;
    }
    // Each jump's take-off frame, landing frame and highest point (canvas y,
    // smaller is higher), so a physics change shows up even when it does not
    // change who lives or dies.
    if (dino.isJumping && !flight) flight = { up: frame, peakY: dino.y };
    if (flight) {
      flight.peakY = Math.min(flight.peakY, dino.y);
      if (!dino.isJumping || game.state !== STATE.RUNNING) {
        flights.push([flight.up, game.animFrame, Number(flight.peakY.toFixed(3))]);
        flight = null;
      }
    }
  }

  return {
    mode: spec.mode,
    seed: spec.seed,
    jumps,
    result: {
      died: game.state === STATE.DEAD,
      deathFrame: game.state === STATE.DEAD ? game.animFrame : null,
      finalScore: Math.floor(game.score),
      finalSpeed: Number(game.currentSpeed.toFixed(6)),
      obstacleCount: obstacles.length,
      flights,
      obstacles,
    },
  };
}

// A simple autopilot used only when re-recording. It jumps when the nearest
// obstacle ahead is about to reach the dino, and after `clear` obstacles it
// stops, so the run dies on the next one.
function makePlanner(opts) {
  let cleared = 0;
  let target = null;
  return () => {
    const ahead = game.obstacles.filter((o) => o.x + o.width > dino.x).sort((a, b) => a.x - b.x)[0];
    if (target && (!ahead || ahead !== target)) {
      cleared++;
      target = null;
    }
    if (!ahead || dino.isJumping) return false;
    if (opts.clear != null && cleared >= opts.clear) return false;
    const framesToContact = (ahead.x - (dino.x + dino.width)) / game.currentSpeed;
    const trigger = 12 + (opts.lead || 0) + Math.ceil(ahead.width / game.currentSpeed / 2);
    if (framesToContact <= trigger) {
      target = ahead;
      return true;
    }
    return false;
  };
}

// --- Comparing ------------------------------------------------------------

function diff(expected, actual, at = '') {
  const out = [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const n = Math.max(expected.length, actual.length);
    for (let i = 0; i < n && out.length < 12; i++) {
      if (i >= expected.length) out.push(`  ${at}[${i}]: extra ${JSON.stringify(actual[i])}`);
      else if (i >= actual.length)
        out.push(`  ${at}[${i}]: missing, expected ${JSON.stringify(expected[i])}`);
      else out.push(...diff(expected[i], actual[i], `${at}[${i}]`));
    }
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) out.push(...diff(expected[k], actual[k], at ? `${at}.${k}` : k));
    return out;
  }
  if (expected !== actual) {
    out.push(`  ${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return out;
}

function goldenPath(name) {
  return path.join(GOLDEN_DIR, `${name}.json`);
}

function writeGolden(name, run) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  // One obstacle per line keeps git diffs readable.
  const obs = run.result.obstacles.map((o) => '      ' + JSON.stringify(o)).join(',\n');
  const { obstacles, flights, ...rest } = run.result;
  void obstacles;
  const fl = flights.map((f) => '      ' + JSON.stringify(f)).join(',\n');
  const text =
    '{\n' +
    `  "mode": ${JSON.stringify(run.mode)},\n` +
    `  "seed": ${run.seed},\n` +
    `  "jumps": ${JSON.stringify(run.jumps)},\n` +
    '  "result": {\n' +
    Object.entries(rest)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`)
      .join('') +
    `    "flights": [\n${fl}\n    ],\n` +
    `    "obstacles": [\n${obs}\n    ]\n` +
    '  }\n' +
    '}\n';
  fs.writeFileSync(goldenPath(name), text);
}

// --- Main -----------------------------------------------------------------

let failures = 0;
let passes = 0;
function check(label, ok, detail) {
  if (ok) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}`);
    if (detail) console.log(detail);
  }
}

// Silence the game's own console noise (announce(), etc.) during runs.
const quiet = (fn) => {
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

const savedMode = game.mode;
const savedTuning = Object.assign({}, window.GAME_TUNING || {});

console.log('\nGolden-run replays (T3)');

if (UPDATE) {
  for (const spec of RUNS) {
    const planned = quiet(() => playRun(spec, null, makePlanner(spec.autopilot)));
    writeGolden(spec.name, planned);
    const r = planned.result;
    console.log(
      `  recorded ${spec.name}: ${r.died ? 'died at frame ' + r.deathFrame : 'survived'}, ` +
        `score ${r.finalScore}, ${r.obstacleCount} obstacles, ${planned.jumps.length} jumps`
    );
  }
}

const goldens = {};
for (const spec of RUNS) {
  const file = goldenPath(spec.name);
  if (!fs.existsSync(file)) {
    check(`${spec.name} has a golden file`, false, `  missing ${file}; run with --update`);
    continue;
  }
  const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
  goldens[spec.name] = golden;
  const actual = quiet(() => playRun(golden, new Set(golden.jumps)));
  const d = diff(golden.result, actual.result);
  check(
    `${spec.name} replays exactly (score ${golden.result.finalScore}, ` +
      `${golden.result.died ? 'dies at frame ' + golden.result.deathFrame : 'survives'})`,
    d.length === 0,
    d.length ? `  Changed values in ${path.relative(process.cwd(), file)}:\n${d.join('\n')}` : ''
  );
}

// The golden set must cover what #132 asks for.
const all = Object.values(goldens);
check(
  'at least one golden run reaches the plateau (score 640 or more)',
  all.some((g) => g.result.finalScore >= 640)
);
check(
  'at least one golden run dies early (before score 100)',
  all.some((g) => g.result.died && g.result.finalScore < 100)
);
check(
  'Classic, Updated and Daily all have golden runs',
  ['classic', 'updated', 'daily'].every((m) => all.some((g) => g.mode === m))
);

// Determinism contract: visual-only live-tuning overrides must not change a run.
// Tune every key the game reads through cfg() (or a cfg() helper) at once, far from its default,
// so a gameplay value that slips into cfg() later is caught here too.
const { cfgKeysInSource } = require('./tunable-keys.js');
const cfgKeys = cfgKeysInSource(gameSource());
const VISUAL_OVERRIDES = {};
for (const key of cfgKeys) {
  const v = GAME_CONFIG[key];
  if (typeof v === 'number') VISUAL_OVERRIDES[key] = v * 3 + 1;
  else if (typeof v === 'string') VISUAL_OVERRIDES[key] = v.startsWith('#') ? '#123456' : v;
}
check(
  `found the cfg() tunables to override (${Object.keys(VISUAL_OVERRIDES).length})`,
  Object.keys(VISUAL_OVERRIDES).length >= 10
);
for (const name of ['classic-long-run', 'updated-plateau', 'daily-fixed-seed']) {
  const golden = goldens[name];
  if (!golden) continue;
  window.GAME_TUNING = Object.assign({}, savedTuning, VISUAL_OVERRIDES);
  const actual = quiet(() => playRun(golden, new Set(golden.jumps)));
  window.GAME_TUNING = Object.assign({}, savedTuning);
  const d = diff(golden.result, actual.result);
  check(`${name} is unchanged with visual GAME_TUNING overrides`, d.length === 0, d.join('\n'));
}

cancelAnimationFrame(game.animationFrameId);
game.mode = savedMode;

console.log(`\n--- Replay Summary ---\nPassed: ${passes}\nFailed: ${failures}`);
if (failures > 0) {
  console.log('If the change was intended, re-record with: npm run test:replay -- --update');
  process.exit(1);
}
