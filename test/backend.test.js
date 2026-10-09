'use strict';
/**
 * Backend mantig'i testlari (Node'ning o'rnatilgan `node --test` yordamida).
 * Express'siz — controllerlar to'g'ridan-to'g'ri soxta req/res bilan chaqiriladi,
 * baza esa xotirada (:memory:) ishlaydi.
 *   npm test
 */
process.env.DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, seedTeacher } = require('../server/database');
const { hashPassword, verifyPassword } = require('../server/lib/password');
const { parseRows } = require('../server/lib/excel');
const tests = require('../server/controllers/testController');
const student = require('../server/controllers/studentController');
const results = require('../server/controllers/resultController');
const auth = require('../server/controllers/authController');

/* ---------- soxta req/res ---------- */
function call(handler, { params = {}, body = {}, query = {}, teacherId = 1 } = {}) {
  const req = {
    params,
    body,
    query,
    session: { teacherId },
    protocol: 'http',
    get: () => 'localhost:3000',
  };
  const out = { status: 200, json: null, headers: {} };
  const res = {
    status(s) { out.status = s; return this; },
    json(j) { out.json = j; return this; },
    set(h) { Object.assign(out.headers, h); return this; },
    send(b) { out.body = b; return this; },
  };
  try {
    handler(req, res);
  } catch (e) {
    out.error = e;
    out.status = e.status || 500;
  }
  return out;
}

const Q = (n, correct = 'B') => ({
  question: `Savol ${n}?`,
  option_a: `a${n}`,
  option_b: `b${n}`,
  option_c: `c${n}`,
  option_d: `d${n}`,
  correct_answer: correct,
});
const questions = (count) => Array.from({ length: count }, (_, i) => Q(i + 1, 'ABCD'[i % 4]));

seedTeacher();

/* ---------- parol ---------- */
test('parol xeshlash va tekshirish', () => {
  const h = hashPassword('sir123');
  assert.ok(verifyPassword('sir123', h));
  assert.ok(!verifyPassword('boshqa', h));
  assert.ok(!verifyPassword('x', 'noto‘g‘ri'));
});

test('login: to‘g‘ri va noto‘g‘ri parol', () => {
  const bad = call(auth.login, { body: { email: 'admin@test.uz', password: 'xato' } });
  assert.equal(bad.status, 401);
  // to'g'ri login session.regenerate talab qiladi — uni soxtalashtiramiz
  const req = {
    body: { email: 'ADMIN@test.uz', password: 'admin123' },
    session: { regenerate: (cb) => cb(null) },
  };
  let payload;
  auth.login(req, { json: (j) => (payload = j) }, (e) => { throw e; });
  assert.equal(payload.teacher.email, 'admin@test.uz');
});

/* ---------- Excel qatorlarini tekshirish ---------- */
test('parseRows: to‘g‘ri qatorlar va xatolar', () => {
  const rows = [
    ['Question', 'A', 'B', 'C', 'D', 'CorrectAnswer'],
    ["O'zbekiston qachon mustaqil bo'lgan?", 1989, '1991', '1995', '1992', 'B'],
    ['2+2 nechaga teng?', '3', '4', '5', '6', ' b) '],
    ['', '', '', '', '', ''], // bo'sh qator o'tkazib yuboriladi
    ['Xato javob', 'x', 'y', 'z', 'w', 'E'],
    ['Variant yetishmaydi', 'x', 'y', '', 'w', 'A'],
  ];
  const r = parseRows(rows);
  assert.equal(r.found, 4);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].option_a, '1989');
  assert.equal(r.questions[1].correct_answer, 'B');
  const e = r.errors.find((x) => x.row === 5);
  assert.match(e.message, /Faqat A, B, C yoki D/);
  assert.ok(r.errors.some((x) => x.row === 6 && /bo'sh: C/.test(x.message)));
});

test('parseRows: ustun tartibi va nomlari erkin, sarlavha yo‘q bo‘lsa xato', () => {
  const ok = parseRows([['correct', 'savol', 'a', 'b', 'c', 'd'], ['C', 'Q1', '1', '2', '3', '4']]);
  assert.equal(ok.questions.length, 1);
  assert.equal(ok.questions[0].correct_answer, 'C');
  assert.equal(ok.questions[0].option_d, '4');
  const bad = parseRows([['foo', 'bar'], ['1', '2']]);
  assert.ok(bad.fatal);
});

/* ---------- test yaratish va e'lon qilish ---------- */
let testId;
let code;

test('test yaratish, validatsiya va e‘lon qilish', () => {
  assert.equal(call(tests.createTest, { body: { title: '' } }).status, 400);
  assert.equal(
    call(tests.createTest, { body: { title: 'X', questions: [{ ...Q(1), correct_answer: 'Z' }] } }).status,
    400
  );

  const r = call(tests.createTest, {
    body: { title: 'Kimyo', subject: 'Kimyo', group_name: '9-A', duration: 20, questions: questions(8) },
  });
  assert.equal(r.status, 201);
  testId = r.json.test.id;
  assert.equal(r.json.test.is_published, false);
  assert.equal(r.json.test.total_questions, 8);

  // boshqa o'qituvchi ko'ra olmaydi
  assert.equal(call(tests.getTest, { params: { id: testId }, teacherId: 999 }).status, 404);

  const pub = call(tests.publishTest, { params: { id: testId } });
  assert.equal(pub.status, 200);
  code = pub.json.test_code;
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal(pub.json.link, `http://localhost:3000/test/${code}`);

  // qayta e'lon qilish kodni o'zgartirmaydi
  assert.equal(call(tests.publishTest, { params: { id: testId } }).json.test_code, code);

  // savolsiz testni e'lon qilib bo'lmaydi
  const empty = call(tests.createTest, { body: { title: 'Bo‘sh' } }).json.test.id;
  assert.equal(call(tests.publishTest, { params: { id: empty } }).status, 400);
});

/* ---------- student oqimi ---------- */
const params = () => ({ code });

test('ommaviy ma‘lumot to‘g‘ri javoblarni oshkor qilmaydi', () => {
  const info = call(student.getPublicTest, { params: params() });
  assert.equal(info.status, 200);
  assert.equal(info.json.test.total_questions, 8);
  assert.equal(call(student.getPublicTest, { params: { code: 'ZZZZZZ' } }).status, 404);

  const start = call(student.startTest, { params: params(), body: { name: 'Anvar', surname: 'Aliyev' } });
  assert.equal(start.status, 201);
  const raw = JSON.stringify(start.json);
  assert.ok(!/correct/i.test(raw), "start javobida 'correct' bo'lmasligi kerak");
  assert.equal(start.json.questions.length, 8);
  assert.ok(start.json.remaining > 19 * 60 && start.json.remaining <= 20 * 60);
  // savol tartibi tasodifiy, lekin to'plam bir xil
  assert.deepEqual(start.json.questions.map((q) => q.id).sort((a, b) => a - b),
    db.prepare('SELECT id FROM questions WHERE test_id = ? ORDER BY id').all(testId).map((r) => r.id));
});

test('tasodifiylashtirish: variantlar aralashsa ham baholash to‘g‘ri', () => {
  let anyDifferentOrder = false;
  let anyShuffledOptions = false;
  for (let s = 0; s < 6; s++) {
    const st = call(student.startTest, {
      params: params(),
      body: { name: `Student${s}`, surname: 'Test' },
    });
    assert.equal(st.status, 201);
    const { token, questions: qs } = st.json;
    if (qs.map((q) => q.id).join() !== [...qs.map((q) => q.id)].sort((a, b) => a - b).join()) anyDifferentOrder = true;

    // Har bir savol uchun to'g'ri variantni MATN bo'yicha topamiz (b<n> = original B ...)
    const answers = {};
    qs.forEach((q) => {
      const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(q.id);
      const correctText = row[`option_${row.correct_answer.toLowerCase()}`];
      const pos = q.options.findIndex((o) => o.text === correctText);
      if (q.options.map((o) => o.text).join() !== [row.option_a, row.option_b, row.option_c, row.option_d].join()) {
        anyShuffledOptions = true;
      }
      answers[q.id] = q.options[pos].key;
    });
    const sub = call(student.submitTest, { params: params(), body: { token, answers } });
    assert.equal(sub.status, 200);
    assert.equal(sub.json.score, 8, 'hammasi to\'g\'ri belgilangan bo\'lishi kerak');
    assert.equal(sub.json.percentage, 100);
  }
  assert.ok(anyDifferentOrder, 'savollar tartibi aralashishi kerak');
  assert.ok(anyShuffledOptions, 'variantlar aralashishi kerak');
});

test('resume, autosave, qayta topshirishni bloklash, takror ism', () => {
  const st = call(student.startTest, { params: params(), body: { name: 'Karim', surname: 'Sardor' } });
  const { token, questions: qs } = st.json;

  // takror ism (qayta topshirishga ruxsat yo'q)
  assert.equal(call(student.startTest, { params: params(), body: { name: 'karim', surname: 'SARDOR' } }).status, 409);

  // autosave
  const q0 = qs[0];
  // tasodifiy variant tartibida ham albatta NOTO'G'RI bo'lgan harfni tanlaymiz
  const q0row = db.prepare('SELECT * FROM questions WHERE id = ?').get(q0.id);
  const q0correctText = q0row[`option_${q0row.correct_answer.toLowerCase()}`];
  const WRONG = q0.options.find((o) => o.text !== q0correctText).key;
  assert.equal(call(student.saveAnswer, { params: params(), body: { token, questionId: q0.id, answer: WRONG } }).status, 200);
  assert.equal(call(student.saveAnswer, { params: params(), body: { token, questionId: q0.id, answer: 'X' } }).status, 400);
  assert.equal(call(student.saveAnswer, { params: params(), body: { token, questionId: 999999, answer: 'A' } }).status, 400);

  // resume: javob saqlangan, timer boshidan emas
  const res = call(student.resumeTest, { params: params(), body: { token } });
  assert.equal(res.status, 200);
  assert.equal(res.json.answers[q0.id], WRONG);
  assert.equal(res.json.questions.map((q) => q.id).join(), qs.map((q) => q.id).join(), 'tartib o\'zgarmasligi kerak');
  assert.ok(res.json.remaining <= st.json.remaining);

  // yaroqsiz token
  assert.equal(call(student.resumeTest, { params: params(), body: { token: 'nope' } }).status, 404);

  // topshirish va qayta topshirishni bloklash
  const sub = call(student.submitTest, { params: params(), body: { token, answers: {} } });
  assert.equal(sub.status, 200);
  assert.equal(sub.json.unanswered, 7);
  assert.equal(sub.json.wrong, 1);
  assert.equal(call(student.submitTest, { params: params(), body: { token } }).status, 409);
  assert.equal(call(student.saveAnswer, { params: params(), body: { token, questionId: q0.id, answer: 'A' } }).status, 409);
  assert.equal(call(student.resumeTest, { params: params(), body: { token } }).json.submitted, true);
  assert.equal(call(student.getResult, { params: params(), query: { token } }).status, 200);
});

test('server vaqtni nazorat qiladi: kechikkan topshirish faqat vaqtida saqlanganlarni hisoblaydi', () => {
  const st = call(student.startTest, { params: params(), body: { name: 'Kech', surname: 'Qolgan' } });
  const { token, questions: qs } = st.json;
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(qs[0].id);
  const correctText = row[`option_${row.correct_answer.toLowerCase()}`];
  const key = qs[0].options.find((o) => o.text === correctText).key;

  // 1 ta javob vaqtida saqlanadi
  assert.equal(call(student.saveAnswer, { params: params(), body: { token, questionId: qs[0].id, answer: key } }).status, 200);

  // vaqtni o'tkazib yuboramiz
  db.prepare('UPDATE attempts SET deadline_at = ? WHERE token = ?').run(Date.now() - 60_000, token);

  // endi hamma javobni yuborishga urinadi — e'tiborga olinmasligi kerak
  const all = {};
  qs.forEach((q) => {
    const r = db.prepare('SELECT * FROM questions WHERE id = ?').get(q.id);
    const t = r[`option_${r.correct_answer.toLowerCase()}`];
    all[q.id] = q.options.find((o) => o.text === t).key;
  });
  const sub = call(student.submitTest, { params: params(), body: { token, answers: all } });
  assert.equal(sub.status, 200);
  assert.equal(sub.json.time_over, true);
  assert.equal(sub.json.score, 1, 'faqat vaqtida saqlangan javob hisoblanadi');
});

test('vaqt tugagach javob saqlash rad etiladi va urinish yakunlanadi', () => {
  const st = call(student.startTest, { params: params(), body: { name: 'Kech', surname: 'Saqlovchi' } });
  const { token, questions: qs } = st.json;
  db.prepare('UPDATE attempts SET deadline_at = ? WHERE token = ?').run(Date.now() - 60_000, token);
  const late = call(student.saveAnswer, { params: params(), body: { token, questionId: qs[0].id, answer: 'A' } });
  assert.equal(late.status, 410);
  assert.equal(late.error.extra.time_over, true);
  // urinish yakunlangan — qayta topshirib bo'lmaydi
  assert.equal(call(student.submitTest, { params: params(), body: { token, answers: {} } }).status, 409);
  assert.equal(call(student.resumeTest, { params: params(), body: { token } }).json.submitted, true);
});

test('vaqti tugagan, topshirilmagan urinish avtomatik yakunlanadi', () => {
  const st = call(student.startTest, { params: params(), body: { name: 'Qolib', surname: 'Ketgan' } });
  db.prepare('UPDATE attempts SET deadline_at = ? WHERE token = ?').run(Date.now() - 60_000, st.json.token);
  const r = call(results.getResults, { params: { id: testId } });
  const row = r.json.attempts.find((a) => a.student_surname === 'Ketgan');
  assert.equal(row.status, 'submitted');
  assert.equal(row.score, 0);
  assert.equal(row.total_questions, 8);
});

test('savollar soni cheklovi va qayta topshirishga ruxsat', () => {
  const t = call(tests.createTest, {
    body: { title: 'Pool', duration: 5, question_count: 3, allow_retake: true, random_questions: true, questions: questions(10) },
  }).json.test;
  const c2 = call(tests.publishTest, { params: { id: t.id } }).json.test_code;
  const a = call(student.startTest, { params: { code: c2 }, body: { name: 'Bir', surname: 'Xil' } });
  assert.equal(a.json.questions.length, 3);
  assert.equal(a.json.total, 3);
  // allow_retake yoqilgan: bir xil ism bilan qayta boshlash mumkin
  assert.equal(call(student.startTest, { params: { code: c2 }, body: { name: 'Bir', surname: 'Xil' } }).status, 201);
});

test('yopilgan test yangi urinishni qabul qilmaydi, boshlanganini yakunlashga ruxsat beradi', () => {
  const st = call(student.startTest, { params: params(), body: { name: 'Davom', surname: 'Etuvchi' } });
  call(tests.unpublishTest, { params: { id: testId } });
  assert.equal(call(student.startTest, { params: params(), body: { name: 'Yangi', surname: 'Kelgan' } }).status, 403);
  assert.equal(call(student.getPublicTest, { params: params() }).status, 403);
  assert.equal(call(student.submitTest, { params: params(), body: { token: st.json.token, answers: {} } }).status, 200);
  call(tests.publishTest, { params: { id: testId } });
});

test('natija sozlamalari: show_result / show_correct', () => {
  const mk = (extra) => {
    const t = call(tests.createTest, { body: { title: 'S', questions: questions(4), ...extra } }).json.test;
    const cd = call(tests.publishTest, { params: { id: t.id } }).json.test_code;
    const st = call(student.startTest, { params: { code: cd }, body: { name: 'Nom', surname: 'Fam' } });
    return call(student.submitTest, { params: { code: cd }, body: { token: st.json.token, answers: {} } }).json;
  };
  const hidden = mk({ show_result: false });
  assert.equal(hidden.score, undefined);
  assert.equal(hidden.show_result, false);

  const plain = mk({ show_result: true, show_correct: false });
  assert.equal(plain.total, 4);
  assert.equal(plain.review, undefined);

  const withReview = mk({ show_result: true, show_correct: true });
  assert.equal(withReview.review.length, 4);
  assert.equal(withReview.review[0].selected, null);
  assert.ok(['A', 'B', 'C', 'D'].includes(withReview.review[0].correct));
});

/* ---------- o'qituvchi: natijalar, tafsilot, analytics, dashboard ---------- */
test('natijalar, student tafsiloti va analytics', () => {
  const r = call(results.getResults, { params: { id: testId } });
  assert.equal(r.status, 200);
  assert.ok(r.json.summary.participants >= 8);
  const perfect = r.json.attempts.find((a) => a.percentage === 100);
  assert.ok(perfect);

  const d = call(results.getAttempt, { params: { id: perfect.id } });
  assert.equal(d.status, 200);
  assert.equal(d.json.questions.length, 8);
  assert.ok(d.json.questions.every((q) => q.is_correct));

  const wrong = r.json.attempts.find((a) => a.student_surname === 'Sardor');
  const wd = call(results.getAttempt, { params: { id: wrong.id } });
  const bad = wd.json.questions.find((q) => !q.is_correct && q.selected);
  assert.ok(bad, 'noto\'g\'ri javob berilgan savol bo\'lishi kerak');
  assert.ok(bad.correct_text);

  // boshqa o'qituvchi tafsilotni ko'ra olmaydi
  assert.equal(call(results.getAttempt, { params: { id: perfect.id }, teacherId: 999 }).status, 404);

  const an = call(results.getAnalytics, { params: { id: testId } });
  assert.equal(an.status, 200);
  assert.equal(an.json.questions.length, 8);
  assert.equal(an.json.participants, r.json.summary.participants);
  const q1 = an.json.questions[0];
  assert.equal(q1.attempts, r.json.summary.participants);
  assert.ok(q1.accuracy >= 0 && q1.accuracy <= 100);
  assert.equal(
    q1.picks.A + q1.picks.B + q1.picks.C + q1.picks.D + q1.picks.none,
    q1.attempts
  );
  assert.ok(an.json.hardest.length > 0 && an.json.hardest[0].accuracy <= an.json.hardest.at(-1).accuracy);
  assert.equal(an.json.distribution.reduce((s, b) => s + b.count, 0), an.json.participants);
});

test('dashboard statistikasi', () => {
  const s = call(results.getStats);
  assert.equal(s.status, 200);
  assert.ok(s.json.total_tests >= 3);
  assert.ok(s.json.participants >= 10);
  assert.ok(s.json.today_tests >= 1);
  assert.equal(s.json.last_7_days.length, 7);
  assert.ok(s.json.recent_attempts.length > 0);
});

test('natijasi bor testning savollarini o‘zgartirib bo‘lmaydi, sozlamalarni mumkin', () => {
  const full = call(tests.getTest, { params: { id: testId } });
  assert.equal(full.json.locked, true);
  assert.equal(call(tests.updateTest, { params: { id: testId }, body: { questions: questions(2) } }).status, 409);
  assert.equal(call(tests.addQuestions, { params: { id: testId }, body: { questions: [Q(99)] } }).status, 409);
  const ok = call(tests.updateTest, { params: { id: testId }, body: { duration: 30, show_correct: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.test.duration, 30);
  assert.equal(ok.json.test.show_correct, true);
});

test('studentni va testni o‘chirish bog‘langan ma‘lumotlarni tozalaydi', () => {
  const t = call(tests.createTest, { body: { title: 'Del', questions: questions(2) } }).json.test;
  const cd = call(tests.publishTest, { params: { id: t.id } }).json.test_code;
  const st = call(student.startTest, { params: { code: cd }, body: { name: 'Del', surname: 'Ete' } });
  call(student.submitTest, { params: { code: cd }, body: { token: st.json.token, answers: {} } });
  const aid = db.prepare('SELECT id FROM attempts WHERE token = ?').get(st.json.token).id;
  assert.equal(call(results.deleteAttempt, { params: { id: aid } }).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM answers WHERE attempt_id = ?').get(aid).c, 0);
  assert.equal(call(tests.deleteTest, { params: { id: t.id } }).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM questions WHERE test_id = ?').get(t.id).c, 0);
});
