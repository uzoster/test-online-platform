'use strict';
/**
 * SQLite ulanishi va sxema.
 *
 * Asosiy drayver: better-sqlite3 (package.json'da e'lon qilingan).
 * Agar u o'rnatilmagan / kompilyatsiya bo'lmagan bo'lsa va Node >= 22.5 bo'lsa,
 * Node'ning o'rnatilgan `node:sqlite` moduliga avtomatik o'tadi.
 * Ikkalasi uchun ham bir xil kichik interfeys beriladi: exec / prepare / transaction.
 */
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./lib/password');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'platform.db');

if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

function openDriver(file) {
  let firstError;
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const raw = new BetterSqlite3(file);
    raw.pragma('journal_mode = WAL');
    raw.pragma('foreign_keys = ON');
    return { name: 'better-sqlite3', raw };
  } catch (err) {
    firstError = err;
  }
  try {
    const { DatabaseSync } = require('node:sqlite');
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    return { name: 'node:sqlite', raw };
  } catch (err) {
    const e = new Error(
      "SQLite drayverini ochib bo'lmadi.\n" +
        " - better-sqlite3: " + firstError.message.split('\n')[0] + '\n' +
        " - node:sqlite: " + err.message.split('\n')[0] + '\n' +
        "Yechim: `npm install` ni qayta ishga tushiring yoki Node.js 22.5+ dan foydalaning."
    );
    e.cause = err;
    throw e;
  }
}

const driver = openDriver(DB_FILE);
const raw = driver.raw;

/** Parametrlarni normallashtirish: boolean -> 0/1, undefined -> null */
function norm(params) {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p));
}

const db = {
  driver: driver.name,
  exec(sql) {
    raw.exec(sql);
  },
  prepare(sql) {
    const st = raw.prepare(sql);
    return {
      run: (...p) => st.run(...norm(p)),
      get: (...p) => st.get(...norm(p)),
      all: (...p) => st.all(...norm(p)),
    };
  },
  /** fn ni bitta tranzaksiyada bajaradigan funksiya qaytaradi (ichma-ich emas). */
  transaction(fn) {
    return (...args) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch (_) {
          /* e'tiborsiz */
        }
        throw err;
      }
    };
  },
  close() {
    raw.close();
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS teachers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  subject          TEXT NOT NULL DEFAULT '',
  group_name       TEXT NOT NULL DEFAULT '',
  duration         INTEGER NOT NULL DEFAULT 20,
  question_count   INTEGER,
  test_code        TEXT UNIQUE,
  is_published     INTEGER NOT NULL DEFAULT 0,
  random_questions INTEGER NOT NULL DEFAULT 1,
  random_answers   INTEGER NOT NULL DEFAULT 1,
  show_result      INTEGER NOT NULL DEFAULT 1,
  show_correct     INTEGER NOT NULL DEFAULT 0,
  allow_retake     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id        INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A','B','C','D'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id         INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_name    TEXT NOT NULL,
  student_surname TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  layout          TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  deadline_at     INTEGER NOT NULL,
  submitted_at    INTEGER,
  score           INTEGER,
  total_questions INTEGER,
  percentage      REAL
);

CREATE TABLE IF NOT EXISTS answers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id      INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer TEXT CHECK (selected_answer IS NULL OR selected_answer IN ('A','B','C','D')),
  is_correct      INTEGER,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_tests_teacher    ON tests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_test   ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test    ON attempts(test_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_status  ON attempts(status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_answers_attempt  ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
`);

/** Birinchi ishga tushirishda standart o'qituvchi yaratish. */
function seedTeacher() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM teachers').get().c;
  if (count > 0) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@test.uz').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const name = process.env.ADMIN_NAME || "O'qituvchi";
  db.prepare('INSERT INTO teachers (name, email, password) VALUES (?, ?, ?)').run(
    name,
    email,
    hashPassword(password)
  );
  return { email, password };
}

module.exports = { db, seedTeacher, DB_FILE, DATA_DIR, ROOT };
