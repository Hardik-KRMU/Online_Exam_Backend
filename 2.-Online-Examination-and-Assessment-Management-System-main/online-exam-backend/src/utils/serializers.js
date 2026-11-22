/**
 * Response shapers. Every API response is built from an explicit WHITELIST of
 * fields, never by returning a raw Mongoose document. This is the second line
 * of defence (after select:false on Question.correctOption) that keeps answer
 * keys and password hashes out of responses.
 */
const { getExamPhase } = require('./examWindow');

function idOf(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/** { id, ...picked fields } for a reference that may or may not be populated. */
function refSummary(value, fields = []) {
  if (value == null) return null;
  const summary = { id: idOf(value) };
  if (typeof value === 'object') {
    fields.forEach((field) => {
      if (value[field] !== undefined) summary[field] = value[field];
    });
  }
  return summary;
}

function toUser(user) {
  if (!user) return null;
  return {
    id: idOf(user),
    name: user.name,
    email: user.email,
    role: user.role,
    rollNumber: user.rollNumber,
    department: user.department,
    section: refSummary(user.section, ['code', 'name']),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toCourse(course) {
  return {
    id: idOf(course),
    code: course.code,
    title: course.title,
    department: course.department,
    description: course.description,
    faculty: (course.faculty || []).map((f) => refSummary(f, ['name', 'email'])),
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function toSection(section) {
  return {
    id: idOf(section),
    code: section.code,
    name: section.name,
    department: section.department,
    academicYear: section.academicYear,
    courses: (section.courses || []).map((c) => refSummary(c, ['code', 'title'])),
    studentCount: section.studentCount,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

/** Faculty/admin view of a question: includes the answer key. */
function toStaffQuestion(question) {
  const hasKey = question.correctOption != null;
  const options = (question.options || []).map((o) => ({ id: idOf(o), text: o.text }));
  return {
    id: idOf(question),
    course: refSummary(question.course, ['code', 'title']),
    text: question.text,
    type: question.type,
    options,
    correctOptionId: hasKey ? String(question.correctOption) : undefined,
    correctOptionIndex: hasKey ? options.findIndex((o) => o.id === String(question.correctOption)) : undefined,
    marks: question.marks,
    topic: question.topic,
    difficulty: question.difficulty,
    tags: question.tags,
    createdBy: refSummary(question.createdBy, ['name', 'email']),
    isArchived: question.isArchived,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

function negativeMarkingOf(exam) {
  const nm = exam.negativeMarking || {};
  return { enabled: Boolean(nm.enabled), fraction: nm.fraction == null ? 0.25 : nm.fraction };
}

/** Faculty/admin view of an exam. */
function toStaffExam(exam, now = new Date()) {
  const assigned = exam.assignedTo || {};
  return {
    id: idOf(exam),
    title: exam.title,
    instructions: exam.instructions,
    course: refSummary(exam.course, ['code', 'title']),
    createdBy: refSummary(exam.createdBy, ['name', 'email']),
    status: exam.status,
    phase: getExamPhase(exam, now),
    durationMinutes: exam.durationMinutes,
    startTime: exam.startTime,
    endTime: exam.endTime,
    poolSize: (exam.questions || []).length,
    questionsPerAttempt: exam.questionsPerAttempt,
    questionPool: (exam.questions || []).map((item) =>
      item.question && typeof item.question === 'object' && item.question.text
        ? { marks: item.marks, question: toStaffQuestion(item.question) }
        : { marks: item.marks, questionId: idOf(item.question) }
    ),
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    negativeMarking: negativeMarkingOf(exam),
    passPercentage: exam.passPercentage,
    maxAttempts: exam.maxAttempts,
    resultRelease: exam.resultRelease,
    resultsPublished: exam.resultsPublished,
    resultsPublishedAt: exam.resultsPublishedAt,
    assignedTo: {
      sections: (assigned.sections || []).map((s) => refSummary(s, ['code', 'name'])),
      courses: (assigned.courses || []).map((c) => refSummary(c, ['code', 'title'])),
      students: (assigned.students || []).map((s) => refSummary(s, ['name', 'rollNumber'])),
    },
    publishedAt: exam.publishedAt,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

/** Student view of an exam: no questions, no answer key, no assignment lists. */
function toStudentExam(exam, now = new Date(), attemptSummary = null) {
  return {
    id: idOf(exam),
    title: exam.title,
    instructions: exam.instructions,
    course: refSummary(exam.course, ['code', 'title']),
    phase: getExamPhase(exam, now),
    durationMinutes: exam.durationMinutes,
    startTime: exam.startTime,
    endTime: exam.endTime,
    questionCount: exam.questionsPerAttempt,
    negativeMarking: negativeMarkingOf(exam),
    passPercentage: exam.passPercentage,
    maxAttempts: exam.maxAttempts,
    resultRelease: exam.resultRelease,
    resultsPublished: exam.resultsPublished,
    myAttempts: attemptSummary || undefined,
  };
}

module.exports = {
  idOf,
  refSummary,
  toUser,
  toCourse,
  toSection,
  toStaffQuestion,
  toStaffExam,
  toStudentExam,
};
