// Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for the editor chrome, on window in the
// capture phase so keymaster (which skips inputs) never sees them.
//   - Ignored while a mouse button is held: a drag records its undo entry
//     when it ends, from its starting value, which would bury an undo made
//     mid-drag. canvas.js asks the same.
//   - Value fields (Style Manager, traits, Settings blocks, colour popover)
//     undo the page. Uncommitted typing is discarded first; native undo
//     would only rewind the field and commit the old text on blur.
//   - Other text inputs and contenteditable keep native undo.
//   - Search fields undo the page.

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const VALUE_FIELD = '.gjs-sm-property, .gjs-trt-trait, .fig-block, .fig-cp';

  function isTextLike(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const t = (el.type || 'text').toLowerCase();
    return t === 'text' || t === 'url' || t === 'email' || t === 'password';
  }

  function isValueField(el) {
    if (!el || el.isContentEditable) return false;
    if (!isTextLike(el) && !(el.tagName === 'INPUT' && el.type === 'number')) return false;
    return !!el.closest(VALUE_FIELD) && !el.closest('.fig-dialog');
  }

  // Mouse button held, in the editor window or the canvas.

  let held = false;

  function watchPointer(win) {
    if (!win || win.__figUndoPointer) return;
    win.__figUndoPointer = true;
    win.addEventListener('pointerdown', () => { held = true; }, true);
    win.addEventListener('pointerup', () => { held = false; }, true);
    win.addEventListener('pointercancel', () => { held = false; }, true);
    win.addEventListener('pointermove', (e) => { if (!e.buttons) held = false; }, true);
  }

  // Value of a field before typing started; cleared when it commits.

  const typedFrom = new WeakMap();

  document.addEventListener('beforeinput', (e) => {
    const t = e.target;
    if (isValueField(t) && !typedFrom.has(t)) typedFrom.set(t, t.value);
  }, true);
  ['change', 'focusout'].forEach((type) => {
    document.addEventListener(type, (e) => { typedFrom.delete(e.target); }, true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') typedFrom.delete(e.target);
  }, true);

  function discardTyping(field) {
    field.value = typedFrom.get(field);
    typedFrom.delete(field);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Blur closes the field's commit cycle (nothing pending, nothing
  // recorded); focus starts a new one from the restored value.
  function stepFromField(field, redo) {
    field.blur();
    step(redo);
    if (field.isConnected) field.focus({ preventScroll: true });
  }

  function step(redo) {
    const um = FigJS.editor && FigJS.editor.UndoManager;
    if (!um) return;
    if (redo) um.redo();
    else um.undo();
  }

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    // keyCode for layouts where e.key is not Latin.
    const k = (e.key || '').toLowerCase();
    const code = e.keyCode;
    const isZ = k === 'z' || code === 90;
    const isY = k === 'y' || code === 89;
    if (!isZ && !isY) return;
    const redo = isY || (isZ && e.shiftKey);

    // The canvas has its own forwarder (canvas.js).
    if (window !== window.top) return;

    if (held) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    const active = document.activeElement;

    if (isValueField(active)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (typedFrom.has(active)) discardTyping(active);
      else stepFromField(active, redo);
      return;
    }

    if (isTextLike(active)) return;

    // Leave focus outside the editor chrome alone.
    const inChrome = active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'SELECT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'BUTTON' ||
      active === document.body ||
      active === document.documentElement
    );
    if (!inChrome) return;

    // Keeps keymaster's window listener from firing the shortcut again.
    e.preventDefault();
    e.stopImmediatePropagation();
    step(redo);
  }, true);

  watchPointer(window);

  FigJS.undoKeys = {
    watchPointer,
    pointerHeld: () => held,
  };
})();
