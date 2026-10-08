(function () {
  'use strict';

  (function () {
    var stale = document.getElementById('marquee-keyframes');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
  })();

  function inEditorMode() {
    try {
      return !!(document.documentElement &&
                document.documentElement.classList.contains('in-editor'));
    } catch (e) { return false; }
  }

  function motionPaused() {
    try {
      return !!(document.documentElement &&
                document.documentElement.classList.contains('motion-paused'));
    } catch (e) { return true; }
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function numAttr(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isFinite(v) ? v : fallback;
  }

  function boolAttr(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v == null) return fallback;
    return v === 'true' || v === '1';
  }

  function modeOf(el) {
    return String(el.getAttribute('data-track-mode') || 'marquee').toLowerCase();
  }

  function viewportOf(el) {
    return el.querySelector(':scope > .track-viewport');
  }

  function innerOf(el) {
    var vp = viewportOf(el);
    if (vp) return vp.querySelector(':scope > .track-inner');
    return el.querySelector(':scope > .track-inner');
  }

  function ensureViewportStructure(el) {
    if (viewportOf(el)) return;
    var inner = el.querySelector(':scope > .track-inner');
    if (!inner) return;
    var vp = document.createElement('div');
    vp.className = 'track-viewport';
    el.insertBefore(vp, inner);
    vp.appendChild(inner);
  }

  function gapPx(el, inner) {
    try {
      var cs = getComputedStyle(inner);
      var raw = cs.columnGap || cs.gap || '0';
      var n = parseFloat(raw);
      if (isFinite(n) && n > 0) return n;
    } catch (e) {}
    return 0;
  }

  function sealClone(node) {
    node.setAttribute('data-gjs-selectable', 'false');
    node.setAttribute('data-gjs-draggable',  'false');
    node.setAttribute('data-gjs-droppable',  'false');
    node.setAttribute('data-gjs-copyable',   'false');
    node.setAttribute('data-gjs-removable',  'false');
  }

  function parseSlowdown(el) {
    var raw = el.getAttribute('data-track-hover-slow');
    if (raw != null && raw !== '') {
      var n = parseFloat(raw);
      if (isFinite(n)) return Math.max(0, Math.min(100, n));
    }
    if (boolAttr(el, 'data-track-pause-hover', false)) return 100;
    return null;
  }

  function readHoverEase(el) {
    var raw = el.getAttribute('data-track-hover-ease');
    if (raw == null || raw === '') return 200;
    var n = parseFloat(raw);
    if (!isFinite(n)) return 200;
    return Math.max(0, Math.min(3000, n));
  }

  function rateOf(el) {
    return el.__marqueeRate != null ? el.__marqueeRate : 1;
  }

  function settleRate(el, rate) {
    var a = el.__marqueeAnim;
    el.__marqueeRate = rate;
    if (!a) return;
    try {
      var t = a.currentTime;
      if (a.playState !== 'paused') a.pause();
      if (rate <= 0.0005) {
        a.currentTime = t;
        return;
      }
      a.playbackRate = rate;
      a.currentTime = t;
      a.play();
    } catch (e) {}
  }

  function setRateImmediate(el, target) {
    if (el.__rateAnim) {
      cancelAnimationFrame(el.__rateAnim);
      el.__rateAnim = null;
    }
    settleRate(el, target);
  }

  function setRateEased(el, target) {
    var a = el.__marqueeAnim;
    if (!a) return;

    var ease = readHoverEase(el);
    if (ease <= 0) { setRateImmediate(el, target); return; }

    if (el.__rateAnim) {
      cancelAnimationFrame(el.__rateAnim);
      el.__rateAnim = null;
    }

    var startRate = rateOf(el);
    if (Math.abs(startRate - target) < 0.001) return;

    var time;
    try {
      if (a.playState !== 'paused') a.pause();
      time = Number(a.currentTime) || 0;
    } catch (e) { time = 0; }

    var startTime = performance.now();
    var last = startTime;

    function step(now) {
      var anim = el.__marqueeAnim;
      if (!anim) { el.__rateAnim = null; return; }

      var t = Math.min(1, (now - startTime) / ease);
      var rate = startRate + (target - startRate) * (1 - (1 - t) * (1 - t));
      time += Math.max(0, now - last) * rate;
      last = now;
      el.__marqueeRate = rate;
      try { anim.currentTime = time; } catch (e) {}

      if (t < 1) {
        el.__rateAnim = requestAnimationFrame(step);
      } else {
        el.__rateAnim = null;
        settleRate(el, target);
      }
    }

    el.__rateAnim = requestAnimationFrame(step);
  }

  function updateMarqueeRate(el) {
    var a = el.__marqueeAnim;
    if (!a) return;
    var target = 1;
    if (el.__marqueeHovering && el.__marqueeSlowdown != null) {
      target = 1 - el.__marqueeSlowdown / 100;
    }
    setRateEased(el, target);
  }

  function syncHoverSlowdown(el, slowdown) {
    var needsHover = (slowdown != null && slowdown > 0);
    if (needsHover && !el.__marqueeOnEnter) {
      el.__marqueeOnEnter = function () {
        el.__marqueeHovering = true;
        updateMarqueeRate(el);
      };
      el.__marqueeOnLeave = function () {
        el.__marqueeHovering = false;
        updateMarqueeRate(el);
      };
      el.addEventListener('mouseenter', el.__marqueeOnEnter);
      el.addEventListener('mouseleave', el.__marqueeOnLeave);
    } else if (!needsHover && el.__marqueeOnEnter) {
      el.removeEventListener('mouseenter', el.__marqueeOnEnter);
      el.removeEventListener('mouseleave', el.__marqueeOnLeave);
      el.__marqueeOnEnter = null;
      el.__marqueeOnLeave = null;
      el.__marqueeHovering = false;
    }
  }

  function forceHorizontalRow(inner) {
    if (!inner) return;
    if (inner.style.display !== 'flex') inner.style.display = 'flex';
    if (inner.style.flexWrap !== 'nowrap') inner.style.flexWrap = 'nowrap';
  }

  function releaseHorizontalRow(inner) {
    if (!inner) return;
    inner.style.removeProperty('display');
    inner.style.removeProperty('flex-wrap');
  }

  function teardownMarquee(el) {
    if (el.__marqueeDebounce) {
      clearTimeout(el.__marqueeDebounce);
      el.__marqueeDebounce = null;
    }

    if (el.__rateAnim) {
      cancelAnimationFrame(el.__rateAnim);
      el.__rateAnim = null;
    }

    if (el.__marqueeOnEnter) {
      try { el.removeEventListener('mouseenter', el.__marqueeOnEnter); } catch (e) {}
      el.__marqueeOnEnter = null;
    }
    if (el.__marqueeOnLeave) {
      try { el.removeEventListener('mouseleave', el.__marqueeOnLeave); } catch (e) {}
      el.__marqueeOnLeave = null;
    }
    if (el.__marqueeOnLoad) {
      try { el.removeEventListener('load', el.__marqueeOnLoad, true); } catch (e) {}
      el.__marqueeOnLoad = null;
    }
    if (el.__marqueeResize) {
      try { el.__marqueeResize.disconnect(); } catch (e) {}
      el.__marqueeResize = null;
    }

    if (el.__marqueeAnim) {
      try { el.__marqueeAnim.cancel(); } catch (e) {}
      el.__marqueeAnim = null;
    }
    el.__marqueeHovering = false;
    el.__marqueeSlowdown = null;
    el.__marqueeRate = null;
    el.__marqueeSig = null;
    el.classList.remove('is-marquee-editing');

    var inner = innerOf(el);
    if (!inner) return;

    Array.prototype.forEach.call(
      inner.querySelectorAll('.track-slide.is-clone'),
      function (n) { if (n.parentNode) n.parentNode.removeChild(n); }
    );

    releaseHorizontalRow(inner);

    inner.style.removeProperty('animation-name');
    inner.style.removeProperty('animation-duration');
    inner.style.removeProperty('animation-timing-function');
    inner.style.removeProperty('animation-iteration-count');
    inner.style.removeProperty('animation-direction');
    inner.style.removeProperty('--track-duration');
    inner.style.removeProperty('--track-hover-duration');
    inner.style.removeProperty('--track-hover-state');
  }

  function enterEditMode(el) {
    teardownMarquee(el);

    var inner = innerOf(el);
    if (!inner) return;

    el.classList.add('is-marquee-editing');

    forceHorizontalRow(inner);
    inner.style.width = 'max-content';
  }

  function captureMarqueeOffset(el) {
    const inner = innerOf(el);
    if (!inner) return null;
    try {
      const t = getComputedStyle(inner).transform;
      if (!t || t === 'none') return 0;
      const m = t.match(/matrix(3d)?\(([^)]+)\)/);
      if (!m) return 0;
      const p = m[2].split(',').map(function (s) { return parseFloat(s); });
      const tx = m[1] === '3d' ? p[12] : p[4];
      return Math.abs(tx);
    } catch (e) { return 0; }
  }

  function applyMarqueeOffset(el, offsetPx, period, anim, direction) {
    if (offsetPx == null || !anim || !period) return;
    try {
      let f = direction === 'rtl'
        ? 1 - (offsetPx / period)
        : (offsetPx / period);
      f = ((f % 1) + 1) % 1;
      const dur = anim.effect.getComputedTiming().duration || 1;
      anim.currentTime = f * dur;
    } catch (e) {}
  }

  function setupMarquee(el) {
    if (prefersReducedMotion()) {
      teardownMarquee(el);
      return;
    }

    if (inEditorMode() && motionPaused()) {
      enterEditMode(el);
      return;
    }

    if (el.getAttribute('data-track-paused') === 'true') {
      teardownMarquee(el);
      return;
    }

    var inner = innerOf(el);
    if (!inner) return;
    if (!el.isConnected) return;

    forceHorizontalRow(inner);

    var slides = Array.prototype.slice.call(
      inner.querySelectorAll(':scope > .track-slide:not(.is-clone)')
    );
    if (!slides.length) return;

    var gap = gapPx(el, inner);
    var m = slides.length;

    var sumWidths = 0;
    slides.forEach(function (s) { sumWidths += s.offsetWidth; });

    if (sumWidths <= 0) {
      if (!el.__marqueeRetries) el.__marqueeRetries = 0;
      el.__marqueeRetries++;
      if (el.__marqueeRetries < 30) {
        el.__marqueeDebounce = setTimeout(function () {
          if (el.isConnected) setupMarquee(el);
        }, 100);
      }
      return;
    }
    el.__marqueeRetries = 0;

    var speed = Math.max(1, numAttr(el, 'data-track-speed', 60));
    var direction = String(el.getAttribute('data-track-direction') || 'ltr').toLowerCase();
    var slowdown = parseSlowdown(el);

    var sig = [speed, direction, m, sumWidths, gap, Math.round(el.clientWidth || 0)].join('|');

    if (el.__marqueeSig === sig && el.__marqueeAnim) {
      el.__marqueeSlowdown = slowdown;

      syncHoverSlowdown(el, slowdown);
      updateMarqueeRate(el);
      return;
    }

    var prevOffset = captureMarqueeOffset(el);

    teardownMarquee(el);

    forceHorizontalRow(inner);

    var estPeriod = sumWidths + m * gap;
    var vpWidth = Math.max(el.clientWidth || 0, document.documentElement.clientWidth || 0);
    var copies = 1 + Math.ceil((vpWidth + gap) / Math.max(estPeriod, 1));
    if (copies < 2) copies = 2;
    if (copies > 40) copies = 40;

    for (var c = 1; c < copies; c++) {
      slides.forEach(function (orig) {
        var cl = orig.cloneNode(true);
        cl.classList.add('is-clone');
        cl.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(cl.querySelectorAll('img'), function (img) {
          img.decoding = 'async';
          img.loading = 'eager';
        });
        sealClone(cl);
        inner.appendChild(cl);
      });
    }

    var period = estPeriod;
    var firstOriginal = slides[0];
    var firstClone = inner.querySelector(':scope > .track-slide.is-clone');
    if (firstClone) {
      var d = firstClone.offsetLeft - firstOriginal.offsetLeft;
      if (isFinite(d) && d > 0) period = d;
    }
    period = Math.round(period * 1000) / 1000;

    var durationMs = Math.max(100, (period / speed) * 1000);

    var anim = inner.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(' + (-period) + 'px, 0, 0)' }
      ],
      {
        duration: durationMs,
        iterations: Infinity,
        easing: 'linear',
        direction: direction === 'rtl' ? 'reverse' : 'normal',
        fill: 'none'
      }
    );

    el.__marqueeAnim = anim;
    el.__marqueeRate = 1;
    el.__marqueeSig = sig;
    el.__marqueeSlowdown = slowdown;
    el.__marqueeHovering = false;

    applyMarqueeOffset(el, prevOffset, period, anim, direction);

    syncHoverSlowdown(el, slowdown);

    var onLoad = function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      var p = t;
      while (p && p !== el) {
        if (p.classList && p.classList.contains('is-clone')) return;
        p = p.parentNode;
      }
      if (!el.contains(t)) return;
      if (!el.isConnected) return;

      if (el.__marqueeDebounce) clearTimeout(el.__marqueeDebounce);
      el.__marqueeDebounce = setTimeout(function () {
        if (el.isConnected) setupMarquee(el);
      }, 150);
    };
    el.addEventListener('load', onLoad, true);
    el.__marqueeOnLoad = onLoad;

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        if (el.__marqueeDebounce) clearTimeout(el.__marqueeDebounce);
        el.__marqueeDebounce = setTimeout(function () {
          if (el.isConnected) setupMarquee(el);
        }, 60);
      });
      slides.forEach(function (sl) { ro.observe(sl); });
      ro.observe(el);
      el.__marqueeResize = ro;
    }

    if (document.fonts && document.fonts.ready && !el.__marqueeFontHooked) {
      el.__marqueeFontHooked = true;
      document.fonts.ready.then(function () {
        if (!el.isConnected) return;
        if (el.__marqueeDebounce) clearTimeout(el.__marqueeDebounce);
        el.__marqueeDebounce = setTimeout(function () {
          if (el.isConnected) setupMarquee(el);
        }, 150);
      });
    }
  }

  function stopCarouselAutoplay(el) {
    if (el.__trackInterval) {
      clearInterval(el.__trackInterval);
      el.__trackInterval = null;
    }
  }

  function setupCarouselAutoplay(el) {
    stopCarouselAutoplay(el);

    var inner = innerOf(el);
    if (inner) releaseHorizontalRow(inner);

    if (inEditorMode()) return;
    if (motionPaused()) return;
    if (!boolAttr(el, 'data-track-autoplay', false)) return;

    var vp = viewportOf(el);
    if (!vp || !inner) return;
    var slides = inner.querySelectorAll(':scope > .track-slide:not(.is-clone)');
    if (!slides.length) return;

    var gap = gapPx(el, inner);
    var speed = Math.max(0.5, numAttr(el, 'data-track-speed', 4));
    var stepPx = slides[0].getBoundingClientRect().width + gap;
    var loop = boolAttr(el, 'data-track-loop', false);
    var direction = String(el.getAttribute('data-track-direction') || 'ltr').toLowerCase();

    el.__trackInterval = setInterval(function () {
      if (motionPaused()) return;
      if (el.getAttribute('data-track-paused') === 'true') return;
      if (document.hidden) return;

      var atEnd = vp.scrollLeft + vp.clientWidth >= vp.scrollWidth - 2;
      var atStart = vp.scrollLeft <= 2;

      if (direction === 'rtl') {
        if (atStart) {
          if (loop) vp.scrollTo({ left: vp.scrollWidth, behavior: 'smooth' });
          else stopCarouselAutoplay(el);
        } else {
          vp.scrollBy({ left: -stepPx, behavior: 'smooth' });
        }
      } else {
        if (atEnd) {
          if (loop) vp.scrollTo({ left: 0, behavior: 'smooth' });
          else stopCarouselAutoplay(el);
        } else {
          vp.scrollBy({ left: stepPx, behavior: 'smooth' });
        }
      }
    }, speed * 1000);
  }

  var _silencing = 0;
  var _bodyObserver = null;

  function apply(el) {
    if (!el || el.nodeType !== 1) return;
    if (!el.isConnected) return;

    _silencing++;
    try {
      ensureViewportStructure(el);

      var mode = modeOf(el);
      if (mode === 'marquee') {
        setupMarquee(el);
      } else {
        teardownMarquee(el);
        if (mode === 'carousel') setupCarouselAutoplay(el);
        else stopCarouselAutoplay(el);
      }
    } finally {
      _silencing--;
      if (_silencing === 0 && _bodyObserver) {
        try { _bodyObserver.takeRecords(); } catch (e) {}
      }
    }

    if (modeOf(el) === 'carousel') {
      ensureCarouselControls(function () {
        if (!el.isConnected) return;
        if (window.CarouselControls && typeof window.CarouselControls.apply === 'function') {
          try { window.CarouselControls.apply(el); } catch (e) { console.error(e); }
        }
      });
    } else if (window.CarouselControls && typeof window.CarouselControls.apply === 'function') {
      try { window.CarouselControls.apply(el); } catch (e) {}
    }
  }

  function ensureCarouselControls(cb) {
    if (window.CarouselControls) { cb(); return; }
    if (window.__ccLoading) { window.__ccLoading.push(cb); return; }
    window.__ccLoading = [cb];
    if (document.querySelector('script[src*="/assets/js/carousel-controls.js"]')) return;
    var s = document.createElement('script');
    s.src = '/assets/js/carousel-controls.js';
    s.defer = true;
    s.onload = function () {
      var list = window.__ccLoading || [];
      window.__ccLoading = null;
      list.forEach(function (fn) { try { fn(); } catch (e) {} });
    };
    s.onerror = function () {
      console.warn('[scroll-track] could not load carousel-controls.js');
      window.__ccLoading = null;
    };
    document.head.appendChild(s);
  }

  function initAll() {
    document.querySelectorAll('.scroll-track').forEach(apply);
  }

  var _scheduled = false;
  var _pending = new Set();

  function flush() {
    _scheduled = false;
    var set = _pending;
    _pending = new Set();
    set.forEach(function (el) { if (el.isConnected) apply(el); });
  }

  function schedule(el) {
    _pending.add(el);
    if (_scheduled) return;
    _scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }

  function isOurInternalMutation(m) {
    function internal(n) {
      if (!n || n.nodeType !== 1) return false;
      if (n.classList && n.classList.contains('is-clone')) return true;
      if (n.closest && n.closest('.is-clone')) return true;
      return false;
    }
    var anyExternal = false;
    if (m.addedNodes) m.addedNodes.forEach(function (n) {
      if (n.nodeType === 1 && !internal(n)) anyExternal = true;
    });
    if (!anyExternal && m.removedNodes) m.removedNodes.forEach(function (n) {
      if (n.nodeType === 1 && !internal(n)) anyExternal = true;
    });
    return !anyExternal;
  }

  function observeBody() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    _bodyObserver = new MutationObserver(function (muts) {
      if (_silencing > 0) {
        try { _bodyObserver.takeRecords(); } catch (e) {}
        return;
      }
      muts.forEach(function (m) {
        if (m.type === 'attributes') {
          var t = m.target;
          if (!t || !t.classList) return;
          if (t.classList.contains('is-clone')) return;
          if (t.classList.contains('scroll-track')) { schedule(t); return; }
          var anc = t.closest && t.closest('.scroll-track');
          if (anc) schedule(anc);
          return;
        }
        if (m.type === 'childList') {
          if (isOurInternalMutation(m)) return;
          var target = m.target;
          var track = target && target.closest && target.closest('.scroll-track');
          if (track) schedule(track);
          m.addedNodes && m.addedNodes.forEach(function (n) {
            if (!n || n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('scroll-track')) schedule(n);
            if (n.querySelectorAll) n.querySelectorAll('.scroll-track').forEach(schedule);
          });
        }
      });
    });
    _bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-track-mode', 'data-track-speed', 'data-track-loop',
        'data-track-direction', 'data-track-autoplay',
        'data-track-hover-slow', 'data-track-pause-hover',
        'data-track-hover-ease',
        'data-track-controls', 'data-track-captions', 'data-track-paused',
      ],
    });
  }

  function boot() {
    initAll();
    observeBody();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', function () { initAll(); });

  var _resizeTimer = null;
  var _lastWindowWidth = window.innerWidth;

  window.addEventListener('resize', function () {
    var currentWidth = window.innerWidth;
    if (currentWidth === _lastWindowWidth) return;
    _lastWindowWidth = currentWidth;

    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      document.querySelectorAll('.scroll-track[data-track-mode="marquee"]')
        .forEach(function (el) {
          el.__marqueeSig = null;
          apply(el);
        });
    }, 150);
  });

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    var _lastEditor = inEditorMode();
    var _lastPaused = motionPaused();
    new MutationObserver(function () {
      var nowEditor = inEditorMode();
      var nowPaused = motionPaused();
      if (nowEditor === _lastEditor && nowPaused === _lastPaused) return;
      _lastEditor = nowEditor;
      _lastPaused = nowPaused;
      initAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  window.ScrollTrack = { apply: apply, initAll: initAll };
})();
