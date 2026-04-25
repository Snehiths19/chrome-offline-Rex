if (typeof window === 'undefined') {
  require('../script.js');
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
// The game script (script.js) is loaded by test-runner.html before this script
// (in browsers) or via require() above (in Node). Tests drive the game loop
// manually and inspect state through the `game` object.

// Prevent game from auto-starting if it did so on image load.
if (typeof cancelAnimationFrame === 'function' && game && game.animationFrameId) {
    cancelAnimationFrame(game.animationFrameId);
}
game.state = STATE.DEAD; // keep loop halted until tests explicitly advance state

// --- Test Suites ---
describe('Dinosaur Jump', () => {
  it('should move Y upwards for a frame after jump() then back down', () => {
    resetGame();
    game.state = STATE.RUNNING;

    const initialY = dino.y;
    jump();
    assert(dino.isJumping, 'Dino should be in jumping state');
    assert(dino.velocityY < 0, 'Dino velocityY should be negative (upwards)');

    // Drive physics directly — same math as gameLoop's gravity branch.
    const stepPhysics = () => {
      dino.velocityY += dino.gravity;
      dino.y += dino.velocityY;
      if (dino.y >= canvas.height - dino.height) {
        dino.y = canvas.height - dino.height;
        dino.isJumping = false;
        dino.velocityY = 0;
      }
    };

    stepPhysics();
    assert(dino.y < initialY, `Dino Y (${dino.y}) should be less than initial Y (${initialY}) after 1st frame`);

    let frames = 0;
    while (dino.isJumping && frames++ < 100) stepPhysics();
    assert(!dino.isJumping, 'Dino should eventually land');
    assertEquals(dino.y, canvas.height - dino.height, 'Dino should be back on the ground after landing');
  });

  it('should have a peak jump height of ~144px', () => {
    // jumpPower=-12, gravity=0.48 → peak ≈ 144px
    resetGame();
    game.state = STATE.RUNNING;
    const expectedPeak = 144;
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

  it('should ignore jump() when state is not RUNNING', () => {
    resetGame();
    game.state = STATE.WAITING;
    jump();
    assert(!dino.isJumping, 'jump() should not fire during WAITING');
    game.state = STATE.DEAD;
    jump();
    assert(!dino.isJumping, 'jump() should not fire during DEAD');
  });
});

describe('Obstacle Spawning & Movement', () => {
  it('should add an obstacle to the array when spawnObstacle is called', () => {
    resetGame();
    assertEquals(game.obstacles.length, 0, 'Obstacles array should be initially empty');
    spawnObstacle();
    assertEquals(game.obstacles.length, 1, 'Obstacle should be added to array');
    assertEquals(game.obstacles[0].x, canvas.width, 'Obstacle should spawn at the right edge');
  });

  it('should decrease obstacle X position after a game loop update', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    spawnObstacle();
    const initialObstacleX = game.obstacles[0].x;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assert(game.obstacles.length > 0, 'Obstacle should still exist');
    assert(game.obstacles[0].x < initialObstacleX,
      `Obstacle X (${game.obstacles[0].x}) should be less than initial X (${initialObstacleX})`);
  });
});

describe('Collision Detection', () => {
  it('should return true when dino and obstacle are colliding', () => {
    resetGame();
    dino.x = 50;
    dino.y = canvas.height - dino.height;
    dino.width = 40;
    dino.height = 50;

    const collidingObstacle = {
      x: 50,
      y: canvas.height - 40,
      width: 20,
      height: 40
    };
    game.obstacles.push(collidingObstacle);
    assert(checkCollision(dino, game.obstacles[0]), 'checkCollision should return true for colliding objects');
  });

  it('should return false when dino and obstacle are not colliding', () => {
    resetGame();
    dino.x = 50;
    dino.y = canvas.height - dino.height;
    dino.width = 40;
    dino.height = 50;

    const nonCollidingObstacle = {
      x: 200,
      y: canvas.height - 40,
      width: 20,
      height: 40
    };
    game.obstacles.push(nonCollidingObstacle);
    assert(!checkCollision(dino, game.obstacles[0]), 'checkCollision should return false for non-colliding objects');
  });
});

describe('Scoring', () => {
  it('should increment score after game loop updates', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;

    const initialScore = game.score;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assert(game.score > initialScore, `Score (${game.score}) should be greater than initial score (${initialScore})`);
  });
});

describe('Obstacle Gap Enforcement', () => {
  it('should not spawn a second obstacle until the dynamic gap threshold is met', () => {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    // Pin the RNG to the middle of the jitter range so nextSpawnGap is deterministic.
    game.rng = () => 0.5;
    game.nextSpawnGap = 600; // base gap at INITIAL_SPEED, zero jitter

    // Frame 1: lastObstacleX=-300 ≤ canvas.width-600 → first spawn
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'Should have 1 obstacle after first gameLoop frame');

    // After spawn, nextSpawnGap was recomputed at zero-jitter → 600 at INITIAL_SPEED
    assertEquals(game.nextSpawnGap, 600, 'Next gap should be baseGap 600 at INITIAL_SPEED with zero jitter');

    // Frame 2: obstacle hasn't drifted 600 yet — not a spawn frame.
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'Should still be 1 obstacle — 600px gap not met');

    // Force obstacle just past the threshold
    game.obstacles[0].x = canvas.width - 601;
    game.lastObstacleX = game.obstacles[0].x;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 2, 'Should now be 2 obstacles — gap threshold met');
  });
});

describe('Spawn Gap Jitter', () => {
  it('computeNextSpawnGap stays within [MIN_SPAWN_GAP, baseGap * (1 + JITTER)]', () => {
    const speeds = [GAME_CONFIG.INITIAL_SPEED, 3.0, GAME_CONFIG.SPEED_CAP];
    speeds.forEach(speed => {
      const baseGap = Math.max(
        GAME_CONFIG.MIN_SPAWN_GAP,
        GAME_CONFIG.MAX_SPAWN_GAP - (speed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
      );
      const upperBound = Math.round(baseGap * (1 + GAME_CONFIG.SPAWN_GAP_JITTER));
      const rng = mulberry32(12345);
      for (let i = 0; i < 500; i++) {
        const gap = computeNextSpawnGap(rng, speed);
        assert(
          gap >= GAME_CONFIG.MIN_SPAWN_GAP && gap <= upperBound,
          `At speed ${speed}, gap ${gap} should be in [${GAME_CONFIG.MIN_SPAWN_GAP}, ${upperBound}]`
        );
      }
    });
  });

  it('produces different gaps across spawns (breaks the metronome)', () => {
    const rng = mulberry32(7);
    const gaps = new Set();
    for (let i = 0; i < 50; i++) gaps.add(computeNextSpawnGap(rng, 2.0));
    assert(gaps.size >= 5, `Expected gap variety; got ${gaps.size} distinct values across 50 draws`);
  });

  it('smallest achievable gap is still at least MIN_SPAWN_GAP (always clearable)', () => {
    // Exhaustively test by forcing rng to 0 (maximum negative jitter).
    const worstCaseRng = () => 0;
    const gap = computeNextSpawnGap(worstCaseRng, GAME_CONFIG.SPEED_CAP);
    assert(gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `At max negative jitter + cap speed, gap ${gap} must be >= MIN_SPAWN_GAP ${GAME_CONFIG.MIN_SPAWN_GAP}`);
  });

  it('mulberry32 is deterministic given same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) assertEquals(a(), b(), 'Same seed should produce same sequence');
  });
});

describe('Death flash + score pop (PR-C)', () => {
  it('updated mode collision sets deathFlashFrames + scorePopFrames', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: canvas.height - 40, width: 20, height: 40 });
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.state, STATE.DEAD, 'should be dead');
    assertEquals(game.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES, 'flash counter set');
    assertEquals(game.scorePopFrames, GAME_CONFIG.SCORE_POP_FRAMES, 'score pop counter set');
  });

  it('classic mode collision leaves deathFlashFrames + scorePopFrames at 0', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: canvas.height - 40, width: 20, height: 40 });
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.deathFlashFrames, 0, 'classic should not flash');
    assertEquals(game.scorePopFrames, 0, 'classic should not pop');
    setMode(MODES.UPDATED); // reset for siblings
    cancelAnimationFrame(game.animationFrameId);
  });

  it('death flash decays to 0 across DEATH_FLASH_FRAMES frames during shake', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: canvas.height - 40, width: 20, height: 40 });
    gameLoop(); // collision frame, sets DEAD + flash
    cancelAnimationFrame(game.animationFrameId);
    // Each subsequent DEAD-shake frame should decrement deathFlashFrames once.
    for (let i = 0; i < GAME_CONFIG.DEATH_FLASH_FRAMES + 2; i++) {
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
    }
    assertEquals(game.deathFlashFrames, 0, 'flash should decay to 0');
  });

  it('resetGame clears deathFlashFrames + scorePopFrames', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    game.deathFlashFrames = 6;
    game.scorePopFrames = 12;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.deathFlashFrames, 0, 'reset clears flash');
    assertEquals(game.scorePopFrames, 0, 'reset clears pop');
  });
});

describe('Audio (PR-B)', () => {
  it('audio.ensure() returns null in Node (no AudioContext)', () => {
    const result = audio.ensure();
    assertEquals(result, null, 'AudioContext is unavailable in Node — ensure should return null');
  });

  it('setMuted persists through localStorage', () => {
    audio.setMuted(true);
    assertEquals(audio.muted, true, 'muted flag should flip');
    assertEquals(localStorage.getItem('dino-muted'), '1', 'mute persisted as "1"');
    audio.setMuted(false);
    assertEquals(localStorage.getItem('dino-muted'), '0', 'unmute persisted as "0"');
  });

  it('audio.jump() does not throw when ctx is unavailable (Node)', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    // Should silently no-op since ensure() returns null in Node.
    audio.jump();
    audio.land();
    audio.milestone();
    audio.death();
    // If we got here without throwing, the test passes.
  });

  it('audio.jump() short-circuits in classic mode before touching ctx', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.jump();
    audio.land();
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Classic mode should not even call ensure() — full short-circuit');
    setMode(MODES.UPDATED); // reset for siblings
    cancelAnimationFrame(game.animationFrameId);
  });

  it('audio.jump() does not call ctx oscillator when muted', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(true);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.jump();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted should short-circuit before ensure()');
    audio.setMuted(false);
  });
});

describe('Particles (PR-A)', () => {
  function clearParticles() { for (let i = 0; i < particles.length; i++) particles[i].life = 0; }

  it('emits 0 particles in classic mode', () => {
    clearParticles();
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    const n = emitParticles('jump', 100, 100);
    assertEquals(n, 0, 'Classic mode should not emit particles');
  });

  it('emits the configured count in updated mode', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    const n = emitParticles('jump', 100, 100);
    assertEquals(n, PARTICLE_KINDS.jump.count, `jump should emit ${PARTICLE_KINDS.jump.count} particles`);
  });

  it('emits 0 for an unknown kind without throwing', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    const n = emitParticles('nonexistent', 100, 100);
    assertEquals(n, 0, 'Unknown kind should be a no-op');
  });

  it('does not allocate beyond the pool when burst-emitting', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    // Fire a bunch of bursts; pool size shouldn't grow.
    for (let i = 0; i < 20; i++) emitParticles('collision', 100, 100);
    assertEquals(particles.length, PARTICLE_POOL_SIZE, 'Pool length must stay fixed');
    const live = particles.filter(p => p.life > 0).length;
    assert(live <= PARTICLE_POOL_SIZE, `Live particles (${live}) should not exceed pool`);
  });

  it('updateParticles decays life to 0 over maxLife frames', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    emitParticles('jump', 100, 100);
    const live = () => particles.filter(p => p.life > 0).length;
    const initial = live();
    assert(initial > 0, 'Should have live particles after emit');
    for (let i = 0; i < PARTICLE_KINDS.jump.life + 1; i++) updateParticles();
    assertEquals(live(), 0, 'All particles should be dead after maxLife frames');
  });

  it('resetGame clears any active particles', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    emitParticles('collision', 100, 100);
    assert(particles.some(p => p.life > 0), 'Should have live particles before reset');
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assert(particles.every(p => p.life === 0), 'All particles should be dead after reset');
  });
});

describe('Mode Toggle', () => {
  it('loadMode defaults to updated when nothing is stored', () => {
    localStorage.removeItem('dino-mode');
    assertEquals(loadMode(), MODES.UPDATED, 'Default should be updated');
  });

  it('loadMode returns classic when classic was previously stored', () => {
    localStorage.setItem('dino-mode', MODES.CLASSIC);
    assertEquals(loadMode(), MODES.CLASSIC, 'Stored classic should round-trip');
    localStorage.removeItem('dino-mode'); // reset for siblings
  });

  it('classic mode forces small cactus regardless of score or rng', () => {
    const rng = mulberry32(99);
    for (const score of [0, 100, 250, 1000]) {
      for (let i = 0; i < 50; i++) {
        const t = pickObstacleType(rng, score, MODES.CLASSIC);
        assertEquals(t.id, 'small', `Classic@${score}: expected small, got ${t.id}`);
      }
    }
  });

  it('classic mode returns deterministic gap (no jitter)', () => {
    const rng = () => 0; // worst-case jitter input
    const a = computeNextSpawnGap(rng, GAME_CONFIG.INITIAL_SPEED, MODES.CLASSIC);
    const b = computeNextSpawnGap(rng, GAME_CONFIG.INITIAL_SPEED, MODES.CLASSIC);
    assertEquals(a, b, 'Classic gap should not vary');
    assertEquals(a, GAME_CONFIG.MAX_SPAWN_GAP,
      `At INITIAL_SPEED, classic gap should be MAX_SPAWN_GAP (${GAME_CONFIG.MAX_SPAWN_GAP}), got ${a}`);
  });

  it('updated mode still produces variety', () => {
    const rng = mulberry32(11);
    const gaps = new Set();
    for (let i = 0; i < 30; i++) gaps.add(computeNextSpawnGap(rng, 8, MODES.UPDATED));
    assert(gaps.size >= 5, `Updated mode should jitter; got ${gaps.size} distinct values`);
  });

  it('setMode persists choice and resets the game', () => {
    setMode(MODES.CLASSIC);
    assertEquals(game.mode, MODES.CLASSIC, 'Mode should flip');
    assertEquals(localStorage.getItem('dino-mode'), MODES.CLASSIC, 'Mode should be persisted');
    assertEquals(game.score, 0, 'setMode should reset the run');
    cancelAnimationFrame(game.animationFrameId);
    setMode(MODES.UPDATED); // reset for siblings
    cancelAnimationFrame(game.animationFrameId);
  });
});

describe('Obstacle Types', () => {
  it('only returns small cactus when score < 100', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const t = pickObstacleType(rng, 50);
      assertEquals(t.id, 'small', `At score 50 expected small, got ${t.id}`);
    }
  });

  it('can return big cactus at score 100+ but never cluster before 250', () => {
    const rng = mulberry32(2);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(pickObstacleType(rng, 150).id);
    assert(seen.has('small') && seen.has('big'), `Expected small+big at score 150, saw ${[...seen]}`);
    assert(!seen.has('cluster'), `Cluster should not appear before score 250, saw ${[...seen]}`);
  });

  it('can return all three types at score 250+', () => {
    const rng = mulberry32(3);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(pickObstacleType(rng, 300).id);
    assert(seen.has('small') && seen.has('big') && seen.has('cluster'),
      `Expected all 3 types at score 300, saw ${[...seen]}`);
  });

  it('weighted distribution at score 300 is within 5% of declared weights', () => {
    const rng = mulberry32(4);
    const counts = { small: 0, big: 0, cluster: 0 };
    const total = 20000;
    for (let i = 0; i < total; i++) counts[pickObstacleType(rng, 300).id]++;
    const expected = { small: 0.5, big: 0.3, cluster: 0.2 };
    Object.keys(expected).forEach(id => {
      const observed = counts[id] / total;
      assert(Math.abs(observed - expected[id]) < 0.05,
        `${id}: expected ~${expected[id]}, got ${observed.toFixed(3)}`);
    });
  });

  it('spawnObstacle(type) respects the given type dimensions', () => {
    resetGame();
    const big = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'big');
    spawnObstacle(big);
    assertEquals(game.obstacles[0].width, big.width, 'Big cactus width');
    assertEquals(game.obstacles[0].height, big.height, 'Big cactus height');
    assertEquals(game.obstacles[0].type, 'big', 'Obstacle should carry its type id');
  });

  it('spawnObstacle() with no arg picks a score-appropriate type via rng', () => {
    resetGame();
    game.rng = () => 0.99; // nudges weighted pick toward last eligible option
    game.score = 0; // only small is eligible
    spawnObstacle();
    assertEquals(game.obstacles[0].type, 'small', 'At score 0 only small is eligible');
  });
});

describe('Difficulty Curve', () => {
  it('should cap currentSpeed at SPEED_CAP regardless of score', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;

    game.score = 2000;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.currentSpeed, GAME_CONFIG.SPEED_CAP,
      `currentSpeed at score 2000 should equal SPEED_CAP (${GAME_CONFIG.SPEED_CAP}), got ${game.currentSpeed}`);
  });

  it('should not set a .speed property on spawned obstacles', () => {
    resetGame();
    spawnObstacle();
    assert(game.obstacles[0].speed === undefined,
      `Obstacle should not have .speed (got: ${game.obstacles[0].speed}).`);
  });
});

describe('Clouds', () => {
  it('should initialise 3 clouds with x, y, speed', () => {
    resetGame();
    assertEquals(game.clouds.length, 3, 'Should have 3 clouds after resetGame');
    game.clouds.forEach((c, i) => {
      assert(typeof c.x === 'number', `Cloud ${i} missing x`);
      assert(c.y >= 10 && c.y <= 50, `Cloud ${i} y=${c.y} should be 10–50`);
      assert(c.speed > 0, `Cloud ${i} speed should be positive`);
    });
  });

  it('should move clouds left each frame via updateClouds', () => {
    resetGame();
    game.clouds[0].x = 300;
    updateClouds();
    assert(game.clouds[0].x < 300, `Cloud x (${game.clouds[0].x}) should be < 300 after updateClouds`);
  });
});

describe('Day/Night Cycle', () => {
  it('should return #ffffff at score 0', () => {
    assertEquals(getBackgroundColor(0), '#ffffff',
      `Expected #ffffff at score 0, got ${getBackgroundColor(0)}`);
  });

  it('should return #1a1a2e at score 400', () => {
    assertEquals(getBackgroundColor(400), '#1a1a2e',
      `Expected #1a1a2e at score 400, got ${getBackgroundColor(400)}`);
  });

  it('should return the correct interpolated color at score 350', () => {
    assertEquals(getBackgroundColor(350), '#8d8d97',
      `Score 350 (t=0.5) should produce midpoint color #8d8d97`);
  });

  it('should initialise stars once at score 400 and not re-init on second call', () => {
    resetGame();
    assert(!game.starsInitialised, 'starsInitialised should be false after reset');
    assertEquals(game.stars.length, 0, 'stars should be empty after reset');

    game.score = 400;
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.stars.length, 12, 'Should have 12 stars after first gameLoop at score 400');
    assert(game.starsInitialised, 'starsInitialised should be true');

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.stars.length, 12, 'Stars should not be re-initialised on second call');
  });
});

describe('High Score', () => {
  it('should update highScore and localStorage when score exceeds best', () => {
    resetGame();
    localStorage.removeItem('dino-high-score');
    game.obstacles.push({ x: 50, y: canvas.height - 40, width: 20, height: 40 });
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 100;
    game.highScore = 50;
    localStorage.setItem('dino-high-score', '50');

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.highScore, 100, `highScore should be 100, got ${game.highScore}`);
    assertEquals(localStorage.getItem('dino-high-score'), '100',
      'localStorage should store updated value');
  });

  it('should NOT update highScore when score is lower', () => {
    resetGame();
    localStorage.removeItem('dino-high-score');
    game.obstacles.push({ x: 50, y: canvas.height - 40, width: 20, height: 40 });
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 50;
    game.highScore = 200;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.highScore, 200, 'highScore should stay at 200');
    assertEquals(localStorage.getItem('dino-high-score'), null,
      'localStorage should not be written when score is lower');
  });
});

describe('State Transitions', () => {
  it('resetGame should put game in WAITING with full grace period', () => {
    resetGame();
    assertEquals(game.state, STATE.WAITING, 'State should be WAITING after reset');
    assertEquals(game.graceFrames, GAME_CONFIG.GRACE_FRAMES, 'graceFrames should be reset to full');
    assertEquals(game.score, 0, 'Score should be 0 after reset');
    assertEquals(game.obstacles.length, 0, 'Obstacles should be cleared');
    assertEquals(game.currentSpeed, GAME_CONFIG.INITIAL_SPEED, 'Speed should be back at initial');
    assert(!dino.isJumping, 'Dino should not be jumping after reset');
  });

  it('WAITING → RUNNING when graceFrames hit 0', () => {
    resetGame();
    game.graceFrames = 1; // one tick remaining
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.state, STATE.RUNNING, 'State should flip to RUNNING once grace expires');
  });

  it('RUNNING → DEAD on collision, preserving score/highScore paths', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 10;
    game.highScore = 0;
    // Place an obstacle squarely on the dino.
    game.obstacles.push({ x: dino.x, y: canvas.height - 40, width: 20, height: 40 });

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.state, STATE.DEAD, 'State should flip to DEAD on collision');
    assert(game.deathShakeFrames > 0, 'Death shake should be queued');
  });

  it('DEAD → WAITING via resetGame restores gameplay fields', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 50;
    game.obstacles.push({ x: dino.x, y: canvas.height - 40, width: 20, height: 40 });
    gameLoop(); // triggers DEAD
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.state, STATE.DEAD, 'Must be DEAD before reset');

    resetGame();
    assertEquals(game.state, STATE.WAITING, 'resetGame should put state back to WAITING');
    assertEquals(game.score, 0, 'score should be cleared');
    assertEquals(game.obstacles.length, 0, 'obstacles should be cleared');
    assertEquals(game.deathShakeFrames, 0, 'deathShakeFrames should be cleared');
  });
});

// --- Test Summary ---
// Print summary both in the browser (on window.onload) and in Node (via a
// setTimeout fallback so async tests have time to complete).
function printSummary() {
  console.log(`\n--- Test Summary ---`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`%cPassed: ${testsPassed}`, 'color: green;');
  const failed = testsRun - testsPassed;
  if (failed > 0) {
    console.log(`%cFailed: ${failed}`, 'color: red;');
    if (typeof process !== 'undefined' && process.exit) process.exitCode = 1;
  } else {
    console.log('All tests passed!');
  }
  console.log(`--------------------`);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load', () => setTimeout(printSummary, 500));
} else {
  setTimeout(printSummary, 500);
}
