// Comments out of the site's code: published pages and public/ files carry
// none. Strings, template literals and regular expressions are read as
// such, so a "//" or "/*" inside them stays. A line that held only a
// comment goes; a comment between two words leaves a space; one spanning
// lines leaves a line break (automatic semicolons still apply).
//   FigJS.stripComments.js(src) / css(src) / html(src) / headers(src)
// Also a Node module (the same functions), for files on disk.

(function (root) {
  'use strict';

  const MARK = '\u0000';
  const WORD = /[A-Za-z0-9_$]/;
  const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'throw', 'case', 'do', 'else', 'yield', 'await']);

  // Lines left empty by a removed comment go; the marks go.
  function tidy(out) {
    return out.split('\n')
      .filter((line) => !(line.includes(MARK) && /^[ \t\u0000]*$/.test(line)))
      .map((line) => line
        .replace(/[ \t]*\u0000+[ \t]*$/, '')
        .replace(/[ \t]+\u0000+([ \t])/g, '$1')
        .replace(/[ \t]+\u0000+(?=[)\]},;])/g, '')
        .replace(/(.)\u0000+(.)/g, (m, a, b) => a + (WORD.test(a) && WORD.test(b) ? ' ' : '') + b)
        .replace(/\u0000/g, ''))
      .join('\n');
  }

  function blockMark(text) {
    return text.includes('\n') ? MARK + '\n' + MARK : MARK;
  }

  function js(src) {
    const s = String(src);
    let out = '';
    let i = 0;
    let last = '';        // the last significant character or word
    const braces = [];    // inside ${ } of a template: brace depth there

    function regexAllowed() {
      if (!last) return true;
      if (WORD.test(last[last.length - 1])) return REGEX_AFTER_WORD.has(last);
      return last !== ')' && last !== ']';
    }

    function readString(q) {
      let j = i + 1;
      while (j < s.length && s[j] !== q) {
        if (s[j] === '\\') j++;
        else if (s[j] === '\n') break;
        j++;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      last = '0';
    }

    // From the opening backtick or a closing } back into the template.
    function readTemplate(from) {
      let j = from;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '`') { out += s.slice(i, j + 1); i = j + 1; last = '0'; return; }
        if (s[j] === '$' && s[j + 1] === '{') {
          out += s.slice(i, j + 2);
          i = j + 2;
          braces.push(0);
          last = '{';
          return;
        }
        j++;
      }
      out += s.slice(i);
      i = s.length;
    }

    function readRegex() {
      let j = i + 1;
      let inClass = false;
      while (j < s.length && s[j] !== '\n') {
        const c = s[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;
      out += s.slice(i, j);
      i = j;
      last = '0';
    }

    while (i < s.length) {
      const c = s[i];
      const n = s[i + 1];
      if (c === '/' && n === '/') {
        const end = s.indexOf('\n', i);
        out += MARK;
        i = end < 0 ? s.length : end;
        continue;
      }
      if (c === '/' && n === '*') {
        const end = s.indexOf('*/', i + 2);
        const stop = end < 0 ? s.length : end + 2;
        out += blockMark(s.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") { readString(c); continue; }
      if (c === '`') { readTemplate(i + 1); continue; }
      if (c === '/' && regexAllowed()) { readRegex(); continue; }
      if (braces.length && c === '{') braces[braces.length - 1]++;
      if (braces.length && c === '}') {
        if (braces[braces.length - 1] === 0) {
          braces.pop();
          out += c;
          i++;
          readTemplate(i);
          continue;
        }
        braces[braces.length - 1]--;
      }
      if (WORD.test(c)) {
        let j = i;
        while (j < s.length && WORD.test(s[j])) j++;
        last = s.slice(i, j);
        out += last;
        i = j;
        continue;
      }
      if (!/\s/.test(c)) last = c;
      out += c;
      i++;
    }
    return tidy(out);
  }

  function css(src) {
    const s = String(src);
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '/' && s[i + 1] === '*') {
        const end = s.indexOf('*/', i + 2);
        const stop = end < 0 ? s.length : end + 2;
        out += blockMark(s.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
        out += s.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return tidy(out);
  }

  // Comments in the markup, and in inline scripts and styles, read tag by
  // tag (a "<!--" in an attribute is text). A script of another type
  // (JSON, a template) is left as it is, as are textarea and title.
  const RAW = new Set(['script', 'style', 'textarea', 'title']);
  function html(src) {
    const s = String(src);
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (s.startsWith('<!--', i)) {
        const end = s.indexOf('-->', i + 4);
        out += MARK;
        i = end < 0 ? s.length : end + 3;
        continue;
      }
      if (s[i] !== '<' || !/[A-Za-z]/.test(s[i + 1] || '')) { out += s[i]; i++; continue; }
      let j = i + 1;
      let quote = null;
      while (j < s.length) {
        const c = s[j];
        if (quote) { if (c === quote) quote = null; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      const tag = s.slice(i, j + 1);
      out += tag;
      i = j + 1;
      const name = tag.match(/^<([A-Za-z][\w-]*)/)[1].toLowerCase();
      if (!RAW.has(name)) continue;
      const close = s.toLowerCase().indexOf('</' + name, i);
      const end = close < 0 ? s.length : close;
      const body = s.slice(i, end);
      const type = (tag.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
      const script = name === 'script' && (!type || /^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type));
      out += name === 'style' ? css(body) : script ? js(body) : body;
      i = end;
    }
    return tidy(out);
  }

  // _headers and _redirects: # starts a comment line.
  function headers(src) {
    return String(src).split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
      .replace(/^\n+/, '');
  }

  const api = { js, css, html, headers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    const FigJS = root.FigJS = root.FigJS || {};
    FigJS.stripComments = api;
  }
})(typeof window !== 'undefined' ? window : null);
