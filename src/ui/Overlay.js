import { VIEW_W, VIEW_H, FONT } from '../config.js';

// Base class for full-screen "you are looking at a monitor" views. Drawn on the UI camera.
// While one is open the player can't move. Esc (or the X button) closes it.
export class Overlay {
  constructor(scene, { title, bezel = 0x1b1b2a, screen = 0x1d4f5c }) {
    this.scene = scene;
    this.isOpen = false;
    this.c = scene.add.container(0, 0).setDepth(200).setVisible(false);
    scene.ui(this.c);

    // Dim the office behind the monitor and swallow clicks so they don't walk the player.
    const dim = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05050a, 0.7).setOrigin(0).setInteractive();
    this.sx = 76;
    this.sy = 52;
    this.sw = VIEW_W - 152;
    this.sh = VIEW_H - 150;
    const frame = scene.add.rectangle(this.sx - 16, this.sy - 16, this.sw + 32, this.sh + 32, bezel).setOrigin(0);
    const stand = scene.add.rectangle(VIEW_W / 2 - 60, this.sy + this.sh + 16, 120, 30, bezel).setOrigin(0);
    const foot = scene.add.rectangle(VIEW_W / 2 - 120, this.sy + this.sh + 44, 240, 12, bezel).setOrigin(0);
    const glass = scene.add.rectangle(this.sx, this.sy, this.sw, this.sh, screen).setOrigin(0);
    const led = scene.add.rectangle(this.sx + this.sw - 4, this.sy + this.sh + 6, 6, 4, 0x3fe07a);
    this.c.add([dim, frame, stand, foot, glass, led]);

    const close = this.text(this.sx + this.sw + 10, 14, 'Stand up  [Esc] ✕', { fontSize: '16px', color: '#9aa3b8' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p, _x, _y, e) => {
        e?.stopPropagation();
        this.close();
      });
    close.name = 'close-button';
    this.title = title;
  }

  text(x, y, str, style = {}) {
    const t = this.scene.add.text(x, y, str, { fontFamily: FONT, fontSize: '18px', color: '#e6e6ea', ...style });
    this.c.add(t);
    return t;
  }

  rect(x, y, w, h, color, alpha = 1) {
    const r = this.scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0);
    this.c.add(r);
    return r;
  }

  open(onClose) {
    this.onClose = onClose;
    this.isOpen = true;
    this.c.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.c, alpha: 1, duration: 150 });
    this.onOpen?.();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.c.setVisible(false);
    this.onCloseInternal?.();
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  // Esc: subclasses may close an inner window first. Return true if handled.
  back() {
    this.close();
  }
}
