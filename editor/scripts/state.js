// Shared state and status helpers. Loaded first.
//   FigJS.state                    shared state object
//   FigJS.setStatus(text, colour)  status message; results fade, progress stays
//   FigJS.clearStatus()
//   FigJS.markUnsaved() / clearUnsaved()
//   FigJS.withInternalUpdate(fn)   run fn with state.isInternalUpdate set

(function () {
  'use strict';

  // Preferences live under fig.* keys; values under ide.* move there.
  try {
    Object.keys(localStorage).filter((key) => key.startsWith('ide.')).forEach((key) => {
      const next = 'fig.' + key.slice(4);
      if (localStorage.getItem(next) == null) localStorage.setItem(next, localStorage.getItem(key));
      localStorage.removeItem(key);
    });
  } catch (e) {}

  let statusEl = null;
  let hideTimer = 0;

  // Hold times by colour; uncoloured (progress) messages stay longer.
  const HOLD_MS = { '#4caf50': 2500, '#ff9800': 4500, '#f44336': 8000 };

  function setStatus(text, color) {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'status-msg';
      statusEl.className = 'fig-status';
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(statusEl);
    }
    clearTimeout(hideTimer);
    statusEl.textContent = text;
    statusEl.title = text;
    statusEl.style.setProperty('--status-color', color || 'var(--text-muted)');
    statusEl.classList.add('is-shown');
    hideTimer = setTimeout(() => statusEl.classList.remove('is-shown'), HOLD_MS[color] || 10000);
  }

  function clearStatus() {
    clearTimeout(hideTimer);
    if (statusEl) statusEl.classList.remove('is-shown');
  }

  function saveButton(dirty) {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    btn.classList.toggle('is-dirty', dirty);
    btn.title = dirty ? 'Unsaved changes. Save (Ctrl+S)' : 'Save (Ctrl+S)';
  }

  const state = {
    hasUnsavedChanges: false,
    isInternalUpdate: false,
    currentFilePath: null,
    currentRawFile: null,
  };

  function markUnsaved() {
    if (state.hasUnsavedChanges) return;
    state.hasUnsavedChanges = true;
    saveButton(true);
  }

  function clearUnsaved() {
    state.hasUnsavedChanges = false;
    saveButton(false);
  }

  function withInternalUpdate(fn) {
    const prev = state.isInternalUpdate;
    state.isInternalUpdate = true;
    try { return fn(); }
    finally { state.isInternalUpdate = prev; }
  }

  window.addEventListener('beforeunload', (e) => {
    if (state.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = 'Unsaved changes.';
    }
  });

  window.FigJS = window.FigJS || {};
  window.FigJS.state = state;
  window.FigJS.setStatus = setStatus;
  window.FigJS.clearStatus = clearStatus;
  window.FigJS.markUnsaved = markUnsaved;
  window.FigJS.clearUnsaved = clearUnsaved;
  window.FigJS.withInternalUpdate = withInternalUpdate;
})();