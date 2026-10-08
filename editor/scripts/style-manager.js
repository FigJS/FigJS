// Style Manager: target selection (shared Library rule, else the
// element's id rule), Scale and Visibility sectors, per-sector change
// marker with copy / paste / reset, an editing-scope header and search.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Target of a selected component: a Library-linked element's shared rule
  // (at the current device and state), else its own id rule, created on
  // selection without an undo entry. Rules and selector strings pass through.

  function installIdRuleTargeting() {
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.StyleManager;
    if (!sm || sm.__idRuleTargetingInstalled) return;
    sm.__idRuleTargetingInstalled = true;

    // The state being edited ('', ':hover', ...). Mapping to the bare #id
    // rule would drop it, so stateful edits keep GrapesJS's own targeting.
    function activeState() {
      try {
        if (typeof sm.getState === 'function') {
          const s = sm.getState();
          if (typeof s === 'string' && s) return s;
        }
      } catch (e) {}

      try {
        const em = editor.getModel && editor.getModel();
        if (em && typeof em.getState === 'function') {
          const s = em.getState();
          if (typeof s === 'string' && s) return s;
        }
      } catch (e) {}

      try {
        const sel = sm.getSelected && sm.getSelected();
        if (sel && typeof sel.get === 'function') {
          const s = sel.get('state');
          if (typeof s === 'string' && s) return s;
        }
      } catch (e) {}

      return '';
    }

    const origSelect = sm.select.bind(sm);

    sm.select = function (targets, opts) {
      const state = activeState();
      const list = Array.isArray(targets) ? targets : [targets];
      const mapped = list.map((t) => {
        if (!t || typeof t.toHTML !== 'function') return t;

        const libRule = FigJS.library && FigJS.library.styleTargetFor(t);
        if (libRule) return libRule;

        if (state) return t;

        const id = t.getId && t.getId();
        if (!id) return t;

        let rule = null;
        try { rule = editor.Css.getIdRule(id); } catch (e) {}
        if (!rule) {
          try {
            const um = editor.UndoManager;
            const create = () => { rule = editor.Css.setIdRule(id, {}, {}); };
            if (um && typeof um.skip === 'function') um.skip(create);
            else create();
          } catch (e) {}
        }
        return rule || t;
      });
      return origSelect(mapped, opts);
    };
  }

  // ===================== Scale + Visibility sectors ====================

  function installExtras() {
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.StyleManager;
    if (!sm || sm.getSector('scale')) return;

    sm.addSector('scale', { name: 'Scale', open: false, properties: [] });
    sm.addSector('visibility', { name: 'Visibility', open: false, properties: [] });

    sm.addProperty('scale', {
      // The element's scale channel; preset rules multiply it into the zoom.
      property: '--el-scale',
      type: 'slider',
      label: 'Element scale',
      defaults: '1',
      min: 0.5,
      max: 2,
      step: 0.01,
    });

    sm.addProperty('visibility', {
      property: 'visibility',
      type: 'select',
      label: 'Visibility',
      defaults: 'visible',
      options: [
        { id: 'visible', name: 'Visible' },
        { id: 'hidden',  name: 'Hidden (space kept)' },
      ],
    });

    sm.addProperty('visibility', {
      property: 'pointer-events',
      type: 'select',
      label: 'Pointer events',
      defaults: 'auto',
      options: [
        { id: 'auto', name: 'Auto (clickable)' },
        { id: 'none', name: 'None (click-through)' },
      ],
    });
  }

  // ===================== Sector highlight + reset ======================

  function installSectorExtras() {
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.StyleManager;
    if (!sm || sm.__sectorExtrasInstalled) return;
    sm.__sectorExtrasInstalled = true;

    function refresh() {
      const container = document.querySelector('.gjs-sm-sectors');
      if (!container) return;

      const sectors = sm.getSectors();
      const models = sectors.models || (Array.isArray(sectors) ? sectors : []);
      const sectorEls = container.querySelectorAll('.gjs-sm-sector');

      sectorEls.forEach((el, i) => {
        const sector = models[i];
        if (!sector) return;

        let hasChanges = false;
        if (typeof sector.getProperties === 'function') {
          const props = sector.getProperties();
          hasChanges = props.some((p) => {
            if (!p || typeof p.hasValue !== 'function') return false;
            if (!p.hasValue({ noParent: true })) return false;
            const def = typeof p.getDefaultValue === 'function' ? p.getDefaultValue() : '';
            const full = typeof p.getFullValue === 'function' ? p.getFullValue() : '';
            if (def && full && String(def) === String(full)) return false;
            return true;
          });
        }

        el.classList.toggle('has-changes', hasChanges);

        const title = el.querySelector('.gjs-sm-sector-title');
        if (!title) return;

        let tools = title.querySelector(':scope > .sm-sector-tools');
        if (!tools) {
          tools = document.createElement('span');
          tools.className = 'sm-sector-tools';
          const mk = (label, tip, cls, onClick) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = label;
            b.title = tip;
            if (cls) b.className = cls;
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
            tools.appendChild(b);
            return b;
          };
          mk(FigJS.icons.copy, 'Copy this group\'s values', 'sm-sector-copy', () => copySector(sector));
          mk(FigJS.icons.paste, 'Paste copied values here', 'sm-sector-paste', () => pasteSector(sector));
          mk(FigJS.icons.close, 'Clear all properties in this group', 'sm-sector-reset', () => clearSector(sector));
          title.appendChild(tools);
        }
        const clip = FigJS.settingsUI && FigJS.settingsUI.clipboard.get();
        tools.querySelector('.sm-sector-paste').disabled = !clip || !Object.keys(clip.values || {}).length;
      });
    }

    // Includes composite parts (margin -> margin-top ...).
    function sectorPropNames(sector) {
      const names = [];
      (sector.getProperties ? sector.getProperties() : []).forEach((p) => {
        if (!p || !p.getName) return;
        names.push(p.getName());
        const sub = p.get && p.get('properties');
        (sub && sub.models ? sub.models : []).forEach((sp) => sp.getName && names.push(sp.getName()));
      });
      return names;
    }

    function targetStyle() {
      const target = sm.getSelected();
      if (!target) return null;
      if (typeof target.toHTML === 'function') return { target, style: { ...(target.getStyle() || {}) } };
      return { target, style: { ...(target.getStyle('', { skipResolve: true }) || {}) } };
    }

    function writeTarget(target, style) {
      if (typeof target.toHTML === 'function') target.setStyle(style);
      else target.setStyle(style, { partial: false });
      FigJS.markUnsaved();
      if (typeof sm.__upProps === 'function') sm.__upProps({});
      else sm.select(editor.getSelectedAll());
      scheduleRefresh();
      if (FigJS.codeView) FigJS.codeView.debouncedSync();
    }

    function copySector(sector) {
      const t = targetStyle();
      if (!t) return;
      const values = {};
      sectorPropNames(sector).forEach((n) => {
        if (t.style[n] != null && t.style[n] !== '') values[n] = { v: t.style[n], attr: false };
      });
      FigJS.settingsUI.clipboard.set({
        kind: 'sector', id: 'sector:' + sector.getId(), label: sector.getName(), values,
      });
      scheduleRefresh();
    }

    // Keys this sector owns; with none in common, everything copied.
    function pasteSector(sector) {
      const clip = FigJS.settingsUI.clipboard.get();
      const t = targetStyle();
      if (!clip || !t) return;
      const own = new Set(sectorPropNames(sector));
      let keys = Object.keys(clip.values).filter((k) => own.has(k));
      if (!keys.length) keys = Object.keys(clip.values).filter((k) => !clip.values[k].attr);
      if (!keys.length) { FigJS.setStatus('Nothing to paste here.', '#ff9800'); return; }
      const next = { ...t.style };
      keys.forEach((k) => { next[k] = clip.values[k].v; });
      writeTarget(t.target, next);
      FigJS.setStatus(`Pasted ${keys.length} value${keys.length === 1 ? '' : 's'} from ${clip.label}`, '#4caf50');
    }

    // One tracked write: Ctrl+Z restores the cleared values.
    function clearSector(sector) {
      const t = targetStyle();
      if (!t) return;
      const next = { ...t.style };
      let dirty = false;
      sectorPropNames(sector).forEach((n) => { if (n in next) { delete next[n]; dirty = true; } });
      if (dirty) writeTarget(t.target, next);
    }

    let pending = false;
    function scheduleRefresh() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; refresh(); });
    }

    function watchSector(sector) {
      if (!sector || sector.__sectorExtraWatched) return;
      sector.__sectorExtraWatched = true;
      sector.on('change:visible change:open', scheduleRefresh);
      const props = typeof sector.get('properties') === 'object'
        ? sector.get('properties') : null;
      if (props && typeof props.on === 'function') {
        props.on('change:value change:parentTarget change:visible', scheduleRefresh);
      }
    }

    function watchSectorsCollection() {
      const sectors = sm.getSectors();
      const coll = sectors && sectors.models ? sectors : null;
      if (!coll) return;
      if (!coll.__sectorExtrasHooked) {
        coll.__sectorExtrasHooked = true;
        coll.on('add', watchSector);
        coll.on('reset', () => coll.forEach(watchSector));
      }
      coll.forEach(watchSector);
    }

    watchSectorsCollection();
    setTimeout(watchSectorsCollection, 100);
    if (FigJS.settingsUI) FigJS.settingsUI.clipboard.onChange(scheduleRefresh);
    setTimeout(watchSectorsCollection, 500);
    setTimeout(watchSectorsCollection, 1500);

    editor.on('component:selected', scheduleRefresh);
    editor.on('component:deselected', scheduleRefresh);
    editor.on('component:styleUpdate', scheduleRefresh);
    editor.on('styleable:change', scheduleRefresh);
    editor.on('style:target', scheduleRefresh);
    editor.on('style:property:update', scheduleRefresh);
    editor.on('undo', scheduleRefresh);
    editor.on('redo', scheduleRefresh);

    function attachObserver() {
      const container = document.querySelector('.gjs-sm-sectors');
      if (!container || container.__smSectorObs) return;
      const mo = new MutationObserver(scheduleRefresh);
      mo.observe(container, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class'],
      });
      container.__smSectorObs = mo;
      refresh();
    }
    attachObserver();
    setTimeout(attachObserver, 100);
    setTimeout(attachObserver, 500);
    setTimeout(attachObserver, 1500);
  }

  // ===================== Editing-scope header ==========================

  function installScopeHeader() {
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.StyleManager;
    if (!sm || sm.__scopeHeaderInstalled) return;
    sm.__scopeHeaderInstalled = true;

    let header = null;

    function ensureHeader() {
      if (header && header.isConnected) return header;
      const sectors = document.querySelector('.gjs-sm-sectors');
      if (!sectors || !sectors.parentNode) return null;
      header = document.createElement('div');
      header.id = 'fig-scope-header';
      header.className = 'fig-scope-header';
      sectors.parentNode.insertBefore(header, sectors);
      return header;
    }

    function classifyTarget() {
      const target = sm.getSelected();
      const component = editor.getSelected();
      if (!target) return null;

      const isComponentIdRule = component
        && target.getSelectors
        && target.getId
        && (() => {
             try {
               const sels = target.getSelectors().models || [];
               if (sels.length !== 1) return false;
               const s = sels[0];
               return s.isId && s.isId() && s.getName() === component.getId();
             } catch (e) { return false; }
           })();

      if (isComponentIdRule) {
        return { kind: 'element', label: 'This element' };
      }

      if (target.getSelectors) {
        const sels = target.getSelectors().models || [];
        const classNames = sels
          .filter((s) => s.isClass && s.isClass())
          .map((s) => s.getName())
          .filter(Boolean);

        if (classNames.length) {
          const presetClasses = (window.PresetRegistry && window.PresetRegistry.getPresetClasses)
            ? window.PresetRegistry.getPresetClasses()
            : new Set();
          const presetHits = classNames.filter((c) => presetClasses.has(c));
          if (presetHits.length) {
            return { kind: 'preset', label: '.' + presetHits.join(', .') };
          }
          const isLibrary = target.get('library');
          return {
            kind: isLibrary ? 'library' : 'class',
            label: '.' + classNames.join(', .'),
          };
        }
      }

      return { kind: 'other', label: 'Rule' };
    }

    const MESSAGES = {
      element: 'changes affect only this element',
      class:   'shared across every element with this class, on this page',
      library: 'shared across every page that uses this Library item',
      preset:  'preset rule: edit it through the Presets tab',
      other:   '',
    };

    function update() {
      const el = ensureHeader();
      if (!el) return;
      const info = classifyTarget();
      if (!info) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.innerHTML = '';
      const dot = document.createElement('span');
      dot.className = 'scope-dot scope-dot--' + info.kind;
      const label = document.createElement('span');
      label.className = 'scope-label';
      label.innerHTML = 'Editing: <strong></strong>';
      label.querySelector('strong').textContent = info.label;
      const msg = document.createElement('span');
      msg.className = 'scope-msg';
      msg.textContent = MESSAGES[info.kind] || '';
      el.append(dot, label, msg);
    }

    const schedule = () => requestAnimationFrame(update);
    editor.on('component:selected', schedule);
    editor.on('component:deselected', schedule);
    editor.on('style:target', schedule);
    editor.on('styleManager:update', schedule);
    editor.on('styleable:change', schedule);

    schedule();
    setTimeout(schedule, 200);
    setTimeout(schedule, 800);
  }

  // Search: filters properties; sectors without matches hide.
  function installSearchBar() {
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.StyleManager;
    if (!sm || sm.__smSearchInstalled) return;
    sm.__smSearchInstalled = true;

    const BAR_ID = 'fig-sm-search';
    let term = '';
    let input = null;

    function ensureBar() {
      const existing = document.getElementById(BAR_ID);
      if (existing && existing.isConnected) return existing;
      const sectors = document.querySelector('.gjs-sm-sectors');
      if (!sectors || !sectors.parentNode) return null;

      const bar = document.createElement('div');
      bar.id = BAR_ID;

      input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Search properties';
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.className = 'fig-input';
      input.value = term;
      input.addEventListener('input', () => {
        term = input.value;
        applyFilter();
      });
      bar.appendChild(input);

      sectors.parentNode.insertBefore(bar, sectors);
      return bar;
    }

    // Matches a label, CSS name or any part (Padding finds Top; "top" finds
    // Padding). A matching sector title shows the whole sector. Sectors with
    // matches show open without changing their saved state.
    function textOf(propEl) {
      let t = '';
      const lbl = propEl.querySelector('.gjs-sm-label');
      if (lbl) t += (lbl.textContent || '') + ' ';
      const dp = propEl.getAttribute('data-property');
      if (dp) t += dp + ' ';
      const m = /gjs-sm-property__([\w-]+)/.exec(propEl.className);
      if (m) t += m[1];
      return t.toLowerCase();
    }

    function applyFilter() {
      const container = document.querySelector('.gjs-sm-sectors');
      if (!container) return;
      const needle = term.trim().toLowerCase();

      container.querySelectorAll('.gjs-sm-sector').forEach((sectorEl) => {
        const title = ((sectorEl.querySelector('.gjs-sm-sector-title') || {}).textContent || '').toLowerCase();
        const wholeSector = !needle || title.indexOf(needle) >= 0;
        let anyVisible = false;
        sectorEl.querySelectorAll('.gjs-sm-property').forEach((propEl) => {
          if (propEl.parentElement && propEl.parentElement.closest('.gjs-sm-property')) return;
          const match = wholeSector || textOf(propEl).indexOf(needle) >= 0
            || Array.prototype.some.call(propEl.querySelectorAll('.gjs-sm-property'), (c) => textOf(c).indexOf(needle) >= 0);
          propEl.style.display = match ? '' : 'none';
          propEl.querySelectorAll('.gjs-sm-property').forEach((c) => { c.style.display = ''; });
          if (match) anyVisible = true;
        });
        sectorEl.style.display = anyVisible || wholeSector ? '' : 'none';
        sectorEl.classList.toggle('fig-sm-force-open', !!needle && anyVisible);
      });
    }

    function tryInstall() {
      const bar = ensureBar();
      if (bar) applyFilter();
    }

    tryInstall();
    setTimeout(tryInstall, 200);
    setTimeout(tryInstall, 800);
    setTimeout(tryInstall, 1500);

    // The sectors container can be replaced on render: reinstall the bar.
    const parent = document.querySelector('.gjs-sm-sectors')?.parentNode
                || document.querySelector('.gjs-pn-views-container');
    if (parent) {
      const mo = new MutationObserver(() => {
        if (!document.getElementById(BAR_ID) || !document.getElementById(BAR_ID).isConnected) {
          tryInstall();
        } else {
          applyFilter();
        }
      });
      mo.observe(parent, { childList: true });
    }

    editor.on('component:selected', () => requestAnimationFrame(applyFilter));
    editor.on('style:target',      () => requestAnimationFrame(applyFilter));
  }

  // ===================== Install =======================================

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;
    editor.onReady(() => {
      installExtras();
      installSectorExtras();
      installIdRuleTargeting();
      installScopeHeader();
      installSearchBar();
    });
  }

  FigJS.styleManager = { install };
})();