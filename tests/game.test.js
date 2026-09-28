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

  it('should have a peak jump height of ~144px', () => {
    // jumpPower=-12, gravity=0.48 → peak ≈ 144px
    resetGame();
    game.state = STATE.RUNNING;
    const expectedPeak = 144;
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
});

describe('Obstacle Gap Enforcement', () => {
  it('should not spawn a second obstacle until the dynamic gap threshold is met', () => {
    resetGame();
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    // Pin the RNG to the middle of the jitter range so nextSpawnGap is deterministic.
    game.rng = () => 0.5;
    game.nextSpawnGap = 600; // base gap at INITIAL_SPEED, zero jitter — triggers first spawn

    // Frame 1: lastObstacleX=-300 ≤ GAME_CONFIG.CANVAS_W-600 → first spawn
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, 'Should have 1 obstacle after first gameLoop frame');

    // After spawn, nextSpawnGap was recomputed via DifficultyProfile.nextObstacle(score=0).
    // At rng=0.5 jitter is zero, so gap = round(MAX_SPAWN_GAP - (speed - INITIAL_SPEED) * FACTOR).
    const expectedGap = Math.round(
      GAME_CONFIG.MAX_SPAWN_GAP -
      (DifficultyProfile.speedAtScore(0) - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
    );
    assertEquals(game.nextSpawnGap, expectedGap, `Next gap should be ${expectedGap} at speedAtScore(0) with zero jitter`);

    // Frame 2: obstacle hasn't drifted far enough yet — not a spawn frame.
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 1, `Should still be 1 obstacle — ${expectedGap}px gap not met`);

    // Force obstacle just past the threshold
    game.obstacles[0].x = GAME_CONFIG.CANVAS_W - (game.nextSpawnGap + 1);
    game.lastObstacleX = game.obstacles[0].x;

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.obstacles.length, 2, 'Should now be 2 obstacles — gap threshold met');
  });
});

describe('Spawn Gap Jitter', () => {
  it('nextObstacle gap stays within [MIN_SPAWN_GAP, baseGap * (1 + JITTER)]', () => {
    // Late-game Updated gaps are speed-scaled; see 'Late-game spawn gap'.
    const scores = [0, 200];
    scores.forEach(score => {
      const speed = DifficultyProfile.speedAtScore(score);
      const baseGap = Math.max(
        GAME_CONFIG.MIN_SPAWN_GAP,
        GAME_CONFIG.MAX_SPAWN_GAP - (speed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
      );
      const upperBound = Math.round(baseGap * (1 + GAME_CONFIG.SPAWN_GAP_JITTER));
      const rng = mulberry32(12345);
      for (let i = 0; i < 500; i++) {
        const { gap } = DifficultyProfile.nextObstacle(score, MODES.UPDATED, rng);
        assert(
          gap >= GAME_CONFIG.MIN_SPAWN_GAP && gap <= upperBound,
          `At score ${score}, gap ${gap} should be in [${GAME_CONFIG.MIN_SPAWN_GAP}, ${upperBound}]`
        );
      }
    });
  });

  it('produces different gaps across spawns (breaks the metronome)', () => {
    const rng = mulberry32(7);
    const gaps = new Set();
    for (let i = 0; i < 50; i++) gaps.add(DifficultyProfile.nextObstacle(100, MODES.UPDATED, rng).gap);
    assert(gaps.size >= 5, `Expected gap variety; got ${gaps.size} distinct values across 50 draws`);
  });

  it('smallest achievable gap is still at least MIN_SPAWN_GAP (always clearable)', () => {
    // Force rng to 0 → maximum negative jitter on the gap roll.
    const worstCaseRng = () => 0;
    const { gap } = DifficultyProfile.nextObstacle(500, MODES.UPDATED, worstCaseRng);
    assert(gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `At max negative jitter + near-plateau speed, gap ${gap} must be >= MIN_SPAWN_GAP ${GAME_CONFIG.MIN_SPAWN_GAP}`);
  });

  it('mulberry32 is deterministic given same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) assertEquals(a(), b(), 'Same seed should produce same sequence');
  });
});

describe('Late-game spawn gap (Updated/Daily)', () => {
  // Full jump, takeoff to landing, using the same integration order as the game loop.
  function jumpAirtimeFrames() {
    const ground = GAME_CONFIG.CANVAS_H - GAME_CONFIG.DINO_HEIGHT;
    let y = ground;
    let v = GAME_CONFIG.JUMP_POWER;
    let frames = 0;
    while (frames < 500) {
      v += GAME_CONFIG.GRAVITY;
      y += v;
      frames++;
      if (frames > 1 && y >= ground) return frames;
    }
    throw new Error('jump did not land');
  }

  // Constant 0.5 zeroes gap jitter. Updated/Daily consume an earlier roll for type.
  function zeroJitterGap(score, mode) {
    return DifficultyProfile.nextObstacle(score, mode, () => 0.5).gap;
  }

  // Constant 0 is maximum negative jitter (-SPAWN_GAP_JITTER).
  function worstGap(score, mode) {
    return DifficultyProfile.nextObstacle(score, mode, () => 0).gap;
  }

  function focusedJumpFrames(score) {
    const speed = DifficultyProfile.speedAtScore(score);
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
    // One jump, plus the frames a cluster occupies at this speed, plus a short read.
    return jumpAirtimeFrames() + cluster.width / speed + 12;
  }

  it('updated zero-jitter gap grows with speed from 450 to 640', () => {
    const g450 = zeroJitterGap(450, MODES.UPDATED);
    const g640 = zeroJitterGap(640, MODES.UPDATED);
    assert(g640 > g450,
      `Gap at 640 (${g640}) should exceed gap at 450 (${g450}) so time-between holds as speed rises`);
  });

  it('updated zero-jitter time between obstacles holds from 450 through 640', () => {
    const timeAt = (score) => zeroJitterGap(score, MODES.UPDATED) / DifficultyProfile.speedAtScore(score);
    const t450 = timeAt(450);
    const t640 = timeAt(640);
    const ratio = t640 / t450;
    assert(ratio > 0.95 && ratio < 1.05,
      `Time-between should stay level as speed rises; 450=${t450.toFixed(1)}f 640=${t640.toFixed(1)}f ratio=${ratio.toFixed(3)}`);
  });

  it('updated worst-case gap stays above one focused jump from 300 through 640', () => {
    for (const score of [300, 450, 640]) {
      const speed = DifficultyProfile.speedAtScore(score);
      const frames = worstGap(score, MODES.UPDATED) / speed;
      const minFrames = focusedJumpFrames(score);
      assert(frames >= minFrames,
        `Score ${score}: worst gap ${frames.toFixed(1)}f should be >= ${minFrames.toFixed(1)}f`);
      assert(frames + 1e-6 >= GAME_CONFIG.UPDATED_MIN_GAP_FRAMES,
        `Score ${score}: worst gap ${frames.toFixed(1)}f should hold UPDATED_MIN_GAP_FRAMES (${GAME_CONFIG.UPDATED_MIN_GAP_FRAMES})`);
    }
  });

  // Steps the running spawn path: move sprites, then spawn when the anchor
  // has traveled nextSpawnGap. Mirrors handleRunning's obstacle block.
  function framesUntilNextSpawn(maxFrames) {
    for (let frame = 1; frame <= maxFrames; frame++) {
      updateObstacles();
      if (game.lastObstacleX <= GAME_CONFIG.CANVAS_W - game.nextSpawnGap) return frame;
    }
    return null;
  }

  it('a gap wider than the screen still spawns the next obstacle', () => {
    const speed = DifficultyProfile.speedAtScore(640);
    const wide = DifficultyProfile.nextObstacle(640, MODES.UPDATED, () => 1).gap;
    assert(wide > 900,
      `Max jitter at score 640 (${wide}) should pass the old 900px spawn sentinel`);

    const orig = {
      mode: game.mode,
      state: game.state,
      speed: game.currentSpeed,
      obstacles: game.obstacles,
      lastObstacleX: game.lastObstacleX,
      nextSpawnGap: game.nextSpawnGap,
    };
    game.mode = MODES.UPDATED;
    game.state = STATE.RUNNING;
    game.currentSpeed = speed;
    game.obstacles = [];
    spawnObstacle(GAME_CONFIG.OBSTACLE_TYPES[0]);
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = wide;

    const frame = framesUntilNextSpawn(400);
    const expected = wide / speed;
    assert(frame !== null, `A ${wide}px gap must still produce another obstacle after the sprite leaves`);
    assert(Math.abs(frame - expected) <= 2,
      `Spawn landed on frame ${frame}; a ${wide}px gap at speed ${speed.toFixed(2)} should take about ${expected.toFixed(1)} frames, not the screen-exit clip`);

    game.mode = orig.mode;
    game.state = orig.state;
    game.currentSpeed = orig.speed;
    game.obstacles = orig.obstacles;
    game.lastObstacleX = orig.lastObstacleX;
    game.nextSpawnGap = orig.nextSpawnGap;
  });

  it('updated gap at score 300 and 450 is wider than the classic shrinking gap', () => {
    for (const score of [300, 450]) {
      const updated = zeroJitterGap(score, MODES.UPDATED);
      const classic = zeroJitterGap(score, MODES.CLASSIC);
      assert(updated > classic,
        `Score ${score}: updated gap ${updated} should be wider than classic ${classic}`);
    }
  });

  it('early updated gaps match classic so the opening is not opened up', () => {
    for (const score of [0, 150, 200]) {
      assertEquals(
        zeroJitterGap(score, MODES.UPDATED),
        zeroJitterGap(score, MODES.CLASSIC),
        `Score ${score}: early updated gap should match classic`
      );
    }
  });

  it('classic high-score gap still follows the shrinking curve', () => {
    const speed = DifficultyProfile.speedAtScore(450);
    const expected = Math.max(
      GAME_CONFIG.MIN_SPAWN_GAP,
      Math.round(
        GAME_CONFIG.MAX_SPAWN_GAP -
        (speed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
      )
    );
    const classic = DifficultyProfile.nextObstacle(450, MODES.CLASSIC, () => 0).gap;
    assertEquals(classic, expected, 'Classic gap must keep the shrinking curve');
    assert(
      zeroJitterGap(640, MODES.CLASSIC) < zeroJitterGap(450, MODES.CLASSIC),
      'Classic gap should still shrink as score rises'
    );
  });

  it('daily gaps match updated at the same score and rng', () => {
    for (const score of [0, 300, 450, 640]) {
      assertEquals(
        zeroJitterGap(score, MODES.DAILY),
        zeroJitterGap(score, MODES.UPDATED),
        `Daily zero-jitter gap should match updated at score ${score}`
      );
      assertEquals(
        worstGap(score, MODES.DAILY),
        worstGap(score, MODES.UPDATED),
        `Daily worst-case gap should match updated at score ${score}`
      );
    }
  });

  it('same seed replays the same updated gap sequence', () => {
    const seq = (seed) => {
      const rng = mulberry32(seed);
      const gaps = [];
      for (let i = 0; i < 20; i++) gaps.push(DifficultyProfile.nextObstacle(450, MODES.UPDATED, rng).gap);
      return gaps.join(',');
    };
    assertEquals(seq(20260927), seq(20260927), 'Same seed must replay the same gaps');
    assert(seq(1) !== seq(2), 'Different seeds should not collapse to one gap');
  });

  it('updated gaps are whole pixels, including the speed-scaled floor', () => {
    for (const score of [0, 300, 400, 450, 640]) {
      const gap = worstGap(score, MODES.UPDATED);
      assertEquals(gap, Math.round(gap), `Worst gap at score ${score} should be an integer, got ${gap}`);
      assertEquals(
        zeroJitterGap(score, MODES.UPDATED),
        Math.round(zeroJitterGap(score, MODES.UPDATED)),
        `Zero-jitter gap at score ${score} should be an integer`
      );
    }
  });

  it('updated jitter at score 450 does not pile up on MIN_SPAWN_GAP', () => {
    const rng = mulberry32(99);
    const gaps = [];
    for (let i = 0; i < 400; i++) gaps.push(DifficultyProfile.nextObstacle(450, MODES.UPDATED, rng).gap);
    const slammed = gaps.filter(g => g <= GAME_CONFIG.MIN_SPAWN_GAP + 1).length / gaps.length;
    assert(slammed < 0.05,
      `Only ${(slammed * 100).toFixed(1)}% of gaps should sit on MIN_SPAWN_GAP; got a floor pile-up`);
    gaps.sort((a, b) => a - b);
    const tightest = gaps[0];
    const median = gaps[Math.floor(gaps.length / 2)];
    assert(median >= tightest * 1.1,
      `Median gap ${median} should sit above the tightest gap ${tightest}`);
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
    Particles.reset();
    game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05; // next gameLoop tick crosses
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
    game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05;
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
    assertEquals(Animations.scorePopFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
      'score pop counter matches the quieter shake');
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
        const { type } = DifficultyProfile.nextObstacle(score, MODES.CLASSIC, rng);
        assertEquals(type.id, 'small', `Classic@${score}: expected small, got ${type.id}`);
      }
    }
  });

  it('classic mode returns deterministic gap (no jitter)', () => {
    const rng = () => 0; // worst-case jitter input — should have no effect in classic
    const a = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng).gap;
    const b = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng).gap;
    assertEquals(a, b, 'Classic gap should not vary');
    assert(a >= GAME_CONFIG.MIN_SPAWN_GAP && a <= GAME_CONFIG.MAX_SPAWN_GAP,
      `Classic gap at score 0 (${a}) should be within [MIN_SPAWN_GAP, MAX_SPAWN_GAP]`);
  });

  it('updated mode still produces variety', () => {
    const rng = mulberry32(11);
    const gaps = new Set();
    for (let i = 0; i < 30; i++) gaps.add(DifficultyProfile.nextObstacle(200, MODES.UPDATED, rng).gap);
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
      const { type } = DifficultyProfile.nextObstacle(50, MODES.UPDATED, rng);
      assertEquals(type.id, 'small', `At score 50 expected small, got ${type.id}`);
    }
  });

  it('can return big cactus at score 100+ but never cluster before 250', () => {
    const rng = mulberry32(2);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(DifficultyProfile.nextObstacle(150, MODES.UPDATED, rng).type.id);
    assert(seen.has('small') && seen.has('big'), `Expected small+big at score 150, saw ${[...seen]}`);
    assert(!seen.has('cluster'), `Cluster should not appear before score 250, saw ${[...seen]}`);
  });

  it('can return all three types at score 250+', () => {
    const rng = mulberry32(3);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng).type.id);
    assert(seen.has('small') && seen.has('big') && seen.has('cluster'),
      `Expected all 3 types at score 300, saw ${[...seen]}`);
  });

  it('weighted distribution at score 300 is within 5% of declared weights', () => {
    const rng = mulberry32(4);
    const counts = { small: 0, big: 0, cluster: 0 };
    const total = 20000;
    for (let i = 0; i < total; i++) counts[DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng).type.id]++;
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

  it('spawnObstacle() with no arg stays small in classic even after cluster unlocks', () => {
    const origMode = game.mode;
    game.mode = MODES.CLASSIC;
    resetGame();
    game.score = 500; // cluster is eligible once mode is ignored
    game.rng = () => 0.99; // last eligible type in updated mode is cluster
    game.obstacles.length = 0;
    spawnObstacle();
    assertEquals(game.obstacles[0].type, 'small',
      'Classic bare spawnObstacle() must not roll cluster');
    game.mode = origMode;
    resetGame();
  });

  it('cluster draws two full small sprites with a visible gap', () => {
    resetGame();
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'small');
    // Draw-only change: hitbox, unlock, and weight stay on GAME_CONFIG.
    assertEquals(cluster.width, 50, 'cluster hitbox width stays 50');
    assertEquals(cluster.height, 40, 'cluster hitbox height stays 40');
    assertEquals(cluster.unlockScore, 250, 'cluster still unlocks at 250');
    assertEquals(cluster.weight, 20, 'cluster weight stays 20');

    game.obstacles = [{
      x: 100, y: 160, width: cluster.width, height: cluster.height,
      render: cluster.render, type: cluster.id,
    }];

    const placed = game.obstacles[0];
    const calls = [];
    const origDrawImage = ctx.drawImage;
    ctx.drawImage = (...args) => calls.push(args);
    drawObstacles();
    ctx.drawImage = origDrawImage;
    game.obstacles = [];
    assertEquals(placed.width, cluster.width, 'Drawing does not resize the hitbox');

    assertEquals(calls.length, 2, 'Cluster must paint two sprites, not one stretched cactus');
    const [first, second] = calls;
    assertEquals(first[3], small.width, 'First sprite must be the full small-cactus width');
    assertEquals(second[3], small.width, 'Second sprite must be the full small-cactus width');
    assertEquals(first[4], small.height, 'First sprite must be the full small-cactus height');
    assertEquals(second[4], small.height, 'Second sprite must be the full small-cactus height');
    assertEquals(first[2], 160, 'Sprites stay on the ground line of the cluster hitbox');
    assertEquals(second[2], 160, 'Both sprites share the same ground line');

    // The cactus art's arms run to the cell edge. The leftover inside a 50px
    // hitbox is only ~10px, which still reads as one bar at the speed a first
    // cluster appears (~score 250). One small cactus of sky splits that bar.
    const gap = second[1] - (first[1] + first[3]);
    assertEquals(gap, small.width,
      'Sky between the two cacti is one small cactus wide');
    assert(gap < GAME_CONFIG.DINO_WIDTH,
      'The gap stays narrower than the dino, so it is not a lane to thread');

    const hitLeft = 100;
    const hitRight = 100 + cluster.width;
    const overhangLeft = hitLeft - first[1];
    const overhangRight = (second[1] + second[3]) - hitRight;
    assert(overhangLeft > 0 && overhangRight > 0,
      'The pair is wider than the hitbox so the gap can open without shrinking either sprite');
    assertEquals(overhangLeft, overhangRight,
      'The pair overhangs the hitbox equally on both sides');
    assert(first[1] + first[3] >= hitLeft && second[1] <= hitRight,
      'The sky between the cacti sits inside the hitbox, so it is not a sneak-through');
  });

  it('a single cactus still draws once at its own size', () => {
    const small = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'small');
    game.obstacles = [{
      x: 40, y: 160, width: small.width, height: small.height,
      render: small.render, type: small.id,
    }];
    const calls = [];
    const origDrawImage = ctx.drawImage;
    ctx.drawImage = (...args) => calls.push(args);
    drawObstacles();
    ctx.drawImage = origDrawImage;
    game.obstacles = [];

    assertEquals(calls.length, 1, 'Small cactus is one sprite');
    assertEquals(calls[0][3], small.width, 'Small cactus keeps its own width');
    assertEquals(calls[0][4], small.height, 'Small cactus keeps its own height');
  });

  it('big cactus paints a crisp tall sprite and leaves the hitbox alone', () => {
    const big = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'big');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'small');
    // Draw-only change: hitbox, unlock, and weight stay on GAME_CONFIG.
    assertEquals(big.width, 30, 'big hitbox width stays 30');
    assertEquals(big.height, 55, 'big hitbox height stays 55');
    assertEquals(big.unlockScore, 100, 'big cactus still unlocks at 100');
    assertEquals(big.weight, 30, 'big cactus weight stays 30');
    assertEquals(big.render, 'single', 'big cactus stays a single sprite');

    // cactus.png is 34×70. Height stays on the hitbox so the jump line
    // matches. Width follows that cell, so the first tall cactus is not a
    // wide stretch of the small sprite into the 30×55 box.
    const paintH = big.height;
    const paintW = Math.round(paintH * 34 / 70);
    const paintX = 80 + Math.floor((big.width - paintW) / 2);

    game.obstacles = [
      {
        x: 80, y: 120, width: big.width, height: big.height,
        render: big.render, type: big.id,
      },
      {
        x: 200, y: 140, width: small.width, height: small.height,
        render: small.render, type: small.id,
      },
    ];
    const calls = [];
    const smoothing = [];
    const origDrawImage = ctx.drawImage;
    const origSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage = (...args) => {
      calls.push(args.slice());
      smoothing.push(ctx.imageSmoothingEnabled);
    };
    drawObstacles();
    const smoothingAfter = ctx.imageSmoothingEnabled;
    ctx.drawImage = origDrawImage;
    if (origSmoothing === undefined) delete ctx.imageSmoothingEnabled;
    else ctx.imageSmoothingEnabled = origSmoothing;
    const placed = game.obstacles[0];
    game.obstacles = [];

    assertEquals(placed.width, 30, 'Drawing does not resize the hitbox width');
    assertEquals(placed.height, 55, 'Drawing does not resize the hitbox height');
    assertEquals(calls.length, 2, 'Big and small each paint once');
    assertEquals(smoothing[0], false, 'The tall cactus uses nearest-neighbor so the arms stay sharp');
    assertEquals(calls[0][1], paintX, 'The tall cactus is centered on its hitbox');
    assertEquals(calls[0][2], 120, 'The tall cactus top stays on the hitbox top');
    assertEquals(calls[0][3], paintW, 'Paint width follows the cactus sprite, not the wider hitbox');
    assertEquals(calls[0][4], paintH, 'Paint height matches the hitbox so the jump line stays honest');
    assert(paintW < big.width, 'The tall cactus is not stretched out to the hitbox width');
    assert(paintH > small.height, 'The tall cactus is visibly taller than the small one');
    assertEquals(smoothing[1], true, 'A nearby small cactus keeps the normal smooth scale');
    assertEquals(calls[1][3], small.width, 'Small cactus width is unchanged');
    assertEquals(calls[1][4], small.height, 'Small cactus height is unchanged');
    assertEquals(smoothingAfter, true, 'Nearest-neighbor must not leak onto the next sprite');
  });
});

describe('Difficulty Curve', () => {
  it('currentSpeed approaches PLATEAU_SPEED at high score and never exceeds it', () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;

    game.score = 2000;
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assert(game.currentSpeed <= GAME_CONFIG.PLATEAU_SPEED,
      `currentSpeed at score 2000 (${game.currentSpeed}) must not exceed PLATEAU_SPEED (${GAME_CONFIG.PLATEAU_SPEED})`);
    assert(game.currentSpeed > GAME_CONFIG.PLATEAU_SPEED - 0.1,
      `currentSpeed at score 2000 (${game.currentSpeed}) should be very close to PLATEAU_SPEED — sigmoid has converged`);
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

  function runRunningFrames(n) {
    for (let i = 0; i < n; i++) {
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
    }
  }

  // A night run that has not yet spawned, so the fade window cannot die to a cactus.
  function enterNightRun() {
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.score = GAME_CONFIG.DAY_NIGHT_END;
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
  }

  function starPaintAlphas() {
    const alphas = [];
    const orig = ctx.fillRect;
    ctx.fillRect = function (x, y, w, h) {
      if (w === GAME_CONFIG.STAR_SIZE && h === GAME_CONFIG.STAR_SIZE) alphas.push(ctx.globalAlpha);
      return orig.call(this, x, y, w, h);
    };
    try {
      drawBackground();
    } finally {
      ctx.fillRect = orig;
    }
    return alphas;
  }

  it('does not start the star fade before night is full', () => {
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    runRunningFrames(1);
    assert(game.score < GAME_CONFIG.DAY_NIGHT_END, 'one frame from 399 must still be day-side of night');
    assert(!game.starsInitialised, 'stars wait until night is full');
    assertEquals(game.starFadeFrames, 0, 'the fade clock stays at 0 before night');
    assertEquals(starPaintAlphas().length, 0, 'no star pixels before night');
  });

  it('fades Updated stars in over the shorter beat, then holds the quiet peak', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      enterNightRun();
      const total = GAME_CONFIG.UPDATED_STAR_FADE_FRAMES;
      const half = total / 2;
      const peak = GAME_CONFIG.NIGHT_STAR_ALPHA;
      assertEquals(total, 24, 'Updated night settles in about 0.4 s');
      assert(total < GAME_CONFIG.STAR_FADE_FRAMES, 'the brightening ramp is shorter than Classic');
      runRunningFrames(1);
      assertEquals(game.state, STATE.RUNNING, 'the fade window should still be a live run');
      assert(game.starsInitialised, 'night initialises the star field');
      assertEquals(game.stars.length, GAME_CONFIG.STAR_COUNT, 'the field is the usual 12 stars');
      assertEquals(game.starFadeFrames, 1, 'the first night frame is the first fade step');
      assert(
        Math.abs(starFadeAlpha() - 1 / total) < 1e-9,
        `first-frame ramp should be 1/${total}, got ${starFadeAlpha()}`
      );
      let alphas = starPaintAlphas();
      assertEquals(alphas.length, GAME_CONFIG.STAR_COUNT, 'every star paints during the fade');
      assert(
        alphas.every((a) => Math.abs(a - peak / total) < 1e-9),
        'every star shares the quiet fade alpha'
      );
      assertEquals(ctx.globalAlpha, 1, 'the fade must not leave the obstacle lane dimmed');

      runRunningFrames(half - 1);
      assertEquals(game.starFadeFrames, half, 'the fade advances one step per running frame');
      assert(
        Math.abs(starFadeAlpha() - 0.5) < 1e-9,
        `halfway through the beat the ramp should be half, got ${starFadeAlpha()}`
      );

      runRunningFrames(total - game.starFadeFrames);
      assertEquals(game.starFadeFrames, total, 'the fade reaches the configured length');
      assertEquals(starFadeAlpha(), 1, 'the fade ramp finishes');
      alphas = starPaintAlphas();
      assert(
        alphas.every((a) => Math.abs(a - peak) < 1e-9),
        'full night holds the quiet Updated peak'
      );

      const positions = game.stars.map((s) => s.x + ',' + s.y).join('|');
      runRunningFrames(3);
      assertEquals(game.starFadeFrames, total, 'the fade holds at full instead of restarting');
      assertEquals(game.stars.length, GAME_CONFIG.STAR_COUNT, 'stars are not re-seeded after the fade');
      assertEquals(
        game.stars.map((s) => s.x + ',' + s.y).join('|'),
        positions,
        'star positions stay put while they fade'
      );
      assertEquals(game.state, STATE.RUNNING, 'a short night fade must not itself end the run');
    } finally {
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still fades stars in Classic — night sky stays, only the pop is softened', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.CLASSIC;
      enterNightRun();
      runRunningFrames(1);
      assertEquals(
        getBackgroundColor(GAME_CONFIG.DAY_NIGHT_END),
        '#1a1a2e',
        'Classic keeps the full night sky'
      );
      assert(game.starsInitialised, 'Classic keeps the night stars');
      assertEquals(game.stars.length, GAME_CONFIG.STAR_COUNT);
      assertEquals(game.starFadeFrames, 1, 'Classic still starts the fade on the first night frame');
      assert(
        Math.abs(starFadeAlpha() - 1 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'Classic still steps through the original 48-frame fade'
      );
      runRunningFrames(GAME_CONFIG.UPDATED_STAR_FADE_FRAMES - 1);
      assertEquals(game.starFadeFrames, GAME_CONFIG.UPDATED_STAR_FADE_FRAMES,
        'Classic keeps counting after Updated would have settled');
      assert(
        Math.abs(starFadeAlpha() - GAME_CONFIG.UPDATED_STAR_FADE_FRAMES / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'when Updated has settled, Classic is only halfway to full white'
      );
      assert(starPaintAlpha() < 1, 'Classic has not reached full white on the shorter clock');
    } finally {
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion still skips star init when night arrives', () => {
    try {
      setReducedMotion(true);
      enterNightRun();
      runRunningFrames(GAME_CONFIG.STAR_FADE_FRAMES);
      assert(!game.starsInitialised, 'reduced motion does not initialise stars');
      assertEquals(game.stars.length, 0, 'reduced motion leaves the star list empty');
      assertEquals(game.starFadeFrames, 0, 'reduced motion does not run the fade clock');
      assertEquals(starPaintAlphas().length, 0, 'reduced motion does not paint stars');
      assertEquals(
        getBackgroundColor(game.score),
        '#1a1a2e',
        'reduced motion still snaps to the night sky at DAY_NIGHT_END'
      );
    } finally {
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame clears the star field and the fade', () => {
    enterNightRun();
    runRunningFrames(2);
    assert(game.starFadeFrames > 0, 'precondition: the fade has started');
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    assert(!game.starsInitialised, 'reset clears starsInitialised');
    assertEquals(game.stars.length, 0, 'reset clears the star list');
    assertEquals(game.starFadeFrames, 0, 'reset clears the fade clock');
    assertEquals(starFadeAlpha(), 0, 'a fresh run does not inherit night opacity');
  });
});

describe('Soft night stars', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function runRunningFrames(n) {
    for (let i = 0; i < n; i++) {
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
    }
  }

  function enterNightRun() {
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.score = GAME_CONFIG.DAY_NIGHT_END;
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
  }

  function starPaints() {
    const paints = [];
    const orig = ctx.fillRect;
    ctx.fillRect = function (x, y, w, h) {
      if (w === GAME_CONFIG.STAR_SIZE && h === GAME_CONFIG.STAR_SIZE) {
        paints.push({ alpha: ctx.globalAlpha, w, h, x, y });
      }
      return orig.call(this, x, y, w, h);
    };
    try {
      drawBackground();
    } finally {
      ctx.fillRect = orig;
    }
    return paints;
  }

  // Full white on night sky #1a1a2e. Channel lifts at a given peak alpha.
  function starLifts(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const white = [0xff, 0xff, 0xff];
    return white.map((channel, i) => (channel - sky[i]) * alpha);
  }

  function spriteLifts(brightness) {
    const sky = [0x1a, 0x1a, 0x2e];
    const sprite = 0x53 * brightness;
    return sky.map((channel) => sprite - channel);
  }

  function cloudLifts(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const puff = [0xe8, 0xe8, 0xe8];
    return puff.map((channel, i) => (channel - sky[i]) * alpha);
  }

  function sum(levels) {
    return levels.reduce((total, n) => total + n, 0);
  }

  it('keeps a quieter share of full white so the points stay under the lane', () => {
    const now = GAME_CONFIG.NIGHT_STAR_ALPHA;
    const threeFifths = 0.6;
    const nowLifts = starLifts(now);
    const fullLifts = starLifts(1);
    const cactusLifts = spriteLifts(GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS);
    const dinoLifts = spriteLifts(GAME_CONFIG.NIGHT_DINO_BRIGHTNESS);
    assertEquals(now, 0.35, 'night stars use the quieter peak');
    assertEquals(GAME_CONFIG.STAR_SIZE, 2, 'the points stay the same size');
    assertEquals(GAME_CONFIG.STAR_COUNT, 12, 'the field stays the usual twelve');
    assertEquals(GAME_CONFIG.STAR_COLOR, '#ffffff', 'the ink stays white; the quiet is opacity');
    assertEquals(GAME_CONFIG.STAR_FADE_FRAMES, 48, 'Classic still fades across the original beat');
    assertEquals(GAME_CONFIG.UPDATED_STAR_FADE_FRAMES, 24, 'Updated and Daily settle in half that beat');
    assertEquals(GAME_CONFIG.UPDATED_STAR_FADE_FRAMES * 2, GAME_CONFIG.STAR_FADE_FRAMES,
      'the quieter fade is half of Classic');
    assert(now < threeFifths, 'a full three-fifths of white still outruns the night cactus');
    assert(sum(starLifts(threeFifths)) > sum(cactusLifts),
      'three-fifths of full white is still brighter than night cacti');
    assert(sum(nowLifts) > sum(dinoLifts),
      'the softer night dino stays under this star whisper');
    assert(sum(nowLifts) < sum(cactusLifts),
      'the whisper stays under night cacti');
    assert(sum(nowLifts) > sum(cloudLifts(GAME_CONFIG.NIGHT_CLOUD_ALPHA)),
      'white at this peak stays a step above the soft night clouds');
    assert(sum(nowLifts) < sum(fullLifts) * 0.5,
      'the field loses a real share of the full-white sparkle');
    assert(now > 0, 'the points still read against the night sky');
  });

  it('Updated and Daily hold the quiet peak; Classic keeps full white; day paints none', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      game.starsInitialised = false;
      game.stars = [];
      assertEquals(getBackgroundColor(0), '#ffffff', 'day sky stays white');
      assertEquals(starPaints().length, 0, 'day sky paints no stars');
      game.score = 350;
      assertEquals(starPaints().length, 0, 'twilight still paints no stars');

      enterNightRun();
      game.mode = MODES.UPDATED;
      runRunningFrames(GAME_CONFIG.STAR_FADE_FRAMES);
      assertEquals(starFadeAlpha(), 1, 'the shared fade ramp still finishes');
      assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
        'Updated night holds the quiet peak');
      let paints = starPaints();
      assertEquals(paints.length, GAME_CONFIG.STAR_COUNT, 'every Updated star still paints');
      assert(paints.every((p) => Math.abs(p.alpha - GAME_CONFIG.NIGHT_STAR_ALPHA) < 1e-9),
        'Updated paint uses the quiet peak');
      assert(paints.every((p) => p.w === GAME_CONFIG.STAR_SIZE && p.h === GAME_CONFIG.STAR_SIZE),
        'Updated stars stay the same size');

      game.mode = MODES.DAILY;
      assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
        'Daily shares the Updated whisper');

      game.mode = MODES.CLASSIC;
      enterNightRun();
      runRunningFrames(1);
      assert(
        Math.abs(starPaintAlpha() - 1 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'Classic first frame is the full fade step, not the whisper'
      );
      runRunningFrames(GAME_CONFIG.STAR_FADE_FRAMES - 1);
      assertEquals(starPaintAlpha(), 1, 'Classic night still reaches full white');
      paints = starPaints();
      assertEquals(paints.length, GAME_CONFIG.STAR_COUNT, 'Classic still paints the field');
      assert(paints.every((p) => p.alpha === 1), 'Classic paint stays full white');
      assert(paints.every((p) => p.w === GAME_CONFIG.STAR_SIZE), 'Classic size stays 2');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNight=1 shows the quiet Updated peak without moving the score', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.UPDATED;
      game.state = STATE.RUNNING;
      game.graceFrames = 0;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      setQaNight(true);
      runRunningFrames(1);
      assert(game.score < 1, 'the whisper must not jump the score to night');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'speed still follows the real score');
      assert(game.starsInitialised, 'the existing night QA flag starts the field');
      assert(
        Math.abs(starPaintAlpha() - GAME_CONFIG.NIGHT_STAR_ALPHA / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
        'the first QA frame is the first step of the shorter quiet fade'
      );
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
        'a settled QA night holds the quiet peak');
      assert(game.score < 1, 'settling the fade must not write the score');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'settling the fade must not invent a speed');

      game.mode = MODES.CLASSIC;
      assertEquals(starPaintAlpha(), 1, 'QA night still leaves Classic stars full white');
      assert(game.score < 1, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      setQaNight(false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('NIGHT_STAR_ALPHA override changes only the Updated and Daily peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origInit = game.starsInitialised;
    const origStars = game.stars.slice();
    const origFade = game.starFadeFrames;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.starsInitialised = true;
      game.stars = [{ x: 4, y: 6 }];
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_STAR_ALPHA: 0.2 }, () => {
        assertEquals(starPaintAlpha(), 0.2,
          'a visual override should quiet night stars by the tuned amount');
      });
      assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
        'clearing the override returns the configured whisper');
      game.mode = MODES.DAILY;
      withTuning({ NIGHT_STAR_ALPHA: 0.2 }, () => {
        assertEquals(starPaintAlpha(), 0.2, 'Daily reads the same visual override');
      });
      game.mode = MODES.CLASSIC;
      withTuning({ NIGHT_STAR_ALPHA: 0.2 }, () => {
        assertEquals(starPaintAlpha(), 1, 'Classic ignores the night-star override');
      });
      game.mode = MODES.UPDATED;
      withTuning({ NIGHT_STAR_ALPHA: 'soft' }, () => {
        assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a non-numeric override falls back to the configured whisper');
      });
      withTuning({ NIGHT_STAR_ALPHA: 1.4 }, () => {
        assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a peak above 1 falls back so a typo cannot restore the sparkle');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('paints the whisper only around the stars and does not consume the run seed', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origAlpha = ctx.globalAlpha;
    const origInit = game.starsInitialised;
    const origStars = game.stars.slice();
    const origFade = game.starFadeFrames;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    const randoms = [];
    const origRandom = Math.random;
    Math.random = () => { randoms.push(1); return origRandom(); };
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      game.starsInitialised = true;
      game.stars = [{ x: 20, y: 30 }, { x: 40, y: 10 }];
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      ctx.globalAlpha = 0.8;
      const paints = starPaints();
      assertEquals(paints.length, 2, 'both stars paint');
      assert(paints.every((p) => Math.abs(p.alpha - 0.8 * GAME_CONFIG.NIGHT_STAR_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the whisper');
      assertEquals(ctx.globalAlpha, 0.8, 'the whisper must not leak onto the dino or cacti');
      assertEquals(rngCalls, 0, 'painting stars does not consume the run seed');
      assertEquals(randoms.length, 0, 'painting settled stars does not re-roll positions');
      assertEquals(game.score, GAME_CONFIG.DAY_NIGHT_END, 'painting stars does not change the score');

      game.mode = MODES.CLASSIC;
      ctx.globalAlpha = 1;
      const classic = starPaints();
      assert(classic.every((p) => p.alpha === 1), 'Classic night paint stays full white');
      assertEquals(ctx.globalAlpha, 1, 'Classic paint leaves the lane alone');
      assertEquals(rngCalls, 0, 'Classic star paint does not consume the run seed');
    } finally {
      Math.random = origRandom;
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
      ctx.globalAlpha = origAlpha;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('Daily settles on the shorter fade, and a tune stops the clock there', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaNight(false);
      game.mode = MODES.DAILY;
      enterNightRun();
      const total = GAME_CONFIG.UPDATED_STAR_FADE_FRAMES;
      runRunningFrames(1);
      assert(
        Math.abs(starFadeAlpha() - 1 / total) < 1e-9,
        'Daily starts the shorter fade'
      );
      assert(
        Math.abs(starPaintAlpha() - GAME_CONFIG.NIGHT_STAR_ALPHA / total) < 1e-9,
        'Daily paint is the quiet peak times the shorter ramp'
      );
      runRunningFrames(total - 1);
      assertEquals(game.starFadeFrames, total, 'Daily stops at the shorter fade');
      assertEquals(starFadeAlpha(), 1, 'Daily ramp finishes on the shorter clock');
      assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA, 'Daily holds the quiet peak');
      runRunningFrames(GAME_CONFIG.STAR_FADE_FRAMES);
      assertEquals(game.starFadeFrames, total, 'Daily does not keep counting toward Classic');

      game.mode = MODES.UPDATED;
      enterNightRun();
      withTuning({ UPDATED_STAR_FADE_FRAMES: 4 }, () => {
        runRunningFrames(10);
        assertEquals(game.starFadeFrames, 4, 'the clock stops at the tuned Updated length');
        assertEquals(starFadeAlpha(), 1, 'the tuned length is what the ramp finishes on');
        assertEquals(starPaintAlpha(), GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a shorter tune still settles on the quiet peak');
      });
    } finally {
      game.mode = origMode;
      setQaNight(false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
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

  it('NIGHT_OBSTACLE_BRIGHTNESS override changes the night cactus lift', () => {
    const origMode = game.mode;
    const origScore = game.score;
    game.mode = MODES.UPDATED;
    game.score = GAME_CONFIG.DAY_NIGHT_END;
    try {
      withTuning({ NIGHT_OBSTACLE_BRIGHTNESS: 1.4 }, () => {
        assertEquals(obstacleNightBrightness(), 1.4,
          'a visual override should brighten night cacti by the tuned amount');
      });
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'clearing the override returns the configured night lift');
    } finally {
      game.mode = origMode;
      game.score = origScore;
    }
  });

  it('NIGHT_DINO_BRIGHTNESS override changes the night dino lift', () => {
    const origMode = game.mode;
    const origScore = game.score;
    game.mode = MODES.UPDATED;
    game.score = GAME_CONFIG.DAY_NIGHT_END;
    try {
      withTuning({ NIGHT_DINO_BRIGHTNESS: 1.5 }, () => {
        assertEquals(dinoNightBrightness(), 1.5,
          'a visual override should brighten the night dino by the tuned amount');
      });
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'clearing the override returns the configured dino lift');
    } finally {
      game.mode = origMode;
      game.score = origScore;
    }
  });

  it('STAR_FADE_FRAMES override changes how fast Classic night stars reach full opacity', () => {
    const origMode = game.mode;
    const origInit = game.starsInitialised;
    const origStars = game.stars.slice();
    const origFade = game.starFadeFrames;
    game.starsInitialised = true;
    game.stars = [{ x: 1, y: 1 }];
    game.starFadeFrames = 2;
    game.mode = MODES.CLASSIC;
    try {
      withTuning({ STAR_FADE_FRAMES: 4 }, () => {
        assertEquals(starFadeAlpha(), 0.5, 'halfway through an overridden Classic fade');
      });
      assert(
        Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'clearing the override returns the Classic fade length'
      );
      game.mode = MODES.UPDATED;
      withTuning({ STAR_FADE_FRAMES: 4 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'Updated ignores STAR_FADE_FRAMES and keeps its own length'
        );
      });
      game.mode = MODES.DAILY;
      withTuning({ STAR_FADE_FRAMES: 4 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'Daily ignores STAR_FADE_FRAMES and keeps the Updated length'
        );
      });
      game.mode = MODES.CLASSIC;
      withTuning({ STAR_FADE_FRAMES: 0 }, () => {
        assertEquals(starFadeAlpha(), 1, 'a non-positive Classic tune still shows the field immediately');
      });
      withTuning({ STAR_FADE_FRAMES: -2 }, () => {
        assertEquals(starFadeAlpha(), 1, 'a negative Classic tune still shows the field immediately');
      });
    } finally {
      game.mode = origMode;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
    }
  });

  it('UPDATED_STAR_FADE_FRAMES override shortens only Updated and Daily', () => {
    const origMode = game.mode;
    const origInit = game.starsInitialised;
    const origStars = game.stars.slice();
    const origFade = game.starFadeFrames;
    game.starsInitialised = true;
    game.stars = [{ x: 1, y: 1 }];
    game.starFadeFrames = 2;
    try {
      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_STAR_FADE_FRAMES: 4 }, () => {
        assertEquals(starFadeAlpha(), 0.5, 'halfway through an overridden Updated fade');
        assertEquals(starPaintAlpha(), 0.5 * GAME_CONFIG.NIGHT_STAR_ALPHA,
          'the quiet peak still scales the shorter ramp');
      });
      assert(
        Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
        'clearing the override returns the shorter fade'
      );
      game.mode = MODES.DAILY;
      withTuning({ UPDATED_STAR_FADE_FRAMES: 8 }, () => {
        assertEquals(starFadeAlpha(), 0.25, 'Daily reads the same visual length');
      });
      game.mode = MODES.CLASSIC;
      withTuning({ UPDATED_STAR_FADE_FRAMES: 4 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
          'Classic ignores the Updated fade length'
        );
        assertEquals(starPaintAlpha(), 2 / GAME_CONFIG.STAR_FADE_FRAMES,
          'Classic stays on the full-white ramp');
      });
      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_STAR_FADE_FRAMES: 90 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'a length past Classic falls back so a typo cannot linger longer'
        );
      });
      withTuning({ UPDATED_STAR_FADE_FRAMES: -3 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'a negative length falls back'
        );
      });
      withTuning({ UPDATED_STAR_FADE_FRAMES: 0 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'zero falls back instead of popping the field on'
        );
      });
      withTuning({ UPDATED_STAR_FADE_FRAMES: 1.5 }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'a fractional length falls back'
        );
      });
      withTuning({ UPDATED_STAR_FADE_FRAMES: 'fast' }, () => {
        assert(
          Math.abs(starFadeAlpha() - 2 / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES) < 1e-9,
          'a non-numeric length falls back'
        );
      });
      withTuning({ UPDATED_STAR_FADE_FRAMES: GAME_CONFIG.STAR_FADE_FRAMES }, () => {
        assertEquals(starFadeAlpha(), 2 / GAME_CONFIG.STAR_FADE_FRAMES,
          'a length equal to Classic is still allowed');
      });
    } finally {
      game.mode = origMode;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
    }
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

  it('in-run HUD omits the Daily TODAY label; game over still shows TODAY BEST', () => {
    const origMode = game.mode;
    const origBest = game.dailyBest;
    const origScore = game.score;
    const origHS = game.highScore;
    const origState = game.state;
    const origPop = Animations.scorePopFrames;
    const origAnim = Animations.deathAnimFrame;
    const origFill = ctx.fillText;
    game.mode = MODES.DAILY;
    game.state = STATE.RUNNING;
    game.dailyBest = 120;
    game.score = 40;
    game.highScore = 0;
    Animations.scorePopFrames = 0;

    const hud = [];
    ctx.fillText = (text) => hud.push(String(text));
    drawScore();

    const over = [];
    ctx.fillText = (text) => over.push(String(text));
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.mode = origMode;
    game.dailyBest = origBest;
    game.score = origScore;
    game.highScore = origHS;
    game.state = origState;
    Animations.scorePopFrames = origPop;
    Animations.deathAnimFrame = origAnim;

    assert(!hud.some(t => t.indexOf('TODAY') !== -1),
      `In-run HUD must not show TODAY, got: ${JSON.stringify(hud)}`);
    assert(over.some(t => t === 'TODAY BEST'),
      `Game over must still show TODAY BEST, got: ${JSON.stringify(over)}`);
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
    game.score             = 1200;
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

describe('Soft day hills', () => {
  // Levels the day fill sits off the white sky. Neutral grays share one channel.
  function dayHillInk(hex) {
    return 0xff - parseInt(hex.slice(1, 3), 16);
  }

  // Day sky #ffffff showing through the #e8e8e8 cloud at DAY_CLOUD_ALPHA.
  function dayCloudInk() {
    const channel = 0xff + (0xe8 - 0xff) * GAME_CONFIG.DAY_CLOUD_ALPHA;
    return 0xff - channel;
  }

  function hillFillStyles() {
    const seen = [];
    const orig = ctx.ellipse;
    ctx.ellipse = function (...args) {
      seen.push(ctx.fillStyle);
      return orig.apply(this, args);
    };
    return {
      seen,
      restore() { ctx.ellipse = orig; },
    };
  }

  it('day hills lose a real share of the old mid-gray band and stay a distant mound', () => {
    const day = GAME_CONFIG.HILL_COLOR_DAY;
    const channels = [
      parseInt(day.slice(1, 3), 16),
      parseInt(day.slice(3, 5), 16),
      parseInt(day.slice(5, 7), 16),
    ];
    const ink = dayHillInk(day);
    const oldInk = 0xff - 0xcd;
    const laneInk = 0xff - 0x53;
    assert(/^#[0-9a-f]{6}$/.test(day), 'day hills stay a 6-digit hex colour');
    assert(channels[0] === channels[1] && channels[1] === channels[2],
      'day hills stay a neutral gray silhouette');
    assert(ink < oldInk * 0.75, 'day hills lose a real share of the old #cdcdcd contrast');
    assert(ink > 20, 'the mounds still sit more than twenty levels off the white sky');
    assert(ink > dayCloudInk() * 2,
      'the mounds still read in front of the day cloud whisper');
    assert(ink < laneInk / 4, 'day hills stay much softer than the dino and the ground');
  });

  it('twilight still eases, and reduced motion holds the day colour until night', () => {
    try {
      setReducedMotion(false);
      setQaNight(false);
      assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_DAY, 'opening run is the day fill');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_START - 1), GAME_CONFIG.HILL_COLOR_DAY,
        'the ease starts with the sky');
      const mid = getHillColor(350);
      assert(mid !== GAME_CONFIG.HILL_COLOR_DAY, 'mid-twilight has left the day fill');
      assert(mid !== GAME_CONFIG.HILL_COLOR_NIGHT, 'mid-twilight has not snapped to night');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END), GAME_CONFIG.HILL_COLOR_NIGHT,
        'full night holds the night hill colour');

      setReducedMotion(true);
      assertEquals(getHillColor(350), GAME_CONFIG.HILL_COLOR_DAY,
        'reduced motion skips the twilight ease');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END - 1), GAME_CONFIG.HILL_COLOR_DAY,
        'reduced motion stays on the day fill until night is complete');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END), GAME_CONFIG.HILL_COLOR_NIGHT,
        'reduced motion still snaps to the night hill colour');
    } finally {
      setReducedMotion(false);
      setQaNight(false);
    }
  });

  it('GET READY already paints the quieter day hills, so playtest needs no query flag', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origState = game.state;
    const origGrace = game.graceFrames;
    const origFrame = game.animFrame;
    const origRng = game.rng;
    const paint = hillFillStyles();
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.rng = mulberry32(1);
      initHills();
      game.mode = MODES.UPDATED;
      game.score = 0;
      game.state = STATE.WAITING;
      game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      gameLoop();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assert(game.state === STATE.WAITING, 'one opening frame stays on GET READY');
      assertEquals(game.score, 0, 'painting the opening hills must not write the score');
      assertEquals(paint.seen.length, GAME_CONFIG.HILL_COUNT, 'GET READY draws every mound');
      assert(paint.seen.every(style => style === GAME_CONFIG.HILL_COLOR_DAY),
        'the opening screen uses the quieter day fill');

      paint.seen.length = 0;
      game.mode = MODES.DAILY;
      drawHills();
      assertEquals(paint.seen.length, GAME_CONFIG.HILL_COUNT, 'Daily shares the Updated day mounds');
      assert(paint.seen.every(style => style === GAME_CONFIG.HILL_COLOR_DAY),
        'Daily opening hills use the same quieter day fill');

      paint.seen.length = 0;
      game.mode = MODES.CLASSIC;
      drawHills();
      assertEquals(paint.seen.length, 0, 'Classic never draws hills');
    } finally {
      paint.restore();
      game.mode = origMode;
      game.score = origScore;
      game.state = origState;
      game.graceFrames = origGrace;
      game.animFrame = origFrame;
      game.rng = origRng;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 paints the night hill colour immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    const paint = hillFillStyles();
    try {
      setReducedMotion(false);
      game.rng = mulberry32(1);
      initHills();
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      drawHills();
      assertEquals(paint.seen.length, GAME_CONFIG.HILL_COUNT, 'QA night still draws the mounds');
      assert(paint.seen.every(style => style === GAME_CONFIG.HILL_COLOR_NIGHT),
        'the existing night flag is enough to see the night hills');
      assertEquals(game.score, 0, 'the night hill colour must not write the score');

      paint.seen.length = 0;
      game.mode = MODES.CLASSIC;
      drawHills();
      assertEquals(paint.seen.length, 0, 'QA night still leaves Classic without hills');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      paint.restore();
      game.mode = origMode;
      game.score = origScore;
      game.rng = origRng;
      setQaNight(false);
      setReducedMotion(false);
    }
  });
});

describe('Soft night hills', () => {
  // Mean channel distance from the night sky #1a1a2e.
  function nightSkyLift(hex) {
    const sky = [0x1a, 0x1a, 0x2e];
    const channels = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const lifts = channels.map((c, i) => c - sky[i]);
    const mean = lifts.reduce((sum, n) => sum + n, 0) / lifts.length;
    return { channels, lifts, mean };
  }

  it('night hills keep three-fifths of the old band and stay a silhouette', () => {
    const night = GAME_CONFIG.HILL_COLOR_NIGHT;
    const now = nightSkyLift(night);
    const old = nightSkyLift('#3a3a55');
    const dino = 0x53 * GAME_CONFIG.NIGHT_DINO_BRIGHTNESS;
    const cactus = 0x53 * GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS;
    const ground = 0x1a + (0x53 - 0x1a) * GAME_CONFIG.NIGHT_GROUND_ALPHA;
    assertEquals(night, '#2d2d46', 'night hills use the quieter mound');
    assert(/^#[0-9a-f]{6}$/.test(night), 'night hills stay a 6-digit hex colour');
    assert(now.channels[0] === now.channels[1], 'red and green stay matched, like the night sky');
    assert(now.channels[2] > now.channels[0], 'blue stays a step above, so the mound is still night');
    assert(now.lifts.every(n => n > 0), 'the mounds still sit off the night sky');
    assert(Math.abs(now.mean - old.mean * 0.6) < 0.5,
      'the quieter mound keeps about three-fifths of the old #3a3a55 lift');
    assert(now.mean < old.mean * 0.75, 'night hills lose a real share of the old band');
    assert(now.channels[0] < ground, 'night hills stay darker than the night ground line');
    assert(now.channels[0] < dino / 2, 'night hills stay well behind the night dino');
    assert(now.channels[2] < cactus, 'night hills stay behind the night cactus');
    assertEquals(GAME_CONFIG.HILL_COLOR_DAY, '#e1e1e1', 'day hills stay the quieter day fill');
  });

  it('a night-hill tune changes only the night fill', () => {
    const origTuning = window.GAME_TUNING;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      window.GAME_TUNING = { HILL_COLOR_NIGHT: '#112233' };
      assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_DAY, 'day fill ignores the night tune');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END), '#112233', 'full night reads the tune');
      assertEquals(getHillColor(1000), '#112233', 'later night keeps the tune');
      window.GAME_TUNING = { HILL_COLOR_NIGHT: 'nope' };
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END), GAME_CONFIG.HILL_COLOR_NIGHT,
        'a bad tune falls back to the shipped night fill');
      assertEquals(game.score, origScore, 'tuning the night fill must not write the score');
    } finally {
      window.GAME_TUNING = origTuning;
      setQaNight(false);
      setReducedMotion(false);
    }
  });
});

describe('DifficultyProfile', () => {
  it('speedAtScore returns exactly the midpoint speed at RAMP_MIDPOINT', () => {
    const expected = GAME_CONFIG.INITIAL_SPEED +
      (GAME_CONFIG.PLATEAU_SPEED - GAME_CONFIG.INITIAL_SPEED) / 2;
    assertEquals(
      DifficultyProfile.speedAtScore(GAME_CONFIG.RAMP_MIDPOINT), expected,
      'At RAMP_MIDPOINT the sigmoid is exactly 0.5, so speed must be the midpoint between INITIAL and PLATEAU'
    );
  });

  it('speedAtScore is slightly above INITIAL_SPEED at score 0 — curve starts gently', () => {
    const speed = DifficultyProfile.speedAtScore(0);
    assert(speed > GAME_CONFIG.INITIAL_SPEED,
      `Score 0 speed ${speed} should be above INITIAL_SPEED ${GAME_CONFIG.INITIAL_SPEED}`);
    assert(speed < GAME_CONFIG.INITIAL_SPEED + 0.5,
      `Score 0 speed ${speed} should still be close to INITIAL_SPEED — gentle start`);
  });

  it('speedAtScore never exceeds PLATEAU_SPEED', () => {
    for (const score of [500, 1000, 5000]) {
      const speed = DifficultyProfile.speedAtScore(score);
      assert(speed <= GAME_CONFIG.PLATEAU_SPEED,
        `Score ${score} speed ${speed} must not exceed PLATEAU_SPEED ${GAME_CONFIG.PLATEAU_SPEED}`);
    }
  });

  it('speedAtScore is monotonically increasing', () => {
    const s0   = DifficultyProfile.speedAtScore(0);
    const s100 = DifficultyProfile.speedAtScore(100);
    const s300 = DifficultyProfile.speedAtScore(300);
    const s600 = DifficultyProfile.speedAtScore(600);
    assert(s0 < s100 && s100 < s300 && s300 < s600,
      `Speed must strictly increase: ${s0} < ${s100} < ${s300} < ${s600}`);
  });

  it('nextObstacle returns an object with a numeric gap and a typed obstacle', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng);
    assert(typeof params.gap === 'number',
      'gap must be a number');
    assert(params.type && typeof params.type.id === 'string',
      'type must be an obstacle-type object with an id string');
  });

  it('nextObstacle classic mode: gap shrinks as score rises', () => {
    const rng = mulberry32(42); // not consumed in classic mode — safe to reuse
    const paramsLow  = DifficultyProfile.nextObstacle(0,   MODES.CLASSIC, rng);
    const paramsHigh = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng);
    assert(paramsHigh.gap < paramsLow.gap,
      `Gap at score 500 (${paramsHigh.gap}) should be less than gap at score 0 (${paramsLow.gap}) — higher speed means shorter gap`);
  });

  it('nextObstacle classic mode: type is always small cactus', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng);
    assertEquals(params.type.id, 'small',
      'Classic mode must always return the small cactus');
  });

  it('nextObstacle updated mode: gap is within valid range at score 0', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.UPDATED, rng);
    assert(params.gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `Gap (${params.gap}) must be at least MIN_SPAWN_GAP (${GAME_CONFIG.MIN_SPAWN_GAP})`);
    assert(params.gap <= Math.round(GAME_CONFIG.MAX_SPAWN_GAP * (1 + GAME_CONFIG.SPAWN_GAP_JITTER)),
      `Gap (${params.gap}) must not exceed MAX_SPAWN_GAP with max jitter (${GAME_CONFIG.MAX_SPAWN_GAP} * ${1 + GAME_CONFIG.SPAWN_GAP_JITTER})`);
  });

  it('nextObstacle updated mode: cluster cactus returned at score 250 with max roll', () => {
    const rng = () => 0.99; // constant roll — pushes weighted pick to last eligible type
    const params = DifficultyProfile.nextObstacle(250, MODES.UPDATED, rng);
    assertEquals(params.type.id, 'cluster',
      'At score 250 with max rng roll, all three types eligible and cluster wins the weighted draw');
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

  it('handleAction in DEAD snaps the Updated count-up to 18 frames when it is still rolling', () => {
    const origState      = game.state;
    const origAnimFrame  = Animations.deathAnimFrame;
    const origScore      = game.score;
    const origMode       = game.mode;

    setReducedMotion(false);
    game.mode           = MODES.UPDATED;
    game.state          = STATE.DEAD;
    Animations.deathAnimFrame = 10;
    game.score          = 500;

    handleAction();

    const snappedFrame = Animations.deathAnimFrame;
    const stayedDead = game.state;

    game.state          = origState;
    Animations.deathAnimFrame = origAnimFrame;
    game.score          = origScore;
    game.mode           = origMode;
    setReducedMotion(false);

    assertEquals(snappedFrame, 18,
      'Updated skip should finish the shorter count-up, not the Classic 30');
    assertEquals(stayedDead, STATE.DEAD,
      'skipping the count-up should not restart the run');
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

  function withClipboard(writeText, run) {
    const shareBtn = document.getElementById('share-btn');
    const handler = shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    assert(typeof handler === 'function', 'share button must register a click handler');
    const origDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: { clipboard: { writeText } },
    });
    let threw = false;
    try {
      handler({ stopPropagation() {} });
    } catch {
      threw = true;
    }
    const flash = Animations.copyFlashFrames;
    const label = shareBtn.textContent;
    if (origDesc) Object.defineProperty(global, 'navigator', origDesc);
    Animations.copyFlashFrames = origFlash;
    shareBtn.textContent = origText;
    run({ threw, flash, label });
  }

  it('Copy result still flashes when clipboard writeText throws', () => {
    withClipboard(() => { throw new Error('clipboard blocked'); }, ({ threw, flash, label }) => {
      assert(!threw, 'a blocked clipboard must not abort the share tap');
      assert(flash > 0, 'copy flash should start even when writeText throws');
      assertEquals(label, '✓ Copied!', 'the button should say Copied before the next frame');
    });
  });

  it('Copy result still flashes when clipboard writeText rejects', () => {
    withClipboard(() => Promise.reject(new Error('clipboard denied')), ({ threw, flash, label }) => {
      assert(!threw, 'a rejected clipboard write must not abort the share tap');
      assert(flash > 0, 'copy flash should start even when writeText rejects');
      assertEquals(label, '✓ Copied!', 'the button should say Copied before the next frame');
    });
  });
});

describe('Daily obstacle sequence vs reduced motion', () => {
  function collectDailySpawns(useHills) {
    game.mode = MODES.DAILY;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const startX = game.hills.map(h => h.x);
    const seq = [];
    for (let i = 0; i < 4000; i++) {
      game.score += GAME_CONFIG.SCORE_INCREMENT;
      game.currentSpeed = DifficultyProfile.speedAtScore(game.score);
      if (useHills) updateHills();
      updateObstacles();
      if (game.lastObstacleX <= GAME_CONFIG.CANVAS_W - game.nextSpawnGap) {
        const params = DifficultyProfile.nextObstacle(game.score, game.mode, game.rng);
        seq.push(params.type.id + '@' + params.gap);
        spawnObstacle(params.type);
        game.lastObstacleX = GAME_CONFIG.CANVAS_W;
        game.nextSpawnGap = params.gap;
      }
    }
    return { seq, startX, endX: game.hills.map(h => h.x) };
  }

  it('same daily seed keeps the obstacle sequence when hills do not scroll', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      const moving = collectDailySpawns(true);
      setReducedMotion(true);
      const reduced = collectDailySpawns(true);
      setReducedMotion(false);
      const skipped = collectDailySpawns(false);

      assert(moving.endX.some((x, i) => x !== moving.startX[i]),
        'Scrolling run must move hills so respawn draws are actually exercised');
      assert(reduced.endX.every((x, i) => x === reduced.startX[i]),
        'Reduced motion must leave drawn hill positions unchanged');
      assertNotEquals(moving.seq.join('|'), skipped.seq.join('|'),
        'Skipping hill updates must be able to change later obstacle rolls');

      const movingKey = moving.seq.join('|');
      const reducedKey = reduced.seq.join('|');
      if (movingKey !== reducedKey) {
        let i = 0;
        while (i < moving.seq.length && reduced.seq[i] === moving.seq[i]) i++;
        assert(false,
          `Daily obstacle sequence diverged at spawn ${i}: moving=${moving.seq[i]} reduced=${reduced.seq[i]}`);
      }
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Restart cancels the animation frame first', () => {
  function assertCancelBeforeReset(trigger) {
    const origCancel = global.cancelAnimationFrame;
    const origRAF = global.requestAnimationFrame;
    game.score = 77;
    let scoreAtCancel = null;
    let scoreAtLoop = null;
    global.cancelAnimationFrame = (id) => {
      if (scoreAtCancel === null) scoreAtCancel = game.score;
      return origCancel(id);
    };
    global.requestAnimationFrame = (cb) => {
      if (scoreAtLoop === null) scoreAtLoop = game.score;
      return origRAF(cb);
    };
    try {
      trigger();
    } finally {
      global.cancelAnimationFrame = origCancel;
      global.requestAnimationFrame = origRAF;
      if (game.animationFrameId) origCancel(game.animationFrameId);
    }
    assert(scoreAtCancel !== null, 'restart path must call cancelAnimationFrame');
    assertEquals(scoreAtCancel, 77,
      'cancelAnimationFrame must run before resetGame clears the score');
    assertEquals(scoreAtLoop, 0, 'gameLoop must run after resetGame');
  }

  it('setMode cancels the frame before resetGame and gameLoop', () => {
    const origMode = game.mode;
    assertCancelBeforeReset(() => setMode(MODES.CLASSIC));
    setMode(origMode === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED);
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  });

  it('daily toggle cancels the frame before resetGame and gameLoop', () => {
    const origMode = game.mode;
    const btn = document.getElementById('daily-btn');
    const handler = btn && btn._listeners && btn._listeners.click && btn._listeners.click[0];
    assert(typeof handler === 'function', 'daily button must register a click handler');
    assertCancelBeforeReset(() => handler({ stopPropagation() {} }));
    game.mode = origMode;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  });

  it('DEAD restart via handleAction cancels the frame before resetGame and gameLoop', () => {
    const origMode = game.mode;
    const origState = game.state;
    game.state = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    assertCancelBeforeReset(() => handleAction());
    game.mode = origMode;
    game.state = origState;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    const type1 = DifficultyProfile.nextObstacle(300, MODES.DAILY, game.rng).type;
    game.mode = MODES.DAILY;
    resetGame();
    const type2 = DifficultyProfile.nextObstacle(300, MODES.DAILY, game.rng).type;
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

// Pins "now" to one UTC instant and makes local Y/M/D disagree with UTC.
// offsetMinutesEast is the wall-clock shift (UTC-8 → -480). Restores Date after fn.
function withSplitClock(utcMs, offsetMinutesEast, fn) {
  const RealDate = global.Date;
  function utcParts(ms) {
    const d = new RealDate(ms);
    return {
      y: RealDate.prototype.getUTCFullYear.call(d),
      m: RealDate.prototype.getUTCMonth.call(d),
      day: RealDate.prototype.getUTCDate.call(d),
    };
  }
  function localParts(ms) {
    return utcParts(ms + offsetMinutesEast * 60000);
  }
  const orig = {
    getFullYear: RealDate.prototype.getFullYear,
    getMonth: RealDate.prototype.getMonth,
    getDate: RealDate.prototype.getDate,
  };
  RealDate.prototype.getFullYear = function () {
    return localParts(this.getTime()).y;
  };
  RealDate.prototype.getMonth = function () {
    return localParts(this.getTime()).m;
  };
  RealDate.prototype.getDate = function () {
    return localParts(this.getTime()).day;
  };
  function FakeDate(...args) {
    return args.length ? new RealDate(...args) : new RealDate(utcMs);
  }
  FakeDate.now = () => utcMs;
  FakeDate.parse = RealDate.parse.bind(RealDate);
  FakeDate.UTC = RealDate.UTC.bind(RealDate);
  FakeDate.prototype = RealDate.prototype;
  global.Date = FakeDate;
  try {
    return fn();
  } finally {
    global.Date = RealDate;
    RealDate.prototype.getFullYear = orig.getFullYear;
    RealDate.prototype.getMonth = orig.getMonth;
    RealDate.prototype.getDate = orig.getDate;
  }
}

function utcCalendarSeed(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

const DAILY_EPOCH_MS_TEST = Date.parse('2026-03-01T00:00:00Z');

function expectedDailyNumber(utcMs) {
  return Math.floor((utcMs - DAILY_EPOCH_MS_TEST) / 86400000) + 1;
}

function wallCalendarSeed(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function withDailyStorage(fn) {
  const origDate = localStorage.getItem('dino-daily-date');
  const origBest = localStorage.getItem('dino-daily-best');
  localStorage.removeItem('dino-daily-date');
  localStorage.removeItem('dino-daily-best');
  try {
    fn();
  } finally {
    if (origDate === null) localStorage.removeItem('dino-daily-date');
    else localStorage.setItem('dino-daily-date', origDate);
    if (origBest === null) localStorage.removeItem('dino-daily-best');
    else localStorage.setItem('dino-daily-best', origBest);
  }
}

describe('Daily UTC calendar', () => {
  it('west of UTC, seed, number, and today-best key share the UTC day after local evening', () => {
    // 03:30 UTC on the 29th is still 19:30 on the 28th in UTC-8.
    const utcMs = Date.parse('2026-09-29T03:30:00.000Z');
    const utcSeed = 20260929;
    const localSeed = 20260928;
    withSplitClock(utcMs, -8 * 60, () => {
      assertEquals(wallCalendarSeed(new Date()), localSeed, 'fixture local day must disagree with UTC');
      assertEquals(utcCalendarSeed(utcMs), utcSeed, 'fixture UTC day');
      const seed = dailySeed();
      assertEquals(seed, utcSeed, 'daily seed follows the UTC calendar day');
      assertEquals(
        dailyNumber(),
        expectedDailyNumber(utcMs),
        'daily number counts UTC days from the project epoch'
      );
      const numberDayMs = DAILY_EPOCH_MS_TEST + (dailyNumber() - 1) * 86400000;
      assertEquals(utcCalendarSeed(numberDayMs), seed, 'daily number and daily seed name the same UTC day');
      withDailyStorage(() => {
        ScoreStore.saveDailyBest(120);
        assertEquals(
          localStorage.getItem('dino-daily-date'),
          String(utcSeed),
          'today best day key is the UTC daily seed'
        );
        assertEquals(ScoreStore.loadDailyBest(), 120, 'best loads on that same UTC day');
        localStorage.setItem('dino-daily-date', String(localSeed));
        localStorage.setItem('dino-daily-best', '999');
        assertEquals(ScoreStore.loadDailyBest(), 0, 'a local-calendar key is stale once the UTC day has flipped');
      });
    });
  });

  it('east of UTC, seed, number, and today-best key stay on the UTC day after local midnight', () => {
    // 16:30 UTC on the 28th is already 01:30 on the 29th in UTC+9.
    const utcMs = Date.parse('2026-09-28T16:30:00.000Z');
    const utcSeed = 20260928;
    const localSeed = 20260929;
    withSplitClock(utcMs, 9 * 60, () => {
      assertEquals(wallCalendarSeed(new Date()), localSeed, 'fixture local day must disagree with UTC');
      const seed = dailySeed();
      assertEquals(seed, utcSeed, 'daily seed follows the UTC calendar day');
      assertEquals(
        dailyNumber(),
        expectedDailyNumber(utcMs),
        'daily number counts UTC days from the project epoch'
      );
      const numberDayMs = DAILY_EPOCH_MS_TEST + (dailyNumber() - 1) * 86400000;
      assertEquals(utcCalendarSeed(numberDayMs), seed, 'daily number and daily seed name the same UTC day');
      withDailyStorage(() => {
        ScoreStore.saveDailyBest(80);
        assertEquals(
          localStorage.getItem('dino-daily-date'),
          String(utcSeed),
          'today best day key is the UTC daily seed'
        );
        localStorage.setItem('dino-daily-date', String(localSeed));
        localStorage.setItem('dino-daily-best', '999');
        assertEquals(
          ScoreStore.loadDailyBest(),
          0,
          'a local-calendar key is not today while UTC is still the previous day'
        );
      });
    });
  });
});

describe('Restart countdown', () => {
  function overlayText() {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGetReadyOverlay();
    ctx.fillText = origFill;
    return calls;
  }

  it('first WAITING does not skip on Space or Tap', () => {
    const origState = game.state;
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;

    game.countdownSkippable = false;
    game.state = STATE.IDLE;
    handleAction();

    const graceAfterEnter = game.graceFrames;
    handleAction();

    const stateAfter = game.state;
    const graceAfter = game.graceFrames;

    game.state = origState;
    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;

    assertEquals(graceAfterEnter, GAME_CONFIG.GRACE_FRAMES,
      'first visit should arm the full countdown');
    assertEquals(stateAfter, STATE.WAITING,
      'Space/Tap during the first countdown should leave the game in WAITING');
    assertEquals(graceAfter, graceAfterEnter,
      'Space/Tap during the first countdown should not consume grace frames');
  });

  it('post-death WAITING skips to RUNNING on Space or Tap', () => {
    const origState = game.state;
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;
    const origAnim = Animations.deathAnimFrame;
    const origJumping = dino.isJumping;

    game.countdownSkippable = false;
    game.state = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    dino.isJumping = false;

    handleAction();
    cancelAnimationFrame(game.animationFrameId);

    const stateAfterRestart = game.state;
    const graceAfterRestart = game.graceFrames;
    const skipAfterRestart = game.countdownSkippable;

    handleAction();

    const stateAfterSkip = game.state;
    const jumpingAfterSkip = dino.isJumping;

    cancelAnimationFrame(game.animationFrameId);
    game.state = origState;
    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;
    Animations.deathAnimFrame = origAnim;
    dino.isJumping = origJumping;

    assertEquals(stateAfterRestart, STATE.WAITING,
      'restart after death should land in GET READY');
    assert(graceAfterRestart > 0,
      'restart after death should still show a countdown until the player skips');
    assertEquals(skipAfterRestart, true,
      'restart after death should mark the countdown skippable');
    assertEquals(stateAfterSkip, STATE.RUNNING,
      'Space/Tap during post-death GET READY should start the run immediately');
    assertEquals(jumpingAfterSkip, false,
      'the skip press should start the run without also jumping');
  });

  it('post-death skip works in Classic mode', () => {
    const origState = game.state;
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;
    const origMode = game.mode;
    const origAnim = Animations.deathAnimFrame;

    game.mode = MODES.CLASSIC;
    game.countdownSkippable = false;
    game.state = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    handleAction();
    cancelAnimationFrame(game.animationFrameId);
    handleAction();

    const stateAfterSkip = game.state;

    cancelAnimationFrame(game.animationFrameId);
    game.state = origState;
    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;
    game.mode = origMode;
    Animations.deathAnimFrame = origAnim;

    assertEquals(stateAfterSkip, STATE.RUNNING,
      'Classic mode should skip GET READY after death the same way Updated does');
  });

  it('first-run overlay does not promise a jump', () => {
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;

    game.countdownSkippable = false;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    const calls = overlayText();

    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;

    assert(calls.some(t => t === 'GET READY'),
      `Expected 'GET READY', got: ${JSON.stringify(calls)}`);
    assert(!calls.some(t => t === 'Press Space / Tap to jump'),
      'first-run overlay must not say Press Space / Tap to jump');
    assert(!calls.some(t => /space|tap/i.test(t)),
      `first-run overlay must not mention Space or Tap, got: ${JSON.stringify(calls)}`);
  });

  it('post-death overlay says Space or Tap starts the run', () => {
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;

    game.countdownSkippable = true;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    const calls = overlayText();

    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;

    assert(calls.some(t => t === 'GET READY'),
      `Expected 'GET READY', got: ${JSON.stringify(calls)}`);
    assert(calls.some(t => t === 'Press Space / Tap to start'),
      `Expected 'Press Space / Tap to start', got: ${JSON.stringify(calls)}`);
    assert(!calls.some(t => t === 'Press Space / Tap to jump'),
      'post-death overlay must not tell the player to jump');
  });

  it('screen reader prompt matches whether the countdown can be skipped', () => {
    const origState = game.state;
    const origSkip = game.countdownSkippable;
    const origText = a11yLive.textContent;

    game.countdownSkippable = false;
    game.state = STATE.WAITING;
    resetGame();
    const firstRun = a11yLive.textContent;

    game.countdownSkippable = false;
    game.state = STATE.DEAD;
    resetGame();
    const afterDeath = a11yLive.textContent;

    game.state = origState;
    game.countdownSkippable = origSkip;
    a11yLive.textContent = origText;

    assert(!/jump/i.test(firstRun),
      `first countdown must not announce a jump, got: ${firstRun}`);
    assert(/space or tap to start/i.test(afterDeath),
      `post-death countdown should announce space or tap to start, got: ${afterDeath}`);
  });
});

describe('Daily HUD', () => {
  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    draw();
    ctx.fillText = origFill;
    return calls;
  }

  it('RUNNING and WAITING show the current score only — no TODAY, no HI', () => {
    const origMode = game.mode;
    const origState = game.state;
    const origScore = game.score;
    const origBest = game.dailyBest;
    const origHS = game.highScore;
    const origPop = Animations.scorePopFrames;

    game.mode = MODES.DAILY;
    game.score = 42;
    game.dailyBest = 500;
    game.highScore = 900;
    Animations.scorePopFrames = 0;

    game.state = STATE.RUNNING;
    const running = captureFillText(drawScore);
    game.state = STATE.WAITING;
    const waiting = captureFillText(drawScore);

    game.mode = origMode;
    game.state = origState;
    game.score = origScore;
    game.dailyBest = origBest;
    game.highScore = origHS;
    Animations.scorePopFrames = origPop;

    [running, waiting].forEach((calls, i) => {
      const when = i === 0 ? 'RUNNING' : 'WAITING';
      assert(calls.some(t => t === '00042'),
        `${when} daily HUD should show the current score, got: ${JSON.stringify(calls)}`);
      assert(!calls.some(t => t.includes('TODAY')),
        `${when} daily HUD must not show TODAY, got: ${JSON.stringify(calls)}`);
      assert(!calls.some(t => t.startsWith('HI ')),
        `${when} daily HUD must not show HI, got: ${JSON.stringify(calls)}`);
    });
  });

  it('Game Over still shows TODAY BEST, and share still includes the score', () => {
    const origMode = game.mode;
    const origBest = game.dailyBest;
    const origScore = game.score;
    const origAnim = Animations.deathAnimFrame;

    game.mode = MODES.DAILY;
    game.dailyBest = 500;
    game.score = 120;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    const calls = captureFillText(drawGameOverScreen);
    const shared = shareDailyResult();

    game.mode = origMode;
    game.dailyBest = origBest;
    game.score = origScore;
    Animations.deathAnimFrame = origAnim;

    assert(calls.some(t => t === 'TODAY BEST'),
      `Game Over must keep TODAY BEST, got: ${JSON.stringify(calls)}`);
    assert(calls.some(t => t === '00500'),
      `Game Over must show today's best score, got: ${JSON.stringify(calls)}`);
    assert(shared.includes('500'), 'Share result must still include the daily best');
  });
});

describe('Death log (opt-in seed dump)', () => {
  function restoreDebug(orig) {
    if (typeof disableDeathLog === 'function') disableDeathLog();
    game.seedOverride = null;
    game.mode = orig.mode;
    game.state = orig.state;
    Date.now = orig.now;
    console.log = orig.log;
    ctx.fillText = orig.fill;
    if (orig.location === undefined) delete global.location;
    else global.location = orig.location;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  }

  function snapshotEnv() {
    return {
      mode: game.mode,
      state: game.state,
      now: Date.now,
      log: console.log,
      fill: ctx.fillText,
      location: global.location,
    };
  }

  function silenceClipboard() {
    const copies = [];
    // Node's test harness has no DOM. CI (Node 20) has no navigator at all;
    // newer Node exposes a getter-only navigator, which must not be replaced.
    const hadNavigator = typeof global.navigator !== 'undefined';
    if (!hadNavigator) global.navigator = {};
    const nav = global.navigator;
    const prev = nav.clipboard;
    nav.clipboard = {
      writeText(text) {
        copies.push(text);
        return Promise.resolve();
      },
    };
    copies.restore = () => {
      if (!hadNavigator) {
        delete global.navigator;
        return;
      }
      if (prev === undefined) delete nav.clipboard;
      else nav.clipboard = prev;
    };
    return copies;
  }

  it('resetGame stores the seed that was handed to the RNG', () => {
    const orig = snapshotEnv();
    try {
      game.mode = MODES.UPDATED;
      const frozen = 1700000123456;
      Date.now = () => frozen;
      resetGame();
      const expected = frozen >>> 0;
      assert(expected > 0x7fffffff, 'fixture must set the 32-bit sign bit');
      assertEquals(game.runSeed, expected, 'free-play reset stores the unsigned 32-bit clock seed');
      assert(game.runSeed >= 0, 'run seed is not a negative signed int');
      const gap = game.nextSpawnGap;
      resetGame();
      assertEquals(
        game.runSeed,
        expected,
        'a second reset with the same clock keeps the same seed'
      );
      assertEquals(game.nextSpawnGap, gap, 'the same seed still yields the same first spawn gap');
    } finally {
      restoreDebug(orig);
    }
  });

  it('daily reset stores dailySeed(); free play stores Date.now()', () => {
    const orig = snapshotEnv();
    try {
      Date.now = () => 42;
      game.mode = MODES.DAILY;
      resetGame();
      assertEquals(game.runSeed, dailySeed(), 'daily run seed comes from dailySeed()');
      assertNotEquals(game.runSeed, 42, 'daily run seed is not the free-play clock');

      game.mode = MODES.CLASSIC;
      resetGame();
      assertEquals(game.runSeed, 42, 'classic free play stores the masked Date.now seed');

      game.mode = MODES.UPDATED;
      resetGame();
      assertEquals(game.runSeed, 42, 'updated free play stores the masked Date.now seed');
      assertNotEquals(game.runSeed, dailySeed(), 'free play does not use the daily seed');
    } finally {
      restoreDebug(orig);
    }
  });

  it('the same run seed reproduces the same spawn gaps', () => {
    const orig = snapshotEnv();
    try {
      enableDeathLog();
      game.mode = MODES.UPDATED;

      function collect(seed) {
        replayRunSeed(seed);
        resetGame();
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        const firstGap = game.nextSpawnGap;
        const gaps = [];
        game.state = STATE.RUNNING;
        for (let i = 0; i < 4; i++) {
          game.obstacles.length = 0;
          gameLoop();
          cancelAnimationFrame(game.animationFrameId);
          gaps.push(game.lastGaps[game.lastGaps.length - 1].px);
        }
        return { firstGap, gaps, seed: game.runSeed };
      }

      const a = collect(123456);
      const b = collect(123456);
      assertEquals(a.seed, 123456, 'replayRunSeed is the seed stored on the run');
      assertEquals(b.seed, 123456, 'a second replay stores the same seed');
      assertEquals(a.firstGap, b.firstGap, 'same seed → same first spawn gap');
      assertEquals(
        JSON.stringify(a.gaps),
        JSON.stringify(b.gaps),
        'same seed → same later spawn gaps'
      );
      assertEquals(a.gaps.length, 4, 'four spawns were recorded');
    } finally {
      restoreDebug(orig);
    }
  });

  it('death with debug on records a small JSON dump and copies it', () => {
    const orig = snapshotEnv();
    const logs = [];
    let copies;
    try {
      console.log = (...args) => logs.push(args.map(String).join(' '));
      copies = silenceClipboard();
      enableDeathLog();
      replayRunSeed(4242);
      game.mode = MODES.UPDATED;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);

      game.state = STATE.RUNNING;
      game.obstacles.length = 0;
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
      const spawnedType = game.obstacles[0].type;

      jump();
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);

      const dump = dumpRun();
      assert(dump && typeof dump === 'object', 'dumpRun() returns the death log');
      assertEquals(dump.mode, MODES.UPDATED, 'dump includes mode');
      assertEquals(dump.seed, 4242, 'dump includes the run seed');
      assertEquals(dump.score, Math.floor(game.score), 'dump score matches the run');
      assert(typeof dump.speed === 'number', 'dump includes speed');
      assert(typeof dump.nextSpawnGap === 'number', 'dump includes the next spawn gap');
      assert(
        Array.isArray(dump.lastGaps) && dump.lastGaps.length >= 1,
        'dump includes recent gaps'
      );
      const gap = dump.lastGaps[0];
      assert(typeof gap.px === 'number' && gap.px > 0, 'gap px is a positive number');
      assert(
        Number.isInteger(gap.framesApprox) && gap.framesApprox >= 1,
        'framesApprox is a positive frame count'
      );
      assertEquals(
        gap.msApprox,
        Math.round((gap.framesApprox * 1000) / 60),
        'msApprox is frames at 60fps'
      );
      const impliedPx = gap.framesApprox * dump.speed;
      assert(
        Math.abs(impliedPx - gap.px) < dump.speed * 2,
        'framesApprox is about the gap in pixels divided by speed'
      );
      assert(Array.isArray(dump.lastObstacleTypes), 'dump includes obstacle types');
      assertEquals(dump.lastObstacleTypes[0], spawnedType, 'first recorded type matches the spawn');
      assert(typeof dump.diedAtFrame === 'number', 'dump includes the death frame');
      assert(
        typeof dump.framesSinceJump === 'number' && dump.framesSinceJump >= 1,
        'dump includes frames from the last jump to the hit'
      );
      assert(
        logs.some((line) => line.includes('[rex-death-log]')),
        'death logs the JSON'
      );
      assert(copies.length >= 1 && copies[0].includes('"seed": 4242'), 'death copies the JSON');

      const viaCopy = copyDeathLog();
      assert(
        typeof viaCopy === 'string' && viaCopy.includes('"seed": 4242'),
        'copyDeathLog() returns the JSON text'
      );
    } finally {
      if (copies) copies.restore();
      restoreDebug(orig);
    }
  });

  it('debug off produces no dump and no HUD line', () => {
    const orig = snapshotEnv();
    const logs = [];
    try {
      console.log = (...args) => logs.push(args.map(String).join(' '));
      disableDeathLog();
      game.mode = MODES.UPDATED;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.obstacles.length = 0;
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
      jump();
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);

      assertEquals(game.state, STATE.DEAD, 'the run still ends on a hit');
      assertEquals(dumpRun(), null, 'dumpRun() is empty when debug is off');
      assertEquals(copyDeathLog(), null, 'copyDeathLog() is empty when debug is off');
      assertEquals(game.deathLog, null, 'no death log is stored when debug is off');
      assert(
        !logs.some((line) => line.includes('[rex-death-log]') || line.includes('"seed"')),
        'debug off does not print a dump'
      );
      assert(!game.lastGaps || game.lastGaps.length === 0, 'debug off does not keep a gap log');

      const calls = [];
      ctx.fillText = (text) => calls.push(String(text));
      drawScore();
      drawGameOverScreen();
      assert(
        !calls.some((text) => text.startsWith('dbg ') || text.includes('seed ')),
        'debug off does not draw a debug HUD line'
      );
    } finally {
      restoreDebug(orig);
    }
  });

  it('debug on draws a peripheral HUD line with mode, score, speed, gap, and seed', () => {
    const orig = snapshotEnv();
    try {
      enableDeathLog();
      replayRunSeed(77);
      game.mode = MODES.CLASSIC;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.score = 12;
      const calls = [];
      ctx.fillText = (text) => calls.push(String(text));
      drawScore();
      const line = calls.find((text) => text.startsWith('dbg '));
      assert(line, `debug HUD line missing, got: ${JSON.stringify(calls)}`);
      assert(line.includes('classic'), 'HUD shows mode');
      assert(line.includes('12'), 'HUD shows score');
      assert(line.includes('spd '), 'HUD shows speed');
      assert(line.includes('gap ' + game.nextSpawnGap), 'HUD shows the next spawn gap');
      assert(line.includes('seed 77'), 'HUD shows the run seed');
    } finally {
      restoreDebug(orig);
    }
  });

  it('?debug=1 and enableDeathLog() opt in; Key L dumps the current run', () => {
    const orig = snapshotEnv();
    let copies;
    try {
      disableDeathLog();
      global.location = { search: '?debug=1' };
      applyDebugFromLocation();
      assertEquals(isDeathLogEnabled(), true, '?debug=1 turns the death log on');
      assert(typeof window.enableDeathLog === 'function', 'DevTools hook is on window');
      assert(typeof window.dumpRun === 'function', 'dumpRun is on window');
      assert(typeof window.copyDeathLog === 'function', 'copyDeathLog is on window');
      assert(typeof window.replayRunSeed === 'function', 'replayRunSeed is on window');

      disableDeathLog();
      global.location = { search: '' };
      applyDebugFromLocation();
      assertEquals(isDeathLogEnabled(), false, 'a URL without debug=1 does not turn logging on');

      enableDeathLog();
      replayRunSeed(99);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      copies = silenceClipboard();
      const logs = [];
      console.log = (...args) => logs.push(args.map(String).join(' '));
      handleDebugKey({ code: 'KeyL' });
      const dump = dumpRun();
      assertEquals(dump.seed, 99, 'Key L snapshot carries the run seed');
      assertEquals(dump.diedAtFrame, null, 'a mid-run key dump is not marked as a death');
      assertEquals(copies.length, 1, 'Key L copies one JSON payload');

      disableDeathLog();
      handleDebugKey({ code: 'KeyL' });
      assertEquals(copies.length, 1, 'Key L does nothing while debug is off');
      assert(
        logs.some((line) => line.includes('[rex-death-log]')),
        'Key L prints the snapshot'
      );
    } finally {
      if (copies) copies.restore();
      restoreDebug(orig);
    }
  });
});

describe('Plateau cue', () => {
  // The sigmoid never reaches PLATEAU_SPEED. "Reached the plateau" is the first
  // frame speed hits PLATEAU_REACH_RATIO of that ceiling (~score 641 today).
  function plateauCrossScore() {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT, PLATEAU_REACH_RATIO } =
      GAME_CONFIG;
    const sig = (PLATEAU_REACH_RATIO * PLATEAU_SPEED - INITIAL_SPEED) / (PLATEAU_SPEED - INITIAL_SPEED);
    return RAMP_MIDPOINT - Math.log(1 / sig - 1) / RAMP_STEEPNESS;
  }

  function scoreJustBeforePlateau() {
    const cross = plateauCrossScore();
    const after = Math.ceil((cross - 1e-9) * 10) / 10;
    return after - GAME_CONFIG.SCORE_INCREMENT;
  }

  function particlesOf(kindName) {
    const kind = Particles.KINDS[kindName];
    if (!kind) return [];
    return Particles.particles.filter((p) => p.life > 0 && p.color === kind.color);
  }

  function plateauParticles() {
    return particlesOf('plateau');
  }

  function qaPlateauParticles() {
    return particlesOf('plateauQa');
  }

  function armUpdatedRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    // resetGame re-reads ?qaPlateau=1. Production cases force the flag off
    // after that so a leftover query cannot change plateau timing.
    setQaPlateau(false);
    game.state = STATE.RUNNING;
    Particles.reset();
    game.plateauCueShown = false;
    game.score = scoreJustBeforePlateau();
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
  }

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  it('marks the plateau at 98% of plateau speed, near score 640', () => {
    assertEquals(
      GAME_CONFIG.PLATEAU_REACH_RATIO,
      0.98,
      'the cue should mark 98% of plateau speed, the soft ceiling the curve approaches'
    );
    // Score ticks in 0.1 steps. Compare those frames, not the continuous
    // inverse — that inverse sits one rounding step under the threshold.
    const before = scoreJustBeforePlateau();
    const reached = before + GAME_CONFIG.SCORE_INCREMENT;
    assert(
      reached > 620 && reached < 660,
      `first reach should land near score 640 on the current curve, got ${reached}`
    );
    const threshold = GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.PLATEAU_REACH_RATIO;
    assert(
      DifficultyProfile.speedAtScore(reached) >= threshold,
      'speed on the reaching frame should be on the plateau side of the cue'
    );
    assert(
      DifficultyProfile.speedAtScore(before) < threshold,
      'the frame before should still be short of the cue'
    );
  });

  it('fires a small heel puff once when an Updated run first reaches the plateau', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      tick();

      const burst = plateauParticles();
      const kind = Particles.KINDS.plateau;
      assert(kind, 'plateau should be a particle kind, not a separate effect system');
      assert(kind.count <= 12, `plateau burst should stay small, count was ${kind.count}`);
      assert(kind.size <= 3, `plateau specks should stay small, size was ${kind.size}`);
      assertEquals(burst.length, kind.count, 'the first reach should emit one full puff');
      assert(game.plateauCueShown === true, 'the run should remember that the cue already played');
      assert(
        burst.every((p) => p.x < GAME_CONFIG.CANVAS_W / 2),
        'the puff should stay on the dino side, off the obstacle lane'
      );
      assert(
        burst.every((p) => p.y > GAME_CONFIG.CANVAS_H * 0.75),
        'the puff should stay low, not a center-screen flash'
      );

      tick();
      assertEquals(
        plateauParticles().length,
        burst.length,
        'later frames of the same run must not emit another puff'
      );
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('does not fire on the frame before the plateau', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      game.score = scoreJustBeforePlateau() - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assertEquals(plateauParticles().length, 0, 'one frame early should not cue');
      assert(!game.plateauCueShown, 'an early frame must not consume the once-per-run cue');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('does not fire in Classic', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.CLASSIC);
      tick();
      tick();
      assertEquals(plateauParticles().length, 0, 'Classic should never show the plateau cue');
      assert(!game.plateauCueShown, 'Classic should not latch a cue it did not show');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('fires in Daily, which shares Updated atmosphere', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.DAILY);
      tick();
      assert(plateauParticles().length > 0, 'Daily should show the same once-per-run plateau cue');
      assert(game.plateauCueShown === true, 'Daily should latch the cue after the first reach');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('can fire again on the next run', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      tick();
      assert(game.plateauCueShown === true, 'first run should latch the cue');

      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assert(game.plateauCueShown === false, 'resetGame should clear the cue for the next run');

      game.state = STATE.RUNNING;
      Particles.reset();
      game.score = scoreJustBeforePlateau();
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      tick();
      assert(plateauParticles().length > 0, 'the next run should cue on its own first reach');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('damps the puff when the player prefers reduced motion', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(true);
      armUpdatedRun(MODES.UPDATED);
      tick();
      const burst = plateauParticles();
      const kind = Particles.KINDS.plateau;
      assert(kind, 'plateau kind should exist before reduced-motion can damp it');
      assert(burst.length > 0, 'reduced motion still acknowledges the reach');
      assert(
        burst.length < kind.count,
        `reduced motion should damp the puff below ${kind.count}, got ${burst.length}`
      );
      assert(
        burst.every((p) => p.maxLife < kind.life),
        'reduced motion should also shorten the puff'
      );
      assert(game.plateauCueShown === true, 'the damped puff still counts as the one cue for the run');
      tick();
      assertEquals(plateauParticles().length, burst.length, 'reduced motion must not repeat the cue');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('recognizes only ?qaPlateau=1', () => {
    assert(readQaPlateauFlag('?qaPlateau=1') === true, '?qaPlateau=1 should enable the QA cue');
    assert(readQaPlateauFlag('?foo=1&qaPlateau=1') === true, 'the flag should work alongside other params');
    assert(readQaPlateauFlag('') === false, 'a normal visit should leave the QA cue off');
    assert(readQaPlateauFlag('?qaPlateau=0') === false, 'only the value 1 enables the QA cue');
    assert(readQaPlateauFlag('?qaPlateau=12') === false, 'qaPlateau=12 must not count as the flag');
    assert(readQaPlateauFlag('?other=1') === false, 'an unrelated param must not enable the QA cue');
  });

  it('with ?qaPlateau=1 fires a darker puff once as soon as the run starts', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      setQaPlateau(true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();

      const kind = Particles.KINDS.plateauQa;
      const night = Particles.KINDS.plateau;
      assertEquals(night.color, '#c5d4e4', 'production night puff color stays pale');
      assertEquals(night.size, 2, 'production night puff stays small');
      assertEquals(night.count, 4, 'production night puff is the quieter 4-mote heel puff');
      assertEquals(night.alpha, 0.45, 'production night puff keeps the soft pale ink');
      assertEquals(kind.color, '#3d4f63', 'QA puff should be dark enough to read on the day sky');
      assertEquals(kind.size, 2, 'QA speck stays as small as the production puff');
      assertEquals(kind.count, 4, 'QA puff uses the same quieter mote count');

      const burst = qaPlateauParticles();
      assertEquals(burst.length, kind.count, 'QA flag should emit the visible day puff');
      assert(burst.every((p) => p.size === kind.size), 'QA specks should use the larger size');
      assert(burst.every((p) => p.x < dino.x), 'QA puff should sit just behind the sprite, not under it');
      assertEquals(plateauParticles().length, 0, 'QA should not also emit the pale night puff');
      assert(game.plateauCueShown === true, 'QA cue still latches after the first puff');
      assert(game.score <= QA_PLATEAU_SCORE + 0.2, 'QA cue should fire at the start of the run');

      tick();
      assertEquals(qaPlateauParticles().length, burst.length, 'QA cue must not repeat later in the run');
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('with ?qaPlateau=1 still does not fire in Classic', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.CLASSIC);
      setQaPlateau(true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      tick();
      assertEquals(plateauParticles().length, 0, 'Classic should ignore the QA flag');
      assertEquals(qaPlateauParticles().length, 0, 'Classic should not show the day QA puff either');
      assert(!game.plateauCueShown, 'Classic should not latch a QA cue it did not show');
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('with ?qaPlateau=1 also fires early in Daily', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.DAILY);
      setQaPlateau(true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assert(qaPlateauParticles().length > 0, 'Daily should show the early QA puff');
      assertEquals(plateauParticles().length, 0, 'Daily QA should use the day puff, not the night one');
      assert(game.plateauCueShown === true, 'Daily QA cue should still latch');
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('resetGame re-reads ?qaPlateau=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    global.location = { search: '?qaPlateau=1' };
    try {
      setQaPlateau(false);
      game.mode = MODES.UPDATED;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      Particles.reset();
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      dino.y = GAME_CONFIG.CANVAS_H - dino.height;
      dino.isJumping = false;
      tick();
      assert(qaPlateauParticles().length > 0, 'resetGame should arm the QA puff from location.search');
      assert(game.plateauCueShown === true, 'the re-read flag should still latch after one puff');
    } finally {
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      setQaPlateau(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('without the QA flag a low score does not fire the cue', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      setQaPlateau(false);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assertEquals(plateauParticles().length, 0, 'production timing should still wait for the plateau');
      assertEquals(qaPlateauParticles().length, 0, 'a normal visit should not show the day QA puff');
      assert(!game.plateauCueShown, 'an early production frame must not consume the cue');
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });
});

describe('Quiet plateau cue', () => {
  // The old puff was 8 motes living 24 frames and flung ±0.6px. Gravity
  // never caught the rise, so it climbed about 18px and drifted 17px toward
  // the lane. The quieter cue keeps the cool pale color and a 2px speck,
  // with fewer motes, a shorter life, a tighter spread, and soft ink, so
  // it dies at the heel.
  const PUFF = {
    count: 4,
    color: '#c5d4e4',
    size: 2,
    life: 12,
    alpha: 0.45,
    vyMin: -0.9,
    vyMax: -0.4,
    vxSpread: 0.3,
    gravity: 0.06,
  };
  const QA = {
    count: 4,
    color: '#3d4f63',
    size: 2,
    life: 40,
    vyMin: -0.2,
    vyMax: -0.08,
    vxSpread: 0.08,
    gravity: 0.002,
  };
  const UNCHANGED_KINDS = {
    jump:      { count: 3,  color: '#9c8770', size: 3, life: 8, alpha: 0.5, vyMin: -1.2, vyMax: -0.4, vxSpread: 0.6, gravity: 0.10 },
    land:      { count: 5,  color: '#9c8770', size: 3, life: 8, alpha: 0.4, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.7, gravity: 0.12 },
    trail:     { count: 1,  color: 'rgba(150,150,150,0.28)', size: 2, life: 6, vyMin: -0.1, vyMax: 0.1, vxSpread: 0.2, gravity: 0 },
    collision: { count: 5,  color: '#d04a2a', size: 3, life: 8, vyMin: -1.2, vyMax: 0.4, vxSpread: 0.7, gravity: 0.10 },
    confetti:  { count: 6, color: '#ffd700', size: 3, life: 12, alpha: 0.7, vyMin: -1.6, vyMax: -0.5, vxSpread: 0.7, gravity: 0.10 },
  };

  function stepPath(vy0, kind) {
    let y = 0;
    let vy = vy0;
    let min = 0;
    let max = 0;
    for (let i = 0; i < kind.life; i++) {
      y += vy;
      if (y < min) min = y;
      if (y > max) max = y;
      vy += kind.gravity;
    }
    return { min: min, max: max };
  }

  function footReach(kind) {
    return kind.vxSpread * kind.life + cfg('PARTICLE_EMIT_SPREAD') / 2 + kind.size / 2;
  }

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaPlateau(false);
    setQaNight(false);
    game.state = STATE.RUNNING;
    Particles.reset();
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
  }

  function spyRects() {
    const calls = [];
    const orig = ctx.fillRect;
    ctx.fillRect = function (x, y, w, h) {
      calls.push({ style: ctx.fillStyle, x: x, y: y, w: w, h: h, alpha: ctx.globalAlpha });
    };
    return {
      calls: calls,
      restore() { ctx.fillRect = orig; },
    };
  }

  it('keeps the pale puff a short cool breath at the heel', () => {
    const kind = Particles.KINDS.plateau;
    for (const key of Object.keys(PUFF)) {
      assertEquals(kind[key], PUFF[key], 'plateau ' + key + ' is the quieter heel puff');
    }
    assert(kind.count < 8, 'fewer motes than the old 8-mote puff');
    assert(kind.life < 24, 'shorter than the old 24-frame climb');
    assert(kind.vxSpread < 0.6, 'tighter than the old ±0.6 spread');
    assert(kind.alpha < 0.5 && kind.alpha >= 0.4, 'soft ink, still readable on the night sky');
    assertEquals(kind.color, '#c5d4e4', 'night puff stays cool and pale');
    assertEquals(kind.size, 2, 'the speck stays a readable 2px');

    const fast = stepPath(kind.vyMin, kind);
    const slow = stepPath(kind.vyMax, kind);
    assert(footReach(kind) <= 8, 'a full life stays at the heel, off the obstacle lane');
    assert(-fast.min <= 8, 'the puff does not climb into the cactus band');
    assert(-fast.min >= 5, 'the puff still lifts enough to read at the ankle');
    assert(slow.max <= 1, 'the slow mote does not fall through the ground');
    assert(footReach(kind) < GAME_CONFIG.DINO_WIDTH / 2, 'the puff stays on the rear of the dino');

    const qa = Particles.KINDS.plateauQa;
    for (const key of Object.keys(QA)) {
      assertEquals(qa[key], QA[key], 'plateauQa ' + key + ' stays the dark day capture');
    }
    assertEquals(qa.alpha, undefined, 'the day capture stays full ink so it reads on white');
    assert(footReach(qa) <= 10, 'the long QA life still stays at the heel');
    assert(stepPath(qa.vyMin, qa).max <= 1, 'the QA puff does not fall off the heel');

    for (const name of Object.keys(UNCHANGED_KINDS)) {
      const got = Particles.KINDS[name];
      const want = UNCHANGED_KINDS[name];
      for (const key of Object.keys(want)) {
        assertEquals(got[key], want[key], name + ' ' + key + ' stays unchanged');
      }
    }
  });

  it('paints the soft alpha onto the pale motes', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      Particles.reset();
      const n = Particles.emit('plateau', 20, 180);
      assertEquals(n, PUFF.count, 'an open pool emits the full quieter puff');
      const motes = Particles.particles.filter((p) => p.life > 0 && p.color === PUFF.color);
      assertEquals(motes.length, PUFF.count, 'the pool holds the quieter puff');
      motes.forEach((p) => {
        assertEquals(p.alpha, PUFF.alpha, 'each mote keeps the soft peak ink');
        assertEquals(p.maxLife, PUFF.life, 'each mote fades across the short life');
      });
      const alphas = [];
      const orig = ctx.fillRect;
      ctx.fillRect = () => { alphas.push(ctx.globalAlpha); };
      Particles.draw();
      ctx.fillRect = orig;
      assertEquals(alphas.length, PUFF.count, 'every mote paints');
      assert(alphas.every((a) => a === PUFF.alpha), 'the first frame paints the soft peak, not solid ink');
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('?qaPlateau=1 still paints the heel cluster when the pool is full', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armRun(MODES.UPDATED);
      setQaPlateau(true);
      Particles.particles.forEach((p) => {
        p.life = 5;
        p.color = '#111111';
      });
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assertEquals(
        Particles.particles.filter((p) => p.color === QA.color).length,
        0,
        'a full pool emits no dark motes'
      );
      assertEquals(game.qaPlateauHold, QA_PLATEAU_HOLD, 'the hold latches for the capture window');
      const spy = spyRects();
      drawQaPlateau();
      const marks = qaPlateauMarks();
      const fills = spy.calls.filter((c) => c.style === QA.color);
      assertEquals(fills.length, marks.length, 'the hold paints every heel speck');
      fills.forEach((fill, i) => {
        assertEquals(fill.x, marks[i].x, 'held speck ' + i + ' stays at the heel');
        assertEquals(fill.y, marks[i].y, 'held speck ' + i + ' stays low');
        assertEquals(fill.w, QA_PLATEAU_SIZE, 'held speck stays a small mark');
        assertEquals(fill.alpha, 1, 'the capture mark is opaque');
        assert(fill.x < dino.x, 'the capture sits behind the sprite, off the lane');
      });
      const rims = spy.calls.filter((c) => c.style === QA_PLATEAU_RIM);
      assertEquals(rims.length, marks.length, 'each speck has a rim so it reads on the day sky');
      spy.restore();
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaPlateau=1 with night paints the pale production color', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armRun(MODES.UPDATED);
      setQaPlateau(true);
      setQaNight(true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      const pale = Particles.particles.filter((p) => p.life > 0 && p.color === PUFF.color);
      assertEquals(pale.length, PUFF.count, 'night QA emits the quieter pale puff');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === QA.color).length,
        0,
        'night QA does not also emit the dark day puff'
      );
      assertEquals(qaPlateauFill(), PUFF.color, 'the hold uses the cool pale production color');
      const spy = spyRects();
      drawQaPlateau();
      const fills = spy.calls.filter((c) => c.style === PUFF.color);
      assertEquals(fills.length, qaPlateauMarks().length, 'night capture paints the pale heel cluster');
      assert(fills.every((fill) => fill.x < dino.x), 'the pale cluster stays behind the sprite');
      spy.restore();
    } finally {
      setQaPlateau(false);
      setQaNight(false);
      setReducedMotion(false);
      game.mode = origMode;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaPlateau=1 paints no heel cluster', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armRun(MODES.CLASSIC);
      setQaPlateau(true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      tick();
      const spy = spyRects();
      drawQaPlateau();
      assertEquals(spy.calls.length, 0, 'Classic never paints the plateau capture');
      spy.restore();
      assertEquals(game.qaPlateauHold, 0, 'Classic does not start the hold');
      assert(!game.plateauCueShown, 'Classic does not latch the cue');
    } finally {
      setQaPlateau(false);
      setReducedMotion(false);
      game.mode = origMode;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion damps the puff and the capture hold', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      const fullMarks = qaPlateauMarks().length;
      assert(fullMarks > 1, 'motion-on capture is a cluster, not one speck');
      for (const night of [false, true]) {
        setReducedMotion(true);
        armRun(night ? MODES.DAILY : MODES.UPDATED);
        setQaPlateau(true);
        setQaNight(night);
        game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
        tick();
        const color = night ? PUFF.color : QA.color;
        const kind = night ? PUFF : QA;
        const motes = Particles.particles.filter((p) => p.life > 0 && p.color === color);
        const expectedCount = Math.max(1, Math.round(kind.count * 0.25));
        const expectedLife = Math.max(2, Math.round(kind.life * 0.5));
        assertEquals(motes.length, expectedCount, (night ? 'night' : 'day') + ' reduced motion still quarters the puff');
        assert(expectedCount < kind.count, (night ? 'night' : 'day') + ' damped puff is fewer motes');
        assert(motes.every((p) => p.maxLife === expectedLife), (night ? 'night' : 'day') + ' reduced motion still halves life');
        assertEquals(game.qaPlateauHold, qaPlateauHoldFrames(), (night ? 'night' : 'day') + ' hold uses the shorter window');
        assert(game.qaPlateauHold < QA_PLATEAU_HOLD, (night ? 'night' : 'day') + ' hold is shorter than the full capture');
        const spy = spyRects();
        drawQaPlateau();
        const fills = spy.calls.filter((c) => c.style === color);
        assertEquals(fills.length, qaPlateauMarks().length, (night ? 'night' : 'day') + ' hold paints the damped speck count');
        assert(fills.length < fullMarks, (night ? 'night' : 'day') + ' hold is not the full cluster');
        assert(fills.every((fill) => fill.alpha === PUFF.alpha), (night ? 'night' : 'day') + ' hold ink is softer than solid');
        assert(fills.every((fill) => fill.alpha < 1), (night ? 'night' : 'day') + ' hold is not full ink');
        spy.restore();
      }
    } finally {
      setQaPlateau(false);
      setQaNight(false);
      setReducedMotion(false);
      game.mode = origMode;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Daily pre-run framing', () => {
  const STEM = 'Same course as everyone today';
  const preRunLine = () => STEM + ' · #' + dailyNumber();

  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) => calls.push({ text: String(text), x, y, font: ctx.font, fillStyle: ctx.fillStyle });
    draw();
    ctx.fillText = origFill;
    return calls;
  }

  function overlayCalls() {
    return captureFillText(drawGetReadyOverlay);
  }

  function withDailyWaiting(graceFrames, draw) {
    const orig = {
      mode: game.mode,
      state: game.state,
      grace: game.graceFrames,
      skip: game.countdownSkippable,
      frame: game.animFrame,
    };
    game.mode = MODES.DAILY;
    game.state = STATE.WAITING;
    game.graceFrames = graceFrames;
    game.countdownSkippable = false;
    game.animFrame = 0;
    const calls = draw();
    game.mode = orig.mode;
    game.state = orig.state;
    game.graceFrames = orig.grace;
    game.countdownSkippable = orig.skip;
    game.animFrame = orig.frame;
    return calls;
  }

  it('Daily GET READY shows a short shared-course line', () => {
    const calls = withDailyWaiting(GAME_CONFIG.GRACE_FRAMES, overlayCalls);
    const line = calls.find((c) => c.text === preRunLine());
    assert(line, `Daily WAITING should show the shared-run line, got: ${JSON.stringify(calls.map((c) => c.text))}`);
    assertEquals(line.text, STEM + ' · #' + dailyNumber(),
      'the shared-course line should name today’s daily number');
    assert(!line.text.includes('📅'), 'the pre-run line stays quiet, without the Game Over badge');
    assert(calls.some((c) => c.text === 'GET READY'), 'GET READY should stay on the overlay');
    assert(line.y > GAME_CONFIG.SCORE_Y, 'the line should sit with the overlay, not in the score HUD');
    assert(line.y < GAME_CONFIG.CANVAS_H - GAME_CONFIG.DINO_HEIGHT, 'the line should stay above the dino');
  });

  it('Daily countdown still shows the line, and the text does not pulse', () => {
    const early = withDailyWaiting(GAME_CONFIG.GRACE_FRAMES, overlayCalls);
    const late = withDailyWaiting(40, () => {
      game.animFrame = 90;
      return overlayCalls();
    });
    const earlyLine = early.find((c) => c.text === preRunLine());
    const lateLine = late.find((c) => c.text === preRunLine());
    assert(late.some((c) => c.text !== 'GET READY' && c.text !== preRunLine()),
      `countdown phase should still draw a count, got: ${JSON.stringify(late.map((c) => c.text))}`);
    assert(lateLine, 'the shared-run line should stay through the countdown');
    assertEquals(lateLine.fillStyle, earlyLine.fillStyle, 'the line should stay static when frames advance');
    assertEquals(lateLine.font, earlyLine.font, 'the line should not scale or pulse');
  });

  it('Classic and Updated WAITING do not show the line', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      grace: game.graceFrames,
    };
    game.state = STATE.WAITING;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;

    game.mode = MODES.CLASSIC;
    const classic = overlayCalls();
    game.mode = MODES.UPDATED;
    const updated = overlayCalls();

    game.mode = orig.mode;
    game.state = orig.state;
    game.graceFrames = orig.grace;

    assert(!classic.some((c) => c.text === preRunLine() || c.text.includes(STEM)),
      `Classic must not show Daily framing, got: ${JSON.stringify(classic.map((c) => c.text))}`);
    assert(!updated.some((c) => c.text === preRunLine() || c.text.includes(STEM)),
      `Updated must not show Daily framing, got: ${JSON.stringify(updated.map((c) => c.text))}`);
    assert(classic.some((c) => c.text === 'GET READY'), 'Classic GET READY should be unchanged');
    assert(updated.some((c) => c.text === 'GET READY'), 'Updated GET READY should be unchanged');
  });

  it('a Daily RUNNING frame does not paint the line, and Game Over keeps TODAY BEST', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      grace: game.graceFrames,
      skip: game.countdownSkippable,
      best: game.dailyBest,
      anim: Animations.deathAnimFrame,
      hs: game.highScore,
      lastX: game.lastObstacleX,
      gap: game.nextSpawnGap,
      obstacles: game.obstacles.slice(),
    };
    game.mode = MODES.DAILY;
    game.state = STATE.RUNNING;
    game.score = 10;
    game.graceFrames = 0;
    game.dailyBest = 500;
    game.highScore = 900;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;

    const running = captureFillText(() => STATE_HANDLERS[STATE.RUNNING]());
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);

    game.state = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    const over = captureFillText(drawGameOverScreen);

    game.mode = orig.mode;
    game.state = orig.state;
    game.score = orig.score;
    game.graceFrames = orig.grace;
    game.countdownSkippable = orig.skip;
    game.dailyBest = orig.best;
    Animations.deathAnimFrame = orig.anim;
    game.highScore = orig.hs;
    game.lastObstacleX = orig.lastX;
    game.nextSpawnGap = orig.gap;
    game.obstacles.length = 0;
    orig.obstacles.forEach((o) => game.obstacles.push(o));

    assert(!running.some((c) => c.text === preRunLine()),
      `RUNNING must not show the shared-run line, got: ${JSON.stringify(running.map((c) => c.text))}`);
    assert(!running.some((c) => c.text.includes('TODAY') || c.text.includes('#' + dailyNumber()) || c.text.includes('DAILY')),
      `RUNNING must not grow a Daily #N or TODAY HUD, got: ${JSON.stringify(running.map((c) => c.text))}`);
    assert(!over.some((c) => c.text === preRunLine()),
      `Game Over should keep its own result screen, got: ${JSON.stringify(over.map((c) => c.text))}`);
    assert(over.some((c) => c.text === 'TODAY BEST'), 'Game Over should still show TODAY BEST');
  });

  it('the screen reader hears the line only when a Daily countdown starts', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      skip: game.countdownSkippable,
      text: a11yLive.textContent,
    };

    game.mode = MODES.UPDATED;
    game.countdownSkippable = false;
    game.state = STATE.WAITING;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const updated = a11yLive.textContent;

    game.mode = MODES.DAILY;
    game.countdownSkippable = false;
    game.state = STATE.WAITING;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const daily = a11yLive.textContent;

    game.mode = orig.mode;
    game.state = orig.state;
    game.countdownSkippable = orig.skip;
    a11yLive.textContent = orig.text;

    assert(!updated.includes(STEM), `Updated countdown must stay quiet, got: ${updated}`);
    assert(!updated.includes('#' + dailyNumber()), `Updated countdown must not announce a daily number, got: ${updated}`);
    assert(daily.includes('Get ready'), `Daily countdown should still say get ready, got: ${daily}`);
    assert(daily.includes(preRunLine()), `Daily countdown should mention the shared course and #N, got: ${daily}`);
  });

  it('the Daily button announces the shared course, and leaving does not', () => {
    const origMode = game.mode;
    const origText = a11yLive.textContent;
    const btn = document.getElementById('daily-btn');
    const handler = btn && btn._listeners && btn._listeners.click && btn._listeners.click[0];
    assert(typeof handler === 'function', 'daily button must register a click handler');
    const ariaLabels = [];
    const origSet = btn.setAttribute.bind(btn);
    btn.setAttribute = (name, value) => {
      if (name === 'aria-label') ariaLabels.push(String(value));
      origSet(name, value);
    };
    game.mode = MODES.UPDATED;
    handler({ stopPropagation() {} });
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const entered = a11yLive.textContent;

    handler({ stopPropagation() {} });
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const left = a11yLive.textContent;
    btn.setAttribute = origSet;

    game.mode = origMode;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    a11yLive.textContent = origText;

    assert(/Daily challenge #\d+/.test(entered), `entering Daily should name the challenge, got: ${entered}`);
    assert(entered.includes(preRunLine()), `entering Daily should mention the shared course and #N, got: ${entered}`);
    assert(!left.includes(STEM), `leaving Daily must drop the shared-course line, got: ${left}`);
    assert(left.includes('Updated mode'), `leaving Daily should announce Updated mode, got: ${left}`);
    assertEquals(btn.textContent, '📅 #' + dailyNumber(),
      'the Daily button keeps the calendar and today #N');
    assertEquals(
      ariaLabels.join('|'),
      'Leave daily challenge #' + dailyNumber() + '|Daily challenge #' + dailyNumber(),
      'entering and leaving name today #N'
    );
  });
});

describe('Daily button shows today number', () => {
  function face() {
    return '📅 #' + dailyNumber();
  }

  function spyButton(btn) {
    const seen = [];
    const origSet = btn.setAttribute.bind(btn);
    btn.setAttribute = (name, value) => {
      if (name === 'aria-label' || name === 'aria-pressed') seen.push(name + '=' + value);
      origSet(name, value);
    };
    return {
      seen,
      restore() { btn.setAttribute = origSet; },
    };
  }

  it('shows today #N on the calendar control before you enter', () => {
    const btn = document.getElementById('daily-btn');
    const origMode = game.mode;
    const spy = spyButton(btn);
    try {
      game.mode = MODES.CLASSIC;
      refreshDailyButton();
      assertEquals(btn.textContent, face(), 'Classic shows today #N on the Daily button');
      assert(spy.seen.includes('aria-pressed=false'), 'Classic leaves the Daily button unpressed');
      assert(spy.seen.includes('aria-label=Daily challenge #' + dailyNumber()),
        'Classic names the challenge and today #N, got: ' + spy.seen.join('|'));

      spy.seen.length = 0;
      game.mode = MODES.UPDATED;
      refreshDailyButton();
      assertEquals(btn.textContent, face(), 'Updated shows today #N on the Daily button');
      assert(spy.seen.includes('aria-pressed=false'), 'Updated leaves the Daily button unpressed');
      assertEquals(
        spy.seen.filter((entry) => entry.startsWith('aria-label=')).pop(),
        'aria-label=Daily challenge #' + dailyNumber(),
        'Updated keeps the inactive Daily label'
      );

      spy.seen.length = 0;
      game.mode = MODES.DAILY;
      refreshDailyButton();
      assertEquals(btn.textContent, face(), 'an open Daily run keeps #N on the button');
      assert(spy.seen.includes('aria-pressed=true'), 'Daily presses the calendar control');
      assertEquals(
        spy.seen.filter((entry) => entry.startsWith('aria-label=')).pop(),
        'aria-label=Leave daily challenge #' + dailyNumber(),
        'the pressed label still names today #N'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof refreshDailyButton === 'function') refreshDailyButton();
    }
  });
});

describe('Daily death-screen hint', () => {
  const HINT = 'Share TODAY BEST with Copy result';
  const preRunLine = () => 'Same course as everyone today · #' + dailyNumber();

  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) => calls.push({
      text: String(text),
      x,
      y,
      font: ctx.font,
      fillStyle: ctx.fillStyle,
    });
    draw();
    ctx.fillText = origFill;
    return calls;
  }

  function withGameOver(mode, extras, draw) {
    const shareBtn = document.getElementById('share-btn');
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      best: game.dailyBest,
      hs: game.highScore,
      newBest: game.isNewBest,
      prev: game.previousHighScore,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
      flash: Animations.copyFlashFrames,
      frame: game.animFrame,
      btnStyle: shareBtn.style,
      btnText: shareBtn.textContent,
    };
    game.mode = mode;
    game.state = STATE.DEAD;
    game.score = 120;
    game.dailyBest = 500;
    game.highScore = 900;
    game.isNewBest = false;
    game.previousHighScore = 800;
    game.isNewTodayBest = false;
    game.previousDailyBest = 0;
    Animations.copyFlashFrames = 0;
    game.animFrame = 0;
    shareBtn.style = { display: 'none' };
    shareBtn.textContent = '📋 Copy result';
    if (extras) extras();
    const calls = draw();
    const button = { display: shareBtn.style.display, text: shareBtn.textContent };
    game.mode = orig.mode;
    game.state = orig.state;
    game.score = orig.score;
    game.dailyBest = orig.best;
    game.highScore = orig.hs;
    game.isNewBest = orig.newBest;
    game.previousHighScore = orig.prev;
    game.isNewTodayBest = orig.newToday;
    game.previousDailyBest = orig.prevDaily;
    Animations.deathAnimFrame = orig.anim;
    Animations.copyFlashFrames = orig.flash;
    game.animFrame = orig.frame;
    if (orig.btnStyle === undefined) delete shareBtn.style;
    else shareBtn.style = orig.btnStyle;
    shareBtn.textContent = orig.btnText;
    return { calls, button };
  }

  it('settled Daily Game Over points at TODAY BEST and Copy result', () => {
    let shared = '';
    const { calls, button } = withGameOver(MODES.DAILY, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    }, () => {
      const drawn = captureFillText(drawGameOverScreen);
      shared = shareDailyResult();
      return drawn;
    });
    const hint = calls.find((c) => c.text === HINT);
    assert(hint, `Daily Game Over should nudge toward sharing, got: ${JSON.stringify(calls.map((c) => c.text))}`);
    assert(calls.some((c) => c.text === 'TODAY BEST'), 'TODAY BEST should stay on the death screen');
    assert(calls.some((c) => c.text === '00500'), 'the today-best score should stay on the death screen');
    assert(!calls.some((c) => c.text === preRunLine()), 'the pre-run line should stay off Game Over');
    assertEquals(hint.y, GAME_CONFIG.CANVAS_H - 16, 'the hint should sit on the bottom edge, under the scores');
    assertEquals(button.display, 'block', 'Copy result should still appear once the count-up finishes');
    assertEquals(button.text, '📋 Copy result', 'the share button label should stay Copy result');
    assert(shared.includes('500'), 'Share result should still include the daily best');
  });

  it('the hint stays static, including when motion is reduced and after a copy', () => {
    const first = withGameOver(MODES.DAILY, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      setReducedMotion(false);
    }, () => captureFillText(drawGameOverScreen));
    const later = withGameOver(MODES.DAILY, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      game.animFrame = 90;
      setReducedMotion(true);
    }, () => captureFillText(drawGameOverScreen));
    const copied = withGameOver(MODES.DAILY, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      Animations.copyFlashFrames = 40;
      setReducedMotion(true);
    }, () => captureFillText(drawGameOverScreen));
    setReducedMotion(false);

    const a = first.calls.find((c) => c.text === HINT);
    const b = later.calls.find((c) => c.text === HINT);
    const c = copied.calls.find((c) => c.text === HINT);
    assert(a && b && c, 'the hint should stay up after the count-up, with or without motion');
    assertEquals(b.fillStyle, a.fillStyle, 'the hint should not pulse');
    assertEquals(b.font, a.font, 'the hint should not scale');
    assertEquals(c.text, HINT, 'a copy flash should not replace the hint');
    assertEquals(copied.button.text, '✓ Copied!', 'Copy result should still flash Copied');
  });

  it('the hint waits until the score count-up finishes', () => {
    const mid = withGameOver(MODES.DAILY, () => {
      Animations.deathAnimFrame = 0;
    }, () => captureFillText(drawGameOverScreen));
    assert(!mid.calls.some((c) => c.text === HINT),
      `the hint should wait for the settled screen, got: ${JSON.stringify(mid.calls.map((c) => c.text))}`);
    assertEquals(mid.button.display, 'none', 'Copy result should still wait for the count-up');
  });

  it('Classic and Updated Game Over do not show the Daily hint', () => {
    const classic = withGameOver(MODES.CLASSIC, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    }, () => captureFillText(drawGameOverScreen));
    const updated = withGameOver(MODES.UPDATED, () => {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    }, () => captureFillText(drawGameOverScreen));

    assert(!classic.calls.some((c) => c.text === HINT),
      `Classic Game Over must stay free of the Daily hint, got: ${JSON.stringify(classic.calls.map((c) => c.text))}`);
    assert(!updated.calls.some((c) => c.text === HINT),
      `Updated Game Over must stay free of the Daily hint, got: ${JSON.stringify(updated.calls.map((c) => c.text))}`);
    assert(classic.calls.some((c) => c.text === 'Tap / Press Space to Restart'),
      'Classic should keep its restart line');
    assert(updated.calls.some((c) => c.text === 'YOUR BEST'),
      'Updated should keep the free-play best comparison');
    assertEquals(classic.button.display, 'none', 'Classic must not reveal Copy result');
    assertEquals(updated.button.display, 'none', 'Updated must not reveal Copy result');
  });

  it('WAITING and RUNNING do not show the death hint', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      best: game.dailyBest,
      grace: game.graceFrames,
      skip: game.countdownSkippable,
      pop: Animations.scorePopFrames,
      anim: Animations.deathAnimFrame,
    };
    game.mode = MODES.DAILY;
    game.score = 42;
    game.dailyBest = 500;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    game.countdownSkippable = false;
    Animations.scorePopFrames = 0;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    game.state = STATE.WAITING;
    const waiting = captureFillText(drawGetReadyOverlay);
    game.state = STATE.RUNNING;
    const running = captureFillText(drawScore);

    game.mode = orig.mode;
    game.state = orig.state;
    game.score = orig.score;
    game.dailyBest = orig.best;
    game.graceFrames = orig.grace;
    game.countdownSkippable = orig.skip;
    Animations.scorePopFrames = orig.pop;
    Animations.deathAnimFrame = orig.anim;

    assert(!waiting.some((c) => c.text === HINT),
      `WAITING should keep the pre-run line only, got: ${JSON.stringify(waiting.map((c) => c.text))}`);
    assert(waiting.some((c) => c.text === preRunLine()), 'the pre-run shared-course line should stay');
    assert(!running.some((c) => c.text === HINT || c.text.includes('TODAY')),
      `RUNNING HUD must stay score-only, got: ${JSON.stringify(running.map((c) => c.text))}`);
  });

  it('only a Daily death tells the screen reader to share TODAY BEST', () => {
    function dieIn(mode) {
      const orig = {
        mode: game.mode,
        state: game.state,
        score: game.score,
        best: game.dailyBest,
        hs: game.highScore,
        speed: game.currentSpeed,
        lastX: game.lastObstacleX,
        gap: game.nextSpawnGap,
        obstacles: game.obstacles.slice(),
        text: a11yLive.textContent,
        storedHs: localStorage.getItem('dino-high-score'),
        storedBest: localStorage.getItem('dino-daily-best'),
        storedDate: localStorage.getItem('dino-daily-date'),
      };
      game.mode = mode;
      game.state = STATE.RUNNING;
      game.score = 40;
      game.dailyBest = 10;
      game.highScore = 80;
      game.currentSpeed = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      game.obstacles.length = 0;
      game.obstacles.push({
        x: dino.x,
        y: dino.y,
        width: dino.width,
        height: dino.height,
      });
      dino.isJumping = false;
      a11yLive.textContent = '';
      STATE_HANDLERS[STATE.RUNNING]();
      const heard = a11yLive.textContent;

      game.mode = orig.mode;
      game.state = orig.state;
      game.score = orig.score;
      game.dailyBest = orig.best;
      game.highScore = orig.hs;
      game.currentSpeed = orig.speed;
      game.lastObstacleX = orig.lastX;
      game.nextSpawnGap = orig.gap;
      game.obstacles.length = 0;
      orig.obstacles.forEach((o) => game.obstacles.push(o));
      a11yLive.textContent = orig.text;
      if (orig.storedHs === null) localStorage.removeItem('dino-high-score');
      else localStorage.setItem('dino-high-score', orig.storedHs);
      if (orig.storedBest === null) localStorage.removeItem('dino-daily-best');
      else localStorage.setItem('dino-daily-best', orig.storedBest);
      if (orig.storedDate === null) localStorage.removeItem('dino-daily-date');
      else localStorage.setItem('dino-daily-date', orig.storedDate);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      return heard;
    }

    const daily = dieIn(MODES.DAILY);
    const classic = dieIn(MODES.CLASSIC);

    assert(daily.includes(HINT), `Daily death should mention the share hint, got: ${daily}`);
    assert(daily.includes('New today best'),
      `A Daily death that beats today best should announce the celebration, got: ${daily}`);
    assert(!classic.includes(HINT), `Classic death must not mention the Daily hint, got: ${classic}`);
    assert(classic.includes('High score'), `Classic death should keep the high-score line, got: ${classic}`);
  });
});

describe('Daily new today best celebration', () => {
  const HINT = 'Share TODAY BEST with Copy result';
  const CELEBRATION = '★  NEW TODAY BEST  ★';

  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) => calls.push({
      text: String(text),
      x,
      y,
      font: ctx.font,
      fillStyle: ctx.fillStyle,
    });
    draw();
    ctx.fillText = origFill;
    return calls;
  }

  function snapshotStorage() {
    return {
      hs: localStorage.getItem('dino-high-score'),
      best: localStorage.getItem('dino-daily-best'),
      date: localStorage.getItem('dino-daily-date'),
    };
  }

  function restoreStorage(stored) {
    if (stored.hs === null) localStorage.removeItem('dino-high-score');
    else localStorage.setItem('dino-high-score', stored.hs);
    if (stored.best === null) localStorage.removeItem('dino-daily-best');
    else localStorage.setItem('dino-daily-best', stored.best);
    if (stored.date === null) localStorage.removeItem('dino-daily-date');
    else localStorage.setItem('dino-daily-date', stored.date);
  }

  // Collide once and draw the settled Game Over screen. Score ticks by
  // SCORE_INCREMENT inside the running frame before the hit is resolved.
  function dieAndDraw(mode, { score, dailyBest, highScore }) {
    const shareBtn = document.getElementById('share-btn');
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      best: game.dailyBest,
      hs: game.highScore,
      newBest: game.isNewBest,
      prev: game.previousHighScore,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      speed: game.currentSpeed,
      lastX: game.lastObstacleX,
      gap: game.nextSpawnGap,
      obstacles: game.obstacles.slice(),
      text: a11yLive.textContent,
      anim: Animations.deathAnimFrame,
      shake: Animations.deathShakeFrames,
      flash: Animations.deathFlashFrames,
      pop: Animations.scorePopFrames,
      copy: Animations.copyFlashFrames,
      btnStyle: shareBtn.style,
      btnText: shareBtn.textContent,
    };
    const stored = snapshotStorage();
    if (dailyBest > 0) {
      localStorage.setItem('dino-daily-date', String(dailySeed()));
      localStorage.setItem('dino-daily-best', String(dailyBest));
    } else {
      localStorage.removeItem('dino-daily-date');
      localStorage.removeItem('dino-daily-best');
    }
    game.mode = mode;
    game.state = STATE.RUNNING;
    game.score = score;
    game.dailyBest = dailyBest;
    game.highScore = highScore;
    game.currentSpeed = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    game.obstacles.length = 0;
    game.obstacles.push({
      x: dino.x,
      y: dino.y,
      width: dino.width,
      height: dino.height,
    });
    dino.isJumping = false;
    a11yLive.textContent = '';
    shareBtn.style = { display: 'none' };
    shareBtn.textContent = '📋 Copy result';

    STATE_HANDLERS[STATE.RUNNING]();
    const heard = a11yLive.textContent;
    const flags = {
      isNewTodayBest: game.isNewTodayBest,
      previousDailyBest: game.previousDailyBest,
      dailyBest: game.dailyBest,
      isNewBest: game.isNewBest,
      highScore: game.highScore,
      score: game.score,
    };

    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    const calls = captureFillText(drawGameOverScreen);
    const button = { display: shareBtn.style.display, text: shareBtn.textContent };

    game.mode = orig.mode;
    game.state = orig.state;
    game.score = orig.score;
    game.dailyBest = orig.best;
    game.highScore = orig.hs;
    game.isNewBest = orig.newBest;
    game.previousHighScore = orig.prev;
    game.isNewTodayBest = orig.newToday;
    game.previousDailyBest = orig.prevDaily;
    game.currentSpeed = orig.speed;
    game.lastObstacleX = orig.lastX;
    game.nextSpawnGap = orig.gap;
    game.obstacles.length = 0;
    orig.obstacles.forEach((o) => game.obstacles.push(o));
    a11yLive.textContent = orig.text;
    Animations.deathAnimFrame = orig.anim;
    Animations.deathShakeFrames = orig.shake;
    Animations.deathFlashFrames = orig.flash;
    Animations.scorePopFrames = orig.pop;
    Animations.copyFlashFrames = orig.copy;
    if (orig.btnStyle === undefined) delete shareBtn.style;
    else shareBtn.style = orig.btnStyle;
    shareBtn.textContent = orig.btnText;
    restoreStorage(stored);
    Particles.reset();
    return { heard, flags, calls, button };
  }

  it('a Daily death that beats today best takes over with the celebration', () => {
    const { heard, flags, calls, button } = dieAndDraw(MODES.DAILY, {
      score: 80,
      dailyBest: 25,
      highScore: 9999,
    });
    const title = calls.find((c) => c.text === CELEBRATION);
    const score = calls.find((c) => c.text === '00080');
    const hint = calls.find((c) => c.text === HINT);

    assertEquals(flags.isNewTodayBest, true, 'beating today best should flag the celebration');
    assertEquals(flags.previousDailyBest, 25, 'previous today best is the value before this death saved');
    assertEquals(flags.dailyBest, 80, 'today best should update to this run');
    assertEquals(flags.isNewBest, false, 'an all-time miss should not flip the free-play new-best flag');
    assert(title, `celebration title missing, got: ${JSON.stringify(calls.map((c) => c.text))}`);
    assertEquals(title.y, GAME_CONFIG.CANVAS_H / 2 - 36, 'celebration title should sit where NEW BEST sits');
    assert(score, 'the run score should be the big number on the celebration');
    assert(String(score.font).includes('42px'), `celebration score should use the big NEW BEST size, got: ${score.font}`);
    assertEquals(score.x, GAME_CONFIG.CANVAS_W / 2, 'celebration score should be centered');
    assert(calls.some((c) => c.text === '+55 over your previous best'),
      `improvement over the prior today best should show, got: ${JSON.stringify(calls.map((c) => c.text))}`);
    assert(!calls.some((c) => c.text === 'THIS RUN'), 'celebration should replace the comparison pair');
    assert(!calls.some((c) => c.text === 'TODAY BEST'), 'celebration should replace the TODAY BEST column');
    assert(calls.some((c) => c.text.indexOf('DAILY #') !== -1), 'the daily number should stay on the death screen');
    assert(hint, 'the share hint should still appear once the count-up finishes');
    assertEquals(hint.y, GAME_CONFIG.CANVAS_H - 16, 'the hint should keep its bottom-edge spot');
    assertEquals(button.display, 'block', 'Copy result should appear once the count-up finishes');
    assertEquals(button.text, '📋 Copy result', 'Copy result should keep its label');
    assertEquals(
      heard,
      'Game over. Score 80. New today best 80. ' + HINT + '. Press space to restart.',
      `screen reader should hear the new today best, got: ${heard}`
    );
  });

  it('the first Daily run of the day celebrates, with no previous-best line', () => {
    const { flags, calls, button } = dieAndDraw(MODES.DAILY, {
      score: 80,
      dailyBest: 0,
      highScore: 9999,
    });
    assertEquals(flags.isNewTodayBest, true, 'a first today best should celebrate');
    assertEquals(flags.previousDailyBest, 0, 'there is no prior today best');
    assertEquals(flags.dailyBest, 80, 'the run should become today best');
    assert(calls.some((c) => c.text === CELEBRATION), 'first today best should use the celebration');
    assert(!calls.some((c) => c.text.includes('over your previous best')),
      'no prior today best means no improvement line');
    assert(!calls.some((c) => c.text === 'THIS RUN'), 'first today best should not fall back to the comparison');
    assert(calls.some((c) => c.text === HINT), 'the hint still arrives with the settled screen');
    assertEquals(button.display, 'block', 'Copy result still arrives with the settled screen');
  });

  it('a Daily death that misses today best keeps the comparison', () => {
    game.isNewTodayBest = true;
    game.previousDailyBest = 999;
    const { heard, flags, calls, button } = dieAndDraw(MODES.DAILY, {
      score: 40,
      dailyBest: 500,
      highScore: 9999,
    });
    assertEquals(flags.isNewTodayBest, false, 'missing today best should clear the celebration');
    assertEquals(flags.previousDailyBest, 500, 'previous today best stays the stored best');
    assertEquals(flags.dailyBest, 500, 'a lower score should not replace today best');
    assert(calls.some((c) => c.text === 'THIS RUN'), 'a miss should keep THIS RUN');
    assert(calls.some((c) => c.text === 'TODAY BEST'), 'a miss should keep TODAY BEST');
    assert(calls.some((c) => c.text === '00040'), 'a miss should show this run');
    assert(calls.some((c) => c.text === '00500'), 'a miss should show the stored today best');
    assert(calls.some((c) => c.text === '← +460 →'), 'a miss should keep the gap to today best');
    assert(!calls.some((c) => c.text === CELEBRATION), 'a miss should not celebrate');
    assert(calls.some((c) => c.text === HINT), 'the hint should still follow a miss');
    assertEquals(button.display, 'block', 'Copy result should still follow a miss');
    assertEquals(
      heard,
      'Game over. Score 40. Today best 500. ' + HINT + '. Press space to restart.',
      `a miss should keep the today-best announcement, got: ${heard}`
    );
  });

  it('tying today best keeps the comparison', () => {
    const { flags, calls } = dieAndDraw(MODES.DAILY, {
      score: 40,
      dailyBest: 40,
      highScore: 9999,
    });
    assertEquals(flags.isNewTodayBest, false, 'a tie is not a new today best');
    assertEquals(flags.dailyBest, 40, 'a tie should not rewrite today best');
    assert(calls.some((c) => c.text === 'THIS RUN'), 'a tie should keep the comparison');
    assert(calls.some((c) => c.text === '← best →'), 'a tie should keep the even-best marker');
    assert(!calls.some((c) => c.text === CELEBRATION), 'a tie should not celebrate');
  });

  it('a Daily all-time record that misses today best stays on the comparison', () => {
    const { flags, calls } = dieAndDraw(MODES.DAILY, {
      score: 80,
      dailyBest: 500,
      highScore: 10,
    });
    assertEquals(flags.isNewBest, true, 'the all-time record should still be recorded');
    assertEquals(flags.isNewTodayBest, false, 'missing today best should not celebrate');
    assert(calls.some((c) => c.text === 'TODAY BEST'), 'Daily Game Over should stay on the comparison');
    assert(!calls.some((c) => c.text === '★  NEW BEST  ★'), 'Daily Game Over should not use the free-play celebration');
    assert(!calls.some((c) => c.text === CELEBRATION), 'missing today best should not celebrate');
  });

  it('the celebration holds the hint and Copy result until the count-up finishes', () => {
    const shareBtn = document.getElementById('share-btn');
    const orig = {
      mode: game.mode,
      score: game.score,
      best: game.dailyBest,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
      btnStyle: shareBtn.style,
      btnText: shareBtn.textContent,
    };
    game.mode = MODES.DAILY;
    game.score = 80;
    game.dailyBest = 80;
    game.isNewTodayBest = true;
    game.previousDailyBest = 25;
    shareBtn.style = { display: 'block' };
    shareBtn.textContent = '📋 Copy result';
    Animations.deathAnimFrame = 0;
    const early = captureFillText(drawGameOverScreen);
    const earlyButton = shareBtn.style.display;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    const settled = captureFillText(drawGameOverScreen);
    const settledButton = shareBtn.style.display;

    game.mode = orig.mode;
    game.score = orig.score;
    game.dailyBest = orig.best;
    game.isNewTodayBest = orig.newToday;
    game.previousDailyBest = orig.prevDaily;
    Animations.deathAnimFrame = orig.anim;
    if (orig.btnStyle === undefined) delete shareBtn.style;
    else shareBtn.style = orig.btnStyle;
    shareBtn.textContent = orig.btnText;

    assert(early.some((c) => c.text === CELEBRATION), 'the title is up while the score counts');
    assert(early.some((c) => c.text === '00000'), 'the score should start at zero during the count-up');
    assert(!early.some((c) => c.text === HINT), 'the hint should wait for the count-up');
    assertEquals(earlyButton, 'none', 'Copy result should wait for the count-up');
    assert(settled.some((c) => c.text === '00080'), 'the settled celebration should show the full score');
    assert(settled.some((c) => c.text === HINT), 'the hint should appear with the full score');
    assertEquals(settledButton, 'block', 'Copy result should appear with the full score');
  });

  it('the celebration text stays static when motion is reduced', () => {
    const orig = {
      mode: game.mode,
      score: game.score,
      best: game.dailyBest,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
    };
    game.mode = MODES.DAILY;
    game.score = 80;
    game.dailyBest = 80;
    game.isNewTodayBest = true;
    game.previousDailyBest = 25;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    setReducedMotion(false);
    const moving = captureFillText(drawGameOverScreen);
    setReducedMotion(true);
    const reduced = captureFillText(drawGameOverScreen);
    setReducedMotion(false);
    game.mode = orig.mode;
    game.score = orig.score;
    game.dailyBest = orig.best;
    game.isNewTodayBest = orig.newToday;
    game.previousDailyBest = orig.prevDaily;
    Animations.deathAnimFrame = orig.anim;

    const a = moving.find((c) => c.text === CELEBRATION);
    const b = reduced.find((c) => c.text === CELEBRATION);
    assert(a && b, 'the celebration title should stay up with or without motion');
    assertEquals(b.fillStyle, a.fillStyle, 'the celebration should not pulse');
    assertEquals(b.font, a.font, 'the celebration should not scale');
    assertEquals(b.y, a.y, 'the celebration should not move');
  });

  it('Classic and Updated Game Over ignore the today-best celebration', () => {
    const shareBtn = document.getElementById('share-btn');
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      hs: game.highScore,
      best: game.dailyBest,
      newBest: game.isNewBest,
      prev: game.previousHighScore,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
      btnStyle: shareBtn.style,
    };
    function drawMode(mode, isNewBest) {
      game.mode = mode;
      game.state = STATE.DEAD;
      game.score = 80;
      game.highScore = 200;
      game.dailyBest = 10;
      game.isNewBest = isNewBest;
      game.previousHighScore = isNewBest ? 50 : 200;
      game.isNewTodayBest = true;
      game.previousDailyBest = 10;
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      shareBtn.style = { display: 'none' };
      return captureFillText(drawGameOverScreen);
    }
    const classic = drawMode(MODES.CLASSIC, false);
    const classicButton = shareBtn.style.display;
    const updated = drawMode(MODES.UPDATED, true);
    const updatedButton = shareBtn.style.display;

    game.isNewTodayBest = true;
    const classicDeath = dieAndDraw(MODES.CLASSIC, {
      score: 80,
      dailyBest: 10,
      highScore: 9999,
    });

    game.mode = orig.mode;
    game.state = orig.state;
    game.score = orig.score;
    game.highScore = orig.hs;
    game.dailyBest = orig.best;
    game.isNewBest = orig.newBest;
    game.previousHighScore = orig.prev;
    game.isNewTodayBest = orig.newToday;
    game.previousDailyBest = orig.prevDaily;
    Animations.deathAnimFrame = orig.anim;
    if (orig.btnStyle === undefined) delete shareBtn.style;
    else shareBtn.style = orig.btnStyle;

    assert(classic.some((c) => c.text === 'YOUR BEST'), 'Classic should keep the free-play comparison');
    assert(classic.some((c) => c.text === 'Tap / Press Space to Restart'), 'Classic should keep its restart line');
    assert(!classic.some((c) => c.text === CELEBRATION), 'Classic should not show the today-best celebration');
    assert(!classic.some((c) => c.text === HINT), 'Classic should not show the Daily hint');
    assertEquals(classicButton, 'none', 'Classic should not reveal Copy result');
    assert(updated.some((c) => c.text === '★  NEW BEST  ★'), 'Updated should keep the free-play celebration');
    assert(!updated.some((c) => c.text === CELEBRATION), 'Updated should not show the today-best celebration');
    assert(!updated.some((c) => c.text === HINT), 'Updated should not show the Daily hint');
    assertEquals(updatedButton, 'none', 'Updated should not reveal Copy result');
    assertEquals(classicDeath.flags.isNewTodayBest, false, 'a Classic death should not flag a today-best celebration');
    assert(classicDeath.heard.includes('High score'), `Classic death should keep the high-score line, got: ${classicDeath.heard}`);
    assert(!classicDeath.heard.includes('New today best'), 'Classic death should not announce a today best');
    assert(!classicDeath.heard.includes(HINT), 'Classic death should not announce the Daily hint');
  });

  it('Copy result still shares the new today best', () => {
    const stored = snapshotStorage();
    const origBest = game.dailyBest;
    const origScore = game.score;
    game.score = 80;
    game.dailyBest = 80;
    const text = shareDailyResult();
    game.dailyBest = origBest;
    game.score = origScore;
    restoreStorage(stored);
    assert(text.includes('80'), `Copy result should include the new today best, got: ${text}`);
    assert(text.includes('Rex Daily #'), `Copy result should keep its daily header, got: ${text}`);
  });

  it('resetGame clears the today-best celebration', () => {
    game.isNewTodayBest = true;
    game.previousDailyBest = 80;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.isNewTodayBest, false, 'resetGame should clear the celebration');
    assertEquals(game.previousDailyBest, 0, 'resetGame should clear the previous today best');
  });
});

describe('QA cluster flag (?qaCluster=1)', () => {
  const cluster = () => GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  // One running frame from a known seed. resetGame re-reads the query, so the
  // flag is applied after that. The first frame is early enough that production
  // rules would still only roll a small cactus.
  function runFirstSpawn(mode, { flag, search } = {}) {
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    if (search !== undefined) global.location = { search };
    game.mode = mode;
    game.seedOverride = 99;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    if (flag !== undefined) setQaCluster(flag);
    game.state = STATE.RUNNING;
    game.obstacles.length = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    tick();
    const spawned = game.obstacles.map(o => o.type);
    const gap = game.nextSpawnGap;
    const score = game.score;
    return {
      spawned,
      gap,
      score,
      restore() {
        if (search !== undefined) {
          if (hadLocation) global.location = prevLocation;
          else delete global.location;
        }
      },
    };
  }

  it('recognizes only ?qaCluster=1', () => {
    assert(readQaClusterFlag('?qaCluster=1') === true, '?qaCluster=1 should enable the early cluster');
    assert(readQaClusterFlag('?foo=1&qaCluster=1') === true, 'the flag should work alongside other params');
    assert(readQaClusterFlag('?qaPlateau=1') === false, 'the plateau flag must not enable the cluster');
    assert(readQaClusterFlag('') === false, 'a normal visit should leave the flag off');
    assert(readQaClusterFlag('?qaCluster=0') === false, 'only the value 1 enables the flag');
    assert(readQaClusterFlag('?qaCluster=12') === false, 'qaCluster=12 must not count as the flag');
    assert(readQaClusterFlag('?other=1') === false, 'an unrelated param must not enable the flag');
  });

  it('with ?qaCluster=1 the first Updated obstacle is a cluster while unlock stays 250', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { flag: true });
    try {
      assertEquals(cluster().unlockScore, 250, 'production unlock stays 250');
      assertEquals(cluster().weight, 20, 'production weight stays 20');
      assertEquals(cluster().width, 50, 'production hitbox stays 50');
      assert(run.score < 50, `the early cluster should appear near the start, score was ${run.score}`);
      assertEquals(run.spawned[0], 'cluster', 'the first Updated obstacle should be the cluster');
      assertEquals(game.obstacles[0].width, 50, 'the early cluster keeps the real hitbox');
      assertEquals(game.obstacles[0].render, 'double', 'the early cluster uses the two-cactus draw');
      assertEquals(game.qaClusterShown, true, 'the override is spent after one obstacle');

      // Drop the first cluster so the gap check looks at lastObstacleX, then
      // spawn again while the score is still far below the real unlock.
      game.obstacles.length = 0;
      game.lastObstacleX = -300;
      tick();
      assertEquals(game.obstacles.length, 1, 'a second obstacle should spawn on the next frame');
      assertEquals(game.obstacles[0].type, 'small', 'later obstacles follow the normal unlock');
      assertEquals(game.qaClusterShown, true, 'the second spawn must not re-arm the QA cluster');
    } finally {
      run.restore();
      setQaCluster(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with the flag off the first obstacle stays small and the gap matches a flagged run', () => {
    const origMode = game.mode;
    const flagged = runFirstSpawn(MODES.UPDATED, { flag: true });
    const plain = runFirstSpawn(MODES.UPDATED, { flag: false });
    try {
      assertEquals(plain.spawned[0], 'small', 'a normal visit still starts with the small cactus');
      assertEquals(plain.gap, flagged.gap, 'the flag must not consume an extra RNG call');
      assertEquals(game.qaClusterShown, false, 'a normal spawn must not latch the QA override');
      assertEquals(cluster().unlockScore, 250, 'unlock stays 250 when the flag is off');
    } finally {
      flagged.restore();
      plain.restore();
      setQaCluster(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with ?qaCluster=1 Classic still spawns only the small cactus', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.CLASSIC, { flag: true });
    try {
      assertEquals(run.spawned[0], 'small', 'Classic must not gain a cluster from the QA flag');
      assertEquals(game.qaClusterShown, false, 'Classic must not spend the QA cluster');
      assert(!run.spawned.includes('cluster'), 'Classic obstacles stay small-only');
    } finally {
      run.restore();
      setQaCluster(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with ?qaCluster=1 Daily also shows the cluster on the first obstacle', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.DAILY, { flag: true });
    try {
      assertEquals(run.spawned[0], 'cluster', 'Daily should show the early cluster');
      assert(run.score < 50, `Daily cluster should be early, score was ${run.score}`);
    } finally {
      run.restore();
      setQaCluster(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCluster=1 from the page query', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { search: '?qaCluster=1' });
    try {
      assertEquals(run.spawned[0], 'cluster', 'resetGame should arm the early cluster from location.search');
      assertEquals(game.qaClusterShown, true, 'the re-read flag should still latch after one cluster');
    } finally {
      run.restore();
      setQaCluster(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA big cactus flag (?qaBig=1)', () => {
  const big = () => GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'big');

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  // One running frame from a known seed. resetGame re-reads the query, so the
  // flag is applied after that. The first frame is early enough that production
  // rules would still only roll a small cactus.
  function runFirstSpawn(mode, { flag, search } = {}) {
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    if (search !== undefined) global.location = { search };
    game.mode = mode;
    game.seedOverride = 99;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    if (flag !== undefined) setQaBig(flag);
    game.state = STATE.RUNNING;
    game.obstacles.length = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    tick();
    const spawned = game.obstacles.map(o => o.type);
    const gap = game.nextSpawnGap;
    const score = game.score;
    return {
      spawned,
      gap,
      score,
      restore() {
        if (search !== undefined) {
          if (hadLocation) global.location = prevLocation;
          else delete global.location;
        }
      },
    };
  }

  it('recognizes only ?qaBig=1', () => {
    assert(readQaBigFlag('?qaBig=1') === true, '?qaBig=1 should enable the early big cactus');
    assert(readQaBigFlag('?foo=1&qaBig=1') === true, 'the flag should work alongside other params');
    assert(readQaBigFlag('?qaCluster=1') === false, 'the cluster flag must not enable the big cactus');
    assert(readQaBigFlag('?qaPlateau=1') === false, 'the plateau flag must not enable the big cactus');
    assert(readQaBigFlag('') === false, 'a normal visit should leave the flag off');
    assert(readQaBigFlag('?qaBig=0') === false, 'only the value 1 enables the flag');
    assert(readQaBigFlag('?qaBig=12') === false, 'qaBig=12 must not count as the flag');
    assert(readQaBigFlag('?other=1') === false, 'an unrelated param must not enable the flag');
  });

  it('with ?qaBig=1 the first Updated obstacle is a big cactus while unlock stays 100', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { flag: true });
    try {
      assertEquals(big().unlockScore, 100, 'production unlock stays 100');
      assertEquals(big().weight, 30, 'production weight stays 30');
      assertEquals(big().width, 30, 'production hitbox width stays 30');
      assertEquals(big().height, 55, 'production hitbox height stays 55');
      assert(run.score < 50, `the early big cactus should appear near the start, score was ${run.score}`);
      assertEquals(run.spawned[0], 'big', 'the first Updated obstacle should be the big cactus');
      assertEquals(game.obstacles[0].width, 30, 'the early big cactus keeps the real hitbox width');
      assertEquals(game.obstacles[0].height, 55, 'the early big cactus keeps the real hitbox height');
      assertEquals(game.obstacles[0].render, 'single', 'the early big cactus stays a single sprite');
      assertEquals(game.qaBigShown, true, 'the override is spent after one obstacle');

      game.obstacles.length = 0;
      game.lastObstacleX = -300;
      tick();
      assertEquals(game.obstacles.length, 1, 'a second obstacle should spawn on the next frame');
      assertEquals(game.obstacles[0].type, 'small', 'later obstacles follow the normal unlock');
      assertEquals(game.qaBigShown, true, 'the second spawn must not re-arm the QA big cactus');
    } finally {
      run.restore();
      setQaBig(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with the flag off the first obstacle stays small and the gap matches a flagged run', () => {
    const origMode = game.mode;
    const flagged = runFirstSpawn(MODES.UPDATED, { flag: true });
    const plain = runFirstSpawn(MODES.UPDATED, { flag: false });
    try {
      assertEquals(plain.spawned[0], 'small', 'a normal visit still starts with the small cactus');
      assertEquals(plain.gap, flagged.gap, 'the flag must not consume an extra RNG call');
      assertEquals(game.qaBigShown, false, 'a normal spawn must not latch the QA override');
      assertEquals(big().unlockScore, 100, 'unlock stays 100 when the flag is off');
    } finally {
      flagged.restore();
      plain.restore();
      setQaBig(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with ?qaBig=1 Classic still spawns only the small cactus', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.CLASSIC, { flag: true });
    try {
      assertEquals(run.spawned[0], 'small', 'Classic must not gain a big cactus from the QA flag');
      assertEquals(game.qaBigShown, false, 'Classic must not spend the QA big cactus');
      assert(!run.spawned.includes('big'), 'Classic obstacles stay small-only');
    } finally {
      run.restore();
      setQaBig(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with ?qaBig=1 Daily also shows the big cactus on the first obstacle', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.DAILY, { flag: true });
    try {
      assertEquals(run.spawned[0], 'big', 'Daily should show the early big cactus');
      assert(run.score < 50, `Daily big cactus should be early, score was ${run.score}`);
    } finally {
      run.restore();
      setQaBig(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaBig=1 from the page query', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { search: '?qaBig=1' });
    try {
      assertEquals(run.spawned[0], 'big', 'resetGame should arm the early big cactus from location.search');
      assertEquals(game.qaBigShown, true, 'the re-read flag should still latch after one big cactus');
    } finally {
      run.restore();
      setQaBig(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Night obstacle contrast', () => {
  function placeSmall() {
    const small = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'small');
    game.obstacles = [{
      x: 40, y: 160, width: small.width, height: small.height,
      render: small.render, type: small.id,
    }];
    return small;
  }

  function filtersDuringDraw() {
    const seen = [];
    const orig = ctx.drawImage;
    ctx.drawImage = (...args) => { seen.push(ctx.filter); return orig.apply(ctx, args); };
    try {
      drawObstacles();
    } finally {
      ctx.drawImage = orig;
    }
    return seen;
  }

  it('lifts Updated and Daily cactus ink only once the sky is night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      assertEquals(GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS, 1.65,
        'the night lift stays a quiet brightness step, not a white invert');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(obstacleNightBrightness(), 1, 'day Updated keeps the dark sprite');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(obstacleNightBrightness(), 1, 'the lift waits until night has fully arrived');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'full night brightens the cactus enough to separate it from the hills');
      game.score = 1000;
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'later night keeps the same static lift');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'Daily shares the Updated night lift');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(obstacleNightBrightness(), 1,
        'Classic keeps the dark silhouette on the shared night sky');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('stays static under reduced motion and still lifts at full night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(obstacleNightBrightness(), 1,
        'reduced motion keeps the day sprite while the sky is still day');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'reduced motion still gets the static night lift');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 lifts Updated cacti immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(obstacleNightBrightness(), GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'the existing night QA flag is enough to see the lift');
      assertEquals(game.score, 0, 'the lift must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(obstacleNightBrightness(), 1,
        'QA night still leaves the Classic silhouette alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('paints the lift only around Updated night sprites and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFilter = ctx.filter;
    try {
      setQaNight(false);
      placeSmall();
      game.mode = MODES.UPDATED;
      game.score = 0;
      ctx.filter = 'none';
      assertEquals(filtersDuringDraw()[0], 'none', 'day sprites are not brightened');
      assertEquals(ctx.filter, 'none', 'a day draw leaves the filter alone');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.filter = 'contrast(2)';
      const seen = filtersDuringDraw();
      assertEquals(seen.length, 1, 'a small cactus is still one sprite');
      assertEquals(seen[0], 'brightness(1.65)', 'night paint uses the quiet brightness lift');
      assertEquals(ctx.filter, 'contrast(2)', 'the lift must not leak onto the dino or HUD');
      assertEquals(game.obstacles[0].width, 20, 'the lift does not resize the hitbox');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.filter = 'none';
      assertEquals(filtersDuringDraw()[0], 'none', 'Classic night paint stays the dark sprite');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      ctx.filter = origFilter;
      game.obstacles = [];
      setQaNight(false);
    }
  });

  it('a night cluster still draws two full sprites, only brighter', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'small');
    game.obstacles = [{
      x: 100, y: 160, width: cluster.width, height: cluster.height,
      render: cluster.render, type: cluster.id,
    }];
    const calls = [];
    const origDrawImage = ctx.drawImage;
    ctx.drawImage = (...args) => calls.push(args);
    try {
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      drawObstacles();
      assertEquals(calls.length, 2, 'Night cluster is still two sprites');
      assertEquals(calls[0][3], small.width, 'First sprite keeps the small-cactus width');
      assertEquals(calls[1][3], small.width, 'Second sprite keeps the small-cactus width');
      assertEquals(calls[1][1] - (calls[0][1] + calls[0][3]), small.width,
        'The sky gap between the cacti stays one small cactus wide');
      assertEquals(game.obstacles[0].width, cluster.width, 'Cluster hitbox width stays 50');
    } finally {
      ctx.drawImage = origDrawImage;
      game.mode = origMode;
      game.score = origScore;
      game.obstacles = [];
    }
  });
});

describe('Night dino contrast', () => {
  function filtersDuringSpriteDraw() {
    const seen = [];
    const orig = ctx.drawImage;
    ctx.drawImage = (...args) => { seen.push(ctx.filter); return orig.apply(ctx, args); };
    try {
      drawDino();
    } finally {
      ctx.drawImage = orig;
    }
    return seen;
  }

  it('lifts Updated and Daily dino ink only once the sky is night, quieter than cacti', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFrame = game.animFrame;
    try {
      setQaNight(false);
      setReducedMotion(false);
      assertEquals(GAME_CONFIG.NIGHT_DINO_BRIGHTNESS, 1.2,
        'the night dino lift is the softer brightness step');
      assert(GAME_CONFIG.NIGHT_DINO_BRIGHTNESS < GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'the dino stays quieter than night cacti so obstacles still win the eye');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(dinoNightBrightness(), 1, 'day Updated keeps the dark sprite');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(dinoNightBrightness(), 1, 'twilight start keeps the day sprite');
      game.score = 350;
      assertEquals(dinoNightBrightness(), 1, 'mid-twilight keeps the day sprite');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(dinoNightBrightness(), 1, 'the lift waits until night has fully arrived');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'full night brightens the dino enough to separate it from the sky and hills');
      game.animFrame = 0;
      const atRest = dinoNightBrightness();
      game.animFrame = 17;
      assertEquals(dinoNightBrightness(), atRest, 'the night lift does not pulse with the run cycle');
      game.score = 1000;
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'later night keeps the same static lift');
      assert(dinoNightBrightness() < obstacleNightBrightness(),
        'at the same night score the cactus lift stays stronger');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'Daily shares the Updated night dino lift');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(dinoNightBrightness(), 1,
        'Classic keeps the dark silhouette on the shared night sky');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.animFrame = origFrame;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('stays static under reduced motion and still lifts at full night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFrame = game.animFrame;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(dinoNightBrightness(), 1,
        'reduced motion keeps the day sprite while the sky is still fading');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      game.animFrame = 0;
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'reduced motion still gets the static night lift');
      game.animFrame = 30;
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'reduced motion does not add a pulse');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.animFrame = origFrame;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 lifts the Updated dino immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(dinoNightBrightness(), GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'the existing night QA flag is enough to see the dino lift');
      assertEquals(game.score, 0, 'the lift must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(dinoNightBrightness(), 1,
        'QA night still leaves the Classic silhouette alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('paints the lift only around the Updated night dino and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFilter = ctx.filter;
    const origX = dino.x;
    const origY = dino.y;
    const origW = dino.width;
    const origH = dino.height;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      ctx.filter = 'none';
      assertEquals(filtersDuringSpriteDraw()[0], 'none', 'day sprites are not brightened');
      assertEquals(ctx.filter, 'none', 'a day draw leaves the filter alone');

      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      ctx.filter = 'none';
      assertEquals(filtersDuringSpriteDraw()[0], 'none', 'twilight paint keeps the day sprite');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.filter = 'contrast(2)';
      const seen = filtersDuringSpriteDraw();
      assertEquals(seen.length, 1, 'the dino is still one sprite');
      assertEquals(seen[0], 'brightness(1.20)', 'night paint uses the softer dino lift');
      assertEquals(ctx.filter, 'contrast(2)', 'the lift must not leak onto obstacles or the HUD');
      assertEquals(dino.x, origX, 'the lift does not move the dino');
      assertEquals(dino.y, origY, 'the lift does not move the dino');
      assertEquals(dino.width, origW, 'the lift does not resize the hitbox');
      assertEquals(dino.height, origH, 'the lift does not resize the hitbox');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.filter = 'none';
      assertEquals(filtersDuringSpriteDraw()[0], 'none', 'Classic night paint stays the dark sprite');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      ctx.filter = origFilter;
      setQaNight(false);
    }
  });

  it('the fillRect fallback uses the same static night lift', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origJumping = dino.isJumping;
    const origFilter = ctx.filter;
    const hadWidth = Object.prototype.hasOwnProperty.call(dino.image, 'naturalWidth');
    const origWidth = dino.image.naturalWidth;
    const seen = [];
    const origFill = ctx.fillRect;
    ctx.fillRect = (...args) => {
      seen.push({ filter: ctx.filter, style: ctx.fillStyle, args: args });
      return origFill.apply(ctx, args);
    };
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      dino.isJumping = true;
      dino.image.naturalWidth = 0;
      ctx.filter = 'contrast(2)';
      drawDino();
      assertEquals(seen.length, 1, 'a missing sprite still paints one fallback rect');
      assertEquals(seen[0].filter, 'brightness(1.20)', 'the fallback shares the night dino lift');
      assertEquals(seen[0].style, '#535353', 'the fallback ink stays the day sprite colour');
      assertEquals(seen[0].args[2], dino.width, 'the fallback keeps the dino width');
      assertEquals(seen[0].args[3], dino.height, 'the fallback keeps the dino height');
      assertEquals(ctx.filter, 'contrast(2)', 'the fallback lift must not leak');
    } finally {
      ctx.fillRect = origFill;
      ctx.filter = origFilter;
      dino.isJumping = origJumping;
      if (hadWidth) dino.image.naturalWidth = origWidth;
      else delete dino.image.naturalWidth;
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });
});

describe('QA night flag (?qaNight=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armFreshRun() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
  }

  it('recognizes only ?qaNight=1', () => {
    assert(readQaNightFlag('?qaNight=1') === true, '?qaNight=1 should enable the early night sky');
    assert(readQaNightFlag('?foo=1&qaNight=1') === true, 'the flag should work alongside other params');
    assert(readQaNightFlag('') === false, 'a normal visit should leave the night fade on the real score');
    assert(readQaNightFlag('?qaNight=0') === false, 'only the value 1 enables the flag');
    assert(readQaNightFlag('?qaNight=12') === false, 'qaNight=12 must not count as the flag');
    assert(readQaNightFlag('?qaPlateau=1') === false, 'another QA flag must not start the night fade');
  });

  it('with ?qaNight=1 stars start fading on the first running frame, speed unchanged', () => {
    try {
      setReducedMotion(false);
      armFreshRun();
      setQaNight(true);
      const scoreBefore = game.score;
      tick();
      assert(game.score < 1, 'the QA flag must not jump the score to 400');
      assert(game.score > scoreBefore, 'the run still scores normally');
      assert(
        Math.abs(game.currentSpeed - DifficultyProfile.speedAtScore(game.score)) < 1e-6,
        'speed still follows the real score, not the night presentation'
      );
      assert(game.starsInitialised, 'stars appear immediately so the fade can be watched');
      assertEquals(game.starFadeFrames, 1, 'the fade starts on that first frame');
      assert(starFadeAlpha() < 1, 'they ease in instead of popping on');
      assertEquals(getBackgroundColor(0), '#1a1a2e', 'the QA sky is already full night');
      assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_NIGHT, 'hills match the QA night sky');
    } finally {
      setQaNight(false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('without the flag a new run keeps the day sky and no stars', () => {
    try {
      setQaNight(false);
      armFreshRun();
      tick();
      assert(!game.starsInitialised, 'stars still wait for score 400');
      assertEquals(game.starFadeFrames, 0);
      assertEquals(getBackgroundColor(0), '#ffffff', 'a normal visit stays on the day sky');
    } finally {
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion still skips star init when ?qaNight=1', () => {
    try {
      armFreshRun();
      setQaNight(true);
      setReducedMotion(true);
      tick();
      assert(!game.starsInitialised, 'reduced motion still does not initialise stars');
      assertEquals(game.stars.length, 0);
      assertEquals(game.starFadeFrames, 0);
      assertEquals(getBackgroundColor(0), '#1a1a2e', 'the QA sky can still go night without stars');
    } finally {
      setQaNight(false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaNight=1 from the page query', () => {
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    global.location = { search: '?qaNight=1' };
    try {
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      tick();
      assert(game.starsInitialised, 'resetGame should arm the early star fade from location.search');
      assert(game.score < 1, 're-reading the flag must not change the score');
    } finally {
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Night cloud dim', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function alphasDuringCloudPaint() {
    const seen = [];
    const orig = ctx.arc;
    ctx.arc = function (...args) {
      seen.push(ctx.globalAlpha);
      return orig.apply(this, args);
    };
    try {
      drawClouds();
    } finally {
      ctx.arc = orig;
    }
    return seen;
  }

  // Night sky #1a1a2e showing through day cloud #e8e8e8. CSS brightness on
  // the #535353 sprite is the lane the clouds must stay under.
  function compositedCloudChannel(alpha) {
    return 0x1a + (0xe8 - 0x1a) * alpha;
  }

  // Day sky #ffffff showing through the same #e8e8e8 ink.
  function dayCloudChannel(alpha) {
    return 0xff + (0xe8 - 0xff) * alpha;
  }

  function liftedSpriteChannel(brightness) {
    return 0x53 * brightness;
  }

  it('eases Updated and Daily clouds down after full night, quieter than the lane', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      const dayPeak = GAME_CONFIG.DAY_CLOUD_ALPHA;
      const fullInk = 0xff - 0xe8;
      const dayInk = 0xff - dayCloudChannel(dayPeak);
      assert(dayPeak < 1, 'day Updated clouds are quieter than a full #e8e8e8 puff');
      assert(dayPeak > 0, 'the day puff still paints');
      assert(dayPeak > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the day whisper stays stronger than the night dim so twilight eases down');
      assert(dayInk < fullInk * 0.75, 'the day puff loses a real share of its ink');
      assert(dayInk > 10, 'the puff still sits more than ten levels off the white sky');
      const hillDay = parseInt(GAME_CONFIG.HILL_COLOR_DAY.slice(1, 3), 16);
      assert(dayInk < (0xff - hillDay), 'day clouds stay quieter than the day hills');
      assert(GAME_CONFIG.NIGHT_CLOUD_ALPHA < dayPeak, 'night clouds are dimmer than the day puff');
      assert(GAME_CONFIG.NIGHT_CLOUD_ALPHA > 0,
        'night clouds stay visible against the night sky');
      assert(
        compositedCloudChannel(GAME_CONFIG.NIGHT_CLOUD_ALPHA)
          < liftedSpriteChannel(GAME_CONFIG.NIGHT_DINO_BRIGHTNESS),
        'night clouds stay quieter than the night dino'
      );
      assert(
        compositedCloudChannel(GAME_CONFIG.NIGHT_CLOUD_ALPHA)
          < liftedSpriteChannel(GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS),
        'night clouds stay quieter than night cacti'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(cloudPaintAlpha(), dayPeak, 'day Updated keeps the quieter day cloud');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(cloudPaintAlpha(), dayPeak, 'the ease starts with the sky, still the quieter day cloud at the boundary');
      game.score = 350;
      const mid = dayPeak + (GAME_CONFIG.NIGHT_CLOUD_ALPHA - dayPeak) * 0.5;
      assert(
        Math.abs(cloudPaintAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the quieter day cloud to the night dim'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(cloudPaintAlpha() < dayPeak && cloudPaintAlpha() > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'one point before night is still easing, not snapped');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'full night holds the soft dim');
      game.score = 1000;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'later night keeps the same static dim');

      game.mode = MODES.DAILY;
      game.score = 0;
      assertEquals(cloudPaintAlpha(), dayPeak,
        'Daily shares the quieter Updated day cloud');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'Daily shares the Updated night cloud dim');

      game.mode = MODES.CLASSIC;
      game.score = 0;
      assertEquals(cloudPaintAlpha(), 1, 'Classic day clouds stay as they are');
      game.score = 350;
      assertEquals(cloudPaintAlpha(), 1, 'Classic twilight clouds stay as they are');
      game.score = 1000;
      assertEquals(cloudPaintAlpha(), 1, 'Classic night clouds stay as they are');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night dim instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.DAY_CLOUD_ALPHA,
        'reduced motion keeps the quieter day cloud while the sky is still day');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.DAY_CLOUD_ALPHA,
        'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'reduced motion still gets the static night dim');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 dims Updated clouds immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the existing night QA flag is enough to see the dim');
      assertEquals(game.score, 0, 'the dim must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(cloudPaintAlpha(), 1,
        'QA night still leaves Classic clouds alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('NIGHT_CLOUD_ALPHA override changes only the night dim', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_CLOUD_ALPHA: 0.2 }, () => {
        assertEquals(cloudPaintAlpha(), 0.2,
          'a visual override should dim night clouds by the tuned amount');
      });
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'clearing the override returns the configured night dim');
      game.score = 0;
      withTuning({ NIGHT_CLOUD_ALPHA: 0.2 }, () => {
        assertEquals(cloudPaintAlpha(), GAME_CONFIG.DAY_CLOUD_ALPHA, 'day clouds ignore the night override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_CLOUD_ALPHA: 'soft' }, () => {
        assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
          'a non-numeric override falls back to the configured dim');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('DAY_CLOUD_ALPHA override changes only the day peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(cloudPaintAlpha(), 0.4,
          'a visual override should quiet day clouds by the tuned amount');
      });
      assertEquals(cloudPaintAlpha(), GAME_CONFIG.DAY_CLOUD_ALPHA,
        'clearing the override returns the configured day peak');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(cloudPaintAlpha(), GAME_CONFIG.NIGHT_CLOUD_ALPHA,
          'full night ignores the day override');
      });
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 'soft' }, () => {
        assertEquals(cloudPaintAlpha(), GAME_CONFIG.DAY_CLOUD_ALPHA,
          'a non-numeric override falls back to the configured day peak');
      });
      game.mode = MODES.CLASSIC;
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(cloudPaintAlpha(), 1,
          'Classic keeps its own full-opacity cloud when the day peak is tuned');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('GET READY already paints the quieter day clouds, so playtest needs no query flag', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origState = game.state;
    const origGrace = game.graceFrames;
    const origFrame = game.animFrame;
    const origAlpha = ctx.globalAlpha;
    const origArc = ctx.arc;
    const seen = [];
    ctx.arc = function (...args) {
      seen.push(ctx.globalAlpha);
      return origArc.apply(this, args);
    };
    try {
      setQaNight(false);
      setReducedMotion(false);
      initClouds();
      game.mode = MODES.UPDATED;
      game.score = 0;
      game.state = STATE.WAITING;
      game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      gameLoop();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assert(game.state === STATE.WAITING, 'one opening frame stays on GET READY');
      assertEquals(game.score, 0, 'painting the opening clouds must not write the score');
      assert(seen.length === GAME_CONFIG.CLOUD_COUNT * GAME_CONFIG.CLOUD_CIRCLES.length,
        'GET READY draws every cloud circle');
      assert(seen.every(a => a === GAME_CONFIG.DAY_CLOUD_ALPHA),
        'the opening screen uses the quieter day peak');
      assertEquals(ctx.globalAlpha, 1, 'the opening cloud paint leaves the lane alone');
    } finally {
      ctx.arc = origArc;
      ctx.globalAlpha = origAlpha;
      game.mode = origMode;
      game.score = origScore;
      game.state = origState;
      game.graceFrames = origGrace;
      game.animFrame = origFrame;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('fills each cloud once so the night dim does not stack', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFill = ctx.fill;
    let fills = 0;
    ctx.fill = function () {
      fills++;
      return origFill.apply(this, arguments);
    };
    try {
      setQaNight(false);
      initClouds();
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      drawClouds();
      assertEquals(fills, GAME_CONFIG.CLOUD_COUNT,
        'each cloud is one fill so overlapping circles do not stack the night dim');
      game.score = 0;
      fills = 0;
      drawClouds();
      assertEquals(fills, GAME_CONFIG.CLOUD_COUNT,
        'day clouds use the same single fill');
    } finally {
      ctx.fill = origFill;
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('paints the dim only around Updated night clouds and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origAlpha = ctx.globalAlpha;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    try {
      setQaNight(false);
      initClouds();
      const before = game.clouds.map(c => c.x + ',' + c.y + ',' + c.speed).join('|');
      game.mode = MODES.UPDATED;
      game.score = 0;
      ctx.globalAlpha = 1;
      const day = alphasDuringCloudPaint();
      assert(day.length === GAME_CONFIG.CLOUD_COUNT * GAME_CONFIG.CLOUD_CIRCLES.length,
        'day still paints every cloud circle');
      assert(day.every(a => a === GAME_CONFIG.DAY_CLOUD_ALPHA), 'day clouds use the quieter day peak');
      assertEquals(ctx.globalAlpha, 1, 'a day draw leaves the obstacle lane alone');
      assertEquals(ctx.fillStyle, GAME_CONFIG.CLOUD_COLOR, 'day ink stays the day cloud colour');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.globalAlpha = 0.8;
      const night = alphasDuringCloudPaint();
      assertEquals(night.length, day.length, 'night still paints the same circles');
      assert(night.every(a => Math.abs(a - 0.8 * GAME_CONFIG.NIGHT_CLOUD_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the soft dim');
      assertEquals(ctx.globalAlpha, 0.8, 'the dim must not leak onto the dino or cacti');
      assertEquals(ctx.fillStyle, GAME_CONFIG.CLOUD_COLOR, 'night still uses the day cloud colour');
      assertEquals(
        game.clouds.map(c => c.x + ',' + c.y + ',' + c.speed).join('|'),
        before,
        'painting clouds does not move them'
      );
      assertEquals(rngCalls, 0, 'painting clouds does not consume the run seed');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.globalAlpha = 1;
      const classic = alphasDuringCloudPaint();
      assert(classic.every(a => a === 1), 'Classic night paint stays day-bright');
      assertEquals(ctx.globalAlpha, 1, 'Classic paint leaves the lane alone');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      ctx.globalAlpha = origAlpha;
      setQaNight(false);
    }
  });
});

describe('Soft night clouds', () => {
  function cloudLifts(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const puff = [0xe8, 0xe8, 0xe8];
    return puff.map((channel, i) => (channel - sky[i]) * alpha);
  }

  function sum(levels) {
    return levels.reduce((total, n) => total + n, 0);
  }

  it('night clouds keep three-fifths of the old 0.35 band and stay a soft mound', () => {
    const now = GAME_CONFIG.NIGHT_CLOUD_ALPHA;
    const old = 0.35;
    const nowLifts = cloudLifts(now);
    const oldLifts = cloudLifts(old);
    const hill = [0x2d - 0x1a, 0x2d - 0x1a, 0x46 - 0x2e];
    const star = [
      (0xff - 0x1a) * GAME_CONFIG.NIGHT_STAR_ALPHA,
      (0xff - 0x1a) * GAME_CONFIG.NIGHT_STAR_ALPHA,
      (0xff - 0x2e) * GAME_CONFIG.NIGHT_STAR_ALPHA,
    ];
    assertEquals(now, 0.21, 'night clouds use the quieter dim');
    assertEquals(GAME_CONFIG.DAY_CLOUD_ALPHA, 0.6, 'day clouds stay the quieter day peak');
    assertEquals(GAME_CONFIG.CLOUD_COLOR, '#e8e8e8', 'the ink stays the day puff; the quiet is opacity');
    assert(Math.abs(now - old * 0.6) < 1e-9, 'the quieter dim keeps three-fifths of the old 0.35 band');
    assert(sum(nowLifts) < sum(oldLifts) * 0.75, 'night clouds lose a real share of the old lift');
    assert(nowLifts.every((n, i) => n > hill[i]), 'the mounds still sit lighter than the night hills');
    assert(sum(star) > sum(nowLifts), 'large mounds stay under the night-star whisper');
    assert(now > 0.15, 'the puff still reads against the night sky');
    assert(now < GAME_CONFIG.DAY_CLOUD_ALPHA, 'twilight still eases downward');
    assert(GAME_CONFIG.NIGHT_GROUND_ALPHA - now >= 0.05, 'the road edge stays clearly firmer');
  });
});

describe('Night land dust', () => {
  const DAY_DUST = '#9c8770';

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function relLuminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function compositedCloudLuminance(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const cloud = [0xe8, 0xe8, 0xe8];
    const mixed = sky.map((s, i) => s + (cloud[i] - s) * alpha);
    return 0.2126 * mixed[0] + 0.7152 * mixed[1] + 0.0722 * mixed[2];
  }

  function liveColors(kind) {
    Particles.reset();
    Particles.emit(kind, 80, 140);
    return Particles.particles.filter(p => p.life > 0).map(p => p.color);
  }

  it('keeps day jump and land dust brown, and cools it once the sky is night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      assertEquals(Particles.KINDS.jump.color, DAY_DUST, 'jump kind stays the day brown');
      assertEquals(Particles.KINDS.land.color, DAY_DUST, 'land kind stays the day brown');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COLOR, '#6a686e',
        'night land dust is the quiet cool gray');
      const night = GAME_CONFIG.NIGHT_LAND_DUST_COLOR;
      const nightWarmth = parseInt(night.slice(1, 3), 16) - parseInt(night.slice(5, 7), 16);
      const dayWarmth = 0x9c - 0x70;
      assert(nightWarmth < dayWarmth, 'night dust is cooler than day brown');
      assert(relLuminance(night) < relLuminance(DAY_DUST), 'night dust is quieter than day brown');
      assert(
        relLuminance(night) > compositedCloudLuminance(GAME_CONFIG.NIGHT_CLOUD_ALPHA),
        'night dust stays a step above the soft night clouds'
      );
      assert(
        relLuminance(night) > 0x53 * GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'the softer night dino sits under this cool foot gray'
      );
      assert(
        relLuminance(night) < 0x53 * GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'night dust stays quieter than night cacti'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'day Updated keeps the brown foot dust');
      assert(liveColors('jump').every(c => c === DAY_DUST), 'a day jump kicks brown dust');
      assert(liveColors('land').every(c => c === DAY_DUST), 'a day landing kicks brown dust');

      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST,
        'the ease starts with the sky, still brown at the boundary');
      game.score = 350;
      const mid = landDustColor(DAY_DUST);
      assert(mid !== DAY_DUST && mid !== night, 'mid-twilight is between brown and night dust');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      const almost = landDustColor(DAY_DUST);
      assert(almost !== night, 'one point before night is still easing, not snapped');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(landDustColor(DAY_DUST), night, 'full night holds the cool dust');
      assert(liveColors('jump').every(c => c === night), 'a night jump kicks cool dust');
      assert(liveColors('land').every(c => c === night), 'a night landing kicks cool dust');
      game.score = 1000;
      assertEquals(landDustColor(DAY_DUST), night, 'later night keeps the same cool dust');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(landDustColor(DAY_DUST), night, 'Daily shares the Updated night dust');
      assert(liveColors('land').every(c => c === night), 'a Daily night landing kicks cool dust');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'Classic night dust stays the day brown');
      assertEquals(liveColors('jump').length, 0, 'Classic still emits no foot dust');
      assertEquals(liveColors('land').length, 0, 'Classic still emits no land dust');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('reduced motion snaps to night dust instead of easing, and still damps the burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST,
        'reduced motion keeps brown dust while the sky is still changing');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST,
        'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(landDustColor(DAY_DUST), GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'reduced motion still gets the static night dust');
      const emitted = Particles.emit('land', 80, 140);
      const damped = Math.max(1, Math.round(Particles.KINDS.land.count * 0.25));
      assertEquals(emitted, damped, 'reduced motion still damps the land burst');
      assert(
        Particles.particles.filter(p => p.life > 0).every(p => p.color === GAME_CONFIG.NIGHT_LAND_DUST_COLOR),
        'the damped night burst is still cool dust'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
      setQaNight(false);
      Particles.reset();
    }
  });

  it('?qaNight=1 cools Updated foot dust immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(landDustColor(DAY_DUST), GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'the existing night QA flag is enough to see night dust');
      assert(liveColors('jump').every(c => c === GAME_CONFIG.NIGHT_LAND_DUST_COLOR),
        'a QA-night jump kicks cool dust at score 0');
      assertEquals(game.score, 0, 'night dust must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'QA night still leaves Classic dust brown');
      assertEquals(liveColors('land').length, 0, 'QA night does not add Classic foot dust');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      Particles.reset();
    }
  });

  it('NIGHT_LAND_DUST_COLOR override changes only the night dust', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_LAND_DUST_COLOR: '#556677' }, () => {
        assertEquals(landDustColor(DAY_DUST), '#556677',
          'a visual override should recolor night foot dust');
        assert(liveColors('land').every(c => c === '#556677'),
          'emitted night land dust uses the tuned color');
      });
      assertEquals(landDustColor(DAY_DUST), GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'clearing the override returns the configured night dust');
      game.score = 0;
      withTuning({ NIGHT_LAND_DUST_COLOR: '#556677' }, () => {
        assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'day dust ignores the night override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_LAND_DUST_COLOR: 'dust' }, () => {
        assertEquals(landDustColor(DAY_DUST), GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'a non-color override falls back to the configured night dust');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  // Night sky showing through #6a686e, and the night ground strip.
  function compositedDust(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const dust = [0x6a, 0x68, 0x6e];
    return sky.map((s, i) => s + (dust[i] - s) * alpha);
  }

  function compositedGroundLum() {
    const sky = [0x1a, 0x1a, 0x2e];
    const ground = [0x53, 0x53, 0x53];
    const mixed = sky.map((s, i) => s + (ground[i] - s) * GAME_CONFIG.NIGHT_GROUND_ALPHA);
    return 0.2126 * mixed[0] + 0.7152 * mixed[1] + 0.0722 * mixed[2];
  }

  function channelLum(channels) {
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function liveBurst(kind) {
    Particles.reset();
    const n = Particles.emit(kind, 80, 140);
    return { n: n, motes: Particles.particles.filter(p => p.life > 0) };
  }

  it('softens jump and land dust once the sky is fully night, and leaves day alone', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    try {
      setQaNight(false);
      setReducedMotion(false);
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COLOR, '#6a686e',
        'night dust stays the cool gray; the quiet is the ink, not a new color');
      assertEquals(GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA, 0.42,
        'night takeoff uses the quieter peak');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_ALPHA, 0.36,
        'night landing uses the quieter peak');
      assertEquals(GAME_CONFIG.NIGHT_JUMP_DUST_COUNT, 2,
        'night takeoff emits fewer motes');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 3,
        'night landing emits fewer motes');
      assert(GAME_CONFIG.NIGHT_LAND_DUST_COUNT > GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
        'a night landing still reads heavier than a takeoff');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 6,
        'night motes die sooner');
      assert(GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA < Particles.KINDS.jump.alpha,
        'night takeoff is softer than the day peak');
      assert(GAME_CONFIG.NIGHT_LAND_DUST_ALPHA < Particles.KINDS.land.alpha,
        'night landing is softer than the day peak');
      assert(GAME_CONFIG.NIGHT_LAND_DUST_ALPHA < GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
        'the wider night landing stays the softer of the two');
      assertEquals(Particles.KINDS.jump.alpha, 0.5, 'day takeoff peak stays 0.5');
      assertEquals(Particles.KINDS.land.alpha, 0.4, 'day landing peak stays 0.4');
      assertEquals(Particles.KINDS.jump.count, 3, 'day takeoff count stays 3');
      assertEquals(Particles.KINDS.land.count, 5, 'day landing count stays 5');
      assertEquals(Particles.KINDS.jump.life, 8, 'day life stays 8');
      assertEquals(Particles.KINDS.land.life, 8, 'day land life stays 8');

      const road = compositedGroundLum();
      const dayJump = channelLum(compositedDust(Particles.KINDS.jump.alpha));
      const nightJump = channelLum(compositedDust(GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA));
      const dayLand = channelLum(compositedDust(Particles.KINDS.land.alpha));
      const nightLand = channelLum(compositedDust(GAME_CONFIG.NIGHT_LAND_DUST_ALPHA));
      const sunkJump = channelLum(compositedDust(Particles.KINDS.jump.alpha * 0.6));
      const sunkLand = channelLum(compositedDust(Particles.KINDS.land.alpha * 0.6));
      assert(nightJump < dayJump, 'night takeoff lifts the road less than the day peak');
      assert(nightLand < dayLand, 'night landing lifts the road less than the day peak');
      assert(nightJump > road, 'night takeoff still reads above the night ground');
      assert(nightLand > road, 'night landing still reads above the night ground');
      assert(sunkJump <= road + 0.2, 'three-fifths of the day takeoff alpha would land on the road');
      assert(sunkLand < road, 'three-fifths of the day landing alpha would sink under the road');
      const jumpLift = dayJump - road;
      const landLift = dayLand - road;
      assert(Math.abs((nightJump - road) - jumpLift * 0.6) < 0.15,
        'night takeoff keeps about three-fifths of the old lift over the road');
      assert(Math.abs((nightLand - road) - landLift * 0.6) < 0.15,
        'night landing keeps about three-fifths of the old lift over the road');

      game.mode = MODES.UPDATED;
      game.score = 0;
      let burst = liveBurst('jump');
      assertEquals(burst.n, Particles.KINDS.jump.count, 'a day jump still emits the day count');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, Particles.KINDS.jump.alpha, 'a day jump keeps the day peak');
        assertEquals(p.life, Particles.KINDS.jump.life, 'a day jump keeps the day life');
        assertEquals(p.color, DAY_DUST, 'a day jump stays brown');
      });
      burst = liveBurst('land');
      assertEquals(burst.n, Particles.KINDS.land.count, 'a day landing still emits the day count');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, Particles.KINDS.land.alpha, 'a day landing keeps the day peak');
        assertEquals(p.life, Particles.KINDS.land.life, 'a day landing keeps the day life');
      });

      game.score = 350;
      const jumpMid = Particles.KINDS.jump.alpha
        + (GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA - Particles.KINDS.jump.alpha) * 0.5;
      const landMid = Particles.KINDS.land.alpha
        + (GAME_CONFIG.NIGHT_LAND_DUST_ALPHA - Particles.KINDS.land.alpha) * 0.5;
      burst = liveBurst('jump');
      assertEquals(burst.n, Particles.KINDS.jump.count,
        'twilight still uses the day takeoff count');
      burst.motes.forEach((p) => {
        assert(Math.abs(p.alpha - jumpMid) < 1e-9, 'mid-twilight eases the takeoff peak');
        assertEquals(p.life, Particles.KINDS.jump.life, 'twilight still uses the day life');
      });
      burst = liveBurst('land');
      assertEquals(burst.n, Particles.KINDS.land.count,
        'twilight still uses the day landing count');
      burst.motes.forEach((p) => {
        assert(Math.abs(p.alpha - landMid) < 1e-9, 'mid-twilight eases the landing peak');
      });

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      burst = liveBurst('jump');
      assertEquals(burst.n, GAME_CONFIG.NIGHT_JUMP_DUST_COUNT, 'a night jump emits the shorter count');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA, 'a night jump uses the quieter peak');
        assertEquals(p.life, GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 'a night jump uses the shorter life');
        assertEquals(p.maxLife, GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 'a night jump fades across that life');
        assertEquals(p.color, GAME_CONFIG.NIGHT_LAND_DUST_COLOR, 'a night jump stays the cool gray');
        assertEquals(p.size, Particles.KINDS.jump.size, 'night motes stay the day size');
      });
      burst = liveBurst('land');
      assertEquals(burst.n, GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 'a night landing emits the shorter count');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, GAME_CONFIG.NIGHT_LAND_DUST_ALPHA, 'a night landing uses the quieter peak');
        assertEquals(p.life, GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 'a night landing uses the shorter life');
        assertEquals(p.color, GAME_CONFIG.NIGHT_LAND_DUST_COLOR, 'a night landing stays the cool gray');
      });

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      burst = liveBurst('land');
      assertEquals(burst.n, GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 'Daily night landing shares the shorter count');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, GAME_CONFIG.NIGHT_LAND_DUST_ALPHA, 'Daily night landing shares the quieter peak');
        assertEquals(p.life, GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 'Daily night landing shares the shorter life');
      });

      game.mode = MODES.CLASSIC;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(liveBurst('jump').n, 0, 'Classic still emits no jump dust');
      assertEquals(liveBurst('land').n, 0, 'Classic still emits no land dust');
      assertEquals(rngCalls, 0, 'quieter night dust does not consume the run seed');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('reduced motion snaps the night peaks and still damps the shorter burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      const burstMid = liveBurst('land');
      assertEquals(burstMid.n, Math.max(1, Math.round(Particles.KINDS.land.count * 0.25)),
        'reduced motion during twilight still damps the day landing');
      burstMid.motes.forEach((p) => {
        assertEquals(p.alpha, Particles.KINDS.land.alpha,
          'reduced motion does not ease the landing peak during twilight');
        assertEquals(p.life, Math.max(2, Math.round(Particles.KINDS.land.life * 0.5)),
          'reduced motion during twilight still halves the day life');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const burst = liveBurst('land');
      const nightCount = Math.max(1, Math.round(GAME_CONFIG.NIGHT_LAND_DUST_COUNT * 0.25));
      const nightLife = Math.max(2, Math.round(GAME_CONFIG.NIGHT_LAND_DUST_LIFE * 0.5));
      assertEquals(burst.n, nightCount, 'reduced motion quarters the night landing count');
      assert(nightCount < GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 'the night damp still removes motes');
      burst.motes.forEach((p) => {
        assertEquals(p.alpha, GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
          'reduced motion snaps to the night landing peak');
        assertEquals(p.life, nightLife, 'reduced motion halves the shorter night life');
        assertEquals(p.color, GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'the damped night burst stays cool dust');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
      setQaNight(false);
      Particles.reset();
    }
  });

  it('night dust alpha and count overrides change only the night burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({
        NIGHT_JUMP_DUST_ALPHA: 0.22,
        NIGHT_LAND_DUST_ALPHA: 0.18,
        NIGHT_JUMP_DUST_COUNT: 4,
        NIGHT_LAND_DUST_COUNT: 4,
        NIGHT_LAND_DUST_LIFE: 4,
      }, () => {
        const jump = liveBurst('jump');
        assertEquals(jump.n, 4, 'a visual override should change the night takeoff count');
        jump.motes.forEach((p) => {
          assertEquals(p.alpha, 0.22, 'a visual override should change the night takeoff peak');
          assertEquals(p.life, 4, 'a visual override should change the night life');
        });
        const land = liveBurst('land');
        assertEquals(land.n, 4, 'a visual override should change the night landing count');
        land.motes.forEach((p) => {
          assertEquals(p.alpha, 0.18, 'a visual override should change the night landing peak');
        });
      });
      const restored = liveBurst('jump');
      assertEquals(restored.n, GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
        'clearing the override returns the night takeoff count');
      restored.motes.forEach((p) => {
        assertEquals(p.alpha, GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
          'clearing the override returns the night takeoff peak');
      });
      game.score = 0;
      withTuning({ NIGHT_JUMP_DUST_ALPHA: 0.22, NIGHT_JUMP_DUST_COUNT: 4 }, () => {
        const day = liveBurst('jump');
        assertEquals(day.n, Particles.KINDS.jump.count, 'day count ignores the night override');
        day.motes.forEach((p) => {
          assertEquals(p.alpha, Particles.KINDS.jump.alpha, 'day peak ignores the night override');
        });
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({
        NIGHT_JUMP_DUST_ALPHA: 2,
        NIGHT_LAND_DUST_ALPHA: 'soft',
        NIGHT_JUMP_DUST_COUNT: 0,
        NIGHT_LAND_DUST_COUNT: -3,
        NIGHT_LAND_DUST_LIFE: 1,
      }, () => {
        const jump = liveBurst('jump');
        assertEquals(jump.n, GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
          'a bad count override falls back to the night takeoff count');
        jump.motes.forEach((p) => {
          assertEquals(p.alpha, GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
            'a bad peak override falls back to the night takeoff peak');
          assertEquals(p.life, GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
            'a too-short life override falls back to the night life');
        });
        const land = liveBurst('land');
        land.motes.forEach((p) => {
          assertEquals(p.alpha, GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
            'a bad landing peak falls back to the night landing peak');
        });
      });
      setReducedMotion(true);
      withTuning({ NIGHT_LAND_DUST_COUNT: 8 }, () => {
        const damped = liveBurst('land');
        assertEquals(damped.n, Math.max(1, Math.round(8 * 0.25)),
          'reduced motion quarters the tuned night count, not the day count');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('leaves trail, collision, confetti, and plateau colors alone at night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      for (const kind of ['trail', 'collision', 'confetti', 'plateau', 'plateauQa']) {
        const colors = liveColors(kind);
        assert(colors.length > 0, kind + ' still emits at night');
        assert(colors.every(c => c === Particles.KINDS[kind].color),
          kind + ' keeps its own color at night');
      }
      assertEquals(rngCalls, 0, 'recoloring foot dust does not consume the run seed');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
    }
  });
});

describe('Night ground cool', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  // Night sky #1a1a2e showing through the day ground sprite #535353.
  function compositedGround(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const ground = [0x53, 0x53, 0x53];
    return sky.map((s, i) => s + (ground[i] - s) * alpha);
  }

  function relLuminance(channels) {
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function dustLuminance() {
    const hex = GAME_CONFIG.NIGHT_LAND_DUST_COLOR;
    return relLuminance([
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
  }

  it('eases Updated and Daily ground down after full night, cooler than the day strip', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      assert(GAME_CONFIG.NIGHT_GROUND_ALPHA < 1, 'night ground is dimmer than the day strip');
      assert(GAME_CONFIG.NIGHT_GROUND_ALPHA > 0, 'night ground stays visible against the night sky');
      assert(GAME_CONFIG.NIGHT_GROUND_ALPHA > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the running line stays firmer than the soft night clouds');
      const night = compositedGround(GAME_CONFIG.NIGHT_GROUND_ALPHA);
      const day = compositedGround(1);
      assert(relLuminance(night) < relLuminance(day), 'night ground is dimmer than the day strip');
      assert(night[2] - night[0] > day[2] - day[0], 'night sky bleed cools the neutral day gray');
      assert(relLuminance(night) < dustLuminance(),
        'night ground stays quieter than the cooled foot dust');
      assert(relLuminance(night) < 0x53 * GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'night ground stays quieter than the night dino');
      assert(relLuminance(night) < 0x53 * GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'night ground stays quieter than night cacti');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(groundPaintAlpha(), 1, 'day Updated keeps the day-bright ground');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(groundPaintAlpha(), 1, 'the ease starts with the sky, still day-bright at the boundary');
      game.score = 350;
      const mid = 1 + (GAME_CONFIG.NIGHT_GROUND_ALPHA - 1) * 0.5;
      assert(
        Math.abs(groundPaintAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from day-bright to the night cool'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(groundPaintAlpha() < 1 && groundPaintAlpha() > GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'one point before night is still easing, not snapped');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'full night holds the cool dim');
      game.score = 1000;
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'later night keeps the same static dim');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'Daily shares the Updated night ground cool');

      game.mode = MODES.CLASSIC;
      game.score = 0;
      assertEquals(groundPaintAlpha(), 1, 'Classic day ground stays as it is');
      game.score = 350;
      assertEquals(groundPaintAlpha(), 1, 'Classic twilight ground stays as it is');
      game.score = 1000;
      assertEquals(groundPaintAlpha(), 1, 'Classic night ground stays as it is');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night dim instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(groundPaintAlpha(), 1,
        'reduced motion keeps day-bright ground while the sky is still day');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(groundPaintAlpha(), 1,
        'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'reduced motion still gets the static night ground');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 cools Updated ground immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'the existing night QA flag is enough to see the cool');
      assertEquals(game.score, 0, 'the cool must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(groundPaintAlpha(), 1,
        'QA night still leaves Classic ground alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('NIGHT_GROUND_ALPHA override changes only the night dim', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_GROUND_ALPHA: 0.4 }, () => {
        assertEquals(groundPaintAlpha(), 0.4,
          'a visual override should dim night ground by the tuned amount');
      });
      assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'clearing the override returns the configured night dim');
      game.score = 0;
      withTuning({ NIGHT_GROUND_ALPHA: 0.4 }, () => {
        assertEquals(groundPaintAlpha(), 1, 'day ground ignores the night override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_GROUND_ALPHA: 'soft' }, () => {
        assertEquals(groundPaintAlpha(), GAME_CONFIG.NIGHT_GROUND_ALPHA,
          'a non-numeric override falls back to the configured dim');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('paints the cool only around the ground blit and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origAlpha = ctx.globalAlpha;
    const origGroundX = game.groundX;
    const origSpeed = game.currentSpeed;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    const seen = [];
    const origDraw = ctx.drawImage;
    ctx.drawImage = function (...args) {
      seen.push(ctx.globalAlpha);
      return origDraw.apply(this, args);
    };
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.groundX = -40;
      game.score = 0;
      ctx.globalAlpha = 1;
      drawGround();
      assertEquals(seen.length, 2, 'day still blits the strip twice so it can scroll');
      assert(seen.every(a => a === 1), 'day ground stays fully opaque');
      assertEquals(ctx.globalAlpha, 1, 'a day draw leaves the obstacle lane alone');
      assertEquals(game.groundX, -40, 'painting ground does not scroll it');

      seen.length = 0;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.globalAlpha = 0.8;
      drawGround();
      assertEquals(seen.length, 2, 'night still blits the same two tiles');
      assert(seen.every(a => Math.abs(a - 0.8 * GAME_CONFIG.NIGHT_GROUND_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the ground cool');
      assertEquals(ctx.globalAlpha, 0.8, 'the cool must not leak onto the dino or cacti');
      assertEquals(game.groundX, -40, 'night paint does not scroll the strip');
      assertEquals(game.currentSpeed, origSpeed, 'night paint does not change speed');
      assertEquals(rngCalls, 0, 'painting ground does not consume the run seed');

      seen.length = 0;
      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.globalAlpha = 1;
      drawGround();
      assert(seen.every(a => a === 1), 'Classic night paint stays day-bright');
      assertEquals(ctx.globalAlpha, 1, 'Classic paint leaves the lane alone');
      assertEquals(game.groundX, -40, 'Classic paint does not scroll the strip');
    } finally {
      ctx.drawImage = origDraw;
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      game.groundX = origGroundX;
      ctx.globalAlpha = origAlpha;
      setQaNight(false);
      setReducedMotion(false);
    }
  });
});

describe('Soft night ground', () => {
  function groundLifts(alpha) {
    const sky = [0x1a, 0x1a, 0x2e];
    const sprite = [0x53, 0x53, 0x53];
    return sprite.map((channel, i) => (channel - sky[i]) * alpha);
  }

  it('night ground keeps a quieter share of the old 0.55 band and stays the road edge', () => {
    const now = GAME_CONFIG.NIGHT_GROUND_ALPHA;
    const old = 0.55;
    const fullThreeFifths = old * 0.6;
    const nowLifts = groundLifts(now);
    const oldLifts = groundLifts(old);
    const sum = (levels) => levels.reduce((total, n) => total + n, 0);
    const groundRed = 0x1a + (0x53 - 0x1a) * now;
    const hillRed = parseInt(GAME_CONFIG.HILL_COLOR_NIGHT.slice(1, 3), 16);
    assertEquals(now, 0.42, 'night ground uses the quieter strip');
    assert(now > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
      'the running line stays firmer than the soft night clouds');
    assert(now - GAME_CONFIG.NIGHT_CLOUD_ALPHA >= 0.05,
      'the strip stays clearly above the night-cloud whisper');
    assert(sum(nowLifts) < sum(oldLifts) * 0.85,
      'the strip loses a real share of the old 0.55 lift');
    const threeFifthsRed = 0x1a + (0x53 - 0x1a) * fullThreeFifths;
    assert(fullThreeFifths > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
      'a full three-fifths of 0.55 now sits above the quieter night clouds');
    assert(Math.abs(threeFifthsRed - hillRed) < 1,
      'that step still lands on the night hills, so the strip stays at 0.42');
    assert(groundRed > hillRed,
      'the road edge stays lighter than the night hills');
    assertEquals(GAME_CONFIG.HILL_COLOR_DAY, '#e1e1e1', 'day hills stay the quieter day fill');
  });
});

describe('Night milestone tint', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  // Simple relative luminance. Gold (255, 215, 0) on white is a small drop;
  // the same gold on the night sky is a lift. Compare the magnitudes.
  function relLuminance(channels) {
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function washLift(alpha, sky) {
    const gold = [255, 215, 0];
    const painted = sky.map((s, i) => s + (gold[i] - s) * alpha);
    return Math.abs(relLuminance(painted) - relLuminance(sky));
  }

  function paintedTint() {
    const fillStyles = [];
    const rects = [];
    let captured = '';
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return captured; },
      set(v) { captured = v; fillStyles.push(v); },
    });
    const origFill = ctx.fillRect;
    ctx.fillRect = function (...args) {
      rects.push(args.slice());
      return origFill.apply(this, args);
    };
    try {
      drawSkyTint();
    } finally {
      delete ctx.fillStyle;
      ctx.fillRect = origFill;
    }
    return { fillStyles, rects };
  }

  it('eases Updated and Daily milestone tint down after full night, quieter than the day wash', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const daySky = [255, 255, 255];
    const nightSky = [0x1a, 0x1a, 0x2e];
    try {
      setQaNight(false);
      setReducedMotion(false);
      assertEquals(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA, 0.024,
        'night peak keeps three-fifths of the old 0.04 veil');
      assert(Math.abs(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA - 0.04 * 0.6) < 1e-9,
        'the quieter peak is exactly three-fifths of the previous night band');
      assertEquals(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, 0.06,
        'day peak stays the quieter day wash');
      assert(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA < GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'night peak is lower than the day peak so twilight still eases down');
      assert(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA > 0, 'the level cue still paints at night');
      const cactus = [0x53, 0x53, 0x53];
      const laneNow = washLift(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, cactus);
      const laneVeil = washLift(0.12, cactus);
      assert(laneNow > 0, 'the day wash still warms the lane');
      assert(laneNow <= laneVeil * 0.5,
        'gold on the day cactus stays at most half the old veil');
      const dayLift = washLift(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, daySky);
      const nightLift = washLift(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA, nightSky);
      const previousNight = washLift(0.04, nightSky);
      const oldDayOnWhite = washLift(0.12, daySky);
      const oldPunch = washLift(0.12, nightSky);
      const nightSkyChannels = [0x1a, 0x1a, 0x2e];
      const gold = [255, 215, 0];
      const nightOff = gold.map((channel, i) => Math.abs(channel - nightSkyChannels[i]) * 0.024);
      assertEquals(nightOff.map(n => Math.round(n)).join(','), '5,5,1',
        'full night gold sits about 5, 5, and 1 levels off the night sky');
      assert(nightLift < previousNight * 0.75,
        'night wash loses a real share of the 0.04 veil');
      assert(Math.abs(nightLift - previousNight * 0.6) < 1e-9,
        'the luminance step is the same three-fifths, because the blend is linear');
      assert(nightLift < oldPunch * 0.5,
        'night wash stays much quieter than the old day peak on the night sky');
      assert(nightLift > oldDayOnWhite * 0.5 && nightLift < oldDayOnWhite * 1.6,
        'night lift stays near the old day cue on white, so the gold still reads once');
      assert(dayLift < oldDayOnWhite,
        'the quieter day wash lifts white less than the old veil');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'day Updated keeps the day peak');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'the ease starts with the sky, still the day peak at the boundary');
      game.score = 350;
      const mid = GAME_CONFIG.SKY_TINT_PEAK_ALPHA
        + (GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA - GAME_CONFIG.SKY_TINT_PEAK_ALPHA) * 0.5;
      assert(
        Math.abs(skyTintPeakAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the day peak to the night peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        skyTintPeakAlpha() < GAME_CONFIG.SKY_TINT_PEAK_ALPHA
          && skyTintPeakAlpha() > GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'full night holds the quiet peak');
      game.score = 1000;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'later night keeps the same static peak');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'Daily shares the Updated night peak');

      game.mode = MODES.CLASSIC;
      game.score = 0;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic day peak stays the day value');
      game.score = 350;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic twilight peak stays the day value');
      game.score = 1000;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic night peak stays the day value');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night peak instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'reduced motion keeps the day peak while the sky is still day');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'reduced motion still gets the static night peak');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 quiets the Updated milestone tint immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'the existing night QA flag is enough to see the quiet peak');
      assertEquals(game.score, 0, 'the quiet peak must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'QA night still leaves the Classic peak at the day value');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('NIGHT_SKY_TINT_PEAK_ALPHA override changes only the night peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 0.02 }, () => {
        assertEquals(skyTintPeakAlpha(), 0.02,
          'a visual override should quiet the night flash by the tuned amount');
      });
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'clearing the override returns the configured night peak');
      game.score = 0;
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 0.02, SKY_TINT_PEAK_ALPHA: 0.2 }, () => {
        assertEquals(skyTintPeakAlpha(), 0.2, 'day flash keeps the day peak override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ SKY_TINT_PEAK_ALPHA: 0.2 }, () => {
        assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'a day-peak override does not brighten the night flash');
      });
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 'soft' }, () => {
        assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'a non-numeric override falls back to the configured peak');
      });
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'an out-of-range override falls back to the configured peak');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('paints the quiet gold only during a night milestone and leaves the run alone', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFrames = Animations.milestoneFrames;
    const origSpeed = game.currentSpeed;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
      const day = paintedTint();
      const dayGold = day.fillStyles.find(s => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0);
      assert(dayGold, 'day milestone still paints the gold wash');
      assert(dayGold.indexOf(GAME_CONFIG.SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'day wash uses the day peak');
      assertEquals(day.rects.length, 1, 'day wash is one full-canvas fill');
      assertEquals(day.rects[0][2], GAME_CONFIG.CANVAS_W, 'day wash covers the canvas width');
      assertEquals(day.rects[0][3], GAME_CONFIG.CANVAS_H, 'day wash covers the canvas height');
      assertEquals(game.score, 0, 'painting the day wash does not move the score');
      assertEquals(rngCalls, 0, 'painting the day wash does not consume the run seed');
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES,
        'the tint does not consume the milestone timer');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const night = paintedTint();
      const nightGold = night.fillStyles.find(s => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0);
      assert(nightGold, 'night milestone still paints the gold wash');
      assert(nightGold.indexOf(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'night wash uses the quiet peak');
      assert(nightGold !== dayGold, 'night wash is quieter than the day wash');
      assertEquals(night.rects.length, 1, 'night wash is still one full-canvas fill');
      assertEquals(game.score, GAME_CONFIG.DAY_NIGHT_END, 'painting the night wash does not move the score');
      assertEquals(game.currentSpeed, origSpeed, 'night paint does not change speed');
      assertEquals(rngCalls, 0, 'painting the night wash does not consume the run seed');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
      const classic = paintedTint();
      assertEquals(classic.fillStyles.length, 0, 'Classic never paints the milestone tint');
      assertEquals(classic.rects.length, 0, 'Classic never fills the canvas for the tint');
      assertEquals(rngCalls, 0, 'skipping Classic paint does not consume the run seed');

      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      setReducedMotion(true);
      const reduced = paintedTint();
      assertEquals(reduced.fillStyles.length, 0, 'reduced motion still suppresses the tint');
      assertEquals(reduced.rects.length, 0, 'reduced motion does not fill the canvas');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      Animations.milestoneFrames = origFrames;
      setQaNight(false);
      setReducedMotion(false);
    }
  });
});

describe('QA level flag (?qaLevel=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armFreshRun() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Animations.milestoneFrames = 0;
    game.qaLevelShown = false;
  }

  function goldWashDuring(fn) {
    const fillStyles = [];
    let captured = '';
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return captured; },
      set(v) { captured = v; fillStyles.push(v); },
    });
    try {
      fn();
    } finally {
      delete ctx.fillStyle;
    }
    return fillStyles.filter(s => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0);
  }

  it('recognizes only ?qaLevel=1', () => {
    assert(readQaLevelFlag('?qaLevel=1') === true, '?qaLevel=1 should enable the early level wash');
    assert(readQaLevelFlag('?qaNight=1&qaLevel=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaLevelFlag('?qaLevel=1&qaNight=1') === true, 'param order should not matter');
    assert(readQaLevelFlag('') === false, 'a normal visit should leave the wash on the real level');
    assert(readQaLevelFlag('?qaLevel=0') === false, 'only the value 1 enables the flag');
    assert(readQaLevelFlag('?qaLevel=12') === false, 'qaLevel=12 must not count as the flag');
    assert(readQaLevelFlag('?qaNight=1') === false, 'night alone must not fire the early wash');
  });

  it('fires the Updated wash once at the start without moving score, speed, or the seed', () => {
    const origMode = game.mode;
    try {
      setQaNight(false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      game.rng = mulberry32(7);
      setQaLevel(false);
      tick();
      const rngAfterOff = game.rng();
      const speedOff = game.currentSpeed;
      assertEquals(Animations.milestoneFrames, 0, 'flag off keeps the wash on the real level');
      assertEquals(game.qaLevelShown, false, 'flag off does not spend the early latch');

      armFreshRun();
      game.mode = MODES.UPDATED;
      game.rng = mulberry32(7);
      setQaLevel(true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 1, 'the first running frame paints one gold wash');
      assert(gold[0].indexOf(GAME_CONFIG.SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'qaLevel alone keeps the familiar day wash');
      assertEquals(game.milestoneText, 'LEVEL 2', 'the early flash uses the first real level label');
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'the wash starts a full milestone and then counts down one frame');
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, 'the early flash must not jump the score');
      assert(
        Math.abs(game.currentSpeed - DifficultyProfile.speedAtScore(game.score)) < 1e-6,
        'speed still follows the real score'
      );
      assertEquals(game.currentSpeed, speedOff, 'the flag does not change speed versus a normal first frame');
      assertEquals(game.rng(), rngAfterOff, 'the early flash does not consume the run seed');
      assertEquals(game.qaLevelShown, true, 'the early flash is once per run');
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'day score with qaLevel stays on the day peak');

      tick();
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 2,
        'the next frame continues the same wash instead of restarting it');
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT * 2, 'scoring keeps its normal step');

      game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05;
      tick();
      assertEquals(game.milestoneText, 'LEVEL 2', 'a real level-up still flashes with the flag on');
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'crossing 100 still starts a full wash');
      assert(game.score >= GAME_CONFIG.SCORE_PER_LEVEL, 'the real level still arrives by score');
    } finally {
      game.mode = origMode;
      setQaLevel(false);
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Daily shares the early wash; Classic never paints the tint', () => {
    const origMode = game.mode;
    try {
      setQaNight(false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.DAILY;
      setQaLevel(true);
      tick();
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'Daily shares the Updated early wash');
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, 'Daily early wash must not jump the score');

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaLevel(true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 0, 'Classic never paints the gold wash');
      assertEquals(Animations.milestoneFrames, 0, 'Classic does not take the early flash');
      assertEquals(game.qaLevelShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, 'Classic scoring stays on the normal step');
    } finally {
      game.mode = origMode;
      setQaLevel(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNight=1 with ?qaLevel=1 paints the quiet night peak while the score stays low', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      setQaNight(true);
      setQaLevel(true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 1, 'night plus level still paints one wash');
      assert(gold[0].indexOf(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'the night flag selects the quiet peak');
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, 'the pair of flags must not jump the score');
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'the quiet peak is the one on screen at the start of the run');
    } finally {
      game.mode = origMode;
      setQaLevel(false);
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('without the flag the first frames stay quiet and score 100 still flashes', () => {
    const origMode = game.mode;
    try {
      setQaLevel(false);
      setQaNight(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      tick();
      assertEquals(Animations.milestoneFrames, 0, 'a normal run does not flash at the start');
      assertEquals(game.qaLevelShown, false);
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT);

      game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05;
      tick();
      assertEquals(game.milestoneText, 'LEVEL 2', 'score 100 still uses the real level label');
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'score 100 still starts the full wash');
      assert(game.score >= GAME_CONFIG.SCORE_PER_LEVEL, 'the level still unlocks at 100');
    } finally {
      game.mode = origMode;
      setQaLevel(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaLevel=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    global.location = { search: '?qaNight=1&qaLevel=1' };
    try {
      setQaLevel(false);
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      tick();
      assertEquals(game.qaLevelShown, true, 'resetGame should arm the early wash from location.search');
      assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'the re-read flag still fires on the first running frame');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(skyTintPeakAlpha(), GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'qaNight on the same query still selects the quiet peak');
    } finally {
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaLevel(false);
      setQaNight(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Night death flash', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  // White on the day sky (#ffffff) does not move the sky. The same overlay
  // on #1a1a2e is a luminance jump across the whole canvas.
  function relLuminance(channels) {
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function whiteWash(alpha, sky) {
    const white = [255, 255, 255];
    return sky.map((s, i) => s + (white[i] - s) * alpha);
  }

  function paintedFlash() {
    const fillStyles = [];
    const rects = [];
    let captured = '';
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return captured; },
      set(v) { captured = v; fillStyles.push(v); },
    });
    const origFill = ctx.fillRect;
    ctx.fillRect = function (...args) {
      rects.push(args.slice());
      return origFill.apply(this, args);
    };
    try {
      drawDeathFlash();
    } finally {
      delete ctx.fillStyle;
      ctx.fillRect = origFill;
    }
    return { fillStyles, rects };
  }

  it('eases Updated and Daily death flash down after full night, quieter than the day blink', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const nightSky = [0x1a, 0x1a, 0x2e];
    const dayDino = [0x53, 0x53, 0x53];
    try {
      setQaNight(false);
      setReducedMotion(false);
      const dayPeak = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA;
      assert(dayPeak < 1, 'day peak is quieter than a full white overlay');
      assert(dayPeak > 0, 'the day death cue still paints');
      assert(dayPeak > GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'the day blink stays stronger than the night blink');
      const washedDino = whiteWash(dayPeak, dayDino);
      const dinoLum = relLuminance(dayDino);
      const dayLum = relLuminance(washedDino);
      const daySlap = relLuminance(whiteWash(1, dayDino)) - dinoLum;
      assert(dayLum > dinoLum * 2,
        'the day blink more than doubles luminance on the dark shapes');
      assert(dayLum - dinoLum < daySlap * 0.6,
        'the day blink is quieter than a full white overlay on those shapes');
      assert(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA < 1,
        'night peak is lower than a full white overlay');
      assert(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA > 0,
        'the death cue still paints at night');
      const painted = whiteWash(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA, nightSky);
      const nightLum = relLuminance(painted);
      const skyLum = relLuminance(nightSky);
      const slapped = relLuminance(whiteWash(1, nightSky)) - skyLum;
      assert(nightLum < relLuminance(dayDino),
        'the night blink stays darker than the day dino so the sky does not slap white');
      assert(nightLum > skyLum * 2,
        'the night blink is still bright enough to read as the death cue');
      assert(nightLum - skyLum < slapped * 0.35,
        'night blink is much quieter than a full white overlay on the night sky');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(deathFlashPeakAlpha(), dayPeak, 'day Updated uses the quieter day blink');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(deathFlashPeakAlpha(), dayPeak,
        'the ease starts with the sky, still the quieter day blink at the boundary');
      game.score = 350;
      const mid = dayPeak + (GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA - dayPeak) * 0.5;
      assert(
        Math.abs(deathFlashPeakAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the day blink to the night peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        deathFlashPeakAlpha() < GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA
          && deathFlashPeakAlpha() > GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'full night holds the quiet peak');
      game.score = 1000;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'later night keeps the same static peak');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'Daily shares the Updated night peak');

      game.mode = MODES.CLASSIC;
      game.score = 0;
      assertEquals(deathFlashPeakAlpha(), 1, 'Classic day blink stays the day value');
      game.score = 350;
      assertEquals(deathFlashPeakAlpha(), 1, 'Classic twilight blink stays the day value');
      game.score = 1000;
      assertEquals(deathFlashPeakAlpha(), 1, 'Classic night blink stays the day value');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night peak instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion keeps the quieter day blink while the sky is still day');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion still gets the static night peak');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
    }
  });

  it('?qaNight=1 quiets the Updated death flash immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaNight(true);
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'the existing night QA flag is enough to see the quiet blink');
      assertEquals(game.score, 0, 'the quiet blink must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(deathFlashPeakAlpha(), 1,
        'QA night still leaves the Classic blink at the day value');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
    }
  });

  it('NIGHT_DEATH_FLASH_PEAK_ALPHA override changes only the night peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 0.05 }, () => {
        assertEquals(deathFlashPeakAlpha(), 0.05,
          'a visual override should quiet the night blink by the tuned amount');
      });
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'clearing the override returns the configured night peak');
      game.score = 0;
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 0.05 }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'day blink ignores the night peak override');
      });
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 0.7 }, () => {
        assertEquals(deathFlashPeakAlpha(), 0.7,
          'a visual override should quiet or lift the day blink by the tuned amount');
      });
      assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'clearing the day override returns the configured day peak');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 0.7 }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a day peak override does not brighten the night blink');
      });
      game.score = 0;
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 'loud' }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'a non-numeric day override falls back to the configured peak');
      });
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'an out-of-range day override falls back to the configured peak');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DEATH_FLASH_FRAMES: 3 }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a frame-length override does not brighten the night peak');
      });
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 'soft' }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a non-numeric override falls back to the configured peak');
      });
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(deathFlashPeakAlpha(), GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'an out-of-range override falls back to the configured peak');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('paints the quiet white only while the night flash is up and leaves the run alone', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFrames = Animations.deathFlashFrames;
    const origSpeed = game.currentSpeed;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      Animations.deathFlashFrames = GAME_CONFIG.DEATH_FLASH_FRAMES;
      const day = paintedFlash();
      const dayWhite = day.fillStyles.find(s => typeof s === 'string' && s.indexOf('rgba(255, 255, 255') === 0);
      assert(dayWhite, 'day death still paints the white blink');
      assert(dayWhite.indexOf(GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3)) !== -1,
        'day blink uses the quieter day peak');
      assertEquals(day.rects.length, 1, 'day blink is one full-canvas fill');
      assertEquals(day.rects[0][2], GAME_CONFIG.CANVAS_W, 'day blink covers the canvas width');
      assertEquals(day.rects[0][3], GAME_CONFIG.CANVAS_H, 'day blink covers the canvas height');
      assertEquals(game.score, 0, 'painting the day blink does not move the score');
      assertEquals(rngCalls, 0, 'painting the day blink does not consume the run seed');
      assertEquals(Animations.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the paint does not consume the flash timer');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const night = paintedFlash();
      const nightWhite = night.fillStyles.find(s => typeof s === 'string' && s.indexOf('rgba(255, 255, 255') === 0);
      assert(nightWhite, 'night death still paints the white blink');
      assert(nightWhite.indexOf(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3)) !== -1,
        'night blink uses the quiet peak');
      assert(nightWhite !== dayWhite, 'night blink is quieter than the day blink');
      assertEquals(night.rects.length, 1, 'night blink is still one full-canvas fill');
      assertEquals(game.score, GAME_CONFIG.DAY_NIGHT_END, 'painting the night blink does not move the score');
      assertEquals(game.currentSpeed, origSpeed, 'night paint does not change speed');
      assertEquals(rngCalls, 0, 'painting the night blink does not consume the run seed');
      assertEquals(Animations.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES,
        'night paint does not consume the flash timer');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      Animations.deathFlashFrames = 0;
      const classic = paintedFlash();
      assertEquals(classic.rects.length, 0, 'Classic still does not paint a death flash');
      assertEquals(game.score, 1000, 'skipping the Classic flash does not move the score');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      Animations.deathFlashFrames = origFrames;
      setQaNight(false);
      setReducedMotion(false);
    }
  });
});

describe('Soft death shake', () => {
  // Classic sin(frame * 1.5) * 4 reverses five times and steps ~5.5px.
  // Updated/Daily round 2 is one half-turn at 1px across 8 frames.
  const QUIET_AMPLITUDE = 1;
  const QUIET_FREQ = Math.PI / 8;
  const QUIET_FRAMES = 8;

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function expectedOffset(frame, amp, freq) {
    return Math.sin(frame * freq) * amp;
  }

  function sampleShake() {
    const samples = [];
    const origTranslate = ctx.translate;
    const origScore = game.score;
    const origSpeed = game.currentSpeed;
    const origRng = game.rng;
    const origShake = Animations.deathShakeFrames;
    const origFlash = Animations.deathFlashFrames;
    const origPop = Animations.scorePopFrames;
    const origState = game.state;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return origRng(); };
    ctx.translate = (x, y) => {
      samples.push({ x: x, y: y });
      return origTranslate.call(ctx, x, y);
    };
    try {
      const frames = deathShakeFrameCount();
      Animations.deathShakeFrames = frames;
      Animations.deathFlashFrames = 0;
      Animations.scorePopFrames = 0;
      game.state = STATE.DEAD;
      for (let i = 0; i < frames; i++) {
        STATE_HANDLERS[STATE.DEAD]();
      }
      assertEquals(samples.length, frames,
        'each shake frame translates once');
      assertEquals(rngCalls, 0, 'the death shake does not consume the run seed');
      assertEquals(game.score, origScore, 'the death shake does not move the score');
      assertEquals(game.currentSpeed, origSpeed, 'the death shake does not change speed');
      samples.forEach(sample => {
        assertEquals(sample.y, 0, 'the shake stays horizontal');
      });
      return samples;
    } finally {
      ctx.translate = origTranslate;
      game.rng = origRng;
      game.score = origScore;
      game.currentSpeed = origSpeed;
      Animations.deathShakeFrames = origShake;
      Animations.deathFlashFrames = origFlash;
      Animations.scorePopFrames = origPop;
      game.state = origState;
    }
  }

  function assertWave(samples, amp, freq, label) {
    for (let i = 0; i < samples.length; i++) {
      const frame = samples.length - i;
      const expected = expectedOffset(frame, amp, freq);
      assert(
        Math.abs(samples[i].x - expected) < 1e-9,
        label + ' frame ' + frame + ' offset should be the configured shake'
      );
    }
  }

  it('nudges Updated and Daily on one half-turn and leaves Classic buzzing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      assert(QUIET_AMPLITUDE < GAME_CONFIG.DEATH_SHAKE_AMPLITUDE / 2,
        'the quiet peak is under half the Classic yank');
      assert(QUIET_AMPLITUDE > 0, 'the death cue still moves');
      assert(QUIET_FREQ < GAME_CONFIG.DEATH_SHAKE_FREQ,
        'the quiet shake turns slower than the Classic buzz');
      assertEquals(GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES, QUIET_FRAMES,
        'the quiet settle is about two thirds of the Classic window');
      assert(QUIET_FRAMES < GAME_CONFIG.DEATH_SHAKE_FRAMES,
        'Updated finishes before the Classic shake');
      assertEquals(QUIET_FRAMES * QUIET_FREQ, Math.PI,
        'eight frames at the quiet frequency are one half-turn');

      game.mode = MODES.CLASSIC;
      game.score = 0;
      const classicDay = sampleShake();
      assertWave(classicDay, GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, GAME_CONFIG.DEATH_SHAKE_FREQ,
        'Classic day');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertWave(sampleShake(), GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, GAME_CONFIG.DEATH_SHAKE_FREQ,
        'Classic night');

      game.mode = MODES.UPDATED;
      game.score = 0;
      const updatedDay = sampleShake();
      assertWave(updatedDay, QUIET_AMPLITUDE, QUIET_FREQ, 'Updated day');
      assertEquals(updatedDay.length, QUIET_FRAMES, 'Updated samples the shorter window');
      let quietPeak = 0;
      let classicPeak = 0;
      for (let i = 0; i < updatedDay.length; i++) {
        quietPeak = Math.max(quietPeak, Math.abs(updatedDay[i].x));
        if (i > 0) {
          assert(Math.abs(updatedDay[i].x - updatedDay[i - 1].x) < 0.5,
            'each quiet step stays under half a pixel');
        }
        assert(updatedDay[i].x >= -1e-9, 'the quiet half-turn does not reverse');
      }
      for (let i = 0; i < classicDay.length; i++) {
        classicPeak = Math.max(classicPeak, Math.abs(classicDay[i].x));
      }
      assert(quietPeak <= QUIET_AMPLITUDE + 1e-9, 'the quiet peak is the 1px settle');
      assert(quietPeak > 0, 'the settle still moves');
      assert(quietPeak < classicPeak / 2, 'the settle stays under half the Classic yank');
      game.score = 350;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ, 'Updated twilight');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ, 'Updated night');
      game.score = 1000;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ, 'Updated later night');

      game.mode = MODES.DAILY;
      game.score = 0;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ, 'Daily day');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ, 'Daily night');

      setQaNight(true);
      game.mode = MODES.UPDATED;
      game.score = 0;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
        'qaNight does not change the Updated nudge');
      game.mode = MODES.CLASSIC;
      assertWave(sampleShake(), GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, GAME_CONFIG.DEATH_SHAKE_FREQ,
        'qaNight leaves the Classic buzz');

      setReducedMotion(true);
      setQaNight(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
        'reduced motion keeps the quiet Updated nudge');
      game.mode = MODES.CLASSIC;
      assertWave(sampleShake(), GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, GAME_CONFIG.DEATH_SHAKE_FREQ,
        'reduced motion leaves the Classic buzz');

      assertEquals(GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE, QUIET_AMPLITUDE,
        'the quiet amplitude is the Updated/Daily tunable');
      assertEquals(GAME_CONFIG.UPDATED_DEATH_SHAKE_FREQ, QUIET_FREQ,
        'the quiet frequency is the Updated/Daily tunable');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('tunes the Updated nudge without moving Classic or the run', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      game.score = 0;

      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 0.5 }, () => {
        assertWave(sampleShake(), 0.5, QUIET_FREQ, 'Updated amplitude tune');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FREQ: 0.1 }, () => {
        assertWave(sampleShake(), QUIET_AMPLITUDE, 0.1, 'Updated frequency tune');
      });
      withTuning({ DEATH_SHAKE_AMPLITUDE: 2, DEATH_SHAKE_FREQ: 2.5 }, () => {
        assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
          'Updated ignores the Classic shake tunes');
      });
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 40 }, () => {
        assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
          'an out-of-range amplitude falls back to the quiet nudge');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FREQ: -1 }, () => {
        assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
          'a negative frequency falls back to the quiet nudge');
      });
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 'soft' }, () => {
        assertWave(sampleShake(), QUIET_AMPLITUDE, QUIET_FREQ,
          'a non-numeric amplitude falls back to the quiet nudge');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 6 }, () => {
        const tuned = sampleShake();
        assertEquals(tuned.length, 6, 'a shorter whole-frame tune is honored');
        assertWave(tuned, QUIET_AMPLITUDE, QUIET_FREQ, 'Updated frame tune');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 40 }, () => {
        assertEquals(sampleShake().length, QUIET_FRAMES,
          'a frame count past Classic falls back to the quiet settle');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 0 }, () => {
        assertEquals(sampleShake().length, QUIET_FRAMES,
          'a zero frame count falls back to the quiet settle');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 1.5 }, () => {
        assertEquals(sampleShake().length, QUIET_FRAMES,
          'a fractional frame count falls back to the quiet settle');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 'short' }, () => {
        assertEquals(sampleShake().length, QUIET_FRAMES,
          'a non-numeric frame count falls back to the quiet settle');
      });

      game.mode = MODES.CLASSIC;
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 0.5, UPDATED_DEATH_SHAKE_FREQ: 0.1, UPDATED_DEATH_SHAKE_FRAMES: 6 }, () => {
        const classic = sampleShake();
        assertEquals(classic.length, GAME_CONFIG.DEATH_SHAKE_FRAMES,
          'Classic keeps the 12-frame shake');
        assertWave(classic, GAME_CONFIG.DEATH_SHAKE_AMPLITUDE, GAME_CONFIG.DEATH_SHAKE_FREQ,
          'Classic ignores the Updated shake tunes');
      });
      withTuning({ DEATH_SHAKE_AMPLITUDE: 2, DEATH_SHAKE_FREQ: 0.8 }, () => {
        assertWave(sampleShake(), 2, 0.8, 'Classic still follows its own shake tunes');
      });

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 0.25 }, () => {
        assertWave(sampleShake(), 0.25, QUIET_FREQ, 'Daily shares the Updated amplitude tune');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaNight(false);
      setReducedMotion(false);
    }
  });

  it('reduced motion still shortens the flash and pop while the shake stays armed', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(true);
      game.mode = MODES.UPDATED;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      game.state = STATE.RUNNING;
      game.graceFrames = 0;
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.state, STATE.DEAD, 'collision still ends the run');
      assertEquals(Animations.deathShakeFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'reduced motion keeps the shorter Updated shake');
      assertEquals(Animations.deathFlashFrames, 1,
        'reduced motion still caps the flash at one frame');
      assertEquals(Animations.scorePopFrames, 0, 'reduced motion still skips the score pop');
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('eases the score pop across the shorter shake, then opens Game Over at rest', () => {
    const origMode = game.mode;
    const origScale = ctx.scale;
    try {
      setReducedMotion(false);
      setQaNight(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        resetGame();
        game.state = STATE.RUNNING;
        game.graceFrames = 0;
        game.obstacles.length = 0;
        game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        assertEquals(game.state, STATE.DEAD, mode + ' collision still ends the run');
        assertEquals(Animations.deathShakeFrames, QUIET_FRAMES,
          mode + ' shake starts on the shorter window');
        assertEquals(Animations.scorePopFrames, QUIET_FRAMES,
          mode + ' score pop starts on that same window');
        const scales = [];
        ctx.scale = (x) => { scales.push(x); };
        for (let i = 0; i < QUIET_FRAMES; i++) STATE_HANDLERS[STATE.DEAD]();
        assertEquals(scales.length, QUIET_FRAMES, mode + ' scales once per shake frame');
        assertEquals(scales[0], GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          mode + ' opens the pop at the quiet peak');
        const peak = GAME_CONFIG.SCORE_POP_PEAK_SCALE;
        const last = scales[scales.length - 1];
        assert(last > 1 && last < 1 + (peak - 1) * 0.25,
          mode + ' last shake frame has nearly settled the score');
        assertEquals(Animations.scorePopFrames, 0, mode + ' pop is done when the shake is');
        assertEquals(Animations.deathShakeFrames, 0, mode + ' shake is done');
        STATE_HANDLERS[STATE.DEAD]();
        assertEquals(scales.length, QUIET_FRAMES, mode + ' Game Over does not keep scaling the HUD');
        assertEquals(game.state, STATE.DEAD, mode + ' the run stays over');
      }

      game.mode = MODES.CLASSIC;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      game.state = STATE.RUNNING;
      game.graceFrames = 0;
      game.obstacles.length = 0;
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(Animations.deathShakeFrames, GAME_CONFIG.DEATH_SHAKE_FRAMES,
        'Classic still starts the 12-frame shake');
      assertEquals(Animations.scorePopFrames, 0, 'Classic still does not start the pop');
    } finally {
      ctx.scale = origScale;
      game.mode = origMode;
      setReducedMotion(false);
      setQaNight(false);
      game.obstacles.length = 0;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA death shake flag (?qaShake=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyTranslate() {
    const calls = [];
    const orig = ctx.translate;
    ctx.translate = function (x, y) {
      calls.push({ x: x, y: y });
    };
    return {
      calls: calls,
      restore() { ctx.translate = orig; },
    };
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setQaDust(false);
    setQaFlash(false);
    setQaScorePop(false);
    setQaShake(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    game.highScore = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Animations.deathShakeFrames = 0;
    Animations.scorePopFrames = 0;
    Particles.reset();
  }

  it('recognizes only ?qaShake=1', () => {
    assert(readQaShakeFlag('?qaShake=1') === true, '?qaShake=1 should hold the death nudge');
    assert(readQaShakeFlag('?qaNight=1&qaShake=1') === true,
      'the flag should work beside ?qaNight=1');
    assert(readQaShakeFlag('?qaShake=1&qaFlash=1') === true, 'param order should not matter');
    assert(readQaShakeFlag('') === false, 'a normal visit should leave the nudge for a real death');
    assert(readQaShakeFlag('?qaShake=0') === false, 'only the value 1 enables the flag');
    assert(readQaShakeFlag('?qaShake=8') === false, 'qaShake=8 must not count as the flag');
    assert(readQaShakeFlag('?qaScorePop=1') === false, 'the score pop must not hold the shake');
  });

  it('holds the quieter peak from the first frame without arming the real shake', () => {
    const origMode = game.mode;
    const spy = spyTranslate();
    try {
      assert(QA_SHAKE_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaShake(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        const dinoX = dino.x;
        assertEquals(spy.calls.length, 0, mode + ' without the flag does not shift the camera');
        assertEquals(game.qaShakeHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaShake(true);
        game.score = 0;
        spy.calls.length = 0;
        tick();
        assertEquals(spy.calls.length, 1, mode + ' shifts the camera once');
        assertEquals(spy.calls[0].x, GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' holds the quiet peak, not a louder debug shift');
        assertEquals(spy.calls[0].y, 0, mode + ' hold stays horizontal');
        assertEquals(qaShakeOffset(), GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' playtest offset is the real quiet amplitude');
        assertEquals(game.qaShakeHold, QA_SHAKE_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaShakeShown, true, mode + ' spends the latch');
        assertEquals(Animations.deathShakeFrames, 0, mode + ' does not arm the real shake');
        assertEquals(Animations.scorePopFrames, 0, mode + ' does not arm the real pop');
        assertEquals(dino.x, dinoX, mode + ' hold must not move the dino');
        assertEquals(game.score, scoreOff, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' hold must not change speed');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');

        game.score = GAME_CONFIG.DAY_NIGHT_END;
        spy.calls.length = 0;
        tick();
        assertEquals(spy.calls.length, 1, mode + ' night still shifts once');
        assertEquals(spy.calls[0].x, GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' night uses the same quiet peak');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaShake(false);
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still shifts the frame when a hit returns before the death draw', () => {
    const origMode = game.mode;
    const spy = spyTranslate();
    try {
      armFreshRun(MODES.UPDATED);
      setQaShake(true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      assertEquals(spy.calls.length, 1, 'the hold still shifts the hit frame');
      assertEquals(spy.calls[0].x, GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
        'the hit frame uses the quiet peak');
      assertEquals(Animations.deathShakeFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real shake timer is still armed');
      assertEquals(Animations.scorePopFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real pop stays locked to that shake');
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaShake(false);
      game.obstacles.length = 0;
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaShake=1 does not take the Updated nudge', () => {
    const origMode = game.mode;
    const spy = spyTranslate();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaShake(true);
      spy.calls.length = 0;
      tick();
      tick();
      assertEquals(spy.calls.length, 0, 'Classic does not shift the camera');
      assertEquals(game.qaShakeShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaShakeHold, 0, 'Classic does not start the hold');
      assertEquals(Animations.deathShakeFrames, 0, 'Classic does not arm a shake while running');
      assertEquals(qaShakeOffset(), 0, 'Classic playtest offset stays at rest');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaShake(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens and damps the hold, and still shifts', () => {
    const origMode = game.mode;
    const spy = spyTranslate();
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        setReducedMotion(true);
        setQaShake(true);
        spy.calls.length = 0;
        tick();
        const damped = qaShakeOffset();
        const peak = GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE;
        assertEquals(game.qaShakeHold, qaShakeHoldFrames(),
          mode + ' hold uses the shorter window');
        assert(game.qaShakeHold < QA_SHAKE_HOLD,
          mode + ' hold is shorter than the full capture');
        assert(qaShakeHoldFrames() >= 2, mode + ' hold still lasts long enough to see');
        assert(damped > 0, mode + ' damped hold still moves the lane');
        assert(damped < peak, mode + ' damped hold is softer than the motion-allowed peak');
        assertEquals(damped, peak * 0.5, mode + ' reduced motion halves the shift');
        assertEquals(spy.calls.length, 1, mode + ' reduced motion still shifts once');
        assertEquals(spy.calls[0].x, damped, mode + ' the paint uses the damped shift');
        assertEquals(Animations.deathShakeFrames, 0, mode + ' hold does not arm the real shake');
        assert(game.score < 1, mode + ' damped hold must not write the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaShake(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaShake=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyTranslate();
    global.location = { search: '?qaShake=1' };
    try {
      setQaShake(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      game.highScore = 0;
      Animations.deathShakeFrames = 0;
      Particles.reset();
      tick();
      assertEquals(spy.calls.length, 1, 're-read flag shifts the camera');
      assertEquals(spy.calls[0].x, GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
        're-read flag holds the quiet peak');
      assertEquals(game.qaShakeHold, QA_SHAKE_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaShakeShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaShake(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Soft collision burst', () => {
  // Round 1 held 8 motes for the whole 12-frame shake at vxSpread 1, so the
  // farthest red sat near the sprite edge. Round 2 is one step quieter:
  // fewer motes, a life that dies before the nudge ends, and a tighter
  // spread. Travel over that shorter life must still stay on the 40×50
  // dino, or the red leaves the runner and lands on the cactus.
  const PUFF = {
    count: 5,
    color: '#d04a2a',
    size: 3,
    life: 8,
    vyMin: -1.2,
    vyMax: 0.4,
    vxSpread: 0.7,
    gravity: 0.10,
  };

  const UNCHANGED_KINDS = {
    jump:      { count: 3,  color: '#9c8770', size: 3, life: 8, alpha: 0.5, vyMin: -1.2, vyMax: -0.4, vxSpread: 0.6, gravity: 0.10 },
    land:      { count: 5,  color: '#9c8770', size: 3, life: 8, alpha: 0.4, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.7, gravity: 0.12 },
    trail:     { count: 1,  color: 'rgba(150,150,150,0.28)', size: 2, life:  6, vyMin: -0.1, vyMax:  0.1, vxSpread: 0.2, gravity: 0 },
    confetti:  { count: 6, color: '#ffd700',                size: 3, life: 12, alpha: 0.7, vyMin: -1.6, vyMax: -0.5, vxSpread: 0.7, gravity: 0.10 },
    plateau:   { count: 4,  color: '#c5d4e4', size: 2, life: 12, alpha: 0.45, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.3, gravity: 0.06 },
    plateauQa: { count: 4, color: '#3d4f63', size: 2, life: 40, vyMin: -0.2, vyMax: -0.08, vxSpread: 0.08, gravity: 0.002 },
  };

  function travel(kind) {
    const n = kind.life;
    const drop = kind.gravity * ((n - 1) * n) / 2;
    return {
      x: kind.vxSpread * n,
      up: Math.abs(n * kind.vyMin + drop),
      down: n * kind.vyMax + drop,
    };
  }

  function collisionMotes() {
    return Particles.particles.filter((p) => p.life > 0 && p.color === PUFF.color);
  }

  it('keeps the collision puff on the dino for the shake window', () => {
    const kind = Particles.KINDS.collision;
    const moved = travel(kind);
    const halfW = GAME_CONFIG.DINO_WIDTH / 2;
    const halfH = GAME_CONFIG.DINO_HEIGHT / 2;
    const edge = cfg('PARTICLE_EMIT_SPREAD') / 2 + kind.size / 2;
    assert(moved.x + edge <= halfW,
      'horizontal travel stays on the dino, including emit jitter and mote size');
    assert(moved.up + kind.size / 2 <= halfH, 'the puff does not fountain above the dino');
    assert(moved.down + kind.size / 2 <= halfH, 'the puff does not rain off the dino');
    assert(kind.count < 11, 'fewer than half the old 22-mote firework');
    assert(kind.count < 8, 'quieter than the round-1 eight-mote puff');
    assert(kind.count > Particles.KINDS.jump.count, 'still reads louder than a jump puff');
    assert(kind.life < GAME_CONFIG.DEATH_SHAKE_FRAMES,
      'the puff dies before the death nudge ends');
    assert(kind.life * 2 > GAME_CONFIG.DEATH_SHAKE_FRAMES,
      'the puff still lasts through most of the shake');
    assert(moved.x < 8, 'tighter than the round-1 12px reach');
    assertEquals(kind.color, PUFF.color, 'death stays the same red');
    assertEquals(kind.size, PUFF.size, 'mote size stays readable');
    assertEquals(kind.gravity, PUFF.gravity, 'the puff keeps its weight');
    assertEquals(kind.count, PUFF.count, 'the shipped puff is 5 motes');
    assertEquals(kind.vyMin, PUFF.vyMin, 'the shipped rise is a short lift');
    assertEquals(kind.vyMax, PUFF.vyMax, 'the shipped fall is a short drop');
    assertEquals(kind.vxSpread, PUFF.vxSpread, 'the shipped spread stays on the body');

    for (const name of Object.keys(UNCHANGED_KINDS)) {
      const got = Particles.KINDS[name];
      const want = UNCHANGED_KINDS[name];
      for (const key of Object.keys(want)) {
        assertEquals(got[key], want[key], name + ' ' + key + ' stays unchanged');
      }
    }
  });

  it('emits the puff in Updated and Daily and none in Classic', () => {
    const origMode = game.mode;
    const origRng = game.rng;
    try {
      setReducedMotion(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        let rngCalls = 0;
        game.rng = () => { rngCalls++; return 0.5; };
        Particles.reset();
        const n = Particles.emit('collision', 80, 140);
        const motes = collisionMotes();
        assertEquals(n, PUFF.count, mode + ' emits the puff count');
        assertEquals(motes.length, PUFF.count, mode + ' pool holds the puff');
        assertEquals(rngCalls, 0, mode + ' collision puff does not consume the run seed');
        motes.forEach((p) => {
          assertEquals(p.life, PUFF.life, mode + ' mote lives for the shake window');
          assertEquals(p.maxLife, PUFF.life, mode + ' mote fades across that life');
          assertEquals(p.size, PUFF.size, mode + ' mote keeps the readable size');
          assertEquals(p.color, PUFF.color, mode + ' mote stays red');
          assertEquals(p.gravity, PUFF.gravity, mode + ' mote keeps its weight');
          assert(Math.abs(p.vx) <= PUFF.vxSpread, mode + ' horizontal speed stays inside the spread');
          assert(p.vy >= PUFF.vyMin && p.vy <= PUFF.vyMax, mode + ' vertical speed stays inside the short span');
        });
      }

      game.mode = MODES.CLASSIC;
      Particles.reset();
      const classic = Particles.emit('collision', 80, 140);
      assertEquals(classic, 0, 'Classic emits no collision puff');
      assertEquals(collisionMotes().length, 0, 'Classic leaves the pool empty of red motes');
    } finally {
      game.mode = origMode;
      game.rng = origRng;
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('still damps the puff under reduced motion', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      Particles.reset();
      const n = Particles.emit('collision', 80, 140);
      const expectedCount = Math.max(1, Math.round(PUFF.count * 0.25));
      const expectedLife = Math.max(2, Math.round(PUFF.life * 0.5));
      assertEquals(n, expectedCount, 'reduced motion keeps the quarter-count damping');
      assert(expectedCount < PUFF.count, 'the damped puff is fewer motes');
      assert(expectedLife < PUFF.life, 'the damped puff is a shorter life');
      collisionMotes().forEach((p) => {
        assertEquals(p.life, expectedLife, 'reduced motion still halves collision life');
      });

      Particles.reset();
      const jumpN = Particles.emit('jump', 80, 140);
      const jumpLife = Math.max(2, Math.round(Particles.KINDS.jump.life * 0.5));
      assertEquals(jumpN, Math.max(1, Math.round(Particles.KINDS.jump.count * 0.25)),
        'reduced motion still damps the jump puff the same way');
      Particles.particles.filter((p) => p.life > 0).forEach((p) => {
        assertEquals(p.life, jumpLife, 'reduced motion still halves jump life');
      });
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('a cactus hit emits the puff in Updated and Daily and none in Classic', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origSpeed = game.currentSpeed;
    try {
      setReducedMotion(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY, MODES.CLASSIC]) {
        game.mode = mode;
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        resetGame();
        Particles.reset();
        game.state = STATE.RUNNING;
        game.graceFrames = 0;
        game.score = 0;
        game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        assertEquals(game.state, STATE.DEAD, mode + ' collision still ends the run');
        const motes = collisionMotes();
        if (mode === MODES.CLASSIC) {
          assertEquals(motes.length, 0, 'Classic collision still emits no red puff');
        } else {
          assertEquals(motes.length, PUFF.count, mode + ' collision emits the quiet puff');
          assert(motes.every((p) => p.life === PUFF.life), mode + ' collision puff uses the short life');
        }
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' collision leaves speed on the curve');
      }
      assertEquals(Math.floor(game.score), 0, 'one collision frame does not score a point');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.currentSpeed = origSpeed;
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA collision flag (?qaCollision=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyPaint() {
    const calls = [];
    const origFillRect = ctx.fillRect;
    const origFillText = ctx.fillText;
    ctx.fillRect = function (x, y, w, h) {
      calls.push({
        op: 'rect',
        style: ctx.fillStyle,
        x: x,
        y: y,
        w: w,
        h: h,
        alpha: ctx.globalAlpha,
      });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    return {
      calls: calls,
      restore() {
        ctx.fillRect = origFillRect;
        ctx.fillText = origFillText;
      },
    };
  }

  function redFills(calls) {
    return calls.filter((c) => c.op === 'rect' && c.style === Particles.KINDS.collision.color);
  }

  function rimFills(calls) {
    return calls.filter((c) => c.op === 'rect' && c.style === QA_COLLISION_RIM);
  }

  function onBody(rect) {
    return rect.x >= dino.x
      && rect.y >= dino.y
      && rect.x + rect.w <= dino.x + dino.width
      && rect.y + rect.h <= dino.y + dino.height;
  }

  function assertCluster(calls, label, alpha) {
    const marks = qaCollisionMarks();
    const reds = redFills(calls);
    const rims = rimFills(calls);
    assertEquals(reds.length, marks.length, label + ' paints the quieter cluster');
    assert(reds.length > 0, label + ' paints at least one mote');
    assertEquals(rims.length, marks.length, label + ' paints a rim with each mote');
    reds.forEach((fill, i) => {
      assertEquals(fill.x, marks[i].x, label + ' mote ' + i + ' stays on the body mark');
      assertEquals(fill.y, marks[i].y, label + ' mote ' + i + ' stays on the body mark');
      assertEquals(fill.w, QA_COLLISION_SIZE, label + ' mote stays a small mark');
      assertEquals(fill.h, QA_COLLISION_SIZE, label + ' mote stays a small mark');
      assertEquals(fill.alpha, alpha, label + ' mote uses the hold ink');
      assert(onBody(fill), label + ' mote stays inside the dino');
    });
    rims.forEach((rim) => {
      assertEquals(rim.alpha, alpha, label + ' rim uses the hold ink');
      assert(onBody(rim), label + ' rim stays inside the dino');
    });
    const lastHud = calls.reduce((at, c, i) => (c.op === 'text' ? i : at), -1);
    const redAt = calls.findIndex((c) => c.op === 'rect' && c.style === Particles.KINDS.collision.color);
    assert(redAt > lastHud, label + ' cluster is painted after the HUD');
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setQaDust(false);
    setQaFlash(false);
    setQaScorePop(false);
    setQaNewBest(false);
    setQaCollision(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Particles.reset();
  }

  it('recognizes only ?qaCollision=1', () => {
    assert(readQaCollisionFlag('?qaCollision=1') === true, '?qaCollision=1 should hold the death puff');
    assert(readQaCollisionFlag('?qaNight=1&qaCollision=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaCollisionFlag('?qaCollision=1&qaDust=1') === true, 'param order should not matter');
    assert(readQaCollisionFlag('') === false, 'a normal visit should leave the puff for a real death');
    assert(readQaCollisionFlag('?qaCollision=0') === false, 'only the value 1 enables the flag');
    assert(readQaCollisionFlag('?qaCollision=12') === false, 'qaCollision=12 must not count as the flag');
    assert(readQaCollisionFlag('?qaFlash=1') === false, 'the flash flag must not hold the death puff');
  });

  it('paints the quieter red cluster on the dino from the first running frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(QA_COLLISION_HOLD >= 120, 'the debug hold must outlast a quick capture after GET READY');
      assertEquals(QA_COLLISION_OFFSETS.length, Particles.KINDS.collision.count,
        'the hold shows one mark per quieter mote');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaCollision(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        const gapOff = game.nextSpawnGap;
        assertEquals(redFills(spy.calls).length, 0, mode + ' without the flag does not paint');
        assertEquals(game.qaCollisionShown, false, mode + ' without the flag does not spend the latch');
        assertEquals(game.qaCollisionHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaCollision(true);
        Particles.particles.forEach((p) => {
          p.life = 8;
          p.maxLife = 8;
          p.color = '#112233';
          p.size = 2;
        });
        spy.calls.length = 0;
        tick();
        assertCluster(spy.calls, mode, 1);
        assertEquals(game.qaCollisionHold, QA_COLLISION_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaCollisionShown, true, mode + ' spends the latch once');
        assertEquals(
          Particles.particles.filter((p) => p.color === Particles.KINDS.collision.color).length,
          0,
          mode + ' does not emit the production puff'
        );
        assertEquals(game.score, scoreOff, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' hold must not change speed');
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score');
        assertEquals(game.nextSpawnGap, gapOff, mode + ' hold must not change the spawn gap');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');
        assertEquals(game.obstacles.length, 0, mode + ' hold must not spawn an obstacle');

        for (let i = 0; i < 30; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertCluster(spy.calls, mode + ' still', 1);
        assertEquals(game.qaCollisionHold, QA_COLLISION_HOLD - 30,
          mode + ' keeps the hold up after the run starts');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaCollision(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the cluster when a hit returns before the death draw', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaCollision(true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      const reds = redFills(spy.calls);
      assertEquals(reds.length, qaCollisionMarks().length,
        'the hold still paints after the collision return');
      assert(reds.every(onBody), 'the death-frame hold stays on the dino');
      assertEquals(game.qaCollisionHold, QA_COLLISION_HOLD,
        'the latch frame does not tick the hold down');
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaCollision(false);
      game.obstacles.length = 0;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaCollision=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaCollision(true);
      tick();
      tick();
      assertEquals(redFills(spy.calls).length, 0, 'Classic never paints the debug cluster');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === Particles.KINDS.collision.color).length,
        0,
        'Classic does not emit the production puff either'
      );
      assertEquals(game.qaCollisionShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaCollisionHold, 0, 'Classic does not start the hold');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaCollision(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens the hold and paints a quieter cluster', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaCollision(true);
      setReducedMotion(false);
      const fullMarks = qaCollisionMarks().length;
      assert(fullMarks > 1, 'motion-on capture is a cluster, not one mote');
      setReducedMotion(true);
      spy.calls.length = 0;
      tick();
      assertEquals(game.qaCollisionHold, qaCollisionHoldFrames(), 'hold uses the shorter window');
      assert(game.qaCollisionHold < QA_COLLISION_HOLD, 'hold is shorter than the full capture');
      assert(qaCollisionHoldFrames() >= 2, 'hold still lasts long enough to see');
      assertEquals(qaCollisionPaintAlpha(), 0.5, 'reduced motion halves the hold ink');
      assertCluster(spy.calls, 'reduced motion', 0.5);
      assert(redFills(spy.calls).length < fullMarks, 'reduced motion does not paint the full cluster');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === Particles.KINDS.collision.color).length,
        0,
        'the damped hold does not go through the particle pool'
      );
      assert(game.score < 1, 'the damped hold must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaCollision(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCollision=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPaint();
    global.location = { search: '?qaCollision=1' };
    try {
      setQaCollision(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      Particles.reset();
      tick();
      assertCluster(spy.calls, 're-read flag', 1);
      assertEquals(game.qaCollisionHold, QA_COLLISION_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaCollisionShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaCollision(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quiet late-run heel trail', () => {
  // The late-run smear was one grey mote per frame, alpha 0.55, living 10
  // frames, drifting ±0.4px. About ten specks stacked on the ground line
  // where cacti arrive. The whisper keeps that one-mote cadence and the
  // same grey, with less ink, a shorter life, and a tighter drift so it
  // stays at the heel. Size stays 2 so the speck is still visible.
  const WHISPER = {
    count: 1,
    color: 'rgba(150,150,150,0.28)',
    size: 2,
    life: 6,
    vyMin: -0.1,
    vyMax: 0.1,
    vxSpread: 0.2,
    gravity: 0,
  };

  const UNCHANGED_KINDS = {
    jump:      { count: 3,  color: '#9c8770', size: 3, life: 8, alpha: 0.5, vyMin: -1.2, vyMax: -0.4, vxSpread: 0.6, gravity: 0.10 },
    land:      { count: 5,  color: '#9c8770', size: 3, life: 8, alpha: 0.4, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.7, gravity: 0.12 },
    collision: { count: 5,  color: '#d04a2a', size: 3, life: 8, vyMin: -1.2, vyMax:  0.4, vxSpread: 0.7, gravity: 0.10 },
    confetti:  { count: 6, color: '#ffd700', size: 3, life: 12, alpha: 0.7, vyMin: -1.6, vyMax: -0.5, vxSpread: 0.7, gravity: 0.10 },
    plateau:   { count: 4,  color: '#c5d4e4', size: 2, life: 12, alpha: 0.45, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.3, gravity: 0.06 },
    plateauQa: { count: 4, color: '#3d4f63', size: 2, life: 40, vyMin: -0.2, vyMax: -0.08, vxSpread: 0.08, gravity: 0.002 },
  };

  function trailCrossScore() {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT, TRAIL_SPEED_RATIO } =
      GAME_CONFIG;
    const sig = (TRAIL_SPEED_RATIO * PLATEAU_SPEED - INITIAL_SPEED) / (PLATEAU_SPEED - INITIAL_SPEED);
    return RAMP_MIDPOINT - Math.log(1 / sig - 1) / RAMP_STEEPNESS;
  }

  function scoreJustBeforeTrail() {
    const cross = trailCrossScore();
    const after = Math.ceil((cross - 1e-9) * 10) / 10;
    return after - GAME_CONFIG.SCORE_INCREMENT;
  }

  function trailMotes() {
    return Particles.particles.filter((p) => p.life > 0 && p.color === WHISPER.color);
  }

  function armRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaTrail(false);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    Particles.reset();
    game.plateauCueShown = false;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
  }

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  it('is a shorter, fainter grey speck that still sits at the heel', () => {
    const kind = Particles.KINDS.trail;
    assertEquals(kind.count, WHISPER.count, 'still one mote per frame');
    assertEquals(kind.color, WHISPER.color, 'same grey, about half the old 0.55 ink');
    assertEquals(kind.size, WHISPER.size, 'size stays a readable 2px speck');
    assertEquals(kind.life, WHISPER.life, 'life is shorter so the stack dies at the heel');
    assertEquals(kind.vyMin, WHISPER.vyMin, 'the whisper does not lift off the heel');
    assertEquals(kind.vyMax, WHISPER.vyMax, 'the whisper does not drop off the heel');
    assertEquals(kind.vxSpread, WHISPER.vxSpread, 'horizontal drift stays tighter than the old smear');
    assertEquals(kind.gravity, WHISPER.gravity, 'the mote does not fall away from the heel');
    assert(kind.life < 10, 'shorter than the old 10-frame smear');
    assert(kind.vxSpread < 0.4, 'tighter than the old ±0.4 drift');
    const alpha = Number(kind.color.slice(kind.color.lastIndexOf(',') + 1, -1));
    assert(alpha < 0.4, 'fainter than the old 0.55 alpha');
    assert(kind.vxSpread * kind.life <= 2, 'a full life of drift stays within 2px of the heel');

    for (const name of Object.keys(UNCHANGED_KINDS)) {
      const got = Particles.KINDS[name];
      const want = UNCHANGED_KINDS[name];
      for (const key of Object.keys(want)) {
        assertEquals(got[key], want[key], name + ' ' + key + ' stays unchanged');
      }
    }
  });

  it('emits in Updated and Daily once speed nears the plateau, and never in Classic', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      const before = scoreJustBeforeTrail();
      const reached = before + GAME_CONFIG.SCORE_INCREMENT;
      const threshold = GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.TRAIL_SPEED_RATIO;
      assert(
        DifficultyProfile.speedAtScore(before) < threshold,
        'the frame before the whisper should still be under the trail speed'
      );
      assert(
        DifficultyProfile.speedAtScore(reached) >= threshold,
        'the reaching frame should be on the trail side of the ratio'
      );
      assert(
        threshold < GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.PLATEAU_REACH_RATIO,
        'the whisper starts before the once-per-run plateau cue'
      );

      armRun(MODES.UPDATED);
      game.score = before - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assertEquals(trailMotes().length, 0, 'one frame early should not whisper');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'an early frame still takes speed from the curve');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armRun(mode);
        const seed = game.rng;
        game.score = before;
        tick();
        const motes = trailMotes();
        assertEquals(motes.length, WHISPER.count, mode + ' emits one whisper mote');
        motes.forEach((p) => {
          assertEquals(p.life, WHISPER.life, mode + ' mote uses the short life');
          assertEquals(p.maxLife, WHISPER.life, mode + ' mote fades across that life');
          assertEquals(p.size, WHISPER.size, mode + ' mote keeps the readable size');
          assertEquals(p.color, WHISPER.color, mode + ' mote stays the quiet grey');
          assertEquals(p.gravity, WHISPER.gravity, mode + ' mote stays weightless');
          assert(Math.abs(p.x - (dino.x + 4)) <= cfg('PARTICLE_EMIT_SPREAD') / 2,
            mode + ' mote stays on the heel, including emit jitter');
          assertEquals(p.y, dino.y + dino.height - 4, mode + ' mote starts at the heel');
        });
        assertEquals(game.plateauCueShown, false, mode + ' whisper does not spend the plateau cue');
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the score');
        assertEquals(game.rng, seed, mode + ' whisper does not replace the run seed');
      }

      armRun(MODES.CLASSIC);
      game.score = before;
      tick();
      assertEquals(trailMotes().length, 0, 'Classic never trails');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaTrail(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still damps the whisper under reduced motion', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      Particles.reset();
      const n = Particles.emit('trail', dino.x + 4, dino.y + dino.height - 4);
      const expectedCount = Math.max(1, Math.round(WHISPER.count * 0.25));
      const expectedLife = Math.max(2, Math.round(WHISPER.life * 0.5));
      assertEquals(n, expectedCount, 'reduced motion still applies the quarter-count floor');
      assert(expectedLife < WHISPER.life, 'reduced motion still halves trail life');
      trailMotes().forEach((p) => {
        assertEquals(p.life, expectedLife, 'reduced motion still halves the whisper');
        assertEquals(p.color, WHISPER.color, 'reduced motion keeps the quiet grey');
      });

      armRun(MODES.UPDATED);
      setReducedMotion(true);
      setQaTrail(true);
      tick();
      assertEquals(trailMotes().length, expectedCount, 'a running frame still damps the whisper');
      trailMotes().forEach((p) => {
        assertEquals(p.life, expectedLife, 'the running frame uses the halved life');
      });
      assert(game.score < 1, 'the damped whisper does not move the score');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'the damped whisper does not move the speed');
    } finally {
      game.mode = origMode;
      setQaTrail(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA trail flag (?qaTrail=1)', () => {
  const WHISPER_COLOR = 'rgba(150,150,150,0.28)';

  function trailMotes() {
    return Particles.particles.filter((p) => p.life > 0 && p.color === WHISPER_COLOR);
  }

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Particles.reset();
  }

  it('recognizes only ?qaTrail=1', () => {
    assert(readQaTrailFlag('?qaTrail=1') === true, '?qaTrail=1 should enable the early heel trail');
    assert(readQaTrailFlag('?qaNight=1&qaTrail=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaTrailFlag('?qaTrail=1&qaNight=1') === true, 'param order should not matter');
    assert(readQaTrailFlag('') === false, 'a normal visit should leave the trail on real speed');
    assert(readQaTrailFlag('?qaTrail=0') === false, 'only the value 1 enables the flag');
    assert(readQaTrailFlag('?qaTrail=12') === false, 'qaTrail=12 must not count as the flag');
    assert(readQaTrailFlag('?qaNight=1') === false, 'night alone must not force the trail');
  });

  it('emits the whisper on the first Updated and Daily frame without moving score or speed', () => {
    const origMode = game.mode;
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaTrail(false);
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(trailMotes().length, 0, mode + ' without the flag does not whisper at the start');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaTrail(true);
        tick();
        const motes = trailMotes();
        assertEquals(motes.length, Particles.KINDS.trail.count, mode + ' emits the whisper immediately');
        motes.forEach((p) => {
          assertEquals(p.life, Particles.KINDS.trail.life, mode + ' uses the quiet life');
          assertEquals(p.color, WHISPER_COLOR, mode + ' uses the quiet grey');
          assert(Math.abs(p.x - (dino.x + 4)) <= cfg('PARTICLE_EMIT_SPREAD') / 2,
            mode + ' QA mote stays at the heel');
          assertEquals(p.y, dino.y + dino.height - 4, mode + ' QA mote starts at the heel');
        });
        assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, mode + ' must not jump the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' must not change speed');
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score');
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');

        tick();
        assertEquals(trailMotes().length, 2, mode + ' keeps whispering on the next frame');
        assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT * 2, mode + ' scoring keeps its normal step');
      }
    } finally {
      game.mode = origMode;
      setQaTrail(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaTrail=1 still emits nothing', () => {
    const origMode = game.mode;
    try {
      armFreshRun(MODES.CLASSIC);
      setQaTrail(true);
      tick();
      tick();
      assertEquals(trailMotes().length, 0, 'Classic never trails, even with the flag');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score');
    } finally {
      game.mode = origMode;
      setQaTrail(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaTrail=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    global.location = { search: '?qaNight=1&qaTrail=1' };
    try {
      setQaTrail(false);
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      tick();
      assertEquals(trailMotes().length, Particles.KINDS.trail.count,
        'resetGame should arm the early whisper from location.search');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(getBackgroundColor(game.score), '#1a1a2e',
        'qaNight on the same query still paints night');
    } finally {
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaTrail(false);
      setQaNight(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quiet new-best confetti', () => {
  // Round 1 held 10 gold motes for 20 frames at vxSpread 1.2. From the
  // score that is about 24px toward the lane, so the celebration still
  // sparkled off the number. Round 2 is one step quieter: fewer motes, a
  // shorter life, a tighter spread, and soft peak ink. The gold and the
  // 3px size stay so the level still reads. The rise and gravity stay in
  // the same family, so the puff does not fountain off the top or fall
  // through the HUD.
  const PUFF = {
    count: 6,
    color: '#ffd700',
    size: 3,
    life: 12,
    alpha: 0.7,
    vyMin: -1.6,
    vyMax: -0.5,
    vxSpread: 0.7,
    gravity: 0.10,
  };

  const UNCHANGED_KINDS = {
    jump:      { count: 3,  color: '#9c8770', size: 3, life: 8, alpha: 0.5, vyMin: -1.2, vyMax: -0.4, vxSpread: 0.6, gravity: 0.10 },
    land:      { count: 5,  color: '#9c8770', size: 3, life: 8, alpha: 0.4, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.7, gravity: 0.12 },
    trail:     { count: 1,  color: 'rgba(150,150,150,0.28)', size: 2, life:  6, vyMin: -0.1, vyMax:  0.1, vxSpread: 0.2, gravity: 0 },
    collision: { count: 5,  color: '#d04a2a',                size: 3, life: 8, vyMin: -1.2, vyMax:  0.4, vxSpread: 0.7, gravity: 0.10 },
    plateau:   { count: 4,  color: '#c5d4e4', size: 2, life: 12, alpha: 0.45, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.3, gravity: 0.06 },
    plateauQa: { count: 4, color: '#3d4f63', size: 2, life: 40, vyMin: -0.2, vyMax: -0.08, vxSpread: 0.08, gravity: 0.002 },
  };

  function stepPath(vy0, kind) {
    let y = 0;
    let vy = vy0;
    let min = 0;
    let max = 0;
    for (let i = 0; i < kind.life; i++) {
      y += vy;
      if (y < min) min = y;
      if (y > max) max = y;
      vy += kind.gravity;
    }
    return { end: y, min, max };
  }

  function goldMotes() {
    return Particles.particles.filter((p) => p.life > 0 && p.color === PUFF.color);
  }

  it('is a shorter gold puff that stays on the score', () => {
    const kind = Particles.KINDS.confetti;
    assertEquals(kind.count, PUFF.count, 'quieter than the round-1 ten-mote puff');
    assertEquals(kind.color, PUFF.color, 'celebration stays gold');
    assertEquals(kind.size, PUFF.size, 'mote size stays readable');
    assertEquals(kind.life, PUFF.life, 'shorter than the round-1 twenty-frame life');
    assertEquals(kind.alpha, PUFF.alpha, 'peak ink is under solid gold');
    assertEquals(kind.vyMin, PUFF.vyMin, 'the rise stays a short lift');
    assertEquals(kind.vyMax, PUFF.vyMax, 'the slowest mote still lifts');
    assertEquals(kind.vxSpread, PUFF.vxSpread, 'the spread stays on the score');
    assertEquals(kind.gravity, PUFF.gravity, 'the puff keeps a light settle');

    const up = stepPath(kind.vyMin, kind);
    const down = stepPath(kind.vyMax, kind);
    const edge = cfg('PARTICLE_EMIT_SPREAD') / 2 + kind.size / 2;
    const reach = kind.vxSpread * kind.life + edge;
    assert(kind.count < 10, 'fewer motes than the round-1 puff');
    assert(kind.life < 20, 'shorter than the round-1 puff');
    assert(kind.vxSpread < 1.2, 'tighter than the round-1 spread');
    assert(kind.alpha < 1 && kind.alpha >= 0.6, 'soft gold, still a celebration');
    assert(reach <= 16, 'a full life stays on the score, including emit jitter');
    assert(reach < 1.2 * 20, 'tighter than the round-1 spray toward the lane');
    assert(-up.min + kind.size / 2 < GAME_CONFIG.SCORE_Y,
      'the puff does not leave the top of the canvas');
    assert(-up.min >= 8, 'the puff still lifts enough to read at the score');
    assert(down.max + kind.size / 2 < 24, 'the puff does not fall toward the lane');
    assert(kind.count > Particles.KINDS.jump.count, 'still reads louder than a jump puff');
    assert(kind.count < 20, 'fewer motes than the old firework');

    for (const name of Object.keys(UNCHANGED_KINDS)) {
      const got = Particles.KINDS[name];
      const want = UNCHANGED_KINDS[name];
      for (const key of Object.keys(want)) {
        assertEquals(got[key], want[key], name + ' ' + key + ' stays unchanged');
      }
    }
  });

  it('a level-up in Updated and Daily emits the puff, and Classic emits none', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaConfetti(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY, MODES.CLASSIC]) {
        game.mode = mode;
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        resetGame();
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        Particles.reset();
        game.state = STATE.RUNNING;
        game.graceFrames = 0;
        game.obstacles.length = 0;
        game.lastObstacleX = GAME_CONFIG.CANVAS_W;
        game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
        game.score = GAME_CONFIG.SCORE_PER_LEVEL - GAME_CONFIG.SCORE_INCREMENT;
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        const motes = goldMotes();
        if (mode === MODES.CLASSIC) {
          assertEquals(motes.length, 0, 'Classic level-up still emits no confetti');
        } else {
          assertEquals(motes.length, PUFF.count, mode + ' level-up emits the quiet puff');
          assert(motes.every((p) => p.life === PUFF.life - 1), mode + ' puff uses the short life');
          assert(motes.every((p) => p.color === PUFF.color), mode + ' puff stays gold');
          assert(motes.every((p) => p.alpha === PUFF.alpha), mode + ' puff uses the soft peak');
        }
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' level-up leaves speed on the curve');
      }
    } finally {
      game.mode = origMode;
      setQaConfetti(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still damps the puff under reduced motion', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      Particles.reset();
      const n = Particles.emit('confetti', 480, 30);
      const expectedCount = Math.max(1, Math.round(PUFF.count * 0.25));
      const expectedLife = Math.max(2, Math.round(PUFF.life * 0.5));
      assertEquals(n, expectedCount, 'reduced motion still applies the quarter-count floor');
      assert(expectedLife < PUFF.life, 'reduced motion still halves confetti life');
      goldMotes().forEach((p) => {
        assertEquals(p.life, expectedLife, 'reduced motion still halves the puff');
        assertEquals(p.color, PUFF.color, 'reduced motion keeps the gold');
        assertEquals(p.alpha, PUFF.alpha, 'reduced motion keeps the soft peak');
      });
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
      Particles.reset();
    }
  });
});

describe('QA confetti flag (?qaConfetti=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyPaint() {
    const calls = [];
    const origFillRect = ctx.fillRect;
    const origFillText = ctx.fillText;
    ctx.fillRect = function (x, y, w, h) {
      calls.push({ op: 'rect', style: ctx.fillStyle, x: x, y: y, w: w, h: h, alpha: ctx.globalAlpha });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    return {
      calls: calls,
      restore() {
        ctx.fillRect = origFillRect;
        ctx.fillText = origFillText;
      },
    };
  }

  function goldAfterScore(calls) {
    const scoreAt = calls.findIndex((c) => c.op === 'text' && /^\d{5}$/.test(c.text));
    if (scoreAt < 0) return [];
    return calls.slice(scoreAt + 1).filter((c) => c.op === 'rect' && c.style === QA_CONFETTI_COLOR);
  }

  function assertBlock(calls, label, alpha) {
    const ink = alpha === undefined ? 1 : alpha;
    const block = qaConfettiRect();
    const gold = goldAfterScore(calls);
    assertEquals(gold.length, 1, label + ' paints one dark-gold block after the score');
    assertEquals(gold[0].x, block.x, label + ' block sits under the score digits');
    assertEquals(gold[0].y, block.y, label + ' block sits under the score line');
    assertEquals(gold[0].w, QA_CONFETTI_BLOCK_W, label + ' block is wide enough to see');
    assertEquals(gold[0].h, QA_CONFETTI_BLOCK_H, label + ' block is tall enough to see');
    assertEquals(gold[0].alpha, ink, label + ' block uses the hold ink');
    assert(gold[0].y >= GAME_CONFIG.SCORE_Y, label + ' block is below the score baseline');
    const scoreAt = calls.findIndex((c) => c.op === 'text' && /^\d{5}$/.test(c.text));
    const after = calls.slice(scoreAt + 1);
    const rim = after.filter((c) => c.op === 'rect' && c.style === QA_CONFETTI_RIM);
    assertEquals(rim.length, 1, label + ' paints a dark rim with the block');
    assertEquals(rim[0].alpha, ink, label + ' rim uses the hold ink');
    const lastHud = after.reduce((at, c, i) => (c.op === 'text' ? i : at), -1);
    const goldAt = after.findIndex((c) => c.op === 'rect' && c.style === QA_CONFETTI_COLOR);
    assert(goldAt > lastHud, label + ' gold is the last paint, after every HUD string');
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Particles.reset();
  }

  it('recognizes only ?qaConfetti=1', () => {
    assert(readQaConfettiFlag('?qaConfetti=1') === true, '?qaConfetti=1 should enable the early gold puff');
    assert(readQaConfettiFlag('?qaNight=1&qaConfetti=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaConfettiFlag('?qaConfetti=1&qaTrail=1') === true, 'param order should not matter');
    assert(readQaConfettiFlag('') === false, 'a normal visit should leave confetti on the real level');
    assert(readQaConfettiFlag('?qaConfetti=0') === false, 'only the value 1 enables the flag');
    assert(readQaConfettiFlag('?qaConfetti=12') === false, 'qaConfetti=12 must not count as the flag');
    assert(readQaConfettiFlag('?qaLevel=1') === false, 'the level flag must not force this latch');
  });

  it('paints a dark-gold block from the hold, even when the pool cannot emit', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(QA_CONFETTI_HOLD >= 120, 'the debug hold must outlast a quick capture after GET READY');
      assert(QA_CONFETTI_BLOCK_W >= 60, 'the debug block must be wide enough to see under the score');
      assert(QA_CONFETTI_BLOCK_H >= 24, 'the debug block must be tall enough to see under the score');
      assertEquals(Particles.KINDS.confetti.life, 12, 'production life stays the shorter puff');
      assertEquals(Particles.KINDS.confetti.color, '#ffd700', 'production gold stays the light kind');
      assertEquals(Particles.KINDS.confetti.size, 3, 'production mote size stays 3');
      assertEquals(Particles.KINDS.confetti.count, 6, 'production count stays the quieter puff');
      assertEquals(Particles.KINDS.confetti.vxSpread, 0.7, 'production spread stays on the score');
      assertEquals(Particles.KINDS.confetti.alpha, 0.7, 'production peak stays under solid gold');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaConfetti(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(goldAfterScore(spy.calls).length, 0, mode + ' without the flag does not paint');
        assertEquals(game.qaConfettiShown, false, mode + ' without the flag does not spend the latch');
        assertEquals(game.qaConfettiHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaConfetti(true);
        Particles.particles.forEach((p) => {
          p.life = 8;
          p.maxLife = 8;
          p.color = '#112233';
          p.size = 2;
        });
        spy.calls.length = 0;
        tick();
        assertBlock(spy.calls, mode);
        assertEquals(game.qaConfettiHold, QA_CONFETTI_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaConfettiShown, true, mode + ' spends the latch once');
        Particles.particles.forEach((p) => {
          assert(p.color !== QA_CONFETTI_COLOR, mode + ' does not restyle pool slots');
          assert(p.color !== '#ffd700', mode + ' does not emit the production puff');
        });
        assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, mode + ' must not jump the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' must not change speed');
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score');
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');
        assertEquals(game.qaLevelShown, false, mode + ' does not spend the level latch');
        assertEquals(Animations.milestoneFrames, 0, mode + ' does not start the level wash');

        for (let i = 0; i < 90; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertBlock(spy.calls, mode + ' still');
        assertEquals(game.qaConfettiHold, QA_CONFETTI_HOLD - 90,
          mode + ' keeps the hold up well after GET READY');
        assert(Math.abs(game.score - GAME_CONFIG.SCORE_INCREMENT * 91) < 1e-6,
          mode + ' scoring keeps its normal step');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaConfetti(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the block when a hit skips the rest of the frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaConfetti(true);
      tick();
      assertEquals(game.qaConfettiHold, QA_CONFETTI_HOLD, 'the hold is up before the hit');
      game.obstacles.push({
        x: dino.x,
        y: dino.y,
        width: dino.width,
        height: dino.height,
        type: 'small',
        render: 'single',
      });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus ends the run');
      const block = qaConfettiRect();
      const gold = spy.calls.filter((c) => c.op === 'rect' && c.style === QA_CONFETTI_COLOR);
      assertEquals(gold.length, 1, 'the hold still paints after the hit returns early');
      assertEquals(gold[0].x, block.x, 'the block stays under the score');
      assertEquals(gold[0].y, block.y, 'the block stays under the score line');
      assertEquals(gold[0].w, QA_CONFETTI_BLOCK_W, 'the block stays large');
      assertEquals(gold[0].h, QA_CONFETTI_BLOCK_H, 'the block stays tall');
      assertEquals(gold[0].alpha, 1, 'the block stays opaque on the death frame');
      spy.calls.length = 0;
      tick();
      assertBlock(spy.calls, 'death shake');
      assert(game.qaConfettiHold > 0, 'dying during the hold does not clear it');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaConfetti(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaConfetti=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaConfetti(true);
      tick();
      tick();
      assertEquals(goldAfterScore(spy.calls).length, 0, 'Classic never paints the debug block');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === '#ffd700').length,
        0,
        'Classic does not emit the production gold either'
      );
      assertEquals(game.qaConfettiShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaConfettiHold, 0, 'Classic does not start the hold');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaConfetti(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens the hold, paints quieter, and does not emit', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        setReducedMotion(true);
        setQaConfetti(true);
        spy.calls.length = 0;
        tick();
        assertEquals(game.qaConfettiHold, qaConfettiHoldFrames(), mode + ' hold uses the shorter window');
        assert(game.qaConfettiHold < QA_CONFETTI_HOLD, mode + ' hold is shorter than the full capture');
        assert(qaConfettiHoldFrames() >= 2, mode + ' hold still lasts long enough to see');
        assertEquals(qaConfettiPaintAlpha(), 0.5, mode + ' reduced motion halves the hold ink');
        assertBlock(spy.calls, mode + ' reduced motion', 0.5);
        assertEquals(
          Particles.particles.filter((p) => p.color === QA_CONFETTI_COLOR || p.color === '#ffd700').length,
          0,
          mode + ' debug block does not go through the particle pool'
        );
        assert(game.score < 1, mode + ' debug block does not move the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaConfetti(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaConfetti=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPaint();
    global.location = { search: '?qaConfetti=1' };
    try {
      setQaConfetti(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      Particles.reset();
      tick();
      assertBlock(spy.calls, 're-read flag');
      assertEquals(game.qaConfettiHold, QA_CONFETTI_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaConfettiShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaConfetti(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quiet day land dust', () => {
  // The day jump was 6 motes living 18 frames and flung ±1.5px. The landing
  // was 9 motes living 14 frames and flung ±2.5px. From the feet that spray
  // cleared the dino and sat in the obstacle lane. The whisper keeps the
  // brown, with fewer motes, a shorter life, a tighter spread, and soft
  // peak ink, so the puff dies at the ankle.
  const JUMP = {
    count: 3,
    color: '#9c8770',
    size: 3,
    life: 8,
    alpha: 0.5,
    vyMin: -1.2,
    vyMax: -0.4,
    vxSpread: 0.6,
    gravity: 0.1,
  };
  const LAND = {
    count: 5,
    color: '#9c8770',
    size: 3,
    life: 8,
    alpha: 0.4,
    vyMin: -0.9,
    vyMax: -0.4,
    vxSpread: 0.7,
    gravity: 0.12,
  };
  const UNCHANGED_KINDS = {
    trail:     { count: 1,  color: 'rgba(150,150,150,0.28)', size: 2, life:  6, vyMin: -0.1, vyMax:  0.1, vxSpread: 0.2, gravity: 0 },
    collision: { count: 5,  color: '#d04a2a',                size: 3, life: 8, vyMin: -1.2, vyMax:  0.4, vxSpread: 0.7, gravity: 0.10 },
    confetti:  { count: 6, color: '#ffd700',                size: 3, life: 12, alpha: 0.7, vyMin: -1.6, vyMax: -0.5, vxSpread: 0.7, gravity: 0.10 },
    plateau:   { count: 4,  color: '#c5d4e4', size: 2, life: 12, alpha: 0.45, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.3, gravity: 0.06 },
    plateauQa: { count: 4, color: '#3d4f63', size: 2, life: 40, vyMin: -0.2, vyMax: -0.08, vxSpread: 0.08, gravity: 0.002 },
  };

  function stepPath(vy0, kind) {
    let y = 0;
    let vy = vy0;
    let min = 0;
    let max = 0;
    for (let i = 0; i < kind.life; i++) {
      y += vy;
      if (y < min) min = y;
      if (y > max) max = y;
      vy += kind.gravity;
    }
    return { min: min, max: max };
  }

  function footReach(kind) {
    return kind.vxSpread * kind.life + cfg('PARTICLE_EMIT_SPREAD') / 2 + kind.size / 2;
  }

  function dustMotes(color) {
    return Particles.particles.filter((p) => p.life > 0 && p.color === color);
  }

  it('keeps day jump and land dust a short brown whisper at the feet', () => {
    const jump = Particles.KINDS.jump;
    const land = Particles.KINDS.land;
    for (const key of Object.keys(JUMP)) {
      assertEquals(jump[key], JUMP[key], 'jump ' + key + ' is the quieter day puff');
    }
    for (const key of Object.keys(LAND)) {
      assertEquals(land[key], LAND[key], 'land ' + key + ' is the quieter day puff');
    }
    assert(jump.count < 6, 'fewer motes than the old 6-mote takeoff');
    assert(land.count < 9, 'fewer motes than the old 9-mote landing');
    assert(land.count > jump.count, 'a landing still reads heavier than a takeoff');
    assert(jump.life < 18, 'shorter than the old 18-frame takeoff');
    assert(land.life < 14, 'shorter than the old 14-frame landing');
    assert(jump.vxSpread < 1.5, 'tighter than the old takeoff spread');
    assert(land.vxSpread < 2.5, 'tighter than the old landing spread');
    assert(jump.alpha < 1 && jump.alpha >= 0.35, 'takeoff ink is soft but still readable');
    assert(land.alpha < jump.alpha, 'the wider landing is the softer of the two');
    assert(land.alpha >= 0.35, 'landing ink still reads as brown');
    assertEquals(jump.color, '#9c8770', 'day takeoff stays in the land-dust brown');
    assertEquals(land.color, '#9c8770', 'day landing stays in the land-dust brown');
    assertEquals(jump.size, 3, 'takeoff mote stays a readable 3px');
    assertEquals(land.size, 3, 'landing mote stays a readable 3px');

    const jumpUp = stepPath(jump.vyMin, jump);
    const landUp = stepPath(land.vyMin, land);
    const jumpSlow = stepPath(jump.vyMax, jump);
    const landSlow = stepPath(land.vyMax, land);
    assert(footReach(jump) <= 12, 'a takeoff stays inside the feet, off the obstacle lane');
    assert(footReach(land) <= 12, 'a landing stays inside the feet, off the obstacle lane');
    assert(-jumpUp.min <= 10, 'a takeoff does not climb the dino');
    assert(-jumpUp.min >= 5, 'a takeoff still lifts enough to see at the ankle');
    assert(-landUp.min <= 8, 'a landing stays flatter than a takeoff');
    assert(-landUp.min >= 3, 'a landing still kicks a visible mote');
    assert(jumpSlow.max <= 1, 'the slowest takeoff mote does not fall through the ground');
    assert(landSlow.max <= 1, 'the slowest landing mote does not fall through the ground');
    assert(footReach(jump) < GAME_CONFIG.DINO_WIDTH / 2, 'takeoff dust stays on the dino');
    assert(footReach(land) < GAME_CONFIG.DINO_WIDTH / 2, 'landing dust stays on the dino');

    for (const name of Object.keys(UNCHANGED_KINDS)) {
      const got = Particles.KINDS[name];
      const want = UNCHANGED_KINDS[name];
      for (const key of Object.keys(want)) {
        assertEquals(got[key], want[key], name + ' ' + key + ' stays unchanged');
      }
      if (!Object.prototype.hasOwnProperty.call(want, 'alpha')) {
        assertEquals(got.alpha, undefined, name + ' does not take the land-dust alpha');
      }
    }
  });

  it('emits the whisper in Updated and Daily, and none in Classic', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    try {
      setReducedMotion(false);
      setQaNight(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        for (const spec of [
          ['jump', JUMP],
          ['land', LAND],
        ]) {
          const kind = spec[0];
          const want = spec[1];
          game.mode = mode;
          game.score = 0;
          let rngCalls = 0;
          game.rng = () => { rngCalls++; return 0.5; };
          Particles.reset();
          const n = Particles.emit(kind, 80, 140);
          const motes = dustMotes(want.color);
          assertEquals(n, want.count, mode + ' ' + kind + ' emits the whisper count');
          assertEquals(motes.length, want.count, mode + ' ' + kind + ' pool holds the whisper');
          assertEquals(rngCalls, 0, mode + ' ' + kind + ' does not consume the run seed');
          motes.forEach((p) => {
            assertEquals(p.life, want.life, mode + ' ' + kind + ' mote uses the short life');
            assertEquals(p.maxLife, want.life, mode + ' ' + kind + ' mote fades across that life');
            assertEquals(p.size, want.size, mode + ' ' + kind + ' mote stays readable');
            assertEquals(p.color, want.color, mode + ' ' + kind + ' mote stays the day brown');
            assertEquals(p.alpha, want.alpha, mode + ' ' + kind + ' mote keeps the soft peak ink');
            assertEquals(p.gravity, want.gravity, mode + ' ' + kind + ' mote keeps its settle');
            assert(Math.abs(p.vx) <= want.vxSpread, mode + ' ' + kind + ' stays inside the tight spread');
            assert(p.vy >= want.vyMin && p.vy <= want.vyMax, mode + ' ' + kind + ' stays in the short lift');
          });
        }
      }

      game.mode = MODES.CLASSIC;
      game.score = 0;
      Particles.reset();
      assertEquals(Particles.emit('jump', 80, 140), 0, 'Classic emits no jump dust');
      assertEquals(Particles.emit('land', 80, 140), 0, 'Classic emits no land dust');
      assertEquals(dustMotes('#9c8770').length, 0, 'Classic leaves the pool empty of brown dust');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.rng = origRng;
      setReducedMotion(false);
      setQaNight(false);
      Particles.reset();
    }
  });

  it('draws the whisper at its soft peak and leaves other kinds at full ink', () => {
    const origMode = game.mode;
    const calls = [];
    const origFill = ctx.fillRect;
    ctx.fillRect = function () {
      calls.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha });
    };
    try {
      setReducedMotion(false);
      setQaNight(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      Particles.reset();
      Particles.emit('jump', 80, 140);
      Particles.draw();
      const brown = calls.filter((c) => c.style === JUMP.color);
      assertEquals(brown.length, JUMP.count, 'the takeoff draws one rect per mote');
      brown.forEach((c) => {
        assertEquals(c.alpha, JUMP.alpha, 'a fresh takeoff mote draws at the soft peak');
      });
      assertEquals(ctx.globalAlpha, 1, 'drawing dust restores the lane alpha');

      calls.length = 0;
      Particles.reset();
      Particles.emit('land', 80, 140);
      Particles.draw();
      const landed = calls.filter((c) => c.style === LAND.color);
      assertEquals(landed.length, LAND.count, 'the landing draws one rect per mote');
      landed.forEach((c) => {
        assertEquals(c.alpha, LAND.alpha, 'a fresh landing mote draws at its softer peak');
      });

      calls.length = 0;
      Particles.reset();
      Particles.emit('collision', 80, 140);
      Particles.draw();
      const red = calls.filter((c) => c.style === '#d04a2a');
      assert(red.length > 0, 'the collision puff still draws');
      red.forEach((c) => {
        assertEquals(c.alpha, 1, 'collision still starts at full ink');
      });
    } finally {
      ctx.fillRect = origFill;
      ctx.globalAlpha = 1;
      game.mode = origMode;
      Particles.reset();
    }
  });

  it('still damps jump and land under reduced motion', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      for (const spec of [
        ['jump', JUMP],
        ['land', LAND],
      ]) {
        const kind = spec[0];
        const want = spec[1];
        Particles.reset();
        const n = Particles.emit(kind, 80, 140);
        const expectedCount = Math.max(1, Math.round(want.count * 0.25));
        const expectedLife = Math.max(2, Math.round(want.life * 0.5));
        assertEquals(n, expectedCount, 'reduced motion keeps the quarter-count damping on ' + kind);
        assert(expectedCount < want.count, kind + ' damping still removes motes');
        assert(expectedLife < want.life, kind + ' damping still shortens life');
        dustMotes(want.color).forEach((p) => {
          assertEquals(p.life, expectedLife, 'reduced motion still halves ' + kind + ' life');
          assertEquals(p.alpha, want.alpha, 'reduced motion keeps the soft ' + kind + ' ink');
          assertEquals(p.color, want.color, 'reduced motion keeps the day brown on ' + kind);
        });
      }
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
      Particles.reset();
    }
  });
});

describe('QA dust flag (?qaDust=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyPaint() {
    const calls = [];
    const origFillRect = ctx.fillRect;
    const origFillText = ctx.fillText;
    ctx.fillRect = function (x, y, w, h) {
      calls.push({ op: 'rect', style: ctx.fillStyle, x: x, y: y, w: w, h: h, alpha: ctx.globalAlpha });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    return {
      calls: calls,
      restore() {
        ctx.fillRect = origFillRect;
        ctx.fillText = origFillText;
      },
    };
  }

  function dustFills(calls, color) {
    return calls.filter((c) => c.op === 'rect' && c.style === color && c.w === QA_DUST_SIZE && c.h === QA_DUST_SIZE);
  }

  function assertMarks(calls, color, label, alpha) {
    const peak = alpha === undefined ? 1 : alpha;
    const marks = qaDustMarks();
    const fills = dustFills(calls, color);
    assertEquals(fills.length, marks.length, label + ' paints every held mote');
    marks.forEach((mark, i) => {
      assertEquals(fills[i].x, mark.x, label + ' mote ' + i + ' stays on the foot x');
      assertEquals(fills[i].y, mark.y, label + ' mote ' + i + ' stays on the foot y');
      assertEquals(fills[i].alpha, peak, label + ' mote ' + i + ' paints at the expected ink');
    });
    const rims = calls.filter((c) => c.op === 'rect' && c.style === QA_DUST_RIM);
    assertEquals(rims.length, marks.length, label + ' paints a rim with every mote');
    const lastHud = calls.reduce((at, c, i) => (c.op === 'text' ? i : at), -1);
    const firstFill = calls.findIndex((c) => c.op === 'rect' && c.style === color && c.w === QA_DUST_SIZE);
    assert(firstFill > lastHud, label + ' dust is painted after the frame, including the HUD');
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setQaDust(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Particles.reset();
  }

  it('recognizes only ?qaDust=1', () => {
    assert(readQaDustFlag('?qaDust=1') === true, '?qaDust=1 should enable the held foot dust');
    assert(readQaDustFlag('?qaNight=1&qaDust=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaDustFlag('?qaDust=1&qaConfetti=1') === true, 'param order should not matter');
    assert(readQaDustFlag('') === false, 'a normal visit should leave dust on a real jump and land');
    assert(readQaDustFlag('?qaDust=0') === false, 'only the value 1 enables the flag');
    assert(readQaDustFlag('?qaDust=12') === false, 'qaDust=12 must not count as the flag');
    assert(readQaDustFlag('?qaNight=1') === false, 'night alone must not force the held dust');
  });

  it('paints held foot motes from the first frame, even when the pool cannot emit', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(QA_DUST_HOLD >= 120, 'the debug hold must outlast a quick capture');
      assert(QA_DUST_SIZE >= 4, 'each held mote must be large enough to see at the feet');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaDust(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(dustFills(spy.calls, '#9c8770').length, 0, mode + ' without the flag does not paint');
        assertEquals(game.qaDustShown, false, mode + ' without the flag does not spend the latch');
        assertEquals(game.qaDustHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaDust(true);
        Particles.particles.forEach((p) => {
          p.life = 8;
          p.maxLife = 8;
          p.color = '#112233';
          p.size = 2;
          p.alpha = 1;
        });
        spy.calls.length = 0;
        tick();
        assertMarks(spy.calls, '#9c8770', mode);
        assertEquals(game.qaDustHold, QA_DUST_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaDustShown, true, mode + ' spends the latch once');
        Particles.particles.forEach((p) => {
          assertEquals(p.color, '#112233', mode + ' does not restyle pool slots');
          assert(p.life > 0, mode + ' does not emit into the pool');
        });
        assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, mode + ' must not jump the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' must not change speed');
        assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score');
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');

        for (let i = 0; i < 90; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertMarks(spy.calls, '#9c8770', mode + ' still');
        assertEquals(game.qaDustHold, QA_DUST_HOLD - 90,
          mode + ' keeps the hold up well into the run');
        assert(Math.abs(game.score - GAME_CONFIG.SCORE_INCREMENT * 91) < 1e-6,
          mode + ' scoring keeps its normal step');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the held motes when a hit skips the rest of the frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaDust(true);
      tick();
      assertEquals(game.qaDustHold, QA_DUST_HOLD, 'the hold is up before the hit');
      game.obstacles.push({
        x: dino.x,
        y: dino.y,
        width: dino.width,
        height: dino.height,
        type: 'small',
        render: 'single',
      });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus ends the run');
      assertMarks(spy.calls, '#9c8770', 'death');
      assert(game.qaDustHold > 0, 'dying during the hold does not clear it');
      spy.calls.length = 0;
      tick();
      assertMarks(spy.calls, '#9c8770', 'death shake');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('holds the motes on the idle dino before the run starts', () => {
    const origMode = game.mode;
    const origState = game.state;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      game.state = STATE.IDLE;
      setQaDust(true);
      spy.calls.length = 0;
      tick();
      assertMarks(spy.calls, '#9c8770', 'idle');
      assertEquals(game.qaDustHold, QA_DUST_HOLD, 'idle latches the full hold');
      spy.calls.length = 0;
      tick();
      assertMarks(spy.calls, '#9c8770', 'still idle');
      assertEquals(game.qaDustHold, QA_DUST_HOLD, 'the hold does not tick away before the run');
      assertEquals(game.score, 0, 'idle dust must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      game.state = origState;
      setQaDust(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNight=1 cools the held motes without moving the score', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaDust(true);
      setQaNight(true);
      spy.calls.length = 0;
      tick();
      assertMarks(spy.calls, GAME_CONFIG.NIGHT_LAND_DUST_COLOR, 'night', 0.42);
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COLOR, '#6a686e', 'night dust stays the cool gray');
      assertEquals(GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA, 0.42,
        'the night hold uses the quieter takeoff peak, not solid ink');
      assertEquals(dustFills(spy.calls, '#9c8770').length, 0, 'night hold does not paint the day brown');
      assert(game.score < 1, 'the night hold must not write the score');
      assertEquals(game.qaDustHold, QA_DUST_HOLD, 'the quieter night hold keeps the full capture length');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      setQaNight(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaDust=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaDust(true);
      tick();
      tick();
      assertEquals(dustFills(spy.calls, '#9c8770').length, 0, 'Classic never paints the held dust');
      assertEquals(dustFills(spy.calls, '#6a686e').length, 0, 'Classic never paints the night dust either');
      assertEquals(game.qaDustShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaDustHold, 0, 'Classic does not start the hold');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion still paints the held motes and does not emit them', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setReducedMotion(true);
      setQaDust(true);
      tick();
      assertMarks(spy.calls, '#9c8770', 'reduced motion');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0).length,
        0,
        'the held motes do not go through the particle pool'
      );
      assert(game.score < 1, 'the held motes do not move the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion halves the night hold ink and keeps the capture length', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setReducedMotion(true);
      setQaNight(true);
      setQaDust(true);
      tick();
      assertMarks(spy.calls, '#6a686e', 'reduced motion night', 0.21);
      assertEquals(game.qaDustHold, QA_DUST_HOLD,
        'reduced motion damps the night ink without shortening the hold');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0).length,
        0,
        'the held night motes do not go through the particle pool'
      );
      assert(game.score < 1, 'the damped night hold must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaDust(false);
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaDust=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPaint();
    global.location = { search: '?qaNight=1&qaDust=1' };
    try {
      setQaDust(false);
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      Particles.reset();
      tick();
      assertMarks(spy.calls, '#6a686e', 're-read flag', 0.42);
      assertEquals(game.qaDustHold, QA_DUST_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaDustShown, true, 'the re-read flag spends the latch');
      assertEquals(getBackgroundColor(game.score), '#1a1a2e',
        'qaNight on the same query still paints night');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaDust(false);
      setQaNight(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA flash flag (?qaFlash=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyPaint() {
    const calls = [];
    const origFillRect = ctx.fillRect;
    const origFillText = ctx.fillText;
    ctx.fillRect = function (x, y, w, h) {
      calls.push({
        op: 'rect',
        style: ctx.fillStyle,
        x: x,
        y: y,
        w: w,
        h: h,
        alpha: ctx.globalAlpha,
      });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    return {
      calls: calls,
      restore() {
        ctx.fillRect = origFillRect;
        ctx.fillText = origFillText;
      },
    };
  }

  function flashFills(calls, alphaText) {
    return calls.filter((c) =>
      c.op === 'rect'
      && typeof c.style === 'string'
      && c.style.indexOf('rgba(255, 255, 255') === 0
      && c.style.indexOf(alphaText) !== -1
      && c.w === GAME_CONFIG.CANVAS_W
      && c.h === GAME_CONFIG.CANVAS_H
    );
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setQaDust(false);
    setQaFlash(false);
    setQaScorePop(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Animations.deathFlashFrames = 0;
    Particles.reset();
  }

  it('recognizes only ?qaFlash=1', () => {
    assert(readQaFlashFlag('?qaFlash=1') === true, '?qaFlash=1 should hold the death blink');
    assert(readQaFlashFlag('?qaNight=1&qaFlash=1') === true, 'the flag should work beside ?qaNight=1');
    assert(readQaFlashFlag('?qaFlash=1&qaDust=1') === true, 'param order should not matter');
    assert(readQaFlashFlag('') === false, 'a normal visit should leave the flash for a real death');
    assert(readQaFlashFlag('?qaFlash=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlashFlag('?qaFlash=12') === false, 'qaFlash=12 must not count as the flag');
    assert(readQaFlashFlag('?qaNight=1') === false, 'night alone must not hold the death blink');
  });

  it('paints the quieter day blink from the first frame even when the flash timer is zero', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(QA_FLASH_HOLD >= 120, 'the debug hold must outlast a quick capture');
      const dayAlpha = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlash(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        assertEquals(flashFills(spy.calls, dayAlpha).length, 0, mode + ' without the flag does not wash the lane');
        assertEquals(game.qaFlashHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlash(true);
        Animations.deathFlashFrames = 0;
        Particles.reset();
        for (let i = 0; i < Particles.POOL_SIZE; i++) Particles.particles[i].life = 8;
        spy.calls.length = 0;
        tick();
        const fills = flashFills(spy.calls, dayAlpha);
        assertEquals(fills.length, 1, mode + ' paints one full-canvas blink');
        assertEquals(fills[0].x, 0, mode + ' blink starts at the canvas origin');
        assertEquals(fills[0].y, 0, mode + ' blink starts at the canvas top');
        assertEquals(fills[0].alpha, 1, mode + ' blink is a real fill, not a hidden layer');
        const lastHud = spy.calls.reduce((at, c, i) => (c.op === 'text' ? i : at), -1);
        const flashAt = spy.calls.findIndex((c) => c.op === 'rect' && c.w === GAME_CONFIG.CANVAS_W && typeof c.style === 'string' && c.style.indexOf(dayAlpha) !== -1);
        assert(flashAt > lastHud, mode + ' blink is painted after the frame, including the HUD');
        assertEquals(game.qaFlashHold, QA_FLASH_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaFlashShown, true, mode + ' spends the latch');
        assertEquals(Animations.deathFlashFrames, 0, mode + ' does not borrow the real death timer');
        assertEquals(game.score, scoreOff, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' hold must not change speed');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlash(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the blink when a hit returns before the death draw', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlash(true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      const dayAlpha = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      assertEquals(flashFills(spy.calls, dayAlpha).length, 1,
        'the hold still paints after the collision return');
      assertEquals(Animations.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the real flash timer is still armed for the death shake');
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlash(false);
      game.obstacles.length = 0;
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNight=1 holds the soft night blink without moving the score', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlash(true);
      setQaNight(true);
      spy.calls.length = 0;
      tick();
      const nightAlpha = GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      const dayAlpha = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      assertEquals(flashFills(spy.calls, nightAlpha).length, 1, 'night hold paints the quiet peak');
      assertEquals(flashFills(spy.calls, dayAlpha).length, 0, 'night hold does not paint the day peak');
      assert(game.score < 1, 'the night hold must not write the score');
      assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
        'the night hold must not change speed');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlash(false);
      setQaNight(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaFlash=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaFlash(true);
      tick();
      tick();
      assertEquals(flashFills(spy.calls, '0.500').length, 0, 'Classic never paints the day hold');
      assertEquals(flashFills(spy.calls, '0.200').length, 0, 'Classic never paints the night hold');
      assertEquals(game.qaFlashShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaFlashHold, 0, 'Classic does not start the hold');
      assertEquals(Animations.deathFlashFrames, 0, 'Classic still does not start the real flash');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlash(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens and damps the hold, and still paints it', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      for (const night of [false, true]) {
        armFreshRun(MODES.UPDATED);
        setReducedMotion(true);
        setQaFlash(true);
        setQaNight(night);
        const peak = night
          ? GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA
          : GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA;
        const damped = (peak * 0.5).toFixed(3);
        spy.calls.length = 0;
        tick();
        const label = night ? 'night' : 'day';
        assertEquals(game.qaFlashHold, qaFlashHoldFrames(), label + ' hold uses the shorter window');
        assert(game.qaFlashHold < QA_FLASH_HOLD, label + ' hold is shorter than the full capture');
        assert(qaFlashHoldFrames() >= 2, label + ' hold still lasts long enough to see');
        assertEquals(flashFills(spy.calls, damped).length, 1, label + ' reduced motion still paints the wash');
        assertEquals(flashFills(spy.calls, peak.toFixed(3)).length, 0,
          label + ' reduced motion does not keep the full-strength ink');
        assertEquals(Animations.deathFlashFrames, 0, label + ' hold does not arm the real flash');
        assert(game.score < 1, label + ' damped hold must not write the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlash(false);
      setQaNight(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaFlash=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPaint();
    global.location = { search: '?qaNight=1&qaFlash=1' };
    try {
      setQaFlash(false);
      setQaNight(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      Animations.deathFlashFrames = 0;
      Particles.reset();
      tick();
      assertEquals(flashFills(spy.calls, GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3)).length, 1,
        're-read flag paints the night blink');
      assertEquals(game.qaFlashHold, QA_FLASH_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaFlashShown, true, 'the re-read flag spends the latch');
      assertEquals(getBackgroundColor(game.score), '#1a1a2e',
        'qaNight on the same query still paints night');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaFlash(false);
      setQaNight(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quieter death score pop', () => {
  const OLD_SLAP = 1.4;

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function spyScale() {
    const calls = [];
    const origScale = ctx.scale;
    const origFillText = ctx.fillText;
    ctx.scale = function (x, y) {
      calls.push({ op: 'scale', x: x, y: y });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    return {
      calls: calls,
      restore() {
        ctx.scale = origScale;
        ctx.fillText = origFillText;
      },
    };
  }

  function scalesNear(calls, scale) {
    return calls.filter((c) =>
      c.op === 'scale' && Math.abs(c.x - scale) < 1e-9 && Math.abs(c.y - scale) < 1e-9
    );
  }

  it('keeps the shake window and peaks as a breath, not a 1.4 slap', () => {
    const origMode = game.mode;
    try {
    assertEquals(GAME_CONFIG.SCORE_POP_FRAMES, 12,
      'the classic-length count stays 12');
    game.mode = MODES.UPDATED;
    assertEquals(scorePopWindow(), GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
      'the Updated pop eases across the quieter shake');
    } finally {
      game.mode = origMode;
    }
    assertEquals(GAME_CONFIG.SCORE_POP_PEAK_SCALE, 1.12,
      'the first frame grows the 20px digits by about 2.4px');
    assert(GAME_CONFIG.SCORE_POP_PEAK_SCALE < OLD_SLAP,
      'the peak stays under the old slap');
    assert(GAME_CONFIG.SCORE_POP_PEAK_SCALE > 1,
      'the number still grows, so the death cue still reads');
    assertEquals(scorePopScale(1), GAME_CONFIG.SCORE_POP_PEAK_SCALE,
      'the first pop frame is the quiet peak');
    const mid = scorePopScale(0.5);
    assert(mid > 1 && mid < GAME_CONFIG.SCORE_POP_PEAK_SCALE,
      'later frames ease back toward the resting size');
  });

  it('Updated and Daily draw the first death frame at the quiet peak', () => {
    const origMode = game.mode;
    const origPop = Animations.scorePopFrames;
    const origScore = game.score;
    const spy = spyScale();
    try {
      setReducedMotion(false);
      game.score = 42;
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        Animations.scorePopFrames = scorePopWindow();
        spy.calls.length = 0;
        drawScore();
        assertEquals(scalesNear(spy.calls, OLD_SLAP).length, 0,
          mode + ' does not slap the score to 1.4');
        assertEquals(scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length, 1,
          mode + ' scales the HUD once, at the quiet peak');
        const scaleAt = spy.calls.findIndex((c) => c.op === 'scale');
        const textAt = spy.calls.findIndex((c) => c.op === 'text' && c.text === '00042');
        assert(scaleAt !== -1 && textAt > scaleAt,
          mode + ' draws the digits inside the scale');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      game.score = origScore;
      Animations.scorePopFrames = origPop;
      setReducedMotion(false);
    }
  });

  it('Classic does not scale the score', () => {
    const origMode = game.mode;
    const origPop = Animations.scorePopFrames;
    const spy = spyScale();
    try {
      setReducedMotion(false);
      game.mode = MODES.CLASSIC;
      Animations.scorePopFrames = GAME_CONFIG.SCORE_POP_FRAMES;
      drawScore();
      assertEquals(spy.calls.filter((c) => c.op === 'scale').length, 0,
        'Classic keeps the resting HUD even if a pop counter is set');
    } finally {
      spy.restore();
      game.mode = origMode;
      Animations.scorePopFrames = origPop;
      setReducedMotion(false);
    }
  });

  it('reduced motion does not scale the score even when the counter is set', () => {
    const origMode = game.mode;
    const origPop = Animations.scorePopFrames;
    const spy = spyScale();
    try {
      setReducedMotion(true);
      game.mode = MODES.UPDATED;
      Animations.scorePopFrames = GAME_CONFIG.SCORE_POP_FRAMES;
      drawScore();
      game.mode = MODES.DAILY;
      drawScore();
      assertEquals(spy.calls.filter((c) => c.op === 'scale').length, 0,
        'reduced motion skips the real pop in Updated and Daily');
    } finally {
      spy.restore();
      game.mode = origMode;
      Animations.scorePopFrames = origPop;
      setReducedMotion(false);
    }
  });

  it('a tune can soften the peak and cannot slap past the old 1.4', () => {
    const origMode = game.mode;
    const origPop = Animations.scorePopFrames;
    const spy = spyScale();
    try {
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      Animations.scorePopFrames = GAME_CONFIG.SCORE_POP_FRAMES;
      withTuning({ SCORE_POP_PEAK_SCALE: 1.05 }, () => {
        assertEquals(scorePopScale(1), 1.05, 'a softer peak is honored');
        spy.calls.length = 0;
        drawScore();
        assertEquals(scalesNear(spy.calls, 1.05).length, 1, 'the draw uses the tuned peak');
      });
      withTuning({ SCORE_POP_PEAK_SCALE: OLD_SLAP }, () => {
        assertEquals(scorePopScale(1), OLD_SLAP,
          'the old peak is the loudest tune still allowed');
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 2 }, () => {
        assertEquals(scorePopScale(1), GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a peak past 1.4 falls back to the quiet breath');
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 0.8 }, () => {
        assertEquals(scorePopScale(1), GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a shrink falls back so the cue cannot invert');
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 'big' }, () => {
        assertEquals(scorePopScale(1), GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a non-numeric peak falls back to the quiet breath');
      });
    } finally {
      spy.restore();
      game.mode = origMode;
      Animations.scorePopFrames = origPop;
      setReducedMotion(false);
    }
  });
});

describe('QA score pop flag (?qaScorePop=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function spyPaint() {
    const calls = [];
    const origScale = ctx.scale;
    const origFillText = ctx.fillText;
    const origFillRect = ctx.fillRect;
    ctx.scale = function (x, y) {
      calls.push({ op: 'scale', x: x, y: y });
    };
    ctx.fillText = function (text) {
      calls.push({ op: 'text', text: String(text) });
    };
    ctx.fillRect = function (x, y, w, h) {
      calls.push({
        op: 'rect',
        style: ctx.fillStyle,
        x: x,
        y: y,
        w: w,
        h: h,
        alpha: ctx.globalAlpha,
      });
    };
    return {
      calls: calls,
      restore() {
        ctx.scale = origScale;
        ctx.fillText = origFillText;
        ctx.fillRect = origFillRect;
      },
    };
  }

  function scalesNear(calls, scale) {
    return calls.filter((c) =>
      c.op === 'scale' && Math.abs(c.x - scale) < 1e-9 && Math.abs(c.y - scale) < 1e-9
    );
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaLevel(false);
    setQaNight(false);
    setQaPlateau(false);
    setQaTrail(false);
    setQaConfetti(false);
    setQaDust(false);
    setQaFlash(false);
    setQaScorePop(false);
    setReducedMotion(false);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
    game.highScore = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Animations.scorePopFrames = 0;
    Particles.reset();
  }

  it('recognizes only ?qaScorePop=1', () => {
    assert(readQaScorePopFlag('?qaScorePop=1') === true, '?qaScorePop=1 should hold the score pop');
    assert(readQaScorePopFlag('?qaNight=1&qaScorePop=1') === true,
      'the flag should work beside ?qaNight=1');
    assert(readQaScorePopFlag('?qaScorePop=1&qaFlash=1') === true, 'param order should not matter');
    assert(readQaScorePopFlag('') === false, 'a normal visit should leave the pop for a real death');
    assert(readQaScorePopFlag('?qaScorePop=0') === false, 'only the value 1 enables the flag');
    assert(readQaScorePopFlag('?qaScorePop=12') === false, 'qaScorePop=12 must not count as the flag');
    assert(readQaScorePopFlag('?qaFlash=1') === false, 'the death blink must not hold the score pop');
  });

  it('holds the quieter peak from the first frame even when the pop timer is zero', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(QA_SCORE_POP_HOLD >= 120, 'the debug hold must outlast a quick capture');
      const peak = GAME_CONFIG.SCORE_POP_PEAK_SCALE;
      const cover = qaScorePopCover();
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaScorePop(false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        assertEquals(scalesNear(spy.calls, peak).length, 0,
          mode + ' without the flag does not scale the HUD');
        assertEquals(game.qaScorePopHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaScorePop(true);
        Animations.scorePopFrames = 0;
        Particles.reset();
        for (let i = 0; i < Particles.POOL_SIZE; i++) Particles.particles[i].life = 8;
        spy.calls.length = 0;
        tick();
        const popped = scalesNear(spy.calls, peak);
        assertEquals(popped.length, 1, mode + ' scales the HUD once, at the quiet peak');
        assertEquals(scalesNear(spy.calls, 1.4).length, 0, mode + ' does not hold the old slap');
        const coverAt = spy.calls.findIndex((c) =>
          c.op === 'rect' && c.style === '#ffffff'
          && c.x === cover.x && c.y === cover.y && c.w === cover.w && c.h === cover.h
          && c.alpha === 1
        );
        const scaleAt = spy.calls.findIndex((c) => c.op === 'scale');
        const textAt = spy.calls.findIndex((c, i) =>
          i > scaleAt && c.op === 'text' && c.text === '00000'
        );
        assert(coverAt !== -1, mode + ' covers the resting digits so they cannot ghost');
        assert(scaleAt > coverAt, mode + ' scales after the cover');
        assert(textAt > scaleAt, mode + ' draws the score inside the scale, after the frame');
        assertEquals(game.qaScorePopHold, QA_SCORE_POP_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaScorePopShown, true, mode + ' spends the latch');
        assertEquals(Animations.scorePopFrames, 0, mode + ' does not borrow the real pop timer');
        assertEquals(game.score, scoreOff, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' hold must not change speed');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaScorePop(false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the pop when a hit returns before the death draw', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaScorePop(true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      assertEquals(scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length, 1,
        'the hold still paints after the collision return');
      assertEquals(Animations.scorePopFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real pop timer is still armed for the quieter shake');
      assertEquals(Animations.deathFlashFrames, GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the death blink is unchanged');
      assertEquals(Animations.deathShakeFrames, GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the death shake uses the shorter window');
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaScorePop(false);
      game.obstacles.length = 0;
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaScorePop=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaScorePop(true);
      tick();
      tick();
      assertEquals(spy.calls.filter((c) => c.op === 'scale').length, 0,
        'Classic never scales the HUD');
      assertEquals(game.qaScorePopShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaScorePopHold, 0, 'Classic does not start the hold');
      assertEquals(Animations.scorePopFrames, 0, 'Classic still does not start the real pop');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaScorePop(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens and damps the hold, and still paints it', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        setReducedMotion(true);
        setQaScorePop(true);
        spy.calls.length = 0;
        tick();
        const damped = qaScorePopScale();
        const peak = GAME_CONFIG.SCORE_POP_PEAK_SCALE;
        assertEquals(game.qaScorePopHold, qaScorePopHoldFrames(),
          mode + ' hold uses the shorter window');
        assert(game.qaScorePopHold < QA_SCORE_POP_HOLD,
          mode + ' hold is shorter than the full capture');
        assert(qaScorePopHoldFrames() >= 2, mode + ' hold still lasts long enough to see');
        assert(damped > 1, mode + ' damped hold still grows the number');
        assert(damped < peak, mode + ' damped hold is softer than the motion-allowed peak');
        assertEquals(scalesNear(spy.calls, damped).length, 1,
          mode + ' reduced motion still paints the swell');
        assertEquals(scalesNear(spy.calls, peak).length, 0,
          mode + ' reduced motion does not keep the full peak');
        assertEquals(Animations.scorePopFrames, 0, mode + ' hold does not arm the real pop');
        assert(game.score < 1, mode + ' damped hold must not write the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaScorePop(false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaScorePop=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPaint();
    global.location = { search: '?qaScorePop=1' };
    try {
      setQaScorePop(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      game.highScore = 0;
      Animations.scorePopFrames = 0;
      Particles.reset();
      tick();
      assertEquals(scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length, 1,
        're-read flag paints the quiet peak');
      assertEquals(game.qaScorePopHold, QA_SCORE_POP_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaScorePopShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaScorePop(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quieter LEVEL label', () => {
  const CLASSIC_FONT = "bold 22px 'Courier New', Courier, monospace";

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function spyText() {
    const calls = [];
    const origFillText = ctx.fillText;
    ctx.fillText = function (text, x, y) {
      calls.push({
        text: String(text),
        x: x,
        y: y,
        font: ctx.font,
        alpha: ctx.globalAlpha,
        fill: ctx.fillStyle,
      });
    };
    return {
      calls: calls,
      restore() { ctx.fillText = origFillText; },
    };
  }

  function levelCalls(calls) {
    return calls.filter((c) => c.text.indexOf('LEVEL') === 0);
  }

  function paintLabel(frames) {
    const spy = spyText();
    const before = Animations.milestoneFrames;
    Animations.milestoneFrames = frames;
    try {
      drawMilestoneFlash();
      return { calls: levelCalls(spy.calls), framesAfter: Animations.milestoneFrames, before: before };
    } finally {
      spy.restore();
      ctx.globalAlpha = 1;
    }
  }

  it('keeps the Classic word at 22px for the full wash', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      setQaLevel(false);
      game.mode = MODES.CLASSIC;
      game.score = 40;
      game.milestoneText = 'LEVEL 2';
      const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(first.calls.length, 1, 'Classic paints the word on the first frame');
      assertEquals(first.calls[0].font, CLASSIC_FONT, 'Classic stays bold 22px');
      assertEquals(first.calls[0].alpha, 1, 'Classic still opens at full ink');
      assertEquals(first.calls[0].fill, '#000000', 'day Classic stays black');
      assertEquals(first.calls[0].x, GAME_CONFIG.CANVAS_W / 2, 'the word stays centered');
      assertEquals(first.calls[0].y, GAME_CONFIG.CANVAS_H / 2 - 30, 'the word stays in the jump band');
      assertEquals(first.framesAfter, GAME_CONFIG.MILESTONE_FRAMES - 1,
        'Classic still counts the shared wash timer down by one');

      const late = paintLabel(1);
      assertEquals(late.calls.length, 1, 'Classic still paints on the last wash frame');
      assertEquals(late.calls[0].font, CLASSIC_FONT, 'the last Classic frame is still 22px');
      assert(Math.abs(late.calls[0].alpha - 1 / GAME_CONFIG.MILESTONE_FRAMES) < 1e-12,
        'Classic alpha is still frames / MILESTONE_FRAMES');

      withTuning({
        UPDATED_MILESTONE_FONT_PX: 12,
        UPDATED_MILESTONE_PEAK_ALPHA: 0.2,
        UPDATED_MILESTONE_TEXT_FRAMES: 10,
      }, () => {
        const tuned = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(tuned.calls[0].font, CLASSIC_FONT, 'Classic does not read the Updated type size');
        assertEquals(tuned.calls[0].alpha, 1, 'Classic does not read the Updated peak');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      setQaLevel(false);
      ctx.globalAlpha = 1;
    }
  });

  it('Updated and Daily open quieter and leave before the wash ends', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      setQaNight(false);
      game.score = 40;
      game.milestoneText = 'LEVEL 3';
      assertEquals(GAME_CONFIG.UPDATED_MILESTONE_FONT_PX, 16,
        'the quiet word is 16px');
      assertEquals(GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES, 45,
        'the word lasts half of the 90-frame wash');
      assertEquals(GAME_CONFIG.UPDATED_MILESTONE_PEAK_ALPHA, 0.5,
        'the first frame is half the old ink');
      assert(GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES < GAME_CONFIG.MILESTONE_FRAMES,
        'the word is shorter than the gold wash');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls.length, 1, mode + ' still paints LEVEL on the first frame');
        assertEquals(first.calls[0].text, 'LEVEL 3', mode + ' still uses the level label');
        assertEquals(first.calls[0].font, "bold 16px 'Courier New', Courier, monospace",
          mode + ' uses the smaller type');
        assertEquals(first.calls[0].alpha, 0.5, mode + ' opens at the quiet peak');
        assertEquals(first.calls[0].fill, '#000000', mode + ' stays black by day');
        assertEquals(first.calls[0].x, GAME_CONFIG.CANVAS_W / 2, mode + ' stays centered');
        assertEquals(first.calls[0].y, GAME_CONFIG.CANVAS_H / 2 - 30, mode + ' stays in the jump band');
        assertEquals(first.framesAfter, GAME_CONFIG.MILESTONE_FRAMES - 1,
          mode + ' still counts the shared wash timer');

        const still = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES + 1);
        assertEquals(still.calls.length, 1, mode + ' still paints on the last quiet frame');
        assert(still.calls[0].alpha > 0 && still.calls[0].alpha < 0.5,
          mode + ' has already faded below the peak');

        const gone = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES);
        assertEquals(gone.calls.length, 0, mode + ' word is gone while the wash timer remains');
        assertEquals(gone.framesAfter, GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES - 1,
          mode + ' keeps counting the wash after the word leaves');
      }
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setQaNight(false);
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('keeps the gold wash on the full timer after the word has left', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      setQaNight(false);
      game.mode = MODES.UPDATED;
      game.score = 40;
      game.milestoneText = 'LEVEL 2';
      const left = GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES;
      Animations.milestoneFrames = left;
      const fills = [];
      const origFill = ctx.fillStyle;
      Object.defineProperty(ctx, 'fillStyle', {
        configurable: true,
        get() { return origFill; },
        set(v) { fills.push(v); },
      });
      drawSkyTint();
      delete ctx.fillStyle;
      const gold = fills.filter((s) => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0);
      assertEquals(gold.length, 1, 'the wash still paints after the word has left');
      const expected = ((left / GAME_CONFIG.MILESTONE_FRAMES) * GAME_CONFIG.SKY_TINT_PEAK_ALPHA).toFixed(3);
      assert(gold[0].indexOf(expected) !== -1, 'the wash still fades across all 90 frames');
      const word = paintLabel(left);
      assertEquals(word.calls.length, 0, 'that same frame does not bring the word back');
    } finally {
      delete ctx.fillStyle;
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('stays white once the sky is night, in Updated and in Classic', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      setQaNight(false);
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      game.milestoneText = 'LEVEL 5';
      game.mode = MODES.UPDATED;
      const updated = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(updated.calls[0].fill, '#ffffff', 'Updated night word stays white');
      assertEquals(updated.calls[0].alpha, GAME_CONFIG.UPDATED_MILESTONE_PEAK_ALPHA,
        'night uses the same quiet peak');
      game.mode = MODES.CLASSIC;
      const classic = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(classic.calls[0].fill, '#ffffff', 'Classic night word stays white');
      assertEquals(classic.calls[0].alpha, 1, 'Classic night ink is unchanged');
      assertEquals(classic.calls[0].font, CLASSIC_FONT, 'Classic night size is unchanged');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('reads a safe tune and ignores a tune that would slap or vanish', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 10;
      game.milestoneText = 'LEVEL 2';
      withTuning({
        UPDATED_MILESTONE_FONT_PX: 18,
        UPDATED_MILESTONE_PEAK_ALPHA: 0.4,
        UPDATED_MILESTONE_TEXT_FRAMES: 30,
      }, () => {
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls[0].font, "bold 18px 'Courier New', Courier, monospace",
          'a size inside 12..18 is used');
        assertEquals(first.calls[0].alpha, 0.4, 'a peak inside 0..1 is used');
        const edge = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 30);
        assertEquals(edge.calls.length, 0, 'a shorter tune ends the word at that frame count');
      });
      withTuning({
        UPDATED_MILESTONE_FONT_PX: 40,
        UPDATED_MILESTONE_PEAK_ALPHA: 2,
        UPDATED_MILESTONE_TEXT_FRAMES: 0,
      }, () => {
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls[0].font, "bold 16px 'Courier New', Courier, monospace",
          'a size above 18 falls back');
        assertEquals(first.calls[0].alpha, 0.5, 'a peak above 1 falls back');
        const still = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 45 + 1);
        assertEquals(still.calls.length, 1, 'a zero frame tune falls back to 45');
      });
      withTuning({ UPDATED_MILESTONE_TEXT_FRAMES: 200, UPDATED_MILESTONE_FONT_PX: 'big' }, () => {
        const gone = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 45);
        assertEquals(gone.calls.length, 0, 'a frame tune past the wash falls back to 45');
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls[0].font, "bold 16px 'Courier New', Courier, monospace",
          'a non-number size falls back');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('shortens the Updated word again under reduced motion without restoring Classic', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(true);
      game.score = 20;
      game.milestoneText = 'LEVEL 2';
      game.mode = MODES.CLASSIC;
      const classic = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(classic.calls[0].font, CLASSIC_FONT, 'reduced motion does not resize Classic');
      assertEquals(classic.calls[0].alpha, 1, 'reduced motion does not fade Classic');
      const classicLate = paintLabel(1);
      assertEquals(classicLate.calls.length, 1, 'Classic still lasts the full wash under reduced motion');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls[0].font, "bold 16px 'Courier New', Courier, monospace",
          mode + ' stays on the small type under reduced motion');
        assertEquals(first.calls[0].alpha, 0.5,
          mode + ' keeps the quiet peak so the word still reads');
        const half = Math.max(2, Math.round(GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES * 0.5));
        const gone = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - half);
        assertEquals(gone.calls.length, 0, mode + ' word ends at half the quiet length');
        assert(half < GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES,
          mode + ' reduced-motion word is shorter than the motion-allowed word');
        const still = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - half + 1);
        assertEquals(still.calls.length, 1, mode + ' still paints on the last reduced-motion frame');
      }
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armFreshRun() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = 10000;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    Animations.milestoneFrames = 0;
    game.qaLevelShown = false;
    game.qaLevelHold = 0;
  }

  it('?qaLevel=1 holds the quiet word for playtest and damps that hold under reduced motion', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaNight(false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      setQaLevel(true);
      const spy = spyText();
      try {
        tick();
        assertEquals(game.qaLevelHold, 180, 'the playtest hold starts at the full capture window');
        assertEquals(game.milestoneText, 'LEVEL 2', 'the hold uses the same early label');
        assertEquals(Animations.milestoneFrames, GAME_CONFIG.MILESTONE_FRAMES - 1,
          'the hold does not change the wash length');
        const live = levelCalls(spy.calls);
        assertEquals(live.length, 1, 'the first frame paints the live word once');
        assertEquals(live[0].alpha, 0.5, 'the live word, not a louder hold, is what shows first');

        spy.calls.length = 0;
        Animations.milestoneFrames = 0;
        game.qaLevelHold = 40;
        tick();
        const held = levelCalls(spy.calls);
        assertEquals(held.length, 1, 'the hold keeps LEVEL up after the live word has ended');
        assertEquals(held[0].font, "bold 16px 'Courier New', Courier, monospace",
          'the hold uses the quiet type');
        assertEquals(held[0].alpha, 0.5, 'motion allowed holds the quiet peak');
        assertEquals(game.score < GAME_CONFIG.SCORE_PER_LEVEL, true,
          'the hold must not jump the score to the real level');
      } finally {
        spy.restore();
      }

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaLevel(true);
      const classicSpy = spyText();
      try {
        tick();
        assertEquals(game.qaLevelHold, 0, 'Classic does not start the hold');
        assertEquals(levelCalls(classicSpy.calls).length, 0, 'Classic does not paint an early LEVEL');
      } finally {
        classicSpy.restore();
      }

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        setReducedMotion(true);
        armFreshRun();
        game.mode = mode;
        setQaLevel(true);
        const rmSpy = spyText();
        try {
          tick();
          assertEquals(game.qaLevelHold, 90, mode + ' reduced motion halves the 180-frame hold');
          rmSpy.calls.length = 0;
          Animations.milestoneFrames = 0;
          game.qaLevelHold = 20;
          tick();
          const held = levelCalls(rmSpy.calls);
          assertEquals(held.length, 1, mode + ' reduced motion still paints the held word');
          assertEquals(held[0].alpha, 0.25, mode + ' reduced motion holds half the quiet peak');
          assertEquals(held[0].font, "bold 16px 'Courier New', Courier, monospace",
            mode + ' reduced-motion hold stays on the small type');
        } finally {
          rmSpy.restore();
        }
      }
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaLevel(false);
      setQaNight(false);
      setReducedMotion(false);
      Animations.milestoneFrames = 0;
      game.qaLevelHold = 0;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quieter NEW BEST badge', () => {
  const CLASSIC_FONT = "bold 14px 'Courier New', Courier, monospace";
  const QUIET_FONT = "bold 11px 'Courier New', Courier, monospace";

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function spyText() {
    const calls = [];
    const origFillText = ctx.fillText;
    ctx.fillText = function (text, x, y) {
      calls.push({
        text: String(text),
        x: x,
        y: y,
        font: ctx.font,
        alpha: ctx.globalAlpha,
        fill: ctx.fillStyle,
      });
    };
    return {
      calls: calls,
      restore() { ctx.fillText = origFillText; },
    };
  }

  function badgeCalls(calls) {
    return calls.filter((c) => c.text === 'NEW BEST!');
  }

  function paintBadge(frames) {
    const spy = spyText();
    Animations.newBestFrames = frames;
    try {
      drawNewBestBadge();
      return { calls: badgeCalls(spy.calls), framesAfter: Animations.newBestFrames };
    } finally {
      spy.restore();
      ctx.globalAlpha = 1;
    }
  }

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armFreshRun() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.obstacles.length = 0;
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = 10000;
    game.score = 0;
    game.highScore = 50;
    game.newBestShown = false;
    Animations.newBestFrames = 0;
    Animations.milestoneFrames = 0;
    game.qaNewBestShown = false;
    game.qaNewBestHold = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    game.runSeed = 4242;
    game.rng = mulberry32(4242);
    initHills();
  }

  it('keeps the Classic badge at 14px gold for the full countdown', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setReducedMotion(false);
      setQaNewBest(false);
      game.qaNewBestHold = 0;
      game.mode = MODES.CLASSIC;
      Animations.milestoneFrames = 0;
      const first = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(first.calls.length, 1, 'Classic paints the badge on the first frame');
      assertEquals(first.calls[0].font, CLASSIC_FONT, 'Classic stays bold 14px');
      assertEquals(first.calls[0].alpha, 1, 'Classic still opens at full gold');
      assertEquals(first.calls[0].fill, '#ffd700', 'Classic stays gold');
      assertEquals(first.calls[0].text, 'NEW BEST!', 'Classic still says NEW BEST!');
      assertEquals(first.calls[0].x, GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET,
        'the badge stays under the score');
      assertEquals(first.calls[0].y, 70, 'the badge stays at the corner baseline');
      assertEquals(first.framesAfter, GAME_CONFIG.NEW_BEST_FRAMES - 1,
        'Classic still counts the shared timer down by one');

      const mid = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES / 2);
      assertEquals(mid.calls[0].alpha, 0.5, 'Classic alpha is still frames / NEW_BEST_FRAMES');
      assertEquals(mid.calls[0].font, CLASSIC_FONT, 'the mid Classic frame is still 14px');

      const last = paintBadge(1);
      assertEquals(last.calls.length, 1, 'Classic still paints on the last frame');
      assert(Math.abs(last.calls[0].alpha - 1 / GAME_CONFIG.NEW_BEST_FRAMES) < 1e-12,
        'the last Classic frame is still 1 / NEW_BEST_FRAMES');

      Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
      const dropped = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(dropped.calls[0].y, 100, 'Classic still drops 30px when a milestone is up');
      assertEquals(dropped.calls[0].y - 70, 30, 'the Classic stagger is still 30px');

      withTuning({
        UPDATED_NEW_BEST_FONT_PX: 10,
        UPDATED_NEW_BEST_PEAK_ALPHA: 0.2,
        UPDATED_NEW_BEST_FRAMES: 12,
      }, () => {
        Animations.milestoneFrames = 0;
        const tuned = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
        assertEquals(tuned.calls[0].font, CLASSIC_FONT, 'Classic does not read the Updated type size');
        assertEquals(tuned.calls[0].alpha, 1, 'Classic does not read the Updated peak');
        assertEquals(newBestDuration(), GAME_CONFIG.NEW_BEST_FRAMES,
          'Classic duration ignores the Updated frame tune');
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      Animations.milestoneFrames = 0;
      Animations.newBestFrames = 0;
      game.qaNewBestHold = 0;
      setReducedMotion(false);
      setQaNewBest(false);
      ctx.globalAlpha = 1;
    }
  });

  it('Updated and Daily open quieter and leave after the short countdown', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaNewBest(false);
      game.qaNewBestHold = 0;
      assertEquals(GAME_CONFIG.UPDATED_NEW_BEST_FONT_PX, 11, 'the quiet badge is 11px');
      assertEquals(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES, 60,
        'the badge lasts half of the 120-frame countdown');
      assertEquals(GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA, 0.65,
        'the first frame keeps the gold readable');
      assert(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES < GAME_CONFIG.NEW_BEST_FRAMES,
        'the badge is shorter than the Classic countdown');
      assert(GAME_CONFIG.UPDATED_NEW_BEST_FONT_PX < 14, 'the type is smaller than Classic');
      assert(GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA < 1, 'the peak is quieter than solid gold');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        Animations.milestoneFrames = 0;
        const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
        assertEquals(first.calls.length, 1, mode + ' still paints NEW BEST on the first frame');
        assertEquals(first.calls[0].text, 'NEW BEST!', mode + ' still celebrates');
        assertEquals(first.calls[0].font, QUIET_FONT, mode + ' uses the smaller type');
        assertEquals(first.calls[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' opens at the quiet peak');
        assertEquals(first.calls[0].fill, '#ffd700', mode + ' stays gold');
        assertEquals(first.calls[0].y, 70, mode + ' stays in the corner');
        assertEquals(first.framesAfter, GAME_CONFIG.UPDATED_NEW_BEST_FRAMES - 1,
          mode + ' counts its own shorter timer');

        const mid = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES / 2);
        assert(Math.abs(mid.calls[0].alpha - GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA * 0.5) < 1e-12,
          mode + ' fades from the quiet peak');
        assertEquals(mid.calls[0].font, QUIET_FONT, mode + ' stays on the small type while it fades');

        const last = paintBadge(1);
        assertEquals(last.calls.length, 1, mode + ' still paints on the last quiet frame');
        assert(last.calls[0].alpha > 0 && last.calls[0].alpha < GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' has faded below the peak by the last frame');

        const gone = paintBadge(0);
        assertEquals(gone.calls.length, 0, mode + ' badge is gone when the countdown ends');
        assertEquals(gone.framesAfter, 0, mode + ' does not keep a leftover timer');

        Animations.milestoneFrames = 10;
        const dropped = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
        assertEquals(dropped.calls[0].y, 100, mode + ' still drops when a milestone is up');
      }
    } finally {
      game.mode = origMode;
      Animations.milestoneFrames = 0;
      Animations.newBestFrames = 0;
      game.qaNewBestHold = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('reads a safe tune and ignores a tune that would restore the old badge', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      game.qaNewBestHold = 0;
      game.mode = MODES.UPDATED;
      Animations.milestoneFrames = 0;
      withTuning({
        UPDATED_NEW_BEST_FONT_PX: 13,
        UPDATED_NEW_BEST_PEAK_ALPHA: 0.4,
        UPDATED_NEW_BEST_FRAMES: 24,
      }, () => {
        assertEquals(newBestDuration(), 24, 'a frame tune inside 1..120 is the countdown');
        const first = paintBadge(24);
        assertEquals(first.calls[0].font, "bold 13px 'Courier New', Courier, monospace",
          'a size inside 10..13 is used');
        assertEquals(first.calls[0].alpha, 0.4, 'a peak inside 0..1 is used');
        assertEquals(first.calls[0].fill, '#ffd700', 'a tune does not recolor the gold');
      });
      withTuning({
        UPDATED_NEW_BEST_FONT_PX: 14,
        UPDATED_NEW_BEST_PEAK_ALPHA: 2,
        UPDATED_NEW_BEST_FRAMES: 0,
      }, () => {
        assertEquals(newBestDuration(), GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          'a zero frame tune falls back to 60');
        const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
        assertEquals(first.calls[0].font, QUIET_FONT, '14px is outside 10..13 and falls back');
        assertEquals(first.calls[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          'a peak above 1 falls back');
      });
      withTuning({
        UPDATED_NEW_BEST_FRAMES: 500,
        UPDATED_NEW_BEST_FONT_PX: 'big',
        UPDATED_NEW_BEST_PEAK_ALPHA: -0.2,
      }, () => {
        assertEquals(newBestDuration(), GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          'a frame tune past the Classic countdown falls back');
        const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
        assertEquals(first.calls[0].font, QUIET_FONT, 'a non-number size falls back');
        assertEquals(first.calls[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          'a negative peak falls back');
      });
    } finally {
      game.mode = origMode;
      Animations.newBestFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('shortens the Updated badge again under reduced motion without restoring Classic', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(true);
      game.qaNewBestHold = 0;
      game.mode = MODES.CLASSIC;
      Animations.milestoneFrames = 0;
      assertEquals(newBestDuration(), GAME_CONFIG.NEW_BEST_FRAMES,
        'reduced motion does not shorten Classic');
      const classic = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(classic.calls[0].font, CLASSIC_FONT, 'reduced motion does not resize Classic');
      assertEquals(classic.calls[0].alpha, 1, 'reduced motion does not fade Classic');
      assertEquals(classic.calls[0].fill, '#ffd700', 'reduced motion does not recolor Classic');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const half = Math.max(2, Math.round(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES * 0.5));
        assertEquals(newBestDuration(), half, mode + ' reduced motion halves the quiet countdown');
        assert(half < GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          mode + ' reduced-motion badge is shorter than the motion-allowed badge');
        const first = paintBadge(half);
        assertEquals(first.calls[0].font, QUIET_FONT,
          mode + ' stays on the small type under reduced motion');
        assertEquals(first.calls[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' keeps the quiet peak so the gold still reads');
        assertEquals(first.calls[0].fill, '#ffd700', mode + ' stays gold under reduced motion');
        const last = paintBadge(1);
        assertEquals(last.calls.length, 1, mode + ' still paints on the last reduced-motion frame');
      }
    } finally {
      game.mode = origMode;
      Animations.newBestFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('arms the mode countdown when the run first beats the stored high score', () => {
    const origMode = game.mode;
    const origText = a11yLive.textContent;
    try {
      setReducedMotion(false);
      setQaNewBest(false);
      for (const mode of [MODES.UPDATED, MODES.DAILY, MODES.CLASSIC]) {
        armFreshRun();
        game.mode = mode;
        game.highScore = 1;
        game.score = 2;
        const gapBefore = game.nextSpawnGap;
        const seedBefore = game.runSeed;
        const rngBefore = game.rng;
        let rngCalls = 0;
        game.rng = () => { rngCalls++; return rngBefore(); };
        const spy = spyText();
        try {
          tick();
          const expected = mode === MODES.CLASSIC
            ? GAME_CONFIG.NEW_BEST_FRAMES
            : GAME_CONFIG.UPDATED_NEW_BEST_FRAMES;
          assertEquals(game.newBestShown, true, mode + ' still latches the once-per-run badge');
          assertEquals(Animations.newBestFrames, expected - 1,
            mode + ' starts the mode countdown and paints the first frame');
          assertEquals(a11yLive.textContent, 'New best score!', mode + ' still announces the new best');
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' paints the badge once on the beat frame');
          assertEquals(painted[0].fill, '#ffd700', mode + ' beat frame stays gold');
          if (mode === MODES.CLASSIC) {
            assertEquals(painted[0].font, CLASSIC_FONT, 'the beat frame stays 14px in Classic');
            assertEquals(painted[0].alpha, 1, 'the beat frame stays full gold in Classic');
          } else {
            assertEquals(painted[0].font, QUIET_FONT, mode + ' beat frame uses the quiet type');
            assertEquals(painted[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
              mode + ' beat frame uses the quiet peak');
          }
          assertEquals(game.highScore, 1, mode + ' badge does not write the stored high score');
          assertEquals(game.score, 2 + GAME_CONFIG.SCORE_INCREMENT,
            mode + ' score still advances by the normal increment');
          assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
            mode + ' speed still follows the score');
          assertEquals(game.nextSpawnGap, gapBefore, mode + ' does not change the spawn gap');
          assertEquals(game.runSeed, seedBefore, mode + ' does not change the run seed');
          assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
            mode + ' speed on the next read still follows the score');
          const again = rngCalls;
          tick();
          assertEquals(Animations.newBestFrames, expected - 2, mode + ' keeps counting down');
          assert(rngCalls >= again, mode + ' later frames do not rewind gameplay rng');
        } finally {
          spy.restore();
          game.rng = rngBefore;
        }
      }
    } finally {
      game.mode = origMode;
      a11yLive.textContent = origText;
      setQaNewBest(false);
      setReducedMotion(false);
      Animations.newBestFrames = 0;
      game.newBestShown = false;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNewBest=1 holds the quiet badge after GET READY without touching the run', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaNewBest(false);
      assert(readQaNewBestFlag('?qaNewBest=1') === true, '?qaNewBest=1 should hold the badge');
      assert(readQaNewBestFlag('?qaLevel=1&qaNewBest=1') === true, 'the flag should work beside other params');
      assert(readQaNewBestFlag('?qaNewBest=1&qaScorePop=1') === true, 'param order should not matter');
      assert(readQaNewBestFlag('?qaNewBest=0') === false, 'only the value 1 enables the flag');
      assert(readQaNewBestFlag('?qaNewBest=12') === false, 'qaNewBest=12 must not count as the flag');
      assert(readQaNewBestFlag('?qaLevel=1') === false, 'the level flag must not hold this badge');
      assert(readQaNewBestFlag('?qaScorePop=1') === false, 'the score-pop flag must not hold this badge');
      assert(readQaLevelFlag('?qaNewBest=1') === false, 'this flag must not fire the level wash');
      assert(readQaScorePopFlag('?qaNewBest=1') === false, 'this flag must not swell the score');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun();
        game.mode = mode;
        setQaNewBest(true);
        const seed = game.runSeed;
        const gap = game.nextSpawnGap;
        const high = game.highScore;
        const rngBefore = game.rng;
        let rngCalls = 0;
        game.rng = () => { rngCalls++; return rngBefore(); };
        const spy = spyText();
        try {
          tick();
          assertEquals(game.qaNewBestHold, QA_NEW_BEST_HOLD, mode + ' latches the full capture window');
          assertEquals(game.qaNewBestShown, true, mode + ' spends the latch once');
          assertEquals(game.newBestShown, false, mode + ' hold does not spend the real badge');
          assertEquals(Animations.newBestFrames, 0, mode + ' hold does not start the live countdown');
          assertEquals(a11yLive.textContent.indexOf('New best score!') === -1, true,
            mode + ' hold does not announce a new best');
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' paints the held badge once');
          assertEquals(painted[0].font, QUIET_FONT, mode + ' hold uses the quiet type');
          assertEquals(painted[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            mode + ' hold uses the quiet peak');
          assertEquals(painted[0].fill, '#ffd700', mode + ' hold stays gold');
          assertEquals(painted[0].y, 70, mode + ' hold stays in the corner');
          assertEquals(game.highScore, high, mode + ' hold does not write the high score');
          assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, mode + ' score still starts from zero');
          assertEquals(game.nextSpawnGap, gap, mode + ' hold does not change the spawn gap');
          assertEquals(game.runSeed, seed, mode + ' hold does not change the run seed');
          assertEquals(game.currentSpeed, DifficultyProfile.speedAtScore(game.score),
            mode + ' speed still follows the score');
          const afterFirst = rngCalls;
          spy.calls.length = 0;
          tick();
          assertEquals(game.qaNewBestHold, QA_NEW_BEST_HOLD - 1, mode + ' hold counts down while running');
          assertEquals(badgeCalls(spy.calls).length, 1, mode + ' hold keeps painting');
          assertEquals(rngCalls, afterFirst, mode + ' the hold frame does not draw gameplay rng');
        } finally {
          spy.restore();
          game.rng = rngBefore;
        }
      }

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaNewBest(true);
      const classicSpy = spyText();
      try {
        tick();
        tick();
        assertEquals(game.qaNewBestHold, 0, 'Classic does not start the hold');
        assertEquals(game.qaNewBestShown, false, 'Classic does not spend the Updated latch');
        assertEquals(badgeCalls(classicSpy.calls).length, 0, 'Classic does not paint an early NEW BEST');
        assertEquals(Animations.newBestFrames, 0, 'Classic hold does not start the live countdown');
      } finally {
        classicSpy.restore();
      }
    } finally {
      game.mode = origMode;
      setQaNewBest(false);
      setReducedMotion(false);
      game.qaNewBestHold = 0;
      game.qaNewBestShown = false;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('skips the live badge while the hold is up so the two golds do not stack', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.qaNewBestShown = true;
      game.qaNewBestHold = 40;
      Animations.newBestFrames = GAME_CONFIG.UPDATED_NEW_BEST_FRAMES;
      Animations.milestoneFrames = 0;
      const spy = spyText();
      try {
        drawNewBestBadge();
        drawQaNewBest();
        const painted = badgeCalls(spy.calls);
        assertEquals(painted.length, 1, 'only the hold paints while both timers are up');
        assertEquals(painted[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          'the visible badge is the quiet hold, not a second full-gold copy');
        assertEquals(painted[0].font, QUIET_FONT, 'the stacked frame stays on the quiet type');
        assertEquals(Animations.newBestFrames, GAME_CONFIG.UPDATED_NEW_BEST_FRAMES - 1,
          'the live countdown still runs under the hold');
        assertEquals(game.qaNewBestHold, 40, 'drawing does not spend the hold');
      } finally {
        spy.restore();
      }
    } finally {
      game.mode = origMode;
      game.qaNewBestHold = 0;
      game.qaNewBestShown = false;
      Animations.newBestFrames = 0;
      setReducedMotion(false);
      ctx.globalAlpha = 1;
    }
  });

  it('reduced motion shortens and damps the hold, and still paints it', () => {
    const origMode = game.mode;
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun();
        game.mode = mode;
        setReducedMotion(true);
        setQaNewBest(true);
        const spy = spyText();
        try {
          tick();
          assertEquals(game.qaNewBestHold, qaNewBestHoldFrames(),
            mode + ' hold uses the shorter window');
          assertEquals(game.qaNewBestHold, 90, mode + ' reduced motion halves the 180-frame hold');
          assert(game.qaNewBestHold < QA_NEW_BEST_HOLD,
            mode + ' hold is shorter than the full capture');
          assert(qaNewBestHoldFrames() >= 2, mode + ' hold still lasts long enough to see');
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' reduced motion still paints the badge');
          assertEquals(painted[0].alpha, qaNewBestPaintAlpha(),
            mode + ' reduced motion holds the damped peak');
          assert(painted[0].alpha < GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            mode + ' damped hold is softer than the motion-allowed peak');
          assert(painted[0].alpha > 0, mode + ' damped hold still reads');
          assertEquals(painted[0].font, QUIET_FONT, mode + ' damped hold stays on the small type');
          assertEquals(painted[0].fill, '#ffd700', mode + ' damped hold stays gold');
          assertEquals(game.newBestShown, false, mode + ' damped hold does not spend the real badge');
          assertEquals(Animations.newBestFrames, 0, mode + ' damped hold does not arm the live countdown');
          assert(game.score < 1, mode + ' damped hold must not write the score');
        } finally {
          spy.restore();
        }
      }
    } finally {
      game.mode = origMode;
      setQaNewBest(false);
      setReducedMotion(false);
      game.qaNewBestHold = 0;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaNewBest=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyText();
    global.location = { search: '?qaNewBest=1' };
    try {
      setQaNewBest(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      game.highScore = 40;
      game.newBestShown = false;
      Animations.newBestFrames = 0;
      tick();
      assertEquals(badgeCalls(spy.calls).length, 1, 're-read flag paints the quiet badge');
      assertEquals(badgeCalls(spy.calls)[0].font, QUIET_FONT, 're-read flag uses the quiet type');
      assertEquals(badgeCalls(spy.calls)[0].alpha, GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
        're-read flag uses the quiet peak');
      assertEquals(game.qaNewBestHold, QA_NEW_BEST_HOLD, 'the re-read flag latches the hold');
      assertEquals(game.qaNewBestShown, true, 'the re-read flag spends the latch');
      assertEquals(game.newBestShown, false, 'the re-read flag does not spend the real badge');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.highScore, 40, 're-reading the flag must not change the high score');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      setQaNewBest(false);
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the hold after a collision return', () => {
    const origMode = game.mode;
    const spy = spyText();
    try {
      armFreshRun();
      game.mode = MODES.UPDATED;
      setQaNewBest(true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      assertEquals(badgeCalls(spy.calls).length, 1, 'the hold still paints after the collision return');
      assertEquals(badgeCalls(spy.calls)[0].font, QUIET_FONT, 'the death-frame hold stays quiet');
      assertEquals(game.newBestShown, false, 'dying on the QA frame does not latch a real new best');
      assertEquals(Animations.newBestFrames, 0, 'dying on the QA frame does not start the live countdown');
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaNewBest(false);
      game.obstacles.length = 0;
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Quieter copy flash', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
  }

  function installClassList(el) {
    const names = new Set();
    el.classList = {
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      contains(name) { return names.has(name); },
    };
    return el.classList;
  }

  it('the Copied confirmation is about half the old 90-frame flash', () => {
    assertEquals(GAME_CONFIG.COPY_FLASH_FRAMES, 45,
      'copy flash should be 45 frames, about 0.75s');
    assert(GAME_CONFIG.COPY_FLASH_FRAMES < 90,
      'the confirmation should be shorter than the old 1.5s flash');
    assertEquals(copyFlashDuration(), GAME_CONFIG.COPY_FLASH_FRAMES,
      'the handler duration should read the named config');
  });

  it('a tune outside 1..90 frames falls back to the quiet length', () => {
    withTuning({ COPY_FLASH_FRAMES: 30 }, () => {
      assertEquals(copyFlashDuration(), 30, 'a readable tune should apply');
    });
    withTuning({ COPY_FLASH_FRAMES: 0 }, () => {
      assertEquals(copyFlashDuration(), GAME_CONFIG.COPY_FLASH_FRAMES,
        'zero would flicker, so it falls back');
    });
    withTuning({ COPY_FLASH_FRAMES: 200 }, () => {
      assertEquals(copyFlashDuration(), GAME_CONFIG.COPY_FLASH_FRAMES,
        'a longer tune would nag past the old flash');
    });
    withTuning({}, () => {
      assertEquals(copyFlashDuration(), GAME_CONFIG.COPY_FLASH_FRAMES,
        'no tune keeps the quiet default');
    });
  });

  it('starts the shorter Copied flash before the clipboard write', () => {
    const shareBtn = document.getElementById('share-btn');
    const handler = shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    assert(typeof handler === 'function', 'share button must register a click handler');
    const origDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origClass = shareBtn.classList;
    const classes = installClassList(shareBtn);
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = false;
    let flashAtWrite = -1;
    let labelAtWrite = '';
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: {
          writeText() {
            wrote = true;
            flashAtWrite = Animations.copyFlashFrames;
            labelAtWrite = shareBtn.textContent;
            return Promise.resolve();
          },
        },
      },
    });
    try {
      handler({ stopPropagation() {} });
      assert(wrote, 'the clipboard write should still run');
      assertEquals(flashAtWrite, GAME_CONFIG.COPY_FLASH_FRAMES,
        'the flash counter is set before writeText');
      assertEquals(labelAtWrite, '✓ Copied!', 'the Copied label is set before writeText');
      assertEquals(Animations.copyFlashFrames, GAME_CONFIG.COPY_FLASH_FRAMES,
        'the live counter stays on the quiet length');
      assert(classes.contains('is-copied'), 'the Copied state uses the calmer button class');
      assert(!classes.contains('is-qa-damped'), 'a real tap is not the reduced-motion QA hold');
    } finally {
      if (origDesc) Object.defineProperty(global, 'navigator', origDesc);
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      if (origClass === undefined) delete shareBtn.classList;
      else shareBtn.classList = origClass;
    }
  });
});

describe('QA copy flag (?qaCopy=1)', () => {
  function tick() {
    gameLoop();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  }

  function installClassList(el) {
    const names = new Set();
    el.classList = {
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      contains(name) { return names.has(name); },
    };
    return el.classList;
  }

  function buttonSnapshot() {
    const shareBtn = document.getElementById('share-btn');
    return {
      style: shareBtn.style,
      text: shareBtn.textContent,
      classList: shareBtn.classList,
    };
  }

  function prepareButton() {
    const shareBtn = document.getElementById('share-btn');
    shareBtn.style = { display: 'none' };
    shareBtn.textContent = '📋 Copy result';
    installClassList(shareBtn);
    return shareBtn;
  }

  function restoreButton(orig) {
    const shareBtn = document.getElementById('share-btn');
    if (orig.style === undefined) delete shareBtn.style;
    else shareBtn.style = orig.style;
    shareBtn.textContent = orig.text;
    if (orig.classList === undefined) delete shareBtn.classList;
    else shareBtn.classList = orig.classList;
  }

  function aliveLives() {
    return Particles.particles.filter((p) => p.life > 0).length;
  }

  function armDailyWaiting() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.mode = MODES.DAILY;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    if (typeof setQaCopy === 'function') setQaCopy(true);
    return prepareButton();
  }

  it('?qaCopy=1 is Daily-only and off for any other value', () => {
    assert(readQaCopyFlag('?qaCopy=1') === true, '?qaCopy=1 should hold Copied');
    assert(readQaCopyFlag('?qaNight=1&qaCopy=1') === true, 'the flag should work beside other params');
    assert(readQaCopyFlag('?qaCopy=1&qaNewBest=1') === true, 'param order should not matter');
    assert(readQaCopyFlag('?qaCopy=0') === false, 'only the value 1 enables the flag');
    assert(readQaCopyFlag('?qaCopy=12') === false, 'qaCopy=12 must not count as the flag');
    assert(readQaCopyFlag('') === false, 'an empty query leaves the flag off');
    assert(readQaCopyFlag('?qaNewBest=1') === false, 'the badge flag must not hold Copied');
    assert(readQaNewBestFlag('?qaCopy=1') === false, 'this flag must not hold the badge');
    assert(readQaFlashFlag('?qaCopy=1') === false, 'this flag must not flash the death blink');
    assert(readQaCollisionFlag('?qaCopy=1') === false, 'this flag must not hold the death puff');
  });

  it('holds Copied on a Daily waiting screen without a death or a clipboard write', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    const origRng = game.rng;
    try {
      setReducedMotion(false);
      const shareBtn = armDailyWaiting();
      const seed = game.runSeed;
      const gap = game.nextSpawnGap;
      const score = game.score;
      const speed = game.currentSpeed;
      const best = game.dailyBest;
      const lives = aliveLives();
      const obstacles = game.obstacles.length;
      let rngCalls = 0;
      game.rng = () => {
        rngCalls++;
        return origRng();
      };
      tick();
      assertEquals(game.state, STATE.WAITING, 'the hold starts before the run');
      assertEquals(game.qaCopyHold, QA_COPY_HOLD, 'Daily latches the full capture window');
      assertEquals(qaCopyHoldFrames(), QA_COPY_HOLD, 'the helper matches the full window');
      assertEquals(game.qaCopyShown, true, 'Daily spends the latch once');
      assertEquals(Animations.copyFlashFrames, 0, 'the hold does not start the live flash');
      assertEquals(shareBtn.style.display, 'block', 'Copied stays visible before Game Over');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the button reads Copied');
      assert(shareBtn.classList.contains('is-copied'), 'the hold uses the calmer Copied paint');
      assert(!shareBtn.classList.contains('is-qa-damped'), 'full motion does not damp the paint');
      assertEquals(game.score, score, 'the hold does not change the score');
      assertEquals(game.currentSpeed, speed, 'the hold does not change the speed');
      assertEquals(game.dailyBest, best, 'the hold does not change today best');
      assertEquals(game.nextSpawnGap, gap, 'the hold does not change the spawn gap');
      assertEquals(game.runSeed, seed, 'the hold does not change the run seed');
      assertEquals(game.obstacles.length, obstacles, 'the hold does not spawn obstacles');
      assertEquals(rngCalls, 0, 'the hold does not draw gameplay rng');
      assertEquals(aliveLives(), lives, 'the hold does not emit particles');
      tick();
      assertEquals(game.qaCopyHold, QA_COPY_HOLD - 1, 'the hold counts down while waiting');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the label stays Copied while the hold runs');
      assertEquals(rngCalls, 0, 'later waiting frames still skip gameplay rng');
      assertEquals(aliveLives(), lives, 'later waiting frames still skip particles');
    } finally {
      game.mode = origMode;
      game.rng = origRng;
      if (typeof setQaCopy === 'function') setQaCopy(false);
      setReducedMotion(false);
      game.qaCopyHold = 0;
      game.qaCopyShown = false;
      Animations.copyFlashFrames = 0;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic and Updated leave the share button hidden', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    try {
      setReducedMotion(false);
      for (const mode of [MODES.CLASSIC, MODES.UPDATED]) {
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        game.mode = mode;
        resetGame();
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        if (typeof setQaCopy === 'function') setQaCopy(true);
        const shareBtn = prepareButton();
        tick();
        assertEquals(game.qaCopyHold, 0, mode + ' does not start the hold');
        assertEquals(game.qaCopyShown, false, mode + ' does not spend the latch');
        assertEquals(Animations.copyFlashFrames, 0, mode + ' does not start the live flash');
        assertEquals(shareBtn.style.display, 'none', mode + ' does not show Copied');
        assertEquals(shareBtn.textContent, '📋 Copy result', mode + ' keeps the resting label');
        assert(!shareBtn.classList.contains('is-copied'), mode + ' does not paint Copied');
      }
    } finally {
      game.mode = origMode;
      if (typeof setQaCopy === 'function') setQaCopy(false);
      setReducedMotion(false);
      game.qaCopyHold = 0;
      game.qaCopyShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion halves the hold and damps the Copied paint', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    try {
      setReducedMotion(true);
      const shareBtn = armDailyWaiting();
      tick();
      const half = Math.max(2, Math.round(QA_COPY_HOLD * 0.5));
      assertEquals(game.qaCopyHold, half, 'reduced motion halves the 180-frame hold');
      assertEquals(game.qaCopyHold, qaCopyHoldFrames(), 'the helper matches the damped hold');
      assert(game.qaCopyHold < QA_COPY_HOLD, 'the damped hold is shorter');
      assert(qaCopyHoldFrames() >= 2, 'the hold still lasts long enough to see');
      assertEquals(shareBtn.style.display, 'block', 'the damped hold stays visible');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the label still says Copied');
      assert(shareBtn.classList.contains('is-copied'), 'Copied is still readable');
      assert(shareBtn.classList.contains('is-qa-damped'), 'reduced motion quiets the paint');
      assertEquals(Animations.copyFlashFrames, 0, 'the damped hold does not start the live flash');
    } finally {
      game.mode = origMode;
      if (typeof setQaCopy === 'function') setQaCopy(false);
      setReducedMotion(false);
      game.qaCopyHold = 0;
      game.qaCopyShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('keeps Copied visible during the Game Over count-up', () => {
    const origMode = game.mode;
    const origState = game.state;
    const origBtn = buttonSnapshot();
    const origAnim = Animations.deathAnimFrame;
    const origShake = Animations.deathShakeFrames;
    try {
      setReducedMotion(false);
      const shareBtn = armDailyWaiting();
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = 0;
      Animations.deathAnimFrame = 0;
      shareBtn.style.display = 'none';
      shareBtn.textContent = '📋 Copy result';
      tick();
      assert(Animations.deathAnimFrame > 0, 'the count-up still advances');
      assert(Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES,
        'the count-up has not finished');
      assertEquals(shareBtn.style.display, 'block',
        'QA keeps the button up before the count-up ends');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the early button still says Copied');
      assertEquals(game.score, 0, 'showing the button does not invent a score');
    } finally {
      game.mode = origMode;
      game.state = origState;
      Animations.deathAnimFrame = origAnim;
      Animations.deathShakeFrames = origShake;
      if (typeof setQaCopy === 'function') setQaCopy(false);
      setReducedMotion(false);
      game.qaCopyHold = 0;
      game.qaCopyShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCopy=1 from the page query', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    try {
      setReducedMotion(false);
      global.location = { search: '' };
      if (typeof setQaCopy === 'function') setQaCopy(true);
      game.qaCopyShown = true;
      game.qaCopyHold = 40;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.DAILY;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.qaCopyHold, 0, 'a visit without the flag clears the hold');
      assertEquals(game.qaCopyShown, false, 'a visit without the flag clears the latch');

      global.location = { search: '?qaCopy=1' };
      if (typeof setQaCopy === 'function') setQaCopy(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      const shareBtn = prepareButton();
      const score = game.score;
      tick();
      assertEquals(game.state, STATE.WAITING, 'the re-read flag holds Copied before the run');
      assertEquals(game.qaCopyHold, QA_COPY_HOLD, 'the re-read flag latches the hold');
      assertEquals(game.qaCopyShown, true, 'the re-read flag spends the latch');
      assertEquals(shareBtn.style.display, 'block', 'the re-read flag shows Copied');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the re-read flag labels Copied');
      assertEquals(game.score, score, 're-reading the flag must not change the score');
      assertEquals(Animations.copyFlashFrames, 0, 're-reading the flag does not start the live flash');
    } finally {
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      if (typeof setQaCopy === 'function') setQaCopy(false);
      setReducedMotion(false);
      game.qaCopyHold = 0;
      game.qaCopyShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Soft death score count-up', () => {
  const QUIET_FRAMES = 18;

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function armDead(mode, score) {
    game.mode = mode;
    game.state = STATE.DEAD;
    game.score = score;
    game.isNewBest = true;
    game.previousHighScore = 0;
    game.isNewTodayBest = true;
    game.previousDailyBest = 0;
    Animations.deathShakeFrames = 0;
    Animations.deathFlashFrames = 0;
    Animations.scorePopFrames = 0;
    Animations.copyFlashFrames = 0;
    Animations.deathAnimFrame = 0;
  }

  function rollCountUp(maxSteps) {
    const scores = [];
    const origFill = ctx.fillText;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => { rngCalls++; return 0; };
    ctx.fillText = (text) => {
      const s = String(text);
      if (/^\d{5}$/.test(s)) scores.push(s);
    };
    let steps = 0;
    try {
      const limit = maxSteps === undefined ? 40 : maxSteps;
      for (let i = 0; i < limit; i++) {
        const before = Animations.deathAnimFrame;
        STATE_HANDLERS[STATE.DEAD]();
        if (Animations.deathAnimFrame === before) break;
        steps++;
      }
      return { steps: steps, frame: Animations.deathAnimFrame, scores: scores, rngCalls: rngCalls };
    } finally {
      ctx.fillText = origFill;
      game.rng = origRng;
    }
  }

  it('finishes Updated and Daily at 18 frames and leaves Classic at 30', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      speed: game.currentSpeed,
      hs: game.highScore,
      daily: game.dailyBest,
      newBest: game.isNewBest,
      prev: game.previousHighScore,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
      shake: Animations.deathShakeFrames,
      flash: Animations.deathFlashFrames,
      pop: Animations.scorePopFrames,
      copy: Animations.copyFlashFrames,
    };
    const storedDaily = localStorage.getItem('dino-daily-best');
    try {
      setReducedMotion(false);
      game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
      game.highScore = 900;
      game.dailyBest = 400;

      armDead(MODES.UPDATED, 500);
      const updated = rollCountUp();
      assertEquals(updated.steps, QUIET_FRAMES, 'Updated count-up advances 18 frames');
      assertEquals(updated.frame, QUIET_FRAMES, 'Updated stops on frame 18');
      assertEquals(updated.scores[QUIET_FRAMES - 1], '00500',
        'Updated frame 18 draws the full score');
      assertEquals(updated.rngCalls, 0, 'the count-up does not consume the run seed');
      assertEquals(game.score, 500, 'the count-up does not change the score');
      assertEquals(game.currentSpeed, GAME_CONFIG.INITIAL_SPEED, 'the count-up does not change speed');
      assertEquals(game.highScore, 900, 'the count-up does not change the high score');
      assertEquals(game.dailyBest, 400, 'the count-up does not change daily best');
      assertEquals(localStorage.getItem('dino-daily-best'), storedDaily,
        'the count-up does not write daily best');

      armDead(MODES.DAILY, 500);
      const daily = rollCountUp();
      assertEquals(daily.steps, QUIET_FRAMES, 'Daily uses the same shorter roll');
      assertEquals(daily.scores[QUIET_FRAMES - 1], '00500', 'Daily frame 18 draws the full score');

      armDead(MODES.CLASSIC, 500);
      const classic = rollCountUp();
      assertEquals(classic.steps, GAME_CONFIG.DEATH_ANIM_FRAMES, 'Classic still rolls for 30 frames');
      assertEquals(classic.scores[QUIET_FRAMES - 1], '00300',
        'Classic frame 18 is still sixty percent of the score');
      assertEquals(classic.scores[GAME_CONFIG.DEATH_ANIM_FRAMES - 1], '00500',
        'Classic frame 30 draws the full score');

      setReducedMotion(true);
      armDead(MODES.UPDATED, 500);
      const halved = rollCountUp();
      assertEquals(halved.steps, 9, 'reduced motion halves the Updated roll');
      assertEquals(halved.scores[8], '00500', 'the halved roll still reaches the full score');
      armDead(MODES.DAILY, 500);
      assertEquals(rollCountUp().steps, 9, 'reduced motion halves the Daily roll');
      armDead(MODES.CLASSIC, 500);
      assertEquals(rollCountUp().steps, GAME_CONFIG.DEATH_ANIM_FRAMES,
        'reduced motion leaves the Classic roll at 30');
    } finally {
      game.mode = orig.mode;
      game.state = orig.state;
      game.score = orig.score;
      game.currentSpeed = orig.speed;
      game.highScore = orig.hs;
      game.dailyBest = orig.daily;
      game.isNewBest = orig.newBest;
      game.previousHighScore = orig.prev;
      game.isNewTodayBest = orig.newToday;
      game.previousDailyBest = orig.prevDaily;
      Animations.deathAnimFrame = orig.anim;
      Animations.deathShakeFrames = orig.shake;
      Animations.deathFlashFrames = orig.flash;
      Animations.scorePopFrames = orig.pop;
      Animations.copyFlashFrames = orig.copy;
      setReducedMotion(false);
    }
  });

  it('opens the Daily hint and Copy result when the shorter roll finishes', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      daily: game.dailyBest,
      newToday: game.isNewTodayBest,
      prevDaily: game.previousDailyBest,
      anim: Animations.deathAnimFrame,
      shake: Animations.deathShakeFrames,
    };
    const shareBtn = document.getElementById('share-btn');
    const origStyle = shareBtn.style;
    const origText = shareBtn.textContent;
    const origFill = ctx.fillText;
    shareBtn.style = { display: 'none' };
    shareBtn.textContent = '📋 Copy result';
    try {
      setReducedMotion(false);
      game.mode = MODES.DAILY;
      game.state = STATE.DEAD;
      game.score = 120;
      game.dailyBest = 500;
      game.isNewTodayBest = false;
      game.previousDailyBest = 0;
      Animations.deathShakeFrames = 0;

      Animations.deathAnimFrame = 17;
      const early = [];
      ctx.fillText = (text) => early.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(!early.includes('Share TODAY BEST with Copy result'),
        'the hint waits until the shorter roll finishes');
      assertEquals(shareBtn.style.display, 'none',
        'Copy result stays hidden until the shorter roll finishes');

      Animations.deathAnimFrame = 18;
      const settled = [];
      ctx.fillText = (text) => settled.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(settled.includes('Share TODAY BEST with Copy result'),
        'the hint appears on the Updated/Daily frame 18');
      assertEquals(shareBtn.style.display, 'block',
        'Copy result appears with the hint');
      assertEquals(shareBtn.textContent, '📋 Copy result',
        'the share label stays Copy result');

      game.mode = MODES.UPDATED;
      shareBtn.style.display = 'block';
      const updated = [];
      ctx.fillText = (text) => updated.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(!updated.includes('Share TODAY BEST with Copy result'),
        'Updated free play still does not draw the Daily hint');

      setReducedMotion(true);
      game.mode = MODES.DAILY;
      Animations.deathAnimFrame = 8;
      shareBtn.style.display = 'block';
      drawGameOverScreen();
      assertEquals(shareBtn.style.display, 'none',
        'reduced motion keeps Copy result hidden until the halved roll finishes');
      Animations.deathAnimFrame = 9;
      const damped = [];
      ctx.fillText = (text) => damped.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(damped.includes('Share TODAY BEST with Copy result'),
        'reduced motion shows the hint once the halved roll finishes');
      assertEquals(shareBtn.style.display, 'block',
        'reduced motion shows Copy result with that hint');
    } finally {
      ctx.fillText = origFill;
      game.mode = orig.mode;
      game.state = orig.state;
      game.score = orig.score;
      game.dailyBest = orig.daily;
      game.isNewTodayBest = orig.newToday;
      game.previousDailyBest = orig.prevDaily;
      Animations.deathAnimFrame = orig.anim;
      Animations.deathShakeFrames = orig.shake;
      if (origStyle === undefined) delete shareBtn.style;
      else shareBtn.style = origStyle;
      shareBtn.textContent = origText;
      setReducedMotion(false);
    }
  });

  it('space finishes the shorter roll, and Classic still snaps to 30', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      anim: Animations.deathAnimFrame,
    };
    try {
      setReducedMotion(false);
      game.mode = MODES.CLASSIC;
      game.state = STATE.DEAD;
      game.score = 500;
      Animations.deathAnimFrame = 18;
      handleAction();
      assertEquals(game.state, STATE.DEAD, 'Classic frame 18 is still rolling');
      assertEquals(Animations.deathAnimFrame, GAME_CONFIG.DEATH_ANIM_FRAMES,
        'Classic skip still jumps to frame 30');

      game.mode = MODES.UPDATED;
      game.state = STATE.DEAD;
      Animations.deathAnimFrame = 18;
      handleAction();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.state, STATE.WAITING,
        'Updated frame 18 is the end of the roll, so space restarts');
    } finally {
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = orig.mode;
      game.state = orig.state;
      game.score = orig.score;
      Animations.deathAnimFrame = orig.anim;
      setReducedMotion(false);
    }
  });

  it('tunes the Updated length without passing Classic 30 or going non-positive', () => {
    const orig = {
      mode: game.mode,
      state: game.state,
      score: game.score,
      anim: Animations.deathAnimFrame,
      shake: Animations.deathShakeFrames,
      newBest: game.isNewBest,
      newToday: game.isNewTodayBest,
      prev: game.previousHighScore,
      prevDaily: game.previousDailyBest,
    };
    try {
      setReducedMotion(false);
      assert(typeof deathAnimFrames === 'function',
        'deathAnimFrames should be the mode-correct length');
      game.score = 500;

      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 12 }, () => {
        armDead(MODES.UPDATED, 500);
        assertEquals(deathAnimFrames(), 12, 'a shorter whole-frame tune is honored');
        assertEquals(rollCountUp().steps, 12, 'the roll uses that tuned length');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 30 }, () => {
        assertEquals(deathAnimFrames(), 30, 'a tune equal to Classic is allowed');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 40 }, () => {
        assertEquals(deathAnimFrames(), QUIET_FRAMES,
          'a tune past Classic 30 falls back to 18');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 0 }, () => {
        assertEquals(deathAnimFrames(), QUIET_FRAMES, 'zero falls back to 18');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: -4 }, () => {
        assertEquals(deathAnimFrames(), QUIET_FRAMES, 'a negative length falls back to 18');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 1.5 }, () => {
        assertEquals(deathAnimFrames(), QUIET_FRAMES, 'a fractional length falls back to 18');
      });
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 'fast' }, () => {
        assertEquals(deathAnimFrames(), QUIET_FRAMES, 'a non-numeric length falls back to 18');
      });

      game.mode = MODES.CLASSIC;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 12 }, () => {
        armDead(MODES.CLASSIC, 500);
        assertEquals(deathAnimFrames(), GAME_CONFIG.DEATH_ANIM_FRAMES,
          'Classic ignores the Updated length');
        assertEquals(rollCountUp().steps, GAME_CONFIG.DEATH_ANIM_FRAMES,
          'Classic still rolls for 30 frames');
      });

      game.mode = MODES.DAILY;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 10 }, () => {
        assertEquals(deathAnimFrames(), 10, 'Daily shares the Updated length tune');
      });

      setReducedMotion(true);
      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 1 }, () => {
        assertEquals(deathAnimFrames(), 2,
          'reduced motion keeps a positive length when the tune is 1');
      });
      game.mode = MODES.CLASSIC;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 12 }, () => {
        assertEquals(deathAnimFrames(), GAME_CONFIG.DEATH_ANIM_FRAMES,
          'reduced motion does not shorten Classic');
      });
    } finally {
      game.mode = orig.mode;
      game.state = orig.state;
      game.score = orig.score;
      Animations.deathAnimFrame = orig.anim;
      Animations.deathShakeFrames = orig.shake;
      game.isNewBest = orig.newBest;
      game.isNewTodayBest = orig.newToday;
      game.previousHighScore = orig.prev;
      game.previousDailyBest = orig.prevDaily;
      setReducedMotion(false);
    }
  });
});

describe('QA death count-up flag (?qaCountUp=1)', () => {
  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function armWaiting(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.mode = mode;
    setReducedMotion(false);
    if (typeof setQaCountUp === 'function') setQaCountUp(false);
    game.state = STATE.WAITING;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    game.score = 0;
    game.highScore = 0;
    game.dailyBest = 0;
    game.isNewBest = false;
    game.isNewTodayBest = false;
    Animations.deathAnimFrame = 0;
    Animations.deathShakeFrames = 0;
  }

  function spyScoreText() {
    const calls = [];
    let alpha = null;
    const orig = ctx.fillText;
    ctx.fillText = function (text) {
      const s = String(text);
      calls.push(s);
      if (s === '00100' || s === '00060') alpha = ctx.globalAlpha;
    };
    return {
      calls: calls,
      alpha: () => alpha,
      restore() { ctx.fillText = orig; },
    };
  }

  it('recognizes only ?qaCountUp=1', () => {
    assert(typeof readQaCountUpFlag === 'function',
      'readQaCountUpFlag should parse the playtest query');
    assert(typeof setQaCountUp === 'function',
      'setQaCountUp should be exposed for tests');
    assert(readQaCountUpFlag('?qaCountUp=1') === true, '?qaCountUp=1 should hold the count-up');
    assert(readQaCountUpFlag('?qaNight=1&qaCountUp=1') === true,
      'the flag should work beside ?qaNight=1');
    assert(readQaCountUpFlag('?qaCountUp=1&qaShake=1') === true, 'param order should not matter');
    assert(readQaCountUpFlag('') === false, 'a normal visit should leave the roll for a real death');
    assert(readQaCountUpFlag('?qaCountUp=0') === false, 'only the value 1 enables the flag');
    assert(readQaCountUpFlag('?qaCountUp=18') === false, 'qaCountUp=18 must not count as the flag');
    assert(readQaCountUpFlag('?qaScorePop=1') === false, 'the score pop must not hold the count-up');
  });

  it('holds a screenshotable Game Over roll without writing the run', () => {
    const origMode = game.mode;
    const spy = spyScoreText();
    const storedDaily = localStorage.getItem('dino-daily-best');
    const storedHigh = localStorage.getItem('dino-high-score');
    try {
      assert(typeof setQaCountUp === 'function', 'setQaCountUp should be exposed for tests');
      assert(QA_COUNT_UP_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armWaiting(mode);
        const origRng = game.rng;
        let rngCalls = 0;
        game.rng = () => { rngCalls++; return origRng(); };
        setQaCountUp(true);
        spy.calls.length = 0;
        tick();
        const expectFull = mode === MODES.DAILY;
        assert(spy.calls.includes('00100'),
          mode + ' holds the settled sample score from the shorter roll');
        assert(!spy.calls.includes('00060'),
          mode + ' does not paint the Classic partial score');
        if (expectFull) {
          assert(spy.calls.includes('Share TODAY BEST with Copy result'),
            'Daily hold shows the hint once the shorter roll has settled');
        } else {
          assert(!spy.calls.includes('Share TODAY BEST with Copy result'),
            'Updated hold does not draw the Daily hint');
        }
        assertEquals(game.qaCountUpHold, QA_COUNT_UP_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaCountUpShown, true, mode + ' spends the latch');
        assertEquals(Animations.deathAnimFrame, 0, mode + ' does not arm the real count-up');
        assertEquals(game.state, STATE.WAITING, mode + ' does not enter a real death');
        assertEquals(game.score, 0, mode + ' hold must not write the score');
        assertEquals(game.highScore, 0, mode + ' hold must not write the high score');
        assertEquals(game.dailyBest, 0, mode + ' hold must not write daily best');
        assertEquals(localStorage.getItem('dino-daily-best'), storedDaily,
          mode + ' hold must not store daily best');
        assertEquals(localStorage.getItem('dino-high-score'), storedHigh,
          mode + ' hold must not store the high score');
        assertEquals(rngCalls, 0, mode + ' hold must not consume the run seed');
        assertEquals(game.currentSpeed, GAME_CONFIG.INITIAL_SPEED,
          mode + ' hold must not change speed');
        game.rng = origRng;
      }

      armWaiting(MODES.CLASSIC);
      setQaCountUp(true);
      spy.calls.length = 0;
      tick();
      assert(spy.calls.includes('00060'),
        'Classic hold paints the 30-frame roll at the Updated marker');
      assert(!spy.calls.includes('00100'),
        'Classic hold does not paint the settled Updated score');
      assert(!spy.calls.includes('Share TODAY BEST with Copy result'),
        'Classic hold does not draw the Daily hint');
      assertEquals(game.qaCountUpHold, QA_COUNT_UP_HOLD, 'Classic still holds long enough to capture');
      assertEquals(Animations.deathAnimFrame, 0, 'Classic hold does not arm the real count-up');
      assertEquals(game.score, 0, 'Classic hold must not write the score');

      armWaiting(MODES.UPDATED);
      setQaCountUp(true);
      game.state = STATE.IDLE;
      tick();
      const held = game.qaCountUpHold;
      tick();
      assertEquals(held, QA_COUNT_UP_HOLD, 'the idle card latches the full hold');
      assertEquals(game.qaCountUpHold, held, 'the idle card stays up for a capture');
      assert(spy.calls.includes('00100'), 'the idle card paints the shorter roll');
      assertEquals(game.state, STATE.IDLE, 'the idle hold does not start the run');
      assertEquals(game.score, 0, 'the idle card must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaCountUp === 'function') setQaCountUp(false);
      setReducedMotion(false);
      if (game.qaCountUpHold) game.qaCountUpHold = 0;
      if (game.qaCountUpShown) game.qaCountUpShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion halves the hold and quiets the paint', () => {
    const origMode = game.mode;
    const spy = spyScoreText();
    try {
      assert(typeof setQaCountUp === 'function', 'setQaCountUp should be exposed for tests');
      armWaiting(MODES.UPDATED);
      setReducedMotion(true);
      setQaCountUp(true);
      spy.calls.length = 0;
      tick();
      assertEquals(game.qaCountUpHold, qaCountUpHoldFrames(),
        'the hold uses the shorter window');
      assert(game.qaCountUpHold < QA_COUNT_UP_HOLD, 'the hold is shorter than the full capture');
      assert(qaCountUpHoldFrames() >= 2, 'the hold still lasts long enough to see');
      assertEquals(game.qaCountUpHold, Math.max(2, Math.round(QA_COUNT_UP_HOLD * 0.5)),
        'reduced motion halves the 180-frame hold');
      assert(spy.calls.includes('00100'), 'the damped hold still shows the settled score');
      assertEquals(spy.alpha(), 0.5, 'reduced motion paints the card at half strength');
      assertEquals(game.score, 0, 'the damped hold must not write the score');
      assertEquals(Animations.deathAnimFrame, 0, 'the damped hold does not arm the real count-up');

      armWaiting(MODES.CLASSIC);
      setReducedMotion(true);
      setQaCountUp(true);
      spy.calls.length = 0;
      tick();
      assert(spy.calls.includes('00060'),
        'reduced motion does not switch Classic onto the Updated length');
      assert(!spy.calls.includes('00100'), 'Classic stays on the 30-frame partial score');
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaCountUp === 'function') setQaCountUp(false);
      setReducedMotion(false);
      if (game.qaCountUpHold) game.qaCountUpHold = 0;
      if (game.qaCountUpShown) game.qaCountUpShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCountUp=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyScoreText();
    global.location = { search: '?qaCountUp=1' };
    try {
      assert(typeof setQaCountUp === 'function', 'setQaCountUp should be exposed for tests');
      setQaCountUp(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.UPDATED;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      const score = game.score;
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.WAITING, 'the re-read flag holds Game Over before the run');
      assertEquals(game.qaCountUpHold, QA_COUNT_UP_HOLD, 'the re-read flag latches the hold');
      assertEquals(game.qaCountUpShown, true, 'the re-read flag spends the latch');
      assert(spy.calls.includes('00100'), 'the re-read flag paints the shorter roll');
      assertEquals(game.score, score, 're-reading the flag must not change the score');
      assertEquals(Animations.deathAnimFrame, 0, 're-reading the flag does not arm the real count-up');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      if (typeof setQaCountUp === 'function') setQaCountUp(false);
      setReducedMotion(false);
      if (game.qaCountUpHold) game.qaCountUpHold = 0;
      if (game.qaCountUpShown) game.qaCountUpShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Soft idle start pulse', () => {
  const QUIET_BASE = 0.4;
  const QUIET_AMP = 0.15;
  const QUIET_RATE = 0.05;
  const CLASSIC_MIN = 0.3;
  const CLASSIC_MAX = 0.7;
  const PROMPT = 'TAP / PRESS SPACE TO START';

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try { fn(); } finally { window.GAME_TUNING = orig; }
  }

  function classicAlpha(frame) {
    return 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(frame * 0.08));
  }

  function quietAlpha(frame, base, amp, rate) {
    return base + amp * (0.5 + 0.5 * Math.sin(frame * rate));
  }

  function paintIdle(frame) {
    const origFrame = game.animFrame;
    game.animFrame = frame;
    let promptStyle = null;
    let titleStyle = null;
    const texts = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => {
      const s = String(text);
      texts.push(s);
      if (s === 'REX RUN') titleStyle = ctx.fillStyle;
      if (s === PROMPT) promptStyle = ctx.fillStyle;
    };
    drawIdleScreen();
    ctx.fillText = origFill;
    game.animFrame = origFrame;
    return { texts, promptStyle, titleStyle };
  }

  function promptAlpha(frame) {
    const painted = paintIdle(frame);
    const match = /rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/.exec(painted.promptStyle || '');
    return {
      alpha: match ? Number(match[1]) : NaN,
      style: painted.promptStyle,
      title: painted.titleStyle,
      texts: painted.texts,
    };
  }

  function rounded(n) {
    return Number(n.toFixed(3));
  }

  it('Updated and Daily breathe inside 0.4–0.55, slower than Classic', () => {
    const origMode = game.mode;
    const origHold = game.qaIdleHold;
    try {
      assertEquals(GAME_CONFIG.UPDATED_IDLE_PULSE_BASE, QUIET_BASE,
        'the quiet floor is 0.4');
      assertEquals(GAME_CONFIG.UPDATED_IDLE_PULSE_AMPLITUDE, QUIET_AMP,
        'the quiet swing is 0.15');
      assertEquals(GAME_CONFIG.UPDATED_IDLE_PULSE_RATE, QUIET_RATE,
        'the quiet breath is slower than Classic 0.08');
      assert(QUIET_RATE < 0.08, 'the quiet rate must be slower than Classic');
      assert(QUIET_BASE >= CLASSIC_MIN && QUIET_BASE + QUIET_AMP <= CLASSIC_MAX,
        'the quiet band must sit inside Classic 0.3–0.7');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        if (game.qaIdleHold) game.qaIdleHold = 0;
        setReducedMotion(false);
        let lo = 1;
        let hi = 0;
        for (let frame = 0; frame <= 200; frame++) {
          const alpha = promptAlpha(frame).alpha;
          const expect = rounded(quietAlpha(frame, QUIET_BASE, QUIET_AMP, QUIET_RATE));
          assertEquals(alpha, expect, mode + ' frame ' + frame + ' uses the quiet breath');
          if (alpha < lo) lo = alpha;
          if (alpha > hi) hi = alpha;
        }
        assert(lo >= QUIET_BASE - 0.001, mode + ' does not drop below 0.4, got ' + lo);
        assert(hi <= QUIET_BASE + QUIET_AMP + 0.001, mode + ' does not rise above 0.55, got ' + hi);
        assert(hi < rounded(classicAlpha(20)), mode + ' peak stays under Classic peak');
        assert(lo > CLASSIC_MIN, mode + ' floor stays calmer than Classic trough');
        const title = promptAlpha(0);
        assertEquals(title.title, 'white', mode + ' title stays solid white');
        assert(title.texts.includes('REX RUN'), mode + ' still draws REX RUN');
        assert(title.texts.includes(PROMPT), mode + ' still draws the start line');
      }
    } finally {
      game.mode = origMode;
      if (origHold !== undefined) game.qaIdleHold = origHold;
      setReducedMotion(false);
    }
  });

  it('Classic keeps the 0.3–0.7 pulse, including under reduced motion', () => {
    const origMode = game.mode;
    const origHold = game.qaIdleHold;
    try {
      game.mode = MODES.CLASSIC;
      if (game.qaIdleHold) game.qaIdleHold = 0;
      for (const reduced of [false, true]) {
        setReducedMotion(reduced);
        for (const frame of [0, 20, 40, 80]) {
          const painted = promptAlpha(frame);
          assertEquals(painted.alpha, rounded(classicAlpha(frame)),
            (reduced ? 'reduced motion' : 'motion') + ' Classic frame ' + frame + ' keeps the old pulse');
        }
        assertNotEquals(promptAlpha(0).alpha, promptAlpha(40).alpha,
          'Classic still breathes under reduced=' + reduced);
      }
    } finally {
      game.mode = origMode;
      if (origHold !== undefined) game.qaIdleHold = origHold;
      setReducedMotion(false);
    }
  });

  it('Updated and Daily hold a static midpoint when motion is reduced', () => {
    const origMode = game.mode;
    const origHold = game.qaIdleHold;
    const mid = rounded(QUIET_BASE + QUIET_AMP * 0.5);
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        if (game.qaIdleHold) game.qaIdleHold = 0;
        setReducedMotion(true);
        const first = promptAlpha(0).alpha;
        assertEquals(first, mid, mode + ' reduced motion uses the midpoint');
        for (const frame of [1, 20, 40, 80, 200]) {
          assertEquals(promptAlpha(frame).alpha, first,
            mode + ' reduced motion does not sample sin at frame ' + frame);
        }
      }
    } finally {
      game.mode = origMode;
      if (origHold !== undefined) game.qaIdleHold = origHold;
      setReducedMotion(false);
    }
  });

  it('centers the idle card on the game board when the bitmap is wider', () => {
    const origW = canvas.width;
    const origH = canvas.height;
    const origMode = game.mode;
    const calls = [];
    const origText = ctx.fillText;
    const origRect = ctx.fillRect;
    canvas.width = 1200;
    canvas.height = 400;
    game.mode = MODES.UPDATED;
    ctx.fillText = (text, x, y) => calls.push({ text: String(text), x: x, y: y });
    ctx.fillRect = (x, y, w, h) => calls.push({ rect: [x, y, w, h] });
    try {
      drawIdleScreen();
      const title = calls.find((c) => c.text === 'REX RUN');
      const prompt = calls.find((c) => c.text === PROMPT);
      const scrim = calls.find((c) => c.rect);
      assert(title, 'title should be drawn');
      assert(prompt, 'start line should be drawn');
      assertEquals(title.x, GAME_CONFIG.CANVAS_W / 2, 'title stays centered on the 600-wide board');
      assertEquals(title.y, GAME_CONFIG.CANVAS_H / 2 - 16, 'title stays on the board vertically');
      assertEquals(prompt.x, GAME_CONFIG.CANVAS_W / 2, 'start line stays centered on the board');
      assertEquals(prompt.y, GAME_CONFIG.CANVAS_H / 2 + 12, 'start line stays under the title');
      assertEquals(scrim.rect[2], GAME_CONFIG.CANVAS_W, 'the dim card covers the board, not the raw bitmap');
      assertEquals(scrim.rect[3], GAME_CONFIG.CANVAS_H, 'the dim card matches the board height');
    } finally {
      ctx.fillText = origText;
      ctx.fillRect = origRect;
      canvas.width = origW;
      canvas.height = origH;
      game.mode = origMode;
    }
  });

  it('a bad tune cannot flash harder than Classic 0.3–0.7', () => {
    const origMode = game.mode;
    try {
      game.mode = MODES.UPDATED;
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;

      const fallbackAt = (frame) => rounded(quietAlpha(frame, QUIET_BASE, QUIET_AMP, QUIET_RATE));
      const cases = [
        [{ UPDATED_IDLE_PULSE_AMPLITUDE: 9 }, 'a wide swing'],
        [{ UPDATED_IDLE_PULSE_BASE: 2 }, 'a base above the Classic band'],
        [{ UPDATED_IDLE_PULSE_BASE: 0.1 }, 'a base below the Classic band'],
        [{ UPDATED_IDLE_PULSE_BASE: 0.5, UPDATED_IDLE_PULSE_AMPLITUDE: 0.3 }, 'a pair that peaks past 0.7'],
        [{ UPDATED_IDLE_PULSE_AMPLITUDE: 'loud' }, 'a non-number swing'],
        [{ UPDATED_IDLE_PULSE_RATE: 1 }, 'a rate faster than Classic'],
        [{ UPDATED_IDLE_PULSE_RATE: 0 }, 'a frozen rate'],
        [{ UPDATED_IDLE_PULSE_RATE: -0.2 }, 'a negative rate'],
      ];
      for (const [tune, label] of cases) {
        withTuning(tune, () => {
          for (const frame of [0, 2, 20, 31, 40]) {
            assertEquals(promptAlpha(frame).alpha, fallbackAt(frame),
              label + ' falls back at frame ' + frame);
          }
        });
      }

      withTuning({
        UPDATED_IDLE_PULSE_BASE: 0.42,
        UPDATED_IDLE_PULSE_AMPLITUDE: 0.08,
        UPDATED_IDLE_PULSE_RATE: 0.04,
      }, () => {
        const frame = 10;
        assertEquals(promptAlpha(frame).alpha, rounded(quietAlpha(frame, 0.42, 0.08, 0.04)),
          'a tune inside the Classic band is honored');
        assert(0.42 + 0.08 <= CLASSIC_MAX, 'the honored tune still ends at or under 0.7');
      });
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
    }
  });
});

describe('QA idle pulse flag (?qaIdle=1)', () => {
  const PROMPT = 'TAP / PRESS SPACE TO START';
  const QUIET_PEAK = Number((0.4 + 0.15).toFixed(3));
  const QUIET_MID = Number((0.4 + 0.15 * 0.5).toFixed(3));
  // Same product the canvas rounds: (base + amplitude / 2) * 0.5 → 0.238.
  const HALF_INK = Number(((0.4 + 0.15 * 0.5) * 0.5).toFixed(3));

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  function classicAlpha(frame) {
    return Number((0.3 + 0.4 * (0.5 + 0.5 * Math.sin(frame * 0.08))).toFixed(3));
  }

  function armIdle(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.mode = mode;
    setReducedMotion(false);
    if (typeof setQaIdle === 'function') setQaIdle(false);
    game.state = STATE.IDLE;
    game.score = 0;
    game.animFrame = 0;
    game.obstacles.length = 0;
  }

  function spyPrompt() {
    const calls = [];
    const orig = ctx.fillText;
    ctx.fillText = function (text) {
      const s = String(text);
      if (s === PROMPT || s === 'REX RUN') {
        calls.push({ text: s, fill: ctx.fillStyle, alpha: ctx.globalAlpha });
      }
    };
    return {
      calls,
      prompt() { return calls.filter((c) => c.text === PROMPT); },
      title() { return calls.filter((c) => c.text === 'REX RUN'); },
      restore() { ctx.fillText = orig; },
    };
  }

  function promptFillAlpha(spy) {
    const row = spy.prompt()[spy.prompt().length - 1];
    if (!row) return NaN;
    const match = /rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/.exec(row.fill || '');
    return match ? Number(match[1]) : NaN;
  }

  it('recognizes only ?qaIdle=1', () => {
    assert(typeof readQaIdleFlag === 'function',
      'readQaIdleFlag should parse the playtest query');
    assert(typeof setQaIdle === 'function',
      'setQaIdle should be exposed for tests');
    assert(readQaIdleFlag('?qaIdle=1') === true, '?qaIdle=1 should hold the idle invite');
    assert(readQaIdleFlag('?qaNight=1&qaIdle=1') === true,
      'the flag should work beside ?qaNight=1');
    assert(readQaIdleFlag('?qaIdle=1&qaCountUp=1') === true, 'param order should not matter');
    assert(readQaIdleFlag('') === false, 'a normal visit should leave the live breath');
    assert(readQaIdleFlag('?qaIdle=0') === false, 'only the value 1 enables the flag');
    assert(readQaIdleFlag('?qaIdle=true') === false, 'qaIdle=true must not count as the flag');
    assert(readQaIdleFlag('?qaCountUp=1') === false, 'the count-up flag must not hold the invite');
  });

  it('holds the quieter peak on the idle card without starting a run', () => {
    const origMode = game.mode;
    const spy = spyPrompt();
    try {
      assert(typeof setQaIdle === 'function', 'setQaIdle should be exposed for tests');
      assert(QA_IDLE_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armIdle(mode);
        const origRng = game.rng;
        let rngCalls = 0;
        game.rng = () => { rngCalls++; return origRng(); };
        const speed = game.currentSpeed;
        setQaIdle(true);
        spy.calls.length = 0;
        tick();
        const first = promptFillAlpha(spy);
        const held = game.qaIdleHold;
        tick();
        assertEquals(first, QUIET_PEAK, mode + ' freezes the quieter peak');
        assertEquals(promptFillAlpha(spy), QUIET_PEAK, mode + ' stays on that peak for a second frame');
        assertEquals(spy.title()[0] && spy.title()[0].fill, 'white', mode + ' title stays solid white');
        assertEquals(held, QA_IDLE_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaIdleHold, held, mode + ' idle card does not burn the hold down');
        assertEquals(game.qaIdleShown, true, mode + ' spends the latch');
        assertEquals(game.state, STATE.IDLE, mode + ' hold does not start the run');
        assertEquals(game.score, 0, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speed, mode + ' hold must not change speed');
        assertEquals(game.obstacles.length, 0, mode + ' hold must not spawn');
        assertEquals(rngCalls, 0, mode + ' hold must not consume the run seed');
        game.rng = origRng;

        const before = game.state;
        handleAction();
        assertEquals(game.state, STATE.WAITING, mode + ' Space still leaves idle for the countdown');
        assertEquals(before, STATE.IDLE, mode + ' the hold itself had not already left idle');
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaIdle === 'function') setQaIdle(false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with the flag keeps the Classic pulse', () => {
    const origMode = game.mode;
    const spy = spyPrompt();
    try {
      assert(typeof setQaIdle === 'function', 'setQaIdle should be exposed for tests');
      armIdle(MODES.CLASSIC);
      setQaIdle(true);
      spy.calls.length = 0;
      tick();
      const frame = game.animFrame;
      const first = promptFillAlpha(spy);
      tick();
      const second = promptFillAlpha(spy);
      assertEquals(first, classicAlpha(frame), 'Classic flag uses the Classic formula');
      assertNotEquals(first, QUIET_PEAK, 'Classic flag does not freeze the quieter peak');
      assertNotEquals(first, second, 'Classic flag still breathes');
      assertEquals(game.state, STATE.IDLE, 'Classic flag does not start the run');
      assertEquals(game.score, 0, 'Classic flag must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaIdle === 'function') setQaIdle(false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion damps the hold to a static half-ink invite', () => {
    const origMode = game.mode;
    const spy = spyPrompt();
    try {
      assert(typeof setQaIdle === 'function', 'setQaIdle should be exposed for tests');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armIdle(mode);
        setReducedMotion(true);
        setQaIdle(true);
        spy.calls.length = 0;
        tick();
        const first = promptFillAlpha(spy);
        tick();
        assertEquals(game.qaIdleHold, qaIdleHoldFrames(), mode + ' uses the shorter window');
        assert(game.qaIdleHold < QA_IDLE_HOLD, mode + ' hold is shorter than the full capture');
        assert(qaIdleHoldFrames() >= 2, mode + ' hold still lasts long enough to see');
        assertEquals(game.qaIdleHold, Math.max(2, Math.round(QA_IDLE_HOLD * 0.5)),
          mode + ' reduced motion halves the hold');
        assertEquals(first, HALF_INK, mode + ' paints the static invite at half ink');
        assertEquals(promptFillAlpha(spy), first, mode + ' damped hold does not breathe');
        assert(first < QUIET_MID, mode + ' half ink is quieter than the static midpoint');
        assertEquals(spy.title()[0] && spy.title()[0].fill, 'white', mode + ' title stays solid white');
        assertEquals(game.state, STATE.IDLE, mode + ' damped hold does not start the run');
        assertEquals(game.score, 0, mode + ' damped hold must not write the score');
      }

      armIdle(MODES.CLASSIC);
      setReducedMotion(true);
      setQaIdle(true);
      spy.calls.length = 0;
      tick();
      const frame = game.animFrame;
      assertEquals(promptFillAlpha(spy), classicAlpha(frame),
        'reduced motion does not switch Classic onto the quiet invite');
      assertEquals(game.qaIdleHold, Math.max(2, Math.round(QA_IDLE_HOLD * 0.5)),
        'Classic still damps the hold length');
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaIdle === 'function') setQaIdle(false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaIdle=1 from the page query', () => {
    const origMode = game.mode;
    const hadLocation = Object.prototype.hasOwnProperty.call(global, 'location');
    const prevLocation = global.location;
    const spy = spyPrompt();
    global.location = { search: '?qaIdle=1' };
    try {
      assert(typeof setQaIdle === 'function', 'setQaIdle should be exposed for tests');
      setQaIdle(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.UPDATED;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.state, STATE.WAITING, 're-reading the flag does not skip the countdown');
      game.state = STATE.IDLE;
      const score = game.score;
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.IDLE, 'the re-read flag holds the idle card');
      assertEquals(game.qaIdleHold, QA_IDLE_HOLD, 'the re-read flag latches the hold');
      assertEquals(game.qaIdleShown, true, 'the re-read flag spends the latch');
      assertEquals(promptFillAlpha(spy), QUIET_PEAK, 'the re-read flag paints the quieter peak');
      assertEquals(game.score, score, 're-reading the flag must not change the score');
    } finally {
      spy.restore();
      if (hadLocation) global.location = prevLocation;
      else delete global.location;
      game.mode = origMode;
      if (typeof setQaIdle === 'function') setQaIdle(false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load', () => setTimeout(printSummary, 500));
} else {
  setTimeout(printSummary, 500);
}
