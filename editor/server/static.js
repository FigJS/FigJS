// Static serving shared by FigJS and the site preview, so pages behave
// as on the host (Cloudflare Pages / Netlify formats):
//   mimeFor()            content types
//   headerRules(file)    public/_headers, re-read on change
//   redirectRules(file)  public/_redirects (200 rewrites, 30x)
//   resolvePublicPath()  host-style URL -> file
//   serveFile()          static file with Range and HEAD
// Media seeking needs real 206 responses to Range requests.

'use strict';

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.pdf':  'application/pdf',

  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',

  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.aac':  'audio/aac',
  '.ogg':  'audio/ogg',
  '.oga':  'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav':  'audio/wav',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',

  '.mp4':  'video/mp4',
  '.m4v':  'video/mp4',
  '.webm': 'video/webm',
  '.ogv':  'video/ogg',
  '.mov':  'video/quicktime',
  '.mkv':  'video/x-matroska',

  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',

  // Godot Web exports.
  '.wasm': 'application/wasm',
  '.pck':  'application/octet-stream',
};

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function isInside(parentDir, candidatePath) {
  const rel = path.relative(parentDir, candidatePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Patterns for _headers and _redirects: `*` splats (any characters,
// including /) and `:name` (one segment), matched against the path.
function compilePattern(pattern) {
  let re = '';
  let splats = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') { re += '(.*)'; splats++; continue; }
    if (ch === ':' && /[A-Za-z]/.test(pattern[i + 1] || '')) {
      let j = i + 1;
      while (j < pattern.length && /\w/.test(pattern[j])) j++;
      re += '([^/]+)';
      i = j - 1;
      continue;
    }
    re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return { regex: new RegExp('^' + re + '$'), splats };
}

// Re-parses only when the file's mtime changes.
function watchedParse(file, parse) {
  let cachedMtime = -1;
  let cached = parse('');
  return function current() {
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch (e) { mtime = 0; }
    if (mtime !== cachedMtime) {
      cachedMtime = mtime;
      let text = '';
      try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { text = ''; }
      cached = parse(text);
    }
    return cached;
  };
}

// _headers: a URL pattern line, then indented "Name: value" lines;
// whole-line # comments ignored. Later matching rules win per header.
function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) { current = null; continue; }
    if (line.trimStart().startsWith('#')) continue;
    if (!/^[ \t]/.test(line)) {
      current = { pattern: line.trim(), headers: {}, matcher: compilePattern(line.trim()) };
      rules.push(current);
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx > -1) current.headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return rules;
}

function headerRules(file) {
  const current = watchedParse(file, parseHeaders);
  return {
    rules: () => current(),
    forPath(urlPath) {
      const merged = {};
      current().forEach((rule) => {
        if (rule.matcher.regex.test(urlPath)) Object.assign(merged, rule.headers);
      });
      return merged;
    },
  };
}

// _redirects: /from /to [status]. 200 rewrites (the home page:
// `/ /x.html 200`); 301/302/303/307/308 redirect. Splats carry over
// (/blog/* /posts/:splat 301).
function parseRedirects(text) {
  const rules = [];
  String(text).split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    if (parts.length < 2) return;
    const status = parts[2] ? parseInt(parts[2], 10) : 301;
    rules.push({ from: parts[0], to: parts[1], status, matcher: compilePattern(parts[0]) });
  });
  return rules;
}

function redirectRules(file) {
  const current = watchedParse(file, parseRedirects);
  return {
    rules: () => current(),
    match(urlPath) {
      for (const rule of current()) {
        const m = rule.matcher.regex.exec(urlPath);
        if (!m) continue;
        let to = rule.to;
        if (rule.matcher.splats && m[1] != null) to = to.replace(/:splat/g, m[1]);
        return { to, status: rule.status };
      }
      return null;
    },
  };
}

// URL -> file as static hosts resolve it: /dir/ -> dir/index.html,
// /page -> page.html or page/index.html. null when nothing matches or
// the path leaves root.
function resolvePublicPath(rootDir, urlPath) {
  const candidates = [];
  if (urlPath.endsWith('/')) {
    candidates.push(urlPath + 'index.html');
  } else {
    candidates.push(urlPath);
    if (!path.extname(urlPath)) {
      candidates.push(urlPath + '.html');
      candidates.push(urlPath + '/index.html');
    }
  }
  for (const rel of candidates) {
    const full = path.normalize(path.join(rootDir, rel));
    if (full !== rootDir && !isInside(rootDir, full)) return null;
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch (e) { }
  }
  return null;
}

// Static file with Range and HEAD.
function serveFile(req, res, filePath, extraHeaders) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const headers = Object.assign({
      'Content-Type': mimeFor(filePath),
      'Accept-Ranges': 'bytes',
    }, extraHeaders || {});

    const size = stat.size;
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const spec = range.slice(6).split(',')[0].trim();
      let start;
      let end;
      if (spec.startsWith('-')) {
        const n = parseInt(spec.slice(1), 10);
        start = Math.max(0, size - (isNaN(n) ? 0 : n));
        end = size - 1;
      } else {
        const [a, b] = spec.split('-');
        start = parseInt(a, 10);
        end = b ? parseInt(b, 10) : size - 1;
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      end = Math.min(end, size - 1);
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = String(end - start + 1);
      res.writeHead(206, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    headers['Content-Length'] = String(size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = {
  MIME_TYPES,
  mimeFor,
  isInside,
  compilePattern,
  parseHeaders,
  headerRules,
  parseRedirects,
  redirectRules,
  resolvePublicPath,
  serveFile,
};
