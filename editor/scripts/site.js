// Site settings, stored in site.json and editor.config.json (not deployed):
//   Home page      the page "/" serves (a 200 rewrite in public/_redirects)
//   On start       reopen the last page, the home page, or nothing
//   New pages      default language, theme, favicon, colour, description
//   Local servers  ports, opening the browser, sharing on the network
//   FigJS.site.install() / open() / get() / startupPage() / applyDefaultsToPage()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  let cache = null;

  async function load() {
    const data = await (await fetch('/api/site', { cache: 'no-store' })).json();
    cache = data;
    return data;
  }

  async function get() {
    return (cache || await load()).site;
  }

  async function startupPage() {
    let data;
    try { data = await load(); } catch (e) { return FigJS.files.lastFile(); }
    const site = data.site || {};
    const exists = (p) => p && data.pages.includes(p);
    if (site.openOnStart === 'none') return '';
    if (site.openOnStart === 'home') return exists(site.homePage) ? site.homePage : '';
    const last = FigJS.files.lastFile();
    if (exists(last)) return last;
    return exists(site.homePage) ? site.homePage : '';
  }

  function field(label, input, hint) {
    const wrap = document.createElement('label');
    wrap.className = 'fig-field';
    const l = document.createElement('span');
    l.className = 'fig-field-label';
    l.textContent = label;
    wrap.append(l, input);
    if (hint) {
      const h = document.createElement('span');
      h.className = 'fig-hint';
      h.textContent = hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  function input(value, placeholder) {
    const i = document.createElement('input');
    i.type = 'text';
    i.value = value || '';
    i.placeholder = placeholder || '';
    return i;
  }

  function checkbox(checked, text) {
    const wrap = document.createElement('span');
    wrap.className = 'fig-f-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    const t = document.createElement('span');
    t.textContent = text;
    wrap.append(box, t);
    wrap.input = box;
    return wrap;
  }

  function select(options, value) {
    const s = document.createElement('select');
    options.forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      s.appendChild(o);
    });
    s.value = value;
    return s;
  }

  async function open() {
    let data;
    try { data = await load(); }
    catch (e) { FigJS.setStatus('Could not load site settings.', '#f44336'); return; }
    const site = data.site;
    let local = null;
    try { local = await (await fetch('/api/config', { cache: 'no-store' })).json(); } catch (e) {}

    const form = document.createElement('div');
    form.className = 'fig-form fig-form--grid';

    const name = input(site.name, 'My Site');
    const baseUrl = input(site.baseUrl, 'https://example.pages.dev');
    const publicPages = data.pages.filter((p) => p.startsWith('public/'));
    const home = select(publicPages.map((p) => [p, p.replace(/^public\//, '/')]), site.homePage);
    if (!publicPages.includes(site.homePage)) {
      const o = document.createElement('option');
      o.value = site.homePage;
      o.textContent = site.homePage + ' (missing)';
      home.prepend(o);
      home.value = site.homePage;
    }
    const onStart = select([
      ['last', 'Reopen the last page'], ['home', 'Open the home page'], ['none', 'Open nothing'],
    ], site.openOnStart);
    const lang = input(site.defaultLang, 'en');
    const theme = select([['auto', 'Auto (OS setting)'], ['light', 'Light'], ['dark', 'Dark']], site.defaultTheme);
    const favicon = input(site.favicon, '/assets/images/favicon.png');
    const themeColor = input(site.themeColor, '#000000');
    const description = input(site.description, 'Used for new pages');
    const social = input(site.socialImage, '/assets/images/preview.png');

    const browse = (target) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = FigJS.icons.browse;
      b.className = 'fig-f-browse';
      b.addEventListener('click', async () => {
        const url = await FigJS.media.pick({ kind: 'image' });
        if (url) target.value = url;
      });
      const row = document.createElement('div');
      row.className = 'fig-f-text';
      row.append(target, b);
      return row;
    };

    const homeRow = document.createElement('div');
    homeRow.className = 'fig-f-text';
    homeRow.appendChild(home);
    if (!data.hasIndex) {
      const create = document.createElement('button');
      create.type = 'button';
      create.textContent = 'Create index.html';
      create.title = 'Create public/index.html, the default home page';
      create.addEventListener('click', async () => {
        const res = await fetch('/api/new-page', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'index', where: 'public', folder: '', title: name.value || 'Home' }),
        });
        const r = await res.json();
        if (r.path) {
          const o = document.createElement('option');
          o.value = r.path;
          o.textContent = '/' + r.path.replace(/^public\//, '');
          home.appendChild(o);
          home.value = r.path;
          create.remove();
          FigJS.files.refreshTree();
          FigJS.setStatus('Created ' + r.path, '#4caf50');
        }
      });
      homeRow.appendChild(create);
    }

    form.append(
      field('Site name', name),
      field('Base URL', baseUrl, 'Used for canonical links and social previews.'),
      field('Home page', homeRow, 'What "/" serves. Saved to public/_redirects as a rewrite, so the host serves it too.'),
      field('When FigJS starts', onStart),
      field('Default language', lang),
      field('Default theme', theme),
      field('Favicon', browse(favicon)),
      field('Browser UI colour', themeColor),
      field('Description', description),
      field('Social image', browse(social)),
    );

    // Local servers (editor.config.json).
    let ports = null;
    if (local && local.config) {
      const cfg = local.config;
      const running = local.running || {};
      const portInput = (value, fallback) => {
        const i = input(String(value), String(fallback));
        i.inputMode = 'numeric';
        return i;
      };
      ports = {
        editor: portInput(cfg.port, local.defaults.port),
        preview: portInput(cfg.previewPort, local.defaults.previewPort),
        open: checkbox(cfg.open, 'Open the browser when FigJS starts'),
        share: checkbox(cfg.shareOnNetwork, 'Let other devices on this network open the preview'),
      };
      const heading = document.createElement('div');
      heading.className = 'fig-form-section';
      heading.textContent = 'Local servers';
      form.appendChild(heading);
      const wide = (el) => { el.classList.add('fig-field--wide'); return el; };
      form.append(
        field('FigJS port', ports.editor),
        field('Preview port', ports.preview),
        wide(field('', document.createElement('span'),
          'Port changes apply the next time FigJS starts. A port in use moves on to the next free one.')),
      );
      if (running.previewPort) {
        const url = `http://localhost:${running.previewPort}/`;
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = url;
        form.appendChild(wide(field('Site preview', link, 'The site as the host serves it, with "/" as the home page.')));
      }
      form.append(wide(field('', ports.open)), wide(field('', ports.share)));
    }

    FigJS.dialog.open({
      title: 'Site settings',
      body: form,
      width: 620,
      actions: [
        { label: 'Apply to this page', onClick: () => { applyDefaultsToPage({
          favicon: favicon.value, themeColor: themeColor.value, description: description.value,
          socialImage: social.value, name: name.value, baseUrl: baseUrl.value,
        }); return false; } },
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: async () => {
          const body = {
            name: name.value.trim(), baseUrl: baseUrl.value.trim().replace(/\/+$/, ''),
            homePage: home.value, openOnStart: onStart.value,
            defaultLang: lang.value.trim() || 'en', defaultTheme: theme.value,
            favicon: favicon.value.trim(), themeColor: themeColor.value.trim(),
            description: description.value.trim(), socialImage: social.value.trim(),
          };
          const res = await fetch('/api/site', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (!res.ok) { FigJS.setStatus('Could not save site settings', '#f44336'); return false; }
          if (ports) {
            const cfg = local.config;
            const next = {
              port: Number(ports.editor.value.trim()) || local.defaults.port,
              previewPort: Number(ports.preview.value.trim()) || local.defaults.previewPort,
              open: ports.open.input.checked,
              shareOnNetwork: ports.share.input.checked,
            };
            if (Object.keys(next).some((k) => next[k] !== cfg[k])) {
              await fetch('/api/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
              }).catch(() => {});
            }
          }
          cache = null;
          FigJS.setStatus('Site settings saved', '#4caf50');
          return true;
        } },
      ],
    });
  }

  // Fills empty head fields of the current page from the site defaults;
  // icon and theme colour are always replaced.
  async function applyDefaultsToPage(values) {
    const site = values || await get();
    const head = FigJS.settingsUI.headAdapter();
    if (site.favicon) head.write('link:icon', site.favicon);
    if (site.themeColor) head.write('meta:theme-color', site.themeColor);
    if (site.description && !head.read('meta:description')) head.write('meta:description', site.description);
    if (site.socialImage && !head.read('meta:og:image')) head.write('meta:og:image', site.socialImage);
    if (site.baseUrl && FigJS.state.currentFilePath && FigJS.state.currentFilePath.startsWith('public/')) {
      const rel = FigJS.state.currentFilePath.replace(/^public\//, '').replace(/(^|\/)index\.html$/, '$1');
      head.write('link:canonical', site.baseUrl + '/' + rel);
    }
    if (FigJS.pageTab) FigJS.pageTab.refresh();
    FigJS.setStatus('Site defaults applied to this page', '#4caf50');
  }

  function install() {
    const btn = document.getElementById('btn-site');
    if (btn) btn.addEventListener('click', open);
  }

  FigJS.site = { install, open, get, startupPage, applyDefaultsToPage };
})();
