// Finds every GAME_CONFIG key script.js reads through cfg(), for the tests
// that must cover all of them (TUNABLE_KEYS in tests/unit/shell.test.js and
// the determinism replay in tests/replay.test.js). Node only.
//
// A key reaches cfg() three ways:
//   cfg('KEY')                       a literal call
//   helper('KEY', ...)               a helper whose body calls cfg(<its first
//                                    parameter>), e.g. tunedUnitAlpha
//   const key = a ? 'KEY_A' : 'KEY_B'; helper(key, ...)
//                                    a key picked just before a helper call

function cfgKeysInSource(src) {
  const helpers = [...src.matchAll(/function (\w+)\((\w+)[^)]*\)\s*\{[^}]*?\bcfg\(\2\)/g)].map(
    (m) => m[1]
  );
  const callers = ['cfg', ...helpers].join('|');
  const literal = [...src.matchAll(new RegExp(`\\b(?:${callers})\\(\\s*'([A-Z0-9_]+)'`, 'g'))].map(
    (m) => m[1]
  );
  const picked = [...src.matchAll(/const key =[^;]*;/g)].flatMap((m) =>
    [...m[0].matchAll(/'([A-Z0-9_]+)'/g)].map((k) => k[1])
  );
  return [...new Set([...literal, ...picked])].sort();
}

module.exports = { cfgKeysInSource };
