// Markdown block, edited in place like text:
//   - double-click makes the render contenteditable; each source line is a
//     .md-line div, markers stay visible and the content between them is
//     styled;
//   - every input rebuilds the lines from their text and restores the caret
//     by (line, offset);
//   - blur or Ctrl+Enter commits, Esc reverts;
//   - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y use an internal stack (native undo
//     can't survive the rebuilds).
// Selection is read through the canvas iframe's window (getWin()).

window.PresetPlugins = window.PresetPlugins || [];

window.PresetPlugins.push({
  id: 'preset-md-block',
  plugin: function (editor) {
    const {
      registerDependency,
      registerPresetSchemas,
      registerComponentSettings,
      registerComponentPreset,
      icons
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/md-block.css');
    registerDependency('js',  '/assets/js/md-block.js');

    const SAMPLE = [
      '# Markdown block',
      '',
      'A **single-block** rich-text element.',
      '',
      'Double-click anywhere inside this block to edit. The markdown',
      'markers stay visible while you type; formatting is applied live.',
      '',
      '## Heading levels',
      '',
      '### H3',
      '#### H4',
      '##### H5',
      '###### H6',
      '',
      '## Lists',
      '',
      '- First item',
      '- Second item',
      '- Third item',
      '',
      '1. Ordered',
      '2. Also ordered',
      '',
      '> Blockquotes are handy for pull-quotes and asides.',
      '',
      '```js',
      'const greeting = "hello";',
      'console.log(greeting);',
      '```',
      '',
      '---',
      '',
      'Trailing paragraph so you can see how spacing resolves.'
    ].join('\n');

    registerComponentSettings('md-block', {
      title: 'Markdown block',
      properties: [
        { key: '--md-max-width', label: 'Max width',     type: 'text',  default: '68ch' },
        { key: '--md-font',      label: 'Body font',     type: 'text',  placeholder: 'inherit', default: '' },
        { key: '--md-size',      label: 'Body size',     type: 'range', min: 0.75, max: 1.5, step: 0.05, unit: 'rem', default: 1 },
        { key: '--md-line',      label: 'Line height',   type: 'range', min: 1.2, max: 2.2, step: 0.05, default: 1.65 },
        { key: '--md-fg',        label: 'Text',          type: 'color' },
        { key: '--md-muted',     label: 'Muted',         type: 'color' },
        { key: '--md-link',      label: 'Link',          type: 'color' },
        { key: '--md-strong',    label: 'Bold text',     type: 'color' },
        { key: '--md-heading',   label: 'Headings',      type: 'color' },
        { key: '--md-rule',      label: 'Rule',          type: 'color-alpha' },
        { key: '--md-code-bg',   label: 'Code bg',       type: 'color-alpha' },
        { key: '--md-code-fg',   label: 'Code fg',       type: 'color' },
        { key: '--md-quote-bar', label: 'Quote bar',     type: 'color' },
        { key: '--md-bullet',    label: 'Bullet',        type: 'color', default: '#ffb74d' },
        { key: '--md-footnote',  label: 'Footnote',      type: 'color', default: '#ffb74d' },
        { key: '--md-h-space',   label: 'Heading space', type: 'range', min: 0, max: 4, step: 0.1, unit: 'em', default: 1.4 },
        { key: '--md-p-space',   label: 'Para space',    type: 'range', min: 0, max: 3, step: 0.1, unit: 'em', default: 1 },
        ...window.PresetRegistry.linkArrivalProperties({ align: 'center', highlight: 'fill' })
      ]
    });

    registerComponentPreset(editor, {
      id: 'md-block',
      label: 'Markdown Block',
      category: 'Content',
      media: icons.text,
      classes: ['md-block'],
      defaultAttributes: { 'data-md': SAMPLE },
      blockAttributes:   { 'data-md': SAMPLE },
      traits: [
        { type: 'md-textarea', name: 'data-md', label: 'Markdown source (default language)',
          category: 'Content' },
        { type: 'md-textarea', name: 'data-md-i18n',
          label: 'Translations (JSON, written by the toolbar language switcher)',
          category: 'Content' },
      ],

      view: {
        events: { dblclick: 'onDoubleClick' },

      init() {
        this.model.set('editable', false);
        this.listenTo(this.model, 'change:attributes', this.onMarkdownChanged);

        // Re-render every block when the canvas language changes.
        const installLangWatch = () => {
          const doc = editor.Canvas.getDocument();
          if (!doc || !doc.body) return;
          if (this.__mdLangObserver) this.__mdLangObserver.disconnect();
          this.__mdLangObserver = new MutationObserver(() => {
            if (this.__mdEditing) return;
            this.renderMarkdown();
          });
          this.__mdLangObserver.observe(doc.body, {
            attributes: true,
            attributeFilter: ['data-lang'],
          });
        };
        editor.onReady(installLangWatch);
      },

      onRender() {
        this.renderMarkdown();
      },

// Runtime readiness: a block can render before md-block.js has loaded,
// or before ensureDeps() has ever injected it. The retry re-renders when
// the runtime appears and injects the dependency after a grace period.

        __scheduleRuntimeRetry() {
          if (this.__mdRuntimeRetry) return;

          const started = Date.now();
          const FORCE_AFTER = 1200;
          const GIVE_UP_AFTER = 15000;
          let forced = false;

          const tick = () => {
            this.__mdRuntimeRetry = null;

            // View disposed.
            if (!this.el || !this.el.isConnected) return;

            if (this.getRuntime()) {
              if (!this.__mdEditing) {
                try { this.renderMarkdown(); } catch (e) { console.error(e); }
              }
              return;
            }

            // No dependency injection has run yet: force one, once.
            if (!forced && Date.now() - started > FORCE_AFTER) {
              forced = true;
              try {
                if (window.FigJS && FigJS.canvas) {
                  if (FigJS.canvas.ensureDeps) FigJS.canvas.ensureDeps();
                  if (FigJS.canvas.syncHead)   FigJS.canvas.syncHead();
                }
              } catch (e) { }
            }

            if (Date.now() - started > GIVE_UP_AFTER) return;
            this.__mdRuntimeRetry = setTimeout(tick, 100);
          };

          this.__mdRuntimeRetry = setTimeout(tick, 60);
        },

        __cancelRuntimeRetry() {
          if (this.__mdRuntimeRetry) {
            clearTimeout(this.__mdRuntimeRetry);
            this.__mdRuntimeRetry = null;
          }
        },

        // Window / selection scope: getSelection() must use the canvas iframe's
        // window; the editor window's selection is empty there.
        getRender() {
          return this.el
            ? this.el.querySelector(':scope > .md-block-render')
            : null;
        },

        getWin() {
          const render = this.getRender();
          if (render && render.ownerDocument && render.ownerDocument.defaultView) {
            return render.ownerDocument.defaultView;
          }
          return window;
        },

        getSel() {
          const win = this.getWin();
          return win && win.getSelection ? win.getSelection() : null;
        },

        // ----------------------------------------------------------
        // Final render (non-editing)
        // ----------------------------------------------------------

      renderMarkdown() {
        if (this.__mdEditing) return;

        const el = this.el;
        const attrs = this.model.getAttributes() || {};
        const MdBlock = this.getRuntime();

        // onRender can run before the injected script executes.
        if (!MdBlock) this.__scheduleRuntimeRetry();
        else          this.__cancelRuntimeRetry();

          const DEFAULT_LANG = 'en';
          const lang = (editor.Canvas.getBody() &&
                        editor.Canvas.getBody().getAttribute('data-lang')) || DEFAULT_LANG;

          // Source for the canvas language: data-md, or data-md-i18n[lang] with data-md as fallback.
          let md = attrs['data-md'] || '';
          if (lang !== DEFAULT_LANG) {
            const rawI18n = attrs['data-md-i18n'] || '';
            if (rawI18n) {
              try {
                const map = JSON.parse(rawI18n);
                if (map && typeof map === 'object' && typeof map[lang] === 'string') {
                  md = map[lang];
                }
              } catch (e) { }
            }
          }

          // The model is the source; the DOM attributes follow it.
          if (el.getAttribute('data-md') !== attrs['data-md']) {
            el.setAttribute('data-md', attrs['data-md'] || '');
          }
          if (el.getAttribute('data-md-i18n') !== attrs['data-md-i18n']) {
            if (attrs['data-md-i18n']) el.setAttribute('data-md-i18n', attrs['data-md-i18n']);
            else el.removeAttribute('data-md-i18n');
          }

          el.querySelectorAll(':scope > .md-block-render').forEach((n) => n.remove());

          const render = el.ownerDocument.createElement('div');
          render.className = 'md-block-render';
          render.setAttribute('data-gjs-selectable', 'false');
          render.setAttribute('data-gjs-hoverable',  'false');
          render.setAttribute('data-gjs-draggable',  'false');
          render.setAttribute('data-gjs-droppable',  'false');
          render.setAttribute('data-gjs-copyable',   'false');

          render.innerHTML = MdBlock
            ? MdBlock.render(md)
            : '<p style="color:#f44336">Markdown runtime not loaded.</p>';

          el.appendChild(render);
          // Links to targets elsewhere on the page are not marked broken.
          if (MdBlock && MdBlock.relink) requestAnimationFrame(() => MdBlock.relink(render));
        },

        getRuntime() {
          const win = this.getWin();
          return (win && win.MdBlock) || window.MdBlock || null;
        },

        // ----------------------------------------------------------
        // Enter edit
        // ----------------------------------------------------------

        onDoubleClick(event) {
          if (this.__mdEditing) return;
          event.preventDefault();
          event.stopPropagation();

          // The clicked line gets the caret after the rebuild.
          const clickCtx = this.findClickContext(event);
          this.enterEdit(clickCtx);
        },

        // { lineIdx } of the clicked line, or null.
        findClickContext(event) {
          const render = this.getRender();
          if (!render) return null;

          const doc = render.ownerDocument;
          let range = null;

          if (doc.caretRangeFromPoint) {
            range = doc.caretRangeFromPoint(event.clientX, event.clientY);
          } else if (doc.caretPositionFromPoint) {
            const pos = doc.caretPositionFromPoint(event.clientX, event.clientY);
            if (pos) {
              range = doc.createRange();
              range.setStart(pos.offsetNode, pos.offset);
              range.collapse(true);
            }
          }
          if (!range) return null;

          let node = range.startContainer;
          while (node && node !== render && node.parentNode !== render) {
            node = node.parentNode;
          }
          if (!node || node === render || !node.tagName) return null;

          const blocks = Array.from(render.children);
          const lineIdx = blocks.indexOf(node);
          return lineIdx >= 0 ? { lineIdx } : null;
        },

        enterEdit(clickCtx) {
          if (this.__mdEditing) return;

          const render = this.getRender();
          if (!render) return;

          const MdBlock = this.getRuntime();
          if (!MdBlock || typeof MdBlock.renderEditableLine !== 'function') {
            console.error('[md-block] runtime missing renderEditableLine.');
            return;
          }

          // Scroll positions, so the rebuild doesn't jump.
          const win = this.getWin();
          const doc = render.ownerDocument;
          const saved = {
            render: render.scrollTop,
            docEl:  doc.documentElement ? doc.documentElement.scrollTop : 0,
            body:   doc.body ? doc.body.scrollTop : 0,
            iframe: win ? win.scrollY : 0,
            outer:  window.scrollY
          };

          this.__mdEditing = true;
          // Edits the source of the language the canvas shows.
          const DEFAULT_LANG = 'en';
          const bodyLang = (editor.Canvas.getBody() &&
                            editor.Canvas.getBody().getAttribute('data-lang')) || DEFAULT_LANG;
          const attrs = this.model.getAttributes() || {};
          let source = attrs['data-md'] || '';
          if (bodyLang !== DEFAULT_LANG) {
            try {
              const map = JSON.parse(attrs['data-md-i18n'] || '{}');
              if (map && typeof map[bodyLang] === 'string') source = map[bodyLang];
            } catch (e) { }
          }
          this.__mdOriginal = source;

          this.__mdPrevDraggable = this.model.get('draggable');
          this.model.set('draggable', false);

          this.__mdUndoStack = [];
          this.__mdRedoStack = [];

          this.rebuildLines(this.__mdOriginal.split('\n'));

          render.contentEditable = 'true';
          render.classList.add('is-editing');

          this.__mdHandlers = {
            input:       this.onInput.bind(this),
            beforeinput: this.onBeforeInput.bind(this),
            keydown:     this.onKeyDown.bind(this),
            paste:       this.onPaste.bind(this),
            drop:        this.onDrop.bind(this),
            focusout:    this.onFocusOut.bind(this),
            mousedown:   this.onMouseDown.bind(this),
            click:       this.onClickCapture.bind(this)
          };

          render.addEventListener('input',       this.__mdHandlers.input);
          render.addEventListener('beforeinput', this.__mdHandlers.beforeinput);
          render.addEventListener('keydown',     this.__mdHandlers.keydown);
          render.addEventListener('paste',       this.__mdHandlers.paste);
          render.addEventListener('drop',        this.__mdHandlers.drop);
          render.addEventListener('focusout',    this.__mdHandlers.focusout);
          render.addEventListener('mousedown',   this.__mdHandlers.mousedown, true);
          render.addEventListener('click',       this.__mdHandlers.click, true);

          try { render.focus({ preventScroll: true }); }
          catch (e) { render.focus(); }

          const lines = render.querySelectorAll(':scope > .md-line');
          if (clickCtx && lines[clickCtx.lineIdx]) {
            this.placeCaretAtStartOf(lines[clickCtx.lineIdx]);
          } else if (lines.length) {
            this.placeCaretAtStartOf(lines[0]);
          }

          render.scrollTop = saved.render;
          if (doc.documentElement) doc.documentElement.scrollTop = saved.docEl;
          if (doc.body) doc.body.scrollTop = saved.body;
          if (win && typeof win.scrollTo === 'function') {
            win.scrollTo(0, saved.iframe);
          }
          window.scrollTo(0, saved.outer);
        },

        // ----------------------------------------------------------
        // Line rebuild
        // ----------------------------------------------------------

        rebuildLines(sources) {
          const render = this.getRender();
          if (!render) return;
          const MdBlock = this.getRuntime();
          if (!MdBlock) return;

          render.innerHTML = '';

          const list = sources.length ? sources : [''];

          // Refs and anchors, so broken references render as .md-xref-broken.
          const context = this.collectContext(list.join('\n'));

          list.forEach((src) => {
            const lineEl = render.ownerDocument.createElement('div');
            const info = MdBlock.renderEditableLine(src, context);
            lineEl.className = 'md-line ' + info.modifier;
            lineEl.innerHTML = info.html;
            render.appendChild(lineEl);
          });
        },

        // { refs, anchors }, from the runtime (md-block.js).
        collectContext(md) {
          const rt = this.getRuntime();
          return rt && rt.collectContext ? rt.collectContext(md) : { refs: null, anchors: null };
        },

        readCurrentSources() {
          const render = this.getRender();
          if (!render) return [''];

          const sources = [];

          Array.from(render.childNodes).forEach((child) => {
            if (child.nodeType === 3) {
              // Bare text nodes: a browser-inserted line break makes a new line.
              child.textContent.split('\n').forEach((s) => sources.push(s));
              return;
            }
            if (child.nodeType !== 1) return;

            if (child.tagName === 'BR') { sources.push(''); return; }

            if (child.classList && child.classList.contains('md-line')) {
              // textContent keeps spaces (pre-wrap); a multi-line paste in one line node splits.
              child.textContent.split('\n').forEach((s) => sources.push(s));
              return;
            }

            child.textContent.split('\n').forEach((s) => sources.push(s));
          });

          // Every typed or pasted line is a source line: no collapsing or trimming.
          return sources.length ? sources : [''];
        },

        // ----------------------------------------------------------
        // Caret capture / restore
        // ----------------------------------------------------------

        captureCaret() {
          const render = this.getRender();
          if (!render) return null;

          const sel = this.getSel();
          if (!sel || !sel.rangeCount) return null;

          const range = sel.getRangeAt(0);
          const lines = render.querySelectorAll(':scope > .md-line');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line !== range.startContainer &&
                !line.contains(range.startContainer)) continue;

            let offset = 0;

            if (range.startContainer === line) {
              for (let j = 0; j < range.startOffset; j++) {
                offset += line.childNodes[j].textContent.length;
              }
            } else {
              const pre = range.cloneRange();
              pre.selectNodeContents(line);
              pre.setEnd(range.startContainer, range.startOffset);
              offset = pre.toString().length;
            }

            return { lineIdx: i, offset };
          }

          return null;
        },

        restoreCaret(pos) {
          if (!pos) return;
          const render = this.getRender();
          if (!render) return;
          const lines = render.querySelectorAll(':scope > .md-line');
          const line = lines[pos.lineIdx];
          if (!line) return;
          this.setCaretCharOffset(line, pos.offset);
        },

        setCaretCharOffset(line, offset) {
          const win = line.ownerDocument.defaultView;
          const walker = line.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let remaining = offset;
          let node;

          while ((node = walker.nextNode())) {
            const len = node.nodeValue.length;
            if (remaining <= len) {
              const r = line.ownerDocument.createRange();
              r.setStart(node, remaining);
              r.collapse(true);
              const sel = win.getSelection();
              sel.removeAllRanges();
              sel.addRange(r);
              return;
            }
            remaining -= len;
          }

          const r = line.ownerDocument.createRange();
          r.selectNodeContents(line);
          r.collapse(false);
          const sel = win.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        },

        placeCaretAtEndOf(line) {
          const win = line.ownerDocument.defaultView;
          const r = line.ownerDocument.createRange();
          r.selectNodeContents(line);
          r.collapse(false);
          const sel = win.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        },

        placeCaretAtStartOf(line) {
          const win = line.ownerDocument.defaultView;
          const walker = line.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          const first = walker.nextNode();
          const r = line.ownerDocument.createRange();
          if (first) {
            r.setStart(first, 0);
            r.collapse(true);
          } else {
            r.selectNodeContents(line);
            r.collapse(true);
          }
          const sel = win.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        },

        // Undo / redo snapshots of the source lines and caret.
        // pushUndoSnapshot(coalesce): character edits within 500ms fold into one
        // step; coalesce === false (Enter, line-start Backspace, paste,
        // formatting) always makes its own step.

        pushUndoSnapshot(coalesce) {
          if (!this.__mdUndoStack) this.__mdUndoStack = [];

          const now = Date.now();
          const last = this.__mdUndoStack[this.__mdUndoStack.length - 1];

          if (coalesce !== false && last && now - last.time < 500) {
            last.time = now;
            return;
          }

          this.__mdUndoStack.push({
            sources: this.readCurrentSources(),
            caret: this.captureCaret(),
            time: now
          });

          if (this.__mdUndoStack.length > 200) this.__mdUndoStack.shift();

          if (this.__mdRedoStack) this.__mdRedoStack.length = 0;
        },

        undo() {
          if (!this.__mdUndoStack || !this.__mdUndoStack.length) return;

          const snap = this.__mdUndoStack.pop();
          if (!this.__mdRedoStack) this.__mdRedoStack = [];

          this.__mdRedoStack.push({
            sources: this.readCurrentSources(),
            caret: this.captureCaret()
          });

          this.rebuildLines(snap.sources);
          if (snap.caret) this.restoreCaret(snap.caret);
        },

        redo() {
          if (!this.__mdRedoStack || !this.__mdRedoStack.length) return;

          const snap = this.__mdRedoStack.pop();
          if (!this.__mdUndoStack) this.__mdUndoStack = [];

          this.__mdUndoStack.push({
            sources: this.readCurrentSources(),
            caret: this.captureCaret(),
            time: Date.now()
          });

          this.rebuildLines(snap.sources);
          if (snap.caret) this.restoreCaret(snap.caret);
        },

        // ----------------------------------------------------------
        // Input
        // ----------------------------------------------------------

        onInput(event) {
          if (!this.__mdEditing) return;
          if (event.isComposing) return;
          if (event.inputType === 'insertCompositionText') return;

          const caret = this.captureCaret();
          const sources = this.readCurrentSources();
          this.rebuildLines(sources);
          this.restoreCaret(caret);
        },

        onBeforeInput(event) {
          if (!this.__mdEditing) return;

          // No snapshots mid-IME composition.
          if (event.inputType &&
              event.inputType.indexOf('Composition') !== -1) {
            return;
          }

          if (event.inputType === 'insertParagraph' ||
              event.inputType === 'insertLineBreak') {
            event.preventDefault();
            this.pushUndoSnapshot(false);
            this.splitCurrentLine();
            return;
          }

          if (event.inputType === 'deleteContentBackward') {
            // Only a collapsed caret at column 0 merges with the previous line.
            const sel = this.getSel();
            const hasSelection =
              sel && sel.rangeCount && !sel.getRangeAt(0).collapsed;

            if (hasSelection) {
              this.pushUndoSnapshot();
              return;
            }

            const caret = this.captureCaret();
            if (caret && caret.offset === 0 && caret.lineIdx > 0) {
              event.preventDefault();
              this.pushUndoSnapshot(false);
              this.mergeLineWithPrevious(caret.lineIdx);
              return;
            }
          }

          // Snapshot before the browser mutates.
          this.pushUndoSnapshot();
        },

        splitCurrentLine() {
          const caret = this.captureCaret();
          if (!caret) return;

          const sources = this.readCurrentSources();
          const current = sources[caret.lineIdx] || '';
          const before = current.slice(0, caret.offset);
          const after = current.slice(caret.offset);

          sources.splice(caret.lineIdx, 1, before, after);
          this.rebuildLines(sources);

          this.restoreCaret({ lineIdx: caret.lineIdx + 1, offset: 0 });
        },

        mergeLineWithPrevious(lineIdx) {
          const sources = this.readCurrentSources();
          if (lineIdx <= 0 || lineIdx >= sources.length) return;

          const prev = sources[lineIdx - 1];
          const cur = sources[lineIdx];
          const merged = prev + cur;

          sources.splice(lineIdx - 1, 2, merged);
          this.rebuildLines(sources);

          this.restoreCaret({ lineIdx: lineIdx - 1, offset: prev.length });
        },

        // ----------------------------------------------------------
        // Keyboard shortcuts
        // ----------------------------------------------------------

        onKeyDown(event) {
          if (!this.__mdEditing) return;

          if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEdit();
            return;
          }

          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.commitEdit();
            return;
          }

          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const k = event.key.toLowerCase();

            if (k === 'z') {
              event.preventDefault();
              if (event.shiftKey) this.redo(); else this.undo();
              return;
            }
            if (k === 'y' && !event.shiftKey) {
              event.preventDefault();
              this.redo();
              return;
            }

            if (!event.shiftKey) {
              if (k === 'b') { event.preventDefault(); this.wrapSelection('**', '**'); return; }
              if (k === 'i') { event.preventDefault(); this.wrapSelection('*', '*');   return; }
              if (k === 'k') { event.preventDefault(); this.wrapSelectionLink();        return; }
            }
          }
        },

        wrapSelection(open, close) {
          const sel = this.getSel();
          if (!sel || !sel.rangeCount) return;

          this.pushUndoSnapshot(false);

          const range = sel.getRangeAt(0);
          const selected = range.toString();
          const replacement = open + selected + close;
          const doc = this.getRender().ownerDocument;

          try {
            doc.execCommand('insertText', false, replacement);
          } catch (e) {
            range.deleteContents();
            range.insertNode(doc.createTextNode(replacement));
          }

          if (!selected) {
            const caret = this.captureCaret();
            if (caret) {
              this.restoreCaret({
                lineIdx: caret.lineIdx,
                offset: caret.offset - close.length
              });
            }
          }
        },

        wrapSelectionLink() {
          const sel = this.getSel();
          if (!sel || !sel.rangeCount) return;

          const range = sel.getRangeAt(0);
          const selected = range.toString();
          const url = window.prompt('Link URL:', 'https://');
          if (!url) return;

          this.pushUndoSnapshot(false);

          const label = selected || url;
          const replacement = '[' + label + '](' + url + ')';
          const doc = this.getRender().ownerDocument;

          try {
            doc.execCommand('insertText', false, replacement);
          } catch (e) {
            range.deleteContents();
            range.insertNode(doc.createTextNode(replacement));
          }
        },

        // ----------------------------------------------------------
        // Paste / drop
        // ----------------------------------------------------------

        onPaste(event) {
          if (!this.__mdEditing) return;
          const cb = event.clipboardData;
          if (!cb) return;
          const text = cb.getData('text/plain');
          if (!text) return;
          event.preventDefault();
          this.pushUndoSnapshot(false);
          this.insertPlainText(text);
        },

        onDrop(event) {
          if (!this.__mdEditing) return;
          const dt = event.dataTransfer;
          if (!dt) return;
          const text = dt.getData('text/plain');
          if (!text) return;
          event.preventDefault();
          this.pushUndoSnapshot(false);
          this.insertPlainText(text);
        },

        insertPlainText(text) {
          const render = this.getRender();
          if (!render) return;

          // Normalize line endings first.
          const normalized = String(text == null ? '' : text).replace(/\r\n?/g, '\n');

          // DOM point -> { lineIdx, offset }; a paste over a selection needs both
          // ends.
          const lines = render.querySelectorAll(':scope > .md-line');
          const pointToCaret = (node, nodeOffset) => {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line !== node && !line.contains(node)) continue;
              let charOffset = 0;
              if (node === line) {
                for (let j = 0; j < nodeOffset; j++) {
                  const c = line.childNodes[j];
                  if (c) charOffset += c.textContent.length;
                }
              } else {
                const r = line.ownerDocument.createRange();
                r.selectNodeContents(line);
                r.setEnd(node, nodeOffset);
                charOffset = r.toString().length;
              }
              return { lineIdx: i, offset: charOffset };
            }
            return null;
          };

          const sel = this.getSel();
          let start = null;
          let end = null;
          if (sel && sel.rangeCount) {
            const r = sel.getRangeAt(0);
            start = pointToCaret(r.startContainer, r.startOffset);
            end   = pointToCaret(r.endContainer,   r.endOffset);
          }

          const sources = this.readCurrentSources();

          if (!start) start = { lineIdx: 0, offset: 0 };
          if (!end)   end = start;

          const startLine = sources[start.lineIdx] || '';
          const endLine   = sources[end.lineIdx]   || '';
          const before = startLine.slice(0, start.offset);
          const after  = endLine.slice(end.offset);
          const replacedSpan = end.lineIdx - start.lineIdx + 1;

          // Empty paste deletes the selection, if any.
          if (normalized === '') {
            if (start.lineIdx === end.lineIdx && start.offset === end.offset) return;
            sources.splice(start.lineIdx, replacedSpan, before + after);
            this.rebuildLines(sources);
            this.restoreCaret({ lineIdx: start.lineIdx, offset: before.length });
            return;
          }

          const pastedLines = normalized.split('\n');

          if (pastedLines.length === 1) {
            sources.splice(start.lineIdx, replacedSpan, before + pastedLines[0] + after);
            this.rebuildLines(sources);
            this.restoreCaret({
              lineIdx: start.lineIdx,
              offset: (before + pastedLines[0]).length
            });
            return;
          }

          // Multi-line paste keeps the text before and after the selection.
          const first  = pastedLines[0];
          const last   = pastedLines[pastedLines.length - 1];
          const middle = pastedLines.slice(1, -1);
          const replacement = [before + first].concat(middle, [last + after]);

          sources.splice(start.lineIdx, replacedSpan, ...replacement);
          this.rebuildLines(sources);

          this.restoreCaret({
            lineIdx: start.lineIdx + replacement.length - 1,
            offset: last.length
          });
        },

        // ----------------------------------------------------------
        // Drag-select safety
        // ----------------------------------------------------------

        onMouseDown(event) {
          event.stopPropagation();
        },

        onClickCapture(event) {
          const link = event.target.closest && event.target.closest('a');
          if (link) event.preventDefault();
        },

        // ----------------------------------------------------------
        // Blur / commit / cancel
        // ----------------------------------------------------------

        onFocusOut(event) {
          const to = event && event.relatedTarget;
          const render = this.getRender();
          if (to && render && render.contains(to)) return;
          this.commitEdit();
        },

        commitEdit() {
          if (!this.__mdEditing) return;

          const sources = this.readCurrentSources();
          const newMd = sources.join('\n');

          this.cleanupEdit();

          const DEFAULT_LANG = 'en';
          const bodyLang =
            (editor.Canvas.getBody() &&
            editor.Canvas.getBody().getAttribute('data-lang')) || DEFAULT_LANG;

          const attrs = this.model.getAttributes() || {};

          let dataMd = attrs['data-md'] || '';
          let i18n = {};
          try { i18n = JSON.parse(attrs['data-md-i18n'] || '{}'); } catch (e) { i18n = {}; }
          if (!i18n || typeof i18n !== 'object') i18n = {};

          if (bodyLang === DEFAULT_LANG) {
            dataMd = newMd;
            // The default language lives in data-md; an i18n copy would shadow it.
            delete i18n[DEFAULT_LANG];
          } else {
            i18n[bodyLang] = newMd;
          }

          const updates = {};
          if (dataMd !== (attrs['data-md'] || '')) updates['data-md'] = dataMd;

          const isEmptyMap = Object.keys(i18n).length === 0;
          const currentI18nStr = attrs['data-md-i18n'] || '';
          const nextI18nStr = isEmptyMap ? '' : JSON.stringify(i18n);

          if (isEmptyMap && currentI18nStr) {
            this.model.removeAttributes(['data-md-i18n']);
          } else if (!isEmptyMap && nextI18nStr !== currentI18nStr) {
            updates['data-md-i18n'] = nextI18nStr;
          }

          if (Object.keys(updates).length) {
            this.model.addAttributes(updates);
          } else {
            // Unchanged model: re-render to match the committed DOM.
            this.renderMarkdown();
          }
        },

        cancelEdit() {
          if (!this.__mdEditing) return;

          const original = this.__mdOriginal || '';
          this.cleanupEdit();

          const render = this.getRender();
          const MdBlock = this.getRuntime();
          if (render && MdBlock) {
            render.innerHTML = MdBlock.render(original);
            if (MdBlock.relink) MdBlock.relink(render);
          }
        },

        cleanupEdit() {
          const render = this.getRender();
          const h = this.__mdHandlers;

          if (render && h) {
            render.removeEventListener('input',       h.input);
            render.removeEventListener('beforeinput', h.beforeinput);
            render.removeEventListener('keydown',     h.keydown);
            render.removeEventListener('paste',       h.paste);
            render.removeEventListener('drop',        h.drop);
            render.removeEventListener('focusout',    h.focusout);
            render.removeEventListener('mousedown',   h.mousedown, true);
            render.removeEventListener('click',       h.click, true);
            render.contentEditable = 'false';
            render.classList.remove('is-editing');
          }

          if (this.__mdPrevDraggable !== undefined) {
            this.model.set('draggable', this.__mdPrevDraggable);
          }

          this.__mdEditing = false;
          this.__mdOriginal = null;
          this.__mdHandlers = null;
          this.__mdPrevDraggable = undefined;
          this.__mdUndoStack = null;
          this.__mdRedoStack = null;
        },

        onMarkdownChanged() {
          if (this.__mdEditing) return;
          this.renderMarkdown();
        },

        removed() {
          this.__cancelRuntimeRetry();
          if (this.__mdEditing) this.cleanupEdit();
        },
      }
    });
  }
});