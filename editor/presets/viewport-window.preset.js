// Viewport window: a fixed-size porthole onto a viewport-locked scene.
// Toggling .viewport-window adds an empty scene child; the block comes
// with a sample scene. The scene (.viewport-window-scene) takes drops
// and can be selected, not dragged, removed or copied.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-viewport-window',
  plugin: function (editor) {
    const { registerDependency, registerSimpleBlock, registerPresetSchema,
            registerPresetClass, registerComponentSettings,
            registerMutexGroup, icons } =
      window.PresetRegistry;

    registerDependency('css', '/assets/css/viewport-window.css');
    registerDependency('js',  '/assets/js/viewport-window.js');

    // ---- Scene type ------------------------------------------------------

    editor.DomComponents.addType('viewport-window-scene', {
      isComponent(el) {
        if (el && el.classList && el.classList.contains('viewport-window-scene')) {
          return { type: 'viewport-window-scene' };
        }
      },
      model: {
        defaults: {
          tagName: 'div',
          classes: ['viewport-window-scene'],
          draggable: false,
          droppable: true,
          selectable: true,
          removable: false,
          copyable: false,
          stylable: true,
          resizable: true,
        },
      },
    });

    // ---- Schema ---------------------------------------------------

    registerComponentSettings('viewport-window', {
      title: 'Viewport window',
      properties: [
        { key: '--vpw-width',    label: 'Width',         type: 'range',
          min: 80, max: 1200, step: 4, unit: 'px', default: 320 },
        { key: '--vpw-height',   label: 'Height',        type: 'range',
          min: 60, max: 800, step: 4, unit: 'px', default: 220 },
        { key: '--vpw-radius',   label: 'Corner radius', type: 'range',
          min: 0, max: 80, step: 1, unit: 'px', default: 8 },
        { key: '--vpw-anchor-x', label: 'Scene anchor X', type: 'range',
          min: 0, max: 100, step: 1, unit: '%', default: 50 },
        { key: '--vpw-anchor-y', label: 'Scene anchor Y', type: 'range',
          min: 0, max: 100, step: 1, unit: '%', default: 50 },
      ],
    });

    registerPresetClass('viewport-window');

    // ---- Scene added on toggle -------------------------------------------
    // Appended when the element has no scene; other children stay siblings.

    editor.on('component:update:classes', (comp) => {
      const classes = comp.getClasses && comp.getClasses();
      if (!classes || classes.indexOf('viewport-window') === -1) return;

      const kids = comp.components();
      const models = (kids && kids.models) || [];
      const hasScene = models.some(
        (c) => c.getClasses && c.getClasses().indexOf('viewport-window-scene') >= 0
      );
      if (hasScene) return;

      try {
        comp.append('<div class="viewport-window-scene"></div>');
      } catch (e) {
        // The component is being removed.
      }
    });

    // ---- Block -----------------------------------------------------------
    // A 900x600 scene behind a 320x220 window, so the effect shows on drop.

    registerSimpleBlock(editor, {
      id: 'viewport-window',
      label: 'Viewport Window',
      category: 'Containers',
      media: icons.card,
      html: `
        <div class="viewport-window">
          <div class="viewport-window-scene" style="width:900px; height:600px;">
            <div style="width:100%; height:100%;
              background:
                radial-gradient(circle at 30% 30%, rgba(255, 138, 101, 0.95), transparent 42%),
                radial-gradient(circle at 70% 70%, rgba(33, 150, 243, 0.95), transparent 42%),
                radial-gradient(circle at 50% 90%, rgba(67, 160, 71, 0.85), transparent 42%),
                linear-gradient(135deg, #0a0a0a, #1a1a1a);"></div>
          </div>
        </div>
      `,
    });
  },
});