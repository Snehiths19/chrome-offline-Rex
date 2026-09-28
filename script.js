// == SECTION 1: NODE STUBS ==
// Minimal browser-API stubs so script.js can be `require`d from tests/game.test.js
// under plain Node without a DOM. Real browsers skip this block.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    innerWidth: 600,
    devicePixelRatio: 1,
  };
  const nodeStubs = {};
  function stubNode() {
    return {
      _listeners: {},
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      setAttribute() {},
      dataset: {},
      textContent: '',
    };
  }
  global.document = {
    getElementById: (id) => {
      if (id === 'gameCanvas') {
        if (!nodeStubs.gameCanvas) {
          nodeStubs.gameCanvas = {
            width: 600,
            height: 200,
            style: {},
            getContext: () => ({
              drawImage: () => {},
              clearRect: () => {},
              fillRect: () => {},
              fillText: () => {},
              arc: () => {},
              beginPath: () => {},
              closePath: () => {},
              fill: () => {},
              stroke: () => {},
              moveTo: () => {},
              lineTo: () => {},
              measureText: () => ({ width: 0 }),
              save: () => {},
              restore: () => {},
              translate: () => {},
              scale: () => {},
              setTransform: () => {},
              ellipse: () => {},
              fillStyle: '',
              strokeStyle: '',
              font: '',
              textAlign: '',
              globalAlpha: 1,
            }),
            addEventListener: () => {},
          };
        }
        return nodeStubs.gameCanvas;
      }
      if (!nodeStubs[id]) nodeStubs[id] = stubNode();
      return nodeStubs[id];
    },
    addEventListener: () => {},
  };
  global.Image = class { constructor() { this.onload = null; this.onerror = null; this.src = ''; this.width = 1; this.height = 1; this.complete = true; } };
  global.requestAnimationFrame = (cb) => {
    const id = setImmediate(() => cb(Date.now()));
    id.unref(); // don't keep Node alive after tests complete
    return id;
  };
  global.cancelAnimationFrame = (id) => clearImmediate(id);
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  window.document = global.document;
}

// == SECTION 2: CONFIGURATION ==

const GAME_CONFIG = Object.freeze({
  // --- Canvas logical dimensions ---
  CANVAS_W: 600,
  CANVAS_H: 200,

  // --- Physics ---
  JUMP_POWER:              -12,   // negative = upward impulse applied on jump
  GRAVITY:                  0.48, // added to velocityY each frame while airborne
  INITIAL_SPEED:            3.0,  // obstacle scroll speed at score 0
  SPEED_CAP:               13.0,  // max scroll speed (matches Chrome T-Rex)
  PLATEAU_SPEED:            8.0,  // sigmoid ceiling — focusable-but-demanding speed the curve approaches
  RAMP_MIDPOINT:          300,    // score where acceleration is steepest (day/night transition)
  RAMP_STEEPNESS:           0.01, // sigmoid slope — controls how quickly speed rises through the midpoint
  SCORE_PER_LEVEL:        100,    // score points per level — used for milestone flash effects only
  SCORE_INCREMENT:          0.1,  // score added per frame while RUNNING

  // --- Hitbox forgiveness (rendering uses full sprite; collision uses shrunken box) ---
  DINO_PAD_X:               8,
  DINO_PAD_Y_TOP:           8,
  DINO_PAD_Y_BOT:           2,
  OBS_PAD_X:                3,
  OBS_PAD_Y:                2,

  // --- Spawning ---
  GRACE_FRAMES:           240,    // ~4 s at 60 fps before first obstacle appears
  MAX_SPAWN_GAP:          600,    // gap (px) between obstacles at INITIAL_SPEED
  MIN_SPAWN_GAP:          340,    // classic floor (px). Updated/Daily never go below this either.
  SPAWN_GAP_SPEED_FACTOR:  50,    // classic gap shrinks by this much per +1 speed above INITIAL_SPEED
  SPAWN_GAP_JITTER:         0.3,  // ±30% in Updated/Daily; classic skips jitter
  // Worst-case frames between Updated/Daily obstacles once the shrinking curve
  // would leave less than one focused jump. A jump is 49 frames at the current
  // JUMP_POWER/GRAVITY; 72 also covers a cluster's width plus a short read.
  // The base gap sits at this / (1 - JITTER), so ±30% rarely piles onto the floor.
  UPDATED_MIN_GAP_FRAMES:  72,

  // --- Obstacle sprite (small cactus — baseline) ---
  OBS_WIDTH:               20,
  OBS_HEIGHT:              40,

  // --- Obstacle types ---
  // Each type unlocks at a score threshold and contributes its `weight` to the
  // weighted random pick once unlocked. `render` controls how drawObstacles()
  // paints it from the single cactus sprite.
  OBSTACLE_TYPES: Object.freeze([
    Object.freeze({ id: 'small',   width: 20, height: 40, unlockScore:   0, weight: 50, render: 'single' }),
    Object.freeze({ id: 'big',     width: 30, height: 55, unlockScore: 100, weight: 30, render: 'single' }),
    Object.freeze({ id: 'cluster', width: 50, height: 40, unlockScore: 250, weight: 20, render: 'double' }),
  ]),

  // --- Dino sprite ---
  DINO_X:                  50,
  DINO_WIDTH:              40,
  DINO_HEIGHT:             50,

  // --- Clouds ---
  CLOUD_COUNT:              3,
  CLOUD_MIN_Y:             10,
  CLOUD_Y_RANGE:           40,
  CLOUD_MIN_SPEED:          0.3,
  CLOUD_SPEED_RANGE:        0.3,
  CLOUD_WIDTH:             60,    // used for offscreen detection
  CLOUD_RESPAWN_OFFSET:    20,    // x-offset past right edge when respawning
  CLOUD_COLOR:             '#e8e8e8',
  // Visual only. Peak opacity of Updated/Daily clouds while the sky is
  // still day. The puff is #e8e8e8. On the day sky (#ffffff) full opacity
  // is 23 levels darker than the sky — three shapes about 60px wide in the
  // jump band, scrolling on the Updated parallax — and that gray pulls the
  // eye up off the lane before the run has settled. 0.6 keeps 14 of those
  // 23 levels (the puff composites near #f1f1f1). It still reads as sky
  // furniture, stays quieter than the day hills (#e1e1e1, 30 levels off
  // white), and stays stronger than the night dim so twilight eases
  // downward. Classic does not read this. Classic keeps #e8e8e8 at full
  // opacity, its own faint path. Eases toward NIGHT_CLOUD_ALPHA from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // holds this peak until DAY_NIGHT_END, then snaps to the night dim. The
  // puffs are already painted on GET READY and the opening run, so playtest
  // does not need a query flag. Read through cfg().
  DAY_CLOUD_ALPHA:          0.6,
  // Visual only. Opacity of Updated/Daily clouds once the sky is fully night.
  // The puff is still #e8e8e8. Three circles, about 60px wide, sit in the
  // upper sky. On the night sky (#1a1a2e) the old 0.35 dim sat about 72, 72,
  // and 65 levels off that sky — large mounds in the same band as the night
  // stars (0.35 of white, about 80, 80, and 73). A 60px shape at that lift
  // competes with the obstacle lane. Three-fifths of that band is alpha
  // 0.21, about 43, 43, and 39. The sum stays under the night stars, under
  // the night dino (1.2, about 74, 74, and 54), and under the night cactus
  // (1.65, about 111, 111, and 91). It stays lighter than the night hills
  // (#2d2d46, about 19, 19, and 24), so the mound still reads. Classic does
  // not read this. The day peak eases to this from DAY_NIGHT_START to
  // DAY_NIGHT_END. Reduced motion skips that ease and snaps to this at
  // DAY_NIGHT_END. Playtest with ?qaNight=1. Read through cfg(). Physics
  // does not read this.
  NIGHT_CLOUD_ALPHA:        0.21,
  CLOUD_CIRCLES: Object.freeze([  // three circles forming a puffy cloud shape
    Object.freeze([  0, 0, 18]),
    Object.freeze([-18, 8, 14]),
    Object.freeze([ 18, 8, 14]),
  ]),

  // --- Day / Night ---
  DAY_NIGHT_START:        300,
  DAY_NIGHT_END:          400,
  STAR_COUNT:              12,
  STAR_SIZE:                2,
  STAR_Y_RANGE:           100,
  STAR_COLOR:              '#ffffff',
  // Visual only. Running frames stars take to ramp from invisible to full
  // once night is complete (~0.8 s at 60 fps). Read through cfg().
  STAR_FADE_FRAMES:        48,
  // Visual only. Peak opacity of Updated and Daily stars once that fade
  // finishes and the sky is fully night. The points are #ffffff, 2×2,
  // twelve of them in the top 100px. On the night sky (#1a1a2e) full
  // white sits 229, 229, and 209 levels off that sky. A full three-fifths
  // of that band is alpha 0.6, about 137, 137, and 125 — still brighter
  // than the night cactus (the #535353 sprite at 1.65, about 111, 111,
  // and 91 off the same sky). A 2px point at that lift sparkles over the
  // obstacle lane. 0.35 keeps about 80, 80, and 73. The sum stays under
  // the night cactus and a step above the softer night dino (1.2, about
  // 74, 74, and 54), and above the soft night clouds (0.21 of #e8e8e8).
  // The field still reads as stars and stays peripheral. Classic does not
  // read this. Classic keeps full white after the same fade. Day never
  // paints stars. Reduced motion still skips star init. Playtest with
  // ?qaNight=1. Read through cfg(). Physics does not read this.
  NIGHT_STAR_ALPHA:         0.35,
  // Visual only. CSS brightness applied to cactus sprites once the sky is
  // fully night, in Updated and Daily. The day sprite is #535353; night hills
  // are #2d2d46, and a partial lift during the fade lands on the hill. 1.65
  // holds the silhouette and clears the hill. Classic does not read this.
  // Read through cfg().
  NIGHT_OBSTACLE_BRIGHTNESS: 1.65,
  // Visual only. CSS brightness applied to the dino once the sky is fully
  // night, in Updated and Daily. The day sprite is #535353. On the night
  // sky (#1a1a2e) the old 1.35 lift sat about 86, 86, and 66 levels off
  // that sky — a glow beside the obstacle lane, where the cactus holds
  // 1.65 (about 111, 111, and 91). 1.2 keeps about 74, 74, and 54. The
  // sum stays under the night stars (0.35 of white, about 80, 80, and 73)
  // and under the cactus, and it stays lighter than the night hills
  // (#2d2d46) and the night sky, so the runner still reads. Day keeps the
  // unlifted sprite. Classic does not read this. The lift waits until
  // DAY_NIGHT_END; twilight keeps the day sprite. Reduced motion keeps
  // that same snap, with no pulse. Playtest with ?qaNight=1. Read through
  // cfg(). Physics does not read this.
  NIGHT_DINO_BRIGHTNESS: 1.2,
  // Visual only. Jump and land foot dust once the sky is fully night, in
  // Updated and Daily. Day dust stays the brown on those kinds (#9c8770).
  // On the night sky that brown reads as warm day-dirt. #6a686e is cooler
  // and quieter than the night cactus (1.65). The gray sits a small step
  // above the softer night dino (1.2) and a step above the soft night
  // cloud, so the puff stays at the feet. The gray stays. A darker gray
  // at the night peaks below would sit on the road.
  // The quieter night presence is those peaks, the shorter counts, and
  // the shorter life. Classic does not read this. Eases with the sky from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // snaps to this at DAY_NIGHT_END. Read through cfg().
  NIGHT_LAND_DUST_COLOR:    '#6a686e',
  // Visual only. Peak opacity of Updated/Daily jump foot dust once the sky
  // is fully night. The mote stays #6a686e. The day takeoff is alpha 0.5:
  // on the night ground (the #535353 strip at 0.42, about 50, 50, and 62)
  // that peak sits about 16, 15, and 16 levels off the road — a gray spark
  // at the ankle. Three-fifths of the alpha (0.30) composites to about
  // 50, 49, and 65, which lands on the road, so the puff would stop
  // reading. 0.42 keeps about 10, 9, and 11 of those levels, three-fifths
  // of the old lift over the road, and stays under the night dino (1.2).
  // Classic does not read this. The day peak eases to this from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // snaps to this at DAY_NIGHT_END. The ?qaDust=1 hold uses this peak at
  // night instead of solid ink, and halves it under reduced motion.
  // Playtest with ?qaDust=1&qaNight=1. Read through cfg(). Physics does
  // not read this.
  NIGHT_JUMP_DUST_ALPHA:    0.42,
  // Visual only. Peak opacity of Updated/Daily land foot dust once the sky
  // is fully night. The mote stays #6a686e. The day landing is alpha 0.4,
  // softer than the takeoff so the extra motes do not stack into a cloud.
  // On the same night ground that day peak sits about 8, 7, and 10 levels
  // off the road. Three-fifths of the alpha (0.24) sinks under the road.
  // 0.36 keeps about 5, 4, and 7 of those levels, three-fifths of the old
  // lift, still above the road and quieter than the night takeoff.
  // Classic does not read this. Eases with the sky the same way as
  // NIGHT_JUMP_DUST_ALPHA. Reduced motion snaps at DAY_NIGHT_END. Read
  // through cfg(). Physics does not read this.
  NIGHT_LAND_DUST_ALPHA:    0.36,
  // Visual only. How many jump and land motes Updated/Daily emit once the
  // sky is fully night. Day stays 3 and 5. Two and three still make a
  // landing heavier than a takeoff, with fewer motes so they do not stack
  // back up to a spark on the road. Snaps at DAY_NIGHT_END, so twilight
  // keeps the day counts. Reduced motion then quarters this count, same
  // as the day burst. Classic does not read this. Read through cfg().
  // Physics does not read this.
  NIGHT_JUMP_DUST_COUNT:    2,
  NIGHT_LAND_DUST_COUNT:    3,
  // Visual only. Frames a night jump or land mote lives. Day stays 8.
  // Six is enough for the puff to read at the ankle and short enough that
  // it dies at the foot. The day spreads still apply, so a full life stays
  // inside the day reach. Snaps at DAY_NIGHT_END. Reduced motion then
  // halves it. Classic does not read this. Read through cfg(). Physics
  // does not read this.
  NIGHT_LAND_DUST_LIFE:     6,
  // Visual only. Opacity of the Updated/Daily ground strip once the sky is
  // fully night. The strip is the day sprite (#535353), the road edge under
  // the run. On the night sky (#1a1a2e) the old 0.55 line sat about 31, 31,
  // and 20 levels off that sky — a bright day-gray ruler under the cooled
  // foot dust (#6a686e). A full three-fifths of that band is alpha 0.33.
  // That step lands on the night hills (#2d2d46), so the edge would stop
  // reading as ground. The night clouds are quieter still. 0.42 keeps
  // about 24, 24, and 16 of those levels. The line cools, stays clearly
  // firmer than the clouds, stays lighter than the hills, and stays quieter
  // than the night dust. Classic does not read this. Day ground stays fully
  // opaque. Eases with the sky from DAY_NIGHT_START to DAY_NIGHT_END.
  // Reduced motion skips that ease and snaps to this at DAY_NIGHT_END.
  // Playtest with ?qaNight=1. Read through cfg(). Physics does not read this.
  NIGHT_GROUND_ALPHA:       0.42,

  // --- Ambient depth (PR-D, updated mode only) ---
  HILL_COUNT:               3,    // mid-ground silhouette mounds
  HILL_PARALLAX:            0.2,  // fraction of obstacle speed at which hills scroll
  HILL_MIN_WIDTH:         120,
  HILL_WIDTH_RANGE:        80,
  HILL_MIN_HEIGHT:         40,
  HILL_HEIGHT_RANGE:       30,
  HILL_RESPAWN_X_RANGE:    50,    // px of jitter past the right edge when a hill respawns
  // Visual only. Fill of Updated/Daily hills while the sky is still day.
  // Three ellipses, 120–200px wide and 40–70px tall, sit on the ground
  // line and rise into the jump band behind the dino. #cdcdcd is 50
  // levels off the white sky — a mid-gray band across that lane. #e1e1e1
  // keeps 30 of those 50 levels, the same three-fifths the day cloud
  // whisper keeps of its own ink. The mounds still read (more than
  // double the day cloud's ~14 levels) and stay softer than the day
  // dino and ground (#535353, 172 levels off white). Neutral gray.
  // Night stays HILL_COLOR_NIGHT. Twilight lerps this into that colour
  // from DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips the
  // ease and holds this colour until DAY_NIGHT_END, then snaps. Classic
  // does not draw hills. The mounds are already on GET READY, so
  // playtest does not need a query flag. Physics does not read this.
  HILL_COLOR_DAY:          '#e1e1e1',
  // Visual only. Fill of Updated/Daily hills once the sky is fully night.
  // Same three ellipses as the day fill, on the ground line behind the dino.
  // #3a3a55 sits 32, 32, and 39 levels off the night sky (#1a1a2e) — a blue
  // band across that lane. #2d2d46 keeps 19, 19, and 24 of those levels.
  // The sum is 62 of 103, the same three-fifths the day mounds keep of
  // their band. Red and green stay matched, and blue stays a step above
  // them, so the shape is still a night silhouette. It stays under the
  // night ground (the #535353 strip at 0.42) and well under the night dino
  // (1.2) and cactus (1.65). Twilight lerps HILL_COLOR_DAY into this from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // snaps to this at DAY_NIGHT_END. Classic does not draw hills. Playtest
  // with ?qaNight=1. Read through cfg(). Physics does not read this.
  HILL_COLOR_NIGHT:        '#2d2d46',
  CLOUD_SPEED_FACTOR_UPDATED: 1.5, // multiply cloud speed in updated mode for stronger parallax
  // Visual only. Peak alpha of the gold milestone sky-flash by day, in
  // Updated and Daily. One full-canvas fill, painted after the cacti, so
  // it sits on the obstacle lane for the whole milestone. 0.12 lifted the
  // day cactus (#535353) by about 15 luminance — a gold veil over the lane.
  // 0.06 is half that peak: a gold breath. The LEVEL text and the confetti
  // still carry the level. Classic does not draw the tint. Night uses its
  // own peak and the twilight ease still steps down to it. Read through cfg().
  SKY_TINT_PEAK_ALPHA:      0.06,
  SKY_TINT_COLOR_RGB:      '255, 215, 0',   // gold sky-flash colour (rgb triplet, alpha applied at draw)
  // Visual only. Peak alpha of the gold milestone sky-flash once the sky is
  // fully night, in Updated and Daily. One full-canvas fill of gold
  // (255, 215, 0), painted after the cacti, so it sits on the obstacle
  // lane for the whole LEVEL. On the night sky (#1a1a2e) the old 0.04
  // peak sat about 9, 8, and 2 levels off that sky — a gold veil across
  // the canvas, brighter than the old 0.12 day wash on white (about 6
  // luminance). Three-fifths of that band is alpha 0.024, about 5, 5,
  // and 1. The luminance lift stays near that old day cue (about 4
  // versus about 6), so the gold still reads once at LEVEL, and it stays
  // under the day peak (0.06) so twilight still eases down. The night
  // cactus (1.65) only moves about 3, 2, and 3, so the lane is not the
  // spotlight. Classic does not read this. Eases with the sky from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // snaps to this at DAY_NIGHT_END; the tint itself stays suppressed
  // under reduced motion. Playtest with ?qaLevel=1&qaNight=1. Read
  // through cfg(). Physics does not read this.
  NIGHT_SKY_TINT_PEAK_ALPHA: 0.024,
  PARTICLE_EMIT_SPREAD:     4,    // px width of the cosmetic xy jitter on every particle emit

  // --- Effects ---
  DEATH_ANIM_FRAMES:       30,    // frames for the score count-up after shake ends
  DEATH_SHAKE_FRAMES:      12,
  DEATH_SHAKE_AMPLITUDE:    4,
  DEATH_SHAKE_FREQ:         1.5,  // multiplier on the sin oscillation that drives the shake transform
  // Visual only. Updated and Daily death nudge, round 2. Classic keeps
  // DEATH_SHAKE_FRAMES (12), DEATH_SHAKE_AMPLITUDE (4), and
  // DEATH_SHAKE_FREQ (1.5). Round 1 was still those 12 frames, at 1.5px
  // and π/12. The lane kept drifting into Game Over. 8 frames is about
  // two thirds of that window. 1px is a quarter of the Classic yank and
  // under a fortieth of the 40px dino, so the cue stays a settle. π/8
  // runs these 8 frames as one half-turn: no reversal, and each step
  // stays under half a pixel. The score pop eases across this same 8, so
  // Game Over does not open on a mid-scale HUD. Day and night share it.
  // Reduced motion keeps these values; the flash and the score pop keep
  // their own shorten. Read through cfg(). A tune outside 1..12 frames,
  // or past the Classic amplitude or frequency, falls back.
  UPDATED_DEATH_SHAKE_FRAMES:    8,
  UPDATED_DEATH_SHAKE_AMPLITUDE: 1,
  UPDATED_DEATH_SHAKE_FREQ:      Math.PI / 8,
  DEATH_FLASH_FRAMES:       6,    // PR-C: white-flash overlay length on collision
  DEATH_FLASH_COLOR_RGB:   '255, 255, 255', // death-flash overlay colour (rgb triplet, alpha applied at draw)
  // Visual only. Peak scale of the white death-flash on the day sky, in
  // Updated and Daily. The first frame multiplies this by
  // deathFlashFrames / DEATH_FLASH_FRAMES, which starts at 1. The overlay
  // is white on #ffffff, so the sky does not move. The blink is the dark
  // shapes (#535353). A peak of 1 turns those shapes pure white and the
  // lane disappears. 0.5 lifts their simple luminance from 83 to 169,
  // just over double, and leaves them near #a9a9a9, so the death cue
  // still reads without slapping Flow. Classic does not read this — the
  // flash is not started. Eases toward NIGHT_DEATH_FLASH_PEAK_ALPHA from
  // DAY_NIGHT_START to DAY_NIGHT_END. Reduced motion skips that ease and
  // keeps this peak until DAY_NIGHT_END; the flash length stays the
  // one-frame shorten. Playtest with ?qaFlash=1. Read through cfg().
  DAY_DEATH_FLASH_PEAK_ALPHA: 0.5,
  // Visual only. Peak scale of the white death-flash once the sky is fully
  // night, in Updated and Daily. A full white overlay on #1a1a2e whites
  // out the canvas. 0.2 is a fifth of that overlay: the sky stays darker
  // than the day dino gray (#535353), and the luminance still more than
  // doubles, so the death cue reads without slapping Flow. Quieter than
  // DAY_DEATH_FLASH_PEAK_ALPHA. Classic does not read this — the flash is
  // not started. The day peak eases to this from DAY_NIGHT_START to
  // DAY_NIGHT_END. Reduced motion skips that ease and snaps to this at
  // DAY_NIGHT_END. Playtest with ?qaFlash=1&qaNight=1. Read through cfg().
  NIGHT_DEATH_FLASH_PEAK_ALPHA: 0.2,
  SCORE_POP_FRAMES:        12,    // classic-length count; Updated pop uses the shake frames
  // Visual only. Peak scale of the Updated/Daily score on the first
  // death-pop frame. It eases from this back to 1 across the Updated
  // death-shake frames (UPDATED_DEATH_SHAKE_FRAMES), the same window as
  // the camera, so the HUD settles with the nudge instead of opening
  // Game Over mid-scale. The scale origin sits on the current score.
  // HI is 140px left of that origin, so a peak of 1.4 slid HI by 56px —
  // a corner slap while the death nudge is 1px. 1.12 grows
  // the 20px digits by about 2.4px and slides HI by about 17px, so the
  // death cue still reads without pulling the eye off the lane. Classic
  // does not start the pop. Reduced motion still skips it. A tune outside
  // 1..1.4 falls back, so a typo cannot slap harder than the old peak or
  // shrink the score. Playtest with ?qaScorePop=1. Read through cfg().
  SCORE_POP_PEAK_SCALE:     1.12,
  MILESTONE_FRAMES:        90,
  // Visual only. Updated and Daily center LEVEL label. Classic keeps
  // bold 22px for every one of these 90 frames, alpha =
  // frames / MILESTONE_FRAMES, black by day and white from
  // DAY_NIGHT_START. The word sits in the jump band for that whole
  // wash, so full-black 22px pulls the eye off the obstacle lane.
  // 16px is about three quarters of that size. 45 frames is half the
  // wash: long enough to read LEVEL once, then the word is gone while
  // the gold wash finishes its 90. Peak 0.5 is half the old ink. Day
  // black lands near #808080. Night white stays a light mark on
  // #1a1a2e. The wash, the confetti, and audio.milestone() do not
  // read these. Reduced motion halves the text frames again and keeps
  // this peak, so the cue still reads when the wash is suppressed.
  // A tune outside 12..18px, 1..90 frames, or 0..1 alpha falls back,
  // so a typo cannot restore the billboard or drop the word. Playtest
  // with ?qaLevel=1, which also holds the quiet peak; that hold is
  // half as long and half as strong under reduced motion. Read
  // through cfg().
  UPDATED_MILESTONE_FONT_PX:     16,
  UPDATED_MILESTONE_TEXT_FRAMES: 45,
  UPDATED_MILESTONE_PEAK_ALPHA:  0.5,
  NEW_BEST_FRAMES:        120,
  // Visual only. Updated and Daily corner NEW BEST badge. Classic keeps
  // bold 14px for all NEW_BEST_FRAMES, gold #ffd700, alpha =
  // frames / NEW_BEST_FRAMES. The badge sits under the score for that
  // whole two seconds, so full-gold 14px keeps pulling the eye back to
  // the corner and off the obstacle lane. 11px is about three quarters
  // of that size. 60 frames is half the countdown: long enough to read
  // NEW BEST once, then the word is gone. Peak 0.65 keeps the gold
  // readable. On white it lands near #ffe559, still a gold mark, quieter
  // than solid #ffd700. On the night sky it stays a dark gold. Reduced
  // motion halves these frames again and keeps this peak, so the cue
  // still reads. A tune outside 10..13px, 1..120 frames, or 0..1 alpha
  // falls back, so a typo cannot restore the 14px badge or drop the
  // word. Playtest with ?qaNewBest=1, which holds the quiet peak; that
  // hold is half as long and half as strong under reduced motion. Read
  // through cfg(). Classic does not read these keys.
  UPDATED_NEW_BEST_FONT_PX:     11,
  UPDATED_NEW_BEST_FRAMES:      60,
  UPDATED_NEW_BEST_PEAK_ALPHA:  0.65,
  // Visual only. Daily Share result confirmation on the Copy result
  // button. The old flash held ✓ Copied! for 90 frames (~1.5 s), long
  // enough to nag after the clipboard tap. 45 frames (~0.75 s) is half
  // of that: still long enough to read Copied, then the label returns to
  // Copy result. Classic and free-play Updated never show the button.
  // A tune outside 1..90 frames falls back, so a typo cannot linger
  // longer than the old flash or drop the word. The confirmation stays
  // this long under reduced motion so it does not flicker. Playtest with
  // ?qaCopy=1, which holds the Copied label; that hold is half as long
  // and quieter under reduced motion. Read through cfg().
  COPY_FLASH_FRAMES:        45,
  // Soft ceiling for the once-per-run plateau cue. The speed curve approaches
  // PLATEAU_SPEED but never reaches it; 0.98 is about score 641. Visual only —
  // speed, gaps, and scoring still read the curve directly, not this ratio.
  PLATEAU_REACH_RATIO:      0.98,
  // Heel-trail whisper starts a little before that cue. 0.96 of plateau
  // speed is still late-run, on the night sky (about score 568). Visual
  // only — speed, gaps, and scoring do not read this ratio. ?qaTrail=1
  // emits the same whisper without waiting for it.
  TRAIL_SPEED_RATIO:        0.96,

  // --- HUD ---
  SCORE_X_OFFSET:         150,    // pixels from right edge for the current-score label
  SCORE_Y:                 30,
  SCORE_HI_X_OFFSET:      110,    // additional px left of SCORE_X_OFFSET for the HI label
  SCORE_FONT_FAMILY:      "'Courier New', Courier, monospace",

  // --- Animation ---
  RUN_FRAME_PERIOD:        10,    // swap run-cycle sprite every N frames (~167 ms @ 60 fps)

  // --- Asset loading ---
  ASSET_LOAD_TIMEOUT_MS: 5000,    // force WAITING state even if assets never finish loading
});

// --- Live-tuning hook (visual-only) -----------------------------------
// cfg(key) reads window.GAME_TUNING[key] when set, else falls back to
// GAME_CONFIG[key]. ONLY use cfg() for visual keys (colours, alphas,
// fade lengths, shake amplitude/freq/frames, particle spread, parallax). Physics, spawning,
// scoring, and hitboxes MUST continue to read GAME_CONFIG.X directly so
// determinism is preserved across runs and tuning sessions.
//
// Workflow from DevTools:
//   GAME_TUNING.SKY_TINT_PEAK_ALPHA = 0.3
//   saveTuning()                            // persist to localStorage
//   location.reload()                       // verify hydration
function cfg(key) {
  const t = window.GAME_TUNING;
  if (t && Object.prototype.hasOwnProperty.call(t, key)) return t[key];
  return GAME_CONFIG[key];
}

function loadTuning() {
  window.GAME_TUNING = window.GAME_TUNING || {};
  try {
    const raw = localStorage.getItem('dino-tuning');
    if (raw) Object.assign(window.GAME_TUNING, JSON.parse(raw));
  } catch (e) { /* malformed JSON or disabled storage — keep defaults */ }
}

function saveTuning() {
  try {
    localStorage.setItem('dino-tuning', JSON.stringify(window.GAME_TUNING || {}));
    return true;
  } catch (e) { return false; }
}

loadTuning();

const ScoreStore = {
  loadHighScore()      { return parseInt(localStorage.getItem('dino-high-score') || '0', 10); },
  saveHighScore(n)     { localStorage.setItem('dino-high-score', String(n)); },
  loadDailyBest() {
    const storedDate = parseInt(localStorage.getItem('dino-daily-date') || '0', 10);
    if (storedDate !== dailySeed()) return 0;
    return parseInt(localStorage.getItem('dino-daily-best') || '0', 10);
  },
  saveDailyBest(score) {
    if (score > this.loadDailyBest()) {
      localStorage.setItem('dino-daily-date', String(dailySeed()));
      localStorage.setItem('dino-daily-best', String(score));
    }
  },
};

const STATE = Object.freeze({
  LOADING: 'LOADING',
  IDLE:    'IDLE',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  DEAD:    'DEAD',
});

// Respect the user's OS-level reduce-motion preference. Read once at startup —
// ambient motion is suppressed when true. Hill respawn still consumes game.rng()
// (see updateHills) so a Daily seed yields the same obstacle sequence either way.
// Tests flip the flag through setReducedMotion(); players do not.
let reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function setReducedMotion(enabled) {
  reducedMotion = !!enabled;
}

// QA/debug only — not for players. ?qaPlateau=1 fires a once-per-run heel puff
// at QA_PLATEAU_SCORE so playtest can see it without reaching the plateau.
// The visible cluster is drawQaPlateau(), from qaPlateauHold, not from a
// free pool slot. A full pool or the short production life still paints
// when motion is allowed. Reduced motion quarters the specks, halves the
// hold, and softens the ink, the same way Particles.emit damps a burst.
// Day fill is the dark QA kind. ?qaNight=1 uses the pale production color.
// Read at boot and again in resetGame() so a mode toggle still honors the
// query. Does not change speed, gaps, or game.rng(). Tests flip it through
// setQaPlateau(); a normal visit leaves this false.
const QA_PLATEAU_SCORE = 1;
const QA_PLATEAU_HOLD = 180;
const QA_PLATEAU_SIZE = 2;
const QA_PLATEAU_RIM = '#1e2a36';
const QA_PLATEAU_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([-3, -2]),
  Object.freeze([2, -3]),
  Object.freeze([-1, -5]),
]);

function readQaPlateauFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaPlateau') === '1';
}

let qaPlateau = readQaPlateauFlag();

function setQaPlateau(enabled) {
  qaPlateau = !!enabled;
}

// QA/debug only — not for players. ?qaCluster=1 forces the first Updated/Daily
// obstacle to be a cluster so playtest can see the silhouette without
// reaching score 250. The type roll is still consumed, so gaps and later
// picks keep their RNG order. Classic never takes the override. Re-read in
// resetGame() like ?qaPlateau=1. Tests flip it through setQaCluster().
function readQaClusterFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaCluster') === '1';
}

let qaCluster = readQaClusterFlag();

function setQaCluster(enabled) {
  qaCluster = !!enabled;
}

// QA/debug only — not for players. ?qaBig=1 forces the first Updated/Daily
// obstacle to be a big cactus so playtest can see the tall silhouette
// without reaching score 100. The type roll is still consumed, so gaps and
// later picks keep their RNG order. Classic never takes the override.
// Re-read in resetGame() like ?qaCluster=1. Tests flip it through setQaBig().
function readQaBigFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaBig') === '1';
}

let qaBig = readQaBigFlag();

function setQaBig(enabled) {
  qaBig = !!enabled;
}

// QA/debug only — not for players. ?qaNight=1 paints full night from the
// first frame so the star fade can be seen without a score-400 run.
// Sky, hills, HUD ink, star init, the Updated/Daily night cactus and dino
// lifts, the Updated/Daily night cloud dim, Updated/Daily jump/land
// dust, the Updated/Daily night ground cool, the Updated/Daily night
// milestone tint, and the Updated/Daily night death flash read it through
// scoreForNightSky. Speed, gaps, scoring, and game.rng() do not. Pair
// with ?qaFlash=1 to see the quieter night blink without colliding.
// Re-read in resetGame()
// like the other QA flags. Tests flip it through setQaNight(); a normal
// visit leaves this false.
function readQaNightFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaNight') === '1';
}

let qaNight = readQaNightFlag();

function setQaNight(enabled) {
  qaNight = !!enabled;
}

// QA/debug only — not for players. ?qaLevel=1 fires the first Updated/Daily
// milestone flash on the opening RUNNING frames so the sky wash and the
// quiet LEVEL word can be seen without a score-100 run. The word also
// stays up for QA_LEVEL_HOLD frames after that live fade, from
// drawQaLevelLabel(), so a short label can still be captured. Reduced
// motion halves that hold and halves its ink. It does not write the
// score, speed, gaps, or game.rng(), and it does not lengthen the gold
// wash. Classic never takes it, so Classic still has no gold tint and
// no early word. The day wash stays the day peak; pair with ?qaNight=1
// for the quiet night peak. Re-read in resetGame() like the other QA
// flags. Tests flip it through setQaLevel(); a normal visit leaves this
// false.
const QA_LEVEL_HOLD = 180;
function readQaLevelFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaLevel') === '1';
}

let qaLevel = readQaLevelFlag();

function setQaLevel(enabled) {
  qaLevel = !!enabled;
}

function qaLevelHoldFrames() {
  if (!reducedMotion) return QA_LEVEL_HOLD;
  return Math.max(2, Math.round(QA_LEVEL_HOLD * 0.5));
}

// QA/debug only — not for players. ?qaTrail=1 emits the late-run heel
// whisper from the first Updated/Daily RUNNING frame, so playtest can see
// it without a score-~570 run. It does not write the score, speed, gaps,
// or game.rng(). Classic never takes it. Pair with ?qaNight=1 to put that
// whisper on the night sky it actually lives on. Re-read in resetGame()
// like the other QA flags. Tests flip it through setQaTrail(); a normal
// visit leaves this false.
function readQaTrailFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaTrail') === '1';
}

let qaTrail = readQaTrailFlag();

function setQaTrail(enabled) {
  qaTrail = !!enabled;
}

// QA/debug only — not for players. ?qaConfetti=1 shows an early gold block
// in Updated/Daily so playtest can see it without a score-100 run.
// The block is its own overlay. It does not emit, restyle, or read the
// particle pool — a full pool or a missed "born" slot must still paint.
// Production confetti stays #ffd700 at 3px on a real level-up.
// It does not write the score, speed, gaps, or game.rng().
// Classic never takes it. One hold per run. Re-read in resetGame().
// Reduced motion halves the hold and halves the ink, so the debug block
// is shorter and softer too. Tests flip it through setQaConfetti(); a
// normal visit leaves this false.
const QA_CONFETTI_HOLD = 180;
const QA_CONFETTI_BLOCK_W = 88;
const QA_CONFETTI_BLOCK_H = 36;
const QA_CONFETTI_COLOR = '#b45309';
const QA_CONFETTI_RIM = '#3f2a12';
function readQaConfettiFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaConfetti') === '1';
}

let qaConfetti = readQaConfettiFlag();

function setQaConfetti(enabled) {
  qaConfetti = !!enabled;
}

function qaConfettiHoldFrames() {
  if (!reducedMotion) return QA_CONFETTI_HOLD;
  return Math.max(2, Math.round(QA_CONFETTI_HOLD * 0.5));
}

// Motion-allowed playtest is full ink so a capture cannot miss the block.
// Reduced motion paints at half ink, matching the shorter hold.
function qaConfettiPaintAlpha() {
  if (!reducedMotion) return 1;
  return 0.5;
}

// QA/debug only — not for players. ?qaDust=1 holds a readable cluster of
// land-dust motes at the feet from the first frame, in Updated and Daily,
// so playtest can see the day brown (pair with ?qaNight=1 for the cool
// night color) without catching a real jump. The marks are their own
// overlay. They do not emit, restyle, or read the particle pool — a full
// pool or a missed jump cannot skip them. Production jump and land stay
// the quieter kinds. It does not write the score, speed, gaps, or
// game.rng(). Classic never takes it. The hold latches once per run and
// only counts down while RUNNING, so it stays up on the idle dino and
// through GET READY. Day paint stays opaque so a capture cannot miss the
// brown. Night paint uses the night takeoff peak instead of solid ink,
// and reduced motion halves that night ink without shortening the hold.
// Re-read in resetGame(). Tests flip it through
// setQaDust(); a normal visit leaves this false.
const QA_DUST_HOLD = 180;
const QA_DUST_SIZE = 4;
const QA_DUST_RIM = '#2a241e';
const QA_DUST_OFFSETS = Object.freeze([
  Object.freeze([-8, -4]),
  Object.freeze([-2, -6]),
  Object.freeze([4, -4]),
  Object.freeze([-5, -9]),
  Object.freeze([1, -8]),
]);
function readQaDustFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaDust') === '1';
}

let qaDust = readQaDustFlag();

function setQaDust(enabled) {
  qaDust = !!enabled;
}

function qaDustMarks() {
  const fx = dino.x + dino.width / 2;
  const fy = dino.y + dino.height;
  return QA_DUST_OFFSETS.map(([dx, dy]) => ({
    x: fx + dx,
    y: fy + dy,
    w: QA_DUST_SIZE,
    h: QA_DUST_SIZE,
  }));
}

// Same fractions Particles.emit uses. Kept here so the hold cannot stay a
// full cluster when the player prefers reduced motion.
function qaPlateauReducedCount(fullCount) {
  return Math.max(1, Math.round(fullCount * 0.25));
}

function qaPlateauHoldFrames() {
  if (!reducedMotion) return QA_PLATEAU_HOLD;
  return Math.max(2, Math.round(QA_PLATEAU_HOLD * 0.5));
}

// Held specks just behind the heel. Game coordinates, not pool slots.
// Reduced motion keeps one speck of the four.
function qaPlateauMarks() {
  const fx = dino.x - 8;
  const fy = dino.y + dino.height - 8;
  const count = reducedMotion
    ? qaPlateauReducedCount(QA_PLATEAU_OFFSETS.length)
    : QA_PLATEAU_OFFSETS.length;
  return QA_PLATEAU_OFFSETS.slice(0, count).map(([dx, dy]) => ({
    x: fx + dx,
    y: fy + dy,
    w: QA_PLATEAU_SIZE,
    h: QA_PLATEAU_SIZE,
  }));
}

// Day capture stays the dark QA ink so it reads on the white sky. Night
// capture uses the pale production color, the one the player sees at the
// real plateau. The rim keeps either fill from disappearing into the sky.
function qaPlateauFill() {
  return qaNight ? Particles.KINDS.plateau.color : Particles.KINDS.plateauQa.color;
}

// Overdraw after the whole frame. The production puff lives 12 frames and
// can sit under the sprite; a full pool can also skip the emit. This pass
// runs from the hold counter only, so playtest still sees the heel cluster
// when motion is allowed. Reduced motion uses the production peak alpha
// instead of solid ink.
function drawQaPlateau() {
  if (!isUpdatedMode() || game.qaPlateauHold <= 0) return;
  const color = qaPlateauFill();
  ctx.save();
  ctx.globalAlpha = reducedMotion ? Particles.KINDS.plateau.alpha : 1;
  ctx.globalCompositeOperation = 'source-over';
  const marks = qaPlateauMarks();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    ctx.fillStyle = QA_PLATEAU_RIM;
    ctx.fillRect(mark.x - 1, mark.y - 1, mark.w + 2, mark.h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
  }
  ctx.restore();
}

// Overdraw after the whole frame. A collision return, the death shake, and
// a full particle pool all happen before this pass. The hold counter is
// the only gate, so a missed emit cannot skip the marks.
// Day hold stays solid. Night hold uses the takeoff peak, the louder of
// the two night inks, so the cluster matches the puff instead of sparkling
// as solid gray. Reduced motion halves that night ink. Twilight eases
// from solid to the peak; reduced motion snaps at full night.
function qaDustPaintAlpha() {
  if (!isUpdatedMode()) return 1;
  const night = tunedUnitAlpha('NIGHT_JUMP_DUST_ALPHA', GAME_CONFIG.NIGHT_JUMP_DUST_ALPHA);
  const s = scoreForNightSky(game.score);
  let alpha = 1;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) alpha = night;
  else if (s > GAME_CONFIG.DAY_NIGHT_START && !reducedMotion) {
    const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
              (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
    alpha = 1 + (night - 1) * t;
  }
  if (reducedMotion && s >= GAME_CONFIG.DAY_NIGHT_END) return alpha * 0.5;
  return alpha;
}

function drawQaDust() {
  if (!isUpdatedMode() || game.qaDustHold <= 0) return;
  const color = landDustColor(Particles.KINDS.jump.color);
  ctx.save();
  ctx.globalAlpha = qaDustPaintAlpha();
  ctx.globalCompositeOperation = 'source-over';
  const marks = qaDustMarks();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    ctx.fillStyle = QA_DUST_RIM;
    ctx.fillRect(mark.x - 1, mark.y - 1, mark.w + 2, mark.h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
  }
  ctx.restore();
}

// Latch on the first Updated/Daily frame of the run, including idle, so
// the marks are already up before GET READY ends. Count down only while
// the run is moving.
function advanceQaDust() {
  if (!isUpdatedMode()) return;
  if (qaDust && !game.qaDustShown) {
    game.qaDustShown = true;
    game.qaDustHold = QA_DUST_HOLD;
    return;
  }
  if (game.state === STATE.RUNNING && game.qaDustHold > 0) game.qaDustHold--;
}

// QA/debug only — not for players. ?qaCollision=1 holds the quieter
// Updated/Daily death puff on the dino from the first RUNNING frame, so
// playtest can see it after GET READY without dying. The marks are their
// own overlay. They do not emit, restyle, or read the particle pool — a
// full pool or the short production life cannot skip them. Production
// collision stays the quieter kind. It does not write the score, speed,
// gaps, or game.rng(). Classic never takes it. Reduced motion halves the
// hold and paints fewer motes at half ink. Re-read in resetGame().
// Tests flip it through setQaCollision(); a normal visit leaves this false.
const QA_COLLISION_HOLD = 180;
const QA_COLLISION_SIZE = 4;
const QA_COLLISION_RIM = '#3d1610';
// Tight cluster on the chest. Every offset, plus the mote and its rim,
// stays inside the 40×50 dino so the hold cannot spray toward a cactus.
const QA_COLLISION_OFFSETS = Object.freeze([
  Object.freeze([-6, -8]),
  Object.freeze([5, -5]),
  Object.freeze([0, 0]),
  Object.freeze([-5, 6]),
  Object.freeze([6, 4]),
]);

function readQaCollisionFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaCollision') === '1';
}

let qaCollision = readQaCollisionFlag();

function setQaCollision(enabled) {
  qaCollision = !!enabled;
}

function qaCollisionHoldFrames() {
  if (!reducedMotion) return QA_COLLISION_HOLD;
  return Math.max(2, Math.round(QA_COLLISION_HOLD * 0.5));
}

function qaCollisionPaintAlpha() {
  if (!reducedMotion) return 1;
  return 0.5;
}

// Same quarter Particles.emit uses. One mote remains so the hold is still
// visible when the player prefers reduced motion.
function qaCollisionMarkCount() {
  const full = QA_COLLISION_OFFSETS.length;
  if (!reducedMotion) return full;
  return Math.max(1, Math.round(full * 0.25));
}

function qaCollisionMarks() {
  const fx = dino.x + dino.width / 2;
  const fy = dino.y + dino.height / 2;
  const count = qaCollisionMarkCount();
  return QA_COLLISION_OFFSETS.slice(0, count).map(([dx, dy]) => ({
    x: fx + dx - QA_COLLISION_SIZE / 2,
    y: fy + dy - QA_COLLISION_SIZE / 2,
    w: QA_COLLISION_SIZE,
    h: QA_COLLISION_SIZE,
  }));
}

function advanceQaCollision() {
  if (!isUpdatedMode()) return;
  if (qaCollision && !game.qaCollisionShown && game.state === STATE.RUNNING) {
    game.qaCollisionShown = true;
    game.qaCollisionHold = qaCollisionHoldFrames();
    return;
  }
  if (game.state === STATE.RUNNING && game.qaCollisionHold > 0) game.qaCollisionHold--;
}

// Overdraw after the whole frame, from the hold counter only. A collision
// return skips the running draw, and the real puff only lives a few frames.
// This pass still paints, on the body, in the production red.
function drawQaCollision() {
  if (!isUpdatedMode() || game.qaCollisionHold <= 0) return;
  const color = Particles.KINDS.collision.color;
  ctx.save();
  ctx.globalAlpha = qaCollisionPaintAlpha();
  ctx.globalCompositeOperation = 'source-over';
  const marks = qaCollisionMarks();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    ctx.fillStyle = QA_COLLISION_RIM;
    ctx.fillRect(mark.x - 1, mark.y - 1, mark.w + 2, mark.h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
  }
  ctx.restore();
}

// QA/debug only — not for players. ?qaFlash=1 holds the Updated/Daily death
// blink from the first RUNNING frame so playtest can see it without dying
// late. The wash is its own full-canvas fill. It does not read
// deathFlashFrames, the particle pool, or a collision — a missed hit or a
// zero flash timer cannot skip it. The ink is the real peak:
// DAY_DEATH_FLASH_PEAK_ALPHA by day, NIGHT_DEATH_FLASH_PEAK_ALPHA with
// ?qaNight=1. It does not write the score, speed, gaps, or game.rng().
// Classic never takes it. Reduced motion halves the hold and halves the
// ink, so the debug wash is shorter and softer too. Re-read in resetGame().
// Tests flip it through setQaFlash(); a normal visit leaves this false.
const QA_FLASH_HOLD = 180;

function readQaFlashFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaFlash') === '1';
}

let qaFlash = readQaFlashFlag();

function setQaFlash(enabled) {
  qaFlash = !!enabled;
}

function qaFlashHoldFrames() {
  if (!reducedMotion) return QA_FLASH_HOLD;
  return Math.max(2, Math.round(QA_FLASH_HOLD * 0.5));
}

// Motion-allowed playtest shows the real peak. Reduced motion still paints,
// at half that peak, so a long hold cannot stay a full-strength blink.
function qaFlashPaintAlpha() {
  const peak = deathFlashPeakAlpha();
  if (!reducedMotion) return peak;
  return peak * 0.5;
}

function advanceQaFlash() {
  if (!isUpdatedMode()) return;
  if (qaFlash && !game.qaFlashShown && game.state === STATE.RUNNING) {
    game.qaFlashShown = true;
    game.qaFlashHold = qaFlashHoldFrames();
    return;
  }
  if (game.state === STATE.RUNNING && game.qaFlashHold > 0) game.qaFlashHold--;
}

// Overdraw after the whole frame, from the hold counter only. handleDead
// draws the real flash, and a collision returns before that draw on the
// hit frame. This pass runs from gameLoop after the handler, so neither
// can skip it. source-over, on top of the HUD.
function drawQaFlash() {
  if (!isUpdatedMode() || game.qaFlashHold <= 0) return;
  const alpha = qaFlashPaintAlpha();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(' + cfg('DEATH_FLASH_COLOR_RGB') + ', ' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.restore();
}

// QA/debug only — not for players. ?qaScorePop=1 holds the Updated/Daily
// death score pop from the first RUNNING frame so playtest can see the
// quieter swell without dying. The digits are their own overdraw. They
// do not read scorePopFrames — reduced motion skips the real pop, and a
// zero timer or a collision return cannot skip this hold. The cover is
// the sky, then the score is drawn at the peak, so the resting digits
// cannot ghost under a slightly larger copy. It does not write the score,
// speed, gaps, or game.rng(). Classic never takes it. Reduced motion
// halves the hold and halves the extra scale, and still paints. Re-read
// in resetGame(). Tests flip it through setQaScorePop(); a normal visit
// leaves this false.
const QA_SCORE_POP_HOLD = 180;

function readQaScorePopFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaScorePop') === '1';
}

let qaScorePop = readQaScorePopFlag();

function setQaScorePop(enabled) {
  qaScorePop = !!enabled;
}

function qaScorePopHoldFrames() {
  if (!reducedMotion) return QA_SCORE_POP_HOLD;
  return Math.max(2, Math.round(QA_SCORE_POP_HOLD * 0.5));
}

// Motion-allowed playtest shows the real peak. Reduced motion keeps half
// of the extra scale, still above 1, so the hold cannot sit at rest size.
function qaScorePopScale() {
  const peak = scorePopPeakScale();
  if (!reducedMotion) return peak;
  return 1 + (peak - 1) * 0.5;
}

// Sky patch large enough for the loudest allowed peak (1.4), so a tune
// cannot leave a ghost of HI beside the swollen digits.
function qaScorePopCover() {
  const originX = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30;
  const hiX = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET - GAME_CONFIG.SCORE_HI_X_OFFSET;
  const left = Math.floor(originX + (hiX - originX) * 1.4) - 8;
  return {
    x: left,
    y: 0,
    w: GAME_CONFIG.CANVAS_W - left,
    h: GAME_CONFIG.SCORE_Y + 28,
  };
}

function advanceQaScorePop() {
  if (!isUpdatedMode()) return;
  if (qaScorePop && !game.qaScorePopShown && game.state === STATE.RUNNING) {
    game.qaScorePopShown = true;
    game.qaScorePopHold = qaScorePopHoldFrames();
    return;
  }
  if (game.state === STATE.RUNNING && game.qaScorePopHold > 0) game.qaScorePopHold--;
}

// Overdraw after the whole frame, from the hold counter only. handleDead
// draws the real pop inside the shake, and a collision returns before
// that draw on the hit frame. This pass runs from gameLoop after the
// handler, so neither can skip it. It sits above the flash so a
// full-canvas blink cannot cover the digits this hold exists to show.
// drawQaNewBest paints after this, so the corner badge stays above the swell.
function drawQaScorePop() {
  if (!isUpdatedMode() || game.qaScorePopHold <= 0) return;
  const cover = qaScorePopCover();
  const scale = qaScorePopScale();
  const cx = GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30;
  const cy = GAME_CONFIG.SCORE_Y - 8;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  paintHudScore();
  ctx.restore();
}

// QA/debug only — not for players. ?qaShake=1 holds the quieter Updated/Daily
// death nudge from the first RUNNING frame, after GET READY, so playtest
// can see the settle without dying. The shift is the camera translate at
// the peak of that half-turn (the quiet amplitude). It does not read
// deathShakeFrames, and it does not write the score, speed, gaps, or
// game.rng(). Classic never takes it. Reduced motion halves the hold and
// halves the shift, and still paints. Re-read in resetGame(). Tests flip
// it through setQaShake(); a normal visit leaves this false.
const QA_SHAKE_HOLD = 180;

function readQaShakeFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaShake') === '1';
}

let qaShake = readQaShakeFlag();

function setQaShake(enabled) {
  qaShake = !!enabled;
}

function qaShakeHoldFrames() {
  if (!reducedMotion) return QA_SHAKE_HOLD;
  return Math.max(2, Math.round(QA_SHAKE_HOLD * 0.5));
}

// Motion-allowed playtest shows the real quiet peak. Reduced motion keeps
// half of that shift, so a long hold cannot sit at the full nudge.
function qaShakeOffset() {
  const peak = deathShakeAmplitude();
  if (!isUpdatedMode()) return 0;
  if (!reducedMotion) return peak;
  return peak * 0.5;
}

function advanceQaShake() {
  if (!isUpdatedMode()) return;
  if (qaShake && !game.qaShakeShown && game.state === STATE.RUNNING) {
    game.qaShakeShown = true;
    game.qaShakeHold = qaShakeHoldFrames();
    return;
  }
  if (game.state === STATE.RUNNING && game.qaShakeHold > 0) game.qaShakeHold--;
}

// The running draw is already on screen. Shift that frame by the quiet
// peak so a still shows the settle. Restore before the other debug
// overdraws, which stay canvas-aligned the way the death flash does.
function beginQaShake() {
  if (!isUpdatedMode() || game.qaShakeHold <= 0 || game.state !== STATE.RUNNING) return false;
  ctx.save();
  ctx.translate(qaShakeOffset(), 0);
  return true;
}

function endQaShake(active) {
  if (active) ctx.restore();
}

// QA/debug only — not for players. ?qaNewBest=1 holds the quieter Updated/Daily
// NEW BEST badge from the first RUNNING frame, so playtest can see it after
// GET READY without beating a stored high score. The badge is its own
// overdraw from drawQaNewBest(). It does not set newBestShown, does not
// start newBestFrames, and does not write the score, speed, gaps, high
// score, or game.rng(). Classic never takes it. Reduced motion halves the
// hold and halves its ink, and still paints. Re-read in resetGame().
// Tests flip it through setQaNewBest(); a normal visit leaves this false.
const QA_NEW_BEST_HOLD = 180;

function readQaNewBestFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaNewBest') === '1';
}

let qaNewBest = readQaNewBestFlag();

function setQaNewBest(enabled) {
  qaNewBest = !!enabled;
}

function qaNewBestHoldFrames() {
  if (!reducedMotion) return QA_NEW_BEST_HOLD;
  return Math.max(2, Math.round(QA_NEW_BEST_HOLD * 0.5));
}

function advanceQaNewBest() {
  if (!isUpdatedMode()) return;
  if (qaNewBest && !game.qaNewBestShown && game.state === STATE.RUNNING) {
    game.qaNewBestShown = true;
    game.qaNewBestHold = qaNewBestHoldFrames();
    return;
  }
  if (game.state === STATE.RUNNING && game.qaNewBestHold > 0) game.qaNewBestHold--;
}

// QA/debug only — not for players. ?qaCopy=1 holds the Daily Copy result
// button on ✓ Copied! from the first WAITING, RUNNING, or DEAD frame, so
// playtest can see the quieter confirmation without a clipboard write or a
// finished score count-up. The button is the flash UI. This does not start
// copyFlashFrames, does not call shareDailyResult(), and does not write the
// score, speed, gaps, particles, or game.rng(). Classic and free-play
// Updated never take it. Reduced motion halves the hold and adds the
// quieter is-qa-damped paint. Re-read in resetGame(). Tests flip it through
// setQaCopy(); a normal visit leaves this false.
const QA_COPY_HOLD = 180;

function readQaCopyFlag(search) {
  const query = search !== undefined
    ? search
    : (typeof location !== 'undefined' && location && typeof location.search === 'string'
      ? location.search
      : '');
  if (!query) return false;
  return new URLSearchParams(query).get('qaCopy') === '1';
}

let qaCopy = readQaCopyFlag();

function setQaCopy(enabled) {
  qaCopy = !!enabled;
}

function qaCopyHoldFrames() {
  if (!reducedMotion) return QA_COPY_HOLD;
  return Math.max(2, Math.round(QA_COPY_HOLD * 0.5));
}

function advanceQaCopy() {
  if (!isDailyMode()) return;
  const visible = game.state === STATE.WAITING
    || game.state === STATE.RUNNING
    || game.state === STATE.DEAD;
  if (!visible) return;
  if (qaCopy && !game.qaCopyShown) {
    game.qaCopyShown = true;
    game.qaCopyHold = qaCopyHoldFrames();
    return;
  }
  if (game.qaCopyHold > 0) game.qaCopyHold--;
}

function applyQaCopyButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  if (isDailyMode() && game.qaCopyHold > 0) {
    if (btn.style) btn.style.display = 'block';
    btn.textContent = '✓ Copied!';
    markShareCopied(btn, true, reducedMotion);
    return;
  }
  if (!game.qaCopyShown) return;
  const settledDailyDeath = isDailyMode()
    && game.state === STATE.DEAD
    && Animations.deathShakeFrames <= 0
    && Animations.deathAnimFrame >= GAME_CONFIG.DEATH_ANIM_FRAMES;
  if (settledDailyDeath) return;
  if (btn.style) btn.style.display = 'none';
  if (Animations.copyFlashFrames <= 0) {
    btn.textContent = '📋 Copy result';
    markShareCopied(btn, false, false);
  }
}

// Solid block just under the score digits. Game coordinates, not pool slots.
function qaConfettiRect() {
  return {
    x: GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET,
    y: GAME_CONFIG.SCORE_Y + 10,
    w: QA_CONFETTI_BLOCK_W,
    h: QA_CONFETTI_BLOCK_H,
  };
}

// Overdraw after the whole frame. The running handler returns before its
// own draw when a cactus hits, and the death shake then redraws the score
// on top of whatever was there. This pass runs from gameLoop after that,
// from the hold counter only — a missed particle emit cannot skip it.
// Dark rim, source-over, on top of the HUD. Motion-allowed playtest is
// full ink. Reduced motion paints at half ink.
function drawQaConfetti() {
  if (!isUpdatedMode() || game.qaConfettiHold <= 0) return;
  ctx.save();
  ctx.globalAlpha = qaConfettiPaintAlpha();
  ctx.globalCompositeOperation = 'source-over';
  const block = qaConfettiRect();
  ctx.fillStyle = QA_CONFETTI_RIM;
  ctx.fillRect(block.x - 4, block.y - 4, block.w + 8, block.h + 8);
  ctx.fillStyle = QA_CONFETTI_COLOR;
  ctx.fillRect(block.x, block.y, block.w, block.h);
  ctx.restore();
}

// Score the night sky consults. The QA flag pretends night has fully arrived.
function scoreForNightSky(score) {
  if (!qaNight) return score;
  return score < GAME_CONFIG.DAY_NIGHT_END ? GAME_CONFIG.DAY_NIGHT_END : score;
}

// Returns the rolled type, or the cluster type once per run when the QA flag
// is on. Updated and Daily only. Does not call game.rng().
function qaClusterOverride(rolledType) {
  if (!qaCluster || game.qaClusterShown || !isUpdatedMode()) return rolledType;
  const cluster = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'cluster');
  if (!cluster) return rolledType;
  game.qaClusterShown = true;
  return cluster;
}

// Returns the rolled type, or the big cactus once per run when the QA flag
// is on. Updated and Daily only. Does not call game.rng().
function qaBigOverride(rolledType) {
  if (!qaBig || game.qaBigShown || !isUpdatedMode()) return rolledType;
  const big = GAME_CONFIG.OBSTACLE_TYPES.find(t => t.id === 'big');
  if (!big) return rolledType;
  game.qaBigShown = true;
  return big;
}

// --- Web Audio module (PR-B) ---
// Synthesised SFX — no asset files. Lazy-creates AudioContext on first user
// gesture (Chrome's autoplay policy) and silently no-ops if AudioContext is
// unavailable (Node tests, very old browsers).
const audio = {
  ctx: null,
  muted: localStorage.getItem('dino-muted') === '1',
  ensure() {
    if (!this.ctx) {
      const Ctx = (typeof AudioContext !== 'undefined') ? AudioContext
                : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
                : null;
      if (!Ctx) return null;
      try { this.ctx = new Ctx(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => { /* swallow autoplay-block etc. */ });
    }
    return this.ctx;
  },
  setMuted(v) {
    this.muted = !!v;
    localStorage.setItem('dino-muted', this.muted ? '1' : '0');
  },
  // Short envelope-shaped tone. Used by jump/land/milestone.
  blip(freq, durationMs, type = 'sine', gain = 0.04) {
    if (this.muted || !isUpdatedMode()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  },
  jump()      { this.blip(420 + (Math.random() - 0.5) * 40, 80, 'sine', 0.04); },
  land()      { this.blip(140, 60, 'sine', 0.05); },
  milestone() {
    this.blip(880, 120, 'triangle', 0.05);
    setTimeout(() => this.blip(1320, 120, 'triangle', 0.05), 80);
  },
  // Downward freq sweep for death — distinctly more dramatic than blip().
  death() {
    if (this.muted || !isUpdatedMode()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  },
};

// == SECTION 3: ASSET LOADING ==

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
initCanvasScale();
if (typeof process === 'undefined') window.addEventListener('resize', handleResize);
const a11yLive = document.getElementById('a11y-live');

function announce(message) {
  if (a11yLive && typeof a11yLive.textContent !== 'undefined') {
    a11yLive.textContent = message;
  }
}

const dino = {
  x: GAME_CONFIG.DINO_X,
  y: 150,
  width: GAME_CONFIG.DINO_WIDTH,
  height: GAME_CONFIG.DINO_HEIGHT,
  velocityY: 0,
  gravity: GAME_CONFIG.GRAVITY,
  jumpPower: GAME_CONFIG.JUMP_POWER,
  isJumping: false,
  image: new Image(),
};

dino.image.src = 'assets/dino-stationary.png';

const dinoRunImages = [new Image(), new Image()];
dinoRunImages[0].src = 'assets/dino-run-0.png';
dinoRunImages[1].src = 'assets/dino-run-1.png';

const dinoLoseImage = new Image();
dinoLoseImage.src = 'assets/dino-lose.png';

const groundImage = new Image();
groundImage.src = 'assets/ground.png';

const obstacleImage = new Image();
obstacleImage.src = 'assets/cactus.png';

let imagesLoaded = 0;
let assetsStarted = false;
const totalImages = 6;

function imageReady(img) {
  return img && img.complete && img.naturalWidth !== 0;
}

function initCanvasScale() {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = Math.round(cssW / 3);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(canvas.width / 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(canvas.width / GAME_CONFIG.CANVAS_W, canvas.height / GAME_CONFIG.CANVAS_H);
}

function handleResize() {
  initCanvasScale();
  if (game.state === STATE.DEAD) drawGameOverScreen();
}

function startGameOnce() {
  if (assetsStarted) return;
  assetsStarted = true;
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.IDLE;
  gameLoop();
}

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) startGameOnce();
}

function onImageError() {
  // Don't block the game on a missing asset — drawing code falls back to rectangles.
  console.warn('A game asset failed to load. Continuing with fallback rendering.');
  onImageLoad();
}

dino.image.onload = onImageLoad;
dino.image.onerror = onImageError;
dinoRunImages[0].onload = onImageLoad;
dinoRunImages[0].onerror = onImageError;
dinoRunImages[1].onload = onImageLoad;
dinoRunImages[1].onerror = onImageError;
dinoLoseImage.onload = onImageLoad;
dinoLoseImage.onerror = onImageError;
groundImage.onload = onImageLoad;
groundImage.onerror = onImageError;
obstacleImage.onload = onImageLoad;
obstacleImage.onerror = onImageError;

// Safety net: if the network stalls, start after a timeout so the user isn't
// stuck on a blank screen. Drawing will fall back to rectangles for any
// unloaded sprites. Skipped in Node so tests don't keep the event loop alive.
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
if (typeof setTimeout !== 'undefined' && !isNode) {
  setTimeout(() => {
    if (!assetsStarted) {
      console.warn('Asset load timeout — starting with whatever is available.');
      startGameOnce();
    }
  }, GAME_CONFIG.ASSET_LOAD_TIMEOUT_MS);
}

// == SECTION 4: GAME STATE ==

// mulberry32 — tiny seeded PRNG (~32-bit state). Swappable via `game.rng` so
// tests can pin it to a deterministic sequence.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Compute the gap (px) to the next obstacle, given current speed + an RNG.
// Classic keeps the shrinking pixel curve, floored at MIN_SPAWN_GAP, with no
// jitter. Updated and Daily use that same curve early; once it would compress
// time-between-obstacles below one focused jump, the gap scales with speed so
// the worst jitter still leaves UPDATED_MIN_GAP_FRAMES. Jitter is one rng()
// call, same as before — type is rolled first by the caller.
function computeNextSpawnGap(rng, currentSpeed, mode) {
  const classicBase =
    GAME_CONFIG.MAX_SPAWN_GAP -
    (currentSpeed - GAME_CONFIG.INITIAL_SPEED) * GAME_CONFIG.SPAWN_GAP_SPEED_FACTOR;
  if (mode === 'classic') {
    return Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.round(classicBase));
  }
  const minTimeGap = currentSpeed * GAME_CONFIG.UPDATED_MIN_GAP_FRAMES;
  const fairBase = minTimeGap / (1 - GAME_CONFIG.SPAWN_GAP_JITTER);
  const baseGap = Math.max(classicBase, fairBase);
  const jitter = (rng() - 0.5) * 2 * GAME_CONFIG.SPAWN_GAP_JITTER; // range [-J, +J]
  // ceil keeps the worst gap on a whole pixel without dipping under the frame budget.
  const floor = Math.max(GAME_CONFIG.MIN_SPAWN_GAP, Math.ceil(minTimeGap));
  return Math.max(floor, Math.round(baseGap * (1 + jitter)));
}

// Pick an obstacle type weighted by score-tier eligibility. Types with
// unlockScore > score are excluded; among the rest, each contributes its
// `weight` to a weighted random draw. In classic mode, only the small cactus
// is ever returned — matches the original Chrome T-Rex's spartan look.
function pickObstacleType(rng, score, mode) {
  if (mode === 'classic') return GAME_CONFIG.OBSTACLE_TYPES[0]; // small cactus
  const eligible = GAME_CONFIG.OBSTACLE_TYPES.filter(t => score >= t.unlockScore);
  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return eligible[eligible.length - 1]; // rounding guard
}

const DifficultyProfile = {
  speedAtScore(score) {
    const { INITIAL_SPEED, PLATEAU_SPEED, RAMP_STEEPNESS, RAMP_MIDPOINT } = GAME_CONFIG;
    return INITIAL_SPEED + (PLATEAU_SPEED - INITIAL_SPEED) *
      (1 / (1 + Math.exp(-RAMP_STEEPNESS * (score - RAMP_MIDPOINT))));
  },
  nextObstacle(score, mode, rng) {
    const speed = this.speedAtScore(score);
    // RNG call order is load-bearing: type roll first, gap jitter second.
    // Swapping breaks the daily-challenge seed sequence.
    const type = pickObstacleType(rng, score, mode);
    return {
      type,
      gap: computeNextSpawnGap(rng, speed, mode),
    };
  },
};

const MODES = Object.freeze({ CLASSIC: 'classic', UPDATED: 'updated', DAILY: 'daily' });

// Read the saved mode (defaults to 'updated' for first-time players). Persists
// across reload so the user's preference is remembered.
function loadMode() {
  const stored = localStorage.getItem('dino-mode');
  return stored === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
}

// --- Daily challenge helpers -------------------------------------------
// One shared calendar: UTC. dailySeed(), dailyNumber(), and the
// dino-daily-date key all flip together at 00:00 UTC. Local wall-clock
// time does not choose the course, the #N, or TODAY BEST.
// Epoch: project launch 2026-03-01 00:00 UTC. Day 1 = that UTC date.
const DAILY_EPOCH_MS = new Date('2026-03-01T00:00:00Z').getTime();

// Today's UTC date as a YYYYMMDD integer. Same value for every player
// on the same UTC day. Seeds daily runs and keys dino-daily-date.
function dailySeed() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// Ordinal UTC day shown on pre-run framing, the Game Over screen, and in
// share text (#1, #2, …). 86400000 ms steps from the UTC epoch, so this
// matches dailySeed()'s calendar day. Display-only — not a second calendar.
function dailyNumber() {
  return Math.floor((Date.now() - DAILY_EPOCH_MS) / 86400000) + 1;
}

// Pre-run framing. A shared-course reminder, not a score. The daily number
// is composed when the line is drawn or announced, so GET READY shows the
// same UTC #N as Game Over and share. Drawn only on the GET READY overlay
// while WAITING in a Daily Challenge. Static — no pulse.
const DAILY_PRE_RUN_LINE = 'Same course as everyone today';

function dailyPreRunLine() {
  return DAILY_PRE_RUN_LINE + ' · #' + dailyNumber();
}

// Death-screen hint. One quiet line after the score count-up, pointing at
// TODAY BEST and the existing Copy result button. Static — no pulse.
const DAILY_DEATH_HINT = 'Share TODAY BEST with Copy result';

// All mutable game state lives on this object. Keeping it in one place prevents
// stray top-level globals and makes resets + test inspection simpler.
// One clock read so the stored run seed is the same integer the RNG was built from.
const bootSeed = Date.now() >>> 0;
const game = {
  state:            STATE.LOADING,
  obstacles:        [],
  currentSpeed:     GAME_CONFIG.INITIAL_SPEED,
  lastObstacleX:    -300,
  nextSpawnGap:     GAME_CONFIG.MAX_SPAWN_GAP,
  graceFrames:      GAME_CONFIG.GRACE_FRAMES,
  animationFrameId: undefined,
  score:            0,
  highScore:        ScoreStore.loadHighScore(),
  animFrame:        0,
  groundX:          0,
  clouds:           [],
  stars:            [],
  starsInitialised: false,
  // Running frames since stars appeared. 0 until night init; caps at the fade length.
  starFadeFrames:   0,
  hills:            [],
  milestoneText:    '',
  newBestShown:     false,
  plateauCueShown:  false,
  // QA/debug only. Latches after ?qaCluster=1 spends its one early cluster.
  qaClusterShown:   false,
  // QA/debug only. Latches after ?qaBig=1 spends its one early big cactus.
  qaBigShown:       false,
  // QA/debug only. Latches after ?qaLevel=1 spends its one early milestone flash.
  qaLevelShown:     false,
  // QA/debug only. Frames left on the ?qaLevel=1 quiet LEVEL label.
  qaLevelHold:      0,
  // QA/debug only. Latches after ?qaConfetti=1 spends its one early gold puff.
  qaConfettiShown:  false,
  qaConfettiHold:   0,
  // QA/debug only. Latches after ?qaDust=1 spends its one held foot cluster.
  qaDustShown:      false,
  qaDustHold:       0,
  // QA/debug only. Latches after ?qaCollision=1 spends its one held death puff.
  qaCollisionShown: false,
  qaCollisionHold:  0,
  // QA/debug only. Frames left on the ?qaPlateau=1 heel cluster.
  qaPlateauHold:    0,
  // QA/debug only. Latches after ?qaFlash=1 spends its one early death blink.
  qaFlashShown:     false,
  qaFlashHold:      0,
  // QA/debug only. Latches after ?qaScorePop=1 spends its one early score swell.
  qaScorePopShown:  false,
  qaScorePopHold:   0,
  // QA/debug only. Latches after ?qaShake=1 spends its one early death nudge.
  qaShakeShown:     false,
  qaShakeHold:      0,
  // QA/debug only. Latches after ?qaNewBest=1 spends its one early badge.
  qaNewBestShown:   false,
  // QA/debug only. Frames left on the ?qaNewBest=1 quiet NEW BEST badge.
  qaNewBestHold:    0,
  // QA/debug only. Latches after ?qaCopy=1 spends its one Copied hold.
  qaCopyShown:      false,
  // QA/debug only. Frames left on the ?qaCopy=1 Copied label.
  qaCopyHold:       0,
  isNewBest:         false,
  previousHighScore: 0,
  // Set on a Daily death before today best is saved. Mirrors isNewBest:
  // true when this run beats today, including the first run of the day.
  isNewTodayBest:    false,
  previousDailyBest: 0,
  // Boot seed matches the RNG created below. resetGame() replaces it with
  // the daily seed or a fresh clock seed before the next run.
  runSeed:           bootSeed,
  seedOverride:      null,
  lastGaps:          [],
  lastObstacleTypes: [],
  lastJumpFrame:     null,
  deathLog:          null,
  rng:               mulberry32(bootSeed),
  mode:             loadMode(),
  dailyBest:        ScoreStore.loadDailyBest(),
  // False until the player has died once this session. First IDLE → WAITING
  // keeps the full countdown; restarts after death can skip it.
  countdownSkippable: false,
};

// All per-run animation countdown timers. Kept separate from the game object
// so reset() is a single call and adding a new timer has exactly one place.
const Animations = {
  deathAnimFrame:   0,
  deathShakeFrames: 0,
  deathFlashFrames: 0,
  scorePopFrames:   0,
  milestoneFrames:  0,
  newBestFrames:    0,
  copyFlashFrames:  0,
  reset() {
    this.deathAnimFrame = this.deathShakeFrames = this.deathFlashFrames = 0;
    this.scorePopFrames = this.milestoneFrames  = this.newBestFrames    = 0;
    this.copyFlashFrames = 0;
  },
};

function setMode(newMode) {
  game.mode = newMode === MODES.CLASSIC ? MODES.CLASSIC : MODES.UPDATED;
  localStorage.setItem('dino-mode', game.mode);
  refreshModeToggle();
  // Restart the run cleanly so the new mode's spawn rules take effect immediately.
  cancelAnimationFrame(game.animationFrameId);
  resetGame();
  gameLoop();
}

// Build and copy the daily result string to the clipboard.
// Returns the text so tests can assert its shape without touching clipboard.
function shareDailyResult() {
  const score = game.dailyBest > 0 ? game.dailyBest : Math.floor(game.score);
  const text = [
    'Rex Daily #' + dailyNumber() + ' 🦕',
    'Score: ' + score,
    'https://snehiths19.github.io/chrome-offline-Rex/',
  ].join('\n');
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    // writeText can throw synchronously when the clipboard is blocked.
    // That must not escape: the Copied flash is independent of the write.
    try {
      const pending = navigator.clipboard.writeText(text);
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch { /* clipboard blocked */ }
  }
  return text;
}

// --- Opt-in death log (Scout / bug evidence) ---------------------------
// Off unless the page is opened with ?debug=1 or DevTools calls
// enableDeathLog(). Nothing here feeds spawn, score, or hitboxes.
//
//   enableDeathLog()     // start recording this session
//   disableDeathLog()
//   replayRunSeed(12345) // next resetGame() uses this seed, then forgets it
//   dumpRun()            // latest death JSON, or a live snapshot
//   copyDeathLog()       // same payload on the clipboard
// Press L while debug is on to log the current run.
const DEATH_LOG_HISTORY = 8;
let runDebug = false;

function isDeathLogEnabled() {
  return runDebug;
}

function enableDeathLog() {
  runDebug = true;
}

function disableDeathLog() {
  runDebug = false;
}

function applyDebugFromLocation() {
  if (typeof location === 'undefined' || !location || typeof location.search !== 'string') return;
  if (/(?:^|[?&])debug=1(?:&|$)/.test(location.search)) runDebug = true;
}

function replayRunSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return;
  game.seedOverride = n >>> 0;
}

function takeRunSeed() {
  if (game.seedOverride != null) {
    const seed = game.seedOverride >>> 0;
    game.seedOverride = null;
    return seed;
  }
  return isDailyMode() ? dailySeed() : (Date.now() >>> 0);
}

function copyText(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) return;
  try {
    const pending = navigator.clipboard.writeText(text);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch { /* clipboard unavailable or blocked */ }
}

function noteSpawnForDeathLog(gapPx, typeId, speed) {
  if (!runDebug) return;
  const framesApprox = speed > 0 ? Math.max(1, Math.round(gapPx / speed)) : 0;
  game.lastGaps.push({
    px: gapPx,
    framesApprox,
    msApprox: Math.round(framesApprox * 1000 / 60),
  });
  game.lastObstacleTypes.push(typeId);
  if (game.lastGaps.length > DEATH_LOG_HISTORY) game.lastGaps.shift();
  if (game.lastObstacleTypes.length > DEATH_LOG_HISTORY) game.lastObstacleTypes.shift();
}

function buildRunSnapshot(reason) {
  return {
    reason,
    mode: game.mode,
    score: Math.floor(game.score),
    seed: game.runSeed,
    speed: Math.round(game.currentSpeed * 100) / 100,
    nextSpawnGap: game.nextSpawnGap,
    lastGaps: game.lastGaps.map(g => ({ px: g.px, framesApprox: g.framesApprox, msApprox: g.msApprox })),
    lastObstacleTypes: game.lastObstacleTypes.slice(),
    diedAtFrame: reason === 'death' ? game.animFrame : null,
    framesSinceJump: game.lastJumpFrame == null ? null : game.animFrame - game.lastJumpFrame,
  };
}

function publishRunSnapshot(snapshot) {
  game.deathLog = snapshot;
  const text = JSON.stringify(snapshot, null, 2);
  console.log('[rex-death-log]\n' + text);
  copyText(text);
  return snapshot;
}

function dumpRun() {
  if (!runDebug) return null;
  if (game.state === STATE.DEAD && game.deathLog) return game.deathLog;
  return buildRunSnapshot('key');
}

function copyDeathLog() {
  if (!runDebug) return null;
  const snapshot = (game.state === STATE.DEAD && game.deathLog) ? game.deathLog : buildRunSnapshot('key');
  const text = JSON.stringify(snapshot, null, 2);
  copyText(text);
  return text;
}

function handleDebugKey(event) {
  if (!runDebug || !event || event.code !== 'KeyL') return;
  if (game.state === STATE.DEAD && game.deathLog) {
    copyText(JSON.stringify(game.deathLog, null, 2));
    return;
  }
  publishRunSnapshot(buildRunSnapshot('key'));
}

function drawDebugHud() {
  if (!runDebug) return;
  const speed = (Math.round(game.currentSpeed * 100) / 100).toFixed(2);
  const line = 'dbg ' + game.mode + ' ' + Math.floor(game.score)
    + ' spd ' + speed
    + ' gap ' + game.nextSpawnGap
    + ' seed ' + game.runSeed;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = game.score >= GAME_CONFIG.DAY_NIGHT_START ? '#c8c8c8' : '#6a6a6a';
  ctx.font = '11px ' + cfg('SCORE_FONT_FAMILY');
  ctx.textAlign = 'left';
  ctx.fillText(line, 8, 12);
  ctx.restore();
}

applyDebugFromLocation();
window.enableDeathLog = enableDeathLog;
window.disableDeathLog = disableDeathLog;
window.dumpRun = dumpRun;
window.copyDeathLog = copyDeathLog;
window.replayRunSeed = replayRunSeed;

// == SECTION 5: RENDERING ==

function getBackgroundColor(s) {
  s = scoreForNightSky(s);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return '#ffffff';
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return '#1a1a2e';
  if (reducedMotion) return '#ffffff'; // no smooth interpolation — snap at end
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const r = Math.round(255 + (26 - 255) * t);
  const g = Math.round(255 + (26 - 255) * t);
  const b = Math.round(255 + (46 - 255) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 0 at the moment night begins, 1 once STAR_FADE_FRAMES have elapsed.
// A non-positive tuned length means "show them immediately".
function starFadeAlpha() {
  const total = cfg('STAR_FADE_FRAMES');
  if (!(total > 0)) return 1;
  return Math.min(1, game.starFadeFrames / total);
}

// Updated and Daily multiply that shared ramp by the night whisper.
// Classic paints the ramp at full white. A tune outside 0..1 falls back,
// so a typo cannot restore the sparkle or drop the field.
function starPaintAlpha() {
  const ramp = starFadeAlpha();
  if (!isUpdatedMode()) return ramp;
  const tuned = cfg('NIGHT_STAR_ALPHA');
  const peak = typeof tuned === 'number' && tuned >= 0 && tuned <= 1
    ? tuned
    : GAME_CONFIG.NIGHT_STAR_ALPHA;
  return ramp * peak;
}

function drawBackground() {
  ctx.fillStyle = getBackgroundColor(game.score);
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);

  if (game.starsInitialised) {
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * starPaintAlpha();
    ctx.fillStyle = GAME_CONFIG.STAR_COLOR;
    game.stars.forEach(s => ctx.fillRect(s.x, s.y, GAME_CONFIG.STAR_SIZE, GAME_CONFIG.STAR_SIZE));
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
  game.clouds.forEach(c => {
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
      x:      i * slot + game.rng() * (slot - GAME_CONFIG.HILL_MIN_WIDTH),
      width:  GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE,
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
      hillLayout = game.hills.map(h => ({ x: h.x, width: h.width, height: h.height }));
    }
    hills = hillLayout;
  }
  for (const hill of hills) {
    hill.x -= game.currentSpeed * GAME_CONFIG.HILL_PARALLAX;
    if (hill.x + hill.width < 0) {
      hill.x = GAME_CONFIG.CANVAS_W + game.rng() * cfg('HILL_RESPAWN_X_RANGE');
      hill.width = GAME_CONFIG.HILL_MIN_WIDTH + game.rng() * GAME_CONFIG.HILL_WIDTH_RANGE;
      hill.height = GAME_CONFIG.HILL_MIN_HEIGHT + game.rng() * GAME_CONFIG.HILL_HEIGHT_RANGE;
    }
  }
}

function hillNightHex() {
  const tuned = hexChannels(cfg('HILL_COLOR_NIGHT'))
    || hexChannels(GAME_CONFIG.HILL_COLOR_NIGHT);
  return '#' + tuned.map(v => v.toString(16).padStart(2, '0')).join('');
}

function getHillColor(score) {
  score = scoreForNightSky(score);
  if (score < GAME_CONFIG.DAY_NIGHT_START) return GAME_CONFIG.HILL_COLOR_DAY;
  if (score >= GAME_CONFIG.DAY_NIGHT_END)  return hillNightHex();
  if (reducedMotion) return GAME_CONFIG.HILL_COLOR_DAY; // snap — stays day until DAY_NIGHT_END
  const t = (score - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const parseHex = hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const day   = parseHex(GAME_CONFIG.HILL_COLOR_DAY);
  const night = parseHex(hillNightHex());
  const r = Math.round(day[0] + (night[0] - day[0]) * t);
  const g = Math.round(day[1] + (night[1] - day[1]) * t);
  const b = Math.round(day[2] + (night[2] - day[2]) * t);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
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
  const night = typeof tuned === 'number' && tuned >= 0 && tuned <= 1
    ? tuned
    : GAME_CONFIG.NIGHT_SKY_TINT_PEAK_ALPHA;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return night;
  if (reducedMotion) return day;
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
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
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  return day + (dim - day) * t;
}

function drawClouds() {
  const alpha = cloudPaintAlpha();
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * alpha;
  ctx.fillStyle = GAME_CONFIG.CLOUD_COLOR;
  try {
    game.clouds.forEach(c => {
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
  const dim = typeof tuned === 'number' && tuned >= 0 && tuned <= 1
    ? tuned
    : GAME_CONFIG.NIGHT_GROUND_ALPHA;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return dim;
  if (reducedMotion) return 1;
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
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
    ctx.drawImage(groundImage, game.groundX + groundImage.width, groundY, groundImage.width, groundImage.height);
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
  const w = Math.max(1, Math.round(h * sprite.w / sprite.h));
  const x = obstacle.x + Math.floor((obstacle.width - w) / 2);
  return { x: x, y: obstacle.y, w: w, h: h };
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
    game.obstacles.forEach(obstacle => {
      if (obstacle.render === 'double') {
        const slots = clusterSpriteSlots(obstacle);
        if (!imageReady(obstacleImage)) {
          ctx.fillStyle = '#2d7a2d';
          slots.forEach(slot => ctx.fillRect(slot.x, slot.y, slot.w, slot.h));
          return;
        }
        slots.forEach(slot => ctx.drawImage(obstacleImage, slot.x, slot.y, slot.w, slot.h));
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
      ctx.drawImage(img, dino.x, dino.y, dino.width, dino.height);
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
  const night = tunedUnitAlpha('NIGHT_DEATH_FLASH_PEAK_ALPHA', GAME_CONFIG.NIGHT_DEATH_FLASH_PEAK_ALPHA);
  if (s >= GAME_CONFIG.DAY_NIGHT_END) return night;
  if (reducedMotion) return day;
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
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

function drawIdleScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';

  ctx.fillStyle = 'white';
  ctx.font = '22px ' + font;
  ctx.fillText('REX RUN', canvas.width / 2, canvas.height / 2 - 16);

  const pulseAlpha = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(game.animFrame * 0.08));
  ctx.fillStyle = 'rgba(255, 255, 255, ' + pulseAlpha.toFixed(3) + ')';
  ctx.font = '13px ' + font;
  ctx.fillText('TAP / PRESS SPACE TO START', canvas.width / 2, canvas.height / 2 + 12);
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
      ctx.font = '14px ' + cfg('SCORE_FONT_FAMILY');
      ctx.fillText('Press Space / Tap to start', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 16);
    }
  } else {
    const step = Math.ceil(GAME_CONFIG.GRACE_FRAMES / 9);
    const count = Math.ceil(game.graceFrames / step);
    ctx.font = '48px ' + cfg('SCORE_FONT_FAMILY');
    ctx.fillText(count || 'GO!', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 16);
  }
  drawDailyPreRunLine();
}

// One shared run, at the edge of the run only. Static text — no pulse — so
// prefers-reduced-motion has nothing extra to suppress. The RUNNING loop
// never calls this overlay, and the state check keeps it off if it did.
function drawDailyPreRunLine() {
  if (game.state !== STATE.WAITING || !isDailyMode()) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.font = '12px ' + cfg('SCORE_FONT_FAMILY');
  ctx.fillText(dailyPreRunLine(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 46);
}

function drawGameOverScreen() {
  const font = cfg('SCORE_FONT_FAMILY');
  const t = Math.min(Animations.deathAnimFrame / GAME_CONFIG.DEATH_ANIM_FRAMES, 1);
  const displayScore = Math.round(t * Math.floor(game.score));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_W, GAME_CONFIG.CANVAS_H);
  ctx.textAlign = 'center';

  if (isDailyMode()) {
    if (game.isNewTodayBest) {
      // Same takeover as free-play NEW BEST. The daily number sits higher so
      // it doesn't land on the title. Static text — no pulse.
      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.font = '13px ' + font;
      ctx.fillText('📅 DAILY #' + dailyNumber(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 70);

      ctx.fillStyle = 'white';
      ctx.font = '15px ' + font;
      ctx.fillText('★  NEW TODAY BEST  ★', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 36);

      ctx.font = '42px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 4);

      if (game.previousDailyBest > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '13px ' + font;
        const improvement = displayScore - game.previousDailyBest;
        ctx.fillText('+' + improvement + ' over your previous best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 28);
      }
    } else {
      // Daily challenge death screen — THIS RUN vs TODAY BEST, no all-time comparison
      const todayBest = game.dailyBest;
      const delta = todayBest > 0 ? todayBest - displayScore : 0;

      ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
      ctx.font = '13px ' + font;
      ctx.fillText('📅 DAILY #' + dailyNumber(), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 48);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('THIS RUN', GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 + 14);

      if (todayBest > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '16px ' + font;
        ctx.fillText(delta > 0 ? '← +' + delta + ' →' : '← best →', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '11px ' + font;
        ctx.fillText('today best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px ' + font;
        ctx.fillText('TODAY BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
        ctx.fillStyle = 'white';
        ctx.font = '28px ' + font;
        ctx.fillText(String(todayBest).padStart(5, '0'), GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 + 14);
      }
    }

    // Show or hide the DOM share button based on animation completion.
    // The hint lands with the button, after the count-up, so the social
    // nudge doesn't compete with the score.
    const shareBtnEl = document.getElementById('share-btn');
    if (shareBtnEl && shareBtnEl.style) {
      shareBtnEl.style.display = t >= 1 ? 'block' : 'none';
      if (t >= 1) {
        const flashing = Animations.copyFlashFrames > 0;
        shareBtnEl.textContent = flashing ? '✓ Copied!' : '📋 Copy result';
        markShareCopied(shareBtnEl, flashing, false);
      }
    }
    if (t >= 1) drawDailyDeathHint();
  } else {
    if (game.isNewBest) {
      // New record — celebration takeover
      ctx.fillStyle = 'white';
      ctx.font = '15px ' + font;
      ctx.fillText('★  NEW BEST  ★', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 36);

      ctx.font = '42px ' + font;
      ctx.fillText(String(displayScore).padStart(5, '0'), GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 4);

      if (game.previousHighScore > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '13px ' + font;
        const improvement = displayScore - game.previousHighScore;
        ctx.fillText('+' + improvement + ' over your previous best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 28);
      }
    } else {
      // Normal death — side-by-side comparison
      const delta    = game.highScore - Math.floor(game.score);
      const scoreStr = String(displayScore).padStart(5, '0');
      const bestStr  = String(game.highScore).padStart(5, '0');

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('THIS RUN',  GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(scoreStr,   GAME_CONFIG.CANVAS_W * 0.2, GAME_CONFIG.CANVAS_H / 2 + 14);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px ' + font;
      ctx.fillText('← ' + delta + ' →', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 - 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '11px ' + font;
      ctx.fillText('from best', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H / 2 + 10);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px ' + font;
      ctx.fillText('YOUR BEST', GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 - 14);
      ctx.fillStyle = 'white';
      ctx.font = '28px ' + font;
      ctx.fillText(bestStr,    GAME_CONFIG.CANVAS_W * 0.8, GAME_CONFIG.CANVAS_H / 2 + 14);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '13px ' + font;
    ctx.fillText('Tap / Press Space to Restart', GAME_CONFIG.CANVAS_W / 2, GAME_CONFIG.CANVAS_H - 16);
  }
  drawDebugHud();
}

// One shared run, on the death screen only. Self-gated so a WAITING or
// RUNNING frame cannot paint it, and Classic/Updated never reach this call.
// No frame-driven alpha — prefers-reduced-motion has nothing to suppress.
function drawDailyDeathHint() {
  if (!isDailyMode()) return;
  if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '12px ' + cfg('SCORE_FONT_FAMILY');
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
  let frames = typeof tuned === 'number' && tuned >= 1 && tuned <= GAME_CONFIG.MILESTONE_FRAMES
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
  // counts down.
  const holdCoversWord = isUpdatedMode() && game.qaLevelHold > 0;
  const paint = milestoneLabelForFrame(Animations.milestoneFrames);
  if (paint && !holdCoversWord) paintMilestoneLabel(paint);
  Animations.milestoneFrames--;
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
  let frames = typeof tuned === 'number' && tuned >= 1 && tuned <= GAME_CONFIG.NEW_BEST_FRAMES
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
  // on those frames so the two golds do not stack. The countdown still runs.
  const holdCovers = isUpdatedMode() && game.qaNewBestHold > 0;
  if (!holdCovers) paintNewBestBadge(newBestBadgePaint(Animations.newBestFrames));
  Animations.newBestFrames--;
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

function isDailyMode()   { return game.mode === MODES.DAILY; }
function isUpdatedMode() { return game.mode === MODES.UPDATED || game.mode === MODES.DAILY; }

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
  const nightChannels = hexChannels(cfg('NIGHT_LAND_DUST_COLOR'))
    || hexChannels(GAME_CONFIG.NIGHT_LAND_DUST_COLOR);
  const s = scoreForNightSky(game.score);
  if (s < GAME_CONFIG.DAY_NIGHT_START) return dayColor;
  if (s >= GAME_CONFIG.DAY_NIGHT_END) {
    return '#' + nightChannels.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  if (reducedMotion) return dayColor;
  const dayChannels = hexChannels(dayColor);
  if (!dayChannels) return dayColor;
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
  const mixed = dayChannels.map((c, i) => Math.round(c + (nightChannels[i] - c) * t));
  return '#' + mixed.map(v => v.toString(16).padStart(2, '0')).join('');
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
  const t = (s - GAME_CONFIG.DAY_NIGHT_START) /
            (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
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
    jump:      { count:  3, color: '#9c8770', size: 3, life:  8, alpha: 0.5, vyMin: -1.2, vyMax: -0.4, vxSpread: 0.6, gravity: 0.10 },
    // Landing whisper. The old burst was 9 motes living 14 frames and flung
    // ±2.5px, about 39px toward the next cactus. 5 motes is still more than
    // a takeoff, so the contact reads, but life 8 and vxSpread 0.7 hold it
    // inside 10px of the foot. The rise is -0.9..-0.4 with gravity 0.12,
    // about 4px up, flatter than the takeoff. Peak alpha 0.4 is softer than
    // the takeoff so the extra motes do not stack into a cloud. Same brown,
    // same night recolor, and the same night peak, count, and life once
    // the sky is fully night. Same reduced-motion damping. Classic never
    // emits.
    land:      { count:  5, color: '#9c8770', size: 3, life:  8, alpha: 0.4, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.7, gravity: 0.12 },
    // Late-run heel whisper in Updated and Daily. One grey mote per frame
    // once speed is near the plateau, at the heel, off the obstacle lane.
    // The old mote was rgba alpha 0.55 for 10 frames and drifted ±0.4px,
    // so about ten specks stacked into a smear on the ground line where
    // cacti arrive. Alpha 0.28 is about half that ink. Life 6 lets the
    // stack die at the heel. vxSpread 0.2 keeps a full life inside 2px.
    // Size stays 2 so the speck is still visible on the night sky. The
    // grey stays 150,150,150. Reduced motion still applies REDUCED_FACTOR
    // and half life. Classic never emits.
    trail:     { count:  1, color: 'rgba(150,150,150,0.28)', size: 2, life:  6, vyMin: -0.1, vyMax:  0.1, vxSpread: 0.2, gravity: 0    },
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
    collision: { count:  5, color: '#d04a2a',                size: 3, life:  8, vyMin: -1.2, vyMax:  0.4, vxSpread: 0.7, gravity: 0.10 },
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
    confetti:  { count:  6, color: '#ffd700', size: 3, life: 12, alpha: 0.7, vyMin: -1.6, vyMax: -0.5, vxSpread: 0.7, gravity: 0.10 },
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
    plateau:   { count:  4, color: '#c5d4e4', size: 2, life: 12, alpha: 0.45, vyMin: -0.9, vyMax: -0.4, vxSpread: 0.3, gravity: 0.06 },
    // QA/debug only — not for players. Dark so it reads on the white day
    // sky, and slow so a 40-frame life stays at the heel instead of walking
    // the old ±1.4 spread up the lane. Production keeps `plateau`. The
    // ?qaPlateau=1 paint is the hold, not this emit: a full pool or the
    // short night life cannot hide the cluster.
    plateauQa: { count:  4, color: '#3d4f63', size: 2, life: 40, vyMin: -0.2, vyMax: -0.08, vxSpread: 0.08, gravity: 0.002 },
  });
  const REDUCED_FACTOR = 0.25;
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0, color: '', gravity: 0, alpha: 1 });
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
        p.alpha = foot ? landDustAlpha(kind) : (typeof config.alpha === 'number' ? config.alpha : 1);
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
const FEATURES = Object.freeze([
  { id: 'hills',     layer: 'background', update: updateHills,     draw: drawHills     },
  { id: 'clouds',    layer: 'background', update: updateClouds,    draw: drawClouds    },
  { id: 'particles', layer: 'foreground', update: Particles.update, draw: Particles.draw },
  { id: 'skyTint',   layer: 'overlay',    update: null,            draw: drawSkyTint   },
]);

function runFeatureUpdates() {
  for (const f of FEATURES) if (f.update) f.update();
}

function runFeatureDraws(layer) {
  for (const f of FEATURES) if (f.draw && f.layer === layer) f.draw();
}

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
  const dx = GAME_CONFIG.DINO_PAD_X,  dyt = GAME_CONFIG.DINO_PAD_Y_TOP,
        dyb = GAME_CONFIG.DINO_PAD_Y_BOT;
  const ox = GAME_CONFIG.OBS_PAD_X,   oy = GAME_CONFIG.OBS_PAD_Y;

  const dl = dino.x + dx,        dr = dino.x + dino.width - dx;
  const dt = dino.y + dyt,       db = dino.y + dino.height - dyb;
  const ol = obstacle.x + ox,    or_ = obstacle.x + obstacle.width - ox;
  const ot = obstacle.y + oy,    ob = obstacle.y + obstacle.height;

  return dl < or_ && dr > ol && dt < ob && db > ot;
}

function computeRunResult(finalScore, currentHighScore) {
  const isNewBest = finalScore > currentHighScore || currentHighScore === 0;
  const previousHighScore = currentHighScore;
  const delta = isNewBest
    ? finalScore - previousHighScore
    : currentHighScore - finalScore;
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

// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.IDLE) {
    game.state       = STATE.WAITING;
    game.graceFrames = GAME_CONFIG.GRACE_FRAMES;
  } else if (game.state === STATE.WAITING) {
    // First visit of the session keeps the full countdown. After a death,
    // Space/Tap (and the other action keys) skip it. Stay on the current
    // loop — restarting gameLoop here would double the frame rate.
    if (!game.countdownSkippable) return;
    game.graceFrames = 0;
    game.state = STATE.RUNNING;
    announce('Go!');
  } else if (game.state === STATE.RUNNING) {
    jump();
  } else if (game.state === STATE.DEAD) {
    if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) {
      Animations.deathAnimFrame = GAME_CONFIG.DEATH_ANIM_FRAMES;
      drawGameOverScreen();
    } else {
      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      gameLoop();
    }
  }
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    handleAction();
  } else {
    handleDebugKey(event);
  }
});

canvas.addEventListener('click', handleAction);

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  handleAction();
}, { passive: false });

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    handleAction();
  }, { passive: false });
  jumpBtn.addEventListener('click', handleAction);
}

// Segmented toggle: two buttons, both always visible, exactly one pressed.
const modeToggle = document.getElementById('mode-toggle');
function refreshModeToggle() {
  if (!modeToggle || !modeToggle.querySelectorAll) return;
  const buttons = modeToggle.querySelectorAll('button');
  buttons.forEach(btn => {
    const pressed = btn.dataset && btn.dataset.mode === game.mode;
    btn.setAttribute('aria-pressed', String(pressed));
  });
}
if (modeToggle && modeToggle.addEventListener) {
  // stopPropagation + a touchstart shadow stops the synthesised click from
  // also firing the canvas's jump handler when the buttons sit over it.
  const onModeTap = (event) => {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.mode) return;
    event.stopPropagation();
    if (target.dataset.mode === game.mode) return; // already in that mode
    setMode(target.dataset.mode);
    announce(game.mode === MODES.CLASSIC ? 'Classic mode' : 'Updated mode');
  };
  modeToggle.addEventListener('click', onModeTap);
  modeToggle.addEventListener('touchstart', (event) => {
    if (event.target && event.target.dataset && event.target.dataset.mode) {
      event.preventDefault();
      event.stopPropagation();
      onModeTap(event);
    }
  }, { passive: false });
  refreshModeToggle();
}

// Mute button — single icon-button toggle (icons are universally legible).
const muteBtn = document.getElementById('mute-btn');
function refreshMuteButton() {
  if (!muteBtn || !muteBtn.setAttribute) return;
  muteBtn.textContent = audio.muted ? '🔇' : '🔊'; // 🔇 / 🔊
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
}
if (muteBtn && muteBtn.addEventListener) {
  const onMuteTap = (event) => {
    if (event) event.stopPropagation();
    audio.ensure(); // also unlocks (and resumes) AudioContext if not yet
    audio.setMuted(!audio.muted);
    refreshMuteButton();
    announce(audio.muted ? 'Sound muted' : 'Sound on');
  };
  muteBtn.addEventListener('click', onMuteTap);
  muteBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMuteTap(event);
  }, { passive: false });
  refreshMuteButton();
}

// Daily Share result confirmation. Half of the old 90-frame flash.
// Read through cfg(); a tune outside 1..90 frames falls back.
function copyFlashDuration() {
  const tuned = cfg('COPY_FLASH_FRAMES');
  const fallback = GAME_CONFIG.COPY_FLASH_FRAMES;
  if (typeof tuned === 'number' && tuned >= 1 && tuned <= 90) return Math.round(tuned);
  return fallback;
}

function markShareCopied(btn, copied, damped) {
  if (!btn || !btn.classList) return;
  if (copied) btn.classList.add('is-copied');
  else btn.classList.remove('is-copied');
  if (copied && damped) btn.classList.add('is-qa-damped');
  else btn.classList.remove('is-qa-damped');
}

// Share button — shown on death screen during daily challenge only.
const shareBtn = document.getElementById('share-btn');
if (shareBtn && shareBtn.addEventListener) {
  const onShareTap = (event) => {
    if (event) event.stopPropagation();
    // Start the flash before the clipboard call. A sync throw from
    // writeText used to abort this handler, so the label never changed.
    Animations.copyFlashFrames = copyFlashDuration();
    shareBtn.textContent = '✓ Copied!';
    markShareCopied(shareBtn, true, false);
    shareDailyResult();
  };
  shareBtn.addEventListener('click', onShareTap);
  shareBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onShareTap(event);
  }, { passive: false });
}

// Daily challenge button — activates MODES.DAILY (locks Updated behaviour)
// and hides the Classic/Updated toggle via the .daily-active class.
const dailyBtn = document.getElementById('daily-btn');
const gameWrapper = document.getElementById('game-wrapper');

function refreshDailyButton() {
  if (!dailyBtn || !dailyBtn.setAttribute) return;
  const active = isDailyMode();
  // Same UTC #N as the seed, pre-run line, and share text. The calendar
  // emoji stays so the control is still the Daily button before you tap.
  const number = '#' + dailyNumber();
  dailyBtn.setAttribute('aria-pressed', String(active));
  dailyBtn.setAttribute(
    'aria-label',
    (active ? 'Leave daily challenge ' : 'Daily challenge ') + number
  );
  dailyBtn.textContent = '📅 ' + number;
  if (gameWrapper && gameWrapper.classList) {
    if (active) gameWrapper.classList.add('daily-active');
    else gameWrapper.classList.remove('daily-active');
  }
}

if (dailyBtn && dailyBtn.addEventListener) {
  const onDailyTap = (event) => {
    if (event) event.stopPropagation();
    const entering = !isDailyMode();
    if (entering) {
      game.mode = MODES.DAILY;
    } else {
      game.mode = MODES.UPDATED;
      localStorage.setItem('dino-mode', MODES.UPDATED);
    }
    refreshDailyButton();
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    gameLoop();
    announce(entering
      ? `Daily challenge #${dailyNumber()}. ${dailyPreRunLine()}.`
      : 'Updated mode');
  };
  dailyBtn.addEventListener('click', onDailyTap);
  dailyBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onDailyTap(event);
  }, { passive: false });
  refreshDailyButton();
}

// Resume the AudioContext when the tab becomes visible again. Browsers
// suspend the ctx when the page is hidden; without this, audio dies silently
// on tab-switch even though no error is thrown.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audio.ctx
        && audio.ctx.state === 'suspended'
        && typeof audio.ctx.resume === 'function') {
      audio.ctx.resume().catch(() => {});
    }
  });
}

// == SECTION 8: GAME LOOP ==

function resetGame() {
  const restartAfterDeath = game.state === STATE.DEAD;
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  dino.velocityY = 0;
  dino.isJumping = false;

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
  if (restartAfterDeath) game.countdownSkippable = true;
  game.starsInitialised = false;
  game.starFadeFrames = 0;
  Animations.reset();
  game.newBestShown      = false;
  game.plateauCueShown   = false;
  game.qaClusterShown    = false;
  game.qaBigShown        = false;
  game.qaLevelShown      = false;
  game.qaLevelHold       = 0;
  game.qaConfettiShown   = false;
  game.qaConfettiHold    = 0;
  game.qaDustShown       = false;
  game.qaDustHold        = 0;
  game.qaCollisionShown  = false;
  game.qaCollisionHold   = 0;
  game.qaPlateauHold     = 0;
  game.qaFlashShown      = false;
  game.qaFlashHold       = 0;
  game.qaScorePopShown   = false;
  game.qaScorePopHold    = 0;
  game.qaShakeShown      = false;
  game.qaShakeHold       = 0;
  game.qaNewBestShown    = false;
  game.qaNewBestHold     = 0;
  game.qaCopyShown       = false;
  game.qaCopyHold        = 0;
  // QA/debug only. Re-read so a mode toggle still honors the page query.
  qaPlateau = readQaPlateauFlag();
  qaCluster = readQaClusterFlag();
  qaBig = readQaBigFlag();
  qaNight = readQaNightFlag();
  qaLevel = readQaLevelFlag();
  qaTrail = readQaTrailFlag();
  qaConfetti = readQaConfettiFlag();
  qaDust = readQaDustFlag();
  qaCollision = readQaCollisionFlag();
  qaFlash = readQaFlashFlag();
  qaScorePop = readQaScorePopFlag();
  qaShake = readQaShakeFlag();
  qaNewBest = readQaNewBestFlag();
  qaCopy = readQaCopyFlag();
  game.isNewBest         = false;
  game.previousHighScore = 0;
  game.isNewTodayBest    = false;
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
  game.nextSpawnGap = computeNextSpawnGap(game.rng, DifficultyProfile.speedAtScore(game.score), game.mode);
  initClouds();
  initHills();
  const ready = game.countdownSkippable
    ? 'Get ready. Press space or tap to start.'
    : 'Get ready.';
  announce(isDailyMode() ? ready + ' ' + dailyPreRunLine() + '.' : ready);
  if (document.body) document.body.style.background = '';
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

function deathShakeFreq() {
  if (!isUpdatedMode()) return cfg('DEATH_SHAKE_FREQ');
  const tuned = cfg('UPDATED_DEATH_SHAKE_FREQ');
  if (typeof tuned === 'number' && tuned >= 0 && tuned <= GAME_CONFIG.DEATH_SHAKE_FREQ) {
    return tuned;
  }
  return GAME_CONFIG.UPDATED_DEATH_SHAKE_FREQ;
}

function handleDead() {
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
    Particles.update();
    if (Animations.deathFlashFrames > 0) Animations.deathFlashFrames--;
    if (Animations.scorePopFrames > 0) Animations.scorePopFrames--;
    Animations.deathShakeFrames--;
  } else if (Animations.deathAnimFrame < GAME_CONFIG.DEATH_ANIM_FRAMES) {
    Animations.deathAnimFrame++;
    drawGameOverScreen();
  } else {
    if (Animations.copyFlashFrames > 0) Animations.copyFlashFrames--;
    drawGameOverScreen();
  }
}

function handleIdle() {
  game.animFrame++;
  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  drawHills();
  drawGround();
  updateClouds();
  drawClouds();
  drawDino();
  drawIdleScreen();
}

function handleWaiting() {
  game.graceFrames--;
  game.animFrame++;
  if (game.graceFrames <= 0) {
    game.state = STATE.RUNNING;
    announce('Go!');
  }
  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  drawHills();
  drawGround();
  updateClouds();
  drawClouds();
  drawDino();
  drawScore();
  drawGetReadyOverlay();
}

function handleRunning() {
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
    Particles.emit('confetti', GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30, GAME_CONFIG.SCORE_Y);
  } else if (qaLevel && isUpdatedMode() && !game.qaLevelShown) {
    // QA/debug only. Same wash as the first real level, once, while the
    // score is still near zero. The hold keeps the quiet word up after
    // that fade. Does not touch speed, gaps, or game.rng().
    game.qaLevelShown = true;
    game.milestoneText = 'LEVEL 2';
    Animations.milestoneFrames = GAME_CONFIG.MILESTONE_FRAMES;
    audio.milestone();
    Particles.emit('confetti', GAME_CONFIG.CANVAS_W - GAME_CONFIG.SCORE_X_OFFSET + 30, GAME_CONFIG.SCORE_Y);
    game.qaLevelHold = qaLevelHoldFrames();
    latchedQaLevel = true;
  }
  if (!latchedQaLevel && game.qaLevelHold > 0) game.qaLevelHold--;

  // QA/debug only — not for players. Latch a hold on the first Updated
  // or Daily running frame. The paint is drawQaConfetti(), from this
  // counter, not from a particle emit. A normal visit waits for the real
  // level and keeps the small #ffd700 kind. Classic never enters.
  // Does not change speed, gaps, scoring, or game.rng(). Reduced motion
  // latches the shorter hold.
  if (qaConfetti && isUpdatedMode() && !game.qaConfettiShown) {
    game.qaConfettiShown = true;
    game.qaConfettiHold = qaConfettiHoldFrames();
  } else if (game.qaConfettiHold > 0) {
    game.qaConfettiHold--;
  }

  // Scroll ground.
  game.groundX -= game.currentSpeed;
  if (imageReady(groundImage) && game.groundX <= -groundImage.width) game.groundX = 0;

  // Lazy-init stars once when night is full. Skipped under reduce-motion
  // (no init, same as before). Opacity then ramps across STAR_FADE_FRAMES
  // so the field eases in instead of popping on. Updated and Daily hold
  // the quieter peak; Classic holds full white. Positions stay Math.random()
  // — cosmetic, and this block does not touch game.rng().
  if (!reducedMotion && scoreForNightSky(game.score) >= GAME_CONFIG.DAY_NIGHT_END && !game.starsInitialised) {
    for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
      game.stars.push({ x: Math.random() * GAME_CONFIG.CANVAS_W, y: Math.random() * GAME_CONFIG.STAR_Y_RANGE });
    }
    game.starsInitialised = true;
    game.starFadeFrames = 0;
  }
  if (game.starsInitialised && game.starFadeFrames < cfg('STAR_FADE_FRAMES')) {
    game.starFadeFrames++;
  }

  drawBackground();
  if (document.body) document.body.style.background = getBackgroundColor(game.score);
  runFeatureUpdates();              // updateHills, updateClouds, Particles.update
  runFeatureDraws('background');    // drawHills, drawClouds
  drawGround();
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
  const plateauReached = qaPlateau
    ? game.score >= QA_PLATEAU_SCORE
    : game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.PLATEAU_REACH_RATIO;
  if (isUpdatedMode() && !game.plateauCueShown && plateauReached) {
    game.plateauCueShown = true;
    if (qaPlateau) {
      game.qaPlateauHold = qaPlateauHoldFrames();
      if (qaNight) {
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
  const trailOn = qaTrail
    || game.currentSpeed >= GAME_CONFIG.PLATEAU_SPEED * GAME_CONFIG.TRAIL_SPEED_RATIO;
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

  drawObstacles();
  runFeatureDraws('foreground');    // Particles.draw

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
      game.isNewBest         = runResult.isNewBest;
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
      announce(isDailyMode()
        ? 'Game over. Score ' + finalScore + '. ' + todayLine + game.dailyBest + '. ' + DAILY_DEATH_HINT + '. Press space to restart.'
        : 'Game over. Score ' + finalScore + '. High score ' + game.highScore + '. Press space to restart.');
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

  drawDino();
  drawScore();
  runFeatureDraws('overlay');       // drawSkyTint
  drawMilestoneFlash();
  drawNewBestBadge();
}

const STATE_HANDLERS = {
  [STATE.IDLE]:    handleIdle,
  [STATE.WAITING]: handleWaiting,
  [STATE.RUNNING]: handleRunning,
  [STATE.DEAD]:    handleDead,
};

function gameLoop() {
  game.animationFrameId = requestAnimationFrame(gameLoop);
  advanceQaDust();
  advanceQaCollision();
  advanceQaFlash();
  advanceQaScorePop();
  advanceQaNewBest();
  advanceQaCopy();
  advanceQaShake();
  const shakeHeld = beginQaShake();
  STATE_HANDLERS[game.state]();
  endQaShake(shakeHeld);
  // After the handler so a collision return, the score, and the death
  // card cannot cover the debug block. No-op unless the hold is running.
  // The flash sits above the earlier marks. The LEVEL hold sits above that
  // blink so the word stays readable. The NEW BEST hold is painted last,
  // above the score pop, so a swollen score cannot cover the corner badge.
  drawQaConfetti();
  drawQaDust();
  drawQaCollision();
  drawQaPlateau();
  drawQaFlash();
  drawQaLevelLabel();
  drawQaScorePop();
  drawQaNewBest();
  applyQaCopyButton();
}

// == SECTION 9: INITIALISATION ==
// Game starts automatically once all assets fire onImageLoad / onImageError,
// or after ASSET_LOAD_TIMEOUT_MS as a safety net.

// == SECTION 10: TEST EXPOSURE (Node only) ==
// Tests run script.js under Node and reference game state via the `game` object
// and functions via their module-level names. Browsers skip this block entirely.
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  global.GAME_CONFIG = GAME_CONFIG;
  global.STATE = STATE;
  global.game = game;
  global.Animations = Animations;
  global.canvas = canvas;
  global.ctx = ctx;
  global.dino = dino;
  global.getBackgroundColor = getBackgroundColor;
  global.getHillColor = getHillColor;
  global.drawBackground = drawBackground;
  global.starFadeAlpha = starFadeAlpha;
  global.starPaintAlpha = starPaintAlpha;
  global.initClouds = initClouds;
  global.updateClouds = updateClouds;
  global.drawClouds = drawClouds;
  global.drawGround = drawGround;
  global.spawnObstacle = spawnObstacle;
  global.updateObstacles = updateObstacles;
  global.drawObstacles = drawObstacles;
  global.drawScore = drawScore;
  global.drawDino = drawDino;
  global.checkCollision = checkCollision;
  global.jump = jump;
  global.resetGame = resetGame;
  global.gameLoop = gameLoop;
  global.STATE_HANDLERS = STATE_HANDLERS;
  global.drawGameOverScreen = drawGameOverScreen;
  global.computeRunResult = computeRunResult;
  global.drawIdleScreen = drawIdleScreen;
  global.drawGetReadyOverlay = drawGetReadyOverlay;
  global.handleAction   = handleAction;
  global.initCanvasScale = initCanvasScale;
  global.handleResize   = handleResize;
  global.mulberry32 = mulberry32;
  global.MODES = MODES;
  global.setMode = setMode;
  global.loadMode = loadMode;
  global.Particles = Particles;
  global.audio = audio;
  global.drawDeathFlash = drawDeathFlash;
  global.deathFlashPeakAlpha = deathFlashPeakAlpha;
  global.drawMilestoneFlash = drawMilestoneFlash;
  global.drawNewBestBadge = drawNewBestBadge;
  global.initHills = initHills;
  global.updateHills = updateHills;
  global.drawHills = drawHills;
  global.drawSkyTint = drawSkyTint;
  global.skyTintPeakAlpha = skyTintPeakAlpha;
  global.FEATURES = FEATURES;
  global.runFeatureUpdates = runFeatureUpdates;
  global.runFeatureDraws = runFeatureDraws;
  global.cfg = cfg;
  global.loadTuning = loadTuning;
  global.saveTuning = saveTuning;
  global.DifficultyProfile = DifficultyProfile;
  global.announce = announce;
  global.a11yLive = a11yLive;
  global.dailySeed = dailySeed;
  global.dailyNumber = dailyNumber;
  global.refreshDailyButton = refreshDailyButton;
  global.ScoreStore = ScoreStore;
  global.isDailyMode = isDailyMode;
  global.shareDailyResult = shareDailyResult;
  global.setReducedMotion = setReducedMotion;
  global.enableDeathLog = enableDeathLog;
  global.disableDeathLog = disableDeathLog;
  global.isDeathLogEnabled = isDeathLogEnabled;
  global.applyDebugFromLocation = applyDebugFromLocation;
  global.replayRunSeed = replayRunSeed;
  global.dumpRun = dumpRun;
  global.copyDeathLog = copyDeathLog;
  global.handleDebugKey = handleDebugKey;
  global.setQaPlateau = setQaPlateau;
  global.readQaPlateauFlag = readQaPlateauFlag;
  global.QA_PLATEAU_SCORE = QA_PLATEAU_SCORE;
  global.QA_PLATEAU_HOLD = QA_PLATEAU_HOLD;
  global.QA_PLATEAU_SIZE = QA_PLATEAU_SIZE;
  global.QA_PLATEAU_RIM = QA_PLATEAU_RIM;
  global.qaPlateauMarks = qaPlateauMarks;
  global.qaPlateauHoldFrames = qaPlateauHoldFrames;
  global.qaPlateauFill = qaPlateauFill;
  global.drawQaPlateau = drawQaPlateau;
  global.setQaCluster = setQaCluster;
  global.readQaClusterFlag = readQaClusterFlag;
  global.setQaBig = setQaBig;
  global.readQaBigFlag = readQaBigFlag;
  global.setQaNight = setQaNight;
  global.readQaNightFlag = readQaNightFlag;
  global.setQaLevel = setQaLevel;
  global.readQaLevelFlag = readQaLevelFlag;
  global.setQaTrail = setQaTrail;
  global.readQaTrailFlag = readQaTrailFlag;
  global.setQaConfetti = setQaConfetti;
  global.readQaConfettiFlag = readQaConfettiFlag;
  global.QA_CONFETTI_HOLD = QA_CONFETTI_HOLD;
  global.QA_CONFETTI_BLOCK_W = QA_CONFETTI_BLOCK_W;
  global.QA_CONFETTI_BLOCK_H = QA_CONFETTI_BLOCK_H;
  global.QA_CONFETTI_COLOR = QA_CONFETTI_COLOR;
  global.QA_CONFETTI_RIM = QA_CONFETTI_RIM;
  global.qaConfettiRect = qaConfettiRect;
  global.qaConfettiHoldFrames = qaConfettiHoldFrames;
  global.qaConfettiPaintAlpha = qaConfettiPaintAlpha;
  global.drawQaConfetti = drawQaConfetti;
  global.setQaDust = setQaDust;
  global.readQaDustFlag = readQaDustFlag;
  global.QA_DUST_HOLD = QA_DUST_HOLD;
  global.QA_DUST_SIZE = QA_DUST_SIZE;
  global.QA_DUST_RIM = QA_DUST_RIM;
  global.qaDustMarks = qaDustMarks;
  global.drawQaDust = drawQaDust;
  global.setQaCollision = setQaCollision;
  global.readQaCollisionFlag = readQaCollisionFlag;
  global.QA_COLLISION_HOLD = QA_COLLISION_HOLD;
  global.QA_COLLISION_SIZE = QA_COLLISION_SIZE;
  global.QA_COLLISION_RIM = QA_COLLISION_RIM;
  global.QA_COLLISION_OFFSETS = QA_COLLISION_OFFSETS;
  global.qaCollisionMarks = qaCollisionMarks;
  global.qaCollisionHoldFrames = qaCollisionHoldFrames;
  global.qaCollisionPaintAlpha = qaCollisionPaintAlpha;
  global.drawQaCollision = drawQaCollision;
  global.setQaFlash = setQaFlash;
  global.readQaFlashFlag = readQaFlashFlag;
  global.QA_FLASH_HOLD = QA_FLASH_HOLD;
  global.qaFlashHoldFrames = qaFlashHoldFrames;
  global.qaFlashPaintAlpha = qaFlashPaintAlpha;
  global.drawQaFlash = drawQaFlash;
  global.scorePopScale = scorePopScale;
  global.setQaScorePop = setQaScorePop;
  global.readQaScorePopFlag = readQaScorePopFlag;
  global.QA_SCORE_POP_HOLD = QA_SCORE_POP_HOLD;
  global.qaScorePopHoldFrames = qaScorePopHoldFrames;
  global.qaScorePopScale = qaScorePopScale;
  global.qaScorePopCover = qaScorePopCover;
  global.drawQaScorePop = drawQaScorePop;
  global.setQaShake = setQaShake;
  global.readQaShakeFlag = readQaShakeFlag;
  global.QA_SHAKE_HOLD = QA_SHAKE_HOLD;
  global.qaShakeHoldFrames = qaShakeHoldFrames;
  global.qaShakeOffset = qaShakeOffset;
  global.updatedDeathShakeFrames = updatedDeathShakeFrames;
  global.deathShakeFrameCount = deathShakeFrameCount;
  global.scorePopWindow = scorePopWindow;
  global.setQaNewBest = setQaNewBest;
  global.readQaNewBestFlag = readQaNewBestFlag;
  global.QA_NEW_BEST_HOLD = QA_NEW_BEST_HOLD;
  global.qaNewBestHoldFrames = qaNewBestHoldFrames;
  global.qaNewBestPaintAlpha = qaNewBestPaintAlpha;
  global.drawQaNewBest = drawQaNewBest;
  global.newBestDuration = newBestDuration;
  global.copyFlashDuration = copyFlashDuration;
  global.setQaCopy = setQaCopy;
  global.readQaCopyFlag = readQaCopyFlag;
  global.QA_COPY_HOLD = QA_COPY_HOLD;
  global.qaCopyHoldFrames = qaCopyHoldFrames;
  global.obstacleNightBrightness = obstacleNightBrightness;
  global.dinoNightBrightness = dinoNightBrightness;
  global.cloudPaintAlpha = cloudPaintAlpha;
  global.groundPaintAlpha = groundPaintAlpha;
  global.landDustColor = landDustColor;
}
