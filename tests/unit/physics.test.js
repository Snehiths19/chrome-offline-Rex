// Unit tests: physics. Jumping, collisions, scoring, speed, game states, restarts and the 60Hz sim clock.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('physics');

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
    assert(
      dino.y < initialY,
      `Dino Y (${dino.y}) should be less than initial Y (${initialY}) after 1st frame`
    );

    let frames = 0;
    while (dino.isJumping && frames++ < 100) stepPhysics();
    assert(!dino.isJumping, 'Dino should eventually land');
    assertEquals(
      dino.y,
      GAME_CONFIG.CANVAS_H - dino.height,
      'Dino should be back on the ground after landing'
    );
  });

  // Classic: jumpPower=-12, gravity=0.48 → peak ≈ 144px. Updated and Daily
  // take off at UPDATED_JUMP_POWER (M4) → peak ≈ 91px on the plain arc.
  for (const [mode, expectedPeak] of [
    [MODES.CLASSIC, 144],
    [MODES.UPDATED, 91],
  ]) {
    it(`should have a peak jump height of ~${expectedPeak}px in ${mode}`, () => {
      const origMode = game.mode;
      game.mode = mode;
      resetGame();
      game.state = STATE.RUNNING;
      jump();
      let minY = dino.y;
      const groundY = GAME_CONFIG.CANVAS_H - dino.height;
      for (let i = 0; i < 60; i++) {
        dino.velocityY += dino.gravity;
        dino.y += dino.velocityY;
        if (dino.y < minY) minY = dino.y;
        if (dino.y >= groundY) {
          dino.y = groundY;
          dino.isJumping = false;
          break;
        }
      }
      game.mode = origMode;
      const actualPeak = groundY - minY;
      assert(
        Math.abs(actualPeak - expectedPeak) <= 5,
        `Peak height ${actualPeak.toFixed(1)}px should be ~${expectedPeak}px. ` +
          `If this passes before changing constants, the test is wrong — rewrite it.`
      );
    });
  }

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

describe('Jump buffer (F1)', () => {
  // One 60Hz sim slice of RUNNING through the real loop, as the replays do.
  const bufferStep = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const startBufferRun = () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 100000; // no obstacles: nothing ends the run
  };
  // Slices from take-off until the dino is back on the ground.
  const airtimeSlices = () => {
    startBufferRun();
    handleAction();
    let n = 0;
    while (dino.isJumping && n < 200) {
      bufferStep();
      n++;
    }
    return n;
  };
  // Jump, then press again `before` slices ahead of the landing slice.
  const pressBeforeLanding = (before) => {
    const air = airtimeSlices();
    startBufferRun();
    handleAction();
    for (let i = 0; i < air - before; i++) bufferStep();
    assert(dino.isJumping, 'still in the air when the early press comes');
    handleAction();
    for (let i = 0; i < before; i++) bufferStep();
  };

  it('reads JUMP_BUFFER_FRAMES from GAME_CONFIG (about 6 sim frames)', () => {
    assertEquals(GAME_CONFIG.JUMP_BUFFER_FRAMES, 6, 'buffer window');
  });

  it('a press on the last airborne slice jumps again on the landing slice', () => {
    pressBeforeLanding(1);
    assert(dino.isJumping, 'buffered press should take off on landing');
    assertEquals(dino.velocityY, jumpPower(), 'fresh take-off speed');
    assertEquals(dino.jumpBufferFrames, 0, 'buffer is spent');
  });

  it('a press JUMP_BUFFER_FRAMES slices before landing still counts', () => {
    pressBeforeLanding(GAME_CONFIG.JUMP_BUFFER_FRAMES);
    assert(dino.isJumping, 'press at the edge of the window should jump on landing');
    assertEquals(dino.velocityY, jumpPower(), 'fresh take-off speed');
  });

  // Classic has no second jump, so a press outside the window is dropped.
  // In Updated and Daily the same press is the second jump (M3).
  const inClassic = (fn) => {
    const origMode = game.mode;
    game.mode = MODES.CLASSIC;
    try {
      fn();
    } finally {
      game.mode = origMode;
    }
  };

  it('a press one slice earlier than the window is dropped (Classic)', () => {
    inClassic(() => {
      pressBeforeLanding(GAME_CONFIG.JUMP_BUFFER_FRAMES + 1);
      assert(!dino.isJumping, 'press outside the window should not jump');
      assertEquals(dino.y, GAME_CONFIG.CANVAS_H - dino.height, 'dino stays on the ground');
      assertEquals(dino.jumpBufferFrames, 0, 'nothing left in the buffer');
    });
  });

  it('a press one slice earlier than the window is the second jump (Updated)', () => {
    const origMode = game.mode;
    game.mode = MODES.UPDATED;
    try {
      const air = airtimeSlices();
      startBufferRun();
      handleAction();
      for (let i = 0; i < air - GAME_CONFIG.JUMP_BUFFER_FRAMES - 1; i++) bufferStep();
      handleAction();
      assert(dino.doubleJumped, 'second jump spent');
      assertEquals(
        dino.velocityY,
        GAME_CONFIG.DOUBLE_JUMP_POWER,
        'low enough for the full second jump'
      );
      assertEquals(dino.jumpBufferFrames, 0, 'nothing buffered');
    } finally {
      game.mode = origMode;
    }
  });

  it('a press early in the jump never fires (Classic)', () => {
    inClassic(() => {
      startBufferRun();
      handleAction();
      bufferStep();
      handleAction();
      let n = 0;
      while (dino.isJumping && n++ < 200) bufferStep();
      bufferStep();
      assert(!dino.isJumping, 'an early press should have expired long before landing');
    });
  });

  it('a press on the ground jumps at once and buffers nothing', () => {
    startBufferRun();
    handleAction();
    assert(dino.isJumping, 'ground press jumps');
    assertEquals(dino.jumpBufferFrames, 0, 'no buffer from a ground press');
  });

  it('resetGame clears a buffered press', () => {
    startBufferRun();
    dino.jumpBufferFrames = 4;
    resetGame();
    assertEquals(dino.jumpBufferFrames, 0, 'buffer cleared on reset');
  });
});

describe('Pause on app switch (F2)', () => {
  const pauseStep = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  // A run some way in, with an obstacle on screen and the dino mid-air.
  const startPauseRun = () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    for (let i = 0; i < 400 && game.obstacles.length === 0; i++) pauseStep();
    jump();
    pauseStep();
  };
  const snapshot = () => ({
    score: game.score,
    speed: game.currentSpeed,
    animFrame: game.animFrame,
    lastObstacleX: game.lastObstacleX,
    nextSpawnGap: game.nextSpawnGap,
    obstacles: game.obstacles.map((o) => [o.x, o.type]),
    dinoY: dino.y,
    velocityY: dino.velocityY,
  });

  it('pauses only a RUNNING run', () => {
    resetGame();
    game.state = STATE.WAITING;
    assert(!pauseRun(), 'WAITING is not paused');
    assertEquals(game.state, STATE.WAITING, 'state unchanged');
    game.state = STATE.DEAD;
    assert(!pauseRun(), 'DEAD is not paused');
    game.state = STATE.RUNNING;
    assert(pauseRun(), 'RUNNING pauses');
    assertEquals(game.state, STATE.PAUSED, 'now PAUSED');
    resetGame();
  });

  it('nothing moves while hidden, however many slices pass', () => {
    startPauseRun();
    pauseRun();
    const before = snapshot();
    for (let i = 0; i < 300; i++) pauseStep();
    assertEquals(JSON.stringify(snapshot()), JSON.stringify(before), 'run frozen while hidden');
    assertEquals(game.state, STATE.PAUSED, 'still paused');
    resetGame();
  });

  it('back on the page, a 3 2 1 countdown runs, then the run carries on', () => {
    startPauseRun();
    pauseRun();
    assert(resumeRun(), 'resume starts');
    assertEquals(resumeCountdownNumber(), 3, 'starts at 3');
    const before = snapshot();
    for (let i = 0; i < GAME_CONFIG.RESUME_COUNTDOWN_FRAMES - 1; i++) pauseStep();
    assertEquals(game.state, STATE.PAUSED, 'countdown still running one slice before the end');
    assertEquals(resumeCountdownNumber(), 1, 'last second shows 1');
    assertEquals(JSON.stringify(snapshot()), JSON.stringify(before), 'nothing moved during it');
    pauseStep();
    assertEquals(game.state, STATE.RUNNING, 'running again');
    pauseStep();
    assert(game.score > before.score, 'score moves again once running');
    resetGame();
  });

  it('a paused run plays on exactly as if it had never paused', () => {
    const play = (withPause) => {
      replayRunSeed(4242);
      startPauseRun();
      for (let i = 0; i < 30; i++) pauseStep();
      if (withPause) {
        pauseRun();
        for (let i = 0; i < 50; i++) pauseStep();
        resumeRun();
        while (game.state === STATE.PAUSED) pauseStep();
      }
      for (let i = 0; i < 200 && game.state === STATE.RUNNING; i++) pauseStep();
      const out = JSON.stringify(snapshot()) + game.state + game.rng();
      resetGame();
      return out;
    };
    assertEquals(play(true), play(false), 'same run with and without a pause');
  });

  it('a press during the countdown skips nothing and does not jump', () => {
    startPauseRun();
    while (dino.isJumping) pauseStep();
    pauseRun();
    resumeRun();
    pauseStep();
    const left = game.resumeFrames;
    handleAction();
    assertEquals(game.state, STATE.PAUSED, 'still counting down');
    assertEquals(game.resumeFrames, left, 'countdown not shortened');
    assert(!dino.isJumping, 'no jump during the countdown');
    resetGame();
  });

  it('resume does nothing unless the run was paused by hiding', () => {
    resetGame();
    game.state = STATE.RUNNING;
    assert(!resumeRun(), 'resume on a running run is a no-op');
    pauseRun();
    resumeRun();
    const left = game.resumeFrames;
    pauseStep();
    assert(!resumeRun(), 'a second resume does not restart the countdown');
    assertEquals(game.resumeFrames, left - 1, 'countdown kept going');
    resetGame();
  });

  it('pause and resume are announced through the live region', () => {
    const orig = a11yLive.textContent;
    resetGame();
    game.state = STATE.RUNNING;
    pauseRun();
    assertEquals(a11yLive.textContent, 'Paused.', 'pause announced');
    resumeRun();
    assertEquals(a11yLive.textContent, 'Back. Resuming in 3.', 'resume announced');
    while (game.state === STATE.PAUSED) pauseStep();
    assertEquals(a11yLive.textContent, 'Go!', 'go announced');
    a11yLive.textContent = orig;
    resetGame();
  });

  it('draws PAUSED, then the countdown number, only while paused', () => {
    const origFill = ctx.fillText;
    const drawn = [];
    ctx.fillText = (t) => drawn.push(String(t));
    resetGame();
    game.state = STATE.RUNNING;
    drawResumeOverlay();
    assertEquals(drawn.length, 0, 'nothing while running');
    pauseRun();
    drawResumeOverlay();
    assertEquals(drawn.join('|'), 'PAUSED', 'only PAUSED while hidden');
    drawn.length = 0;
    resumeRun();
    drawResumeOverlay();
    assertEquals(drawn.join('|'), 'PAUSED|3', 'PAUSED and 3 once back');
    ctx.fillText = origFill;
    resetGame();
  });

  it('hiding again during the countdown holds the run and restarts the countdown', () => {
    startPauseRun();
    pauseRun();
    resumeRun();
    for (let i = 0; i < 100; i++) pauseStep();
    const before = snapshot();
    assert(pauseRun(), 'a second hide pauses again');
    assert(game.pauseHidden, 'held while hidden');
    for (let i = 0; i < 400; i++) pauseStep();
    assertEquals(game.state, STATE.PAUSED, 'still paused after many hidden slices');
    assert(resumeRun(), 'coming back resumes');
    assertEquals(game.resumeFrames, GAME_CONFIG.RESUME_COUNTDOWN_FRAMES, 'full countdown again');
    assertEquals(JSON.stringify(snapshot()), JSON.stringify(before), 'run untouched');
    resetGame();
  });

  it('resetGame clears a pause', () => {
    resetGame();
    game.state = STATE.RUNNING;
    pauseRun();
    resetGame();
    assert(!game.pauseHidden, 'pauseHidden cleared');
    assertEquals(game.resumeFrames, 0, 'resumeFrames cleared');
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
      height: 40,
    };
    game.obstacles.push(collidingObstacle);
    assert(
      checkCollision(dino, game.obstacles[0]),
      'checkCollision should return true for colliding objects'
    );
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
      height: 40,
    };
    game.obstacles.push(nonCollidingObstacle);
    assert(
      !checkCollision(dino, game.obstacles[0]),
      'checkCollision should return false for non-colliding objects'
    );
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

    assert(
      game.score > initialScore,
      `Score (${game.score}) should be greater than initial score (${initialScore})`
    );
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

    assert(
      game.currentSpeed <= GAME_CONFIG.PLATEAU_SPEED,
      `currentSpeed at score 2000 (${game.currentSpeed}) must not exceed PLATEAU_SPEED (${GAME_CONFIG.PLATEAU_SPEED})`
    );
    assert(
      game.currentSpeed > GAME_CONFIG.PLATEAU_SPEED - 0.1,
      `currentSpeed at score 2000 (${game.currentSpeed}) should be very close to PLATEAU_SPEED — sigmoid has converged`
    );
  });

  it('should not set a .speed property on spawned obstacles', () => {
    resetGame();
    spawnObstacle();
    assert(
      game.obstacles[0].speed === undefined,
      `Obstacle should not have .speed (got: ${game.obstacles[0].speed}).`
    );
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
    game.rng = () => {
      calls++;
      return inner();
    };
    updateHills();

    assertEquals(calls, 3, 'Respawn must consume exactly 3 game.rng() draws');
    assert(
      game.hills[0].x >= GAME_CONFIG.CANVAS_W,
      'Respawned x must land at or past canvas width'
    );
  });

  it('hill respawn x is bounded by HILL_RESPAWN_X_RANGE', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    initHills();
    game.hills[0].x = -game.hills[0].width - 1;
    game.currentSpeed = 6;
    game.rng = () => 1.0;
    updateHills();
    const maxX = GAME_CONFIG.CANVAS_W + GAME_CONFIG.HILL_RESPAWN_X_RANGE;
    assert(
      game.hills[0].x <= maxX,
      `Hill x (${game.hills[0].x}) must not exceed CANVAS_W + HILL_RESPAWN_X_RANGE (${maxX})`
    );
    assert(game.hills[0].x >= GAME_CONFIG.CANVAS_W, 'Hill must respawn at or past CANVAS_W');
  });

  it('audio.ensure resumes a suspended context', () => {
    let resumed = 0;
    const prev = audio.ctx;
    audio.ctx = {
      state: 'suspended',
      resume: () => {
        resumed++;
        return Promise.resolve();
      },
    };
    audio.ensure();
    assertEquals(resumed, 1, 'ensure() must call resume() on suspended ctx');
    audio.ctx = prev;
  });

  it('audio.ensure does not call resume on running context', () => {
    let resumed = 0;
    const prev = audio.ctx;
    audio.ctx = {
      state: 'running',
      resume: () => {
        resumed++;
        return Promise.resolve();
      },
    };
    audio.ensure();
    assertEquals(resumed, 0, 'ensure() must not resume an already-running ctx');
    audio.ctx = prev;
  });

  it('drawNewBestBadge offsets vertically when milestone is active', () => {
    const calls = [];
    const origFill = ctx.fillText;
    const origAlpha = ctx.globalAlpha;
    ctx.fillText = (text, x, y) => calls.push({ text, x, y });

    Animations.milestoneFrames = 0;
    Animations.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    drawNewBestBadge();
    const baseY = calls[calls.length - 1].y;

    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    Animations.newBestFrames = GAME_CONFIG.NEW_BEST_FRAMES;
    drawNewBestBadge();
    const offsetY = calls[calls.length - 1].y;

    assert(
      offsetY > baseY,
      `NEW BEST y should drop when milestone active (base ${baseY}, offset ${offsetY})`
    );
    assertEquals(offsetY - baseY, 30, 'Stagger should be exactly 30px');

    ctx.fillText = origFill;
    // The Node canvas stub's save()/restore() are no-ops, so put back the
    // alpha the badge set, or the next file's draw tests start dimmed.
    ctx.globalAlpha = origAlpha;
    Animations.milestoneFrames = 0;
    Animations.newBestFrames = 0;
  });
});

describe('DifficultyProfile', () => {
  it('speedAtScore returns exactly the midpoint speed at RAMP_MIDPOINT', () => {
    const expected =
      GAME_CONFIG.INITIAL_SPEED + (GAME_CONFIG.PLATEAU_SPEED - GAME_CONFIG.INITIAL_SPEED) / 2;
    assertEquals(
      DifficultyProfile.speedAtScore(GAME_CONFIG.RAMP_MIDPOINT),
      expected,
      'At RAMP_MIDPOINT the sigmoid is exactly 0.5, so speed must be the midpoint between INITIAL and PLATEAU'
    );
  });

  it('speedAtScore is slightly above INITIAL_SPEED at score 0 — curve starts gently', () => {
    const speed = DifficultyProfile.speedAtScore(0);
    assert(
      speed > GAME_CONFIG.INITIAL_SPEED,
      `Score 0 speed ${speed} should be above INITIAL_SPEED ${GAME_CONFIG.INITIAL_SPEED}`
    );
    assert(
      speed < GAME_CONFIG.INITIAL_SPEED + 0.5,
      `Score 0 speed ${speed} should still be close to INITIAL_SPEED — gentle start`
    );
  });

  it('speedAtScore never exceeds PLATEAU_SPEED', () => {
    for (const score of [500, 1000, 5000]) {
      const speed = DifficultyProfile.speedAtScore(score);
      assert(
        speed <= GAME_CONFIG.PLATEAU_SPEED,
        `Score ${score} speed ${speed} must not exceed PLATEAU_SPEED ${GAME_CONFIG.PLATEAU_SPEED}`
      );
    }
  });

  it('speedAtScore is monotonically increasing', () => {
    const s0 = DifficultyProfile.speedAtScore(0);
    const s100 = DifficultyProfile.speedAtScore(100);
    const s300 = DifficultyProfile.speedAtScore(300);
    const s600 = DifficultyProfile.speedAtScore(600);
    assert(
      s0 < s100 && s100 < s300 && s300 < s600,
      `Speed must strictly increase: ${s0} < ${s100} < ${s300} < ${s600}`
    );
  });

  it('nextObstacle returns an object with a numeric gap and a typed obstacle', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng);
    assert(typeof params.gap === 'number', 'gap must be a number');
    assert(
      params.type && typeof params.type.id === 'string',
      'type must be an obstacle-type object with an id string'
    );
  });

  it('nextObstacle classic mode: gap shrinks as score rises', () => {
    const rng = mulberry32(42); // not consumed in classic mode — safe to reuse
    const paramsLow = DifficultyProfile.nextObstacle(0, MODES.CLASSIC, rng);
    const paramsHigh = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng);
    assert(
      paramsHigh.gap < paramsLow.gap,
      `Gap at score 500 (${paramsHigh.gap}) should be less than gap at score 0 (${paramsLow.gap}) — higher speed means shorter gap`
    );
  });

  it('nextObstacle classic mode: type is always small cactus', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(500, MODES.CLASSIC, rng);
    assertEquals(params.type.id, 'small', 'Classic mode must always return the small cactus');
  });

  it('nextObstacle updated mode: gap is within valid range at score 0', () => {
    const rng = mulberry32(42);
    const params = DifficultyProfile.nextObstacle(0, MODES.UPDATED, rng);
    assert(
      params.gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `Gap (${params.gap}) must be at least MIN_SPAWN_GAP (${GAME_CONFIG.MIN_SPAWN_GAP})`
    );
    assert(
      params.gap <= Math.round(GAME_CONFIG.MAX_SPAWN_GAP * (1 + GAME_CONFIG.SPAWN_GAP_JITTER)),
      `Gap (${params.gap}) must not exceed MAX_SPAWN_GAP with max jitter (${GAME_CONFIG.MAX_SPAWN_GAP} * ${1 + GAME_CONFIG.SPAWN_GAP_JITTER})`
    );
  });

  it('nextObstacle updated mode: cluster cactus returned at score 250 with max roll', () => {
    const rng = () => 0.99; // constant roll — pushes weighted pick to last eligible type
    const params = DifficultyProfile.nextObstacle(250, MODES.UPDATED, rng);
    assertEquals(
      params.type.id,
      'cluster',
      'At score 250 with max rng roll, all three types eligible and cluster wins the weighted draw'
    );
  });
});

describe('Restart cancels the animation frame first', () => {
  function assertCancelBeforeReset(trigger) {
    const origCancel = testGlobal.cancelAnimationFrame;
    const origRAF = testGlobal.requestAnimationFrame;
    game.score = 77;
    let scoreAtCancel = null;
    let scoreAtLoop = null;
    testGlobal.cancelAnimationFrame = (id) => {
      if (scoreAtCancel === null) scoreAtCancel = game.score;
      return origCancel(id);
    };
    testGlobal.requestAnimationFrame = (cb) => {
      if (scoreAtLoop === null) scoreAtLoop = game.score;
      return origRAF(cb);
    };
    try {
      trigger();
    } finally {
      testGlobal.cancelAnimationFrame = origCancel;
      testGlobal.requestAnimationFrame = origRAF;
      if (game.animationFrameId) origCancel(game.animationFrameId);
    }
    assert(scoreAtCancel !== null, 'restart path must call cancelAnimationFrame');
    assertEquals(
      scoreAtCancel,
      77,
      'cancelAnimationFrame must run before resetGame clears the score'
    );
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

    assertEquals(
      graceAfterEnter,
      GAME_CONFIG.GRACE_FRAMES,
      'first visit should arm the full countdown'
    );
    assertEquals(
      stateAfter,
      STATE.WAITING,
      'Space/Tap during the first countdown should leave the game in WAITING'
    );
    assertEquals(
      graceAfter,
      graceAfterEnter,
      'Space/Tap during the first countdown should not consume grace frames'
    );
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

    assertEquals(stateAfterRestart, STATE.WAITING, 'restart after death should land in GET READY');
    assert(
      graceAfterRestart > 0,
      'restart after death should still show a countdown until the player skips'
    );
    assertEquals(skipAfterRestart, true, 'restart after death should mark the countdown skippable');
    assertEquals(
      stateAfterSkip,
      STATE.RUNNING,
      'Space/Tap during post-death GET READY should start the run immediately'
    );
    assertEquals(
      jumpingAfterSkip,
      false,
      'the skip press should start the run without also jumping'
    );
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

    assertEquals(
      stateAfterSkip,
      STATE.RUNNING,
      'Classic mode should skip GET READY after death the same way Updated does'
    );
  });

  it('first-run overlay does not promise a jump', () => {
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;

    game.countdownSkippable = false;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    const calls = overlayText();

    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;

    assert(
      calls.some((t) => t === 'GET READY'),
      `Expected 'GET READY', got: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some((t) => t === 'Press Space / Tap to jump'),
      'first-run overlay must not say Press Space / Tap to jump'
    );
    assert(
      !calls.some((t) => /space|tap/i.test(t)),
      `first-run overlay must not mention Space or Tap, got: ${JSON.stringify(calls)}`
    );
  });

  it('post-death overlay says Space or Tap starts the run', () => {
    const origGrace = game.graceFrames;
    const origSkip = game.countdownSkippable;

    game.countdownSkippable = true;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
    const calls = overlayText();

    game.graceFrames = origGrace;
    game.countdownSkippable = origSkip;

    assert(
      calls.some((t) => t === 'GET READY'),
      `Expected 'GET READY', got: ${JSON.stringify(calls)}`
    );
    assert(
      calls.some((t) => t === 'Press Space / Tap to start'),
      `Expected 'Press Space / Tap to start', got: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some((t) => t === 'Press Space / Tap to jump'),
      'post-death overlay must not tell the player to jump'
    );
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

    assert(!/jump/i.test(firstRun), `first countdown must not announce a jump, got: ${firstRun}`);
    assert(
      /space or tap to start/i.test(afterDeath),
      `post-death countdown should announce space or tap to start, got: ${afterDeath}`
    );
  });
});

describe('Sim clock (60Hz)', () => {
  function cancelLoop() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  }

  function rngTrace(drive) {
    const origMode = game.mode;
    setReducedMotion(false);
    game.mode = MODES.DAILY;
    resetGame();
    cancelLoop();
    const seeded = game.rng;
    const seen = [];
    game.rng = () => {
      const value = seeded();
      seen.push(value);
      return value;
    };
    game.state = STATE.RUNNING;
    // Park the dino above the lane so the sample is not cut short by a hit.
    // A grounded run dies before the second spawn, and both clocks would
    // then show the same single roll.
    dino.y = -500;
    dino.isJumping = false;
    try {
      drive();
    } finally {
      game.rng = seeded;
      game.mode = origMode;
      setReducedMotion(false);
      cancelLoop();
    }
    return seen;
  }

  it('a timestamp-free call is one slice and does not spend a banked partial frame', () => {
    resetSimClock();
    assertEquals(
      simStepsForFrame(0),
      1,
      'the first stamped frame anchors the clock and steps once'
    );
    assertEquals(simStepsForFrame(SIM_FRAME_MS / 2), 0, 'half a slice banks and does not step');
    assertEquals(simStepsForFrame(), 1, 'a direct gameLoop() call is still one slice');
    assertEquals(
      simStepsForFrame(SIM_FRAME_MS / 2 + SIM_FRAME_MS),
      1,
      'the banked half plus the next full slice is one step'
    );
    assertEquals(
      simStepsForFrame(SIM_FRAME_MS + SIM_FRAME_MS),
      1,
      'the leftover half plus another half completes the next slice'
    );
    resetSimClock();
  });

  it('same timestamp or a backwards timestamp does not step', () => {
    resetSimClock();
    assertEquals(simStepsForFrame(1000), 1);
    assertEquals(simStepsForFrame(1000), 0, 'a duplicate rAF timestamp owes nothing');
    assertEquals(simStepsForFrame(999), 0, 'time going backwards owes nothing');
    resetSimClock();
  });

  it('a long hitch is capped and the next frame is not a second burst', () => {
    resetSimClock();
    assertEquals(simStepsForFrame(0), 1);
    assertEquals(
      simStepsForFrame(SIM_FRAME_MS * 40),
      MAX_SIM_STEPS,
      'catch-up stops at MAX_SIM_STEPS'
    );
    assertEquals(
      simStepsForFrame(SIM_FRAME_MS * 40 + SIM_FRAME_MS),
      1,
      'dropped hitch time must not burst on the following frame'
    );
    resetSimClock();
  });

  it('live-tuning cannot change the slice length', () => {
    const prev = window.GAME_TUNING;
    window.GAME_TUNING = Object.assign({}, prev, { SIM_FRAME_MS: 1 });
    try {
      resetSimClock();
      assertEquals(simStepsForFrame(0), 1);
      assertEquals(
        simStepsForFrame(SIM_FRAME_MS / 2),
        0,
        'a half slice stays banked even if a tune claims the slice is 1ms'
      );
    } finally {
      window.GAME_TUNING = prev;
      resetSimClock();
    }
  });

  it('resetGame drops a banked hitch so the next run does not fast-forward', () => {
    resetSimClock();
    assertEquals(simStepsForFrame(0), 1);
    assertEquals(simStepsForFrame(SIM_FRAME_MS / 2), 0);
    resetGame();
    cancelLoop();
    assertEquals(
      simStepsForFrame(5000),
      1,
      'the first frame of a new run is one slice, not the old hitch'
    );
    cancelLoop();
    resetSimClock();
  });

  it('120Hz display frames advance score, grace, jump, and shake at the 60Hz slice', () => {
    const origMode = game.mode;
    const origState = game.state;
    const origY = dino.y;
    const origVy = dino.velocityY;
    const origJump = dino.isJumping;
    try {
      game.mode = MODES.CLASSIC;
      resetGame();
      cancelLoop();
      game.state = STATE.WAITING;
      game.graceFrames = 10;
      resetSimClock();
      gameLoop(0);
      assertEquals(game.graceFrames, 9, 'the anchor frame spends one countdown slice');
      gameLoop(SIM_FRAME_MS / 2);
      assertEquals(
        game.graceFrames,
        9,
        'a 120Hz half-frame must not spend another countdown slice'
      );
      gameLoop(SIM_FRAME_MS);
      assertEquals(game.graceFrames, 8);

      game.state = STATE.RUNNING;
      game.score = 0;
      dino.isJumping = true;
      dino.velocityY = GAME_CONFIG.JUMP_POWER;
      dino.y = 80;
      const yBefore = dino.y;
      const vBefore = dino.velocityY;
      gameLoop(SIM_FRAME_MS + SIM_FRAME_MS / 2);
      assertEquals(dino.y, yBefore, 'jump height waits for a full slice');
      assertEquals(dino.velocityY, vBefore, 'gravity waits for a full slice');
      gameLoop(SIM_FRAME_MS * 2);
      assert(dino.y !== yBefore, 'the next full slice applies gravity');

      game.state = STATE.DEAD;
      Animations.deathShakeFrames = 6;
      const shakeAt = Animations.deathShakeFrames;
      gameLoop(SIM_FRAME_MS * 2 + SIM_FRAME_MS / 2);
      assertEquals(
        Animations.deathShakeFrames,
        shakeAt,
        'death shake is frame-tied juice and waits for a slice'
      );
      gameLoop(SIM_FRAME_MS * 3);
      assertEquals(Animations.deathShakeFrames, shakeAt - 1);
    } finally {
      dino.y = origY;
      dino.velocityY = origVy;
      dino.isJumping = origJump;
      game.mode = origMode;
      game.state = origState;
      Animations.deathShakeFrames = 0;
      cancelLoop();
      resetGame();
      cancelLoop();
    }
  });

  it('a 120Hz second matches a 60Hz second of score in Classic and Updated', () => {
    const origMode = game.mode;
    function scoreFor(mode, frames, dt) {
      game.mode = mode;
      resetGame();
      cancelLoop();
      game.state = STATE.RUNNING;
      game.score = 0;
      let t = 0;
      for (let i = 0; i < frames; i++) {
        gameLoop(t);
        t += dt;
      }
      cancelLoop();
      return game.score;
    }
    try {
      const classicFast = scoreFor(MODES.CLASSIC, 120, SIM_FRAME_MS / 2);
      const updatedFast = scoreFor(MODES.UPDATED, 120, SIM_FRAME_MS / 2);
      const classic60 = scoreFor(MODES.CLASSIC, 60, SIM_FRAME_MS);
      const expected = GAME_CONFIG.SCORE_INCREMENT * 60;
      assert(
        Math.abs(classicFast - expected) < 1e-9,
        '120 display frames at 120Hz are 60 sim slices'
      );
      assertEquals(updatedFast, classicFast, 'Updated keeps the same sim clock as Classic');
      assertEquals(classic60, classicFast, '60Hz stamps match the 120Hz wall-clock second');
      assertEquals(game.state, STATE.RUNNING, 'the sample run must not die early');
    } finally {
      game.mode = origMode;
      cancelLoop();
      resetGame();
      cancelLoop();
    }
  });

  it('60Hz stamps roll the same daily rng sequence as one call per slice', () => {
    const frames = 240;
    const plain = rngTrace(() => {
      for (let i = 0; i < frames; i++) gameLoop();
    });
    const stamped = rngTrace(() => {
      let t = 0;
      for (let i = 0; i < frames; i++) {
        gameLoop(t);
        t += SIM_FRAME_MS;
      }
    });
    assert(plain.length > 2, 'the sample must reach a second seeded roll');
    assertEquals(
      stamped.join('|'),
      plain.join('|'),
      'a 60Hz rAF stream must not change hill or spawn rolls versus one slice per call'
    );
    const fast = rngTrace(() => {
      let t = 0;
      for (let i = 0; i < frames; i++) {
        gameLoop(t);
        t += SIM_FRAME_MS / 2;
      }
    });
    assert(
      fast.length < plain.length,
      'twice as many animation frames must not roll rng twice as often'
    );
    cancelLoop();
    resetGame();
    cancelLoop();
  });

  it('a display frame that owes no slice does not redraw or emit', () => {
    const origState = game.state;
    const origScore = game.score;
    const origFill = ctx.fillText;
    try {
      setQaFlag('hz', false);
      resetSimClock();
      game.state = STATE.RUNNING;
      game.score = 4;
      gameLoop(0);
      const texts = [];
      ctx.fillText = (text) => {
        texts.push(String(text));
      };
      gameLoop(SIM_FRAME_MS / 2);
      assertEquals(texts.length, 0, 'a banked half-frame must not repaint the HUD');
      assertEquals(
        game.score,
        4 + GAME_CONFIG.SCORE_INCREMENT,
        'score advances only on the slice that was owed'
      );
    } finally {
      ctx.fillText = origFill;
      setQaFlag('hz', false);
      game.state = origState;
      game.score = origScore;
      cancelLoop();
      resetSimClock();
    }
  });

  it('runs one update per owed slice, then draws once (C5)', () => {
    const steps = STATE_STEPS[STATE.RUNNING];
    const origUpdate = steps.update;
    const origDraw = steps.draw;
    const origState = game.state;
    const log = [];
    steps.update = () => log.push('update');
    steps.draw = () => log.push('draw');
    try {
      cancelAnimationFrame(game.animationFrameId);
      resetSimClock();
      game.state = STATE.RUNNING;
      gameLoop(1000);
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(log.join(','), 'update,draw', 'the first timestamp is one slice');
      log.length = 0;
      gameLoop(1000 + 2 * SIM_FRAME_MS);
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(log.join(','), 'update,update,draw', 'two owed slices paint once');
      log.length = 0;
      gameLoop(1000 + 2 * SIM_FRAME_MS + 1);
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(log.length, 0, 'a frame that owes no slice neither updates nor draws');
    } finally {
      steps.update = origUpdate;
      steps.draw = origDraw;
      game.state = origState;
      resetSimClock();
      cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('draw steps never move a timer, so one paint per display frame is safe (C5)', () => {
    const snap = () =>
      JSON.stringify({
        anim: Object.keys(Animations)
          .filter((k) => typeof Animations[k] === 'number')
          .map((k) => [k, Animations[k]]),
        score: game.score,
        frame: game.animFrame,
        grace: game.graceFrames,
        holds: Object.keys(game)
          .filter((k) => /^qa.*(Hold|Shown)$/.test(k))
          .map((k) => [k, game[k]]),
      });
    const origMode = game.mode;
    try {
      for (const mode of [MODES.CLASSIC, MODES.UPDATED]) {
        game.mode = mode;
        for (const state of [STATE.IDLE, STATE.WAITING, STATE.RUNNING, STATE.DEAD]) {
          resetGame();
          cancelAnimationFrame(game.animationFrameId);
          game.state = state;
          game.score = 150;
          Animations.milestoneFrames = 10;
          Animations.newBestFrames = 10;
          if (state === STATE.DEAD) {
            Animations.deathShakeFrames = 3;
            Animations.deathFlashFrames = 2;
            Animations.scorePopFrames = 3;
          }
          const before = snap();
          drawFrame();
          assertEquals(snap(), before, `${mode} ${state} draw leaves every timer alone`);
        }
      }
    } finally {
      game.mode = origMode;
      Animations.reset();
      cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('keeps every canvas call out of the update steps (C5)', () => {
    const names = ['fillRect', 'drawImage', 'fillText', 'translate', 'scale', 'save'];
    const orig = {};
    let calls = 0;
    for (const n of names) {
      orig[n] = ctx[n];
      ctx[n] = () => {
        calls++;
      };
    }
    const origState = game.state;
    try {
      for (const state of [STATE.IDLE, STATE.WAITING, STATE.RUNNING, STATE.DEAD]) {
        resetGame();
        cancelAnimationFrame(game.animationFrameId);
        game.state = state;
        if (state === STATE.DEAD) Animations.deathShakeFrames = 3;
        calls = 0;
        STATE_STEPS[state].update();
        assertEquals(calls, 0, `${state} update paints nothing`);
        game.state = state;
        STATE_STEPS[state].draw();
        assert(calls > 0, `${state} draw paints`);
      }
    } finally {
      for (const n of names) ctx[n] = orig[n];
      Animations.reset();
      game.state = origState;
      cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Variable jump and fast fall (F3)', () => {
  const f3Step = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const f3Start = () => {
    resetGame();
    game.state = STATE.RUNNING;
    game.graceFrames = 100000; // no obstacles
  };
  // Jump, let go after `holdSlices` (Infinity = never), and fly to landing.
  // Returns { air, peak } in slices and px above the ground.
  const f3Flight = (holdSlices, dropAt) => {
    f3Start();
    const groundY = GAME_CONFIG.CANVAS_H - dino.height;
    handleAction();
    let air = 0;
    let peak = 0;
    while (dino.isJumping && air < 200) {
      if (air === holdSlices) releaseJump();
      if (air === dropAt) dropDino();
      f3Step();
      air++;
      peak = Math.max(peak, groundY - dino.y);
    }
    return { air, peak };
  };
  const f3Key = (code) => ({ code, target: null, preventDefault() {} });

  it('physics values live in GAME_CONFIG', () => {
    assertEquals(GAME_CONFIG.JUMP_CUT_VELOCITY, -5);
    assertEquals(GAME_CONFIG.JUMP_MIN_HEIGHT, 50);
    assertEquals(GAME_CONFIG.FAST_FALL_START_VELOCITY, 2);
    assertEquals(GAME_CONFIG.FAST_FALL_GRAVITY, 1.44);
    for (const key of [
      'JUMP_CUT_VELOCITY',
      'JUMP_MIN_HEIGHT',
      'FAST_FALL_START_VELOCITY',
      'FAST_FALL_GRAVITY',
    ]) {
      assert(!TUNABLE_KEYS.includes(key), `${key} is never tunable through cfg()`);
    }
  });

  // Classic keeps the plain 49-slice arc; Updated and Daily add hang time
  // near the peak (M1) to a lower take-off (M4): a 46-slice held jump.
  const f3InMode = (mode, fn) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      return fn();
    } finally {
      game.mode = origMode;
    }
  };
  // Updated and Daily: the lower take-off (M4) plus hang time (M1).
  const f3FullAir = () => (game.mode === MODES.CLASSIC ? 49 : 46);

  it('a held press is the same full jump as before (49 slices in Classic)', () => {
    const full = f3InMode(MODES.CLASSIC, () => f3Flight(Infinity));
    assertEquals(full.air, 49);
    assert(full.peak > 140, 'full height');
  });

  it('a quick tap is a short hop that still clears the tallest obstacle', () => {
    const hop = f3Flight(0);
    assert(hop.air < f3FullAir() && hop.air > 28, `hop airtime ${hop.air}`);
    assert(hop.peak > 70 && hop.peak < 90, `hop peak ${hop.peak}`);
    const bigCactus = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');
    assert(hop.peak > bigCactus.height, 'higher than the big cactus');
  });

  it('releasing later gives a jump between a hop and a full jump', () => {
    const hop = f3Flight(0).air;
    // Updated's lower take-off (M4) slows under the cut speed sooner.
    const mid = f3Flight(game.mode === MODES.CLASSIC ? 10 : 8).air;
    assert(mid > hop && mid < f3FullAir(), `mid ${mid}`);
  });

  it('releasing on the way down changes nothing', () => {
    assertEquals(f3Flight(30).air, f3FullAir());
  });

  it('fast fall lands sooner and clears the drop on landing', () => {
    const dropped = f3Flight(Infinity, 24);
    assert(dropped.air < 40, `dropped airtime ${dropped.air}`);
    assert(!dino.dropping, 'dropping ends on landing');
  });

  it('fast fall drops a buffered jump and does nothing on the ground', () => {
    f3Start();
    dropDino();
    assert(!dino.dropping && !dino.isJumping, 'no effect on the ground');
    handleAction();
    for (let i = 0; i < 10; i++) f3Step();
    handleAction(); // buffered
    dropDino();
    assertEquals(dino.jumpBufferFrames, 0, 'buffer cleared');
    assert(dino.velocityY >= GAME_CONFIG.FAST_FALL_START_VELOCITY, 'stops rising');
    resetGame();
  });

  it('keyboard: Down or S drops, letting go of Space ends the hold', () => {
    f3Start();
    handleKeyDown(f3Key('Space'));
    assert(dino.isJumping && dino.jumpHeld, 'held');
    handleKeyUp(f3Key('Space'));
    assert(!dino.jumpHeld, 'released');
    for (const code of ['ArrowDown', 'KeyS']) {
      f3Start();
      handleKeyDown(f3Key('Space'));
      // Past the slide-cancel window (M6), Down is a fast fall.
      for (let i = 0; i <= GAME_CONFIG.SLIDE_CANCEL_FRAMES; i++) f3Step();
      handleKeyDown(f3Key(code));
      assert(dino.dropping, `${code} drops`);
    }
    resetGame();
  });

  it('mouse jumps on press and only the main button counts', () => {
    f3Start();
    handleMouseDown({ button: 2 });
    assert(!dino.isJumping, 'right button ignored');
    handleMouseDown({ button: 0 });
    assert(dino.isJumping && dino.jumpHeld, 'main button jumps and holds');
    releaseJump();
    assert(!dino.jumpHeld);
    resetGame();
  });

  it('touch: a swipe down drops once, lifting the last finger releases', () => {
    f3Start();
    handleAction();
    for (let i = 0; i <= GAME_CONFIG.SLIDE_CANCEL_FRAMES; i++) f3Step();
    handleSwipeStart({ touches: [{ clientY: 100 }] });
    handleSwipeMove({ touches: [{ clientY: 120 }] });
    assert(!dino.dropping, 'a small move is not a swipe');
    handleSwipeMove({ touches: [{ clientY: 135 }] });
    assert(dino.dropping, 'swipe down drops');
    handleTouchEnd({ touches: [{}] });
    assert(dino.jumpHeld, 'a finger is still down');
    handleTouchEnd({ touches: [] });
    assert(!dino.jumpHeld, 'last finger lifted');
    resetGame();
  });

  it('the jump button: mouse acts on press, keyboard activation is a tap', () => {
    f3Start();
    handleJumpButtonClick({ detail: 1 }); // mouse click: already acted on mousedown
    assert(!dino.isJumping, 'a mouse click does not jump twice');
    handleJumpButtonClick({ detail: 0 }); // Space/Enter on the focused button
    assert(dino.isJumping, 'keyboard activation jumps');
    assert(!dino.jumpHeld, 'and is a finished tap, not a held jump');
    resetGame();
  });

  it('a new run starts with nothing held or dropping', () => {
    dino.jumpHeld = true;
    dino.dropping = true;
    resetGame();
    assert(!dino.jumpHeld && !dino.dropping);
  });
});

describe('Hang time (M1)', () => {
  const m1Flight = (mode, dropAt) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      resetGame();
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      const groundY = GAME_CONFIG.CANVAS_H - dino.height;
      handleAction();
      let air = 0;
      let peak = 0;
      let slowSlices = 0;
      while (dino.isJumping && air < 200) {
        if (air === dropAt) dropDino();
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        air++;
        peak = Math.max(peak, groundY - dino.y);
        if (dino.isJumping && Math.abs(dino.velocityY) < GAME_CONFIG.HANG_VELOCITY) slowSlices++;
      }
      return { air, peak, slowSlices };
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  };

  it('hang values are gameplay values, never tunable', () => {
    assert(
      GAME_CONFIG.HANG_GRAVITY_SCALE > 0 && GAME_CONFIG.HANG_GRAVITY_SCALE < 1,
      'scale eases gravity'
    );
    for (const key of ['HANG_VELOCITY', 'HANG_GRAVITY_SCALE']) {
      assert(!TUNABLE_KEYS.includes(key), `${key} is never tunable through cfg()`);
    }
  });

  it('Updated and Daily float near the peak; Classic keeps the plain arc', () => {
    const classic = m1Flight(MODES.CLASSIC);
    const updated = m1Flight(MODES.UPDATED);
    const daily = m1Flight(MODES.DAILY);
    assertEquals(classic.air, 49);
    // Updated and Daily also take off lower (M4): about 93px up, not 144.
    assertEquals(updated.air, 46);
    assertEquals(daily.air, 46);
    assert(updated.slowSlices > classic.slowSlices, 'more slices spent slow near the peak');
    assert(
      updated.peak > 88 && updated.peak < 98,
      `peak about 93px (${updated.peak} vs ${classic.peak})`
    );
  });

  it('the longer jump still fits inside the Updated minimum gap', () => {
    assert(
      m1Flight(MODES.UPDATED).air < GAME_CONFIG.UPDATED_MIN_GAP_FRAMES,
      'gap floor still covers a jump'
    );
  });

  it('a fast fall skips the hang', () => {
    const origMode = game.mode;
    game.mode = MODES.UPDATED;
    try {
      dino.dropping = true;
      dino.velocityY = 0.5;
      assertEquals(airGravity(), GAME_CONFIG.FAST_FALL_GRAVITY);
      dino.dropping = false;
      assertEquals(airGravity(), dino.gravity * GAME_CONFIG.HANG_GRAVITY_SCALE);
      dino.velocityY = 5;
      assertEquals(airGravity(), dino.gravity);
    } finally {
      game.mode = origMode;
      dino.dropping = false;
      dino.velocityY = 0;
    }
  });
});

describe('Second jump (M3)', () => {
  const m3Step = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const m3Run = (mode, fn) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      fn();
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  };
  const m3Fly = () => {
    let n = 0;
    let top = dino.y;
    while (dino.isJumping && n < 300) {
      m3Step();
      n++;
      top = Math.min(top, dino.y);
    }
    return { n, top };
  };

  it('second-jump values are gameplay values, never tunable', () => {
    assert(GAME_CONFIG.DOUBLE_JUMP_POWER < 0, 'upward');
    for (const key of ['DOUBLE_JUMP_POWER', 'CEILING_Y']) {
      assert(!TUNABLE_KEYS.includes(key), `${key} is never tunable through cfg()`);
    }
  });

  it('a second press in the air jumps again once, and lands later', () => {
    m3Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 30; i++) m3Step();
      assert(dino.velocityY > 0, 'falling when the second press comes');
      handleAction();
      assert(dino.doubleJumped, 'second jump spent');
      assert(dino.velocityY < 0, 'rising again');
      assert(dino.velocityY >= GAME_CONFIG.DOUBLE_JUMP_POWER, 'no faster than DOUBLE_JUMP_POWER');
      assertEquals(dino.flipFrames, GAME_CONFIG.DOUBLE_JUMP_FLIP_FRAMES);
      m3Step();
      const vy = dino.velocityY;
      handleAction();
      assert(dino.velocityY >= vy, 'no third jump');
      const { n } = m3Fly();
      assert(30 + 1 + n > 60, `longer flight ${30 + 1 + n}`);
      assert(!dino.doubleJumped && dino.flipFrames === 0, 'landing restores it');
    });
  });

  it('the dino never rises above the ceiling', () => {
    m3Run(MODES.UPDATED, () => {
      handleAction();
      let n = 0;
      while (dino.velocityY < -1 && n++ < 100) m3Step();
      handleAction();
      const { top } = m3Fly();
      assert(top >= GAME_CONFIG.CEILING_Y, `top ${top}`);
    });
  });

  it('Classic has no second jump', () => {
    m3Run(MODES.CLASSIC, () => {
      handleAction();
      for (let i = 0; i < 20; i++) m3Step();
      const vy = dino.velocityY;
      handleAction();
      assert(!dino.doubleJumped, 'not spent');
      assertEquals(dino.velocityY, vy, 'no change in Classic');
    });
  });

  it('a held key auto-repeat only buffers', () => {
    m3Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 20; i++) m3Step();
      handleKeyDown({ code: 'Space', repeat: true, target: null, preventDefault() {} });
      assert(!dino.doubleJumped, 'repeat did not spend the second jump');
      assertEquals(dino.jumpBufferFrames, GAME_CONFIG.JUMP_BUFFER_FRAMES, 'repeat buffers');
    });
  });

  it('a held key auto-repeat on the ground is a full held jump', () => {
    m3Run(MODES.CLASSIC, () => {
      // Space held through the countdown: RUNNING starts with jumpHeld false.
      dino.jumpHeld = false;
      handleKeyDown({ code: 'Space', repeat: true, target: null, preventDefault() {} });
      assert(dino.isJumping && dino.jumpHeld, 'jumps and counts as held');
      const { n } = m3Fly();
      assertEquals(n, 49, 'full jump, not a short hop');
    });
  });

  it('a second jump cancels a fast fall', () => {
    m3Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 26; i++) m3Step();
      dropDino();
      assert(dino.dropping, 'dropping');
      handleAction();
      assert(dino.doubleJumped && !dino.dropping, 'second jump stops the drop');
    });
  });
});

describe('Slide and low birds (M6)', () => {
  const m6Step = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const m6Run = (mode, fn) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      fn();
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  };
  const bird = () => GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'bird');
  const birdAtDino = () => {
    spawnObstacle(bird());
    const obs = game.obstacles[game.obstacles.length - 1];
    obs.x = dino.x + 5;
    return obs;
  };

  it('slide values are gameplay values, never tunable', () => {
    for (const key of ['SLIDE_FRAMES', 'SLIDE_HEIGHT', 'SLIDE_CANCEL_FRAMES']) {
      assert(!TUNABLE_KEYS.includes(key), `${key} is never tunable through cfg()`);
    }
  });

  it('Down on the ground slides for SLIDE_FRAMES with a low hitbox, then stands', () => {
    m6Run(MODES.UPDATED, () => {
      dropDino();
      assertEquals(dino.slideFrames, GAME_CONFIG.SLIDE_FRAMES);
      const box = dinoHitbox();
      assertEquals(box.height, GAME_CONFIG.SLIDE_HEIGHT);
      assertEquals(box.y + box.height, dino.y + dino.height, 'feet stay on the ground');
      for (let i = 0; i < GAME_CONFIG.SLIDE_FRAMES; i++) m6Step();
      assertEquals(dino.slideFrames, 0);
      assertEquals(dinoHitbox(), dino, 'standing box again');
    });
  });

  it('holding Down keeps sliding; a jump ends the slide', () => {
    m6Run(MODES.UPDATED, () => {
      dropDino();
      for (let i = 0; i < 20; i++) m6Step();
      handleKeyDown({ code: 'ArrowDown', repeat: true, target: null, preventDefault() {} });
      assertEquals(dino.slideFrames, GAME_CONFIG.SLIDE_FRAMES, 'topped up');
      handleAction();
      assert(dino.isJumping && dino.slideFrames === 0, 'jumped out of the slide');
    });
  });

  it('Down just after a take-off cancels the jump into a slide (phone swipe)', () => {
    m6Run(MODES.UPDATED, () => {
      handleAction();
      m6Step();
      m6Step();
      dropDino();
      assert(!dino.isJumping, 'back on the ground');
      assertEquals(dino.y, GAME_CONFIG.CANVAS_H - dino.height);
      assertEquals(dino.slideFrames, GAME_CONFIG.SLIDE_FRAMES);
    });
  });

  it('standing hits a low bird; sliding passes under it; jumping clears it', () => {
    m6Run(MODES.UPDATED, () => {
      const obs = birdAtDino();
      assert(checkCollision(dinoHitbox(), obs), 'standing dino hits the bird');
      dropDino();
      assert(!checkCollision(dinoHitbox(), obs), 'sliding dino passes under');
      dino.slideFrames = 0;
      dino.y = obs.y - dino.height;
      assert(!checkCollision(dinoHitbox(), obs), 'a dino above it clears it');
      assert(GAME_CONFIG.CANVAS_H - obs.y - obs.height === bird().lift, 'flies lift px up');
    });
  });

  it('Classic has no slide and never rolls a bird', () => {
    m6Run(MODES.CLASSIC, () => {
      dropDino();
      assertEquals(dino.slideFrames, 0);
      const rng = mulberry32(7);
      for (let i = 0; i < 500; i++) {
        assert(
          DifficultyProfile.nextObstacle(600, MODES.CLASSIC, rng).type.id !== 'bird',
          'no bird'
        );
      }
    });
  });

  it('birds appear in Updated only from their unlock score', () => {
    const rng = mulberry32(11);
    const unlock = bird().unlockScore;
    const before = new Set();
    const after = new Set();
    for (let i = 0; i < 2000; i++) {
      before.add(DifficultyProfile.nextObstacle(unlock - 1, MODES.UPDATED, rng).type.id);
      after.add(DifficultyProfile.nextObstacle(unlock, MODES.UPDATED, rng).type.id);
    }
    assert(!before.has('bird') && after.has('bird'), 'unlocks at its score');
  });
});

describe('Lower first jump and cactus towers (M4)', () => {
  const m4Step = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const m4Run = (mode, fn) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      return fn();
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  };
  const m4Type = (id) => GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === id);
  // A ground obstacle of `type` right under the dino.
  const m4Under = (type) => ({
    x: dino.x,
    y: GAME_CONFIG.CANVAS_H - type.height,
    width: type.width,
    height: type.height,
  });
  // Fly one held jump (optionally a second jump at slice `second`, or at the
  // top when second is 'peak') and return the highest dino box seen.
  const m4Top = (second) => {
    handleAction();
    let top = null;
    for (let i = 0; i < 200 && dino.isJumping; i++) {
      const atPeak = second === 'peak' && dino.velocityY >= -1;
      if (!dino.doubleJumped && (i === second || atPeak)) handleAction();
      m4Step();
      if (!top || dino.y < top.y) top = Object.assign({}, dinoHitbox());
    }
    return top;
  };

  it('the Updated take-off speed is a gameplay value, never tunable', () => {
    assert(GAME_CONFIG.UPDATED_JUMP_POWER < 0, 'upward');
    assert(GAME_CONFIG.UPDATED_JUMP_POWER > GAME_CONFIG.JUMP_POWER, 'slower than Classic');
    assert(!TUNABLE_KEYS.includes('UPDATED_JUMP_POWER'), 'never tunable through cfg()');
  });

  it('Classic takes off at JUMP_POWER; Updated and Daily at UPDATED_JUMP_POWER', () => {
    for (const [mode, power] of [
      [MODES.CLASSIC, GAME_CONFIG.JUMP_POWER],
      [MODES.UPDATED, GAME_CONFIG.UPDATED_JUMP_POWER],
      [MODES.DAILY, GAME_CONFIG.UPDATED_JUMP_POWER],
    ]) {
      m4Run(mode, () => {
        handleAction();
        assertEquals(dino.velocityY, power, mode);
      });
    }
  });

  it('a full Updated jump still clears every other ground obstacle', () => {
    m4Run(MODES.UPDATED, () => {
      const top = m4Top();
      for (const id of ['small', 'big', 'cluster']) {
        assert(!checkCollision(top, m4Under(m4Type(id))), `clears ${id}`);
      }
    });
  });

  it('a full first jump cannot clear a tower; a second jump near the top can', () => {
    const single = m4Run(MODES.UPDATED, () => m4Top());
    const double = m4Run(MODES.UPDATED, () => m4Top('peak'));
    const early = m4Run(MODES.UPDATED, () => m4Top(10));
    const tower = m4Type('tower');
    m4Run(MODES.UPDATED, () => {
      assert(checkCollision(single, m4Under(tower)), 'one jump hits the tower');
      assert(!checkCollision(double, m4Under(tower)), 'a second jump at the top clears it');
      assert(!checkCollision(early, m4Under(tower)), 'an earlier second jump clears it too');
    });
  });

  it('Classic never rolls a tower; Updated rolls it from its unlock score', () => {
    const rng = mulberry32(21);
    const unlock = m4Type('tower').unlockScore;
    const classic = new Set();
    const before = new Set();
    const after = new Set();
    for (let i = 0; i < 2000; i++) {
      classic.add(DifficultyProfile.nextObstacle(900, MODES.CLASSIC, rng).type.id);
      before.add(DifficultyProfile.nextObstacle(unlock - 1, MODES.UPDATED, rng).type.id);
      after.add(DifficultyProfile.nextObstacle(unlock, MODES.UPDATED, rng).type.id);
    }
    assert(!classic.has('tower'), 'never in Classic');
    assert(!before.has('tower') && after.has('tower'), 'unlocks at its score');
  });

  it('a tower stands on the ground', () => {
    m4Run(MODES.UPDATED, () => {
      spawnObstacle(m4Type('tower'));
      const obs = game.obstacles[game.obstacles.length - 1];
      assertEquals(obs.y + obs.height, GAME_CONFIG.CANVAS_H);
    });
  });
});

describe('Air dash and long cactus rows (M5)', () => {
  const m5Step = () => {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  };
  const m5Run = (mode, fn) => {
    const origMode = game.mode;
    game.mode = mode;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      return fn();
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  };
  const m5Row = () => GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'row');
  // Jump `lead` frames before a fresh row reaches the dino at `score`'s
  // speed, dash at the top when asked, and report whether the run survived.
  const m5Cross = (score, lead, dash) =>
    m5Run(MODES.UPDATED, () => {
      game.score = score;
      runSimFrame(); // update only: no drawing, quick in the browser
      spawnObstacle(m5Row());
      const obs = game.obstacles[game.obstacles.length - 1];
      obs.x = dino.x + dino.width + game.currentSpeed * lead;
      handleAction();
      for (let i = 0; i < 300 && game.state === STATE.RUNNING; i++) {
        if (dash && !dino.dashed && dino.velocityY >= -1) dashDino();
        runSimFrame(); // update only: no drawing, quick in the browser
        if (obs.x + obs.width < dino.x && !dino.isJumping) break;
      }
      return game.state === STATE.RUNNING;
    });

  it('dash values are gameplay values, never tunable', () => {
    for (const key of ['DASH_FRAMES', 'DASH_BOOST', 'ROW_MARGIN_FRAMES', 'ROW_CACTUS_GAP']) {
      assert(!TUNABLE_KEYS.includes(key), `${key} is never tunable through cfg()`);
    }
  });

  it('a dash holds the height and speeds the world for DASH_FRAMES, once per flight', () => {
    m5Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 10; i++) m5Step();
      dashDino();
      assert(dino.dashed, 'dash spent');
      assertEquals(worldScroll(), game.currentSpeed + GAME_CONFIG.DASH_BOOST);
      const y = dino.y;
      for (let i = 0; i < GAME_CONFIG.DASH_FRAMES; i++) {
        m5Step();
        assertEquals(dino.y, y, 'holds height');
      }
      assertEquals(worldScroll(), game.currentSpeed, 'boost ends');
      dashDino();
      assertEquals(dino.dashFrames, 0, 'no second dash in one flight');
      for (let i = 0; i < 200 && dino.isJumping; i++) m5Step();
      assert(!dino.dashed, 'landing gives the dash back');
    });
  });

  it('there is no dash on the ground or in Classic', () => {
    m5Run(MODES.UPDATED, () => {
      dashDino();
      assert(!dino.dashed, 'not on the ground');
    });
    m5Run(MODES.CLASSIC, () => {
      handleAction();
      m5Step();
      dashDino();
      assert(!dino.dashed, 'not in Classic');
    });
  });

  it('Right and D dash in the air; a key auto-repeat does not', () => {
    const key = (code, repeat) => ({ code, repeat, target: null, preventDefault() {} });
    for (const code of ['ArrowRight', 'KeyD']) {
      m5Run(MODES.UPDATED, () => {
        handleAction();
        m5Step();
        handleKeyDown(key(code, true));
        assert(!dino.dashed, `${code} repeat does not dash`);
        handleKeyDown(key(code, false));
        assert(dino.dashed, `${code} dashes`);
      });
    }
  });

  it('a second jump or a fast fall ends a dash', () => {
    m5Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 10; i++) m5Step();
      dashDino();
      handleAction();
      assert(dino.doubleJumped && dino.dashFrames === 0, 'second jump ends it');
    });
    m5Run(MODES.UPDATED, () => {
      handleAction();
      for (let i = 0; i < 20; i++) m5Step();
      dashDino();
      dropDino();
      assert(dino.dropping && dino.dashFrames === 0, 'fast fall ends it');
    });
  });

  it('a row is too wide for one held jump but a dash at the top crosses it', () => {
    // Every other take-off frame keeps this quick in the browser runner,
    // where each step also draws.
    for (const score of [300, 700]) {
      for (let lead = 0; lead <= 30; lead += 2) {
        assert(
          !m5Cross(score, lead, false),
          `one jump never clears (score ${score}, lead ${lead})`
        );
      }
      let dashed = 0;
      for (let lead = 0; lead <= 30; lead += 2) if (m5Cross(score, lead, true)) dashed++;
      assert(dashed >= 2, `a dash clears it at score ${score} (${dashed} take-off frames work)`);
    }
  });

  it('a row is a whole number of small cacti and widens with speed', () => {
    const small = GAME_CONFIG.OBSTACLE_TYPES[0];
    const step = small.width + GAME_CONFIG.ROW_CACTUS_GAP;
    let last = 0;
    for (let s = 3; s <= 13; s += 0.5) {
      const w = rowWidthForSpeed(s);
      assertEquals((w + GAME_CONFIG.ROW_CACTUS_GAP) % step, 0, `whole cacti at ${s}`);
      assert(w >= m5Row().width && w >= last, `never narrower (${s})`);
      last = w;
    }
  });

  it('Classic never rolls a row; Updated rolls it from its unlock score', () => {
    const rng = mulberry32(31);
    const unlock = m5Row().unlockScore;
    const classic = new Set();
    const before = new Set();
    const after = new Set();
    for (let i = 0; i < 2000; i++) {
      classic.add(DifficultyProfile.nextObstacle(900, MODES.CLASSIC, rng).type.id);
      before.add(DifficultyProfile.nextObstacle(unlock - 1, MODES.UPDATED, rng).type.id);
      after.add(DifficultyProfile.nextObstacle(unlock, MODES.UPDATED, rng).type.id);
    }
    assert(!classic.has('row'), 'never in Classic');
    assert(!before.has('row') && after.has('row'), 'unlocks at its score');
  });
});
