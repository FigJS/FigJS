// GrapesJS init, the drop-URL handoff, and trait types registered before
// presets use them.
//   FigJS.editor                the GrapesJS instance
//   FigJS.noteDropUrl(url)      URL for the next inserted <img>
//   FigJS.resetImageTracking()  clear pending state (page load)

(function () {
  'use strict';

  window.FigJS = window.FigJS || {};

  const DEFAULT_LANG = 'en';

  // ===================== Drop-URL handoff ==============================

  const _pendingImgs = [];
  const _RECENT_MS = 30000;

  let _pendingUrl = null;
  let _pendingUrlAt = 0;
  const _URL_TTL_MS = 3000;

  function _isImgComp(comp) {
    if (!comp) return false;
    if (comp.get('type') === 'image') return true;
    const tag = String(comp.get('tagName') || '').toUpperCase();
    if (tag === 'IMG') return true;
    try {
      const el = comp.getEl && comp.getEl();
      if (el && el.tagName && String(el.tagName).toUpperCase() === 'IMG') return true;
    } catch (e) {}
    return false;
  }

  function _isImgEmpty(comp) {
    const src = comp.get('src');
    if (src == null || src === '') return true;
    const s = String(src);
    if (s.startsWith('<svg') || s === comp.get('fallback')) return true;
    return s.startsWith('blob:');
  }

  function _pruneRecent() {
    const cutoff = Date.now() - _RECENT_MS;
    while (_pendingImgs.length > 0 && _pendingImgs[0].at < cutoff) {
      _pendingImgs.shift();
    }
  }

  function _applySrcUntracked(comp, url) {
    const editor = window.FigJS && window.FigJS.editor;
    const um = editor && editor.UndoManager;
    const write = () => {
      comp.set('src', url);
      comp.addAttributes({ src: url });
    };
    if (um && typeof um.skip === 'function') um.skip(write);
    else write();
  }

  function _mergeDropIntoAdd(comp) {
    const editor = window.FigJS && window.FigJS.editor;
    if (!editor) return;
    const um = editor.UndoManager;
    if (!um || typeof um.getStack !== 'function' || typeof um.getPointer !== 'function') return;
    const stack = um.getStack();
    if (!stack) return;
    const pointer = um.getPointer();
    if (pointer < 1) return;

    const LOOKBACK = 10;
    let addIndex = -1;
    for (let i = pointer; i >= Math.max(0, pointer - LOOKBACK); i--) {
      const entry = stack.at(i);
      if (!entry) continue;
      if (entry.get('type') === 'add' && entry.get('after') === comp) {
        addIndex = i;
        break;
      }
    }
    if (addIndex < 0) return;

    const fusion = stack.at(addIndex).get('magicFusionIndex');
    for (let i = addIndex; i <= pointer; i++) {
      const entry = stack.at(i);
      if (entry) entry.set('magicFusionIndex', fusion);
    }
  }

  function _tryFillFirst(url) {
    if (!url) return false;
    _pruneRecent();

    for (let i = 0; i < _pendingImgs.length; i++) {
      const item = _pendingImgs[i];
      _pendingImgs.splice(i, 1);
      i--;

      const comp = item.comp;
      if (!comp || (comp.parent && !comp.parent())) continue;
      if (!_isImgEmpty(comp)) continue;

      _applySrcUntracked(comp, url);
      const view = comp.getView && comp.getView();
      if (view && typeof view.render === 'function') view.render();
      _mergeDropIntoAdd(comp);
      return true;
    }

    return false;
  }

  function noteDropUrl(url) {
    _pendingUrl = url;
    _pendingUrlAt = Date.now();

    if (_tryFillFirst(url)) {
      _pendingUrl = null;
    }
  }

  function resetImageTracking() {
    _pendingImgs.length = 0;
    _pendingUrl = null;
    _pendingUrlAt = 0;
  }

  // ===================== GrapesJS init =================================

  const editor = grapesjs.init({
    container: '#editor-container',
    height: '100%',
    width: 'auto',
    storageManager: false,
    allowScripts: 1,
    baseCss: '',
    protectedCss: '',
    canvas: {
      // No injected canvas styles: the canvas renders only the page.
      frameStyle: '/* none: the canvas renders only the page */',
    },
    plugins: window.PresetPlugins || [],
    pluginsOpts: {},

    avoidInlineStyle: true,

    undoManager: {
      trackSelection: false,
    },
    richTextEditor: {
      // canvas.js pastes once, as plain text.
      onPaste: () => {},
    },
    selectorManager: {
      componentFirst: true,
    },
    assetManager: {
      embedAsBase64: false,
      upload: '/api/upload',
      autoAdd: true,
      // Same pipeline as the Media tab.
      uploadFile: async function (e, clb) {
        const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
        if (!files || !files.length) return;
        const file = files[0];
        const result = await window.FigJS.media.upload(file);
        const asset = { src: result.url, name: file.name };
        editor.AssetManager.add(asset);
        const response = { data: [asset] };

        if (typeof clb === 'function') {
          const um = editor.UndoManager;
          if (um && typeof um.skip === 'function') um.skip(() => clb(response));
          else clb(response);
        } else {
          noteDropUrl(result.url);
        }
        return response;
      },
    },
    deviceManager: {
      devices: [
        { id: 'desktop', name: 'Desktop', width: '', height: '' },
        { id: 'tablet',  name: 'Tablet',  width: '768px',  height: '1024px', widthMedia: '1024px' },
        { id: 'phone',   name: 'Phone',   width: '375px',  height: '812px',  widthMedia: '640px' },
      ],
    },
  });

  window.FigJS.editor = editor;
  window.FigJS.undo.harden(editor);
  // Shorthands split by the browser on load are put back together (css-parts.js).
  window.FigJS.cssParts.install(editor);
  window.FigJS.noteDropUrl = noteDropUrl;
  window.FigJS.resetImageTracking = resetImageTracking;

  // ===================== Image tracking ================================

  let _dragAssetUrl = '';
  document.addEventListener('dragstart', (e) => {
    let u = '';
    try { u = (e.dataTransfer && e.dataTransfer.getData('application/x-fig-asset')) || ''; } catch (err) {}
    _dragAssetUrl = u;
  });
  document.addEventListener('dragend', () => { _dragAssetUrl = ''; });

  editor.on('component:add', (comp) => {
    if (!_isImgComp(comp) || !_isImgEmpty(comp)) return;

    const pending = (_pendingUrl && Date.now() - _pendingUrlAt < _URL_TTL_MS) ? _pendingUrl : '';
    const url = _dragAssetUrl || pending;
    if (url) {
      _applySrcUntracked(comp, url);
      _mergeDropIntoAdd(comp);
      if (url === _pendingUrl) _pendingUrl = null;
      return;
    }

    _pendingImgs.push({ comp, at: Date.now() });
    _pruneRecent();
  });

  // ===================== <a> editable patch ============================

  try {
    const linkType = editor.DomComponents.getType('link');
    if (linkType && linkType.model) {
      const origIsComp = linkType.model.isComponent;
      if (typeof origIsComp === 'function') {
        linkType.model.isComponent = function (el, opts) {
          const r = origIsComp.call(this, el, opts);
          if (r && r.type === 'link') r.editable = true;
          return r;
        };
      }
      const proto = linkType.model.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'defaults');
      if (desc && typeof desc.get === 'function') {
        const origGet = desc.get;
        Object.defineProperty(proto, 'defaults', {
          configurable: true,
          enumerable: desc.enumerable,
          get() { return { ...origGet.call(this), editable: true }; },
        });
      }
    }
  } catch (e) { }

  // ===================== range trait patch =============================

  editor.Traits.addType('range', {
    getInputEl: function () {
      if (this.__rangeInput) return this.__rangeInput;
      const m = this.model;
      const a = m.attributes;
      const input = document.createElement('input');
      input.type = 'range';
      if (a.min != null) input.min = a.min;
      if (a.max != null) input.max = a.max;
      input.step = a.step != null ? String(a.step) : 'any';
      const v = m.getValue();
      input.value = (v != null && v !== '')
        ? v
        : (a.default != null ? a.default : 0);
      this.__rangeInput = input;
      return input;
    },
  });

  // ===================== i18n-text trait ===============================
  //
  // One field for the language the canvas shows: <name> for the default
  // language, <name>-<lang> for others. A focused field keeps the
  // language its edit started in.
  editor.Traits.addType('i18n-text', {
    getInputEl: function () {
      if (this.__i18nInput) return this.__i18nInput;

      const trait = this.model;
      const baseName = trait.get('name');
      const comp = trait.target || editor.getSelected();
      const basePlaceholder = trait.get('placeholder') || '';

      const input = document.createElement('input');
      input.type = 'text';
      input.spellcheck = true;

      const currentLang = () => (window.FigJS.i18n && window.FigJS.i18n.getCurrentLang)
        ? window.FigJS.i18n.getCurrentLang() : DEFAULT_LANG;
      const keyFor = (lang) => (!lang || lang === DEFAULT_LANG) ? baseName : `${baseName}-${lang}`;

      let editKey = null;
      let baseline = '';
      const key = () => editKey || keyFor(currentLang());
      const attrs = () => (comp && comp.getAttributes()) || {};

      const refresh = () => {
        if (document.activeElement === input) return;
        const lang = currentLang();
        const a = attrs();
        const val = a[keyFor(lang)] || '';
        if (input.value !== val) input.value = val;
        if (lang && lang !== DEFAULT_LANG) {
          const fallback = a[baseName] || '';
          input.placeholder = fallback ? `${lang.toUpperCase()} text (falls back to: ${fallback})` : `${lang.toUpperCase()} text`;
          input.title = `Editing the ${lang.toUpperCase()} text (toolbar language)`;
        } else {
          input.placeholder = basePlaceholder;
          input.title = '';
        }
      };

      const write = (k, value, opts) => {
        if (!comp) return;
        if (value === '' || value == null) comp.removeAttributes([k], opts || {});
        else comp.addAttributes({ [k]: value }, opts || {});
      };

      // One undo entry per edit: previews are untracked; the commit resets to
      // the baseline untracked, then writes once.
      const commit = () => {
        const k = key();
        const next = input.value == null ? '' : String(input.value);
        if (next !== baseline) {
          FigJS.undo.untracked(() => write(k, baseline, {}));
          write(k, next, {});
          window.FigJS.markUnsaved();
        }
        baseline = next;
      };

      input.addEventListener('focus', () => {
        editKey = keyFor(currentLang());
        baseline = attrs()[editKey] || '';
      });
      input.addEventListener('input', () => write(key(), input.value, { avoidStore: true }));
      input.addEventListener('blur', () => { commit(); editKey = null; refresh(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') {
          e.preventDefault();
          FigJS.undo.untracked(() => write(key(), baseline, { avoidStore: true }));
          input.value = baseline;
          input.blur();
        }
      });

      this.__offLang = (window.FigJS.i18n && window.FigJS.i18n.onCurrentLangChange)
        ? window.FigJS.i18n.onCurrentLangChange(refresh) : null;
      if (comp && typeof comp.on === 'function') {
        this.__attrListener = refresh;
        this.__attrComp = comp;
        comp.on('change:attributes', refresh);
      }

      refresh();
      this.__i18nInput = input;
      return input;
    },

    removed: function () {
      if (this.__offLang) { this.__offLang(); this.__offLang = null; }
      if (this.__attrComp && this.__attrListener) {
        try { this.__attrComp.off('change:attributes', this.__attrListener); } catch (e) {}
      }
      this.__attrComp = null;
      this.__attrListener = null;
    },
  });
})();