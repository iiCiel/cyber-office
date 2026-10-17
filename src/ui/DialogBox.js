import { VIEW_W, VIEW_H, FONT } from '../config.js';

// Bottom-of-screen dialog with a typewriter effect. One short line per page.
// ask() adds numbered choices after the last line (click them, or press 1-4).
export class DialogBox {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;

    const w = VIEW_W - 80;
    const h = 130;
    const x = 40;
    const y = VIEW_H - h - 24;

    this.container = scene.add.container(0, 0).setDepth(100).setVisible(false);
    const bg = scene.add.rectangle(x, y, w, h, 0x12121c, 0.94).setOrigin(0).setStrokeStyle(3, 0xe6e6ea);
    this.nameText = scene.add.text(x + 20, y + 14, '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e8c547',
    });
    this.bodyText = scene.add.text(x + 20, y + 46, '', {
      fontFamily: FONT, fontSize: '22px', color: '#f4f1e8', wordWrap: { width: w - 40 }, lineSpacing: 6,
    });
    this.hint = scene.add.text(x + w - 16, y + h - 12, 'E ▸', {
      fontFamily: FONT, fontSize: '16px', color: '#9aa3b8',
    }).setOrigin(1, 1);
    scene.tweens.add({ targets: this.hint, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });

    this.container.add([bg, this.nameText, this.bodyText, this.hint]);
    this.boxX = x;
    this.boxY = y;
    this.boxW = w;

    // Choices sit just above the box (or below it, when the box is at the top of the screen).
    this.choiceBox = scene.add.container(0, 0).setDepth(101).setVisible(false);
    this.choiceItems = [];
    scene.input.keyboard.on('keydown', (e) => {
      if (!this.choosing) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.choices.length) this.pick(n - 1);
    });
  }

  ask(name, lines, choices, onPick) {
    this.open(name, lines, null);
    this.choices = choices;
    this.onPick = onPick;
  }

  open(name, lines, onClose) {
    this.choices = null;
    this.choosing = false;
    this.choiceBox.setVisible(false);
    this.lines = lines;
    this.index = 0;
    this.onClose = onClose;
    this.isOpen = true;
    this.nameText.setText(name);
    // If the player is in the bottom part of the screen, show the box at the top so it doesn't cover them.
    const pl = this.scene.player;
    const low = pl && this.scene.toScreen && this.scene.toScreen(pl.x, pl.y).y > VIEW_H - 200;
    this.atTop = low;
    this.container.setY(low ? 96 - (VIEW_H - 154) : 0);
    this.container.setVisible(true);
    this.showLine();
  }

  showLine() {
    const full = this.lines[this.index];
    this.full = full;
    this.typing = true;
    this.bodyText.setText('');
    this.typer?.remove();
    let i = 0;
    this.typer = this.scene.time.addEvent({
      delay: 22,
      repeat: full.length - 1,
      callback: () => {
        i++;
        this.bodyText.setText(full.slice(0, i));
        // A soft blip every few characters, skipping spaces, like old-school text boxes.
        if (full[i - 1] && full[i - 1] !== ' ' && i % 3 === 0) this.scene.sound?.play('blip');
        if (i >= full.length) this.finishLine();
      },
    });
  }

  finishLine() {
    this.typing = false;
    if (this.choices && this.index === this.lines.length - 1) this.showChoices();
  }

  showChoices() {
    if (this.choosing) return;
    this.scene.sound?.play('blip');
    this.choosing = true;
    this.hint.setVisible(false);
    for (const t of this.choiceItems) {
      if (this.scene.uiLayer) this.scene.uiLayer = this.scene.uiLayer.filter((o) => o !== t);
      t.destroy();
    }
    this.choiceItems = this.choices.map((c, i) => {
      const t = this.scene.add
        .text(0, 0, `${i + 1}. ${c.text}`, {
          fontFamily: FONT, fontSize: '19px', color: '#f4f1e8', backgroundColor: '#2b3f5c',
          padding: { x: 14, y: 8 }, wordWrap: { width: this.boxW - 60 },
        })
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => t.setBackgroundColor('#3f7fff'))
        .on('pointerout', () => t.setBackgroundColor('#2b3f5c'))
        .on('pointerdown', (_p, _x, _y, e) => {
          e?.stopPropagation();
          this.pick(i);
        });
      t.setData('choice', i);
      this.scene.ui?.(t); // keep it off the zoomed world camera (rendering and hit-testing)
      return t;
    });
    // Stack them; measure heights after creation.
    const gap = 8;
    const total = this.choiceItems.reduce((sum, t) => sum + t.height + gap, 0);
    const boxTop = this.boxY + this.container.y;
    const boxBottom = boxTop + 130;
    let y = this.atTop ? boxBottom + 10 : boxTop - total - 2;
    for (const t of this.choiceItems) {
      t.setPosition(this.boxX + 20, y);
      y += t.height + gap;
    }
    this.choiceBox.removeAll(false);
    this.choiceBox.add(this.choiceItems).setVisible(true);
  }

  pick(i) {
    if (!this.choosing) return;
    this.scene.sound?.play('select');
    const choice = this.choices[i];
    this.choosing = false;
    this.choices = null;
    this.choiceBox.setVisible(false);
    this.hint.setVisible(true);
    const cb = this.onPick;
    this.onPick = null;
    this.isOpen = false;
    this.container.setVisible(false);
    cb?.(choice, i);
  }

  advance() {
    if (!this.isOpen) return;
    if (this.typing) {
      // First press finishes the line instantly.
      this.typer?.remove();
      this.bodyText.setText(this.full);
      this.finishLine();
      return;
    }
    if (this.choosing) return; // waiting for a choice
    this.index++;
    if (this.index < this.lines.length) {
      this.showLine();
      return;
    }
    this.close();
  }

  close() {
    this.isOpen = false;
    this.container.setVisible(false);
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
