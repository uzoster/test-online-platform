'use strict';
const express = require('express');
const c = require('../controllers/resultController');
const { requireTeacher } = require('../middleware/auth');
const { wrap } = require('../lib/util');

const router = express.Router();

// Har bir yo'lga alohida himoya (bu router /api ostiga ulangan)
router.get('/stats', requireTeacher, wrap(c.getStats));
router.get('/tests/:id/results', requireTeacher, wrap(c.getResults));
router.get('/tests/:id/results/export', requireTeacher, wrap(c.exportResults));
router.get('/tests/:id/analytics', requireTeacher, wrap(c.getAnalytics));
router.get('/attempts/:id', requireTeacher, wrap(c.getAttempt));
router.delete('/attempts/:id', requireTeacher, wrap(c.deleteAttempt));

module.exports = router;
