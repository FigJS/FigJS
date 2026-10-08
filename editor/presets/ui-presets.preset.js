// Preset tags for backgrounds, effects, transparency, outlines, shadows,
// hover motion, image effects and scale, plus sample blocks. Defaults
// equal the CSS fallbacks in ui-presets.css.
// Effect tags share an Effect group (always / on hover, transition) and
// compose into one filter chain; hover tags share a Hover group.
// .hover-stage makes an element the hover zone for its children: preset
// hover tags handle it in CSS; the Style Manager's Hover state gets a
// companion selector (.hover-stage:hover > #child) and a cancel rule
// (.hover-stage:not(:hover) > #child:hover).
// The noise Texture list is every image in public/assets/noise/.

window.PresetPlugins = window.PresetPlugins || [];


// ---- Hover stage: Style Manager Hover state -------------------------

function installStageHoverRedirect(editor) {
  if (!editor || editor.__shInstalled) return;
  editor.__shInstalled = true;

  const STAGES = ['hover-stage', 'hover-stage--block'];
  const PREFIX = '.hover-stage:hover > ';
  const CANCEL_PREFIX = '.hover-stage:not(:hover) > ';

  const CANCEL_STYLE = {
    transform: 'none !important',
    opacity: '1 !important',
    'box-shadow': 'none !important',
    filter: 'none !important',
    background: 'transparent !important',
    'background-color': 'transparent !important',
    color: 'inherit !important',
    border: 'none !important',
    outline: 'none !important',
    'text-decoration': 'none !important',
    'letter-spacing': 'normal !important',
    visibility: 'visible !important',
    scale: '1 !important',
    rotate: '0deg !important',
    translate: '0 !important',
  };

  function parentIsStage(comp) {
    const p = comp && comp.parent && comp.parent();
    if (!p || !p.getClasses) return false;
    const cls = p.getClasses();
    return STAGES.some((s) => cls.indexOf(s) !== -1);
  }

  function rulesList() {
    try { return editor.Css.getAll().models || []; } catch (e) { return []; }
  }

  let busy = false;

  function process() {
    if (busy) return;
    busy = true;
    try {
      const list = rulesList();
      const needed = new Set();

      for (let i = 0; i < list.length; i++) {
        const rule = list[i];
        if (!rule || rule.get('state') !== 'hover') continue;
        const sa = rule.get('selectorsAdd') || '';
        if (sa.indexOf(CANCEL_PREFIX) === 0) continue;

        const selList = (rule.get('selectors') && rule.get('selectors').models) || [];
        if (!selList.length) continue;

        const bases = [];
        let ok = true;
        for (let j = 0; j < selList.length; j++) {
          const full = selList[j].getFullName ? selList[j].getFullName() : '';
          if (!full || full.indexOf('.hover-stage') !== -1 || /[\s>+~,()]/.test(full)) { ok = false; break; }
          let comps;
          try { comps = editor.getWrapper().find(full); } catch (e) { ok = false; break; }
          if (!comps || !comps.length || !comps.every(parentIsStage)) { ok = false; break; }
          bases.push(full);
        }
        if (!ok || !bases.length) continue;

        if (sa.indexOf(PREFIX) === -1) {
          const companions = bases.map((b) => PREFIX + b).join(', ');
          try { rule.set('selectorsAdd', sa ? sa + ', ' + companions : companions); } catch (e) {}
        }
        bases.forEach((b) => needed.add(b));
      }

      const existing = new Map();
      list.forEach((r) => {
        const rsa = r.get('selectorsAdd') || '';
        if (rsa.indexOf(CANCEL_PREFIX) !== 0) return;
        existing.set(rsa.slice(CANCEL_PREFIX.length).replace(/:hover\s*$/, '').trim(), r);
      });
      for (const [child, r] of existing) {
        if (!needed.has(child)) { try { editor.Css.remove(r); } catch (e) {} existing.delete(child); }
      }
      for (const child of needed) {
        if (existing.has(child)) continue;
        try {
          editor.Css.getAll().add({
            selectors: [], selectorsAdd: CANCEL_PREFIX + child + ':hover', state: '',
            style: Object.assign({}, CANCEL_STYLE),
          });
        } catch (e) {}
      }
    } finally {
      busy = false;
    }
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      // Companion rules follow user edits; they are not edits.
      if (window.FigJS && FigJS.undo) FigJS.undo.untracked(process); else process();
    }, 60);
  }

  editor.onReady(schedule);
  editor.on('update', schedule);
  editor.on('styleable:change', schedule);
}


// ---- Built-in noise fallback ---------------------------------------

const NOISE_BUILTIN =
  'url("data:image/svg+xml;utf8,' +
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' " +
  "baseFrequency='0.9' numOctaves='2'/></filter>" +
  "<rect width='120' height='120' filter='url(%23n)' opacity='0.25'/>" +
  '</svg>")';

window.PresetPlugins.push({
  id: 'preset-ui',
  plugin: function (editor) {
    const {
      registerSimpleBlock, registerPresetSchemas, getPresetSchema,
      registerMutexGroup, registerPresetTag, icons,
    } = window.PresetRegistry;

    registerMutexGroup(['container', 'container-narrow']);
    registerMutexGroup(['grid-auto', 'grid-2', 'grid-3', 'grid-4']);
    registerMutexGroup(['split', 'split-reverse']);
    registerMutexGroup(['stack', 'stack-reverse']);
    registerMutexGroup(['img-render-auto', 'img-render-smooth', 'img-render-pixelated', 'img-render-crisp']);
    registerMutexGroup(['opacity-90', 'opacity-75', 'opacity-50', 'opacity-25']);
    registerMutexGroup(['outline-thin', 'outline-thick', 'outline-dashed']);
    registerMutexGroup(['position-absolute', 'position-fixed', 'position-relative', 'position-sticky']);
    registerMutexGroup(['bg-gradient-linear', 'bg-gradient-radial']);
    registerMutexGroup(['img-outline-thin', 'img-outline-thick']);
    registerMutexGroup(['img-glow', 'img-double-glow']);
    registerMutexGroup(['scale', 'scale-75', 'scale-90', 'scale-110', 'scale-125']);
    registerMutexGroup(['text-small', 'text-large']);
    registerMutexGroup(['glass', 'glass-dark']);

    installStageHoverRedirect(editor);

    // ---- Shared groups ------------------------------------------------

    const FX_UNIVERSAL = [
      { type: 'group', label: 'Effect' },
      { key: 'data-fx-trigger', attr: true, label: 'Apply', type: 'segmented', default: '', options: [
        { id: '', name: 'Always' }, { id: 'hover', name: 'On hover' } ] },
      { key: '--fx-duration', label: 'Transition', type: 'range', min: 0, max: 1.5, step: 0.05, unit: 's', default: 0.25 },
    ];
    const HOVER_UNIVERSAL = [
      { type: 'group', label: 'Hover' },
      { key: '--hover-duration', label: 'Duration', type: 'range', min: 0.05, max: 1.5, step: 0.05, unit: 's', default: 0.25 },
    ];
    const fx = (title, props, description) => ({ title, description, properties: props.concat(FX_UNIVERSAL) });
    // A filter groups what it is on: Layers inside order only among
    // themselves. On each item inside, the element groups nothing; Auto
    // does that when a child has a Layer of its own (ui-presets.css).
    const FX_SCOPE = { key: 'data-fx-scope', attr: true, label: 'Applies to', type: 'segmented', default: '', options: [
      { id: '', name: 'Auto' }, { id: 'element', name: 'The element' }, { id: 'items', name: 'Each item inside' } ],
      help: 'The element: one effect over all it holds, which also groups their Layers (they cannot rise above things outside it). Each item inside: the effect on each child, whose Layers stay their own. Auto: each item inside when a child has a Layer other than 0, else the element.' };
    const filterFx = (title, props, description) => ({ title, description, properties: props.concat(FX_UNIVERSAL, [FX_SCOPE]) });
    const hover = (title, props, description) => ({ title, description, properties: props.concat(HOVER_UNIVERSAL) });

    // ---- Image rendering ----------------------------------------------

    [
      ['img-render-auto', 'Rendering: browser default', 'The browser\'s default scaling.'],
      ['img-render-smooth', 'Rendering: smooth', 'High-quality smooth scaling, for photos and paintings.'],
      ['img-render-pixelated', 'Rendering: pixel-exact', 'Every source pixel stays a sharp square at any size (pixel art).'],
      ['img-render-crisp', 'Rendering: crisp edges', 'Sharp scaling without smoothing, for line art and icons.'],
    ].forEach(([cls, title, description]) => registerPresetSchemas([cls], { title, description, properties: [] }));

    // ---- Gradients ----------------------------------------------------

    const GRADIENT_THEMES = [
      ['Sunset', '#ff8a65', '#d84315'], ['Ocean', '#2196f3', '#0d47a1'], ['Mint', '#a7ffeb', '#00897b'],
      ['Ink', '#141e30', '#243b55'], ['Warm', '#f6d365', '#fda085'], ['Sunrise', '#ffd54f', '#ff7043'],
      ['Twilight', '#4a148c', '#0d47a1'], ['Forest', '#43a047', '#1b5e20'], ['Rose', '#f48fb1', '#c2185b'],
      ['Sky', '#b3e5fc', '#0288d1'], ['Charcoal', '#424242', '#000000'], ['Cream', '#fff8e1', '#ffcc80'],
    ].map(([name, from, to]) => ({ name, values: { '--grad-from': from, '--grad-to': to } }));

    const GRADIENT_COMMON = [
      { key: '_theme', label: 'Theme', type: 'preset', options: GRADIENT_THEMES },
      { key: '--grad-from', label: 'From', type: 'color', default: '#ff8a65' },
      { key: '--grad-from-alpha', label: 'From opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 1, format: 'percent' },
      { key: '--grad-from-stop', label: 'From stop', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 0 },
      { key: '--grad-to', label: 'To', type: 'color', default: '#d84315' },
      { key: '--grad-to-alpha', label: 'To opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 1, format: 'percent' },
      { key: '--grad-to-stop', label: 'To stop', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 100 },
    ];
    registerPresetSchemas(['bg-gradient-linear'], {
      title: 'Linear gradient',
      properties: [
        { key: '--grad-angle', label: 'Angle', type: 'range', min: 0, max: 360, step: 1, unit: 'deg', default: 135 },
      ].concat(GRADIENT_COMMON),
    });
    registerPresetSchemas(['bg-gradient-radial'], {
      title: 'Radial gradient',
      properties: [
        { key: '--grad-shape', label: 'Shape', type: 'segmented', default: 'ellipse', options: [
          { id: 'ellipse', name: 'Ellipse' }, { id: 'circle', name: 'Circle' } ] },
        { key: '--grad-position', label: 'Centre', type: 'select', placeholder: 'center', options:
          ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right']
            .map((p) => ({ id: p, name: p })) },
        { key: '--grad-size', label: 'Reach', type: 'select', placeholder: 'farthest-corner', options: [
          { id: 'closest-side', name: 'Closest side' }, { id: 'farthest-side', name: 'Farthest side' },
          { id: 'closest-corner', name: 'Closest corner' }, { id: 'farthest-corner', name: 'Farthest corner' } ] },
      ].concat(GRADIENT_COMMON),
    });

    // ---- Noise overlay -------------------------------------------------

    registerPresetSchemas(['bg-noise'], {
      title: 'Grain',
      properties: [
        { key: '--noise-src', label: 'Texture', type: 'preset', options: [
          { name: 'Built-in (fractal noise)', values: { '--noise-src': NOISE_BUILTIN, '--noise-size': '120px' } },
        ] },
        { key: '--noise-size', label: 'Grain size', type: 'range', min: 24, max: 256, step: 4, default: 128, unit: 'px' },
        { key: '--noise-strength', label: 'Strength', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, format: 'percent' },
        { key: '--noise-blend', label: 'Blend', type: 'select', placeholder: 'overlay', options:
          ['overlay', 'multiply', 'screen', 'soft-light', 'hard-light'].map((b) => ({ id: b, name: b })) },
        { key: '--noise-z', label: 'Layer', type: 'segmented', default: '0', options: [
          { id: '0', name: 'Over content' }, { id: '-1', name: 'Under content' } ] },
        { key: '--noise-isolation', label: 'Contain grain', type: 'toggle', valueTrue: 'isolate', valueFalse: '',
          text: 'Blend only within this element',
          help: 'Stops the grain blending with what is behind a translucent element. Glass inside it then cannot blur.' },
      ],
    });

    fetch('/api/textures', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.items)) return;
        const srcProp = getPresetSchema('bg-noise').properties.find((p) => p.key === '--noise-src');
        data.items.forEach((f) => {
          const values = { '--noise-src': 'url("' + f.url + '")' };
          if (f.size) values['--noise-size'] = f.size + 'px';
          srcProp.options.push({ name: f.name, values });
        });
      })
      .catch(() => {});

    // ---- Glass ---------------------------------------------------------

    const GLASS_PROPS = (tint, border) => [
      { key: '--glass-blur', label: 'Blur', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 12 },
      { key: '--glass-saturate', label: 'Saturation', type: 'range', min: 0, max: 3, step: 0.05, default: 1.2 },
      { key: '--glass-brightness', label: 'Brightness', type: 'range', min: 0.3, max: 2, step: 0.05, default: 1 },
      { key: '--glass-tint', label: 'Tint', type: 'color-alpha', default: tint },
      { key: '--glass-border', label: 'Border', type: 'color-alpha', default: border },
      { key: '--glass-border-width', label: 'Border width', type: 'range', min: 0, max: 6, step: 1, unit: 'px', default: 1 },
      // What it blurs within, and what moves behind it (universal-traits.preset.js).
      { label: 'Check', wide: true, help: 'What this glass blurs within, and what moves behind it.',
        build: (ctx) => (FigJS.stackingCheck && ctx.adapter.component
          ? FigJS.stackingCheck.glassField(ctx.adapter.component)
          : { el: document.createElement('div'), refresh() {} }) },
    ];
    registerPresetSchemas(['glass'], fx('Glass (light)',
      GLASS_PROPS('rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.12)'),
      'Frosted panel: blurs whatever is painted behind it.'));
    registerPresetSchemas(['glass-dark'], fx('Glass (dark)',
      GLASS_PROPS('rgba(0, 0, 0, 0.4)', 'rgba(255, 255, 255, 0.08)'),
      'Frosted panel with a dark tint.'));

    // ---- Filter FX -------------------------------------------------------

    registerPresetSchemas(['blur-custom'], filterFx('Blur',
      [{ key: '--blur-amount', label: 'Amount', type: 'range', min: 0, max: 40, step: 0.5, unit: 'px', default: 2 }]));
    registerPresetSchemas(['grayscale'], filterFx('Grayscale',
      [{ key: '--grayscale-amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.05, default: 1, format: 'percent' }]));
    registerPresetSchemas(['saturate'], filterFx('Saturation',
      [{ key: '--saturate-amount', label: 'Amount', type: 'range', min: 0, max: 3, step: 0.05, default: 1.5 }]));
    registerPresetTag('fx', { group: 'Effects', description: 'Colour adjustments: brightness, contrast, hue, sepia, invert.' });
    registerPresetSchemas(['fx'], filterFx('Colour adjust', [
      { key: '--fx-brightness', label: 'Brightness', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
      { key: '--fx-contrast', label: 'Contrast', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
      { key: '--fx-hue', label: 'Hue shift', type: 'range', min: -180, max: 180, step: 1, unit: 'deg', default: 0 },
      { key: '--fx-sepia', label: 'Sepia', type: 'range', min: 0, max: 1, step: 0.05, default: 0, format: 'percent' },
      { key: '--fx-invert', label: 'Invert', type: 'range', min: 0, max: 1, step: 0.05, default: 0, format: 'percent' },
    ]));

    registerPresetSchemas(['img-outline-thin'], filterFx('Image outline', [
      { key: '--img-outline-size', label: 'Ring size', type: 'range', min: 0.5, max: 20, step: 0.5, unit: 'px', default: 1.5 },
      { key: '--img-outline-color', label: 'Ring colour', type: 'color-alpha', default: '#000000' },
    ], 'Follows the image\'s transparency, not its box.'));
    registerPresetSchemas(['img-outline-thick'], filterFx('Image outline (thick)', [
      { key: '--img-outline-size', label: 'Ring size', type: 'range', min: 0.5, max: 20, step: 0.5, unit: 'px', default: 3 },
      { key: '--img-outline-color', label: 'Ring colour', type: 'color-alpha', default: '#000000' },
    ], 'Follows the image\'s transparency, not its box.'));
    registerPresetSchemas(['img-glow', 'img-double-glow'], filterFx('Image glow', [
      { key: '--img-glow-color', label: 'Glow colour', type: 'color-alpha', default: '#007acc' },
      { key: '--img-glow-blur', label: 'Glow size', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 12 },
    ]));
    registerPresetSchemas(['img-shadow'], filterFx('Image drop shadow', [
      { key: '--img-shadow-color', label: 'Colour', type: 'color-alpha', default: 'rgba(0, 0, 0, 0.45)' },
      { key: '--img-shadow-x', label: 'Offset X', type: 'range', min: -40, max: 40, step: 1, unit: 'px', default: 0 },
      { key: '--img-shadow-y', label: 'Offset Y', type: 'range', min: -40, max: 40, step: 1, unit: 'px', default: 8 },
      { key: '--img-shadow-blur', label: 'Blur', type: 'range', min: 0, max: 60, step: 1, unit: 'px', default: 16 },
    ], 'Follows the image\'s transparency, not its box.'));

    // ---- Opacity (composable) ------------------------------------------

    [['opacity-90', 0.90], ['opacity-75', 0.75], ['opacity-50', 0.50], ['opacity-25', 0.25]]
      .forEach(([cls, mult]) => {
        registerPresetSchemas([cls], {
          title: `Opacity ${Math.round(mult * 100)}%`,
          modifier: { op: 'multiply', value: mult, format: 'percent', label: 'Tag multiplies by' },
          properties: [
            { key: '--el-opacity', label: 'Base opacity', type: 'range', min: 0.05, max: 1, step: 0.05, default: 1, format: 'percent' },
          ].concat(FX_UNIVERSAL),
        });
      });

    // ---- Shadow / scale ------------------------------------------------

    registerPresetSchemas(['shadow-custom'], {
      title: 'Shadow',
      properties: [
        { key: '--shadow-x', label: 'X', type: 'range', min: -40, max: 40, step: 1, unit: 'px', default: 0 },
        { key: '--shadow-y', label: 'Y', type: 'range', min: -40, max: 40, step: 1, unit: 'px', default: 6 },
        { key: '--shadow-blur', label: 'Blur', type: 'range', min: 0, max: 80, step: 1, unit: 'px', default: 18 },
        { key: '--shadow-spread', label: 'Spread', type: 'range', min: -20, max: 40, step: 1, unit: 'px', default: 0 },
        { key: '--shadow-color', label: 'Colour', type: 'color', default: '#000000' },
        { key: '--shadow-alpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.25, format: 'percent' },
      ],
    });

    registerPresetSchemas(['scale'], {
      title: 'Element scale',
      properties: [
        { key: '--el-scale', label: 'Base scale', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1, format: 'percent' },
      ],
    });
    [['scale-75', 0.75], ['scale-90', 0.90], ['scale-110', 1.10], ['scale-125', 1.25]].forEach(([cls, def]) => {
      registerPresetSchemas([cls], {
        title: `Scale ${Math.round(def * 100)}%`,
        modifier: { op: 'multiply', value: def, format: 'percent', label: 'Tag multiplies by' },
        properties: [
          { key: '--scale-mul', label: 'Multiplier', type: 'range', min: 0.25, max: 3, step: 0.01, default: def, format: 'percent' },
          { key: '--el-scale', label: 'Base scale', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1, format: 'percent' },
        ],
      });
    });

    // ---- Hover motion (each tag its own settings) -----------------------

    registerPresetSchemas(['hover-grow'], hover('Hover: grow', [
      { key: '--hover-scale', label: 'Scale', type: 'range', min: 0.8, max: 1.5, step: 0.01, default: 1.04 },
    ]));
    registerPresetSchemas(['hover-zoom'], hover('Hover: zoom image', [
      { key: '--hover-zoom', label: 'Zoom', type: 'range', min: 1, max: 2, step: 0.01, default: 1.15 },
    ]));
    registerPresetSchemas(['hover-lift'], hover('Hover: lift', [
      { key: '--hover-shift-y', label: 'Rise', type: 'range', min: -40, max: 40, step: 1, unit: 'px', default: -6 },
      { key: '--hover-shadow-color', label: 'Shadow colour', type: 'color', default: '#000000' },
      { key: '--hover-shadow-alpha', label: 'Shadow opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, format: 'percent' },
      { key: '--hover-shadow-y', label: 'Shadow depth', type: 'range', min: 0, max: 60, step: 1, unit: 'px', default: 18 },
    ]));
    registerPresetSchemas(['hover-tilt'], hover('Hover: tilt', [
      { key: '--hover-tilt-deg', label: 'Tilt', type: 'range', min: -30, max: 30, step: 0.5, unit: 'deg', default: -1.5 },
    ]));
    registerPresetSchemas(['hover-shift'], hover('Hover: shift', [
      { key: '--hover-shift-x', label: 'Shift', type: 'range', min: -60, max: 60, step: 1, unit: 'px', default: 6 },
    ]));
    registerPresetSchemas(['hover-fade'], hover('Hover: fade', [
      { key: '--hover-opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7, format: 'percent' },
    ]));
    registerPresetSchemas(['hover-glow'], hover('Hover: glow', [
      { key: '--hover-glow-color', label: 'Glow colour', type: 'color', default: '#007acc' },
      { key: '--hover-glow-alpha', label: 'Glow opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.65, format: 'percent' },
      { key: '--hover-glow-blur', label: 'Glow size', type: 'range', min: 0, max: 80, step: 1, unit: 'px', default: 24 },
    ]));
    registerPresetSchemas(['hover-underline'], hover('Hover: underline', [
      { key: '--hover-underline-height', label: 'Thickness', type: 'range', min: 1, max: 8, step: 1, unit: 'px', default: 2 },
    ]));
    registerPresetTag('near-cursor', { group: 'Hover effects', description: 'Fades in as the cursor comes near.' });
    registerPresetSchemas(['near-cursor'], {
      title: 'Near cursor',
      description: 'Opacity, scale and blur follow how far the cursor is. Fully shown while editing when motion is paused (Play shows the effect); touch screens show it fully.',
      properties: [
        { key: '--near-range', label: 'Reach', type: 'range', min: 40, max: 1600, step: 10, unit: 'px', default: 320,
          help: 'How far from the element the cursor starts to count.' },
        { key: 'data-near-from', attr: true, label: 'Measured from', type: 'segmented', default: '', options: [
          { id: '', name: 'Edges' }, { id: 'center', name: 'Center' }] },
        { key: 'data-near-curve', attr: true, label: 'Curve', type: 'segmented', default: '', options: [
          { id: '', name: 'Even' }, { id: 'smooth', name: 'Smooth' }, { id: 'early', name: 'Early' }, { id: 'late', name: 'Late' }],
          help: 'Early: comes in quickly as the cursor approaches. Late: only right next to it.' },
        { type: 'group', label: 'Cursor near' },
        { key: '--near-opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 1, format: 'percent' },
        { type: 'group', label: 'Cursor far' },
        { key: '--near-far-opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0, format: 'percent' },
        { key: '--near-far-scale', label: 'Scale', type: 'range', min: 0.5, max: 1.5, step: 0.01, default: 1, format: 'percent' },
        { key: '--near-far-blur', label: 'Blur', type: 'range', min: 0, max: 20, step: 0.5, unit: 'px', default: 0 },
        { type: 'group', label: 'Behaviour' },
        { key: '--near-response', label: 'Response', type: 'range', min: 0, max: 1, step: 0.05, unit: 's', default: 0.15,
          help: 'Smooths the change. 0 follows the cursor exactly.' },
        { key: 'data-near-touch', attr: true, label: 'Without a mouse', type: 'segmented', default: '', options: [
          { id: '', name: 'Show fully' }, { id: 'far', name: 'Stay far' }] },
      ],
    });

    registerPresetSchemas(['hover-stage'], {
      title: 'Hover stage',
      description: 'Children animate on this element\'s hover, so a moving child cannot slip out from under the cursor. The element keeps its own size and layout.',
      properties: [],
    });
    registerPresetSchemas(['hover-stage--block'], {
      title: 'Hover stage',
      description: 'The same as .hover-stage; the element keeps its own size and layout.',
      properties: [],
    });

    // ---- Entrance animations -------------------------------------------

    registerPresetSchemas(['anim-fade-in'], {
      title: 'Entrance: fade',
      properties: [
        { key: '--anim-duration-fade', label: 'Duration', type: 'range', min: 0.1, max: 4, step: 0.05, unit: 's', default: 0.6 },
        { key: '--anim-delay', label: 'Delay', type: 'range', min: 0, max: 3, step: 0.05, unit: 's', default: 0 },
      ],
    });
    registerPresetSchemas(['anim-slide-up', 'anim-slide-down', 'anim-slide-left', 'anim-slide-right'], {
      title: 'Entrance: slide',
      properties: [
        { key: '--anim-duration-slide', label: 'Duration', type: 'range', min: 0.1, max: 4, step: 0.05, unit: 's', default: 0.6 },
        { key: '--anim-delay', label: 'Delay', type: 'range', min: 0, max: 3, step: 0.05, unit: 's', default: 0 },
        { key: '--anim-slide-distance', label: 'Distance', type: 'range', min: 0, max: 200, step: 2, unit: 'px', default: 24 },
      ],
    });
    registerPresetSchemas(['anim-zoom-in'], {
      title: 'Entrance: zoom',
      properties: [
        { key: '--anim-duration-zoom', label: 'Duration', type: 'range', min: 0.1, max: 4, step: 0.05, unit: 's', default: 0.5 },
        { key: '--anim-delay', label: 'Delay', type: 'range', min: 0, max: 3, step: 0.05, unit: 's', default: 0 },
        { key: '--anim-zoom-from', label: 'Start scale', type: 'range', min: 0.5, max: 1, step: 0.01, default: 0.92 },
      ],
    });

    // ---- Blocks ----------------------------------------------------------

    registerSimpleBlock(editor, {
      id: 'img-render-pixelated-sample', label: 'Pixel-exact Image', category: 'Image Effects', media: icons.image,
      html: '<img src="" class="img-render-pixelated" alt="" style="max-width:320px;">',
    });
    registerSimpleBlock(editor, {
      id: 'bg-gradient-linear', label: 'Linear Gradient', category: 'Backgrounds', media: icons.card,
      html: '<div class="bg-gradient-linear pad-lg" style="color:#fff;"><h2>Gradient panel</h2>' +
        '<p>Pick a theme or tune angle, colours and stops in the Presets tab.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'bg-gradient-radial', label: 'Radial Gradient', category: 'Backgrounds', media: icons.card,
      html: '<div class="bg-gradient-radial pad-lg" style="color:#fff; min-height:260px;"><h2>Radial gradient</h2>' +
        '<p>Shape, reach and centre are adjustable.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'bg-noise-overlay', label: 'Gradient + Grain', category: 'Backgrounds', media: icons.card,
      html: '<div class="bg-gradient-linear bg-noise pad-lg" style="color:#fff; border-radius:8px;">' +
        '<h2>Warm gradient + grain</h2><p>Subtle texture for large flat surfaces.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'glass-card', label: 'Glass Panel', category: 'Effects', media: icons.card,
      html: '<div class="glass pad-md" style="border-radius:12px;"><h3>Glass panel</h3>' +
        '<p>Blurs what is behind it. Tune blur, tint and saturation in the Presets tab.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'shadow-card', label: 'Elevated Shadow Card', category: 'Effects', media: icons.card,
      html: '<div class="shadow-custom pad-md" style="border-radius:10px; background:var(--surface, #1e1e1e);">' +
        '<h3>Elevated card</h3><p>Fully tunable shadow.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'outline-box', label: 'Outlined Box', category: 'Effects', media: icons.card,
      html: '<div class="outline-thin pad-md" style="border-radius:8px;"><h3>Outlined</h3><p>Follows the text colour.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'hover-zoom-image', label: 'Image with Hover Zoom', category: 'Hover', media: icons.image,
      html: '<div class="hover-zoom" style="max-width:520px; border-radius:10px;"><img src="" alt="" style="display:block; width:100%;"></div>',
    });
    registerSimpleBlock(editor, {
      id: 'hover-underline-link', label: 'Animated Underline Link', category: 'Hover', media: icons.link,
      html: '<a href="#" class="hover-underline" style="font-size:18px; color:inherit;">Underline grows on hover</a>',
    });
    registerSimpleBlock(editor, {
      id: 'hover-glow-button', label: 'Glow-on-Hover Button', category: 'Hover', media: icons.pulse,
      html: '<div class="hover-stage"><a href="#" class="btn btn-primary hover-glow">Glow on hover</a></div>',
    });
    registerSimpleBlock(editor, {
      id: 'hover-lift-card', label: 'Lift-on-Hover Card', category: 'Hover', media: icons.card,
      html: '<div class="hover-stage"><div class="card pad-md hover-lift hover-grow">' +
        '<h3>Lift + grow on hover</h3><p>Hover tags combine; the stage keeps the pointer steady.</p></div></div>',
    });
    registerSimpleBlock(editor, {
      id: 'hover-tilt-card', label: 'Tilt-on-Hover Card', category: 'Hover', media: icons.card,
      html: '<div class="hover-stage"><div class="card pad-md hover-tilt">' +
        '<h3>Tilt on hover</h3><p>The stage keeps the hitbox stable so a corner cannot slip out from under the cursor.</p></div></div>',
    });
    registerSimpleBlock(editor, {
      id: 'scale-sample', label: 'Scaled Card (80%)', category: 'Effects', media: icons.card,
      html: '<div class="card pad-md scale" style="--el-scale:0.8; max-width:340px;"><h3>Scaled card</h3>' +
        '<p>Everything renders at 80%. Adjust in the Presets tab.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'filter-blur', label: 'Blurred Panel', category: 'Effects', media: icons.card,
      html: '<div class="blur-custom pad-md" style="border-radius:8px; background:var(--surface-2, #222);"><p>Blurred content.</p></div>',
    });
    registerSimpleBlock(editor, {
      id: 'img-glow-sample', label: 'Image Glow (follows alpha)', category: 'Image Effects', media: icons.image,
      html: '<img src="" class="img-glow" alt="" style="max-width:320px;">',
    });
    registerSimpleBlock(editor, {
      id: 'img-shadow-sample', label: 'Image Drop Shadow (follows alpha)', category: 'Image Effects', media: icons.image,
      html: '<img src="" class="img-shadow" alt="" style="max-width:320px;">',
    });
  },
});
