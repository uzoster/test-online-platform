'use strict';
/**
 * Studentlar uchun ommaviy API (test kodi + urinish tokeni orqali).
 * Muhim: to'g'ri javoblar test davomida HECH QACHON studentga yuborilmaydi.
 */
const { db } = require('../database');
const A = require('../lib/attempts');
const { HttpError, cleanText, toInt, makeToken } = require('../lib/util');

function normCode(code) {
  return String(code || '').trim().toUpperCase();
}

function findTest(code) {
  const t = db.prepare('SELECT * FROM tests WHERE test_code = ?').get(normCode(code));
  if (!t) throw new HttpError(404, 'Bunday test topilmadi. Havolani tekshiring.');
  return t;
}

/** Yangi urinish boshlash / test ma'lumotini ko'rish faqat e'lon qilingan testda mumkin. */
function findPublishedTest(code) {
  const t = findTest(code);
  if (!t.is_published) throw new HttpError(403, "Bu test hozircha yopiq. O'qituvchingiz bilan bog'laning.", { closed: true });
  return t;
}

function findAttempt(test, token) {
  const tk = String(token || '');
  const a = tk && db.prepare('SELECT * FROM attempts WHERE token = ? AND test_id = ?').get(tk, test.id);
  if (!a) throw new HttpError(404, 'Urinish topilmadi.', { invalid_token: true });
  return a;
}

function effectiveCount(test, total) {
  return test.question_count && test.question_count > 0 ? Math.min(test.question_count, total) : total;
}

/** Test boshlanishi/qayta yuklanishi uchun to'liq holat. */
function sessionPayload(attempt, test) {
  const layout = JSON.parse(attempt.layout);
  const qmap = A.loadQuestionsMap(test.id);
  return {
    token: attempt.token,
    student: { name: attempt.student_name, surname: attempt.student_surname },
    test: { title: test.title, subject: test.subject, duration: test.duration },
    total: layout.length,
    remaining: A.remainingMs(attempt) / 1000,
    questions: A.publicQuestions(layout, qmap),
    answers: A.savedAnswersForClient(attempt.id, layout),
  };
}

/* ---------- GET /api/test/:code ---------- */
function getPublicTest(req, res) {
  const t = findPublishedTest(req.params.code);
  const total = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE test_id = ?').get(t.id).c;
  res.json({
    test: {
      title: t.title,
      subject: t.subject,
      group_name: t.group_name,
      duration: t.duration,
      total_questions: effectiveCount(t, total),
    },
  });
}

/* ---------- POST /api/test/:code/start ---------- */
function startTest(req, res) {
  const t = findPublishedTest(req.params.code);
  const name = cleanText(req.body && req.body.name, 60);
  const surname = cleanText(req.body && req.body.surname, 60);
  if (name.length < 2 || surname.length < 2) {
    throw new HttpError(400, 'Ism va familiyani to\'liq kiriting (kamida 2 ta harf).');
  }

  finalizeIfExpired(t.id);

  if (!t.allow_retake) {
    const dup = db
      .prepare(
        `SELECT id, status FROM attempts
         WHERE test_id = ? AND lower(student_name) = lower(?) AND lower(student_surname) = lower(?) LIMIT 1`
      )
      .get(t.id, name, surname);
    if (dup) {
      throw new HttpError(
        409,
        dup.status === 'submitted'
          ? 'Siz bu testni allaqachon topshirgansiz. Qayta topshirishga ruxsat berilmagan.'
          : "Bu ism bilan test allaqachon boshlangan. Agar bu siz bo'lsangiz, o'sha qurilma/brauzerdan davom eting yoki o'qituvchiga murojaat qiling.",
        { already_taken: true }
      );
    }
  }

  const questionIds = db.prepare('SELECT id FROM questions WHERE test_id = ? ORDER BY id').all(t.id).map((r) => r.id);
  if (!questionIds.length) throw new HttpError(400, "Bu testda hali savollar yo'q.");

  const layout = A.buildLayout(t, questionIds);
  const now = Date.now();
  const token = makeToken();
  db.prepare(
    `INSERT INTO attempts (test_id, student_name, student_surname, token, status, layout, started_at, deadline_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`
  ).run(t.id, name, surname, token, JSON.stringify(layout), now, now + t.duration * 60 * 1000);

  const attempt = db.prepare('SELECT * FROM attempts WHERE token = ?').get(token);
  res.status(201).json(sessionPayload(attempt, t));
}

/** Vaqti o'tgan urinishni yakunlaydi; yakunlangan bo'lsa true. */
function finalizeIfExpired(testId) {
  A.finalizeExpired(testId);
}

/* ---------- POST /api/test/:code/resume ---------- */
function resumeTest(req, res) {
  const t = findTest(req.params.code);
  const attempt = findAttempt(t, req.body && req.body.token);

  if (attempt.status === 'in_progress' && Date.now() > attempt.deadline_at) {
    A.finalizeAttempt(attempt.id, attempt.deadline_at);
  }
  const fresh = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
  if (fresh.status === 'submitted') return res.json({ submitted: true });
  res.json(sessionPayload(fresh, t));
}

/* ---------- PUT /api/test/:code/answer ---------- */
function saveAnswer(req, res) {
  const t = findTest(req.params.code);
  const attempt = findAttempt(t, req.body && req.body.token);
  const now = Date.now();

  if (attempt.status === 'submitted') throw new HttpError(409, 'Test allaqachon topshirilgan.', { submitted: true });
  if (now > attempt.deadline_at + A.GRACE_MS) {
    A.finalizeAttempt(attempt.id, attempt.deadline_at);
    throw new HttpError(410, 'Vaqt tugadi.', { submitted: true, time_over: true });
  }

  storeAnswer(attempt, toInt(req.body.questionId), req.body.answer);
  res.json({ ok: true, remaining: A.remainingMs(attempt, now) / 1000 });
}

function storeAnswer(attempt, questionId, displayLetter) {
  const layout = JSON.parse(attempt.layout);
  const item = layout.find((l) => l.q === questionId);
  if (!item) throw new HttpError(400, "Bu savol sizning testingizga tegishli emas.");

  if (displayLetter === null || displayLetter === undefined || displayLetter === '') {
    db.prepare(
      `INSERT INTO answers (attempt_id, question_id, selected_answer) VALUES (?, ?, NULL)
       ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected_answer = NULL`
    ).run(attempt.id, questionId);
    return;
  }
  const original = A.displayToOriginal(item, displayLetter);
  if (!original) throw new HttpError(400, "Javob A, B, C yoki D bo'lishi kerak.");
  db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_answer) VALUES (?, ?, ?)
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected_answer = excluded.selected_answer`
  ).run(attempt.id, questionId, original);
}

/* ---------- POST /api/test/:code/submit ---------- */
function submitTest(req, res) {
  const t = findTest(req.params.code);
  const attempt = findAttempt(t, req.body && req.body.token);
  const now = Date.now();

  if (attempt.status === 'submitted') {
    throw new HttpError(409, 'Bu test allaqachon topshirilgan. Qayta topshirib bo\'lmaydi.', { submitted: true });
  }

  const late = now > attempt.deadline_at + A.GRACE_MS;
  if (!late) {
    // Oxirgi holatni qabul qilish (autosave'dan keyin kelgan javoblar)
    const answers = req.body && req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    db.transaction(() => {
      for (const [qid, letter] of Object.entries(answers)) {
        storeAnswer(attempt, toInt(qid), letter);
      }
    })();
  }
  // Kechikkan bo'lsa: faqat vaqt ichida saqlangan javoblar hisobga olinadi.
  A.finalizeAttempt(attempt.id, late ? attempt.deadline_at : now);

  const fresh = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
  res.json({ ...A.buildResultView(fresh, t), time_over: late });
}

/* ---------- GET /api/test/:code/result?token= ---------- */
function getResult(req, res) {
  const t = findTest(req.params.code);
  const attempt = findAttempt(t, req.query.token);
  if (attempt.status === 'in_progress' && Date.now() > attempt.deadline_at) {
    A.finalizeAttempt(attempt.id, attempt.deadline_at);
  }
  const fresh = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
  if (fresh.status !== 'submitted') {
    throw new HttpError(409, 'Test hali yakunlanmagan.', { not_submitted: true });
  }
  res.json(A.buildResultView(fresh, t));
}

module.exports = { getPublicTest, startTest, resumeTest, saveAnswer, submitTest, getResult };
