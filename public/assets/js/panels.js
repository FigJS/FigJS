(function () {
  'use strict';

  if (window.SitePanels) return;

  var root = document.documentElement;

  function editing() { return root.classList.contains('in-editor'); }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function headerOf(item) { return item.querySelector(':scope > .accordion-header'); }
  function bodyOf(item) { return item.querySelector(':scope > .accordion-body'); }

  function speedOf(body) {
    var v = getComputedStyle(body).transitionDuration || '';
    var n = parseFloat(v);
    if (isNaN(n)) return 0;
    return /\dms/.test(v) ? n : n * 1000;
  }

  function setAccordion(item, open) {
    var body = bodyOf(item);
    if (!body || item.classList.contains('is-open') === open) return 0;
    var header = headerOf(item);
    if (header) header.setAttribute('aria-expanded', String(open));
    if (reducedMotion()) {
      body.style.maxHeight = '';
      item.classList.toggle('is-open', open);
      return 0;
    }
    body.style.maxHeight = (open ? 0 : body.scrollHeight) + 'px';
    body.classList.add('is-moving');
    item.classList.toggle('is-open', open);
    void body.offsetHeight;
    body.style.maxHeight = (open ? body.scrollHeight : 0) + 'px';
    var done = function (e) {
      if (e && (e.target !== body || e.propertyName !== 'max-height')) return;
      body.removeEventListener('transitionend', done);
      clearTimeout(body.__panelTimer);
      body.classList.remove('is-moving');
      body.style.maxHeight = '';
    };
    body.addEventListener('transitionend', done);
    clearTimeout(body.__panelTimer);
    body.__panelTimer = setTimeout(done, 2000);
    return speedOf(body);
  }

  function openAccordion(item) {
    var ms = 0;
    if (item.hasAttribute('data-accordion-single') && item.parentElement) {
      Array.prototype.forEach.call(item.parentElement.children, function (sib) {
        if (sib !== item && sib.classList.contains('accordion-item')) ms = Math.max(ms, setAccordion(sib, false));
      });
    }
    return Math.max(ms, setAccordion(item, true));
  }

  function toggleAccordion(item) {
    var mode = item.getAttribute('data-accordion-focus');
    var hold = !mode && item.getAttribute('data-accordion-open') === 'up' ? holdHeader(item) : null;
    var ms = item.classList.contains('is-open') ? setAccordion(item, false) : openAccordion(item);
    if (hold) hold(ms);
    else if (mode && item.classList.contains('is-open')) keepInView(item, ms, mode);
    return ms;
  }

  var follow = 0;
  var followBehavior = '';
  var followBox = null;
  var followBoxBehavior = '';

  function stopFollow() {
    if (!follow) return;
    cancelAnimationFrame(follow);
    follow = 0;
    root.style.scrollBehavior = followBehavior;
    if (followBox) followBox.style.scrollBehavior = followBoxBehavior;
    followBox = null;
  }

  function keepInView(item, ms, mode) {
    stopFollow();
    var cover = window.SiteNav && window.SiteNav.cover ? window.SiteNav.cover() : 0;
    var from = window.scrollY;
    var t0 = performance.now();
    var dur = reducedMotion() ? 0 : Math.max(ms, 350);
    var until = t0 + dur + 80;
    followBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    var step = function (now) {
      var r = item.getBoundingClientRect();
      var vh = window.innerHeight;
      var room = r.top - cover - 12;
      var dy = mode === 'top' ? room
        : mode === 'center' ? Math.min((r.top + r.bottom - cover - vh) / 2, room)
        : Math.max(0, Math.min(r.bottom - (vh - 12), room));
      var p = dur ? Math.min(1, (now - t0) / dur) : 1;
      var e = 1 - Math.pow(1 - p, 3);
      window.scrollTo(window.scrollX, from + (window.scrollY + dy - from) * e);
      if (now < until) follow = requestAnimationFrame(step);
      else stopFollow();
    };
    follow = requestAnimationFrame(step);
  }

  function scrollerOf(el) {
    for (var n = el.parentElement; n && n !== document.body && n !== root; n = n.parentElement) {
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }

  function holdHeader(item) {
    var header = headerOf(item);
    if (!header) return null;
    var top = header.getBoundingClientRect().top;
    return function (ms) {
      stopFollow();
      var box = scrollerOf(item);
      followBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      if (box) {
        followBox = box;
        followBoxBehavior = box.style.scrollBehavior;
        box.style.scrollBehavior = 'auto';
      }
      var keep = function () {
        var dy = header.getBoundingClientRect().top - top;
        if (Math.abs(dy) < 0.5) return;
        if (box) box.scrollTop += dy;
        else window.scrollBy(0, dy);
      };
      keep();
      var until = performance.now() + ms + 80;
      var step = function (now) {
        keep();
        if (now < until) follow = requestAnimationFrame(step);
        else stopFollow();
      };
      follow = requestAnimationFrame(step);
    };
  }

  ['wheel', 'touchstart', 'mousedown'].forEach(function (t) {
    window.addEventListener(t, stopFollow, { passive: true });
  });

  function reveal(el) {
    var ms = 0;
    for (var node = el; node && node.classList; node = node.parentElement) {
      if (node.classList.contains('is-open')) continue;
      if (node.classList.contains('accordion-item')) ms = Math.max(ms, openAccordion(node));
      else if (node.classList.contains('floating-panel-group')) setPanel(node, true);
    }
    return ms;
  }

  function placePanel(group) {
    var panel = group.querySelector(':scope > .floating-panel');
    var above = false;
    if (panel && group.getAttribute('data-panel-place') === 'auto') {
      var r = group.getBoundingClientRect();
      var below = window.innerHeight - r.bottom;
      above = panel.offsetHeight + 16 > below && r.top > below;
    }
    if (group.classList.contains('is-above') === above) return;
    if (panel) panel.style.transition = 'none';
    group.classList.toggle('is-above', above);
    if (!panel) return;
    void panel.offsetHeight;
    panel.style.transition = '';
    if (!panel.getAttribute('style')) panel.removeAttribute('style');
  }

  function setPanel(group, open) {
    if (open && !group.classList.contains('is-open')) placePanel(group);
    group.classList.toggle('is-open', open);
    var trigger = group.querySelector('.floating-panel-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
  }

  function prepare(scope) {
    if (editing()) return;
    (scope || document).querySelectorAll('.accordion-item').forEach(function (item) {
      var header = headerOf(item);
      if (!header || header.__panelReady) return;
      header.__panelReady = true;
      if (!header.hasAttribute('role')) header.setAttribute('role', 'button');
      if (!header.hasAttribute('tabindex')) header.tabIndex = 0;
      header.setAttribute('aria-expanded', String(item.classList.contains('is-open')));
    });
    (scope || document).querySelectorAll('.floating-panel-group').forEach(function (group) {
      var trigger = group.querySelector('.floating-panel-trigger');
      if (!trigger || trigger.__panelReady) return;
      trigger.__panelReady = true;
      if (!trigger.hasAttribute('role') && trigger.tagName !== 'BUTTON') trigger.setAttribute('role', 'button');
      if (!trigger.hasAttribute('tabindex') && trigger.tagName !== 'BUTTON') trigger.tabIndex = 0;
      trigger.setAttribute('aria-expanded', String(group.classList.contains('is-open')));
    });
  }

  function activate(target) {
    var header = target.closest('.accordion-header');
    if (header && header.parentElement && header.parentElement.classList.contains('accordion-item')) {
      toggleAccordion(header.parentElement);
      return true;
    }
    var trigger = target.closest('.floating-panel-trigger');
    if (trigger) {
      var group = trigger.closest('.floating-panel-group');
      if (group) setPanel(group, !group.classList.contains('is-open'));
      return true;
    }
    var closeBtn = target.closest('.floating-panel-close');
    if (closeBtn) {
      var owner = closeBtn.closest('.floating-panel-group');
      if (owner) setPanel(owner, false);
      return true;
    }
    return false;
  }

  document.addEventListener('click', function (e) {
    if (editing() || !e.target.closest) return;
    if (activate(e.target)) return;
    document.querySelectorAll('.floating-panel-group.is-open[data-panel-dismiss="outside"]').forEach(function (group) {
      if (!group.contains(e.target)) setPanel(group, false);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (editing()) return;
    if (e.key === 'Escape') {
      document.querySelectorAll('.floating-panel-group.is-open[data-panel-dismiss="outside"]').forEach(function (group) {
        setPanel(group, false);
      });
      return;
    }
    var t = e.target;
    if ((e.key !== 'Enter' && e.key !== ' ') || !t.classList || t.tagName === 'BUTTON' || t.tagName === 'A') return;
    if (t.classList.contains('accordion-header') || t.classList.contains('floating-panel-trigger')) {
      e.preventDefault();
      activate(t);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { prepare(); });
  else prepare();

  window.SitePanels = { prepare: prepare, setAccordion: setAccordion, setPanel: setPanel, reveal: reveal };
})();
