// Game embeds. The canvas shows a card (source, threads / PWA needs) and
// opens the game in a new tab, served with the site's headers; neither
// the canvas nor Preview runs it.
//   <div class="game-embed" data-game-url="..." data-threads="auto" ...></div>
// Game link: a plain text link that opens a game in a new tab, as the
// embed's own link does (<a class="game-link" target="_blank">).
// Runtime: game-embed.js. Godot shell: tools/custom_shell.html.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-game-embed',
  plugin: function (editor) {
    const { registerDependency, registerComponentPreset, icons } = window.PresetRegistry;

    registerDependency('js', '/assets/js/game-embed.js');

    let exportsCache = null;
    async function fetchExports(force) {
      if (exportsCache && !force) return exportsCache;
      try {
        const res = await fetch('/api/godot-exports', { cache: 'no-store' });
        exportsCache = (await res.json()).exports || [];
      } catch (e) { exportsCache = []; }
      return exportsCache;
    }

    function formatSize(bytes) {
      if (!bytes) return '';
      if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
      return Math.round(bytes / 1024) + ' KB';
    }

    function badgesFor(x) {
      const out = [];
      if (x.threads) out.push('<span class="fig-badge fig-badge--warn" title="Needs SharedArrayBuffer (cross-origin isolation)">threads</span>');
      if (x.pwa) out.push('<span class="fig-badge fig-badge--ok" title="Exported as a Progressive Web App">PWA</span>');
      if (x.ensureCoiHeaders) out.push('<span class="fig-badge" title="Service worker adds COOP/COEP when opened standalone">SW isolation</span>');
      return out.join('');
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function pickExport(onPick) {
      const list = await fetchExports(true);
      const body = document.createElement('div');
      body.className = 'fig-picker-list';
      if (!list.length) {
        body.innerHTML = '<div class="fig-empty">No exports found under <code>public/games/&lt;folder&gt;/</code>. ' +
          'Export from Godot into a new folder there, or paste a URL.</div>';
      }
      let dialog = null;
      list.forEach((x) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fig-picker-item';
        btn.innerHTML =
          (x.icon ? `<img src="${escapeHtml(x.icon)}" alt="">` : '<span class="fig-picker-noicon"></span>') +
          `<span class="fig-picker-text"><strong>${escapeHtml(x.folder)}</strong>` +
          `<span class="fig-picker-sub">${escapeHtml(x.url)}${x.size ? ', ' + formatSize(x.size) : ''}</span>` +
          `<span class="fig-picker-badges">${badgesFor(x)}</span></span>`;
        btn.addEventListener('click', () => { dialog.close(); onPick(x); });
        body.appendChild(btn);
      });

      dialog = FigJS.dialog.open({
        title: 'Choose a game',
        body,
        actions: [
          { label: 'Paste URL', onClick: async () => {
            const v = await FigJS.dialog.prompt({
              title: 'Embed URL',
              label: 'Godot HTML path (/games/name/index.html) or a third-party URL such as an itch.io embed',
              placeholder: 'https://',
            });
            if (v && v.trim()) onPick({ url: v.trim(), folder: '', threads: null, pwa: false });
          } },
          { label: 'Cancel' },
        ],
      });
    }

    function applyPick(model, choice) {
      const url = choice.url || '';
      const attrs = { 'data-game-url': url };
      const itch = /itch\.io/.test(url);
      let sameOrigin = false;
      try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (e) {}
      attrs['data-embed-type'] = itch ? 'itch' : (sameOrigin ? 'self-hosted' : '');
      attrs['data-threads'] = choice.threads == null ? 'auto' : String(!!choice.threads);
      attrs['data-pwa'] = choice.pwa ? 'true' : '';
      if (choice.folder && !model.getAttributes()['data-title']) attrs['data-title'] = choice.folder;
      model.addAttributes(attrs);
    }

    registerComponentPreset(editor, {
      id: 'godot-embed',
      label: 'Game embed (Godot / itch.io)',
      category: 'Embeds',
      media: icons.embed,
      classes: ['game-embed'],
      alternateClasses: ['embed', 'godot-embed'],

      // Every key the runtime reads.
      defaultAttributes: {
        'data-game-url': '',
        'data-embed-type': '',
        'data-title': '',
        'data-threads': 'auto',
        'data-pwa': '',
        'data-boot': 'click',
        'data-aspect': '16 / 9',
        'data-max-width': '100%',
        'data-radius': '8px',
        'data-poster': '',
        'data-bg-color': '#0b0b0b',
        'data-overlay-bg': '#1a1a1a',
        'data-overlay-text': '#dddddd',
        'data-button-bg': '#ffffff',
        'data-button-text': '#000000',
        'data-button-label': 'Play',
        'data-open-link': '',
        'data-open-label': '',
        'data-scroll': 'false',
        'data-allow-fullscreen': 'true',
        'data-controls': 'true',
        'data-confirm-close': 'true',
        'data-return-on-quit': 'true',
      },

      traits: [
        { type: 'button', name: 'browse', label: 'Game', text: 'Choose', category: 'Source',
          command: (ed, trait) => {
            const comp = trait && trait.target ? trait.target : ed.getSelected();
            if (comp) pickExport((choice) => applyPick(comp, choice));
          } },
        { type: 'text', name: 'data-game-url', label: 'URL', placeholder: '/games/name/index.html', category: 'Source' },
        { type: 'text', name: 'data-title', label: 'Title', placeholder: 'Shown on the overlay', category: 'Source' },
        { type: 'select', name: 'data-embed-type', label: 'Kind', category: 'Source', options: [
          { id: '',            name: 'Auto-detect' },
          { id: 'self-hosted', name: 'Self-hosted Godot' },
          { id: 'itch',        name: 'itch.io' },
          { id: 'external',    name: 'Other site' },
        ] },
        { type: 'select', name: 'data-threads', label: 'Threads', category: 'Source', options: [
          { id: 'auto',  name: 'Auto (self-hosted = yes)' },
          { id: 'true',  name: 'Needs threads (SharedArrayBuffer)' },
          { id: 'false', name: 'Single-threaded build' },
        ] },
        { type: 'checkbox', name: 'data-pwa', label: 'Installable (PWA export)', valueTrue: 'true', valueFalse: '', category: 'Source' },

        { type: 'select', name: 'data-boot', label: 'Start', category: 'Behaviour', options: [
          { id: 'click', name: 'Click to play' },
          { id: 'hover', name: 'On hover' },
          { id: 'auto',  name: 'On page load' },
        ] },
        { type: 'checkbox', name: 'data-allow-fullscreen', label: 'Allow fullscreen', valueTrue: 'true', valueFalse: 'false', category: 'Behaviour' },
        { type: 'checkbox', name: 'data-controls', label: 'Show fullscreen / close buttons', valueTrue: 'true', valueFalse: 'false', category: 'Behaviour' },
        { type: 'checkbox', name: 'data-confirm-close', label: 'Confirm before closing', valueTrue: 'true', valueFalse: 'false', category: 'Behaviour' },
        { type: 'checkbox', name: 'data-return-on-quit', label: 'Show overlay after quit', valueTrue: 'true', valueFalse: 'false', category: 'Behaviour' },
        { type: 'checkbox', name: 'data-scroll', label: 'Allow scrolling inside', valueTrue: 'true', valueFalse: 'false', category: 'Behaviour' },

        { type: 'text', name: 'data-aspect', label: 'Aspect ratio', placeholder: '16 / 9', category: 'Frame' },
        { type: 'text', name: 'data-max-width', label: 'Max width', placeholder: '100%', category: 'Frame' },
        { type: 'text', name: 'data-radius', label: 'Corner radius', placeholder: '8px', category: 'Frame' },
        { type: 'color', name: 'data-bg-color', label: 'Frame background', category: 'Frame' },

        { type: 'text', name: 'data-poster', label: 'Poster image', placeholder: '/assets/images/poster.png', category: 'Overlay' },
        { type: 'color', name: 'data-overlay-bg', label: 'Background', category: 'Overlay' },
        { type: 'color', name: 'data-overlay-text', label: 'Text', category: 'Overlay' },
        { type: 'text', name: 'data-button-label', label: 'Button label', placeholder: 'Play', category: 'Overlay' },
        { type: 'select', name: 'data-open-link', label: 'New tab link', category: 'Overlay', options: [
          { id: '',    name: 'Under the button' },
          { id: 'off', name: 'None' },
        ] },
        { type: 'text', name: 'data-open-label', label: 'Link text', placeholder: 'Open in new tab', category: 'Overlay' },
        { type: 'color', name: 'data-button-bg', label: 'Button background', category: 'Overlay' },
        { type: 'color', name: 'data-button-text', label: 'Button text', category: 'Overlay' },
      ],

      blockAttributes: {
        'data-game-url': '',
        'data-threads': 'auto',
        'data-boot': 'click',
        'data-aspect': '16 / 9',
      },

      view: {
        init() {
          this.listenTo(this.model, 'change:attributes', this.renderEmbed);
        },
        onRender() { this.renderEmbed(); },
        renderEmbed() {
          const el = this.el;
          el.querySelectorAll('[data-gjs-embed-placeholder]').forEach((n) => n.remove());
          if (!el.style.position) el.style.position = 'relative';

          const attrs = this.model.getAttributes();
          const url = (attrs['data-game-url'] || '').trim();
          const title = attrs['data-title'] || '';
          const threads = attrs['data-threads'] || 'auto';
          let kind = attrs['data-embed-type'] || '';
          if (!kind && url) kind = /itch\.io/.test(url) ? 'itch' : 'self-hosted';

          const doc = el.ownerDocument;
          const card = doc.createElement('div');
          card.setAttribute('data-gjs-embed-placeholder', '1');
          card.className = 'fig-embed-card';

          const head = doc.createElement('div');
          head.className = 'fig-embed-card-icon';
          head.innerHTML = icons.embed;
          card.appendChild(head);

          const name = doc.createElement('div');
          name.className = 'fig-embed-card-title';
          name.textContent = url
            ? (title || (kind === 'itch' ? 'itch.io embed' : kind === 'self-hosted' ? 'Self-hosted game' : 'External embed'))
            : 'Game embed: choose a game';
          card.appendChild(name);

          if (url) {
            const meta = doc.createElement('div');
            meta.className = 'fig-embed-card-meta';
            const needsThreads = threads === 'true' || (threads === 'auto' && kind === 'self-hosted');
            const parts = [`start: ${attrs['data-boot'] || 'click'}`, `aspect: ${attrs['data-aspect'] || '16 / 9'}`];
            if (needsThreads) parts.push('threads');
            if (attrs['data-pwa'] === 'true') parts.push('PWA');
            meta.textContent = parts.join(', ');
            card.appendChild(meta);

            const urlLine = doc.createElement('div');
            urlLine.className = 'fig-embed-card-url';
            urlLine.textContent = url;
            card.appendChild(urlLine);
          }

          const actions = doc.createElement('div');
          actions.className = 'fig-embed-card-actions';
          const mkBtn = (label, primary, onClick) => {
            const b = doc.createElement('button');
            b.type = 'button';
            b.textContent = label;
            if (primary) b.className = 'is-primary';
            b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); onClick(); });
            actions.appendChild(b);
          };
          if (url) {
            mkBtn('Play in new tab', true, () => window.open(url, '_blank', 'noopener'));
          }
          mkBtn(url ? 'Change' : 'Choose', !url, () => pickExport((choice) => applyPick(this.model, choice)));
          card.appendChild(actions);
          el.appendChild(card);
        },
      },
    });

    registerComponentPreset(editor, {
      id: 'game-link',
      extend: 'link',
      name: 'Game link',
      label: 'Game link (new tab)',
      category: 'Embeds',
      media: icons.link,
      tagName: 'a',
      classes: ['game-link'],
      defaultAttributes: { href: '', target: '_blank', rel: 'noopener' },
      defaultComponents: 'Play in a new tab',
      traits: [
        { type: 'button', name: 'browse', label: 'Game', text: 'Choose', category: 'Source',
          command: (ed, trait) => {
            const comp = trait && trait.target ? trait.target : ed.getSelected();
            if (comp) pickExport((choice) => comp.addAttributes({ href: choice.url || '' }));
          } },
        { type: 'text', name: 'href', label: 'URL', placeholder: '/games/name/index.html', category: 'Source' },
      ],
    });
  },
});
