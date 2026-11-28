// Unit tests: daily. The Daily Challenge: seed, number, best, HUD, framing, and sharing the result.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('daily');

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
    try {
      shareDailyResult();
    } catch {
      threw = true;
    }
    assert(!threw, 'shareDailyResult() should not throw even with no clipboard');
    game.dailyBest = origDailyBest;
  });

  function withClipboard(writeText, run) {
    const shareBtn = document.getElementById('share-btn');
    const handler =
      shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    assert(typeof handler === 'function', 'share button must register a click handler');
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    Object.defineProperty(testGlobal, 'navigator', {
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
    if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
    Animations.copyFlashFrames = origFlash;
    shareBtn.textContent = origText;
    run({ threw, flash, label });
  }

  it('Copy result still flashes when clipboard writeText throws', () => {
    withClipboard(
      () => {
        throw new Error('clipboard blocked');
      },
      ({ threw, flash, label }) => {
        assert(!threw, 'a blocked clipboard must not abort the share tap');
        assert(flash > 0, 'copy flash should start even when writeText throws');
        assertEquals(label, '✓ Copied!', 'the button should say Copied before the next frame');
      }
    );
  });

  it('Copy result still flashes when clipboard writeText rejects', () => {
    withClipboard(
      () => Promise.reject(new Error('clipboard denied')),
      ({ threw, flash, label }) => {
        assert(!threw, 'a rejected clipboard write must not abort the share tap');
        assert(flash > 0, 'copy flash should start even when writeText rejects');
        assertEquals(label, '✓ Copied!', 'the button should say Copied before the next frame');
      }
    );
  });
});

describe('Daily obstacle sequence vs reduced motion', () => {
  function collectDailySpawns(useHills) {
    game.mode = MODES.DAILY;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    const startX = game.hills.map((h) => h.x);
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
    return { seq, startX, endX: game.hills.map((h) => h.x) };
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

      assert(
        moving.endX.some((x, i) => x !== moving.startX[i]),
        'Scrolling run must move hills so respawn draws are actually exercised'
      );
      assert(
        reduced.endX.every((x, i) => x === reduced.startX[i]),
        'Reduced motion must leave drawn hill positions unchanged'
      );
      assertEquals(
        moving.seq.join('|'),
        skipped.seq.join('|'),
        'Hills draw on their own stream, so they never change the obstacle rolls'
      );

      const movingKey = moving.seq.join('|');
      const reducedKey = reduced.seq.join('|');
      if (movingKey !== reducedKey) {
        let i = 0;
        while (i < moving.seq.length && reduced.seq[i] === moving.seq[i]) i++;
        assert(
          false,
          `Daily obstacle sequence diverged at spawn ${i}: moving=${moving.seq[i]} reduced=${reduced.seq[i]}`
        );
      }
    } finally {
      setReducedMotion(false);
      game.mode = origMode;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
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
    origDate !== null
      ? localStorage.setItem('dino-daily-date', origDate)
      : localStorage.removeItem('dino-daily-date');
    origBest !== null
      ? localStorage.setItem('dino-daily-best', origBest)
      : localStorage.removeItem('dino-daily-best');
  });

  it('ScoreStore.loadDailyBest() returns stored value when date matches today', () => {
    const origDate = localStorage.getItem('dino-daily-date');
    const origBest = localStorage.getItem('dino-daily-best');
    localStorage.setItem('dino-daily-date', String(dailySeed()));
    localStorage.setItem('dino-daily-best', '847');
    assertEquals(ScoreStore.loadDailyBest(), 847, 'Should return 847 when date matches');
    origDate !== null
      ? localStorage.setItem('dino-daily-date', origDate)
      : localStorage.removeItem('dino-daily-date');
    origBest !== null
      ? localStorage.setItem('dino-daily-best', origBest)
      : localStorage.removeItem('dino-daily-best');
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

    origDate !== null
      ? localStorage.setItem('dino-daily-date', origDate)
      : localStorage.removeItem('dino-daily-date');
    origBest !== null
      ? localStorage.setItem('dino-daily-best', origBest)
      : localStorage.removeItem('dino-daily-best');
  });
});

// Pins "now" to one UTC instant and makes local Y/M/D disagree with UTC.
// offsetMinutesEast is the wall-clock shift (UTC-8 → -480). Restores Date after fn.
function withSplitClock(utcMs, offsetMinutesEast, fn) {
  const RealDate = testGlobal.Date;
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
  testGlobal.Date = FakeDate;
  try {
    return fn();
  } finally {
    testGlobal.Date = RealDate;
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
      assertEquals(
        wallCalendarSeed(new Date()),
        localSeed,
        'fixture local day must disagree with UTC'
      );
      assertEquals(utcCalendarSeed(utcMs), utcSeed, 'fixture UTC day');
      const seed = dailySeed();
      assertEquals(seed, utcSeed, 'daily seed follows the UTC calendar day');
      assertEquals(
        dailyNumber(),
        expectedDailyNumber(utcMs),
        'daily number counts UTC days from the project epoch'
      );
      const numberDayMs = DAILY_EPOCH_MS_TEST + (dailyNumber() - 1) * 86400000;
      assertEquals(
        utcCalendarSeed(numberDayMs),
        seed,
        'daily number and daily seed name the same UTC day'
      );
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
        assertEquals(
          ScoreStore.loadDailyBest(),
          0,
          'a local-calendar key is stale once the UTC day has flipped'
        );
      });
    });
  });

  it('east of UTC, seed, number, and today-best key stay on the UTC day after local midnight', () => {
    // 16:30 UTC on the 28th is already 01:30 on the 29th in UTC+9.
    const utcMs = Date.parse('2026-09-28T16:30:00.000Z');
    const utcSeed = 20260928;
    const localSeed = 20260929;
    withSplitClock(utcMs, 9 * 60, () => {
      assertEquals(
        wallCalendarSeed(new Date()),
        localSeed,
        'fixture local day must disagree with UTC'
      );
      const seed = dailySeed();
      assertEquals(seed, utcSeed, 'daily seed follows the UTC calendar day');
      assertEquals(
        dailyNumber(),
        expectedDailyNumber(utcMs),
        'daily number counts UTC days from the project epoch'
      );
      const numberDayMs = DAILY_EPOCH_MS_TEST + (dailyNumber() - 1) * 86400000;
      assertEquals(
        utcCalendarSeed(numberDayMs),
        seed,
        'daily number and daily seed name the same UTC day'
      );
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
      assert(
        calls.some((t) => t === '00042'),
        `${when} daily HUD should show the current score, got: ${JSON.stringify(calls)}`
      );
      assert(
        !calls.some((t) => t.includes('TODAY')),
        `${when} daily HUD must not show TODAY, got: ${JSON.stringify(calls)}`
      );
      assert(
        !calls.some((t) => t.startsWith('HI ')),
        `${when} daily HUD must not show HI, got: ${JSON.stringify(calls)}`
      );
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

    assert(
      calls.some((t) => t === 'TODAY BEST'),
      `Game Over must keep TODAY BEST, got: ${JSON.stringify(calls)}`
    );
    assert(
      calls.some((t) => t === '00500'),
      `Game Over must show today's best score, got: ${JSON.stringify(calls)}`
    );
    assert(shared.includes('500'), 'Share result must still include the daily best');
  });
});

describe('Daily pre-run framing', () => {
  const STEM = 'Same course as everyone today';
  const preRunLine = () => STEM + ' · #' + dailyNumber();

  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) =>
      calls.push({ text: String(text), x, y, font: ctx.font, fillStyle: ctx.fillStyle });
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
    assert(
      line,
      `Daily WAITING should show the shared-run line, got: ${JSON.stringify(calls.map((c) => c.text))}`
    );
    assertEquals(
      line.text,
      STEM + ' · #' + dailyNumber(),
      'the shared-course line should name today’s daily number'
    );
    assert(!line.text.includes('📅'), 'the pre-run line stays quiet, without the Game Over badge');
    assert(
      calls.some((c) => c.text === 'GET READY'),
      'GET READY should stay on the overlay'
    );
    assert(
      line.y > GAME_CONFIG.SCORE_Y,
      'the line should sit with the overlay, not in the score HUD'
    );
    assert(
      line.y < GAME_CONFIG.CANVAS_H - GAME_CONFIG.DINO_HEIGHT,
      'the line should stay above the dino'
    );
  });

  it('Daily countdown still shows the line, and the text does not pulse', () => {
    const early = withDailyWaiting(GAME_CONFIG.GRACE_FRAMES, overlayCalls);
    const late = withDailyWaiting(40, () => {
      game.animFrame = 90;
      return overlayCalls();
    });
    const earlyLine = early.find((c) => c.text === preRunLine());
    const lateLine = late.find((c) => c.text === preRunLine());
    assert(
      late.some((c) => c.text !== 'GET READY' && c.text !== preRunLine()),
      `countdown phase should still draw a count, got: ${JSON.stringify(late.map((c) => c.text))}`
    );
    assert(lateLine, 'the shared-run line should stay through the countdown');
    assertEquals(
      lateLine.fillStyle,
      earlyLine.fillStyle,
      'the line should stay static when frames advance'
    );
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

    assert(
      !classic.some((c) => c.text === preRunLine() || c.text.includes(STEM)),
      `Classic must not show Daily framing, got: ${JSON.stringify(classic.map((c) => c.text))}`
    );
    assert(
      !updated.some((c) => c.text === preRunLine() || c.text.includes(STEM)),
      `Updated must not show Daily framing, got: ${JSON.stringify(updated.map((c) => c.text))}`
    );
    assert(
      classic.some((c) => c.text === 'GET READY'),
      'Classic GET READY should be unchanged'
    );
    assert(
      updated.some((c) => c.text === 'GET READY'),
      'Updated GET READY should be unchanged'
    );
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

    assert(
      !running.some((c) => c.text === preRunLine()),
      `RUNNING must not show the shared-run line, got: ${JSON.stringify(running.map((c) => c.text))}`
    );
    assert(
      !running.some(
        (c) =>
          c.text.includes('TODAY') ||
          c.text.includes('#' + dailyNumber()) ||
          c.text.includes('DAILY')
      ),
      `RUNNING must not grow a Daily #N or TODAY HUD, got: ${JSON.stringify(running.map((c) => c.text))}`
    );
    assert(
      !over.some((c) => c.text === preRunLine()),
      `Game Over should keep its own result screen, got: ${JSON.stringify(over.map((c) => c.text))}`
    );
    assert(
      over.some((c) => c.text === 'TODAY BEST'),
      'Game Over should still show TODAY BEST'
    );
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
    assert(
      !updated.includes('#' + dailyNumber()),
      `Updated countdown must not announce a daily number, got: ${updated}`
    );
    assert(
      daily.includes('Get ready'),
      `Daily countdown should still say get ready, got: ${daily}`
    );
    assert(
      daily.includes(preRunLine()),
      `Daily countdown should mention the shared course and #N, got: ${daily}`
    );
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

    assert(
      /Daily challenge #\d+/.test(entered),
      `entering Daily should name the challenge, got: ${entered}`
    );
    assert(
      entered.includes(preRunLine()),
      `entering Daily should mention the shared course and #N, got: ${entered}`
    );
    assert(!left.includes(STEM), `leaving Daily must drop the shared-course line, got: ${left}`);
    assert(
      left.includes('Updated mode'),
      `leaving Daily should announce Updated mode, got: ${left}`
    );
    assertEquals(
      btn.textContent,
      '📅 #' + dailyNumber(),
      'the Daily button keeps the calendar and today #N'
    );
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
      restore() {
        btn.setAttribute = origSet;
      },
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
      assert(
        spy.seen.includes('aria-label=Daily challenge #' + dailyNumber()),
        'Classic names the challenge and today #N, got: ' + spy.seen.join('|')
      );

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
    ctx.fillText = (text, x, y) =>
      calls.push({
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
    stubElementStyle(shareBtn, { display: 'none' });
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
    restoreElementStyle(shareBtn, orig.btnStyle);
    shareBtn.textContent = orig.btnText;
    return { calls, button };
  }

  it('settled Daily Game Over points at TODAY BEST and Copy result', () => {
    let shared = '';
    const { calls, button } = withGameOver(
      MODES.DAILY,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      },
      () => {
        const drawn = captureFillText(drawGameOverScreen);
        shared = shareDailyResult();
        return drawn;
      }
    );
    const hint = calls.find((c) => c.text === HINT);
    assert(
      hint,
      `Daily Game Over should nudge toward sharing, got: ${JSON.stringify(calls.map((c) => c.text))}`
    );
    assert(
      calls.some((c) => c.text === 'TODAY BEST'),
      'TODAY BEST should stay on the death screen'
    );
    assert(
      calls.some((c) => c.text === '00500'),
      'the today-best score should stay on the death screen'
    );
    assert(
      !calls.some((c) => c.text === preRunLine()),
      'the pre-run line should stay off Game Over'
    );
    assertEquals(
      hint.y,
      GAME_CONFIG.CANVAS_H - 16,
      'the hint should sit on the bottom edge, under the scores'
    );
    assertEquals(
      button.display,
      'block',
      'Copy result should still appear once the count-up finishes'
    );
    assertEquals(button.text, '📋 Copy result', 'the share button label should stay Copy result');
    assert(shared.includes('500'), 'Share result should still include the daily best');
  });

  it('the hint stays static, including when motion is reduced and after a copy', () => {
    const first = withGameOver(
      MODES.DAILY,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
        setReducedMotion(false);
      },
      () => captureFillText(drawGameOverScreen)
    );
    const later = withGameOver(
      MODES.DAILY,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
        game.animFrame = 90;
        setReducedMotion(true);
      },
      () => captureFillText(drawGameOverScreen)
    );
    const copied = withGameOver(
      MODES.DAILY,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
        Animations.copyFlashFrames = 40;
        setReducedMotion(true);
      },
      () => captureFillText(drawGameOverScreen)
    );
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
    const mid = withGameOver(
      MODES.DAILY,
      () => {
        Animations.deathAnimFrame = 0;
      },
      () => captureFillText(drawGameOverScreen)
    );
    assert(
      !mid.calls.some((c) => c.text === HINT),
      `the hint should wait for the settled screen, got: ${JSON.stringify(mid.calls.map((c) => c.text))}`
    );
    assertEquals(mid.button.display, 'none', 'Copy result should still wait for the count-up');
  });

  it('Classic and Updated Game Over do not show the Daily hint', () => {
    const classic = withGameOver(
      MODES.CLASSIC,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      },
      () => captureFillText(drawGameOverScreen)
    );
    const updated = withGameOver(
      MODES.UPDATED,
      () => {
        Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      },
      () => captureFillText(drawGameOverScreen)
    );

    assert(
      !classic.calls.some((c) => c.text === HINT),
      `Classic Game Over must stay free of the Daily hint, got: ${JSON.stringify(classic.calls.map((c) => c.text))}`
    );
    assert(
      !updated.calls.some((c) => c.text === HINT),
      `Updated Game Over must stay free of the Daily hint, got: ${JSON.stringify(updated.calls.map((c) => c.text))}`
    );
    assert(
      classic.calls.some((c) => c.text === 'Tap / Press Space to Restart'),
      'Classic should keep its restart line'
    );
    assert(
      updated.calls.some((c) => c.text === 'YOUR BEST'),
      'Updated should keep the free-play best comparison'
    );
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

    assert(
      !waiting.some((c) => c.text === HINT),
      `WAITING should keep the pre-run line only, got: ${JSON.stringify(waiting.map((c) => c.text))}`
    );
    assert(
      waiting.some((c) => c.text === preRunLine()),
      'the pre-run shared-course line should stay'
    );
    assert(
      !running.some((c) => c.text === HINT || c.text.includes('TODAY')),
      `RUNNING HUD must stay score-only, got: ${JSON.stringify(running.map((c) => c.text))}`
    );
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
    assert(
      daily.includes('New today best'),
      `A Daily death that beats today best should announce the celebration, got: ${daily}`
    );
    assert(
      !classic.includes(HINT),
      `Classic death must not mention the Daily hint, got: ${classic}`
    );
    assert(
      classic.includes('High score'),
      `Classic death should keep the high-score line, got: ${classic}`
    );
  });
});

describe('Daily new today best celebration', () => {
  const HINT = 'Share TODAY BEST with Copy result';
  const CELEBRATION = '★  NEW TODAY BEST  ★';

  function captureFillText(draw) {
    const calls = [];
    const origFill = ctx.fillText;
    ctx.fillText = (text, x, y) =>
      calls.push({
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
    stubElementStyle(shareBtn, { display: 'none' });
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
    restoreElementStyle(shareBtn, orig.btnStyle);
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
    assertEquals(
      flags.previousDailyBest,
      25,
      'previous today best is the value before this death saved'
    );
    assertEquals(flags.dailyBest, 80, 'today best should update to this run');
    assertEquals(
      flags.isNewBest,
      false,
      'an all-time miss should not flip the free-play new-best flag'
    );
    assert(title, `celebration title missing, got: ${JSON.stringify(calls.map((c) => c.text))}`);
    assertEquals(
      title.y,
      GAME_CONFIG.CANVAS_H / 2 - 36,
      'celebration title should sit where NEW BEST sits'
    );
    assert(score, 'the run score should be the big number on the celebration');
    assert(
      String(score.font).includes('42px'),
      `celebration score should use the big NEW BEST size, got: ${score.font}`
    );
    assertEquals(score.x, GAME_CONFIG.CANVAS_W / 2, 'celebration score should be centered');
    assert(
      calls.some((c) => c.text === '+55 over your previous best'),
      `improvement over the prior today best should show, got: ${JSON.stringify(calls.map((c) => c.text))}`
    );
    assert(
      !calls.some((c) => c.text === 'THIS RUN'),
      'celebration should replace the comparison pair'
    );
    assert(
      !calls.some((c) => c.text === 'TODAY BEST'),
      'celebration should replace the TODAY BEST column'
    );
    assert(
      calls.some((c) => c.text.indexOf('DAILY #') !== -1),
      'the daily number should stay on the death screen'
    );
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
    assert(
      calls.some((c) => c.text === CELEBRATION),
      'first today best should use the celebration'
    );
    assert(
      !calls.some((c) => c.text.includes('over your previous best')),
      'no prior today best means no improvement line'
    );
    assert(
      !calls.some((c) => c.text === 'THIS RUN'),
      'first today best should not fall back to the comparison'
    );
    assert(
      calls.some((c) => c.text === HINT),
      'the hint still arrives with the settled screen'
    );
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
    assert(
      calls.some((c) => c.text === 'THIS RUN'),
      'a miss should keep THIS RUN'
    );
    assert(
      calls.some((c) => c.text === 'TODAY BEST'),
      'a miss should keep TODAY BEST'
    );
    assert(
      calls.some((c) => c.text === '00040'),
      'a miss should show this run'
    );
    assert(
      calls.some((c) => c.text === '00500'),
      'a miss should show the stored today best'
    );
    assert(
      calls.some((c) => c.text === '← +460 →'),
      'a miss should keep the gap to today best'
    );
    assert(!calls.some((c) => c.text === CELEBRATION), 'a miss should not celebrate');
    assert(
      calls.some((c) => c.text === HINT),
      'the hint should still follow a miss'
    );
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
    assert(
      calls.some((c) => c.text === 'THIS RUN'),
      'a tie should keep the comparison'
    );
    assert(
      calls.some((c) => c.text === '← best →'),
      'a tie should keep the even-best marker'
    );
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
    assert(
      calls.some((c) => c.text === 'TODAY BEST'),
      'Daily Game Over should stay on the comparison'
    );
    assert(
      !calls.some((c) => c.text === '★  NEW BEST  ★'),
      'Daily Game Over should not use the free-play celebration'
    );
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
    stubElementStyle(shareBtn, { display: 'block' });
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
    restoreElementStyle(shareBtn, orig.btnStyle);
    shareBtn.textContent = orig.btnText;

    assert(
      early.some((c) => c.text === CELEBRATION),
      'the title is up while the score counts'
    );
    assert(
      early.some((c) => c.text === '00000'),
      'the score should start at zero during the count-up'
    );
    assert(!early.some((c) => c.text === HINT), 'the hint should wait for the count-up');
    assertEquals(earlyButton, 'none', 'Copy result should wait for the count-up');
    assert(
      settled.some((c) => c.text === '00080'),
      'the settled celebration should show the full score'
    );
    assert(
      settled.some((c) => c.text === HINT),
      'the hint should appear with the full score'
    );
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
      stubElementStyle(shareBtn, { display: 'none' });
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
    restoreElementStyle(shareBtn, orig.btnStyle);

    assert(
      classic.some((c) => c.text === 'YOUR BEST'),
      'Classic should keep the free-play comparison'
    );
    assert(
      classic.some((c) => c.text === 'Tap / Press Space to Restart'),
      'Classic should keep its restart line'
    );
    assert(
      !classic.some((c) => c.text === CELEBRATION),
      'Classic should not show the today-best celebration'
    );
    assert(!classic.some((c) => c.text === HINT), 'Classic should not show the Daily hint');
    assertEquals(classicButton, 'none', 'Classic should not reveal Copy result');
    assert(
      updated.some((c) => c.text === '★  NEW BEST  ★'),
      'Updated should keep the free-play celebration'
    );
    assert(
      !updated.some((c) => c.text === CELEBRATION),
      'Updated should not show the today-best celebration'
    );
    assert(!updated.some((c) => c.text === HINT), 'Updated should not show the Daily hint');
    assertEquals(updatedButton, 'none', 'Updated should not reveal Copy result');
    assertEquals(
      classicDeath.flags.isNewTodayBest,
      false,
      'a Classic death should not flag a today-best celebration'
    );
    assert(
      classicDeath.heard.includes('High score'),
      `Classic death should keep the high-score line, got: ${classicDeath.heard}`
    );
    assert(
      !classicDeath.heard.includes('New today best'),
      'Classic death should not announce a today best'
    );
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
      add(name) {
        names.add(name);
      },
      remove(name) {
        names.delete(name);
      },
      contains(name) {
        return names.has(name);
      },
    };
    return el.classList;
  }

  it('the Copied confirmation is about half the old 90-frame flash', () => {
    assertEquals(GAME_CONFIG.COPY_FLASH_FRAMES, 45, 'copy flash should be 45 frames, about 0.75s');
    assert(
      GAME_CONFIG.COPY_FLASH_FRAMES < 90,
      'the confirmation should be shorter than the old 1.5s flash'
    );
    assertEquals(
      copyFlashDuration(),
      GAME_CONFIG.COPY_FLASH_FRAMES,
      'the handler duration should read the named config'
    );
  });

  it('a tune outside 1..90 frames falls back to the quiet length', () => {
    withTuning({ COPY_FLASH_FRAMES: 30 }, () => {
      assertEquals(copyFlashDuration(), 30, 'a readable tune should apply');
    });
    withTuning({ COPY_FLASH_FRAMES: 0 }, () => {
      assertEquals(
        copyFlashDuration(),
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'zero would flicker, so it falls back'
      );
    });
    withTuning({ COPY_FLASH_FRAMES: 200 }, () => {
      assertEquals(
        copyFlashDuration(),
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'a longer tune would nag past the old flash'
      );
    });
    withTuning({}, () => {
      assertEquals(
        copyFlashDuration(),
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'no tune keeps the quiet default'
      );
    });
  });

  it('starts the shorter Copied flash before the clipboard write', () => {
    const shareBtn = document.getElementById('share-btn');
    const handler =
      shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    assert(typeof handler === 'function', 'share button must register a click handler');
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origClass = shareBtn.classList;
    const classes = installClassList(shareBtn);
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = false;
    let flashAtWrite = -1;
    let labelAtWrite = '';
    Object.defineProperty(testGlobal, 'navigator', {
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
      assertEquals(
        flashAtWrite,
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'the flash counter is set before writeText'
      );
      assertEquals(labelAtWrite, '✓ Copied!', 'the Copied label is set before writeText');
      assertEquals(
        Animations.copyFlashFrames,
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'the live counter stays on the quiet length'
      );
      assert(classes.contains('is-copied'), 'the Copied state uses the calmer button class');
      assert(!classes.contains('is-qa-damped'), 'a real tap is not the reduced-motion QA hold');
    } finally {
      if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      if (origClass === undefined) delete shareBtn.classList;
      else shareBtn.classList = origClass;
    }
  });
});

describe('Daily native share sheet', () => {
  function shareHandler() {
    const shareBtn = document.getElementById('share-btn');
    const handler =
      shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    assert(typeof handler === 'function', 'share button must register a click handler');
    return handler;
  }

  function installClassList(el) {
    const names = new Set();
    el.classList = {
      add(name) {
        names.add(name);
      },
      remove(name) {
        names.delete(name);
      },
      contains(name) {
        return names.has(name);
      },
    };
    return el.classList;
  }

  function withNavigator(value, run) {
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    Object.defineProperty(testGlobal, 'navigator', {
      configurable: true,
      writable: true,
      value,
    });
    const restore = () => {
      if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
    };
    let result;
    try {
      result = run();
    } catch (err) {
      restore();
      throw err;
    }
    if (result && typeof result.then === 'function') {
      return result.then(
        (out) => {
          restore();
          return out;
        },
        (err) => {
          restore();
          throw err;
        }
      );
    }
    restore();
    return result;
  }

  function namedError(name, message) {
    const err = new Error(message);
    err.name = name;
    return err;
  }

  // Settle inside the tap. The harness runs the next test before a real
  // promise's callback, which would let a later test overwrite this one.
  function settle(run) {
    return {
      then(onOk, onErr) {
        try {
          const out = run(onOk, onErr);
          return out && typeof out.then === 'function' ? out : settle(() => out);
        } catch (err) {
          if (typeof onErr === 'function') return settle(() => onErr(err));
          return shareRejected(err);
        }
      },
      catch(onErr) {
        return this.then(undefined, onErr);
      },
    };
  }

  function shareResolved() {
    return settle((onOk) => (typeof onOk === 'function' ? onOk() : undefined));
  }

  function shareRejected(err) {
    return settle((onOk, onErr) => {
      if (typeof onErr === 'function') return onErr(err);
      throw err;
    });
  }

  it('shareDailyResult() still returns the text and does not open a sheet', () => {
    const origBest = game.dailyBest;
    game.dailyBest = 500;
    let shared = 0;
    let wrote = 0;
    try {
      withNavigator(
        {
          share() {
            shared++;
            return Promise.resolve();
          },
          clipboard: {
            writeText() {
              wrote++;
              return Promise.resolve();
            },
          },
        },
        () => {
          const text = shareDailyResult();
          assertEquals(text, dailyShareText(), 'the share string stays the existing Daily text');
          assert(text.includes('Rex Daily #' + dailyNumber()), 'the header stays in the text');
          assert(text.includes('Score: 500'), 'the daily best stays in the text');
          assert(
            text.includes('https://snehiths19.github.io/chrome-offline-Rex/'),
            'the url stays inside the text'
          );
          assertEquals(shared, 0, 'building the text must not open the share sheet');
          assertEquals(wrote, 0, 'a capable share environment must not also copy');
        }
      );
    } finally {
      game.dailyBest = origBest;
    }
  });

  it('canShare false keeps the clipboard fallback and the Copied flash', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origBest = game.dailyBest;
    game.dailyBest = 42;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let shared = 0;
    let wrote = null;
    let flashAtWrite = -1;
    try {
      withNavigator(
        {
          share() {
            shared++;
            return Promise.resolve();
          },
          canShare() {
            return false;
          },
          clipboard: {
            writeText(text) {
              wrote = text;
              flashAtWrite = Animations.copyFlashFrames;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assertEquals(shared, 0, 'no sheet means share() is not called');
          assertEquals(wrote, dailyShareText(), 'the clipboard still gets the Daily text');
          assertEquals(
            flashAtWrite,
            GAME_CONFIG.COPY_FLASH_FRAMES,
            'the flash starts before the clipboard write'
          );
          assertEquals(shareBtn.textContent, '✓ Copied!', 'the button still confirms');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      game.dailyBest = origBest;
    }
  });

  it('shareDailyResult() still copies when the share sheet is unavailable', () => {
    const origBest = game.dailyBest;
    game.dailyBest = 80;
    let wrote = null;
    try {
      withNavigator(
        {
          clipboard: {
            writeText(text) {
              wrote = text;
              return Promise.resolve();
            },
          },
        },
        () => {
          const text = shareDailyResult();
          assertEquals(wrote, text, 'the clipboard fallback still writes the same text');
        }
      );
    } finally {
      game.dailyBest = origBest;
    }
  });

  it('a successful share sheet flashes Copied and does not copy', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origBest = game.dailyBest;
    const classes = installClassList(shareBtn);
    game.dailyBest = 500;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let payload = null;
    let wrote = false;
    try {
      withNavigator(
        {
          share(data) {
            payload = data;
            assertEquals(Animations.copyFlashFrames, 0, 'Copied waits until the sheet succeeds');
            assertEquals(shareBtn.textContent, '📋 Copy result', 'the label waits with the flash');
            return shareResolved();
          },
          clipboard: {
            writeText() {
              wrote = true;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assertEquals(
            payload.text,
            dailyShareText(),
            'the sheet receives the existing Daily text'
          );
          assertEquals(
            Object.keys(payload).join(','),
            'text',
            'title and url stay inside the text so the sheet does not repeat them'
          );
          assert(!wrote, 'a successful share must not also write the clipboard');
          assertEquals(
            Animations.copyFlashFrames,
            GAME_CONFIG.COPY_FLASH_FRAMES,
            'a successful share starts the same Copied flash'
          );
          assertEquals(shareBtn.textContent, '✓ Copied!', 'the button confirms the share');
          assert(classes.contains('is-copied'), 'the confirmation uses the calmer Copied paint');
          assert(
            !classes.contains('is-qa-damped'),
            'a real share is not the reduced-motion QA hold'
          );
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      game.dailyBest = origBest;
    }
  });

  it('dismissing the share sheet does not flash and does not copy', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = false;
    try {
      withNavigator(
        {
          share() {
            return shareRejected(namedError('AbortError', 'dismissed'));
          },
          clipboard: {
            writeText() {
              wrote = true;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assert(!wrote, 'dismissing the sheet must not copy');
          assertEquals(Animations.copyFlashFrames, 0, 'dismissing the sheet must not flash Copied');
          assertEquals(shareBtn.textContent, '📋 Copy result', 'the label stays Copy result');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
    }
  });

  it('a share sheet that is already open does not flash and does not copy', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = false;
    try {
      withNavigator(
        {
          share() {
            return shareRejected(namedError('InvalidStateError', 'already sharing'));
          },
          clipboard: {
            writeText() {
              wrote = true;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assert(!wrote, 'a second tap must not copy while the sheet is open');
          assertEquals(Animations.copyFlashFrames, 0, 'a second tap must not flash Copied');
          assertEquals(shareBtn.textContent, '📋 Copy result', 'the label stays Copy result');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
    }
  });

  it('any other share rejection falls back to the clipboard and flashes', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origBest = game.dailyBest;
    game.dailyBest = 42;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = null;
    let flashAtWrite = -1;
    try {
      withNavigator(
        {
          share() {
            return shareRejected(namedError('NotAllowedError', 'blocked'));
          },
          clipboard: {
            writeText(text) {
              wrote = text;
              flashAtWrite = Animations.copyFlashFrames;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assertEquals(wrote, dailyShareText(), 'the fallback writes the existing Daily text');
          assertEquals(
            flashAtWrite,
            GAME_CONFIG.COPY_FLASH_FRAMES,
            'the flash starts before the clipboard write'
          );
          assertEquals(shareBtn.textContent, '✓ Copied!', 'the fallback still confirms');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      game.dailyBest = origBest;
    }
  });

  it('a sync throw from navigator.share falls back to the clipboard and flashes', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const origBest = game.dailyBest;
    game.dailyBest = 42;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = null;
    let flashAtWrite = -1;
    try {
      withNavigator(
        {
          share() {
            throw new Error('share unavailable');
          },
          clipboard: {
            writeText(text) {
              wrote = text;
              flashAtWrite = Animations.copyFlashFrames;
              return Promise.resolve();
            },
          },
        },
        () => {
          let threw = false;
          try {
            shareHandler()({ stopPropagation() {} });
          } catch {
            threw = true;
          }
          assert(!threw, 'a blocked share sheet must not abort the tap');
          assertEquals(wrote, dailyShareText(), 'the fallback writes the existing Daily text');
          assertEquals(
            flashAtWrite,
            GAME_CONFIG.COPY_FLASH_FRAMES,
            'the flash starts before the clipboard write'
          );
          assertEquals(shareBtn.textContent, '✓ Copied!', 'the fallback still confirms');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
      game.dailyBest = origBest;
    }
  });

  it('a share call that does not return a promise falls back to the clipboard', () => {
    const shareBtn = document.getElementById('share-btn');
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    let wrote = false;
    try {
      withNavigator(
        {
          share() {
            return undefined;
          },
          clipboard: {
            writeText() {
              wrote = true;
              return Promise.resolve();
            },
          },
        },
        () => {
          shareHandler()({ stopPropagation() {} });
          assert(wrote, 'a share API that does not return a promise uses the clipboard');
          assert(Animations.copyFlashFrames > 0, 'that fallback still flashes Copied');
        }
      );
    } finally {
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
    }
  });
});

describe('One shared course: the course is laid out on the road', () => {
  // Play a Daily run on a fixed seed with a simple autopilot, dashing in
  // every flight when `dash` is set. Returns each obstacle's type, its spot
  // on the road and its width.
  function courseOf(dash, seed) {
    replayRunSeed(seed);
    cancelAnimationFrame(game.animationFrameId);
    game.mode = MODES.DAILY;
    game.state = STATE.IDLE;
    resetGame();
    const step = () => {
      gameLoop();
      cancelAnimationFrame(game.animationFrameId);
    };
    let guard = 0;
    while (game.state !== STATE.RUNNING && guard++ < 1000) step();
    const seen = new Set();
    const course = [];
    while (game.state === STATE.RUNNING && game.animFrame < 2500) {
      const ahead = game.obstacles
        .filter((o) => o.render !== 'ramp' && o.type !== 'leapGap' && o.x + o.width > dino.x)
        .sort((a, b) => a.x - b.x)[0];
      if (ahead && !dino.isJumping && ahead.x - (dino.x + dino.width) < game.currentSpeed * 8) {
        handleAction();
      }
      if (dash && dino.isJumping && !dino.dashed && dino.velocityY > -1) dashDino();
      step();
      for (const o of game.obstacles) {
        if (seen.has(o)) continue;
        seen.add(o);
        course.push(o.type + '@' + Math.round((game.roadX + o.x) * 1000) / 1000 + 'w' + o.width);
      }
    }
    return course;
  }

  it('dashing in every flight meets exactly the same course', () => {
    const origMode = game.mode;
    try {
      for (const seed of [20261127, 20261101]) {
        const plain = courseOf(false, seed);
        const dashing = courseOf(true, seed);
        const n = Math.min(plain.length, dashing.length);
        assert(n >= 15, 'both runs met plenty of obstacles (' + n + ')');
        assertEquals(dashing.slice(0, n).join(' '), plain.slice(0, n).join(' '), 'seed ' + seed);
      }
    } finally {
      game.mode = origMode;
      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('with no boost, the course score is the score', () => {
    let score = 0;
    let road = 0;
    for (let i = 0; i < 3000; i++) {
      score += GAME_CONFIG.SCORE_INCREMENT;
      road += DifficultyProfile.speedAtScore(score);
      if (i % 250 === 0) assertEquals(roadScoreAt(road), score, 'frame ' + i);
    }
    assertEquals(roadScoreAt(0), 0);
  });
});

describe('Daily streak (preview)', () => {
  function withStreakStorage(fn) {
    const keys = ['dino-daily-streak', 'dino-daily-streak-day'];
    const saved = keys.map((k) => localStorage.getItem(k));
    try {
      keys.forEach((k) => localStorage.removeItem(k));
      fn();
    } finally {
      keys.forEach((k, i) =>
        saved[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[i])
      );
    }
  }

  it('starts at 1, counts consecutive UTC days, and counts a day once', () => {
    withStreakStorage(() => {
      assertEquals(ScoreStore.loadDailyStreak(100), 0);
      assertEquals(ScoreStore.recordDailyRun(100), 1);
      assertEquals(ScoreStore.recordDailyRun(100), 1, 'second run the same day');
      assertEquals(ScoreStore.recordDailyRun(101), 2);
      assertEquals(ScoreStore.recordDailyRun(102), 3);
      assertEquals(ScoreStore.loadDailyStreak(103), 3, 'still alive the next day');
    });
  });

  it('resets to 1 after a missed day', () => {
    withStreakStorage(() => {
      ScoreStore.recordDailyRun(100);
      ScoreStore.recordDailyRun(101);
      assertEquals(ScoreStore.loadDailyStreak(103), 0, 'a whole day missed');
      assertEquals(ScoreStore.recordDailyRun(103), 1);
    });
  });

  it('shows on the Game Over title and in the share text from two days', () => {
    const orig = game.dailyStreak;
    const origBest = game.dailyBest;
    game.dailyBest = 321;
    game.dailyStreak = 1;
    assert(!dailyGameOverTitle().includes('IN A ROW'), 'one day is not a streak');
    assert(!dailyShareText().includes('Streak'), 'no streak line for one day');
    game.dailyStreak = 4;
    assert(dailyGameOverTitle().includes('4 DAYS IN A ROW'), dailyGameOverTitle());
    assert(dailyShareText().includes('Streak: 4 days'), dailyShareText());
    game.dailyStreak = orig;
    game.dailyBest = origBest;
  });
});
