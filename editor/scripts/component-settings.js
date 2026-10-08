// Top of the Settings panel: the selected component preset's settings
// and those of its composed preset tags, rendered by FigJS.settingsUI.
// GrapesJS's traits follow below.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const HOST_ID = 'fig-component-settings';

  function reg() { return window.PresetRegistry; }

  function findTraitsRoot() {
    const noCats = document.querySelector('[data-no-categories], [data-categories]');
    if (noCats && noCats.parentNode) return noCats.parentNode;
    const traits = document.querySelector('.gjs-trt-traits');
    return traits && traits.parentNode ? traits.parentNode : null;
  }

  // GrapesJS's own types; their settings (base-elements.preset.js) apply
  // only when no component preset matches.
  const BASE_TYPES = new Set(['default', 'text', 'image', 'link', 'video', 'textnode']);

  function presetFor(c) {
    const type = c.get && c.get('type');
    if (type && !BASE_TYPES.has(type) && reg().getComponentSettings(type)) return type;
    const viaClass = reg().matchComponentPresetType((c.getClasses && c.getClasses()) || []);
    if (viaClass && (reg().getComponentSettings(viaClass) || (reg().getComponentDefinition(viaClass) || {}).tags)) {
      return viaClass;
    }
    return null;
  }

  // The component preset of the element; else its base settings; else,
  // for a part inside a component, the nearest ancestor preset.
  function resolveSettingsComponent(selected) {
    const own = presetFor(selected);
    if (own) return { comp: selected, type: own };
    // Parts of fixed widgets (language switcher, badge) use the widget's settings.
    let up = selected.parent && selected.parent();
    for (let depth = 0; up && depth < 4; depth++) {
      const t = presetFor(up);
      if (t) {
        const def = reg().getComponentDefinition(t);
        if (def && def.partSettings) return { comp: up, type: t, part: selected };
        if (def && !def.droppable) return { comp: up, type: t };
        break;
      }
      up = up.parent && up.parent();
    }
    // The default type reports ''.
    const baseType = (selected.get && selected.get('type')) || 'default';
    if (baseType && reg().getComponentSettings(baseType)) return { comp: selected, type: baseType };
    let c = selected.parent && selected.parent();
    for (let depth = 0; c && depth < 6; depth++) {
      const t = presetFor(c);
      if (t) return { comp: c, type: t };
      c = c.parent && c.parent();
    }
    return null;
  }

  // The schema without the given keys, and without groups left empty.
  function withoutKeys(schema, keys) {
    const props = (schema.properties || []).filter((p) => !(p.key && keys.has(p.key)));
    const kept = props.filter((p, i) => {
      if (p.type !== 'group') return true;
      const next = props[i + 1];
      return !!next && next.type !== 'group';
    });
    return { ...schema, properties: kept };
  }

  function ensureHost() {
    const traitsRoot = findTraitsRoot();
    let host = document.getElementById(HOST_ID);
    if (!traitsRoot) {
      if (host) host.remove();
      return null;
    }
    if (!host || host.parentNode !== traitsRoot.parentNode || host.nextSibling !== traitsRoot) {
      if (host) host.remove();
      host = document.createElement('div');
      host.id = HOST_ID;
      host.className = 'fig-component-settings';
      traitsRoot.parentNode.insertBefore(host, traitsRoot);
    }
    host.style.display = traitsRoot.offsetParent !== null ? '' : 'none';
    return host;
  }

  // Search: filters rows by label. A matching block, group or trait
  // category title shows all its rows; trait categories open while searching.

  const SEARCH_ID = 'fig-settings-search';
  let term = '';

  function placeSearch() {
    const host = document.getElementById(HOST_ID);
    let bar = document.getElementById(SEARCH_ID);
    if (!host) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = SEARCH_ID;
      const input = document.createElement('input');
      input.type = 'search';
      input.className = 'fig-input';
      input.placeholder = 'Search settings';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.addEventListener('input', () => { term = input.value; filterSettings(); });
      bar.appendChild(input);
    }
    if (bar.nextSibling !== host) host.parentNode.insertBefore(bar, host);
    bar.style.display = host.style.display;
  }

  const textOf = (el) => ((el && el.textContent) || '').toLowerCase();

  function filterSettings() {
    const n = term.trim().toLowerCase();
    const host = document.getElementById(HOST_ID);
    if (host) {
      host.querySelectorAll('.fig-block').forEach((block) => {
        const whole = !n || textOf(block.querySelector('.fig-block-title')).includes(n);
        let any = false;
        block.querySelectorAll('.fig-row').forEach((row) => {
          const group = row.closest('.fig-block-group');
          const m = whole || textOf(row.querySelector('.fig-row-label')).includes(n)
            || (group && textOf(group.querySelector('.fig-block-group-title')).includes(n));
          row.style.display = m ? '' : 'none';
          if (m) any = true;
        });
        block.querySelectorAll('.fig-block-group').forEach((g) => {
          const shown = Array.prototype.some.call(g.querySelectorAll('.fig-row'), (r) => r.style.display !== 'none');
          g.style.display = !n || shown ? '' : 'none';
        });
        block.querySelectorAll('.fig-block-desc').forEach((d) => { d.style.display = n ? 'none' : ''; });
        block.style.display = whole || any ? '' : 'none';
      });
      const scope = host.querySelector('.fig-scope-line');
      if (scope) scope.style.display = '';
    }
    document.querySelectorAll('.gjs-trt-trait').forEach((row) => {
      const cat = row.closest('.gjs-trait-category');
      const m = !n || textOf(row.querySelector('.gjs-label')).includes(n)
        || (cat && textOf(cat.querySelector('.gjs-title')).includes(n));
      const box = row.closest('.gjs-trt-trait__wrp') || row;
      if (m) box.style.removeProperty('display');
      else box.style.setProperty('display', 'none', 'important');
      row.classList.toggle('fig-search-miss', !m);
    });
    document.querySelectorAll('.gjs-trait-category').forEach((cat) => {
      const shown = Array.prototype.some.call(cat.querySelectorAll('.gjs-trt-trait'), (r) => !r.classList.contains('fig-search-miss'));
      cat.style.display = !n || shown ? '' : 'none';
      cat.classList.toggle('fig-force-open', !!n && shown);
    });
  }

  function render(force) {
    renderSettings(force);
    placeSearch();
    filterSettings();
  }

  // force: rebuild for the same component (after undo/redo). Never during a drag.
  function renderSettings(force) {
    const editor = FigJS.editor;
    if (!editor) return;
    const host = ensureHost();
    if (!host) return;

    const selected = editor.getSelected();
    const resolved = selected ? resolveSettingsComponent(selected) : null;
    const comp = resolved ? resolved.comp : null;
    const parent = selected && selected.parent && selected.parent();
    const childSchemas = parent ? reg().getChildSettings(parent.getClasses()) : [];
    const roleSchemas = selected ? reg().getRoleSettings(selected) : [];
    const key = (comp ? comp.cid : '') + '|'
      + ((childSchemas.length || roleSchemas.length || (resolved && resolved.part)) && selected ? selected.cid : '');
    if (force !== true && host.dataset.forCid === key && host.firstChild) {
      host.querySelectorAll('.fig-block').forEach((b) => b.__refresh && b.__refresh());
      return;
    }
    host.innerHTML = '';
    host.dataset.forCid = key;

    // Placement in a parent with a role (free canvas) comes first, then the
    // role where it sits (a gallery slide), whose keys leave its own block.
    childSchemas.forEach((schema, i) => {
      host.appendChild(FigJS.settingsUI.renderBlock(FigJS.settingsUI.componentAdapter(selected), schema, {
        id: 'child:' + i + ':' + (schema.title || ''), compact: true, rerender: () => render(true),
      }));
    });
    const replaced = new Set();
    roleSchemas.forEach((schema, i) => {
      (schema.replaces || []).forEach((k) => replaced.add(k));
      host.appendChild(FigJS.settingsUI.renderBlock(FigJS.settingsUI.componentAdapter(selected), schema, {
        id: 'role:' + i + ':' + (schema.id || schema.title || ''), compact: true, rerender: () => render(true),
      }));
    });
    if (!resolved) return;

    // A part of a component (an accordion header) keeps its own settings.
    if (resolved.part) {
      const partType = resolved.part.get('type') || 'default';
      const partSchema = reg().getComponentSettings(partType);
      if (partSchema) {
        const partAdapter = FigJS.settingsUI.componentAdapter(resolved.part);
        const line = document.createElement('div');
        line.className = 'fig-scope-line';
        line.textContent = `${resolved.part.getName()} (${partAdapter.scopeLabel()})`;
        host.appendChild(line);
        host.appendChild(FigJS.settingsUI.renderBlock(partAdapter, partSchema, {
          id: 'component:' + partType, compact: true, rerender: () => render(true),
        }));
      }
    }

    const adapter = FigJS.settingsUI.componentAdapter(comp);
    const def = reg().getComponentDefinition(resolved.type) || {};
    const own = reg().getComponentSettings(resolved.type);

    const scope = document.createElement('div');
    scope.className = 'fig-scope-line';
    scope.textContent = `${def.label || resolved.type} (${adapter.scopeLabel()})`;
    host.appendChild(scope);

    if (own) {
      const schema = comp === selected && replaced.size ? withoutKeys(own, replaced) : own;
      host.appendChild(FigJS.settingsUI.renderBlock(adapter, schema, {
        id: 'component:' + resolved.type, compact: true, rerender: () => render(true),
      }));
    }
    const classes = comp.getClasses();
    (def.tags || []).forEach((cls) => {
      if (!classes.includes(cls)) return;
      const schema = reg().getPresetSchema(cls);
      if (!schema || !schema.properties || !schema.properties.length) return;
      host.appendChild(FigJS.settingsUI.renderBlock(adapter, schema, {
        cls, compact: true, rerender: () => render(true),
      }));
    });
  }

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;
    const schedule = () => requestAnimationFrame(() => render());
    const scheduleForce = () => requestAnimationFrame(() => render(true));

    editor.on('component:selected', schedule);
    editor.on('component:deselected', schedule);
    editor.on('undo', scheduleForce);
    editor.on('redo', scheduleForce);
    editor.on('command:run:open-tm', schedule);
    editor.on('command:run:core:open-traits', schedule);
    // The traits panel re-renders on its own; re-anchor when the host falls out.
    setInterval(() => {
      const host = document.getElementById(HOST_ID);
      const root = findTraitsRoot();
      if (!root || !host || host.nextSibling !== root) render();
      else {
        host.style.display = root.offsetParent !== null ? '' : 'none';
        placeSearch();
        if (term) filterSettings();
      }
    }, 600);
    schedule();
  }

  FigJS.componentSettings = { install, render };
})();
