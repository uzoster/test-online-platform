'use strict';
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../server/lib/gemini');

const okResponse = (payload) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
});

const sample = [
  { question: '2+2?', A: '3', B: '4', C: '5', D: '6', correct_answer: 'B' },
  { question: '2+2?', A: '3', B: '4', C: '5', D: '6', correct_answer: 'B' }, // takror
  { question: 'Bir xil', A: 'x', B: 'x', C: 'y', D: 'z', correct_answer: 'A' }, // bir xil variantlar
  { question: 'Yaroqsiz', A: 'a', B: 'b', C: 'c', D: 'd', correct_answer: 'E' },
  { question: 'Poytaxt?', A: 'Toshkent', B: 'Samarqand', C: 'Buxoro', D: 'Xiva', correct_answer: 'A' },
];

test('normalize: takror va yaroqsizlarni olib tashlaydi, to\'g\'ri javobni saqlaydi', () => {
  for (let i = 0; i < 50; i++) {
    const out = gemini.normalize(sample, 10);
    assert.equal(out.length, 2);
    const q = out[1];
    const map = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d };
    assert.equal(map[q.correct_answer], 'Toshkent');
  }
});

test('kalit yo\'q bo\'lsa 503', async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(() => gemini.generateQuestions({ topic: 'x', count: 2 }), (e) => e.status === 503);
});

test('generateQuestions: muvaffaqiyatli javob va kalit sarlavhada', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let seen;
  const f = async (url, init) => {
    seen = { url, init };
    return okResponse(sample)();
  };
  const out = await gemini.generateQuestions({ topic: 'Matematika', count: 5, difficulty: 'easy', language: 'uz' }, f);
  assert.equal(out.length, 2);
  assert.equal(seen.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!seen.url.includes('test-key'));
  assert.ok(seen.url.includes(':generateContent'));
});

test('Gemini xatolari tushunarli xabarga aylanadi', async () => {
  process.env.GEMINI_API_KEY = 'bad';
  const f = (status, message) => async () => ({ ok: false, status, json: async () => ({ error: { message } }) });
  await assert.rejects(() => gemini.generateQuestions({ topic: 'x', count: 1 }, f(400, 'API key not valid')), (e) => e.status === 502 && /kalit/i.test(e.message));
  await assert.rejects(() => gemini.generateQuestions({ topic: 'x', count: 1 }, f(429, 'quota')), (e) => e.status === 429);
  delete process.env.GEMINI_API_KEY;
});

test('503 bo\'lsa qayta urinadi va muvaffaqiyatga erishadi', async () => {
  process.env.GEMINI_API_KEY = 'k';
  process.env.NODE_ENV = 'test';
  let calls = 0;
  const f = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
    return okResponse(sample)();
  };
  const out = await gemini.generateQuestions({ topic: 'x', count: 5 }, f);
  assert.equal(calls, 3);
  assert.equal(out.length, 2);
  delete process.env.GEMINI_API_KEY;
});
