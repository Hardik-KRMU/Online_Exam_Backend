/**
 * Randomization used for per-attempt question selection and option shuffling.
 * crypto.randomInt is used (not Math.random) so the order cannot be predicted.
 * The random function is injectable so unit tests can make results deterministic.
 */
const crypto = require('crypto');

/** Fisher-Yates shuffle. Returns a new array; the input is not modified. */
function shuffle(items, randomInt = crypto.randomInt) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1); // 0 <= j <= i
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` distinct items at random. */
function sample(items, count, randomInt = crypto.randomInt) {
  if (count >= items.length) return shuffle(items, randomInt);
  return shuffle(items, randomInt).slice(0, count);
}

module.exports = { shuffle, sample };
