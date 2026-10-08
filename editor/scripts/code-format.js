// Code tab formatting: HTML and CSS shown with 2-space indentation, and
// indent-as-you-type in the code areas (Enter keeps or opens a level,
// Tab / Shift+Tab indent selected lines, } and </ step back). Only
// whitespace between block-level tags changes.
//   FigJS.codeFormat.html(markup) / css(text) / attach(textarea, 'html' | 'css')

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const INDENT = '  ';

  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const VERBATIM = new Set(['script', 'style', 'pre', 'textarea']);
  const INLINE = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'img', 'kbd', 'mark',
    'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'label',
  ]);

  // ===================== HTML ==========================================

  function openTag(el) {
    const shallow = el.cloneNode(false).outerHTML;
    const close = `</${el.tagName.toLowerCase()}>`;
    return shallow.endsWith(close) ? shallow.slice(0, -close.length) : shallow;
  }

  function isInlineNode(n) {
    if (n.nodeType === 3 || n.nodeType === 8) return true;
    return n.nodeType === 1 && INLINE.has(n.tagName.toLowerCase());
  }

  function formatNode(node, depth, out) {
    const pad = INDENT.repeat(depth);
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      if (t) out.push(pad + node.textContent.replace(/\s+/g, ' ').trim());
      return;
    }
    if (node.nodeType === 8) { out.push(pad + `<!--${node.textContent}-->`); return; }
    if (node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();
    if (VOID.has(tag)) { out.push(pad + openTag(node)); return; }

    const kids = Array.from(node.childNodes);
    const close = `</${tag}>`;
    if (VERBATIM.has(tag) || !kids.length || kids.every(isInlineNode)) {
      out.push(pad + node.outerHTML);
      return;
    }
    out.push(pad + openTag(node));
    kids.forEach((k) => formatNode(k, depth + 1, out));
    out.push(pad + close);
  }

  function formatFragment(src, depth) {
    const tpl = document.createElement('template');
    tpl.innerHTML = src;
    const out = [];
    Array.from(tpl.content.childNodes).forEach((n) => formatNode(n, depth, out));
    return out.join('\n');
  }

  // Page markup arrives wrapped in <body ...>; the wrapper is kept.
  function html(markup) {
    const src = String(markup || '');
    if (!src.trim()) return '';
    const m = src.match(/^\s*(<body\b[^>]*>)([\s\S]*)<\/body>\s*$/i);
    if (m) return m[1] + '\n' + formatFragment(m[2], 1) + '\n</body>';
    return formatFragment(src, 0);
  }

  // ===================== CSS ===========================================

  function css(text) {
    const src = String(text || '').trim();
    if (!src) return '';
    let out = '';
    let depth = 0;
    let paren = 0;
    let quote = '';
    let line = '';
    const flush = () => {
      let t = line.trim();
      if (t.endsWith(';')) t = t.replace(/^(--[\w-]+|[\w-]+)\s*:\s*/, '$1: ');
      if (t) out += INDENT.repeat(depth) + t + '\n';
      line = '';
    };
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        line += c;
        if (c === '\\') { line += src[++i] || ''; continue; }
        if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") { quote = c; line += c; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? src.length : end + 2;
        flush();
        out += INDENT.repeat(depth) + src.slice(i, stop) + '\n';
        i = stop - 1;
        continue;
      }
      if (c === '(') paren++;
      if (c === ')') paren = Math.max(0, paren - 1);
      if (paren) { line += c; continue; }
      if (c === '{') {
        out += INDENT.repeat(depth) + line.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ') + ' {\n';
        line = '';
        depth++;
      } else if (c === '}') {
        flush();
        depth = Math.max(0, depth - 1);
        out += INDENT.repeat(depth) + '}\n';
        if (depth === 0) out += '\n';
      } else if (c === ';') {
        line += ';';
        flush();
      } else if (c === '\n' || c === '\r') {
        line += ' ';
      } else {
        line += c;
      }
    }
    flush();
    return out
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  }

  // ===================== Indent while typing ===========================

  function lineStart(value, pos) {
    return value.lastIndexOf('\n', pos - 1) + 1;
  }

  function opensLevel(before, mode) {
    const t = before.trimEnd();
    if (mode === 'css') return t.endsWith('{');
    const m = t.match(/<([a-zA-Z][\w-]*)[^<>]*>$/);
    return !!m && !t.endsWith('/>') && !VOID.has(m[1].toLowerCase());
  }

  function insert(ta, text, selStart, selEnd) {
    ta.setRangeText(text, selStart, selEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function attach(ta, mode) {
    if (!ta || ta.__figIndent) return;
    ta.__figIndent = true;
    const getMode = typeof mode === 'function' ? mode : () => mode;

    ta.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const v = ta.value;
      const s = ta.selectionStart;
      const end = ta.selectionEnd;

      if (e.key === 'Enter') {
        e.preventDefault();
        const ls = lineStart(v, s);
        const current = v.slice(ls, s);
        const indent = (current.match(/^[ \t]*/) || [''])[0];
        const extra = opensLevel(current, getMode()) ? INDENT : '';
        insert(ta, '\n' + indent + extra, s, end);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ls = lineStart(v, s);
        const block = v.slice(ls, end);
        if (s === end && !e.shiftKey) { insert(ta, INDENT, s, end); return; }
        const lines = block.split('\n');
        const next = lines.map((l) => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : INDENT + l)).join('\n');
        ta.setRangeText(next, ls, end, 'select');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      if (e.key === '}' || (e.key === '/' && v[s - 1] === '<')) {
        const ls = lineStart(v, s);
        const before = v.slice(ls, e.key === '/' ? s - 1 : s);
        if (before.trim() || before.length < INDENT.length) return;
        e.preventDefault();
        const dedented = before.slice(INDENT.length);
        const typed = e.key === '/' ? '</' : '}';
        ta.setRangeText(dedented + typed, ls, e.key === '/' ? s : end, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  FigJS.codeFormat = { html, css, attach };
})();
