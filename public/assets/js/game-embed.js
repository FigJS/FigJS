(function () {
  'use strict';
  if (window.__IS_EDITOR_CANVAS) return;

  const ENVELOPE = '__godotEmbed';
  const ENVELOPE_VERSION = 1;
  const SELECTOR = '.game-embed, .embed, .godot-embed';

  const live = new Map();
  let nextId = 1;
  let pendingBootId = null;

  function readConfig(container) {
    const a = (k, d) => {
      const v = container.getAttribute(k);
      return (v != null && v !== '') ? v : d;
    };
    const b = (k, d) => {
      const v = container.getAttribute(k);
      if (v == null || v === '') return d;
      return v === 'true' || v === '1' || v === 'yes' || v === 'on';
    };
    return {
      url:             a('data-game-url', ''),
      type:            a('data-embed-type', ''),
      title:           a('data-title', ''),
      boot:            a('data-boot', 'click'),
      threads:         a('data-threads', 'auto'),
      pwa:             b('data-pwa', false),
      aspect:          a('data-aspect', '16 / 9'),
      maxWidth:        a('data-max-width', '100%'),
      radius:          a('data-radius', '8px'),
      poster:          a('data-poster', ''),
      bgColor:         a('data-bg-color', '#0b0b0b'),
      overlayBg:       a('data-overlay-bg', '#1a1a1a'),
      overlayText:     a('data-overlay-text', '#dddddd'),
      btnBg:           a('data-button-bg', '#ffffff'),
      btnText:         a('data-button-text', '#000000'),
      btnLabel:        a('data-button-label', 'Play'),
      openLink:        a('data-open-link', ''),
      openLabel:       a('data-open-label', ''),
      scroll:          b('data-scroll', false),
      allowFullscreen: b('data-allow-fullscreen', true),
      controls:        b('data-controls', true),
      confirmClose:    b('data-confirm-close', true),
      returnOnQuit:    b('data-return-on-quit', true),
    };
  }

  function isSameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; }
    catch (e) { return false; }
  }

  function inferType(cfg) {
    if (cfg.type) return cfg.type;
    if (/itch\.io/.test(cfg.url)) return 'itch';
    return isSameOrigin(cfg.url) ? 'self-hosted' : 'external';
  }

  function needsIsolation(cfg) {
    if (cfg.threads === 'true') return true;
    if (cfg.threads === 'false') return false;
    return inferType(cfg) === 'self-hosted';
  }

  function pageIsIsolated() {
    return self.crossOriginIsolated === true;
  }

  const OPEN_PARAM = 'embeds';
  const RESUME_KEY = 'site-isolation-resume';

  function canReloadIsolated() {
    return new URL(location.href).searchParams.has(OPEN_PARAM);
  }

  function reloadIsolated(rec) {
    if (!canReloadIsolated() || !rec.container.id) return false;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(
        { kind: 'game', id: rec.container.id, path: location.pathname, at: Date.now() }));
    } catch (e) { return false; }
    const url = new URL(location.href);
    url.searchParams.delete(OPEN_PARAM);
    location.replace(url.href);
    return true;
  }

  function takeResume() {
    try {
      const r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
      if (!r || r.kind !== 'game' || r.path !== location.pathname || Date.now() - r.at > 60000) return null;
      sessionStorage.removeItem(RESUME_KEY);
      return r.id || null;
    } catch (e) { return null; }
  }
  const resumeId = takeResume();

  function reveal(node) {
    const chain = [];
    for (let sp = node.closest('.subpage'); sp; sp = sp.parentElement && sp.parentElement.closest('.subpage')) {
      chain.unshift(sp);
    }
    if (chain.length && !window.SiteSubpage && document.readyState !== 'complete') {
      document.addEventListener('DOMContentLoaded', () => reveal(node), { once: true });
      return;
    }
    if (window.SiteSubpage) chain.forEach((sp) => window.SiteSubpage.open(sp));
    node.scrollIntoView({ block: 'center' });
  }

  function applyContainerStyle(el, cfg) {
    const cs = window.getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    if (cs.display === 'inline') el.style.display = 'block';
    el.style.aspectRatio = cfg.aspect;
    el.style.maxWidth = cfg.maxWidth;
    el.style.width = '100%';
    el.style.borderRadius = cfg.radius;
    el.style.backgroundColor = cfg.bgColor;
    el.style.overflow = cfg.scroll ? 'auto' : 'hidden';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildOverlay(rec) {
    const { cfg } = rec;
    const ov = el('div', 'game-embed-overlay');
    Object.assign(ov.style, {
      background: cfg.poster
        ? `center / cover no-repeat url("${cfg.poster}"), ${cfg.overlayBg}`
        : cfg.overlayBg,
      color: cfg.overlayText,
    });

    if (cfg.title) ov.appendChild(el('div', 'game-embed-title', cfg.title));

    const play = el('button', 'game-embed-play', cfg.btnLabel);
    play.type = 'button';
    Object.assign(play.style, { background: cfg.btnBg, color: cfg.btnText });
    ov.appendChild(play);

    const status = el('div', 'game-embed-status');
    status.hidden = true;
    ov.appendChild(status);

    if (needsIsolation(cfg) && !pageIsIsolated() && !canReloadIsolated()) {
      ov.appendChild(el('div', 'game-embed-warning',
        'This page is not cross-origin isolated, so a threaded build cannot ' +
        'start here. Open it in its own tab instead.'));
    }

    if (cfg.openLink !== 'off') {
      const links = el('div', 'game-embed-links');
      const open = el('a', 'game-embed-open', cfg.openLabel || (cfg.pwa ? 'Open / install as app' : 'Open in new tab'));
      open.href = cfg.url;
      open.target = '_blank';
      open.rel = 'noopener';
      links.appendChild(open);
      ov.appendChild(links);
    }

    rec.ui.overlay = ov;
    rec.ui.play = play;
    rec.ui.status = status;
    return ov;
  }

  function setStatus(rec, text, kind) {
    const s = rec.ui.status;
    if (!s) return;
    s.textContent = text || '';
    s.hidden = !text;
    s.dataset.kind = kind || '';
  }

  function showOverlay(rec, show) {
    if (rec.ui.overlay) rec.ui.overlay.style.display = show ? '' : 'none';
  }

  function ask(rec, message, yes, no, onYes) {
    if (rec.ui.ask) return;
    const layer = el('div', 'game-embed-ask');
    const prompt = el('div', 'game-embed-prompt');
    prompt.setAttribute('role', 'alertdialog');
    prompt.appendChild(el('div', 'game-embed-prompt-msg', message));
    const row = el('div', 'game-embed-prompt-actions');
    const cancel = el('button', 'game-embed-prompt-cancel', no);
    const confirm = el('button', 'game-embed-prompt-confirm', yes);
    cancel.type = confirm.type = 'button';
    const done = () => {
      layer.remove();
      rec.ui.ask = null;
      if (rec.iframe) { try { rec.iframe.focus(); } catch (e) {} }
    };
    cancel.addEventListener('click', (e) => { e.stopPropagation(); done(); });
    confirm.addEventListener('click', (e) => { e.stopPropagation(); done(); onYes(); });
    layer.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      done();
    });
    row.append(cancel, confirm);
    prompt.appendChild(row);
    layer.appendChild(prompt);
    rec.container.appendChild(layer);
    rec.ui.ask = layer;
    cancel.focus();
  }

  function askToQuit(rec, instanceId, then) {
    if (!rec.cfg.confirmClose) { requestQuit(instanceId, then); return; }
    ask(rec, 'Close the game? Unsaved progress will be lost.', 'Close game', 'Keep playing',
      () => requestQuit(instanceId, then));
  }

  function buildControls(rec, instanceId) {
    const bar = el('div', 'game-embed-controls');
    if (rec.cfg.allowFullscreen) {
      const fs = el('button', 'game-embed-ctl game-embed-ctl--fullscreen');
    fs.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      fs.type = 'button';
      fs.setAttribute('aria-label', 'Fullscreen');
      fs.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = rec.container;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
        if (rec.iframe) { try { rec.iframe.focus(); } catch (err) {} }
      });
      bar.appendChild(fs);
    }
    const stop = el('button', 'game-embed-ctl game-embed-ctl--stop');
    stop.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    stop.type = 'button';
    stop.setAttribute('aria-label', 'Close game');
    stop.addEventListener('click', (e) => {
      e.stopPropagation();
      askToQuit(rec, instanceId);
    });
    bar.appendChild(stop);
    rec.ui.controls = bar;
    return bar;
  }

  function makeIframe(rec, instanceId) {
    const { cfg } = rec;
    const f = document.createElement('iframe');
    f.className = 'game-embed-frame';
    f.dataset.instance = String(instanceId);
    f.setAttribute('aria-label', cfg.title || 'Game');
    if (!isSameOrigin(cfg.url)) f.setAttribute('credentialless', '');
    const allow = ['autoplay', 'gamepad', 'cross-origin-isolated', 'clipboard-write', 'screen-wake-lock'];
    if (cfg.allowFullscreen) allow.push('fullscreen');
    f.setAttribute('allow', allow.join('; '));
    if (cfg.allowFullscreen) f.setAttribute('allowfullscreen', '');
    f.setAttribute('scrolling', cfg.scroll ? 'yes' : 'no');
    return f;
  }

  function getActiveInstanceId() {
    for (const [id, rec] of live.entries()) if (rec.active) return id;
    return null;
  }

  function activate(instanceId) {
    const rec = live.get(instanceId);
    if (!rec || rec.active) return;

    if (needsIsolation(rec.cfg) && !pageIsIsolated()) {
      if (canReloadIsolated() && !rec.userStarted) return;
      if (rec.userStarted && reloadIsolated(rec)) return;
      setStatus(rec, 'Threads unavailable here (page not cross-origin isolated). ' +
        'Use "Open in new tab".', 'error');
      return;
    }

    rec.active = true;
    rec.ready = false;
    setStatus(rec, '');
    showOverlay(rec, false);

    ensureContainerSized(rec.container).then(() => {
      if (!rec.active) return;
      if (rec.cfg.controls) rec.container.appendChild(buildControls(rec, instanceId));
      const f = makeIframe(rec, instanceId);
      rec.iframe = f;
      rec.container.appendChild(f);
      f.src = rec.cfg.url;
      f.addEventListener('load', () => {
        try { f.focus(); } catch (e) {}
      });
    });
  }

  function ensureContainerSized(node) {
    if (node.clientWidth > 0 && node.clientHeight > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const ro = new ResizeObserver(() => {
        if (node.clientWidth > 0 && node.clientHeight > 0) { ro.disconnect(); resolve(); }
      });
      ro.observe(node);
      setTimeout(() => { ro.disconnect(); resolve(); }, 2000);
    });
  }

  function deactivate(instanceId, opts) {
    const rec = live.get(instanceId);
    if (!rec || !rec.active) return;
    rec.active = false;
    rec.ready = false;
    clearTimeout(rec.quitTimer);
    if (document.fullscreenElement === rec.container) document.exitFullscreen().catch(() => {});
    if (rec.iframe && rec.iframe.parentNode) rec.iframe.parentNode.removeChild(rec.iframe);
    rec.iframe = null;
    if (rec.ui.ask) { rec.ui.ask.remove(); rec.ui.ask = null; }
    if (rec.ui.controls) { rec.ui.controls.remove(); rec.ui.controls = null; }
    if (!opts || opts.showOverlay !== false) showOverlay(rec, true);
  }

  function armQuitTimer(instanceId, ms) {
    const rec = live.get(instanceId);
    if (!rec) return;
    clearTimeout(rec.quitTimer);
    rec.quitTimer = setTimeout(() => {
      if (!rec.active) return;
      deactivate(instanceId, { showOverlay: rec.cfg.returnOnQuit });
      const cb = rec.onQuit; rec.onQuit = null;
      if (cb) cb();
    }, ms);
  }

  function requestQuit(instanceId, then) {
    const rec = live.get(instanceId);
    if (!rec || !rec.active) { if (then) then(); return; }
    rec.onQuit = then || null;
    try {
      rec.iframe.contentWindow.postMessage({ [ENVELOPE]: ENVELOPE_VERSION, command: 'request_quit' }, '*');
    } catch (e) {}
    armQuitTimer(instanceId, 600);
  }

  function requestHandoff(targetId, activeId) {
    const target = live.get(targetId);
    const ov = target.ui.overlay;
    if (ov.querySelector('.game-embed-prompt')) return;
    target.ui.play.style.display = 'none';

    const prompt = el('div', 'game-embed-prompt');
    prompt.appendChild(el('div', 'game-embed-prompt-msg',
      'Another game is running. Unsaved progress there will be lost. Close it and start this one?'));
    const row = el('div', 'game-embed-prompt-actions');
    const cancel = el('button', 'game-embed-prompt-cancel', 'Cancel');
    const confirm = el('button', 'game-embed-prompt-confirm', 'Close & Play');
    cancel.type = confirm.type = 'button';
    const close = () => { prompt.remove(); target.ui.play.style.display = ''; };
    cancel.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    confirm.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      pendingBootId = targetId;
      requestQuit(activeId, () => {
        if (pendingBootId === targetId) { pendingBootId = null; activate(targetId); }
      });
    });
    row.append(cancel, confirm);
    prompt.appendChild(row);
    target.ui.play.after(prompt);
  }

  function onPlay(instanceId) {
    const rec = live.get(instanceId);
    if (rec) rec.userStarted = true;
    const activeId = getActiveInstanceId();
    if (activeId && activeId !== instanceId) requestHandoff(instanceId, activeId);
    else activate(instanceId);
  }

  window.addEventListener('beforeunload', (event) => {
    let needsConfirm = false;
    live.forEach((rec) => { if (rec.active && rec.cfg.confirmClose) needsConfirm = true; });
    if (needsConfirm) { event.preventDefault(); event.returnValue = ''; }
  });

  window.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object' || d[ENVELOPE] !== ENVELOPE_VERSION) return;

    let matchedId = null;
    live.forEach((rec, id) => {
      if (rec.iframe && rec.iframe.contentWindow === event.source) matchedId = id;
    });
    if (matchedId == null) return;
    const rec = live.get(matchedId);
    const detail = d.detail || {};

    switch (d.notification) {
      case 'NOTIFICATION_READY':
        rec.ready = true;
        break;
      case 'NOTIFICATION_QUIT_PENDING':
        armQuitTimer(matchedId, 6000);
        break;
      case 'NOTIFICATION_BOOT_FAILED':
        deactivate(matchedId, { showOverlay: true });
        setStatus(rec, 'The game failed to start: ' + (detail.error || 'unknown error'), 'error');
        break;
      case 'NOTIFICATION_WM_CLOSE_REQUEST': {
        deactivate(matchedId, { showOverlay: rec.cfg.returnOnQuit });
        if (detail.reason === 'boot-failure') {
          setStatus(rec, 'The game failed to start' + (detail.error ? ': ' + detail.error : '.'), 'error');
        }
        const cb = rec.onQuit; rec.onQuit = null;
        if (cb) cb();
        else if (pendingBootId !== null) {
          const next = pendingBootId; pendingBootId = null; activate(next);
        }
        break;
      }
      case 'NOTIFICATION_APPLICATION_FOCUS_IN':
        rec.container.dataset.focus = 'in';
        break;
      case 'NOTIFICATION_APPLICATION_FOCUS_OUT':
        rec.container.dataset.focus = 'out';
        break;
      default:
        rec.container.dataset.lastNotification = String(d.notification || '');
    }
  });

  function mount(container) {
    if (container.__gameEmbedMounted) return;
    const cfg = readConfig(container);
    if (!cfg.url) return;
    container.__gameEmbedMounted = true;

    const id = nextId++;
    const rec = { container, iframe: null, cfg, active: false, ready: false, ui: {} };
    live.set(id, rec);

    applyContainerStyle(container, cfg);
    container.dataset.embedKind = inferType(cfg);
    container.appendChild(buildOverlay(rec));
    rec.ui.play.addEventListener('click', (e) => { e.stopPropagation(); onPlay(id); });

    if (resumeId && container.id === resumeId) {
      if (!getActiveInstanceId()) activate(id);
      setTimeout(() => reveal(container), 0);
    } else if (cfg.boot === 'auto') {
      if (!getActiveInstanceId() && !container.closest('.subpage:not(.is-open)')) activate(id);
    } else if (cfg.boot === 'hover') {
      container.addEventListener('mouseenter', () => {
        if (!rec.active && !getActiveInstanceId()) activate(id);
      });
    }
  }

  function scan(root) {
    (root || document).querySelectorAll(SELECTOR).forEach(mount);
  }

  function within(root, fn) {
    live.forEach((rec, id) => { if (root.contains(rec.container)) fn(rec, id); });
  }

  document.addEventListener('subpage:open', (e) => {
    within(e.target, (rec, id) => {
      if (rec.cfg.boot === 'auto' && !rec.active && !getActiveInstanceId()) activate(id);
    });
  });
  document.addEventListener('subpage:beforeclose', (e) => {
    if (!e.detail || !e.detail.stop) return;
    within(e.target, (rec, id) => {
      if (!rec.active || !rec.cfg.confirmClose || e.defaultPrevented) return;
      e.preventDefault();
      const sp = e.target;
      ask(rec, 'Close the game? Unsaved progress will be lost.', 'Close game', 'Keep playing',
        () => requestQuit(id, () => { if (window.SiteSubpage) window.SiteSubpage.close(sp, { force: true }); }));
    });
  });
  document.addEventListener('subpage:close', (e) => {
    if (!e.detail || !e.detail.stop) return;
    within(e.target, (rec, id) => { if (rec.active) deactivate(id, { showOverlay: true }); });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan());
  else scan();

  window.GameEmbed = { scan, isolated: pageIsIsolated };
})();
