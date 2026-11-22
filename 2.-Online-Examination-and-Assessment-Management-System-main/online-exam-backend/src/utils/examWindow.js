/**
 * Pure time rules for examinations. No database access, so they are unit-tested
 * directly (tests/unit/examWindow.test.js). The server clock is the only clock
 * that matters; the client's timer is only a display.
 */
const { EXAM_PHASE, RESULT_RELEASE } = require('../constants');

const toDate = (value) => (value instanceof Date ? value : new Date(value));

/** upcoming: before startTime | live: startTime <= now < endTime | closed: now >= endTime */
function getExamPhase(exam, now = new Date()) {
  const t = toDate(now).getTime();
  if (t < toDate(exam.startTime).getTime()) return EXAM_PHASE.UPCOMING;
  if (t >= toDate(exam.endTime).getTime()) return EXAM_PHASE.CLOSED;
  return EXAM_PHASE.LIVE;
}

/**
 * A student's personal deadline: startedAt + duration, but never later than the
 * exam window's end. A student who starts 10 minutes before the window closes
 * gets 10 minutes, not the full duration.
 */
function computeDeadline(startedAt, durationMinutes, examEndTime) {
  const byDuration = toDate(startedAt).getTime() + durationMinutes * 60 * 1000;
  return new Date(Math.min(byDuration, toDate(examEndTime).getTime()));
}

/** True while answers may still be saved. graceSeconds absorbs network latency. */
function isBeforeDeadline(deadline, now = new Date(), graceSeconds = 0) {
  return toDate(now).getTime() <= toDate(deadline).getTime() + graceSeconds * 1000;
}

function remainingSeconds(deadline, now = new Date()) {
  return Math.max(0, Math.floor((toDate(deadline).getTime() - toDate(now).getTime()) / 1000));
}

/**
 * What a student may see about their own result.
 * - score: total marks, visible if release is immediate or faculty published results.
 * - breakdown: per-question correct/incorrect, only after the exam window closes,
 *   so early finishers cannot pass on which answers were right to students still writing.
 * The answer key itself is never shown to students.
 */
function resultVisibility(exam, now = new Date()) {
  const score = exam.resultRelease === RESULT_RELEASE.IMMEDIATE || exam.resultsPublished === true;
  const breakdown = score && getExamPhase(exam, now) === EXAM_PHASE.CLOSED;
  return { score, breakdown };
}

module.exports = {
  getExamPhase,
  computeDeadline,
  isBeforeDeadline,
  remainingSeconds,
  resultVisibility,
};
