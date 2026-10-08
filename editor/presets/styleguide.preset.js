// Style Guide: one block with every preset tag and component in numbered
// sections and a Contents sidebar, each specimen captioned. Specimens
// follow the tags' settings, so tuning a tag shows everywhere at once.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-styleguide',
  plugin: function (editor) {
    const { icons } = window.PresetRegistry;

    // Inline sample images: no dependency on site files.
    const GRADIENT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%233a6df0'/%3E%3Cstop offset='1' stop-color='%239b51e0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='90' fill='url(%23g)'/%3E%3C/svg%3E";
    const WARM = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='1' y2='0'%3E%3Cstop offset='0' stop-color='%23f2994a'/%3E%3Cstop offset='1' stop-color='%23eb5757'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='90' fill='url(%23g)'/%3E%3C/svg%3E";
    const STAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 38l32-3z' fill='%23f5b041'/%3E%3C/svg%3E";
    const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAUklEQVR42o2OsQ3AIAzATNQTOIK5c3J9MzNzBD/QpUgpDK0nK06kwEPJOkrWsfoxB5eeAJjzcokRIDqA8IG07sm8bsG80ronAViXZtyu4ve/uQFLsSXpzyaAGgAAAABJRU5ErkJggg==';

    // Everything a Markdown block does, with every kind of link: in-block,
    // in-page, broken, external, footnotes and anchors.
    const MD = [
      '# Markdown block ^md-top',
      '',
      'Text with **bold**, *italic*, __strong__, _emphasis_ and `inline code`.',
      '',
      '## Jumps ^md-jumps',
      '',
      '- [To the anchored note](#md-note): inside this block. Hover for a preview of the target.',
      '- [To the lists](#md-lists): to an anchored heading in this block.',
      '- [To section 1, Text](#sg-text): to another part of the page.',
      '- [To nowhere](#md-missing): a broken jump; the target does not exist, so it stays put.',
      '- [An external link](https://example.com) opens a new tab; [email](mailto:someone@example.com) opens the mail app.',
      '',
      '## Notes ^md-notes',
      '',
      'Hover a [footnote]^(A footnote holds **formatted** text, `code` and [links](https://example.com).) to read it; click it to pin it open.',
      'A second [footnote]^(Several notes can sit in one paragraph.) in the same line.',
      '',
      'And this is [the anchored note]^(md-note): the first jump above lands here.',
      '',
      '## Lists ^md-lists',
      '',
      '- An unordered item',
      '- Another item',
      '',
      '1. An ordered item',
      '2. A second step',
      '',
      '> A quote, set apart from the text.',
      '',
      '```js',
      'console.log("a code block");',
      '```',
      '',
      '![A pixel heart](' + PIXEL + ')',
      '',
      '---',
      '',
      '[Back to the top of this block](#md-top)',
    ].join('\n');

    const LOREM = 'Text that runs on long enough to show how this element wraps, clips and breaks across several lines of a narrow column.';

    // Component definitions take styles as `style`; GrapesJS ignores attributes.style.
    const css = (text) => {
      const out = {};
      String(text || '').split(';').forEach((decl) => {
        const i = decl.indexOf(':');
        if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
      });
      return out;
    };

    const caption = (text) => `<p class="text-small text-muted" style="margin:10px 0 0;">${text}</p>`;
    // Specimens stay out of the Contents; only sections are listed.
    const card = (specimen, label) => ({
      tagName: 'div', classes: ['card', 'pad-md'],
      attributes: { 'data-contents-skip': 'true' },
      components: [specimen, caption(label)],
    });
    const bare = (specimen, label) => ({
      tagName: 'div', attributes: { 'data-contents-skip': 'true' }, components: [specimen, caption(label)],
    });
    const grid = (items, min) => ({
      tagName: 'div', classes: ['grid-auto'],
      style: css(`--grid-min:${min || 200}px; --gap:16px;`),
      components: items,
    });
    const sub = (title) => `<h3 style="margin:8px 0 0;">${title}</h3>`;

    let number = 0;
    const section = (title, intro, parts) => {
      number += 1;
      return {
        tagName: 'section',
        attributes: {},
        style: css('display:flex; flex-direction:column; gap:18px; padding-bottom:48px;'),
        components: [`<h2>${number}. ${title}</h2>`]
          .concat(intro ? [`<p class="text-muted" style="margin:0;">${intro}</p>`] : [])
          .concat(parts),
      };
    };
    const panel = (text, extra) => `<div class="pad-md" style="background:var(--surface-2, #222); border-radius:8px;${extra || ''}">${text}</div>`;
    const img = (src, cls, style) => `<img src="${src}" alt="" class="${cls || ''}" style="display:block; ${style || 'width:100%; border-radius:6px;'}">`;

    function build() {
      number = 0;
      const sections = [
        section('Text', 'Headings, paragraphs and the text tags. With Markdown on (Page tab), text elements format themselves.', [
          `<div data-contents-skip="true"><h1 style="margin:0;">Heading one</h1><h2 style="margin:8px 0 0;">Heading two</h2><h3 style="margin:8px 0 0;">Heading three</h3><h4 style="margin:8px 0 0;">Heading four</h4></div>`,
          '<p class="lede" style="margin:0; text-align:left;">A lede paragraph introduces a section in a softer colour.</p>',
          grid([
            card('<p class="text-muted" style="margin:0;">Muted helper text.</p>', '.text-muted'),
            card('<p class="text-small" style="margin:0;">Small text.</p>', '.text-small'),
            card('<p class="text-large" style="margin:0;">Large text.</p>', '.text-large'),
            card('<p class="text-nowrap" data-text-overflow="ellipsis" style="margin:0;">This line never wraps, however narrow it gets.</p>', '.text-nowrap (ends in an ellipsis)'),
          ]),
          sub('Markdown in text'),
          card('<p data-text-md="on" style="margin:0; line-height:1.9;">**Bold**, *italic*, ___underline___, --strike--, ==highlight==, `code`, H~2~O, x^2^, ||spoiler||, [a link](#), [colour]{tomato} and [hex]{#4fc3f7}.</p>',
            'Markdown in text (Page tab, Text and spacing)'),
          `<blockquote class="quote">"A pull quote or testimonial." <cite>Attribution</cite></blockquote>`,
          `<p style="margin:0;"><span class="badge">Badge</span> <span class="badge">Tag</span> <span class="badge">Label</span></p>`,
        ]),

        section('Buttons and links', null, [
          grid([
            card('<a href="#" class="btn btn-primary">Primary</a>', '.btn .btn-primary'),
            card('<a href="#" class="btn btn-secondary">Secondary</a>', '.btn .btn-secondary'),
            card('<a href="#" class="btn btn-ghost">Ghost</a>', '.btn .btn-ghost'),
            card('<a href="#" class="hover-underline" style="color:inherit;">Underline grows</a>', '.hover-underline'),
            card('<button type="button" class="btn share-button">Share</button>', '.share-button'),
          ], 180),
        ]),

        section('Surfaces', 'Panels that hold content: cards, glass, outlines and shadows.', [
          grid([
            card('<p style="margin:0;">Plain card.</p>', '.card'),
            { tagName: 'div', classes: ['card', 'card-elevated', 'pad-md'], components: ['<p style="margin:0;">Raised.</p>', caption('.card .card-elevated')] },
            { tagName: 'div', classes: ['card', 'card-accent', 'pad-md'], components: ['<p style="margin:0;">Accent border.</p>', caption('.card .card-accent')] },
            { tagName: 'div', classes: ['shadow-custom', 'pad-md'], style: css('background:var(--surface, #1e1e1e); border-radius:10px;'), components: ['<p style="margin:0;">Tunable shadow.</p>', caption('.shadow-custom')] },
            { tagName: 'div', classes: ['outline-thin', 'pad-md'], style: css('border-radius:8px;'), components: ['<p style="margin:0;">Thin outline.</p>', caption('.outline-thin')] },
            { tagName: 'div', classes: ['outline-thick', 'pad-md'], style: css('border-radius:8px;'), components: ['<p style="margin:0;">Thick outline.</p>', caption('.outline-thick')] },
            { tagName: 'div', classes: ['outline-dashed', 'pad-md'], style: css('border-radius:8px;'), components: ['<p style="margin:0;">Dashed outline.</p>', caption('.outline-dashed')] },
            { tagName: 'div', classes: ['ring-accent', 'pad-md'], style: css('border-radius:8px;'), components: ['<p style="margin:0;">Accent ring.</p>', caption('.ring-accent')] },
          ]),
          sub('Glass'),
          {
            tagName: 'div',
            style: css(`padding:28px; border-radius:12px; background:url("${GRADIENT}") center / cover;`),
            components: [grid([
              { tagName: 'div', classes: ['glass', 'pad-md'], style: css('border-radius:10px;'), components: ['<p style="margin:0;">Light glass.</p>', caption('.glass')] },
              { tagName: 'div', classes: ['glass-dark', 'pad-md'], style: css('border-radius:10px;'), components: ['<p style="margin:0;">Dark glass.</p>', caption('.glass-dark')] },
            ])],
          },
        ]),

        section('Backgrounds', null, [
          grid([
            { tagName: 'div', classes: ['bg-gradient-linear', 'pad-lg'], style: css('min-height:150px; border-radius:8px; color:#fff;'), components: ['Linear gradient', caption('.bg-gradient-linear')] },
            { tagName: 'div', classes: ['bg-gradient-radial', 'pad-lg'], style: css('min-height:150px; border-radius:8px; color:#fff;'), components: ['Radial gradient', caption('.bg-gradient-radial')] },
            { tagName: 'div', classes: ['bg-gradient-linear', 'bg-noise', 'pad-lg'], style: css('min-height:150px; border-radius:8px; color:#fff;'), components: ['Gradient with grain', caption('.bg-noise')] },
          ]),
          sub('Background image'),
          grid([
            { tagName: 'div', classes: ['bg-image-cover', 'pad-md'], style: css(`min-height:130px; border-radius:8px; color:#fff; background-image:url("${WARM}");`), components: [caption('.bg-image-cover')] },
            { tagName: 'div', classes: ['bg-image-contain', 'pad-md'], style: css(`min-height:130px; border-radius:8px; background-color:var(--surface-2, #222); background-image:url("${STAR}");`), components: [caption('.bg-image-contain')] },
            { tagName: 'div', classes: ['bg-image-tile', 'pad-md'], style: css(`min-height:130px; border-radius:8px; background-size:32px; background-image:url("${STAR}");`), components: [caption('.bg-image-tile')] },
            { tagName: 'div', classes: ['bg-image-cover', 'bg-fixed', 'pad-md'], style: css(`min-height:130px; border-radius:8px; color:#fff; background-image:url("${GRADIENT}");`), components: [caption('.bg-fixed (stays put while scrolling)')] },
          ]),
        ]),

        section('Layout', 'Arranging children: rows, columns, grids and splits.', [
          grid([
            card(`<div class="flex-center" style="min-height:70px; background:var(--surface-2, #222); border-radius:6px;">centered</div>`, '.flex-center'),
            card(`<div class="flex-between" style="background:var(--surface-2, #222); border-radius:6px; padding:8px;"><span>left</span><span>right</span></div>`, '.flex-between'),
            card(`<div class="flex-col" style="gap:6px;"><span>one</span><span>two</span></div>`, '.flex-col'),
            card(`<div class="center-row"><span class="badge">a</span><span class="badge">b</span><span class="badge">c</span></div>`, '.center-row'),
            card(`<div class="relative" style="height:80px; background:var(--surface-2, #222); border-radius:6px;"><span class="absolute-center badge">middle</span></div>`, '.relative + .absolute-center'),
          ]),
          sub('Grids'),
          bare(`<div class="grid-2">${panel('1')}${panel('2')}</div>`, '.grid-2 (one column on phones)'),
          bare(`<div class="grid-3">${panel('1')}${panel('2')}${panel('3')}</div>`, '.grid-3'),
          bare(`<div class="grid-4 grid-no-collapse">${panel('1')}${panel('2')}${panel('3')}${panel('4')}</div>`, '.grid-4 .grid-no-collapse (keeps its columns)'),
          bare(`<div class="grid-auto" style="--grid-min:120px;">${panel('auto')}${panel('auto')}${panel('auto')}${panel('auto')}${panel('auto')}</div>`, '.grid-auto (fills the width)'),
          sub('Stacks and splits'),
          bare(`<div class="stack">${panel('Panel A', ' flex:1;')}${panel('Panel B', ' flex:1;')}</div>`, '.stack (row on desktop, column on phones)'),
          bare(`<div class="split">${img(GRADIENT)}${panel('Text beside an image.')}</div>`, '.split'),
          bare(`<div class="split-reverse">${img(WARM)}${panel('The image swaps sides.')}</div>`, '.split-reverse'),
          sub('Width'),
          bare(`<div class="container-narrow">${panel('A narrow, centered column for reading.')}</div>`, '.container-narrow'),
          bare(`<div class="span-bleed">${panel('Bleeds to the edges of the screen.', ' border-radius:0; text-align:center;')}</div>`, '.span-bleed'),
        ]),

        section('Spacing', null, [
          grid([
            card(`<div class="pad-sm" style="background:var(--surface-2, #222); border-radius:6px;">pad</div>`, '.pad-sm'),
            card(`<div class="pad-md" style="background:var(--surface-2, #222); border-radius:6px;">pad</div>`, '.pad-md'),
            card(`<div class="pad-lg" style="background:var(--surface-2, #222); border-radius:6px;">pad</div>`, '.pad-lg'),
            card(`<div style="display:flex;" class="gap-sm"><span class="badge">a</span><span class="badge">b</span></div>`, '.gap-sm'),
            card(`<div style="display:flex;" class="gap-lg"><span class="badge">a</span><span class="badge">b</span></div>`, '.gap-lg'),
            card(`<div><span class="badge">above</span><div class="spacer-sm"></div><span class="badge">below</span></div>`, '.spacer-sm'),
          ], 160),
        ]),

        section('Position and stickiness', 'Each box below scrolls on its own: scroll inside it to see where the marked element holds.', [
          grid([
            card(`<div class="scroll-box" data-box-mode="scroll" style="height:220px; border-radius:6px; background:var(--surface-2, #222);"><div style="height:640px; padding:0 10px;"><p>Scroll down.</p><div class="sticky-top badge">Holds at the top</div><p style="margin-top:420px;">End.</p></div></div>`, '.sticky-top, Holds at: Top'),
            card(`<div class="scroll-box" data-box-mode="scroll" style="height:220px; border-radius:6px; background:var(--surface-2, #222);"><div style="height:640px; padding:0 10px;"><p>Scroll down.</p><div class="sticky-top badge" data-stick-side="center">Holds in the center</div><p style="margin-top:420px;">End.</p></div></div>`, '.sticky-top, Holds at: Center'),
            card(`<div class="scroll-box" data-box-mode="scroll" style="height:220px; border-radius:6px; background:var(--surface-2, #222);"><div style="height:640px; padding:0 10px; display:flex; flex-direction:column; justify-content:space-between;"><p>Scroll down.</p><div class="sticky-top badge" data-stick-side="bottom">Holds at the bottom</div></div></div>`, '.sticky-top, Holds at: Bottom'),
          ], 220),
          sub('Stacking'),
          bare(`<div class="relative" style="height:150px;"><div class="z-behind pad-md" style="position:absolute; top:0; left:0; width:55%; height:110px; background:var(--surface, #1a1a1a); border-radius:8px;">behind</div><div class="z-front pad-md" style="position:absolute; top:20px; left:22%; width:55%; height:110px; background:var(--surface-2, #2a2a2a); border-radius:8px;">front</div><div class="z-top pad-md" style="position:absolute; top:40px; left:44%; width:55%; height:110px; background:var(--border-2, #444); border-radius:8px;">top</div></div>`, '.z-behind, .z-front, .z-top'),
          sub('Pinning'),
          grid([
            card(`<div style="height:120px; border-radius:6px; background:var(--surface-2, #222);"><span class="badge pin-top-left">top left</span><span class="badge pin-top">top</span><span class="badge pin-top-right">top right</span><span class="badge pin-center">middle</span><span class="badge pin-bottom-left">bottom left</span><span class="badge pin-bottom-right">bottom right</span></div>`, '.pin-top-left, .pin-top, .pin-center …'),
            card(`<div style="height:120px; margin:12px; border-radius:6px; background:var(--surface-2, #222);"><span class="badge pin-top-right" data-pin-sit="edge">3</span></div>`, '.pin-top-right, Sits: On the edge'),
            card(`<div style="height:120px; margin-top:28px; border-radius:6px; background:var(--surface-2, #222);"><span class="badge pin-top-left" data-pin-sit="out">label</span><div class="pin-bottom" data-pin-stretch="on" style="height:6px; background:var(--accent, #007acc); border-radius:0 0 6px 6px;"></div></div>`, 'Sits: Outside; .pin-bottom, Size: Along the edge'),
          ], 220),
        ]),

        section('Containment', 'Keeping content inside its box.', [
          grid([
            card(`<div class="aspect-box clip-content" style="border-radius:10px; background:var(--surface-2, #222);">${img(WARM, 'fill', '')}</div>`, '.aspect-box + .fill + .clip-content'),
            card(`<div class="aspect-square clip-content" style="border-radius:50%;">${img(GRADIENT, 'fill', '')}</div>`, '.aspect-square + .fill'),
            card(`<p class="clamp-2" style="margin:0;">${LOREM}</p>`, '.clamp-2'),
            card(`<p class="clamp-1" style="margin:0;">${LOREM}</p>`, '.clamp-1'),
            card(`<p class="break-all" style="margin:0;">https://example.com/a/very/long/address/that/would/otherwise/overflow</p>`, '.break-all'),
            card(`<div class="contain-content" style="max-width:160px;"><p style="margin:0;">${LOREM}</p></div>`, '.contain-content'),
          ]),
        ]),

        section('Effects and filters', null, [
          grid([
            card(img(GRADIENT, 'blur-custom'), '.blur-custom'),
            card(img(WARM, 'grayscale'), '.grayscale'),
            card(img(GRADIENT, 'saturate'), '.saturate'),
            card(img(WARM, 'fx'), '.fx (combined filters)'),
            card(img(GRADIENT, 'opacity-50'), '.opacity-50'),
            card(img(GRADIENT, 'opacity-25'), '.opacity-25'),
          ], 160),
          sub('Scale'),
          grid([
            card(`<div class="scale-75">${panel('75%')}</div>`, '.scale-75'),
            card(`<div class="scale-90">${panel('90%')}</div>`, '.scale-90'),
            card(`<div class="scale-110">${panel('110%')}</div>`, '.scale-110'),
            card(`<div class="scale-125">${panel('125%')}</div>`, '.scale-125'),
          ], 160),
        ]),

        section('Images', 'Rendering, outlines that follow the image\'s shape, masks and image components.', [
          sub('Rendering'),
          grid([
            card(img(PIXEL, 'img-render-smooth', 'width:96px; height:96px;'), '.img-render-smooth'),
            card(img(PIXEL, 'img-render-pixelated', 'width:96px; height:96px;'), '.img-render-pixelated (pixel-exact)'),
            card(img(PIXEL, 'img-render-crisp', 'width:96px; height:96px;'), '.img-render-crisp'),
          ], 160),
          sub('Shape effects'),
          grid([
            card(img(STAR, 'img-outline-thin', 'width:90px;'), '.img-outline-thin'),
            card(img(STAR, 'img-outline-thick', 'width:90px;'), '.img-outline-thick'),
            card(img(STAR, 'img-glow', 'width:90px;'), '.img-glow'),
            card(img(STAR, 'img-double-glow', 'width:90px;'), '.img-double-glow'),
            card(img(STAR, 'img-shadow', 'width:90px;'), '.img-shadow'),
            card(img(STAR, 'img-outline-only', 'width:90px; height:90px;'), '.img-outline-only'),
          ], 140),
          sub('Masks'),
          grid([
            card(`<div class="mask-circle bg-gradient-linear" style="width:110px; height:110px;"></div>`, '.mask-circle'),
            card(`<div class="mask-hexagon bg-gradient-linear" style="width:110px; height:110px;"></div>`, '.mask-hexagon'),
            card(`<div class="mask-star bg-gradient-linear" style="width:110px; height:110px;"></div>`, '.mask-star'),
            card(`<div class="mask-blob bg-gradient-linear" style="width:110px; height:110px;"></div>`, '.mask-blob'),
          ], 140),
          sub('Image components'),
          grid([
            card({ type: 'image-cycle', attributes: { 'data-cycle-images': `${GRADIENT}|${WARM}`, 'data-cycle-interval': '3' } }, 'Image Cycle'),
            card({ type: 'image-silhouette', attributes: { 'data-src': STAR, 'data-mode': 'solid', 'data-fill': '#ffffff', 'data-fit': 'contain', 'data-rim': '3' } }, 'Image Silhouette'),
            card(`<div class="hover-zoom" style="border-radius:8px;">${img(GRADIENT)}</div>`, '.hover-zoom'),
          ], 220),
        ]),

        section('Motion: entrance', 'Plays once when the page opens. Replay in the toolbar plays them again.', [
          grid([
            card('<div class="anim-fade-in">Fade in</div>', '.anim-fade-in'),
            card('<div class="anim-slide-up">Slide up</div>', '.anim-slide-up'),
            card('<div class="anim-slide-down">Slide down</div>', '.anim-slide-down'),
            card('<div class="anim-slide-left">Slide left</div>', '.anim-slide-left'),
            card('<div class="anim-slide-right">Slide right</div>', '.anim-slide-right'),
            card('<div class="anim-zoom-in">Zoom in</div>', '.anim-zoom-in'),
          ], 160),
          sub('Stagger'),
          bare('<div class="center-row"><span class="badge anim-slide-up anim-delay-1">1</span><span class="badge anim-slide-up anim-delay-2">2</span><span class="badge anim-slide-up anim-delay-3">3</span><span class="badge anim-slide-up anim-delay-4">4</span></div>',
            '.anim-delay-1 to .anim-delay-4'),
        ]),

        section('Motion: loops', null, [
          grid([
            card('<span class="badge anim-pulse">Pulse</span>', '.anim-pulse'),
            card('<span class="badge anim-float" style="display:inline-block;">Float</span>', '.anim-float'),
            card(`<img src="${STAR}" alt="" class="anim-spin" style="width:40px; display:block;">`, '.anim-spin'),
            card('<span class="badge anim-blink">Blink</span>', '.anim-blink'),
            card('<span class="badge anim-blink" data-blink-trigger="hover" data-blink-style="smooth">Hover me</span>', '.anim-blink, on hover, smooth'),
          ], 160),
        ]),

        section('Motion: hover', 'Point at each card. A hover stage keeps the pointer steady while its child moves.', [
          grid([
            card('<div class="hover-grow">Grow</div>', '.hover-grow'),
            card('<div class="hover-lift">Lift</div>', '.hover-lift'),
            card('<div class="hover-fade">Fade</div>', '.hover-fade'),
            card('<div class="hover-glow">Glow</div>', '.hover-glow'),
            card('<div class="hover-tilt">Tilt</div>', '.hover-tilt'),
            card('<div class="hover-shift">Shift</div>', '.hover-shift'),
            card('<div class="near-cursor" style="--near-range:220px; --near-far-opacity:0.1;">Comes in as the cursor nears</div>', '.near-cursor'),
          ], 140),
          bare('<div class="hover-stage"><div class="card pad-md hover-lift hover-grow">Lift and grow inside a stage.</div></div>', '.hover-stage'),
        ]),

        section('Motion: scroll reveal', 'Hidden until scrolled into view (the reveal line is set per element).', [
          grid([
            card('<div class="reveal-fade pad-md">Fades in</div>', '.reveal-fade'),
            card('<div class="reveal-slide-up pad-md">Slides up</div>', '.reveal-slide-up'),
            card('<div class="reveal-slide-left pad-md">From the right</div>', '.reveal-slide-left'),
            card('<div class="reveal-slide-right pad-md">From the left</div>', '.reveal-slide-right'),
            card('<div class="reveal-zoom pad-md">Zooms in</div>', '.reveal-zoom'),
          ], 160),
          sub('Scroll-linked'),
          grid([
            card('<div class="auto-fade-up" data-reveal-trigger="view">Fades up with the scroll</div>', '.auto-fade-up'),
            card('<div class="auto-fade-down" data-reveal-trigger="view">Fades down with the scroll</div>', '.auto-fade-down'),
            card(`<div style="position:relative; height:110px; border-radius:6px; overflow:clip; display:flex; align-items:center; padding:0 14px; background:url(&quot;${WARM}&quot;) center / cover;"><p style="margin:0; font-size:1.6rem; font-weight:700; color:#fff;">Behind the glass</p><div class="auto-blur" data-reveal-trigger="view" style="position:absolute; inset:12px 12px 12px 45%; border-radius:6px; background:rgba(255,255,255,0.08);"></div></div>`, '.auto-blur (blurs what is behind it)'),
            card('<div class="auto-shadow pad-sm" data-reveal-trigger="view" style="border-radius:6px;">Gains a shadow</div>', '.auto-shadow'),
            card('<div class="auto-bg pad-sm" data-reveal-trigger="view" style="border-radius:6px;">Gains a background</div>', '.auto-bg'),
          ], 180),
          bare(`<div class="scrub-standalone" data-scrub="1" data-scrub-json='[{"at":0,"opacity":0,"y":40},{"at":0.4,"opacity":1,"y":0},{"at":0.85,"opacity":1,"y":0},{"at":1,"opacity":0,"y":-40}]'>${panel('Drifts and fades with its position on screen.')}</div>`,
            'Scroll-Scrubbed Element'),
        ]),

        section('Ribbons and carousels', null, [
          bare({
            type: 'scroll-track',
            attributes: { 'data-track-mode': 'marquee', 'data-track-loop': 'true', 'data-track-speed': '50', 'data-track-hover-slow': '100' },
            components: '<div class="track-viewport"><div class="track-inner">' +
              ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((t) => `<div class="track-slide"><span class="badge">${t}</span></div>`).join('') +
              '</div></div>',
          }, 'Ribbon (marquee): slows on hover'),
          bare({
            type: 'scroll-track',
            attributes: { 'data-track-mode': 'marquee', 'data-track-loop': 'true', 'data-track-speed': '30', 'data-track-direction': 'rtl' },
            components: '<div class="track-viewport"><div class="track-inner">' +
              [GRADIENT, WARM, GRADIENT, WARM].map((src) => `<div class="track-slide">${img(src, '', 'width:200px; border-radius:6px;')}</div>`).join('') +
              '</div></div>',
          }, 'Ribbon of images, right to left'),
          bare({
            type: 'scroll-track',
            attributes: { 'data-track-mode': 'carousel', 'data-track-loop': 'true', 'data-track-controls': 'both', 'data-track-captions': 'true' },
            components: '<div class="track-viewport"><div class="track-inner">' +
              [['First slide', GRADIENT], ['Second slide', WARM], ['Third slide', GRADIENT]]
                .map(([t, src]) => `<div class="track-slide" data-caption="${t}">${img(src, '', 'width:100%; aspect-ratio:16 / 7; object-fit:cover; border-radius:6px;')}</div>`).join('') +
              '</div></div>',
          }, 'Carousel with arrows, dots and captions'),
          grid([
            card({ type: 'scroll-box', attributes: { 'data-box-mode': 'scroll' }, style: css('height:140px;'), components: `<p style="margin:0;">${LOREM} ${LOREM} ${LOREM}</p>` }, 'Scroll Container'),
            card({ type: 'scroll-box', attributes: { 'data-box-mode': 'clip' }, style: css('height:80px;'), components: `<p style="margin:0;">${LOREM} ${LOREM}</p>` }, 'Overflow Window'),
          ], 240),
        ]),

        section('Sticky sections', 'Containers that hold their stage on screen while the page scrolls past.', [
          bare(`<div class="sticky-range" style="--stick-range:120vh;"><div class="sticky-range-inner">${panel('Sticky Hold: stays fully visible for a while.')}</div></div>`, 'Sticky Hold, Holds at: Top'),
          bare(`<div class="sticky-range" data-stick-to="center" style="--stick-range:120vh;"><div class="sticky-range-inner">${panel('Holds in the middle of the screen.')}</div></div>`, 'Sticky Hold, Holds at: Center'),
          bare(`<div class="sticky-window" style="--stick-range:140vh; --stick-window:50vh;"><div class="sticky-window-stage" style="background:url(&quot;${GRADIENT}&quot;) center / cover; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff;">A window the page slides behind</div></div>`, 'Sticky Window'),
          bare(`<div class="sticky-scroll-sequence">` +
            ['Step one', 'Step two lands lower', 'Step three, lower still'].map((t) =>
              `<div class="sticky-scroll-step" style="--stick-range:90vh;"><div class="sticky-scroll-stage card pad-md">${t}</div></div>`).join('') +
            '</div>', 'Sticky Scroll Sequence'),
        ]),

        section('Media', null, [
          grid([
            card({ type: 'audio-player', attributes: { 'data-src': '' } }, 'Audio Player'),
            card({ type: 'video-player', attributes: { 'data-src': '', 'data-type': 'auto', 'data-ui': 'custom' } }, 'Video Player'),
          ], 280),
          bare(`<div class="viewport-window" style="height:220px;"><div class="viewport-window-scene" style="width:900px; height:600px;"><div style="width:100%; height:100%; background:url(&quot;${GRADIENT}&quot;) center / cover;"></div></div></div>`,
            'Viewport Window: a fixed-size scene scaled to fit'),
          grid([
            card(`<div class="zoom-box aspect-box" data-zoom-controls="on" style="border-radius:6px;"><img src="${GRADIENT}" alt="" style="display:block; width:100%; height:100%; object-fit:cover;"></div>`,
              '.zoom-box: wheel, pinch or double-click zooms, drag pans'),
            card(`<div class="gallery-viewer grid-3 grid-no-collapse" style="--gap:8px; --grid-phone-cols:3;">` +
              [[GRADIENT, 'Cool gradient'], [WARM, 'Warm gradient'], [STAR, 'Star']].map(([src, alt]) =>
                `<img src="${src}" alt="${alt}" style="display:block; width:100%; aspect-ratio:1; object-fit:cover; border-radius:4px;">`).join('') +
              '<dialog class="subpage gallery-view" id="sg-gallery" data-gallery-strip="on"></dialog></div>', '.gallery-viewer: an image opens full size'),
          ], 280),
        ]),

        section('Interaction', null, [
          bare(`<div class="accordion-item"><div class="accordion-header"><span>Expandable section</span><span class="accordion-icon">+</span></div><div class="accordion-body"><div class="accordion-body-inner"><p>Content shown when opened.</p></div></div></div>`, 'Accordion'),
          sub('Subpages'),
          grid([
            card(`<a href="#sg-subpage" class="btn btn-secondary">Open a subpage</a><dialog class="subpage" id="sg-subpage"><div class="subpage-bar"><span class="subpage-title">Subpage</span><button type="button" class="subpage-close" aria-label="Close">&times;</button></div><div class="subpage-body"><p style="margin-top:0;">A window over the page. The page behind is blocked and stops scrolling until this closes (Esc, a click outside, or the close button).</p></div></dialog>`,
              'Subpage: a window, page blocked'),
            card(`<a href="#sg-sheet" class="btn btn-secondary">Open a side sheet</a><dialog class="subpage" id="sg-sheet" data-subpage-place="right" data-subpage-mode="float"><div class="subpage-bar"><span class="subpage-title">Side sheet</span><button type="button" class="subpage-close" aria-label="Close">&times;</button></div><div class="subpage-body"><p style="margin-top:0;">Slides in from the side while the page stays usable and scrollable.</p></div></dialog>`,
              'Subpage: a side sheet, page usable'),
          ], 220),
          bare(`<div class="floating-panel-group"><span class="floating-panel-trigger btn btn-secondary">Open panel</span><div class="floating-panel" data-floating-panel><div class="floating-panel-bar"><span>Panel</span><button type="button" class="floating-panel-close" aria-label="Close">&times;</button></div><div class="floating-panel-body"><p style="margin:0;">A popover panel.</p></div></div></div>`, 'Floating Panel'),
          sub('Tooltips'),
          grid([
            card('<span class="badge" data-tooltip-text="Shown above (the default)">Hover me</span>', 'Tooltip, top'),
            card('<span class="badge" data-tooltip-text="Shown below" data-tooltip-pos="bottom">Hover me</span>', 'Tooltip, bottom'),
            card('<span class="badge" data-tooltip-text="Shown to the left" data-tooltip-pos="left">Hover me</span>', 'Tooltip, left'),
            card('<span class="badge" data-tooltip-text="Shown to the right" data-tooltip-pos="right">Hover me</span>', 'Tooltip, right'),
            card('<span class="badge" data-tooltip-text="Tooltips take **bold**, *italic* and [links](https://example.com). Click to pin this one." data-tooltip-pin="true">Click to pin</span>', 'Tooltip, formatted and pinnable'),
          ], 180),
          sub('Copy and share'),
          grid([
            card(`<pre class="copy-content" style="margin:0; padding:14px; background:var(--code-bg, #141414); border-radius:6px; overflow:auto;"><code>copy this</code></pre>`, '.copy-content'),
            card(`<h4 class="anchor-copy" style="margin:0; padding-right:40px;">Linkable heading</h4>`, '.anchor-copy'),
            card(`<div class="share-button pad-md" style="background:var(--surface-2, #222); border-radius:6px;">Share this block</div>`, '.share-button on a block'),
          ], 220),
        ]),

        section('Navigation', 'In-page links jump to their target; the Contents beside this guide is one of these.', [
          grid([
            card(`<nav class="scrollspy" style="display:flex; flex-direction:column; gap:4px;"><a href="#sg-text">Text</a><a href="#sg-layout">Layout</a><a href="#sg-motion">Motion</a></nav>`, '.scrollspy (marks the section on screen)'),
            card(`<nav class="breadcrumb"><a href="#">Home</a> / <a href="#">Section</a> / <span>Page</span></nav>`, '.breadcrumb'),
            card(`<a href="#sg-layout" class="btn btn-secondary">To 5. Layout</a>`, 'Link to a section (outline on arrival)'),
            card(`<a href="#sg-motion" class="btn btn-secondary" data-jump-highlight="fill" data-jump-align="center">To 11. Motion, centered</a>`, 'Lands centered, fill highlight'),
            card(`<a href="#sg-text" class="btn btn-secondary" data-jump-highlight="none" data-jump-scroll="instant">To 1. Text, instantly</a>`, 'Instant jump, no highlight'),
            card(`<div class="pad-sm" data-link-href="#sg-layout" style="background:var(--surface-2, #222); border-radius:6px;">Any element can jump: this box links to 5. Layout.</div>`, 'Link to on a box'),
            card(`<a href="#sg-nowhere" class="btn btn-ghost">To a missing target</a>`, 'Broken jump: stays put'),
          ], 220),
        ]),

        section('Language and theme', null, [
          grid([
            card({ type: 'lang-switch', attributes: { 'data-site-lang-switch': '', 'data-lang-display': 'tag' } }, 'Language Switcher (tags)'),
            card({ type: 'lang-switch', attributes: { 'data-site-lang-switch': '', 'data-lang-display': 'name' } }, 'Language Switcher (names)'),
            card(`<select class="site-lang-select lang-select-styled" data-site-lang-select aria-label="Language"></select>`, '.lang-select-styled'),
            card(`<button type="button" class="btn btn-secondary" onclick="window.SiteTheme && window.SiteTheme.cycleTheme()">Toggle theme</button>`, 'Theme Toggle Button'),
          ], 200),
        ]),

        section('Content blocks', null, [
          bare({ type: 'md-block', attributes: { 'data-md': MD } }, 'Markdown Block: jumps, footnotes and anchors'),
          bare(`<div style="display:flex; justify-content:space-around; text-align:center; flex-wrap:wrap; gap:20px;"><div><div class="stat-number">12</div><div class="stat-label">Projects</div></div><div><div class="stat-number">340</div><div class="stat-label">Visitors a day</div></div><div><div class="stat-number">8</div><div class="stat-label">Years running</div></div></div>`, 'Stats Row'),
          bare({ type: 'free-canvas' }, 'Free Placement'),
          bare({ type: 'site-footer' }, 'Footer'),
        ]),
      ];

      // Fixed ids for the sections the navigation specimens link to.
      const ids = { 1: 'sg-text', 5: 'sg-layout', 11: 'sg-motion' };
      sections.forEach((s, i) => {
        const id = ids[i + 1];
        if (id) s.attributes.id = id;
      });

      return {
        type: 'contents-layout',
        style: css('--contents-width:220px;'),
        components: [
          {
            type: 'contents',
            attributes: { 'data-contents': 'auto', 'data-contents-levels': 'h2', 'data-contents-sticky': 'true', 'aria-label': 'Style guide' },
            components: '<p class="contents-title">Style guide</p><ol class="contents-list"></ol>',
          },
          {
            type: 'contents-body',
            components: [
              '<header style="padding-bottom:32px;"><h1 style="margin:0;">Style guide</h1><p class="text-muted" style="margin:8px 0 0;">Every preset tag and component in one place. Select a specimen and tune its tag in the Presets tab: everything using that tag follows.</p></header>',
            ].concat(sections),
          },
        ],
      };
    }

    editor.BlockManager.add('styleguide-showcase', {
      label: 'Style Guide (all presets)',
      category: 'Utility',
      media: icons.card,
      content: build(),
    });
  },
});
