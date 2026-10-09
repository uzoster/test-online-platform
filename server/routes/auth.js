'use strict';
const express = require('express');
const c = require('../controllers/authController');
const { requireTeacher } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap } = require('../lib/util');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring.",
});

router.post('/login', loginLimiter, wrap(c.login));
router.post('/logout', wrap(c.logout));
router.get('/me', wrap(c.me));
router.put('/profile', requireTeacher, wrap(c.updateProfile));

module.exports = router;
