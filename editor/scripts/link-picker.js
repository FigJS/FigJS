// Pick on page (Settings > Link): the next element selected on the
// canvas or in Layers becomes the link target. A target without an
// address gets one (an id from its text, or an anchor slug when its id
// is a generated one that styles use). Opener mode turns it around: the
// next element selected links to the given target. Esc cancels.
// An element hard to click can be given by its Element ID instead: Link
// to takes it (universal-traits.preset.js), and so do a subpage's Openers.
//   FigJS.linkPicker.start(component) / pickOpener(target) / cancel()
//   FigJS.linkPicker.byId(id) -> component / link(source, target) -> href
// FigJS.links (below): what a link opens, and what opens an overlay.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Generated ids ("i3k9x", "ijvo3-2") are kept for styles, not used as addresses.
  const GENERATED_ID = /^i[a-z0-9]{2,}(-\d+)*$/;

  let state = null;

  function canvasDoc() {
    try { return FigJS.editor.Canvas.getDocument(); } catch (e) { return null; }
  }

  function slugify(text) {
    return String(text || '').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
  }

  function taken(name) {
    const doc = canvasDoc();
    if (!doc) return false;
    if (doc.getElementById(name)) return true;
    try { return !!doc.querySelector('[data-anchor-slug="' + CSS.escape(name) + '"]'); } catch (e) { return false; }
  }

  function uniqueSlug(base) {
    let s = base;
    let n = 1;
    while (taken(s)) s = base + '-' + (++n);
    return s;
  }

  function addressOf(target) {
    const attrs = target.getAttributes();
    if (attrs['data-anchor-slug']) return attrs['data-anchor-slug'];
    if (attrs.id && !GENERATED_ID.test(attrs.id)) return attrs.id;
    const el = target.getEl();
    const label = attrs['data-contents-label'] || (el && el.textContent) || target.get('tagName');
    const slug = uniqueSlug(slugify(label));
    if (attrs.id) target.addAttributes({ 'data-anchor-slug': slug });
    else target.addAttributes({ id: slug });
    return slug;
  }

  function setPicking(on) {
    const doc = canvasDoc();
    if (doc) doc.documentElement.classList.toggle('fig-picking', on);
    document.body.classList.toggle('fig-picking', on);
  }

  function onKey(e) {
    if (e.key === 'Escape' && state) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  function stop() {
    if (!state) return;
    FigJS.editor.off('component:selected', onSelected);
    document.removeEventListener('keydown', onKey, true);
    const doc = canvasDoc();
    if (doc) doc.removeEventListener('keydown', onKey, true);
    setPicking(false);
    state = null;
  }

  function link(source, target) {
    const href = '#' + addressOf(target);
    if (String(source.get('tagName')).toLowerCase() === 'a') source.addAttributes({ href });
    else source.addAttributes({ 'data-link-href': href });
    return href;
  }

  function within(comp, root) {
    for (let c = comp; c; c = c.parent && c.parent()) if (c === root) return true;
    return false;
  }

  function onSelected(picked) {
    if (!state || !picked) return;
    const { source, target } = state;
    if (picked === FigJS.editor.getWrapper()) return;
    if (target) {
      if (within(picked, target)) return;
      stop();
      const href = link(picked, target);
      FigJS.editor.select(target);
      FigJS.setStatus('The selected element now opens ' + href, '#4caf50');
      return;
    }
    if (picked === source) return;
    stop();
    const href = link(source, picked);
    FigJS.editor.select(source);
    FigJS.setStatus('Linked to ' + href, '#4caf50');
  }

  function pickOpener(target) {
    if (!target) return;
    begin({ target }, 'Click the element that should open this. Esc cancels.');
  }

  function start(source) {
    if (!source) return;
    begin({ source }, 'Click the element to link to. Esc cancels.');
  }

  function begin(next, message) {
    if (state) stop();
    state = next;
    FigJS.editor.on('component:selected', onSelected);
    document.addEventListener('keydown', onKey, true);
    const doc = canvasDoc();
    if (doc) doc.addEventListener('keydown', onKey, true);
    setPicking(true);
    FigJS.setStatus(message);
  }

  function cancel() {
    if (!state) return;
    stop();
    FigJS.clearStatus();
  }

  // The element with an Element ID (or anchor slug), with or without #.
  function byId(raw) {
    const name = String(raw || '').trim().replace(/^#/, '');
    const doc = canvasDoc();
    if (!name || !doc) return null;
    let node = doc.getElementById(name);
    if (!node) {
      try { node = doc.querySelector('[data-anchor-slug="' + CSS.escape(name) + '"]'); } catch (e) { node = null; }
    }
    const model = node && node.__gjsv && node.__gjsv.model;
    return model && model !== FigJS.editor.getWrapper() ? model : null;
  }

  FigJS.linkPicker = { start, pickOpener, cancel, byId, link, within };

  // ---- What links do -------------------------------------------------
  // As the site resolves them (navigation.js, subpage.js, gallery.js): a
  // link (a, area, or data-link-href on any element, which wins) to
  // #address, or to this page's file#address, goes to the element with
  // that id or anchor slug. One to a subpage, or to anything inside it,
  // opens that subpage; one to a gallery image opens its gallery's viewer
  // at it. Used by the subpage Openers list, the canvas's opener tags and
  // the Link settings' note.
  //   FigJS.links.target(node) / openersOf(overlayNode) / unlink(component)
  const LINKS = 'a[href], area[href], [data-link-href]';
  const NOT_SLIDE = '.gallery-view, [data-gallery-skip], .is-clone, [data-image-cycle], .video-player, [data-gallery-cover="separate"]';

  function samePage(path) {
    if (!path) return true;
    const file = (FigJS.files && FigJS.files.lastFile && FigJS.files.lastFile()) || '';
    const here = String(file).replace(/^public\//, '').replace(/^\/+/, '');
    return !!here && path.replace(/^\.?\/+/, '') === here;
  }

  // The #address a link goes to on this page, or null (another page, a site).
  function hashOf(node) {
    let raw = node.getAttribute('data-link-href');
    if (raw == null) raw = node.getAttribute('href');
    raw = String(raw || '').trim();
    const at = raw.indexOf('#');
    if (at < 0 || at === raw.length - 1 || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    if (!samePage(raw.slice(0, at).split('?')[0])) return null;
    try { return decodeURIComponent(raw.slice(at + 1)); } catch (e) { return raw.slice(at + 1); }
  }

  function resolveIn(doc, id) {
    const byId = doc.getElementById(id);
    if (byId) return byId;
    try { return doc.querySelector('[data-anchor-slug="' + CSS.escape(id) + '"]'); } catch (e) { return null; }
  }

  function isSlide(node) {
    if (!node.matches('img, [data-full-src]') || node.closest(NOT_SLIDE)) return false;
    return node.tagName === 'IMG' || !node.querySelector('img');
  }

  // { id, target, overlay, via } for a link on this page, else null.
  // via: '' the overlay itself, 'inside' something in it, 'slide' a slide
  // of the gallery whose viewer it is.
  function target(node) {
    if (!node || !node.matches || !node.matches(LINKS)) return null;
    const id = hashOf(node);
    if (id == null) return null;
    const found = resolveIn(node.ownerDocument, id);
    if (!found) return { id, target: null, overlay: null, via: null };
    const host = found.closest('.subpage');
    if (host) return { id, target: found, overlay: host, via: host === found ? '' : 'inside' };
    const gallery = isSlide(found) && found.closest('.gallery-viewer');
    const view = gallery && gallery.querySelector(':scope > .gallery-view');
    if (view) return { id, target: found, overlay: view, via: 'slide' };
    return { id, target: found, overlay: null, via: null };
  }

  // The elements on the page that open an overlay (a subpage or gallery
  // viewer), with how. Links inside it are its own navigation, and runtime
  // copies (a marquee's clones) are not elements of the page.
  function openersOf(overlay) {
    const out = [];
    if (!overlay || !overlay.ownerDocument) return out;
    overlay.ownerDocument.querySelectorAll(LINKS).forEach((node) => {
      if (overlay.contains(node)) return;
      const model = node.__gjsv && node.__gjsv.model;
      if (!model) return;
      const t = target(node);
      if (!t || !t.target) return;
      let via = null;
      if (t.target === overlay) via = '';
      else if (overlay.contains(t.target)) via = 'inside';
      else if (t.via === 'slide' && t.overlay === overlay) via = 'slide';
      else return;
      out.push({ node, model, id: t.id, via });
    });
    return out;
  }

  // Stops an element linking (the link Settings > Link reads first).
  function unlink(component) {
    const attrs = component.getAttributes() || {};
    component.removeAttributes(['data-link-href' in attrs ? 'data-link-href' : 'href']);
  }

  FigJS.links = { SELECTOR: LINKS, target, openersOf, unlink };
})();
