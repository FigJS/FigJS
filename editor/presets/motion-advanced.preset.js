// Reveal on scroll, motion along a path, and overlapping layers
// (motion.js, motion.css). Reveals show while editing (canvas.js);
// Replay and Preview set .fig-reveal-live so they run as on the site.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-motion-advanced',
  plugin: function (editor) {
  const { registerSimpleBlock, registerDependency, registerMutexGroup, icons } =
    window.PresetRegistry;

  // One reveal variant per element.
  registerMutexGroup([
    'reveal-fade', 'reveal-slide-up', 'reveal-slide-left', 'reveal-slide-right', 'reveal-zoom',
  ]);

  registerDependency('css', '/assets/css/motion.css');
  registerDependency('js', '/assets/js/motion.js');

  const REVEALS = ['reveal-fade', 'reveal-slide-up', 'reveal-slide-left', 'reveal-slide-right', 'reveal-zoom'];
  window.PresetRegistry.registerPresetSchemas(REVEALS, {
    title: 'Reveal on scroll',
    description: 'Hidden until it scrolls up to its reveal line. Replay (toolbar) previews it in the canvas.',
    properties: [
      { key: '--reveal-line', label: 'Reveals at', type: 'range', min: 0, max: 90, step: 5, unit: '%', default: 10,
        help: 'Height above the bottom of the screen the element must reach (0: as soon as it appears, 50: the middle).' },
      { key: '--reveal-duration', label: 'Duration', type: 'range', min: 0.1, max: 3, step: 0.05, unit: 's', default: 0.6 },
      { key: '--reveal-delay', label: 'Delay', type: 'range', min: 0, max: 3, step: 0.05, unit: 's', default: 0 },
      { key: '--reveal-distance', label: 'Distance', type: 'range', min: 0, max: 240, step: 4, unit: 'px', default: 40,
        when: (a) => !a.hasClass('reveal-fade') && !a.hasClass('reveal-zoom') },
      { key: '--reveal-zoom-from', label: 'Starts at size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.9,
        when: (a) => a.hasClass('reveal-zoom') },
      { key: 'data-reveal-once', attr: true, label: 'After revealing', type: 'toggle', valueTrue: 'true', valueFalse: '',
        text: 'Stay visible when scrolled away' },
    ],
  });

  // Reveal containers: the class is on the outer element, so any content
  // can go inside.

  registerSimpleBlock(editor, {
    id: 'reveal-fade',
    label: 'Reveal on Scroll (Fade)',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `
      <section class="reveal-fade"
               data-gjs-droppable="true"
               data-gjs-selectable="true"
               style="padding:48px 24px; text-align:center;">
        <h2>Fades in as you scroll to it</h2>
        <p>Drop any content inside this container: the whole thing reveals together.</p>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'reveal-slide-up',
    label: 'Reveal on Scroll (Slide Up)',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `
      <section class="reveal-slide-up"
               data-gjs-droppable="true"
               data-gjs-selectable="true"
               style="padding:48px 24px; text-align:center;">
        <h2>Slides up into place</h2>
        <p>Container-level reveal. Replace the content freely.</p>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'reveal-slide-left',
    label: 'Reveal on Scroll (Slide from Right)',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `
      <section class="reveal-slide-left"
               data-gjs-droppable="true"
               data-gjs-selectable="true"
               style="padding:48px 24px; text-align:center;">
        <h2>Slides in from the right</h2>
        <p>Container-level reveal. Replace the content freely.</p>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'reveal-slide-right',
    label: 'Reveal on Scroll (Slide from Left)',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `
      <section class="reveal-slide-right"
               data-gjs-droppable="true"
               data-gjs-selectable="true"
               style="padding:48px 24px; text-align:center;">
        <h2>Slides in from the left</h2>
        <p>Container-level reveal. Replace the content freely.</p>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'reveal-zoom',
    label: 'Reveal on Scroll (Zoom)',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `
      <section class="reveal-zoom"
               data-gjs-droppable="true"
               data-gjs-selectable="true"
               style="padding:48px 24px; text-align:center;">
        <h2>Zooms into place</h2>
        <p>Container-level reveal. Replace the content freely.</p>
      </section>
    `,
  });

  // ---- Path / spline ----------------------------------------------

  registerSimpleBlock(editor, {
    id: 'path-motion-demo',
    label: 'Path / Spline Motion',
    category: 'Motion Presets',
    media: icons.path,
    html: `
      <div style="position:relative; height:160px;">
        <div class="motion-path-demo" style="width:22px; height:22px; border-radius:50%; background:var(--fg, #fff);"></div>
      </div>
    `,
  });

  // ---- Overlap / z-stack ------------------------------------------

  registerSimpleBlock(editor, {
    id: 'overlap-container',
    label: 'Overlapping Elements',
    category: 'Layout',
    media: icons.layers,
    html: `
      <div style="position:relative; height:220px;">
        <div class="card layer-back" style="position:absolute; top:0; left:0; width:70%;">
          <h3>Back layer</h3><p>Edit this text.</p>
        </div>
        <div class="card layer-front" style="position:absolute; top:40px; left:20%; width:70%;">
          <h3>Front layer</h3><p>Overlaps the one behind it.</p>
        </div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'sticky-section',
    label: 'Sticky Pinned Section',
    category: 'Layout',
    media: icons.sticky,
    html: `
      <div class="sticky-pin" style="background:var(--surface, #161616); padding:24px; border-radius:6px;">
        <h2>Stays in place while the next section scrolls over it</h2>
      </div>
    `,
  });
  },
});