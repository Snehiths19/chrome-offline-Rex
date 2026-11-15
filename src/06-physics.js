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

function computeRunResult(finalScore, currentHighScore) {
  const isNewBest = finalScore > currentHighScore || currentHighScore === 0;
  const previousHighScore = currentHighScore;
  const delta = isNewBest ? finalScore - previousHighScore : currentHighScore - finalScore;
  return { isNewBest, previousHighScore, delta };
}

function jump() {
  if (game.state !== STATE.RUNNING) return;
  if (!dino.isJumping) {
    dino.velocityY = dino.jumpPower;
    dino.isJumping = true;
    if (runDebug) game.lastJumpFrame = game.animFrame;
    Particles.emit('jump', dino.x + dino.width / 2, dino.y + dino.height);
    audio.jump();
  }
}
