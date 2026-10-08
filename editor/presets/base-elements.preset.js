// Settings for GrapesJS's own types, so plain elements get a Settings
// block: default (Box), text, image, link. They write ordinary CSS to
// the element's rule (or Library rule); component presets take
// precedence. Also the .fill, .text-nowrap, .text-wrap, .no-select tags and
// the Footer.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-base-elements',
  plugin: function (editor) {
    const {
      registerComponentSettings, registerComponentPreset, registerPresetSchemas,
      registerDependency, registerMutexGroup, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/presets.css');

    const opt = (ids) => ids.map((x) => (Array.isArray(x) ? { id: x[0], name: x[1] } : { id: x, name: x }));
    const BORDER_STYLES = opt(['solid', 'dashed', 'dotted', 'double', 'none']);
    const ALIGN = opt([['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']]);

    const COLOURS = [
      { type: 'group', label: 'Colours' },
      { key: 'background-color', label: 'Background', type: 'color' },
      { key: 'color', label: 'Text', type: 'color' },
      { key: 'border-color', label: 'Border', type: 'color' },
    ];
    const SHAPE = [
      { type: 'group', label: 'Shape' },
      { key: 'border-width', label: 'Border width', type: 'range', min: 0, max: 12, step: 1, unit: 'px', default: 0 },
      { key: 'border-style', label: 'Border style', type: 'select', placeholder: 'none', options: BORDER_STYLES },
      { key: 'border-radius', label: 'Corner radius', type: 'range', min: 0, max: 200, step: 1, unit: 'px', default: 0 },
    ];

    // =============================================================
    // Box (default type: div, section, header, footer, main …)
    // =============================================================
    registerComponentSettings('default', {
      title: 'Box',
      properties: [
        ...COLOURS,
        ...SHAPE,
        { key: 'overflow', label: 'Content', type: 'segmented', default: 'visible', options: opt([
          ['visible', 'Overflow'], ['clip', 'Clip to shape'] ]) },
        { type: 'group', label: 'Spacing' },
        { key: 'padding', label: 'Padding', type: 'spacing' },
      ],
    });

    // =============================================================
    // Text
    // =============================================================
    registerComponentSettings('text', {
      title: 'Text',
      properties: [
        { type: 'group', label: 'Type' },
        { key: 'color', label: 'Colour', type: 'color' },
        { key: 'font-size', label: 'Size', type: 'range', min: 8, max: 120, step: 1, unit: 'px', default: 16 },
        { key: 'font-weight', label: 'Weight', type: 'range', min: 100, max: 900, step: 100, default: 400 },
        { key: 'line-height', label: 'Line height', type: 'range', min: 0.8, max: 2.5, step: 0.05, default: 1.5 },
        { key: 'letter-spacing', label: 'Letter spacing', type: 'range', min: -0.1, max: 0.5, step: 0.005, unit: 'em', default: 0 },
        { key: 'text-align', label: 'Align', type: 'segmented', options: ALIGN },
        { type: 'group', label: 'Box' },
        { key: 'background-color', label: 'Background', type: 'color' },
        { key: 'border-radius', label: 'Corner radius', type: 'range', min: 0, max: 200, step: 1, unit: 'px', default: 0 },
        { key: 'padding', label: 'Padding', type: 'spacing' },
      ],
    });

    // =============================================================
    // Image
    // =============================================================
    registerComponentSettings('image', {
      title: 'Image',
      properties: [
        { key: 'src', attr: true, label: 'Image', type: 'text', browse: 'image', placeholder: '/assets/images/picture.png',
          help: 'Browse picks from Media (or uploads); a typed address works too.' },
        { type: 'thumbnail', label: 'Page copy', wide: true,
          help: 'A smaller copy sized for where the image sits, so the page loads fast; the original stays as Full size.' },
        { key: 'data-full-src', attr: true, label: 'Full size', type: 'text', browse: 'image', placeholder: 'Same as Image',
          help: 'The large file that gallery viewers and zoom boxes load; the page itself shows Image.' },
        { key: 'data-caption', attr: true, label: 'Caption', type: 'text', placeholder: 'Alt text',
          help: 'Shown under the image in a gallery viewer.' },
        { key: 'width', label: 'Width', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { key: 'aspect-ratio', label: 'Aspect', type: 'aspect', placeholder: 'Natural' },
        { key: 'object-fit', label: 'Fit', type: 'segmented', options: opt([
          ['cover', 'Cover'], ['contain', 'Contain'], ['fill', 'Stretch'] ]) },
        { key: 'object-position', label: 'Focus', type: 'select', placeholder: 'center', options: opt([
          'top', 'bottom', 'left', 'right', 'center' ]) },
        { type: 'group', label: 'Display' },
        { key: 'image-rendering', label: 'Rendering', type: 'segmented', options: opt([
          ['auto', 'Smooth'], ['pixelated', 'Pixel-exact'], ['crisp-edges', 'Crisp']]),
          help: 'Smooth for photos and paintings; Pixel-exact keeps every source pixel a sharp square (pixel art).' },
        { key: 'max-width', label: 'Resolution', type: 'segmented', options: opt([
          ['100%', 'Fit container'], ['none', 'Full size']]),
          help: 'Full size shows the image at its own pixel size, never scaled down.' },
        { key: 'zoom', label: 'Pixel scale', type: 'range', min: 1, max: 8, step: 1, default: 1,
          help: 'Whole-number enlargement for pixel art: 2 makes every pixel 2x2.' },
        ...SHAPE,
        { key: 'border-color', label: 'Border colour', type: 'color' },
      ],
    });

    // =============================================================
    // Link
    // =============================================================
    registerComponentSettings('link', {
      title: 'Link',
      properties: [
        { key: 'color', label: 'Colour', type: 'color' },
        { key: 'text-decoration-line', label: 'Underline', type: 'segmented', options: opt([
          ['underline', 'Underline'], ['none', 'None'] ]) },
        { key: 'font-weight', label: 'Weight', type: 'range', min: 100, max: 900, step: 100, default: 400 },
        { key: 'background-color', label: 'Background', type: 'color' },
        { key: 'border-radius', label: 'Corner radius', type: 'range', min: 0, max: 200, step: 1, unit: 'px', default: 0 },
        { key: 'padding', label: 'Padding', type: 'spacing' },
      ],
    });

    // =============================================================
    // .fill / .clip-content
    // =============================================================
    registerPresetSchemas(['fill'], {
      title: 'Fill parent',
      description: 'Takes the full width and height of its parent (the parent needs a height, e.g. an aspect box).',
      properties: [
        { key: 'data-fill-mode', attr: true, label: 'Mode', type: 'segmented', default: '', options: opt([
          ['', 'In the flow'], ['overlay', 'Cover the parent']]),
          help: 'Cover the parent lays it over everything else in the parent, edge to edge.' },
        { key: '--fill-fit', label: 'Image fit', type: 'segmented', default: 'cover', options: opt([
          ['cover', 'Fill'], ['contain', 'Whole image']]) },
        { key: '--fill-position', label: 'Focus', type: 'select', placeholder: 'center', options: opt([
          'top', 'bottom', 'left', 'right', 'center' ]) },
      ],
    });
    registerPresetSchemas(['clip-content'], {
      title: 'Clip content',
      description: 'Cuts off whatever overflows the element, following its rounded corners.',
      properties: [],
    });

    // =============================================================
    // .text-nowrap
    // =============================================================
    registerPresetSchemas(['text-nowrap'], {
      title: 'Single line',
      description: 'Keeps the text on one line however narrow the element gets.',
      properties: [
        { key: 'data-text-align', attr: true, label: 'Align', type: 'segmented', default: '', options: opt([
          ['', 'Inherit'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right'] ]) },
        { key: 'data-text-overflow', attr: true, label: 'Overflow', type: 'segmented', default: '', options: opt([
          ['', 'Show'], ['clip', 'Clip'], ['ellipsis', 'Ellipsis'] ]) },
      ],
    });

    // =============================================================
    // .text-wrap
    // =============================================================
    registerPresetSchemas(['text-wrap'], {
      title: 'Wrap text',
      description: 'Wraps onto more lines where its own style keeps it on one (a title, a label); a word too long for the line breaks.',
      properties: [
        { key: 'data-text-align', attr: true, label: 'Align', type: 'segmented', default: '', options: opt([
          ['', 'Inherit'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify'] ]),
          help: 'Any choice also has it take the width it has (beside its neighbours in a row), and places the text in that width.' },
        { key: 'data-text-lines', attr: true, label: 'Lines', type: 'segmented', default: '', options: opt([
          ['', 'Normal'], ['balance', 'Balanced'], ['pretty', 'No lone word'] ]),
          help: 'Balanced: lines of about equal length (titles). No lone word: the last line keeps more than one word (paragraphs).' },
      ],
    });
    registerMutexGroup(['text-wrap', 'text-nowrap']);

    // =============================================================
    // .no-select
    // =============================================================
    registerPresetSchemas(['no-select'], {
      title: 'No select',
      description: 'A drag selecting the text around it passes over it, and a click, double-click or long press never selects it. Links, buttons and fields in it still work. On the published page and in preview; text stays editable here.',
      properties: [],
    });

    // =============================================================
    // Footer
    // =============================================================
    registerComponentSettings('site-footer', {
      title: 'Footer',
      properties: [
        { type: 'group', label: 'Colours' },
        { key: '--footer-bg', label: 'Background', type: 'color' },
        { key: '--footer-fg', label: 'Text', type: 'color' },
        { key: '--footer-link', label: 'Links', type: 'color' },
        { key: '--footer-link-hover', label: 'Links (hover)', type: 'color' },
        { key: '--footer-border', label: 'Top rule', type: 'color', default: '#222222' },
        { type: 'group', label: 'Layout' },
        { key: '--footer-direction', label: 'Arrange', type: 'segmented', default: 'column', options: opt([
          ['column', 'Stacked'], ['row', 'In a row'] ]) },
        { key: '--footer-justify', label: 'Spread', type: 'select', placeholder: 'Centre', options: opt([
          ['flex-start', 'Start'], ['center', 'Centre'], ['flex-end', 'End'], ['space-between', 'Space between'] ]) },
        { key: '--footer-align', label: 'Align', type: 'segmented', default: 'center', options: opt([
          ['flex-start', 'Start'], ['center', 'Centre'], ['flex-end', 'End'] ]) },
        { key: '--footer-text-align', label: 'Text align', type: 'segmented', default: 'center', options: opt([
          ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'] ]) },
        { key: '--footer-gap', label: 'Gap', type: 'range', min: 0, max: 64, step: 2, unit: 'px', default: 12 },
        { key: '--footer-link-gap', label: 'Link gap', type: 'range', min: 0, max: 64, step: 2, unit: 'px', default: 16 },
        { type: 'group', label: 'Box' },
        { key: '--footer-py', label: 'Padding Y', type: 'range', min: 0, max: 120, step: 2, unit: 'px', default: 32 },
        { key: '--footer-px', label: 'Padding X', type: 'range', min: 0, max: 120, step: 2, unit: 'px', default: 20 },
        { key: '--footer-border-width', label: 'Top rule width', type: 'range', min: 0, max: 6, step: 1, unit: 'px', default: 1 },
        { key: '--footer-size', label: 'Text size', type: 'range', min: 0.6, max: 1.4, step: 0.02, unit: 'rem', default: 0.85 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'site-footer',
      name: 'Footer',
      label: 'Footer',
      category: 'Basic',
      media: icons.footer,
      tagName: 'footer',
      classes: ['site-footer'],
      droppable: true,
      defaultComponents:
        '<nav class="site-footer-links"><a href="/">Home</a><a href="#">About</a><a href="#">Contact</a></nav>' +
        '<p>© 2026 Your name</p>',
      traits: [],
    });
  },
});
