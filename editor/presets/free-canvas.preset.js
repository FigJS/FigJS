// Free canvas (.free-canvas): children placed anywhere, in percent, so
// the arrangement scales with the box. Children use GrapesJS's absolute
// drag mode; a drag writes --fx / --fy as one undo step. The child's
// Placement block sets X, Y, width, rotation, scale and layer.

window.PresetPlugins = window.PresetPlugins || [];
window.PresetPlugins.push({
  id: 'preset-free-canvas',
  plugin: function (editor) {
    const {
      registerComponentSettings, registerComponentPreset, registerChildSettings,
      registerDependency, icons,
    } = window.PresetRegistry;

    registerDependency('css', '/assets/css/presets.css');

    const CLS = 'free-canvas';
    const opt = (ids) => ids.map((x) => ({ id: x[0], name: x[1] }));

    registerComponentSettings(CLS, {
      title: 'Free canvas',
      description: 'Children stay where you put them, in percent of this box, so the arrangement scales with it.',
      properties: [
        { key: '--fc-aspect', label: 'Shape', type: 'aspect', placeholder: '16:9',
          extra: [{ id: 'auto', name: 'Free height' }] },
        { key: '--fc-height', label: 'Height', type: 'range', min: 40, max: 1600, step: 10, unit: 'px',
          help: 'Only with Shape: Free height.' },
        { key: '--fc-overflow', label: 'Content', type: 'segmented', default: 'visible', options: opt([
          ['visible', 'Overflow'], ['clip', 'Clip to box'] ]) },
        { key: '--fc-font', label: 'Text size', type: 'range', min: 0.5, max: 10, step: 0.1, unit: 'cqw',
          help: 'Percent of the canvas width: text scales with the canvas. Unset: normal text size.' },
      ],
    });

    registerChildSettings(CLS, {
      title: 'Placement',
      properties: [
        { key: '--fx', label: 'X', type: 'range', min: -50, max: 150, step: 0.1, unit: '%', default: 0 },
        { key: '--fy', label: 'Y', type: 'range', min: -50, max: 150, step: 0.1, unit: '%', default: 0 },
        { key: '--fw', label: 'Width', type: 'range', min: 1, max: 100, step: 0.5, unit: '%',
          help: 'Percent of the canvas width. Unset: fits its content.' },
        { key: '--fr', label: 'Rotate', type: 'range', min: -180, max: 180, step: 1, unit: 'deg', default: 0 },
        { key: '--fs', label: 'Scale', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1 },
        { key: '--fz', label: 'Layer', type: 'range', min: 0, max: 50, step: 1, default: 0 },
      ],
    });

    registerComponentPreset(editor, {
      id: CLS,
      name: 'Free canvas',
      label: 'Free Placement',
      category: 'Layout',
      media: icons.free,
      classes: [CLS],
      droppable: true,
      defaultComponents:
        '<h2 style="--fx:8%;--fy:12%">Anywhere</h2>' +
        '<span class="badge" style="--fx:60%;--fy:55%;--fr:-8deg">Placed freely</span>',
      traits: [],
    });

    // ---- Children: absolute drag in percent -----------------------------

    const isFreeChild = (c) => {
      const p = c && c.parent && c.parent();
      return !!(p && p.getClasses().includes(CLS));
    };

    const markChild = (c) => {
      if (!c || !c.set) return;
      const want = isFreeChild(c) ? 'absolute' : '';
      if ((c.get('dmode') || '') !== want) c.set('dmode', want, { silent: true });
    };
    const markTree = (c) => {
      markChild(c);
      if (c && c.components) c.components().forEach(markChild);
    };
    editor.on('component:add', markTree);
    editor.on('component:mount', markChild);
    editor.onReady(() => editor.getWrapper().find('.' + CLS).forEach(markTree));

    // Commands exist once the editor is ready.
    editor.onReady(() => {
      const drag = editor.Commands.get('core:component-drag');
      if (drag) patchDrag(drag);
    });

    function patchDrag(drag) {
      const base = {
        getPosition: drag.getPosition,
        setPosition: drag.setPosition,
        onStart: drag.onStart,
      };

      const canvasEl = (cmd) => {
        const el = cmd.target && cmd.target.getEl();
        return el && el.parentElement;
      };

      drag.getPosition = function () {
        if (!isFreeChild(this.target)) return base.getPosition.call(this);
        const el = this.target.getEl();
        return { x: el.offsetLeft, y: el.offsetTop };
      };

      // The canvas CSS positions children; skip GrapesJS's px pinning.
      drag.onStart = function (event) {
        if (!isFreeChild(this.target)) return base.onStart.call(this, event);
        const o = this.opts || {};
        if (o.onStart) o.onStart.call(o, this._getDragData());
        const ad = FigJS.settingsUI.componentAdapter(this.target);
        this.__freeBaseline = { fx: ad.read('--fx', { raw: true }), fy: ad.read('--fy', { raw: true }) };
        this.guidesStatic = this.getGuidesStatic();
      };

      drag.setPosition = function (data) {
        if (!isFreeChild(this.target)) return base.setPosition.call(this, data);
        const parent = canvasEl(this);
        if (!parent) return;
        const pct = (v, size) => (size ? Math.round((v / size) * 10000) / 100 : 0) + '%';
        const fx = pct(data.x, parent.clientWidth);
        const fy = pct(data.y, parent.clientHeight);
        const ad = FigJS.settingsUI.componentAdapter(this.target);
        if (!data.end) {
          ad.write('--fx', fx, { avoidStore: true });
          ad.write('--fy', fy, { avoidStore: true });
          return;
        }
        // One undo step: back to the baseline untracked, then one write.
        const b = this.__freeBaseline || {};
        FigJS.undo.untracked(() => {
          ad.write('--fx', b.fx || '', { avoidStore: true });
          ad.write('--fy', b.fy || '', { avoidStore: true });
        });
        ad.write('--fx', fx, {});
        ad.write('--fy', fy, {});
        ad.changed();
        if (FigJS.componentSettings) FigJS.componentSettings.render();
      };
    }
  },
});
