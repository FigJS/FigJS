(function () {
  'use strict';

  if (window.SiteSubpage) return;

  var root = document.documentElement;
  var stack = [];

  function editing() { return root.classList.contains('in-editor'); }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function attr(sp, name) { return (sp.getAttribute(name) || '').trim(); }
  function modal(sp) { return attr(sp, 'data-subpage-mode') !== 'float'; }
  function locks(sp) {
    var v = attr(sp, 'data-subpage-scroll');
    return v === 'lock' || (!v && modal(sp));
  }
  function hides(sp) { return attr(sp, 'data-subpage-behind') === 'hide'; }
  function hashed(sp) { return attr(sp, 'data-subpage-hash') === 'on' && !!sp.id; }
  function escCloses(sp) { return attr(sp, 'data-subpage-esc') !== 'off'; }
  function outsideCloses(sp) { return attr(sp, 'data-subpage-outside') !== 'off'; }

  function find(ref) {
    if (!ref) return null;
    if (ref.nodeType === 1) return ref.classList.contains('subpage') ? ref : ref.closest('.subpage');
    var el = document.getElementById(String(ref).replace(/^#/, ''));
    return el && el.classList.contains('subpage') ? el : null;
  }

  function currentHash() {
    var h = location.hash.slice(1);
    try { return decodeURIComponent(h); } catch (e) { return h; }
  }

  function sync() {
    var lock = stack.some(locks);
    if (lock && !root.classList.contains('subpage-lock')) {
      var gutter = window.innerWidth - root.clientWidth;
      var body = document.body;
      if (gutter > 0 && body) {
        var k = body.offsetWidth ? body.getBoundingClientRect().width / body.offsetWidth || 1 : 1;
        root.style.setProperty('--sp-gutter', (gutter / k).toFixed(2) + 'px');
        root.classList.add('subpage-lock-gutter');
      }
      root.classList.add('subpage-lock');
      if (window.SiteScroll) window.SiteScroll.stop();
    } else if (!lock && root.classList.contains('subpage-lock')) {
      root.classList.remove('subpage-lock', 'subpage-lock-gutter');
      root.style.removeProperty('--sp-gutter');
    }
    root.classList.toggle('subpage-hide-behind', stack.some(hides));
  }

  function label(sp) {
    if (sp.hasAttribute('aria-label') || sp.hasAttribute('aria-labelledby')) return;
    var title = sp.querySelector('.subpage-title');
    if (!title || !title.textContent.trim()) return;
    if (!title.id) title.id = (sp.id || 'subpage') + '-title';
    sp.setAttribute('aria-labelledby', title.id);
  }

  function stopMedia(sp) {
    sp.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} });
    var marks = sp.__spFrames || (sp.__spFrames = []);
    sp.querySelectorAll('iframe').forEach(function (f) {
      var host = f.closest('.game-embed, .embed, .godot-embed');
      if (host && host.__gameEmbedMounted) return;
      var mark = document.createComment('');
      mark.__spFrame = f;
      f.replaceWith(mark);
      marks.push(mark);
    });
  }

  function restoreMedia(sp) {
    (sp.__spFrames || []).forEach(function (mark) {
      if (mark.parentNode) mark.replaceWith(mark.__spFrame);
    });
    sp.__spFrames = [];
  }

  function addressOf(sp) { return sp.__spAddress || sp.id; }
  function owns(sp, hash) { return !!hash && (hash === sp.id || hash === sp.__spAddress); }

  var leaving = 0;
  var leaveTimer = 0;
  var leaves = [];
  var landedAt = 0;
  var landedHash = '';

  function goBack() {
    leaving++;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(landed, 1000);
    history.back();
  }

  function landed() {
    leaving = 0;
    clearTimeout(leaveTimer);
    landedAt = Date.now();
    landedHash = location.hash;
    var waiting = leaves;
    leaves = [];
    waiting.forEach(function (w) {
      if (!w.sp.__spOpen) leaveHash(w.sp, w.mode, w.pushed);
    });
    if (leaving) return;
    stack.forEach(function (sp) {
      if (!sp.__spHashLater) return;
      sp.__spHashLater = false;
      if (sp.__spOpen && hashed(sp)) pushHash(sp);
    });
  }

  function ownHashChange() {
    return !!leaving || (Date.now() - landedAt < 300 && location.hash === landedHash);
  }

  function pushHash(sp) {
    sp.__spPushed = false;
    if (leaving) { sp.__spHashLater = true; return; }
    if (owns(sp, currentHash())) {
      sp.__spPushed = !!(history.state && history.state.siteSubpage === sp.id);
      return;
    }
    try {
      history.pushState({ siteSubpage: sp.id }, '', location.pathname + location.search + '#' + encodeURIComponent(addressOf(sp)));
      sp.__spPushed = true;
    } catch (e) {}
  }

  function readdress(ref, address) {
    var sp = find(ref);
    if (!sp) return;
    var here = currentHash();
    var mine = sp.__spOpen && hashed(sp) && owns(sp, here);
    sp.__spAddress = address || '';
    var next = addressOf(sp);
    if (!mine || here === next) return;
    try { history.replaceState(history.state, '', location.pathname + location.search + '#' + encodeURIComponent(next)); } catch (e) {}
  }

  function leaveHash(sp, mode, wasPushed) {
    var pushed = wasPushed != null ? wasPushed : sp.__spPushed;
    sp.__spPushed = false;
    sp.__spHashLater = false;
    if (leaving) {
      if (pushed || hashed(sp)) leaves.push({ sp: sp, mode: mode, pushed: pushed });
      return;
    }
    if (!hashed(sp) || !owns(sp, currentHash())) return;
    try {
      if (pushed && mode !== 'replace' && history.state && history.state.siteSubpage === sp.id) goBack();
      else history.replaceState(history.state, '', location.pathname + location.search);
    } catch (e) {}
  }

  function wire(sp) {
    if (sp.__spWired) return;
    sp.__spWired = true;
    sp.addEventListener('cancel', function (e) {
      e.preventDefault();
      if (escCloses(sp)) close(sp);
    });
    sp.addEventListener('close', function () {
      if (!sp.__spOpen || sp.open || sp.matches(':popover-open')) return;
      if (escCloses(sp) && close(sp)) return;
      show(sp);
    });
  }

  function settle(sp) {
    if (sp.querySelector('[autofocus]')) return;
    if (!sp.hasAttribute('tabindex')) sp.setAttribute('tabindex', '-1');
    try { sp.focus({ preventScroll: true }); } catch (e) {}
  }

  function show(sp) {
    if (sp.tagName !== 'DIALOG') return;
    try {
      if (modal(sp)) {
        if (sp.open && !sp.matches(':modal')) sp.close();
        if (!sp.open) {
          sp.showModal();
          settle(sp);
        }
      } else if (typeof sp.showPopover === 'function') {
        if (sp.open) sp.close();
        sp.setAttribute('popover', 'manual');
        if (!sp.matches(':popover-open')) sp.showPopover();
      } else if (!sp.open) {
        sp.show();
        settle(sp);
      }
    } catch (e) {}
  }

  function hide(sp) {
    try { if (sp.matches(':popover-open')) sp.hidePopover(); } catch (e) {}
    if (sp.hasAttribute('popover')) sp.removeAttribute('popover');
    try { if (sp.open) sp.close(); } catch (e) {}
  }

  var SETTLE_MS = 600;
  function warm(sp) {
    if (!sp || sp.__spWarm) return;
    sp.__spWarm = true;
    sp.querySelectorAll('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
  }

  function settleContent(sp) {
    warm(sp);
    if (sp.classList.contains('gallery-view')) return;
    var waiting = Array.prototype.filter.call(sp.querySelectorAll('img'), function (img) {
      return !img.complete && !!img.getAttribute('src');
    });
    if (!waiting.length) return;
    sp.classList.add('is-settling');
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      sp.classList.remove('is-settling');
    };
    Promise.all(waiting.map(function (img) {
      return new Promise(function (resolve) {
        if (img.complete) { resolve(); return; }
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })).then(finish);
    setTimeout(finish, SETTLE_MS);
  }

  function intent(e) {
    if (editing()) return;
    var link = e.target && e.target.closest && e.target.closest('a[href], [data-link-href]');
    if (!link) return;
    var raw = (link.getAttribute('data-link-href') || link.getAttribute('href') || '').trim();
    if (raw.charAt(0) !== '#' || raw.length < 2) return;
    var id = raw.slice(1);
    try { id = decodeURIComponent(id); } catch (err) {}
    var target = document.getElementById(id);
    if (!target) {
      try { target = document.querySelector('[data-anchor-slug="' + CSS.escape(id) + '"]'); } catch (err) { target = null; }
    }
    var sp = target && (target.classList.contains('subpage') ? target : target.closest('.subpage'));
    if (sp) warm(sp);
  }
  document.addEventListener('pointerover', intent, { passive: true });
  document.addEventListener('focusin', intent);

  function open(ref, opts) {
    var sp = find(ref);
    if (!sp || editing() || !sp.isConnected) return false;
    var o = opts || {};
    if (sp.__spOpen) return true;
    clearTimeout(sp.__spTimer);
    sp.__spOpen = true;
    sp.__spReturn = o.from && o.from.focus && !sp.contains(o.from) ? o.from : document.activeElement;
    wire(sp);
    label(sp);
    restoreMedia(sp);
    settleContent(sp);
    sp.classList.remove('is-closing');
    sp.classList.add('is-open');
    show(sp);
    stack.push(sp);
    sync();
    if (hashed(sp) && o.hash !== false) pushHash(sp);
    sp.dispatchEvent(new CustomEvent('subpage:open', { bubbles: true }));
    return true;
  }

  function rewind(sp) {
    if (attr(sp, 'data-subpage-reopen') === 'keep' || sp.classList.contains('gallery-view')) return;
    [sp].concat(Array.prototype.slice.call(sp.querySelectorAll('*'))).forEach(function (n) {
      if (!n.scrollTop && !n.scrollLeft) return;
      var left = 0;
      if (n.classList.contains('track-viewport')) {
        var host = n.parentElement;
        var start = Math.max(1, parseInt(host && host.getAttribute('data-track-start'), 10) || 1);
        var slides = n.querySelectorAll(':scope > .track-inner > .track-slide:not(.is-clone)');
        var first = slides[Math.min(slides.length, start) - 1];
        if (first) left = first.offsetLeft;
      }
      try { n.scrollTo({ top: 0, left: left, behavior: 'instant' }); }
      catch (e) { n.scrollTop = 0; n.scrollLeft = left; }
    });
  }

  function outMs(sp) {
    if (reducedMotion()) return 0;
    var cs = getComputedStyle(sp);
    if (!cs.animationName || cs.animationName === 'none') return 0;
    var d = parseFloat(cs.animationDuration) || 0;
    return /ms/.test(cs.animationDuration) ? d : d * 1000;
  }

  function close(ref, opts) {
    var sp = find(ref);
    if (!sp || !sp.__spOpen) return true;
    var o = opts || {};
    var stop = attr(sp, 'data-subpage-media') !== 'keep';
    if (!o.force) {
      var ask = new CustomEvent('subpage:beforeclose', { bubbles: true, cancelable: true, detail: { stop: stop } });
      if (!sp.dispatchEvent(ask)) return false;
    }
    sp.__spOpen = false;
    var i = stack.indexOf(sp);
    if (i >= 0) stack.splice(i, 1);
    stack.slice().forEach(function (other) {
      if (sp.contains(other)) close(other, { history: 'none', instant: true, force: true });
    });
    if (o.history !== 'none') leaveHash(sp, o.history);
    var finish = function () {
      if (sp.__spOpen) return;
      rewind(sp);
      sp.classList.remove('is-open', 'is-closing', 'is-settling');
      hide(sp);
      if (stop) stopMedia(sp);
      sync();
      var back = sp.__spReturn;
      sp.__spReturn = null;
      var over = stack[stack.length - 1];
      if (over && back && !over.contains(back)) back = null;
      if (back && back.isConnected && back.focus && back !== document.body) {
        try { back.focus({ preventScroll: true }); } catch (e) {}
      }
      sp.dispatchEvent(new CustomEvent('subpage:close', { bubbles: true, detail: { stop: stop } }));
    };
    sp.classList.add('is-closing');
    var ms = o.instant ? 0 : outMs(sp);
    if (ms) sp.__spTimer = setTimeout(finish, ms + 20);
    else finish();
    return true;
  }

  function toggle(ref, opts) {
    var sp = find(ref);
    if (!sp) return false;
    if (sp.__spOpen) { close(sp, opts); return false; }
    return open(sp, opts);
  }

  function chain(sp) {
    var out = [];
    for (var n = sp; n; n = n.parentElement && n.parentElement.closest('.subpage')) out.push(n);
    return out;
  }

  function route(target, o) {
    if (editing() || !target || !target.closest) return false;
    var opts = o || {};
    var view = window.SiteGallery && window.SiteGallery.prepare ? window.SiteGallery.prepare(target) : null;
    if (view) target = view;
    var host = target.closest('.subpage');
    var keep = host ? chain(host) : [];
    var held = stack.slice().reverse().some(function (sp) {
      return keep.indexOf(sp) < 0 && !close(sp, { history: 'replace' });
    });
    if (held) return true;
    if (!host) return false;
    keep.reverse().forEach(function (sp) {
      open(sp, { from: opts.from, hash: opts.fromHash ? false : undefined });
    });
    if (target !== host) {
      if (window.SitePanels && window.SitePanels.reveal) window.SitePanels.reveal(target);
      requestAnimationFrame(function () {
        var smooth = opts.scroll !== 'instant' && !opts.instant && !reducedMotion();
        try {
          target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: opts.align === 'center' ? 'center' : 'start' });
        } catch (e) { target.scrollIntoView(); }
        if (window.SiteNav && window.SiteNav.highlight) window.SiteNav.highlight(target, opts.highlight, opts.from);
      });
    }
    return true;
  }

  function outside(sp, e) {
    var r = sp.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }

  window.addEventListener('click', function (e) {
    if (editing() || !stack.length) return;
    var top = stack[stack.length - 1];
    if (!outsideCloses(top) || top.classList.contains('is-closing')) return;
    if (modal(top)) {
      if (e.target === top && outside(top, e)) close(top);
    } else if (!top.contains(e.target) && !(e.target.closest && e.target.closest('.subpage'))) {
      close(top);
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (editing() || e.defaultPrevented || !e.target.closest) return;
    var closer = e.target.closest('.subpage-close, [data-subpage-close]');
    if (!closer) return;
    var named = closer.getAttribute('data-subpage-close');
    var sp = named ? find(named) : closer.closest('.subpage');
    if (!sp) return;
    e.preventDefault();
    close(sp);
  });

  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || editing() || !stack.length) return;
    var top = stack[stack.length - 1];
    e.preventDefault();
    if (escCloses(top) && !top.classList.contains('is-closing')) close(top);
  }, true);

  window.addEventListener('popstate', function () {
    if (leaving) { landed(); return; }
    var id = currentHash();
    stack.slice().forEach(function (sp) {
      if (sp.__spPushed && !owns(sp, id)) {
        sp.__spPushed = false;
        if (!close(sp, { history: 'none' })) pushHash(sp);
      }
    });
  });

  function boot() {
    if (editing()) return;
    document.querySelectorAll('.subpage.is-open').forEach(function (sp) { open(sp, { hash: false }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteSubpage = {
    open: open,
    close: close,
    toggle: toggle,
    route: route,
    readdress: readdress,
    ownHashChange: ownHashChange,
    isOpen: function (ref) { var sp = find(ref); return !!(sp && sp.__spOpen); },
    top: function () { return stack[stack.length - 1] || null; },
  };
})();
