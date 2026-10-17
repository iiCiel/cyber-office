import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { OfficeScene } from './scenes/OfficeScene.js';
import { ReportScene } from './scenes/ReportScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { VIEW_W, VIEW_H } from './config.js';
import { Sound } from './game/sound.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#12121c',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, OfficeScene, ReportScene, MenuScene],
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
