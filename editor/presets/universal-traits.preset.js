// Settings on every element, after its own, in collapsible categories:
//   Tooltip        text, position, click to pin
//   Link           any element as a link; in-page targets picked on the
//                  canvas, with arrival settings
//   Element        id, tag (divs), anchor, Contents label, Markdown in text, hidden
//   Accessibility  role, ARIA label, title, alt
//   Layer & blend  stacking layer (and the boxes around it that keep it
//                  from layering with the rest of the page), blend mode,
//                  isolation
//   Cursor         the element's own cursor and the cursor states replaced
//                  inside it (a settings block, cursor-field.js)
// Text fields use the i18n-text trait: they edit the language the canvas
// shows. Runtime: universal.js, tooltip.js, cursors.js; inapp.js for the
// page's In-app browsers setting (Page tab).

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-universal-traits',
  plugin: function (editor) {
    const { registerDependency } = window.PresetRegistry;
    registerDependency('css', '/assets/css/universal.css');
    registerDependency('js', '/assets/js/universal.js');
    registerDependency('css', '/assets/css/cursors.css');
    registerDependency('js', '/assets/js/cursors.js');
    registerDependency('css', '/assets/css/inapp.css');
    registerDependency('js', '/assets/js/inapp.js');

    // A settings block (FigJS.settingsUI) in a trait row: schema() for the
    // selected element. Its own fields write; the trait holds no value.
    editor.Traits.addType('fig-settings', {
      getInputEl: function () {
        if (this.__figHost) return this.__figHost;
        const trait = this.model;
        const comp = trait.target || editor.getSelected();
        const host = document.createElement('div');
        host.className = 'fig-trait-block';
        const render = () => {
          const schema = trait.get('schema')();
          host.replaceChildren(FigJS.settingsUI.renderBlock(FigJS.settingsUI.componentAdapter(comp), schema, {
            id: 'trait:' + trait.get('name'), compact: true, hideTitle: true, rerender: render,
          }));
        };
        render();
        this.__figRefresh = () => {
          const block = host.firstChild;
          if (block && block.__refresh) block.__refresh();
        };
        editor.on('undo redo', this.__figRefresh);
        this.__figHost = host;
        return host;
      },
      setInputValue: function () {},
      onChange: function () {},
      removed: function () {
        if (this.__figRefresh) editor.off('undo redo', this.__figRefresh);
        this.__figRefresh = null;
      },
    });

    // Element cursors saved before cursor states (data-cursor-preset,
    // data-cursor-url, data-cursor-hotspot) become its cursor property.
    const OLD_PRESETS = {
      crosshair: 'var(--cursor-crosshair, crosshair)', dot: 'var(--cursor-pointer, pointer)',
      ring: 'var(--cursor-pointer, pointer)', none: 'none',
    };
    function migrateCursor(component) {
      const a = component.getAttributes() || {};
      if (!('data-cursor-preset' in a) && !('data-cursor-url' in a) && !('data-cursor-hotspot' in a)) return;
      const url = String(a['data-cursor-url'] || '').trim();
      const hot = String(a['data-cursor-hotspot'] || '').trim() || '0 0';
      const value = url ? `url("${url.replace(/"/g, '%22')}") ${hot}, auto` : (OLD_PRESETS[a['data-cursor-preset']] || '');
      const adapter = FigJS.settingsUI.componentAdapter(component);
      FigJS.undo.untracked(() => {
        if (value && !adapter.read('cursor', { raw: true })) adapter.write('cursor', value, { avoidStore: true });
        component.removeAttributes(['data-cursor-preset', 'data-cursor-url', 'data-cursor-hotspot']);
      });
      FigJS.markUnsaved();
    }

    // Shared category objects keep a collapsed category collapsed for every element.
    const CAT = {
      tooltip:  { id: 'u-tooltip', label: 'Tooltip', open: true },
      link:     { id: 'u-link', label: 'Link', open: false },
      element:  { id: 'u-element', label: 'Element', open: false },
      a11y:     { id: 'u-a11y', label: 'Accessibility', open: false },
      layer:    { id: 'u-layer', label: 'Layer & blend', open: false },
      cursor:   { id: 'u-cursor', label: 'Cursor', open: false },
    };
    const ORDER = ['u-tooltip', 'u-link', 'u-element', 'u-a11y', 'u-layer', 'u-cursor', 'u-motion'];

    const BLEND_MODES = ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
      'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

    const UNIVERSAL = [
      // ---- Tooltip -----------------------------------------------------
      { type: 'i18n-text', name: 'data-tooltip-text', label: 'Text',
        placeholder: 'Shown on hover. Supports **bold**, *italic*, [links](url)', category: CAT.tooltip },
      { type: 'select', name: 'data-tooltip-pos', label: 'Position', category: CAT.tooltip, options: [
        { id: '', name: 'Top (default)' }, { id: 'bottom', name: 'Bottom' },
        { id: 'left', name: 'Left' }, { id: 'right', name: 'Right' } ] },
      { type: 'checkbox', name: 'data-tooltip-pin', label: 'Click to pin (selectable)',
        valueTrue: 'true', valueFalse: '', category: CAT.tooltip },

      // ---- Link --------------------------------------------------------
      { type: 'text', name: 'data-link-href', label: 'Link to',
        placeholder: 'https://example.com or an Element ID', category: CAT.link },
      { type: 'button', name: 'link-pick', label: 'Target', text: 'Pick on page', category: CAT.link,
        command: (ed, trait) => FigJS.linkPicker && FigJS.linkPicker.start(trait.target) },
      { type: 'fig-link-check', name: 'fig-link-check', label: false, category: CAT.link },
      { type: 'checkbox', name: 'data-link-newtab', label: 'Open in new tab (links inside too)',
        valueTrue: 'true', valueFalse: '', category: CAT.link },
      { type: 'select', name: 'data-jump-align', label: 'Target lands at', category: CAT.link, options: [
        { id: '', name: '(default)' }, { id: 'start', name: 'Top' }, { id: 'center', name: 'Center' } ] },
      { type: 'select', name: 'data-jump-highlight', label: 'Arrival highlight', category: CAT.link, options: [
        { id: '', name: '(default)' }, { id: 'outline', name: 'Outline' }, { id: 'fill', name: 'Fill' },
        { id: 'none', name: 'None' } ] },
      { type: 'select', name: 'data-jump-scroll', label: 'Scroll', category: CAT.link, options: [
        { id: '', name: 'Smooth' }, { id: 'instant', name: 'Instant' } ] },
      { type: 'select', name: 'data-jump-hash', label: 'Address bar', category: CAT.link, options: [
        { id: '', name: 'Page' }, { id: 'on', name: 'Page#target' } ] },

      // ---- Element -----------------------------------------------------
      { type: 'text', name: 'id', label: 'Element ID', placeholder: 'anchor target + CSS scope', category: CAT.element },
      { type: 'text', name: 'data-anchor-slug', label: 'Anchor slug',
        placeholder: 'defaults to the Element ID', category: CAT.element },
      { type: 'i18n-text', name: 'data-contents-label', label: 'Contents label',
        placeholder: 'lists this element in Contents', category: CAT.element },
      { type: 'checkbox', name: 'data-contents-skip', label: 'Leave out of Contents (with everything inside)',
        valueTrue: 'true', category: CAT.element },
      { type: 'select', name: 'data-text-md', label: 'Markdown in text', category: CAT.element, options: [
        { id: '', name: '(page setting)' }, { id: 'on', name: 'On' }, { id: 'off', name: 'Off' } ] },
      // Unchecked removes the attribute (hidden="" would still hide).
      { type: 'checkbox', name: 'hidden', label: 'Hidden from page', valueTrue: 'true', category: CAT.element },

      // ---- Accessibility -------------------------------------------------
      { type: 'select', name: 'role', label: 'ARIA role', category: CAT.a11y, options: [
        { id: '', name: '(native)' }, { id: 'region', name: 'Region' }, { id: 'banner', name: 'Banner' },
        { id: 'complementary', name: 'Complementary' }, { id: 'contentinfo', name: 'Content info' },
        { id: 'navigation', name: 'Navigation' }, { id: 'main', name: 'Main' }, { id: 'search', name: 'Search' },
        { id: 'form', name: 'Form' }, { id: 'dialog', name: 'Dialog' }, { id: 'alert', name: 'Alert' },
        { id: 'status', name: 'Status' }, { id: 'group', name: 'Group' }, { id: 'list', name: 'List' },
        { id: 'listitem', name: 'List item' } ] },
      { type: 'i18n-text', name: 'aria-label', label: 'ARIA label', category: CAT.a11y },
      { type: 'i18n-text', name: 'title', label: 'Native title', placeholder: 'Browser tooltip (prefer Tooltip above)',
        category: CAT.a11y },
      { type: 'i18n-text', name: 'alt', label: 'Alt text', category: CAT.a11y, appliesTo: ['IMG'] },
      { type: 'i18n-text', name: 'placeholder', label: 'Placeholder', category: CAT.a11y, appliesTo: ['INPUT', 'TEXTAREA'] },

      // ---- Layer & blend -------------------------------------------------
      { type: 'number', name: 'data-layer', label: 'Layer (-128 to 128)', min: -128, max: 128, step: 1,
        placeholder: '0: the page; higher on top, below 0 behind', category: CAT.layer },
      { type: 'fig-layer-check', name: 'fig-layer-check', label: false, category: CAT.layer },
      { type: 'select', name: 'data-blend-mode', label: 'Blend mode', category: CAT.layer,
        options: [{ id: '', name: 'normal' }].concat(BLEND_MODES.map((m) => ({ id: m, name: m }))) },
      { type: 'range', name: 'data-blend-intensity', label: 'Blend intensity', min: 0, max: 1, step: 0.05,
        default: 1, category: CAT.layer },
      { type: 'checkbox', name: 'data-blend-isolate', label: 'Contain blending inside',
        valueTrue: 'true', valueFalse: '', category: CAT.layer },

      // ---- Cursor --------------------------------------------------------
      { type: 'fig-settings', name: 'fig-cursor', label: false, category: CAT.cursor,
        schema: () => FigJS.cursors.elementSchema() },

    ];

    // Tag swap on divs; same name and options as TAG_TRAIT.
    const TAG_SWAP = {
      type: 'select', name: 'tagName', label: 'Semantic tag', changeProp: true, category: CAT.element,
      options: ['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav']
        .map((t) => ({ id: t, name: t })),
    };

    const UNIVERSAL_NAMES = new Set(UNIVERSAL.map((t) => t.name).concat(['tagName']));

    function rankOf(trait) {
      const cat = trait.get ? trait.get('category') : trait.category;
      const id = cat && (cat.get ? cat.get('id') : (cat.id || cat));
      const i = ORDER.indexOf(id);
      // Component-specific traits first.
      return i === -1 ? -1 : i;
    }

    // Link to takes an Element ID as typed: a bare name (no #, path or
    // scheme) that an element of this page has becomes #name, so an
    // element hard to click can be linked without picking it.
    editor.on('component:update:attributes', (comp) => {
      const raw = (comp.getAttributes() || {})['data-link-href'];
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!/^[\p{L}\p{N}_-]+$/u.test(name) || !FigJS.linkPicker || !FigJS.linkPicker.byId(name)) return;
      FigJS.undo.untracked(() => comp.addAttributes({ 'data-link-href': '#' + name }));
    });

    editor.on('component:selected', (component) => {
      const traits = component.get('traits');
      if (!traits || typeof traits.add !== 'function') return;
      if (component === editor.getWrapper()) return;

      const tag = String(component.get('tagName') || '').toUpperCase();
      migrateCursor(component);

      // Traits without a category (GrapesJS's id / title) are replaced by the
      // universal definitions; a category set later is not picked up.
      const uncategorized = traits.filter((t) => UNIVERSAL_NAMES.has(t.get('name')) && !t.category);
      if (uncategorized.length) traits.remove(uncategorized);

      const existing = new Set(traits.map((t) => t.get('name')));
      const additions = [];
      UNIVERSAL.forEach((t) => {
        if (existing.has(t.name)) return;
        if (t.appliesTo && !t.appliesTo.includes(tag)) return;
        const { appliesTo, ...def } = t;
        additions.push(def);
      });
      if (tag === 'DIV' && !existing.has('tagName')) additions.push(TAG_SWAP);
      if (additions.length) traits.add(additions);

      const sorted = traits.models.slice().sort((a, b) => {
        const ra = UNIVERSAL_NAMES.has(a.get('name')) || rankOf(a) >= 0 ? rankOf(a) : -1;
        const rb = UNIVERSAL_NAMES.has(b.get('name')) || rankOf(b) >= 0 ? rankOf(b) : -1;
        return ra - rb;
      });
      const same = sorted.every((t, i) => t === traits.models[i]);
      if (!same) traits.reset(sorted);
    });

    // ---- Where a Layer counts, and what Glass sees -----------------------
    // A Layer orders an element among what is inside the nearest box around
    // it that groups what it holds (a stacking context); outside, the whole
    // box stands at its own place. Glass blurs what is painted behind it, up
    // to the nearest box around it that is a backdrop root (a filter,
    // transparency, a clip or mask, a blend, other glass). Under the Layer
    // field (and in Glass's settings), for the selected element:
    //   - the boxes that group its Layer, why, and how to undo that;
    //   - for Glass, the box it blurs within when that is not the page;
    //   - Glass with things behind it that move (on hover, in a loop, by
    //     parallax), or for such a thing the Glass in front of it. Each move
    //     has the glass blur a changed scene again, frame by frame: the path
    //     where browsers flash, shift brightness or leave silhouettes. A
    //     button lifts the mover above the glass by the Layer that takes.
    const FX_CLASSES = ['img-outline-thin', 'img-outline-thick', 'img-glow', 'img-double-glow', 'img-shadow',
      'blur-custom', 'grayscale', 'saturate', 'fx', 'near-cursor'];
    const GLASS = '.glass, .glass-dark, .auto-blur';
    const HOVER_FX = '[data-fx-trigger="hover"]:is(.img-outline-thin, .img-outline-thick, .img-glow, .img-double-glow, '
      + '.img-shadow, .blur-custom, .grayscale, .saturate, .fx, .opacity-90, .opacity-75, .opacity-50, .opacity-25)';
    const MOVERS = '.hover-grow, .hover-lift, .hover-tilt, .hover-shift, .hover-fade, .hover-zoom, .near-cursor, '
      + '.parallax, .anim-pulse, .anim-float, .anim-spin, .anim-blink, ' + HOVER_FX;
    const PREPARED = /transform|translate|rotate|scale|opacity|filter|perspective|clip-path|mask|isolation|mix-blend|contain/;
    const layerOf = (node) => parseInt(node.getAttribute('data-layer'), 10);
    const styleOf = (node) => node.ownerDocument.defaultView.getComputedStyle(node);
    const modelOfNode = (node) => (node.__gjsv && node.__gjsv.model) || null;

    // The tag behind a will-change on it.
    function preparedBy(node) {
      if (node.matches('.parallax, .parallax-scene [data-layer], .parallax-scene > .parallax-layer')) return 'parallax';
      if (node.matches(GLASS)) return 'Glass';
      if (node.matches('.hover-grow, .hover-lift, .hover-tilt, .hover-shift, .hover-fade, .near-cursor, [data-fx-trigger="hover"]')
        || (node.parentElement && node.parentElement.matches('.hover-zoom, [data-fx-trigger="hover"]'))) return 'its hover effect';
      return '';
    }

    // [why, how to undo it] for each reason the box groups what it holds.
    function groupsBecause(node) {
      const cs = styleOf(node);
      const parent = node.parentElement ? styleOf(node.parentElement) : null;
      const why = [];
      if (cs.zIndex !== 'auto' && (cs.position !== 'static' || (parent && /flex|grid/.test(parent.display)))) {
        const n = layerOf(node);
        why.push(Number.isFinite(n) && n !== 0
          ? ['its own Layer (' + n + ')', 'What it holds goes up and down with it. Blank or 0 lets what it holds layer with the page.']
          : ['a z-index (' + cs.zIndex + ')', 'Clear the z-index in its Style.']);
      }
      if (cs.position === 'fixed' || cs.position === 'sticky') why.push([cs.position + ' position', 'Always groups.']);
      if (parseFloat(cs.opacity) < 1) why.push(['transparency', 'Give the opacity to the items inside instead.']);
      if (cs.filter !== 'none') {
        why.push(FX_CLASSES.some((c) => node.classList.contains(c))
          ? ['a filter effect', 'Set the effect\'s Applies to: Each item inside.']
          : ['a filter', 'Remove the filter, or give it to the items inside.']);
      }
      const glass = (cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none';
      if (glass) why.push(['Glass (background blur)', 'Always groups: put the glass on a box beside or behind the items instead.']);
      if (['transform', 'translate', 'rotate', 'scale'].some((p) => cs[p] && cs[p] !== 'none')) {
        why.push(['a transform (rotation, tilt, scale, motion or parallax)', 'It moves as one piece: give the transform to the items, or move them out.']);
      }
      if (cs.perspective && cs.perspective !== 'none') why.push(['perspective', 'Always groups.']);
      if ((cs.clipPath && cs.clipPath !== 'none') || (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none') {
        why.push(['a clip or mask', 'Always groups.']);
      }
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') why.push(['a blend mode', 'Give the blend to the items inside instead.']);
      if (cs.isolation === 'isolate') {
        why.push(node.classList.contains('parallax-scene')
          ? ['being a parallax scene', 'A scene keeps its layers together.']
          : ['Contain blending inside', 'Turn it off (Layer & blend).']);
      }
      if (cs.willChange && cs.willChange !== 'auto' && PREPARED.test(cs.willChange)) {
        const by = preparedBy(node);
        if (by === 'its hover effect') {
          why.push(['being ready for its hover effect (will-change)', 'Always groups, so hovering never reshuffles what it holds.']);
        } else if (by === 'parallax') {
          why.push(['being ready for parallax (will-change)', 'It moves as one piece.']);
        } else if (by !== 'Glass' || !glass) {
          why.push(['being ready for motion (will-change)', 'Comes from a style or effect on it.']);
        }
      }
      if ((cs.contain && /paint|layout|strict|content/.test(cs.contain))
        || (cs.containerType && cs.containerType !== 'normal')
        || (cs.contentVisibility && cs.contentVisibility !== 'visible')) {
        why.push(['containment', 'Comes from containment set on it.']);
      }
      return why;
    }

    function groupsAround(node) {
      const doc = node.ownerDocument;
      const out = [];
      for (let n = node.parentElement; n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
        const model = modelOfNode(n);
        if (!model) continue;
        const why = groupsBecause(n);
        if (why.length) out.push({ node: n, model, why });
      }
      return out;
    }

    // [why, how to undo it] for each reason glass inside it blurs only
    // what it holds (a backdrop root).
    function blurLimitBecause(node) {
      const cs = styleOf(node);
      const why = [];
      if (cs.filter !== 'none') {
        why.push(FX_CLASSES.some((c) => node.classList.contains(c))
          ? ['a filter effect', 'Set the effect\'s Applies to: Each item inside, or move the glass out of it.']
          : ['a filter', 'Remove it, or move the glass out of it.']);
      }
      if (parseFloat(cs.opacity) < 1) why.push(['transparency', 'Give the opacity to the things beside the glass instead.']);
      if ((cs.clipPath && cs.clipPath !== 'none') || (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none') {
        why.push(['a clip or mask', 'Move the glass out of it.']);
      }
      if ((cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none') {
        why.push(['Glass of its own', 'Glass in glass blurs only what the outer glass holds.']);
      }
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') why.push(['a blend mode', 'Give the blend to the things beside the glass.']);
      if (!why.length && cs.willChange && /opacity|filter|clip-path|mask|mix-blend/.test(cs.willChange)) {
        why.push(['being ready for ' + (preparedBy(node) || 'a change') + ' (will-change)',
          'Hover effects are always ready, so the glass never switches between the two. Move the glass out of it.']);
      }
      return why;
    }

    function blurLimit(node) {
      const doc = node.ownerDocument;
      for (let n = node.parentElement; n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
        const why = blurLimitBecause(n);
        if (why.length) return { node: n, model: modelOfNode(n), why };
      }
      return null;
    }

    const isGlass = (node) => node.matches(GLASS) || (styleOf(node).backdropFilter || 'none') !== 'none';
    const stacks = (node) => node === node.ownerDocument.documentElement || groupsBecause(node).length > 0;
    const zOf = (node) => {
      const z = parseInt(styleOf(node).zIndex, 10);
      return Number.isFinite(z) ? z : 0;
    };

    // The box that orders a and b against each other (the nearest stacking
    // context holding both), and the outermost box on each side under it:
    // what a Layer has to move.
    function sides(a, b) {
      let common = a.ownerDocument.documentElement;
      for (let p = a.parentElement; p; p = p.parentElement) {
        if (p.contains(b) && stacks(p)) { common = p; break; }
      }
      const outer = (n) => {
        let r = n;
        for (let p = n.parentElement; p && p !== common; p = p.parentElement) if (stacks(p)) r = p;
        return r;
      };
      return { glass: outer(a), other: outer(b) };
    }

    // Whether other paints behind glass where they meet: hit-tested at a
    // few points of the overlap, else (only a shadow reaching under, or off
    // screen) by their order in the box that orders them.
    function paintsBehind(glass, other) {
      const g = glass.getBoundingClientRect();
      const m = other.getBoundingClientRect();
      if (!g.width || !g.height || !m.width || !m.height) return false;
      // A shadow or blur reaches past the box.
      const cs = styleOf(other);
      const reach = /drop-shadow|blur/.test(cs.filter) || cs.boxShadow !== 'none' ? 16 : 0;
      if (m.right + reach <= g.left || m.left - reach >= g.right || m.bottom + reach <= g.top || m.top - reach >= g.bottom) return false;
      const doc = glass.ownerDocument;
      const win = doc.defaultView;
      const x1 = Math.max(g.left, m.left, 0);
      const x2 = Math.min(g.right, m.right, win.innerWidth);
      const y1 = Math.max(g.top, m.top, 0);
      const y2 = Math.min(g.bottom, m.bottom, win.innerHeight);
      if (x2 > x1 && y2 > y1) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const stack = doc.elementsFromPoint(x1 + (x2 - x1) * (i + 0.5) / 3, y1 + (y2 - y1) * (j + 0.5) / 3);
            const gi = stack.findIndex((e) => glass.contains(e));
            const mi = stack.findIndex((e) => other.contains(e));
            if (gi >= 0 && mi >= 0) return mi > gi;
          }
        }
      }
      const s = sides(glass, other);
      const zg = zOf(s.glass);
      const zm = zOf(s.other);
      return zm < zg || (zm === zg && !!(s.other.compareDocumentPosition(s.glass) & 4));
    }

    // Glass and a mover it sees: not inside each other, and the mover within
    // what the glass blurs.
    function sees(glass, mover) {
      if (glass === mover || glass.contains(mover) || mover.contains(glass)) return false;
      if (!mover.getClientRects().length || !glass.getClientRects().length) return false;
      const limit = blurLimit(glass);
      if (limit && !limit.node.contains(mover)) return false;
      return paintsBehind(glass, mover);
    }

    function moversBehind(glass) {
      const out = [];
      glass.ownerDocument.querySelectorAll(MOVERS).forEach((m) => {
        if (out.some((o) => o.contains(m))) return;
        if (sees(glass, m)) out.push(m);
      });
      return out;
    }

    function glassInFront(mover) {
      const out = [];
      mover.ownerDocument.querySelectorAll(GLASS).forEach((g) => { if (sees(g, mover)) out.push(g); });
      return out;
    }

    const tag = (name, cls, text) => {
      const n = document.createElement(name);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const nameOf = (node) => {
      const m = modelOfNode(node);
      return m ? m.getName() : node.tagName.toLowerCase();
    };
    function selectButton(node) {
      const model = modelOfNode(node);
      const b = tag('button', 'fig-f-action', nameOf(node));
      b.type = 'button';
      b.title = 'Select it';
      if (model) b.addEventListener('click', () => editor.select(model));
      else b.disabled = true;
      return b;
    }
    function reasonList(why) {
      const list = tag('ul');
      why.forEach(([text, fix]) => {
        const li = tag('li', '', text + '.');
        li.appendChild(tag('span', 'fig-layer-fix', ' ' + fix));
        list.appendChild(li);
      });
      return list;
    }

    // Raises the mover's side above the glass's side, by Layer.
    function liftButton(glass, mover) {
      const s = sides(glass, mover);
      const model = modelOfNode(s.other);
      const to = zOf(s.glass) + 1;
      if (!model || to > 128) return null;
      const whole = s.other !== mover;
      const b = tag('button', 'fig-f-action',
        (whole ? 'Lift ' + nameOf(s.other) : 'Lift it') + ' to Layer ' + to);
      b.type = 'button';
      b.title = (whole ? nameOf(s.other) + ' and all it holds go' : 'It goes')
        + ' above the glass, which then no longer blurs ' + (whole ? 'them' : 'it') + '.';
      b.addEventListener('click', () => {
        model.addAttributes({ 'data-layer': String(to) });
        FigJS.markUnsaved();
      });
      return b;
    }

    const RE_BLUR = 'Each move has the glass blur a changed scene again, frame by frame: the path where browsers '
      + 'flash, shift brightness or leave silhouettes. Above the glass, it moves without the glass redoing anything.';
    function brighter(glass) {
      const v = parseFloat(styleOf(glass).getPropertyValue('--glass-brightness'));
      return Number.isFinite(v) && v > 1.05 ? ' Its Brightness of ' + v + ' makes any of that ' + v + ' times as bright.' : '';
    }

    // The glass notes for an element: what its glass blurs within, what
    // moves behind it, or the glass in front of what moves.
    function glassNotes(node) {
      const notes = [];
      if (isGlass(node)) {
        const limit = blurLimit(node);
        if (limit) {
          const note = tag('div', 'fig-layer-note');
          note.appendChild(tag('p', '', 'This glass blurs only what is inside ' + nameOf(limit.node)
            + ', not the page behind it.'));
          const row = tag('div', 'fig-layer-box');
          row.append(tag('span', 'fig-layer-by', 'Because of'), selectButton(limit.node), reasonList(limit.why));
          note.appendChild(row);
          notes.push(note);
        }
        const movers = moversBehind(node);
        if (movers.length) {
          const note = tag('div', 'fig-layer-note');
          note.appendChild(tag('p', '', 'Behind this glass, things move (on hover, in a loop or by parallax). ' + RE_BLUR + brighter(node)));
          movers.forEach((m) => {
            const row = tag('div', 'fig-layer-box');
            const lift = liftButton(node, m);
            row.append(tag('span', 'fig-layer-by', 'Behind'), selectButton(m));
            if (lift) row.appendChild(lift);
            note.appendChild(row);
          });
          notes.push(note);
        }
      }
      if (node.matches(MOVERS)) {
        const panes = glassInFront(node);
        if (panes.length) {
          const note = tag('div', 'fig-layer-note');
          note.appendChild(tag('p', '', 'Glass in front of this sees it move. ' + RE_BLUR));
          panes.forEach((g) => {
            const row = tag('div', 'fig-layer-box');
            const lift = liftButton(g, node);
            row.append(tag('span', 'fig-layer-by', 'Glass'), selectButton(g));
            if (lift) row.appendChild(lift);
            note.appendChild(row);
          });
          notes.push(note);
        }
      }
      return notes;
    }

    function layerNote(node) {
      if (!node.hasAttribute('data-layer')) return null;
      const n = layerOf(node);
      if (!Number.isFinite(n) || n === 0) return null;
      const boxes = groupsAround(node);
      if (!boxes.length) return null;
      const note = tag('div', 'fig-layer-note');
      const near = boxes[0];
      const place = styleOf(near.node).zIndex;
      const name = near.model.getName();
      note.appendChild(tag('p', '', 'Layer ' + n + ' orders this only among what is inside ' + name
        + '. To the rest of the page, ' + name + ' and all it holds stand together at '
        + (place === 'auto' ? 'Layer 0' : 'Layer ' + place) + '.'));
      boxes.forEach((box, i) => {
        const row = tag('div', 'fig-layer-box');
        row.append(tag('span', 'fig-layer-by', i ? 'Further out' : 'Grouped by'), selectButton(box.node), reasonList(box.why));
        note.appendChild(row);
      });
      return note;
    }

    // What the element's link does on this page (FigJS.links, as the site
    // routes it): opens a subpage or a gallery's viewer, goes to an element,
    // or finds nothing. Links to other pages and sites get no note.
    function linkNote(node) {
      const t = FigJS.links && FigJS.links.target(node);
      if (!t) return null;
      if (!t.target) {
        const note = tag('div', 'fig-layer-note' + (t.id.toLowerCase() === 'top' ? ' is-info' : ''));
        note.appendChild(tag('p', '', t.id.toLowerCase() === 'top'
          ? 'Goes to the top of the page.'
          : 'Nothing on this page has the address #' + t.id + ', so the link goes nowhere.'));
        return note;
      }
      const note = tag('div', 'fig-layer-note is-info');
      const row = tag('div', 'fig-layer-box');
      if (t.overlay) {
        const kind = t.overlay.matches('.gallery-view') ? 'the gallery viewer' : 'the subpage';
        note.appendChild(tag('p', '', 'Opens ' + kind
          + (t.via === 'inside' ? ', at an element inside it.' : t.via === 'slide' ? ' at this image.' : '.')));
        row.append(tag('span', 'fig-layer-by', 'Opens'), selectButton(t.overlay));
        if (t.via) row.append(tag('span', 'fig-layer-by', 'At'), selectButton(t.target));
      } else {
        note.appendChild(tag('p', '', 'Goes to an element on this page.'));
        row.append(tag('span', 'fig-layer-by', 'Goes to'), selectButton(t.target));
      }
      note.appendChild(row);
      return note;
    }

    // A host that redraws its notes as the page changes, until it leaves.
    function checkHost(comp, which) {
      const host = tag('div', 'fig-layer-check');
      let timer = 0;
      let shown = false;
      const render = () => {
        timer = 0;
        host.textContent = '';
        const node = comp && comp.getEl && comp.getEl();
        if (!node || !node.isConnected) return;
        try {
          const notes = which === 'glass' ? glassNotes(node)
            : which === 'link' ? [linkNote(node)]
            : [layerNote(node)].concat(glassNotes(node));
          notes.forEach((n) => { if (n) host.appendChild(n); });
        } catch (e) { console.error('[layer-check]', e); }
      };
      const schedule = () => {
        if (host.isConnected) shown = true;
        else if (shown) { stop(); return; }
        clearTimeout(timer);
        timer = setTimeout(render, 80);
      };
      const stop = () => {
        clearTimeout(timer);
        editor.off('update undo redo', schedule);
      };
      render();
      editor.on('update undo redo', schedule);
      return { el: host, refresh: schedule, stop };
    }

    FigJS.stackingCheck = { glassField: (comp) => checkHost(comp, 'glass') };

    const checkTrait = (which) => ({
      getInputEl: function () {
        if (this.__figHost) return this.__figHost.el;
        this.__figHost = checkHost(this.model.target || editor.getSelected(), which);
        return this.__figHost.el;
      },
      setInputValue: function () {},
      onChange: function () {},
      removed: function () {
        if (this.__figHost) this.__figHost.stop();
        this.__figHost = null;
      },
    });
    editor.Traits.addType('fig-layer-check', checkTrait('all'));
    editor.Traits.addType('fig-link-check', checkTrait('link'));

    // ---- Layers below 0 stay clickable ----------------------------------
    // A layer below 0 paints behind the rest of its box, so the box takes
    // the clicks. In the canvas, a click, hover or double-click on the box
    // where such a layer lies beneath goes to that layer's topmost part
    // under the pointer instead. Only a box around the layer gives way:
    // anything else on top of it still takes the click.
    const negativeLayer = (n) => n.hasAttribute('data-layer') && parseInt(n.getAttribute('data-layer'), 10) < 0;

    function behind(e) {
      const doc = e.target && e.target.ownerDocument;
      if (!doc || !doc.elementsFromPoint) return null;
      const stack = doc.elementsFromPoint(e.clientX, e.clientY);
      const top = stack[0];
      if (!top) return null;
      for (let i = 1; i < stack.length; i++) {
        const node = stack[i];
        if (node === doc.body || node === doc.documentElement) continue;
        for (let b = node; b && b !== top && b !== doc.body; b = b.parentElement) {
          if (negativeLayer(b)) {
            if (top.contains(b)) return node;
            break;
          }
        }
      }
      return null;
    }

    function modelOf(node) {
      for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
        const m = n.__gjsv && n.__gjsv.model;
        if (m && m.get('selectable') !== false) return m;
      }
      return null;
    }

    function hookBehind(win) {
      if (!win || win.__figBehindHook) return;
      win.__figBehindHook = true;
      const doc = win.document;
      const em = editor.getModel();
      const any = () => !!doc.querySelector('[data-layer^="-"]');
      const target = (e) => {
        if (!any() || (em.isEditing && em.isEditing())) return null;
        const node = behind(e);
        return node ? modelOf(node) : null;
      };
      win.addEventListener('click', (e) => {
        const m = target(e);
        if (!m) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        em.setSelected(m, { event: e, useValid: true });
      }, true);
      win.addEventListener('dblclick', (e) => {
        const m = target(e);
        if (!m) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        em.setSelected(m, { useValid: true });
        const view = m.getView && m.getView();
        if (view && typeof view.onActive === 'function') view.onActive(e);
      }, true);
      let last = null;
      let frame = 0;
      win.addEventListener('mousemove', (e) => {
        last = e;
        if (frame) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          const m = last && target(last);
          if (m && em.setHovered) em.setHovered(m, { useValid: true });
        });
      }, true);
    }

    editor.on('load', () => hookBehind(editor.Canvas.getWindow()));
    editor.on('canvas:frame:load', (data) => hookBehind((data && data.window) || editor.Canvas.getWindow()));
  },
});
