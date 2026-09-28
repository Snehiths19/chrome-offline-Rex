// == SECTION 1: NODE STUBS ==
// Minimal browser-API stubs so script.js can be `require`d from tests/game.test.js
// under plain Node without a DOM. Real browsers skip this block.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    innerWidth: 600,
    devicePixelRatio: 1,
  };
  const nodeStubs = {};
  function stubNode() {
    return {
      _listeners: {},
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      setAttribute() {},
      dataset: {},
      textContent: '',
    };
  }
  global.document = {
    getElementById: (id) => {
      if (id === 'gameCanvas') {
        if (!nodeStubs.gameCanvas) {
          nodeStubs.gameCanvas = {
            width: 600,
            height: 200,
            style: {},
            getContext: () => ({
              drawImage: () => {},
              clearRect: () => {},
              fillRect: () => {},
              fillText: () => {},
              arc: () => {},
              beginPath: () => {},
              closePath: () => {},
              fill: () => {},
              stroke: () => {},
              moveTo: () => {},
              lineTo: () => {},
              measureText: () => ({ width: 0 }),
              save: () => {},
              restore: () => {},
              translate: () => {},
              scale: () => {},
              setTransform: () => {},
              ellipse: () => {},
              fillStyle: '',
              strokeStyle: '',
              font: '',
              textAlign: '',
              globalAlpha: 1,
            }),
            addEventListener: () => {},
          };
        }
        return nodeStubs.gameCanvas;
      }
      if (!nodeStubs[id]) nodeStubs[id] = stubNode();
      return nodeStubs[id];
    },
    addEventListener: () => {},
  };
  global.Image = class { constructor() { this.onload = null; this.onerror = null; this.src = ''; this.width = 1; this.height = 1; this.complete = true; } };
  global.requestAnimationFrame = (cb) => {
    const id = setImmediate(() => cb(Date.now()));
    id.unref(); // don't keep Node alive after tests complete
    return id;
  };
  global.cancelAnimationFrame = (id) => clearImmediate(id);
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  window.document = global.document;
}

// == SECTION 2: CONFIGURATION ==

const GAME_CONFIG = Object.freeze({
  // --- Canvas logical dimensions ---
  CANVAS_W: 600,
  CANVAS_H: 200,

  // --- Physics ---
  JUMP_POWER:              -12,   // negative = upward impulse applied on jump
  GRAVITY:                  0.48, // added to velocityY each frame while airborne
  INITIAL_SPEED:            3.0,  // obstacle scroll speed at score 0
  SPEED_CAP:               13.0,  // max scroll speed (matches Chrome T-Rex)
  PLATEAU_SPEED:            8.0,  // sigmoid ceiling — focusable-but-demanding speed the curve approaches
  RAMP_MIDPOINT:          300,    // score where acceleration is steepest (day/night transition)
  RAMP_STEEPNESS:           0.01, // sigmoid slope — controls how quickly speed rises through the midpoint
  SCORE_PER_LEVEL:        100,    // score points per level — used for milestone flash effects only
  SCORE_INCREMENT:          0.1,  // score added per frame while RUNNING

  // --- Hitbox forgiveness (rendering uses full sprite; collision uses shrunken box) ---
  DINO_PAD_X:               8,
  DINO_PAD_Y_TOP:           8,
  DINO_PAD_Y_BOT:           2,
  OBS_PAD_X:                3,
  OBS_PAD_Y:                2,

  // --- Spawning ---
  GRACE_FRAMES:           240,    // ~4 s at 60 fps before first obstacle appears
  MAX_SPAWN_GAP:          600,    // gap (px) between obstacles at INITIAL_SPEED
  MIN_SPAWN_GAP:          340,    // classic floor (px). Updated/Daily never go below this either.
  SPAWN_GAP_SPEED_FACTOR:  50,    // classic gap shrinks by this much per +1 speed above INITIAL_SPEED
  SPAWN_GAP_JITTER:         0.3,  // ±30% in Updated/Daily; classic skips jitter
  // Worst-case frames between Updated/Daily obstacles once the shrinking curve
  // would leave less than one focused jump. A jump is 49 frames at the current
  // JUMP_POWER/GRAVITY; 72 also covers a cluster's width plus a short read.
  // The base gap sits at this / (1 - JITTER), so ±30% rarely piles onto the floor.
  UPDATED_MIN_GAP_FRAMES:  72,

  // --- Obstacle sprite (small cactus — baseline) ---
  OBS_WIDTH:               20,
  OBS_HEIGHT:              40,

  // --- Obstacle types ---
  // Each type unlocks at a score threshold and contributes its `weight` to the
  // weighted random pick once unlocked. `render` controls how drawObstacles()
  // paints it from the single cactus sprite.
  OBSTACLE_TYPES: Object.freeze([
    Object.freeze({ id: 'small',   width: 20, height: 40, unlockScore:   0, weight: 50, render: 'single' }),
    Object.freeze({ id: 'big',     width: 30, height: 55, unlockScore: 100, weight: 30, render: 'single' }),
    Object.freeze({ id: 'cluster', width: 50, height: 40, unlockScore: 250, weight: 20, render: 'double' }),
  ]),

  // --- Dino sprite ---
  DINO_X:                  50,
  DINO_WIDTH:              40,
  DINO_HEIGHT:             50,

  // --- Clouds ---
  CLOUD_COUNT:              3,
  CLOUD_MIN_Y:             10,
  CLOUD_Y_RANGE:           40,
  CLOUD_MIN_SPEED:          0.3,
  CLOUD_SPEED_RANGE:        0.3,
  CLOUD_WIDTH:             60,    // used for offscreen detection
  CLOUD_RESPAWN_OFFSET:    20,    // x-offset past right edge when respawning
  CLOUD_COLOR:             '#e8e8e8',
  CLOUD_CIRCLES: Object.freeze([  // three circles forming a puffy cloud shape
    Object.freeze([  0, 0, 18]),
    Object.freeze([-18, 8, 14]),
    Object.freeze([ 18, 8, 14]),
  ]),

  // --- Day / Night ---
  DAY_NIGHT_START:        300,
  DAY_NIGHT_END:          400,
  STAR_COUNT:              12,
  STAR_SIZE:                2,
  STAR_Y_RANGE:           100,
  STAR_COLOR:              '#ffffff',
  // Visual only. Running frames stars take to ramp from invisible to full
  // once night is complete (~0.8 s at 60 fps). Read through cfg().
  STAR_FADE_FRAMES:        48,

  // --- Ambient depth (PR-D, updated mode only) ---
  HILL_COUNT:               3,    // mid-ground silhouette mounds
  HILL_PARALLAX:            0.2,  // fraction of obstacle speed at which hills scroll
  HILL_MIN_WIDTH:         120,
  HILL_WIDTH_RANGE:        80,
  HILL_MIN_HEIGHT:         40,
  HILL_HEIGHT_RANGE:       30,
  HILL_RESPAWN_X_RANGE:    50,    // px of jitter past the right edge when a hill respawns
  HILL_COLOR_DAY:          '#cdcdcd',
  HILL_COLOR_NIGHT:        '#3a3a55',
  CLOUD_SPEED_FACTOR_UPDATED: 1.5, // multiply cloud speed in updated mode for stronger parallax
  SKY_TINT_PEAK_ALPHA:      0.12, // gold sky-flash peak alpha during milestone
  SKY_TINT_COLOR_RGB:      '255, 215, 0',   // gold sky-flash colour (rgb triplet, alpha applied at draw)
  PARTICLE_EMIT_SPREAD:     4,    // px width of the cosmetic xy jitter on every particle emit

  // --- Effects ---
  DEATH_ANIM_FRAMES:       30,    // frames for the score count-up after shake ends
  DEATH_SHAKE_FRAMES:      12,
  DEATH_SHAKE_AMPLITUDE:    4,
  DEATH_SHAKE_FREQ:         1.5,  // multiplier on the sin oscillation that drives the shake transform
  DEATH_FLASH_FRAMES:       6,    // PR-C: white-flash overlay length on collision
  DEATH_FLASH_COLOR_RGB:   '255, 255, 255', // death-flash overlay colour (rgb triplet, alpha applied at draw)
  SCORE_POP_FRAMES:        12,    // PR-C: HUD score scale-up duration during death shake
  MILESTONE_FRAMES:        90,
  NEW_BEST_FRAMES:        120,
  // Soft ceiling for the once-per-run plateau cue. The speed curve approaches
  // PLATEAU_SPEED but never reaches it; 0.98 is about score 641. Visual only —
  // speed, gaps, and scoring still read the curve directly, not this ratio.
  PLATEAU_REACH_RATIO:      0.98,

  // --- HUD ---
  SCORE_X_OFFSET:         150,    // pixels from right edge for the current-score label
  SCORE_Y:                 30,
  SCORE_HI_X_OFFSET:      110,    // additional px left of SCORE_X_OFFSET for the HI label
  SCORE_FONT_FAMILY:      "'Courier New', Courier, monospace",

  // --- Animation ---
  RUN_FRAME_PERIOD:        10,    // swap run-cycle sprite every N frames (~167 ms @ 60 fps)

  // --- Asset loading ---
  ASSET_LOAD_TIMEOUT_MS: 5000,    // force WAITING state even if assets never finish loading
});

// --- Live-tuning hook (visual-only) -----------------------------------
// cfg(key) reads window.GAME_TUNING[key] when set, else falls back to
// GAME_CONFIG[key]. ONLY use cfg() for visual keys (colours, alphas,
// fade lengths, shake amplitude/freq, particle spread, parallax). Physics, spawning,
// scoring, and hitboxes MUST continue to read GAME_CONFIG.X directly so
// determinism is preserved across runs and tuning sessions.
//
// Workflow from DevTools:
//   GAME_TUNING.SKY_TINT_PEAK_ALPHA = 0.3
//   saveTuning()                            // persist to localStorage
//   location.reload()                       // verify hydration
function cfg(key) {
  const t = window.GAME_TUNING;
  if (t && Object.prototype.hasOwnProperty.call(t, key)) return t[key];
  return GAME_CONFIG[key];
}

function loadTuning() {
  window.GAME_TUNING = window.GAME_TUNING || {};
  try {
    const raw = localStorage.getItem('dino-tuning');
    if (raw) Object.assign(window.GAME_TUNING, JSON.parse(raw));
  } catch (e) { /* malformed JSON or disabled storage — keep defaults */ }
}

function saveTuning() {
  try {
    localStorage.setItem('dino-tuning', JSON.stringify(window.GAME_TUNING || {}));
    return true;
  } catch (e) { return false; }
}

loadTuning();

const ScoreStore = {
  loadHighScore()      { return parseInt(localStorage.getItem('dino-high-score') || '0', 10); },
  saveHighScore(n)     { localStorage.setItem('dino-high-score', String(n)); },
  loadDailyBest() {
    const storedDate = parseInt(localStorage.getItem('dino-daily-date') || '0', 10);
    if (storedDate !== dailySeed()) return 0;
    return parseInt(localStorage.getItem('dino-daily-best') || '0', 10);
  },
  saveDailyBest(score) {
    if (score > this.loadDailyBest()) {
      localStorage.setItem('dino-daily-date', String(dailySeed()));
      localStorage.setItem('dino-daily-best', String(score));
    }
  },
};

const STATE = Object.freeze({
  LOADING: 'LOADING',
  IDLE:    'IDLE',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});

// Respect the user's OS-level reduce-motion preference. Read once at startup —
// ambient motion is suppressed when true. Hill respawn still consumes game.rng()
// (see updateHills) so a Daily seed yields the same obstacle sequence either way.
// Tests flip the flag through setReducedMotion(); players do not.
let reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function setReducedMotion(enabled) {
  reducedMotion = !!enabled;
}

// QA/debug only — not for players. ?qaPlateau=1 fires a once-per-run heel puff
// at QA_PLATEAU_SCORE so playtest can see it without reaching the plateau.
// Read at boot and again in resetGame() so a mode toggle still honors the
// query. Does not change speed, gaps, or game.rng(). Tests flip it through
// setQaPlateau(); a normal visit leaves this false.
const QA_PLATEAU_SCORE = 1;

function readQaPlateauFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaPlateau') === '1';
}

let qaPlateau = readQaPlateauFlag();

function setQaPlateau(enabled) {
  qaPlateau = !!enabled;
}

// QA/debug only — not for players. ?qaCluster=1 forces the first Updated/Daily
// obstacle to be a cluster so playtest can see the silhouette without
// reaching score 250. The type roll is still consumed, so gaps and later
// picks keep their RNG order. Classic never takes the override. Re-read in
// resetGame() like ?qaPlateau=1. Tests flip it through setQaCluster().
function readQaClusterFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaCluster') === '1';
}

let qaCluster = readQaClusterFlag();

function setQaCluster(enabled) {
  qaCluster = !!enabled;
}

// QA/debug only — not for players. ?qaNight=1 paints full night from the
// first frame so the star fade can be seen without a score-400 run.
// Sky, hills, HUD ink, and star init read it. Speed, gaps, scoring, and
// game.rng() do not. Re-read in resetGame() like the other QA flags.
// Tests flip it through setQaNight(); a normal visit leaves this false.
function readQaNightFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaNight') === '1';
}

let qaNight = readQaNightFlag();

function setQaNight(enabled) {
  qaNight = !!enabled;
}

// Score the night sky consults. The QA flag pretends night has fully arrived.
function scoreForNightSky(score) {
  if (!qaNight) return score;
  return score < GAME_CONFIG.DAY_NIGHT_END ? GAME_CONFIG.DAY_NIGHT_END : score;
}

// Returns the rolled type, or the cluster type once per run when the QA flag
// is on. Updated and Daily only. Does not call game.rng().
function qaClusterOverride(rolledType) {
  if (!qaCluster || game.qaClusterShown || !isUpdatedMode()) return rolledType;
  const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
  if (!cluster) return rolledType;
  game.qaClusterShown = true;
  return cluster;
}

// --- Web Audio module (PR-B) ---
// Synthesised SFX — no asset files. Lazy-creates AudioContext on first user
// gesture (Chrome's autoplay policy) and silently no-ops if AudioContext is
// unavailable (Node tests, very old browsers).
const audio = {
  ctx: null,
  muted: localStorage.getItem('dino-muted') === '1',
  ensure() {
    if (!this.ctx) {
      const Ctx = (typeof AudioContext !== 'undefined') ? AudioContext
                : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
                : null;
      if (!Ctx) return null;
      try { this.ctx = new Ctx(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => { /* swallow autoplay-block etc. */ });
    }
    return this.ctx;
  },
  setMuted(v) {
    this.muted = !!v;
    localStorage.setItem('dino-muted', this.muted ? '1' : '0');
  },
  // Short envelope-shaped tone. Used by jump/land/milestone.
  blip(freq, durationMs, type = 'sine', gain = 0.04) {
    if (this.muted || !isUpdatedMode()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  },
  jump()      { this.blip(420 + (Math.random() - 0.5) * 40, 80, 'sine', 0.04); },
  land()      { this.blip(140, 60, 'sine', 0.05); },
  milestone() {
    this.blip(880, 120, 'triangle', 0.05);
    setTimeout(() => this.blip(1320, 120, 'triangle', 0.05), 80);
  },
  // Downward freq sweep for death — distinctly more dramatic than blip().
  death() {
    if (this.muted || !isUpdatedMode()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  },
};

// == SECTION 3: ASSET LOADING ==

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
initCanvasScale();
if (typeof process === 'undefined') window.addEventListener('resize', handleResize);
const a11yLive = document.getElementById('a11y-live');

function announce(message) {
  if (a11yLive && typeof a11yLive.textContent !== 'undefined') {
    a11yLive.textContent = message;
  }
}

const dino = {
  x: GAME_CONFIG.DINO_X,
  y: 150,
  width: GAME_CONFIG.DINO_WIDTH,
  height: GAME_CONFIG.DINO_HEIGHT,
  velocityY: 0,
  gravity: GAME_CONFIG.GRAVITY,
  jumpPower: GAME_CONFIG.JUMP_POWER,
  isJumping: false,
  image: new Image(),
};

dino.image.src = 'assets/dino-stationary.png';

const dinoRunImages = [new Image(), new Image()];
dinoRunImages[0].src = 'assets/dino-run-0.png';
dinoRunImages[1].src = 'assets/dino-run-1.png';

const dinoLoseImage = new Image();
dinoLoseImage.src = 'assets/dino-lose.png';

const groundImage = new Image();
groundImage.src = 'assets/ground.png';

const obstacleImage = new Image();
obstacleImage.src = 'assets/cactus.png';

let imagesLoaded = 0;
let assetsStarted = false;
const totalImages = 6;

function imageReady(img) {
  return img && img.complete && img.naturalWidth !== 0;
}

function initCanvasScale() {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = Math.round(cssW / 3);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(canvas.width / 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(canvas.width / GAME_CONFIG.CANVAS_W, canvas.height / GAME_CONFIG.CANVAS_H);
}

function handleResize() {
  initCanvasScale();
  if (game.state === STATE.DEAD) drawGameOverScreen();
}

function startGameOnce() {
  if (assetsStarted) return;
  assetsStarted = true;
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.IDLE;
  gameLoop();
}

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) startGameOnce();
}

function onImageError() {
  // Don't block the game on a missing asset — drawing code falls back to rectangles.
  console.warn('A game asset failed to load. Continuing with fallback rendering.');
  onImageLoad();
}

dino.image.onload = onImageLoad;
dino.image.onerror = onImageError;
dinoRunImages[0].onload = onImageLoad;
dinoRunImages[0].onerror = onImageError;
dinoRunImages[1].onload = onImageLoad;
dinoRunImages[1].onerror = onImageError;
dinoLoseImage.onload = onImageLoad;
dinoLoseImage.onerror = onImageError;
groundImage.onload = onImageLoad;
groundImage.onerror = onImageError;
obstacleImage.onload = onImageLoad;
obstacleImage.onerror = onImageError;

// Safety net: if the network stalls, start after a timeout so the user isn't
// stuck on a blank screen. Drawing will fall back to rectangles for any
// unloaded sprites. Skipped in Node so tests don't keep the event loop alive.
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
if (typeof setTimeout !== 'undefined' && !isNode) {
  setTimeout(() => {
    if (!assetsStarted) {
      console.warn('Asset load timeout — starting with whatever is available.');
      startGameOnce();
    }
  }, GAME_CONFIG.ASSET_LOAD_TIMEOUT_MS);
}

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
  const eligible = GAME_CONFIG.OBSTACLE_TYPES.filter(t => score >= t.unlockScore);
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
    return INITIAL_SPEED + (PLATEAU_SPEED - INITIAL_SPEED) *
      (1 / (1 + Math.exp(-RAMP_STEEPNESS * (score - RAMP_MIDPOINT))));
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
  const stored = localStorage.getItem('dino-mode');
  return stored === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
}

// --- Daily challenge helpers -------------------------------------------
// Epoch: project launch 2026-03-01 UTC. Day 1 = that date.
const DAILY_EPOCH_MS = new Date('2026-03-01T00:00:00Z').getTime();

// Returns today's date as a YYYYMMDD integer — same value for every player
// on the same calendar day, used as the mulberry32 seed for daily runs.
function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Ordinal day number shown in the HUD badge and share text (#1, #2, …).
function dailyNumber() {
  return Math.floor((Date.now() - DAILY_EPOCH_MS) / 86400000) + 1;
}

// Pre-run framing. A shared-course reminder, not a score. Drawn only on the
// GET READY overlay while WAITING in a Daily Challenge.
const DAILY_PRE_RUN_LINE = 'Same course as everyone today';

// Death-screen hint. One quiet line after the score count-up, pointing at
// TODAY BEST and the existing Copy result button. Static — no pulse.
const DAILY_DEATH_HINT = 'Share TODAY BEST with Copy result';

// All mutable game state lives on this object. Keeping it in one place prevents
// stray top-level globals and makes resets + test inspection simpler.
// One clock read so the stored run seed is the same integer the RNG was built from.
const bootSeed = Date.now() >>> 0;
const game = {
  state:            STATE.LOADING,
  obstacles:        [],
  currentSpeed:     GAME_CONFIG.INITIAL_SPEED,
  lastObstacleX:    -300,
  nextSpawnGap:     GAME_CONFIG.MAX_SPAWN_GAP,
  graceFrames:      GAME_CONFIG.GRACE_FRAMES,
  animationFrameId: undefined,
  score:            0,
  highScore:        ScoreStore.loadHighScore(),
  animFrame:        0,
  groundX:          0,
  clouds:           [],
  stars:            [],
  starsInitialised: false,
  // Running frames since stars appeared. 0 until night init; caps at the fade length.
  starFadeFrames:   0,
  hills:            [],
  milestoneText:    '',
  newBestShown:     false,
  plateauCueShown:  false,
  // QA/debug only. Latches after ?qaCluster=1 spends its one early cluster.
  qaClusterShown:   false,
  isNewBest:         false,
  previousHighScore: 0,
  // Set on a Daily death before today best is saved. Mirrors isNewBest:
  // true when this run beats today, including the first run of the day.
  isNewTodayBest:    false,
  previousDailyBest: 0,
  // Boot seed matches the RNG created below. resetGame() replaces it with
  // the daily seed or a fresh clock seed before the next run.
  runSeed:           bootSeed,
  seedOverride:      null,
  lastGaps:          [],
  lastObstacleTypes: [],
  lastJumpFrame:     null,
  deathLog:          null,
  rng:               mulberry32(bootSeed),
  mode:             loadMode(),
  dailyBest:        ScoreStore.loadDailyBest(),
  // False until the player has died once this session. First IDLE → WAITING
  // keeps the full countdown; restarts after death can skip it.
  countdownSkippable: false,
};

// All per-run animation countdown timers. Kept separate from the game object
// so reset() is a single call and adding a new timer has exactly one place.
const Animations = {
  deathAnimFrame:   0,
  deathShakeFrames: 0,
  deathFlashFrames: 0,
  scorePopFrames:   0,
  milestoneFrames:  0,
  newBestFrames:    0,
  copyFlashFrames:  0,
  reset() {
    this.deathAnimFrame = this.deathShakeFrames = this.deathFlashFrames = 0;
    this.scorePopFrames = this.milestoneFrames  = this.newBestFrames    = 0;
    this.copyFlashFrames = 0;
  },
};

function setMode(newMode) {
  game.mode = newMode === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
  localStorage.setItem('dino-mode', game.mode);
  refreshModeToggle();
  // Restart the run cleanly so the new mode's spawn rules take effect immediately.
  cancelAnimationFrame(game.animationFrameId);
  resetGame();
  gameLoop();
}

// Build and copy the daily result string to the clipboard.
// Returns the text so tests can assert its shape without touching clipboard.
function shareDailyResult() {
  const score = game.dailyBest > 0 ? game.dailyBest : Math.floor(game.score);
  const text = [
    'Rex Daily #' + dailyNumber() + ' 🦕',
    'Score: ' + score,
    'https://snehiths19.github.io/chrome-offline-Rex/',
  ].join('\n');
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    // writeText can throw synchronously when the clipboard is blocked.
    // That must not escape: the Copied flash is independent of the write.
    try {
      const pending = navigator.clipboard.writeText(text);
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch { /* clipboard blocked */ }
  }
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
  return isDailyMode() ? dailySeed() : (Date.now() >>> 0);
}

function copyText(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) return;
  try {
    const pending = navigator.clipboard.writeText(text);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch { /* clipboard unavailable or blocked */ }
}

function noteSpawnForDeathLog(gapPx, typeId, speed) {
  if (!runDebug) return;
  const framesApprox = speed > 0 ? Math.max(1, Math.round(gapPx / speed)) : 0;
  game.lastGaps.push({
    px: gapPx,
    framesApprox,
    msApprox: Math.round(framesApprox * 1000 / 60),
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
    lastGaps: game.lastGaps.map(g => ({ px: g.px, framesApprox: g.framesApprox, msApprox: g.msApprox })),
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
  const snapshot = (game.state === STATE.DEAD && game.deathLog) ? game.deathLog : buildRunSnapshot('key');
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
  const line = 'dbg ' + game.mode + ' ' + Math.floor(game.score)
    + ' spd ' + speed
    + ' gap ' + game.nextSpawnGap
    + ' seed ' + game.runSeed;
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

// == SECTION 5: RENDERING ==

function getBackgroundColor(s) {
  s = scoreForNightSky(s);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return '#ffffff';
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return '#1a1a2e';
  if (reducedMotion) return '#ffffff'; // no smooth interpolation — snap at end
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 0 at the moment night begins, 1 once STAR_FADE_FRAMES have elapsed.
// A non-positive tuned length means "show them immediately".
function starFadeAlpha() {
  const total = cfg('STAR_FADE_FRAMES');
  if (!(total > 0)) return 1;
  return Math.min(1, game.starFadeFrames / total);
}

function drawBackground() {
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);

  if (game.starsInitialised) {
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * starFadeAlpha();
    ctx.fillStyle = GAME_CONFIG.STAR_COLOR;
    game.stars.forEach(s => ctx.fillRect(s.x, s.y, GAME_CONFIG.STAR_SIZE, GAME_CONFIG.STAR_SIZE));
    ctx.globalAlpha = previousAlpha;
  }
}

function initClouds() {
  game.clouds.length = 0;
  for (let i = 0; i < GAME_CONFIG.CLOUD_COUNT; i++) {
    game.clouds.push({
      x: Math.random() * GAME_CONFIG.CANVAS_W,
      y: GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE,
      speed: GAME_CONFIG.CLOUD_MIN_SPEED + Math.random() * GAME_CONFIG.CLOUD_SPEED_RANGE,
    });
  }
}

function updateClouds() {
  if (reducedMotion) return;
  // PR-D: stronger parallax in Updated mode so the world feels less static.
  const speedFactor = isUpdatedMode() ? GAME_CONFIG.CLOUD_SPEED_FACTOR_UPDATED : 1;
  game.clouds.forEach(c => {
    c.x -= c.speed * speedFactor;
    if (c.x + GAME_CONFIG.CLOUD_WIDTH < 0) {
      c.x = GAME_CONFIG.CANVAS_W + GAME_CONFIG.CLOUD_RESPAWN_OFFSET;
      c.y = GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE;
    }
  });
}

// --- Mid-ground hills (PR-D, updated mode only) ---
// Soft mounds drawn behind the ground at slow parallax. Deterministic shape
// per-run via game.rng so the same seed yields identical scenery.
// Shadow copy used only while reduced motion freezes the drawn hills. It must
// stay on game.rng so respawn draws are not skipped.
let hillLayout = null;

function initHills() {
  hillLayout = null;
  game.hills.length = 0;
  const slot = GAME_CONFIG.CANVAS_W / GAME_CONFIG.HILL_COUNT;
  for (let i = 0; i < GAME_CONFIG.HILL_COUNT; i++) {
    game.hills.push({
      x:      i * slot + game.rng() * (slot - GAME_CONFIG.HILL_MIN_WIDTH),
      width:  GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE,
      height: GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE,
    });
  }
}

function updateHills() {
  if (!isUpdatedMode()) return;
  // Reduced motion freezes the mounds the player sees, but the respawn rolls
  // still have to come off game.rng(). Skipping them shifts every later
  // obstacle type and gap for that Daily seed.
  let hills = game.hills;
  if (reducedMotion) {
    if (!hillLayout) {
      hillLayout = game.hills.map(h => ({ x: h.x, width: h.width, height: h.height }));
    }
    hills = hillLayout;
  }
  for (const hill of hills) {
    hill.x -= game.currentSpeed * GAME_CONFIG.HILL_PARALLAX;
    if (hill.x + hill.width < 0) {
      hill.x = GAME_CONFIG.CANVAS_W + game.rng() * cfg('HILL_RESPAWN_X_RANGE');
      hill.width = GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE;
      hill.height = GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE;
    }
  }
}

function getHillColor(score) {
  score = scoreForNightSky(score);
  if (score < GAME_CONFIG.DAY_NIGHT_START) return GAME_CONFIG.HILL_COLOR_DAY;
  if (score >= GAME_CONFIG.DAY_NIGHT_END)  return GAME_CONFIG.HILL_COLOR_NIGHT;
  if (reducedMotion) return GAME_CONFIG.HILL_COLOR_DAY; // snap — stays day until DAY_NIGHT_END
  const t = (score - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const parseHex = hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const day   = parseHex(GAME_CONFIG.HILL_COLOR_DAY);
  const night = parseHex(GAME_CONFIG.HILL_COLOR_NIGHT);
  const r = Math.round(day[0] + (night[0] - day[0]) * t);
  const g = Math.round(day[1] + (night[1] - day[1]) * t);
  const b = Math.round(day[2] + (night[2] - day[2]) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawHills() {
  if (!isUpdatedMode() || game.hills.length === 0) return;
  // Pick a colour that contrasts with the day/night background.
  ctx.fillStyle = getHillColor(game.score);
  const baseY = GAME_CONFIG.CANVAS_H - 16;
  for (const hill of game.hills) {
    if (typeof ctx.ellipse !== 'function') {
      // Fallback for environments without canvas.ellipse — draw a triangle.
      ctx.beginPath();
      ctx.moveTo(hill.x, baseY);
      ctx.lineTo(hill.x + hill.width / 2, baseY - hill.height);
      ctx.lineTo(hill.x + hill.width, baseY);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(hill.x + hill.width / 2, baseY, hill.width / 2, hill.height, 0, 0, Math.PI, true);
    ctx.fill();
  }
}

// PR-D: gentle gold sky-tint pulse during a milestone flash. Subtle on top of
// the existing day/night background.
function drawSkyTint() {
  if (!isUpdatedMode() || reducedMotion) return;
  if (Animations.milestoneFrames <= 0) return;
  const alpha = (Animations.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES) * cfg('SKY_TINT_PEAK_ALPHA');
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('SKY_TINT_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.restore();
}

function drawClouds() {
  ctx.fillStyle = GAME_CONFIG.CLOUD_COLOR;
  game.clouds.forEach(c => {
    GAME_CONFIG.CLOUD_CIRCLES.forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawGround() {
  if (!imageReady(groundImage)) {
    // Fallback: thin line at ground level so the dino doesn't look like it's floating.
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, GAME_CONFIG.CANVAS_H - 2, GAME_CONFIG.CANVAS_W, 2);
    return;
  }
  const groundY = GAME_CONFIG.CANVAS_H - groundImage.height;
  ctx.drawImage(groundImage, game.groundX, groundY, groundImage.width, groundImage.height);
  ctx.drawImage(groundImage, game.groundX + groundImage.width, groundY, groundImage.width, groundImage.height);
}

// Cluster hitbox stays GAME_CONFIG width. Paint two full small-cactus sprites.
// The art's arms run to the cell edge, so the leftover inside the hitbox (~10px)
// still reads as one bar at the speed a first cluster appears. Open one small
// cactus of sky between them — narrower than the dino, so it is not a lane —
// and let the sprites overhang the hitbox equally. The sky stays inside the
// hitbox, so the gap is not a sneak-through. Collision does not read these slots.
function clusterSpriteSlots(obstacle) {
  const small = GAME_CONFIG.OBSTACLE_TYPES[0];
  const gap = small.width;
  const overhang = (small.width * 2 + gap - obstacle.width) / 2;
  const y = obstacle.y + (obstacle.height - small.height);
  const left = obstacle.x - overhang;
  return [
    { x: left, y: y, w: small.width, h: small.height },
    { x: left + small.width + gap, y: y, w: small.width, h: small.height },
  ];
}

function drawObstacles() {
  game.obstacles.forEach(obstacle => {
    if (obstacle.render === 'double') {
      const slots = clusterSpriteSlots(obstacle);
      if (!imageReady(obstacleImage)) {
        ctx.fillStyle = '#2d7a2d';
        slots.forEach(slot => ctx.fillRect(slot.x, slot.y, slot.w, slot.h));
        return;
      }
      slots.forEach(slot => ctx.drawImage(obstacleImage, slot.x, slot.y, slot.w, slot.h));
      return;
    }
    if (!imageReady(obstacleImage)) {
      ctx.fillStyle = '#2d7a2d';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      return;
    }
    // Single (small, big): scale the sprite to the type's width/height.
    ctx.drawImage(obstacleImage, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  });
}

function drawDino() {
  let img;
  if (game.state === STATE.DEAD) {
    img = dinoLoseImage;
  } else if (dino.isJumping) {
    img = dino.image;
  } else {
    img = dinoRunImages[Math.floor(game.animFrame / GAME_CONFIG.RUN_FRAME_PERIOD) % 2];
  }
  if (imageReady(img)) {
    ctx.drawImage(img, dino.x, dino.y, dino.width, dino.height);
  } else {
    ctx.fillStyle = '#535353';
    ctx.fillRect(dino.x, dino.y, dino.width, dino.height);
  }
}

function drawScore() {
  const popping = Animations.scorePopFrames > 0 && isUpdatedMode() && !reducedMotion;
  if (popping) {
    // Brief 1.0 → 1.4 ease-out scale around the score's centre on death.
    const t = Animations.scorePopFrames / GAME_CONFIG.SCORE_POP_FRAMES; // 1 → 0
    const scale = 1 + t * 0.4;
    const cx = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30;
    const cy = GAME_CONFIG.SCORE_Y - 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  const color = scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.fillStyle = color;
  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(
    String(Math.floor(game.score)).padStart(5, '0'),
    GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET,
    GAME_CONFIG.SCORE_Y
  );
  // Daily HUD is the current score only. TODAY BEST stays on the Game Over
  // screen (and in the share result) so the social comparison sits at the
  // edge of the run, not beside the obstacle lane.
  if (!isDailyMode() && game.highScore > 0) {
    ctx.fillText(
      'HI ' + String(game.highScore).padStart(5, '0'),
      GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET - GAME_CONFIG.SCORE_HI_X_OFFSET,
      GAME_CONFIG.SCORE_Y
    );
  }
  if (popping) ctx.restore();
  drawDebugHud();
}

// PR-C: white-flash overlay drawn on top of the world during the first few
// post-death frames. Mode-gated; reduce-motion caps it at 1 frame.
function drawDeathFlash() {
  if (Animations.deathFlashFrames <= 0) return;
  const alpha = Animations.deathFlashFrames / cfg('DEATH_FLASH_FRAMES');
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('DEATH_FLASH_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.restore();
}

function drawIdleScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';

  ctx.fillStyle = 'white';
  ctx.font = '22px ' + font;
  ctx.fillText('REX RUN', canvas.width / 2, canvas.height / 2 - 16);

  const pulseAlpha = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(game.animFrame * 0.08));
  ctx.fillStyle = 'rgba(255, 255, 255, ' + pulseAlpha.toFixed(3) + ')';
  ctx.font = '13px ' + font;
  ctx.fillText('TAP / PRESS SPACE TO START', canvas.width / 2, canvas.height / 2 + 12);
}

function drawGetReadyOverlay() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (game.graceFrames > GAME_CONFIG.GRACE_FRAMES * 0.33) {
    ctx.font = '28px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('GET READY', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
    // Space/Tap does nothing on the first countdown, so don't promise a jump.
    // After death the same input skips straight into the run.
    if (game.countdownSkippable) {
      ctx.font = '14px ' + cfg('SCORE_FONT_FAMILY');
      ctx.fillText('Press Space / Tap to start', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 16);
    }
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(game.graceFrames / step);
    ctx.font = '48px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText(count || 'GO!', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 16);
  }
  drawDailyPreRunLine();
}

// One shared run, at the edge of the run only. Static text — no pulse — so
// prefers-reduced-motion has nothing extra to suppress. The RUNNING loop
// never calls this overlay, and the state check keeps it off if it did.
function drawDailyPreRunLine() {
  if (game.state !== STATE.WAITING || !isDailyMode()) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.font = '12px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(DAILY_PRE_RUN_LINE, GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 46);
}

function drawGameOverScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  const t = Math.min(Animations.deathAnimFrame / GAME_CONFIG.DEATH_ANIM_FRAMES, 1);
  const displayScore = Math.round(t * Math.floor(game.score));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.textAlign = 'center';

  if (isDailyMode()) {
    if (game.isNewTodayBest) {
      // Same takeover as free-play NEW BEST. The daily number sits higher so
      // it doesn't land on the title. Static text — no pulse.
      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.font = '13px ' + font;
      ctx.fillText('📅 DAILY #' + dailyNumber(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 70);

      ctx.fillStyle = 'white';
      ctx.font = '15px ' + font;
      ctx.fillText('★  NEW TODAY BEST  ★', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 36);

      ctx.font = '42px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 4);

      if (game.previousDailyBest > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '13px ' + font;
        const improvement = displayScore - game.previousDailyBest;
        ctx.fillText('+' + improvement + ' over your previous best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 28);
      }
    } else {
      // Daily challenge death screen — THIS RUN vs TODAY BEST, no all-time comparison
      const todayBest = game.dailyBest;
      const delta = todayBest > 0 ? todayBest - displayScore : 0;

      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.font = '13px ' + font;
      ctx.fillText('📅 DAILY #' + dailyNumber(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 48);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('THIS RUN', GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 + 14);

      if (todayBest > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '16px ' + font;
        ctx.fillText(delta > 0 ? '← +' + delta + ' →' : '← best →', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '11px ' + font;
        ctx.fillText('today best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px ' + font;
        ctx.fillText('TODAY BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
        ctx.fillStyle = 'white';
        ctx.font = '28px ' + font;
        ctx.fillText(String(todayBest).padStart(5, '0'), GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 + 14);
      }
    }

    // Show or hide the DOM share button based on animation completion.
    // The hint lands with the button, after the count-up, so the social
    // nudge doesn't compete with the score.
    const shareBtnEl = document.getElementById('share-btn');
    if (shareBtnEl && shareBtnEl.style) {
      shareBtnEl.style.display = t >= 1 ? 'block' : 'none';
      if (t >= 1) {
        shareBtnEl.textContent = Animations.copyFlashFrames > 0 ? '✓ Copied!' : '📋 Copy result';
      }
    }
    if (t >= 1) drawDailyDeathHint();
  } else {
    if (game.isNewBest) {
      // New record — celebration takeover
      ctx.fillStyle = 'white';
      ctx.font = '15px ' + font;
      ctx.fillText('★  NEW BEST  ★', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 36);

      ctx.font = '42px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 4);

      if (game.previousHighScore > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '13px ' + font;
        const improvement = displayScore - game.previousHighScore;
        ctx.fillText('+' + improvement + ' over your previous best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 28);
      }
    } else {
      // Normal death — side-by-side comparison
      const delta    = game.highScore - Math.floor(game.score);
      const scoreStr = String(displayScore).padStart(5, '0');
      const bestStr  = String(game.highScore).padStart(5, '0');

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('THIS RUN',  GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(scoreStr,   GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 + 14);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px ' + font;
      ctx.fillText('← ' + delta + ' →', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '11px ' + font;
      ctx.fillText('from best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('YOUR BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(bestStr,    GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 + 14);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '13px ' + font;
    ctx.fillText('Tap / Press Space to Restart', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H - 16);
  }
  drawDebugHud();
}

// One shared run, on the death screen only. Self-gated so a WAITING or
// RUNNING frame cannot paint it, and Classic/Updated never reach this call.
// No frame-driven alpha — prefers-reduced-motion has nothing to suppress.
function drawDailyDeathHint() {
  if (!isDailyMode()) return;
  if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '12px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(DAILY_DEATH_HINT, GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H - 16);
}

function drawMilestoneFlash() {
  if (Animations.milestoneFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = Animations.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES;
  ctx.fillStyle = scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(game.milestoneText, GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 30);
  ctx.restore();
  Animations.milestoneFrames--;
}

function drawNewBestBadge() {
  if (Animations.newBestFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = Animations.newBestFrames / GAME_CONFIG.NEW_BEST_FRAMES;
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px ' + cfg('SCORE_FONT_FAMILY');
  // Drop below the milestone flash when both fire on the same frame
  // (level-up + new-best at score = highScore + 100).
  const y = Animations.milestoneFrames > 0 ? 100 : 70;
  ctx.fillText('NEW BEST!', GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET, y);
  ctx.restore();
  Animations.newBestFrames--;
}

// --- Particle system (PR-A) ---
// Pooled — slots with life <= 0 are reusable, no allocation per emit.
// Cosmetic only: uses Math.random() instead of game.rng so it can't perturb
// gameplay determinism (spawn jitter / obstacle picks stay reproducible).

function isDailyMode()   { return game.mode === MODES.DAILY; }
function isUpdatedMode() { return game.mode === MODES.UPDATED || game.mode === MODES.DAILY; }

const Particles = (() => {
  const POOL_SIZE = 80;
  const KINDS = Object.freeze({
    jump:      { count:  6, color: '#9c8770',                size: 3, life: 18, vyMin: -2.0, vyMax: -0.5, vxSpread: 1.5, gravity: 0.05 },
    land:      { count:  9, color: '#9c8770',                size: 3, life: 14, vyMin: -1.5, vyMax: -0.2, vxSpread: 2.5, gravity: 0.08 },
    trail:     { count:  1, color: 'rgba(150,150,150,0.55)', size: 2, life: 10, vyMin: -0.2, vyMax:  0.2, vxSpread: 0.4, gravity: 0    },
    collision: { count: 22, color: '#d04a2a',                size: 3, life: 24, vyMin: -3.0, vyMax:  1.0, vxSpread: 4.0, gravity: 0.10 },
    confetti:  { count: 20, color: '#ffd700',                size: 3, life: 40, vyMin: -3.5, vyMax: -1.5, vxSpread: 3.0, gravity: 0.12 },
    // Once-per-run plateau cue. Cool and small so it stays at the heel on the
    // night sky (~score 641). Distinct from gold confetti and brown foot dust.
    plateau:   { count:  8, color: '#c5d4e4',                size: 2, life: 24, vyMin: -1.0, vyMax: -0.3, vxSpread: 0.6, gravity: 0.02 },
    // QA/debug only — not for players. Same cue, but dark and larger so it
    // reads on the white day sky. Production keeps `plateau`.
    plateauQa: { count: 12, color: '#3d4f63',                size: 4, life: 40, vyMin: -1.4, vyMax: -0.4, vxSpread: 1.0, gravity: 0.03 },
  });
  const REDUCED_FACTOR = 0.25;
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0, color: '', gravity: 0 });
  }
  return {
    POOL_SIZE,
    KINDS,
    particles: pool,
    emit(kind, x, y) {
      if (!isUpdatedMode()) return 0;
      const config = KINDS[kind];
      if (!config) return 0;
      let count = config.count;
      if (reducedMotion) count = Math.max(1, Math.round(count * REDUCED_FACTOR));
      const life = reducedMotion ? Math.max(2, Math.round(config.life * 0.5)) : config.life;
      let emitted = 0;
      for (let i = 0; i < pool.length && emitted < count; i++) {
        const p = pool[i];
        if (p.life > 0) continue;
        p.x = x + (Math.random() - 0.5) * cfg('PARTICLE_EMIT_SPREAD');
        p.y = y;
        p.vx = (Math.random() - 0.5) * 2 * config.vxSpread;
        p.vy = config.vyMin + Math.random() * (config.vyMax - config.vyMin);
        p.maxLife = life;
        p.life = life;
        p.size = config.size;
        p.color = config.color;
        p.gravity = config.gravity;
        emitted++;
      }
      return emitted;
    },
    update() {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.life--;
      }
    },
    draw() {
      const prevAlpha = ctx.globalAlpha;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = prevAlpha;
    },
    reset() {
      for (let i = 0; i < pool.length; i++) pool[i].life = 0;
    },
  };
})();

// == FEATURE REGISTRY ==
// Declarative ordering for ambient features that run every RUNNING frame.
// Each entry has an id (test snapshot anchor), an optional update, a draw,
// and a layer that maps it to a draw-phase. Feature functions self-gate
// (mode + reduced-motion); the registry only controls *when in the frame*
// they fire. WAITING/DEAD branches are still hand-written — they use a
// different subset and would only get a per-feature skip-flag if forced
// through here.
const FEATURES = Object.freeze([
  { id: 'hills',     layer: 'background', update: updateHills,     draw: drawHills     },
  { id: 'clouds',    layer: 'background', update: updateClouds,    draw: drawClouds    },
  { id: 'particles', layer: 'foreground', update: Particles.update, draw: Particles.draw },
  { id: 'skyTint',   layer: 'overlay',    update: null,            draw: drawSkyTint   },
]);

function runFeatureUpdates() {
  for (const f of FEATURES) if (f.update) f.update();
}

function runFeatureDraws(layer) {
  for (const f of FEATURES) if (f.draw && f.layer === layer) f.draw();
}

// == SECTION 6: PHYSICS & GAME LOGIC ==

function spawnObstacle(type) {
  // Default to a tier-appropriate random pick; tests may pass a specific type.
  // Mode is required: omitting it lets Classic roll cluster once that tier unlocks.
  const t = type || pickObstacleType(game.rng, game.score, game.mode);
  game.obstacles.push({
    x: GAME_CONFIG.CANVAS_W,
    y: GAME_CONFIG.CANVAS_H - t.height,
    width: t.width,
    height: t.height,
    type: t.id,
    render: t.render,
  });
}

function updateObstacles() {
  // Rightmost cull wins: the spawn gap is measured from the newest obstacle,
  // and the loop walks from the right. Keep that x after the sprite leaves so
  // a gap wider than the screen still counts down instead of snapping to -300
  // (which either spawns immediately or, past 900px, never spawns again).
  let culledX = null;
  for (let i = game.obstacles.length - 1; i >= 0; i--) {
    const obs = game.obstacles[i];
    obs.x -= game.currentSpeed;
    if (obs.x + obs.width < 0) {
      if (culledX === null) culledX = obs.x;
      game.obstacles.splice(i, 1);
    }
  }
  if (game.obstacles.length > 0) {
    game.lastObstacleX = game.obstacles[game.obstacles.length - 1].x;
  } else if (culledX !== null) {
    game.lastObstacleX = culledX;
  } else {
    game.lastObstacleX -= game.currentSpeed;
  }
}

function checkCollision(dino, obstacle) {
  const dx = GAME_CONFIG.DINO_PAD_X,  dyt = GAME_CONFIG.DINO_PAD_Y_TOP,
        dyb = GAME_CONFIG.DINO_PAD_Y_BOT;
  const ox = GAME_CONFIG.OBS_PAD_X,   oy = GAME_CONFIG.OBS_PAD_Y;

  const dl = dino.x + dx,        dr = dino.x + dino.width - dx;
  const dt = dino.y + dyt,       db = dino.y + dino.height - dyb;
  const ol = obstacle.x + ox,    or_ = obstacle.x + obstacle.width - ox;
  const ot = obstacle.y + oy,    ob = obstacle.y + obstacle.height;

  return dl < or_ && dr > ol && dt < ob && db > ot;
}

function computeRunResult(finalScore, currentHighScore) {
  const isNewBest = finalScore > currentHighScore || currentHighScore === 0;
  const previousHighScore = currentHighScore;
  const delta = isNewBest
    ? finalScore - previousHighScore
    : currentHighScore - finalScore;
  return { isNewBest, previousHighScore, delta };
}

function jump() {
  if (game.state !== STATE.RUNNING) return;
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
    if (runDebug) game.lastJumpFrame = game.animFrame;
    Particles.emit('jump', dino.x + dino.width / 2, dino.y + dino.height);
    audio.jump();
  }
}

// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.IDLE) {
    game.state       = STATE.WAITING;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  } else if (game.state === STATE.WAITING) {
    // First visit of the session keeps the full countdown. After a death,
    // Space/Tap (and the other action keys) skip it. Stay on the current
    // loop — restarting gameLoop here would double the frame rate.
    if (!game.countdownSkippable) return;
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    announce('Go!');
  } else if (game.state === STATE.RUNNING) {
    jump();
  } else if (game.state === STATE.DEAD) {
    if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      drawGameOverScreen();
    } else {
      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      gameLoop();
    }
  }
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    handleAction();
  } else {
    handleDebugKey(event);
  }
});

canvas.addEventListener('click', handleAction);

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  handleAction();
}, { passive: false });

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    handleAction();
  }, { passive: false });
  jumpBtn.addEventListener('click', handleAction);
}

// Segmented toggle: two buttons, both always visible, exactly one pressed.
const modeToggle = document.getElementById('mode-toggle');
function refreshModeToggle() {
  if (!modeToggle || !modeToggle.querySelectorAll) return;
  const buttons = modeToggle.querySelectorAll('button');
  buttons.forEach(btn => {
    const pressed = btn.dataset && btn.dataset.mode === game.mode;
    btn.setAttribute('aria-pressed', String(pressed));
  });
}
if (modeToggle && modeToggle.addEventListener) {
  // stopPropagation + a touchstart shadow stops the synthesised click from
  // also firing the canvas's jump handler when the buttons sit over it.
  const onModeTap = (event) => {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.mode) return;
    event.stopPropagation();
    if (target.dataset.mode === game.mode) return; // already in that mode
    setMode(target.dataset.mode);
    announce(game.mode === MODES.CLASSIC ? 'Classic mode' : 'Updated mode');
  };
  modeToggle.addEventListener('click', onModeTap);
  modeToggle.addEventListener('touchstart', (event) => {
    if (event.target && event.target.dataset && event.target.dataset.mode) {
      event.preventDefault();
      event.stopPropagation();
      onModeTap(event);
    }
  }, { passive: false });
  refreshModeToggle();
}

// Mute button — single icon-button toggle (icons are universally legible).
const muteBtn = document.getElementById('mute-btn');
function refreshMuteButton() {
  if (!muteBtn || !muteBtn.setAttribute) return;
  muteBtn.textContent = audio.muted ? '🔇' : '🔊'; // 🔇 / 🔊
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
}
if (muteBtn && muteBtn.addEventListener) {
  const onMuteTap = (event) => {
    if (event) event.stopPropagation();
    audio.ensure(); // also unlocks (and resumes) AudioContext if not yet
    audio.setMuted(!audio.muted);
    refreshMuteButton();
    announce(audio.muted ? 'Sound muted' : 'Sound on');
  };
  muteBtn.addEventListener('click', onMuteTap);
  muteBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMuteTap(event);
  }, { passive: false });
  refreshMuteButton();
}

// Share button — shown on death screen during daily challenge only.
const shareBtn = document.getElementById('share-btn');
if (shareBtn && shareBtn.addEventListener) {
  const onShareTap = (event) => {
    if (event) event.stopPropagation();
    // Start the flash before the clipboard call. A sync throw from
    // writeText used to abort this handler, so the label never changed.
    Animations.copyFlashFrames = 90; // ~1.5 s at 60 fps
    shareBtn.textContent = '✓ Copied!';
    shareDailyResult();
  };
  shareBtn.addEventListener('click', onShareTap);
  shareBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onShareTap(event);
  }, { passive: false });
}

// Daily challenge button — activates MODES.DAILY (locks Updated behaviour)
// and hides the Classic/Updated toggle via the .daily-active class.
const dailyBtn = document.getElementById('daily-btn');
const gameWrapper = document.getElementById('game-wrapper');

function refreshDailyButton() {
  if (!dailyBtn || !dailyBtn.setAttribute) return;
  const active = isDailyMode();
  dailyBtn.setAttribute('aria-pressed', String(active));
  dailyBtn.setAttribute('aria-label', active ? 'Leave daily challenge' : 'Daily challenge');
  if (gameWrapper && gameWrapper.classList) {
    if (active) gameWrapper.classList.add('daily-active');
    else gameWrapper.classList.remove('daily-active');
  }
}

if (dailyBtn && dailyBtn.addEventListener) {
  const onDailyTap = (event) => {
    if (event) event.stopPropagation();
    const entering = !isDailyMode();
    if (entering) {
      game.mode = MODES.DAILY;
    } else {
      game.mode = MODES.UPDATED;
      localStorage.setItem('dino-mode', MODES.UPDATED);
    }
    refreshDailyButton();
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    gameLoop();
    announce(entering
      ? `Daily challenge #${dailyNumber()}. ${DAILY_PRE_RUN_LINE}.`
      : 'Updated mode');
  };
  dailyBtn.addEventListener('click', onDailyTap);
  dailyBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onDailyTap(event);
  }, { passive: false });
  refreshDailyButton();
}

// Resume the AudioContext when the tab becomes visible again. Browsers
// suspend the ctx when the page is hidden; without this, audio dies silently
// on tab-switch even though no error is thrown.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audio.ctx
        && audio.ctx.state === 'suspended'
        && typeof audio.ctx.resume === 'function') {
      audio.ctx.resume().catch(() => {});
    }
  });
}

// == SECTION 8: GAME LOOP ==

function resetGame() {
  const restartAfterDeath = game.state === STATE.DEAD;
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;

  Particles.reset();

  game.obstacles.length = 0;
  game.stars.length = 0;
  game.score = 0;
  game.animFrame = 0;
  game.groundX = 0;
  game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
  game.lastObstacleX = -300;
  game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  game.state = STATE.WAITING;
  if (restartAfterDeath) game.countdownSkippable = true;
  game.starsInitialised = false;
  game.starFadeFrames = 0;
  Animations.reset();
  game.newBestShown      = false;
  game.plateauCueShown   = false;
  game.qaClusterShown    = false;
  // QA/debug only. Re-read so a mode toggle still honors the page query.
  qaPlateau = readQaPlateauFlag();
  qaCluster = readQaClusterFlag();
  qaNight = readQaNightFlag();
  game.isNewBest         = false;
  game.previousHighScore = 0;
  game.isNewTodayBest    = false;
  game.previousDailyBest = 0;
  game.lastGaps = [];
  game.lastObstacleTypes = [];
  game.lastJumpFrame = null;
  game.deathLog = null;
  game.runSeed = takeRunSeed();
  game.rng = mulberry32(game.runSeed);
  game.dailyBest = ScoreStore.loadDailyBest();
  const shareBtnEl = document.getElementById('share-btn');
  if (shareBtnEl && shareBtnEl.style) shareBtnEl.style.display = 'none';
  game.nextSpawnGap = computeNextSpawnGap(game.rng, DifficultyProfile.speedAtScore(game.score), game.mode);
  initClouds();
  initHills();
  const ready = game.countdownSkippable
    ? 'Get ready. Press space or tap to start.'
    : 'Get ready.';
  announce(isDailyMode() ? ready + ' ' + DAILY_PRE_RUN_LINE + '.' : ready);
  if (document.body) document.body.style.background = '';
}

function handleDead() {
  if (Animations.deathShakeFrames > 0) {
    ctx.save();
    ctx.translate(Math.sin(Animations.deathShakeFrames * cfg('DEATH_SHAKE_FREQ')) * cfg('DEATH_SHAKE_AMPLITUDE'), 0);
    drawBackground();
    drawHills();
    drawGround();
    drawClouds();
    drawObstacles();
    Particles.draw();
    drawDino();
    drawScore();
    ctx.restore();
    drawDeathFlash(); // white flash drawn outside the shake transform so it stays canvas-aligned
    Particles.update();
    if (Animations.deathFlashFrames > 0) Animations.deathFlashFrames--;
    if (Animations.scorePopFrames > 0) Animations.scorePopFrames--;
    Animations.deathShakeFrames--;
  } else if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) {
    Animations.deathAnimFrame++;
    drawGameOverScreen();
  } else {
    if (Animations.copyFlashFrames > 0) Animations.copyFlashFrames--;
    drawGameOverScreen();
  }
}

function handleIdle() {
  game.animFrame++;
  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  drawHills();
  drawGround();
  updateClouds();
  drawClouds();
  drawDino();
  drawIdleScreen();
}

function handleWaiting() {
  game.graceFrames--;
  game.animFrame++;
  if (game.graceFrames <= 0) {
    game.state = STATE.RUNNING;
    announce('Go!');
  }
  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  drawHills();
  drawGround();
  updateClouds();
  drawClouds();
  drawDino();
  drawScore();
  drawGetReadyOverlay();
}

function handleRunning() {
  const prevLevel = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.score += GAME_CONFIG.SCORE_INCREMENT;
  game.animFrame++;

  const level = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.currentSpeed = DifficultyProfile.speedAtScore(game.score);

  // Milestone flash on level-up.
  if (level > prevLevel && level > 0) {
    game.milestoneText = 'LEVEL ' + (level + 1);
    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    audio.milestone();
    Particles.emit('confetti', GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30, GAME_CONFIG.SCORE_Y);
  }

  // Scroll ground.
  game.groundX -= game.currentSpeed;
  if (imageReady(groundImage) && game.groundX <= -groundImage.width) game.groundX = 0;

  // Lazy-init stars once when night is full. Skipped under reduce-motion
  // (no init, same as before). Opacity then ramps across STAR_FADE_FRAMES
  // so the field eases in instead of popping on. Positions stay Math.random()
  // — cosmetic, and this block does not touch game.rng().
  if (!reducedMotion && scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_END && !game.starsInitialised) {
    for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
      game.stars.push({ x: Math.random() * GAME_CONFIG.CANVAS_W, y: Math.random() * GAME_CONFIG.STAR_Y_RANGE });
    }
    game.starsInitialised = true;
    game.starFadeFrames = 0;
  }
  if (game.starsInitialised && game.starFadeFrames < cfg('STAR_FADE_FRAMES')) {
    game.starFadeFrames++;
  }

  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  runFeatureUpdates();              // updateHills, updateClouds, Particles.update
  runFeatureDraws('background');    // drawHills, drawClouds
  drawGround();
  updateObstacles();

  // Plateau cue: one puff at the dino's heel, off the obstacle lane.
  // Production waits for 98% of plateau speed (~score 641) and uses the pale
  // night kind. QA/debug only — not for players: ?qaPlateau=1 fires at score 1
  // with a darker kind, just behind the sprite, so it shows on the day sky.
  // Classic never enters. Particles.emit uses Math.random(), not game.rng().
  const plateauReached = qaPlateau
    ? game.score >= QA_PLATEAU_SCORE
    : game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.PLATEAU_REACH_RATIO;
  if (isUpdatedMode() && !game.plateauCueShown && plateauReached) {
    game.plateauCueShown = true;
    if (qaPlateau) {
      Particles.emit('plateauQa', dino.x - 8, dino.y + dino.height - 8);
    } else {
      Particles.emit('plateau', dino.x + 4, dino.y + dino.height - 4);
    }
  }

  // Speed-trail particles: subtle dust trailing off the dino approaching plateau speed.
  if (isUpdatedMode() && game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * 0.96) {
    Particles.emit('trail', dino.x + 4, dino.y + dino.height - 4);
  }

  // Obstacle spawning — Updated/Daily precompute a jittered gap that scales
  // with speed once the shrinking curve would outrun a jump. Classic stays
  // deterministic. DifficultyProfile.nextObstacle() picks type + gap together.
  if (game.lastObstacleX <= GAME_CONFIG.CANVAS_W - game.nextSpawnGap) {
    const consumedGap = game.nextSpawnGap;
    const params = DifficultyProfile.nextObstacle(game.score, game.mode, game.rng);
    // ?qaCluster=1 may replace this one type. The roll above already ran.
    const type = qaClusterOverride(params.type);
    spawnObstacle(type);
    noteSpawnForDeathLog(consumedGap, type.id, game.currentSpeed);
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = params.gap;
  }

  drawObstacles();
  runFeatureDraws('foreground');    // Particles.draw

  // Collision detection.
  for (let i = 0; i < game.obstacles.length; i++) {
    if (checkCollision(dino, game.obstacles[i])) {
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = GAME_CONFIG.DEATH_SHAKE_FRAMES;
      // PR-C: white flash + score pop, mode-gated. Reduce-motion caps flash to 1 frame.
      if (isUpdatedMode()) {
        Animations.deathFlashFrames = reducedMotion ? 1 : GAME_CONFIG.DEATH_FLASH_FRAMES;
        Animations.scorePopFrames = reducedMotion ? 0 : GAME_CONFIG.SCORE_POP_FRAMES;
      }
      Particles.emit('collision', dino.x + dino.width / 2, dino.y + dino.height / 2);
      audio.death();
      const finalScore = Math.floor(game.score);
      const runResult = computeRunResult(finalScore, game.highScore);
      game.isNewBest         = runResult.isNewBest;
      game.previousHighScore = runResult.previousHighScore;
      if (finalScore > game.highScore) {
        game.highScore = finalScore;
        ScoreStore.saveHighScore(game.highScore);
      }
      if (isDailyMode()) {
        // Compare before saving, same as computeRunResult / isNewBest.
        // A tie is not a new today best. No prior today best (0) is.
        const todayResult = computeRunResult(finalScore, game.dailyBest);
        game.isNewTodayBest = todayResult.isNewBest;
        game.previousDailyBest = todayResult.previousHighScore;
        ScoreStore.saveDailyBest(finalScore);
        game.dailyBest = ScoreStore.loadDailyBest();
      } else {
        game.isNewTodayBest = false;
        game.previousDailyBest = 0;
      }
      const todayLine = game.isNewTodayBest ? 'New today best ' : 'Today best ';
      announce(isDailyMode()
        ? 'Game over. Score ' + finalScore + '. ' + todayLine + game.dailyBest + '. ' + DAILY_DEATH_HINT + '. Press space to restart.'
        : 'Game over. Score ' + finalScore + '. High score ' + game.highScore + '. Press space to restart.');
      if (runDebug) publishRunSnapshot(buildRunSnapshot('death'));
      return;
    }
  }

  // Apply gravity.
  if (dino.isJumping) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;

    if (dino.y >= GAME_CONFIG.CANVAS_H - dino.height) {
      dino.y = GAME_CONFIG.CANVAS_H - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
      Particles.emit('land', dino.x + dino.width / 2, dino.y + dino.height);
      audio.land();
    }
  }

  // NEW BEST badge — first time this run's score exceeds the stored high score.
  if (!game.newBestShown && game.highScore > 0 && Math.floor(game.score) > game.highScore) {
    game.newBestShown = true;
    Animations.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    announce('New best score!');
  }

  drawDino();
  drawScore();
  runFeatureDraws('overlay');       // drawSkyTint
  drawMilestoneFlash();
  drawNewBestBadge();
}

const STATE_HANDLERS = {
  [STATE.IDLE]:    handleIdle,
  [STATE.WAITING]: handleWaiting,
  [STATE.RUNNING]: handleRunning,
  [STATE.DEAD]:    handleDead,
};

function gameLoop() {
  game.animationFrameId = requestAnimationFrame(gameLoop);
  STATE_HANDLERS[game.state]();
}

// == SECTION 9: INITIALISATION ==
// Game starts automatically once all assets fire onImageLoad / onImageError,
// or after ASSET_LOAD_TIMEOUT_MS as a safety net.

// == SECTION 10: TEST EXPOSURE (Node only) ==
// Tests run script.js under Node and reference game state via the `game` object
// and functions via their module-level names. Browsers skip this block entirely.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.GAME_CONFIG = GAME_CONFIG;
  global.STATE = STATE;
  global.game = game;
  global.Animations = Animations;
  global.canvas = canvas;
  global.ctx = ctx;
  global.dino = dino;
  global.getBackgroundColor = getBackgroundColor;
  global.getHillColor = getHillColor;
  global.drawBackground = drawBackground;
  global.starFadeAlpha = starFadeAlpha;
  global.initClouds = initClouds;
  global.updateClouds = updateClouds;
  global.drawClouds = drawClouds;
  global.spawnObstacle = spawnObstacle;
  global.updateObstacles = updateObstacles;
  global.drawObstacles = drawObstacles;
  global.drawScore = drawScore;
  global.drawDino = drawDino;
  global.checkCollision = checkCollision;
  global.jump = jump;
  global.resetGame = resetGame;
  global.gameLoop = gameLoop;
  global.STATE_HANDLERS = STATE_HANDLERS;
  global.drawGameOverScreen = drawGameOverScreen;
  global.computeRunResult = computeRunResult;
  global.drawIdleScreen = drawIdleScreen;
  global.drawGetReadyOverlay = drawGetReadyOverlay;
  global.handleAction   = handleAction;
  global.initCanvasScale = initCanvasScale;
  global.handleResize   = handleResize;
  global.mulberry32 = mulberry32;
  global.MODES = MODES;
  global.setMode = setMode;
  global.loadMode = loadMode;
  global.Particles = Particles;
  global.audio = audio;
  global.drawDeathFlash = drawDeathFlash;
  global.drawMilestoneFlash = drawMilestoneFlash;
  global.drawNewBestBadge = drawNewBestBadge;
  global.initHills = initHills;
  global.updateHills = updateHills;
  global.drawHills = drawHills;
  global.drawSkyTint = drawSkyTint;
  global.FEATURES = FEATURES;
  global.runFeatureUpdates = runFeatureUpdates;
  global.runFeatureDraws = runFeatureDraws;
  global.cfg = cfg;
  global.loadTuning = loadTuning;
  global.saveTuning = saveTuning;
  global.DifficultyProfile = DifficultyProfile;
  global.announce = announce;
  global.a11yLive = a11yLive;
  global.dailySeed = dailySeed;
  global.dailyNumber = dailyNumber;
  global.ScoreStore = ScoreStore;
  global.isDailyMode = isDailyMode;
  global.shareDailyResult = shareDailyResult;
  global.setReducedMotion = setReducedMotion;
  global.enableDeathLog = enableDeathLog;
  global.disableDeathLog = disableDeathLog;
  global.isDeathLogEnabled = isDeathLogEnabled;
  global.applyDebugFromLocation = applyDebugFromLocation;
  global.replayRunSeed = replayRunSeed;
  global.dumpRun = dumpRun;
  global.copyDeathLog = copyDeathLog;
  global.handleDebugKey = handleDebugKey;
  global.setQaPlateau = setQaPlateau;
  global.readQaPlateauFlag = readQaPlateauFlag;
  global.QA_PLATEAU_SCORE = QA_PLATEAU_SCORE;
  global.setQaCluster = setQaCluster;
  global.readQaClusterFlag = readQaClusterFlag;
  global.setQaNight = setQaNight;
  global.readQaNightFlag = readQaNightFlag;
}
