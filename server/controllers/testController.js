'use strict';
const { db } = require('../database');
const { finalizeExpired } = require('../lib/attempts');
const { readQuestions, buildTemplate, looksLikeXlsx } = require('../lib/excel');
const { LETTERS, HttpError, cleanText, cleanMultiline, toInt, toBool, makeCode } = require('../lib/util');

const MAX_QUESTIONS = 1000;

/* ---------- yordamchilar ---------- */

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function linkFor(req, code) {
  return code ? `${baseUrl(req)}/test/${code}` : null;
}

function serializeTest(req, t) {
  return {
    id: t.id,
    title: t.title,
    subject: t.subject,
    group_name: t.group_name,
    duration: t.duration,
    question_count: t.question_count,
    test_code: t.test_code,
    link: t.is_published || t.test_code ? linkFor(req, t.test_code) : null,
    is_published: !!t.is_published,
    random_questions: !!t.random_questions,
    random_answers: !!t.random_answers,
    show_result: !!t.show_result,
    show_correct: !!t.show_correct,
    allow_retake: !!t.allow_retake,
    created_at: t.created_at,
    updated_at: t.updated_at,
    total_questions: t.total_questions,
    participants: t.participants,
    avg_percentage: t.avg_percentage,
    in_progress: t.in_progress,
  };
}

function ownedTest(req) {
  const id = toInt(req.params.id);
  const t = id && db.prepare('SELECT * FROM tests WHERE id = ? AND teacher_id = ?').get(id, req.session.teacherId);
  if (!t) throw new HttpError(404, 'Test topilmadi.');
  return t;
}

function attemptCount(testId) {
  return db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE test_id = ?').get(testId).c;
}

/** Sarlavha va sozlamalarni tekshiradi. `base` — mavjud test (tahrirlashda). */
function parseMeta(body, base) {
  const b = body || {};
  const pick = (k, d) => (b[k] !== undefined ? b[k] : base ? base[k] : d);

  const title = cleanText(pick('title', ''), 200);
  if (!title) throw new HttpError(400, 'Test nomini kiriting.');

  const duration = toInt(pick('duration', 20), 20);
  if (duration < 1 || duration > 600) throw new HttpError(400, "Davomiylik 1 dan 600 daqiqagacha bo'lishi kerak.");

  let questionCount = pick('question_count', null);
  questionCount = toInt(questionCount, null);
  if (questionCount !== null && questionCount < 1) questionCount = null;
  if (questionCount !== null && questionCount > MAX_QUESTIONS) {
    throw new HttpError(400, "Savollar soni juda katta.");
  }

  return {
    title,
    subject: cleanText(pick('subject', ''), 100),
    group_name: cleanText(pick('group_name', ''), 100),
    duration,
    question_count: questionCount,
    random_questions: toBool(pick('random_questions', true), true),
    random_answers: toBool(pick('random_answers', true), true),
    show_result: toBool(pick('show_result', true), true),
    show_correct: toBool(pick('show_correct', false), false),
    allow_retake: toBool(pick('allow_retake', false), false),
  };
}

function validateQuestions(list) {
  if (!Array.isArray(list)) throw new HttpError(400, "Savollar ro'yxati noto'g'ri.");
  if (list.length > MAX_QUESTIONS) throw new HttpError(400, `Bir testda ${MAX_QUESTIONS} tadan ortiq savol bo'lmasin.`);
  return list.map((q, i) => {
    const n = i + 1;
    const clean = {
      question: cleanMultiline(q && q.question, 2000),
      option_a: cleanText(q && q.option_a, 500),
      option_b: cleanText(q && q.option_b, 500),
      option_c: cleanText(q && q.option_c, 500),
      option_d: cleanText(q && q.option_d, 500),
      correct_answer: String((q && q.correct_answer) || '').trim().toUpperCase(),
    };
    if (!clean.question) throw new HttpError(400, `Savol #${n}: savol matni bo'sh.`);
    for (const l of LETTERS) {
      if (!clean[`option_${l.toLowerCase()}`]) throw new HttpError(400, `Savol #${n}: ${l} varianti bo'sh.`);
    }
    if (!LETTERS.includes(clean.correct_answer)) {
      throw new HttpError(400, `Savol #${n}: to'g'ri javob A, B, C yoki D bo'lishi kerak.`);
    }
    return clean;
  });
}

function insertQuestions(testId, questions) {
  const st = db.prepare(
    `INSERT INTO questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  questions.forEach((q) =>
    st.run(testId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer)
  );
}

const TEST_LIST_SQL = `
  SELECT t.*,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS total_questions,
    (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.status = 'submitted') AS participants,
    (SELECT ROUND(AVG(a.percentage), 1) FROM attempts a WHERE a.test_id = t.id AND a.status = 'submitted') AS avg_percentage,
    (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.status = 'in_progress') AS in_progress
  FROM tests t`;

/* ---------- handlerlar ---------- */

function listTests(req, res) {
  finalizeExpired();
  const rows = db.prepare(`${TEST_LIST_SQL} WHERE t.teacher_id = ? ORDER BY t.id DESC`).all(req.session.teacherId);
  res.json({ tests: rows.map((t) => serializeTest(req, t)) });
}

function getTest(req, res) {
  const t = ownedTest(req);
  finalizeExpired(t.id);
  const full = db.prepare(`${TEST_LIST_SQL} WHERE t.id = ?`).get(t.id);
  const questions = db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY id').all(t.id);
  const attempts = attemptCount(t.id);
  res.json({ test: serializeTest(req, full), questions, attempt_count: attempts, locked: attempts > 0 });
}

function createTest(req, res) {
  const meta = parseMeta(req.body);
  const questions = req.body && req.body.questions !== undefined ? validateQuestions(req.body.questions) : [];

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tests (teacher_id, title, subject, group_name, duration, question_count,
           random_questions, random_answers, show_result, show_correct, allow_retake)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.session.teacherId, meta.title, meta.subject, meta.group_name, meta.duration, meta.question_count,
        meta.random_questions, meta.random_answers, meta.show_result, meta.show_correct, meta.allow_retake
      );
    const id = Number(info.lastInsertRowid);
    insertQuestions(id, questions);
    return id;
  });
  const id = run();
  const full = db.prepare(`${TEST_LIST_SQL} WHERE t.id = ?`).get(id);
  res.status(201).json({ test: serializeTest(req, full) });
}

function updateTest(req, res) {
  const t = ownedTest(req);
  const meta = parseMeta(req.body, t);
  const hasQuestions = req.body && req.body.questions !== undefined;
  const questions = hasQuestions ? validateQuestions(req.body.questions) : null;

  if (hasQuestions && attemptCount(t.id) > 0) {
    throw new HttpError(409, "Natijalari mavjud testning savollarini o'zgartirib bo'lmaydi.");
  }
  if (t.is_published && hasQuestions && questions.length === 0) {
    throw new HttpError(400, "E'lon qilingan testda kamida bitta savol bo'lishi kerak.");
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE tests SET title = ?, subject = ?, group_name = ?, duration = ?, question_count = ?,
         random_questions = ?, random_answers = ?, show_result = ?, show_correct = ?, allow_retake = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      meta.title, meta.subject, meta.group_name, meta.duration, meta.question_count,
      meta.random_questions, meta.random_answers, meta.show_result, meta.show_correct, meta.allow_retake, t.id
    );
    if (hasQuestions) {
      db.prepare('DELETE FROM questions WHERE test_id = ?').run(t.id);
      insertQuestions(t.id, questions);
    }
  })();

  const full = db.prepare(`${TEST_LIST_SQL} WHERE t.id = ?`).get(t.id);
  res.json({ test: serializeTest(req, full) });
}

function deleteTest(req, res) {
  const t = ownedTest(req);
  db.prepare('DELETE FROM tests WHERE id = ?').run(t.id);
  res.json({ ok: true });
}

function addQuestions(req, res) {
  const t = ownedTest(req);
  if (attemptCount(t.id) > 0) {
    throw new HttpError(409, "Natijalari mavjud testga savol qo'shib bo'lmaydi.");
  }
  const body = req.body || {};
  const list = Array.isArray(body.questions) ? body.questions : body.question ? [body] : [];
  if (!list.length) throw new HttpError(400, "Qo'shiladigan savol topilmadi.");
  const clean = validateQuestions(list);
  const existing = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE test_id = ?').get(t.id).c;
  if (existing + clean.length > MAX_QUESTIONS) {
    throw new HttpError(400, `Bir testda ${MAX_QUESTIONS} tadan ortiq savol bo'lmasin.`);
  }
  db.transaction(() => {
    insertQuestions(t.id, clean);
    db.prepare('UPDATE tests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(t.id);
  })();
  res.status(201).json({ added: clean.length, total: existing + clean.length });
}

function generateUniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = makeCode(i < 10 ? 6 : 8);
    if (!db.prepare('SELECT 1 FROM tests WHERE test_code = ?').get(code)) return code;
  }
  throw new HttpError(500, "Noyob kod yaratib bo'lmadi.");
}

function publishTest(req, res) {
  const t = ownedTest(req);
  const count = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE test_id = ?').get(t.id).c;
  if (count === 0) throw new HttpError(400, "Testni e'lon qilish uchun kamida bitta savol qo'shing.");

  const code = t.test_code || generateUniqueCode();
  db.prepare('UPDATE tests SET is_published = 1, test_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(code, t.id);
  const full = db.prepare(`${TEST_LIST_SQL} WHERE t.id = ?`).get(t.id);
  res.json({ test: serializeTest(req, full), test_code: code, link: linkFor(req, code) });
}

function unpublishTest(req, res) {
  const t = ownedTest(req);
  db.prepare('UPDATE tests SET is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(t.id);
  const full = db.prepare(`${TEST_LIST_SQL} WHERE t.id = ?`).get(t.id);
  res.json({ test: serializeTest(req, full) });
}

/** Excel faylni o'qib, import qilishdan oldin ko'rib chiqish uchun qaytaradi (bazaga yozmaydi). */
function uploadPreview(req, res) {
  if (!req.file) throw new HttpError(400, 'Fayl tanlanmadi (maydon nomi: file).');
  if (!looksLikeXlsx(req.file.buffer)) {
    throw new HttpError(400, "Bu haqiqiy .xlsx fayl emas. Excel'da 'Save as → .xlsx' qilib saqlang.");
  }
  const result = readQuestions(req.file.buffer);
  if (result.fatal) throw new HttpError(400, result.fatal);
  res.json({
    filename: req.file.originalname,
    found: result.found,
    valid: result.questions.length,
    error_count: result.errors.length,
    errors: result.errors,
    items: result.items,
    questions: result.questions,
  });
}

function downloadTemplate(req, res) {
  const buf = buildTemplate();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="test-template.xlsx"',
    'Content-Length': buf.length,
  });
  res.send(buf);
}

module.exports = {
  listTests, getTest, createTest, updateTest, deleteTest, addQuestions,
  publishTest, unpublishTest, uploadPreview, downloadTemplate,
  // testlar uchun
  parseMeta, validateQuestions,
};
