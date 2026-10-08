// Theme and language controls. Theme mode is <body data-theme-mode>
// (force-dark | force-light | auto | custom); theme-i18n.js sets
// data-theme from it, or leaves custom alone.
// The Language Switcher (.lang-switch) is a styleable button and menu
// filled from body[data-lang-available] (data-lang-display: tag, name or
// both), opening below, above or wherever it has room (data-menu-place);
// selecting it in the canvas shows the menu. Language Select is a
// native <select data-site-lang-select>. In the canvas neither switches
// the language; the toolbar does.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-theme-i18n',
  plugin: function (editor) {
    const {
      registerSimpleBlock, registerDependency, registerPresetSchemas,
      registerComponentPreset, registerComponentSettings, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/theme.css');
    registerDependency('js',  '/assets/js/theme-i18n.js');

    const DISPLAY = [
      { id: 'tag', name: 'Tag (EN)' }, { id: 'name', name: 'Name (English)' }, { id: 'both', name: 'Both' },
    ];

    registerComponentSettings('lang-switch', {
      title: 'Language switcher',
      properties: [
        { key: 'data-lang-display', attr: true, label: 'Shows', type: 'segmented', default: 'tag', options: DISPLAY },
        { key: 'data-menu-place', attr: true, label: 'Menu opens', type: 'segmented', default: '', options: [
          { id: '', name: 'Below' }, { id: 'above', name: 'Above' }, { id: 'auto', name: 'Auto' } ],
          help: 'Auto opens below, or above when the window has no room below (a switcher in a footer).' },
        { key: 'data-menu-align', attr: true, label: 'Menu align', type: 'segmented', default: '', options: [
          { id: '', name: 'Left' }, { id: 'right', name: 'Right' } ] },
        { type: 'group', label: 'Button' },
        { key: '--ls-bg', label: 'Background', type: 'color' },
        { key: '--ls-fg', label: 'Text', type: 'color' },
        { key: '--ls-border', label: 'Border', type: 'color' },
        { key: '--ls-border-hover', label: 'Border (hover)', type: 'color' },
        { key: '--ls-border-width', label: 'Border width', type: 'range', min: 0, max: 4, step: 1, unit: 'px', default: 1 },
        { key: '--ls-radius', label: 'Radius', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 6 },
        { key: '--ls-py', label: 'Padding Y', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 6 },
        { key: '--ls-px', label: 'Padding X', type: 'range', min: 0, max: 32, step: 1, unit: 'px', default: 10 },
        { key: '--ls-size', label: 'Text size', type: 'range', min: 0.6, max: 1.6, step: 0.05, unit: 'rem', default: 0.9 },
        { type: 'group', label: 'Menu' },
        { key: '--lsm-bg', label: 'Background', type: 'color' },
        { key: '--lsm-fg', label: 'Text', type: 'color' },
        { key: '--lsm-hover-bg', label: 'Item (hover)', type: 'color' },
        { key: '--lsm-hover-fg', label: 'Item text (hover)', type: 'color' },
        { key: '--lsm-active-fg', label: 'Current language', type: 'color' },
        { key: '--lsm-border', label: 'Border', type: 'color' },
        { key: '--lsm-radius', label: 'Radius', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 6 },
        { key: '--lsm-gap', label: 'Distance', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 4 },
        { key: '--lsm-shadow', label: 'Shadow', type: 'shadow', default: '0 4px 12px rgba(0,0,0,0.25)' },
      ],
    });

    registerComponentPreset(editor, {
      id: 'lang-switch',
      name: 'Language switcher',
      label: 'Language Switcher',
      category: 'Utility',
      media: icons.link,
      classes: ['lang-switch'],
      defaultAttributes: { 'data-site-lang-switch': '', 'data-lang-display': 'tag' },
      defaultComponents:
        '<button type="button" class="lang-switch-button" aria-haspopup="listbox" aria-expanded="false"' +
        ' data-gjs-draggable="false" data-gjs-removable="false" data-gjs-copyable="false" data-gjs-droppable="false"></button>' +
        '<ul class="lang-switch-menu" role="listbox" hidden' +
        ' data-gjs-draggable="false" data-gjs-removable="false" data-gjs-copyable="false" data-gjs-droppable="false"></ul>',
      traits: [],
    });

    registerPresetSchemas(['lang-select-styled'], {
      title: 'Language select',
      properties: [
        { key: 'data-lang-display', attr: true, label: 'Shows', type: 'segmented', default: 'name', options: DISPLAY },
        { key: '--ls-bg',           label: 'Background',        type: 'color-alpha', default: 'rgba(22, 22, 22, 1)' },
        { key: '--ls-fg',           label: 'Text',              type: 'color',       default: '#ffffff' },
        { key: '--ls-border',       label: 'Border',            type: 'color-alpha', default: 'rgba(51, 51, 51, 1)' },
        { key: '--ls-border-hover', label: 'Border (hover)',    type: 'color-alpha', default: 'rgba(102, 102, 102, 1)' },
        { key: '--ls-focus',        label: 'Focus ring',        type: 'color',       default: '#007acc' },
        { key: '--ls-radius',       label: 'Radius',            type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 6 },
        { key: '--ls-pad',          label: 'Padding',           type: 'text',        default: '6px 28px 6px 10px' },
        { key: '--ls-size',         label: 'Font size',         type: 'range', min: 0.7, max: 1.4, step: 0.05, unit: 'rem', default: 0.9 },
        { key: '--ls-duration',     label: 'Transition',        type: 'range', min: 0, max: 0.6, step: 0.05, unit: 's', default: 0.15 },
      ],
    });

    registerSimpleBlock(editor, {
      id: 'theme-toggle',
      label: 'Theme Toggle Button',
      category: 'Utility',
      media: icons.pulse,
      html: `
        <button type="button" class="btn btn-secondary"
                onclick="window.SiteTheme && window.SiteTheme.cycleTheme()">Toggle theme</button>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'lang-toggle',
      label: 'Language Select (native)',
      category: 'Utility',
      media: icons.link,
      html: `
        <div class="site-lang-select-wrap"
             style="display:inline-flex; align-items:center; gap:8px;">
          <span class="site-lang-select-label"
                style="color:inherit; font-size:0.9rem;">Language</span>
          <select class="site-lang-select lang-select-styled"
                  data-site-lang-select
                  aria-label="Language"></select>
        </div>
      `,
    });

    // A .theme-mode-host element sets data-theme-mode through its own settings.
    registerPresetSchemas(['theme-mode-host'], {
      title: 'Theme mode',
      properties: [
        { key: '_theme-mode', label: 'Mode', type: 'preset',
          options: [
            { name: 'Auto (follow OS)',   values: { 'data-theme-mode': 'auto' } },
            { name: 'Force dark',         values: { 'data-theme-mode': 'force-dark' } },
            { name: 'Force light',        values: { 'data-theme-mode': 'force-light' } },
            { name: 'Custom (page-owned)', values: { 'data-theme-mode': 'custom' } },
          ] },
      ],
    });
  },
});