/* Umumiy yordamchilar: API, ikonkalar, toast, modal, o'qituvchi paneli qobig'i (sidebar + topbar). */
(function () {
  'use strict';

  /* ---------- yordamchilar ---------- */
  const esc = (s) =>
    String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function mmss(sec) {
    if (sec === null || sec === undefined) return '—';
    sec = Math.max(0, Math.round(sec));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  function fmtDate(ms) {
    if (!ms) return '—';
    const d = new Date(typeof ms === 'string' ? ms.replace(' ', 'T') + (ms.includes('Z') ? '' : 'Z') : ms);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  const pctText = (p) => (p === null || p === undefined ? '—' : Math.round(p * 10) / 10 + '%');
  const tone = (p) => (p >= 75 ? 'ok' : p >= 50 ? 'warn' : 'bad');

  /* ---------- ikonkalar ---------- */
  const PATHS = {
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    results: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    avg: '<path d="M4 18 9 12l4 3 7-9"/><path d="M15 6h5v5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18h.01"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
  };
  const icon = (name, cls) =>
    '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (PATHS[name] || '') + '</svg>';

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status;
      this.data = data || {};
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.formData) {
      init.body = opts.formData;
    } else if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (_) {
      throw new ApiError("Serverga ulanib bo'lmadi. Internet aloqasini tekshiring.", 0);
    }
    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { error: 'Kutilmagan javob olindi.' };
      }
    }
    if (!res.ok) {
      const err = new ApiError((data && data.error) || 'Xatolik yuz berdi.', res.status, data);
      if (res.status === 401 && opts.redirectOn401 !== false && document.body.dataset.teacher !== undefined) {
        location.href = '/';
      }
      throw err;
    }
    return data;
  }

  /* ---------- toast ---------- */
  function toast(message, type) {
    let box = $('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.innerHTML = icon(type === 'error' ? 'alert' : 'check') + '<span>' + esc(message) + '</span>';
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    }, type === 'error' ? 5200 : 2800);
  }

  /* ---------- modal ---------- */
  function openModal(opts) {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const modal = document.createElement('div');
    modal.className = 'modal' + (opts.wide ? ' wide' : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const titleId = 'm' + Math.random().toString(36).slice(2, 8);
    modal.setAttribute('aria-labelledby', titleId);
    modal.innerHTML =
      '<div class="modal-head"><h2 id="' + titleId + '">' + esc(opts.title || '') + '</h2>' +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" data-close aria-label="Yopish">' + icon('x') + '</button></div>' +
      '<div class="modal-body"></div><div class="modal-foot"></div>';
    const body = $('.modal-body', modal);
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    const foot = $('.modal-foot', modal);
    const handle = { el: modal, body, close };

    (opts.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      btn.addEventListener('click', async () => {
        if (b.onClick) {
          btn.classList.add('is-loading');
          try {
            const r = await b.onClick(handle);
            if (r === false) return;
          } finally {
            btn.classList.remove('is-loading');
          }
        }
        if (b.close !== false) close(b.value);
      });
      foot.appendChild(btn);
    });
    if (!foot.children.length) foot.remove();

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    let closed = false;
    function close(value) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (!$('.overlay')) document.body.style.overflow = '';
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (opts.onClose) opts.onClose(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && !opts.persistent) close();
    });
    $('[data-close]', modal).addEventListener('click', () => close());
    const autofocus = $('[autofocus]', modal) || $('.modal-foot .btn-primary, .modal-foot .btn:last-child', modal) || $('[data-close]', modal);
    setTimeout(() => autofocus && autofocus.focus(), 30);
    return handle;
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answer = false;
      openModal({
        title: opts.title,
        body: '<p>' + esc(opts.message) + '</p>',
        onClose: () => resolve(answer),
        buttons: [
          { label: opts.cancelLabel || 'Bekor qilish', cls: '' },
          {
            label: opts.confirmLabel || 'Tasdiqlash',
            cls: opts.danger ? 'btn-danger solid' : 'btn-primary',
            onClick: () => {
              answer = true;
            },
          },
        ],
      });
    });
  }

  /* ---------- nusxalash ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      /* zaxira usulga o'tamiz */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function copyWithToast(text) {
    const ok = await copyText(text);
    toast(ok ? 'Havola nusxalandi' : "Nusxalab bo'lmadi — havolani qo'lda belgilab oling", ok ? '' : 'error');
    return ok;
  }

  /* ---------- mavzu ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function setTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('otp-theme', t);
    } catch (_) {
      /* e'tiborsiz */
    }
  }

  /* ---------- brend belgisi (javob varag'i) ---------- */
  const BRAND_MARK =
    '<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="#2a3a8a" stroke="#4a5cc0" stroke-width="1.5"/>' +
    '<circle cx="12.5" cy="13" r="4" fill="none" stroke="#8b95c9" stroke-width="1.8"/><circle cx="27.5" cy="13" r="4" fill="#ffc83a"/>' +
    '<circle cx="12.5" cy="27" r="4" fill="#ffc83a"/><circle cx="27.5" cy="27" r="4" fill="none" stroke="#8b95c9" stroke-width="1.8"/></svg>';

  /* ---------- o'qituvchi paneli qobig'i ---------- */
  const NAV = [
    { id: 'teacher', href: '/teacher', label: 'Boshqaruv paneli', icon: 'home' },
    { id: 'tests', href: '/tests', label: 'Testlar', icon: 'list' },
    { id: 'create-test', href: '/create-test', label: 'Test yaratish', icon: 'plus' },
    { id: 'upload-test', href: '/upload-test', label: 'Excel yuklash', icon: 'upload' },
    { id: 'results', href: '/results', label: 'Natijalar', icon: 'results' },
    { id: 'analytics', href: '/analytics', label: 'Tahlil', icon: 'chart' },
    { id: 'settings', href: '/settings', label: 'Sozlamalar', icon: 'settings' },
  ];

  async function initShell(opts) {
    document.body.dataset.teacher = '';
    const content = document.getElementById('page');
    let me;
    try {
      me = (await api('/api/auth/me')).teacher;
    } catch (_) {
      location.href = '/';
      return null;
    }

    const nav = NAV.map(
      (n) => '<li><a href="' + n.href + '"' + (n.id === opts.page ? ' aria-current="page"' : '') + '>' + icon(n.icon) + '<span>' + n.label + '</span></a></li>'
    ).join('');
    const initial = (me.name || me.email || '?').trim().charAt(0).toUpperCase();

    const app = document.createElement('div');
    app.className = 'app';
    app.innerHTML =
      '<aside class="sidebar" id="sidebar" aria-label="Asosiy menyu">' +
      '<a class="brand" href="/teacher">' + BRAND_MARK + '<span><span class="brand-name">Online Test</span><span class="brand-sub">O\'qituvchi paneli</span></span></a>' +
      '<ul class="nav">' + nav + '<li class="nav-sep" role="separator"></li>' +
      '<li><button type="button" id="logout-btn">' + icon('logout') + '<span>Chiqish</span></button></li></ul>' +
      '<div class="sidebar-foot"></div></aside>' +
      '<div class="main"><header class="topbar">' +
      '<button class="btn btn-ghost btn-icon menu-btn" type="button" id="menu-btn" aria-label="Menyuni ochish">' + icon('menu') + '</button>' +
      '<span class="crumb">' + esc(opts.title) + '</span><span class="spacer"></span>' +
      '<button class="btn btn-ghost btn-icon" type="button" id="theme-btn" aria-label="Mavzuni almashtirish"></button>' +
      '<div class="user-chip"><span class="avatar" aria-hidden="true">' + esc(initial) + '</span>' +
      '<span class="who"><b>' + esc(me.name) + '</b><span>' + esc(me.email) + '</span></span></div></header>' +
      '<main class="page" id="main"></main></div><div class="scrim" id="scrim"></div>';

    document.body.insertBefore(app, document.body.firstChild);
    $('#main').appendChild(content);
    content.hidden = false;

    const themeBtn = $('#theme-btn');
    const paintTheme = () => {
      themeBtn.innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon');
    };
    paintTheme();
    themeBtn.addEventListener('click', () => {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      paintTheme();
    });

    const closeNav = () => document.body.classList.remove('nav-open');
    $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#scrim').addEventListener('click', closeNav);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeNav());

    $('#logout-btn').addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (_) {
        /* baribir chiqamiz */
      }
      location.href = '/';
    });
    return me;
  }

  window.App = { $, $$, esc, mmss, fmtDate, pctText, tone, icon, api, ApiError, toast, openModal, confirmDialog, copyText, copyWithToast, currentTheme, setTheme, initShell, BRAND_MARK };
})();
