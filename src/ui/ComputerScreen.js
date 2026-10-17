import { Overlay } from './Overlay.js';
import { FONT } from '../config.js';

// Your workstation: a tiny desktop with app icons. Apps are placeholders until M3 (Mail) and later.
const APPS = [
  {
    id: 'mail',
    label: 'Mail',
    glyph: '✉',
    title: 'Mail - analyst01@halcyonmutual.com',
    body: () => [
      'Inbox (0)',
      '',
      'Your mailbox is still syncing from the server.',
      'IT says it should be ready "any minute now".',
      '',
      '(The mail client is the next update.)',
    ],
  },
  {
    id: 'notes',
    label: 'welcome.txt',
    glyph: '≡',
    title: 'welcome.txt - Notepad',
    body: (scene) => [
      'Welcome to Halcyon Mutual!',
      '',
      'Day 1 checklist:',
      ...scene.objectiveList().map((o) => `  [${o.done ? 'x' : ' '}] ${o.text}`),
      '',
      'Tip: never click a link before you hover it.',
    ],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    glyph: '>_',
    title: 'Terminal',
    body: () => [
      'analyst01@HALCYON-WS-0142:~$ _',
      '',
      'Access pending approval (ticket #4471).',
      'Coming in a later update: whois, nslookup, grep.',
    ],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    glyph: '#',
    title: 'Helpdesk Tickets',
    body: () => ['No tickets assigned to you yet.', '', 'Enjoy it. It will not last.'],
  },
];

export class ComputerScreen extends Overlay {
  constructor(scene) {
    super(scene, { title: 'Workstation', screen: 0x1d4f5c });
    const { sx, sy, sw, sh } = this;

    this.text(sx + sw / 2, sy + sh / 2 - 30, 'HALCYON MUTUAL', { fontSize: '48px', color: '#2a6676', fontStyle: 'bold' }).setOrigin(0.5);
    this.text(sx + sw / 2, sy + sh / 2 + 16, 'Protecting what matters', { fontSize: '18px', color: '#2a6676' }).setOrigin(0.5);

    APPS.forEach((app, i) => {
      const x = sx + 30;
      const y = sy + 24 + i * 100;
      const tile = this.rect(x, y, 64, 64, 0x12121c, 0.6).setInteractive({ useHandCursor: true });
      tile.name = `app-${app.id}`;
      this.text(x + 32, y + 32, app.glyph, { fontSize: '30px', color: '#e8c547' }).setOrigin(0.5);
      this.text(x + 32, y + 70, app.label, { fontSize: '14px', color: '#f4f1e8' }).setOrigin(0.5, 0);
      tile.on('pointerover', () => tile.setFillStyle(0x3fa7ff, 0.5));
      tile.on('pointerout', () => tile.setFillStyle(0x12121c, 0.6));
      tile.on('pointerdown', () => this.openApp(app));
    });

    // Taskbar
    this.rect(sx, sy + sh - 34, sw, 34, 0x12121c, 0.95);
    this.text(sx + 12, sy + sh - 27, '⊞ Start', { fontSize: '16px', color: '#9aa3b8' });
    this.text(sx + 120, sy + sh - 27, '1-4 open apps', { fontSize: '14px', color: '#6c7590' });
    this.clock = this.text(sx + sw - 12, sy + sh - 27, '', { fontSize: '16px', color: '#e6e6ea' }).setOrigin(1, 0);
    this.text(sx + sw - 120, sy + sh - 27, 'analyst01', { fontSize: '16px', color: '#3fe07a' }).setOrigin(1, 0);

    // App window (one at a time)
    const wx = sx + 170;
    const wy = sy + 50;
    this.win = this.scene.add.container(0, 0).setVisible(false);
    this.c.add(this.win);
    const ww = sw - 240;
    const wh = sh - 140;
    const wbg = this.scene.add.rectangle(wx, wy, ww, wh, 0xf4f1e8).setOrigin(0).setStrokeStyle(2, 0x12121c);
    const bar = this.scene.add.rectangle(wx, wy, ww, 32, 0x2b3f5c).setOrigin(0);
    this.winTitle = this.scene.add.text(wx + 12, wy + 7, '', { fontFamily: FONT, fontSize: '16px', color: '#f4f1e8' });
    const x = this.scene.add.text(wx + ww - 12, wy + 6, '✕', { fontSize: '18px', color: '#f4f1e8' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.win.setVisible(false));
    this.winBody = this.scene.add.text(wx + 20, wy + 50, '', {
      fontFamily: FONT, fontSize: '18px', color: '#1b1b2a', lineSpacing: 6,
    });
    this.win.add([wbg, bar, this.winTitle, x, this.winBody]);

    this.keyHandler = (e) => {
      if (!this.isOpen) return;
      const n = Number(e.key);
      if (n >= 1 && n <= APPS.length) this.openApp(APPS[n - 1]);
    };
    scene.input.keyboard.on('keydown', this.keyHandler);
  }

  openApp(app) {
    this.openedApp = app.id;
    this.winTitle.setText(app.title);
    this.winBody.setText(app.body(this.scene).join('\n'));
    this.win.setVisible(true);
  }

  onOpen() {
    this.win.setVisible(false);
    this.clock.setText(this.scene.clockString());
  }

  back() {
    if (this.win.visible) this.win.setVisible(false);
    else this.close();
  }
}
