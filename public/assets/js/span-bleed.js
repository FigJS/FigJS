(function () {
  'use strict';

  if (window.SpanBleed) return;

  var CLS = 'span-bleed';
  var ACTIVE = 'span-bleed--active';
  var VARS = ['--sb-w', '--sb-m', '--sb-pl', '--sb-pr'];
  var STILL = ['transform', 'translate', 'scale', 'rotate'];
  var els = new Set();
  var frame = 0;
  var watched = new WeakSet();
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;

  function viewport() {
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;right:0;top:0;height:0;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;';
    document.documentElement.appendChild(probe);
    var r = probe.getBoundingClientRect();
    probe.remove();
    return { left: r.left, right: r.right };
  }

  function clear(el) {
    el.classList.remove(ACTIVE);
    VARS.forEach(function (v) { el.style.removeProperty(v); });
  }

  function hold(el) {
    var saved = STILL.map(function (p) {
      var v = [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)];
      el.style.setProperty(p, 'none', 'important');
      return v;
    });
    return function () {
      saved.forEach(function (s) {
        if (s[1]) el.style.setProperty(s[0], s[1], s[2]);
        else el.style.removeProperty(s[0]);
      });
    };
  }

  function px(n) { return n.toFixed(3) + 'px'; }

  function toDeg(v) {
    var n = parseFloat(v) || 0;
    if (/rad$/.test(v) && !/grad$/.test(v)) return n * 180 / Math.PI;
    if (/grad$/.test(v)) return n * 0.9;
    if (/turn$/.test(v)) return n * 360;
    return n;
  }

  function len(v, size) {
    if (!v) return 0;
    return /%$/.test(v) ? parseFloat(v) * size / 100 : parseFloat(v) || 0;
  }

  function ownTransform(el, w) {
    if (typeof DOMMatrix === 'undefined') return null;
    var cs = getComputedStyle(el);
    var h = el.offsetHeight;
    var m = new DOMMatrix();
    try {
      var t = cs.translate || 'none';
      if (t !== 'none') { var tp = t.split(/\s+/); m = m.translate(len(tp[0], w), len(tp[1], h)); }
      var rot = cs.rotate || 'none';
      if (rot !== 'none') {
        var parts = rot.split(/\s+/);
        var axis = parts.slice(0, -1).join(' ');
        if (axis && !/^(z|0 0 1)$/.test(axis)) return null;
        m = m.rotate(toDeg(parts[parts.length - 1]));
      }
      var s = cs.scale || 'none';
      if (s !== 'none') { var sp = s.split(/\s+/).map(parseFloat); m = m.scale(sp[0], sp.length > 1 ? sp[1] : sp[0]); }
      if (cs.transform && cs.transform !== 'none') m = m.multiply(new DOMMatrix(cs.transform));
    } catch (e) { return null; }
    if (m.isIdentity || !m.is2D) return null;
    var o = (cs.transformOrigin || '').split(/\s+/).map(parseFloat);
    return { a: m.a, c: m.c, e: m.e, h: h, fx: w ? (o[0] || 0) / w : 0.5, fy: h ? (o[1] || 0) / h : 0.5 };
  }

  var SPARE = 1;
  function cover(t, side, vl, vr, w) {
    if (!t || t.a < 0.1) return { left: vl, width: vr - vl };
    var top = -t.c * t.fy * t.h;
    var bottom = t.c * (1 - t.fy) * t.h;
    var hi = Math.max(top, bottom);
    var lo = Math.min(top, bottom);
    var g = t.fx * (1 - t.a);
    var L;
    var W;
    if (side === 'left') {
      L = (vl - SPARE - g * w - t.e - hi) / (1 - g);
      return { left: L, width: w - L };
    }
    if (side === 'right') {
      W = (vr + SPARE - t.e - lo) / (g + t.a);
      return { left: 0, width: W };
    }
    W = (vr - vl + 2 * SPARE + hi - lo) / t.a;
    L = vl - SPARE - g * W - t.e - hi;
    return { left: L, width: W };
  }

  function apply(el) {
    clear(el);
    var w = el.offsetWidth;
    if (!w) return;
    var tilt = ownTransform(el, w);
    var release = hold(el);
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var k = r.width / w || 1;
    var vp = viewport();
    var side = el.getAttribute('data-bleed-side') || '';
    var vl = side === 'right' ? 0 : (vp.left - r.left) / k;
    var vr = side === 'left' ? w : (vp.right - r.left) / k;
    var box = cover(tilt, side, vl, vr, w);
    var shift = (parseFloat(cs.marginLeft) || 0) + box.left;
    var column = el.getAttribute('data-bleed-content') === 'column';
    var pl = (parseFloat(cs.paddingLeft) || 0) - box.left;
    var pr = (parseFloat(cs.paddingRight) || 0) + box.left + box.width - w;
    release();
    el.style.setProperty('--sb-w', px(box.width));
    el.style.setProperty('--sb-m', px(shift));
    if (column) {
      el.style.setProperty('--sb-pl', px(pl));
      el.style.setProperty('--sb-pr', px(pr));
    }
    el.classList.add(ACTIVE);
  }

  function watch(node) {
    if (!ro || !node || watched.has(node)) return;
    watched.add(node);
    ro.observe(node);
  }

  function intact(el) {
    return el.classList.contains(ACTIVE) && !!el.style.getPropertyValue('--sb-w');
  }

  function forget(el) {
    els.delete(el);
    clear(el);
  }

  function run() {
    frame = 0;
    var list = Array.from(els).filter(function (el) {
      if (el.isConnected && el.classList.contains(CLS)) return true;
      forget(el);
      return false;
    });
    list.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    list.forEach(apply);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(run);
  }

  function track(el) {
    if (els.has(el)) { schedule(); return; }
    els.add(el);
    watch(el);
    watch(el.parentElement);
    schedule();
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.classList.contains(CLS)) track(node);
    node.querySelectorAll('.' + CLS).forEach(track);
  }

  function observe() {
    new MutationObserver(function (muts) {
      var lost = [];
      muts.forEach(function (m) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(scan);
          return;
        }
        var el = m.target;
        var has = el.classList.contains(CLS);
        if (has && !els.has(el)) track(el);
        else if (!has && els.has(el)) forget(el);
        else if (has && m.attributeName !== 'class') schedule();
        else if (has && !intact(el) && !frame && lost.indexOf(el) < 0) lost.push(el);
      });
      lost.forEach(apply);
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-bleed-side', 'data-bleed-content'],
    });
    new MutationObserver(function () { if (els.size) schedule(); }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  function boot() {
    scan(document.body);
    observe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  var lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    schedule();
  });

  window.SpanBleed = {
    refresh: function () { scan(document.body); schedule(); }
  };
})();
