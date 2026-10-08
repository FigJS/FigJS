// CSS shorthands and their parts, kept as GrapesJS's Style Manager keeps
// them. A page loaded into the canvas arrives with every shorthand split
// into parts (the browser parses its CSS), while blocks, settings and the
// Style Manager's composite properties (margin, padding, border, corner
// radius) write the shorthand and clear its parts. So:
//   read   takes a value either way: the shorthand, built from a full set of
//          parts, or a part taken from its shorthand;
//   write  of a shorthand clears its parts; of a part, splits its shorthand
//          first, so no two declarations disagree;
//   compact puts a full set of parts back into its shorthand, for the
//          groups the Style Manager shows as one composite property (top,
//          right, bottom, left, gap and overflow stay apart: it shows them
//          as their own fields). Done to every rule as it is added.
//   FigJS.cssParts.read(style, key) / write(style, key, value) -> style
//   FigJS.cssParts.compact(style) -> style, or null when nothing changes

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};

  const sides = (pre, post) => ['top', 'right', 'bottom', 'left'].map((s) => pre + s + post);

  // Four parts, top right bottom left (corners clockwise from top left).
  const BOX = {
    margin: sides('margin-', ''),
    padding: sides('padding-', ''),
    inset: ['top', 'right', 'bottom', 'left'],
    'border-width': sides('border-', '-width'),
    'border-style': sides('border-', '-style'),
    'border-color': sides('border-', '-color'),
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  };
  // Two parts: one value for both, or each.
  const PAIR = {
    gap: ['row-gap', 'column-gap'],
    overflow: ['overflow-x', 'overflow-y'],
  };
  // border: width, style and colour (each of those has its four sides).
  const BORDER = ['border-width', 'border-style', 'border-color'];
  // What border sets besides, to their initial values.
  const BORDER_IMAGE = {
    'border-image-source': ['none', 'initial'],
    'border-image-slice': ['100%', 'initial'],
    'border-image-width': ['1', 'initial'],
    'border-image-outset': ['0', '0px', 'initial'],
    'border-image-repeat': ['stretch', 'initial'],
  };
  const COMPACTED = ['margin', 'padding', 'border-radius', 'border-width', 'border-style', 'border-color', 'border'];

  const PARTS = Object.assign({}, BOX, PAIR, { border: BORDER });
  const PARENT = {};
  Object.keys(PARTS).forEach((name) => PARTS[name].forEach((part) => { PARENT[part] = name; }));

  // Space-separated tokens, a function's spaces aside: rgba(0, 0, 0, 0.5).
  function tokens(value) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of String(value).trim()) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (/\s/.test(ch) && !depth) {
        if (cur) out.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  const IMPORTANT = /\s*!important\s*$/i;
  const importanceOf = (v) => (IMPORTANT.test(v) ? ' !important' : '');
  const bare = (v) => String(v).replace(IMPORTANT, '');

  function four(list) {
    if (!list.length || list.length > 4) return null;
    const [t, r = t, b = t, l = r] = list;
    return [t, r, b, l];
  }

  function fourOut(list) {
    const [t, r, b, l] = list;
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    if (r === l) return `${t} ${r} ${b}`;
    return `${t} ${r} ${b} ${l}`;
  }

  const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);
  const isWidth = (t) => /^(thin|medium|thick)$/i.test(t) || /^(-?\d*\.?\d+[a-z%]*|0|calc\(.*\)|var\(.*\))$/i.test(t);

  // A shorthand's value as its parts, or null when it can't be told apart.
  function expand(name, value) {
    const imp = importanceOf(value);
    const v = bare(value).trim();
    const parts = PARTS[name];
    if (!parts || !v || /^var\(/i.test(v)) return null;
    let values = null;
    if (name === 'border-radius' && v.includes('/')) {
      const [h, w] = v.split('/');
      const hs = four(tokens(h));
      const vs = four(tokens(w));
      if (hs && vs) values = hs.map((x, i) => (x === vs[i] ? x : `${x} ${vs[i]}`));
    } else if (BOX[name]) values = four(tokens(v));
    else if (PAIR[name]) {
      const list = tokens(v);
      if (list.length === 1 || list.length === 2) values = [list[0], list[1] || list[0]];
    } else if (name === 'border') {
      let width = 'medium';
      let style = 'none';
      const colour = [];
      tokens(v).forEach((t) => {
        if (BORDER_STYLES.has(t.toLowerCase())) style = t;
        else if (isWidth(t)) width = t;
        else colour.push(t);
      });
      values = [width, style, colour.join(' ') || 'currentcolor'];
    }
    if (!values) return null;
    const out = {};
    parts.forEach((p, i) => { out[p] = values[i] + imp; });
    return out;
  }

  // A full set of parts as their shorthand, or null.
  function join(name, values) {
    const imp = importanceOf(values[0]);
    if (values.some((x) => importanceOf(x) !== imp)) return null;
    const list = values.map((x) => bare(x).trim());
    if (list.some((x) => !x || /^var\(/i.test(x))) return null;
    let out;
    if (name === 'border-radius' && list.some((x) => tokens(x).length > 1)) {
      const pairs = list.map((x) => { const t = tokens(x); return [t[0], t[1] || t[0]]; });
      out = `${fourOut(pairs.map((p) => p[0]))} / ${fourOut(pairs.map((p) => p[1]))}`;
    } else if (BOX[name]) out = fourOut(list);
    else if (PAIR[name]) out = list[0] === list[1] ? list[0] : `${list[0]} ${list[1]}`;
    else if (name === 'border') {
      if (list.some((x) => tokens(x).length > 1)) return null;
      out = list.join(' ');
    }
    return out ? out + imp : null;
  }

  const has = (style, key) => style[key] != null && style[key] !== '';

  // Its own value, else built from its parts (and theirs).
  function down(style, key) {
    if (has(style, key)) return String(style[key]);
    const parts = PARTS[key];
    if (!parts) return '';
    const values = parts.map((p) => down(style, p));
    return values.every(Boolean) ? (join(key, values) || '') : '';
  }

  // Taken from the shorthand above it (and the one above that).
  function up(style, key) {
    const parent = PARENT[key];
    if (!parent) return '';
    const value = down(style, parent) || up(style, parent);
    const parts = value ? expand(parent, value) : null;
    return parts && parts[key] ? parts[key] : '';
  }

  // In its shortest form: the Style Manager writes 8px as 8px 8px 8px 8px.
  function tidy(key, value) {
    if (!value || key === 'border' || !PARTS[key]) return value;
    const parts = expand(key, value);
    return (parts && join(key, PARTS[key].map((p) => parts[p]))) || value;
  }

  function read(style, key) {
    const s = style || {};
    return tidy(key, down(s, key) || up(s, key));
  }

  // Splits every shorthand above key that is set, outermost first; a part
  // already set keeps its own value (it was declared after, or alone).
  function splitAbove(next, key) {
    const chain = [];
    for (let p = PARENT[key]; p; p = PARENT[p]) chain.unshift(p);
    chain.forEach((p) => {
      if (!has(next, p)) return;
      const parts = expand(p, next[p]);
      if (!parts) return;
      delete next[p];
      Object.keys(parts).forEach((k) => { if (!has(next, k)) next[k] = parts[k]; });
    });
  }

  function clearBelow(next, key) {
    (PARTS[key] || []).forEach((p) => {
      delete next[p];
      clearBelow(next, p);
    });
  }

  function write(style, key, value) {
    const next = Object.assign({}, style || {});
    splitAbove(next, key);
    clearBelow(next, key);
    if (value === '' || value == null) delete next[key];
    else next[key] = String(value);
    return next;
  }

  function compact(style) {
    let next = null;
    COMPACTED.forEach((name) => {
      const cur = next || style;
      if (has(cur, name)) return;
      const parts = PARTS[name];
      if (!parts.every((p) => has(cur, p))) return;
      const value = join(name, parts.map((p) => String(cur[p])));
      if (!value) return;
      next = next || Object.assign({}, style);
      parts.forEach((p) => delete next[p]);
      next[name] = value;
      if (name === 'border') {
        Object.keys(BORDER_IMAGE).forEach((k) => {
          if (has(next, k) && BORDER_IMAGE[k].includes(String(next[k]).trim())) delete next[k];
        });
      }
    });
    return next;
  }

  // Every rule as it is added (a page load, the code view, a Library
  // element) is compacted; a value its settings show is then the same
  // whether the page was just built or reloaded. GrapesJS sets a parsed
  // rule's style again after adding it, so this waits for the batch to end.
  // No undo entry, and not a style edit (theme-edit.js routes those).
  function compactRule(rule) {
    const style = rule && rule.collection && rule.getStyle();
    const next = style && compact(style);
    if (!next) return;
    const run = () => rule.setStyle(next, { avoidStore: true });
    const quiet = () => (FigJS.withInternalUpdate ? FigJS.withInternalUpdate(run) : run());
    if (FigJS.undo && FigJS.undo.untracked) FigJS.undo.untracked(quiet);
    else quiet();
  }

  let queued = null;
  function later(rule) {
    if (!queued) {
      queued = new Set();
      Promise.resolve().then(() => {
        const list = queued;
        queued = null;
        list.forEach(compactRule);
      });
    }
    queued.add(rule);
  }

  function install(editor) {
    const rules = editor && editor.Css && editor.Css.getAll();
    if (!rules || rules.__figParts) return;
    rules.__figParts = true;
    rules.on('add', later);
    rules.on('reset', () => rules.forEach(later));
    rules.forEach(later);
  }

  FigJS.cssParts = { read, write, compact, expand, install, PARTS };
})();
