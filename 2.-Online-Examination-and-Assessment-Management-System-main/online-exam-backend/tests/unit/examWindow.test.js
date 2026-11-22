const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getExamPhase,
  computeDeadline,
  isBeforeDeadline,
  remainingSeconds,
  resultVisibility,
} = require('../../src/utils/examWindow');

const exam = {
  startTime: new Date('2026-11-20T10:00:00Z'),
  endTime: new Date('2026-11-20T12:00:00Z'),
};

describe('getExamPhase', () => {
  it('is upcoming before the start time', () => {
    assert.equal(getExamPhase(exam, new Date('2026-11-20T09:59:59Z')), 'upcoming');
  });
  it('is live from the start time (inclusive)', () => {
    assert.equal(getExamPhase(exam, new Date('2026-11-20T10:00:00Z')), 'live');
  });
  it('is closed from the end time (inclusive)', () => {
    assert.equal(getExamPhase(exam, new Date('2026-11-20T12:00:00Z')), 'closed');
  });
});

describe('computeDeadline', () => {
  it('is start + duration when that fits inside the window', () => {
    const deadline = computeDeadline(new Date('2026-11-20T10:05:00Z'), 30, exam.endTime);
    assert.equal(deadline.toISOString(), '2026-11-20T10:35:00.000Z');
  });
  it('is capped at the window end for a late starter', () => {
    const deadline = computeDeadline(new Date('2026-11-20T11:50:00Z'), 30, exam.endTime);
    assert.equal(deadline.toISOString(), '2026-11-20T12:00:00.000Z');
  });
});

describe('isBeforeDeadline', () => {
  const deadline = new Date('2026-11-20T10:35:00Z');
  it('accepts a save exactly at the deadline', () => {
    assert.equal(isBeforeDeadline(deadline, new Date('2026-11-20T10:35:00Z'), 0), true);
  });
  it('rejects a save one second late without grace', () => {
    assert.equal(isBeforeDeadline(deadline, new Date('2026-11-20T10:35:01Z'), 0), false);
  });
  it('accepts a late save inside the grace period', () => {
    assert.equal(isBeforeDeadline(deadline, new Date('2026-11-20T10:35:20Z'), 30), true);
  });
  it('rejects a save after the grace period', () => {
    assert.equal(isBeforeDeadline(deadline, new Date('2026-11-20T10:35:31Z'), 30), false);
  });
});

describe('remainingSeconds', () => {
  it('never returns a negative number', () => {
    assert.equal(remainingSeconds(new Date('2026-11-20T10:00:00Z'), new Date('2026-11-20T10:01:00Z')), 0);
  });
  it('floors to whole seconds', () => {
    assert.equal(remainingSeconds(new Date('2026-11-20T10:00:10.900Z'), new Date('2026-11-20T10:00:00Z')), 10);
  });
});

describe('resultVisibility', () => {
  const during = new Date('2026-11-20T11:00:00Z');
  const after = new Date('2026-11-20T12:30:00Z');

  it('hides everything for manual release until faculty publish', () => {
    assert.deepEqual(resultVisibility({ ...exam, resultRelease: 'manual', resultsPublished: false }, after), {
      score: false,
      breakdown: false,
    });
  });
  it('shows score but not the per-question breakdown during the window for immediate release', () => {
    assert.deepEqual(resultVisibility({ ...exam, resultRelease: 'immediate', resultsPublished: false }, during), {
      score: true,
      breakdown: false,
    });
  });
  it('shows the breakdown once the window has closed', () => {
    assert.deepEqual(resultVisibility({ ...exam, resultRelease: 'manual', resultsPublished: true }, after), {
      score: true,
      breakdown: true,
    });
  });
});
