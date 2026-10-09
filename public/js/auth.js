/* Bosh sahifa: test kodi bilan kirish va o'qituvchi login'i. */
(function () {
  'use strict';
  const { $, api, icon, BRAND_MARK, currentTheme, setTheme } = App;

  $('#brand').innerHTML = BRAND_MARK + '<span><span class="brand-name">Online Test</span><span class="brand-sub">Testlar va natijalar</span></span>';

  /* javob varag'i: bir necha doirachani qalam bilan to'ldirish */
  (function drawOmr() {
    const letters = ['A', 'B', 'C', 'D'];
    const picks = [1, 3, 0, 2, 1];
    const gx = 70, gy = 44, x0 = 64, y0 = 34;
    let s = '<svg viewBox="0 0 ' + (x0 + gx * 4) + ' ' + (y0 + gy * picks.length - 8) + '">';
    letters.forEach((l, c) => {
      s += '<text x="' + (x0 + c * gx) + '" y="14" text-anchor="middle">' + l + '</text>';
    });
    picks.forEach((p, r) => {
      const y = y0 + r * gy;
      s += '<text x="22" y="' + (y + 4) + '" text-anchor="end">' + (r + 1) + '</text>';
      letters.forEach((_, c) => {
        const x = x0 + c * gx;
        s += '<circle class="cell" cx="' + x + '" cy="' + y + '" r="14"/>';
        if (c === p) s += '<circle class="mark" style="transition-delay:' + (0.25 + r * 0.22) + 's" cx="' + x + '" cy="' + y + '" r="10"/>';
      });
    });
    s += '</svg>';
    const box = $('#omr');
    box.innerHTML = s;
    requestAnimationFrame(() => setTimeout(() => box.classList.add('go'), 80));
  })();

  const themeBtn = $('#theme-btn');
  const paint = () => (themeBtn.innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon'));
  paint();
  themeBtn.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    paint();
  });

  /* test kodi */
  const codeForm = $('#code-form');
  const codeErr = $('#code-err');
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let code = $('#code').value.trim();
    // to'liq havola yopishtirilgan bo'lsa ham ishlaydi
    const m = code.match(/\/test\/([A-Za-z0-9]+)/);
    if (m) code = m[1];
    code = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    codeErr.hidden = true;
    if (code.length < 4) {
      codeErr.textContent = "Test kodini to'liq kiriting.";
      codeErr.hidden = false;
      return;
    }
    try {
      await api('/api/test/' + encodeURIComponent(code), { redirectOn401: false });
      location.href = '/test/' + code;
    } catch (err) {
      codeErr.textContent = err.message;
      codeErr.hidden = false;
    }
  });

  /* allaqachon kirgan bo'lsa */
  api('/api/auth/me', { redirectOn401: false })
    .then((r) => {
      $('#already').hidden = false;
      $('#login-sub').textContent = r.teacher.name + ' sifatida tizimdasiz.';
    })
    .catch(() => {});

  /* login */
  const form = $('#login-form');
  const errBox = $('#login-err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const btn = $('#login-btn');
    btn.classList.add('is-loading');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } });
      location.href = '/teacher';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      btn.classList.remove('is-loading');
    }
  });
})();
