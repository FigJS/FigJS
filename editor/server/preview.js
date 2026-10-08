// Site preview: public/ served as the host serves it (_headers and
// _redirects applied, neither served), at the root of its own port.

'use strict';

const { headerRules, redirectRules, resolvePublicPath, serveFile } = require('./static');
const { PUBLIC_DIR, HEADERS_FILE, REDIRECTS_FILE } = require('./paths');

const HOST_FILES = new Set(['/_headers', '/_redirects']);

function createPreviewHandler() {
  const headers = headerRules(HEADERS_FILE);
  const redirects = redirectRules(REDIRECTS_FILE);

  return (req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
    catch (e) { res.writeHead(400); res.end('Bad request'); return; }

    if (HOST_FILES.has(urlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    // 200 is a rewrite (same URL, other file); 30x redirects.
    const redirect = redirects.match(urlPath);
    let servedPath = urlPath;
    if (redirect) {
      if (redirect.status === 200) {
        servedPath = redirect.to;
      } else {
        res.writeHead(redirect.status, { Location: redirect.to });
        res.end();
        return;
      }
    }

    const filePath = resolvePublicPath(PUBLIC_DIR, servedPath);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    // Header rules match the requested URL, as on the host.
    serveFile(req, res, filePath, headers.forPath(urlPath));
  };
}

module.exports = { createPreviewHandler };
