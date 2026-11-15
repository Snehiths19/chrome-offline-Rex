// Unit tests: rendering. The scene: sky, day/night, hills, clouds, stars, ground, the dino and the HUD and screens.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('rendering');

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
    assert(
      game.clouds[0].x < 300,
      `Cloud x (${game.clouds[0].x}) should be < 300 after updateClouds`
    );
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
    assertEquals(
      getBackgroundColor(0),
      '#ffffff',
      `Expected #ffffff at score 0, got ${getBackgroundColor(0)}`
    );
  });

  it('should return #1a1a2e at score 400', () => {
    assertEquals(
      getBackgroundColor(400),
      '#1a1a2e',
      `Expected #1a1a2e at score 400, got ${getBackgroundColor(400)}`
    );
  });

  it('should return the correct interpolated color at score 350', () => {
    assertEquals(
      getBackgroundColor(350),
      '#8d8d97',
      `Score 350 (t=0.5) should produce midpoint color #8d8d97`
    );
  });

  it('returns #ffffff at DAY_NIGHT_START (score 300, t=0 boundary)', () => {
    assertEquals(
      getBackgroundColor(300),
      '#ffffff',
      'Score 300 is the first frame of the interpolation window — t=0 still produces white'
    );
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
      // A browser frame starts at alpha 1 (restore() undoes the last draw);
      // the Node stub's restore() is a no-op, so start there explicitly.
      ctx.globalAlpha = 1;
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
    assert(
      game.score < GAME_CONFIG.DAY_NIGHT_END,
      'one frame from 399 must still be day-side of night'
    );
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
      assertEquals(
        game.stars.length,
        GAME_CONFIG.STAR_COUNT,
        'stars are not re-seeded after the fade'
      );
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
      assertEquals(
        game.starFadeFrames,
        1,
        'Classic still starts the fade on the first night frame'
      );
      assert(
        Math.abs(starFadeAlpha() - 1 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'Classic still steps through the original 48-frame fade'
      );
      runRunningFrames(GAME_CONFIG.UPDATED_STAR_FADE_FRAMES - 1);
      assertEquals(
        game.starFadeFrames,
        GAME_CONFIG.UPDATED_STAR_FADE_FRAMES,
        'Classic keeps counting after Updated would have settled'
      );
      assert(
        Math.abs(
          starFadeAlpha() - GAME_CONFIG.UPDATED_STAR_FADE_FRAMES / GAME_CONFIG.STAR_FADE_FRAMES
        ) < 1e-9,
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
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
    assertEquals(
      GAME_CONFIG.UPDATED_STAR_FADE_FRAMES,
      24,
      'Updated and Daily settle in half that beat'
    );
    assertEquals(
      GAME_CONFIG.UPDATED_STAR_FADE_FRAMES * 2,
      GAME_CONFIG.STAR_FADE_FRAMES,
      'the quieter fade is half of Classic'
    );
    assert(now < threeFifths, 'a full three-fifths of white still outruns the night cactus');
    assert(
      sum(starLifts(threeFifths)) > sum(cactusLifts),
      'three-fifths of full white is still brighter than night cacti'
    );
    assert(sum(nowLifts) > sum(dinoLifts), 'the softer night dino stays under this star whisper');
    assert(sum(nowLifts) < sum(cactusLifts), 'the whisper stays under night cacti');
    assert(
      sum(nowLifts) > sum(cloudLifts(GAME_CONFIG.NIGHT_CLOUD_ALPHA)),
      'white at this peak stays a step above the soft night clouds'
    );
    assert(
      sum(nowLifts) < sum(fullLifts) * 0.5,
      'the field loses a real share of the full-white sparkle'
    );
    assert(now > 0, 'the points still read against the night sky');
  });

  it('Updated and Daily hold the quiet peak; Classic keeps full white; day paints none', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
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
      // The frames above leave whatever alpha their last draw set, because the
      // Node stub's restore() is a no-op. A browser frame starts at 1.
      ctx.globalAlpha = 1;
      assertEquals(starFadeAlpha(), 1, 'the shared fade ramp still finishes');
      assertEquals(
        starPaintAlpha(),
        GAME_CONFIG.NIGHT_STAR_ALPHA,
        'Updated night holds the quiet peak'
      );
      let paints = starPaints();
      assertEquals(paints.length, GAME_CONFIG.STAR_COUNT, 'every Updated star still paints');
      assert(
        paints.every((p) => Math.abs(p.alpha - GAME_CONFIG.NIGHT_STAR_ALPHA) < 1e-9),
        'Updated paint uses the quiet peak'
      );
      assert(
        paints.every((p) => p.w === GAME_CONFIG.STAR_SIZE && p.h === GAME_CONFIG.STAR_SIZE),
        'Updated stars stay the same size'
      );

      game.mode = MODES.DAILY;
      assertEquals(
        starPaintAlpha(),
        GAME_CONFIG.NIGHT_STAR_ALPHA,
        'Daily shares the Updated whisper'
      );

      game.mode = MODES.CLASSIC;
      enterNightRun();
      runRunningFrames(1);
      assert(
        Math.abs(starPaintAlpha() - 1 / GAME_CONFIG.STAR_FADE_FRAMES) < 1e-9,
        'Classic first frame is the full fade step, not the whisper'
      );
      runRunningFrames(GAME_CONFIG.STAR_FADE_FRAMES - 1);
      assertEquals(starPaintAlpha(), 1, 'Classic night still reaches full white');
      ctx.globalAlpha = 1;
      paints = starPaints();
      assertEquals(paints.length, GAME_CONFIG.STAR_COUNT, 'Classic still paints the field');
      assert(
        paints.every((p) => p.alpha === 1),
        'Classic paint stays full white'
      );
      assert(
        paints.every((p) => p.w === GAME_CONFIG.STAR_SIZE),
        'Classic size stays 2'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
      setQaFlag('night', true);
      runRunningFrames(1);
      assert(game.score < 1, 'the whisper must not jump the score to night');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'speed still follows the real score'
      );
      assert(game.starsInitialised, 'the existing night QA flag starts the field');
      assert(
        Math.abs(
          starPaintAlpha() - GAME_CONFIG.NIGHT_STAR_ALPHA / GAME_CONFIG.UPDATED_STAR_FADE_FRAMES
        ) < 1e-9,
        'the first QA frame is the first step of the shorter quiet fade'
      );
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      assertEquals(
        starPaintAlpha(),
        GAME_CONFIG.NIGHT_STAR_ALPHA,
        'a settled QA night holds the quiet peak'
      );
      assert(game.score < 1, 'settling the fade must not write the score');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'settling the fade must not invent a speed'
      );

      game.mode = MODES.CLASSIC;
      assertEquals(starPaintAlpha(), 1, 'QA night still leaves Classic stars full white');
      assert(game.score < 1, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      setQaFlag('night', false);
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
      setQaFlag('night', false);
      setReducedMotion(false);
      game.starsInitialised = true;
      game.stars = [{ x: 4, y: 6 }];
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_STAR_ALPHA: 0.2 }, () => {
        assertEquals(
          starPaintAlpha(),
          0.2,
          'a visual override should quiet night stars by the tuned amount'
        );
      });
      assertEquals(
        starPaintAlpha(),
        GAME_CONFIG.NIGHT_STAR_ALPHA,
        'clearing the override returns the configured whisper'
      );
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
        assertEquals(
          starPaintAlpha(),
          GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a non-numeric override falls back to the configured whisper'
        );
      });
      withTuning({ NIGHT_STAR_ALPHA: 1.4 }, () => {
        assertEquals(
          starPaintAlpha(),
          GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a peak above 1 falls back so a typo cannot restore the sparkle'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
      setQaFlag('night', false);
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
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    const randoms = [];
    const origRandom = Math.random;
    Math.random = () => {
      randoms.push(1);
      return origRandom();
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      game.starsInitialised = true;
      game.stars = [
        { x: 20, y: 30 },
        { x: 40, y: 10 },
      ];
      game.starFadeFrames = GAME_CONFIG.STAR_FADE_FRAMES;
      ctx.globalAlpha = 0.8;
      const paints = starPaints();
      assertEquals(paints.length, 2, 'both stars paint');
      assert(
        paints.every((p) => Math.abs(p.alpha - 0.8 * GAME_CONFIG.NIGHT_STAR_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the whisper'
      );
      assertEquals(ctx.globalAlpha, 0.8, 'the whisper must not leak onto the dino or cacti');
      assertEquals(rngCalls, 0, 'painting stars does not consume the run seed');
      assertEquals(randoms.length, 0, 'painting settled stars does not re-roll positions');
      assertEquals(
        game.score,
        GAME_CONFIG.DAY_NIGHT_END,
        'painting stars does not change the score'
      );

      game.mode = MODES.CLASSIC;
      ctx.globalAlpha = 1;
      const classic = starPaints();
      assert(
        classic.every((p) => p.alpha === 1),
        'Classic night paint stays full white'
      );
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
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('Daily settles on the shorter fade, and a tune stops the clock there', () => {
    const origMode = game.mode;
    try {
      setReducedMotion(false);
      setQaFlag('night', false);
      game.mode = MODES.DAILY;
      enterNightRun();
      const total = GAME_CONFIG.UPDATED_STAR_FADE_FRAMES;
      runRunningFrames(1);
      assert(Math.abs(starFadeAlpha() - 1 / total) < 1e-9, 'Daily starts the shorter fade');
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
        assertEquals(
          starPaintAlpha(),
          GAME_CONFIG.NIGHT_STAR_ALPHA,
          'a shorter tune still settles on the quiet peak'
        );
      });
    } finally {
      game.mode = origMode;
      setQaFlag('night', false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    assert(
      calls.some((t) => t === '00042'),
      `Expected '00042' in HUD calls, got: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some((t) => t.includes('Score:')),
      `Expected no 'Score:' prefix, got: ${JSON.stringify(calls)}`
    );
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
    assert(
      calls.some((t) => t.startsWith('HI ')),
      `Expected 'HI ...' label in HUD, got: ${JSON.stringify(calls)}`
    );
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
    assert(
      !calls.some((t) => t.startsWith('HI ')),
      `Expected no 'HI ...' label when highScore is 0, got: ${JSON.stringify(calls)}`
    );
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

    assert(
      !hud.some((t) => t.indexOf('TODAY') !== -1),
      `In-run HUD must not show TODAY, got: ${JSON.stringify(hud)}`
    );
    assert(
      over.some((t) => t === 'TODAY BEST'),
      `Game over must still show TODAY BEST, got: ${JSON.stringify(over)}`
    );
  });
});

describe('Game over screen (polish pass)', () => {
  it('score on game over screen is zero-padded without "Score:" prefix', () => {
    const calls = [];
    const origFill = ctx.fillText;
    const origScore = game.score;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.score = 87;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText = origFill;
    game.score = origScore;
    Animations.deathAnimFrame = origAnimFrame;
    assert(
      calls.some((t) => t === '00087'),
      `Expected '00087' on game over screen, got: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some((t) => t.includes('Score:')),
      `Expected no 'Score:' prefix on game over screen, got: ${JSON.stringify(calls)}`
    );
  });

  it('Best line hidden when highScore is 0 (first run: new record screen, no YOUR BEST)', () => {
    const calls = [];
    const origFill = ctx.fillText;
    const origNewBest = game.isNewBest;
    const origPrevHS = game.previousHighScore;
    const origHS = game.highScore;
    const origScore = game.score;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.isNewBest = true;
    game.previousHighScore = 0;
    game.highScore = 0;
    game.score = 500;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText = origFill;
    game.isNewBest = origNewBest;
    game.previousHighScore = origPrevHS;
    game.highScore = origHS;
    game.score = origScore;
    Animations.deathAnimFrame = origAnimFrame;
    assert(
      !calls.some((t) => t === 'YOUR BEST'),
      `Expected no 'YOUR BEST' on first-run new record screen, got: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some((t) => t.includes('over your previous best')),
      `Expected no delta line on first run (previousHighScore=0), got: ${JSON.stringify(calls)}`
    );
  });

  it('Best line shown when highScore > 0 (normal death side-by-side)', () => {
    const calls = [];
    const origFill = ctx.fillText;
    const origNewBest = game.isNewBest;
    const origHS = game.highScore;
    const origAnimFrame = Animations.deathAnimFrame;
    ctx.fillText = (text) => calls.push(String(text));
    game.isNewBest = false;
    game.highScore = 250;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
    drawGameOverScreen();
    ctx.fillText = origFill;
    game.isNewBest = origNewBest;
    game.highScore = origHS;
    Animations.deathAnimFrame = origAnimFrame;
    assert(
      calls.some((t) => t === 'YOUR BEST'),
      `Expected 'YOUR BEST' in normal death side-by-side, got: ${JSON.stringify(calls)}`
    );
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
    const origHS = game.highScore;
    const origScore = game.score;
    const origState = game.state;
    const origObstacles = game.obstacles;
    const origLastObs = game.lastObstacleX;
    const origNewBest = game.isNewBest;
    const origPrevHS = game.previousHighScore;
    const origGraceFrames = game.graceFrames;

    game.highScore = 1000;
    game.score = 1200;
    game.state = STATE.RUNNING;
    game.graceFrames = 0;
    game.lastObstacleX = canvas.width; // prevent an extra spawn firing
    // Place obstacle exactly at the dino — guaranteed collision regardless of hitbox padding.
    game.obstacles = [
      {
        x: GAME_CONFIG.DINO_X,
        y: dino.y,
        width: GAME_CONFIG.DINO_WIDTH,
        height: GAME_CONFIG.DINO_HEIGHT,
      },
    ];

    gameLoop();
    cancelAnimationFrame(game.animationFrameId);

    assertEquals(game.state, STATE.DEAD, 'collision should set DEAD');
    assertEquals(game.isNewBest, true, 'score 1200 > highScore 1000 → new best');
    assertEquals(game.previousHighScore, 1000, 'previousHighScore should be pre-death highScore');
    assertEquals(game.highScore, 1200, 'highScore should be updated to 1200');

    game.highScore = origHS;
    game.score = origScore;
    game.state = origState;
    game.obstacles = origObstacles;
    game.lastObstacleX = origLastObs;
    game.isNewBest = origNewBest;
    game.previousHighScore = origPrevHS;
    game.graceFrames = origGraceFrames;
  });

  it('resetGame resets isNewBest to false and previousHighScore to 0', () => {
    game.isNewBest = true;
    game.previousHighScore = 999;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(game.isNewBest, false, 'isNewBest should be false after resetGame');
    assertEquals(game.previousHighScore, 0, 'previousHighScore should be 0 after resetGame');
  });

  // --- drawGameOverScreen ---

  it('drawGameOverScreen normal state renders THIS RUN label', () => {
    const origNewBest = game.isNewBest;
    const origHS = game.highScore;
    const origScore = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest = false;
    game.highScore = 1050;
    game.score = 847;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest = origNewBest;
    game.highScore = origHS;
    game.score = origScore;
    Animations.deathAnimFrame = origAnimFrame;

    assert(
      calls.some((t) => t === 'THIS RUN'),
      `Expected 'THIS RUN' in drawGameOverScreen calls, got: ${JSON.stringify(calls)}`
    );
  });

  it('drawGameOverScreen normal state renders gap delta value', () => {
    const origNewBest = game.isNewBest;
    const origHS = game.highScore;
    const origScore = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest = false;
    game.highScore = 1050;
    game.score = 847;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest = origNewBest;
    game.highScore = origHS;
    game.score = origScore;
    Animations.deathAnimFrame = origAnimFrame;

    assert(
      calls.some((t) => t.includes('203')),
      `Expected a call containing '203' (the gap delta), got: ${JSON.stringify(calls)}`
    );
  });

  it('drawGameOverScreen new record state renders NEW BEST header', () => {
    const origNewBest = game.isNewBest;
    const origPrevHS = game.previousHighScore;
    const origScore = game.score;
    const origAnimFrame = Animations.deathAnimFrame;

    game.isNewBest = true;
    game.previousHighScore = 1050;
    game.score = 1253;
    Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;

    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawGameOverScreen();
    ctx.fillText = origFill;

    game.isNewBest = origNewBest;
    game.previousHighScore = origPrevHS;
    game.score = origScore;
    Animations.deathAnimFrame = origAnimFrame;

    assert(
      calls.some((t) => t.includes('NEW BEST')),
      `Expected a call containing 'NEW BEST', got: ${JSON.stringify(calls)}`
    );
  });
});

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
    assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_DAY, 'score 0 → day colour');
    assertEquals(getHillColor(299), GAME_CONFIG.HILL_COLOR_DAY, 'score 299 → day colour');
  });

  it('returns HILL_COLOR_NIGHT at or above DAY_NIGHT_END', () => {
    assertEquals(getHillColor(400), GAME_CONFIG.HILL_COLOR_NIGHT, 'score 400 → night colour');
    assertEquals(getHillColor(1000), GAME_CONFIG.HILL_COLOR_NIGHT, 'score 1000 → night colour');
  });

  it('returns a valid interpolated hex colour in the transition window', () => {
    const mid = getHillColor(350); // midpoint between 300 and 400
    assert(mid !== GAME_CONFIG.HILL_COLOR_DAY, 'midpoint should not be day colour');
    assert(mid !== GAME_CONFIG.HILL_COLOR_NIGHT, 'midpoint should not be night colour');
    assert(/^#[0-9a-f]{6}$/.test(mid), 'must be a valid lowercase 6-digit hex colour');
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
      restore() {
        ctx.ellipse = orig;
      },
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
    assert(
      channels[0] === channels[1] && channels[1] === channels[2],
      'day hills stay a neutral gray silhouette'
    );
    assert(ink < oldInk * 0.75, 'day hills lose a real share of the old #cdcdcd contrast');
    assert(ink > 20, 'the mounds still sit more than twenty levels off the white sky');
    assert(ink > dayCloudInk() * 2, 'the mounds still read in front of the day cloud whisper');
    assert(ink < laneInk / 4, 'day hills stay much softer than the dino and the ground');
  });

  it('twilight still eases, and reduced motion holds the day colour until night', () => {
    try {
      setReducedMotion(false);
      setQaFlag('night', false);
      assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_DAY, 'opening run is the day fill');
      assertEquals(
        getHillColor(GAME_CONFIG.DAY_NIGHT_START - 1),
        GAME_CONFIG.HILL_COLOR_DAY,
        'the ease starts with the sky'
      );
      const mid = getHillColor(350);
      assert(mid !== GAME_CONFIG.HILL_COLOR_DAY, 'mid-twilight has left the day fill');
      assert(mid !== GAME_CONFIG.HILL_COLOR_NIGHT, 'mid-twilight has not snapped to night');
      assertEquals(
        getHillColor(GAME_CONFIG.DAY_NIGHT_END),
        GAME_CONFIG.HILL_COLOR_NIGHT,
        'full night holds the night hill colour'
      );

      setReducedMotion(true);
      assertEquals(
        getHillColor(350),
        GAME_CONFIG.HILL_COLOR_DAY,
        'reduced motion skips the twilight ease'
      );
      assertEquals(
        getHillColor(GAME_CONFIG.DAY_NIGHT_END - 1),
        GAME_CONFIG.HILL_COLOR_DAY,
        'reduced motion stays on the day fill until night is complete'
      );
      assertEquals(
        getHillColor(GAME_CONFIG.DAY_NIGHT_END),
        GAME_CONFIG.HILL_COLOR_NIGHT,
        'reduced motion still snaps to the night hill colour'
      );
    } finally {
      setReducedMotion(false);
      setQaFlag('night', false);
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
      setQaFlag('night', false);
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
      assert(
        paint.seen.every((style) => style === GAME_CONFIG.HILL_COLOR_DAY),
        'the opening screen uses the quieter day fill'
      );

      paint.seen.length = 0;
      game.mode = MODES.DAILY;
      drawHills();
      assertEquals(
        paint.seen.length,
        GAME_CONFIG.HILL_COUNT,
        'Daily shares the Updated day mounds'
      );
      assert(
        paint.seen.every((style) => style === GAME_CONFIG.HILL_COLOR_DAY),
        'Daily opening hills use the same quieter day fill'
      );

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
      setQaFlag('night', false);
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
      setQaFlag('night', true);
      drawHills();
      assertEquals(paint.seen.length, GAME_CONFIG.HILL_COUNT, 'QA night still draws the mounds');
      assert(
        paint.seen.every((style) => style === GAME_CONFIG.HILL_COLOR_NIGHT),
        'the existing night flag is enough to see the night hills'
      );
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
      setQaFlag('night', false);
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
    assert(
      now.channels[2] > now.channels[0],
      'blue stays a step above, so the mound is still night'
    );
    assert(
      now.lifts.every((n) => n > 0),
      'the mounds still sit off the night sky'
    );
    assert(
      Math.abs(now.mean - old.mean * 0.6) < 0.5,
      'the quieter mound keeps about three-fifths of the old #3a3a55 lift'
    );
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
      setQaFlag('night', false);
      setReducedMotion(false);
      window.GAME_TUNING = { HILL_COLOR_NIGHT: '#112233' };
      assertEquals(getHillColor(0), GAME_CONFIG.HILL_COLOR_DAY, 'day fill ignores the night tune');
      assertEquals(getHillColor(GAME_CONFIG.DAY_NIGHT_END), '#112233', 'full night reads the tune');
      assertEquals(getHillColor(1000), '#112233', 'later night keeps the tune');
      window.GAME_TUNING = { HILL_COLOR_NIGHT: 'nope' };
      assertEquals(
        getHillColor(GAME_CONFIG.DAY_NIGHT_END),
        GAME_CONFIG.HILL_COLOR_NIGHT,
        'a bad tune falls back to the shipped night fill'
      );
      assertEquals(game.score, origScore, 'tuning the night fill must not write the score');
    } finally {
      window.GAME_TUNING = origTuning;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });
});

describe('Idle screen', () => {
  it('drawIdleScreen does not throw', () => {
    let threw = false;
    try {
      drawIdleScreen();
    } catch {
      threw = true;
    }
    assert(!threw, 'drawIdleScreen should not throw');
  });

  it('drawIdleScreen renders REX RUN title', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(
      calls.some((t) => t === 'REX RUN'),
      `Expected 'REX RUN' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`
    );
  });

  it('drawIdleScreen renders start prompt', () => {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text) => calls.push(String(text));
    drawIdleScreen();
    ctx.fillText = origFill;
    assert(
      calls.some((t) => t === 'TAP / PRESS SPACE TO START'),
      `Expected 'TAP / PRESS SPACE TO START' in drawIdleScreen calls, got: ${JSON.stringify(calls)}`
    );
  });

  it('handleAction in STATE.IDLE transitions to STATE.WAITING and sets graceFrames', () => {
    const origState = game.state;
    const origGraceFrames = game.graceFrames;

    game.state = STATE.IDLE;
    handleAction();

    const newState = game.state;
    const newGrace = game.graceFrames;

    game.state = origState;
    game.graceFrames = origGraceFrames;

    assertEquals(
      newState,
      STATE.WAITING,
      'handleAction in IDLE should transition to STATE.WAITING'
    );
    assertEquals(
      newGrace,
      GAME_CONFIG.GRACE_FRAMES,
      'handleAction in IDLE should set graceFrames to GAME_CONFIG.GRACE_FRAMES'
    );
  });
});

describe('Night obstacle contrast', () => {
  function placeSmall() {
    const small = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'small');
    game.obstacles = [
      {
        x: 40,
        y: 160,
        width: small.width,
        height: small.height,
        render: small.render,
        type: small.id,
      },
    ];
    return small;
  }

  function filtersDuringDraw() {
    const seen = [];
    const orig = ctx.drawImage;
    ctx.drawImage = (...args) => {
      seen.push(ctx.filter);
      return orig.apply(ctx, args);
    };
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
      setQaFlag('night', false);
      setReducedMotion(false);
      assertEquals(
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        1.65,
        'the night lift stays a quiet brightness step, not a white invert'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(obstacleNightBrightness(), 1, 'day Updated keeps the dark sprite');
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(obstacleNightBrightness(), 1, 'the lift waits until night has fully arrived');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'full night brightens the cactus enough to separate it from the hills'
      );
      game.score = 1000;
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'later night keeps the same static lift'
      );

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'Daily shares the Updated night lift'
      );

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(
        obstacleNightBrightness(),
        1,
        'Classic keeps the dark silhouette on the shared night sky'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('stays static under reduced motion and still lifts at full night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        obstacleNightBrightness(),
        1,
        'reduced motion keeps the day sprite while the sky is still day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'reduced motion still gets the static night lift'
      );
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
      setQaFlag('night', true);
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'the existing night QA flag is enough to see the lift'
      );
      assertEquals(game.score, 0, 'the lift must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(
        obstacleNightBrightness(),
        1,
        'QA night still leaves the Classic silhouette alone'
      );
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('paints the lift only around Updated night sprites and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFilter = ctx.filter;
    try {
      setQaFlag('night', false);
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
      setQaFlag('night', false);
    }
  });

  it('a night cluster still draws two full sprites, only brighter', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'cluster');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'small');
    game.obstacles = [
      {
        x: 100,
        y: 160,
        width: cluster.width,
        height: cluster.height,
        render: cluster.render,
        type: cluster.id,
      },
    ];
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
      assertEquals(
        calls[1][1] - (calls[0][1] + calls[0][3]),
        small.width,
        'The sky gap between the cacti stays one small cactus wide'
      );
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
    ctx.drawImage = (...args) => {
      seen.push(ctx.filter);
      return orig.apply(ctx, args);
    };
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
      setQaFlag('night', false);
      setReducedMotion(false);
      assertEquals(
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        1.2,
        'the night dino lift is the softer brightness step'
      );
      assert(
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS < GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'the dino stays quieter than night cacti so obstacles still win the eye'
      );

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
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'full night brightens the dino enough to separate it from the sky and hills'
      );
      game.animFrame = 0;
      const atRest = dinoNightBrightness();
      game.animFrame = 17;
      assertEquals(
        dinoNightBrightness(),
        atRest,
        'the night lift does not pulse with the run cycle'
      );
      game.score = 1000;
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'later night keeps the same static lift'
      );
      assert(
        dinoNightBrightness() < obstacleNightBrightness(),
        'at the same night score the cactus lift stays stronger'
      );

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'Daily shares the Updated night dino lift'
      );

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      assertEquals(
        dinoNightBrightness(),
        1,
        'Classic keeps the dark silhouette on the shared night sky'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      game.animFrame = origFrame;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('stays static under reduced motion and still lifts at full night', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origFrame = game.animFrame;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        dinoNightBrightness(),
        1,
        'reduced motion keeps the day sprite while the sky is still fading'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      game.animFrame = 0;
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'reduced motion still gets the static night lift'
      );
      game.animFrame = 30;
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'reduced motion does not add a pulse'
      );
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
      setQaFlag('night', true);
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'the existing night QA flag is enough to see the dino lift'
      );
      assertEquals(game.score, 0, 'the lift must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(dinoNightBrightness(), 1, 'QA night still leaves the Classic silhouette alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
      setQaFlag('night', false);
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
      assertEquals(
        filtersDuringSpriteDraw()[0],
        'none',
        'Classic night paint stays the dark sprite'
      );
    } finally {
      game.mode = origMode;
      game.score = origScore;
      ctx.filter = origFilter;
      setQaFlag('night', false);
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
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      dino.isJumping = true;
      // A loaded browser image's naturalWidth is a getter, so shadow it.
      Object.defineProperty(dino.image, 'naturalWidth', {
        configurable: true,
        writable: true,
        value: 0,
      });
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
      setQaFlag('night', false);
    }
  });
});

describe('Night cloud dim', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      setQaFlag('night', false);
      setReducedMotion(false);
      const dayPeak = GAME_CONFIG.DAY_CLOUD_ALPHA;
      const fullInk = 0xff - 0xe8;
      const dayInk = 0xff - dayCloudChannel(dayPeak);
      assert(dayPeak < 1, 'day Updated clouds are quieter than a full #e8e8e8 puff');
      assert(dayPeak > 0, 'the day puff still paints');
      assert(
        dayPeak > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the day whisper stays stronger than the night dim so twilight eases down'
      );
      assert(dayInk < fullInk * 0.75, 'the day puff loses a real share of its ink');
      assert(dayInk > 10, 'the puff still sits more than ten levels off the white sky');
      const hillDay = parseInt(GAME_CONFIG.HILL_COLOR_DAY.slice(1, 3), 16);
      assert(dayInk < 0xff - hillDay, 'day clouds stay quieter than the day hills');
      assert(GAME_CONFIG.NIGHT_CLOUD_ALPHA < dayPeak, 'night clouds are dimmer than the day puff');
      assert(GAME_CONFIG.NIGHT_CLOUD_ALPHA > 0, 'night clouds stay visible against the night sky');
      assert(
        compositedCloudChannel(GAME_CONFIG.NIGHT_CLOUD_ALPHA) <
          liftedSpriteChannel(GAME_CONFIG.NIGHT_DINO_BRIGHTNESS),
        'night clouds stay quieter than the night dino'
      );
      assert(
        compositedCloudChannel(GAME_CONFIG.NIGHT_CLOUD_ALPHA) <
          liftedSpriteChannel(GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS),
        'night clouds stay quieter than night cacti'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(cloudPaintAlpha(), dayPeak, 'day Updated keeps the quieter day cloud');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(
        cloudPaintAlpha(),
        dayPeak,
        'the ease starts with the sky, still the quieter day cloud at the boundary'
      );
      game.score = 350;
      const mid = dayPeak + (GAME_CONFIG.NIGHT_CLOUD_ALPHA - dayPeak) * 0.5;
      assert(
        Math.abs(cloudPaintAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from the quieter day cloud to the night dim'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        cloudPaintAlpha() < dayPeak && cloudPaintAlpha() > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'full night holds the soft dim'
      );
      game.score = 1000;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'later night keeps the same static dim'
      );

      game.mode = MODES.DAILY;
      game.score = 0;
      assertEquals(cloudPaintAlpha(), dayPeak, 'Daily shares the quieter Updated day cloud');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'Daily shares the Updated night cloud dim'
      );

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
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night dim instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.DAY_CLOUD_ALPHA,
        'reduced motion keeps the quieter day cloud while the sky is still day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.DAY_CLOUD_ALPHA,
        'reduced motion does not run the twilight ease'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'reduced motion still gets the static night dim'
      );
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
      setQaFlag('night', true);
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the existing night QA flag is enough to see the dim'
      );
      assertEquals(game.score, 0, 'the dim must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(cloudPaintAlpha(), 1, 'QA night still leaves Classic clouds alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('NIGHT_CLOUD_ALPHA override changes only the night dim', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_CLOUD_ALPHA: 0.2 }, () => {
        assertEquals(
          cloudPaintAlpha(),
          0.2,
          'a visual override should dim night clouds by the tuned amount'
        );
      });
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'clearing the override returns the configured night dim'
      );
      game.score = 0;
      withTuning({ NIGHT_CLOUD_ALPHA: 0.2 }, () => {
        assertEquals(
          cloudPaintAlpha(),
          GAME_CONFIG.DAY_CLOUD_ALPHA,
          'day clouds ignore the night override'
        );
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_CLOUD_ALPHA: 'soft' }, () => {
        assertEquals(
          cloudPaintAlpha(),
          GAME_CONFIG.NIGHT_CLOUD_ALPHA,
          'a non-numeric override falls back to the configured dim'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('DAY_CLOUD_ALPHA override changes only the day peak', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(
          cloudPaintAlpha(),
          0.4,
          'a visual override should quiet day clouds by the tuned amount'
        );
      });
      assertEquals(
        cloudPaintAlpha(),
        GAME_CONFIG.DAY_CLOUD_ALPHA,
        'clearing the override returns the configured day peak'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(
          cloudPaintAlpha(),
          GAME_CONFIG.NIGHT_CLOUD_ALPHA,
          'full night ignores the day override'
        );
      });
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 'soft' }, () => {
        assertEquals(
          cloudPaintAlpha(),
          GAME_CONFIG.DAY_CLOUD_ALPHA,
          'a non-numeric override falls back to the configured day peak'
        );
      });
      game.mode = MODES.CLASSIC;
      game.score = 0;
      withTuning({ DAY_CLOUD_ALPHA: 0.4 }, () => {
        assertEquals(
          cloudPaintAlpha(),
          1,
          'Classic keeps its own full-opacity cloud when the day peak is tuned'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
      setQaFlag('night', false);
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
      assert(
        seen.length === GAME_CONFIG.CLOUD_COUNT * GAME_CONFIG.CLOUD_CIRCLES.length,
        'GET READY draws every cloud circle'
      );
      assert(
        seen.every((a) => a === GAME_CONFIG.DAY_CLOUD_ALPHA),
        'the opening screen uses the quieter day peak'
      );
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
      setQaFlag('night', false);
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
      setQaFlag('night', false);
      initClouds();
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      drawClouds();
      assertEquals(
        fills,
        GAME_CONFIG.CLOUD_COUNT,
        'each cloud is one fill so overlapping circles do not stack the night dim'
      );
      game.score = 0;
      fills = 0;
      drawClouds();
      assertEquals(fills, GAME_CONFIG.CLOUD_COUNT, 'day clouds use the same single fill');
    } finally {
      ctx.fill = origFill;
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('paints the dim only around Updated night clouds and then clears it', () => {
    const origMode = game.mode;
    const origScore = game.score;
    const origAlpha = ctx.globalAlpha;
    const origRng = game.rng;
    let rngCalls = 0;
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    try {
      setQaFlag('night', false);
      initClouds();
      const before = game.clouds.map((c) => c.x + ',' + c.y + ',' + c.speed).join('|');
      game.mode = MODES.UPDATED;
      game.score = 0;
      ctx.globalAlpha = 1;
      const day = alphasDuringCloudPaint();
      assert(
        day.length === GAME_CONFIG.CLOUD_COUNT * GAME_CONFIG.CLOUD_CIRCLES.length,
        'day still paints every cloud circle'
      );
      assert(
        day.every((a) => a === GAME_CONFIG.DAY_CLOUD_ALPHA),
        'day clouds use the quieter day peak'
      );
      assertEquals(ctx.globalAlpha, 1, 'a day draw leaves the obstacle lane alone');
      assertEquals(ctx.fillStyle, GAME_CONFIG.CLOUD_COLOR, 'day ink stays the day cloud colour');

      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.globalAlpha = 0.8;
      const night = alphasDuringCloudPaint();
      assertEquals(night.length, day.length, 'night still paints the same circles');
      assert(
        night.every((a) => Math.abs(a - 0.8 * GAME_CONFIG.NIGHT_CLOUD_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the soft dim'
      );
      assertEquals(ctx.globalAlpha, 0.8, 'the dim must not leak onto the dino or cacti');
      assertEquals(ctx.fillStyle, GAME_CONFIG.CLOUD_COLOR, 'night still uses the day cloud colour');
      assertEquals(
        game.clouds.map((c) => c.x + ',' + c.y + ',' + c.speed).join('|'),
        before,
        'painting clouds does not move them'
      );
      assertEquals(rngCalls, 0, 'painting clouds does not consume the run seed');

      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.globalAlpha = 1;
      const classic = alphasDuringCloudPaint();
      assert(
        classic.every((a) => a === 1),
        'Classic night paint stays day-bright'
      );
      assertEquals(ctx.globalAlpha, 1, 'Classic paint leaves the lane alone');
    } finally {
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      ctx.globalAlpha = origAlpha;
      setQaFlag('night', false);
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
    assertEquals(
      GAME_CONFIG.CLOUD_COLOR,
      '#e8e8e8',
      'the ink stays the day puff; the quiet is opacity'
    );
    assert(
      Math.abs(now - old * 0.6) < 1e-9,
      'the quieter dim keeps three-fifths of the old 0.35 band'
    );
    assert(sum(nowLifts) < sum(oldLifts) * 0.75, 'night clouds lose a real share of the old lift');
    assert(
      nowLifts.every((n, i) => n > hill[i]),
      'the mounds still sit lighter than the night hills'
    );
    assert(sum(star) > sum(nowLifts), 'large mounds stay under the night-star whisper');
    assert(now > 0.15, 'the puff still reads against the night sky');
    assert(now < GAME_CONFIG.DAY_CLOUD_ALPHA, 'twilight still eases downward');
    assert(GAME_CONFIG.NIGHT_GROUND_ALPHA - now >= 0.05, 'the road edge stays clearly firmer');
  });
});

describe('Night ground cool', () => {
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      setQaFlag('night', false);
      setReducedMotion(false);
      assert(GAME_CONFIG.NIGHT_GROUND_ALPHA < 1, 'night ground is dimmer than the day strip');
      assert(
        GAME_CONFIG.NIGHT_GROUND_ALPHA > 0,
        'night ground stays visible against the night sky'
      );
      assert(
        GAME_CONFIG.NIGHT_GROUND_ALPHA > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
        'the running line stays firmer than the soft night clouds'
      );
      const night = compositedGround(GAME_CONFIG.NIGHT_GROUND_ALPHA);
      const day = compositedGround(1);
      assert(relLuminance(night) < relLuminance(day), 'night ground is dimmer than the day strip');
      assert(night[2] - night[0] > day[2] - day[0], 'night sky bleed cools the neutral day gray');
      assert(
        relLuminance(night) < dustLuminance(),
        'night ground stays quieter than the cooled foot dust'
      );
      assert(
        relLuminance(night) < 0x53 * GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'night ground stays quieter than the night dino'
      );
      assert(
        relLuminance(night) < 0x53 * GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'night ground stays quieter than night cacti'
      );

      game.mode = MODES.UPDATED;
      game.score = 0;
      assertEquals(groundPaintAlpha(), 1, 'day Updated keeps the day-bright ground');
      game.score = GAME_CONFIG.DAY_NIGHT_START;
      assertEquals(
        groundPaintAlpha(),
        1,
        'the ease starts with the sky, still day-bright at the boundary'
      );
      game.score = 350;
      const mid = 1 + (GAME_CONFIG.NIGHT_GROUND_ALPHA - 1) * 0.5;
      assert(
        Math.abs(groundPaintAlpha() - mid) < 1e-9,
        'mid-twilight is halfway from day-bright to the night cool'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assert(
        groundPaintAlpha() < 1 && groundPaintAlpha() > GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'one point before night is still easing, not snapped'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'full night holds the cool dim'
      );
      game.score = 1000;
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'later night keeps the same static dim'
      );

      game.mode = MODES.DAILY;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'Daily shares the Updated night ground cool'
      );

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
      setQaFlag('night', false);
      setReducedMotion(false);
    }
  });

  it('reduced motion snaps to the static night dim instead of easing', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      game.mode = MODES.UPDATED;
      setReducedMotion(true);
      game.score = 350;
      assertEquals(
        groundPaintAlpha(),
        1,
        'reduced motion keeps day-bright ground while the sky is still day'
      );
      game.score = GAME_CONFIG.DAY_NIGHT_END - 1;
      assertEquals(groundPaintAlpha(), 1, 'reduced motion does not run the twilight ease');
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'reduced motion still gets the static night ground'
      );
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
      setQaFlag('night', true);
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'the existing night QA flag is enough to see the cool'
      );
      assertEquals(game.score, 0, 'the cool must not write the score');

      game.mode = MODES.CLASSIC;
      assertEquals(groundPaintAlpha(), 1, 'QA night still leaves Classic ground alone');
      assertEquals(game.score, 0, 'Classic QA night must not write the score');
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
    }
  });

  it('NIGHT_GROUND_ALPHA override changes only the night dim', () => {
    const origMode = game.mode;
    const origScore = game.score;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_GROUND_ALPHA: 0.4 }, () => {
        assertEquals(
          groundPaintAlpha(),
          0.4,
          'a visual override should dim night ground by the tuned amount'
        );
      });
      assertEquals(
        groundPaintAlpha(),
        GAME_CONFIG.NIGHT_GROUND_ALPHA,
        'clearing the override returns the configured night dim'
      );
      game.score = 0;
      withTuning({ NIGHT_GROUND_ALPHA: 0.4 }, () => {
        assertEquals(groundPaintAlpha(), 1, 'day ground ignores the night override');
      });
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      withTuning({ NIGHT_GROUND_ALPHA: 'soft' }, () => {
        assertEquals(
          groundPaintAlpha(),
          GAME_CONFIG.NIGHT_GROUND_ALPHA,
          'a non-numeric override falls back to the configured dim'
        );
      });
    } finally {
      game.mode = origMode;
      game.score = origScore;
      setQaFlag('night', false);
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
    game.rng = () => {
      rngCalls++;
      return origRng();
    };
    const seen = [];
    const origDraw = ctx.drawImage;
    ctx.drawImage = function (...args) {
      seen.push(ctx.globalAlpha);
      return origDraw.apply(this, args);
    };
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      game.mode = MODES.UPDATED;
      game.groundX = -40;
      game.score = 0;
      ctx.globalAlpha = 1;
      drawGround();
      assertEquals(seen.length, 2, 'day still blits the strip twice so it can scroll');
      assert(
        seen.every((a) => a === 1),
        'day ground stays fully opaque'
      );
      assertEquals(ctx.globalAlpha, 1, 'a day draw leaves the obstacle lane alone');
      assertEquals(game.groundX, -40, 'painting ground does not scroll it');

      seen.length = 0;
      game.score = GAME_CONFIG.DAY_NIGHT_END;
      ctx.globalAlpha = 0.8;
      drawGround();
      assertEquals(seen.length, 2, 'night still blits the same two tiles');
      assert(
        seen.every((a) => Math.abs(a - 0.8 * GAME_CONFIG.NIGHT_GROUND_ALPHA) < 1e-9),
        'night paint multiplies the existing alpha by the ground cool'
      );
      assertEquals(ctx.globalAlpha, 0.8, 'the cool must not leak onto the dino or cacti');
      assertEquals(game.groundX, -40, 'night paint does not scroll the strip');
      assertEquals(game.currentSpeed, origSpeed, 'night paint does not change speed');
      assertEquals(rngCalls, 0, 'painting ground does not consume the run seed');

      seen.length = 0;
      game.mode = MODES.CLASSIC;
      game.score = 1000;
      ctx.globalAlpha = 1;
      drawGround();
      assert(
        seen.every((a) => a === 1),
        'Classic night paint stays day-bright'
      );
      assertEquals(ctx.globalAlpha, 1, 'Classic paint leaves the lane alone');
      assertEquals(game.groundX, -40, 'Classic paint does not scroll the strip');
    } finally {
      ctx.drawImage = origDraw;
      game.rng = origRng;
      game.mode = origMode;
      game.score = origScore;
      game.groundX = origGroundX;
      ctx.globalAlpha = origAlpha;
      setQaFlag('night', false);
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
    assert(
      now > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
      'the running line stays firmer than the soft night clouds'
    );
    assert(
      now - GAME_CONFIG.NIGHT_CLOUD_ALPHA >= 0.05,
      'the strip stays clearly above the night-cloud whisper'
    );
    assert(
      sum(nowLifts) < sum(oldLifts) * 0.85,
      'the strip loses a real share of the old 0.55 lift'
    );
    const threeFifthsRed = 0x1a + (0x53 - 0x1a) * fullThreeFifths;
    assert(
      fullThreeFifths > GAME_CONFIG.NIGHT_CLOUD_ALPHA,
      'a full three-fifths of 0.55 now sits above the quieter night clouds'
    );
    assert(
      Math.abs(threeFifthsRed - hillRed) < 1,
      'that step still lands on the night hills, so the strip stays at 0.42'
    );
    assert(groundRed > hillRed, 'the road edge stays lighter than the night hills');
    assertEquals(GAME_CONFIG.HILL_COLOR_DAY, '#e1e1e1', 'day hills stay the quieter day fill');
  });
});

describe('Readable labels on phones (R1)', () => {
  const withCanvasScale = (scale, fn) => {
    const orig = canvasCssScale;
    canvasCssScale = scale;
    try {
      fn();
    } finally {
      canvasCssScale = orig;
    }
  };

  it('desktop (canvas at or above full size) keeps every label as designed', () => {
    withCanvasScale(2.1, () => {
      [11, 12, 13, 14, 15, 16].forEach((px) => assertEquals(labelPx(px), px, px + 'px kept'));
    });
    withCanvasScale(1, () => assertEquals(labelPx(11), 11, 'scale 1 kept'));
  });

  it('on an iPhone 13 (374px canvas) every small label is at least 12 CSS px on screen', () => {
    withCanvasScale(374 / 600, () => {
      [11, 12, 13, 14, 15, 16].forEach((px) => {
        const onScreen = labelPx(px) * canvasCssScale;
        assert(onScreen >= 12, px + 'px label is ' + onScreen.toFixed(1) + ' CSS px on screen');
      });
    });
  });

  it('never grows a label past the cap, and never shrinks one', () => {
    withCanvasScale(0.3, () => {
      assertEquals(labelPx(11), 20, 'a tiny canvas is capped at 20 logical px');
      assertEquals(labelPx(28), 28, 'a big label is left alone');
    });
  });

  it('resizing measures the scale the labels read', () => {
    const orig = canvasCssScale;
    initCanvasScale();
    assert(canvasCssScale > 0, 'scale measured');
    assertEquals(
      canvasCssScale,
      parseFloat(canvas.style.width) / GAME_CONFIG.CANVAS_W,
      'scale is CSS width / 600'
    );
    canvasCssScale = orig;
  });
});

describe('Game Over keeps the run scene (R2)', () => {
  const recordGameOverPaint = () => {
    const calls = [];
    const orig = { fillRect: ctx.fillRect, drawImage: ctx.drawImage };
    ctx.fillRect = (x, y, w, h) => calls.push(['fillRect', ctx.fillStyle, w, h]);
    ctx.drawImage = () => calls.push(['drawImage']);
    try {
      drawGameOverScreen();
    } finally {
      ctx.fillRect = orig.fillRect;
      ctx.drawImage = orig.drawImage;
    }
    return calls;
  };
  const dimIndex = (calls) =>
    calls.findIndex(
      (c) =>
        c[0] === 'fillRect' &&
        String(c[1]).replace(/\s/g, '') === 'rgba(0,0,0,0.6)' &&
        c[2] === GAME_CONFIG.CANVAS_W &&
        c[3] === GAME_CONFIG.CANVAS_H
    );

  ['classic', 'updated'].forEach((mode) => {
    it(mode + ': the last frame is painted, then dimmed, under the card', () => {
      const origMode = game.mode;
      const origFill = ctx.fillStyle;
      resetGame();
      game.mode = mode;
      game.state = STATE.DEAD;
      game.obstacles.push({ x: 120, y: 150, width: 20, height: 40, type: 'small' });
      Animations.deathAnimFrame = deathAnimFrames();
      const calls = recordGameOverPaint();
      const dim = dimIndex(calls);
      assert(dim > 0, 'one full-canvas 0.6 dim is painted');
      const sceneDraws = calls.slice(0, dim).filter((c) => c[0] === 'drawImage').length;
      assert(sceneDraws >= 2, 'dino and obstacle are drawn before the dim (' + sceneDraws + ')');
      assertEquals(
        calls.filter((c) => c[0] === 'fillRect' && c[2] === GAME_CONFIG.CANVAS_W).length >= 1,
        true,
        'background painted'
      );
      game.mode = origMode;
      ctx.fillStyle = origFill;
      resetGame();
    });
  });

  it('repainting twice does not stack the dim (one dim per paint)', () => {
    resetGame();
    game.state = STATE.DEAD;
    Animations.deathAnimFrame = deathAnimFrames();
    const first = recordGameOverPaint().filter((c) => dimIndex([c]) === 0).length;
    const second = recordGameOverPaint().filter((c) => dimIndex([c]) === 0).length;
    assertEquals(first, 1, 'one dim in the first paint');
    assertEquals(second, 1, 'one dim in the second paint');
    resetGame();
  });

  it('white score text over the dimmed day sky keeps at least 4.5:1 contrast', () => {
    const lum = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const dimmedWhite = Math.round(255 * (1 - 0.6));
    const ratio = (1 + 0.05) / (lum(dimmedWhite) + 0.05);
    assert(ratio >= 4.5, 'contrast ' + ratio.toFixed(2) + ':1');
  });
});

describe('Game Over text contrast (A1)', () => {
  const lumA1 = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  // The lightest thing behind the card: the white day sky under the dim.
  const dimmedSky = Math.round(255 * (1 - 0.6));
  const skyHex = '#' + dimmedSky.toString(16).padStart(2, '0').repeat(3);
  const contrastA1 = (hex) => (lumA1(hex) + 0.05) / (lumA1(skyHex) + 0.05);
  const toHex = (style) => {
    if (style === 'white') return '#ffffff';
    if (/^#[0-9a-f]{6}$/i.test(style)) return style;
    return null; // anything translucent fails below
  };

  it('every Game Over text colour is opaque and meets 4.5:1 over the dimmed sky', () => {
    const scenarios = [
      () => {
        game.mode = 'updated';
        game.highScore = 0;
      },
      () => {
        game.mode = 'updated';
        game.highScore = 999;
      },
      () => {
        game.mode = 'daily';
        game.isNewTodayBest = true;
      },
      () => {
        game.mode = 'daily';
        game.isNewTodayBest = false;
        game.dailyBest = 999;
      },
    ];
    const orig = {
      mode: game.mode,
      highScore: game.highScore,
      dailyBest: game.dailyBest,
      isNewTodayBest: game.isNewTodayBest,
      fillText: ctx.fillText,
      fillStyle: ctx.fillStyle,
    };
    const seen = [];
    ctx.fillText = (text) => seen.push([String(text), ctx.fillStyle]);
    try {
      scenarios.forEach((setup) => {
        resetGame();
        setup();
        game.state = STATE.DEAD;
        game.score = 16;
        Animations.deathAnimFrame = deathAnimFrames();
        drawGameOverScreen();
        drawDailyDeathHint();
      });
    } finally {
      ctx.fillText = orig.fillText;
      ctx.fillStyle = orig.fillStyle;
      game.mode = orig.mode;
      game.highScore = orig.highScore;
      game.dailyBest = orig.dailyBest;
      game.isNewTodayBest = orig.isNewTodayBest;
      resetGame();
    }
    assert(seen.length > 10, 'captured the card text (' + seen.length + ')');
    seen.forEach(([text, style]) => {
      const hex = toHex(style);
      assert(hex, '"' + text + '" is drawn in an opaque colour, not ' + style);
      const ratio = contrastA1(hex);
      assert(ratio >= 4.5, '"' + text + '" ' + style + ' is ' + ratio.toFixed(2) + ':1');
    });
  });
});
