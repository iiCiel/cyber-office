import Phaser from 'phaser';
import { VIEW_W, VIEW_H, BASE_W, BASE_H, FONT } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { GLOSSARY } from '../data/glossary.js';
import { getDifficulty, cycleDifficulty } from '../game/difficulty.js';

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
    // MenuScene is a persistent singleton; a glossary node from a previous launch (removed on
    // shutdown via Restart/Quit) must not be reused, so start fresh each time.
    this.glossaryEl = null;
    // The camera centres the 960x720 layout; the dim layer covers the whole window around it.
    this.dim = this.add.rectangle(-(VIEW_W - BASE_W) / 2, -(VIEW_H - BASE_H) / 2, VIEW_W, VIEW_H, 0x05050a, 0.78).setOrigin(0).setInteractive();
    this.panel = this.add.container(BASE_W / 2, BASE_H / 2);
    this.render();

    this.input.keyboard.on('keydown-ESC', () => this.resume());
    this.input.keyboard.on('keydown-P', () => this.resume());
    this.input.keyboard.on('keydown-M', () => this.toggleMute());
  }

  // Window resized: lay the menu out again; the glossary, if open, follows the canvas.
  onViewResize() {
    this.dim.setPosition(-(VIEW_W - BASE_W) / 2, -(VIEW_H - BASE_H) / 2).setSize(VIEW_W, VIEW_H);
    this.dim.input?.hitArea.setSize(VIEW_W, VIEW_H);
    if (this.glossaryEl?.classList.contains('open')) return this.layoutGlossary();
    this.render();
  }

  render() {
    this.panel.removeAll(true);
    const ph = this.showHelp ? 420 : 496;
    this.panel.add(this.add.rectangle(0, 0, 520, ph, 0x12121c, 0.96).setStrokeStyle(2, 0x3fe07a));
    const add = (y, label, fn, color = '#e8c547') => {
      const t = this.add
        .text(0, y, label, { fontFamily: FONT, fontSize: '30px', color })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setColor('#ffffff'))
        .on('pointerout', () => t.setColor(color))
        .on('pointerdown', () => { this.sound2?.play('click'); fn(); });
      this.panel.add(t);
      return t;
    };

    this.panel.add(this.add.text(0, this.showHelp ? -170 : -183, 'PAUSED', { fontFamily: FONT, fontSize: '55px', fontStyle: 'bold', color: '#3fe07a' }).setOrigin(0.5));

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
      this.panel.add(this.add.text(0, -20, help, { fontFamily: FONT, fontSize: '20px', color: '#e6e6ea', align: 'center', lineSpacing: 5 }).setOrigin(0.5));
      add(150, '< Back', () => { this.showHelp = false; this.render(); });
      return;
    }

    add(-113, 'Resume', () => this.resume(), '#3fe07a');
    this.muteItem = add(-69, '', () => this.toggleMute());
    this.diffItem = add(-25, '', () => this.toggleDifficulty());
    this.diffItem.setName('menu-difficulty');
    this.diffBlurb = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#9aa3b8' }).setOrigin(0.5);
    this.panel.add(this.diffBlurb);
    add(34, 'How to play', () => { this.showHelp = true; this.render(); });
    add(78, 'Security glossary', () => this.openGlossary());
    const inCase = !!this.scene.get('Office')?.state?.caseId;
    add(122, inCase ? 'Restart this case' : 'Restart this day', () => this.restartDay());
    add(166, inCase ? 'Quit to Case Files' : 'Quit to title', () => this.quit(), '#ff8a8a');
    add(210, '[ Esc or P to resume ]', () => this.resume(), '#8b94b0');
    this.refreshMute();
  }

  toggleMute() {
    this.sound2?.toggleMute();
    this.refreshMute();
  }

  toggleDifficulty() {
    cycleDifficulty();
    this.refreshMute();
  }

  refreshMute() {
    const d = getDifficulty();
    if (this.diffItem) this.diffItem.setText(`◆ Difficulty: ${d.label}`);
    if (this.diffBlurb) this.diffBlurb.setText(d.blurb);
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
      this.layoutGlossary = () => placeOnCanvas(this.glossaryEl, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W });
      window.addEventListener('resize', this.layoutGlossary);
      this.events.once('shutdown', () => {
        window.removeEventListener('resize', this.layoutGlossary);
        this.glossaryEl?.remove();
        this.glossaryEl = null;
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
    this.scene.start('Office', { resume: true, caseMode: !!office?.state?.caseId });
  }

  quit() {
    const inCase = !!this.scene.get('Office')?.state?.caseId;
    this.scene.stop();
    this.scene.stop('Office');
    this.scene.start(inCase ? 'CaseFiles' : 'Title');
  }
}
