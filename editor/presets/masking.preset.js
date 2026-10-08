// Masks: four SVG shape masks sharing one schema (--mask-scale,
// --mask-pos-x, --mask-pos-y), and .mask-custom, which clips to any
// image's alpha channel. A new shape is a CSS rule plus its class in
// SHAPE_MASK_CLASSES. .mask-alpha is a CSS alias of .mask-custom.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-masking',
  plugin: function (editor) {
    const { registerSimpleBlock, registerDependency, registerPresetSchemas,
            registerMutexGroup, icons } = window.PresetRegistry;

    registerDependency('css', '/assets/css/masking.css');
    registerDependency('css', '/assets/css/ui-presets.css');

    // One mask per element: two mask-images would layer, not compose.
    registerMutexGroup([
      'mask-circle', 'mask-hexagon', 'mask-star', 'mask-blob', 'mask-custom',
    ]);

    // ---- Shape masks: one schema for every shape --------------------------
    const SHAPE_MASK_SCHEMA = {
      title: 'Shape mask',
      properties: [
        { key: '--mask-scale', label: 'Scale', type: 'range',
          min: 0.1, max: 1.5, step: 0.01, default: 1 },
        { key: '--mask-pos-x', label: 'Position X', type: 'range',
          min: 0, max: 100, step: 0.5, unit: '%', default: 50 },
        { key: '--mask-pos-y', label: 'Position Y', type: 'range',
          min: 0, max: 100, step: 0.5, unit: '%', default: 50 },
      ],
    };

    const SHAPE_MASK_CLASSES = [
      'mask-circle', 'mask-hexagon', 'mask-star', 'mask-blob',
    ];

    registerPresetSchemas(SHAPE_MASK_CLASSES, SHAPE_MASK_SCHEMA);

    // ---- Image mask: a URL with a fit mode and --mask-position --------------
    const MASK_CUSTOM_SCHEMA = {
      title: 'Alpha / image mask',
      properties: [
        { key: '--mask-url', label: 'Mask image', type: 'text',
          browse: true,
          placeholder: '/assets/images/mask.png',
          default: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 38l32-3z' fill='%23fff'/%3E%3C/svg%3E")`,
          unwrap: (v) => String(v).replace(/^url\(['"]?/, '').replace(/['"]?\)$/, ''),
          wrap:   (v) => v ? `url('${v}')` : 'none' },
        { key: '--mask-size', label: 'Fit', type: 'select',
          placeholder: 'contain',
          options: [
            { id: 'contain',   name: 'Contain' },
            { id: 'cover',     name: 'Cover' },
            { id: 'auto',      name: 'Auto' },
            { id: '100% 100%', name: 'Stretch' },
          ] },
        { key: '--mask-position', label: 'Position', type: 'select',
          placeholder: 'center',
          options: [
            { id: 'center',       name: 'Center' },
            { id: 'top',          name: 'Top' },
            { id: 'bottom',       name: 'Bottom' },
            { id: 'left',         name: 'Left' },
            { id: 'right',        name: 'Right' },
            { id: 'left top',     name: 'Top left' },
            { id: 'right top',    name: 'Top right' },
            { id: 'left bottom',  name: 'Bottom left' },
            { id: 'right bottom', name: 'Bottom right' },
          ] },
      ],
    };

    // Also under .mask-alpha, its CSS alias.
    registerPresetSchemas(['mask-custom', 'mask-alpha'], MASK_CUSTOM_SCHEMA);

    // ---- Blocks ----------------------------------------------------------
    // Shape blocks carry no inline --mask-* values, which would shadow the
    // settings. 280x280 so the circle touches each edge at scale 1.

    const SHAPE_BLOCKS = [
      { id: 'mask-circle',  label: 'Mask: Circle'  },
      { id: 'mask-hexagon', label: 'Mask: Hexagon' },
      { id: 'mask-star',    label: 'Mask: Star'    },
      { id: 'mask-blob',    label: 'Mask: Blob'    },
    ];

    SHAPE_BLOCKS.forEach(({ id, label }) => {
      registerSimpleBlock(editor, {
        id,
        label,
        category: 'Masking',
        media: icons.image,
        html: `<img src="" alt="" class="${id}" style="width:280px; height:280px; object-fit:cover; background:var(--surface-2, #333);">`,
      });
    });

    // A built-in SVG circle mask, so the block works when dropped.
    registerSimpleBlock(editor, {
      id: 'mask-custom-image',
      label: 'Mask: Custom Image (alpha)',
      category: 'Masking',
      media: icons.image,
      html: `<div class="mask-custom" style="width:320px; height:320px; background:var(--accent, #4caf50); --mask-url:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='white'/%3E%3C/svg%3E&quot;); --mask-size:contain; --mask-position:center;"></div>`,
    });

    // The alpha mask on a gradient panel.
    registerSimpleBlock(editor, {
      id: 'mask-custom-gradient-panel',
      label: 'Mask: Gradient Panel',
      category: 'Masking',
      media: icons.layers,
      html: `
        <div class="mask-custom bg-gradient-linear"
             style="--mask-url:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 38l32-3z' fill='%23fff'/%3E%3C/svg%3E&quot;);
                    --mask-size:contain;
                    --mask-position:center;
                    width:300px; height:300px; color:#fff; padding:20px;">
          <h3>Masked panel</h3>
          <p>Clipped to the mask's alpha outline.</p>
        </div>
      `,
    });
  },
});