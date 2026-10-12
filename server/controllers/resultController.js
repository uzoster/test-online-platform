'use strict';
const { db } = require('../database');
const { finalizeExpired, timeSpentSeconds, MAX_WARNINGS } = require('../lib/attempts');
const { buildResultsWorkbook } = require('../lib/excel');
const { HttpError, toInt } = require('../lib/util');

function ownedTest(req) {
  const id = toInt(req.params.id);
  const t = id && db.prepare('SELECT * FROM tests WHERE id = ? AND teacher_id = ?').get(id, req.session.teacherId);
  if (!t) throw new HttpError(404, 'Test topilmadi.');
  return t;
}

function fmtTime(sec) {
  if (sec === null || sec === undefined) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function attemptRow(a) {
  return {
    id: a.id,
    student_name: a.student_name,
    student_surname: a.student_surname,
    status: a.status,
    score: a.score,
    total_questions: a.total_questions,
    percentage: a.percentage,
    started_at: a.started_at,
    submitted_at: a.submitted_at,
    time_spent: timeSpentSeconds(a),
    violations: a.violations || 0,
    cheat_stop: (a.violations || 0) > MAX_WARNINGS,
  };
}

/* ---------- GET /api/tests/:id/results ---------- */
function getResults(req, res) {
  const t = ownedTest(req);
  finalizeExpired(t.id);
  const rows = db
    .prepare('SELECT * FROM attempts WHERE test_id = ? ORDER BY (status = \'submitted\') DESC, percentage DESC, id ASC')
    .all(t.id);
  const done = rows.filter((r) => r.status === 'submitted');
  const percentages = done.map((r) => r.percentage || 0);
  const average = done.length ? Math.round((percentages.reduce((a, b) => a + b, 0) / done.length) * 10) / 10 : 0;

  res.json({
    test: { id: t.id, title: t.title, subject: t.subject, group_name: t.group_name, duration: t.duration },
    summary: {
      participants: done.length,
      in_progress: rows.length - done.length,
      average,
      highest: done.length ? Math.max(...percentages) : 0,
      lowest: done.length ? Math.min(...percentages) : 0,
    },
    attempts: rows.map(attemptRow),
  });
}

/* ---------- GET /api/attempts/:id ---------- */
function getAttempt(req, res) {
  const id = toInt(req.params.id);
  const a = id && db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  const t = a && db.prepare('SELECT * FROM tests WHERE id = ? AND teacher_id = ?').get(a.test_id, req.session.teacherId);
  if (!a || !t) throw new HttpError(404, 'Natija topilmadi.');

  finalizeExpired(t.id);
  const fresh = db.prepare('SELECT * FROM attempts WHERE id = ?').get(a.id);
  if (fresh.status !== 'submitted') throw new HttpError(409, 'Bu student hali testni tugatmagan.');

  const layout = JSON.parse(fresh.layout);
  const inLayout = new Set(layout.map((l) => l.q));
  const allQuestions = db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY id').all(t.id);
  const answers = new Map(
    db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(fresh.id).map((r) => [r.question_id, r])
  );

  const questions = [];
  allQuestions.forEach((q, idx) => {
    if (!inLayout.has(q.id)) return;
    const ans = answers.get(q.id);
    const selected = ans ? ans.selected_answer : null;
    const text = (l) => (l ? q[`option_${l.toLowerCase()}`] : null);
    questions.push({
      number: idx + 1,
      question: q.question,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      selected,
      selected_text: text(selected),
      correct: q.correct_answer,
      correct_text: text(q.correct_answer),
      is_correct: !!(ans && ans.is_correct),
    });
  });

  const answered = questions.filter((q) => q.selected).length;
  res.json({
    attempt: { ...attemptRow(fresh), answered, wrong: answered - (fresh.score || 0), unanswered: questions.length - answered },
    test: { id: t.id, title: t.title },
    questions,
  });
}

/* ---------- DELETE /api/attempts/:id ---------- */
function deleteAttempt(req, res) {
  const id = toInt(req.params.id);
  const a = id && db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  const t = a && db.prepare('SELECT id FROM tests WHERE id = ? AND teacher_id = ?').get(a.test_id, req.session.teacherId);
  if (!a || !t) throw new HttpError(404, 'Natija topilmadi.');
  db.prepare('DELETE FROM attempts WHERE id = ?').run(a.id);
  res.json({ ok: true });
}

/* ---------- GET /api/tests/:id/analytics ---------- */
function getAnalytics(req, res) {
  const t = ownedTest(req);
  finalizeExpired(t.id);

  const done = db.prepare("SELECT percentage FROM attempts WHERE test_id = ? AND status = 'submitted'").all(t.id);
  const participants = done.length;

  const rows = db
    .prepare(
      `SELECT q.id, q.question, q.correct_answer,
         COUNT(a.id) AS attempts,
         COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct,
         COALESCE(SUM(CASE WHEN a.selected_answer = 'A' THEN 1 ELSE 0 END), 0) AS pick_a,
         COALESCE(SUM(CASE WHEN a.selected_answer = 'B' THEN 1 ELSE 0 END), 0) AS pick_b,
         COALESCE(SUM(CASE WHEN a.selected_answer = 'C' THEN 1 ELSE 0 END), 0) AS pick_c,
         COALESCE(SUM(CASE WHEN a.selected_answer = 'D' THEN 1 ELSE 0 END), 0) AS pick_d,
         COALESCE(SUM(CASE WHEN a.selected_answer IS NULL THEN 1 ELSE 0 END), 0) AS pick_none
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
         AND a.attempt_id IN (SELECT id FROM attempts WHERE test_id = ? AND status = 'submitted')
       WHERE q.test_id = ?
       GROUP BY q.id
       ORDER BY q.id`
    )
    .all(t.id, t.id);

  const questions = rows.map((r, i) => ({
    id: r.id,
    number: i + 1,
    question: r.question,
    correct_answer: r.correct_answer,
    attempts: r.attempts,
    correct: r.correct,
    accuracy: r.attempts ? Math.round((r.correct / r.attempts) * 100) : null,
    picks: { A: r.pick_a, B: r.pick_b, C: r.pick_c, D: r.pick_d, none: r.pick_none },
  }));

  const hardest = questions
    .filter((q) => q.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || a.number - b.number)
    .slice(0, 5);

  // Ball taqsimoti: 5 ta oraliq
  const buckets = [
    { label: '0–20%', from: 0, to: 20, count: 0 },
    { label: '21–40%', from: 20, to: 40, count: 0 },
    { label: '41–60%', from: 40, to: 60, count: 0 },
    { label: '61–80%', from: 60, to: 80, count: 0 },
    { label: '81–100%', from: 80, to: 100, count: 0 },
  ];
  done.forEach((d) => {
    const p = d.percentage || 0;
    const b = buckets.find((x) => p > x.from && p <= x.to) || buckets[0];
    b.count += 1;
  });

  const avg = participants ? Math.round((done.reduce((s, d) => s + (d.percentage || 0), 0) / participants) * 10) / 10 : 0;

  res.json({
    test: { id: t.id, title: t.title, subject: t.subject, group_name: t.group_name },
    participants,
    average: avg,
    questions,
    hardest,
    distribution: buckets.map(({ label, count }) => ({ label, count })),
  });
}

/* ---------- GET /api/stats (dashboard) ---------- */
function getStats(req, res) {
  finalizeExpired();
  const tid = req.session.teacherId;

  const totalTests = db.prepare('SELECT COUNT(*) AS c FROM tests WHERE teacher_id = ?').get(tid).c;
  const publishedTests = db.prepare('SELECT COUNT(*) AS c FROM tests WHERE teacher_id = ? AND is_published = 1').get(tid).c;
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS participants, AVG(a.percentage) AS avg
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE t.teacher_id = ? AND a.status = 'submitted'`
    )
    .get(tid);
  const live = db
    .prepare(
      `SELECT COUNT(*) AS c FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE t.teacher_id = ? AND a.status = 'in_progress'`
    )
    .get(tid).c;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayMs = dayStart.getTime();
  const weekStartDate = new Date(dayStart);
  weekStartDate.setDate(weekStartDate.getDate() - 6);
  const weekMs = weekStartDate.getTime();

  const weekRows = db
    .prepare(
      `SELECT a.started_at, a.test_id, a.percentage, a.status
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE t.teacher_id = ? AND a.started_at >= ?`
    )
    .all(tid, weekMs);

  const todayRows = weekRows.filter((r) => r.started_at >= todayMs);
  const todayTests = new Set(todayRows.map((r) => r.test_id)).size;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    const from = d.getTime();
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const inDay = weekRows.filter((r) => r.started_at >= from && r.started_at < next.getTime());
    days.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      count: inDay.length,
    });
  }

  const recent = db
    .prepare(
      `SELECT a.*, t.title AS test_title
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE t.teacher_id = ? AND a.status = 'submitted'
       ORDER BY a.submitted_at DESC LIMIT 8`
    )
    .all(tid)
    .map((a) => ({ ...attemptRow(a), test_id: a.test_id, test_title: a.test_title }));

  const topTests = db
    .prepare(
      `SELECT t.id, t.title, t.subject, t.is_published,
         COUNT(a.id) AS participants, ROUND(AVG(a.percentage), 1) AS avg_percentage
       FROM tests t LEFT JOIN attempts a ON a.test_id = t.id AND a.status = 'submitted'
       WHERE t.teacher_id = ?
       GROUP BY t.id ORDER BY participants DESC, t.id DESC LIMIT 5`
    )
    .all(tid);

  res.json({
    total_tests: totalTests,
    published_tests: publishedTests,
    participants: agg.participants || 0,
    average: agg.avg ? Math.round(agg.avg * 10) / 10 : 0,
    today_tests: todayTests,
    today_attempts: todayRows.length,
    live_attempts: live,
    last_7_days: days,
    recent_attempts: recent,
    top_tests: topTests,
  });
}

/* ---------- GET /api/tests/:id/results/export ---------- */
function exportResults(req, res) {
  const t = ownedTest(req);
  finalizeExpired(t.id);
  const rows = db
    .prepare("SELECT * FROM attempts WHERE test_id = ? AND status = 'submitted' ORDER BY student_surname COLLATE NOCASE, student_name COLLATE NOCASE")
    .all(t.id)
    .map((a) => ({
      surname: a.student_surname,
      name: a.student_name,
      score: a.score,
      total: a.total_questions,
      percentage: a.percentage,
      time: fmtTime(timeSpentSeconds(a)),
      violations: a.violations || 0,
      submitted: new Date(a.submitted_at).toLocaleString('sv-SE').replace('T', ' '),
    }));
  const buf = buildResultsWorkbook(t.title, rows);
  const safe = t.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'natijalar';
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="results.xlsx"; filename*=UTF-8''${encodeURIComponent(safe)}-natijalar.xlsx`,
    'Content-Length': buf.length,
  });
  res.send(buf);
}

module.exports = { getResults, getAttempt, deleteAttempt, getAnalytics, getStats, exportResults };
