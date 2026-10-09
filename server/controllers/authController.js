'use strict';
const { db } = require('../database');
const { hashPassword, verifyPassword } = require('../lib/password');
const { HttpError, cleanText } = require('../lib/util');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicTeacher(t) {
  return { id: t.id, name: t.name, email: t.email };
}

function login(req, res, next) {
  const email = cleanText(req.body && req.body.email, 200).toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (!email || !password) throw new HttpError(400, 'Email va parolni kiriting.');

  const teacher = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email);
  // Foydalanuvchi mavjud bo'lmasa ham xeshni hisoblaymiz (vaqt bo'yicha farqni kamaytirish uchun)
  const ok = verifyPassword(password, teacher ? teacher.password : 'scrypt$00$00');
  if (!teacher || !ok) throw new HttpError(401, "Email yoki parol noto'g'ri.");

  // Session fixation'dan himoya: yangi session id
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.teacherId = teacher.id;
    res.json({ teacher: publicTeacher(teacher) });
  });
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('otp.sid');
    res.json({ ok: true });
  });
}

function me(req, res) {
  if (!req.session || !req.session.teacherId) throw new HttpError(401, 'Tizimga kirilmagan.');
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.session.teacherId);
  if (!t) throw new HttpError(401, 'Tizimga kirilmagan.');
  res.json({ teacher: publicTeacher(t) });
}

function updateProfile(req, res) {
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.session.teacherId);
  const body = req.body || {};
  const name = cleanText(body.name !== undefined ? body.name : t.name, 100);
  const email = cleanText(body.email !== undefined ? body.email : t.email, 200).toLowerCase();
  if (!name) throw new HttpError(400, 'Ismni kiriting.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email manzili noto'g'ri.");

  const clash = db.prepare('SELECT id FROM teachers WHERE email = ? AND id <> ?').get(email, t.id);
  if (clash) throw new HttpError(409, 'Bu email boshqa foydalanuvchida band.');

  let passwordHash = t.password;
  if (body.new_password) {
    if (!verifyPassword(String(body.current_password || ''), t.password)) {
      throw new HttpError(400, "Joriy parol noto'g'ri.");
    }
    if (String(body.new_password).length < 6) {
      throw new HttpError(400, "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak.");
    }
    passwordHash = hashPassword(body.new_password);
  }

  db.prepare('UPDATE teachers SET name = ?, email = ?, password = ? WHERE id = ?').run(name, email, passwordHash, t.id);
  res.json({ teacher: { id: t.id, name, email } });
}

module.exports = { login, logout, me, updateProfile };
