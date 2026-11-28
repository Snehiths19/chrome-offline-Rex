// Unit tests: ghost. Ghost Rex: recording the best run, showing it in Daily, the off switch.
// Loaded by tests/unit.test.js (Node) and tests/test-runner.html (browser)
// after tests/harness.js; see tests/unit/files.js for the list and order.

beginTestFile('ghost');

const GHOST_TEST_KEYS = ['dino-ghost', 'dino-ghost-daily', 'dino-ghost-updated'];

// Snapshot the ghost's storage and state, run fn, then put it all back.
function withGhostSandbox(fn) {
  const saved = GHOST_TEST_KEYS.map((k) => [k, safeStorage.get(k)]);
  const orig = {
    mode: game.mode,
    state: game.state,
    highScore: game.highScore,
    dailyBest: game.dailyBest,
    enabled: ghost.enabled,
    rec: ghost.rec,
    best: ghost.best,
    at: ghost.at,
    lost: ghost.lost,
    lostFade: ghost.lostFade,
  };
  try {
    GHOST_TEST_KEYS.forEach((k) => safeStorage.remove(k));
    ghost.enabled = true;
    ghost.at = 0;
    ghost.lost = false;
    ghost.lostFade = 0;
    fn();
  } finally {
    cancelAnimationFrame(game.animationFrameId);
    saved.forEach(([k, v]) => (v === null ? safeStorage.remove(k) : safeStorage.set(k, v)));
    game.mode = orig.mode;
    game.state = orig.state;
    game.highScore = orig.highScore;
    game.dailyBest = orig.dailyBest;
    ghost.enabled = orig.enabled;
    ghost.rec = orig.rec;
    ghost.best = orig.best;
    ghost.at = orig.at;
    ghost.lost = orig.lost;
    ghost.lostFade = orig.lostFade;
  }
}

function ghostStep() {
  gameLoop();
  cancelAnimationFrame(game.animationFrameId);
}

// Start a run in `mode` and play `frames` running sim frames with no input
// (or until it dies). Leaves the game RUNNING or DEAD.
function ghostPlay(mode, frames) {
  cancelAnimationFrame(game.animationFrameId);
  game.mode = mode;
  game.state = STATE.IDLE;
  resetGame();
  let guard = 0;
  while (game.state === STATE.WAITING && guard++ < 1000) ghostStep();
  for (let i = 0; i < frames && game.state === STATE.RUNNING; i++) ghostStep();
}

// A ghost made by hand: `n` samples of height `y` (canvas px) and pose byte `pose`.
function fakeGhost(n, y, pose) {
  const ys = new Uint8Array(n).fill(y + GAME_CONFIG.GHOST_Y_OFFSET);
  const poses = new Uint8Array(n).fill(pose || 0);
  return { score: 100, step: GAME_CONFIG.GHOST_SAMPLE_PX, ys, poses, obs: [] };
}

// An empty recording for this run at `dist` px of road, with obstacles `obs`.
function fakeRec(dist, obs) {
  return {
    dist,
    next: 0,
    ys: [],
    poses: [],
    obs: obs || [],
    seen: new WeakSet(),
    day: dailySeed(),
  };
}

describe('Ghost Rex: where it shows', () => {
  it('shows only in Daily, and records in Updated and Daily, never Classic', () => {
    assert(ghostShowsIn(MODES.DAILY), 'Daily shows the ghost');
    assert(!ghostShowsIn(MODES.UPDATED), 'Updated courses differ every run, so no ghost yet');
    assert(!ghostShowsIn(MODES.CLASSIC), 'Classic never shows a ghost');
    assert(ghostRecordsIn(MODES.DAILY) && ghostRecordsIn(MODES.UPDATED), 'both are recorded');
    assert(!ghostRecordsIn(MODES.CLASSIC), 'Classic records nothing');
  });

  it('a Classic run records nothing and saves no ghost', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.CLASSIC, 30);
      assertEquals(ghost.rec, null, 'no recording in Classic');
      endRun();
      assertEquals(safeStorage.get('dino-ghost-updated'), null, 'nothing saved');
      assertEquals(ghostDrawState(), null, 'nothing drawn');
    });
  });
});

describe('Ghost Rex: recording the best run', () => {
  it('keeps one sample per GHOST_SAMPLE_PX of road travelled', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 60);
      const r = ghost.rec;
      assert(r.dist > 60 * GAME_CONFIG.INITIAL_SPEED - 1, 'distance follows the scroll');
      assertEquals(r.ys.length, Math.floor(r.dist / GAME_CONFIG.GHOST_SAMPLE_PX) + 1);
      assertEquals(r.ys.length, r.poses.length);
    });
  });

  it('a Daily death saves the run, and the next Daily run shows it', () => {
    withGhostSandbox(() => {
      game.dailyBest = 0;
      ghostPlay(MODES.DAILY, 40);
      assertEquals(game.state, STATE.RUNNING);
      endRun();
      const stored = GhostStore.load(MODES.DAILY);
      assert(stored, 'the run is stored');
      assertEquals(stored.score, Math.floor(game.score));
      assertEquals(stored.date, dailySeed(), "stored with today's date");
      assertEquals(stored.seed, game.runSeed, 'keeps the seed for a later race');

      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      assert(ghost.best, 'the next run loads the ghost');
      const s = ghostDrawState();
      assert(s, 'it is drawn on GET READY');
      assertEquals(s.x, dino.x - cfg('GHOST_LAG_PX'), 'a little behind Rex');
      assertEquals(Math.round(s.y), Math.round(dino.y), 'standing on the ground');
    });
  });

  it('only a better run replaces the ghost', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 30);
      ghost.rec.ys.length = 3;
      ghost.rec.poses.length = 3;
      assert(finishGhostRun(200), 'the first run is saved');
      ghostPlay(MODES.DAILY, 30);
      assert(!finishGhostRun(150), 'a worse run is not');
      assert(!finishGhostRun(200), 'a tie is not');
      assertEquals(GhostStore.load(MODES.DAILY).score, 200);
      assert(finishGhostRun(250), 'a better run is');
      assertEquals(GhostStore.load(MODES.DAILY).score, 250);
    });
  });

  it("yesterday's Daily ghost is not shown", () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 30);
      finishGhostRun(300);
      const raw = JSON.parse(safeStorage.get('dino-ghost-daily'));
      raw.date = dailySeed() - 1;
      safeStorage.set('dino-ghost-daily', JSON.stringify(raw));
      assertEquals(GhostStore.load(MODES.DAILY), null);
      resetGame();
      assertEquals(ghost.best, null);
    });
  });

  it('a damaged record reads as no ghost', () => {
    withGhostSandbox(() => {
      safeStorage.set('dino-ghost-daily', '{not json');
      assertEquals(GhostStore.load(MODES.DAILY), null);
      safeStorage.set('dino-ghost-daily', JSON.stringify({ v: 1, score: 5 }));
      assertEquals(GhostStore.load(MODES.DAILY), null);
    });
  });

  it('Updated saves its best but does not show it', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.UPDATED, 60);
      endRun();
      assert(GhostStore.load(MODES.UPDATED), 'stored for a later race');
      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      assertEquals(ghost.best, null, 'not loaded');
      assertEquals(ghostDrawState(), null, 'not drawn');
    });
  });

  it('the ghost never changes the run', () => {
    withGhostSandbox(() => {
      const play = () => {
        replayRunSeed(4242);
        ghostPlay(MODES.DAILY, 400);
        return JSON.stringify({
          score: game.score,
          y: dino.y,
          obs: game.obstacles.map((o) => [o.type, o.x]),
          next: game.nextSpawnGap,
          rng: game.rng(),
        });
      };
      const without = play();
      replayRunSeed(4242);
      ghostPlay(MODES.DAILY, 50);
      finishGhostRun(9999);
      const withGhost = play();
      assert(ghost.best, 'second run had a ghost');
      assertEquals(withGhost, without, 'same score, obstacles, spawn gap and rng');
    });
  });
});

describe('Ghost Rex: following the course', () => {
  it('only a ghost from this very course is shown', () => {
    withGhostSandbox(() => {
      replayRunSeed(111);
      ghostPlay(MODES.DAILY, 30);
      finishGhostRun(50);
      replayRunSeed(222);
      ghostPlay(MODES.DAILY, 10);
      assertEquals(ghost.best, null, 'another seed is another course');
      assert(finishGhostRun(10), 'and its run replaces the old ghost, even with a lower score');
      replayRunSeed(222);
      ghostPlay(MODES.DAILY, 0);
      assert(ghost.best, 'the same seed shows it');
    });
  });

  it('a Daily run is dated by the day it started on', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 30);
      ghost.rec.day = dailySeed() - 1; // started just before midnight UTC
      finishGhostRun(500);
      assertEquals(GhostStore.load(MODES.DAILY), null, "yesterday's course is not today's ghost");
    });
  });

  it('notes where each obstacle spawns on the road', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 200);
      const obs = ghost.rec.obs;
      assert(obs.length >= 1, 'obstacles noted');
      assert(
        obs.every((o, i) => i === 0 || o[1] >= obs[i - 1][1]),
        'in order along the road'
      );
    });
  });

  it('stretches the ghost between matching obstacles (a dash or launch moves them)', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      ghost.best = fakeGhost(1000, 150, 0);
      ghost.best.obs = [
        ['small', 600],
        ['big', 1400],
      ];
      ghost.rec = fakeRec(0, [
        ['small', 600],
        ['big', 1000],
      ]);
      assertEquals(ghostRoadAt(300), 300, 'before the first obstacle, the same road');
      assertEquals(ghostRoadAt(600), 600, 'at the first obstacle');
      assertEquals(ghostRoadAt(800), 1000, 'halfway to the next on both roads');
      assertEquals(ghostRoadAt(1000), 1400, 'at the second obstacle');
      assertEquals(ghostRoadAt(1100), 1500, 'past the last, the same pace');
    });
  });

  it('fades out for good once the courses part ways', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      ghost.best = fakeGhost(1000, 150, 0);
      ghost.best.obs = [['small', 600]];
      const lag = cfg('GHOST_LAG_PX');
      ghost.rec = fakeRec(700 - dino.x + lag, [['big', 600]]);
      const origRm = reducedMotion;
      try {
        setReducedMotion(false);
        updateGhostView();
        assert(ghost.lost, 'lost the trail');
        updateGhostView();
        const s = ghostDrawState();
        assert(s && s.alpha < cfg('GHOST_ALPHA'), 'fading');
        for (let i = 0; i < GAME_CONFIG.GHOST_LOST_FADE_FRAMES; i++) updateGhostView();
        assertEquals(ghostDrawState(), null, 'gone');
        ghost.rec.obs[0][0] = 'small';
        updateGhostView();
        assertEquals(ghostDrawState(), null, 'stays gone for the rest of the run');
      } finally {
        setReducedMotion(origRm);
      }
    });
  });

  it('lines up with the course when the player dashes and the ghost did not', () => {
    withGhostSandbox(() => {
      const playDaily = (dash) => {
        replayRunSeed(20261127);
        ghostPlay(MODES.DAILY, 0);
        let guard = 0;
        while (game.state === STATE.RUNNING && guard++ < 1500) {
          const ahead = game.obstacles
            .filter((o) => o.render !== 'ramp' && o.type !== 'leapGap' && o.x + o.width > dino.x)
            .sort((a, b) => a.x - b.x)[0];
          if (ahead && !dino.isJumping && ahead.x - (dino.x + dino.width) < game.currentSpeed * 8) {
            handleAction();
          }
          if (dash && dino.isJumping && !dino.dashed && dino.velocityY > -1) dashDino();
          ghostStep();
        }
      };
      playDaily(false);
      endRun();
      const theirs = GhostStore.load(MODES.DAILY).o;
      playDaily(true);
      const mine = ghost.rec.obs;
      const n = Math.min(mine.length, theirs.length);
      assert(n >= 3, 'both runs met some obstacles');
      // Check each obstacle while this one and the next match. Past the
      // first one of a different type the courses have parted ways.
      let checked = 0;
      for (let i = 0; i + 1 < n && mine[i + 1][0] === theirs[i + 1][0]; i++) {
        assertEquals(ghostRoadAt(mine[i][1]), theirs[i][1], 'obstacle ' + i + ' lines up');
        checked++;
      }
      assert(checked >= 3, 'several obstacles checked');
    });
  });
});

describe('Ghost Rex: drawing', () => {
  it('places the ghost by distance travelled', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      const g = fakeGhost(100, 150, 0);
      g.ys[20] = 90 + GAME_CONFIG.GHOST_Y_OFFSET;
      g.poses[20] = 1;
      ghost.best = g;
      ghost.rec = fakeRec(20 * g.step + cfg('GHOST_LAG_PX'));
      updateGhostView();
      const s = ghostDrawState();
      assertEquals(s.y, 90, 'the sample for this spot on the road');
      assert(s.img === dino.image, 'airborne pose uses the jump sprite');
    });
  });

  it('past the spot where it fell, it scrolls away, fades and is gone', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      const g = fakeGhost(10, 150, 0);
      ghost.best = g;
      const lag = cfg('GHOST_LAG_PX');
      const end = 9 * g.step + lag;
      ghost.rec = fakeRec(end + 30);
      updateGhostView();
      const s = ghostDrawState();
      assert(s.img === dinoLoseImage, 'shows the fallen sprite');
      assertEquals(s.x, dino.x - lag - 30, 'left where it fell');
      assert(s.alpha < cfg('GHOST_ALPHA') && s.alpha > 0, 'fading');
      ghost.rec.dist = end + cfg('GHOST_FADE_PX');
      updateGhostView();
      assertEquals(ghostDrawState(), null, 'gone');
    });
  });

  it('reduced motion drops the second-jump flip', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      ghost.best = fakeGhost(10, 100, 1 | (12 << 2));
      ghost.rec = fakeRec(0);
      updateGhostView();
      const origRm = reducedMotion;
      try {
        setReducedMotion(false);
        assert(ghostDrawState().angle !== 0, 'flips with motion on');
        setReducedMotion(true);
        assertEquals(ghostDrawState().angle, 0, 'plain under reduced motion');
      } finally {
        setReducedMotion(origRm);
      }
    });
  });

  it('is see-through, drawn before Rex, and leaves globalAlpha as it was', () => {
    withGhostSandbox(() => {
      ghostPlay(MODES.DAILY, 5);
      ghost.best = fakeGhost(100, 150, 0);
      const origDraw = ctx.drawImage;
      const origAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 1;
      const calls = [];
      ctx.drawImage = (img) => calls.push({ img, alpha: ctx.globalAlpha });
      try {
        setQaFlag('spriteRex', true); // the sprite Rex, not the jointed one (M9)
        drawRunning();
      } finally {
        setQaFlag('spriteRex', false);
        ctx.drawImage = origDraw;
      }
      const ghostCall = calls.findIndex((c) => c.alpha === cfg('GHOST_ALPHA'));
      assert(ghostCall >= 0, 'the ghost is painted at GHOST_ALPHA');
      assert(ghostCall < calls.length - 1, 'something (Rex) is painted after it');
      assertEquals(calls[calls.length - 1].alpha, 1, 'Rex is painted solid');
      assertEquals(ctx.globalAlpha, 1, 'alpha put back');
      ctx.globalAlpha = origAlpha;
    });
  });
});

describe('Ghost Rex: off switch', () => {
  it('the ghost button hides the ghost and remembers it', () => {
    withGhostSandbox(() => {
      game.mode = MODES.DAILY;
      ghost.best = fakeGhost(10, 150, 0);
      ghost.rec = fakeRec(0);
      updateGhostView();
      const btn = document.getElementById('ghost-btn');
      const attrs = {};
      const origSet = btn.setAttribute;
      btn.setAttribute = function (name, value) {
        attrs[name] = String(value);
        return origSet.call(this, name, value);
      };
      assert(ghostDrawState(), 'shown while on');
      btn._listeners.click[0]({ stopPropagation() {} });
      assertEquals(ghost.enabled, false);
      assertEquals(attrs['aria-pressed'], 'false');
      assertEquals(safeStorage.get('dino-ghost'), '0', 'kept for next time');
      assertEquals(GhostStore.loadEnabled(), false);
      assertEquals(ghostDrawState(), null, 'hidden');
      btn._listeners.click[0]({ stopPropagation() {} });
      assertEquals(ghost.enabled, true);
      assertEquals(attrs['aria-pressed'], 'true');
      assertEquals(GhostStore.loadEnabled(), true);
      btn.setAttribute = origSet;
    });
  });

  it('defaults to on', () => {
    withGhostSandbox(() => {
      assertEquals(GhostStore.loadEnabled(), true);
    });
  });
});
