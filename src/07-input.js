// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.IDLE) {
    markRotateHintSeen(); // the portrait hint is for the start screen only
    game.state = STATE.WAITING;
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
    dino.jumpHeld = true; // until the key, button or finger lets go (F3)
    jump();
  } else if (game.state === STATE.DEAD) {
    const countFrames = deathAnimFrames();
    if (Animations.deathAnimFrame < countFrames) {
      Animations.deathAnimFrame = countFrames;
      drawGameOverScreen();
    } else {
      cancelAnimationFrame(game.animationFrameId);
      resetGame();
      gameLoop();
    }
  }
}

// Space on a focused button or link belongs to that control (A2): the
// browser presses it on keyup. Taking it here as well would start or
// restart a run, and preventDefault would cancel the button's own press.
function keyBelongsToFocusedControl(event) {
  if (event.code !== 'Space' && event.code !== 'Enter') return false;
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return false;
  if (!target.closest('button, a, input, select, textarea')) return false;
  // A mouse click or tap also focuses a button in Chrome and Firefox. Only
  // focus the keyboard put there keeps Space; after a click, Space jumps.
  return !focusSource.byPointer;
}

// How the focused control got focus: a pointer press (mouse or touch) just
// before the focus moved, or the keyboard. :focus-visible can't tell, since
// Chrome marks a clicked button keyboard-focused as soon as a key is pressed.
const focusSource = { pointerDown: false, byPointer: false };
function notePointerDown() {
  focusSource.pointerDown = true;
}
function clearPointerDown() {
  focusSource.pointerDown = false;
}
function noteFocusIn() {
  focusSource.byPointer = focusSource.pointerDown;
  focusSource.pointerDown = false;
}
document.addEventListener('mousedown', notePointerDown, true);
document.addEventListener('touchstart', notePointerDown, { capture: true, passive: true });
document.addEventListener('keydown', clearPointerDown, true);
// A press on something already focused moves no focus: its click ends it.
document.addEventListener('click', clearPointerDown, true);
document.addEventListener('focusin', noteFocusIn);

const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const DROP_KEYS = ['ArrowDown', 'KeyS'];

function handleKeyDown(event) {
  if (keyBelongsToFocusedControl(event)) return;
  if (JUMP_KEYS.includes(event.code)) {
    event.preventDefault();
    handleAction();
  } else if (DROP_KEYS.includes(event.code)) {
    event.preventDefault();
    dropDino();
  } else {
    handleDebugKey(event);
  }
}
document.addEventListener('keydown', handleKeyDown);

// Letting go of jump ends the hold (F3): updateRunning then cuts the rise.
function releaseJump() {
  dino.jumpHeld = false;
}
function handleKeyUp(event) {
  if (JUMP_KEYS.includes(event.code)) releaseJump();
}
document.addEventListener('keyup', handleKeyUp);

// The mouse jumps on press, not on click, so how long it is held counts.
function handleMouseDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  handleAction();
}
canvas.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', releaseJump);

// Touch: the hold ends when the last finger lifts, and a swipe down of
// SWIPE_DOWN_CSS_PX or more from where the touch began is a fast fall.
const SWIPE_DOWN_CSS_PX = 30;
const touchSwipe = { startY: null, dropped: false };
function handleSwipeStart(event) {
  const touch = event.touches && event.touches[0];
  if (!touch || event.touches.length > 1) return;
  touchSwipe.startY = touch.clientY;
  touchSwipe.dropped = false;
}
function handleSwipeMove(event) {
  if (!bootGate.files || touchSwipe.startY === null || touchSwipe.dropped) return;
  const touch = event.touches && event.touches[0];
  if (!touch || event.touches.length > 1) return;
  if (touch.clientY - touchSwipe.startY >= SWIPE_DOWN_CSS_PX) {
    touchSwipe.dropped = true;
    dropDino();
  }
}
function handleTouchEnd(event) {
  if (event.touches && event.touches.length > 0) return;
  touchSwipe.startY = null;
  releaseJump();
}
document.addEventListener('touchstart', handleSwipeStart, { passive: true });
document.addEventListener('touchmove', handleSwipeMove, { passive: true });
document.addEventListener('touchend', handleTouchEnd);
document.addEventListener('touchcancel', handleTouchEnd);

// A second finger is a pinch zoom (allowed since A1), not a tap: leave it
// to the browser and don't count it as a jump.
function isMultiTouch(event) {
  return Boolean(event.touches && event.touches.length > 1);
}

function handleTouchAction(event) {
  if (isMultiTouch(event)) return;
  event.preventDefault();
  handleAction();
}

canvas.addEventListener('touchstart', handleTouchAction, { passive: false });

// Tap zone (S2): on a phone, a touch on the empty page below the canvas
// works like tapping the canvas. Buttons (jump, share, the top row) keep
// their own handlers, and the canvas has its own listener above.
function handleTapZone(event) {
  if (!bootGate.files) return;
  if (isMultiTouch(event)) return;
  const target = event.target;
  if (target === canvas) return;
  if (target && typeof target.closest === 'function' && target.closest('button, a, input')) return;
  const touch = event.changedTouches && event.changedTouches[0];
  if (!touch || typeof canvas.getBoundingClientRect !== 'function') return;
  if (touch.clientY < canvas.getBoundingClientRect().bottom) return;
  event.preventDefault();
  handleAction();
}
document.addEventListener('touchstart', handleTapZone, { passive: false });

// The big touch button says what a tap will do now (S3). Text is what the
// button shows; aria is its accessible name. Every label fits the button's
// min-width in style.css, so a change never shifts the layout.
const JUMP_BUTTON_LABELS = Object.freeze({
  [STATE.IDLE]: { text: 'TAP TO START', aria: 'Start' },
  [STATE.WAITING]: { text: 'GET READY', aria: 'Get ready' },
  [STATE.RUNNING]: { text: 'TAP TO JUMP', aria: 'Jump' },
  [STATE.PAUSED]: { text: 'PAUSED', aria: 'Paused' },
  [STATE.DEAD]: { text: 'TAP TO RESTART', aria: 'Restart' },
});

// After a death the countdown can be skipped, so the tap starts the run.
function jumpButtonLabel() {
  if (game.state === STATE.WAITING && game.countdownSkippable) {
    return { text: 'TAP TO START', aria: 'Start' };
  }
  return JUMP_BUTTON_LABELS[game.state] || JUMP_BUTTON_LABELS[STATE.RUNNING];
}

// Called from drawFrame. Writes the page only when the label changes, so a
// run does not touch the DOM every frame.
let lastJumpButtonText = null;
function syncJumpButtonLabel() {
  const btn = document.getElementById('jump-btn');
  if (!btn) return;
  const label = jumpButtonLabel();
  if (label.text === lastJumpButtonText) return;
  lastJumpButtonText = label.text;
  btn.textContent = label.text;
  if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-label', label.aria);
}

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', handleTouchAction, { passive: false });
  // Mouse: jump on press so the hold counts, like the canvas (F3).
  jumpBtn.addEventListener('mousedown', handleMouseDown);
  jumpBtn.addEventListener('click', handleJumpButtonClick);
}

// A click with no pointer behind it (detail 0: Space or Enter on the
// focused button, or a screen reader) is a finished tap: act, then let go.
// A mouse click already acted on mousedown; touch never reaches click.
function handleJumpButtonClick(event) {
  if (event && event.detail > 0) return;
  handleAction();
  releaseJump();
}

// Segmented toggle: two buttons, both always visible, exactly one pressed.
const modeToggle = document.getElementById('mode-toggle');
function refreshModeToggle() {
  if (!modeToggle || !modeToggle.querySelectorAll) return;
  const buttons = modeToggle.querySelectorAll('button');
  buttons.forEach((btn) => {
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
    // A tap while later game files are still loading would reach
    // resetGame() before it exists; the game is not on screen yet anyway.
    if (!bootGate.files) return;
    if (target.dataset.mode === game.mode) return; // already in that mode
    setMode(target.dataset.mode);
    announce(game.mode === MODES.CLASSIC ? 'Classic mode' : 'Updated mode');
  };
  modeToggle.addEventListener('click', onModeTap);
  modeToggle.addEventListener(
    'touchstart',
    (event) => {
      if (event.target && event.target.dataset && event.target.dataset.mode) {
        event.preventDefault();
        event.stopPropagation();
        onModeTap(event);
      }
    },
    { passive: false }
  );
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
  muteBtn.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onMuteTap(event);
    },
    { passive: false }
  );
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

function flashShareCopied(btn) {
  Animations.copyFlashFrames = copyFlashDuration();
  if (!btn) return;
  btn.textContent = '✓ Copied!';
  markShareCopied(btn, true, false);
}

function fallbackCopyDaily(btn, text) {
  // Start the flash before the clipboard call. A sync throw from
  // writeText used to abort this handler, so the label never changed.
  flashShareCopied(btn);
  writeDailyShareClipboard(text);
}

// Share button — shown on death screen during daily challenge only.
// Capable browsers open the system share sheet with the existing text.
// Success flashes Copied. Dismissing the sheet, or a sheet that is
// already open, does not flash and does not copy. A missing API, a sync
// throw, or any other rejection falls back to today's clipboard write.
const shareBtn = document.getElementById('share-btn');
if (shareBtn && shareBtn.addEventListener) {
  const onShareTap = (event) => {
    if (event) event.stopPropagation();
    // ?qaShare=1 never opens the OS sheet. The confirmation is in-page
    // so a capture can see it. Reduced motion quiets that QA paint.
    if (qa.share) {
      // Refresh the on-screen hold so a tap after the first window still
      // survives the next Game Over paint. No sheet, no clipboard.
      if (game.state === STATE.DEAD && isDailyMode()) {
        game.qaShareShown = true;
        game.qaShareHold = qaHoldFrames('share');
      }
      Animations.copyFlashFrames = copyFlashDuration();
      shareBtn.textContent = '✓ Copied!';
      markShareCopied(shareBtn, true, reducedMotion);
      return;
    }
    if (canOfferNativeShare()) {
      const text = dailyShareText();
      let pending;
      try {
        pending = navigator.share({ text });
      } catch {
        fallbackCopyDaily(shareBtn, text);
        return;
      }
      if (!pending || typeof pending.then !== 'function') {
        fallbackCopyDaily(shareBtn, text);
        return;
      }
      return pending
        .then(() => {
          flashShareCopied(shareBtn);
        })
        .catch((err) => {
          if (isShareQuietFailure(err)) return;
          fallbackCopyDaily(shareBtn, text);
        });
    }
    flashShareCopied(shareBtn);
    shareDailyResult();
  };
  shareBtn.addEventListener('click', onShareTap);
  shareBtn.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onShareTap(event);
    },
    { passive: false }
  );
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
    if (!bootGate.files) return; // still loading: resetGame() may not exist yet
    const entering = !isDailyMode();
    if (entering) {
      game.mode = MODES.DAILY;
    } else {
      game.mode = MODES.UPDATED;
      safeStorage.set('dino-mode', MODES.UPDATED);
    }
    refreshDailyButton();
    cancelAnimationFrame(game.animationFrameId);
    resetGame();
    gameLoop();
    announce(
      entering ? `Daily challenge #${dailyNumber()}. ${dailyPreRunLine()}.` : 'Updated mode'
    );
  };
  dailyBtn.addEventListener('click', onDailyTap);
  dailyBtn.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDailyTap(event);
    },
    { passive: false }
  );
  refreshDailyButton();
}

// Resume the AudioContext when the tab becomes visible again. Browsers
// suspend the ctx when the page is hidden; without this, audio dies silently
// on tab-switch even though no error is thrown.
// The same event pauses a run when the page is hidden and starts the resume
// countdown when it is back (F2, pauseRun/resumeRun in src/08-loop.js).
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (bootGate.files) {
      if (document.visibilityState === 'hidden') pauseRun();
      else resumeRun();
    }
    if (
      document.visibilityState === 'visible' &&
      audio.ctx &&
      audio.ctx.state === 'suspended' &&
      typeof audio.ctx.resume === 'function'
    ) {
      audio.ctx.resume().catch(() => {});
    }
  });
}
