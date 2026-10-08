// Per-theme editing. Edits on the page's base theme (Page tab default,
// else the site default, else dark) apply to both themes. On the other
// theme, colour changes (colours, colour variables, gradients, shadows)
// are stored as overrides for that theme:
//   :where(:root[data-theme="light"]) #id { color: ... }
// :where() adds no specificity, so overrides keep the precedence of the
// rules they shadow. Page settings live on <body>, so their overrides
// use !important. Everything else goes to the shared rule; overrides are
// ordinary rules (undoable, clearable per element or page).
//   FigJS.themeEdit.install() / getEditTheme() / getBaseTheme() / isAlternate()
//   FigJS.themeEdit.setEditTheme(theme) / toggle() / readOverride(target, key)
//   FigJS.themeEdit.clearElement() / clearPage() / applyCanvasTheme()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const THEME_RULE_RE = /^:where\(:root\[data-theme="(light|dark)"\]\)\s+/;
  const COLOR_PROPS = new Set([
    'color', 'background-color', 'border-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color',
    'text-emphasis-color', 'caret-color', 'accent-color', 'column-rule-color', 'fill', 'stroke',
    'stop-color', 'flood-color', 'lighting-color', 'box-shadow', 'text-shadow',
    'border-block-start-color', 'border-block-end-color', 'border-inline-start-color',
    'border-inline-end-color',
  ]);

  let editTheme = '';
  let routing = false;
  let stepping = false;
  let siteDefault = '';

  function editor() { return FigJS.editor; }

  // ===================== Themes ========================================

  function getBaseTheme() {
    const pb = FigJS.pageBody;
    const mode = pb ? pb.getAttr('data-theme-mode') : '';
    if (mode === 'force-dark') return 'dark';
    if (mode === 'force-light') return 'light';
    const req = pb ? pb.getAttr('data-theme-requested') : '';
    if (req === 'light' || req === 'dark') return req;
    return siteDefault === 'light' ? 'light' : 'dark';
  }

  function getEditTheme() { return editTheme || getBaseTheme(); }
  function isAlternate() { return getEditTheme() !== getBaseTheme(); }

  function applyCanvasTheme() {
    let doc = null;
    try { doc = editor().Canvas.getDocument(); } catch (e) { return; }
    if (!doc || !doc.body) return;
    const theme = getEditTheme();
    [doc.documentElement, doc.body].forEach((el) => {
      if (el.getAttribute('data-theme') !== theme) el.setAttribute('data-theme', theme);
    });
    // The base theme can change under the toolbar (Page tab).
    renderToolbar();
    // The page's theme runtime also sets data-theme; the canvas keeps the edited theme.
    if (!doc.__figThemeGuard) {
      doc.__figThemeGuard = new MutationObserver(() => {
        const want = getEditTheme();
        [doc.documentElement, doc.body].forEach((el) => {
          if (el && el.getAttribute('data-theme') !== want) el.setAttribute('data-theme', want);
        });
      });
      [doc.documentElement, doc.body].forEach((el) => {
        doc.__figThemeGuard.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
      });
    }
  }

  function setEditTheme(theme) {
    // An edit in progress (open colour picker, typed field) finishes on the
    // theme it started on.
    if (FigJS.settingsUI && FigJS.settingsUI.closeColorPopover) FigJS.settingsUI.closeColorPopover();
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur();
    editTheme = theme === 'light' || theme === 'dark' ? theme : '';
    applyCanvasTheme();
    renderToolbar();
    if (FigJS.componentSettings) FigJS.componentSettings.render(true);
    if (FigJS.presetsTab) FigJS.presetsTab.render();
    refreshStyleManager();
    FigJS.setStatus(isAlternate()
      ? `Editing the ${getEditTheme()} theme: colour changes apply to it only.`
      : `Editing the ${getEditTheme()} theme (the page's base theme).`, '#4caf50');
  }

  function toggle() { setEditTheme(getEditTheme() === 'dark' ? 'light' : 'dark'); }

  // ===================== What counts as colour ==========================

  function isColorValue(v) {
    const s = String(v || '').replace(/\s*!important\s*$/, '').trim();
    if (!s) return false;
    if (/gradient\(/.test(s)) return true;
    try { return CSS.supports('color', s); } catch (e) { return false; }
  }

  function isThemeable(prop, value, prev) {
    if (COLOR_PROPS.has(prop)) return true;
    if (prop === 'background' || prop === 'background-image' || prop.startsWith('--')) {
      return isColorValue(value) || isColorValue(prev);
    }
    return false;
  }

  // ===================== Override rules =================================

  function isThemeRule(rule) {
    try { return THEME_RULE_RE.test(rule.selectorsToString()); } catch (e) { return false; }
  }

  function splitSelectors(sel) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of sel) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function isWrapperRule(rule) {
    return FigJS.pageBody && FigJS.pageBody.wrapperRules().includes(rule);
  }

  function overrideSelector(rule, theme) {
    const prefix = `:where(:root[data-theme="${theme}"]) `;
    if (isWrapperRule(rule)) {
      const state = rule.get('state');
      return prefix + 'body' + (state ? ':' + state : '');
    }
    return splitSelectors(rule.selectorsToString()).map((s) => prefix + s).join(', ');
  }

  function findRule(selector, media) {
    return (editor().Css.getAll().models || []).find((r) =>
      r.selectorsToString() === selector && (r.get('mediaText') || '') === (media || '')) || null;
  }

  function overrideRule(rule, theme, create) {
    const sel = overrideSelector(rule, theme);
    const media = rule.get('mediaText') || '';
    let found = findRule(sel, media);
    if (found || !create) return found;
    FigJS.undo.untracked(() => {
      found = media
        ? editor().Css.setRule(sel, {}, { atRuleType: rule.get('atRuleType') || 'media', atRuleParams: media })
        : editor().Css.setRule(sel, {});
      if (found && rule.get('library')) found.set('library', true);
    });
    return found;
  }

  // A CssRule, or a component whose style lives in its #id rule.
  function ruleOf(target) {
    if (!target) return null;
    if (typeof target.toHTML !== 'function') return target;
    const id = target.getId && target.getId();
    try { return id ? editor().Css.getIdRule(id) : null; } catch (e) { return null; }
  }

  function readOverride(target, key) {
    if (!isAlternate()) return null;
    const rule = ruleOf(target);
    if (!rule) return null;
    const o = overrideRule(rule, getEditTheme(), false);
    const v = o && (FigJS.cssParts ? FigJS.cssParts.read(o.getStyle() || {}, key) : (o.getStyle() || {})[key]);
    return v == null || v === '' ? null : String(v).replace(/\s*!important\s*$/, '');
  }

  // ===================== Routing colour edits ===========================

  function onRuleStyle(rule, value, opts) {
    if (routing || stepping || !isAlternate()) return;
    if (FigJS.state && FigJS.state.isInternalUpdate) return;
    if (!rule || isThemeRule(rule)) return;
    const o = opts || {};
    const prev = rule.previous('style') || {};
    const next = rule.getStyle() || {};
    const moved = {};
    new Set([...Object.keys(prev), ...Object.keys(next)]).forEach((k) => {
      if (prev[k] === next[k]) return;
      if (isThemeable(k, next[k], prev[k])) moved[k] = next[k];
    });
    const keys = Object.keys(moved);
    if (!keys.length) return;

    routing = true;
    try {
      const page = isWrapperRule(rule);
      const base = { ...next };
      keys.forEach((k) => { if (prev[k] == null) delete base[k]; else base[k] = prev[k]; });
      rule.setStyle(base, { avoidStore: !!o.avoidStore });
      const target = overrideRule(rule, getEditTheme(), true);
      if (target) {
        const style = { ...(target.getStyle() || {}) };
        keys.forEach((k) => {
          const v = moved[k];
          if (v == null || v === '') delete style[k];
          else style[k] = page && !/!important\s*$/.test(v) ? v + ' !important' : v;
        });
        target.setStyle(style, { avoidStore: !!o.avoidStore });
      }
    } finally {
      routing = false;
    }
  }

  // ===================== Clearing ======================================

  function overridesFor(comp) {
    const theme = getEditTheme();
    const id = comp.getId && comp.getId();
    const classes = (comp.getClasses && comp.getClasses()) || [];
    const libClasses = classes.filter((c) => /^lib-/.test(c));
    const prefix = `:where(:root[data-theme="${theme}"]) `;
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentions = [];
    if (id) mentions.push(new RegExp('#' + esc(id) + '(?![\\w-])'));
    libClasses.forEach((c) => mentions.push(new RegExp('\\.' + esc(c) + '(?![\\w-])')));
    if (comp === editor().getWrapper()) mentions.push(/(^|\s)body(?![\w-])/);
    return (editor().Css.getAll().models || []).filter((r) => {
      const s = r.selectorsToString();
      return s.startsWith(prefix) && mentions.some((re) => re.test(s))
        && Object.keys(r.getStyle() || {}).length > 0;
    });
  }

  function clearElement() {
    if (!isAlternate()) return;
    const sel = editor().getSelected();
    if (!sel) { FigJS.setStatus('Select an element first.', '#ff9800'); return; }
    const rules = overridesFor(sel);
    if (!rules.length) { FigJS.setStatus(`No ${getEditTheme()} overrides on this element.`, '#ff9800'); return; }
    rules.forEach((r) => r.setStyle({}));
    afterChange(`Cleared ${rules.length} ${getEditTheme()} override rule${rules.length === 1 ? '' : 's'} on this element.`);
  }

  async function clearPage(confirmed) {
    if (!isAlternate()) return;
    const theme = getEditTheme();
    const prefix = `:where(:root[data-theme="${theme}"]) `;
    const rules = (editor().Css.getAll().models || [])
      .filter((r) => !r.get('library') && r.selectorsToString().startsWith(prefix)
        && Object.keys(r.getStyle() || {}).length > 0);
    if (!rules.length) { FigJS.setStatus(`This page has no ${theme} overrides.`, '#ff9800'); return; }
    const ok = confirmed === true || await FigJS.dialog.confirm({
      title: `Clear the ${theme} theme overrides?`,
      message: `${rules.length} override rule${rules.length === 1 ? '' : 's'} on this page will be emptied. ` +
        'Library elements keep theirs. Undo brings them back.',
      okLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    rules.forEach((r) => r.setStyle({}));
    afterChange(`Cleared the page's ${theme} overrides.`);
  }

  function chooseClear() {
    const theme = getEditTheme();
    const hasSelection = !!editor().getSelected();
    FigJS.dialog.open({
      title: `Clear ${theme} theme colours`,
      body: `Remove the ${theme}-only colour overrides. The shared colours stay. Undo brings them back.`,
      width: 440,
      actions: [
        { label: 'Cancel' },
        { label: 'Selected element', disabled: !hasSelection, onClick: () => { setTimeout(clearElement, 0); } },
        { label: 'Whole page', primary: true, onClick: () => { setTimeout(() => clearPage(true), 0); } },
      ],
    });
  }

  function afterChange(msg) {
    FigJS.markUnsaved();
    if (FigJS.codeView) FigJS.codeView.debouncedSync();
    if (FigJS.componentSettings) FigJS.componentSettings.render(true);
    refreshStyleManager();
    FigJS.setStatus(msg, '#4caf50');
  }

  // Style Manager: colour fields show the override values on the other theme.

  function refreshStyleManager() {
    const sm = editor() && editor().StyleManager;
    if (sm && sm.__upProps) { try { sm.__upProps(); } catch (e) {} }
  }

  function patchStyleManager() {
    const sm = editor().StyleManager;
    if (!sm || sm.__figThemePatched || typeof sm.__upProps !== 'function') return;
    sm.__figThemePatched = true;
    const orig = sm.__upProps;
    sm.__upProps = function () {
      const res = orig.apply(this, arguments);
      if (!isAlternate()) return res;
      const target = this.getSelected && this.getSelected();
      if (!target) return res;
      (this.getSectors ? this.getSectors() : []).forEach((sector) => {
        sector.getProperties().forEach((prop) => {
          const name = prop.getName();
          if (!COLOR_PROPS.has(name)) return;
          const v = readOverride(target, name);
          if (v != null) { try { prop.upValue(v, { noTarget: true }); } catch (e) {} }
        });
      });
      return res;
    };
  }

  // ===================== Toolbar =======================================

  let btn = null;
  let tools = null;

  function renderToolbar() {
    if (!btn) return;
    const theme = getEditTheme();
    const alt = isAlternate();
    btn.innerHTML = (FigJS.icons ? FigJS.icons[theme === 'light' ? 'sun' : 'moon'] : '') +
      `<span>${theme === 'light' ? 'Light' : 'Dark'}</span>`;
    btn.classList.toggle('is-alt', alt);
    btn.title = alt
      ? `Editing the ${theme} theme. Colour changes apply to ${theme} only. Click to switch.`
      : `Editing the ${theme} theme (base: changes apply to both themes). Click to switch.`;
    if (tools) tools.hidden = !alt;
  }

  function installToolbar() {
    btn = document.getElementById('btn-theme-edit');
    tools = document.getElementById('theme-alt-tools');
    if (btn) btn.addEventListener('click', toggle);
    if (tools) tools.addEventListener('click', chooseClear);
    renderToolbar();
  }

  // ===================== Install =======================================

  function install() {
    const ed = editor();
    if (!ed) return;

    ed.Css.getAll().on('change:style', onRuleStyle);

    const um = ed.UndoManager;
    ['undo', 'redo'].forEach((m) => {
      const orig = um[m].bind(um);
      um[m] = function () {
        stepping = true;
        try { return orig.apply(null, arguments); } finally { stepping = false; }
      };
    });

    patchStyleManager();
    installToolbar();

    if (FigJS.site && FigJS.site.get) {
      FigJS.site.get().then((s) => { siteDefault = (s && s.defaultTheme) || ''; renderToolbar(); applyCanvasTheme(); })
        .catch(() => {});
    }
  }

  // A page load starts on its base theme.
  function onPageLoaded() {
    editTheme = '';
    applyCanvasTheme();
    renderToolbar();
  }

  FigJS.themeEdit = {
    install, onPageLoaded,
    getEditTheme, getBaseTheme, isAlternate,
    setEditTheme, toggle,
    readOverride, isThemeRule,
    clearElement, clearPage,
    applyCanvasTheme,
  };
})();
