// == SECTION 1: NODE STUBS ==
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.window = {};
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
      return { addEventListener: () => {} };
    },
    addEventListener: () => {},
  };
  global.Image = class { constructor() { this.onload = null; this.onerror = null; this.src = ''; } };
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
  // Physics
  JUMP_POWER:              -12,
  GRAVITY:                  0.48,
  INITIAL_SPEED:            2.0,
  SPEED_CAP:                5.0,
  SPEED_INCREMENT:          0.3,
  SCORE_PER_LEVEL:        100,
  SCORE_INCREMENT:          0.1,

  // Hitbox forgiveness (rendering uses full sprite; collision uses shrunken box)
  DINO_PAD_X:               8,
  DINO_PAD_Y_TOP:           8,
  DINO_PAD_Y_BOT:           2,
  OBS_PAD_X:                3,
  OBS_PAD_Y:                2,

  // Spawning
  GRACE_FRAMES:           240,
  MAX_SPAWN_GAP:          600,
  MIN_SPAWN_GAP:          340,
  SPAWN_GAP_SPEED_FACTOR: 100,

  // Obstacle sprite
  OBS_WIDTH:               20,
  OBS_HEIGHT:              40,

  // Dino sprite
  DINO_X:                  50,
  DINO_WIDTH:              40,
  DINO_HEIGHT:             50,

  // Clouds
  CLOUD_COUNT:              3,
  CLOUD_MIN_Y:             10,
  CLOUD_Y_RANGE:           40,
  CLOUD_MIN_SPEED:          0.3,
  CLOUD_SPEED_RANGE:        0.3,

  // Day / Night
  DAY_NIGHT_START:        300,
  DAY_NIGHT_END:          400,
  STAR_COUNT:              12,

  // Animation
  RUN_FRAME_PERIOD:        10,
});

const STATE = Object.freeze({
  LOADING: 'LOADING',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});

// == SECTION 3: ASSET LOADING ==

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
const totalImages = 6;

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) {
    dino.y = canvas.height - dino.height;
    initClouds();
    drawDino();
    gameState = STATE.WAITING;
    gameLoop();
  }
}

function onImageError() {
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

// == SECTION 4: GAME STATE ==

let gameState = STATE.LOADING;
const obstacles = [];
let currentSpeed = GAME_CONFIG.INITIAL_SPEED;
let lastObstacleX = -300;
let graceFrames = GAME_CONFIG.GRACE_FRAMES;
let animationFrameId;
let score = 0;
let highScore = parseInt(localStorage.getItem('dino-high-score') || '0');
let animFrame = 0;
let groundX = 0;
const clouds = [];
const stars = [];
let starsInitialised = false;
let deathShakeFrames = 0;
let milestoneText = '';
let milestoneFrames = 0;
let newBestFrames = 0;
let newBestShown = false;

// == SECTION 5: RENDERING ==

function getBackgroundColor(s) {
  if (s < GAME_CONFIG.DAY_NIGHT_START) return '#ffffff';
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return '#1a1a2e';
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawBackground() {
  ctx.fillStyle = getBackgroundColor(score);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (starsInitialised) {
    ctx.fillStyle = '#ffffff';
    stars.forEach(s => ctx.fillRect(s.x, s.y, 2, 2));
  }
}

function initClouds() {
  clouds.length = 0;
  for (let i = 0; i < GAME_CONFIG.CLOUD_COUNT; i++) {
    clouds.push({
      x: Math.random() * canvas.width,
      y: GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE,
      speed: GAME_CONFIG.CLOUD_MIN_SPEED + Math.random() * GAME_CONFIG.CLOUD_SPEED_RANGE,
    });
  }
}

function updateClouds() {
  clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x + 60 < 0) {
      c.x = canvas.width + 20;
      c.y = GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE;
    }
  });
}

function drawClouds() {
  ctx.fillStyle = '#e8e8e8';
  clouds.forEach(c => {
    [[0, 0, 18], [-18, 8, 14], [18, 8, 14]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawGround() {
  if (!groundImage.width) return;
  const groundY = canvas.height - groundImage.height;
  ctx.drawImage(groundImage, groundX, groundY, groundImage.width, groundImage.height);
  ctx.drawImage(groundImage, groundX + groundImage.width, groundY, groundImage.width, groundImage.height);
}

function drawObstacles() {
  obstacles.forEach(obstacle => {
    ctx.drawImage(obstacleImage, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  });
}

function drawDino() {
  let img;
  if (gameState === STATE.DEAD) {
    img = dinoLoseImage;
  } else if (dino.isJumping) {
    img = dino.image;
  } else {
    img = dinoRunImages[Math.floor(animFrame / GAME_CONFIG.RUN_FRAME_PERIOD) % 2];
  }
  ctx.drawImage(img, dino.x, dino.y, dino.width, dino.height);
}

function drawScore() {
  ctx.fillStyle = score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Score: ' + Math.floor(score), canvas.width - 150, 30);
}

function drawGetReadyOverlay() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (graceFrames > GAME_CONFIG.GRACE_FRAMES * 0.33) {
    ctx.font = '28px Arial';
    ctx.fillText('GET READY', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px Arial';
    ctx.fillText('Press Space / Tap to jump', canvas.width / 2, canvas.height / 2 + 16);
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(graceFrames / step);
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
  ctx.fillText('Score: ' + Math.floor(score), canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillText('Best: ' + highScore, canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = '16px Arial';
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 55);
}

function drawMilestoneFlash() {
  if (milestoneFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = milestoneFrames / 90;
  ctx.fillStyle = score >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(milestoneText, canvas.width / 2, canvas.height / 2 - 30);
  ctx.restore();
  milestoneFrames--;
}

function drawNewBestBadge() {
  if (newBestFrames <= 0) return;
  ctx.save();
  ctx.globalAlpha = newBestFrames / 120;
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('NEW BEST!', canvas.width - 150, 70);
  ctx.restore();
  newBestFrames--;
}

// == SECTION 6: PHYSICS & GAME LOGIC ==

function spawnObstacle() {
  obstacles.push({
    x: canvas.width,
    y: canvas.height - GAME_CONFIG.OBS_HEIGHT,
    width: GAME_CONFIG.OBS_WIDTH,
    height: GAME_CONFIG.OBS_HEIGHT,
  });
}

function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= currentSpeed;
    if (obstacles[i].x + obstacles[i].width < 0) {
      obstacles.splice(i, 1);
    }
  }
  lastObstacleX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : -300;
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
  if (gameState !== STATE.RUNNING) return;
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
  }
}

// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  if (gameState === STATE.RUNNING) {
    jump();
  } else if (gameState === STATE.DEAD) {
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

  obstacles.length = 0;
  score = 0;
  animFrame = 0;
  groundX = 0;
  currentSpeed = GAME_CONFIG.INITIAL_SPEED;
  lastObstacleX = -300;
  graceFrames = GAME_CONFIG.GRACE_FRAMES;
  gameState = STATE.WAITING;
  stars.length = 0;
  starsInitialised = false;
  deathShakeFrames = 0;
  milestoneFrames = 0;
  newBestFrames = 0;
  newBestShown = false;
  initClouds();
}

function gameLoop() {
  // DEAD — 12-frame screen shake, then game over overlay
  if (gameState === STATE.DEAD) {
    if (deathShakeFrames > 0) {
      ctx.save();
      ctx.translate(Math.sin(deathShakeFrames * 1.5) * 4, 0);
      drawBackground();
      drawGround();
      drawClouds();
      drawObstacles();
      drawDino();
      drawScore();
      ctx.restore();
      deathShakeFrames--;
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      drawGameOverScreen();
    }
    return;
  }

  // WAITING — grace period countdown + GET READY overlay
  if (gameState === STATE.WAITING) {
    graceFrames--;
    if (graceFrames <= 0) gameState = STATE.RUNNING;
    drawBackground();
    drawGround();
    updateClouds();
    drawClouds();
    drawDino();
    drawScore();
    drawGetReadyOverlay();
    animationFrameId = requestAnimationFrame(gameLoop);
    return;
  }

  // RUNNING — full game logic
  const prevLevel = Math.floor(score / GAME_CONFIG.SCORE_PER_LEVEL);
  score += GAME_CONFIG.SCORE_INCREMENT;
  animFrame++;

  const level = Math.floor(score / GAME_CONFIG.SCORE_PER_LEVEL);
  currentSpeed = Math.min(
    GAME_CONFIG.INITIAL_SPEED + level * GAME_CONFIG.SPEED_INCREMENT,
    GAME_CONFIG.SPEED_CAP
  );

  // Milestone flash on level-up
  if (level > prevLevel && level > 0) {
    milestoneText = 'LEVEL ' + (level + 1);
    milestoneFrames = 90;
  }

  // Scroll ground
  groundX -= currentSpeed;
  if (groundImage.width && groundX <= -groundImage.width) groundX = 0;

  // Lazy-init stars once when score enters night
  if (score >= GAME_CONFIG.DAY_NIGHT_END && !starsInitialised) {
    for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
      stars.push({ x: Math.random() * canvas.width, y: Math.random() * 100 });
    }
    starsInitialised = true;
  }

  drawBackground();
  drawGround();
  updateClouds();
  drawClouds();
  updateObstacles();

  // Obstacle spawning
  const spawnGap = Math.max(
    GAME_CONFIG.MIN_SPAWN_GAP,
    Math.round(GAME_CONFIG.MAX_SPAWN_GAP - (currentSpeed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR)
  );
  if (lastObstacleX <= canvas.width - spawnGap) {
    spawnObstacle();
    lastObstacleX = canvas.width;
  }

  drawObstacles();

  // Collision detection
  for (let i = 0; i < obstacles.length; i++) {
    if (checkCollision(dino, obstacles[i])) {
      gameState = STATE.DEAD;
      deathShakeFrames = 12;
      cancelAnimationFrame(animationFrameId);
      if (Math.floor(score) > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('dino-high-score', highScore);
      }
      animationFrameId = requestAnimationFrame(gameLoop);
      return;
    }
  }

  // Apply gravity
  if (dino.isJumping) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;

    if (dino.y >= canvas.height - dino.height) {
      dino.y = canvas.height - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
    }
  }

  // NEW BEST badge — first time score exceeds high score this run
  if (!newBestShown && highScore > 0 && Math.floor(score) > highScore) {
    newBestShown = true;
    newBestFrames = 120;
  }

  drawDino();
  drawScore();
  drawMilestoneFlash();
  drawNewBestBadge();

  animationFrameId = requestAnimationFrame(gameLoop);
}

// == SECTION 9: INITIALISATION ==
// Game starts automatically once all assets fire onImageLoad / onImageError above.

// == SECTION 10: TEST EXPOSURE (Node only) ==
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  const expose = (name, getterSetter) => {
    Object.defineProperty(global, name, {
      get: getterSetter.get,
      set: getterSetter.set,
      configurable: true,
    });
  };

  expose('canvas', { get: () => canvas });
  expose('ctx', { get: () => ctx });
  expose('dino', { get: () => dino });
  expose('obstacles', { get: () => obstacles });
  expose('score', { get: () => score, set: (v) => { score = v; } });
  expose('highScore', { get: () => highScore, set: v => { highScore = v; } });
  // Backward-compat shim: tests use gameRunning = true/false
  expose('gameRunning', {
    get: () => gameState === STATE.RUNNING,
    set: v => { gameState = v ? STATE.RUNNING : STATE.DEAD; },
  });
  expose('animationFrameId', { get: () => animationFrameId, set: (v) => { animationFrameId = v; } });
  expose('lastObstacleX', { get: () => lastObstacleX, set: v => { lastObstacleX = v; } });
  expose('currentSpeed', { get: () => currentSpeed, set: v => { currentSpeed = v; } });
  expose('graceFrames', { get: () => graceFrames, set: v => { graceFrames = v; } });
  expose('clouds', { get: () => clouds });
  expose('stars', { get: () => stars });
  expose('starsInitialised', { get: () => starsInitialised, set: v => { starsInitialised = v; } });
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
}
