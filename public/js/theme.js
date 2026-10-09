/* Sahifa chizilishidan oldin mavzuni qo'llaydi (yorug'/qorong'i), miltillashning oldini oladi. */
(function () {
  try {
    var t = localStorage.getItem('otp-theme');
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    /* localStorage mavjud emas — standart mavzu */
  }
})();
