/**
 * Turns application events into AuditLog documents.
 * Each handler is wrapped so a failed audit write is logged, never thrown.
 */
const AuditLog = require('../../models/AuditLog');
const EVENTS = require('../eventNames');
const { AUDIT_ACTIONS } = require('../../constants');

function safe(action, buildRecord) {
  return async (payload) => {
    try {
      await AuditLog.create({ action, ...buildRecord(payload) });
    } catch (err) {
      console.error(`[audit] failed to record ${action}: ${err.message}`);
    }
  };
}

function registerAuditListeners(bus) {
  bus.on(
    EVENTS.USER_LOGGED_IN,
    safe(AUDIT_ACTIONS.LOGIN_SUCCESS, ({ user, ip }) => ({
      actor: user._id,
      actorRole: user.role,
      entityType: 'User',
      entityId: user._id,
      ip,
    }))
  );

  bus.on(
    EVENTS.LOGIN_FAILED,
    safe(AUDIT_ACTIONS.LOGIN_FAILED, ({ email, userId, reason, ip }) => ({
      actor: userId || null,
      entityType: 'Auth',
      entityId: userId || null,
      metadata: { email, reason },
      ip,
    }))
  );

  bus.on(
    EVENTS.REFRESH_TOKEN_REUSED,
    safe(AUDIT_ACTIONS.REFRESH_TOKEN_REUSED, ({ userId, family, ip }) => ({
      actor: userId,
      entityType: 'Auth',
      entityId: userId,
      metadata: { family, note: 'Revoked refresh token was presented again; token family revoked' },
      ip,
    }))
  );

  bus.on(
    EVENTS.EXAM_CREATED,
    safe(AUDIT_ACTIONS.EXAM_CREATED, ({ exam, actor, ip }) => ({
      actor: actor.id,
      actorRole: actor.role,
      entityType: 'Exam',
      entityId: exam._id,
      metadata: { title: exam.title },
      ip,
    }))
  );

  bus.on(
    EVENTS.EXAM_PUBLISHED,
    safe(AUDIT_ACTIONS.EXAM_PUBLISHED, ({ exam, actor, ip }) => ({
      actor: actor.id,
      actorRole: actor.role,
      entityType: 'Exam',
      entityId: exam._id,
      metadata: { title: exam.title, startTime: exam.startTime, endTime: exam.endTime },
      ip,
    }))
  );

  bus.on(
    EVENTS.EXAM_ARCHIVED,
    safe(AUDIT_ACTIONS.EXAM_ARCHIVED, ({ exam, actor, ip }) => ({
      actor: actor.id,
      actorRole: actor.role,
      entityType: 'Exam',
      entityId: exam._id,
      metadata: { title: exam.title },
      ip,
    }))
  );

  bus.on(
    EVENTS.EXAM_DELETED,
    safe(AUDIT_ACTIONS.EXAM_DELETED, ({ exam, actor, ip }) => ({
      actor: actor.id,
      actorRole: actor.role,
      entityType: 'Exam',
      entityId: exam._id,
      metadata: { title: exam.title },
      ip,
    }))
  );

  bus.on(
    EVENTS.ATTEMPT_STARTED,
    safe(AUDIT_ACTIONS.ATTEMPT_STARTED, ({ attempt, student, ip }) => ({
      actor: student.id,
      actorRole: 'student',
      entityType: 'Attempt',
      entityId: attempt._id,
      metadata: { exam: attempt.exam, attemptNumber: attempt.attemptNumber, deadline: attempt.deadline },
      ip,
    }))
  );

  bus.on(EVENTS.ATTEMPT_SUBMITTED, (payload) => {
    const action = payload.auto ? AUDIT_ACTIONS.ATTEMPT_AUTO_SUBMITTED : AUDIT_ACTIONS.ATTEMPT_SUBMITTED;
    return safe(action, ({ attempt, reason }) => ({
      actor: payload.auto ? null : attempt.student,
      actorRole: payload.auto ? 'system' : 'student',
      entityType: 'Attempt',
      entityId: attempt._id,
      metadata: {
        exam: attempt.exam,
        reason,
        submittedAt: attempt.submittedAt,
        score: attempt.evaluation ? attempt.evaluation.score : null,
      },
    }))(payload);
  });

  bus.on(
    EVENTS.RESULTS_PUBLISHED,
    safe(AUDIT_ACTIONS.RESULTS_PUBLISHED, ({ exam, actor, studentIds, ip }) => ({
      actor: actor.id,
      actorRole: actor.role,
      entityType: 'Exam',
      entityId: exam._id,
      metadata: { title: exam.title, studentsNotified: studentIds.length },
      ip,
    }))
  );
}

module.exports = registerAuditListeners;
