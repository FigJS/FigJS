// Accordion item (collapses in place, opening down or up) and floating
// panel (a popover beside its trigger: below, above, or whichever has
// room). The declared state is the is-open class; the canvas shows
// it until the element is opened for editing (canvas.js), Replay always.
// In-page links to anything inside open it on arrival (navigation.js).
// Runtime panels.js, styles panels.css.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-expand-collapse',
  plugin: function (editor) {
    const { registerComponentPreset, registerComponentSettings, registerDependency, icons } = window.PresetRegistry;

    registerDependency('css', '/assets/css/panels.css');
    registerDependency('js', '/assets/js/panels.js');

    const STATE = (what) => ({
      key: 'is-open', classToggle: true, label: 'State', type: 'segmented', default: '',
      options: [{ id: '', name: 'Closed' }, { id: 'true', name: 'Open' }],
      help: `Declared in the page: the ${what} loads this way and visitors open or close it.`,
    });
    const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'].map((id) => ({ id, name: id }));

    registerComponentSettings('accordion-item', {
      title: 'Accordion',
      description: 'Selecting it (or anything inside) opens it in the canvas until its Show closed tab is clicked.',
      properties: [
        STATE('accordion'),
        { key: 'data-accordion-open', attr: true, label: 'Opens', type: 'segmented', default: '', options: [
          { id: '', name: 'Down' }, { id: 'up', name: 'Up' }],
          help: 'Up: the content opens above the header, which stays where it was clicked (an accordion at the foot of a page or in a footer).' },
        { key: 'data-accordion-single', attr: true, label: 'Others', type: 'toggle', text: 'Close the other accordions beside it when opened' },
        { key: 'data-accordion-focus', attr: true, label: 'In view', type: 'segmented', default: '', options: [
          { id: '', name: 'Off' }, { id: 'top', name: 'Top' }, { id: 'center', name: 'Center' }, { id: 'bottom', name: 'Bottom' }],
          help: 'Scrolls along as it opens: its header to the top, the whole item to the centre, or just far enough to show its end.' },
        { key: '--accordion-speed', label: 'Speed', type: 'range', min: 0, max: 1000, step: 50, unit: 'ms', default: 300 },
        { type: 'group', label: 'Colours' },
        { key: '--acc-bg', label: 'Background', type: 'color-alpha' },
        { key: '--acc-fg', label: 'Text', type: 'color' },
        { key: '--acc-border-color', label: 'Border', type: 'color-alpha' },
        { key: '--acc-head-bg', label: 'Header', type: 'color-alpha' },
        { key: '--acc-head-bg-hover', label: 'Header hover', type: 'color-alpha' },
        { key: '--acc-head-fg', label: 'Header text', type: 'color' },
        { key: '--acc-icon-color', label: 'Icon', type: 'color' },
        { type: 'group', label: 'Box' },
        { key: '--acc-border-width', label: 'Border width', type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 1 },
        { key: '--acc-border-style', label: 'Border style', type: 'select', placeholder: 'solid', options: BORDER_STYLES },
        { key: '--acc-radius', label: 'Corner radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 6 },
        { key: '--acc-gap', label: 'Space below', type: 'range', min: 0, max: 64, step: 1, unit: 'px', default: 8 },
        { key: '--acc-head-pad', label: 'Header padding', type: 'spacing', default: '14px 16px' },
        { key: '--acc-body-pad', label: 'Content padding', type: 'spacing', default: '0 16px 16px' },
        { type: 'group', label: 'Text' },
        { key: '--acc-title-size', label: 'Title size', type: 'range', min: 10, max: 40, step: 1, unit: 'px' },
        { key: '--acc-title-weight', label: 'Title weight', type: 'range', min: 100, max: 900, step: 100, default: 400 },
        { type: 'group', label: 'Effects' },
        { key: '--acc-shadow', label: 'Shadow', type: 'shadow' },
      ],
    });

    registerComponentPreset(editor, {
      id: 'accordion-item',
      name: 'Accordion',
      label: 'Accordion / Collapsible',
      category: 'Interactive',
      media: icons.card,
      classes: ['accordion-item'],
      droppable: false,
      partSettings: true,
      defaultComponents: `
        <div class="accordion-header">
          <span>Section title</span>
          <span class="accordion-icon">+</span>
        </div>
        <div class="accordion-body">
          <div class="accordion-body-inner">
            <p>Collapsible content goes here. Click the header to expand or collapse.</p>
          </div>
        </div>
      `,
    });

    registerComponentSettings('floating-panel-group', {
      title: 'Floating panel',
      description: 'Selecting it (or anything inside) opens the panel in the canvas until its Show closed tab is clicked.',
      properties: [
        STATE('panel'),
        { key: 'data-panel-dismiss', attr: true, label: 'Closing', type: 'toggle', valueTrue: 'outside', valueFalse: '',
          text: 'Also on a click outside or Esc' },
        { type: 'group', label: 'Placement' },
        { key: 'data-panel-place', attr: true, label: 'Opens', type: 'segmented', default: '', options: [
          { id: '', name: 'Below' }, { id: 'above', name: 'Above' }, { id: 'auto', name: 'Auto' }],
          help: 'Auto opens below, or above when the window has no room below.' },
        { key: 'data-panel-align', attr: true, label: 'Align', type: 'segmented', default: '', options: [
          { id: '', name: 'Start' }, { id: 'end', name: 'End' }] },
        { key: '--fp-offset', label: 'Distance', type: 'range', min: 0, max: 48, step: 1, unit: 'px', default: 8 },
        { key: '--fp-min-width', label: 'Min width', type: 'range', min: 120, max: 800, step: 10, unit: 'px', default: 280 },
        { key: '--fp-max-width', label: 'Max width', type: 'range', min: 160, max: 1200, step: 10, unit: 'px', default: 480 },
        { type: 'group', label: 'Colours' },
        { key: '--fp-bg', label: 'Background', type: 'color-alpha' },
        { key: '--fp-fg', label: 'Text', type: 'color' },
        { key: '--fp-border-color', label: 'Border', type: 'color-alpha' },
        { key: '--fp-bar-bg', label: 'Title bar', type: 'color-alpha' },
        { type: 'group', label: 'Box' },
        { key: '--fp-border-width', label: 'Border width', type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 1 },
        { key: '--fp-radius', label: 'Corner radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', default: 8 },
        { key: '--fp-bar-pad', label: 'Title bar padding', type: 'spacing', default: '10px 14px' },
        { key: '--fp-pad', label: 'Content padding', type: 'spacing', default: '16px' },
        { type: 'group', label: 'Effects' },
        { key: '--fp-shadow', label: 'Shadow', type: 'shadow' },
      ],
    });

    registerComponentPreset(editor, {
      id: 'floating-panel-group',
      name: 'Floating panel',
      label: 'Floating Panel (popover)',
      category: 'Interactive',
      media: icons.layers,
      classes: ['floating-panel-group'],
      droppable: false,
      partSettings: true,
      resizable: false,
      defaultComponents: `
        <span class="floating-panel-trigger btn btn-secondary">Open panel</span>
        <div class="floating-panel" data-floating-panel>
          <div class="floating-panel-bar">
            <span>Panel title</span>
            <button type="button" class="floating-panel-close" aria-label="Close">&times;</button>
          </div>
          <div class="floating-panel-body">
            <p>Anchored to the trigger. Move the wrapper to relocate the pair.</p>
          </div>
        </div>
      `,
    });
  },
});
