const { Course, User, Question, Exam, Section } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants');
const { getPagination, buildMeta, escapeRegex } = require('../utils/pagination');

async function assertFacultyIds(ids = []) {
  if (ids.length === 0) return;
  const count = await User.countDocuments({ _id: { $in: ids }, role: ROLES.FACULTY, isActive: true });
  if (count !== ids.length) {
    throw AppError.badRequest('Every id in faculty must be an active faculty member', 'INVALID_FACULTY');
  }
}

async function listCourses(query, actor) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.department) filter.department = query.department;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ code: rx }, { title: rx }];
  }
  if (actor.role === ROLES.FACULTY && query.mine) filter.faculty = actor.id;

  const [items, total] = await Promise.all([
    Course.find(filter).populate('faculty', 'name email').sort({ code: 1 }).skip(skip).limit(limit),
    Course.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit }, total) };
}

async function getCourse(id) {
  const course = await Course.findById(id).populate('faculty', 'name email');
  if (!course) throw AppError.notFound('Course', 'COURSE_NOT_FOUND');
  return course;
}

async function createCourse(data) {
  await assertFacultyIds(data.faculty);
  const course = await Course.create(data);
  return getCourse(course._id);
}

async function updateCourse(id, data) {
  if (data.faculty) await assertFacultyIds(data.faculty);
  const course = await Course.findById(id);
  if (!course) throw AppError.notFound('Course', 'COURSE_NOT_FOUND');
  Object.assign(course, data);
  await course.save();
  return getCourse(course._id);
}

async function deleteCourse(id) {
  const course = await Course.findById(id);
  if (!course) throw AppError.notFound('Course', 'COURSE_NOT_FOUND');
  const [questions, exams] = await Promise.all([Question.exists({ course: id }), Exam.exists({ course: id })]);
  if (questions || exams) {
    throw AppError.conflict('This course has questions or exams and cannot be deleted', 'COURSE_IN_USE');
  }
  await Section.updateMany({ courses: id }, { $pull: { courses: id } });
  await course.deleteOne();
}

/**
 * Throws unless the actor may author content for this course:
 * admins always, faculty only for courses they are assigned to.
 */
async function assertCanAuthorForCourse(courseId, actor) {
  const course = await Course.findById(courseId).select('code title faculty');
  if (!course) throw AppError.badRequest('Course does not exist', 'INVALID_COURSE');
  if (actor.role === ROLES.FACULTY && !course.faculty.some((f) => String(f) === actor.id)) {
    throw AppError.forbidden('You are not assigned to teach this course', 'COURSE_NOT_ASSIGNED');
  }
  return course;
}

/** Ids of courses a faculty member teaches. */
async function taughtCourseIds(facultyId) {
  return Course.find({ faculty: facultyId }).distinct('_id');
}

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  assertCanAuthorForCourse,
  taughtCourseIds,
};
