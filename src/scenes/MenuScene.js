import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { GameState } from '../game/GameState.js';

// A pause menu, launched on top of a paused Office scene. Works with mouse, touch and keyboard.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  init(data) {
    this.fromKey = data?.from || 'Office';
  }

  create() {
    this.sound2 = this.game.registry.get('sound');
    this.showHelp = false;
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05050a, 0.78).setOrigin(0).setInteractive();
    this.panel = this.add.container(VIEW_W / 2, VIEW_H / 2);
    this.render();

    this.input.keyboard.on('keydown-ESC', () => this.resume());
    this.input.keyboard.on('keydown-P', () => this.resume());
    this.input.keyboard.on('keydown-M', () => this.toggleMute());
  }

  render() {
    this.panel.removeAll(true);
    const h = this.showHelp ? 420 : 400;
    this.panel.add(this.add.rectangle(0, 0, 520, h, 0x12121c, 0.96).setStrokeStyle(2, 0x3fe07a));
    const add = (y, label, fn, color = '#e8c547') => {
      const t = this.add
        .text(0, y, label, { fontFamily: FONT, fontSize: '24px', color })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setColor('#ffffff'))
        .on('pointerout', () => t.setColor(color))
        .on('pointerdown', () => { this.sound2?.play('click'); fn(); });
      this.panel.add(t);
      return t;
    };

    this.panel.add(this.add.text(0, -170, 'PAUSED', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#3fe07a' }).setOrigin(0.5));

    if (this.showHelp) {
      const help = [
        'Move:  WASD / arrows, or click/tap where to go',
        'Use / talk:  E, Space, or click the thing',
        'Choices:  press 1-4, or click',
        'Back / stand up:  Esc',
        '',
        'Read your email, badge into the server room,',
        'investigate the SIEM alert, handle who comes to',
        'your desk, then debrief with Priya. Hover email',
        'links before you click. Never enter your password',
        'into a page you reached from an email.',
      ].join('\n');
      this.panel.add(this.add.text(0, -20, help, { fontFamily: FONT, fontSize: '16px', color: '#e6e6ea', align: 'center', lineSpacing: 5 }).setOrigin(0.5));
      add(150, '< Back', () => { this.showHelp = false; this.render(); });
      return;
    }

    add(-90, 'Resume', () => this.resume(), '#3fe07a');
    this.muteItem = add(-40, '', () => this.toggleMute());
    add(10, 'How to play', () => { this.showHelp = true; this.render(); });
    add(60, 'Restart this day', () => this.restartDay());
    add(110, 'Quit to title', () => this.quit(), '#ff8a8a');
    add(170, '[ Esc or P to resume ]', () => this.resume(), '#6c7590');
    this.refreshMute();
  }

  toggleMute() {
    this.sound2?.toggleMute();
    this.refreshMute();
  }

  refreshMute() {
    if (this.muteItem) this.muteItem.setText(this.sound2?.muted ? '🔇 Sound: off' : '🔊 Sound: on');
  }

  resume() {
    this.sound2?.play('back');
    this.scene.stop();
    this.scene.resume(this.fromKey);
    this.scene.get(this.fromKey)?.onMenuClosed?.();
  }

  restartDay() {
    const office = this.scene.get('Office');
    const day = office?.state?.day || 1;
    office?.state?.startDay(day);
    this.scene.stop();
    this.scene.stop('Office');
    this.scene.start('Office', { resume: true });
  }

  quit() {
    this.scene.stop();
    this.scene.stop('Office');
    this.scene.start('Title');
  }
}
