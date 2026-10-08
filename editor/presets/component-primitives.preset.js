// Component presets that carry their own content: badge, button, card,
// quote, responsive grid, clamped text, and the Sticky Header block
// composed from preset tags:
//   <header class="sticky-top span-bleed auto-bg auto-shadow pad-sm">
// Settings follow one layout (Colours with hover variants, Box, Text,
// Effects); variables are the component prefix plus a shared suffix
// (--badge-bg, --btn-bg, --card-bg); defaults equal the CSS fallbacks.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-component-primitives',
  plugin: function (editor) {
    const {
      registerComponentPreset, registerComponentSettings, registerSimpleBlock,
      registerDependency, registerPresetTag, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/presets.css');
    registerDependency('css', '/assets/css/site.css');

    // Same category object as universal-traits' Element group, so the tag swap joins it.
    const TAG_TRAIT = {
      type: 'select', name: 'tagName', label: 'Semantic tag', changeProp: true,
      category: { id: 'u-element', label: 'Element', open: false },
      options: ['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav'].map((t) => ({ id: t, name: t })),
    };

    const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'].map((s) => ({ id: s, name: s }));
    const TEXT_CASE = [
      { id: 'none', name: 'As typed' }, { id: 'uppercase', name: 'UPPERCASE' },
      { id: 'lowercase', name: 'lowercase' }, { id: 'capitalize', name: 'Capitalize' },
    ];

    // =============================================================
    // BADGE
    // =============================================================
    registerComponentSettings('badge', {
      title: 'Badge',
      properties: [
        { type: 'group', label: 'Colours' },
        { key: '--badge-bg', label: 'Background', type: 'color-alpha', default: '#222222' },
        { key: '--badge-bg-hover', label: 'Background (hover)', type: 'color-alpha' },
        { key: '--badge-fg', label: 'Text', type: 'color', default: '#ffffff' },
        { key: '--badge-fg-hover', label: 'Text (hover)', type: 'color' },
        { key: '--badge-border', label: 'Border', type: 'color-alpha', default: '#444444' },
        { key: '--badge-border-hover', label: 'Border (hover)', type: 'color-alpha' },
        { type: 'group', label: 'Box' },
        { key: '--badge-border-width', label: 'Border width', type: 'range', min: 0, max: 6, step: 1, unit: 'px', default: 1 },
        { key: '--badge-border-style', label: 'Border style', type: 'select', placeholder: 'solid', options: BORDER_STYLES },
        { key: '--badge-radius', label: 'Radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 999 },
        { key: '--badge-py', label: 'Padding Y', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 4 },
        { key: '--badge-px', label: 'Padding X', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 12 },
        { key: '--badge-icon-gap', label: 'Icon gap', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 6 },
        { type: 'group', label: 'Text' },
        { key: '--badge-size', label: 'Size', type: 'range', min: 0.5, max: 1.5, step: 0.02, unit: 'rem', default: 0.75 },
        { key: '--badge-weight', label: 'Weight', type: 'range', min: 300, max: 900, step: 100, default: 600 },
        { key: '--badge-tracking', label: 'Letter spacing', type: 'range', min: -0.05, max: 0.2, step: 0.005, unit: 'em', default: 0 },
        { key: '--badge-transform', label: 'Case', type: 'select', placeholder: 'As typed', options: TEXT_CASE },
        { type: 'group', label: 'Effects' },
        { key: '--badge-shadow', label: 'Shadow', type: 'shadow', default: '0 0 0 rgba(0,0,0,0)' },
        { key: '--badge-duration', label: 'Transition', type: 'range', min: 0, max: 0.6, step: 0.02, unit: 's', default: 0.15 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'badge',
      extend: 'text',
      name: 'Badge',
      label: 'Badge / Tag',
      category: 'Basic',
      media: icons.badge,
      tagName: 'span',
      classes: ['badge'],
      droppable: false,
      defaultComponents: 'New',
      traits: [],
    });

    // =============================================================
    // BUTTON
    // =============================================================
    registerComponentSettings('ui-button', {
      title: 'Button',
      properties: [
        { key: 'variant', label: 'Variant', type: 'class-select', placeholder: 'Bare (site colours)', options: [
          { id: 'btn-primary', name: 'Primary' }, { id: 'btn-secondary', name: 'Secondary' },
          { id: 'btn-ghost', name: 'Ghost' } ] },
        { type: 'group', label: 'Colours' },
        { key: '--btn-bg', label: 'Background', type: 'color-alpha' },
        { key: '--btn-bg-hover', label: 'Background (hover)', type: 'color-alpha' },
        { key: '--btn-fg', label: 'Text', type: 'color' },
        { key: '--btn-fg-hover', label: 'Text (hover)', type: 'color' },
        { key: '--btn-border', label: 'Border', type: 'color-alpha' },
        { key: '--btn-border-hover', label: 'Border (hover)', type: 'color-alpha' },
        { type: 'group', label: 'Box' },
        { key: '--btn-border-width', label: 'Border width', type: 'range', min: 0, max: 6, step: 1, unit: 'px', default: 1 },
        { key: '--btn-radius', label: 'Radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 6 },
        { key: '--btn-py', label: 'Padding Y', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 12 },
        { key: '--btn-px', label: 'Padding X', type: 'range', min: 0, max: 80, step: 2, unit: 'px', default: 24 },
        { key: '--btn-icon-gap', label: 'Icon gap', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 8 },
        { type: 'group', label: 'Text' },
        { key: '--btn-size', label: 'Size', type: 'range', min: 0.7, max: 1.6, step: 0.02, unit: 'rem', default: 1 },
        { key: '--btn-weight', label: 'Weight', type: 'range', min: 300, max: 900, step: 100, default: 600 },
        { key: '--btn-tracking', label: 'Letter spacing', type: 'range', min: -0.05, max: 0.2, step: 0.005, unit: 'em', default: 0 },
        { key: '--btn-transform', label: 'Case', type: 'select', placeholder: 'As typed', options: TEXT_CASE },
        { type: 'group', label: 'Effects' },
        { key: '--btn-shadow', label: 'Shadow', type: 'shadow', default: '0 0 0 rgba(0,0,0,0)' },
        { key: '--btn-shadow-hover', label: 'Shadow (hover)', type: 'shadow', default: '0 0 0 rgba(0,0,0,0)' },
        { key: '--btn-hover-y', label: 'Hover lift', type: 'range', min: -8, max: 8, step: 1, unit: 'px', default: -2 },
        { key: '--btn-duration', label: 'Transition', type: 'range', min: 0, max: 0.6, step: 0.02, unit: 's', default: 0.15 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'ui-button',
      extend: 'text',
      name: 'Button',
      label: 'Button',
      category: 'Basic',
      media: icons.link,
      tagName: 'a',
      classes: ['btn'],
      droppable: false,
      defaultAttributes: { href: '#' },
      defaultComponents: 'Click me',
      traits: [
        { type: 'text', name: 'href', label: 'Link', placeholder: 'https://example.com or #anchor',
          category: { id: 'c-button', label: 'Button', open: true } },
      ],
    });

    // =============================================================
    // CARD
    // =============================================================
    registerComponentSettings('card', {
      title: 'Card',
      properties: [
        { type: 'group', label: 'Colours' },
        { key: '--card-bg', label: 'Background', type: 'color-alpha', default: '#161616' },
        { key: '--card-fg', label: 'Text', type: 'color' },
        { key: '--card-border-color', label: 'Border', type: 'color-alpha', default: '#222222' },
        { type: 'group', label: 'Box' },
        { key: '--card-border-width', label: 'Border width', type: 'range', min: 0, max: 6, step: 1, unit: 'px', default: 1 },
        { key: '--card-border-style', label: 'Border style', type: 'select', placeholder: 'solid', options: BORDER_STYLES },
        { key: '--card-radius', label: 'Radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 6 },
        { key: '--card-pad', label: 'Padding', type: 'range', min: 0, max: 80, step: 2, unit: 'px', default: 20 },
        { type: 'group', label: 'Effects' },
        { key: '--card-shadow', label: 'Shadow', type: 'shadow', default: '0 0 0 rgba(0,0,0,0)' },
        { key: '--card-hover-shadow', label: 'Shadow (hover)', type: 'shadow', default: '0 0 0 rgba(0,0,0,0)' },
        { key: '--card-hover-y', label: 'Hover lift', type: 'range', min: -8, max: 8, step: 1, unit: 'px', default: 0 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'card',
      label: 'Card',
      category: 'Basic',
      media: icons.card,
      classes: ['card'],
      droppable: true,
      defaultComponents: '<h3>Card title</h3><p>Card body text goes here.</p>',
      traits: [TAG_TRAIT],
    });

    // =============================================================
    // QUOTE
    // =============================================================
    registerComponentSettings('quote', {
      title: 'Quote',
      properties: [
        { type: 'group', label: 'Colours' },
        { key: '--quote-bg', label: 'Background', type: 'color-alpha' },
        { key: '--quote-fg', label: 'Text', type: 'color' },
        { key: '--quote-border', label: 'Rule', type: 'color', default: '#ffffff' },
        { type: 'group', label: 'Box' },
        { key: '--quote-border-width', label: 'Rule width', type: 'range', min: 0, max: 12, step: 1, unit: 'px', default: 3 },
        { key: '--quote-border-style', label: 'Rule style', type: 'select', placeholder: 'solid', options: BORDER_STYLES },
        { key: '--quote-radius', label: 'Radius (right)', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 0 },
        { key: '--quote-pad', label: 'Padding (left)', type: 'range', min: 0, max: 60, step: 2, unit: 'px', default: 16 },
        { key: '--quote-pad-right', label: 'Padding (right)', type: 'range', min: 0, max: 40, step: 2, unit: 'px', default: 0 },
        { key: '--quote-pad-y', label: 'Padding Y', type: 'range', min: 0, max: 40, step: 2, unit: 'px', default: 0 },
        { key: '--quote-margin-y', label: 'Margin Y', type: 'range', min: 0, max: 80, step: 4, unit: 'px', default: 24 },
        { type: 'group', label: 'Text' },
        { key: '--quote-size', label: 'Size', type: 'range', min: 0.8, max: 2, step: 0.05, unit: 'rem', default: 1 },
        { key: '--quote-style', label: 'Style', type: 'segmented', default: 'italic', options: [
          { id: 'italic', name: 'Italic' }, { id: 'normal', name: 'Normal' } ] },
      ],
    });

    registerComponentPreset(editor, {
      id: 'quote',
      extend: 'text',
      name: 'Quote',
      label: 'Quote',
      category: 'Basic',
      media: icons.quote,
      classes: ['quote'],
      droppable: false,
      defaultComponents: '"A short quote or testimonial goes here."<br>Attribution',
      traits: [TAG_TRAIT],
    });

    // =============================================================
    // RESPONSIVE GRID
    // =============================================================
    registerComponentSettings('responsive-grid', {
      title: 'Responsive grid',
      properties: [
        { key: '--grid-cols-desktop', label: 'Columns (desktop)', type: 'range', min: 1, max: 6, step: 1, default: 3 },
        { key: '--grid-cols-tablet', label: 'Columns (tablet)', type: 'range', min: 1, max: 6, step: 1, default: 2 },
        { key: '--grid-cols-phone', label: 'Columns (phone)', type: 'range', min: 1, max: 6, step: 1, default: 1 },
        { key: '--gap', label: 'Cell gap', type: 'range', min: 0, max: 60, step: 2, unit: 'px', default: 20 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'responsive-grid',
      label: 'Responsive Grid',
      category: 'Layout',
      media: icons.columns3,
      classes: ['responsive-grid'],
      droppable: true,
      defaultComponents: '<div>Item</div><div>Item</div><div>Item</div>',
      traits: [TAG_TRAIT],
    });

    // =============================================================
    // CLAMPED TEXT
    // =============================================================
    registerComponentSettings('clamped-text', {
      title: 'Clamped text',
      properties: [
        { key: '--clamp-lines', label: 'Max lines', type: 'range', min: 1, max: 10, step: 1, default: 3 },
        { key: '--clamp-width', label: 'Max width', type: 'text', placeholder: '30ch, 480px, 100%', default: '100%' },
        { key: '_break', label: 'Word break', type: 'preset', options: [
          { name: 'Normal (at spaces)', values: { '--clamp-wrap': 'normal', '--clamp-word-break': 'normal' } },
          { name: 'Anywhere if needed', values: { '--clamp-wrap': 'anywhere', '--clamp-word-break': 'normal' } },
          { name: 'Split long tokens', values: { '--clamp-wrap': 'anywhere', '--clamp-word-break': 'break-word' } },
        ] },
      ],
    });

    registerComponentPreset(editor, {
      id: 'clamped-text',
      extend: 'text',
      name: 'Clamped Text',
      label: 'Clamped Text',
      category: 'Basic',
      media: icons.text,
      classes: ['clamped-text'],
      droppable: false,
      defaultComponents:
        'This text is clamped to the configured number of lines. Content beyond the limit ' +
        'is hidden with an ellipsis. Tune lines and word breaking in Settings.',
      traits: [TAG_TRAIT],
    });

    // =============================================================
    // STICKY HEADER (composed from tags)
    // =============================================================
    registerSimpleBlock(editor, {
      id: 'sticky-header-block',
      label: 'Sticky Header',
      category: 'Layout',
      media: icons.sticky,
      html: `
        <header class="sticky-top span-bleed auto-bg auto-shadow pad-sm">
          <div class="flex-between container">
            <strong>Brand</strong>
            <nav class="flex-center gap-md"><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></nav>
          </div>
        </header>`,
    });

    // Single-class sticky header; not in the catalog, shown where used.
    registerPresetTag('sticky-header', {
      description: 'Sticky header in one class. The Sticky Header block combines sticky-top, span-bleed, auto-bg and auto-shadow.',
      schema: {
        title: 'Sticky header',
        description: 'For separate control, combine sticky-top, span-bleed, auto-bg and auto-shadow.',
        properties: [
          { key: '--sticky-offset', label: 'Top offset', type: 'range', min: 0, max: 200, step: 2, unit: 'px', default: 0 },
          { key: '--sticky-z', label: 'Z-index', type: 'range', min: 0, max: 5000, step: 10, default: 100 },
          { key: '--sticky-bg-open', label: 'Background at rest', type: 'color-alpha' },
          { key: '--sticky-bg-scrolled', label: 'Background scrolled', type: 'color-alpha', default: 'rgba(20, 20, 20, 0.9)' },
          { key: '--sticky-shadow-scrolled', label: 'Shadow scrolled', type: 'shadow', default: '0 4px 20px rgba(0, 0, 0, 0.35)' },
          { key: '--sticky-pad-x', label: 'Side padding', type: 'range', min: 0, max: 120, step: 2, unit: 'px', default: 20 },
          { key: '--reveal-at', label: 'Reveal distance', type: 'range', min: 20, max: 400, step: 10, unit: 'px', default: 80 },
        ],
      },
    });
  },
});
