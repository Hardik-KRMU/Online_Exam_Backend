/**
 * Who may sit an exam. An exam can be assigned to any mix of:
 *   - individual students,
 *   - sections (every student in the section),
 *   - courses (every student whose section studies the course).
 */
const { Section, User } = require('../models');
const { EXAM_STATUS, ROLES } = require('../constants');

const sameId = (a, b) => String(a) === String(b);

async function isStudentEligible(exam, student) {
  const assigned = exam.assignedTo || {};
  if ((assigned.students || []).some((id) => sameId(id, student.id))) return true;
  if (!student.section) return false;
  if ((assigned.sections || []).some((id) => sameId(id, student.section))) return true;
  if ((assigned.courses || []).length > 0) {
    const section = await Section.findById(student.section).select('courses');
    return Boolean(section && section.courses.some((c) => assigned.courses.some((ac) => sameId(ac, c))));
  }
  return false;
}

/** MongoDB filter for "published exams this student is assigned to". */
async function studentExamFilter(student) {
  const or = [{ 'assignedTo.students': student.id }];
  if (student.section) {
    or.push({ 'assignedTo.sections': student.section });
    const section = await Section.findById(student.section).select('courses');
    if (section && section.courses.length > 0) {
      or.push({ 'assignedTo.courses': { $in: section.courses } });
    }
  }
  return { status: EXAM_STATUS.PUBLISHED, $or: or };
}

/** Section ids and individual student ids an exam reaches (for notifications and reports). */
async function examAudience(exam) {
  const assigned = exam.assignedTo || {};
  const sectionIds = new Set((assigned.sections || []).map(String));
  if ((assigned.courses || []).length > 0) {
    const viaCourses = await Section.find({ courses: { $in: assigned.courses } }).distinct('_id');
    viaCourses.forEach((id) => sectionIds.add(String(id)));
  }
  return {
    sectionIds: [...sectionIds],
    studentIds: (assigned.students || []).map(String),
  };
}

async function countEligibleStudents(exam) {
  const { sectionIds, studentIds } = await examAudience(exam);
  return User.countDocuments({
    role: ROLES.STUDENT,
    isActive: true,
    $or: [{ section: { $in: sectionIds } }, { _id: { $in: studentIds } }],
  });
}

module.exports = { isStudentEligible, studentExamFilter, examAudience, countEligibleStudents };
