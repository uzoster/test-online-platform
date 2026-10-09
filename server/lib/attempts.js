'use strict';
/**
 * Urinish (attempt) mantig'i: tasodifiy joylashuv, baholash, yakunlash.
 *
 * layout (JSON):  [{ q: <question_id>, o: ['C','A','D','B'] }, ...]
 *   - massiv tartibi  = studentga ko'rsatiladigan savollar tartibi
 *   - o[i]            = i-o'rinda (A,B,C,D) ko'rsatilgan variantning ASL harfi
 * Javoblar bazada ASL harf bilan saqlanadi, shuning uchun aralashtirish baholashni buzmaydi.
 */
const { db } = require('../database');
const { LETTERS, shuffle, pct } = require('./util');

const GRACE_MS = 5000; // tarmoq kechikishi uchun qo'shimcha vaqt

const OPT_COL = { A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d' };

function buildLayout(test, questionIds) {
  let ids = questionIds.slice();
  if (test.random_questions) ids = shuffle(ids);
  const limit = test.question_count && test.question_count > 0 ? test.question_count : ids.length;
  ids = ids.slice(0, Math.min(limit, ids.length));
  return ids.map((id) => ({
    q: id,
    o: test.random_answers ? shuffle(LETTERS) : LETTERS.slice(),
  }));
}

function loadQuestionsMap(testId) {
  const rows = db.prepare('SELECT * FROM questions WHERE test_id = ?').all(testId);
  const map = new Map();
  rows.forEach((r) => map.set(r.id, r));
  return map;
}

/** Studentga yuboriladigan savollar (to'g'ri javobsiz!). */
function publicQuestions(layout, qmap) {
  return layout.map((item, i) => {
    const q = qmap.get(item.q);
    return {
      id: q.id,
      number: i + 1,
      question: q.question,
      options: item.o.map((orig, pos) => ({ key: LETTERS[pos], text: q[OPT_COL[orig]] })),
    };
  });
}

/** Saqlangan javoblar: {questionId: ko'rsatilgan harf} */
function savedAnswersForClient(attemptId, layout) {
  const rows = db
    .prepare('SELECT question_id, selected_answer FROM answers WHERE attempt_id = ? AND selected_answer IS NOT NULL')
    .all(attemptId);
  const byQ = new Map(layout.map((l) => [l.q, l]));
  const out = {};
  rows.forEach((r) => {
    const l = byQ.get(r.question_id);
    if (!l) return;
    const pos = l.o.indexOf(r.selected_answer);
    if (pos >= 0) out[r.question_id] = LETTERS[pos];
  });
  return out;
}

/** Ko'rsatilgan harfni asl harfga o'giradi (yoki null). */
function displayToOriginal(layoutItem, displayLetter) {
  const pos = LETTERS.indexOf(String(displayLetter || '').toUpperCase());
  return pos >= 0 ? layoutItem.o[pos] : null;
}

function remainingMs(attempt, now = Date.now()) {
  return Math.max(0, attempt.deadline_at - now);
}

/**
 * Urinishni yakunlaydi: javoblarni baholaydi, ballni hisoblaydi.
 * Idempotent: allaqachon topshirilgan bo'lsa, hech narsa o'zgarmaydi (false qaytaradi).
 */
const finalizeAttempt = db.transaction((attemptId, submittedAtMs) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.status === 'submitted') return false;

  const layout = JSON.parse(attempt.layout);
  const qmap = loadQuestionsMap(attempt.test_id);
  const saved = new Map(
    db
      .prepare('SELECT question_id, selected_answer FROM answers WHERE attempt_id = ?')
      .all(attemptId)
      .map((r) => [r.question_id, r.selected_answer])
  );

  const upsert = db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_answer, is_correct) VALUES (?, ?, ?, ?)
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET is_correct = excluded.is_correct`
  );

  let score = 0;
  for (const item of layout) {
    const q = qmap.get(item.q);
    if (!q) continue;
    const selected = saved.get(item.q) || null;
    const correct = selected !== null && selected === q.correct_answer ? 1 : 0;
    score += correct;
    upsert.run(attemptId, item.q, selected, correct);
  }

  const total = layout.length;
  const finishedAt = Math.min(submittedAtMs ?? Date.now(), attempt.deadline_at);
  const res = db
    .prepare(
      `UPDATE attempts SET status = 'submitted', submitted_at = ?, score = ?, total_questions = ?, percentage = ?
       WHERE id = ? AND status = 'in_progress'`
    )
    .run(Math.max(finishedAt, attempt.started_at), score, total, pct(score, total), attemptId);
  return res.changes === 1;
});

/** Vaqti tugagan, lekin topshirilmagan urinishlarni avtomatik yakunlaydi. */
function finalizeExpired(testId = null) {
  const cutoff = Date.now() - GRACE_MS;
  const rows = testId
    ? db.prepare("SELECT id, deadline_at FROM attempts WHERE status = 'in_progress' AND deadline_at < ? AND test_id = ?").all(cutoff, testId)
    : db.prepare("SELECT id, deadline_at FROM attempts WHERE status = 'in_progress' AND deadline_at < ?").all(cutoff);
  rows.forEach((r) => finalizeAttempt(r.id, r.deadline_at));
  return rows.length;
}

function timeSpentSeconds(attempt) {
  if (!attempt.submitted_at) return null;
  return Math.max(0, Math.round((attempt.submitted_at - attempt.started_at) / 1000));
}

/** Student ko'radigan natija (test sozlamalariga qarab). */
function buildResultView(attempt, test) {
  const base = {
    submitted: true,
    student: { name: attempt.student_name, surname: attempt.student_surname },
    test: { title: test.title, subject: test.subject },
    time_spent: timeSpentSeconds(attempt),
    show_result: !!test.show_result,
    show_correct: !!test.show_correct,
  };
  if (!test.show_result) return base;

  const total = attempt.total_questions || 0;
  const correct = attempt.score || 0;
  const answered = db
    .prepare('SELECT COUNT(*) AS c FROM answers WHERE attempt_id = ? AND selected_answer IS NOT NULL')
    .get(attempt.id).c;
  const view = {
    ...base,
    score: correct,
    total,
    percentage: attempt.percentage || 0,
    correct,
    wrong: Math.max(0, answered - correct),
    unanswered: Math.max(0, total - answered),
  };

  if (test.show_correct) {
    const layout = JSON.parse(attempt.layout);
    const qmap = loadQuestionsMap(test.id);
    const ans = new Map(
      db
        .prepare('SELECT question_id, selected_answer, is_correct FROM answers WHERE attempt_id = ?')
        .all(attempt.id)
        .map((r) => [r.question_id, r])
    );
    view.review = layout.map((item, i) => {
      const q = qmap.get(item.q);
      const a = ans.get(item.q);
      const toDisplay = (orig) => (orig ? LETTERS[item.o.indexOf(orig)] : null);
      return {
        number: i + 1,
        question: q.question,
        options: item.o.map((orig, pos) => ({ key: LETTERS[pos], text: q[OPT_COL[orig]] })),
        selected: toDisplay(a && a.selected_answer),
        correct: toDisplay(q.correct_answer),
        is_correct: !!(a && a.is_correct),
      };
    });
  }
  return view;
}

module.exports = {
  GRACE_MS,
  OPT_COL,
  buildLayout,
  loadQuestionsMap,
  publicQuestions,
  savedAnswersForClient,
  displayToOriginal,
  remainingMs,
  finalizeAttempt,
  finalizeExpired,
  timeSpentSeconds,
  buildResultView,
};
