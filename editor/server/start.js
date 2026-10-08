// Starts FigJS and the site preview in one process and opens FigJS in
// the browser.
//   node editor/server/start.js [--port <n>] [--preview-port <n>] [--preview-only] [--no-open]
// A taken port moves on to the next free one; if FigJS already runs for
// this project, its address is opened again.

'use strict';

const http = require('http');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const config = require('./config');
const { ROOT_DIR } = require('./paths');

function option(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(name);

// Whether FigJS for this project answers on the port.
function editorAt(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 800 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).root === ROOT_DIR); } catch (e) { resolve(false); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// A listener on either loopback address. Binding alone doesn't tell: a
// program on all interfaces can leave 127.0.0.1 bindable.
function portBusy(port) {
  const probe = (host) => new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (busy) => { sock.destroy(); resolve(busy); };
    sock.setTimeout(400, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

function bind(handler, port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', reject);
    server.listen({ port, host, ipv6Only: host === '::1' }, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

// First free port from `port` up, on 127.0.0.1 and ::1, or on every
// interface with `everywhere`.
async function serve(handler, port, everywhere) {
  for (let p = port; p < Math.min(port + 20, 65536); p++) {
    if (await portBusy(p)) continue;
    try {
      if (everywhere) {
        await bind(handler, p, '::').catch(() => bind(handler, p, '0.0.0.0'));
      } else {
        await bind(handler, p, '127.0.0.1');
        await bind(handler, p, '::1').catch(() => {});
      }
      return p;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
    }
  }
  throw new Error(`no free port between ${port} and ${port + 19}.`);
}

function networkAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

function openBrowser(url) {
  let cmd; let args;
  if (process.platform === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '""', url]; }
  else if (process.platform === 'darwin') { cmd = 'open'; args = [url]; }
  else { cmd = 'xdg-open'; args = [url]; }
  try {
    const child = spawn(cmd, args, {
      detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
    });
    child.on('error', () => {});
    child.unref();
  } catch (e) { }
}

async function main() {
  const settings = config.read();
  const editorPort = config.validPort(option('--port')) || settings.port;
  const previewPort = config.validPort(option('--preview-port')) || settings.previewPort;
  const previewOnly = flag('--preview-only');
  const shouldOpen = !flag('--no-open') && settings.open;

  if (!previewOnly && await editorAt(editorPort)) {
    const url = `http://localhost:${editorPort}/`;
    console.log(`\n  FigJS is already running: ${url}\n`);
    if (shouldOpen) openBrowser(url);
    return;
  }

  const lines = [];
  const moved = (actual, wanted) => (actual !== wanted ? `  (${wanted} is in use)` : '');
  let editorUrl = null;

  if (!previewOnly) {
    const { createEditorHandler, summary } = require('./editor');
    const port = await serve(createEditorHandler(), editorPort, false);
    config.setRunning({ port });
    editorUrl = `http://localhost:${port}/`;
    lines.push(['FigJS', editorUrl + moved(port, editorPort)]);
  }

  const { createPreviewHandler } = require('./preview');
  const shared = settings.shareOnNetwork;
  const port = await serve(createPreviewHandler(), previewPort, shared);
  config.setRunning({ previewPort: port });
  const previewUrl = `http://localhost:${port}/`;
  lines.push(['Preview', previewUrl + moved(port, previewPort)]);
  const lan = shared && networkAddress();
  if (lan) lines.push(['', `from other devices: http://${lan}:${port}/`]);

  if (!previewOnly) {
    const s = require('./editor').summary();
    lines.push(['Project', ROOT_DIR]);
    lines.push(['', `${s.library} linked elements, ${s.fonts} fonts, ${s.games} game builds`]);
  }

  console.log('');
  lines.forEach(([label, text]) => console.log('  ' + label.padEnd(9) + text));
  console.log('');
  console.log('  Keep this window open while you work. Close it, or press Ctrl+C, to stop.');
  console.log('');

  if (shouldOpen) openBrowser(editorUrl || previewUrl);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  console.error('');
  console.error('  Could not start: ' + (err && err.message ? err.message : err));
  console.error('');
  process.exitCode = 1;
});
