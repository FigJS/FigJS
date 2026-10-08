// Page state: what the saved page carries on <body> (attributes, classes,
// style) and the boot attributes hoisted onto <html>.
// The wrapper is a <div> inside the canvas body, so its model is the
// single source: writes go through GrapesJS (undoable), mirror() renders
// them onto the canvas <body>/<html>, and the wrapper div itself renders
// nothing. Save and load go between the model and the file.
// Background settings are --page-* custom properties on <body>, used by
// site.css; body longhands found on load map to them. Background zoom
// is written out as --page-bg-zoom-size, derived from the size, scrolling
// and the image's own dimensions.
//   FigJS.pageBody.getAttr(name) / getAttrs() / setAttrs(map, opts)
//   FigJS.pageBody.getStyle() / setStyle(map, opts) / getClasses()
//   FigJS.pageBody.mirror()               model -> canvas
//   FigJS.pageBody.loadFrom(doc)          file -> model (untracked)
//   FigJS.pageBody.writeTo(doc)           model -> file
//   FigJS.pageBody.pruneOrphanIdRules() / wrapperRules()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Classes GrapesJS and the editor put on the canvas <body>/<html>; never saved.
  const EDITOR_CLASS_RE = /^(gjs-|is-gjs-|fig-)/;

  const EDITOR_STYLE_PROPS = new Set(['zoom']);

  // Written from the other values on render and save; never in the model.
  const DERIVED_STYLE_PROPS = new Set(['--page-bg-zoom-size']);

  // Copied from <body> to <html> on save, where the boot block reads them
  // before first paint and CSS styles the page scroller.
  const BOOT_HOIST = [
    'data-theme-mode', 'data-theme', 'data-theme-requested',
    'data-lang', 'data-lang-default', 'data-lang-available',
    'data-site-scale', 'data-site-scale-phone',
    'data-scrollbar',
  ];

  // Body longhands -> page background properties.
  const LONGHAND_MAP = {
    'background-color': '--page-bg-color',
    'background-image': '--page-bg-image',
    'background-size': '--page-bg-size',
    'background-repeat': '--page-bg-repeat',
    'background-attachment': '--page-bg-attachment',
    'background-blend-mode': '--page-bg-blend',
    'color': '--page-fg',
    'cursor': '--cursor-default',
  };

  function editor() { return FigJS.editor; }
  function wrapper() { const e = editor(); return e ? e.getWrapper() : null; }
  function canvasDoc() {
    const e = editor();
    try { return e ? e.Canvas.getDocument() : null; } catch (err) { return null; }
  }

  // Wrapper view: renders a plain div; the model keeps classes and
  // attributes for <body>. A plugin, so it is in place before the canvas renders.

  const INTERNAL_ATTR_RE = /^(id|data-gjs-.*|draggable|contenteditable)$/;

  window.PresetPlugins = window.PresetPlugins || [];
  window.PresetPlugins.push({
    id: 'fig-page-body',
    plugin(ed) {
      const base = ed.DomComponents.getType('wrapper').view.prototype;
      ed.DomComponents.addType('wrapper', {
        view: {
          updateClasses() {
            this.setAttribute('class', '');
            this.updateStatus();
            this.onAttrUpdate();
            schedule();
          },
          updateAttributes() {
            base.updateAttributes.apply(this, arguments);
            Array.from(this.el.attributes).forEach((a) => {
              if (!INTERNAL_ATTR_RE.test(a.name) && a.name !== 'class') this.el.removeAttribute(a.name);
            });
            schedule();
          },
        },
      });
    },
  });

  // ===================== Model access ===============================

  function getAttrs() {
    const w = wrapper();
    if (!w) return {};
    const out = { ...(w.getAttributes() || {}) };
    delete out.id; delete out.class; delete out.style;
    return out;
  }

  function getAttr(name) {
    const v = getAttrs()[name];
    return v == null ? '' : String(v);
  }

  function setAttrs(changes, opts) {
    const w = wrapper();
    if (!w) return;
    const add = {};
    const remove = [];
    Object.entries(changes || {}).forEach(([k, v]) => {
      if (v === '' || v == null || v === false) remove.push(k);
      else add[k] = String(v);
    });
    if (Object.keys(add).length) w.addAttributes(add, opts || {});
    if (remove.length) w.removeAttributes(remove, opts || {});
    mirror();
  }

  // The wrapper's base rule (no media, no state) on every device:
  // wrapper.getStyle()/setStyle() follow the selected device.
  function baseRule() {
    return wrapperRules().find((r) => !r.get('mediaText') && !r.get('state')) || null;
  }

  function onBaseDevice() {
    const e = editor();
    const d = e && e.Devices && e.Devices.getSelected && e.Devices.getSelected();
    return !d || !(d.get('widthMedia') || d.get('minWidthMedia'));
  }

  function getStyle() {
    const w = wrapper();
    if (!w) return {};
    try {
      const r = baseRule();
      if (r) return { ...(r.getStyle() || {}) };
      return onBaseDevice() ? { ...(w.getStyle() || {}) } : {};
    } catch (e) { return {}; }
  }

  function writeBase(style, opts) {
    const e = editor();
    const w = wrapper();
    if (!e || !w) return;
    const r = baseRule();
    if (r) r.setStyle(style, opts || {});
    else if (onBaseDevice()) w.setStyle(style, opts || {});
    else e.Css.setRule('#' + w.getId(), style, opts || {});
  }

  function setStyle(changes, opts) {
    const w = wrapper();
    if (!w) return;
    const next = getStyle();
    Object.entries(changes || {}).forEach(([k, v]) => {
      if (v === '' || v == null) delete next[k];
      else next[k] = String(v);
    });
    writeBase(next, opts);
    mirror();
  }

  function getClasses() {
    const w = wrapper();
    if (!w) return [];
    return (w.getClasses() || []).filter((c) => !EDITOR_CLASS_RE.test(c));
  }

  function wrapperRules() {
    const e = editor();
    const w = wrapper();
    if (!e || !w) return [];
    const id = w.getId();
    return (e.Css.getAll().models || []).filter((r) => {
      try {
        const sels = r.getSelectors().models || [];
        return sels.length === 1 && sels[0].isId && sels[0].isId() && sels[0].getName() === id;
      } catch (err) { return false; }
    });
  }

  function styleToString(style) {
    return Object.entries(style || {})
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
  }

  // ===================== Background zoom ===========================
  // background-size scaled by var(--_bg-zoom) (site.css picks the desktop
  // or phone value). Cover and contain need the image's aspect ratio and
  // the positioning area: the viewport when fixed, the body when it
  // scrolls (its height as a percentage, its width as the viewport's).

  const imageSizes = new Map();

  function imageSize(value) {
    const m = String(value || '').match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
    const doc = canvasDoc();
    if (!m || !doc) return null;
    let url;
    try { url = new URL(m[1], doc.baseURI).href; } catch (e) { return null; }
    if (imageSizes.has(url)) return imageSizes.get(url);
    imageSizes.set(url, null);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) imageSizes.set(url, { w: img.naturalWidth, h: img.naturalHeight });
      schedule();
    };
    img.src = url;
    return null;
  }

  const LENGTH_RE = /^-?[\d.]+(px|%|em|rem|vw|vh|vmin|vmax)$/;

  function zoomSize(style) {
    if (!style['--page-bg-zoom'] && !style['--page-bg-zoom-phone']) return '';
    const size = String(style['--page-bg-size'] || 'cover').trim();
    const fixed = String(style['--page-bg-attachment'] || '').trim() === 'fixed';
    const Z = 'var(--_bg-zoom)';
    if (size === 'cover' || size === 'contain' || size === 'auto') {
      const img = imageSize(style['--page-bg-image']);
      if (!img) return '';
      if (size === 'auto') return `calc(${img.w}px * ${Z}) auto`;
      const r = +(img.w / img.h).toFixed(5);
      const f = size === 'cover' ? 'max' : 'min';
      return fixed
        ? `calc(${f}(100%, 100vh / var(--_bg-scale) * ${r}) * ${Z}) auto`
        : `auto calc(${f}(100%, 100vw / var(--_bg-scale) / ${r}) * ${Z})`;
    }
    const parts = size.split(/\s+/);
    if (parts.length > 2 || !parts.every((p) => p === 'auto' || LENGTH_RE.test(p))) return '';
    return parts.map((p) => (p === 'auto' ? p : `calc(${p} * ${Z})`)).join(' ');
  }

  function renderedStyle() {
    const style = getStyle();
    const zoomed = zoomSize(style);
    if (zoomed) style['--page-bg-zoom-size'] = zoomed;
    return style;
  }

  // ===================== Model -> canvas ============================

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; mirror(); });
  }

  function mirror() {
    const doc = canvasDoc();
    if (!doc || !doc.body) return;
    const body = doc.body;
    const html = doc.documentElement;

    const editorClasses = Array.from(body.classList).filter((c) => EDITOR_CLASS_RE.test(c));
    const wantClass = editorClasses.concat(getClasses()).join(' ');
    if (body.className !== wantClass) body.className = wantClass;

    const attrs = getAttrs();
    Array.from(body.attributes).forEach((a) => {
      if (a.name === 'class' || a.name === 'style' || /^data-gjs-/.test(a.name)) return;
      if (!(a.name in attrs)) body.removeAttribute(a.name);
    });
    Object.entries(attrs).forEach(([k, v]) => {
      if (body.getAttribute(k) !== String(v)) body.setAttribute(k, String(v));
    });

    const inline = styleToString(renderedStyle());
    if ((body.getAttribute('style') || '') !== inline) {
      if (inline) body.setAttribute('style', inline);
      else body.removeAttribute('style');
    }
    let tag = doc.head && doc.head.querySelector('style[data-fig-page-body]');
    const mediaCss = wrapperRules()
      .filter((r) => r.get('mediaText') || r.get('state'))
      .map((r) => {
        const decl = styleToString(r.getStyle());
        if (!decl) return '';
        const sel = 'body' + (r.get('state') ? ':' + r.get('state') : '');
        const block = `${sel}{${decl}}`;
        return r.get('mediaText') ? `@media ${r.get('mediaText')}{${block}}` : block;
      })
      .filter(Boolean)
      .join('\n');
    if (doc.head) {
      if (!tag) {
        tag = doc.createElement('style');
        tag.setAttribute('data-fig-page-body', '');
        doc.head.appendChild(tag);
      }
      if (tag.textContent !== mediaCss) tag.textContent = mediaCss;
    }

    // Boot attributes on <html>, as the boot block sets them.
    BOOT_HOIST.forEach((k) => {
      const v = attrs[k];
      if (v) html.setAttribute(k, v);
      else if (k !== 'data-theme' && k !== 'data-lang') html.removeAttribute(k);
    });
    if (attrs['data-lang']) html.setAttribute('lang', attrs['data-lang']);
    const s = attrs['data-site-scale'];
    const sp = attrs['data-site-scale-phone'];
    if (s) html.style.setProperty('--site-scale', s); else html.style.removeProperty('--site-scale');
    if (sp) html.style.setProperty('--site-scale-phone', sp); else html.style.removeProperty('--site-scale-phone');
    const bg = getStyle()['--page-bg-color'];
    if (bg) html.style.setProperty('--page-bg-color', bg); else html.style.removeProperty('--page-bg-color');
    if (FigJS.themeEdit) FigJS.themeEdit.applyCanvasTheme();
  }

  // ===================== File -> model ==============================

  function parseInlineStyle(text) {
    const probe = document.createElement('div');
    probe.setAttribute('style', text || '');
    const out = {};
    for (let i = 0; i < probe.style.length; i++) {
      const k = probe.style[i];
      out[k] = probe.style.getPropertyValue(k);
    }
    return { out, probe };
  }

  // Body longhands -> --page-* properties.
  function toPageStyle(style, probe) {
    const next = {};
    Object.entries(style).forEach(([k, v]) => {
      if (EDITOR_STYLE_PROPS.has(k) || DERIVED_STYLE_PROPS.has(k)) return;
      if (k.startsWith('background-position')) return;
      if (/^padding-/.test(k)) return;
      if (LONGHAND_MAP[k]) {
        if (k === 'background-image' && (v === 'none' || v === 'initial')) return;
        next[LONGHAND_MAP[k]] = v;
        return;
      }
      next[k] = v;
    });
    const posX = style['background-position-x'];
    const posY = style['background-position-y'];
    if (posX || posY) next['--page-bg-position'] = `${posX || 'center'} ${posY || 'center'}`;
    if (style['padding-top'] || style['padding-left']) {
      const pad = probe.style.padding;
      if (pad && pad !== '0px') next['--page-pad'] = pad;
    }
    return next;
  }

  function loadFrom(parsedDoc) {
    const e = editor();
    const w = wrapper();
    if (!e || !w || !parsedDoc || !parsedDoc.body) return;
    const src = parsedDoc.body;

    const attrs = {};
    Array.from(src.attributes).forEach((a) => {
      if (a.name === 'class' || a.name === 'style' || a.name === 'id') return;
      attrs[a.name] = a.value;
    });
    // Boot attributes found only on <html> (hand-written pages).
    BOOT_HOIST.forEach((k) => {
      if (!(k in attrs) && parsedDoc.documentElement.hasAttribute(k)) {
        attrs[k] = parsedDoc.documentElement.getAttribute(k);
      }
    });

    const classes = (src.getAttribute('class') || '').split(/\s+/)
      .filter((c) => c && !EDITOR_CLASS_RE.test(c));

    const { out, probe } = parseInlineStyle(src.getAttribute('style') || '');
    const style = toPageStyle(out, probe);

    FigJS.undo.untracked(() => {
      const current = { ...(w.getAttributes() || {}) };
      const removable = Object.keys(current).filter((k) => k !== 'id');
      if (removable.length) w.removeAttributes(removable);
      if (Object.keys(attrs).length) w.addAttributes(attrs);
      w.setClass(classes);
      writeBase(style);
    });
    mirror();
  }

  // Rules whose whole selector is a generated #id no component carries.
  function pruneOrphanIdRules() {
    const e = editor();
    const w = wrapper();
    if (!e || !w) return 0;
    const ids = new Set();
    const walk = (c) => {
      const id = c.getAttributes().id || (c.getId && c.getId());
      if (id) ids.add(id);
      c.components().forEach(walk);
    };
    walk(w);
    const orphans = (e.Css.getAll().models || []).filter((r) => {
      if (r.get('library')) return false;
      try {
        const sels = r.getSelectors().models || [];
        if (sels.length !== 1 || !(sels[0].isId && sels[0].isId())) return false;
        const name = sels[0].getName();
        return /^i[a-z0-9]{2,8}(-\d+)*$/.test(name) && !ids.has(name);
      } catch (err) { return false; }
    });
    if (orphans.length) FigJS.undo.untracked(() => e.Css.remove(orphans));
    return orphans.length;
  }

  // ===================== Model -> saved document =====================

  function writeTo(doc) {
    const body = doc.body;
    const html = doc.documentElement;

    Array.from(body.attributes).forEach((a) => body.removeAttribute(a.name));
    const attrs = getAttrs();
    Object.entries(attrs).forEach(([k, v]) => body.setAttribute(k, String(v)));

    const classes = getClasses();
    if (classes.length) body.setAttribute('class', classes.join(' '));

    const inline = styleToString(Object.fromEntries(
      Object.entries(renderedStyle()).filter(([k]) => !EDITOR_STYLE_PROPS.has(k))
    ));
    if (inline) body.setAttribute('style', inline);

    BOOT_HOIST.forEach((k) => {
      if (attrs[k]) html.setAttribute(k, attrs[k]);
      else html.removeAttribute(k);
    });
    html.setAttribute('lang', attrs['data-lang'] || html.getAttribute('lang') || 'en');
    // <html> paints the page colour too, past the end of <body>.
    const bg = getStyle()['--page-bg-color'];
    if (bg) html.style.setProperty('--page-bg-color', bg); else html.style.removeProperty('--page-bg-color');
    if (!html.getAttribute('style')) html.removeAttribute('style');
  }

  // Media/state wrapper rules, written against body.
  function wrapperRulesCss() {
    return wrapperRules()
      .filter((r) => r.get('mediaText') || r.get('state'))
      .map((r) => {
        const decl = styleToString(r.getStyle());
        if (!decl) return '';
        const sel = 'body' + (r.get('state') ? ':' + r.get('state') : '');
        return r.get('mediaText') ? `@media ${r.get('mediaText')}{${sel}{${decl}}}` : `${sel}{${decl}}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  // ===================== Install ====================================

  function install() {
    const e = editor();
    if (!e) return;
    e.on('component:update', (c) => { if (c === wrapper()) schedule(); });
    e.on('component:styleUpdate', (c) => { if (!c || c === wrapper()) schedule(); });
    e.on('styleable:change', schedule);
    e.on('undo', schedule);
    e.on('redo', schedule);
    e.on('canvas:frame:load', () => schedule());
  }

  FigJS.pageBody = {
    install,
    getAttr, getAttrs, setAttrs,
    getStyle, setStyle, getClasses,
    wrapperRules, wrapperRulesCss,
    mirror, loadFrom, pruneOrphanIdRules, writeTo,
    BOOT_HOIST,
  };
})();
