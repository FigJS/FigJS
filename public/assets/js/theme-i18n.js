(function () {
  const IS_EDITOR_CANVAS = !!window.__IS_EDITOR_CANVAS;

  const THEME_KEY = 'site.theme';
  const LANG_KEY = 'site.lang';
  const THEME_CYCLE = ['light', 'dark', 'auto'];
  const VALID_THEME_MODES = new Set(['force-dark', 'force-light', 'auto', 'custom']);

  function getStored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function setStored(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function effectiveTheme(requested) {
    if (requested !== 'auto') return requested;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark' : 'light';
  }

  function getBody() {
    return document.body || document.documentElement;
  }

  function getDefaultLang() {
    const v = getBody().getAttribute('data-lang-default');
    return (v && v.trim()) || 'en';
  }

  let contentEls = null;

  function scanContentEls() {
    contentEls = [];
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      for (let i = 0; i < el.attributes.length; i++) {
        const name = el.attributes[i].name;
        if (name.startsWith('data-lang-') && name !== 'data-lang-default') {
          contentEls.push(el);
          break;
        }
      }
    });
  }

  function applyContentLanguage(lang) {
    if (IS_EDITOR_CANVAS) return;

    if (!contentEls) scanContentEls();
    const defaultLang = getDefaultLang();
    const wantKey = 'data-lang-' + lang;
    const fallbackKey = 'data-lang-' + defaultLang;

    contentEls.forEach((el) => {
      if (!el.isConnected) return;
      const content = el.hasAttribute(wantKey) ? el.getAttribute(wantKey) : el.getAttribute(fallbackKey);
      if (content == null) return;
      if (el.innerHTML === content) return;
      el.innerHTML = content;
      if (window.SiteText) window.SiteText.render(el);
    });
  }

  const OBSERVER_OPTS = { subtree: true, childList: true, attributes: true };

  let rescanPending = false;
  function scheduleRescan() {
    if (rescanPending) return;
    rescanPending = true;
    requestAnimationFrame(() => {
      rescanPending = false;
      rescanLocalization();
    });
  }

  function subtreeHasLangContent(node) {
    if (!node || node.nodeType !== 1) return false;
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const n = attrs[i].name;
      if (n.startsWith('data-lang-') || n.startsWith('data-i18n-')) return true;
    }
    if (node.querySelectorAll) {
      const descendants = node.querySelectorAll('*');
      for (let i = 0; i < descendants.length; i++) {
        const a = descendants[i].attributes;
        for (let j = 0; j < a.length; j++) {
          const n = a[j].name;
          if (n.startsWith('data-lang-') || n.startsWith('data-i18n-')) return true;
        }
      }
    }
    return false;
  }
  const contentObserver = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      if (m.type === 'attributes') {
        const n = m.attributeName || '';
        if (n.startsWith('data-lang-') || n.startsWith('data-i18n-')) {
          dirty = true; break;
        }
      }
      if (m.type === 'childList') {
        for (let i = 0; i < m.addedNodes.length; i++) {
          if (subtreeHasLangContent(m.addedNodes[i])) {
            dirty = true; break;
          }
        }
        if (dirty) break;
      }
    }
    if (dirty) scheduleRescan();
  });

  function rescanLocalization() {
    contentObserver.disconnect();
    try {
      contentEls = null;
      applyContentLanguage(api.getLang());
      bindLangSelects();
      populateLangSelects();
    } finally {
      contentObserver.observe(document.documentElement, OBSERVER_OPTS);
    }
  }

  if (!IS_EDITOR_CANVAS) {
    contentObserver.observe(document.documentElement, OBSERVER_OPTS);
  }

  function getThemeMode() {
    const m = (getBody().getAttribute('data-theme-mode') || 'auto').trim();
    return VALID_THEME_MODES.has(m) ? m : 'auto';
  }

  function applyTheme() {
    const body = getBody();
    const mode = getThemeMode();

    if (mode === 'custom') {
      body.removeAttribute('data-theme-requested');
      document.documentElement.removeAttribute('data-theme');
      return null;
    }

    if (mode === 'force-dark' || mode === 'force-light') {
      const resolved = mode === 'force-dark' ? 'dark' : 'light';
      body.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-theme', resolved);
      body.removeAttribute('data-theme-requested');
      return resolved;
    }

    let requested =
      getStored(THEME_KEY)
      || body.getAttribute('data-theme-requested')
      || 'auto';
    if (!THEME_CYCLE.includes(requested)) requested = 'auto';

    const resolved = effectiveTheme(requested);
    body.setAttribute('data-theme', resolved);
    body.setAttribute('data-theme-requested', requested);
    document.documentElement.setAttribute('data-theme', resolved);
    return resolved;
  }

  function setTheme(requested) {
    if (!THEME_CYCLE.includes(requested)) requested = 'auto';
    setStored(THEME_KEY, requested);
    getBody().setAttribute('data-theme-requested', requested);
    return applyTheme();
  }

  function applyLang(lang) {
    if (!lang) return;
    const body = getBody();
    body.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    applyContentLanguage(lang);
    populateLangSelects();
  }

  const LANG_NAMES = {
    en: 'English', sr: 'Srpski', es: 'Español', fr: 'Français',
    de: 'Deutsch', ja: '日本語', it: 'Italiano', pt: 'Português',
    ru: 'Русский', zh: '中文', ko: '한국어', ar: 'العربية',
    nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', sv: 'Svenska',
    no: 'Norsk', da: 'Dansk', fi: 'Suomi', cs: 'Čeština',
    hu: 'Magyar', el: 'Ελληνικά', he: 'עברית', hi: 'हिन्दी',
    th: 'ไทย', vi: 'Tiếng Việt', uk: 'Українська', ro: 'Română',
    bg: 'Български', hr: 'Hrvatski', sk: 'Slovenčina',
    sl: 'Slovenščina', lt: 'Lietuvių', lv: 'Latviešu', et: 'Eesti',
    'sr-cyrl': 'Српски', 'sr-latn': 'Srpski', 'zh-hans': '简体中文', 'zh-hant': '繁體中文',
    'pt-br': 'Português (Brasil)', 'en-us': 'English (US)', 'en-gb': 'English (UK)',
  };
  function pageLangNames() {
    const raw = getBody().getAttribute('data-lang-names') || document.documentElement.getAttribute('data-lang-names');
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  function langDisplayName(code) {
    return pageLangNames()[code] || LANG_NAMES[code] || code.toUpperCase();
  }

  function langLabel(code, display) {
    const tag = code.toUpperCase();
    if (display === 'name') return langDisplayName(code);
    if (display === 'both' && langDisplayName(code) !== tag) return tag + ' ' + langDisplayName(code);
    return tag;
  }

  function fillLabel(target, code, display) {
    target.textContent = '';
    if (display === 'both' && langDisplayName(code) !== code.toUpperCase()) {
      const t = document.createElement('span');
      t.className = 'lang-switch-tag';
      t.textContent = code.toUpperCase();
      const n = document.createElement('span');
      n.className = 'lang-switch-name';
      n.textContent = langDisplayName(code);
      target.append(t, n);
    } else {
      target.textContent = langLabel(code, display);
    }
  }

  function switchParts(root) {
    let button = root.querySelector(':scope > .lang-switch-button');
    let menu = root.querySelector(':scope > .lang-switch-menu');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang-switch-button';
      root.prepend(button);
    }
    if (!menu) {
      menu = document.createElement('ul');
      menu.className = 'lang-switch-menu';
      menu.hidden = true;
      root.appendChild(menu);
    }
    button.setAttribute('aria-haspopup', 'listbox');
    menu.setAttribute('role', 'listbox');
    return { button, menu };
  }

  function populateLangSwitches() {
    const available = api.getAvailableLangs();
    const current = api.getLang();
    const list = available.includes(current) ? available : available.concat([current]);
    document.querySelectorAll('[data-site-lang-switch]').forEach((root) => {
      const display = root.getAttribute('data-lang-display') || 'tag';
      const signature = list.join(',') + '|' + current + '|' + display;
      const { button, menu } = switchParts(root);
      if (root.__langSignature === signature && button.firstChild && menu.firstChild) return;
      root.__langSignature = signature;

      const label = document.createElement('span');
      label.className = 'lang-switch-current';
      fillLabel(label, current, display);
      const caret = document.createElement('span');
      caret.className = 'lang-switch-caret';
      caret.setAttribute('aria-hidden', 'true');
      button.textContent = '';
      button.append(label, caret);
      button.setAttribute('aria-label', langDisplayName(current));

      menu.textContent = '';
      list.forEach((code) => {
        const li = document.createElement('li');
        li.className = 'lang-switch-option';
        li.setAttribute('role', 'option');
        li.setAttribute('data-lang-option', code);
        li.setAttribute('aria-selected', code === current ? 'true' : 'false');
        li.tabIndex = -1;
        fillLabel(li, code, display);
        menu.appendChild(li);
      });
    });
  }

  function closeSwitch(root, focusButton) {
    const { button, menu } = switchParts(root);
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  }

  function placeMenu(root, menu) {
    menu.classList.remove('is-above');
    if (root.getAttribute('data-menu-place') !== 'auto') return;
    const r = root.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    if (menu.offsetHeight + 8 > below && r.top > below) menu.classList.add('is-above');
  }

  function openSwitch(root) {
    const { button, menu } = switchParts(root);
    document.querySelectorAll('[data-site-lang-switch]').forEach((r) => { if (r !== root) closeSwitch(r); });
    menu.hidden = false;
    placeMenu(root, menu);
    button.setAttribute('aria-expanded', 'true');
    const selected = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
    if (selected) selected.focus();
  }

  function bindLangSwitches() {
    if (IS_EDITOR_CANVAS || bindLangSwitches.done) return;
    bindLangSwitches.done = true;

    document.addEventListener('click', (e) => {
      const root = e.target.closest && e.target.closest('[data-site-lang-switch]');
      document.querySelectorAll('[data-site-lang-switch]').forEach((r) => { if (r !== root) closeSwitch(r); });
      if (!root) return;
      const option = e.target.closest('[data-lang-option]');
      if (option) {
        api.setLang(option.getAttribute('data-lang-option'));
        closeSwitch(root, true);
        return;
      }
      if (e.target.closest('.lang-switch-button')) {
        if (switchParts(root).menu.hidden) openSwitch(root);
        else closeSwitch(root);
      }
    });

    document.addEventListener('keydown', (e) => {
      const root = e.target.closest && e.target.closest('[data-site-lang-switch]');
      if (!root) return;
      const { menu } = switchParts(root);
      const options = Array.from(menu.querySelectorAll('[data-lang-option]'));
      const i = options.indexOf(document.activeElement);
      if (e.key === 'Escape') { closeSwitch(root, true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.hidden) { openSwitch(root); return; }
        const next = options[(i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
        if (next) next.focus();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
        e.preventDefault();
        api.setLang(options[i].getAttribute('data-lang-option'));
        closeSwitch(root, true);
      }
    });
  }

  function populateLangSelects() {
    const available = api.getAvailableLangs();
    const current = api.getLang();

    const list = available.includes(current) ? available : available.concat([current]);
    document.querySelectorAll('[data-site-lang-select]').forEach((sel) => {
      const signature = list.join(',') + '|' + (sel.getAttribute('data-lang-display') || 'name');
      if (sel.dataset.optionsSignature !== signature) {
        sel.innerHTML = '';
        list.forEach((code) => {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = langLabel(code, sel.getAttribute('data-lang-display') || 'name');
          sel.appendChild(opt);
        });
        sel.dataset.optionsSignature = signature;
      }
      if (sel.value !== current) sel.value = current;
    });
    populateLangSwitches();
  }

  function bindLangSelects() {
    document.querySelectorAll('[data-site-lang-select]').forEach((sel) => {
      if (sel.__siteLangBound) return;
      sel.__siteLangBound = true;

      sel.addEventListener('change', () => {
        if (IS_EDITOR_CANVAS) {
          sel.value = api.getLang();
          return;
        }
        api.setLang(sel.value);
      });
    });
  }

  const api = {
    setThemeMode(mode) {
      if (!VALID_THEME_MODES.has(mode)) mode = 'auto';
      getBody().setAttribute('data-theme-mode', mode);
      setStored('site.theme-mode', mode);
      return applyTheme();
    },
    getThemeMode,
    canToggleTheme() { return getThemeMode() === 'auto'; },
    setTheme(requested) {
      if (!api.canToggleTheme()) return api.getTheme();
      return setTheme(requested);
    },
    cycleTheme() {
      if (!api.canToggleTheme()) return api.getTheme();
      const cur = api.getRequestedTheme();
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
      return setTheme(next);
    },
    getTheme() { return getBody().getAttribute('data-theme') || null; },
    getRequestedTheme() {
      const requested = getStored(THEME_KEY)
          || getBody().getAttribute('data-theme-requested')
          || 'auto';
      return THEME_CYCLE.includes(requested) ? requested : 'auto';
    },

    setLang(lang) {
      setStored(LANG_KEY, lang);
      applyLang(lang);
    },
    getLang() {
      return getBody().getAttribute('data-lang')
          || getStored(LANG_KEY)
          || (navigator.language || 'en').split('-')[0];
    },

    getAvailableLangs() {
      const raw = getBody().getAttribute('data-lang-available') || '';
      const fromAttr = raw.split(/\s+/).filter(Boolean);
      if (fromAttr.length) return fromAttr;
      return ['en'];
    },

    refreshContent() {
      contentEls = null;
      applyContentLanguage(api.getLang());
      bindLangSelects();
      populateLangSelects();
    },
  };

  function boot() {
    const body = getBody();

    if (!body.hasAttribute('data-theme-mode')) {
      const storedMode = getStored('site.theme-mode');
      if (storedMode && VALID_THEME_MODES.has(storedMode)) {
        body.setAttribute('data-theme-mode', storedMode);
      }
    }
    applyTheme();

    const storedLang = getStored(LANG_KEY);
    const bodyLang   = body.getAttribute('data-lang');
    const requestedLang =
      storedLang
      || bodyLang
      || (navigator.language || 'en').split('-')[0];
    applyLang(requestedLang);

    const siteScale      = body.getAttribute('data-site-scale');
    const siteScalePhone = body.getAttribute('data-site-scale-phone');
    if (siteScale) {
      document.documentElement.style.setProperty('--site-scale', siteScale);
    }
    if (siteScalePhone) {
      document.documentElement.style.setProperty('--site-scale-phone', siteScalePhone);
    }

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (api.getThemeMode() === 'auto' && api.getRequestedTheme() === 'auto') {
          applyTheme();
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme-mode') {
          applyTheme();
        }
      }
    });
    mo.observe(body, { attributes: true, attributeFilter: ['data-theme-mode'] });

    bindLangSelects();
    bindLangSwitches();
    populateLangSelects();

    let switchTimer = 0;
    new MutationObserver((muts) => {
      if (!muts.some((m) => m.target.closest && m.target.closest('[data-site-lang-switch]')
        || Array.from(m.addedNodes).some((n) => n.nodeType === 1
          && (n.matches('[data-site-lang-switch]') || n.querySelector('[data-site-lang-switch]'))))) return;
      clearTimeout(switchTimer);
      switchTimer = setTimeout(populateLangSwitches, 30);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-lang-display'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.SiteTheme = api;
})();
