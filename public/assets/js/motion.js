(function () {
  var SELECTOR = '.reveal-fade, .reveal-slide-up, .reveal-slide-left, .reveal-slide-right, .reveal-zoom';
  var observers = new Map();
  var watched = new WeakMap();
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function lineOf(el) {
    var v = parseFloat(getComputedStyle(el).getPropertyValue('--reveal-line'));
    return isFinite(v) ? Math.max(0, Math.min(95, v)) : 10;
  }

  function observerFor(line) {
    var key = String(line);
    var io = observers.get(key);
    if (io) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          if (el.hasAttribute('data-reveal-once')) io.unobserve(el);
        } else if (!el.hasAttribute('data-reveal-once')) {
          el.classList.remove('is-visible');
        }
      });
    }, { rootMargin: '0px 0px -' + line + '% 0px', threshold: 0 });
    observers.set(key, io);
    return io;
  }

  function watch(el) {
    if (reduced || !('IntersectionObserver' in window)) {
      el.classList.add('is-visible');
      return;
    }
    var line = lineOf(el);
    var prev = watched.get(el);
    if (prev === line) return;
    if (prev != null) observerFor(prev).unobserve(el);
    watched.set(el, line);
    observerFor(line).observe(el);
  }

  function refresh() {
    document.querySelectorAll(SELECTOR).forEach(watch);
  }

  function replay(root) {
    var scope = root || document;
    scope.querySelectorAll(SELECTOR).forEach(function (el) {
      var line = watched.get(el);
      el.classList.remove('is-visible');
      if (line != null) observerFor(line).unobserve(el);
      watched.delete(el);
    });
    void document.body.offsetHeight;
    requestAnimationFrame(function () { scope.querySelectorAll(SELECTOR).forEach(watch); });
  }

  function boot() {
    refresh();
    var pending = 0;
    new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () { pending = 0; refresh(); });
    }).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-reveal-once'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteReveal = { refresh: refresh, replay: replay };
})();
