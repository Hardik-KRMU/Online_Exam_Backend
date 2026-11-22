const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/user.validator');
const c = require('../controllers/user.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.use(authenticate);

// Any logged-in user: own profile. Declared before '/:id' so 'me' is not read as an id.
router.get('/me', c.getMe);
router.patch('/me', validate(v.updateMe), c.updateMe);
router.patch('/me/password', validate(v.changePassword), c.changePassword);

// Administrator only
router.get('/', authorize(ROLES.ADMIN), validate(v.listUsers), c.listUsers);
router.post('/', authorize(ROLES.ADMIN), validate(v.createUser), c.createUser);
router.get('/:id', authorize(ROLES.ADMIN), validate(v.userIdParam), c.getUser);
router.patch('/:id', authorize(ROLES.ADMIN), validate(v.updateUser), c.updateUser);
router.delete('/:id', authorize(ROLES.ADMIN), validate(v.userIdParam), c.deactivateUser);

module.exports = router;
