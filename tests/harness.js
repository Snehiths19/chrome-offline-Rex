// Shared test harness (C6, #121).
//
// Loads script.js once (Node) and defines the custom describe/it/assert
// harness and the Node/browser helpers every area file in tests/unit/ uses.
// Node: tests/unit.test.js requires this, then each area file in the order
// tests/unit/files.js gives. Browser: tests/test-runner.html loads this as a
// classic script after script.js, then the same files in the same order.
// Each area file starts with beginTestFile('<area>') so the summary can say
// how each file did.

if (typeof window === 'undefined') {
  require('../script.js');
}

// --- Test Utilities ---
let testsRun = 0;
let testsPassed = 0;
// Per-file counts, in load order: { name, run, passed }.
const testFiles = [];
let currentTestFile = null;

function beginTestFile(name) {
  currentTestFile = { name, run: 0, passed: 0 };
  testFiles.push(currentTestFile);
}

function describe(description, testFn) {
  console.group(description);
  testFn();
  console.groupEnd();
}

function it(description, testFn) {
  testsRun++;
  // Captured now: an async test may finish after the next file has begun.
  const file = currentTestFile;
  if (file) file.run++;

  const pass = () => {
    console.log(`%cPASSED: ${description}`, 'color: green;');
    testsPassed++;
    if (file) file.passed++;
  };

  const fail = (error) => {
    console.error(`%cFAILED: ${description}`, 'color: red;', error && error.message);
    if (error && error.stack) {
      console.error(error.stack);
    }
  };

  const handle = (maybePromise) => {
    if (maybePromise && typeof maybePromise.then === 'function') {
      // Promise returned
      maybePromise.then(pass).catch(fail);
    } else if (testFn.length === 0) {
      // Synchronous test completed
      pass();
    }
    // If testFn expected a callback, pass/fail will be handled when it calls done
  };

  try {
    if (testFn.length > 0) {
      // Asynchronous test using callback
      const done = (err) => (err ? fail(err) : pass());
      const maybePromise = testFn(done);
      handle(maybePromise);
    } else {
      const maybePromise = testFn();
      handle(maybePromise);
    }
  } catch (error) {
    fail(error);
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual, expected, message = `Expected ${expected} but got ${actual}`) {
  if (actual !== expected) {
    throw new Error(message);
  }
}

function assertNotEquals(actual, unexpected, message = `Expected value not to be ${unexpected}`) {
  if (actual === unexpected) {
    throw new Error(message);
  }
}

// --- Browser and Node environment helpers ---
// The suite runs under Node (npm test) and in a real browser
// (tests/test-runner.html). These helpers hide the few places where the two
// differ, so a test reads the same in both.

// The global object: `global` in Node, `window` in a browser.
const testGlobal = typeof globalThis !== 'undefined' ? globalThis : global;
const IN_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

// The game reads QA flags from `location.search`. Node has no location, so
// there a plain { search } object stands in. A browser's location cannot be
// replaced, so there the query is swapped with history.replaceState, which
// changes location.search without reloading the page.
function setPageQuery(search) {
  if (IN_NODE) {
    testGlobal.location = { search };
    return;
  }
  const query = search && search.charAt(0) !== '?' ? '?' + search : search || '';
  const loc = window.location;
  window.history.replaceState(window.history.state, '', loc.pathname + query + loc.hash);
}

// Snapshot the page query; the returned function puts it back.
function savePageQuery() {
  if (IN_NODE) {
    const had = Object.prototype.hasOwnProperty.call(testGlobal, 'location');
    const prev = testGlobal.location;
    return () => {
      if (had) testGlobal.location = prev;
      else delete testGlobal.location;
    };
  }
  const prevSearch = window.location.search;
  return () => setPageQuery(prevSearch);
}

// A browser element's style is a getter, so `btn.style = { display: 'none' }`
// is ignored there. Shadow it with a plain object instead (Node's stub nodes
// take the same path); restoreElementStyle puts the saved style back.
function stubElementStyle(el, style) {
  Object.defineProperty(el, 'style', { configurable: true, writable: true, value: style });
}

function restoreElementStyle(el, saved) {
  delete el.style;
  if (saved !== undefined && el.style !== saved) el.style = saved;
}

// A browser refuses a plain object assigned to document.body or
// document.documentElement (they are getters on Document.prototype). Shadow the
// getter with an own property instead; the returned function deletes it, which
// brings back the real node. Node's stub document takes the same path.
function overrideDocumentProp(name, value) {
  const prev = Object.getOwnPropertyDescriptor(document, name);
  Object.defineProperty(document, name, { configurable: true, writable: true, value });
  return () => {
    delete document[name];
    if (prev) Object.defineProperty(document, name, prev);
  };
}

// A browser's window.localStorage is a getter, so assigning a fake to it is
// ignored there. Shadow it with an own property instead; the returned function
// puts the real one back. Node's global takes the same path.
function overrideGlobalProp(name, value) {
  const prev = Object.getOwnPropertyDescriptor(testGlobal, name);
  Object.defineProperty(testGlobal, name, { configurable: true, writable: true, value });
  return () => {
    delete testGlobal[name];
    if (prev) Object.defineProperty(testGlobal, name, prev);
  };
}

// --- Mocking and Setup ---
// The game script (script.js) is loaded by test-runner.html before this script
// (in browsers) or via require() above (in Node). Tests drive the game loop
// manually and inspect state through the `game` object.

// Prevent game from auto-starting if it did so on image load.
if (typeof cancelAnimationFrame === 'function' && game && game.animationFrameId) {
  cancelAnimationFrame(game.animationFrameId);
}
game.state = STATE.DEAD; // keep loop halted until tests explicitly advance state

// --- Test Summary ---
// One line per area file, then the totals. Callers schedule it after the last
// file has loaded, with a short delay so async tests have time to finish.
function printSummary() {
  console.log(`\n--- Test Summary ---`);
  for (const f of testFiles) {
    const mark = f.passed === f.run ? 'ok  ' : 'FAIL';
    console.log(`${mark} ${f.name.padEnd(10)} ${f.passed}/${f.run}`);
  }
  // An area file that never began (it failed to load, or threw before its
  // first line) would otherwise just be missing from a green summary.
  const expected = typeof UNIT_TEST_FILES !== 'undefined' ? UNIT_TEST_FILES : [];
  const missing = expected.filter((name) => !testFiles.some((f) => f.name === name));
  for (const name of missing) console.log(`%cMISSING ${name}: the file did not run`, 'color: red;');
  console.log(`Total tests: ${testsRun}`);
  console.log(`%cPassed: ${testsPassed}`, 'color: green;');
  const failed = testsRun - testsPassed;
  if (failed > 0 || missing.length > 0) {
    console.log(`%cFailed: ${failed}`, 'color: red;');
    if (typeof process !== 'undefined' && process.exit) process.exitCode = 1;
  } else {
    console.log('All tests passed!');
  }
  console.log(`--------------------`);
}

// Node: each area file is its own module, so hand it the harness by name.
// A browser already shares these as globals of the classic scripts.
if (IN_NODE) {
  Object.assign(testGlobal, {
    beginTestFile,
    describe,
    it,
    assert,
    assertEquals,
    assertNotEquals,
    testGlobal,
    IN_NODE,
    setPageQuery,
    savePageQuery,
    stubElementStyle,
    restoreElementStyle,
    overrideDocumentProp,
    overrideGlobalProp,
  });
  module.exports = { printSummary, testFiles };
}
