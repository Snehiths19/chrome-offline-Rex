// Runs every unit-test area file under Node: the shared harness (which loads
// the game files once), then tests/unit/<area>.test.js in the order
// tests/unit/files.js gives, then one summary with a line per file.
// The same files run in a real browser from tests/test-runner.html.

const { printSummary } = require('./harness.js');
const UNIT_TEST_FILES = require('./unit/files.js');
testGlobal.UNIT_TEST_FILES = UNIT_TEST_FILES; // so printSummary can spot a missing file

for (const name of UNIT_TEST_FILES) require(`./unit/${name}.test.js`);

// A short wait so async tests have time to finish before the count.
setTimeout(printSummary, 500);
