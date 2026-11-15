// == SECTION 8: GAME LOOP ==

// The page behind the canvas follows the sky colour. Writing body.style makes
// the browser recalculate page styles, so remember the last colour written and
// skip the write while the sky holds still. Most of a run is one colour.
let lastPageBackground = null;
function setPageBackground(color) {
  if (typeof document === 'undefined' || !document.body) return;
  if (color === lastPageBackground) return;
  lastPageBackground = color;
  document.body.style.background = color;
}

function resetGame() {
  const restartAfterDeath = game.state === STATE.DEAD;
  // Drop any hitch that piled up on the previous run so the first frames
  // of this one are not a catch-up burst.
  resetSimClock();
  resetQaHzMeter();
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;
  dino.jumpBufferFrames = 0;

  Particles.reset();

  game.obstacles.length = 0;
  game.stars.length = 0;
  game.score = 0;
  game.animFrame = 0;
  game.groundX = 0;
  game.currentSpeed = GAME_CONFIG.INITIAL_SPEED;
  game.lastObstacleX = -300;
  game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  game.state = STATE.WAITING;
  game.pauseHidden = false;
  game.resumeFrames = 0;
  if (restartAfterDeath) game.countdownSkippable = true;
  game.starsInitialised = false;
  game.starFadeFrames = 0;
  Animations.reset();
  game.newBestShown = false;
  game.plateauCueShown = false;
  Object.assign(game, initialQaHolds());
  game.qaCountUpShareCleared = false;
  // QA/debug only. Re-read so a mode toggle still honors the page query.
  readQaFlags();
  applyQaSafeShell();
  game.isNewBest = false;
  game.previousHighScore = 0;
  game.isNewTodayBest = false;
  game.previousDailyBest = 0;
  game.lastGaps = [];
  game.lastObstacleTypes = [];
  game.lastJumpFrame = null;
  game.deathLog = null;
  game.runSeed = takeRunSeed();
  game.rng = mulberry32(game.runSeed);
  game.dailyBest = ScoreStore.loadDailyBest();
  const shareBtnEl = document.getElementById('share-btn');
  if (shareBtnEl && shareBtnEl.style) shareBtnEl.style.display = 'none';
  markShareCopied(shareBtnEl, false, false);
  game.nextSpawnGap = computeNextSpawnGap(
    game.rng,
    DifficultyProfile.speedAtScore(game.score),
    game.mode
  );
  initClouds();
  initHills();
  const ready = game.countdownSkippable ? 'Get ready. Press space or tap to start.' : 'Get ready.';
  announce(isDailyMode() ? ready + ' ' + dailyPreRunLine() + '.' : ready);
  setPageBackground('');
}

// Classic reads the original shake keys. Updated and Daily read the quieter
// trio. A tune outside the shipped Classic range falls back, so a typo cannot
// yank harder than today's Classic shake. Frames stay whole numbers in
// 1..DEATH_SHAKE_FRAMES so a fraction cannot add an extra wobble.
function updatedDeathShakeFrames() {
  const tuned = cfg('UPDATED_DEATH_SHAKE_FRAMES');
  const cap = GAME_CONFIG.DEATH_SHAKE_FRAMES;
  if (typeof tuned === 'number' && tuned >= 1 && tuned <= cap && Math.floor(tuned) === tuned) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_DEATH_SHAKE_FRAMES;
}

function deathShakeFrameCount() {
  if (!isUpdatedMode()) return GAME_CONFIG.DEATH_SHAKE_FRAMES;
  return updatedDeathShakeFrames();
}

// Updated and Daily ease the score across the same frames as the death
// shake. Classic does not start the pop; the 12-frame count stays for that
// length only.
function scorePopWindow() {
  if (isUpdatedMode()) return updatedDeathShakeFrames();
  return GAME_CONFIG.SCORE_POP_FRAMES;
}

function deathShakeAmplitude() {
  if (!isUpdatedMode()) return cfg('DEATH_SHAKE_AMPLITUDE');
  const tuned = cfg('UPDATED_DEATH_SHAKE_AMPLITUDE');
  if (typeof tuned === 'number' && tuned >= 0 && tuned <= GAME_CONFIG.DEATH_SHAKE_AMPLITUDE) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_DEATH_SHAKE_AMPLITUDE;
}

// Classic reads the stored count-up directly. Updated and Daily read the
// quieter length through cfg(), then halve it under reduced motion. A tune
// outside 1..DEATH_ANIM_FRAMES, or a non-integer, falls back to 18 so a
// typo cannot run longer than Classic or drop the roll. Gates and the
// score denominator both use this, so the hint cannot lag the number.
function updatedDeathAnimFrames() {
  const tuned = cfg('UPDATED_DEATH_ANIM_FRAMES');
  const cap = GAME_CONFIG.DEATH_ANIM_FRAMES;
  if (typeof tuned === 'number' && tuned >= 1 && tuned <= cap && Math.floor(tuned) === tuned) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_DEATH_ANIM_FRAMES;
}

function deathAnimFrames() {
  if (!isUpdatedMode()) return GAME_CONFIG.DEATH_ANIM_FRAMES;
  let frames = updatedDeathAnimFrames();
  if (reducedMotion) frames = Math.max(2, Math.round(frames * 0.5));
  return frames;
}

function deathShakeFreq() {
  if (!isUpdatedMode()) return cfg('DEATH_SHAKE_FREQ');
  const tuned = cfg('UPDATED_DEATH_SHAKE_FREQ');
  if (typeof tuned === 'number' && tuned >= 0 && tuned <= GAME_CONFIG.DEATH_SHAKE_FREQ) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_DEATH_SHAKE_FREQ;
}

// Each state has an update step (sim only: counters, physics, spawning,
// scoring, collision, emits) and a draw step (canvas and page paint only).
// gameLoop runs one update per owed 60Hz slice, then draws once. handleX()
// runs one update then one draw, the same as a one-slice frame.

function updateDead() {
  if (Animations.deathShakeFrames > 0) {
    Particles.update();
    if (Animations.deathFlashFrames > 0) Animations.deathFlashFrames--;
    if (Animations.scorePopFrames > 0) Animations.scorePopFrames--;
    Animations.deathShakeFrames--;
  } else if (Animations.deathAnimFrame < deathAnimFrames()) {
    Animations.deathAnimFrame++;
  } else if (Animations.copyFlashFrames > 0) {
    Animations.copyFlashFrames--;
  }
}

function drawDead() {
  if (Animations.deathShakeFrames > 0) {
    ctx.save();
    ctx.translate(
      Math.sin(Animations.deathShakeFrames * deathShakeFreq()) * deathShakeAmplitude(),
      0
    );
    drawBackground();
    drawHills();
    drawGround();
    drawClouds();
    drawObstacles();
    Particles.draw();
    drawDino();
    drawScore();
    ctx.restore();
    drawDeathFlash(); // white flash drawn outside the shake transform so it stays canvas-aligned
  } else {
    drawGameOverScreen();
  }
}

function updateIdle() {
  game.animFrame++;
  updateClouds();
}

function drawIdle() {
  drawBackground();
  setPageBackground(getBackgroundColor(game.score));
  drawHills();
  drawGround();
  drawClouds();
  drawDino();
  drawIdleScreen();
}

function updateWaiting() {
  game.graceFrames--;
  game.animFrame++;
  if (game.graceFrames <= 0) {
    game.state = STATE.RUNNING;
    announce('Go!');
  }
  updateClouds();
}

function drawWaiting() {
  drawBackground();
  setPageBackground(getBackgroundColor(game.score));
  drawHills();
  drawGround();
  drawClouds();
  drawDino();
  drawScore();
  drawGetReadyOverlay();
}

function updateRunning() {
  // The LEVEL wash and NEW BEST badge count down once per slice, before
  // anything can start them again, so a fresh start paints its full first
  // frame and the draw (once per display frame) never moves a timer.
  if (Animations.milestoneFrames > 0) Animations.milestoneFrames--;
  if (Animations.newBestFrames > 0) Animations.newBestFrames--;

  const prevLevel = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.score += GAME_CONFIG.SCORE_INCREMENT;
  game.animFrame++;

  const level = Math.floor(game.score / GAME_CONFIG.SCORE_PER_LEVEL);
  game.currentSpeed = DifficultyProfile.speedAtScore(game.score);

  // Milestone flash on level-up.
  let latchedQaLevel = false;
  if (level > prevLevel && level > 0) {
    game.milestoneText = 'LEVEL ' + (level + 1);
    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    audio.milestone();
    Particles.emit(
      'confetti',
      GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30,
      GAME_CONFIG.SCORE_Y
    );
  } else if (qa.level && isUpdatedMode() && !game.qaLevelShown) {
    // QA/debug only. Same wash as the first real level, once, while the
    // score is still near zero. The hold keeps the quiet word up after
    // that fade. Does not touch speed, gaps, or game.rng().
    game.qaLevelShown = true;
    game.milestoneText = 'LEVEL 2';
    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    audio.milestone();
    Particles.emit(
      'confetti',
      GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30,
      GAME_CONFIG.SCORE_Y
    );
    game.qaLevelHold = qaHoldFrames('level');
    latchedQaLevel = true;
  }
  if (!latchedQaLevel && game.qaLevelHold > 0) game.qaLevelHold--;

  // QA/debug only — not for players. Latch a hold on the first Updated
  // or Daily running frame. The paint is drawQaConfetti(), from this
  // counter, not from a particle emit. A normal visit waits for the real
  // level and keeps the small #ffd700 kind. Classic never enters.
  // Does not change speed, gaps, scoring, or game.rng(). Reduced motion
  // latches the shorter hold.
  if (qa.confetti && isUpdatedMode() && !game.qaConfettiShown) {
    game.qaConfettiShown = true;
    game.qaConfettiHold = qaHoldFrames('confetti');
  } else if (game.qaConfettiHold > 0) {
    game.qaConfettiHold--;
  }

  // Scroll ground.
  game.groundX -= game.currentSpeed;
  if (imageReady(groundImage) && game.groundX <= -groundImage.width) game.groundX = 0;

  // Lazy-init stars once when night is full. Skipped under reduce-motion
  // (no init, same as before). Opacity then ramps across the mode's fade
  // length so the field eases in instead of popping on. Updated and Daily
  // use the shorter length, so the brightening ramp settles sooner and
  // does not linger over the obstacle lane. Classic uses STAR_FADE_FRAMES
  // and holds full white. Positions stay Math.random() — cosmetic, and
  // this block does not touch game.rng().
  if (
    !reducedMotion &&
    scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_END &&
    !game.starsInitialised
  ) {
    for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
      game.stars.push({
        x: Math.random() * GAME_CONFIG.CANVAS_W,
        y: Math.random() * GAME_CONFIG.STAR_Y_RANGE,
      });
    }
    game.starsInitialised = true;
    game.starFadeFrames = 0;
  }
  if (game.starsInitialised && game.starFadeFrames < starFadeFrameCount()) {
    game.starFadeFrames++;
  }

  runFeatureUpdates(); // updateHills, updateClouds, Particles.update
  updateObstacles();

  // Plateau cue: one puff at the dino's heel, off the obstacle lane.
  // Production waits for 98% of plateau speed (~score 641) and uses the pale
  // night kind. QA/debug only — not for players: ?qaPlateau=1 fires at score 1.
  // Day emits the dark kind just behind the sprite. ?qaNight=1 emits the pale
  // production kind at the heel. Either way the held cluster is what stays
  // on screen when motion is allowed — the pale life is 12 frames and can
  // sit under the sprite. Reduced motion shortens that hold and draws fewer,
  // softer specks.
  // Classic never enters. Particles.emit uses Math.random(), not game.rng().
  const plateauReached = qa.plateau
    ? game.score >= QA_PLATEAU_SCORE
    : game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.PLATEAU_REACH_RATIO;
  if (isUpdatedMode() && !game.plateauCueShown && plateauReached) {
    game.plateauCueShown = true;
    if (qa.plateau) {
      game.qaPlateauHold = qaHoldFrames('plateau');
      if (qa.night) {
        Particles.emit('plateau', dino.x + 4, dino.y + dino.height - 4);
      } else {
        Particles.emit('plateauQa', dino.x - 8, dino.y + dino.height - 8);
      }
    } else {
      Particles.emit('plateau', dino.x + 4, dino.y + dino.height - 4);
    }
  } else if (game.qaPlateauHold > 0) {
    game.qaPlateauHold--;
  }

  // Heel trail: one quiet grey mote per frame once speed is near the
  // plateau, at the heel so late-run Atmosphere stays off the obstacle
  // lane. QA/debug only — not for players: ?qaTrail=1 emits that same
  // whisper from the first Updated/Daily frame. Pair with ?qaNight=1 to
  // see it on the night sky. Classic never enters. Particles.emit uses
  // Math.random(), not game.rng(). The flag does not change speed, gaps,
  // or scoring.
  const trailOn =
    qa.trail || game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.TRAIL_SPEED_RATIO;
  if (isUpdatedMode() && trailOn) {
    Particles.emit('trail', dino.x + 4, dino.y + dino.height - 4);
  }

  // Obstacle spawning — Updated/Daily precompute a jittered gap that scales
  // with speed once the shrinking curve would outrun a jump. Classic stays
  // deterministic. DifficultyProfile.nextObstacle() picks type + gap together.
  if (game.lastObstacleX <= GAME_CONFIG.CANVAS_W - game.nextSpawnGap) {
    const consumedGap = game.nextSpawnGap;
    const params = DifficultyProfile.nextObstacle(game.score, game.mode, game.rng);
    // ?qaCluster=1 / ?qaBig=1 may replace this one type. The roll above already ran.
    const type = qaBigOverride(qaClusterOverride(params.type));
    spawnObstacle(type);
    noteSpawnForDeathLog(consumedGap, type.id, game.currentSpeed);
    game.lastObstacleX = GAME_CONFIG.CANVAS_W;
    game.nextSpawnGap = params.gap;
  }

  // Collision detection.
  for (let i = 0; i < game.obstacles.length; i++) {
    if (checkCollision(dino, game.obstacles[i])) {
      game.state = STATE.DEAD;
      Animations.deathShakeFrames = deathShakeFrameCount();
      // PR-C: white flash + score pop, mode-gated. Reduce-motion caps flash to 1 frame.
      // The pop window matches the shake so Game Over does not open mid-scale.
      if (isUpdatedMode()) {
        Animations.deathFlashFrames = reducedMotion ? 1 : GAME_CONFIG.DEATH_FLASH_FRAMES;
        Animations.scorePopFrames = reducedMotion ? 0 : scorePopWindow();
      }
      Particles.emit('collision', dino.x + dino.width / 2, dino.y + dino.height / 2);
      audio.death();
      const finalScore = Math.floor(game.score);
      const runResult = computeRunResult(finalScore, game.highScore);
      game.isNewBest = runResult.isNewBest;
      game.previousHighScore = runResult.previousHighScore;
      if (finalScore > game.highScore) {
        game.highScore = finalScore;
        ScoreStore.saveHighScore(game.highScore);
      }
      if (isDailyMode()) {
        // Compare before saving, same as computeRunResult / isNewBest.
        // A tie is not a new today best. No prior today best (0) is.
        const todayResult = computeRunResult(finalScore, game.dailyBest);
        game.isNewTodayBest = todayResult.isNewBest;
        game.previousDailyBest = todayResult.previousHighScore;
        ScoreStore.saveDailyBest(finalScore);
        game.dailyBest = ScoreStore.loadDailyBest();
      } else {
        game.isNewTodayBest = false;
        game.previousDailyBest = 0;
      }
      const todayLine = game.isNewTodayBest ? 'New today best ' : 'Today best ';
      announce(
        isDailyMode()
          ? 'Game over. Score ' +
              finalScore +
              '. ' +
              todayLine +
              game.dailyBest +
              '. ' +
              DAILY_DEATH_HINT +
              '. Press space to restart.'
          : 'Game over. Score ' +
              finalScore +
              '. High score ' +
              game.highScore +
              '. Press space to restart.'
      );
      if (runDebug) publishRunSnapshot(buildRunSnapshot('death'));
      return;
    }
  }

  // Apply gravity.
  if (dino.isJumping) {
    dino.velocityY += dino.gravity;
    dino.y += dino.velocityY;

    if (dino.y >= GAME_CONFIG.CANVAS_H - dino.height) {
      dino.y = GAME_CONFIG.CANVAS_H - dino.height;
      dino.isJumping = false;
      dino.velocityY = 0;
      Particles.emit('land', dino.x + dino.width / 2, dino.y + dino.height);
      audio.land();
      // A press kept from the last few airborne frames jumps on this frame.
      if (dino.jumpBufferFrames > 0) {
        dino.jumpBufferFrames = 0;
        jump();
      }
    } else if (dino.jumpBufferFrames > 0) {
      dino.jumpBufferFrames--;
    }
  }

  // NEW BEST badge — first time this run's score exceeds the stored high score.
  // Updated and Daily start the shorter quiet countdown. Classic keeps
  // NEW_BEST_FRAMES, read here directly, not through cfg().
  if (!game.newBestShown && game.highScore > 0 && Math.floor(game.score) > game.highScore) {
    game.newBestShown = true;
    Animations.newBestFrames = newBestDuration();
    announce('New best score!');
  }
}

function drawRunning() {
  drawBackground();
  setPageBackground(getBackgroundColor(game.score));
  runFeatureDraws('background'); // drawHills, drawClouds
  drawGround();
  drawObstacles();
  runFeatureDraws('foreground'); // Particles.draw
  drawDino();
  drawScore();
  runFeatureDraws('overlay'); // drawSkyTint
  drawMilestoneFlash();
  drawNewBestBadge();
}

// The update and draw step for each state. A slice runs the update for the
// state the game is in; the draw then paints whatever state it ended in, so
// the slice that dies already paints the death shake.
// Pause (F2). Hiding the page mid-run (switching apps or tabs) holds the
// run in PAUSED. Nothing moves while hidden. Back on the page, a short
// countdown runs, then the run carries on exactly where it stopped: score,
// speed, spawn timing, the dino's arc and game.rng() are untouched, and a
// press during the countdown skips nothing. The loop keeps running, so no
// restart and no cancelAnimationFrame is needed.
function pauseRun() {
  if (game.state !== STATE.RUNNING) return false;
  game.state = STATE.PAUSED;
  game.pauseHidden = true;
  game.resumeFrames = GAME_CONFIG.RESUME_COUNTDOWN_FRAMES;
  announce('Paused.');
  return true;
}

function resumeRun() {
  if (game.state !== STATE.PAUSED || !game.pauseHidden) return false;
  game.pauseHidden = false;
  game.resumeFrames = GAME_CONFIG.RESUME_COUNTDOWN_FRAMES;
  // Time spent hidden is not owed to the countdown.
  resetSimClock();
  announce('Back. Resuming in ' + resumeCountdownNumber() + '.');
  return true;
}

// The whole seconds left on the resume countdown: 3, 2, 1.
function resumeCountdownNumber() {
  return Math.ceil(game.resumeFrames / 60);
}

function updatePaused() {
  if (game.pauseHidden) return;
  game.resumeFrames--;
  if (game.resumeFrames <= 0) {
    game.resumeFrames = 0;
    game.state = STATE.RUNNING;
    announce('Go!');
  }
}

function drawPaused() {
  drawRunning();
  drawResumeOverlay();
}

const STATE_STEPS = {
  [STATE.IDLE]: { update: updateIdle, draw: drawIdle },
  [STATE.WAITING]: { update: updateWaiting, draw: drawWaiting },
  [STATE.RUNNING]: { update: updateRunning, draw: drawRunning },
  [STATE.PAUSED]: { update: updatePaused, draw: drawPaused },
  [STATE.DEAD]: { update: updateDead, draw: drawDead },
};

// One update then one draw: what a frame that owes a single slice does.
// Tests drive states through these.
function handleIdle() {
  runSimFrame();
  drawFrame();
}
function handleWaiting() {
  runSimFrame();
  drawFrame();
}
function handleRunning() {
  runSimFrame();
  drawFrame();
}
function handlePaused() {
  runSimFrame();
  drawFrame();
}
function handleDead() {
  runSimFrame();
  drawFrame();
}

const STATE_HANDLERS = {
  [STATE.IDLE]: handleIdle,
  [STATE.WAITING]: handleWaiting,
  [STATE.RUNNING]: handleRunning,
  [STATE.PAUSED]: handlePaused,
  [STATE.DEAD]: handleDead,
};

// One sim step is the historical 60Hz frame. Score, speed, spawn gaps,
// jump physics, grace, and frame-tied juice all move once per step.
// Display refresh may be faster. Real rAF time is spent in SIM_FRAME_MS
// slices. A hitch is capped at MAX_SIM_STEPS so a backgrounded tab cannot
// fast-forward the run. These are not live-tuning keys — physics stays
// on the 60Hz slice, never on cfg().
const SIM_FRAME_MS = 1000 / 60;
const MAX_SIM_STEPS = 3;
// Float dust only. A real short frame stays under one slice.
const SIM_FRAME_EPSILON_MS = 1e-4;

const simClock = {
  accumulator: 0,
  lastTimestamp: null,
};

function resetSimClock() {
  simClock.accumulator = 0;
  simClock.lastTimestamp = null;
}

// How many 60Hz slices this animation frame owes.
// A call with no timestamp — tests, and the kickoff that starts the loop —
// is exactly one slice and does not move the rAF clock. Mixing Date.now()
// into lastTimestamp would disagree with rAF's performance timeline.
function simStepsForFrame(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return 1;
  if (simClock.lastTimestamp === null) {
    simClock.lastTimestamp = timestamp;
    return 1;
  }
  let dt = timestamp - simClock.lastTimestamp;
  simClock.lastTimestamp = timestamp;
  if (!(dt > 0)) return 0;
  const maxDt = SIM_FRAME_MS * MAX_SIM_STEPS;
  if (dt > maxDt) dt = maxDt;
  simClock.accumulator += dt;
  let steps = 0;
  while (simClock.accumulator + SIM_FRAME_EPSILON_MS >= SIM_FRAME_MS && steps < MAX_SIM_STEPS) {
    simClock.accumulator -= SIM_FRAME_MS;
    steps++;
  }
  // Hit the cap with time still owed. Drop it so the next frames don't burst.
  if (steps === MAX_SIM_STEPS) simClock.accumulator = 0;
  return steps;
}

// Sample window for ?qaHz=1. The anchor frame is not counted, so a full
// second of later frames reports the rate Playtest should see: sim near
// 60, raf near the display. Static numbers — no pulse.
const qaHzMeter = {
  raf: 0,
  sim: 0,
  anchor: null,
  rafHz: null,
  simHz: null,
};

function resetQaHzMeter() {
  qaHzMeter.raf = 0;
  qaHzMeter.sim = 0;
  qaHzMeter.anchor = null;
  qaHzMeter.rafHz = null;
  qaHzMeter.simHz = null;
}

function noteQaHzFrame(steps, timestamp) {
  if (!qa.hz) return;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return;
  if (qaHzMeter.anchor === null) {
    qaHzMeter.anchor = timestamp;
    qaHzMeter.raf = 0;
    qaHzMeter.sim = 0;
    return;
  }
  qaHzMeter.raf += 1;
  qaHzMeter.sim += steps;
  const elapsed = timestamp - qaHzMeter.anchor;
  // A summed 60Hz second can land a hair under 1000. That is still one second.
  if (elapsed + 1e-3 < 1000) return;
  qaHzMeter.rafHz = Math.round((qaHzMeter.raf * 1000) / elapsed);
  qaHzMeter.simHz = Math.round((qaHzMeter.sim * 1000) / elapsed);
  qaHzMeter.raf = 0;
  qaHzMeter.sim = 0;
  qaHzMeter.anchor = timestamp;
}

function qaHzLabel() {
  const sim = qaHzMeter.simHz === null ? '--' : String(qaHzMeter.simHz);
  const raf = qaHzMeter.rafHz === null ? '--' : String(qaHzMeter.rafHz);
  return 'sim ' + sim + '  raf ' + raf;
}

function drawQaHz() {
  if (!qa.hz) return;
  const label = qaHzLabel();
  const night = game.score >= GAME_CONFIG.DAY_NIGHT_START;
  ctx.save();
  ctx.fillStyle = night ? 'rgba(26,26,46,0.72)' : 'rgba(255,255,255,0.72)';
  ctx.fillRect(4, 12, 112, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = night ? '#c8c8c8' : '#5c5c5c';
  ctx.font = '11px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(label, 8, 24);
  ctx.restore();
}

// One 60Hz slice of simulation: the QA holds, then the update step of the
// current state. It paints nothing. A display frame that owes no slice does
// not call this, and does not draw either: the canvas already shows the
// last frame, and moving score, hills, or particles for time that was not
// owed would speed the game up on a fast display.
function runSimFrame() {
  advanceQaFlags();
  STATE_STEPS[game.state].update();
}

// One paint of the state the game is in now, after however many slices
// this display frame owed. The QA overlays go last so the score, the death
// card and a collision cannot cover them. The flash sits above the earlier
// marks, the LEVEL hold above that blink, and the NEW BEST hold is painted
// last, above the score pop, so a swollen score cannot cover the badge.
function drawFrame() {
  const shakeHeld = beginQaShake();
  STATE_STEPS[game.state].draw();
  endQaShake(shakeHeld);
  drawQaFlags();
  applyQaCopyButton();
}

function gameLoop(timestamp) {
  game.animationFrameId = requestAnimationFrame(gameLoop);
  const steps = simStepsForFrame(timestamp);
  for (let i = 0; i < steps; i++) runSimFrame();
  if (steps > 0) drawFrame();
  noteQaHzFrame(steps, timestamp);
  drawQaHz();
}
