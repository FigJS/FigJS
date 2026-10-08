// Layer Manager: selecting opens the path to the element and keeps
// other open layers open; a bar above the tree filters, expands,
// collapses and shows the selected layer.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const BAR_ID = 'fig-layers-bar';

  let filterTerm = '';

  function lm() { return FigJS.editor.Layers; }
  function all() { return FigJS.editor.getWrapper().find('*'); }

  // GrapesJS closes the layers it opened for the previous selection;
  // clearing its list keeps them open.
  function forgetAutoOpened() {
    const model = lm().model;
    if (model && model.get) model.set('opened', {}, { silent: true });
  }

  function expandAll() {
    all().forEach((c) => { if (c.components().length) lm().setOpen(c, true); });
  }

  function collapseAll() {
    all().forEach((c) => lm().setOpen(c, false));
  }

  function showSelected() {
    const sel = FigJS.editor.getSelected();
    if (!sel) return;
    for (let p = sel.parent(); p; p = p.parent()) lm().setOpen(p, true);
    requestAnimationFrame(() => {
      const el = sel.viewLayer && sel.viewLayer.el;
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }

  function applyFilter() {
    const term = filterTerm.trim().toLowerCase();
    const comps = all();
    const keep = new Set();
    if (term) {
      comps.forEach((c) => {
        const name = String(c.getName ? c.getName() : '').toLowerCase();
        const classes = c.getClasses().join(' ').toLowerCase();
        if (name.includes(term) || classes.includes(term)) {
          for (let p = c; p; p = p.parent()) keep.add(p);
        }
      });
      keep.forEach((c) => { if (c.components().length) lm().setOpen(c, true); });
    }
    comps.forEach((c) => {
      const el = c.viewLayer && c.viewLayer.el;
      if (el) el.style.display = !term || keep.has(c) ? '' : 'none';
    });
  }

  function ensureBar() {
    if (document.getElementById(BAR_ID)) return;
    const tree = document.querySelector('.gjs-pn-views-container .gjs-layer__t-wrapper');
    const root = tree && tree.parentNode;
    if (!root) return;

    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'fig-sticky-bar';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'fig-input';
    input.placeholder = 'Filter layers';
    input.value = filterTerm;
    input.addEventListener('input', () => { filterTerm = input.value; applyFilter(); });

    const row = document.createElement('div');
    row.className = 'fig-bar-row';
    const btn = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      row.appendChild(b);
    };
    btn('Expand all', 'Open every layer', expandAll);
    btn('Collapse all', 'Close every layer', collapseAll);
    btn('Show selected', 'Open the path to the selected element and scroll to it', showSelected);

    bar.append(input, row);
    root.insertBefore(bar, root.firstChild);
  }

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;
    const later = () => setTimeout(forgetAutoOpened, 0);
    editor.on('component:toggled', later);
    editor.on('component:selected', later);
    ['open-layers', 'core:open-layers'].forEach((id) => {
      editor.on('command:run:' + id, () => setTimeout(ensureBar, 0));
    });
    editor.on('layer:root', () => setTimeout(ensureBar, 0));
    editor.on('component:add component:remove', () => { if (filterTerm) setTimeout(applyFilter, 0); });
    forgetAutoOpened();
  }

  FigJS.layers = { install };
})();
