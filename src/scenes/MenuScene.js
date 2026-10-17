import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { h, clear } from '../ui/dom.js';
import { GLOSSARY } from '../data/glossary.js';

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
    const ph = this.showHelp ? 420 : 480;
    this.panel.add(this.add.rectangle(0, 0, 520, ph, 0x12121c, 0.96).setStrokeStyle(2, 0x3fe07a));
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
    add(60, 'Security glossary', () => this.openGlossary());
    add(110, 'Restart this day', () => this.restartDay());
    add(160, 'Quit to title', () => this.quit(), '#ff8a8a');
    add(210, '[ Esc or P to resume ]', () => this.resume(), '#6c7590');
    this.refreshMute();
  }

  toggleMute() {
    this.sound2?.toggleMute();
    this.refreshMute();
  }

  refreshMute() {
    if (this.muteItem) this.muteItem.setText(this.sound2?.muted ? '🔇 Sound: off' : '🔊 Sound: on');
  }

  openGlossary() {
    if (!this.glossaryEl) {
      this.glossaryEl = h(
        'div',
        { class: 'glossary', id: 'glossary' },
        h(
          'div',
          { class: 'wrap' },
          h('div', { class: 'back' }, h('button', { type: 'button', 'data-action': 'glossary-back', onclick: () => this.closeGlossary() }, '< Back to menu')),
          h('h1', {}, 'Security glossary'),
          h('p', { class: 'sub' }, 'Every term this week teaches, in plain words. The code is the CompTIA Security+ (SY0-701) objective.'),
          GLOSSARY.map((g) => h('div', { class: 'g' }, h('span', { class: 'sp' }, `SY0-701 ${g.secplus}`), h('b', {}, g.term), h('p', {}, g.short))),
        ),
      );
      document.body.append(this.glossaryEl);
      this.layoutGlossary = () => {
        const r = this.game.canvas.getBoundingClientRect();
        const k = r.width / VIEW_W;
        this.glossaryEl.style.left = `${r.left}px`;
        this.glossaryEl.style.top = `${r.top}px`;
        this.glossaryEl.style.width = `${VIEW_W}px`;
        this.glossaryEl.style.height = `${VIEW_H}px`;
        this.glossaryEl.style.transform = `scale(${k})`;
      };
      window.addEventListener('resize', this.layoutGlossary);
      this.events.once('shutdown', () => {
        window.removeEventListener('resize', this.layoutGlossary);
        this.glossaryEl?.remove();
      });
    }
    this.layoutGlossary();
    this.glossaryEl.classList.add('open');
    this.glossaryEl.scrollTop = 0;
  }

  closeGlossary() {
    this.sound2?.play('back');
    this.glossaryEl?.classList.remove('open');
  }

  resume() {
    if (this.glossaryEl?.classList.contains('open')) return this.closeGlossary();
    this.sound2?.play('back');
    this.glossaryEl?.remove();
    this.glossaryEl = null;
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
