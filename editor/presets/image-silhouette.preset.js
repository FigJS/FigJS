// Image silhouette: an image used as the alpha mask of a coloured box
// (--img-mask-src); Browse or double-click picks the image.
window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-image-silhouette',
  plugin: function (editor) {
    const { registerDependency, icons, registerComponentPreset } = window.PresetRegistry;

    registerDependency('css', '/assets/css/ui-presets.css');
    registerDependency('js',  '/assets/js/image-silhouette.js');

    // Shared by the Browse trait and double-click.
    function pickImage(ed, callback) {
      ed.AssetManager.open({
        types: ['image'],
        accept: 'image/*',
        select: (asset, complete) => {
          const url = typeof asset === 'string' ? asset : asset.get('src');
          callback(url);
          if (complete) ed.AssetManager.close();
        },
      });
    }

    registerComponentPreset(editor, {
      id: 'image-silhouette',
      label: 'Image Silhouette',
      category: 'Image Effects',
      media: icons.image,
      classes: ['img-silhouette'],
      alternateClasses: ['img-silhouette-outline'],
      // No inner <img>: the mask comes from --img-mask-src alone.
      defaultAttributes: {
        'data-src':   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 38l32-3z' fill='%23fff'/%3E%3C/svg%3E",
        'data-fill':  '#ffffff',
        'data-alpha': '1',
        'data-fit':   'contain',
        'data-mode':  'solid',
        'data-rim':   '3',
      },
      // A tracked default style, so the size is saved and exported.
      style: { width: '200px', height: '200px' },
      traits: [
        { type: 'text', name: 'data-src', label: 'Image URL',
          placeholder: '/assets/images/image.png or a URL' },
        { type: 'button', name: 'browse', label: 'Browse',
          text: 'Choose',
          command: function (ed, trait) {
            // Trait buttons call commands as (editor, trait); trait.target is the component.
            const comp = trait && (trait.target || (trait.get && trait.get('component')));
            if (!comp) return;
            pickImage(ed, (url) => comp.addAttributes({ 'data-src': url }));
          },
        },
        { type: 'color', name: 'data-fill', label: 'Fill color' },
        { type: 'range', name: 'data-alpha', label: 'Fill alpha',
          min: 0, max: 1, step: 0.05, default: 1 },
        { type: 'select', name: 'data-mode', label: 'Mode', options: [
          { id: 'solid',   name: 'Solid fill' },
          { id: 'outline', name: 'Outline only (ring)' },
          { id: 'shrink',  name: 'Shrink (erode edges)' },
        ]},
        { type: 'select', name: 'data-fit', label: 'Fit (solid only)', options: [
          { id: 'contain', name: 'Contain' },
          { id: 'cover',   name: 'Cover' },
          { id: 'fill',    name: 'Stretch' },
        ]},
        { type: 'range', name: 'data-rim', label: 'Rim / erode',
          min: 1, max: 40, step: 1, unit: 'px', default: 3 },
      ],
      blockAttributes: {
        'data-src':   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 38l32-3z' fill='%23fff'/%3E%3C/svg%3E",
        'data-mode':  'solid',
        'data-fill':  '#ffffff',
        'data-alpha': '1',
        'data-fit':   'contain',
        'data-rim':   '3',
      },

      view: {
        events: {
          dblclick: 'promptPicker',
        },
        init() {
          this.listenTo(this.model, 'change:attributes', this.updateSilhouette);
        },
        onRender() { this.updateSilhouette(); },
        promptPicker() {
          pickImage(editor, (url) => {
            this.model.addAttributes({ 'data-src': url });
          });
        },
        updateSilhouette() {
          const el = this.el;
          const a = this.model.getAttributes();

          const src   = (a['data-src'] || '').trim();
          const fill  = (a['data-fill'] || '#ffffff').trim();
          const alphaRaw = parseFloat(a['data-alpha']);
          const alpha = isNaN(alphaRaw) ? 1 : Math.max(0, Math.min(1, alphaRaw));
          const mode  = a['data-mode'] || 'solid';
          const fit   = a['data-fit']  || 'contain';
          const rimRaw = parseFloat(a['data-rim']);
          const rim = isNaN(rimRaw) ? 3 : rimRaw;

          // Through the shared colour helper when installed, else the raw value.
          const color = window.FigJS && window.FigJS.color;
          const fillCss = color
            ? color.format(fill, alpha)
            : fill;

          el.style.setProperty('--img-mask-src', src ? `url("${src}")` : 'none');
          el.style.setProperty('--img-mask-color', fillCss);
          el.style.setProperty('--img-mask-size', fit);
          el.style.setProperty('--img-outline-size', rim + 'px');

          el.classList.toggle('is-outline', mode === 'outline');
          el.classList.toggle('is-shrink',  mode === 'shrink');
        },
      },
    });
  },
});