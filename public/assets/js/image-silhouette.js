(function () {
  function apply(el) {
    const a = (name) => el.getAttribute(name) || '';
    const src = (a('data-src') || (el.tagName === 'IMG' ? a('src') : '')).trim();
    const fill = (a('data-fill') || '#ffffff').trim();
    const alphaRaw = parseFloat(a('data-alpha'));
    const alpha = isNaN(alphaRaw) ? 1 : Math.max(0, Math.min(1, alphaRaw));
    const mode = a('data-mode') || 'solid';
    const fit  = a('data-fit')  || 'contain';
    const rimRaw = parseFloat(a('data-rim'));
    const rim = isNaN(rimRaw) ? 3 : rimRaw;

    const hex = fill.replace('#', '');
    const s = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex.slice(0, 6);
    const r = parseInt(s.slice(0, 2), 16) || 0;
    const g = parseInt(s.slice(2, 4), 16) || 0;
    const b = parseInt(s.slice(4, 6), 16) || 0;
    const fillCss = alpha >= 0.999
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${+alpha.toFixed(3)})`;

    el.style.setProperty('--img-mask-src', src ? `url("${src}")` : 'none');
    el.style.setProperty('--img-mask-color', fillCss);
    el.style.setProperty('--img-mask-size', fit);
    el.style.setProperty('--img-outline-size', rim + 'px');

    el.classList.toggle('is-outline', mode === 'outline');
    el.classList.toggle('is-shrink',  mode === 'shrink');
  }

  function run() {
    document.querySelectorAll('.img-silhouette, .img-outline-only').forEach(apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  const mo = new MutationObserver((muts) => {
    if (muts.some((m) => m.target.matches && m.target.matches('.img-silhouette, .img-outline-only'))) run();
  });
  mo.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-src', 'src', 'class', 'data-fill', 'data-alpha', 'data-mode', 'data-fit', 'data-rim'],
  });
})();
