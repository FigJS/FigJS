// Basic blocks: text, link, image, columns, divider, spacer.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-basic-blocks',
  plugin: function (editor) {
    const bm = editor.BlockManager;
    const { icons } = window.PresetRegistry;

    bm.add('text', {
      label: 'Text',
      category: 'Basic',
      media: icons.text,
      content: { type: 'text', content: 'Insert your text here', style: { padding: '10px' } },
    });

    bm.add('link', {
      label: 'Link',
      category: 'Basic',
      media: icons.link,
      content: {
        type: 'link',
        content: 'Link text',
        attributes: { href: '#' },
        style: {
          color: 'inherit',
          'text-decoration': 'underline',
          'text-underline-offset': '2px',
        },
      },
    });

    bm.add('image', {
      label: 'Image',
      category: 'Media',
      media: icons.image,
      content: {
        type: 'image',
        attributes: { src: '' },
        style: {
          display: 'block',
          'max-width': '100%',
          height: 'auto',
        },
      },
    });

    bm.add('columns-2', {
      label: '2 Columns',
      category: 'Layout',
      media: icons.columns2,
      content: `
        <div class="flex-row-gap">
          <div class="flex-col-slot"></div>
          <div class="flex-col-slot"></div>
        </div>
      `,
    });

    bm.add('columns-3', {
      label: '3 Columns',
      category: 'Layout',
      media: icons.columns3,
      content: `
        <div class="flex-row-gap">
          <div class="flex-col-slot"></div>
          <div class="flex-col-slot"></div>
          <div class="flex-col-slot"></div>
        </div>
      `,
    });

    bm.add('divider', {
      label: 'Divider',
      category: 'Layout',
      media: icons.divider,
      content: `<hr style="border:none; border-top:1px solid var(--border, #2a2a2a); margin:32px 0;">`,
    });

    bm.add('spacer', {
      label: 'Spacer',
      category: 'Layout',
      media: icons.spacer,
      content: `<div class="spacer-md"></div>`,
    });

    window.PresetRegistry.registerPresetSchemas(['spacer-sm', 'spacer-md', 'spacer-lg'], {
      title: 'Spacer',
      description: 'Empty vertical space. Shown hatched while editing; invisible on the page.',
      properties: [
        { key: '--spacer', label: 'Height', type: 'range', min: 0, max: 400, step: 4, unit: 'px' },
      ],
    });
  },
});