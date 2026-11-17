// == SECTION 6: PHYSICS & GAME LOGIC ==

function spawnObstacle(type) {
  // Default to a tier-appropriate random pick; tests may pass a specific type.
  // Mode is required: omitting it lets Classic roll cluster once that tier unlocks.
  const t = type || pickObstacleType(game.rng, game.score, game.mode);
  let width = t.width;
  if (t.render === 'row') width = rowWidthForSpeed(game.currentSpeed);
  if (t.render === 'pit') width = pitWidthForSpeed(game.currentSpeed);
  const obs = {
    x: GAME_CONFIG.CANVAS_W,
    y: GAME_CONFIG.CANVAS_H - t.height - (t.lift || 0),
    width: width,
    height: t.height,
    type: t.id,
    render: t.render,
  };
  if (t.terrain) obs.terrain = true;
  game.obstacles.push(obs);
  // A leap (G3): the wide gap starts right at the ramp's lip.
  if (t.id === 'leap') {
    game.obstacles.push({
      x: obs.x + obs.width,
      y: GAME_CONFIG.CANVAS_H,
      width: leapGapWidthForSpeed(game.currentSpeed),
      height: 0,
      type: 'leapGap',
      render: 'pit',
      terrain: true,
    });
  }
}

// The gap after a leap's ramp (G3): the foot span plus LEAP_GAP_FRAMES of
// launch flight at `speed`.
function leapGapWidthForSpeed(speed) {
  const footSpan = GAME_CONFIG.DINO_WIDTH - 2 * GAME_CONFIG.DINO_PAD_X;
  return Math.round((speed + GAME_CONFIG.RAMP_BOOST) * GAME_CONFIG.LEAP_GAP_FRAMES) + footSpan;
}

// --- Gaps in the ground (G1, Updated and Daily) ---------------------------
// The dino stands on its feet: the middle of its sprite, inside the same
// side padding as its hitbox. A gap only swallows the dino once the whole
// foot span is over it, so a foot on the edge still holds.
function dinoFootSpan() {
  return {
    left: dino.x + GAME_CONFIG.DINO_PAD_X,
    right: dino.x + dino.width - GAME_CONFIG.DINO_PAD_X,
  };
}

// The foot span plus the ground the world scrolls in PIT_GAP_FRAMES at
// `speed`: the feet are over open air for PIT_GAP_FRAMES sim frames.
function pitWidthForSpeed(speed) {
  const footSpan = GAME_CONFIG.DINO_WIDTH - 2 * GAME_CONFIG.DINO_PAD_X;
  return Math.round(speed * GAME_CONFIG.PIT_GAP_FRAMES) + footSpan;
}

// The gap under the whole foot span, or null. `shift` looks ahead: the
// world has moved that many px further left.
function pitUnderFeet(shift) {
  const feet = dinoFootSpan();
  const s = shift || 0;
  for (const obs of game.obstacles) {
    if (obs.render !== 'pit') continue;
    if (obs.x - s <= feet.left && obs.x - s + obs.width >= feet.right) return obs;
  }
  return null;
}

// Height of a ramp's surface above the ground line at world x (G2): a
// straight slope from 0 at its left edge to RAMP_RISE at its right edge,
// where it drops straight back to the ground.
function rampHeightAt(obs, x) {
  if (x < obs.x || x > obs.x + obs.width) return 0;
  return (GAME_CONFIG.RAMP_RISE * (x - obs.x)) / obs.width;
}

// The highest ramp surface under the foot span, 0 on flat ground. The
// front foot rides up the slope; the dino leaves the top once the back
// foot is past the lip.
function groundRiseUnderFeet(shift) {
  const feet = dinoFootSpan();
  const s = shift || 0;
  let rise = 0;
  for (const obs of game.obstacles) {
    if (obs.render !== 'ramp') continue;
    const ramp = { x: obs.x - s, width: obs.width };
    if (feet.right < ramp.x || feet.left > ramp.x + ramp.width) continue;
    rise = Math.max(rise, rampHeightAt(ramp, Math.min(feet.right, ramp.x + ramp.width)));
  }
  return rise;
}

// The y the dino stands at here, or null over a gap.
function dinoFloorY(shift) {
  if (pitUnderFeet(shift)) return null;
  return GAME_CONFIG.CANVAS_H - dino.height - groundRiseUnderFeet(shift);
}

// On the ground: ride a ramp's slope up and leave its top as a launch
// (G2), or walk off into a gap (G1). Returns true when the dino launched.
function followGround() {
  const floor = dinoFloorY();
  if (floor !== null && floor <= dino.y) {
    dino.y = floor;
    return false;
  }
  // The ground dropped away under a dino that was up on a ramp: the lip.
  // A leap's gap (G3) starts right there, so this comes before the fall.
  if (dino.y < GAME_CONFIG.CANVAS_H - dino.height) {
    launchDino();
    return true;
  }
  if (floor === null) {
    // Walking off into a gap: the ground is gone, so the dino starts to
    // fall. It counts as a flight, so a second jump can still save it, but
    // not as a fresh take-off a slide could cancel.
    dino.isJumping = true;
    dino.velocityY = 0;
    dino.slideFrames = 0;
    dino.airFrames = GAME_CONFIG.SLIDE_CANCEL_FRAMES + 1;
    dino.takeoffY = dino.y;
    return false;
  }
  dino.y = floor;
  return false;
}

// Sim frames a ramp launch stays in the air on flat ground (G2). Pure
// arithmetic on GAME_CONFIG, the same every run.
let launchFramesCache = null;
function launchFlightFrames() {
  if (launchFramesCache !== null) return launchFramesCache;
  let h = GAME_CONFIG.RAMP_RISE,
    vy = -GAME_CONFIG.RAMP_LAUNCH_POWER,
    frames = 0;
  while (h > 0 && frames < 300) {
    const g =
      Math.abs(vy) < GAME_CONFIG.HANG_VELOCITY
        ? GAME_CONFIG.GRAVITY * GAME_CONFIG.HANG_GRAVITY_SCALE
        : GAME_CONFIG.GRAVITY;
    vy -= g;
    h += vy;
    frames++;
  }
  launchFramesCache = frames;
  return frames;
}

// Ground a launch at `speed` covers (G2). The gap after a ramp adds it, so
// the next obstacle is a full gap past where the launch comes down.
function launchFlightDistance(speed) {
  return Math.ceil(launchFlightFrames() * (speed + GAME_CONFIG.RAMP_BOOST));
}

function launchDino() {
  dino.isJumping = true;
  dino.velocityY = GAME_CONFIG.RAMP_LAUNCH_POWER;
  dino.slideFrames = 0;
  dino.airFrames = GAME_CONFIG.SLIDE_CANCEL_FRAMES + 1;
  dino.takeoffY = dino.y;
  dino.launched = true;
  Particles.emit('jump', dino.x + dino.width / 2, dino.y + dino.height);
  audio.jump();
}

function updateObstacles() {
  // Rightmost cull wins: the spawn gap is measured from the newest obstacle,
  // and the loop walks from the right. Keep that x after the sprite leaves so
  // a gap wider than the screen still counts down instead of snapping to -300
  // (which either spawns immediately or, past 900px, never spawns again).
  let culledX = null;
  for (let i = game.obstacles.length - 1; i >= 0; i--) {
    const obs = game.obstacles[i];
    obs.x -= worldScroll();
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
    game.lastObstacleX -= worldScroll();
  }
}

// How far the world moves this frame: the run speed, plus the air dash
// boost while a dash lasts (M5) and the ramp boost while a launch flight
// lasts (G2).
function worldScroll() {
  return (
    game.currentSpeed +
    (dino.dashFrames > 0 ? GAME_CONFIG.DASH_BOOST : 0) +
    (dino.launched ? GAME_CONFIG.RAMP_BOOST : 0)
  );
}

// Sim frames a held Updated jump keeps the dino's hitbox above an obstacle
// `height` px tall (M5). Pure arithmetic on GAME_CONFIG, the same every run.
const rowClearFramesCache = {};
function heldJumpFramesAbove(height) {
  if (rowClearFramesCache[height] !== undefined) return rowClearFramesCache[height];
  const clear = height - GAME_CONFIG.OBS_PAD_Y - GAME_CONFIG.DINO_PAD_Y_BOT;
  let h = 0,
    vy = -GAME_CONFIG.UPDATED_JUMP_POWER,
    frames = 0;
  for (let i = 0; i < 300; i++) {
    const g =
      Math.abs(vy) < GAME_CONFIG.HANG_VELOCITY
        ? GAME_CONFIG.GRAVITY * GAME_CONFIG.HANG_GRAVITY_SCALE
        : GAME_CONFIG.GRAVITY;
    vy -= g;
    h += vy;
    if (h <= 0) break;
    if (h >= clear) frames++;
  }
  rowClearFramesCache[height] = frames;
  return frames;
}

// A long row (M5) is a whole number of small cacti, wide enough that one
// held jump at `speed` can't carry the dino across it.
function rowWidthForSpeed(speed) {
  const row = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'row');
  const small = GAME_CONFIG.OBSTACLE_TYPES[0];
  const hitboxSpan =
    GAME_CONFIG.DINO_WIDTH - 2 * GAME_CONFIG.DINO_PAD_X - 2 * GAME_CONFIG.OBS_PAD_X;
  const frames = heldJumpFramesAbove(row.height) + GAME_CONFIG.ROW_MARGIN_FRAMES;
  const needed = speed * frames - hitboxSpan;
  const step = small.width + GAME_CONFIG.ROW_CACTUS_GAP;
  const count = Math.max(
    Math.round((row.width + GAME_CONFIG.ROW_CACTUS_GAP) / step),
    Math.ceil((needed + GAME_CONFIG.ROW_CACTUS_GAP) / step)
  );
  return count * step - GAME_CONFIG.ROW_CACTUS_GAP;
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

// Sim frames until the feet touch the ground on the current fall, counted
// up to limit + 1 (a rising dino is never about to land).
function framesToLanding(limit) {
  // Feet below the ground line inside a gap never land: its far wall ends
  // the run instead, so a press there is a rescue, not an early jump (G1).
  if (dino.velocityY <= 0 || dino.inPit) return limit + 1;
  let y = dino.y,
    vy = dino.velocityY;
  for (let i = 1; i <= limit; i++) {
    vy += dino.dropping ? GAME_CONFIG.FAST_FALL_GRAVITY : dino.gravity;
    y += vy;
    // Over a gap there is no ground to land on (G1); a ramp is higher (G2).
    const floor = dinoFloorY(worldScroll() * i);
    if (floor === null) {
      if (y >= GAME_CONFIG.CANVAS_H - dino.height) return limit + 1;
    } else if (y >= floor) return i;
  }
  return limit + 1;
}

// A second jump is open in Updated and Daily, once per flight, unless the
// press is really an early landing jump: falling and inside the jump
// buffer window (M3).
function canDoubleJump() {
  if (!isUpdatedMode() || !dino.isJumping || dino.doubleJumped) return false;
  const bufferWindow = GAME_CONFIG.JUMP_BUFFER_FRAMES;
  return framesToLanding(bufferWindow) > bufferWindow;
}

// Take-off speed of the second jump: DOUBLE_JUMP_POWER, or less when that
// would rise past the ceiling, so the arc tops out at the ceiling instead of
// bumping into it.
function doubleJumpVelocity() {
  const room = Math.max(0, dino.y - GAME_CONFIG.CEILING_Y);
  return -Math.min(-GAME_CONFIG.DOUBLE_JUMP_POWER, Math.sqrt(2 * dino.gravity * room));
}

// Take-off speed of a ground jump: lower in Updated and Daily (M4).
function jumpPower() {
  return isUpdatedMode() ? GAME_CONFIG.UPDATED_JUMP_POWER : dino.jumpPower;
}

// repeat: the press is a held key's auto-repeat, which only ever buffers.
function jump(repeat) {
  if (game.state !== STATE.RUNNING) return;
  if (!repeat && canDoubleJump()) {
    dino.velocityY = doubleJumpVelocity();
    dino.doubleJumped = true;
    dino.dashFrames = 0;
    dino.dropping = false;
    dino.jumpBufferFrames = 0;
    dino.flipFrames = cfg('DOUBLE_JUMP_FLIP_FRAMES');
    Particles.emit('doubleJump', dino.x + dino.width / 2, dino.y + dino.height);
    audio.doubleJump();
    return;
  }
  if (!dino.isJumping && groundRiseUnderFeet() > 0) {
    // A jump on a ramp (G3) is a launch: the same lift and boost as running
    // off its lip, so the instinct to jump at a leap's gap is never wrong.
    dino.jumpBufferFrames = 0;
    launchDino();
    return;
  }
  if (!dino.isJumping) {
    dino.slideFrames = 0;
    dino.airFrames = 0;
    dino.takeoffY = dino.y;
    dino.velocityY = jumpPower();
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

// The box collision uses this frame: the full sprite box, or a low box at
// the feet while sliding (M6).
function dinoHitbox() {
  if (dino.slideFrames <= 0) return dino;
  const h = GAME_CONFIG.SLIDE_HEIGHT;
  return { x: dino.x, y: dino.y + dino.height - h, width: dino.width, height: h };
}

// Slide (M6). On the ground, or straight after a take-off (a phone swipe
// down starts with the touch that jumps), drop flat for SLIDE_FRAMES. A
// slide already going is topped up, so holding Down keeps sliding.
function startSlide() {
  if (dino.isJumping) {
    const floor = dinoFloorY();
    dino.y = floor === null ? GAME_CONFIG.CANVAS_H - dino.height : floor;
    dino.velocityY = 0;
    dino.isJumping = false;
    dino.dropping = false;
    dino.doubleJumped = false;
    dino.flipFrames = 0;
    dino.jumpBufferFrames = 0;
    dino.dashed = false;
    dino.dashFrames = 0;
  }
  const fresh = dino.slideFrames <= 0;
  dino.slideFrames = Math.max(dino.slideFrames, GAME_CONFIG.SLIDE_FRAMES);
  if (fresh) {
    Particles.emit('land', dino.x + dino.width / 2, dino.y + dino.height);
    audio.land();
  }
}

// Air dash (M5): Right, D or a swipe right in the air, once per flight, in
// Updated and Daily. The dino holds its height while the world rushes past.
function dashDino() {
  if (game.state !== STATE.RUNNING || !isUpdatedMode()) return;
  if (!dino.isJumping || dino.dashed) return;
  dino.dashed = true;
  dino.dashFrames = GAME_CONFIG.DASH_FRAMES;
  dino.velocityY = 0;
  dino.dropping = false;
  Particles.emit('doubleJump', dino.x, dino.y + dino.height / 2);
  audio.doubleJump();
}

// Move combo (M7, Updated and Daily). An obstacle cleared during a second
// jump, an air dash, a slide or a ramp launch (G3) adds one to game.combo and plays a note a
// step higher; one cleared with a plain jump ends the combo. Display and
// sound only: it never touches score, speed, spawning or game.rng().
function comboMoveActive() {
  return dino.doubleJumped || dino.dashed || dino.slideFrames > 0 || dino.launched;
}
function updateCombo() {
  if (game.comboPopFrames > 0) game.comboPopFrames--;
  if (!isUpdatedMode()) return;
  for (const obs of game.obstacles) {
    if (obs.render === 'ramp') continue; // a ramp is ridden, not cleared (G2)
    if (obs.passed || obs.x + obs.width >= dino.x) continue;
    obs.passed = true;
    if (comboMoveActive()) {
      game.combo++;
      game.comboPopFrames = GAME_CONFIG.COMBO_POP_FRAMES;
      audio.comboNote(game.combo);
      if (game.combo >= 2) announce('Combo ' + game.combo);
    } else {
      game.combo = 0;
    }
  }
}

// Fast fall (F3): Down, S or a swipe down while airborne. On the ground it
// does nothing. A jump buffered during the same flight is dropped, so the
// swipe that starts with a touch does not bounce straight back up.
function dropDino() {
  if (game.state !== STATE.RUNNING) return;
  dino.dashFrames = 0;
  if (isUpdatedMode() && (!dino.isJumping || dino.airFrames <= GAME_CONFIG.SLIDE_CANCEL_FRAMES)) {
    startSlide();
    return;
  }
  if (!dino.isJumping) return;
  dino.dropping = true;
  dino.jumpBufferFrames = 0;
  dino.velocityY = Math.max(dino.velocityY, GAME_CONFIG.FAST_FALL_START_VELOCITY);
}
