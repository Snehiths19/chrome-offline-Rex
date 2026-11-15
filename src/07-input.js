// == SECTION 7: INPUT HANDLERS ==

function handleAction() {
  audio.ensure(); // unlock AudioContext on first user gesture (Chrome autoplay policy)
  if (game.state === STATE.IDLE) {
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

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    handleAction();
  } else {
    handleDebugKey(event);
  }
});

canvas.addEventListener('click', handleAction);

canvas.addEventListener(
  'touchstart',
  (event) => {
    event.preventDefault();
    handleAction();
  },
  { passive: false }
);

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      handleAction();
    },
    { passive: false }
  );
  jumpBtn.addEventListener('click', handleAction);
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
