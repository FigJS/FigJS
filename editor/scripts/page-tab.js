// Page tab: page-level settings as settings blocks (FigJS.settingsUI).
//   Page            <head>: title, description, icons, social image
//   Background      --page-bg-* and overlay; a video (data-bg-video-*, bg-video.preset.js)
//   Text & spacing  --page-fg, --page-pad, Markdown in text
//   Scrolling       data-smooth-scroll, --scroll-glide, data-scrollbar
//   Cursor          --cursor-<state> (cursor-field.js; --page-cursor before states)
//   Theme           data-theme-requested / data-theme-mode
//   Site scale      data-site-scale / data-site-scale-phone
//   Email links     data-mail-fallback (runtime universal.js)
//   In-app browsers data-inapp, data-inapp-text (runtime inapp.js)
// Values live on the wrapper (FigJS.pageBody) or in the head.
//   FigJS.pageTab.install() / refresh()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  // Visitor-facing texts: cleared shows the default, a space leaves it out.
  const EMPTY_HELP = 'Clear it for the default; a single space leaves it empty.';
  const APP_HELP = '{app} is the app\'s name (or "an app").';

  const urlWrap = (v) => {
    const s = String(v || '').trim();
    return s ? `url("${s.replace(/"/g, '%22')}")` : '';
  };
  const urlUnwrap = (v) => String(v || '').replace(/^url\(\s*['"]?|['"]?\s*\)$/g, '');

  const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light',
    'hard-light', 'color-dodge', 'color-burn', 'difference', 'luminosity', 'color', 'saturation', 'hue']
    .map((b) => ({ id: b, name: b }));

  const mdOn = (a) => a.readAttr('data-text-md') === 'on';
  // In-app browsers: unset is off (inapp.js).
  const inappOn = (a) => !['', 'off'].includes(a.readAttr('data-inapp'));

  const SCHEMAS = {
    meta: {
      title: 'Page',
      properties: [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'Shown in the browser tab' },
        { key: 'meta:description', label: 'Description', type: 'textarea', rows: 2,
          placeholder: 'One or two sentences for search engines and link previews' },
        { key: 'link:icon', label: 'Favicon', type: 'text', browse: 'image', placeholder: '/assets/images/icon.png' },
        { key: 'meta:theme-color', label: 'Browser UI colour', type: 'color' },
        { key: 'meta:og:image', label: 'Social image', type: 'text', browse: 'image',
          placeholder: 'Image shown when the page is shared' },
        { key: 'link:canonical', label: 'Canonical URL', type: 'text', placeholder: 'https://example.com/page' },
      ],
    },
    background: {
      title: 'Background',
      properties: [
        { key: '--page-bg-color', label: 'Colour', type: 'color-alpha',
          help: 'Leave empty to follow the theme (light/dark).' },
        { key: '--page-bg-image', label: 'Image', type: 'text', browse: 'image',
          wrap: urlWrap, unwrap: urlUnwrap, placeholder: '/assets/images/background.png' },
        { key: '--page-bg-size', label: 'Size', type: 'select', placeholder: 'Cover (default)', options: [
          { id: 'cover', name: 'Cover' }, { id: 'contain', name: 'Contain' },
          { id: 'auto', name: 'Original size' }, { id: '100% 100%', name: 'Stretch' },
          { id: '50%', name: 'Half width' } ] },
        { key: '--page-bg-zoom', label: 'Zoom', type: 'range', min: 0.25, max: 4, step: 0.01, default: 1, format: 'x' },
        { key: '--page-bg-zoom-phone', label: 'Zoom on phone', type: 'range', min: 0.25, max: 4, step: 0.01, default: 1, format: 'x',
          help: 'Phone applies below 640px wide. Zoom resizes the image itself (no filter), so it stays as sharp as the file; it scales around Position.' },
        { key: '--page-bg-position', label: 'Position', type: 'select', placeholder: 'Center (default)', options: [
          'center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right']
          .map((p) => ({ id: p, name: p })) },
        { key: '--page-bg-repeat', label: 'Repeat', type: 'select', placeholder: 'No repeat (default)', options: [
          { id: 'no-repeat', name: 'No repeat' }, { id: 'repeat', name: 'Tile' },
          { id: 'repeat-x', name: 'Tile horizontally' }, { id: 'repeat-y', name: 'Tile vertically' },
          { id: 'space', name: 'Tile, spaced' }, { id: 'round', name: 'Tile, stretched to fit' } ] },
        { key: '--page-bg-attachment', label: 'Scrolling', type: 'segmented', default: 'scroll', options: [
          { id: 'scroll', name: 'Scrolls' }, { id: 'fixed', name: 'Fixed' } ] },
        { key: '--page-bg-blend', label: 'Blend with colour', type: 'select', placeholder: 'normal', options: BLEND_OPTIONS },
        { type: 'group', label: 'Overlay' },
        { key: '--page-overlay-image', label: 'Overlay', type: 'gradient',
          help: 'Sits between the image and the content.' },
        { key: '--page-overlay-blend', label: 'Overlay blend', type: 'select', placeholder: 'normal', options: BLEND_OPTIONS },
        // The page's video (bg-video.preset.js).
        { type: 'group', label: 'Video' },
        ...(FigJS.bgVideo ? FigJS.bgVideo.fields(true) : []),
      ],
    },
    text: {
      title: 'Text & spacing',
      properties: [
        { key: '--page-fg', label: 'Text colour', type: 'color',
          help: 'Leave empty to follow the theme.' },
        { key: '--page-pad', label: 'Page padding', type: 'text', placeholder: '0, or 24px 16px' },
        { key: 'data-text-md', attr: true, label: 'Formatting', type: 'toggle', valueTrue: 'on', valueFalse: '',
          text: 'Markdown in text elements', rerender: true,
          help: '**bold**  *italic*  ___underline___  --strike--  ==highlight==  `code`  ~sub~  ^sup^  ||spoiler||  ' +
            '[link](url)  [text]{red} or {#hex}  \\n line break  \\s no-break space.  A \\ before a ' +
            'character keeps it literal. Single elements can opt out under Settings, Element.' },
        { key: '--text-highlight', label: 'Highlight', type: 'color-alpha', when: mdOn,
          help: 'Behind ==highlighted== text. Empty: a tint of the theme accent.' },
        { key: '--text-code-bg', label: 'Code background', type: 'color-alpha', when: mdOn,
          help: 'Behind `code`. Empty: a tint of the text colour.' },
        { key: '--spoiler-bg', label: 'Spoiler cover', type: 'color-alpha', when: mdOn,
          help: 'Covers ||spoilers|| until clicked. Empty: the text colour.' },
        { key: '--text-sup-size', label: 'Superscript size', type: 'range', min: 0.5, max: 1, step: 0.02, unit: 'em',
          default: 0.82, when: mdOn, help: 'Size of ^superscript^ relative to the text around it.' },
        { key: '--text-sub-size', label: 'Subscript size', type: 'range', min: 0.5, max: 1, step: 0.02, unit: 'em',
          default: 0.82, when: mdOn, help: 'Size of ~subscript~ relative to the text around it.' },
      ],
    },
    scroll: {
      title: 'Scrolling',
      properties: [
        { key: 'data-smooth-scroll', attr: true, label: 'Mouse wheel', type: 'toggle', valueTrue: 'on', valueFalse: '',
          text: 'Smooth scrolling on the whole page', rerender: true,
          help: 'The page glides after each wheel step. Trackpads, touch, keys and scroll boxes keep their own scrolling. To glide only over certain parts, give them the Smooth scroll zone tag (Presets, Scrolling) instead.' },
        { key: '--scroll-glide', label: 'Glide', type: 'range', min: 80, max: 1000, step: 10, unit: 'ms', default: 260,
          help: 'How soft the glide is: higher keeps the page moving longer after each wheel step. Zones use it too unless they set their own.' },
        { key: 'data-scrollbar', attr: true, label: 'Scrollbar', type: 'segmented', default: '',
          options: [{ id: '', name: 'Shown' }, { id: 'hidden', name: 'Hidden' }],
          help: 'Hidden keeps the page scrolling by wheel, touch and keys. Scroll boxes keep their own scrollbars.' },
      ],
    },
    // Cursor states: cursor-field.js.
    theme: {
      title: 'Theme',
      properties: [
        { key: 'data-theme-requested', attr: true, label: 'Default theme', type: 'segmented', default: 'auto', options: [
          { id: 'auto', name: 'Auto', title: 'Follow the visitor\'s OS setting' },
          { id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' } ] },
        { key: 'data-theme-mode', attr: true, label: 'Visitors can', type: 'select', placeholder: 'Toggle the theme', options: [
          { id: 'force-dark', name: 'Always see dark' },
          { id: 'force-light', name: 'Always see light' },
          { id: 'custom', name: 'Page styles itself (no theme tokens)' } ] },
      ],
    },
    mail: {
      title: 'Email links',
      properties: [
        { key: 'data-mail-fallback', attr: true, label: 'No email app', type: 'segmented', default: '', rerender: true, options: [
          { id: '', name: 'Open Gmail' }, { id: 'ask', name: 'Ask' }, { id: 'off', name: 'Nothing' }],
          help: 'On a computer without an email app, an email link does nothing; the page notices when no app opened. Open Gmail goes on to a Gmail draft (address, subject, body), and Back returns to the page; Ask offers Gmail, Outlook or copying the address in a new tab. Phones always have an email app.' },
        { key: 'data-mail-ask-text', attr: true, label: 'Ask message', type: 'text',
          placeholder: 'No email app opened. Write to {address} with:',
          help: '{address} is the address the link writes to. ' + EMPTY_HELP,
          when: (a) => a.readAttr('data-mail-fallback') === 'ask' },
      ],
    },
    inapp: {
      title: 'In-app browsers',
      description: 'Instagram, Facebook, TikTok, Messenger, Reddit, Discord and similar apps open links in a browser of their own, without the visitor\'s logins, where email and phone links may not work.',
      properties: [
        { key: 'data-inapp', attr: true, label: 'Visitors', type: 'segmented', default: 'off', rerender: true, options: [
          { id: 'redirect', name: 'Redirect' }, { id: 'block', name: 'Redirect or block' }, { id: 'redirect-offer', name: 'Redirect or offer' },
          { id: 'offer', name: 'Offer' }, { id: 'off', name: 'Off' }],
          help: 'Off (the default) leaves visitors in the app\'s browser. The Redirect options first send visitors to their own browser silently, once per visit: Android opens the default browser; iPhone opens Safari on iOS 17 and later. Where the app or system prevents it: Redirect leaves the page as it is, Redirect or block covers it with a prompt to continue in the browser, and Redirect or offer shows a small bar offering it. Offer only shows the bar, without redirecting.' },
        { type: 'group', label: 'Texts', when: inappOn },
        { key: 'data-inapp-text', attr: true, label: 'Bar message', type: 'textarea', rows: 2,
          placeholder: 'This page opened inside {app}. Your browser keeps your logins and opens email links.',
          help: APP_HELP + ' ' + EMPTY_HELP,
          when: (a) => ['redirect-offer', 'offer'].includes(a.readAttr('data-inapp')) },
        { key: 'data-inapp-block-title', attr: true, label: 'Block title', type: 'text',
          placeholder: 'Open in your browser',
          help: EMPTY_HELP,
          when: (a) => a.readAttr('data-inapp') === 'block' },
        { key: 'data-inapp-block-text', attr: true, label: 'Block message', type: 'textarea', rows: 2,
          placeholder: 'This page doesn’t open inside {app}. Continue in your browser, where your logins and email links work.',
          help: APP_HELP + ' ' + EMPTY_HELP,
          when: (a) => a.readAttr('data-inapp') === 'block' },
        { key: 'data-inapp-hint', attr: true, label: 'Instructions', type: 'textarea', rows: 2,
          placeholder: 'If your browser did not open, use the menu (••• or ⋮) and choose Open in browser.',
          help: 'Shown on the block, and on the bar when Open in browser did not work. ' + EMPTY_HELP,
          when: (a) => ['block', 'redirect-offer', 'offer'].includes(a.readAttr('data-inapp')) },
        { key: 'data-inapp-contact-text', attr: true, label: 'Email link note', type: 'textarea', rows: 2,
          placeholder: 'If nothing opened, copy the address, or open this page in your browser.',
          help: 'Shown in the bar when an email or phone link is tapped inside the app. ' + EMPTY_HELP,
          when: inappOn },
      ],
    },
    scale: {
      title: 'Site scale',
      description: 'Zooms the whole page. Phone applies below 640px wide.',
      properties: [
        { key: 'data-site-scale', attr: true, label: 'Desktop', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1, format: 'x' },
        { key: 'data-site-scale-phone', attr: true, label: 'Phone', type: 'range', min: 0.5, max: 2, step: 0.01, default: 0.75, format: 'x' },
      ],
    },
  };

  const OPEN_KEY = 'fig.pageTab.open';
  const openState = (() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}; } catch (e) { return {}; }
  })();

  function section(id, schema, adapter) {
    const d = document.createElement('details');
    d.className = 'fig-group';
    d.open = id in openState ? openState[id] : (id === 'background' || id === 'meta');
    d.addEventListener('toggle', () => {
      openState[id] = d.open;
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(openState)); } catch (e) {}
    });
    const s = document.createElement('summary');
    s.textContent = schema.title;
    d.appendChild(s);
    const body = document.createElement('div');
    body.className = 'fig-group-body';
    body.appendChild(FigJS.settingsUI.renderBlock(adapter, schema, {
      id: 'page:' + id, compact: true, hideTitle: true, rerender: refresh,
    }));
    d.appendChild(body);
    return d;
  }

  function refresh() {
    const host = document.getElementById('page-settings');
    if (!host || !FigJS.editor || !FigJS.pageBody) return;
    const scroller = host.closest('.panel-tab-body');
    const top = scroller ? scroller.scrollTop : 0;
    host.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'page-tab-head';
    const path = document.createElement('div');
    path.className = 'page-tab-path';
    path.textContent = FigJS.state.currentFilePath || 'Unsaved page';
    const site = document.createElement('button');
    site.type = 'button';
    site.textContent = 'Site settings';
    site.addEventListener('click', () => FigJS.site && FigJS.site.open());
    head.append(path, site);
    host.appendChild(head);

    const page = FigJS.settingsUI.pageAdapter();
    const headMeta = FigJS.settingsUI.headAdapter();
    host.appendChild(section('meta', SCHEMAS.meta, headMeta));
    host.appendChild(section('background', SCHEMAS.background, page));
    host.appendChild(section('text', SCHEMAS.text, page));
    host.appendChild(section('scroll', SCHEMAS.scroll, page));
    if (FigJS.cursors) host.appendChild(section('cursor', FigJS.cursors.pageSchema(), page));
    host.appendChild(section('theme', SCHEMAS.theme, page));
    host.appendChild(section('scale', SCHEMAS.scale, page));
    host.appendChild(section('mail', SCHEMAS.mail, page));
    host.appendChild(section('inapp', SCHEMAS.inapp, page));

    // Body classes (grain, etc.) are preset tags on "Body".
    const tags = FigJS.pageBody.getClasses();
    const bodyTags = document.createElement('div');
    bodyTags.className = 'page-tab-tags';
    const label = document.createElement('span');
    label.textContent = tags.length ? 'Body tags: ' + tags.map((t) => '.' + t).join(' ') : 'No preset tags on the page body.';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit body tags';
    edit.title = 'Select Body and open the Presets panel';
    edit.addEventListener('click', () => {
      FigJS.editor.select(FigJS.editor.getWrapper());
      FigJS.editor.runCommand('open-presets-panel');
      const btn = FigJS.editor.Panels.getButton('views', 'open-presets-panel');
      if (btn) btn.set('active', true);
    });
    bodyTags.append(label, edit);
    host.appendChild(bodyTags);

    if (scroller) scroller.scrollTop = top;
  }

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;
    const rerenderIfVisible = () => {
      const tab = document.getElementById('tab-page');
      if (tab && tab.classList.contains('active')) refresh();
    };
    editor.on('undo', rerenderIfVisible);
    editor.on('redo', rerenderIfVisible);
  }

  FigJS.pageTab = { install, refresh };
})();
