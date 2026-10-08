// Scroll-progress motion: opacity, position, scale, rotation and blur
// interpolated between keyframes as the page scrolls (motion-scrubber.js).
//   data-scrub="1"            scrub-driven element
//   data-scrub-json='[...]'   keyframes { at, opacity, x, y, scale, rotate, blur };
//                             at is 0-1, unset properties hold the nearest value
// Progress comes from the element crossing the viewport (.scrub-standalone)
// or from a pinned sequence (.scrub-pin-wrap > .scrub-pin-stage >
// .scrub-layer), where every layer reads the same progress; staggered
// `at` ranges build a multi-beat sequence. Sticky layouts live in
// sticky-layout.preset.js.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-motion-scrubber',
  plugin: function (editor) {
    const { registerSimpleBlock, registerDependency, icons } = window.PresetRegistry;

    registerDependency('css', '/assets/css/motion-scrubber.css');
    registerDependency('js', '/assets/js/motion-scrubber.js');

    const SCRUB_TRAIT = {
      type: 'text',
      name: 'data-scrub-json',
      label: 'Scrub keyframes (JSON)',
      placeholder: '[{"at":0,"opacity":1},{"at":1,"opacity":0,"y":-60}]',
    };

    // Fades and moves as the element crosses the viewport.
    registerSimpleBlock(editor, {
      id: 'scrub-standalone',
      label: 'Scroll-Scrubbed Element',
      category: 'Motion Presets',
      media: icons.pulse,
      html: `
        <div class="scrub-standalone" data-scrub="1"
             data-scrub-json='[{"at":0,"opacity":0,"y":40},{"at":0.4,"opacity":1,"y":0},{"at":0.85,"opacity":1,"y":0},{"at":1,"opacity":0,"y":-40}]'>
          <h2>Fades and drifts based on scroll position</h2>
          <p>Edit the "Scrub keyframes" field in Settings to change the sequence. "at" is 0-1 progress through the viewport.</p>
        </div>
      `,
    });

    // Pinned multi-beat sequence.
    registerSimpleBlock(editor, {
      id: 'scrub-pin-sequence',
      label: 'Pinned Scroll Sequence',
      category: 'Motion Presets',
      media: icons.layers,
      html: `
        <div class="scrub-pin-wrap" style="height:300vh;">
          <div class="scrub-pin-stage">
            <div class="scrub-layer" data-scrub="1" style="max-width:520px;"
                 data-scrub-json='[{"at":0,"opacity":1,"scale":1},{"at":0.4,"opacity":1,"scale":1.6},{"at":0.5,"opacity":0,"scale":1.8}]'>
              <img src="" alt="" style="width:100%; display:block; border-radius:8px;">
            </div>
            <div class="scrub-layer" data-scrub="1" style="text-align:center;"
                 data-scrub-json='[{"at":0.4,"opacity":0,"y":60},{"at":0.6,"opacity":1,"y":0},{"at":1,"opacity":1,"y":0}]'>
              <h1>Title flies in and overlaps</h1>
            </div>
          </div>
        </div>
      `,
    });

    // Rotation container, continuous or scroll-tied.
    registerSimpleBlock(editor, {
      id: 'rotation-container',
      label: 'Rotation Container',
      category: 'Motion Presets',
      media: icons.pulse,
      html: `
        <div class="rotate-fixed" style="display:inline-block; --rotate-deg:15deg;">
          <div class="card" style="width:160px; height:160px; display:flex; align-items:center; justify-content:center;">
            Rotated box
          </div>
        </div>
      `,
    });

    // The scrub-json trait on any scrub-driven element.
    editor.on('component:selected', (component) => {
      const el = component.getEl && component.getEl();
      const hasScrub = el && (
        el.classList.contains('scrub-standalone') ||
        el.classList.contains('scrub-layer') ||
        el.hasAttribute('data-scrub')
      );
      if (!hasScrub) return;
      const traits = component.get('traits');
      if (!traits || typeof traits.add !== 'function') return;
      const names = new Set(traits.map((t) => (t.get ? t.get('name') : t.name)));
      if (!names.has(SCRUB_TRAIT.name)) traits.add([SCRUB_TRAIT]);
    });
  },
});