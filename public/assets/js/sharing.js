(function () {
  'use strict';

  if (window.Sharing) return;

  function inEditorMode() {
    try {
      return !!(document.documentElement &&
                document.documentElement.classList.contains('in-editor'));
    } catch (e) { return false; }
  }

  function writeToClipboard(text) {
    if (!text) return Promise.resolve(false);

    if (inEditorMode()) return Promise.resolve(true);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  var SVG_COPY =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
    '<path d="M5 15V5a2 2 0 012-2h10"/></svg>';

  var SVG_CHECK =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 12l5 5L20 6"/></svg>';

  var SVG_HASH =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18"/></svg>';

  var SVG_SHARE =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"/>' +
    '<circle cx="6" cy="12" r="3"/>' +
    '<circle cx="18" cy="19" r="3"/>' +
    '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

  var REG = new WeakMap();

  function regGet(host, kind) {
    var e = REG.get(host);
    return e ? (e[kind] || null) : null;
  }

  function regSet(host, kind, btn) {
    var e = REG.get(host);
    if (!e) { e = {}; REG.set(host, e); }
    e[kind] = btn;
  }

  function regClear(host, kind) {
    var e = REG.get(host);
    if (e) e[kind] = null;
  }

  function flashButton(btn) {
    if (!btn) return;
    if (btn.__sharingFlashTimer) clearTimeout(btn.__sharingFlashTimer);
    var original = btn.dataset.sharingIcon;
    if (!original) return;
    btn.innerHTML = SVG_CHECK;
    btn.classList.add('is-flashed');
    btn.__sharingFlashTimer = setTimeout(function () {
      btn.innerHTML = original;
      btn.classList.remove('is-flashed');
      btn.__sharingFlashTimer = null;
    }, 1400);
  }

  function flashInline(el) {
    if (!el) return;
    if (el.__shareFlashTimer) clearTimeout(el.__shareFlashTimer);
    el.classList.add('is-share-flashed');
    el.__shareFlashTimer = setTimeout(function () {
      el.classList.remove('is-share-flashed');
      el.__shareFlashTimer = null;
    }, 1400);
  }

  function flashAnchor(el) {
    if (!window.SiteNav || !el) return;
    var style = (el.closest('[data-jump-highlight]') || el).getAttribute('data-jump-highlight') || 'outline';
    window.SiteNav.highlight(el, style, el);
  }

  var NO_CHILD_TAGS = {
    IMG: 1, INPUT: 1, BR: 1, HR: 1, SOURCE: 1, TRACK: 1, AREA: 1,
    EMBED: 1, IFRAME: 1, VIDEO: 1, AUDIO: 1, SELECT: 1, TEXTAREA: 1,
  };

  function ensurePositioned(el) {
    try {
      if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
      }
    } catch (e) {}
  }

  function makeFloatingController(host, btn) {
    var raf = null;
    var disposed = false;

    function update() {
      if (disposed) return;
      if (!host.isConnected || !btn.isConnected) {
        if (btn.isConnected) scheduleSweep();
        return;
      }

      var cs = getComputedStyle(host);
      var cornerTop    = (cs.getPropertyValue('--cc-corner-top')    || '').trim();
      var cornerRight  = (cs.getPropertyValue('--cc-corner-right')  || '').trim();
      var cornerBottom = (cs.getPropertyValue('--cc-corner-bottom') || '').trim();
      var cornerLeft   = (cs.getPropertyValue('--cc-corner-left')   || '').trim();
      var offsetX = parseFloat(cs.getPropertyValue('--cc-offset-x')) || 8;
      var offsetY = parseFloat(cs.getPropertyValue('--cc-offset-y')) || 8;

      var useTop    = cornerTop    !== 'auto';
      var useRight  = cornerRight  !== 'auto';
      var useBottom = cornerBottom !== '' && cornerBottom !== 'auto';
      var useLeft   = cornerLeft   !== '' && cornerLeft   !== 'auto';

      if (!useTop && !useRight && !useBottom && !useLeft) {
        useTop = true;
        useRight = true;
      }

      var rect = host.getBoundingClientRect();
      var size = btn.offsetWidth
        || parseFloat(cs.getPropertyValue('--cc-size'))
        || 30;

      if (rect.bottom < 0 || rect.top > window.innerHeight ||
          rect.right < 0 || rect.left > window.innerWidth) {
        btn.style.display = 'none';
        return;
      }
      btn.style.display = '';

      var top = 0;
      var left = 0;
      if (useTop)         top = rect.top + offsetY;
      else if (useBottom) top = rect.bottom - size - offsetY;
      if (useLeft)        left = rect.left + offsetX;
      else if (useRight)  left = rect.right - size - offsetX;

      btn.style.top  = top  + 'px';
      btn.style.left = left + 'px';
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        update();
      });
    }

    var onScroll = schedule;
    var onResize = schedule;

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize, { passive: true });

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      try { ro.observe(host); } catch (e) {}
    }

    update();

    return function destroy() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }

  function ensureButton(el, kind, className, iconHTML, ariaLabel) {
    var registered = regGet(el, kind);
    if (registered && registered.isConnected) return registered;

    var dom = el.querySelector(':scope > .sharing-btn.' + className);
    if (dom) {
      dom.__sharingHost = el;
      dom.__sharingKind = kind;
      regSet(el, kind, dom);
      return dom;
    }

    var floating = el.getAttribute('data-cc-float') === 'true';
    if (!floating) ensurePositioned(el);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sharing-btn ' + className;
    if (floating) btn.classList.add('sharing-btn--floating');
    btn.dataset.sharingIcon = iconHTML;
    btn.innerHTML = iconHTML;
    btn.setAttribute('aria-label', ariaLabel);
    btn.__sharingHost = el;
    btn.__sharingKind = kind;

    btn.setAttribute('data-gjs-selectable', 'false');
    btn.setAttribute('data-gjs-draggable',  'false');
    btn.setAttribute('data-gjs-droppable',  'false');
    btn.setAttribute('data-gjs-copyable',   'false');
    btn.setAttribute('data-gjs-removable',  'false');

    if (floating) {
      document.body.appendChild(btn);
      btn.__sharingFloatDestroy = makeFloatingController(el, btn);
    } else {
      el.appendChild(btn);
    }

    regSet(el, kind, btn);
    return btn;
  }

  function currentLang() {
    var d = document;
    return (d.documentElement && d.documentElement.getAttribute('data-lang'))
        || (d.body && d.body.getAttribute('data-lang'))
        || 'en';
  }

  function resolveMdSource(el) {
    if (!el || !el.getAttribute) return null;
    var raw = el.getAttribute('data-md');
    if (raw == null) return null;

    var i18n = el.getAttribute('data-md-i18n');
    if (i18n) {
      try {
        var map = JSON.parse(i18n);
        var lang = currentLang();
        if (map && typeof map === 'object' && typeof map[lang] === 'string') {
          return map[lang];
        }
      } catch (e) {  }
    }
    return raw;
  }

  function payloadOf(el, depth) {
    if (!el) return '';
    if (depth == null) depth = 0;
    if (depth > 3) return (el.innerText || el.textContent || '').trim();

    var srcSel = el.getAttribute && el.getAttribute('data-copy-src');
    if (srcSel && depth < 3) {
      try {
        var target = document.querySelector(srcSel);
        if (target && target !== el) return payloadOf(target, depth + 1);
      } catch (e) {  }
    }

    var mode = (el.getAttribute && el.getAttribute('data-copy-mode')) || '';

    if (mode === 'href') {
      var a = el.tagName === 'A' ? el : el.querySelector('a[href]');
      return a ? a.href : '';
    }

    if (mode === 'text') {
      return (el.innerText || el.textContent || '').trim();
    }

    if (mode === 'md') {
      var explicit = resolveMdSource(el);
      if (explicit != null) return explicit;
      return (el.innerText || el.textContent || '').trim();
    }

    var auto = resolveMdSource(el);
    if (auto != null) return auto;
    return (el.innerText || el.textContent || '').trim();
  }

  function applyCopyContent(el) {
    if (!el || !el.isConnected) return;
    if (el.__sharingCopyApplied) return;
    if (NO_CHILD_TAGS[el.tagName]) return;
    el.__sharingCopyApplied = true;

    var btn = ensureButton(el, 'copy', 'sharing-btn--copy', SVG_COPY, 'Copy content');
    if (!btn) return;

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var payload = payloadOf(el);
      writeToClipboard(payload).then(function (ok) {
        if (!ok) return;
        flashButton(btn);
        el.dispatchEvent(new CustomEvent('sharing:copied', {
          bubbles: true,
          detail: { payload: payload, kind: 'content' },
        }));
      });
    });
  }

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function resolveHashTarget(id) {
    if (!id) return null;
    if (window.SiteNav) return window.SiteNav.resolve(id);
    return document.getElementById(id);
  }

  function ensureAnchorSlug(el) {
    var explicit = el.getAttribute('data-anchor-slug');
    if (explicit) return explicit;
    if (el.id) return el.id;

    var base = slugify(el.textContent) || 'section';
    var s = base;
    var n = 1;
    while (resolveHashTarget(s)) { s = base + '-' + (++n); }
    el.id = s;
    return s;
  }

  function applyAnchorCopy(el) {
    if (!el || !el.isConnected) return;
    if (el.__sharingAnchorApplied) return;
    if (NO_CHILD_TAGS[el.tagName]) return;
    el.__sharingAnchorApplied = true;

    var btn = ensureButton(el, 'anchor', 'sharing-btn--anchor', SVG_HASH, 'Copy link to this section');
    if (!btn) return;

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var slug = ensureAnchorSlug(el);
      var url = location.origin + location.pathname + '#' + slug;
      writeToClipboard(url).then(function (ok) {
        if (!ok) return;
        flashButton(btn);
        flashAnchor(el);
        el.dispatchEvent(new CustomEvent('sharing:copied', {
          bubbles: true,
          detail: { payload: url, kind: 'anchor', slug: slug },
        }));
      });
    });
  }

  function sharePayload(el) {
    var text = el.getAttribute('data-share-text') || '';
    var payload = { title: document.title, url: location.href };
    if (text) payload.text = text;
    return payload;
  }

  function performShare(el, flash) {
    var payload = sharePayload(el);

    if (inEditorMode()) {
      flash();
      return;
    }

    if (navigator.share) {
      navigator.share(payload).then(function () {
        flash();
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        writeToClipboard(payload.url).then(function (ok) {
          if (ok) flash();
        });
      });
      return;
    }

    writeToClipboard(payload.url).then(function (ok) {
      if (ok) flash();
    });
  }

  function applyShareButton(el) {
    if (!el || !el.isConnected) return;
    if (el.__sharingShareApplied) return;
    if (NO_CHILD_TAGS[el.tagName]) return;

    var isInlineHost = el.tagName === 'BUTTON' || el.tagName === 'A';

    if (isInlineHost) {
      el.__sharingShareApplied = true;
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        performShare(el, function () { flashInline(el); });
      });
      return;
    }

    el.__sharingShareApplied = true;
    var btn = ensureButton(el, 'share', 'sharing-btn--share', SVG_SHARE, 'Share this page');
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      performShare(el, function () { flashButton(btn); });
    });
  }

  var SHARING_HOST_CLASSES = ['copy-content', 'anchor-copy', 'share-button'];
  var SHARING_HOST_RE = /(^|\s)(copy-content|anchor-copy|share-button|sharing-btn)(\s|$)/;

  function tearDownButton(host, kind, btn) {
    regClear(host, kind);
    if (kind === 'copy')   host.__sharingCopyApplied   = false;
    if (kind === 'anchor') host.__sharingAnchorApplied = false;
    if (kind === 'share')  host.__sharingShareApplied  = false;
    if (btn.__sharingFloatDestroy) {
      try { btn.__sharingFloatDestroy(); } catch (e) {}
      btn.__sharingFloatDestroy = null;
    }
    if (btn.parentNode) btn.parentNode.removeChild(btn);
  }

  function floatingCount() {
    return document.getElementsByClassName('sharing-btn--floating').length;
  }

  var sweepPending = false;
  function scheduleSweep() {
    if (sweepPending) return;
    sweepPending = true;
    requestAnimationFrame(function () {
      sweepPending = false;
      initAll();
    });
  }

  function initAll() {
    document.querySelectorAll('.copy-content').forEach(function (host) {
      var btn = regGet(host, 'copy');
      if (host.__sharingCopyApplied && (!btn || !btn.isConnected)) {
        host.__sharingCopyApplied = false;
      }
    });
    document.querySelectorAll('.anchor-copy').forEach(function (host) {
      var btn = regGet(host, 'anchor');
      if (host.__sharingAnchorApplied && (!btn || !btn.isConnected)) {
        host.__sharingAnchorApplied = false;
      }
    });
    document.querySelectorAll('.share-button').forEach(function (host) {
      var tag = host.tagName;
      if (tag === 'BUTTON' || tag === 'A') return;
      var btn = regGet(host, 'share');
      if (host.__sharingShareApplied && (!btn || !btn.isConnected)) {
        host.__sharingShareApplied = false;
      }
    });

    document.querySelectorAll('.sharing-btn').forEach(function (btn) {
      var host = btn.__sharingHost || btn.parentElement;
      if (!host) { btn.remove(); return; }

      var kind = btn.__sharingKind;
      if (!kind) {
        if (btn.classList.contains('sharing-btn--copy'))   kind = 'copy';
        else if (btn.classList.contains('sharing-btn--anchor')) kind = 'anchor';
        else if (btn.classList.contains('sharing-btn--share'))  kind = 'share';
      }
      if (!kind) { btn.remove(); return; }
      if (!host.isConnected) { tearDownButton(host, kind, btn); return; }

      var stillHas =
        (kind === 'copy'   && host.classList.contains('copy-content')) ||
        (kind === 'anchor' && host.classList.contains('anchor-copy'))  ||
        (kind === 'share'  && host.classList.contains('share-button'));
      if (!stillHas) {
        tearDownButton(host, kind, btn);
        return;
      }

      var wantsFloating = host.getAttribute('data-cc-float') === 'true';
      var isFloating = btn.classList.contains('sharing-btn--floating');
      if (wantsFloating !== isFloating) {
        tearDownButton(host, kind, btn);
      }
    });

    document.querySelectorAll('.copy-content').forEach(applyCopyContent);
    document.querySelectorAll('.anchor-copy').forEach(applyAnchorCopy);
    document.querySelectorAll('.share-button').forEach(applyShareButton);
  }

  function observe() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    var pending = false;
    new MutationObserver(function (muts) {
      if (pending) return;

      var relevant = false;
      for (var i = 0; i < muts.length && !relevant; i++) {
        var m = muts[i];

        if (m.type === 'attributes') {
          var el = m.target;
          if (!el || !el.classList) continue;

          var hasNow = false;
          for (var k = 0; k < SHARING_HOST_CLASSES.length; k++) {
            if (el.classList.contains(SHARING_HOST_CLASSES[k])) { hasNow = true; break; }
          }
          if (!hasNow && el.classList.contains('sharing-btn')) hasNow = true;

          var hadBefore = !!m.oldValue && SHARING_HOST_RE.test(m.oldValue);

          if (m.attributeName === 'data-cc-float') {
            for (var q = 0; q < SHARING_HOST_CLASSES.length; q++) {
              if (el.classList.contains(SHARING_HOST_CLASSES[q])) { hasNow = true; break; }
            }
          }

          if (hasNow || hadBefore) { relevant = true; break; }
        } else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var a = m.addedNodes[j];
            if (a.nodeType !== 1) continue;
            if (a.classList) {
              for (var r = 0; r < SHARING_HOST_CLASSES.length; r++) {
                if (a.classList.contains(SHARING_HOST_CLASSES[r])) { relevant = true; break; }
              }
            }
            if (relevant) break;
            if (a.querySelector &&
                a.querySelector('.copy-content, .anchor-copy, .share-button')) {
              relevant = true; break;
            }
          }
          if (relevant) break;

          for (var s = 0; s < m.removedNodes.length; s++) {
            var rn = m.removedNodes[s];
            if (rn.nodeType !== 1) continue;
            if (rn.classList && rn.classList.contains('sharing-btn')) {
              relevant = true; break;
            }
            if (floatingCount() && ((typeof rn.className === 'string' && SHARING_HOST_RE.test(rn.className)) ||
                (rn.querySelector && rn.querySelector('.copy-content, .anchor-copy, .share-button')))) {
              relevant = true; break;
            }
          }
        }
      }
      if (!relevant) return;

      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        initAll();
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-cc-float'],
      attributeOldValue: true,
    });
  }

  function boot() {
    initAll();
    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', initAll);

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    var lastEditor = inEditorMode();
    new MutationObserver(function () {
      var now = inEditorMode();
      if (now === lastEditor) return;
      lastEditor = now;
      initAll();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  window.Sharing = {
    apply: function (el) {
      if (!el || !el.classList) return;
      if (el.classList.contains('copy-content')) applyCopyContent(el);
      if (el.classList.contains('anchor-copy')) applyAnchorCopy(el);
      if (el.classList.contains('share-button')) applyShareButton(el);
    },
    initAll: initAll,
    ensureAnchorSlug: ensureAnchorSlug,
  };
})();