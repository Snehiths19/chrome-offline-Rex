// Unit tests: shell. The page around the canvas: audio, mode toggle, sizing, storage, tuning, the feature registry and offline install.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('shell');

describe('Audio (PR-B)', () => {
  it('audio.ensure() returns null when there is no AudioContext', () => {
    // Node has no AudioContext; a browser does, so hide it for this test.
    const names = ['AudioContext', 'webkitAudioContext'];
    const saved = names.map((n) => Object.getOwnPropertyDescriptor(testGlobal, n));
    const origCtx = audio.ctx;
    names.forEach((n) => {
      testGlobal[n] = undefined;
    });
    audio.ctx = null;
    let result;
    try {
      result = audio.ensure();
    } finally {
      names.forEach((n, i) => {
        delete testGlobal[n];
        if (saved[i]) Object.defineProperty(testGlobal, n, saved[i]);
      });
      audio.ctx = origCtx;
    }
    assertEquals(result, null, 'without an AudioContext, ensure should return null');
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
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
    audio.ensure = function () {
      ensureCalls++;
      return null;
    };
    audio.death();
    audio.ensure = originalEnsure;
    assertEquals(ensureCalls, 0, 'Muted: death() should not reach ensure()');
    audio.setMuted(false);
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
    assert(
      a >= GAME_CONFIG.MIN_SPAWN_GAP && a <= GAME_CONFIG.MAX_SPAWN_GAP,
      `Classic gap at score 0 (${a}) should be within [MIN_SPAWN_GAP, MAX_SPAWN_GAP]`
    );
  });

  it('updated mode still produces variety', () => {
    const rng = mulberry32(11);
    const gaps = new Set();
    for (let i = 0; i < 30; i++)
      gaps.add(DifficultyProfile.nextObstacle(200, MODES.UPDATED, rng).gap);
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

describe('Feature registry (PR-P2)', () => {
  it('exposes a frozen registry array', () => {
    assert(Array.isArray(FEATURES), 'FEATURES should be an array');
    assert(Object.isFrozen(FEATURES), 'FEATURES should be frozen');
  });

  it('registry id ordering is the documented contract', () => {
    const ids = FEATURES.map((f) => f.id);
    assertEquals(ids[0], 'hills', 'hills must be first (background layer)');
    assertEquals(ids[1], 'clouds', 'clouds must follow hills (background layer)');
    assertEquals(ids[2], 'particles', 'particles must be foreground');
    assertEquals(ids[3], 'skyTint', 'skyTint must be overlay (last layer)');
  });

  it('every feature has at least one of update or draw', () => {
    for (const f of FEATURES) {
      const hasUpdate = typeof f.update === 'function';
      const hasDraw = typeof f.draw === 'function';
      assert(hasUpdate || hasDraw, `Feature ${f.id} must define update or draw`);
    }
  });

  it('layer partition matches pre-refactor draw order', () => {
    const bg = FEATURES.filter((f) => f.layer === 'background').map((f) => f.id);
    assertEquals(
      bg.join(','),
      'hills,clouds',
      'background layer must be hills,clouds in that order'
    );

    const fg = FEATURES.filter((f) => f.layer === 'foreground').map((f) => f.id);
    assertEquals(fg.join(','), 'particles');

    const ov = FEATURES.filter((f) => f.layer === 'overlay').map((f) => f.id);
    assertEquals(ov.join(','), 'skyTint');
  });

  it('hills feature self-gates in classic mode', () => {
    setMode(MODES.CLASSIC);
    cancelAnimationFrame(game.animationFrameId);
    game.rng = mulberry32(1);
    initHills();
    const beforeX = game.hills[0] && game.hills[0].x;
    game.currentSpeed = 6;

    const hillsFeature = FEATURES.find((f) => f.id === 'hills');
    hillsFeature.update();

    assertEquals(
      game.hills[0] && game.hills[0].x,
      beforeX,
      'updateHills via registry must respect classic-mode self-gate'
    );

    setMode(MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
  });

  it('runFeatureDraws dispatches by layer in registry order', () => {
    const order = [];
    const originals = FEATURES.map((f) => f.draw);
    // Mutate entries — array is frozen but its entries are not.
    FEATURES.forEach((f, i) => {
      if (!f.draw) return;
      f.draw = () => order.push(f.id);
    });

    runFeatureDraws('background');
    runFeatureDraws('foreground');
    runFeatureDraws('overlay');

    // Restore so subsequent tests / live game keep working.
    FEATURES.forEach((f, i) => {
      f.draw = originals[i];
    });

    assertEquals(
      order.join(','),
      'hills,clouds,particles,skyTint',
      'Layer dispatch must produce the canonical draw order'
    );
  });
});

describe('Live-tuning hook (PR-P3)', () => {
  // Snapshot/restore helper so tests don't leak overrides into siblings.
  function withTuning(overrides, fn) {
    const orig = window.GAME_TUNING;
    window.GAME_TUNING = overrides;
    try {
      fn();
    } finally {
      window.GAME_TUNING = orig;
    }
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
      assertEquals(
        cfg('JUMP_POWER'),
        GAME_CONFIG.JUMP_POWER,
        'Prototype keys must not leak through cfg'
      );
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
      assertEquals(
        cfg('SKY_TINT_PEAK_ALPHA'),
        0.42,
        'Override must survive a save/clear/load cycle'
      );
    });
    localStorage.removeItem('dino-tuning');
  });

  it('loadTuning ignores malformed JSON without throwing', () => {
    localStorage.setItem('dino-tuning', '{not json');
    withTuning({}, () => {
      loadTuning(); // must not throw
      assert(
        typeof window.GAME_TUNING === 'object',
        'GAME_TUNING must remain an object after malformed load'
      );
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

    withTuning({ SKY_TINT_COLOR_RGB: '0, 0, 255' }, () => {
      drawSkyTint();
    });

    // Restore: just delete our own property so the prototype value re-shows.
    delete ctx.fillStyle;

    const blueish = fillStyles.find(
      (s) => typeof s === 'string' && s.indexOf('rgba(0, 0, 255') === 0
    );
    assert(
      blueish,
      `Expected a fillStyle starting with 'rgba(0, 0, 255' but got: ${JSON.stringify(fillStyles)}`
    );

    Animations.milestoneFrames = 0;
  });

  it('NIGHT_OBSTACLE_BRIGHTNESS override changes the night cactus lift', () => {
    const origMode = game.mode;
    const origScore = game.score;
    game.mode = MODES.UPDATED;
    game.score = GAME_CONFIG.DAY_NIGHT_END;
    try {
      withTuning({ NIGHT_OBSTACLE_BRIGHTNESS: 1.4 }, () => {
        assertEquals(
          obstacleNightBrightness(),
          1.4,
          'a visual override should brighten night cacti by the tuned amount'
        );
      });
      assertEquals(
        obstacleNightBrightness(),
        GAME_CONFIG.NIGHT_OBSTACLE_BRIGHTNESS,
        'clearing the override returns the configured night lift'
      );
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
        assertEquals(
          dinoNightBrightness(),
          1.5,
          'a visual override should brighten the night dino by the tuned amount'
        );
      });
      assertEquals(
        dinoNightBrightness(),
        GAME_CONFIG.NIGHT_DINO_BRIGHTNESS,
        'clearing the override returns the configured dino lift'
      );
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
        assertEquals(
          starFadeAlpha(),
          1,
          'a non-positive Classic tune still shows the field immediately'
        );
      });
      withTuning({ STAR_FADE_FRAMES: -2 }, () => {
        assertEquals(
          starFadeAlpha(),
          1,
          'a negative Classic tune still shows the field immediately'
        );
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
        assertEquals(
          starPaintAlpha(),
          0.5 * GAME_CONFIG.NIGHT_STAR_ALPHA,
          'the quiet peak still scales the shorter ramp'
        );
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
        assertEquals(
          starPaintAlpha(),
          2 / GAME_CONFIG.STAR_FADE_FRAMES,
          'Classic stays on the full-white ramp'
        );
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
        assertEquals(
          starFadeAlpha(),
          2 / GAME_CONFIG.STAR_FADE_FRAMES,
          'a length equal to Classic is still allowed'
        );
      });
    } finally {
      game.mode = origMode;
      game.starsInitialised = origInit;
      game.stars = origStars;
      game.starFadeFrames = origFade;
    }
  });
});

describe('announce() accessibility helper', () => {
  it('sets a11yLive.textContent to the announced message', () => {
    a11yLive.textContent = '';
    announce('hello');
    assertEquals(
      a11yLive.textContent,
      'hello',
      'announce should write message to a11y live region'
    );
  });

  it('overwrites textContent on repeated calls', () => {
    a11yLive.textContent = '';
    announce('first');
    announce('second');
    assertEquals(a11yLive.textContent, 'second', 'second announce should overwrite the first');
  });
});

describe('Canvas scaling', () => {
  it('GAME_CONFIG defines CANVAS_W=600 and CANVAS_H=200', () => {
    assertEquals(GAME_CONFIG.CANVAS_W, 600, 'GAME_CONFIG.CANVAS_W should be 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200, 'GAME_CONFIG.CANVAS_H should be 200');
  });

  it('initCanvasScale sets bitmap width to the content-box css width times dpr', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;
    // 390px phone minus the 8px shell gutter on each side. The bitmap stays 3:1.
    const cssW = 374;

    window.innerWidth = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const bitmapW = canvas.width;
    const bitmapH = canvas.height;

    window.innerWidth = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width = origWidth;
    canvas.height = origHeight;

    assertEquals(bitmapW, Math.round(cssW * 2), 'canvas.width should be Math.round(374 * 2) = 748');
    assertEquals(
      bitmapH,
      Math.round(bitmapW / 3),
      'canvas.height should stay 3:1 with the bitmap width'
    );
    assertEquals(GAME_CONFIG.CANVAS_W, 600, 'logical board width stays 600');
    assertEquals(GAME_CONFIG.CANVAS_H, 200, 'logical board height stays 200');
  });

  it('initCanvasScale sets CSS display size to the padded content box', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;
    const origStyleWidth = canvas.style.width;
    const origStyleHeight = canvas.style.height;

    window.innerWidth = 390;
    window.devicePixelRatio = 2;
    initCanvasScale();

    const styleW = canvas.style.width;
    const styleH = canvas.style.height;

    window.innerWidth = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width = origWidth;
    canvas.height = origHeight;
    canvas.style.width = origStyleWidth;
    canvas.style.height = origStyleHeight;

    assertEquals(
      styleW,
      '374px',
      'canvas.style.width should be the 390px viewport minus the 16px shell gutter'
    );
    assertEquals(styleH, '125px', 'canvas.style.height should be Math.round(374/3) = 125');
  });
});

describe('Orientation resize', () => {
  it('handleResize does not throw in any game state', () => {
    const origState = game.state;
    const origWidth = canvas.width;
    const origHeight = canvas.height;

    [STATE.IDLE, STATE.WAITING, STATE.RUNNING, STATE.DEAD].forEach((state) => {
      game.state = state;
      let threw = false;
      try {
        handleResize();
      } catch {
        threw = true;
      }
      assert(!threw, `handleResize should not throw in STATE.${state}`);
    });

    game.state = origState;
    canvas.width = origWidth;
    canvas.height = origHeight;
  });

  it('handleResize updates canvas.style.width when innerWidth changes', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;
    const origStyleWidth = canvas.style.width;
    const origStyleHeight = canvas.style.height;

    window.innerWidth = 320;
    window.devicePixelRatio = 1;
    handleResize();

    const styleW = canvas.style.width;

    window.innerWidth = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width = origWidth;
    canvas.height = origHeight;
    canvas.style.width = origStyleWidth;
    canvas.style.height = origStyleHeight;

    assertEquals(
      styleW,
      '304px',
      'canvas.style.width should be "304px" after resize to innerWidth 320 (minus the shell gutter)'
    );
  });

  it('handleResize updates canvas.width when innerWidth changes', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;

    window.innerWidth = 320;
    window.devicePixelRatio = 1;
    handleResize();

    const bitmapW = canvas.width;

    window.innerWidth = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width = origWidth;
    canvas.height = origHeight;

    assertEquals(
      bitmapW,
      304,
      'canvas.width should be 304 after resize to innerWidth 320 (dpr 1, minus the shell gutter)'
    );
  });
});

describe('Tablet width cap removed', () => {
  it('initCanvasScale fills the content box when wider than 600px', () => {
    const origInnerWidth = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;

    window.innerWidth = 900;
    window.devicePixelRatio = 1;
    initCanvasScale();

    const bitmapW = canvas.width;

    window.innerWidth = origInnerWidth;
    window.devicePixelRatio = origDpr;
    canvas.width = origWidth;
    canvas.height = origHeight;

    assertEquals(
      bitmapW,
      884,
      'canvas.width should be 884 when innerWidth=900 and dpr=1 (no 600px cap, minus the shell gutter)'
    );
  });
});

describe('Shell canvas width', () => {
  it('computeCanvasCssWidth subtracts horizontal inset and floors so the canvas cannot overflow', () => {
    assertEquals(
      computeCanvasCssWidth(390, 16),
      374,
      'a 390px phone with 8px gutter each side fits 374px'
    );
    assertEquals(
      computeCanvasCssWidth(390, 16 + 47 + 47),
      280,
      'side safe-area insets come off the same width'
    );
    assertEquals(
      computeCanvasCssWidth(390.9, 16.2),
      374,
      'fractional inset floors instead of rounding up into the padding'
    );
    assertEquals(computeCanvasCssWidth(390, 0), 390, 'a zero inset keeps the full viewport');
    assertEquals(computeCanvasCssWidth(390, -4), 390, 'a negative inset is ignored');
    assertEquals(computeCanvasCssWidth(10, 80), 1, 'the width never goes non-positive');
    assertEquals(computeCanvasCssWidth(0, 0), 1, 'a zero viewport still returns a drawable width');
    assertEquals(
      computeCanvasCssWidth(NaN, 16),
      1,
      'a non-numeric viewport still returns a drawable width'
    );
  });

  it('SHELL_GUTTER_X matches the 8px wrapper padding', () => {
    assertEquals(
      SHELL_GUTTER_X,
      8,
      'keep this in sync with #game-wrapper horizontal padding in style.css'
    );
  });

  it('measureCanvasCssWidth reserves the shell gutter when layout padding is unread', () => {
    const origReader = window.getComputedStyle;
    window.getComputedStyle = undefined;
    const width = measureCanvasCssWidth({}, 390);
    window.getComputedStyle = origReader;
    assertEquals(
      width,
      390 - SHELL_GUTTER_X * 2,
      'unread padding still keeps the canvas inside the 8px gutter'
    );
  });

  it('measureCanvasCssWidth uses the laid-out wrapper content box, not the viewport', () => {
    const wrapper = { clientWidth: 358 };
    const origReader = window.getComputedStyle;
    window.getComputedStyle = (el) => {
      if (el === wrapper) return { paddingLeft: '8px', paddingRight: '8px' };
      return { paddingLeft: '0px', paddingRight: '0px' };
    };
    let width;
    try {
      width = measureCanvasCssWidth(wrapper, 9999);
    } finally {
      window.getComputedStyle = origReader;
    }
    assertEquals(width, 342, 'content box is clientWidth minus horizontal padding');
  });

  it('measureCanvasCssWidth adds the gutter on top of body safe-area when the wrapper is not laid out', () => {
    const body = { id: 'body' };
    const origReader = window.getComputedStyle;
    const restoreBody = overrideDocumentProp('body', body);
    window.getComputedStyle = (el) => {
      if (el === body) return { paddingLeft: '47px', paddingRight: '47px' };
      return { paddingLeft: '0px', paddingRight: '0px' };
    };
    let width;
    try {
      width = measureCanvasCssWidth(null, 390);
    } finally {
      window.getComputedStyle = origReader;
      restoreBody();
    }
    assertEquals(
      width,
      390 - 47 - 47 - SHELL_GUTTER_X * 2,
      'fallback width is viewport minus safe-area minus the shell gutter'
    );
  });

  it('measureCanvasCssWidth does not subtract body insets already inside clientWidth', () => {
    const wrapper = { clientWidth: 280 };
    const body = { id: 'body' };
    const origReader = window.getComputedStyle;
    const restoreBody = overrideDocumentProp('body', body);
    window.getComputedStyle = (el) => {
      if (el === wrapper) return { paddingLeft: '8px', paddingRight: '8px' };
      if (el === body) return { paddingLeft: '47px', paddingRight: '47px' };
      return { paddingLeft: '0px', paddingRight: '0px' };
    };
    let width;
    try {
      width = measureCanvasCssWidth(wrapper, 390);
    } finally {
      window.getComputedStyle = origReader;
      restoreBody();
    }
    assertEquals(
      width,
      264,
      'clientWidth already sits inside the body safe-area, so only the wrapper gutter comes off'
    );
  });

  it('initCanvasScale prefers a laid-out wrapper over window.innerWidth', () => {
    const wrapper = document.getElementById('game-wrapper');
    const origClient = wrapper.clientWidth;
    const origInner = window.innerWidth;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;
    const origStyleWidth = canvas.style.width;
    const origStyleHeight = canvas.style.height;
    const origReader = window.getComputedStyle;
    // A real element's clientWidth is a getter, so shadow it to fake a layout.
    Object.defineProperty(wrapper, 'clientWidth', {
      configurable: true,
      writable: true,
      value: 358,
    });
    window.innerWidth = 390;
    window.devicePixelRatio = 2;
    window.getComputedStyle = (el) => {
      if (el === wrapper) return { paddingLeft: '8px', paddingRight: '8px' };
      return { paddingLeft: '0px', paddingRight: '0px' };
    };
    try {
      initCanvasScale();
      assertEquals(canvas.style.width, '342px', 'display width follows the wrapper content box');
      assertEquals(canvas.style.height, '114px', 'display height stays Math.round(cssW / 3)');
      assertEquals(canvas.width, 684, 'bitmap width is cssW * dpr');
      assertEquals(canvas.height, 228, 'bitmap height stays 3:1');
    } finally {
      window.getComputedStyle = origReader;
      window.innerWidth = origInner;
      window.devicePixelRatio = origDpr;
      delete wrapper.clientWidth;
      if (wrapper.clientWidth !== origClient) wrapper.clientWidth = origClient;
      canvas.width = origWidth;
      canvas.height = origHeight;
      canvas.style.width = origStyleWidth;
      canvas.style.height = origStyleHeight;
    }
  });
});

describe('Shell canvas height', () => {
  it('reserves the chrome row, jump, and share measured from the shell', () => {
    assertEquals(SHELL_CHROME_ROW, 56, 'keep this in sync with #game-wrapper padding-top');
    assertEquals(SHELL_JUMP_BLOCK, 65, 'jump is margin-top 12 plus a 53px control');
    assertEquals(SHELL_SHARE_BLOCK, 48, 'share is margin-top 10 plus a 38px control');
  });

  it('fitCanvasCssSize keeps the width-first 3:1 size when the height has room', () => {
    const size = fitCanvasCssSize(374, 687);
    assertEquals(size.cssW, 374, 'portrait stays on the content-box width');
    assertEquals(size.cssH, 125, 'height stays Math.round(374 / 3)');
    assertEquals(
      fitCanvasCssSize(374, 0).cssH,
      125,
      'a missing viewport height does not letterbox'
    );
  });

  it('fitCanvasCssSize letterboxes when the 3:1 height would pass the jump', () => {
    const maxW = 734;
    const maxH = computeCanvasMaxHeight(
      390,
      21 + SHELL_CHROME_ROW + SHELL_JUMP_BLOCK + SHELL_SHARE_BLOCK
    );
    const wide = fitCanvasCssSize(maxW, 0);
    const size = fitCanvasCssSize(maxW, maxH);
    assertEquals(maxH, 200, '390px landscape minus home indicator, chrome, jump, and share');
    assert(wide.cssH > maxH, 'width-first height is what clips the jump');
    assert(size.cssH <= maxH, 'fitted height stays inside the reserve');
    assert(size.cssW < maxW, 'the spare width is the letterbox');
    assert(size.cssW <= maxW, 'letterbox does not exceed the content box');
    assertEquals(size.cssW, size.cssH * 3, 'the fitted canvas stays 3:1');
    assertEquals(size.cssH, 200);
    assertEquals(size.cssW, 600);
  });

  it('initCanvasScale letterboxes a short viewport and leaves a tall phone width-first', () => {
    const origInner = window.innerWidth;
    const origInnerH = window.innerHeight;
    const origVv = window.visualViewport;
    const origDpr = window.devicePixelRatio;
    const origWidth = canvas.width;
    const origHeight = canvas.height;
    const origStyleWidth = canvas.style.width;
    const origStyleHeight = canvas.style.height;
    const origReader = window.getComputedStyle;
    window.getComputedStyle = undefined;
    window.devicePixelRatio = 1;
    try {
      window.innerWidth = 390;
      window.innerHeight = 844;
      window.visualViewport = undefined;
      initCanvasScale();
      assertEquals(canvas.style.width, '374px', 'a tall phone still uses the content-box width');
      assertEquals(canvas.style.height, '125px', 'a tall phone does not letterbox');

      window.innerWidth = 844;
      window.innerHeight = 390;
      initCanvasScale();
      assertEquals(
        canvas.style.width,
        '663px',
        'landscape display width letterboxes inside the 8px gutter'
      );
      assertEquals(
        canvas.style.height,
        '221px',
        'landscape display height stays above jump and share'
      );
      assertEquals(canvas.width, 663, 'bitmap width matches the letterboxed css width at dpr 1');
      assertEquals(canvas.height, 221, 'bitmap height stays 3:1');

      window.innerHeight = 900;
      window.visualViewport = { height: 390 };
      initCanvasScale();
      assertEquals(
        canvas.style.height,
        '221px',
        'the visible viewport wins over a taller layout viewport'
      );
      assertEquals(canvas.style.width, '663px', 'letterbox follows the visible height');
    } finally {
      window.getComputedStyle = origReader;
      window.innerWidth = origInner;
      if (origInnerH === undefined) delete window.innerHeight;
      else window.innerHeight = origInnerH;
      if (origVv === undefined) delete window.visualViewport;
      else window.visualViewport = origVv;
      window.devicePixelRatio = origDpr;
      canvas.width = origWidth;
      canvas.height = origHeight;
      canvas.style.width = origStyleWidth;
      canvas.style.height = origStyleHeight;
    }
  });
});

describe('Blocked storage (C2)', () => {
  // A browser that blocks storage throws on every localStorage access.
  function withBlockedStorage(fn) {
    const origMemory = safeStorage._memory;
    safeStorage._memory = {};
    const restoreStorage = overrideGlobalProp('localStorage', {
      getItem() {
        throw new Error('SecurityError: storage blocked');
      },
      setItem() {
        throw new Error('SecurityError: storage blocked');
      },
      removeItem() {
        throw new Error('SecurityError: storage blocked');
      },
    });
    try {
      fn();
    } finally {
      restoreStorage();
      safeStorage._memory = origMemory;
    }
  }

  it('safeStorage.get returns the fallback and set reports failure without throwing', () => {
    withBlockedStorage(() => {
      assertEquals(safeStorage.get('dino-mode'), null, 'missing key reads as null');
      assertEquals(
        safeStorage.get('dino-high-score', '0'),
        '0',
        'missing key reads as the fallback'
      );
      assertEquals(safeStorage.set('dino-mode', 'classic'), false, 'a blocked write returns false');
      assertEquals(
        safeStorage.get('dino-mode'),
        'classic',
        'the write is kept in memory for this session'
      );
      safeStorage.remove('dino-mode');
      assertEquals(safeStorage.get('dino-mode', 'x'), 'x', 'remove clears the in-memory copy');
    });
  });

  it('safeStorage reads the real store when it works', () => {
    const orig = localStorage.getItem('dino-muted');
    localStorage.removeItem('dino-muted');
    assertEquals(safeStorage.get('dino-muted', 'd'), 'd', 'missing key returns the fallback');
    assertEquals(safeStorage.set('dino-muted', '1'), true, 'a working write returns true');
    assertEquals(localStorage.getItem('dino-muted'), '1', 'value lands in localStorage');
    if (orig === null) localStorage.removeItem('dino-muted');
    else localStorage.setItem('dino-muted', orig);
  });

  it('a failed write reads back even when reads still work (full quota)', () => {
    const origMemory = safeStorage._memory;
    safeStorage._memory = {};
    const restoreStorage = overrideGlobalProp('localStorage', {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {},
    });
    try {
      ScoreStore.saveDailyBest(321);
      assertEquals(ScoreStore.loadDailyBest(), 321, 'daily best reads back from memory');
    } finally {
      restoreStorage();
      safeStorage._memory = origMemory;
    }
  });

  it('mode, mute and scores keep working in memory when storage is blocked', () => {
    const origMode = game.mode;
    const origMuted = audio.muted;
    withBlockedStorage(() => {
      assertEquals(loadMode(), MODES.UPDATED, 'loadMode falls back to Updated');
      assertEquals(ScoreStore.loadHighScore(), 0, 'no saved high score reads as 0');
      assertEquals(ScoreStore.loadDailyBest(), 0, 'no saved daily best reads as 0');
      audio.setMuted(true);
      assertEquals(audio.muted, true, 'mute toggles without storage');
      setMode(MODES.CLASSIC);
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(loadMode(), MODES.CLASSIC, 'mode choice is remembered in memory');
      ScoreStore.saveDailyBest(321);
      assertEquals(ScoreStore.loadDailyBest(), 321, 'daily best is remembered in memory');
    });
    audio.muted = origMuted;
    setMode(origMode === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED);
    cancelAnimationFrame(game.animationFrameId);
    game.mode = origMode;
  });

  it('a run that beats the high score records it in memory when storage is blocked', () => {
    const origHS = game.highScore;
    withBlockedStorage(() => {
      resetGame();
      game.obstacles.push({ x: 50, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      game.state = STATE.RUNNING;
      game.graceFrames = 0;
      game.score = 150;
      game.highScore = 50;
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.state, STATE.DEAD, 'the run ends normally');
      assertEquals(game.highScore, 150, 'game.highScore updates');
      assertEquals(
        ScoreStore.loadHighScore(),
        150,
        'ScoreStore reads the new best back from memory'
      );
    });
    game.highScore = origHS;
    resetGame();
    cancelAnimationFrame(game.animationFrameId);
  });

  it('the game boots in a fresh Node process where every storage access throws', () => {
    if (typeof require !== 'function') return; // browser runner: Node-only check
    const { execFileSync } = require('child_process');
    const filesPath = require.resolve('../../src/files.js');
    // The getter throws on every read, and the setter swallows the Node stub's
    // assignment, so the game sees storage exactly as a blocking browser does.
    const code = [
      "Object.defineProperty(global, 'localStorage', {",
      '  configurable: true,',
      "  get() { throw new Error('SecurityError: storage blocked'); },",
      '  set() {},',
      '});',
      'require(' + JSON.stringify(filesPath) + ').loadGame();',
      'ScoreStore.saveHighScore(4321);',
      'process.stdout.write(JSON.stringify({',
      '  mode: game.mode, muted: audio.muted, hi: ScoreStore.loadHighScore(),',
      '}));',
      'process.exit(0);',
    ].join('\n');
    const out = execFileSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 10000 });
    const result = JSON.parse(out);
    assertEquals(result.mode, MODES.UPDATED, 'boots in the default mode');
    assertEquals(result.muted, false, 'boots unmuted');
    assertEquals(result.hi, 4321, 'high score is recorded in memory');
  });
});
describe('Page background writes (R4)', () => {
  function stopLoop() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  }

  // A fake body that counts every write to style.background.
  // Counts every write to the page's style.background through a fake body.
  // A browser refuses a plain object assigned to document.body, and its real
  // style object keeps any spy defined on it, so shadow the body getter with
  // an own property instead. Deleting that property brings back the real body
  // (or, under Node, whatever the stub had before).
  function installCountingBody() {
    const writes = [];
    let value = '';
    const style = {};
    Object.defineProperty(style, 'background', {
      get: () => value,
      set: (v) => {
        value = v;
        writes.push(v);
      },
    });
    const fake = { style };
    const prev = Object.getOwnPropertyDescriptor(document, 'body');
    Object.defineProperty(document, 'body', { configurable: true, get: () => fake });
    const restore = () => {
      delete document.body;
      if (prev) Object.defineProperty(document, 'body', prev);
    };
    return { style, writes, restore };
  }

  function withBody(fn) {
    const body = installCountingBody();
    const orig = {
      state: game.state,
      score: game.score,
      speed: game.currentSpeed,
      obstacles: game.obstacles.slice(),
    };
    try {
      setPageBackground(null); // forget whatever an earlier test wrote
      body.writes.length = 0;
      fn(body);
    } finally {
      game.state = orig.state;
      game.score = orig.score;
      game.currentSpeed = orig.speed;
      game.obstacles.length = 0;
      orig.obstacles.forEach((o) => game.obstacles.push(o));
      setPageBackground(null);
      body.restore();
      stopLoop();
      resetGame();
      stopLoop();
    }
  }

  function runFrames(n, scoreAt) {
    for (let i = 0; i < n; i++) {
      game.state = STATE.RUNNING;
      game.obstacles.length = 0;
      game.score = scoreAt(i);
      STATE_HANDLERS[STATE.RUNNING]();
    }
  }

  it('writes once while the sky colour holds over a run', () => {
    withBody((body) => {
      resetGame();
      stopLoop();
      body.writes.length = 0;
      runFrames(120, () => 50);
      assertEquals(body.writes.length, 1, 'one write for 120 day frames');
      assertEquals(body.writes[0], getBackgroundColor(50), 'the write is the day sky');
    });
  });

  it('writes only when getBackgroundColor returns something new across dusk', () => {
    withBody((body) => {
      resetGame();
      stopLoop();
      body.writes.length = 0;
      // Let the run's own score carry the sky through dusk into night.
      const start = GAME_CONFIG.DAY_NIGHT_START - 5;
      const frames = Math.ceil(
        (GAME_CONFIG.DAY_NIGHT_END + 5 - start) / GAME_CONFIG.SCORE_INCREMENT
      );
      const seen = [];
      let s = start;
      for (let i = 0; i < frames; i++) {
        s += GAME_CONFIG.SCORE_INCREMENT; // handleRunning scores before it paints
        const c = getBackgroundColor(s);
        if (seen[seen.length - 1] !== c) seen.push(c);
      }
      game.score = start;
      for (let i = 0; i < frames; i++) {
        game.state = STATE.RUNNING;
        game.obstacles.length = 0;
        STATE_HANDLERS[STATE.RUNNING]();
      }
      assertEquals(body.writes.length, seen.length, 'one write per colour change');
      assert(body.writes.length < frames, 'fewer writes than sim frames');
      assertEquals(body.writes.join(','), seen.join(','), 'writes follow the sky in order');
    });
  });

  it('resetGame clears the page background once, and the next run writes again', () => {
    withBody((body) => {
      runFrames(5, () => GAME_CONFIG.DAY_NIGHT_END + 10);
      resetGame();
      stopLoop();
      assertEquals(body.style.background, '', 'reset clears the night page');
      const before = body.writes.length;
      resetGame();
      stopLoop();
      assertEquals(
        body.writes.length,
        before,
        'a second reset does not rewrite the same empty value'
      );
      runFrames(3, () => 0);
      assertEquals(body.writes.length, before + 1, 'the new run writes the day sky once');
      assertEquals(body.style.background, getBackgroundColor(0), 'page follows the day sky');
    });
  });

  it('idle and get-ready frames share the cache', () => {
    withBody((body) => {
      game.score = 0;
      for (let i = 0; i < 30; i++) STATE_HANDLERS[STATE.IDLE]();
      assertEquals(body.writes.length, 1, 'idle writes once');
      const origGrace = game.graceFrames;
      game.graceFrames = 100;
      game.state = STATE.WAITING;
      for (let i = 0; i < 30; i++) STATE_HANDLERS[STATE.WAITING]();
      game.graceFrames = origGrace;
      assertEquals(body.writes.length, 1, 'get-ready at the same sky adds no write');
    });
  });
});

describe('Shell touch targets (S1)', () => {
  it('the chrome row reserves a 44px touch target plus its top offset and gap', () => {
    const TOUCH_TARGET = 44;
    const TOP_OFFSET = 6;
    const GAP = 6;
    assert(
      SHELL_CHROME_ROW >= TOUCH_TARGET + TOP_OFFSET + GAP,
      'a 44px row at top 6px keeps a gap above the canvas'
    );
    assertEquals(
      SHELL_CHROME_ROW,
      TOUCH_TARGET + TOP_OFFSET + GAP,
      'matches #game-wrapper padding-top in style.css'
    );
  });

  it('a phone in landscape letterboxes the canvas below the taller row', () => {
    const maxH = computeCanvasMaxHeight(
      390,
      SHELL_CHROME_ROW + SHELL_JUMP_BLOCK + SHELL_SHARE_BLOCK
    );
    const size = fitCanvasCssSize(828, maxH);
    assertEquals(maxH, 221, '390px tall minus the 56px row, jump, and share');
    assert(size.cssH <= maxH, 'canvas never runs into the control row or jump');
    assertEquals(size.cssW, size.cssH * 3, 'the fitted canvas stays 3:1');
  });
});
describe('Live tuning panel (C7)', () => {
  // A fake document that records what loadTunePanel appends.
  function fakeDoc() {
    const added = [];
    const byId = {};
    return {
      added,
      head: {
        appendChild: (node) => {
          added.push(node);
          if (node.id) byId[node.id] = node;
        },
      },
      createElement: (tag) => ({ tag }),
      getElementById: (id) => byId[id] || null,
    };
  }

  it('TUNABLE_KEYS is exactly the keys the game reads through cfg() or its helpers', () => {
    // Node only: a browser test cannot read the game files from disk.
    if (!IN_NODE) return;
    const src = require('../../src/files.js').gameSource();
    const used = require('../tunable-keys.js').cfgKeysInSource(src);
    assertEquals(
      JSON.stringify([...TUNABLE_KEYS].sort()),
      JSON.stringify(used),
      'add a new cfg() key to TUNABLE_KEYS (and only visual keys go through cfg())'
    );
  });

  it('TUNABLE_KEYS holds no physics, spawning, scoring or speed key', () => {
    for (const key of [
      'GRAVITY',
      'JUMP_POWER',
      'INITIAL_SPEED',
      'SPEED_CAP',
      'PLATEAU_SPEED',
      'SCORE_INCREMENT',
      'SCORE_PER_LEVEL',
      'MIN_SPAWN_GAP',
      'MAX_SPAWN_GAP',
      'SPAWN_GAP_JITTER',
      'SPAWN_GAP_SPEED_FACTOR',
      'UPDATED_MIN_GAP_FRAMES',
      'HILL_RESPAWN_X_RANGE',
    ]) {
      assert(key in GAME_CONFIG, `${key} should still exist in GAME_CONFIG`);
      assert(!TUNABLE_KEYS.includes(key), `${key} must never be tunable`);
    }
    assert(Object.isFrozen(TUNABLE_KEYS), 'the list cannot be changed at runtime');
    for (const key of TUNABLE_KEYS) assert(key in GAME_CONFIG, `${key} has a GAME_CONFIG default`);
  });

  it('loads tune.js only with ?tune=1, and only once', () => {
    let doc = fakeDoc();
    assertEquals(loadTunePanel(doc, ''), false, 'a normal visit loads nothing');
    assertEquals(loadTunePanel(doc, '?tune=0'), false, 'only the value 1 counts');
    assertEquals(loadTunePanel(doc, '?qaNight=1'), false, 'other flags do not load it');
    assertEquals(doc.added.length, 0, 'nothing was appended');

    doc = fakeDoc();
    assertEquals(loadTunePanel(doc, '?foo=1&tune=1'), true, '?tune=1 loads the panel');
    assertEquals(doc.added.length, 1, 'one script tag');
    assertEquals(doc.added[0].tag, 'script', 'it is a script tag');
    assertEquals(doc.added[0].src, 'tune.js', 'it loads tune.js');
    assertEquals(loadTunePanel(doc, '?tune=1'), false, 'a second call does not load it again');
    assertEquals(doc.added.length, 1, 'still one script tag');
    assertEquals(loadTunePanel(null, '?tune=1'), false, 'no document, no panel');
  });
});

describe('Game files (C4)', () => {
  // The browser, the test page, the offline cache and Node must all load the
  // same game files in the same order. Static checks, so Node only.
  const IN_NODE_FS = typeof require === 'function';
  function gameFilesC4() {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');
    const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
    const { GAME_FILES } = require('../../src/files.js');
    const tags = (html) =>
      [...html.matchAll(/<script src="(src\/[^"?]+)(\?[^"]*)?"><\/script>/g)].map((m) => ({
        file: m[1],
        query: m[2] || '',
      }));
    return { fs, path, root, read, GAME_FILES, tags };
  }

  it('index.html loads every game file in order, each with the deploy version', () => {
    if (!IN_NODE_FS) return;
    const { read, GAME_FILES, tags } = gameFilesC4();
    const found = tags(read('index.html'));
    assertEquals(JSON.stringify(found.map((t) => t.file)), JSON.stringify(GAME_FILES));
    found.forEach((t) => assertEquals(t.query, '?v=__VERSION__', 'cache-bust on ' + t.file));
    assert(!/script\.js/.test(read('index.html')), 'no old script.js tag');
  });

  it('the browser test page loads the same game files in the same order', () => {
    if (!IN_NODE_FS) return;
    const { read, GAME_FILES, tags } = gameFilesC4();
    const found = tags(read('tests/test-runner.html')).map((t) => t.file);
    assertEquals(JSON.stringify(found), JSON.stringify(GAME_FILES));
  });

  it('the offline cache lists the same game files in the same order', () => {
    if (!IN_NODE_FS) return;
    const { read, GAME_FILES } = gameFilesC4();
    const m = read('sw.js').match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
    const urls = JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
    assertEquals(
      JSON.stringify(urls.filter((u) => u.startsWith('src/'))),
      JSON.stringify(GAME_FILES)
    );
  });

  it('the game starts only once the sprites and every game file are ready', () => {
    // A browser can fire the sprites' onload between two game files, before
    // the later files exist; starting then would throw and leave a blank page.
    const saved = { ...bootGate };
    const savedState = game.state;
    bootGate.assets = false;
    bootGate.files = false;
    bootGate.started = false;
    game.state = STATE.LOADING;
    bootWhenReady('assets');
    assertEquals(game.state, STATE.LOADING, 'sprites alone do not start the game');
    assertEquals(bootGate.started, false, 'not started yet');
    bootWhenReady('files');
    assertEquals(bootGate.started, true, 'starts once the files are in');
    assertEquals(game.state, STATE.IDLE, 'shows the start screen');
    cancelAnimationFrame(game.animationFrameId);
    game.state = STATE.LOADING;
    bootWhenReady('assets');
    assertEquals(game.state, STATE.LOADING, 'never starts twice');
    Object.assign(bootGate, saved);
    game.state = savedState;
  });

  it('a resize or a mode/Daily tap while game files load does not reach later files', () => {
    const savedFiles = bootGate.files;
    const savedMode = game.mode;
    const savedState = game.state;
    const origGameOver = testGlobal.drawGameOverScreen;
    let repaints = 0;
    testGlobal.drawGameOverScreen = () => repaints++;
    bootGate.files = false;
    game.state = STATE.DEAD;
    handleResize();
    assertEquals(repaints, 0, 'no Game Over repaint before the files are in');
    game.mode = MODES.UPDATED;
    const tap = (id, mode) => {
      const node = document.getElementById(id);
      const target = { dataset: mode ? { mode } : {} };
      (node._listeners.click || []).forEach((fn) =>
        fn({ target, stopPropagation() {}, preventDefault() {} })
      );
    };
    tap('mode-toggle', MODES.CLASSIC);
    assertEquals(game.mode, MODES.UPDATED, 'mode tap ignored while loading');
    tap('daily-btn');
    assertEquals(game.mode, MODES.UPDATED, 'Daily tap ignored while loading');
    bootGate.files = savedFiles;
    testGlobal.drawGameOverScreen = origGameOver;
    game.mode = savedMode;
    game.state = savedState;
  });

  it('the last start-up file marks the game files ready', () => {
    if (!IN_NODE_FS) return;
    const { read, GAME_FILES } = gameFilesC4();
    assert(
      /^bootWhenReady\('files'\);/m.test(read('src/09-init.js')),
      "09-init.js calls bootWhenReady('files')"
    );
    const others = GAME_FILES.filter((f) => f !== 'src/09-init.js');
    others.forEach((f) =>
      assert(
        !/^bootWhenReady\('files'\)/m.test(read(f)),
        'only 09-init.js marks the files ready: ' + f
      )
    );
  });

  it('every file in src/ is a listed game file (or the list itself)', () => {
    if (!IN_NODE_FS) return;
    const { fs, path, root, GAME_FILES } = gameFilesC4();
    const onDisk = fs
      .readdirSync(path.join(root, 'src'))
      .filter((f) => f.endsWith('.js') && f !== 'files.js')
      .map((f) => 'src/' + f)
      .sort();
    assertEquals(JSON.stringify(onDisk), JSON.stringify([...GAME_FILES].sort()));
  });
});

describe('Installable and offline (PL1)', () => {
  // Static checks read files from disk, so they only run under Node.
  const fs = typeof require === 'function' ? require('fs') : null;
  const path = typeof require === 'function' ? require('path') : null;
  const root = path ? path.join(__dirname, '..', '..') : '';
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  // sw.js is a worker script, not a module; pull PRECACHE_URLS out of its text.
  const precacheUrls = () => {
    const m = read('sw.js').match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
    return JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  };

  it('manifest has what Add to Home Screen needs', () => {
    if (!fs) return;
    const m = JSON.parse(read('manifest.webmanifest'));
    assert(m.name && m.short_name, 'name and short_name');
    assert(m.short_name.length <= 12, 'short_name fits under a home-screen icon');
    assert(['fullscreen', 'standalone'].includes(m.display), 'app-like display');
    assertEquals(m.orientation, 'landscape', 'landscape preferred');
    assertEquals(m.start_url, './', 'relative start_url works under the Pages subpath');
    assertEquals(m.scope, './', 'relative scope');
    assert(/^#[0-9a-f]{6}$/i.test(m.theme_color), 'theme colour');
    const sizes = m.icons.map((i) => i.sizes);
    assert(sizes.includes('192x192') && sizes.includes('512x512'), '192 and 512 icons');
    assert(
      m.icons.some((i) => i.purpose === 'maskable'),
      'a maskable icon for Android'
    );
    m.icons.forEach((i) => assert(exists(i.src), 'icon file exists: ' + i.src));
  });

  it('index.html links the manifest and an apple-touch-icon that exist', () => {
    if (!fs) return;
    const html = read('index.html');
    const manifest = html.match(/<link rel="manifest" href="([^"]+)"\s*\/?>/);
    assert(manifest && exists(manifest[1]), 'manifest link');
    const apple = html.match(/<link rel="apple-touch-icon" href="([^"]+)"\s*\/?>/);
    assert(apple && exists(apple[1]), 'apple-touch-icon link');
    assert(/<meta name="theme-color"/.test(html), 'theme-color meta');
  });

  it('service worker precaches the shell, every sprite and every icon', () => {
    if (!fs) return;
    const urls = precacheUrls();
    urls.filter((u) => u !== './').forEach((u) => assert(exists(u), 'precached file exists: ' + u));
    const { GAME_FILES, gameSource } = require('../../src/files.js');
    ['./', 'index.html', ...GAME_FILES, 'style.css', 'manifest.webmanifest'].forEach((u) =>
      assert(urls.includes(u), 'shell file precached: ' + u)
    );
    const sprites = (gameSource().match(/'assets\/[^']+\.png'/g) || []).map((s) => s.slice(1, -1));
    assertEquals(sprites.length, 6, 'the game loads 6 sprites');
    sprites.forEach((s) => assert(urls.includes(s), 'sprite precached: ' + s));
    const html = read('index.html');
    (html.match(/href="(icons\/[^"]+)"/g) || []).forEach((h) => {
      const u = h.slice(6, -1);
      assert(urls.includes(u), 'linked icon precached: ' + u);
    });
    JSON.parse(read('manifest.webmanifest')).icons.forEach((i) =>
      assert(urls.includes(i.src), 'manifest icon precached: ' + i.src)
    );
  });

  it('cache name carries the deploy version that pages.yml injects', () => {
    if (!fs) return;
    const sw = read('sw.js');
    assert(/const CACHE_VERSION = '__VERSION__';/.test(sw), 'placeholder in sw.js');
    assert(/CACHE_NAME = 'rex-run-' \+ CACHE_VERSION/.test(sw), 'cache name uses the version');
    const pages = read('.github/workflows/pages.yml');
    assert(/sed -i "s\/__VERSION__\/[^"]*" [^\n]*\bsw\.js/.test(pages), 'pages.yml rewrites sw.js');
    // The dev-mode sentinel must survive that sed, or a deploy would think it is local.
    const deployed = sw.replace(/__VERSION__/g, 'abc1234');
    assert(
      deployed.includes("CACHE_VERSION !== '__VER' + 'SION__'"),
      'sentinel survives deploy sed'
    );
    assert(deployed.includes("CACHE_VERSION = 'abc1234'"), 'version injected');
  });

  it('registerServiceWorker registers sw.js on load in a capable browser', () => {
    const registered = [];
    const listeners = {};
    const nav = {
      serviceWorker: {
        register: (url) => {
          registered.push(url);
          return Promise.resolve();
        },
      },
    };
    const win = { isSecureContext: true, addEventListener: (t, fn) => (listeners[t] = fn) };
    assertEquals(registerServiceWorker(nav, win), true, 'tries to register');
    assertEquals(registered.length, 0, 'waits for load, not during sprite preload');
    listeners.load();
    assertEquals(registered[0], 'sw.js', 'registers the relative sw.js');
  });

  it('registerServiceWorker is a no-op without support or a secure context', () => {
    const win = { isSecureContext: true, addEventListener: () => {} };
    assertEquals(registerServiceWorker(undefined, win), false, 'no navigator (Node)');
    assertEquals(registerServiceWorker({}, win), false, 'no serviceWorker API');
    const nav = { serviceWorker: { register: () => Promise.resolve() } };
    assertEquals(
      registerServiceWorker(nav, { isSecureContext: false, addEventListener: () => {} }),
      false,
      'file://'
    );
  });

  it('a rejected registration does not throw', () => {
    let onLoad;
    const nav = { serviceWorker: { register: () => Promise.reject(new Error('blocked')) } };
    const win = { isSecureContext: true, addEventListener: (t, fn) => (onLoad = fn) };
    registerServiceWorker(nav, win);
    onLoad();
    assert(true, 'no synchronous throw');
  });
});

describe('Phone play area (S2)', () => {
  // A fake touch below or above the canvas bottom, on a given target.
  const tapZoneEvent = (target, clientY) => {
    const ev = { target, changedTouches: [{ clientY }], prevented: false };
    ev.preventDefault = () => {
      ev.prevented = true;
    };
    return ev;
  };
  const withCanvasBottom = (bottom, fn) => {
    const orig = Object.getOwnPropertyDescriptor(canvas, 'getBoundingClientRect');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      writable: true,
      value: () => ({ top: bottom - 100, bottom }),
    });
    try {
      fn();
    } finally {
      delete canvas.getBoundingClientRect;
      if (orig) Object.defineProperty(canvas, 'getBoundingClientRect', orig);
    }
  };
  const plainArea = { closest: () => null };
  const insideButton = { closest: () => ({}) };
  // Swap matchMedia for one that answers only the given query.
  const withMedia = (matchQuery, fn) => {
    const orig = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q) => ({ matches: q === matchQuery, addEventListener: () => {} }),
    });
    try {
      fn();
    } finally {
      delete window.matchMedia;
      if (orig) Object.defineProperty(window, 'matchMedia', orig);
    }
  };
  const PORTRAIT = '(hover: none) and (pointer: coarse) and (orientation: portrait)';
  const LANDSCAPE = '(hover: none) and (pointer: coarse) and (orientation: landscape)';
  const hintEl = () => document.getElementById('rotate-hint');
  const withHintStore = (value, fn) => {
    const orig = safeStorage.get(ROTATE_HINT_KEY, null);
    if (value === null) safeStorage.remove(ROTATE_HINT_KEY);
    else safeStorage.set(ROTATE_HINT_KEY, value);
    try {
      fn();
    } finally {
      if (orig === null) safeStorage.remove(ROTATE_HINT_KEY);
      else safeStorage.set(ROTATE_HINT_KEY, orig);
      refreshRotateHint();
    }
  };

  it('a tap below the canvas jumps during a run', () => {
    resetGame();
    game.state = STATE.RUNNING;
    withCanvasBottom(300, () => {
      const ev = tapZoneEvent(plainArea, 450);
      handleTapZone(ev);
      assert(dino.isJumping, 'tap zone jumps');
      assert(ev.prevented, 'the touch does not also scroll or click');
    });
    resetGame();
  });

  it('a tap below the canvas starts the game from the start screen', () => {
    const origState = game.state;
    resetGame();
    game.state = STATE.IDLE;
    withHintStore('1', () => {
      withCanvasBottom(300, () => handleTapZone(tapZoneEvent(plainArea, 450)));
      assertEquals(game.state, STATE.WAITING, 'IDLE -> WAITING like a canvas tap');
    });
    resetGame();
    game.state = origState;
  });

  it('a tap above the canvas bottom, on a button or on the canvas does nothing here', () => {
    resetGame();
    game.state = STATE.RUNNING;
    withCanvasBottom(300, () => {
      const above = tapZoneEvent(plainArea, 120);
      handleTapZone(above);
      assert(!dino.isJumping && !above.prevented, 'above the canvas bottom is not the zone');
      const onButton = tapZoneEvent(insideButton, 450);
      handleTapZone(onButton);
      assert(!dino.isJumping && !onButton.prevented, 'buttons keep their own handlers');
      const onCanvas = tapZoneEvent(canvas, 450);
      handleTapZone(onCanvas);
      assert(!dino.isJumping && !onCanvas.prevented, 'the canvas has its own listener');
    });
    resetGame();
  });

  it('the turn-sideways hint shows once on a portrait phone that has not seen it', () => {
    withHintStore(null, () => {
      withMedia(PORTRAIT, () => {
        refreshRotateHint();
        assertEquals(hintEl().hidden, false, 'shown on a fresh portrait phone');
        markRotateHintSeen();
        assertEquals(hintEl().hidden, true, 'hidden once seen');
        assert(rotateHintSeen(), 'remembered');
        refreshRotateHint();
        assertEquals(hintEl().hidden, true, 'stays hidden afterwards');
      });
    });
  });

  it('the hint never shows on desktop or in landscape', () => {
    withHintStore(null, () => {
      withMedia('none', () => {
        refreshRotateHint();
        assertEquals(hintEl().hidden, true, 'hidden on desktop');
      });
      withMedia(LANDSCAPE, () => {
        refreshRotateHint();
        assertEquals(hintEl().hidden, true, 'hidden in landscape');
      });
    });
  });

  it('starting a run or turning the phone sideways retires the hint', () => {
    withHintStore(null, () => {
      resetGame();
      game.state = STATE.IDLE;
      withMedia(PORTRAIT, () => handleAction());
      assert(rotateHintSeen(), 'starting a run marks it seen');
    });
    resetGame();
    withHintStore(null, () => {
      withMedia(LANDSCAPE, () => handleResize());
      assert(rotateHintSeen(), 'turning to landscape marks it seen');
    });
    withHintStore(null, () => {
      withMedia(PORTRAIT, () => {
        refreshRotateHint();
        resetGame(); // the path Daily and the mode toggle take
      });
      assert(rotateHintSeen(), 'a Daily or mode-toggle start marks it seen');
      assertEquals(hintEl().hidden, true, 'and hides it');
    });
  });
});

describe('Big button label (S3)', () => {
  const labelFor = (state, skippable) => {
    const origState = game.state;
    const origSkip = game.countdownSkippable;
    game.state = state;
    game.countdownSkippable = skippable;
    const label = jumpButtonLabel();
    game.state = origState;
    game.countdownSkippable = origSkip;
    return label;
  };

  it('says Start on the start screen, Jump in a run, Restart on Game Over', () => {
    assertEquals(labelFor(STATE.IDLE, false).text, 'TAP TO START', 'IDLE text');
    assertEquals(labelFor(STATE.IDLE, false).aria, 'Start', 'IDLE name');
    assertEquals(labelFor(STATE.RUNNING, false).text, 'TAP TO JUMP', 'RUNNING text');
    assertEquals(labelFor(STATE.RUNNING, false).aria, 'Jump', 'RUNNING name');
    assertEquals(labelFor(STATE.DEAD, true).text, 'TAP TO RESTART', 'DEAD text');
    assertEquals(labelFor(STATE.DEAD, true).aria, 'Restart', 'DEAD name');
  });

  it('the countdown says Get ready, or Start when a tap can skip it', () => {
    assertEquals(labelFor(STATE.WAITING, false).text, 'GET READY', 'first countdown');
    assertEquals(labelFor(STATE.WAITING, true).text, 'TAP TO START', 'skippable countdown');
    assertEquals(labelFor(STATE.PAUSED, true).text, 'PAUSED', 'paused run');
  });

  it('drawing a frame puts the label and its name on the button', () => {
    const btn = document.getElementById('jump-btn');
    const origText = btn.textContent;
    const origSet = btn.setAttribute;
    let aria = null;
    btn.setAttribute = (name, value) => {
      if (name === 'aria-label') aria = value;
    };
    resetGame();
    game.state = STATE.DEAD;
    syncJumpButtonLabel();
    assertEquals(btn.textContent, 'TAP TO RESTART', 'DEAD label written');
    assertEquals(aria, 'Restart', 'DEAD name written');
    game.state = STATE.RUNNING;
    syncJumpButtonLabel();
    assertEquals(btn.textContent, 'TAP TO JUMP', 'RUNNING label written');
    assertEquals(aria, 'Jump', 'RUNNING name written');
    aria = null;
    syncJumpButtonLabel();
    assertEquals(aria, null, 'an unchanged label is not written again');
    btn.setAttribute = origSet;
    btn.textContent = origText;
    resetGame();
  });
});

describe('Zoom and touch (A1)', () => {
  const IN_NODE_FS_A1 = typeof require === 'function';
  const readA1 = (rel) => {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  };

  it('the page allows pinch zoom', () => {
    if (!IN_NODE_FS_A1) return;
    const meta = readA1('index.html').match(/<meta\s+name="viewport"[^>]*>/s)[0];
    assert(!/user-scalable\s*=\s*no/.test(meta), 'no user-scalable=no');
    assert(!/maximum-scale/.test(meta), 'no maximum-scale');
  });

  it('the canvas and buttons stop double-tap zoom with touch-action: manipulation', () => {
    if (!IN_NODE_FS_A1) return;
    const css = readA1('style.css');
    assert(/button\s*\{[^}]*touch-action:\s*manipulation/.test(css), 'buttons');
    assert(/#gameCanvas\s*\{[^}]*touch-action:\s*manipulation/.test(css), 'canvas');
  });

  it('a two-finger touch below the canvas is a pinch, not a jump', () => {
    resetGame();
    game.state = STATE.RUNNING;
    const orig = Object.getOwnPropertyDescriptor(canvas, 'getBoundingClientRect');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      writable: true,
      value: () => ({ top: 200, bottom: 300 }),
    });
    const ev = {
      target: { closest: () => null },
      touches: [{}, {}],
      changedTouches: [{ clientY: 450 }],
      preventDefault() {
        this.prevented = true;
      },
    };
    handleTapZone(ev);
    delete canvas.getBoundingClientRect;
    if (orig) Object.defineProperty(canvas, 'getBoundingClientRect', orig);
    assert(!dino.isJumping && !ev.prevented, 'pinch left to the browser');
    resetGame();
  });

  it('a second finger on the canvas or jump button is a pinch, not a jump', () => {
    resetGame();
    game.state = STATE.RUNNING;
    const ev = {
      touches: [{}, {}],
      preventDefault() {
        this.prevented = true;
      },
    };
    handleTouchAction(ev);
    assert(!dino.isJumping && !ev.prevented, 'pinch left to the browser');
    const one = {
      touches: [{}],
      preventDefault() {
        this.prevented = true;
      },
    };
    handleTouchAction(one);
    assert(dino.isJumping && one.prevented, 'one finger still jumps');
    resetGame();
  });
});

describe('Space on a focused button (A2)', () => {
  const keyEventA2 = (code, target) => {
    const ev = { code, target, prevented: false };
    ev.preventDefault = () => {
      ev.prevented = true;
    };
    return ev;
  };
  const focusedA2 = (selector) => ({ closest: (sel) => (sel.includes(selector) ? {} : null) });
  const withActionSpyA2 = (fn) => {
    const orig = testGlobal.handleAction;
    let calls = 0;
    testGlobal.handleAction = () => {
      calls += 1;
    };
    try {
      fn();
    } finally {
      testGlobal.handleAction = orig;
    }
    return calls;
  };

  it('Space on a focused button is left to the button', () => {
    let ev;
    const calls = withActionSpyA2(() => {
      ev = keyEventA2('Space', focusedA2('button'));
      handleKeyDown(ev);
    });
    assertEquals(calls, 0, 'no jump or restart');
    assert(!ev.prevented, 'the button still gets its press');
  });

  it('Enter on a focused link is left to the link', () => {
    let ev;
    const calls = withActionSpyA2(() => {
      ev = keyEventA2('Enter', focusedA2('a'));
      handleKeyDown(ev);
    });
    assertEquals(calls, 0);
    assert(!ev.prevented);
  });

  it('Space with nothing focused still jumps', () => {
    let ev;
    const calls = withActionSpyA2(() => {
      ev = keyEventA2('Space', { closest: () => null });
      handleKeyDown(ev);
    });
    assertEquals(calls, 1);
    assert(ev.prevented, 'page does not scroll');
  });

  it('Up arrow and W still jump while a button has focus', () => {
    const calls = withActionSpyA2(() => {
      handleKeyDown(keyEventA2('ArrowUp', focusedA2('button')));
      handleKeyDown(keyEventA2('KeyW', focusedA2('button')));
    });
    assertEquals(calls, 2);
  });
});
