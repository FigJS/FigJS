// Interface icons: line icons on a 24px grid in the current text colour.
// Elements with data-icon="<name>" get the icon prepended on startup.
//   FigJS.icons.<name> / render(name) / apply(root)

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const svg = (body) =>
    `<svg class="fig-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ICONS = {
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    play: svg('<path d="M7 5l12 7-12 7z"/>'),
    pause: svg('<path d="M8 5v14M16 5v14"/>'),
    replay: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    desktop: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
    tablet: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>'),
    phone: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
    language: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    zoom: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
    external: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    paste: svg('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
    upload: svg('<path d="M12 20V9M7 14l5-5 5 5"/><path d="M5 4h14"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    browse: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    check: svg('<path d="M5 12l5 5 9-10"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    hourglass: svg('<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>'),
    wrench: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    code: svg('<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>'),
    stack: svg('<rect x="8" y="8" width="12" height="12" rx="1.5"/><rect x="4" y="4" width="12" height="12" rx="1.5"/>'),
    picture: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>'),
    video: svg('<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/>'),
  };

  function render(name) { return ICONS[name] || ''; }

  function apply(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (el.__figIcon) return;
      el.__figIcon = true;
      el.insertAdjacentHTML('afterbegin', render(el.dataset.icon));
    });
  }

  FigJS.icons = Object.assign({ render, apply }, ICONS);
})();
