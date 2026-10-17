import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = VIEW_W / 2;

    this.add.text(cx, 200, 'CYBER OFFICE', {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#3fe07a',
    }).setOrigin(0.5);

    this.add.text(cx, 270, 'a day in the life of a junior security analyst', {
      fontFamily: FONT, fontSize: '20px', color: '#9aa3b8',
    }).setOrigin(0.5);

    this.add.text(cx, 360, 'Monday, 8:57 AM.\nFirst day at Halcyon Mutual Insurance.', {
      fontFamily: FONT, fontSize: '22px', color: '#e6e6ea', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);

    const start = this.add.text(cx, 480, '[ press any key or click to start ]', {
      fontFamily: FONT, fontSize: '22px', color: '#e8c547',
    }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    this.add.text(cx, VIEW_H - 60, 'Move: WASD / arrow keys / click   ·   Interact: E or Space', {
      fontFamily: FONT, fontSize: '16px', color: '#6c7590',
    }).setOrigin(0.5);

    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      this.cameras.main.fadeOut(250, 18, 18, 28);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office'));
    };
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
  }
}
