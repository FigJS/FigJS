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

  var FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v|mkv)$/i;

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

  function resolveLangAttr(el, baseName) {
    var lang = currentBodyLang();
    var def = currentBodyDefaultLang();
    if (lang && lang !== def) {
      var v = el.getAttribute(baseName + '-' + lang);
      if (v != null && v !== '') return v;
    }
    var base = el.getAttribute(baseName) || '';
    if (base.trim()) return base;
    var langs = ((document.body && document.body.getAttribute('data-lang-available')) || '').split(/\s+/);
    for (var i = 0; i < langs.length; i++) {
      var other = langs[i] ? el.getAttribute(baseName + '-' + langs[i]) : null;
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

  function detectType(url) {
    if (!url) return null;
    var u = url.trim();
    if (!u) return null;
    if (/youtube\.com\/(?:watch\?|embed\/|shorts\/|live\/)/.test(u) || /youtu\.be\//.test(u)) return 'youtube';
    if (/vimeo\.com\//.test(u)) return 'vimeo';
    var clean = u.split('?')[0].split('#')[0];
    if (FILE_RE.test(clean)) return 'file';
    return 'iframe';
  }

  function extractYouTubeId(url) {
    var m = url.match(/(?:youtube\.com\/(?:embed|shorts|live)\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
         || url.match(/youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function extractVimeoId(url) {
    var m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function getEmbedUrl(url, type) {
    if (type === 'youtube') {
      var id = extractYouTubeId(url);
      if (id) return 'https://www.youtube.com/embed/' + id;
    }
    if (type === 'vimeo') {
      var vid = extractVimeoId(url);
      if (vid) return 'https://player.vimeo.com/video/' + vid;
    }
    return url;
  }

  function isSameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; }
    catch (e) { return false; }
  }

  function sealDroppable(el) {
    el.setAttribute('data-gjs-selectable', 'false');
    el.setAttribute('data-gjs-draggable',  'false');
    el.setAttribute('data-gjs-droppable',  'false');
  }

  var SVG_PLAY  = '<svg class="vp-icon-play"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PAUSE = '<svg class="vp-icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var SVG_VOL   = '<svg class="vp-icon-vol"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06a8.5 8.5 0 000-17.54z"/></svg>';
  var SVG_MUTE  = '<svg class="vp-icon-mute" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.5-2.5-1.41-1.41L18 10.59l-2.59-2.5L14 9.5 16.59 12 14 14.5l1.41 1.41L18 13.41l2.59 2.5L22 14.5 19.41 12z"/></svg>';
  var SVG_FS    = '<svg class="vp-icon-fs"      viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm0-4V7h3V5H5v5h2zm10 7h-3v2h5v-5h-2v3zm-3-12v2h3v3h2V5h-5z"/></svg>';
  var SVG_EXFS  = '<svg class="vp-icon-exit-fs" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>';

  function refreshVpVolIcon(player) {
    var v = player.querySelector('video');
    if (!v) return;
    var iv = player.querySelector('.vp-icon-vol');
    var im = player.querySelector('.vp-icon-mute');
    var muted = v.muted || v.volume === 0;
    if (iv) iv.style.display = muted ? 'none' : '';
    if (im) im.style.display = muted ? ''     : 'none';
  }

  function syncOnePlayer(player) {
    var MS = window.MediaSettings;
    if (!MS) return;
    var v = player.querySelector('video');
    if (!v) return;
    if (v.__authorMuted) return;
    v.volume = MS.getVolume();
    v.muted  = MS.isMuted();
    var slider = player.querySelector('.vp-vol-slider');
    if (slider) {
      var sv = parseFloat(slider.value);
      if (!isFinite(sv) || Math.abs(sv - MS.getVolume()) > 0.001) {
        slider.value = String(MS.getVolume());
      }
    }
    refreshVpVolIcon(player);
  }

  if (!window.__vpGlobalVolumeSyncAttached) {
    window.__vpGlobalVolumeSyncAttached = true;
    if (window.MediaSettings && typeof window.MediaSettings.onVolumeChange === 'function') {
      window.MediaSettings.onVolumeChange(function () {
        document.querySelectorAll('.video-player').forEach(syncOnePlayer);
      });
    }
  }

  function setLoadProgress(wrap, ratio) {
    var bar = wrap.querySelector('.vp-seek-load');
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
            if (onProgress) onProgress(total > 0 ? received / total : -1);
            pump();
          }, reject);
        }
        pump();
      });
    });
  }

  function makeVideoElement(attrs, isEditor) {
    var v = document.createElement('video');
    v.playsInline = true;

    var autoplay    = attrs.autoplay === 'true' && !isEditor;
    var loop        = attrs.loop === 'true';
    var mutedAttr   = attrs.muted === 'true' || isEditor;
    var explicitNoMute = attrs.muted === 'false' && !isEditor;
    var authorMuted = mutedAttr || (autoplay && !explicitNoMute);
    if (authorMuted) v.__authorMuted = true;

    v.autoplay = autoplay && !seen;
    v.__vpAuto = autoplay;
    v.__vpFresh = true;
    v.loop     = loop;
    v.muted    = authorMuted;

    if (!authorMuted) {
      var MS = window.MediaSettings;
      if (MS) {
        v.volume = MS.getVolume();
        v.muted  = MS.isMuted();
      } else {
        v.volume = 0.5;
      }
    }

    v.preload = 'auto';

    v.addEventListener('volumechange', function () {
      if (v.__authorMuted || isEditor) return;
      refreshVpVolIcon(v.parentElement || v);
      var MS = window.MediaSettings;
      if (!MS) return;
      if (v.muted !== MS.isMuted())    MS.setMuted(v.muted);
      if (v.volume !== MS.getVolume()) MS.setVolume(v.volume);
    });

    if (attrs.poster) v.poster = attrs.poster;

    sealDroppable(v);
    return v;
  }

  function makeNativeFilePlayer(attrs, isEditor) {
    var v = makeVideoElement(attrs, isEditor);
    v.controls = true;
    return v;
  }

  function makeNoUiFilePlayer(attrs, isEditor) {
    var v = makeVideoElement(attrs, isEditor);
    v.controls = false;
    return v;
  }

  function makeCustomFilePlayer(attrs, isEditor) {
    var wrap = document.createElement('div');
    wrap.className = 'vp-custom-ui';

    var v = makeVideoElement(attrs, isEditor);
    v.controls = false;
    wrap.appendChild(v);

    var controls = document.createElement('div');
    controls.className = 'vp-controls';
    controls.innerHTML =
      '<button type="button" class="vp-btn vp-play" aria-label="Play">' +
        SVG_PLAY + SVG_PAUSE +
      '</button>' +
      '<div class="vp-seek">' +
        '<div class="vp-seek-track">' +
          '<div class="vp-seek-load"></div>' +
          '<div class="vp-seek-fill"></div>' +
          '<div class="vp-seek-thumb"></div>' +
        '</div>' +
      '</div>' +
      '<div class="vp-time">' +
        '<span class="vp-time-current">0:00</span>' +
        '<span class="vp-time-sep"> / </span>' +
        '<span class="vp-time-total">0:00</span>' +
      '</div>' +
      '<button type="button" class="vp-btn vp-vol" aria-label="Mute">' +
        SVG_VOL + SVG_MUTE +
      '</button>' +
      '<input type="range" class="vp-vol-slider" min="0" max="1" step="0.01" value="0.5" aria-label="Volume">' +
      '<button type="button" class="vp-btn vp-fullscreen" aria-label="Fullscreen">' +
        SVG_FS + SVG_EXFS +
      '</button>';

    wrap.appendChild(controls);

    if (isEditor) {
      wrap.classList.add('vp-editor-inert', 'vp-controls-visible');
    } else {
      wireCustomControls(wrap, v);
    }
    return wrap;
  }

  function wireCustomControls(wrap, v) {
    var playBtn   = wrap.querySelector('.vp-play');
    var seek      = wrap.querySelector('.vp-seek');
    var fill      = wrap.querySelector('.vp-seek-fill');
    var thumb     = wrap.querySelector('.vp-seek-thumb');
    var curEl     = wrap.querySelector('.vp-time-current');
    var totEl     = wrap.querySelector('.vp-time-total');
    var volBtn    = wrap.querySelector('.vp-vol');
    var volSlider = wrap.querySelector('.vp-vol-slider');
    var fsBtn     = wrap.querySelector('.vp-fullscreen');

    var iconPlay  = playBtn.querySelector('.vp-icon-play');
    var iconPause = playBtn.querySelector('.vp-icon-pause');
    var iconFs    = fsBtn.querySelector('.vp-icon-fs');
    var iconExFs  = fsBtn.querySelector('.vp-icon-exit-fs');

    if (!v.__authorMuted) {
      var MS = window.MediaSettings;
      var initVol = MS ? MS.getVolume() : (v.volume || 0.5);
      volSlider.value = String(initVol);
      if (MS) v.muted = MS.isMuted();
    } else {
      volSlider.value = '0';
    }
    refreshVpVolIcon(wrap);

    var dragging = false;

    function refreshPlayIcon() {
      var playing = !v.paused && !v.ended;
      if (iconPlay)  iconPlay.style.display  = playing ? 'none' : '';
      if (iconPause) iconPause.style.display = playing ? ''     : 'none';
    }

    function updateFill() {
      var dur = v.duration;
      var cur = v.currentTime;
      var pct = (isFinite(dur) && dur > 0) ? (cur / dur) * 100 : 0;
      if (v.ended && isFinite(dur) && dur > 0 && cur >= dur - 0.05) pct = 100;
      if (fill)  fill.style.width = pct + '%';
      if (thumb) thumb.style.left = pct + '%';
      if (curEl) curEl.textContent = fmt(v.ended && isFinite(dur) ? dur : cur);
      if (totEl) totEl.textContent = isFinite(dur) && dur > 0 ? fmt(dur) : '0:00';
    }

    var rafId = null;
    function tick() {
      updateFill();
      if (!v.paused && !v.ended) rafId = requestAnimationFrame(tick);
      else rafId = null;
    }
    function startTick() { if (rafId == null && !v.paused && !v.ended) rafId = requestAnimationFrame(tick); }
    function stopTick()  { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

    var idleTimer = null;
    function reveal() {
      wrap.classList.add('vp-controls-visible');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (!v.paused && !v.ended) wrap.classList.remove('vp-controls-visible');
      }, 2500);
    }
    function hideNow() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (!v.paused && !v.ended) wrap.classList.remove('vp-controls-visible');
    }

    wrap.addEventListener('mousemove', reveal);
    wrap.addEventListener('mouseenter', reveal);
    wrap.addEventListener('mouseleave', function () {
      if (!v.paused) hideNow();
    });

    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (v.ended) v.currentTime = 0;
      if (v.paused || v.ended) {
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } else {
        v.pause();
      }
    });

    v.addEventListener('click', function (e) {
      e.preventDefault();
      if (v.paused || v.ended) {
        if (v.ended) v.currentTime = 0;
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } else {
        v.pause();
      }
    });

    v.addEventListener('play',    function () { refreshPlayIcon(); updateFill(); startTick(); reveal(); });
    v.addEventListener('playing', startTick);
    v.addEventListener('pause',   function () {
      refreshPlayIcon();
      stopTick();
      requestAnimationFrame(function () { updateFill(); reveal(); });
    });
    v.addEventListener('ended', function () {
      refreshPlayIcon();
      stopTick();
      updateFill();
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      wrap.classList.add('vp-controls-visible');
    });
    v.addEventListener('timeupdate',     function () { if (rafId == null) updateFill(); });
    v.addEventListener('durationchange', updateFill);
    v.addEventListener('loadedmetadata', updateFill);
    v.addEventListener('volumechange',   function () { refreshVpVolIcon(wrap); });

    function seekFromEvent(ev) {
      if (!isFinite(v.duration) || v.duration <= 0) return;
      var rect = seek.getBoundingClientRect();
      var x = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var ratio = Math.max(0, Math.min(1, x / rect.width));
      var target = ratio * v.duration;
      if (v.seekable && v.seekable.length > 0) {
        var sMin = v.seekable.start(0);
        var sMax = v.seekable.end(v.seekable.length - 1);
        target = Math.max(sMin, Math.min(sMax, target));
      }
      try { v.currentTime = target; } catch (e) {}
      updateFill();
    }

    var wasPlayingBeforeDrag = false;
    function onSeekDown(ev) {
      if (ev.cancelable) ev.preventDefault();
      dragging = true;
      wasPlayingBeforeDrag = !v.paused && !v.ended;
      if (wasPlayingBeforeDrag) v.pause();
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
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    }

    seek.addEventListener('mousedown', onSeekDown);
    seek.addEventListener('touchstart', onSeekDown, { passive: false });
    window.addEventListener('mousemove', onSeekMove);
    window.addEventListener('touchmove', onSeekMove, { passive: true });
    window.addEventListener('mouseup', onSeekUp);
    window.addEventListener('touchend', onSeekUp);
    window.addEventListener('touchcancel', onSeekUp);

    volSlider.addEventListener('input', function () {
      var val = parseFloat(volSlider.value);
      if (!isFinite(val)) val = 0.5;
      val = Math.max(0, Math.min(1, val));
      if (v.__authorMuted) {
        v.muted  = false;
        v.volume = val;
      } else {
        v.volume = val;
        if (val > 0 && v.muted) v.muted = false;
        refreshVpVolIcon(wrap);
        if (window.MediaSettings) window.MediaSettings.setVolume(val);
      }
      refreshVpVolIcon(wrap);
    });

    volBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (v.__authorMuted) {
        v.muted = !v.muted;
        refreshVpVolIcon(wrap);
        return;
      }
      var MS = window.MediaSettings;
      var next = !(MS ? MS.isMuted() : v.muted);
      v.muted = next;
      refreshVpVolIcon(wrap);
      if (MS) MS.setMuted(next);
    });

    var fsDoc = wrap.ownerDocument;
    var onFullscreenMouseMove = function () { reveal(); };
    var onFullscreenKey = function (e) {
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        if (v.paused || v.ended) {
          if (v.ended) v.currentTime = 0;
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        } else v.pause();
        reveal();
      } else if (e.key === 'ArrowRight' && isFinite(v.duration)) {
        v.currentTime = Math.min(v.duration, v.currentTime + 5); updateFill(); reveal(); e.preventDefault();
      } else if (e.key === 'ArrowLeft' && isFinite(v.duration)) {
        v.currentTime = Math.max(0, v.currentTime - 5); updateFill(); reveal(); e.preventDefault();
      } else if (e.key === 'm') { volBtn.click(); reveal(); }
      else if (e.key === 'f')   { fsBtn.click();  reveal(); }
    };

    fsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (fsDoc.fullscreenElement === wrap || fsDoc.webkitFullscreenElement === wrap) {
        if (fsDoc.exitFullscreen) fsDoc.exitFullscreen();
        else if (fsDoc.webkitExitFullscreen) fsDoc.webkitExitFullscreen();
      } else {
        var req = wrap.requestFullscreen
               || wrap.webkitRequestFullscreen
               || wrap.msRequestFullscreen;
        if (req) {
          var r = req.call(wrap);
          if (r && typeof r.catch === 'function') r.catch(function () {});
        }
      }
    });

    function onFsChange() {
      var isFs = (fsDoc.fullscreenElement === wrap)
              || (fsDoc.webkitFullscreenElement === wrap);
      if (iconFs)   iconFs.style.display   = isFs ? 'none' : '';
      if (iconExFs) iconExFs.style.display = isFs ? ''     : 'none';
      if (isFs) {
        fsDoc.addEventListener('mousemove', onFullscreenMouseMove);
        fsDoc.addEventListener('keydown',   onFullscreenKey);
        reveal();
      } else {
        fsDoc.removeEventListener('mousemove', onFullscreenMouseMove);
        fsDoc.removeEventListener('keydown',   onFullscreenKey);
      }
    }
    fsDoc.addEventListener('fullscreenchange', onFsChange);
    fsDoc.addEventListener('webkitfullscreenchange', onFsChange);

    refreshPlayIcon();
    updateFill();
    if (v.paused) wrap.classList.add('vp-controls-visible');
    setTimeout(updateFill, 50);
  }

  function makeEmpty() {
    var empty = document.createElement('div');
    empty.className = 'video-player-empty';
    sealDroppable(empty);
    empty.innerHTML =
      '<div class="vp-empty-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/></svg></div>' +
      '<div>No video source</div>' +
      '<div class="vp-empty-hint">Set the source in the Settings panel</div>';
    return empty;
  }

  function makeEditorFileStage(attrs) {
    var stage = document.createElement('div');
    stage.className = 'video-player-stage video-player-stage--editor';
    sealDroppable(stage);

    var uiMode = attrs.ui || 'custom';
    var player;
    if (uiMode === 'none')        player = makeNoUiFilePlayer(attrs, true);
    else if (uiMode === 'custom') player = makeCustomFilePlayer(attrs, true);
    else                          player = makeNativeFilePlayer(attrs, true);

    if (!player.classList.contains('vp-editor-inert')) {
      player.classList.add('vp-editor-inert');
    }

    stage.appendChild(player);
    return stage;
  }

  function makeLiveStage(attrs, isEditor) {
    var stage = document.createElement('div');
    stage.className = 'video-player-stage';
    sealDroppable(stage);

    var uiMode = attrs.ui || 'custom';
    var player;
    if (uiMode === 'none')        player = makeNoUiFilePlayer(attrs, isEditor);
    else if (uiMode === 'custom') player = makeCustomFilePlayer(attrs, isEditor);
    else                          player = makeNativeFilePlayer(attrs, isEditor);

    stage.appendChild(player);
    return stage;
  }

  var OPEN_PARAM = 'embeds';
  var RESUME_KEY = 'site-isolation-resume';

  function framingBlocked(url) {
    return self.crossOriginIsolated === true && !isSameOrigin(url)
      && !('credentialless' in HTMLIFrameElement.prototype);
  }

  function takeResume(kind) {
    try {
      var r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
      if (!r || r.kind !== kind || r.path !== location.pathname || Date.now() - r.at > 60000) return null;
      sessionStorage.removeItem(RESUME_KEY);
      return r.id || null;
    } catch (e) { return null; }
  }
  var resumeId = takeResume('video');

  function reveal(el) {
    var chain = [];
    for (var sp = el.closest('.subpage'); sp; sp = sp.parentElement && sp.parentElement.closest('.subpage')) {
      chain.unshift(sp);
    }
    if (chain.length && !window.SiteSubpage && document.readyState !== 'complete') {
      document.addEventListener('DOMContentLoaded', function () { reveal(el); }, { once: true });
      return;
    }
    if (window.SiteSubpage) chain.forEach(function (sp) { window.SiteSubpage.open(sp); });
    el.scrollIntoView({ block: 'center' });
  }

  function reloadUnisolated(el, src) {
    var url = new URL(location.href);
    var openElsewhere = function () { window.open(src, '_blank', 'noopener'); };
    if (url.searchParams.has(OPEN_PARAM) || !navigator.serviceWorker) { openElsewhere(); return; }
    navigator.serviceWorker.register('/isolation-sw.js').then(function () {
      return Promise.race([
        navigator.serviceWorker.ready,
        new Promise(function (resolve) { setTimeout(resolve, 3000); }),
      ]);
    }).then(function () {
      try {
        sessionStorage.setItem(RESUME_KEY, JSON.stringify(
          { kind: 'video', id: el.id, path: location.pathname, at: Date.now() }));
      } catch (e) {}
      url.searchParams.set(OPEN_PARAM, 'open');
      location.replace(url.href);
    }, openElsewhere);
  }

  function withAutoplay(url, type) {
    if (type !== 'youtube' && type !== 'vimeo') return url;
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
  }

  function makeBlockedStage(el, src, type, attrs, isEditor) {
    var stage = document.createElement('div');
    stage.className = 'video-player-stage vp-blocked' +
      (isEditor ? ' video-player-stage--editor vp-editor-inert' : '');
    sealDroppable(stage);

    var thumb = attrs.poster;
    if (!thumb && type === 'youtube') {
      var ytId = extractYouTubeId(src);
      if (ytId) thumb = 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg';
    }
    if (thumb) {
      var img = document.createElement('img');
      img.className = 'vp-blocked-thumb';
      img.src = thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      stage.appendChild(img);
    }

    var label = 'Load ' + ({ youtube: 'YouTube player', vimeo: 'Vimeo player' }[type] || 'embed');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vp-blocked-load';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span></span>';
    btn.querySelector('span').textContent = label;
    if (!isEditor) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        reloadUnisolated(el, src);
      });
    }
    stage.appendChild(btn);
    return stage;
  }

  function makeIframeStage(el, src, type, attrs, isEditor) {
    var url = getEmbedUrl(src, type);
    if (framingBlocked(url)) return makeBlockedStage(el, src, type, attrs, isEditor);

    var stage = document.createElement('div');
    stage.className = 'video-player-stage' + (isEditor ? ' video-player-stage--editor' : '');
    sealDroppable(stage);

    if (!isEditor && el.id && el.id === resumeId) {
      resumeId = null;
      url = withAutoplay(url, type);
      setTimeout(function () { reveal(el); }, 0);
    }

    var f = document.createElement('iframe');
    if (!isSameOrigin(url)) f.setAttribute('credentialless', '');
    if (isEditor) {
      f.classList.add('vp-editor-inert');
      f.tabIndex = -1;
    }
    f.src = url;
    if (attrs.allowFullscreen !== 'false') f.setAttribute('allowfullscreen', '');
    f.setAttribute('allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    stage.appendChild(f);
    return stage;
  }

  function apply(el) {
    if (!el) return;

    var src = resolveLangAttr(el, 'data-src').trim();
    var poster = resolveLangAttr(el, 'data-poster');
    var explicit = el.getAttribute('data-type') || 'auto';
    var type = explicit === 'auto' ? detectType(src) : explicit;
    var inEditor = inEditorMode();

    var attrs = {
      poster: poster,
      autoplay: el.getAttribute('data-autoplay') || '',
      loop:     el.getAttribute('data-loop')     || '',
      muted:    el.getAttribute('data-muted')    || '',
      ui:       el.getAttribute('data-ui')       || 'custom',
      allowFullscreen: el.getAttribute('data-allow-fullscreen'),
    };

    if (seen && !inEditor && !el.__vpObserved) {
      el.__vpObserved = true;
      seen.observe(el);
    }

    var signature = src + '|' + type + '|' + (attrs.ui) + '|' + (inEditor ? 'ed' : 'live');
    if (el.__vpSignature === signature && el.querySelector('.video-player-stage, .video-player-empty')) {
      return;
    }
    el.__vpSignature = signature;

    var existingVideo = el.querySelector('video');
    if (existingVideo) {
      try { if (!existingVideo.paused) existingVideo.pause(); } catch (e) {}
      try { existingVideo.currentTime = 0; } catch (e) {}
      if (existingVideo.__vpBlobUrl) {
        try { URL.revokeObjectURL(existingVideo.__vpBlobUrl); } catch (e) {}
        existingVideo.__vpBlobUrl = null;
      }
    }
    if (el.__vpAbort) {
      try { el.__vpAbort.abort(); } catch (e) {}
      el.__vpAbort = null;
    }
    el.querySelectorAll(':scope > .video-player-stage, :scope > .video-player-empty')
      .forEach(function (n) { n.parentNode.removeChild(n); });

    if (!src) {
      el.classList.remove('is-loading');
      el.appendChild(makeEmpty());
      return;
    }

    if (type !== 'file') {
      el.classList.remove('is-loading');
      el.appendChild(makeIframeStage(el, src, type, attrs, inEditor));
      return;
    }

    var liveStage;
    if (inEditor) {
      liveStage = makeEditorFileStage(attrs);
      el.appendChild(liveStage);
      el.classList.remove('is-loading');
      return;
    }

    liveStage = makeLiveStage(attrs, false);
    el.appendChild(liveStage);

    var v = liveStage.querySelector('video');
    if (!v) return;

    el.classList.add('is-loading');
    var customWrap = liveStage.querySelector('.vp-custom-ui');
    setLoadProgress(customWrap || liveStage, 0);

    var controller = new AbortController();
    el.__vpAbort = controller;

    loadBlob(src, function (ratio) {
      if (controller.signal.aborted) return;
      setLoadProgress(customWrap || liveStage, ratio);
    }, controller.signal).then(function (blobUrl) {
      if (controller.signal.aborted) {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        return;
      }
      el.__vpAbort = null;

      v.__vpBlobUrl = blobUrl;
      v.src = blobUrl;
      try { v.load(); } catch (e) {}
      startIfShown(el, v);

      var onMeta = function () {
        v.removeEventListener('loadedmetadata', onMeta);
        el.classList.remove('is-loading');
        setLoadProgress(customWrap || liveStage, 1);
      };
      v.addEventListener('loadedmetadata', onMeta);

      setTimeout(function () {
        if (v.__vpBlobUrl === blobUrl && el.classList.contains('is-loading')) {
          el.classList.remove('is-loading');
          setLoadProgress(customWrap || liveStage, 1);
        }
      }, 500);
    }).catch(function (err) {
      if (controller.signal.aborted) return;
      el.__vpAbort = null;
      console.warn('[video-player] blob load failed, falling back to direct src:', err);
      el.classList.remove('is-loading');
      v.src = src;
      try { v.load(); } catch (e) {}
      startIfShown(el, v);
    });
  }

  function onSeen(entries) {
    entries.forEach(function (en) {
      var el = en.target;
      var shown = en.isIntersecting;
      if (shown === el.__vpShown) return;
      el.__vpShown = shown;
      if (shown) reshow(el);
      else conceal(el);
    });
  }
  var seen = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(onSeen, { threshold: 0 }) : null;

  function keeps(el) { return !!el.closest('.subpage[data-subpage-media="keep"]'); }

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

  function play(v) {
    var p = v.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function startIfShown(el, v) {
    if (!el.__vpShown || !v.__vpAuto || !v.__vpFresh || inEditorMode()) return;
    if (!v.getAttribute('src')) return;
    v.__vpFresh = false;
    try { v.currentTime = 0; } catch (e) {}
    play(v);
  }

  function conceal(el) {
    if (inEditorMode() || keeps(el)) return;
    var held = heldAway(el);
    var v = el.querySelector('video');
    if (v && held) {
      try { v.pause(); } catch (e) {}
      try { v.currentTime = 0; } catch (e) {}
      v.__vpFresh = true;
      v.__vpResume = false;
    } else if (v && v.__vpAuto && !v.paused) {
      v.__vpResume = true;
      try { v.pause(); } catch (e) {}
    }
    if (!held) return;
    el.querySelectorAll('.video-player-stage iframe').forEach(function (f) {
      var src = f.getAttribute('src');
      if (f.__vpSrc != null || !src || src === 'about:blank') return;
      f.__vpSrc = src;
      f.setAttribute('src', 'about:blank');
    });
  }

  function reshow(el) {
    if (inEditorMode()) return;
    el.querySelectorAll('.video-player-stage iframe').forEach(function (f) {
      if (f.__vpSrc == null) return;
      var src = f.__vpSrc;
      f.__vpSrc = null;
      f.setAttribute('src', src);
    });
    var v = el.querySelector('video');
    if (!v) return;
    if (v.__vpFresh) startIfShown(el, v);
    else if (v.__vpResume) {
      v.__vpResume = false;
      play(v);
    }
  }

  function initAll() {
    document.querySelectorAll('.video-player').forEach(apply);
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
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-lang'],
    });
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    var scheduled = false;
    var pending = [];
    var flush = function () {
      scheduled = false;
      var set = [];
      pending.forEach(function (n) {
        if (!n || n.nodeType !== 1) return;
        if (n.classList && n.classList.contains('video-player') && set.indexOf(n) < 0) set.push(n);
        if (n.querySelectorAll) n.querySelectorAll('.video-player').forEach(function (p) {
          if (set.indexOf(p) < 0) set.push(p);
        });
      });
      pending = [];
      set.forEach(apply);
    };
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.addedNodes) m.addedNodes.forEach(function (n) { pending.push(n); });
      });
      if (!scheduled) {
        scheduled = true;
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
        else setTimeout(flush, 16);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.VideoPlayer = { apply: apply, initAll: initAll };
})();
