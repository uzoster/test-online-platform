/* Boshqaruv paneli: umumiy ko'rsatkichlar, so'nggi 7 kun, so'nggi natijalar. */
(async function () {
  'use strict';
  const { $, esc, api, icon, initShell, toast, mmss, tone } = App;
  const me = await initShell({ page: 'teacher', title: 'Boshqaruv paneli' });
  if (!me) return;

  const root = $('#page');
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Xayrli tun' : hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';
  root.innerHTML =
    '<div class="page-head"><div><h1>' + hello + ', ' + esc(me.name) + '</h1><p>Testlaringiz va talabalar natijalari bir joyda.</p></div>' +
    '<div class="page-actions"><a class="btn" href="/upload-test">' + icon('upload') + 'Excel yuklash</a>' +
    '<a class="btn btn-primary" href="/create-test">' + icon('plus') + 'Yangi test</a></div></div>' +
    '<section class="panel metrics" id="metrics" aria-label="Umumiy ko\'rsatkichlar"></section>' +
    '<div class="dash-grid"><div class="col">' +
    '<section class="panel"><div class="panel-head"><h2>So\'nggi 7 kunda boshlangan urinishlar</h2></div><div class="bars" id="bars"></div></section>' +
    '<section class="panel"><div class="panel-head"><h2>So\'nggi natijalar</h2></div><ul class="list" id="recent" style="margin-top:8px"></ul></section>' +
    '</div><div class="col">' +
    '<section class="panel"><div class="panel-head"><h2>Tezkor amallar</h2></div><div class="quick">' +
    '<a href="/create-test">' + icon('plus') + '<span>Test yaratish<small>Savollarni qo\'lda kiriting</small></span></a>' +
    '<a href="/upload-test">' + icon('sheet') + '<span>Excel\'dan yuklash<small>Tayyor fayl bo\'yicha import</small></span></a>' +
    '<a href="/tests">' + icon('link') + '<span>Havolani olish<small>E\'lon qilingan testlar ro\'yxati</small></span></a></div></section>' +
    '<section class="panel"><div class="panel-head"><h2>Eng faol testlar</h2></div><ul class="list" id="top" style="margin-top:8px"></ul></section>' +
    '</div></div>';

  const metric = (ic, label, val, foot) =>
    '<div class="metric"><div class="metric-top"><span class="bubble">' + icon(ic) + '</span>' + label + '</div>' +
    '<div class="metric-val num">' + val + '</div><div class="metric-foot">' + foot + '</div></div>';

  $('#metrics').innerHTML = [0, 1, 2, 3].map(() => '<div class="metric"><div class="skeleton" style="height:70px"></div></div>').join('');

  let s;
  try {
    s = await api('/api/stats');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  $('#metrics').innerHTML =
    metric('list', 'Jami testlar', s.total_tests, s.published_tests + ' tasi e\'lon qilingan') +
    metric('users', 'Jami qatnashchilar', s.participants, s.live_attempts ? s.live_attempts + ' kishi hozir topshiryapti' : 'Topshirib bo\'lganlar') +
    metric('avg', 'O\'rtacha natija', s.average + '<small>%</small>', 'Barcha testlar bo\'yicha') +
    metric('calendar', 'Bugungi testlar', s.today_tests, s.today_attempts + ' ta urinish bugun boshlangan');

  /* 7 kunlik ustunlar */
  const max = Math.max(1, ...s.last_7_days.map((d) => d.count));
  const names = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
  $('#bars').innerHTML = s.last_7_days
    .map((d, i) => {
      const dt = new Date(d.date + 'T00:00:00');
      const today = i === s.last_7_days.length - 1;
      return '<div class="b' + (today ? ' today' : '') + '"><div class="fill-wrap"><div class="fill" style="height:' + Math.max(3, (d.count / max) * 100) + '%" title="' + d.count + ' ta urinish"></div></div>' +
        '<span class="v">' + d.count + '</span><span class="d">' + (today ? 'Bugun' : names[dt.getDay()]) + '</span></div>';
    })
    .join('');

  /* so'nggi natijalar */
  $('#recent').innerHTML = s.recent_attempts.length
    ? s.recent_attempts
        .map(
          (a) =>
            '<li><a class="row-link" href="/results?test=' + a.test_id + '"><span class="avatar" style="width:34px;height:34px;font-size:.8125rem">' +
            esc((a.student_surname || '?').charAt(0)) + '</span><span class="grow"><span class="t truncate" style="display:block">' +
            esc(a.student_surname + ' ' + a.student_name) + '</span><span class="s truncate" style="display:block">' + esc(a.test_title) +
            ' · ' + mmss(a.time_spent) + '</span></span><span class="score-pill num" style="color:var(--' + tone(a.percentage) + ')">' +
            a.score + '/' + a.total_questions + ' · ' + Math.round(a.percentage) + '%</span></a></li>'
        )
        .join('')
    : '<li class="muted">Hozircha natijalar yo\'q. Testni e\'lon qilib, havolani guruhga yuboring.</li>';

  $('#top').innerHTML = s.top_tests.length
    ? s.top_tests
        .map(
          (t) =>
            '<li><a class="row-link" href="/results?test=' + t.id + '"><span class="grow"><span class="t truncate" style="display:block">' + esc(t.title) +
            '</span><span class="s">' + (t.is_published ? 'E\'lon qilingan' : 'Qoralama') + (t.subject ? ' · ' + esc(t.subject) : '') +
            '</span></span><span class="badge plain ' + (t.participants ? '' : 'gray') + '">' + t.participants + ' kishi' +
            (t.avg_percentage !== null && t.participants ? ' · ' + Math.round(t.avg_percentage) + '%' : '') + '</span></a></li>'
        )
        .join('')
    : '<li class="muted">Hali test yaratilmagan.</li>';
})();
