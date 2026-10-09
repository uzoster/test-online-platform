'use strict';
const crypto = require('crypto');

const LETTERS = ['A', 'B', 'C', 'D'];
// O/0, I/1/L kabi chalkash belgilarsiz alifbo
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Kriptografik Fisher–Yates aralashtirish (yangi massiv qaytaradi). */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return out;
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function cleanText(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Ko'p qatorli matn uchun (savol matni) — qator tashlashni saqlaydi. */
function cleanMultiline(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function toInt(v, def = null) {
  if (v === '' || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function toBool(v, def) {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['1', 'true', 'on', 'yes', 'ha'].includes(String(v).toLowerCase());
}

function pct(score, total) {
  if (!total) return 0;
  return Math.round((score / total) * 1000) / 10; // 1 xona aniqlik
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Express async/sync handlerlarini xatolikdan himoyalash. */
const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  LETTERS,
  shuffle,
  makeCode,
  makeToken,
  cleanText,
  cleanMultiline,
  toInt,
  toBool,
  pct,
  HttpError,
  wrap,
};
