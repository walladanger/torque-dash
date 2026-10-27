const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../util/util');

test('util.renameKeys', async (t) => {
  await t.test('renames mapped keys', () => {
    const obj = { a: 1, b: 2 };
    const keysMap = { a: 'A' };
    const result = util.renameKeys(keysMap, obj);
    assert.deepEqual(result, { A: 1, b: 2 });
  });

  await t.test('keeps unmapped keys and their values', () => {
    const obj = { x: 10, y: 20 };
    const keysMap = {};
    const result = util.renameKeys(keysMap, obj);
    assert.deepEqual(result, { x: 10, y: 20 });
  });

  await t.test('does not mutate the input object', () => {
    const obj = { a: 1 };
    const keysMap = { a: 'A' };
    util.renameKeys(keysMap, obj);
    assert.deepEqual(obj, { a: 1 });
  });

  await t.test('handles an empty object', () => {
    const obj = {};
    const keysMap = { a: 'A' };
    const result = util.renameKeys(keysMap, obj);
    assert.deepEqual(result, {});
  });

  await t.test('handles an empty keysMap', () => {
    const obj = { a: 1 };
    const keysMap = {};
    const result = util.renameKeys(keysMap, obj);
    assert.deepEqual(result, { a: 1 });
  });

  await t.test('later key wins when two keys map to the same name (per reduce order)', () => {
    // If two original keys map to the same new key, the one appearing later in Object.keys(obj) will overwrite the earlier one in the result.
    const obj = { a: 1, b: 2 };
    const keysMap = { a: 'same', b: 'same' };
    const result = util.renameKeys(keysMap, obj);
    // Object.keys(obj) returns ['a', 'b'].
    // Reduce processes 'a': acc is { same: 1 }
    // Reduce processes 'b': acc is { same: 1, same: 2 } => { same: 2 }
    assert.deepEqual(result, { same: 2 });
  });
});
