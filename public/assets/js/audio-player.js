(function () {
  'use strict';

  if (!window.MediaSettings) {
    (function () {
      var KEY = 'site.media.v1';
      var DEFAULTS = { volume: 0.5, muted: false };
      function clamp01(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : null; }
      function read() {
        try {
          var raw = localStorage.getItem(KEY);
          if (!raw) {
            try { localStorage.setItem(KEY, JSON.stringify(DEFAULTS)); } catch (e) {}
            return { volume: DEFAULTS.volume, muted: DEFAULTS.muted };
          }
          var p = JSON.parse(raw);
          var v = clamp01(p.volume);
          return { volume: v == null ? DEFAULTS.volume : v, muted: !!p.muted };
        } catch (e) { return { volume: DEFAULTS.volume, muted: DEFAULTS.muted }; }
      }
      var state = read();
      var listeners = new Set();
      function write() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
      function notify() { listeners.forEach(function (fn) { try { fn(state.volume, state.muted); } catch (e) {} }); }
      window.MediaSettings = {
        getVolume:          function () { return state.volume; },
        isMuted:            function () { return state.muted; },
        getEffectiveVolume: function () { return state.muted ? 0 : state.volume; },
        setVolume: function (v) {
          v = clamp01(v); if (v == null) return state;
          var m = (state.muted && v > 0) ? false : state.muted;
          if (v === state.volume && m === state.muted) return state;
          state.volume = v; state.muted = m; write(); notify(); return state;
        },
        setMuted: function (m) {
          m = !!m;
          if (m === state.muted) return state;
          state.muted = m; write(); notify(); return state;
        },
        toggleMuted: function () { return window.MediaSettings.setMuted(!state.muted); },
        onVolumeChange: function (fn) {
          if (typeof fn !== 'function') return function () {};
          listeners.add(fn);
          return function () { listeners.delete(fn); };
        },
      };
    })();
  }

  function inEditorMode() {
    try {
      return !!(document.documentElement &&
                document.documentElement.classList.contains('in-editor'));
    } catch (e) { return false; }
  }

  function currentBodyLang() {
    try { return (document.body && document.body.getAttribute('data-lang')) || 'en'; }
    catch (e) { return 'en'; }
  }

  function currentBodyDefaultLang() {
    try { return (document.body && document.body.getAttribute('data-lang-default')) || 'en'; }
    catch (e) { return 'en'; }
  }

  function resolveLangAttr(el, base) {
    var lang = currentBodyLang();
    var def = currentBodyDefaultLang();
    if (lang && lang !== def) {
      var v = el.getAttribute(base + '-' + lang);
      if (v != null && v !== '') return v;
    }
    var base = el.getAttribute(base) || '';
    if (base.trim()) return base;
    var langs = ((document.body && document.body.getAttribute('data-lang-available')) || '').split(/\s+/);
    for (var i = 0; i < langs.length; i++) {
      var other = langs[i] ? el.getAttribute(base + '-' + langs[i]) : null;
      if (other && other.trim()) return other;
    }
    return base;
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var SVG_PLAY  = '<svg class="ap-icon-play"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PAUSE = '<svg class="ap-icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var SVG_VOL   = '<svg class="ap-icon-vol"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06a8.5 8.5 0 000-17.54z"/></svg>';
  var SVG_MUTE  = '<svg class="ap-icon-mute" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.5-2.5-1.41-1.41L18 10.59l-2.59-2.5L14 9.5 16.59 12 14 14.5l1.41 1.41L18 13.41l2.59 2.5L22 14.5 19.41 12z"/></svg>';

  function buildControls() {
    var controls = document.createElement('div');
    controls.className = 'audio-player-controls';
    controls.innerHTML =
      '<button type="button" class="audio-player-btn audio-player-play" aria-label="Play">' +
        SVG_PLAY + SVG_PAUSE +
      '</button>' +
      '<div class="audio-player-seek">' +
        '<div class="audio-player-seek-track">' +
          '<div class="audio-player-seek-load"></div>' +
          '<div class="audio-player-seek-fill"></div>' +
          '<div class="audio-player-seek-thumb"></div>' +
        '</div>' +
      '</div>' +
      '<div class="audio-player-time">' +
        '<span class="ap-time-current">0:00</span>' +
        '<span class="ap-time-sep"> / </span>' +
        '<span class="ap-time-total">0:00</span>' +
      '</div>' +
      '<button type="button" class="audio-player-btn audio-player-vol" aria-label="Mute">' +
        SVG_VOL + SVG_MUTE +
      '</button>' +
      '<input type="range" class="audio-player-vol-slider" min="0" max="1" step="0.01" value="0.5" aria-label="Volume">';

    var seal = function (n) {
      n.setAttribute('data-gjs-selectable', 'false');
      n.setAttribute('data-gjs-draggable',  'false');
      n.setAttribute('data-gjs-droppable',  'false');
      n.setAttribute('data-gjs-copyable',   'false');
      n.setAttribute('data-gjs-removable',  'false');
    };
    seal(controls);
    controls.querySelectorAll('button, input, .audio-player-seek').forEach(seal);
    return controls;
  }

  function refreshVolIcon(root) {
    var a = root.__apAudio;
    if (!a) return;
    var iv = root.querySelector('.ap-icon-vol');
    var im = root.querySelector('.ap-icon-mute');
    var muted = a.muted || a.volume === 0;
    if (iv) iv.style.display = muted ? 'none' : '';
    if (im) im.style.display = muted ? ''     : 'none';
  }

  function syncOnePlayer(player) {
    var MS = window.MediaSettings;
    if (!MS) return;
    var a = player.__apAudio;
    if (!a) return;
    a.volume = MS.getVolume();
    a.muted  = MS.isMuted();
    var slider = player.querySelector('.audio-player-vol-slider');
    if (slider) {
      var sv = parseFloat(slider.value);
      if (!isFinite(sv) || Math.abs(sv - MS.getVolume()) > 0.001) {
        slider.value = String(MS.getVolume());
      }
    }
    refreshVolIcon(player);
  }

  if (!window.__apGlobalVolumeSyncAttached) {
    window.__apGlobalVolumeSyncAttached = true;
    if (window.MediaSettings && typeof window.MediaSettings.onVolumeChange === 'function') {
      window.MediaSettings.onVolumeChange(function () {
        document.querySelectorAll('.audio-player:not(.audio-player--editor)')
          .forEach(syncOnePlayer);
      });
    }
  }

  function setLoadProgress(root, ratio) {
    var bar = root.querySelector('.audio-player-seek-load');
    if (!bar) return;
    if (ratio < 0) {
      bar.classList.add('is-indeterminate');
      bar.style.width = '100%';
    } else {
      bar.classList.remove('is-indeterminate');
      bar.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
    }
  }

  function loadBlob(url, onProgress, signal) {
    return fetch(url, {
      credentials: 'same-origin',
      signal: signal,
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);

      var total = parseInt(res.headers.get('Content-Length') || '0', 10);
      var contentType = res.headers.get('Content-Type') || '';

      if (!res.body || typeof res.body.getReader !== 'function') {
        return res.blob().then(function (blob) {
          if (onProgress) onProgress(1);
          return URL.createObjectURL(blob);
        });
      }

      var reader = res.body.getReader();
      var chunks = [];
      var received = 0;

      return new Promise(function (resolve, reject) {
        function pump() {
          reader.read().then(function (r) {
            if (r.done) {
              var blob = new Blob(chunks, contentType ? { type: contentType } : undefined);
              resolve(URL.createObjectURL(blob));
              return;
            }
            chunks.push(r.value);
            received += r.value.length;
            if (onProgress) {
              onProgress(total > 0 ? received / total : -1);
            }
            pump();
          }, reject);
        }
        pump();
      });
    });
  }

  function wireControls(root, controls, audio) {
    if (audio.__apHandlers) {
      var h = audio.__apHandlers;
      Object.keys(h).forEach(function (k) {
        audio.removeEventListener(k, h[k]);
      });
      audio.__apHandlers = null;
    }

    var playBtn   = controls.querySelector('.audio-player-play');
    var seek      = controls.querySelector('.audio-player-seek');
    var fill      = controls.querySelector('.audio-player-seek-fill');
    var thumb     = controls.querySelector('.audio-player-seek-thumb');
    var curEl     = controls.querySelector('.ap-time-current');
    var totEl     = controls.querySelector('.ap-time-total');
    var volBtn    = controls.querySelector('.audio-player-vol');
    var volSlider = controls.querySelector('.audio-player-vol-slider');

    var iconPlay  = playBtn.querySelector('.ap-icon-play');
    var iconPause = playBtn.querySelector('.ap-icon-pause');

    var dragging = false;

    function refreshPlayIcon() {
      var playing = !audio.paused && !audio.ended;
      if (iconPlay)  iconPlay.style.display  = playing ? 'none' : '';
      if (iconPause) iconPause.style.display = playing ? ''     : 'none';
    }

    function updateFill() {
      var dur = audio.duration;
      var cur = audio.currentTime;
      var pct = (isFinite(dur) && dur > 0) ? (cur / dur) * 100 : 0;

      if (audio.ended && isFinite(dur) && dur > 0 && cur >= dur - 0.05) pct = 100;
      if (fill)  fill.style.width  = pct + '%';
      if (thumb) thumb.style.left  = pct + '%';
      if (curEl) curEl.textContent = fmt(audio.ended && isFinite(dur) ? dur : cur);
      if (totEl) totEl.textContent = isFinite(dur) && dur > 0 ? fmt(dur) : '0:00';
    }

    var rafId = null;
    function tick() {
      updateFill();
      if (!audio.paused && !audio.ended) rafId = requestAnimationFrame(tick);
      else rafId = null;
    }
    function startTick() { if (rafId == null && !audio.paused && !audio.ended) rafId = requestAnimationFrame(tick); }
    function stopTick()  { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

    if (volSlider) {
      volSlider.addEventListener('input', function () {
        var v = parseFloat(volSlider.value);
        if (!isFinite(v)) v = 0.5;
        v = Math.max(0, Math.min(1, v));
        audio.volume = v;
        if (v > 0 && audio.muted) audio.muted = false;
        refreshVolIcon(root);
        if (window.MediaSettings) window.MediaSettings.setVolume(v);
      });
    }

    if (volBtn) {
      volBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var MS = window.MediaSettings;
        var currentlyMuted = MS ? MS.isMuted() : audio.muted;
        var next = !currentlyMuted;
        audio.muted = next;
        refreshVolIcon(root);
        if (MS) MS.setMuted(next);
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (root.classList.contains('is-unavailable')) return;
        if (audio.ended) audio.currentTime = 0;
        if (audio.paused || audio.ended) {
          var p = audio.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } else {
          audio.pause();
        }
      });
    }

    function seekFromEvent(ev) {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      var rect = seek.getBoundingClientRect();
      var x = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var ratio = Math.max(0, Math.min(1, x / rect.width));
      var target = ratio * audio.duration;
      if (audio.seekable && audio.seekable.length > 0) {
        var sMin = audio.seekable.start(0);
        var sMax = audio.seekable.end(audio.seekable.length - 1);
        target = Math.max(sMin, Math.min(sMax, target));
      }
      try { audio.currentTime = target; } catch (e) {}
      updateFill();
    }

    var wasPlayingBeforeDrag = false;
    function onSeekDown(ev) {
      if (ev.cancelable) ev.preventDefault();
      dragging = true;
      wasPlayingBeforeDrag = !audio.paused && !audio.ended;
      if (wasPlayingBeforeDrag) audio.pause();
      seek.classList.add('is-dragging');
      seekFromEvent(ev);
    }
    function onSeekMove(ev) {
      if (dragging) seekFromEvent(ev);
    }
    function onSeekUp() {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove('is-dragging');
      updateFill();
      if (wasPlayingBeforeDrag) {
        wasPlayingBeforeDrag = false;
        var p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    }

    if (seek) {
      seek.addEventListener('mousedown', onSeekDown);
      seek.addEventListener('touchstart', onSeekDown, { passive: false });
      window.addEventListener('mousemove', onSeekMove);
      window.addEventListener('touchmove', onSeekMove, { passive: true });
      window.addEventListener('mouseup', onSeekUp);
      window.addEventListener('touchend', onSeekUp);
      window.addEventListener('touchcancel', onSeekUp);

      seek.tabIndex = 0;
      seek.setAttribute('role', 'slider');
      seek.setAttribute('aria-label', 'Seek');
      seek.addEventListener('keydown', function (ev) {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        var step = ev.shiftKey ? 10 : 5;
        if (ev.key === 'ArrowRight')      { audio.currentTime = Math.min(audio.duration, audio.currentTime + step); updateFill(); ev.preventDefault(); }
        else if (ev.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - step); updateFill(); ev.preventDefault(); }
        else if (ev.key === 'Home')       { audio.currentTime = 0; updateFill(); ev.preventDefault(); }
        else if (ev.key === 'End')        { audio.currentTime = audio.duration; updateFill(); ev.preventDefault(); }
      });
    }

    var handlers = {
      play: function () { refreshPlayIcon(); updateFill(); startTick(); },
      playing: startTick,
      pause: function () {
        refreshPlayIcon();
        stopTick();
        requestAnimationFrame(updateFill);
      },
      ended: function () {
        refreshPlayIcon();
        stopTick();
        updateFill();
      },
      durationchange: function () { updateFill(); },
      loadedmetadata: function () { updateFill(); },
      timeupdate:     function () { if (rafId == null) updateFill(); },
      seeking:        function () { if (rafId == null) updateFill(); },
      seeked:         function () { if (rafId == null) updateFill(); },
      volumechange:   function () {
        refreshVolIcon(root);
        var MS = window.MediaSettings;
        if (!MS) return;
        if (audio.muted !== MS.isMuted())     MS.setMuted(audio.muted);
        if (audio.volume !== MS.getVolume())  MS.setVolume(audio.volume);
      },
    };
    Object.keys(handlers).forEach(function (k) { audio.addEventListener(k, handlers[k]); });
    audio.__apHandlers = handlers;

    refreshPlayIcon();
    updateFill();
  }

  function setUnavailable(el, off) {
    el.classList.toggle('is-unavailable', off);
    var controls = el.querySelector(':scope > .audio-player-controls');
    if (controls) {
      if (off) controls.setAttribute('aria-disabled', 'true');
      else controls.removeAttribute('aria-disabled');
    }
  }

  function apply(el) {
    if (!el) return;

    var src = resolveLangAttr(el, 'data-src').trim();
    var inEditor = inEditorMode();
    if (seen && !inEditor && !el.__apObserved) {
      el.__apObserved = true;
      seen.observe(el);
    }

    var audio = el.__apAudio;
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      el.__apAudio = audio;
    }
    if (audio.parentNode !== el) {
      el.appendChild(audio);
    }

    var controls = el.querySelector(':scope > .audio-player-controls');
    if (!controls) {
      controls = buildControls();
      el.appendChild(controls);
      controls.__apWired = false;
    }

    setUnavailable(el, !src);
    if (!audio.__apErrorBound) {
      audio.__apErrorBound = true;
      audio.addEventListener('error', function () {
        if (audio.getAttribute('src')) setUnavailable(el, true);
      });
      audio.addEventListener('loadedmetadata', function () { setUnavailable(el, false); });
    }

    if (inEditor) {
      el.classList.add('audio-player--editor');
      el.classList.remove('is-loading', 'is-pending');
      if (!controls.__apWired) {
        controls.__apWired = true;
        wireControls(el, controls, audio);
      }
      return;
    }
    el.classList.remove('audio-player--editor');

    if (!controls.__apWired) {
      controls.__apWired = true;
      wireControls(el, controls, audio);
    }

    syncOnePlayer(el);

    if (!src) {
      el.classList.remove('is-loading', 'is-pending');
      return;
    }
    if (audio.__apSrc === src && audio.__apBlobUrl) return;
    if (el.__apLoadingSrc === src) return;

    if (el.__apAbort) {
      try { el.__apAbort.abort(); } catch (e) {}
      el.__apAbort = null;
    }

    if (audio.__apBlobUrl) {
      try { URL.revokeObjectURL(audio.__apBlobUrl); } catch (e) {}
      audio.__apBlobUrl = null;
      audio.__apSrc = null;
    }

    el.classList.add('is-loading');
    el.classList.remove('is-pending');
    setLoadProgress(el, 0);

    try { if (!audio.paused) audio.pause(); } catch (e) {}
    audio.removeAttribute('src');
    try { audio.load(); } catch (e) {}

    el.__apLoadingSrc = src;
    var controller = new AbortController();
    el.__apAbort = controller;

    loadBlob(src, function (ratio) {
      if (controller.signal.aborted) return;
      setLoadProgress(el, ratio);
    }, controller.signal).then(function (blobUrl) {
      if (controller.signal.aborted) {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        return;
      }
      el.__apAbort = null;
      el.__apLoadingSrc = null;

      audio.__apBlobUrl = blobUrl;
      audio.__apSrc = src;
      audio.src = blobUrl;
      try { audio.load(); } catch (e) {}

      var onMeta = function () {
        audio.removeEventListener('loadedmetadata', onMeta);
        if (audio.__apSrc !== src) return;
        el.classList.remove('is-loading');
        setLoadProgress(el, 1);
      };
      audio.addEventListener('loadedmetadata', onMeta);

      setTimeout(function () {
        if (audio.__apSrc === src && el.classList.contains('is-loading')) {
          el.classList.remove('is-loading');
          setLoadProgress(el, 1);
        }
      }, 500);
    }).catch(function (err) {
      if (controller.signal.aborted) return;
      el.__apAbort = null;
      el.__apLoadingSrc = null;
      console.warn('[audio-player] blob load failed, falling back to direct src:', err);

      el.classList.remove('is-loading');
      audio.__apBlobUrl = null;
      audio.__apSrc = src;
      audio.src = src;
      try { audio.load(); } catch (e) {}
    });
  }

  function heldAway(el) {
    if (!el.getClientRects().length) return true;
    var r = el.getBoundingClientRect();
    for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.matches(':modal, :popover-open')) break;
      var cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      var c = p.getBoundingClientRect();
      if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return true;
    }
    return false;
  }
  var seen = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var el = en.target;
      var audio = el.__apAudio;
      if (en.isIntersecting || !audio || inEditorMode()) return;
      if (el.closest('.subpage[data-subpage-media="keep"]') || !heldAway(el)) return;
      try { audio.pause(); } catch (e) {}
      try { audio.currentTime = 0; } catch (e) {}
    });
  }, { threshold: 0 }) : null;

  function initAll() {
    document.querySelectorAll('.audio-player').forEach(apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    var lastMode = inEditorMode();
    new MutationObserver(function () {
      var now = inEditorMode();
      if (now === lastMode) return;
      lastMode = now;
      initAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes'
            && m.attributeName === 'data-lang'
            && m.target === document.body) {
          initAll();
          return;
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['data-lang'] });
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (!m.addedNodes) return;
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.classList && n.classList.contains('audio-player')) apply(n);
          else if (n.querySelectorAll) n.querySelectorAll('.audio-player').forEach(apply);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.AudioPlayer = { apply: apply, initAll: initAll };
})();
