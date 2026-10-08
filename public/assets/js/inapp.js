(function () {
  'use strict';

  if (window.SiteInApp) return;

  var root = document.documentElement;
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var iosMajor = ios ? parseInt((/OS (\d+)_/.exec(ua) || [])[1], 10) || 0 : 0;
  var android = /Android/i.test(ua);

  function iosWebView() {
    if (!ios || !/AppleWebKit/.test(ua) || /Safari\//.test(ua)) return false;
    if (navigator.standalone) return false;
    try { if (window.matchMedia('(display-mode: standalone)').matches) return false; } catch (e) {}
    return true;
  }

  var APPS = [
    ['Instagram', /Instagram/i],
    ['Threads', /Barcelona/i],
    ['Messenger', /MessengerForiOS|MessengerLite|FB_IAB\/MESSENGER|Orca-Android/i],
    ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i],
    ['TikTok', /musical_ly|BytedanceWebview|TikTok|trill_|aweme/i],
    ['Snapchat', /Snapchat/i],
    ['X', /Twitter/i],
    ['LinkedIn', /LinkedInApp/i],
    ['Pinterest', /Pinterest/i],
    ['Reddit', /Reddit/i],
    ['Discord', /Discord/i],
    ['Twitch', /Twitch/i],
    ['Tumblr', /Tumblr/i],
    ['Steam', /Valve Steam/i],
    ['LINE', /\bLine\//],
    ['WeChat', /MicroMessenger/i],
    ['QQ', /\bQQ\//],
    ['Weibo', /Weibo/i],
    ['KakaoTalk', /KAKAOTALK/i],
    ['NAVER', /NAVER\(inapp/i],
    ['Zalo', /Zalo/i],
    ['Viber', /Viber/i],
    ['Telegram', /Telegram/i],
    ['Google', /\bGSA\//],
    ['', /; wv\)/],
    ['', iosWebView],
  ];

  var app = null;
  for (var i = 0; i < APPS.length; i++) {
    var test = APPS[i][1];
    if (typeof test === 'function' ? test() : test.test(ua)) { app = APPS[i][0]; break; }
  }
  if (!ios && !android) app = null;
  var STEP_MS = 1500;

  function editing() { return root.classList.contains('in-editor'); }

  function mode() {
    var v = document.body ? (document.body.getAttribute('data-inapp') || '') : '';
    return v === 'redirect' || v === 'block' || v === 'offer' || v === 'redirect-offer' ? v : 'off';
  }

  var storage = (function () {
    try {
      sessionStorage.setItem('inapp-probe', '1');
      sessionStorage.removeItem('inapp-probe');
      return sessionStorage;
    } catch (e) { return null; }
  })();

  function remembered(key) { return storage ? storage.getItem(key) === '1' : false; }
  function remember(key) { if (storage) storage.setItem(key, '1'); }

  function pageUrl() { return location.href.split('#')[0]; }

  function intentUrl() {
    return 'intent://' + location.host + location.pathname + location.search +
      '#Intent;scheme=' + location.protocol.replace(':', '') +
      ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE' +
      ';S.browser_fallback_url=' + encodeURIComponent(pageUrl()) + ';end';
  }

  function steps() {
    var list = [];
    if (android) list.push(function (next) { location.href = intentUrl(); next(); });
    if (ios && iosMajor >= 17) list.push(function (next) { location.href = 'x-safari-' + pageUrl(); next(); });
    return list;
  }

  var escaping = false;

  function escape(done) {
    if (escaping) return;
    escaping = true;
    var list = steps();
    var left = function () {
      escaping = false;
      if (done) done(document.visibilityState === 'hidden');
    };
    var run = function () {
      if (document.visibilityState === 'hidden' || !list.length) { left(); return; }
      var step = list.shift();
      step(function () { setTimeout(run, STEP_MS); });
    };
    run();
  }

  function copy(text, button) {
    var done = function () {
      var label = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = label; }, 1400);
    };
    var fallback = function () {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { if (document.execCommand('copy')) done(); } catch (e) {}
      field.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function button(label, kind) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'site-notice-btn' + (kind ? ' is-' + kind : '');
    b.textContent = label;
    return b;
  }

  function line(cls, value) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = value;
    return p;
  }

  var TEXTS = {
    'data-inapp-text': 'This page opened inside {app}. Your browser keeps your logins and opens email links.',
    'data-inapp-block-title': 'Open in your browser',
    'data-inapp-block-text': 'This page doesn’t open inside {app}. Continue in your browser, where your logins and email links work.',
    'data-inapp-hint': 'If your browser did not open, use the menu (••• or ⋮) and choose Open in browser.',
    'data-inapp-contact-text': 'If nothing opened, copy the address, or open this page in your browser.',
  };

  function wording(name) {
    var b = document.body;
    var own = b && b.hasAttribute(name) ? b.getAttribute(name).trim() : null;
    return (own === null ? TEXTS[name] : own).replace(/\{app\}/g, app || 'an app');
  }

  var panel = null;

  function close() {
    if (!panel) return;
    panel.remove();
    panel = null;
    root.classList.remove('inapp-blocked');
  }

  function build(kind, message, copyLabel, copyText, closable) {
    close();
    var gate = kind === 'gate';
    panel = document.createElement('div');
    panel.className = gate ? 'inapp-gate' : 'site-notice inapp-bar';
    panel.setAttribute('role', gate ? 'dialog' : 'region');
    panel.setAttribute('aria-label', 'Open in your browser');

    var box = panel;
    if (gate) {
      box = document.createElement('div');
      box.className = 'inapp-card';
      panel.appendChild(box);
      var title = wording('data-inapp-block-title');
      if (title) box.appendChild(line('inapp-title', title));
      root.classList.add('inapp-blocked');
    }
    if (message) box.appendChild(line('site-notice-text', message));
    var hintText = wording('data-inapp-hint');
    var hint = hintText ? line('site-notice-hint', hintText) : null;
    if (hint) {
      hint.hidden = !gate;
      box.appendChild(hint);
    }

    var actions = document.createElement('div');
    actions.className = 'site-notice-actions';
    var openBtn = button('Open in browser', 'primary');
    var copyBtn = button(copyLabel);
    openBtn.addEventListener('click', function () {
      escape(function (left) { if (!left && hint) hint.hidden = false; });
    });
    copyBtn.addEventListener('click', function () { copy(copyText, copyBtn); });
    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    if (closable) {
      var closeBtn = button('Not now', 'quiet');
      closeBtn.addEventListener('click', function () {
        remember('inapp-dismissed');
        close();
      });
      actions.appendChild(closeBtn);
    }
    box.appendChild(actions);
    document.body.appendChild(panel);
  }

  function showBar() {
    build('bar', wording('data-inapp-text'), 'Copy link', pageUrl(), true);
  }

  function showGate() {
    build('gate', wording('data-inapp-block-text'), 'Copy link', pageUrl(), false);
  }

  function contactOf(link) {
    var href = (link.getAttribute('href') || link.getAttribute('data-link-href') || '').trim();
    var m = /^(mailto|tel|sms):([^?]*)/i.exec(href);
    if (!m) return '';
    try { return decodeURIComponent(m[2]) || m[1]; } catch (e) { return m[2] || m[1]; }
  }

  document.addEventListener('click', function (e) {
    if (app === null || editing() || mode() === 'off' || !e.target.closest) return;
    if (panel && panel.contains(e.target)) return;
    var link = e.target.closest('a[href], [data-link-href]');
    var contact = link ? contactOf(link) : '';
    if (contact) {
      build('bar', wording('data-inapp-contact-text'), 'Copy address', contact, true);
    }
  }, true);

  function boot() {
    if (app === null || editing()) return;
    var m = mode();
    if (m === 'off') return;
    if (m === 'offer') {
      if (!remembered('inapp-dismissed')) showBar();
      return;
    }
    if (m === 'block') showGate();
    var after = function (left) {
      if (m === 'redirect-offer' && !left && !remembered('inapp-dismissed')) showBar();
    };
    if (!storage || remembered('inapp-tried')) { after(false); return; }
    remember('inapp-tried');
    escape(after);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteInApp = {
    app: app,
    intentUrl: intentUrl,
    escape: escape,
  };
})();
