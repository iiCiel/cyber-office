import Phaser from 'phaser';
import { generateTextures } from '../art/textures.js';

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

    for (const who of ['player', 'coworker', 'manager']) {
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

    this.scene.start('Title');
  }
}
