// Sharing tags, one runtime (sharing.js):
//   .copy-content  button that copies the element's text
//   .anchor-copy   button that copies a link to the element (giving it an
//                  anchor slug or id first)
//   .share-button  share trigger
// "Float button outside element bounds" (data-cc-float) moves the button
// to <body>, pinned to the element's edge, so overflow, transforms or
// filters on the element don't clip it.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-sharing',
  plugin: function (editor) {
    const {
      registerSimpleBlock,
      registerDependency,
      registerPresetSchemas,
      registerPresetClass,
      icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/sharing.css');
    registerDependency('js',  '/assets/js/sharing.js');

    registerPresetClass('copy-content');
    registerPresetClass('anchor-copy');
    registerPresetClass('share-button');

    // ---- Shared schema ---------------------------------------------

    const CORNER_OPTIONS = [
      { name: 'Top right', values: {
        '--cc-corner-top':    'var(--cc-offset-y, 8px)',
        '--cc-corner-right':  'var(--cc-offset-x, 8px)',
        '--cc-corner-bottom': 'auto',
        '--cc-corner-left':   'auto',
      } },
      { name: 'Top left', values: {
        '--cc-corner-top':    'var(--cc-offset-y, 8px)',
        '--cc-corner-left':   'var(--cc-offset-x, 8px)',
        '--cc-corner-bottom': 'auto',
        '--cc-corner-right':  'auto',
      } },
      { name: 'Bottom right', values: {
        '--cc-corner-bottom': 'var(--cc-offset-y, 8px)',
        '--cc-corner-right':  'var(--cc-offset-x, 8px)',
        '--cc-corner-top':    'auto',
        '--cc-corner-left':   'auto',
      } },
      { name: 'Bottom left', values: {
        '--cc-corner-bottom': 'var(--cc-offset-y, 8px)',
        '--cc-corner-left':   'var(--cc-offset-x, 8px)',
        '--cc-corner-top':    'auto',
        '--cc-corner-right':  'auto',
      } },
    ];

    const SHARING_SCHEMA = {
      title: 'Copy button',
      properties: [
        { key: '_corner', label: 'Corner', type: 'preset',
          options: CORNER_OPTIONS },

        { key: '--cc-offset-x', label: 'Offset X', type: 'range',
          min: 0, max: 48, step: 2, unit: 'px', default: 8 },
        { key: '--cc-offset-y', label: 'Offset Y', type: 'range',
          min: 0, max: 48, step: 2, unit: 'px', default: 8 },

        { key: '--cc-size',         label: 'Button size',   type: 'range',
          min: 20, max: 56, step: 2, unit: 'px', default: 30 },
        { key: '--cc-radius',       label: 'Corner radius', type: 'range',
          min: 0, max: 28, step: 1, unit: 'px', default: 6 },
        { key: '--cc-idle-opacity', label: 'Idle opacity',  type: 'range',
          min: 0, max: 1, step: 0.05, default: 0.35 },

        { key: '--cc-bg',       label: 'Button bg',        type: 'color-alpha',
          default: 'rgba(20, 20, 20, 0.85)' },
        { key: '--cc-bg-hover', label: 'Button bg (hover)', type: 'color-alpha',
          default: 'rgba(20, 20, 20, 0.95)' },
        { key: '--cc-fg',       label: 'Button icon',      type: 'color',
          default: '#ffffff' },
        { key: '--cc-fg-flash', label: 'Success colour',   type: 'color',
          default: '#4ade80' },
        { key: '--cc-duration', label: 'Transition',       type: 'range',
          min: 0, max: 0.6, step: 0.05, unit: 's', default: 0.15 },
      ],
    };

    registerPresetSchemas(['copy-content'], SHARING_SCHEMA);

    // How an anchor arrives when its copied link is opened, and the copy flash.
    registerPresetSchemas(['anchor-copy'], {
      title: 'Anchor button',
      properties: SHARING_SCHEMA.properties.concat(
        window.PresetRegistry.linkArrivalProperties({ align: 'start', highlight: 'outline' })),
    });

    const SHARE_BUTTON_SCHEMA = {
      title: 'Share button',
      properties: [
        { key: '--share-flash', label: 'Flash colour', type: 'color',
          default: '#4ade80' },
      ],
    };
    registerPresetSchemas(['share-button'], SHARE_BUTTON_SCHEMA);

    // ---- Traits on elements with a sharing class -------------------------
    // data-copy-mode (what is copied), data-anchor-slug (the URL fragment),
    // data-cc-float (float outside the element).

    const COPY_MODE_TRAIT = {
      type: 'select',
      name: 'data-copy-mode',
      label: 'Copy source',
      category: 'Copy button',
      options: [
        { id: '',     name: 'Auto (markdown on md-blocks, else visible text)' },
        { id: 'text', name: 'Visible text only' },
        { id: 'md',   name: 'Markdown source (data-md)' },
        { id: 'href', name: 'Href of first link inside' },
      ],
    };

    const ANCHOR_SLUG_TRAIT = {
      type: 'text',
      name: 'data-anchor-slug',
      label: 'Anchor slug',
      category: 'Anchor',
      placeholder: 'leave empty to auto-derive',
    };

    const FLOAT_TRAIT = {
      type: 'checkbox',
      name: 'data-cc-float',
      label: 'Float button outside element bounds',
      category: 'Button',
      valueTrue: 'true',
      valueFalse: '',
    };

    function traitNames(component) {
      const traits = component.get('traits');
      if (!traits || typeof traits.add !== 'function') return null;
      return {
        traits,
        names: new Set(
          traits.map((t) => (t && t.get ? t.get('name') : t && t.name)).filter(Boolean)
        ),
      };
    }

    editor.on('component:selected', (component) => {
      const classes = component.getClasses ? component.getClasses() : [];
      const ctx = traitNames(component);
      if (!ctx) return;

      const isCopy   = classes.indexOf('copy-content') !== -1;
      const isAnchor = classes.indexOf('anchor-copy')  !== -1;
      const isShare  = classes.indexOf('share-button') !== -1;
      const isSharing = isCopy || isAnchor || isShare;

      if (isSharing && !ctx.names.has(FLOAT_TRAIT.name)) {
        ctx.traits.add([FLOAT_TRAIT]);
        ctx.names.add(FLOAT_TRAIT.name);
      }

      if (isCopy && !ctx.names.has(COPY_MODE_TRAIT.name)) {
        ctx.traits.add([COPY_MODE_TRAIT]);
        ctx.names.add(COPY_MODE_TRAIT.name);
      }

      if (isAnchor && !ctx.names.has(ANCHOR_SLUG_TRAIT.name)) {
        ctx.traits.add([ANCHOR_SLUG_TRAIT]);
        ctx.names.add(ANCHOR_SLUG_TRAIT.name);
      }
    });

    // ---- Blocks ----------------------------------------------------

    registerSimpleBlock(editor, {
      id: 'copy-content-code',
      label: 'Code Block (copyable)',
      category: 'Utility',
      media: icons.text,
      html: `
        <pre class="copy-content" style="padding:16px; background:var(--code-bg, #141414); border:1px solid var(--border, #2a2a2a); border-radius:8px; overflow:auto;"><code>npm install
npm run build
npm run deploy</code></pre>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'copy-content-text',
      label: 'Copyable Text',
      category: 'Utility',
      media: icons.text,
      html: `
        <p class="copy-content" style="padding:12px 16px; background:var(--surface, #161616); border-radius:6px;">
          Click the button to copy this paragraph.
        </p>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'anchor-copy-heading',
      label: 'Anchor Heading (copy link)',
      category: 'Utility',
      media: icons.link,
      html: `
        <h2 class="anchor-copy" style="padding-right:40px;">Section title</h2>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'anchor-copy-floating',
      label: 'Anchor Heading (floating button)',
      category: 'Utility',
      media: icons.link,
      html: `
        <h2 class="anchor-copy" data-cc-float="true" style="padding:24px 40px;">Floating-anchor heading</h2>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'share-button-inline',
      label: 'Share Button (inline)',
      category: 'Utility',
      media: icons.link,
      html: `
        <button class="btn share-button" type="button">Share</button>
      `,
    });

    registerSimpleBlock(editor, {
      id: 'share-button-floating',
      label: 'Share Block (floating)',
      category: 'Utility',
      media: icons.link,
      html: `
        <div class="share-button pad-md" data-cc-float="true" style="border-radius:8px; background:var(--surface, #161616); max-width:420px;">
          <h3>Shareable block</h3>
          <p>A floating share button tracks this card's corner.</p>
        </div>
      `,
    });
  },
});