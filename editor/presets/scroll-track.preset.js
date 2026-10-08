// Two component types, four blocks.
//   scroll-track  slides in a track: data-track-mode="marquee" (looping) or
//                 "carousel" (one slide per view, one slide per swipe); with
//                 the Gallery tag a tap on a slide opens a gallery viewer
//                   .scroll-track > .track-viewport > .track-inner > .track-slide
//                   .scroll-track > .track-arrows, .track-dots, .track-caption
//   scroll-box    a sized box that scrolls (data-box-mode="scroll") or clips
// The structural types take drops only in slides and can't be selected or
// dragged. After any removal, every track keeps at least one slide.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-scroll-track',
  plugin: function (editor) {
    const {
      registerDependency,
      renameDependency,
      registerPresetSchemas,
      registerComponentSettings,
      registerComponentPreset,
      icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/scroll-track.css');
    // Not scroll-track.js: ad blockers' privacy lists block that name.
    registerDependency('js',  '/assets/js/scroll-strip.js');
    renameDependency('/assets/js/scroll-track.js', '/assets/js/scroll-strip.js');
    registerDependency('js',  '/assets/js/carousel-controls.js');

    // ---- Structural helpers --------------------------------------

    function innerOfTrack(track) {
      if (!track) return null;
      const direct = track.components().filter(function (c) {
        return c.getClasses && c.getClasses().indexOf('track-inner') >= 0;
      })[0];
      if (direct) return direct;
      const viaFind = track.find && track.find('.track-inner');
      return (viaFind && viaFind[0]) || null;
    }

    function slidesOf(inner) {
      if (!inner) return [];
      return inner.components().filter(function (c) {
        return c.getClasses && c.getClasses().indexOf('track-slide') >= 0;
      });
    }

    // ---- Structural component types ------------------------------

    function structuralType(name, className) {
      editor.DomComponents.addType(name, {
        isComponent(el) {
          if (el && el.classList && el.classList.contains(className)) {
            return { type: name };
          }
        },
        model: {
          defaults: {
            tagName: 'div',
            classes: [className],
            draggable: false,
            droppable: false,
            selectable: false,
            removable: false,
            copyable: false,
            stylable: false,
            highlightable: false,
          },
        },
      });
    }

    structuralType('track-viewport', 'track-viewport');
    structuralType('track-inner', 'track-inner');

    const attrEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    editor.DomComponents.addType('track-slide', {
      isComponent(el) {
        if (el && el.classList && el.classList.contains('track-slide')) {
          return { type: 'track-slide' };
        }
      },
      model: {
        defaults: {
          tagName: 'div',
          classes: ['track-slide'],
          draggable: false,
          droppable: true,
          selectable: true,
          removable: true,
          copyable: false,
          stylable: true,
          resizable: false,
        },
      },
      view: {
        // An empty slide picks an image (Media, or an upload) on double-click.
        init() {
          this.el.addEventListener('dblclick', (e) => {
            const slide = this.model;
            const FigJS = window.FigJS;
            if (slide.components().length || !FigJS || !FigJS.media || !FigJS.media.pick) return;
            e.preventDefault();
            e.stopPropagation();
            FigJS.media.pick({ kind: 'image' }).then((url) => {
              if (!url || slide.components().length) return;
              const img = slide.append(`<img src="${attrEsc(url)}" alt="">`)[0];
              if (img) editor.select(img);
              FigJS.markUnsaved();
            });
          });
        },
      },
    });

    // ---- Every track keeps a slide ----------------------------------------

    function ensureEveryTrackHasSlide() {
      let wrapper;
      try { wrapper = editor.getWrapper(); } catch (e) { return; }
      if (!wrapper) return;
      let tracks;
      try { tracks = wrapper.find('.scroll-track'); } catch (e) { return; }
      if (!tracks || !tracks.forEach) return;

      tracks.forEach(function (track) {
        const inner = innerOfTrack(track);
        if (!inner) return;
        const slides = slidesOf(inner);
        if (slides.length === 0) {
          try { inner.append('<div class="track-slide"></div>'); } catch (e) {}
        }
      });
    }

    if (!editor.__scrollTrackGuardInstalled) {
      editor.__scrollTrackGuardInstalled = true;
      editor.on('component:remove', function () {
        if (editor.__scrollTrackGuardPending) return;
        editor.__scrollTrackGuardPending = true;
        queueMicrotask(function () {
          editor.__scrollTrackGuardPending = false;
          ensureEveryTrackHasSlide();
        });
      });
    }

    // ---- Schema ------------------------------------------------

    const galleryOn = (a) => a.hasClass('gallery-viewer');
    const carouselOn = (a) => a.readAttr('data-track-mode') === 'carousel';

    registerComponentSettings('scroll-track', {
      title: 'Scroll track',
      properties: [
        { key: '--track-gap',          label: 'Gap',           type: 'range', min: 0, max: 96, step: 2, unit: 'px', default: 16 },
        { key: '--track-pad',          label: 'Padding',       type: 'text',  default: '0' },
        { key: '--track-radius',       label: 'Corner radius', type: 'range', min: 0, max: 32, step: 1, unit: 'px', default: 0 },
        { key: '--track-bg',           label: 'Background',    type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },
        { key: '--track-border-width', label: 'Border width',  type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 0 },
        { key: '--track-border-color', label: 'Border color',  type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },

        // Sizes of the carousel's arrows, dots and caption bar (scroll-track.css).
        { type: 'group', label: 'Carousel controls', when: carouselOn },
        { key: '--track-arrow-size',   label: 'Arrow button',  type: 'range', min: 20, max: 96, step: 2, unit: 'px', default: 40, when: carouselOn },
        { key: '--track-arrow-icon',   label: 'Arrow icon',    type: 'range', min: 8, max: 64, step: 1, unit: 'px', default: 20, when: carouselOn },
        { key: '--track-arrow-inset',  label: 'Arrow inset',   type: 'range', min: 0, max: 64, step: 1, unit: 'px', default: 8, when: carouselOn,
          help: 'Distance of the arrows from the sides.' },
        { key: '--track-dot-size',     label: 'Dot size',      type: 'range', min: 4, max: 24, step: 1, unit: 'px', default: 8, when: carouselOn },
        { key: '--track-dot-gap',      label: 'Dot spacing',   type: 'range', min: 0, max: 32, step: 1, unit: 'px', default: 6, when: carouselOn },
        { key: '--track-dots-inset',   label: 'Dots from bottom', type: 'range', min: 0, max: 64, step: 1, unit: 'px', default: 8, when: carouselOn,
          help: 'Measured above the caption bar when captions show.' },
        { key: '--track-caption-size', label: 'Caption size',  type: 'range', min: 0.6, max: 2, step: 0.05, unit: 'em', default: 0.9, when: carouselOn },
        { key: '--track-caption-gap',  label: 'Caption gap',   type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 8, when: carouselOn,
          help: 'Space between the slides and the caption bar.' },

        // The Gallery tag on the track: its images open in a viewer of
        // their own (subpage.preset.js adds and removes it with the tag).
        { type: 'group', label: 'Gallery' },
        { key: 'gallery-viewer', classToggle: true, label: 'Tap a slide', type: 'toggle', rerender: true,
          text: 'Opens it in a gallery viewer',
          help: 'A tap or click on a slide opens its image full size, in a viewer with every image of the track; swipes, arrows and dots still move the carousel, and closing the viewer leaves it at the image last shown. The Gallery tag (Presets) has the viewer\'s settings.' },
        { type: 'action', label: 'Viewer', text: 'Show and edit', when: galleryOn,
          help: 'Opens the viewer in the canvas with its settings: address, slides, layout and controls.',
          run: (a) => {
            const comp = a.component;
            const viewer = comp.components().find((c) => (c.getClasses() || []).includes('gallery-view'))
              || comp.append('<dialog class="subpage gallery-view" id="gallery"></dialog>')[0];
            editor.select(viewer);
          } },
      ],
    });

    registerComponentSettings('scroll-box', {
      title: 'Scroll box',
      properties: [
        { key: '--box-height',       label: 'Height',        type: 'range', min: 120, max: 900, step: 10, unit: 'px', default: 320 },
        { key: '--box-pad',          label: 'Padding',       type: 'text',  default: '16px' },
        { key: '--box-bg',           label: 'Background',    type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },
        { key: '--box-radius',       label: 'Corner radius', type: 'range', min: 0, max: 32, step: 1, unit: 'px', default: 0 },
        { key: '--box-border-width', label: 'Border width',  type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 0 },
        { key: '--box-border-color', label: 'Border color',  type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },
        { key: '--box-overscroll', label: 'At the end', type: 'segmented', default: 'auto', options: [
          { id: 'auto', name: 'Page keeps scrolling' }, { id: 'contain', name: 'Stop' } ] },
      ],
    });

    // ---- scroll-track -------------------------------------------

    registerComponentPreset(editor, {
      id: 'scroll-track',
      label: 'Scroll Track',
      category: 'Containers',
      media: icons.layers,
      classes: ['scroll-track'],
      droppable: false,
      draggable: true,

      defaultAttributes: {
        'data-track-mode': 'marquee',
        'data-track-speed': '60',
        'data-track-loop': 'true',
      },

      defaultComponents: `
        <div class="track-viewport">
          <div class="track-inner">
            <div class="track-slide"></div>
            <div class="track-slide"></div>
            <div class="track-slide"></div>
          </div>
        </div>
      `,

      traits: [
        { type: 'button', name: 'add_slide', label: 'Slides',
          text: '+ Add slide', category: 'Slides',
          command: function (ed, trait) {
            const comp = trait && (trait.target || (trait.get && trait.get('component')));
            if (!comp) return;
            const inner = innerOfTrack(comp);
            if (!inner) return;
            inner.append('<div class="track-slide"></div>');
            const after = slidesOf(inner);
            const newest = after[after.length - 1];
            if (newest && ed.select) { try { ed.select(newest); } catch (e) {} }

            // A new slide past the visible area is scrolled into view.
            requestAnimationFrame(function () {
              const trackEl = comp.getEl && comp.getEl();
              if (!trackEl) return;
              const vp = trackEl.querySelector(':scope > .track-viewport');
              if (!vp) return;
              const slideEl = newest.getEl && newest.getEl();
              if (!slideEl) return;
              try {
                const vpRect = vp.getBoundingClientRect();
                const slideRect = slideEl.getBoundingClientRect();
                if (slideRect.right > vpRect.right) {
                  vp.scrollLeft += slideRect.right - vpRect.right + 16;
                } else if (slideRect.left < vpRect.left) {
                  vp.scrollLeft -= vpRect.left - slideRect.left + 16;
                }
              } catch (e) {}
            });
          },
        },
        { type: 'button', name: 'remove_last_slide', label: '',
          text: 'Remove last slide', category: 'Slides',
          command: function (ed, trait) {
            const comp = trait && (trait.target || (trait.get && trait.get('component')));
            if (!comp) return;
            const inner = innerOfTrack(comp);
            if (!inner) return;
            const slides = slidesOf(inner);
            if (slides.length <= 1) {
              if (window.FigJS && window.FigJS.setStatus) {
                window.FigJS.setStatus('A track needs at least one slide.', '#ff9800');
              }
              return;
            }
            slides[slides.length - 1].remove();
          },
        },

        { type: 'select', name: 'data-track-mode', label: 'Mode', category: 'Track', options: [
          { id: 'marquee',  name: 'Marquee (auto-scrolling loop)' },
          { id: 'carousel', name: 'Carousel (one slide per view)' },
        ]},
        { type: 'select', name: 'data-track-direction', label: 'Direction', category: 'Track', options: [
          { id: 'ltr', name: 'Left to right' },
          { id: 'rtl', name: 'Right to left' },
        ]},
        { type: 'number', name: 'data-track-speed', label: 'Speed (px/s marquee, s/slide carousel)', category: 'Track' },
        { type: 'checkbox', name: 'data-track-loop',        label: 'Loop / wrap-around', valueTrue: 'true', valueFalse: '', category: 'Track' },
        { type: 'range', name: 'data-track-hover-slow', label: 'Hover slowdown % (100 = stop)', min: 0, max: 100, step: 5, default: 100, category: 'Track' },
        { type: 'range', name: 'data-track-hover-ease', label: 'Hover slowdown ease (ms)', min: 0, max: 1500, step: 50, default: 200, category: 'Track' },
        { type: 'checkbox', name: 'data-track-autoplay',    label: 'Autoplay (carousel)', valueTrue: 'true', valueFalse: '', category: 'Track' },

        { type: 'select', name: 'data-track-controls', label: 'Controls (carousel)', category: 'Carousel', options: [
          { id: 'arrows', name: 'Arrows only' },
          { id: 'dots',   name: 'Dots only' },
          { id: 'both',   name: 'Arrows + dots' },
          { id: 'none',   name: 'None' },
        ]},
        { type: 'checkbox', name: 'data-track-captions', label: 'Caption bar (reads each slide\'s data-caption)', valueTrue: 'true', valueFalse: '', category: 'Carousel' },
        { type: 'number', name: 'data-track-start', label: 'Start on slide', min: 1, step: 1, placeholder: '1', category: 'Carousel' },
      ],

      blocks: [
        {
          id: 'ribbon',
          label: 'Ribbon / Marquee',
          media: icons.layers,
          attributes: {
            'data-track-mode': 'marquee',
            'data-track-loop': 'true',
            'data-track-speed': '60',
            'data-track-hover-slow': '100',
          },
        },
        {
          id: 'carousel',
          label: 'Carousel',
          media: icons.image,
          attributes: {
            'data-track-mode': 'carousel',
            'data-track-loop': 'false',
            'data-track-controls': 'both',
            'data-track-captions': 'true',
          },
        },
      ],

      view: {
        init() {
          this.listenTo(this.model, 'change:attributes', this.syncRuntime);
          // The carousel's rows show only in carousel mode.
          this.listenTo(this.model, 'change:attributes:data-track-mode', () => {
            const FigJS = window.FigJS;
            if (editor.getSelected() === this.model && FigJS && FigJS.componentSettings) FigJS.componentSettings.render(true);
          });
        },
        onRender() { this.syncRuntime(); },
        syncRuntime() {
          const W = this.el && this.el.ownerDocument && this.el.ownerDocument.defaultView;
          const rt = (W && W.ScrollTrack) || window.ScrollTrack;
          if (rt && typeof rt.apply === 'function') {
            try { rt.apply(this.el); } catch (e) { console.error(e); }
          }
        },
      },
    });

    // ---- scroll-box ---------------------------------------------

    registerComponentPreset(editor, {
      id: 'scroll-box',
      label: 'Scroll Box',
      category: 'Containers',
      media: icons.columns3,
      classes: ['scroll-box'],
      droppable: true,
      draggable: true,

      defaultAttributes: { 'data-box-mode': 'scroll' },
      defaultComponents: '',

      traits: [
        { type: 'select', name: 'data-box-mode', label: 'Mode', category: 'Box', options: [
          { id: 'scroll', name: 'Scroll (scrollbars as needed)' },
          { id: 'clip',   name: 'Clip (hide overflow)' },
        ]},
      ],

      blocks: [
        {
          id: 'scroll',
          label: 'Scroll Container',
          media: icons.columns3,
          attributes: { 'data-box-mode': 'scroll' },
        },
        {
          id: 'clip',
          label: 'Overflow Window',
          media: icons.layers,
          attributes: { 'data-box-mode': 'clip' },
        },
      ],
    });
  },
});