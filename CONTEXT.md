# Domain Context — Chrome Offline Rex

## Design Pillars

**Flow** — the primary emotion the game is designed to create. A great run feels like time disappeared: the player stops thinking and just reacts. Every design decision should be evaluated against whether it protects or breaks this rhythm.
_Avoid_: fun, enjoyment, engagement (too broad)

**Atmosphere** — the peripheral world that deepens the flow state in Updated mode: scrolling hills, clouds, particles, day/night cycle. Atmosphere should be noticed only when the player is already in the zone — never demanding attention or drawing the eye away from the obstacle lane. It is a servant of Flow, not a separate goal.
_Avoid_: visuals, juice, polish (too generic)

**Classic mode** — the "pure flow" experience: no atmosphere, one obstacle type, nothing between the player and the obstacle. Its minimalism is intentional, not a deficiency. Classic should never receive atmospheric features — doing so would betray its identity. It is not an inferior Updated mode; it is a different answer to the same Flow pillar.
_Avoid_: stripped-down mode, legacy mode, basic mode

**One shared run** — the third pillar: once per day, every player faces the same obstacle sequence. The shared day is the UTC calendar day, so the course, the `#N`, and the TODAY BEST reset all flip together at 00:00 UTC. Gives scores meaning and creates a social moment via the Share Result. The "shared" context belongs at the edges of the run (pre-run framing, post-run result screen) — not during the run, where it induces anxiety and breaks Flow. The in-run Daily badge and the in-run TODAY label are off the HUD during WAITING and RUNNING. Pre-run framing is the quiet shared-course line on the GET READY overlay, including today’s #N, and only then. A miss keeps TODAY BEST on the Game Over screen beside this run. A death that beats today takes over with the new today best celebration. The share result stays available after the run, and a single death-screen hint points at sharing once the score count-up finishes.
_Avoid_: daily mode, social feature, leaderboard

**Restart countdown** — the GET READY countdown shown in the WAITING state before each run. On first run: shown in full (builds anticipation for a new player). On restart after death: skippable by pressing space, so a player already in flow-mindset can return to RUNNING immediately without waiting 4 seconds.
_Avoid_: grace period, warmup, delay

## Core Concepts

**Big cactus** — the obstacle type that unlocks at score 100, the first obstacle that is not the small cactus. It uses the same cactus art, painted at that art's own proportions and at the hitbox height, with nearest-neighbor so a first encounter reads as a crisp tall cactus rather than a soft, wide stretch of the small sprite. The paint may sit inside the hitbox; the hitbox width, height, unlock score, and weight stay on `GAME_CONFIG` and are not part of the draw. An unrecognisable first encounter around score 100 is a fairness break — the same kind of problem as the cluster later in the run, only earlier.
_Avoid_: large cactus, tall cactus (as a type name), stretched cactus

**Cluster obstacle** — the obstacle type that unlocks at score 250, drawn as two full small-cactus sprites with one small cactus of sky between them so a first encounter reads as two cacti at a glance. The cactus art's arms run to the edge of the sprite, so the leftover space inside the hitbox still reads as one mass. The sprites may overhang the hitbox equally; the sky between them stays inside the hitbox, and the gap is narrower than the dino, so it is not a lane. The hitbox width, unlock score, and weight stay on `GAME_CONFIG` and are not part of the draw. An unrecognisable first encounter at score 250+ is a fairness break, not an earned surprise — the player has invested a long run before losing to something confusing.
_Avoid_: double cactus, pair obstacle, twin obstacle

**Pause** — the PAUSED state a run enters when the page is hidden mid-run (switching apps or tabs, locking the phone). Nothing moves while hidden. Back on the page, a 3-second **resume countdown** ("PAUSED" and 3 2 1, static text, the same under reduced motion) runs, then the run carries on exactly where it stopped: score, speed, spawn timing, the dino's arc and the run seed are untouched, and a press during the countdown neither skips it nor jumps. Pause and return are announced through the live region. Only a RUNNING run pauses; the GET READY countdown, Game Over and the start screen are left alone. It serves Flow: coming back should not drop the player into a fast run cold. There is no pause button.
_Avoid_: freeze, suspend, menu

**Jump buffer** — a jump pressed while the dino is still in the air, up to `JUMP_BUFFER_FRAMES` (6) sim frames before it lands, is kept and fires on the landing frame. A press earlier than that is dropped, as before. It counts sim frames, not display frames, reads `GAME_CONFIG` directly and never draws on the run seed. It serves Flow: at speed a press a hair early should not feel like the game missed it. Same in every mode.
_Avoid_: input queue, coyote time (that is the opposite: a late jump after leaving a ledge)

**Variable jump** — how long jump is held sets the height (F3). A held press is the full jump (49 frames, about 144px). Letting go while still rising fast cuts the rise to `JUMP_CUT_VELOCITY`, but not before the feet are `JUMP_MIN_HEIGHT` up, so a quick tap is a short hop (about 33 frames, 76px) that still clears every obstacle at every speed. Keys (keyup), mouse (press on the canvas, release anywhere) and touch (last finger lifted) all end the hold. Gameplay values: `GAME_CONFIG`, never `cfg()`. Spawns are untouched, so the Daily course stays the same for everyone; only the player's input differs.
_Avoid_: charge jump, jump strength

**Hang time** — In Updated and Daily, gravity is halved while the dino moves slower than 1.6 px per frame near the top of a jump, so the peak floats for a moment. A held jump lasts about 56 sim frames instead of 49. Classic keeps the plain arc; a fast fall skips it. A gameplay value (`HANG_*` in `GAME_CONFIG`).

**Squash and stretch** — In Updated and Daily the dino sprite stretches taller in the air with speed and squashes on landing, easing back over a few frames, anchored at the feet. A landing that ends a fast fall is a **slam**: a flatter squash and a heavier dust burst. Visual only (the hitbox never changes), tunable through `cfg()`, off under reduced motion.

**Speed streaks** — Faint wind lines in the sky band, above the obstacle lane, that fade in once the run passes speed 6.5 in Updated and Daily. Atmosphere only; never in Classic or under reduced motion.

**Slam kick** — After a slam the world (not the sky or score) dips a few px for a few frames. Visual only, Updated and Daily, off under reduced motion.

**Second jump** — In Updated and Daily, a fresh press in the air jumps again, once per flight, with a forward flip and a puff of dust. A press while falling within the jump buffer window still counts as an early landing jump instead (F1), and a held key's auto-repeat never spends it. The dino never rises above the top of the canvas (the ceiling): near the top, the second jump starts slower so it tops out there. Classic has no second jump.

**Slide** — In Updated and Daily, Down, S or a swipe down on the ground drops the dino flat for about half a second with a hitbox only 24px tall; holding Down keeps it going and a jump ends it. Down just after a take-off cancels the jump into a slide, because a phone swipe starts with the touch that jumps. Classic has no slide (Down on the ground does nothing there).

**Low bird** — An Updated and Daily obstacle (from score 150) that flies 30px above the ground: a standing dino hits it, a sliding dino passes under, a jumping dino clears it. Drawn as a small blocky bird in the cactus ink.

**Lower first jump** — Updated and Daily take off at `UPDATED_JUMP_POWER` (-9.6 instead of -12), so a full jump peaks about 93px up instead of 144 and the second jump has sky to use. It still clears every obstacle except the tower. The owner chose this on 2026-11-16. Classic keeps the original jump.

**Cactus tower** — An Updated and Daily obstacle (from score 200): two big cacti stacked, 110px tall, higher than a full first jump reaches, so it takes the second jump to clear. Drawn as the original big cactus sprite twice.

**Air dash** — In Updated and Daily, Right, D or a swipe right in the air, once per flight: for 12 sim frames the dino holds its height and the world scrolls 6px per frame faster, so the flight covers more ground. A second jump or a fast fall ends it; landing gives it back. Classic has no dash.

**Long cactus row** — An Updated and Daily obstacle (from score 300): small cacti side by side, as many as it takes to be wider than one held jump can cross at the speed it spawns, so it needs the air dash (or a late second jump). The gap after a row counts from its right edge.

**Move combo** — In Updated and Daily, each obstacle cleared during a second jump, an air dash or a slide adds one to the combo and plays a note a step higher on the major pentatonic scale; one cleared with a plain jump ends it. The HUD shows COMBO xN under the score from 2 up. The owner chose this over close calls or a plain obstacle count on 2026-11-16. Display and sound only: it never changes score, speed, spawning or `game.rng()`.

**Fast fall** — Down, S or a swipe down (30 CSS px) while airborne: the dino stops rising and falls at three times gravity until it lands, dropping any buffered jump. Does nothing on the ground (there is no duck).
_Avoid_: dive, slam, duck

**Obstacle** — any on-screen hazard the dino must jump over.
_Avoid_: enemy, object

**Obstacle type** — the category of a spawned obstacle (e.g. small cactus, big cactus, cluster cactus).
_Avoid_: obstacle kind, obstacle variant

**Spawn gap** — the pixel distance between the right edge of the canvas and the trigger point for the next obstacle spawn. In Updated and Daily, once the shrinking curve would leave less than one focused jump between obstacles, the gap scales with speed so the time between them holds. Classic keeps the shrinking pixel gap.
_Avoid_: gap, spacing, next gap

**Jitter** — a random ±variation applied to the **spawn gap** in updated mode to prevent metronomic spacing. Only applied in updated mode; classic-mode spawn gaps are deterministic.
_Avoid_: randomness, variation

**Score** — the primary measure of how far a run has progressed; the sole input to the difficulty curve.
_Avoid_: distance, points

**Speed** — the obstacle scroll speed in pixels per sim frame at the current score. A sim frame is one slice of the sim clock (1/60s), not a display refresh.
_Avoid_: velocity, game speed, scroll speed

**Tuning panel** — the dev-only `?tune=1` overlay (`tune.js`). It edits the visual values in `TUNABLE_KEYS` live through `GAME_TUNING`, never gameplay values, and copies the final numbers for a PR. Players never load it.

**QA switchboard** — the `QA_FLAGS` table in `src/02-config.js` (Section 2). Each row is one `?qaX=1` playtest flag (QA/debug only, never for players): its URL name, how long its overlay holds, when it may act, and what it draws. `qa.x` is whether the flag is on this run. Flags only show things; with none set a run plays exactly as it would otherwise.

**Sim clock** — the fixed 60Hz step that advances score, speed, spawn timing, jump physics, the restart countdown, and frame-tied juice. Display refresh may be faster (a 120Hz phone fires animation frames twice as often). Real time from those frames accumulates and is spent in 1/60s slices, at most a few slices per animation frame, so a hitch does not fast-forward the run. A call with no timestamp (the test harness, and the kickoff that starts the loop) is one slice. Classic and Updated/Daily share this clock. DifficultyProfile and the run seed do not read it. `?qaHz=1` paints the measured sim rate and the display rate for Playtest; off, it counts nothing and draws nothing. Each slice runs the current state's update step (simulation only); the display frame then runs one draw step for whatever state the game ended in, so a frame that owes two slices still paints once.
_Avoid_: delta time, fps cap, frame skip

**Initial speed** — the speed at score 0 — the lowest point of the difficulty curve.
_Avoid_: start speed, base speed

**Ramp midpoint** — the score value where the difficulty curve's rate of change is steepest; the inflection point of the sigmoid.
_Avoid_: midpoint, acceleration point

**Ramp steepness** — a tuning coefficient that controls how sharply speed rises around the ramp midpoint.
_Avoid_: slope, sigmoid slope

**DifficultyProfile** — the module that owns the relationship between score and game feel. It defines how fast the game moves at any given score, when obstacles spawn, and what type they are. All tunable numbers live here; the game loop reads from it rather than computing inline.

**Difficulty curve** — how speed and obstacle density scale with score. The curve starts gently, accelerates through the mid-game, and plateaus at a speed the player can sustain with focus. It is continuous (no sudden jumps at level boundaries) and sigmoid-shaped (slow ramp-up, steeper middle, soft plateau).

**Plateau** — the ceiling of the difficulty curve. Chosen to feel "focusable but demanding" — a skilled player can hold this speed indefinitely, but it is not forgiving of lapses in attention. The curve approaches plateau speed and never quite touches it, so the player is told they have arrived the first time speed reaches 98% of plateau speed (about score 641 on the current curve). That cue is a brief cool particle puff at the dino's heel — once per run, never a center message, never repeated. Classic never shows it. Under prefers-reduced-motion the puff is damped like other particles. It reframes a late failure from "this is impossible" to "I've reached the hard part, now I need to hold it."

**Level** — a discrete score milestone (every 100 points) used for milestone flash effects and visual feedback only. Speed no longer steps at level boundaries; it increases continuously. In Updated and Daily the center LEVEL label is a short, quiet read in the jump band, then it leaves while the gold wash finishes. By day that wash is a quiet breath. Once the sky is fully night the same wash peaks softer still, so the celebration stays peripheral Atmosphere and does not spotlight the canvas away from the obstacle lane. The gold puff at the score stays on the number, so it does not spray toward the obstacle lane. Classic keeps the full-size label for the whole flash, never draws the wash, and never emits that puff. Under prefers-reduced-motion the Updated and Daily word is shorter still, and the wash stays suppressed.

**New-best badge** — the in-run gold "NEW BEST!" under the score, shown the first time this run passes the stored high score. It sits in the corner, not in the jump band. In Updated and Daily it is a short, quiet read, then it leaves so it does not keep pulling the eye off the obstacle lane. Classic keeps today's full-size badge for the full countdown. Under prefers-reduced-motion the Updated and Daily badge is shorter still. It is not the Game Over "★ NEW BEST ★" line, and it is not **New today best**.
_Avoid_: high score popup, record banner

**First run** — the very first run on a device (no stored best yet). It beats nothing, so neither the in-run badge nor the Game Over "★ NEW BEST ★" line shows: Game Over shows the plain SCORE and the number, and the score is saved as the best (R3, #122). From the second run on, beating the best shows NEW BEST as before. Daily is separate: the first run of the day still counts as a **New today best**.
_Avoid_: debut, first best

**Particles** — the module that owns the particle pool, kind definitions, and all emit/update/draw/reset behaviour. Callers invoke `Particles.emit(kind, x, y)` without knowing pool size, reduced-motion rules, or mode gating — all suppression logic lives inside. Visual-only: uses `Math.random()`, never `game.rng()`. The level gold is a short puff at the score in Updated and Daily. Classic never emits it.

**Land dust** — the jump and land foot puffs in Updated and Daily. By day they are a quieter brown whisper at the feet, still the familiar brown, so early-run Atmosphere stays off the obstacle lane. As the sky eases into night they cool to quiet ground dust, in the same family as the soft night clouds, and stay at the feet. Once the sky is fully night the puff is softer and shorter, so it does not sparkle on the road. Classic never shows them. Trail, collision, confetti, and the plateau cue are not land dust.
_Avoid_: foot dirt, jump smoke, dust particles (too broad — those include the trail and the plateau puff)

**Collision burst** — the red death puff in Updated and Daily, emitted at the dino when a hit ends the run. It is a short, tight cluster on the body so the hit still reads and the eye stays on the lane. Classic never emits it. It is not **Land dust**, the late-run heel trail, level confetti, or the plateau cue.
_Avoid_: hit sparks, blood, explosion, land dust

**Ground strip** — the scrolling road edge under the run, painted from the day sprite. By day it stays that day paint in every mode. In Updated and Daily, once the sky is fully night, the strip dims with the night Atmosphere so it still reads as the road edge and no longer as a bright day-gray ruler. Classic keeps the day paint even when the shared sky is night. It is not **Land dust**.
_Avoid_: floor, terrain, ground line (as a separate feature name)

**Stars** — the static night points in the upper sky. They appear once the sky is fully night, then fade in. In Updated and Daily that fade is shorter, so the quieter whisper settles sooner and the brightening ramp does not linger over the obstacle lane. Classic keeps today's fade to the full-white field. The day sky has none. They are not **Clouds**, hills, or the **Ground strip**.
_Avoid_: sparkle, twinkle (those pull the eye; the field should not)

**Clouds** — the soft sky mounds that drift behind the run. Their positions and speeds are cosmetic, never the run seed. In Updated and Daily the day puff is a quieter whisper on the white sky, and once the sky is fully night the same ink dims further so the large shapes stay peripheral Atmosphere and do not compete with the obstacle lane. Classic keeps the full-opacity puff even when the shared sky is night. They are not hills, **Stars**, or the **Ground strip**.

**Colour tints** — the light of an Updated or Daily run changing with the score: a warm **dusk glow** rises from the horizon and the **Ground strip** warms to a dusk brown through the day, then across twilight the glow turns deep blue and the ground line soft teal. The glow is a wash over the sky (clear at the top), painted with the background so every scene shows the same light. The ground is a recoloured copy of the original sprite; the art in assets/ never changes. Visual only (cfg() keys), never Classic. Reduced motion skips the slow change: the day look holds until night, then the night tint snaps in.
_Avoid_: weather, fog

**Animations** — the module that owns all per-run animation countdown timers (death shake, death flash, score pop, milestone flash, new-best badge, copy flash, death score count-up). A single `Animations.reset()` call zeroes all counters at the start of each run. Handlers and draw functions read and write counters directly via `Animations.X`. In Updated and Daily the death shake is a short settle, and the score pop eases across that same window, so Game Over opens after the HUD has settled. Classic keeps the longer death shake and does not start the score pop. Under prefers-reduced-motion the death flash and the score pop keep their own shorten; the death shake values stay. In Updated and Daily the death score count-up is about three fifths of the Classic roll, so the board settles sooner, and reduced motion halves that shorter roll again. Classic keeps the full count-up.

**Safe storage** — the one guarded path to browser storage (`safeStorage` in Section 2). Saved settings and scores (mode, mute, high score, daily best, tuning) are a convenience, never a requirement to play: when the browser blocks storage, a read falls back to the default and a write is ignored, and this session's values are kept in memory so the run still shows its high score. A game that does not load because storage is blocked is a Flow break before the first jump.
_Avoid_: persistence layer, save system

## Randomness

**RNG** — the seeded pseudo-random number generator used for all in-run randomness; shared between obstacle type selection and spawn gap jitter to preserve determinism. Consumed in a fixed order (type first, gap second) per spawn — swapping breaks deterministic replay. `Math.random()` is reserved for cosmetic effects only (particles, clouds, audio pitch).
_Avoid_: random, rand

**Run seed** — the integer actually passed to the RNG when a run starts. A Daily Challenge uses the **daily seed**. Free play uses `Date.now()` masked to 32 bits. Stored on the run so a reported free-play death can be seeded again with `replayRunSeed`.
_Avoid_: random seed, session id

**Golden run** — a stored, fully scripted run used as a regression lock: fixed **run seed**, mode and list of jump frames, plus what that run must produce (every spawned obstacle's frame, type and gap; each jump's take-off, landing and peak; the death frame; the final score). Lives in `tests/golden/`, replayed by `tests/replay.test.js` through the real game loop. Any change to physics, spawning, scoring, hitboxes or the RNG call order breaks one, so a refactor that should not change gameplay must leave them all passing. Re-recorded on purpose only, with `npm run test:replay -- --update`.
_Avoid_: snapshot, recording, demo

**Death log** — an opt-in JSON snapshot for unfairness reports: mode, score, run seed, speed, recent spawn gaps (pixels and approximate time), and obstacle types. Off unless the page is opened with `?debug=1` or DevTools calls `enableDeathLog()`. It does not change the run. Press L while it is on to copy the current snapshot.
_Avoid_: replay, telemetry, input log

## Daily Challenge

**Daily Challenge** — a play mode in which the obstacle sequence is seeded from today's UTC date, giving every player the same run each UTC day. Activated by a dedicated button; always runs in Updated mode.
_Avoid_: daily mode, date mode, challenge mode

**Daily seed** — an integer derived from today's UTC date in YYYYMMDD format (e.g. `20260501`) used as the RNG seed for a daily challenge run. Recomputed when the UTC day changes; the same seed produces the same obstacle sequence for every player on that UTC day. Local wall-clock time does not choose the seed.
_Avoid_: date seed, daily RNG

**Daily number** — the count of UTC days since the project epoch (2026-03-01 00:00 UTC), shown as `#N` on the Daily Challenge button, on pre-run framing, on the Game Over screen, and in the share text. Day 1 = 2026-03-01 UTC. It flips at the same UTC midnight as the daily seed. The button shows it before you enter, in the same UTC day as the seed. It is not drawn on the in-run HUD.
_Avoid_: day number, challenge number

**Daily best** — the player's highest score on today's daily challenge run, stored separately from all-time best. The stored day key (`dino-daily-date`) is the daily seed. It resets when the UTC day changes, together with the course and the daily number.
_Avoid_: daily high score, today's score, daily record

**Share result** — the Daily Game Over offer of the player's daily best. Capable browsers open the system share sheet with the existing text. If that sheet is missing, throws, or fails for a reason other than the player dismissing it, the same text is copied to the clipboard and the Copy result button flashes Copied. Dismissing the sheet copies nothing and does not flash. Format: `Rex Daily #N 🦕 / Score: X / <url>`.
_Avoid_: share score, clipboard share

**Pre-run framing** — the quiet line on the GET READY overlay during a Daily Challenge, shown only while state is WAITING. Copy: "Same course as everyone today · #N", where `#N` is the **Daily number**. Static text, no motion. Classic and Updated never show it. It is not drawn during RUNNING, and it does not replace TODAY BEST or the share result on Game Over.
_Avoid_: daily banner, in-run badge, today label

**Death-screen hint** — one static line on the Daily Challenge Game Over screen, drawn only after the score count-up finishes, in the same moment the Copy result button appears. In Updated and Daily that roll is shorter, so the line appears sooner. Classic keeps the longer roll. Copy: "Share TODAY BEST with Copy result". It points at the existing share button. It does not replace the share button, the comparison on a miss, or the new today best celebration. Classic and Updated never show it. It is not drawn during WAITING or RUNNING. No motion.
_Avoid_: share modal, in-run share prompt, copy banner

**New today best** — the Game Over celebration when a Daily Challenge death beats **Daily best**, including the first run of the day. On-screen copy: "★  NEW TODAY BEST  ★" and the run score, in the same takeover as free-play new best. A miss, including a tie, keeps the THIS RUN / TODAY BEST comparison. The death-screen hint and Copy result still appear after the score count-up. Static text, no extra motion. Classic and Updated never show it. Not drawn during WAITING or RUNNING.
_Avoid_: daily record, new daily high, today record

## Platform

**Offline shell** — the files a phone needs to boot the game with no connection: `index.html`, the game files in `src/`, `style.css`, the web manifest, the six sprites in `assets/`, and the app icons. `sw.js` precaches exactly that list on first visit and then serves it cache-first. The cache is named after the deploy's commit SHA, so each deploy installs a fresh shell and deletes the old one. The new version shows on the next launch; the page is never reloaded mid-run, because that would break Flow. A file the game loads at boot that is missing from the list breaks offline play silently.
_Avoid_: PWA cache, app cache

**Phone play area** — on a phone held upright, the canvas sits in the middle of the screen and a full-width jump button sits at the bottom under the thumb. The empty page below the canvas is a **tap zone**: a touch there works like tapping the canvas (jump, start, restart). Buttons keep their own taps. The canvas stays 3:1, so upright it is limited by the screen width.
_Avoid_: portrait mode (that is the phone's orientation, not a game mode)

**Game Over backdrop** — the run's last frame (sky, hills, ground, clouds, obstacles, the dino), held still and dimmed with 0.6 black under the Game Over card, so the player can see what ended the run. Repainted on every frame of the card so the dim never stacks. The dim keeps white score text above 4.5:1 contrast even over the white day sky. Same in every mode.
_Avoid_: death overlay, blackout

**Game Over text** — every caption on the Game Over card and the Daily hint is drawn in an opaque colour (`GAME_OVER_LABEL_COLOR` light grey, `GAME_OVER_DAILY_COLOR` pale amber for Daily lines), never translucent white, so each stays at 4.5:1 contrast or better over the dimmed backdrop (#116).
_Avoid_: faded text, alpha labels

**Tap without zoom** — the page and its buttons use `touch-action: manipulation`, so a quick double tap on a phone jumps twice instead of zooming the page. Pinch zoom still works, and a second finger on the canvas, the jump button or the page below never counts as a jump (#116).
_Avoid_: disable zoom, user-scalable=no

**Focused control keys** — Space or Enter while a button, link or field has keyboard focus belongs to that control: the game ignores it, so tabbing to Mute and pressing Space mutes without starting, jumping or restarting. Only focus the keyboard put there counts: after a mouse click or tap on a button, Space jumps as usual. Up arrow and W still jump from anywhere (#117).
_Avoid_: key capture, global Space

**Fullscreen button** — the corner button in the top row that puts the whole page in fullscreen with the browser bars hidden and, on a touch phone, asks for landscape, where the canvas is biggest (S4, #120). It only shows where the Fullscreen API exists, so not on an iPhone (Safari there has no page fullscreen; the turn-sideways hint and Add to Home Screen remain). Leaving fullscreen by the button, Escape or the back gesture unlocks the orientation. A refused lock is ignored.
_Avoid_: immersive mode, kiosk

**Death buzz** — one short 30 ms vibration when the dino dies, on phones whose browser supports it (most Android browsers; not iPhone Safari, and not desktop). It follows the sound: Updated and Daily only, never in Classic, never when muted, and never under reduced motion. Where vibration is missing or blocked, nothing happens (S5, #123).
_Avoid_: haptics (too broad; there is only this one buzz), rumble

**Readable label** — a small canvas label (11-16 logical px: Game Over and Daily captions, hints, the start and countdown lines, PAUSED). The canvas is 600 logical px wide and shrinks on a phone, so `labelPx()` raises such a label until it is about 12 CSS px on screen, capped at 20 logical px so the layout still fits. Desktop, where the canvas is drawn at full size or larger, keeps the designed sizes. Big numbers (the score, the countdown digit) are already readable and never change.
_Avoid_: font scaling, responsive text

**Big button** — the touch-only button under the canvas (`#jump-btn`). Its label says what a tap does now: TAP TO START on the start screen and a skippable countdown, GET READY on the first countdown, TAP TO JUMP in a run, PAUSED while paused, TAP TO RESTART on Game Over. It keeps one size for every label so nothing shifts. Hidden on desktop.
_Avoid_: jump button (it does more than jump), CTA

**Turn-sideways hint** — the one line under the canvas on a phone held upright, "Turn your phone sideways for a bigger view". Page text, never on the canvas. Shown on the start screen only, and retired for good (`dino-rotate-hint-seen`) once the player starts a run or turns the phone to landscape, so it never appears mid-run.
_Avoid_: rotate prompt, orientation warning

**Installed app** — the game added to a home screen through the web manifest. It opens fullscreen, landscape first, with the dino icon, and runs the same modes, scores, and Daily Challenge as the browser tab. It shares `localStorage` with the site, so best scores carry over. Installing is a browser feature at the edges of play; the game never prompts for it mid-run.
_Avoid_: native app, PWA mode

**Link preview** — what a chat app shows when someone pastes the game's link: the title "Rex Run", a one-line description and the share card `share-card.png` (1200x630, the dino jumping a cactus from the game's own art under the words REX RUN). Set by the description, Open Graph and Twitter tags in `index.html`, which point at the live site by full URL because chat apps cannot follow relative links. The card is not part of the **Offline shell**: the game never loads it (PL2, #124).
_Avoid_: thumbnail, OG card, unfurl

**Game files** — the game's code: ten plain classic scripts in `src/`, one per numbered section, listed in load order by `GAME_FILES` in `src/files.js`. The page, the browser test page, the offline cache and the Node tests all load exactly that list in that order, and the scripts share one global scope, so the split changes where code lives, never how it runs. Top-level code may only use names from its own file or an earlier one. Chosen over a bundler to keep the no-build rule, and so two changes to different sections no longer edit the same file.
_Avoid_: modules (they are not ES modules), script.js (the old single file)

**Merge queue** — `.github/workflows/automerge.yml`. A finished pull request gets the `automerge` label; the queue tests it combined with the latest `initial-chrome-dino-game`, squash-merges it, and starts the deploy. One PR at a time, so each change goes live on top of the one before. A PR that fails is taken out of the queue with a comment. Chosen because the owner does not review code; passing checks are the gate.
_Avoid_: auto-merge (GitHub's own feature, which is off in this repo)

## Relationships

- A **Daily Challenge** run uses one **Daily seed** derived from today's UTC date; that value is the run's **run seed**
- A free-play **run seed** is the clock value captured at reset, not the daily seed
- A **death log** is written only while debug is on, and it reads the **run seed** without changing spawns
- The **Daily seed** is the sole input to `game.rng` for a daily challenge run, replacing the `Date.now()` seed used in free play
- The **Daily number** is computed from the same UTC day as the **Daily seed** but is display-only — it does not influence the obstacle sequence
- The **Daily seed**, **Daily number**, and **Daily best** day key all read that same UTC calendar day and change together at 00:00 UTC
- **Daily best** is independent of all-time best; both are shown on the Game Over screen when in Daily Challenge
- A **Share result** references both the **Daily number** and the **Daily best**. Capable browsers offer it through the system share sheet. The clipboard copy is the fallback when that sheet is unavailable
- **Pre-run framing** is drawn only on the Daily Challenge GET READY overlay (WAITING), and that line names the **Daily number**. It is absent in RUNNING and in Classic and Updated free play
- A **Death-screen hint** is drawn only on a settled Daily Challenge Game Over screen, under both the comparison and a **New today best**. It names the Copy result button, and it is absent in WAITING, RUNNING, Classic, and Updated
- A **New today best** replaces the THIS RUN / TODAY BEST pair on that Game Over screen only. The **Death-screen hint** and **Share result** still appear once the count-up finishes
- A Daily Challenge death that does not beat **Daily best**, including a tie, keeps the comparison layout
- The **New-best badge** is drawn during RUNNING only, the first time the run passes the stored high score. Classic keeps the full countdown. Updated and Daily use the quieter, shorter paint. It is a different surface from the Game Over new-best line and from **New today best**
- The **Ground strip** stays day paint until the sky is fully night. Updated and Daily then dim it. Classic never does. **Land dust** is a separate foot puff on that edge. Updated and Daily soften and shorten that puff once the sky is fully night. Classic never shows it
- A **Collision burst** is the red death puff on the dino in Updated and Daily. It is not **Land dust**, the heel trail, level confetti, or the plateau cue. Classic never emits it
- **Stars** appear only once the sky is fully night. Updated and Daily fade in sooner, then hold a quieter peak. Classic keeps today's fade to the full-white field. The day sky has none
- **Clouds** in Updated and Daily ease from the day whisper to a quieter night dim once the sky is fully night. Classic keeps full opacity. The day sky does not use the night dim
- The **Level** gold wash in Updated and Daily eases from the day breath to a quieter peak once the sky is fully night. Classic never draws the wash. Reduced motion suppresses it. The gold puff at the score stays on the number in Updated and Daily. Classic never emits it
- The **Sim clock** advances **Score**, **Speed**, spawn timing, and jump physics once per 60Hz slice in Classic and in Updated/Daily. A faster display does not add slices. **DifficultyProfile** and the **Run seed** do not read the clock

## Flagged Ambiguities

- **"speed cap"** appears in code as `SPEED_CAP` (kept for the particle-trail threshold) but is distinct from **plateau** — `SPEED_CAP` is a hard ceiling for particle effects, while **plateau** is the soft ceiling the difficulty curve targets. Prefer **plateau** in domain discussion; reserve "speed cap" for talking about the particle threshold specifically.
- **"gap"** is overloaded: it can mean the on-screen pixel distance between obstacles (a rendering concept) or `nextSpawnGap` (the trigger threshold). Always qualify: **spawn gap** for the game-logic threshold.
