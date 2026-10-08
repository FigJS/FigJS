// Motion blocks composed from presets.css / motion.css classes.
window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-motion-blocks',
  plugin: function (editor) {
  const { registerSimpleBlock, registerDependency, registerPresetSchemas,
          registerMutexGroup, icons } = window.PresetRegistry;

  registerMutexGroup(['anim-pulse', 'anim-float', 'anim-spin', 'anim-blink']);
  registerMutexGroup(['anim-fade-in', 'anim-slide-up', 'anim-slide-down', 'anim-slide-left', 'anim-slide-right', 'anim-zoom-in']);
  registerDependency('css', '/assets/css/motion.css');

  registerPresetSchemas(['anim-pulse'], {
    title: 'Pulse',
    properties: [
      { key: '--anim-duration-pulse', label: 'Duration', type: 'range', min: 0.1, max: 6, step: 0.05, unit: 's', default: 2 },
      { key: '--anim-pulse-scale',    label: 'Peak scale', type: 'range', min: 1, max: 1.5, step: 0.01, default: 1.04 },
    ],
  });
  registerPresetSchemas(['anim-float'], {
    title: 'Float',
    properties: [
      { key: '--anim-duration-float',  label: 'Duration', type: 'range', min: 0.1, max: 8, step: 0.05, unit: 's', default: 3 },
      { key: '--anim-float-distance',  label: 'Distance', type: 'range', min: 0, max: 60, step: 1, unit: 'px', default: 8 },
    ],
  });
  registerPresetSchemas(['anim-spin'], {
    title: 'Spin',
    properties: [
      { key: '--anim-duration-spin', label: 'Duration', type: 'range', min: 0.5, max: 20, step: 0.1, unit: 's', default: 6 },
    ],
  });
  registerPresetSchemas(['anim-blink'], {
    title: 'Blink',
    description: 'Switches off and on like the old <blink>, or fades. Still for visitors who ask for reduced motion.',
    properties: [
      { key: 'data-blink-trigger', attr: true, label: 'Blinks', type: 'segmented', default: '', options: [
        { id: '', name: 'Always' }, { id: 'hover', name: 'On hover' }],
        help: 'On hover: while the pointer is over it, or over the hover stage it sits in.' },
      { key: 'data-blink-style', attr: true, label: 'Style', type: 'segmented', default: '', options: [
        { id: '', name: 'Hard' }, { id: 'smooth', name: 'Smooth' }] },
      { key: '--anim-duration-blink', label: 'Each blink', type: 'range', min: 0.4, max: 4, step: 0.05, unit: 's', default: 1,
        help: 'One off-and-on. No faster than 0.4s: quicker flashing can trigger seizures.' },
      { key: '--blink-low', label: 'Dims to', type: 'range', min: 0, max: 1, step: 0.05, format: 'percent', default: 0,
        help: '0%: gone, as <blink> was; higher keeps it faintly visible.' },
    ],
  });

  registerSimpleBlock(editor, {
    id: 'motion-card',
    label: 'Hover Card',
    category: 'Motion Presets',
    media: icons.card,
    html: `
      <div class="card hover-lift">
        <h3>Hover Card</h3>
        <p>This card lifts and drops a shadow on hover. Edit this text.</p>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'motion-fade-text',
    label: 'Fade-In Header',
    category: 'Motion Presets',
    media: icons.text,
    html: `<h1 class="anim-fade-in">Animated Entrance Header</h1>`,
  });

  registerSimpleBlock(editor, {
    id: 'motion-pulse-btn',
    label: 'Pulse Button',
    category: 'Motion Presets',
    media: icons.pulse,
    html: `<a href="#" class="btn btn-primary anim-pulse">Click Me</a>`,
  });

  registerSimpleBlock(editor, {
    id: 'motion-blink-text',
    label: 'Blink Text',
    category: 'Motion Presets',
    media: icons.text,
    html: `<span class="anim-blink">Blinking text</span>`,
  });
  },
});