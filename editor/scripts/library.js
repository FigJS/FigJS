// Library: saved elements that stay linked. Instances on every page share
// all settings (styles, component settings, attributes, preset tags);
// content (text, images, links, alt text, translations) is per instance.
//   - An instance root has data-lib="<item id>", every node inside
//     data-lib-node="<key>".
//   - Styles: each node's shared rule is the class lib-<id>-<key>, tagged
//     library and saved to /assets/css/library.css. styleTargetFor()
//     returns it (creating it and classing every instance on first use);
//     the Style Manager and settings blocks write through it.
//   - Attributes and preset tags: edits mirror to counterparts on the
//     page in the same undo step. Saving updates the item's master
//     (keeping its content); loading a page applies masters to instances.
// Make Local detaches: library rules are cloned onto page-local classes
// and the data-lib markers removed.
//   FigJS.library.install() / refreshList() / loadRules() / serializeRules(rules)
//   FigJS.library.styleTargetFor(comp)   shared rule, or null
//   FigJS.library.instanceLabel(comp)    item name, or ''
//   FigJS.library.syncInstances()        masters -> instances (page load)
//   FigJS.library.pushMasters()          instances -> masters (save)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Per-instance content; everything else is a shared setting.
  const CONTENT_ATTR = /^(id|data-lib|data-lib-node|src|srcset|sizes|href|alt|title|placeholder|value|aria-label|aria-labelledby|aria-describedby|data-src(-.*)?|data-full-src|data-caption|data-poster(-.*)?|data-md|data-md-i18n|data-game-url|data-title|data-tooltip-text(-.*)?|data-lang-.*|data-i18n-.*|data-link-href|data-anchor-slug|data-copy-text|(alt|title|aria-label|placeholder)-[a-z]{2,3}(-[a-z0-9]+)?)$/;
  const LIB_CLASS_RE = /^lib-/;

  let items = [];
  let syncing = false;          // Guards mirror recursion.
  const dirtyItems = new Set(); // Items whose settings changed this session.

  function editor() { return FigJS.editor; }

  // A rule of preset classes only (.badge, .hover-underline) would restyle
  // that preset everywhere: dropped on load, so it leaves library.css.
  function isPresetOnlyRule(rule) {
    const names = (rule.selectors || []).map((s) => (typeof s === 'string' ? s : (s && s.name) || ''));
    if (!names.length || rule.selectorsAdd) return false;
    const presets = window.PresetRegistry.getPresetClasses();
    return names.every((n) => presets.has(n.replace(/^\./, '')));
  }

  // The site links library.css before the page's <style>, so the page wins
  // ties; the CssComposer keeps library rules first too.
  function ensureLibraryFirst() {
    const ed = editor();
    if (!ed) return;
    const all = ed.Css.getAll();
    const models = all.models || [];
    const firstPage = models.findIndex((r) => !r.get('library'));
    if (firstPage < 0 || !models.slice(firstPage).some((r) => r.get('library'))) return;
    const page = models.filter((r) => !r.get('library'));
    const css = serializeRules(page);
    FigJS.undo.untracked(() => {
      all.remove(page);
      if (css.trim()) ed.Css.addRules(css);
    });
  }

  async function loadRules() {
    const ed = editor();
    if (!ed) return;
    try {
      const res = await fetch('/assets/css/library.css', { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const parsed = (text.trim() ? ed.Parser.parseCss(text) : [])
        .filter((r) => !isPresetOnlyRule(r));
      FigJS.undo.untracked(() => {
        const all = ed.Css.getAll();
        const existing = (all.models || []).filter((r) => r.get('library'));
        if (existing.length) all.remove(existing);
        if (parsed.length) {
          (ed.Css.addCollection(parsed, { avoidUpdateStyle: true }) || [])
            .forEach((r) => { if (r && r.set) r.set('library', true); });
        }
      });
      ensureLibraryFirst();
    } catch (e) {
      console.warn('[library] could not load library.css:', e);
    }
  }

  function serializeRules(rules) {
    const out = [];
    (rules || []).forEach((r) => {
      try {
        if (typeof r.isNested === 'function' && r.isNested()) return;
        const css = r.toCSS();
        if (css && css.trim()) out.push(css);
      } catch (e) { }
    });
    return out.join('\n');
  }

  function currentMedia() {
    const ed = editor();
    try { return ed.getModel().getCurrentMedia() || ''; } catch (e) { return ''; }
  }

  function currentState() {
    const ed = editor();
    try {
      const s = ed.getModel().get('state');
      return typeof s === 'string' ? s : '';
    } catch (e) { return ''; }
  }

  function findRule(cls, media, state) {
    const ed = editor();
    return (ed.Css.getAll().models || []).find((r) => {
      if ((r.get('mediaText') || '') !== (media || '')) return false;
      if ((r.get('state') || '') !== (state || '')) return false;
      const sels = r.getSelectors().models || [];
      return sels.length === 1 && sels[0].getName() === cls && !r.get('selectorsAdd');
    }) || null;
  }

  // ===================== Instances =====================================

  function rootOf(comp) {
    let c = comp;
    while (c) {
      const a = c.getAttributes && c.getAttributes();
      if (a && a['data-lib']) return c;
      c = c.parent && c.parent();
    }
    return null;
  }

  function nodeKey(comp) {
    const a = comp.getAttributes() || {};
    return a['data-lib-node'] || (a['data-lib'] ? 'root' : '');
  }

  function instancesOf(id) {
    const ed = editor();
    return ed ? ed.getWrapper().find(`[data-lib="${id}"]`) : [];
  }

  function counterparts(comp) {
    const root = rootOf(comp);
    if (!root) return [];
    const id = root.getAttributes()['data-lib'];
    const key = nodeKey(comp);
    if (!key) return [];
    return instancesOf(id)
      .filter((r) => r !== root)
      .map((r) => (key === 'root' ? r : r.find(`[data-lib-node="${key}"]`)[0]))
      .filter(Boolean);
  }

  function itemName(id) {
    const it = items.find((x) => x.id === id);
    return it ? it.name : id;
  }

  function instanceLabel(comp) {
    const root = comp && rootOf(comp);
    if (!root || !nodeKey(comp)) return classLinkedRule(comp) ? 'Library' : '';
    return itemName(root.getAttributes()['data-lib']);
  }

  // Elements linked by a library-tagged class rule alone (no data-lib)
  // are edited through that rule, never through a preset class.
  function classLinkedRule(comp) {
    const ed = editor();
    if (!ed || !comp || !comp.getClasses) return null;
    const classes = comp.getClasses();
    if (!classes.length) return null;
    const presets = window.PresetRegistry.getPresetClasses();
    const media = currentMedia();
    const candidates = (ed.Css.getAll().models || []).filter((r) => {
      if (!r.get('library') || r.get('state')) return false;
      const names = (r.getSelectors().models || []).map((s) => s.getName());
      return names.length && names.every((n) => classes.includes(n)) && names.some((n) => !presets.has(n));
    });
    return candidates.find((r) => (r.get('mediaText') || '') === media)
      || candidates.find((r) => !(r.get('mediaText') || ''))
      || null;
  }

  // The rule all instances of this node share at the current device and
  // state; created on first use, with the class added to every counterpart.
  function styleTargetFor(comp) {
    if (!comp || typeof comp.getAttributes !== 'function') return null;
    const root = rootOf(comp);
    const key = root ? nodeKey(comp) : '';
    if (!root || !key) {
      const linked = classLinkedRule(comp);
      if (!linked) return null;
      const media = currentMedia();
      if ((linked.get('mediaText') || '') === media) return linked;
      const sel = (linked.getSelectors().models || []).map((s) => s.getFullName()).join('');
      let made = null;
      FigJS.undo.untracked(() => {
        made = editor().Css.setRule(sel, {}, { atRuleType: 'media', atRuleParams: media });
        if (made) made.set('library', true);
      });
      return made || linked;
    }

    const id = root.getAttributes()['data-lib'];
    const cls = `lib-${id}-${key}`;
    const media = currentMedia();
    const state = currentState();
    let rule = findRule(cls, media, state);
    if (rule) return rule;

    // Not a user edit: invisible until a value lands.
    syncing = true;
    try {
      FigJS.undo.untracked(() => {
        [comp].concat(counterparts(comp)).forEach((c) => {
          if (!c.getClasses().includes(cls)) c.addClass(cls);
        });
        const sel = '.' + cls + (state ? ':' + state : '');
        rule = media
          ? editor().Css.setRule(sel, {}, { atRuleType: 'media', atRuleParams: media })
          : editor().Css.setRule(sel, {});
        if (rule) rule.set('library', true);
      });
    } finally { syncing = false; }
    dirtyItems.add(id);
    return rule;
  }

  // ===================== Mirroring edits between instances ============

  function sharedAttrs(comp) {
    const out = {};
    Object.entries(comp.getAttributes() || {}).forEach(([k, v]) => {
      if (!CONTENT_ATTR.test(k) && k !== 'class' && k !== 'style') out[k] = v;
    });
    return out;
  }

  function mirrorAttributes(comp) {
    if (syncing || FigJS.state.isInternalUpdate) return;
    const targets = counterparts(comp);
    if (!targets.length) return;
    const want = sharedAttrs(comp);
    syncing = true;
    try {
      targets.forEach((t) => {
        const have = sharedAttrs(t);
        const add = {};
        Object.entries(want).forEach(([k, v]) => { if (have[k] !== v) add[k] = v; });
        const remove = Object.keys(have).filter((k) => !(k in want));
        if (Object.keys(add).length) t.addAttributes(add);
        if (remove.length) t.removeAttributes(remove);
      });
      dirtyItems.add(rootOf(comp).getAttributes()['data-lib']);
    } finally { syncing = false; }
  }

  function mirrorClasses(comp) {
    if (syncing || FigJS.state.isInternalUpdate) return;
    const targets = counterparts(comp);
    if (!targets.length) return;
    const want = comp.getClasses();
    syncing = true;
    try {
      targets.forEach((t) => {
        const have = t.getClasses();
        want.forEach((c) => { if (!have.includes(c)) t.addClass(c); });
        have.forEach((c) => { if (!want.includes(c)) t.removeClass(c); });
      });
      dirtyItems.add(rootOf(comp).getAttributes()['data-lib']);
    } finally { syncing = false; }
  }

  // ===================== Masters <-> instances ========================

  async function fetchItems() {
    try {
      const data = await (await fetch('/api/library', { cache: 'no-store' })).json();
      items = data.items || [];
    } catch (e) { }
    return items;
  }

  function parseMaster(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '').trim();
    return tpl.content.firstElementChild;
  }

  function masterNodes(rootEl) {
    const map = new Map();
    if (!rootEl) return map;
    map.set('root', rootEl);
    rootEl.querySelectorAll('[data-lib-node]').forEach((n) => map.set(n.getAttribute('data-lib-node'), n));
    return map;
  }

  // Page load: every instance takes its master's settings.
  async function syncInstances() {
    const ed = editor();
    if (!ed) return;
    const roots = ed.getWrapper().find('[data-lib]');
    if (!roots.length) return;
    await fetchItems();
    syncing = true;
    try {
      FigJS.undo.untracked(() => {
        roots.forEach((root) => {
          const item = items.find((x) => x.id === root.getAttributes()['data-lib']);
          if (!item) return;
          const nodes = masterNodes(parseMaster(item.html));
          const apply = (comp, key) => {
            const src = nodes.get(key);
            if (!src) return;
            const want = {};
            Array.from(src.attributes).forEach((a) => {
              if (!CONTENT_ATTR.test(a.name) && a.name !== 'class' && a.name !== 'style') want[a.name] = a.value;
            });
            const have = sharedAttrs(comp);
            const add = {};
            Object.entries(want).forEach(([k, v]) => { if (have[k] !== v) add[k] = v; });
            const remove = Object.keys(have).filter((k) => !(k in want));
            if (Object.keys(add).length) comp.addAttributes(add);
            if (remove.length) comp.removeAttributes(remove);
            const wantCls = (src.getAttribute('class') || '').split(/\s+/).filter(Boolean);
            const haveCls = comp.getClasses();
            wantCls.forEach((c) => { if (!haveCls.includes(c)) comp.addClass(c); });
            haveCls.forEach((c) => { if (!wantCls.includes(c)) comp.removeClass(c); });
          };
          apply(root, 'root');
          root.find('[data-lib-node]').forEach((c) => apply(c, c.getAttributes()['data-lib-node']));
        });
      });
    } finally { syncing = false; }
  }

  // Save: masters take the edited settings; master content is kept.
  async function pushMasters() {
    if (!dirtyItems.size) return;
    const ed = editor();
    await fetchItems();
    const ids = Array.from(dirtyItems);
    dirtyItems.clear();
    await Promise.all(ids.map(async (id) => {
      const item = items.find((x) => x.id === id);
      const inst = instancesOf(id)[0];
      if (!item || !inst) return;
      const masterRoot = parseMaster(item.html);
      if (!masterRoot) return;
      const nodes = masterNodes(masterRoot);
      const copy = (comp, key) => {
        const dst = nodes.get(key);
        if (!dst) return;
        Array.from(dst.attributes).forEach((a) => {
          if (!CONTENT_ATTR.test(a.name) && a.name !== 'style') dst.removeAttribute(a.name);
        });
        Object.entries(sharedAttrs(comp)).forEach(([k, v]) => dst.setAttribute(k, v));
        const cls = comp.getClasses();
        if (cls.length) dst.setAttribute('class', cls.join(' '));
      };
      copy(inst, 'root');
      inst.find('[data-lib-node]').forEach((c) => copy(c, c.getAttributes()['data-lib-node']));
      try {
        await fetch('/api/library/item/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: masterRoot.outerHTML }),
        });
      } catch (e) { dirtyItems.add(id); }
    }));
    if (ed) refreshList();
  }

  // ===================== Make Library Element =========================

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  function idRulesFor(comp) {
    const ed = editor();
    const id = comp.getId();
    return (ed.Css.getAll().models || []).filter((r) => {
      const sels = r.getSelectors().models || [];
      return sels.length === 1 && sels[0].isId && sels[0].isId() && sels[0].getName() === id;
    });
  }

  async function makeLibraryElement() {
    const ed = editor();
    const selected = ed.getSelected();
    if (!selected) { FigJS.setStatus('Select an element first.', '#ff9800'); return; }
    if (selected === ed.getWrapper()) { FigJS.setStatus('The page body cannot be a Library element.', '#ff9800'); return; }
    if (rootOf(selected)) { FigJS.setStatus('This element is already part of a Library element.', '#ff9800'); return; }

    const name = await FigJS.dialog.prompt({ title: 'New Library element', label: 'Name', placeholder: 'e.g. Sticky Header' });
    if (!name || !name.trim()) return;
    const id = slugify(name) + '-' + Math.random().toString(36).slice(2, 6);

    // One synchronous pass, one undo step: mark every node and move its
    // styles (all devices and states) onto its shared class.
    let promoted = 0;
    let n = 0;
    const visit = (c, isRoot) => {
      const key = isRoot ? 'root' : 'n' + (++n);
      if (isRoot) c.addAttributes({ 'data-lib': id });
      else c.addAttributes({ 'data-lib-node': key });
      const cls = `lib-${id}-${key}`;
      const rules = idRulesFor(c);
      if (rules.length || isRoot) c.addClass(cls);
      rules.forEach((rule) => {
        const media = rule.get('mediaText') || '';
        const state = rule.get('state') || '';
        const sel = '.' + cls + (state ? ':' + state : '');
        const style = { ...(rule.getStyle('', { skipResolve: true }) || {}) };
        const made = media ? ed.Css.setRule(sel, style, { atRuleType: 'media', atRuleParams: media })
                           : ed.Css.setRule(sel, style);
        if (made) made.set('library', true);
        ed.Css.remove(rule);
        promoted++;
      });
      c.components().forEach((child) => { if (child.get('type') !== 'textnode') visit(child, false); });
    };
    visit(selected, true);
    if (!findRule(`lib-${id}-root`, '', '')) {
      const r = ed.Css.setRule(`.lib-${id}-root`, {});
      if (r) r.set('library', true);
    }

    const html = selected.toHTML();
    const css = serializeRules((ed.Css.getAll().models || []).filter((r) =>
      r.get('library') && (r.getSelectors().models || []).some((s) => s.getName().startsWith(`lib-${id}-`))));

    try {
      FigJS.setStatus('Saving to Library');
      const res = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: name.trim(), html, css }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      FigJS.markUnsaved();
      FigJS.setStatus(`"${name.trim()}" is now a Library element (${promoted} style rule${promoted === 1 ? '' : 's'} shared). Save the page to keep the link.`, '#4caf50');
      refreshList();
      FigJS.presetsTab.render();
      FigJS.componentSettings.render(true);
      FigJS.codeView.debouncedSync();
    } catch (e) {
      console.error(e);
      FigJS.setStatus('Library save failed: ' + e.message + ' (undo to revert the element)', '#f44336');
    }
  }

  // ===================== Make Local ===================================

  function makeUniqueLocalClass(base) {
    const ed = editor();
    const stem = String(base).replace(/^lib-/, '').replace(/--local(-\d+)?$/, '') + '--local';
    const taken = new Set((ed.Selectors.getAll().models || []).map((s) => s.getName()));
    let candidate = stem;
    let n = 1;
    while (taken.has(candidate)) candidate = `${stem}-${++n}`;
    return candidate;
  }

  function makeLocal() {
    const ed = editor();
    const selected = ed.getSelected();
    if (!selected) { FigJS.setStatus('Select an element first.', '#ff9800'); return; }

    const presetNames = window.PresetRegistry.getPresetClasses();
    const libRules = (ed.Css.getAll().models || []).filter((r) => r.get('library'));
    const libNames = new Set();
    libRules.forEach((r) => (r.getSelectors().models || []).forEach((s) => {
      const nm = s.getName();
      if (nm && !presetNames.has(nm)) libNames.add(nm);
    }));

    const root = rootOf(selected) || selected;
    const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mapping = new Map();
    let touched = 0;

    // Clone every library rule mentioning L onto the local class L2
    // (states, media, descendant selectors and var() settings unchanged).
    const cloneRulesFor = (L, L2) => {
      const mention = new RegExp('\\.' + esc(L) + '(?![\\w-])', 'g');
      libRules.forEach((rule) => {
        let selStr = '';
        try { selStr = rule.selectorsToString(); } catch (e) {}
        if (!selStr || !new RegExp('\\.' + esc(L) + '(?![\\w-])').test(selStr)) return;
        const opts = {};
        if (rule.get('atRuleType')) opts.atRuleType = rule.get('atRuleType');
        if (rule.get('mediaText')) opts.atRuleParams = rule.get('mediaText');
        ed.Css.setRule(selStr.replace(mention, '.' + L2), { ...(rule.getStyle('', { skipResolve: true }) || {}) }, opts);
      });
    };

    const visit = (c) => {
      const used = c.getClasses().filter((n) => libNames.has(n));
      used.forEach((L) => {
        if (!mapping.has(L)) { mapping.set(L, makeUniqueLocalClass(L)); cloneRulesFor(L, mapping.get(L)); }
        c.addClass(mapping.get(L));
        c.removeClass(L);
      });
      const a = c.getAttributes();
      if (a['data-lib'] || a['data-lib-node']) c.removeAttributes(['data-lib', 'data-lib-node']);
      if (used.length || a['data-lib'] || a['data-lib-node']) touched++;
      c.components().forEach(visit);
    };
    visit(root);

    if (!touched) { FigJS.setStatus('Nothing to detach: this element is not linked to the Library.', '#ff9800'); return; }
    if (ed.StyleManager && ed.StyleManager.select) { try { ed.StyleManager.select(selected); } catch (e) {} }
    FigJS.presetsTab.render();
    FigJS.componentSettings.render(true);
    FigJS.codeView.debouncedSync();
    FigJS.setStatus('Detached from the Library. Edits now stay on this element.', '#4caf50');
  }

  // Library tab thumbnails: each item rendered in a lazy iframe with the
  // site stylesheets, then scaled to the tile.

  let thumbCss = null;
  function thumbHead() {
    if (thumbCss) return thumbCss;
    const deps = window.PresetRegistry.getDependencies();
    thumbCss = deps.css.map((h) => `<link rel="stylesheet" href="${h}">`).join('');
    return thumbCss;
  }

  // Laid out at desktop width (no phone breakpoint, site scale or page
  // min-height), measured, then scaled; small elements up to 1.5x.
  const THUMB_LAYOUT_WIDTH = 1024;
  const THUMB_MAX_SCALE = 1.5;

  function renderThumb(frame, item) {
    const theme = (FigJS.pageBody && FigJS.pageBody.getAttr('data-theme')) || 'dark';
    frame.style.width = THUMB_LAYOUT_WIDTH + 'px';
    frame.style.height = '768px';
    frame.srcdoc = `<!DOCTYPE html><html data-theme="${theme}"><head><meta charset="utf-8">${thumbHead()}` +
      '<style>html{zoom:1!important;background:transparent!important}' +
      'html,body{margin:0;overflow:hidden}' +
      'body{display:inline-block;padding:12px;min-width:0;min-height:0!important;background:transparent!important}' +
      `</style></head><body data-theme="${theme}">${item.html || ''}</body></html>`;
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const fit = () => {
        const b = doc.body;
        const r = b.getBoundingClientRect();
        const w = Math.max(1, Math.ceil(r.width)), h = Math.max(1, Math.ceil(r.height));
        const box = frame.parentElement.getBoundingClientRect();
        const scale = Math.min(THUMB_MAX_SCALE, (box.width - 8) / w, (box.height - 8) / h);
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
        frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
      };
      (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(fit));
      fit();
    }, { once: true });
  }

  const thumbObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      thumbObserver.unobserve(e.target);
      const frame = e.target.querySelector('iframe');
      if (frame && frame.__item) renderThumb(frame, frame.__item);
    });
  }) : null;

  function insertItem(item) {
    const ed = editor();
    const sel = ed.getSelected();
    let added;
    if (sel && sel !== ed.getWrapper() && sel.parent()) {
      added = sel.parent().append(item.html, { at: sel.index() + 1 });
    } else {
      const main = ed.getWrapper().find('main')[0] || ed.getWrapper();
      added = main.append(item.html);
    }
    const comp = Array.isArray(added) ? added[0] : added;
    if (comp) ed.select(comp);
    FigJS.markUnsaved();
  }

  async function refreshList() {
    const container = document.getElementById('library-list');
    if (!container) return;
    await fetchItems();
    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = '<div class="fig-empty">No Library elements yet. Select an element and press ' +
        '<em>Make Library Element</em>. Every copy stays linked: change its settings once and every ' +
        'instance, on every page, follows. Text and images stay per copy.</div>';
      return;
    }

    const counts = new Map();
    if (editor()) editor().getWrapper().find('[data-lib]').forEach((r) => {
      const id = r.getAttributes()['data-lib'];
      counts.set(id, (counts.get(id) || 0) + 1);
    });

    const grid = document.createElement('div');
    grid.className = 'library-grid';
    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'library-item';
      card.draggable = true;
      card.title = 'Drag onto the canvas, or press Insert';

      const preview = document.createElement('div');
      preview.className = 'library-item-preview';
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.__item = item;
      preview.appendChild(frame);
      card.appendChild(preview);
      if (thumbObserver) thumbObserver.observe(card); else renderThumb(frame, item);

      const info = document.createElement('div');
      info.className = 'library-item-info';
      const nm = document.createElement('span');
      nm.className = 'library-item-name';
      nm.textContent = item.name;
      const count = document.createElement('span');
      count.className = 'library-item-count';
      const c = counts.get(item.id) || 0;
      count.textContent = c ? `${c} on this page` : '';
      info.append(nm, count);

      const actions = document.createElement('div');
      actions.className = 'library-item-actions';
      const ins = document.createElement('button');
      ins.type = 'button';
      ins.textContent = 'Insert';
      ins.addEventListener('click', (e) => { e.stopPropagation(); insertItem(item); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'is-danger';
      del.innerHTML = FigJS.icons.close;
      del.title = 'Delete from the Library';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await FigJS.dialog.confirm({
          title: `Delete "${item.name}"?`,
          message: 'Existing copies keep their look (the shared CSS stays) but stop being linked to a master.',
          okLabel: 'Delete', danger: true,
        });
        if (!ok) return;
        await fetch('/api/library/item/' + encodeURIComponent(item.id), { method: 'DELETE' });
        refreshList();
      });
      actions.append(ins, del);
      info.appendChild(actions);
      card.appendChild(info);

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/html', item.html || '');
        e.dataTransfer.setData('text/plain', item.name);
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  // ===================== Install ======================================

  function install() {
    const ed = editor();
    document.getElementById('btn-save-to-library').addEventListener('click', makeLibraryElement);
    document.getElementById('btn-unlink-library').addEventListener('click', makeLocal);

    ed.on('component:update:attributes', (comp) => { if (rootOf(comp)) mirrorAttributes(comp); });
    ed.on('component:update:classes', (comp) => { if (rootOf(comp)) mirrorClasses(comp); });
    // Shared-rule edits mark the item changed.
    ed.on('styleable:change', (target) => {
      try {
        if (target && target.get && target.get('library')) {
          (target.getSelectors().models || []).forEach((s) => {
            const m = s.getName().match(/^lib-(.+)-(root|n\d+)$/);
            if (m) dirtyItems.add(m[1]);
          });
        }
      } catch (e) {}
    });
  }

  FigJS.library = {
    install,
    loadRules,
    ensureLibraryFirst,
    serializeRules,
    refreshList,
    styleTargetFor,
    instanceLabel,
    syncInstances,
    pushMasters,
  };
})();
