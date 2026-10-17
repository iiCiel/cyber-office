import Phaser from 'phaser';
import { TILE, ZOOM, COLS, ROWS, VIEW_W, VIEW_H, FONT } from '../config.js';
import { MAP, TILE_TEXTURE, SOLID, PROPS, CHAIRS, COWORKER, DOOR, SPAWN } from '../data/officeMap.js';
import { DialogBox } from '../ui/DialogBox.js';

const SPEED = 70; // world px per second
const REACH = 22; // how close (px) you must be to interact

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('Office');
  }

  create() {
    this.worldLayer = [];
    this.uiLayer = [];

    this.buildRoom();
    this.buildProps();
    this.buildPlayer();
    this.buildCameras();
    this.buildHud();
    this.buildInput();

    this.dialog = new DialogBox(this);
    this.ui(this.dialog.container);

    this.cameras.main.fadeIn(300, 18, 18, 28);
    this.time.delayedCall(450, () =>
      this.dialog.open('You', ['First day. Badge works. Coffee in hand.', 'Find your desk. Say hi to someone.']),
    );
  }

  // Track which camera draws what: world objects are zoomed, UI objects are not.
  world(obj) {
    this.worldLayer.push(obj);
    return obj;
  }

  ui(obj) {
    this.uiLayer.push(obj);
    if (this.uiCam) this.cameras.main.ignore(obj);
    return obj;
  }

  buildRoom() {
    this.walls = this.physics.add.staticGroup();
    MAP.forEach((row, ty) => {
      [...row].forEach((ch, tx) => {
        const x = tx * TILE;
        const y = ty * TILE;
        this.world(this.add.image(x, y, TILE_TEXTURE[ch]).setOrigin(0).setDepth(-1000));
        if (SOLID.has(ch)) {
          const wall = this.add.zone(x + TILE / 2, y + TILE / 2, TILE, TILE);
          this.walls.add(wall);
          this.world(wall);
        }
      });
    });
    this.physics.world.setBounds(0, 0, COLS * TILE, ROWS * TILE);
  }

  buildProps() {
    this.interactables = [];
    this.solids = this.physics.add.staticGroup();

    for (const c of CHAIRS) {
      this.world(this.add.image(c.x, c.y, 'chair').setOrigin(0.5, 1).setDepth(c.y - 6));
    }

    for (const p of PROPS) {
      const img = this.world(this.add.image(p.x, p.y, p.tex).setOrigin(0.5, 1).setDepth(p.y));
      const [fw, fh] = p.foot;
      const zone = this.world(this.add.zone(p.x, p.y - fh / 2, fw, fh));
      this.solids.add(zone);
      this.interactables.push({ ...p, sprite: img, px: p.x, py: p.y, halfW: fw / 2 });
    }

    // Coworker
    this.coworker = this.world(
      this.physics.add.staticSprite(COWORKER.x, COWORKER.y, 'coworker', 'down-idle').setOrigin(0.5, 1),
    );
    this.coworker.setDepth(COWORKER.y);
    this.coworker.body.setSize(8, 5).setOffset(2, 11);
    this.tweens.add({ targets: this.coworker, y: COWORKER.y - 1, duration: 900, yoyo: true, repeat: -1 });
    this.interactables.push({
      id: 'coworker', ...COWORKER, sprite: this.coworker, px: COWORKER.x, py: COWORKER.y, halfW: 6, isNpc: true,
    });

    this.interactables.push({ id: 'door', ...DOOR, px: DOOR.x, py: DOOR.y - 8, halfW: 8 });
  }

  buildPlayer() {
    this.player = this.world(this.physics.add.sprite(SPAWN.x, SPAWN.y, 'player', 'up-idle').setOrigin(0.5, 1));
    this.player.body.setSize(8, 5).setOffset(2, 11);
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.coworker);
  }

  buildCameras() {
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.centerOn((COLS * TILE) / 2, (ROWS * TILE) / 2);
    cam.roundPixels = true;

    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    this.uiCam.ignore(this.worldLayer);
    for (const obj of this.uiLayer) cam.ignore(obj);
  }

  // Anything added to the world after cameras exist must be hidden from the UI camera.
  addWorldLate(obj) {
    this.world(obj);
    this.uiCam.ignore(obj);
    return obj;
  }

  buildHud() {
    const panel = this.ui(this.add.rectangle(12, 12, 250, 64, 0x12121c, 0.8).setOrigin(0).setStrokeStyle(2, 0x3fe07a));
    panel.setDepth(10);
    this.clockText = this.ui(this.add.text(24, 20, '', { fontFamily: FONT, fontSize: '20px', color: '#3fe07a' }).setDepth(11));
    this.objectiveText = this.ui(
      this.add.text(24, 48, '', { fontFamily: FONT, fontSize: '15px', color: '#e6e6ea' }).setDepth(11),
    );

    this.minutes = 8 * 60 + 57;
    this.updateClock();
    // One in-game minute every 4 real seconds (the full day will be paced in M6).
    this.time.addEvent({ delay: 4000, loop: true, callback: () => { this.minutes++; this.updateClock(); } });

    this.visited = new Set();
    this.setObjective();

    // Floating "E" prompt above whatever you can interact with.
    this.prompt = this.ui(this.add.container(0, 0).setDepth(20).setVisible(false));
    const bubble = this.add.image(0, 0, 'prompt').setOrigin(0.5, 1).setScale(1.2);
    const key = this.add.text(0, -19, 'E', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#1b1b2a' }).setOrigin(0.5);
    this.prompt.add([bubble, key]);
    this.tweens.add({ targets: this.prompt, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });

    this.nameTag = this.ui(
      this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '14px', color: '#e6e6ea', backgroundColor: '#12121ccc', padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 1).setDepth(20).setVisible(false),
    );
  }

  updateClock() {
    const h24 = Math.floor(this.minutes / 60) % 24;
    const m = String(this.minutes % 60).padStart(2, '0');
    const h12 = ((h24 + 11) % 12) + 1;
    this.clockText.setText(`MON  ${h12}:${m} ${h24 < 12 ? 'AM' : 'PM'}`);
  }

  setObjective() {
    let goal;
    if (!this.visited.has('my-desk')) goal = 'Find your desk';
    else if (!this.visited.has('coworker')) goal = 'Say hi to a coworker';
    else if (!this.visited.has('soc')) goal = 'Find the SOC console';
    else goal = 'Explore. More coming soon!';
    this.objectiveText.setText(`> ${goal}`);
  }

  buildInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ENTER');
    const act = () => (this.dialog.isOpen ? this.dialog.advance() : this.tryInteract());
    this.keys.E.on('down', act);
    this.keys.SPACE.on('down', act);
    this.keys.ENTER.on('down', act);

    // Click / tap: advance dialog, interact with the highlighted thing, or walk to the spot.
    this.moveTarget = null;
    this.input.on('pointerdown', (pointer) => {
      if (this.dialog.isOpen) return this.dialog.advance();
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const near = this.nearest;
      if (near && Phaser.Math.Distance.Between(wp.x, wp.y, near.px, near.py - 8) < 16) return this.tryInteract();
      this.moveTarget = new Phaser.Math.Vector2(wp.x, wp.y);
      this.stuckMs = 0;
      this.lastX = undefined;
    });
  }

  tryInteract() {
    const t = this.nearest;
    if (!t) return;
    this.moveTarget = null;
    this.player.setVelocity(0);
    if (t.isNpc) {
      // Coworker turns to face you.
      const dx = this.player.x - t.px;
      const dy = this.player.y - t.py;
      if (Math.abs(dx) > Math.abs(dy)) this.coworker.setFrame('side-idle').setFlipX(dx < 0);
      else this.coworker.setFrame(dy < 0 ? 'up-idle' : 'down-idle').setFlipX(false);
    }
    this.dialog.open(t.name, t.talk, () => {
      this.visited.add(t.id);
      this.setObjective();
    });
  }

  findNearest() {
    const fx = this.player.x;
    const fy = this.player.y - 2;
    let best = null;
    let bestD = Infinity;
    for (const t of this.interactables) {
      // Distance to the object's footprint edge, so wide desks are easy to reach.
      const dx = Math.max(0, Math.abs(fx - t.px) - t.halfW);
      const dy = Math.max(0, Math.abs(fy - (t.py - 4)) - 6);
      const d = Math.hypot(dx, dy);
      if (d < REACH && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  toScreen(wx, wy) {
    const v = this.cameras.main.worldView;
    return { x: (wx - v.x) * ZOOM, y: (wy - v.y) * ZOOM };
  }

  update() {
    const p = this.player;
    let vx = 0;
    let vy = 0;

    if (!this.dialog.isOpen) {
      const k = this.keys;
      if (k.LEFT.isDown || k.A.isDown) vx -= 1;
      if (k.RIGHT.isDown || k.D.isDown) vx += 1;
      if (k.UP.isDown || k.W.isDown) vy -= 1;
      if (k.DOWN.isDown || k.S.isDown) vy += 1;

      if (vx || vy) {
        this.moveTarget = null;
      } else if (this.moveTarget) {
        const dx = this.moveTarget.x - p.x;
        const dy = this.moveTarget.y - p.y;
        const b = p.body;
        const hit = (side) => b.blocked[side] || b.touching[side];
        vx = dx;
        vy = dy;
        // Bumped into something: slide along it on the free axis instead of pushing into it.
        if ((hit('left') && dx < 0) || (hit('right') && dx > 0)) { vx = 0; vy = Math.sign(dy) || 0; }
        if ((hit('up') && dy < 0) || (hit('down') && dy > 0)) { vy = 0; vx = Math.sign(dx) || 0; }
        // Give up if we've arrived, or haven't made progress for a while (no pathfinding yet: M2).
        this.stuckMs = Math.hypot(p.x - (this.lastX ?? p.x), p.y - (this.lastY ?? p.y)) < 0.3
          ? (this.stuckMs || 0) + this.game.loop.delta : 0;
        this.lastX = p.x;
        this.lastY = p.y;
        if (Math.hypot(dx, dy) < 2 || this.stuckMs > 300 || (!vx && !vy)) {
          this.moveTarget = null;
          this.stuckMs = 0;
          vx = 0;
          vy = 0;
        }
      }
    }

    const len = Math.hypot(vx, vy);
    if (len) {
      p.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);
      if (Math.abs(vx) > Math.abs(vy)) this.facing = vx < 0 ? 'left' : 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
      const dir = this.facing === 'left' || this.facing === 'right' ? 'side' : this.facing;
      p.setFlipX(this.facing === 'left');
      p.anims.play(`player-walk-${dir}`, true);
    } else {
      p.setVelocity(0);
      if (p.anims.isPlaying) {
        p.anims.stop();
        const dir = this.facing === 'left' || this.facing === 'right' ? 'side' : this.facing;
        p.setFrame(`${dir}-idle`);
      }
    }
    p.setDepth(p.y);

    // Interaction prompt
    this.nearest = this.dialog.isOpen ? null : this.findNearest();
    if (this.nearest) {
      const t = this.nearest;
      const top = t.sprite ? t.sprite.getTopCenter().y : t.py - 16;
      const s = this.toScreen(t.px, top);
      this.prompt.setPosition(s.x, s.y - 4).setVisible(true);
      this.nameTag.setText(t.name).setPosition(s.x, s.y - 50).setVisible(true);
    } else {
      this.prompt.setVisible(false);
      this.nameTag.setVisible(false);
    }
  }
}
