// == SECTION 1: NODE STUBS ==
// Minimal browser-API stubs so script.js can be `require`d from tests/game.test.js
// under plain Node without a DOM. Real browsers skip this block.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  };
  global.document = {
    getElementById: (id) => {
      if (id === 'gameCanvas') {
        return {
          width: 600,
          height: 200,
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
      return {
        addEventListener: () => {},
        setAttribute: () => {},
        dataset: {},
        textContent: '',
      };
    },
    addEventListener: () => {},
  };
  global.Image = class { constructor() { this.onload = null; this.onerror = null; this.src = ''; this.width = 1; this.height = 1; this.complete = true; } };
  global.requestAnimationFrame = (cb) => {
    const id = setImmediate(() => cb(Date.now()));
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
  // --- Physics ---
  JUMP_POWER:              -12,   // negative = upward impulse applied on jump
  GRAVITY:                  0.48, // added to velocityY each frame while airborne
  INITIAL_SPEED:            6.0,  // obstacle scroll speed at score 0 (matches Chrome T-Rex)
  SPEED_CAP:               13.0,  // max scroll speed (matches Chrome T-Rex)
  SPEED_INCREMENT:          1.0,  // speed added per level — 7 levels to cap
  SCORE_PER_LEVEL:        100,    // score points per level-up
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
  MIN_SPAWN_GAP:          340,    // gap (px) at SPEED_CAP — tuned minimum that's still clearable
  SPAWN_GAP_SPEED_FACTOR:  50,    // gap shrinks by this much per +1 speed above INITIAL_SPEED
  SPAWN_GAP_JITTER:         0.3,  // ±30% randomization; floored at MIN_SPAWN_GAP

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
  DEATH_SHAKE_FRAMES:      12,
  DEATH_SHAKE_AMPLITUDE:    4,
  DEATH_SHAKE_FREQ:         1.5,  // multiplier on the sin oscillation that drives the shake transform
  DEATH_FLASH_FRAMES:       6,    // PR-C: white-flash overlay length on collision
  DEATH_FLASH_COLOR_RGB:   '255, 255, 255', // death-flash overlay colour (rgb triplet, alpha applied at draw)
  SCORE_POP_FRAMES:        12,    // PR-C: HUD score scale-up duration during death shake
  MILESTONE_FRAMES:        90,
  NEW_BEST_FRAMES:        120,

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
// shake amplitude/freq, particle spread, parallax). Physics, spawning,
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

const STATE = Object.freeze({
  LOADING: 'LOADING',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});

// Respect the user's OS-level reduce-motion preference. Read once at startup —
// background animations (clouds, stars, day/night interpolation) skip rendering
// when true, but core gameplay (dino + obstacles) is unaffected.
const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

function startGameOnce() {
  if (assetsStarted) return;
  assetsStarted = true;
  dino.y = canvas.height - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.WAITING;
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
// Jitter is applied ±SPAWN_GAP_JITTER around baseGap, then floored at
// MIN_SPAWN_GAP so the smallest possible gap is always clearable. In classic
// mode, jitter is skipped — gaps are deterministic.
function computeNextSpawnGap(rng, currentSpeed, mode) {
  const baseGap =
    GAME_CONFIG.MAX_SPAWN_GAP -
    (currentSpeed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR;
  if (mode === 'classic') {
    return Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.round(baseGap));
  }
  const jitter = (rng() - 0.5) * 2 * GAME_CONFIG.SPAWN_GAP_JITTER; // range [-J, +J]
  return Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.round(baseGap * (1 + jitter)));
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

const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated' });

// Read the saved mode (defaults to 'updated' for first-time players). Persists
// across reload so the user's preference is remembered.
function loadMode() {
  const stored = localStorage.getItem('dino-mode');
  return stored === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
}

// All mutable game state lives on this object. Keeping it in one place prevents
// stray top-level globals and makes resets + test inspection simpler.
const game = {
  state:            STATE.LOADING,
  obstacles:        [],
  currentSpeed:     GAME_CONFIG.INITIAL_SPEED,
  lastObstacleX:    -300,
  nextSpawnGap:     GAME_CONFIG.MAX_SPAWN_GAP,
  graceFrames:      GAME_CONFIG.GRACE_FRAMES,
  animationFrameId: undefined,
  score:            0,
  highScore:        parseInt(localStorage.getItem('dino-high-score') || '0', 10),
  animFrame:        0,
  groundX:          0,
  clouds:           [],
  stars:            [],
  starsInitialised: false,
  hills:            [],
  deathShakeFrames: 0,
  deathFlashFrames: 0,
  scorePopFrames:   0,
  milestoneText:    '',
  milestoneFrames:  0,
  newBestFrames:    0,
  newBestShown:     false,
  rng:              mulberry32(Date.now() & 0xffffffff),
  mode:             loadMode(),
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

// == SECTION 5: RENDERING ==

function getBackgroundColor(s) {
  if (s < GAME_CONFIG.DAY_NIGHT_START) return '#ffffff';
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return '#1a1a2e';
  if (reducedMotion) return '#ffffff'; // no smooth interpolation — snap at end
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawBackground() {
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (game.starsInitialised) {
    ctx.fillStyle = GAME_CONFIG.STAR_COLOR;
    game.stars.forEach(s => ctx.fillRect(s.x, s.y, GAME_CONFIG.STAR_SIZE, GAME_CONFIG.STAR_SIZE));
  }
}

function initClouds() {
  game.clouds.length = 0;
  for (let i = 0; i < GAME_CONFIG.CLOUD_COUNT; i++) {
    game.clouds.push({
      x: Math.random() * canvas.width,
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
      c.x = canvas.width + GAME_CONFIG.CLOUD_RESPAWN_OFFSET;
      c.y = GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE;
    }
  });
}

// --- Mid-ground hills (PR-D, updated mode only) ---
// Soft mounds drawn behind the ground at slow parallax. Deterministic shape
// per-run via game.rng so the same seed yields identical scenery.
function initHills() {
  game.hills.length = 0;
  const slot = canvas.width / GAME_CONFIG.HILL_COUNT;
  for (let i = 0; i < GAME_CONFIG.HILL_COUNT; i++) {
    game.hills.push({
      x:      i * slot + game.rng() * (slot - GAME_CONFIG.HILL_MIN_WIDTH),
      width:  GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE,
      height: GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE,
    });
  }
}

function updateHills() {
  if (!isUpdatedMode() || reducedMotion) return;
  for (const hill of game.hills) {
    hill.x -= game.currentSpeed * GAME_CONFIG.HILL_PARALLAX;
    if (hill.x + hill.width < 0) {
      hill.x = canvas.width + game.rng() * cfg('HILL_RESPAWN_X_RANGE');
      hill.width = GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE;
      hill.height = GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE;
    }
  }
}

function getHillColor(score) {
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
  const baseY = canvas.height - 16;
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
  if (game.milestoneFrames <= 0) return;
  const alpha = (game.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES) * cfg('SKY_TINT_PEAK_ALPHA');
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('SKY_TINT_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    ctx.fillRect(0, canvas.height - 2, canvas.width, 2);
    return;
  }
  const groundY = canvas.height - groundImage.height;
  ctx.drawImage(groundImage, game.groundX, groundY, groundImage.width, groundImage.height);
  ctx.drawImage(groundImage, game.groundX + groundImage.width, groundY, groundImage.width, groundImage.height);
}

function drawObstacles() {
  game.obstacles.forEach(obstacle => {
    if (!imageReady(obstacleImage)) {
      ctx.fillStyle = '#2d7a2d';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      return;
    }
    if (obstacle.render === 'double') {
      // Cluster: draw two small cacti side by side to fill the 50-wide box.
      const half = obstacle.width / 2;
      ctx.drawImage(obstacleImage, obstacle.x,         obstacle.y, half, obstacle.height);
      ctx.drawImage(obstacleImage, obstacle.x + half,  obstacle.y, half, obstacle.height);
    } else {
      // Single (small, big): scale the sprite to the type's width/height.
      ctx.drawImage(obstacleImage, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
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
  const popping = game.scorePopFrames > 0 && isUpdatedMode() && !reducedMotion;
  if (popping) {
    // Brief 1.0 → 1.4 ease-out scale around the score's centre on death.
    const t = game.scorePopFrames / GAME_CONFIG.SCORE_POP_FRAMES; // 1 → 0
    const scale = 1 + t * 0.4;
    const cx = canvas.width - GAME_CONFIG.SCORE_X_OFFSET + 30;
    const cy = GAME_CONFIG.SCORE_Y - 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  const color = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.fillStyle = color;
  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(
    String(Math.floor(game.score)).padStart(5, '0'),
    canvas.width - GAME_CONFIG.SCORE_X_OFFSET,
    GAME_CONFIG.SCORE_Y
  );
  if (game.highScore > 0) {
    ctx.fillText(
      'HI ' + String(game.highScore).padStart(5, '0'),
      canvas.width - GAME_CONFIG.SCORE_X_OFFSET - GAME_CONFIG.SCORE_HI_X_OFFSET,
      GAME_CONFIG.SCORE_Y
    );
  }
  if (popping) ctx.restore();
}

// PR-C: white-flash overlay drawn on top of the world during the first few
// post-death frames. Mode-gated; reduce-motion caps it at 1 frame.
function drawDeathFlash() {
  if (game.deathFlashFrames <= 0) return;
  const alpha = game.deathFlashFrames / cfg('DEATH_FLASH_FRAMES');
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('DEATH_FLASH_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawGetReadyOverlay() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (game.graceFrames > GAME_CONFIG.GRACE_FRAMES * 0.33) {
    ctx.font = '28px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('GET READY', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('Press Space / Tap to jump', canvas.width / 2, canvas.height / 2 + 16);
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(game.graceFrames / step);
    ctx.font = '48px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText(count || 'GO!', canvas.width / 2, canvas.height / 2 + 16);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';

  ctx.font = '40px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(String(Math.floor(game.score)).padStart(5, '0'), canvas.width / 2, canvas.height / 2 - 10);

  if (game.highScore > 0) {
    ctx.fillText('BEST: ' + String(game.highScore).padStart(5, '0'), canvas.width / 2, canvas.height / 2 + 20);
  }

  ctx.font = '16px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 55);
}

function drawMilestoneFlash() {
  if (game.milestoneFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = game.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES;
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(game.milestoneText, canvas.width / 2, canvas.height / 2 - 30);
  ctx.restore();
  game.milestoneFrames--;
}

function drawNewBestBadge() {
  if (game.newBestFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = game.newBestFrames / GAME_CONFIG.NEW_BEST_FRAMES;
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px ' + cfg('SCORE_FONT_FAMILY');
  // Drop below the milestone flash when both fire on the same frame
  // (level-up + new-best at score = highScore + 100).
  const y = game.milestoneFrames > 0 ? 100 : 70;
  ctx.fillText('NEW BEST!', canvas.width - GAME_CONFIG.SCORE_X_OFFSET, y);
  ctx.restore();
  game.newBestFrames--;
}

// --- Particle system (PR-A) ---
// Pooled — slots with life <= 0 are reusable, no allocation per emit.
// Cosmetic only: uses Math.random() instead of game.rng so it can't perturb
// gameplay determinism (spawn jitter / obstacle picks stay reproducible).

const PARTICLE_POOL_SIZE = 80;
const PARTICLE_KINDS = Object.freeze({
  jump:      { count:  6, color: '#9c8770',         size: 3, life: 18, vyMin: -2.0, vyMax: -0.5, vxSpread: 1.5, gravity: 0.05 },
  land:      { count:  9, color: '#9c8770',         size: 3, life: 14, vyMin: -1.5, vyMax: -0.2, vxSpread: 2.5, gravity: 0.08 },
  trail:     { count:  1, color: 'rgba(150,150,150,0.55)', size: 2, life: 10, vyMin: -0.2, vyMax: 0.2, vxSpread: 0.4, gravity: 0    },
  collision: { count: 22, color: '#d04a2a',         size: 3, life: 24, vyMin: -3.0, vyMax: 1.0, vxSpread: 4.0, gravity: 0.10 },
  confetti:  { count: 20, color: '#ffd700',         size: 3, life: 40, vyMin: -3.5, vyMax: -1.5, vxSpread: 3.0, gravity: 0.12 },
});
const PARTICLE_REDUCED_FACTOR = 0.25;

const particles = [];
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
  particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0, color: '', gravity: 0 });
}

function isUpdatedMode() { return game.mode === MODES.UPDATED; }

function emitParticles(kind, x, y) {
  if (!isUpdatedMode()) return 0;
  const config = PARTICLE_KINDS[kind];
  if (!config) return 0;
  let count = config.count;
  if (reducedMotion) count = Math.max(1, Math.round(count * PARTICLE_REDUCED_FACTOR));
  const life = reducedMotion ? Math.max(2, Math.round(config.life * 0.5)) : config.life;
  let emitted = 0;
  for (let i = 0; i < particles.length && emitted < count; i++) {
    const p = particles[i];
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
}

function updateParticles() {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.life--;
  }
}

function drawParticles() {
  const prevAlpha = ctx.globalAlpha;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.life <= 0) continue;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = prevAlpha;
}

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
  { id: 'particles', layer: 'foreground', update: updateParticles, draw: drawParticles },
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
  const t = type || pickObstacleType(game.rng, game.score);
  game.obstacles.push({
    x: canvas.width,
    y: canvas.height - t.height,
    width: t.width,
    height: t.height,
    type: t.id,
    render: t.render,
  });
}

function updateObstacles() {
  for (let i = game.obstacles.length - 1; i >= 0; i--) {
    game.obstacles[i].x -= game.currentSpeed;
    if (game.obstacles[i].x + game.obstacles[i].width < 0) {
      game.obstacles.splice(i, 1);
    }
  }
  game.lastObstacleX = game.obstacles.length > 0 ? game.obstacles[game.obstacles.length - 1].x : -300;
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

function jump() {
  if (game.state !== STATE.RUNNING) return;
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
    emitParticles('jump', dino.x + dino.width / 2, dino.y + dino.height);
    audio.jump();
  }
}

// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.RUNNING) {
    jump();
  } else if (game.state === STATE.DEAD) {
    resetGame();
    gameLoop();
  }
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    handleAction();
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
  dino.y = canvas.height - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;

  // Clear any lingering particles from the previous run.
  for (let i = 0; i < particles.length; i++) particles[i].life = 0;

  game.obstacles.length = 0;
  game.stars.length = 0;
  game.score = 0;
  game.animFrame = 0;
  game.groundX = 0;
  game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
  game.lastObstacleX = -300;
  game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  game.state = STATE.WAITING;
  game.starsInitialised = false;
  game.deathShakeFrames = 0;
  game.deathFlashFrames = 0;
  game.scorePopFrames = 0;
  game.milestoneFrames = 0;
  game.newBestFrames = 0;
  game.newBestShown = false;
  game.rng = mulberry32(Date.now() & 0xffffffff);
  game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed, game.mode);
  initClouds();
  initHills();
  announce('New game. Press space or tap to jump.');
  if (document.body) document.body.style.background = '';
}

function gameLoop() {
  // DEAD — screen-shake for a few frames, then fall through to game over overlay.
  if (game.state === STATE.DEAD) {
    if (game.deathShakeFrames > 0) {
      ctx.save();
      ctx.translate(Math.sin(game.deathShakeFrames * cfg('DEATH_SHAKE_FREQ')) * cfg('DEATH_SHAKE_AMPLITUDE'), 0);
      drawBackground();
      drawHills();
      drawGround();
      drawClouds();
      drawObstacles();
      drawParticles();
      drawDino();
      drawScore();
      ctx.restore();
      drawDeathFlash(); // white flash drawn outside the shake transform so it stays canvas-aligned
      updateParticles();
      if (game.deathFlashFrames > 0) game.deathFlashFrames--;
      if (game.scorePopFrames > 0) game.scorePopFrames--;
      game.deathShakeFrames--;
      game.animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      drawGameOverScreen();
    }
    return;
  }

  // WAITING — grace-period countdown with GET READY overlay.
  if (game.state === STATE.WAITING) {
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
    game.animationFrameId = requestAnimationFrame(gameLoop);
    return;
  }

  // RUNNING — full game logic.
  const prevLevel = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.score += GAME_CONFIG.SCORE_INCREMENT;
  game.animFrame++;

  const level = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.currentSpeed = Math.min(
    GAME_CONFIG.INITIAL_SPEED + level * GAME_CONFIG.SPEED_INCREMENT,
    GAME_CONFIG.SPEED_CAP
  );

  // Milestone flash on level-up.
  if (level > prevLevel && level > 0) {
    game.milestoneText = 'LEVEL ' + (level + 1);
    game.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    audio.milestone();
    emitParticles('confetti', canvas.width - GAME_CONFIG.SCORE_X_OFFSET + 30, GAME_CONFIG.SCORE_Y);
  }

  // Scroll ground.
  game.groundX -= game.currentSpeed;
  if (imageReady(groundImage) && game.groundX <= -groundImage.width) game.groundX = 0;

  // Lazy-init stars once when score enters night. Skipped under reduce-motion.
  if (!reducedMotion && game.score >= GAME_CONFIG.DAY_NIGHT_END && !game.starsInitialised) {
    for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
      game.stars.push({ x: Math.random() * canvas.width, y: Math.random() * GAME_CONFIG.STAR_Y_RANGE });
    }
    game.starsInitialised = true;
  }

  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  runFeatureUpdates();              // updateHills, updateClouds, updateParticles
  runFeatureDraws('background');    // drawHills, drawClouds
  drawGround();
  updateObstacles();

  // Speed-trail particles: subtle dust trailing off the dino at near-cap speed.
  if (isUpdatedMode() && game.currentSpeed >= GAME_CONFIG.SPEED_CAP * 0.85) {
    emitParticles('trail', dino.x + 4, dino.y + dino.height - 4);
  }

  // Obstacle spawning — in updated mode the gap is precomputed per-obstacle
  // with ±SPAWN_GAP_JITTER so spacing doesn't feel metronomic; in classic mode
  // it's deterministic. See computeNextSpawnGap() / pickObstacleType().
  if (game.lastObstacleX <= canvas.width - game.nextSpawnGap) {
    spawnObstacle(pickObstacleType(game.rng, game.score, game.mode));
    game.lastObstacleX = canvas.width;
    game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed, game.mode);
  }

  drawObstacles();
  runFeatureDraws('foreground');    // drawParticles

  // Collision detection.
  for (let i = 0; i < game.obstacles.length; i++) {
    if (checkCollision(dino, game.obstacles[i])) {
      game.state = STATE.DEAD;
      game.deathShakeFrames = GAME_CONFIG.DEATH_SHAKE_FRAMES;
      // PR-C: white flash + score pop, mode-gated. Reduce-motion caps flash to 1 frame.
      if (isUpdatedMode()) {
        game.deathFlashFrames = reducedMotion ? 1 : GAME_CONFIG.DEATH_FLASH_FRAMES;
        game.scorePopFrames = reducedMotion ? 0 : GAME_CONFIG.SCORE_POP_FRAMES;
      }
      emitParticles('collision', dino.x + dino.width / 2, dino.y + dino.height / 2);
      audio.death();
      cancelAnimationFrame(game.animationFrameId);
      const finalScore = Math.floor(game.score);
      if (finalScore > game.highScore) {
        game.highScore = finalScore;
        localStorage.setItem('dino-high-score', game.highScore);
      }
      announce('Game over. Score ' + finalScore + '. High score ' + game.highScore + '. Press space to restart.');
      game.animationFrameId = requestAnimationFrame(gameLoop);
      return;
    }
  }

  // Apply gravity.
  if (dino.isJumping) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;

    if (dino.y >= canvas.height - dino.height) {
      dino.y = canvas.height - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
      emitParticles('land', dino.x + dino.width / 2, dino.y + dino.height);
      audio.land();
    }
  }

  // NEW BEST badge — first time this run's score exceeds the stored high score.
  if (!game.newBestShown && game.highScore > 0 && Math.floor(game.score) > game.highScore) {
    game.newBestShown = true;
    game.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    announce('New best score!');
  }

  drawDino();
  drawScore();
  runFeatureDraws('overlay');       // drawSkyTint
  drawMilestoneFlash();
  drawNewBestBadge();

  game.animationFrameId = requestAnimationFrame(gameLoop);
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
  global.canvas = canvas;
  global.ctx = ctx;
  global.dino = dino;
  global.getBackgroundColor = getBackgroundColor;
  global.getHillColor = getHillColor;
  global.drawBackground = drawBackground;
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
  global.drawGameOverScreen = drawGameOverScreen;
  global.mulberry32 = mulberry32;
  global.computeNextSpawnGap = computeNextSpawnGap;
  global.pickObstacleType = pickObstacleType;
  global.MODES = MODES;
  global.setMode = setMode;
  global.loadMode = loadMode;
  global.particles = particles;
  global.PARTICLE_KINDS = PARTICLE_KINDS;
  global.PARTICLE_POOL_SIZE = PARTICLE_POOL_SIZE;
  global.emitParticles = emitParticles;
  global.updateParticles = updateParticles;
  global.drawParticles = drawParticles;
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
}
