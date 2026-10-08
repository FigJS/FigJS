(function () {
  'use strict';

  if (window.SiteNav) return;

  var root = document.documentElement;

  function inEditor() { return root.classList.contains('in-editor'); }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function resolve(id) {
    if (!id) return null;
    var el = document.getElementById(id);
    if (el) return el;
    try { return document.querySelector('[data-anchor-slug="' + CSS.escape(id) + '"]'); } catch (e) { return null; }
  }

  function hashOf(link) {
    var raw = link.getAttribute('data-link-href');
    if (raw == null) raw = link.getAttribute('href');
    raw = (raw || '').trim();
    if (!raw) return null;
    if (raw.charAt(0) === '#') {
      if (raw.length < 2) return null;
      try { return decodeURIComponent(raw.slice(1)); } catch (e) { return raw.slice(1); }
    }
    try {
      var u = new URL(raw, location.href);
      if (u.hash && u.origin === location.origin && u.pathname === location.pathname && u.search === location.search) {
        return decodeURIComponent(u.hash.slice(1));
      }
    } catch (e) {}
    return null;
  }

  function setting(from, name, fallback) {
    var holder = from && from.closest ? from.closest('[' + name + ']') : null;
    var v = holder ? (holder.getAttribute(name) || '').trim() : '';
    return v || fallback;
  }

  function optionsFor(from, target) {
    var inMd = !!(from && from.closest && from.closest('.md-block-render, .md-block'));
    return {
      align: setting(from, 'data-jump-align', inMd ? 'center' : 'start'),
      scroll: setting(from, 'data-jump-scroll', 'smooth'),
      highlight: setting(from, 'data-jump-highlight', inMd ? 'fill' : 'outline'),
      hash: setting(from, 'data-jump-hash', ''),
      from: from,
      target: target,
    };
  }

  function scaleOf(el) {
    var w = el.offsetWidth;
    var r = el.getBoundingClientRect();
    return w ? (r.width / w) || 1 : 1;
  }

  function topCover() {
    var cover = 0;
    var vw = window.innerWidth;
    var els = document.querySelectorAll('.sticky-top, .fixed-top, .sticky-header, [data-nav-cover]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var cs = getComputedStyle(el);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      var r = el.getBoundingClientRect();
      if (!r.height || r.width < vw * 0.5) continue;
      var top = (parseFloat(cs.top) || 0) * scaleOf(el);
      if (cs.position === 'fixed' && r.top > 1) continue;
      cover = Math.max(cover, top + r.height);
    }
    return Math.min(cover, window.innerHeight * 0.5);
  }

  var lit = null;
  var litTimer = 0;
  var LIT_VARS = ['--jump-color', '--jump-duration'];

  function clearHighlight() {
    if (litTimer) { clearTimeout(litTimer); litTimer = 0; }
    if (!lit) return;
    lit.classList.remove('nav-arrive', 'nav-arrive--outline', 'nav-arrive--fill');
    if (lit.__navVars) {
      LIT_VARS.forEach(function (v) { lit.style.removeProperty(v); });
      lit.__navVars = false;
    }
    lit = null;
  }

  function durationMs(el) {
    var v = (getComputedStyle(el).getPropertyValue('--jump-duration') || '').trim();
    var n = parseFloat(v);
    if (isNaN(n)) return 2400;
    return /ms$/.test(v) ? n : n * 1000;
  }

  function highlight(el, style, from) {
    clearHighlight();
    if (!el || !el.classList || style === 'none') return;
    if (from && from !== el) {
      var cs = getComputedStyle(from);
      LIT_VARS.forEach(function (v) {
        var val = (cs.getPropertyValue(v) || '').trim();
        if (val) { el.style.setProperty(v, val); el.__navVars = true; }
      });
    }
    el.classList.remove('nav-arrive', 'nav-arrive--outline', 'nav-arrive--fill');
    void el.offsetWidth;
    el.classList.add('nav-arrive', style === 'fill' ? 'nav-arrive--fill' : 'nav-arrive--outline');
    lit = el;
    litTimer = setTimeout(clearHighlight, durationMs(el) + 50);
  }

  var lastJump = 0;
  var glideFrame = 0;
  var glideBehavior = '';

  function stopGlide() {
    if (!glideFrame) return;
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
    root.style.scrollBehavior = glideBehavior;
  }

  function pageScrolls(el) {
    for (var node = el.parentElement; node && node !== document.body && node !== root; node = node.parentElement) {
      var oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return false;
    }
    return true;
  }

  function landing(target, align, cover, gap) {
    var r = target.getBoundingClientRect();
    var vh = window.innerHeight;
    var top = r.top - cover - gap;
    var d = align === 'center' ? (top + r.bottom - vh) / 2 : align === 'end' ? r.bottom - vh : top;
    var max = (document.scrollingElement || root).scrollHeight - vh;
    return Math.max(0, Math.min(max, window.scrollY + d));
  }

  function glide(target, align, smooth, hold) {
    stopGlide();
    var cover = topCover();
    var gap = align === 'start' ? 12 : 0;
    var from = window.scrollY;
    var t0 = performance.now();
    var dur = smooth ? Math.min(1000, Math.max(350, Math.abs(landing(target, align, cover, gap) - from) * 0.5)) : 0;
    var end = t0 + Math.max(dur, hold + 80);
    glideBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    var step = function (now) {
      var p = dur ? Math.min(1, (now - t0) / dur) : 1;
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(window.scrollX, from + (landing(target, align, cover, gap) - from) * e);
      if (now < end) glideFrame = requestAnimationFrame(step);
      else stopGlide();
    };
    glideFrame = requestAnimationFrame(step);
  }

  function jump(target, opts) {
    if (!target) return;
    var o = opts || {};
    var align = o.align === 'center' || o.align === 'end' ? o.align : 'start';
    var smooth = o.scroll !== 'instant' && !reducedMotion() && !o.instant;
    var hold = window.SitePanels && window.SitePanels.reveal ? window.SitePanels.reveal(target) : 0;
    lastJump = Date.now();
    stopGlide();
    if (hold && pageScrolls(target)) {
      glide(target, align, smooth, hold);
      highlight(target, o.highlight, o.from);
      return;
    }
    var cover = topCover();
    var scale = scaleOf(target);
    var gap = align === 'start' ? 12 : 0;
    var prevMargin = target.style.scrollMarginTop;
    target.style.scrollMarginTop = ((cover + gap) / scale) + 'px';
    try {
      target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: align, inline: 'nearest' });
    } catch (e) {
      target.scrollIntoView(align !== 'end');
    }
    var restore = function () { target.style.scrollMarginTop = prevMargin; };
    if (smooth) setTimeout(restore, 1200); else requestAnimationFrame(restore);
    highlight(target, o.highlight, o.from);
  }

  function routed(target, o) {
    return !!(window.SiteSubpage && window.SiteSubpage.route(target, o));
  }

  function go(from, target, id) {
    var o = optionsFor(from, target);
    if (routed(target, o)) { spyAll(); return; }
    jump(target, o);
    try {
      if (o.hash === 'on' && id != null) {
        var state = {};
        var prev = history.state;
        if (prev && typeof prev === 'object') for (var k in prev) state[k] = prev[k];
        state.siteJump = { id: id, align: o.align, scroll: o.scroll, highlight: o.highlight };
        history.replaceState(state, '', '#' + encodeURIComponent(id));
      } else if (location.hash) {
        history.replaceState(history.state, '', location.pathname + location.search);
      }
    } catch (e) {}
    spyAll();
  }

  function heldBy(el, target) {
    var sp = target && target.closest ? target.closest('.subpage') : null;
    return !!sp && sp !== el && el.contains(sp);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (inEditor()) return;
    var link = e.target && e.target.closest && e.target.closest('a[href], area[href], [data-link-href]');
    if (!link || heldBy(link, e.target)) return;
    var id = hashOf(link);
    if (id == null) return;
    var target = resolve(id);
    if (!target) {
      e.preventDefault();
      if (id.toLowerCase() === 'top') {
        window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }
    e.preventDefault();
    go(link, target, id);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.defaultPrevented || inEditor()) return;
    var link = e.target && e.target.closest && e.target.closest('[data-link-href]');
    if (!link || link.tagName === 'A' || link.tagName === 'BUTTON' || heldBy(link, e.target)) return;
    var id = hashOf(link);
    var target = id != null ? resolve(id) : null;
    if (!target) return;
    e.preventDefault();
    go(link, target, id);
  });

  function onUserScroll() {
    stopGlide();
    if (Date.now() - lastJump > 150) clearHighlight();
  }
  window.addEventListener('wheel', onUserScroll, { passive: true });
  window.addEventListener('touchmove', onUserScroll, { passive: true });
  window.addEventListener('mousedown', function () { stopGlide(); clearHighlight(); });
  window.addEventListener('keydown', function (e) {
    if (/^(Arrow|Page|Home|End)/.test(e.key) || e.key === ' ') { stopGlide(); clearHighlight(); }
  });

  function whenRevealed(cb) {
    if (!root.classList.contains('is-booting') && !root.classList.contains('is-armed')) {
      requestAnimationFrame(cb);
      return;
    }
    var mo = new MutationObserver(function () {
      if (root.classList.contains('is-booting') || root.classList.contains('is-armed')) return;
      mo.disconnect();
      requestAnimationFrame(cb);
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  function jumpToHash() {
    if (inEditor() || !location.hash) return;
    if (window.SiteSubpage && window.SiteSubpage.ownHashChange && window.SiteSubpage.ownHashChange()) return;
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { id = location.hash.slice(1); }
    var target = resolve(id);
    if (!target) return;
    var o = optionsFor(target, target);
    var saved = history.state && history.state.siteJump;
    if (saved && saved.id === id) {
      o.align = saved.align;
      o.highlight = saved.highlight;
    }
    o.instant = true;
    o.fromHash = true;
    if (!routed(target, o)) jump(target, o);
  }

  window.addEventListener('hashchange', jumpToHash);
  if (document.readyState === 'complete') whenRevealed(jumpToHash);
  else window.addEventListener('load', function () { whenRevealed(jumpToHash); });

  function slugify(text) {
    return String(text || '').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
  }

  function uniqueSlug(base, taken) {
    var s = base;
    var n = 1;
    while (taken[s] || (resolve(s) && !inEditor())) { s = base + '-' + (++n); }
    taken[s] = true;
    return s;
  }

  function pageLang() {
    return (document.body && document.body.getAttribute('data-lang')) || root.getAttribute('data-lang') || '';
  }

  function contentsLabel(el) {
    var lang = pageLang();
    return (lang && el.getAttribute('data-contents-label-' + lang)) || el.getAttribute('data-contents-label') || '';
  }

  var GENERATED_ID = /^i[a-z0-9]{2,}(-\d+)*$/;

  function anchorOf(el, taken) {
    var slug = el.getAttribute('data-anchor-slug');
    if (slug) return slug;
    if (el.id && !GENERATED_ID.test(el.id)) return el.id;
    var label = el.getAttribute('data-contents-label') || el.textContent;
    var s = uniqueSlug(slugify(label), taken);
    if (!inEditor()) {
      if (el.id) el.setAttribute('data-anchor-slug', s);
      else el.id = s;
    }
    return s;
  }

  function visible(el) {
    if (el.closest('[hidden]')) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function buildContents(nav) {
    if ((nav.getAttribute('data-contents') || '') !== 'auto') return;
    var list = nav.querySelector('.contents-list');
    if (!list) return;
    var levels = (nav.getAttribute('data-contents-levels') || 'h2,h3').split(',')
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(function (s) { return /^h[1-6]$/.test(s); });
    var scopeSel = nav.getAttribute('data-contents-scope');
    var scope = null;
    if (scopeSel) { try { scope = document.querySelector(scopeSel); } catch (e) {} }
    if (!scope) {
      var layout = nav.closest('.contents-layout');
      scope = layout && layout.querySelector(':scope > .contents-body');
    }
    if (!scope) scope = document.querySelector('main') || document.body;
    var sel = (levels.length ? levels.join(', ') + ', ' : '') + '[data-contents-label]';
    var taken = {};
    var items = [];
    scope.querySelectorAll(sel).forEach(function (el) {
      if (el.closest('.contents, [data-contents-skip]') || !visible(el)) return;
      var label = (contentsLabel(el) || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      var level = /^H[1-6]$/.test(el.tagName) ? Number(el.tagName.charAt(1)) : Number(el.getAttribute('data-contents-level')) || 2;
      items.push({ id: anchorOf(el, taken), label: label, level: level, el: el });
    });
    var signature = JSON.stringify(items.map(function (it) { return [it.id, it.label, it.level]; }));
    var nodes = list.__navNodes || [];
    var intact = nodes.every(function (n) { return n.parentNode === list; });
    if (list.__navSignature === signature && intact) return;
    nodes.forEach(function (n) { if (n.parentNode === list) list.removeChild(n); });
    list.__navSignature = signature;
    list.__navNodes = [];
    var top = items.reduce(function (m, it) { return Math.min(m, it.level); }, 6);
    var frag = document.createDocumentFragment();
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'contents-item contents-depth-' + (it.level - top);
      li.setAttribute('data-contents-auto', '');
      list.__navNodes.push(li);
      var a = document.createElement('a');
      a.className = 'contents-link';
      a.href = '#' + it.id;
      a.textContent = it.label;
      a.__navTarget = it.el;
      li.appendChild(a);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  var observer = null;

  function buildAll() {
    document.querySelectorAll('.contents').forEach(function (nav) {
      if ((nav.getAttribute('data-contents') || '') === 'auto') { buildContents(nav); return; }
      var list = nav.querySelector('.contents-list');
      if (list && list.__navNodes) {
        list.__navNodes.forEach(function (n) { if (n.parentNode === list) list.removeChild(n); });
        list.__navNodes = null;
        list.__navSignature = null;
      }
    });
    if (observer) observer.takeRecords();
  }

  function spyLine(container) {
    var v = parseFloat(getComputedStyle(container).getPropertyValue('--spy-line'));
    return isNaN(v) ? 30 : Math.max(0, Math.min(100, v));
  }

  function lineFraction(base) {
    var scroller = document.scrollingElement || root;
    var vh = window.innerHeight;
    var top = scroller.scrollTop;
    var left = scroller.scrollHeight - vh - top;
    var f = base / 100;
    if (top < vh) f = 0.02 + (f - 0.02) * (top / vh);
    if (left < vh) f = 1 - (1 - f) * Math.max(0, left) / vh;
    return f;
  }

  function spy(container) {
    var links = container.querySelectorAll('a[href], [data-link-href]');
    var items = [];
    for (var i = 0; i < links.length; i++) {
      var target = links[i].__navTarget;
      if (!target || !target.isConnected) {
        var id = hashOf(links[i]);
        target = id != null ? resolve(id) : null;
      }
      if (target) items.push({ link: links[i], top: target.getBoundingClientRect().top });
    }
    var current = null;
    if (items.length) {
      var cover = topCover();
      var line = cover + (window.innerHeight - cover) * lineFraction(spyLine(container));
      var sorted = items.slice().sort(function (a, b) { return a.top - b.top; });
      sorted.forEach(function (it) { if (it.top <= line) current = it.link; });
      if (!current && sorted[0].top < window.innerHeight) current = sorted[0].link;
    }
    items.forEach(function (it) {
      var on = it.link === current;
      if (it.link.classList.contains('is-current') !== on) it.link.classList.toggle('is-current', on);
      if (on) { if (it.link.getAttribute('aria-current') !== 'location') it.link.setAttribute('aria-current', 'location'); }
      else if (it.link.hasAttribute('aria-current')) it.link.removeAttribute('aria-current');
    });
    if (current && container.__navCurrent !== current) {
      container.__navCurrent = current;
      keepInView(container, current);
    }
  }

  function keepInView(container, link) {
    var box = container;
    while (box && box !== document.body) {
      var oy = getComputedStyle(box).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    if (!box || box === document.body || !box.contains(link)) return;
    var b = box.getBoundingClientRect();
    var l = link.getBoundingClientRect();
    if (l.top < b.top) box.scrollTop -= (b.top - l.top) + 8;
    else if (l.bottom > b.bottom) box.scrollTop += (l.bottom - b.bottom) + 8;
  }

  var spyQueued = false;
  function spyAll() {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(function () {
      spyQueued = false;
      document.querySelectorAll('.scrollspy, .contents').forEach(spy);
    });
  }

  window.addEventListener('scroll', spyAll, { passive: true, capture: true });
  window.addEventListener('resize', spyAll, { passive: true });

  var buildTimer = 0;
  function scheduleBuild() {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(function () { buildAll(); spyAll(); }, 150);
  }

  function boot() {
    buildAll();
    spyAll();
    if (typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (muts) {
      if (muts.length) scheduleBuild();
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['id', 'data-anchor-slug', 'data-contents', 'data-contents-levels',
        'data-contents-scope', 'data-contents-label', 'data-contents-skip', 'hidden', 'href', 'data-link-href', 'data-lang'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', function () { buildAll(); spyAll(); });

  window.SiteNav = {
    resolve: resolve,
    jump: jump,
    go: go,
    highlight: highlight,
    clearHighlight: clearHighlight,
    cover: topCover,
    refresh: function () { buildAll(); spyAll(); },
  };
})();
