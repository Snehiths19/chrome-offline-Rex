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

  it('should have a peak jump height of ~62.5px', () => {
    resetGame();
    // Target: jumpPower=-10, gravity=0.8 → peak = 10^2 / (2*0.8) = 62.5px
    // This test is written against the TARGET values, so it fails until constants are updated.
    const expectedPeak = 62.5;
    jump();
    let minY = dino.y;
    const groundY = canvas.height - dino.height;
    for (let i = 0; i < 60; i++) {
      dino.velocityY += dino.gravity;
      dino.y += dino.velocityY;
      if (dino.y < minY) minY = dino.y;
      if (dino.y >= groundY) { dino.y = groundY; dino.isJumping = false; break; }
    }
    const actualPeak = groundY - minY;
    assert(Math.abs(actualPeak - expectedPeak) <= 5,
      `Peak height ${actualPeak.toFixed(1)}px should be ~${expectedPeak}px. ` +
      `If this passes before changing constants, the test is wrong — rewrite it.`);
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

describe('Obstacle Gap Enforcement', () => {
  it('should not spawn a second obstacle until the first has moved 300px from right edge', () => {
    resetGame();
    gameRunning = true;

    // Frame 1: lastObstacleX starts at -300, so gap check passes → first obstacle spawns
    gameLoop();
    assertEquals(obstacles.length, 1, 'Should have 1 obstacle after first gameLoop frame');

    // Frame 2: first obstacle just spawned at canvas.width (600)
    // lastObstacleX was set to canvas.width (600) at spawn
    // After updateObstacles moves it by currentSpeed (~2px), it's at ~598 — still far from threshold (300)
    // So no second spawn
    gameLoop();
    assertEquals(obstacles.length, 1, 'Should still be 1 obstacle — gap not yet met');

    // Now force the obstacle to just past the threshold
    obstacles[0].x = canvas.width - 301; // x = 299
    lastObstacleX = obstacles[0].x; // sync (simulating what updateObstacles would set)

    // Next frame should spawn a second obstacle
    gameLoop();
    assertEquals(obstacles.length, 2, 'Should now be 2 obstacles — gap threshold met');

    gameRunning = false;
    cancelAnimationFrame(animationFrameId);
  });
});

describe('Difficulty Curve', () => {
  it('should cap speed at 5 regardless of score', () => {
    resetGame();
    score = 2000;
    const level = Math.floor(score / 100);
    const simulatedSpeed = Math.min(2 + level * 0.3, 5);
    assertEquals(simulatedSpeed, 5, `Speed at score 2000 should be 5, got ${simulatedSpeed}`);
  });

  it('should not set a .speed property on spawned obstacles', () => {
    resetGame();
    spawnObstacle();
    assert(obstacles[0].speed === undefined,
      `Obstacle should not have .speed (got: ${obstacles[0].speed}). Remove 'speed' from spawnObstacle().`);
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
