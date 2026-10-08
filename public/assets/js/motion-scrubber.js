(function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function progressForStandalone(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = vh + r.height;
    if (total <= 0) return 0;
    const traveled = vh - r.top;
    return clamp(traveled / total, 0, 1);
  }

  function progressForPin(wrap) {
    const r = wrap.getBoundingClientRect();
    const vh = window.innerHeight;
    const scrollable = r.height - vh;
    if (scrollable <= 0) return r.top <= 0 ? 1 : 0;
    return clamp(-r.top / scrollable, 0, 1);
  }

  function parseFrames(el) {
    if (el.__scrubFramesCache) return el.__scrubFramesCache;
    let frames = [];
    try {
      const raw = el.getAttribute('data-scrub-json');
      if (raw) frames = JSON.parse(raw);
    } catch (e) { frames = []; }
    frames = frames.filter((f) => f && typeof f.at === 'number').sort((a, b) => a.at - b.at);
    el.__scrubFramesCache = frames;
    return frames;
  }

  const NUMERIC_KEYS = ['opacity', 'x', 'y', 'scale', 'rotate', 'blur'];

  function sample(frames, p) {
    if (!frames.length) return null;
    if (p <= frames[0].at) return frames[0];
    if (p >= frames[frames.length - 1].at) return frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      if (p >= a.at && p <= b.at) {
        const t = b.at === a.at ? 0 : (p - a.at) / (b.at - a.at);
        const out = {};
        NUMERIC_KEYS.forEach((k) => {
          if (k in a || k in b) {
            const av = k in a ? a[k] : b[k];
            const bv = k in b ? b[k] : a[k];
            out[k] = lerp(av, bv, t);
          }
        });
        return out;
      }
    }
    return frames[frames.length - 1];
  }

  function apply(el, f) {
    if (!f) return;
    const t = [];
    if (f.x != null || f.y != null) t.push(`translate(${f.x || 0}px, ${f.y || 0}px)`);
    if (f.scale != null) t.push(`scale(${f.scale})`);
    if (f.rotate != null) t.push(`rotate(${f.rotate}deg)`);
    if (t.length) el.style.transform = t.join(' ');
    if (f.opacity != null) el.style.opacity = String(f.opacity);
    if (f.blur != null) el.style.filter = `blur(${f.blur}px)`;
  }

  let ticking = false;
  function update() {
    ticking = false;

    document.querySelectorAll('[data-scrub="1"]:not(.scrub-layer)').forEach((el) => {
      const frames = parseFrames(el);
      if (!frames.length) return;
      apply(el, sample(frames, progressForStandalone(el)));
    });

    document.querySelectorAll('.scrub-pin-wrap').forEach((wrap) => {
      const p = progressForPin(wrap);
      wrap.style.setProperty('--scrub-progress', p.toFixed(4));
      wrap.querySelectorAll('.scrub-layer').forEach((layer) => {
        const frames = parseFrames(layer);
        if (!frames.length) return;
        apply(layer, sample(frames, p));
      });
    });
  }

  function onScrollOrResize() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
  else update();

  const mo = new MutationObserver((mutations) => {
    let dirty = false;
    mutations.forEach((m) => {
      if (m.type === 'attributes' && m.attributeName === 'data-scrub-json' && m.target.__scrubFramesCache) {
        delete m.target.__scrubFramesCache;
        dirty = true;
      }
    });
    if (dirty) update();
  });
  mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-scrub-json'] });
})();
