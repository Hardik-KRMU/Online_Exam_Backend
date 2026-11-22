/** Shared enumerations. Using constants avoids typo bugs like 'faculity'. */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  FACULTY: 'faculty',
  STUDENT: 'student',
});

const EXAM_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  AUTO_SUBMITTED: 'auto_submitted',
});

const FINAL_ATTEMPT_STATUSES = Object.freeze([ATTEMPT_STATUS.SUBMITTED, ATTEMPT_STATUS.AUTO_SUBMITTED]);

const DIFFICULTY_LEVELS = Object.freeze(['easy', 'medium', 'hard']);

const RESULT_RELEASE = Object.freeze({
  IMMEDIATE: 'immediate', // total score visible right after submission
  MANUAL: 'manual', // nothing visible until faculty publishes results
});

const EXAM_PHASE = Object.freeze({
  UPCOMING: 'upcoming',
  LIVE: 'live',
  CLOSED: 'closed',
});

const AUDIT_ACTIONS = Object.freeze({
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  EXAM_CREATED: 'EXAM_CREATED',
  EXAM_PUBLISHED: 'EXAM_PUBLISHED',
  EXAM_ARCHIVED: 'EXAM_ARCHIVED',
  EXAM_DELETED: 'EXAM_DELETED',
  ATTEMPT_STARTED: 'ATTEMPT_STARTED',
  ATTEMPT_SUBMITTED: 'ATTEMPT_SUBMITTED',
  ATTEMPT_AUTO_SUBMITTED: 'ATTEMPT_AUTO_SUBMITTED',
  RESULTS_PUBLISHED: 'RESULTS_PUBLISHED',
});

const AUDIT_ENTITY_TYPES = Object.freeze(['User', 'Exam', 'Attempt', 'Question', 'Auth']);

/** Socket.IO room names, kept in one place so emitters and joiners agree. */
const ROOMS = Object.freeze({
  user: (userId) => `user:${userId}`,
  section: (sectionId) => `section:${sectionId}`,
  examMonitor: (examId) => `exam:${examId}:monitor`,
});

module.exports = {
  ROLES,
  EXAM_STATUS,
  ATTEMPT_STATUS,
  FINAL_ATTEMPT_STATUSES,
  DIFFICULTY_LEVELS,
  RESULT_RELEASE,
  EXAM_PHASE,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ROOMS,
};
