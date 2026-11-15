// Unit tests: qa. Playtest and debug tools: the ?qa…=1 switchboard flags and the death log.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('qa');

function qaSafeClassList() {
  const names = new Set();
  return {
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
}

describe('QA safe shell (?qaSafe=1)', () => {
  it('?qaSafe=1 is off for any value other than 1', () => {
    assert(readQaFlag('safe', '?qaSafe=1') === true, '?qaSafe=1 should paint the stand-in insets');
    assert(
      readQaFlag('safe', '?qaNight=1&qaSafe=1') === true,
      'the flag should work beside other params'
    );
    assert(readQaFlag('safe', '?qaSafe=1&qaCopy=1') === true, 'param order should not matter');
    assert(readQaFlag('safe', '?qaSafe=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('safe', '?qaSafe=12') === false, 'qaSafe=12 must not count as the flag');
    assert(readQaFlag('safe', '') === false, 'an empty query leaves the flag off');
    assert(readQaFlag('safe') === false, 'a normal visit leaves the flag off');
  });

  it('applyQaSafeShell toggles the document class and does not touch the run', () => {
    const root = { classList: qaSafeClassList() };
    const origScore = game.score;
    const origMode = game.mode;
    const origRng = game.rng;
    const restoreRoot = overrideDocumentProp('documentElement', root);
    try {
      setQaFlag('safe', false);
      applyQaSafeShell();
      assert(root.classList.contains('qa-safe') === false, 'off leaves the shell unmarked');
      setQaFlag('safe', true);
      applyQaSafeShell();
      assert(
        root.classList.contains('qa-safe') === true,
        'on marks the shell for the stand-in insets'
      );
      assertEquals(game.score, origScore, 'the flag must not change the score');
      assertEquals(game.mode, origMode, 'the flag must not change the mode');
      assert(game.rng === origRng, 'the flag must not reseed the run');
      setQaFlag('safe', false);
      applyQaSafeShell();
      assert(root.classList.contains('qa-safe') === false, 'turning the flag off removes the mark');
    } finally {
      restoreRoot();
      setQaFlag('safe', false);
    }
  });

  it('applyQaSafeShell is a no-op without a document root', () => {
    const restoreRoot = overrideDocumentProp('documentElement', undefined);
    let threw = false;
    try {
      setQaFlag('safe', true);
      applyQaSafeShell();
    } catch {
      threw = true;
    }
    restoreRoot();
    setQaFlag('safe', false);
    assert(!threw, 'missing documentElement should not throw');
  });

  it('resetGame re-reads ?qaSafe=1 onto the document', () => {
    const root = { classList: qaSafeClassList() };
    const restorePageQuery = savePageQuery();
    const origMode = game.mode;
    const restoreRoot = overrideDocumentProp('documentElement', root);
    try {
      setPageQuery('');
      setQaFlag('safe', true);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assert(
        root.classList.contains('qa-safe') === false,
        'a visit without the flag clears the mark'
      );

      setPageQuery('?qaSafe=1');
      setQaFlag('safe', false);
      game.mode = MODES.CLASSIC;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assert(root.classList.contains('qa-safe') === true, 'resetGame applies the re-read flag');
      assertEquals(game.mode, MODES.CLASSIC, 're-reading the flag must not change the mode');
    } finally {
      restorePageQuery();
      restoreRoot();
      setQaFlag('safe', false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
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
    orig.restorePageQuery();
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
      restorePageQuery: savePageQuery(),
    };
  }

  function silenceClipboard() {
    const copies = [];
    // Node's test harness has no DOM. CI (Node 20) has no navigator at all;
    // newer Node exposes a getter-only navigator, which must not be replaced.
    const hadNavigator = typeof testGlobal.navigator !== 'undefined';
    if (!hadNavigator) testGlobal.navigator = {};
    const nav = testGlobal.navigator;
    // A browser's navigator.clipboard is a getter, so shadow it on the
    // instance; deleting that own property brings the real one back.
    const prev = Object.getOwnPropertyDescriptor(nav, 'clipboard');
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText(text) {
          copies.push(text);
          return Promise.resolve();
        },
      },
    });
    copies.restore = () => {
      if (!hadNavigator) {
        delete testGlobal.navigator;
        return;
      }
      delete nav.clipboard;
      if (prev) Object.defineProperty(nav, 'clipboard', prev);
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
      setPageQuery('?debug=1');
      applyDebugFromLocation();
      assertEquals(isDeathLogEnabled(), true, '?debug=1 turns the death log on');
      assert(typeof window.enableDeathLog === 'function', 'DevTools hook is on window');
      assert(typeof window.dumpRun === 'function', 'dumpRun is on window');
      assert(typeof window.copyDeathLog === 'function', 'copyDeathLog is on window');
      assert(typeof window.replayRunSeed === 'function', 'replayRunSeed is on window');

      disableDeathLog();
      setPageQuery('');
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

describe('QA cluster flag (?qaCluster=1)', () => {
  const cluster = () => GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'cluster');

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  // One running frame from a known seed. resetGame re-reads the query, so the
  // flag is applied after that. The first frame is early enough that production
  // rules would still only roll a small cactus.
  function runFirstSpawn(mode, { flag, search } = {}) {
    const restorePageQuery = savePageQuery();
    if (search !== undefined) setPageQuery(search);
    game.mode = mode;
    game.seedOverride = 99;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    if (flag !== undefined) setQaFlag('cluster', flag);
    game.state = STATE.RUNNING;
    game.obstacles.length = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    tick();
    const spawned = game.obstacles.map((o) => o.type);
    const gap = game.nextSpawnGap;
    const score = game.score;
    return {
      spawned,
      gap,
      score,
      restore() {
        if (search !== undefined) {
          restorePageQuery();
        }
      },
    };
  }

  it('recognizes only ?qaCluster=1', () => {
    assert(
      readQaFlag('cluster', '?qaCluster=1') === true,
      '?qaCluster=1 should enable the early cluster'
    );
    assert(
      readQaFlag('cluster', '?foo=1&qaCluster=1') === true,
      'the flag should work alongside other params'
    );
    assert(
      readQaFlag('cluster', '?qaPlateau=1') === false,
      'the plateau flag must not enable the cluster'
    );
    assert(readQaFlag('cluster', '') === false, 'a normal visit should leave the flag off');
    assert(readQaFlag('cluster', '?qaCluster=0') === false, 'only the value 1 enables the flag');
    assert(
      readQaFlag('cluster', '?qaCluster=12') === false,
      'qaCluster=12 must not count as the flag'
    );
    assert(
      readQaFlag('cluster', '?other=1') === false,
      'an unrelated param must not enable the flag'
    );
  });

  it('with ?qaCluster=1 the first Updated obstacle is a cluster while unlock stays 250', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { flag: true });
    try {
      assertEquals(cluster().unlockScore, 250, 'production unlock stays 250');
      assertEquals(cluster().weight, 20, 'production weight stays 20');
      assertEquals(cluster().width, 50, 'production hitbox stays 50');
      assert(
        run.score < 50,
        `the early cluster should appear near the start, score was ${run.score}`
      );
      assertEquals(run.spawned[0], 'cluster', 'the first Updated obstacle should be the cluster');
      assertEquals(game.obstacles[0].width, 50, 'the early cluster keeps the real hitbox');
      assertEquals(
        game.obstacles[0].render,
        'double',
        'the early cluster uses the two-cactus draw'
      );
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
      setQaFlag('cluster', false);
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
      setQaFlag('cluster', false);
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
      setQaFlag('cluster', false);
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
      setQaFlag('cluster', false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCluster=1 from the page query', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { search: '?qaCluster=1' });
    try {
      assertEquals(
        run.spawned[0],
        'cluster',
        'resetGame should arm the early cluster from location.search'
      );
      assertEquals(
        game.qaClusterShown,
        true,
        'the re-read flag should still latch after one cluster'
      );
    } finally {
      run.restore();
      setQaFlag('cluster', false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA big cactus flag (?qaBig=1)', () => {
  const big = () => GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');

  function tick() {
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
  }

  // One running frame from a known seed. resetGame re-reads the query, so the
  // flag is applied after that. The first frame is early enough that production
  // rules would still only roll a small cactus.
  function runFirstSpawn(mode, { flag, search } = {}) {
    const restorePageQuery = savePageQuery();
    if (search !== undefined) setPageQuery(search);
    game.mode = mode;
    game.seedOverride = 99;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    if (flag !== undefined) setQaFlag('big', flag);
    game.state = STATE.RUNNING;
    game.obstacles.length = 0;
    dino.y = GAME_CONFIG.CANVAS_H - dino.height;
    dino.isJumping = false;
    dino.velocityY = 0;
    tick();
    const spawned = game.obstacles.map((o) => o.type);
    const gap = game.nextSpawnGap;
    const score = game.score;
    return {
      spawned,
      gap,
      score,
      restore() {
        if (search !== undefined) {
          restorePageQuery();
        }
      },
    };
  }

  it('recognizes only ?qaBig=1', () => {
    assert(readQaFlag('big', '?qaBig=1') === true, '?qaBig=1 should enable the early big cactus');
    assert(
      readQaFlag('big', '?foo=1&qaBig=1') === true,
      'the flag should work alongside other params'
    );
    assert(
      readQaFlag('big', '?qaCluster=1') === false,
      'the cluster flag must not enable the big cactus'
    );
    assert(
      readQaFlag('big', '?qaPlateau=1') === false,
      'the plateau flag must not enable the big cactus'
    );
    assert(readQaFlag('big', '') === false, 'a normal visit should leave the flag off');
    assert(readQaFlag('big', '?qaBig=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('big', '?qaBig=12') === false, 'qaBig=12 must not count as the flag');
    assert(readQaFlag('big', '?other=1') === false, 'an unrelated param must not enable the flag');
  });

  it('with ?qaBig=1 the first Updated obstacle is a big cactus while unlock stays 100', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { flag: true });
    try {
      assertEquals(big().unlockScore, 100, 'production unlock stays 100');
      assertEquals(big().weight, 30, 'production weight stays 30');
      assertEquals(big().width, 30, 'production hitbox width stays 30');
      assertEquals(big().height, 55, 'production hitbox height stays 55');
      assert(
        run.score < 50,
        `the early big cactus should appear near the start, score was ${run.score}`
      );
      assertEquals(run.spawned[0], 'big', 'the first Updated obstacle should be the big cactus');
      assertEquals(game.obstacles[0].width, 30, 'the early big cactus keeps the real hitbox width');
      assertEquals(
        game.obstacles[0].height,
        55,
        'the early big cactus keeps the real hitbox height'
      );
      assertEquals(
        game.obstacles[0].render,
        'single',
        'the early big cactus stays a single sprite'
      );
      assertEquals(game.qaBigShown, true, 'the override is spent after one obstacle');

      game.obstacles.length = 0;
      game.lastObstacleX = -300;
      tick();
      assertEquals(game.obstacles.length, 1, 'a second obstacle should spawn on the next frame');
      assertEquals(game.obstacles[0].type, 'small', 'later obstacles follow the normal unlock');
      assertEquals(game.qaBigShown, true, 'the second spawn must not re-arm the QA big cactus');
    } finally {
      run.restore();
      setQaFlag('big', false);
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
      setQaFlag('big', false);
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
      setQaFlag('big', false);
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
      setQaFlag('big', false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaBig=1 from the page query', () => {
    const origMode = game.mode;
    const run = runFirstSpawn(MODES.UPDATED, { search: '?qaBig=1' });
    try {
      assertEquals(
        run.spawned[0],
        'big',
        'resetGame should arm the early big cactus from location.search'
      );
      assertEquals(
        game.qaBigShown,
        true,
        'the re-read flag should still latch after one big cactus'
      );
    } finally {
      run.restore();
      setQaFlag('big', false);
      game.mode = origMode;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    assert(
      readQaFlag('night', '?qaNight=1') === true,
      '?qaNight=1 should enable the early night sky'
    );
    assert(
      readQaFlag('night', '?foo=1&qaNight=1') === true,
      'the flag should work alongside other params'
    );
    assert(
      readQaFlag('night', '') === false,
      'a normal visit should leave the night fade on the real score'
    );
    assert(readQaFlag('night', '?qaNight=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('night', '?qaNight=12') === false, 'qaNight=12 must not count as the flag');
    assert(
      readQaFlag('night', '?qaPlateau=1') === false,
      'another QA flag must not start the night fade'
    );
  });

  it('with ?qaNight=1 stars start fading on the first running frame, speed unchanged', () => {
    try {
      setReducedMotion(false);
      armFreshRun();
      setQaFlag('night', true);
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
      setQaFlag('night', false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('without the flag a new run keeps the day sky and no stars', () => {
    try {
      setQaFlag('night', false);
      armFreshRun();
      tick();
      assert(!game.starsInitialised, 'stars still wait for score 400');
      assertEquals(game.starFadeFrames, 0);
      assertEquals(getBackgroundColor(0), '#ffffff', 'a normal visit stays on the day sky');
    } finally {
      setQaFlag('night', false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion still skips star init when ?qaNight=1', () => {
    try {
      armFreshRun();
      setQaFlag('night', true);
      setReducedMotion(true);
      tick();
      assert(!game.starsInitialised, 'reduced motion still does not initialise stars');
      assertEquals(game.stars.length, 0);
      assertEquals(game.starFadeFrames, 0);
      assertEquals(getBackgroundColor(0), '#1a1a2e', 'the QA sky can still go night without stars');
    } finally {
      setQaFlag('night', false);
      setReducedMotion(false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaNight=1 from the page query', () => {
    const restorePageQuery = savePageQuery();
    setPageQuery('?qaNight=1');
    try {
      setQaFlag('night', false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      tick();
      assert(
        game.starsInitialised,
        'resetGame should arm the early star fade from location.search'
      );
      assert(game.score < 1, 're-reading the flag must not change the score');
    } finally {
      restorePageQuery();
      setQaFlag('night', false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
      get() {
        return captured;
      },
      set(v) {
        captured = v;
        fillStyles.push(v);
      },
    });
    try {
      fn();
    } finally {
      delete ctx.fillStyle;
    }
    return fillStyles.filter((s) => typeof s === 'string' && s.indexOf('rgba(255, 215, 0') === 0);
  }

  it('recognizes only ?qaLevel=1', () => {
    assert(
      readQaFlag('level', '?qaLevel=1') === true,
      '?qaLevel=1 should enable the early level wash'
    );
    assert(
      readQaFlag('level', '?qaNight=1&qaLevel=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('level', '?qaLevel=1&qaNight=1') === true, 'param order should not matter');
    assert(
      readQaFlag('level', '') === false,
      'a normal visit should leave the wash on the real level'
    );
    assert(readQaFlag('level', '?qaLevel=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('level', '?qaLevel=12') === false, 'qaLevel=12 must not count as the flag');
    assert(readQaFlag('level', '?qaNight=1') === false, 'night alone must not fire the early wash');
  });

  it('fires the Updated wash once at the start without moving score, speed, or the seed', () => {
    const origMode = game.mode;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      game.rng = mulberry32(7);
      setQaFlag('level', false);
      tick();
      const rngAfterOff = game.rng();
      const speedOff = game.currentSpeed;
      assertEquals(Animations.milestoneFrames, 0, 'flag off keeps the wash on the real level');
      assertEquals(game.qaLevelShown, false, 'flag off does not spend the early latch');

      armFreshRun();
      game.mode = MODES.UPDATED;
      game.rng = mulberry32(7);
      setQaFlag('level', true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 1, 'the first running frame paints one gold wash');
      assert(
        gold[0].indexOf(GAME_CONFIG.SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'qaLevel alone keeps the familiar day wash'
      );
      assertEquals(
        game.milestoneText,
        'LEVEL 2',
        'the early flash uses the first real level label'
      );
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'the wash starts a full milestone (it counts down from the next slice)'
      );
      assertEquals(
        game.score,
        GAME_CONFIG.SCORE_INCREMENT,
        'the early flash must not jump the score'
      );
      assert(
        Math.abs(game.currentSpeed - DifficultyProfile.speedAtScore(game.score)) < 1e-6,
        'speed still follows the real score'
      );
      assertEquals(
        game.currentSpeed,
        speedOff,
        'the flag does not change speed versus a normal first frame'
      );
      assertEquals(game.rng(), rngAfterOff, 'the early flash does not consume the run seed');
      assertEquals(game.qaLevelShown, true, 'the early flash is once per run');
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.SKY_TINT_PEAK_ALPHA,
        'day score with qaLevel stays on the day peak'
      );

      tick();
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES - 1,
        'the next frame continues the same wash instead of restarting it'
      );
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT * 2, 'scoring keeps its normal step');

      game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05;
      tick();
      assertEquals(game.milestoneText, 'LEVEL 2', 'a real level-up still flashes with the flag on');
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'crossing 100 still starts a full wash'
      );
      assert(game.score >= GAME_CONFIG.SCORE_PER_LEVEL, 'the real level still arrives by score');
    } finally {
      game.mode = origMode;
      setQaFlag('level', false);
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Daily shares the early wash; Classic never paints the tint', () => {
    const origMode = game.mode;
    try {
      setQaFlag('night', false);
      setReducedMotion(false);
      armFreshRun();
      game.mode = MODES.DAILY;
      setQaFlag('level', true);
      tick();
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'Daily shares the Updated early wash'
      );
      assertEquals(
        game.score,
        GAME_CONFIG.SCORE_INCREMENT,
        'Daily early wash must not jump the score'
      );

      armFreshRun();
      game.mode = MODES.CLASSIC;
      setQaFlag('level', true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 0, 'Classic never paints the gold wash');
      assertEquals(Animations.milestoneFrames, 0, 'Classic does not take the early flash');
      assertEquals(game.qaLevelShown, false, 'Classic does not spend the Updated latch');
      assertEquals(
        game.score,
        GAME_CONFIG.SCORE_INCREMENT,
        'Classic scoring stays on the normal step'
      );
    } finally {
      game.mode = origMode;
      setQaFlag('level', false);
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
      setQaFlag('night', true);
      setQaFlag('level', true);
      const gold = goldWashDuring(tick);
      assertEquals(gold.length, 1, 'night plus level still paints one wash');
      assert(
        gold[0].indexOf(GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA.toFixed(3)) !== -1,
        'the night flag selects the quiet peak'
      );
      assertEquals(
        game.score,
        GAME_CONFIG.SCORE_INCREMENT,
        'the pair of flags must not jump the score'
      );
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'the quiet peak is the one on screen at the start of the run'
      );
    } finally {
      game.mode = origMode;
      setQaFlag('level', false);
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('without the flag the first frames stay quiet and score 100 still flashes', () => {
    const origMode = game.mode;
    try {
      setQaFlag('level', false);
      setQaFlag('night', false);
      armFreshRun();
      game.mode = MODES.UPDATED;
      tick();
      assertEquals(Animations.milestoneFrames, 0, 'a normal run does not flash at the start');
      assertEquals(game.qaLevelShown, false);
      assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT);

      game.score = GAME_CONFIG.SCORE_PER_LEVEL - 0.05;
      tick();
      assertEquals(game.milestoneText, 'LEVEL 2', 'score 100 still uses the real level label');
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'score 100 still starts the full wash'
      );
      assert(game.score >= GAME_CONFIG.SCORE_PER_LEVEL, 'the level still unlocks at 100');
    } finally {
      game.mode = origMode;
      setQaFlag('level', false);
      Particles.reset();
      Animations.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaLevel=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    setPageQuery('?qaNight=1&qaLevel=1');
    try {
      setQaFlag('level', false);
      setQaFlag('night', false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      tick();
      assertEquals(
        game.qaLevelShown,
        true,
        'resetGame should arm the early wash from location.search'
      );
      assertEquals(
        Animations.milestoneFrames,
        GAME_CONFIG.MILESTONE_FRAMES,
        'the re-read flag still fires on the first running frame'
      );
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(
        skyTintPeakAlpha(),
        GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA,
        'qaNight on the same query still selects the quiet peak'
      );
    } finally {
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('level', false);
      setQaFlag('night', false);
      Particles.reset();
      Animations.reset();
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
      restore() {
        ctx.translate = orig;
      },
    };
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
    setQaFlag('dust', false);
    setQaFlag('flash', false);
    setQaFlag('scorePop', false);
    setQaFlag('shake', false);
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
    assert(readQaFlag('shake', '?qaShake=1') === true, '?qaShake=1 should hold the death nudge');
    assert(
      readQaFlag('shake', '?qaNight=1&qaShake=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('shake', '?qaShake=1&qaFlash=1') === true, 'param order should not matter');
    assert(
      readQaFlag('shake', '') === false,
      'a normal visit should leave the nudge for a real death'
    );
    assert(readQaFlag('shake', '?qaShake=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('shake', '?qaShake=8') === false, 'qaShake=8 must not count as the flag');
    assert(readQaFlag('shake', '?qaScorePop=1') === false, 'the score pop must not hold the shake');
  });

  it('holds the quieter peak from the first frame without arming the real shake', () => {
    const origMode = game.mode;
    const spy = spyTranslate();
    try {
      assert(QA_SHAKE_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('shake', false);
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
        setQaFlag('shake', true);
        game.score = 0;
        spy.calls.length = 0;
        tick();
        assertEquals(spy.calls.length, 1, mode + ' shifts the camera once');
        assertEquals(
          spy.calls[0].x,
          GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' holds the quiet peak, not a louder debug shift'
        );
        assertEquals(spy.calls[0].y, 0, mode + ' hold stays horizontal');
        assertEquals(
          qaShakeOffset(),
          GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' playtest offset is the real quiet amplitude'
        );
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
        assertEquals(
          spy.calls[0].x,
          GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
          mode + ' night uses the same quiet peak'
        );
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('shake', false);
      setQaFlag('night', false);
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
      setQaFlag('shake', true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      // The hit frame paints the death scene since update and draw were
      // split (C5), so its shift is the real shake's opening offset. The QA
      // hold only shifts RUNNING frames, so it does not stack on top.
      assert(spy.calls.length >= 1, 'the hit frame is still shifted');
      assert(
        Math.abs(
          spy.calls[0].x -
            Math.sin(Animations.deathShakeFrames * deathShakeFreq()) * deathShakeAmplitude()
        ) < 1e-9,
        'the hit frame opens the real death shake'
      );
      assertEquals(
        Animations.deathShakeFrames,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real shake timer is still armed'
      );
      assertEquals(
        Animations.scorePopFrames,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real pop stays locked to that shake'
      );
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('shake', false);
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
      setQaFlag('shake', true);
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
      setQaFlag('shake', false);
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
        setQaFlag('shake', true);
        spy.calls.length = 0;
        tick();
        const damped = qaShakeOffset();
        const peak = GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE;
        assertEquals(
          game.qaShakeHold,
          qaHoldFrames('shake'),
          mode + ' hold uses the shorter window'
        );
        assert(game.qaShakeHold < QA_SHAKE_HOLD, mode + ' hold is shorter than the full capture');
        assert(qaHoldFrames('shake') >= 2, mode + ' hold still lasts long enough to see');
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
      setQaFlag('shake', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaShake=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyTranslate();
    setPageQuery('?qaShake=1');
    try {
      setQaFlag('shake', false);
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
      assertEquals(
        spy.calls[0].x,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE,
        're-read flag holds the quiet peak'
      );
      assertEquals(game.qaShakeHold, QA_SHAKE_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaShakeShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('shake', false);
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
    return (
      rect.x >= dino.x &&
      rect.y >= dino.y &&
      rect.x + rect.w <= dino.x + dino.width &&
      rect.y + rect.h <= dino.y + dino.height
    );
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
    const redAt = calls.findIndex(
      (c) => c.op === 'rect' && c.style === Particles.KINDS.collision.color
    );
    assert(redAt > lastHud, label + ' cluster is painted after the HUD');
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
    setQaFlag('dust', false);
    setQaFlag('flash', false);
    setQaFlag('scorePop', false);
    setQaFlag('newBest', false);
    setQaFlag('collision', false);
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
    assert(
      readQaFlag('collision', '?qaCollision=1') === true,
      '?qaCollision=1 should hold the death puff'
    );
    assert(
      readQaFlag('collision', '?qaNight=1&qaCollision=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(
      readQaFlag('collision', '?qaCollision=1&qaDust=1') === true,
      'param order should not matter'
    );
    assert(
      readQaFlag('collision', '') === false,
      'a normal visit should leave the puff for a real death'
    );
    assert(
      readQaFlag('collision', '?qaCollision=0') === false,
      'only the value 1 enables the flag'
    );
    assert(
      readQaFlag('collision', '?qaCollision=12') === false,
      'qaCollision=12 must not count as the flag'
    );
    assert(
      readQaFlag('collision', '?qaFlash=1') === false,
      'the flash flag must not hold the death puff'
    );
  });

  it('paints the quieter red cluster on the dino from the first running frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(
        QA_COLLISION_HOLD >= 120,
        'the debug hold must outlast a quick capture after GET READY'
      );
      assertEquals(
        QA_COLLISION_OFFSETS.length,
        Particles.KINDS.collision.count,
        'the hold shows one mark per quieter mote'
      );
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('collision', false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        const gapOff = game.nextSpawnGap;
        assertEquals(redFills(spy.calls).length, 0, mode + ' without the flag does not paint');
        assertEquals(
          game.qaCollisionShown,
          false,
          mode + ' without the flag does not spend the latch'
        );
        assertEquals(game.qaCollisionHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('collision', true);
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
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score'
        );
        assertEquals(game.nextSpawnGap, gapOff, mode + ' hold must not change the spawn gap');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');
        assertEquals(game.obstacles.length, 0, mode + ' hold must not spawn an obstacle');

        for (let i = 0; i < 30; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertCluster(spy.calls, mode + ' still', 1);
        assertEquals(
          game.qaCollisionHold,
          QA_COLLISION_HOLD - 30,
          mode + ' keeps the hold up after the run starts'
        );
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('collision', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the cluster when a hit returns before the death draw', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlag('collision', true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      // The hit frame also paints the real collision burst now (C5), in the
      // same red, so the hold's marks are at least that many fills.
      const reds = redFills(spy.calls);
      assert(
        reds.length >= qaCollisionMarks().length,
        'the hold still paints after the collision return'
      );
      assert(reds.every(onBody), 'the death-frame hold stays on the dino');
      assertEquals(
        game.qaCollisionHold,
        QA_COLLISION_HOLD,
        'the latch frame does not tick the hold down'
      );
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('collision', false);
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
      setQaFlag('collision', true);
      tick();
      tick();
      assertEquals(redFills(spy.calls).length, 0, 'Classic never paints the debug cluster');
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === Particles.KINDS.collision.color)
          .length,
        0,
        'Classic does not emit the production puff either'
      );
      assertEquals(game.qaCollisionShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaCollisionHold, 0, 'Classic does not start the hold');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('collision', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('reduced motion shortens the hold and paints a quieter cluster', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlag('collision', true);
      setReducedMotion(false);
      const fullMarks = qaCollisionMarks().length;
      assert(fullMarks > 1, 'motion-on capture is a cluster, not one mote');
      setReducedMotion(true);
      spy.calls.length = 0;
      tick();
      assertEquals(game.qaCollisionHold, qaHoldFrames('collision'), 'hold uses the shorter window');
      assert(game.qaCollisionHold < QA_COLLISION_HOLD, 'hold is shorter than the full capture');
      assert(qaHoldFrames('collision') >= 2, 'hold still lasts long enough to see');
      assertEquals(qaCollisionPaintAlpha(), 0.5, 'reduced motion halves the hold ink');
      assertCluster(spy.calls, 'reduced motion', 0.5);
      assert(
        redFills(spy.calls).length < fullMarks,
        'reduced motion does not paint the full cluster'
      );
      assertEquals(
        Particles.particles.filter((p) => p.life > 0 && p.color === Particles.KINDS.collision.color)
          .length,
        0,
        'the damped hold does not go through the particle pool'
      );
      assert(game.score < 1, 'the damped hold must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('collision', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCollision=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPaint();
    setPageQuery('?qaCollision=1');
    try {
      setQaFlag('collision', false);
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
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('collision', false);
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
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
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
    assert(
      readQaFlag('trail', '?qaTrail=1') === true,
      '?qaTrail=1 should enable the early heel trail'
    );
    assert(
      readQaFlag('trail', '?qaNight=1&qaTrail=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('trail', '?qaTrail=1&qaNight=1') === true, 'param order should not matter');
    assert(
      readQaFlag('trail', '') === false,
      'a normal visit should leave the trail on real speed'
    );
    assert(readQaFlag('trail', '?qaTrail=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('trail', '?qaTrail=12') === false, 'qaTrail=12 must not count as the flag');
    assert(readQaFlag('trail', '?qaNight=1') === false, 'night alone must not force the trail');
  });

  it('emits the whisper on the first Updated and Daily frame without moving score or speed', () => {
    const origMode = game.mode;
    try {
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('trail', false);
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(
          trailMotes().length,
          0,
          mode + ' without the flag does not whisper at the start'
        );

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('trail', true);
        tick();
        const motes = trailMotes();
        assertEquals(
          motes.length,
          Particles.KINDS.trail.count,
          mode + ' emits the whisper immediately'
        );
        motes.forEach((p) => {
          assertEquals(p.life, Particles.KINDS.trail.life, mode + ' uses the quiet life');
          assertEquals(p.color, WHISPER_COLOR, mode + ' uses the quiet grey');
          assert(
            Math.abs(p.x - (dino.x + 4)) <= cfg('PARTICLE_EMIT_SPREAD') / 2,
            mode + ' QA mote stays at the heel'
          );
          assertEquals(p.y, dino.y + dino.height - 4, mode + ' QA mote starts at the heel');
        });
        assertEquals(game.score, GAME_CONFIG.SCORE_INCREMENT, mode + ' must not jump the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' must not change speed');
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score'
        );
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');

        tick();
        assertEquals(trailMotes().length, 2, mode + ' keeps whispering on the next frame');
        assertEquals(
          game.score,
          GAME_CONFIG.SCORE_INCREMENT * 2,
          mode + ' scoring keeps its normal step'
        );
      }
    } finally {
      game.mode = origMode;
      setQaFlag('trail', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaTrail=1 still emits nothing', () => {
    const origMode = game.mode;
    try {
      armFreshRun(MODES.CLASSIC);
      setQaFlag('trail', true);
      tick();
      tick();
      assertEquals(trailMotes().length, 0, 'Classic never trails, even with the flag');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score'
      );
    } finally {
      game.mode = origMode;
      setQaFlag('trail', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaTrail=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    setPageQuery('?qaNight=1&qaTrail=1');
    try {
      setQaFlag('trail', false);
      setQaFlag('night', false);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.state = STATE.RUNNING;
      game.mode = MODES.UPDATED;
      game.obstacles.length = 0;
      game.lastObstacleX = GAME_CONFIG.CANVAS_W;
      game.nextSpawnGap = GAME_CONFIG.MAX_SPAWN_GAP;
      tick();
      assertEquals(
        trailMotes().length,
        Particles.KINDS.trail.count,
        'resetGame should arm the early whisper from location.search'
      );
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(
        getBackgroundColor(game.score),
        '#1a1a2e',
        'qaNight on the same query still paints night'
      );
    } finally {
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('trail', false);
      setQaFlag('night', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
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
    assert(
      readQaFlag('confetti', '?qaConfetti=1') === true,
      '?qaConfetti=1 should enable the early gold puff'
    );
    assert(
      readQaFlag('confetti', '?qaNight=1&qaConfetti=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(
      readQaFlag('confetti', '?qaConfetti=1&qaTrail=1') === true,
      'param order should not matter'
    );
    assert(
      readQaFlag('confetti', '') === false,
      'a normal visit should leave confetti on the real level'
    );
    assert(readQaFlag('confetti', '?qaConfetti=0') === false, 'only the value 1 enables the flag');
    assert(
      readQaFlag('confetti', '?qaConfetti=12') === false,
      'qaConfetti=12 must not count as the flag'
    );
    assert(
      readQaFlag('confetti', '?qaLevel=1') === false,
      'the level flag must not force this latch'
    );
  });

  it('paints a dark-gold block from the hold, even when the pool cannot emit', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      assert(
        QA_CONFETTI_HOLD >= 120,
        'the debug hold must outlast a quick capture after GET READY'
      );
      assert(
        QA_CONFETTI_BLOCK_W >= 60,
        'the debug block must be wide enough to see under the score'
      );
      assert(
        QA_CONFETTI_BLOCK_H >= 24,
        'the debug block must be tall enough to see under the score'
      );
      assertEquals(Particles.KINDS.confetti.life, 12, 'production life stays the shorter puff');
      assertEquals(
        Particles.KINDS.confetti.color,
        '#ffd700',
        'production gold stays the light kind'
      );
      assertEquals(Particles.KINDS.confetti.size, 3, 'production mote size stays 3');
      assertEquals(Particles.KINDS.confetti.count, 6, 'production count stays the quieter puff');
      assertEquals(Particles.KINDS.confetti.vxSpread, 0.7, 'production spread stays on the score');
      assertEquals(Particles.KINDS.confetti.alpha, 0.7, 'production peak stays under solid gold');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('confetti', false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(
          goldAfterScore(spy.calls).length,
          0,
          mode + ' without the flag does not paint'
        );
        assertEquals(
          game.qaConfettiShown,
          false,
          mode + ' without the flag does not spend the latch'
        );
        assertEquals(game.qaConfettiHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('confetti', true);
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
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score'
        );
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');
        assertEquals(game.qaLevelShown, false, mode + ' does not spend the level latch');
        assertEquals(Animations.milestoneFrames, 0, mode + ' does not start the level wash');

        for (let i = 0; i < 90; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertBlock(spy.calls, mode + ' still');
        assertEquals(
          game.qaConfettiHold,
          QA_CONFETTI_HOLD - 90,
          mode + ' keeps the hold up well after GET READY'
        );
        assert(
          Math.abs(game.score - GAME_CONFIG.SCORE_INCREMENT * 91) < 1e-6,
          mode + ' scoring keeps its normal step'
        );
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('confetti', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the block when a hit skips the rest of the frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlag('confetti', true);
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
      setQaFlag('confetti', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaConfetti=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaFlag('confetti', true);
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
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('confetti', false);
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
        setQaFlag('confetti', true);
        spy.calls.length = 0;
        tick();
        assertEquals(
          game.qaConfettiHold,
          qaHoldFrames('confetti'),
          mode + ' hold uses the shorter window'
        );
        assert(
          game.qaConfettiHold < QA_CONFETTI_HOLD,
          mode + ' hold is shorter than the full capture'
        );
        assert(qaHoldFrames('confetti') >= 2, mode + ' hold still lasts long enough to see');
        assertEquals(qaConfettiPaintAlpha(), 0.5, mode + ' reduced motion halves the hold ink');
        assertBlock(spy.calls, mode + ' reduced motion', 0.5);
        assertEquals(
          Particles.particles.filter((p) => p.color === QA_CONFETTI_COLOR || p.color === '#ffd700')
            .length,
          0,
          mode + ' debug block does not go through the particle pool'
        );
        assert(game.score < 1, mode + ' debug block does not move the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('confetti', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaConfetti=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPaint();
    setPageQuery('?qaConfetti=1');
    try {
      setQaFlag('confetti', false);
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
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('confetti', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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

  function dustFills(calls, color) {
    return calls.filter(
      (c) => c.op === 'rect' && c.style === color && c.w === QA_DUST_SIZE && c.h === QA_DUST_SIZE
    );
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
    const firstFill = calls.findIndex(
      (c) => c.op === 'rect' && c.style === color && c.w === QA_DUST_SIZE
    );
    assert(firstFill > lastHud, label + ' dust is painted after the frame, including the HUD');
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
    setQaFlag('dust', false);
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
    assert(readQaFlag('dust', '?qaDust=1') === true, '?qaDust=1 should enable the held foot dust');
    assert(
      readQaFlag('dust', '?qaNight=1&qaDust=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('dust', '?qaDust=1&qaConfetti=1') === true, 'param order should not matter');
    assert(
      readQaFlag('dust', '') === false,
      'a normal visit should leave dust on a real jump and land'
    );
    assert(readQaFlag('dust', '?qaDust=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('dust', '?qaDust=12') === false, 'qaDust=12 must not count as the flag');
    assert(readQaFlag('dust', '?qaNight=1') === false, 'night alone must not force the held dust');
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
        setQaFlag('dust', false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        assertEquals(
          dustFills(spy.calls, '#9c8770').length,
          0,
          mode + ' without the flag does not paint'
        );
        assertEquals(game.qaDustShown, false, mode + ' without the flag does not spend the latch');
        assertEquals(game.qaDustHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('dust', true);
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
        assertEquals(
          game.currentSpeed,
          DifficultyProfile.speedAtScore(game.score),
          mode + ' speed still follows the real score'
        );
        assertEquals(game.rng(), rngAfterOff, mode + ' does not consume the run seed');
        assertEquals(game.plateauCueShown, false, mode + ' does not spend the plateau cue');

        for (let i = 0; i < 90; i++) {
          spy.calls.length = 0;
          tick();
        }
        assertMarks(spy.calls, '#9c8770', mode + ' still');
        assertEquals(
          game.qaDustHold,
          QA_DUST_HOLD - 90,
          mode + ' keeps the hold up well into the run'
        );
        assert(
          Math.abs(game.score - GAME_CONFIG.SCORE_INCREMENT * 91) < 1e-6,
          mode + ' scoring keeps its normal step'
        );
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('dust', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('still paints the held motes when a hit skips the rest of the frame', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlag('dust', true);
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
      setQaFlag('dust', false);
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
      setQaFlag('dust', true);
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
      setQaFlag('dust', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('?qaNight=1 cools the held motes without moving the score', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.UPDATED);
      setQaFlag('dust', true);
      setQaFlag('night', true);
      spy.calls.length = 0;
      tick();
      assertMarks(spy.calls, GAME_CONFIG.NIGHT_LAND_DUST_COLOR, 'night', 0.42);
      assertEquals(GAME_CONFIG.NIGHT_LAND_DUST_COLOR, '#6a686e', 'night dust stays the cool gray');
      assertEquals(
        GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA,
        0.42,
        'the night hold uses the quieter takeoff peak, not solid ink'
      );
      assertEquals(
        dustFills(spy.calls, '#9c8770').length,
        0,
        'night hold does not paint the day brown'
      );
      assert(game.score < 1, 'the night hold must not write the score');
      assertEquals(
        game.qaDustHold,
        QA_DUST_HOLD,
        'the quieter night hold keeps the full capture length'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('dust', false);
      setQaFlag('night', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaDust=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaFlag('dust', true);
      tick();
      tick();
      assertEquals(dustFills(spy.calls, '#9c8770').length, 0, 'Classic never paints the held dust');
      assertEquals(
        dustFills(spy.calls, '#6a686e').length,
        0,
        'Classic never paints the night dust either'
      );
      assertEquals(game.qaDustShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaDustHold, 0, 'Classic does not start the hold');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'Classic speed still follows the score'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('dust', false);
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
      setQaFlag('dust', true);
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
      setQaFlag('dust', false);
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
      setQaFlag('night', true);
      setQaFlag('dust', true);
      tick();
      assertMarks(spy.calls, '#6a686e', 'reduced motion night', 0.21);
      assertEquals(
        game.qaDustHold,
        QA_DUST_HOLD,
        'reduced motion damps the night ink without shortening the hold'
      );
      assertEquals(
        Particles.particles.filter((p) => p.life > 0).length,
        0,
        'the held night motes do not go through the particle pool'
      );
      assert(game.score < 1, 'the damped night hold must not write the score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('dust', false);
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaDust=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPaint();
    setPageQuery('?qaNight=1&qaDust=1');
    try {
      setQaFlag('dust', false);
      setQaFlag('night', false);
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
      assertEquals(
        getBackgroundColor(game.score),
        '#1a1a2e',
        'qaNight on the same query still paints night'
      );
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('dust', false);
      setQaFlag('night', false);
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
    return calls.filter(
      (c) =>
        c.op === 'rect' &&
        typeof c.style === 'string' &&
        c.style.indexOf('rgba(255, 255, 255') === 0 &&
        c.style.indexOf(alphaText) !== -1 &&
        c.w === GAME_CONFIG.CANVAS_W &&
        c.h === GAME_CONFIG.CANVAS_H
    );
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
    setQaFlag('dust', false);
    setQaFlag('flash', false);
    setQaFlag('scorePop', false);
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
    assert(readQaFlag('flash', '?qaFlash=1') === true, '?qaFlash=1 should hold the death blink');
    assert(
      readQaFlag('flash', '?qaNight=1&qaFlash=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('flash', '?qaFlash=1&qaDust=1') === true, 'param order should not matter');
    assert(
      readQaFlag('flash', '') === false,
      'a normal visit should leave the flash for a real death'
    );
    assert(readQaFlag('flash', '?qaFlash=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('flash', '?qaFlash=12') === false, 'qaFlash=12 must not count as the flag');
    assert(
      readQaFlag('flash', '?qaNight=1') === false,
      'night alone must not hold the death blink'
    );
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
        setQaFlag('flash', false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        assertEquals(
          flashFills(spy.calls, dayAlpha).length,
          0,
          mode + ' without the flag does not wash the lane'
        );
        assertEquals(game.qaFlashHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('flash', true);
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
        const flashAt = spy.calls.findIndex(
          (c) =>
            c.op === 'rect' &&
            c.w === GAME_CONFIG.CANVAS_W &&
            typeof c.style === 'string' &&
            c.style.indexOf(dayAlpha) !== -1
        );
        assert(flashAt > lastHud, mode + ' blink is painted after the frame, including the HUD');
        assertEquals(game.qaFlashHold, QA_FLASH_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaFlashShown, true, mode + ' spends the latch');
        assertEquals(
          Animations.deathFlashFrames,
          0,
          mode + ' does not borrow the real death timer'
        );
        assertEquals(game.score, scoreOff, mode + ' hold must not write the score');
        assertEquals(game.currentSpeed, speedOff, mode + ' hold must not change speed');
        assertEquals(game.rng(), rngAfterOff, mode + ' hold must not consume the run seed');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('flash', false);
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
      setQaFlag('flash', true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      const dayAlpha = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      // The real death blink paints on the hit frame too now (C5).
      assert(
        flashFills(spy.calls, dayAlpha).length >= 1,
        'the hold still paints after the collision return'
      );
      assertEquals(
        Animations.deathFlashFrames,
        GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the real flash timer is still armed for the death shake'
      );
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('flash', false);
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
      setQaFlag('flash', true);
      setQaFlag('night', true);
      spy.calls.length = 0;
      tick();
      const nightAlpha = GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      const dayAlpha = GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA.toFixed(3);
      assertEquals(flashFills(spy.calls, nightAlpha).length, 1, 'night hold paints the quiet peak');
      assertEquals(
        flashFills(spy.calls, dayAlpha).length,
        0,
        'night hold does not paint the day peak'
      );
      assert(game.score < 1, 'the night hold must not write the score');
      assertEquals(
        game.currentSpeed,
        DifficultyProfile.speedAtScore(game.score),
        'the night hold must not change speed'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('flash', false);
      setQaFlag('night', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic with ?qaFlash=1 still paints nothing', () => {
    const origMode = game.mode;
    const spy = spyPaint();
    try {
      armFreshRun(MODES.CLASSIC);
      setQaFlag('flash', true);
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
      setQaFlag('flash', false);
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
        setQaFlag('flash', true);
        setQaFlag('night', night);
        const peak = night
          ? GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA
          : GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA;
        const damped = (peak * 0.5).toFixed(3);
        spy.calls.length = 0;
        tick();
        const label = night ? 'night' : 'day';
        assertEquals(
          game.qaFlashHold,
          qaHoldFrames('flash'),
          label + ' hold uses the shorter window'
        );
        assert(game.qaFlashHold < QA_FLASH_HOLD, label + ' hold is shorter than the full capture');
        assert(qaHoldFrames('flash') >= 2, label + ' hold still lasts long enough to see');
        assertEquals(
          flashFills(spy.calls, damped).length,
          1,
          label + ' reduced motion still paints the wash'
        );
        assertEquals(
          flashFills(spy.calls, peak.toFixed(3)).length,
          0,
          label + ' reduced motion does not keep the full-strength ink'
        );
        assertEquals(Animations.deathFlashFrames, 0, label + ' hold does not arm the real flash');
        assert(game.score < 1, label + ' damped hold must not write the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('flash', false);
      setQaFlag('night', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaFlash=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPaint();
    setPageQuery('?qaNight=1&qaFlash=1');
    try {
      setQaFlag('flash', false);
      setQaFlag('night', false);
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
      assertEquals(
        flashFills(spy.calls, GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA.toFixed(3)).length,
        1,
        're-read flag paints the night blink'
      );
      assertEquals(game.qaFlashHold, QA_FLASH_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaFlashShown, true, 'the re-read flag spends the latch');
      assertEquals(
        getBackgroundColor(game.score),
        '#1a1a2e',
        'qaNight on the same query still paints night'
      );
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('flash', false);
      setQaFlag('night', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    return calls.filter(
      (c) => c.op === 'scale' && Math.abs(c.x - scale) < 1e-9 && Math.abs(c.y - scale) < 1e-9
    );
  }

  function armFreshRun(mode) {
    game.mode = mode;
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('level', false);
    setQaFlag('night', false);
    setQaFlag('plateau', false);
    setQaFlag('trail', false);
    setQaFlag('confetti', false);
    setQaFlag('dust', false);
    setQaFlag('flash', false);
    setQaFlag('scorePop', false);
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
    assert(
      readQaFlag('scorePop', '?qaScorePop=1') === true,
      '?qaScorePop=1 should hold the score pop'
    );
    assert(
      readQaFlag('scorePop', '?qaNight=1&qaScorePop=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(
      readQaFlag('scorePop', '?qaScorePop=1&qaFlash=1') === true,
      'param order should not matter'
    );
    assert(
      readQaFlag('scorePop', '') === false,
      'a normal visit should leave the pop for a real death'
    );
    assert(readQaFlag('scorePop', '?qaScorePop=0') === false, 'only the value 1 enables the flag');
    assert(
      readQaFlag('scorePop', '?qaScorePop=12') === false,
      'qaScorePop=12 must not count as the flag'
    );
    assert(
      readQaFlag('scorePop', '?qaFlash=1') === false,
      'the death blink must not hold the score pop'
    );
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
        setQaFlag('scorePop', false);
        spy.calls.length = 0;
        tick();
        const rngAfterOff = game.rng();
        const speedOff = game.currentSpeed;
        const scoreOff = game.score;
        assertEquals(
          scalesNear(spy.calls, peak).length,
          0,
          mode + ' without the flag does not scale the HUD'
        );
        assertEquals(game.qaScorePopHold, 0, mode + ' without the flag does not start the hold');

        armFreshRun(mode);
        game.rng = mulberry32(11);
        setQaFlag('scorePop', true);
        Animations.scorePopFrames = 0;
        Particles.reset();
        for (let i = 0; i < Particles.POOL_SIZE; i++) Particles.particles[i].life = 8;
        spy.calls.length = 0;
        tick();
        const popped = scalesNear(spy.calls, peak);
        assertEquals(popped.length, 1, mode + ' scales the HUD once, at the quiet peak');
        assertEquals(scalesNear(spy.calls, 1.4).length, 0, mode + ' does not hold the old slap');
        const coverAt = spy.calls.findIndex(
          (c) =>
            c.op === 'rect' &&
            c.style === '#ffffff' &&
            c.x === cover.x &&
            c.y === cover.y &&
            c.w === cover.w &&
            c.h === cover.h &&
            c.alpha === 1
        );
        const scaleAt = spy.calls.findIndex((c) => c.op === 'scale');
        const textAt = spy.calls.findIndex(
          (c, i) => i > scaleAt && c.op === 'text' && c.text === '00000'
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
      setQaFlag('scorePop', false);
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
      setQaFlag('scorePop', true);
      game.obstacles.push({ x: dino.x, y: GAME_CONFIG.CANVAS_H - 40, width: 20, height: 40 });
      spy.calls.length = 0;
      tick();
      assertEquals(game.state, STATE.DEAD, 'the cactus still ends the run');
      // The real score pop paints on the hit frame too now (C5).
      assert(
        scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length >= 1,
        'the hold still paints after the collision return'
      );
      assertEquals(
        Animations.scorePopFrames,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the real pop timer is still armed for the quieter shake'
      );
      assertEquals(
        Animations.deathFlashFrames,
        GAME_CONFIG.DEATH_FLASH_FRAMES,
        'the death blink is unchanged'
      );
      assertEquals(
        Animations.deathShakeFrames,
        GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES,
        'the death shake uses the shorter window'
      );
      assert(game.score < 1, 'dying on the QA frame does not invent score');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('scorePop', false);
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
      setQaFlag('scorePop', true);
      tick();
      tick();
      assertEquals(
        spy.calls.filter((c) => c.op === 'scale').length,
        0,
        'Classic never scales the HUD'
      );
      assertEquals(game.qaScorePopShown, false, 'Classic does not spend the Updated latch');
      assertEquals(game.qaScorePopHold, 0, 'Classic does not start the hold');
      assertEquals(Animations.scorePopFrames, 0, 'Classic still does not start the real pop');
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('scorePop', false);
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
        setQaFlag('scorePop', true);
        spy.calls.length = 0;
        tick();
        const damped = qaScorePopScale();
        const peak = GAME_CONFIG.SCORE_POP_PEAK_SCALE;
        assertEquals(
          game.qaScorePopHold,
          qaHoldFrames('scorePop'),
          mode + ' hold uses the shorter window'
        );
        assert(
          game.qaScorePopHold < QA_SCORE_POP_HOLD,
          mode + ' hold is shorter than the full capture'
        );
        assert(qaHoldFrames('scorePop') >= 2, mode + ' hold still lasts long enough to see');
        assert(damped > 1, mode + ' damped hold still grows the number');
        assert(damped < peak, mode + ' damped hold is softer than the motion-allowed peak');
        assertEquals(
          scalesNear(spy.calls, damped).length,
          1,
          mode + ' reduced motion still paints the swell'
        );
        assertEquals(
          scalesNear(spy.calls, peak).length,
          0,
          mode + ' reduced motion does not keep the full peak'
        );
        assertEquals(Animations.scorePopFrames, 0, mode + ' hold does not arm the real pop');
        assert(game.score < 1, mode + ' damped hold must not write the score');
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      setQaFlag('scorePop', false);
      setReducedMotion(false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaScorePop=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPaint();
    setPageQuery('?qaScorePop=1');
    try {
      setQaFlag('scorePop', false);
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
      assertEquals(
        scalesNear(spy.calls, GAME_CONFIG.SCORE_POP_PEAK_SCALE).length,
        1,
        're-read flag paints the quiet peak'
      );
      assertEquals(game.qaScorePopHold, QA_SCORE_POP_HOLD, 'the re-read flag latches the hold');
      assert(game.score < 1, 're-reading the flag must not change the score');
      assertEquals(game.qaScorePopShown, true, 'the re-read flag spends the latch');
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('scorePop', false);
      Particles.reset();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    stubElementStyle(shareBtn, { display: 'none' });
    shareBtn.textContent = '📋 Copy result';
    installClassList(shareBtn);
    return shareBtn;
  }

  function restoreButton(orig) {
    const shareBtn = document.getElementById('share-btn');
    restoreElementStyle(shareBtn, orig.style);
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
    if (typeof setQaFlag === 'function') setQaFlag('copy', true);
    return prepareButton();
  }

  it('?qaCopy=1 is Daily-only and off for any other value', () => {
    assert(readQaFlag('copy', '?qaCopy=1') === true, '?qaCopy=1 should hold Copied');
    assert(
      readQaFlag('copy', '?qaNight=1&qaCopy=1') === true,
      'the flag should work beside other params'
    );
    assert(readQaFlag('copy', '?qaCopy=1&qaNewBest=1') === true, 'param order should not matter');
    assert(readQaFlag('copy', '?qaCopy=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('copy', '?qaCopy=12') === false, 'qaCopy=12 must not count as the flag');
    assert(readQaFlag('copy', '') === false, 'an empty query leaves the flag off');
    assert(readQaFlag('copy', '?qaNewBest=1') === false, 'the badge flag must not hold Copied');
    assert(readQaFlag('newBest', '?qaCopy=1') === false, 'this flag must not hold the badge');
    assert(readQaFlag('flash', '?qaCopy=1') === false, 'this flag must not flash the death blink');
    assert(
      readQaFlag('collision', '?qaCopy=1') === false,
      'this flag must not hold the death puff'
    );
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
      assertEquals(qaHoldFrames('copy'), QA_COPY_HOLD, 'the helper matches the full window');
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
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
        if (typeof setQaFlag === 'function') setQaFlag('copy', true);
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
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
      assertEquals(game.qaCopyHold, qaHoldFrames('copy'), 'the helper matches the damped hold');
      assert(game.qaCopyHold < QA_COPY_HOLD, 'the damped hold is shorter');
      assert(qaHoldFrames('copy') >= 2, 'the hold still lasts long enough to see');
      assertEquals(shareBtn.style.display, 'block', 'the damped hold stays visible');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the label still says Copied');
      assert(shareBtn.classList.contains('is-copied'), 'Copied is still readable');
      assert(shareBtn.classList.contains('is-qa-damped'), 'reduced motion quiets the paint');
      assertEquals(Animations.copyFlashFrames, 0, 'the damped hold does not start the live flash');
    } finally {
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
      assert(
        Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES,
        'the count-up has not finished'
      );
      assertEquals(
        shareBtn.style.display,
        'block',
        'QA keeps the button up before the count-up ends'
      );
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the early button still says Copied');
      assertEquals(game.score, 0, 'showing the button does not invent a score');
    } finally {
      game.mode = origMode;
      game.state = origState;
      Animations.deathAnimFrame = origAnim;
      Animations.deathShakeFrames = origShake;
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
    const restorePageQuery = savePageQuery();
    try {
      setReducedMotion(false);
      setPageQuery('');
      if (typeof setQaFlag === 'function') setQaFlag('copy', true);
      game.qaCopyShown = true;
      game.qaCopyHold = 40;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.DAILY;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.qaCopyHold, 0, 'a visit without the flag clears the hold');
      assertEquals(game.qaCopyShown, false, 'a visit without the flag clears the latch');

      setPageQuery('?qaCopy=1');
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
      assertEquals(
        Animations.copyFlashFrames,
        0,
        're-reading the flag does not start the live flash'
      );
    } finally {
      restorePageQuery();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('copy', false);
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
    if (typeof setQaFlag === 'function') setQaFlag('countUp', false);
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
      restore() {
        ctx.fillText = orig;
      },
    };
  }

  it('recognizes only ?qaCountUp=1', () => {
    assert(typeof readQaFlag === 'function', 'readQaFlag should parse the playtest query');
    assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
    assert(readQaFlag('countUp', '?qaCountUp=1') === true, '?qaCountUp=1 should hold the count-up');
    assert(
      readQaFlag('countUp', '?qaNight=1&qaCountUp=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(
      readQaFlag('countUp', '?qaCountUp=1&qaShake=1') === true,
      'param order should not matter'
    );
    assert(
      readQaFlag('countUp', '') === false,
      'a normal visit should leave the roll for a real death'
    );
    assert(readQaFlag('countUp', '?qaCountUp=0') === false, 'only the value 1 enables the flag');
    assert(
      readQaFlag('countUp', '?qaCountUp=18') === false,
      'qaCountUp=18 must not count as the flag'
    );
    assert(
      readQaFlag('countUp', '?qaScorePop=1') === false,
      'the score pop must not hold the count-up'
    );
  });

  it('holds a screenshotable Game Over roll without writing the run', () => {
    const origMode = game.mode;
    const spy = spyScoreText();
    const storedDaily = localStorage.getItem('dino-daily-best');
    const storedHigh = localStorage.getItem('dino-high-score');
    try {
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      assert(QA_COUNT_UP_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armWaiting(mode);
        const origRng = game.rng;
        let rngCalls = 0;
        game.rng = () => {
          rngCalls++;
          return origRng();
        };
        setQaFlag('countUp', true);
        spy.calls.length = 0;
        tick();
        const expectFull = mode === MODES.DAILY;
        assert(
          spy.calls.includes('00100'),
          mode + ' holds the settled sample score from the shorter roll'
        );
        assert(!spy.calls.includes('00060'), mode + ' does not paint the Classic partial score');
        if (expectFull) {
          assert(
            spy.calls.includes('Share TODAY BEST with Copy result'),
            'Daily hold shows the hint once the shorter roll has settled'
          );
        } else {
          assert(
            !spy.calls.includes('Share TODAY BEST with Copy result'),
            'Updated hold does not draw the Daily hint'
          );
        }
        assertEquals(game.qaCountUpHold, QA_COUNT_UP_HOLD, mode + ' latches the full hold');
        assertEquals(game.qaCountUpShown, true, mode + ' spends the latch');
        assertEquals(Animations.deathAnimFrame, 0, mode + ' does not arm the real count-up');
        assertEquals(game.state, STATE.WAITING, mode + ' does not enter a real death');
        assertEquals(game.score, 0, mode + ' hold must not write the score');
        assertEquals(game.highScore, 0, mode + ' hold must not write the high score');
        assertEquals(game.dailyBest, 0, mode + ' hold must not write daily best');
        assertEquals(
          localStorage.getItem('dino-daily-best'),
          storedDaily,
          mode + ' hold must not store daily best'
        );
        assertEquals(
          localStorage.getItem('dino-high-score'),
          storedHigh,
          mode + ' hold must not store the high score'
        );
        assertEquals(rngCalls, 0, mode + ' hold must not consume the run seed');
        assertEquals(
          game.currentSpeed,
          GAME_CONFIG.INITIAL_SPEED,
          mode + ' hold must not change speed'
        );
        game.rng = origRng;
      }

      armWaiting(MODES.CLASSIC);
      setQaFlag('countUp', true);
      spy.calls.length = 0;
      tick();
      assert(
        spy.calls.includes('00060'),
        'Classic hold paints the 30-frame roll at the Updated marker'
      );
      assert(!spy.calls.includes('00100'), 'Classic hold does not paint the settled Updated score');
      assert(
        !spy.calls.includes('Share TODAY BEST with Copy result'),
        'Classic hold does not draw the Daily hint'
      );
      assertEquals(
        game.qaCountUpHold,
        QA_COUNT_UP_HOLD,
        'Classic still holds long enough to capture'
      );
      assertEquals(Animations.deathAnimFrame, 0, 'Classic hold does not arm the real count-up');
      assertEquals(game.score, 0, 'Classic hold must not write the score');

      armWaiting(MODES.UPDATED);
      setQaFlag('countUp', true);
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
      if (typeof setQaFlag === 'function') setQaFlag('countUp', false);
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
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      armWaiting(MODES.UPDATED);
      setReducedMotion(true);
      setQaFlag('countUp', true);
      spy.calls.length = 0;
      tick();
      assertEquals(game.qaCountUpHold, qaHoldFrames('countUp'), 'the hold uses the shorter window');
      assert(game.qaCountUpHold < QA_COUNT_UP_HOLD, 'the hold is shorter than the full capture');
      assert(qaHoldFrames('countUp') >= 2, 'the hold still lasts long enough to see');
      assertEquals(
        game.qaCountUpHold,
        Math.max(2, Math.round(QA_COUNT_UP_HOLD * 0.5)),
        'reduced motion halves the 180-frame hold'
      );
      assert(spy.calls.includes('00100'), 'the damped hold still shows the settled score');
      assertEquals(spy.alpha(), 0.5, 'reduced motion paints the card at half strength');
      assertEquals(game.score, 0, 'the damped hold must not write the score');
      assertEquals(Animations.deathAnimFrame, 0, 'the damped hold does not arm the real count-up');

      armWaiting(MODES.CLASSIC);
      setReducedMotion(true);
      setQaFlag('countUp', true);
      spy.calls.length = 0;
      tick();
      assert(
        spy.calls.includes('00060'),
        'reduced motion does not switch Classic onto the Updated length'
      );
      assert(!spy.calls.includes('00100'), 'Classic stays on the 30-frame partial score');
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('countUp', false);
      setReducedMotion(false);
      if (game.qaCountUpHold) game.qaCountUpHold = 0;
      if (game.qaCountUpShown) game.qaCountUpShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaCountUp=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyScoreText();
    setPageQuery('?qaCountUp=1');
    try {
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      setQaFlag('countUp', false);
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
      assertEquals(
        Animations.deathAnimFrame,
        0,
        're-reading the flag does not arm the real count-up'
      );
    } finally {
      spy.restore();
      restorePageQuery();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('countUp', false);
      setReducedMotion(false);
      if (game.qaCountUpHold) game.qaCountUpHold = 0;
      if (game.qaCountUpShown) game.qaCountUpShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    if (typeof setQaFlag === 'function') setQaFlag('idle', false);
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
      prompt() {
        return calls.filter((c) => c.text === PROMPT);
      },
      title() {
        return calls.filter((c) => c.text === 'REX RUN');
      },
      restore() {
        ctx.fillText = orig;
      },
    };
  }

  function promptFillAlpha(spy) {
    const row = spy.prompt()[spy.prompt().length - 1];
    if (!row) return NaN;
    const match = /rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/.exec(row.fill || '');
    return match ? Number(match[1]) : NaN;
  }

  it('recognizes only ?qaIdle=1', () => {
    assert(typeof readQaFlag === 'function', 'readQaFlag should parse the playtest query');
    assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
    assert(readQaFlag('idle', '?qaIdle=1') === true, '?qaIdle=1 should hold the idle invite');
    assert(
      readQaFlag('idle', '?qaNight=1&qaIdle=1') === true,
      'the flag should work beside ?qaNight=1'
    );
    assert(readQaFlag('idle', '?qaIdle=1&qaCountUp=1') === true, 'param order should not matter');
    assert(readQaFlag('idle', '') === false, 'a normal visit should leave the live breath');
    assert(readQaFlag('idle', '?qaIdle=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('idle', '?qaIdle=true') === false, 'qaIdle=true must not count as the flag');
    assert(
      readQaFlag('idle', '?qaCountUp=1') === false,
      'the count-up flag must not hold the invite'
    );
  });

  it('holds the quieter peak on the idle card without starting a run', () => {
    const origMode = game.mode;
    const spy = spyPrompt();
    try {
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      assert(QA_IDLE_HOLD >= 120, 'the debug hold must outlast a quick capture');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armIdle(mode);
        const origRng = game.rng;
        let rngCalls = 0;
        game.rng = () => {
          rngCalls++;
          return origRng();
        };
        const speed = game.currentSpeed;
        setQaFlag('idle', true);
        spy.calls.length = 0;
        tick();
        const first = promptFillAlpha(spy);
        const held = game.qaIdleHold;
        tick();
        assertEquals(first, QUIET_PEAK, mode + ' freezes the quieter peak');
        assertEquals(
          promptFillAlpha(spy),
          QUIET_PEAK,
          mode + ' stays on that peak for a second frame'
        );
        assertEquals(
          spy.title()[0] && spy.title()[0].fill,
          'white',
          mode + ' title stays solid white'
        );
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
        assertEquals(
          game.state,
          STATE.WAITING,
          mode + ' Space still leaves idle for the countdown'
        );
        assertEquals(before, STATE.IDLE, mode + ' the hold itself had not already left idle');
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      }
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('idle', false);
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
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      armIdle(MODES.CLASSIC);
      setQaFlag('idle', true);
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
      if (typeof setQaFlag === 'function') setQaFlag('idle', false);
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
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      for (const mode of [MODES.UPDATED, MODES.DAILY]) {
        armIdle(mode);
        setReducedMotion(true);
        setQaFlag('idle', true);
        spy.calls.length = 0;
        tick();
        const first = promptFillAlpha(spy);
        tick();
        assertEquals(game.qaIdleHold, qaHoldFrames('idle'), mode + ' uses the shorter window');
        assert(game.qaIdleHold < QA_IDLE_HOLD, mode + ' hold is shorter than the full capture');
        assert(qaHoldFrames('idle') >= 2, mode + ' hold still lasts long enough to see');
        assertEquals(
          game.qaIdleHold,
          Math.max(2, Math.round(QA_IDLE_HOLD * 0.5)),
          mode + ' reduced motion halves the hold'
        );
        assertEquals(first, HALF_INK, mode + ' paints the static invite at half ink');
        assertEquals(promptFillAlpha(spy), first, mode + ' damped hold does not breathe');
        assert(first < QUIET_MID, mode + ' half ink is quieter than the static midpoint');
        assertEquals(
          spy.title()[0] && spy.title()[0].fill,
          'white',
          mode + ' title stays solid white'
        );
        assertEquals(game.state, STATE.IDLE, mode + ' damped hold does not start the run');
        assertEquals(game.score, 0, mode + ' damped hold must not write the score');
      }

      armIdle(MODES.CLASSIC);
      setReducedMotion(true);
      setQaFlag('idle', true);
      spy.calls.length = 0;
      tick();
      const frame = game.animFrame;
      assertEquals(
        promptFillAlpha(spy),
        classicAlpha(frame),
        'reduced motion does not switch Classic onto the quiet invite'
      );
      assertEquals(
        game.qaIdleHold,
        Math.max(2, Math.round(QA_IDLE_HOLD * 0.5)),
        'Classic still damps the hold length'
      );
    } finally {
      spy.restore();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('idle', false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('resetGame re-reads ?qaIdle=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    const spy = spyPrompt();
    setPageQuery('?qaIdle=1');
    try {
      assert(typeof setQaFlag === 'function', 'setQaFlag should be exposed for tests');
      setQaFlag('idle', false);
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
      restorePageQuery();
      game.mode = origMode;
      if (typeof setQaFlag === 'function') setQaFlag('idle', false);
      setReducedMotion(false);
      if (game.qaIdleHold) game.qaIdleHold = 0;
      if (game.qaIdleShown) game.qaIdleShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA share flag (?qaShare=1)', () => {
  function tick() {
    gameLoop();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
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
    stubElementStyle(shareBtn, { display: 'none' });
    shareBtn.textContent = '📋 Copy result';
    installClassList(shareBtn);
    return shareBtn;
  }

  function restoreButton(orig) {
    const shareBtn = document.getElementById('share-btn');
    restoreElementStyle(shareBtn, orig.style);
    shareBtn.textContent = orig.text;
    if (orig.classList === undefined) delete shareBtn.classList;
    else shareBtn.classList = orig.classList;
  }

  function armDailyWaiting() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    game.mode = MODES.DAILY;
    resetGame();
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    setQaFlag('share', true);
    return prepareButton();
  }

  it('?qaShare=1 is Daily-only and off for any other value', () => {
    assert(
      readQaFlag('share', '?qaShare=1') === true,
      '?qaShare=1 should hold the share confirmation'
    );
    assert(
      readQaFlag('share', '?qaCopy=1&qaShare=1') === true,
      'the flag should work beside other params'
    );
    assert(readQaFlag('share', '?qaShare=0') === false, 'only the value 1 enables the flag');
    assert(readQaFlag('share', '?qaShare=12') === false, 'qaShare=12 must not count as the flag');
    assert(readQaFlag('share', '') === false, 'an empty query leaves the flag off');
    assert(
      readQaFlag('share', '?qaCopy=1') === false,
      'the copy hold must not force the share stub'
    );
    assert(
      readQaFlag('copy', '?qaShare=1') === false,
      'this flag must not hold the clipboard confirmation'
    );
  });

  function settleDailyDeath() {
    game.state = STATE.DEAD;
    Animations.deathShakeFrames = 0;
    Animations.deathAnimFrame = deathAnimFrames();
  }

  it('does not spend the hold on GET READY or the run, then holds Copied on Game Over', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    const origRng = game.rng;
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    let shared = 0;
    let wrote = 0;
    Object.defineProperty(testGlobal, 'navigator', {
      configurable: true,
      writable: true,
      value: {
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
    });
    try {
      setReducedMotion(false);
      const shareBtn = armDailyWaiting();
      const seed = game.runSeed;
      const score = game.score;
      const best = game.dailyBest;
      let rngCalls = 0;
      game.rng = () => {
        rngCalls++;
        return origRng();
      };
      // GET READY is 240 frames. The old latch started on the first Daily
      // frame and the 180-frame window was already gone when Copy result appeared.
      for (let i = 0; i < GAME_CONFIG.GRACE_FRAMES - 1; i++) tick();
      assertEquals(game.state, STATE.WAITING, 'GET READY is still counting down');
      assertEquals(game.qaShareHold, 0, 'GET READY must not start the hold');
      assertEquals(game.qaShareShown, false, 'GET READY must not spend the latch');
      assertEquals(
        shareBtn.textContent,
        '📋 Copy result',
        'the button stays at rest before Game Over'
      );
      assertEquals(game.score, score, 'GET READY must not change the score');
      assertEquals(rngCalls, 0, 'GET READY must not roll game.rng()');
      game.state = STATE.RUNNING;
      game.graceFrames = 0;
      game.obstacles = [];
      game.nextSpawnGap = 1000000;
      for (let i = 0; i < QA_SHARE_HOLD; i++) tick();
      assertEquals(game.state, STATE.RUNNING, 'the run is still going');
      assertEquals(game.qaShareHold, 0, 'the run must not start the hold');
      assertEquals(game.qaShareShown, false, 'the run must not spend the latch');
      const rngBeforeCard = rngCalls;
      const speedAtCard = game.currentSpeed;
      const gapAtCard = game.nextSpawnGap;
      const obstaclesAtCard = game.obstacles.length;
      settleDailyDeath();
      tick();
      assertEquals(game.qaShareHold, QA_SHARE_HOLD, 'Game Over latches the full capture window');
      assertEquals(qaHoldFrames('share'), QA_SHARE_HOLD, 'the helper matches the full window');
      assertEquals(game.qaShareShown, true, 'Game Over spends the latch once');
      assertEquals(shareBtn.style.display, 'block', 'Copied is on the visible Copy result control');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the hold shows the share confirmation');
      assert(shareBtn.classList.contains('is-copied'), 'the hold uses the calmer Copied paint');
      assert(!shareBtn.classList.contains('is-qa-damped'), 'full motion does not damp the paint');
      assertEquals(shared, 0, 'the hold must not open the share sheet');
      assertEquals(wrote, 0, 'the hold must not write the clipboard');
      assertEquals(rngCalls, rngBeforeCard, 'settling the card must not roll game.rng()');
      assertEquals(game.runSeed, seed, 'the hold must not change the run seed');
      assertEquals(game.dailyBest, best, 'the hold must not change today best');
      assertEquals(game.obstacles.length, obstaclesAtCard, 'settling the card must not spawn');
      assertEquals(game.currentSpeed, speedAtCard, 'settling the card must not change speed');
      assertEquals(game.nextSpawnGap, gapAtCard, 'settling the card must not change the spawn gap');
    } finally {
      if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
      game.rng = origRng;
      game.mode = origMode;
      setQaFlag('share', false);
      setReducedMotion(false);
      game.qaShareHold = 0;
      game.qaShareShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('keeps Copied for the whole settled Game Over, not a 3s window', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    let shared = 0;
    let wrote = 0;
    Object.defineProperty(testGlobal, 'navigator', {
      configurable: true,
      writable: true,
      value: {
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
    });
    try {
      setReducedMotion(false);
      const shareBtn = armDailyWaiting();
      settleDailyDeath();
      for (let i = 0; i < QA_SHARE_HOLD + 40; i++) tick();
      assertEquals(game.state, STATE.DEAD, 'the settled screen stays up');
      assert(game.qaShareHold > 0, 'the hold does not burn away while Copy result is up');
      assertEquals(shareBtn.style.display, 'block', 'the control stays visible');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'a late capture still reads Copied');
      assert(shareBtn.classList.contains('is-copied'), 'the Copied paint stays on');
      assertEquals(shared, 0, 'staying on Copied must not open a sheet');
      assertEquals(wrote, 0, 'staying on Copied must not write the clipboard');
      drawGameOverScreen();
      assertEquals(
        shareBtn.textContent,
        '✓ Copied!',
        'Game Over paint must not restore Copy result'
      );
      game.qaShareHold = 0;
      Animations.copyFlashFrames = 0;
      drawGameOverScreen();
      assertEquals(
        shareBtn.textContent,
        '✓ Copied!',
        'the flag keeps Copied even if the frame counter is already spent'
      );
    } finally {
      if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
      game.mode = origMode;
      setQaFlag('share', false);
      setReducedMotion(false);
      game.qaShareHold = 0;
      game.qaShareShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Game Over paint keeps a live Copied flash and a QA hold', () => {
    const origMode = game.mode;
    const origState = game.state;
    const origBtn = buttonSnapshot();
    const origAnim = Animations.deathAnimFrame;
    const origShake = Animations.deathShakeFrames;
    const origFlash = Animations.copyFlashFrames;
    try {
      setReducedMotion(false);
      setQaFlag('share', false);
      game.mode = MODES.DAILY;
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = 0;
      Animations.deathAnimFrame = deathAnimFrames();
      Animations.copyFlashFrames = 40;
      game.qaShareHold = 0;
      game.qaCopyHold = 0;
      const shareBtn = prepareButton();
      shareBtn.style.display = 'block';
      drawGameOverScreen();
      assertEquals(shareBtn.textContent, '✓ Copied!', 'a live flash survives the Game Over paint');
      assert(shareBtn.classList.contains('is-copied'), 'the live flash keeps the Copied paint');
      assert(!shareBtn.classList.contains('is-qa-damped'), 'a real flash is not the QA damp');

      Animations.copyFlashFrames = 0;
      game.qaShareHold = 30;
      setReducedMotion(true);
      setQaFlag('share', true);
      drawGameOverScreen();
      assertEquals(shareBtn.textContent, '✓ Copied!', 'a QA hold survives the Game Over paint');
      assert(
        shareBtn.classList.contains('is-qa-damped'),
        'reduced motion quiets the held confirmation'
      );
    } finally {
      game.mode = origMode;
      game.state = origState;
      Animations.deathAnimFrame = origAnim;
      Animations.deathShakeFrames = origShake;
      Animations.copyFlashFrames = origFlash;
      game.qaShareHold = 0;
      game.qaCopyHold = 0;
      setQaFlag('share', false);
      setReducedMotion(false);
      restoreButton(origBtn);
    }
  });

  it('reduced motion halves the share hold and quiets the ink', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    try {
      setReducedMotion(true);
      const shareBtn = armDailyWaiting();
      settleDailyDeath();
      tick();
      const half = Math.max(2, Math.round(QA_SHARE_HOLD * 0.5));
      assertEquals(game.qaShareHold, half, 'reduced motion halves the 180-frame hold');
      assertEquals(game.qaShareHold, qaHoldFrames('share'), 'the helper matches the damped hold');
      assert(game.qaShareHold < QA_SHARE_HOLD, 'the damped hold is shorter');
      assert(qaHoldFrames('share') >= 2, 'the hold still lasts long enough to see');
      assertEquals(shareBtn.textContent, '✓ Copied!', 'Copied is still readable');
      assert(shareBtn.classList.contains('is-copied'), 'the damped hold still paints Copied');
      assert(shareBtn.classList.contains('is-qa-damped'), 'reduced motion quiets the paint');
      assertEquals(Animations.copyFlashFrames, 0, 'the damped hold does not start the live flash');
    } finally {
      game.mode = origMode;
      setQaFlag('share', false);
      setReducedMotion(false);
      game.qaShareHold = 0;
      game.qaShareShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('Classic and Updated never take the share hold', () => {
    const origMode = game.mode;
    const origBtn = buttonSnapshot();
    try {
      [MODES.CLASSIC, MODES.UPDATED].forEach((mode) => {
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        game.mode = mode;
        resetGame();
        if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
        setQaFlag('share', true);
        const shareBtn = prepareButton();
        tick();
        assertEquals(game.mode, mode, mode + ' stays put — the flag does not enter Daily');
        assertEquals(game.qaShareHold, 0, mode + ' does not start the hold');
        assertEquals(game.qaShareShown, false, mode + ' does not spend the latch');
        game.state = STATE.DEAD;
        Animations.deathShakeFrames = 0;
        Animations.deathAnimFrame = deathAnimFrames();
        tick();
        drawGameOverScreen();
        assertEquals(game.qaShareHold, 0, mode + ' death does not start the hold');
        assertEquals(shareBtn.style.display, 'none', mode + ' does not show Copy result');
        assertEquals(shareBtn.textContent, '📋 Copy result', mode + ' keeps the resting label');
        game.qaShareHold = 0;
        game.qaShareShown = false;
        setQaFlag('share', false);
      });
    } finally {
      game.mode = origMode;
      setQaFlag('share', false);
      game.qaShareHold = 0;
      game.qaShareShown = false;
      restoreButton(origBtn);
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });

  it('a tap under ?qaShare=1 confirms in place and does not open a sheet', () => {
    const shareBtn = document.getElementById('share-btn');
    const handler =
      shareBtn._listeners && shareBtn._listeners.click && shareBtn._listeners.click[0];
    const origFlash = Animations.copyFlashFrames;
    const origText = shareBtn.textContent;
    const classes = installClassList(shareBtn);
    Animations.copyFlashFrames = 0;
    shareBtn.textContent = '📋 Copy result';
    setQaFlag('share', true);
    let shared = 0;
    let wrote = 0;
    const origDesc = Object.getOwnPropertyDescriptor(testGlobal, 'navigator');
    Object.defineProperty(testGlobal, 'navigator', {
      configurable: true,
      writable: true,
      value: {
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
    });
    try {
      setReducedMotion(true);
      handler({ stopPropagation() {} });
      assertEquals(shared, 0, 'the QA flag must not open the system share sheet');
      assertEquals(wrote, 0, 'the QA flag must not write the clipboard');
      assertEquals(
        Animations.copyFlashFrames,
        GAME_CONFIG.COPY_FLASH_FRAMES,
        'the stub path still confirms with the live flash'
      );
      assertEquals(shareBtn.textContent, '✓ Copied!', 'the stub path says Copied');
      assert(classes.contains('is-copied'), 'the stub path paints Copied');
      assert(classes.contains('is-qa-damped'), 'reduced motion quiets the QA confirmation');
      game.mode = MODES.DAILY;
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = 0;
      Animations.deathAnimFrame = deathAnimFrames();
      stubElementStyle(shareBtn, { display: 'block' });
      drawGameOverScreen();
      assertEquals(shareBtn.textContent, '✓ Copied!', 'Game Over paint keeps the tap confirmation');
      assert(classes.contains('is-copied'), 'Game Over paint keeps the Copied class');
      assert(classes.contains('is-qa-damped'), 'Game Over paint keeps the reduced-motion ink');
      assertEquals(shared, 0, 'the redraw must not open the share sheet');
      assertEquals(wrote, 0, 'the redraw must not write the clipboard');
    } finally {
      if (origDesc) Object.defineProperty(testGlobal, 'navigator', origDesc);
      setReducedMotion(false);
      setQaFlag('share', false);
      Animations.copyFlashFrames = origFlash;
      shareBtn.textContent = origText;
    }
  });

  it('resetGame re-reads ?qaShare=1 from the page query', () => {
    const origMode = game.mode;
    const restorePageQuery = savePageQuery();
    try {
      setPageQuery('');
      setQaFlag('share', true);
      game.qaShareShown = true;
      game.qaShareHold = 40;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      game.mode = MODES.DAILY;
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.qaShareHold, 0, 'a visit without the flag clears the hold');
      assertEquals(game.qaShareShown, false, 'a visit without the flag clears the latch');
      setPageQuery('?qaShare=1');
      resetGame();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      gameLoop();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.state, STATE.WAITING, 're-reading the flag still starts on GET READY');
      assertEquals(game.qaShareHold, 0, 'GET READY does not latch the hold');
      assertEquals(game.qaShareShown, false, 'GET READY does not spend the latch');
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = 0;
      Animations.deathAnimFrame = deathAnimFrames();
      gameLoop();
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
      assertEquals(game.qaShareHold, QA_SHARE_HOLD, 'settled Game Over latches the hold');
      assertEquals(game.qaShareShown, true, 'settled Game Over spends the latch');
    } finally {
      restorePageQuery();
      game.mode = origMode;
      setQaFlag('share', false);
      game.qaShareHold = 0;
      game.qaShareShown = false;
      if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    }
  });
});

describe('QA pace readout (?qaHz=1)', () => {
  function cancelLoop() {
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
  }

  it('only qaHz=1 enables the readout', () => {
    assert(readQaFlag('hz', '?qaHz=1') === true, '?qaHz=1 should enable the readout');
    assert(
      readQaFlag('hz', '?foo=1&qaHz=1') === true,
      'the flag should work alongside other params'
    );
    assert(readQaFlag('hz', '') === false, 'a normal visit should leave the readout off');
    assert(readQaFlag('hz', '?qaHz=0') === false, 'only the value 1 enables the readout');
    assert(readQaFlag('hz', '?qaHz=12') === false, 'qaHz=12 must not count as the flag');
    assert(
      readQaFlag('hz', '?other=1') === false,
      'an unrelated param must not enable the readout'
    );
  });

  it('off, the readout draws nothing and does not change a sim step', () => {
    const origFill = ctx.fillText;
    const origState = game.state;
    try {
      setQaFlag('hz', false);
      const texts = [];
      ctx.fillText = (text) => {
        texts.push(String(text));
      };
      drawQaHz();
      assertEquals(texts.length, 0, 'a normal visit must not paint the pace label');

      resetGame();
      cancelLoop();
      setQaFlag('hz', false);
      game.state = STATE.RUNNING;
      game.score = 0;
      gameLoop();
      const offScore = game.score;
      resetGame();
      cancelLoop();
      setQaFlag('hz', true);
      game.state = STATE.RUNNING;
      game.score = 0;
      gameLoop();
      assertEquals(game.score, offScore, 'the flag must not change how far one slice scores');
      assertEquals(offScore, GAME_CONFIG.SCORE_INCREMENT);
    } finally {
      ctx.fillText = origFill;
      setQaFlag('hz', false);
      game.state = origState;
      cancelLoop();
      resetGame();
      cancelLoop();
    }
  });

  it('paints a static label under reduced motion and reports 60/120 after one second', () => {
    const origFill = ctx.fillText;
    const origState = game.state;
    const origMode = game.mode;
    try {
      setReducedMotion(true);
      setQaFlag('hz', true);
      const texts = [];
      ctx.fillText = (text) => {
        texts.push(String(text));
      };
      drawQaHz();
      assertEquals(texts.length, 1, 'reduced motion still shows the readout');
      assertEquals(texts[0], 'sim --  raf --', 'before a full second the rates are not invented');
      assertEquals(qaHzLabel(), 'sim --  raf --');

      setReducedMotion(false);
      game.mode = MODES.CLASSIC;
      resetGame();
      cancelLoop();
      setQaFlag('hz', true);
      game.state = STATE.RUNNING;
      let t = 0;
      for (let i = 0; i <= 120; i++) {
        gameLoop(t);
        t += 1000 / 120;
      }
      assertEquals(qaHzLabel(), 'sim 60  raf 120', 'a 120Hz second should read sim 60 and raf 120');

      resetGame();
      cancelLoop();
      setQaFlag('hz', true);
      game.state = STATE.RUNNING;
      t = 0;
      for (let i = 0; i <= 60; i++) {
        gameLoop(t);
        t += SIM_FRAME_MS;
      }
      assertEquals(qaHzLabel(), 'sim 60  raf 60', 'a 60Hz second should read sim 60 and raf 60');
    } finally {
      ctx.fillText = origFill;
      setReducedMotion(false);
      setQaFlag('hz', false);
      game.mode = origMode;
      game.state = origState;
      cancelLoop();
      resetGame();
      cancelLoop();
    }
  });

  it('resetGame re-reads ?qaHz=1 and a normal visit clears it', () => {
    const restorePageQuery = savePageQuery();
    const origFill = ctx.fillText;
    try {
      setPageQuery('?qaHz=1');
      resetGame();
      cancelLoop();
      const texts = [];
      ctx.fillText = (text) => {
        texts.push(String(text));
      };
      drawQaHz();
      assertEquals(texts[0], 'sim --  raf --', 'the query enables the label after reset');
      setPageQuery('');
      resetGame();
      cancelLoop();
      texts.length = 0;
      drawQaHz();
      assertEquals(texts.length, 0, 'a visit without the flag clears the readout');
    } finally {
      restorePageQuery();
      ctx.fillText = origFill;
      setQaFlag('hz', false);
      cancelLoop();
      resetGame();
      cancelLoop();
    }
  });
});
