(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function attrEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function resolveSource(el) {
    const lang = (document.body && document.body.getAttribute('data-lang'))
      || 'en';
    const raw = el.getAttribute('data-md-i18n');
    if (raw) {
      try {
        const map = JSON.parse(raw);
        if (map && typeof map === 'object' && typeof map[lang] === 'string') {
          return map[lang];
        }
      } catch (e) {  }
    }
    return el.getAttribute('data-md') || '';
  }

  function normalizeCtx(ctx) {
    if (ctx == null) return { refs: null, anchors: null };
    if (ctx instanceof Set) return { refs: ctx, anchors: null };
    if (typeof ctx === 'object') {
      return {
        refs: ctx.refs instanceof Set ? ctx.refs : null,
        anchors: ctx.anchors instanceof Set ? ctx.anchors : null
      };
    }
    return { refs: null, anchors: null };
  }

  function collectContext(md) {
    const source = String(md == null ? '' : md);
    const stripped = source
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');

    const refs = new Set();
    const inlineDefs = new Set();
    const blockDefs = new Set();

    let m;

    const refRe = /\]\(#([\w-]+)\)/g;
    while ((m = refRe.exec(stripped)) !== null) refs.add(m[1]);

    const inlineRe = /\[([^\]]+)\]\^\(([^)]+)\)/g;
    while ((m = inlineRe.exec(stripped)) !== null) {
      if (/^[\w-]+$/.test(m[2])) inlineDefs.add(m[2]);
    }

    const blockRe = /(?:^|\s)\^([\w-]+)\s*$/gm;
    while ((m = blockRe.exec(stripped)) !== null) blockDefs.add(m[1]);

    const anchors = new Set();
    inlineDefs.forEach((id) => { if (refs.has(id)) anchors.add(id); });
    blockDefs.forEach((id) => anchors.add(id));

    return { refs, anchors };
  }

  function collectReferenceIds(md) {
    return collectContext(md).refs;
  }

  function replaceCarets(text, fn) {
    let out = '';
    let i = 0;
    for (;;) {
      const open = text.indexOf('[', i);
      if (open < 0) break;
      const close = text.indexOf(']^(', open);
      if (close < 0) break;
      const content = text.slice(open + 1, close);
      if (content.indexOf('[') !== -1 || content.indexOf(']') !== -1 || content.indexOf('\n') !== -1) {
        out += text.slice(i, open + 1);
        i = open + 1;
        continue;
      }
      let depth = 1;
      let j = close + 3;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
        else if (text[j] === '\n') break;
      }
      if (depth !== 0) {
        out += text.slice(i, open + 1);
        i = open + 1;
        continue;
      }
      out += text.slice(i, open) + fn(content, text.slice(close + 3, j));
      i = j + 1;
    }
    return out + text.slice(i);
  }

  const CODE_SLOT = '\u0000MDC';
  const NOTE_SLOT = '\u0001';

  function renderInline(source, ctx) {
    const c = normalizeCtx(ctx);
    let text = esc(source);
    const code = [];
    const notes = [];

    text = text.replace(/`([^`\n]+)`/g, (_, body) => {
      const i = code.push(body) - 1;
      return CODE_SLOT + i + '\u0000';
    });

    text = replaceCarets(text, (content, inner) => {
      const looksLikeId = /^[\w-]+$/.test(inner);
      const isAnchor = looksLikeId && (c.refs == null || c.refs.has(inner));
      if (isAnchor) {
        return '<span id="' + attrEsc(inner) + '" class="md-anchor">' + content + '</span>';
      }
      const n = notes.push(inner) - 1;
      return '<span class="md-footnote" tabindex="0" data-note="' + NOTE_SLOT + n + NOTE_SLOT + '">' +
             content + '</span>';
    });

    text = text.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, src, title) =>
        '<img src="' + esc(src) + '" alt="' + esc(alt) + '"' +
        (title ? ' title="' + esc(title) + '"' : '') + '>'
    );

    text = text.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, label, href, title) => {
        if (/^#[\w-]+$/.test(href)) {
          const id = href.slice(1);
          const broken = c.anchors != null && !c.anchors.has(id);
          const cls = 'md-xref' + (broken ? ' md-xref-broken' : '');

          return '<a href="' + esc(href) + '" class="' + cls + '"' +
            ' draggable="false"' +
            (title ? ' title="' + esc(title) + '"' : '') + '>' +
            label + '</a>';
        }
        const isExternal = /^(?:https?:)?\/\//i.test(href);
        const external =
          isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return '<a href="' + esc(href) + '"' + external +
          (title ? ' title="' + esc(title) + '"' : '') + '>' +
          label + '</a>';
      }
    );

    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    text = text.replace(
      new RegExp(CODE_SLOT + '(\\d+)\u0000', 'g'),
      (_, i) => '<code>' + code[+i] + '</code>'
    );

    text = text.replace(new RegExp(NOTE_SLOT + '(\\d+)' + NOTE_SLOT, 'g'), (_, i) =>
      notes[+i]
        .replace(new RegExp(CODE_SLOT + '(\\d+)\u0000', 'g'), (m, k) => '`' + code[+k] + '`')
        .replace(/"/g, '&quot;'));

    return text;
  }

  function renderBlocks(md, ctx) {
    const lines = String(md == null ? '' : md)
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^```([\w-]*)\s*$/);
      if (fence) {
        const lang = fence[1];
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        out.push(
          '<pre><code' +
          (lang ? ' class="language-' + esc(lang) + '"' : '') +
          '>' + esc(buf.join('\n')) + '</code></pre>'
        );
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h) {
        const level = h[1].length;
        let headingText = h[2];
        let anchorId = null;
        const am = headingText.match(/(?:^|\s)\^([\w-]+)\s*$/);
        if (am) {
          anchorId = am[1];
          headingText = headingText.slice(0, am.index).replace(/\s+$/, '');
        }
        out.push(
          '<h' + level + (anchorId ? ' id="' + attrEsc(anchorId) + '"' : '') + '>' +
          renderInline(headingText, ctx) +
          '</h' + level + '>'
        );
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push(
          '<blockquote>' +
          renderBlocks(buf.join('\n'), ctx) +
          '</blockquote>'
        );
        continue;
      }

      if (/^[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*+]\s+/, ''));
          i++;
        }
        out.push(
          '<ul>' +
          items.map((t) => '<li>' + renderInline(t, ctx) + '</li>').join('') +
          '</ul>'
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        out.push(
          '<ol>' +
          items.map((t) => '<li>' + renderInline(t, ctx) + '</li>').join('') +
          '</ol>'
        );
        continue;
      }

      if (/^\s*$/.test(line)) {
        out.push('<div class="md-empty" aria-hidden="true"></div>');
        i++;
        continue;
      }

      let paraText = line;
      let paraAnchor = null;
      const pm = paraText.match(/(?:^|\s)\^([\w-]+)\s*$/);
      if (pm) {
        paraAnchor = pm[1];
        paraText = paraText.slice(0, pm.index).replace(/\s+$/, '');
      }
      out.push(
        '<p class="md-para"' +
        (paraAnchor ? ' id="' + attrEsc(paraAnchor) + '"' : '') +
        '>' + renderInline(paraText, ctx) + '</p>'
      );
      i++;
    }

    return out.join('\n');
  }

  function render(md) {
    const source = String(md == null ? '' : md);
    return renderBlocks(source, collectContext(source));
  }

  function renderEditableInline(source, ctx) {
    const c = normalizeCtx(ctx);
    let s = esc(source);
    const code = [];

    s = s.replace(/`([^`\n]+)`/g, (_, body) => {
      const i = code.push(body) - 1;
      return '\uE000' + i + '\uE000';
    });

    s = s.replace(
      /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g,
      (m, m1, c1, m2, c2) => {
        if (m1) {
          return '<span class="md-marker">' + m1 + '</span>' +
                 '<strong>' + c1 + '</strong>' +
                 '<span class="md-marker">' + m1 + '</span>';
        }
        return '<span class="md-marker">' + m2 + '</span>' +
               '<em>' + c2 + '</em>' +
               '<span class="md-marker">' + m2 + '</span>';
      }
    );

    s = replaceCarets(s, (content, inner) => {
      const looksLikeId = /^[\w-]+$/.test(inner);
      const isAnchor = looksLikeId && (c.refs == null || c.refs.has(inner));
      const contentClass = isAnchor ? 'md-anchor-content' : 'md-footnote-content';
      return '<span class="md-marker">[</span>' +
             '<span class="' + contentClass + '">' + content + '</span>' +
             '<span class="md-marker">]^(' + inner + ')</span>';
    });

    s = s.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, src) =>
        '<span class="md-marker">![</span>' +
        '<span class="md-link">' + alt + '</span>' +
        '<span class="md-marker">](</span>' +
        '<span class="md-url">' + src + '</span>' +
        '<span class="md-marker">)</span>'
    );

    s = s.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, label, href) => {
        if (/^#[\w-]+$/.test(href)) {
          const id = href.slice(1);
          const broken = c.anchors != null && !c.anchors.has(id);
          const labelClass = 'md-xref' + (broken ? ' md-xref-broken' : '');
          return '<span class="md-marker">[</span>' +
            '<span class="' + labelClass + '">' + label + '</span>' +
            '<span class="md-marker">](</span>' +
            '<span class="md-url">' + href + '</span>' +
            '<span class="md-marker">)</span>';
        }
        return '<span class="md-marker">[</span>' +
          '<span class="md-link">' + label + '</span>' +
          '<span class="md-marker">](</span>' +
          '<span class="md-url">' + href + '</span>' +
          '<span class="md-marker">)</span>';
      }
    );

    s = s.replace(
      /\uE000(\d+)\uE000/g,
      (_, i) =>
        '<span class="md-marker">`</span>' +
        '<code>' + code[+i] + '</code>' +
        '<span class="md-marker">`</span>'
    );

    s = s.replace(
      /(^|\s)\^([\w-]+)(\s*)$/,
      (_, pre, id, tail) =>
        pre + '<span class="md-marker">^' + id + '</span>' + tail
    );

    return s;
  }

  function renderEditableLine(source, ctx) {
    const src = String(source == null ? '' : source);

    if (src === '') {
      return { modifier: 'md-line-blank', html: '<br>' };
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(src)) {
      return {
        modifier: 'md-line-hr',
        html: '<span class="md-marker">' + esc(src) + '</span>'
      };
    }

    const h = src.match(/^(#{1,6})(\s+)(.*)$/);
    if (h) {
      return {
        modifier: 'md-line-h' + h[1].length,
        html:
          '<span class="md-marker">' + h[1] + '</span>' +
          esc(h[2]) +
          renderEditableInline(h[3], ctx)
      };
    }

    const q = src.match(/^(>)(\s?)(.*)$/);
    if (q) {
      return {
        modifier: 'md-line-quote',
        html:
          '<span class="md-marker">' + q[1] + '</span>' +
          esc(q[2]) +
          renderEditableInline(q[3], ctx)
      };
    }

    const ul = src.match(/^(\s*)([-*+])(\s+)(.*)$/);
    if (ul) {
      return {
        modifier: 'md-line-ul',
        html:
          esc(ul[1]) +
          '<span class="md-marker">' + ul[2] + '</span>' +
          esc(ul[3]) +
          renderEditableInline(ul[4], ctx)
      };
    }

    const ol = src.match(/^(\s*)(\d+\.)(\s+)(.*)$/);
    if (ol) {
      return {
        modifier: 'md-line-ol',
        html:
          esc(ol[1]) +
          '<span class="md-marker">' + ol[2] + '</span>' +
          esc(ol[3]) +
          renderEditableInline(ol[4], ctx)
      };
    }

    return {
      modifier: 'md-line-p',
      html: renderEditableInline(src, ctx)
    };
  }

  function apply(el) {
    if (!el) return;
    const md = resolveSource(el);
    let out = el.querySelector(':scope > .md-block-render');
    if (!out) {
      out = el.ownerDocument.createElement('div');
      out.className = 'md-block-render';
      out.setAttribute('data-gjs-selectable', 'false');
      out.setAttribute('data-gjs-hoverable', 'false');
      el.appendChild(out);
    }
    out.innerHTML = render(md);
    relink(out);
  }

  function targetExists(id) {
    if (window.SiteNav) return !!window.SiteNav.resolve(id);
    return !!document.getElementById(id);
  }

  function relink(scope) {
    scope.querySelectorAll('a.md-xref.md-xref-broken').forEach(function (a) {
      let id = (a.getAttribute('href') || '').slice(1);
      try { id = decodeURIComponent(id); } catch (e) {}
      if (id && targetExists(id)) a.classList.remove('md-xref-broken');
    });
  }

  function run() {
    document.querySelectorAll('.md-block[data-md], .md-block[data-md-i18n]').forEach(apply);
    relink(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  const observer = new MutationObserver((muts) => {
    let langChanged = false;
    muts.forEach((m) => {
      if (m.type !== 'attributes') return;

      if (m.attributeName === 'data-lang' &&
          (m.target === document.body || m.target === document.documentElement)) {
        langChanged = true;
        return;
      }

      if (m.target.classList && m.target.classList.contains('md-block')) {
        apply(m.target);
      }
    });
    if (langChanged) run();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-md', 'data-md-i18n', 'data-lang']
  });

  let tooltipLoading = false;
  function tooltipApi() {
    if (window.SiteTooltip) return window.SiteTooltip;

    if (!tooltipLoading) {
      tooltipLoading = true;
      const s = document.createElement('script');
      s.src = '/assets/js/tooltip.js';
      document.head.appendChild(s);
    }
    return null;
  }

  function extractPreview(el) {
    const raw = (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    return raw.length <= 180 ? raw : raw.slice(0, 177) + '...';
  }

  function tipFor(el) {
    if (el.classList.contains('md-footnote')) {
      const note = el.getAttribute('data-note') || '';
      return note ? { content: note, markdown: true, pinnable: true } : null;
    }
    if (el.classList.contains('md-xref-broken')) return null;
    const href = el.getAttribute('href') || '';
    if (!/^#[\w-]+$/.test(href)) return null;
    const target = document.getElementById(decodeURIComponent(href.slice(1)));
    const text = target ? extractPreview(target) : '';
    return text ? { content: text, markdown: false, pinnable: false } : null;
  }

  function tipTriggerFrom(target) {
    if (!target || !target.closest) return null;
    return target.closest('a.md-xref') || target.closest('.md-footnote');
  }

  function showFor(trigger) {
    const api = tooltipApi();
    const tip = trigger && tipFor(trigger);
    if (!api || !tip || api.anchor() === trigger) return api;
    api.show(trigger, tip.content, { pos: 'top', markdown: tip.markdown, pinnable: tip.pinnable });
    return api;
  }

  document.addEventListener('pointerover', function (e) { showFor(tipTriggerFrom(e.target)); });

  document.addEventListener('click', function (e) {
    const trigger = tipTriggerFrom(e.target);
    if (!trigger || !trigger.classList.contains('md-footnote')) return;
    const api = showFor(trigger);
    if (api) api.pin(trigger);
  }, true);

  document.addEventListener('focusin', function (e) {
    const t = tipTriggerFrom(e.target);
    if (t) showFor(t);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const t = tipTriggerFrom(e.target);
    if (t && t.classList.contains('md-footnote')) { const api = showFor(t); if (api) api.pin(t); }
  });

  window.MdBlock = {
    render,
    relink,
    renderInline,
    renderEditableLine,
    apply,
    collectContext,
    collectReferenceIds
  };
})();
