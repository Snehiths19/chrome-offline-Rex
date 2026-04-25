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
            fillStyle: '',
            strokeStyle: '',
            font: '',
            textAlign: '',
            globalAlpha: 1,
          }),
          addEventListener: () => {},
        };
      }
      return { addEventListener: () => {}, textContent: '' };
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

  // --- Effects ---
  DEATH_SHAKE_FRAMES:      12,
  DEATH_SHAKE_AMPLITUDE:    4,
  MILESTONE_FRAMES:        90,
  NEW_BEST_FRAMES:        120,

  // --- HUD ---
  SCORE_X_OFFSET:         150,    // pixels from right edge
  SCORE_Y:                 30,

  // --- Animation ---
  RUN_FRAME_PERIOD:        10,    // swap run-cycle sprite every N frames (~167 ms @ 60 fps)

  // --- Asset loading ---
  ASSET_LOAD_TIMEOUT_MS: 5000,    // force WAITING state even if assets never finish loading
});

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
// MIN_SPAWN_GAP so the smallest possible gap is always clearable.
function computeNextSpawnGap(rng, currentSpeed) {
  const baseGap =
    GAME_CONFIG.MAX_SPAWN_GAP -
    (currentSpeed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR;
  const jitter = (rng() - 0.5) * 2 * GAME_CONFIG.SPAWN_GAP_JITTER; // range [-J, +J]
  return Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.round(baseGap * (1 + jitter)));
}

// Pick an obstacle type weighted by score-tier eligibility. Types with
// unlockScore > score are excluded; among the rest, each contributes its
// `weight` to a weighted random draw.
function pickObstacleType(rng, score) {
  const eligible = GAME_CONFIG.OBSTACLE_TYPES.filter(t => score >= t.unlockScore);
  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return eligible[eligible.length - 1]; // rounding guard
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
  deathShakeFrames: 0,
  milestoneText:    '',
  milestoneFrames:  0,
  newBestFrames:    0,
  newBestShown:     false,
  rng:              mulberry32(Date.now() & 0xffffffff),
};

// In the browser, expose the game state + config on `window` so you can
// sanity-check live values from DevTools console (e.g. `game.currentSpeed`,
// `GAME_CONFIG.INITIAL_SPEED`). Skipped in Node — tests already get these
// via the test-exposure block at the bottom of the file.
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  window.game = game;
  window.GAME_CONFIG = GAME_CONFIG;
  window.STATE = STATE;
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
  game.clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x + GAME_CONFIG.CLOUD_WIDTH < 0) {
      c.x = canvas.width + GAME_CONFIG.CLOUD_RESPAWN_OFFSET;
      c.y = GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE;
    }
  });
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
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Score: ' + Math.floor(game.score), canvas.width - GAME_CONFIG.SCORE_X_OFFSET, GAME_CONFIG.SCORE_Y);
}

function drawGetReadyOverlay() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (game.graceFrames > GAME_CONFIG.GRACE_FRAMES * 0.33) {
    ctx.font = '28px Arial';
    ctx.fillText('GET READY', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px Arial';
    ctx.fillText('Press Space / Tap to jump', canvas.width / 2, canvas.height / 2 + 16);
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(game.graceFrames / step);
    ctx.font = '48px Arial';
    ctx.fillText(count || 'GO!', canvas.width / 2, canvas.height / 2 + 16);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';

  ctx.font = '40px Arial';
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

  ctx.font = '20px Arial';
  ctx.fillText('Score: ' + Math.floor(game.score), canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillText('Best: ' + game.highScore, canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = '16px Arial';
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 55);
}

function drawMilestoneFlash() {
  if (game.milestoneFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = game.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES;
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Arial';
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
  ctx.font = 'bold 14px Arial';
  ctx.fillText('NEW BEST!', canvas.width - GAME_CONFIG.SCORE_X_OFFSET, 70);
  ctx.restore();
  game.newBestFrames--;
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
  }
}

// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
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

// == SECTION 8: GAME LOOP ==

function resetGame() {
  dino.y = canvas.height - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;

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
  game.milestoneFrames = 0;
  game.newBestFrames = 0;
  game.newBestShown = false;
  game.rng = mulberry32(Date.now() & 0xffffffff);
  game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed);
  initClouds();
  announce('New game. Press space or tap to jump.');
}

function gameLoop() {
  // DEAD — screen-shake for a few frames, then fall through to game over overlay.
  if (game.state === STATE.DEAD) {
    if (game.deathShakeFrames > 0) {
      ctx.save();
      ctx.translate(Math.sin(game.deathShakeFrames * 1.5) * GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, 0);
      drawBackground();
      drawGround();
      drawClouds();
      drawObstacles();
      drawDino();
      drawScore();
      ctx.restore();
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
    if (game.graceFrames <= 0) {
      game.state = STATE.RUNNING;
      announce('Go!');
    }
    drawBackground();
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
  drawGround();
  updateClouds();
  drawClouds();
  updateObstacles();

  // Obstacle spawning — gap is precomputed per-obstacle with ±SPAWN_GAP_JITTER
  // so spacing doesn't feel metronomic. See computeNextSpawnGap().
  if (game.lastObstacleX <= canvas.width - game.nextSpawnGap) {
    spawnObstacle();
    game.lastObstacleX = canvas.width;
    game.nextSpawnGap = computeNextSpawnGap(game.rng, game.currentSpeed);
  }

  drawObstacles();

  // Collision detection.
  for (let i = 0; i < game.obstacles.length; i++) {
    if (checkCollision(dino, game.obstacles[i])) {
      game.state = STATE.DEAD;
      game.deathShakeFrames = GAME_CONFIG.DEATH_SHAKE_FRAMES;
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
}
