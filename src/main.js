import Phaser from 'phaser';
import '@fontsource/vt323/latin-400.css';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { OfficeScene } from './scenes/OfficeScene.js';
import { ReportScene } from './scenes/ReportScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { CaseFilesScene } from './scenes/CaseFilesScene.js';
import { measureView, fitCamera, UI_SCALE, VIEW_W, VIEW_H, BASE_W, BASE_H } from './config.js';
import { Sound } from './game/sound.js';

// Text is rasterised once at its own resolution, then zoomed by the camera. Draw it at UI_SCALE so
// one text pixel is one screen pixel: sharp at any window size instead of a stretched 960x720 image.
const textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
  return textFactory.call(this, x, y, text, { resolution: UI_SCALE, ...(style || {}) });
};

// Full resolution: the canvas is the window size in device pixels, shown at 1/DPR so it fills the
// window exactly. Cameras then zoom the 960x720 layout up to that size (see fitCamera).
const first = measureView();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: first.w,
  height: first.h,
  backgroundColor: '#12121c',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / first.dpr },
  scene: [BootScene, TitleScene, OfficeScene, ReportScene, MenuScene, CaseFilesScene],
});

// Every scene's cameras follow the view. A scene can take over with fitView() (the office has a
// zoomed world camera) and react to a size change with onViewResize() (re-lay out its HUD).
const fit = (scene) => (scene.fitView ? scene.fitView() : fitCamera(scene.cameras.main, { center: scene.centered !== false }));
game.events.once('ready', () => {
  for (const scene of game.scene.scenes) scene.events.on('create', () => fit(scene));
});

let resizeTimer = null;
function applyResize() {
  const { w, h, dpr } = measureView();
  if (w === game.scale.width && h === game.scale.height && Math.abs(game.scale.zoom - 1 / dpr) < 1e-6) return;
  game.scale.setZoom(1 / dpr);
  game.scale.resize(w, h);
  for (const scene of game.scene.scenes) {
    const sys = scene.sys;
    if (!sys.isActive() && !sys.isPaused()) continue;
    fit(scene);
    scene.onViewResize?.();
  }
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 120);
});

// One shared sound engine; scenes read game.registry for it.
const sound = new Sound();
game.registry.set('sound', sound);
// Audio needs a user gesture to start.
const unlock = () => sound.resume();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Handy for debugging and automated browser tests.
window.__game = game;
window.__sound = sound;
// Logical layout point -> page (CSS) pixel. center: the 960x720 box is centred (title, menus).
window.__uiToPage = (x, y, { center = false } = {}) => {
  const r = game.canvas.getBoundingClientRect();
  const k = r.width / VIEW_W;
  const ox = center ? (VIEW_W - BASE_W) / 2 : 0;
  const oy = center ? (VIEW_H - BASE_H) / 2 : 0;
  return { x: r.left + (x + ox) * k, y: r.top + (y + oy) * k };
};
