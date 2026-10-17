import { VIEW_W, VIEW_H, FONT } from '../config.js';
import { h } from './dom.js';
import './screen.css';

// Base class for full-screen "you are looking at a monitor" views.
// The bezel is drawn in Phaser (pixel art); what's on the screen is real HTML, positioned over the
// canvas and scaled to match, so text is crisp and inputs, scrolling and hovering just work.
// While open: the player can't move, Phaser stops eating keys (so you can type), Esc goes back.
export class Overlay {
  constructor(scene, { bezel = 0x1b1b2a, name = 'screen' } = {}) {
    this.scene = scene;
    this.isOpen = false;
    this.c = scene.add.container(0, 0).setDepth(200).setVisible(false);
    scene.ui(this.c);

    this.sx = 76;
    this.sy = 52;
    this.sw = VIEW_W - 152;
    this.sh = VIEW_H - 150;
    const dim = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05050a, 0.7).setOrigin(0).setInteractive();
    const frame = scene.add.rectangle(this.sx - 16, this.sy - 16, this.sw + 32, this.sh + 32, bezel).setOrigin(0);
    const stand = scene.add.rectangle(VIEW_W / 2 - 60, this.sy + this.sh + 16, 120, 30, bezel).setOrigin(0);
    const foot = scene.add.rectangle(VIEW_W / 2 - 120, this.sy + this.sh + 44, 240, 12, bezel).setOrigin(0);
    const led = scene.add.rectangle(this.sx + this.sw - 4, this.sy + this.sh + 6, 6, 4, 0x3fe07a);
    const close = scene.add
      .text(this.sx + this.sw + 10, 14, 'Stand up  [Esc] ✕', { fontFamily: FONT, fontSize: '16px', color: '#9aa3b8' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p, _x, _y, e) => {
        e?.stopPropagation();
        this.close();
      });
    this.c.add([dim, frame, stand, foot, led, close]);

    // The HTML screen.
    this.root = h('div', { class: 'screen', id: `screen-${name}`, role: 'dialog', 'aria-label': name });
    this.root.style.width = `${this.sw}px`;
    this.root.style.height = `${this.sh}px`;
    document.body.append(this.root);
    this.layout = () => {
      const r = scene.game.canvas.getBoundingClientRect();
      const k = r.width / VIEW_W;
      this.root.style.left = `${r.left + this.sx * k}px`;
      this.root.style.top = `${r.top + this.sy * k}px`;
      this.root.style.transform = `scale(${k})`;
    };
    window.addEventListener('resize', this.layout);
    scene.scale.on('resize', this.layout);

    this.onKey = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.back();
      } else {
        this.onKeyDown?.(e);
      }
    };
    document.addEventListener('keydown', this.onKey);

    scene.events.once('shutdown', () => this.destroy());
  }

  open(onClose) {
    this.onClose = onClose;
    this.isOpen = true;
    this.c.setVisible(true);
    this.layout();
    this.root.classList.add('open');
    // Let the HTML have the keyboard: stop Phaser from handling or swallowing keys.
    const kb = this.scene.input.keyboard;
    kb.resetKeys();
    kb.enabled = false;
    kb.disableGlobalCapture();
    this.onOpen?.();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.c.setVisible(false);
    this.root.classList.remove('open');
    const kb = this.scene.input.keyboard;
    kb.enabled = true;
    kb.enableGlobalCapture();
    kb.resetKeys();
    document.activeElement?.blur?.();
    this.onCloseInternal?.();
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  // Esc: subclasses close an inner window first.
  back() {
    this.close();
  }

  destroy() {
    window.removeEventListener('resize', this.layout);
    this.scene.scale.off('resize', this.layout);
    document.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
