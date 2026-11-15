// The unit-test area files, in the order they run. tests/unit.test.js (Node)
// and tests/test-runner.html (browser) both read this list, so a new area
// file only needs adding here.
const UNIT_TEST_FILES = ['physics', 'spawning', 'rendering', 'effects', 'daily', 'shell', 'qa'];
if (typeof module !== 'undefined' && module.exports) module.exports = UNIT_TEST_FILES;
