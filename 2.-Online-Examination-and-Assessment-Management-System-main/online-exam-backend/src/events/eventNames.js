/** Names of internal application events (emitted on the EventEmitter bus). */
module.exports = Object.freeze({
  USER_LOGGED_IN: 'user.loggedIn',
  LOGIN_FAILED: 'auth.loginFailed',
  REFRESH_TOKEN_REUSED: 'auth.refreshTokenReused',
  EXAM_CREATED: 'exam.created',
  EXAM_PUBLISHED: 'exam.published',
  EXAM_ARCHIVED: 'exam.archived',
  EXAM_DELETED: 'exam.deleted',
  ATTEMPT_STARTED: 'attempt.started',
  ATTEMPT_PROGRESS: 'attempt.progress',
  ATTEMPT_SUBMITTED: 'attempt.submitted',
  RESULTS_PUBLISHED: 'results.published',
});
