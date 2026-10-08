(function () {
  'use strict';

  var SVG_PREV = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.6 16.6L10 18l6-6-6-6-1.4 1.4L13.2 12z"/></svg>';

  function boolAttr(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v == null) return fallback;
    return v === 'true' || v === '1' || v === '';
  }

  function viewportOf(el) { return el.querySelector(':scope > .track-viewport'); }

  function slidesOf(el) {
    var vp = viewportOf(el);
    if (!vp) return [];
    var inner = vp.querySelector(':scope > .track-inner');
    if (!inner) return [];
    return Array.prototype.slice.call(
      inner.querySelectorAll(':scope > .track-slide:not(.is-clone)')
    );
  }

  function slideCaption(slide) {
    var img = slide.querySelector('img, [data-full-src]');
    var own = function (n, name) { return n ? (n.getAttribute(name) || '') : ''; };
    if (own(slide, 'data-gallery-caption') === 'off' || own(img, 'data-gallery-caption') === 'off') return '';
    return own(slide, 'data-caption') || own(img, 'data-caption');
  }

  function seal(el) {
    el.setAttribute('data-gjs-selectable', 'false');
    el.setAttribute('data-gjs-draggable',  'false');
    el.setAttribute('data-gjs-droppable',  'false');
    el.setAttribute('data-gjs-copyable',   'false');
    el.setAttribute('data-gjs-removable',  'false');
  }

  function computeIndex(el) {
    var vp = viewportOf(el);
    var slides = slidesOf(el);
    if (!vp || !slides.length) return 0;
    var sl = vp.scrollLeft;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < slides.length; i++) {
      var d = Math.abs(slides[i].offsetLeft - sl);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function goTo(el, i) {
    var vp = viewportOf(el);
    var slides = slidesOf(el);
    if (!vp || !slides.length) return;
    var clamped = Math.max(0, Math.min(slides.length - 1, i));
    vp.scrollTo({ left: slides[clamped].offsetLeft, behavior: 'smooth' });
  }

  function refreshControls(el) {
    var idx = computeIndex(el);
    if (el.__ccLastIndex === idx && el.__ccLastCount === slidesOf(el).length) return;
    el.__ccLastIndex = idx;
    el.__ccLastCount = slidesOf(el).length;

    var slides = slidesOf(el);

    el.querySelectorAll(':scope > .track-dots > .track-dot').forEach(function (d, i) {
      d.classList.toggle('is-active', i === idx);
    });

    var capBar = el.querySelector(':scope > .track-caption');
    if (capBar) {
      var slide = slides[idx];
      var cap = slide ? slideCaption(slide) : '';
      capBar.textContent = cap;
      capBar.style.display = cap ? '' : 'none';
    }

    var dotsBar = el.querySelector(':scope > .track-dots');
    if (dotsBar) {
      var below = capBar && capBar.style.display !== 'none'
        ? capBar.offsetHeight + (parseFloat(getComputedStyle(capBar).marginTop) || 0) : 0;
      dotsBar.style.setProperty('--track-caption-room', below + 'px');
    }

    var loop = boolAttr(el, 'data-track-loop', false);
    var prev = el.querySelector(':scope > .track-arrows > .track-arrow--prev');
    var next = el.querySelector(':scope > .track-arrows > .track-arrow--next');
    if (prev) prev.disabled = !loop && idx <= 0;
    if (next) next.disabled = !loop && idx >= slides.length - 1;
  }

  function buildArrows(el) {
    var existing = el.querySelector(':scope > .track-arrows');
    if (existing) return existing;

    var arrows = document.createElement('div');
    arrows.className = 'track-arrows';
    arrows.innerHTML =
      '<button type="button" class="track-arrow track-arrow--prev" aria-label="Previous slide">' + SVG_PREV + '</button>' +
      '<button type="button" class="track-arrow track-arrow--next" aria-label="Next slide">' + SVG_NEXT + '</button>';
    seal(arrows);
    arrows.querySelectorAll('button').forEach(function (b) { seal(b); });

    arrows.querySelector('.track-arrow--prev').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var idx = computeIndex(el);
      var slides = slidesOf(el);
      var loop = boolAttr(el, 'data-track-loop', false);
      if (idx <= 0) { if (loop) goTo(el, slides.length - 1); return; }
      goTo(el, idx - 1);
    });
    arrows.querySelector('.track-arrow--next').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var idx = computeIndex(el);
      var slides = slidesOf(el);
      var loop = boolAttr(el, 'data-track-loop', false);
      if (idx >= slides.length - 1) { if (loop) goTo(el, 0); return; }
      goTo(el, idx + 1);
    });

    el.appendChild(arrows);
    return arrows;
  }

  function buildDots(el) {
    var slides = slidesOf(el);
    var existing = el.querySelector(':scope > .track-dots');
    if (existing && existing.children.length === slides.length) return existing;
    if (existing) existing.parentNode.removeChild(existing);

    var dots = document.createElement('div');
    dots.className = 'track-dots';
    seal(dots);
    slides.forEach(function (_, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'track-dot';
      d.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      seal(d);
      d.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        goTo(el, i);
      });
      dots.appendChild(d);
    });
    el.appendChild(dots);
    return dots;
  }

  function buildCaption(el) {
    var existing = el.querySelector(':scope > .track-caption');
    if (existing) return existing;
    var cap = document.createElement('div');
    cap.className = 'track-caption';
    seal(cap);
    el.appendChild(cap);
    return cap;
  }

  var SWIPE_SHARE = 0.15;
  var FLICK = 0.35;

  function stepFrom(el, idx, dir) {
    var count = slidesOf(el).length;
    var to = idx + dir;
    if (to < 0 || to >= count) {
      if (!boolAttr(el, 'data-track-loop', false)) return idx;
      to = to < 0 ? count - 1 : 0;
    }
    return to;
  }

  function swipeOne(el, vp) {
    if (vp.__ccSwipe) return;
    vp.__ccSwipe = true;
    var g = null;
    var swallowClick = false;
    var idleTimer = 0;

    function stopSettling() {
      clearTimeout(idleTimer);
      vp.removeEventListener('scroll', onSettleScroll);
      vp.removeEventListener('scrollend', arrive);
    }
    function arrive() {
      stopSettling();
      if (g && g.sideways) return;
      vp.classList.remove('is-swiping');
    }
    function onSettleScroll() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(arrive, 150);
    }
    function settle(i) {
      vp.addEventListener('scroll', onSettleScroll, { passive: true });
      vp.addEventListener('scrollend', arrive);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(arrive, 700);
      goTo(el, i);
    }

    vp.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (g) return;
      swallowClick = false;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, left: vp.scrollLeft, idx: computeIndex(el), sideways: null,
        trail: [{ x: e.clientX, t: e.timeStamp }] };
    });

    vp.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x;
      var dy = e.clientY - g.y;
      if (g.sideways === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        g.sideways = Math.abs(dx) > Math.abs(dy);
        if (!g.sideways) { g = null; return; }
        stopSettling();
        vp.classList.add('is-swiping');
        try { vp.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var max = Math.max(0, vp.scrollWidth - vp.clientWidth);
      var want = g.left - dx;
      if (want < 0) want = want / 2;
      else if (want > max) want = max + (want - max) / 2;
      vp.scrollLeft = want;
      g.trail.push({ x: e.clientX, t: e.timeStamp });
      if (g.trail.length > 6) g.trail.shift();
    });

    function release(e) {
      if (!g || e.pointerId !== g.id) return;
      var gesture = g;
      g = null;
      if (!gesture.sideways) return;
      swallowClick = true;
      setTimeout(function () { swallowClick = false; }, 400);
      var dx = e.clientX - gesture.x;
      var first = gesture.trail[0];
      var span = Math.max(1, e.timeStamp - first.t);
      var speed = e.type === 'pointercancel' ? 0 : (e.clientX - first.x) / span;
      var dir = 0;
      if (e.type !== 'pointercancel' && (Math.abs(dx) > vp.clientWidth * SWIPE_SHARE || Math.abs(speed) > FLICK)) {
        dir = (Math.abs(speed) > FLICK ? speed : dx) < 0 ? 1 : -1;
      }
      settle(dir ? stepFrom(el, gesture.idx, dir) : gesture.idx);
    }
    vp.addEventListener('pointerup', release);
    vp.addEventListener('pointercancel', release);

    vp.addEventListener('click', function (e) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    var wheelLocked = false;
    var wheelSum = 0;
    var wheelTimer = 0;
    vp.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelLocked = false; wheelSum = 0; }, 220);
      if (wheelLocked) return;
      wheelSum += e.deltaX;
      if (Math.abs(wheelSum) < 24) return;
      wheelLocked = true;
      var idx = computeIndex(el);
      var to = stepFrom(el, idx, wheelSum > 0 ? 1 : -1);
      if (to !== idx) goTo(el, to);
    }, { passive: false });
  }

  function removeControls(el) {
    ['track-arrows', 'track-dots', 'track-caption'].forEach(function (cls) {
      var n = el.querySelector(':scope > .' + cls);
      if (n) n.parentNode.removeChild(n);
    });
  }

  function apply(el) {
    if (!el) return;
    var mode = String(el.getAttribute('data-track-mode') || '').toLowerCase();

    if (mode !== 'carousel') {
      removeControls(el);
      el.__ccLastIndex = undefined;
      el.__ccLastCount = undefined;
      return;
    }

    var vp = viewportOf(el);
    if (!vp) return;

    var controlsAttr = String(el.getAttribute('data-track-controls') || 'arrows').toLowerCase();
    var wantArrows  = controlsAttr === 'arrows' || controlsAttr === 'both';
    var wantDots    = controlsAttr === 'dots'   || controlsAttr === 'both';
    var wantCaption = boolAttr(el, 'data-track-captions', false);

    if (!wantArrows) {
      var a = el.querySelector(':scope > .track-arrows');
      if (a) a.parentNode.removeChild(a);
    }
    if (!wantDots) {
      var d = el.querySelector(':scope > .track-dots');
      if (d) d.parentNode.removeChild(d);
    }
    if (!wantCaption) {
      var c = el.querySelector(':scope > .track-caption');
      if (c) c.parentNode.removeChild(c);
    }

    if (wantArrows) buildArrows(el);
    if (wantDots) buildDots(el);
    if (wantCaption) buildCaption(el);

    if (!vp.__ccBoundScroll) {
      vp.__ccBoundScroll = true;
      var pending = false;
      vp.addEventListener('scroll', function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          refreshControls(el);
        });
      }, { passive: true });
    }
    swipeOne(el, vp);

    var start = Math.max(1, parseInt(el.getAttribute('data-track-start'), 10) || 1);
    if (el.__ccStart !== start) {
      el.__ccStart = start;
      var slides = slidesOf(el);
      var first = slides[Math.min(slides.length, start) - 1];
      if (first) vp.scrollLeft = first.offsetLeft;
    }

    el.__ccLastIndex = undefined;
    el.__ccLastCount = undefined;
    refreshControls(el);
  }

  window.CarouselControls = { apply: apply, goTo: goTo, index: computeIndex };

  function applyAll() {
    document.querySelectorAll('.scroll-track').forEach(function (el) {
      try { apply(el); } catch (e) { console.error(e); }
    });
    var queued = window.__ccLoading;
    window.__ccLoading = null;
    (queued || []).forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll);
  else applyAll();
})();
