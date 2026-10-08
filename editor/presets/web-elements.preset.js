// Page chrome blocks (sticky and fixed headers, sticky sidebars, z-index
// stacks) from ui-presets.css classes, with their settings.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-web-elements',
  plugin: function (editor) {
    const { registerSimpleBlock, registerDependency, registerPresetSchemas, icons } =
      window.PresetRegistry;

    registerDependency('css', '/assets/css/ui-presets.css');
    registerDependency('js', '/assets/js/sticky-hold.js');

    const side = (a) => a.readAttr('data-stick-side') || 'top';
    registerPresetSchemas(['sticky-top'], {
      title: 'Sticky',
      description: 'Scrolls with its container, then holds at a side of the screen until the container ends.',
      properties: [
        { key: 'data-stick-side', attr: true, label: 'Holds at', type: 'select', placeholder: 'Top of the screen', rerender: true, options: [
          { id: 'center', name: 'Center of the screen' }, { id: 'bottom', name: 'Bottom of the screen' },
          { id: 'left', name: 'Left edge' }, { id: 'right', name: 'Right edge' } ],
          help: 'Bottom holds an element placed at the end of its container. Left and right apply inside containers that scroll sideways.' },
        { key: '--sticky-offset', label: 'Distance', type: 'range', min: 0, max: 400, step: 2, unit: 'px', default: 0,
          when: (a) => side(a) !== 'center', help: 'From the edge it holds at.' },
        { key: '--sticky-offset', label: 'Offset', type: 'range', min: -400, max: 400, step: 2, unit: 'px', default: 0,
          when: (a) => side(a) === 'center', help: 'Moves it up or down from the center.' },
        { key: '--sticky-z', label: 'Z-index', type: 'range', min: 0, max: 1000, step: 10, default: 100 },
      ],
    });
    registerPresetSchemas(['fixed-top'], {
      title: 'Fixed bar',
      description: 'Always on screen, across the full width.',
      properties: [
        { key: 'data-stick-side', attr: true, label: 'Edge', type: 'segmented', default: '', options: [
          { id: '', name: 'Top' }, { id: 'bottom', name: 'Bottom' } ] },
        { key: '--sticky-offset', label: 'Distance', type: 'range', min: 0, max: 200, step: 2, unit: 'px', default: 0 },
        { key: '--sticky-z', label: 'Z-index', type: 'range', min: 0, max: 1000, step: 10, default: 100 },
      ],
    });

    registerPresetSchemas(['z-behind', 'z-front', 'z-top'], {
      title: 'Z-index',
      properties: [
        { key: '--z', label: 'Value', type: 'number', step: 1, min: -1000, max: 10000, default: 0 },
      ],
    });

    registerSimpleBlock(editor, {
      id: 'fixed-header', label: 'Fixed Header', category: 'Layout',
      media: icons.sticky,
      html: `
        <header class="fixed-top pad-sm" style="background:var(--surface, #161616); border-bottom:1px solid var(--border, #2a2a2a);">
          <div class="flex-between" style="max-width:1100px; margin:0 auto;">
            <strong>Brand</strong>
            <nav class="gap-md" style="display:flex;">
              <a href="#">Home</a><a href="#">About</a><a href="#">Contact</a>
            </nav>
          </div>
        </header>
        <div style="height:60px;"></div>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'sticky-sidebar', label: 'Sticky Sidebar', category: 'Layout',
      media: icons.layers,
      html: `
        <div style="display:flex; gap:24px; align-items:flex-start;">
          <aside class="sticky-top pad-md" style="flex:0 0 240px; background:var(--surface, #161616); border-radius:8px;">
            <h3>Sidebar</h3>
            <p>Stays visible while the main column scrolls.</p>
          </aside>
          <div style="flex:1; min-width:0;">
            <h2>Main content</h2>
            <p>The sidebar sticks once this column is taller than the screen.</p>
          </div>
        </div>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'z-stack-demo', label: 'Layered Stack (behind/front/top)', category: 'Layout',
      media: icons.layers,
      html: `
        <div class="relative" style="height:220px;">
          <div class="z-behind" style="position:absolute; top:0;   left:0;    width:60%; height:180px; background:var(--surface, #1a1a1a); border-radius:8px;"></div>
          <div class="z-front"  style="position:absolute; top:20px;left:20%;  width:60%; height:180px; background:var(--surface-2, #2a2a2a); border-radius:8px;"></div>
          <div class="z-top"    style="position:absolute; top:40px;left:40%;  width:60%; height:180px; background:var(--border, #3a3a3a); border-radius:8px;"></div>
        </div>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'breadcrumb', label: 'Breadcrumb', category: 'Basic',
      media: icons.link,
      html: `
        <nav class="breadcrumb" style="font-size:0.9rem;">
          <a href="#">Home</a> <span style="color:var(--muted, #777);">/</span>
          <a href="#">Section</a> <span style="color:var(--muted, #777);">/</span>
          <span>Current page</span>
        </nav>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'image-with-caption', label: 'Image with Caption', category: 'Media',
      media: icons.image,
      html: `
        <figure style="margin:0;">
          <img src="" alt="" style="width:100%; border-radius:8px; display:block;">
          <figcaption style="font-size:0.85rem; color:var(--muted, #888); margin-top:8px;">A short caption describing the image.</figcaption>
        </figure>
      `,
    });
  },
});