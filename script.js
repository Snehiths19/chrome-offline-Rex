// Minimal DOM stubs so the game can run in Node for tests
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
  window.document = global.document;
}

// Get canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Dinosaur properties
const dino = {
  x: 50,
  y: 150,
  width: 40,
  height: 50,
  velocityY: 0,
  gravity: 0.5,
  jumpPower: -15,
  isJumping: false,
  image: new Image()
};

// Load dinosaur images
dino.image.src = 'assets/dino-stationary.png';

const dinoRunImages = [new Image(), new Image()];
dinoRunImages[0].src = 'assets/dino-run-0.png';
dinoRunImages[1].src = 'assets/dino-run-1.png';

const dinoLoseImage = new Image();
dinoLoseImage.src = 'assets/dino-lose.png';

const groundImage = new Image();
groundImage.src = 'assets/ground.png';

// Obstacle properties
const obstacleImage = new Image();
obstacleImage.src = 'assets/cactus.png';
const obstacles = [];
const obstacleWidth = 20;
const obstacleHeight = 40;
const obstacleSpeed = 2; // base speed (kept for test compatibility)
let currentSpeed = 2;   // actual speed used, updated with difficulty
let spawnInterval = 120; // frames between spawns, updated with difficulty
let frameCount = 0;
let gameRunning = true;
let animationFrameId;
let score = 0;

// Animation / visual state
let animFrame = 0;  // increments each game loop tick
let groundX = 0;    // scrolling offset for ground sprite

// Image loading — wait for all 6 assets before starting
let imagesLoaded = 0;
const totalImages = 6;

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) {
    dino.y = canvas.height - dino.height;
    drawDino();
    gameLoop();
  }
}

function onImageError() {
  console.warn('A game asset failed to load. Continuing with fallback rendering.');
  onImageLoad(); // still count it so the game starts
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

// Draw dinosaur — uses animated run frames on ground, stationary in air, lose sprite on game over
function drawDino() {
  let img;
  if (!gameRunning) {
    img = dinoLoseImage;
  } else if (dino.isJumping) {
    img = dino.image; // stationary sprite looks fine mid-air
  } else {
    img = dinoRunImages[Math.floor(animFrame / 10) % 2];
  }
  ctx.drawImage(img, dino.x, dino.y, dino.width, dino.height);
}

// Draw scrolling ground
function drawGround() {
  if (!groundImage.width) return; // fallback: skip if image not loaded
  const groundY = canvas.height - groundImage.height;
  ctx.drawImage(groundImage, groundX, groundY, groundImage.width, groundImage.height);
  ctx.drawImage(groundImage, groundX + groundImage.width, groundY, groundImage.width, groundImage.height);
}

// Spawn obstacle function
function spawnObstacle() {
  const obstacle = {
    x: canvas.width,
    y: canvas.height - obstacleHeight,
    width: obstacleWidth,
    height: obstacleHeight,
    speed: currentSpeed
  };
  obstacles.push(obstacle);
}

// Draw obstacles function
function drawObstacles() {
  obstacles.forEach(obstacle => {
    ctx.drawImage(obstacleImage, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  });
}

// Update obstacles function (moves and removes off-screen ones)
function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= obstacles[i].speed;
    if (obstacles[i].x + obstacles[i].width < 0) {
      obstacles.splice(i, 1);
    }
  }
}

// Draw score function
function drawScore() {
  ctx.fillStyle = 'black';
  ctx.font = '20px Arial';
  ctx.fillText('Score: ' + Math.floor(score), canvas.width - 150, 30);
}

// Collision detection function
function checkCollision(dino, obstacle) {
  return (
    dino.x < obstacle.x + obstacle.width &&
    dino.x + dino.width > obstacle.x &&
    dino.y < obstacle.y + obstacle.height &&
    dino.y + dino.height > obstacle.y
  );
}

// Jump function
function jump() {
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
  }
}

// Shared handler for any "action" input (jump while running, restart while dead)
function handleAction() {
  if (gameRunning) {
    jump();
  } else {
    resetGame();
    gameLoop();
  }
}

// Keyboard input — Space, ArrowUp, W
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault(); // prevent page scroll on spacebar/arrow
    handleAction();
  }
});

// Mouse click on canvas (desktop)
canvas.addEventListener('click', handleAction);

// Touch on canvas (mobile)
canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  handleAction();
}, { passive: false });

// On-screen jump button (mobile)
const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    handleAction();
  }, { passive: false });
  jumpBtn.addEventListener('click', handleAction);
}

// Function to draw Game Over screen
function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.font = '40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '20px Arial';
  ctx.fillText('Final Score: ' + Math.floor(score), canvas.width / 2, canvas.height / 2);

  ctx.font = '16px Arial';
  ctx.fillText('Tap / Press Space to Restart', canvas.width / 2, canvas.height / 2 + 40);
}

// Function to reset game state
function resetGame() {
  dino.y = canvas.height - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;

  obstacles.length = 0;
  score = 0;
  frameCount = 0;
  animFrame = 0;
  groundX = 0;
  currentSpeed = 2;
  spawnInterval = 120;
  gameRunning = true;
}

// Game loop
function gameLoop() {
  if (!gameRunning) {
    drawGameOverScreen();
    return;
  }

  frameCount++;
  score += 0.1;
  animFrame++;

  // Difficulty scaling — every 100 points increase speed and reduce spawn interval
  const level = Math.floor(score / 100);
  currentSpeed = 2 + level * 0.5;
  spawnInterval = Math.max(60, 120 - level * 10);

  // Scroll ground
  groundX -= currentSpeed;
  if (groundImage.width && groundX <= -groundImage.width) groundX = 0;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Render: ground → obstacles → dino → score
  drawGround();

  if (frameCount % spawnInterval === 0) {
    spawnObstacle();
  }

  updateObstacles();
  drawObstacles();

  // Check for collisions
  for (let i = 0; i < obstacles.length; i++) {
    if (checkCollision(dino, obstacles[i])) {
      gameRunning = false;
      cancelAnimationFrame(animationFrameId);
      drawGameOverScreen();
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

  drawDino();
  drawScore();

  animationFrameId = requestAnimationFrame(gameLoop);
}

// Expose variables and functions when running under Node (for tests)
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
  expose('gameRunning', { get: () => gameRunning, set: (v) => { gameRunning = v; } });
  expose('animationFrameId', { get: () => animationFrameId, set: (v) => { animationFrameId = v; } });
  expose('frameCount', { get: () => frameCount, set: (v) => { frameCount = v; } });
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
