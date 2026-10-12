'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

require('./lib/env').loadEnv();
const { seedTeacher, DB_FILE, DATA_DIR, db } = require('./database');
const { finalizeExpired } = require('./lib/attempts');
const { requireTeacherPage } = require('./middleware/auth');
const { notFoundApi, errorHandler } = require('./middleware/errors');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const isProd = process.env.NODE_ENV === 'production';

/** Session sirini muhitdan oladi yoki data/ papkada bir marta yaratib saqlaydi. */
function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (DB_FILE === ':memory:') return crypto.randomBytes(32).toString('hex');
  const file = path.join(DATA_DIR, '.session-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (_) {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

  // Xavfsizlik sarlavhalari
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(
    session({
      name: 'otp.sid',
      secret: loadSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 12 },
    })
  );

  // API: javoblar hech qachon keshlanmasin
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/tests', require('./routes/tests'));
  app.use('/api/test', require('./routes/students'));
  app.use('/api', require('./routes/results'));
  app.use('/api', notFoundApi);

  // O'qituvchi sahifalari: kirmagan bo'lsa bosh sahifaga
  const TEACHER_PAGES = ['teacher', 'tests', 'create-test', 'upload-test', 'results', 'analytics', 'settings'];
  const teacherRe = new RegExp(`^/(${TEACHER_PAGES.join('|')})(\\.html)?$`);
  app.get(teacherRe, requireTeacherPage, (req, res) => {
    const name = req.path.replace(/^\//, '').replace(/\.html$/, '');
    res.sendFile(path.join(PUBLIC_DIR, `${name}.html`));
  });

  // Student test sahifasi: /test/ABCD12
  app.get('/test/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'student-test.html')));
  app.get('/test', (req, res) => res.redirect('/'));

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });
  app.use(errorHandler);
  return app;
}

function start() {
  const created = seedTeacher();
  const app = createApp();

  // Vaqti tugagan testlarni har 20 soniyada avtomatik yakunlash
  const sweeper = setInterval(() => {
    try {
      finalizeExpired();
    } catch (e) {
      console.error('[sweeper]', e.message);
    }
  }, 20000);
  sweeper.unref();

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('  Online Test Platform ishga tushdi');
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  Baza: ${DB_FILE}  (${db.driver})`);
    if (created) {
      console.log('');
      console.log("  Birinchi marta ishga tushirildi — o'qituvchi hisobi yaratildi:");
      console.log(`    Email:  ${created.email}`);
      console.log(`    Parol:  ${created.password}`);
      console.log("  (Parolni Sozlamalar sahifasidan o'zgartiring)");
    }
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ${PORT}-port band. Boshqa portda ishga tushiring:  PORT=3001 npm start\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => {
      try {
        db.close();
      } catch (_) {
        /* e'tiborsiz */
      }
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
