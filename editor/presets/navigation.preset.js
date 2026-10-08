// In-page navigation (navigation.js).
//   Contents   links to the page's sections, from its headings (and
//              elements with a Contents label) or written by hand; the
//              section on screen is marked while scrolling
//   scrollspy  the same marking for any group of in-page links
// Every in-page link jumps the same way; its arrival (landing, scroll,
// highlight) is set on the link or a container around it.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-navigation',
  plugin: function (editor) {
    const {
      registerComponentPreset, registerComponentSettings, registerPresetSchemas, registerPresetClass,
      registerDependency, linkArrivalProperties, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/navigation.css');
    registerDependency('js', '/assets/js/navigation.js');

    const opt = (pairs) => pairs.map(([id, name]) => ({ id, name }));
    const isAuto = (a) => a.readAttr('data-contents') === 'auto';
    const isSticky = (a) => !!a.readAttr('data-contents-sticky');

    const CURRENT = [
      { type: 'group', label: 'Current section' },
      { key: '--spy-line', label: 'Becomes current at', type: 'range', min: 0, max: 100, step: 1, unit: '%', default: 30,
        help: 'A section is current once its top passes this line, measured down the screen below sticky headers.' },
      { key: '--spy-color', label: 'Text', type: 'color' },
      { key: '--spy-bg', label: 'Background', type: 'color-alpha' },
    ];

    registerComponentSettings('contents', {
      title: 'Contents',
      description: 'Links to parts of this page. Each link jumps to its target; the one on screen is marked.',
      properties: [
        { key: 'data-contents', attr: true, label: 'Entries', type: 'segmented', default: '', rerender: true, options: opt([
          ['auto', 'From headings'], ['', 'Written by hand']]),
          help: 'From headings rebuilds itself as the page changes. By hand: edit the links; pick each target with Link, Pick on page.' },
        { key: 'data-contents-levels', attr: true, label: 'Headings', type: 'segmented', default: '', options: opt([
          ['h2', 'H2'], ['', 'H2 and H3'], ['h2,h3,h4', 'H2 to H4']]), when: isAuto,
          help: 'Any other element joins the list when it has a Contents label; any part of the page can be left out (Settings, Element).' },
        { key: 'data-contents-scope', attr: true, label: 'Read from', type: 'text', when: isAuto,
          placeholder: 'the page\'s main area',
          help: 'A CSS selector. Empty: the content column of a Contents layout, else <main>.' },
        { key: 'data-contents-sticky', attr: true, label: 'Position', type: 'toggle', valueTrue: 'true', valueFalse: '', rerender: true,
          text: 'Stays in view while scrolling' },
        { key: '--contents-top', label: 'Distance from top', type: 'range', min: 0, max: 240, step: 2, unit: 'px',
          default: 24, when: isSticky },
        ...CURRENT,
        { key: '--spy-bar-color', label: 'Marker', type: 'color' },
        { key: '--spy-bar', label: 'Marker width', type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 2 },
        { type: 'group', label: 'List' },
        { key: '--contents-fg', label: 'Links', type: 'color' },
        { key: '--contents-size', label: 'Text size', type: 'range', min: 0.7, max: 1.4, step: 0.05, unit: 'rem', default: 0.95 },
        { key: '--contents-gap', label: 'Spacing', type: 'range', min: 0, max: 16, step: 1, unit: 'px', default: 2 },
        { key: '--contents-indent', label: 'Indent per level', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 14 },
        ...linkArrivalProperties({ align: 'start', highlight: 'outline' }),
      ],
    });

    registerComponentPreset(editor, {
      id: 'contents',
      name: 'Contents',
      label: 'Contents',
      category: 'Layout',
      media: icons.contents,
      tagName: 'nav',
      classes: ['contents'],
      droppable: true,
      defaultAttributes: { 'data-contents': 'auto', 'aria-label': 'Contents' },
      defaultComponents:
        '<p class="contents-title">Contents</p>' +
        '<ol class="contents-list"></ol>',
      traits: [],
    });

    registerComponentSettings('contents-layout', {
      title: 'Contents layout',
      description: 'A Contents column next to the content it lists.',
      properties: [
        { key: 'data-contents-side', attr: true, label: 'Contents on', type: 'segmented', default: '', options: opt([
          ['', 'Left'], ['right', 'Right']]) },
        { key: '--contents-width', label: 'Column width', type: 'range', min: 140, max: 420, step: 10, unit: 'px', default: 240 },
        { key: '--contents-layout-gap', label: 'Gap', type: 'range', min: 0, max: 120, step: 4, unit: 'px', default: 40 },
      ],
    });

    registerComponentPreset(editor, {
      id: 'contents-layout',
      name: 'Contents layout',
      label: 'Contents Layout',
      category: 'Layout',
      media: icons.contentsLayout,
      classes: ['contents-layout'],
      droppable: true,
      defaultComponents:
        '<nav class="contents" data-contents="auto" data-contents-sticky="true" aria-label="Contents">' +
          '<p class="contents-title">Contents</p><ol class="contents-list"></ol>' +
        '</nav>' +
        '<div class="contents-body">' +
          '<h2>First section</h2><p>Write here. Every heading shows up in Contents.</p>' +
          '<h2>Second section</h2><p>Scroll the page: the section on screen is marked.</p>' +
          '<h3>A smaller part</h3><p>Third-level headings are indented.</p>' +
          '<h2>Third section</h2><p>Click an entry to jump to it.</p>' +
        '</div>',
      traits: [],
    });

    editor.DomComponents.addType('contents-body', {
      isComponent(el) {
        if (el && el.classList && el.classList.contains('contents-body')) return { type: 'contents-body' };
      },
      model: {
        defaults: {
          name: 'Content column', classes: ['contents-body'],
          draggable: false, removable: false, copyable: false, droppable: true,
        },
      },
    });
    registerPresetClass('contents-body');

    // ---- scrollspy -------------------------------------------------------
    registerPresetSchemas(['scrollspy'], {
      title: 'Scrollspy',
      description: 'Marks the in-page link whose target is on screen (class is-current) as the page scrolls.',
      properties: [
        ...CURRENT,
        ...linkArrivalProperties({ align: 'start', highlight: 'outline' }),
      ],
    });
  },
});
