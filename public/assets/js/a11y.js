(function () {
  'use strict';

  function inEditorMode() {
    try {
      return !!(document.documentElement &&
                document.documentElement.classList.contains('in-editor'));
    } catch (e) { return false; }
  }

  function resolveTarget(link) {
    var custom = link.getAttribute('data-skip-target');
    if (custom) {
      try {
        var found = document.querySelector(custom);
        if (found) return found;
      } catch (e) {  }
    }
    return document.querySelector('[role="main"]')
        || document.querySelector('main')
        || document.getElementById('main');
  }

  function ensureId(el) {
    if (!el) return null;
    if (el.id) return el.id;
    el.id = 'main';
    return el.id;
  }

  function focusTarget(el) {
    if (!el) return;
    try {
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
      }
      el.focus({ preventScroll: true });

      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      try { el.focus(); } catch (e2) {}
    }
  }

  function wire(link) {
    if (!link || link.__a11yWired) return;
    link.__a11yWired = true;

    var target = resolveTarget(link);
    if (!target) return;

    var id = ensureId(target);

    if (id && link.getAttribute('href') !== '#' + id) {
      link.setAttribute('href', '#' + id);
    }

    link.addEventListener('click', function (ev) {
      if (inEditorMode()) return;
      ev.preventDefault();
      focusTarget(target);

      try { history.replaceState(null, '', '#' + id); } catch (e) {}
    });
  }

  function initAll() {
    document.querySelectorAll('.skip-link').forEach(wire);
  }

  function boot() {
    initAll();
    if (typeof MutationObserver !== 'undefined' && document.body) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          initAll();
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', initAll);

  window.A11y = { initAll: initAll };
})();
