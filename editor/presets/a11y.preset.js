// Accessibility tags: .sr-only (hidden visually, read by assistive tech)
// and .skip-link (keyboard "skip to content").

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-a11y',
  plugin: function (editor) {
    const {
      registerSimpleBlock,
      registerDependency,
      registerPresetSchemas,
      registerPresetClass,
      icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/a11y.css');
    registerDependency('js',  '/assets/js/a11y.js');

    registerPresetClass('sr-only');
    registerPresetClass('skip-link');

    // sr-only has no settings.

    registerPresetSchemas(['sr-only'], {
      title: 'Screen-reader only',
      properties: [],
    });

    registerPresetSchemas(['skip-link'], {
      title: 'Skip link',
      properties: [
        { key: '--skip-bg',       label: 'Background',     type: 'color-alpha', default: '#111111' },
        { key: '--skip-fg',       label: 'Text',           type: 'color',       default: '#ffffff' },
        { key: '--skip-radius',   label: 'Corner radius',  type: 'text',        default: '0 0 6px 6px' },
        { key: '--skip-pad',      label: 'Padding',        type: 'text',        default: '10px 16px' },
        { key: '--skip-offset',   label: 'Horizontal offset', type: 'range',
          min: 0, max: 200, step: 4, unit: 'px', default: 0 },
        { key: '--skip-z',        label: 'Z-index',        type: 'range',
          min: 0, max: 10000, step: 100, default: 9999 },
        { key: '--skip-duration', label: 'Transition',     type: 'range',
          min: 0, max: 0.6, step: 0.05, unit: 's', default: 0.15 },
      ],
    });

    // ---- Block -----------------------------------------------------------
    // The runtime gives <main> an id and moves focus on click; place the
    // link first in the body.

    registerSimpleBlock(editor, {
      id: 'skip-link',
      label: 'Skip to Content Link',
      category: 'Accessibility',
      media: icons.link,
      html: `<a href="#main" class="skip-link">Skip to content</a>`,
    });
  },
});