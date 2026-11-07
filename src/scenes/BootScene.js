import Phaser from 'phaser';
import { generateTextures } from '../art/textures.js';
import { FONT_NAME } from '../config.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Paths are relative to the page, so they work under /cyber-office/ on GitHub Pages.
    this.load.tilemapTiledJSON('office', 'maps/office.tmj');
    this.load.image('tiles', 'maps/tiles.png');
  }

  create() {
    generateTextures(this);

    for (const who of ['player', 'coworker', 'manager', 'mike', 'theo', 'carla']) {
      for (const dir of ['down', 'up', 'side']) {
        this.anims.create({
          key: `${who}-walk-${dir}`,
          frames: [
            { key: who, frame: `${dir}-walk1` },
            { key: who, frame: `${dir}-idle` },
            { key: who, frame: `${dir}-walk2` },
            { key: who, frame: `${dir}-idle` },
          ],
          frameRate: 9,
          repeat: -1,
        });
      }
    }

    // Phaser rasterises text once, so the pixel font has to be loaded before any text is drawn.
    // If it fails or is slow (offline, old browser), fall back to Courier after 3 seconds.
    const fonts = document.fonts
      ? Promise.all([document.fonts.load(`16px "${FONT_NAME}"`), document.fonts.load(`bold 16px "${FONT_NAME}"`)])
      : Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([fonts, timeout])
      .catch(() => {})
      .then(() => {
        window.__fontReady = !!document.fonts?.check(`16px "${FONT_NAME}"`);
        this.scene.start('Title');
      });
  }
}
