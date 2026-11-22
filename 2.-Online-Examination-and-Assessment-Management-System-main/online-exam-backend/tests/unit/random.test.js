const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shuffle, sample } = require('../../src/utils/random');

describe('shuffle', () => {
  it('returns a permutation and does not modify the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const output = shuffle(input);
    assert.deepEqual(input, copy);
    assert.equal(output.length, input.length);
    assert.deepEqual([...output].sort((a, b) => a - b), copy);
  });

  it('is deterministic with an injected random function', () => {
    const alwaysZero = () => 0;
    // With j always 0, Fisher-Yates rotates the array left by one.
    assert.deepEqual(shuffle([1, 2, 3, 4], alwaysZero), [2, 3, 4, 1]);
  });

  it('produces different orders across many runs (sanity check of crypto.randomInt)', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i += 1) seen.add(shuffle([1, 2, 3, 4, 5]).join(','));
    assert.ok(seen.size > 1);
  });
});

describe('sample', () => {
  it('returns the requested number of distinct items', () => {
    const picked = sample(['a', 'b', 'c', 'd', 'e', 'f'], 4);
    assert.equal(picked.length, 4);
    assert.equal(new Set(picked).size, 4);
  });

  it('returns all items when count >= length', () => {
    assert.equal(sample(['a', 'b'], 5).length, 2);
  });
});
