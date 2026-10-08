// File tree, page load and save, new pages, and the raw .css/.js editor.
// <body>/<html> go through FigJS.pageBody; the document through
// buildDocument().
//   FigJS.files.install() / refreshTree() / save() / newPage()
//   FigJS.files.loadFile(relPath, { force }) -> Promise<boolean>
//   FigJS.files.loadRawFile(relPath)
//   FigJS.files.buildDocument() -> { html, libCss }  (after await FigJS.i18n.commitActiveEditing())

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const DEFAULT_LANG = 'en';
  const LAST_FILE_KEY = 'fig.lastFile';

  let fileTreeEl = null;
  let pageCodeView = null;
  let rawFileView = null;
  let rawFileName = null;
  let rawFileBody = null;

  // ===================== File tree view state ==========================

  const FILE_TREE_COLLAPSE_KEY = 'fig.fileTree.collapsed';

  let fileTreeSearch = '';
  let fileTreeTypeFilter = 'all';
  const collapsedFolders = (() => {
    try {
      const arr = JSON.parse(localStorage.getItem(FILE_TREE_COLLAPSE_KEY) || '[]');
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return new Set(); }
  })();

  function persistCollapsed() {
    try { localStorage.setItem(FILE_TREE_COLLAPSE_KEY, JSON.stringify(Array.from(collapsedFolders))); }
    catch (e) {}
  }

  const TYPE_FILTERS = [
    { id: 'all',  label: 'All',   test: () => true },
    { id: 'html', label: '.html', test: (ext) => ext === '.html' },
    { id: 'css',  label: '.css',  test: (ext) => ext === '.css' },
    { id: 'js',   label: '.js',   test: (ext) => ext === '.js' },
    { id: 'json', label: '.json', test: (ext) => ext === '.json' },
  ];

  // ===================== File tree =====================================

  function markCurrent() {
    const cur = FigJS.state.currentFilePath || (FigJS.state.currentRawFile && FigJS.state.currentRawFile.path);
    document.querySelectorAll('#file-tree .file-label').forEach((el) => {
      el.classList.toggle('current', el.dataset.path === cur);
    });
  }

  function renderTreeNode(node) {
    const { icons } = window.PresetRegistry;
    const li = document.createElement('li');

    if (node.type === 'dir') {
      const label = document.createElement('div');
      label.className = 'dir-label';
      label.innerHTML = icons.folder;
      const span = document.createElement('span');
      span.textContent = node.name;
      label.appendChild(span);
      label.dataset.path = node.path;

      const ul = document.createElement('ul');
      node.children.forEach((c) => ul.appendChild(renderTreeNode(c)));
      ul.hidden = collapsedFolders.has(node.path);
      label.classList.toggle('is-collapsed', ul.hidden);

      label.addEventListener('click', () => {
        ul.hidden = !ul.hidden;
        label.classList.toggle('is-collapsed', ul.hidden);
        if (ul.hidden) collapsedFolders.add(node.path); else collapsedFolders.delete(node.path);
        persistCollapsed();
      });
      label.appendChild(folderActions(node));

      li.append(label, ul);
      return li;
    }

    const label = document.createElement('div');
    label.className = 'file-label';
    if (node.ext !== '.html') label.classList.add('is-asset-file');
    label.innerHTML = icons.file;
    const span = document.createElement('span');
    span.textContent = node.name;
    label.appendChild(span);
    label.dataset.path = node.path;
    label.dataset.ext = node.ext;
    label.dataset.name = (node.name || '').toLowerCase();
    label.addEventListener('click', (e) => {
      if (label.classList.contains('is-renaming') || isOpen(node.path)) return;
      if (e.target.closest && e.target.closest('.file-actions')) return;
      if (node.ext === '.html') loadFile(node.path);
      else loadRawFile(node.path);
    });
    label.addEventListener('dblclick', (e) => {
      if (e.target.closest && e.target.closest('.file-actions')) return;
      e.preventDefault();
      startRename(label, span, node);
    });
    label.title = 'Double-click to rename';
    label.appendChild(fileActions(node));
    li.appendChild(label);
    return li;
  }

  // ===================== Rename ========================================

  function isOpen(relPath) {
    return FigJS.state.currentFilePath === relPath
      || !!(FigJS.state.currentRawFile && FigJS.state.currentRawFile.path === relPath);
  }

  function startRename(label, span, node) {
    if (label.classList.contains('is-renaming')) return;
    label.classList.add('is-renaming');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-rename';
    input.value = node.name;
    input.spellcheck = false;
    span.replaceWith(input);
    input.focus();
    const dot = node.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : node.name.length);

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.replaceWith(span);
      label.classList.remove('is-renaming');
      if (commit && value && value !== node.name) renameFile(node, value);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    ['click', 'dblclick', 'mousedown'].forEach((t) => input.addEventListener(t, (e) => e.stopPropagation()));
  }

  // Same folder and extension; characters a URL would escape become dashes.
  async function renameFile(node, value) {
    let name = value.replace(/[\\/]/g, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
    if (!name) return;
    if (!name.toLowerCase().endsWith(node.ext)) name += node.ext;
    if (name === node.name) return;
    const dir = node.path.slice(0, node.path.lastIndexOf('/') + 1);
    const to = dir + name;
    const open = isOpen(node.path);
    if (open && FigJS.state.hasUnsavedChanges) {
      if (FigJS.state.currentRawFile) await saveRawFile(); else await saveCurrentFile();
    }
    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: node.path, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      if (FigJS.state.currentFilePath === node.path) {
        FigJS.state.currentFilePath = data.path;
        try { localStorage.setItem(LAST_FILE_KEY, data.path); } catch (e) {}
        FigJS.canvas.installForPage(data.path);
        if (FigJS.pageTab) FigJS.pageTab.refresh();
      } else if (FigJS.state.currentRawFile && FigJS.state.currentRawFile.path === node.path) {
        FigJS.state.currentRawFile.path = data.path;
        rawFileName.textContent = data.path;
      }
      await refreshTree();
      FigJS.setStatus(`Renamed to ${data.path}`, '#4caf50');
    } catch (e) {
      FigJS.setStatus('Rename failed: ' + e.message, '#f44336');
    }
  }

  // ===================== Row actions =====================================

  // Editor server URLs: public/x.html -> /x.html, drafts/x.html ->
  // /__drafts/x.html, the site root -> /__site/ ("/" is the editor).
  function browserUrlFor(relPath) {
    if (relPath.startsWith('drafts/')) return '/__drafts/' + relPath.slice('drafts/'.length);
    const sub = relPath.replace(/^public\//, '');
    return sub === 'index.html' ? '/__site/' : '/' + sub;
  }

  function fileActions(node) {
    const box = document.createElement('span');
    box.className = 'file-actions';
    const add = (label, title, fn, extra) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'file-act' + (extra ? ' ' + extra : '');
      b.innerHTML = label;
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      box.appendChild(b);
    };
    if (node.ext === '.html') {
      add(FigJS.icons.external, 'Open in a browser tab (runs the page: games, video, links)',
        () => window.open(browserUrlFor(node.path), '_blank', 'noopener'));
    }
    add(FigJS.icons.folder, 'Show in folder', () => revealInFolder(node.path));
    if (node.ext === '.html') {
      add(FigJS.icons.copy, 'Duplicate into drafts/', () => duplicatePage(node.path));
    }
    if (node.ext === '.html' && node.path.startsWith('drafts/')) {
      add(FigJS.icons.upload, 'Publish: move to public/', () => promoteDraft(node.path));
    }
    add(FigJS.icons.trash, 'Delete', () => deleteFile(node.path), 'is-danger');
    return box;
  }

  // Copies the saved file; unsaved changes stay in the open page.
  async function duplicatePage(relPath) {
    try {
      const res = await fetch('/api/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: relPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      await refreshTree();
      showRow(data.path);
      const unsaved = isOpen(relPath) && FigJS.state.hasUnsavedChanges;
      FigJS.setStatus(`Duplicated to ${data.path}` + (unsaved ? ' (from the saved version)' : ''), '#4caf50');
    } catch (e) {
      FigJS.setStatus('Duplicate failed: ' + e.message, '#f44336');
    }
  }

  // Open the folders above a row and scroll it into view.
  function showRow(relPath) {
    const label = document.querySelector(`#file-tree .file-label[data-path="${CSS.escape(relPath)}"]`);
    if (!label) return;
    for (let ul = label.closest('ul'); ul; ul = ul.parentElement.closest('ul')) {
      if (!ul.hidden) continue;
      ul.hidden = false;
      const dir = ul.previousElementSibling;
      if (dir && dir.classList.contains('dir-label')) {
        dir.classList.remove('is-collapsed');
        collapsedFolders.delete(dir.dataset.path);
      }
    }
    persistCollapsed();
    label.scrollIntoView({ block: 'nearest' });
  }

  // To the Recycle Bin / Trash; without one, a second confirmation deletes for good.
  async function deleteFile(relPath) {
    const name = relPath.split('/').pop();
    const isOpen = FigJS.state.currentFilePath === relPath
      || (FigJS.state.currentRawFile && FigJS.state.currentRawFile.path === relPath);
    let isHome = false;
    try { isHome = FigJS.site && (await FigJS.site.get()).homePage === relPath; } catch (e) {}
    const ok = await FigJS.dialog.confirm({
      title: `Delete ${name}?`,
      message: relPath + ' moves to the Recycle Bin.' +
        (isHome ? ' It is the site\'s home page: choose another in Site settings.' : '') +
        (isOpen ? ' It is open now; unsaved changes to it are discarded.' : ''),
      okLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const send = (permanent) => fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath, permanent }),
    }).then(async (res) => ({ res, data: await res.json().catch(() => ({})) }));

    try {
      let { res, data } = await send(false);
      if (!res.ok && data.trashUnavailable) {
        const sure = await FigJS.dialog.confirm({
          title: `Delete ${name} permanently?`,
          message: 'It could not be moved to the Recycle Bin. Deleting it permanently cannot be undone.',
          okLabel: 'Delete permanently',
          danger: true,
        });
        if (!sure) return;
        ({ res, data } = await send(true));
      }
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      if (isOpen) closeDeleted();
      await refreshTree();
      FigJS.setStatus(`Deleted ${relPath}`, '#4caf50');
    } catch (e) {
      FigJS.setStatus('Delete failed: ' + e.message, '#f44336');
    }
  }

  // Leaves an empty canvas.
  function closeDeleted() {
    FigJS.state.currentFilePath = null;
    FigJS.state.currentRawFile = null;
    rawFileView.style.display = 'none';
    pageCodeView.style.display = 'flex';
    try { localStorage.removeItem(LAST_FILE_KEY); } catch (e) {}
    FigJS.undo.untracked(() => {
      FigJS.editor.setComponents('');
      FigJS.editor.setStyle('');
    });
    FigJS.undo.clear();
    FigJS.clearUnsaved();
    markCurrent();
    if (FigJS.pageTab) FigJS.pageTab.refresh();
  }

  function folderActions(node) {
    const box = document.createElement('span');
    box.className = 'file-actions';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'file-act';
    b.innerHTML = FigJS.icons.folder;
    b.title = 'Open this folder';
    b.addEventListener('click', (e) => { e.stopPropagation(); revealInFolder(node.path); });
    box.appendChild(b);
    return box;
  }

  async function revealInFolder(relPath) {
    try {
      const res = await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
    } catch (e) {
      FigJS.setStatus('Could not open the folder: ' + e.message, '#f44336');
    }
  }

  async function promoteDraft(relPath) {
    const name = relPath.split('/').pop();
    const target = await FigJS.dialog.prompt({
      title: 'Publish draft',
      label: 'Path inside public/ (folders are created)',
      value: name,
      okLabel: 'Move',
    });
    if (!target || !target.trim()) return;
    const clean = target.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const to = 'public/' + (/\.html$/i.test(clean) ? clean : clean + '.html');
    const isOpen = FigJS.state.currentFilePath === relPath;
    if (isOpen && FigJS.state.hasUnsavedChanges) await saveCurrentFile();
    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: relPath, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      if (isOpen) {
        FigJS.state.currentFilePath = data.path;
        try { localStorage.setItem(LAST_FILE_KEY, data.path); } catch (e) {}
        FigJS.canvas.installForPage(data.path);
      }
      await refreshTree();
      FigJS.setStatus(`Moved to ${data.path}`, '#4caf50');
    } catch (e) {
      FigJS.setStatus('Move failed: ' + e.message, '#f44336');
    }
  }

  function fileMatches(label, type, term) {
    if (!type.test(label.dataset.ext || '')) return false;
    return !term || (label.dataset.name || '').indexOf(term) >= 0;
  }

  function subtreeHasMatch(li, type, term) {
    const fileLabel = li.querySelector(':scope > .file-label');
    if (fileLabel) return fileMatches(fileLabel, type, term);
    const subUl = li.querySelector(':scope > ul');
    return !!subUl && Array.from(subUl.children).some((c) => subtreeHasMatch(c, type, term));
  }

  function applyFileTreeFilter() {
    if (!fileTreeEl) return;
    const term = fileTreeSearch.trim().toLowerCase();
    const type = TYPE_FILTERS.find((f) => f.id === fileTreeTypeFilter) || TYPE_FILTERS[0];
    fileTreeEl.querySelectorAll('li').forEach((li) => {
      li.style.display = subtreeHasMatch(li, type, term) ? '' : 'none';
    });
  }

  function ensureFileTreeControls() {
    if (!fileTreeEl || document.getElementById('file-tree-controls')) return;
    const bar = document.createElement('div');
    bar.id = 'file-tree-controls';
    bar.className = 'fig-sticky-bar';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'fig-input';
    search.placeholder = 'Search files';
    search.value = fileTreeSearch;
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.addEventListener('input', () => { fileTreeSearch = search.value; applyFileTreeFilter(); });

    const chips = document.createElement('div');
    chips.className = 'fig-chip-row';
    TYPE_FILTERS.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fig-chip';
      btn.textContent = f.label;
      btn.classList.toggle('is-active', f.id === fileTreeTypeFilter);
      btn.addEventListener('click', () => {
        fileTreeTypeFilter = f.id;
        chips.querySelectorAll('.fig-chip').forEach((c) => c.classList.toggle('is-active', c === btn));
        applyFileTreeFilter();
      });
      chips.appendChild(btn);
    });

    const project = document.createElement('button');
    project.type = 'button';
    project.className = 'fig-icon-btn';
    project.innerHTML = FigJS.icons.folder;
    project.title = 'Open the project folder';
    project.addEventListener('click', () => revealInFolder(''));
    const row = document.createElement('div');
    row.className = 'file-tree-search-row';
    row.append(search, project);

    bar.append(row, chips);
    fileTreeEl.parentNode.insertBefore(bar, fileTreeEl);
  }

  async function refreshTree() {
    if (!fileTreeEl) return;
    try {
      const data = await (await fetch('/api/files', { cache: 'no-store' })).json();
      fileTreeEl.innerHTML = '';
      const root = document.createElement('ul');
      data.tree.forEach((node) => root.appendChild(renderTreeNode(node)));
      fileTreeEl.appendChild(root);
      ensureFileTreeControls();
      applyFileTreeFilter();
      markCurrent();
    } catch (e) {
      fileTreeEl.textContent = 'Error loading file list.';
    }
  }

  // ===================== Unsaved-changes guard =========================

  async function confirmDiscard() {
    if (!FigJS.state.hasUnsavedChanges) return true;
    return FigJS.dialog.confirm({
      title: 'Discard unsaved changes?',
      message: 'The current page has changes that have not been saved.',
      okLabel: 'Discard changes',
      danger: true,
    });
  }

  // ===================== New page ======================================

  async function newPage() {
    let folders = ['(drafts)'];
    try {
      const data = await (await fetch('/api/files', { cache: 'no-store' })).json();
      const collect = (node, prefix) => {
        if (node.type !== 'dir') return;
        if (prefix != null && !/^(assets)(\/|$)/.test(prefix)) folders.push(prefix || '/');
        node.children.forEach((c) => collect(c, (prefix ? prefix + '/' : '') + c.name));
      };
      collect(data.tree[0], '');
      folders = Array.from(new Set(folders));
    } catch (e) {}

    const form = document.createElement('div');
    form.className = 'fig-form';
    form.innerHTML = `
      <label class="fig-field"><span class="fig-field-label">Page name</span>
        <input type="text" name="name" placeholder="e.g. about" spellcheck="false"></label>
      <label class="fig-field"><span class="fig-field-label">Title</span>
        <input type="text" name="title" placeholder="Shown in the browser tab"></label>
      <label class="fig-field"><span class="fig-field-label">Where</span>
        <select name="where"></select></label>
      <div class="fig-hint">Drafts live in drafts/ and are not published. Pages in public/ are the site.</div>`;
    const select = form.querySelector('select');
    folders.forEach((f) => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f === '(drafts)' ? 'Draft (not published)' : 'public/' + (f === '/' ? '' : f + '/');
      select.appendChild(o);
    });

    FigJS.dialog.open({
      title: 'New page',
      body: form,
      width: 440,
      actions: [
        { label: 'Cancel' },
        { label: 'Create', primary: true, onClick: async () => {
          const name = form.querySelector('[name=name]').value.trim();
          if (!name) { form.querySelector('[name=name]').focus(); return false; }
          if (!(await confirmDiscard())) return false;
          const where = select.value;
          try {
            const res = await fetch('/api/new-page', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                title: form.querySelector('[name=title]').value.trim(),
                where: where === '(drafts)' ? 'draft' : 'public',
                folder: where === '/' || where === '(drafts)' ? '' : where,
              }),
            });
            const result = await res.json();
            if (!result.path) throw new Error(result.error || 'no path returned');
            await refreshTree();
            await loadFile(result.path, { force: true });
            FigJS.setStatus(`Created ${result.path}`, '#4caf50');
          } catch (err) {
            FigJS.setStatus('Could not create page: ' + err.message, '#f44336');
          }
          return true;
        } },
      ],
    });
  }

  // ===================== Raw (.css/.js) editor =========================

  async function loadRawFile(relPath) {
    if (!(await confirmDiscard())) return;
    try {
      const res = await fetch(`/api/load?path=${encodeURIComponent(relPath)}`, { cache: 'no-store' });
      const text = await res.text();
      FigJS.state.currentRawFile = { path: relPath, content: text };
      FigJS.state.currentFilePath = null;
      rawFileName.textContent = relPath;
      FigJS.codeView.setValue(rawFileBody, text);
      pageCodeView.style.display = 'none';
      rawFileView.style.display = 'flex';
      FigJS.ui.switchTab('code');
      FigJS.clearUnsaved();
      FigJS.setStatus(`Editing ${relPath}`);
      markCurrent();
    } catch (e) {
      FigJS.setStatus('Failed to open file.', '#f44336');
    }
  }

  async function saveRawFile() {
    if (!FigJS.state.currentRawFile) return;
    FigJS.setStatus('Saving');
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: FigJS.state.currentRawFile.path, htmlContent: rawFileBody.value }),
      });
      const result = await res.json();
      if (result.status !== 'success') throw new Error(result.error || 'unknown error');
      FigJS.state.currentRawFile.content = rawFileBody.value;
      FigJS.clearUnsaved();
      FigJS.setStatus(`Saved ${FigJS.state.currentRawFile.path}`, '#4caf50');
      if (/\.css$/i.test(FigJS.state.currentRawFile.path) && FigJS.canvas.refreshStylesheet) {
        FigJS.canvas.refreshStylesheet(FigJS.state.currentRawFile.path);
      }
    } catch (e) {
      FigJS.setStatus('Save failed: ' + e.message, '#f44336');
    }
  }

  async function closeRawFile() {
    if (!(await confirmDiscard())) return;
    FigJS.state.currentRawFile = null;
    rawFileView.style.display = 'none';
    pageCodeView.style.display = 'flex';
    FigJS.clearUnsaved();
    markCurrent();
  }

  // Language auto-registration: data-lang-XX codes in a page are declared
  // languages, registered before pruneUnregisteredLanguageAttrs() runs.

  function registerLangCodesFromHtml(html) {
    const reg = window.PresetRegistry;
    const found = new Set();
    String(html || '').replace(
      /\bdata-lang-([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\s*=/gi,
      (whole, code) => { found.add(String(code).toLowerCase()); return whole; }
    );
    found.forEach((code) => {
      if (code === 'available' || code === 'default') return;
      if (!reg.hasLanguage(code)) { try { reg.registerLanguage(code, code.toUpperCase()); } catch (e) {} }
    });
  }

  // ===================== Load ==========================================

  async function loadFile(relPath, opts) {
    const editor = FigJS.editor;
    if (!(opts && opts.force) && !(await confirmDiscard())) return false;

    if (FigJS.preview && FigJS.preview.isActive()) FigJS.preview.stop();
    if (FigJS.i18n.clearSnapshotSkip) FigJS.i18n.clearSnapshotSkip();

    FigJS.state.currentRawFile = null;
    rawFileView.style.display = 'none';
    pageCodeView.style.display = 'flex';
    FigJS.setStatus('Loading');
    FigJS.state.isInternalUpdate = true;

    try {
      const res = await fetch(`/api/load?path=${encodeURIComponent(relPath)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      const gjsStyle = doc.getElementById('page-styles') || doc.getElementById('gjs-styles');
      const savedCss = gjsStyle ? gjsStyle.textContent : '';
      if (gjsStyle) gjsStyle.remove();

      // Boot blocks are rewritten on save, never edited.
      FigJS.boot.stripFrom(doc);

      FigJS.undo.untracked(() => {
        editor.setComponents(doc.body.innerHTML);
        editor.setStyle(savedCss);
      });
      await FigJS.library.loadRules();

      FigJS.pageBody.loadFrom(doc);
      if (FigJS.themeEdit) FigJS.themeEdit.onPageLoaded();
      // Rules on GrapesJS state classes (.gjs-selected ...) are editor UI.
      const editorStateRules = (editor.Css.getAll().models || [])
        .filter((rule) => /\.gjs-/.test(rule.selectorsToString()));
      if (editorStateRules.length) FigJS.undo.untracked(() => editor.Css.getAll().remove(editorStateRules));

      const pruned = FigJS.pageBody.pruneOrphanIdRules();
      if (pruned) console.info(`[files] dropped ${pruned} orphaned #id rule(s)`);

      FigJS.canvas.installForPage(relPath);

      let langNames = {};
      try { langNames = JSON.parse(FigJS.pageBody.getAttr('data-lang-names') || '{}') || {}; } catch (e) {}
      (FigJS.pageBody.getAttr('data-lang-available') || '').split(/\s+/).filter(Boolean).forEach((code) => {
        const reg = window.PresetRegistry;
        if (!reg.hasLanguage(code)) reg.registerLanguage(code, langNames[code] || code.toUpperCase());
        else if (langNames[code]) reg.setLanguageName(code, langNames[code]);
      });
      registerLangCodesFromHtml(doc.body.innerHTML);

      const loadedLang = FigJS.pageBody.getAttr('data-lang') || DEFAULT_LANG;
      FigJS.withInternalUpdate(() => FigJS.i18n.snapshotLanguageContent(loadedLang, { force: true }));
      FigJS.i18n.pruneUnregisteredLanguageAttrs();
      FigJS.i18n.renderDropdown();

      FigJS.codeView.setValue(
        document.getElementById('live-head'),
        FigJS.codeFormat.html(doc.head.innerHTML)
      );
      FigJS.canvas.ensureDeps();
      FigJS.canvas.syncHead();

      if (FigJS.library.syncInstances) await FigJS.library.syncInstances();

      FigJS.state.currentFilePath = relPath;
      try { localStorage.setItem(LAST_FILE_KEY, relPath); } catch (e) {}
      markCurrent();

      FigJS.ui.applyZoom(FigJS.ui.getZoomValue());
      FigJS.state.isInternalUpdate = false;

      FigJS.codeView.sync();
      FigJS.presetsTab.render();
      FigJS.pageTab.refresh();
      FigJS.clearUnsaved();
      FigJS.undo.clear();
      if (FigJS.resetImageTracking) FigJS.resetImageTracking();

      FigJS.setStatus(`Opened ${relPath}`, '#4caf50');
      return true;
    } catch (e) {
      console.error(e);
      FigJS.state.isInternalUpdate = false;
      FigJS.setStatus('Failed to load file: ' + e.message, '#f44336');
      return false;
    }
  }

  // ===================== Serialize =====================================

  function stripDataUriImages(html) {
    return html.replace(/(<img\b[^>]*?)\ssrc="(data:image\/[^"]{2000,})"/gi, '$1');
  }

  // Body markup without GrapesJS's <body> wrapper.
  function bodyInnerHtml() {
    const html = FigJS.editor.getHtml();
    const parsed = new DOMParser().parseFromString('<!DOCTYPE html><html>' + html + '</html>', 'text/html');
    return parsed.body.innerHTML;
  }

  // Published pages carry no comments: none in the markup, none in inline
  // styles or scripts (strip-comments.js). A script whose remainder would
  // not parse keeps its own.
  function stripComments(doc) {
    const found = [];
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) found.push(walker.currentNode);
    found.forEach((n) => n.remove());
    const S = FigJS.stripComments;
    if (!S) return;
    doc.querySelectorAll('style').forEach((el) => {
      const next = S.css(el.textContent);
      if (next !== el.textContent) el.textContent = next;
    });
    doc.querySelectorAll('script:not([src])').forEach((el) => {
      const type = (el.getAttribute('type') || '').trim();
      if (type && !/^(text|application)\/(javascript|ecmascript)$/i.test(type)) return;
      const next = S.js(el.textContent);
      if (next === el.textContent) return;
      try { new Function(next); } catch (e) { return; }
      el.textContent = next;
    });
  }

  function buildDocument() {
    const editor = FigJS.editor;

    FigJS.i18n.snapshotLanguageContent(FigJS.i18n.getCurrentLang());
    FigJS.withInternalUpdate(() => {
      registerLangCodesFromHtml(editor.getHtml());
      FigJS.i18n.pruneUnregisteredLanguageAttrs();
    });
    FigJS.canvas.ensureDeps();

    const doc = document.implementation.createHTMLDocument('');
    doc.head.innerHTML = document.getElementById('live-head').value;

    // Current boot blocks right after <title>.
    FigJS.boot.stripFrom(doc);
    const blocks = FigJS.boot.getBlocks();
    if (blocks) {
      const title = doc.head.querySelector('title');
      const tpl = doc.createElement('template');
      tpl.innerHTML = blocks;
      doc.head.insertBefore(tpl.content, title ? title.nextSibling : doc.head.firstChild);
    }

    const wrapperRules = new Set(FigJS.pageBody.wrapperRules());
    const allRules = editor.Css.getAll().models || [];
    const libRules = allRules.filter((r) => r.get('library'));
    const pageRules = allRules.filter((r) => !r.get('library') && !wrapperRules.has(r)
      && !/\.gjs-/.test(r.selectorsToString()));
    const pageCss = FigJS.codeView.cleanCss(
      [FigJS.library.serializeRules(pageRules), FigJS.pageBody.wrapperRulesCss()].filter(Boolean).join('\n')
    );
    const libCss = FigJS.library.serializeRules(libRules);

    // Cascade as in the editor: preset stylesheets, library.css, then the
    // page's rules, so library settings beat preset defaults.
    const libLink = doc.head.querySelector('link[rel="stylesheet"][href$="/assets/css/library.css"]');
    if (libLink) {
      const sheets = doc.head.querySelectorAll('link[rel="stylesheet"]');
      const last = sheets[sheets.length - 1];
      if (last !== libLink) last.after(libLink);
    }

    const styleTag = doc.createElement('style');
    styleTag.id = 'page-styles';
    styleTag.textContent = `\n${pageCss}\n`;
    doc.head.appendChild(styleTag);

    doc.body.innerHTML = stripDataUriImages(bodyInnerHtml());
    FigJS.pageBody.writeTo(doc);

    const pageLangs = FigJS.i18n.computePageLanguages().filter((c) => window.PresetRegistry.hasLanguage(c));
    if (pageLangs.length > 1 || (pageLangs.length && pageLangs[0] !== DEFAULT_LANG)) {
      doc.body.setAttribute('data-lang-available', pageLangs.join(' '));
      doc.documentElement.setAttribute('data-lang-available', pageLangs.join(' '));
    } else {
      doc.body.removeAttribute('data-lang-available');
      doc.documentElement.removeAttribute('data-lang-available');
    }
    // Language names travel with the page for the language switcher.
    const names = {};
    window.PresetRegistry.getLanguages().forEach((l) => {
      if (pageLangs.includes(l.code) && l.name && l.name !== l.code.toUpperCase()) names[l.code] = l.name;
    });
    if (Object.keys(names).length) doc.body.setAttribute('data-lang-names', JSON.stringify(names));
    else doc.body.removeAttribute('data-lang-names');

    stripComments(doc);
    return { html: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML, libCss };
  }

  // ===================== Save ==========================================

  let saving = false;

  async function saveCurrentFile() {
    if (FigJS.state.currentRawFile) { await saveRawFile(); return; }
    if (!FigJS.state.currentFilePath) { FigJS.setStatus('No file loaded.', '#ff9800'); return; }
    if (saving) return;
    saving = true;
    FigJS.setStatus('Saving');
    try {
      // Text being edited in place reaches the model only when editing ends.
      await FigJS.i18n.commitActiveEditing();
      const { html, libCss } = buildDocument();

      const cssRes = await fetch('/api/library/update-css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ css: libCss }),
      });
      if (!cssRes.ok) console.warn('[library] could not update library.css');

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: FigJS.state.currentFilePath, htmlContent: html }),
      });
      const result = await res.json();
      if (result.status !== 'success') throw new Error(result.error || 'unknown error');

      if (FigJS.library.pushMasters) await FigJS.library.pushMasters();

      FigJS.clearUnsaved();
      FigJS.setStatus('Saved', '#4caf50');
      FigJS.library.refreshList();
    } catch (e) {
      console.error(e);
      FigJS.setStatus('Save failed: ' + e.message, '#f44336');
    } finally {
      saving = false;
    }
  }

  // ===================== Install =======================================

  function install() {
    fileTreeEl = document.getElementById('file-tree');
    pageCodeView = document.getElementById('page-code-view');
    rawFileView = document.getElementById('raw-file-view');
    rawFileName = document.getElementById('raw-file-name');
    rawFileBody = document.getElementById('raw-file-content');

    document.getElementById('btn-new-draft').addEventListener('click', newPage);
    document.getElementById('btn-save').addEventListener('click', saveCurrentFile);
    document.getElementById('save-raw-file').addEventListener('click', saveRawFile);
    document.getElementById('close-raw-file').addEventListener('click', closeRawFile);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key || '').toLowerCase() === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    });
  }

  function lastFile() {
    try { return localStorage.getItem(LAST_FILE_KEY) || ''; } catch (e) { return ''; }
  }

  FigJS.files = {
    install,
    refreshTree,
    save: saveCurrentFile,
    loadFile,
    loadRawFile,
    newPage,
    buildDocument,
    lastFile,
  };
})();
