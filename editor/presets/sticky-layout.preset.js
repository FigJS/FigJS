// Sticky container: one component, three modes (a class, switchable):
//   Window  .sticky-window       the stage clips to a set height
//   Hold    .sticky-range        the stage holds still for a distance
//   Step    .sticky-scroll-step  Hold, tuned for stacking
// Shared settings: range, the side it holds at and the distance, lead-in,
// lead-out, inset, hold past container; Window adds its height.
// Mechanics in motion-scrubber.css. The stage (the only child) can take
// drops and be selected, not dragged or removed.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-sticky-layout',
  plugin: function (editor) {
    const {
      registerSimpleBlock, registerDependency, registerComponentSettings,
      registerComponentPreset, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/motion-scrubber.css');
    registerDependency('js', '/assets/js/sticky-hold.js');

    ['sticky-window-stage', 'sticky-range-inner', 'sticky-scroll-stage'].forEach((cls) => {
      editor.DomComponents.addType(cls, {
        isComponent(el) {
          if (el && el.classList && el.classList.contains(cls)) return { type: cls };
        },
        model: {
          defaults: {
            tagName: 'div', name: 'Sticky stage', classes: [cls],
            draggable: false, droppable: true, selectable: true,
            removable: false, copyable: false, stylable: true, resizable: true,
          },
        },
      });
    });

    const isWindow = (a) => a.hasClass('sticky-window');
    const isStep = (a) => a.hasClass('sticky-scroll-step');

    registerComponentSettings('sticky-container', {
      title: 'Sticky container',
      properties: [
        { key: 'mode', label: 'Mode', type: 'class-select', placeholder: 'Hold', rerender: true, options: [
          { id: 'sticky-window', name: 'Window (clips to a height)' },
          { id: 'sticky-range', name: 'Hold (stays fully visible)' },
          { id: 'sticky-scroll-step', name: 'Step (for stacked sequences)' } ] },
        { type: 'group', label: 'Scroll' },
        { key: '--stick-range', label: 'Total range', type: 'range', min: 100, max: 600, step: 10, unit: 'vh', default: 180,
          help: 'How much page scroll the container takes up.' },
        { key: 'data-stick-to', attr: true, label: 'Holds at', type: 'segmented', default: '', rerender: true, options: [
          { id: '', name: 'Top' }, { id: 'center', name: 'Center' }, { id: 'bottom', name: 'Bottom' } ],
          help: 'The side of the screen the stage holds at while the container scrolls past.' },
        { key: '--stick-top', label: 'Distance', type: 'range', min: 0, max: 100, step: 1, unit: 'vh', default: 0,
          when: (a) => a.readAttr('data-stick-to') !== 'center', help: 'From the edge it holds at.' },
        { key: '--stick-top', label: 'Offset', type: 'range', min: -50, max: 50, step: 1, unit: 'vh', default: 0,
          when: (a) => a.readAttr('data-stick-to') === 'center', help: 'Moves it up or down from the center.' },
        { key: '--stick-lead-in', label: 'Lead-in', type: 'range', min: 0, max: 100, step: 1, unit: 'vh', default: 0,
          help: 'Delays sticking.' },
        { key: '--stick-lead-out', label: 'Lead-out', type: 'range', min: 0, max: 100, step: 1, unit: 'vh', default: 0,
          help: 'Releases sooner.' },
        { key: '--stick-inset', label: 'Side inset', type: 'range', min: 0, max: 200, step: 4, unit: 'px', default: 0 },
        { key: 'data-sticky-hold', attr: true, label: 'After release', type: 'toggle', valueTrue: 'true', valueFalse: '',
          text: 'Stay visible (hold past container)', when: (a) => a.readAttr('data-stick-to') !== 'bottom' },
        { type: 'group', label: 'Window', when: isWindow },
        { key: '--stick-window', label: 'Window height', type: 'range', min: 20, max: 100, step: 2, unit: 'vh',
          default: 100, when: isWindow },
      ],
    });

    registerComponentPreset(editor, {
      id: 'sticky-container',
      label: 'Sticky container',
      name: 'Sticky container',
      category: 'Containers',
      media: icons.sticky,
      alternateClasses: ['sticky-window', 'sticky-range', 'sticky-scroll-step'],
      droppable: false,
      block: false,
      traits: [
        { type: 'button', name: 'add_step_below', label: 'Sequence', text: '+ Add step below',
          category: { id: 'c-sticky', label: 'Sticky', open: true },
          command(ed, trait) {
            const comp = trait && trait.target;
            const parent = comp && comp.parent && comp.parent();
            if (!parent) return;
            const added = parent.append(
              '<div class="sticky-scroll-step"><div class="sticky-scroll-stage"></div></div>',
              { at: comp.index() + 1 });
            const step = Array.isArray(added) ? added[0] : added;
            if (step) ed.select(step);
          } },
      ],
    });

    const block = (id, label, cls, stage) => registerSimpleBlock(editor, {
      id, label, category: 'Containers', media: icons.sticky,
      html: `<div class="${cls}"><div class="${stage}"></div></div>`,
    });
    block('sticky-window-default', 'Sticky Window', 'sticky-window', 'sticky-window-stage');
    block('sticky-range-default', 'Sticky Hold', 'sticky-range', 'sticky-range-inner');
    block('sticky-scroll-step-default', 'Sticky Step', 'sticky-scroll-step', 'sticky-scroll-stage');

    // Three stacked steps; each step's Distance overrides the :nth-child stagger.
    registerSimpleBlock(editor, {
      id: 'sticky-scroll-sequence',
      label: 'Sticky Scroll Sequence',
      category: 'Motion Presets',
      media: icons.sticky,
      html: `
        <div class="sticky-scroll-sequence">
          <div class="sticky-scroll-step"><div class="sticky-scroll-stage card pad-lg">
            <h2>Step 1: sticks near the top</h2>
            <p>Stays put while its container scrolls, then releases.</p>
          </div></div>
          <div class="sticky-scroll-step"><div class="sticky-scroll-stage card pad-lg">
            <h2>Step 2: sticks lower, overlaps step 1</h2>
            <p>Tune each step in Settings.</p>
          </div></div>
          <div class="sticky-scroll-step"><div class="sticky-scroll-stage card pad-lg">
            <h2>Step 3: sticks lower still</h2>
            <p>Several stages visible at once is what makes it read as layered.</p>
          </div></div>
        </div>`,
    });
  },
});
