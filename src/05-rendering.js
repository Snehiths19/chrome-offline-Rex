// == SECTION 5: RENDERING ==

function getBackgroundColor(s) {
  s = scoreForNightSky(s);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return '#ffffff';
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return '#1a1a2e';
  if (reducedMotion) return '#ffffff'; // no smooth interpolation — snap at end
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Updated and Daily ramp across the shorter length so the brightening
// settles sooner. A tune outside 1..STAR_FADE_FRAMES, or not a whole
// number, falls back — a typo cannot outlast Classic or go negative.
function updatedStarFadeFrames() {
  const tuned = cfg('UPDATED_STAR_FADE_FRAMES');
  const cap = GAME_CONFIG.STAR_FADE_FRAMES;
  if (typeof tuned === 'number' && tuned >= 1 && tuned <= cap && Math.floor(tuned) === tuned) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_STAR_FADE_FRAMES;
}

// Classic keeps STAR_FADE_FRAMES, including a non-positive tune that
// means "show them immediately".
function starFadeFrameCount() {
  if (isUpdatedMode()) return updatedStarFadeFrames();
  return cfg('STAR_FADE_FRAMES');
}

// 0 at the moment night begins, 1 once the mode's fade length has elapsed.
function starFadeAlpha() {
  const total = starFadeFrameCount();
  if (!(total > 0)) return 1;
  return Math.min(1, game.starFadeFrames / total);
}

// Updated and Daily multiply their shorter ramp by the night whisper.
// Classic paints its own ramp at full white. A tune outside 0..1 falls back,
// so a typo cannot restore the sparkle or drop the field.
function starPaintAlpha() {
  const ramp = starFadeAlpha();
  if (!isUpdatedMode()) return ramp;
  const tuned = cfg('NIGHT_STAR_ALPHA');
  const peak =
    typeof tuned === 'number' && tuned >= 0 && tuned <= 1 ? tuned : GAME_CONFIG.NIGHT_STAR_ALPHA;
  return ramp * peak;
}

function drawBackground() {
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);

  if (game.starsInitialised) {
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * starPaintAlpha();
    ctx.fillStyle = GAME_CONFIG.STAR_COLOR;
    game.stars.forEach((s) => ctx.fillRect(s.x, s.y, GAME_CONFIG.STAR_SIZE, GAME_CONFIG.STAR_SIZE));
    ctx.globalAlpha = previousAlpha;
  }
}

function initClouds() {
  game.clouds.length = 0;
  for (let i = 0; i < GAME_CONFIG.CLOUD_COUNT; i++) {
    game.clouds.push({
      x: Math.random() * GAME_CONFIG.CANVAS_W,
      y: GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE,
      speed: GAME_CONFIG.CLOUD_MIN_SPEED + Math.random() * GAME_CONFIG.CLOUD_SPEED_RANGE,
    });
  }
}

function updateClouds() {
  if (reducedMotion) return;
  // PR-D: stronger parallax in Updated mode so the world feels less static.
  const speedFactor = isUpdatedMode() ? GAME_CONFIG.CLOUD_SPEED_FACTOR_UPDATED : 1;
  game.clouds.forEach((c) => {
    c.x -= c.speed * speedFactor;
    if (c.x + GAME_CONFIG.CLOUD_WIDTH < 0) {
      c.x = GAME_CONFIG.CANVAS_W + GAME_CONFIG.CLOUD_RESPAWN_OFFSET;
      c.y = GAME_CONFIG.CLOUD_MIN_Y + Math.random() * GAME_CONFIG.CLOUD_Y_RANGE;
    }
  });
}

// --- Mid-ground hills (PR-D, updated mode only) ---
// Soft mounds drawn behind the ground at slow parallax. Deterministic shape
// per-run via game.rng so the same seed yields identical scenery.
// Shadow copy used only while reduced motion freezes the drawn hills. It must
// stay on game.rng so respawn draws are not skipped.
let hillLayout = null;

function initHills() {
  hillLayout = null;
  game.hills.length = 0;
  const slot = GAME_CONFIG.CANVAS_W / GAME_CONFIG.HILL_COUNT;
  for (let i = 0; i < GAME_CONFIG.HILL_COUNT; i++) {
    game.hills.push({
      x: i * slot + game.rng() * (slot - GAME_CONFIG.HILL_MIN_WIDTH),
      width: GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE,
      height: GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE,
    });
  }
}

function updateHills() {
  if (!isUpdatedMode()) return;
  // Reduced motion freezes the mounds the player sees, but the respawn rolls
  // still have to come off game.rng(). Skipping them shifts every later
  // obstacle type and gap for that Daily seed.
  let hills = game.hills;
  if (reducedMotion) {
    if (!hillLayout) {
      hillLayout = game.hills.map((h) => ({ x: h.x, width: h.width, height: h.height }));
    }
    hills = hillLayout;
  }
  for (const hill of hills) {
    hill.x -= game.currentSpeed * GAME_CONFIG.HILL_PARALLAX;
    if (hill.x + hill.width < 0) {
      // GAME_CONFIG, not cfg(): when the next respawn happens decides when the
      // next game.rng() rolls happen, so a tuned range would shift the Daily
      // obstacle sequence. The replay tests (tests/replay.test.js) check this.
      hill.x = GAME_CONFIG.CANVAS_W + game.rng() * GAME_CONFIG.HILL_RESPAWN_X_RANGE;
      hill.width = GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE;
      hill.height = GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE;
    }
  }
}

function hillNightHex() {
  const tuned = hexChannels(cfg('HILL_COLOR_NIGHT')) || hexChannels(GAME_CONFIG.HILL_COLOR_NIGHT);
  return '#' + tuned.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function getHillColor(score) {
  score = scoreForNightSky(score);
  if (score < GAME_CONFIG.DAY_NIGHT_START) return GAME_CONFIG.HILL_COLOR_DAY;
  if (score >= GAME_CONFIG.DAY_NIGHT_END) return hillNightHex();
  if (reducedMotion) return GAME_CONFIG.HILL_COLOR_DAY; // snap — stays day until DAY_NIGHT_END
  const t =
    (score - GAME_CONFIG.DAY_NIGHT_START) /
    (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const parseHex = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const day = parseHex(GAME_CONFIG.HILL_COLOR_DAY);
  const night = parseHex(hillNightHex());
  const r = Math.round(day[0] + (night[0] - day[0]) * t);
  const g = Math.round(day[1] + (night[1] - day[1]) * t);
  const b = Math.round(day[2] + (night[2] - day[2]) * t);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function drawHills() {
  if (!isUpdatedMode() || game.hills.length === 0) return;
  // Pick a colour that contrasts with the day/night background.
  ctx.fillStyle = getHillColor(game.score);
  const baseY = GAME_CONFIG.CANVAS_H - 16;
  for (const hill of game.hills) {
    if (typeof ctx.ellipse !== 'function') {
      // Fallback for environments without canvas.ellipse — draw a triangle.
      ctx.beginPath();
      ctx.moveTo(hill.x, baseY);
      ctx.lineTo(hill.x + hill.width / 2, baseY - hill.height);
      ctx.lineTo(hill.x + hill.width, baseY);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(hill.x + hill.width / 2, baseY, hill.width / 2, hill.height, 0, 0, Math.PI, true);
    ctx.fill();
  }
}

// Day milestone wash stays SKY_TINT_PEAK_ALPHA. In Updated and Daily the peak
// eases down across twilight so the gold flash stays peripheral once the sky
// is night. Classic keeps the day peak; drawSkyTint still skips Classic.
// Reduced motion skips the ease and snaps. The overlay itself stays
// suppressed when reduced motion is on.
function skyTintPeakAlpha() {
  const day = cfg('SKY_TINT_PEAK_ALPHA');
  if (!isUpdatedMode()) return day;
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return day;
  const tuned = cfg('NIGHT_SKY_TINT_PEAK_ALPHA');
  const night =
    typeof tuned === 'number' && tuned >= 0 && tuned <= 1
      ? tuned
      : GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return night;
  if (reducedMotion) return day;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return day + (night - day) * t;
}

// Gentle gold sky-tint during a milestone flash, on top of the day/night
// background. The day peak is a half-strength breath so the wash does not
// veil the obstacle lane. Night eases to a three-fifths peak so the gold
// stays a quiet breath once the sky is fully night.
function drawSkyTint() {
  if (!isUpdatedMode() || reducedMotion) return;
  if (Animations.milestoneFrames <= 0) return;
  const alpha = (Animations.milestoneFrames / GAME_CONFIG.MILESTONE_FRAMES) * skyTintPeakAlpha();
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('SKY_TINT_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.restore();
}

// Updated and Daily day clouds use DAY_CLOUD_ALPHA so the early-run puff
// stays a peripheral whisper on the white sky. The same #e8e8e8 ink eases
// down across twilight to the night dim. Classic keeps full opacity — its
// own faint path. Reduced motion skips the ease and snaps.
function cloudPaintAlpha() {
  if (!isUpdatedMode()) return 1;
  const day = tunedUnitAlpha('DAY_CLOUD_ALPHA', GAME_CONFIG.DAY_CLOUD_ALPHA);
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return day;
  const dim = tunedUnitAlpha('NIGHT_CLOUD_ALPHA', GAME_CONFIG.NIGHT_CLOUD_ALPHA);
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return dim;
  if (reducedMotion) return day;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return day + (dim - day) * t;
}

function drawClouds() {
  const alpha = cloudPaintAlpha();
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * alpha;
  ctx.fillStyle = GAME_CONFIG.CLOUD_COLOR;
  try {
    game.clouds.forEach((c) => {
      // One fill for the whole puff. Separate fills would stack the night
      // alpha where the circles overlap and light the center back up.
      ctx.beginPath();
      GAME_CONFIG.CLOUD_CIRCLES.forEach(([dx, dy, r]) => {
        ctx.moveTo(c.x + dx + r, c.y + dy);
        ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
      });
      ctx.fill();
    });
  } finally {
    ctx.globalAlpha = previousAlpha;
  }
}

// Day ground stays the #535353 strip at full opacity. In Updated and Daily
// the line eases down across twilight so the night sky shows through and
// the strip cools under the foot dust. Classic keeps the day paint.
// Reduced motion skips the ease and snaps. Scroll stays in the game loop.
function groundPaintAlpha() {
  if (!isUpdatedMode()) return 1;
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return 1;
  const tuned = cfg('NIGHT_GROUND_ALPHA');
  const dim =
    typeof tuned === 'number' && tuned >= 0 && tuned <= 1 ? tuned : GAME_CONFIG.NIGHT_GROUND_ALPHA;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return dim;
  if (reducedMotion) return 1;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return 1 + (dim - 1) * t;
}

function drawGround() {
  const alpha = groundPaintAlpha();
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * alpha;
  try {
    if (!imageReady(groundImage)) {
      // Fallback: thin line at ground level so the dino doesn't look like it's floating.
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, GAME_CONFIG.CANVAS_H - 2, GAME_CONFIG.CANVAS_W, 2);
      return;
    }
    const groundY = GAME_CONFIG.CANVAS_H - groundImage.height;
    ctx.drawImage(groundImage, game.groundX, groundY, groundImage.width, groundImage.height);
    ctx.drawImage(
      groundImage,
      game.groundX + groundImage.width,
      groundY,
      groundImage.width,
      groundImage.height
    );
  } finally {
    ctx.globalAlpha = previousAlpha;
  }
}

// Cluster hitbox stays GAME_CONFIG width. Paint two full small-cactus sprites.
// The art's arms run to the cell edge, so the leftover inside the hitbox (~10px)
// still reads as one bar at the speed a first cluster appears. Open one small
// cactus of sky between them — narrower than the dino, so it is not a lane —
// and let the sprites overhang the hitbox equally. The sky stays inside the
// hitbox, so the gap is not a sneak-through. Collision does not read these slots.
function clusterSpriteSlots(obstacle) {
  const small = GAME_CONFIG.OBSTACLE_TYPES[0];
  const gap = small.width;
  const overhang = (small.width * 2 + gap - obstacle.width) / 2;
  const y = obstacle.y + (obstacle.height - small.height);
  const left = obstacle.x - overhang;
  return [
    { x: left, y: y, w: small.width, h: small.height },
    { x: left + small.width + gap, y: y, w: small.width, h: small.height },
  ];
}

// A long row (M5) paints as small cacti side by side, ROW_CACTUS_GAP apart,
// each drawn exactly like a lone small cactus.
function rowSpriteSlots(obstacle) {
  const small = GAME_CONFIG.OBSTACLE_TYPES[0];
  const step = small.width + GAME_CONFIG.ROW_CACTUS_GAP;
  const count = Math.max(1, Math.round((obstacle.width + GAME_CONFIG.ROW_CACTUS_GAP) / step));
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      type: 'small',
      x: obstacle.x + i * step,
      y: obstacle.y + obstacle.height - small.height,
      width: small.width,
      height: small.height,
    });
  }
  return slots;
}

// The tower (M4) paints as big cacti stacked on top of each other, each
// drawn exactly like a lone big cactus.
function towerSpriteSlots(obstacle) {
  const big = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');
  const count = Math.max(1, Math.round(obstacle.height / big.height));
  const h = obstacle.height / count;
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      type: 'big',
      x: obstacle.x,
      y: obstacle.y + i * h,
      width: obstacle.width,
      height: h,
    });
  }
  return slots;
}

// Day sprite stays put until night has arrived. A lift partway through the
// fade crosses the hill colour and the cactus disappears into it. Classic
// has no hills, so its dark silhouette on the shared night sky stays as-is.
function obstacleNightBrightness() {
  if (!isUpdatedMode()) return 1;
  if (scoreForNightSky(game.score) < GAME_CONFIG.DAY_NIGHT_END) return 1;
  const peak = cfg('NIGHT_OBSTACLE_BRIGHTNESS');
  return typeof peak === 'number' && peak > 1 ? peak : 1;
}

// assets/cactus.png is 34×70. The Node Image stub has no natural size, so
// the tall-cactus paint falls back to that cell. Visual only.
const CACTUS_SPRITE_W = 34;
const CACTUS_SPRITE_H = 70;

function cactusSpritePixels() {
  const w = obstacleImage && obstacleImage.naturalWidth;
  const h = obstacleImage && obstacleImage.naturalHeight;
  if (w > 0 && h > 0) return { w: w, h: h };
  return { w: CACTUS_SPRITE_W, h: CACTUS_SPRITE_H };
}

// Big-cactus hitbox stays GAME_CONFIG 30×55. Stretching the 34×70 cell into
// that wider box reads as a soft, squat copy of the small cactus. Paint the
// cell's own proportions at the hitbox height — the jump line stays honest —
// centered on the hitbox, with nearest-neighbor so the arms stay sharp.
// Collision does not read this rect.
function bigCactusPaint(obstacle) {
  const sprite = cactusSpritePixels();
  const h = obstacle.height;
  const w = Math.max(1, Math.round((h * sprite.w) / sprite.h));
  const x = obstacle.x + Math.floor((obstacle.width - w) / 2);
  return { x: x, y: obstacle.y, w: w, h: h };
}

// Low bird (M6): a small blocky silhouette in the cactus ink, beak forward
// (left), wings flapping every 10 sim frames. Drawn inside its hitbox.
function drawBird(obstacle) {
  const x = obstacle.x,
    y = obstacle.y,
    w = obstacle.width,
    h = obstacle.height;
  const up = Math.floor(game.animFrame / 10) % 2 === 0;
  ctx.fillStyle = '#535353';
  ctx.fillRect(x + w * 0.15, y + h * 0.45, w * 0.7, h * 0.3); // body
  ctx.fillRect(x, y + h * 0.4, w * 0.2, h * 0.2); // head and beak
  ctx.fillRect(x + w * 0.8, y + h * 0.35, w * 0.2, h * 0.15); // tail
  if (up) ctx.fillRect(x + w * 0.35, y, w * 0.2, h * 0.45);
  else ctx.fillRect(x + w * 0.35, y + h * 0.75, w * 0.2, h * 0.25);
}

function drawSingleObstacle(obstacle) {
  const crisp = obstacle.type === 'big';
  const slot = crisp
    ? bigCactusPaint(obstacle)
    : { x: obstacle.x, y: obstacle.y, w: obstacle.width, h: obstacle.height };
  if (!imageReady(obstacleImage)) {
    ctx.fillStyle = '#2d7a2d';
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    return;
  }
  if (!crisp) {
    ctx.drawImage(obstacleImage, slot.x, slot.y, slot.w, slot.h);
    return;
  }
  // Nearest-neighbor in game space still blends into the hill when the
  // canvas scale and the sprite's x are fractional. Snap the paint to whole
  // device pixels so the arms stay hard #535353. The hitbox is untouched.
  const sx = canvas.width / GAME_CONFIG.CANVAS_W;
  const sy = canvas.height / GAME_CONFIG.CANVAS_H;
  const dx = Math.round(slot.x * sx);
  const dy = Math.round(slot.y * sy);
  const dw = Math.max(1, Math.round(slot.w * sx));
  const dh = Math.max(1, Math.round(slot.h * sy));
  const previousSmoothing = ctx.imageSmoothingEnabled;
  const previousTransform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.drawImage(obstacleImage, dx, dy, dw, dh);
  } finally {
    if (previousTransform) ctx.setTransform(previousTransform);
    else ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.imageSmoothingEnabled = previousSmoothing;
  }
}

function drawObstacles() {
  const brightness = obstacleNightBrightness();
  const previousFilter = ctx.filter;
  if (brightness > 1) ctx.filter = 'brightness(' + brightness.toFixed(2) + ')';
  try {
    game.obstacles.forEach((obstacle) => {
      if (obstacle.render === 'bird') {
        drawBird(obstacle);
        return;
      }
      if (obstacle.render === 'row') {
        rowSpriteSlots(obstacle).forEach(drawSingleObstacle);
        return;
      }
      if (obstacle.render === 'stack') {
        towerSpriteSlots(obstacle).forEach(drawSingleObstacle);
        return;
      }
      if (obstacle.render === 'double') {
        const slots = clusterSpriteSlots(obstacle);
        if (!imageReady(obstacleImage)) {
          ctx.fillStyle = '#2d7a2d';
          slots.forEach((slot) => ctx.fillRect(slot.x, slot.y, slot.w, slot.h));
          return;
        }
        slots.forEach((slot) => ctx.drawImage(obstacleImage, slot.x, slot.y, slot.w, slot.h));
        return;
      }
      drawSingleObstacle(obstacle);
    });
  } finally {
    if (brightness > 1) ctx.filter = previousFilter || 'none';
  }
}

// Day sprite stays put until night has arrived. A lift partway through the
// fade crosses the hill colour. The full-night peak is the softer 1.2 step,
// quieter than the cactus lift so obstacles still win the eye. Classic has
// no hills, so its dark silhouette stays.
function dinoNightBrightness() {
  if (!isUpdatedMode()) return 1;
  if (scoreForNightSky(game.score) < GAME_CONFIG.DAY_NIGHT_END) return 1;
  const peak = cfg('NIGHT_DINO_BRIGHTNESS');
  return typeof peak === 'number' && peak > 1 ? peak : 1;
}

// Squash and stretch scale for the dino sprite (M1), anchored at the feet.
// Returns { sx, sy }. Classic, reduced motion and the death pose stay 1.
function dinoSquashScale() {
  const none = { sx: 1, sy: 1 };
  // The slide pose is gameplay (the hitbox is low), so it shows even under
  // reduced motion.
  if (dino.slideFrames > 0 && isUpdatedMode() && game.state !== STATE.DEAD) {
    return { sx: 1.25, sy: GAME_CONFIG.SLIDE_HEIGHT / dino.height };
  }
  if (!isUpdatedMode() || reducedMotion || game.state === STATE.DEAD) return none;
  const frames = cfg('DINO_SQUASH_FRAMES');
  if (dino.landSquashFrames > 0 && frames > 0) {
    const t = Math.min(1, dino.landSquashFrames / frames);
    const amt = (dino.landSquashHard ? cfg('DINO_SLAM_SQUASH') : cfg('DINO_LAND_SQUASH')) * t;
    return { sx: 1 + amt * 0.6, sy: 1 - amt };
  }
  if (dino.isJumping) {
    const speed = Math.min(1, Math.abs(dino.velocityY) / Math.abs(GAME_CONFIG.JUMP_POWER));
    const s = cfg('DINO_STRETCH_MAX') * speed;
    return { sx: 1 - s * 0.5, sy: 1 + s };
  }
  return none;
}

// Second-jump flip angle in radians (M3): one forward turn while flipFrames
// counts down. 0 in Classic, under reduced motion and in the death pose.
function dinoFlipAngle() {
  if (!isUpdatedMode() || reducedMotion || game.state === STATE.DEAD) return 0;
  const total = cfg('DOUBLE_JUMP_FLIP_FRAMES');
  if (!(total > 0) || dino.flipFrames <= 0) return 0;
  return Math.PI * 2 * (1 - Math.min(1, dino.flipFrames / total));
}

function drawDino() {
  let img;
  if (game.state === STATE.DEAD) {
    img = dinoLoseImage;
  } else if (dino.isJumping) {
    img = dino.image;
  } else {
    img = dinoRunImages[Math.floor(game.animFrame / GAME_CONFIG.RUN_FRAME_PERIOD) % 2];
  }
  const brightness = dinoNightBrightness();
  const previousFilter = ctx.filter;
  if (brightness > 1) ctx.filter = 'brightness(' + brightness.toFixed(2) + ')';
  try {
    if (imageReady(img)) {
      const { sx, sy } = dinoSquashScale();
      const w = dino.width * sx,
        h = dino.height * sy;
      const turn = dinoFlipAngle();
      if (turn) {
        const cx = dino.x + dino.width / 2,
          cy = dino.y + dino.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(turn);
        ctx.drawImage(img, -w / 2, dino.height / 2 - h, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, dino.x + (dino.width - w) / 2, dino.y + dino.height - h, w, h);
      }
    } else {
      ctx.fillStyle = '#535353';
      ctx.fillRect(dino.x, dino.y, dino.width, dino.height);
    }
  } finally {
    if (brightness > 1) ctx.filter = previousFilter || 'none';
  }
}

// Peak scale of the death score pop. A tune outside 1..1.4 falls back so
// the HUD cannot shrink or slap harder than the old 1.4 peak.
function scorePopPeakScale() {
  const tuned = cfg('SCORE_POP_PEAK_SCALE');
  if (typeof tuned === 'number' && tuned >= 1 && tuned <= 1.4) return tuned;
  return GAME_CONFIG.SCORE_POP_PEAK_SCALE;
}

// t is 1 on the first pop frame and falls toward 0. The first frame
// returns the peak exactly so a tune is not lost to float drift.
function scorePopScale(t) {
  const peak = scorePopPeakScale();
  if (t >= 1) return peak;
  if (t <= 0) return 1;
  return 1 + t * (peak - 1);
}

function paintHudScore() {
  const color = scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  ctx.fillStyle = color;
  ctx.font = '20px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(
    String(Math.floor(game.score)).padStart(5, '0'),
    GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET,
    GAME_CONFIG.SCORE_Y
  );
  // Daily HUD is the current score only. TODAY BEST stays on the Game Over
  // screen (and in the share result) so the social comparison sits at the
  // edge of the run, not beside the obstacle lane.
  if (!isDailyMode() && game.highScore > 0) {
    ctx.fillText(
      'HI ' + String(game.highScore).padStart(5, '0'),
      GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET - GAME_CONFIG.SCORE_HI_X_OFFSET,
      GAME_CONFIG.SCORE_Y
    );
  }
}

function drawScore() {
  const popping = Animations.scorePopFrames > 0 && isUpdatedMode() && !reducedMotion;
  if (popping) {
    // Ease from the quiet peak back to 1 across the death-shake window.
    const t = Animations.scorePopFrames / scorePopWindow(); // 1 → 0
    const scale = scorePopScale(t);
    const cx = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30;
    const cy = GAME_CONFIG.SCORE_Y - 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  paintHudScore();
  if (popping) ctx.restore();
  drawDebugHud();
}

// A visual alpha in [0, 1]. Anything else falls back so a bad tune cannot
// blank the blink or blow it back out to a full overlay.
function tunedUnitAlpha(key, fallback) {
  const tuned = cfg(key);
  return typeof tuned === 'number' && tuned >= 0 && tuned <= 1 ? tuned : fallback;
}

// Updated and Daily day blink uses DAY_DEATH_FLASH_PEAK_ALPHA, then eases
// across twilight to the night peak. Classic keeps a full-overlay value;
// the flash itself is not started. Reduced motion skips the ease and snaps.
function deathFlashPeakAlpha() {
  if (!isUpdatedMode()) return 1;
  const day = tunedUnitAlpha('DAY_DEATH_FLASH_PEAK_ALPHA', GAME_CONFIG.DAY_DEATH_FLASH_PEAK_ALPHA);
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return day;
  const night = tunedUnitAlpha(
    'NIGHT_DEATH_FLASH_PEAK_ALPHA',
    GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA
  );
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return night;
  if (reducedMotion) return day;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return day + (night - day) * t;
}

// PR-C: white-flash overlay drawn on top of the world during the first few
// post-death frames. Mode-gated; reduce-motion caps it at 1 frame. The
// decay is scaled by the day or night peak so Updated/Daily never start
// at a full white overlay.
function drawDeathFlash() {
  if (Animations.deathFlashFrames <= 0) return;
  const alpha = (Animations.deathFlashFrames / cfg('DEATH_FLASH_FRAMES')) * deathFlashPeakAlpha();
  ctx.save();
  ctx.fillStyle = 'rgba(' + cfg('DEATH_FLASH_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.restore();
}

// Classic invite, unchanged: 0.3 → 0.7 at rate 0.08. Updated and Daily
// read the quieter base, amplitude, and rate through cfg(). A value that
// would leave 0.3–0.7, swing wider than 0.4, or pulse faster than 0.08
// falls back to the quiet defaults. Reduced motion in Updated and Daily
// holds the midpoint. The QA hold freezes the quieter peak, and under
// reduced motion paints that midpoint at half ink.
function updatedIdlePulseTuning() {
  const classicMin = 0.3;
  const classicMax = 0.7;
  const classicAmp = 0.4;
  const classicRate = 0.08;
  let base = cfg('UPDATED_IDLE_PULSE_BASE');
  let amplitude = cfg('UPDATED_IDLE_PULSE_AMPLITUDE');
  let rate = cfg('UPDATED_IDLE_PULSE_RATE');
  const baseOk =
    typeof base === 'number' && Number.isFinite(base) && base >= classicMin && base <= classicMax;
  const ampOk =
    typeof amplitude === 'number' &&
    Number.isFinite(amplitude) &&
    amplitude >= 0 &&
    amplitude <= classicAmp;
  if (!baseOk || !ampOk || base + amplitude > classicMax) {
    base = GAME_CONFIG.UPDATED_IDLE_PULSE_BASE;
    amplitude = GAME_CONFIG.UPDATED_IDLE_PULSE_AMPLITUDE;
  }
  const rateOk =
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= classicRate;
  if (!rateOk) rate = GAME_CONFIG.UPDATED_IDLE_PULSE_RATE;
  return { base: base, amplitude: amplitude, rate: rate };
}

function idleStartPulseAlpha(frame) {
  // Classic parity, including reduced motion and ?qaIdle=1.
  if (!isUpdatedMode()) {
    return 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(frame * 0.08));
  }
  const tuned = updatedIdlePulseTuning();
  if (reducedMotion) {
    const mid = tuned.base + tuned.amplitude * 0.5;
    if (game.qaIdleHold > 0) return mid * 0.5;
    return mid;
  }
  if (game.qaIdleHold > 0) return tuned.base + tuned.amplitude;
  return tuned.base + tuned.amplitude * (0.5 + 0.5 * Math.sin(frame * tuned.rate));
}

// Readable labels on phones (R1). The canvas is 600 logical px wide and is
// drawn smaller than that on a phone (about 0.62x on an iPhone 13), so an
// 11-16px label lands under 10 CSS px. labelPx() raises a small label to
// about READABLE_LABEL_CSS_PX on screen, never past LABEL_PX_CAP logical px
// so the layout still fits, and leaves desktop (scale 1 or more) unchanged.
const READABLE_LABEL_CSS_PX = 12;
const LABEL_PX_CAP = 20;
function labelPx(px) {
  const scale = canvasCssScale;
  if (!(scale > 0) || scale >= 1) return px;
  const readable = Math.min(Math.ceil(READABLE_LABEL_CSS_PX / scale), LABEL_PX_CAP);
  return Math.max(px, readable);
}

function drawIdleScreen() {
  // Game coordinates, same as the countdown. The context is already scaled
  // from the bitmap to the 600×200 board, so bitmap width would park the
  // invite on the right edge of a wide window.
  const font = cfg('SCORE_FONT_FAMILY');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.textAlign = 'center';

  ctx.fillStyle = 'white';
  // The title stays a step above its subtitle when that is enlarged (R1).
  ctx.font = Math.max(22, labelPx(13) + 6) + 'px ' + font;
  ctx.fillText('REX RUN', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 16);

  const pulseAlpha = idleStartPulseAlpha(game.animFrame);
  ctx.fillStyle = 'rgba(255, 255, 255, ' + pulseAlpha.toFixed(3) + ')';
  ctx.font = labelPx(13) + 'px ' + font;
  ctx.fillText(
    'TAP / PRESS SPACE TO START',
    GAME_CONFIG.CANVAS_W / 2,
    GAME_CONFIG.CANVAS_H / 2 + 12
  );
}

function drawGetReadyOverlay() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (game.graceFrames > GAME_CONFIG.GRACE_FRAMES * 0.33) {
    ctx.font = '28px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText('GET READY', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
    // Space/Tap does nothing on the first countdown, so don't promise a jump.
    // After death the same input skips straight into the run.
    if (game.countdownSkippable) {
      ctx.font = labelPx(14) + 'px ' + cfg('SCORE_FONT_FAMILY');
      ctx.fillText(
        'Press Space / Tap to start',
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 + 16
      );
    }
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(game.graceFrames / step);
    ctx.font = '48px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText(count || 'GO!', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 16);
  }
  drawDailyPreRunLine();
}

// The paused run's overlay (F2): PAUSED, and once the page is back the
// 3 2 1 before the run carries on. Static text, no pulse, so reduced
// motion sees the same thing. Light ink once the sky is night.
function drawResumeOverlay() {
  if (game.state !== STATE.PAUSED) return;
  const font = cfg('SCORE_FONT_FAMILY');
  const night = game.score >= GAME_CONFIG.DAY_NIGHT_START;
  ctx.textAlign = 'center';
  ctx.fillStyle = night ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  ctx.font = labelPx(14) + 'px ' + font;
  ctx.fillText('PAUSED', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 30);
  if (game.pauseHidden) return;
  ctx.font = '48px ' + font;
  ctx.fillText(
    String(resumeCountdownNumber()),
    GAME_CONFIG.CANVAS_W / 2,
    GAME_CONFIG.CANVAS_H / 2 + 16
  );
}

// One shared run, at the edge of the run only. Static text — no pulse — so
// prefers-reduced-motion has nothing extra to suppress. The RUNNING loop
// never calls this overlay, and the state check keeps it off if it did.
function drawDailyPreRunLine() {
  if (game.state !== STATE.WAITING || !isDailyMode()) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.font = labelPx(12) + 'px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(dailyPreRunLine(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 46);
}

// The run's last frame, still, under the Game Over card (R2), so the player
// can see which obstacle ended the run. No shake, no particles, no HUD (the
// card shows the score).
function drawDeathBackdrop() {
  drawBackground();
  drawHills();
  drawGround();
  drawClouds();
  drawObstacles();
  drawDino();
}

// Game Over dims the last frame instead of hiding it. 0.6 black keeps the
// dino and the obstacle readable while white score text stays above 4.5:1
// contrast even over the white day sky (white on #666 is about 5.7:1).
const GAME_OVER_DIM_ALPHA = 0.6;

// Game Over text colours (A1). Every label, hint and the Daily title meets
// 4.5:1 against the lightest thing behind it: the dimmed white day sky
// (#666). Hierarchy comes from size; white is kept for the big numbers.
const GAME_OVER_LABEL_COLOR = '#e6e6e6';
const GAME_OVER_DAILY_COLOR = '#ffe2ad';

function drawGameOverScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  const t = Math.min(Animations.deathAnimFrame / deathAnimFrames(), 1);
  const displayScore = Math.round(t * Math.floor(game.score));

  // Repaint the scene every time, so the dim never stacks frame on frame.
  drawDeathBackdrop();
  ctx.fillStyle = 'rgba(0, 0, 0, ' + GAME_OVER_DIM_ALPHA + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.textAlign = 'center';

  if (isDailyMode()) {
    if (game.isNewTodayBest) {
      // Same takeover as free-play NEW BEST. The daily number sits higher so
      // it doesn't land on the title. Static text — no pulse.
      ctx.fillStyle = GAME_OVER_DAILY_COLOR;
      ctx.font = labelPx(13) + 'px ' + font;
      ctx.fillText(
        '📅 DAILY #' + dailyNumber(),
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 70
      );

      ctx.fillStyle = 'white';
      ctx.font = labelPx(15) + 'px ' + font;
      // A label enlarged for a phone moves up by the same amount, so it
      // keeps its gap above the big score.
      ctx.fillText(
        '★  NEW TODAY BEST  ★',
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 36 - (labelPx(15) - 15)
      );

      ctx.font = '42px ' + font;
      ctx.fillText(
        String(displayScore).padStart(5, '0'),
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 4
      );

      if (game.previousDailyBest > 0) {
        ctx.fillStyle = GAME_OVER_LABEL_COLOR;
        ctx.font = labelPx(13) + 'px ' + font;
        const improvement = displayScore - game.previousDailyBest;
        ctx.fillText(
          '+' + improvement + ' over your previous best',
          GAME_CONFIG.CANVAS_W / 2,
          GAME_CONFIG.CANVAS_H / 2 + 28
        );
      }
    } else {
      // Daily challenge death screen — THIS RUN vs TODAY BEST, no all-time comparison
      const todayBest = game.dailyBest;
      const delta = todayBest > 0 ? todayBest - displayScore : 0;

      ctx.fillStyle = GAME_OVER_DAILY_COLOR;
      ctx.font = labelPx(13) + 'px ' + font;
      ctx.fillText(
        '📅 DAILY #' + dailyNumber(),
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 48
      );

      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(12) + 'px ' + font;
      ctx.fillText('THIS RUN', GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(
        String(displayScore).padStart(5, '0'),
        GAME_CONFIG.CANVAS_W * 0.2,
        GAME_CONFIG.CANVAS_H / 2 + 14
      );

      if (todayBest > 0) {
        ctx.fillStyle = GAME_OVER_LABEL_COLOR;
        ctx.font = labelPx(16) + 'px ' + font;
        ctx.fillText(
          delta > 0 ? '← +' + delta + ' →' : '← best →',
          GAME_CONFIG.CANVAS_W / 2,
          GAME_CONFIG.CANVAS_H / 2 - 10
        );
        ctx.fillStyle = GAME_OVER_LABEL_COLOR;
        ctx.font = labelPx(11) + 'px ' + font;
        ctx.fillText('today best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

        ctx.fillStyle = GAME_OVER_LABEL_COLOR;
        ctx.font = labelPx(12) + 'px ' + font;
        ctx.fillText('TODAY BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
        ctx.fillStyle = 'white';
        ctx.font = '28px ' + font;
        ctx.fillText(
          String(todayBest).padStart(5, '0'),
          GAME_CONFIG.CANVAS_W * 0.8,
          GAME_CONFIG.CANVAS_H / 2 + 14
        );
      }
    }

    // Show or hide the DOM share button based on animation completion.
    // The hint lands with the button, after the count-up, so the social
    // nudge doesn't compete with the score.
    const shareBtnEl = document.getElementById('share-btn');
    if (shareBtnEl && shareBtnEl.style) {
      shareBtnEl.style.display = t >= 1 ? 'block' : 'none';
      if (t >= 1) {
        // This write used to look only at the live flash, so a hold or a
        // tap was put back to Copy result on the next Game Over frame.
        // ?qaShare=1 keeps ✓ Copied! for the whole settled screen.
        const qaHold = game.qaCopyHold > 0 || game.qaShareHold > 0;
        const copied = qaHold || Animations.copyFlashFrames > 0 || qa.share;
        shareBtnEl.textContent = copied ? '✓ Copied!' : '📋 Copy result';
        const damped = reducedMotion && copied && (qaHold || qa.share);
        markShareCopied(shareBtnEl, copied, damped);
      }
    }
    if (t >= 1) drawDailyDeathHint();
  } else {
    if (game.isFirstRun) {
      // First run ever (R3): nothing to beat yet, so just the score.
      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(15) + 'px ' + font;
      ctx.fillText(
        'SCORE',
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 36 - (labelPx(15) - 15)
      );
      ctx.fillStyle = 'white';
      ctx.font = '42px ' + font;
      ctx.fillText(
        String(displayScore).padStart(5, '0'),
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 4
      );
    } else if (game.isNewBest) {
      // New record — celebration takeover
      ctx.fillStyle = 'white';
      ctx.font = labelPx(15) + 'px ' + font;
      // A label enlarged for a phone moves up by the same amount, so it
      // keeps its gap above the big score.
      ctx.fillText(
        '★  NEW BEST  ★',
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 36 - (labelPx(15) - 15)
      );

      ctx.font = '42px ' + font;
      ctx.fillText(
        String(displayScore).padStart(5, '0'),
        GAME_CONFIG.CANVAS_W / 2,
        GAME_CONFIG.CANVAS_H / 2 - 4
      );

      if (game.previousHighScore > 0) {
        ctx.fillStyle = GAME_OVER_LABEL_COLOR;
        ctx.font = labelPx(13) + 'px ' + font;
        const improvement = displayScore - game.previousHighScore;
        ctx.fillText(
          '+' + improvement + ' over your previous best',
          GAME_CONFIG.CANVAS_W / 2,
          GAME_CONFIG.CANVAS_H / 2 + 28
        );
      }
    } else {
      // Normal death — side-by-side comparison
      const delta = game.highScore - Math.floor(game.score);
      const scoreStr = String(displayScore).padStart(5, '0');
      const bestStr = String(game.highScore).padStart(5, '0');

      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(12) + 'px ' + font;
      ctx.fillText('THIS RUN', GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(scoreStr, GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 + 14);

      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(16) + 'px ' + font;
      ctx.fillText('← ' + delta + ' →', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(11) + 'px ' + font;
      ctx.fillText('from best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

      ctx.fillStyle = GAME_OVER_LABEL_COLOR;
      ctx.font = labelPx(12) + 'px ' + font;
      ctx.fillText('YOUR BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(bestStr, GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 + 14);
    }

    ctx.fillStyle = GAME_OVER_LABEL_COLOR;
    ctx.font = labelPx(13) + 'px ' + font;
    ctx.fillText(
      'Tap / Press Space to Restart',
      GAME_CONFIG.CANVAS_W / 2,
      GAME_CONFIG.CANVAS_H - 16
    );
  }
  drawDebugHud();
}

// One shared run, on the death screen only. Self-gated so a WAITING or
// RUNNING frame cannot paint it, and Classic/Updated never reach this call.
// No frame-driven alpha — prefers-reduced-motion has nothing to suppress.
function drawDailyDeathHint() {
  if (!isDailyMode()) return;
  if (Animations.deathAnimFrame < deathAnimFrames()) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = GAME_OVER_LABEL_COLOR;
  ctx.font = labelPx(12) + 'px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(DAILY_DEATH_HINT, GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H - 16);
}

function milestoneFontPx() {
  const tuned = cfg('UPDATED_MILESTONE_FONT_PX');
  if (typeof tuned === 'number' && tuned >= 12 && tuned <= 18) return tuned;
  return GAME_CONFIG.UPDATED_MILESTONE_FONT_PX;
}

function milestoneTextFrames() {
  const tuned = cfg('UPDATED_MILESTONE_TEXT_FRAMES');
  const fallback = GAME_CONFIG.UPDATED_MILESTONE_TEXT_FRAMES;
  let frames =
    typeof tuned === 'number' && tuned >= 1 && tuned <= GAME_CONFIG.MILESTONE_FRAMES
      ? Math.round(tuned)
      : fallback;
  if (reducedMotion) frames = Math.max(2, Math.round(frames * 0.5));
  return frames;
}

function milestonePeakAlpha() {
  return tunedUnitAlpha('UPDATED_MILESTONE_PEAK_ALPHA', GAME_CONFIG.UPDATED_MILESTONE_PEAK_ALPHA);
}

function milestoneLabelFill() {
  return scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
}

// Null once the Updated/Daily word has left. Classic always has a paint
// while the wash timer is still running. framesRemaining is the value
// before this frame's countdown.
function milestoneLabelForFrame(framesRemaining) {
  if (!isUpdatedMode()) {
    return {
      font: 'bold 22px ' + cfg('SCORE_FONT_FAMILY'),
      alpha: framesRemaining / GAME_CONFIG.MILESTONE_FRAMES,
    };
  }
  const textFrames = milestoneTextFrames();
  const elapsed = GAME_CONFIG.MILESTONE_FRAMES - framesRemaining;
  if (elapsed < 0 || elapsed >= textFrames) return null;
  const remain = textFrames - elapsed;
  return {
    font: 'bold ' + milestoneFontPx() + 'px ' + cfg('SCORE_FONT_FAMILY'),
    alpha: (remain / textFrames) * milestonePeakAlpha(),
  };
}

function paintMilestoneLabel(paint) {
  ctx.save();
  ctx.globalAlpha = paint.alpha;
  ctx.fillStyle = milestoneLabelFill();
  ctx.textAlign = 'center';
  ctx.font = paint.font;
  ctx.fillText(game.milestoneText, GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 30);
  ctx.restore();
}

function drawMilestoneFlash() {
  if (Animations.milestoneFrames <= 0) return;
  // The playtest hold paints the quiet peak itself. Skip the live word
  // on those frames so the two inks do not stack. The wash timer still
  // counts down (in updateRunning, once per sim slice).
  const holdCoversWord = isUpdatedMode() && game.qaLevelHold > 0;
  const paint = milestoneLabelForFrame(Animations.milestoneFrames);
  if (paint && !holdCoversWord) paintMilestoneLabel(paint);
}

// Steady quiet peak while ?qaLevel=1's hold is running, so the short
// word can be captured. Reduced motion keeps half that peak. Classic
// never enters. Does not touch the wash timer.
function qaLevelPaintAlpha() {
  const peak = milestonePeakAlpha();
  if (!reducedMotion) return peak;
  return peak * 0.5;
}

function drawQaLevelLabel() {
  if (!isUpdatedMode() || game.qaLevelHold <= 0) return;
  if (!game.milestoneText) return;
  paintMilestoneLabel({
    font: 'bold ' + milestoneFontPx() + 'px ' + cfg('SCORE_FONT_FAMILY'),
    alpha: qaLevelPaintAlpha(),
  });
}

function newBestFontPx() {
  const tuned = cfg('UPDATED_NEW_BEST_FONT_PX');
  if (typeof tuned === 'number' && tuned >= 10 && tuned <= 13) return tuned;
  return GAME_CONFIG.UPDATED_NEW_BEST_FONT_PX;
}

function newBestTextFrames() {
  const tuned = cfg('UPDATED_NEW_BEST_FRAMES');
  const fallback = GAME_CONFIG.UPDATED_NEW_BEST_FRAMES;
  let frames =
    typeof tuned === 'number' && tuned >= 1 && tuned <= GAME_CONFIG.NEW_BEST_FRAMES
      ? Math.round(tuned)
      : fallback;
  if (reducedMotion) frames = Math.max(2, Math.round(frames * 0.5));
  return frames;
}

function newBestPeakAlpha() {
  return tunedUnitAlpha('UPDATED_NEW_BEST_PEAK_ALPHA', GAME_CONFIG.UPDATED_NEW_BEST_PEAK_ALPHA);
}

// Classic always uses the stored countdown. Updated and Daily use the
// quiet length, including the reduced-motion shorten.
function newBestDuration() {
  if (!isUpdatedMode()) return GAME_CONFIG.NEW_BEST_FRAMES;
  return newBestTextFrames();
}

// Drop below the milestone flash when both fire on the same frame
// (level-up + new-best at score = highScore + 100).
function newBestBadgeY() {
  return Animations.milestoneFrames > 0 ? 100 : 70;
}

function newBestBadgePaint(framesRemaining) {
  if (!isUpdatedMode()) {
    return {
      font: 'bold 14px ' + cfg('SCORE_FONT_FAMILY'),
      alpha: framesRemaining / GAME_CONFIG.NEW_BEST_FRAMES,
      fill: '#ffd700',
      y: newBestBadgeY(),
    };
  }
  const duration = newBestTextFrames();
  const peak = newBestPeakAlpha();
  const t = duration > 0 ? Math.min(1, framesRemaining / duration) : 0;
  return {
    font: 'bold ' + newBestFontPx() + 'px ' + cfg('SCORE_FONT_FAMILY'),
    alpha: t * peak,
    fill: '#ffd700',
    y: newBestBadgeY(),
  };
}

function paintNewBestBadge(paint) {
  ctx.save();
  ctx.globalAlpha = paint.alpha;
  ctx.fillStyle = paint.fill;
  ctx.textAlign = 'left';
  ctx.font = paint.font;
  ctx.fillText('NEW BEST!', GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET, paint.y);
  ctx.restore();
}

function drawNewBestBadge() {
  if (Animations.newBestFrames <= 0) return;
  // The playtest hold paints the quiet peak itself. Skip the live word
  // on those frames so the two golds do not stack. The countdown still runs
  // (in updateRunning, once per sim slice).
  const holdCovers = isUpdatedMode() && game.qaNewBestHold > 0;
  if (!holdCovers) paintNewBestBadge(newBestBadgePaint(Animations.newBestFrames));
}

// Steady quiet peak while ?qaNewBest=1's hold is running, so the short
// badge can be captured. Reduced motion keeps half that peak. Classic
// never enters. Does not touch newBestFrames or the high score.
function qaNewBestPaintAlpha() {
  const peak = newBestPeakAlpha();
  if (!reducedMotion) return peak;
  return peak * 0.5;
}

function drawQaNewBest() {
  if (!isUpdatedMode() || game.qaNewBestHold <= 0) return;
  paintNewBestBadge({
    font: 'bold ' + newBestFontPx() + 'px ' + cfg('SCORE_FONT_FAMILY'),
    alpha: qaNewBestPaintAlpha(),
    fill: '#ffd700',
    y: newBestBadgeY(),
  });
}

// --- Particle system (PR-A) ---
// Pooled — slots with life <= 0 are reusable, no allocation per emit.
// Cosmetic only: uses Math.random() instead of game.rng so it can't perturb
// gameplay determinism (spawn jitter / obstacle picks stay reproducible).

function isDailyMode() {
  return game.mode === MODES.DAILY;
}
function isUpdatedMode() {
  return game.mode === MODES.UPDATED || game.mode === MODES.DAILY;
}

function hexChannels(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Day foot dust stays the brown on the jump and land kinds. In Updated and
// Daily it eases toward quiet night ground dust with the sky. Classic keeps
// the day brown. Reduced motion snaps at full night, same as the sky.
function landDustColor(dayColor) {
  if (!isUpdatedMode()) return dayColor;
  const nightChannels =
    hexChannels(cfg('NIGHT_LAND_DUST_COLOR')) || hexChannels(GAME_CONFIG.NIGHT_LAND_DUST_COLOR);
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return dayColor;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) {
    return '#' + nightChannels.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  if (reducedMotion) return dayColor;
  const dayChannels = hexChannels(dayColor);
  if (!dayChannels) return dayColor;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const mixed = dayChannels.map((c, i) => Math.round(c + (nightChannels[i] - c) * t));
  return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Day peaks stay on the jump and land kinds. In Updated and Daily the
// peak eases toward the night key with the sky. Classic keeps the day
// peak. Reduced motion snaps at full night, same as the color.
function landDustAlpha(kind) {
  const config = Particles.KINDS[kind];
  const day = typeof config.alpha === 'number' ? config.alpha : 1;
  if (!isUpdatedMode() || (kind !== 'jump' && kind !== 'land')) return day;
  const key = kind === 'jump' ? 'NIGHT_JUMP_DUST_ALPHA' : 'NIGHT_LAND_DUST_ALPHA';
  const night = tunedUnitAlpha(key, GAME_CONFIG[key]);
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return day;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return night;
  if (reducedMotion) return day;
  const t =
    (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return day + (night - day) * t;
}

// A visual count of at least one mote. Anything else falls back so a bad
// tune cannot blank the puff or emit a fractional mote.
function tunedDustCount(key, fallback) {
  const tuned = cfg(key);
  if (typeof tuned !== 'number' || !Number.isFinite(tuned) || tuned < 1) return fallback;
  return Math.round(tuned);
}

// Day counts stay on the kinds. Night counts snap on at full night so
// twilight does not emit a fraction of a mote. Classic keeps the day count.
function landDustCount(kind) {
  const config = Particles.KINDS[kind];
  if (!isUpdatedMode() || (kind !== 'jump' && kind !== 'land')) return config.count;
  if (scoreForNightSky(game.score) < GAME_CONFIG.DAY_NIGHT_END) return config.count;
  const key = kind === 'jump' ? 'NIGHT_JUMP_DUST_COUNT' : 'NIGHT_LAND_DUST_COUNT';
  return tunedDustCount(key, GAME_CONFIG[key]);
}

// Day life stays on the kinds. Night life snaps on at full night and is
// shared by jump and land. A tune under 2 frames falls back.
function landDustLife(kind) {
  const config = Particles.KINDS[kind];
  if (!isUpdatedMode() || (kind !== 'jump' && kind !== 'land')) return config.life;
  if (scoreForNightSky(game.score) < GAME_CONFIG.DAY_NIGHT_END) return config.life;
  const tuned = cfg('NIGHT_LAND_DUST_LIFE');
  if (typeof tuned !== 'number' || !Number.isFinite(tuned) || tuned < 2) {
    return GAME_CONFIG.NIGHT_LAND_DUST_LIFE;
  }
  return Math.round(tuned);
}

const Particles = (() => {
  const POOL_SIZE = 80;
  const KINDS = Object.freeze({
    // Day foot whisper in Updated and Daily. The old takeoff was 6 motes
    // living 18 frames and flung ±1.5px, so a mote could travel about 30px
    // from the feet into the lane. 3 motes, life 8, and vxSpread 0.6 keep a
    // full life inside 9px of the foot, under the body. The rise is
    // -1.2..-0.4 with gravity 0.10: about 7px up, and the slow mote does
    // not fall through the ground. Peak alpha 0.5 is half the old solid
    // ink. Size stays 3 and the brown stays #9c8770. Night still recolors
    // through landDustColor, and once the sky is fully night the peak,
    // count, and life come from the night dust keys. Reduced motion still
    // applies REDUCED_FACTOR and half life on top of that. Classic never
    // emits.
    // Second-jump puff (M3): a small ring of motes kicked out under the feet
    // in mid-air. Pale grey so it reads on the day and night sky. Reduced
    // motion still applies REDUCED_FACTOR and half life. Classic never emits.
    doubleJump: {
      count: 8,
      color: '#b8b8b8',
      size: 3,
      life: 14,
      alpha: 0.6,
      vyMin: 0.4,
      vyMax: 1.6,
      vxSpread: 2.2,
      gravity: 0.02,
    },
    jump: {
      count: 3,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.5,
      vyMin: -1.2,
      vyMax: -0.4,
      vxSpread: 0.6,
      gravity: 0.1,
    },
    // Landing whisper. The old burst was 9 motes living 14 frames and flung
    // ±2.5px, about 39px toward the next cactus. 5 motes is still more than
    // a takeoff, so the contact reads, but life 8 and vxSpread 0.7 hold it
    // inside 10px of the foot. The rise is -0.9..-0.4 with gravity 0.12,
    // about 4px up, flatter than the takeoff. Peak alpha 0.4 is softer than
    // the takeoff so the extra motes do not stack into a cloud. Same brown,
    // same night recolor, and the same night peak, count, and life once
    // the sky is fully night. Same reduced-motion damping. Classic never
    // emits.
    // Fast-fall slam (M1). A heavier landing than the whisper: more motes,
    // thrown wider and higher, so dropping onto the ground reads as weight.
    // Same brown. Reduced motion still applies REDUCED_FACTOR and half life.
    // Classic never emits.
    slam: {
      count: 12,
      color: '#9c8770',
      size: 3,
      life: 16,
      alpha: 0.55,
      vyMin: -2.4,
      vyMax: -0.8,
      vxSpread: 2.6,
      gravity: 0.16,
    },
    land: {
      count: 5,
      color: '#9c8770',
      size: 3,
      life: 8,
      alpha: 0.4,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.7,
      gravity: 0.12,
    },
    // Late-run heel whisper in Updated and Daily. One grey mote per frame
    // once speed is near the plateau, at the heel, off the obstacle lane.
    // The old mote was rgba alpha 0.55 for 10 frames and drifted ±0.4px,
    // so about ten specks stacked into a smear on the ground line where
    // cacti arrive. Alpha 0.28 is about half that ink. Life 6 lets the
    // stack die at the heel. vxSpread 0.2 keeps a full life inside 2px.
    // Size stays 2 so the speck is still visible on the night sky. The
    // grey stays 150,150,150. Reduced motion still applies REDUCED_FACTOR
    // and half life. Classic never emits.
    trail: {
      count: 1,
      color: 'rgba(150,150,150,0.28)',
      size: 2,
      life: 6,
      vyMin: -0.1,
      vyMax: 0.1,
      vxSpread: 0.2,
      gravity: 0,
    },
    // Death puff in Updated and Daily. Classic never emits. The old burst
    // was 22 motes living 24 frames and flung ±4px/frame, so a mote could
    // leave the 40px dino and land on the cactus. Round 1 cut that to 8
    // motes, life 12, and vxSpread 1: the farthest mote sat 12px from the
    // chest, still on the body, but it lived the whole shake and crowded
    // the sprite edge. Round 2 is one step quieter. 5 motes is still more
    // than a jump puff, so the hit reads. Life 8 dies before the 12-frame
    // nudge ends. vxSpread 0.7 keeps a full life inside about 6px of the
    // chest; with the emit jitter that is still on the body, not on the
    // cactus. Vertical stays -1.2..0.4 with gravity 0.10: about 7px up and
    // 6px down, inside the 50px dino. Size stays 3 and the red stays
    // #d04a2a. Reduced motion still applies REDUCED_FACTOR and half life.
    // The ?qaCollision=1 hold paints this quieter cluster; it does not
    // restyle this kind.
    collision: {
      count: 5,
      color: '#d04a2a',
      size: 3,
      life: 8,
      vyMin: -1.2,
      vyMax: 0.4,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    // Level gold at the score in Updated and Daily. Classic never emits.
    // The old burst was 20 motes living 40 frames and flung ±3px/frame,
    // a 120px spray toward the lane. Round 1 cut that to 10 motes, life
    // 20, and vxSpread 1.2: about 24px off the number, so the celebration
    // still sparkled toward the lane. Round 2 is one step quieter. 6
    // motes is still more than a jump puff, so the level reads. Life 12
    // and vxSpread 0.7 keep a full life inside about 12px of the number,
    // including emit jitter. The rise stays -1.6..-0.5 with gravity 0.10:
    // about 13px up, and the slow mote barely settles, so it stays on the
    // score and does not fountain off the top or fall through the HUD.
    // Peak alpha 0.7 is under solid gold so the puff does not sparkle.
    // Size stays 3 and the gold stays #ffd700. Reduced motion still
    // applies REDUCED_FACTOR and half life. The ?qaConfetti=1 hold paints
    // a dark block and does not restyle this kind. Reduced motion halves
    // that hold and its ink.
    confetti: {
      count: 6,
      color: '#ffd700',
      size: 3,
      life: 12,
      alpha: 0.7,
      vyMin: -1.6,
      vyMax: -0.5,
      vxSpread: 0.7,
      gravity: 0.1,
    },
    // Once-per-run plateau cue in Updated and Daily. The old puff was 8
    // motes living 24 frames and flung ±0.6px. Gravity 0.02 never caught
    // the -1 rise, so a mote was still climbing at the end: about 18px up
    // and 17px toward the lane, into the band where cactus feet arrive.
    // 4 motes, life 12, and vxSpread 0.3 keep a full life inside 7px of
    // the heel. The rise is -0.9..-0.4 with gravity 0.06: about 7px up,
    // and the slow mote does not fall through the ground. Peak alpha 0.45
    // is under half the old solid ink. On the night sky that is still a
    // cool pale speck, louder than the grey trail, and it stays at the
    // feet. Size stays 2. Color stays #c5d4e4. Reduced motion still
    // applies REDUCED_FACTOR and half life. Classic never emits.
    plateau: {
      count: 4,
      color: '#c5d4e4',
      size: 2,
      life: 12,
      alpha: 0.45,
      vyMin: -0.9,
      vyMax: -0.4,
      vxSpread: 0.3,
      gravity: 0.06,
    },
    // QA/debug only — not for players. Dark so it reads on the white day
    // sky, and slow so a 40-frame life stays at the heel instead of walking
    // the old ±1.4 spread up the lane. Production keeps `plateau`. The
    // ?qaPlateau=1 paint is the hold, not this emit: a full pool or the
    // short night life cannot hide the cluster.
    plateauQa: {
      count: 4,
      color: '#3d4f63',
      size: 2,
      life: 40,
      vyMin: -0.2,
      vyMax: -0.08,
      vxSpread: 0.08,
      gravity: 0.002,
    },
  });
  const REDUCED_FACTOR = 0.25;
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 0,
      color: '',
      gravity: 0,
      alpha: 1,
    });
  }
  return {
    POOL_SIZE,
    KINDS,
    particles: pool,
    emit(kind, x, y) {
      if (!isUpdatedMode()) return 0;
      const config = KINDS[kind];
      if (!config) return 0;
      const foot = kind === 'jump' || kind === 'land';
      let count = foot ? landDustCount(kind) : config.count;
      let life = foot ? landDustLife(kind) : config.life;
      if (reducedMotion) count = Math.max(1, Math.round(count * REDUCED_FACTOR));
      if (reducedMotion) life = Math.max(2, Math.round(life * 0.5));
      let emitted = 0;
      for (let i = 0; i < pool.length && emitted < count; i++) {
        const p = pool[i];
        if (p.life > 0) continue;
        p.x = x + (Math.random() - 0.5) * cfg('PARTICLE_EMIT_SPREAD');
        p.y = y;
        p.vx = (Math.random() - 0.5) * 2 * config.vxSpread;
        p.vy = config.vyMin + Math.random() * (config.vyMax - config.vyMin);
        p.maxLife = life;
        p.life = life;
        p.size = config.size;
        p.color = foot ? landDustColor(config.color) : config.color;
        p.gravity = config.gravity;
        p.alpha = foot ? landDustAlpha(kind) : typeof config.alpha === 'number' ? config.alpha : 1;
        emitted++;
      }
      return emitted;
    },
    update() {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.life--;
      }
    },
    draw() {
      const prevAlpha = ctx.globalAlpha;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        const peak = typeof p.alpha === 'number' ? p.alpha : 1;
        ctx.globalAlpha = (p.life / p.maxLife) * peak;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = prevAlpha;
    },
    reset() {
      for (let i = 0; i < pool.length; i++) pool[i].life = 0;
    },
  };
})();

// == FEATURE REGISTRY ==
// Declarative ordering for ambient features that run every RUNNING frame.
// Each entry has an id (test snapshot anchor), an optional update, a draw,
// and a layer that maps it to a draw-phase. Feature functions self-gate
// (mode + reduced-motion); the registry only controls *when in the frame*
// they fire. WAITING/DEAD branches are still hand-written — they use a
// different subset and would only get a per-feature skip-flag if forced
// through here.
// Speed streaks (M2). Alpha 0 below the start speed, in Classic and under
// reduced motion; ramps to SPEED_LINES_ALPHA at the full speed.
function speedLinesAlpha() {
  if (!isUpdatedMode() || reducedMotion) return 0;
  const start = cfg('SPEED_LINES_START_SPEED');
  const full = cfg('SPEED_LINES_FULL_SPEED');
  const peak = cfg('SPEED_LINES_ALPHA');
  if (game.currentSpeed <= start) return 0;
  const t = full > start ? Math.min(1, (game.currentSpeed - start) / (full - start)) : 1;
  return Math.max(0, Math.min(1, peak * t));
}

// Positions come from the frame count, not randomness, so a streak glides
// steadily instead of flickering. They stay in the sky band (y 22..82),
// above the obstacle lane.
function drawSpeedLines() {
  const alpha = speedLinesAlpha();
  if (alpha <= 0) return;
  const W = GAME_CONFIG.CANVAS_W;
  const speed = game.currentSpeed;
  const night = scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START;
  const count = Math.max(0, Math.min(12, Math.round(cfg('SPEED_LINES_COUNT'))));
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = night ? '#8a8fb0' : '#a0a0a0';
  ctx.lineWidth = 1;
  const span = W + 160;
  const len = 24 + speed * 4;
  for (let i = 0; i < count; i++) {
    const y = 22 + ((i * 37) % 60);
    const x = ((((W - game.animFrame * speed * 1.8 - i * 173) % span) + span) % span) - 80;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.globalAlpha = prevAlpha;
}

// Slam kick offset in px for this draw (M2): 0 in Classic, under reduced
// motion and once the kick has eased out.
function slamKickOffset() {
  if (!isUpdatedMode() || reducedMotion || Animations.slamKickFrames <= 0) return 0;
  const frames = cfg('SLAM_KICK_FRAMES');
  if (!(frames > 0)) return 0;
  const px = Math.max(0, Math.min(8, cfg('SLAM_KICK_PX')));
  return px * Math.min(1, Animations.slamKickFrames / frames);
}

const FEATURES = Object.freeze([
  { id: 'hills', layer: 'background', update: updateHills, draw: drawHills },
  { id: 'clouds', layer: 'background', update: updateClouds, draw: drawClouds },
  { id: 'speedLines', layer: 'background', update: null, draw: drawSpeedLines },
  { id: 'particles', layer: 'foreground', update: Particles.update, draw: Particles.draw },
  { id: 'skyTint', layer: 'overlay', update: null, draw: drawSkyTint },
]);

function runFeatureUpdates() {
  for (const f of FEATURES) if (f.update) f.update();
}

function runFeatureDraws(layer) {
  for (const f of FEATURES) if (f.draw && f.layer === layer) f.draw();
}
