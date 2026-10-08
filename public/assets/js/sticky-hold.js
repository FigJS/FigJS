(function () {
  'use strict';

  var held = new WeakMap();

  function save(el) {
    return {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      right: el.style.right,
      bottom: el.style.bottom,
      width: el.style.width,
      height: el.style.height,
    };
  }

  function restore(el, s) {
    el.style.position = s.position;
    el.style.top = s.top;
    el.style.left = s.left;
    el.style.right = s.right;
    el.style.bottom = s.bottom;
    el.style.width = s.width;
    el.style.height = s.height;
  }

  function engage(el) {
    if (held.has(el)) return;
    var r = el.getBoundingClientRect();

    var z = el.currentCSSZoom || 1;
    held.set(el, save(el));
    el.style.position = 'fixed';
    el.style.top = (r.top / z) + 'px';
    el.style.left = (r.left / z) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = (r.width / z) + 'px';
    el.style.height = (r.height / z) + 'px';
    el.setAttribute('data-sticky-held', '');
  }

  function disengage(el) {
    var s = held.get(el);
    if (!s) return;
    restore(el, s);
    held.delete(el);
    el.removeAttribute('data-sticky-held');
  }

  function update(el) {
    var parent = el.parentElement;
    if (!parent) return;
    var pr = parent.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    var isHeld = held.has(el);

    if (!isHeld) {
      if (pr.bottom <= er.bottom + 1 && pr.bottom > 0) {
        engage(el);
      }
    } else {
      if (pr.bottom > er.bottom + 1) {
        disengage(el);
      }
    }
  }

  function updateAll() {
    var els = document.querySelectorAll('[data-sticky-hold]');
    for (var i = 0; i < els.length; i++) update(els[i]);
  }

  var root = document.documentElement;
  var CENTER = '.sticky-top[data-stick-side="center"], ' +
    '[data-stick-to="center"] > :is(.sticky-window-stage, .sticky-range-inner, .sticky-scroll-stage)';
  var watched = new WeakSet();
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { scheduleCenter(); }) : null;

  function scrollportHeight(el) {
    for (var p = el.parentElement; p && p !== document.body && p !== root; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.overflowY !== 'visible' && cs.overflowY !== 'clip') {
        return p.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      }
    }
    var w = el.offsetWidth;
    var r = el.getBoundingClientRect();
    return window.innerHeight / (w && r.width ? r.width / w : 1);
  }

  function centerAll() {
    var els = document.querySelectorAll(CENTER);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var v = Math.max(0, (scrollportHeight(el) - el.offsetHeight) / 2).toFixed(1) + 'px';
      if (el.style.getPropertyValue('--stick-center') !== v) el.style.setProperty('--stick-center', v);
      if (ro && !watched.has(el)) { watched.add(el); ro.observe(el); }
    }
  }

  var centerQueued = false;
  function scheduleCenter() {
    if (centerQueued) return;
    centerQueued = true;
    requestAnimationFrame(function () { centerQueued = false; centerAll(); });
  }

  function refresh() {
    centerAll();
    updateAll();
  }

  window.addEventListener('scroll', updateAll, { passive: true });
  window.addEventListener('resize', refresh);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  window.addEventListener('load', refresh);

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(scheduleCenter).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['data-stick-side', 'data-stick-to', 'class'],
    });
  }

  window.StickyHold = { refresh: refresh };
})();
