# FigJS

A local static HTML editor built upon GrapesJS, running in the browser,
extended to provide deeper presets and UX for visual construction of webpages.

## Getting started

- **Windows:** double-click **Start FigJS**.
- **macOS / Linux:** `sh start-figjs.sh`
- **With Node.js 18+:** `npm start` (editor and preview) or `npm run preview`.

The launchers fetch a private, checksum-verified Node.js into `.runtime/` when
none is installed. Editor on port 8081, preview on 3000; **Site settings** can
share the preview with phones on the same network.

## Features

- **Clean output:** plain HTML, CSS and JavaScript in `public/`, no build step,
  nothing editor-specific in the published files.
- **Preset tags:** layout, pinning, responsive visibility, entrance and scroll
  motion, parallax, glass and effects, text wrapping and selection; settings
  stay in sync with the GrapesJS Style Manager.
- **Components:** accordions, carousels (one slide per swipe), marquees,
  floating panels, subpages with their own `#address`, gallery viewer, image
  zoom, video and audio players, video backgrounds, sharing buttons.
- **Library:** linked elements that update on every page at once.
- **Themes and languages:** light/dark overrides, per-language text, Markdown
  in text blocks.
- **Media:** uploads deduplicated; replacing or deleting a file updates every
  page that uses it; unused files can be cleared.
- **Preview** renders the page as visitors see it.
- **Games:** WebAssembly (eg. Godot) builds under `public/games/` or third party (Itch.io), with
  the cross-origin isolation threaded builds need.

## Layout

```
public/    the website: pages, assets, games, host rules (_headers, _redirects)
drafts/    unpublished pages        library/   linked elements
editor/    FigJS itself             site.json  site settings
```

`editor.config.json` and `.runtime/` are local and stay out of version control.

## Deploying

Publish `public/` as-is: on Cloudflare Pages, no build command and `public` as
the output directory; Netlify reads the same `_headers` and `_redirects`.
