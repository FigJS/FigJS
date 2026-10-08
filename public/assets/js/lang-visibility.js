(function () {
  'use strict';

  var HIDDEN = 'is-lang-hidden';

  function currentLang() {
    try {
      return (document.body && document.body.getAttribute('data-lang')) || 'en';
    } catch (e) { return 'en'; }
  }

  function codes(raw) {
    return String(raw || '').split(/[\s,]+/).filter(Boolean);
  }

  function applyGates() {
    var lang = currentLang();
    var els = document.querySelectorAll('[data-lang-only], [data-lang-hide]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];

      var only = codes(el.getAttribute('data-lang-only'));
      var hide = codes(el.getAttribute('data-lang-hide'));

      var hidden = false;
      if (only.length && only.indexOf(lang) < 0) hidden = true;
      if (hide.length && hide.indexOf(lang) >= 0) hidden = true;

      el.classList.toggle(HIDDEN, hidden);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { pending = false; applyGates(); });
    } else {
      setTimeout(function () { pending = false; applyGates(); }, 16);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyGates);
  } else {
    applyGates();
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') {
          if (m.attributeName === 'data-lang') { schedule(); return; }
          if (m.attributeName === 'data-lang-only') { schedule(); return; }
          if (m.attributeName === 'data-lang-hide') { schedule(); return; }
        } else if (m.type === 'childList') {
          schedule();
          return;
        }
      }
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-lang', 'data-lang-only', 'data-lang-hide'],
      childList: true,
      subtree: true,
    });
  }
})();
