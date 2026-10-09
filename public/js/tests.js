/* Testlar ro'yxati: qidiruv, filtr, havolani nusxalash, e'lon qilish, o'chirish. */
(async function () {
  'use strict';
  const { $, $$, esc, api, icon, initShell, toast, confirmDialog, copyWithToast, openModal } = App;
  const me = await initShell({ page: 'tests', title: 'Testlar' });
  if (!me) return;

  const root = $('#page');
  root.innerHTML =
    '<div class="page-head"><div><h1>Testlar</h1><p>Yaratilgan barcha testlar. Havolani nusxalab, guruhga yuboring.</p></div>' +
    '<div class="page-actions"><a class="btn" href="/upload-test">' + icon('upload') + 'Excel yuklash</a>' +
    '<a class="btn btn-primary" href="/create-test">' + icon('plus') + 'Yangi test</a></div></div>' +
    '<section class="panel"><div class="toolbar"><div class="search">' + icon('search') +
    '<input class="input" id="q" type="search" placeholder="Testni qidirish" aria-label="Qidirish"></div>' +
    '<div class="seg" role="group" aria-label="Holat bo\'yicha filtr">' +
    '<button type="button" data-f="all" aria-pressed="true">Hammasi</button>' +
    '<button type="button" data-f="pub" aria-pressed="false">E\'lon qilingan</button>' +
    '<button type="button" data-f="draft" aria-pressed="false">Qoralama</button></div></div>' +
    '<div class="table-wrap" id="list"><div class="panel-body"><div class="skeleton" style="height:120px"></div></div></div></section>';

  let tests = [];
  let filter = 'all';
  let query = '';

  async function load() {
    try {
      tests = (await api('/api/tests')).tests;
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function render() {
    const q = query.trim().toLowerCase();
    const rows = tests.filter((t) => {
      if (filter === 'pub' && !t.is_published) return false;
      if (filter === 'draft' && t.is_published) return false;
      return !q || [t.title, t.subject, t.group_name].some((x) => (x || '').toLowerCase().includes(q));
    });
    const box = $('#list');
    if (!rows.length) {
      box.innerHTML = tests.length
        ? '<div class="empty"><h3>Hech narsa topilmadi</h3><p>Qidiruv yoki filtrni o\'zgartirib ko\'ring.</p></div>'
        : '<div class="empty"><h3>Hali test yo\'q</h3><p>Birinchi testingizni qo\'lda yarating yoki tayyor Excel faylni yuklang.</p>' +
          '<a class="btn btn-primary" href="/create-test">' + icon('plus') + 'Test yaratish</a></div>';
      return;
    }
    box.innerHTML =
      '<table class="table stack-sm"><thead><tr><th>Test</th><th>Savollar</th><th>Davomiylik</th><th>Qatnashchilar</th><th>O\'rtacha</th><th>Holat</th><th class="r">Amallar</th></tr></thead><tbody>' +
      rows
        .map(
          (t) =>
            '<tr data-id="' + t.id + '"><td data-label="Test"><div class="cell-title"><a class="name" style="color:inherit;text-decoration:none" href="/results?test=' + t.id + '">' + esc(t.title) + '</a>' +
            '<span class="s">' + esc([t.subject, t.group_name].filter(Boolean).join(' · ') || 'Fan va guruh ko\'rsatilmagan') + '</span></div></td>' +
            '<td class="num" data-label="Savollar">' + t.total_questions + '</td>' +
            '<td class="num" data-label="Davomiylik">' + t.duration + ' daq</td>' +
            '<td class="num" data-label="Qatnashchilar">' + t.participants + (t.in_progress ? ' <span class="badge warn plain" title="Hozir topshirayotganlar">+' + t.in_progress + '</span>' : '') + '</td>' +
            '<td class="num" data-label="O\'rtacha">' + (t.participants ? Math.round(t.avg_percentage) + '%' : '—') + '</td>' +
            '<td data-label="Holat">' + (t.is_published ? '<span class="badge ok">E\'lon qilingan</span>' : '<span class="badge gray">Qoralama</span>') + '</td>' +
            '<td data-label="Amallar"><div class="actions">' +
            (t.is_published ? '<button class="btn btn-ghost btn-sm btn-icon" data-act="copy" title="Havolani nusxalash" aria-label="Havolani nusxalash">' + icon('copy') + '</button>' : '') +
            '<a class="btn btn-ghost btn-sm btn-icon" href="/results?test=' + t.id + '" title="Natijalar" aria-label="Natijalar">' + icon('results') + '</a>' +
            '<a class="btn btn-ghost btn-sm btn-icon" href="/analytics?test=' + t.id + '" title="Tahlil" aria-label="Tahlil">' + icon('chart') + '</a>' +
            '<a class="btn btn-ghost btn-sm btn-icon" href="/create-test?id=' + t.id + '" title="Tahrirlash" aria-label="Tahrirlash">' + icon('edit') + '</a>' +
            '<button class="btn btn-ghost btn-sm" data-act="toggle">' + (t.is_published ? 'Yopish' : 'E\'lon qilish') + '</button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="delete" title="O\'chirish" aria-label="O\'chirish">' + icon('trash') + '</button>' +
            '</div></td></tr>'
        )
        .join('') +
      '</tbody></table>';
  }

  function showLink(link) {
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="success-card"><h3>' + icon('check') + 'Test muvaffaqiyatli e\'lon qilindi</h3>' +
      '<p>Quyidagi havolani guruhga yuboring:</p><div class="link-box"><code>' + esc(link) + '</code>' +
      '<button class="btn btn-primary btn-sm" type="button" id="cp">' + icon('copy') + 'Havolani nusxalash</button></div></div>';
    openModal({ title: 'Test havolasi', body, buttons: [{ label: 'Yopish', cls: 'btn-primary' }] });
    $('#cp', body).addEventListener('click', () => copyWithToast(link));
  }

  root.addEventListener('click', async (e) => {
    const seg = e.target.closest('.seg button');
    if (seg) {
      filter = seg.dataset.f;
      $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
      render();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const t = tests.find((x) => x.id === id);
    try {
      if (btn.dataset.act === 'copy') {
        copyWithToast(t.link);
      } else if (btn.dataset.act === 'toggle') {
        if (t.is_published) {
          if (!(await confirmDialog({ title: 'Testni yopish', message: 'Yopilgandan keyin talabalar yangi urinish boshlay olmaydi. Davom etayotganlar tugatadi.', confirmLabel: 'Yopish' }))) return;
          await api('/api/tests/' + id + '/unpublish', { method: 'POST' });
          toast('Test yopildi');
        } else {
          const r = await api('/api/tests/' + id + '/publish', { method: 'POST' });
          await load();
          showLink(r.link);
          return;
        }
        await load();
      } else if (btn.dataset.act === 'delete') {
        const ok = await confirmDialog({
          title: 'Testni o\'chirish',
          message: '"' + t.title + '" testi va uning barcha natijalari (' + t.participants + ' ta) butunlay o\'chiriladi. Buni qaytarib bo\'lmaydi.',
          confirmLabel: 'O\'chirish',
          danger: true,
        });
        if (!ok) return;
        await api('/api/tests/' + id, { method: 'DELETE' });
        toast('Test o\'chirildi');
        await load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#q').addEventListener('input', (e) => {
    query = e.target.value;
    render();
  });

  load();
})();
