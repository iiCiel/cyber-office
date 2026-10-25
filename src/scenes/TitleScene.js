import Phaser from 'phaser';
import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { GameState } from '../game/GameState.js';
import { getDay, LAST_DAY } from '../days/index.js';
import { getDifficulty, cycleDifficulty } from '../game/difficulty.js';
import { CASES } from '../cases/index.js';

// Title screen: the office floor before the shift starts, a plain game menu on the left, and the week
// written on the team whiteboard on the right. Palette is the office at 8:57 AM, not a hacker movie.
const C = {
  dusk: 0x0e1822, // overlay over the office floor
  paper: '#f3eee2', // wordmark and menu text
  teal: '#2f7480', // Halcyon Mutual's brand colour: the wordmark's hard shadow
  soft: '#c3cdd2', // secondary text
  dim: '#aab6bd', // hints (4.5:1 on the overlay)
  amber: '#f2c14e', // the selected menu item, like a lanyard
  board: 0xe9eef0, // whiteboard surface
  frame: 0xa7b1b8, // aluminium frame
  blue: '#1f4fa0', // marker colours on the whiteboard
  red: '#b8322a',
  green: '#22744a',
  ink: '#33424c',
};
const MAP_ZOOM = 2;
const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    this.cameras.main.setBackgroundColor('#0e1822');
    // One guard for every way out of this screen (menu, day picker, Case Files), reset on each visit:
    // Phaser reuses the scene object, so a flag left true would block the picker after "Quit to title".
    this.leaving = false;

    this.buildOffice();

    const save = GameState.savedSummary();
    const day = save ? getDay(save.day) : getDay(1);
    const x = 64;

    // Wordmark: VT323 with a hard teal offset shadow (no glow).
    this.add.text(x + 5, 69, 'CYBER OFFICE', { fontFamily: FONT, fontSize: '84px', color: C.teal }).setOrigin(0, 0);
    this.add.text(x, 64, 'CYBER OFFICE', { fontFamily: FONT, fontSize: '84px', color: C.paper }).setOrigin(0, 0);
    this.add.text(x + 2, 152, 'Five days on the security desk at\nHalcyon Mutual Insurance.', { fontFamily: FONT, fontSize: '26px', color: C.soft, lineSpacing: 2 });

    const status = save
      ? save.dayOver ? `${day.date.name} is done. Day ${day.n} of ${LAST_DAY}.` : `You stopped on ${day.date.name}, day ${day.n} of ${LAST_DAY}.`
      : 'Monday, 8:57 AM. Your badge is waiting at reception.';
    this.add.text(x + 2, 226, status, { fontFamily: FONT, fontSize: '22px', color: C.dim, wordWrap: { width: 470 } });

    // The menu: arrows or hover move the cursor, Enter/click picks. Letter keys still work as shortcuts.
    const items = [];
    if (save) {
      items.push({ label: `Continue ${day.date.name}`, key: 'C', run: () => this.go(true) });
      items.push({ label: 'Start a new week', key: 'N', run: () => this.go(false) });
    } else {
      items.push({ label: 'Start Monday', key: 'Enter', run: () => this.go(false) });
    }
    const fresh = CASES.find((c) => c.caseFile.fresh);
    items.push({ label: 'Case Files', key: 'F', sub: fresh ? `New: ${fresh.caseFile.company}, ${fresh.caseFile.when}` : `${CASES.length} real breaches and labs`, name: 'cases-button', run: () => this.toCases() });
    items.push({ label: '', key: 'D', name: 'title-difficulty', difficulty: true, run: () => this.cycle() });
    this.buildMenu(x, 290, items);

    this.buildBoard(590, 92, save || { day: 1, dayOver: false, history: [] });

    // Footer: controls on the left, the repo on the right.
    this.add.text(x, VIEW_H - 50, 'Move: WASD, arrows or click.  Use: E or Space.  Pause: P.', { fontFamily: FONT, fontSize: '19px', color: C.dim });
    this.add.text(x, VIEW_H - 28, 'A playable Security+ scenario, built in public.', { fontFamily: FONT, fontSize: '17px', color: C.dim });
    const gh = this.add
      .text(VIEW_W - 40, VIEW_H - 28, 'github.com/iiCiel/cyber-office', { fontFamily: FONT, fontSize: '17px', color: C.dim })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => gh.setColor(C.paper))
      .on('pointerout', () => gh.setColor(C.dim))
      .on('pointerdown', () => window.open('https://github.com/iiCiel/cyber-office', '_blank', 'noopener'));

    this.input.keyboard.on('keydown', (e) => {
      const k = e.key;
      const n = Number(k);
      if (n >= 1 && n <= LAST_DAY) return this.jumpTo(n);
      if (k === 'ArrowDown' || k === 's' || k === 'S') return this.select(this.sel + 1);
      if (k === 'ArrowUp' || k === 'w' || k === 'W') return this.select(this.sel - 1);
      if (k === 'Enter' || k === ' ') return this.items[this.sel].run();
      if (k === 'f' || k === 'F') return this.toCases();
      if (k === 'd' || k === 'D') return this.cycle();
      if (save && (k === 'c' || k === 'C')) return this.go(true);
      if (save && (k === 'n' || k === 'N')) return this.go(false);
    });

    // The one bit of motion: the office lights come on as the screen opens.
    if (!calm()) {
      this.shade.setAlpha(0.95);
      this.tweens.chain({
        targets: this.shade,
        tweens: [
          { alpha: 0.86, duration: 90, delay: 250 },
          { alpha: 0.95, duration: 60 },
          { alpha: 0.8, duration: 380, ease: 'Sine.out' },
        ],
      });
    }
  }

  // The real office map (same tiles and props as the game), drawn at 2x and dimmed.
  buildOffice() {
    const map = this.make.tilemap({ key: 'office' });
    const ts = map.addTilesetImage('office', 'tiles');
    const ox = Math.round((VIEW_W - map.widthInPixels * MAP_ZOOM) / 2);
    const oy = Math.round((VIEW_H - map.heightInPixels * MAP_ZOOM) / 2);
    for (const name of ['floor', 'walls']) map.createLayer(name, ts, ox, oy)?.setScale(MAP_ZOOM);
    const props = (o) => Object.fromEntries((o.properties || []).map((p) => [p.name, p.value]));
    for (const o of map.getObjectLayer('objects')?.objects || []) {
      const p = props(o);
      const at = (img) => img.setOrigin(0.5, 1).setScale(MAP_ZOOM).setPosition(ox + o.x * MAP_ZOOM, oy + o.y * MAP_ZOOM);
      if (o.type === 'prop' && p.tex && this.textures.exists(p.tex)) at(this.add.image(0, 0, p.tex));
      else if (o.type === 'npc' && p.sprite && this.textures.exists(p.sprite)) at(this.add.sprite(0, 0, p.sprite, `${p.face === 'up' ? 'up' : 'down'}-idle`));
    }
    this.shade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, C.dusk, 0.8).setOrigin(0);
    // Darker towards the left so the menu reads cleanly over the floor plan (a soft step gradient, no seam).
    for (let i = 0; i < 12; i++) this.add.rectangle(0, 0, 600 - i * 40, VIEW_H, C.dusk, 0.07).setOrigin(0);
  }

  buildMenu(x, y, items) {
    this.items = items;
    this.sel = 0;
    const rowH = 62;
    items.forEach((it, i) => {
      const top = y + i * rowH;
      it.cursor = this.add.text(x - 2, top, '>', { fontFamily: FONT, fontSize: '34px', color: C.amber });
      it.text = this.add.text(x + 26, top, it.label, { fontFamily: FONT, fontSize: '34px', color: C.paper });
      if (it.name) it.text.setName(it.name);
      it.hint = this.add.text(470, top + 8, it.key, { fontFamily: FONT, fontSize: '20px', color: C.dim }).setOrigin(1, 0);
      it.subText = this.add.text(x + 28, top + 34, it.sub || '', { fontFamily: FONT, fontSize: '19px', color: C.dim });
      const hit = this.add.rectangle(x - 10, top - 4, 420, rowH - 6, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.select(i)).on('pointerdown', () => { this.select(i); it.run(); });
      // The label itself is clickable too (tests and screen readers aim at the text).
      it.text.setInteractive({ useHandCursor: true }).on('pointerover', () => this.select(i)).on('pointerdown', () => { this.select(i); it.run(); });
    });
    this.refreshDifficulty();
    this.select(0);
  }

  select(i) {
    const n = this.items.length;
    this.sel = ((i % n) + n) % n;
    this.items.forEach((it, j) => {
      const on = j === this.sel;
      it.cursor.setVisible(on);
      it.text.setColor(on ? C.amber : C.paper);
    });
  }

  refreshDifficulty() {
    const d = getDifficulty();
    const it = this.items.find((x) => x.difficulty);
    it.text.setText(`Difficulty: ${d.label}`);
    it.subText.setText(d.blurb);
  }

  cycle() {
    this.game.registry.get('sound')?.play('click');
    cycleDifficulty();
    this.refreshDifficulty();
  }

  go(resume) {
    if (this.leaving) return;
    this.leaving = true;
    const s = this.game.registry.get('sound');
    s?.resume();
    s?.play('select');
    this.cameras.main.fadeOut(250, 14, 24, 34);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office', { resume }));
  }

  toCases() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.registry.get('sound')?.play('select');
    this.scene.start('CaseFiles');
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
    this.cameras.main.fadeOut(250, 14, 24, 34);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Office', { resume: true }));
  }

  // The week, written on the team whiteboard: one row per day, a grade circled in red once it's done,
  // and a yellow magnet on today. Click a row (or press 1-5) to jump to that day.
  buildBoard(x, y, save) {
    const w = 320;
    const rowH = 72;
    const h = 96 + LAST_DAY * rowH;
    const byDay = Object.fromEntries((save.history || []).map((d) => [d.day, d]));
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(x + 6, y + 8, w, h); // shadow on the wall
    g.fillStyle(C.frame, 1).fillRect(x - 6, y - 6, w + 12, h + 12);
    g.fillStyle(C.board, 1).fillRect(x, y, w, h);
    g.fillStyle(0x8f9aa1, 1).fillRect(x + 40, y + h + 6, w - 80, 7); // marker tray
    g.fillStyle(0x1f4fa0, 1).fillRect(x + 60, y + h + 2, 26, 5);
    g.fillStyle(0xb8322a, 1).fillRect(x + 94, y + h + 2, 26, 5);

    this.add.text(x + 22, y + 16, 'SOC rota, this week', { fontFamily: FONT, fontSize: '30px', color: C.blue });
    this.add.text(x + 22, y + 50, 'Click a day or press 1-5 to jump in.', { fontFamily: FONT, fontSize: '18px', color: C.ink });
    g.lineStyle(2, 0x1f4fa0, 0.5).lineBetween(x + 20, y + 80, x + w - 20, y + 80);

    for (let d = 1; d <= LAST_DAY; d++) {
      const top = y + 90 + (d - 1) * rowH;
      const info = getDay(d);
      const done = byDay[d];
      const today = d === save.day && !save.dayOver;
      const label = this.add.text(x + 52, top + 6, info.date.name, { fontFamily: FONT, fontSize: '28px', color: C.blue });
      this.add.text(x + 52, top + 34, info.title.split(' · ')[1] || '', { fontFamily: FONT, fontSize: '20px', color: C.ink });
      if (today) g.fillStyle(0xf2c14e, 1).fillRect(x + 20, top + 14, 18, 18).lineStyle(2, 0x9a7a20, 1).strokeRect(x + 20, top + 14, 18, 18);
      if (done) {
        const gx = x + w - 46;
        const gy = top + 30;
        this.add.text(gx, gy, done.grade, { fontFamily: FONT, fontSize: '34px', color: C.red }).setOrigin(0.5);
        g.lineStyle(2, 0xb8322a, 0.9).strokeEllipse(gx, gy + 1, 46, 40);
        g.lineStyle(3, 0x22744a, 1).lineBetween(x + 20, top + 24, x + 27, top + 31).lineBetween(x + 27, top + 31, x + 38, top + 14);
      }
      if (d < LAST_DAY) g.lineStyle(1, 0x9fb0bb, 0.6).lineBetween(x + 20, top + rowH - 4, x + w - 20, top + rowH - 4);
      const hit = this.add.rectangle(x, top, w, rowH - 4, 0x1f4fa0, 0).setOrigin(0).setInteractive({ useHandCursor: true }).setName(`day-${d}`);
      hit.on('pointerover', () => { hit.setFillStyle(0x1f4fa0, 0.08); label.setColor(C.red); })
        .on('pointerout', () => { hit.setFillStyle(0x1f4fa0, 0); label.setColor(C.blue); })
        .on('pointerdown', () => this.jumpTo(d));
    }
  }
}
