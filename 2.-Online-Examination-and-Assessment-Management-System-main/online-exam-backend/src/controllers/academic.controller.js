const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { toCourse, toSection } = require('../utils/serializers');
const courseService = require('../services/course.service');
const sectionService = require('../services/section.service');

// ----- Courses -----
const listCourses = asyncHandler(async (req, res) => {
  const { items, meta } = await courseService.listCourses(req.query, req.user);
  sendSuccess(res, { data: items.map(toCourse), meta });
});

const getCourse = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: toCourse(await courseService.getCourse(req.params.id)) });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Course created', data: toCourse(course) });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req.params.id, req.body);
  sendSuccess(res, { message: 'Course updated', data: toCourse(course) });
});

const deleteCourse = asyncHandler(async (req, res) => {
  await courseService.deleteCourse(req.params.id);
  sendSuccess(res, { message: 'Course deleted' });
});

// ----- Sections -----
const listSections = asyncHandler(async (req, res) => {
  const { items, meta } = await sectionService.listSections(req.query);
  sendSuccess(res, { data: items.map(toSection), meta });
});

const getSection = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: toSection(await sectionService.getSection(req.params.id)) });
});

const createSection = asyncHandler(async (req, res) => {
  const section = await sectionService.createSection(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Section created', data: toSection(section) });
});

const updateSection = asyncHandler(async (req, res) => {
  const section = await sectionService.updateSection(req.params.id, req.body);
  sendSuccess(res, { message: 'Section updated', data: toSection(section) });
});

const deleteSection = asyncHandler(async (req, res) => {
  await sectionService.deleteSection(req.params.id);
  sendSuccess(res, { message: 'Section deleted' });
});

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
};
