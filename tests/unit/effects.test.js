// Unit tests: effects. Juice drawn on top of the run: particles, dust, flashes, shakes, score pops, badges and pulses.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('effects');

describe('Ambient depth + confetti (PR-D)', () => {
  it('initHills produces HILL_COUNT hills with stable shapes for the same seed', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    // Pin the RNG to a deterministic sequence.
    game.rng = mulberry32(42);
    initHills();
    const snapshot1 = game.hills.map((h) => ({ x: h.x, w: h.width, h: h.height }));
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
    assert(
      hill.x >= GAME_CONFIG.CANVAS_W,
      `Respawned hill x (${hill.x}) should be at/past right edge (${GAME_CONFIG.CANVAS_W})`
    );
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
    const live = Particles.particles.filter((p) => p.life > 0 && p.color === '#ffd700').length;
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
    const gold = Particles.particles.filter((p) => p.life > 0 && p.color === '#ffd700').length;
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
    assertEquals(
      Animations.scorePopFrames,
      GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
      'score pop counter matches the quieter shake'
    );
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

describe('Particles (PR-A)', () => {
  function clearParticles() {
    Particles.reset();
  }

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
    assertEquals(
      n,
      Particles.KINDS.jump.count,
      `jump should emit ${Particles.KINDS.jump.count} particles`
    );
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
    const live = Particles.particles.filter((p) => p.life > 0).length;
    assert(live <= Particles.POOL_SIZE, `Live particles (${live}) should not exceed pool`);
  });

  it('updateParticles decays life to 0 over maxLife frames', () => {
    clearParticles();
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    Particles.emit('jump', 100, 100);
    const live = () => Particles.particles.filter((p) => p.life > 0).length;
    const initial = live();
    assert(initial > 0, 'Should have live particles after emit');
    for (let i = 0; i < Particles.KINDS.jump.life + 1; i++) Particles.update();
    assertEquals(live(), 0, 'All particles should be dead after maxLife frames');
  });

  it('resetGame clears any active particles', () => {
    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    Particles.emit('collision', 100, 100);
    assert(
      Particles.particles.some((p) => p.life > 0),
      'Should have live particles before reset'
    );
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assert(
      Particles.particles.every((p) => p.life === 0),
      'All particles should be dead after reset'
    );
  });
});

describe('Score count-up animation', () => {
  it('resetGame resets deathAnimFrame to 0', () => {
    const origState = game.state;
    const origAnimFrame = Animations.deathAnimFrame;

    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    resetGame();

    const resetFrame = Animations.deathAnimFrame;

    game.state = origState;
    Animations.deathAnimFrame = origAnimFrame;

    assertEquals(resetFrame, 0, 'resetGame should reset deathAnimFrame to 0');
  });

  it('handleAction in DEAD restarts game when animation is complete', () => {
    const origState = game.state;
    const origAnimFrame = Animations.deathAnimFrame;

    game.state = STATE.DEAD;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    handleAction();

    const newState = game.state;

    game.state = origState;
    Animations.deathAnimFrame = origAnimFrame;

    assertEquals(
      newState,
      STATE.WAITING,
      'handleAction after animation completes should transition to STATE.WAITING (via resetGame)'
    );
  });

  it('handleAction in DEAD snaps the Updated count-up to 18 frames when it is still rolling', () => {
    const origState = game.state;
    const origAnimFrame = Animations.deathAnimFrame;
    const origScore = game.score;
    const origMode = game.mode;

    setReducedMotion(false);
    game.mode = MODES.UPDATED;
    game.state = STATE.DEAD;
    Animations.deathAnimFrame = 10;
    game.score = 500;

    handleAction();

    const snappedFrame = Animations.deathAnimFrame;
    const stayedDead = game.state;

    game.state = origState;
    Animations.deathAnimFrame = origAnimFrame;
    game.score = origScore;
    game.mode = origMode;
    setReducedMotion(false);

    assertEquals(
      snappedFrame,
      18,
      'Updated skip should finish the shorter count-up, not the Classic 30'
    );
    assertEquals(stayedDead, STATE.DEAD, 'skipping the count-up should not restart the run');
  });

  it('drawGameOverScreen renders full score when deathAnimFrame equals DEATH_ANIM_FRAMES', () => {
    const origScore = game.score;
    const origNewBest = game.isNewBest;
    const origHS = game.highScore;
    const origAnimFrame = Animations.deathAnimFrame;

    game.score = 500;
    game.isNewBest = false;
    game.highScore = 1000;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.score = origScore;
    game.isNewBest = origNewBest;
    game.highScore = origHS;
    Animations.deathAnimFrame = origAnimFrame;

    assert(
      calls.some((t) => t === '00500'),
      `Expected '00500' (full score at final frame), got: ${JSON.stringify(calls)}`
    );
  });

  it('drawGameOverScreen renders 00000 when deathAnimFrame is 0', () => {
    const origScore = game.score;
    const origNewBest = game.isNewBest;
    const origHS = game.highScore;
    const origAnimFrame = Animations.deathAnimFrame;

    game.score = 500;
    game.isNewBest = false;
    game.highScore = 1000;
    Animations.deathAnimFrame = 0;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.score = origScore;
    game.isNewBest = origNewBest;
    game.highScore = origHS;
    Animations.deathAnimFrame = origAnimFrame;

    assert(
      calls.some((t) => t === '00000'),
      `Expected '00000' (score at frame 0), got: ${JSON.stringify(calls)}`
    );
  });
});

describe('Idle screen pulse animation', () => {
  it('drawIdleScreen renders prompt with different fillStyle alpha at different animFrames', () => {
    const origAnimFrame = game.animFrame;
    const promptStyles = [];

    [0, 40].forEach((frame) => {
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

    assert(
      promptStyles[0] !== promptStyles[1],
      `Expected prompt fillStyle to differ between frame 0 and frame 40, got: ${JSON.stringify(promptStyles)}`
    );
  });
});

describe('Plateau cue', () => {
  // The sigmoid never reaches PLATEAU_SPEED. "Reached the plateau" is the first
  // frame speed hits PLATEAU_REACH_RATIO of that ceiling (~score 641 today).
  function plateauCrossScore() {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT, PLATEAU_REACH_RATIO } =
      GAME_CONFIG;
    const sig =
      (PLATEAU_REACH_RATIO * PLATEAU_SPEED - INITIAL_SPEED) / (PLATEAU_SPEED - INITIAL_SPEED);
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
    setQaFlag('plateau', false);
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
      assert(
        game.plateauCueShown === true,
        'the damped puff still counts as the one cue for the run'
      );
      tick();
      assertEquals(
        plateauParticles().length,
        burst.length,
        'reduced motion must not repeat the cue'
      );
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('recognizes only ?qaPlateau=1', () => {
    assert(readQaFlag('plateau', '?qaPlateau=1') === true, '?qaPlateau=1 should enable the QA cue');
    assert(
      readQaFlag('plateau', '?foo=1&qaPlateau=1') === true,
      'the flag should work alongside other params'
    );
    assert(readQaFlag('plateau', '') === false, 'a normal visit should leave the QA cue off');
    assert(readQaFlag('plateau', '?qaPlateau=0') === false, 'only the value 1 enables the QA cue');
    assert(
      readQaFlag('plateau', '?qaPlateau=12') === false,
      'qaPlateau=12 must not count as the flag'
    );
    assert(
      readQaFlag('plateau', '?other=1') === false,
      'an unrelated param must not enable the QA cue'
    );
  });

  it('with ?qaPlateau=1 fires a darker puff once as soon as the run starts', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      armUpdatedRun(MODES.UPDATED);
      setQaFlag('plateau', true);
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
      assert(
        burst.every((p) => p.size === kind.size),
        'QA specks should use the larger size'
      );
      assert(
        burst.every((p) => p.x < dino.x),
        'QA puff should sit just behind the sprite, not under it'
      );
      assertEquals(plateauParticles().length, 0, 'QA should not also emit the pale night puff');
      assert(game.plateauCueShown === true, 'QA cue still latches after the first puff');
      assert(game.score <= QA_PLATEAU_SCORE + 0.2, 'QA cue should fire at the start of the run');

      tick();
      assertEquals(
        qaPlateauParticles().length,
        burst.length,
        'QA cue must not repeat later in the run'
      );
    } finally {
      setQaFlag('plateau', false);
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
      setQaFlag('plateau', true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      tick();
      assertEquals(plateauParticles().length, 0, 'Classic should ignore the QA flag');
      assertEquals(
        qaPlateauParticles().length,
        0,
        'Classic should not show the day QA puff either'
      );
      assert(!game.plateauCueShown, 'Classic should not latch a QA cue it did not show');
    } finally {
      setQaFlag('plateau', false);
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
      setQaFlag('plateau', true);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assert(qaPlateauParticles().length > 0, 'Daily should show the early QA puff');
      assertEquals(
        plateauParticles().length,
        0,
        'Daily QA should use the day puff, not the night one'
      );
      assert(game.plateauCueShown === true, 'Daily QA cue should still latch');
    } finally {
      setQaFlag('plateau', false);
      setReducedMotion(false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      Particles.reset();
    }
  });

  it('resetGame re-reads ?qaPlateau=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    setPageQuery('?qaPlateau=1');
    try {
      setQaFlag('plateau', false);
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
      assert(
        qaPlateauParticles().length > 0,
        'resetGame should arm the QA puff from location.search'
      );
      assert(game.plateauCueShown === true, 'the re-read flag should still latch after one puff');
    } finally {
      restorePageQuery();
      setQaFlag('plateau', false);
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
      setQaFlag('plateau', false);
      game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
      tick();
      assertEquals(
        plateauParticles().length,
        0,
        'production timing should still wait for the plateau'
      );
      assertEquals(
        qaPlateauParticles().length,
        0,
        'a normal visit should not show the day QA puff'
      );
      assert(!game.plateauCueShown, 'an early production frame must not consume the cue');
    } finally {
      setQaFlag('plateau', false);
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
    jump: {
      count: 3,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.5,
      vyMin: -1.2,
      vyMax: -0.4,
      vxSpread: 0.6,
      gravity: 0.1,
    },
    land: {
      count: 5,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.4,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.7,
      gravity: 0.12,
    },
    trail: {
      count: 1,
      color: 'rgba(150,150,150,0.28)',
      size: 2,
      life: 6,
      vyMin: -0.1,
      vyMax: 0.1,
      vxSpread: 0.2,
      gravity: 0,
    },
    collision: {
      count: 5,
      color: '#d04a2a',
      size: 3,
      life: 8,
      vyMin: -1.2,
      vyMax: 0.4,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    confetti: {
      count: 6,
      color: '#ffd700',
      size: 3,
      life: 12,
      alpha: 0.7,
      vyMin: -1.6,
      vyMax: -0.5,
      vxSpread: 0.7,
      gravity: 0.1,
    },
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
    setQaFlag('plateau', false);
    setQaFlag('night', false);
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
      restore() {
        ctx.fillRect = orig;
      },
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
      ctx.fillRect = () => {
        alphas.push(ctx.globalAlpha);
      };
      Particles.draw();
      ctx.fillRect = orig;
      assertEquals(alphas.length, PUFF.count, 'every mote paints');
      assert(
        alphas.every((a) => a === PUFF.alpha),
        'the first frame paints the soft peak, not solid ink'
      );
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
      setQaFlag('plateau', true);
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
      setQaFlag('plateau', false);
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
      setQaFlag('plateau', true);
      setQaFlag('night', true);
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
      assertEquals(
        fills.length,
        qaPlateauMarks().length,
        'night capture paints the pale heel cluster'
      );
      assert(
        fills.every((fill) => fill.x < dino.x),
        'the pale cluster stays behind the sprite'
      );
      spy.restore();
    } finally {
      setQaFlag('plateau', false);
      setQaFlag('night', false);
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
      setQaFlag('plateau', true);
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
      setQaFlag('plateau', false);
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
        setQaFlag('plateau', true);
        setQaFlag('night', night);
        game.score = QA_PLATEAU_SCORE - GAME_CONFIG.SCORE_INCREMENT;
        tick();
        const color = night ? PUFF.color : QA.color;
        const kind = night ? PUFF : QA;
        const motes = Particles.particles.filter((p) => p.life > 0 && p.color === color);
        const expectedCount = Math.max(1, Math.round(kind.count * 0.25));
        const expectedLife = Math.max(2, Math.round(kind.life * 0.5));
        assertEquals(
          motes.length,
          expectedCount,
          (night ? 'night' : 'day') + ' reduced motion still quarters the puff'
        );
        assert(
          expectedCount < kind.count,
          (night ? 'night' : 'day') + ' damped puff is fewer motes'
        );
        assert(
          motes.every((p) => p.maxLife === expectedLife),
          (night ? 'night' : 'day') + ' reduced motion still halves life'
        );
        assertEquals(
          game.qaPlateauHold,
          qaHoldFrames('plateau'),
          (night ? 'night' : 'day') + ' hold uses the shorter window'
        );
        assert(
          game.qaPlateauHold < QA_PLATEAU_HOLD,
          (night ? 'night' : 'day') + ' hold is shorter than the full capture'
        );
        const spy = spyRects();
        drawQaPlateau();
        const fills = spy.calls.filter((c) => c.style === color);
        assertEquals(
          fills.length,
          qaPlateauMarks().length,
          (night ? 'night' : 'day') + ' hold paints the damped speck count'
        );
        assert(
          fills.length < fullMarks,
          (night ? 'night' : 'day') + ' hold is not the full cluster'
        );
        assert(
          fills.every((fill) => fill.alpha === PUFF.alpha),
          (night ? 'night' : 'day') + ' hold ink is softer than solid'
        );
        assert(
          fills.every((fill) => fill.alpha < 1),
          (night ? 'night' : 'day') + ' hold is not full ink'
        );
        spy.restore();
      }
    } finally {
      setQaFlag('plateau', false);
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = origMode;
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Night land dust', () => {
  const DAY_DUST = '#9c8770';

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
    return Particles.particles.filter((p) => p.life > 0).map((p) => p.color);
  }

  it('keeps day jump and land dust brown, and cools it once the sky is night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      assertEquals(Particles.KINDS.jump.color, DAY_DUST, 'jump kind stays the day brown');
      assertEquals(Particles.KINDS.land.color, DAY_DUST, 'land kind stays the day brown');
      assertEquals(
        GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        '#6a686e',
        'night land dust is the quiet cool gray'
      );
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
      assert(
        liveColors('jump').every((c) => c === DAY_DUST),
        'a day jump kicks brown dust'
      );
      assert(
        liveColors('land').every((c) => c === DAY_DUST),
        'a day landing kicks brown dust'
      );

      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(
        landDustColor(DAY_DUST),
        DAY_DUST,
        'the ease starts with the sky, still brown at the boundary'
      );
      game.score = 350;
      const mid = landDustColor(DAY_DUST);
      assert(mid !== DAY_DUST && mid !== night, 'mid-twilight is between brown and night dust');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      const almost = landDustColor(DAY_DUST);
      assert(almost !== night, 'one point before night is still easing, not snapped');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(landDustColor(DAY_DUST), night, 'full night holds the cool dust');
      assert(
        liveColors('jump').every((c) => c === night),
        'a night jump kicks cool dust'
      );
      assert(
        liveColors('land').every((c) => c === night),
        'a night landing kicks cool dust'
      );
      game.score = 1000;
      assertEquals(landDustColor(DAY_DUST), night, 'later night keeps the same cool dust');

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(landDustColor(DAY_DUST), night, 'Daily shares the Updated night dust');
      assert(
        liveColors('land').every((c) => c === night),
        'a Daily night landing kicks cool dust'
      );

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'Classic night dust stays the day brown');
      assertEquals(liveColors('jump').length, 0, 'Classic still emits no foot dust');
      assertEquals(liveColors('land').length, 0, 'Classic still emits no land dust');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('reduced motion snaps to night dust instead of easing, and still damps the burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        landDustColor(DAY_DUST),
        DAY_DUST,
        'reduced motion keeps brown dust while the sky is still changing'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(
        landDustColor(DAY_DUST),
        DAY_DUST,
        'reduced motion does not run the twilight ease'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        landDustColor(DAY_DUST),
        GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'reduced motion still gets the static night dust'
      );
      const emitted = Particles.emit('land', 80, 140);
      const damped = Math.max(1, Math.round(Particles.KINDS.land.count * 0.25));
      assertEquals(emitted, damped, 'reduced motion still damps the land burst');
      assert(
        Particles.particles
          .filter((p) => p.life > 0)
          .every((p) => p.color === GAME_CONFIG.NIGHT_LAND_DUST_COLOR),
        'the damped night burst is still cool dust'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
      setQaFlag('night', false);
      Particles.reset();
    }
  });

  it('?qaNight=1 cools Updated foot dust immediately without moving the score', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      game.mode = MODES.UPDATED;
      game.score = 0;
      setQaFlag('night', true);
      assertEquals(
        landDustColor(DAY_DUST),
        GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'the existing night QA flag is enough to see night dust'
      );
      assert(
        liveColors('jump').every((c) => c === GAME_CONFIG.NIGHT_LAND_DUST_COLOR),
        'a QA-night jump kicks cool dust at score 0'
      );
      assertEquals(game.score, 0, 'night dust must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'QA night still leaves Classic dust brown');
      assertEquals(liveColors('land').length, 0, 'QA night does not add Classic foot dust');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      Particles.reset();
    }
  });

  it('NIGHT_LAND_DUST_COLOR override changes only the night dust', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_LAND_DUST_COLOR: '#556677' }, () => {
        assertEquals(
          landDustColor(DAY_DUST),
          '#556677',
          'a visual override should recolor night foot dust'
        );
        assert(
          liveColors('land').every((c) => c === '#556677'),
          'emitted night land dust uses the tuned color'
        );
      });
      assertEquals(
        landDustColor(DAY_DUST),
        GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        'clearing the override returns the configured night dust'
      );
      game.score = 0;
      withTuning({ NIGHT_LAND_DUST_COLOR: '#556677' }, () => {
        assertEquals(landDustColor(DAY_DUST), DAY_DUST, 'day dust ignores the night override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_LAND_DUST_COLOR: 'dust' }, () => {
        assertEquals(
          landDustColor(DAY_DUST),
          GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'a non-color override falls back to the configured night dust'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
    return { n: n, motes: Particles.particles.filter((p) => p.life > 0) };
  }

  it('softens jump and land dust once the sky is fully night, and leaves day alone', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      assertEquals(
        GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
        '#6a686e',
        'night dust stays the cool gray; the quiet is the ink, not a new color'
      );
      assertEquals(GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA, 0.42, 'night takeoff uses the quieter peak');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_ALPHA, 0.36, 'night landing uses the quieter peak');
      assertEquals(GAME_CONFIG.NIGHT_JUMP_DUST_COUNT, 2, 'night takeoff emits fewer motes');
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 3, 'night landing emits fewer motes');
      assert(
        GAME_CONFIG.NIGHT_LAND_DUST_COUNT > GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
        'a night landing still reads heavier than a takeoff'
      );
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_LIFE, 6, 'night motes die sooner');
      assert(
        GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA < Particles.KINDS.jump.alpha,
        'night takeoff is softer than the day peak'
      );
      assert(
        GAME_CONFIG.NIGHT_LAND_DUST_ALPHA < Particles.KINDS.land.alpha,
        'night landing is softer than the day peak'
      );
      assert(
        GAME_CONFIG.NIGHT_LAND_DUST_ALPHA < GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
        'the wider night landing stays the softer of the two'
      );
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
      assert(
        sunkJump <= road + 0.2,
        'three-fifths of the day takeoff alpha would land on the road'
      );
      assert(sunkLand < road, 'three-fifths of the day landing alpha would sink under the road');
      const jumpLift = dayJump - road;
      const landLift = dayLand - road;
      assert(
        Math.abs(nightJump - road - jumpLift * 0.6) < 0.15,
        'night takeoff keeps about three-fifths of the old lift over the road'
      );
      assert(
        Math.abs(nightLand - road - landLift * 0.6) < 0.15,
        'night landing keeps about three-fifths of the old lift over the road'
      );

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
      const jumpMid =
        Particles.KINDS.jump.alpha +
        (GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA - Particles.KINDS.jump.alpha) * 0.5;
      const landMid =
        Particles.KINDS.land.alpha +
        (GAME_CONFIG.NIGHT_LAND_DUST_ALPHA - Particles.KINDS.land.alpha) * 0.5;
      burst = liveBurst('jump');
      assertEquals(
        burst.n,
        Particles.KINDS.jump.count,
        'twilight still uses the day takeoff count'
      );
      burst.motes.forEach((p) => {
        assert(Math.abs(p.alpha - jumpMid) < 1e-9, 'mid-twilight eases the takeoff peak');
        assertEquals(p.life, Particles.KINDS.jump.life, 'twilight still uses the day life');
      });
      burst = liveBurst('land');
      assertEquals(
        burst.n,
        Particles.KINDS.land.count,
        'twilight still uses the day landing count'
      );
      burst.motes.forEach((p) => {
        assert(Math.abs(p.alpha - landMid) < 1e-9, 'mid-twilight eases the landing peak');
      });

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      burst = liveBurst('jump');
      assertEquals(
        burst.n,
        GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
        'a night jump emits the shorter count'
      );
      burst.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
          'a night jump uses the quieter peak'
        );
        assertEquals(
          p.life,
          GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
          'a night jump uses the shorter life'
        );
        assertEquals(
          p.maxLife,
          GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
          'a night jump fades across that life'
        );
        assertEquals(
          p.color,
          GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'a night jump stays the cool gray'
        );
        assertEquals(p.size, Particles.KINDS.jump.size, 'night motes stay the day size');
      });
      burst = liveBurst('land');
      assertEquals(
        burst.n,
        GAME_CONFIG.NIGHT_LAND_DUST_COUNT,
        'a night landing emits the shorter count'
      );
      burst.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
          'a night landing uses the quieter peak'
        );
        assertEquals(
          p.life,
          GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
          'a night landing uses the shorter life'
        );
        assertEquals(
          p.color,
          GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'a night landing stays the cool gray'
        );
      });

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      burst = liveBurst('land');
      assertEquals(
        burst.n,
        GAME_CONFIG.NIGHT_LAND_DUST_COUNT,
        'Daily night landing shares the shorter count'
      );
      burst.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
          'Daily night landing shares the quieter peak'
        );
        assertEquals(
          p.life,
          GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
          'Daily night landing shares the shorter life'
        );
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
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('reduced motion snaps the night peaks and still damps the shorter burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      const burstMid = liveBurst('land');
      assertEquals(
        burstMid.n,
        Math.max(1, Math.round(Particles.KINDS.land.count * 0.25)),
        'reduced motion during twilight still damps the day landing'
      );
      burstMid.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          Particles.KINDS.land.alpha,
          'reduced motion does not ease the landing peak during twilight'
        );
        assertEquals(
          p.life,
          Math.max(2, Math.round(Particles.KINDS.land.life * 0.5)),
          'reduced motion during twilight still halves the day life'
        );
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const burst = liveBurst('land');
      const nightCount = Math.max(1, Math.round(GAME_CONFIG.NIGHT_LAND_DUST_COUNT * 0.25));
      const nightLife = Math.max(2, Math.round(GAME_CONFIG.NIGHT_LAND_DUST_LIFE * 0.5));
      assertEquals(burst.n, nightCount, 'reduced motion quarters the night landing count');
      assert(nightCount < GAME_CONFIG.NIGHT_LAND_DUST_COUNT, 'the night damp still removes motes');
      burst.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
          'reduced motion snaps to the night landing peak'
        );
        assertEquals(p.life, nightLife, 'reduced motion halves the shorter night life');
        assertEquals(
          p.color,
          GAME_CONFIG.NIGHT_LAND_DUST_COLOR,
          'the damped night burst stays cool dust'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setReducedMotion(false);
      setQaFlag('night', false);
      Particles.reset();
    }
  });

  it('night dust alpha and count overrides change only the night burst', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning(
        {
          NIGHT_JUMP_DUST_ALPHA: 0.22,
          NIGHT_LAND_DUST_ALPHA: 0.18,
          NIGHT_JUMP_DUST_COUNT: 4,
          NIGHT_LAND_DUST_COUNT: 4,
          NIGHT_LAND_DUST_LIFE: 4,
        },
        () => {
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
        }
      );
      const restored = liveBurst('jump');
      assertEquals(
        restored.n,
        GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
        'clearing the override returns the night takeoff count'
      );
      restored.motes.forEach((p) => {
        assertEquals(
          p.alpha,
          GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
          'clearing the override returns the night takeoff peak'
        );
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
      withTuning(
        {
          NIGHT_JUMP_DUST_ALPHA: 2,
          NIGHT_LAND_DUST_ALPHA: 'soft',
          NIGHT_JUMP_DUST_COUNT: 0,
          NIGHT_LAND_DUST_COUNT: -3,
          NIGHT_LAND_DUST_LIFE: 1,
        },
        () => {
          const jump = liveBurst('jump');
          assertEquals(
            jump.n,
            GAME_CONFIG.NIGHT_JUMP_DUST_COUNT,
            'a bad count override falls back to the night takeoff count'
          );
          jump.motes.forEach((p) => {
            assertEquals(
              p.alpha,
              GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
              'a bad peak override falls back to the night takeoff peak'
            );
            assertEquals(
              p.life,
              GAME_CONFIG.NIGHT_LAND_DUST_LIFE,
              'a too-short life override falls back to the night life'
            );
          });
          const land = liveBurst('land');
          land.motes.forEach((p) => {
            assertEquals(
              p.alpha,
              GAME_CONFIG.NIGHT_LAND_DUST_ALPHA,
              'a bad landing peak falls back to the night landing peak'
            );
          });
        }
      );
      setReducedMotion(true);
      withTuning({ NIGHT_LAND_DUST_COUNT: 8 }, () => {
        const damped = liveBurst('land');
        assertEquals(
          damped.n,
          Math.max(1, Math.round(8 * 0.25)),
          'reduced motion quarters the tuned night count, not the day count'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
    }
  });

  it('leaves trail, collision, confetti, and plateau colors alone at night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      for (const kind of ['trail', 'collision', 'confetti', 'plateau', 'plateauQa']) {
        const colors = liveColors(kind);
        assert(colors.length > 0, kind + ' still emits at night');
        assert(
          colors.every((c) => c === Particles.KINDS[kind].color),
          kind + ' keeps its own color at night'
        );
      }
      assertEquals(rngCalls, 0, 'recoloring foot dust does not consume the run seed');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
    }
  });
});

describe('Night milestone tint', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      get() {
        return captured;
      },
      set(v) {
        captured = v;
        fillStyles.push(v);
      },
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
      setQaFlag('night', false);
      setReducedMotion(false);
      assertEquals(
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        0.024,
        'night peak keeps three-fifths of the old 0.04 veil'
      );
      assert(
        Math.abs(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA - 0.04 * 0.6) < 1e-9,
        'the quieter peak is exactly three-fifths of the previous night band'
      );
      assertEquals(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, 0.06, 'day peak stays the quieter day wash');
      assert(
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA < GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'night peak is lower than the day peak so twilight still eases down'
      );
      assert(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA > 0, 'the level cue still paints at night');
      const cactus = [0x53, 0x53, 0x53];
      const laneNow = washLift(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, cactus);
      const laneVeil = washLift(0.12, cactus);
      assert(laneNow > 0, 'the day wash still warms the lane');
      assert(laneNow <= laneVeil * 0.5, 'gold on the day cactus stays at most half the old veil');
      const dayLift = washLift(GAME_CONFIG.SKY_TINT_PEAK_ALPHA, daySky);
      const nightLift = washLift(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA, nightSky);
      const previousNight = washLift(0.04, nightSky);
      const oldDayOnWhite = washLift(0.12, daySky);
      const oldPunch = washLift(0.12, nightSky);
      const nightSkyChannels = [0x1a, 0x1a, 0x2e];
      const gold = [255, 215, 0];
      const nightOff = gold.map((channel, i) => Math.abs(channel - nightSkyChannels[i]) * 0.024);
      assertEquals(
        nightOff.map((n) => Math.round(n)).join(','),
        '5,5,1',
        'full night gold sits about 5, 5, and 1 levels off the night sky'
      );
      assert(nightLift < previousNight * 0.75, 'night wash loses a real share of the 0.04 veil');
      assert(
        Math.abs(nightLift - previousNight * 0.6) < 1e-9,
        'the luminance step is the same three-fifths, because the blend is linear'
      );
      assert(
        nightLift < oldPunch * 0.5,
        'night wash stays much quieter than the old day peak on the night sky'
      );
      assert(
        nightLift > oldDayOnWhite * 0.5 && nightLift < oldDayOnWhite * 1.6,
        'night lift stays near the old day cue on white, so the gold still reads once'
      );
      assert(dayLift < oldDayOnWhite, 'the quieter day wash lifts white less than the old veil');

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'day Updated keeps the day peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'the ease starts with the sky, still the day peak at the boundary'
      );
      game.score = 350;
      const mid =
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA +
        (GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA - GAME_CONFIG.SKY_TINT_PEAK_ALPHA) * 0.5;
      assert(
        Math.abs(skyTintPeakAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the day peak to the night peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        skyTintPeakAlpha() < GAME_CONFIG.SKY_TINT_PEAK_ALPHA &&
          skyTintPeakAlpha() > GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'full night holds the quiet peak'
      );
      game.score = 1000;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'later night keeps the same static peak'
      );

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'Daily shares the Updated night peak'
      );

      game.mode = MODES.CLASSIC;
      game.score = 0;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic day peak stays the day value'
      );
      game.score = 350;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic twilight peak stays the day value'
      );
      game.score = 1000;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'Classic night peak stays the day value'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night peak instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'reduced motion keeps the day peak while the sky is still day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'reduced motion does not run the twilight ease'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'reduced motion still gets the static night peak'
      );
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
      setQaFlag('night', true);
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'the existing night QA flag is enough to see the quiet peak'
      );
      assertEquals(game.score, 0, 'the quiet peak must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'QA night still leaves the Classic peak at the day value'
      );
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('NIGHT_SKY_TINT_PEAK_ALPHA override changes only the night peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 0.02 }, () => {
        assertEquals(
          skyTintPeakAlpha(),
          0.02,
          'a visual override should quiet the night flash by the tuned amount'
        );
      });
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'clearing the override returns the configured night peak'
      );
      game.score = 0;
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 0.02, SKY_TINT_PEAK_ALPHA: 0.2 }, () => {
        assertEquals(skyTintPeakAlpha(), 0.2, 'day flash keeps the day peak override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ SKY_TINT_PEAK_ALPHA: 0.2 }, () => {
        assertEquals(
          skyTintPeakAlpha(),
          GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'a day-peak override does not brighten the night flash'
        );
      });
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 'soft' }, () => {
        assertEquals(
          skyTintPeakAlpha(),
          GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'a non-numeric override falls back to the configured peak'
        );
      });
      withTuning({ NIGHT_SKY_TINT_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(
          skyTintPeakAlpha(),
          GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
          'an out-of-range override falls back to the configured peak'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
      const day = paintedTint();
      const dayGold = day.fillStyles.find(
        (s) => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0
      );
      assert(dayGold, 'day milestone still paints the gold wash');
      assert(
        dayGold.indexOf(GAME_CONFIG.SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'day wash uses the day peak'
      );
      assertEquals(day.rects.length, 1, 'day wash is one full-canvas fill');
      assertEquals(day.rects[0][2], GAME_CONFIG.CANVAS_W, 'day wash covers the canvas width');
      assertEquals(day.rects[0][3], GAME_CONFIG.CANVAS_H, 'day wash covers the canvas height');
      assertEquals(game.score, 0, 'painting the day wash does not move the score');
      assertEquals(rngCalls, 0, 'painting the day wash does not consume the run seed');
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'the tint does not consume the milestone timer'
      );

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const night = paintedTint();
      const nightGold = night.fillStyles.find(
        (s) => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0
      );
      assert(nightGold, 'night milestone still paints the gold wash');
      assert(
        nightGold.indexOf(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'night wash uses the quiet peak'
      );
      assert(nightGold !== dayGold, 'night wash is quieter than the day wash');
      assertEquals(night.rects.length, 1, 'night wash is still one full-canvas fill');
      assertEquals(
        game.score,
        GAME_CONFIG.DAY_NIGHT_END,
        'painting the night wash does not move the score'
      );
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
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });
});

describe('Night death flash', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      get() {
        return captured;
      },
      set(v) {
        captured = v;
        fillStyles.push(v);
      },
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
      setQaFlag('night', false);
      setReducedMotion(false);
      const dayPeak = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA;
      assert(dayPeak < 1, 'day peak is quieter than a full white overlay');
      assert(dayPeak > 0, 'the day death cue still paints');
      assert(
        dayPeak > GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'the day blink stays stronger than the night blink'
      );
      const washedDino = whiteWash(dayPeak, dayDino);
      const dinoLum = relLuminance(dayDino);
      const dayLum = relLuminance(washedDino);
      const daySlap = relLuminance(whiteWash(1, dayDino)) - dinoLum;
      assert(dayLum > dinoLum * 2, 'the day blink more than doubles luminance on the dark shapes');
      assert(
        dayLum - dinoLum < daySlap * 0.6,
        'the day blink is quieter than a full white overlay on those shapes'
      );
      assert(
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA < 1,
        'night peak is lower than a full white overlay'
      );
      assert(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA > 0, 'the death cue still paints at night');
      const painted = whiteWash(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA, nightSky);
      const nightLum = relLuminance(painted);
      const skyLum = relLuminance(nightSky);
      const slapped = relLuminance(whiteWash(1, nightSky)) - skyLum;
      assert(
        nightLum < relLuminance(dayDino),
        'the night blink stays darker than the day dino so the sky does not slap white'
      );
      assert(
        nightLum > skyLum * 2,
        'the night blink is still bright enough to read as the death cue'
      );
      assert(
        nightLum - skyLum < slapped * 0.35,
        'night blink is much quieter than a full white overlay on the night sky'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(deathFlashPeakAlpha(), dayPeak, 'day Updated uses the quieter day blink');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(
        deathFlashPeakAlpha(),
        dayPeak,
        'the ease starts with the sky, still the quieter day blink at the boundary'
      );
      game.score = 350;
      const mid = dayPeak + (GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA - dayPeak) * 0.5;
      assert(
        Math.abs(deathFlashPeakAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the day blink to the night peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        deathFlashPeakAlpha() < GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA &&
          deathFlashPeakAlpha() > GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'full night holds the quiet peak'
      );
      game.score = 1000;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'later night keeps the same static peak'
      );

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'Daily shares the Updated night peak'
      );

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
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night peak instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion keeps the quieter day blink while the sky is still day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion does not run the twilight ease'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'reduced motion still gets the static night peak'
      );
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
      setQaFlag('night', true);
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'the existing night QA flag is enough to see the quiet blink'
      );
      assertEquals(game.score, 0, 'the quiet blink must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(
        deathFlashPeakAlpha(),
        1,
        'QA night still leaves the Classic blink at the day value'
      );
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('NIGHT_DEATH_FLASH_PEAK_ALPHA override changes only the night peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 0.05 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          0.05,
          'a visual override should quiet the night blink by the tuned amount'
        );
      });
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
        'clearing the override returns the configured night peak'
      );
      game.score = 0;
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 0.05 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'day blink ignores the night peak override'
        );
      });
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 0.7 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          0.7,
          'a visual override should quiet or lift the day blink by the tuned amount'
        );
      });
      assertEquals(
        deathFlashPeakAlpha(),
        GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
        'clearing the day override returns the configured day peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 0.7 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a day peak override does not brighten the night blink'
        );
      });
      game.score = 0;
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 'loud' }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'a non-numeric day override falls back to the configured peak'
        );
      });
      withTuning({ DAY_DEATH_FLASH_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA,
          'an out-of-range day override falls back to the configured peak'
        );
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DEATH_FLASH_FRAMES: 3 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a frame-length override does not brighten the night peak'
        );
      });
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 'soft' }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'a non-numeric override falls back to the configured peak'
        );
      });
      withTuning({ NIGHT_DEATH_FLASH_PEAK_ALPHA: 1.5 }, () => {
        assertEquals(
          deathFlashPeakAlpha(),
          GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA,
          'an out-of-range override falls back to the configured peak'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      Animations.deathFlashFrames = GAME_CONFIG.DEATH_FLASH_FRAMES;
      const day = paintedFlash();
      const dayWhite = day.fillStyles.find(
        (s) => typeof s === 'string' && s.indexOf('rgba(255, 255, 255') === 0
      );
      assert(dayWhite, 'day death still paints the white blink');
      assert(
        dayWhite.indexOf(GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3)) !== -1,
        'day blink uses the quieter day peak'
      );
      assertEquals(day.rects.length, 1, 'day blink is one full-canvas fill');
      assertEquals(day.rects[0][2], GAME_CONFIG.CANVAS_W, 'day blink covers the canvas width');
      assertEquals(day.rects[0][3], GAME_CONFIG.CANVAS_H, 'day blink covers the canvas height');
      assertEquals(game.score, 0, 'painting the day blink does not move the score');
      assertEquals(rngCalls, 0, 'painting the day blink does not consume the run seed');
      assertEquals(
        Animations.deathFlashFrames,
        GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the paint does not consume the flash timer'
      );

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      const night = paintedFlash();
      const nightWhite = night.fillStyles.find(
        (s) => typeof s === 'string' && s.indexOf('rgba(255, 255, 255') === 0
      );
      assert(nightWhite, 'night death still paints the white blink');
      assert(
        nightWhite.indexOf(GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3)) !== -1,
        'night blink uses the quiet peak'
      );
      assert(nightWhite !== dayWhite, 'night blink is quieter than the day blink');
      assertEquals(night.rects.length, 1, 'night blink is still one full-canvas fill');
      assertEquals(
        game.score,
        GAME_CONFIG.DAY_NIGHT_END,
        'painting the night blink does not move the score'
      );
      assertEquals(game.currentSpeed, origSpeed, 'night paint does not change speed');
      assertEquals(rngCalls, 0, 'painting the night blink does not consume the run seed');
      assertEquals(
        Animations.deathFlashFrames,
        GAME_CONFIG.DEATH_FLASH_FRAMES,
        'night paint does not consume the flash timer'
      );

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
      setQaFlag('night', false);
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
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
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
      // The slice that dies paints the first shake frame (C5); each later
      // slice counts down, then paints the next one.
      drawFrame();
      for (let i = 1; i < frames; i++) {
        STATE_HANDLERS[STATE.DEAD]();
      }
      assertEquals(samples.length, frames, 'each shake frame translates once');
      assertEquals(rngCalls, 0, 'the death shake does not consume the run seed');
      assertEquals(game.score, origScore, 'the death shake does not move the score');
      assertEquals(game.currentSpeed, origSpeed, 'the death shake does not change speed');
      samples.forEach((sample) => {
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
      setQaFlag('night', false);
      setReducedMotion(false);
      assert(
        QUIET_AMPLITUDE < GAME_CONFIG.DEATH_SHAKE_AMPLITUDE / 2,
        'the quiet peak is under half the Classic yank'
      );
      assert(QUIET_AMPLITUDE > 0, 'the death cue still moves');
      assert(
        QUIET_FREQ < GAME_CONFIG.DEATH_SHAKE_FREQ,
        'the quiet shake turns slower than the Classic buzz'
      );
      assertEquals(
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        QUIET_FRAMES,
        'the quiet settle is about two thirds of the Classic window'
      );
      assert(
        QUIET_FRAMES < GAME_CONFIG.DEATH_SHAKE_FRAMES,
        'Updated finishes before the Classic shake'
      );
      assertEquals(
        QUIET_FRAMES * QUIET_FREQ,
        Math.PI,
        'eight frames at the quiet frequency are one half-turn'
      );

      game.mode = MODES.CLASSIC;
      game.score = 0;
      const classicDay = sampleShake();
      assertWave(
        classicDay,
        GAME_CONFIG.DEATH_SHAKE_AMPLITUDE,
        GAME_CONFIG.DEATH_SHAKE_FREQ,
        'Classic day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertWave(
        sampleShake(),
        GAME_CONFIG.DEATH_SHAKE_AMPLITUDE,
        GAME_CONFIG.DEATH_SHAKE_FREQ,
        'Classic night'
      );

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
          assert(
            Math.abs(updatedDay[i].x - updatedDay[i - 1].x) < 0.5,
            'each quiet step stays under half a pixel'
          );
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

      setQaFlag('night', true);
      game.mode = MODES.UPDATED;
      game.score = 0;
      assertWave(
        sampleShake(),
        QUIET_AMPLITUDE,
        QUIET_FREQ,
        'qaNight does not change the Updated nudge'
      );
      game.mode = MODES.CLASSIC;
      assertWave(
        sampleShake(),
        GAME_CONFIG.DEATH_SHAKE_AMPLITUDE,
        GAME_CONFIG.DEATH_SHAKE_FREQ,
        'qaNight leaves the Classic buzz'
      );

      setReducedMotion(true);
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      assertWave(
        sampleShake(),
        QUIET_AMPLITUDE,
        QUIET_FREQ,
        'reduced motion keeps the quiet Updated nudge'
      );
      game.mode = MODES.CLASSIC;
      assertWave(
        sampleShake(),
        GAME_CONFIG.DEATH_SHAKE_AMPLITUDE,
        GAME_CONFIG.DEATH_SHAKE_FREQ,
        'reduced motion leaves the Classic buzz'
      );

      assertEquals(
        GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
        QUIET_AMPLITUDE,
        'the quiet amplitude is the Updated/Daily tunable'
      );
      assertEquals(
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FREQ,
        QUIET_FREQ,
        'the quiet frequency is the Updated/Daily tunable'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('tunes the Updated nudge without moving Classic or the run', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
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
        assertWave(
          sampleShake(),
          QUIET_AMPLITUDE,
          QUIET_FREQ,
          'Updated ignores the Classic shake tunes'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 40 }, () => {
        assertWave(
          sampleShake(),
          QUIET_AMPLITUDE,
          QUIET_FREQ,
          'an out-of-range amplitude falls back to the quiet nudge'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_FREQ: -1 }, () => {
        assertWave(
          sampleShake(),
          QUIET_AMPLITUDE,
          QUIET_FREQ,
          'a negative frequency falls back to the quiet nudge'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_AMPLITUDE: 'soft' }, () => {
        assertWave(
          sampleShake(),
          QUIET_AMPLITUDE,
          QUIET_FREQ,
          'a non-numeric amplitude falls back to the quiet nudge'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 6 }, () => {
        const tuned = sampleShake();
        assertEquals(tuned.length, 6, 'a shorter whole-frame tune is honored');
        assertWave(tuned, QUIET_AMPLITUDE, QUIET_FREQ, 'Updated frame tune');
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 40 }, () => {
        assertEquals(
          sampleShake().length,
          QUIET_FRAMES,
          'a frame count past Classic falls back to the quiet settle'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 0 }, () => {
        assertEquals(
          sampleShake().length,
          QUIET_FRAMES,
          'a zero frame count falls back to the quiet settle'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 1.5 }, () => {
        assertEquals(
          sampleShake().length,
          QUIET_FRAMES,
          'a fractional frame count falls back to the quiet settle'
        );
      });
      withTuning({ UPDATED_DEATH_SHAKE_FRAMES: 'short' }, () => {
        assertEquals(
          sampleShake().length,
          QUIET_FRAMES,
          'a non-numeric frame count falls back to the quiet settle'
        );
      });

      game.mode = MODES.CLASSIC;
      withTuning(
        {
          UPDATED_DEATH_SHAKE_AMPLITUDE: 0.5,
          UPDATED_DEATH_SHAKE_FREQ: 0.1,
          UPDATED_DEATH_SHAKE_FRAMES: 6,
        },
        () => {
          const classic = sampleShake();
          assertEquals(
            classic.length,
            GAME_CONFIG.DEATH_SHAKE_FRAMES,
            'Classic keeps the 12-frame shake'
          );
          assertWave(
            classic,
            GAME_CONFIG.DEATH_SHAKE_AMPLITUDE,
            GAME_CONFIG.DEATH_SHAKE_FREQ,
            'Classic ignores the Updated shake tunes'
          );
        }
      );
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
      setQaFlag('night', false);
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
      assertEquals(
        Animations.deathShakeFrames,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'reduced motion keeps the shorter Updated shake'
      );
      assertEquals(
        Animations.deathFlashFrames,
        1,
        'reduced motion still caps the flash at one frame'
      );
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
      setQaFlag('night', false);
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        resetGame();
        game.state = STATE.RUNNING;
        game.graceFrames = 0;
        game.obstacles.length = 0;
        game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
        // The slice that dies already paints the first pop frame (C5).
        const scales = [];
        ctx.scale = (x) => {
          scales.push(x);
        };
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        assertEquals(game.state, STATE.DEAD, mode + ' collision still ends the run');
        assertEquals(
          Animations.deathShakeFrames,
          QUIET_FRAMES,
          mode + ' shake starts on the shorter window'
        );
        assertEquals(
          Animations.scorePopFrames,
          QUIET_FRAMES,
          mode + ' score pop starts on that same window'
        );
        for (let i = 1; i < QUIET_FRAMES; i++) STATE_HANDLERS[STATE.DEAD]();
        assertEquals(scales.length, QUIET_FRAMES, mode + ' scales once per shake frame');
        assertEquals(
          scales[0],
          GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          mode + ' opens the pop at the quiet peak'
        );
        const peak = GAME_CONFIG.SCORE_POP_PEAK_SCALE;
        const last = scales[scales.length - 1];
        assert(
          last > 1 && last < 1 + (peak - 1) * 0.25,
          mode + ' last shake frame has nearly settled the score'
        );
        // The next slice counts the last frame down and opens Game Over.
        STATE_HANDLERS[STATE.DEAD]();
        assertEquals(Animations.scorePopFrames, 0, mode + ' pop is done when the shake is');
        assertEquals(Animations.deathShakeFrames, 0, mode + ' shake is done');
        assertEquals(
          scales.length,
          QUIET_FRAMES,
          mode + ' Game Over does not keep scaling the HUD'
        );
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
      assertEquals(
        Animations.deathShakeFrames,
        GAME_CONFIG.DEATH_SHAKE_FRAMES,
        'Classic still starts the 12-frame shake'
      );
      assertEquals(Animations.scorePopFrames, 0, 'Classic still does not start the pop');
    } finally {
      ctx.scale = origScale;
      game.mode = origMode;
      setReducedMotion(false);
      setQaFlag('night', false);
      game.obstacles.length = 0;
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
    gravity: 0.1,
  };

  const UNCHANGED_KINDS = {
    jump: {
      count: 3,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.5,
      vyMin: -1.2,
      vyMax: -0.4,
      vxSpread: 0.6,
      gravity: 0.1,
    },
    land: {
      count: 5,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.4,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.7,
      gravity: 0.12,
    },
    trail: {
      count: 1,
      color: 'rgba(150,150,150,0.28)',
      size: 2,
      life: 6,
      vyMin: -0.1,
      vyMax: 0.1,
      vxSpread: 0.2,
      gravity: 0,
    },
    confetti: {
      count: 6,
      color: '#ffd700',
      size: 3,
      life: 12,
      alpha: 0.7,
      vyMin: -1.6,
      vyMax: -0.5,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    plateau: {
      count: 4,
      color: '#c5d4e4',
      size: 2,
      life: 12,
      alpha: 0.45,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.3,
      gravity: 0.06,
    },
    plateauQa: {
      count: 4,
      color: '#3d4f63',
      size: 2,
      life: 40,
      vyMin: -0.2,
      vyMax: -0.08,
      vxSpread: 0.08,
      gravity: 0.002,
    },
  };

  function travel(kind) {
    const n = kind.life;
    const drop = (kind.gravity * ((n - 1) * n)) / 2;
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
    assert(
      moved.x + edge <= halfW,
      'horizontal travel stays on the dino, including emit jitter and mote size'
    );
    assert(moved.up + kind.size / 2 <= halfH, 'the puff does not fountain above the dino');
    assert(moved.down + kind.size / 2 <= halfH, 'the puff does not rain off the dino');
    assert(kind.count < 11, 'fewer than half the old 22-mote firework');
    assert(kind.count < 8, 'quieter than the round-1 eight-mote puff');
    assert(kind.count > Particles.KINDS.jump.count, 'still reads louder than a jump puff');
    assert(kind.life < GAME_CONFIG.DEATH_SHAKE_FRAMES, 'the puff dies before the death nudge ends');
    assert(
      kind.life * 2 > GAME_CONFIG.DEATH_SHAKE_FRAMES,
      'the puff still lasts through most of the shake'
    );
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
        game.rng = () => {
          rngCalls++;
          return 0.5;
        };
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
          assert(
            Math.abs(p.vx) <= PUFF.vxSpread,
            mode + ' horizontal speed stays inside the spread'
          );
          assert(
            p.vy >= PUFF.vyMin && p.vy <= PUFF.vyMax,
            mode + ' vertical speed stays inside the short span'
          );
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
      assertEquals(
        jumpN,
        Math.max(1, Math.round(Particles.KINDS.jump.count * 0.25)),
        'reduced motion still damps the jump puff the same way'
      );
      Particles.particles
        .filter((p) => p.life > 0)
        .forEach((p) => {
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
          assert(
            motes.every((p) => p.life === PUFF.life),
            mode + ' collision puff uses the short life'
          );
        }
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' collision leaves speed on the curve'
        );
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
    jump: {
      count: 3,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.5,
      vyMin: -1.2,
      vyMax: -0.4,
      vxSpread: 0.6,
      gravity: 0.1,
    },
    land: {
      count: 5,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.4,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.7,
      gravity: 0.12,
    },
    collision: {
      count: 5,
      color: '#d04a2a',
      size: 3,
      life: 8,
      vyMin: -1.2,
      vyMax: 0.4,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    confetti: {
      count: 6,
      color: '#ffd700',
      size: 3,
      life: 12,
      alpha: 0.7,
      vyMin: -1.6,
      vyMax: -0.5,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    plateau: {
      count: 4,
      color: '#c5d4e4',
      size: 2,
      life: 12,
      alpha: 0.45,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.3,
      gravity: 0.06,
    },
    plateauQa: {
      count: 4,
      color: '#3d4f63',
      size: 2,
      life: 40,
      vyMin: -0.2,
      vyMax: -0.08,
      vxSpread: 0.08,
      gravity: 0.002,
    },
  };

  function trailCrossScore() {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT, TRAIL_SPEED_RATIO } =
      GAME_CONFIG;
    const sig =
      (TRAIL_SPEED_RATIO * PLATEAU_SPEED - INITIAL_SPEED) / (PLATEAU_SPEED - INITIAL_SPEED);
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
    setQaFlag('trail', false);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
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
    assertEquals(
      kind.vxSpread,
      WHISPER.vxSpread,
      'horizontal drift stays tighter than the old smear'
    );
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
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'an early frame still takes speed from the curve'
      );

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
          assert(
            Math.abs(p.x - (dino.x + 4)) <= cfg('PARTICLE_EMIT_SPREAD') / 2,
            mode + ' mote stays on the heel, including emit jitter'
          );
          assertEquals(p.y, dino.y + dino.height - 4, mode + ' mote starts at the heel');
        });
        assertEquals(game.plateauCueShown, false, mode + ' whisper does not spend the plateau cue');
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the score'
        );
        assertEquals(game.rng, seed, mode + ' whisper does not replace the run seed');
      }

      armRun(MODES.CLASSIC);
      game.score = before;
      tick();
      assertEquals(trailMotes().length, 0, 'Classic never trails');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('trail', false);
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
      setQaFlag('trail', true);
      tick();
      assertEquals(trailMotes().length, expectedCount, 'a running frame still damps the whisper');
      trailMotes().forEach((p) => {
        assertEquals(p.life, expectedLife, 'the running frame uses the halved life');
      });
      assert(game.score < 1, 'the damped whisper does not move the score');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'the damped whisper does not move the speed'
      );
    } finally {
      game.mode = origMode;
      setQaFlag('trail', false);
      setReducedMotion(false);
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
    gravity: 0.1,
  };

  const UNCHANGED_KINDS = {
    jump: {
      count: 3,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.5,
      vyMin: -1.2,
      vyMax: -0.4,
      vxSpread: 0.6,
      gravity: 0.1,
    },
    land: {
      count: 5,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.4,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.7,
      gravity: 0.12,
    },
    trail: {
      count: 1,
      color: 'rgba(150,150,150,0.28)',
      size: 2,
      life: 6,
      vyMin: -0.1,
      vyMax: 0.1,
      vxSpread: 0.2,
      gravity: 0,
    },
    collision: {
      count: 5,
      color: '#d04a2a',
      size: 3,
      life: 8,
      vyMin: -1.2,
      vyMax: 0.4,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    plateau: {
      count: 4,
      color: '#c5d4e4',
      size: 2,
      life: 12,
      alpha: 0.45,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.3,
      gravity: 0.06,
    },
    plateauQa: {
      count: 4,
      color: '#3d4f63',
      size: 2,
      life: 40,
      vyMin: -0.2,
      vyMax: -0.08,
      vxSpread: 0.08,
      gravity: 0.002,
    },
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
    assert(
      -up.min + kind.size / 2 < GAME_CONFIG.SCORE_Y,
      'the puff does not leave the top of the canvas'
    );
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
      setQaFlag('confetti', false);
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
          assert(
            motes.every((p) => p.life === PUFF.life - 1),
            mode + ' puff uses the short life'
          );
          assert(
            motes.every((p) => p.color === PUFF.color),
            mode + ' puff stays gold'
          );
          assert(
            motes.every((p) => p.alpha === PUFF.alpha),
            mode + ' puff uses the soft peak'
          );
        }
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' level-up leaves speed on the curve'
        );
      }
    } finally {
      game.mode = origMode;
      setQaFlag('confetti', false);
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
    trail: {
      count: 1,
      color: 'rgba(150,150,150,0.28)',
      size: 2,
      life: 6,
      vyMin: -0.1,
      vyMax: 0.1,
      vxSpread: 0.2,
      gravity: 0,
    },
    collision: {
      count: 5,
      color: '#d04a2a',
      size: 3,
      life: 8,
      vyMin: -1.2,
      vyMax: 0.4,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    confetti: {
      count: 6,
      color: '#ffd700',
      size: 3,
      life: 12,
      alpha: 0.7,
      vyMin: -1.6,
      vyMax: -0.5,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    plateau: {
      count: 4,
      color: '#c5d4e4',
      size: 2,
      life: 12,
      alpha: 0.45,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.3,
      gravity: 0.06,
    },
    plateauQa: {
      count: 4,
      color: '#3d4f63',
      size: 2,
      life: 40,
      vyMin: -0.2,
      vyMax: -0.08,
      vxSpread: 0.08,
      gravity: 0.002,
    },
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
      setQaFlag('night', false);
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
          game.rng = () => {
            rngCalls++;
            return 0.5;
          };
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
            assert(
              Math.abs(p.vx) <= want.vxSpread,
              mode + ' ' + kind + ' stays inside the tight spread'
            );
            assert(
              p.vy >= want.vyMin && p.vy <= want.vyMax,
              mode + ' ' + kind + ' stays in the short lift'
            );
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
      setQaFlag('night', false);
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
      setQaFlag('night', false);
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

describe('Quieter death score pop', () => {
  const OLD_SLAP = 1.4;

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
    return calls.filter(
      (c) => c.op === 'scale' && Math.abs(c.x - scale) < 1e-9 && Math.abs(c.y - scale) < 1e-9
    );
  }

  it('keeps the shake window and peaks as a breath, not a 1.4 slap', () => {
    const origMode = game.mode;
    try {
      assertEquals(GAME_CONFIG.SCORE_POP_FRAMES, 12, 'the classic-length count stays 12');
      game.mode = MODES.UPDATED;
      assertEquals(
        scorePopWindow(),
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the Updated pop eases across the quieter shake'
      );
    } finally {
      game.mode = origMode;
    }
    assertEquals(
      GAME_CONFIG.SCORE_POP_PEAK_SCALE,
      1.12,
      'the first frame grows the 20px digits by about 2.4px'
    );
    assert(GAME_CONFIG.SCORE_POP_PEAK_SCALE < OLD_SLAP, 'the peak stays under the old slap');
    assert(
      GAME_CONFIG.SCORE_POP_PEAK_SCALE > 1,
      'the number still grows, so the death cue still reads'
    );
    assertEquals(
      scorePopScale(1),
      GAME_CONFIG.SCORE_POP_PEAK_SCALE,
      'the first pop frame is the quiet peak'
    );
    const mid = scorePopScale(0.5);
    assert(
      mid > 1 && mid < GAME_CONFIG.SCORE_POP_PEAK_SCALE,
      'later frames ease back toward the resting size'
    );
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
        assertEquals(
          scalesNear(spy.calls, OLD_SLAP).length,
          0,
          mode + ' does not slap the score to 1.4'
        );
        assertEquals(
          scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length,
          1,
          mode + ' scales the HUD once, at the quiet peak'
        );
        const scaleAt = spy.calls.findIndex((c) => c.op === 'scale');
        const textAt = spy.calls.findIndex((c) => c.op === 'text' && c.text === '00042');
        assert(scaleAt !== -1 && textAt > scaleAt, mode + ' draws the digits inside the scale');
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
      assertEquals(
        spy.calls.filter((c) => c.op === 'scale').length,
        0,
        'Classic keeps the resting HUD even if a pop counter is set'
      );
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
      assertEquals(
        spy.calls.filter((c) => c.op === 'scale').length,
        0,
        'reduced motion skips the real pop in Updated and Daily'
      );
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
        assertEquals(scorePopScale(1), OLD_SLAP, 'the old peak is the loudest tune still allowed');
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 2 }, () => {
        assertEquals(
          scorePopScale(1),
          GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a peak past 1.4 falls back to the quiet breath'
        );
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 0.8 }, () => {
        assertEquals(
          scorePopScale(1),
          GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a shrink falls back so the cue cannot invert'
        );
      });
      withTuning({ SCORE_POP_PEAK_SCALE: 'big' }, () => {
        assertEquals(
          scorePopScale(1),
          GAME_CONFIG.SCORE_POP_PEAK_SCALE,
          'a non-numeric peak falls back to the quiet breath'
        );
      });
    } finally {
      spy.restore();
      game.mode = origMode;
      Animations.scorePopFrames = origPop;
      setReducedMotion(false);
    }
  });
});

describe('Quieter LEVEL label', () => {
  const CLASSIC_FONT = "bold 22px 'Courier New', Courier, monospace";

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      restore() {
        ctx.fillText = origFillText;
      },
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
      return {
        calls: levelCalls(spy.calls),
        framesAfter: Animations.milestoneFrames,
        before: before,
      };
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
      setQaFlag('level', false);
      game.mode = MODES.CLASSIC;
      game.score = 40;
      game.milestoneText = 'LEVEL 2';
      const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(first.calls.length, 1, 'Classic paints the word on the first frame');
      assertEquals(first.calls[0].font, CLASSIC_FONT, 'Classic stays bold 22px');
      assertEquals(first.calls[0].alpha, 1, 'Classic still opens at full ink');
      assertEquals(first.calls[0].fill, '#000000', 'day Classic stays black');
      assertEquals(first.calls[0].x, GAME_CONFIG.CANVAS_W / 2, 'the word stays centered');
      assertEquals(
        first.calls[0].y,
        GAME_CONFIG.CANVAS_H / 2 - 30,
        'the word stays in the jump band'
      );
      assertEquals(
        first.framesAfter,
        GAME_CONFIG.MILESTONE_FRAMES,
        'drawing leaves the shared wash timer to updateRunning (C5)'
      );

      const late = paintLabel(1);
      assertEquals(late.calls.length, 1, 'Classic still paints on the last wash frame');
      assertEquals(late.calls[0].font, CLASSIC_FONT, 'the last Classic frame is still 22px');
      assert(
        Math.abs(late.calls[0].alpha - 1 / GAME_CONFIG.MILESTONE_FRAMES) < 1e-12,
        'Classic alpha is still frames / MILESTONE_FRAMES'
      );

      withTuning(
        {
          UPDATED_MILESTONE_FONT_PX: 12,
          UPDATED_MILESTONE_PEAK_ALPHA: 0.2,
          UPDATED_MILESTONE_TEXT_FRAMES: 10,
        },
        () => {
          const tuned = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
          assertEquals(
            tuned.calls[0].font,
            CLASSIC_FONT,
            'Classic does not read the Updated type size'
          );
          assertEquals(tuned.calls[0].alpha, 1, 'Classic does not read the Updated peak');
        }
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setReducedMotion(false);
      setQaFlag('level', false);
      ctx.globalAlpha = 1;
    }
  });

  it('Updated and Daily open quieter and leave before the wash ends', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origText = game.milestoneText;
    try {
      setReducedMotion(false);
      setQaFlag('night', false);
      game.score = 40;
      game.milestoneText = 'LEVEL 3';
      assertEquals(GAME_CONFIG.UPDATED_MILESTONE_FONT_PX, 16, 'the quiet word is 16px');
      assertEquals(
        GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES,
        45,
        'the word lasts half of the 90-frame wash'
      );
      assertEquals(
        GAME_CONFIG.UPDATED_MILESTONE_PEAK_ALPHA,
        0.5,
        'the first frame is half the old ink'
      );
      assert(
        GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES < GAME_CONFIG.MILESTONE_FRAMES,
        'the word is shorter than the gold wash'
      );

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(first.calls.length, 1, mode + ' still paints LEVEL on the first frame');
        assertEquals(first.calls[0].text, 'LEVEL 3', mode + ' still uses the level label');
        assertEquals(
          first.calls[0].font,
          "bold 16px 'Courier New', Courier, monospace",
          mode + ' uses the smaller type'
        );
        assertEquals(first.calls[0].alpha, 0.5, mode + ' opens at the quiet peak');
        assertEquals(first.calls[0].fill, '#000000', mode + ' stays black by day');
        assertEquals(first.calls[0].x, GAME_CONFIG.CANVAS_W / 2, mode + ' stays centered');
        assertEquals(
          first.calls[0].y,
          GAME_CONFIG.CANVAS_H / 2 - 30,
          mode + ' stays in the jump band'
        );
        assertEquals(
          first.framesAfter,
          GAME_CONFIG.MILESTONE_FRAMES,
          mode + ' drawing leaves the shared wash timer to updateRunning (C5)'
        );

        const still = paintLabel(
          GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES + 1
        );
        assertEquals(still.calls.length, 1, mode + ' still paints on the last quiet frame');
        assert(
          still.calls[0].alpha > 0 && still.calls[0].alpha < 0.5,
          mode + ' has already faded below the peak'
        );

        const gone = paintLabel(
          GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES
        );
        assertEquals(gone.calls.length, 0, mode + ' word is gone while the wash timer remains');
        assertEquals(
          gone.framesAfter,
          GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES,
          mode + ' the wash timer outlasts the word; drawing does not move it (C5)'
        );
      }
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.milestoneText = origText;
      Animations.milestoneFrames = 0;
      setQaFlag('night', false);
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
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      game.score = 40;
      game.milestoneText = 'LEVEL 2';
      const left = GAME_CONFIG.MILESTONE_FRAMES - GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES;
      Animations.milestoneFrames = left;
      const fills = [];
      const origFill = ctx.fillStyle;
      Object.defineProperty(ctx, 'fillStyle', {
        configurable: true,
        get() {
          return origFill;
        },
        set(v) {
          fills.push(v);
        },
      });
      drawSkyTint();
      delete ctx.fillStyle;
      const gold = fills.filter(
        (s) => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0
      );
      assertEquals(gold.length, 1, 'the wash still paints after the word has left');
      const expected = (
        (left / GAME_CONFIG.MILESTONE_FRAMES) *
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA
      ).toFixed(3);
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
      setQaFlag('night', false);
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      game.milestoneText = 'LEVEL 5';
      game.mode = MODES.UPDATED;
      const updated = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
      assertEquals(updated.calls[0].fill, '#ffffff', 'Updated night word stays white');
      assertEquals(
        updated.calls[0].alpha,
        GAME_CONFIG.UPDATED_MILESTONE_PEAK_ALPHA,
        'night uses the same quiet peak'
      );
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
      withTuning(
        {
          UPDATED_MILESTONE_FONT_PX: 18,
          UPDATED_MILESTONE_PEAK_ALPHA: 0.4,
          UPDATED_MILESTONE_TEXT_FRAMES: 30,
        },
        () => {
          const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
          assertEquals(
            first.calls[0].font,
            "bold 18px 'Courier New', Courier, monospace",
            'a size inside 12..18 is used'
          );
          assertEquals(first.calls[0].alpha, 0.4, 'a peak inside 0..1 is used');
          const edge = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 30);
          assertEquals(edge.calls.length, 0, 'a shorter tune ends the word at that frame count');
        }
      );
      withTuning(
        {
          UPDATED_MILESTONE_FONT_PX: 40,
          UPDATED_MILESTONE_PEAK_ALPHA: 2,
          UPDATED_MILESTONE_TEXT_FRAMES: 0,
        },
        () => {
          const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
          assertEquals(
            first.calls[0].font,
            "bold 16px 'Courier New', Courier, monospace",
            'a size above 18 falls back'
          );
          assertEquals(first.calls[0].alpha, 0.5, 'a peak above 1 falls back');
          const still = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 45 + 1);
          assertEquals(still.calls.length, 1, 'a zero frame tune falls back to 45');
        }
      );
      withTuning({ UPDATED_MILESTONE_TEXT_FRAMES: 200, UPDATED_MILESTONE_FONT_PX: 'big' }, () => {
        const gone = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - 45);
        assertEquals(gone.calls.length, 0, 'a frame tune past the wash falls back to 45');
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(
          first.calls[0].font,
          "bold 16px 'Courier New', Courier, monospace",
          'a non-number size falls back'
        );
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
      assertEquals(
        classicLate.calls.length,
        1,
        'Classic still lasts the full wash under reduced motion'
      );

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const first = paintLabel(GAME_CONFIG.MILESTONE_FRAMES);
        assertEquals(
          first.calls[0].font,
          "bold 16px 'Courier New', Courier, monospace",
          mode + ' stays on the small type under reduced motion'
        );
        assertEquals(
          first.calls[0].alpha,
          0.5,
          mode + ' keeps the quiet peak so the word still reads'
        );
        const half = Math.max(2, Math.round(GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES * 0.5));
        const gone = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - half);
        assertEquals(gone.calls.length, 0, mode + ' word ends at half the quiet length');
        assert(
          half < GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES,
          mode + ' reduced-motion word is shorter than the motion-allowed word'
        );
        const still = paintLabel(GAME_CONFIG.MILESTONE_FRAMES - half + 1);
        assertEquals(
          still.calls.length,
          1,
          mode + ' still paints on the last reduced-motion frame'
        );
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
      setQaFlag('night', false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      setQaFlag('level', true);
      const spy = spyText();
      try {
        tick();
        assertEquals(game.qaLevelHold, 180, 'the playtest hold starts at the full capture window');
        assertEquals(game.milestoneText, 'LEVEL 2', 'the hold uses the same early label');
        assertEquals(
          Animations.milestoneFrames,
          GAME_CONFIG.MILESTONE_FRAMES,
          'the hold does not change the wash length (it counts down from the next slice)'
        );
        const live = levelCalls(spy.calls);
        assertEquals(live.length, 1, 'the first frame paints the live word once');
        assertEquals(live[0].alpha, 0.5, 'the live word, not a louder hold, is what shows first');

        spy.calls.length = 0;
        Animations.milestoneFrames = 0;
        game.qaLevelHold = 40;
        tick();
        const held = levelCalls(spy.calls);
        assertEquals(held.length, 1, 'the hold keeps LEVEL up after the live word has ended');
        assertEquals(
          held[0].font,
          "bold 16px 'Courier New', Courier, monospace",
          'the hold uses the quiet type'
        );
        assertEquals(held[0].alpha, 0.5, 'motion allowed holds the quiet peak');
        assertEquals(
          game.score < GAME_CONFIG.SCORE_PER_LEVEL,
          true,
          'the hold must not jump the score to the real level'
        );
      } finally {
        spy.restore();
      }

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaFlag('level', true);
      const classicSpy = spyText();
      try {
        tick();
        assertEquals(game.qaLevelHold, 0, 'Classic does not start the hold');
        assertEquals(
          levelCalls(classicSpy.calls).length,
          0,
          'Classic does not paint an early LEVEL'
        );
      } finally {
        classicSpy.restore();
      }

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        setReducedMotion(true);
        armFreshRun();
        game.mode = mode;
        setQaFlag('level', true);
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
          assertEquals(
            held[0].font,
            "bold 16px 'Courier New', Courier, monospace",
            mode + ' reduced-motion hold stays on the small type'
          );
        } finally {
          rmSpy.restore();
        }
      }
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('level', false);
      setQaFlag('night', false);
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
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      restore() {
        ctx.fillText = origFillText;
      },
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
      setQaFlag('newBest', false);
      game.qaNewBestHold = 0;
      game.mode = MODES.CLASSIC;
      Animations.milestoneFrames = 0;
      const first = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(first.calls.length, 1, 'Classic paints the badge on the first frame');
      assertEquals(first.calls[0].font, CLASSIC_FONT, 'Classic stays bold 14px');
      assertEquals(first.calls[0].alpha, 1, 'Classic still opens at full gold');
      assertEquals(first.calls[0].fill, '#ffd700', 'Classic stays gold');
      assertEquals(first.calls[0].text, 'NEW BEST!', 'Classic still says NEW BEST!');
      assertEquals(
        first.calls[0].x,
        GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET,
        'the badge stays under the score'
      );
      assertEquals(first.calls[0].y, 70, 'the badge stays at the corner baseline');
      assertEquals(
        first.framesAfter,
        GAME_CONFIG.NEW_BEST_FRAMES,
        'drawing leaves the shared timer to updateRunning (C5)'
      );

      const mid = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES / 2);
      assertEquals(mid.calls[0].alpha, 0.5, 'Classic alpha is still frames / NEW_BEST_FRAMES');
      assertEquals(mid.calls[0].font, CLASSIC_FONT, 'the mid Classic frame is still 14px');

      const last = paintBadge(1);
      assertEquals(last.calls.length, 1, 'Classic still paints on the last frame');
      assert(
        Math.abs(last.calls[0].alpha - 1 / GAME_CONFIG.NEW_BEST_FRAMES) < 1e-12,
        'the last Classic frame is still 1 / NEW_BEST_FRAMES'
      );

      Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
      const dropped = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(dropped.calls[0].y, 100, 'Classic still drops 30px when a milestone is up');
      assertEquals(dropped.calls[0].y - 70, 30, 'the Classic stagger is still 30px');

      withTuning(
        {
          UPDATED_NEW_BEST_FONT_PX: 10,
          UPDATED_NEW_BEST_PEAK_ALPHA: 0.2,
          UPDATED_NEW_BEST_FRAMES: 12,
        },
        () => {
          Animations.milestoneFrames = 0;
          const tuned = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
          assertEquals(
            tuned.calls[0].font,
            CLASSIC_FONT,
            'Classic does not read the Updated type size'
          );
          assertEquals(tuned.calls[0].alpha, 1, 'Classic does not read the Updated peak');
          assertEquals(
            newBestDuration(),
            GAME_CONFIG.NEW_BEST_FRAMES,
            'Classic duration ignores the Updated frame tune'
          );
        }
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      Animations.milestoneFrames = 0;
      Animations.newBestFrames = 0;
      game.qaNewBestHold = 0;
      setReducedMotion(false);
      setQaFlag('newBest', false);
      ctx.globalAlpha = 1;
    }
  });

  it('Updated and Daily open quieter and leave after the short countdown', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaFlag('newBest', false);
      game.qaNewBestHold = 0;
      assertEquals(GAME_CONFIG.UPDATED_NEW_BEST_FONT_PX, 11, 'the quiet badge is 11px');
      assertEquals(
        GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
        60,
        'the badge lasts half of the 120-frame countdown'
      );
      assertEquals(
        GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
        0.65,
        'the first frame keeps the gold readable'
      );
      assert(
        GAME_CONFIG.UPDATED_NEW_BEST_FRAMES < GAME_CONFIG.NEW_BEST_FRAMES,
        'the badge is shorter than the Classic countdown'
      );
      assert(GAME_CONFIG.UPDATED_NEW_BEST_FONT_PX < 14, 'the type is smaller than Classic');
      assert(GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA < 1, 'the peak is quieter than solid gold');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        Animations.milestoneFrames = 0;
        const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
        assertEquals(first.calls.length, 1, mode + ' still paints NEW BEST on the first frame');
        assertEquals(first.calls[0].text, 'NEW BEST!', mode + ' still celebrates');
        assertEquals(first.calls[0].font, QUIET_FONT, mode + ' uses the smaller type');
        assertEquals(
          first.calls[0].alpha,
          GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' opens at the quiet peak'
        );
        assertEquals(first.calls[0].fill, '#ffd700', mode + ' stays gold');
        assertEquals(first.calls[0].y, 70, mode + ' stays in the corner');
        assertEquals(
          first.framesAfter,
          GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          mode + ' drawing leaves its shorter timer to updateRunning (C5)'
        );

        const mid = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES / 2);
        assert(
          Math.abs(mid.calls[0].alpha - GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA * 0.5) < 1e-12,
          mode + ' fades from the quiet peak'
        );
        assertEquals(
          mid.calls[0].font,
          QUIET_FONT,
          mode + ' stays on the small type while it fades'
        );

        const last = paintBadge(1);
        assertEquals(last.calls.length, 1, mode + ' still paints on the last quiet frame');
        assert(
          last.calls[0].alpha > 0 && last.calls[0].alpha < GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' has faded below the peak by the last frame'
        );

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
      withTuning(
        {
          UPDATED_NEW_BEST_FONT_PX: 13,
          UPDATED_NEW_BEST_PEAK_ALPHA: 0.4,
          UPDATED_NEW_BEST_FRAMES: 24,
        },
        () => {
          assertEquals(newBestDuration(), 24, 'a frame tune inside 1..120 is the countdown');
          const first = paintBadge(24);
          assertEquals(
            first.calls[0].font,
            "bold 13px 'Courier New', Courier, monospace",
            'a size inside 10..13 is used'
          );
          assertEquals(first.calls[0].alpha, 0.4, 'a peak inside 0..1 is used');
          assertEquals(first.calls[0].fill, '#ffd700', 'a tune does not recolor the gold');
        }
      );
      withTuning(
        {
          UPDATED_NEW_BEST_FONT_PX: 14,
          UPDATED_NEW_BEST_PEAK_ALPHA: 2,
          UPDATED_NEW_BEST_FRAMES: 0,
        },
        () => {
          assertEquals(
            newBestDuration(),
            GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
            'a zero frame tune falls back to 60'
          );
          const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
          assertEquals(first.calls[0].font, QUIET_FONT, '14px is outside 10..13 and falls back');
          assertEquals(
            first.calls[0].alpha,
            GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            'a peak above 1 falls back'
          );
        }
      );
      withTuning(
        {
          UPDATED_NEW_BEST_FRAMES: 500,
          UPDATED_NEW_BEST_FONT_PX: 'big',
          UPDATED_NEW_BEST_PEAK_ALPHA: -0.2,
        },
        () => {
          assertEquals(
            newBestDuration(),
            GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
            'a frame tune past the Classic countdown falls back'
          );
          const first = paintBadge(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES);
          assertEquals(first.calls[0].font, QUIET_FONT, 'a non-number size falls back');
          assertEquals(
            first.calls[0].alpha,
            GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            'a negative peak falls back'
          );
        }
      );
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
      assertEquals(
        newBestDuration(),
        GAME_CONFIG.NEW_BEST_FRAMES,
        'reduced motion does not shorten Classic'
      );
      const classic = paintBadge(GAME_CONFIG.NEW_BEST_FRAMES);
      assertEquals(classic.calls[0].font, CLASSIC_FONT, 'reduced motion does not resize Classic');
      assertEquals(classic.calls[0].alpha, 1, 'reduced motion does not fade Classic');
      assertEquals(classic.calls[0].fill, '#ffd700', 'reduced motion does not recolor Classic');

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        game.mode = mode;
        const half = Math.max(2, Math.round(GAME_CONFIG.UPDATED_NEW_BEST_FRAMES * 0.5));
        assertEquals(newBestDuration(), half, mode + ' reduced motion halves the quiet countdown');
        assert(
          half < GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          mode + ' reduced-motion badge is shorter than the motion-allowed badge'
        );
        const first = paintBadge(half);
        assertEquals(
          first.calls[0].font,
          QUIET_FONT,
          mode + ' stays on the small type under reduced motion'
        );
        assertEquals(
          first.calls[0].alpha,
          GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          mode + ' keeps the quiet peak so the gold still reads'
        );
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
      setQaFlag('newBest', false);
      for (const mode of [MODES.UPDATED, MODES.DAILY, MODES.CLASSIC]) {
        armFreshRun();
        game.mode = mode;
        game.highScore = 1;
        game.score = 2;
        const gapBefore = game.nextSpawnGap;
        const seedBefore = game.runSeed;
        const rngBefore = game.rng;
        let rngCalls = 0;
        game.rng = () => {
          rngCalls++;
          return rngBefore();
        };
        const spy = spyText();
        try {
          tick();
          const expected =
            mode === MODES.CLASSIC
              ? GAME_CONFIG.NEW_BEST_FRAMES
              : GAME_CONFIG.UPDATED_NEW_BEST_FRAMES;
          assertEquals(game.newBestShown, true, mode + ' still latches the once-per-run badge');
          assertEquals(
            Animations.newBestFrames,
            expected,
            mode + ' starts the full mode countdown and paints the first frame'
          );
          assertEquals(
            a11yLive.textContent,
            'New best score!',
            mode + ' still announces the new best'
          );
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' paints the badge once on the beat frame');
          assertEquals(painted[0].fill, '#ffd700', mode + ' beat frame stays gold');
          if (mode === MODES.CLASSIC) {
            assertEquals(painted[0].font, CLASSIC_FONT, 'the beat frame stays 14px in Classic');
            assertEquals(painted[0].alpha, 1, 'the beat frame stays full gold in Classic');
          } else {
            assertEquals(painted[0].font, QUIET_FONT, mode + ' beat frame uses the quiet type');
            assertEquals(
              painted[0].alpha,
              GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
              mode + ' beat frame uses the quiet peak'
            );
          }
          assertEquals(game.highScore, 1, mode + ' badge does not write the stored high score');
          assertEquals(
            game.score,
            2 + GAME_CONFIG.SCORE_INCREMENT,
            mode + ' score still advances by the normal increment'
          );
          assertEquals(
            game.currentSpeed,
            DifficultyProfile.speedAtScore(game.score),
            mode + ' speed still follows the score'
          );
          assertEquals(game.nextSpawnGap, gapBefore, mode + ' does not change the spawn gap');
          assertEquals(game.runSeed, seedBefore, mode + ' does not change the run seed');
          assertEquals(
            game.currentSpeed,
            DifficultyProfile.speedAtScore(game.score),
            mode + ' speed on the next read still follows the score'
          );
          const again = rngCalls;
          tick();
          assertEquals(Animations.newBestFrames, expected - 1, mode + ' keeps counting down');
          assert(rngCalls >= again, mode + ' later frames do not rewind gameplay rng');
        } finally {
          spy.restore();
          game.rng = rngBefore;
        }
      }
    } finally {
      game.mode = origMode;
      a11yLive.textContent = origText;
      setQaFlag('newBest', false);
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
      setQaFlag('newBest', false);
      assert(readQaFlag('newBest', '?qaNewBest=1') === true, '?qaNewBest=1 should hold the badge');
      assert(
        readQaFlag('newBest', '?qaLevel=1&qaNewBest=1') === true,
        'the flag should work beside other params'
      );
      assert(
        readQaFlag('newBest', '?qaNewBest=1&qaScorePop=1') === true,
        'param order should not matter'
      );
      assert(readQaFlag('newBest', '?qaNewBest=0') === false, 'only the value 1 enables the flag');
      assert(
        readQaFlag('newBest', '?qaNewBest=12') === false,
        'qaNewBest=12 must not count as the flag'
      );
      assert(
        readQaFlag('newBest', '?qaLevel=1') === false,
        'the level flag must not hold this badge'
      );
      assert(
        readQaFlag('newBest', '?qaScorePop=1') === false,
        'the score-pop flag must not hold this badge'
      );
      assert(
        readQaFlag('level', '?qaNewBest=1') === false,
        'this flag must not fire the level wash'
      );
      assert(
        readQaFlag('scorePop', '?qaNewBest=1') === false,
        'this flag must not swell the score'
      );

      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun();
        game.mode = mode;
        setQaFlag('newBest', true);
        const seed = game.runSeed;
        const gap = game.nextSpawnGap;
        const high = game.highScore;
        const rngBefore = game.rng;
        let rngCalls = 0;
        game.rng = () => {
          rngCalls++;
          return rngBefore();
        };
        const spy = spyText();
        try {
          tick();
          assertEquals(
            game.qaNewBestHold,
            QA_NEW_BEST_HOLD,
            mode + ' latches the full capture window'
          );
          assertEquals(game.qaNewBestShown, true, mode + ' spends the latch once');
          assertEquals(game.newBestShown, false, mode + ' hold does not spend the real badge');
          assertEquals(
            Animations.newBestFrames,
            0,
            mode + ' hold does not start the live countdown'
          );
          assertEquals(
            a11yLive.textContent.indexOf('New best score!') === -1,
            true,
            mode + ' hold does not announce a new best'
          );
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' paints the held badge once');
          assertEquals(painted[0].font, QUIET_FONT, mode + ' hold uses the quiet type');
          assertEquals(
            painted[0].alpha,
            GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            mode + ' hold uses the quiet peak'
          );
          assertEquals(painted[0].fill, '#ffd700', mode + ' hold stays gold');
          assertEquals(painted[0].y, 70, mode + ' hold stays in the corner');
          assertEquals(game.highScore, high, mode + ' hold does not write the high score');
          assertEquals(
            game.score,
            GAME_CONFIG.SCORE_INCREMENT,
            mode + ' score still starts from zero'
          );
          assertEquals(game.nextSpawnGap, gap, mode + ' hold does not change the spawn gap');
          assertEquals(game.runSeed, seed, mode + ' hold does not change the run seed');
          assertEquals(
            game.currentSpeed,
            DifficultyProfile.speedAtScore(game.score),
            mode + ' speed still follows the score'
          );
          const afterFirst = rngCalls;
          spy.calls.length = 0;
          tick();
          assertEquals(
            game.qaNewBestHold,
            QA_NEW_BEST_HOLD - 1,
            mode + ' hold counts down while running'
          );
          assertEquals(badgeCalls(spy.calls).length, 1, mode + ' hold keeps painting');
          assertEquals(rngCalls, afterFirst, mode + ' the hold frame does not draw gameplay rng');
        } finally {
          spy.restore();
          game.rng = rngBefore;
        }
      }

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaFlag('newBest', true);
      const classicSpy = spyText();
      try {
        tick();
        tick();
        assertEquals(game.qaNewBestHold, 0, 'Classic does not start the hold');
        assertEquals(game.qaNewBestShown, false, 'Classic does not spend the Updated latch');
        assertEquals(
          badgeCalls(classicSpy.calls).length,
          0,
          'Classic does not paint an early NEW BEST'
        );
        assertEquals(Animations.newBestFrames, 0, 'Classic hold does not start the live countdown');
      } finally {
        classicSpy.restore();
      }
    } finally {
      game.mode = origMode;
      setQaFlag('newBest', false);
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
        assertEquals(
          painted[0].alpha,
          GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
          'the visible badge is the quiet hold, not a second full-gold copy'
        );
        assertEquals(painted[0].font, QUIET_FONT, 'the stacked frame stays on the quiet type');
        assertEquals(
          Animations.newBestFrames,
          GAME_CONFIG.UPDATED_NEW_BEST_FRAMES,
          'drawing under the hold does not move the live countdown (C5)'
        );
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
        setQaFlag('newBest', true);
        const spy = spyText();
        try {
          tick();
          assertEquals(
            game.qaNewBestHold,
            qaHoldFrames('newBest'),
            mode + ' hold uses the shorter window'
          );
          assertEquals(game.qaNewBestHold, 90, mode + ' reduced motion halves the 180-frame hold');
          assert(
            game.qaNewBestHold < QA_NEW_BEST_HOLD,
            mode + ' hold is shorter than the full capture'
          );
          assert(qaHoldFrames('newBest') >= 2, mode + ' hold still lasts long enough to see');
          const painted = badgeCalls(spy.calls);
          assertEquals(painted.length, 1, mode + ' reduced motion still paints the badge');
          assertEquals(
            painted[0].alpha,
            qaNewBestPaintAlpha(),
            mode + ' reduced motion holds the damped peak'
          );
          assert(
            painted[0].alpha < GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
            mode + ' damped hold is softer than the motion-allowed peak'
          );
          assert(painted[0].alpha > 0, mode + ' damped hold still reads');
          assertEquals(painted[0].font, QUIET_FONT, mode + ' damped hold stays on the small type');
          assertEquals(painted[0].fill, '#ffd700', mode + ' damped hold stays gold');
          assertEquals(
            game.newBestShown,
            false,
            mode + ' damped hold does not spend the real badge'
          );
          assertEquals(
            Animations.newBestFrames,
            0,
            mode + ' damped hold does not arm the live countdown'
          );
          assert(game.score < 1, mode + ' damped hold must not write the score');
        } finally {
          spy.restore();
        }
      }
    } finally {
      game.mode = origMode;
      setQaFlag('newBest', false);
      setReducedMotion(false);
      game.qaNewBestHold = 0;
      ctx.globalAlpha = 1;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaNewBest=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyText();
    setPageQuery('?qaNewBest=1');
    try {
      setQaFlag('newBest', false);
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
      assertEquals(
        badgeCalls(spy.calls)[0].alpha,
        GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA,
        're-read flag uses the quiet peak'
      );
      assertEquals(game.qaNewBestHold, QA_NEW_BEST_HOLD, 'the re-read flag latches the hold');
      assertEquals(game.qaNewBestShown, true, 'the re-read flag spends the latch');
      assertEquals(game.newBestShown, false, 'the re-read flag does not spend the real badge');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.highScore, 40, 're-reading the flag must not change the high score');
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('newBest', false);
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
      setQaFlag('newBest', true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      assertEquals(
        badgeCalls(spy.calls).length,
        1,
        'the hold still paints after the collision return'
      );
      assertEquals(badgeCalls(spy.calls)[0].font, QUIET_FONT, 'the death-frame hold stays quiet');
      assertEquals(
        game.newBestShown,
        false,
        'dying on the QA frame does not latch a real new best'
      );
      assertEquals(
        Animations.newBestFrames,
        0,
        'dying on the QA frame does not start the live countdown'
      );
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('newBest', false);
      game.obstacles.length = 0;
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Soft death score count-up', () => {
  const QUIET_FRAMES = 18;

  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
    game.rng = () => {
      rngCalls++;
      return 0;
    };
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
      assertEquals(
        updated.scores[QUIET_FRAMES - 1],
        '00500',
        'Updated frame 18 draws the full score'
      );
      assertEquals(updated.rngCalls, 0, 'the count-up does not consume the run seed');
      assertEquals(game.score, 500, 'the count-up does not change the score');
      assertEquals(
        game.currentSpeed,
        GAME_CONFIG.INITIAL_SPEED,
        'the count-up does not change speed'
      );
      assertEquals(game.highScore, 900, 'the count-up does not change the high score');
      assertEquals(game.dailyBest, 400, 'the count-up does not change daily best');
      assertEquals(
        localStorage.getItem('dino-daily-best'),
        storedDaily,
        'the count-up does not write daily best'
      );

      armDead(MODES.DAILY, 500);
      const daily = rollCountUp();
      assertEquals(daily.steps, QUIET_FRAMES, 'Daily uses the same shorter roll');
      assertEquals(daily.scores[QUIET_FRAMES - 1], '00500', 'Daily frame 18 draws the full score');

      armDead(MODES.CLASSIC, 500);
      const classic = rollCountUp();
      assertEquals(
        classic.steps,
        GAME_CONFIG.DEATH_ANIM_FRAMES,
        'Classic still rolls for 30 frames'
      );
      assertEquals(
        classic.scores[QUIET_FRAMES - 1],
        '00300',
        'Classic frame 18 is still sixty percent of the score'
      );
      assertEquals(
        classic.scores[GAME_CONFIG.DEATH_ANIM_FRAMES - 1],
        '00500',
        'Classic frame 30 draws the full score'
      );

      setReducedMotion(true);
      armDead(MODES.UPDATED, 500);
      const halved = rollCountUp();
      assertEquals(halved.steps, 9, 'reduced motion halves the Updated roll');
      assertEquals(halved.scores[8], '00500', 'the halved roll still reaches the full score');
      armDead(MODES.DAILY, 500);
      assertEquals(rollCountUp().steps, 9, 'reduced motion halves the Daily roll');
      armDead(MODES.CLASSIC, 500);
      assertEquals(
        rollCountUp().steps,
        GAME_CONFIG.DEATH_ANIM_FRAMES,
        'reduced motion leaves the Classic roll at 30'
      );
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
    stubElementStyle(shareBtn, { display: 'none' });
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
      assert(
        !early.includes('Share TODAY BEST with Copy result'),
        'the hint waits until the shorter roll finishes'
      );
      assertEquals(
        shareBtn.style.display,
        'none',
        'Copy result stays hidden until the shorter roll finishes'
      );

      Animations.deathAnimFrame = 18;
      const settled = [];
      ctx.fillText = (text) => settled.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(
        settled.includes('Share TODAY BEST with Copy result'),
        'the hint appears on the Updated/Daily frame 18'
      );
      assertEquals(shareBtn.style.display, 'block', 'Copy result appears with the hint');
      assertEquals(shareBtn.textContent, '📋 Copy result', 'the share label stays Copy result');

      game.mode = MODES.UPDATED;
      shareBtn.style.display = 'block';
      const updated = [];
      ctx.fillText = (text) => updated.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(
        !updated.includes('Share TODAY BEST with Copy result'),
        'Updated free play still does not draw the Daily hint'
      );

      setReducedMotion(true);
      game.mode = MODES.DAILY;
      Animations.deathAnimFrame = 8;
      shareBtn.style.display = 'block';
      drawGameOverScreen();
      assertEquals(
        shareBtn.style.display,
        'none',
        'reduced motion keeps Copy result hidden until the halved roll finishes'
      );
      Animations.deathAnimFrame = 9;
      const damped = [];
      ctx.fillText = (text) => damped.push(String(text));
      drawGameOverScreen();
      ctx.fillText = origFill;
      assert(
        damped.includes('Share TODAY BEST with Copy result'),
        'reduced motion shows the hint once the halved roll finishes'
      );
      assertEquals(
        shareBtn.style.display,
        'block',
        'reduced motion shows Copy result with that hint'
      );
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
      restoreElementStyle(shareBtn, origStyle);
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
      assertEquals(
        Animations.deathAnimFrame,
        GAME_CONFIG.DEATH_ANIM_FRAMES,
        'Classic skip still jumps to frame 30'
      );

      game.mode = MODES.UPDATED;
      game.state = STATE.DEAD;
      Animations.deathAnimFrame = 18;
      handleAction();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(
        game.state,
        STATE.WAITING,
        'Updated frame 18 is the end of the roll, so space restarts'
      );
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
      assert(
        typeof deathAnimFrames === 'function',
        'deathAnimFrames should be the mode-correct length'
      );
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
        assertEquals(deathAnimFrames(), QUIET_FRAMES, 'a tune past Classic 30 falls back to 18');
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
        assertEquals(
          deathAnimFrames(),
          GAME_CONFIG.DEATH_ANIM_FRAMES,
          'Classic ignores the Updated length'
        );
        assertEquals(
          rollCountUp().steps,
          GAME_CONFIG.DEATH_ANIM_FRAMES,
          'Classic still rolls for 30 frames'
        );
      });

      game.mode = MODES.DAILY;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 10 }, () => {
        assertEquals(deathAnimFrames(), 10, 'Daily shares the Updated length tune');
      });

      setReducedMotion(true);
      game.mode = MODES.UPDATED;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 1 }, () => {
        assertEquals(
          deathAnimFrames(),
          2,
          'reduced motion keeps a positive length when the tune is 1'
        );
      });
      game.mode = MODES.CLASSIC;
      withTuning({ UPDATED_DEATH_ANIM_FRAMES: 12 }, () => {
        assertEquals(
          deathAnimFrames(),
          GAME_CONFIG.DEATH_ANIM_FRAMES,
          'reduced motion does not shorten Classic'
        );
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
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      assertEquals(GAME_CONFIG.UPDATED_IDLE_PULSE_BASE, QUIET_BASE, 'the quiet floor is 0.4');
      assertEquals(GAME_CONFIG.UPDATED_IDLE_PULSE_AMPLITUDE, QUIET_AMP, 'the quiet swing is 0.15');
      assertEquals(
        GAME_CONFIG.UPDATED_IDLE_PULSE_RATE,
        QUIET_RATE,
        'the quiet breath is slower than Classic 0.08'
      );
      assert(QUIET_RATE < 0.08, 'the quiet rate must be slower than Classic');
      assert(
        QUIET_BASE >= CLASSIC_MIN && QUIET_BASE + QUIET_AMP <= CLASSIC_MAX,
        'the quiet band must sit inside Classic 0.3–0.7'
      );

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
          assertEquals(
            painted.alpha,
            rounded(classicAlpha(frame)),
            (reduced ? 'reduced motion' : 'motion') +
              ' Classic frame ' +
              frame +
              ' keeps the old pulse'
          );
        }
        assertNotEquals(
          promptAlpha(0).alpha,
          promptAlpha(40).alpha,
          'Classic still breathes under reduced=' + reduced
        );
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
          assertEquals(
            promptAlpha(frame).alpha,
            first,
            mode + ' reduced motion does not sample sin at frame ' + frame
          );
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
      assertEquals(
        scrim.rect[2],
        GAME_CONFIG.CANVAS_W,
        'the dim card covers the board, not the raw bitmap'
      );
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
        [
          { UPDATED_IDLE_PULSE_BASE: 0.5, UPDATED_IDLE_PULSE_AMPLITUDE: 0.3 },
          'a pair that peaks past 0.7',
        ],
        [{ UPDATED_IDLE_PULSE_AMPLITUDE: 'loud' }, 'a non-number swing'],
        [{ UPDATED_IDLE_PULSE_RATE: 1 }, 'a rate faster than Classic'],
        [{ UPDATED_IDLE_PULSE_RATE: 0 }, 'a frozen rate'],
        [{ UPDATED_IDLE_PULSE_RATE: -0.2 }, 'a negative rate'],
      ];
      for (const [tune, label] of cases) {
        withTuning(tune, () => {
          for (const frame of [0, 2, 20, 31, 40]) {
            assertEquals(
              promptAlpha(frame).alpha,
              fallbackAt(frame),
              label + ' falls back at frame ' + frame
            );
          }
        });
      }

      withTuning(
        {
          UPDATED_IDLE_PULSE_BASE: 0.42,
          UPDATED_IDLE_PULSE_AMPLITUDE: 0.08,
          UPDATED_IDLE_PULSE_RATE: 0.04,
        },
        () => {
          const frame = 10;
          assertEquals(
            promptAlpha(frame).alpha,
            rounded(quietAlpha(frame, 0.42, 0.08, 0.04)),
            'a tune inside the Classic band is honored'
          );
          assert(0.42 + 0.08 <= CLASSIC_MAX, 'the honored tune still ends at or under 0.7');
        }
      );
    } finally {
      game.mode = origMode;
      setReducedMotion(false);
    }
  });
});

describe('Squash and stretch, landing slam (M1)', () => {
  const m1WithMode = (mode, fn) => {
    const orig = {
      mode: game.mode,
      state: game.state,
      isJumping: dino.isJumping,
      velocityY: dino.velocityY,
      frames: dino.landSquashFrames,
      hard: dino.landSquashHard,
    };
    game.mode = mode;
    try {
      fn();
    } finally {
      game.mode = orig.mode;
      game.state = orig.state;
      setReducedMotion(false);
      dino.isJumping = orig.isJumping;
      dino.velocityY = orig.velocityY;
      dino.landSquashFrames = orig.frames;
      dino.landSquashHard = orig.hard;
    }
  };

  it('stretches in the air with speed, flat on the ground', () => {
    m1WithMode(MODES.UPDATED, () => {
      game.state = STATE.RUNNING;
      dino.landSquashFrames = 0;
      dino.isJumping = false;
      assertEquals(dinoSquashScale().sy, 1, 'standing is unscaled');
      dino.isJumping = true;
      dino.velocityY = GAME_CONFIG.JUMP_POWER;
      const fast = dinoSquashScale();
      assert(
        Math.abs(fast.sy - (1 + GAME_CONFIG.DINO_STRETCH_MAX)) < 1e-9,
        'full stretch at take-off'
      );
      assert(fast.sx < 1, 'narrower while stretched');
      dino.velocityY = 0.2;
      assert(dinoSquashScale().sy < fast.sy, 'almost no stretch at the peak');
    });
  });

  it('a landing squashes and eases back; a slam squashes harder', () => {
    m1WithMode(MODES.UPDATED, () => {
      game.state = STATE.RUNNING;
      dino.isJumping = false;
      dino.landSquashFrames = GAME_CONFIG.DINO_SQUASH_FRAMES;
      dino.landSquashHard = false;
      const soft = dinoSquashScale();
      assert(Math.abs(soft.sy - (1 - GAME_CONFIG.DINO_LAND_SQUASH)) < 1e-9, 'land squash');
      assert(soft.sx > 1, 'wider while squashed');
      dino.landSquashHard = true;
      assert(dinoSquashScale().sy < soft.sy, 'slam is flatter');
      dino.landSquashFrames = 1;
      assert(dinoSquashScale().sy > soft.sy, 'eases back toward 1');
    });
  });

  it('Classic, reduced motion and the death pose stay unscaled', () => {
    for (const setup of [
      () => (game.mode = MODES.CLASSIC),
      () => setReducedMotion(true),
      () => (game.state = STATE.DEAD),
    ]) {
      m1WithMode(MODES.UPDATED, () => {
        game.state = STATE.RUNNING;
        dino.isJumping = true;
        dino.velocityY = GAME_CONFIG.JUMP_POWER;
        setup();
        const s = dinoSquashScale();
        assertEquals(s.sx, 1);
        assertEquals(s.sy, 1);
      });
    }
  });

  it('landing from a fast fall sets the slam squash and throws more dust', () => {
    const origMode = game.mode;
    game.mode = MODES.UPDATED;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      handleAction();
      for (let i = 0; i < 20; i++) {
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
      }
      dropDino();
      let air = 0;
      while (dino.isJumping && air < 100) {
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        air++;
      }
      assert(dino.landSquashHard, 'slam recorded');
      assertEquals(dino.landSquashFrames, GAME_CONFIG.DINO_SQUASH_FRAMES);
      const live = Particles.particles.filter((p) => p.life > 0).length;
      assert(live >= Particles.KINDS.land.count, `slam dust ${live}`);
      assert(Particles.KINDS.slam.count > Particles.KINDS.land.count, 'slam is the heavier burst');
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('drawDino scales the sprite at the feet', () => {
    m1WithMode(MODES.UPDATED, () => {
      game.state = STATE.RUNNING;
      dino.isJumping = false;
      dino.landSquashFrames = GAME_CONFIG.DINO_SQUASH_FRAMES;
      dino.landSquashHard = false;
      const orig = ctx.drawImage;
      let args = null;
      ctx.drawImage = (...a) => {
        args = a;
      };
      try {
        drawDino();
      } finally {
        ctx.drawImage = orig;
      }
      assert(args, 'sprite drawn');
      {
        const [, x, y, w, h] = args;
        assert(h < dino.height, 'drawn shorter');
        assert(Math.abs(y + h - (dino.y + dino.height)) < 1e-9, 'feet stay on the ground');
        assert(Math.abs(x + w / 2 - (dino.x + dino.width / 2)) < 1e-9, 'centred');
      }
    });
  });
});

describe('Speed streaks and slam kick (M2)', () => {
  const m2With = (mode, speed, fn) => {
    const orig = { mode: game.mode, speed: game.currentSpeed, kick: Animations.slamKickFrames };
    game.mode = mode;
    game.currentSpeed = speed;
    try {
      fn();
    } finally {
      game.mode = orig.mode;
      game.currentSpeed = orig.speed;
      Animations.slamKickFrames = orig.kick;
      setReducedMotion(false);
    }
  };

  it('streaks fade in with speed in Updated and Daily', () => {
    m2With(MODES.UPDATED, GAME_CONFIG.SPEED_LINES_START_SPEED, () => {
      assertEquals(speedLinesAlpha(), 0, 'none at the start speed');
      game.currentSpeed =
        (GAME_CONFIG.SPEED_LINES_START_SPEED + GAME_CONFIG.SPEED_LINES_FULL_SPEED) / 2;
      const mid = speedLinesAlpha();
      assert(mid > 0 && mid < GAME_CONFIG.SPEED_LINES_ALPHA, `half way ${mid}`);
      game.currentSpeed = GAME_CONFIG.SPEED_LINES_FULL_SPEED + 3;
      assertEquals(speedLinesAlpha(), GAME_CONFIG.SPEED_LINES_ALPHA);
      game.mode = MODES.DAILY;
      assertEquals(speedLinesAlpha(), GAME_CONFIG.SPEED_LINES_ALPHA);
    });
  });

  it('Classic and reduced motion never show streaks', () => {
    m2With(MODES.CLASSIC, 12, () => {
      assertEquals(speedLinesAlpha(), 0);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      assertEquals(speedLinesAlpha(), 0);
    });
  });

  it('streaks stay in the sky band above the obstacle lane', () => {
    m2With(MODES.UPDATED, 12, () => {
      const orig = { moveTo: ctx.moveTo, lineTo: ctx.lineTo, alpha: ctx.globalAlpha };
      const ys = [];
      ctx.moveTo = (x, y) => ys.push(y);
      ctx.lineTo = (x, y) => ys.push(y);
      try {
        drawSpeedLines();
      } finally {
        ctx.moveTo = orig.moveTo;
        ctx.lineTo = orig.lineTo;
        ctx.globalAlpha = orig.alpha;
      }
      assertEquals(ys.length, GAME_CONFIG.SPEED_LINES_COUNT * 2);
      const lowestObstacleTop = Math.min(
        ...GAME_CONFIG.OBSTACLE_TYPES.filter((t) => !t.y).map(
          (t) => GAME_CONFIG.CANVAS_H - t.height
        )
      );
      assert(Math.max(...ys) < lowestObstacleTop, 'above every ground obstacle');
    });
  });

  it('a slam starts the kick, which eases out and stays off in Classic or reduced motion', () => {
    m2With(MODES.UPDATED, 5, () => {
      Animations.slamKickFrames = GAME_CONFIG.SLAM_KICK_FRAMES;
      assertEquals(slamKickOffset(), GAME_CONFIG.SLAM_KICK_PX);
      Animations.slamKickFrames = 1;
      assert(slamKickOffset() > 0 && slamKickOffset() < GAME_CONFIG.SLAM_KICK_PX, 'easing');
      Animations.slamKickFrames = 0;
      assertEquals(slamKickOffset(), 0);
      Animations.slamKickFrames = 3;
      setReducedMotion(true);
      assertEquals(slamKickOffset(), 0);
      setReducedMotion(false);
      game.mode = MODES.CLASSIC;
      assertEquals(slamKickOffset(), 0);
    });
  });

  it('landing from a fast fall sets the kick; a normal landing does not; reset clears it', () => {
    const origMode = game.mode;
    game.mode = MODES.UPDATED;
    const fly = (drop) => {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      handleAction();
      let air = 0;
      while (dino.isJumping && air < 100) {
        if (drop && air === 20) dropDino();
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
        air++;
      }
    };
    try {
      fly(false);
      assertEquals(Animations.slamKickFrames, 0, 'normal landing');
      fly(true);
      assertEquals(Animations.slamKickFrames, GAME_CONFIG.SLAM_KICK_FRAMES, 'slam landing');
      Animations.reset();
      assertEquals(Animations.slamKickFrames, 0);
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('Second-jump flip and puff (M3)', () => {
  const m3With = (fn) => {
    const orig = { mode: game.mode, state: game.state, frames: dino.flipFrames };
    game.mode = MODES.UPDATED;
    game.state = STATE.RUNNING;
    try {
      fn();
    } finally {
      game.mode = orig.mode;
      game.state = orig.state;
      dino.flipFrames = orig.frames;
      setReducedMotion(false);
    }
  };

  it('turns one full circle over the flip frames', () => {
    m3With(() => {
      const total = GAME_CONFIG.DOUBLE_JUMP_FLIP_FRAMES;
      dino.flipFrames = total;
      assertEquals(dinoFlipAngle(), 0, 'starts upright');
      dino.flipFrames = total / 2;
      assert(Math.abs(dinoFlipAngle() - Math.PI) < 1e-9, 'half way is upside down');
      dino.flipFrames = 0;
      assertEquals(dinoFlipAngle(), 0, 'upright when done');
    });
  });

  it('no turn in Classic, under reduced motion or in the death pose', () => {
    for (const setup of [
      () => (game.mode = MODES.CLASSIC),
      () => setReducedMotion(true),
      () => (game.state = STATE.DEAD),
    ]) {
      m3With(() => {
        dino.flipFrames = GAME_CONFIG.DOUBLE_JUMP_FLIP_FRAMES / 2;
        setup();
        assertEquals(dinoFlipAngle(), 0);
      });
    }
  });

  it('a second jump throws a mid-air puff', () => {
    const origMode = game.mode;
    game.mode = MODES.UPDATED;
    try {
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.graceFrames = 100000;
      handleAction();
      for (let i = 0; i < 30; i++) {
        gameLoop();
        cancelAnimationFrame(game.animationFrameId);
      }
      const before = Particles.particles.filter((p) => p.life > 0).length;
      handleAction();
      const after = Particles.particles.filter((p) => p.life > 0).length;
      assertEquals(after - before, Particles.KINDS.doubleJump.count);
    } finally {
      game.mode = origMode;
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  });
});
