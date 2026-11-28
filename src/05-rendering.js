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
  drawSkyGlow();
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

// --- Colour tints (Updated and Daily only) ---
// The light changes as the run goes on; the sprites stay the original art.
// dusk climbs 0 to 1 from score 0 to DAY_NIGHT_START, night climbs 0 to 1
// across twilight. Classic returns null and is never tinted. Reduced motion
// holds the plain day look until DAY_NIGHT_END, then snaps to night.
function colourTintPhase() {
  if (!isUpdatedMode()) return null;
  const s = scoreForNightSky(game.score);
  const start = GAME_CONFIG.DAY_NIGHT_START;
  const end = GAME_CONFIG.DAY_NIGHT_END;
  if (s >= end) return { dusk: 1, night: 1 };
  if (reducedMotion || s <= 0) return { dusk: 0, night: 0 };
  if (s < start) return { dusk: s / start, night: 0 };
  return { dusk: 1, night: (s - start) / (end - start) };
}

// A tuned colour that is not '#rrggbb' falls back to the default.
function tunedHexChannels(key, fallback) {
  return hexChannels(cfg(key)) || hexChannels(fallback);
}

function mixChannels(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function channelsToHex(c) {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Colour and alpha of the horizon glow, or null when nothing is drawn.
function skyGlowTint() {
  const phase = colourTintPhase();
  if (!phase || phase.dusk <= 0) return null;
  const dusk = tunedHexChannels('DUSK_GLOW_COLOR', GAME_CONFIG.DUSK_GLOW_COLOR);
  const night = tunedHexChannels('NIGHT_GLOW_COLOR', GAME_CONFIG.NIGHT_GLOW_COLOR);
  const duskAlpha = tunedUnitAlpha('DUSK_GLOW_ALPHA', GAME_CONFIG.DUSK_GLOW_ALPHA);
  const nightAlpha = tunedUnitAlpha('NIGHT_GLOW_ALPHA', GAME_CONFIG.NIGHT_GLOW_ALPHA);
  const alpha = duskAlpha * phase.dusk + (nightAlpha - duskAlpha * phase.dusk) * phase.night;
  if (!(alpha > 0)) return null;
  return { color: channelsToHex(mixChannels(dusk, night, phase.night)), alpha };
}

// The ground line's ink: the sprite's own #535353 in Classic and at the
// start of a run, warming to DUSK_GROUND_COLOR, then NIGHT_GROUND_COLOR.
// Opacity stays groundPaintAlpha(). Other ground art (pits, ramps) can use
// this to match the line.
const GROUND_INK = '#535353';
function groundTintColor() {
  const phase = colourTintPhase();
  if (!phase || phase.dusk <= 0) return GROUND_INK;
  const day = hexChannels(GROUND_INK);
  const dusk = tunedHexChannels('DUSK_GROUND_COLOR', GAME_CONFIG.DUSK_GROUND_COLOR);
  const night = tunedHexChannels('NIGHT_GROUND_COLOR', GAME_CONFIG.NIGHT_GROUND_COLOR);
  return channelsToHex(mixChannels(mixChannels(day, dusk, phase.dusk), night, phase.night));
}

// Painted by drawBackground, over the sky and stars and under everything
// else, so every scene (Get Ready, the run, the death shake, Game Over)
// shows the same light. Clear at the top, so the page around the canvas
// still matches the sky; strongest at the horizon behind the obstacle lane.
function drawSkyGlow() {
  const tint = skyGlowTint();
  if (!tint || typeof ctx.createLinearGradient !== 'function') return;
  const c = hexChannels(tint.color).join(', ');
  const top = GAME_CONFIG.CANVAS_H * 0.2;
  const horizon = GAME_CONFIG.CANVAS_H - 12;
  const g = ctx.createLinearGradient(0, top, 0, horizon);
  g.addColorStop(0, 'rgba(' + c + ', 0)');
  g.addColorStop(1, 'rgba(' + c + ', ' + tint.alpha.toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H - top);
}

// A recoloured copy of the ground sprite. The sprite is one flat ink on
// transparency, so 'source-in' swaps the ink and keeps every pebble. One
// copy is cached; the colour only moves every few points of score.
let tintedGround = null;
function groundSpriteForTint() {
  const color = groundTintColor();
  if (color === GROUND_INK) return groundImage;
  if (tintedGround && tintedGround.color === color && tintedGround.src === groundImage.src) {
    return tintedGround.canvas;
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return groundImage;
  }
  const canvasEl = tintedGround ? tintedGround.canvas : document.createElement('canvas');
  const c = canvasEl && typeof canvasEl.getContext === 'function' && canvasEl.getContext('2d');
  if (!c) return groundImage;
  canvasEl.width = groundImage.width;
  canvasEl.height = groundImage.height;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, canvasEl.width, canvasEl.height);
  c.drawImage(groundImage, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, canvasEl.width, canvasEl.height);
  tintedGround = { color, src: groundImage.src, canvas: canvasEl };
  return canvasEl;
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
    const sprite = groundSpriteForTint();
    ctx.drawImage(sprite, game.groundX, groundY, groundImage.width, groundImage.height);
    ctx.drawImage(
      sprite,
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

// Gaps in the ground (G1): each one is cut out of the ground strip, sky
// colour from the ground line down, with a thin wall in the ground ink
// (groundTintColor, so it follows the dusk and night tints) at
// each edge so it reads as a hole and not a missing sprite. Drawn first in
// drawObstacles, under the cacti and the dino.
const PIT_LINE_FROM_BOTTOM = 16; // the ground sprite's line sits 16px above the canvas bottom
function drawPit(obstacle) {
  const top = GAME_CONFIG.CANVAS_H - PIT_LINE_FROM_BOTTOM;
  const x = Math.round(obstacle.x),
    w = Math.round(obstacle.width);
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(x, top, w, PIT_LINE_FROM_BOTTOM);
  // The dusk glow sits on the sky behind the ground; put it back in the hole.
  if (skyGlowTint() && typeof ctx.clip === 'function') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, w, PIT_LINE_FROM_BOTTOM);
    ctx.clip();
    drawSkyGlow();
    ctx.restore();
  }
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * groundPaintAlpha();
  ctx.fillStyle = groundTintColor();
  ctx.fillRect(x, top, 2, PIT_LINE_FROM_BOTTOM);
  ctx.fillRect(x + w - 2, top, 2, PIT_LINE_FROM_BOTTOM);
  ctx.globalAlpha = previousAlpha;
}

// A ramp (G2): a solid wedge in the ground ink, rising from the ground line
// to RAMP_RISE at its lip, where it drops straight down.
function drawRamp(obstacle) {
  const base = GAME_CONFIG.CANVAS_H - PIT_LINE_FROM_BOTTOM;
  const x = Math.round(obstacle.x),
    w = Math.round(obstacle.width),
    rise = GAME_CONFIG.RAMP_RISE;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * groundPaintAlpha();
  ctx.fillStyle = groundTintColor();
  ctx.beginPath();
  ctx.moveTo(x, base + 2);
  ctx.lineTo(x + w, base - rise);
  ctx.lineTo(x + w, base + 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = previousAlpha;
}

function drawObstacles() {
  game.obstacles.forEach((obstacle) => {
    if (obstacle.render === 'pit') drawPit(obstacle);
    if (obstacle.render === 'ramp') drawRamp(obstacle);
  });
  const brightness = obstacleNightBrightness();
  const previousFilter = ctx.filter;
  if (brightness > 1) ctx.filter = 'brightness(' + brightness.toFixed(2) + ')';
  try {
    game.obstacles.forEach((obstacle) => {
      if (obstacle.terrain) return;
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

// Rex motion (M8): the pose layer on top of the sprite. Visual only: the
// update reads dino and game but never writes them, so the hitbox, physics,
// spawning and game.rng() are untouched. Updated and Daily only; Classic
// keeps the original fixed stride and no pose, and reduced motion keeps
// everything still.
const rexMotion = {
  pitch: 0, // radians, eased toward rexPitchTarget() each sim frame
  runPhase: 0, // sim frames of stride, faster as the run speeds up
  recoilFrames: 0, // sim frames left on the hit recoil
  reset() {
    this.pitch = 0;
    this.runPhase = 0;
    this.recoilFrames = 0;
  },
};

function rexMotionOn() {
  return isUpdatedMode() && !reducedMotion;
}

// How many sprite frames one sim frame of stride is worth: 1 up to the
// reference speed, then in step with the scroll, capped.
function rexCadence() {
  const ref = cfg('DINO_CADENCE_REF_SPEED');
  const max = cfg('DINO_CADENCE_MAX');
  if (!(ref > 0)) return 1;
  return Math.max(1, Math.min(max > 1 ? max : 1, game.currentSpeed / ref));
}

// Slope of a ramp under the feet, in radians (negative tips the nose up).
function rexGroundSlope() {
  const here = groundRiseUnderFeet(0);
  const ahead = groundRiseUnderFeet(2);
  if (!(here > 0) && !(ahead > 0)) return 0;
  return -Math.atan((ahead - here) / 2);
}

// Where the body wants to point this frame.
function rexPitchTarget() {
  if (game.state !== STATE.RUNNING) return 0;
  if (dino.flipFrames > 0) return 0;
  const max = cfg('DINO_PITCH_MAX');
  if (dino.isJumping) {
    if (dino.dashFrames > 0) return max * 0.5;
    const p = dino.velocityY * cfg('DINO_AIR_PITCH');
    return Math.max(-max, Math.min(max, p));
  }
  if (dino.slideFrames > 0) return 0;
  const { INITIAL_SPEED, PLATEAU_SPEED } = GAME_CONFIG;
  const t = Math.max(
    0,
    Math.min(1, (game.currentSpeed - INITIAL_SPEED) / (PLATEAU_SPEED - INITIAL_SPEED))
  );
  return rexGroundSlope() + cfg('DINO_RUN_LEAN') * t;
}

// One sim frame of pose. Called from each state's update step.
function updateRexMotion() {
  updateNewRex();
  if (!rexMotionOn()) {
    rexMotion.pitch = 0;
    rexMotion.recoilFrames = 0;
    return;
  }
  if (game.state === STATE.RUNNING && !dino.isJumping && dino.slideFrames <= 0) {
    rexMotion.runPhase += rexCadence();
  }
  if (rexMotion.recoilFrames > 0) rexMotion.recoilFrames--;
  const ease = cfg('DINO_PITCH_EASE');
  const k = ease > 0 && ease <= 1 ? ease : 1;
  rexMotion.pitch += (rexPitchTarget() - rexMotion.pitch) * k;
  if (Math.abs(rexMotion.pitch) < 1e-4) rexMotion.pitch = 0;
}

// A hit starts the recoil; a fall into a gap does not (Rex just drops).
function startRexRecoil() {
  if (!rexMotionOn() || dino.inPit) return;
  rexMotion.recoilFrames = cfg('DINO_RECOIL_FRAMES');
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Offset and turn for the sprite this frame: { dx, dy, angle }. All 0 in
// Classic and under reduced motion.
function rexPose() {
  const pose = { dx: 0, dy: 0, angle: 0 };
  if (!rexMotionOn()) return pose;
  pose.angle = rexMotion.pitch;
  if (game.state === STATE.DEAD) {
    const total = cfg('DINO_RECOIL_FRAMES');
    if (!(total > 0) || dino.inPit) return pose;
    const u = 1 - Math.min(1, rexMotion.recoilFrames / total);
    pose.dx = -cfg('DINO_RECOIL_BACK_PX') * easeOutCubic(u);
    pose.dy = -cfg('DINO_RECOIL_HOP_PX') * Math.sin(Math.PI * u);
    pose.angle += -cfg('DINO_RECOIL_TILT') * Math.sin(Math.PI * u) * (1 - 0.5 * u);
    return pose;
  }
  if (game.state === STATE.RUNNING && !dino.isJumping && dino.slideFrames <= 0) {
    const period = GAME_CONFIG.RUN_FRAME_PERIOD;
    const step = (rexMotion.runPhase % period) / period;
    pose.dy = -Math.round(cfg('DINO_RUN_BOB_PX') * Math.sin(Math.PI * step));
  }
  return pose;
}

// Which run sprite: Classic keeps the original fixed stride; Updated and
// Daily stride faster as the run speeds up.
function dinoRunFrameIndex() {
  const period = GAME_CONFIG.RUN_FRAME_PERIOD;
  if (rexMotionOn() && game.state === STATE.RUNNING) {
    return Math.floor(rexMotion.runPhase / period) % 2;
  }
  return Math.floor(game.animFrame / period) % 2;
}

// The landing spring (M8): u runs 0 → 1 over the squash. Squash first,
// then a small rebound stretch, then a smaller settle, done at u = 1.
function landSpring(u) {
  return Math.exp(-3 * u) * Math.cos(2.5 * Math.PI * u);
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
  if (game.state === STATE.IDLE) {
    const b = cfg('DINO_IDLE_BREATH') * Math.sin(game.animFrame * cfg('DINO_IDLE_BREATH_RATE'));
    return { sx: 1 - b * 0.5, sy: 1 + b };
  }
  const frames = cfg('DINO_SQUASH_FRAMES');
  if (dino.landSquashFrames > 0 && frames > 0) {
    const u = 1 - Math.min(1, dino.landSquashFrames / frames);
    const amt =
      (dino.landSquashHard ? cfg('DINO_SLAM_SQUASH') : cfg('DINO_LAND_SQUASH')) * landSpring(u);
    return { sx: 1 + amt * 0.6, sy: 1 - amt };
  }
  if (dino.isJumping && dino.dashFrames > 0) {
    const d = cfg('DINO_DASH_STRETCH');
    return { sx: 1 + d, sy: 1 - d * 0.5 };
  }
  if (dino.isJumping) {
    const speed = Math.min(1, Math.abs(dino.velocityY) / Math.abs(GAME_CONFIG.JUMP_POWER));
    const s = cfg('DINO_STRETCH_MAX') * speed;
    return { sx: 1 - s * 0.5, sy: 1 + s };
  }
  return none;
}

// Second-jump flip angle in radians (M3): one forward turn while flipFrames
// counts down, eased in and out (M8) so it whips through the middle and
// lands the turn softly. 0 in Classic, under reduced motion and in the
// death pose.
function dinoFlipAngle() {
  if (!isUpdatedMode() || reducedMotion || game.state === STATE.DEAD) return 0;
  const total = cfg('DOUBLE_JUMP_FLIP_FRAMES');
  if (!(total > 0) || dino.flipFrames <= 0) return 0;
  const t = 1 - Math.min(1, dino.flipFrames / total);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return Math.PI * 2 * eased;
}

// New Rex prototype (?qaNewRex=1, Updated and Daily only). A jointed Rex
// drawn in code instead of the two-frame sprite: hips, chest, neck, head and
// jaw, two legs solved with two-bone IK (knee forward, heel raised), small
// arms and a five-link tail on springs. Visual only: it reads dino and game
// but never writes them, and uses no randomness, so the hitbox, physics,
// spawning and game.rng() are untouched. Coordinates are hitbox pixels with
// the origin at the hitbox's bottom-left corner and y up negative.
const NEW_REX_CYCLE_FRAMES = 18; // sim frames per full stride (two steps) at cadence 1
const NEW_REX_TAIL_LINKS = [4.4, 4.0, 3.6, 3.2, 2.8];
const NEW_REX_TAIL_WIDTH = [8, 6.4, 4.8, 3.4, 2.2, 1];

const newRex = {
  phase: 0, // run cycle, 0..1
  duck: 0, // 0 standing .. 1 ducked, eased
  air: 0, // 0 on the ground .. 1 airborne, eased
  fall: 0, // 0 rising .. 1 falling, eased (legs reach down to land)
  head: 0, // head lag on a spring, px (positive = down)
  headVel: 0,
  tail: [0, 0, 0, 0, 0], // per-link bend on springs, radians
  tailVel: [0, 0, 0, 0, 0],
  prevY: null,
  frame: 0,
  reset() {
    this.phase = 0;
    this.duck = 0;
    this.air = 0;
    this.fall = 0;
    this.head = 0;
    this.headVel = 0;
    this.tail = [0, 0, 0, 0, 0];
    this.tailVel = [0, 0, 0, 0, 0];
    this.prevY = null;
    this.frame = 0;
  },
};

function newRexOn() {
  return !!qa.newRex && isUpdatedMode();
}

function newRexLerp(a, b, t) {
  return a + (b - a) * t;
}

// One sim frame of the rig. Called from updateRexMotion().
function updateNewRex() {
  if (!newRexOn()) return;
  const r = newRex;
  r.frame++;
  const running = game.state === STATE.RUNNING;
  const ducking = dino.slideFrames > 0 && game.state !== STATE.DEAD;
  const airborne = dino.isJumping && !ducking;
  if (running && !dino.isJumping) {
    const cadence = reducedMotion ? 1 : rexCadence();
    r.phase = (r.phase + cadence / NEW_REX_CYCLE_FRAMES) % 1;
  }
  if (game.state === STATE.DEAD) return;
  r.duck += ((ducking ? 1 : 0) - r.duck) * 0.4;
  r.air += ((airborne ? 1 : 0) - r.air) * 0.35;
  r.fall += ((dino.velocityY > 1 ? 1 : 0) - r.fall) * 0.15;
  const vy = r.prevY === null ? 0 : dino.y - r.prevY;
  r.prevY = dino.y;
  if (reducedMotion) {
    r.head = 0;
    r.tail = [0, 0, 0, 0, 0];
    return;
  }
  // Head lags behind the body's vertical motion, then settles.
  r.headVel = r.headVel * 0.72 + (vy * 0.35 - r.head) * 0.22;
  r.head += r.headVel;
  // Tail: link 0 chases a target from speed and vertical motion; each later
  // link chases the one before it, so a swing travels down to the tip.
  const runSwing = running && !dino.isJumping ? Math.sin(r.phase * Math.PI * 4) * 0.1 : 0;
  const idleSway = game.state === STATE.IDLE ? Math.sin(r.frame * 0.04) * 0.08 : 0;
  const lift = Math.max(-0.12, Math.min(0.12, -vy * 0.018));
  const target0 = lift + runSwing + idleSway;
  for (let i = 0; i < r.tail.length; i++) {
    const want = i === 0 ? target0 : r.tail[i - 1] * 0.6;
    r.tailVel[i] = r.tailVel[i] * 0.7 + (want - r.tail[i]) * 0.28;
    r.tail[i] += r.tailVel[i];
  }
}

// Two-bone IK: the knee for a hip, a target and two lengths, bent forward.
function newRexKnee(hx, hy, tx, ty, a, b) {
  const dx = tx - hx,
    dy = ty - hy;
  const d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base - bend;
  return { x: hx + a * Math.cos(ang), y: hy + a * Math.sin(ang) };
}

// A tapered limb segment: two circles joined by their outer tangents.
function newRexCapsule(c, x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d,
    uy = dy / d;
  const s = Math.max(-1, Math.min(1, (r1 - r2) / d));
  const k = Math.sqrt(1 - s * s);
  const nx1 = ux * s - uy * k,
    ny1 = uy * s + ux * k;
  const nx2 = ux * s + uy * k,
    ny2 = uy * s - ux * k;
  let pts = [
    [x1 + nx1 * r1, y1 + ny1 * r1],
    [x2 + nx1 * r2, y2 + ny1 * r2],
    [x2 + nx2 * r2, y2 + ny2 * r2],
    [x1 + nx2 * r1, y1 + ny2 * r1],
  ];
  // Every shape winds clockwise on screen, so overlaps never cut holes.
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i],
      [bx, by] = pts[(i + 1) % 4];
    area += ax * by - bx * ay;
  }
  if (area < 0) pts = pts.reverse();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.moveTo(x1 + r1, y1);
  c.arc(x1, y1, r1, 0, Math.PI * 2);
  c.moveTo(x2 + r2, y2);
  c.arc(x2, y2, r2, 0, Math.PI * 2);
}

// Where one foot is this frame, relative to the ground under the hip.
function newRexFoot(hip, offset, stride, lift) {
  const r = newRex;
  const t = (r.phase + offset) % 1;
  let fx, fy;
  if (t < 0.5) {
    const u = t / 0.5;
    fx = stride * (1 - 2 * u);
    fy = 0;
  } else {
    const u = (t - 0.5) / 0.5;
    const e = u * u * (3 - 2 * u);
    fx = -stride + 2 * stride * e;
    fy = -lift * Math.sin(Math.PI * u);
  }
  const ground = { x: hip.x + 1.5 + fx, y: fy };
  // In the air the feet tuck under the belly while rising, then reach down.
  const tuck = {
    x: hip.x + newRexLerp(offset ? -1 : 4.5, offset ? 0.5 : 3, r.fall),
    y: hip.y + newRexLerp(offset ? 11.5 : 10, 15.5, r.fall),
  };
  const toePitch = t >= 0.5 ? Math.sin(Math.PI * ((t - 0.5) / 0.5)) * 0.9 : 0;
  return {
    x: newRexLerp(ground.x, tuck.x, r.air),
    y: newRexLerp(ground.y, tuck.y, r.air),
    pitch: newRexLerp(toePitch, 0.7 + 0.4 * (1 - r.fall), r.air),
  };
}

// The pose for this frame: every joint, in hitbox pixels.
function newRexPose() {
  const r = newRex;
  const d = r.duck;
  const dead = game.state === STATE.DEAD;
  const running = game.state === STATE.RUNNING && !dino.isJumping;
  // Body bob: lowest when a foot is planted under the hip.
  const bob = running && !reducedMotion ? Math.cos(r.phase * Math.PI * 4) * 1.1 : 0;
  // Landing crouch from the existing landing squash timer.
  let crouch = 0;
  const frames = cfg('DINO_SQUASH_FRAMES');
  if (!reducedMotion && !dead && dino.landSquashFrames > 0 && frames > 0) {
    const u = 1 - Math.min(1, dino.landSquashFrames / frames);
    crouch = (dino.landSquashHard ? 6 : 4) * landSpring(u);
  }
  const breath = game.state === STATE.IDLE && !reducedMotion ? Math.sin(r.frame * 0.06) * 0.6 : 0;
  const drop = bob * 0.5 + crouch;
  const hip = { x: newRexLerp(15, 13, d), y: newRexLerp(-19, -11, d) + drop };
  const chest = { x: newRexLerp(24, 28, d), y: newRexLerp(-27, -14, d) + drop * 1.2 + breath };
  const neck = { x: newRexLerp(25, 33, d), y: newRexLerp(-34, -16, d) + drop * 1.4 + breath };
  const headY = newRexLerp(-41, -18, d) + drop * 1.5 + breath + r.head;
  const head = { x: newRexLerp(21.5, 31.5, d), y: headY, angle: newRexLerp(0, 0.12, d) };
  head.angle += reducedMotion ? 0 : r.head * 0.03;
  const tailBase = { x: newRexLerp(11, 9, d), y: newRexLerp(-23, -14, d) + drop * 0.8 };
  const tailAngle = newRexLerp(Math.PI + 0.38, Math.PI + 0.06, d);
  const stride = newRexLerp(6.5, 5.5, d);
  const lift = newRexLerp(5, 3, d);
  const near = newRexFoot(hip, 0, stride, lift);
  const far = newRexFoot(hip, 0.5, stride, lift);
  // Arms swing against the legs; in the air they reach forward.
  const swing = running && !reducedMotion ? Math.sin(r.phase * Math.PI * 2) * 0.45 : 0;
  const armBase = newRexLerp(newRexLerp(0.95, 0.35, r.air), 0.5, d);
  let jaw = newRexLerp(0, 0.18, r.air * (1 - r.fall));
  if (dead) jaw = 0.42;
  return { hip, chest, neck, head, tailBase, tailAngle, near, far, swing, armBase, jaw };
}

// Leg joints: hip, knee, ankle (heel raised) and toe.
function newRexLeg(hip, foot, side) {
  const toeLen = 5;
  const ax = foot.x - toeLen * Math.cos(foot.pitch) * 0.7;
  const ay = foot.y - 3.2 - toeLen * Math.sin(foot.pitch) * 0.4;
  const hx = hip.x + side,
    hy = hip.y + 1;
  const knee = newRexKnee(hx, hy, ax, ay, 8.5, 8);
  const toe = {
    x: ax + toeLen * Math.cos(foot.pitch * 0.6),
    y: ay + 3.2 + toeLen * Math.sin(foot.pitch) * 0.3,
  };
  return { hip: { x: hx, y: hy }, knee, ankle: { x: ax, y: ay }, toe };
}

function newRexTailPoints(pose, scale) {
  const pts = [{ x: pose.tailBase.x, y: pose.tailBase.y }];
  let a = pose.tailAngle;
  for (let i = 0; i < NEW_REX_TAIL_LINKS.length; i++) {
    a += newRex.tail[i] + (i > 1 ? -0.06 : 0);
    const p = pts[i];
    pts.push({
      x: p.x + Math.cos(a) * NEW_REX_TAIL_LINKS[i] * (scale || 1),
      y: p.y + Math.sin(a) * NEW_REX_TAIL_LINKS[i] * (scale || 1),
    });
  }
  return pts;
}

// Three looks for the new Rex test, picked with ?rexLook=chrome|cute|fierce
// (chrome by default). Same rig and motion; only shapes, colours and details
// change.
const NEW_REX_LOOKS = {
  chrome: {
    head: 1.3,
    tail: 1,
    outline: 0,
    fill: ['#5a5a5a', '#535353', '#4e4e4e'],
    far: '#424242',
    arm: '#535353',
  },
  cute: {
    head: 1.5,
    tail: 0.8,
    outline: 1.9,
    ink: '#34383d',
    fill: ['#8a9096', '#6f757b', '#5d6268'],
    far: '#50555a',
    arm: '#6f757b',
  },
  fierce: {
    head: 1.2,
    tail: 1.12,
    outline: 1.5,
    ink: '#1c1c1c',
    fill: ['#666666', '#474747', '#303030'],
    far: '#2c2c2c',
    arm: '#444444',
  },
};

function newRexLookName() {
  if (typeof window !== 'undefined' && window.__rexLook) return window.__rexLook;
  try {
    const look = new URLSearchParams(location.search).get('rexLook');
    if (look && NEW_REX_LOOKS[look]) return look;
  } catch {
    // No page query (Node): the default look.
  }
  return 'chrome';
}

function newRexLook() {
  return NEW_REX_LOOKS[newRexLookName()] || NEW_REX_LOOKS.chrome;
}

// A clockwise triangle (so it joins the body's fill without cutting a hole).
function newRexTri(c, ax, ay, bx, by, tx, ty) {
  const area = (bx - ax) * (ty - ay) - (by - ay) * (tx - ax);
  c.moveTo(ax, ay);
  if (area >= 0) {
    c.lineTo(bx, by);
    c.lineTo(tx, ty);
  } else {
    c.lineTo(tx, ty);
    c.lineTo(bx, by);
  }
  c.closePath();
}

// Skull (head and upper jaw), facing right, anchored at the back of the skull.
function newRexSkullPath(c, look) {
  if (look === 'chrome') {
    // Chrome's boxy head: a long flat-topped block with small rounded corners.
    c.moveTo(-3, 4);
    c.lineTo(-3, -6);
    c.quadraticCurveTo(-3, -8, -1, -8);
    c.lineTo(15.5, -8);
    c.quadraticCurveTo(17.5, -8, 17.5, -6);
    c.lineTo(17.5, 0);
    c.quadraticCurveTo(17.5, 1.5, 16, 1.5);
    c.lineTo(5, 1.5);
    c.lineTo(2, 5);
    c.closePath();
    return;
  }
  if (look === 'cute') {
    // A round dome with a short, soft snout.
    c.moveTo(-3.5, 3);
    c.bezierCurveTo(-5.5, -4, -1, -9, 5, -9);
    c.bezierCurveTo(11, -9, 15, -6.5, 15, -2.5);
    c.quadraticCurveTo(15, 1.8, 12, 1.8);
    c.lineTo(5, 1.8);
    c.lineTo(2, 5);
    c.closePath();
    return;
  }
  // Fierce: a heavy brow, a long snout and a squared upper jaw.
  c.moveTo(-3.5, 3);
  c.bezierCurveTo(-4.5, -3, -2.5, -7, 2, -7.5);
  c.lineTo(7, -8.2);
  c.lineTo(10, -6.8);
  c.lineTo(17, -6);
  c.quadraticCurveTo(19.5, -5.5, 19.5, -2.5);
  c.lineTo(19.5, 1);
  c.quadraticCurveTo(19.5, 2, 18, 2);
  c.lineTo(5, 2);
  c.lineTo(2, 5);
  c.closePath();
}

function newRexJawPath(c, open, look) {
  c.save();
  c.translate(4, 1.8);
  c.rotate(open);
  const len = look === 'cute' ? 9 : look === 'fierce' ? 14 : 12.5;
  c.moveTo(-3, 0);
  c.lineTo(len - 1.5, 0);
  c.quadraticCurveTo(len, 0, len, 1.4);
  c.quadraticCurveTo(len - 0.5, 3.6, len - 3.5, 3.8);
  c.lineTo(1, 4.6);
  c.quadraticCurveTo(-3.5, 5, -4.5, 2);
  c.closePath();
  c.restore();
}

// Spine points along the top of the tail and back, with their thickness.
function newRexSpine(pose, tailPts) {
  return [
    [tailPts[4], 1.4],
    [tailPts[3], 1.9],
    [tailPts[2], 2.6],
    [tailPts[1], 3.4],
    [tailPts[0], 4.3],
    [{ x: pose.hip.x, y: pose.hip.y - 2.5 }, 8],
    [pose.chest, 7.2],
    [pose.neck, 5.8],
  ];
}

// The upward normal of a spine segment, and its midpoint and thickness.
function newRexSpineSegment(a, b) {
  const dx = b[0].x - a[0].x,
    dy = b[0].y - a[0].y;
  const d = Math.hypot(dx, dy) || 1;
  let nx = dy / d,
    ny = -dx / d;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    ux: dx / d,
    uy: dy / d,
    nx,
    ny,
    mx: (a[0].x + b[0].x) / 2,
    my: (a[0].y + b[0].y) / 2,
    r: (a[1] + b[1]) / 2,
    len: d,
  };
}

function newRexBodyShapes(c, pose, nearLeg, tailPts, lookName) {
  const look = NEW_REX_LOOKS[lookName];
  // Tail: tapered links.
  for (let i = 0; i < tailPts.length - 1; i++) {
    const a = tailPts[i],
      b = tailPts[i + 1];
    newRexCapsule(
      c,
      a.x,
      a.y,
      (NEW_REX_TAIL_WIDTH[i] / 2 + 0.6) * (lookName === 'cute' ? 1.1 : 1),
      b.x,
      b.y,
      (NEW_REX_TAIL_WIDTH[i + 1] / 2 + 0.4) * (lookName === 'cute' ? 1.1 : 1)
    );
  }
  // Fierce: a row of back spikes, part of the silhouette.
  if (lookName === 'fierce') {
    const spine = newRexSpine(pose, tailPts);
    for (let i = 0; i < spine.length - 1; i++) {
      const s = newRexSpineSegment(spine[i], spine[i + 1]);
      const n = Math.max(1, Math.round(s.len / 3.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const bx = s.mx + s.ux * t * s.len + s.nx * s.r * 0.85,
          by = s.my + s.uy * t * s.len + s.ny * s.r * 0.85;
        const h = 1 + s.r * 0.32;
        newRexTri(
          c,
          bx - s.ux * 1.2,
          by - s.uy * 1.2,
          bx + s.ux * 1.2,
          by + s.uy * 1.2,
          bx + s.nx * h - s.ux * 0.9,
          by + s.ny * h - s.uy * 0.9
        );
      }
    }
  }
  // Torso: a tapered capsule from the hips to the chest, and the neck.
  const fat = lookName === 'cute' ? 1.08 : 1;
  newRexCapsule(
    c,
    pose.tailBase.x + 1,
    pose.tailBase.y + 0.5,
    5,
    pose.hip.x,
    pose.hip.y - 2.5,
    8 * fat
  );
  newRexCapsule(c, pose.hip.x, pose.hip.y - 2.5, 8 * fat, pose.chest.x, pose.chest.y, 7.2 * fat);
  newRexCapsule(c, pose.chest.x, pose.chest.y, 7.2 * fat, pose.neck.x, pose.neck.y, 5.8);
  newRexCapsule(c, pose.neck.x, pose.neck.y, 5.8, pose.head.x + 3, pose.head.y + 2.5, 5.2);
  // Near thigh: a big drumstick into the hip.
  const L = nearLeg;
  newRexCapsule(c, L.hip.x, L.hip.y - 1.5, 6, L.knee.x, L.knee.y, 3);
  newRexCapsule(c, L.knee.x, L.knee.y, 3, L.ankle.x, L.ankle.y, 1.8);
  newRexCapsule(c, L.ankle.x, L.ankle.y, 1.8, L.toe.x, L.toe.y, 1.4);
  void look;
}

function newRexHeadShapes(c, pose, lookName) {
  const look = NEW_REX_LOOKS[lookName];
  c.save();
  c.translate(pose.head.x, pose.head.y);
  c.rotate(pose.head.angle);
  c.scale(look.head, look.head);
  newRexSkullPath(c, lookName);
  newRexJawPath(c, pose.jaw, lookName);
  c.restore();
}

function newRexArm(c, pose, side, color, claws) {
  const sx = pose.chest.x + 3 + side,
    sy = pose.chest.y + 3;
  const a = pose.armBase + pose.swing * (side ? -1 : 1);
  const ex = sx + Math.cos(a) * 4.2,
    ey = sy + Math.sin(a) * 4.2;
  const b = a - 1.5;
  const hx = ex + Math.cos(b) * 3.4,
    hy = ey + Math.sin(b) * 3.4;
  c.beginPath();
  newRexCapsule(c, sx, sy, 1.6, ex, ey, 1.2);
  newRexCapsule(c, ex, ey, 1.2, hx, hy, 0.9);
  c.fillStyle = color;
  c.fill();
  if (claws) {
    c.beginPath();
    const cb = b - 0.5;
    newRexTri(
      c,
      hx - 0.5,
      hy - 0.5,
      hx + 0.5,
      hy + 0.5,
      hx + Math.cos(cb) * 1.8,
      hy + Math.sin(cb) * 1.8
    );
    c.fillStyle = '#d8d2c4';
    c.fill();
  }
}

function newRexBlinking() {
  if (reducedMotion) return false;
  const t = newRex.frame % 200;
  return t < 7 || (t > 22 && t < 28 && newRex.frame % 600 < 200);
}

// Face details per look: mouth, brow, nostril, eye, teeth, blush.
function newRexFace(c, pose, lookName, ink) {
  const dead = game.state === STATE.DEAD;
  const blink = newRexBlinking() && !dead;
  const open = pose.jaw > 0.05;
  if (open) {
    const end = lookName === 'cute' ? 13.5 : lookName === 'fierce' ? 19 : 17;
    const len = lookName === 'cute' ? 9 : lookName === 'fierce' ? 14 : 12.5;
    c.beginPath();
    c.moveTo(5, 1.8);
    c.lineTo(end, 1.8);
    c.lineTo(4 + len * Math.cos(pose.jaw), 1.8 + len * Math.sin(pose.jaw));
    c.closePath();
    c.fillStyle = lookName === 'cute' ? '#c75b6b' : lookName === 'chrome' ? '#2f2f2f' : '#6b1f1f';
    c.fill();
  }
  if (lookName === 'fierce') {
    // Teeth along the upper jaw (an overbite, so they show when closed too).
    c.beginPath();
    for (let x = 7; x <= 18; x += 2.2) newRexTri(c, x - 0.8, 1.9, x + 0.8, 1.9, x, 3.6);
    if (open) {
      const j = pose.jaw;
      for (let x = 8; x <= 16; x += 2.4) {
        const bx = 4 + (x - 4) * Math.cos(j),
          by = 1.8 + (x - 4) * Math.sin(j);
        newRexTri(c, bx + 0.8, by, bx - 0.8, by, bx, by - 1.6);
      }
    }
    c.fillStyle = '#f2ede0';
    c.fill();
  }
  if (!open) {
    c.beginPath();
    if (lookName === 'cute') {
      c.moveTo(8, 1.2);
      c.quadraticCurveTo(10.5, 2.8, 13, 0.8);
    } else {
      c.moveTo(6, 1.9);
      c.lineTo(lookName === 'fierce' ? 18.5 : 16, 1.9);
    }
    c.lineWidth = 0.7;
    c.strokeStyle = ink;
    c.stroke();
  }
  // Nostril.
  c.beginPath();
  if (lookName === 'chrome') c.rect(14.5, -6, 1.2, 1);
  else if (lookName === 'cute') c.ellipse(13.5, -4, 0.5, 0.4, 0, 0, Math.PI * 2);
  else c.ellipse(17.5, -4.4, 0.9, 0.5, -0.3, 0, Math.PI * 2);
  c.fillStyle = ink;
  c.fill();
  if (lookName === 'cute') {
    // Blush.
    c.beginPath();
    c.ellipse(9.5, -0.6, 1.9, 1.1, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(235,120,140,0.55)';
    c.fill();
  }
  // Eye.
  if (lookName === 'chrome') {
    if (blink) {
      c.fillStyle = '#f7f7f7';
      c.fillRect(1.5, -4.2, 2.8, 0.7);
    } else {
      c.fillStyle = '#f7f7f7';
      c.fillRect(1.3, -6, 3, 3);
      c.fillStyle = '#535353';
      if (dead) c.fillRect(2.2, -5.1, 1.2, 1.2);
      else c.fillRect(2.9, -5.2, 1.2, 1.4);
    }
    return;
  }
  if (lookName === 'cute') {
    if (blink) {
      c.beginPath();
      c.moveTo(3, -3.5);
      c.quadraticCurveTo(5.5, -1.8, 8, -3.5);
      c.lineWidth = 0.9;
      c.strokeStyle = ink;
      c.stroke();
      return;
    }
    c.beginPath();
    c.ellipse(5.6, -4, 3.1, 3.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
    c.lineWidth = 0.7;
    c.strokeStyle = ink;
    c.stroke();
    c.beginPath();
    c.ellipse(
      dead ? 5.6 : 6.4,
      dead ? -4 : -3.8,
      dead ? 1 : 2.1,
      dead ? 1 : 2.5,
      0,
      0,
      Math.PI * 2
    );
    c.fillStyle = '#1d1f22';
    c.fill();
    if (!dead) {
      c.beginPath();
      c.arc(7.2, -5, 0.8, 0, Math.PI * 2);
      c.arc(5.8, -2.6, 0.4, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
    }
    return;
  }
  // Fierce: an amber eye with a slit pupil under a heavy, angry brow.
  if (blink) {
    c.beginPath();
    c.moveTo(4.8, -3.6);
    c.lineTo(8.6, -3.2);
    c.lineWidth = 0.8;
    c.strokeStyle = ink;
    c.stroke();
  } else {
    c.beginPath();
    c.ellipse(6.8, -3.6, 2, 1.5, 0.15, 0, Math.PI * 2);
    c.fillStyle = '#e5a823';
    c.fill();
    c.lineWidth = 0.5;
    c.strokeStyle = ink;
    c.stroke();
    c.beginPath();
    c.ellipse(7.2, -3.5, dead ? 0.8 : 0.45, dead ? 0.8 : 1.3, 0, 0, Math.PI * 2);
    c.fillStyle = '#111';
    c.fill();
  }
  c.beginPath();
  c.moveTo(3.8, -6.6);
  c.lineTo(9.8, -4.6);
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  c.strokeStyle = ink;
  c.stroke();
  c.lineCap = 'butt';
}

// Fierce: dark stripes across the back and tail, and a rim of light on top.
function newRexStripes(c, pose, tailPts) {
  const spine = newRexSpine(pose, tailPts);
  c.save();
  c.lineCap = 'round';
  for (let i = 1; i < spine.length - 1; i++) {
    const s = newRexSpineSegment(spine[i], spine[i + 1]);
    c.beginPath();
    c.moveTo(s.mx + s.nx * s.r * 0.8, s.my + s.ny * s.r * 0.8);
    c.lineTo(s.mx + s.nx * s.r * 0.1 - s.ux * 0.8, s.my + s.ny * s.r * 0.1 - s.uy * 0.8);
    c.lineWidth = Math.max(0.8, s.r * 0.28);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.stroke();
  }
  c.restore();
}

// Draws the rig at the dino's position. The caller applies the turn and the
// night brightness.
function drawNewRexRig(c) {
  const lookName = newRexLookName();
  const look = newRexLook();
  const pose = newRexPose();
  const nearLeg = newRexLeg(pose.hip, pose.near, 0);
  const farLeg = newRexLeg(pose.hip, pose.far, -2.5);
  const tailPts = newRexTailPoints(pose, look.tail);
  const ink = look.ink || look.far;
  // Far leg and far arm, a shade darker, behind the body.
  c.beginPath();
  newRexCapsule(c, farLeg.hip.x, farLeg.hip.y - 1, 5, farLeg.knee.x, farLeg.knee.y, 2.8);
  newRexCapsule(c, farLeg.knee.x, farLeg.knee.y, 2.8, farLeg.ankle.x, farLeg.ankle.y, 1.7);
  newRexCapsule(c, farLeg.ankle.x, farLeg.ankle.y, 1.7, farLeg.toe.x, farLeg.toe.y, 1.3);
  if (look.outline) {
    c.lineWidth = look.outline * 0.9;
    c.strokeStyle = ink;
    c.stroke();
  }
  c.fillStyle = look.far;
  c.fill();
  newRexArm(c, pose, -1.5, look.far, lookName === 'fierce');
  // Body: stroke every shape first, then fill them all, so the outline only
  // survives on the outer edge and the body reads as one silhouette.
  const grad = c.createLinearGradient(0, -50, 0, 0);
  grad.addColorStop(0, look.fill[0]);
  grad.addColorStop(0.55, look.fill[1]);
  grad.addColorStop(1, look.fill[2]);
  if (look.outline) {
    c.beginPath();
    newRexBodyShapes(c, pose, nearLeg, tailPts, lookName);
    c.lineWidth = look.outline;
    c.lineJoin = 'round';
    c.strokeStyle = ink;
    c.stroke();
    c.beginPath();
    newRexHeadShapes(c, pose, lookName);
    c.stroke();
  }
  c.fillStyle = grad;
  c.beginPath();
  newRexBodyShapes(c, pose, nearLeg, tailPts, lookName);
  c.fill();
  c.beginPath();
  newRexHeadShapes(c, pose, lookName);
  c.fill();
  if (lookName === 'fierce') {
    newRexStripes(c, pose, tailPts);
    // Toe claws.
    c.beginPath();
    for (const L of [nearLeg, farLeg]) {
      newRexTri(
        c,
        L.toe.x - 0.6,
        L.toe.y - 0.9,
        L.toe.x - 0.6,
        L.toe.y + 0.9,
        L.toe.x + 1.8,
        L.toe.y + 0.6
      );
    }
    c.fillStyle = '#d8d2c4';
    c.fill();
  }
  if (lookName === 'cute') {
    // A lighter belly.
    c.save();
    c.beginPath();
    c.ellipse(
      pose.chest.x + 1.5,
      pose.chest.y + 2.5,
      4.2,
      3.4,
      Math.atan2(pose.chest.y - pose.hip.y, pose.chest.x - pose.hip.x),
      0,
      Math.PI * 2
    );
    c.fillStyle = 'rgba(205,210,214,0.45)';
    c.fill();
    c.restore();
  }
  // Head details.
  c.save();
  c.translate(pose.head.x, pose.head.y);
  c.rotate(pose.head.angle);
  c.scale(look.head, look.head);
  newRexFace(c, pose, lookName, lookName === 'chrome' ? '#2f2f2f' : ink);
  c.restore();
  // Near arm last, over the chest.
  newRexArm(c, pose, 0, look.arm, lookName === 'fierce');
}

// The new Rex in place of the sprite, with the same pitch, flip and recoil
// turn the sprite uses.
function drawNewRex() {
  const pose = rexPose();
  const flip = dinoFlipAngle();
  const turn = flip + pose.angle;
  const ox = dino.x + pose.dx,
    oy = dino.y + dino.height + pose.dy;
  ctx.save();
  if (turn) {
    const mid = flip || dino.isJumping;
    const cx = dino.x + dino.width / 2 + pose.dx;
    const cy = (mid ? dino.y + dino.height / 2 : dino.y + dino.height) + pose.dy;
    ctx.translate(cx, cy);
    ctx.rotate(turn);
    ctx.translate(-cx, -cy);
  }
  ctx.translate(ox, oy);
  drawNewRexRig(ctx);
  ctx.restore();
}

function drawDino() {
  if (newRexOn()) {
    const nightLift = dinoNightBrightness();
    const prior = ctx.filter;
    if (nightLift > 1) ctx.filter = 'brightness(' + nightLift.toFixed(2) + ')';
    try {
      drawNewRex();
    } finally {
      if (nightLift > 1) ctx.filter = prior || 'none';
    }
    return;
  }
  let img;
  if (game.state === STATE.DEAD) {
    img = dinoLoseImage;
  } else if (dino.isJumping) {
    img = dino.image;
  } else {
    img = dinoRunImages[dinoRunFrameIndex()];
  }
  const brightness = dinoNightBrightness();
  const previousFilter = ctx.filter;
  if (brightness > 1) ctx.filter = 'brightness(' + brightness.toFixed(2) + ')';
  try {
    if (imageReady(img)) {
      const { sx, sy } = dinoSquashScale();
      const w = dino.width * sx,
        h = dino.height * sy;
      const pose = rexPose();
      const flip = dinoFlipAngle();
      const turn = flip + pose.angle;
      if (turn) {
        // A flip (and any turn in the air) pivots on the body's middle; a
        // lean on the ground pivots on the feet so they stay planted.
        const mid = flip || dino.isJumping;
        const cx = dino.x + dino.width / 2 + pose.dx;
        const cy = (mid ? dino.y + dino.height / 2 : dino.y + dino.height) + pose.dy;
        // One transform call (move to the pivot, then turn), so the death
        // shake stays the only translate in a death frame.
        const cos = Math.cos(turn),
          sin = Math.sin(turn);
        ctx.save();
        ctx.transform(cos, sin, -sin, cos, cx, cy);
        ctx.drawImage(img, -w / 2, (mid ? dino.height / 2 : 0) - h, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(
          img,
          dino.x + (dino.width - w) / 2 + pose.dx,
          dino.y + dino.height - h + pose.dy,
          w,
          h
        );
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

// Move combo HUD (M7): COMBO xN under the score from 2 up, Updated and
// Daily only, with a small pop on each new step (no pop under reduced motion).
function drawCombo() {
  if (!isUpdatedMode() || !(game.combo >= 2)) return;
  const color = scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_START ? '#ffffff' : '#000000';
  const x = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET;
  const y = GAME_CONFIG.SCORE_Y + 22;
  const pop = reducedMotion ? 0 : Math.max(0, game.comboPopFrames) / GAME_CONFIG.COMBO_POP_FRAMES;
  const scale = 1 + 0.25 * pop;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.font = '14px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText('COMBO x' + game.combo, 0, 0);
  ctx.restore();
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
