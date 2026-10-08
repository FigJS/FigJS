// Content blocks composed from site.css / presets.css classes.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-content-blocks',
  plugin: function (editor) {
  const { registerSimpleBlock, icons } = window.PresetRegistry;

  registerSimpleBlock(editor, {
    id: 'hero-section',
    label: 'Hero Section',
    category: 'Sections',
    media: icons.card,
    html: `
      <section style="padding:64px 20px; text-align:center;">
        <h1>A bold headline goes here</h1>
        <p class="lede">A short supporting sentence underneath the headline.</p>
        <a href="#" class="btn btn-primary">Call to action</a>
      </section>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'cta-banner',
    label: 'Call-to-Action Banner',
    category: 'Sections',
    media: icons.card,
    html: `
      <div class="card card-elevated" style="text-align:center; padding:40px;">
        <h2>Ready to see more?</h2>
        <p>One more sentence of context.</p>
        <a href="#" class="btn btn-primary">Take action</a>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'stats-row',
    label: 'Stats Row',
    category: 'Sections',
    media: icons.stats,
    html: `
      <div style="display:flex; justify-content:space-around; text-align:center; flex-wrap:wrap; gap:20px;">
        <div><div class="stat-number">12</div><div class="stat-label">Projects</div></div>
        <div><div class="stat-number">340</div><div class="stat-label">Visitors a day</div></div>
        <div><div class="stat-number">8</div><div class="stat-label">Years running</div></div>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'social-links',
    label: 'Social Links Row',
    category: 'Basic',
    media: icons.social,
    html: `
      <div class="social-links">
        <a href="#">Itch.io</a>
        <a href="#">GitHub</a>
        <a href="#">Bluesky</a>
      </div>
    `,
  });

  registerSimpleBlock(editor, {
    id: 'feature-list',
    label: 'Feature List',
    category: 'Sections',
    media: icons.text,
    html: `
      <div class="card-grid">
        <div><h3>First point</h3><p>Supporting detail.</p></div>
        <div><h3>Second point</h3><p>Supporting detail.</p></div>
        <div><h3>Third point</h3><p>Supporting detail.</p></div>
      </div>
    `,
  });
  },
});