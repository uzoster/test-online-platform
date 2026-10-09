/* Talaba sahifasi: kirish → test (taymer, navigatsiya, avtosaqlash) → natija. */
(function () {
  'use strict';
  const { $, $$, esc, api, icon, toast, openModal, mmss, BRAND_MARK } = App;

  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '').toUpperCase();
  const KEY = 'otp:' + code;
  const app = $('#app');
  const LETTERS = ['A', 'B', 'C', 'D'];

  const store = {
    get() {
      try { return localStorage.getItem(KEY); } catch (_) { return null; }
    },
    set(v) {
      try { localStorage.setItem(KEY, v); } catch (_) { /* e'tiborsiz */ }
    },
    clear() {
      try { localStorage.removeItem(KEY); } catch (_) { /* e'tiborsiz */ }
    },
  };

  const S = { token: null, questions: [], answers: {}, idx: 0, endAt: 0, timerId: null, finishing: false, title: '', retryQueue: new Map() };

  /* ---------- ekranlar ---------- */
  function showError(title, text, extra) {
    app.innerHTML =
      '<div class="center-card"><div class="panel"><span class="kicker">' + BRAND_MARK + 'Online test</span>' +
      '<h1 class="intro-title">' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p>' + (extra || '') +
      '<p style="margin-top:20px"><a class="btn" href="/">Bosh sahifa</a></p></div></div>';
  }

  function showIntro(t) {
    document.title = t.title + ' — Online test';
    S.title = t.title;
    app.innerHTML =
      '<div class="center-card"><form class="panel" id="intro" novalidate><span class="kicker">' + BRAND_MARK + 'ONLINE TEST</span>' +
      '<h1 class="intro-title">' + esc(t.title) + '</h1>' +
      '<div class="facts">' + (t.subject ? '<span class="badge plain">' + esc(t.subject) + '</span>' : '') + (t.group_name ? '<span class="badge plain">' + esc(t.group_name) + '</span>' : '') +
      '<span class="badge plain">' + icon('clock') + ' ' + t.duration + ' daqiqa</span><span class="badge plain">' + t.total_questions + ' ta savol</span></div>' +
      '<div class="stack"><div class="field"><label for="name">Ismingiz</label><input class="input" id="name" name="name" autocomplete="given-name" maxlength="60" required autofocus></div>' +
      '<div class="field"><label for="surname">Familiyangiz</label><input class="input" id="surname" name="surname" autocomplete="family-name" maxlength="60" required></div>' +
      '<div class="err-box" id="err" role="alert" hidden></div>' +
      '<button class="btn btn-accent btn-lg btn-block" type="submit" id="go">TESTNI BOSHLASH</button></div>' +
      '<div class="rules"><b>Bilib qo\'ying</b><ul><li>Boshlagandan keyin vaqt to\'xtamaydi.</li><li>Sahifa yangilansa, test davom etadi — vaqt qayta boshlanmaydi.</li>' +
      '<li>Topshirilgan javoblarni o\'zgartirib bo\'lmaydi.</li></ul></div></form></div>';

    $('#intro').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#err');
      err.hidden = true;
      const name = $('#name').value.trim();
      const surname = $('#surname').value.trim();
      if (name.length < 2 || surname.length < 2) {
        err.textContent = 'Ism va familiyani to\'liq kiriting (kamida 2 ta harf).';
        err.hidden = false;
        return;
      }
      const btn = $('#go');
      btn.classList.add('is-loading');
      try {
        const r = await api('/api/test/' + encodeURIComponent(code) + '/start', { method: 'POST', body: { name, surname } });
        store.set(r.token);
        startQuiz(r);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.classList.remove('is-loading');
      }
    });
  }

  /* ---------- test ---------- */
  function startQuiz(r) {
    S.token = r.token;
    S.questions = r.questions;
    S.answers = Object.assign({}, r.answers || {});
    S.endAt = performance.now() + r.remaining * 1000;
    S.title = r.test.title;
    S.finishing = false;
    const firstOpen = S.questions.findIndex((q) => !S.answers[q.id]);
    S.idx = firstOpen < 0 ? 0 : firstOpen;
    document.title = r.test.title + ' — Online test';

    app.innerHTML =
      '<header class="ex-top"><div class="ex-top-in"><div class="ex-title"><b class="truncate">' + esc(r.test.title) + '</b><span class="truncate">' +
      esc(r.student.surname + ' ' + r.student.name) + '</span></div>' +
      '<div class="timer" id="timer" role="timer" aria-live="off">' + icon('clock') + '<span id="tleft">--:--</span></div></div>' +
      '<div class="ex-progress"><span id="prog"></span></div></header>' +
      '<div class="ex-wrap"><main><section class="q-card" id="qcard" aria-live="polite"></section></main>' +
      '<aside class="side" id="side"><div class="panel"><div class="panel-body"><div class="row between"><h3>Savollar</h3><span class="small muted num" id="answered"></span></div>' +
      '<div class="qgrid" id="qgrid"></div><div class="legend"><span><i class="a"></i>Javob berilgan</span><span><i class="c"></i>Hozirgi</span></div></div></div>' +
      '<button class="btn btn-primary btn-lg btn-block" type="button" id="submit-side">Testni topshirish</button></aside></div>' +
      '<button class="btn btn-primary side-toggle" type="button" id="side-toggle">' + icon('grid') + 'Savollar</button>';

    $('#qgrid').innerHTML = S.questions.map((q, i) => '<button type="button" data-i="' + i + '" aria-label="Savol ' + (i + 1) + '">' + (i + 1) + '</button>').join('');
    $('#qgrid').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) {
        go(Number(b.dataset.i));
        document.body.classList.remove('side-open');
      }
    });
    $('#submit-side').addEventListener('click', confirmSubmit);
    $('#side-toggle').addEventListener('click', () => document.body.classList.toggle('side-open'));
    renderQuestion();
    tick();
    clearInterval(S.timerId);
    S.timerId = setInterval(tick, 250);
  }

  function renderQuestion() {
    const q = S.questions[S.idx];
    const total = S.questions.length;
    const sel = S.answers[q.id];
    const last = S.idx === total - 1;
    $('#qcard').innerHTML =
      '<div class="q-no"><span>Savol ' + (S.idx + 1) + ' / ' + total + '</span></div><div class="q-text" id="qtext">' + esc(q.question) + '</div>' +
      '<div class="choices" role="radiogroup" aria-labelledby="qtext">' +
      q.options.map((o) =>
        '<button type="button" class="choice" role="radio" aria-checked="' + (sel === o.key) + '" data-k="' + o.key + '"><span class="bubble">' + o.key + '</span><span class="txt">' + esc(o.text) + '</span></button>'
      ).join('') + '</div>' +
      '<div class="q-foot"><button class="btn" type="button" id="prev"' + (S.idx === 0 ? ' disabled' : '') + '>' + icon('left') + 'Oldingi</button>' +
      '<div class="mid">' + (sel ? '<button class="clear-btn" type="button" id="clear">Javobni tozalash</button>' : '<span class="small muted">Klaviatura: <kbd>A</kbd>–<kbd>D</kbd>, <kbd>←</kbd> <kbd>→</kbd></span>') + '</div>' +
      (last ? '<button class="btn btn-accent" type="button" id="finish">Testni topshirish</button>' : '<button class="btn btn-primary" type="button" id="next">Keyingi' + icon('right') + '</button>') + '</div>';

    $$('.choice', $('#qcard')).forEach((b) => b.addEventListener('click', () => choose(b.dataset.k)));
    const on = (id, fn) => $('#' + id) && $('#' + id).addEventListener('click', fn);
    on('prev', () => go(S.idx - 1));
    on('next', () => go(S.idx + 1));
    on('finish', confirmSubmit);
    on('clear', () => choose(null));
    paintNav();
  }

  function paintNav() {
    $$('#qgrid button').forEach((b, i) => {
      const q = S.questions[i];
      b.classList.toggle('answered', !!S.answers[q.id]);
      b.classList.toggle('current', i === S.idx);
      b.setAttribute('aria-current', i === S.idx ? 'step' : 'false');
    });
    const n = Object.keys(S.answers).length;
    $('#answered').textContent = n + ' / ' + S.questions.length;
    $('#prog').style.width = (n / S.questions.length) * 100 + '%';
  }

  function go(i) {
    if (i < 0 || i >= S.questions.length || S.finishing) return;
    S.idx = i;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function choose(letter) {
    if (S.finishing) return;
    const q = S.questions[S.idx];
    if (letter) S.answers[q.id] = letter;
    else delete S.answers[q.id];
    renderQuestion();
    saveAnswer(q.id, letter);
  }

  async function saveAnswer(qid, letter) {
    S.retryQueue.set(qid, letter);
    try {
      const r = await api('/api/test/' + encodeURIComponent(code) + '/answer', { method: 'PUT', body: { token: S.token, questionId: qid, answer: letter } });
      if (S.retryQueue.get(qid) === letter) S.retryQueue.delete(qid);
      if (typeof r.remaining === 'number') S.endAt = performance.now() + r.remaining * 1000; // serverga moslash
    } catch (err) {
      if (err.status === 409 || err.status === 410) return finish(true); // allaqachon topshirilgan / vaqt tugagan
      // Tarmoq xatosi: topshirishda barcha javoblar baribir yuboriladi
    }
  }

  /* ---------- taymer ---------- */
  function tick() {
    const left = Math.max(0, (S.endAt - performance.now()) / 1000);
    const el = $('#timer');
    if (!el) return;
    $('#tleft').textContent = mmss(Math.ceil(left));
    el.classList.toggle('warn', left <= 300 && left > 60);
    el.classList.toggle('bad', left <= 60);
    if (left <= 0 && !S.finishing) finish(true);
  }

  /* ---------- topshirish ---------- */
  function confirmSubmit() {
    if (S.finishing || $('.overlay')) return;
    const n = Object.keys(S.answers).length;
    const total = S.questions.length;
    openModal({
      title: 'Testni topshirasizmi?',
      body: '<p style="font-size:1.0625rem"><b class="num">Javob berilgan: ' + n + '/' + total + '</b></p>' +
        (n < total ? '<p class="small" style="margin-top:6px;color:var(--warn)">' + (total - n) + ' ta savolga javob berilmagan.</p>' : '') +
        '<p class="small muted" style="margin-top:8px">Topshirgandan keyin javoblarni o\'zgartirib bo\'lmaydi.</p>',
      buttons: [
        { label: 'Bekor qilish' },
        { label: 'Topshirish', cls: 'btn-primary', onClick: () => finish(false) },
      ],
    });
  }

  async function finish(auto) {
    if (S.finishing) return;
    S.finishing = true;
    clearInterval(S.timerId);
    if (auto) {
      const m = $('.overlay');
      if (m) m.remove();
      document.body.style.overflow = '';
      app.insertAdjacentHTML('beforeend', '<div class="overlay"><div class="modal"><div class="modal-head"><h2>Vaqt tugadi!</h2></div><div class="modal-body"><p>Testingiz avtomatik topshirilmoqda…</p></div><div class="modal-foot"></div></div></div>');
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await api('/api/test/' + encodeURIComponent(code) + '/submit', { method: 'POST', body: { token: S.token, answers: S.answers } });
        return showResult(r, auto || r.time_over);
      } catch (err) {
        if (err.status === 409 && err.data && err.data.submitted) {
          try {
            return showResult(await api('/api/test/' + encodeURIComponent(code) + '/result?token=' + encodeURIComponent(S.token)), auto);
          } catch (e2) { /* quyida qayta uriniladi */ }
        } else if (err.status && err.status < 500 && err.status !== 429) {
          S.finishing = false;
          $$('.overlay').forEach((o) => o.remove());
          document.body.style.overflow = '';
          toast(err.message, 'error');
          if (err.data && err.data.invalid_token) { store.clear(); location.reload(); }
          return;
        }
        if (attempt > 20) {
          toast('Internet aloqasi yo\'q. Aloqa tiklangach, qayta urinib ko\'ring.', 'error');
          S.finishing = false;
          $$('.overlay').forEach((o) => o.remove());
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /* ---------- natija ---------- */
  function showResult(r, timeOver) {
    $$('.overlay').forEach((o) => o.remove());
    document.body.style.overflow = '';
    document.body.classList.remove('side-open');
    clearInterval(S.timerId);
    window.scrollTo(0, 0);

    let inner;
    if (r.show_result === false || r.score === undefined) {
      inner =
        '<h1 class="intro-title" style="margin-top:22px">Javoblaringiz qabul qilindi</h1><p class="muted">Natijani o\'qituvchingiz e\'lon qiladi.</p>' +
        '<p class="time-line">Sarflangan vaqt: <b class="num">' + mmss(r.time_spent) + '</b></p>';
    } else {
      const p = Math.round(r.percentage);
      inner =
        '<div class="ring ' + (p >= 75 ? '' : p >= 50 ? 'warn' : 'bad') + '" style="--p:' + p + '"><div><b class="num">' + p + '%</b><span>natija</span></div></div>' +
        '<div class="score-line num">' + r.score + ' / ' + r.total + '</div>' +
        '<div class="tally"><div class="ok"><b class="num">' + r.correct + '</b><span>To\'g\'ri</span></div><div class="bad"><b class="num">' + r.wrong + '</b><span>Xato</span></div><div><b class="num">' + r.unanswered + '</b><span>Javobsiz</span></div></div>' +
        '<p class="time-line">Vaqt: <b class="num">' + mmss(r.time_spent) + '</b></p>';
    }

    const review = r.review
      ? '<section class="panel review" style="padding:22px 24px"><h2>Javoblar tahlili</h2>' +
        r.review.map((it) =>
          '<div class="rv"><div class="qt">' + it.number + '. ' + esc(it.question) + '</div><ul>' +
          it.options.map((o) => {
            const cls = o.key === it.correct ? 'right' : o.key === it.selected ? 'wrong' : '';
            return '<li class="' + cls + '"><span class="bubble">' + o.key + '</span><span>' + esc(o.text) + '</span></li>';
          }).join('') +
          (it.selected ? '' : '<p class="small muted" style="margin-top:6px">Javob berilmagan</p>') + '</ul></div>'
        ).join('') + '</section>'
      : '';

    app.innerHTML =
      '<div class="result-wrap"><section class="panel result-card"><span class="kicker">' + BRAND_MARK + 'TEST YAKUNLANDI</span>' +
      '<p style="margin-top:12px;font-weight:600">' + esc(r.student.surname + ' ' + r.student.name) + ' · ' + esc(r.test.title) + '</p>' +
      (timeOver ? '<div class="time-over"><b>Vaqt tugadi!</b>Testingiz avtomatik topshirildi.</div>' : '') +
      inner + '</section>' + review + '</div>';
  }

  /* ---------- klaviatura ---------- */
  document.addEventListener('keydown', (e) => {
    if (!$('#qcard') || S.finishing || $('.overlay') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toUpperCase();
    if (LETTERS.includes(k)) choose(k);
    else if (e.key === 'ArrowRight') go(S.idx + 1);
    else if (e.key === 'ArrowLeft') go(S.idx - 1);
  });

  /* ---------- boshlash ---------- */
  (async function init() {
    if (!code) return showError('Test kodi topilmadi', 'Havolani qayta tekshiring.');
    const token = store.get();
    if (token) {
      try {
        const r = await api('/api/test/' + encodeURIComponent(code) + '/resume', { method: 'POST', body: { token } });
        if (r.submitted) {
          S.token = token;
          return showResult(await api('/api/test/' + encodeURIComponent(code) + '/result?token=' + encodeURIComponent(token)), false);
        }
        return startQuiz(r);
      } catch (err) {
        if (err.status === 404 || (err.data && err.data.invalid_token)) store.clear();
        else { showError('Ulanishda muammo', err.message, '<p style="margin-top:14px"><button class="btn btn-primary" id="retry" type="button">Qayta urinish</button></p>');
        $('#retry').addEventListener('click', () => location.reload());
        return; }
      }
    }
    try {
      showIntro((await api('/api/test/' + encodeURIComponent(code))).test);
    } catch (err) {
      showError(err.data && err.data.closed ? 'Test hozircha yopiq' : 'Test topilmadi', err.message);
    }
  })();
})();
