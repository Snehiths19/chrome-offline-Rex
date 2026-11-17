// == SECTION 2: CONFIGURATION ==

const GAME_CONFIG = Object.freeze({
  // --- Canvas logical dimensions ---
  CANVAS_W: 600,
  CANVAS_H: 200,

  // --- Physics ---
  JUMP_POWER: -12, // negative = upward impulse applied on jump
  // Updated and Daily take off slower (M4), so a full jump peaks about 99px
  // up instead of about 150 and leaves sky for the second jump. It still
  // clears every ground obstacle but the tower, which needs the second jump.
  // Classic keeps JUMP_POWER. Gameplay value: read GAME_CONFIG directly.
  UPDATED_JUMP_POWER: -9.6,
  GRAVITY: 0.48, // added to velocityY each frame while airborne
  // A jump pressed this many sim frames (60Hz) or fewer before landing is
  // kept and fires on the landing frame, so a slightly early press at speed
  // is not dropped. Gameplay value: read GAME_CONFIG directly, never cfg().
  JUMP_BUFFER_FRAMES: 6,
  // Variable jump (F3). Letting go of jump while still rising faster than
  // JUMP_CUT_VELOCITY cuts the rise to that speed, so a quick tap is a short
  // hop and a held press is the full 49-frame jump. The cut waits until the
  // feet are JUMP_MIN_HEIGHT px up: a tap still rises about 76px over about
  // 33 frames, which clears every obstacle type at the speed it first appears
  // (the big cactus with about 8 frames to spare). Gameplay values: read
  // GAME_CONFIG directly, never cfg().
  JUMP_CUT_VELOCITY: -5,
  JUMP_MIN_HEIGHT: 50,
  // Fast fall (F3). Down, S or a swipe down in the air drops the dino: it
  // stops rising (falls at least FAST_FALL_START_VELOCITY px per frame) and
  // falls under FAST_FALL_GRAVITY (3x GRAVITY) until it lands. From the top of
  // a full jump that lands in about 13 frames instead of 25.
  FAST_FALL_START_VELOCITY: 2,
  FAST_FALL_GRAVITY: 1.44,
  // Hang time (M1, Updated and Daily only). While the dino moves slower than
  // HANG_VELOCITY px per frame, up or down, near the top of a jump, gravity is
  // scaled by HANG_GRAVITY_SCALE, so the peak floats for a moment. A held jump
  // gains about 7 frames of air (about 56 instead of 49); a fast fall skips it.
  // Classic keeps the plain arc. Gameplay values: read GAME_CONFIG directly.
  HANG_VELOCITY: 1.6,
  HANG_GRAVITY_SCALE: 0.5,
  // Second jump (M3, Updated and Daily only). A fresh press in the air sets
  // the rise to DOUBLE_JUMP_POWER once per flight. A press while falling
  // within JUMP_BUFFER_FRAMES of landing is buffered for landing as before
  // (F1), so an early press still jumps on landing. A held key's auto-repeat
  // never spends it. The sprite never rises above CEILING_Y (the top of the
  // canvas): near the top, the second jump starts slower so its arc tops out
  // at the ceiling instead of bumping it. A full first jump already peaks
  // close to the top in Classic; Updated's lower first jump (M4) leaves it
  // about 55px of sky. Gameplay values: read GAME_CONFIG directly.
  DOUBLE_JUMP_POWER: -7.5,
  CEILING_Y: 0,
  // Slide (M6, Updated and Daily only). Down, S or a swipe down on the ground
  // slides for SLIDE_FRAMES sim frames (holding Down keeps it going) with a
  // hitbox only SLIDE_HEIGHT px tall, low enough to pass under a bird. Down
  // within SLIDE_CANCEL_FRAMES of a take-off cancels the jump into a slide,
  // because a swipe down on a phone starts with the touch that jumps. A jump
  // ends a slide. Gameplay values: read GAME_CONFIG directly, never cfg().
  // Air dash (M5, Updated and Daily only). Right, D or a swipe right in the
  // air, once per flight: for DASH_FRAMES sim frames the dino holds its
  // height and the world scrolls DASH_BOOST px per frame faster, so the
  // flight covers more ground. Landing gives it back. Gameplay values: read
  // GAME_CONFIG directly, never cfg().
  DASH_FRAMES: 12,
  DASH_BOOST: 6,
  // Long cactus row (M5): as many small cacti as it takes to be wider than
  // one held jump can clear at the speed it spawns, plus ROW_MARGIN_FRAMES
  // of flight to spare, so it takes the dash or a late second jump.
  ROW_MARGIN_FRAMES: 4,
  ROW_CACTUS_GAP: 6,
  // Move combo (M7): the note for combo n is COMBO_NOTE_BASE_HZ raised n-1
  // steps of the major pentatonic scale, capped at COMBO_NOTE_MAX_STEPS. The
  // HUD shows COMBO xN from 2 up and pops for COMBO_POP_FRAMES on each step.
  // Sound and display only, never gameplay.
  COMBO_NOTE_BASE_HZ: 523.25,
  COMBO_NOTE_MAX_STEPS: 10,
  COMBO_POP_FRAMES: 12,
  SLIDE_FRAMES: 32,
  SLIDE_HEIGHT: 24,
  SLIDE_CANCEL_FRAMES: 8,
  INITIAL_SPEED: 3.0, // obstacle scroll speed at score 0
  SPEED_CAP: 13.0, // max scroll speed (matches Chrome T-Rex)
  PLATEAU_SPEED: 8.0, // sigmoid ceiling — focusable-but-demanding speed the curve approaches
  RAMP_MIDPOINT: 300, // score where acceleration is steepest (day/night transition)
  RAMP_STEEPNESS: 0.01, // sigmoid slope — controls how quickly speed rises through the midpoint
  SCORE_PER_LEVEL: 100, // score points per level — used for milestone flash effects only
  SCORE_INCREMENT: 0.1, // score added per sim frame (60Hz), not per display refresh

  // --- Hitbox forgiveness (rendering uses full sprite; collision uses shrunken box) ---
  DINO_PAD_X: 8,
  DINO_PAD_Y_TOP: 8,
  DINO_PAD_Y_BOT: 2,
  OBS_PAD_X: 3,
  OBS_PAD_Y: 2,

  // --- Spawning ---
  GRACE_FRAMES: 240, // ~4 s at 60 fps before first obstacle appears
  RESUME_COUNTDOWN_FRAMES: 180, // 3 s "3 2 1" after returning to a paused run
  MAX_SPAWN_GAP: 600, // gap (px) between obstacles at INITIAL_SPEED
  MIN_SPAWN_GAP: 340, // classic floor (px). Updated/Daily never go below this either.
  SPAWN_GAP_SPEED_FACTOR: 50, // classic gap shrinks by this much per +1 speed above INITIAL_SPEED
  SPAWN_GAP_JITTER: 0.3, // ±30% in Updated/Daily; classic skips jitter
  // Worst-case frames between Updated/Daily obstacles once the shrinking curve
  // would leave less than one focused jump. A jump is 49 frames at the current
  // JUMP_POWER/GRAVITY; 72 also covers a cluster's width plus a short read.
  // The base gap sits at this / (1 - JITTER), so ±30% rarely piles onto the floor.
  // Re-checked for F3: a short hop (about 33 frames) or a fast fall only lands
  // sooner than the 49-frame held jump, so 72 frames is still enough.
  // Re-checked for M1: hang time makes the Updated held jump about 56 frames,
  // still well inside 72. M4's lower take-off makes it about 46. A second
  // jump stretches a flight to about 76 frames, but it starts before the
  // obstacle it clears, so the player still has the ground before the next
  // one (the golden runs second-jump every tower and survive).
  UPDATED_MIN_GAP_FRAMES: 72,

  // Gaps in the ground (G1, Updated and Daily). A gap is as wide as the
  // ground the world scrolls in PIT_GAP_FRAMES sim frames at the speed it
  // spawns, plus the dino's foot span, so the feet are over open air for
  // PIT_GAP_FRAMES: about half a short hop, clear with any jump timed near
  // its edge. Feet that drop PIT_FALL_DEPTH px below the ground line inside
  // a gap, or meet its far wall, end the run. Gameplay values: read
  // GAME_CONFIG directly, never cfg().
  PIT_GAP_FRAMES: 16,
  PIT_FALL_DEPTH: 10,

  // --- Obstacle sprite (small cactus — baseline) ---
  OBS_WIDTH: 20,
  OBS_HEIGHT: 40,

  // --- Obstacle types ---
  // Each type unlocks at a score threshold and contributes its `weight` to the
  // weighted random pick once unlocked. `render` controls how drawObstacles()
  // paints it from the single cactus sprite.
  OBSTACLE_TYPES: Object.freeze([
    Object.freeze({
      id: 'small',
      width: 20,
      height: 40,
      unlockScore: 0,
      weight: 50,
      render: 'single',
    }),
    Object.freeze({
      id: 'big',
      width: 30,
      height: 55,
      unlockScore: 100,
      weight: 30,
      render: 'single',
    }),
    // Low bird (M6, Updated and Daily; Classic only ever rolls small). Flies
    // with its underside `lift` px above the ground: too low to run under
    // standing, high enough to slide under, low enough to jump over.
    Object.freeze({
      id: 'bird',
      width: 36,
      height: 18,
      lift: 30,
      unlockScore: 150,
      weight: 22,
      render: 'bird',
    }),
    // Cactus tower (M4, Updated and Daily): two big cacti stacked, taller than
    // a full first jump reaches, so it takes the second jump to clear.
    Object.freeze({
      id: 'tower',
      width: 30,
      height: 110,
      unlockScore: 200,
      weight: 14,
      render: 'stack',
    }),
    // Long cactus row (M5, Updated and Daily): `width` is the narrowest row;
    // spawnObstacle widens it with speed (see rowWidthForSpeed).
    Object.freeze({
      id: 'row',
      width: 98,
      height: 40,
      unlockScore: 300,
      weight: 12,
      render: 'row',
    }),
    // Gap in the ground (G1, Updated and Daily): no hitbox, the dino falls in
    // when its feet are wholly over it. `width` is the narrowest gap;
    // spawnObstacle widens it with speed (see pitWidthForSpeed). `terrain`
    // keeps it out of the box collision; the landing code handles it.
    Object.freeze({
      id: 'pit',
      width: 60,
      height: 0,
      unlockScore: 120,
      weight: 16,
      render: 'pit',
      terrain: true,
    }),
    Object.freeze({
      id: 'cluster',
      width: 50,
      height: 40,
      unlockScore: 250,
      weight: 20,
      render: 'double',
    }),
  ]),

  // --- Dino sprite ---
  DINO_X: 50,
  DINO_WIDTH: 40,
  DINO_HEIGHT: 50,

  // --- Clouds ---
  CLOUD_COUNT: 3,
  CLOUD_MIN_Y: 10,
  CLOUD_Y_RANGE: 40,
  CLOUD_MIN_SPEED: 0.3,
  CLOUD_SPEED_RANGE: 0.3,
  CLOUD_WIDTH: 60, // used for offscreen detection
  CLOUD_RESPAWN_OFFSET: 20, // x-offset past right edge when respawning
  CLOUD_COLOR: '#e8e8e8',
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
  DAY_CLOUD_ALPHA: 0.6,
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
  NIGHT_CLOUD_ALPHA: 0.21,
  CLOUD_CIRCLES: Object.freeze([
    // three circles forming a puffy cloud shape
    Object.freeze([0, 0, 18]),
    Object.freeze([-18, 8, 14]),
    Object.freeze([18, 8, 14]),
  ]),

  // --- Day / Night ---
  DAY_NIGHT_START: 300,
  DAY_NIGHT_END: 400,
  STAR_COUNT: 12,
  STAR_SIZE: 2,
  STAR_Y_RANGE: 100,
  STAR_COLOR: '#ffffff',
  // Visual only. Running frames Classic stars take to ramp from invisible
  // to full white once night is complete (~0.8 s at 60 fps). Updated and
  // Daily use UPDATED_STAR_FADE_FRAMES. Read through cfg(). A non-positive
  // tune means show them immediately.
  STAR_FADE_FRAMES: 48,
  // Visual only. Running frames Updated and Daily stars take to ramp from
  // invisible to the night whisper once night is complete. Half of
  // STAR_FADE_FRAMES (~0.4 s at 60 fps), so the brightening ramp settles
  // sooner and does not linger over the obstacle lane. Classic keeps
  // STAR_FADE_FRAMES and full white. A tune that is not a whole number
  // from 1 through STAR_FADE_FRAMES falls back, so a typo cannot run
  // longer than Classic or go negative. Day never paints stars. Reduced
  // motion still skips star init. Playtest with ?qaNight=1. Read through
  // cfg(). Physics does not read this.
  UPDATED_STAR_FADE_FRAMES: 24,
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
  // read this. Classic keeps full white after STAR_FADE_FRAMES. Day never
  // paints stars. Reduced motion still skips star init. Playtest with
  // ?qaNight=1. Read through cfg(). Physics does not read this.
  NIGHT_STAR_ALPHA: 0.35,
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
  // Squash and stretch (M1). Visual only, Updated and Daily only, off with
  // reduced motion; the hitbox never changes. In the air the dino stretches
  // up to DINO_STRETCH_MAX taller (and half that narrower) the faster it
  // moves. Landing squashes it DINO_LAND_SQUASH shorter (DINO_SLAM_SQUASH
  // after a fast fall), easing back over DINO_SQUASH_FRAMES sim frames. The
  // sprite stays anchored at the feet. Read through cfg().
  DINO_STRETCH_MAX: 0.14,
  DINO_LAND_SQUASH: 0.2,
  DINO_SLAM_SQUASH: 0.32,
  DINO_SQUASH_FRAMES: 8,
  // Speed streaks (M2). Visual only, Updated and Daily only, off with reduced
  // motion. Faint wind lines in the sky band, behind the dino and above the
  // obstacle lane, fade in from SPEED_LINES_START_SPEED and reach
  // SPEED_LINES_ALPHA at SPEED_LINES_FULL_SPEED. Read through cfg().
  SPEED_LINES_START_SPEED: 6.5,
  SPEED_LINES_FULL_SPEED: 8,
  SPEED_LINES_ALPHA: 0.35,
  SPEED_LINES_COUNT: 6,
  // Slam kick (M2). A slam landing nudges the scene SLAM_KICK_PX down for
  // SLAM_KICK_FRAMES sim frames, easing back; the score stays put. Visual
  // only, Updated and Daily only, off with reduced motion. Read through cfg().
  SLAM_KICK_PX: 3,
  SLAM_KICK_FRAMES: 6,
  // Second-jump flip (M3). The sprite turns one full circle over
  // DOUBLE_JUMP_FLIP_FRAMES sim frames after a second jump. Visual only,
  // Updated and Daily, no turn under reduced motion. Read through cfg().
  DOUBLE_JUMP_FLIP_FRAMES: 24,
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
  NIGHT_LAND_DUST_COLOR: '#6a686e',
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
  NIGHT_JUMP_DUST_ALPHA: 0.42,
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
  NIGHT_LAND_DUST_ALPHA: 0.36,
  // Visual only. How many jump and land motes Updated/Daily emit once the
  // sky is fully night. Day stays 3 and 5. Two and three still make a
  // landing heavier than a takeoff, with fewer motes so they do not stack
  // back up to a spark on the road. Snaps at DAY_NIGHT_END, so twilight
  // keeps the day counts. Reduced motion then quarters this count, same
  // as the day burst. Classic does not read this. Read through cfg().
  // Physics does not read this.
  NIGHT_JUMP_DUST_COUNT: 2,
  NIGHT_LAND_DUST_COUNT: 3,
  // Visual only. Frames a night jump or land mote lives. Day stays 8.
  // Six is enough for the puff to read at the ankle and short enough that
  // it dies at the foot. The day spreads still apply, so a full life stays
  // inside the day reach. Snaps at DAY_NIGHT_END. Reduced motion then
  // halves it. Classic does not read this. Read through cfg(). Physics
  // does not read this.
  NIGHT_LAND_DUST_LIFE: 6,
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
  NIGHT_GROUND_ALPHA: 0.42,

  // --- Ambient depth (PR-D, updated mode only) ---
  HILL_COUNT: 3, // mid-ground silhouette mounds
  HILL_PARALLAX: 0.2, // fraction of obstacle speed at which hills scroll
  HILL_MIN_WIDTH: 120,
  HILL_WIDTH_RANGE: 80,
  HILL_MIN_HEIGHT: 40,
  HILL_HEIGHT_RANGE: 30,
  HILL_RESPAWN_X_RANGE: 50, // px of jitter past the right edge when a hill respawns
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
  HILL_COLOR_DAY: '#e1e1e1',
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
  HILL_COLOR_NIGHT: '#2d2d46',
  CLOUD_SPEED_FACTOR_UPDATED: 1.5, // multiply cloud speed in updated mode for stronger parallax
  // Visual only. Peak alpha of the gold milestone sky-flash by day, in
  // Updated and Daily. One full-canvas fill, painted after the cacti, so
  // it sits on the obstacle lane for the whole milestone. 0.12 lifted the
  // day cactus (#535353) by about 15 luminance — a gold veil over the lane.
  // 0.06 is half that peak: a gold breath. The LEVEL text and the confetti
  // still carry the level. Classic does not draw the tint. Night uses its
  // own peak and the twilight ease still steps down to it. Read through cfg().
  SKY_TINT_PEAK_ALPHA: 0.06,
  SKY_TINT_COLOR_RGB: '255, 215, 0', // gold sky-flash colour (rgb triplet, alpha applied at draw)
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
  PARTICLE_EMIT_SPREAD: 4, // px width of the cosmetic xy jitter on every particle emit

  // --- Effects ---
  DEATH_ANIM_FRAMES: 30, // frames for the Classic score count-up after shake ends
  // Visual only. Updated and Daily Game Over score count-up. Classic keeps
  // DEATH_ANIM_FRAMES (30). 18 frames is about 0.3s at 60fps, about three
  // fifths of that roll, so the board settles and the death-screen hint
  // and Copy result can appear without a long tick. Reduced motion halves
  // this Updated length (minimum 2), the way the milestone word and the
  // new-best badge do. Classic stays 30, including under reduced motion.
  // A tune outside 1..DEATH_ANIM_FRAMES, or a non-integer, falls back, so
  // a typo cannot run longer than Classic or drop the roll. Read through
  // cfg(). Physics, scoring, and daily best do not read this. Playtest
  // with ?qaCountUp=1.
  UPDATED_DEATH_ANIM_FRAMES: 18,
  DEATH_SHAKE_FRAMES: 12,
  DEATH_SHAKE_AMPLITUDE: 4,
  DEATH_SHAKE_FREQ: 1.5, // multiplier on the sin oscillation that drives the shake transform
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
  UPDATED_DEATH_SHAKE_FRAMES: 8,
  UPDATED_DEATH_SHAKE_AMPLITUDE: 1,
  UPDATED_DEATH_SHAKE_FREQ: Math.PI / 8,
  DEATH_FLASH_FRAMES: 6, // PR-C: white-flash overlay length on collision
  DEATH_VIBRATE_MS: 30, // S5: one short buzz on death (phones that support it)
  DEATH_FLASH_COLOR_RGB: '255, 255, 255', // death-flash overlay colour (rgb triplet, alpha applied at draw)
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
  SCORE_POP_FRAMES: 12, // classic-length count; Updated pop uses the shake frames
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
  SCORE_POP_PEAK_SCALE: 1.12,
  MILESTONE_FRAMES: 90,
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
  UPDATED_MILESTONE_FONT_PX: 16,
  UPDATED_MILESTONE_TEXT_FRAMES: 45,
  UPDATED_MILESTONE_PEAK_ALPHA: 0.5,
  NEW_BEST_FRAMES: 120,
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
  UPDATED_NEW_BEST_FONT_PX: 11,
  UPDATED_NEW_BEST_FRAMES: 60,
  UPDATED_NEW_BEST_PEAK_ALPHA: 0.65,
  // Visual only. Daily Share result confirmation on the Copy result
  // button. The old flash held ✓ Copied! for 90 frames (~1.5 s), long
  // enough to nag after the clipboard tap. 45 frames (~0.75 s) is half
  // of that: still long enough to read Copied, then the label returns to
  // Copy result. Classic and free-play Updated never show the button.
  // A tune outside 1..90 frames falls back, so a typo cannot linger
  // longer than the old flash or drop the word. The confirmation stays
  // this long under reduced motion so it does not flicker. Playtest with
  // ?qaCopy=1, which holds the Copied label; that hold is half as long
  // and quieter under reduced motion. ?qaShare=1 holds the same label
  // without opening the system share sheet. Read through cfg().
  COPY_FLASH_FRAMES: 45,
  // Soft ceiling for the once-per-run plateau cue. The speed curve approaches
  // PLATEAU_SPEED but never reaches it; 0.98 is about score 641. Visual only —
  // speed, gaps, and scoring still read the curve directly, not this ratio.
  PLATEAU_REACH_RATIO: 0.98,
  // Heel-trail whisper starts a little before that cue. 0.96 of plateau
  // speed is still late-run, on the night sky (about score 568). Visual
  // only — speed, gaps, and scoring do not read this ratio. ?qaTrail=1
  // emits the same whisper without waiting for it.
  TRAIL_SPEED_RATIO: 0.96,

  // --- HUD ---
  SCORE_X_OFFSET: 150, // pixels from right edge for the current-score label
  SCORE_Y: 30,
  SCORE_HI_X_OFFSET: 110, // additional px left of SCORE_X_OFFSET for the HI label
  SCORE_FONT_FAMILY: "'Courier New', Courier, monospace",

  // --- Animation ---
  RUN_FRAME_PERIOD: 10, // swap run-cycle sprite every N frames (~167 ms @ 60 fps)
  // Visual only. Updated and Daily idle invite, the line under REX RUN.
  // Classic keeps 0.3 + 0.4 × (0.5 + 0.5 × sin(frame × 0.08)), a swing
  // from 0.3 to 0.7. This breath is smaller and a little slower: base
  // 0.4 plus amplitude 0.15, so the line moves 0.4 → 0.55, at rate 0.05
  // instead of 0.08. A full breath takes about 2.1s instead of about
  // 1.3s. Reduced motion holds the midpoint (base + amplitude / 2) and
  // does not sample sin. A tune that would leave the Classic 0.3–0.7
  // band, swing wider than 0.4, or pulse faster than 0.08 falls back, so
  // a typo cannot flash harder than Classic. Read through cfg(). Physics,
  // scoring, and spawning do not read these. Playtest with ?qaIdle=1.
  UPDATED_IDLE_PULSE_BASE: 0.4,
  UPDATED_IDLE_PULSE_AMPLITUDE: 0.15,
  UPDATED_IDLE_PULSE_RATE: 0.05,

  // --- Asset loading ---
  ASSET_LOAD_TIMEOUT_MS: 5000, // force WAITING state even if assets never finish loading
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

// The keys cfg() is allowed to tune: every visual value read through cfg()
// (directly, or through a helper such as tunedUnitAlpha) and nothing else.
// The ?tune=1 panel (tune.js) lists exactly these, so it can never reach
// physics, spawning, scoring or hitboxes. A unit test checks this list
// matches what the game reads through cfg() (tests/tunable-keys.js).
const TUNABLE_KEYS = Object.freeze([
  'COPY_FLASH_FRAMES',
  'DAY_CLOUD_ALPHA',
  'DAY_DEATH_FLASH_PEAK_ALPHA',
  'DEATH_FLASH_COLOR_RGB',
  'DEATH_FLASH_FRAMES',
  'DEATH_SHAKE_AMPLITUDE',
  'DEATH_SHAKE_FREQ',
  'DINO_LAND_SQUASH',
  'DINO_SLAM_SQUASH',
  'DINO_SQUASH_FRAMES',
  'DINO_STRETCH_MAX',
  'DOUBLE_JUMP_FLIP_FRAMES',
  'HILL_COLOR_NIGHT',
  'NIGHT_CLOUD_ALPHA',
  'NIGHT_DEATH_FLASH_PEAK_ALPHA',
  'NIGHT_DINO_BRIGHTNESS',
  'NIGHT_GROUND_ALPHA',
  'NIGHT_JUMP_DUST_ALPHA',
  'NIGHT_JUMP_DUST_COUNT',
  'NIGHT_LAND_DUST_ALPHA',
  'NIGHT_LAND_DUST_COLOR',
  'NIGHT_LAND_DUST_COUNT',
  'NIGHT_LAND_DUST_LIFE',
  'NIGHT_OBSTACLE_BRIGHTNESS',
  'NIGHT_SKY_TINT_PEAK_ALPHA',
  'NIGHT_STAR_ALPHA',
  'PARTICLE_EMIT_SPREAD',
  'SCORE_FONT_FAMILY',
  'SCORE_POP_PEAK_SCALE',
  'SKY_TINT_COLOR_RGB',
  'SKY_TINT_PEAK_ALPHA',
  'SLAM_KICK_FRAMES',
  'SLAM_KICK_PX',
  'SPEED_LINES_ALPHA',
  'SPEED_LINES_COUNT',
  'SPEED_LINES_FULL_SPEED',
  'SPEED_LINES_START_SPEED',
  'STAR_FADE_FRAMES',
  'UPDATED_DEATH_ANIM_FRAMES',
  'UPDATED_DEATH_SHAKE_AMPLITUDE',
  'UPDATED_DEATH_SHAKE_FRAMES',
  'UPDATED_DEATH_SHAKE_FREQ',
  'UPDATED_IDLE_PULSE_AMPLITUDE',
  'UPDATED_IDLE_PULSE_BASE',
  'UPDATED_IDLE_PULSE_RATE',
  'UPDATED_MILESTONE_FONT_PX',
  'UPDATED_MILESTONE_PEAK_ALPHA',
  'UPDATED_MILESTONE_TEXT_FRAMES',
  'UPDATED_NEW_BEST_FONT_PX',
  'UPDATED_NEW_BEST_FRAMES',
  'UPDATED_NEW_BEST_PEAK_ALPHA',
  'UPDATED_STAR_FADE_FRAMES',
]);

// --- Safe storage (C2) ---
// Every localStorage call goes through safeStorage. Browsers that block
// storage (privacy modes, sandboxed iframes, cookies off) throw on the first
// access, and an unguarded read at module load would stop the game booting.
// A failed read returns the fallback; a failed write is ignored by storage
// but kept in an in-memory map, so values set this session (high score,
// mute, daily best) still read back for the rest of the visit.
const safeStorage = {
  _memory: {},
  get(key, fallback = null) {
    // A write that failed this session (blocked storage, full quota) wins
    // over whatever the real store still holds.
    if (Object.prototype.hasOwnProperty.call(this._memory, key)) return this._memory[key];
    try {
      const v = localStorage.getItem(key);
      return v === null || v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    const v = String(value);
    try {
      localStorage.setItem(key, v);
      delete this._memory[key];
      return true;
    } catch {
      this._memory[key] = v;
      return false;
    }
  },
  remove(key) {
    delete this._memory[key];
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage blocked — ignore */
    }
  },
};

function loadTuning() {
  window.GAME_TUNING = window.GAME_TUNING || {};
  try {
    const raw = safeStorage.get('dino-tuning');
    if (raw) Object.assign(window.GAME_TUNING, JSON.parse(raw));
  } catch {
    /* malformed JSON — keep defaults */
  }
}

function saveTuning() {
  return safeStorage.set('dino-tuning', JSON.stringify(window.GAME_TUNING || {}));
}

loadTuning();

const ScoreStore = {
  loadHighScore() {
    return parseInt(safeStorage.get('dino-high-score', '0'), 10) || 0;
  },
  saveHighScore(n) {
    safeStorage.set('dino-high-score', n);
  },
  loadDailyBest() {
    const storedDate = parseInt(safeStorage.get('dino-daily-date', '0'), 10) || 0;
    if (storedDate !== dailySeed()) return 0;
    return parseInt(safeStorage.get('dino-daily-best', '0'), 10) || 0;
  },
  saveDailyBest(score) {
    if (score > this.loadDailyBest()) {
      safeStorage.set('dino-daily-date', dailySeed());
      safeStorage.set('dino-daily-best', score);
    }
  },
};

const STATE = Object.freeze({
  LOADING: 'LOADING',
  IDLE: 'IDLE',
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  // A run put on hold because the page was hidden (app or tab switch). It
  // goes back to RUNNING through the resume countdown.
  PAUSED: 'PAUSED',
  DEAD: 'DEAD',
});

// Respect the user's OS-level reduce-motion preference. Read once at startup —
// ambient motion is suppressed when true. Hill respawn still consumes game.rng()
// (see updateHills) so a Daily seed yields the same obstacle sequence either way.
// Tests flip the flag through setReducedMotion(); players do not.
let reducedMotion = !!(
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

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
// setQaFlag('plateau'); a normal visit leaves this false.
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

// QA/debug only — not for players. ?qaCluster=1 forces the first Updated/Daily
// obstacle to be a cluster so playtest can see the silhouette without
// reaching score 250. The type roll is still consumed, so gaps and later
// picks keep their RNG order. Classic never takes the override. Re-read in
// resetGame() like ?qaPlateau=1. Tests flip it through setQaFlag('cluster').
// QA/debug only — not for players. ?qaBig=1 forces the first Updated/Daily
// obstacle to be a big cactus so playtest can see the tall silhouette
// without reaching score 100. The type roll is still consumed, so gaps and
// later picks keep their RNG order. Classic never takes the override.
// Re-read in resetGame() like ?qaCluster=1. Tests flip it through setQaFlag('big').
// QA/debug only — not for players. ?qaNight=1 paints full night from the
// first frame so the star fade can be seen without a score-400 run.
// Sky, hills, HUD ink, star init, the Updated/Daily night cactus and dino
// lifts, the Updated/Daily night cloud dim, Updated/Daily jump/land
// dust, the Updated/Daily night ground cool, the Updated/Daily night
// milestone tint, and the Updated/Daily night death flash read it through
// scoreForNightSky. Speed, gaps, scoring, and game.rng() do not. Pair
// with ?qaFlash=1 to see the quieter night blink without colliding.
// Re-read in resetGame()
// like the other QA flags. Tests flip it through setQaFlag('night'); a normal
// visit leaves this false.
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
// flags. Tests flip it through setQaFlag('level'); a normal visit leaves this
// false.
const QA_LEVEL_HOLD = 180;
// QA/debug only — not for players. ?qaTrail=1 emits the late-run heel
// whisper from the first Updated/Daily RUNNING frame, so playtest can see
// it without a score-~570 run. It does not write the score, speed, gaps,
// or game.rng(). Classic never takes it. Pair with ?qaNight=1 to put that
// whisper on the night sky it actually lives on. Re-read in resetGame()
// like the other QA flags. Tests flip it through setQaFlag('trail'); a normal
// visit leaves this false.
// QA/debug only — not for players. ?qaConfetti=1 shows an early gold block
// in Updated/Daily so playtest can see it without a score-100 run.
// The block is its own overlay. It does not emit, restyle, or read the
// particle pool — a full pool or a missed "born" slot must still paint.
// Production confetti stays #ffd700 at 3px on a real level-up.
// It does not write the score, speed, gaps, or game.rng().
// Classic never takes it. One hold per run. Re-read in resetGame().
// Reduced motion halves the hold and halves the ink, so the debug block
// is shorter and softer too. Tests flip it through setQaFlag('confetti'); a
// normal visit leaves this false.
const QA_CONFETTI_HOLD = 180;
const QA_CONFETTI_BLOCK_W = 88;
const QA_CONFETTI_BLOCK_H = 36;
const QA_CONFETTI_COLOR = '#b45309';
const QA_CONFETTI_RIM = '#3f2a12';
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
// setQaFlag('dust'); a normal visit leaves this false.
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
  return qa.night ? Particles.KINDS.plateau.color : Particles.KINDS.plateauQa.color;
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
    const t =
      (s - GAME_CONFIG.DAY_NIGHT_START) / (GAME_CONFIG.DAY_NIGHT_END - GAME_CONFIG.DAY_NIGHT_START);
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
// QA/debug only — not for players. ?qaCollision=1 holds the quieter
// Updated/Daily death puff on the dino from the first RUNNING frame, so
// playtest can see it after GET READY without dying. The marks are their
// own overlay. They do not emit, restyle, or read the particle pool — a
// full pool or the short production life cannot skip them. Production
// collision stays the quieter kind. It does not write the score, speed,
// gaps, or game.rng(). Classic never takes it. Reduced motion halves the
// hold and paints fewer motes at half ink. Re-read in resetGame().
// Tests flip it through setQaFlag('collision'); a normal visit leaves this false.
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
// Tests flip it through setQaFlag('flash'); a normal visit leaves this false.
const QA_FLASH_HOLD = 180;

// Motion-allowed playtest shows the real peak. Reduced motion still paints,
// at half that peak, so a long hold cannot stay a full-strength blink.
function qaFlashPaintAlpha() {
  const peak = deathFlashPeakAlpha();
  if (!reducedMotion) return peak;
  return peak * 0.5;
}

// Overdraw after the whole frame, from the hold counter only. drawDead
// draws the real flash; this pass runs from drawFrame() after the state's
// draw, so the hit frame and the death shake both get it. source-over, on top of the HUD.
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
// in resetGame(). Tests flip it through setQaFlag('scorePop'); a normal visit
// leaves this false.
const QA_SCORE_POP_HOLD = 180;

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

// Overdraw after the whole frame, from the hold counter only. drawDead
// draws the real pop inside the shake; this pass runs from drawFrame()
// after the state's draw, so the hit frame and the shake both get it. It sits above the flash so a
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
// it through setQaFlag('shake'); a normal visit leaves this false.
const QA_SHAKE_HOLD = 180;

// Motion-allowed playtest shows the real quiet peak. Reduced motion keeps
// half of that shift, so a long hold cannot sit at the full nudge.
function qaShakeOffset() {
  const peak = deathShakeAmplitude();
  if (!isUpdatedMode()) return 0;
  if (!reducedMotion) return peak;
  return peak * 0.5;
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
// Tests flip it through setQaFlag('newBest'); a normal visit leaves this false.
const QA_NEW_BEST_HOLD = 180;

// QA/debug only — not for players. ?qaCopy=1 holds the Daily Copy result
// button on ✓ Copied! from the first WAITING, RUNNING, or DEAD frame, so
// playtest can see the quieter confirmation without a clipboard write or a
// finished score count-up. The button is the flash UI. This does not start
// copyFlashFrames, does not call shareDailyResult(), and does not write the
// score, speed, gaps, particles, or game.rng(). Classic and free-play
// Updated never take it. Reduced motion halves the hold and adds the
// quieter is-qa-damped paint. Re-read in resetGame(). Tests flip it through
// setQaFlag('copy'); a normal visit leaves this false.
const QA_COPY_HOLD = 180;

function applyQaCopyButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  if (isDailyMode() && (game.qaCopyHold > 0 || game.qaShareHold > 0)) {
    if (btn.style) btn.style.display = 'block';
    btn.textContent = '✓ Copied!';
    markShareCopied(btn, true, reducedMotion);
    return;
  }
  if (!game.qaCopyShown && !game.qaShareShown) return;
  const settledDailyDeath =
    isDailyMode() &&
    game.state === STATE.DEAD &&
    Animations.deathShakeFrames <= 0 &&
    Animations.deathAnimFrame >= deathAnimFrames();
  if (settledDailyDeath) return;
  if (btn.style) btn.style.display = 'none';
  if (Animations.copyFlashFrames <= 0) {
    btn.textContent = '📋 Copy result';
    markShareCopied(btn, false, false);
  }
}

// QA/debug only — not for players. ?qaShare=1 holds ✓ Copied! on the Daily
// Copy result button through settled Game Over. The flag does not switch
// mode: a cold visit stays Classic or Updated until the player enters Daily.
// The hold must not start on WAITING or RUNNING. GET READY is 240 frames
// and the window is 180, so a latch on the first Daily frame is already
// gone when the death card shows Copy result. The count-up finishes inside
// updateDead, after this check, so the button's first visible frame
// (deathAnimFrame >= length - 1) is the latch. It does not tick back to
// Copy result while that button is up — same idea as the count-up card,
// which stays until the capture surface is left. A tap while the flag is
// on confirms in the page and does not open a sheet or write the clipboard.
// This does not call navigator.share, does not call shareDailyResult(), and
// does not write the score, speed, gaps, particles, or game.rng(). Classic
// and free-play Updated never take it. Reduced motion latches the half
// length and adds the quieter is-qa-damped paint. Re-read in resetGame().
// Tests flip it through setQaFlag('share'); a normal visit leaves this false.
const QA_SHARE_HOLD = 180;

// True on the frame the Copy result button becomes visible, and on every
// settled Game Over frame after that. The count-up increments inside
// updateDead after this check, so the finishing frame (length - 1) counts
// too. GET READY and the run do not.
function dailyShareButtonSettled() {
  if (!isDailyMode() || game.state !== STATE.DEAD) return false;
  if (Animations.deathShakeFrames > 0) return false;
  const length = deathAnimFrames();
  return Animations.deathAnimFrame >= Math.max(0, length - 1);
}

function advanceQaShare() {
  if (!qa.share || !dailyShareButtonSettled()) return;
  // Latch once, on the settled card. Do not spend frames before Copy
  // result is on screen, and do not count them down while it stays there.
  if (!game.qaShareShown || game.qaShareHold <= 0) {
    game.qaShareShown = true;
    game.qaShareHold = qaHoldFrames('share');
  }
}

// QA/debug only — not for players. ?qaCountUp=1 holds a Game Over card from
// the idle screen so playtest can see the count-up without a real death.
// The card freezes the display score at the Updated length: Updated and
// Daily have finished that shorter roll, Classic is still partway through
// its 30. It does not write Animations.deathAnimFrame, the score, speed,
// gaps, high score, daily best, or game.rng(). The idle card stays up
// until the player starts, so a capture does not have to win a race.
// Reduced motion halves the hold once the run starts and paints the card
// at half strength. Re-read in resetGame(). Tests flip it through
// setQaFlag('countUp'); a normal visit leaves this false.
const QA_COUNT_UP_HOLD = 180;
const QA_COUNT_UP_SCORE = 100;

// Freeze at the Updated length. That frame has finished the shorter roll
// and is still inside the Classic 30. A reduced-motion length below 18
// caps here so the damped card shows the settled score.
function qaCountUpPaintFrame() {
  const length = deathAnimFrames();
  return Math.min(GAME_CONFIG.UPDATED_DEATH_ANIM_FRAMES, length);
}

// QA/debug only — not for players. ?qaIdle=1 freezes the idle invite so a
// capture does not land in the trough. Updated and Daily hold the quieter
// peak (base + amplitude). Classic keeps the 0.3–0.7 pulse and still
// breathes. The idle card stays up until the player starts, so the hold
// does not tick down in IDLE and does not start the countdown. Reduced
// motion halves the hold and, in Updated and Daily, paints the static
// midpoint at half ink. Re-read in resetGame(). Tests flip it through
// setQaFlag('idle'); a normal visit leaves this false.
const QA_IDLE_HOLD = 180;

// QA/debug only — not for players. ?qaSafe=1 paints stand-in safe-area
// bands (notch, side insets, home indicator) so Playtest can check that
// the canvas stays inside the padded shell and the controls stay clear of
// the notch and the home indicator. Off, this adds no class and changes
// no gameplay. The bands do not animate, so reduced motion has nothing to
// shorten. Re-read in resetGame() like the other QA flags. Tests flip it
// through setQaFlag('safe'); a normal visit leaves this false.
function applyQaSafeShell() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root || !root.classList || typeof root.classList.add !== 'function') return;
  if (qa.safe) root.classList.add('qa-safe');
  else if (typeof root.classList.remove === 'function') root.classList.remove('qa-safe');
}

// ?qaHz=1 (see QA_FLAGS) paints a static corner readout of the measured
// sim rate and the display rate (rAF) so Playtest can confirm a 120Hz
// phone still runs near 60 sim steps per second. Off, nothing is counted
// and nothing is drawn. The ink does not pulse or shake, so reduced motion
// has no hold to shorten.

function clearQaCountUpShare() {
  if (!game.qaCountUpShown || game.qaCountUpShareCleared || game.qaCountUpHold > 0) return;
  game.qaCountUpShareCleared = true;
  const btn = document.getElementById('share-btn');
  if (!btn || !btn.style) return;
  const settled =
    isDailyMode() &&
    game.state === STATE.DEAD &&
    Animations.deathShakeFrames <= 0 &&
    Animations.deathAnimFrame >= deathAnimFrames();
  if (settled) return;
  btn.style.display = 'none';
}

// Paint-only sample board. The real score and best are restored before
// the function returns, including when the draw throws.
function drawQaCountUp() {
  if (game.qaCountUpHold <= 0) {
    clearQaCountUpShare();
    return;
  }
  const savedAlpha = ctx.globalAlpha;
  const saved = {
    score: game.score,
    highScore: game.highScore,
    isNewBest: game.isNewBest,
    isFirstRun: game.isFirstRun,
    anim: Animations.deathAnimFrame,
    dailyBest: game.dailyBest,
    isNewTodayBest: game.isNewTodayBest,
  };
  try {
    game.score = QA_COUNT_UP_SCORE;
    game.highScore = Math.max(saved.highScore, QA_COUNT_UP_SCORE + 150);
    game.isNewBest = false;
    game.isFirstRun = false;
    game.isNewTodayBest = false;
    if (isDailyMode()) {
      game.dailyBest = Math.max(saved.dailyBest, QA_COUNT_UP_SCORE + 150);
    }
    Animations.deathAnimFrame = qaCountUpPaintFrame();
    if (reducedMotion) ctx.globalAlpha = 0.5;
    drawGameOverScreen();
  } finally {
    game.score = saved.score;
    game.highScore = saved.highScore;
    game.isNewBest = saved.isNewBest;
    game.isFirstRun = saved.isFirstRun;
    Animations.deathAnimFrame = saved.anim;
    game.dailyBest = saved.dailyBest;
    game.isNewTodayBest = saved.isNewTodayBest;
    ctx.globalAlpha = savedAlpha;
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
  if (!qa.night) return score;
  return score < GAME_CONFIG.DAY_NIGHT_END ? GAME_CONFIG.DAY_NIGHT_END : score;
}

// Returns the rolled type, or the cluster type once per run when the QA flag
// is on. Updated and Daily only. Does not call game.rng().
function qaClusterOverride(rolledType) {
  if (!qa.cluster || game.qaClusterShown || !isUpdatedMode()) return rolledType;
  const cluster = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'cluster');
  if (!cluster) return rolledType;
  game.qaClusterShown = true;
  return cluster;
}

// Returns the rolled type, or the big cactus once per run when the QA flag
// is on. Updated and Daily only. Does not call game.rng().
function qaBigOverride(rolledType) {
  if (!qa.big || game.qaBigShown || !isUpdatedMode()) return rolledType;
  const big = GAME_CONFIG.OBSTACLE_TYPES.find((t) => t.id === 'big');
  if (!big) return rolledType;
  game.qaBigShown = true;
  return big;
}

// --- QA switchboard (C3) -----------------------------------------------
// QA/debug only — not for players. Every ?qaX=1 playtest flag is one row
// here, instead of its own reader, variable and setter. Each row says:
//   id       the key in `qa` (qa.night, qa.dust, ...) and in setQaFlag()
//   param    the URL query name; only the exact value 1 turns it on
//   hold     frames a held overlay stays up (the game.<param>Hold counter)
//   reduced  share of that hold kept under reduced motion (min 2 frames)
//   latch    when the hold starts: 'running' (first RUNNING frame) or
//            'visible' (first frame the gate allows)
//   count    when the hold counts down: 'running', 'notIdle' or 'always'
//   gate     when the flag may act at all (mode or state)
//   advance  custom per-frame step, for a flag the generic one can't express
//   draw     overdraw after the frame, from the hold counter only
//   onSet    side effect when a test or reader switches it
// The table order is the order runSimFrame() advances them and drawFrame()
// draws them.
// No flag writes score, speed, gaps, hitboxes or game.rng(); with no flag
// set a run plays exactly as before (the golden replays check this).
// Flags whose holds are latched elsewhere (plateau, level, confetti in
// updateRunning; cluster and big in the type overrides) list `hold` or
// `latched` so resetGame() clears them, but have no generic advance.
const updatedOnly = () => isUpdatedMode();
const anyState = () =>
  game.state === STATE.IDLE ||
  game.state === STATE.WAITING ||
  game.state === STATE.RUNNING ||
  game.state === STATE.DEAD;
const dailyCardStates = () =>
  isDailyMode() &&
  (game.state === STATE.WAITING || game.state === STATE.RUNNING || game.state === STATE.DEAD);

// A row's draw may be a function from a later game file (src/05-rendering.js),
// which does not exist yet while this file loads, so those rows wrap the call
// in an arrow function.
const QA_FLAGS = Object.freeze([
  // Forces the first Updated/Daily obstacle to be a cluster / big cactus.
  { id: 'cluster', param: 'qaCluster', latched: true },
  { id: 'big', param: 'qaBig', latched: true },
  // Full night from the first frame (read through scoreForNightSky).
  { id: 'night', param: 'qaNight' },
  // Late-run heel whisper from the first Updated/Daily frame.
  { id: 'trail', param: 'qaTrail' },
  {
    id: 'confetti',
    param: 'qaConfetti',
    hold: QA_CONFETTI_HOLD,
    latched: true,
    draw: drawQaConfetti,
  },
  {
    id: 'dust',
    param: 'qaDust',
    hold: QA_DUST_HOLD,
    reduced: 1,
    latched: true,
    gate: updatedOnly,
    latch: 'visible',
    count: 'running',
    draw: drawQaDust,
  },
  {
    id: 'collision',
    param: 'qaCollision',
    hold: QA_COLLISION_HOLD,
    latched: true,
    gate: updatedOnly,
    latch: 'running',
    count: 'running',
    draw: drawQaCollision,
  },
  { id: 'plateau', param: 'qaPlateau', hold: QA_PLATEAU_HOLD, draw: drawQaPlateau },
  {
    id: 'flash',
    param: 'qaFlash',
    hold: QA_FLASH_HOLD,
    latched: true,
    gate: updatedOnly,
    latch: 'running',
    count: 'running',
    draw: drawQaFlash,
  },
  {
    id: 'level',
    param: 'qaLevel',
    hold: QA_LEVEL_HOLD,
    latched: true,
    draw: () => drawQaLevelLabel(),
  },
  {
    id: 'scorePop',
    param: 'qaScorePop',
    hold: QA_SCORE_POP_HOLD,
    latched: true,
    gate: updatedOnly,
    latch: 'running',
    count: 'running',
    draw: drawQaScorePop,
  },
  {
    id: 'newBest',
    param: 'qaNewBest',
    hold: QA_NEW_BEST_HOLD,
    latched: true,
    gate: updatedOnly,
    latch: 'running',
    count: 'running',
    draw: () => drawQaNewBest(),
  },
  {
    id: 'copy',
    param: 'qaCopy',
    hold: QA_COPY_HOLD,
    latched: true,
    gate: dailyCardStates,
    latch: 'visible',
    count: 'always',
  },
  { id: 'share', param: 'qaShare', hold: QA_SHARE_HOLD, latched: true, advance: advanceQaShare },
  {
    id: 'shake',
    param: 'qaShake',
    hold: QA_SHAKE_HOLD,
    latched: true,
    gate: updatedOnly,
    latch: 'running',
    count: 'running',
  },
  {
    id: 'countUp',
    param: 'qaCountUp',
    hold: QA_COUNT_UP_HOLD,
    latched: true,
    gate: anyState,
    latch: 'visible',
    count: 'notIdle',
    draw: drawQaCountUp,
  },
  {
    id: 'idle',
    param: 'qaIdle',
    hold: QA_IDLE_HOLD,
    latched: true,
    gate: anyState,
    latch: 'visible',
    count: 'notIdle',
  },
  // Safe-area bands on the page shell (a class on <html>, not the canvas).
  { id: 'safe', param: 'qaSafe' },
  // Corner readout of measured sim and display rates (drawn from gameLoop).
  {
    id: 'hz',
    param: 'qaHz',
    onSet: (on) => {
      if (!on) resetQaHzMeter();
    },
  },
]);

const QA_FLAG_BY_ID = Object.freeze(Object.fromEntries(QA_FLAGS.map((f) => [f.id, f])));

// True when the page query (or `search`, for tests) has exactly <param>=1.
function readQaFlag(id, search) {
  const query =
    search !== undefined
      ? search
      : typeof location !== 'undefined' && location && typeof location.search === 'string'
        ? location.search
        : '';
  if (!query) return false;
  return new URLSearchParams(query).get(QA_FLAG_BY_ID[id].param) === '1';
}

// Which flags are on this run. Read at boot and again in resetGame(), so a
// mode toggle still honours the page query. Tests flip one with setQaFlag().
const qa = {};
function readQaFlags() {
  for (const flag of QA_FLAGS) qa[flag.id] = readQaFlag(flag.id);
}
readQaFlags();

function setQaFlag(id, enabled) {
  const flag = QA_FLAG_BY_ID[id];
  qa[id] = !!enabled;
  if (flag.onSet) flag.onSet(qa[id]);
}

// Hold length for a flag's overlay. Reduced motion keeps `reduced` of it
// (half unless the row says otherwise), never under 2 frames.
function qaHoldFrames(id) {
  const flag = QA_FLAG_BY_ID[id];
  const share = flag.reduced === undefined ? 0.5 : flag.reduced;
  if (!reducedMotion || share === 1) return flag.hold;
  return Math.max(2, Math.round(flag.hold * share));
}

// The game.<param>Shown / game.<param>Hold fields, at their run-start values.
function initialQaHolds() {
  const holds = {};
  for (const flag of QA_FLAGS) {
    if (flag.latched) holds[flag.param + 'Shown'] = false;
    if (flag.hold !== undefined) holds[flag.param + 'Hold'] = 0;
  }
  return holds;
}

// One sim slice for one flag: latch its hold once, then count it down.
function advanceQaHold(flag) {
  const shown = flag.param + 'Shown';
  const hold = flag.param + 'Hold';
  if (!flag.gate()) return;
  const latchNow = flag.latch === 'visible' || game.state === STATE.RUNNING;
  if (qa[flag.id] && !game[shown] && latchNow) {
    game[shown] = true;
    game[hold] = qaHoldFrames(flag.id);
    return;
  }
  if (game[hold] <= 0) return;
  if (flag.count === 'running' && game.state !== STATE.RUNNING) return;
  if (flag.count === 'notIdle' && game.state === STATE.IDLE) return;
  game[hold]--;
}

function advanceQaFlags() {
  for (const flag of QA_FLAGS) {
    if (flag.advance) flag.advance();
    else if (flag.gate) advanceQaHold(flag);
  }
}

function drawQaFlags() {
  for (const flag of QA_FLAGS) if (flag.draw) flag.draw();
}

// Pitch of the combo note for combo n (M7): the major pentatonic scale up
// from COMBO_NOTE_BASE_HZ, one step per combo, capped.
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9];
function comboNoteHz(n) {
  const step = Math.min(Math.max(0, n - 1), GAME_CONFIG.COMBO_NOTE_MAX_STEPS);
  const semis = 12 * Math.floor(step / 5) + PENTATONIC_SEMITONES[step % 5];
  return GAME_CONFIG.COMBO_NOTE_BASE_HZ * Math.pow(2, semis / 12);
}

// --- Web Audio module (PR-B) ---
// Synthesised SFX — no asset files. Lazy-creates AudioContext on first user
// gesture (Chrome's autoplay policy) and silently no-ops if AudioContext is
// unavailable (Node tests, very old browsers).
const audio = {
  ctx: null,
  muted: safeStorage.get('dino-muted') === '1',
  ensure() {
    if (!this.ctx) {
      const Ctx =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : typeof webkitAudioContext !== 'undefined'
            ? webkitAudioContext
            : null;
      if (!Ctx) return null;
      try {
        this.ctx = new Ctx();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {
        /* swallow autoplay-block etc. */
      });
    }
    return this.ctx;
  },
  setMuted(v) {
    this.muted = !!v;
    safeStorage.set('dino-muted', this.muted ? '1' : '0');
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
  jump() {
    this.blip(420 + (Math.random() - 0.5) * 40, 80, 'sine', 0.04);
  },
  land() {
    this.blip(140, 60, 'sine', 0.05);
  },
  // Second jump (M3): a brighter, higher blip than the first.
  doubleJump() {
    this.blip(630 + (Math.random() - 0.5) * 30, 90, 'triangle', 0.04);
  },
  // Move combo (M7): each step climbs the major pentatonic scale.
  comboNote(n) {
    this.blip(comboNoteHz(n), 110, 'triangle', 0.045);
  },
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

// --- Death buzz (S5) ---
// One short vibration when the dino dies, on phones that support it. It
// follows the sound rules: Updated and Daily only, never when muted, and
// never under reduced motion. Where navigator.vibrate is missing (desktop
// browsers, iOS Safari, Node) it does nothing. Returns whether it buzzed.
function vibrateOnDeath(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (audio.muted || reducedMotion || !isUpdatedMode()) return false;
  if (!nav || typeof nav.vibrate !== 'function') return false;
  try {
    return nav.vibrate(GAME_CONFIG.DEATH_VIBRATE_MS) !== false;
  } catch {
    return false;
  }
}
