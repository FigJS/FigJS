// Video backgrounds (bg-video.js, bg-video.css).
//   .bg-video tag     a muted video behind an element's content
//   Video Hero block  a section with one, ready for a file
// The page's own video (Page tab > Background) is the same, on the body;
// both use FigJS.bgVideo.fields(page): the file, its still and playback
// are attributes, its look custom properties (so a theme or a device can
// change it, like any style).

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));

  const FOCI = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right']
    .map((p) => ({ id: p, name: p }));
  const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'hard-light',
    'difference', 'luminosity', 'color', 'saturation', 'hue'].map((b) => ({ id: b, name: b }));

  const has = (a) => !!a.readAttr('data-bg-video');
  const phoneOther = (a) => has(a) && a.readAttr('data-bg-video-phone') === 'other';

  // page: the Page tab's fields (the body's video, fixed behind the page).
  function fields(page) {
    return [
      { key: 'data-bg-video', attr: true, label: 'Video', type: 'text', browse: 'video', rerender: true,
        placeholder: '/assets/videos/loop.mp4',
        help: (page ? 'Plays muted behind the whole page, over the page colour; the page image shows while it loads.'
          : 'Plays muted behind the element\'s content, over its background, in its corners.')
          + ' MP4 or WebM. It loads once near the window and plays only while it can be seen.' },
      { key: 'data-bg-video-poster', attr: true, label: 'Still', type: 'text', browse: 'image', when: has,
        placeholder: page ? 'The page image' : 'None',
        help: 'Shown while the video loads, and in its place for visitors who ask for reduced motion or to save data. Without one they see the first frame.' },
      { key: '--bg-video-fit', label: 'Fit', type: 'segmented', default: '', when: has,
        options: opt([['', 'Cover'], ['contain', 'Contain'], ['fill', 'Stretch']]) },
      { key: '--bg-video-focus', label: 'Focus', type: 'select', placeholder: 'center', options: FOCI, when: has,
        help: 'The part kept in view when Cover crops it.' },
      { key: '--bg-video-opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, format: 'percent',
        default: 1, when: has },
      { key: '--bg-video-blur', label: 'Blur', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 0, when: has },
      { key: '--bg-video-blend', label: 'Blend', type: 'select', placeholder: 'normal', options: BLENDS, when: has,
        help: page ? 'With the page colour beneath it.' : 'With the element\'s background beneath it.' },
      { key: '--bg-video-tint', label: 'Tint', type: 'color-alpha', when: has,
        help: page ? 'A colour over the video; the overlay goes over both.' : 'A colour over the video, under the content.' },
      { type: 'group', label: page ? 'Video playback' : 'Playback', when: has },
      { key: 'data-bg-video-play', attr: true, label: 'Play', type: 'segmented', default: '', when: has,
        options: opt([['', 'Loop'], ['once', 'Once']]), help: 'Once: plays through and stays on its last frame.' },
      { key: 'data-bg-video-speed', attr: true, label: 'Speed', type: 'range', min: 0.25, max: 2, step: 0.05,
        format: 'x', default: 1, when: has },
      { key: 'data-bg-video-start', attr: true, label: 'From', type: 'text', placeholder: '0', when: has,
        help: 'Seconds. From and To play (and loop) only that part.' },
      { key: 'data-bg-video-end', attr: true, label: 'To', type: 'text', placeholder: 'The end', when: has },
      ...(page ? [] : [
        { key: 'data-bg-video-attach', attr: true, label: 'Scrolling', type: 'segmented', default: '', when: has,
          options: opt([['', 'Scrolls'], ['fixed', 'Fixed']]),
          help: 'Fixed: the video stays put while the element scrolls over it, like a fixed background image. Inside a box with a transform or filter it scrolls.' },
      ]),
      { key: 'data-bg-video-phone', attr: true, label: 'On phones', type: 'segmented', default: '', rerender: true, when: has,
        options: opt([['', 'Plays'], ['poster', 'Still'], ['other', 'Other video']]),
        help: 'Up to 640px wide. Still saves their data; Other video plays a lighter file.' },
      { key: 'data-bg-video-phone-src', attr: true, label: 'Phone video', type: 'text', browse: 'video', when: phoneOther,
        placeholder: '/assets/videos/loop-small.mp4' },
    ];
  }

  FigJS.bgVideo = { fields };

  window.PresetPlugins = window.PresetPlugins || [];
  window.PresetPlugins.push({
    id: 'preset-bg-video',
    plugin: function (editor) {
      const { registerDependency, registerPresetTag, registerPresetSchemas, registerSimpleBlock, icons } = window.PresetRegistry;

      registerDependency('css', '/assets/css/bg-video.css');
      registerDependency('js', '/assets/js/bg-video.js');

      registerPresetTag('bg-video', {
        description: 'A muted video behind the element\'s content: looping, or once; loads near the window, plays while seen.',
      });
      registerPresetSchemas(['bg-video'], {
        title: 'Video background',
        description: 'A muted video behind the content, over the element\'s background and in its corners. Visitors who ask for reduced motion see the still.',
        properties: fields(false),
      });

      registerSimpleBlock(editor, {
        id: 'video-hero',
        label: 'Video Hero',
        category: 'Sections',
        media: icons.embed,
        html: `
          <section class="bg-video span-bleed flex-center" style="min-height:70vh; padding:64px 20px; text-align:center; color:#fff; background-color:#111; --bg-video-tint:rgba(0, 0, 0, 0.35);">
            <div class="container-narrow">
              <h1>A headline over moving pictures</h1>
              <p>Pick a video in Settings &gt; Video background.</p>
            </div>
          </section>`,
      });
    },
  });
})();
