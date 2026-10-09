/* Sozlamalar: profil, parol, ko'rinish. */
(async function () {
  'use strict';
  const { $, esc, api, icon, initShell, toast, currentTheme, setTheme } = App;
  const me = await initShell({ page: 'settings', title: 'Sozlamalar' });
  if (!me) return;

  const root = $('#page');
  root.innerHTML =
    '<div class="page-head"><div><h1>Sozlamalar</h1><p>Profilingiz, parolingiz va ko\'rinish. Test sozlamalari (tasodifiy tartib, natijani ko\'rsatish va boshqalar) har bir testni yaratish sahifasida.</p></div></div>' +
    '<div class="form-grid" style="align-items:start">' +
    '<section class="panel"><div class="panel-head"><h2>Profil</h2></div><form class="panel-body stack" id="profile" novalidate>' +
    '<div class="field"><label for="name">Ism</label><input class="input" id="name" maxlength="100" value="' + esc(me.name) + '"></div>' +
    '<div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" value="' + esc(me.email) + '"></div>' +
    '<div class="err-box" id="p-err" role="alert" hidden></div><button class="btn btn-primary" type="submit">Saqlash</button></form></section>' +
    '<section class="panel"><div class="panel-head"><h2>Parolni o\'zgartirish</h2></div><form class="panel-body stack" id="pass" novalidate>' +
    '<div class="field"><label for="cur">Joriy parol</label><input class="input" id="cur" type="password" autocomplete="current-password"></div>' +
    '<div class="field"><label for="new">Yangi parol</label><input class="input" id="new" type="password" autocomplete="new-password"><span class="hint">Kamida 6 ta belgi.</span></div>' +
    '<div class="err-box" id="w-err" role="alert" hidden></div><button class="btn btn-primary" type="submit">Parolni yangilash</button></form></section>' +
    '<section class="panel"><div class="panel-head"><h2>Ko\'rinish</h2></div><div class="panel-body"><div class="setting"><div><div class="t">Qorong\'i mavzu</div><div class="d">Ko\'zni charchatmaydigan tungi ko\'rinish.</div></div>' +
    '<label class="switch"><input type="checkbox" id="dark" aria-label="Qorong\'i mavzu"><span class="track"></span></label></div></div></section></div>';

  $('#dark').checked = currentTheme() === 'dark';
  $('#dark').addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
    $('#theme-btn').innerHTML = icon(e.target.checked ? 'sun' : 'moon');
  });

  async function submit(form, errId, body, okMsg, after) {
    const err = $('#' + errId);
    err.hidden = true;
    const btn = $('button[type=submit]', form);
    btn.classList.add('is-loading');
    try {
      const r = await api('/api/auth/profile', { method: 'PUT', body });
      toast(okMsg);
      after && after(r.teacher);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.classList.remove('is-loading');
    }
  }

  $('#profile').addEventListener('submit', (e) => {
    e.preventDefault();
    submit(e.target, 'p-err', { name: $('#name').value, email: $('#email').value }, 'Profil saqlandi', (t) => {
      $('.who b').textContent = t.name;
      $('.who span').textContent = t.email;
      $('.avatar').textContent = (t.name || '?').charAt(0).toUpperCase();
    });
  });
  $('#pass').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!$('#new').value) {
      $('#w-err').textContent = 'Yangi parolni kiriting.';
      $('#w-err').hidden = false;
      return;
    }
    submit(e.target, 'w-err', { current_password: $('#cur').value, new_password: $('#new').value }, 'Parol yangilandi', () => {
      $('#cur').value = '';
      $('#new').value = '';
    });
  });
})();
