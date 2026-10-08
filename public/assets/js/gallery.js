(function () {
  'use strict';

  if (window.SiteGallery) return;

  var root = document.documentElement;
  var GENERATED = /^i[a-z0-9]{2,}(-\d+)*$/;
  var FALLBACK = ['data-gallery-zoom', 'data-gallery-zoom-max', 'data-gallery-captions', 'data-gallery-loop', 'data-gallery-outside',
    'data-gallery-arrows', 'data-gallery-count', 'data-gallery-strip', 'data-gallery-zoom-buttons'];
  var ITEMS = 'img, [data-full-src]';
  var OWNERS = '.gallery-viewer, .image-zoom';
  var ZOOM_LOOK = {
    '--image-zoom-backdrop': '--sp-backdrop',
    '--image-zoom-blur': '--sp-backdrop-blur',
    '--image-zoom-bg': '--sp-bg',
    '--image-zoom-buttons': '--gallery-nav-bg',
  };
  function alone(owner) { return owner.classList.contains('image-zoom'); }
  var INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [data-link-href], [role="button"]';
  var STACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M17 21H5a2 2 0 0 1-2-2V7"/><path d="M21 13l-4-4-7.5 7.5"/></svg>';

  function editing() { return root.classList.contains('in-editor'); }
  function attr(el, name) { return el ? (el.getAttribute(name) || '').trim() : ''; }
  function off(view, name) { return attr(view, name) === 'off'; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function seal(n) {
    if (!editing()) return;
    ['selectable', 'draggable', 'droppable', 'copyable', 'removable'].forEach(function (k) {
      n.setAttribute('data-gjs-' + k, 'false');
    });
  }

  var OWN_COVER = '[data-gallery-cover="separate"]';

  var NOT_SLIDES = '.gallery-view, [data-gallery-skip], .is-clone, .gallery-badge-box, .gallery-cycle-box, ' +
    '[data-image-cycle], .video-player, ' + OWN_COVER;

  function isItem(it) {
    if (it.closest(NOT_SLIDES)) return false;
    if (it.tagName !== 'IMG' && it.querySelector('img')) return false;
    return !!(it.getAttribute('data-full-src') || it.getAttribute('src'));
  }

  function ownCoverOf(gallery) {
    var list = gallery.querySelectorAll(OWN_COVER);
    for (var i = 0; i < list.length; i++) if (!list[i].closest('.gallery-view')) return list[i];
    return null;
  }

  function itemsOf(gallery, within) {
    var scope = within || gallery;
    var list = scope.matches(ITEMS) ? [scope] : Array.prototype.slice.call(scope.querySelectorAll(ITEMS));
    return list.filter(function (it) {
      var sp = it.closest('.subpage');
      return isItem(it) && !(sp && gallery.contains(sp));
    });
  }

  function captionOf(it) {
    var c = it.getAttribute('data-caption');
    if (c) return c;
    var fig = it.closest('figure');
    var cap = fig && fig.querySelector('figcaption');
    if (cap && cap.textContent.trim()) return cap.textContent.trim();
    var slide = it.closest('.track-slide');
    if (slide && slide.getAttribute('data-caption')) return slide.getAttribute('data-caption');
    return it.getAttribute('alt') || '';
  }

  function captionShown(view, it) {
    var own = attr(it, 'data-gallery-caption') || attr(it.closest('.track-slide'), 'data-gallery-caption');
    if (own === 'on') return true;
    if (own === 'off') return false;
    return !off(view, 'data-gallery-captions');
  }

  function slideAddress(it) {
    return it.getAttribute('data-anchor-slug') || (it.id && !GENERATED.test(it.id) ? it.id : '');
  }

  function outsideOff(view) { return off(view, 'data-subpage-outside') || off(view, 'data-gallery-outside'); }

  function srcOf(it) { return it.tagName === 'IMG' ? (it.currentSrc || it.getAttribute('src') || '') : ''; }
  function fullOf(it) { return it.getAttribute('data-full-src') || srcOf(it); }

  function viewOf(gallery) {
    var view = gallery.querySelector(':scope > .gallery-view');
    if (view || editing()) return view;
    if (!gallery.__galleryView) {
      view = el('dialog', 'subpage gallery-view');
      document.body.appendChild(view);
      gallery.__galleryView = view;
    }
    carry(gallery, gallery.__galleryView);
    return gallery.__galleryView;
  }

  function carry(owner, view) {
    if (attr(owner, 'data-gallery-place') === 'full') view.setAttribute('data-subpage-place', 'full');
    else view.removeAttribute('data-subpage-place');
    FALLBACK.forEach(function (name) {
      if (owner.hasAttribute(name)) view.setAttribute(name, owner.getAttribute(name));
      else view.removeAttribute(name);
    });
    var cs = getComputedStyle(owner);
    Object.keys(ZOOM_LOOK).forEach(function (k) {
      var v = cs.getPropertyValue(k).trim();
      if (v) view.style.setProperty(ZOOM_LOOK[k], v);
      else view.style.removeProperty(ZOOM_LOOK[k]);
    });
  }


  function coverIndex(items) {
    for (var i = 0; i < items.length; i++) if (items[i].hasAttribute('data-gallery-cover')) return i;
    return 0;
  }

  function tileOf(gallery, it, items) {
    var t = it;
    while (t.parentElement && t.parentElement !== gallery) {
      var p = t.parentElement;
      var shared = items.some(function (o) { return o !== it && p.contains(o); });
      if (shared) break;
      t = p;
    }
    return t;
  }

  function single(gallery) {
    if (attr(gallery, 'data-gallery-display') !== 'single') return false;
    if (gallery.matches(ITEMS) || gallery.classList.contains('scroll-track')) return false;
    return !(editing() && gallery.classList.contains('fig-edit-open'));
  }

  function toggleClass(n, cls, on) {
    if (n.classList.contains(cls) !== on) n.classList.toggle(cls, on);
  }

  function offsetTo(node, anc) {
    var x = 0;
    var y = 0;
    for (var n = node; n; n = n.offsetParent) {
      if (n === anc) return { x: x, y: y };
      x += n.offsetLeft;
      y += n.offsetTop;
      var p = n.offsetParent;
      if (p && p !== anc) { x += p.clientLeft; y += p.clientTop; }
    }
    return null;
  }

  var placed = [];
  var sizes = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { placeAll(); }) : null;

  function track(gallery, pic) {
    if (gallery.__galleryCover === pic) return;
    if (sizes && gallery.__galleryCover) sizes.unobserve(gallery.__galleryCover);
    gallery.__galleryCover = pic;
    if (!pic) return;
    if (sizes) { sizes.observe(pic); sizes.observe(gallery); }
    if (placed.indexOf(gallery) < 0) placed.push(gallery);
  }

  function fitOver(box, pic, inner) {
    var at = offsetTo(pic, box.offsetParent) || { x: 0, y: 0 };
    var s = box.style;
    var left = (at.x + (inner ? pic.clientLeft : 0)) + 'px';
    var top = (at.y + (inner ? pic.clientTop : 0)) + 'px';
    var width = (inner ? pic.clientWidth : pic.offsetWidth) + 'px';
    var height = (inner ? pic.clientHeight : pic.offsetHeight) + 'px';
    if (s.left !== left) s.left = left;
    if (s.top !== top) s.top = top;
    if (s.width !== width) s.width = width;
    if (s.height !== height) s.height = height;
  }

  function place(gallery) {
    var pic = gallery.__galleryCover;
    if (!pic) return;
    var box = gallery.__galleryBadge;
    if (box && box.isConnected) fitOver(box, pic, false);
    var cyc = gallery.__galleryCycle;
    if (cyc && cyc.box.isConnected) fitOver(cyc.box, pic, true);
  }

  function placeAll() {
    placed = placed.filter(function (g) { return g.isConnected && g.__galleryCover; });
    placed.forEach(place);
  }

  function dropBadge(gallery) {
    var box = gallery.__galleryBadge;
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  function badge(gallery, n, own) {
    if (attr(gallery, 'data-gallery-badge') === 'off') { dropBadge(gallery); return; }
    var box = gallery.__galleryBadge;
    if (!box) {
      box = el('div', 'gallery-badge-box');
      var open = el('button', 'gallery-badge');
      open.type = 'button';
      box.appendChild(open);
      seal(box);
      seal(open);
      gallery.__galleryBadge = box;
    }
    if (box.parentNode !== gallery || box.nextSibling) gallery.appendChild(box);
    var b = box.firstChild;
    var text = (attr(gallery, 'data-gallery-badge-text') || '{n}')
      .replace(/\{n\}/g, String(n)).replace(/\{more\}/g, String(own ? n : n - 1));
    var icon = attr(gallery, 'data-gallery-badge') !== 'text';
    var sig = (icon ? 'icon|' : '|') + text;
    if (b.__sig !== sig) {
      b.__sig = sig;
      b.innerHTML = icon ? STACK_ICON : '';
      if (text) b.appendChild(el('span', 'gallery-badge-text', text));
    }
    var label = 'Open the gallery (' + n + ' images)';
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    place(gallery);
  }


  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function loadImage(url) {
    return new Promise(function (resolve) {
      var probe = new Image();
      probe.decoding = 'async';
      probe.onload = function () { if (probe.decode) probe.decode().then(resolve, resolve); else resolve(); };
      probe.onerror = function () { resolve(); };
      probe.src = url;
    });
  }

  function cycleEntries(pic, items, cover, own) {
    var src = function (n) { return (n.tagName === 'IMG' && n.src) || fullOf(n); };
    var entry = function (it) { return { src: src(it), item: it }; };
    var list = own ? [{ src: '', item: null }].concat(items.map(entry))
      : items.slice(Math.max(0, items.indexOf(cover))).concat(items.slice(0, Math.max(0, items.indexOf(cover)))).map(entry);
    return list.filter(function (e, i) { return i === 0 || !!e.src; });
  }

  function stopCycle(gallery) {
    var st = gallery.__galleryCycle;
    if (!st) return;
    clearTimeout(st.timer);
    if (st.io) st.io.disconnect();
    if (st.enter) {
      gallery.removeEventListener('mouseenter', st.enter);
      gallery.removeEventListener('mouseleave', st.leave);
    }
    if (st.box.parentNode) st.box.parentNode.removeChild(st.box);
    gallery.__galleryCycle = null;
  }

  function showEntry(st, i) {
    var seq = ++st.seq;
    if (i === 0) {
      st.layers.forEach(function (l) { l.classList.remove('is-current'); });
      st.index = 0;
      return Promise.resolve();
    }
    var url = st.entries[i].src;
    return loadImage(url).then(function () {
      if (seq !== st.seq) return;
      var next = st.layers[1 - st.front];
      next.src = url;
      next.classList.add('is-current');
      st.layers[st.front].classList.remove('is-current');
      st.front = 1 - st.front;
      st.index = i;
    });
  }

  function nextEntry(st) {
    var n = st.entries.length;
    if (!st.shuffle) return (st.index + 1) % n;
    var i = st.index;
    while (i === st.index) i = Math.floor(Math.random() * n);
    return i;
  }

  function scheduleCycle(gallery, st, ms) {
    clearTimeout(st.timer);
    st.timer = setTimeout(function () { advanceCycle(gallery, st); }, ms != null ? ms : st.interval * 1000);
  }

  function advanceCycle(gallery, st) {
    if (gallery.__galleryCycle !== st) return;
    if (!gallery.isConnected) { stopCycle(gallery); return; }
    if (st.hover && !st.hovered) return;
    var paused = root.classList.contains('motion-paused') || document.hidden;
    if (!st.visible || paused) { scheduleCycle(gallery, st); return; }
    showEntry(st, nextEntry(st)).then(function () {
      if (gallery.__galleryCycle === st && (!st.hover || st.hovered)) scheduleCycle(gallery, st);
    });
  }

  function cycle(gallery, pic, entries) {
    var mode = attr(gallery, 'data-gallery-cycle');
    var interval = Math.max(0.5, parseFloat(attr(gallery, 'data-gallery-cycle-interval')) || 4);
    var shuffle = attr(gallery, 'data-gallery-cycle-order') === 'shuffle';
    var on = !!pic && (mode === 'on' || mode === 'hover') && entries.length > 1;
    var look = on ? getComputedStyle(pic) : null;
    var fit = look ? [look.borderRadius, look.objectFit, look.objectPosition, look.imageRendering].join(' ') : '';
    var sig = on ? [mode, interval, shuffle, fit].concat(entries.map(function (e) { return e.src; })).join('|') : '';
    var st = gallery.__galleryCycle;
    if (st && st.sig === sig && st.pic === pic && st.box.isConnected) return;
    stopCycle(gallery);
    if (!on) return;

    st = { sig: sig, pic: pic, entries: entries, interval: interval, shuffle: shuffle, hover: mode === 'hover',
      index: 0, front: 0, seq: 0, timer: 0, visible: true, hovered: false };
    st.box = el('div', 'gallery-cycle-box');
    seal(st.box);
    st.box.style.borderRadius = look.borderRadius;
    st.layers = [0, 1].map(function () {
      var img = el('img', 'gallery-cycle-layer');
      img.alt = '';
      img.decoding = 'async';
      img.setAttribute('aria-hidden', 'true');
      img.style.objectFit = pic.tagName === 'IMG' ? look.objectFit : 'cover';
      img.style.objectPosition = look.objectPosition;
      img.style.imageRendering = look.imageRendering;
      seal(img);
      st.box.appendChild(img);
      return img;
    });
    var badgeBox = gallery.__galleryBadge;
    gallery.insertBefore(st.box, badgeBox && badgeBox.parentNode === gallery ? badgeBox : null);
    gallery.__galleryCycle = st;
    place(gallery);

    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(function (es) { st.visible = es[es.length - 1].isIntersecting; }, { rootMargin: '200px' });
      st.io.observe(gallery);
    }
    if (st.hover) {
      st.enter = function () { st.hovered = true; scheduleCycle(gallery, st, 500); };
      st.leave = function () { st.hovered = false; clearTimeout(st.timer); showEntry(st, 0); };
      gallery.addEventListener('mouseenter', st.enter);
      gallery.addEventListener('mouseleave', st.leave);
    } else if (!reducedMotion()) {
      scheduleCycle(gallery, st);
    }
  }

  function cycleShown(gallery) {
    var st = gallery.__galleryCycle;
    var e = st && st.entries[st.index];
    return e && e.item ? e.item : null;
  }

  function arrange(gallery) {
    var on = single(gallery);
    var items = on ? itemsOf(gallery) : [];
    var own = on ? ownCoverOf(gallery) : null;
    var cover = own || (items.length ? items[coverIndex(items)] : null);
    var all = own ? items.concat([own]) : items;
    var coverTile = cover ? tileOf(gallery, cover, all) : null;
    var rest = [];
    items.forEach(function (it) { if (it !== cover) rest.push(tileOf(gallery, it, all)); });
    gallery.querySelectorAll('.gallery-cover, .gallery-cover-image, .gallery-tile-rest').forEach(function (n) {
      if (n !== coverTile) toggleClass(n, 'gallery-cover', false);
      if (n !== cover) toggleClass(n, 'gallery-cover-image', false);
      if (rest.indexOf(n) < 0) toggleClass(n, 'gallery-tile-rest', false);
    });
    if (coverTile) toggleClass(coverTile, 'gallery-cover', true);
    if (cover) toggleClass(cover, 'gallery-cover-image', true);
    rest.forEach(function (t) { toggleClass(t, 'gallery-tile-rest', true); });
    var pic = own && own.tagName !== 'IMG' ? own.querySelector('img') || own : cover;
    track(gallery, pic);
    if (cover && items.length > (own ? 0 : 1)) badge(gallery, items.length, !!own);
    else dropBadge(gallery);
    cycle(gallery, pic, cover ? cycleEntries(pic, items, cover, own) : []);
  }

  function arrangeAll() {
    document.querySelectorAll('.gallery-viewer').forEach(function (g) {
      if (g.hasAttribute('data-gallery-display') || g.__galleryBadge || g.__galleryCycle || g.querySelector('.gallery-cover, .gallery-cover-image, .gallery-tile-rest')) arrange(g);
    });
  }


  function button(cls, label, text) {
    var b = el('button', 'gallery-view-ui ' + cls, text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    return b;
  }

  function build(view) {
    var ui = view.__galleryUi;
    if (ui && ui.stage.parentNode === view) return ui;
    view.querySelectorAll(':scope > .gallery-view-ui').forEach(function (n) { n.remove(); });
    ui = {};
    ui.stage = el('div', 'gallery-view-ui zoom-box gallery-view-stage');
    ui.stage.setAttribute('data-zoom-controls', 'on');
    ui.img = el('img', 'gallery-view-img');
    ui.img.alt = '';
    ui.img.decoding = 'async';
    ui.stage.appendChild(ui.img);
    ui.prev = button('gallery-view-nav gallery-view-prev', 'Previous image', '‹');
    ui.next = button('gallery-view-nav gallery-view-next', 'Next image', '›');
    ui.top = el('div', 'gallery-view-ui gallery-view-top');
    ui.count = el('span', 'gallery-view-count');
    var close = el('button', 'subpage-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    ui.top.append(ui.count, close);
    ui.caption = el('p', 'gallery-view-ui gallery-view-caption');
    ui.strip = el('div', 'gallery-view-ui gallery-view-strip');
    view.append(ui.stage, ui.prev, ui.next, ui.top, ui.caption, ui.strip);
    if (!view.hasAttribute('aria-label') && !editing()) view.setAttribute('aria-label', 'Image viewer');
    view.__galleryUi = ui;
    if (window.ZoomBox && window.ZoomBox.controls) window.ZoomBox.controls(ui.stage);
    if (!editing()) wire(view, ui);
    return ui;
  }

  function zoomedIn(ui) { return !!(window.ZoomBox && window.ZoomBox.level(ui.stage) > 1.001); }
  function looping(view) { return !off(view, 'data-gallery-loop'); }

  function onPicture(ui, x, y) {
    var r = ui.img.getBoundingClientRect();
    var w = ui.img.naturalWidth;
    var h = ui.img.naturalHeight;
    if (!w || !h || !r.width || !r.height) return true;
    var k = Math.min(r.width / w, r.height / h);
    var left = r.left + (r.width - w * k) / 2;
    var top = r.top + (r.height - h * k) / 2;
    return x >= left && x <= left + w * k && y >= top && y <= top + h * k;
  }

  function follow(view) {
    var st = view.__gallery;
    var it = st && st.items[st.index];
    var gallery = st && st.gallery;
    if (!it || !gallery || !gallery.classList.contains('scroll-track')) return;
    if (attr(gallery, 'data-track-mode') !== 'carousel') return;
    var vp = gallery.querySelector(':scope > .track-viewport');
    var slide = it.closest('.track-slide');
    if (vp && slide && vp.contains(slide)) vp.scrollLeft = slide.offsetLeft;
  }

  function wire(view, ui) {
    var swipe = null;
    ui.prev.addEventListener('click', function () { go(view, -1); });
    ui.next.addEventListener('click', function () { go(view, 1); });
    ui.strip.addEventListener('click', function (e) {
      var b = e.target.closest('.gallery-view-thumb');
      if (b) show(view, Number(b.getAttribute('data-index')));
    });
    view.addEventListener('keydown', function (e) {
      if (zoomedIn(ui) || e.target.closest('.zoom-box-ui')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(view, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(view, 1); }
    });
    ui.stage.addEventListener('pointerdown', function (e) {
      swipe = zoomedIn(ui) || (e.pointerType === 'mouse' && e.button !== 0) ? null : { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    ui.stage.addEventListener('pointerup', function (e) {
      if (!swipe || swipe.id !== e.pointerId) return;
      var dx = e.clientX - swipe.x;
      var dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(view, dx < 0 ? 1 : -1);
    });
    ui.stage.addEventListener('click', function (e) {
      if (zoomedIn(ui) || e.target.closest('.zoom-box-ui') || outsideOff(view)) return;
      if (!onPicture(ui, e.clientX, e.clientY) && window.SiteSubpage) window.SiteSubpage.close(view);
    });
    view.addEventListener('subpage:close', function () {
      follow(view);
      if (window.ZoomBox) window.ZoomBox.reset(ui.stage, true);
      ui.img.removeAttribute('src');
    });
  }

  function configure(view, ui) {
    var zoom = !off(view, 'data-gallery-zoom');
    ui.stage.setAttribute('data-zoom-wheel', zoom ? '' : 'off');
    ui.stage.setAttribute('data-zoom-double', zoom ? '' : 'off');
    ui.stage.setAttribute('data-zoom-max', attr(view, 'data-gallery-zoom-max') || '6');
    ui.stage.classList.toggle('is-static', !zoom);
  }

  function strip(view, ui, st) {
    var on = attr(view, 'data-gallery-strip') === 'on' && st.items.length > 1;
    ui.strip.hidden = !on;
    if (!on) return;
    var sig = st.items.map(fullOf).join('\n');
    if (ui.strip.__sig !== sig) {
      ui.strip.__sig = sig;
      ui.strip.textContent = '';
      st.items.forEach(function (it, i) {
        var b = el('button', 'gallery-view-thumb');
        b.type = 'button';
        b.setAttribute('aria-label', 'Image ' + (i + 1));
        b.setAttribute('data-index', String(i));
        var t = el('img');
        t.alt = '';
        t.loading = 'lazy';
        t.src = srcOf(it) || fullOf(it);
        b.appendChild(t);
        ui.strip.appendChild(b);
      });
    }
    Array.prototype.forEach.call(ui.strip.children, function (b, i) {
      var current = i === st.index;
      if (b.classList.contains('is-current') !== current) b.classList.toggle('is-current', current);
      if (current && !editing()) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  function setSrc(img, src) {
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  function preload(it) {
    if (!it || it.__galleryPreloaded) return;
    it.__galleryPreloaded = true;
    var src = it.getAttribute('data-full-src');
    if (src) { var pre = new Image(); pre.src = src; }
  }

  function show(view, i) {
    var st = view.__gallery;
    var ui = build(view);
    configure(view, ui);
    var n = st ? st.items.length : 0;
    if (!n) {
      ui.img.removeAttribute('src');
      ui.count.textContent = ui.caption.textContent = '';
      ui.prev.hidden = ui.next.hidden = ui.caption.hidden = ui.strip.hidden = true;
      return;
    }
    st.index = ((i % n) + n) % n;
    var it = st.items[st.index];
    if (window.ZoomBox && !editing()) window.ZoomBox.reset(ui.stage, true);
    var full = fullOf(it);
    var shown = srcOf(it) || full;
    ui.img.__zbFull = false;
    setSrc(ui.img, shown);
    if (full && full !== shown) {
      var pre = new Image();
      pre.onload = function () { if (st.items[st.index] === it) setSrc(ui.img, full); };
      pre.src = full;
    }
    ui.img.alt = it.getAttribute('alt') || '';
    ui.img.style.imageRendering = it.tagName === 'IMG' ? getComputedStyle(it).imageRendering : '';
    var caption = captionShown(view, it) ? captionOf(it) : '';
    if (ui.caption.textContent !== caption) ui.caption.textContent = caption;
    ui.caption.hidden = !caption;
    var count = n > 1 && !off(view, 'data-gallery-count') ? (st.index + 1) + ' / ' + n : '';
    if (ui.count.textContent !== count) ui.count.textContent = count;
    var loop = looping(view);
    var arrows = n > 1 && !off(view, 'data-gallery-arrows');
    ui.prev.hidden = !arrows || (!loop && st.index === 0);
    ui.next.hidden = !arrows || (!loop && st.index === n - 1);
    strip(view, ui, st);
    if (!editing()) {
      if (window.SiteSubpage && window.SiteSubpage.readdress) window.SiteSubpage.readdress(view, slideAddress(it));
      preload(st.items[(st.index + 1) % n]);
      preload(st.items[(st.index + n - 1) % n]);
    }
  }

  function go(view, step) {
    var st = view.__gallery;
    var n = st ? st.items.length : 0;
    if (n < 2) return;
    var next = st.index + step;
    if (!looping(view) && (next < 0 || next >= n)) return;
    show(view, next);
  }

  function galleryOf(view) {
    var p = view.parentElement;
    if (p && p.classList.contains('gallery-viewer')) return p;
    var found = null;
    document.querySelectorAll(OWNERS).forEach(function (g) { if (g.__galleryView === view) found = g; });
    return found;
  }

  function prepare(target, opts) {
    if (!target || !target.closest) return null;
    var view = target.classList.contains('gallery-view') ? target : null;
    var gallery = view ? galleryOf(view) : target.closest(OWNERS);
    if (!gallery || (!view && target.closest('.gallery-view'))) return null;
    var items = itemsOf(gallery);
    if (alone(gallery)) items = view ? items.slice(0, 1) : items.filter(function (it) { return it === target; });
    var start = view || alone(gallery) ? 0 : items.indexOf(target);
    if (start < 0 || !items.length) return null;
    if (opts && opts.clicked && attr(gallery, 'data-gallery-open') === 'first') start = 0;
    if (!view) view = viewOf(gallery);
    if (!view) return null;
    view.__gallery = { gallery: gallery, items: items, index: start };
    show(view, start);
    return view;
  }

  function open(gallery, from) {
    if (editing() || !window.SiteSubpage) return false;
    var view = prepare(from, { clicked: true });
    if (!view || galleryOf(view) !== gallery) return false;
    window.SiteSubpage.open(view, { from: from });
    return true;
  }

  function original(gallery, node) {
    var clone = node.closest('.track-slide.is-clone');
    if (!clone || !gallery.contains(clone)) return node;
    var all = Array.prototype.filter.call(clone.parentElement.children, function (s) { return s.classList.contains('track-slide'); });
    var originals = all.filter(function (s) { return !s.classList.contains('is-clone'); });
    if (!originals.length) return null;
    var source = originals[all.indexOf(clone) % originals.length];
    if (node === clone) return source;
    var at = Array.prototype.indexOf.call(clone.querySelectorAll(ITEMS), node);
    return at >= 0 ? source.querySelectorAll(ITEMS)[at] || null : null;
  }

  function hitOf(gallery, target) {
    var own = target.closest(OWN_COVER);
    var onCover = target.closest('.gallery-badge') || (own && gallery.contains(own))
      || (target.closest('.gallery-cover-image') && gallery.contains(target.closest('.gallery-cover-image')));
    if (onCover) {
      var all = itemsOf(gallery);
      var shown = cycleShown(gallery);
      if (shown && all.indexOf(shown) >= 0) return shown;
      return (ownCoverOf(gallery) ? all[0] : all[coverIndex(all)]) || null;
    }
    var hit = target.closest(ITEMS);
    if (hit && gallery.contains(hit)) return original(gallery, hit);
    var slide = target.closest('.track-slide');
    if (!slide || !gallery.contains(slide)) return null;
    var control = target.closest(INTERACTIVE);
    if (control && slide.contains(control)) return null;
    slide = original(gallery, slide);
    return (slide && itemsOf(gallery, slide)[0]) || null;
  }

  document.addEventListener('subpage:open', function (e) {
    var view = e.target;
    if (!view.classList || !view.classList.contains('gallery-view')) return;
    if (!view.__gallery || !view.__gallery.items.length) prepare(view);
  });

  function zoomHitOf(owner, target) {
    var hit = target.closest(ITEMS);
    if (!hit || !owner.contains(hit)) return null;
    var control = target.closest(INTERACTIVE);
    if (control && owner.contains(control)) return null;
    hit = original(owner, hit);
    return hit && isItem(hit) ? hit : null;
  }

  document.addEventListener('click', function (e) {
    if (editing() || e.defaultPrevented || e.button !== 0 || !e.target.closest) return;
    var gallery = e.target.closest(OWNERS);
    var sp = e.target.closest('.subpage');
    if (!gallery || (sp && gallery.contains(sp))) return;
    var hit = alone(gallery) ? zoomHitOf(gallery, e.target) : hitOf(gallery, e.target);
    if (!hit || !gallery.contains(hit)) return;
    if (open(gallery, hit)) e.preventDefault();
  });


  var queued = 0;
  function previewAll() {
    document.querySelectorAll('.gallery-viewer > .gallery-view').forEach(function (view) {
      if (!view.classList.contains('is-open') && !view.classList.contains('fig-edit-open')) return;
      var gallery = view.parentElement;
      var items = itemsOf(gallery);
      var picked = -1;
      items.forEach(function (it, i) { if (it.classList.contains('gjs-selected')) picked = i; });
      var last = view.__gallery ? view.__gallery.index : 0;
      view.__gallery = { gallery: gallery, items: items, index: picked >= 0 ? picked : Math.min(last, Math.max(0, items.length - 1)) };
      show(view, view.__gallery.index);
    });
  }

  function refreshCanvas() {
    queued = 0;
    arrangeAll();
    previewAll();
  }

  function watchCanvas() {
    if (!editing() || typeof MutationObserver === 'undefined' || !document.body) return;
    var added = function (n) { return n.nodeType === 1 && (n.matches('.gallery-viewer') || !!n.querySelector('.gallery-viewer')); };
    new MutationObserver(function (muts) {
      var relevant = muts.some(function (m) {
        var t = m.target;
        if (t.nodeType !== 1 || t.closest('.gallery-view-ui, .gallery-badge-box, .gallery-cycle-box')) return false;
        return !!t.closest('.gallery-viewer') || Array.prototype.some.call(m.addedNodes || [], added);
      });
      if (relevant && !queued) queued = setTimeout(refreshCanvas, 30);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'src', 'alt', 'data-caption', 'data-gallery-caption', 'data-full-src', 'data-subpage-place',
        'data-gallery-arrows', 'data-gallery-count', 'data-gallery-captions', 'data-gallery-strip',
        'data-gallery-zoom', 'data-gallery-zoom-buttons', 'data-gallery-loop',
        'data-gallery-display', 'data-gallery-cover', 'data-gallery-badge', 'data-gallery-badge-text',
        'data-gallery-cycle', 'data-gallery-cycle-interval', 'data-gallery-cycle-order',
        'data-gallery-skip', 'hidden'],
    });
    refreshCanvas();
  }

  function boot() {
    if (editing()) watchCanvas();
    else arrangeAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', placeAll);
  window.addEventListener('resize', placeAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeAll);

  function showSlide(view, i) {
    var gallery = galleryOf(view);
    if (!gallery) return;
    view.__gallery = { gallery: gallery, items: itemsOf(gallery), index: i };
    show(view, i);
  }

  var zoomPreview = null;
  function closeZoomPreview() {
    if (!zoomPreview) return;
    try { zoomPreview.hidePopover(); } catch (e) {}
    zoomPreview.remove();
    zoomPreview = null;
  }
  function previewZoom(owner, refresh) {
    if (!editing() || !owner) return false;
    var same = !!zoomPreview && zoomPreview.__owner === owner;
    if (refresh ? !same : same) { if (same) closeZoomPreview(); return false; }
    var item = itemsOf(owner)[0];
    closeZoomPreview();
    if (!item) return false;
    var view = el('dialog', 'subpage gallery-view');
    seal(view);
    view.__owner = owner;
    carry(owner, view);
    document.body.appendChild(view);
    view.__gallery = { gallery: owner, items: [item], index: 0 };
    show(view, 0);
    view.style.display = 'flex';
    view.addEventListener('click', closeZoomPreview);
    try {
      view.setAttribute('popover', 'manual');
      view.showPopover();
    } catch (e) {}
    zoomPreview = view;
    return true;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeZoomPreview(); });

  window.SiteGallery = {
    open: open, prepare: prepare, showSlide: showSlide, preview: previewAll, arrange: arrangeAll,
    previewZoom: previewZoom, closeZoomPreview: closeZoomPreview,
  };
})();
