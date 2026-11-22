const { Section, Course, User, Exam } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants');
const { getPagination, buildMeta, escapeRegex } = require('../utils/pagination');

async function assertCourseIds(ids = []) {
  if (ids.length === 0) return;
  const count = await Course.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw AppError.badRequest('One or more courses do not exist', 'INVALID_COURSE');
}

async function withStudentCount(section) {
  const studentCount = await User.countDocuments({ role: ROLES.STUDENT, section: section._id });
  const plain = section.toObject();
  plain.studentCount = studentCount;
  return plain;
}

async function listSections(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.department) filter.department = query.department;
  if (query.course) filter.courses = query.course;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ code: rx }, { name: rx }];
  }
  const [items, total] = await Promise.all([
    Section.find(filter).populate('courses', 'code title').sort({ code: 1 }).skip(skip).limit(limit),
    Section.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit }, total) };
}

async function getSection(id) {
  const section = await Section.findById(id).populate('courses', 'code title');
  if (!section) throw AppError.notFound('Section', 'SECTION_NOT_FOUND');
  return withStudentCount(section);
}

async function createSection(data) {
  await assertCourseIds(data.courses);
  const section = await Section.create(data);
  return getSection(section._id);
}

async function updateSection(id, data) {
  if (data.courses) await assertCourseIds(data.courses);
  const section = await Section.findById(id);
  if (!section) throw AppError.notFound('Section', 'SECTION_NOT_FOUND');
  Object.assign(section, data);
  await section.save();
  return getSection(section._id);
}

async function deleteSection(id) {
  const section = await Section.findById(id);
  if (!section) throw AppError.notFound('Section', 'SECTION_NOT_FOUND');
  const [students, exams] = await Promise.all([
    User.exists({ section: id }),
    Exam.exists({ 'assignedTo.sections': id }),
  ]);
  if (students || exams) {
    throw AppError.conflict('This section has students or assigned exams and cannot be deleted', 'SECTION_IN_USE');
  }
  await section.deleteOne();
}

module.exports = { listSections, getSection, createSection, updateSection, deleteSection };
