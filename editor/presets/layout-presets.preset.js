// Centering, spacing and positioning tags (Pin: the corners, edges and
// middle of an element) and layout blocks.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-layout',
  plugin: function (editor) {
  const { registerSimpleBlock, registerDependency, registerPresetSchemas,
          registerMutexGroup, icons } = window.PresetRegistry;

  // Each family sets the same property: picking one removes the others.

  // max-width from --container-max
  registerMutexGroup(['container', 'container-narrow']);

  // grid-template-columns
  registerMutexGroup(['grid-auto', 'grid-2', 'grid-3', 'grid-4']);

  // child order
  registerMutexGroup(['split', 'split-reverse']);

  // flex-direction
  registerMutexGroup(['stack', 'stack-reverse']);

  // aspect-ratio: the Aspect box, and its older 16:9 and square forms.
  registerMutexGroup(['aspect-box', 'aspect-video', 'aspect-square']);
  window.PresetRegistry.registerPresetTag('aspect-box', {
    group: 'Layout',
    description: 'Keeps one shape at any width: a frame for media, embeds, cards or a zoom box. Fill makes a child take the whole box.',
  });
  registerPresetSchemas(['aspect-box', 'aspect-video', 'aspect-square'], {
    title: 'Aspect box',
    properties: [
      { key: '--aspect', label: 'Shape', type: 'aspect',
        placeholder: (a) => (a.hasClass('aspect-square') ? 'Square' : '16:9'),
        help: 'Width to height. Other… takes any ratio (5:2, 2.5).' },
    ],
  });

  registerDependency('css', '/assets/css/ui-presets.css');

  registerPresetSchemas(['pad-sm','pad-md','pad-lg'], {
    title: 'Padding',
    properties: [
      { key: '--pad', label: 'Padding', type: 'range', min: 0, max: 96, step: 2, unit: 'px', default: 24 },
    ],
  });

  // Visibility by screen width: phone up to 640px, tablet 641-1024px
  // (the editor's Tablet device), desktop 1025px and up. The canvas
  // follows the device picked in the toolbar instead of its own width.
  [
    ['hide-phone', 'Hidden on phones (up to 640px wide); shown on tablets and computers.'],
    ['only-phone', 'Shown on phones only (up to 640px wide).'],
    ['hide-tablet', 'Hidden on tablets (641 to 1024px wide); shown on phones and computers.'],
    ['only-tablet', 'Shown on tablets only (641 to 1024px wide).'],
    ['hide-desktop', 'Hidden on computers (1025px and wider); shown on phones and tablets.'],
    ['only-desktop', 'Shown on computers only (1025px and wider).'],
  ].forEach(([cls, description]) => window.PresetRegistry.registerPresetTag(cls, { description }));

  registerPresetSchemas(['span-bleed'], {
    title: 'Span bleed',
    description: 'Reaches the edges of the screen from wherever it sits; tilted (rotated), it widens so its corners stay past them.',
    properties: [
      { key: 'data-bleed-side', attr: true, label: 'Edges', type: 'segmented', default: '', options: [
        { id: '', name: 'Both' }, { id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }] },
      { key: 'data-bleed-content', attr: true, label: 'Content', type: 'segmented', default: '', options: [
        { id: '', name: 'Full width' }, { id: 'column', name: 'In its column' }],
        help: 'In its column: the background reaches the edges while the content stays where it was (container, centred text).' },
    ],
  });

  // A span bleed widens to cover its own tilt (span-bleed.js); a rotation
  // edited in the editor changes a rule, not the element, so re-measure
  // after edits.
  let bleedTimer = 0;
  editor.on('update', () => {
    clearTimeout(bleedTimer);
    bleedTimer = setTimeout(() => {
      const win = editor.Canvas.getWindow();
      if (win && win.SpanBleed && win.document.querySelector('.span-bleed')) win.SpanBleed.refresh();
    }, 150);
  });

  // ---- Pin -------------------------------------------------------------
  // To a corner, an edge or the middle of the box it is in, or of the
  // screen (ui-presets.css): a tag per spot, swapped by the Spot grid.
  const PIN_SPOTS = [
    ['top-left', 'Top left'], ['top', 'Top'], ['top-right', 'Top right'],
    ['left', 'Left'], ['center', 'Middle'], ['right', 'Right'],
    ['bottom-left', 'Bottom left'], ['bottom', 'Bottom'], ['bottom-right', 'Bottom right'],
  ];
  const PIN_CLASSES = PIN_SPOTS.map(([spot]) => 'pin-' + spot);
  const spotOf = (a) => {
    const cls = PIN_CLASSES.find((c) => a.hasClass(c));
    return cls ? cls.slice(4) : '';
  };
  const has = (word) => (a) => spotOf(a).split('-').includes(word);
  const onEdge = (a) => ['top', 'bottom', 'left', 'right'].includes(spotOf(a));
  const stretched = (a) => onEdge(a) && !!a.readAttr('data-pin-stretch');
  const centredX = (a) => ['top', 'bottom', 'center'].includes(spotOf(a));
  const centredY = (a) => ['left', 'right', 'center'].includes(spotOf(a));
  const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));

  // Each takes the place of the others, and of the other ways to position.
  registerMutexGroup(PIN_CLASSES.concat(['absolute-center', 'sticky-top', 'fixed-top']));
  PIN_SPOTS.forEach(([spot, name]) => window.PresetRegistry.registerPresetTag('pin-' + spot, {
    description: spot === 'center'
      ? 'Pinned to the middle of the box it is in, or of the screen.'
      : `Pinned to the ${name.toLowerCase()} ${spot.includes('-') ? 'corner' : 'edge'} of the box it is in, or of the screen.`,
  }));

  function spotField(ctx) {
    const a = ctx.adapter;
    const grid = document.createElement('div');
    grid.className = 'fig-pin-grid';
    const buttons = PIN_SPOTS.map(([spot, name]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = name;
      b.dataset.spot = spot;
      b.addEventListener('click', () => {
        const was = spotOf(a);
        if (!was || was === spot) return;
        // One change (one undo step), in the class's place.
        const comp = a.component;
        if (comp && comp.setClass) {
          comp.setClass(comp.getClasses().map((c) => (c === 'pin-' + was ? 'pin-' + spot : c)));
        } else {
          a.removeClass('pin-' + was);
          a.addClass('pin-' + spot);
        }
        FigJS.markUnsaved();
        a.changed();
        if (FigJS.presetsTab) FigJS.presetsTab.render();
        if (FigJS.componentSettings) FigJS.componentSettings.render(true);
      });
      grid.appendChild(b);
      return b;
    });
    const refresh = () => {
      const spot = spotOf(a);
      buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.spot === spot));
    };
    refresh();
    return { el: grid, refresh };
  }

  const pinDistance = (key, label, when, help) =>
    ({ key, label, type: 'range', min: -200, max: 200, step: 1, unit: 'px', default: 0, when, help });
  const FROM_EDGE = 'How far in from that edge (Outside: the gap). Below 0 goes the other way.';
  registerPresetSchemas(PIN_CLASSES, {
    title: 'Pin',
    description: 'Holds to a spot on the box it is in, out of the flow of the things around it, and shows above them. A Layer (Layer & blend) orders it further.',
    properties: [
      { label: 'Spot', build: spotField, help: 'A corner, an edge or the middle.' },
      { key: 'data-pin-to', attr: true, label: 'Pinned to', type: 'segmented', default: '',
        options: opt([['', 'Its box'], ['screen', 'The screen']]),
        help: 'Its box: the element it sits in. The screen: stays put as the page scrolls; inside something tilted, filtered or with Glass, it holds to that instead.' },
      { key: 'data-pin-sit', attr: true, label: 'Sits', type: 'segmented', default: '',
        options: opt([['', 'Inside'], ['edge', 'On the edge'], ['out', 'Outside']]), when: (a) => spotOf(a) !== 'center',
        help: 'On the edge: centred on the line, half in and half out (a corner badge). Outside: above the top spots, below the bottom ones, beside the left and right edges.' },
      { key: 'data-pin-stretch', attr: true, label: 'Size', type: 'segmented', default: '', rerender: true,
        options: opt([['', 'Its own'], ['on', 'Along the edge']]), when: onEdge,
        help: 'Along the edge: the whole length of that side (a bar).' },
      pinDistance('--pin-x', 'From the left', has('left'), FROM_EDGE),
      pinDistance('--pin-x', 'From the right', has('right'), FROM_EDGE),
      pinDistance('--pin-x', 'Sideways', (a) => centredX(a) && !stretched(a), 'Off the middle; above 0 moves it right.'),
      pinDistance('--pin-x', 'From the ends', (a) => centredX(a) && stretched(a), 'In from the left and right ends.'),
      pinDistance('--pin-y', 'From the top', has('top'), FROM_EDGE),
      pinDistance('--pin-y', 'From the bottom', has('bottom'), FROM_EDGE),
      pinDistance('--pin-y', 'Up and down', (a) => centredY(a) && !stretched(a), 'Off the middle; above 0 moves it down.'),
      pinDistance('--pin-y', 'From the ends', (a) => centredY(a) && stretched(a), 'In from the top and bottom ends.'),
      { key: 'data-pin-phone', attr: true, label: 'On phones', type: 'segmented', default: '',
        options: opt([['', 'Pinned'], ['flow', 'In place']]),
        help: 'In place: on phones (up to 640px wide) it sits back between the things around it.' },
    ],
  });

  registerPresetSchemas(['gap-sm','gap-md','gap-lg'], {
    title: 'Gap',
    properties: [
      { key: '--gap', label: 'Gap', type: 'range', min: 0, max: 96, step: 2, unit: 'px', default: 16 },
    ],
  });

  registerSimpleBlock(editor, {
    id: 'center-hero', label: 'Centered Hero', category: 'Layout',
    media: icons.card,
    html: `
      <section class="flex-center pad-lg" style="min-height:320px; text-align:center;">
        <div>
          <h1>Centered headline</h1>
          <p class="lede">Subheadline goes here.</p>
          <a href="#" class="btn btn-primary">Call to action</a>
        </div>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'absolute-center-box', label: 'Absolutely Centered Box', category: 'Layout',
    media: icons.layers,
    html: `
      <div class="relative" style="height:240px; background:var(--surface, #161616); border-radius:8px;">
        <div class="absolute-center pad-md" style="background:var(--surface-2, #222); border-radius:6px;">
          Centered both axes
        </div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'flex-row-gap', label: 'Row with Gap', category: 'Layout',
    media: icons.columns3,
    html: `<div class="flex-col" style="flex-direction:row; gap:16px; flex-wrap:wrap;">
      <div style="flex:1; min-width:180px;">Column A</div>
      <div style="flex:1; min-width:180px;">Column B</div>
      <div style="flex:1; min-width:180px;">Column C</div>
    </div>`,
  });

  registerSimpleBlock(editor, {
    id: 'flex-between', label: 'Header Row (Space-Between)', category: 'Layout',
    media: icons.columns2,
    html: `<div class="flex-between pad-md" style="background:var(--surface, #161616); border-radius:8px;">
      <strong>Brand</strong>
      <nav class="gap-md" style="display:flex;"><a href="#">Link</a><a href="#">Link</a></nav>
    </div>`,
  });

  registerSimpleBlock(editor, {
    id: 'aspect-box', label: 'Aspect Box', category: 'Layout',
    media: icons.video,
    html: `<div class="aspect-box" style="background:var(--surface, #161616); border-radius:8px;"></div>`,
  });
  
  // ---- Responsive layout blocks -----------------------------------------
  registerSimpleBlock(editor, {
    id: 'container-block', label: 'Container (centered, max-width)', category: 'Layout',
    media: icons.card,
    html: `
      <section class="container pad-md">
        <h2>Section heading</h2>
        <p>Content inside a bounded, centered container. Change --container-max in the Presets tab.</p>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'responsive-grid-2', label: '2-Column Grid (collapses on phone)', category: 'Layout',
    media: icons.columns2,
    html: `
      <div class="grid-2">
        <div class="card pad-md"><h3>Left</h3><p>Content.</p></div>
        <div class="card pad-md"><h3>Right</h3><p>Content.</p></div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'responsive-grid-3', label: '3-Column Grid (collapses on phone)', category: 'Layout',
    media: icons.columns3,
    html: `
      <div class="grid-3">
        <div class="card pad-md"><h3>One</h3><p>Content.</p></div>
        <div class="card pad-md"><h3>Two</h3><p>Content.</p></div>
        <div class="card pad-md"><h3>Three</h3><p>Content.</p></div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'grid-auto-fill', label: 'Auto-Fill Grid (responds to width)', category: 'Layout',
    media: icons.columns3,
    html: `
      <div class="grid-auto">
        <div class="card pad-md">Item</div>
        <div class="card pad-md">Item</div>
        <div class="card pad-md">Item</div>
        <div class="card pad-md">Item</div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'split-media-text', label: 'Split: Media + Text (reverses on phone)', category: 'Layout',
    media: icons.card,
    html: `
      <div class="split">
        <div><img src="" alt="" style="width:100%; border-radius:8px; display:block;"></div>
        <div class="pad-md">
          <h2>Pair a picture with prose</h2>
          <p>Columns sit side by side on desktop and stack on phone.</p>
        </div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'stack-section', label: 'Stacked Section (row on desktop, column on phone)', category: 'Layout',
    media: icons.layers,
    html: `
      <div class="stack">
        <div class="card pad-md" style="flex:1 1 220px; min-width:220px;">Panel A</div>
        <div class="card pad-md" style="flex:1 1 220px; min-width:220px;">Panel B</div>
        <div class="card pad-md" style="flex:1 1 220px; min-width:220px;">Panel C</div>
      </div>
    `,
  });

  },
});