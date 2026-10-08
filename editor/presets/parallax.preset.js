// Parallax (parallax.js, parallax.css).
//   Parallax scene  a box of layers that move with scroll and/or the
//                   pointer by their layer number (-128 to 128, the same
//                   number that orders them): 0 stays with the page, higher
//                   comes closer and faster, below 0 falls behind
//   Parallax layer  fills its scene; takes drops; moves only within scenes
//   .parallax tag   one element moving at its own depth as the page scrolls
// Anything inside a scene with a Layer (Settings > Layer & blend) moves
// by it too.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-parallax',
  plugin: function (editor) {
    const {
      registerDependency, registerComponentPreset, registerComponentSettings,
      registerPresetSchemas, registerPresetTag, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/parallax.css');
    registerDependency('js', '/assets/js/parallax.js');

    const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));
    const input = (a) => a.readAttr('data-parallax-input');
    const scrolls = (a) => input(a) !== 'pointer';
    const points = (a) => input(a) === 'pointer' || input(a) === 'both';

    const PHONES = { key: 'data-parallax-phone', attr: true, label: 'On phones', type: 'segmented', default: '',
      options: opt([['', 'Moves'], ['still', 'Still']]),
      help: 'Still: phones (up to 640px wide) show it in place. Visitors who ask for reduced motion always do.' };

    // ---- Layer ---------------------------------------------------------
    editor.DomComponents.addType('parallax-layer', {
      isComponent(el) {
        if (el && el.classList && el.classList.contains('parallax-layer')) return { type: 'parallax-layer' };
      },
      model: {
        defaults: {
          tagName: 'div',
          classes: ['parallax-layer'],
          draggable: '.parallax-scene',
          droppable: true,
          selectable: true,
          removable: true,
          copyable: true,
          stylable: true,
        },
        getName() {
          const v = parseInt((this.getAttributes() || {})['data-layer'], 10);
          return 'Layer ' + (Number.isFinite(v) ? v : 0);
        },
      },
    });

    registerComponentSettings('parallax-layer', {
      title: 'Parallax layer',
      description: 'Fills its scene. Its layer is both its order and its depth.',
      properties: [
        { key: 'data-layer', attr: true, label: 'Layer', type: 'range', min: -128, max: 128, step: 1, default: 0,
          help: '0 moves with the page. Higher draws on top and moves faster (closer); below 0 sits behind and moves slower (farther). 128 and -128 move by the scene\'s full depth.' },
        { key: 'background-color', label: 'Background', type: 'color-alpha' },
      ],
    });

    // ---- Scene ---------------------------------------------------------
    const layerNumber = (c) => {
      const v = parseInt((c.getAttributes() || {})['data-layer'], 10);
      return Number.isFinite(v) ? v : 0;
    };
    const layersOf = (scene) => scene.components().filter((c) => (c.getClasses() || []).includes('parallax-layer'));

    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    // The scene's layers, top first: in the canvas a layer's box lets
    // clicks through to what is beneath, so they are picked here.
    function layersField(ctx) {
      const scene = ctx.adapter.component;
      const wrap = el('div', 'fig-slides');
      const list = el('div', 'fig-slides-list');
      const add = el('button', 'fig-f-action', '+ Add layer');
      add.type = 'button';
      add.title = 'A new layer on top of the others';
      wrap.append(list, add);

      function refresh() {
        list.textContent = '';
        const layers = layersOf(scene).sort((a, b) => layerNumber(b) - layerNumber(a));
        if (!layers.length) list.appendChild(el('div', 'fig-empty', 'No layers yet.'));
        layers.forEach((c) => {
          const n = layerNumber(c);
          const row = el('div', 'fig-slide');
          const pick = el('button', 'fig-f-action fig-layer-pick', `Layer ${n}`);
          pick.type = 'button';
          pick.title = 'Select this layer';
          pick.addEventListener('click', () => editor.select(c));
          const items = c.components().length;
          const meta = el('span', 'fig-slide-meta', n === 0 ? 'with the page' : n > 0 ? 'closer' : 'behind');
          const count = el('span', 'fig-slide-name', items ? `${items} item${items === 1 ? '' : 's'}` : 'empty');
          row.append(pick, count, meta);
          list.appendChild(row);
        });
      }

      add.addEventListener('click', () => {
        const layers = layersOf(scene);
        const top = layers.length ? Math.max(...layers.map(layerNumber)) : -32;
        const n = Math.min(128, top + 32);
        const added = scene.append(`<div class="parallax-layer" data-layer="${n}"></div>`)[0];
        FigJS.markUnsaved();
        ctx.adapter.changed();
        refresh();
        if (added) editor.select(added);
      });
      refresh();
      return { el: wrap, refresh };
    }

    registerComponentSettings('parallax-scene', {
      title: 'Parallax scene',
      description: 'Its layers move by their layer number as the page scrolls, or with the pointer. Anything inside with a Layer moves too.',
      properties: [
        { label: 'Layers', build: layersField, wide: true,
          help: 'Top first. In the canvas a layer\'s empty area lets clicks through to what is beneath, so pick layers here; their content is clicked directly.' },
        { key: 'data-parallax-input', attr: true, label: 'Moves with', type: 'segmented', default: '', rerender: true,
          options: opt([['', 'Scroll'], ['pointer', 'Pointer'], ['both', 'Both']]) },
        { key: 'data-parallax-scroll', attr: true, label: 'Scroll depth', type: 'range', min: 0, max: 1, step: 0.05,
          format: 'percent', default: 0.4, when: scrolls,
          help: 'How much faster a layer at 128 moves than the page (and a layer at -128 slower); other layers in proportion.' },
        { key: 'data-parallax-pointer', attr: true, label: 'Pointer reach', type: 'range', min: 0, max: 120, step: 1,
          unit: 'px', default: 24, when: points,
          help: 'How far a layer at 128 follows the pointer (at -128 it moves the other way). Touch screens have no pointer to follow.' },
        { key: 'data-parallax-ease', attr: true, label: 'Pointer smoothing', type: 'range', min: 0.02, max: 1, step: 0.01,
          default: 0.12, when: points, help: 'Lower trails the pointer more softly; 1 follows it at once.' },
        { key: 'data-parallax-cover', attr: true, label: 'Layer edges', type: 'segmented', default: '',
          options: opt([['', 'Covered'], ['off', 'As placed']]),
          help: 'Covered: each layer grows just enough that its moves never uncover the scene behind it.' },
        PHONES,
        { type: 'group', label: 'Box' },
        { key: '--scene-height', label: 'Height', type: 'range', min: 10, max: 150, step: 1, unit: 'vh', default: 60,
          help: 'Of the window\'s height; the layers fill it.' },
        { key: '--scene-overflow', label: 'Content', type: 'segmented', default: 'clip',
          options: opt([['clip', 'Clip to scene'], ['visible', 'Overflow']]) },
        { key: '--scene-bg', label: 'Background', type: 'color-alpha' },
      ],
    });

    const layer = (n, inner, style) =>
      `<div class="parallax-layer" data-layer="${n}"${style ? ` style="${style}"` : ''}>${inner || ''}</div>`;
    const dot = (left, top, size, alpha) =>
      `<div style="position:absolute; left:${left}%; top:${top}%; width:${size}px; height:${size}px; border-radius:50%; background:rgba(255, 255, 255, ${alpha});"></div>`;

    registerComponentPreset(editor, {
      id: 'parallax-scene',
      name: 'Parallax scene',
      label: 'Parallax Scene',
      category: 'Motion Presets',
      media: icons.layers,
      classes: ['parallax-scene'],
      droppable: true,
      partSettings: true,
      defaultAttributes: { 'data-parallax-input': 'both' },
      defaultComponents:
        layer(-128, '', 'background:radial-gradient(circle at 30% 30%, #2b3a67 0%, #10131f 70%);')
        + layer(-48, dot(18, 22, 120, 0.06) + dot(70, 60, 180, 0.05))
        + layer(0, '<h2 style="margin:0;">Parallax scene</h2>', 'display:flex; align-items:center; justify-content:center;')
        + layer(64, dot(10, 70, 40, 0.18) + dot(82, 18, 28, 0.22) + dot(60, 80, 18, 0.25)),
    });

    // ---- Tag -----------------------------------------------------------
    registerPresetTag('parallax', {
      description: 'Moves at its own depth as the page scrolls: behind (slower) or in front (faster).',
    });
    registerPresetSchemas(['parallax'], {
      title: 'Parallax',
      description: 'Moves by itself as the page scrolls; in its place when it is in the middle of the window. A rotation or other transform on it stays.',
      properties: [
        { key: 'data-parallax-speed', attr: true, label: 'Depth', type: 'range', min: -1, max: 1, step: 0.05,
          format: 'percent', default: -0.3,
          help: 'Below 0 it lags behind the page (farther away); above 0 it runs ahead (closer).' },
        { key: 'data-parallax-axis', attr: true, label: 'Direction', type: 'segmented', default: '',
          options: opt([['', 'Up and down'], ['x', 'Sideways']]),
          help: 'Sideways: scrolling slides it across instead.' },
        { key: 'data-parallax-pointer', attr: true, label: 'Pointer reach', type: 'range', min: 0, max: 120, step: 1,
          unit: 'px', default: 0, help: 'Also follows the pointer this far; 0: not at all.' },
        { key: 'data-parallax-ease', attr: true, label: 'Pointer smoothing', type: 'range', min: 0.02, max: 1, step: 0.01,
          default: 0.12, when: (a) => parseFloat(a.readAttr('data-parallax-pointer')) > 0 },
        PHONES,
      ],
    });
  },
});
