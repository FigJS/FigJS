// Audio player. Sources are per language (data-src-<lang>) through the
// i18n-text trait, and Browse writes the key of the language the canvas
// shows.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-audio-player',
  plugin: function (editor) {
    const {
      registerDependency,
      registerPresetSchemas,
      registerComponentSettings,
      registerComponentPreset,
      icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/audio-player.css');
    registerDependency('js',  '/assets/js/media-settings.js');
    registerDependency('js',  '/assets/js/audio-player.js');

    const SVG_PLAY  = `<svg class="ap-icon-play"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
    const SVG_PAUSE = `<svg class="ap-icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
    const SVG_VOL   = `<svg class="ap-icon-vol"  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06a6.5 6.5 0 010 13.42v2.06a8.5 8.5 0 000-17.54z"/></svg>`;
    const SVG_MUTE  = `<svg class="ap-icon-mute" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><path d="M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.5-2.5-1.41-1.41L18 10.59l-2.59-2.5L14 9.5 16.59 12 14 14.5l1.41 1.41L18 13.41l2.59 2.5L22 14.5 19.41 12z"/></svg>`;

    registerComponentSettings('audio-player', {
      title: 'Audio player',
      properties: [
        // Panel
        { key: '--ap-bg',          label: 'Panel bg',        type: 'color-alpha', default: 'rgba(22, 22, 22, 1)' },
        { key: '--ap-border',      label: 'Border',          type: 'color-alpha', default: 'rgba(42, 42, 42, 1)' },
        { key: '--ap-fg',          label: 'Text',            type: 'color',       default: '#ffffff' },
        { key: '--ap-muted',       label: 'Muted text',      type: 'color',       default: '#8a8a8a' },
        { key: '--ap-radius',      label: 'Corner radius',   type: 'length',
          default: '12px', min: 0, max: 64, step: 1,
          units: ['px', 'em', 'rem', '%'] },
        { key: '--ap-pad',         label: 'Padding',         type: 'spacing',     default: '16px 18px' },
        { key: '--ap-gap',         label: 'Internal gap',    type: 'range',
          min: 4, max: 32, step: 2, unit: 'px', default: 12 },
        { key: '--ap-shadow',      label: 'Shadow',          type: 'shadow',
          default: '0 4px 16px rgba(0, 0, 0, 0.35)' },

        // Accent and controls
        { key: '--ap-accent',      label: 'Accent',          type: 'color',       default: '#007acc' },
        { key: '--ap-accent-fg',   label: 'Accent text',     type: 'color',       default: '#ffffff' },
        { key: '--ap-track',       label: 'Track',           type: 'color-alpha', default: 'rgba(255, 255, 255, 0.12)' },
        { key: '--ap-thumb',       label: 'Thumb',           type: 'color',       default: '#ffffff' },
        { key: '--ap-btn-size',    label: 'Play btn size',   type: 'length',
          default: '40px', min: 16, max: 96, step: 2, units: ['px'] },
        { key: '--ap-btn-radius',  label: 'Play btn radius', type: 'length',
          default: '50%', min: 0, max: 100, step: 1, units: ['%', 'px'] },
        { key: '--ap-seek-height', label: 'Seek height',     type: 'length',
          default: '6px', min: 1, max: 24, step: 1, units: ['px'] },
        { key: '--ap-thumb-size',  label: 'Thumb size',      type: 'length',
          default: '14px', min: 4, max: 32, step: 1, units: ['px'] },
        { key: '--ap-vol-width',   label: 'Volume width',    type: 'length',
          default: '80px', min: 0, max: 240, step: 4, units: ['px'] },

        // Typography
        { key: '--ap-title-size',  label: 'Title size',      type: 'range',
          min: 0.7, max: 1.6, step: 0.05, unit: 'rem', default: 1 },
        { key: '--ap-meta-size',   label: 'Meta size',       type: 'range',
          min: 0.6, max: 1.2, step: 0.02, unit: 'rem', default: 0.78 },
        { key: '--ap-time-size',   label: 'Time size',       type: 'range',
          min: 0.6, max: 1.1, step: 0.02, unit: 'rem', default: 0.75 },
      ],
    });

    function pickAsset(ed, callback) {
      ed.AssetManager.open({
        accept: 'audio/*',
        select: (asset, complete) => {
          const url = typeof asset === 'string' ? asset : asset.get('src');
          callback(url);
          if (complete) ed.AssetManager.close();
        },
      });
    }

    function sourceKeyFor() {
      const lang = (window.FigJS && window.FigJS.i18n && window.FigJS.i18n.getCurrentLang)
        ? window.FigJS.i18n.getCurrentLang()
        : null;
      const defaultLang = (window.PresetRegistry && window.PresetRegistry.getDefaultLang)
        ? window.PresetRegistry.getDefaultLang()
        : 'en';
      if (!lang || lang === defaultLang) return 'data-src';
      return 'data-src-' + lang;
    }

    // Children are ordinary components; the runtime (audio-player.js) adds
    // the control bar as a sibling outside the model, so it is never saved.
    const BASE_CHILDREN = `
      <div class="audio-player-body">
        <div class="audio-player-info">
          <div class="audio-player-title">Track title</div>
          <div class="audio-player-meta">Artist &middot; Year</div>
        </div>
      </div>
    `;

    registerComponentPreset(editor, {
      id: 'audio-player',
      label: 'Audio Player',
      category: 'Media',
      media: icons.audio,
      classes: ['audio-player'],

      // Drops land between the info block and the control bar.
      droppable: true,

      defaultAttributes: {
        'data-src': '',
      },

      defaultComponents: BASE_CHILDREN,

      traits: [
        { type: 'i18n-text', name: 'data-src', label: 'Audio source',
          placeholder: '/assets/audio/track.mp3 or a URL (per current language)',
          category: 'Source' },
        { type: 'button', name: 'browse', label: 'Browse',
          text: 'Choose', category: 'Source',
          command: function (ed, trait) {
            const comp = trait && (trait.target || (trait.get && trait.get('component')));
            if (!comp) return;
            pickAsset(ed, (url) => comp.addAttributes({ [sourceKeyFor()]: url }));
          },
        },
      ],

      view: {
        init() {
          this.listenTo(this.model, 'change:attributes', this.syncRuntime);
        },

        onRender() {
          // Markup without the body (hand-written) gets the base children.
          if (!this.el.querySelector(':scope > .audio-player-body')) {
            try { this.model.append(BASE_CHILDREN); } catch (e) {}
          }
          this.syncRuntime();
        },

        syncRuntime() {
          const W = this.el && this.el.ownerDocument && this.el.ownerDocument.defaultView;
          const rt = (W && W.AudioPlayer) || window.AudioPlayer;

          if (rt && typeof rt.apply === 'function') {
            this.__cancelRuntimeRetry();
            try { rt.apply(this.el); } catch (e) { console.error(e); }
            return;
          }

          this.__scheduleRuntimeRetry();
        },

        __scheduleRuntimeRetry() {
          if (this.__apRetry) return;
          const started = Date.now();
          const GIVE_UP_AFTER = 15000;
          const self = this;

          const tick = () => {
            self.__apRetry = null;
            if (!self.el || !self.el.isConnected) return;
            const W = self.el.ownerDocument && self.el.ownerDocument.defaultView;
            const rt = (W && W.AudioPlayer) || window.AudioPlayer;
            if (rt && typeof rt.apply === 'function') {
              try { rt.apply(self.el); } catch (e) { console.error(e); }
              return;
            }
            if (Date.now() - started > GIVE_UP_AFTER) return;
            self.__apRetry = setTimeout(tick, 100);
          };
          this.__apRetry = setTimeout(tick, 60);
        },

        __cancelRuntimeRetry() {
          if (this.__apRetry) {
            clearTimeout(this.__apRetry);
            this.__apRetry = null;
          }
        },

        removed() {
          this.__cancelRuntimeRetry();
        },
      },
    });
  },
});