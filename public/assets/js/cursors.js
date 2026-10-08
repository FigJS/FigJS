(function () {
  'use strict';

  if (window.SiteCursors) return;

  var root = document.documentElement;
  var NOT_TEXT = 'a[href], button, select, option, summary, label, input, textarea, [contenteditable], ' +
    '[role="button"], [role="link"], [role="tab"], [draggable="true"]';

  function editing() { return root.classList.contains('in-editor'); }
  function prop(cs, name) { return cs.getPropertyValue(name).trim(); }


  var marked = null;

  function mark(el, kind) {
    if (marked === el && el.getAttribute('data-cursor-live') === kind) return;
    unmark();
    el.setAttribute('data-cursor-live', kind);
    marked = el;
  }

  function unmark() {
    if (!marked) return;
    marked.removeAttribute('data-cursor-live');
    marked = null;
  }


  function textable(el) {
    if (el.closest(NOT_TEXT)) return false;
    var cs = getComputedStyle(el);
    if (!prop(cs, '--cursor-text') && !prop(cs, '--cursor-default')) return false;
    if (cs.userSelect === 'none' || cs.webkitUserSelect === 'none') return false;
    var own = cs.cursor;
    var origin = el;
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (getComputedStyle(p).cursor !== own) break;
      origin = p;
    }
    if (origin === document.body || origin === root) return true;
    var up = origin.parentElement;
    return !!up && prop(getComputedStyle(origin), '--cursor-text') !== prop(getComputedStyle(up), '--cursor-text');
  }

  function textNodeAt(x, y) {
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      return pos && pos.offsetNode;
    }
    if (document.caretRangeFromPoint) {
      var range = document.caretRangeFromPoint(x, y);
      return range && range.startContainer;
    }
    return null;
  }

  function overText(el, x, y) {
    var node = textNodeAt(x, y);
    if (!node || node.nodeType !== 3 || node.parentNode !== el || !/\S/.test(node.data)) return false;
    var range = document.createRange();
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  var target = null;
  var current = null;
  var currentText = false;
  var px = 0;
  var py = 0;
  var buttons = 0;
  var frame = 0;
  var pressed = false;

  function update() {
    frame = 0;
    if (pressed || editing()) return;
    var el = target;
    if (!el || el.nodeType !== 1 || !el.isConnected) { unmark(); current = null; return; }
    if ((buttons & 1) && marked && marked.getAttribute('data-cursor-live') === 'text') return;
    if (el !== current) {
      unmark();
      current = el;
      currentText = textable(el);
    }
    if (currentText && overText(el, px, py)) mark(el, 'text');
    else if (marked === el) unmark();
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    target = e.target;
    px = e.clientX;
    py = e.clientY;
    buttons = e.buttons;
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });

  root.addEventListener('mouseleave', function () {
    target = current = null;
    unmark();
  });


  var POINTER = /(^|,\s*)pointer$/;

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.button !== 0 || editing()) return;
    var el = e.target && e.target.nodeType === 1 ? e.target : null;
    if (!el) return;
    var cs = getComputedStyle(el);
    if (!prop(cs, '--cursor-pressed') || !POINTER.test(cs.cursor)) return;
    mark(el, 'pressed');
    pressed = true;
  }, true);

  function release() {
    if (!pressed) return;
    pressed = false;
    unmark();
    current = null;
  }
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);


  var styled = [];

  function applyImages() {
    styled = styled.filter(function (el) {
      if (el.isConnected && el.hasAttribute('data-cursor-url')) return true;
      el.style.cursor = '';
      return false;
    });
    document.querySelectorAll('[data-cursor-url]').forEach(function (el) {
      var url = (el.getAttribute('data-cursor-url') || '').trim();
      var hot = (el.getAttribute('data-cursor-hotspot') || '0 0').trim();
      var want = url ? 'url("' + url.replace(/"/g, '%22') + '") ' + hot + ', auto' : '';
      if (el.style.cursor !== want) el.style.cursor = want;
      if (styled.indexOf(el) < 0) styled.push(el);
    });
  }

  function boot() {
    applyImages();
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    new MutationObserver(applyImages).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-cursor-url', 'data-cursor-hotspot'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteCursors = { refresh: function () { current = null; applyImages(); } };
})();
