'use strict';
const { HttpError } = require('../lib/util');

/** Faqat tizimga kirgan o'qituvchilar uchun. */
function requireTeacher(req, res, next) {
  if (req.session && req.session.teacherId) return next();
  next(new HttpError(401, 'Tizimga kirish talab qilinadi.'));
}

/** Sahifalar uchun: kirmagan bo'lsa bosh sahifaga yo'naltiradi. */
function requireTeacherPage(req, res, next) {
  if (req.session && req.session.teacherId) return next();
  res.redirect('/');
}

module.exports = { requireTeacher, requireTeacherPage };
