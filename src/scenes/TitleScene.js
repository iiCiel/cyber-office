import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { GameState } from '../game/GameState.js';
import { getDay, LAST_DAY } from '../days/index.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = VIEW_W / 2;

    this.add.text(cx, 190, 'CYBER OFFICE', { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#3fe07a' }).setOrigin(0.5);
    this.add.text(cx, 260, 'one week as a junior security analyst', { fontFamily: FONT, fontSize: '20px', color: '#9aa3b8' }).setOrigin(0.5);

    const save = GameState.savedSummary();
    const day = save ? getDay(save.day) : getDay(1);
    this.add
      .text(cx, 350, save ? `${day.date.name} (day ${day.n} of ${LAST_DAY})${save.dayOver ? ', day finished' : ''}.` : 'Monday, 8:57 AM.\nFirst day at Halcyon Mutual Insurance.', {
        fontFamily: FONT, fontSize: '22px', color: '#e6e6ea', align: 'center', lineSpacing: 8,
      })
      .setOrigin(0.5);

    let started = false;
    const go = (resume) => {
      if (started) return;
      started = true;
      this.game.registry.get('sound')?.resume();
      this.game.registry.get('sound')?.play('select');
      this.cameras.main.fadeOut(250, 18, 18, 28);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office', { resume }));
    };

    if (save) {
      const option = (y, label, resume) => {
        const t = this.add
          .text(cx, y, label, { fontFamily: FONT, fontSize: '22px', color: '#e8c547' })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', () => t.setColor('#ffffff'))
          .on('pointerout', () => t.setColor('#e8c547'))
          .on('pointerdown', () => go(resume));
        return t;
      };
      option(442, `[C] Continue: ${day.date.name}`, true);
      option(482, '[N] Start a new week', false);
      this.input.keyboard.on('keydown', (e) => {
        if (e.key === 'n' || e.key === 'N') go(false);
        else if (e.key === 'c' || e.key === 'C' || e.key === 'Enter' || e.key === ' ') go(true);
      });
    } else {
      const start = this.add.text(cx, 470, '[ press any key or click to start ]', { fontFamily: FONT, fontSize: '22px', color: '#e8c547' }).setOrigin(0.5);
      this.tweens.add({ targets: start, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
      this.input.keyboard.once('keydown', () => go(false));
      this.input.once('pointerdown', () => go(false));
    }

    this.add
      .text(cx, VIEW_H - 60, 'Move: WASD / arrow keys / click   ·   Interact: E or Space', { fontFamily: FONT, fontSize: '16px', color: '#6c7590' })
      .setOrigin(0.5);
  }
}
