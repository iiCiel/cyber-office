import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { GameState } from '../game/GameState.js';
import { getDay, LAST_DAY } from '../days/index.js';

const GLYPHS = '0123456789ABCDEF<>/\\|=+*#';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = VIEW_W / 2;
    this.cameras.main.setBackgroundColor('#0a0e0c');

    this.buildRain();

    // Logo with a soft green glow (a blurred-ish double behind the sharp text).
    this.add.text(cx, 174, 'CYBER OFFICE', { fontFamily: FONT, fontSize: '82px', fontStyle: 'bold', color: '#1f6f45' }).setOrigin(0.5).setAlpha(0.6);
    const logo = this.add.text(cx, 172, 'CYBER OFFICE', { fontFamily: FONT, fontSize: '82px', fontStyle: 'bold', color: '#3fe07a' }).setOrigin(0.5);
    logo.setShadow(0, 0, '#3fe07a', 18, false, true);
    this.tweens.add({ targets: logo, alpha: { from: 0.86, to: 1 }, duration: 1600, yoyo: true, repeat: -1 });

    this.add.text(cx, 232, 'one week as a junior security analyst', { fontFamily: FONT, fontSize: '25px', color: '#9aa3b8' }).setOrigin(0.5);

    const save = GameState.savedSummary();
    const day = save ? getDay(save.day) : getDay(1);

    // Returning player: show week progress as five labeled nodes.
    if (save) this.buildProgress(cx, 300, save);

    this.add
      .text(cx, save ? 352 : 330, save
        ? `${day.date.name} — day ${day.n} of ${LAST_DAY}${save.dayOver ? ' (finished)' : ''}`
        : 'Monday, 8:57 AM.\nFirst day at Halcyon Mutual Insurance.', {
        fontFamily: FONT, fontSize: '28px', color: '#e6e6ea', align: 'center', lineSpacing: 8,
      })
      .setOrigin(0.5);

    let started = false;
    const go = (resume) => {
      if (started) return;
      started = true;
      const s = this.game.registry.get('sound');
      s?.resume();
      s?.play('select');
      this.cameras.main.fadeOut(250, 10, 14, 12);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office', { resume }));
    };

    const button = (y, label, resume, color = '#e8c547') => {
      const t = this.add
        .text(cx, y, label, { fontFamily: FONT, fontSize: '28px', color, backgroundColor: '#12201a66', padding: { x: 16, y: 8 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setColor('#ffffff'))
        .on('pointerout', () => t.setColor(color))
        .on('pointerdown', () => go(resume));
      return t;
    };

    const toCases = () => {
      if (started) return;
      started = true;
      this.game.registry.get('sound')?.play('select');
      this.scene.start('CaseFiles');
    };
    const casesBtn = (y) => {
      const t = this.add
        .text(cx, y, '📁  Case Files: replay real breaches', { fontFamily: FONT, fontSize: '24px', color: '#8fb6ff', backgroundColor: '#101a2466', padding: { x: 14, y: 6 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setColor('#ffffff'))
        .on('pointerout', () => t.setColor('#8fb6ff'))
        .on('pointerdown', toCases);
      t.setName('cases-button');
      return t;
    };

    if (save) {
      button(420, `▶  Continue: ${day.date.name}`, true, '#3fe07a');
      button(478, 'Start a new week', false);
      casesBtn(540);
      this.input.keyboard.on('keydown', (e) => {
        if (e.key === 'n' || e.key === 'N') go(false);
        else if (e.key === 'f' || e.key === 'F') toCases();
        else if (e.key === 'c' || e.key === 'C' || e.key === 'Enter' || e.key === ' ') go(true);
      });
    } else {
      const start = button(440, '▶  Start your first day', false, '#3fe07a');
      this.tweens.add({ targets: start, alpha: { from: 1, to: 0.55 }, duration: 800, yoyo: true, repeat: -1 });
      casesBtn(510);
      this.input.keyboard.on('keydown', (e) => (e.key === 'f' || e.key === 'F' ? toCases() : go(false)));
    }

    this.add.text(cx, VIEW_H - 76, 'Move: WASD / arrows / click   ·   Use: E / Space   ·   Menu: P', { fontFamily: FONT, fontSize: '19px', color: '#6c7590' }).setOrigin(0.5);
    this.add.text(cx, VIEW_H - 48, 'A playable CompTIA Security+ scenario · built in public', { fontFamily: FONT, fontSize: '16px', color: '#4a5a52' }).setOrigin(0.5);
    const gh = this.add
      .text(cx, VIEW_H - 26, 'github.com/iiCiel/cyber-office', { fontFamily: FONT, fontSize: '16px', color: '#5a7a68' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => gh.setColor('#8fb6ff'))
      .on('pointerout', () => gh.setColor('#5a7a68'))
      .on('pointerdown', () => window.open('https://github.com/iiCiel/cyber-office', '_blank', 'noopener'));
  }

  // Faint "matrix" glyph columns drifting down behind everything.
  buildRain() {
    this.rain = [];
    const cols = 26;
    for (let i = 0; i < cols; i++) {
      const x = 12 + i * ((VIEW_W - 24) / (cols - 1));
      const str = Array.from({ length: 22 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('\n');
      const t = this.add
        .text(x, Math.random() * VIEW_H - VIEW_H, str, { fontFamily: FONT, fontSize: '20px', color: '#1c3a2a', align: 'center' })
        .setOrigin(0.5, 0)
        .setAlpha(0.5 + Math.random() * 0.3);
      t.speed = 14 + Math.random() * 26;
      this.rain.push(t);
    }
  }

  buildProgress(cx, y, save) {
    const byDay = Object.fromEntries((save.history || []).map((d) => [d.day, d]));
    const n = LAST_DAY;
    const gap = 150;
    const startX = cx - ((n - 1) * gap) / 2;
    for (let d = 1; d <= n; d++) {
      const x = startX + (d - 1) * gap;
      const h = byDay[d];
      const done = !!h;
      const current = d === save.day && !save.dayOver;
      const color = done ? 0x3fe07a : current ? 0xe8c547 : 0x2a3a32;
      this.add.circle(x, y, 7, color).setStrokeStyle(2, 0x0a0e0c);
      if (d < n) this.add.rectangle(x + 8, y, gap - 16, 2, 0x2a3a32).setOrigin(0, 0.5);
      this.add.text(x, y + 16, getDay(d).date.weekday, { fontFamily: FONT, fontSize: '15px', color: done ? '#9fd8b4' : current ? '#e8c547' : '#4a5a52' }).setOrigin(0.5, 0);
      if (h) this.add.text(x, y - 22, h.grade, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#3fe07a' }).setOrigin(0.5);
    }
  }

  update(_, delta) {
    for (const t of this.rain || []) {
      t.y += (t.speed * delta) / 1000;
      if (t.y > VIEW_H) {
        t.y = -t.height;
        t.x = 12 + Math.random() * (VIEW_W - 24);
      }
    }
  }
}
