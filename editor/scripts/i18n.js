// Languages. The canvas language is body[data-lang]; text-bearing
// components keep each language's content in data-lang-<lang>.
// Switching: end in-place editing (GrapesJS writes edited text to the
// model only then), snapshot the outgoing language into data-lang-<prev>,
// set body[data-lang], then show data-lang-<new> (falling back to the
// default language). Fallback text left unedited is not snapshotted as a
// translation. Switches run one after another. Save commits and
// snapshots first too. Undo and redo of a text edit switch to the language
// it was made in first.
// applyLanguageContent(lang, fallback, { onlyPureText: true }) skips
// elements whose content has markup (Code tab push: styled children were
// authored that way).
// skipNextSnapshot(): after a Code tab push the pushed attributes are the
// source, so the next snapshot (save or switch) is skipped; a canvas edit
// clears the flag.
//   FigJS.i18n.install() / renderDropdown() / await commitActiveEditing()
//   FigJS.i18n.getCurrentLang() / onCurrentLangChange(fn) / emitLangChange()
//   FigJS.i18n.snapshotLanguageContent(lang) / applyLanguageContent(lang, fallback, opts)
//   FigJS.i18n.skipNextSnapshot() / clearSnapshotSkip()
//   FigJS.i18n.pruneUnregisteredLanguageAttrs() / computePageLanguages()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const DEFAULT_LANG = 'en';

  const TEXT_TAGS = new Set([
    'H1','H2','H3','H4','H5','H6','P','SPAN','A','LI',
    'BLOCKQUOTE','BUTTON','LABEL','FIGCAPTION','CITE','Q',
    'EM','STRONG','B','I','U','S','CODE','SMALL','SUB','SUP','MARK',
    'TD','TH','DT','DD','SUMMARY',
  ]);

  const INLINE_TAGS = new Set([
    'SPAN','A','EM','STRONG','B','I','U','S','CODE','SMALL',
    'SUB','SUP','MARK','BR','IMG','WBR',
  ]);

  const WRAPPER_TEXT_TAGS = new Set([
    'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'FIGURE',
  ]);

  const TRANSLATABLE_ATTRS = [
    'data-tooltip-text', 'alt', 'title', 'aria-label', 'placeholder',
  ];

  // ===================== Skip-next-snapshot flag =======================

  let _skipNextLangSnapshot = false;

  function skipNextSnapshot() {
    _skipNextLangSnapshot = true;
  }

  function clearSnapshotSkip() {
    _skipNextLangSnapshot = false;
  }

  function _consumeSkip() {
    if (!_skipNextLangSnapshot) return false;
    _skipNextLangSnapshot = false;
    return true;
  }

  function untracked(fn) {
    const editor = FigJS.editor;
    const um = editor && editor.UndoManager;
    if (um && typeof um.skip === 'function') return um.skip(fn);
    return fn();
  }

  // ===================== Language helpers ==============================

  function getLanguages() {
    return (window.PresetRegistry && window.PresetRegistry.getLanguages)
      ? window.PresetRegistry.getLanguages()
      : [{ code: DEFAULT_LANG, name: 'English' }];
  }
  function getLanguageCodes() { return getLanguages().map((l) => l.code); }
  function hasLanguage(code) {
    return getLanguages().some((l) => l.code === code);
  }
  // Stored on the wrapper (FigJS.pageBody), mirrored to the canvas <body>/<html>.
  function getCurrentLang() {
    return (FigJS.pageBody && FigJS.pageBody.getAttr('data-lang')) || DEFAULT_LANG;
  }

  const langChangeListeners = new Set();
  function onCurrentLangChange(fn) {
    langChangeListeners.add(fn);
    return () => langChangeListeners.delete(fn);
  }
  function emitLangChange() {
    langChangeListeners.forEach((fn) => { try { fn(); } catch (e) {} });
  }

  // ===================== Content-ownership check =======================

  function isTextBearing(component) {
    if (!component) return false;
    if (component.get('type') === 'md-block') return false;

    const tag = String(component.get('tagName') || '').toUpperCase();
    const isKnown = TEXT_TAGS.has(tag);
    const isWrapper = WRAPPER_TEXT_TAGS.has(tag);
    if (!isKnown && !isWrapper) return false;

    const hasBlockDescendant = component.find('*').some((d) => {
      const dt = String(d.get('tagName') || '').toUpperCase();
      return !INLINE_TAGS.has(dt);
    });
    if (hasBlockDescendant) return false;

    if (isKnown) return true;

    const hasTextBearingDescendant = component.find('*').some((d) => {
      const dt = String(d.get('tagName') || '').toUpperCase();
      return TEXT_TAGS.has(dt);
    });
    if (hasTextBearingDescendant) return false;

    const kids = component.components();
    const childModels = (kids && kids.models) ? kids.models : [];
    return childModels.some((c) => {
      if (!c || !c.get) return false;
      if (c.get('type') !== 'textnode') return false;
      return String(c.get('content') || '').trim().length > 0;
    });
  }

  function findTextBearingComponents(root) {
    const editor = FigJS.editor;
    if (!editor) return [];
    const out = [];
    const walk = (c) => {
      if (isTextBearing(c)) { out.push(c); return; }
      c.components().forEach(walk);
    };
    (root || editor.getWrapper()).components().forEach(walk);
    return out;
  }

  // ===================== Snapshot / restore ============================
  // An element without its own text in a language shows the default
  // language's (the fallback). Leaving that language stores only
  // translations: text shown as the fallback and left unchanged stays
  // untranslated, so a removed data-lang-<lang> isn't written back.

  const has = (attrs, key) => Object.prototype.hasOwnProperty.call(attrs, key);

  // What applyLanguageContent showed: component -> { lang, own, html }.
  const shown = new WeakMap();

  function showsFallback(c, lang, html, attrs) {
    if (lang === DEFAULT_LANG) return false;
    const seen = shown.get(c);
    if (seen && seen.lang === lang && !seen.own) return seen.html === html;
    // Not shown this session (a page saved in this language): the fallback
    // text itself.
    const fallbackKey = 'data-lang-' + DEFAULT_LANG;
    return has(attrs, fallbackKey) && attrs[fallbackKey] === html;
  }

  function snapshotLanguageContent(lang, opts) {
    if (!lang) return;
    const force = !!(opts && opts.force);
    if (!force && _consumeSkip()) return;

    untracked(() => {
      const key = 'data-lang-' + lang;
      findTextBearingComponents().forEach((c) => {
        const html = c.getInnerHTML();
        const attrs = c.getAttributes() || {};
        if (!has(attrs, key) && showsFallback(c, lang, html, attrs)) return;
        if (attrs[key] !== html) c.addAttributes({ [key]: html });
      });
    });
  }

  function applyLanguageContent(lang, defaultLang, opts) {
    if (!lang) return;
    const onlyPureText = !!(opts && opts.onlyPureText);
    const wantKey = 'data-lang-' + lang;
    const fallbackKey = 'data-lang-' + (defaultLang || DEFAULT_LANG);
    findTextBearingComponents().forEach((c) => {
      // Code tab push: content with markup was authored as is.
      if (onlyPureText && /</.test(c.getInnerHTML())) return;

      const attrs = c.getAttributes() || {};

      // Presence, not truthiness: an empty value is a translation (nothing
      // shown in this language), not a missing one.
      let html;
      let own = true;
      if (has(attrs, wantKey)) {
        html = attrs[wantKey];
      } else if (has(attrs, fallbackKey)) {
        html = attrs[fallbackKey];
        own = false;
      } else {
        // Never stored in any language: what it shows is no translation.
        shown.set(c, { lang, own: false, html: c.getInnerHTML() });
        return;
      }

      if (c.getInnerHTML() !== html) c.components(html === '' ? [] : html);
      shown.set(c, { lang, own, html: c.getInnerHTML() });
    });
  }

  // Ends in-place text editing so the edited text reaches the model: the
  // editor's current one and any other text left with editing on.
  async function commitActiveEditing() {
    const editor = FigJS.editor;
    if (!editor) return;
    const views = new Set();
    const editing = editor.getEditing && editor.getEditing();
    if (editing && editing.getView) views.add(editing.getView());
    editor.getWrapper().find('*').forEach((c) => {
      const v = c.getView && c.getView();
      if (v && v.rteEnabled) views.add(v);
    });
    for (const view of views) {
      if (!view || typeof view.disableEditing !== 'function') continue;
      try { await view.disableEditing(); } catch (e) { console.error('[i18n] could not end editing:', e); }
    }
    try {
      const doc = editor.Canvas.getDocument();
      if (doc && doc.activeElement && doc.activeElement !== doc.body) {
        doc.activeElement.blur();
      }
    } catch (e) {}
  }

  // ===================== Switching =====================================

  let switching = Promise.resolve();

  function switchEditorLanguage(newLang) {
    switching = switching.then(async () => {
      const prevLang = getCurrentLang() || DEFAULT_LANG;
      const next = newLang || DEFAULT_LANG;
      if (prevLang === next) { renderDropdown(); return; }
      await commitActiveEditing();
      untracked(() => {
        snapshotLanguageContent(prevLang);
        applyCanvasLang(next);
        // Switching shows the incoming language's content, markup included.
        applyLanguageContent(next, DEFAULT_LANG);
      });
      renderDropdown();
    }).catch((e) => console.error('[i18n] language switch failed:', e));
    return switching;
  }

  // ===================== Undo across languages =========================
  // A text edit's undo entry remembers the language it was made in; undo
  // and redo switch to that language first, so the restored text shows in
  // its own language and later edits stay there.

  function entryComponent(entry) {
    const o = entry && entry.get('object');
    if (!o) return null;
    if (o.models) return o.parent || null;
    return o.get && o.get('type') === 'textnode' && o.parent ? o.parent() : o;
  }

  function withinText(comp) {
    for (let c = comp; c && c.get; c = c.parent && c.parent()) {
      if (isTextBearing(c)) return true;
    }
    return false;
  }

  // The language of the step undo or redo would apply next; a fused group
  // (one step) takes the language of any text edit in it.
  function stepLanguage(um, dir) {
    const stack = um.getStack && um.getStack();
    if (!stack || typeof um.getPointer !== 'function') return '';
    const delta = dir === 'undo' ? -1 : 1;
    let i = dir === 'undo' ? um.getPointer() : um.getPointer() + 1;
    const first = stack.at(i);
    if (!first) return '';
    const fusion = first.get('magicFusionIndex');
    for (let e = first; e; e = stack.at(i += delta)) {
      if (e !== first && (fusion == null || e.get('magicFusionIndex') !== fusion)) break;
      if (e.get('figLang')) return e.get('figLang');
    }
    return '';
  }

  function installUndoLanguages(editor) {
    const um = editor.UndoManager;
    const stack = um && um.getStack && um.getStack();
    if (!stack) return;
    stack.on('add', (entry) => {
      const comp = entryComponent(entry);
      if (comp && withinText(comp)) entry.set('figLang', getCurrentLang(), { silent: true });
    });
    let retrying = false;
    ['undo', 'redo'].forEach((dir) => {
      const orig = um[dir].bind(um);
      um[dir] = function (...args) {
        const lang = retrying ? '' : stepLanguage(um, dir);
        if (!lang || lang === getCurrentLang() || !hasLanguage(lang)) return orig(...args);
        switchEditorLanguage(lang).then(() => {
          retrying = true;
          try { um[dir](...args); } finally { retrying = false; }
        });
        return undefined;
      };
    });
  }

  // ===================== Dropdown rendering ============================

  let langSelect = null;
  let isRenderingLangDropdown = false;

  function renderDropdown() {
    if (!langSelect) return;
    isRenderingLangDropdown = true;
    try {
      const langs = getLanguages();
      const current = getCurrentLang();

      langSelect.innerHTML = '';
      langs.forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.name + (l.code === DEFAULT_LANG ? ' (default)' : '');
        langSelect.appendChild(opt);
      });
      if (!langs.some((l) => l.code === current)) {
        const opt = document.createElement('option');
        opt.value = current;
        opt.textContent = current.toUpperCase() + ' (page)';
        langSelect.appendChild(opt);
      }
      langSelect.value = current;
    } finally {
      isRenderingLangDropdown = false;
    }
  }

  // Changing the editing language is a view change: untracked.
  function applyCanvasLang(lang) {
    if (!FigJS.pageBody) return;
    const value = (lang && lang.trim()) || DEFAULT_LANG;
    untracked(() => FigJS.pageBody.setAttrs({ 'data-lang': value }));
    emitLangChange();
    FigJS.markUnsaved();
  }

  // ===================== Purge / prune =================================

  function purgeLanguageFromModel(code) {
    const editor = FigJS.editor;
    if (!editor) return;
    const wrapper = editor.getWrapper();
    if (!wrapper) return;

    untracked(() => {
      const langAttr = 'data-lang-' + code;
      const i18nAttr = 'data-i18n-' + code;

      const visit = (comp) => {
        const attrs = comp.getAttributes() || {};
        const drop = [];

        if (langAttr in attrs) drop.push(langAttr);
        if (i18nAttr in attrs) drop.push(i18nAttr);
        TRANSLATABLE_ATTRS.forEach((base) => {
          const key = `${base}-${code}`;
          if (key in attrs) drop.push(key);
        });
        if (drop.length) comp.removeAttributes(drop);

        if (comp.get('type') === 'md-block' && attrs['data-md-i18n']) {
          try {
            const map = JSON.parse(attrs['data-md-i18n']);
            if (map && typeof map === 'object' && code in map) {
              delete map[code];
              if (Object.keys(map).length === 0) {
                comp.removeAttributes('data-md-i18n');
              } else {
                comp.addAttributes({ 'data-md-i18n': JSON.stringify(map) });
              }
            }
          } catch (e) {}
        }

        comp.components().forEach(visit);
      };

      wrapper.components().forEach(visit);
    });
  }

  function pruneUnregisteredLanguageAttrs() {
    const editor = FigJS.editor;
    if (!editor) return;

    untracked(() => {
      const registered = new Set(getLanguageCodes().map((c) => c.toLowerCase()));
      const LANG_SUFFIX_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;

      const wrapper = editor.getWrapper();
      if (!wrapper) return;

      const visit = (comp) => {
        const attrs = comp.getAttributes() || {};
        const drop = [];

        Object.keys(attrs).forEach((key) => {
          // Only per-language copies (data-lang-<code>) are pruned; other
          // data-lang-* attributes are settings.
          if (key.startsWith('data-lang-')) {
            const code = key.slice('data-lang-'.length).toLowerCase();
            if (LANG_SUFFIX_RE.test(code) && !registered.has(code)) { drop.push(key); return; }
          }

          if (key.startsWith('data-i18n-')) {
            const code = key.slice('data-i18n-'.length).toLowerCase();
            if (LANG_SUFFIX_RE.test(code) && !registered.has(code)) { drop.push(key); return; }
          }

          TRANSLATABLE_ATTRS.forEach((base) => {
            const prefix = base + '-';
            if (key.startsWith(prefix)) {
              const suffix = key.slice(prefix.length).toLowerCase();
              if (LANG_SUFFIX_RE.test(suffix) && !registered.has(suffix)) {
                drop.push(key);
              }
            }
          });
        });

        if (drop.length) comp.removeAttributes(drop);

        if (comp.get('type') === 'md-block' && attrs['data-md-i18n']) {
          try {
            const map = JSON.parse(attrs['data-md-i18n']);
            let changed = false;
            Object.keys(map).forEach((code) => {
              if (!registered.has(code.toLowerCase())) {
                delete map[code];
                changed = true;
              }
            });
            if (changed) {
              if (Object.keys(map).length === 0) comp.removeAttributes('data-md-i18n');
              else comp.addAttributes({ 'data-md-i18n': JSON.stringify(map) });
            }
          } catch (e) {}
        }

        comp.components().forEach(visit);
      };

      wrapper.components().forEach(visit);
    });
  }

  // ===================== Page language inventory =======================

  function computePageLanguages() {
    const editor = FigJS.editor;
    const used = new Set([DEFAULT_LANG]);
    if (!editor) return [...used];
    const wrapper = editor.getWrapper();
    if (!wrapper) return [...used];

    const visit = (comp) => {
      const attrs = comp.getAttributes() || {};

      Object.keys(attrs).forEach((key) => {
        const codeOf = (prefix) => {
          const c = key.slice(prefix.length).toLowerCase();
          return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(c) ? c : '';
        };
        if (key.startsWith('data-lang-')) {
          const c = codeOf('data-lang-');
          if (c) used.add(c);
          return;
        }
        if (key.startsWith('data-i18n-')) {
          const c = codeOf('data-i18n-');
          if (c) used.add(c);
          return;
        }
        TRANSLATABLE_ATTRS.forEach((base) => {
          const prefix = base + '-';
          if (!key.startsWith(prefix)) return;
          const suffix = key.slice(prefix.length).toLowerCase();
          if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(suffix)) {
            used.add(suffix);
          }
        });
      });

      if (comp.get('type') === 'md-block' && attrs['data-md-i18n']) {
        try {
          const map = JSON.parse(attrs['data-md-i18n']);
          if (map && typeof map === 'object') {
            Object.keys(map).forEach((code) => {
              if (map[code] != null) used.add(String(code).toLowerCase());
            });
          }
        } catch (e) {}
      }

      comp.components().forEach(visit);
    };

    wrapper.components().forEach(visit);
    return [...used];
  }

  // ===================== Install =======================================

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;

    langSelect = document.getElementById('lang-select');

    if (window.PresetRegistry && window.PresetRegistry.onLanguagesChange) {
      window.PresetRegistry.onLanguagesChange(() => renderDropdown());
    }

    installUndoLanguages(editor);

    // A canvas edit makes the visible text the source again.
    editor.on('component:update', () => {
      if (FigJS.state && FigJS.state.isInternalUpdate) return;
      clearSnapshotSkip();
    });

    langSelect.addEventListener('change', (e) => {
      if (isRenderingLangDropdown) return;
      switchEditorLanguage(e.target.value || DEFAULT_LANG);
    });

    document.getElementById('btn-lang-add').addEventListener('click', () => {
      const form = document.createElement('div');
      form.className = 'fig-form';
      form.innerHTML =
        '<label class="fig-field"><span class="fig-field-label">Code</span>' +
        '<input type="text" name="code" placeholder="fr, sr, pt-br" spellcheck="false"></label>' +
        '<label class="fig-field"><span class="fig-field-label">Display name</span>' +
        '<input type="text" name="name" placeholder="Français"></label>';
      FigJS.dialog.open({
        title: 'Add language',
        body: form,
        width: 380,
        actions: [
          { label: 'Cancel' },
          { label: 'Add', primary: true, onClick: () => {
            const code = form.querySelector('[name=code]').value.trim();
            const name = form.querySelector('[name=name]').value.trim() || code.toUpperCase();
            const res = window.PresetRegistry.registerLanguage(code, name);
            if (!res.ok) { FigJS.setStatus('Could not add language: ' + res.reason, '#f44336'); return false; }
            renderDropdown();
            FigJS.setStatus(`Added ${res.language.name} (${res.language.code})`, '#4caf50');
            return true;
          } },
        ],
      });
    });

    document.getElementById('btn-lang-remove').addEventListener('click', async () => {
      const current = getCurrentLang();
      if (current === DEFAULT_LANG) {
        FigJS.setStatus('Cannot remove the default language.', '#ff9800');
        return;
      }
      const lang = getLanguages().find((l) => l.code === current);
      if (!lang) return;
      const ok = await FigJS.dialog.confirm({
        title: `Remove ${lang.name} (${lang.code})?`,
        message: 'Every piece of text saved for this language on this page is deleted, ' +
          'including markdown translations and localized attributes. Save afterwards to make it stick.',
        okLabel: 'Remove language',
        danger: true,
      });
      if (!ok) return;

      clearSnapshotSkip();
      await commitActiveEditing();

      FigJS.withInternalUpdate(() => {
        untracked(() => {
          applyCanvasLang(DEFAULT_LANG);
          applyLanguageContent(DEFAULT_LANG, DEFAULT_LANG);
          purgeLanguageFromModel(lang.code);
          window.PresetRegistry.unregisterLanguage(lang.code);
        });
      });

      renderDropdown();
      if (FigJS.codeView && FigJS.codeView.sync) FigJS.codeView.sync();
      FigJS.markUnsaved();
      FigJS.setStatus(`Removed ${lang.name}; its content is gone from this page`, '#4caf50');
    });

    editor.onReady(() => renderDropdown());
  }

  FigJS.i18n = {
    install,
    getCurrentLang,
    onCurrentLangChange,
    emitLangChange,
    renderDropdown,
    snapshotLanguageContent,
    applyLanguageContent,
    switchLanguage: switchEditorLanguage,
    skipNextSnapshot,
    clearSnapshotSkip,
    pruneUnregisteredLanguageAttrs,
    computePageLanguages,
    commitActiveEditing,
  };
})();