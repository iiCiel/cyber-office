import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { OfficeScene } from './scenes/OfficeScene.js';
import { VIEW_W, VIEW_H } from './config.js';

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
  scene: [BootScene, TitleScene, OfficeScene],
});

// Handy for debugging and automated browser tests.
window.__game = game;
