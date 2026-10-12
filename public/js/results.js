/* Natijalar: test tanlash, talabalar jadvali, batafsil natija, Excel'ga eksport. */
(async function () {
  'use strict';
  const { $, $$, esc, api, icon, initShell, toast, openModal, confirmDialog, mmss, fmtDate, tone } = App;
  const me = await initShell({ page: 'results', title: 'Natijalar' });
  if (!me) return;

  const root = $('#page');
  let tests = [];
  try {
    tests = (await api('/api/tests')).tests;
  } catch (err) {
    toast(err.message, 'error');
  }

  if (!tests.length) {
    root.innerHTML = '<div class="page-head"><div><h1>Natijalar</h1></div></div><div class="panel"><div class="empty"><h3>Hali natijalar yo\'q</h3><p>Avval test yarating va havolani guruhga yuboring.</p><a class="btn btn-primary" href="/create-test">' + icon('plus') + 'Test yaratish</a></div></div>';
    return;
  }

  let testId = Number(new URLSearchParams(location.search).get('test'));
  if (!tests.some((t) => t.id === testId)) testId = (tests.find((t) => t.participants) || tests[0]).id;

  root.innerHTML =
    '<div class="page-head"><div><h1>Natijalar</h1><p id="sub"></p></div><div class="page-actions">' +
    '<select class="select" id="pick" aria-label="Testni tanlash" style="min-width:240px;max-width:360px">' +
    tests.map((t) => '<option value="' + t.id + '">' + esc(t.title) + (t.group_name ? ' · ' + esc(t.group_name) : '') + '</option>').join('') + '</select>' +
    '<a class="btn" id="export" href="#">' + icon('download') + 'Excel\'ga yuklab olish</a>' +
    '<button class="btn btn-ghost btn-icon" id="refresh" type="button" title="Yangilash" aria-label="Yangilash">' + icon('avg') + '</button></div></div>' +
    '<div class="mini-stats" id="stats"></div>' +
    '<section class="panel"><div class="table-wrap" id="table"></div></section>';

  $('#pick').value = String(testId);
  let data = null;
  let sort = { key: 'score', dir: 'desc' };

  async function load() {
    try {
      data = await api('/api/tests/' + testId + '/results');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function render() {
    const { test, summary, attempts } = data;
    $('#sub').textContent = [test.subject, test.group_name, test.duration + ' daqiqa'].filter(Boolean).join(' · ');
    $('#export').href = '/api/tests/' + testId + '/results/export';
    $('#stats').innerHTML =
      [['Qatnashchilar', summary.participants + (summary.in_progress ? ' <small class="muted" style="font-size:.875rem">+' + summary.in_progress + ' jarayonda</small>' : '')],
        ['O\'rtacha natija', summary.average + '%'], ['Eng yuqori', summary.highest + '%'], ['Eng past', summary.lowest + '%']]
        .map((s) => '<div class="mini"><span>' + s[0] + '</span><b class="num">' + s[1] + '</b></div>').join('');

    if (!attempts.length) {
      $('#table').innerHTML = '<div class="empty"><h3>Hali hech kim topshirmagan</h3><p>Testning havolasini guruhga yuboring. Natijalar shu yerda paydo bo\'ladi.</p><a class="btn" href="/tests">Testlar ro\'yxati</a></div>';
      return;
    }
    const rows = attempts.slice().sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (a.status !== b.status) return a.status === 'submitted' ? -1 : 1;
      if (sort.key === 'name') return dir * (a.student_surname + a.student_name).localeCompare(b.student_surname + b.student_name, 'uz');
      if (sort.key === 'time') return dir * ((a.time_spent || 0) - (b.time_spent || 0));
      return dir * ((a.percentage || 0) - (b.percentage || 0));
    });
    const arrow = (k) => (sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
    $('#table').innerHTML =
      '<table class="table stack-sm"><thead><tr><th>#</th><th class="sortable" data-sort="name">Talaba' + arrow('name') + '</th><th class="sortable" data-sort="score">Natija' + arrow('score') + '</th>' +
      '<th>Foiz</th><th class="sortable" data-sort="time">Vaqt' + arrow('time') + '</th><th>Topshirilgan</th><th class="r"></th></tr></thead><tbody>' +
      rows.map((a, i) => {
        const done = a.status === 'submitted';
        return '<tr' + (done ? ' class="clickable"' : '') + ' data-id="' + a.id + '"><td class="num muted" data-label="#">' + (i + 1) + '</td>' +
          '<td data-label="Talaba"><span class="name">' + esc(a.student_surname + ' ' + a.student_name) + '</span>' + (a.violations ? ' <span class="badge ' + (a.cheat_stop ? 'bad' : 'warn') + ' plain" title="Test sahifasidan chiqqan">' + (a.cheat_stop ? 'Chiqish tufayli yakunlangan · ' : 'Chiqdi: ') + a.violations + ' marta</span>' : '') + '</td>' +
          (done
            ? '<td class="num" data-label="Natija"><b>' + a.score + '/' + a.total_questions + '</b></td>' +
              '<td data-label="Foiz"><div class="pct-cell"><div class="bar ' + tone(a.percentage) + '"><span style="width:' + a.percentage + '%"></span></div><b>' + Math.round(a.percentage) + '%</b></div></td>' +
              '<td class="num" data-label="Vaqt">' + mmss(a.time_spent) + '</td><td class="muted" data-label="Topshirilgan">' + fmtDate(a.submitted_at) + '</td>'
            : '<td colspan="4" data-label="Holat"><span class="badge warn">Topshirmoqda…</span></td>') +
          '<td class="r"><div class="actions"><button class="btn btn-ghost btn-sm btn-icon" data-del title="O\'chirish" aria-label="Natijani o\'chirish">' + icon('trash') + '</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function detail(id) {
    let r;
    try {
      r = await api('/api/attempts/' + id);
    } catch (err) {
      return toast(err.message, 'error');
    }
    const a = r.attempt;
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="detail-head"><span class="detail-score num" style="color:var(--' + tone(a.percentage) + ')">' + a.score + '/' + a.total_questions + '</span>' +
      '<div><div class="row wrap"><span class="badge ok plain">To\'g\'ri: ' + a.score + '</span><span class="badge bad plain">Xato: ' + a.wrong + '</span><span class="badge gray plain">Javobsiz: ' + a.unanswered + '</span></div>' +
      '<p class="small muted" style="margin-top:6px">Foiz: <b>' + Math.round(a.percentage) + '%</b> · Vaqt: <b>' + mmss(a.time_spent) + '</b> · ' + fmtDate(a.submitted_at) + (a.violations ? ' · <b style="color:var(--' + (a.cheat_stop ? 'bad' : 'warn') + ')">Sahifadan chiqqan: ' + a.violations + ' marta' + (a.cheat_stop ? ' (avtomatik yakunlangan)' : '') + '</b>' : '') + '</p></div></div>' +
      r.questions.map((q) => {
        const cls = q.is_correct ? '' : q.selected ? ' wrong' : ' blank';
        return '<div class="dq' + cls + '"><span class="mark">' + icon(q.is_correct ? 'check' : q.selected ? 'x' : 'pause') + '</span><div>' +
          '<div class="qt">Savol ' + q.number + '. ' + esc(q.question) + '</div><div class="verdict">' +
          (q.is_correct
            ? '<span class="c">✅ To\'g\'ri: ' + q.correct + ') ' + esc(q.correct_text) + '</span>'
            : (q.selected ? '<span class="y">❌ Talaba javobi: ' + q.selected + ') ' + esc(q.selected_text) + '</span>' : '<span class="muted">Javob berilmagan</span>') +
              '<span class="c">To\'g\'ri javob: ' + q.correct + ') ' + esc(q.correct_text) + '</span>') +
          '</div></div></div>';
      }).join('');
    openModal({ title: a.student_surname + ' ' + a.student_name, body, wide: true, buttons: [{ label: 'Yopish', cls: 'btn-primary' }] });
  }

  $('#pick').addEventListener('change', (e) => {
    testId = Number(e.target.value);
    history.replaceState(null, '', '/results?test=' + testId);
    load();
  });
  $('#refresh').addEventListener('click', () => { load(); toast('Yangilandi'); });
  $('#table').addEventListener('click', async (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) {
      sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort && sort.dir === 'desc' ? 'asc' : 'desc' };
      return render();
    }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    if (e.target.closest('[data-del]')) {
      const a = data.attempts.find((x) => x.id === id);
      if (!(await confirmDialog({ title: 'Natijani o\'chirish', message: a.student_surname + ' ' + a.student_name + ' natijasi o\'chiriladi. Qaytarib bo\'lmaydi.', confirmLabel: 'O\'chirish', danger: true }))) return;
      try {
        await api('/api/attempts/' + id, { method: 'DELETE' });
        toast('Natija o\'chirildi');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (tr.classList.contains('clickable')) {
      detail(id);
    }
  });

  load();
  setInterval(() => !document.hidden && !$('.overlay') && load(), 15000);
})();
