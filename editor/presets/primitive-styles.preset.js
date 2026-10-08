// Utility preset tag settings: text clamping, non-collapsing grids,
// scroll reveal (auto-*) and smooth scroll zones. The auto-* tags
// compose on one element and share a Reveal group (trigger, start,
// duration); each adds its own look.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-primitive-styles',
  plugin: function (editor) {
    const { registerPresetSchemas, registerPresetTag } = window.PresetRegistry;

    // ---- Text clamping ---------------------------------------------------
    registerPresetSchemas(['clamp-1', 'clamp-2', 'clamp-3', 'clamp-4', 'clamp-5'], {
      title: 'Clamp lines', description: 'Cuts the text off after N lines with an ellipsis.', properties: [],
    });
    registerPresetSchemas(['contain-content'], {
      title: 'Contain content', description: 'Lets flex/grid children shrink instead of overflowing.', properties: [],
    });
    registerPresetSchemas(['break-all'], {
      title: 'Break long words', description: 'Wraps long URLs and unbroken tokens.', properties: [],
    });

    // ---- Non-collapsing grid ------------------------------------------
    registerPresetSchemas(['grid-no-collapse'], {
      title: 'Grid: keep columns on phone',
      properties: [
        { key: '--grid-phone-cols', label: 'Phone columns', type: 'range', min: 1, max: 4, step: 1, default: 2 },
      ],
    });
    registerPresetSchemas(['grid-2-keep', 'grid-3-keep', 'grid-4-keep'], {
      title: 'Grid: fixed column count',
      properties: [
        { key: '--gap', label: 'Cell gap', type: 'range', min: 0, max: 60, step: 2, unit: 'px', default: 20 },
        { key: '--grid-phone-cols', label: 'Phone columns', type: 'range', min: 1, max: 4, step: 1, default: 2 },
      ],
    });

    // ---- Scroll reveal -------------------------------------------------

    const isView = (a) => a.readAttr('data-reveal-trigger') === 'view';
    const reveal = (title, props, distanceDefault, description) => ({
      title,
      description,
      properties: props.concat([
        { type: 'group', label: 'Reveal' },
        { key: 'data-reveal-trigger', attr: true, label: 'Driven by', type: 'segmented', default: '', rerender: true,
          options: [{ id: '', name: 'Page scroll' }, { id: 'view', name: 'Entering view' }],
          help: 'Entering view follows the nearest scrolling box. Inside a box that hides its overflow, use the Clip content tag on that box instead, or the effect stays still.' },
        { key: '--reveal-start', label: 'Starts after', type: 'range', min: 0, max: 1200, step: 10, unit: 'px',
          default: 0, when: (a) => !isView(a) },
        { key: '--reveal-at', label: 'Completes over', type: 'range', min: 20, max: 1200, step: 10, unit: 'px',
          default: distanceDefault, when: (a) => !isView(a) },
        { key: '--reveal-line', label: 'Starts at', type: 'range', min: 0, max: 90, step: 5, unit: '%',
          default: 40, when: isView,
          help: 'Height above the bottom of the screen where the effect plays (0: as soon as it appears, 50: the middle). Default 40, a little below the middle.' },
        { key: '--reveal-view', label: 'Entry span', type: 'range', min: 10, max: 100, step: 5, unit: '%',
          default: 100, when: isView,
          help: 'How much of the element\'s entry the effect takes.' },
      ]),
    });

    registerPresetSchemas(['auto-bg'], reveal('Reveal: background', [
      { key: '--reveal-bg-from', label: 'At rest', type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },
      { key: '--reveal-bg', label: 'Revealed', type: 'color-alpha', default: 'rgba(20, 20, 20, 0.85)' },
    ], 80, 'Fades a background in as the page scrolls.'));

    registerPresetSchemas(['auto-shadow'], reveal('Reveal: shadow', [
      { key: '--reveal-shadow', label: 'Shadow', type: 'shadow', default: '0 4px 20px rgba(0, 0, 0, 0.35)' },
    ], 80, 'Fades a shadow in as the page scrolls.'));

    registerPresetTag('auto-blur', { group: 'Scroll reveal', description: 'Glass on scroll: blurs what passes behind.' });
    registerPresetSchemas(['auto-blur'], reveal('Reveal: backdrop blur', [
      { key: '--reveal-blur', label: 'Blur', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 10 },
    ], 80, 'Blurs what passes behind the element as the page scrolls (glass on scroll).'));

    registerPresetSchemas(['auto-fade-down', 'auto-fade-up'], reveal('Reveal: fade', [
      { key: '--reveal-shift', label: 'Travel', type: 'range', min: 0, max: 80, step: 1, unit: 'px', default: 8 },
    ], 200, 'Fades and slides the element in.'));

    // ---- Smooth scrolling ------------------------------------------------

    registerPresetTag('smooth-zone', { group: 'Scrolling', description: 'Smooth wheel scrolling while this part is on screen.' });
    registerPresetSchemas(['smooth-zone'], {
      title: 'Smooth scroll zone',
      description: 'While this element is on screen the mouse wheel glides, even when smooth scrolling is off for the page (Page tab, Scrolling); elsewhere it keeps about the browser\'s own pace, easing between the two at the zone\'s edges. Touchpads keep their own scrolling.',
      properties: [
        { key: 'data-zone-when', attr: true, label: 'Active when', type: 'segmented', default: '', options: [
          { id: '', name: 'Any part on screen' }, { id: 'center', name: 'Crossing the middle' }],
          help: 'Crossing the middle: only while it spans the middle of the screen.' },
        { key: '--scroll-glide', label: 'Glide', type: 'range', min: 80, max: 1000, step: 10, unit: 'ms', default: 260,
          help: 'How soft the glide is: higher keeps the page moving longer after each wheel step.' },
      ],
    });

    registerPresetSchemas(['auto-shrink'], reveal('Reveal: shrink', [
      { key: '--sticky-pad-open', label: 'Padding at rest', type: 'range', min: 0, max: 80, step: 2, unit: 'px', default: 24 },
      { key: '--sticky-pad-scrolled', label: 'Padding scrolled', type: 'range', min: 0, max: 80, step: 2, unit: 'px', default: 12 },
    ], 80, 'Tightens vertical padding as the page scrolls.'));
  },
});
