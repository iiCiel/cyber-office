import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { GameState } from '../game/GameState.js';
import { getDay, LAST_DAY } from '../days/index.js';
import { getDifficulty, cycleDifficulty } from '../game/difficulty.js';

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

    // The week as five nodes. Click one to jump straight to that day (your other days are kept).
    this.buildProgress(cx, 300, save || { day: 1, dayOver: false, history: [] });

    this.add
      .text(cx, 372, save
        ? `${day.date.name} — day ${day.n} of ${LAST_DAY}${save.dayOver ? ' (finished)' : ''}`
        : 'Monday, 8:57 AM.\nFirst day at Halcyon Mutual Insurance.', {
        fontFamily: FONT, fontSize: '28px', color: '#e6e6ea', align: 'center', lineSpacing: 8,
      })
      .setOrigin(0.5);

    // One guard for every way out of this screen (Start/Continue/New week and the day picker), reset on each visit:
    // Phaser reuses the scene object, so a flag left true would block the picker after "Quit to title".
    this.leaving = false;
    const go = (resume) => {
      if (this.leaving) return;
      this.leaving = true;
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
      if (this.leaving) return;
      this.leaving = true;
      this.game.registry.get('sound')?.play('select');
      this.scene.start('CaseFiles');
    };
    const casesBtn = (y) => {
      const t = this.add
        .text(cx, y, '📁  Case Files: real breaches + labs (F)', { fontFamily: FONT, fontSize: '24px', color: '#8fb6ff', backgroundColor: '#101a2466', padding: { x: 14, y: 6 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setColor('#ffffff'))
        .on('pointerout', () => t.setColor('#8fb6ff'))
        .on('pointerdown', toCases);
      t.setName('cases-button');
      return t;
    };

    if (save) {
      button(440, `▶  Continue: ${day.date.name}`, true, '#3fe07a');
      button(496, 'Start a new week', false);
      casesBtn(556);
      this.input.keyboard.on('keydown', (e) => {
        if (e.key === 'n' || e.key === 'N') go(false);
        else if (e.key === 'f' || e.key === 'F') toCases();
        else if (e.key === 'c' || e.key === 'C' || e.key === 'Enter' || e.key === ' ') go(true);
      });
    } else {
      const start = button(450, '▶  Start your first day', false, '#3fe07a');
      this.tweens.add({ targets: start, alpha: { from: 1, to: 0.55 }, duration: 800, yoyo: true, repeat: -1 });
      casesBtn(520);
      this.input.keyboard.on('keydown', (e) => (e.key === 'f' || e.key === 'F' ? toCases() : /^[1-9dD]$/.test(e.key) ? null : go(false)));
    }

    this.buildSettings(cx, 600);

    this.add.text(cx, 268, 'click a day to jump to it  ·  1-5 keys', { fontFamily: FONT, fontSize: '16px', color: '#6f9a84' }).setOrigin(0.5);
    this.input.keyboard.on('keydown', (e) => { const n = Number(e.key); if (n >= 1 && n <= LAST_DAY) this.jumpTo(n); });
    this.add.text(cx, VIEW_H - 76, 'Move: WASD / arrows / click   ·   Use: E / Space   ·   Menu: P', { fontFamily: FONT, fontSize: '19px', color: '#8b94b0' }).setOrigin(0.5);
    this.add.text(cx, VIEW_H - 48, 'A playable CompTIA Security+ scenario · built in public', { fontFamily: FONT, fontSize: '16px', color: '#7f9488' }).setOrigin(0.5);
    const gh = this.add
      .text(cx, VIEW_H - 26, 'github.com/iiCiel/cyber-office', { fontFamily: FONT, fontSize: '16px', color: '#78a68c' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => gh.setColor('#8fb6ff'))
      .on('pointerout', () => gh.setColor('#78a68c'))
      .on('pointerdown', () => window.open('https://github.com/iiCiel/cyber-office', '_blank', 'noopener'));
  }

  // Difficulty (D or click) and music on/off, so both are visible before the first day starts.
  buildSettings(cx, y) {
    const sound = this.game.registry.get('sound');
    const style = { fontFamily: FONT, fontSize: '19px', color: '#9aa3b8', backgroundColor: '#12201a66', padding: { x: 10, y: 4 } };
    const link = (t, fn) => t.setInteractive({ useHandCursor: true }).on('pointerover', () => t.setColor('#ffffff')).on('pointerout', () => t.setColor('#9aa3b8')).on('pointerdown', fn);
    const diff = link(this.add.text(cx - 12, y, '', style).setOrigin(1, 0.5).setName('title-difficulty'), () => { sound?.play('click'); cycleDifficulty(); refresh(); });
    const music = link(this.add.text(cx + 12, y, '', style).setOrigin(0, 0.5).setName('title-music'), () => { sound?.resume(); sound?.music?.toggle(); refresh(); });
    const blurb = this.add.text(cx, y + 22, '', { fontFamily: FONT, fontSize: '15px', color: '#78a68c' }).setOrigin(0.5);
    const refresh = () => {
      const d = getDifficulty();
      diff.setText(`◆ Difficulty: ${d.label} (D)`);
      blurb.setText(d.blurb);
      music.setText(sound?.music?.enabled === false ? '♪ Music: off' : '♪ Music: on');
    };
    this.input.keyboard.on('keydown-D', () => { sound?.play('click'); cycleDifficulty(); refresh(); });
    refresh();
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

  // Jump to any day of the week without replaying the ones before it. Earlier days' results and carry-over stay as they are.
  jumpTo(n) {
    if (this.leaving) return;
    this.leaving = true;
    const st = new GameState();
    st.load();
    st.caseId = null;
    st.startDay(n);
    const s = this.game.registry.get('sound');
    s?.resume();
    s?.play('select');
    this.cameras.main.fadeOut(250, 10, 14, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office', { resume: true }));
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
      const dot = this.add.circle(x, y, 7, color).setStrokeStyle(2, 0x0a0e0c);
      const hit = this.add.rectangle(x, y + 8, 120, 56, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setName(`day-${d}`);
      hit.on('pointerover', () => dot.setScale(1.6)).on('pointerout', () => dot.setScale(1)).on('pointerdown', () => this.jumpTo(d));
      if (d < n) this.add.rectangle(x + 8, y, gap - 16, 2, 0x2a3a32).setOrigin(0, 0.5);
      this.add.text(x, y + 16, getDay(d).date.weekday, { fontFamily: FONT, fontSize: '15px', color: done ? '#9fd8b4' : current ? '#e8c547' : '#7f9488' }).setOrigin(0.5, 0);
      this.add.text(x, y + 34, getDay(d).title.split(' · ')[1] || '', { fontFamily: FONT, fontSize: '13px', color: '#6f9a84' }).setOrigin(0.5, 0);
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
