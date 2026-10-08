// Media tab: images, audio, video and fonts.
//   upload   raw body to /api/upload; the server dedups by content hash
//   list     /api/media?kind=..., /api/fonts (fonts grouped by family)
//   delete   after a usage check across pages and stylesheets; a used
//            file is replaced, or deleted with its uses cleared
//   replace  every reference moves to another file of its kind: on disk
//            (/api/media/relink) and in the page open here
//   unused   per kind: lists files nothing references, deletes the ticked ones
//   apply    clicking an item puts it on the selected element
//   pick()   the same grid as a dialog, used by every Browse button
//   FigJS.media.install() / refresh() / upload(file) / pick({ kind })

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const KINDS = [
    { id: 'image', label: 'Images', accept: 'image/*,.svg,.ico,.avif' },
    { id: 'audio', label: 'Audio',  accept: 'audio/*,.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac,.weba' },
    { id: 'video', label: 'Video',  accept: 'video/*,.mp4,.webm,.ogv,.mov,.m4v' },
    { id: 'font',  label: 'Fonts',  accept: '.woff2,.woff,.ttf,.otf' },
  ];

  const SYSTEM_FONTS = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', '-apple-system',
    'blinkmacsystemfont', 'arial', 'helvetica', 'times', 'times new roman',
    'courier', 'courier new', 'georgia', 'verdana', 'tahoma', 'trebuchet ms',
    'impact', 'comic sans ms', 'segoe ui', 'roboto', 'charcoal',
    'inherit', 'initial', 'unset', 'revert', 'revert-layer',
  ]);

  const state = { kind: 'image', pageOnly: true, search: '' };
  const SWAP_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>';
  let panel = null;

  // ===================== Upload ========================================

  async function upload(file) {
    const res = await fetch('/api/upload?filename=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const result = await res.json();
    if (!res.ok || !result.url) throw new Error(result.error || 'Upload failed');
    return result;
  }

  async function uploadMany(files) {
    const list = Array.from(files || []);
    if (!list.length) return [];
    FigJS.setStatus(`Uploading ${list.length} file${list.length === 1 ? '' : 's'}`);
    const results = [];
    let failed = 0;
    for (const f of list) {
      try { results.push(await upload(f)); }
      catch (e) { failed++; console.error('[media] upload failed', f.name, e); }
    }
    const deduped = results.filter((r) => r.deduped).length;
    if (results.some((r) => r.kind === 'font')) {
      FigJS.canvas.ensureDeps();
      FigJS.canvas.refreshStylesheet('public/assets/fonts/fonts.css');
    }
    FigJS.setStatus(
      failed ? `Uploaded ${results.length} of ${list.length} (see console)`
        : `Uploaded ${results.length}` + (deduped ? ` (${deduped} already in the library, reused)` : ''),
      failed ? '#ff9800' : '#4caf50');
    return results;
  }

  // ===================== Data ==========================================

  async function fetchItems(kind) {
    if (kind === 'font') {
      const data = await (await fetch('/api/fonts', { cache: 'no-store' })).json();
      return data.fonts || [];
    }
    const data = await (await fetch('/api/media?kind=' + kind, { cache: 'no-store' })).json();
    return data.items || [];
  }

  // What the page references: markup, page CSS, body style.
  function pageText() {
    const editor = FigJS.editor;
    if (!editor) return '';
    const parts = [];
    try { parts.push(editor.getHtml()); } catch (e) {}
    try { parts.push(editor.getCss()); } catch (e) {}
    if (FigJS.pageBody) parts.push(JSON.stringify(FigJS.pageBody.getStyle()));
    return parts.join('\n');
  }

  function getPageFontFamilies() {
    const families = new Set();
    const re = /font-family\s*:\s*([^;{}"]+(?:"[^"]*"[^;{}"]*)*)/gi;
    let m;
    const text = pageText().replace(/&quot;/g, '"');
    while ((m = re.exec(text))) {
      m[1].split(',').forEach((piece) => {
        const name = piece.trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase();
        if (name && !SYSTEM_FONTS.has(name)) families.add(name);
      });
    }
    return families;
  }

  // ===================== Style Manager font list =======================

  let builtinFontOptions = null;
  function syncFontFamilies(fonts) {
    const editor = FigJS.editor;
    const prop = editor && editor.StyleManager && editor.StyleManager.getProperty('typography', 'font-family');
    if (!prop) return;
    if (!builtinFontOptions) {
      const opts = prop.get('options') || [];
      builtinFontOptions = (Array.isArray(opts) ? opts : opts.models || []).map((o) => ({
        id: o.get ? o.get('id') : o.id,
        label: o.get ? (o.get('label') || o.get('name')) : (o.label || o.name),
      })).filter((o) => o.id != null);
    }
    const seen = new Set(builtinFontOptions.map((o) => String(o.label || o.id).toLowerCase()));
    const next = builtinFontOptions.slice();
    (fonts || []).forEach((f) => {
      const key = String(f.family).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      next.push({ id: `"${f.family}", sans-serif`, label: f.family });
    });
    try { prop.set('options', next); } catch (e) {}
  }

  // ===================== Actions =======================================

  function applyToSelection(item) {
    const editor = FigJS.editor;
    const sel = editor && editor.getSelected();
    if (!sel) return false;
    if (item.kind === 'image' && (sel.get('type') === 'image' || sel.get('tagName') === 'img')) {
      sel.set('src', item.url);
      if (/\.gif(\?|$)/i.test(item.url) && !sel.getClasses().some((c) => c.startsWith('img-render-'))) {
        sel.addClass('img-render-pixelated');
      }
      return true;
    }
    const attrs = sel.getAttributes();
    if ((item.kind === 'audio' || item.kind === 'video') && 'data-src' in attrs) {
      sel.addAttributes({ 'data-src': item.url });
      return true;
    }
    if (item.kind === 'image' && 'data-poster' in attrs) {
      sel.addAttributes({ 'data-poster': item.url });
      return true;
    }
    return false;
  }

  // ===================== Replace and clear ==============================
  // A file's references move to another file (Replace) or are emptied
  // (Delete and clear its uses): on disk by the server, and here in the open
  // page, whose next save would bring the old ones back. An image's page
  // copies (images/thumbs/<stem>-<ext>-<n>w.webp) show the old picture, so
  // their references go too.

  const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function referencePatterns(item) {
    const list = [new RegExp(esc(item.url) + '(?![\\w.-])', 'g')];
    if (item.kind === 'image') {
      const dot = item.name.lastIndexOf('.');
      const stem = dot > 0 ? item.name.slice(0, dot) : item.name;
      const ext = dot > 0 ? item.name.slice(dot + 1).toLowerCase() : '';
      const dir = item.url.slice(0, item.url.length - item.name.length);
      list.push(new RegExp(esc(dir + 'thumbs/' + stem + '-' + ext + '-') + '\\d+w\\.webp(?![\\w.-])', 'g'));
    }
    return list;
  }
  const mentions = (value, patterns) => patterns.some((re) => { re.lastIndex = 0; return re.test(value); });

  function usesHere(item) {
    const patterns = referencePatterns(item);
    const text = pageText();
    return patterns.reduce((n, re) => n + (text.match(re) || []).length, 0);
  }

  // The open page: attributes, an image's source, style rules, the page's style.
  function relinkOpenPage(item, to) {
    const editor = FigJS.editor;
    if (!editor) return 0;
    const patterns = referencePatterns(item);
    let count = 0;
    const fix = (v) => {
      if (typeof v !== 'string' || !mentions(v, patterns)) return v;
      count++;
      return patterns.reduce((out, re) => out.replace(re, () => to), v);
    };
    const fixStyle = (style) => {
      const next = {};
      let touched = false;
      Object.keys(style || {}).forEach((k) => {
        next[k] = fix(style[k]);
        if (next[k] !== style[k]) touched = true;
      });
      return touched ? next : null;
    };
    FigJS.undo.untracked(() => {
      const wrapper = editor.getWrapper();
      [wrapper].concat(wrapper.find('*')).forEach((c) => {
        const attrs = c.getAttributes() || {};
        const next = {};
        Object.keys(attrs).forEach((k) => {
          if (k === 'class' || k === 'id') return;
          const v = fix(attrs[k]);
          if (v !== attrs[k]) next[k] = v;
        });
        if (c.get('type') === 'image' && 'src' in next) {
          c.set('src', next.src);
          delete next.src;
        }
        if (Object.keys(next).length) c.addAttributes(next);
        const style = c.getStyle && fixStyle(c.getStyle());
        if (style) c.setStyle(style);
      });
      editor.Css.getAll().forEach((rule) => {
        const style = fixStyle(rule.getStyle());
        if (style) rule.setStyle(style);
      });
      if (FigJS.pageBody) {
        const style = fixStyle(FigJS.pageBody.getStyle());
        if (style) FigJS.pageBody.setStyle(style);
      }
    });
    if (count) FigJS.markUnsaved();
    return count;
  }

  async function usagesOf(item) {
    try {
      const url = `/api/media/${item.kind}/${encodeURIComponent(item.name)}/usage`;
      return (await (await fetch(url, { cache: 'no-store' })).json()).usages || [];
    } catch (e) { return []; }
  }

  function usageText(usages, here) {
    const lines = usages.slice(0, 8).map((u) => `  ${u.path}${u.count > 1 ? ` (${u.count} uses)` : ''}`);
    if (usages.length > 8) lines.push(`  and ${usages.length - 8} more`);
    if (here) lines.push(`  the page open now (${here} use${here === 1 ? '' : 's'}, saved or not)`);
    return lines.join('\n');
  }

  async function removeFile(item) {
    const res = await fetch(`/api/media/${item.kind}/${encodeURIComponent(item.name)}`, { method: 'DELETE' });
    return res.ok;
  }

  // Moves (or, to '', clears) every reference, then deletes the file if asked.
  async function relink(item, to, deleteAfter) {
    let changed = [];
    try {
      const res = await fetch('/api/media/relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, name: item.name, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      changed = data.changed || [];
    } catch (e) {
      FigJS.setStatus('References not updated: ' + e.message, '#f44336');
      return false;
    }
    const here = relinkOpenPage(item, to);
    const deleted = deleteAfter ? await removeFile(item) : false;
    const uses = changed.reduce((n, c) => n + c.count, 0);
    const where = `${uses} reference${uses === 1 ? '' : 's'} in ${changed.length} saved file${changed.length === 1 ? '' : 's'}`
      + (here ? ', and the open page' : '');
    const toName = to ? decodeURIComponent(to.split('/').pop()) : '';
    FigJS.setStatus(to
      ? `Replaced ${item.name} with ${toName}: ${where}${deleted ? `; ${item.name} deleted` : ''}.`
      : deleted ? `Deleted ${item.name} and cleared its uses: ${where}.` : `Cleared the uses of ${item.name} (${where}), but the file could not be deleted.`,
      to || deleted ? '#4caf50' : '#ff9800');
    refresh();
    return true;
  }

  async function replaceItem(item, opts) {
    const to = await pick({ kind: item.kind });
    if (!to || to === item.url) return;
    const toName = decodeURIComponent(to.split('/').pop());
    const usages = await usagesOf(item);
    const here = usesHere(item);
    const body = document.createElement('div');
    body.className = 'media-replace';
    const text = document.createElement('p');
    text.textContent = usages.length || here
      ? `Every use of ${item.name} becomes ${toName}:\n${usageText(usages, here)}`
      : `Nothing uses ${item.name} yet.`;
    const label = document.createElement('label');
    label.className = 'fig-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!(opts && opts.deleting);
    label.append(box, document.createTextNode(` Delete ${item.name} afterwards`));
    body.append(text, label);
    FigJS.dialog.open({
      title: `Replace ${item.name}`,
      body,
      width: 520,
      actions: [
        { label: 'Cancel' },
        { label: 'Replace', primary: true, onClick: () => relink(item, to, box.checked) },
      ],
    });
  }

  async function deleteItem(item) {
    if (item.kind !== 'font') {
      const usages = await usagesOf(item);
      const here = usesHere(item);
      if (usages.length || here) {
        FigJS.dialog.open({
          title: `Delete ${item.name}?`,
          body: Object.assign(document.createElement('p'), {
            className: 'media-replace',
            textContent: `Used in:\n${usageText(usages, here)}\n\nReplace it with another file, or delete it and clear those uses (images and sources there go empty).`,
          }),
          width: 520,
          actions: [
            { label: 'Cancel' },
            { label: 'Replace…', primary: true, onClick: () => { setTimeout(() => replaceItem(item, { deleting: true }), 0); } },
            { label: 'Delete and clear its uses', danger: true, onClick: () => relink(item, '', true) },
          ],
        });
        return;
      }
      const ok = await FigJS.dialog.confirm({
        title: `Delete ${item.name}?`, message: 'Not referenced by any page or stylesheet.', okLabel: 'Delete file', danger: true,
      });
      if (!ok) return;
      if (!(await removeFile(item))) { FigJS.setStatus('Delete failed', '#f44336'); return; }
      FigJS.setStatus(`Deleted ${item.name}`, '#4caf50');
      refresh();
      return;
    }
    let usages = [];
    try {
      const url = item.kind === 'font'
        ? '/api/fonts/usage?family=' + encodeURIComponent(item.family)
        : `/api/media/${item.kind}/${encodeURIComponent(item.name)}/usage`;
      usages = (await (await fetch(url, { cache: 'no-store' })).json()).usages || [];
    } catch (e) {}
    const label = item.kind === 'font' ? `${item.family} ${item.weight} ${item.style}` : item.name;
    const where = usages.length
      ? 'Used in:\n' + usages.slice(0, 8).map((u) => `  ${u.path}${u.count > 1 ? ` (${u.count} uses)` : ''}`).join('\n')
        + (usages.length > 8 ? `\n  and ${usages.length - 8} more` : '')
        + '\n\nThose references will break.'
      : 'Not referenced by any page or stylesheet.';
    const ok = await FigJS.dialog.confirm({
      title: `Delete ${label}?`, message: where, okLabel: 'Delete file', danger: true,
    });
    if (!ok) return;
    const url = item.kind === 'font'
      ? '/api/fonts/' + encodeURIComponent(item.file)
      : `/api/media/${item.kind}/${encodeURIComponent(item.name)}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) { FigJS.setStatus('Delete failed', '#f44336'); return; }
    FigJS.setStatus(`Deleted ${label}`, '#4caf50');
    if (item.kind === 'font') FigJS.canvas.refreshStylesheet('public/assets/fonts/fonts.css');
    refresh();
  }

  // ===================== Unused files ==================================

  // The server checks every file on disk; the open page may also hold
  // unsaved references, so anything it names is left out.
  async function findUnused(kind) {
    const data = await (await fetch('/api/media/unused?kind=' + kind, { cache: 'no-store' })).json();
    const open = pageText().toLowerCase();
    return (data.items || []).filter((i) =>
      !open.includes(i.name.split('/').pop().toLowerCase())
      && !(i.family && open.includes(i.family.toLowerCase())));
  }

  function unusedRow(item, onToggle) {
    const row = document.createElement('label');
    row.className = 'media-unused-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => onToggle(item, box.checked));

    const thumb = document.createElement('span');
    thumb.className = 'media-unused-thumb';
    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      img.alt = '';
      thumb.appendChild(img);
    } else if (item.kind === 'font') {
      thumb.textContent = 'Aa';
      thumb.style.fontFamily = `"${item.family}", system-ui, sans-serif`;
      thumb.style.fontWeight = item.weight;
      thumb.style.fontStyle = item.style;
    } else {
      thumb.innerHTML = item.kind === 'video' ? FigJS.icons.video : FigJS.icons.play;
    }

    const name = document.createElement('a');
    name.className = 'media-unused-name';
    name.href = item.url;
    name.target = '_blank';
    name.rel = 'noopener';
    name.title = 'Open in a new tab';
    name.textContent = item.name;

    const meta = document.createElement('span');
    meta.className = 'media-unused-meta';
    meta.textContent = [
      item.family ? `${item.family} ${item.weight} ${item.style}` : '',
      item.copy ? 'page copy' : '',
      formatSize(item.size),
    ].filter(Boolean).join(', ');

    row.append(box, thumb, name, meta);
    return row;
  }

  async function cleanUnused(kind) {
    const label = (KINDS.find((k) => k.id === kind) || KINDS[0]).label;
    const what = label.toLowerCase();
    FigJS.setStatus(`Looking for unused ${what}`);
    let items;
    try { items = await findUnused(kind); }
    catch (e) { FigJS.setStatus('Could not scan the library', '#f44336'); return; }
    FigJS.setStatus('');

    if (!items.length) {
      FigJS.dialog.open({
        title: `No unused ${what}`,
        body: `<div class="fig-dialog-message">Each file in the ${label} library is used by a page, draft, linked element or site setting.</div>`,
      });
      return;
    }

    const chosen = new Set(items);
    const wrap = document.createElement('div');
    wrap.className = 'media-unused';
    const intro = document.createElement('div');
    intro.className = 'fig-dialog-message';
    intro.textContent = `Nothing references these: no page, draft, linked element or site setting, `
      + `and not the page open now. Deleted files are removed from disk, not moved to a recycle bin.`;

    const all = document.createElement('label');
    all.className = 'fig-check media-unused-all';
    const allBox = document.createElement('input');
    allBox.type = 'checkbox';
    allBox.checked = true;
    all.append(allBox, document.createTextNode('Select all'));

    const list = document.createElement('div');
    list.className = 'media-unused-list';
    let deleteBtn = null;
    const sync = () => {
      const bytes = Array.from(chosen).reduce((n, i) => n + (i.size || 0), 0);
      allBox.checked = chosen.size === items.length;
      allBox.indeterminate = chosen.size > 0 && chosen.size < items.length;
      if (!deleteBtn) return;
      deleteBtn.disabled = !chosen.size;
      deleteBtn.textContent = `Delete ${chosen.size} file${chosen.size === 1 ? '' : 's'}`
        + (bytes ? ` (${formatSize(bytes)})` : '');
    };
    const rows = items.map((item) => unusedRow(item, (it, on) => {
      if (on) chosen.add(it); else chosen.delete(it);
      sync();
    }));
    rows.forEach((r) => list.appendChild(r));
    allBox.addEventListener('change', () => {
      rows.forEach((r, i) => {
        r.querySelector('input').checked = allBox.checked;
        if (allBox.checked) chosen.add(items[i]); else chosen.delete(items[i]);
      });
      sync();
    });
    wrap.append(intro, all, list);

    const dialog = FigJS.dialog.open({
      title: `${items.length} unused ${what}`,
      body: wrap,
      width: 600,
      actions: [
        { label: 'Cancel' },
        { label: 'Delete', danger: true, onClick: () => deleteUnused(kind, Array.from(chosen)) },
      ],
    });
    deleteBtn = dialog.el.querySelector('.fig-dialog-actions .is-danger');
    sync();
  }

  async function deleteUnused(kind, items) {
    if (!items.length) return false;
    let result;
    try {
      const res = await fetch('/api/media/unused/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, names: items.map((i) => i.name) }),
      });
      result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Delete failed');
    } catch (e) {
      FigJS.setStatus('Delete failed: ' + e.message, '#f44336');
      return false;
    }
    const kept = result.kept.length;
    FigJS.setStatus(`Deleted ${result.deleted.length} file${result.deleted.length === 1 ? '' : 's'}`
      + (kept ? `; ${kept} kept, now in use` : ''), kept ? '#ff9800' : '#4caf50');
    if (kind === 'font') FigJS.canvas.refreshStylesheet('public/assets/fonts/fonts.css');
    refresh();
    return true;
  }

  function copyUrl(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    FigJS.setStatus(`Copied ${url}`);
  }

  // ===================== Rendering =====================================

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function mediaTile(item, onPick) {
    const tile = document.createElement('div');
    tile.className = 'media-tile media-tile--' + item.kind;
    tile.title = `${item.name}${item.size ? ', ' + formatSize(item.size) : ''}\nClick: apply to the selected element (or copy the URL)`;

    const thumb = document.createElement('div');
    thumb.className = 'media-thumb';
    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      img.alt = '';
      img.draggable = true;
      img.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-fig-asset', item.url);
        e.dataTransfer.setData('text/plain', item.url);
        e.dataTransfer.setData('text/html', `<img src="${item.url}" alt="">`);
      });
      thumb.appendChild(img);
    } else if (item.kind === 'video') {
      const v = document.createElement('video');
      v.src = item.url + '#t=0.5';
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      thumb.appendChild(v);
      thumb.addEventListener('mouseenter', () => v.play().catch(() => {}));
      thumb.addEventListener('mouseleave', () => v.pause());
    } else {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'media-audio-play';
      play.innerHTML = FigJS.icons.play;
      let audio = null;
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!audio) audio = new Audio(item.url);
        if (audio.paused) { audio.play(); play.innerHTML = FigJS.icons.pause; }
        else { audio.pause(); play.innerHTML = FigJS.icons.play; }
        audio.onended = () => { play.innerHTML = FigJS.icons.play; };
      });
      thumb.appendChild(play);
    }
    tile.appendChild(thumb);

    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = item.name;
    tile.appendChild(name);

    if (!onPick) {
      const swapBtn = document.createElement('button');
      swapBtn.type = 'button';
      swapBtn.className = 'media-swap';
      swapBtn.title = 'Replace: every use of this file becomes another one';
      swapBtn.innerHTML = SWAP_ICON;
      swapBtn.addEventListener('click', (e) => { e.stopPropagation(); replaceItem(item); });
      tile.appendChild(swapBtn);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'media-del';
      del.title = 'Delete file';
      del.innerHTML = FigJS.icons.close;
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteItem(item); });
      tile.appendChild(del);
    }

    tile.addEventListener('click', () => {
      if (onPick) { onPick(item.url); return; }
      if (applyToSelection(item)) FigJS.setStatus(`Applied ${item.name}`, '#4caf50');
      else copyUrl(item.url);
    });
    return tile;
  }

  function fontCard(family, variants, usedHere) {
    const card = document.createElement('div');
    card.className = 'font-card';
    const head = document.createElement('div');
    head.className = 'font-card-head';
    const nm = document.createElement('strong');
    nm.textContent = family;
    const meta = document.createElement('span');
    meta.className = 'font-card-meta';
    meta.textContent = `${variants.length} variant${variants.length === 1 ? '' : 's'}${usedHere ? ', used here' : ''}`;
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'fig-icon-btn';
    use.title = 'Apply this family to the selected element';
    use.textContent = 'Aa';
    use.addEventListener('click', () => {
      const sel = FigJS.editor.getSelected();
      if (!sel) { FigJS.setStatus('Select an element first.', '#ff9800'); return; }
      FigJS.settingsUI.componentAdapter(sel).write('font-family', `"${family}", sans-serif`, {});
      FigJS.setStatus(`Font set to ${family}`, '#4caf50');
    });
    head.append(nm, meta, use);
    card.appendChild(head);

    const sample = document.createElement('div');
    sample.className = 'font-card-sample';
    sample.style.fontFamily = `"${family}", system-ui, sans-serif`;
    sample.textContent = 'The quick brown fox jumps over the lazy dog';
    card.appendChild(sample);

    variants.sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style)).forEach((v) => {
      const row = document.createElement('div');
      row.className = 'font-variant';
      const lbl = document.createElement('span');
      lbl.className = 'font-variant-label';
      lbl.textContent = `${v.weight} ${v.style}`;
      lbl.style.fontFamily = `"${family}"`;
      lbl.style.fontWeight = v.weight;
      lbl.style.fontStyle = v.style;
      const file = document.createElement('span');
      file.className = 'font-variant-file';
      file.textContent = v.file;
      file.title = v.file;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'media-del-inline';
      del.innerHTML = FigJS.icons.close;
      del.title = 'Delete this file';
      del.addEventListener('click', () => deleteItem({ ...v, kind: 'font' }));
      row.append(lbl, file, del);
      card.appendChild(row);
    });
    return card;
  }

  async function renderGrid(target, kind, opts) {
    const o = opts || {};
    target.innerHTML = '<div class="fig-empty">Loading</div>';
    let items;
    try { items = await fetchItems(kind); }
    catch (e) { target.innerHTML = '<div class="fig-empty">Could not load the library.</div>'; return; }

    const term = (o.search || '').trim().toLowerCase();
    const text = o.pageOnly ? pageText() : '';
    target.innerHTML = '';

    if (kind === 'font') {
      syncFontFamilies(items);
      const used = getPageFontFamilies();
      const byFamily = new Map();
      items.forEach((f) => {
        if (!byFamily.has(f.family)) byFamily.set(f.family, []);
        byFamily.get(f.family).push(f);
      });
      let families = Array.from(byFamily.keys()).sort((a, b) => a.localeCompare(b));
      if (term) families = families.filter((f) => f.toLowerCase().includes(term));
      if (o.pageOnly) families = families.filter((f) => used.has(f.toLowerCase()));
      if (!families.length) {
        target.innerHTML = `<div class="fig-empty">${o.pageOnly ? 'This page uses no library fonts. Untick "This page" to see all.' : 'No fonts yet. Upload .woff2 files (one per weight/style).'}</div>`;
        return;
      }
      families.forEach((f) => target.appendChild(fontCard(f, byFamily.get(f), used.has(f.toLowerCase()))));
      return;
    }

    let list = items;
    if (term) list = list.filter((i) => i.name.toLowerCase().includes(term));
    if (o.pageOnly) list = list.filter((i) => text.includes(i.url));
    if (!list.length) {
      target.innerHTML = `<div class="fig-empty">${o.pageOnly ? 'Nothing from this library is used on this page. Untick "This page" to see everything.' : 'Nothing here yet. Upload or drop files.'}</div>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'media-grid media-grid--' + kind;
    list.forEach((item) => grid.appendChild(mediaTile(item, o.onPick)));
    target.appendChild(grid);

    // GrapesJS's asset manager (image double-click) lists the same images.
    if (kind === 'image' && FigJS.editor) {
      const am = FigJS.editor.AssetManager;
      const have = new Set(am.getAll().map((a) => a.get('src')));
      items.forEach((i) => { if (!have.has(i.url)) am.add({ src: i.url, name: i.name }); });
    }
  }

  function buildToolbar(opts) {
    const bar = document.createElement('div');
    bar.className = 'fig-sticky-bar';

    const kinds = document.createElement('div');
    kinds.className = 'fig-seg';
    KINDS.forEach((k) => {
      if (opts.lockKind && k.id !== opts.kind) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k.label;
      b.classList.toggle('is-active', k.id === opts.kind);
      b.addEventListener('click', () => opts.onKind(k.id));
      kinds.appendChild(b);
    });

    const row = document.createElement('div');
    row.className = 'fig-bar-row';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'fig-input';
    search.placeholder = 'Search';
    search.value = opts.search || '';
    search.addEventListener('input', () => opts.onSearch(search.value));

    const scope = document.createElement('label');
    scope.className = 'fig-check';
    scope.title = 'Show only files this page uses';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!opts.pageOnly;
    box.addEventListener('change', () => opts.onScope(box.checked));
    scope.append(box, document.createTextNode('This page'));

    const up = document.createElement('label');
    up.className = 'fig-upload-btn';
    up.textContent = 'Upload';
    const file = document.createElement('input');
    file.type = 'file';
    file.multiple = true;
    file.accept = (KINDS.find((k) => k.id === opts.kind) || KINDS[0]).accept;
    file.addEventListener('change', async () => {
      const results = await uploadMany(file.files);
      file.value = '';
      opts.onUploaded(results);
    });
    up.appendChild(file);

    row.append(search, opts.hideScope ? document.createTextNode('') : scope);
    if (opts.onUnused) {
      const unused = document.createElement('button');
      unused.type = 'button';
      unused.className = 'media-unused-btn';
      unused.textContent = 'Unused';
      unused.title = 'Find files of this kind that nothing uses, and delete them';
      unused.addEventListener('click', opts.onUnused);
      row.appendChild(unused);
    }
    row.appendChild(up);
    bar.append(kinds, row);
    return bar;
  }

  function render() {
    if (!panel) return;
    panel.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'media-body';
    const rerender = () => renderGrid(grid, state.kind, { pageOnly: state.pageOnly, search: state.search });
    panel.appendChild(buildToolbar({
      kind: state.kind,
      pageOnly: state.pageOnly,
      search: state.search,
      onKind: (k) => { state.kind = k; render(); },
      onSearch: (s) => { state.search = s; rerender(); },
      onScope: (v) => { state.pageOnly = v; rerender(); },
      onUnused: () => cleanUnused(state.kind),
      onUploaded: (results) => {
        // New uploads are not on the page yet.
        if (results.length && state.pageOnly) state.pageOnly = false;
        render();
      },
    }));
    const hint = document.createElement('div');
    hint.className = 'fig-hint media-hint';
    hint.textContent = state.kind === 'font'
      ? 'One file per weight/style (.woff2 preferred). Family, weight and style come from the file name. Re-uploading identical files is a no-op.'
      : 'Click to apply to the selected element (or copy the URL). Drag images onto the canvas. Drop files here to upload; identical files are reused, never duplicated.';
    panel.appendChild(hint);
    panel.appendChild(grid);
    rerender();
  }

  function refresh() {
    const tab = document.getElementById('tab-media');
    if (tab && tab.classList.contains('active')) render();
    else if (state.kind === 'font') fetchItems('font').then(syncFontFamilies).catch(() => {});
  }

  // ===================== Picker ========================================

  function pick(opts) {
    const kind = (opts && opts.kind) || 'image';
    return new Promise((resolve) => {
      let chosen = null;
      const wrap = document.createElement('div');
      wrap.className = 'media-picker';
      const grid = document.createElement('div');
      grid.className = 'media-body';
      let search = '';
      let dialog = null;
      const onPick = (url) => { chosen = url; dialog.close(); };
      const rerender = () => renderGrid(grid, kind, { search, onPick });
      wrap.appendChild(buildToolbar({
        kind, lockKind: true, hideScope: true, search,
        onKind() {}, onScope() {},
        onSearch: (s) => { search = s; rerender(); },
        onUploaded: (results) => {
          const r = results.find((x) => x.kind === kind);
          if (r) onPick(r.url); else rerender();
        },
      }));
      wrap.appendChild(grid);
      dialog = FigJS.dialog.open({
        title: `Choose ${kind === 'image' ? 'an image' : kind}`,
        body: wrap,
        width: 640,
        actions: [{ label: 'Cancel' }],
        onClose: () => resolve(chosen),
      });
      rerender();
    });
  }

  // ===================== Install =======================================

  function install() {
    panel = document.getElementById('media-panel');
    if (!panel) return;

    panel.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        panel.classList.add('is-drop');
      }
    });
    panel.addEventListener('dragleave', () => panel.classList.remove('is-drop'));
    panel.addEventListener('drop', async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      panel.classList.remove('is-drop');
      await uploadMany(e.dataTransfer.files);
      state.pageOnly = false;
      render();
    });

    // Re-filter when the page changes while the tab is open.
    const editor = FigJS.editor;
    let t = null;
    const schedule = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const tab = document.getElementById('tab-media');
        if (tab && tab.classList.contains('active') && state.pageOnly) render();
      }, 500);
    };
    ['component:add', 'component:remove', 'undo', 'redo'].forEach((ev) => editor.on(ev, schedule));

    fetchItems('font').then(syncFontFamilies).catch(() => {});
    render();
    routeAssetManager(editor);
  }

  // GrapesJS's asset manager knows only images: its open() goes to the
  // media picker, with the kind taken from the caller's accept/types.
  function kindFromOpts(opts) {
    const want = String((opts && opts.accept) || '') + ' ' + ((opts && opts.types) || []).join(' ');
    if (/audio/.test(want)) return 'audio';
    if (/video/.test(want)) return 'video';
    if (/font/.test(want)) return 'font';
    return 'image';
  }

  function routeAssetManager(editor) {
    const am = editor && editor.AssetManager;
    if (!am || am.__figRouted) return;
    am.__figRouted = true;
    am.open = function (opts) {
      const o = opts || {};
      const kind = kindFromOpts(o);
      pick({ kind }).then((url) => {
        if (!url) return;
        const asset = am.get(url) || am.add({ src: url });
        if (typeof o.select === 'function') o.select(asset, true);
        else if (o.target && o.target.set) o.target.set('src', url);
      });
      return am;
    };
    ['core:open-assets', 'open-assets'].forEach((id) => {
      editor.Commands.add(id, { run(ed, sender, opts) { am.open(opts); } });
    });
  }

  FigJS.media = { install, refresh, render, upload, uploadMany, pick };
})();
