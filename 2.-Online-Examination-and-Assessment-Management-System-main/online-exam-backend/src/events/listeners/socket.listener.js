/**
 * Turns application events into Socket.IO messages for connected clients.
 * If Socket.IO is not running (e.g. in integration tests) these are no-ops.
 */
const { getIO } = require('../../sockets/io');
const EVENTS = require('../eventNames');
const { ROOMS } = require('../../constants');

function registerSocketListeners(bus) {
  // Students assigned to a newly published exam are told it is available.
  bus.on(EVENTS.EXAM_PUBLISHED, ({ exam, audience }) => {
    const io = getIO();
    if (!io) return;
    const rooms = [
      ...audience.sectionIds.map((id) => ROOMS.section(id)),
      ...audience.studentIds.map((id) => ROOMS.user(id)),
    ];
    if (rooms.length === 0) return;
    io.to(rooms).emit('exam:published', {
      examId: String(exam._id),
      title: exam.title,
      startTime: exam.startTime,
      endTime: exam.endTime,
      durationMinutes: exam.durationMinutes,
    });
  });

  // Live monitoring: faculty watching this exam see a new active attempt.
  bus.on(EVENTS.ATTEMPT_STARTED, ({ attempt, exam, studentProfile }) => {
    const io = getIO();
    if (!io) return;
    io.to(ROOMS.examMonitor(exam._id)).emit('attempt:started', {
      examId: String(exam._id),
      attemptId: String(attempt._id),
      student: studentProfile,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      totalQuestions: attempt.questions.length,
    });
  });

  // Live monitoring: progress (number answered), never the answers themselves.
  bus.on(EVENTS.ATTEMPT_PROGRESS, ({ examId, attemptId, studentId, answeredCount, totalQuestions }) => {
    const io = getIO();
    if (!io) return;
    io.to(ROOMS.examMonitor(examId)).emit('attempt:progress', {
      examId: String(examId),
      attemptId: String(attemptId),
      studentId: String(studentId),
      answeredCount,
      totalQuestions,
    });
  });

  // Submission (manual or automatic): tell the monitors and the student.
  bus.on(EVENTS.ATTEMPT_SUBMITTED, ({ attempt, auto, reason }) => {
    const io = getIO();
    if (!io) return;
    const payload = {
      examId: String(attempt.exam),
      attemptId: String(attempt._id),
      studentId: String(attempt.student),
      status: attempt.status,
      auto,
      reason,
      submittedAt: attempt.submittedAt,
    };
    io.to(ROOMS.examMonitor(attempt.exam)).emit('attempt:submitted', payload);
    io.to(ROOMS.user(attempt.student)).emit('attempt:submitted', payload);
  });

  // Students who attempted the exam are told results are out.
  bus.on(EVENTS.RESULTS_PUBLISHED, ({ exam, studentIds }) => {
    const io = getIO();
    if (!io || studentIds.length === 0) return;
    io.to(studentIds.map((id) => ROOMS.user(id))).emit('results:published', {
      examId: String(exam._id),
      title: exam.title,
      publishedAt: exam.resultsPublishedAt,
    });
  });
}

module.exports = registerSocketListeners;
