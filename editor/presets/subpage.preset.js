// Subpage: a layer over the page (window, full page or side sheet) that
// any link to it opens; it can block the page, lock its scrolling, hide
// it and take an address (#id). Its layer name is its #id; renaming it
// (Layers or Address) moves the page's links along. The canvas opens it
// for editing like an accordion. Runtime subpage.js, styles subpage.css;
// navigation.js routes in-page links through it.
// Gallery viewer: the same subpage base (settings, address, opener,
// address bar, canvas editing) as an empty <dialog class="subpage
// gallery-view"> inside a .gallery-viewer, whose UI gallery.js builds (in
// the canvas too). Each slide (image) can have its own address: a link to
// it opens the viewer there, and in Page#id mode the address bar follows
// the slide shown.
// Gallery tag: the page shows every image, or one cover with a count
// badge (data-gallery-display="single"); a scroll track tagged with it
// opens a slide on tap. Its settings include the viewer's controls, the
// list of slides and their defaults. The cover can be an image of its
// own (data-gallery-cover="separate"), not a slide, and can cycle through
// the images as an Image Cycle does (data-gallery-cycle). Slides follow the
// gallery's --slide-* look (gallery.css) unless they set their own, in
// the Gallery slide block a selected slide (or cover) gets.
// Image zoom (.image-zoom): an image, or each image in a box, opens alone
// in the same viewer (gallery.js makes it, no element in the page), with
// the tag's controls and look; the canvas previews it on request. A
// Gallery on one image offers to switch to it.
// .zoom-box: wheel, pinch and double-click zoom on any element in place
// (zoom-box.js). Viewers and zoom boxes use an image's Full size file
// (data-full-src) when it has one.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-subpage',
  plugin: function (editor) {
    const {
      registerComponentPreset, registerComponentSettings, registerPresetTag,
      registerPresetSchemas, registerSimpleBlock, registerDependency, registerRoleSettings, registerMutexGroup, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/subpage.css');
    registerDependency('js', '/assets/js/subpage.js');
    registerDependency('css', '/assets/css/zoom-box.css');
    registerDependency('js', '/assets/js/zoom-box.js');
    registerDependency('css', '/assets/css/gallery.css');
    registerDependency('js', '/assets/js/gallery.js');

    const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));
    const placeIs = (...ids) => (a) => ids.includes(a.readAttr('data-subpage-place'));
    const blocking = (a) => a.readAttr('data-subpage-mode') !== 'float';

    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    // Addresses: readable, unique ids; renaming one moves the links to it.
    const GENERATED_ID = /^i[a-z0-9]{2,}(-\d+)*$/;
    const slug = (v) => String(v || '').toLowerCase().trim().replace(/^#/, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const readable = (id) => !!id && !GENERATED_ID.test(id);
    function idTaken(id, self) {
      const doc = editor.Canvas.getDocument();
      const node = doc && doc.getElementById(id);
      return !!node && node !== (self.getEl && self.getEl());
    }
    function freeId(base, comp) {
      let id = base;
      for (let n = 2; idTaken(id, comp); n++) id = base + '-' + n;
      return id;
    }
    function relink(from, to) {
      if (!from || from === to) return;
      const wrapper = editor.getWrapper();
      ['href', 'data-link-href'].forEach((name) => {
        wrapper.find(`[${name}="#${from}"]`).forEach((c) => c.addAttributes({ [name]: '#' + to }));
      });
      wrapper.find(`[data-subpage-close="${from}"]`).forEach((c) => c.addAttributes({ 'data-subpage-close': to }));
    }

    const isGallery = (comp) => (comp.getClasses() || []).includes('gallery-view');
    const isOverlay = (comp) => (comp.getClasses() || []).includes('subpage');
    const baseName = (comp) => (isGallery(comp) ? 'gallery' : 'subpage');

    function rename(comp, value, before) {
      const id = freeId(slug(value) || before || baseName(comp), comp);
      if (comp.getAttributes().id !== id) comp.addAttributes({ id });
      relink(before, id);
      comp.trigger('change:name');
      return id;
    }

    // A slide's address is its readable id, or the anchor slug the link
    // picker gave it (its id being one that styles use).
    function slideAddress(c) {
      const a = c.getAttributes();
      return a['data-anchor-slug'] || (readable(a.id) ? a.id : '');
    }
    function setSlideAddress(c, value) {
      const before = slideAddress(c);
      const next = slug(value);
      if (!next || next === before) return before;
      const id = freeId(next, c);
      if (c.getAttributes()['data-anchor-slug']) c.addAttributes({ 'data-anchor-slug': id });
      else c.addAttributes({ id });
      relink(before, id);
      return id;
    }

    // =============================================================
    // Gallery slides
    // =============================================================
    // A cover of its own (data-gallery-cover="separate") shows on the page
    // in the slides' place; it is not a slide.
    const OWN_COVER = '[data-gallery-cover="separate"]';
    const isOwnCover = (c) => !!c && (c.getAttributes() || {})['data-gallery-cover'] === 'separate';

    // A gallery's images, as gallery.js counts them.
    function imagesOf(gallery) {
      if (!gallery) return [];
      return gallery.find('img, [data-full-src]').filter((c) => {
        const node = c.getEl && c.getEl();
        if (!node || node.closest('.gallery-view, [data-gallery-skip], .is-clone, [data-image-cycle], .video-player, ' + OWN_COVER)) return false;
        // Images of a subpage placed inside the gallery are that subpage's.
        const sp = node.closest('.subpage');
        if (sp && gallery.getEl && gallery.getEl() && gallery.getEl().contains(sp)) return false;
        return node.tagName === 'IMG' || !node.querySelector('img');
      });
    }
    const slidesOf = (viewer) => imagesOf(viewer.parent && viewer.parent());

    function ownCoverOf(gallery) {
      return (gallery ? gallery.find(OWN_COVER) : []).find((c) => {
        const node = c.getEl && c.getEl();
        return !!node && !node.closest('.gallery-view');
      }) || null;
    }

    function galleryAround(c) {
      for (let p = c && c.parent && c.parent(); p; p = p.parent && p.parent()) {
        if ((p.getClasses() || []).includes('gallery-viewer')) return p;
      }
      return null;
    }

    // What a slide takes up, as gallery.js: itself, or the largest box
    // around it (a figure, a link, a carousel slide) holding no other.
    function tileOf(gallery, c, others) {
      let t = c;
      for (let p = c.parent && c.parent(); p && p !== gallery; p = p.parent && p.parent()) {
        const cls = p.getClasses() || [];
        if (cls.includes('track-inner') || cls.includes('track-viewport')) break;
        const node = p.getEl && p.getEl();
        if (!node || others.some((o) => o !== c && o.getEl && node.contains(o.getEl()))) break;
        t = p;
      }
      return t;
    }

    const attrEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const imageHtml = (url) => `<img src="${attrEsc(url)}" alt="">`;

    function setImage(c, url) {
      if (c.get('type') === 'image') c.set('src', url);
      else c.addAttributes({ 'data-full-src': url });
    }

    // A new slide after the last: on a carousel a slide of its own (an
    // empty one first), else beside the last slide's tile.
    function addSlide(gallery, url) {
      if ((gallery.getClasses() || []).includes('scroll-track')) {
        const inner = gallery.find('.track-inner')[0];
        if (!inner) return null;
        const empty = inner.components().find((s) => (s.getClasses() || []).includes('track-slide') && !s.components().length);
        if (empty) return empty.append(imageHtml(url))[0];
        const slide = inner.append(`<div class="track-slide">${imageHtml(url)}</div>`)[0];
        return slide ? slide.components().at(0) : null;
      }
      const slides = imagesOf(gallery);
      const last = slides.length ? tileOf(gallery, slides[slides.length - 1], slides) : null;
      if (last) return last.parent().append(imageHtml(url), { at: last.index() + 1 })[0];
      const viewer = viewerOf(gallery);
      const at = viewer ? gallery.components().indexOf(viewer) : gallery.components().length;
      return gallery.append(imageHtml(url), { at })[0];
    }

    const pickImage = () => (FigJS.media && FigJS.media.pick ? FigJS.media.pick({ kind: 'image' }) : Promise.resolve(null));

    // =============================================================
    // Slide look
    // =============================================================
    // The gallery's --slide-* properties are every slide's defaults
    // (gallery.css); a slide's own style overrides one, and clearing it
    // follows the gallery again. Its cover of its own works the same.
    // The shapes every aspect setting offers (registry.js).
    const ASPECTS = window.PresetRegistry.aspectOptions();
    const FITS = opt([['cover', 'Cover'], ['contain', 'Contain'], ['fill', 'Stretch']]);
    const FOCI = opt([['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]);

    // A slide's own look; one corner of its own counts too (css-parts.js
    // reads a corner radius from the shorthand and back).
    const CORNERS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
    const LOOK_KEYS = ['width', 'height', 'aspect-ratio', 'object-fit', 'object-position', 'border-radius', ...CORNERS];

    const adapterOf = (c) => FigJS.settingsUI.componentAdapter(c);
    const ownLook = (c) => LOOK_KEYS.some((k) => adapterOf(c).read(k, { raw: true }) !== '');
    function followGallery(c) {
      const a = adapterOf(c);
      LOOK_KEYS.forEach((k) => { if (a.read(k, { raw: true }) !== '') a.write(k, '', {}); });
    }

    // "Gallery: 4:3": what an empty slide field follows.
    function galleryValue(c, prop, options, natural) {
      const g = galleryAround(c);
      const v = g ? adapterOf(g).read(prop, { raw: true }).trim() : '';
      if (!v) return 'Gallery: ' + natural;
      const hit = (options || []).find((o) => o.id.replace(/\s/g, '') === v.replace(/\s/g, ''));
      return 'Gallery: ' + (hit ? hit.name : v);
    }

    const toGallerySettings = (c) => {
      const g = galleryAround(c);
      if (!g) return;
      editor.select(g);
      editor.runCommand('open-presets-panel');
      const btn = editor.Panels.getButton('views', 'open-presets-panel');
      if (btn) btn.set('active', true);
    };

    // A slide's (or the cover's) own settings, in place of the Image
    // block's size, fit and caption rows.
    function slideSchema(c) {
      const gallery = galleryAround(c);
      const own = isOwnCover(c);
      const list = imagesOf(gallery);
      const at = list.indexOf(c);
      const follow = (prop, options, natural) => () => galleryValue(c, prop, options, natural);
      return {
        id: 'gallery-slide',
        title: own ? 'Gallery cover' : `Gallery slide ${at + 1} of ${list.length}`,
        description: (own
          ? 'Shown on the page in place of the slides; not one of them. '
          : '')
          + 'Empty fields follow the gallery\'s slide defaults. Double-click the image in the canvas to replace it.',
        replaces: ['width', 'aspect-ratio', 'object-fit', 'object-position', 'border-radius', 'data-caption'],
        properties: [
          { key: 'width', label: 'Width', type: 'text', placeholder: follow('--slide-width', null, 'natural'),
            help: '100%, 240px …; empty follows the gallery.' },
          { key: 'height', label: 'Height', type: 'text', placeholder: follow('--slide-height', null, 'natural'),
            help: 'A fixed height crops the picture as Fit says.' },
          { key: 'aspect-ratio', label: 'Aspect', type: 'aspect', placeholder: follow('--slide-aspect', ASPECTS, 'natural'),
            extra: [{ id: 'auto', name: 'Natural' }] },
          { key: 'object-fit', label: 'Fit', type: 'segmented', default: '',
            options: [{ id: '', name: 'Gallery' }, ...FITS] },
          { key: 'object-position', label: 'Focus', type: 'select', placeholder: follow('--slide-focus', FOCI, 'center'),
            options: FOCI },
          { key: 'border-radius', label: 'Corner radius', type: 'text', placeholder: follow('--slide-radius', null, '0px') },
          ...(own ? [] : [
            { type: 'group', label: 'Caption' },
            { key: 'data-caption', attr: true, label: 'Caption', type: 'text', placeholder: 'Alt text',
              help: 'Under the image in the viewer, and in a carousel\'s caption bar.' },
            { key: 'data-gallery-caption', attr: true, label: 'Shown', type: 'segmented', default: '',
              options: opt([['', 'Gallery'], ['on', 'Shown'], ['off', 'Hidden']]),
              help: 'Gallery: as the viewer\'s Captions setting. Hidden also leaves it out of a carousel\'s caption bar.' },
          ]),
          { type: 'group', label: 'Gallery' },
          { type: 'action', label: 'Look', text: 'Follow the gallery', when: () => ownLook(c),
            help: 'Clears this image\'s own size, fit and corners.',
            run: (a, ctx) => { followGallery(c); FigJS.markUnsaved(); a.changed(); ctx.rerender(); } },
          { type: 'action', label: 'Gallery', text: 'Gallery settings', run: () => toGallerySettings(c),
            help: 'The slide defaults, the cover, and the list of slides.' },
        ],
      };
    }

    registerRoleSettings((c) => {
      const gallery = galleryAround(c);
      return !!gallery && (isOwnCover(c) || imagesOf(gallery).includes(c));
    }, slideSchema);

    // Every slide in the gallery's settings: select, replace, remove, add.
    function slidesManager(ctx) {
      const gallery = ctx.adapter.component;
      const wrap = el('div', 'fig-slides');
      const list = el('div', 'fig-slides-list');
      const add = el('button', 'fig-f-action', '+ Add image');
      add.type = 'button';
      add.title = 'Choose or upload an image for a new slide';
      wrap.append(list, add);

      const changed = () => { FigJS.markUnsaved(); ctx.adapter.changed(); refresh(); };
      const iconButton = (icon, title, onClick) => {
        const b = el('button', 'fig-icon-btn fig-slide-tool');
        b.type = 'button';
        b.innerHTML = icon;
        b.title = title;
        b.addEventListener('click', onClick);
        return b;
      };
      const label = (c) => {
        const a = c.getAttributes() || {};
        const src = String(c.get('src') || a.src || a['data-full-src'] || '');
        if (/^data:/.test(src)) return a.alt || 'Placeholder';
        return src.split(/[?#]/)[0].split('/').pop() || a.alt || 'No image';
      };

      function refresh() {
        list.textContent = '';
        const slides = imagesOf(gallery);
        const cover = ownCoverOf(gallery);
        if (!slides.length) list.appendChild(el('div', 'fig-empty', 'No images yet.'));
        slides.forEach((c, i) => {
          const row = el('div', 'fig-slide');
          const thumb = el('button', 'fig-slide-thumb');
          thumb.type = 'button';
          thumb.title = 'Select this slide: its own size, fit and caption';
          const img = el('img');
          img.alt = '';
          img.src = c.get('src') || (c.getAttributes() || {})['data-full-src'] || '';
          thumb.appendChild(img);
          thumb.addEventListener('click', () => editor.select(c));
          const name = el('span', 'fig-slide-name', label(c));
          name.title = name.textContent;
          const marks = [];
          if (!cover && (c.getAttributes() || {})['data-gallery-cover'] != null) marks.push('cover');
          if (ownLook(c)) marks.push('own look');
          const meta = el('span', 'fig-slide-meta', marks.join(', '));
          const replace = iconButton(FigJS.icons.browse, 'Replace the image', () => {
            pickImage().then((url) => { if (url) { setImage(c, url); changed(); } });
          });
          const remove = iconButton(FigJS.icons.close, 'Remove this slide', () => {
            tileOf(gallery, c, slides).remove();
            changed();
          });
          row.append(thumb, el('span', 'fig-slide-num', String(i + 1)), name, meta, replace, remove);
          list.appendChild(row);
        });
      }

      add.addEventListener('click', () => {
        pickImage().then((url) => { if (url && addSlide(gallery, url)) changed(); });
      });
      refresh();
      return { el: wrap, refresh };
    }

    // The defaults every slide follows, set on the gallery.
    const slideDefaults = [
      { key: '--slide-width', label: 'Width', type: 'text', placeholder: 'Natural',
        help: 'Each slide image: 100%, 240px … Empty: its natural size, within the gallery.' },
      { key: '--slide-height', label: 'Height', type: 'text', placeholder: 'Natural',
        help: 'A fixed height crops the picture as Fit says; empty follows the width and Aspect.' },
      { key: '--slide-aspect', label: 'Aspect', type: 'aspect', placeholder: 'Natural' },
      { key: '--slide-fit', label: 'Fit', type: 'segmented', options: FITS,
        help: 'How a picture fills a box of another shape: Cover crops, Contain shows it whole.' },
      { key: '--slide-focus', label: 'Focus', type: 'select', placeholder: 'Center',
        options: FOCI.filter((o) => o.id !== 'center'),
        help: 'The part of the picture Cover keeps.' },
      { key: '--slide-radius', label: 'Corner radius', type: 'range', min: 0, max: 64, step: 1, unit: 'px', default: 0 },
      { type: 'action', label: 'Own looks', text: 'All follow these',
        when: (a) => imagesOf(a.component).some(ownLook),
        help: 'Clears every slide\'s own size, fit and corners, so all follow the defaults above. A cover of its own keeps its look.',
        run: (a, ctx) => {
          imagesOf(a.component).forEach(followGallery);
          FigJS.markUnsaved();
          a.changed();
          ctx.rerender();
        } },
    ];

    // Every slide with its address; a thumbnail shows that slide in the canvas.
    function slidesField(ctx) {
      const viewer = ctx.adapter.component;
      const wrap = el('div', 'fig-slides');
      const list = el('div', 'fig-slides-list');
      const name = el('button', 'fig-f-action', 'Address the rest');
      name.type = 'button';
      name.title = 'Gives every slide without an address one from this viewer\'s address';
      wrap.append(list, name);

      const show = (i) => {
        const win = editor.Canvas.getWindow();
        const node = viewer.getEl && viewer.getEl();
        if (win && win.SiteGallery && node) win.SiteGallery.showSlide(node, i);
      };

      function refresh() {
        list.textContent = '';
        const slides = slidesOf(viewer);
        if (!slides.length) list.appendChild(el('div', 'fig-empty', 'No images in this gallery yet.'));
        slides.forEach((c, i) => {
          const row = el('div', 'fig-slide');
          const thumb = el('button', 'fig-slide-thumb');
          thumb.type = 'button';
          thumb.title = `Show slide ${i + 1} in the canvas`;
          const img = el('img');
          img.alt = '';
          img.src = c.get('src') || c.getAttributes().src || c.getAttributes()['data-full-src'] || '';
          thumb.appendChild(img);
          thumb.addEventListener('click', () => show(i));
          const input = el('input', 'fig-f-input');
          input.type = 'text';
          input.spellcheck = false;
          input.placeholder = 'No address';
          input.value = slideAddress(c);
          input.addEventListener('focus', () => show(i));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { input.value = slideAddress(c); input.blur(); }
          });
          input.addEventListener('change', () => {
            input.value = setSlideAddress(c, input.value);
            FigJS.markUnsaved();
            ctx.adapter.changed();
          });
          row.append(thumb, el('span', 'fig-slide-num', String(i + 1)), input);
          list.appendChild(row);
        });
        name.hidden = !slides.some((c) => !slideAddress(c));
      }

      name.addEventListener('click', () => {
        const id = viewer.getAttributes().id;
        const base = readable(id) ? id : 'slide';
        slidesOf(viewer).forEach((c, i) => { if (!slideAddress(c)) setSlideAddress(c, `${base}-${i + 1}`); });
        FigJS.markUnsaved();
        ctx.adapter.changed();
        refresh();
      });

      refresh();
      return { el: wrap, refresh };
    }

    // The viewer's controls: on the viewer, and in the Gallery tag's
    // settings as rows editing the viewer. multi: only with several images.
    const viewerControls = (zooms) => [
      { key: 'data-gallery-arrows', attr: true, label: 'Arrows', type: 'segmented', default: '', multi: true,
        options: opt([['', 'Shown'], ['off', 'Hidden']]), help: 'Hidden: arrow keys and swipes still move between slides.' },
      { key: 'data-gallery-count', attr: true, label: 'Counter', type: 'segmented', default: '', multi: true,
        options: opt([['', 'Shown'], ['off', 'Hidden']]) },
      { key: 'data-gallery-captions', attr: true, label: 'Captions', type: 'segmented', default: '',
        options: opt([['', 'Shown'], ['off', 'Hidden']]), help: 'From the image Caption, a figure caption or the alt text.' },
      { key: 'data-gallery-strip', attr: true, label: 'Thumbnails', type: 'segmented', default: '', multi: true,
        options: opt([['', 'Hidden'], ['on', 'Shown']]), help: 'A strip of the gallery under the image, to jump between slides.' },
      { key: 'data-gallery-loop', attr: true, label: 'At the ends', type: 'segmented', default: '', multi: true,
        options: opt([['', 'Wrap around'], ['off', 'Stop']]) },
      { key: 'data-gallery-zoom', attr: true, label: 'Zoom', type: 'segmented', default: '', rerender: true,
        options: opt([['', 'On'], ['off', 'Off']]) },
      { key: 'data-gallery-zoom-max', attr: true, label: 'Max zoom', type: 'range', min: 1.5, max: 16, step: 0.5, default: 6, when: zooms },
      { key: 'data-gallery-zoom-buttons', attr: true, label: 'Zoom buttons', type: 'segmented', default: '',
        options: opt([['', 'Shown'], ['off', 'Hidden']]), when: zooms },
    ];

    // =============================================================
    // Openers
    // =============================================================
    // The elements that open an overlay (FigJS.links.openersOf, as the site
    // routes links): select one, stop it opening this, or pick a new one.
    function openerName(node, model) {
      const text = (node.getAttribute('aria-label') || node.textContent || node.getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
      return text ? (text.length > 28 ? text.slice(0, 27) + '…' : text) : model.getName();
    }

    function openersField(ctx) {
      const comp = ctx.adapter.component;
      const wrap = el('div', 'fig-slides');
      const list = el('div', 'fig-slides-list');
      // A new opener: picked on the page, or given by its Element ID (for one
      // that is hard to click).
      const adding = el('div', 'fig-opener-add');
      const add = el('button', 'fig-f-action', 'Pick on page');
      add.type = 'button';
      add.title = 'The next element you select on the page (or in Layers) opens this';
      const idInput = el('input', 'fig-f-input');
      idInput.type = 'text';
      idInput.placeholder = 'or its Element ID';
      idInput.spellcheck = false;
      const idAdd = el('button', 'fig-f-action', 'Add');
      idAdd.type = 'button';
      adding.append(add, idInput, idAdd);
      wrap.append(list, adding);

      function refresh() {
        list.textContent = '';
        const node = comp && comp.getEl && comp.getEl();
        const found = node && FigJS.links ? FigJS.links.openersOf(node) : [];
        if (!found.length) {
          const open = comp && (comp.getClasses() || []).includes('is-open');
          list.appendChild(el('div', 'fig-empty', open
            ? 'Nothing on the page opens it; it is open when the page loads.'
            : 'Nothing on the page opens it yet.'));
        }
        found.forEach(({ node: n, model, id, via }) => {
          const row = el('div', 'fig-slide');
          const name = el('button', 'fig-f-action fig-layer-pick', openerName(n, model));
          name.type = 'button';
          name.title = 'Select it';
          name.addEventListener('click', () => editor.select(model));
          const meta = el('span', 'fig-slide-name', '#' + id + (via === 'inside' ? ' · inside it' : via === 'slide' ? ' · a slide' : ''));
          const drop = el('button', 'fig-f-action fig-slide-tool', '×');
          drop.type = 'button';
          drop.title = 'Stop it opening this: removes its link';
          drop.addEventListener('click', () => {
            FigJS.links.unlink(model);
            FigJS.markUnsaved();
            ctx.adapter.changed();
            refresh();
          });
          row.append(name, meta, drop);
          list.appendChild(row);
        });
      }

      add.addEventListener('click', () => {
        if (FigJS.canvas.closeEditOpen) FigJS.canvas.closeEditOpen(comp);
        FigJS.linkPicker.pickOpener(comp);
      });
      const addById = () => {
        const L = FigJS.linkPicker;
        const name = idInput.value.trim().replace(/^#/, '');
        if (!name) return;
        const opener = L.byId(name);
        if (!opener) {
          FigJS.setStatus('No element on this page has the Element ID ' + name + '.', '#ff9800');
          return;
        }
        if (L.within(opener, comp)) {
          FigJS.setStatus('That is inside this subpage: its links are its own navigation.', '#ff9800');
          return;
        }
        L.link(opener, comp);
        idInput.value = '';
        FigJS.markUnsaved();
        ctx.adapter.changed();
        refresh();
      };
      idAdd.addEventListener('click', addById);
      idInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addById();
      });
      refresh();
      return { el: wrap, refresh };
    }

    // =============================================================
    // Placement
    // =============================================================
    // A subpage shows over the page wherever it sits in it, but the page's
    // tree still holds it: hovering it counts as hovering what holds it
    // (hover effects play behind), it hides wherever that is hidden, and it
    // takes that's text styles. So it belongs at the page level, or in
    // another subpage. (Clicks in it stay its own either way, as on the site.)
    const isSubpage = (c) => (c.getClasses() || []).includes('subpage');
    // What holds it, unless that is the page, another subpage or its body.
    function holderOf(comp) {
      const p = comp.parent && comp.parent();
      if (!p || p === editor.getWrapper() || isSubpage(p)) return null;
      const pp = p.parent && p.parent();
      if (pp && isSubpage(pp) && (p.getClasses() || []).includes('subpage-body')) return null;
      return p;
    }

    // To the end of the page, or of the body of the subpage it is in.
    function moveOut(comp) {
      const wrapper = editor.getWrapper();
      let dest = wrapper;
      for (let a = comp.parent && comp.parent(); a && a !== wrapper; a = a.parent && a.parent()) {
        if (!isSubpage(a)) continue;
        dest = a.components().find((c) => (c.getClasses() || []).includes('subpage-body')) || a;
        break;
      }
      const at = dest.components().length;
      if (typeof comp.move === 'function') comp.move(dest, { at });
      else {
        comp.remove({ temporary: true });
        dest.append(comp, { at });
      }
      return dest;
    }

    function placementField(ctx) {
      const comp = ctx.adapter.component;
      const host = el('div', 'fig-nest-check');
      function refresh() {
        host.textContent = '';
        const holder = comp && holderOf(comp);
        if (!holder) return;
        const node = comp.getEl && comp.getEl();
        const opener = !!node && !!FigJS.links && FigJS.links.openersOf(node).some((o) => o.node.contains(node));
        const name = holder.getName();
        const note = el('div', 'fig-layer-note');
        note.appendChild(el('p', '', `It sits inside ${name}${opener ? ', one of its openers' : ''}: hovering it counts as hovering ${name} (its hover effects play behind it), it hides wherever ${name} is hidden, and it takes ${name}'s text styles.`));
        const move = el('button', 'fig-f-action', 'Move to the page level');
        move.type = 'button';
        move.title = 'Its address, openers and settings stay; it no longer takes the text styles of what held it';
        move.addEventListener('click', () => {
          moveOut(comp);
          FigJS.markUnsaved();
          ctx.adapter.changed();
          if (FigJS.componentSettings) FigJS.componentSettings.render(true);
          FigJS.setStatus('Moved ' + comp.getName() + ' to the page level.', '#4caf50');
        });
        note.appendChild(move);
        host.appendChild(note);
      }
      refresh();
      return { el: host, refresh };
    }

    // =============================================================
    // Settings shared by subpages and gallery viewers
    // =============================================================
    function overlaySettings(kind) {
      const gallery = kind === 'gallery';
      const pick = (sub, gal) => (gallery ? gal : sub);
      const zooms = (a) => a.readAttr('data-gallery-zoom') !== 'off';
      return [
        ...(gallery ? [] : [{ label: 'Placement', build: placementField, wide: true }]),
        { key: 'id', attr: true, noCopy: true, label: 'Address', type: 'text', placeholder: pick('subpage', 'gallery'), wrap: slug,
          help: pick('Its #id: links to #this open it.', 'Its #id: links to #this open the viewer at the first slide.')
            + ' Renaming (here or in Layers) updates the links on this page.',
          onCommit: (a, value, before) => rename(a.component, value, before) },
        { key: 'is-open', classToggle: true, label: 'State', type: 'segmented', default: '',
          options: opt([['', 'Closed'], ['true', 'Open']]),
          help: pick('Open: the page loads with it open.', 'Open: the page loads with the viewer open at the first slide.') },
        { label: 'Openers', build: openersField, wide: true,
          help: pick('What opens it on this page: a link to its address, or to something inside it. Each is tagged in the canvas while this is selected.',
            'What opens it on this page besides a click on the gallery\'s images: a link to its address or to a slide\'s. Each is tagged in the canvas while this is selected.')
            + ' Its name selects it (Settings > Link edits where it goes); × stops it opening this. Add one by picking it on the page, or by its Element ID when it is hard to click.' },
        { key: 'data-subpage-hash', attr: true, label: 'Address bar', type: 'segmented', default: '',
          options: opt([['', 'Page'], ['on', 'Page#id']]),
          help: pick('Page#id: the address opens it, so it can be shared, and Back closes it.',
            'Page#id: the address follows the slide shown (its own address, or the viewer\'s), opens it there, and Back closes it.') },

        ...(gallery ? [
          { type: 'group', label: 'Slides' },
          { label: 'Addresses', wide: true, build: slidesField,
            help: 'Each image of the gallery. A link to a slide\'s address opens the viewer at it.' },
        ] : []),

        { type: 'group', label: 'Layout' },
        { key: 'data-subpage-place', attr: true, label: 'Place', type: 'segmented', default: '', rerender: true,
          options: opt([['', 'Window'], ['full', 'Full'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom']]) },
        { key: '--sp-width', label: 'Width', type: 'range', min: 240, max: 2000, step: 10, unit: 'px', default: pick(720, 960), when: placeIs('', 'center') },
        { key: '--sp-height', label: pick('Max height', 'Height'), type: 'range', min: 20, max: 100, step: 1, unit: '%', default: pick(90, 85), when: placeIs('', 'center') },
        { key: '--sp-side', label: 'Width', type: 'range', min: 200, max: 900, step: 10, unit: 'px', default: 420, when: placeIs('left', 'right') },
        { key: '--sp-sheet', label: pick('Max height', 'Height'), type: 'range', min: 20, max: 100, step: 1, unit: '%', default: 70, when: placeIs('bottom') },
        ...(gallery ? [] : [
          { key: 'data-subpage-bar', attr: true, label: 'Top bar', type: 'segmented', default: '', rerender: true,
            options: opt([['', 'Title'], ['close', 'Close only'], ['none', 'None']]),
            help: 'None: it closes with Esc, a click outside, or any element marked data-subpage-close.' },
          { key: 'data-subpage-title-align', attr: true, label: 'Title', type: 'segmented', default: '',
            when: (a) => !a.readAttr('data-subpage-bar'),
            options: opt([['', 'Start'], ['center', 'Centre'], ['end', 'End']]),
            help: 'It wraps across the bar\'s width; Centre centres it in the whole bar, close button aside. One line with an ellipsis: give the title the Single line tag.' },
        ]),

        ...(gallery ? [
          { type: 'group', label: 'Controls' },
          ...viewerControls(zooms),
        ] : []),

        { type: 'group', label: 'Page behind' },
        { key: 'data-subpage-mode', attr: true, label: 'While open', type: 'segmented', default: '', rerender: true,
          options: opt([['', 'Blocked'], ['float', 'Usable']]),
          help: 'Blocked: the page behind cannot be clicked or tabbed into. Usable: this floats over a working page.' },
        { key: 'data-subpage-scroll', attr: true, label: 'Scrolling', type: 'segmented', default: '',
          options: opt([['', 'Auto'], ['lock', 'Locked'], ['free', 'Free']]),
          help: 'Auto locks the page while it is blocked.' },
        { key: 'data-subpage-behind', attr: true, label: 'Visibility', type: 'segmented', default: '',
          options: opt([['', 'Shown'], ['hide', 'Hidden']]),
          help: 'Hidden: the page disappears until this closes.' },
        { key: '--sp-backdrop', label: 'Backdrop', type: 'color-alpha', default: pick('rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.75)'), when: blocking },
        { key: '--sp-backdrop-blur', label: 'Backdrop blur', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 0, when: blocking },

        { type: 'group', label: 'Closing' },
        { key: 'data-subpage-esc', attr: true, label: 'Esc', type: 'toggle', valueTrue: '', valueFalse: 'off', text: 'Esc closes it' },
        { key: 'data-subpage-outside', attr: true, label: 'Outside', type: 'toggle', valueTrue: '', valueFalse: 'off',
          text: pick('A click outside closes it', 'A click outside or beside the image closes it') },
        ...(gallery ? [] : [
          { key: 'data-subpage-media', attr: true, label: 'Media', type: 'segmented', default: '',
            options: opt([['', 'Stop'], ['keep', 'Keep playing']]),
            help: 'Stop pauses video and audio and unloads embeds and games when it closes; they load again when it opens.' },
          { key: 'data-subpage-reopen', attr: true, label: 'Reopens', type: 'segmented', default: '',
            options: opt([['', 'At the top'], ['keep', 'Where it was left']]),
            help: 'At the top: closing scrolls it (and the scroll boxes inside it) back to the start, and a carousel back to its start slide. Where it was left: it keeps its place.' },
        ]),

        { type: 'group', label: 'Motion' },
        { key: 'data-subpage-motion', attr: true, label: 'Opens with', type: 'select', placeholder: 'Auto (by place)',
          options: opt([['fade', 'Fade'], ['zoom', 'Zoom'], ['rise', 'Rise'], ['none', 'None']]) },
        { key: '--sp-speed', label: 'Speed', type: 'range', min: 0, max: 800, step: 10, unit: 'ms', default: 220 },

        { type: 'group', label: 'Box' },
        { key: '--sp-bg', label: 'Background', type: 'color-alpha', default: pick(undefined, 'rgba(8, 8, 8, 0.94)') },
        { key: '--sp-fg', label: 'Text', type: 'color', default: pick(undefined, '#ffffff') },
        { key: '--sp-border-color', label: 'Border', type: 'color-alpha' },
        { key: '--sp-border-width', label: 'Border width', type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: pick(1, 0) },
        { key: '--sp-radius', label: 'Corner radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 0 },
        ...(gallery ? [
          { key: '--gallery-nav-bg', label: 'Buttons', type: 'color-alpha', default: 'rgba(0, 0, 0, 0.45)' },
          { key: '--gallery-thumb', label: 'Thumbnail size', type: 'range', min: 32, max: 120, step: 2, unit: 'px', default: 56 },
        ] : [
          { key: '--sp-pad', label: 'Content padding', type: 'spacing', default: '20px' },
          { key: '--sp-bar-bg', label: 'Top bar', type: 'color-alpha' },
          { key: '--sp-bar-pad', label: 'Top bar padding', type: 'spacing', default: '12px 16px' },
        ]),
        { key: '--sp-shadow', label: 'Shadow', type: 'shadow' },
        { key: '--sp-z', label: 'Layer', type: 'range', min: 1, max: 10000, step: 1, default: 1000,
          help: `Stacking order of a Usable ${pick('subpage', 'viewer')}; a Blocked one is always on top.` },
      ];
    }

    const nameByAddress = (fallback) => function () {
      const id = (this.getAttributes() || {}).id;
      return readable(id) ? '#' + id : fallback;
    };

    // =============================================================
    // Subpage
    // =============================================================
    registerComponentSettings('subpage', {
      title: 'Subpage',
      description: 'Any link to it, or to something inside it, opens it: Openers lists them, and tags them in the canvas while this is selected. Selecting it, or anything inside, opens it in the canvas until its Show closed tab is clicked.',
      properties: overlaySettings('subpage'),
    });

    registerComponentPreset(editor, {
      id: 'subpage',
      name: 'Subpage',
      label: 'Subpage (overlay)',
      category: 'Interactive',
      media: icons.layers,
      tagName: 'dialog',
      classes: ['subpage'],
      droppable: false,
      partSettings: true,
      resizable: false,
      defaultAttributes: { id: 'subpage' },
      methods: { getName: nameByAddress('Subpage') },
      defaultComponents: `
        <div class="subpage-bar">
          <span class="subpage-title">Subpage</span>
          <button type="button" class="subpage-close" aria-label="Close">&times;</button>
        </div>
        <div class="subpage-body">
          <p>Subpage content.</p>
        </div>
      `,
    });

    // =============================================================
    // Gallery viewer
    // =============================================================
    const VIEWER = '<dialog class="subpage gallery-view" id="gallery"></dialog>';
    const viewerOf = (comp) => comp.components().find(isGallery);
    const isVoid = (comp) => /^(img|video|audio|source|input|br|hr)$/i.test(comp.get('tagName') || '');

    registerComponentSettings('gallery-view', {
      title: 'Gallery viewer',
      description: 'A subpage that shows its gallery\'s images one at a time. Clicking an image of the gallery opens it there; the canvas shows it with the slide picked below or selected in Layers, until its Show closed tab is clicked.',
      properties: overlaySettings('gallery'),
    });

    registerComponentPreset(editor, {
      id: 'gallery-view',
      name: 'Gallery viewer',
      label: 'Gallery viewer',
      tagName: 'dialog',
      classes: ['subpage', 'gallery-view'],
      block: false,
      droppable: false,
      draggable: false,
      copyable: false,
      resizable: false,
      defaultAttributes: { id: 'gallery' },
      methods: { getName: nameByAddress('Gallery viewer') },
    });

    registerPresetTag('gallery-viewer', {
      group: 'Viewer',
      description: 'Images inside open full size in the gallery viewer, the others one click or swipe away. The page can show every image or one cover with the count.',
    });

    const isTrack = (comp) => (comp.getClasses() || []).includes('scroll-track');
    // One image on the page: containers only (an image alone or a scroll track has its own look).
    const onPage = (a) => !isVoid(a.component) && !isTrack(a.component);
    const singleOn = (a) => onPage(a) && a.readAttr('data-gallery-display') === 'single';
    const stackOn = (a) => singleOn(a) && a.readAttr('data-gallery-stack') === 'on';
    const badgeOn = (a) => singleOn(a) && a.readAttr('data-gallery-badge') !== 'off';
    const cycleOn = (a) => singleOn(a) && !!a.readAttr('data-gallery-cycle');

    // Viewer rows edit the gallery's viewer; an image tagged on its own
    // carries them itself (gallery.js hands them to the viewer it makes).
    const viewerAdapter = (a) => {
      const viewer = isVoid(a.component) ? null : viewerOf(a.component);
      return viewer ? FigJS.settingsUI.componentAdapter(viewer) : a;
    };
    const viewerRow = (p) => ({
      ...p, noCopy: true, adapter: viewerAdapter,
      when: (a) => (!p.multi || !isVoid(a.component)) && (!p.when || p.when(a)),
    });

    // Cover: an image of its own (not a slide), or the slide marked
    // data-gallery-cover; none marked means the first, so it follows
    // reordering.
    const marked = (c) => (c.getAttributes() || {})['data-gallery-cover'] != null;

    // A cover of its own takes the place and look of the cover it
    // replaces; the media picker then chooses its picture.
    function makeOwnCover(gallery) {
      const list = imagesOf(gallery);
      const before = list[Math.max(0, list.findIndex(marked))] || null;
      const tile = before ? tileOf(gallery, before, list) : null;
      // Synchronous writes share one undo entry.
      list.forEach((c) => { if (marked(c)) c.removeAttributes(['data-gallery-cover']); });
      const cover = (tile ? tile.parent() : gallery)
        .append('<img data-gallery-cover="separate" alt="">', { at: tile ? tile.index() : 0 })[0];
      const look = before ? before.getStyle() : null;
      if (cover && look && Object.keys(look).length) cover.setStyle({ ...look });
      return pickImage().then((url) => {
        if (url && cover) cover.set('src', url);
        return cover;
      });
    }

    function coverField(ctx) {
      const comp = ctx.adapter.component;
      const wrap = el('div', 'fig-cover-field');
      const sel = el('select', 'fig-f-input');
      const edit = el('button', 'fig-f-action', 'Edit cover');
      edit.type = 'button';
      edit.title = 'Select the cover: its picture, size and fit';
      wrap.append(sel, edit);
      function refresh() {
        const list = imagesOf(comp);
        const own = ownCoverOf(comp);
        sel.textContent = '';
        const first = el('option', null, 'Its own image (not a slide)');
        first.value = 'own';
        sel.appendChild(first);
        list.forEach((c, i) => {
          const a = c.getAttributes() || {};
          const file = String(c.get('src') || a.src || a['data-full-src'] || '').split(/[?#]/)[0].split('/').pop();
          const name = /^data:/.test(file) ? '' : (a.alt || file);
          const o = el('option', null, `Slide ${i + 1}${name ? ' · ' + name : ''}`);
          o.value = String(i);
          sel.appendChild(o);
        });
        sel.value = own ? 'own' : String(Math.max(0, list.findIndex(marked)));
        edit.hidden = !own;
      }
      const done = () => { FigJS.markUnsaved(); ctx.adapter.changed(); refresh(); };
      sel.addEventListener('change', () => {
        if (sel.value === 'own') {
          if (!ownCoverOf(comp)) makeOwnCover(comp).then(done);
          return;
        }
        const pick = Number(sel.value);
        const own = ownCoverOf(comp);
        if (own) own.remove();
        imagesOf(comp).forEach((c, i) => {
          const want = i === pick && pick > 0;
          if (want && !marked(c)) c.addAttributes({ 'data-gallery-cover': 'true' });
          else if (!want && marked(c)) c.removeAttributes(['data-gallery-cover']);
        });
        done();
      });
      edit.addEventListener('click', () => {
        const own = ownCoverOf(comp);
        if (own) editor.select(own);
      });
      refresh();
      return { el: wrap, refresh };
    }

    function editViewer(a) {
      const comp = a.component;
      if (isVoid(comp)) {
        FigJS.setStatus('An image on its own uses the standard viewer; tag a container to edit one.', '#ff9800');
        return;
      }
      const viewer = viewerOf(comp) || comp.append(VIEWER)[0];
      editor.select(viewer);
    }

    registerPresetSchemas(['gallery-viewer'], {
      title: 'Gallery',
      description: 'Clicking an image inside opens its viewer at the Full size file (or the image itself); data-gallery-skip leaves an image out. On a scroll track a tap anywhere on a slide opens it. The viewer is a subpage of its own, with an address per slide.',
      properties: [
        { type: 'group', label: 'On the page', when: onPage },
        { key: 'data-gallery-display', attr: true, label: 'Shows', type: 'segmented', default: '', rerender: true, when: onPage,
          options: opt([['', 'Every image'], ['single', 'One image']]),
          help: 'One image: only the cover shows, with the number of images; clicking it opens the gallery. Selecting a hidden image (in Layers) shows them all in the canvas until Show one image is clicked.' },
        { label: 'Cover', build: coverField, when: singleOn, wide: true,
          help: 'What the page shows. Its own image is not a slide: it isn\'t counted and opens the gallery at the first slide. A slide as cover stays in the viewer, in its order.' },
        { key: 'data-gallery-stack', attr: true, label: 'Stack', type: 'toggle', valueTrue: 'on', valueFalse: '', rerender: true, when: singleOn,
          text: 'Edges of more images behind the cover' },
        { key: '--gallery-stack-color', label: 'Edges', type: 'color-alpha', default: 'rgba(255, 255, 255, 0.35)', when: stackOn },
        { key: '--gallery-stack-offset', label: 'Edge offset', type: 'range', min: 2, max: 20, step: 1, unit: 'px', default: 6, when: stackOn },

        { type: 'group', label: 'Cover cycle', when: singleOn },
        { key: 'data-gallery-cycle', attr: true, label: 'Cycle', type: 'segmented', default: '', rerender: true, when: singleOn,
          options: opt([['', 'Off'], ['on', 'Always'], ['hover', 'On hover']]),
          help: 'The cover fades through the gallery\'s images in place, as an Image Cycle does, starting from the cover; a click opens the gallery at the image shown. Always pauses off screen and for visitors who ask for reduced motion; On hover returns to the cover when the pointer leaves.' },
        { key: 'data-gallery-cycle-interval', attr: true, label: 'Each shows for', type: 'range', min: 0.5, max: 30, step: 0.5, unit: 's', default: 4, when: cycleOn },
        { key: '--gallery-cycle-fade', label: 'Fade', type: 'range', min: 0, max: 4, step: 0.1, unit: 's', default: 0.8, when: cycleOn },
        { key: 'data-gallery-cycle-order', attr: true, label: 'Order', type: 'segmented', default: '', when: cycleOn,
          options: opt([['', 'In order'], ['shuffle', 'Shuffle']]) },

        { type: 'group', label: 'Slides', when: (a) => !isVoid(a.component) },
        { label: 'Images', build: slidesManager, wide: true, when: (a) => !isVoid(a.component),
          help: 'Every slide: the thumbnail selects it (its own size, fit and caption). Double-click any image, or an empty carousel slide, in the canvas to choose a picture.' },
        ...slideDefaults.map((p) => ({ ...p, when: (a) => !isVoid(a.component) && (!p.when || p.when(a)) })),

        { type: 'group', label: 'Count badge', when: singleOn },
        { key: 'data-gallery-badge', attr: true, label: 'Badge', type: 'segmented', default: '', rerender: true, when: singleOn,
          options: opt([['', 'Icon + label'], ['text', 'Label'], ['off', 'Hidden']]),
          help: 'A button over the cover with the number of images; it opens the gallery too, and keyboards reach it.' },
        { key: 'data-gallery-badge-text', attr: true, label: 'Label', type: 'text', placeholder: '{n}', when: badgeOn,
          help: '{n} is the number of images, {more} the number besides the cover: "{n} photos", "+{more}".' },
        { key: 'data-gallery-badge-place', attr: true, label: 'Place', type: 'select', placeholder: 'Bottom right', when: badgeOn,
          options: opt([['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left'], ['center', 'Center']]) },
        { key: 'data-gallery-badge-show', attr: true, label: 'Shown', type: 'segmented', default: '', when: badgeOn,
          options: opt([['', 'Always'], ['hover', 'On hover']]), help: 'On hover: touch screens, which have no hover, always show it.' },
        { key: '--gallery-badge-bg', label: 'Background', type: 'color-alpha', default: 'rgba(0, 0, 0, 0.6)', when: badgeOn },
        { key: '--gallery-badge-fg', label: 'Text colour', type: 'color', default: '#ffffff', when: badgeOn },
        { key: '--gallery-badge-size', label: 'Size', type: 'range', min: 9, max: 32, step: 1, unit: 'px', default: 13, when: badgeOn },
        { key: '--gallery-badge-radius', label: 'Corner radius', type: 'range', min: 0, max: 20, step: 1, unit: 'px', default: 0, when: badgeOn },
        { key: '--gallery-badge-inset', label: 'Inset', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 10, when: badgeOn,
          help: 'Distance from the edges of the cover.' },

        { type: 'group', label: 'Opening' },
        { key: 'data-gallery-open', attr: true, label: 'Opens at', type: 'segmented', default: '',
          options: opt([['', 'Clicked image'], ['first', 'First image']]),
          help: 'A link to a slide\'s address always opens at that slide.' },
        { key: 'data-gallery-cursor', attr: true, label: 'Cursor', type: 'segmented', default: '',
          options: opt([['', 'Pointer'], ['zoom', 'Magnifier'], ['auto', 'Arrow']]),
          help: 'The cursor over the images: the page\'s Pointer or Zoom in cursor (Page tab, Cursor) when it has one.' },

        { type: 'group', label: 'Viewer' },
        { type: 'action', label: 'One image', text: 'Use Image zoom', when: (a) => isVoid(a.component),
          help: 'For one image, Image zoom does the same with fewer settings, and its viewer\'s look can be set and previewed.',
          run: (a) => toImageZoom(a.component) },
        { type: 'action', label: 'Viewer', text: 'Show and edit', when: (a) => !isVoid(a.component),
          help: 'Opens the viewer in the canvas with all its settings: address, slides, layout, closing and look.',
          run: editViewer },
        ...viewerControls((a) => viewerAdapter(a).readAttr('data-gallery-zoom') !== 'off').map(viewerRow),
      ],
    });

    // The tag brings its viewer along, and takes it when removed.
    editor.on('component:update:classes', (comp) => {
      if (!comp || isVoid(comp) || (FigJS.state && FigJS.state.isInternalUpdate)) return;
      const tagged = (comp.getClasses() || []).includes('gallery-viewer');
      const viewer = viewerOf(comp);
      try {
        if (tagged && !viewer) comp.append(VIEWER);
        else if (!tagged && viewer) viewer.remove();
      } catch (e) {
        // The component is being removed.
      }
    });

    // =============================================================
    // Addresses on add and rename
    // =============================================================
    // New subpages and viewers get a readable id (links use it); a copy
    // gets the next free one.
    function ensureId(comp) {
      const current = comp.getAttributes().id || '';
      if (readable(current) && !idTaken(current, comp)) return;
      const base = readable(current) ? current.replace(/-\d+$/, '') : baseName(comp);
      const id = freeId(base, comp);
      if (id !== current) FigJS.undo.untracked(() => comp.addAttributes({ id }));
      comp.trigger('change:name');
    }

    // A layer renamed in Layers renames its address.
    editor.on('component:update:custom-name', (comp) => {
      const name = comp.get('custom-name');
      if (!name || !isOverlay(comp)) return;
      const before = comp.getAttributes().id || '';
      FigJS.undo.untracked(() => comp.set('custom-name', ''));
      rename(comp, name, before);
      if (FigJS.componentSettings) FigJS.componentSettings.render(true);
    });

    // Images inside a subpage load when it opens.
    function lazyImages(comp) {
      const own = comp.getEl && comp.getEl();
      if (!own || !own.querySelectorAll) return;
      const imgs = comp.get('type') === 'image' ? [comp] : comp.find('img');
      imgs.forEach((img) => {
        if (img.getAttributes().loading) return;
        const node = img.getEl && img.getEl();
        if (node && node.closest('.subpage')) FigJS.undo.untracked(() => img.addAttributes({ loading: 'lazy' }));
      });
    }

    const loading = () => !!(FigJS.state && FigJS.state.isInternalUpdate);
    editor.on('component:add', (comp) => {
      if (loading()) return;
      requestAnimationFrame(() => {
        if (!comp.getEl || !comp.getEl()) return;
        if (isOverlay(comp)) ensureId(comp);
        lazyImages(comp);
      });
    });
    editor.on('component:drag:end', (data) => {
      const comp = data && (data.target || data.component);
      if (comp && comp.getEl) requestAnimationFrame(() => lazyImages(comp));
    });

    // =============================================================
    // Image zoom
    // =============================================================
    // The viewer gallery.js makes for it takes these: the controls as on a
    // gallery's viewer, the look from --image-zoom-* (namespaced, so a
    // subpage inside the box keeps its own --sp-* look).
    registerPresetTag('image-zoom', {
      group: 'Viewer',
      description: 'Click the image to see it full size and zoom in. On a box, every image inside does, each on its own.',
    });
    registerMutexGroup(['image-zoom', 'gallery-viewer']);

    const canvasGallery = () => {
      const win = editor.Canvas.getWindow();
      return win && win.SiteGallery && win.SiteGallery.previewZoom ? win.SiteGallery : null;
    };
    let zoomShown = null;
    function previewZoom(a) {
      const g = canvasGallery();
      const node = a.component && a.component.getEl && a.component.getEl();
      if (!g || !node) return;
      const was = zoomShown;
      zoomShown = g.previewZoom(node) ? a.component : null;
      if (!zoomShown && was !== a.component) FigJS.setStatus('No image to show: add one, or one without data-gallery-skip.', '#ff9800');
    }
    // Another selection closes the preview; edits redraw it.
    editor.on('component:selected component:deselected', () => {
      const g = canvasGallery();
      if (zoomShown && g) g.closeZoomPreview();
      zoomShown = null;
    });
    let zoomTimer = 0;
    editor.on('update', () => {
      if (!zoomShown) return;
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => {
        const g = canvasGallery();
        const node = zoomShown && zoomShown.getEl && zoomShown.getEl();
        if (!g || !node || !g.previewZoom(node, true)) zoomShown = null;
      }, 120);
    });

    // A gallery on one image becomes an Image zoom with the same controls
    // and cursor; one change, one undo step.
    function toImageZoom(comp) {
      const attrs = comp.getAttributes() || {};
      const cursor = { '': 'pointer', zoom: '', auto: 'auto' }[attrs['data-gallery-cursor'] || ''];
      comp.setClass(comp.getClasses().map((c) => (c === 'gallery-viewer' ? 'image-zoom' : c)));
      if (cursor) comp.addAttributes({ 'data-gallery-cursor': cursor });
      else comp.removeAttributes(['data-gallery-cursor']);
      comp.removeAttributes(['data-gallery-open']);
      FigJS.markUnsaved();
      if (FigJS.presetsTab) FigJS.presetsTab.render();
      if (FigJS.componentSettings) FigJS.componentSettings.render(true);
    }

    const zoomsIn = (a) => a.readAttr('data-gallery-zoom') !== 'off';
    registerPresetSchemas(['image-zoom'], {
      title: 'Image zoom',
      description: 'Clicking the image (on a box: any image inside) opens it alone in the viewer, at its Full size file when it has one, to zoom and pan. A link on or around an image keeps its click; data-gallery-skip leaves one out. For a set to page through, use Gallery.',
      properties: [
        { key: 'data-gallery-cursor', attr: true, label: 'Cursor', type: 'segmented', default: '',
          options: opt([['', 'Magnifier'], ['pointer', 'Pointer'], ['auto', 'Arrow']]),
          help: 'Over the image: the page\'s Zoom in or Pointer cursor (Page tab, Cursor) when it has one.' },

        { type: 'group', label: 'Viewer' },
        { key: 'data-gallery-zoom', attr: true, label: 'Zoom', type: 'segmented', default: '', rerender: true,
          options: opt([['', 'On'], ['off', 'Off']]),
          help: 'On: the wheel, a pinch or a double-click zooms toward the pointer, a drag pans. Off: just the larger view.' },
        { key: 'data-gallery-zoom-max', attr: true, label: 'Max zoom', type: 'range', min: 1.5, max: 16, step: 0.5, default: 6, when: zoomsIn },
        { key: 'data-gallery-zoom-buttons', attr: true, label: 'Zoom buttons', type: 'segmented', default: '', when: zoomsIn,
          options: opt([['', 'Shown'], ['off', 'Hidden']]) },
        { key: 'data-gallery-captions', attr: true, label: 'Caption', type: 'segmented', default: '',
          options: opt([['', 'Shown'], ['off', 'Hidden']]), help: 'From the image Caption, a figure caption or the alt text.' },
        { key: 'data-gallery-place', attr: true, label: 'Place', type: 'segmented', default: '',
          options: opt([['', 'Window'], ['full', 'Full page']]) },
        { key: 'data-gallery-outside', attr: true, label: 'Outside', type: 'toggle', valueTrue: '', valueFalse: 'off',
          text: 'A click outside or beside the image closes it', help: 'Esc and the close button always do.' },

        { type: 'group', label: 'Look' },
        { key: '--image-zoom-backdrop', label: 'Backdrop', type: 'color-alpha', default: 'rgba(0, 0, 0, 0.75)' },
        { key: '--image-zoom-blur', label: 'Backdrop blur', type: 'range', min: 0, max: 24, step: 1, unit: 'px', default: 0 },
        { key: '--image-zoom-bg', label: 'Background', type: 'color-alpha', default: 'rgba(8, 8, 8, 0.94)' },
        { key: '--image-zoom-buttons', label: 'Buttons', type: 'color-alpha', default: 'rgba(0, 0, 0, 0.45)' },
        { type: 'action', label: 'Preview', text: 'Show in the canvas', run: previewZoom,
          help: 'Shows the viewer over the canvas as visitors see it (without zooming); it follows these settings. A click on it, Esc or another selection closes it.' },
      ],
    });

    // =============================================================
    // Zoom box
    // =============================================================
    registerPresetTag('zoom-box', {
      group: 'Viewer',
      description: 'Zoom into it in place on the site: scroll wheel, pinch or double-click; drag to look around. To open an image full size instead, use Image zoom.',
    });
    registerPresetSchemas(['zoom-box'], {
      title: 'Zoom box',
      description: 'On the site the wheel or a pinch zooms toward the pointer, a drag pans and a double-click toggles. Images with a Full size file switch to it once zoomed past their own resolution.',
      properties: [
        { key: 'data-zoom-wheel', attr: true, label: 'Wheel', type: 'segmented', default: '',
          options: opt([['', 'Zooms'], ['ctrl', 'Ctrl + wheel'], ['off', 'Off']]),
          help: 'Ctrl + wheel leaves plain scrolling to the page and shows a hint instead.' },
        { key: 'data-zoom-max', attr: true, label: 'Max zoom', type: 'range', min: 1.5, max: 16, step: 0.5, default: 4 },
        { key: 'data-zoom-speed', attr: true, label: 'Wheel speed', type: 'range', min: 0.25, max: 3, step: 0.25, default: 1 },
        { key: 'data-zoom-double', attr: true, label: 'Double-click', type: 'segmented', default: '',
          options: opt([['', 'Zooms'], ['off', 'Off']]) },
        { key: 'data-zoom-step', attr: true, label: 'Double-click zoom', type: 'range', min: 1.5, max: 8, step: 0.5, default: 2.5 },
        { key: 'data-zoom-controls', attr: true, label: 'Buttons', type: 'toggle', valueTrue: 'on', text: 'Zoom buttons in the corner' },
        { key: 'data-zoom-leave', attr: true, label: 'Pointer leaves', type: 'segmented', default: '',
          options: opt([['', 'Stays zoomed'], ['reset', 'Resets']]) },
      ],
    });

    // =============================================================
    // Blocks
    // =============================================================
    // Inline sample images: no dependency on site files.
    // Plain grey stand-ins (no gradients), each a shade apart.
    const sample = (shade) => "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' fill='%23" + shade + "'/%3E%3Ccircle cx='112' cy='40' r='10' fill='%23fff' fill-opacity='.18'/%3E%3Cpath d='M0 120L52 66l30 30 22-18 56 42z' fill='%23fff' fill-opacity='.12'/%3E%3C/svg%3E";
    const SAMPLES = ['3a3a3a', '444444', '4e4e4e', '585858'];
    const tile = (shade, i) => `<img src="${sample(shade)}" alt="Sample ${i + 1}">`;
    // Slides follow the gallery's defaults; each can set its own.
    const SLIDE_DEFAULTS = '--slide-width:100%; --slide-aspect:4 / 3; --slide-fit:cover;';

    registerSimpleBlock(editor, {
      id: 'gallery-viewer-block',
      label: 'Gallery',
      category: 'Media',
      media: icons.image,
      html: `<div class="gallery-viewer grid-auto" style="--grid-min:160px; --gap:12px; ${SLIDE_DEFAULTS}">${SAMPLES.map(tile).join('')}${VIEWER}</div>`,
    });

    registerSimpleBlock(editor, {
      id: 'gallery-cover-block',
      label: 'Gallery (cover)',
      category: 'Media',
      media: icons.image,
      html: `<div class="gallery-viewer grid-auto" data-gallery-display="single" style="--grid-min:120px; --gap:8px; max-width:360px; ${SLIDE_DEFAULTS}">${SAMPLES.map(tile).join('')}${VIEWER}</div>`,
    });

    // Style edits change rules, not the gallery's elements, so gallery.js
    // can't see them: re-arrange after edits (the badge and the cover
    // cycle follow the cover's size, corners and fit).
    let arrangeTimer = 0;
    editor.on('update', () => {
      clearTimeout(arrangeTimer);
      arrangeTimer = setTimeout(() => {
        const win = editor.Canvas.getWindow();
        if (win && win.SiteGallery && win.SiteGallery.arrange) win.SiteGallery.arrange();
      }, 120);
    });

    // A stand-in given a real picture drops its "Sample n" alt text.
    editor.on('component:update:src', (c) => {
      if (loading() || !c || typeof c.previous !== 'function') return;
      const alt = (c.getAttributes() || {}).alt || '';
      const was = String(c.previous('src') || '');
      if (/^Sample \d+$/.test(alt) && /^data:image\/svg/.test(was) && !/^data:/.test(String(c.get('src') || ''))) {
        c.addAttributes({ alt: '' });
      }
    });

    registerSimpleBlock(editor, {
      id: 'image-zoom-block',
      label: 'Image Zoom',
      category: 'Media',
      media: icons.image,
      html: `<img class="image-zoom" src="${sample('4e4e4e')}" alt="" style="display:block; max-width:100%;">`,
    });

    registerSimpleBlock(editor, {
      id: 'zoom-box-block',
      label: 'Zoom Box',
      category: 'Media',
      media: icons.image,
      html: `<div class="zoom-box aspect-box" data-zoom-controls="on"><img src="${sample('444444')}" alt="" style="display:block; width:100%; height:100%; object-fit:cover;"></div>`,
    });
  },
});
