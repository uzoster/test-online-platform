'use strict';
const { HttpError } = require('../lib/util');

function notFoundApi(req, res, next) {
  next(new HttpError(404, 'Topilmadi.'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Server xatosi';

  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = "Fayl hajmi 5 MB dan oshmasligi kerak.";
  } else if (err.name === 'MulterError') {
    status = 400;
    message = "Faylni yuklashda xatolik.";
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = "So'rov formati noto'g'ri (JSON).";
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = "So'rov hajmi juda katta.";
  }

  if (status >= 500 && !(err instanceof HttpError)) {
    // Kutilmagan xato: tafsilotni foydalanuvchiga ko'rsatmaymiz
    console.error('[xato]', req.method, req.originalUrl, err);
    message = 'Serverda ichki xatolik yuz berdi.';
  }

  if (res.headersSent) return next(err);
  res.status(status).json({ error: message, ...(err.extra || {}) });
}

module.exports = { notFoundApi, errorHandler };
