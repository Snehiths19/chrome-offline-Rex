// --- Node Environment Setup ---
if (typeof window === 'undefined') {
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
  require('../script.js');
  window.document = global.document;
}

// --- Test Utilities ---
let testsRun = 0;
let testsPassed = 0;

function describe(description, testFn) {
  console.group(description);
  testFn();
  console.groupEnd();
}

function it(description, testFn) {
  testsRun++;

  const pass = () => {
    console.log(`%cPASSED: ${description}`, 'color: green;');
    testsPassed++;
  };

  const fail = (error) => {
    console.error(`%cFAILED: ${description}`, 'color: red;', error && error.message);
    if (error && error.stack) {
      console.error(error.stack);
    }
  };

  const handle = (maybePromise) => {
    if (maybePromise && typeof maybePromise.then === 'function') {
      // Promise returned
      maybePromise.then(pass).catch(fail);
    } else if (testFn.length === 0) {
      // Synchronous test completed
      pass();
    }
    // If testFn expected a callback, pass/fail will be handled when it calls done
  };

  try {
    if (testFn.length > 0) {
      // Asynchronous test using callback
      const done = (err) => (err ? fail(err) : pass());
      const maybePromise = testFn(done);
      handle(maybePromise);
    } else {
      const maybePromise = testFn();
      handle(maybePromise);
    }
  } catch (error) {
    fail(error);
  }
}

function assert(condition, message = "Assertion failed") {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual, expected, message = `Expected ${expected} but got ${actual}`) {
  if (actual !== expected) {
    throw new Error(message);
  }
}

function assertNotEquals(actual, unexpected, message = `Expected value not to be ${unexpected}`) {
  if (actual === unexpected) {
    throw new Error(message);
  }
}

// --- Mocking and Setup ---
// The game script (script.js) is loaded by test-runner.html before this script.
// We need to ensure the game doesn't auto-start its loop in a way that interferes.
// For these tests, we'll manually call gameLoop or other functions as needed.

// Prevent game from auto-starting if it does so on image load
if (typeof cancelAnimationFrame === 'function' && typeof animationFrameId !== 'undefined') {
    cancelAnimationFrame(animationFrameId); 
}
gameRunning = false; // Stop game loop if it was started

// --- Test Suites ---
describe('Dinosaur Jump', () => {
  it('should change Y position upwards then downwards when jump is called', (done) => {
    resetGame(); // Reset game state
    gameRunning = true; // Allow one controlled loop
    
    const initialY = dino.y;
    jump(); // Initiate jump
    assert(dino.isJumping, 'Dino should be in jumping state');
    assert(dino.velocityY < 0, 'Dino velocityY should be negative (upwards)');

    // Simulate a few frames
    requestAnimationFrame(() => {
      gameLoop(); // First frame: dino moves up
      assert(dino.y < initialY, `Dino Y (${dino.y}) should be less than initial Y (${initialY}) after 1st frame`);
      
      requestAnimationFrame(() => {
        gameLoop(); // Second frame: gravity starts affecting
        // Depending on gravity and jumpPower, it might still be going up or start coming down.
        // The key is that its position is being updated by the physics.
        
        let frames = 0;
        const maxFrames = 20; // Wait for dino to land or maxFrames
        function waitForLanding() {
            if (frames++ >= maxFrames || !dino.isJumping) {
                assert(!dino.isJumping, `Dino should have landed (isJumping is false). Current Y: ${dino.y}, VelocityY: ${dino.velocityY}`);
                assertEquals(dino.y, canvas.height - dino.height, `Dino should be back on the ground. Expected ${canvas.height - dino.height}, got ${dino.y}`);
                gameRunning = false; // Stop test loop
                cancelAnimationFrame(animationFrameId);
                done(); // Async test complete
                return;
            }
            gameLoop();
            requestAnimationFrame(waitForLanding);
        }
        waitForLanding();
      });
    });
  });
});

describe('Obstacle Spawning & Movement', () => {
  it('should add an obstacle to the array when spawnObstacle is called', () => {
    resetGame();
    assertEquals(obstacles.length, 0, 'Obstacles array should be initially empty');
    spawnObstacle();
    assertEquals(obstacles.length, 1, 'Obstacle should be added to array');
    assertEquals(obstacles[0].x, canvas.width, 'Obstacle should spawn at the right edge');
  });

  it('should decrease obstacle X position after a game loop update', (done) => {
    resetGame();
    spawnObstacle();
    const initialObstacleX = obstacles[0].x;
    gameRunning = true;

    requestAnimationFrame(() => {
      gameLoop(); // Run one frame of the game loop
      assert(obstacles.length > 0, "Obstacle should still exist"); // Ensure it wasn't removed prematurely
      assert(obstacles[0].x < initialObstacleX, `Obstacle X (${obstacles[0].x}) should be less than initial X (${initialObstacleX})`);
      gameRunning = false; // Stop test loop
      cancelAnimationFrame(animationFrameId);
      done();
    });
  });
});

describe('Collision Detection', () => {
  it('should return true when dino and obstacle are colliding', () => {
    resetGame();
    // Manually position dino and obstacle to collide
    dino.x = 50;
    dino.y = canvas.height - dino.height; // on the ground
    dino.width = 40;
    dino.height = 50;

    const collidingObstacle = {
      x: 50, // Overlap with dino's x
      y: canvas.height - 40, // Obstacle on ground
      width: 20,
      height: 40
    };
    obstacles.push(collidingObstacle);
    assert(checkCollision(dino, obstacles[0]), 'checkCollision should return true for colliding objects');
  });

  it('should return false when dino and obstacle are not colliding', () => {
    resetGame();
    dino.x = 50;
    dino.y = canvas.height - dino.height;
    dino.width = 40;
    dino.height = 50;

    const nonCollidingObstacle = {
      x: 200, // Far from dino
      y: canvas.height - 40,
      width: 20,
      height: 40
    };
    obstacles.push(nonCollidingObstacle);
    assert(!checkCollision(dino, obstacles[0]), 'checkCollision should return false for non-colliding objects');
  });
});

describe('Scoring', () => {
  it('should increment score after a few game loop updates', () => {
    resetGame();
    assertEquals(score, 0, 'Score should be initially 0');
    gameRunning = true;

    let initialScore = score;
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        gameLoop(); // Frame 1
        requestAnimationFrame(() => {
          gameLoop(); // Frame 2
          requestAnimationFrame(() => {
            gameLoop(); // Frame 3
            assert(score > initialScore, `Score (${score}) should be greater than initial score (${initialScore})`);
            gameRunning = false; // Stop test loop
            cancelAnimationFrame(animationFrameId);
            resolve();
          });
        });
      });
    });
  });
});

// --- Test Summary ---
// Need to run this after all tests, potentially with a timeout to catch async tests
window.onload = () => {
    // A brief timeout to allow async tests like jump to complete
    setTimeout(() => {
        console.log(`\n--- Test Summary ---`);
        console.log(`Total tests: ${testsRun}`);
        console.log(`%cPassed: ${testsPassed}`, 'color: green;');
        const failed = testsRun - testsPassed;
        if (failed > 0) {
            console.log(`%cFailed: ${failed}`, 'color: red;');
        } else {
            console.log('All tests passed!');
        }
        console.log(`--------------------`);
    }, 2000); // Adjust timeout as needed for your tests
};
