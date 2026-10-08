// Boot blocks (boot-blocks.html) carried in every saved page's head.
// Saving replaces the page's copy; blocks are compared after
// normalizing, so any edit to boot-blocks.html reaches each page on
// its next save.
//   FigJS.boot.install()           fetch once per session
//   FigJS.boot.getBlocks()         cached HTML ('' until loaded)
//   FigJS.boot.isInstalledIn(doc)  head carries the current blocks
//   FigJS.boot.stripFrom(doc)      remove the blocks from a head

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const BOOT_SELECTOR =
    '[data-boot-critical], [data-boot-init], [data-boot-release]';

  let _blocksHtml = '';
  let _loadPromise = null;

  function install() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = fetch('/scripts/boot-blocks.html', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
      .then((text) => {
        // The file's own comment is not part of the blocks.
        _blocksHtml = text.replace(/<!--[\s\S]*?-->/g, '').trim();
        return _blocksHtml;
      });
    return _loadPromise;
  }

  function getBlocks() {
    return _blocksHtml;
  }

  // Comments, whitespace and empty attribute values (data-x="" vs
  // data-x) are the only differences a parse/serialize round trip makes.
  function normalize(html) {
    return String(html || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/(\s+[\w-]+)=""/g, '$1')
      .trim();
  }

  function currentSignature() {
    return _blocksHtml ? normalize(_blocksHtml) : '';
  }

  function fileSignature(doc) {
    if (!doc || !doc.head) return '';
    const els = Array.from(doc.head.querySelectorAll(BOOT_SELECTOR));
    if (els.length !== 3) return '';
    return normalize(els.map((n) => n.outerHTML).join('\n'));
  }

  function isInstalledIn(doc) {
    const current = currentSignature();
    if (!current) return false;
    return fileSignature(doc) === current;
  }

  // Removes the boot blocks and any comments in <head>.
  function stripFrom(doc) {
    if (!doc || !doc.head) return;
    doc.head.querySelectorAll(BOOT_SELECTOR).forEach((n) => {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    Array.from(doc.head.childNodes).forEach((n) => {
      if (n.nodeType === 8) doc.head.removeChild(n);
    });
  }

  FigJS.boot = { install, getBlocks, isInstalledIn, stripFrom };
})();