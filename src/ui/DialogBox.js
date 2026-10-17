import { VIEW_W, VIEW_H, FONT } from '../config.js';

// Bottom-of-screen dialog with a typewriter effect. One short line per page.
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
  }

  open(name, lines, onClose) {
    this.lines = lines;
    this.index = 0;
    this.onClose = onClose;
    this.isOpen = true;
    this.nameText.setText(name);
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
        if (i >= full.length) this.typing = false;
      },
    });
  }

  advance() {
    if (!this.isOpen) return;
    if (this.typing) {
      // First press finishes the line instantly.
      this.typer?.remove();
      this.bodyText.setText(this.full);
      this.typing = false;
      return;
    }
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
