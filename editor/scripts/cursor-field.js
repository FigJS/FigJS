// Cursor settings (runtime cursors.css / cursors.js).
// Field type 'cursor' (FigJS.settingsUI): one cursor value, edited as a
// custom image with its hotspot, a cursor state, a system cursor or
// hidden. Values, as CSS:
//   ''                                 unset (System / Inherited / As the page)
//   url("<image>") X Y, <fallback>     a custom image
//   var(--cursor-<state>, <keyword>)   a cursor state (Same as..., Site cursors)
//   none | <keyword>                   hidden, or a system cursor
// prop.cursor: { blank, fallback, aliases: [state ids], states: bool, keywords: bool }
// Schemas:
//   FigJS.cursors.pageSchema()     Page tab: every state for the page
//   FigJS.cursors.elementSchema()  Settings > Cursor: the element's own
//                                  cursor, and states replaced inside it
//   FigJS.cursors.STATES

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // kw: the system cursor of the state, and its fallback.
  const STATES = [
    { id: 'default', label: 'Default', kw: 'default',
      help: 'The page, and anything without a cursor of its own.' },
    { id: 'pointer', label: 'Pointer', kw: 'pointer',
      help: 'Links, buttons and anything clickable.' },
    { id: 'pressed', label: 'Pressed', kw: 'pointer',
      help: 'While the mouse button is held on something clickable. Unset: the Pointer cursor stays.' },
    { id: 'text', label: 'Text', kw: 'text',
      help: 'Over text, where the browser shows its I-beam (not over blank space, links or buttons), and in text fields.' },
    { id: 'zoom-in', label: 'Zoom in', kw: 'zoom-in',
      help: 'Images that open larger: galleries with the Magnifier cursor.' },
    { id: 'zoom-out', label: 'Zoom out', kw: 'zoom-out' },
    { id: 'grab', label: 'Grab', kw: 'grab',
      help: 'Things that can be dragged, such as a zoomed image.' },
    { id: 'grabbing', label: 'Grabbing', kw: 'grabbing', help: 'While dragging.' },
    { id: 'help', label: 'Help', kw: 'help', help: 'Footnotes and other hints.' },
    { id: 'not-allowed', label: 'Not allowed', kw: 'not-allowed', help: 'Disabled controls.' },
    { id: 'crosshair', label: 'Crosshair', kw: 'crosshair' },
    { id: 'move', label: 'Move', kw: 'move' },
  ];
  const stateOf = (id) => STATES.find((s) => s.id === id);

  const KEYWORDS = [
    ['auto', 'Auto (text-aware)'], ['default', 'Arrow'], ['pointer', 'Hand'], ['text', 'I-beam'],
    ['crosshair', 'Crosshair'], ['move', 'Move'], ['grab', 'Grab'], ['grabbing', 'Grabbing'],
    ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['help', 'Help'], ['not-allowed', 'Not allowed'],
    ['wait', 'Wait'], ['progress', 'Busy'], ['cell', 'Cell'], ['copy', 'Copy'],
  ];

  const HOT = /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/;
  const IMAGE_HELP = 'An image up to 128 × 128 px (32 × 32 shows the same everywhere); PNG or SVG. '
    + 'Hotspot: the point that clicks, in pixels from its top-left corner (the middle of a 32 px circle is 16 16).';

  function parse(value) {
    const s = String(value || '').trim();
    if (!s) return { mode: '' };
    let m = s.match(/^url\(\s*(["']?)(.*?)\1\s*\)\s*(-?[\d.]+\s+-?[\d.]+)?/);
    if (m) return { mode: 'image', url: m[2], hot: (m[3] || '').replace(/\s+/g, ' ') };
    m = s.match(/^var\(\s*--cursor-([a-z-]+)/);
    if (m) return { mode: 'state:' + m[1] };
    if (s === 'none') return { mode: 'none' };
    return { mode: 'kw:' + s.split(',')[0].trim() };
  }

  const imageValue = (url, hot, fallback) =>
    `url("${String(url).trim().replace(/"/g, '%22')}") ${HOT.test(hot || '') ? hot : '0 0'}, ${fallback || 'auto'}`;

  function valueFor(mode, fallback) {
    if (!mode || mode === 'image') return '';
    if (mode === 'none') return 'none';
    if (mode.startsWith('kw:')) return mode.slice(3);
    const s = stateOf(mode.slice(6));
    return s ? `var(--cursor-${s.id}, ${s.kw})` : '';
  }

  // What the swatch shows on hover: states resolve to the page's own value.
  function previewValue(value) {
    const p = parse(value);
    if (p.mode.startsWith('state:')) {
      const s = stateOf(p.mode.slice(6));
      const page = FigJS.pageBody ? String((FigJS.pageBody.getStyle() || {})['--cursor-' + s.id] || '') : '';
      return page && !/^var\(/.test(page) ? page : (s ? s.kw : '');
    }
    return value || '';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function option(parent, value, label) {
    const o = el('option', null, label);
    o.value = value;
    parent.appendChild(o);
  }

  function group(sel, label) {
    const g = el('optgroup');
    g.label = label;
    sel.appendChild(g);
    return g;
  }

  const ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.3 3.7 6.6-2.4 1.3-3.7-6.6L6 18.5z"/></svg>';

  function cursorField(ctx) {
    const { adapter, prop } = ctx;
    const cfg = prop.cursor || {};
    const wrap = el('div', 'fig-f-cursor');
    const top = el('div', 'fig-f-row');
    const swatch = el('span', 'fig-cursor-swatch');
    swatch.title = 'Hover to try it';
    const sel = el('select', 'fig-f-input');
    top.append(swatch, sel);

    option(sel, '', cfg.blank || 'System');
    option(sel, 'image', 'Custom image…');
    if (cfg.aliases && cfg.aliases.length) {
      const g = group(sel, 'Same as');
      cfg.aliases.forEach((id) => option(g, 'state:' + id, 'Same as ' + stateOf(id).label));
    }
    if (cfg.states) {
      const g = group(sel, 'Site cursors');
      STATES.filter((s) => s.id !== 'pressed').forEach((s) => option(g, 'state:' + s.id, s.label));
    }
    option(sel, 'none', 'Hidden');
    if (cfg.keywords !== false) {
      const g = group(sel, 'System cursors');
      KEYWORDS.forEach(([k, name]) => option(g, 'kw:' + k, name));
    }

    const imageRow = el('div', 'fig-f-row fig-cursor-image');
    const path = el('input', 'fig-f-input');
    path.type = 'text';
    path.spellcheck = false;
    path.placeholder = '/assets/images/cursor.png';
    const browse = el('button', 'fig-f-browse');
    browse.type = 'button';
    browse.innerHTML = FigJS.icons ? FigJS.icons.browse : '…';
    browse.title = 'Browse the media library';
    const hot = el('input', 'fig-f-input fig-f-mono fig-cursor-hot');
    hot.type = 'text';
    hot.spellcheck = false;
    hot.placeholder = '0 0';
    hot.title = 'Hotspot X Y: the point that clicks, in pixels from the top-left corner';
    imageRow.append(path, browse, hot);
    wrap.append(top, imageRow);
    wrap.title = prop.help ? prop.help + (cfg.noImageHelp ? '' : '\n' + IMAGE_HELP) : IMAGE_HELP;

    const c = FigJS.settingsUI.committer(adapter, prop, () => { if (prop.rerender && ctx.rerender) ctx.rerender(); });
    const read = () => String(FigJS.settingsUI.readValue(adapter, prop, { raw: true }) || '');
    let picking = false; // Custom image chosen, no image yet.

    function show() {
      const value = read();
      const p = parse(value);
      const mode = picking ? 'image' : p.mode;
      if (!Array.from(sel.options).some((o) => o.value === mode)) {
        // A value from elsewhere (typed CSS): kept, shown as custom.
        if (!sel.querySelector('option[data-other]')) {
          const o = el('option', null, 'Other: ' + value);
          o.value = mode;
          o.dataset.other = '1';
          sel.appendChild(o);
        }
      }
      sel.value = mode;
      imageRow.hidden = mode !== 'image';
      if (document.activeElement !== path) path.value = p.mode === 'image' ? p.url : '';
      if (document.activeElement !== hot) hot.value = p.mode === 'image' ? p.hot : '';
      const preview = previewValue(value);
      swatch.style.cursor = preview || '';
      swatch.innerHTML = '';
      if (p.mode === 'image' && p.url) {
        const img = el('img');
        img.alt = '';
        img.src = p.url;
        swatch.appendChild(img);
      } else {
        swatch.innerHTML = ARROW;
        swatch.classList.toggle('is-unset', !value);
      }
    }

    function commitImage() {
      const url = path.value.trim();
      if (!url) return;
      const h = hot.value.trim().replace(/[,\s]+/g, ' ');
      picking = false;
      c.begin();
      c.commit(imageValue(url, h, cfg.fallback));
      show();
    }

    sel.addEventListener('focus', c.begin);
    sel.addEventListener('change', () => {
      if (sel.value === 'image') {
        const p = parse(read());
        if (p.mode === 'image') return show();
        picking = true;
        show();
        path.focus();
        return;
      }
      picking = false;
      c.commit(valueFor(sel.value, cfg.fallback));
      show();
    });
    [path, hot].forEach((input) => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', commitImage);
    });
    browse.addEventListener('click', (e) => {
      e.preventDefault();
      if (!FigJS.media || !FigJS.media.pick) return;
      FigJS.media.pick({ kind: 'image' }).then((url) => {
        if (url == null) return;
        path.value = url;
        commitImage();
      });
    });

    show();
    return { el: wrap, refresh: () => { picking = false; show(); } };
  }

  // ===================== Schemas ======================================

  // The page's Default had one cursor before states (--page-cursor):
  // shown until changed, then replaced.
  const legacyDefault = (a) => ({
    ...a,
    read(key, o) { return a.read(key, o) || a.read('--page-cursor', o); },
    write(key, v, o) {
      a.write(key, v, o);
      if (a.read('--page-cursor', { raw: true })) a.write('--page-cursor', '', o);
    },
  });

  function pageSchema() {
    return {
      title: 'Cursor',
      description: 'Replace any cursor state with an image or another system cursor; states left on System keep the browser\'s own. An element can replace them again for what is inside it (Settings, Cursor).',
      properties: STATES.map((s) => ({
        key: '--cursor-' + s.id, label: s.label, type: 'cursor', help: s.help,
        adapter: s.id === 'default' ? legacyDefault : undefined,
        cursor: {
          blank: s.id === 'pressed' ? 'As Pointer' : 'System',
          fallback: s.id === 'default' ? 'auto' : s.kw,
          aliases: s.id === 'default' ? [] : s.id === 'pressed' ? ['default', 'pointer'] : ['default'],
          keywords: true,
        },
      })).concat([
        // Never shown; the block's Copy, Paste and Reset include it.
        { key: '--page-cursor', when: () => false },
      ]),
    };
  }

  // States replaced inside an element: rows for those set, and a picker
  // to replace another.
  function statesField(ctx) {
    const { adapter } = ctx;
    const wrap = el('div', 'fig-cursor-states');
    const list = el('div', 'fig-cursor-states-list');
    const add = el('select', 'fig-f-input fig-cursor-add');
    wrap.append(list, add);
    let extra = [];
    const keyOf = (s) => '--cursor-' + s.id;
    const isSet = (s) => !!adapter.read(keyOf(s), { raw: true });

    function rowFor(s) {
      const prop = {
        key: keyOf(s), label: s.label, help: s.help,
        cursor: { blank: 'As the page', fallback: s.kw, keywords: true },
      };
      const row = el('div', 'fig-row');
      const label = el('label', 'fig-row-label', s.label);
      if (s.help) label.title = s.help;
      const field = cursorField({ adapter, prop, rerender: refresh });
      const remove = el('button', 'fig-icon-btn fig-cursor-remove');
      remove.type = 'button';
      remove.innerHTML = FigJS.icons ? FigJS.icons.close : '×';
      remove.title = `Use the page's ${s.label} cursor here`;
      remove.addEventListener('click', () => {
        extra = extra.filter((id) => id !== s.id);
        if (isSet(s)) {
          const c = FigJS.settingsUI.committer(adapter, prop, null);
          c.begin();
          c.commit('');
        }
        refresh();
      });
      const cell = el('div', 'fig-cursor-state');
      cell.append(field.el, remove);
      row.append(label, cell);
      return row;
    }

    function refresh() {
      list.textContent = '';
      const shown = STATES.filter((s) => s.id !== 'default' && (isSet(s) || extra.includes(s.id)));
      shown.forEach((s) => list.appendChild(rowFor(s)));
      add.textContent = '';
      option(add, '', shown.length ? 'Replace another state…' : 'Replace a state inside…');
      STATES.filter((s) => s.id !== 'default' && !shown.includes(s)).forEach((s) => option(add, s.id, s.label));
      add.hidden = add.options.length < 2;
    }

    add.addEventListener('change', () => {
      if (add.value) extra.push(add.value);
      refresh();
      const last = list.lastElementChild;
      const select = last && last.querySelector('select');
      if (select) select.focus();
    });

    refresh();
    return { el: wrap, refresh };
  }

  function elementSchema() {
    return {
      title: 'Cursor',
      properties: [
        { key: 'cursor', label: 'Cursor', type: 'cursor',
          help: 'This element\'s own cursor, over it and anything inside without one of its own; it outranks the page\'s. Site cursors use the page\'s images (Page tab, Cursor).',
          cursor: { blank: 'Inherited', fallback: 'auto', states: true, keywords: false } },
        { label: 'Inside', wide: true, build: statesField,
          help: 'Replace a cursor state for everything inside this element: a link inside shows this Pointer, its text this Text.' },
        // Rendered by Inside; listed for the block's Copy, Paste and Reset.
        ...STATES.filter((s) => s.id !== 'default').map((s) => ({ key: '--cursor-' + s.id, when: () => false })),
      ],
    };
  }

  if (FigJS.settingsUI && FigJS.settingsUI.registerField) FigJS.settingsUI.registerField('cursor', cursorField);

  FigJS.cursors = { STATES, pageSchema, elementSchema, parse };
})();
