// Preview: GrapesJS's core:preview (eye button, key 5) plus
//   - the editor chrome hidden (body.is-previewing);
//   - the page as the site renders it, look only (canvas.js blocks
//     clicks, navigation and playback);
//   - View Components restored afterwards (core:preview turns it off).
//   FigJS.preview.install() / isActive() / stop()

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const PREVIEW_CMDS = ['core:preview', 'preview'];

  let active = false;
  let savedOutlineIntent = null;
  let savedZoom = null;

  function isActive() { return active; }

  function syncDevice() {
    let id = 'desktop';
    try {
      const d = FigJS.editor.getDevice();
      id = typeof d === 'string' ? d : ((d && d.get && d.get('id')) || id);
    } catch (e) {}
    document.body.dataset.device = id;
  }

  function enter() {
    if (active) return;
    const editor = FigJS.editor;
    if (!editor) return;
    active = true;

    // Read before core:preview stops the outline command and flips the button.
    const outlineBtn = editor.Panels.getButton('options', 'sw-visibility');
    savedOutlineIntent = outlineBtn ? outlineBtn.get('active') !== false : null;

    try { editor.select(null); } catch (e) {}
    syncDevice();
    document.body.classList.add('is-previewing');

    if (FigJS.ui && FigJS.ui.applyZoom) {
      savedZoom = FigJS.ui.getZoomValue ? FigJS.ui.getZoomValue() : null;
      FigJS.ui.applyZoom(100);
    }
    if (FigJS.canvas) FigJS.canvas.setPreviewActive(true);
    try { editor.refresh(); } catch (e) {}
  }

  function exit() {
    if (!active) return;
    const editor = FigJS.editor;
    active = false;

    document.body.classList.remove('is-previewing');
    if (FigJS.canvas) FigJS.canvas.setPreviewActive(false);

    // core:preview restarts the outline command while stopping, which can
    // leave the button on and outlines off: re-apply the saved state.
    const intent = savedOutlineIntent;
    savedOutlineIntent = null;
    if (intent != null) {
      setTimeout(() => {
        const outlineBtn = editor.Panels.getButton('options', 'sw-visibility');
        if (!outlineBtn) return;
        const cmd = outlineBtn.get('command') || 'core:component-outline';
        try { editor.stopCommand(cmd, { force: 1 }); } catch (e) {}
        outlineBtn.set('active', false);
        if (intent) {
          outlineBtn.set('active', true);
          try { if (!editor.Commands.isActive(cmd)) editor.runCommand(cmd, { force: 1 }); } catch (e) {}
        }
        if (FigJS.canvas) FigJS.canvas.setPreviewActive(false);
      }, 0);
    }

    if (FigJS.ui && FigJS.ui.applyZoom && savedZoom != null) FigJS.ui.applyZoom(savedZoom);
    savedZoom = null;
    try { editor.refresh(); } catch (e) {}
  }

  function stop() {
    const editor = FigJS.editor;
    if (editor) {
      PREVIEW_CMDS.forEach((id) => {
        try { if (editor.Commands.isActive(id)) editor.stopCommand(id); } catch (e) {}
      });
    }
    exit();
  }

  function install() {
    const editor = FigJS.editor;
    if (!editor) return;

    PREVIEW_CMDS.forEach((id) => {
      editor.on(`command:run:${id}`, enter);
      editor.on(`command:stop:${id}`, exit);
    });

    editor.on('change:device', syncDevice);

    const exitBtn = document.getElementById('exit-preview-btn');
    if (exitBtn) exitBtn.addEventListener('click', stop);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && active) stop();
    });
  }

  FigJS.preview = { install, isActive, stop };
})();
