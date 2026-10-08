(function () {
  'use strict';

  if (window.ZoomBox) return;

  var root = document.documentElement;
  var states = new WeakMap();
  var zoomed = new Set();

  function editing() { return root.classList.contains('in-editor'); }

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isFinite(v) && v > 0 ? v : fallback;
  }

  function maxOf(box) { return Math.max(1, num(box, 'data-zoom-max', 4)); }

  function state(box) {
    var st = states.get(box);
    if (!st) {
      st = { s: 1, x: 0, y: 0, pointers: new Map(), pan: null, pinch: null, moved: false, idle: 0 };
      states.set(box, st);
    }
    return st;
  }

  function boxOf(node) {
    var box = node && node.closest ? node.closest('.zoom-box') : null;
    return box && !editing() ? box : null;
  }

  function ratio(box) {
    var w = box.offsetWidth;
    return w ? box.getBoundingClientRect().width / w || 1 : 1;
  }

  function point(box, x, y) {
    var r = box.getBoundingClientRect();
    var k = ratio(box);
    return { x: (x - r.left) / k - box.clientLeft, y: (y - r.top) / k - box.clientTop };
  }

  function parts(box) {
    return Array.prototype.filter.call(box.children, function (c) {
      return !c.classList.contains('zoom-box-ui');
    });
  }

  function clamp(box, st) {
    var w = box.clientWidth;
    var h = box.clientHeight;
    st.s = Math.max(1, Math.min(maxOf(box), st.s));
    st.x = Math.min(0, Math.max(w - w * st.s, st.x));
    st.y = Math.min(0, Math.max(h - h * st.s, st.y));
  }

  function hires(box, st) {
    if (st.s <= 1) return;
    box.querySelectorAll('img[data-full-src]').forEach(function (img) {
      if (img.__zbFull) return;
      var full = img.getAttribute('data-full-src');
      if (!full || full === img.getAttribute('src')) return;
      var need = img.getBoundingClientRect().width * (window.devicePixelRatio || 1);
      if (img.naturalWidth && need <= img.naturalWidth * 1.1) return;
      img.__zbFull = true;
      var pre = new Image();
      pre.onload = function () {
        img.removeAttribute('srcset');
        img.src = full;
      };
      pre.src = full;
    });
  }

  function render(box) {
    var st = state(box);
    var on = st.s > 1.001;
    box.classList.toggle('is-zoomed', on);
    if (on) zoomed.add(box); else zoomed.delete(box);
    parts(box).forEach(function (c) {
      if (!on) {
        c.style.removeProperty('translate');
        c.style.removeProperty('scale');
        c.style.removeProperty('transform-origin');
        return;
      }
      c.style.setProperty('transform-origin', (-c.offsetLeft) + 'px ' + (-c.offsetTop) + 'px', 'important');
      c.style.setProperty('translate', st.x.toFixed(2) + 'px ' + st.y.toFixed(2) + 'px', 'important');
      c.style.setProperty('scale', st.s.toFixed(4), 'important');
    });
    hires(box, st);
    var label = box.querySelector(':scope > .zoom-box-ui .zoom-box-level');
    if (label) label.textContent = Math.round(st.s * 100) + '%';
  }

  function moving(box, eased) {
    var st = state(box);
    box.classList.add('is-moving');
    box.classList.toggle('is-easing', !!eased);
    clearTimeout(st.idle);
    st.idle = setTimeout(function () { box.classList.remove('is-moving', 'is-easing'); }, eased ? 320 : 180);
  }

  function zoomTo(box, s, px, py, eased) {
    var st = state(box);
    var s0 = st.s;
    var s1 = Math.max(1, Math.min(maxOf(box), s));
    if (Math.abs(s1 - s0) < 1e-4) return false;
    if (px == null) { px = box.clientWidth / 2; py = box.clientHeight / 2; }
    st.x = px - (px - st.x) * (s1 / s0);
    st.y = py - (py - st.y) * (s1 / s0);
    st.s = s1;
    clamp(box, st);
    moving(box, eased);
    render(box);
    return true;
  }

  function reset(box, instant) {
    if (!box) return;
    var st = state(box);
    st.s = 1; st.x = 0; st.y = 0;
    st.pan = null; st.pinch = null;
    st.pointers.clear();
    if (!instant) moving(box, true);
    render(box);
  }

  var hintTimer = 0;
  function hint(box) {
    if (box.querySelector(':scope > .zoom-box-hint')) return;
    var tip = document.createElement('div');
    tip.className = 'zoom-box-ui zoom-box-hint';
    tip.textContent = (/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' + scroll to zoom';
    box.appendChild(tip);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { tip.remove(); }, 1200);
  }

  document.addEventListener('wheel', function (e) {
    var box = boxOf(e.target);
    if (!box || e.defaultPrevented) return;
    var mode = box.getAttribute('data-zoom-wheel') || '';
    if (mode === 'off') return;
    var st = state(box);
    if (mode === 'ctrl' && !e.ctrlKey && !e.metaKey) {
      if (st.s <= 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) hint(box);
      return;
    }
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (!dy || (dy > 0 && st.s <= 1)) return;
    e.preventDefault();
    var p = point(box, e.clientX, e.clientY);
    zoomTo(box, st.s * Math.exp(-dy * 0.002 * num(box, 'data-zoom-speed', 1)), p.x, p.y);
  }, { passive: false });

  document.addEventListener('pointerdown', function (e) {
    var box = boxOf(e.target);
    if (!box || e.target.closest('.zoom-box-ui')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var st = state(box);
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.moved = false;
    if (st.pointers.size === 2) {
      var pts = Array.from(st.pointers.values());
      var mid = point(box, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      st.pan = null;
      st.pinch = {
        d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        s: st.s,
        cx: (mid.x - st.x) / st.s,
        cy: (mid.y - st.y) / st.s,
      };
      e.preventDefault();
    } else if (st.pointers.size === 1 && st.s > 1) {
      st.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: st.x, oy: st.y };
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }
  });

  document.addEventListener('pointermove', function (e) {
    var box = boxOf(e.target);
    if (!box) return;
    var st = state(box);
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pinch && st.pointers.size >= 2) {
      var pts = Array.from(st.pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      var mid = point(box, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      st.s = Math.max(1, Math.min(maxOf(box), st.pinch.s * d / st.pinch.d));
      st.x = mid.x - st.pinch.cx * st.s;
      st.y = mid.y - st.pinch.cy * st.s;
      st.moved = true;
      clamp(box, st);
      moving(box);
      render(box);
    } else if (st.pan && st.pan.id === e.pointerId) {
      var k = ratio(box);
      var dx = (e.clientX - st.pan.x) / k;
      var dy = (e.clientY - st.pan.y) / k;
      if (Math.abs(dx) + Math.abs(dy) > 3) st.moved = true;
      st.x = st.pan.ox + dx;
      st.y = st.pan.oy + dy;
      clamp(box, st);
      moving(box);
      render(box);
    }
  });

  function release(e) {
    var box = boxOf(e.target);
    if (!box) return;
    var st = state(box);
    if (!st.pointers.delete(e.pointerId)) return;
    if (st.pointers.size < 2) st.pinch = null;
    if (st.pan && st.pan.id === e.pointerId) st.pan = null;
    if (st.pointers.size === 1 && st.s > 1) {
      var id = st.pointers.keys().next().value;
      var p = st.pointers.get(id);
      st.pan = { id: id, x: p.x, y: p.y, ox: st.x, oy: st.y };
    }
    if (st.moved) box.__zbSwallow = Date.now();
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  window.addEventListener('click', function (e) {
    var box = boxOf(e.target);
    if (box && box.__zbSwallow && Date.now() - box.__zbSwallow < 400) {
      box.__zbSwallow = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('dblclick', function (e) {
    var box = boxOf(e.target);
    if (!box || e.target.closest('.zoom-box-ui') || box.getAttribute('data-zoom-double') === 'off') return;
    e.preventDefault();
    var st = state(box);
    if (st.s > 1.01) { reset(box); return; }
    var p = point(box, e.clientX, e.clientY);
    zoomTo(box, Math.min(maxOf(box), num(box, 'data-zoom-step', 2.5)), p.x, p.y, true);
  });

  document.addEventListener('pointerleave', function (e) {
    if (e.pointerType !== 'mouse' || !e.target.classList || !e.target.classList.contains('zoom-box')) return;
    var box = boxOf(e.target);
    if (box && box.getAttribute('data-zoom-leave') === 'reset' && !state(box).pointers.size) reset(box);
  }, true);

  document.addEventListener('keydown', function (e) {
    var box = boxOf(document.activeElement);
    if (!box || e.ctrlKey || e.metaKey || e.altKey) return;
    var st = state(box);
    var step = 40;
    if (e.key === '+' || e.key === '=') zoomTo(box, st.s * 1.25, null, null, true);
    else if (e.key === '-' || e.key === '_') zoomTo(box, st.s / 1.25, null, null, true);
    else if (e.key === '0') reset(box);
    else if (st.s > 1 && /^Arrow/.test(e.key)) {
      if (e.key === 'ArrowLeft') st.x += step;
      if (e.key === 'ArrowRight') st.x -= step;
      if (e.key === 'ArrowUp') st.y += step;
      if (e.key === 'ArrowDown') st.y -= step;
      clamp(box, st);
      moving(box, true);
      render(box);
    } else return;
    e.preventDefault();
  });

  document.addEventListener('dragstart', function (e) {
    if (boxOf(e.target)) e.preventDefault();
  });

  function button(act, label, text) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'zoom-box-btn';
    b.setAttribute('data-zoom-act', act);
    b.setAttribute('aria-label', label);
    b.textContent = text;
    return b;
  }

  function controls(box) {
    if (box.getAttribute('data-zoom-controls') !== 'on' || box.querySelector(':scope > .zoom-box-ui.zoom-box-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'zoom-box-ui zoom-box-bar';
    var level = document.createElement('span');
    level.className = 'zoom-box-level';
    level.textContent = '100%';
    bar.append(button('out', 'Zoom out', '−'), level, button('in', 'Zoom in', '+'), button('reset', 'Reset zoom', '↺'));
    box.appendChild(bar);
    if (!box.hasAttribute('tabindex')) box.tabIndex = 0;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.zoom-box-btn');
    var box = btn && boxOf(btn);
    if (!box) return;
    var st = state(box);
    var act = btn.getAttribute('data-zoom-act');
    if (act === 'in') zoomTo(box, st.s * 1.5, null, null, true);
    else if (act === 'out') zoomTo(box, st.s / 1.5, null, null, true);
    else reset(box);
  });

  function scan(scope) {
    if (editing()) return;
    (scope || document).querySelectorAll('.zoom-box[data-zoom-controls="on"]').forEach(controls);
  }

  window.addEventListener('resize', function () {
    zoomed.forEach(function (box) {
      if (!box.isConnected) { zoomed.delete(box); return; }
      clamp(box, state(box));
      render(box);
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); });
  else scan();

  window.ZoomBox = {
    scan: scan,
    controls: controls,
    reset: reset,
    zoomTo: zoomTo,
    level: function (box) { return state(box).s; },
  };
})();
