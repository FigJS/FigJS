// Marks Style Manager class chips whose class is a preset (.is-preset).

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  let installed = false;

  function classifyChips() {
    const registry = window.PresetRegistry;
    if (!registry || !registry.getPresetClasses) return;
    const presetClasses = registry.getPresetClasses();

    document.querySelectorAll('#gjs-clm-tags-c .gjs-clm-tag').forEach((chip) => {
      const nameEl = chip.querySelector('[data-tag-name]');
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      chip.classList.toggle('is-preset', presetClasses.has(name));
    });
  }

  function install() {
    if (installed) return;
    const editor = FigJS.editor;
    if (!editor) return;
    const sm = editor.SelectorManager;
    if (!sm) return;
    installed = true;

    const tagsView = sm.selectorTags;
    if (tagsView && typeof tagsView.render === 'function') {
      const origRender = tagsView.render.bind(tagsView);
      tagsView.render = function () {
        const el = origRender();
        classifyChips();
        return el;
      };
    }

    const selected = sm.selected;
    if (selected && selected.on) {
      const schedule = () => requestAnimationFrame(classifyChips);
      selected.on('add', schedule);
      selected.on('remove', schedule);
      selected.on('reset', schedule);
      selected.on('change:active', schedule);
    }

    requestAnimationFrame(classifyChips);
    setTimeout(classifyChips, 200);
  }

  FigJS.presetChips = { install };
})();