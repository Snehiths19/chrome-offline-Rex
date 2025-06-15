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
        };
      }
      return {};
    },
    addEventListener: () => {},
  };
  global.Image = class { constructor() { this.onload = null; this.src = ''; } };
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
  y: 150, // Initial y position (bottom of canvas - height)
  width: 40, // Approximate width
  height: 50, // Approximate height
  velocityY: 0,
  gravity: 0.5,
  // Increased jump power so the dino can clear early obstacles more easily
  jumpPower: -15, // Negative value for upward jump
  isJumping: false,
  image: new Image()
};

// Load dinosaur image
dino.image.src = 'assets/dino-stationary.png';

// Obstacle properties
const obstacleImage = new Image();
obstacleImage.src = 'assets/cactus.png';
const obstacles = [];
const obstacleWidth = 20; // Approximate width of cactus
const obstacleHeight = 40; // Approximate height of cactus
const obstacleSpeed = 2;
let frameCount = 0; // Used for periodic spawning
let gameRunning = true; // To control game loop
let animationFrameId; // To store requestAnimationFrame ID for cancellation
let score = 0; // Score variable

// Load all images and then start game
let imagesLoaded = 0;
const totalImages = 2; // dino and cactus

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) {
    // Set initial dino y position correctly based on canvas height after the image is loaded
    dino.y = canvas.height - dino.height; 
    // Draw initial dinosaur
    drawDino();
    // Start game loop after all images are loaded
    gameLoop();
  }
}

dino.image.onload = onImageLoad;
obstacleImage.onload = onImageLoad;


// Draw dinosaur function
function drawDino() {
  ctx.drawImage(dino.image, dino.x, dino.y, dino.width, dino.height);
}

// Spawn obstacle function
function spawnObstacle() {
  const obstacle = {
    x: canvas.width, // Start from the right edge
    y: canvas.height - obstacleHeight, // Position on the ground
    width: obstacleWidth,
    height: obstacleHeight,
    speed: obstacleSpeed
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
    if (obstacles[i].x + obstacles[i].width < 0) { // If obstacle is off-screen to the left
      obstacles.splice(i, 1);
    }
  }
}

// Draw score function
function drawScore() {
  ctx.fillStyle = 'black';
  ctx.font = '20px Arial';
  ctx.fillText('Score: ' + Math.floor(score), canvas.width - 150, 30); // Position in top-right
}

// Collision detection function
function checkCollision(dino, obstacle) {
  // Check for overlap in x-axis and y-axis
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

// Event listener for spacebar press
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    if (gameRunning) {
      jump();
    } else {
      resetGame();
      gameLoop(); // Start a new game loop
    }
  }
});

// Function to draw Game Over screen
function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Semi-transparent black background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.font = '40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '20px Arial';
  ctx.fillText('Final Score: ' + Math.floor(score), canvas.width / 2, canvas.height / 2);
  
  ctx.font = '16px Arial';
  ctx.fillText('Press Space to Restart', canvas.width / 2, canvas.height / 2 + 40);
}

// Function to reset game state
function resetGame() {
  dino.y = canvas.height - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;
  
  obstacles.length = 0; // Clear obstacles array
  score = 0;
  frameCount = 0;
  gameRunning = true;
  // It's important that gameLoop is called *after* resetting, 
  // which is handled by the keydown listener.
}

// Game loop
function gameLoop() {
  if (!gameRunning) {
    drawGameOverScreen(); // Draw game over screen when game is not running
    return;
  }

  frameCount++;
  score += 0.1; // Increment score (adjust increment value for desired speed)

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Spawn new obstacles periodically (e.g., every 120 frames, adjust as needed)
  if (frameCount % 120 === 0) {
    spawnObstacle();
  }

  // Update and draw obstacles
  updateObstacles();
  drawObstacles();

  // Check for collisions
  for (let i = 0; i < obstacles.length; i++) {
    if (checkCollision(dino, obstacles[i])) {
      gameRunning = false; // This will trigger drawGameOverScreen in the next frame
      cancelAnimationFrame(animationFrameId); // Stop current animation loop
      // No need to console log here anymore, as it's handled by drawGameOverScreen
      // console.log('Game Over. Final Score: ' + Math.floor(score));
      drawGameOverScreen(); // Draw immediately once before exiting
      return; // Exit gameLoop
    }
  }

  // Update dinosaur position (apply gravity)
  if (dino.isJumping) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;

    // Check if dino has landed
    if (dino.y >= canvas.height - dino.height) { // Ground level based on canvas height
      dino.y = canvas.height - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
    }
  }

  // Draw dinosaur
  drawDino();

  // Draw score
  drawScore();

  // Request next frame
  animationFrameId = requestAnimationFrame(gameLoop);
}

// Adjust dino.y to be on the "ground" (canvas height - dino height)
// This is now handled in onImageLoad to ensure dino.height is available.
// dino.y = canvas.height - dino.height; 

// Ensure the image source is set before onload if not already.
// dino.image.src = 'assets/dino-stationary.png'; // Already done above
// obstacleImage.src = 'assets/cactus.png'; // Already done above

// It's better to start the game loop once the image is loaded.
// So, the call to gameLoop() is moved inside dino.image.onload.
// gameLoop(); // Initial call to start the loop - moved

// Expose variables and functions when running under Node
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
