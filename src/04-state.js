// == SECTION 4: GAME STATE ==

// mulberry32 — tiny seeded PRNG (~32-bit state). Swappable via `game.rng` so
// tests can pin it to a deterministic sequence.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Compute the gap (px) to the next obstacle, given current speed + an RNG.
// Classic keeps the shrinking pixel curve, floored at MIN_SPAWN_GAP, with no
// jitter. Updated and Daily use that same curve early; once it would compress
// time-between-obstacles below one focused jump, the gap scales with speed so
// the worst jitter still leaves UPDATED_MIN_GAP_FRAMES. Jitter is one rng()
// call, same as before — type is rolled first by the caller.
function computeNextSpawnGap(rng, currentSpeed, mode) {
  const classicBase =
    GAME_CONFIG.MAX_SPAWN_GAP -
    (currentSpeed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR;
  if (mode === 'classic') {
    return Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.round(classicBase));
  }
  const minTimeGap = currentSpeed * GAME_CONFIG.UPDATED_MIN_GAP_FRAMES;
  const fairBase = minTimeGap / (1 - GAME_CONFIG.SPAWN_GAP_JITTER);
  const baseGap = Math.max(classicBase, fairBase);
  const jitter = (rng() - 0.5) * 2 * GAME_CONFIG.SPAWN_GAP_JITTER; // range [-J, +J]
  // ceil keeps the worst gap on a whole pixel without dipping under the frame budget.
  const floor = Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.ceil(minTimeGap));
  return Math.max(floor, Math.round(baseGap * (1 + jitter)));
}

// Pick an obstacle type weighted by score-tier eligibility. Types with
// unlockScore > score are excluded; among the rest, each contributes its
// `weight` to a weighted random draw. In classic mode, only the small cactus
// is ever returned — matches the original Chrome T-Rex's spartan look.
function pickObstacleType(rng, score, mode) {
  if (mode === 'classic') return GAME_CONFIG.OBSTACLE_TYPES[0]; // small cactus
  const eligible = GAME_CONFIG.OBSTACLE_TYPES.filter((t) => score >= t.unlockScore);
  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return eligible[eligible.length - 1]; // rounding guard
}

const DifficultyProfile = {
  speedAtScore(score) {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT } = GAME_CONFIG;
    return (
      INITIAL_SPEED +
      (PLATEAU_SPEED - INITIAL_SPEED) *
        (1 / (1 + Math.exp(-RAMP_STEEPNESS * (score - RAMP_MIDPOINT))))
    );
  },
  nextObstacle(score, mode, rng) {
    const speed = this.speedAtScore(score);
    // RNG call order is load-bearing: type roll first, gap jitter second.
    // Swapping breaks the daily-challenge seed sequence.
    const type = pickObstacleType(rng, score, mode);
    return {
      type,
      gap: computeNextSpawnGap(rng, speed, mode),
    };
  },
};

const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated', DAILY: 'daily' });

// Read the saved mode (defaults to 'updated' for first-time players). Persists
// across reload so the user's preference is remembered.
function loadMode() {
  const stored = safeStorage.get('dino-mode');
  return stored === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
}

// --- Daily challenge helpers -------------------------------------------
// One shared calendar: UTC. dailySeed(), dailyNumber(), and the
// dino-daily-date key all flip together at 00:00 UTC. Local wall-clock
// time does not choose the course, the #N, or TODAY BEST.
// Epoch: project launch 2026-03-01 00:00 UTC. Day 1 = that UTC date.
const DAILY_EPOCH_MS = new Date('2026-03-01T00:00:00Z').getTime();

// Today's UTC date as a YYYYMMDD integer. Same value for every player
// on the same UTC day. Seeds daily runs and keys dino-daily-date.
function dailySeed() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// Ordinal UTC day shown on pre-run framing, the Game Over screen, and in
// share text (#1, #2, …). 86400000 ms steps from the UTC epoch, so this
// matches dailySeed()'s calendar day. Display-only — not a second calendar.
function dailyNumber() {
  return Math.floor((Date.now() - DAILY_EPOCH_MS) / 86400000) + 1;
}

// Pre-run framing. A shared-course reminder, not a score. The daily number
// is composed when the line is drawn or announced, so GET READY shows the
// same UTC #N as Game Over and share. Drawn only on the GET READY overlay
// while WAITING in a Daily Challenge. Static — no pulse.
const DAILY_PRE_RUN_LINE = 'Same course as everyone today';

function dailyPreRunLine() {
  return DAILY_PRE_RUN_LINE + ' · #' + dailyNumber();
}

// Death-screen hint. One quiet line after the score count-up, pointing at
// TODAY BEST and the existing Copy result button. Static — no pulse.
const DAILY_DEATH_HINT = 'Share TODAY BEST with Copy result';

// All mutable game state lives on this object. Keeping it in one place prevents
// stray top-level globals and makes resets + test inspection simpler.
// One clock read so the stored run seed is the same integer the RNG was built from.
const bootSeed = Date.now() >>> 0;
const game = {
  state: STATE.LOADING,
  obstacles: [],
  currentSpeed: GAME_CONFIG.INITIAL_SPEED,
  lastObstacleX: -300,
  nextSpawnGap: GAME_CONFIG.MAX_SPAWN_GAP,
  graceFrames: GAME_CONFIG.GRACE_FRAMES,
  animationFrameId: undefined,
  score: 0,
  highScore: ScoreStore.loadHighScore(),
  animFrame: 0,
  groundX: 0,
  clouds: [],
  stars: [],
  starsInitialised: false,
  // Running frames since stars appeared. 0 until night init; caps at the fade length.
  starFadeFrames: 0,
  hills: [],
  milestoneText: '',
  newBestShown: false,
  plateauCueShown: false,
  // QA/debug only. game.qa<Flag>Shown latches once a ?qa<Flag>=1 overlay
  // has been spent; game.qa<Flag>Hold counts its frames down. One pair per
  // row of QA_FLAGS that needs it.
  ...initialQaHolds(),
  // QA/debug only. The share button was put back after the ?qaCountUp=1 card.
  qaCountUpShareCleared: false,
  isNewBest: false,
  previousHighScore: 0,
  // Set on a Daily death before today best is saved. Mirrors isNewBest:
  // true when this run beats today, including the first run of the day.
  isNewTodayBest: false,
  previousDailyBest: 0,
  // Boot seed matches the RNG created below. resetGame() replaces it with
  // the daily seed or a fresh clock seed before the next run.
  runSeed: bootSeed,
  seedOverride: null,
  lastGaps: [],
  lastObstacleTypes: [],
  lastJumpFrame: null,
  deathLog: null,
  rng: mulberry32(bootSeed),
  mode: loadMode(),
  dailyBest: ScoreStore.loadDailyBest(),
  // False until the player has died once this session. First IDLE → WAITING
  // keeps the full countdown; restarts after death can skip it.
  countdownSkippable: false,
};

// All per-run animation countdown timers. Kept separate from the game object
// so reset() is a single call and adding a new timer has exactly one place.
const Animations = {
  deathAnimFrame: 0,
  deathShakeFrames: 0,
  deathFlashFrames: 0,
  scorePopFrames: 0,
  milestoneFrames: 0,
  newBestFrames: 0,
  copyFlashFrames: 0,
  reset() {
    this.deathAnimFrame = this.deathShakeFrames = this.deathFlashFrames = 0;
    this.scorePopFrames = this.milestoneFrames = this.newBestFrames = 0;
    this.copyFlashFrames = 0;
  },
};

function setMode(newMode) {
  game.mode = newMode === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
  safeStorage.set('dino-mode', game.mode);
  refreshModeToggle();
  // Restart the run cleanly so the new mode's spawn rules take effect immediately.
  cancelAnimationFrame(game.animationFrameId);
  resetGame();
  gameLoop();
}

// The Daily share string. Title and url stay inside this text so a system
// share sheet does not repeat them. Clipboard fallback uses the same string.
function dailyShareText() {
  const score = game.dailyBest > 0 ? game.dailyBest : Math.floor(game.score);
  return [
    'Rex Daily #' + dailyNumber() + ' 🦕',
    'Score: ' + score,
    'https://snehiths19.github.io/chrome-offline-Rex/',
  ].join('\n');
}

function canOfferNativeShare() {
  if (qa.share) return false;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  // A browser can expose share() and still have no sheet (desktop Linux).
  // canShare() === false means the clipboard path, which flashes Copied.
  if (typeof navigator.canShare !== 'function') return true;
  try {
    return navigator.canShare({ text: dailyShareText() }) === true;
  } catch {
    return false;
  }
}

// Dismissing the sheet, or tapping again while it is already open, should
// not look like a successful share and should not copy.
function isShareQuietFailure(err) {
  const name = err && err.name;
  return name === 'AbortError' || name === 'InvalidStateError';
}

function writeDailyShareClipboard(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText)
    return;
  // writeText can throw synchronously when the clipboard is blocked.
  // That must not escape: the Copied flash is independent of the write.
  try {
    const pending = navigator.clipboard.writeText(text);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch {
    /* clipboard blocked */
  }
}

// Build the daily result string. Copies it when the system share sheet is
// unavailable. A capable browser leaves the sheet to the Copy result tap,
// so calling this for its text does not open a sheet or also copy.
// Returns the text so tests can assert its shape without touching clipboard.
function shareDailyResult() {
  const text = dailyShareText();
  if (!qa.share && !canOfferNativeShare()) writeDailyShareClipboard(text);
  return text;
}

// --- Opt-in death log (Scout / bug evidence) ---------------------------
// Off unless the page is opened with ?debug=1 or DevTools calls
// enableDeathLog(). Nothing here feeds spawn, score, or hitboxes.
//
//   enableDeathLog()     // start recording this session
//   disableDeathLog()
//   replayRunSeed(12345) // next resetGame() uses this seed, then forgets it
//   dumpRun()            // latest death JSON, or a live snapshot
//   copyDeathLog()       // same payload on the clipboard
// Press L while debug is on to log the current run.
const DEATH_LOG_HISTORY = 8;
let runDebug = false;

function isDeathLogEnabled() {
  return runDebug;
}

function enableDeathLog() {
  runDebug = true;
}

function disableDeathLog() {
  runDebug = false;
}

function applyDebugFromLocation() {
  if (typeof location === 'undefined' || !location || typeof location.search !== 'string') return;
  if (/(?:^|[?&])debug=1(?:&|$)/.test(location.search)) runDebug = true;
}

function replayRunSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return;
  game.seedOverride = n >>> 0;
}

function takeRunSeed() {
  if (game.seedOverride != null) {
    const seed = game.seedOverride >>> 0;
    game.seedOverride = null;
    return seed;
  }
  return isDailyMode() ? dailySeed() : Date.now() >>> 0;
}

function copyText(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText)
    return;
  try {
    const pending = navigator.clipboard.writeText(text);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch {
    /* clipboard unavailable or blocked */
  }
}

function noteSpawnForDeathLog(gapPx, typeId, speed) {
  if (!runDebug) return;
  const framesApprox = speed > 0 ? Math.max(1, Math.round(gapPx / speed)) : 0;
  game.lastGaps.push({
    px: gapPx,
    framesApprox,
    msApprox: Math.round((framesApprox * 1000) / 60),
  });
  game.lastObstacleTypes.push(typeId);
  if (game.lastGaps.length > DEATH_LOG_HISTORY) game.lastGaps.shift();
  if (game.lastObstacleTypes.length > DEATH_LOG_HISTORY) game.lastObstacleTypes.shift();
}

function buildRunSnapshot(reason) {
  return {
    reason,
    mode: game.mode,
    score: Math.floor(game.score),
    seed: game.runSeed,
    speed: Math.round(game.currentSpeed * 100) / 100,
    nextSpawnGap: game.nextSpawnGap,
    lastGaps: game.lastGaps.map((g) => ({
      px: g.px,
      framesApprox: g.framesApprox,
      msApprox: g.msApprox,
    })),
    lastObstacleTypes: game.lastObstacleTypes.slice(),
    diedAtFrame: reason === 'death' ? game.animFrame : null,
    framesSinceJump: game.lastJumpFrame == null ? null : game.animFrame - game.lastJumpFrame,
  };
}

function publishRunSnapshot(snapshot) {
  game.deathLog = snapshot;
  const text = JSON.stringify(snapshot, null, 2);
  console.log('[rex-death-log]\n' + text);
  copyText(text);
  return snapshot;
}

function dumpRun() {
  if (!runDebug) return null;
  if (game.state === STATE.DEAD && game.deathLog) return game.deathLog;
  return buildRunSnapshot('key');
}

function copyDeathLog() {
  if (!runDebug) return null;
  const snapshot =
    game.state === STATE.DEAD && game.deathLog ? game.deathLog : buildRunSnapshot('key');
  const text = JSON.stringify(snapshot, null, 2);
  copyText(text);
  return text;
}

function handleDebugKey(event) {
  if (!runDebug || !event || event.code !== 'KeyL') return;
  if (game.state === STATE.DEAD && game.deathLog) {
    copyText(JSON.stringify(game.deathLog, null, 2));
    return;
  }
  publishRunSnapshot(buildRunSnapshot('key'));
}

function drawDebugHud() {
  if (!runDebug) return;
  const speed = (Math.round(game.currentSpeed * 100) / 100).toFixed(2);
  const line =
    'dbg ' +
    game.mode +
    ' ' +
    Math.floor(game.score) +
    ' spd ' +
    speed +
    ' gap ' +
    game.nextSpawnGap +
    ' seed ' +
    game.runSeed;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#c8c8c8' : '#6a6a6a';
  ctx.font = '11px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(line, 8, 12);
  ctx.restore();
}

applyDebugFromLocation();
window.enableDeathLog = enableDeathLog;
window.disableDeathLog = disableDeathLog;
window.dumpRun = dumpRun;
window.copyDeathLog = copyDeathLog;
window.replayRunSeed = replayRunSeed;
