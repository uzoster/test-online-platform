/* Test yaratish / tahrirlash: ma'lumotlar, savollar konstruktori, sozlamalar, qoralama va e'lon qilish. */
(async function () {
  'use strict';
  const { $, $$, esc, api, icon, initShell, toast, openModal, copyWithToast } = App;
  const me = await initShell({ page: 'create-test', title: 'Test yaratish' });
  if (!me) return;

  const LETTERS = ['A', 'B', 'C', 'D'];
  const editId = Number(new URLSearchParams(location.search).get('id')) || null;
  const state = { id: editId, locked: false, published: false, link: null, dirty: false, questions: [] };
  const blankQ = () => ({ question: '', A: '', B: '', C: '', D: '', correct: '' });

  const SETTINGS = [
    ['random_questions', 'Savollar tasodifiy tartibda', 'Har bir talabaga savollar boshqacha tartibda beriladi.'],
    ['random_answers', 'Variantlar tasodifiy tartibda', 'A–D variantlari aralashadi, to\'g\'ri javob buzilmaydi.'],
    ['show_result', 'Natijani darhol ko\'rsatish', 'Topshirgandan keyin talaba balini ko\'radi.'],
    ['show_correct', 'To\'g\'ri javoblarni ko\'rsatish', 'Talaba xatolarini ko\'rib chiqa oladi.'],
    ['allow_retake', 'Qayta topshirishga ruxsat', 'Bir xil ism-familiya qayta topshira oladi.'],
  ];

  const root = $('#page');
  root.innerHTML =
    '<div class="page-head"><div><h1 id="h1">Yangi test</h1><p>Ma\'lumotlarni to\'ldiring, savollarni qo\'shing va e\'lon qiling — tizim havola beradi.</p></div>' +
    '<div class="page-actions"><a class="btn" href="/upload-test">' + icon('upload') + 'Excel\'dan yuklash</a></div></div>' +
    '<div id="lock" class="locked-note" hidden>' + icon('lock') + '<span>Bu testni allaqachon topshirganlar bor, shuning uchun savollarni o\'zgartirib bo\'lmaydi. Nom va sozlamalarni tahrirlash mumkin.</span></div>' +
    '<div class="builder"><div class="stack">' +
    '<section class="panel"><div class="panel-head"><h2>Test ma\'lumotlari</h2></div><div class="panel-body"><div class="form-grid">' +
    '<div class="field span-2"><label for="title">Test nomi</label><input class="input" id="title" maxlength="200" placeholder="Masalan, Kimyo — Organik birikmalar"></div>' +
    '<div class="field"><label for="subject">Fan</label><input class="input" id="subject" maxlength="100" placeholder="Kimyo"></div>' +
    '<div class="field"><label for="group_name">Guruh</label><input class="input" id="group_name" maxlength="100" placeholder="11-A"></div>' +
    '<div class="field"><label for="duration">Davomiyligi (daqiqa)</label><input class="input" id="duration" type="number" min="1" max="600" value="20"></div>' +
    '<div class="field"><label for="question_count">Talabaga beriladigan savollar soni</label><input class="input" id="question_count" type="number" min="1" placeholder="Hammasi">' +
    '<span class="hint" id="qc-hint">Bo\'sh qoldirsangiz, barcha savollar beriladi.</span></div>' +
    '</div></div></section>' +
    '<section class="panel" id="ai-panel"><div class="panel-head"><h2>' + icon('sparkle') + ' AI yordamida savollar yaratish</h2></div><div class="panel-body"><div class="form-grid">' +
    '<div class="field span-2"><label for="ai-topic">Mavzu yoki ko\'rsatma</label><textarea class="textarea" id="ai-topic" rows="3" maxlength="3000" placeholder="Masalan: Present Perfect va Past Simple farqi, 6-sinf darajasi"></textarea></div>' +
    '<div class="field"><label for="ai-count">Savollar soni</label><input class="input" id="ai-count" type="number" min="1" max="30" value="10"></div>' +
    '<div class="field"><label for="ai-level">Qiyinlik</label><select class="select" id="ai-level"><option value="mixed">Aralash</option><option value="easy">Oson</option><option value="medium">O\'rta</option><option value="hard">Qiyin</option></select></div>' +
    '<div class="field"><label for="ai-lang">Til</label><select class="select" id="ai-lang"><option value="uz">O\'zbekcha</option><option value="ru">Ruscha</option><option value="en">Inglizcha</option></select></div>' +
    '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="button" id="ai-go">' + icon('sparkle') + 'AI bilan yaratish</button></div>' +
    '</div><p class="small muted" id="ai-note" style="margin-top:10px">Yaratilgan savollar pastga qo\'shiladi — e\'lon qilishdan oldin tekshirib, kerak bo\'lsa tahrirlang.</p></div></section>' +
    '<div class="qlist" id="qlist"></div><div class="add-q"><button class="btn" type="button" id="add-q">' + icon('plus') + 'Savol qo\'shish</button></div>' +
    '</div><aside>' +
    '<section class="panel"><div class="panel-head"><h2>Sozlamalar</h2></div><div class="panel-body">' +
    SETTINGS.map(
      (s) =>
        '<div class="setting"><div><div class="t">' + s[1] + '</div><div class="d">' + s[2] + '</div></div>' +
        '<label class="switch"><input type="checkbox" id="' + s[0] + '" aria-label="' + s[1] + '"><span class="track"></span></label></div>'
    ).join('') +
    '</div></section>' +
    '<section class="panel"><div class="panel-body stack">' +
    '<div class="row between"><span class="muted">Savollar</span><b class="num" id="count">0</b></div>' +
    '<button class="btn btn-block" type="button" id="save">Qoralamani saqlash</button>' +
    '<button class="btn btn-primary btn-block btn-lg" type="button" id="publish">E\'lon qilish</button>' +
    '<p class="small muted">E\'lon qilinganda noyob havola yaratiladi. Havolani guruhga yuborasiz.</p></div></section>' +
    '</aside></div>';

  const val = (id) => $('#' + id).value;
  const markDirty = () => {
    state.dirty = true;
  };
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- savollar ---------- */
  function renderQuestions(focusLast) {
    const box = $('#qlist');
    box.innerHTML = state.questions
      .map(
        (q, i) =>
          '<div class="qcard" data-i="' + i + '"><div class="qhead"><span class="qno">Savol ' + (i + 1) + '</span><span class="sp"></span>' +
          (state.locked ? '' : '<button class="btn btn-ghost btn-sm btn-icon" type="button" data-act="dup" title="Nusxa olish" aria-label="Savolning nusxasi">' + icon('copy') + '</button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" type="button" data-act="del" title="O\'chirish" aria-label="Savolni o\'chirish">' + icon('trash') + '</button>') +
          '</div><textarea class="textarea" data-f="question" rows="2" placeholder="Savol matnini yozing" aria-label="Savol ' + (i + 1) + ' matni"' + (state.locked ? ' disabled' : '') + '>' + esc(q.question) + '</textarea>' +
          '<div class="qopts">' +
          LETTERS.map(
            (l) =>
              '<div class="qopt' + (q.correct === l ? ' correct' : '') + '"><button class="pick" type="button" data-pick="' + l + '" aria-pressed="' + (q.correct === l) + '" ' +
              'aria-label="' + l + ' variantini to\'g\'ri javob qilish"' + (state.locked ? ' disabled' : '') + '><span class="bubble' + (q.correct === l ? ' ok' : '') + '">' + l + '</span></button>' +
              '<input class="input" data-f="' + l + '" value="' + esc(q[l]) + '" placeholder="' + l + ' varianti" aria-label="' + l + ' varianti"' + (state.locked ? ' disabled' : '') + '></div>'
          ).join('') +
          '</div><p class="qnote">' + (q.correct ? 'To\'g\'ri javob: <b>' + q.correct + '</b>' : 'To\'g\'ri javobni doirachani bosib belgilang.') + '</p></div>'
      )
      .join('');
    $('#count').textContent = state.questions.length;
    $('#add-q').hidden = state.locked;
    $('#ai-panel').hidden = state.locked;
    updateHint();
    if (focusLast) {
      const last = box.lastElementChild;
      if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('textarea', last).focus({ preventScroll: true });
      }
    }
  }

  function updateHint() {
    const n = state.questions.length;
    $('#qc-hint').textContent = n ? 'Bo\'sh qoldirsangiz, barcha ' + n + ' ta savol beriladi.' : 'Bo\'sh qoldirsangiz, barcha savollar beriladi.';
  }

  $('#add-q').addEventListener('click', () => {
    state.questions.push(blankQ());
    markDirty();
    renderQuestions(true);
  });

  $('#qlist').addEventListener('input', (e) => {
    const card = e.target.closest('.qcard');
    if (!card || !e.target.dataset.f) return;
    state.questions[Number(card.dataset.i)][e.target.dataset.f] = e.target.value;
    card.classList.remove('invalid');
    markDirty();
  });

  $('#qlist').addEventListener('click', (e) => {
    const card = e.target.closest('.qcard');
    if (!card) return;
    const i = Number(card.dataset.i);
    const pick = e.target.closest('[data-pick]');
    const act = e.target.closest('[data-act]');
    if (pick) {
      state.questions[i].correct = pick.dataset.pick;
      markDirty();
      renderQuestions();
    } else if (act && act.dataset.act === 'del') {
      state.questions.splice(i, 1);
      markDirty();
      renderQuestions();
    } else if (act && act.dataset.act === 'dup') {
      state.questions.splice(i + 1, 0, { ...state.questions[i] });
      markDirty();
      renderQuestions();
    }
  });
  $$('input, textarea', $('.builder')).forEach((el) => el.addEventListener('input', markDirty));
  $$('.switch input').forEach((el) => el.addEventListener('change', markDirty));

  /* ---------- yuklash / yig'ish ---------- */
  function setForm(t) {
    $('#title').value = t.title || '';
    $('#subject').value = t.subject || '';
    $('#group_name').value = t.group_name || '';
    $('#duration').value = t.duration || 20;
    $('#question_count').value = t.question_count || '';
    SETTINGS.forEach(([k]) => ($('#' + k).checked = !!t[k]));
  }
  const defaults = { random_questions: true, random_answers: true, show_result: true, show_correct: false, allow_retake: false };

  async function loadExisting() {
    try {
      const r = await api('/api/tests/' + editId);
      state.locked = r.locked;
      state.published = r.test.is_published;
      state.link = r.test.link;
      state.questions = r.questions.map((q) => ({ question: q.question, A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d, correct: q.correct_answer }));
      setForm(r.test);
      $('#h1').textContent = 'Testni tahrirlash';
      $('#lock').hidden = !state.locked;
      $('#publish').textContent = state.published ? 'Saqlash va havolani ko\'rish' : 'E\'lon qilish';
      document.title = 'Testni tahrirlash — Online Test';
    } catch (err) {
      toast(err.message, 'error');
      setTimeout(() => (location.href = '/tests'), 1200);
      return false;
    }
    return true;
  }

  function collect(strict) {
    const meta = {
      title: val('title').trim(),
      subject: val('subject').trim(),
      group_name: val('group_name').trim(),
      duration: Number(val('duration')),
      question_count: val('question_count') ? Number(val('question_count')) : null,
    };
    SETTINGS.forEach(([k]) => (meta[k] = $('#' + k).checked));

    if (!meta.title) {
      $('#title').classList.add('has-error');
      $('#title').focus();
      throw new Error('Test nomini kiriting.');
    }
    $('#title').classList.remove('has-error');
    if (!meta.duration || meta.duration < 1 || meta.duration > 600) {
      $('#duration').classList.add('has-error');
      $('#duration').focus();
      throw new Error('Davomiylik 1 dan 600 daqiqagacha bo\'lishi kerak.');
    }
    $('#duration').classList.remove('has-error');

    let questions = null;
    if (!state.locked) {
      const cards = $$('.qcard');
      questions = [];
      state.questions.forEach((q, i) => {
        const empty = !q.question.trim() && LETTERS.every((l) => !q[l].trim()) && !q.correct;
        if (empty && !strict) return;
        const problem = !q.question.trim() ? 'savol matni bo\'sh' : LETTERS.find((l) => !q[l].trim()) ? LETTERS.find((l) => !q[l].trim()) + ' varianti bo\'sh' : !q.correct ? 'to\'g\'ri javob belgilanmagan' : '';
        if (problem) {
          cards[i].classList.add('invalid');
          cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          throw new Error('Savol ' + (i + 1) + ': ' + problem + '.');
        }
        questions.push({ question: q.question.trim(), option_a: q.A.trim(), option_b: q.B.trim(), option_c: q.C.trim(), option_d: q.D.trim(), correct_answer: q.correct });
      });
      if (meta.question_count && questions.length && meta.question_count > questions.length) {
        $('#question_count').classList.add('has-error');
        throw new Error('Talabaga beriladigan savollar soni (' + meta.question_count + ') mavjud savollardan (' + questions.length + ') ko\'p bo\'lmasligi kerak.');
      }
      $('#question_count').classList.remove('has-error');
    }
    return { meta, questions };
  }

  async function save(strict) {
    const { meta, questions } = collect(strict);
    const body = { ...meta };
    if (questions) body.questions = questions;
    const r = state.id
      ? await api('/api/tests/' + state.id, { method: 'PUT', body })
      : await api('/api/tests', { method: 'POST', body });
    state.id = r.test.id;
    state.dirty = false;
    if (!editId) history.replaceState(null, '', '/create-test?id=' + state.id);
    $('#h1').textContent = 'Testni tahrirlash';
    return r.test;
  }

  function withLoading(btn, fn) {
    return async () => {
      btn.classList.add('is-loading');
      try {
        await fn();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.classList.remove('is-loading');
      }
    };
  }

  $('#save').addEventListener('click', withLoading($('#save'), async () => {
    await save(false);
    toast('Qoralama saqlandi');
  }));

  $('#publish').addEventListener('click', withLoading($('#publish'), async () => {
    if (!state.locked && !state.questions.some((q) => q.question.trim())) throw new Error('E\'lon qilish uchun kamida bitta savol qo\'shing.');
    await save(true);
    const r = await api('/api/tests/' + state.id + '/publish', { method: 'POST' });
    state.published = true;
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="success-card"><h3>' + icon('check') + 'Test muvaffaqiyatli e\'lon qilindi</h3>' +
      '<p>Test kodi: <span class="code-chip">' + esc(r.test_code) + '</span></p>' +
      '<p>Havolani guruhga yuboring:</p><div class="link-box"><code>' + esc(r.link) + '</code>' +
      '<button class="btn btn-primary btn-sm" type="button" id="cp">' + icon('copy') + 'Havolani nusxalash</button></div></div>';
    openModal({
      title: 'Test e\'lon qilindi',
      body,
      persistent: true,
      onClose: () => (location.href = '/tests'),
      buttons: [{ label: 'Testlar ro\'yxati', cls: 'btn-primary' }],
    });
    $('#cp', body).addEventListener('click', () => copyWithToast(r.link));
  }));

  /* ---------- AI (Gemini) ---------- */
  $('#ai-go').addEventListener('click', withLoading($('#ai-go'), async () => {
    const topic = val('ai-topic').trim();
    if (topic.length < 3) {
      $('#ai-topic').focus();
      throw new Error('Avval mavzuni yozing.');
    }
    const r = await api('/api/tests/ai-generate', {
      method: 'POST',
      body: { topic, count: Number(val('ai-count')) || 10, difficulty: val('ai-level'), language: val('ai-lang'), subject: val('subject').trim() },
    });
    // Boshida turgan bo'sh savol kartasini olib tashlaymiz
    state.questions = state.questions.filter((q) => q.question.trim() || LETTERS.some((l) => q[l].trim()) || q.correct);
    const firstNew = state.questions.length;
    r.questions.forEach((q) => state.questions.push({ question: q.question, A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d, correct: q.correct_answer }));
    markDirty();
    renderQuestions();
    const card = $$('.qcard')[firstNew];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(r.questions.length + ' ta savol yaratildi. Tekshirib chiqing.');
  }));
  api('/api/tests/ai-status').then((s) => {
    if (!s.enabled) $('#ai-note').textContent = 'AI hali sozlanmagan: serverda GEMINI_API_KEY ni (.env faylida) kiriting va serverni qayta ishga tushiring.';
  }).catch(() => {});

  /* ---------- boshlash ---------- */
  if (editId) {
    if (!(await loadExisting())) return;
  } else {
    setForm(defaults);
    state.questions = [blankQ()];
  }
  renderQuestions();
  state.dirty = false;
})();
