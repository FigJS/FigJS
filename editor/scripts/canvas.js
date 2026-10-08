// Canvas: <base href>, editor-mode override CSS (motion pause, entrance
// and reveal neutralizing, outlines), key forwarding, navigation blocking,
// the Preview guard, head sync with the Code tab, plain-text paste,
// Markdown-in-text editing, and collapsed-element markers.
//   FigJS.canvas.baseHrefFor(relPath) / install(baseHref) / installForPage(relPath)
//   FigJS.canvas.ensureDeps() / syncHead() / installOutlineManager()
//   FigJS.canvas.setPreviewActive(bool) / setMotionPaused(bool)
//   FigJS.canvas.closeEditOpen(model)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  let _previewActive = false;
  let _outlineManagerInstalled = false;
  let _motionPaused = true;

  // Animations paused here, so resume touches only those.
  const _pausedByUs = new WeakSet();

  // Canvas media queries see the iframe's width, which on the desktop
  // device is whatever the side panels leave (often under 640px). The
  // device marker lets the override CSS keep phone rules out of the
  // desktop and tablet views; data-device-view makes the visibility tags
  // (hide-/only-phone, -tablet, -desktop) follow the chosen device.
  function _syncDeviceMarker() {
    const editor = FigJS.editor;
    if (!editor) return;
    const doc = editor.Canvas.getDocument();
    if (!doc || !doc.documentElement) return;
    let dev = 'desktop';
    try {
      const d = editor.getDevice();
      if (d && d.get) dev = d.get('id') || dev;
      else if (typeof d === 'string') dev = d;
    } catch (e) {}
    dev = String(dev).toLowerCase();
    doc.documentElement.dataset.figDevice = dev;
    doc.documentElement.setAttribute('data-device-view', dev);
  }

  // ===================== Base href =====================================

  function baseHrefFor(relPath) {
    const origin = window.location.origin;
    if (!relPath || !relPath.startsWith('public/')) return origin + '/';
    const sub = relPath.slice('public/'.length);
    const slash = sub.lastIndexOf('/');
    return origin + (slash >= 0 ? '/' + sub.slice(0, slash + 1) : '/');
  }

  // Motion pause: document.getAnimations() filtered to infinite
  // animations (entrances finish so their elements show). motion-paused on
  // the canvas <html> signals JS-driven motion (carousels, marquees).

  function _canvasDoc() {
    const editor = FigJS.editor;
    if (!editor) return null;
    try { return editor.Canvas.getDocument(); } catch (e) { return null; }
  }

  function _continuousAnimations(doc) {
    if (!doc || typeof doc.getAnimations !== 'function') return [];
    let all;
    try { all = doc.getAnimations(); } catch (e) { return []; }
    if (!all || !all.length) return [];

    const out = [];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      let timing;
      try {
        timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
      } catch (e) { continue; }
      if (!timing) continue;
      if (timing.iterations !== Infinity) continue;
      out.push(a);
    }
    return out;
  }

  function _pauseAll() {
    const doc = _canvasDoc();
    if (!doc) return;
    _continuousAnimations(doc).forEach((a) => {
      try {
        if (a.playState === 'running') {
          a.pause();
          _pausedByUs.add(a);
        }
      } catch (e) {}
    });
  }

  function _resumeAll() {
    const doc = _canvasDoc();
    if (!doc) return;
    _continuousAnimations(doc).forEach((a) => {
      try {
        if (_pausedByUs.has(a)) {
          a.play();
          _pausedByUs.delete(a);
        }
      } catch (e) {}
    });
  }

  function _paused() { return _motionPaused && !_previewActive; }

  function _syncAnimations() {
    if (_paused()) _pauseAll();
    else _resumeAll();
  }

  function _watchAnimations(doc) {
    if (!doc || doc.__figMotionWatchBound) return;
    doc.__figMotionWatchBound = true;

    const onStart = () => {
      if (!_paused()) return;
      queueMicrotask(_syncAnimations);
    };
    doc.addEventListener('animationstart', onStart, true);

    if (typeof MutationObserver !== 'undefined' && doc.body) {
      const mo = new MutationObserver(() => {
        if (!_paused()) return;
        queueMicrotask(_syncAnimations);
      });
      mo.observe(doc.body, { childList: true, subtree: true });
      doc.__figMotionObserver = mo;
    }
  }

  function setMotionPaused(paused) {
    _motionPaused = !!paused;
    const doc = _canvasDoc();
    if (doc) {
      try {
        doc.documentElement.classList.toggle('motion-paused', _paused());
      } catch (e) {}
    }
    _syncAnimations();
  }

  // ===================== Override CSS ==================================

function _emptyContainerCSS() {
  const reg = window.PresetRegistry;
  const classes = (reg && reg.getContainerClasses ? reg.getContainerClasses() : [])
    .filter((c) => /^[a-z][\w-]*$/i.test(c));
  const targets = classes.map((c) => '.' + c)
    .concat(['div[data-gjs-type="default"]', 'section', 'main', 'article', 'aside', 'header', 'footer', 'nav'])
    .join(', ');
  // The canvas lays out exactly like the page. Only while something is
  // being dragged do empty containers (and empty editing stages) open up,
  // so there is room to drop into them.
  return `
    html.in-editor.fig-dragging :is(${targets}):empty {
      min-height: 40px;
      min-width: 40px;
    }
    html.in-editor.fig-dragging .audio-player-body { min-height: 40px; }
    html.in-editor.fig-dragging :is(.sticky-window-stage, .sticky-range-inner, .sticky-scroll-stage):empty::after {
      content: "Drop content here";
      display: block;
      padding: 24px;
      text-align: center;
      color: #555;
      font-size: 12px;
      border: 1px dashed #333;
      border-radius: 4px;
    }
  `;
}

function _buildOverrideCSS() {
  return _emptyContainerCSS() + `
    /* The wrapper div renders nothing (page-body.js mirrors it onto
       <body>); :not(#\\#) twice outranks its #id rule. */
    [data-gjs-type="wrapper"]:not(#\\#):not(#\\#) {
      all: unset;
      display: block;
    }

    /* Link > Pick on page is waiting for a click. */
    html.fig-picking, html.fig-picking * { cursor: crosshair !important; }

    /* A selected language switcher shows its menu, so it can be styled. */
    html.in-editor .lang-switch:is(.gjs-selected, :has(.gjs-selected)) > .lang-switch-menu {
      display: block !important;
    }

    /* Accordions and floating panels opened for editing (see
       _watchEditOpen); Replay shows the declared state. */
    html.in-editor:not(.fig-entrance-live) .accordion-item.fig-edit-open > .accordion-body {
      max-height: none !important;
      overflow: visible !important;
    }
    html.in-editor:not(.fig-entrance-live) .accordion-item.fig-edit-open > .accordion-header .accordion-icon {
      transform: rotate(45deg);
    }
    html.in-editor:not(.fig-entrance-live) .floating-panel-group.fig-edit-open > .floating-panel {
      opacity: 1; visibility: visible; transform: none; pointer-events: auto;
    }
    html.in-editor:not(.fig-entrance-live) .subpage.fig-edit-open { display: flex; }
    html.in-editor:not(.fig-entrance-live) .subpage.fig-edit-aside { display: none !important; }
    html.in-editor:not(.fig-entrance-live) .subpage { animation: none; }

    /* A blocking subpage's backdrop, as visitors see it: shown here as a
       popover in the top layer (_syncTopLayer), its ::backdrop takes the
       colour and blur of the published :modal one. Clicks pass through,
       so the page behind stays editable. Without popovers, a shadow
       stands in for the colour. */
    html.in-editor .subpage:popover-open:not([data-subpage-mode="float"])::backdrop {
      background: var(--sp-backdrop, rgba(0, 0, 0, 0.6));
      -webkit-backdrop-filter: blur(var(--sp-backdrop-blur, 0px));
      backdrop-filter: blur(var(--sp-backdrop-blur, 0px));
      pointer-events: none;
    }
    html.in-editor .subpage:is(.is-open, .fig-edit-open):not([popover]):not([data-subpage-mode="float"]) {
      box-shadow: var(--sp-shadow, 0 0 #0000), 0 0 0 100vmax var(--sp-backdrop, rgba(0, 0, 0, 0.6));
    }

    /* Repaints a fixed page background (see _watchBackground). */
    html.fig-bg-repaint > body { background-origin: border-box !important; }

    /* Spacers are hatched while editing so they can be selected. */
    html.in-editor :is(.spacer-sm, .spacer-md, .spacer-lg) {
      background-image: repeating-linear-gradient(45deg,
        rgba(127, 127, 127, 0.22) 0 6px, transparent 6px 12px);
    }

    /* Canvas zoom. */
    html > body {
      zoom: var(--preview-zoom, 1) !important;
    }

    /* Entrances don't replay on every re-render while editing;
       Replay sets fig-entrance-live. */
    html.in-editor:not(.fig-entrance-live) [class*="anim-"] {
      --_enter-anim: linear 0.001s;
    }

    html:not(.fig-reveal-live) .reveal-fade,
    html:not(.fig-reveal-live) .reveal-slide-up,
    html:not(.fig-reveal-live) .reveal-slide-left,
    html:not(.fig-reveal-live) .reveal-slide-right,
    html:not(.fig-reveal-live) .reveal-zoom {
      opacity: 1 !important;
      transform: none !important;
    }

    /* In-canvas stand-ins for embeds (game-embed.preset.js). */
    .fig-embed-card {
      position: absolute; inset: 0; z-index: 2;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; padding: 16px; box-sizing: border-box; text-align: center;
      background: #141414; border: 1px dashed #3a3a3a; border-radius: inherit;
      color: #aaa; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .fig-embed-card-icon { width: 30px; height: 30px; opacity: .55; color: #888; }
    .fig-embed-card-icon svg { width: 100%; height: 100%; }
    .fig-embed-card-title { font-size: 13px; color: #ddd; font-weight: 600; }
    .fig-embed-card-meta { font-size: 10.5px; color: #777; letter-spacing: .3px; }
    .fig-embed-card-url { font-size: 11px; color: #555; word-break: break-all; max-width: 85%; }
    .fig-embed-card-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 6px; }
    .fig-embed-card-actions button {
      padding: 5px 11px; font: 11px system-ui, sans-serif; cursor: pointer;
      background: #262626; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;
    }
    .fig-embed-card-actions button.is-primary { background: #007acc; border-color: #007acc; color: #fff; }
    [data-gjs-embed-placeholder] a,
    [data-gjs-embed-placeholder] button { cursor: pointer; }


    html:not(.fig-outlines-visible) .gjs-dashed,
    html:not(.fig-outlines-visible) .gjs-dashed [data-gjs-type],
    html:not(.fig-outlines-visible) [data-gjs-type].gjs-dashed {
      outline: none !important;
      outline-offset: 0 !important;
    }

    /* Desktop and tablet keep their own branch of rules whose phone
       media query fires in a narrow canvas (see _syncDeviceMarker). */
    html.in-editor[data-fig-device="desktop"],
    html.in-editor[data-fig-device="tablet"] {
      zoom: var(--site-scale, 1) !important;
    }
    html.in-editor[data-fig-device="desktop"] > body,
    html.in-editor[data-fig-device="tablet"] > body {
      min-height: calc(100vh / var(--site-scale, 1) / var(--preview-zoom, 1)) !important;
      --_bg-zoom: var(--page-bg-zoom, 1) !important;
      --_bg-scale: calc(var(--site-scale, 1) * var(--preview-zoom, 1)) !important;
    }
    html.in-editor[data-fig-device="desktop"] .bg-noise::after,
    html.in-editor[data-fig-device="tablet"] .bg-noise::after {
      background-size: calc(
        var(--noise-size, 128px) /
        var(--site-scale, 1) /
        var(--preview-zoom, 1)
      ) !important;
    }
  `;
}

  function _applyOverrideCSS() {
    const doc = _canvasDoc();
    if (!doc || !doc.head) return;

    let style = doc.head.querySelector('style[data-editor-overrides]');
    if (!style) {
      style = doc.createElement('style');
      style.setAttribute('data-editor-overrides', '1');
    }
    if (style !== doc.head.lastElementChild) doc.head.appendChild(style);
    style.textContent = _buildOverrideCSS();

    try {
      doc.documentElement.classList.toggle('motion-paused', _paused());
    } catch (e) {}
  }

  // Key forwarding: canvas keydowns never reach the editor document.
  //   Ctrl+S save, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo,
  //   Delete / Backspace delete the selection.
  // Typing in contenteditable keeps native handling; undo waits while a
  // mouse button is held (undo-keyboard.js).

  function _installCanvasKeys(doc) {
    if (!doc || doc.__figKeyBound) return;
    doc.__figKeyBound = true;
    if (FigJS.undoKeys) FigJS.undoKeys.watchPointer(doc.defaultView);

    doc.addEventListener('keydown', (e) => {
      const t = e.target;
      const inText = !!(t && (t.isContentEditable
                              || t.tagName === 'INPUT'
                              || t.tagName === 'TEXTAREA'));

      if (!(e.ctrlKey || e.metaKey)) {
        if (inText) return;

        const k = e.key;
        const code = e.keyCode;
        const isDelete = (k === 'Delete' || k === 'Del' || code === 46);
        const isBack   = (k === 'Backspace' || code === 8);
        if (!isDelete && !isBack) return;

        const editor = FigJS.editor;
        if (!editor) return;
        const sel = editor.getSelectedAll && editor.getSelectedAll();
        if (!sel || !sel.length) return;

        e.preventDefault();
        e.stopPropagation();

        // The toolbar's delete command; direct removal if it is missing.
        let ran = false;
        try {
          if (editor.Commands && editor.Commands.has
              && editor.Commands.has('core:component-delete')) {
            editor.Commands.run('core:component-delete');
            ran = true;
          }
        } catch (err) {}
        if (!ran) {
          sel.forEach(function (comp) {
            try { comp.remove(); } catch (err) {}
          });
        }
        return;
      }

      const k = (e.key || '').toLowerCase();

      if (k === 's' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (FigJS.files && FigJS.files.save) FigJS.files.save();
        return;
      }

      if (k !== 'z' && k !== 'y') return;
      const keys = FigJS.undoKeys;
      if (keys && keys.pointerHeld()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (inText) return;

      const um = FigJS.editor && FigJS.editor.UndoManager;
      if (!um) return;
      e.preventDefault();
      e.stopPropagation();
      if (k === 'y' || (k === 'z' && e.shiftKey)) um.redo();
      else um.undo();
    }, true);
  }

  // Plain-text paste into text elements (no formatting, images or markup).
  // Line breaks become <br> inside the element: inserted as text, Chrome
  // splits them into <div> blocks, which become text elements nested in
  // the one being edited. Trailing breaks are dropped. Markdown blocks
  // handle their own paste.

  const _escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function _installPlainPaste(doc) {
    if (!doc || doc.__figPlainPaste) return;
    doc.__figPlainPaste = true;
    doc.addEventListener('paste', (e) => {
      const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
      if (!t || !t.isContentEditable) return;
      if (t.closest('.md-block-render')) return;
      const data = e.clipboardData;
      if (!data) return;
      e.preventDefault();
      const text = data.getData('text/plain').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      if (!text) return;
      if (text.indexOf('\n') < 0) doc.execCommand('insertText', false, text);
      else doc.execCommand('insertHTML', false, text.split('\n').map(_escapeHtml).join('<br>'));
    }, true);
  }

  // Markdown in text: editing an element in place shows its source (the
  // markers, which is what the page saves); leaving it formats it again.

  function _rawTextForEditing(view) {
    const doc = _canvasDoc();
    const win = doc && doc.defaultView;
    if (!win || !win.SiteText || !view) return;
    const box = view.getChildrenContainer ? view.getChildrenContainer() : view.el;
    if (!box || !box.querySelector('.text-format')) return;
    win.SiteText.restore(box);
    view.lastContent = box.innerHTML;
  }

  function _formatAfterEditing(view) {
    const doc = _canvasDoc();
    const win = doc && doc.defaultView;
    if (!win || !win.SiteText || !view) return;
    requestAnimationFrame(() => {
      const box = view.getChildrenContainer ? view.getChildrenContainer() : view.el;
      if (box && box.isConnected && !box.isContentEditable) win.SiteText.render(box);
    });
  }

  // ===================== Navigation blocking ===========================

  function _installNavBlocker(doc) {
    if (!doc || doc.__figNavBlocked) return;
    doc.__figNavBlocked = true;

    const inEditMode = () => true;
    const findAnchor = (e) => {
      let n = e.target;
      while (n && n !== doc) {
        if (n.tagName === 'A' && n.hasAttribute && n.hasAttribute('href')) return n;
        n = n.parentNode;
      }
      return null;
    };
    doc.addEventListener('click', (e) => {
      if (inEditMode() && findAnchor(e)) e.preventDefault();
    }, true);
    doc.addEventListener('auxclick', (e) => {
      if (inEditMode() && findAnchor(e)) e.preventDefault();
    }, true);
    doc.addEventListener('mousedown', (e) => {
      if (!inEditMode()) return;
      if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey) {
        if (findAnchor(e)) e.preventDefault();
      }
    }, true);
    doc.addEventListener('submit', (e) => {
      if (inEditMode()) e.preventDefault();
    }, true);
  }

  // ===================== Per-page install ==============================

  function install(baseHref) {
    const editor = FigJS.editor;
    if (!editor) return;
    const doc = editor.Canvas.getDocument();
    if (!doc || !doc.head) return;

    let base = doc.head.querySelector('base[data-editor-base]');
    if (!base) {
      base = doc.createElement('base');
      base.setAttribute('data-editor-base', '1');
      doc.head.insertBefore(base, doc.head.firstChild);
    }
    base.setAttribute('href', baseHref);

    _applyOverrideCSS();

    try { doc.documentElement.classList.add('in-editor'); } catch (e) {}
    try { if (doc.defaultView) doc.defaultView.__IS_EDITOR_CANVAS = true; } catch (e) {}

    _syncDeviceMarker();
    if (!editor.__figDeviceMarkerBound) {
      editor.__figDeviceMarkerBound = true;
      editor.on('change:device', _syncDeviceMarker);
      editor.on('canvas:frame:load', _syncDeviceMarker);
    }

    _watchAnimations(doc);
    _syncAnimations();

    _installCanvasKeys(doc);
    _installNavBlocker(doc);
    _installPreviewGuard(doc);
    _installPlainPaste(doc);
    _watchCollapsed(doc);

    _revealPreview = false;
    _replayButton(false);
    doc.documentElement.classList.remove('fig-entrance-live');
    doc.documentElement.classList.toggle('fig-reveal-live', _previewActive);
    if (!editor.__figRevealStopBound) {
      editor.__figRevealStopBound = true;
      ['component:selected', 'component:update', 'component:styleUpdate', 'undo', 'redo']
        .forEach((ev) => editor.on(ev, stopMotionPreview));
    }
    if (!editor.__figTextFormatBound) {
      editor.__figTextFormatBound = true;
      editor.on('rte:enable', _rawTextForEditing);
      editor.on('rte:disable', _formatAfterEditing);
    }

    _computeOutlineMarker();
    if (FigJS.pageBody) FigJS.pageBody.mirror();
  }

  function installForPage(relPath) {
    install(baseHrefFor(relPath));
  }

  // ===================== Dependency inclusion ==========================

  function ensureDeps() {
    const liveHead = document.getElementById('live-head');
    if (!liveHead) return;
    // A runtime file renamed since the page was saved: the new name, once.
    const renamed = window.PresetRegistry.getRenamedDependencies
      ? window.PresetRegistry.getRenamedDependencies() : {};
    Object.keys(renamed).forEach((from) => {
      if (!liveHead.value.includes('"' + from + '"')) return;
      const to = renamed[from];
      const tag = new RegExp('[ \\t]*<(script|link)\\b[^>]*"' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>(</script>)?[ \\t]*\\r?\\n?', 'g');
      liveHead.value = liveHead.value.includes('"' + to + '"')
        ? liveHead.value.replace(tag, '')
        : liveHead.value.split('"' + from + '"').join('"' + to + '"');
    });
    const deps = window.PresetRegistry.getDependencies();
    const parser = new DOMParser();
    const temp = parser.parseFromString(
      `<!DOCTYPE html><html><head>${liveHead.value}</head></html>`, 'text/html');
    const hrefs = Array.from(temp.querySelectorAll('link[rel="stylesheet"]'))
      .map((l) => l.getAttribute('href'));
    const srcs = Array.from(temp.querySelectorAll('script[src]'))
      .map((s) => s.getAttribute('src'));

    let additions = '';
    deps.css.forEach((href) => {
      if (!hrefs.includes(href)) additions += `\n<link rel="stylesheet" href="${href}">`;
    });
    deps.js.forEach((src) => {
      if (!srcs.includes(src)) additions += `\n<script src="${src}" defer><\/script>`;
    });
    if (additions) liveHead.value = (liveHead.value + additions).trim();
  }

  // ===================== Head -> canvas =================================

  function _headKey(el) {
    const copy = el.cloneNode(true);
    copy.classList.remove('injected-fig-head');
    if (!copy.getAttribute('class')) copy.removeAttribute('class');
    return copy.outerHTML;
  }

  function syncHead() {
    const editor = FigJS.editor;
    if (!editor) return;
    const liveHead = document.getElementById('live-head');
    if (!liveHead) return;

    const canvasHead = editor.Canvas.getDocument().head;

    const parser = new DOMParser();
    const temp = parser.parseFromString(
      `<!DOCTYPE html><html><head>${liveHead.value}</head></html>`, 'text/html');

    // Nodes already in the canvas stay, matched by markup: a site script
    // runs once per canvas, and unchanged stylesheets don't reload.
    const existing = new Map();
    canvasHead.querySelectorAll('.injected-fig-head').forEach((el) => {
      const key = _headKey(el);
      if (!existing.has(key)) existing.set(key, []);
      existing.get(key).push(el);
    });

    const wanted = [];
    Array.from(temp.head.children).forEach((child) => {
      if (child.tagName === 'LINK'
          && /\/assets\/css\/library\.css$/.test(child.getAttribute('href') || '')) return;
      if (child.tagName !== 'LINK' && child.tagName !== 'STYLE' && child.tagName !== 'SCRIPT') return;

      const pool = existing.get(child.outerHTML);
      if (pool && pool.length) { wanted.push(pool.shift()); return; }

      let fresh;
      if (child.tagName === 'SCRIPT') {
        fresh = document.createElement('script');
        Array.from(child.attributes).forEach((a) => fresh.setAttribute(a.name, a.value));
        fresh.textContent = child.textContent;
      } else {
        fresh = child.cloneNode(true);
      }
      fresh.classList.add('injected-fig-head');
      wanted.push(fresh);
    });

    existing.forEach((pool) => pool.forEach((el) => el.remove()));

    // Page head order; nodes already in sequence stay put.
    let cursor = null;
    wanted.forEach((node) => {
      const inPlace = cursor ? cursor.nextSibling === node : node.parentNode === canvasHead;
      if (!inPlace) canvasHead.insertBefore(node, cursor ? cursor.nextSibling : null);
      cursor = node;
    });

    _applyOverrideCSS();
    _syncAnimations();
  }

  // Re-fetches a stylesheet saved from the raw editor.
  function refreshStylesheet(relPath) {
    const doc = _canvasDoc();
    if (!doc) return;
    const url = '/' + String(relPath || '').replace(/^public\//, '');
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('?')[0];
      if (href === url) link.setAttribute('href', url + '?v=' + Date.now());
    });
  }

  // ===================== Outline visibility manager ====================

  function _computeOutlineMarker() {
    const editor = FigJS.editor;
    if (!editor) return;
    const doc = editor.Canvas.getDocument();
    if (!doc) return;

    const btn = editor.Panels.getButton('options', 'sw-visibility');
    const btnActive = btn ? btn.get('active') !== false : true;
    const shouldShow = !_previewActive && btnActive;

    doc.documentElement.classList.toggle('fig-outlines-visible', shouldShow);
    _scheduleCollapsed();
  }

  // Canvas markers, drawn over the canvas (never in the page, so the
  // layout stays the page's). While View Components is on:
  //   - elements laid out at zero width or height, as a dashed box that
  //     selects the element when clicked;
  //   - notes on elements, such as an audio player without a source;
  //   - a tab per closed subpage, docked at the top right, that opens it.
  // While a subpage is selected: a tag on each element that opens it.
  // While editing: a "Show closed" tab under each element opened for editing.

  const COLLAPSE_SKIP = new Set(['BR', 'HR', 'IMG', 'SCRIPT', 'STYLE', 'SOURCE', 'TRACK', 'TEMPLATE', 'AUDIO', 'VIDEO']);
  // Collapsed by design: a closed accordion opens for editing.
  const COLLAPSE_BY_DESIGN = '.accordion-body';
  const NOTES = [['.audio-player.is-unavailable', 'No audio source']];
  const MARK_MIN = 10;
  let _collapsedTimer = 0;
  let _placeFrame = 0;
  let _marks = [];

  // Open for editing: an accordion, floating panel, subpage or gallery
  // viewer opens in the canvas when it or anything inside is selected, or
  // when a drag rests on it (a canvas-only class, never saved). One at a
  // time: opening one closes the others, but not those it sits in, and
  // selecting outside an opened one closes it (a gallery viewer counts its
  // gallery's images as inside: picking a slide previews it). It also
  // closes with its "Show closed" tab or a change of its declared state.
  // A drag only opens (closing mid-drag would move the selection); the
  // next selection tidies up. A subpage declared open steps aside (hidden,
  // docked) while another subpage is being edited.

  // A gallery showing one image opens (shows every image, gallery.js) when
  // a hidden image or anything in one is selected, not for the gallery or
  // its cover, so their settings show as the page does.
  const GALLERY_ONE = '.gallery-viewer[data-gallery-display="single"]';
  const OPENABLE = '.accordion-item, .floating-panel-group, .subpage, ' + GALLERY_ONE;
  const OPENABLE_PART = ':scope > .accordion-body, :scope > .floating-panel';
  const EDIT_OPEN = 'fig-edit-open';
  const ASIDE = 'fig-edit-aside';
  const SPRING_MS = 450;
  const _editOpen = new Set();
  const _declaredOpen = new WeakMap();
  let _closingEditOpen = false;
  let _springEl = null;
  let _springTimer = 0;

  function _applyEditOpen() {
    const doc = _canvasDoc();
    if (!doc) return;
    _editOpen.forEach((model) => {
      const el = model.getEl && model.getEl();
      if (el && el.ownerDocument === doc && !el.classList.contains(EDIT_OPEN)) el.classList.add(EDIT_OPEN);
    });
    _syncTopLayer(doc);
  }

  // A subpage declared open steps aside while a subpage it is not part of
  // (nor holds) is being edited; Replay shows it as declared.
  function _syncAside(doc) {
    if (!doc || !doc.body) return;
    const live = doc.documentElement.classList.contains('fig-entrance-live');
    const editing = live ? [] : Array.from(_editOpen)
      .map((m) => m.getEl && m.getEl())
      .filter((el) => el && el.matches && el.matches('.subpage'));
    doc.body.querySelectorAll('.subpage.is-open, .subpage.' + ASIDE).forEach((el) => {
      const aside = el.classList.contains('is-open') && editing.length > 0
        && !editing.some((e) => e === el || e.contains(el) || el.contains(e));
      if (el.classList.contains(ASIDE) !== aside) el.classList.toggle(ASIDE, aside);
    });
  }

  // A shown subpage sits in the top layer, as on the published page, so a
  // transformed ancestor (a hovered card) can't become its containing block.
  // Canvas-only: the popover attribute is never in the model.
  const _topLayered = new WeakSet();

  function _showTop(el) {
    const doc = el.ownerDocument;
    const inner = doc.activeElement;
    const outer = document.activeElement;
    const sel = doc.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    // Inert while shown, so the dialog doesn't take focus from the editor;
    // text being edited inside gets its focus and caret back.
    const wasInert = el.inert;
    el.inert = true;
    try {
      el.setAttribute('popover', 'manual');
      el.showPopover();
      _topLayered.add(el);
    } catch (e) {}
    el.inert = wasInert;
    if (doc.activeElement !== inner && inner && inner !== doc.body && inner.focus) {
      inner.focus({ preventScroll: true });
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
    }
    if (document.activeElement !== outer && outer && outer.focus) outer.focus({ preventScroll: true });
  }

  function _syncTopLayer(doc) {
    if (!doc || !doc.body) return;
    _syncAside(doc);
    // During a replay only declared-open subpages show (a top-layer one
    // would dim the page with its backdrop while hidden).
    const live = doc.documentElement.classList.contains('fig-entrance-live');
    const want = Array.from(doc.body.querySelectorAll(live ? 'dialog.subpage.is-open' : 'dialog.subpage:is(.is-open, .' + EDIT_OPEN + ')'))
      .filter((el) => !el.classList.contains(ASIDE));
    doc.body.querySelectorAll('dialog.subpage[popover]').forEach((el) => {
      if (!_topLayered.has(el) || want.includes(el)) return;
      _topLayered.delete(el);
      try { el.hidePopover(); } catch (e) {}
      el.removeAttribute('popover');
    });
    // Document order, so an outer subpage stays beneath the ones inside it.
    let reshow = false;
    want.forEach((el) => {
      if (typeof el.showPopover !== 'function') return;
      const shown = el.matches(':popover-open');
      if (shown && !reshow) return;
      if (shown) { try { el.hidePopover(); } catch (e) {} }
      _showTop(el);
      reshow = true;
    });
  }

  function _openForEditing(models) {
    let changed = false;
    models.forEach((m) => {
      if (_editOpen.has(m)) return;
      _editOpen.add(m);
      _declaredOpen.set(m, m.getClasses().includes('is-open'));
      changed = true;
    });
    if (!changed) return;
    _applyEditOpen();
    _scheduleCollapsed();
  }

  // Whether an opened element holds the selection: it or something in it
  // is selected (for a gallery viewer, anything in its gallery).
  function _holdsSelection(model, selected) {
    const el = model.getEl && model.getEl();
    if (!el) return false;
    const scope = el.matches('.gallery-view') && el.parentElement ? el.parentElement : el;
    return selected.some((c) => {
      const cel = c.getEl && c.getEl();
      return c === model || (!!cel && scope.contains(cel));
    });
  }

  // What the selection opens: every openable element around it (a hidden
  // image of a one-image gallery opens that gallery).
  function _openersOfSelection(selected) {
    const found = [];
    selected.forEach((c) => {
      const sel = c.getEl && c.getEl();
      for (let m = c; m; m = m.parent && m.parent()) {
        const el = m.getEl && m.getEl();
        if (!el || !el.matches || !el.matches(OPENABLE)) continue;
        if (el.matches(GALLERY_ONE)) {
          const hidden = sel && sel.closest && sel.closest('.gallery-tile-rest');
          if (!hidden || !el.contains(hidden)) continue;
        }
        found.push(m);
      }
    });
    return found;
  }

  // One at a time: what the selection has left closes, once it settles (a
  // new selection first deselects, leaving nothing selected for a moment).
  let _leaveTimer = 0;
  function _closeLeft() {
    _leaveTimer = 0;
    const kept = new Set(_heldRemoved);
    _heldRemoved.clear();
    const doc = _canvasDoc();
    if (_closingEditOpen || !doc || doc.documentElement.classList.contains('fig-dragging')) return;
    const selected = FigJS.editor.getSelectedAll();
    const found = _openersOfSelection(selected);
    Array.from(_editOpen).forEach((m) => {
      if (found.includes(m) || _holdsSelection(m, selected)) return;
      if (!selected.length && kept.has(m)) return;
      _closeEditOpen(m);
    });
  }

  // Deleting an element leaves nothing selected, which isn't leaving what
  // held it: the opened elements around it stay open (a gallery viewer
  // holds its gallery's images).
  const _heldRemoved = new Set();
  function _noteRemoval(comp) {
    const cel = comp && comp.getEl && comp.getEl();
    if (!cel) return;
    _editOpen.forEach((m) => {
      const el = m.getEl && m.getEl();
      if (!el || el === cel) return;
      const scope = el.matches('.gallery-view') && el.parentElement ? el.parentElement : el;
      if (scope.contains(cel)) _heldRemoved.add(m);
    });
  }

  function _openForSelection() {
    if (_closingEditOpen) return;
    _openForEditing(_openersOfSelection(FigJS.editor.getSelectedAll()));
    clearTimeout(_leaveTimer);
    _leaveTimer = setTimeout(_closeLeft, 0);
  }

  function _closeEditOpen(model) {
    const editor = FigJS.editor;
    _editOpen.delete(model);
    const el = model.getEl && model.getEl();
    if (el) el.classList.remove(EDIT_OPEN);
    // A selection left inside the closed part moves to the element itself;
    // a subpage hides whole, so it moves to its parent (or clears), and
    // selecting the subpage again opens it.
    const whole = !!el && el.matches('.subpage');
    // A gallery hides its images again (all but the cover, which gallery.js
    // marks a moment later): a selection in any of them moves to the gallery.
    // A cover of its own stays shown.
    const gallery = !!el && el.matches(GALLERY_ONE);
    const parts = !el ? [] : whole ? [el]
      : gallery ? Array.from(el.children).filter((n) => !n.matches('.gallery-view, .gallery-badge-box, [data-gallery-cover="separate"]'))
      : Array.from(el.querySelectorAll(OPENABLE_PART));
    const hidden = editor.getSelectedAll().some((c) => {
      const cel = c.getEl && c.getEl();
      return cel && parts.some((p) => p.contains(cel));
    });
    if (hidden) {
      const parent = whole && model.parent && model.parent();
      const next = whole ? (parent && parent !== editor.getWrapper() ? parent : null) : model;
      _closingEditOpen = true;
      try { editor.select(next); } finally { _closingEditOpen = false; }
    }
    _scheduleCollapsed();
  }

  // A changed declared state (Settings > State) shows as declared.
  function _onClassesChange(model) {
    if (!_editOpen.has(model)) return;
    const open = model.getClasses().includes('is-open');
    if (_declaredOpen.get(model) !== open) _closeEditOpen(model);
  }

  function _springOver(e) {
    const doc = _canvasDoc();
    if (!doc || !doc.documentElement.classList.contains('fig-dragging')) return;
    const el = e.target && e.target.closest ? e.target.closest(OPENABLE) : null;
    const closed = el && !el.classList.contains('is-open') && !el.classList.contains(EDIT_OPEN);
    if (el === _springEl && closed) return;
    clearTimeout(_springTimer);
    _springEl = closed ? el : null;
    if (!closed) return;
    _springTimer = setTimeout(() => {
      const model = el.__gjsv && el.__gjsv.model;
      _springEl = null;
      if (model && el.isConnected) _openForEditing([model]);
    }, SPRING_MS);
  }

  function _editOpenMarks(doc) {
    const root = doc.documentElement;
    if (!root.classList.contains('in-editor') || root.classList.contains('fig-entrance-live')) return [];
    const out = [];
    _editOpen.forEach((model) => {
      const el = model.getEl && model.getEl();
      if (!el || !el.isConnected) { _editOpen.delete(model); return; }
      if (el.matches('.gallery-viewer')) {
        // Shows every image anyway: nothing to close.
        if (!el.matches(GALLERY_ONE)) { _editOpen.delete(model); el.classList.remove(EDIT_OPEN); return; }
        out.push({ el, note: 'Show one image', model });
        return;
      }
      if (!el.classList.contains('is-open')) out.push({ el, note: 'Show closed', model });
    });
    return out;
  }

  function _markLayer() {
    const editor = FigJS.editor;
    const host = editor && editor.Canvas.getElement && editor.Canvas.getElement();
    if (!host) return null;
    let layer = host.querySelector(':scope > .fig-mark-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'fig-mark-layer';
      layer.hidden = true;
      layer.addEventListener('mousedown', (e) => {
        const mark = e.target.closest('.fig-mark');
        const item = mark && _marks[Number(mark.dataset.i)];
        const model = item && (item.model || (item.el.__gjsv && item.el.__gjsv.model));
        if (!model) return;
        e.preventDefault();
        e.stopPropagation();
        if (item.model) _closeEditOpen(model);
        else editor.select(model);
        // Selecting what is already selected opens nothing on its own (nor
        // ends a replay, which would keep it hidden).
        if (item.dock) {
          stopMotionPreview();
          _openForEditing([model]);
        }
      });
      // Under GrapesJS's tools (toolbar, highlighters).
      host.insertBefore(layer, host.querySelector(':scope > .gjs-cv-canvas__tools'));
    }
    return layer;
  }

  function _findMarks(doc) {
    const win = doc.defaultView;
    const found = [];
    doc.body.querySelectorAll('[data-gjs-type]').forEach((el) => {
      if (typeof el.offsetWidth !== 'number' || COLLAPSE_SKIP.has(el.tagName)) return;
      if (el.getAttribute('data-gjs-type') === 'wrapper' || el.getAttribute('data-gjs-type') === 'textnode') return;
      if (el.offsetWidth && el.offsetHeight) return;
      if (el.matches(COLLAPSE_BY_DESIGN)) return;
      if (!el.getClientRects().length) return;
      const display = win.getComputedStyle(el).display;
      if (display === 'inline' || display === 'contents' || display === 'none') return;
      found.push({ el, note: '' });
    });
    NOTES.forEach(([sel, note]) => doc.body.querySelectorAll(sel).forEach((el) => found.push({ el, note })));
    doc.body.querySelectorAll('.subpage:not(.is-open):not(.' + EDIT_OPEN + '), .subpage.' + ASIDE).forEach((el) => {
      const model = el.__gjsv && el.__gjsv.model;
      const name = model && model.getName ? model.getName() : '';
      const kind = el.matches('.gallery-view') ? 'Gallery' : 'Subpage';
      found.push({ el, note: name.charAt(0) === '#' ? kind + ' ' + name : kind, dock: true });
    });
    return found;
  }

  // While a subpage or gallery viewer is selected: a tag on each element
  // on the page that opens it (FigJS.links), which selects that element.
  function _openerMarks(doc) {
    if (!FigJS.links || !doc.documentElement.classList.contains('in-editor')) return [];
    const out = [];
    FigJS.editor.getSelectedAll().forEach((c) => {
      const el = c.getEl && c.getEl();
      if (!el || el.ownerDocument !== doc || !el.matches('.subpage')) return;
      FigJS.links.openersOf(el).forEach((o) => {
        if (o.node.getClientRects().length) out.push({ el: o.node, note: 'Opens #' + o.id, opener: true });
      });
    });
    return out;
  }

  function _markCollapsed() {
    _collapsedTimer = 0;
    const doc = _canvasDoc();
    if (!doc || !doc.body) { _marks = []; _placeMarks(); return; }
    _syncTopLayer(doc);
    const on = doc.documentElement.classList.contains('fig-outlines-visible');
    _marks = (on ? _findMarks(doc) : []).concat(_editOpenMarks(doc), _openerMarks(doc));
    _placeMarks();
  }

  function _placeMarks() {
    _placeFrame = 0;
    const layer = _markLayer();
    if (!layer) return;
    const frame = FigJS.editor.Canvas.getFrameEl && FigJS.editor.Canvas.getFrameEl();
    const live = _marks.filter((m) => m.el.isConnected);
    if (!frame || !live.length) {
      layer.hidden = true;
      layer.replaceChildren();
      return;
    }
    _marks = live;
    const host = layer.parentElement.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    layer.hidden = false;
    layer.style.left = (f.left - host.left) + 'px';
    layer.style.top = (f.top - host.top) + 'px';
    layer.style.width = f.width + 'px';
    layer.style.height = f.height + 'px';
    const selected = new Set(FigJS.editor.getSelectedAll().map((c) => c.getEl && c.getEl()));
    while (layer.children.length > _marks.length) layer.lastChild.remove();
    let docked = 0;
    _marks.forEach((m, i) => {
      let node = layer.children[i];
      if (!node) {
        node = document.createElement('div');
        layer.appendChild(node);
      }
      const r = m.el.getBoundingClientRect();
      node.dataset.i = String(i);
      const model = m.el.__gjsv && m.el.__gjsv.model;
      if (m.dock) {
        node.className = 'fig-mark is-note is-action';
        node.title = 'Closed subpage: open it for editing';
        node.textContent = m.note;
        node.style.left = (f.width - 8) + 'px';
        node.style.top = (8 + docked++ * 22) + 'px';
        node.style.width = node.style.height = '';
        return;
      }
      if (m.model) {
        // Centred on the top edge: above it when there is room, else just
        // inside, and kept on screen while the element is.
        node.className = 'fig-mark is-note is-action is-top';
        node.title = m.el.matches('.gallery-viewer')
          ? 'Every image shown for editing. Show the cover alone, as the page does'
          : 'Opened for editing. Show it closed, as the page declares it';
        node.textContent = m.note;
        const above = r.top - 24;
        node.style.left = Math.max(48, Math.min(f.width - 48, r.left + r.width / 2)) + 'px';
        node.style.top = (above >= 4 ? above : Math.max(4, Math.min(r.top + 6, r.bottom - 26))) + 'px';
        node.style.width = node.style.height = '';
        return;
      }
      node.className = 'fig-mark' + (m.note ? ' is-note' : '') + (m.opener ? ' is-action is-opener' : '') + (selected.has(m.el) ? ' is-selected' : '');
      node.title = m.opener ? 'Opens the selected subpage: select it'
        : (m.note || 'Zero size') + (model && model.getName ? ': ' + model.getName() : '');
      if (m.opener) {
        // At its top-left corner, so a short link keeps its tag on screen
        // and stacked openers keep theirs apart.
        node.textContent = m.note;
        node.style.left = Math.max(2, r.left) + 'px';
        node.style.top = Math.max(2, r.top) + 'px';
        node.style.width = node.style.height = '';
        return;
      }
      if (m.note) {
        node.textContent = m.note;
        node.style.left = (r.right - 4) + 'px';
        node.style.top = (r.top + 4) + 'px';
        node.style.width = node.style.height = '';
        return;
      }
      node.textContent = '';
      const w = Math.max(r.width, MARK_MIN);
      const h = Math.max(r.height, MARK_MIN);
      node.style.left = (r.left + r.width / 2 - w / 2) + 'px';
      node.style.top = (r.top + r.height / 2 - h / 2) + 'px';
      node.style.width = w + 'px';
      node.style.height = h + 'px';
    });
  }

  function _scheduleCollapsed() {
    if (_collapsedTimer) return;
    _collapsedTimer = setTimeout(_markCollapsed, 150);
  }

  function _schedulePlace() {
    if (_placeFrame || !_marks.length) return;
    _placeFrame = requestAnimationFrame(_placeMarks);
  }

  function _watchCollapsed(doc) {
    if (!doc || !doc.body || doc.__figCollapseWatch) return;
    doc.__figCollapseWatch = true;
    // Re-rendered elements get their edit-open class back before paint.
    new MutationObserver(() => { _applyEditOpen(); _scheduleCollapsed(); })
      .observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'id'] });
    doc.addEventListener('dragover', _springOver, true);
    doc.addEventListener('mousemove', _springOver, true);
    _watchBackground(doc);
    if (doc.defaultView) {
      doc.defaultView.addEventListener('resize', _scheduleCollapsed);
      doc.defaultView.addEventListener('scroll', _schedulePlace, { passive: true });
    }
    if (window.ResizeObserver) new ResizeObserver(_scheduleCollapsed).observe(doc.body);
    const editor = FigJS.editor;
    if (editor && !editor.__figCollapseBound) {
      editor.__figCollapseBound = true;
      ['component:styleUpdate', 'styleable:change', 'change:device', 'canvas:frame:load'].forEach((ev) => editor.on(ev, _scheduleCollapsed));
      ['component:toggled', 'canvas:update'].forEach((ev) => editor.on(ev, _schedulePlace));
      editor.on('component:toggled', _openForSelection);
      editor.on('component:remove:before', _noteRemoval);
      // Opener tags follow the selection.
      editor.on('component:toggled', _scheduleCollapsed);
      editor.on('component:update:classes', _onClassesChange);
      editor.on('canvas:frame:load', () => _editOpen.clear());
      window.addEventListener('resize', _schedulePlace);
      const area = document.getElementById('canvas-wrapper');
      if (area && window.ResizeObserver) new ResizeObserver(_schedulePlace).observe(area);
      // Drop room while dragging (see _emptyContainerCSS).
      const dragging = (on) => {
        const d = _canvasDoc();
        if (d && d.documentElement) d.documentElement.classList.toggle('fig-dragging', on);
      };
      ['block:drag:start', 'component:drag:start'].forEach((ev) => editor.on(ev, () => dragging(true)));
      ['block:drag:stop', 'component:drag:end'].forEach((ev) => editor.on(ev, () => {
        dragging(false);
        clearTimeout(_springTimer);
        _springEl = null;
      }));
    }
  }

  // Chromium can leave a fixed page background stale after the canvas
  // grows or resizes, until something repaints it; repaint it then.
  function _watchBackground(doc) {
    const win = doc.defaultView;
    if (!win || !win.ResizeObserver) return;
    let height = 0;
    let frame = 0;
    const repaint = () => {
      frame = 0;
      if (!doc.body || !/fixed/.test(win.getComputedStyle(doc.body).backgroundAttachment)) return;
      doc.documentElement.classList.add('fig-bg-repaint');
      win.requestAnimationFrame(() => doc.documentElement.classList.remove('fig-bg-repaint'));
    };
    const check = (force) => {
      const h = doc.documentElement.scrollHeight;
      if (h === height && force !== true) return;
      height = h;
      if (!frame) frame = win.requestAnimationFrame(repaint);
    };
    const ro = new win.ResizeObserver(check);
    ro.observe(doc.documentElement);
    ro.observe(doc.body);
    win.addEventListener('resize', () => check(true));
  }

  // Preview is look-only: rendered as on the site, hover and scrolling
  // work, nothing can be clicked, submitted, typed into or played.
  const GUARDED_EVENTS = [
    'click', 'dblclick', 'auxclick', 'contextmenu',
    'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'submit',
    'keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'change',
  ];

  function _installPreviewGuard(doc) {
    const win = doc && doc.defaultView;
    if (!win || win.__figPreviewGuard) return;
    win.__figPreviewGuard = true;

    const guard = (e) => {
      if (!_previewActive) return;
      if (e.type === 'keydown' && e.key === 'Escape') {
        if (FigJS.preview) FigJS.preview.stop();
      }
      e.stopImmediatePropagation();
      // Keys and touches keep scrolling; what they would activate is a cancelled click.
      if (!/^key|^touch/.test(e.type)) e.preventDefault();
    };
    GUARDED_EVENTS.forEach((t) => win.addEventListener(t, guard, true));

    doc.addEventListener('play', (e) => {
      if (_previewActive && e.target && e.target.pause) e.target.pause();
    }, true);
  }

  // Replay: entrances play from the start and reveals run as on the site
  // until the next edit or selection; pressing again restarts.
  let _revealPreview = false;

  function _replayButton(on) {
    const btn = document.getElementById('btn-test-motion');
    if (btn) btn.classList.toggle('active', on);
  }

  function startMotionPreview() {
    const doc = _canvasDoc();
    if (!doc) return;
    // Replay plays the page as declared: a subpage (or gallery viewer) open
    // only for editing closes for real, so it docks with the other closed
    // ones and a click reopens it, instead of hiding while still counted as
    // open. First, as closing may move the selection, which ends a replay.
    Array.from(_editOpen).forEach((model) => {
      const el = model.getEl && model.getEl();
      if (el && el.matches('.subpage') && !el.classList.contains('is-open')) _closeEditOpen(model);
    });
    _revealPreview = true;
    const root = doc.documentElement;
    root.classList.remove('fig-entrance-live');
    void root.offsetWidth;
    root.classList.add('fig-entrance-live', 'fig-reveal-live');
    void root.offsetWidth;
    doc.getAnimations().forEach((a) => {
      try { a.currentTime = 0; a.play(); } catch (e) {}
    });
    _syncAnimations();
    const win = doc.defaultView;
    if (win && win.SiteReveal) win.SiteReveal.replay();
    doc.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (/\.gif(\?|$)/i.test(src)) img.setAttribute('src', src.split('?')[0] + '?t=' + Date.now());
    });
    _replayButton(true);
    _scheduleCollapsed();
  }

  function stopMotionPreview() {
    if (!_revealPreview) return;
    _revealPreview = false;
    _replayButton(false);
    const doc = _canvasDoc();
    if (!doc) return;
    doc.documentElement.classList.remove('fig-entrance-live');
    if (!_previewActive) doc.documentElement.classList.remove('fig-reveal-live');
    _scheduleCollapsed();
  }

  function setPreviewActive(active) {
    _previewActive = !!active;
    _computeOutlineMarker();

    const doc = _canvasDoc();
    if (doc && doc.documentElement) {
      const root = doc.documentElement;
      root.classList.toggle('fig-reveal-live', _previewActive || _revealPreview);
      if (_previewActive && doc.defaultView && doc.defaultView.SiteReveal) doc.defaultView.SiteReveal.replay();
      root.classList.toggle('in-editor', !_previewActive);
      root.classList.toggle('fig-previewing', _previewActive);
      if (_previewActive) {
        try { if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur(); } catch (e) {}
        doc.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); } catch (e) {} });
      }
    }
    setMotionPaused(_motionPaused);
  }

  function _syncCommandToButton() {
    const editor = FigJS.editor;
    if (!editor) return;
    const btn = editor.Panels.getButton('options', 'sw-visibility');
    if (!btn) return;

    const wantOn = btn.get('active') !== false;
    const cmd = btn.get('command') || 'core:component-outline';

    let isRunning = false;
    try { isRunning = editor.Commands.isActive(cmd); } catch (e) {}

    if (wantOn && !isRunning) {
      try { editor.runCommand(cmd); }
      catch (e) {
        try { editor.runCommand('sw-visibility'); } catch (e2) {}
      }
    } else if (!wantOn && isRunning) {
      try { editor.stopCommand(cmd); } catch (e) {}
      try { editor.stopCommand('sw-visibility'); } catch (e) {}
    }
  }

  function installOutlineManager() {
    if (_outlineManagerInstalled) return;
    const editor = FigJS.editor;
    if (!editor) return;
    _outlineManagerInstalled = true;

    _syncCommandToButton();

    const btn = editor.Panels.getButton('options', 'sw-visibility');
    if (btn) btn.on('change:active', _computeOutlineMarker);

    ['core:component-outline', 'sw-visibility'].forEach((cmd) => {
      editor.on('command:run:' + cmd, _computeOutlineMarker);
      editor.on('command:stop:' + cmd, _computeOutlineMarker);
    });

    _computeOutlineMarker();
  }

  FigJS.canvas = {
    closeEditOpen: (model) => { if (_editOpen.has(model)) _closeEditOpen(model); },
    baseHrefFor,
    install,
    installForPage,
    ensureDeps,
    syncHead,
    refreshStylesheet,
    installOutlineManager,
    setPreviewActive,
    setMotionPaused,
    startMotionPreview,
    stopMotionPreview,
  };
})();