// Unit tests: spawning. Which obstacles appear, and the gaps between them.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('spawning');

describe('Obstacle Spawning & Movement', () => {
  it('should add an obstacle to the array when spawnObstacle is called', () => {
    resetGame();
    assertEquals(game.obstacles.length, 0, 'Obstacles array should be initially empty');
    spawnObstacle();
    assertEquals(game.obstacles.length, 1, 'Obstacle should be added to array');
    assertEquals(
      game.obstacles[0].x,
      GAME_CONFIG.CANVAS_W,
      'Obstacle should spawn at the right edge'
    );
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
    assert(
      game.obstacles[0].x < initialObstacleX,
      `Obstacle X (${game.obstacles[0].x}) should be less than initial X (${initialObstacleX})`
    );
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
        (DifficultyProfile.speedAtScore(0) - GAME_CONFIG.INITIAL_SPEED) *
          GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
    );
    assertEquals(
      game.nextSpawnGap,
      expectedGap,
      `Next gap should be ${expectedGap} at speedAtScore(0) with zero jitter`
    );

    // Frame 2: obstacle hasn't drifted far enough yet — not a spawn frame.
    gameLoop();
    cancelAnimationFrame(game.animationFrameId);
    assertEquals(
      game.obstacles.length,
      1,
      `Should still be 1 obstacle — ${expectedGap}px gap not met`
    );

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
    scores.forEach((score) => {
      const speed = DifficultyProfile.speedAtScore(score);
      const baseGap = Math.max(
        GAME_CONFIG.MIN_SPAWN_GAP,
        GAME_CONFIG.MAX_SPAWN_GAP -
          (speed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR
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
    for (let i = 0; i < 50; i++)
      gaps.add(DifficultyProfile.nextObstacle(100, MODES.UPDATED, rng).gap);
    assert(
      gaps.size >= 5,
      `Expected gap variety; got ${gaps.size} distinct values across 50 draws`
    );
  });

  it('smallest achievable gap is still at least MIN_SPAWN_GAP (always clearable)', () => {
    // Force rng to 0 → maximum negative jitter on the gap roll.
    const worstCaseRng = () => 0;
    const { gap } = DifficultyProfile.nextObstacle(500, MODES.UPDATED, worstCaseRng);
    assert(
      gap >= GAME_CONFIG.MIN_SPAWN_GAP,
      `At max negative jitter + near-plateau speed, gap ${gap} must be >= MIN_SPAWN_GAP ${GAME_CONFIG.MIN_SPAWN_GAP}`
    );
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
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'cluster');
    // One jump, plus the frames a cluster occupies at this speed, plus a short read.
    return jumpAirtimeFrames() + cluster.width / speed + 12;
  }

  it('updated zero-jitter gap grows with speed from 450 to 640', () => {
    const g450 = zeroJitterGap(450, MODES.UPDATED);
    const g640 = zeroJitterGap(640, MODES.UPDATED);
    assert(
      g640 > g450,
      `Gap at 640 (${g640}) should exceed gap at 450 (${g450}) so time-between holds as speed rises`
    );
  });

  it('updated zero-jitter time between obstacles holds from 450 through 640', () => {
    const timeAt = (score) =>
      zeroJitterGap(score, MODES.UPDATED) / DifficultyProfile.speedAtScore(score);
    const t450 = timeAt(450);
    const t640 = timeAt(640);
    const ratio = t640 / t450;
    assert(
      ratio > 0.95 && ratio < 1.05,
      `Time-between should stay level as speed rises; 450=${t450.toFixed(1)}f 640=${t640.toFixed(1)}f ratio=${ratio.toFixed(3)}`
    );
  });

  it('updated worst-case gap stays above one focused jump from 300 through 640', () => {
    for (const score of [300, 450, 640]) {
      const speed = DifficultyProfile.speedAtScore(score);
      const frames = worstGap(score, MODES.UPDATED) / speed;
      const minFrames = focusedJumpFrames(score);
      assert(
        frames >= minFrames,
        `Score ${score}: worst gap ${frames.toFixed(1)}f should be >= ${minFrames.toFixed(1)}f`
      );
      assert(
        frames + 1e-6 >= GAME_CONFIG.UPDATED_MIN_GAP_FRAMES,
        `Score ${score}: worst gap ${frames.toFixed(1)}f should hold UPDATED_MIN_GAP_FRAMES (${GAME_CONFIG.UPDATED_MIN_GAP_FRAMES})`
      );
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
    assert(
      wide > 900,
      `Max jitter at score 640 (${wide}) should pass the old 900px spawn sentinel`
    );

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
    assert(
      frame !== null,
      `A ${wide}px gap must still produce another obstacle after the sprite leaves`
    );
    assert(
      Math.abs(frame - expected) <= 2,
      `Spawn landed on frame ${frame}; a ${wide}px gap at speed ${speed.toFixed(2)} should take about ${expected.toFixed(1)} frames, not the screen-exit clip`
    );

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
      assert(
        updated > classic,
        `Score ${score}: updated gap ${updated} should be wider than classic ${classic}`
      );
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
      for (let i = 0; i < 20; i++)
        gaps.push(DifficultyProfile.nextObstacle(450, MODES.UPDATED, rng).gap);
      return gaps.join(',');
    };
    assertEquals(seq(20260927), seq(20260927), 'Same seed must replay the same gaps');
    assert(seq(1) !== seq(2), 'Different seeds should not collapse to one gap');
  });

  it('updated gaps are whole pixels, including the speed-scaled floor', () => {
    for (const score of [0, 300, 400, 450, 640]) {
      const gap = worstGap(score, MODES.UPDATED);
      assertEquals(
        gap,
        Math.round(gap),
        `Worst gap at score ${score} should be an integer, got ${gap}`
      );
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
    for (let i = 0; i < 400; i++)
      gaps.push(DifficultyProfile.nextObstacle(450, MODES.UPDATED, rng).gap);
    const slammed = gaps.filter((g) => g <= GAME_CONFIG.MIN_SPAWN_GAP + 1).length / gaps.length;
    assert(
      slammed < 0.05,
      `Only ${(slammed * 100).toFixed(1)}% of gaps should sit on MIN_SPAWN_GAP; got a floor pile-up`
    );
    gaps.sort((a, b) => a - b);
    const tightest = gaps[0];
    const median = gaps[Math.floor(gaps.length / 2)];
    assert(
      median >= tightest * 1.1,
      `Median gap ${median} should sit above the tightest gap ${tightest}`
    );
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
    for (let i = 0; i < 500; i++)
      seen.add(DifficultyProfile.nextObstacle(150, MODES.UPDATED, rng).type.id);
    assert(
      seen.has('small') && seen.has('big'),
      `Expected small+big at score 150, saw ${[...seen]}`
    );
    assert(!seen.has('cluster'), `Cluster should not appear before score 250, saw ${[...seen]}`);
  });

  it('can return all three types at score 250+', () => {
    const rng = mulberry32(3);
    const seen = new Set();
    for (let i = 0; i < 2000; i++)
      seen.add(DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng).type.id);
    assert(
      seen.has('small') && seen.has('big') && seen.has('cluster'),
      `Expected all 3 types at score 300, saw ${[...seen]}`
    );
  });

  it('weighted distribution at score 300 is within 5% of declared weights', () => {
    const rng = mulberry32(4);
    const eligible = GAME_CONFIG.OBSTACLE_TYPES.filter((t) => t.unlockScore <= 300);
    const weightSum = eligible.reduce((s, t) => s + t.weight, 0);
    const counts = {};
    const expected = {};
    for (const t of eligible) {
      counts[t.id] = 0;
      expected[t.id] = t.weight / weightSum;
    }
    const total = 20000;
    for (let i = 0; i < total; i++)
      counts[DifficultyProfile.nextObstacle(300, MODES.UPDATED, rng).type.id]++;
    Object.keys(expected).forEach((id) => {
      const observed = counts[id] / total;
      assert(
        Math.abs(observed - expected[id]) < 0.05,
        `${id}: expected ~${expected[id]}, got ${observed.toFixed(3)}`
      );
    });
  });

  it('spawnObstacle(type) respects the given type dimensions', () => {
    resetGame();
    const big = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');
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
    assertEquals(
      game.obstacles[0].type,
      'small',
      'Classic bare spawnObstacle() must not roll cluster'
    );
    game.mode = origMode;
    resetGame();
  });

  it('cluster draws two full small sprites with a visible gap', () => {
    resetGame();
    const cluster = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'cluster');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'small');
    // Draw-only change: hitbox, unlock, and weight stay on GAME_CONFIG.
    assertEquals(cluster.width, 50, 'cluster hitbox width stays 50');
    assertEquals(cluster.height, 40, 'cluster hitbox height stays 40');
    assertEquals(cluster.unlockScore, 250, 'cluster still unlocks at 250');
    assertEquals(cluster.weight, 20, 'cluster weight stays 20');

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
    assertEquals(gap, small.width, 'Sky between the two cacti is one small cactus wide');
    assert(
      gap < GAME_CONFIG.DINO_WIDTH,
      'The gap stays narrower than the dino, so it is not a lane to thread'
    );

    const hitLeft = 100;
    const hitRight = 100 + cluster.width;
    const overhangLeft = hitLeft - first[1];
    const overhangRight = second[1] + second[3] - hitRight;
    assert(
      overhangLeft > 0 && overhangRight > 0,
      'The pair is wider than the hitbox so the gap can open without shrinking either sprite'
    );
    assertEquals(
      overhangLeft,
      overhangRight,
      'The pair overhangs the hitbox equally on both sides'
    );
    assert(
      first[1] + first[3] >= hitLeft && second[1] <= hitRight,
      'The sky between the cacti sits inside the hitbox, so it is not a sneak-through'
    );
  });

  it('a single cactus still draws once at its own size', () => {
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
    const big = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');
    const small = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'small');
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
    const paintW = Math.round((paintH * 34) / 70);
    const paintX = 80 + Math.floor((big.width - paintW) / 2);

    game.obstacles = [
      {
        x: 80,
        y: 120,
        width: big.width,
        height: big.height,
        render: big.render,
        type: big.id,
      },
      {
        x: 200,
        y: 140,
        width: small.width,
        height: small.height,
        render: small.render,
        type: small.id,
      },
    ];
    const calls = [];
    const smoothing = [];
    const origDrawImage = ctx.drawImage;
    const origSmoothing = ctx.imageSmoothingEnabled;
    const origBitmapW = canvas.width;
    const origBitmapH = canvas.height;
    // Device-pixel snap uses the bitmap. Pin 1:1 with the logical board so
    // the expected x is the game-space center, not the shell's boot scale.
    canvas.width = GAME_CONFIG.CANVAS_W;
    canvas.height = GAME_CONFIG.CANVAS_H;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage = (...args) => {
      calls.push(args.slice());
      smoothing.push(ctx.imageSmoothingEnabled);
    };
    drawObstacles();
    const smoothingAfter = ctx.imageSmoothingEnabled;
    ctx.drawImage = origDrawImage;
    canvas.width = origBitmapW;
    canvas.height = origBitmapH;
    if (origSmoothing === undefined) delete ctx.imageSmoothingEnabled;
    else ctx.imageSmoothingEnabled = origSmoothing;
    const placed = game.obstacles[0];
    game.obstacles = [];

    assertEquals(placed.width, 30, 'Drawing does not resize the hitbox width');
    assertEquals(placed.height, 55, 'Drawing does not resize the hitbox height');
    assertEquals(calls.length, 2, 'Big and small each paint once');
    assertEquals(
      smoothing[0],
      false,
      'The tall cactus uses nearest-neighbor so the arms stay sharp'
    );
    assertEquals(calls[0][1], paintX, 'The tall cactus is centered on its hitbox');
    assertEquals(calls[0][2], 120, 'The tall cactus top stays on the hitbox top');
    assertEquals(
      calls[0][3],
      paintW,
      'Paint width follows the cactus sprite, not the wider hitbox'
    );
    assertEquals(
      calls[0][4],
      paintH,
      'Paint height matches the hitbox so the jump line stays honest'
    );
    assert(paintW < big.width, 'The tall cactus is not stretched out to the hitbox width');
    assert(paintH > small.height, 'The tall cactus is visibly taller than the small one');
    assertEquals(smoothing[1], true, 'A nearby small cactus keeps the normal smooth scale');
    assertEquals(calls[1][3], small.width, 'Small cactus width is unchanged');
    assertEquals(calls[1][4], small.height, 'Small cactus height is unchanged');
    assertEquals(smoothingAfter, true, 'Nearest-neighbor must not leak onto the next sprite');
  });
});
