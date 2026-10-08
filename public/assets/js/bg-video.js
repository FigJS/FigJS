(function () {
  'use strict';

  var root = document.documentElement;
  var PHONE = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  var STILL = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var ATTRS = ['data-bg-video', 'data-bg-video-poster', 'data-bg-video-play', 'data-bg-video-speed',
    'data-bg-video-start', 'data-bg-video-end', 'data-bg-video-attach', 'data-bg-video-phone',
    'data-bg-video-phone-src'];

  var hosts = new Set();

  function inEditor() { return root.classList.contains('in-editor'); }
  function attr(el, name) { return (el.getAttribute(name) || '').trim(); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

  function isHost(el) {
    if (!el || el.nodeType !== 1 || !attr(el, 'data-bg-video')) return false;
    return el === document.body || el.classList.contains('bg-video');
  }

  function editing(el) { return inEditor() && !!el.closest('[contenteditable="true"]'); }

  function plan(el) {
    var src = attr(el, 'data-bg-video');
    var poster = attr(el, 'data-bg-video-poster');
    if (PHONE && PHONE.matches) {
      var phone = attr(el, 'data-bg-video-phone');
      if (phone === 'poster') src = '';
      else if (phone === 'other') src = attr(el, 'data-bg-video-phone-src') || src;
    }
    var conn = navigator.connection;
    var saving = !!(conn && conn.saveData) && !inEditor();
    var reduced = !!(STILL && STILL.matches) && !inEditor();
    var still = saving || reduced || (inEditor() && root.classList.contains('motion-paused'));
    if ((saving || reduced) && poster) src = '';
    var start = Math.max(0, num(attr(el, 'data-bg-video-start'), 0));
    var end = num(attr(el, 'data-bg-video-end'), 0);
    return {
      src: src,
      poster: poster,
      still: still,
      once: attr(el, 'data-bg-video-play') === 'once',
      speed: Math.min(4, Math.max(0.0625, num(attr(el, 'data-bg-video-speed'), 1))),
      start: start,
      end: end > start ? end : 0,
    };
  }


  function layerOf(el) {
    for (var c = el.lastElementChild; c; c = c.previousElementSibling) {
      if (c.classList.contains('bg-video-layer')) return c;
    }
    return null;
  }

  function build(el) {
    var layer = document.createElement('div');
    layer.className = 'bg-video-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('contenteditable', 'false');
    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.setAttribute('disableremoteplayback', '');
    v.preload = 'none';
    v.tabIndex = -1;
    var tint = document.createElement('span');
    tint.className = 'bg-video-tint';
    layer.appendChild(v);
    layer.appendChild(tint);
    el.appendChild(layer);
    v.__bgHost = el;
    v.addEventListener('loadedmetadata', function () { seekStart(v); });
    v.addEventListener('timeupdate', function () { atEnd(v); });
    v.addEventListener('ended', function () { atEnd(v, true); });
    v.addEventListener('error', function () {
      if (!v.getAttribute('src')) return;
      v.removeAttribute('src');
      v.__bgSrc = '';
      try { v.load(); } catch (e) {}
    });
    return layer;
  }

  function release(v) {
    try { v.pause(); } catch (e) {}
    if (v.getAttribute('src')) {
      v.removeAttribute('src');
      try { v.load(); } catch (e) {}
    }
    v.__bgSrc = '';
  }

  function teardown(el) {
    var layer = layerOf(el);
    if (layer) {
      var v = layer.querySelector('video');
      if (v) release(v);
      layer.parentNode.removeChild(layer);
    }
    if (seen) seen.unobserve(el);
    el.__bgSeen = false;
    el.__bgNear = false;
    hosts.delete(el);
  }


  function playOf(v) { return v.__bgPlan || {}; }

  function seekStart(v) {
    var p = playOf(v);
    if (p.start && v.currentTime < p.start) {
      try { v.currentTime = p.start; } catch (e) {}
    }
  }

  function atEnd(v, ended) {
    var p = playOf(v);
    var over = ended || (p.end && v.currentTime >= p.end);
    if (!over) return;
    if (p.once) {
      v.__bgDone = true;
      try { v.pause(); } catch (e) {}
      return;
    }
    try { v.currentTime = p.start || 0; } catch (e) {}
    if (ended) start(v);
  }

  function start(v) {
    var r = v.play();
    if (r && typeof r.catch === 'function') r.catch(function () {});
  }

  function shown(el) {
    return el === document.body || !seen || !!el.__bgNear;
  }

  function sync(el) {
    if (!el.isConnected || !isHost(el) || editing(el)) { teardown(el); return; }
    hosts.add(el);
    var layer = layerOf(el) || build(el);
    var v = layer.querySelector('video');
    var p = plan(el);
    v.__bgPlan = p;
    if (el !== document.body && seen && !el.__bgSeen) {
      el.__bgSeen = true;
      seen.observe(el);
    }

    if ((v.getAttribute('poster') || '') !== p.poster) {
      if (p.poster) v.setAttribute('poster', p.poster);
      else v.removeAttribute('poster');
    }
    v.loop = !p.once && !p.start && !p.end;
    if (!p.once) v.__bgDone = false;
    v.defaultPlaybackRate = p.speed;
    v.playbackRate = p.speed;

    var want = shown(el) ? p.src : (v.__bgSrc || '');
    if (want !== (v.__bgSrc || '')) {
      if (!want) release(v);
      else {
        v.__bgSrc = want;
        v.__bgDone = false;
        v.preload = p.still ? 'metadata' : 'auto';
        v.src = want;
        try { v.load(); } catch (e) {}
      }
    }
    if (!v.__bgSrc) return;
    if (v.readyState >= 1 && (v.currentTime < p.start - 0.05 || (p.end && v.currentTime > p.end))) {
      try { v.currentTime = p.start; } catch (e) {}
    }

    var run = shown(el) && !p.still && !v.__bgDone && document.visibilityState !== 'hidden';
    if (run) {
      if (v.paused) start(v);
    } else if (!v.paused) {
      try { v.pause(); } catch (e) {}
    }
  }

  var queued = new Set();
  var timer = 0;
  function later(el) {
    queued.add(el);
    if (!timer) timer = setTimeout(flush, 0);
  }
  function flush() {
    timer = 0;
    var list = Array.from(queued);
    queued.clear();
    list.forEach(sync);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.hasAttribute('data-bg-video')) later(node);
    if (node.querySelectorAll) {
      Array.prototype.forEach.call(node.querySelectorAll('[data-bg-video]'), later);
    }
  }

  function syncAll() {
    hosts.forEach(later);
    scan(document.body);
  }


  var seen = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.__bgNear = en.isIntersecting;
        later(en.target);
      });
    }, { rootMargin: '200px 0px' })
    : null;

  function watch() {
    syncAll();
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'attributes') {
          var t = m.target;
          if (t === root) { if (m.attributeName === 'class') syncAll(); return; }
          if (m.attributeName === 'class' && !t.hasAttribute('data-bg-video') && !hosts.has(t)) return;
          if (m.attributeName === 'contenteditable') { scan(t); hosts.forEach(function (h) { if (t.contains(h)) later(h); }); return; }
          later(t);
          return;
        }
        Array.prototype.forEach.call(m.removedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.classList.contains('bg-video-layer')) { if (hosts.has(m.target)) later(m.target); return; }
          hosts.forEach(function (h) { if (!h.isConnected) later(h); });
        });
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType === 1 && !n.classList.contains('bg-video-layer')) scan(n);
        });
      });
    }).observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ATTRS.concat(['class', 'contenteditable']),
    });
  }

  document.addEventListener('visibilitychange', syncAll);
  [PHONE, STILL].forEach(function (q) {
    if (!q) return;
    if (q.addEventListener) q.addEventListener('change', syncAll);
    else if (q.addListener) q.addListener(syncAll);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  window.BgVideo = { refresh: syncAll };
})();
