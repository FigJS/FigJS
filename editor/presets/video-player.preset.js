// Video player. Sources and posters are per language
// (data-src-<lang>, data-poster-<lang>); Browse writes the key of the
// language the canvas shows.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-video-player',
  plugin: function (editor) {
    const {
      registerDependency,
      registerPresetSchemas,
      registerComponentSettings,
      registerComponentPreset,
      icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/video-player.css');
    registerDependency('js',  '/assets/js/lang-visibility.js');
    registerDependency('js',  '/assets/js/media-settings.js');
    registerDependency('js',  '/assets/js/video-player.js');

    registerComponentSettings('video-player', {
      title: 'Video player',
      properties: [
        { key: '--vp-aspect', label: 'Aspect', type: 'aspect', placeholder: '16:9' },
        { key: '--vp-max-width',    label: 'Max width',    type: 'text', default: '100%' },
        { key: '--vp-radius',       label: 'Corner radius', type: 'range', min: 0, max: 32, step: 1, unit: 'px', default: 12 },
        { key: '--vp-bg',           label: 'Background',   type: 'color', default: '#000000' },
        { key: '--vp-border-width', label: 'Border width', type: 'range', min: 0, max: 8, step: 1, unit: 'px', default: 0 },
        { key: '--vp-border-color', label: 'Border color', type: 'color-alpha', default: 'rgba(0, 0, 0, 0)' },
        { key: '--vp-shadow',       label: 'Shadow',       type: 'text', default: '0 4px 16px rgba(0, 0, 0, 0.35)' },

        { key: '--vp-accent',       label: 'Control accent',  type: 'color', default: '#007acc' },
        { key: '--vp-track',        label: 'Track',           type: 'color-alpha', default: 'rgba(255, 255, 255, 0.22)' },
        { key: '--vp-thumb',        label: 'Thumb',           type: 'color', default: '#ffffff' },
        { key: '--vp-ctrls-pad',    label: 'Controls padding', type: 'text', default: '10px 14px 12px' },
        { key: '--vp-btn-size',     label: 'Button size',     type: 'range', min: 24, max: 56, step: 2, unit: 'px', default: 34 },
        { key: '--vp-seek-height',  label: 'Seek height',     type: 'range', min: 2, max: 14, step: 1, unit: 'px', default: 5 },
        { key: '--vp-thumb-size',   label: 'Thumb size',      type: 'range', min: 6, max: 24, step: 1, unit: 'px', default: 12 },
      ],
    });

    const FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v|mkv)$/i;

    function detectType(url) {
      if (!url) return null;
      const u = url.trim();
      if (!u) return null;
      if (/youtube\.com\/(?:watch\?|embed\/|shorts\/)/.test(u) || /youtu\.be\//.test(u)) return 'youtube';
      if (/vimeo\.com\//.test(u)) return 'vimeo';
      const clean = u.split('?')[0].split('#')[0];
      if (FILE_RE.test(clean)) return 'file';
      return 'iframe';
    }

    function pickAsset(ed, callback) {
      ed.AssetManager.open({
        accept: 'video/*',
        select: (asset, complete) => {
          const url = typeof asset === 'string' ? asset : asset.get('src');
          callback(url);
          if (complete) ed.AssetManager.close();
        },
      });
    }

    function sourceKeyFor(base) {
      const lang = (window.FigJS && window.FigJS.i18n && window.FigJS.i18n.getCurrentLang)
        ? window.FigJS.i18n.getCurrentLang()
        : null;
      const defaultLang = (window.PresetRegistry && window.PresetRegistry.getDefaultLang)
        ? window.PresetRegistry.getDefaultLang()
        : 'en';
      if (!lang || lang === defaultLang) return base;
      return base + '-' + lang;
    }

    registerComponentPreset(editor, {
      id: 'video-player',
      label: 'Video Player',
      category: 'Media',
      media: icons.video,
      classes: ['video-player'],

      defaultAttributes: {
        'data-src':      '',
        'data-type':     'auto',
        'data-ui':       'custom',
        'data-poster':   '',
        'data-autoplay': '',
        'data-loop':     '',
        'data-muted':    '',
      },

      traits: [
        { type: 'i18n-text', name: 'data-src', label: 'Video source',
          placeholder: 'YouTube or Vimeo URL, .mp4 link, or /assets/video/clip.mp4 (per current language)',
          category: 'Source' },
        { type: 'button', name: 'browse', label: 'Browse',
          text: 'Choose', category: 'Source',
          command: function (ed, trait) {
            const comp = trait && (trait.target || (trait.get && trait.get('component')));
            if (!comp) return;
            pickAsset(ed, (url) => comp.addAttributes({ [sourceKeyFor('data-src')]: url }));
          },
        },
        { type: 'select', name: 'data-type', label: 'Source type', category: 'Source',
          options: [
            { id: 'auto',    name: 'Auto-detect' },
            { id: 'youtube', name: 'YouTube' },
            { id: 'vimeo',   name: 'Vimeo' },
            { id: 'file',    name: 'Direct file (mp4/webm)' },
            { id: 'iframe',  name: 'Raw iframe / other embed' },
          ],
        },

        { type: 'select', name: 'data-ui', label: 'Player UI (file only)', category: 'Playback',
          options: [
            { id: 'native', name: 'Native (browser controls)' },
            { id: 'custom', name: 'Custom (site-styled bar)' },
            { id: 'none',   name: 'None (pure video surface)' },
          ],
        },

        { type: 'checkbox', name: 'data-autoplay', label: 'Autoplay (starts muted, as browsers require)',
          valueTrue: 'true', valueFalse: '', category: 'Playback' },
        { type: 'checkbox', name: 'data-loop', label: 'Loop',
          valueTrue: 'true', valueFalse: '', category: 'Playback' },
        { type: 'checkbox', name: 'data-muted', label: 'Muted',
          valueTrue: 'true', valueFalse: '', category: 'Playback' },

        { type: 'i18n-text', name: 'data-poster', label: 'Poster URL',
          placeholder: 'Preview image (file mode only)',
          category: 'File' },

        { type: 'checkbox', name: 'data-allow-fullscreen', label: 'Allow fullscreen (embeds)',
          valueTrue: 'true', valueFalse: 'false', category: 'Embed' },

        { type: 'text', name: 'data-lang-only', label: 'Visible only in (space-separated codes)',
          placeholder: 'en sr (blank: all)',
          category: 'Language' },
        { type: 'text', name: 'data-lang-hide', label: 'Hidden in (space-separated codes)',
          placeholder: 'e.g.  fr',
          category: 'Language' },
      ],

      view: {
        init() {
          this.listenTo(this.model, 'change:attributes', this.renderStage);
        },

        onRender() {
          this.renderStage();
        },

        renderStage() {
          const W = this.el && this.el.ownerDocument && this.el.ownerDocument.defaultView;
          const rt = (W && W.VideoPlayer) || window.VideoPlayer;

          if (rt && typeof rt.apply === 'function') {
            this.__cancelRuntimeRetry();
            try { rt.apply(this.el); } catch (e) { console.error(e); }
            return;
          }

          this.__showPending();
          this.__scheduleRuntimeRetry();
        },

        __showPending() {
          const el = this.el;
          if (!el) return;
          el.querySelectorAll(':scope > .video-player-stage, :scope > .video-player-empty')
            .forEach((n) => n.remove());
          const empty = el.ownerDocument.createElement('div');
          empty.className = 'video-player-empty';
          empty.setAttribute('data-gjs-selectable', 'false');
          empty.setAttribute('data-gjs-draggable',  'false');
          empty.innerHTML =
            '<div class="vp-empty-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/></svg></div>' +
            '<div>Loading player</div>';
          el.appendChild(empty);
        },

        __scheduleRuntimeRetry() {
          if (this.__vpRetry) return;
          const started = Date.now();
          const GIVE_UP_AFTER = 15000;
          const self = this;

          const tick = () => {
            self.__vpRetry = null;
            if (!self.el || !self.el.isConnected) return;
            const W = self.el.ownerDocument && self.el.ownerDocument.defaultView;
            const rt = (W && W.VideoPlayer) || window.VideoPlayer;
            if (rt && typeof rt.apply === 'function') {
              try { rt.apply(self.el); } catch (e) { console.error(e); }
              return;
            }
            if (Date.now() - started > GIVE_UP_AFTER) return;
            self.__vpRetry = setTimeout(tick, 100);
          };
          this.__vpRetry = setTimeout(tick, 60);
        },

        __cancelRuntimeRetry() {
          if (this.__vpRetry) {
            clearTimeout(this.__vpRetry);
            this.__vpRetry = null;
          }
        },

        removed() {
          this.__cancelRuntimeRetry();
        },
      },
    });
  },
});