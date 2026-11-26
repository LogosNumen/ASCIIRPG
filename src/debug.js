import GUI from 'lil-gui';
import { GLYPH_PRESETS } from './render/ascii.js';

// Live tuning panel for the ASCII pass, hidden until toggled with G.
export function createDebug(ascii, scene, { onResetSave } = {}) {
  const gui = new GUI({ title: 'ASCII debug  [G]' });
  const p = ascii.params;
  const stats = { fps: 0 };

  gui.add(p, 'enabled').name('ASCII pass');
  gui.add(p, 'cellSize', 3, 24, 1).name('cell size (px)');
  gui.add(p, 'renderScale', 0.25, 1, 0.05).name('3D render scale');
  gui.add(p, 'preset', Object.keys(GLYPH_PRESETS)).name('glyph preset').onChange((v) => {
    p.glyphs = GLYPH_PRESETS[v];
    ascii.setGlyphs(p.glyphs);
    glyphCtrl.updateDisplay();
  });
  const glyphCtrl = gui.add(p, 'glyphs').name('glyph set').onFinishChange((v) => ascii.setGlyphs(v));
  gui.add(p, 'contrast', 0.2, 3, 0.01);
  gui.add(p, 'saturation', 0, 2.5, 0.01).name('colour saturation');
  gui.add(p, 'gamma', 0.25, 2, 0.01).name('brightness curve');
  gui.add(p, 'brightness', -0.5, 0.5, 0.01).name('brightness offset');
  gui.add(p, 'gain', 0.3, 4, 0.01).name('glyph gain');
  gui.add(p, 'bgMix', 0, 0.6, 0.01).name('background bleed');
  gui.add(p, 'detail', 0, 1.5, 0.01).name('highlight detail');
  gui.add(p, 'jitter', 0, 0.3, 0.005).name('glyph shimmer');
  gui.add(p, 'exposure', 0.2, 4, 0.01);
  gui.add(p, 'glow', 0, 1.5, 0.01);
  if (scene.fog) gui.add(scene.fog, 'density', 0, 0.05, 0.0005).name('fog density');
  gui.add(stats, 'fps').listen().disable();
  if (onResetSave) gui.add({ reset: onResetSave }, 'reset').name('reset save + reload');
  gui.hide();

  let open = false, frames = 0, acc = 0;
  return {
    get open() { return open; },
    toggle() { open = !open; gui.show(open); },
    tick(dt) {
      frames++;
      acc += dt;
      if (acc >= 0.5) { stats.fps = Math.round(frames / acc); frames = 0; acc = 0; }
    },
  };
}
