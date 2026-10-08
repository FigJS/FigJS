// Preset registry.
//
// Preset tag: a class toggled on any element (.glass, .sticky-top ...). Its
// look lives in public/assets/css; its settings are custom properties,
// edited in the Presets tab.
//   registerPresetTags(group, ['a', 'b'])           catalog entry
//   registerPresetTag('a', { group, description })  metadata
//   registerPresetSchema('a', schema)               settings
//   registerMutexGroup(['a', 'b'])                  at most one applied
//
// Component preset: an element type (tag, identifying class, composed
// preset tags, settings, traits). Its settings and those of its tags
// render in the Settings panel.
//   registerComponentPreset(editor, {
//     id, label, category, tagName,
//     classes,           identifying classes, all required
//     alternateClasses,  any one also identifies it
//     tags,              composed preset tags
//     extend,            GrapesJS base type
//     partSettings,      a selected part also shows its own settings
//     methods,           extra model methods (getName ...)
//     traits, defaultAttributes, defaultComponents, view, blocks ...
//   })
//   registerComponentSettings(id, schema)
//   registerRoleSettings(match, schema)   by where an element sits (a gallery slide)
//
// Simple block: static markup, registerSimpleBlock(editor, { id, label, category, html }).
//
// Schema (rendered by settings-ui.js):
//   { title, description, modifier: { label, op, value, format },
//     properties: [{ key, label, type, min, max, step, unit, default, options },
//                  { type: 'group', label }] }
//   types: color, color-alpha, range, number, select, segmented, toggle,
//     aspect (the shared shapes, extra: [{ id, name }] first, any ratio typed),
//     text (browse: 'image' | 'audio' | 'video'), textarea, spacing,
//     shadow, gradient, lang-multi, preset, action (a button: run(adapter)),
//     types added with FigJS.settingsUI.registerField (thumbnail), or any
//     row with build(ctx) -> { el, refresh }
//   Keys starting data- / aria- (or attr: true) are attributes; others are
//   style properties. `default` equals the stylesheet's CSS fallback.
//   A text or select placeholder may be a function of the adapter (a value
//   followed from elsewhere, like a gallery's slide default).

window.PresetRegistry = (function () {
  'use strict';

  const ICON_ATTRS = 'viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    text: `<svg ${ICON_ATTRS}><path d="M5 5h14M12 5v14"/></svg>`,
    link: `<svg ${ICON_ATTRS}><path d="M9 15l6-6"/><path d="M8 17l-2 2a3.5 3.5 0 01-5-5l3-3a3.5 3.5 0 015 0"/><path d="M16 7l2-2a3.5 3.5 0 015 5l-3 3a3.5 3.5 0 01-5 0"/></svg>`,
    image: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="M21 16l-5.5-5.5L3 20"/></svg>`,
    video: `<svg ${ICON_ATTRS}><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2z"/></svg>`,
    columns2: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg>`,
    columns3: `<svg ${ICON_ATTRS}><rect x="2.5" y="4" width="5.5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="16" rx="1"/><rect x="16" y="4" width="5.5" height="16" rx="1"/></svg>`,
    divider: `<svg ${ICON_ATTRS}><path d="M4 12h16"/></svg>`,
    spacer: `<svg ${ICON_ATTRS}><path d="M12 4v16M8 7l4-3 4 3M8 17l4 3 4-3"/></svg>`,
    audio: `<svg ${ICON_ATTRS}><path d="M4 10v4M8 6v12M12 9v6M16 5v14M20 10v4"/></svg>`,
    card: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/></svg>`,
    pulse: `<svg ${ICON_ATTRS} stroke-width="1.4"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="10" opacity="0.25"/></svg>`,
    embed: `<svg ${ICON_ATTRS}><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/><path d="M8 21h8"/></svg>`,
    badge: `<svg ${ICON_ATTRS}><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
    quote: `<svg ${ICON_ATTRS}><path d="M7 7c-2 1-3 3-3 5.5S5.5 17 8 17"/><path d="M15 7c-2 1-3 3-3 5.5s1.5 4.5 4 4.5"/></svg>`,
    stats: `<svg ${ICON_ATTRS}><path d="M5 20V10M12 20V4M19 20v-7"/></svg>`,
    social: `<svg ${ICON_ATTRS}><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7.8 7.2L11 16M16.2 7.2L13 16M8.2 6h7.6"/></svg>`,
    path: `<svg ${ICON_ATTRS}><path d="M4 18C6 6 14 20 20 6"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>`,
    layers: `<svg ${ICON_ATTRS}><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>`,
    free: `<svg ${ICON_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="6" height="5"/><circle cx="16" cy="15" r="2.5"/></svg>`,
    footer: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18M7 18h4"/></svg>`,
    sticky: `<svg ${ICON_ATTRS}><path d="M4 4h16M4 4v6a8 8 0 0016 0V4"/><path d="M12 14v6"/></svg>`,
    contents: `<svg ${ICON_ATTRS}><path d="M4 6h2M9 6h11M4 12h2M11 12h9M4 18h2M11 18h9"/></svg>`,
    contentsLayout: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1.5M5.5 11h1.5M5.5 14h1.5"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/></svg>`,
    file: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></svg>`,
  };

  // ===================== Simple blocks =================================

  function registerSimpleBlock(editor, { id, label, category, html, css, media }) {
    editor.BlockManager.add(id, {
      label, category: category || 'Presets', media: media || '',
      content: css ? `${html}\n<style>\n${css}\n</style>` : html,
    });
  }

  // ===================== Preset tags ===================================

  const presetClassNames = new Set();
  const presetMeta = {};          // class -> { group, description, label }
  const presetGroups = new Map(); // group -> classes, in order
  const presetSchemas = {};
  const mutexGroups = [];

  function registerPresetClass(name) {
    if (typeof name === 'string' && name) presetClassNames.add(name);
  }
  function registerPresetClasses(names) {
    if (Array.isArray(names)) names.forEach(registerPresetClass);
  }

  function registerPresetTags(group, classes) {
    if (!presetGroups.has(group)) presetGroups.set(group, []);
    const list = presetGroups.get(group);
    (classes || []).forEach((c) => {
      registerPresetClass(c);
      if (!list.includes(c)) list.push(c);
      presetMeta[c] = { ...(presetMeta[c] || {}), group };
    });
  }

  function registerPresetTag(cls, meta) {
    const m = meta || {};
    registerPresetClass(cls);
    presetMeta[cls] = { ...(presetMeta[cls] || {}), ...m };
    if (m.group) registerPresetTags(m.group, [cls]);
    if (m.schema) registerPresetSchema(cls, m.schema);
    if (m.mutex) registerMutexGroup(m.mutex);
  }

  function getPresetGroups() {
    const out = {};
    presetGroups.forEach((list, group) => { out[group] = list.slice(); });
    return out;
  }
  function getPresetMeta(cls) { return presetMeta[cls] || null; }
  function getPresetClasses() { return new Set(presetClassNames); }

  function registerPresetSchema(className, schema) {
    presetSchemas[className] = schema;
    registerPresetClass(className);
    if (schema && schema.description && !(presetMeta[className] || {}).description) {
      presetMeta[className] = { ...(presetMeta[className] || {}), description: schema.description };
    }
  }
  function registerPresetSchemas(classNames, schema) {
    classNames.forEach((c) => registerPresetSchema(c, schema));
  }
  function getPresetSchema(className) { return presetSchemas[className] || null; }

  // At most one class of a group (classes setting the same property).
  function registerMutexGroup(group) {
    if (Array.isArray(group) && group.length > 1) mutexGroups.push(group);
  }
  function getMutexGroups() { return mutexGroups.slice(); }

  // Identifying classes of component presets; never offered as toggles.
  const componentPresetClasses = new Set();
  function getComponentPresetClasses() { return new Set(componentPresetClasses); }

  const componentDefs = {};
  const componentPresetMatchers = [];

  // Recognises a component whose type was lost (re-parsed as text) by its
  // classes; the preset requiring the most classes wins.
  function matchComponentPresetType(classList) {
    const has = (c) => classList.indexOf(c) !== -1;
    let best = null;
    let score = 0;
    for (const m of componentPresetMatchers) {
      const s = m.required.length && m.required.every(has) ? m.required.length
        : m.any.length && m.any.some(has) ? 1 : 0;
      if (s > score) { best = m.id; score = s; }
    }
    return best;
  }

  function getComponentDefinition(id) { return componentDefs[id] || null; }

  // Container classes: the Layout tags and component presets that take children.
  function getContainerClasses() {
    const out = new Set(presetGroups.get('Layout') || []);
    Object.values(componentDefs).forEach((d) => { if (d.droppable) d.classes.forEach((c) => out.add(c)); });
    return Array.from(out);
  }

  // One list of shapes for every aspect setting (field type 'aspect' in
  // settings-ui.js): Aspect box, images, gallery slides, Image Cycle,
  // Free canvas, Video player.
  const ASPECTS = [
    ['21 / 9', '21:9'], ['16 / 9', '16:9'], ['3 / 2', '3:2'], ['4 / 3', '4:3'], ['1 / 1', 'Square'],
    ['4 / 5', 'Portrait 4:5'], ['3 / 4', 'Portrait 3:4'], ['2 / 3', 'Portrait 2:3'], ['9 / 16', 'Tall 9:16'],
  ];
  function aspectOptions() { return ASPECTS.map(([id, name]) => ({ id, name })); }

  const componentSettings = {};
  function registerComponentSettings(typeId, schema) {
    if (typeof typeId === 'string' && typeId && schema) componentSettings[typeId] = schema;
  }
  function getComponentSettings(typeId) { return componentSettings[typeId] || null; }

  // Settings an element gets from its parent's role (placement in a .free-canvas).
  const childSettings = [];
  function registerChildSettings(parentClass, schema) {
    if (parentClass && schema) childSettings.push({ parentClass, schema });
  }
  function getChildSettings(parentClasses) {
    const has = new Set(parentClasses || []);
    return childSettings.filter((c) => has.has(c.parentClass)).map((c) => c.schema);
  }

  // Settings an element gets from where it sits, at any depth (a gallery's
  // slide or cover): match(component) -> truthy; schema may be a function
  // of the component. schema.replaces lists keys the element's own
  // settings then leave to this block.
  const roleSettings = [];
  function registerRoleSettings(match, schema) {
    if (typeof match === 'function' && schema) roleSettings.push({ match, schema });
  }
  function getRoleSettings(component) {
    const out = [];
    roleSettings.forEach((r) => {
      try {
        if (!r.match(component)) return;
        const schema = typeof r.schema === 'function' ? r.schema(component) : r.schema;
        if (schema) out.push(schema);
      } catch (e) { console.error('[registry] role settings failed', e); }
    });
    return out;
  }

  function registerComponentPreset(editor, opts) {
    const {
      id, label, category, tagName, classes, alternateClasses, media,
      defaultAttributes, traits, blockAttributes, placeholder, view,
      defaultComponents, style, resizable, stylable,
      draggable, droppable, removable, copyable,
      extend, name, tags, partSettings, methods,
    } = opts;

    const requiredClasses = classes || [];
    const anyOfClasses = alternateClasses || [];
    const composedOf = tags || [];
    componentDefs[id] = {
      id, label, tags: composedOf, classes: requiredClasses.concat(anyOfClasses), droppable: !!droppable,
      partSettings: !!partSettings,
    };
    componentPresetMatchers.push({ id, required: requiredClasses, any: anyOfClasses });
    requiredClasses.concat(anyOfClasses).forEach((c) => {
      componentPresetClasses.add(c);
      registerPresetClass(c);
    });
    composedOf.forEach(registerPresetClass);

    editor.DomComponents.addType(id, {
      ...(extend ? { extend } : {}),
      isComponent(el) {
        if (!el.classList) return;
        const allRequired = requiredClasses.length > 0 && requiredClasses.every((c) => el.classList.contains(c));
        const anyAlternate = anyOfClasses.length > 0 && anyOfClasses.some((c) => el.classList.contains(c));
        if (allRequired || anyAlternate) return { type: id };
      },
      model: {
        defaults: {
          tagName: tagName || 'div',
          name: name || label || id,
          classes: requiredClasses.concat(composedOf),
          draggable: draggable != null ? draggable : true,
          droppable: droppable != null ? droppable : false,
          removable: removable != null ? removable : true,
          copyable: copyable != null ? copyable : true,
          // A default style becomes the element's id rule.
          style: style || {},
          resizable: resizable != null ? resizable : true,
          stylable: stylable != null ? stylable : true,
          attributes: defaultAttributes || {},
          traits: traits || [],
          components: defaultComponents || [],
        },
        ...(methods || {}),
      },
      view: view || (placeholder ? {
        onRender() {
          const el = this.el;
          el.querySelectorAll('[data-gjs-preset-placeholder]').forEach((n) => n.remove());
          const badge = document.createElement('div');
          badge.setAttribute('data-gjs-preset-placeholder', '1');
          badge.className = 'fig-preset-placeholder';
          if (placeholder.style) badge.style.cssText = placeholder.style;
          badge.innerHTML = placeholder.render(this.model);
          if (!el.style.position) el.style.position = 'relative';
          el.appendChild(badge);
        },
      } : undefined),
    });

    // One type, several blocks with different default attributes.
    if (Array.isArray(opts.blocks) && opts.blocks.length) {
      opts.blocks.forEach((b) => {
        editor.BlockManager.add(`${id}-${b.id}`, {
          label: b.label,
          category: b.category || category || 'Presets',
          media: b.media || media || '',
          content: { type: id, attributes: Object.assign({}, defaultAttributes || {}, b.attributes || {}) },
        });
      });
    } else if (opts.block !== false) {
      editor.BlockManager.add(`${id}-block`, {
        label, category: category || 'Presets', media: media || '',
        content: { type: id, attributes: blockAttributes || defaultAttributes || {} },
      });
    }
  }

  // ===================== Dependencies ==================================

  const dependencies = { css: [], js: [] };
  function registerDependency(type, url) {
    const list = dependencies[type];
    if (list && !list.includes(url)) list.push(url);
  }
  function getDependencies() {
    return { css: dependencies.css.slice(), js: dependencies.js.slice() };
  }
  // A runtime file under a new name: a page naming the old one is moved to
  // it as it loads (canvas.js ensureDeps), and saved so.
  const renamedDependencies = {};
  function renameDependency(from, to) { renamedDependencies[from] = to; }
  function getRenamedDependencies() { return { ...renamedDependencies }; }

  registerDependency('css', '/assets/css/site.css');
  registerDependency('css', '/assets/css/theme.css');
  registerDependency('css', '/assets/css/presets.css');
  registerDependency('css', '/assets/css/ui-presets.css');
  registerDependency('css', '/assets/fonts/fonts.css');
  registerDependency('css', '/assets/css/library.css');
  registerDependency('js',  '/assets/js/theme-i18n.js');
  registerDependency('js',  '/assets/js/tooltip.js');
  registerDependency('js',  '/assets/js/lang-visibility.js');
  registerDependency('js',  '/assets/js/span-bleed.js');
  registerDependency('css', '/assets/css/navigation.css');
  registerDependency('js',  '/assets/js/navigation.js');

  // Languages: localStorage holds the list after the first run (a removed
  // language stays removed). The default language is fixed.

  const DEFAULT_LANG = 'en';
  const LANG_STORE_KEY = 'fig.languages';
  const LANG_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

  let languages;
  const rawLangStore = (() => {
    try { return localStorage.getItem(LANG_STORE_KEY); } catch (e) { return null; }
  })();

  if (rawLangStore != null) {
    let parsed = [];
    try { parsed = JSON.parse(rawLangStore) || []; } catch (e) { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [];
    const seen = new Set();
    languages = [];
    parsed.forEach((entry) => {
      if (!entry || !entry.code) return;
      const code = String(entry.code).trim().toLowerCase();
      if (!code || seen.has(code)) return;
      seen.add(code);
      languages.push({ code, name: String(entry.name || code) });
    });
    if (!languages.some((l) => l.code === DEFAULT_LANG)) languages.unshift({ code: DEFAULT_LANG, name: 'English' });
  } else {
    languages = [{ code: 'en', name: 'English' }];
    try { localStorage.setItem(LANG_STORE_KEY, JSON.stringify(languages)); } catch (e) {}
  }

  function persistLanguages() {
    try { localStorage.setItem(LANG_STORE_KEY, JSON.stringify(languages)); } catch (e) {}
  }

  const languageListeners = new Set();
  function notifyLanguages() {
    languageListeners.forEach((fn) => { try { fn(languages.slice()); } catch (e) {} });
  }
  function onLanguagesChange(fn) {
    languageListeners.add(fn);
    return () => languageListeners.delete(fn);
  }

  function getLanguages() { return languages.slice(); }
  function getLanguageCodes() { return languages.map((l) => l.code); }
  function getDefaultLang() { return DEFAULT_LANG; }
  function hasLanguage(code) {
    code = String(code || '').toLowerCase();
    return languages.some((l) => l.code === code);
  }

  function registerLanguage(code, name) {
    code = String(code || '').trim().toLowerCase();
    if (!LANG_CODE_RE.test(code)) return { ok: false, reason: 'Invalid code (expected e.g. "fr" or "pt-br")' };
    if (languages.some((l) => l.code === code)) return { ok: false, reason: 'Already registered' };
    const entry = { code, name: String(name || '').trim() || code.toUpperCase() };
    languages.push(entry);
    persistLanguages();
    notifyLanguages();
    return { ok: true, language: entry };
  }

  function setLanguageName(code, name) {
    const entry = languages.find((l) => l.code === String(code || '').toLowerCase());
    const n = String(name || '').trim();
    if (!entry || !n || entry.name === n) return;
    entry.name = n;
    persistLanguages();
    notifyLanguages();
  }

  function unregisterLanguage(code) {
    code = String(code || '').trim().toLowerCase();
    if (code === DEFAULT_LANG) return { ok: false, reason: 'Cannot remove the default language' };
    const idx = languages.findIndex((l) => l.code === code);
    if (idx < 0) return { ok: false, reason: 'Not registered' };
    const [removed] = languages.splice(idx, 1);
    persistLanguages();
    notifyLanguages();
    return { ok: true, language: removed };
  }

  // How an in-page link brings its target into view (navigation.js), set
  // on a link or a container (Contents, Markdown block, scrollspy).
  // Accordions and floating panels holding the target open on the way.
  // `defaults` names what an unset value means there.

  function linkArrivalProperties(defaults) {
    const d = defaults || {};
    const center = d.align === 'center';
    const fill = d.highlight === 'fill';
    const lit = (a) => a.readAttr('data-jump-highlight') !== 'none';
    return [
      { type: 'group', label: 'Link arrival' },
      { key: 'data-jump-align', attr: true, label: 'Target lands at', type: 'segmented', default: '',
        options: center
          ? [{ id: '', name: 'Center' }, { id: 'start', name: 'Top' }]
          : [{ id: '', name: 'Top' }, { id: 'center', name: 'Center' }],
        help: 'Top stops below sticky headers.' },
      { key: 'data-jump-scroll', attr: true, label: 'Scroll', type: 'segmented', default: '',
        options: [{ id: '', name: 'Smooth' }, { id: 'instant', name: 'Instant' }] },
      { key: 'data-jump-highlight', attr: true, label: 'Highlight', type: 'segmented', default: '', rerender: true,
        options: fill
          ? [{ id: '', name: 'Fill' }, { id: 'outline', name: 'Outline' }, { id: 'none', name: 'None' }]
          : [{ id: '', name: 'Outline' }, { id: 'fill', name: 'Fill' }, { id: 'none', name: 'None' }],
        help: 'Briefly marks the target when it arrives.' },
      { key: '--jump-color', label: 'Highlight colour', type: 'color-alpha', when: lit },
      { key: '--jump-duration', label: 'Highlight time', type: 'range', min: 0.4, max: 6, step: 0.1, unit: 's',
        default: 2.4, when: lit },
      { key: 'data-jump-hash', attr: true, label: 'Address bar', type: 'segmented', default: '',
        options: [{ id: '', name: 'Page' }, { id: 'on', name: 'Page#target' }],
        help: 'Page#target makes the spot shareable; a reload returns to it the same way.' },
    ];
  }

  return {
    icons,
    registerSimpleBlock,
    linkArrivalProperties,
    registerChildSettings, getChildSettings,
    registerRoleSettings, getRoleSettings,

    registerPresetTags, registerPresetTag, getPresetGroups, getPresetMeta,
    registerPresetClass, registerPresetClasses, getPresetClasses,
    registerPresetSchema, registerPresetSchemas, getPresetSchema,
    registerMutexGroup, getMutexGroups,

    registerComponentPreset, getComponentDefinition,
    registerComponentSettings, getComponentSettings,
    getComponentPresetClasses, matchComponentPresetType, getContainerClasses,
    aspectOptions,

    registerDependency, getDependencies, renameDependency, getRenamedDependencies,

    getLanguages, getLanguageCodes, getDefaultLang, hasLanguage,
    registerLanguage,
    setLanguageName, unregisterLanguage, onLanguagesChange,
  };
})();
