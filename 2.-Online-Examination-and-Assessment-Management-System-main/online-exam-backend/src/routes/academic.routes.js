const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/academic.validator');
const c = require('../controllers/academic.controller');
const { ROLES } = require('../constants');

const staff = authorize(ROLES.ADMIN, ROLES.FACULTY);
const adminOnly = authorize(ROLES.ADMIN);

// /api/courses
const courseRouter = express.Router();
courseRouter.use(authenticate);
courseRouter.get('/', staff, validate(v.listCourses), c.listCourses);
courseRouter.get('/:id', staff, validate(v.idOnly), c.getCourse);
courseRouter.post('/', adminOnly, validate(v.createCourse), c.createCourse);
courseRouter.patch('/:id', adminOnly, validate(v.updateCourse), c.updateCourse);
courseRouter.delete('/:id', adminOnly, validate(v.idOnly), c.deleteCourse);

// /api/sections
const sectionRouter = express.Router();
sectionRouter.use(authenticate);
sectionRouter.get('/', staff, validate(v.listSections), c.listSections);
sectionRouter.get('/:id', staff, validate(v.idOnly), c.getSection);
sectionRouter.post('/', adminOnly, validate(v.createSection), c.createSection);
sectionRouter.patch('/:id', adminOnly, validate(v.updateSection), c.updateSection);
sectionRouter.delete('/:id', adminOnly, validate(v.idOnly), c.deleteSection);

module.exports = { courseRouter, sectionRouter };
