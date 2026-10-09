'use strict';
const path = require('path');
const multer = require('multer');
const { HttpError } = require('../lib/util');
const { looksLikeXlsx } = require('../lib/excel');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Fayl xotirada (buffer) qabul qilinadi, diskka yozilmaydi — shuning uchun
 * vaqtinchalik fayllarni tozalash kerak emas. Faqat .xlsx ruxsat etiladi.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.xlsx') return cb(new HttpError(400, "Faqat .xlsx formatidagi fayl qabul qilinadi."));
    cb(null, true);
  },
});

module.exports = { upload, looksLikeXlsx, MAX_FILE_SIZE };
