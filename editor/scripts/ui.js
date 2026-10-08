// Editor chrome: zoom, devices, left panel tabs, panel resizers, the
// Presets panel, block search, motion replay / pause, promote-to-class,
// the header probe, toolbar wheel scrolling, keyboard shortcuts and
// their cheat sheet.
//   FigJS.ui.install() / applyZoom(pct) / getZoomValue() / switchTab(name)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  let zoomSlider = null;
  let zoomLabel  = null;
  let leftPanel  = null;
  let presetsContentEl = null;

  const BLOCK_SEARCH_ID = 'gjs-block-search';
  let blockSearchTerm = '';

  // ===================== Toolbar horizontal scroll =====================

  function installToolbarScroll() {
    const toolbar = document.getElementById('editor-toolbar');
    if (!toolbar || toolbar.__figWheelBound) return;
    toolbar.__figWheelBound = true;

    toolbar.addEventListener('wheel', (e) => {
      if (toolbar.scrollWidth <= toolbar.clientWidth) return;
      const dy = e.deltaY;
      const dx = e.deltaX;
      if (Math.abs(dy) > Math.abs(dx)) {
        toolbar.scrollLeft += dy;
        e.preventDefault();
      }
    }, { passive: false });
  }

  // Zoom is a CSS variable on the canvas <html>, applied by canvas.js's
  // override sheet; never part of the page.
  function applyZoom(pct) {
    const editor = FigJS.editor;
    if (editor) {
      try {
        const doc = editor.Canvas.getDocument();
        if (doc && doc.documentElement) {
          doc.documentElement.style.setProperty('--preview-zoom', String(pct / 100));
          if (doc.body && doc.body.style.zoom) doc.body.style.removeProperty('zoom');
        }
      } catch (e) {}
    }
    if (zoomLabel) zoomLabel.textContent = `${pct}%`;
  }

  function getZoomValue() {
    return zoomSlider ? Number(zoomSlider.value) : 100;
  }

  function nudgeZoom(delta) {
    const slider = zoomSlider || document.getElementById('zoom-slider');
    if (!slider) return;
    const min = Number(slider.min) || 25;
    const max = Number(slider.max) || 200;
    const current = Number(slider.value) || 100;
    let next = current + delta;
    next = Math.max(min, Math.min(max, next));
    if (next === current) return;
    slider.value = String(next);
    applyZoom(next);
  }

  function resetZoom() {
    const slider = zoomSlider || document.getElementById('zoom-slider');
    if (!slider) return;
    if (Number(slider.value) === 100) return;
    slider.value = '100';
    applyZoom(100);
  }

  // ===================== Left-panel tabs ===============================

  function switchTab(name) {
    document.querySelectorAll('.panel-tab')
      .forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel-tab-body')
      .forEach((b) => b.classList.toggle('active', b.id === 'tab-' + name));

    if (name === 'page' && FigJS.pageTab) FigJS.pageTab.refresh();
    if (name === 'media' && FigJS.media) FigJS.media.render();
    if (name === 'library' && FigJS.library) FigJS.library.refreshList();
  }

  function cycleLeftTab(dir) {
    const tabs = Array.from(document.querySelectorAll('.panel-tab'));
    if (!tabs.length) return;
    let current = tabs.findIndex((t) => t.classList.contains('active'));
    if (current === -1) current = 0;
    const next = (current + dir + tabs.length) % tabs.length;
    const name = tabs[next].dataset.tab;
    if (name) switchTab(name);
  }

  // Sidebar edge-drag resize.

  function setupEdgeResizer(handle, { min, max, getCurrentPx, apply, storageKey, invert }) {
    const saved = localStorage.getItem(storageKey);
    if (saved) apply(Math.min(max, Math.max(min, parseFloat(saved))));

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();

      const startX = e.clientX;
      const startPx = getCurrentPx();
      let pending = null;
      let rafId = 0;

      const iframes = Array.from(document.querySelectorAll('iframe'));
      iframes.forEach((f) => { f.style.pointerEvents = 'none'; });

      document.documentElement.classList.add('fig-resizing');
      handle.classList.add('dragging');
      document.body.classList.add('is-resizing-panel');

      const flush = () => {
        rafId = 0;
        if (pending == null) return;
        apply(pending);
        pending = null;
      };

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const size = Math.min(max, Math.max(min, startPx + (invert ? -dx : dx)));
        pending = size;
        if (!rafId) rafId = requestAnimationFrame(flush);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (pending != null) { apply(pending); pending = null; }
        handle.classList.remove('dragging');
        document.body.classList.remove('is-resizing-panel');
        document.documentElement.classList.remove('fig-resizing');
        iframes.forEach((f) => { f.style.pointerEvents = ''; });
        localStorage.setItem(storageKey, String(getCurrentPx()));
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ===================== Block Manager search ==========================

  function filterBlocks(term) {
    blockSearchTerm = term;
    const needle = term.trim().toLowerCase();

    document.querySelectorAll(
      '.gjs-pn-views-container .gjs-block-category'
    ).forEach((cat) => {
      let anyVisible = false;

      cat.querySelectorAll('.gjs-block').forEach((block) => {
        const labelEl = block.querySelector('.gjs-block-label');
        const label = ((labelEl && labelEl.textContent) || '').toLowerCase();
        const match = !needle || label.includes(needle);
        block.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });

      cat.style.display = anyVisible ? '' : 'none';
    });
  }

  function installBlockSearch() {
    requestAnimationFrame(() => {
      const viewsContainer = document.querySelector('.gjs-pn-views-container');
      if (!viewsContainer) return;

      const catsRoot = viewsContainer.querySelector('.gjs-block-categories');
      if (!catsRoot) return;

      if (viewsContainer.querySelector('#' + BLOCK_SEARCH_ID)) {
        if (blockSearchTerm) filterBlocks(blockSearchTerm);
        return;
      }

      const wrap = document.createElement('div');
      wrap.id = 'gjs-block-search-wrap';
      wrap.className = 'fig-sticky-bar';

      const input = document.createElement('input');
      input.type = 'search';
      input.id = BLOCK_SEARCH_ID;
      input.className = 'fig-input';
      input.placeholder = 'Search blocks';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = blockSearchTerm;
      input.addEventListener('input', () => filterBlocks(input.value));

      wrap.appendChild(input);
      catsRoot.parentNode.insertBefore(wrap, catsRoot);

      if (blockSearchTerm) filterBlocks(blockSearchTerm);
    });
  }

  // Shortcuts cheat sheet: Ctrl+/ or the toolbar button; outside click or Esc closes.

  const SHORTCUTS = [
    ['Ctrl+S',               'Save'],
    ['Ctrl+Z',               'Undo'],
    ['Ctrl+Shift+Z / Ctrl+Y','Redo'],
    ['Delete / Backspace',   'Delete selection'],
    ['Ctrl+D',               'Duplicate selection'],
    ['Ctrl+C',               'Copy selection'],
    ['Ctrl+V',               'Paste into selection (else after it)'],
    ['Ctrl+Shift+V',         'Paste after selection'],
    ['1 / 2 / 3',            'Desktop / Tablet / Phone'],
    ['4',                    'Play or pause motion'],
    ['5',                    'Preview'],
    ['6',                    'Fullscreen'],
    ['`',                    'Toggle sidebar'],
    ['[ / ]',                'Cycle left panel tabs'],
    ['Z / C',                'Cycle right panel'],
    ['Ctrl+= / Ctrl+-',      'Zoom in / out'],
    ['Ctrl+0',               'Reset zoom'],
    ['Ctrl+/',               'This cheat-sheet'],
  ];

  let shortcutsPanel = null;
  let shortcutsCleanup = null;

  function buildShortcutsPanel() {
    const panel = document.createElement('div');
    panel.id = 'fig-shortcuts-panel';
    panel.style.cssText = [
      'position: fixed',
      'z-index: 2147483640',
      'width: 260px',
      'padding: 12px 14px',
      'background: #1e1e1e',
      'border: 1px solid #333',
      'border-radius: 6px',
      'box-shadow: 0 8px 32px rgba(0,0,0,0.6)',
      'font-family: system-ui, -apple-system, sans-serif',
      'font-size: 11px',
      'color: #d8d8d8',
      'line-height: 1.5',
    ].join(';');

    const header = document.createElement('div');
    header.textContent = 'Keyboard shortcuts';
    header.style.cssText =
      'font-weight:600; color:#fff; font-size:12px; margin-bottom:8px;';
    panel.appendChild(header);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse;';
    SHORTCUTS.forEach(([keys, label]) => {
      const tr = document.createElement('tr');
      const kd = document.createElement('td');
      kd.textContent = keys;
      kd.style.cssText =
        'padding:2px 8px 2px 0; white-space:nowrap; ' +
        'font-family:ui-monospace,Menlo,Consolas,monospace; ' +
        'font-size:10.5px; color:#9cdcfe; vertical-align:top;';
      const ld = document.createElement('td');
      ld.textContent = label;
      ld.style.cssText = 'padding:2px 0; color:#c8c8c8; vertical-align:top;';
      tr.append(kd, ld);
      table.appendChild(tr);
    });
    panel.appendChild(table);
    return panel;
  }

  function openShortcutsPanel(anchor) {
    if (shortcutsPanel) { closeShortcutsPanel(); return; }
    shortcutsPanel = buildShortcutsPanel();
    document.body.appendChild(shortcutsPanel);

    // Below the toolbar, right-aligned with the 8px gutter.
    const rect = shortcutsPanel.getBoundingClientRect();
    const toolbar = document.getElementById('editor-toolbar');
    const top = toolbar ? toolbar.getBoundingClientRect().bottom + 6 : 44;
    const left = Math.max(8, window.innerWidth - rect.width - 12);
    shortcutsPanel.style.top = top + 'px';
    shortcutsPanel.style.left = left + 'px';

    const onOutside = (e) => {
      if (shortcutsPanel && !shortcutsPanel.contains(e.target) &&
          e.target !== anchor) {
        closeShortcutsPanel();
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeShortcutsPanel(); }
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onEsc, true);
    shortcutsCleanup = () => {
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onEsc, true);
    };
  }

  function closeShortcutsPanel() {
    if (!shortcutsPanel) return;
    try { shortcutsPanel.remove(); } catch (e) {}
    shortcutsPanel = null;
    if (shortcutsCleanup) {
      try { shortcutsCleanup(); } catch (e) {}
      shortcutsCleanup = null;
    }
  }

  function installShortcutsHelp() {
    const btn = document.getElementById('btn-shortcuts-help');
    if (!btn || btn.__figShortcutsHelpBound) return;
    btn.__figShortcutsHelpBound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openShortcutsPanel(btn);
    });
  }

  // Keyboard shortcuts, on the editor document and the canvas document:
  //   1 / 2 / 3   desktop / tablet / phone      4  motion on / off
  //   5           preview                       6  fullscreen
  //   `           collapse the left sidebar     [ / ]  left panel tabs
  //   z / c       right panel tabs              Ctrl+D  duplicate selection
  //   Ctrl+= / -  zoom                          Ctrl+0  reset zoom
  //   Ctrl+/      cheat sheet
  // Ctrl+S, Ctrl+Z / Y and Delete live in files.js, undo-keyboard.js and canvas.js.

  function isTypingTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function installShortcuts() {
    const editor = FigJS.editor;
    if (!editor || editor.__figShortcutsInstalled) return;
    editor.__figShortcutsInstalled = true;

    const DEVICES = ['desktop', 'tablet', 'phone'];

    function setDeviceByIndex(i) {
      const id = DEVICES[i];
      if (!id) return;
      editor.setDevice(id);
      document.querySelectorAll('.device-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.device === id);
      });
      applyZoom(getZoomValue());
    }

    function toggleMotion() {
      const btn = document.getElementById('btn-toggle-motion');
      if (btn) btn.click();
    }

    function togglePreview() {
      const cmds = editor.Commands;
      const active = cmds.isActive('core:preview') || cmds.isActive('preview');
      if (active) FigJS.preview.stop();
      else cmds.run('core:preview');
    }

    function enterFullscreen() {
      const b = editor.Panels.getButton('options', 'fullscreen');
      if (b) b.set('active', !b.get('active'));
      else editor.runCommand('core:fullscreen');
    }

    function toggleLeftSidebar() {
      const btn = document.getElementById('btn-toggle-files');
      if (btn) btn.click();
      else if (leftPanel) leftPanel.classList.toggle('collapsed');
    }

    function cycleRightPanel(dir) {
      const panel = editor.Panels.getPanel('views');
      if (!panel) return;
      const buttons = panel.get('buttons');
      if (!buttons) return;
      const models = buttons.models || [];
      const usable = models.filter((b) => b.get('command') && !b.get('disable'));
      if (!usable.length) return;

      let current = usable.findIndex((b) => b.get('active'));
      if (current === -1) current = dir > 0 ? -1 : 0;
      const next = (current + dir + usable.length) % usable.length;
      usable[next].set('active', true);
    }

    function duplicateSelection() {
      const sel = editor.getSelectedAll();
      if (!sel || !sel.length) return;
      const clones = [];
      sel.forEach((comp) => {
        const parent = comp.parent();
        if (!parent) return;
        const at = comp.index() + 1;
        try {
          const clone = comp.clone();
          parent.append(clone, { at });
          clones.push(clone);
        } catch (e) {}
      });
      if (clones.length) {
        try { editor.select(clones); } catch (e) {}
      }
    }

    function onKey(e) {
      // GrapesJS re-dispatches canvas keydowns on the <iframe> element (with
      // _parentEvent set); the canvas document's own listener already ran.
      if (e._parentEvent) return;

      if (isTypingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;

      if (mod && !e.altKey) {
        const lk = (k || '').toLowerCase();
        if (lk === 'd' && !e.shiftKey) { e.preventDefault(); duplicateSelection(); return; }
        if (k === '=' || k === '+')   { e.preventDefault(); nudgeZoom(10);  return; }
        if (k === '-' || k === '_')   { e.preventDefault(); nudgeZoom(-10); return; }
        if (k === '0')                { e.preventDefault(); resetZoom();     return; }
        if (k === '/' || k === '?')   {
          e.preventDefault();
          const btn = document.getElementById('btn-shortcuts-help');
          openShortcutsPanel(btn || document.body);
          return;
        }
        return;
      }

      if (e.altKey) return;

      if (k === '1') { e.preventDefault(); setDeviceByIndex(0); return; }
      if (k === '2') { e.preventDefault(); setDeviceByIndex(1); return; }
      if (k === '3') { e.preventDefault(); setDeviceByIndex(2); return; }
      if (k === '4') { e.preventDefault(); toggleMotion(); return; }
      if (k === '5') { e.preventDefault(); togglePreview(); return; }
      if (k === '6') { e.preventDefault(); enterFullscreen(); return; }
      if (k === '`' || k === '~') { e.preventDefault(); toggleLeftSidebar(); return; }
      if (k === '[') { e.preventDefault(); cycleLeftTab(-1); return; }
      if (k === ']') { e.preventDefault(); cycleLeftTab(1);  return; }
      if (k === 'z' || k === 'Z') { e.preventDefault(); cycleRightPanel(-1); return; }
      if (k === 'c' || k === 'C') { e.preventDefault(); cycleRightPanel(1);  return; }
    }

    document.addEventListener('keydown', onKey);

    // The canvas document, now and on every frame load.
    const attachToDoc = (doc) => {
      if (!doc || doc.__figShortcutsBound) return;
      doc.__figShortcutsBound = true;
      doc.addEventListener('keydown', onKey);
    };
    editor.on('canvas:frame:load', ({ doc }) => attachToDoc(doc));
    try { attachToDoc(editor.Canvas.getDocument()); } catch (e) {}
  }

  // ===================== Install =======================================

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;

    FigJS.icons.apply(document);

    installToolbarScroll();

    installShortcuts();
    installShortcutsHelp();

    // GrapesJS button tooltips.
    try {
      const setTip = (panelId, btnId, tip) => {
        const b = editor.Panels.getButton(panelId, btnId);
        if (!b) return;
        const attrs = { ...(b.get('attributes') || {}) };
        attrs.title = tip;
        b.set('attributes', attrs);
      };
      setTip('options', 'preview',    'Preview (5)');
      setTip('options', 'fullscreen', 'Fullscreen (6)');
    } catch (e) {}

    // Fullscreen covers the whole editor (GrapesJS's command covers only its canvas).
    const fullscreen = {
      run() {
        const root = document.documentElement;
        if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
      },
      stop() {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      },
    };
    ['core:fullscreen', 'fullscreen'].forEach((id) => editor.Commands.add(id, fullscreen));
    document.addEventListener('fullscreenchange', () => {
      const b = editor.Panels.getButton('options', 'fullscreen');
      const on = !!document.fullscreenElement;
      if (b && !!b.get('active') !== on) b.set('active', on);
    });

    zoomSlider = document.getElementById('zoom-slider');
    zoomLabel  = document.getElementById('zoom-label');
    leftPanel  = document.getElementById('left-panel');
    presetsContentEl = document.getElementById('presets-panel-content');

    zoomSlider.addEventListener('input', (e) => applyZoom(Number(e.target.value)));

    document.querySelectorAll('.device-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.device-btn').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        editor.setDevice(e.currentTarget.dataset.device);
        applyZoom(Number(zoomSlider.value));
      });
    });

    // Hover and selection outlines use cached offsets: refresh them when the
    // canvas area resizes.
    const canvasArea = document.getElementById('canvas-wrapper');
    if (canvasArea && typeof ResizeObserver !== 'undefined') {
      let pending = 0;
      new ResizeObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          try { editor.refresh({ tools: true }); } catch (e) {}
        });
      }).observe(canvasArea);
    }

    document.querySelectorAll('.panel-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    document.getElementById('btn-toggle-files').addEventListener('click', () => {
      leftPanel.classList.toggle('collapsed');
      const refresh = () => { try { editor.refresh({ tools: true }); } catch (e) {} };
      setTimeout(refresh, 0);
    });

    setupEdgeResizer(document.getElementById('left-panel-resizer'), {
      min: 240, max: 640, invert: false,
      getCurrentPx: () => leftPanel.getBoundingClientRect().width,
      apply: (px) => document.documentElement.style.setProperty('--left-panel-w', px + 'px'),
      storageKey: 'fig.leftPanelWidth',
    });

    setupEdgeResizer(document.getElementById('right-panel-resizer'), {
      min: 220, max: 560, invert: true,
      getCurrentPx: () => {
        const el = document.querySelector('.gjs-pn-views-container');
        return el ? el.getBoundingClientRect().width
          : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gjs-left-width')) || 260;
      },
      apply: (px) => document.documentElement.style.setProperty('--gjs-left-width', px + 'px'),
      storageKey: 'fig.rightPanelWidth',
    });

    // Presets panel.
    editor.Commands.add('open-presets-panel', {
      run: function () {
        if (!presetsContentEl.__attached) {
          const viewsPanel = editor.Panels.getPanel('views-container')
            || editor.Panels.addPanel({ id: 'views-container' });
          viewsPanel.set('appendContent', presetsContentEl).trigger('change:appendContent');
          presetsContentEl.__attached = true;
        }
        presetsContentEl.style.display = 'block';
        if (FigJS.presetsTab && FigJS.presetsTab.render) FigJS.presetsTab.render();
      },
      stop: function () {
        presetsContentEl.style.display = 'none';
      },
    });

    editor.Panels.addButton('views', {
      id: 'open-presets-panel',
      label: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L14 10"/><path d="M16 3v3"/><path d="M14.5 5.5h3"/><path d="M20 7v2"/><path d="M19 8h2"/><path d="M17 12v2"/><path d="M16 13h2"/></svg>',
      command: 'open-presets-panel',
      active: false,
      togglable: false,
      attributes: { title: 'Presets (Z / C to cycle panels)' },
    });

    // Copy and paste. Ctrl+V pastes into the selected element when it can
    // hold what was copied (at the end of its contents), else after it, as
    // GrapesJS does; Ctrl+Shift+V always after it. Pasting onto an element
    // that was itself copied places the copy after it. The selection stays,
    // so pasting again adds another in the same place. Both say what they did.
    const namesOf = (list) => (list.length === 1 ? list[0].getName() : list.length + ' elements');

    // GrapesJS holds its shortcuts (copy, paste, delete, undo) while focus is
    // on anything but the page body, taking it for a field being typed in.
    // But a click inside an open subpage focuses the subpage, and a zoom box
    // or a sidebar button takes focus too: only fields that take typing hold
    // them here.
    const TYPING = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], '
      + '[type="range"], [type="color"], [type="file"], [type="image"]), textarea, select';
    editor.Canvas.isInputFocused = function () {
      const frame = this.getFrameEl && this.getFrameEl();
      const doc = this.getDocument && this.getDocument();
      const focused = frame && document.activeElement === frame ? doc && doc.activeElement : document.activeElement;
      return !!focused && (focused.isContentEditable || focused.matches(TYPING));
    };

    // An element whose content lives in a part of its own (a subpage's body,
    // an accordion's body, a floating panel) takes a paste there.
    const SLOTS = [':scope > .subpage-body', ':scope > .accordion-body', ':scope > .floating-panel'];
    const slotOf = (target) => {
      const node = target.getEl && target.getEl();
      if (!node || !node.querySelector) return null;
      for (const sel of SLOTS) {
        const part = node.querySelector(sel);
        const model = part && part.__gjsv && part.__gjsv.model;
        if (model) return model;
      }
      return null;
    };
    const pasteCommand = (after) => ({
      run(ed) {
        const clip = (ed.getModel().get('clipboard') || []).filter((c) => c.get('copyable') !== false);
        if (!clip.length) {
          FigJS.setStatus('Nothing to paste yet: copy an element first (Ctrl+C).', '#ff9800');
          return;
        }
        const targets = ed.getSelectedAll();
        if (!targets.length) {
          FigJS.setStatus('Select where to paste, then press Ctrl+V.', '#ff9800');
          return;
        }
        const wrapper = ed.getWrapper();
        const fits = (parent) => clip.filter((c) => ed.Components.canMove(parent, c).result);
        const pasted = [];
        const places = [];
        targets.forEach((target) => {
          let holder = null;
          if (target === wrapper) holder = wrapper;
          else if (!after && !clip.includes(target)) {
            const slot = slotOf(target);
            if (fits(target).length === clip.length) holder = target;
            else if (slot && fits(slot).length === clip.length) holder = slot;
          }
          const into = !!holder;
          const parent = holder || (target.parent && target.parent()) || wrapper;
          const at = into ? parent.components().length : target.index() + 1;
          const ok = fits(parent);
          if (!ok.length) return;
          const added = [].concat(parent.components().add(ok.map((c) => c.clone()), { at, action: 'paste-component' }) || []);
          added.forEach((a) => ed.trigger('component:paste', a));
          pasted.push(...added);
          places.push((into ? 'into ' : 'after ') + target.getName());
        });
        if (!pasted.length) {
          FigJS.setStatus(`${namesOf(clip)} can't go there.`, '#ff9800');
          return;
        }
        const hint = !after && places.some((p) => p.startsWith('into ')) ? ' (Ctrl+Shift+V pastes after it instead)' : '';
        FigJS.setStatus(`Pasted ${namesOf(pasted)} ${places.join(', ')}${hint}.`, '#4caf50');
      },
    });
    editor.Commands.add('core:paste', pasteCommand(false));
    editor.Commands.add('fig:paste-after', pasteCommand(true));
    editor.Keymaps.add('fig:paste-after', '⌘+shift+v, ctrl+shift+v', 'fig:paste-after');
    editor.on('command:run:core:copy', () => {
      const clip = editor.getModel().get('clipboard') || [];
      if (clip.length) FigJS.setStatus(`Copied ${namesOf(clip)}: Ctrl+V pastes it into the selected element, Ctrl+Shift+V after it.`, '#4caf50');
    });

    editor.on('command:run:open-blocks', installBlockSearch);
    editor.on('command:run:core:open-blocks', installBlockSearch);

    // Replay motion: entrance animations restart and scroll reveals run as on
    // the site, until the next edit or selection.
    document.getElementById('btn-test-motion').addEventListener('click', () => {
      FigJS.canvas.startMotionPreview();
    });

    // Motion pause / play.
    const motionBtn = document.getElementById('btn-toggle-motion');

    let motionPausedWanted = true;

    function applyMotionState() {
      if (window.FigJS && FigJS.canvas && typeof FigJS.canvas.setMotionPaused === 'function') {
        FigJS.canvas.setMotionPaused(motionPausedWanted);
      }
      if (motionBtn) {
        motionBtn.innerHTML = FigJS.icons[motionPausedWanted ? 'play' : 'pause'];
        motionBtn.title = motionPausedWanted ? 'Play motion (4)' : 'Pause motion (4)';
        motionBtn.classList.toggle('active', motionPausedWanted);
      }
    }

    if (motionBtn) {
      applyMotionState();
      motionBtn.addEventListener('click', () => {
        motionPausedWanted = !motionPausedWanted;
        applyMotionState();
      });
    }

    editor.onReady(applyMotionState);
    setTimeout(applyMotionState, 0);
    setTimeout(applyMotionState, 500);
    setTimeout(applyMotionState, 1500);

    // Promote to class.
    document.getElementById('btn-promote-class').addEventListener('click', () => {
      const selected = editor.getSelected();
      if (!selected) { FigJS.setStatus('Select an element first.', '#ff9800'); return; }
      const css = editor.Css || editor.CssComposer;
      if (!css || typeof css.getAll !== 'function') {
        FigJS.setStatus('CSS API unavailable.', '#f44336'); return;
      }

      const compId = selected.getId();
      let idRule = null;
      try {
        idRule = css.getAll().filter((r) => {
          try { return r.getSelectorsString() === ('#' + compId); } catch (e) { return false; }
        })[0];
      } catch (e) {}

      if (!idRule) {
        FigJS.setStatus('No #id-based style on this element to promote.', '#ff9800');
        return;
      }

      const className = prompt('New reusable class name (e.g. "featured-card"):');
      if (!className) return;
      const safeClass = className.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!safeClass) return;

      try {
        const styleObj = typeof idRule.getStyle === 'function'
          ? idRule.getStyle() : (idRule.get('style') || {});
        css.setRule('.' + safeClass, styleObj);
        selected.addClass(safeClass);
        css.remove(idRule);
        FigJS.setStatus(`Promoted to .${safeClass}`, '#4caf50');
        if (FigJS.presetsTab && FigJS.presetsTab.render) FigJS.presetsTab.render();
        if (FigJS.codeView && FigJS.codeView.debouncedSync) FigJS.codeView.debouncedSync();
      } catch (e) {
        console.error(e);
        FigJS.setStatus('Could not promote style.', '#f44336');
      }
    });

    // Header probe.
    const probeBtn = document.getElementById('btn-header-probe');
    if (probeBtn) {
      probeBtn.addEventListener('click', async () => {
        console.log('---- _headers probe ----');
        try {
          const res = await fetch('/api/header-probe?path=/games/');
          const data = await res.json();
          console.log('file:', data.headersFile);
          console.log('exists:', data.headersFileExists);
          console.log('patterns parsed:', data.rules);
          console.log('headers resolved for /games/:', data.matchingHeaders);

          if (!data.headersFileExists) {
            console.warn('public/_headers was not found.');
          } else if (data.rulesLoaded !== data.rules.filter((r) => !r.startsWith('#')).length) {
            console.warn('Comment lines are parsed as patterns.');
          } else if (!data.matchingHeaders['Cross-Origin-Opener-Policy']) {
            console.warn('No COOP header matched /games/. Check the /games/* block pattern.');
          } else {
            console.log('_headers parses as expected.');
          }
        } catch (e) {
          console.warn('Could not reach /api/header-probe.', e);
        }
      });
    }

  }

  FigJS.ui = {
    install,
    applyZoom,
    getZoomValue,
    switchTab,
  };
})();