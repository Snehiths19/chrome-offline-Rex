// == SECTION 9: INITIALISATION ==
// Game starts automatically once all assets fire onImageLoad / onImageError,
// or after ASSET_LOAD_TIMEOUT_MS as a safety net.

// Offline / installable: register sw.js (precaches the app shell, see the
// header of sw.js). Skipped under Node and in browsers without service
// workers or outside a secure context (file://), so the game still boots
// there. `nav`/`win` are parameters so tests can pass fakes. Registration waits for `load` so it never competes with the sprite
// preload for bandwidth on a phone's first visit. Returns whether it tried.
function registerServiceWorker(nav, win) {
  if (!nav || !('serviceWorker' in nav)) return false;
  if (!win || win.isSecureContext === false) return false;
  win.addEventListener('load', () => {
    nav.serviceWorker.register('sw.js').catch(() => {
      // Offline play is a bonus; a failed registration must not break the game.
    });
  });
  return true;
}
if (!isNode)
  registerServiceWorker(typeof navigator !== 'undefined' ? navigator : undefined, window);

// Dev only: ?tune=1 loads tune.js, a panel of sliders for TUNABLE_KEYS that
// writes window.GAME_TUNING live and saves with saveTuning(). Players never
// load it, and it is not precached, so it needs the network. `doc` and
// `search` are parameters so tests can pass fakes. Returns whether it loaded.
function loadTunePanel(doc, search) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return false;
  if (new URLSearchParams(search || '').get('tune') !== '1') return false;
  if (doc.getElementById && doc.getElementById('tune-panel-script')) return false;
  const el = doc.createElement('script');
  el.id = 'tune-panel-script';
  el.src = 'tune.js';
  doc.head.appendChild(el);
  return true;
}
if (!isNode) loadTunePanel(document, location.search);
