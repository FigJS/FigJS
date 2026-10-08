// Image Cycle: fades through images in one frame with two <img> layers;
// each image is decoded before it shows, and the cycle pauses off screen
// or in a hidden tab. Runtime: image-cycle.js.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-image-cycle',
  plugin: function (editor) {
    const {
      registerComponentPreset, registerComponentSettings, registerDependency, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/presets.css');
    registerDependency('js', '/assets/js/image-cycle.js');

    const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));
    const lines = {
      wrap: (v) => v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('|'),
      unwrap: (v) => v.split('|').map((s) => s.trim()).filter(Boolean).join('\n'),
    };

    registerComponentSettings('image-cycle', {
      title: 'Image cycle',
      description: 'Fades through the images in order. Paused while editing when motion is paused.',
      properties: [
        { key: 'data-cycle-images', attr: true, label: 'Images', type: 'textarea', rows: 5, browse: 'image',
          placeholder: '/assets/images/one.png\n/assets/images/two.png', ...lines,
          help: 'One image per line. Browse adds an image to the end.' },
        { key: 'data-cycle-interval', attr: true, label: 'Each shows for', type: 'range', min: 1, max: 30, step: 0.5, unit: 's', default: 4 },
        { key: '--cycle-fade', label: 'Fade', type: 'range', min: 0, max: 4, step: 0.1, unit: 's', default: 0.8 },
        { key: 'data-cycle-order', attr: true, label: 'Order', type: 'segmented', default: '', options: opt([
          ['', 'In order'], ['shuffle', 'Shuffle']]) },
        { key: 'data-cycle-start', attr: true, label: 'Start on image', type: 'number', min: 1, max: 30, step: 1, default: 1,
          help: 'Counted in the list above; ignored when shuffling.' },
        { type: 'group', label: 'Frame' },
        { key: '--cycle-aspect', label: 'Shape', type: 'aspect', placeholder: '16:9' },
        { key: '--cycle-fit', label: 'Fit', type: 'segmented', default: 'cover', options: opt([
          ['cover', 'Fill'], ['contain', 'Whole image']]) },
        { key: '--cycle-rendering', label: 'Rendering', type: 'segmented', default: 'auto', options: opt([
          ['auto', 'Smooth'], ['pixelated', 'Pixel-exact']]) },
        { key: '--cycle-radius', label: 'Corner radius', type: 'range', min: 0, max: 64, step: 1, unit: 'px', default: 0 },
        { key: '--cycle-bg', label: 'Background', type: 'color' },
      ],
    });

    registerComponentPreset(editor, {
      id: 'image-cycle',
      name: 'Image cycle',
      label: 'Image Cycle',
      category: 'Media',
      media: icons.image,
      classes: ['image-cycle'],
      defaultAttributes: {
        'data-image-cycle': '',
        'data-cycle-images': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%233a6df0'/%3E%3Cstop offset='1' stop-color='%239b51e0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='90' fill='url(%23g)'/%3E%3C/svg%3E|data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='1' y2='0'%3E%3Cstop offset='0' stop-color='%23f2994a'/%3E%3Cstop offset='1' stop-color='%23eb5757'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='90' fill='url(%23g)'/%3E%3C/svg%3E",
        'data-cycle-interval': '4',
      },
      traits: [],
    });
  },
});
