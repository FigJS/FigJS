// Local server settings in editor.config.json (created on first change):
//   port            FigJS, default 8081
//   previewPort     site preview, default 3000
//   open            open the browser on start
//   shareOnNetwork  preview reachable from other devices on the network
// --port, --preview-port and --no-open override them for one run; changes
// apply on the next start.

'use strict';

const fs = require('fs');
const { CONFIG_FILE } = require('./paths');

const DEFAULTS = { port: 8081, previewPort: 3000, open: true, shareOnNetwork: false };

let current = { port: null, previewPort: null };

function validPort(n) {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 && v < 65536 ? v : null;
}

function read() {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) || {}; } catch (e) {}
  return {
    port: validPort(stored.port) || DEFAULTS.port,
    previewPort: validPort(stored.previewPort) || DEFAULTS.previewPort,
    open: stored.open !== false,
    shareOnNetwork: stored.shareOnNetwork === true,
  };
}

function write(values) {
  const next = read();
  if (values && 'port' in values) next.port = validPort(values.port) || DEFAULTS.port;
  if (values && 'previewPort' in values) next.previewPort = validPort(values.previewPort) || DEFAULTS.previewPort;
  if (values && 'open' in values) next.open = values.open !== false;
  if (values && 'shareOnNetwork' in values) next.shareOnNetwork = values.shareOnNetwork === true;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  return next;
}

function setRunning(ports) { current = { ...current, ...ports }; }
function running() { return { ...current }; }

module.exports = { DEFAULTS, read, write, validPort, setRunning, running };
