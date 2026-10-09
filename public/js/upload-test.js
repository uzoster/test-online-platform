/* Excel orqali test yuklash: fayl tanlash → ko'rib chiqish → import. */
(async function () {
  'use strict';
  const { $, esc, api, icon, initShell, toast, openModal, copyWithToast } = App;
  const me = await initShell({ page: 'upload-test', title: 'Excel yuklash' });
  if (!me) return;

  const root = $('#page');
  root.innerHTML =
    '<div class="page-head"><div><h1>Testni Excel\'dan yuklash</h1><p>Tayyor savollar faylini yuklang. Import qilishdan oldin har bir qatorni ko\'rib chiqasiz.</p></div>' +
    '<div class="page-actions"><a class="btn" href="/api/tests/template" download="test-template.xlsx">' + icon('download') + 'Excel shablonini yuklab olish</a></div></div>' +
    '<div class="stepper" id="stepper"><span class="st" data-s="1"><span class="bubble">1</span>Fayl tanlash</span>' +
    '<span class="st" data-s="2"><span class="bubble">2</span>Ko\'rib chiqish</span><span class="st" data-s="3"><span class="bubble">3</span>Import</span></div>' +
    '<section id="s1"><div class="dropzone" id="drop" tabindex="0" role="button" aria-label="Excel faylni tanlash">' +
    '<span class="bubble">' + icon('upload') + '</span><b>.xlsx faylni shu yerga tashlang</b><span class="muted">yoki bosib tanlang · 5 MB gacha</span></div>' +
    '<input type="file" id="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
    '<div class="panel" style="margin-top:16px"><div class="panel-body"><h3 style="margin-bottom:10px">Fayl ko\'rinishi</h3>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>Question</th><th>A</th><th>B</th><th>C</th><th>D</th><th>CorrectAnswer</th></tr></thead><tbody>' +
    '<tr><td>O\'zbekiston qachon mustaqil bo\'lgan?</td><td>1989</td><td>1991</td><td>1995</td><td>1992</td><td>B</td></tr>' +
    '<tr><td>2+2 nechaga teng?</td><td>3</td><td>4</td><td>5</td><td>6</td><td>B</td></tr></tbody></table></div>' +
    '<p class="small muted" style="margin-top:10px">Birinchi qatorda sarlavhalar bo\'lsin. CorrectAnswer — faqat A, B, C yoki D. Har bir qator alohida savol bo\'ladi.</p></div></div></section>' +
    '<section id="s2" hidden></section>';

  const stepper = (n) =>
    App.$$('.st', $('#stepper')).forEach((el) => {
      const s = Number(el.dataset.s);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
      $('.bubble', el).innerHTML = s < n ? icon('check') : String(s);
    });
  stepper(1);

  const drop = $('#drop');
  const fileInput = $('#file');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInput.click()));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]));
  fileInput.addEventListener('change', () => fileInput.files[0] && handle(fileInput.files[0]));

  async function handle(file) {
    if (!/\.xlsx$/i.test(file.name)) return toast('Faqat .xlsx formatidagi fayl qabul qilinadi.', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('Fayl hajmi 5 MB dan oshmasligi kerak.', 'error');
    drop.classList.add('over');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/api/tests/upload', { method: 'POST', formData: fd });
      showPreview(r, file.name);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      drop.classList.remove('over');
      fileInput.value = '';
    }
  }

  let existing = [];
  async function showPreview(r, filename) {
    stepper(2);
    try {
      existing = (await api('/api/tests')).tests.filter((t) => !t.participants && !t.in_progress);
    } catch (_) {
      existing = [];
    }
    const base = filename.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').trim();
    const rows = r.items
      .map(
        (it) =>
          '<div class="prev-row' + (it.ok ? '' : ' err') + '"><span class="mark">' + icon(it.ok ? 'check' : 'x') + '</span><div>' +
          '<div class="q">Savol ' + it.index + (it.ok ? '' : ' <span class="muted" style="font-weight:500">(Excel qatori: ' + it.row + ')</span>') + ' — ' + esc(it.question || '(bo\'sh)') + '</div>' +
          (it.ok
            ? '<div class="opts">' + ['A', 'B', 'C', 'D'].map((l) => (l === it.correct ? '<b>' + l + ') ' + esc(it.options[l]) + ' ✓</b>' : '<span>' + l + ') ' + esc(it.options[l]) + '</span>')).join('') + '</div>'
            : '') +
          it.errors.map((m) => '<div class="msg">⚠️ Qator ' + it.row + ': ' + esc(m) + '</div>').join('') +
          it.warnings.map((m) => '<div class="warnmsg">Qator ' + it.row + ': ' + esc(m) + '</div>').join('') +
          '</div></div>'
      )
      .join('');

    const s2 = $('#s2');
    $('#s1').hidden = true;
    s2.hidden = false;
    s2.innerHTML =
      '<div class="preview-summary"><div class="pill-stat"><b class="num">' + r.found + '</b><span>ta savol topildi</span></div>' +
      '<div class="pill-stat ok"><b class="num">' + r.valid + '</b><span>to\'g\'ri</span></div>' +
      '<div class="pill-stat ' + (r.error_count ? 'bad' : '') + '"><b class="num">' + r.error_count + '</b><span>xato (Errors)</span></div></div>' +
      (r.error_count ? '<div class="locked-note">' + icon('alert') + '<span>Xatoli qatorlar import qilinmaydi. Faylni tuzatib qayta yuklashingiz yoki faqat to\'g\'ri savollarni import qilishingiz mumkin.</span></div>' : '') +
      '<div class="builder"><section class="panel"><div class="panel-head"><h2>Savollar</h2><span class="muted small">' + esc(filename) + '</span></div><div class="scroll-box" style="margin-top:8px">' +
      (rows || '<div class="empty"><p>Faylda savollar topilmadi.</p></div>') + '</div></section>' +
      '<aside><section class="panel"><div class="panel-head"><h2>Import</h2></div><div class="panel-body stack">' +
      '<div class="field"><label for="target">Qayerga qo\'shiladi</label><select class="select" id="target"><option value="new">Yangi test</option>' +
      existing.map((t) => '<option value="' + t.id + '">' + esc(t.title) + ' (' + t.total_questions + ' savol)</option>').join('') + '</select></div>' +
      '<div id="newfields" class="stack">' +
      '<div class="field"><label for="title">Test nomi</label><input class="input" id="title" maxlength="200" value="' + esc(base) + '"></div>' +
      '<div class="field"><label for="subject">Fan</label><input class="input" id="subject" maxlength="100"></div>' +
      '<div class="field"><label for="group_name">Guruh</label><input class="input" id="group_name" maxlength="100"></div>' +
      '<div class="field"><label for="duration">Davomiyligi (daqiqa)</label><input class="input" id="duration" type="number" min="1" max="600" value="20"></div></div>' +
      '<button class="btn btn-primary btn-block btn-lg" type="button" id="import"' + (r.valid ? '' : ' disabled') + '>' + icon('check') + 'Savollarni import qilish (' + r.valid + ')</button>' +
      '<button class="btn btn-block" type="button" id="again">Boshqa fayl tanlash</button></div></section></aside></div>';

    $('#target').addEventListener('change', (e) => ($('#newfields').hidden = e.target.value !== 'new'));
    $('#again').addEventListener('click', () => {
      s2.hidden = true;
      $('#s1').hidden = false;
      stepper(1);
    });
    $('#import').addEventListener('click', () => doImport(r));
  }

  async function doImport(r) {
    const btn = $('#import');
    btn.classList.add('is-loading');
    try {
      const target = $('#target').value;
      let testId;
      let total = r.questions.length;
      if (target === 'new') {
        const title = $('#title').value.trim();
        if (!title) throw new Error('Test nomini kiriting.');
        const created = await api('/api/tests', {
          method: 'POST',
          body: { title, subject: $('#subject').value, group_name: $('#group_name').value, duration: Number($('#duration').value) || 20, questions: r.questions },
        });
        testId = created.test.id;
      } else {
        testId = Number(target);
        const added = await api('/api/tests/' + testId + '/questions', { method: 'POST', body: { questions: r.questions } });
        total = added.total;
      }
      stepper(4);
      done(testId, r.questions.length, total);
    } catch (err) {
      toast(err.message, 'error');
      btn.classList.remove('is-loading');
    }
  }

  function done(testId, added, total) {
    $('#s2').innerHTML =
      '<div class="success-card"><h3>' + icon('check') + added + ' ta savol import qilindi</h3><p>Testda jami ' + total + ' ta savol bor. Endi uni e\'lon qilib, havolani olishingiz mumkin.</p>' +
      '<div class="row wrap"><button class="btn btn-primary" type="button" id="pub">E\'lon qilish va havolani olish</button>' +
      '<a class="btn" href="/create-test?id=' + testId + '">' + icon('edit') + 'Tahrirlash</a><a class="btn btn-ghost" href="/tests">Testlar ro\'yxati</a></div></div>';
    $('#pub').addEventListener('click', async (e) => {
      e.currentTarget.classList.add('is-loading');
      try {
        const r = await api('/api/tests/' + testId + '/publish', { method: 'POST' });
        const body = document.createElement('div');
        body.innerHTML =
          '<div class="success-card"><h3>' + icon('check') + 'Test muvaffaqiyatli e\'lon qilindi</h3><p>Test kodi: <span class="code-chip">' + esc(r.test_code) + '</span></p>' +
          '<div class="link-box"><code>' + esc(r.link) + '</code><button class="btn btn-primary btn-sm" type="button" id="cp">' + icon('copy') + 'Havolani nusxalash</button></div></div>';
        openModal({ title: 'Test e\'lon qilindi', body, persistent: true, onClose: () => (location.href = '/tests'), buttons: [{ label: 'Testlar ro\'yxati', cls: 'btn-primary' }] });
        $('#cp', body).addEventListener('click', () => copyWithToast(r.link));
      } catch (err) {
        toast(err.message, 'error');
        e.currentTarget.classList.remove('is-loading');
      }
    });
  }
})();
