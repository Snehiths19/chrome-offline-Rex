// == SECTION 6: PHYSICS & GAME LOGIC ==

function spawnObstacle(type) {
  // Default to a tier-appropriate random pick; tests may pass a specific type.
  // Mode is required: omitting it lets Classic roll cluster once that tier unlocks.
  const t = type || pickObstacleType(game.rng, game.score, game.mode);
  game.obstacles.push({
    x: GAME_CONFIG.CANVAS_W,
    y: GAME_CONFIG.CANVAS_H - t.height,
    width: t.width,
    height: t.height,
    type: t.id,
    render: t.render,
  });
}

function updateObstacles() {
  // Rightmost cull wins: the spawn gap is measured from the newest obstacle,
  // and the loop walks from the right. Keep that x after the sprite leaves so
  // a gap wider than the screen still counts down instead of snapping to -300
  // (which either spawns immediately or, past 900px, never spawns again).
  let culledX = null;
  for (let i = game.obstacles.length - 1; i >= 0; i--) {
    const obs = game.obstacles[i];
    obs.x -= game.currentSpeed;
    if (obs.x + obs.width < 0) {
      if (culledX === null) culledX = obs.x;
      game.obstacles.splice(i, 1);
    }
  }
  if (game.obstacles.length > 0) {
    game.lastObstacleX = game.obstacles[game.obstacles.length - 1].x;
  } else if (culledX !== null) {
    game.lastObstacleX = culledX;
  } else {
    game.lastObstacleX -= game.currentSpeed;
  }
}

function checkCollision(dino, obstacle) {
  const dx = GAME_CONFIG.DINO_PAD_X,
    dyt = GAME_CONFIG.DINO_PAD_Y_TOP,
    dyb = GAME_CONFIG.DINO_PAD_Y_BOT;
  const ox = GAME_CONFIG.OBS_PAD_X,
    oy = GAME_CONFIG.OBS_PAD_Y;

  const dl = dino.x + dx,
    dr = dino.x + dino.width - dx;
  const dt = dino.y + dyt,
    db = dino.y + dino.height - dyb;
  const ol = obstacle.x + ox,
    or_ = obstacle.x + obstacle.width - ox;
  const ot = obstacle.y + oy,
    ob = obstacle.y + obstacle.height;

  return dl < or_ && dr > ol && dt < ob && db > ot;
}

// isFirst: nothing stored yet (best 0). A first run beats nothing, so it is
// not a new best (R3): free play shows the plain score instead. Daily still
// counts the first run of the day as a new today best (see updateRunning).
function computeRunResult(finalScore, currentHighScore) {
  const isFirst = currentHighScore === 0;
  const isNewBest = !isFirst && finalScore > currentHighScore;
  const previousHighScore = currentHighScore;
  const delta = isNewBest ? finalScore - previousHighScore : currentHighScore - finalScore;
  return { isNewBest, isFirst, previousHighScore, delta };
}

function jump() {
  if (game.state !== STATE.RUNNING) return;
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
    if (runDebug) game.lastJumpFrame = game.animFrame;
    Particles.emit('jump', dino.x + dino.width / 2, dino.y + dino.height);
    audio.jump();
  } else {
    // In the air: remember the press. updateRunning spends it on landing.
    dino.jumpBufferFrames = GAME_CONFIG.JUMP_BUFFER_FRAMES;
  }
}

// Gravity for this airborne frame. A fast fall wins; otherwise Updated and
// Daily ease gravity near the top of the jump for a moment of hang time
// (M1). Classic keeps the plain arc.
function airGravity() {
  if (dino.dropping) return GAME_CONFIG.FAST_FALL_GRAVITY;
  if (isUpdatedMode() && Math.abs(dino.velocityY) < GAME_CONFIG.HANG_VELOCITY) {
    return dino.gravity * GAME_CONFIG.HANG_GRAVITY_SCALE;
  }
  return dino.gravity;
}

// Fast fall (F3): Down, S or a swipe down while airborne. On the ground it
// does nothing. A jump buffered during the same flight is dropped, so the
// swipe that starts with a touch does not bounce straight back up.
function dropDino() {
  if (game.state !== STATE.RUNNING || !dino.isJumping) return;
  dino.dropping = true;
  dino.jumpBufferFrames = 0;
  dino.velocityY = Math.max(dino.velocityY, GAME_CONFIG.FAST_FALL_START_VELOCITY);
}
