/* Tahlil: qaysi savollar qiyin bo'lgani, ball taqsimoti, variantlar bo'yicha tanlovlar. */
(async function () {
  'use strict';
  const { $, esc, api, icon, initShell, toast, tone } = App;
  const me = await initShell({ page: 'analytics', title: 'Tahlil' });
  if (!me) return;

  const root = $('#page');
  let tests = [];
  try {
    tests = (await api('/api/tests')).tests;
  } catch (err) {
    toast(err.message, 'error');
  }
  if (!tests.length) {
    root.innerHTML = '<div class="page-head"><div><h1>Tahlil</h1></div></div><div class="panel"><div class="empty"><h3>Tahlil uchun ma\'lumot yo\'q</h3><p>Test yarating va talabalar topshirgandan keyin bu yerda qaysi savollar qiyin bo\'lgani ko\'rinadi.</p><a class="btn btn-primary" href="/create-test">' + icon('plus') + 'Test yaratish</a></div></div>';
    return;
  }

  let testId = Number(new URLSearchParams(location.search).get('test'));
  if (!tests.some((t) => t.id === testId)) testId = (tests.find((t) => t.participants) || tests[0]).id;

  root.innerHTML =
    '<div class="page-head"><div><h1>Tahlil</h1><p>Qaysi mavzuni qayta tushuntirish kerakligini savollar bo\'yicha aniqlang.</p></div><div class="page-actions">' +
    '<select class="select" id="pick" aria-label="Testni tanlash" style="min-width:240px;max-width:360px">' +
    tests.map((t) => '<option value="' + t.id + '">' + esc(t.title) + (t.group_name ? ' · ' + esc(t.group_name) : '') + '</option>').join('') + '</select></div></div>' +
    '<div id="body"></div>';
  $('#pick').value = String(testId);

  async function load() {
    $('#body').innerHTML = '<div class="panel"><div class="panel-body"><div class="skeleton" style="height:140px"></div></div></div>';
    try {
      render(await api('/api/tests/' + testId + '/analytics'));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function render(d) {
    if (!d.participants) {
      $('#body').innerHTML = '<div class="panel"><div class="empty"><h3>Hali natijalar yo\'q</h3><p>"' + esc(d.test.title) + '" testini hech kim topshirmagan. Havolani guruhga yuboring.</p><a class="btn" href="/tests">Testlar ro\'yxati</a></div></div>';
      return;
    }
    const maxDist = Math.max(1, ...d.distribution.map((x) => x.count));
    const diffs = d.hardest.filter((q) => q.accuracy < 100);

    $('#body').innerHTML =
      '<div class="mini-stats"><div class="mini"><span>Qatnashchilar</span><b class="num">' + d.participants + '</b></div>' +
      '<div class="mini"><span>O\'rtacha natija</span><b class="num">' + d.average + '%</b></div>' +
      '<div class="mini"><span>Savollar</span><b class="num">' + d.questions.length + '</b></div>' +
      '<div class="mini"><span>Eng qiyin savol</span><b class="num">' + (d.hardest[0] ? '№' + d.hardest[0].number + ' · ' + d.hardest[0].accuracy + '%' : '—') + '</b></div></div>' +
      '<div class="dash-grid"><div class="col">' +
      '<section class="panel"><div class="panel-head"><h2>Savollar bo\'yicha tahlil</h2></div><div style="margin-top:8px">' +
      d.questions.map((q) => {
        const t = q.accuracy === null ? 'ok' : tone(q.accuracy);
        const mx = Math.max(1, q.attempts);
        return '<div class="an-q"><span class="no num">' + q.number + '</span><div><div class="qt">' + esc(q.question) + '</div>' +
          '<div class="bar ' + t + '"><span style="width:' + (q.accuracy || 0) + '%"></span></div>' +
          '<div class="picks" aria-label="Variantlar bo\'yicha tanlovlar">' +
          ['A', 'B', 'C', 'D'].map((l) => '<div class="pick-col' + (l === q.correct_answer ? ' right' : '') + '" title="' + l + ' ni tanlaganlar: ' + q.picks[l] + '"><div class="pbar"><i style="height:' + Math.round((q.picks[l] / mx) * 100) + '%"></i></div><span>' + l + ' · ' + q.picks[l] + '</span></div>').join('') +
          (q.picks.none ? '<div class="pick-col" title="Javobsiz"><div class="pbar"><i style="height:' + Math.round((q.picks.none / mx) * 100) + '%"></i></div><span>— · ' + q.picks.none + '</span></div>' : '') +
          '</div></div><div class="acc"><b class="num" style="color:var(--' + t + ')">' + (q.accuracy === null ? '—' : q.accuracy + '%') + '</b><small>To\'g\'ri: ' + q.correct + ' / ' + q.attempts + '</small></div></div>';
      }).join('') + '</div></section></div><div class="col">' +
      '<section class="panel"><div class="panel-head"><h2>Eng ko\'p xato qilingan savollar</h2></div><div style="margin-top:8px">' +
      (diffs.length
        ? diffs.map((q, i) => '<div class="hard"><span class="bubble rank">' + (i + 1) + '</span><span class="truncate"><b>Savol ' + q.number + '</b> <span class="muted">— ' + esc(q.question) + '</span></span><span class="badge ' + tone(q.accuracy) + ' plain">' + q.accuracy + '% to\'g\'ri</span></div>').join('')
        : '<div class="hard" style="grid-template-columns:1fr"><span class="muted">Barcha savollarga hamma to\'g\'ri javob bergan. Ajoyib natija!</span></div>') +
      '</div></section>' +
      '<section class="panel"><div class="panel-head"><h2>Natijalar taqsimoti</h2></div><div class="bars dist">' +
      d.distribution.map((x) => '<div class="b"><div class="fill-wrap"><div class="fill" style="height:' + Math.max(3, (x.count / maxDist) * 100) + '%"></div></div><span class="v">' + x.count + '</span><span class="d">' + x.label + '</span></div>').join('') +
      '</div></section></div></div>';
  }

  $('#pick').addEventListener('change', (e) => {
    testId = Number(e.target.value);
    history.replaceState(null, '', '/analytics?test=' + testId);
    load();
  });
  load();
})();
