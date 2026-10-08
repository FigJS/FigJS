(function () {
  const isEditor = !!window.__IS_EDITOR_CANVAS;

  function clampLayer(v) { return Math.max(-128, Math.min(128, v)); }

  let zGiven = new Set();

  function applyLayers() {
    const now = new Set();
    document.querySelectorAll('[data-layer]').forEach((el) => {
      const raw = el.getAttribute('data-layer');
      const v = parseInt(raw, 10);
      if (Number.isNaN(v)) return;
      const z = clampLayer(v);
      el.style.zIndex = z === 0 ? 'auto' : String(z);
      now.add(el);
    });
    zGiven.forEach((el) => { if (!now.has(el)) el.style.zIndex = ''; });
    zGiven = now;
  }

  function applyI18n() {
    if (isEditor) return;

    const lang = (document.body && document.body.getAttribute('data-lang'))
      || 'en';

    const attrName = 'data-i18n-' + lang;

    document.querySelectorAll('[data-i18n-' + lang + ']').forEach((el) => {
      if (el.__i18nOriginal == null) {
        el.__i18nOriginal = el.textContent;
      }
      const wanted = el.getAttribute(attrName);
      if (wanted != null && wanted !== '') {
        if (el.textContent !== wanted) el.textContent = wanted;
      } else {
        if (el.textContent !== el.__i18nOriginal) {
          el.textContent = el.__i18nOriginal;
        }
      }
    });

    document.querySelectorAll('[data-i18n-original-cached]').forEach((el) => {
      if (!el.hasAttribute(attrName)) {
        if (el.__i18nOriginal != null && el.textContent !== el.__i18nOriginal) {
          el.textContent = el.__i18nOriginal;
        }
      }
    });
  }

  const BLEND_MODES = new Set([
    'normal', 'multiply', 'screen', 'overlay',
    'darken', 'lighten', 'color-dodge', 'color-burn',
    'hard-light', 'soft-light', 'difference', 'exclusion',
    'hue', 'saturation', 'color', 'luminosity',
  ]);

  function applyBlendModes() {
    document.querySelectorAll(
      '[data-blend-mode], [data-blend-isolate], [data-blend-intensity]'
    ).forEach((el) => {
      const rawMode = (el.getAttribute('data-blend-mode') || '').trim();

      let intensity = parseFloat(el.getAttribute('data-blend-intensity'));
      if (isNaN(intensity)) intensity = 1;
      intensity = Math.max(0, Math.min(1, intensity));

      const blendActive =
        intensity > 0 && rawMode && rawMode !== 'normal' && BLEND_MODES.has(rawMode);

      if (blendActive) {
        el.style.mixBlendMode = rawMode;
        el.__blendApplied = true;

        if (intensity < 1) {
          el.style.opacity = String(intensity);
          el.__blendOpacityApplied = true;
        } else if (el.__blendOpacityApplied) {
          el.style.opacity = '';
          el.__blendOpacityApplied = false;
        }
      } else {
        if (el.__blendApplied) {
          el.style.mixBlendMode = '';
          el.__blendApplied = false;
        }
        if (el.__blendOpacityApplied) {
          el.style.opacity = '';
          el.__blendOpacityApplied = false;
        }
      }

      const isolate = truthy(el.getAttribute('data-blend-isolate'));
      if (isolate) {
        el.style.isolation = 'isolate';
        el.__blendIsolated = true;
      } else if (el.__blendIsolated) {
        el.style.isolation = '';
        el.__blendIsolated = false;
      }
    });
  }

  function tooltipTextFor(el) {
    const lang = (document.body && document.body.getAttribute('data-lang')) || 'en';
    const localized = el.getAttribute('data-tooltip-text-' + lang);
    return localized != null && localized !== '' ? localized : el.getAttribute('data-tooltip-text');
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tooltip-text]');
    if (!el || !window.SiteTooltip || window.SiteTooltip.anchor() === el) return;
    const text = tooltipTextFor(el);
    if (!text) return;
    window.SiteTooltip.show(el, text, {
      pos: el.getAttribute('data-tooltip-pos') || 'top',
      markdown: true,
      pinnable: truthy(el.getAttribute('data-tooltip-pin')),
    });
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-tooltip-text][data-tooltip-pin]');
    if (el && window.SiteTooltip) window.SiteTooltip.pin(el);
  }, true);

  function truthy(v) {
    if (v === true) return true;
    if (v == null || v === '') return false;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;

    if (s === 'data-link-newtab' || s === 'data-reveal-once') return true;
    return false;
  }

const boundLinks = new Set();
const APP_LINK = /^(?!https?:)[a-z][a-z0-9+.-]*:/i;

function unbindLink(el) {
  if (el.__linkHandler) {
    el.removeEventListener('click', el.__linkHandler);
    el.__linkHandler = null;
  }

  if (el.__linkHadCursor) {
    el.style.cursor = '';
    el.__linkHadCursor = false;
  }
  boundLinks.delete(el);
}

function bindLinks() {
  boundLinks.forEach((el) => {
    const href = (el.getAttribute('data-link-href') || '').trim();
    if (!el.isConnected || !href) unbindLink(el);
  });

  document.querySelectorAll('[data-link-href]').forEach((el) => {
    const href = (el.getAttribute('data-link-href') || '').trim();
    if (!href || boundLinks.has(el)) return;

    if (el.tagName !== 'A' && el.tagName !== 'BUTTON' && !el.style.cursor) {
      el.__linkHadCursor = true;
      el.style.cursor = 'var(--cursor-pointer, pointer)';
    }

    const handler = (e) => {
      const h = (el.getAttribute('data-link-href') || '').trim();
      if (!h) return;
      const inner = e.target && e.target.closest && e.target.closest('a[href]');
      if (inner && inner !== el && el.contains(inner)) return;
      const sp = e.target && e.target.closest && e.target.closest('.subpage');
      if (sp && sp !== el && el.contains(sp)) return;
      if (isEditor) { e.preventDefault(); return; }
      if (h.startsWith('#')) return;
      e.preventDefault();

      if (truthy(el.getAttribute('data-link-newtab')) && !APP_LINK.test(h)) {
        const a = document.createElement('a');
        a.href = h;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.location.href = h;
      }
    };

    el.__linkHandler = handler;
    el.addEventListener('click', handler);
    boundLinks.add(el);
  });
}

  function runAll() {
    applyLayers();
    applyBlendModes();
    applyI18n();
    bindLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runAll);
  else runAll();

  const WATCHED_PREFIXES = [
    'data-layer', 'data-blend-',
    'data-link-', 'data-lang-', 'data-i18n-',
  ];
  const layered = (n) => n.nodeType === 1 && (n.hasAttribute('data-layer') || !!n.querySelector('[data-layer]'));
  const mo = new MutationObserver((mutations) => {
    let dirty = false;
    let added = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        if (!added && Array.prototype.some.call(m.addedNodes, layered)) added = true;
        continue;
      }
      const n = m.attributeName || '';
      if (WATCHED_PREFIXES.some((p) => n === p || n.startsWith(p))) {
        dirty = true; break;
      }
    }
    if (dirty) runAll();
    else if (added) applyLayers();
  });
  mo.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
})();

(function () {
  'use strict';

  if (window.SiteText) return;

  var DELIMS = [
    { d: '**', tag: 'strong' },
    { d: '___', tag: 'u' },
    { d: '__', tag: 'em' },
    { d: '||', tag: 'spoiler' },
    { d: '==', tag: 'mark' },
    { d: '--', tag: 's' },
    { d: '*', tag: 'em' },
    { d: '~', tag: 'sub' },
    { d: '^', tag: 'sup' },
  ];
  var PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
  var BAD_URL = /^\s*(javascript|vbscript|data):/i;

  function isSpace(c) { return !c || /\s/.test(c); }

  function escaped(s, i) {
    var n = 0;
    while (i - 1 - n >= 0 && s.charAt(i - 1 - n) === '\\') n++;
    return n % 2 === 1;
  }

  function findClose(s, from, d) {
    var single = d.length === 1;
    var ch = d.charAt(0);
    var i = from;
    while ((i = s.indexOf(d, i)) !== -1) {
      var ok = !isSpace(s.charAt(i - 1)) && !escaped(s, i);
      if (ok && single && (s.charAt(i - 1) === ch || s.charAt(i + 1) === ch)) ok = false;
      if (ok && d === '--' && s.charAt(i + 2) === '-') ok = false;
      if (ok) return i;
      i += 1;
    }
    return -1;
  }

  function findChar(s, from, c) {
    var i = from;
    while ((i = s.indexOf(c, i)) !== -1) {
      if (!escaped(s, i)) return i;
      i += 1;
    }
    return -1;
  }

  function validColor(v) {
    if (!/^#?[\w(),.%\s-]+$/.test(v)) return false;
    try { return typeof CSS !== 'undefined' && CSS.supports ? CSS.supports('color', v) : /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(v); }
    catch (e) { return false; }
  }

  function parse(s, depth) {
    var out = [];
    var buf = '';
    var i = 0;
    function flush() { if (buf) { out.push(buf); buf = ''; } }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < s.length) {
        var n = s.charAt(i + 1);
        if (n === 'n') { flush(); out.push({ tag: 'br' }); i += 2; continue; }
        if (n === 's') { buf += ' '; i += 2; continue; }
        if (PUNCT.indexOf(n) !== -1) { buf += n; i += 2; continue; }
      }
      if (c === '`') {
        var e = s.indexOf('`', i + 1);
        if (e > i + 1) { flush(); out.push({ tag: 'code', children: [s.slice(i + 1, e)] }); i = e + 1; continue; }
      }
      if (c === '[' && depth < 8) {
        var rb = findChar(s, i + 1, ']');
        if (rb > i + 1) {
          var label = s.slice(i + 1, rb);
          var next = s.charAt(rb + 1);
          if (next === '(') {
            var rp = findChar(s, rb + 2, ')');
            var url = rp > -1 ? s.slice(rb + 2, rp).trim() : '';
            if (url && !/\s/.test(url) && !BAD_URL.test(url)) {
              flush();
              out.push({ tag: 'a', href: url, children: parse(label, depth + 1) });
              i = rp + 1;
              continue;
            }
          } else if (next === '{') {
            var rc = findChar(s, rb + 2, '}');
            var color = rc > -1 ? s.slice(rb + 2, rc).trim() : '';
            if (color && validColor(color)) {
              flush();
              out.push({ tag: 'color', color: color, children: parse(label, depth + 1) });
              i = rc + 1;
              continue;
            }
          }
        }
      }
      var matched = false;
      if (depth < 8) {
        for (var k = 0; k < DELIMS.length; k++) {
          var rule = DELIMS[k];
          var d = rule.d;
          if (s.substr(i, d.length) !== d) continue;
          var after = s.charAt(i + d.length);
          if (isSpace(after)) continue;
          if (d.length === 1 && after === d) continue;
          if (d === '--' && after === '-') continue;
          var close = findClose(s, i + d.length + 1, d);
          if (close === -1) continue;
          flush();
          out.push({ tag: rule.tag, children: parse(s.slice(i + d.length, close), depth + 1) });
          i = close + d.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      buf += c;
      i += 1;
    }
    flush();
    return out;
  }

  var SKIP = 'script, style, textarea, code, pre, kbd, samp, svg, math, noscript, template, select, option, ' +
    '.md-block, .text-format, .site-tooltip, .lang-switch';
  var MARK = /[*_[`=~^|\\-]/;
  var root = document.documentElement;

  function inEditor() { return root.classList.contains('in-editor'); }

  function enabledAt(el, cache) {
    if (cache && cache.has(el)) return cache.get(el);
    var holder = el.closest('[data-text-md="on"], [data-text-md="off"]');
    var on = !!holder && holder.getAttribute('data-text-md') === 'on';
    if (cache) cache.set(el, on);
    return on;
  }

  function build(nodes, into) {
    nodes.forEach(function (n) {
      if (typeof n === 'string') { into.appendChild(document.createTextNode(n)); return; }
      var el;
      if (n.tag === 'a') {
        el = document.createElement('a');
        el.setAttribute('href', n.href);
      } else if (n.tag === 'color') {
        el = document.createElement('span');
        el.style.color = n.color;
      } else if (n.tag === 'spoiler') {
        el = document.createElement('span');
        el.className = 'text-spoiler';
        el.setAttribute('tabindex', '0');
      } else {
        el = document.createElement(n.tag);
      }
      if (n.children) build(n.children, el);
      into.appendChild(el);
    });
  }

  function renderText(node, cache) {
    var text = node.data;
    if (!text || !MARK.test(text)) return;
    var parent = node.parentElement;
    if (!parent || parent.isContentEditable || parent.closest(SKIP) || !enabledAt(parent, cache)) return;
    var tree = parse(text, 0);
    if (tree.length === 1 && tree[0] === text) return;
    var wrap = document.createElement('span');
    wrap.className = 'text-format';
    build(tree, wrap);
    wrap.__textSource = node;
    parent.replaceChild(wrap, node);
  }

  function render(scope, cache) {
    if (!scope) return;
    if (scope.nodeType === 3) { renderText(scope, cache); return; }
    if (scope.nodeType !== 1 || (scope.closest && scope.closest('.text-format'))) return;
    var found = [];
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) { if (MARK.test(n.data)) found.push(n); }
    found.forEach(function (t) { renderText(t, cache); });
  }

  function restore(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var wraps = scope.classList && scope.classList.contains('text-format') ? [scope] : [];
    wraps = wraps.concat(Array.prototype.slice.call(scope.querySelectorAll('.text-format')));
    wraps.forEach(function (w) {
      if (w.__textSource && w.parentNode) w.parentNode.replaceChild(w.__textSource, w);
    });
  }

  var queue = [];
  var queued = false;
  function flush() {
    queued = false;
    var items = queue;
    queue = [];
    if (!document.querySelector('[data-text-md="on"]')) return;
    var cache = new Map();
    items.forEach(function (n) { if (n.isConnected) render(n, cache); });
  }
  function enqueue(n) {
    queue.push(n);
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }

  function inWrap(n) {
    var el = n.nodeType === 1 ? n : n.parentElement;
    return !!(el && el.closest('.text-format'));
  }

  function boot() {
    if (document.querySelector('[data-text-md="on"]')) render(document.body, new Map());
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') {
          restore(m.target);
          enqueue(m.target);
        } else if (m.type === 'characterData') {
          if (!inWrap(m.target)) enqueue(m.target);
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var a = m.addedNodes[j];
            if ((a.nodeType === 1 || a.nodeType === 3) && !a.__textSource && !inWrap(a)) enqueue(a);
          }
        }
      }
    }).observe(document.body, {
      childList: true, characterData: true, subtree: true,
      attributes: true, attributeFilter: ['data-text-md'],
    });
  }

  document.addEventListener('click', function (e) {
    if (inEditor()) return;
    var sp = e.target.closest && e.target.closest('.text-spoiler');
    if (!sp || sp.classList.contains('is-revealed')) return;
    e.preventDefault();
    e.stopPropagation();
    sp.classList.add('is-revealed');
  }, true);

  document.addEventListener('keydown', function (e) {
    if ((e.key !== 'Enter' && e.key !== ' ') || inEditor()) return;
    var sp = e.target.closest && e.target.closest('.text-spoiler');
    if (!sp || sp.classList.contains('is-revealed')) return;
    e.preventDefault();
    sp.classList.add('is-revealed');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteText = {
    parse: function (s) { return parse(String(s || ''), 0); },
    render: function (scope) { render(scope || document.body, new Map()); },
    restore: restore,
  };
})();

(function () {
  'use strict';

  if (window.SiteNear) return;

  var root = document.documentElement;
  var pointer = null;
  var finePointer = !!(window.matchMedia && window.matchMedia('(any-pointer: fine)').matches);
  var queued = false;

  function num(cs, name, fallback) {
    var v = parseFloat(cs.getPropertyValue(name));
    return isNaN(v) ? fallback : v;
  }

  function shape(t, curve) {
    if (curve === 'smooth') return t * t * (3 - 2 * t);
    if (curve === 'early') return 1 - Math.pow(1 - t, 3);
    if (curve === 'late') return t * t * t;
    return t;
  }

  function held() {
    return root.classList.contains('in-editor') && root.classList.contains('motion-paused');
  }

  function update() {
    queued = false;
    var els = document.querySelectorAll('.near-cursor');
    if (!els.length) return;
    var hold = held();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var n;
      if (hold) {
        n = 1;
      } else if (!pointer) {
        n = !finePointer && el.getAttribute('data-near-touch') !== 'far' ? 1 : 0;
      } else {
        var range = Math.max(1, num(getComputedStyle(el), '--near-range', 320));
        var r = el.getBoundingClientRect();
        var d;
        if (el.getAttribute('data-near-from') === 'center') {
          d = Math.hypot(pointer.x - (r.left + r.right) / 2, pointer.y - (r.top + r.bottom) / 2);
        } else {
          var dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
          var dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
          d = Math.hypot(dx, dy);
        }
        n = shape(Math.max(0, Math.min(1, 1 - d / range)), el.getAttribute('data-near-curve') || '');
      }
      var v = n.toFixed(3);
      if (el.style.getPropertyValue('--near') !== v) el.style.setProperty('--near', v);
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    pointer = { x: e.clientX, y: e.clientY };
    schedule();
  }, { passive: true });
  root.addEventListener('mouseleave', function () { pointer = null; schedule(); });
  window.addEventListener('blur', function () { pointer = null; schedule(); });
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(schedule).observe(root, {
      subtree: true, childList: true,
      attributes: true, attributeFilter: ['class', 'data-near-from', 'data-near-curve', 'data-near-touch'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  window.SiteNear = { refresh: schedule };
})();

(function () {
  'use strict';

  if (window.SiteScroll) return;

  var root = document.documentElement;
  var DEFAULT_GLIDE = 260;
  var BRISK = 50;
  var GAP = 160;
  var SHIFT = 400;
  var SETTLE = 0.05;
  var pos = 0;
  var pending = [];
  var softness = 0;
  var lastStep = 0;
  var running = false;
  var frame = 0;
  var lastTime = 0;
  var lastSet = null;
  var taking = false;
  var lastWheel = -Infinity;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function locked() {
    return root.classList.contains('in-editor') || root.classList.contains('subpage-lock');
  }

  function glideOf(el) {
    if (!el) return 0;
    var v = parseFloat(getComputedStyle(el).getPropertyValue('--scroll-glide'));
    return isNaN(v) || v <= 0 ? 0 : v;
  }

  function zoneOnScreen() {
    var zones = document.querySelectorAll('.smooth-zone');
    var vh = window.innerHeight;
    for (var i = 0; i < zones.length; i++) {
      var r = zones[i].getBoundingClientRect();
      if (!r.height) continue;
      var on = zones[i].getAttribute('data-zone-when') === 'center'
        ? r.top <= vh / 2 && r.bottom >= vh / 2
        : r.bottom > 0 && r.top < vh;
      if (on) return zones[i];
    }
    return null;
  }

  function glideHere() {
    var body = document.body;
    var zone = zoneOnScreen();
    if (zone) return glideOf(zone) || glideOf(body) || DEFAULT_GLIDE;
    if (body && body.getAttribute('data-smooth-scroll') === 'on') return glideOf(body) || DEFAULT_GLIDE;
    return BRISK;
  }

  function nestedScroller(el, dy) {
    for (var n = el && el.nodeType === 1 ? el : el && el.parentElement; n && n !== document.body && n !== root; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
        if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
      }
    }
    return false;
  }

  function maxScroll() {
    var se = document.scrollingElement || root;
    return Math.max(0, se.scrollHeight - se.clientHeight);
  }

  function stepped(e) {
    if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40) return true;
    var legacy = e.wheelDeltaY;
    return !!legacy && legacy % 120 === 0;
  }

  function takes(e, dy) {
    if (!e.cancelable || locked() || reducedMotion()) return false;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !stepped(e)) return false;
    return !nestedScroller(e.target, dy);
  }

  function left() {
    var sum = 0;
    for (var i = 0; i < pending.length; i++) sum += pending[i].left;
    return sum;
  }

  function add(d, glide) {
    var rest = left();
    if (rest && (rest > 0) !== (d > 0)) pending = [{ left: rest, glide: glide }];
    var last = pending[pending.length - 1];
    if (last && last.glide === glide) last.left += d;
    else pending.push({ left: d, glide: glide });
    if (pending.length > 6) pending.splice(0, 2, { left: pending[0].left + pending[1].left, glide: pending[1].glide });
  }

  function stop() {
    running = false;
    pending = [];
    lastSet = null;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }

  function step(now) {
    frame = 0;
    if (!running) return;
    if (locked()) { stop(); return; }
    var dt = lastTime ? Math.min(64, now - lastTime) : 16;
    lastTime = now;
    var y = window.scrollY;
    if (lastSet != null && Math.abs(y - lastSet) > 1) pos += y - lastSet;
    var rest = left();
    var end = Math.min(Math.max(pos + rest, 0), maxScroll());
    if (end !== pos + rest) pending = [{ left: end - pos, glide: pending.length ? pending[pending.length - 1].glide : BRISK }];
    var move = 0;
    for (var i = 0; i < pending.length; i++) {
      var m = pending[i].left * (1 - Math.exp(-dt / pending[i].glide));
      pending[i].left -= m;
      move += m;
    }
    var least = SETTLE * dt;
    if (Math.abs(move) < least) {
      rest = left() + move;
      move = Math.abs(rest) <= least ? rest : rest > 0 ? least : -least;
      pending = rest === move ? [] : [{ left: rest - move, glide: pending[pending.length - 1].glide }];
    }
    pos += move;
    window.scrollTo({ top: pos, behavior: 'instant' });
    lastSet = window.scrollY;
    if (!pending.length) { stop(); return; }
    frame = requestAnimationFrame(step);
  }

  function onWheel(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var now = performance.now();
    var dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (!running && now - lastWheel > GAP) taking = takes(e, dy);
    lastWheel = now;
    if (!taking || !e.cancelable || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (!running) {
      pos = window.scrollY;
      pending = [];
      softness = 0;
      lastTime = 0;
      lastSet = null;
      running = true;
    }
    var here = glideHere();
    softness = !softness ? here : softness + (here - softness) * (1 - Math.exp(-(now - lastStep) / SHIFT));
    if (Math.abs(softness - here) < 1) softness = here;
    lastStep = now;
    var end = pos + left();
    var d = Math.min(Math.max(end + dy, 0), maxScroll()) - end;
    if (d) add(d, Math.round(softness));
    if (!frame) frame = requestAnimationFrame(step);
  }

  var listening = false;
  function listen() {
    if (listening) return true;
    var body = document.body;
    if (!(body && body.getAttribute('data-smooth-scroll') === 'on') && !document.querySelector('.smooth-zone')) return false;
    listening = true;
    window.addEventListener('wheel', onWheel, { passive: false });
    return true;
  }
  if (!listen() && window.parent !== window && typeof MutationObserver !== 'undefined') {
    var watch = new MutationObserver(function () { if (listen()) watch.disconnect(); });
    watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-smooth-scroll'] });
  }

  ['keydown', 'mousedown', 'touchstart'].forEach(function (type) {
    window.addEventListener(type, function () { if (running) stop(); }, { passive: true });
  });

  window.SiteScroll = { stop: stop, refresh: listen };
})();

(function () {
  'use strict';

  if (window.SiteLinkTargets) return;

  var INLINE = '.text-format a[href], .md-block-render a[href]';

  function wantsNewTab(el) {
    var holder = el && el.closest ? el.closest('[data-link-newtab]:not([data-link-newtab=""])') : null;
    return !!holder && /^(true|1|yes|on)$/i.test(holder.getAttribute('data-link-newtab'));
  }

  function applyTo(a, on) {
    var href = (a.getAttribute('href') || '').trim();
    if (!href || href.charAt(0) === '#' || /^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(href)) return;
    if (on) {
      if (a.getAttribute('target') !== '_blank') {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.__newTabSet = true;
      }
    } else if (a.__newTabSet) {
      a.removeAttribute('target');
      a.removeAttribute('rel');
      a.__newTabSet = false;
    }
  }

  function apply(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll(INLINE).forEach(function (a) { applyTo(a, wantsNewTab(a)); });
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; apply(document); });
  }

  function boot() {
    apply(document);
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') { schedule(); return; }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1 && (n.matches(INLINE) || n.querySelector(INLINE) ||
              (n.classList && (n.classList.contains('text-format') || n.classList.contains('md-block-render'))))) {
            schedule();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-link-newtab'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteLinkTargets = { apply: apply, wantsNewTab: wantsNewTab, applyTo: applyTo };
})();

(function () {
  'use strict';

  if (window.SiteMail) return;

  var ua = navigator.userAgent || '';
  var touch = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var WAIT_MS = 1600;

  function editing() {
    return !!window.__IS_EDITOR_CANVAS || document.documentElement.classList.contains('in-editor');
  }

  function mode() {
    var v = document.body ? document.body.getAttribute('data-mail-fallback') : '';
    return v === 'ask' || v === 'off' ? v : 'gmail';
  }

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function parse(href) {
    var m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(href);
    if (!m) return null;
    var mail = { to: decode(m[1]), subject: '', body: '', cc: '', bcc: '' };
    (m[2] || '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      var key = pair.slice(0, i).toLowerCase();
      var value = decode(pair.slice(i + 1));
      if (key === 'to') mail.to = mail.to ? mail.to + ',' + value : value;
      else if (key in mail) mail[key] = value;
    });
    return mail.to || mail.subject || mail.body ? mail : null;
  }

  function query(pairs) {
    return pairs.filter(function (p) { return p[1]; })
      .map(function (p) { return p[0] + '=' + encodeURIComponent(p[1]); }).join('&');
  }

  var WEBMAIL = {
    gmail: function (m) {
      return 'https://mail.google.com/mail/?view=cm&fs=1&' +
        query([['to', m.to], ['su', m.subject], ['body', m.body], ['cc', m.cc], ['bcc', m.bcc]]);
    },
    outlook: function (m) {
      return 'https://outlook.live.com/mail/0/deeplink/compose?' +
        query([['to', m.to], ['subject', m.subject], ['body', m.body], ['cc', m.cc], ['bcc', m.bcc]]);
    },
  };

  function openTab(url) {
    var w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (e) {} }
    return !!w;
  }

  var panel = null;

  function close() {
    if (!panel) return;
    panel.remove();
    panel = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  }

  function onKey(e) { if (e.key === 'Escape') close(); }
  function onOutside(e) { if (panel && !panel.contains(e.target)) close(); }

  function ask(mail) {
    close();
    panel = document.createElement('div');
    panel.className = 'site-notice mail-ask';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Write the email with');
    var b = document.body;
    var own = b.hasAttribute('data-mail-ask-text') ? b.getAttribute('data-mail-ask-text').trim() : null;
    var message = (own === null ? 'No email app opened. Write to {address} with:' : own)
      .replace(/\{address\}/g, mail.to || 'this address');
    if (message) {
      var text = document.createElement('p');
      text.className = 'site-notice-text';
      text.textContent = message;
      panel.appendChild(text);
    }
    var actions = document.createElement('div');
    actions.className = 'site-notice-actions';
    var add = function (label, kind, run) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'site-notice-btn' + (kind ? ' is-' + kind : '');
      btn.textContent = label;
      btn.addEventListener('click', function () { run(btn); });
      actions.appendChild(btn);
    };
    add('Gmail', 'primary', function () { openTab(WEBMAIL.gmail(mail)); close(); });
    add('Outlook', '', function () { openTab(WEBMAIL.outlook(mail)); close(); });
    add('Copy address', '', function (btn) {
      var done = function () { btn.textContent = 'Copied'; setTimeout(close, 900); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mail.to).then(done, function () {});
    });
    add('Not now', 'quiet', close);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
  }

  function whenNothingOpens(run) {
    var happened = false;
    var mark = function () { happened = true; };
    window.addEventListener('blur', mark);
    document.addEventListener('visibilitychange', mark);
    window.addEventListener('pagehide', mark);
    setTimeout(function () {
      window.removeEventListener('blur', mark);
      document.removeEventListener('visibilitychange', mark);
      window.removeEventListener('pagehide', mark);
      if (!happened && document.visibilityState === 'visible' && document.hasFocus()) run();
    }, WAIT_MS);
  }

  document.addEventListener('click', function (e) {
    if (touch || editing() || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.SiteInApp && window.SiteInApp.app !== null) return;
    var link = e.target && e.target.closest && e.target.closest('a[href], [data-link-href]');
    if (!link || (panel && panel.contains(link))) return;
    var mail = parse((link.getAttribute('data-link-href') || link.getAttribute('href') || '').trim());
    var m = mode();
    if (!mail || m === 'off') return;
    whenNothingOpens(function () {
      if (m === 'ask') { ask(mail); return; }
      var url = WEBMAIL.gmail(mail);
      var active = navigator.userActivation ? navigator.userActivation.isActive : false;
      if (!(active && openTab(url))) location.href = url;
    });
  }, true);

  window.SiteMail = { parse: parse, webmail: WEBMAIL, ask: ask };
})();

(function () {
  'use strict';

  if (window.SitePageBackground) return;

  var root = document.documentElement;
  var queued = false;

  function check() {
    queued = false;
    var body = document.body;
    if (!body) return;
    var fixed = getComputedStyle(body).getPropertyValue('--page-bg-attachment').trim() === 'fixed';
    if (root.classList.contains('page-bg-fixed') !== fixed) root.classList.toggle('page-bg-fixed', fixed);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(check, 0);
  }

  function boot() {
    check();
    window.addEventListener('resize', schedule);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SitePageBackground = { refresh: check };
})();
