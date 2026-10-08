(function () {
  'use strict';

  var SELECTOR = '[data-image-cycle]';
  var state = new WeakMap();

  function listOf(el) {
    return (el.getAttribute('data-cycle-images') || '')
      .split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  function paused() {
    var root = document.documentElement;
    return root.classList.contains('motion-paused') || document.hidden;
  }

  function layers(el) {
    var found = el.querySelectorAll(':scope > .image-cycle-layer');
    if (found.length === 2) return [found[0], found[1]];
    Array.prototype.forEach.call(found, function (n) { n.remove(); });
    var out = [0, 1].map(function () {
      var img = document.createElement('img');
      img.className = 'image-cycle-layer';
      img.alt = '';
      img.decoding = 'async';
      img.setAttribute('aria-hidden', 'true');
      img.setAttribute('data-gjs-selectable', 'false');
      img.setAttribute('data-gjs-draggable', 'false');
      img.setAttribute('data-gjs-droppable', 'false');
      el.appendChild(img);
      return img;
    });
    return out;
  }

  function load(url) {
    return new Promise(function (resolve) {
      var probe = new Image();
      probe.decoding = 'async';
      probe.onload = function () {
        if (probe.decode) probe.decode().then(resolve, resolve); else resolve();
      };
      probe.onerror = function () { resolve(); };
      probe.src = url;
    });
  }

  function nextIndex(s) {
    if (s.list.length < 2) return 0;
    if (s.shuffle) {
      var n = s.index;
      while (n === s.index) n = Math.floor(Math.random() * s.list.length);
      return n;
    }
    return (s.index + 1) % s.list.length;
  }

  function schedule(el, s) {
    clearTimeout(s.timer);
    if (s.list.length < 2) return;
    s.timer = setTimeout(function () { advance(el, s); }, s.interval * 1000);
  }

  function advance(el, s) {
    if (!el.isConnected) return;
    if (!s.visible || paused()) { schedule(el, s); return; }
    var i = nextIndex(s);
    var url = s.list[i];
    load(url).then(function () {
      if (!el.isConnected) return;
      var pair = layers(el);
      var shown = pair[s.front];
      var hidden = pair[1 - s.front];
      hidden.src = url;
      hidden.classList.add('is-current');
      shown.classList.remove('is-current');
      s.front = 1 - s.front;
      s.index = i;
      schedule(el, s);
    });
  }

  function setup(el) {
    var list = listOf(el);
    var sig = list.join('|') + '#' + el.getAttribute('data-cycle-interval') + '#' + el.getAttribute('data-cycle-order') +
      '#' + el.getAttribute('data-cycle-start');
    var s = state.get(el);
    if (s && s.sig === sig && el.querySelectorAll(':scope > .image-cycle-layer').length === 2) return;
    if (s) clearTimeout(s.timer);

    s = {
      sig: sig,
      list: list,
      index: 0,
      front: 0,
      timer: 0,
      visible: true,
      interval: Math.max(0.5, num(el, 'data-cycle-interval', 4)),
      shuffle: el.getAttribute('data-cycle-order') === 'shuffle',
    };
    state.set(el, s);

    var pair = layers(el);
    pair[1].classList.remove('is-current');
    pair[1].removeAttribute('src');
    if (!list.length) {
      pair[0].removeAttribute('src');
      pair[0].classList.remove('is-current');
      return;
    }
    if (s.shuffle) s.index = Math.floor(Math.random() * list.length);
    else s.index = Math.min(list.length, Math.max(1, Math.round(num(el, 'data-cycle-start', 1)))) - 1;
    pair[0].src = list[s.index];
    pair[0].classList.add('is-current');

    if ('IntersectionObserver' in window) {
      if (!el.__cycleIO) {
        el.__cycleIO = new IntersectionObserver(function (entries) {
          var st = state.get(el);
          if (st) st.visible = entries[entries.length - 1].isIntersecting;
        }, { rootMargin: '200px' });
        el.__cycleIO.observe(el);
      }
    }
    schedule(el, s);
  }

  function refresh() {
    document.querySelectorAll(SELECTOR).forEach(setup);
  }

  function boot() {
    refresh();
    var pending = 0;
    new MutationObserver(function (muts) {
      var relevant = muts.some(function (m) {
        if (m.type === 'attributes') return true;
        if (m.target.nodeType === 1 && m.target.matches(SELECTOR)) return true;
        return Array.prototype.some.call(m.addedNodes, function (n) {
          return n.nodeType === 1 && (n.matches(SELECTOR) || n.querySelector(SELECTOR));
        });
      });
      if (!relevant || pending) return;
      pending = setTimeout(function () { pending = 0; refresh(); }, 50);
    }).observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-cycle-images', 'data-cycle-interval', 'data-cycle-order', 'data-cycle-start'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.ImageCycle = { refresh: refresh };
})();
