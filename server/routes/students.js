'use strict';
const express = require('express');
const c = require('../controllers/studentController');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap } = require('../lib/util');

const router = express.Router();

// Bitta maktab/guruh bir IP orqali kirishi mumkin — shuning uchun limit saxiy.
const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: "Juda ko'p so'rov. Bir daqiqadan keyin qayta urinib ko'ring.",
});

router.get('/:code', wrap(c.getPublicTest));
router.post('/:code/start', startLimiter, wrap(c.startTest));
router.post('/:code/resume', wrap(c.resumeTest));
router.put('/:code/answer', wrap(c.saveAnswer));
router.post('/:code/submit', wrap(c.submitTest));
router.get('/:code/result', wrap(c.getResult));

module.exports = router;
