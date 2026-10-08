// Settings renderer. A schema describes a block ({ title, properties },
// see registry.js); an adapter says where values live:
//   componentAdapter(el)  Presets tab, Settings panel (library-aware: style
//                         writes on a linked instance go to the shared rule)
//   pageAdapter()         Page tab
//   headAdapter()         Page tab <head> fields
// Undo: live input writes with avoidStore; a commit resets to the value
// the gesture started at (untracked) and writes once. Blur commits only
// typed fields: a field removed by a re-render still gets a blur.
// Clipboard: block Copy / Paste writes the keys both blocks share; pasting
// a class preset adds the class first.
//   FigJS.settingsUI.renderBlock(adapter, schema, opts) -> HTMLElement
//   FigJS.settingsUI.registerField(type, builder)
//   FigJS.settingsUI.committer(adapter, prop, onCommitted)  undo plumbing for fields
//   FigJS.settingsUI.readValue(adapter, prop, opts)
//   FigJS.settingsUI.componentAdapter / pageAdapter / headAdapter
//   FigJS.settingsUI.clipboard.get() / set(entry) / onChange(fn)
//   FigJS.settingsUI.install()  open blocks follow style and attribute
//                               changes made elsewhere (Style Manager, code)
//   FigJS.settingsUI.openColorPopover(anchor, { hex, alpha, withAlpha }, onChange)
//   FigJS.color.parse / format / toHex / equals

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // ===================== Colour model ==================================

  const clamp01 = (n) => Math.max(0, Math.min(1, isNaN(n) ? 1 : n));
  const rgbToHex = (r, g, b) => {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  };
  const hexToRgb = (hex) => {
    const h = String(hex || '').replace('#', '');
    const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
    return { r: parseInt(s.slice(0, 2), 16) || 0, g: parseInt(s.slice(2, 4), 16) || 0, b: parseInt(s.slice(4, 6), 16) || 0 };
  };
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function normalizeHex(v) {
    const s = String(v || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return '';
  }

  function parseColor(input) {
    const v = String(input == null ? '' : input).trim();
    if (!v) return { hex: '#000000', alpha: 1 };
    if (v === 'transparent') return { hex: '#000000', alpha: 0 };
    if (v[0] === '#') {
      const h = v.slice(1);
      if (h.length === 3) return { hex: normalizeHex(v), alpha: 1 };
      if (h.length === 4) return { hex: normalizeHex('#' + h.slice(0, 3)), alpha: parseInt(h[3] + h[3], 16) / 255 };
      if (h.length === 6) return { hex: '#' + h.toLowerCase(), alpha: 1 };
      if (h.length === 8) return { hex: '#' + h.slice(0, 6).toLowerCase(), alpha: parseInt(h.slice(6), 16) / 255 };
    }
    const m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
    if (m) {
      const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { hex: rgbToHex(+m[1], +m[2], +m[3]), alpha: clamp01(a) };
    }
    if (/var\(|currentcolor/i.test(v)) return { hex: '#000000', alpha: 1 };
    try {
      const probe = document.createElement('div');
      probe.style.color = v;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      if (computed && computed !== v) return parseColor(computed);
    } catch (e) {}
    return { hex: '#000000', alpha: 1 };
  }

  function formatColor(hex, alpha) {
    const a = clamp01(alpha);
    const base = normalizeHex(hex) || parseColor(hex).hex;
    if (a >= 0.999) return base;
    return base + Math.round(a * 255).toString(16).padStart(2, '0');
  }

  FigJS.color = {
    parse: parseColor,
    format: formatColor,
    toHex: (v) => normalizeHex(v) || parseColor(v).hex,
    equals: (a, b) => {
      const pa = parseColor(a), pb = parseColor(b);
      return pa.hex === pb.hex && Math.abs(pa.alpha - pb.alpha) < 0.002;
    },
  };

  // ===================== Colour popover ================================

  let activePopover = null;

  function closeColorPopover() {
    if (!activePopover) return;
    const p = activePopover;
    activePopover = null;
    p.el.remove();
    document.removeEventListener('mousedown', p.onOutside, true);
    document.removeEventListener('keydown', p.onKey, true);
    if (p.onClose) p.onClose();
  }

  function coordsIn(el, e) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }

  function openColorPopover(anchor, current, onChange) {
    closeColorPopover();
    const withAlpha = !!current.withAlpha;
    const parsed = parseColor(current.hex);
    let { h, s, v } = rgbToHsv(hexToRgb(parsed.hex).r, hexToRgb(parsed.hex).g, hexToRgb(parsed.hex).b);
    let alpha = clamp01(current.alpha == null ? parsed.alpha : current.alpha);
    let lastHex = parsed.hex;
    let lastPhase = 'preview';

    const el = document.createElement('div');
    el.className = 'fig-cp';
    el.innerHTML = `
      <div class="fig-cp-sv" data-sv><div class="fig-cp-sv-white"></div><div class="fig-cp-sv-black"></div>
        <div class="fig-cp-sv-cursor" data-sv-cursor></div></div>
      <div class="fig-cp-hue" data-hue><div class="fig-cp-strip-cursor" data-hue-cursor></div></div>
      ${withAlpha ? `<div class="fig-cp-alpha" data-alpha><div class="fig-checker"></div>
        <div class="fig-cp-alpha-inner" data-alpha-inner></div><div class="fig-cp-strip-cursor" data-alpha-cursor></div></div>` : ''}
      <div class="fig-cp-footer">
        <div class="fig-cp-preview"><div class="fig-checker"></div><div class="fig-cp-preview-inner" data-preview></div></div>
        <input class="fig-cp-hex" data-hex maxlength="9" spellcheck="false" autocomplete="off">
        ${withAlpha ? '<span class="fig-cp-alpha-num" data-alpha-num></span>' : ''}
      </div>`;
    document.body.appendChild(el);

    const q = (sel) => el.querySelector(sel);
    const svEl = q('[data-sv]'), svCur = q('[data-sv-cursor]');
    const hueEl = q('[data-hue]'), hueCur = q('[data-hue-cursor]');
    const alphaEl = q('[data-alpha]'), alphaInner = q('[data-alpha-inner]');
    const alphaCur = q('[data-alpha-cursor]'), alphaNum = q('[data-alpha-num]');
    const preview = q('[data-preview]'), hexInput = q('[data-hex]');

    const emit = (phase) => { lastPhase = phase; onChange({ hex: lastHex, alpha, phase }); };
    const paint = (phase) => {
      preview.style.background = formatColor(lastHex, alpha);
      svEl.style.background = `hsl(${h}, 100%, 50%)`;
      svCur.style.left = (s * 100) + '%';
      svCur.style.top = ((1 - v) * 100) + '%';
      hueCur.style.left = (h / 360 * 100) + '%';
      if (withAlpha) {
        alphaInner.style.background = `linear-gradient(to right, ${lastHex}00, ${lastHex})`;
        alphaCur.style.left = (alpha * 100) + '%';
        alphaNum.textContent = Math.round(alpha * 100) + '%';
      }
      if (document.activeElement !== hexInput) hexInput.value = lastHex;
      if (phase) emit(phase);
    };
    const fromHsv = () => { const c = hsvToRgb(h, s, v); lastHex = rgbToHex(c.r, c.g, c.b); };

    let drag = null;
    const move = (e) => {
      if (drag === svEl) { const c = coordsIn(svEl, e); s = c.x; v = 1 - c.y; fromHsv(); }
      else if (drag === hueEl) { h = coordsIn(hueEl, e).x * 360; fromHsv(); }
      else if (drag === alphaEl) { alpha = coordsIn(alphaEl, e).x; }
      paint('preview');
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (drag) { drag = null; emit('commit'); }
    };
    el.addEventListener('mousedown', (e) => {
      const t = e.target.closest('[data-sv], [data-hue], [data-alpha]');
      if (!t) return;
      e.preventDefault();
      drag = t;
      move(e);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    const setFromText = (txt) => {
      const p = parseColor(txt);
      if (!/^#[0-9a-f]{6}$/i.test(p.hex)) return false;
      lastHex = p.hex;
      if (withAlpha && /^#[0-9a-f]{8}$|rgba|\//i.test(txt)) alpha = p.alpha;
      const rgb = hexToRgb(lastHex);
      ({ h, s, v } = rgbToHsv(rgb.r, rgb.g, rgb.b));
      return true;
    };
    hexInput.addEventListener('input', () => { if (setFromText(hexInput.value.trim())) paint('preview'); });
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (setFromText(hexInput.value.trim())) paint('commit'); }
    });

    const onOutside = (e) => { if (!el.contains(e.target) && e.target !== anchor) closeColorPopover(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeColorPopover(); } };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);

    const r = anchor.getBoundingClientRect();
    const popW = 220, popH = withAlpha ? 262 : 232;
    let left = Math.min(r.left, window.innerWidth - popW - 8);
    let top = r.bottom + 6;
    if (top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 6);
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = top + 'px';

    paint(null);
    activePopover = { el, onOutside, onKey, onClose: () => { if (lastPhase === 'preview') emit('commit'); } };
    return { close: closeColorPopover };
  }

  // ===================== Composite value codecs ========================

  const LENGTH_RE = /^-?\d*\.?\d+[a-z%]*$/i;
  const isLength = (t) => t === '0' || LENGTH_RE.test(t);

  const codecs = {
    spacing: {
      parse(str) {
        const p = String(str || '').trim().split(/\s+/).filter(Boolean);
        if (p.length === 1) return { top: p[0], right: p[0], bottom: p[0], left: p[0] };
        if (p.length === 2) return { top: p[0], right: p[1], bottom: p[0], left: p[1] };
        if (p.length === 3) return { top: p[0], right: p[1], bottom: p[2], left: p[1] };
        if (p.length >= 4) return { top: p[0], right: p[1], bottom: p[2], left: p[3] };
        return { top: '0', right: '0', bottom: '0', left: '0' };
      },
      format({ top, right, bottom, left }) {
        if (top === right && right === bottom && bottom === left) return top || '0';
        if (top === bottom && right === left) return `${top} ${right}`;
        if (right === left) return `${top} ${right} ${bottom}`;
        return `${top} ${right} ${bottom} ${left}`;
      },
    },
    length: {
      parse(str) {
        const m = String(str || '').trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
        return m ? { value: m[1], unit: m[2] || '' } : { value: '0', unit: '' };
      },
      format(p) { return `${p.value || '0'}${p.unit || ''}`; },
    },
    shadow: {
      parse(str) {
        const out = { inset: false, x: '0', y: '0', blur: '0', spread: '0', color: '#000000' };
        let rest = String(str || '').trim();
        if (!rest || rest === 'none') return out;
        if (/^inset\b/.test(rest)) { out.inset = true; rest = rest.replace(/^inset\b/, '').trim(); }
        const colors = [];
        rest = rest.replace(/#[0-9a-f]{3,8}\b/gi, (m) => { colors.push(m); return ''; });
        rest = rest.replace(/\b(rgba?|hsla?)\([^)]*\)/g, (m) => { colors.push(m); return ''; });
        const lengths = rest.trim().split(/\s+/).filter(Boolean);
        const tail = lengths[lengths.length - 1];
        if (tail && !isLength(tail)) colors.push(lengths.pop());
        ['x', 'y', 'blur', 'spread'].forEach((k, i) => { if (lengths[i]) out[k] = lengths[i]; });
        if (colors[0]) out.color = colors[0];
        return out;
      },
      format(p) {
        const spread = p.spread && p.spread !== '0' && p.spread !== '0px' ? ' ' + p.spread : '';
        return `${p.inset ? 'inset ' : ''}${p.x || '0'} ${p.y || '0'} ${p.blur || '0'}${spread} ${p.color || '#000000'}`;
      },
    },
    // none | linear-gradient(<angle>deg, <from>, <to>) | radial-gradient(<shape>, <from>, <to>);
    // a flat tint is linear with from === to.
    gradient: {
      parse(str) {
        const s = String(str || '').trim();
        const out = { mode: 'none', angle: 180, from: '#00000000', to: '#000000aa', shape: 'ellipse' };
        let m = s.match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
        if (m) {
          out.angle = parseFloat(m[1]); out.from = m[2]; out.to = m[3];
          out.mode = FigJS.color.equals(m[2], m[3]) ? 'flat' : 'linear';
          return out;
        }
        m = s.match(/^radial-gradient\(\s*(circle|ellipse)[^,]*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
        if (m) { out.mode = 'radial'; out.shape = m[1]; out.from = m[2]; out.to = m[3]; }
        return out;
      },
      format(p) {
        if (p.mode === 'none') return '';
        if (p.mode === 'flat') return `linear-gradient(180deg, ${p.to}, ${p.to})`;
        if (p.mode === 'radial') return `radial-gradient(${p.shape || 'ellipse'} at center, ${p.from}, ${p.to})`;
        return `linear-gradient(${Math.round(p.angle)}deg, ${p.from}, ${p.to})`;
      },
    },
  };

  // ===================== Clipboard =====================================

  const clipListeners = new Set();
  let clip = null;
  const clipboard = {
    get: () => clip,
    set(entry) {
      clip = entry;
      clipListeners.forEach((fn) => { try { fn(clip); } catch (e) {} });
      FigJS.setStatus(`Copied ${entry.label}`, '#4caf50');
    },
    onChange(fn) { clipListeners.add(fn); return () => clipListeners.delete(fn); },
  };

  // ===================== Adapters ======================================

  function editor() { return FigJS.editor; }

  function attrKey(prop) { return prop.attr === true || /^data-|^aria-/.test(prop.key) && prop.attr !== false; }

  // The shared Library rule for a linked instance, else the component (its id rule).
  function styleTargetFor(component) {
    if (FigJS.library && FigJS.library.styleTargetFor) {
      const t = FigJS.library.styleTargetFor(component);
      if (t) return t;
    }
    return component;
  }

  function readRuleStyle(target) {
    try {
      if (typeof target.toHTML === 'function') return { ...(target.getStyle() || {}) };
      return { ...(target.getStyle('', { skipResolve: true }) || {}) };
    } catch (e) { return {}; }
  }

  // A shorthand reads from its parts and a part from its shorthand; a write
  // keeps them from disagreeing (css-parts.js).
  function styleRead(style, key) {
    if (FigJS.cssParts) return FigJS.cssParts.read(style, key);
    const v = (style || {})[key];
    return v == null || v === '' ? '' : String(v);
  }
  function styleWrite(style, key, value) {
    if (FigJS.cssParts) return FigJS.cssParts.write(style, key, value);
    const next = { ...(style || {}) };
    if (value === '' || value == null) delete next[key];
    else next[key] = String(value);
    return next;
  }

  function componentAdapter(component) {
    const target = () => styleTargetFor(component);
    const libraryName = () => (FigJS.library && FigJS.library.instanceLabel) ? FigJS.library.instanceLabel(component) : '';
    return {
      kind: 'component',
      component,
      scopeLabel() {
        const lib = libraryName();
        return lib ? `Library: ${lib}` : 'This element';
      },
      read(key, opts) {
        const t = target();
        const themed = FigJS.themeEdit && FigJS.themeEdit.readOverride(t, key);
        if (themed != null) return themed;
        const ruled = styleRead(readRuleStyle(t), key);
        if (ruled) return ruled;
        if (t !== component) {
          const own = styleRead(component.getStyle() || {}, key);
          if (own) return own;
        }
        if (opts && opts.raw) return '';
        try {
          const el = component.getEl && component.getEl();
          const v = el ? getComputedStyle(el).getPropertyValue(key) : '';
          return v ? v.trim() : '';
        } catch (e) { return ''; }
      },
      write(key, value, opts) {
        const t = target();
        const next = styleWrite(readRuleStyle(t), key, value);
        if (t === component) component.setStyle(next, opts || {});
        else t.setStyle(next, { ...(opts || {}), partial: false });
        if (!(opts && opts.avoidStore)) FigJS.markUnsaved();
      },
      // An image's source is a GrapesJS property.
      readAttr(key) {
        if (key === 'src' && component.get('type') === 'image') return String(component.get('src') || '');
        const v = (component.getAttributes() || {})[key];
        return v == null ? '' : String(v);
      },
      writeAttr(key, value, opts) {
        if (key === 'src' && component.get('type') === 'image') component.set('src', value == null ? '' : String(value), opts || {});
        else if (value === '' || value == null) component.removeAttributes([key], opts || {});
        else component.addAttributes({ [key]: String(value) }, opts || {});
        if (!(opts && opts.avoidStore)) FigJS.markUnsaved();
      },
      hasClass: (c) => component.getClasses().includes(c),
      addClass: (c) => component.addClass(c),
      removeClass: (c) => component.removeClass(c),
      changed() { if (FigJS.codeView) FigJS.codeView.debouncedSync(); },
    };
  }

  // Writing the requested theme also resolves data-theme for the canvas.
  function resolveTheme(requested, mode) {
    if (mode === 'force-dark') return 'dark';
    if (mode === 'force-light') return 'light';
    if (requested === 'light' || requested === 'dark') return requested;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function pageAdapter() {
    const pb = FigJS.pageBody;
    return {
      kind: 'page',
      scopeLabel: () => 'This page',
      read(key) {
        const themed = FigJS.themeEdit && FigJS.themeEdit.readOverride(editor().getWrapper(), key);
        if (themed != null) return themed;
        return styleRead(pb.getStyle() || {}, key);
      },
      write(key, value, opts) {
        const prev = pb.getStyle() || {};
        const next = styleWrite(prev, key, value);
        const changes = { ...next };
        Object.keys(prev).forEach((k) => { if (!(k in next)) changes[k] = ''; });
        pb.setStyle(changes, opts || {});
        if (!(opts && opts.avoidStore)) FigJS.markUnsaved();
      },
      readAttr(key) { return pb.getAttr(key); },
      writeAttr(key, value, opts) {
        const changes = { [key]: value };
        if (key === 'data-theme-requested' || key === 'data-theme-mode') {
          const req = key === 'data-theme-requested' ? value : pb.getAttr('data-theme-requested');
          const mode = key === 'data-theme-mode' ? value : pb.getAttr('data-theme-mode');
          changes['data-theme'] = mode === 'custom' ? '' : resolveTheme(req || 'auto', mode || 'auto');
        }
        pb.setAttrs(changes, opts || {});
        if (!(opts && opts.avoidStore)) FigJS.markUnsaved();
      },
      hasClass: (c) => pb.getClasses().includes(c),
      addClass: (c) => editor().getWrapper().addClass(c),
      removeClass: (c) => editor().getWrapper().removeClass(c),
      changed() { if (FigJS.codeView) FigJS.codeView.debouncedSync(); },
    };
  }

  // <head> settings through the Code tab's head textarea (not undoable):
  //   title, meta:<name> (name or property), link:<rel>
  function headAdapter() {
    const liveHead = () => document.getElementById('live-head');
    const parse = () => new DOMParser().parseFromString(
      `<!DOCTYPE html><html><head>${liveHead().value}</head></html>`, 'text/html');
    const selectorFor = (key) => {
      if (key === 'title') return 'title';
      if (key.startsWith('meta:')) {
        const n = key.slice(5);
        return `meta[name="${n}"], meta[property="${n}"]`;
      }
      if (key.startsWith('link:')) return `link[rel~="${key.slice(5)}"]`;
      return null;
    };
    return {
      kind: 'head',
      scopeLabel: () => 'Page <head>',
      read(key) {
        const sel = selectorFor(key);
        const el = sel ? parse().querySelector(sel) : null;
        if (!el) return '';
        if (key === 'title') return el.textContent;
        if (key.startsWith('meta:')) return el.getAttribute('content') || '';
        return el.getAttribute('href') || '';
      },
      write(key, value) {
        const doc = parse();
        const sel = selectorFor(key);
        if (!sel) return;
        let el = doc.querySelector(sel);
        const v = value == null ? '' : String(value);
        if (!v && key !== 'title') { if (el) el.remove(); }
        else {
          if (!el) {
            if (key === 'title') el = doc.createElement('title');
            else if (key.startsWith('meta:')) {
              el = doc.createElement('meta');
              const n = key.slice(5);
              el.setAttribute(/^(og|twitter):/.test(n) ? 'property' : 'name', n);
            } else { el = doc.createElement('link'); el.setAttribute('rel', key.slice(5)); }
            doc.head.appendChild(el);
          }
          if (key === 'title') el.textContent = v;
          else if (key.startsWith('meta:')) el.setAttribute('content', v);
          else el.setAttribute('href', v);
        }
        FigJS.codeView.setValue(liveHead(), FigJS.codeFormat.html(doc.head.innerHTML));
        FigJS.canvas.syncHead();
        FigJS.markUnsaved();
      },
      readAttr() { return ''; },
      writeAttr() {},
      hasClass: () => false, addClass() {}, removeClass() {},
      changed() {},
    };
  }

  // ===================== Value plumbing ================================

  // A class-select's value is whichever option class the element carries;
  // a classToggle property's key is a class, 'true' while the element has it.
  function readValue(adapter, prop, opts) {
    if (prop.type === 'class-select') {
      const hit = (prop.options || []).find((o) => adapter.hasClass(o.id));
      return hit ? hit.id : '';
    }
    if (prop.classToggle) return adapter.hasClass(prop.key) ? 'true' : '';
    return attrKey(prop) ? adapter.readAttr(prop.key) : adapter.read(prop.key, opts);
  }

  function writeValue(adapter, prop, value, opts) {
    if (prop.type === 'class-select') {
      (prop.options || []).forEach((o) => { if (o.id !== value && adapter.hasClass(o.id)) adapter.removeClass(o.id); });
      if (value && !adapter.hasClass(value)) adapter.addClass(value);
      return;
    }
    if (prop.classToggle) {
      const on = !!value && value !== 'false';
      if (on !== adapter.hasClass(prop.key)) {
        if (on) adapter.addClass(prop.key);
        else adapter.removeClass(prop.key);
        if (!(opts && opts.avoidStore)) FigJS.markUnsaved();
      }
      return;
    }
    if (attrKey(prop)) adapter.writeAttr(prop.key, value, opts);
    else adapter.write(prop.key, value, opts);
  }

  // One gesture, one undo entry (see the top of the file).
  function committer(adapter, prop, onCommitted) {
    let baseline;
    let started = false;
    let touched = false;
    const begin = () => {
      if (started) return;
      started = true;
      baseline = readValue(adapter, prop, { raw: true });
    };
    const api = {
      begin,
      touch() {
        begin();
        touched = true;
      },
      preview(value) {
        api.touch();
        writeValue(adapter, prop, value, { avoidStore: true });
      },
      settle(value) {
        if (touched) api.commit(value);
        else api.cancel();
      },
      cancel() {
        started = false;
        touched = false;
      },
      commit(value) {
        begin();
        started = false;
        touched = false;
        const before = baseline;
        if (String(before || '') === String(value || '')) {
          writeValue(adapter, prop, value, { avoidStore: true });
          return;
        }
        FigJS.undo.untracked(() => writeValue(adapter, prop, before, {}));
        writeValue(adapter, prop, value, {});
        adapter.changed();
        if (onCommitted) onCommitted(value, before);
      },
    };
    return api;
  }

  // Live preview on input; commit on change, or for text fields on blur / Enter.
  function bindInput(input, c, toValue) {
    const isText = input.tagName === 'TEXTAREA'
      || (input.tagName === 'INPUT' && /^(text|number|search|url)$/.test(input.type));
    input.addEventListener('focus', c.begin);
    input.addEventListener('pointerdown', c.begin);
    input.addEventListener('input', () => c.preview(toValue(input.value)));
    if (isText) {
      input.addEventListener('blur', () => c.settle(toValue(input.value)));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') { e.preventDefault(); input.blur(); }
      });
    } else {
      input.addEventListener('change', () => c.commit(toValue(input.value)));
    }
  }

  // prop.placeholder may be a function of the adapter (a value inherited
  // from elsewhere, like a gallery's slide default).
  function placeholderOf(prop, adapter) {
    const p = typeof prop.placeholder === 'function' ? prop.placeholder(adapter) : prop.placeholder;
    return p == null ? '' : String(p);
  }

  function formatValue(v, format, unit) {
    if (v == null || v === '') return '';
    const n = parseFloat(v);
    if (isNaN(n)) return String(v);
    if (format === 'percent') return Math.round(n * 100) + '%';
    if (format === 'x') return n.toFixed(2).replace(/\.?0+$/, '') + 'x';
    return String(+n.toFixed(3)) + (unit || '');
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function checker(cls) { return el('span', 'fig-checker' + (cls ? ' ' + cls : '')); }

  // Field builders return { el, refresh() }; ctx = { adapter, prop, schema }.

  function colorField(ctx, withAlpha) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-color');
    const swatch = el('button', 'fig-swatch');
    swatch.type = 'button';
    const fill = el('span', 'fig-swatch-fill');
    swatch.append(checker(), fill);
    const hex = el('input', 'fig-f-input fig-f-mono');
    hex.type = 'text';
    hex.spellcheck = false;
    hex.maxLength = 9;
    const pct = withAlpha ? el('span', 'fig-f-readout') : null;
    wrap.append(swatch, hex);
    if (pct) wrap.appendChild(pct);

    let cur = parseColor('#000000');
    const show = () => {
      fill.style.background = formatColor(cur.hex, cur.alpha);
      if (document.activeElement !== hex) hex.value = cur.hex;
      if (pct) pct.textContent = Math.round(cur.alpha * 100) + '%';
    };
    const c = committer(adapter, prop, null);

    swatch.addEventListener('click', (e) => {
      e.preventDefault();
      c.begin();
      openColorPopover(swatch, { hex: cur.hex, alpha: cur.alpha, withAlpha }, ({ hex: h, alpha, phase }) => {
        cur = { hex: h, alpha: withAlpha ? alpha : 1 };
        show();
        const value = formatColor(cur.hex, cur.alpha);
        if (phase === 'commit') c.commit(value); else c.preview(value);
      });
    });
    hex.addEventListener('focus', c.begin);
    hex.addEventListener('input', c.touch);
    const commitHex = () => {
      const p = parseColor(hex.value.trim());
      if (!/^#?[0-9a-f]{3,8}$|^rgb|^hsl|^[a-z]+$/i.test(hex.value.trim())) { show(); c.cancel(); return; }
      cur = { hex: p.hex, alpha: withAlpha && /^#[0-9a-f]{8}$|rgba/i.test(hex.value) ? p.alpha : cur.alpha };
      show();
      c.settle(formatColor(cur.hex, cur.alpha));
    };
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } });
    hex.addEventListener('blur', commitHex);

    const refresh = () => {
      const raw = readValue(adapter, prop, {});
      cur = parseColor(raw || prop.default || '#000000');
      show();
    };
    refresh();
    return { el: wrap, refresh };
  }

  function rangeField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-range');
    const range = el('input');
    range.type = 'range';
    range.min = prop.min != null ? prop.min : 0;
    range.max = prop.max != null ? prop.max : 100;
    range.step = prop.step || 1;
    const num = el('input', 'fig-f-input fig-f-num');
    num.type = 'number';
    num.min = range.min; num.max = range.max; num.step = range.step;
    const unit = el('span', 'fig-f-unit', prop.format === 'percent' ? '%' : (prop.unit || ''));
    wrap.append(range, num, unit);

    const toCss = (v) => (v === '' || v == null) ? '' : `${v}${prop.unit || ''}`;
    const fromNum = (v) => prop.format === 'percent' ? String(parseFloat(v) / 100) : v;
    const toNum = (v) => prop.format === 'percent' ? String(Math.round(parseFloat(v) * 100)) : v;
    const c = committer(adapter, prop, null);

    range.addEventListener('pointerdown', c.begin);
    range.addEventListener('focus', c.begin);
    range.addEventListener('input', () => { num.value = toNum(range.value); c.preview(toCss(range.value)); });
    range.addEventListener('change', () => c.commit(toCss(range.value)));
    num.addEventListener('focus', c.begin);
    num.addEventListener('input', () => {
      c.touch();
      const v = fromNum(num.value);
      if (num.value !== '' && !isNaN(parseFloat(v))) { range.value = v; c.preview(toCss(v)); }
    });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); num.blur(); } });
    num.addEventListener('blur', () => {
      const v = num.value === '' ? '' : fromNum(num.value);
      c.settle(toCss(v));
    });

    const refresh = () => {
      const raw = readValue(adapter, prop, {});
      const m = String(raw || '').match(/-?\d*\.?\d+/);
      const n = m ? m[0] : String(prop.default != null ? prop.default : range.min);
      range.value = n;
      if (document.activeElement !== num) num.value = toNum(n);
    };
    refresh();
    return { el: wrap, refresh };
  }

  function selectField(ctx) {
    const { adapter, prop } = ctx;
    const sel = el('select', 'fig-f-input');
    const blank = el('option', null, placeholderOf(prop, adapter) || '(default)');
    blank.value = '';
    sel.appendChild(blank);
    (prop.options || []).forEach((o) => {
      const opt = el('option', null, typeof o === 'string' ? o : (o.name || o.id));
      opt.value = typeof o === 'string' ? o : o.id;
      sel.appendChild(opt);
    });
    const c = committer(adapter, prop, () => { if (prop.rerender && ctx.rerender) ctx.rerender(); });
    sel.addEventListener('focus', c.begin);
    sel.addEventListener('pointerdown', c.begin);
    sel.addEventListener('change', () => c.commit(sel.value));
    const refresh = () => {
      blank.textContent = placeholderOf(prop, adapter) || '(default)';
      const raw = String(readValue(adapter, prop, { raw: true }) || '').replace(/["']/g, '').trim();
      sel.value = Array.from(sel.options).some((o) => o.value === raw) ? raw : '';
    };
    refresh();
    return { el: sel, refresh };
  }

  // Aspect: the shared shapes (PresetRegistry.aspectOptions), prop.extra
  // first (Natural, Free height), and Other… for any ratio: 5:2, 5/2, 2.5.
  const normRatio = (v) => String(v || '').trim().replace(/\s*\/\s*/, ' / ');
  function parseRatio(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d*\.?\d+)\s*[:/x×]\s*(\d*\.?\d+)$/i);
    if (m && parseFloat(m[1]) > 0 && parseFloat(m[2]) > 0) return `${+m[1]} / ${+m[2]}`;
    return /^\d*\.?\d+$/.test(s) && parseFloat(s) > 0 ? String(+s) : '';
  }

  function aspectField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-aspect');
    const sel = el('select', 'fig-f-input');
    const custom = el('input', 'fig-f-input fig-f-mono');
    custom.type = 'text';
    custom.placeholder = '5 / 2';
    custom.spellcheck = false;
    custom.title = 'Width / height: 5:2, 5/2 or 2.5';
    const shared = window.PresetRegistry && window.PresetRegistry.aspectOptions ? window.PresetRegistry.aspectOptions() : [];
    const options = (prop.extra || []).concat(shared);
    const blank = el('option');
    blank.value = '';
    sel.appendChild(blank);
    options.forEach((o) => {
      const opt = el('option', null, o.name);
      opt.value = o.id;
      sel.appendChild(opt);
    });
    const other = el('option', null, 'Other…');
    other.value = '__other';
    sel.appendChild(other);
    wrap.append(sel, custom);

    const known = (v) => options.some((o) => o.id === v);
    const c = committer(adapter, prop, () => { if (prop.rerender && ctx.rerender) ctx.rerender(); });
    sel.addEventListener('focus', c.begin);
    sel.addEventListener('pointerdown', c.begin);
    sel.addEventListener('change', () => {
      if (sel.value === '__other') {
        custom.hidden = false;
        custom.focus();
        return;
      }
      custom.hidden = true;
      c.commit(sel.value);
    });
    custom.addEventListener('focus', c.begin);
    custom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); custom.blur(); }
      else if (e.key === 'Escape') { c.cancel(); refresh(true); custom.blur(); }
    });
    custom.addEventListener('blur', () => {
      const v = parseRatio(custom.value);
      if (v) c.commit(v);
      else c.cancel();
      refresh(true);
    });

    function refresh(force) {
      // An unset value that is one of the shapes reads as its default.
      const ph = placeholderOf(prop, adapter);
      blank.textContent = !ph ? '(default)' : options.some((o) => o.name === ph) ? `Default (${ph})` : ph;
      if (!force && document.activeElement === custom) return;
      const raw = normRatio(readValue(adapter, prop, { raw: true }));
      const listed = !raw || known(raw);
      sel.value = listed ? raw : '__other';
      custom.hidden = listed;
      custom.value = listed ? '' : raw;
    }
    refresh(true);
    return { el: wrap, refresh: () => refresh(false) };
  }

  // Segmented buttons: a select with few options, shown inline.
  function segmentedField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-seg');
    const c = committer(adapter, prop, () => { if (prop.rerender && ctx.rerender) ctx.rerender(); });
    const buttons = (prop.options || []).map((o) => {
      const b = el('button', null, o.name || o.id);
      b.type = 'button';
      b.dataset.value = o.id;
      if (o.title) b.title = o.title;
      b.addEventListener('click', () => { c.commit(o.id); refresh(); });
      wrap.appendChild(b);
      return b;
    });
    const refresh = () => {
      const raw = readValue(adapter, prop, { raw: true }) || (prop.default != null ? String(prop.default) : '');
      buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.value === raw));
    };
    refresh();
    return { el: wrap, refresh };
  }

  function toggleField(ctx) {
    const { adapter, prop } = ctx;
    const label = el('label', 'fig-f-toggle');
    const box = el('input');
    box.type = 'checkbox';
    label.appendChild(box);
    label.appendChild(el('span', null, prop.text || ''));
    const on = prop.valueTrue != null ? String(prop.valueTrue) : 'true';
    const off = prop.valueFalse != null ? String(prop.valueFalse) : '';
    const c = committer(adapter, prop, () => { if (prop.rerender && ctx.rerender) ctx.rerender(); });
    box.addEventListener('change', () => c.commit(box.checked ? on : off));
    const refresh = () => { box.checked = String(readValue(adapter, prop, { raw: true })) === on; };
    refresh();
    return { el: label, refresh };
  }

  function textField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-text');
    const multiline = prop.type === 'textarea';
    const input = el(multiline ? 'textarea' : 'input', 'fig-f-input');
    if (!multiline) input.type = 'text';
    else input.rows = prop.rows || 3;
    input.placeholder = placeholderOf(prop, adapter);
    input.spellcheck = !!prop.spellcheck;
    wrap.appendChild(input);
    const toDisplay = (v) => (prop.unwrap ? prop.unwrap(String(v || '')) : String(v || ''));
    const fromDisplay = (v) => (prop.wrap ? prop.wrap(String(v || '')) : String(v || ''));
    // prop.onCommit(adapter, value, before) runs in the same undo step.
    const c = committer(adapter, prop, prop.onCommit || prop.rerender ? (v, before) => {
      if (prop.onCommit) {
        prop.onCommit(adapter, v, before);
        refresh();
      }
      if (prop.rerender && ctx.rerender) ctx.rerender();
    } : null);
    bindInput(input, c, fromDisplay);

    if (prop.browse) {
      const btn = el('button', 'fig-f-browse');
      btn.innerHTML = FigJS.icons.browse;
      btn.type = 'button';
      btn.title = 'Browse the media library';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!FigJS.media || !FigJS.media.pick) return;
        FigJS.media.pick({ kind: prop.browse === true ? 'image' : prop.browse }).then((url) => {
          if (url == null) return;
          // A list field gains a line; a single field is replaced.
          const current = input.value.replace(/\s+$/, '');
          input.value = multiline && current ? current + '\n' + url : url;
          c.begin();
          c.commit(fromDisplay(input.value));
        });
      });
      wrap.appendChild(btn);
    }
    const refresh = () => {
      if (document.activeElement === input) return;
      input.placeholder = placeholderOf(prop, adapter);
      const raw = readValue(adapter, prop, { raw: true });
      input.value = toDisplay(raw || '');
    };
    refresh();
    return { el: wrap, refresh };
  }

  function compositeField(ctx, codecName, parts) {
    const { adapter, prop } = ctx;
    const codec = codecs[codecName];
    const wrap = el('div', 'fig-f-composite');
    const inputs = {};
    const c = committer(adapter, prop, null);
    parts.forEach(([key, label]) => {
      const f = el('label', 'fig-f-mini');
      f.appendChild(el('span', null, label));
      const inp = el('input', 'fig-f-input fig-f-mono');
      inp.type = 'text';
      inputs[key] = inp;
      f.appendChild(inp);
      wrap.appendChild(f);
    });
    const current = () => {
      const p = codec.parse(readValue(adapter, prop, {}) || prop.default || '');
      parts.forEach(([key]) => { if (inputs[key].value) p[key] = inputs[key].value; });
      return codec.format(p);
    };
    Object.values(inputs).forEach((inp) => bindInput(inp, c, () => current()));
    const refresh = () => {
      const p = codec.parse(readValue(adapter, prop, {}) || prop.default || '');
      parts.forEach(([key]) => { if (document.activeElement !== inputs[key]) inputs[key].value = p[key]; });
    };
    refresh();
    return { el: wrap, refresh };
  }

  function shadowField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-stack');
    const lengths = compositeField(ctx, 'shadow', [['x', 'X'], ['y', 'Y'], ['blur', 'Blur'], ['spread', 'Spread']]);
    const colorProp = { ...prop };
    // The colour part edits the same key through the codec.
    const colorAdapter = {
      ...adapter,
      read: (k, o) => codecs.shadow.parse(adapter.read(k, o) || prop.default || '').color,
      write: (k, v, o) => {
        const p = codecs.shadow.parse(adapter.read(k, {}) || prop.default || '');
        p.color = v || '#000000';
        adapter.write(k, codecs.shadow.format(p), o);
      },
    };
    const color = colorField({ adapter: colorAdapter, prop: colorProp }, true);
    wrap.append(lengths.el, color.el);
    return { el: wrap, refresh: () => { lengths.refresh(); color.refresh(); } };
  }

  function gradientField(ctx) {
    const { adapter, prop } = ctx;
    const codec = codecs.gradient;
    const wrap = el('div', 'fig-f-stack');
    const readParts = () => codec.parse(readValue(adapter, prop, { raw: true }) || prop.default || '');
    const writeParts = (p, opts) => writeValue(adapter, prop, codec.format(p), opts);

    // Each control edits one part of the gradient string.
    const partAdapter = (part) => ({
      ...adapter,
      read: () => String(readParts()[part]),
      write: (k, v, o) => { const p = readParts(); p[part] = v === '' ? (part === 'angle' ? 180 : p[part]) : v; writeParts(p, o); },
      readAttr: () => String(readParts()[part]),
      writeAttr: (k, v, o) => { const p = readParts(); p[part] = v; writeParts(p, o); },
    });

    const mode = segmentedField({ adapter: partAdapter('mode'), prop: { key: prop.key, attr: false,
      options: [{ id: 'none', name: 'None' }, { id: 'flat', name: 'Tint' },
        { id: 'linear', name: 'Fade' }, { id: 'radial', name: 'Vignette' }] } });
    const rows = el('div', 'fig-f-stack');
    const fromRow = el('div', 'fig-f-row');
    fromRow.append(el('span', 'fig-f-sublabel', 'From'), colorField({ adapter: partAdapter('from'), prop }, true).el);
    const toRow = el('div', 'fig-f-row');
    const toColor = colorField({ adapter: partAdapter('to'), prop }, true);
    toRow.append(el('span', 'fig-f-sublabel', 'To'), toColor.el);
    const angleRow = el('div', 'fig-f-row');
    const angle = rangeField({ adapter: partAdapter('angle'), prop: { key: prop.key, min: 0, max: 360, step: 5, unit: '' } });
    angleRow.append(el('span', 'fig-f-sublabel', 'Angle'), angle.el);
    rows.append(fromRow, toRow, angleRow);
    wrap.append(mode.el, rows);

    const refresh = () => {
      const p = readParts();
      mode.refresh();
      rows.hidden = p.mode === 'none';
      fromRow.hidden = p.mode === 'flat';
      angleRow.hidden = p.mode !== 'linear';
      toRow.querySelector('.fig-f-sublabel').textContent = p.mode === 'flat' ? 'Colour' : (p.mode === 'radial' ? 'Edge' : 'To');
      toColor.refresh();
      angle.refresh();
    };
    wrap.addEventListener('click', () => requestAnimationFrame(refresh));
    refresh();
    return { el: wrap, refresh };
  }

  function langMultiField(ctx) {
    const { adapter, prop } = ctx;
    const wrap = el('div', 'fig-f-chips');
    const langs = (window.PresetRegistry && window.PresetRegistry.getLanguages) ? window.PresetRegistry.getLanguages() : [];
    const c = committer(adapter, { ...prop, attr: true }, null);
    const buttons = langs.map((l) => {
      const b = el('button', 'fig-chip', l.code);
      b.type = 'button';
      b.title = l.name;
      b.addEventListener('click', () => {
        b.classList.toggle('is-active');
        const codes = buttons.filter((x) => x.classList.contains('is-active')).map((x) => x.textContent);
        c.commit(codes.join(' '));
      });
      wrap.appendChild(b);
      return b;
    });
    const refresh = () => {
      const set = new Set(String(adapter.readAttr(prop.key) || '').split(/[\s,]+/).filter(Boolean));
      buttons.forEach((b) => b.classList.toggle('is-active', set.has(b.textContent)));
    };
    refresh();
    return { el: wrap, refresh };
  }

  // A preset property offers named bundles of values.
  function bundleField(ctx) {
    const { adapter, prop } = ctx;
    const sel = el('select', 'fig-f-input');
    const custom = el('option', null, '(custom)');
    custom.value = '';
    sel.appendChild(custom);
    (prop.options || []).forEach((o) => {
      const opt = el('option', null, o.name);
      opt.value = o.name;
      sel.appendChild(opt);
    });
    const valuesOf = (o) => Object.entries(o.values || {});
    sel.addEventListener('change', () => {
      const o = (prop.options || []).find((x) => x.name === sel.value);
      if (!o) return;
      // Synchronous writes share one undo entry.
      valuesOf(o).forEach(([k, v]) => writeValue(adapter, { key: k }, v, {}));
      adapter.changed();
      if (ctx.rerender) ctx.rerender();
    });
    const refresh = () => {
      const match = (prop.options || []).find((o) => valuesOf(o).every(([k, v]) =>
        String(readValue(adapter, { key: k }, { raw: true })).replace(/["'\s]/g, '') === String(v).replace(/["'\s]/g, '')));
      sel.value = match ? match.name : '';
    };
    refresh();
    return { el: sel, refresh };
  }

  // Variant / mode chooser over classes.
  function classSelectField(ctx) {
    const { adapter, prop } = ctx;
    const sel = el('select', 'fig-f-input');
    const blank = el('option', null, prop.placeholder || '(none)');
    blank.value = '';
    sel.appendChild(blank);
    (prop.options || []).forEach((o) => {
      const opt = el('option', null, o.name || o.id);
      opt.value = o.id;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      writeValue(adapter, prop, sel.value, {});
      FigJS.markUnsaved();
      adapter.changed();
      if (ctx.rerender) ctx.rerender();
    });
    const refresh = () => { sel.value = readValue(adapter, prop); };
    refresh();
    return { el: sel, refresh };
  }

  // A button that runs prop.run(adapter); it holds no value.
  function actionField(ctx) {
    const { adapter, prop } = ctx;
    const b = el('button', 'fig-f-action', prop.text || prop.label || '');
    b.type = 'button';
    b.addEventListener('click', (e) => { e.preventDefault(); prop.run(adapter, ctx); });
    return { el: b, refresh() {} };
  }

  const BUILDERS = {
    'action': actionField,
    'aspect': aspectField,
    'class-select': classSelectField,
    'color': (ctx) => colorField(ctx, true),
    'color-alpha': (ctx) => colorField(ctx, true),
    'range': rangeField,
    'number': rangeField,
    'length': rangeField,
    'select': selectField,
    'segmented': segmentedField,
    'toggle': toggleField,
    'text': textField,
    'textarea': textField,
    'spacing': (ctx) => compositeField(ctx, 'spacing', [['top', 'T'], ['right', 'R'], ['bottom', 'B'], ['left', 'L']]),
    'shadow': shadowField,
    'gradient': gradientField,
    'lang-multi': langMultiField,
    'preset': bundleField,
  };

  // opts: cls (class preset), removable, compact (Settings panel), id
  // (clipboard identity, default title), onRemove()

  function renderBlock(adapter, schema, opts) {
    const o = opts || {};
    const box = el('section', 'fig-block' + (o.compact ? ' is-compact' : ''));
    const blockId = o.id || o.cls || schema.title;
    box.dataset.block = blockId;

    const head = el('header', 'fig-block-head');
    if (!o.hideTitle) head.appendChild(el('span', 'fig-block-title', schema.title || o.cls || ''));
    if (o.cls) head.appendChild(el('code', 'fig-block-cls', '.' + o.cls));
    const tools = el('span', 'fig-block-tools');

    // noCopy keys (an element's own address) stay out of copy, paste and reset.
    const keys = (schema.properties || []).filter((p) => p.key && p.type !== 'note' && !p.noCopy);
    const tool = (label, title, onClick, extra) => {
      const b = el('button', 'fig-icon-btn' + (extra ? ' ' + extra : ''));
      b.innerHTML = label;
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      tools.appendChild(b);
      return b;
    };

    tool(FigJS.icons.copy, 'Copy these settings', () => {
      const values = {};
      keys.forEach((p) => {
        if (p.type === 'class-select') {
          values[p.key] = { v: readValue(adapter, p), classSelect: p.options };
          return;
        }
        const parts = p.type === 'preset'
          ? Object.keys((p.options || [])[0] ? p.options[0].values : {}) : [p.key];
        parts.forEach((k) => {
          const prop = { ...p, key: k };
          const v = readValue(adapter, prop, { raw: true });
          if (v !== '') values[k] = { v, attr: attrKey(prop), classToggle: !!p.classToggle };
        });
      });
      clipboard.set({ kind: 'block', id: blockId, cls: o.cls || null, label: schema.title || o.cls, values });
    });

    const pasteBtn = tool(FigJS.icons.paste, 'Paste copied settings', () => {
      const c = clipboard.get();
      if (!c) return;
      if (c.cls && !adapter.hasClass(c.cls) && c.cls === o.cls) adapter.addClass(c.cls);
      const own = new Set(keys.map((p) => p.key));
      let n = 0;
      Object.entries(c.values).forEach(([k, rec]) => {
        if (!own.has(k) && c.id !== blockId) return;
        const prop = rec.classSelect
          ? { key: k, type: 'class-select', options: rec.classSelect }
          : { key: k, attr: rec.attr, classToggle: rec.classToggle };
        writeValue(adapter, prop, rec.v, {});
        n++;
      });
      adapter.changed();
      refreshAll();
      FigJS.setStatus(n ? `Pasted ${n} setting${n === 1 ? '' : 's'} from ${c.label}` : 'Nothing in the clipboard matches these settings', n ? '#4caf50' : '#ff9800');
    });
    let unsub = null;
    const syncPaste = () => {
      if (unsub && !box.isConnected) { unsub(); return; }
      const c = clipboard.get();
      pasteBtn.disabled = !c || !(c.id === blockId || Object.keys(c.values).some((k) => keys.some((p) => p.key === k)));
    };
    syncPaste();
    unsub = clipboard.onChange(syncPaste);

    tool(FigJS.icons.reset, 'Reset to defaults', () => {
      keys.forEach((p) => writeValue(adapter, p, '', {}));
      adapter.changed();
      refreshAll();
    });

    if (o.removable && o.cls) {
      tool(FigJS.icons.close, `Remove .${o.cls} from the element`, () => {
        adapter.removeClass(o.cls);
        if (o.onRemove) o.onRemove();
      }, 'is-danger');
    }
    head.appendChild(tools);
    box.appendChild(head);

    if (schema.description) box.appendChild(el('p', 'fig-block-desc', schema.description));
    if (schema.modifier) {
      const m = schema.modifier;
      const sym = { multiply: 'x', add: '+', set: '=', append: '+' }[m.op] || '=';
      box.appendChild(el('div', 'fig-block-modifier',
        `${m.label || 'Preset adds'}: ${sym} ${formatValue(m.value, m.format)}`));
    }

    const refreshers = [];
    const refreshAll = () => refreshers.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    box.__refresh = refreshAll;

    const body = el('div', 'fig-block-body');
    let currentGroup = null;
    (schema.properties || []).forEach((prop) => {
      if (prop.when && !prop.when(adapter)) return;
      if (prop.type === 'group') {
        currentGroup = el('div', 'fig-block-group');
        currentGroup.appendChild(el('div', 'fig-block-group-title', prop.label));
        body.appendChild(currentGroup);
        return;
      }
      if (prop.type === 'note') {
        (currentGroup || body).appendChild(el('p', 'fig-block-desc', prop.label));
        return;
      }
      const build = typeof prop.build === 'function' ? prop.build : (BUILDERS[prop.type] || textField);
      // prop.adapter(adapter) -> another adapter: the row edits another
      // element (a gallery's viewer); such rows are noCopy.
      const rowAdapter = typeof prop.adapter === 'function' ? (prop.adapter(adapter) || adapter) : adapter;
      const ctx = { adapter: rowAdapter, prop, schema, rerender: () => o.rerender && o.rerender() };
      let field;
      try { field = build(ctx); } catch (e) { console.error('[settings-ui] field failed', prop, e); return; }
      const row = el('div', 'fig-row' + (prop.wide || /^(shadow|spacing|gradient|lang-multi|textarea)$/.test(prop.type) ? ' is-wide' : ''));
      const label = el('label', 'fig-row-label', prop.label || prop.key);
      if (prop.help) label.title = prop.help;
      row.append(label, field.el);
      refreshers.push(field.refresh);
      (currentGroup || body).appendChild(row);
    });
    box.appendChild(body);
    return box;
  }

  // Field types defined outside this file: builder(ctx) -> { el, refresh }.
  function registerField(type, builder) {
    if (type && typeof builder === 'function') BUILDERS[type] = builder;
  }

  // ===================== Live sync ===================================
  // A style or attribute changed anywhere (the Style Manager, the code view,
  // a paste, another block) shows in every open block. A block with a field
  // being typed in or dragged keeps what it shows until that field commits.

  const EDITING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  let syncTimer = 0;

  function syncBlocks() {
    syncTimer = 0;
    const active = document.activeElement;
    const editing = active && active.matches && active.matches(EDITING) ? active : null;
    document.querySelectorAll('.fig-block').forEach((b) => {
      if (!b.__refresh) return;
      if (editing && b.contains(editing)) {
        if (!b.__syncOnLeave) {
          b.__syncOnLeave = true;
          b.addEventListener('focusout', function leave() {
            setTimeout(() => {
              if (b.contains(document.activeElement)) return;
              b.removeEventListener('focusout', leave);
              b.__syncOnLeave = false;
              b.__refresh();
            }, 0);
          });
        }
        return;
      }
      b.__refresh();
    });
  }

  function install() {
    const e = editor();
    if (!e || install.done) return;
    install.done = true;
    const later = () => { if (!syncTimer) syncTimer = setTimeout(syncBlocks, 60); };
    e.on('styleable:change', later);
    e.on('component:update:attributes', later);
  }

  FigJS.settingsUI = {
    install,
    renderBlock,
    registerField,
    committer,
    readValue,
    componentAdapter,
    pageAdapter,
    headAdapter,
    styleTargetFor,
    clipboard,
    openColorPopover,
    closeColorPopover,
    codecs,
  };
})();
