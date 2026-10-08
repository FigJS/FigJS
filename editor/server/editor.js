// FigJS HTTP server: the editor shell (cross-origin isolated, so pages
// and games opened from it can use SharedArrayBuffer), public/ with the
// host's header and redirect rules, and the /api/* endpoints.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const {
  isInside, headerRules, redirectRules, resolvePublicPath, serveFile,
} = require('./static');
const { fullPageHtml, BODY_TEMPLATE } = require('./page-template');
const {
  ROOT_DIR, PUBLIC_DIR, EDITOR_DIR, DRAFTS_DIR, LIBRARY_DIR, SITE_FILE,
  HEADERS_FILE, REDIRECTS_FILE,
} = require('./paths');
const config = require('./config');

const LIBRARY_CSS_FILE = path.join(PUBLIC_DIR, 'assets', 'css', 'library.css');
const FONTS_DIR = path.join(PUBLIC_DIR, 'assets', 'fonts');
const FONTS_CSS_FILE = path.join(FONTS_DIR, 'fonts.css');
const NOISE_DIR = path.join(PUBLIC_DIR, 'assets', 'noise');
const GAMES_DIR = path.join(PUBLIC_DIR, 'games');

const headers = headerRules(HEADERS_FILE);
const redirects = redirectRules(REDIRECTS_FILE);

const EDITABLE_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.txt', '.md']);

// The shell gets the site's isolation (COOP same-origin, COEP
// credentialless), so every document nested in it can be isolated too.
const EDITOR_PREFIXES = ['/vendor/', '/presets/', '/scripts/', '/styles/'];
const EDITOR_SHELL_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// ===================================================================
// Small helpers
// ===================================================================

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE });
  res.end(JSON.stringify(data));
}

function sendError(res, err) {
  sendJson(res, err.statusCode || 500, { error: err.message || String(err) });
}

function resolveEditablePath(relPathFromRoot) {
  const fullPath = path.normalize(path.join(ROOT_DIR, String(relPathFromRoot || '')));
  if (isInside(PUBLIC_DIR, fullPath) || isInside(DRAFTS_DIR, fullPath)) return fullPath;
  return null;
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'upload';
}

function uniqueDestination(dir, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = filename;
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  return candidate;
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readBody(req, limitBytes) {
  const max = limitBytes || 512 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > max) {
        aborted = true;
        const err = new Error('Request body exceeds ' + Math.round(max / 1024 / 1024) + 'MB limit.');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!aborted) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function readJsonBody(req, limitBytes) {
  const buf = await readBody(req, limitBytes || 200 * 1024 * 1024);
  try { return JSON.parse(buf.toString('utf-8') || '{}'); }
  catch (e) { const err = new Error('Malformed JSON body'); err.statusCode = 400; throw err; }
}

function walkFiles(dir, relBase, extensions, skipDirs, onFile) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = relBase ? relBase + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (skipDirs && skipDirs.has(entry.name)) continue;
      walkFiles(full, rel, extensions, skipDirs, onFile);
    } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
      onFile(full, rel);
    }
  }
}

// Every .html/.css under public/ (games excluded) and every draft.
function scanUsage(regex, opts) {
  const hits = [];
  const skip = new Set(['games'].concat((opts && opts.skip) || []));
  const record = (full, rel) => {
    let text;
    try { text = fs.readFileSync(full, 'utf-8'); } catch { return; }
    const matches = text.match(regex);
    if (matches) hits.push({ path: rel, count: matches.length });
  };
  walkFiles(PUBLIC_DIR, 'public', new Set(['.html', '.css']), skip, record);
  walkFiles(DRAFTS_DIR, 'drafts', new Set(['.html']), null, record);
  hits.sort((a, b) => a.path.localeCompare(b.path));
  return hits;
}

// ===================================================================
// File tree
// ===================================================================

function buildTree(dirPath, rootLabel) {
  const name = path.basename(dirPath);
  const relPath = path.relative(ROOT_DIR, dirPath).replace(/\\/g, '/');
  const node = { name: rootLabel || name, path: relPath, type: 'dir', children: [] };

  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch { return node; }

  // games/ subfolders hold exports, not pages: only its top level is listed.
  const isGamesFolder = path.resolve(dirPath) === path.resolve(GAMES_DIR);

  entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (isGamesFolder) continue;
      const child = buildTree(entryPath, null);
      if (child.children.length > 0) node.children.push(child);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!EDITABLE_EXTENSIONS.has(ext)) continue;
      node.children.push({
        name: entry.name,
        path: path.relative(ROOT_DIR, entryPath).replace(/\\/g, '/'),
        type: 'file',
        ext,
      });
    }
  }
  return node;
}

// Media: one folder per kind under public/assets/, accepted extensions,
// and a content-hash index, so identical bytes return the existing file.
// Fonts share the dedup and keep their own manifest.

const MEDIA_KINDS = {
  image: { dir: path.join(PUBLIC_DIR, 'assets', 'images'), url: '/assets/images/',
           exts: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico']) },
  audio: { dir: path.join(PUBLIC_DIR, 'assets', 'audio'), url: '/assets/audio/',
           exts: new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.weba']) },
  video: { dir: path.join(PUBLIC_DIR, 'assets', 'video'), url: '/assets/video/',
           exts: new Set(['.mp4', '.m4v', '.webm', '.ogv', '.mov']) },
  font:  { dir: FONTS_DIR, url: '/assets/fonts/',
           exts: new Set(['.woff2', '.woff', '.ttf', '.otf']) },
};

function kindForFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return Object.keys(MEDIA_KINDS).find((k) => MEDIA_KINDS[k].exts.has(ext)) || null;
}

// sha256 -> filename per kind, built lazily and kept current by upload
// and delete; files added by hand appear when it is rebuilt.
const hashIndexes = {};
function hashIndex(kind) {
  if (hashIndexes[kind]) return hashIndexes[kind];
  const spec = MEDIA_KINDS[kind];
  const map = new Map();
  try {
    for (const file of fs.readdirSync(spec.dir)) {
      if (!spec.exts.has(path.extname(file).toLowerCase())) continue;
      try { map.set(hashBuffer(fs.readFileSync(path.join(spec.dir, file))), file); } catch (e) {}
    }
  } catch (e) { }
  hashIndexes[kind] = map;
  return map;
}

function forgetFromIndex(kind, filename) {
  const map = hashIndexes[kind];
  if (!map) return;
  for (const [hash, name] of map.entries()) {
    if (name === filename) { map.delete(hash); break; }
  }
}

function listMedia(kind) {
  const spec = MEDIA_KINDS[kind];
  let files = [];
  try { files = fs.readdirSync(spec.dir); } catch (e) { return []; }
  return files
    .filter((f) => !f.startsWith('_') && spec.exts.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => {
      let size = 0;
      try { size = fs.statSync(path.join(spec.dir, f)).size; } catch (e) {}
      return { kind, name: f, url: spec.url + f, size };
    });
}

// Writes buf unless identical bytes exist. Returns { name, url, deduped }.
function storeMedia(kind, filename, buf) {
  const spec = MEDIA_KINDS[kind];
  fs.mkdirSync(spec.dir, { recursive: true });
  const hash = hashBuffer(buf);
  const index = hashIndex(kind);
  const existing = index.get(hash);
  if (existing && fs.existsSync(path.join(spec.dir, existing))) {
    return { name: existing, url: spec.url + existing, deduped: true };
  }
  const finalName = uniqueDestination(spec.dir, sanitizeFilename(filename));
  fs.writeFileSync(path.join(spec.dir, finalName), buf);
  index.set(hash, finalName);
  return { name: finalName, url: spec.url + finalName, deduped: false };
}

// Fonts: every file in public/assets/fonts/. Family, weight, style and
// display come from the file name unless set in site.json "fonts";
// fonts.css is regenerated on every change.

const FONT_WEIGHT_KEYWORDS = {
  thin: 100, hairline: 100,
  extralight: 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, book: 400, roman: 400,
  medium: 500,
  semibold: 600, demibold: 600,
  bold: 700,
  extrabold: 800, ultrabold: 800,
  black: 900, heavy: 900,
};

//   "MyFont-Bold.woff2"        -> "MyFont", 700, normal
//   "MyFont-BoldItalic.woff2"  -> "MyFont", 700, italic
//   "Open Sans Regular.ttf"    -> "Open Sans", 400, normal
function parseFontFilename(filename) {
  const stem = path.basename(filename, path.extname(filename))
    // A trailing -N dedup suffix is not part of the family.
    .replace(/-\d+$/, '');
  const tokens = stem.replace(/[-_]+/g, ' ').trim().split(/\s+/);

  let weight = 400;
  let style = 'normal';
  let i = tokens.length - 1;
  while (i >= 0) {
    const t = tokens[i].toLowerCase();
    if (t === 'italic' || t === 'oblique') { style = 'italic'; i--; continue; }
    if (t.endsWith('italic') || t.endsWith('oblique')) {
      style = 'italic';
      const base = t.replace(/(italic|oblique)$/, '');
      if (base && FONT_WEIGHT_KEYWORDS[base] != null) weight = FONT_WEIGHT_KEYWORDS[base];
      i--;
      continue;
    }
    if (FONT_WEIGHT_KEYWORDS[t] != null) { weight = FONT_WEIGHT_KEYWORDS[t]; i--; continue; }
    break;
  }
  const familyTokens = tokens.slice(0, i + 1);
  return { family: familyTokens.length ? familyTokens.join(' ') : stem, weight, style };
}

function loadFontsManifest() {
  const stored = readSite().fonts;
  return { metadata: stored && typeof stored === 'object' ? { ...stored } : {} };
}

function saveFontsManifest(manifest) {
  const site = readSite();
  site.fonts = manifest.metadata || {};
  writeSite(site);
  writeFontsCss();
}

function getEffectiveFonts() {
  const meta = loadFontsManifest().metadata || {};
  return listMedia('font').map(({ name }) => {
    const stored = meta[name];
    const guessed = parseFontFilename(name);
    return {
      id: name,
      file: name,
      family: (stored && stored.family) || guessed.family,
      weight: (stored && stored.weight != null) ? stored.weight : guessed.weight,
      style: (stored && stored.style) || guessed.style,
      display: (stored && stored.display) || 'swap',
      unregistered: !stored,
    };
  });
}

// One @font-face per family, weight and style.
function writeFontsCss(fonts) {
  const list = fonts || getEffectiveFonts();
  const seen = new Set();
  const faces = [];
  list
    .slice()
    .sort((a, b) => a.family.localeCompare(b.family) || (a.weight - b.weight)
      || a.style.localeCompare(b.style) || a.file.localeCompare(b.file))
    .forEach((v) => {
      const key = v.family.toLowerCase() + '|' + v.weight + '|' + v.style;
      if (seen.has(key)) return;
      seen.add(key);
      faces.push(v);
    });

  const formatFor = (file) => ({
    '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype',
  }[path.extname(file).toLowerCase()] || 'woff2');

  const lines = [];
  faces.forEach((v) => {
    lines.push('@font-face {');
    lines.push('  font-family: ' + JSON.stringify(v.family) + ';');
    lines.push('  src: url("/assets/fonts/' + encodeURI(v.file) + '") format("' + formatFor(v.file) + '");');
    lines.push('  font-weight: ' + v.weight + ';');
    lines.push('  font-style: ' + v.style + ';');
    lines.push('  font-display: ' + (v.display || 'swap') + ';');
    lines.push('}');
    lines.push('');
  });

  const next = lines.join('\n');
  let prev = null;
  try { prev = fs.readFileSync(FONTS_CSS_FILE, 'utf-8'); } catch (e) {}
  if (prev === next) return;
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  fs.writeFileSync(FONTS_CSS_FILE, next, 'utf-8');
}

// Godot exports: one per public/games/<folder>/, with whether it needs
// threads (cross-origin isolation) and whether it is a PWA.

function describeGodotExport(folderName, htmlName) {
  const folderPath = path.join(GAMES_DIR, folderName);
  const stem = htmlName.replace(/\.html$/i, '');
  let files = [];
  try { files = fs.readdirSync(folderPath); } catch (e) {}
  const has = (f) => files.includes(f);

  let html = '';
  try { html = fs.readFileSync(path.join(folderPath, htmlName), 'utf-8'); } catch (e) {}

  // $GODOT_CONFIG is substituted with a JSON object literal.
  let config = null;
  const cfgMatch = html.match(/new\s+Engine\(\s*(\{[\s\S]*?\})\s*\)/) ||
                   html.match(/GODOT_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (cfgMatch) { try { config = JSON.parse(cfgMatch[1]); } catch (e) { config = null; } }
  const executable = (config && config.executable) || stem;

  // GODOT_THREADS_ENABLED from the default shell, else Emscripten's
  // pthread runtime in the engine script.
  let threads = null;
  const thrMatch = html.match(/GODOT_THREADS_ENABLED\s*=\s*(true|false)/);
  if (thrMatch) threads = thrMatch[1] === 'true';
  if (threads == null && has(executable + '.js')) {
    try {
      const js = fs.readFileSync(path.join(folderPath, executable + '.js'), 'utf-8');
      threads = /\bPThread\b/.test(js) || (/\bSharedArrayBuffer\b/.test(js) && /new Worker/.test(js));
    } catch (e) {}
  }

  const manifest = has(stem + '.manifest.json') ? stem + '.manifest.json' : null;
  const serviceWorker = (config && config.serviceWorker) ||
    (has(stem + '.service.worker.js') ? stem + '.service.worker.js' : null);

  const iconCandidates = [`${stem}.icon.png`, `${stem}.apple-touch-icon.png`, `${stem}.png`];
  const icon = iconCandidates.find(has);

  let size = 0;
  files.forEach((f) => {
    if (/\.(wasm|pck|js)$/i.test(f)) {
      try { size += fs.statSync(path.join(folderPath, f)).size; } catch (e) {}
    }
  });

  return {
    folder: folderName,
    html: htmlName,
    url: `/games/${folderName}/${htmlName}`,
    icon: icon ? `/games/${folderName}/${icon}` : null,
    threads: threads === true,
    pwa: !!(manifest && serviceWorker),
    serviceWorker: !!serviceWorker,
    ensureCoiHeaders: !!(config && config.ensureCrossOriginIsolationHeaders),
    size,
  };
}

function listGodotExports() {
  const results = [];
  let folders = [];
  try { folders = fs.readdirSync(GAMES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()); }
  catch (e) { return results; }
  for (const folder of folders) {
    let entries = [];
    try { entries = fs.readdirSync(path.join(GAMES_DIR, folder.name), { withFileTypes: true }); }
    catch (e) { continue; }
    entries
      .filter((e) => e.isFile() && /\.html$/i.test(e.name) && !/offline/i.test(e.name))
      .forEach((f) => results.push(describeGodotExport(folder.name, f.name)));
  }
  results.sort((a, b) => a.folder.localeCompare(b.folder));
  return results;
}

// Library: one JSON file per item under library/; shared rules in
// public/assets/css/library.css. An item's html is the master whose
// settings apply to its instances on page load.

function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function libraryItemFile(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) return null;
  return path.join(LIBRARY_DIR, id + '.json');
}

function readLibraryItems() {
  const items = [];
  try {
    for (const f of fs.readdirSync(LIBRARY_DIR)) {
      if (!f.endsWith('.json')) continue;
      try { items.push(JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, f), 'utf-8'))); }
      catch (e) { }
    }
  } catch (e) {}
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
}

const LIBRARY_CSS_HEADER = '';

// Site settings in site.json. The home page reaches the host as a 200
// rewrite of "/" in public/_redirects; other rules stay.

const SITE_DEFAULTS = {
  name: 'My Site',
  baseUrl: '',
  homePage: 'public/index.html',
  openOnStart: 'last',          // 'last' | 'home' | 'none'
  defaultLang: 'en',
  defaultTheme: 'auto',
  favicon: '',
  themeColor: '#000000',
  description: '',
  socialImage: '',
};

function readSite() {
  try { return { ...SITE_DEFAULTS, ...JSON.parse(fs.readFileSync(SITE_FILE, 'utf-8')) }; }
  catch (e) { return { ...SITE_DEFAULTS }; }
}

function writeSite(site) {
  fs.writeFileSync(SITE_FILE, JSON.stringify(site, null, 2) + '\n', 'utf-8');
}

// The home page is the rule rewriting "/" (status 200); public/ carries no
// comments, so neither marks nor any other comment lines are written.
const HOME_RULE_RE = /^\/[ \t]+\S+[ \t]+200!?[ \t]*$/;

function writeHomeRewrite(homePage) {
  let text = '';
  try { text = fs.readFileSync(REDIRECTS_FILE, 'utf-8'); } catch (e) {}
  const lines = text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l) && !HOME_RULE_RE.test(l.trim()));

  const rel = String(homePage || '').replace(/\\/g, '/');
  if (rel.startsWith('public/') && rel !== 'public/index.html') {
    lines.unshift('/  /' + rel.slice('public/'.length) + '  200');
  }
  const next = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (next) fs.writeFileSync(REDIRECTS_FILE, next + '\n', 'utf-8');
  else if (fs.existsSync(REDIRECTS_FILE)) fs.unlinkSync(REDIRECTS_FILE);
}

function listPages() {
  const pages = [];
  walkFiles(PUBLIC_DIR, 'public', new Set(['.html']), new Set(['games', 'assets']), (full, rel) => pages.push(rel));
  // games/index.html is a page even though games/ subfolders are not.
  if (fs.existsSync(path.join(GAMES_DIR, 'index.html'))) pages.push('public/games/index.html');
  walkFiles(DRAFTS_DIR, 'drafts', new Set(['.html']), null, (full, rel) => pages.push(rel));
  return Array.from(new Set(pages)).sort();
}

// ===================================================================
// Startup
// ===================================================================

function ensureDirs() {
  try {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(LIBRARY_CSS_FILE), { recursive: true });
    if (!fs.existsSync(LIBRARY_CSS_FILE)) fs.writeFileSync(LIBRARY_CSS_FILE, LIBRARY_CSS_HEADER, 'utf-8');
  } catch (e) { console.error('Could not create library dir:', e.message); }
  try {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    writeFontsCss();
  } catch (e) { console.error('Could not prepare fonts dir:', e.message); }
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}
// ===================================================================
// Routes
// ===================================================================

const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

// ---- Files ---------------------------------------------------------

route('GET', '/api/files', (req, res) => {
  sendJson(res, 200, { tree: [
    buildTree(PUBLIC_DIR, 'public (the site)'),
    buildTree(DRAFTS_DIR, 'drafts (not published)'),
  ] });
});

route('GET', '/api/load', (req, res, { query }) => {
  const fullPath = resolveEditablePath(query.get('path'));
  if (!fullPath) { res.writeHead(403); res.end('Forbidden or missing path'); return; }
  fs.readFile(fullPath, 'utf-8', (err, content) => {
    if (err) { res.writeHead(404); res.end('File not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE });
    res.end(content);
  });
});

route('POST', '/api/save', async (req, res) => {
  const { targetPath, htmlContent } = await readJsonBody(req);
  const fullPath = resolveEditablePath(targetPath);
  if (!fullPath) { res.writeHead(403); res.end('Forbidden or missing path'); return; }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, String(htmlContent == null ? '' : htmlContent), 'utf-8');
  console.log(`[SAVED] ${targetPath} (${Math.round(String(htmlContent || '').length / 1024)}KB)`);
  sendJson(res, 200, { status: 'success' });
});

// where: 'draft' (drafts/) or 'public' (folder relative to public/).
route('POST', '/api/new-page', async (req, res) => {
  const { name, where, folder, title } = await readJsonBody(req);
  const base = sanitizeFilename(name || 'untitled').replace(/\.html$/i, '') + '.html';
  let dir = DRAFTS_DIR;
  if (where === 'public') {
    dir = path.normalize(path.join(PUBLIC_DIR, String(folder || '')));
    if (dir !== PUBLIC_DIR && !isInside(PUBLIC_DIR, dir)) { res.writeHead(403); res.end('Forbidden'); return; }
  }
  fs.mkdirSync(dir, { recursive: true });
  const finalName = uniqueDestination(dir, base);
  const site = readSite();
  fs.writeFileSync(path.join(dir, finalName), fullPageHtml({
    title: title || finalName.replace(/\.html$/i, ''),
    site,
  }), 'utf-8');
  sendJson(res, 200, { path: path.relative(ROOT_DIR, path.join(dir, finalName)).replace(/\\/g, '/') });
});

route('GET', '/api/page-template', (req, res) => {
  sendJson(res, 200, { body: BODY_TEMPLATE });
});

// ---- Site settings -------------------------------------------------

route('GET', '/api/site', (req, res) => {
  sendJson(res, 200, {
    site: readSite(),
    pages: listPages(),
    hasIndex: fs.existsSync(path.join(PUBLIC_DIR, 'index.html')),
  });
});

route('POST', '/api/site', async (req, res) => {
  const body = await readJsonBody(req);
  const next = { ...readSite() };
  Object.keys(SITE_DEFAULTS).forEach((k) => {
    if (body[k] !== undefined) next[k] = typeof SITE_DEFAULTS[k] === 'string' ? String(body[k]) : body[k];
  });
  writeSite(next);
  writeHomeRewrite(next.homePage);
  sendJson(res, 200, { status: 'success', site: next });
});

// ---- Media ---------------------------------------------------------

route('GET', '/api/media', (req, res, { query }) => {
  const kind = query.get('kind');
  const kinds = kind && MEDIA_KINDS[kind] ? [kind] : ['image', 'audio', 'video'];
  sendJson(res, 200, { items: [].concat(...kinds.map(listMedia)) });
});

// Upload: raw body with ?filename=; the kind comes from the extension.
route('POST', '/api/upload', async (req, res, { query }) => {
  const filename = query.get('filename');
  const buf = filename ? await readBody(req) : null;
  if (!filename || !buf || !buf.length) { sendJson(res, 400, { error: 'Missing file name or data' }); return; }
  const kind = kindForFilename(filename);
  if (!kind) { sendJson(res, 400, { error: 'Unsupported file type: ' + path.extname(filename) }); return; }

  const stored = storeMedia(kind, filename, buf);
  console.log(`[UPLOAD${stored.deduped ? '-DEDUP' : ''}] ${kind} -> ${stored.url}`);

  if (kind === 'font') {
    if (!stored.deduped) {
      const manifest = loadFontsManifest();
      const guessed = parseFontFilename(stored.name);
      manifest.metadata[stored.name] = {
        family: (query.get('family') || '').trim() || guessed.family,
        weight: query.get('weight') ? Number(query.get('weight')) : guessed.weight,
        style: (query.get('style') || '').trim() || guessed.style,
        display: 'swap',
      };
      saveFontsManifest(manifest);
    }
    const font = getEffectiveFonts().find((f) => f.file === stored.name);
    sendJson(res, 200, { status: 'success', kind, ...stored, font });
    return;
  }
  sendJson(res, 200, { status: 'success', kind, ...stored });
});

// Page copy of an image, made in the editor: raw WebP body with
// ?source=/assets/images/<file>&width=<px>. Stored as
// images/thumbs/<stem>-<ext>-<width>w.webp (outside the Media grid);
// the same source and width replace the earlier copy.
route('POST', '/api/thumbnail', async (req, res, { query }) => {
  const source = String(query.get('source') || '');
  const width = Math.round(Number(query.get('width')));
  const prefix = MEDIA_KINDS.image.url;
  const file = source.startsWith(prefix) ? decodeURIComponent(source.slice(prefix.length).split(/[?#]/)[0]) : '';
  if (!file || file.includes('/') || !fs.existsSync(path.join(MEDIA_KINDS.image.dir, file))) {
    sendJson(res, 400, { error: 'The source must be an image in ' + prefix });
    return;
  }
  if (!(width >= 16 && width <= 8192)) { sendJson(res, 400, { error: 'Width out of range' }); return; }
  const buf = await readBody(req, 64 * 1024 * 1024);
  if (!buf.length) { sendJson(res, 400, { error: 'Missing image data' }); return; }
  const ext = path.extname(file);
  const name = sanitizeFilename(`${path.basename(file, ext)}-${ext.slice(1).toLowerCase()}-${width}w.webp`);
  const dir = path.join(MEDIA_KINDS.image.dir, 'thumbs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  console.log(`[THUMB] ${file} -> thumbs/${name} (${Math.round(buf.length / 1024)} KB)`);
  sendJson(res, 200, { status: 'success', url: `${prefix}thumbs/${name}`, size: buf.length });
});

route('GET', /^\/api\/media\/(image|audio|video)\/([^/]+)\/usage$/, (req, res, { match }) => {
  const [, kind, filename] = match;
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(MEDIA_KINDS[kind].url.replace(/\//g, '\\/') + escaped + '(?![\\w.-])', 'g');
  sendJson(res, 200, { filename, usages: scanUsage(re) });
});

route('DELETE', /^\/api\/media\/(image|audio|video)\/([^/]+)$/, (req, res, { match }) => {
  const [, kind, filename] = match;
  const full = path.join(MEDIA_KINDS[kind].dir, filename);
  if (!isInside(MEDIA_KINDS[kind].dir, full) || !fs.existsSync(full)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  fs.unlinkSync(full);
  forgetFromIndex(kind, filename);
  console.log(`[MEDIA] deleted ${kind}/${filename}`);
  sendJson(res, 200, { status: 'success' });
});

// Relink: every reference to a media file moves to another file of its kind
// (Replace), or is emptied (Delete and clear its uses), in the site's pages
// and stylesheets (games aside), drafts, library elements and site settings.
// An image's page copies (images/thumbs/<stem>-<ext>-<n>w.webp) go too: they
// show the old picture. Only files that change are written, each whole to a
// temporary file renamed into place. The editor updates the page it has open.
route('POST', '/api/media/relink', async (req, res) => {
  const body = await readJsonBody(req, 64 * 1024);
  const kind = String(body.kind || '');
  const name = String(body.name || '');
  const to = body.to == null ? '' : String(body.to);
  const spec = ['image', 'audio', 'video'].includes(kind) ? MEDIA_KINDS[kind] : null;
  if (!spec || !name || /[\\/]/.test(name)) { sendJson(res, 400, { error: 'Unknown media file' }); return; }
  if (to) {
    const target = to.startsWith(spec.url) ? decodeURIComponent(to.slice(spec.url.length)) : '';
    if (!target || /[\\/]/.test(target) || !fs.existsSync(path.join(spec.dir, target))) {
      sendJson(res, 400, { error: 'The replacement must be a ' + kind + ' file in ' + spec.url });
      return;
    }
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [new RegExp(esc(spec.url + name) + '(?![\\w.-])', 'g')];
  if (kind === 'image') {
    const ext = path.extname(name);
    const copy = spec.url + 'thumbs/' + path.basename(name, ext) + '-' + ext.slice(1).toLowerCase() + '-';
    patterns.push(new RegExp(esc(copy) + '\\d+w\\.webp(?![\\w.-])', 'g'));
  }
  const changed = [];
  const relink = (full, rel) => {
    let text;
    try { text = fs.readFileSync(full, 'utf-8'); } catch { return; }
    let count = 0;
    const next = patterns.reduce((t, re) => t.replace(re, () => { count++; return to; }), text);
    if (!count) return;
    const tmp = full + '.relink-tmp';
    fs.writeFileSync(tmp, next, 'utf-8');
    fs.renameSync(tmp, full);
    changed.push({ path: rel, count });
  };
  walkFiles(PUBLIC_DIR, 'public', new Set(['.html', '.css']), new Set(['games']), relink);
  walkFiles(DRAFTS_DIR, 'drafts', new Set(['.html']), null, relink);
  walkFiles(LIBRARY_DIR, 'library', new Set(['.json']), null, relink);
  if (fs.existsSync(SITE_FILE)) relink(SITE_FILE, path.basename(SITE_FILE));
  console.log(`[MEDIA] relinked ${kind}/${name} -> ${to || '(cleared)'} in ${changed.length} file(s)`);
  sendJson(res, 200, { status: 'success', changed });
});

// ---- Unused media --------------------------------------------------
// Unused: named nowhere in the site's text files (games and the generated
// fonts.css aside), drafts, library elements or site settings (its font
// list aside). A name counts in any letter case, path or URL encoding, so
// a doubtful file is kept. Fonts also count when their family is named.
// Images include the page copies in images/thumbs/.

const REFERENCE_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.xml', '.svg', '.txt', '.md']);

function referenceText() {
  const parts = [];
  const add = (full) => {
    if (path.resolve(full) === path.resolve(FONTS_CSS_FILE)) return;
    try { parts.push(fs.readFileSync(full, 'utf-8')); } catch (e) {}
  };
  walkFiles(PUBLIC_DIR, 'public', REFERENCE_EXTENSIONS, new Set(['games']), add);
  walkFiles(DRAFTS_DIR, 'drafts', REFERENCE_EXTENSIONS, null, add);
  walkFiles(LIBRARY_DIR, 'library', REFERENCE_EXTENSIONS, null, add);
  const { fonts, ...site } = readSite();
  parts.push(JSON.stringify(site));
  return parts.join('\n').toLowerCase();
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// text is lower-cased by referenceText().
function namesFile(text, filename) {
  const forms = new Set([filename, encodeURI(filename), encodeURIComponent(filename)]
    .map((s) => s.toLowerCase()));
  for (const form of forms) {
    if (new RegExp(escapeRegExp(form) + '(?![\\w.-])').test(text)) return true;
  }
  return false;
}

function namesFamily(text, family) {
  return new RegExp('(?<![\\w-])' + escapeRegExp(family.toLowerCase()) + '(?![\\w-])').test(text);
}

function fileSize(full) {
  try { return fs.statSync(full).size; } catch (e) { return 0; }
}

function unusedMedia(kind) {
  const text = referenceText();
  const spec = MEDIA_KINDS[kind];
  if (kind === 'font') {
    return getEffectiveFonts()
      .filter((f) => !namesFile(text, f.file) && !namesFamily(text, f.family))
      .map((f) => ({
        kind, name: f.file, url: spec.url + f.file, size: fileSize(path.join(spec.dir, f.file)),
        family: f.family, weight: f.weight, style: f.style,
      }));
  }
  const items = listMedia(kind);
  if (kind === 'image') {
    const thumbs = path.join(spec.dir, 'thumbs');
    let files = [];
    try { files = fs.readdirSync(thumbs); } catch (e) {}
    files.filter((f) => spec.exts.has(path.extname(f).toLowerCase())).sort().forEach((f) => {
      items.push({ kind, name: 'thumbs/' + f, url: spec.url + 'thumbs/' + f, size: fileSize(path.join(thumbs, f)), copy: true });
    });
  }
  return items.filter((i) => !namesFile(text, path.basename(i.name)));
}

route('GET', '/api/media/unused', (req, res, { query }) => {
  const kind = query.get('kind');
  if (!MEDIA_KINDS[kind]) { sendJson(res, 400, { error: 'Unknown kind' }); return; }
  sendJson(res, 200, { kind, items: unusedMedia(kind) });
});

// Deletes the named files that are still unused when the request arrives.
route('POST', '/api/media/unused/delete', async (req, res) => {
  const body = await readJsonBody(req);
  const kind = body.kind;
  if (!MEDIA_KINDS[kind] || !Array.isArray(body.names)) { sendJson(res, 400, { error: 'Missing kind or names' }); return; }
  const spec = MEDIA_KINDS[kind];
  const unused = new Set(unusedMedia(kind).map((i) => i.name));
  const deleted = [];
  const kept = [];
  body.names.forEach((name) => {
    const full = path.join(spec.dir, String(name));
    if (!unused.has(name) || !isInside(spec.dir, full)) { kept.push(name); return; }
    try { fs.unlinkSync(full); } catch (e) { kept.push(name); return; }
    forgetFromIndex(kind, name);
    deleted.push(name);
  });
  if (kind === 'font' && deleted.length) {
    const manifest = loadFontsManifest();
    deleted.forEach((name) => { delete manifest.metadata[name]; });
    saveFontsManifest(manifest);
  }
  console.log(`[MEDIA] deleted ${deleted.length} unused ${kind} file(s)` + (kept.length ? `, kept ${kept.length}` : ''));
  sendJson(res, 200, { status: 'success', deleted, kept });
});

// ---- Fonts ---------------------------------------------------------

route('GET', '/api/fonts', (req, res) => {
  const fonts = getEffectiveFonts();
  writeFontsCss(fonts);
  sendJson(res, 200, { version: 2, fonts });
});

route('GET', '/api/fonts/usage', (req, res, { query }) => {
  const family = (query.get('family') || '').trim();
  if (!family) { sendJson(res, 400, { error: 'Missing family parameter' }); return; }
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('font-family\\s*:\\s*[^;{}]*[\'"]?' + escaped + '[\'"]?', 'gi');
  sendJson(res, 200, { family, usages: scanUsage(re, { skip: ['fonts'] }) });
});

const FONT_ID_RE = /^\/api\/fonts\/([^/]+\.(?:woff2?|ttf|otf))$/i;

route('PATCH', FONT_ID_RE, async (req, res, { match }) => {
  const filename = match[1];
  if (!fs.existsSync(path.join(FONTS_DIR, filename))) { sendJson(res, 404, { error: 'Not found' }); return; }
  const body = await readJsonBody(req);
  const manifest = loadFontsManifest();
  const guessed = parseFontFilename(filename);
  const next = { ...guessed, display: 'swap', ...(manifest.metadata[filename] || {}) };
  if (typeof body.family === 'string' && body.family.trim()) next.family = body.family.trim();
  if (body.weight != null) next.weight = Number(body.weight);
  if (typeof body.style === 'string' && body.style.trim()) next.style = body.style.trim();
  if (typeof body.display === 'string' && body.display.trim()) next.display = body.display.trim();
  manifest.metadata[filename] = next;
  saveFontsManifest(manifest);
  sendJson(res, 200, { status: 'success', font: getEffectiveFonts().find((f) => f.file === filename) });
});

route('DELETE', FONT_ID_RE, (req, res, { match }) => {
  const filename = match[1];
  const full = path.join(FONTS_DIR, filename);
  if (!isInside(FONTS_DIR, full) || !fs.existsSync(full)) { sendJson(res, 404, { error: 'Not found' }); return; }
  fs.unlinkSync(full);
  forgetFromIndex('font', filename);
  const manifest = loadFontsManifest();
  delete manifest.metadata[filename];
  saveFontsManifest(manifest);
  console.log(`[FONT] deleted ${filename}`);
  sendJson(res, 200, { status: 'success' });
});

// ---- Games ---------------------------------------------------------

route('GET', '/api/godot-exports', (req, res) => {
  sendJson(res, 200, { exports: listGodotExports() });
});

// What public/_headers gives a path, and whether the editor itself is
// isolated: /api/header-probe?path=/games/
route('GET', '/api/header-probe', (req, res, { query }) => {
  const probePath = query.get('path') || '/';
  sendJson(res, 200, {
    probedPath: probePath,
    headersFile: HEADERS_FILE,
    headersFileExists: fs.existsSync(HEADERS_FILE),
    rules: headers.rules().map((r) => r.pattern),
    matchingHeaders: headers.forPath(probePath),
    editorShellHeaders: EDITOR_SHELL_HEADERS,
  });
});

// ---- Library -------------------------------------------------------

route('GET', '/api/library', (req, res) => {
  sendJson(res, 200, { items: readLibraryItems() });
});

route('POST', '/api/library/save', async (req, res) => {
  const { name, html, css, id: wantedId } = await readJsonBody(req);
  if (!name || !html) { sendJson(res, 400, { error: 'Missing name or html' }); return; }
  let id = wantedId && libraryItemFile(wantedId) ? wantedId : slugify(name);
  if (!wantedId) {
    const base = id;
    let n = 1;
    while (fs.existsSync(libraryItemFile(id))) id = base + '-' + (++n);
  }
  const now = new Date().toISOString();
  const item = { id, name: String(name).trim(), html, createdAt: now, updatedAt: now };
  fs.writeFileSync(libraryItemFile(id), JSON.stringify(item, null, 2), 'utf-8');

  // Available at once; the next page save rewrites the file.
  if (css && css.trim()) {
    fs.appendFileSync(LIBRARY_CSS_FILE, '\n' + css.trim() + '\n', 'utf-8');
  }
  console.log(`[LIBRARY] saved ${id}`);
  sendJson(res, 200, { status: 'success', item });
});

// Update an item's master markup and/or name.
route('POST', /^\/api\/library\/item\/([a-zA-Z0-9_-]+)$/, async (req, res, { match }) => {
  const file = libraryItemFile(match[1]);
  if (!file || !fs.existsSync(file)) { sendJson(res, 404, { error: 'Not found' }); return; }
  const body = await readJsonBody(req);
  const item = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (typeof body.html === 'string' && body.html.trim()) item.html = body.html;
  if (typeof body.name === 'string' && body.name.trim()) item.name = body.name.trim();
  item.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(item, null, 2), 'utf-8');
  sendJson(res, 200, { status: 'success', item });
});

route('DELETE', /^\/api\/library\/item\/([a-zA-Z0-9_-]+)$/, (req, res, { match }) => {
  const file = libraryItemFile(match[1]);
  if (!file || !fs.existsSync(file)) { sendJson(res, 404, { error: 'Not found' }); return; }
  fs.unlinkSync(file);
  console.log(`[LIBRARY] deleted ${match[1]}`);
  sendJson(res, 200, { status: 'success' });
});

route('POST', '/api/library/update-css', async (req, res) => {
  const { css } = await readJsonBody(req);
  const next = LIBRARY_CSS_HEADER + (css ? String(css).trim() + '\n' : '');
  let prev = null;
  try { prev = fs.readFileSync(LIBRARY_CSS_FILE, 'utf-8'); } catch (e) {}
  if (prev !== next) fs.writeFileSync(LIBRARY_CSS_FILE, next, 'utf-8');
  sendJson(res, 200, { status: 'success' });
});

// ---- Files tab -------------------------------------------------------
// Show a file or folder in the system file manager.
route('POST', '/api/reveal', async (req, res) => {
  const { path: rel } = await readJsonBody(req);
  const full = path.normalize(path.join(ROOT_DIR, String(rel || '')));
  if (full !== ROOT_DIR && !isInside(ROOT_DIR, full)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(full)) { sendJson(res, 404, { error: 'Not found' }); return; }
  const isDir = fs.statSync(full).isDirectory();
  let cmd; let args;
  if (process.platform === 'win32') { cmd = 'explorer.exe'; args = isDir ? [full] : ['/select,', full]; }
  else if (process.platform === 'darwin') { cmd = 'open'; args = isDir ? [full] : ['-R', full]; }
  else { cmd = 'xdg-open'; args = [isDir ? full : path.dirname(full)]; }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    sendJson(res, 200, { status: 'success' });
  } catch (e) { sendError(res, e); }
});

// Moves or renames a page; never overwrites.
route('POST', '/api/move', async (req, res) => {
  const { from, to } = await readJsonBody(req);
  const src = resolveEditablePath(from);
  const dst = resolveEditablePath(to);
  if (!src || !dst) { res.writeHead(403); res.end('Forbidden or missing path'); return; }
  if (!fs.existsSync(src)) { sendJson(res, 404, { error: 'Source not found' }); return; }
  // Case-only renames go through a temporary name (case-insensitive file systems).
  const caseOnly = src !== dst && src.toLowerCase() === dst.toLowerCase();
  if (fs.existsSync(dst) && !caseOnly) {
    sendJson(res, 409, { error: 'A file with that name already exists there.' });
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (caseOnly) {
    const tmp = dst + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.renameSync(src, tmp);
    fs.renameSync(tmp, dst);
  } else {
    fs.renameSync(src, dst);
  }
  const newPath = path.relative(ROOT_DIR, dst).replace(/\\/g, '/');
  // The home page follows its file.
  const site = readSite();
  if (site.homePage === String(from).replace(/\\/g, '/')) {
    site.homePage = newPath;
    writeSite(site);
    writeHomeRewrite(newPath);
  }
  console.log(`[MOVED] ${from} -> ${to}`);
  sendJson(res, 200, { path: newPath });
});

// Duplicate into drafts/: a draft beside itself, a published page at the
// drafts root. Pages use root-relative asset paths.
route('POST', '/api/duplicate', async (req, res) => {
  const { from } = await readJsonBody(req);
  const src = resolveEditablePath(from);
  if (!src || path.extname(src).toLowerCase() !== '.html') { res.writeHead(403); res.end('Forbidden or missing path'); return; }
  if (!fs.existsSync(src)) { sendJson(res, 404, { error: 'Source not found' }); return; }
  const dir = isInside(DRAFTS_DIR, src) ? path.dirname(src) : DRAFTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const name = uniqueDestination(dir, path.basename(src, path.extname(src)) + '-copy.html');
  fs.copyFileSync(src, path.join(dir, name));
  const newPath = path.relative(ROOT_DIR, path.join(dir, name)).replace(/\\/g, '/');
  console.log(`[DUPLICATED] ${from} -> ${newPath}`);
  sendJson(res, 200, { path: newPath });
});

// Delete to the Recycle Bin / Trash; without one, the client asks and
// sends permanent: true.
function moveToTrash(full) {
  return new Promise((resolve, reject) => {
    let cmd; let args; const env = { ...process.env, TRASH_PATH: full };
    if (process.platform === 'win32') {
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
        '[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:TRASH_PATH, ' +
        "'OnlyErrorDialogs', 'SendToRecycleBin')"];
    } else if (process.platform === 'darwin') {
      cmd = 'osascript';
      args = ['-e', 'on run argv', '-e',
        'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
        '-e', 'end run', full];
    } else {
      cmd = 'gio'; args = ['trash', full];
    }
    execFile(cmd, args, { env, timeout: 15000, windowsHide: true }, (err) => {
      if (err || fs.existsSync(full)) reject(err || new Error('The file is still there.'));
      else resolve();
    });
  });
}

route('POST', '/api/delete', async (req, res) => {
  const { path: rel, permanent } = await readJsonBody(req);
  const full = resolveEditablePath(rel);
  if (!full) { res.writeHead(403); res.end('Forbidden or missing path'); return; }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { sendJson(res, 404, { error: 'Not found' }); return; }
  if (permanent) {
    fs.unlinkSync(full);
  } else {
    try { await moveToTrash(full); }
    catch (e) { sendJson(res, 409, { error: 'Could not move it to the Recycle Bin.', trashUnavailable: true }); return; }
  }
  console.log(`[DELETED] ${rel}${permanent ? '' : ' (to the Recycle Bin)'}`);
  sendJson(res, 200, { status: 'success', trashed: !permanent });
});

// ---- Textures (bg-noise) ---------------------------------------------
// Images in public/assets/noise/; display size defaults to half the PNG width.
function pngWidth(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString('ascii', 12, 16) === 'IHDR') return buf.readUInt32BE(16);
  } catch (e) {}
  return 0;
}

function textureName(file) {
  const stem = file.replace(/\.[^.]+$/, '');
  const m = stem.match(/^blue-noise-(\d+)-hdr-(l|la|rgb)-\d+$/i);
  if (m) {
    const channels = { l: 'luminance', la: 'luminance + alpha', rgb: 'RGB' }[m[2].toLowerCase()];
    return `Blue noise ${m[1]}, ${channels}`;
  }
  const words = stem.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

route('GET', '/api/textures', (req, res) => {
  let files = [];
  try { files = fs.readdirSync(NOISE_DIR); } catch (e) {}
  const items = files
    .filter((f) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f) && !f.startsWith('_'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => {
      const width = /\.png$/i.test(f) ? pngWidth(path.join(NOISE_DIR, f)) : 0;
      return { file: f, url: '/assets/noise/' + f, name: textureName(f), size: width ? Math.round(width / 2) : 0 };
    });
  sendJson(res, 200, { items });
});

// ---- Local servers ---------------------------------------------------

route('GET', '/api/ping', (req, res) => {
  sendJson(res, 200, { editor: true, root: ROOT_DIR });
});

route('GET', '/api/config', (req, res) => {
  sendJson(res, 200, { config: config.read(), defaults: config.DEFAULTS, running: config.running() });
});

route('POST', '/api/config', async (req, res) => {
  const body = await readJsonBody(req);
  sendJson(res, 200, { status: 'success', config: config.write(body) });
});

// ===================================================================
// Server
// ===================================================================

function servePublic(req, res, urlPath, opts) {
  const redirect = redirects.match(urlPath);
  let servedPath = urlPath;
  if (redirect) {
    if (redirect.status === 200) servedPath = redirect.to;
    else if (!(opts && opts.ignoreRedirects)) {
      res.writeHead(redirect.status, { Location: redirect.to });
      res.end();
      return;
    }
  }
  const filePath = resolvePublicPath(PUBLIC_DIR, servedPath);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`File not found: ${urlPath}`);
    return;
  }
  // _headers decides isolation and CORP; the editor never caches.
  serveFile(req, res, filePath, { ...headers.forPath(urlPath), ...NO_STORE });
}

// The API answers only FigJS itself: cross-site requests (Origin,
// Sec-Fetch-Site) and other host names (DNS rebinding) are refused.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== host) return false; } catch (e) { return false; }
  }
  return true;
}

async function handle(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  let urlPath;
  try { urlPath = decodeURIComponent(parsedUrl.pathname); }
  catch (e) { res.writeHead(400); res.end('Bad request'); return; }

  // ---- API ----
  if (urlPath.startsWith('/api/')) {
    if (!isLocalRequest(req)) { sendJson(res, 403, { error: 'Forbidden' }); return; }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      let match = null;
      if (typeof r.pattern === 'string') { if (r.pattern !== urlPath) continue; }
      else { match = r.pattern.exec(urlPath); if (!match) continue; }
      try { await r.handler(req, res, { query: parsedUrl.searchParams, match }); }
      catch (err) { console.error(err); if (!res.headersSent) sendError(res, err); }
      return;
    }
    sendJson(res, 404, { error: `No route for ${req.method} ${urlPath}` });
    return;
  }

  // ---- The site's root page (FigJS owns "/") ----
  if (urlPath === '/__site' || urlPath.startsWith('/__site/')) {
    servePublic(req, res, urlPath.slice('/__site'.length) || '/');
    return;
  }

  // ---- Drafts: /__drafts/<name>.html ----
  if (urlPath.startsWith('/__drafts/')) {
    const full = path.normalize(path.join(DRAFTS_DIR, urlPath.slice('/__drafts/'.length)));
    if (!isInside(DRAFTS_DIR, full)) { res.writeHead(403); res.end('Forbidden'); return; }
    serveFile(req, res, full, { ...headers.forPath('/'), ...NO_STORE });
    return;
  }

  // ---- Editor shell ----
  const isEditorAsset = urlPath === '/' || urlPath === '/index.html'
    || urlPath === '/favicon.ico'
    || EDITOR_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
  if (isEditorAsset) {
    const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
    const full = path.normalize(path.join(EDITOR_DIR, rel));
    if (!isInside(EDITOR_DIR, full)) { res.writeHead(403); res.end('Forbidden'); return; }
    serveFile(req, res, full, { ...EDITOR_SHELL_HEADERS, ...NO_STORE });
    return;
  }

  // ---- Everything else is the site ----
  servePublic(req, res, urlPath);
}

function createEditorHandler() {
  ensureDirs();
  return handle;
}

function summary() {
  return {
    library: readLibraryItems().length,
    fonts: getEffectiveFonts().length,
    games: listGodotExports().length,
  };
}

module.exports = { createEditorHandler, summary };
