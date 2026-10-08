// Project paths. The root holds public/ (two levels up); nothing outside
// it is read or written.
//   public/             the site, deployed as is
//   drafts/             unpublished pages
//   library/            linked elements, one JSON file each
//   site.json           site settings
//   editor.config.json  local server settings (optional)

'use strict';

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  EDITOR_DIR: path.resolve(__dirname, '..'),
  DRAFTS_DIR: path.join(ROOT_DIR, 'drafts'),
  LIBRARY_DIR: path.join(ROOT_DIR, 'library'),
  SITE_FILE: path.join(ROOT_DIR, 'site.json'),
  CONFIG_FILE: path.join(ROOT_DIR, 'editor.config.json'),
  HEADERS_FILE: path.join(PUBLIC_DIR, '_headers'),
  REDIRECTS_FILE: path.join(PUBLIC_DIR, '_redirects'),
};
