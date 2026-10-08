(function () {
  'use strict';

  var rafId = null;
  var sceneSet = new Set();

  function scanScenes() {
    sceneSet.clear();
    var wins = document.querySelectorAll('.viewport-window');
    for (var i = 0; i < wins.length; i++) {
      var scene = wins[i].querySelector(':scope > .viewport-window-scene');
      if (scene) sceneSet.add(scene);
    }
  }

  function transformedAnimatedAncestor(scene) {
    for (var p = scene.parentElement; p && p.nodeType === 1; p = p.parentElement) {
      if (p.getAnimations && p.getAnimations().length) {
        var t = getComputedStyle(p).transform;
        if (t && t !== 'none') return p;
      }
    }
    return null;
  }

  function readAnchor(win) {
    var cs = getComputedStyle(win);
    var ax = parseFloat(cs.getPropertyValue('--vpw-anchor-x'));
    var ay = parseFloat(cs.getPropertyValue('--vpw-anchor-y'));
    if (!isFinite(ax)) ax = 50;
    if (!isFinite(ay)) ay = 50;
    return { x: ax / 100, y: ay / 100 };
  }

  function scaleOf(transform) {
    var m = String(transform || '').match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    var parts = m[1].split(',').map(function (v) { return parseFloat(v); });
    var s = Math.hypot(parts[0] || 0, parts[1] || 0);
    return isFinite(s) && s > 0.001 ? s : 1;
  }

  function correctScene(scene, transformAncestor) {
    var win = scene.parentElement;
    if (!win || !win.classList || !win.classList.contains('viewport-window')) return;

    var anchor = readAnchor(win);
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var desiredCX = vw * anchor.x;
    var desiredCY = vh * anchor.y;

    scene.style.transform = 'translate(-50%, -50%)';
    var rect = scene.getBoundingClientRect();
    var actualCX = rect.left + rect.width / 2;
    var actualCY = rect.top + rect.height / 2;

    var dx = desiredCX - actualCX;
    var dy = desiredCY - actualCY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    var scale = scaleOf(getComputedStyle(transformAncestor).transform);
    dx /= scale;
    dy /= scale;

    scene.style.transform =
      'translate(' + dx.toFixed(2) + 'px, ' + dy.toFixed(2) + 'px) ' +
      'translate(-50%, -50%)';
  }

  function tick() {
    rafId = null;
    var busy = false;
    sceneSet.forEach(function (scene) {
      if (!scene.isConnected) { sceneSet.delete(scene); return; }
      var ancestor = transformedAnimatedAncestor(scene);
      if (ancestor) {
        busy = true;
        correctScene(scene, ancestor);
      } else if (scene.style.transform !== '') {
        scene.style.removeProperty('transform');
      }
    });
    if (busy) rafId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!rafId && sceneSet.size) rafId = requestAnimationFrame(tick);
  }

  function boot() {
    scanScenes();
    kick();
  }

  ['animationstart', 'transitionrun'].forEach(function (type) {
    document.addEventListener(type, kick, true);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', boot);

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(function () { scanScenes(); kick(); }).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  window.ViewportWindow = { refresh: scanScenes };
})();
