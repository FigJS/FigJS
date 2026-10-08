// Page copies of images: a smaller WebP made in the browser from the
// original, stored in images/thumbs/ (/api/thumbnail). The image shows
// the copy; the original stays as its Full size file (data-full-src),
// which the gallery viewer and zoom boxes load. Replacing the image
// drops a Full size that belonged to its copy.
//   FigJS.thumbnails.make(originalUrl, width, { pixelated }) -> { url, size }
//   settings field type 'thumbnail' (Image settings > Page copy)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const THUMBS = '/assets/images/thumbs/';
  const STEPS = [320, 480, 640, 800, 960, 1280, 1600, 1920, 2560];
  const SKIP = /\.(gif|svg|ico)(\?|#|$)/i;

  const isCopy = (src) => String(src || '').startsWith(THUMBS);

  function kb(bytes) {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  async function sizeOf(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return Number(res.headers.get('content-length')) || 0;
    } catch (e) { return 0; }
  }

  async function natural(url) {
    const blob = await (await fetch(url, { cache: 'no-store' })).blob();
    const bmp = await createImageBitmap(blob);
    const out = { blob, width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  }

  async function make(original, width, opts) {
    const src = await natural(original);
    if (src.width <= width) throw new Error(`The original is only ${src.width} px wide`);
    const height = Math.max(1, Math.round(src.height * width / src.width));
    const scaled = await createImageBitmap(src.blob, {
      resizeWidth: width, resizeHeight: height,
      resizeQuality: opts && opts.pixelated ? 'pixelated' : 'high',
    });
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(scaled, 0, 0);
    scaled.close();
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
    const res = await fetch(`/api/thumbnail?source=${encodeURIComponent(original)}&width=${width}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: webp,
    });
    const result = await res.json();
    if (!res.ok || !result.url) throw new Error(result.error || 'Upload failed');
    return { url: result.url + '?v=' + Date.now().toString(36), size: result.size };
  }

  // Twice the width the image is laid out at, on the next step up.
  function autoWidth(el, max) {
    const want = Math.ceil((el ? el.offsetWidth : 0) * 2) || 960;
    const step = STEPS.find((s) => s >= want) || STEPS[STEPS.length - 1];
    return max ? Math.min(step, max) : step;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function field(ctx) {
    const { adapter } = ctx;
    const comp = adapter.component;
    const wrap = el('div', 'fig-f-stack fig-thumb');
    const row = el('div', 'fig-f-row fig-thumb-row');
    const sel = el('select', 'fig-f-input');
    const go = el('button', 'fig-f-action', 'Make');
    go.type = 'button';
    row.append(sel, go);
    const note = el('div', 'fig-thumb-note');
    const back = el('button', 'fig-f-action', 'Show the original');
    back.type = 'button';
    wrap.append(row, note, back);

    let busy = false;
    let token = 0;
    const src = () => adapter.readAttr('src');
    const full = () => adapter.readAttr('data-full-src');
    const original = () => (isCopy(src()) && full()) || src();
    const elOf = () => comp && comp.getEl && comp.getEl();

    function options(max) {
      const auto = autoWidth(elOf(), max);
      sel.innerHTML = '';
      const a = el('option', null, `Auto (${auto} px)`);
      a.value = String(auto);
      sel.appendChild(a);
      STEPS.filter((s) => !max || s < max).forEach((s) => {
        const o = el('option', null, s + ' px');
        o.value = String(s);
        sel.appendChild(o);
      });
    }

    async function refresh() {
      const mine = ++token;
      const s = src();
      const copy = isCopy(s);
      back.hidden = !copy;
      go.textContent = copy ? 'Remake' : 'Make';
      const can = !!original() && !SKIP.test(original()) && !/^data:/.test(original());
      sel.disabled = go.disabled = busy || !can;
      if (!original()) { note.textContent = 'Choose an image first.'; options(0); return; }
      if (!can) { note.textContent = 'GIF, SVG and inline images keep their original.'; options(0); return; }
      const img = elOf();
      const max = img && img.naturalWidth && !copy ? img.naturalWidth : 0;
      options(max);
      note.textContent = copy ? 'The page shows a smaller copy.' : 'The page shows the original.';
      const [a, b] = await Promise.all([sizeOf(s.split('?')[0]), copy ? sizeOf(original()) : 0]);
      if (mine !== token) return;
      if (copy) note.textContent = `The page shows a ${kb(a)} copy; the ${kb(b)} original stays as Full size.`;
      else if (a) note.textContent = `The page shows the original (${kb(a)}${max ? ', ' + max + ' px wide' : ''}).`;
    }

    go.addEventListener('click', async () => {
      const from = original();
      const width = Number(sel.value);
      const img = elOf();
      const rendering = img ? getComputedStyle(img).imageRendering : '';
      busy = true;
      refresh();
      note.textContent = `Making a ${width} px copy`;
      try {
        const made = await make(from, width, { pixelated: /pixelated|crisp-edges/.test(rendering) });
        adapter.writeAttr('data-full-src', from, {});
        adapter.writeAttr('src', made.url, {});
        adapter.changed();
        FigJS.setStatus(`Page copy made: ${width} px, ${kb(made.size)}`, '#4caf50');
      } catch (e) {
        FigJS.setStatus('No page copy: ' + e.message, '#ff9800');
      }
      busy = false;
      refresh();
      if (ctx.rerender) ctx.rerender();
    });

    back.addEventListener('click', () => {
      const from = original();
      if (!from || !isCopy(src())) return;
      adapter.writeAttr('src', from, {});
      adapter.writeAttr('data-full-src', '', {});
      adapter.changed();
      refresh();
      if (ctx.rerender) ctx.rerender();
    });

    refresh();
    return { el: wrap, refresh };
  }

  function install() {
    if (FigJS.settingsUI && FigJS.settingsUI.registerField) FigJS.settingsUI.registerField('thumbnail', field);
    const editor = FigJS.editor;
    if (!editor) return;
    editor.on('component:update:src', (comp) => {
      const before = comp.previous && comp.previous('src');
      const now = comp.get('src');
      if (isCopy(before) && !isCopy(now) && now !== comp.getAttributes()['data-full-src']) {
        comp.removeAttributes(['data-full-src']);
      }
    });
  }

  FigJS.thumbnails = { install, make, isCopy };
})();
