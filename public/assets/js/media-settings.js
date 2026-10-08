(function () {
  'use strict';

  var STORE_KEY = 'site.media.v1';
  var DEFAULTS = { volume: 0.5, muted: false };

  function clamp01(v) {
    v = Number(v);
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(1, v));
  }

  function read() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(DEFAULTS)); } catch (e) {}
        return { volume: DEFAULTS.volume, muted: DEFAULTS.muted };
      }
      var parsed = JSON.parse(raw);
      var v = clamp01(parsed.volume);
      return {
        volume: v == null ? DEFAULTS.volume : v,
        muted: !!parsed.muted,
      };
    } catch (e) {
      return { volume: DEFAULTS.volume, muted: DEFAULTS.muted };
    }
  }

  function write(state) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        volume: state.volume,
        muted: state.muted,
      }));
    } catch (e) {  }
  }

  var state = read();
  var listeners = new Set();

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state.volume, state.muted); } catch (e) {}
    });
  }

  function getVolume()          { return state.volume; }
  function isMuted()            { return state.muted; }
  function getEffectiveVolume() { return state.muted ? 0 : state.volume; }

  function setVolume(v) {
    var next = clamp01(v);
    if (next == null) return state;

    var nextMuted = (state.muted && next > 0) ? false : state.muted;
    if (next === state.volume && nextMuted === state.muted) return state;
    state.volume = next;
    state.muted = nextMuted;
    write(state);
    notify();
    return state;
  }

  function setMuted(m) {
    m = !!m;
    if (m === state.muted) return state;
    state.muted = m;
    write(state);
    notify();
    return state;
  }

  function toggleMuted() {
    return setMuted(!state.muted);
  }

  function onVolumeChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  window.addEventListener('storage', function (e) {
    if (e.key !== STORE_KEY) return;
    state = read();
    notify();
  });

  window.MediaSettings = {
    getVolume: getVolume,
    isMuted: isMuted,
    getEffectiveVolume: getEffectiveVolume,
    setVolume: setVolume,
    setMuted: setMuted,
    toggleMuted: toggleMuted,
    onVolumeChange: onVolumeChange,
  };
})();
