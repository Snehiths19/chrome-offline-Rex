// == SECTION 3: ASSET LOADING ==

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
if (typeof process === 'undefined') {
  window.addEventListener('resize', handleResize);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', handleResize);
  }
}
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
  // Sim frames left on a jump pressed in the air (see JUMP_BUFFER_FRAMES).
  jumpBufferFrames: 0,
  // Variable jump and fast fall (F3). jumpHeld is whether the jump input is
  // still down (the input handlers set and clear it); dropping is true from a
  // fast-fall press until landing.
  jumpHeld: false,
  dropping: false,
  // Squash and stretch (M1): sim frames left on the landing squash, and
  // whether that landing ended a fast fall. Visual only.
  landSquashFrames: 0,
  landSquashHard: false,
  // Second jump (M3): spent for this flight, and sim frames left on the flip.
  doubleJumped: false,
  flipFrames: 0,
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
// The game starts once both the sprites and every game file are ready. A
// browser can fire an image's onload, or the timeout below, between two game
// files, before the later files' functions exist, so the sprites alone must
// not start it. src/09-init.js marks the files ready at the end of the load.
const bootGate = { assets: false, files: false, started: false };
const totalImages = 6;

function imageReady(img) {
  return img && img.complete && img.naturalWidth !== 0;
}

// Horizontal padding on #game-wrapper in style.css. The browser path reads
// computed padding when it can; this is the reserve used when that read is
// empty (Node, or before layout). Keep it in sync with that padding.
const SHELL_GUTTER_X = 8;

// Vertical chrome the canvas must clear. The row matches #game-wrapper
// padding-top: 6px top offset + 44px touch targets + 6px gap. Jump and share match their margin plus used height in Chrome
// (12+53 and 10+38), reserved even while share is hidden so a Daily result
// does not push the stack under the home indicator. Keep them in sync with
// style.css.
const SHELL_CHROME_ROW = 56;
const SHELL_JUMP_BLOCK = 65;
const SHELL_SHARE_BLOCK = 48;

// CSS width of the canvas inside the padded shell. Floors so a fractional
// inset cannot round the bitmap up into the padding and clip. A non-positive
// result becomes 1 so the canvas stays drawable. Logical CANVAS_W/H are not
// involved — this is display size only.
function computeCanvasCssWidth(viewportWidth, horizontalInset) {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width) || width <= 0) return 1;
  const inset = Number(horizontalInset);
  const used = Number.isFinite(inset) && inset > 0 ? inset : 0;
  const available = Math.floor(width - used);
  return available >= 1 ? available : 1;
}

function readPaddingPx(el, side) {
  if (!el) return 0;
  let raw = '';
  const reader =
    window && typeof window.getComputedStyle === 'function' ? window.getComputedStyle : null;
  if (reader) {
    let cs = null;
    try {
      cs = reader(el);
    } catch {
      cs = null;
    }
    if (cs) raw = cs['padding' + side] || '';
  }
  if (!raw && el.style) raw = el.style['padding' + side] || '';
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Prefer the wrapper's laid-out content box. clientWidth already sits inside
// body safe-area padding, so only the wrapper's own horizontal padding comes
// off. When the wrapper has not been laid out, subtract body safe-area (if
// readable) plus the shell gutter from the viewport width.
function measureCanvasCssWidth(wrapper, viewportWidth) {
  if (wrapper && typeof wrapper.clientWidth === 'number' && wrapper.clientWidth > 0) {
    const pad = readPaddingPx(wrapper, 'Left') + readPaddingPx(wrapper, 'Right');
    const gutter = pad > 0 ? pad : SHELL_GUTTER_X * 2;
    return computeCanvasCssWidth(wrapper.clientWidth, gutter);
  }
  const body = typeof document !== 'undefined' ? document.body : null;
  const bodyPad = readPaddingPx(body, 'Left') + readPaddingPx(body, 'Right');
  return computeCanvasCssWidth(viewportWidth, bodyPad + SHELL_GUTTER_X * 2);
}

// Height available to the canvas after safe-area and the shell controls.
// A non-positive viewport means "no height cap" so a width-only call stays
// width-first.
function computeCanvasMaxHeight(viewportHeight, verticalChrome) {
  const height = Number(viewportHeight);
  if (!Number.isFinite(height) || height <= 0) return 0;
  const chrome = Number(verticalChrome);
  const used = Number.isFinite(chrome) && chrome > 0 ? chrome : 0;
  const available = Math.floor(height - used);
  return available >= 1 ? available : 1;
}

// Fit a 3:1 display size inside both limits. Width-first when the height
// has room. When the height is the limit, shrink the width too so the
// canvas letterboxes instead of running under jump and share.
function fitCanvasCssSize(maxWidth, maxHeight) {
  const cssWFromWidth = computeCanvasCssWidth(maxWidth, 0);
  let cssW = cssWFromWidth;
  let cssH = Math.max(1, Math.round(cssW / 3));
  const cap = Number(maxHeight);
  if (Number.isFinite(cap) && cap >= 1 && cssH > cap) {
    cssH = Math.floor(cap);
    if (cssH < 1) cssH = 1;
    cssW = cssH * 3;
    if (cssW > cssWFromWidth) {
      cssW = cssWFromWidth;
      cssH = Math.max(1, Math.round(cssW / 3));
    }
  }
  return { cssW: cssW, cssH: cssH };
}

function readViewportHeight() {
  const vv = window.visualViewport;
  if (vv && typeof vv.height === 'number' && vv.height > 0) return vv.height;
  if (typeof window.innerHeight === 'number' && window.innerHeight > 0) return window.innerHeight;
  return 0;
}

function shellVerticalChrome(wrapper) {
  const body = typeof document !== 'undefined' ? document.body : null;
  const safeY = readPaddingPx(body, 'Top') + readPaddingPx(body, 'Bottom');
  const row = wrapper ? readPaddingPx(wrapper, 'Top') : 0;
  const chromeRow = row > 0 ? row : SHELL_CHROME_ROW;
  return safeY + chromeRow + SHELL_JUMP_BLOCK + SHELL_SHARE_BLOCK;
}

function measureCanvasCssSize(wrapper, viewportWidth, viewportHeight) {
  const maxW = measureCanvasCssWidth(wrapper, viewportWidth);
  const maxH = computeCanvasMaxHeight(viewportHeight, shellVerticalChrome(wrapper));
  return fitCanvasCssSize(maxW, maxH);
}

// On-screen CSS px per logical canvas px (600 logical px wide). Below 1 on
// a phone, where small canvas labels would shrink below readable; labelPx()
// in src/05-rendering.js reads it.
let canvasCssScale = 1;

function initCanvasScale() {
  applyQaSafeShell();
  const dpr = window.devicePixelRatio || 1;
  const wrapper = document.getElementById('game-wrapper');
  const size = measureCanvasCssSize(wrapper, window.innerWidth, readViewportHeight());
  const cssW = size.cssW;
  const cssH = size.cssH;
  canvasCssScale = cssW / GAME_CONFIG.CANVAS_W;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(canvas.width / 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(canvas.width / GAME_CONFIG.CANVAS_W, canvas.height / GAME_CONFIG.CANVAS_H);
}

initCanvasScale();

// One-time "turn sideways" hint for portrait phones (S2). Shown under the
// canvas on the start screen until the player starts a run or turns the
// phone to landscape, then never again (dino-rotate-hint-seen). It is page
// text at the edge of play, never drawn on the canvas or shown mid-run.
const ROTATE_HINT_KEY = 'dino-rotate-hint-seen';
const PORTRAIT_TOUCH_QUERY = '(hover: none) and (pointer: coarse) and (orientation: portrait)';
const LANDSCAPE_TOUCH_QUERY = '(hover: none) and (pointer: coarse) and (orientation: landscape)';

function mediaMatches(query) {
  return !!(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

function rotateHintSeen() {
  return safeStorage.get(ROTATE_HINT_KEY, '0') === '1';
}

function refreshRotateHint() {
  const el = document.getElementById('rotate-hint');
  if (!el) return;
  el.hidden = rotateHintSeen() || !mediaMatches(PORTRAIT_TOUCH_QUERY);
}

function markRotateHintSeen() {
  if (!rotateHintSeen()) safeStorage.set(ROTATE_HINT_KEY, '1');
  refreshRotateHint();
}

refreshRotateHint();

// A resize can fire while later game files are still loading, before `game`
// exists, so only repaint once every file is in (bootGate.files).
function handleResize() {
  initCanvasScale();
  if (mediaMatches(LANDSCAPE_TOUCH_QUERY)) markRotateHintSeen();
  else refreshRotateHint();
  if (bootGate.files && game.state === STATE.DEAD) drawGameOverScreen();
}

function bootWhenReady(part) {
  bootGate[part] = true;
  if (!bootGate.assets || !bootGate.files || bootGate.started) return;
  bootGate.started = true;
  dino.y = GAME_CONFIG.CANVAS_H - dino.height;
  initClouds();
  initHills();
  drawDino();
  game.state = STATE.IDLE;
  gameLoop();
}

function onImageLoad() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) bootWhenReady('assets');
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
    if (!bootGate.assets) {
      console.warn('Asset load timeout — starting with whatever is available.');
      bootWhenReady('assets');
    }
  }, GAME_CONFIG.ASSET_LOAD_TIMEOUT_MS);
}
