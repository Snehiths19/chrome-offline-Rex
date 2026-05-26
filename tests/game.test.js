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
      if (dino.y >= GAME_CONFIG.CANVAS_H - dino.height) {
        dino.y = GAME_CONFIG.CANVAS_H - dino.height;
        dino.isJumping = false;
        dino.velocityY = 0;
      }
    };

    stepPhysics();
    assert(dino.y < initialY, `Dino Y (${dino.y}) should be less than initial Y (${initialY}) after 1st frame`);

    let frames = 0;
    while (dino.isJumping && frames++ < 100) stepPhysics();
    assert(!dino.isJumping, 'Dino should eventually land');
    assertEquals(dino.y, GAME_CONFIG.CANVAS_H - dino.height, 'Dino should be back on the ground after landing');
  });

  it('should have a peak jump height of ~78px', () => {
    // jumpPower=-10, gravity=0.6 → discrete peak ≈ 78px (official-feel snappy arc)
    resetGame();
    game.state = STATE.RUNNING;
    const expectedPeak = 78;
    jump();
    let minY = dino.y;
    const groundY = GAME_CONFIG.CANVAS_H - dino.height;
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
    assertEquals(game.obstacles[0].x, GAME_CONFIG.CANVAS_W, 'Obstacle should spawn at the right edge');
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
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.width = 40;
    dino.height = 50;

    const collidingObstacle = {
      x: 50,
      y: GAME_CONFIG.CANVAS_H - 40,
      width: 20,
      height: 40
    };
    game.obstacles.push(collidingObstacle);
    assert(checkCollision(dino, game.obstacles[0]), 'checkCollision should return true for colliding objects');
  });

  it('should return false when dino and obstacle are not colliding', () => {
    resetGame();
    dino.x = 50;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.width = 40;
    dino.height = 50;

    const nonCollidingObstacle = {
      x: 200,
      y: GAME_CONFIG.CANVAS_H - 40,
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

  it('score equals accumulated distance times DISTANCE_COEFFICIENT', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    for (let i = 0; i < 10; i++) { gameLoop(); cancelAnimationFrame(game.animationFrameId); }
    assert(Math.abs(game.score - game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT) < 1e-9,
      `score ${game.score} must equal distance ${game.distance} * ${GAME_CONFIG.DISTANCE_COEFFICIENT}`);
    assert(game.score > 0, 'score should have advanced over 10 steps');
  });

  it('migrateScoreScale clears pre-v2 scores exactly once', () => {
    localStorage.setItem('dino-high-score', '9999');
    localStorage.setItem('dino-daily-best', '4242');
    localStorage.removeItem('dino-score-scale');
    migrateScoreScale();
    assertEquals(localStorage.getItem('dino-high-score'), null, 'pre-v2 high score cleared');
    assertEquals(localStorage.getItem('dino-daily-best'), null, 'pre-v2 daily best cleared');
    assertEquals(localStorage.getItem('dino-score-scale'), 'v2', 'scale marked v2');
    // second run is a no-op
    localStorage.setItem('dino-high-score', '50');
    migrateScoreScale();
    assertEquals(localStorage.getItem('dino-high-score'), '50', 'already-migrated: no further clearing');
  });
});

describe('Obstacle Gap Enforcement', () => {
  it('does not spawn a second obstacle until the official gap threshold is met', () => {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    game.rng = () => 0.5;                 // mid-range gap roll, deterministic
    game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
    game.nextSpawnGap = 100;             // small threshold so frame 1 spawns

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'first obstacle spawns on frame 1');

    // Recomputed gap must sit within the official band for the spawned type at this speed.
    const type   = game.obstacles[0].type ? GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === game.obstacles[0].type) : GAME_CONFIG.OBSTACLE_TYPES[0];
    const minGap = Math.round(type.width * game.currentSpeed + type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);
    assert(game.nextSpawnGap >= minGap && game.nextSpawnGap <= maxGap,
      `recomputed gap ${game.nextSpawnGap} must be in [${minGap}, ${maxGap}]`);

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'no new obstacle until gap distance elapses');

    game.obstacles[0].x = GAME_CONFIG.CANVAS_W - (game.nextSpawnGap + 1);
    game.lastObstacleX  = game.obstacles[0].x;
    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 2, 'second obstacle spawns once gap threshold met');
  });
});

describe('Spawn Gap (official model)', () => {
  function band(type, speed) {
    const minGap = Math.round(type.width * speed + type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    return { minGap, maxGap: Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT) };
  }

  it('gap stays within [minGap, minGap*MAX_GAP_COEFFICIENT] for the chosen type', () => {
    const speed = 8;
    const rng = mulberry32(12345);
    for (let i = 0; i < 500; i++) {
      const { type, gap } = DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng, speed);
      const { minGap, maxGap } = band(type, speed);
      assert(gap >= minGap && gap <= maxGap,
        `gap ${gap} for type ${type.id} at speed ${speed} must be in [${minGap}, ${maxGap}]`);
    }
  });

  it('gap grows with speed (official: width*speed dominates)', () => {
    const rng = () => 0.5;  // fixed mid roll isolates the speed term
    const slow = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    const fast = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 13);
    assert(fast.gap > slow.gap,
      `gap at speed 13 (${fast.gap}) should exceed gap at speed 6 (${slow.gap})`);
  });

  it('produces gap variety across spawns (breaks the metronome)', () => {
    const rng = mulberry32(7);
    const gaps = new Set();
    for (let i = 0; i < 50; i++) gaps.add(DifficultyProfile.nextObstacle(100, MODES.UPDATED, rng, 8).gap);
    assert(gaps.size >= 5, `expected gap variety; got ${gaps.size} distinct values`);
  });

  it('mulberry32 is deterministic given same seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 10; i++) assertEquals(a(), b(), 'same seed → same sequence');
  });
});

describe('Ambient depth + confetti (PR-D)', () => {
  it('initHills produces HILL_COUNT hills with stable shapes for the same seed', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    // Pin the RNG to a deterministic sequence.
    game.rng = mulberry32(42);
    initHills();
    const snapshot1 = game.hills.map(h => ({ x: h.x, w: h.width, h: h.height }));
    assertEquals(game.hills.length, GAME_CONFIG.HILL_COUNT, 'Hills count should match config');

    // Re-seed identically and re-init — same hills.
    game.rng = mulberry32(42);
    initHills();
    game.hills.forEach((h, i) => {
      assertEquals(h.x, snapshot1[i].x, `Hill ${i} x should be deterministic`);
      assertEquals(h.width, snapshot1[i].w, `Hill ${i} width should be deterministic`);
      assertEquals(h.height, snapshot1[i].h, `Hill ${i} height should be deterministic`);
    });
  });

  it('updateHills scrolls in updated mode but is a no-op in classic', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(1);
    initHills();
    const beforeX = game.hills[0].x;
    game.currentSpeed = 6;
    updateHills();
    assert(game.hills[0].x < beforeX, 'Hill should scroll left in updated mode');

    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(1);
    initHills();
    const classicBefore = game.hills[0].x;
    game.currentSpeed = 6;
    updateHills();
    assertEquals(game.hills[0].x, classicBefore, 'Classic mode should not scroll hills');
    setMode(MODES.UPDATED); // reset for siblings
    cancelAnimationFrame(game.animationFrameId);
  });

  it('updateHills respawns a hill on the right when it exits the left edge', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(7);
    initHills();
    const hill = game.hills[0];
    hill.x = -hill.width - 1; // already past left edge
    game.currentSpeed = 6;
    updateHills();
    assert(hill.x >= GAME_CONFIG.CANVAS_W, `Respawned hill x (${hill.x}) should be at/past right edge (${GAME_CONFIG.CANVAS_W})`);
  });

  it('confetti is a registered particle kind', () => {
    assert(Particles.KINDS.confetti, 'Particles.KINDS should include confetti');
    assert(Particles.KINDS.confetti.color === '#ffd700', 'Confetti should be gold');
  });

  it('level-up emits confetti in updated mode', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    // Clear pool and fast-forward to just before a level boundary.
    // Distance-based scoring: score = distance * DISTANCE_COEFFICIENT.
    // Set distance so score is just below SCORE_PER_LEVEL; the next tick adds
    // INITIAL_SPEED to distance and crosses the boundary.
    Particles.reset();
    game.distance = (GAME_CONFIG.SCORE_PER_LEVEL - 0.05) / GAME_CONFIG.DISTANCE_COEFFICIENT;
    game.score = game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT; // keep prevLevel consistent
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    const live = Particles.particles.filter(p => p.life > 0 && p.color === '#ffd700').length;
    assert(live > 0, `Should have emitted at least one gold confetti particle, got ${live}`);
  });

  it('level-up does not emit confetti in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    Particles.reset();
    // Set distance so that after handleRunning adds currentSpeed the score crosses SCORE_PER_LEVEL.
    // score = distance * DISTANCE_COEFFICIENT, so we need:
    //   (distance + currentSpeed) * DISTANCE_COEFFICIENT >= SCORE_PER_LEVEL
    // Priming distance to (SCORE_PER_LEVEL - 0.05) / DISTANCE_COEFFICIENT ensures the boundary
    // is genuinely crossed in the tick — the gate being tested is Particles.emit's isUpdatedMode()
    // check, not a miss of the milestone branch.
    game.distance = (GAME_CONFIG.SCORE_PER_LEVEL - 0.05) / GAME_CONFIG.DISTANCE_COEFFICIENT; // crosses level boundary on next step
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    const gold = Particles.particles.filter(p => p.life > 0 && p.color === '#ffd700').length;
    assertEquals(gold, 0, 'Classic mode should not spawn confetti');
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });
});

describe('Death flash + score pop (PR-C)', () => {
  it('updated mode collision sets deathFlashFrames + scorePopFrames', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.state, STATE.DEAD, 'should be dead');
    assertEquals(Animations.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES, 'flash counter set');
    assertEquals(Animations.scorePopFrames, GAME_CONFIG.SCORE_POP_FRAMES, 'score pop counter set');
  });

  it('classic mode collision leaves deathFlashFrames + scorePopFrames at 0', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(Animations.deathFlashFrames, 0, 'classic should not flash');
    assertEquals(Animations.scorePopFrames, 0, 'classic should not pop');
    setMode(MODES.UPDATED); // reset for siblings
    cancelAnimationFrame(game.animationFrameId);
  });

  it('death flash decays to 0 across DEATH_FLASH_FRAMES frames during shake', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    gameLoop(); // collision frame, sets DEAD + flash
    cancelAnimationFrame(game.animationFrameId);
    // Each subsequent DEAD-shake frame should decrement deathFlashFrames once.
    for (let i = 0; i < GAME_CONFIG.DEATH_FLASH_FRAMES + 2; i++) {
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
    }
    assertEquals(Animations.deathFlashFrames, 0, 'flash should decay to 0');
  });

  it('resetGame clears deathFlashFrames + scorePopFrames', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    Animations.deathFlashFrames = 6;
    Animations.scorePopFrames = 12;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(Animations.deathFlashFrames, 0, 'reset clears flash');
    assertEquals(Animations.scorePopFrames, 0, 'reset clears pop');
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

  it('audio.land() does not call ensure() in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.land();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Classic mode: land() should not reach ensure()');
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('audio.land() does not call ensure() when muted', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(true);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.land();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted: land() should not reach ensure()');
    audio.setMuted(false);
  });

  it('audio.death() does not call ensure() in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(false);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Classic mode: death() should not reach ensure()');
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('audio.death() does not call ensure() when muted', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    audio.setMuted(true);
    let ensureCalls = 0;
    const originalEnsure = audio.ensure;
    audio.ensure = function () { ensureCalls++; return null; };
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted: death() should not reach ensure()');
    audio.setMuted(false);
  });
});

describe('Particles (PR-A)', () => {
  function clearParticles() { Particles.reset(); }

  it('emits 0 particles in classic mode', () => {
    clearParticles();
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    const n = Particles.emit('jump', 100, 100);
    assertEquals(n, 0, 'Classic mode should not emit particles');
  });

  it('emits the configured count in updated mode', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    const n = Particles.emit('jump', 100, 100);
    assertEquals(n, Particles.KINDS.jump.count, `jump should emit ${Particles.KINDS.jump.count} particles`);
  });

  it('emits 0 for an unknown kind without throwing', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    const n = Particles.emit('nonexistent', 100, 100);
    assertEquals(n, 0, 'Unknown kind should be a no-op');
  });

  it('does not allocate beyond the pool when burst-emitting', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    // Fire a bunch of bursts; pool size shouldn't grow.
    for (let i = 0; i < 20; i++) Particles.emit('collision', 100, 100);
    assertEquals(Particles.particles.length, Particles.POOL_SIZE, 'Pool length must stay fixed');
    const live = Particles.particles.filter(p => p.life > 0).length;
    assert(live <= Particles.POOL_SIZE, `Live particles (${live}) should not exceed pool`);
  });

  it('updateParticles decays life to 0 over maxLife frames', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    Particles.emit('jump', 100, 100);
    const live = () => Particles.particles.filter(p => p.life > 0).length;
    const initial = live();
    assert(initial > 0, 'Should have live particles after emit');
    for (let i = 0; i < Particles.KINDS.jump.life + 1; i++) Particles.update();
    assertEquals(live(), 0, 'All particles should be dead after maxLife frames');
  });

  it('resetGame clears any active particles', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    Particles.emit('collision', 100, 100);
    assert(Particles.particles.some(p => p.life > 0), 'Should have live particles before reset');
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assert(Particles.particles.every(p => p.life === 0), 'All particles should be dead after reset');
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
        const { type } = DifficultyProfile.nextObstacle(score, MODES.CLASSIC, rng, 8);
        assertEquals(type.id, 'small', `Classic@${score}: expected small, got ${type.id}`);
      }
    }
  });

  it('classic mode gap uses the official band (rng-driven)', () => {
    // Classic mode runs the same official gap formula as updated mode; the old
    // "no-jitter" carve-out is gone (chrome://dino itself jitters spacing).
    // Verify: gaps stay within [minGap, minGap*MAX_GAP_COEFFICIENT] and the
    // seeded rng produces real variety.
    const rng = mulberry32(2026);
    const speed = GAME_CONFIG.INITIAL_SPEED;
    const small = GAME_CONFIG.OBSTACLE_TYPES[0]; // classic only ever spawns small
    const minGap = Math.round(small.width * speed + small.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);

    const gaps = new Set();
    for (let i = 0; i < 50; i++) {
      const { type, gap } = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, speed);
      assertEquals(type.id, 'small', 'classic mode must only spawn the small cactus');
      assert(gap >= minGap && gap <= maxGap, `gap ${gap} must be in band [${minGap}, ${maxGap}]`);
      gaps.add(gap);
    }
    assert(gaps.size >= 5, `seeded rng should produce gap variety in classic; got ${gaps.size} distinct values`);
  });

  it('updated mode still produces variety', () => {
    const rng = mulberry32(11);
    const gaps = new Set();
    for (let i = 0; i < 30; i++) gaps.add(DifficultyProfile.nextObstacle(200, MODES.UPDATED, rng, 8).gap);
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
      const { type } = DifficultyProfile.nextObstacle(50, MODES.UPDATED, rng, 8);
      assertEquals(type.id, 'small', `At score 50 expected small, got ${type.id}`);
    }
  });

  it('can return big cactus at score 100+ but never cluster before 250', () => {
    const rng = mulberry32(2);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(DifficultyProfile.nextObstacle(150, MODES.UPDATED, rng, 8).type.id);
    assert(seen.has('small') && seen.has('big'), `Expected small+big at score 150, saw ${[...seen]}`);
    assert(!seen.has('cluster'), `Cluster should not appear before score 250, saw ${[...seen]}`);
  });

  it('can return all three types at score 250+', () => {
    const rng = mulberry32(3);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng, 8).type.id);
    assert(seen.has('small') && seen.has('big') && seen.has('cluster'),
      `Expected all 3 types at score 300, saw ${[...seen]}`);
  });

  it('weighted distribution at score 300 is within 5% of declared weights', () => {
    const rng = mulberry32(4);
    const counts = { small: 0, big: 0, cluster: 0 };
    const total = 20000;
    for (let i = 0; i < total; i++) counts[DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng, 8).type.id]++;
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

  it('drawObstacles calls drawImage twice for a cluster obstacle', () => {
    resetGame();
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
    const half = cluster.width / 2;
    game.obstacles = [{ x: 100, y: 160, width: cluster.width, height: cluster.height, render: cluster.render, type: cluster.id }];

    const calls = [];
    const origDrawImage = ctx.drawImage;
    ctx.drawImage = (...args) => calls.push(args);
    drawObstacles();
    ctx.drawImage = origDrawImage;
    game.obstacles = [];

    assertEquals(calls.length, 2, 'Cluster obstacle must call drawImage exactly twice');
    assertEquals(calls[0][1], 100,        'First draw x must be obstacle.x');
    assertEquals(calls[1][1], 100 + half, 'Second draw x must be obstacle.x + half');
    assertEquals(calls[0][3], half, 'First draw width must be half');
    assertEquals(calls[1][3], half, 'Second draw width must be half');
  });
});

describe('Difficulty Curve', () => {
  it('currentSpeed accelerates by ACCELERATION each step and caps at SPEED_CAP', () => {
    resetGame(); game.state = STATE.RUNNING; game.graceFrames = 0;
    const s0 = game.currentSpeed;
    assertEquals(s0, GAME_CONFIG.INITIAL_SPEED, 'run starts at INITIAL_SPEED');

    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    game.obstacles.length = 0;   // keep the dino alive for the rest of the checks
    assert(Math.abs(game.currentSpeed - (s0 + GAME_CONFIG.ACCELERATION)) < 1e-9,
      `one step should add ACCELERATION; got ${game.currentSpeed} from ${s0}`);

    game.currentSpeed = GAME_CONFIG.SPEED_CAP - GAME_CONFIG.ACCELERATION / 2;
    game.obstacles.length = 0;
    gameLoop(); cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.currentSpeed, GAME_CONFIG.SPEED_CAP, 'speed clamps at SPEED_CAP');
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

  it('respawns a cloud past the right edge when it exits the left', () => {
    initClouds();
    game.clouds[0].x = -(GAME_CONFIG.CLOUD_WIDTH + 1);
    updateClouds();
    assert(
      game.clouds[0].x >= GAME_CONFIG.CANVAS_W,
      `Cloud should respawn at or past CANVAS_W (got ${game.clouds[0].x})`
    );
    assert(
      game.clouds[0].x <= GAME_CONFIG.CANVAS_W + GAME_CONFIG.CLOUD_RESPAWN_OFFSET,
      `Cloud respawn x (${game.clouds[0].x}) should not exceed CANVAS_W + CLOUD_RESPAWN_OFFSET`
    );
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

  it('returns #ffffff at DAY_NIGHT_START (score 300, t=0 boundary)', () => {
    assertEquals(getBackgroundColor(300), '#ffffff',
      'Score 300 is the first frame of the interpolation window — t=0 still produces white');
  });

  it('should initialise stars once at score 400 and not re-init on second call', () => {
    resetGame();
    assert(!game.starsInitialised, 'starsInitialised should be false after reset');
    assertEquals(game.stars.length, 0, 'stars should be empty after reset');

    // Distance-based scoring: score = distance * DISTANCE_COEFFICIENT.
    // Set distance so score is at 400 when handleRunning reads it.
    game.distance = 400 / GAME_CONFIG.DISTANCE_COEFFICIENT;
    game.score = game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT;
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
  it('should update highScore and save via ScoreStore when score exceeds best', () => {
    resetGame();
    const saves = [];
    const origSave = ScoreStore.saveHighScore;
    ScoreStore.saveHighScore = (n) => saves.push(n);
    game.obstacles.push({ x: 50, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    // Distance-based scoring: set distance so score computes to 100 after one step.
    game.distance = 100 / GAME_CONFIG.DISTANCE_COEFFICIENT;
    game.score = 100;
    game.highScore = 50;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    ScoreStore.saveHighScore = origSave;

    assertEquals(game.highScore, 100, `highScore should be 100, got ${game.highScore}`);
    assertEquals(saves[0], 100, 'ScoreStore.saveHighScore should have been called with 100');
  });

  it('should NOT update highScore when score is lower', () => {
    resetGame();
    const saves = [];
    const origSave = ScoreStore.saveHighScore;
    ScoreStore.saveHighScore = (n) => saves.push(n);
    game.obstacles.push({ x: 50, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 50;
    game.highScore = 200;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    ScoreStore.saveHighScore = origSave;

    assertEquals(game.highScore, 200, 'highScore should stay at 200');
    assertEquals(saves.length, 0, 'ScoreStore.saveHighScore should not have been called');
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
    game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.state, STATE.DEAD, 'State should flip to DEAD on collision');
    assert(Animations.deathShakeFrames > 0, 'Death shake should be queued');
  });

  it('DEAD → WAITING via resetGame restores gameplay fields', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.score = 50;
    game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
    gameLoop(); // triggers DEAD
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.state, STATE.DEAD, 'Must be DEAD before reset');

    resetGame();
    assertEquals(game.state, STATE.WAITING, 'resetGame should put state back to WAITING');
    assertEquals(game.score, 0, 'score should be cleared');
    assertEquals(game.obstacles.length, 0, 'obstacles should be cleared');
    assertEquals(Animations.deathShakeFrames, 0, 'deathShakeFrames should be cleared');
  });
});

describe('PR-P1 bug fixes', () => {
  it('updateHills respawn uses game.rng (consumes exactly 3 draws)', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(123);
    initHills();
    // Force the first hill off-screen so updateHills will respawn it.
    game.hills[0].x = -game.hills[0].width - 1;
    game.currentSpeed = 6;

    let calls = 0;
    const inner = mulberry32(456);
    game.rng = () => { calls++; return inner(); };
    updateHills();

    assertEquals(calls, 3, 'Respawn must consume exactly 3 game.rng() draws');
    assert(game.hills[0].x >= GAME_CONFIG.CANVAS_W,
      'Respawned x must land at or past canvas width');
  });

  it('hill respawn x is bounded by HILL_RESPAWN_X_RANGE', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    initHills();
    game.hills[0].x = -game.hills[0].width - 1;
    game.currentSpeed = 6;
    game.rng = () => 1.0;
    updateHills();
    const maxX = GAME_CONFIG.CANVAS_W + cfg('HILL_RESPAWN_X_RANGE');
    assert(
      game.hills[0].x <= maxX,
      `Hill x (${game.hills[0].x}) must not exceed CANVAS_W + HILL_RESPAWN_X_RANGE (${maxX})`
    );
    assert(game.hills[0].x >= GAME_CONFIG.CANVAS_W, 'Hill must respawn at or past CANVAS_W');
  });

  it('audio.ensure resumes a suspended context', () => {
    let resumed = 0;
    const prev = audio.ctx;
    audio.ctx = { state: 'suspended', resume: () => { resumed++; return Promise.resolve(); } };
    audio.ensure();
    assertEquals(resumed, 1, 'ensure() must call resume() on suspended ctx');
    audio.ctx = prev;
  });

  it('audio.ensure does not call resume on running context', () => {
    let resumed = 0;
    const prev = audio.ctx;
    audio.ctx = { state: 'running', resume: () => { resumed++; return Promise.resolve(); } };
    audio.ensure();
    assertEquals(resumed, 0, 'ensure() must not resume an already-running ctx');
    audio.ctx = prev;
  });

  it('drawNewBestBadge offsets vertically when milestone is active', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) => calls.push({ text, x, y });

    Animations.milestoneFrames = 0;
    Animations.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    drawNewBestBadge();
    const baseY = calls[calls.length - 1].y;

    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    Animations.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    drawNewBestBadge();
    const offsetY = calls[calls.length - 1].y;

    assert(offsetY > baseY,
      `NEW BEST y should drop when milestone active (base ${baseY}, offset ${offsetY})`);
    assertEquals(offsetY - baseY, 30, 'Stagger should be exactly 30px');

    ctx.fillText = origFill;
    Animations.milestoneFrames = 0;
    Animations.newBestFrames = 0;
  });
});

describe('Feature registry (PR-P2)', () => {
  it('exposes a frozen registry array', () => {
    assert(Array.isArray(FEATURES), 'FEATURES should be an array');
    assert(Object.isFrozen(FEATURES), 'FEATURES should be frozen');
  });

  it('registry id ordering is the documented contract', () => {
    const ids = FEATURES.map(f => f.id);
    assertEquals(ids[0], 'hills',     'hills must be first (background layer)');
    assertEquals(ids[1], 'clouds',    'clouds must follow hills (background layer)');
    assertEquals(ids[2], 'particles', 'particles must be foreground');
    assertEquals(ids[3], 'skyTint',   'skyTint must be overlay (last layer)');
  });

  it('every feature has at least one of update or draw', () => {
    for (const f of FEATURES) {
      const hasUpdate = typeof f.update === 'function';
      const hasDraw = typeof f.draw === 'function';
      assert(hasUpdate || hasDraw,
        `Feature ${f.id} must define update or draw`);
    }
  });

  it('layer partition matches pre-refactor draw order', () => {
    const bg = FEATURES.filter(f => f.layer === 'background').map(f => f.id);
    assertEquals(bg.join(','), 'hills,clouds',
      'background layer must be hills,clouds in that order');

    const fg = FEATURES.filter(f => f.layer === 'foreground').map(f => f.id);
    assertEquals(fg.join(','), 'particles');

    const ov = FEATURES.filter(f => f.layer === 'overlay').map(f => f.id);
    assertEquals(ov.join(','), 'skyTint');
  });

  it('hills feature self-gates in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(1);
    initHills();
    const beforeX = game.hills[0] && game.hills[0].x;
    game.currentSpeed = 6;

    const hillsFeature = FEATURES.find(f => f.id === 'hills');
    hillsFeature.update();

    assertEquals(game.hills[0] && game.hills[0].x, beforeX,
      'updateHills via registry must respect classic-mode self-gate');

    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('runFeatureDraws dispatches by layer in registry order', () => {
    const order = [];
    const originals = FEATURES.map(f => f.draw);
    // Mutate entries — array is frozen but its entries are not.
    FEATURES.forEach((f, i) => {
      if (!f.draw) return;
      f.draw = () => order.push(f.id);
    });

    runFeatureDraws('background');
    runFeatureDraws('foreground');
    runFeatureDraws('overlay');

    // Restore so subsequent tests / live game keep working.
    FEATURES.forEach((f, i) => { f.draw = originals[i]; });

    assertEquals(order.join(','), 'hills,clouds,particles,skyTint',
      'Layer dispatch must produce the canonical draw order');
  });
});

describe('Live-tuning hook (PR-P3)', () => {
  // Snapshot/restore helper so tests don't leak overrides into siblings.
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  it('cfg returns GAME_CONFIG value when no override is set', () => {
    withTuning({}, () => {
      assertEquals(cfg('SKY_TINT_PEAK_ALPHA'), GAME_CONFIG.SKY_TINT_PEAK_ALPHA);
      assertEquals(cfg('HILL_RESPAWN_X_RANGE'), 50);
      assertEquals(cfg('DEATH_SHAKE_FREQ'), 1.5);
    });
  });

  it('cfg returns the override when GAME_TUNING[key] is set', () => {
    withTuning({ SKY_TINT_PEAK_ALPHA: 0.5, DEATH_SHAKE_FREQ: 3.2 }, () => {
      assertEquals(cfg('SKY_TINT_PEAK_ALPHA'), 0.5);
      assertEquals(cfg('DEATH_SHAKE_FREQ'), 3.2);
      // Non-overridden key still falls through to GAME_CONFIG.
      assertEquals(cfg('HILL_RESPAWN_X_RANGE'), 50);
    });
  });

  it('cfg ignores prototype-polluted keys', () => {
    // Simulate a polluted prototype; cfg uses hasOwnProperty to skip it.
    const polluted = Object.create({ JUMP_POWER: 999 });
    withTuning(polluted, () => {
      assertEquals(cfg('JUMP_POWER'), GAME_CONFIG.JUMP_POWER,
        'Prototype keys must not leak through cfg');
    });
  });

  it('saveTuning persists current GAME_TUNING to dino-tuning as JSON', () => {
    withTuning({ SKY_TINT_PEAK_ALPHA: 0.3, HILL_RESPAWN_X_RANGE: 80 }, () => {
      assert(saveTuning(), 'saveTuning should return true on success');
      const raw = localStorage.getItem('dino-tuning');
      assert(raw, 'localStorage should hold the dino-tuning entry');
      const parsed = JSON.parse(raw);
      assertEquals(parsed.SKY_TINT_PEAK_ALPHA, 0.3);
      assertEquals(parsed.HILL_RESPAWN_X_RANGE, 80);
    });
    localStorage.removeItem('dino-tuning');
  });

  it('loadTuning hydrates from localStorage', () => {
    localStorage.setItem('dino-tuning', JSON.stringify({ DEATH_SHAKE_FREQ: 2.5 }));
    withTuning({}, () => {
      loadTuning();
      assertEquals(cfg('DEATH_SHAKE_FREQ'), 2.5);
    });
    localStorage.removeItem('dino-tuning');
  });

  it('save/load round-trip restores values', () => {
    withTuning({ SKY_TINT_PEAK_ALPHA: 0.42 }, () => {
      saveTuning();
    });
    withTuning({}, () => {
      loadTuning();
      assertEquals(cfg('SKY_TINT_PEAK_ALPHA'), 0.42,
        'Override must survive a save/clear/load cycle');
    });
    localStorage.removeItem('dino-tuning');
  });

  it('loadTuning ignores malformed JSON without throwing', () => {
    localStorage.setItem('dino-tuning', '{not json');
    withTuning({}, () => {
      loadTuning(); // must not throw
      assert(typeof window.GAME_TUNING === 'object',
        'GAME_TUNING must remain an object after malformed load');
    });
    localStorage.removeItem('dino-tuning');
  });

  it('drawSkyTint uses cfg-supplied colour string', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    // Pre-conditions for drawSkyTint to actually paint:
    //   isUpdatedMode() && !reducedMotion && milestoneFrames > 0.
    // The Node stub's matchMedia returns matches:false so reducedMotion is
    // always false here — no need to guard.
    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;

    const fillStyles = [];
    const proto = Object.getPrototypeOf(ctx);
    let captured = '';
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return captured; },
      set(v) { captured = v; fillStyles.push(v); },
    });

    withTuning({ SKY_TINT_COLOR_RGB: '0, 0, 255' }, () => {
      drawSkyTint();
    });

    // Restore: just delete our own property so the prototype value re-shows.
    delete ctx.fillStyle;

    const blueish = fillStyles.find(s => typeof s === 'string' && s.indexOf('rgba(0, 0, 255') === 0);
    assert(blueish, `Expected a fillStyle starting with 'rgba(0, 0, 255' but got: ${JSON.stringify(fillStyles)}`);

    Animations.milestoneFrames = 0;
  });
});

describe('HUD score format (polish pass)', () => {
  it('score renders as zero-padded 5-digit string without "Score:" prefix', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    const origScore = game.score;
    const origPop = Animations.scorePopFrames;
    const origHS = game.highScore;
    game.score = 42;
    Animations.scorePopFrames = 0;
    game.highScore = 0;
    drawScore();
    ctx.fillText = origFill;
    game.score = origScore;
    Animations.scorePopFrames = origPop;
    game.highScore = origHS;
    assert(calls.some(t => t === '00042'),
      `Expected '00042' in HUD calls, got: ${JSON.stringify(calls)}`);
    assert(!calls.some(t => t.includes('Score:')),
      `Expected no 'Score:' prefix, got: ${JSON.stringify(calls)}`);
  });

  it('HI label appears in HUD when highScore > 0', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    const origHS = game.highScore;
    const origScore = game.score;
    const origPop = Animations.scorePopFrames;
    game.highScore = 150;
    game.score = 42;
    Animations.scorePopFrames = 0;
    drawScore();
    ctx.fillText = origFill;
    game.highScore = origHS;
    game.score = origScore;
    Animations.scorePopFrames = origPop;
    assert(calls.some(t => t.startsWith('HI ')),
      `Expected 'HI ...' label in HUD, got: ${JSON.stringify(calls)}`);
  });

  it('HI label absent when highScore is 0', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    const origHS = game.highScore;
    const origScore = game.score;
    const origPop = Animations.scorePopFrames;
    game.highScore = 0;
    game.score = 42;
    Animations.scorePopFrames = 0;
    drawScore();
    ctx.fillText = origFill;
    game.highScore = origHS;
    game.score = origScore;
    Animations.scorePopFrames = origPop;
    assert(!calls.some(t => t.startsWith('HI ')),
      `Expected no 'HI ...' label when highScore is 0, got: ${JSON.stringify(calls)}`);
  });
});

describe('Game over screen (polish pass)', () => {
  it('score on game over screen is zero-padded without "Score:" prefix', () => {
    const calls = [];
    const origFill      = ctx.fillText;
    const origScore     = game.score;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.score          = 87;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText        = origFill;
    game.score          = origScore;
    Animations.deathAnimFrame = origAnimFrame;
    assert(calls.some(t => t === '00087'),
      `Expected '00087' on game over screen, got: ${JSON.stringify(calls)}`);
    assert(!calls.some(t => t.includes('Score:')),
      `Expected no 'Score:' prefix on game over screen, got: ${JSON.stringify(calls)}`);
  });

  it('Best line hidden when highScore is 0 (first run: new record screen, no YOUR BEST)', () => {
    const calls = [];
    const origFill      = ctx.fillText;
    const origNewBest   = game.isNewBest;
    const origPrevHS    = game.previousHighScore;
    const origHS        = game.highScore;
    const origScore     = game.score;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.isNewBest         = true;
    game.previousHighScore = 0;
    game.highScore         = 0;
    game.score             = 500;
    Animations.deathAnimFrame    = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText           = origFill;
    game.isNewBest         = origNewBest;
    game.previousHighScore = origPrevHS;
    game.highScore         = origHS;
    game.score             = origScore;
    Animations.deathAnimFrame    = origAnimFrame;
    assert(!calls.some(t => t === 'YOUR BEST'),
      `Expected no 'YOUR BEST' on first-run new record screen, got: ${JSON.stringify(calls)}`);
    assert(!calls.some(t => t.includes('over your previous best')),
      `Expected no delta line on first run (previousHighScore=0), got: ${JSON.stringify(calls)}`);
  });

  it('Best line shown when highScore > 0 (normal death side-by-side)', () => {
    const calls = [];
    const origFill      = ctx.fillText;
    const origNewBest   = game.isNewBest;
    const origHS        = game.highScore;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.isNewBest      = false;
    game.highScore      = 250;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText        = origFill;
    game.isNewBest      = origNewBest;
    game.highScore      = origHS;
    Animations.deathAnimFrame = origAnimFrame;
    assert(calls.some(t => t === 'YOUR BEST'),
      `Expected 'YOUR BEST' in normal death side-by-side, got: ${JSON.stringify(calls)}`);
  });
});

describe('announce() accessibility helper', () => {
  it('sets a11yLive.textContent to the announced message', () => {
    a11yLive.textContent = '';
    announce('hello');
    assertEquals(a11yLive.textContent, 'hello',
      'announce should write message to a11y live region');
  });

  it('overwrites textContent on repeated calls', () => {
    a11yLive.textContent = '';
    announce('first');
    announce('second');
    assertEquals(a11yLive.textContent, 'second',
      'second announce should overwrite the first');
  });
});

describe('Death screen', () => {
  // --- computeRunResult ---

  it('computeRunResult: normal run returns isNewBest=false and gap delta', () => {
    const r = computeRunResult(847, 1050);
    assertEquals(r.isNewBest, false, 'not a new best when score < highScore');
    assertEquals(r.delta, 203, 'delta = highScore - score = 1050 - 847');
    assertEquals(r.previousHighScore, 1050, 'previousHighScore preserved');
  });

  it('computeRunResult: new record returns isNewBest=true and improvement delta', () => {
    const r = computeRunResult(1253, 1050);
    assertEquals(r.isNewBest, true, 'is a new best when score > highScore');
    assertEquals(r.delta, 203, 'delta = score - previousHighScore = 1253 - 1050');
    assertEquals(r.previousHighScore, 1050, 'previousHighScore is old highScore');
  });

  it('computeRunResult: first run (highScore=0) is always a new best', () => {
    const r = computeRunResult(500, 0);
    assertEquals(r.isNewBest, true, 'first run with highScore=0 is a new best');
    assertEquals(r.previousHighScore, 0, 'previousHighScore is 0 on first run');
  });

  it('computeRunResult: tie (score === highScore) is not a new best', () => {
    const r = computeRunResult(1000, 1000);
    assertEquals(r.isNewBest, false, 'tie is not a new best');
    assertEquals(r.delta, 0, 'delta is 0 on a tie');
  });

  // --- game state fields + death handler ---

  it('death handler sets isNewBest and previousHighScore before updating highScore', () => {
    const origHS        = game.highScore;
    const origScore     = game.score;
    const origState     = game.state;
    const origObstacles = game.obstacles;
    const origLastObs   = game.lastObstacleX;
    const origNewBest   = game.isNewBest;
    const origPrevHS    = game.previousHighScore;
    const origGraceFrames = game.graceFrames;

    game.highScore         = 1000;
    // Distance-based scoring: score = distance * DISTANCE_COEFFICIENT.
    // Set distance so that after handleRunning's step, Math.floor(score) = 1200.
    game.distance          = 1200 / GAME_CONFIG.DISTANCE_COEFFICIENT; // score will be ~1200 after one step
    game.score             = game.distance * GAME_CONFIG.DISTANCE_COEFFICIENT; // pre-tick score for prevLevel
    game.state             = STATE.RUNNING;
    game.graceFrames       = 0;
    game.lastObstacleX     = canvas.width; // prevent an extra spawn firing
    // Place obstacle exactly at the dino — guaranteed collision regardless of hitbox padding.
    game.obstacles = [{ x: GAME_CONFIG.DINO_X, y: dino.y, width: GAME_CONFIG.DINO_WIDTH, height: GAME_CONFIG.DINO_HEIGHT }];

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.state,             STATE.DEAD, 'collision should set DEAD');
    assertEquals(game.isNewBest,         true,       'score 1200 > highScore 1000 → new best');
    assertEquals(game.previousHighScore, 1000,       'previousHighScore should be pre-death highScore');
    assertEquals(game.highScore,         1200,       'highScore should be updated to 1200');

    game.highScore         = origHS;
    game.score             = origScore;
    game.state             = origState;
    game.obstacles         = origObstacles;
    game.lastObstacleX     = origLastObs;
    game.isNewBest         = origNewBest;
    game.previousHighScore = origPrevHS;
    game.graceFrames       = origGraceFrames;
  });

  it('resetGame resets isNewBest to false and previousHighScore to 0', () => {
    game.isNewBest         = true;
    game.previousHighScore = 999;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.isNewBest,         false, 'isNewBest should be false after resetGame');
    assertEquals(game.previousHighScore, 0,     'previousHighScore should be 0 after resetGame');
  });

  // --- drawGameOverScreen ---

  it('drawGameOverScreen normal state renders THIS RUN label', () => {
    const origNewBest   = game.isNewBest;
    const origHS        = game.highScore;
    const origScore     = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest      = false;
    game.highScore      = 1050;
    game.score          = 847;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest      = origNewBest;
    game.highScore      = origHS;
    game.score          = origScore;
    Animations.deathAnimFrame = origAnimFrame;

    assert(calls.some(t => t === 'THIS RUN'),
      `Expected 'THIS RUN' in drawGameOverScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('drawGameOverScreen normal state renders gap delta value', () => {
    const origNewBest   = game.isNewBest;
    const origHS        = game.highScore;
    const origScore     = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest      = false;
    game.highScore      = 1050;
    game.score          = 847;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest      = origNewBest;
    game.highScore      = origHS;
    game.score          = origScore;
    Animations.deathAnimFrame = origAnimFrame;

    assert(calls.some(t => t.includes('203')),
      `Expected a call containing '203' (the gap delta), got: ${JSON.stringify(calls)}`);
  });

  it('drawGameOverScreen new record state renders NEW BEST header', () => {
    const origNewBest   = game.isNewBest;
    const origPrevHS    = game.previousHighScore;
    const origScore     = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest         = true;
    game.previousHighScore = 1050;
    game.score             = 1253;
    Animations.deathAnimFrame    = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest         = origNewBest;
    game.previousHighScore = origPrevHS;
    game.score             = origScore;
    Animations.deathAnimFrame    = origAnimFrame;

    assert(calls.some(t => t.includes('NEW BEST')),
      `Expected a call containing 'NEW BEST', got: ${JSON.stringify(calls)}`);
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

describe('Dino animation in WAITING state (polish pass)', () => {
  it('increments animFrame each frame during GET READY countdown', () => {
    resetGame();
    game.graceFrames = 2; // ensure graceFrames stays > 0 after one decrement
    const before = game.animFrame;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.animFrame, before + 1, 'animFrame should increment by 1 per WAITING frame');
    assertEquals(game.state, STATE.WAITING, 'state should remain WAITING when graceFrames > 0');
  });
});

describe('Hill colour interpolation (polish pass)', () => {
  it('returns HILL_COLOR_DAY below DAY_NIGHT_START', () => {
    assertEquals(getHillColor(0),   GAME_CONFIG.HILL_COLOR_DAY, 'score 0 → day colour');
    assertEquals(getHillColor(299), GAME_CONFIG.HILL_COLOR_DAY, 'score 299 → day colour');
  });

  it('returns HILL_COLOR_NIGHT at or above DAY_NIGHT_END', () => {
    assertEquals(getHillColor(400),  GAME_CONFIG.HILL_COLOR_NIGHT, 'score 400 → night colour');
    assertEquals(getHillColor(1000), GAME_CONFIG.HILL_COLOR_NIGHT, 'score 1000 → night colour');
  });

  it('returns a valid interpolated hex colour in the transition window', () => {
    const mid = getHillColor(350); // midpoint between 300 and 400
    assert(mid !== GAME_CONFIG.HILL_COLOR_DAY,   'midpoint should not be day colour');
    assert(mid !== GAME_CONFIG.HILL_COLOR_NIGHT,  'midpoint should not be night colour');
    assert(/^#[0-9a-f]{6}$/.test(mid),           'must be a valid lowercase 6-digit hex colour');
  });
});

describe('DifficultyProfile', () => {
  it('nextObstacle returns a numeric gap and a typed obstacle', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    assert(typeof params.gap === 'number', 'gap must be a number');
    assert(params.type && typeof params.type.id === 'string', 'type must have an id string');
  });

  it('nextObstacle classic mode: gap grows as speed rises', () => {
    const rng = () => 0.5;
    const low  = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 6);
    const high = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng, 13);
    assert(high.gap > low.gap, `gap at speed 13 (${high.gap}) should exceed speed 6 (${low.gap})`);
  });

  it('nextObstacle classic mode: type is always small cactus', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng, 10);
    assertEquals(params.type.id, 'small', 'classic mode always returns the small cactus');
  });

  it('nextObstacle updated mode: gap within official band at low speed', () => {
    const rng = mulberry32(42);
    const speed = 6;
    const params = DifficultyProfile.nextObstacle(0, MODES.UPDATED, rng, speed);
    const minGap = Math.round(params.type.width * speed + params.type.minGap * GAME_CONFIG.GAP_COEFFICIENT);
    const maxGap = Math.round(minGap * GAME_CONFIG.MAX_GAP_COEFFICIENT);
    assert(params.gap >= minGap && params.gap <= maxGap,
      `gap ${params.gap} must be in [${minGap}, ${maxGap}]`);
  });

  it('nextObstacle updated mode: cluster cactus returned at score 250 with max roll', () => {
    const rng = () => 0.99;  // type pick (call 1) → last eligible; gap roll (call 2) → top of band
    const params = DifficultyProfile.nextObstacle(250, MODES.UPDATED, rng, 8);
    assertEquals(params.type.id, 'cluster', 'at score 250 with max roll, cluster wins the weighted draw');
  });
});

describe('Idle screen', () => {
  it('drawIdleScreen does not throw', () => {
    let threw = false;
    try { drawIdleScreen(); } catch (e) { threw = true; }
    assert(!threw, 'drawIdleScreen should not throw');
  });

  it('drawIdleScreen renders REX RUN title', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(calls.some(t => t === 'REX RUN'),
      `Expected 'REX RUN' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('drawIdleScreen renders start prompt', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(calls.some(t => t === 'TAP / PRESS SPACE TO START'),
      `Expected 'TAP / PRESS SPACE TO START' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`);
  });

  it('handleAction in STATE.IDLE transitions to STATE.WAITING and sets graceFrames', () => {
    const origState       = game.state;
    const origGraceFrames = game.graceFrames;

    game.state = STATE.IDLE;
    handleAction();

    const newState = game.state;
    const newGrace = game.graceFrames;

    game.state       = origState;
    game.graceFrames = origGraceFrames;

    assertEquals(newState, STATE.WAITING,
      'handleAction in IDLE should transition to STATE.WAITING');
    assertEquals(newGrace, GAME_CONFIG.GRACE_FRAMES,
      'handleAction in IDLE should set graceFrames to GAME_CONFIG.GRACE_FRAMES');
  });
});

describe('Canvas scaling', () => {
  it('GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200', () => {
    assertEquals(GAME_CONFIG.CANVAS_W, 600,
      'GAME_CONFIG.CANVAS_W should be 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200,
      'GAME_CONFIG.CANVAS_H should be 200');
  });

  it('initCanvasScale sets bitmap width to cssW * dpr', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr        = window.devicePixelRatio;
    const origWidth      = canvas.width;
    const origHeight     = canvas.height;

    window.innerWidth       = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const bitmapW = canvas.width;
    const bitmapH = canvas.height;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;

    assertEquals(bitmapW, 780,
      'canvas.width should be Math.round(390 * 2) = 780');
    assertEquals(bitmapH, 260,
      'canvas.height should be Math.round(780 / 3) = 260');
  });

  it('initCanvasScale sets CSS display size', () => {
    const origInnerWidth  = window.innerWidth;
    const origDpr         = window.devicePixelRatio;
    const origWidth       = canvas.width;
    const origHeight      = canvas.height;
    const origStyleWidth  = canvas.style.width;
    const origStyleHeight = canvas.style.height;

    window.innerWidth       = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const styleW = canvas.style.width;
    const styleH = canvas.style.height;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;
    canvas.style.width      = origStyleWidth;
    canvas.style.height     = origStyleHeight;

    assertEquals(styleW, '390px',
      'canvas.style.width should be "390px"');
    assertEquals(styleH, '130px',
      'canvas.style.height should be "130px" (Math.round(390/3))');
  });
});

describe('Orientation resize', () => {
  it('handleResize does not throw in any game state', () => {
    const origState  = game.state;
    const origWidth  = canvas.width;
    const origHeight = canvas.height;

    [STATE.IDLE, STATE.WAITING, STATE.RUNNING, STATE.DEAD].forEach(state => {
      game.state = state;
      let threw = false;
      try { handleResize(); } catch (e) { threw = true; }
      assert(!threw, `handleResize should not throw in STATE.${state}`);
    });

    game.state    = origState;
    canvas.width  = origWidth;
    canvas.height = origHeight;
  });

  it('handleResize updates canvas.style.width when innerWidth changes', () => {
    const origInnerWidth  = window.innerWidth;
    const origDpr         = window.devicePixelRatio;
    const origWidth       = canvas.width;
    const origHeight      = canvas.height;
    const origStyleWidth  = canvas.style.width;
    const origStyleHeight = canvas.style.height;

    window.innerWidth       = 320;
    window.devicePixelRatio = 1;
    handleResize();

    const styleW = canvas.style.width;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;
    canvas.style.width      = origStyleWidth;
    canvas.style.height     = origStyleHeight;

    assertEquals(styleW, '320px',
      'canvas.style.width should be "320px" after resize to innerWidth 320');
  });

  it('handleResize updates canvas.width when innerWidth changes', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr        = window.devicePixelRatio;
    const origWidth      = canvas.width;
    const origHeight     = canvas.height;

    window.innerWidth       = 320;
    window.devicePixelRatio = 1;
    handleResize();

    const bitmapW = canvas.width;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;

    assertEquals(bitmapW, 320,
      'canvas.width should be Math.round(320 * 1) = 320 after resize');
  });
});

describe('Score count-up animation', () => {
  it('resetGame resets deathAnimFrame to 0', () => {
    const origState      = game.state;
    const origAnimFrame  = Animations.deathAnimFrame;

    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    resetGame();

    const resetFrame = Animations.deathAnimFrame;

    game.state          = origState;
    Animations.deathAnimFrame = origAnimFrame;

    assertEquals(resetFrame, 0,
      'resetGame should reset deathAnimFrame to 0');
  });

  it('handleAction in DEAD restarts game when animation is complete', () => {
    const origState      = game.state;
    const origAnimFrame  = Animations.deathAnimFrame;

    game.state          = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    handleAction();

    const newState = game.state;

    game.state          = origState;
    Animations.deathAnimFrame = origAnimFrame;

    assertEquals(newState, STATE.WAITING,
      'handleAction after animation completes should transition to STATE.WAITING (via resetGame)');
  });

  it('handleAction in DEAD snaps deathAnimFrame to DEATH_ANIM_FRAMES when animation is in progress', () => {
    const origState      = game.state;
    const origAnimFrame  = Animations.deathAnimFrame;
    const origScore      = game.score;

    game.state          = STATE.DEAD;
    Animations.deathAnimFrame = 10;
    game.score          = 500;

    handleAction();

    const snappedFrame = Animations.deathAnimFrame;

    game.state          = origState;
    Animations.deathAnimFrame = origAnimFrame;
    game.score          = origScore;

    assertEquals(snappedFrame, GAME_CONFIG.DEATH_ANIM_FRAMES,
      'handleAction during animation should snap deathAnimFrame to DEATH_ANIM_FRAMES');
  });

  it('drawGameOverScreen renders full score when deathAnimFrame equals DEATH_ANIM_FRAMES', () => {
    const origScore      = game.score;
    const origNewBest    = game.isNewBest;
    const origHS         = game.highScore;
    const origAnimFrame  = Animations.deathAnimFrame;

    game.score          = 500;
    game.isNewBest      = false;
    game.highScore      = 1000;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.score         = origScore;
    game.isNewBest     = origNewBest;
    game.highScore     = origHS;
    Animations.deathAnimFrame = origAnimFrame;

    assert(calls.some(t => t === '00500'),
      `Expected '00500' (full score at final frame), got: ${JSON.stringify(calls)}`);
  });

  it('drawGameOverScreen renders 00000 when deathAnimFrame is 0', () => {
    const origScore      = game.score;
    const origNewBest    = game.isNewBest;
    const origHS         = game.highScore;
    const origAnimFrame  = Animations.deathAnimFrame;

    game.score         = 500;
    game.isNewBest     = false;
    game.highScore     = 1000;
    Animations.deathAnimFrame = 0;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.score         = origScore;
    game.isNewBest     = origNewBest;
    game.highScore     = origHS;
    Animations.deathAnimFrame = origAnimFrame;

    assert(calls.some(t => t === '00000'),
      `Expected '00000' (score at frame 0), got: ${JSON.stringify(calls)}`);
  });
});

describe('Idle screen pulse animation', () => {
  it('drawIdleScreen renders prompt with different fillStyle alpha at different animFrames', () => {
    const origAnimFrame = game.animFrame;
    const promptStyles  = [];

    [0, 40].forEach(frame => {
      game.animFrame = frame;
      let capturedStyle;
      const origFillText = ctx.fillText;
      ctx.fillText = (text) => {
        if (text === 'TAP / PRESS SPACE TO START') capturedStyle = ctx.fillStyle;
      };
      drawIdleScreen();
      ctx.fillText = origFillText;
      promptStyles.push(capturedStyle);
    });

    game.animFrame = origAnimFrame;

    assert(promptStyles[0] !== promptStyles[1],
      `Expected prompt fillStyle to differ between frame 0 and frame 40, got: ${JSON.stringify(promptStyles)}`);
  });
});

describe('Tablet width cap removed', () => {
  it('initCanvasScale fills full innerWidth when wider than 600px', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr        = window.devicePixelRatio;
    const origWidth      = canvas.width;
    const origHeight     = canvas.height;

    window.innerWidth       = 900;
    window.devicePixelRatio = 1;
    initCanvasScale();

    const bitmapW = canvas.width;

    window.innerWidth       = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width            = origWidth;
    canvas.height           = origHeight;

    assertEquals(bitmapW, 900,
      'canvas.width should be 900 when innerWidth=900 and dpr=1 (no 600px cap)');
  });
});

describe('Share result', () => {
  it('shareDailyResult() returns a string containing the daily number and score', () => {
    const origDailyBest = game.dailyBest;
    game.dailyBest = 500;
    const text = shareDailyResult();
    assert(typeof text === 'string', 'shareDailyResult() should return a string');
    assert(text.includes('#' + dailyNumber()), 'Result should contain the daily number');
    assert(text.includes('500'), 'Result should contain the daily best score');
    game.dailyBest = origDailyBest;
  });

  it('shareDailyResult() does not throw when navigator is unavailable', () => {
    const origDailyBest = game.dailyBest;
    game.dailyBest = 0;
    let threw = false;
    try { shareDailyResult(); } catch (e) { threw = true; }
    assert(!threw, 'shareDailyResult() should not throw even with no clipboard');
    game.dailyBest = origDailyBest;
  });
});

describe('Daily mode RNG seeding', () => {
  it('resetGame() in daily mode seeds rng from dailySeed(), not Date.now()', () => {
    const origMode = game.mode;
    game.mode = MODES.DAILY;
    resetGame();
    // Pull first two values from the seeded RNG
    const v1a = game.rng();
    game.mode = MODES.DAILY;
    resetGame();
    const v1b = game.rng();
    assertEquals(v1a, v1b, 'First RNG value should be identical across two daily resets');
    game.mode = origMode;
    resetGame();
  });

  it('two resets in daily mode produce the same obstacle type sequence', () => {
    const origMode = game.mode;
    game.mode = MODES.DAILY;
    resetGame();
    const type1 = DifficultyProfile.nextObstacle(300, MODES.DAILY, game.rng, 8).type;
    game.mode = MODES.DAILY;
    resetGame();
    const type2 = DifficultyProfile.nextObstacle(300, MODES.DAILY, game.rng, 8).type;
    assertEquals(type1.id, type2.id, 'Same seed should produce same obstacle type');
    game.mode = origMode;
    resetGame();
  });
});

describe('Daily seed', () => {
  it('dailySeed() returns an 8-digit YYYYMMDD integer', () => {
    const seed = dailySeed();
    assert(Number.isInteger(seed), `Expected integer, got ${seed}`);
    assert(seed >= 20000101 && seed <= 29991231, `Expected YYYYMMDD range, got ${seed}`);
  });

  it('dailySeed() returns the same value on consecutive calls', () => {
    assertEquals(dailySeed(), dailySeed(), 'dailySeed() should be stable within a tick');
  });
});

describe('Daily number', () => {
  it('dailyNumber() returns a positive integer', () => {
    const n = dailyNumber();
    assert(Number.isInteger(n) && n > 0, `Expected positive integer, got ${n}`);
  });

  it('dailyNumber() is >= 62 (project is past day 62 after 2026-05-01)', () => {
    assert(dailyNumber() >= 62, `Expected >= 62, got ${dailyNumber()}`);
  });
});

describe('Daily best persistence', () => {
  it('ScoreStore.loadDailyBest() returns 0 when stored date does not match today', () => {
    const origDate = localStorage.getItem('dino-daily-date');
    const origBest = localStorage.getItem('dino-daily-best');
    localStorage.setItem('dino-daily-date', '19990101');
    localStorage.setItem('dino-daily-best', '999');
    assertEquals(ScoreStore.loadDailyBest(), 0, 'Should return 0 on stale date');
    origDate !== null ? localStorage.setItem('dino-daily-date', origDate) : localStorage.removeItem('dino-daily-date');
    origBest !== null ? localStorage.setItem('dino-daily-best', origBest) : localStorage.removeItem('dino-daily-best');
  });

  it('ScoreStore.loadDailyBest() returns stored value when date matches today', () => {
    const origDate = localStorage.getItem('dino-daily-date');
    const origBest = localStorage.getItem('dino-daily-best');
    localStorage.setItem('dino-daily-date', String(dailySeed()));
    localStorage.setItem('dino-daily-best', '847');
    assertEquals(ScoreStore.loadDailyBest(), 847, 'Should return 847 when date matches');
    origDate !== null ? localStorage.setItem('dino-daily-date', origDate) : localStorage.removeItem('dino-daily-date');
    origBest !== null ? localStorage.setItem('dino-daily-best', origBest) : localStorage.removeItem('dino-daily-best');
  });

  it('ScoreStore.saveDailyBest() persists score; lower score does not overwrite', () => {
    const origDate = localStorage.getItem('dino-daily-date');
    const origBest = localStorage.getItem('dino-daily-best');
    localStorage.removeItem('dino-daily-date');
    localStorage.removeItem('dino-daily-best');

    ScoreStore.saveDailyBest(500);
    assertEquals(ScoreStore.loadDailyBest(), 500, 'loadDailyBest() should return 500 after save');

    ScoreStore.saveDailyBest(200);
    assertEquals(ScoreStore.loadDailyBest(), 500, 'Lower score must not overwrite stored best');

    origDate !== null ? localStorage.setItem('dino-daily-date', origDate) : localStorage.removeItem('dino-daily-date');
    origBest !== null ? localStorage.setItem('dino-daily-best', origBest) : localStorage.removeItem('dino-daily-best');
  });
});

describe('Fixed-timestep loop', () => {
  const MS = 1000 / 60;

  // Drive the loop with explicit timestamps and report how many physics
  // steps (game.animFrame ticks) ran over the timeline.
  function runTimeline(frameCount, deltaPerFrame) {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    game.rng = mulberry32(2024);      // pin RNG so both timelines spawn identically
    const startAnim = game.animFrame;
    let t = 1000;
    gameLoop(t);                       // baseline frame — establishes lastTime, runs 0 steps
    cancelAnimationFrame(game.animationFrameId);
    for (let i = 0; i < frameCount; i++) {
      t += deltaPerFrame;
      gameLoop(t);
      cancelAnimationFrame(game.animationFrameId);
    }
    return game.animFrame - startAnim;
  }

  it('runs the same number of physics steps per wall-clock second regardless of refresh rate', () => {
    const steps60  = runTimeline(60,  MS);        // 60 frames * 16.67ms ≈ 1000ms
    const steps144 = runTimeline(144, MS / 2.4);  // 144 frames * 6.94ms ≈ 1000ms
    assert(steps60 >= 58 && steps60 <= 62,   `60Hz: expected ~60 steps, got ${steps60}`);
    assert(steps144 >= 58 && steps144 <= 62, `144Hz: expected ~60 steps (not ~144), got ${steps144}`);
    assert(Math.abs(steps60 - steps144) <= 2, `step counts must match across refresh rates: 60Hz=${steps60}, 144Hz=${steps144}`);
  });

  it('clamps catch-up to MAX_CATCHUP_STEPS on sustained slow frames', () => {
    resetGame(); game.graceFrames = 0; game.state = STATE.RUNNING; game.rng = mulberry32(1);
    const start = game.animFrame;
    let t = 1000; gameLoop(t); cancelAnimationFrame(game.animationFrameId);   // baseline
    t += 100;     gameLoop(t); cancelAnimationFrame(game.animationFrameId);   // 100ms → 6 wanted, clamp 5
    assert(game.animFrame - start <= MAX_CATCHUP_STEPS, `catch-up must clamp to ${MAX_CATCHUP_STEPS} steps, got ${game.animFrame - start}`);
  });

  it('treats a backgrounded-tab gap as a single step', () => {
    resetGame(); game.graceFrames = 0; game.state = STATE.RUNNING; game.rng = mulberry32(1);
    const start = game.animFrame;
    let t = 1000; gameLoop(t);  cancelAnimationFrame(game.animationFrameId);  // baseline
    t += 5000;    gameLoop(t);  cancelAnimationFrame(game.animationFrameId);  // 5s gap → frame>250 → 1 step
    assertEquals(game.animFrame - start, 1, 'a >250ms frame should advance exactly one step');
  });

  it('ignores a bogus (NaN) timestamp without freezing the clock', () => {
    resetGame(); game.graceFrames = 0; game.state = STATE.RUNNING; game.rng = mulberry32(1);
    const start = game.animFrame;
    let t = 1000; gameLoop(t); cancelAnimationFrame(game.animationFrameId);   // baseline
    gameLoop(NaN);            cancelAnimationFrame(game.animationFrameId);     // bogus — must be ignored
    for (let i = 0; i < 4; i++) { t += 1000 / 60; gameLoop(t); cancelAnimationFrame(game.animationFrameId); }
    assert(game.animFrame - start >= 3, `clock must keep stepping after a NaN timestamp, got ${game.animFrame - start} steps`);
  });
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load', () => setTimeout(printSummary, 500));
} else {
  setTimeout(printSummary, 500);
}
