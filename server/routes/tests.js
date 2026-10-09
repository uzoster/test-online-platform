'use strict';
const express = require('express');
const c = require('../controllers/testController');
const { requireTeacher } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { wrap } = require('../lib/util');

const router = express.Router();
router.use(requireTeacher);

// Muhim: statik yo'llar `/:id` dan oldin turishi kerak
router.get('/template', wrap(c.downloadTemplate));
router.post('/upload', upload.single('file'), wrap(c.uploadPreview));

router.get('/', wrap(c.listTests));
router.post('/', wrap(c.createTest));
router.get('/:id', wrap(c.getTest));
router.put('/:id', wrap(c.updateTest));
router.delete('/:id', wrap(c.deleteTest));
router.post('/:id/questions', wrap(c.addQuestions));
router.post('/:id/publish', wrap(c.publishTest));
router.post('/:id/unpublish', wrap(c.unpublishTest));

module.exports = router;
