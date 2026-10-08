// Entry point: installs every module, then boots when the canvas is ready.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const editor = FigJS.editor;
  if (!editor) {
    console.error('[editor] FigJS.editor missing: grapesjs-setup.js did not run.');
    return;
  }

  FigJS.boot.install();
  FigJS.ui.install();
  FigJS.pageBody.install();
  FigJS.settingsUI.install();
  FigJS.i18n.install();
  FigJS.pageTab.install();
  FigJS.media.install();
  FigJS.codeView.install();
  FigJS.presetsTab.install();
  FigJS.componentSettings.install();
  FigJS.library.install();
  FigJS.files.install();
  FigJS.preview.install();
  FigJS.styleManager.install();
  FigJS.thumbnails.install();
  FigJS.presetChips.install();
  FigJS.layers.install();
  FigJS.themeEdit.install();
  if (FigJS.site) FigJS.site.install();

  editor.onReady(async () => {
    FigJS.canvas.install(window.location.origin + '/');
    FigJS.canvas.installOutlineManager();

    // Dependencies first, so preset runtimes exist before a page loads.
    FigJS.canvas.ensureDeps();
    FigJS.canvas.syncHead();
    FigJS.ui.applyZoom(FigJS.ui.getZoomValue());

    // Reopen the last page or the home page (Site settings), or start an
    // empty page with the new-page body.
    let opened = false;
    try {
      const target = FigJS.site ? await FigJS.site.startupPage() : FigJS.files.lastFile();
      if (target) opened = await FigJS.files.loadFile(target, { force: true });
    } catch (e) {
      console.error('[editor] could not reopen the last page:', e);
    }

    if (!opened && !FigJS.state.currentFilePath && !FigJS.state.currentRawFile) {
      const wrapper = editor.getWrapper();
      if (wrapper && !wrapper.components().length) {
        try {
          const data = await (await fetch('/api/page-template')).json();
          FigJS.undo.untracked(() => wrapper.append((data && data.body) || '<main class="container pad-lg"></main>'));
        } catch (e) { }
      }
    }
    FigJS.pageTab.refresh();
  });

  FigJS.files.refreshTree();
  FigJS.presetsTab.render();
  FigJS.i18n.renderDropdown();
  FigJS.library.refreshList();
})();
