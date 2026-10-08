// Presets tab: the preset tag catalog and the settings of each tag on
// the selected element (see registry.js for preset tags vs component
// presets). Blocks are rendered by FigJS.settingsUI.
//   FigJS.presetsTab.install() / render()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Preset files add groups with PresetRegistry.registerPresetTags(group, classes).
  const BASE_CATALOG = {
    'Layout':           ['flex-center', 'flex-between', 'flex-col', 'center', 'center-text', 'absolute-center', 'relative',
                         'container', 'container-narrow', 'grid-auto', 'grid-2', 'grid-3', 'grid-4',
                         'grid-2-keep', 'grid-3-keep', 'grid-4-keep', 'grid-no-collapse',
                         'stack', 'stack-reverse', 'split', 'split-reverse', 'center-row', 'span-bleed'],
    'Position':         ['sticky-top', 'fixed-top', 'z-behind', 'z-front', 'z-top'],
    'Pin':              ['pin-top-left', 'pin-top', 'pin-top-right', 'pin-left', 'pin-center', 'pin-right',
                         'pin-bottom-left', 'pin-bottom', 'pin-bottom-right'],
    'Containment':      ['fill', 'clip-content', 'clamp-1', 'clamp-2', 'clamp-3', 'clamp-4', 'clamp-5', 'contain-content', 'break-all'],
    'Scroll reveal':    ['auto-bg', 'auto-shadow', 'auto-fade-down', 'auto-fade-up', 'auto-shrink', 'auto-blur'],
    'Parallax':         ['parallax'],
    'Responsive':       ['hide-phone', 'only-phone', 'hide-tablet', 'only-tablet', 'hide-desktop', 'only-desktop',
                         'collapse-phone', 'full-phone'],
    'Language':         ['lang-only', 'lang-hide'],
    'Scale':            ['scale', 'scale-75', 'scale-90', 'scale-110', 'scale-125'],
    'Spacing':          ['pad-sm', 'pad-md', 'pad-lg', 'gap-sm', 'gap-md', 'gap-lg', 'spacer-sm', 'spacer-md', 'spacer-lg'],
    'Backgrounds':      ['bg-gradient-linear', 'bg-gradient-radial', 'bg-noise', 'bg-video'],
    'Background image': ['bg-image-cover', 'bg-image-contain', 'bg-image-tile', 'bg-fixed'],
    'Effects':          ['glass', 'glass-dark', 'fx', 'shadow-custom', 'blur-custom', 'grayscale', 'saturate'],
    'Transparency':     ['opacity-90', 'opacity-75', 'opacity-50', 'opacity-25'],
    'Outlines & rings': ['outline-thin', 'outline-thick', 'outline-dashed', 'ring-accent'],
    'Image rendering':  ['img-render-auto', 'img-render-smooth', 'img-render-pixelated', 'img-render-crisp'],
    'Image effects':    ['img-outline-thin', 'img-outline-thick', 'img-glow', 'img-shadow', 'img-double-glow', 'img-outline-only'],
    'Text':             ['text-muted', 'text-small', 'text-large', 'text-nowrap', 'text-wrap', 'no-select'],
    'Entrance motion':  ['anim-fade-in', 'anim-slide-up', 'anim-slide-down', 'anim-slide-left', 'anim-slide-right', 'anim-zoom-in'],
    'Stagger delay':    ['anim-delay-1', 'anim-delay-2', 'anim-delay-3', 'anim-delay-4'],
    'Looping motion':   ['anim-pulse', 'anim-float', 'anim-spin', 'anim-blink'],
    'Hover effects':    ['hover-grow', 'hover-lift', 'hover-fade', 'hover-glow', 'hover-tilt', 'hover-zoom', 'hover-underline', 'hover-shift'],
    'Hover staging':    ['hover-stage'],
    'Viewport':         ['viewport-window'],
    'Sharing':          ['copy-content', 'anchor-copy', 'share-button'],
    'Navigation':       ['scrollspy'],
    'Accessibility':    ['skip-link', 'sr-only'],
    'Masking':          ['mask-custom', 'mask-circle', 'mask-hexagon', 'mask-star', 'mask-blob'],
    'Forms':            ['lang-select-styled'],
  };

  let searchTerm = '';

  function reg() { return window.PresetRegistry; }

  function applyMutex(component, cls) {
    const group = reg().getMutexGroups().find((g) => g.includes(cls));
    if (!group) return;
    group.forEach((other) => {
      if (other !== cls && component.getClasses().includes(other)) component.removeClass(other);
    });
  }

  function toggleTag(component, cls) {
    if (component.getClasses().includes(cls)) component.removeClass(cls);
    else { applyMutex(component, cls); component.addClass(cls); }
    FigJS.markUnsaved();
    render();
    if (FigJS.componentSettings) FigJS.componentSettings.render(true);
    FigJS.codeView.debouncedSync();
  }

  // Tags a component preset is built from belong to it (Settings panel).
  function composedTags(component) {
    const type = reg().matchComponentPresetType(component.getClasses()) || component.get('type');
    const def = reg().getComponentDefinition && reg().getComponentDefinition(type);
    return new Set((def && def.tags) || []);
  }

  function section(title, cls) {
    const box = document.createElement('section');
    box.className = 'fig-plain-section' + (cls ? ' ' + cls : '');
    const h = document.createElement('div');
    h.className = 'fig-plain-title';
    h.textContent = title;
    box.appendChild(h);
    return box;
  }

  function filterCatalog(container) {
    const term = searchTerm.trim().toLowerCase();
    container.querySelectorAll('[data-catalog]').forEach((group) => {
      let any = false;
      group.querySelectorAll('.preset-btn').forEach((btn) => {
        const match = !term || btn.dataset.search.includes(term);
        btn.style.display = match ? '' : 'none';
        if (match) any = true;
      });
      group.style.display = any ? '' : 'none';
    });
  }

  function render() {
    const editor = FigJS.editor;
    const container = document.getElementById('preset-buttons');
    if (!container || !editor) return;
    const selected = editor.getSelected();
    const scroller = container.closest('.gjs-pn-views-container') || container.parentElement;
    const scrollTop = scroller ? scroller.scrollTop : 0;

    container.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'fig-sticky-bar';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'fig-input';
    search.placeholder = 'Search preset tags';
    search.value = searchTerm;
    search.addEventListener('input', () => { searchTerm = search.value; filterCatalog(container); });
    bar.appendChild(search);
    container.appendChild(bar);

    if (!selected) {
      const hint = document.createElement('div');
      hint.className = 'fig-empty';
      hint.textContent = 'Select an element on the canvas to add preset tags to it.';
      container.appendChild(hint);
      return;
    }

    const adapter = FigJS.settingsUI.componentAdapter(selected);
    const classes = selected.getClasses();
    const owned = composedTags(selected);
    const componentClasses = reg().getComponentPresetClasses();

    const scope = document.createElement('div');
    scope.className = 'fig-scope-line';
    scope.textContent = 'Settings apply to: ' + adapter.scopeLabel();
    container.appendChild(scope);

    const activeTags = classes.filter((c) => reg().getPresetClasses().has(c)
      && !componentClasses.has(c) && !owned.has(c));
    const activeBox = section(`On this element (${activeTags.length})`);
    const activeBody = activeBox;

    const plain = [];
    activeTags.forEach((cls) => {
      const schema = reg().getPresetSchema(cls);
      if (schema && schema.properties && schema.properties.length) {
        activeBody.appendChild(FigJS.settingsUI.renderBlock(adapter, schema, {
          cls, removable: true,
          onRemove: () => { FigJS.markUnsaved(); render(); FigJS.codeView.debouncedSync(); },
          rerender: render,
        }));
      } else {
        plain.push(cls);
      }
    });
    if (plain.length) {
      const chips = document.createElement('div');
      chips.className = 'fig-tag-chips';
      plain.forEach((cls) => {
        const chip = document.createElement('span');
        chip.className = 'fig-tag-chip';
        chip.textContent = cls;
        chip.title = (reg().getPresetMeta(cls) || {}).description || '';
        const x = document.createElement('button');
        x.type = 'button';
        x.innerHTML = FigJS.icons.close;
        x.title = `Remove .${cls}`;
        x.addEventListener('click', () => toggleTag(selected, cls));
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.innerHTML = FigJS.icons.copy;
        copy.title = `Copy .${cls}`;
        copy.addEventListener('click', () => FigJS.settingsUI.clipboard.set({ kind: 'block', id: cls, cls, label: '.' + cls, values: {} }));
        chip.append(copy, x);
        chips.appendChild(chip);
      });
      activeBody.appendChild(chips);
    }
    if (!activeTags.length) {
      const empty = document.createElement('div');
      empty.className = 'fig-empty';
      empty.textContent = 'No preset tags yet. Add one below.';
      activeBody.appendChild(empty);
    }

    const clip = FigJS.settingsUI.clipboard.get();
    if (clip && clip.cls && !classes.includes(clip.cls)) {
      const paste = document.createElement('button');
      paste.type = 'button';
      paste.className = 'fig-wide-btn';
      paste.innerHTML = FigJS.icons.paste + `<span>Paste .${clip.cls}${Object.keys(clip.values).length ? ' with its settings' : ''}</span>`;
      paste.addEventListener('click', () => {
        applyMutex(selected, clip.cls);
        selected.addClass(clip.cls);
        Object.entries(clip.values).forEach(([k, rec]) => {
          if (rec.attr) adapter.writeAttr(k, rec.v, {});
          else adapter.write(k, rec.v, {});
        });
        FigJS.markUnsaved();
        render();
        FigJS.codeView.debouncedSync();
      });
      activeBody.appendChild(paste);
    }
    container.appendChild(activeBox);

    const catalog = section('Add preset tags', 'is-catalog');
    container.appendChild(catalog);
    const groups = reg().getPresetGroups();
    Object.entries(groups).forEach(([group, tags]) => {
      const usable = tags.filter((c) => !componentClasses.has(c));
      if (!usable.length) return;
      const box = document.createElement('div');
      box.className = 'preset-cat';
      box.dataset.catalog = group;
      const label = document.createElement('div');
      label.className = 'preset-cat-label';
      label.textContent = group;
      box.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'preset-btn-grid';
      usable.forEach((cls) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.textContent = cls;
        const meta = reg().getPresetMeta(cls) || {};
        btn.title = meta.description || '';
        btn.dataset.search = (group + ' ' + cls + ' ' + (meta.description || '')).toLowerCase();
        if (classes.includes(cls)) btn.classList.add('preset-active');
        if (owned.has(cls)) { btn.classList.add('is-owned'); btn.title = 'Part of this component (see Settings)'; }
        btn.addEventListener('click', () => toggleTag(selected, cls));
        grid.appendChild(btn);
      });
      box.appendChild(grid);
      catalog.appendChild(box);
    });

    filterCatalog(container);
    if (scroller) {
      scroller.scrollTop = scrollTop;
      requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
    }
  }

  function install() {
    const r = reg();
    Object.entries(BASE_CATALOG).forEach(([group, tags]) => r.registerPresetTags(group, tags));

    r.registerPresetSchemas(['lang-only'], {
      title: 'Show only in',
      properties: [{ key: 'data-lang-only', label: 'Languages', type: 'lang-multi', attr: true }],
    });
    r.registerPresetSchemas(['lang-hide'], {
      title: 'Hide in',
      properties: [{ key: 'data-lang-hide', label: 'Languages', type: 'lang-multi', attr: true }],
    });
    r.registerMutexGroup(['lang-only', 'lang-hide']);

    const editor = FigJS.editor;
    if (!editor) return;
    const refresh = () => { try { render(); } catch (e) { console.error('[presets-tab] render failed:', e); } };
    editor.on('undo', refresh);
    editor.on('redo', refresh);
    editor.on('component:selected', refresh);
    FigJS.settingsUI.clipboard.onChange(() => refresh());
  }

  FigJS.presetsTab = { install, render };
})();
