// Modal dialogs: Esc or the backdrop closes, Enter confirms.
//   FigJS.dialog.open({ title, body, actions, width, onClose }) -> { el, close }
//     actions: [{ label, primary, danger, onClick(close) }]; onClick
//     returning false keeps the dialog open.
//   FigJS.dialog.prompt({ title, label, value, placeholder, okLabel }) -> Promise<string|null>
//   FigJS.dialog.confirm({ title, message, okLabel, danger }) -> Promise<boolean>

(function () {
  'use strict';

  const FigJS = window.FigJS = window.FigJS || {};
  const stack = [];

  function open(opts) {
    const o = opts || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'fig-dialog-backdrop';

    const box = document.createElement('div');
    box.className = 'fig-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (o.width) box.style.width = typeof o.width === 'number' ? o.width + 'px' : o.width;

    if (o.title) {
      const h = document.createElement('div');
      h.className = 'fig-dialog-title';
      h.textContent = o.title;
      box.appendChild(h);
    }

    const body = document.createElement('div');
    body.className = 'fig-dialog-body';
    if (o.body instanceof Node) body.appendChild(o.body);
    else if (o.body != null) body.innerHTML = String(o.body);
    box.appendChild(body);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      if (o.onClose) { try { o.onClose(); } catch (e) { console.error(e); } }
    };

    const actions = o.actions || [{ label: 'Close' }];
    let primaryBtn = null;
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'fig-dialog-actions';
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        if (a.primary) { b.classList.add('is-primary'); primaryBtn = b; }
        if (a.danger) b.classList.add('is-danger');
        if (a.disabled) b.disabled = true;
        b.addEventListener('click', async () => {
          if (typeof a.onClick === 'function') {
            const keep = await a.onClick(close);
            if (keep === false) return;
          }
          close();
        });
        row.appendChild(b);
      });
      box.appendChild(row);
    }

    const onKey = (e) => {
      if (stack[stack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && primaryBtn && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault(); e.stopPropagation(); primaryBtn.click();
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    const api = { el: box, body, close };
    stack.push(api);
    requestAnimationFrame(() => {
      const focusable = box.querySelector('input, select, textarea, button.is-primary, button');
      if (focusable) focusable.focus();
    });
    return api;
  }

  function prompt(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let result = null;
      const wrap = document.createElement('label');
      wrap.className = 'fig-field';
      if (o.label) {
        const l = document.createElement('span');
        l.className = 'fig-field-label';
        l.textContent = o.label;
        wrap.appendChild(l);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.value = o.value || '';
      input.placeholder = o.placeholder || '';
      input.spellcheck = false;
      wrap.appendChild(input);
      open({
        title: o.title || '',
        body: wrap,
        width: o.width || 420,
        actions: [
          { label: 'Cancel' },
          { label: o.okLabel || 'OK', primary: true, onClick: () => { result = input.value; } },
        ],
        onClose: () => resolve(result),
      });
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });
  }

  function confirm(opts) {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise((resolve) => {
      let ok = false;
      const msg = document.createElement('div');
      msg.className = 'fig-dialog-message';
      msg.textContent = o.message || '';
      open({
        title: o.title || 'Are you sure?',
        body: msg,
        width: o.width || 440,
        actions: [
          { label: 'Cancel' },
          { label: o.okLabel || 'OK', primary: !o.danger, danger: !!o.danger, onClick: () => { ok = true; } },
        ],
        onClose: () => resolve(ok),
      });
    });
  }

  FigJS.dialog = { open, prompt, confirm };
})();
