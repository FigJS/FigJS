// Code tab: highlighting, canvas -> code sync, Push (code -> canvas, to
// what the panel shows, with a status message: pushed, unchanged, needed
// repairs, or failed), the expanded overlay, and the open state of the
// three panels.
//   FigJS.codeView.install() / sync() / debouncedSync() / cleanCss(rawCss)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // ===================== CSS cleanup ===================================

  function cleanGrapesCss(rawCss) {
    return rawCss
      .replace(/[\w-]+\s*:\s*unset\s*;?/gi, '')
      .replace(/[\w-]+\s*:\s*;\s*/gi, '')
      .replace(/[.#\w\-:,>\s]+\{\s*\}/g, '')
      .trim();
  }

  // ===================== Syntax highlighting ===========================

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightHTML(src) {
    const re = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w:-]*)|(\s[a-zA-Z_:][\w:.-]*)(=)("[^"]*"|'[^']*')|(\/?>)|(&[a-zA-Z#0-9]+;)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += escHtml(src.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) out += `<span class="tok-comment">${escHtml(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-punct">${escHtml(m[2].match(/^<\/?/)[0])}</span><span class="tok-tag">${escHtml(m[2].replace(/^<\/?/, ''))}</span>`;
      else if (m[3] !== undefined) out += `<span class="tok-attr">${escHtml(m[3])}</span>${escHtml(m[4])}<span class="tok-string">${escHtml(m[5])}</span>`;
      else if (m[6]) out += `<span class="tok-punct">${escHtml(m[6])}</span>`;
      else if (m[7]) out += `<span class="tok-entity">${escHtml(m[7])}</span>`;
    }
    out += escHtml(src.slice(last));
    return out;
  }

  function highlightCSS(src) {
    const re = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(@[a-zA-Z-]+)|(#[0-9a-fA-F]{3,8}\b)|(--[a-zA-Z0-9-]+)|(\b\d*\.?\d+(?:px|em|rem|%|deg|s|ms|vh|vw|fr|turn)?\b)|([{};:,])/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += escHtml(src.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) out += `<span class="tok-comment">${escHtml(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-string">${escHtml(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-keyword">${escHtml(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-color">${escHtml(m[4])}</span>`;
      else if (m[5]) out += `<span class="tok-var">${escHtml(m[5])}</span>`;
      else if (m[6]) out += `<span class="tok-number">${escHtml(m[6])}</span>`;
      else if (m[7]) out += `<span class="tok-punct">${escHtml(m[7])}</span>`;
    }
    out += escHtml(src.slice(last));
    return out;
  }

  // The textarea (transparent) lies over the highlighted copy; the copy
  // follows every change of its text, typed or set by code (a value set
  // without an input event, such as dependencies added to the head), and
  // its scroll position, also after the panel is resized.
  const TEXTAREA_VALUE = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  function attachHighlighter(textarea, getMode) {
    const wrap = textarea.parentElement;
    const pre = wrap.querySelector('.code-highlight');
    const code = pre.querySelector('code');

    let shown = null;
    let shownMode = '';
    function render() {
      const mode = getMode();
      shown = textarea.value;
      shownMode = mode;
      code.innerHTML = (mode === 'css' ? highlightCSS(shown) : highlightHTML(shown)) + '\n';
    }
    function syncScroll() {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }

    let queued = false;
    const refresh = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (textarea.value !== shown || getMode() !== shownMode) render();
        syncScroll();
      });
    };
    Object.defineProperty(textarea, 'value', {
      configurable: true,
      get() { return TEXTAREA_VALUE.get.call(this); },
      set(v) { TEXTAREA_VALUE.set.call(this, v); refresh(); },
    });

    textarea.addEventListener('input', () => { render(); syncScroll(); });
    textarea.addEventListener('scroll', syncScroll);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncScroll).observe(textarea);

    render();
    return { render, syncScroll };
  }

  function setTextareaValue(textarea, value) {
    if (!textarea) return;
    if (textarea.value === value) return;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Typed edits not yet pushed. The canvas stays the source: a sync
  // replaces them, and says so.
  const unpushed = new WeakSet();

  function trackTyping(textarea) {
    textarea.addEventListener('input', (e) => { if (e.isTrusted) unpushed.add(textarea); });
  }

  function syncFromCanvas(textarea, value, what) {
    if (textarea.value !== value && unpushed.has(textarea)) {
      FigJS.setStatus(`${what} edits that were not pushed were replaced by the page. Push applies code edits.`, '#ff9800');
    }
    unpushed.delete(textarea);
    setTextareaValue(textarea, value);
  }

  // ===================== Module state ==================================

  let liveHead, liveHtml, liveCss;

  let codeViewMode = 'auto';

  let syncTimeout;

  // ===================== Undo-entry fusion =============================

  function captureStackPointer(editor) {
    const um = editor && editor.UndoManager;
    if (!um || typeof um.getPointer !== 'function') return -1;
    try { return um.getPointer(); } catch (e) { return -1; }
  }

  function fuseFromPointer(editor, startPointer) {
    if (startPointer < 0) return;
    const um = editor && editor.UndoManager;
    if (!um
        || typeof um.getStack !== 'function'
        || typeof um.getPointer !== 'function') return;

    let stack, pointer;
    try {
      stack = um.getStack();
      pointer = um.getPointer();
    } catch (e) { return; }
    if (!stack || pointer <= startPointer) return;

    const firstNew = stack.at(startPointer + 1);
    if (!firstNew) return;
    const fusion = firstNew.get('magicFusionIndex');
    if (fusion == null) return;

    for (let i = startPointer + 1; i <= pointer; i++) {
      const entry = stack.at(i);
      if (entry && entry.get('magicFusionIndex') !== fusion) {
        entry.set('magicFusionIndex', fusion);
      }
    }
  }

  // ===================== Rule snapshot / restore =======================

  function serializeRule(r) {
    const sels = (r.getSelectors && r.getSelectors().models) || [];
    return {
      selectorStr: sels.map((s) => s.getFullName()).join(''),
      state: r.get('state') || '',
      mediaText: r.get('mediaText') || '',
      atRuleType: r.get('atRuleType') || '',
      style: { ...r.getStyle('', { skipResolve: true }) },
    };
  }

  function restoreRules(editor, snap, opts) {
    const markLibrary = !!(opts && opts.library);
    const css = editor.Css;
    snap.forEach((s) => {
      if (!s.selectorStr) return;
      const fullSelector = s.state ? `${s.selectorStr}:${s.state}` : s.selectorStr;
      const addOpts = {};
      if (s.atRuleType) addOpts.atRuleType = s.atRuleType;
      if (s.mediaText)  addOpts.atRuleParams = s.mediaText;
      try {
        const rule = css.setRule(fullSelector, s.style, addOpts);
        if (rule && markLibrary) rule.set('library', true);
      } catch (e) {
        console.warn('[code-view] could not restore rule', s.selectorStr, e);
      }
    });
  }

  function snapshotLibraryRules(editor) {
    return (editor.Css.getAll().models || [])
      .filter((r) => r.get('library'))
      .map(serializeRule);
  }

  function restoreLibraryRules(editor, snap) {
    restoreRules(editor, snap, { library: true });
    if (FigJS.library && FigJS.library.ensureLibraryFirst) FigJS.library.ensureLibraryFirst();
  }

  // ===================== Selection scope helpers =======================

  function collectSelectionIds(comp) {
    const ids = [];
    const walk = (c) => {
      if (!c) return;
      try { ids.push(c.getId()); } catch (e) {}
      try { c.components().forEach(walk); } catch (e) {}
    };
    walk(comp);
    return ids;
  }

  function collectTargetSelectors(target) {
    const ids = new Set();
    const classes = new Set();
    const walk = (c) => {
      try { ids.add('#' + c.getId()); } catch (e) {}
      try {
        (c.getClasses() || []).forEach((cls) => classes.add('.' + cls));
      } catch (e) {}
      try { c.components().forEach(walk); } catch (e) {}
    };
    walk(target);
    return { ids, classes };
  }

  function ruleTouchesTarget(rule, targetIds, targetClasses) {
    const sels = (rule.getSelectors && rule.getSelectors().models) || [];
    return sels.some((s) => {
      const full = s.getFullName();
      return targetIds.has(full) || targetClasses.has(full);
    });
  }

  // ===================== CSS text for the textarea =====================

  function pageOnlyRules(editor) {
    return (editor.Css.getAll().models || []).filter((r) => !r.get('library'));
  }

  function pageCssText(editor, component) {
    const rules = pageOnlyRules(editor);
    const target = component || editor.getWrapper();
    try {
      return editor.CodeManager.getCode(target, 'css', { rules });
    } catch (e) {
      return '';
    }
  }

  // ===================== Sync canvas → code ============================

  // What the HTML and CSS panels show, and Push writes back to: the
  // selected element, or the page (Auto follows the selection; Selection
  // and Full Page pin it).
  function viewTarget(editor) {
    const selected = editor.getSelected();
    const wantSelection = codeViewMode === 'selection' ? true
      : codeViewMode === 'page' ? false
      : !!selected;
    return wantSelection && selected ? selected : null;
  }

  const shownHtml = (editor, target) => FigJS.codeFormat.html(target ? target.toHTML() : editor.getHtml());
  const shownCss = (editor, target) => FigJS.codeFormat.css(cleanGrapesCss(pageCssText(editor, target)));

  function sync() {
    if (FigJS.state.isInternalUpdate) return;
    const editor = FigJS.editor;
    const selected = editor.getSelected();
    const target = viewTarget(editor);

    document.querySelectorAll('#code-view-toggle .cvt-btn[data-mode="selection"]')
      .forEach((b) => b.disabled = !selected);

    const labelEl = document.getElementById('code-view-label');
    if (labelEl) {
      labelEl.textContent = 'Showing: ' + (target ? 'Selected element' : 'Full Page')
        + (codeViewMode !== 'auto' ? ` (pinned)` : '');
    }

    if (document.activeElement !== liveHtml) syncFromCanvas(liveHtml, shownHtml(editor, target), 'HTML');
    if (document.activeElement !== liveCss) syncFromCanvas(liveCss, shownCss(editor, target), 'CSS');
  }

  function debouncedSync() {
    if (FigJS.state.isInternalUpdate) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(sync, 100);
    FigJS.markUnsaved();
  }

  function debouncedSyncView() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(sync, 100);
  }

  function syncAfterHistoryStep() {
    clearTimeout(syncTimeout);
    requestAnimationFrame(() => {
      try { sync(); } catch (e) { }
    });
  }

  // Panels are divs, not <details>: <summary>/<details> do not lay out as
  // flex columns. The header is a role="button" toggle (buttons inside it
  // excluded); open state persists in one storage key, data-default-open
  // deciding for a panel not stored yet.

  const PANEL_STATE_KEY = 'fig.codeView.panels';

  function readPanelState() {
    try {
      const raw = localStorage.getItem(PANEL_STATE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (e) { return {}; }
  }

  function writePanelState(state) {
    try { localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function injectCodePanelStyles() {
    if (document.getElementById('fig-code-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'fig-code-panel-styles';
    style.textContent = `
      .code-panel {
        display: flex;
        flex-direction: column;
        flex: 1 1 0;
        min-height: 120px;
        min-width: 0;
        border-top: 1px solid #2a2a2a;
      }
      .code-panel.is-collapsed {
        flex: 0 0 auto;
        min-height: 0;
      }
      .code-panel.is-collapsed > .code-editor-wrap {
        display: none;
      }
      .code-panel > .code-editor-wrap {
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      .code-panel-header {
        cursor: pointer;
        user-select: none;
        flex: 0 0 auto;
      }
      .code-panel-header:focus-visible {
        outline: 1px solid #007acc;
        outline-offset: -1px;
      }
      .code-panel-caret {
        display: inline-block;
        flex: 0 0 auto;
        width: 5px;
        height: 5px;
        margin: 0 4px 0 1px;
        border-right: 1.5px solid #777;
        border-bottom: 1.5px solid #777;
        transition: transform 0.15s ease;
        transform: rotate(-45deg);
      }
      .code-panel:not(.is-collapsed) > .code-panel-header > div:first-child > .code-panel-caret {
        transform: rotate(45deg);
      }
    `;
    document.head.appendChild(style);
  }

  function setPanelOpen(panel, open) {
    panel.classList.toggle('is-collapsed', !open);
    const header = panel.querySelector('.code-panel-header');
    if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function togglePanel(panel, persist) {
    const open = !panel.classList.contains('is-collapsed');
    setPanelOpen(panel, !open);
    if (persist) {
      const key = panel.dataset.codePanel;
      if (key) {
        const st = readPanelState();
        st[key] = !open;
        writePanelState(st);
      }
    }
  }

  function installCodePanelToggles() {
    const panels = document.querySelectorAll('[data-code-panel]');
    if (!panels.length) return;

    injectCodePanelStyles();
    const saved = readPanelState();

    panels.forEach((panel) => {
      const key = panel.dataset.codePanel;
      const header = panel.querySelector('.code-panel-header');
      if (!header) return;

      const defaultOpen = panel.dataset.defaultOpen !== 'false';
      const open = (key && Object.prototype.hasOwnProperty.call(saved, key))
        ? !!saved[key]
        : defaultOpen;
      setPanelOpen(panel, open);

      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        togglePanel(panel, true);
      });

      header.addEventListener('keydown', (e) => {
        if (e.target.closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          togglePanel(panel, true);
        }
      });
    });
  }

  // ===================== Code overlay ==================================

  let expandedCodeNode = null;

  function openOverlay() {
    const node = FigJS.state.currentRawFile
      ? document.getElementById('raw-file-view')
      : document.getElementById('page-code-view');
    expandedCodeNode = node;
    document.getElementById('code-overlay-body').appendChild(node);
    document.getElementById('code-overlay').style.display = 'flex';
  }

  function closeOverlay() {
    if (expandedCodeNode) {
      document.getElementById('tab-code').appendChild(expandedCodeNode);
      expandedCodeNode = null;
    }
    document.getElementById('code-overlay').style.display = 'none';
  }

  // ===================== Push handlers =================================

  function applyPushLanguage(editor) {
    if (!FigJS.i18n || typeof FigJS.i18n.applyLanguageContent !== 'function') return;
    const body = editor.Canvas.getBody();
    const lang = body && body.getAttribute('data-lang');
    if (!lang) return;
    const defaultLang = (window.PresetRegistry && window.PresetRegistry.getDefaultLang)
      ? window.PresetRegistry.getDefaultLang()
      : 'en';
    FigJS.i18n.applyLanguageContent(lang, defaultLang, { onlyPureText: true });
  }

  // Replaces the element with the pushed markup and returns how many
  // elements it became; if that fails, the element goes back in place.
  function pushHtmlForSelection(editor, selected) {
    const parent = selected.parent();
    if (!parent) throw new Error('the element is not on the page');

    const idx = selected.index();
    const keepIds = collectSelectionIds(selected);

    selected.remove({ keepIds });

    let added;
    try {
      added = parent.append(liveHtml.value, { at: idx });
    } catch (e) {
      try { parent.append(selected, { at: idx }); } catch (e2) {}
      throw e;
    }

    const addedList = (Array.isArray(added) ? added : [added]).filter((c) => c && c.getId);
    const elements = addedList.filter((c) => c.get('type') !== 'textnode');
    const newComp = elements[0] || addedList[0];
    if (newComp) {
      try { editor.select(newComp); } catch (e) {}
    }
    return elements.length;
  }

  function pushHtmlForPage(editor) {
    const libSnap = snapshotLibraryRules(editor);
    const preserved = liveCss.value;
    editor.setComponents(liveHtml.value);
    editor.setStyle(preserved);
    restoreLibraryRules(editor, libSnap);
  }

  function pushCss(editor, target) {
    const libSnap = snapshotLibraryRules(editor);

    if (!target) {
      editor.setStyle(liveCss.value);
      restoreLibraryRules(editor, libSnap);
      return;
    }

    const { ids: targetIds, classes: targetClasses } = collectTargetSelectors(target);
    const preserved = [];
    (editor.Css.getAll().models || []).forEach((r) => {
      if (r.get('library')) return;
      if (ruleTouchesTarget(r, targetIds, targetClasses)) return;
      preserved.push(serializeRule(r));
    });

    editor.setStyle(liveCss.value);

    restoreRules(editor, preserved);
    restoreLibraryRules(editor, libSnap);
  }

  // ===================== Push messages =================================
  // The browser repairs broken markup silently (closing, moving or
  // dropping tags), so a push that needed repairs says so.

  const VOID_TAG = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
  const OPTIONAL_END = /^(p|li|dt|dd|option|optgroup|tr|td|th|thead|tbody|tfoot|colgroup|rt|rp)$/;

  function tagsPair(html) {
    const src = String(html || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
    const open = [];
    let m;
    while ((m = re.exec(src))) {
      const name = m[2].toLowerCase();
      if (VOID_TAG.test(name) || m[4]) continue;
      if (!m[1]) { open.push(name); continue; }
      while (open.length && open[open.length - 1] !== name && OPTIONAL_END.test(open[open.length - 1])) open.pop();
      if (open[open.length - 1] !== name) return false;
      open.pop();
    }
    return open.every((name) => OPTIONAL_END.test(name));
  }

  function bracesPair(css) {
    const src = String(css || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    let depth = 0;
    for (const ch of src) {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth < 0) return false;
    }
    return depth === 0;
  }

  const OK = '#4caf50';
  const WARN = '#ff9800';
  const FAIL = '#f44336';

  function nameOf(comp) {
    try { return comp.getName() || 'the element'; } catch (e) { return 'the element'; }
  }

  // ===================== Install =======================================

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;

    liveHead = document.getElementById('live-head');
    liveHtml = document.getElementById('live-html');
    liveCss  = document.getElementById('live-css');
    const rawBody = document.getElementById('raw-file-content');

    attachHighlighter(
      rawBody,
      () => (FigJS.state.currentRawFile && /\.css$/i.test(FigJS.state.currentRawFile.path)) ? 'css' : 'html'
    );
    attachHighlighter(liveHead, () => 'html');
    attachHighlighter(liveHtml, () => 'html');
    attachHighlighter(liveCss,  () => 'css');
    FigJS.codeFormat.attach(rawBody,
      () => (FigJS.state.currentRawFile && /\.css$/i.test(FigJS.state.currentRawFile.path)) ? 'css' : 'html');
    FigJS.codeFormat.attach(liveHead, 'html');
    FigJS.codeFormat.attach(liveHtml, 'html');
    FigJS.codeFormat.attach(liveCss, 'css');
    trackTyping(liveHtml);
    trackTyping(liveCss);

    installCodePanelToggles();

    document.querySelectorAll('#code-view-toggle .cvt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        codeViewMode = btn.dataset.mode;
        document.querySelectorAll('#code-view-toggle .cvt-btn')
          .forEach((b) => b.classList.toggle('active', b === btn));
        sync();
      });
    });

    // Selection, hover and layer state are component properties, not edits.
    const UI_STATE = new Set(['status', 'state', 'open', 'hovered', 'locked', 'dmode']);
    editor.on('component:update', (comp) => {
      const changed = comp && comp.changedAttributes ? Object.keys(comp.changedAttributes() || {}) : [];
      if (changed.length && changed.every((k) => UI_STATE.has(k))) { debouncedSyncView(); return; }
      debouncedSync();
    });
    editor.on('component:styleUpdate', debouncedSync);
    editor.on('styleManager:update', debouncedSync);
    // changesCount also counts bookkeeping; only an undoable change is an edit.
    editor.on('change:changesCount', () => {
      if (editor.UndoManager.hasUndo()) debouncedSync();
      else debouncedSyncView();
    });
    editor.on('change:css', debouncedSync);
    editor.on('component:selected', () => {
      if (FigJS.presetsTab && FigJS.presetsTab.render) FigJS.presetsTab.render();
      debouncedSyncView();
    });

    editor.on('undo', syncAfterHistoryStep);
    editor.on('redo', syncAfterHistoryStep);

    // Push writes to what the panel shows (viewTarget), as one undo step,
    // and says how it went.
    document.getElementById('apply-html').addEventListener('click', () => {
      unpushed.delete(liveHtml);
      const target = viewTarget(editor);
      const label = target ? nameOf(target) : 'the page';
      if (liveHtml.value.trim() === shownHtml(editor, target).trim()) {
        FigJS.setStatus(`HTML unchanged: nothing to push to ${label}.`);
        return;
      }
      const paired = tagsPair(liveHtml.value);
      const startPointer = captureStackPointer(editor);
      let count = 0;
      let failed = null;
      try {
        FigJS.withInternalUpdate(() => {
          if (target) count = pushHtmlForSelection(editor, target);
          else pushHtmlForPage(editor);
          applyPushLanguage(editor);
        });
      } catch (e) {
        failed = e;
      }
      fuseFromPointer(editor, startPointer);

      if (failed) {
        console.error('[code-view] HTML push failed:', failed);
        if (captureStackPointer(editor) !== startPointer) FigJS.markUnsaved();
        FigJS.setStatus(`HTML push failed: ${failed.message || failed}. ${target ? label + ' was kept as it was.' : 'Undo restores the page.'}`, FAIL);
        return;
      }
      if (FigJS.i18n && FigJS.i18n.skipNextSnapshot) FigJS.i18n.skipNextSnapshot();
      FigJS.markUnsaved();

      if (target && !count) {
        FigJS.setStatus(`Pushed HTML: ${label} removed, as the code was empty. Undo brings it back.`, WARN);
      } else if (!paired) {
        FigJS.setStatus(`Pushed HTML to ${label}, but some tags don't pair up: the browser closed or moved them. Check the result, or Undo.`, WARN);
      } else if (target && count > 1) {
        FigJS.setStatus(`Pushed HTML: ${label} replaced with ${count} elements`, OK);
      } else {
        FigJS.setStatus(`Pushed HTML to ${label}`, OK);
      }
    });

    document.getElementById('apply-css').addEventListener('click', () => {
      unpushed.delete(liveCss);
      const target = viewTarget(editor);
      const where = target ? 'for ' + nameOf(target) : 'to the page';
      if (liveCss.value.trim() === shownCss(editor, target).trim()) {
        FigJS.setStatus(`CSS unchanged: nothing to push ${where}.`);
        return;
      }
      const paired = bracesPair(liveCss.value);
      const startPointer = captureStackPointer(editor);
      let failed = null;
      try {
        FigJS.withInternalUpdate(() => pushCss(editor, target));
      } catch (e) {
        failed = e;
      }
      fuseFromPointer(editor, startPointer);

      if (failed) {
        console.error('[code-view] CSS push failed:', failed);
        if (captureStackPointer(editor) !== startPointer) FigJS.markUnsaved();
        FigJS.setStatus(`CSS push failed: ${failed.message || failed}. Undo restores the styles.`, FAIL);
        return;
      }
      FigJS.markUnsaved();
      if (!paired) {
        FigJS.setStatus(`Pushed CSS ${where}, but { and } don't pair up: rules after the mismatch may be lost. Check the result, or Undo.`, WARN);
      } else {
        FigJS.setStatus(`Pushed CSS ${where}`, OK);
      }
    });

    document.getElementById('apply-head').addEventListener('click', () => {
      try {
        FigJS.canvas.syncHead();
      } catch (e) {
        console.error('[code-view] head push failed:', e);
        FigJS.setStatus(`Head push failed: ${e.message || e}`, FAIL);
        return;
      }
      FigJS.markUnsaved();
      if (!tagsPair(liveHead.value)) {
        FigJS.setStatus('Pushed the head, but some tags don\'t pair up: the browser closed or dropped them.', WARN);
      } else {
        FigJS.setStatus('Pushed the head: the canvas uses its styles and scripts', OK);
      }
    });

    document.getElementById('btn-expand-code').addEventListener('click', openOverlay);
    document.getElementById('btn-expand-raw').addEventListener('click', openOverlay);
    document.getElementById('code-overlay-close').addEventListener('click', closeOverlay);
    document.querySelector('#code-overlay .code-overlay-backdrop')
      .addEventListener('click', closeOverlay);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'
          && document.getElementById('code-overlay').style.display === 'flex') {
        closeOverlay();
      }
    });

    rawBody.addEventListener('input', () => {
      if (FigJS.state.currentRawFile) FigJS.markUnsaved();
    });
  }

  FigJS.codeView = {
    install,
    sync,
    debouncedSync,
    debouncedSyncView,
    setValue: setTextareaValue,
    cleanCss: cleanGrapesCss,
  };
})();