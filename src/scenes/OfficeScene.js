import Phaser from 'phaser';
import { ZOOM, VIEW_W, VIEW_H, FONT } from '../config.js';
import { FOOTPRINTS, NPCS, PROPS, DOORS, OBJECTIVES, OBJECTIVES_DONE, GAME_DATE } from '../data/office.js';
import { DialogBox } from '../ui/DialogBox.js';
import { ComputerScreen } from '../ui/ComputerScreen.js';
import { SocScreen } from '../ui/SocScreen.js';
import { NavGrid } from '../world/pathfinding.js';
import { GameState } from '../game/GameState.js';
import { EMAILS } from '../data/day1.js';
import { deliveredEmails } from '../ui/apps/MailApp.js';

const SPEED = 72; // world px per second
const REACH = 22; // how close (px) you must be to interact
const PLAYER_BODY = { halfW: 4, h: 5 };
const DOOR_CLOSE_MS = 3000;

// Tiled stores custom properties as [{name, value}]; turn them into a plain object.
const propsOf = (o) => Object.fromEntries((o.properties || []).map((p) => [p.name, p.value]));

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('Office');
  }

  init(data) {
    this.resume = !!data?.resume;
  }

  create() {
    this.state = new GameState();
    if (this.resume) this.state.load();
    else GameState.clearSave();
    this.worldLayer = [];
    this.uiLayer = [];
    this.uiCam = null;
    this.flags = { serverOpen: false }; // scene-only; everything that matters lives in this.state
    this.path = null;
    this.pending = null;

    this.buildMap();
    this.buildObjects();
    this.buildPlayer();
    this.buildNav();
    this.buildCameras();
    this.buildHud();
    this.buildInput();

    this.dialog = new DialogBox(this);
    this.ui(this.dialog.container);
    this.computer = new ComputerScreen(this);
    this.soc = new SocScreen(this);

    this.cameras.main.fadeIn(300, 18, 18, 28);
    const intro = this.resume
      ? ['Back at it. Your checklist is where you left it.']
      : ['First day. Badge works. Coffee in hand.', 'Priya, your manager, should be in her office. Top left.'];
    this.time.delayedCall(450, () => !this.dialog.isOpen && this.dialog.open('You', intro));
  }

  // ---------- camera bookkeeping: world objects are zoomed, UI objects are not ----------
  world(obj) {
    this.worldLayer.push(obj);
    if (this.uiCam) this.uiCam.ignore(obj);
    return obj;
  }

  ui(obj) {
    this.uiLayer.push(obj);
    if (this.uiCam) this.cameras.main.ignore(obj);
    return obj;
  }

  // ---------- map ----------
  buildMap() {
    const map = (this.map = this.make.tilemap({ key: 'office' }));
    const ts = map.addTilesetImage('office', 'tiles');
    this.world(map.createLayer('floor', ts).setDepth(-1000));
    this.wallsLayer = this.world(map.createLayer('walls', ts).setDepth(-999));
    this.wallsLayer.setCollisionByProperty({ collides: true });
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Remember where the server room door tiles are, so badging in can open/close them.
    this.serverDoorTiles = [];
    this.wallsLayer.forEachTile((t) => {
      if (t.properties?.name === 'server-door') this.serverDoorTiles.push({ x: t.x, y: t.y, index: t.index, props: { ...t.properties } });
    });
  }

  buildObjects() {
    this.interactables = [];
    this.solids = this.physics.add.staticGroup();
    this.solidRects = [];
    this.npcs = {};

    for (const o of this.map.getObjectLayer('objects').objects) {
      const p = propsOf(o);
      if (o.type === 'spawn') {
        this.spawn = { x: o.x, y: o.y };
      } else if (o.type === 'prop') {
        const def = PROPS[o.name] || { name: o.name, talk: ['...'] };
        let sprite = null;
        let halfW = 8;
        if (p.tex) {
          if (p.tex.startsWith('desk')) {
            this.world(this.add.image(o.x, o.y + 12, 'chair').setOrigin(0.5, 1).setDepth(o.y + 6));
          }
          sprite = this.world(this.add.image(o.x, o.y, p.tex).setOrigin(0.5, 1).setDepth(o.y));
          const [fw, fh] = FOOTPRINTS[p.tex] || [sprite.width, 6];
          this.solids.add(this.world(this.add.zone(o.x, o.y - fh / 2, fw, fh)));
          this.solidRects.push({ x: o.x - fw / 2, y: o.y - fh, w: fw, h: fh });
          halfW = fw / 2;
        }
        this.interactables.push({ id: o.name, ...def, sprite, px: o.x, py: o.y, halfW });
      } else if (o.type === 'npc') {
        const def = NPCS[o.name];
        const s = this.world(this.add.sprite(o.x, o.y, p.sprite, 'down-idle').setOrigin(0.5, 1).setDepth(o.y));
        this.solids.add(this.world(this.add.zone(o.x, o.y - 2.5, 8, 5)));
        this.faceSprite(s, p.face || 'down');
        this.tweens.add({ targets: s, scaleY: 0.96, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.npcs[o.name] = s;
        this.solidRects.push({ x: o.x - 4, y: o.y - 5, w: 8, h: 5 });
        this.interactables.push({ id: o.name, ...def, kind: 'npc', sprite: s, px: o.x, py: o.y, halfW: 6 });
      } else if (o.type === 'door') {
        const def = DOORS[o.name];
        this.interactables.push({ id: o.name, ...def, sprite: null, px: o.x, py: o.y - 8, halfW: 8, isDoor: true });
      }
    }
  }

  faceSprite(s, dir) {
    if (dir === 'left' || dir === 'right') s.setFrame('side-idle').setFlipX(dir === 'left');
    else s.setFrame(`${dir}-idle`).setFlipX(false);
  }

  buildPlayer() {
    const { x, y } = this.spawn;
    this.player = this.world(this.physics.add.sprite(x, y, 'player', 'up-idle').setOrigin(0.5, 1));
    this.player.body.setSize(8, 5).setOffset(2, 11);
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';
    this.physics.add.collider(this.player, this.wallsLayer);
    this.physics.add.collider(this.player, this.solids);
  }

  // ---------- pathfinding grid ----------
  buildNav() {
    this.nav = new NavGrid(this.map.widthInPixels, this.map.heightInPixels, 8, PLAYER_BODY);
    this.rebuildNav();
  }

  rebuildNav() {
    const rects = [...this.solidRects];
    this.wallsLayer.forEachTile((t) => {
      if (t.index > 0 && t.collides) rects.push({ x: t.pixelX, y: t.pixelY, w: t.width, h: t.height });
    });
    this.nav.setSolids(rects);
  }

  // ---------- cameras ----------
  buildCameras() {
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.roundPixels = true;

    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    this.uiCam.ignore(this.worldLayer);
    for (const obj of this.uiLayer) cam.ignore(obj);
  }

  // ---------- HUD ----------
  buildHud() {
    this.ui(this.add.rectangle(12, 12, 400, 64, 0x12121c, 0.82).setOrigin(0).setStrokeStyle(2, 0x3fe07a).setDepth(10));
    this.clockText = this.ui(this.add.text(24, 20, '', { fontFamily: FONT, fontSize: '20px', color: '#3fe07a' }).setDepth(11));
    this.stepText = this.ui(
      this.add.text(400, 22, '', { fontFamily: FONT, fontSize: '14px', color: '#6c7590' }).setOrigin(1, 0).setDepth(11),
    );
    this.objectiveText = this.ui(
      this.add.text(24, 48, '', { fontFamily: FONT, fontSize: '15px', color: '#e6e6ea' }).setDepth(11),
    );

    this.minutes = this.state.minutes ?? GAME_DATE.startMinutes;
    this.state.minutes = this.minutes;
    this.updateClock();
    this.knownMail = deliveredEmails(this.minutes).length;
    // One in-game minute every 4 real seconds (the full day gets paced in M6).
    this.time.addEvent({ delay: 4000, loop: true, callback: () => this.tickMinute() });

    // Small notification card (top right) for things that happen while you walk around.
    this.notice = this.ui(
      this.add
        .text(VIEW_W - 16, 16, '', {
          fontFamily: FONT, fontSize: '15px', color: '#f4f1e8', backgroundColor: '#12121cee', padding: { x: 12, y: 8 },
        })
        .setOrigin(1, 0)
        .setDepth(30)
        .setVisible(false),
    );

    const hint = this.ui(
      this.add.text(VIEW_W - 16, VIEW_H - 14, 'Move: WASD / arrows / click   ·   Use: E   ·   Back: Esc', {
        fontFamily: FONT, fontSize: '14px', color: '#9aa3b8', backgroundColor: '#12121caa', padding: { x: 8, y: 4 },
      }).setOrigin(1, 1).setDepth(10),
    );
    this.time.delayedCall(15000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 800 }));

    // Floating "E" prompt above whatever you can use, plus its name.
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

    // Yellow arrow over the current objective (world space, bobs up and down).
    this.marker = this.world(this.add.triangle(0, 0, 0, 0, 8, 0, 4, 5, 0xe8c547).setOrigin(0.5, 1).setDepth(5000));
    this.marker.setStrokeStyle(1, 0x1b1b2a);

    // Little ring where you clicked.
    this.clickRing = this.world(this.add.circle(0, 0, 3).setStrokeStyle(1, 0xe8c547).setDepth(-500).setVisible(false));

    this.updateObjective();
  }

  tickMinute() {
    this.minutes++;
    this.state.minutes = this.minutes;
    this.updateClock();
    const delivered = deliveredEmails(this.minutes);
    if (delivered.length > this.knownMail) {
      const newest = delivered[delivered.length - 1];
      this.knownMail = delivered.length;
      if (!this.computer.isOpen) this.notify(`✉ New email from ${newest.from.name}`);
      this.onStateChanged();
    }
    this.state.save();
  }

  notify(text) {
    this.notice.setText(text).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.notice);
    this.tweens.add({ targets: this.notice, alpha: 0, delay: 4500, duration: 600, onComplete: () => this.notice.setVisible(false) });
  }

  isDone(id) {
    return this.state.visited.includes(id);
  }

  // Called by the computer apps whenever the player does something (read, report, ...).
  onStateChanged() {
    if (!this.isDone('inbox') && this.isDone('my-desk') && this.inboxProgress().done) this.complete('inbox');
    this.updateObjective();
  }

  inboxProgress() {
    const read = EMAILS.filter((e) => this.state.mail[e.id]?.read).length;
    return { read, total: EMAILS.length, done: read === EMAILS.length };
  }

  clockString() {
    const h24 = Math.floor(this.minutes / 60) % 24;
    const m = String(this.minutes % 60).padStart(2, '0');
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  updateClock() {
    this.clockText.setText(`${GAME_DATE.weekday}  ${this.clockString()}`);
  }

  objectiveList() {
    return OBJECTIVES.map((o) => ({ ...o, done: this.isDone(o.id) }));
  }

  currentObjective() {
    return OBJECTIVES.find((o) => !this.isDone(o.id)) || null;
  }

  updateObjective() {
    const cur = this.currentObjective();
    const done = OBJECTIVES.filter((o) => this.isDone(o.id)).length;
    let text = cur ? cur.text : OBJECTIVES_DONE;
    if (cur?.id === 'inbox') {
      const p = this.inboxProgress();
      text += ` (${p.read}/${p.total} read)`;
    }
    this.objectiveText.setText(`> ${text}`);
    this.stepText.setText(cur ? `${done + 1}/${OBJECTIVES.length}` : 'done');
    const targetId = cur ? cur.target || cur.id : null;
    this.markerTarget = targetId ? this.interactables.find((t) => t.id === targetId) : null;
  }

  complete(id) {
    if (this.isDone(id)) return;
    this.state.visited.push(id);
    this.state.log('objective', { id });
    this.updateObjective();
  }

  // ---------- input ----------
  buildInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ENTER,ESC');
    const act = () => {
      if (this.overlayOpen()) return;
      if (this.dialog.isOpen) this.dialog.advance();
      else this.tryInteract();
    };
    this.keys.E.on('down', act);
    this.keys.SPACE.on('down', act);
    this.keys.ENTER.on('down', act);
    this.keys.ESC.on('down', () => {
      const o = this.activeOverlay();
      if (o) o.back();
    });

    this.input.on('pointerdown', (pointer, over) => {
      // Clicks on UI buttons (or while sitting down / looking at a screen) never walk the player.
      if (this.overlayOpen() || this.seated || over.length) return;
      if (this.dialog.isOpen) return this.dialog.advance();
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const hit = this.interactableAt(wp.x, wp.y);
      if (hit) {
        if (hit === this.nearest) return this.tryInteract();
        this.walkTo(...this.approachPoint(hit), hit);
      } else {
        this.walkTo(wp.x, wp.y, null);
      }
    });
  }

  activeOverlay() {
    return [this.computer, this.soc].find((o) => o?.isOpen) || null;
  }

  overlayOpen() {
    return !!this.activeOverlay();
  }

  busy() {
    return this.dialog.isOpen || this.overlayOpen();
  }

  interactableAt(x, y) {
    for (const t of this.interactables) {
      if (t.sprite) {
        const b = t.sprite.getBounds();
        if (b.contains(x, y)) return t;
      } else if (Math.abs(x - t.px) < 10 && Math.abs(y - (t.py - 6)) < 12) {
        return t;
      }
    }
    return null;
  }

  approachPoint(t) {
    if (t.isDoor && t.id === 'server-door') {
      // Stand on whichever side of the door you're on.
      return [this.player.x < t.px ? t.px - 12 : t.px + 14, t.py + 6];
    }
    if (t.kind === 'npc') return [t.px + (this.player.x < t.px ? -12 : 12), t.py];
    return [t.px, t.py + 9];
  }

  walkTo(x, y, target) {
    const path = this.nav.findPath(this.player.x, this.player.y, x, y);
    this.pending = target;
    this.stuckMs = 0;
    this.repathed = false;
    if (!path) {
      this.path = null;
      // Probably behind the closed server room door: walk to the door instead and badge in.
      const door = this.interactables.find((t) => t.id === 'server-door');
      const otherSide = x > door.px !== this.player.x > door.px;
      if (!this.flags.serverOpen && door && target !== door && otherSide) this.walkTo(...this.approachPoint(door), door);
      return;
    }
    this.path = path;
    const end = path[path.length - 1];
    this.clickRing.setPosition(end.x, end.y - 1).setVisible(true).setScale(1).setAlpha(1);
    this.tweens.add({ targets: this.clickRing, scale: 2, alpha: 0, duration: 450, onComplete: () => this.clickRing.setVisible(false) });
  }

  // ---------- interactions ----------
  tryInteract() {
    const t = this.nearest;
    if (!t) return;
    this.path = null;
    this.pending = null;
    this.player.setVelocity(0);

    if (t.kind === 'npc') {
      const dx = this.player.x - t.px;
      const dy = this.player.y - t.py;
      this.faceSprite(t.sprite, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
      const lines = this.isDone(t.id) && t.again ? t.again : t.talk;
      this.dialog.open(t.name, lines, () => {
        if (t.id === 'priya') this.state.flags.badgeActive = true;
        this.complete(t.id);
      });
      return;
    }

    if (t.kind === 'badge') return this.useBadge(t);
    if (t.kind === 'desk') return this.sitAt(t, this.computer);
    if (t.kind === 'soc') return this.sitAt(t, this.soc);

    const lines = this.isDone(t.id) && t.again ? t.again : t.talk;
    this.dialog.open(t.name, lines, () => this.complete(t.id));
  }

  sitAt(t, overlay) {
    // Slide into the chair, face the screen, then show it.
    const seat = { x: t.px, y: t.py + 10 };
    this.seated = true;
    this.path = null;
    this.pending = null;
    this.tweens.add({
      targets: this.player,
      x: seat.x,
      y: seat.y,
      duration: 160,
      onComplete: () => {
        this.facing = 'up';
        this.player.anims.stop();
        this.player.setFrame('up-idle').setFlipX(false);
        this.complete(t.id);
        overlay.open(() => {
          this.seated = false;
          this.onStateChanged();
        });
      },
    });
  }

  useBadge(t) {
    if (!this.state.flags.badgeActive) {
      this.flashDoorLight(0xff4f4f);
      this.dialog.open(t.name, t.locked);
      return;
    }
    if (this.flags.serverOpen) {
      this.dialog.open(t.name, ['The door is already open. It closes by itself behind you.']);
      return;
    }
    this.flashDoorLight(0x3fe07a);
    this.setServerDoor(true);
    this.dialog.open(t.name, t.opened, () => this.complete(t.id));
  }

  flashDoorLight(color) {
    const d = this.serverDoorTiles[0];
    if (!d) return;
    const light = this.world(this.add.rectangle(d.x * 16 + 11, d.y * 16 + 4, 3, 2, color).setDepth(6000));
    this.tweens.add({ targets: light, alpha: 0, duration: 250, yoyo: true, repeat: 2, onComplete: () => light.destroy() });
  }

  setServerDoor(open) {
    this.flags.serverOpen = open;
    for (const d of this.serverDoorTiles) {
      if (open) {
        this.wallsLayer.removeTileAt(d.x, d.y);
      } else {
        // putTileAt doesn't copy the tileset's properties, so restore them and the collision by hand.
        const tile = this.wallsLayer.putTileAt(d.index, d.x, d.y);
        tile.properties = { ...d.props };
        tile.setCollision(true, true, true, true);
      }
    }
    this.doorClearMs = 0;
    this.rebuildNav();
  }

  // Doors close behind you (no propping the server room open). Only closes once the doorway is clear.
  updateDoor(delta) {
    if (!this.flags.serverOpen || !this.serverDoorTiles.length) return;
    const d = this.serverDoorTiles;
    const left = d[0].x * 16 - 6;
    const right = d[0].x * 16 + 22;
    const top = Math.min(...d.map((t) => t.y)) * 16 - 2;
    const bottom = (Math.max(...d.map((t) => t.y)) + 1) * 16 + 6;
    const p = this.player;
    const inDoorway = p.x > left && p.x < right && p.y > top && p.y < bottom;
    this.doorClearMs = inDoorway || this.busy() ? 0 : this.doorClearMs + delta;
    if (this.doorClearMs > DOOR_CLOSE_MS) this.setServerDoor(false);
  }

  findNearest() {
    const fx = this.player.x;
    const fy = this.player.y - 2;
    let best = null;
    let bestD = Infinity;
    for (const t of this.interactables) {
      // Distance to the object's footprint edge, so wide things are easy to reach.
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

  topOf(t) {
    return t.sprite ? t.sprite.getTopCenter().y : t.py - 14;
  }

  // ---------- frame loop ----------
  update(_, delta) {
    const p = this.player;
    let vx = 0;
    let vy = 0;

    if (!this.busy() && !this.seated) {
      const k = this.keys;
      if (k.LEFT.isDown || k.A.isDown) vx -= 1;
      if (k.RIGHT.isDown || k.D.isDown) vx += 1;
      if (k.UP.isDown || k.W.isDown) vy -= 1;
      if (k.DOWN.isDown || k.S.isDown) vy += 1;

      if (vx || vy) {
        this.path = null;
        this.pending = null;
      } else if (this.path) {
        [vx, vy] = this.followPath(delta);
      }
    }

    const len = Math.hypot(vx, vy);
    if (len && !this.seated) {
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

    this.updateDoor(delta);

    // Interaction prompt
    this.nearest = this.busy() || this.seated ? null : this.findNearest();
    if (this.nearest) {
      const t = this.nearest;
      const s = this.toScreen(t.px, this.topOf(t));
      this.prompt.setPosition(s.x, s.y - 4).setVisible(true);
      this.nameTag.setText(t.name).setPosition(s.x, s.y - 50).setVisible(true);
    } else {
      this.prompt.setVisible(false);
      this.nameTag.setVisible(false);
    }

    // Objective marker (hidden while the E prompt is already on that thing)
    const mt = this.markerTarget;
    if (mt && mt !== this.nearest && !this.busy()) {
      const bob = Math.sin(this.time.now / 250) * 1.5;
      this.marker.setPosition(mt.px, this.topOf(mt) - 3 + bob).setVisible(true);
    } else {
      this.marker.setVisible(false);
    }
  }

  // Walk along the current path. Returns the desired velocity direction.
  followPath(delta) {
    const p = this.player;
    // A waypoint counts as reached within one frame's worth of movement, so low frame rates can't overshoot forever.
    const reach = Math.max(1.5, (SPEED * delta) / 1000);
    while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].y - p.y) <= reach) this.path.shift();
    if (!this.path.length) {
      this.path = null;
      const t = this.pending;
      this.pending = null;
      if (t && this.findNearest() === t) this.tryInteract();
      return [0, 0];
    }
    const moved = Math.hypot(p.x - (this.lastX ?? p.x + 1), p.y - (this.lastY ?? p.y + 1));
    this.lastX = p.x;
    this.lastY = p.y;
    this.stuckMs = moved < 0.2 ? this.stuckMs + delta : 0;
    if (this.stuckMs > 350) {
      // Bumped into something the grid didn't know about: try once more, then give up.
      const end = this.path[this.path.length - 1];
      if (!this.repathed) {
        this.repathed = true;
        this.stuckMs = 0;
        this.path = this.nav.findPath(p.x, p.y, end.x, end.y);
        if (!this.path) return [0, 0];
      } else {
        this.path = null;
        this.pending = null;
        return [0, 0];
      }
    }
    const next = this.path[0];
    return [next.x - p.x, next.y - p.y];
  }
}
