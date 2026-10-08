(function () {
  'use strict';
  if (window.SiteTooltip) return;

  const GAP = 8;
  const MARGIN = 8;

  let tip = null;
  let arrow = null;
  let body = null;
  let anchor = null;
  let opts = {};
  let pinned = false;
  let raf = 0;
  let pointer = { x: -1, y: -1, known: false };

  function isEditorCanvas() {
    return !!window.__IS_EDITOR_CANVAS
      && document.documentElement.classList.contains('in-editor');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function safeHref(href) {
    const h = String(href || '').trim();
    if (/^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i.test(h)) return h;
    if (/^[\w./-]+$/.test(h)) return h;
    return '#';
  }

  function renderInline(md) {
    const code = [];
    let s = esc(md);
    s = s.replace(/`([^`\n]+)`/g, (_, c) => '\u0000' + (code.push(c) - 1) + '\u0000');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = safeHref(href.replace(/&amp;/g, '&'));
      const ext = /^(https?:)?\/\//i.test(url);
      return `<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\n/g, '<br>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[+i]}</code>`);
    return s;
  }

  function ensure() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement('div');
    tip.className = 'site-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.id = 'site-tooltip';
    body = document.createElement('div');
    body.className = 'site-tooltip-body';
    arrow = document.createElement('div');
    arrow.className = 'site-tooltip-arrow';
    tip.append(body, arrow);
    document.body.appendChild(tip);
    return tip;
  }

  function place() {
    if (!tip || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const want = opts.pos || 'top';

    const fits = {
      top: r.top - t.height - GAP >= MARGIN,
      bottom: r.bottom + t.height + GAP <= vh - MARGIN,
      left: r.left - t.width - GAP >= MARGIN,
      right: r.right + t.width + GAP <= vw - MARGIN,
    };
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    let pos = fits[want] ? want : (fits[opposite[want]] ? opposite[want] : (fits.top ? 'top' : 'bottom'));

    let x;
    let y;
    if (pos === 'top' || pos === 'bottom') {
      x = r.left + r.width / 2 - t.width / 2;
      y = pos === 'top' ? r.top - t.height - GAP : r.bottom + GAP;
    } else {
      x = pos === 'left' ? r.left - t.width - GAP : r.right + GAP;
      y = r.top + r.height / 2 - t.height / 2;
    }
    const cx = Math.max(MARGIN, Math.min(x, vw - t.width - MARGIN));
    const cy = Math.max(MARGIN, Math.min(y, vh - t.height - MARGIN));
    tip.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
    tip.dataset.pos = pos;

    if (pos === 'top' || pos === 'bottom') {
      const ax = Math.max(10, Math.min(r.left + r.width / 2 - cx, t.width - 10));
      arrow.style.left = ax + 'px';
      arrow.style.top = '';
    } else {
      const ay = Math.max(10, Math.min(r.top + r.height / 2 - cy, t.height - 10));
      arrow.style.top = ay + 'px';
      arrow.style.left = '';
    }

    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) hide(true);
  }

  function stillHovered() {
    if (!pointer.known) return true;
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    if (!hit) return false;
    if (anchor.contains(hit)) return true;
    return tip.contains(hit) && (pinned || opts.interactive);
  }

  function loop() {
    raf = 0;
    if (!anchor || !tip) return;
    if (!anchor.isConnected) { hide(true); return; }
    place();
    if (!pinned && !stillHovered()) { hide(); return; }
    raf = requestAnimationFrame(loop);
  }

  function show(el, content, options) {
    if (!el || content == null || content === '') return;
    if (pinned && anchor && anchor !== el) return;
    ensure();
    anchor = el;
    opts = options || {};
    pinned = !!opts.pinned;
    if (content instanceof Node) { body.innerHTML = ''; body.appendChild(content); }
    else if (opts.markdown) {
      body.innerHTML = renderInline(content);
      if (window.SiteLinkTargets && window.SiteLinkTargets.wantsNewTab(el)) {
        body.querySelectorAll('a[href]').forEach((a) => window.SiteLinkTargets.applyTo(a, true));
      }
    }
    else body.textContent = String(content);
    tip.classList.toggle('is-pinned', pinned);
    tip.classList.add('is-visible');
    anchor.setAttribute('aria-describedby', tip.id);
    place();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function hide(force) {
    if (pinned && !force) return;
    pinned = false;
    if (anchor) anchor.removeAttribute('aria-describedby');
    anchor = null;
    if (tip) tip.classList.remove('is-visible', 'is-pinned');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function pin(el) {
    if (!anchor || anchor !== el || !opts.pinnable || isEditorCanvas()) return false;
    pinned = true;
    tip.classList.add('is-pinned');
    return true;
  }

  document.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY, known: true };
  }, { capture: true, passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (!tip || !tip.classList.contains('is-visible')) return;
    if (tip.contains(e.target)) return;
    if (anchor && anchor.contains(e.target) && opts.pinnable) return;
    hide(true);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tip && tip.classList.contains('is-visible')) hide(true);
  });

  window.addEventListener('blur', () => hide(true));

  document.documentElement.addEventListener('mouseleave', () => {
    pointer.known = false;
    hide();
  });

  window.SiteTooltip = {
    show,
    hide,
    pin,
    isPinned: () => pinned,
    anchor: () => anchor,
    renderInline,
  };
})();
