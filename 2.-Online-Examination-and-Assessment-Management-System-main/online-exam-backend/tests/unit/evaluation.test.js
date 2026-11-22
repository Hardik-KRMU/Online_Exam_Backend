const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAttempt } = require('../../src/services/evaluation.service');

const Q1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const Q2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const Q3 = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const questions = [
  { question: Q1, marks: 2 },
  { question: Q2, marks: 1 },
  { question: Q3, marks: 1 },
];
const answerKey = new Map([
  [Q1, 'opt-q1-correct'],
  [Q2, 'opt-q2-correct'],
  [Q3, 'opt-q3-correct'],
]);

describe('evaluateAttempt', () => {
  it('awards full marks for all-correct answers', () => {
    const answers = new Map([
      [Q1, { option: 'opt-q1-correct' }],
      [Q2, { option: 'opt-q2-correct' }],
      [Q3, { option: 'opt-q3-correct' }],
    ]);
    const result = evaluateAttempt({ questions, answers, answerKey, passPercentage: 40 });
    assert.equal(result.score, 4);
    assert.equal(result.maxScore, 4);
    assert.equal(result.percentage, 100);
    assert.equal(result.correctCount, 3);
    assert.equal(result.passed, true);
  });

  it('counts correct, wrong and unattempted separately', () => {
    const answers = { [Q1]: { option: 'opt-q1-correct' }, [Q2]: { option: 'wrong' } }; // plain object works too
    const result = evaluateAttempt({ questions, answers, answerKey });
    assert.equal(result.score, 2);
    assert.equal(result.correctCount, 1);
    assert.equal(result.wrongCount, 1);
    assert.equal(result.unattemptedCount, 1);
    assert.equal(result.breakdown[2].selectedOption, null);
    assert.equal(result.breakdown[2].marksAwarded, 0);
  });

  it('applies negative marking only to wrong answers, not to unattempted ones', () => {
    const answers = new Map([
      [Q1, { option: 'opt-q1-correct' }], // +2
      [Q2, { option: 'wrong' }], // -0.25
    ]); // Q3 unattempted: 0
    const result = evaluateAttempt({
      questions,
      answers,
      answerKey,
      negativeMarking: { enabled: true, fraction: 0.25 },
    });
    assert.equal(result.score, 1.75);
    assert.equal(result.breakdown[1].marksAwarded, -0.25);
    assert.equal(result.breakdown[2].marksAwarded, 0);
  });

  it('never lets the total go below zero', () => {
    const answers = new Map([
      [Q1, { option: 'wrong' }],
      [Q2, { option: 'wrong' }],
      [Q3, { option: 'wrong' }],
    ]);
    const result = evaluateAttempt({
      questions,
      answers,
      answerKey,
      negativeMarking: { enabled: true, fraction: 1 },
    });
    assert.equal(result.score, 0);
    assert.equal(result.percentage, 0);
    assert.equal(result.passed, false);
  });

  it('uses the pass percentage boundary inclusively', () => {
    const answers = new Map([[Q1, { option: 'opt-q1-correct' }]]); // 2/4 = 50%
    assert.equal(evaluateAttempt({ questions, answers, answerKey, passPercentage: 50 }).passed, true);
    assert.equal(evaluateAttempt({ questions, answers, answerKey, passPercentage: 50.01 }).passed, false);
  });

  it('treats an answer to a question missing from the key as incorrect', () => {
    const answers = new Map([[Q1, { option: 'anything' }]]);
    const result = evaluateAttempt({ questions, answers, answerKey: new Map(), passPercentage: 40 });
    assert.equal(result.correctCount, 0);
    assert.equal(result.wrongCount, 1);
  });

  it('ignores negative marking when disabled', () => {
    const answers = new Map([[Q2, { option: 'wrong' }]]);
    const result = evaluateAttempt({
      questions,
      answers,
      answerKey,
      negativeMarking: { enabled: false, fraction: 0.5 },
    });
    assert.equal(result.breakdown[1].marksAwarded, 0);
  });
});
