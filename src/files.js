// The game's source files, in load order (C4, #109).
//
// The game is plain classic scripts with no bundler: index.html loads these
// files with one <script> tag each, in this order, and every file sees the
// top-level names of the files before it, as if they were still one file.
// A file may call a later file's functions from inside a function (everything
// has loaded by the time anything runs), but never at load time.
//
// Node (tests): loadGame() runs the same files, in the same order, in the one
// global scope, the way a browser does. tests/unit/shell.test.js checks that
// index.html, tests/test-runner.html and the sw.js precache list name exactly
// these files in this order.
//
// A new game file goes here, in index.html, in tests/test-runner.html and in
// sw.js PRECACHE_URLS.

const path = require('path');

const GAME_FILES = [
  'src/01-node-stubs.js', // Section 1: Node stubs (browsers skip it)
  'src/02-config.js', // Section 2: configuration, tuning, storage, QA flags, audio
  'src/03-assets.js', // Section 3: canvas, sprites, sizing
  'src/04-state.js', // Section 4: RNG, difficulty, modes, daily, game object
  'src/05-rendering.js', // Section 5: draw functions, particles, feature registry
  'src/06-physics.js', // Section 6: spawning, collision, jump
  'src/07-input.js', // Section 7: keyboard, pointer, buttons
  'src/08-loop.js', // Section 8: state steps, sim clock, game loop
  'src/09-init.js', // Section 9: service worker, tuning panel
  'src/10-test-exposure.js', // Section 10: Node-only globals for tests
];

const ROOT = path.join(__dirname, '..');
const gamePath = (file) => path.join(ROOT, file);

// Runs every game file once, in order, in this process's global scope.
let loaded = false;
function loadGame() {
  if (loaded) return;
  loaded = true;
  const fs = require('fs');
  const vm = require('vm');
  for (const file of GAME_FILES) {
    const full = gamePath(file);
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
  }
}

// All the game's source as one string, for tests that scan the code.
function gameSource() {
  const fs = require('fs');
  return GAME_FILES.map((f) => fs.readFileSync(gamePath(f), 'utf8')).join('\n');
}

module.exports = { GAME_FILES, gamePath, loadGame, gameSource };
