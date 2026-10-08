(function () {
  'use strict';

  if (window.SiteParallax) return;

  var root = document.documentElement;
  var DEPTH = 128;
  var units = [];
  var byEl = new Map();
  var offsets = new WeakMap();
  var anims = new WeakMap();
  var aim = { x: 0, y: 0 };
  var frame = 0;
  var refreshTimer = 0;
  var settleTimer = 0;
  var phoneQuery = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(seen, { rootMargin: '25% 0px' }) : null;
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null;
  var canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isFinite(v) ? v : fallback;
  }

  function layerOf(el) {
    var v = parseInt(el.getAttribute('data-layer'), 10);
    return isFinite(v) ? Math.max(-DEPTH, Math.min(DEPTH, v)) : 0;
  }

  function common(el, unit) {
    unit.el = el;
    unit.reach = Math.max(0, num(el, 'data-parallax-pointer', unit.kind === 'scene' ? 24 : 0));
    unit.ease = Math.max(0.01, Math.min(1, num(el, 'data-parallax-ease', 0.12)));
    unit.phoneStill = el.getAttribute('data-parallax-phone') === 'still';
    unit.near = true;
    unit.px = 0;
    unit.py = 0;
    unit.center = 0;
    unit.live = false;
    return unit;
  }

  function sceneUnit(scene) {
    var input = scene.getAttribute('data-parallax-input') || '';
    var unit = common(scene, { kind: 'scene' });
    unit.scroll = input !== 'pointer';
    if (input !== 'pointer' && input !== 'both') unit.reach = 0;
    unit.strength = Math.max(0, num(scene, 'data-parallax-scroll', 0.4));
    unit.cover = scene.getAttribute('data-parallax-cover') !== 'off';
    unit.targets = [];
    scene.querySelectorAll('.parallax-layer, [data-layer]').forEach(function (el) {
      if (el.closest('.parallax-scene') !== scene || el.classList.contains('parallax')) return;
      unit.targets.push({ el: el, depth: layerOf(el) / DEPTH, layer: el.classList.contains('parallax-layer') });
    });
    return unit;
  }

  function tagUnit(el) {
    var unit = common(el, { kind: 'tag' });
    unit.scroll = true;
    unit.strength = num(el, 'data-parallax-speed', -0.3);
    unit.axis = el.getAttribute('data-parallax-axis') === 'x' ? 'x' : 'y';
    unit.targets = [{ el: el, depth: 1 }];
    return unit;
  }

  function still() {
    return (motionQuery && motionQuery.matches) || root.classList.contains('motion-paused');
  }

  function put(el, x, y) {
    x = Math.round(x * 100) / 100;
    y = Math.round(y * 100) / 100;
    var was = offsets.get(el) || { x: 0, y: 0 };
    if (was.x === x && was.y === y) return;
    offsets.set(el, { x: x, y: y });
    var v = el.getAttribute('data-pin-sit') === 'edge'
      ? 'calc(var(--_pin-tx, 0px) + ' + x + 'px) calc(var(--_pin-ty, 0px) + ' + y + 'px)'
      : x + 'px ' + y + 'px';
    if (!canAnimate) {
      if (x || y) el.style.setProperty('translate', v);
      else el.style.removeProperty('translate');
      return;
    }
    var a = anims.get(el);
    if (!x && !y) {
      if (a) { a.cancel(); anims.delete(el); }
      return;
    }
    if (a && a.effect && a.effect.setKeyframes) {
      a.effect.setKeyframes({ translate: [v, v] });
      return;
    }
    a = el.animate({ translate: [v, v] }, { duration: 1000, fill: 'both' });
    a.pause();
    anims.set(el, a);
  }

  function unsettled(el) {
    for (var n = el.parentElement; n && n !== document.body && n !== root; n = n.parentElement) {
      if (anims.has(n) || offsets.has(n)) return true;
      var cs = getComputedStyle(n);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return true;
    }
    return false;
  }

  function measure() {
    var sy = window.scrollY;
    units.forEach(function (u) {
      u.live = unsettled(u.el);
      if (u.live) return;
      var r = u.el.getBoundingClientRect();
      var moved = u.kind === 'tag' && u.axis === 'y' ? (offsets.get(u.el) || { y: 0 }).y : 0;
      u.center = (r.top + r.bottom) / 2 - moved + sy;
    });
  }

  function sizeLayers() {
    var vh = window.innerHeight;
    units.forEach(function (u) {
      if (u.kind !== 'scene') return;
      var h = u.el.offsetHeight;
      u.targets.forEach(function (t) {
        if (!t.layer) return;
        var d = Math.abs(t.depth);
        var y = u.cover ? Math.ceil((u.scroll ? u.strength * d * (vh + h) / 2 : 0) + u.reach * d) : 0;
        var x = u.cover ? Math.ceil(u.reach * d) : 0;
        var el = t.el;
        if (el.style.getPropertyValue('--parallax-overscan-y') !== (y ? y + 'px' : '')) {
          if (y) el.style.setProperty('--parallax-overscan-y', y + 'px');
          else el.style.removeProperty('--parallax-overscan-y');
        }
        if (el.style.getPropertyValue('--parallax-overscan-x') !== (x ? x + 'px' : '')) {
          if (x) el.style.setProperty('--parallax-overscan-x', x + 'px');
          else el.style.removeProperty('--parallax-overscan-x');
        }
      });
    });
  }

  function relayout() {
    sizeLayers();
    measure();
    request();
  }

  function step() {
    frame = 0;
    var vh = window.innerHeight;
    var mid = window.scrollY + vh / 2;
    var off = still();
    var phone = phoneQuery && phoneQuery.matches;
    var easing = false;
    var writes = [];
    units.forEach(function (u) {
      var active = !off && u.near && !(u.phoneStill && phone);
      var tx = active && u.reach ? aim.x : 0;
      var ty = active && u.reach ? aim.y : 0;
      u.px += (tx - u.px) * u.ease;
      u.py += (ty - u.py) * u.ease;
      if (Math.abs(tx - u.px) < 0.002 && Math.abs(ty - u.py) < 0.002) { u.px = tx; u.py = ty; }
      else easing = true;
      if (!active && !u.px && !u.py) {
        u.targets.forEach(function (t) { writes.push([t.el, 0, 0]); });
        return;
      }
      var delta = 0;
      if (active && u.scroll) {
        if (u.live) {
          var r = u.el.getBoundingClientRect();
          var moved = u.kind === 'tag' && u.axis === 'y' ? (offsets.get(u.el) || { y: 0 }).y : 0;
          delta = (r.top + r.bottom) / 2 - moved - vh / 2;
        } else {
          delta = u.center - mid;
        }
      }
      u.targets.forEach(function (t) {
        var s = u.strength * t.depth;
        var x = u.reach * t.depth * u.px;
        var y = u.reach * t.depth * u.py;
        if (u.scroll && active) {
          if (u.axis === 'x') x += s * delta;
          else y += s * delta;
        }
        writes.push([t.el, x, y]);
      });
    });
    writes.forEach(function (w) { put(w[0], w[1], w[2]); });
    if (easing) request();
  }

  function request() {
    if (!frame) frame = requestAnimationFrame(step);
  }

  function seen(entries) {
    var arrived = false;
    entries.forEach(function (e) {
      var u = byEl.get(e.target);
      if (!u) return;
      if (e.isIntersecting && !u.near) arrived = true;
      u.near = e.isIntersecting;
    });
    if (arrived) measure();
    request();
  }

  function refresh() {
    refreshTimer = 0;
    var before = units;
    units = [];
    document.querySelectorAll('.parallax-scene').forEach(function (s) { units.push(sceneUnit(s)); });
    document.querySelectorAll('.parallax').forEach(function (el) { units.push(tagUnit(el)); });
    var moving = new Set();
    units.forEach(function (u) { u.targets.forEach(function (t) { moving.add(t.el); }); });
    before.forEach(function (u) {
      u.targets.forEach(function (t) {
        if (moving.has(t.el)) return;
        put(t.el, 0, 0);
        t.el.style.removeProperty('--parallax-overscan-y');
        t.el.style.removeProperty('--parallax-overscan-x');
      });
    });
    var eased = new Map();
    before.forEach(function (u) { eased.set(u.el, u); });
    byEl = new Map();
    if (io) io.disconnect();
    if (ro) { ro.disconnect(); ro.observe(document.body); }
    units.forEach(function (u) {
      var prev = eased.get(u.el);
      if (prev) { u.px = prev.px; u.py = prev.py; u.near = prev.near; }
      byEl.set(u.el, u);
      if (io) io.observe(u.el);
      if (ro && u.kind === 'scene') ro.observe(u.el);
    });
    relayout();
  }

  function scheduleRefresh() {
    if (!refreshTimer) refreshTimer = setTimeout(refresh, 50);
  }

  var PARTS = '.parallax-scene, .parallax, .parallax-layer';
  var NAMED = /(^|\s)parallax(-scene|-layer)?(\s|$)/;

  function relevant(n) {
    if (n.nodeType !== 1) return false;
    if (n.matches(PARTS) || n.querySelector(PARTS)) return true;
    return n.hasAttribute('data-layer') && !!n.closest('.parallax-scene');
  }

  function changed(m) {
    var el = m.target;
    if (m.attributeName === 'class') return el.matches(PARTS) || NAMED.test(m.oldValue || '');
    if (m.attributeName === 'data-layer') return !!el.closest('.parallax-scene');
    return true;
  }

  function onScroll(e) {
    var t = e.target;
    if (t === document || t === root || t === document.body || t === window) {
      request();
    } else if (t && t.contains && units.some(function (u) { return u.live && t.contains(u.el); })) {
      request();
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { measure(); request(); }, 250);
  }

  function boot() {
    refresh();
    new MutationObserver(function (muts) {
      var hit = muts.some(function (m) {
        if (m.type === 'attributes') return changed(m);
        return Array.prototype.some.call(m.addedNodes, relevant) || Array.prototype.some.call(m.removedNodes, relevant);
      });
      if (hit) scheduleRefresh();
    }).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['class', 'data-layer', 'data-parallax-input', 'data-parallax-scroll', 'data-parallax-pointer',
        'data-parallax-ease', 'data-parallax-cover', 'data-parallax-phone', 'data-parallax-speed', 'data-parallax-axis'],
    });
    new MutationObserver(request).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', relayout);
  window.addEventListener('load', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    aim.x = Math.max(-1, Math.min(1, e.clientX / Math.max(1, window.innerWidth) * 2 - 1));
    aim.y = Math.max(-1, Math.min(1, e.clientY / Math.max(1, window.innerHeight) * 2 - 1));
    request();
  }, { passive: true });
  root.addEventListener('mouseleave', function () { aim.x = 0; aim.y = 0; request(); });
  window.addEventListener('blur', function () { aim.x = 0; aim.y = 0; request(); });
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', request);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteParallax = { refresh: scheduleRefresh };
})();
