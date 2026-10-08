// The document a new page starts as, with the site defaults from
// site.json (favicon, theme colour, description, language, theme).
// BODY_TEMPLATE is also the body of the empty page FigJS opens with.

'use strict';

const fs = require('fs');
const path = require('path');

const BOOT_BLOCKS_FILE = path.join(__dirname, '..', 'scripts', 'boot-blocks.html');

function bootBlocks() {
  // Read per call, so boot-blocks.html edits apply without a restart; its own comment is dropped.
  try { return fs.readFileSync(BOOT_BLOCKS_FILE, 'utf-8').replace(/<!--[\s\S]*?-->/g, '').trim(); }
  catch (e) { return ''; }
}

// Served at /api/page-template.
const BODY_TEMPLATE = '<main class="container pad-lg"></main>';

function escAttr(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fullPageHtml(opts) {
  const o = typeof opts === 'string' ? { title: opts } : (opts || {});
  const site = o.site || {};
  const title = String(o.title || 'untitled').replace(/\.html$/i, '');
  const lang = site.defaultLang || 'en';
  const theme = site.defaultTheme || 'auto';

  const head = [
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>${escAttr(site.name ? `${title} | ${site.name}` : title)}</title>`,
    bootBlocks(),
  ];
  if (site.description) head.push(`  <meta name="description" content="${escAttr(site.description)}">`);
  if (site.themeColor) head.push(`  <meta name="theme-color" content="${escAttr(site.themeColor)}">`);
  if (site.favicon) head.push(`  <link rel="icon" href="${escAttr(site.favicon)}">`);
  head.push(
    '  <link rel="stylesheet" href="/assets/css/site.css">',
    '  <link rel="stylesheet" href="/assets/css/theme.css">',
    '  <link rel="stylesheet" href="/assets/css/presets.css">',
    '  <link rel="stylesheet" href="/assets/fonts/fonts.css">',
    '  <link rel="stylesheet" href="/assets/css/library.css">',
    '  <script src="/assets/js/theme-i18n.js" defer></script>',
  );

  return [
    '<!DOCTYPE html>',
    `<html lang="${escAttr(lang)}" data-lang="${escAttr(lang)}" data-theme-requested="${escAttr(theme)}">`,
    '<head>',
    head.join('\n'),
    '</head>',
    `<body data-lang="${escAttr(lang)}" data-theme-requested="${escAttr(theme)}" data-text-md="on">`,
    '  ' + BODY_TEMPLATE,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

module.exports = { fullPageHtml, BODY_TEMPLATE };
