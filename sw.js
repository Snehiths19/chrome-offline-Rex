// Service worker: makes the game installable and playable offline.
//
// Cache-first over a precached app shell. The cache name carries the commit
// SHA (pages.yml rewrites __VERSION__ on deploy), so every deploy changes this
// file's bytes, the browser installs the new worker, and `activate` deletes
// the previous deploy's cache. The new version shows on the next launch; we
// never reload a page mid-run (Flow pillar).
//
// Locally (`npm run serve`) __VERSION__ stays literal and edits never change
// this file, so cache-first would hide them. An undeployed build therefore
// goes network-first and only falls back to the cache when offline.

const CACHE_VERSION = '__VERSION__';
const CACHE_NAME = 'rex-run-' + CACHE_VERSION;
// Split so pages.yml's sed does not rewrite this sentinel too.
const IS_DEPLOYED = CACHE_VERSION !== '__VER' + 'SION__';

// Every file the game needs to boot with the network off. Paths are relative
// to this file so the same list works at / locally and at /chrome-offline-Rex/
// on GitHub Pages. Keep in sync with index.html and the sprite loads in
// script.js Section 3 (tests/game.test.js checks this).
const PRECACHE_URLS = [
  './',
  'index.html',
  'script.js',
  'style.css',
  'manifest.webmanifest',
  'assets/cactus.png',
  'assets/dino-lose.png',
  'assets/dino-run-0.png',
  'assets/dino-run-1.png',
  'assets/dino-stationary.png',
  'assets/ground.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // cache: 'reload' skips the HTTP cache so a deploy never precaches a
      // stale copy that GitHub Pages' max-age left in the browser.
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('rex-run-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // ignoreSearch: index.html asks for script.js?v=<sha> and style.css?v=<sha>,
  // and a launch may carry ?qaHz=1 or similar flags.
  const fromCache = () =>
    caches.match(request, { ignoreSearch: true, cacheName: CACHE_NAME }).then((cached) => {
      if (cached) return cached;
      // Offline and not precached: an app launch still gets the shell.
      if (request.mode === 'navigate') return caches.match('./', { cacheName: CACHE_NAME });
      return Response.error();
    });

  if (!IS_DEPLOYED) {
    // no-cache revalidates with the dev server, so a plain reload shows edits.
    event.respondWith(fetch(request.url, { cache: 'no-cache' }).catch(fromCache));
    return;
  }
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true, cacheName: CACHE_NAME })
      .then((cached) => cached || fetch(request).catch(fromCache))
  );
});
