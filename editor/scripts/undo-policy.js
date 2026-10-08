// Undo helpers over GrapesJS's UndoManager. Writes in the same
// synchronous run already undo as one step.
//   FigJS.undo.untracked(fn)   run fn without recording; returns its result
//   FigJS.undo.harden(editor)  exception-safe skip(); image sources follow undo/redo
//   FigJS.undo.clear()         empty the stack (page load)
// Live inputs preview with avoidStore and commit once from the value the
// gesture started at (settings-ui.js committer, the i18n-text trait).

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  function um() {
    const editor = FigJS.editor;
    return (editor && editor.UndoManager) || null;
  }

  function untracked(fn) {
    const manager = um();
    if (manager && typeof manager.skip === 'function') return manager.skip(fn);
    return fn();
  }

  // Redo restores an image's src attribute but not its src property,
  // which the canvas and the saved page use.
  function syncImageSources(editor) {
    const wrapper = editor.getWrapper && editor.getWrapper();
    if (!wrapper) return;
    untracked(() => wrapper.find('img').forEach((c) => {
      const attr = (c.getAttributes() || {}).src;
      if (attr && attr !== c.get('src')) c.set('src', attr);
    }));
  }

  // GrapesJS's skip() is stop(); fn(); start(): a throwing fn leaves
  // tracking off, and the return value is lost.
  function harden(editor) {
    const manager = editor && editor.UndoManager;
    if (!manager || manager.__hardened) return;
    manager.__hardened = true;
    editor.on('undo', () => syncImageSources(editor));
    editor.on('redo', () => syncImageSources(editor));
    manager.skip = function (fn) {
      const inner = this.um;
      const tracking = !!(inner && inner.isTracking && inner.isTracking());
      if (tracking) this.stop();
      try { return fn(); }
      finally { if (tracking) this.start(); }
    };
  }

  function clear() {
    const manager = um();
    if (manager && typeof manager.clear === 'function') manager.clear();
  }

  FigJS.undo = { untracked, harden, clear };
})();
