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
      assertEquals(night.count, 8, 'production night puff count stays the same');
      assertEquals(kind.color, '#3d4f63', 'QA puff should be dark enough to read on the day sky');
      assert(kind.size >= 3 && kind.size <= 4, `QA puff size should be 3–4, was ${kind.size}`);
      assert(kind.count >= 10 && kind.count <= 12, `QA puff count should be 10–12, was ${kind.count}`);

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

describe('Daily pre-run framing', () => {
  const LINE = 'Same course as everyone today';

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
    const line = calls.find((c) => c.text === LINE);
    assert(line, `Daily WAITING should show the shared-run line, got: ${JSON.stringify(calls.map((c) => c.text))}`);
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
    const earlyLine = early.find((c) => c.text === LINE);
    const lateLine = late.find((c) => c.text === LINE);
    assert(late.some((c) => c.text !== 'GET READY' && c.text !== LINE),
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

    assert(!classic.some((c) => c.text === LINE),
      `Classic must not show Daily framing, got: ${JSON.stringify(classic.map((c) => c.text))}`);
    assert(!updated.some((c) => c.text === LINE),
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

    assert(!running.some((c) => c.text === LINE),
      `RUNNING must not show the shared-run line, got: ${JSON.stringify(running.map((c) => c.text))}`);
    assert(!running.some((c) => c.text.includes('TODAY')),
      `RUNNING must not grow a TODAY HUD, got: ${JSON.stringify(running.map((c) => c.text))}`);
    assert(!over.some((c) => c.text === LINE),
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

    assert(!updated.includes(LINE), `Updated countdown must stay quiet, got: ${updated}`);
    assert(daily.includes('Get ready'), `Daily countdown should still say get ready, got: ${daily}`);
    assert(daily.includes(LINE), `Daily countdown should mention the shared course, got: ${daily}`);
  });

  it('the Daily button announces the shared course, and leaving does not', () => {
    const origMode = game.mode;
    const origText = a11yLive.textContent;
    const btn = document.getElementById('daily-btn');
    const handler = btn && btn._listeners && btn._listeners.click && btn._listeners.click[0];
    assert(typeof handler === 'function', 'daily button must register a click handler');
    game.mode = MODES.UPDATED;
    handler({ stopPropagation() {} });
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const entered = a11yLive.textContent;

    handler({ stopPropagation() {} });
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const left = a11yLive.textContent;

    game.mode = origMode;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    a11yLive.textContent = origText;

    assert(/Daily challenge #\d+/.test(entered), `entering Daily should name the challenge, got: ${entered}`);
    assert(entered.includes(LINE), `entering Daily should mention the shared course, got: ${entered}`);
    assert(!left.includes(LINE), `leaving Daily must drop the shared-course line, got: ${left}`);
    assert(left.includes('Updated mode'), `leaving Daily should announce Updated mode, got: ${left}`);
  });
});

describe('Daily death-screen hint', () => {
  const HINT = 'Share TODAY BEST with Copy result';
  const PRE_RUN = 'Same course as everyone today';

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
    assert(!calls.some((c) => c.text === PRE_RUN), 'the pre-run line should stay off Game Over');
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
    assert(waiting.some((c) => c.text === PRE_RUN), 'the pre-run shared-course line should stay');
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load', () => setTimeout(printSummary, 500));
} else {
  setTimeout(printSummary, 500);
}
