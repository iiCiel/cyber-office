import Phaser from 'phaser';
import { ZOOM, VIEW_W, VIEW_H, FONT } from '../config.js';
import { FOOTPRINTS, NPC_NAMES, CAST, PROPS, DOORS } from '../data/office.js';
import { DialogBox } from '../ui/DialogBox.js';
import { ComputerScreen } from '../ui/ComputerScreen.js';
import { SocScreen } from '../ui/SocScreen.js';
import { NavGrid } from '../world/pathfinding.js';
import { GameState } from '../game/GameState.js';
import { loadDay } from '../days/index.js';
import { deliveredEmails } from '../ui/apps/MailApp.js';

// The office, and the engine that runs a day. Everything that happens on a given day comes from its
// definition in src/days/dayN (emails, alerts, encounters, objectives...). See src/days/index.js.

const SPEED = 72; // world px per second
const REACH = 22; // how close (px) you must be to interact
const PLAYER_BODY = { halfW: 4, h: 5 };
const DOOR_CLOSE_MS = 3000;
const NPC_HOMES = { dana: [348, 154], priya: [124, 104] };

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
    else {
      GameState.clearSave();
      this.state.startDay(1);
    }
    this.day = loadDay(this.state.day, this.state);
    if (this.day.badgeAtStart) this.state.flags.badgeActive = true;

    this.worldLayer = [];
    this.uiLayer = [];
    this.uiCam = null;
    this.flags = { serverOpen: false }; // scene-only; everything that matters lives in this.state
    this.path = null;
    this.pending = null;
    // Phaser reuses this scene object between days and on "Play again": reset every per-day field here.
    this.ending = false;
    this.seated = false;
    this.alertTimers = {};
    this.encTimers = {};
    this.ringIcon = null;
    this.dialogQueue = [];
    this.walkupQueue = [];
    this.walkupActive = false;
    this.nearest = null;
    this.markerTarget = null;
    this.npcInfo = {};
    this.npcs = {};
    this.crisisFx = null;

    this.sound = this.game.registry.get('sound');
    this.buildMap();
    this.buildObjects();
    this.buildCast();
    this.buildPlayer();
    this.buildNav();
    this.buildCameras();
    this.buildHud();
    this.buildInput();

    this.dialog = new DialogBox(this);
    this.ui(this.dialog.container);
    this.ui(this.dialog.choiceBox);
    this.computer = new ComputerScreen(this);
    this.soc = new SocScreen(this);

    if (this.state.dayOver) {
      this.time.delayedCall(0, () => this.scene.start('Report', { state: this.state }));
      return;
    }
    // Picking up a saved day mid-way: re-arm whatever was in progress.
    for (const enc of this.day.encounters || []) {
      const es = this.state.enc[enc.id];
      if (!es || es.done) continue;
      if (enc.type === 'phone') {
        es.answered = false; // a call can't survive a reload
        this.showRinging(true);
      } else if (es.started) {
        this.walkupQueue.push(enc);
      }
    }
    if (this.state.crisis && !this.state.crisis.stopped) this.startCrisisFx();

    this.cameras.main.fadeIn(300, 18, 18, 28);
    const intro = this.resume && this.state.events.length > 2 ? ['Back at it. Your checklist is where you left it.'] : this.day.intro;
    this.time.delayedCall(450, () => !this.dialog.isOpen && this.dialog.open('You', intro));
    if (!this.state.events.length) this.state.log('day-started', { day: this.day.n });
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

    this.serverDoorTiles = [];
    this.wallsLayer.forEachTile((t) => {
      if (t.properties?.name === 'server-door') this.serverDoorTiles.push({ x: t.x, y: t.y, index: t.index, props: { ...t.properties } });
    });
  }

  buildObjects() {
    this.interactables = [];
    this.solids = this.physics.add.staticGroup();
    this.solidRects = [];
    const propLines = this.day.propLines || {};

    for (const o of this.map.getObjectLayer('objects').objects) {
      const p = propsOf(o);
      if (o.type === 'spawn') {
        this.spawn = { x: o.x, y: o.y };
      } else if (o.type === 'prop') {
        const def = { ...(PROPS[o.name] || { name: o.name, talk: ['...'] }), ...(propLines[o.name] || {}) };
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
        this.addNpc(o.name, { name: NPC_NAMES[o.name], sprite: p.sprite, x: o.x, y: o.y, face: p.face || 'down' });
      } else if (o.type === 'door') {
        const def = DOORS[o.name];
        this.interactables.push({ id: o.name, ...def, sprite: null, px: o.x, py: o.y - 8, halfW: 8, isDoor: true });
      }
    }
  }

  buildCast() {
    for (const id of this.day.cast || []) {
      const c = CAST[id];
      if (c) this.addNpc(id, c);
    }
  }

  addNpc(id, { name, sprite: sheet, x, y, face }) {
    const lines = this.day.npcLines?.[id] || {};
    const s = this.world(this.add.sprite(x, y, sheet, 'down-idle').setOrigin(0.5, 1).setDepth(y));
    const zone = this.world(this.add.zone(x, y - 2.5, 8, 5));
    this.solids.add(zone);
    this.faceSprite(s, face);
    this.tweens.add({ targets: s, scaleY: 0.96, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.npcs[id] = s;
    const rect = { x: x - 4, y: y - 5, w: 8, h: 5 };
    this.solidRects.push(rect);
    const inter = {
      id, name, kind: 'npc', sprite: s, px: x, py: y, halfW: 6, sheet,
      talk: lines.talk || ['Busy day.'], again: lines.again, effect: lines.effect,
    };
    this.interactables.push(inter);
    this.npcInfo[id] = { sprite: s, zone, rect, inter, home: NPC_HOMES[id] || [x, y], face };
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
    this.clockText = this.ui(this.add.text(24, 20, '', { fontFamily: FONT, fontSize: '25px', color: '#3fe07a' }).setDepth(11));
    this.stepText = this.ui(this.add.text(400, 22, '', { fontFamily: FONT, fontSize: '18px', color: '#6c7590' }).setOrigin(1, 0).setDepth(11));
    this.objectiveText = this.ui(this.add.text(24, 48, '', { fontFamily: FONT, fontSize: '19px', color: '#e6e6ea' }).setDepth(11));

    this.minutes = this.state.minutes ?? this.day.start;
    this.state.minutes = this.minutes;
    this.updateClock();
    this.knownMail = deliveredEmails(this.day, this.minutes).length;
    // One in-game minute every 4 real seconds.
    this.time.addEvent({ delay: 4000, loop: true, callback: () => this.tickMinute() });

    this.notice = this.ui(
      this.add
        .text(VIEW_W - 16, 16, '', { fontFamily: FONT, fontSize: '19px', color: '#f4f1e8', backgroundColor: '#12121cee', padding: { x: 12, y: 8 } })
        .setOrigin(1, 0)
        .setDepth(30)
        .setVisible(false),
    );

    // Day 5: the live "files encrypted" counter.
    this.crisisText = this.ui(
      this.add
        .text(VIEW_W / 2, 92, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd7d7', backgroundColor: '#4a0f12ee', padding: { x: 12, y: 6 } })
        .setOrigin(0.5, 0)
        .setDepth(29)
        .setVisible(false),
    );

    const hint = this.ui(
      this.add
        .text(VIEW_W - 16, VIEW_H - 14, 'Move: WASD / arrows / click   ·   Use: E   ·   Back: Esc', {
          fontFamily: FONT, fontSize: '18px', color: '#9aa3b8', backgroundColor: '#12121caa', padding: { x: 8, y: 4 },
        })
        .setOrigin(1, 1)
        .setDepth(10),
    );
    this.time.delayedCall(15000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 800 }));

    this.prompt = this.ui(this.add.container(0, 0).setDepth(20).setVisible(false));
    const bubble = this.add.image(0, 0, 'prompt').setOrigin(0.5, 1).setScale(1.2);
    const key = this.add.text(0, -19, 'E', { fontFamily: FONT, fontSize: '25px', fontStyle: 'bold', color: '#1b1b2a' }).setOrigin(0.5);
    this.prompt.add([bubble, key]);
    this.tweens.add({ targets: this.prompt, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });
    this.nameTag = this.ui(
      this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#e6e6ea', backgroundColor: '#12121ccc', padding: { x: 6, y: 3 } })
        .setOrigin(0.5, 1)
        .setDepth(20)
        .setVisible(false),
    );

    this.marker = this.world(this.add.triangle(0, 0, 0, 0, 8, 0, 4, 5, 0xe8c547).setOrigin(0.5, 1).setDepth(5000));
    this.marker.setStrokeStyle(1, 0x1b1b2a);
    this.clickRing = this.world(this.add.circle(0, 0, 3).setStrokeStyle(1, 0xe8c547).setDepth(-500).setVisible(false));

    // Mute toggle (top-right, under the notification), plus the M key.
    this.muteBtn = this.ui(
      this.add
        .text(VIEW_W - 16, VIEW_H - 40, '', { fontFamily: FONT, fontSize: '25px', color: '#9aa3b8', backgroundColor: '#12121caa', padding: { x: 8, y: 4 } })
        .setOrigin(1, 1)
        .setDepth(40)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.toggleMute()),
    );
    this.refreshMute();

    this.pauseBtn = this.ui(
      this.add
        .text(16, VIEW_H - 40, '☰ Menu', { fontFamily: FONT, fontSize: '20px', color: '#9aa3b8', backgroundColor: '#12121caa', padding: { x: 8, y: 4 } })
        .setOrigin(0, 1)
        .setDepth(40)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.openMenu()),
    );

    this.updateObjective();
  }

  openMenu() {
    // Don't pause over a computer/SOC screen (Esc handles those) or during the end-of-day fade.
    if (this.overlayOpen() || this.ending || this.scene.isActive('Menu')) return;
    this.sound?.play('select');
    this.scene.launch('Menu', { from: 'Office' });
    this.scene.pause();
  }

  onMenuClosed() {
    this.refreshMute();
  }

  toggleMute() {
    this.sound?.toggleMute();
    this.refreshMute();
  }

  refreshMute() {
    if (this.muteBtn) this.muteBtn.setText(this.sound?.muted ? '🔇 Sound off (M)' : '🔊 Sound on (M)');
  }

  tickMinute() {
    if (this.ending) return;
    this.minutes++;
    this.state.minutes = this.minutes;
    this.updateClock();
    this.checkTriggers();
    const delivered = deliveredEmails(this.day, this.minutes);
    if (delivered.length > this.knownMail) {
      // Pick the latest by arrival time, not array order, so an out-of-order emails list still names the right sender.
      const newest = delivered.reduce((a, b) => (b.at >= a.at ? b : a));
      this.knownMail = delivered.length;
      if (!this.computer.isOpen) { this.notify(`✉ New email from ${newest.from.name}`); this.sound?.play('mail'); }
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

  objective(id) {
    return this.day.objectives.find((o) => o.id === id);
  }

  // Called whenever the player does something on a computer (read, report, ticket, case...).
  onStateChanged() {
    for (const o of this.day.objectives) {
      if (this.isDone(o.id)) continue;
      if (o.type === 'inbox' && this.isDone('my-desk') && this.inboxProgress().done) this.complete(o.id);
      if (o.type === 'tickets' && this.ticketProgress().done) this.complete(o.id);
      if (o.type === 'terminal' && this.state.events.some((e) => e.type === 'terminal-cmd' && o.match.test(e.cmd))) this.complete(o.id);
    }
    this.updateObjective();
    this.checkTriggers();
  }

  inboxProgress() {
    const read = this.day.emails.filter((e) => this.state.mail[e.id]?.read).length;
    return { read, total: this.day.emails.length, done: read === this.day.emails.length };
  }

  ticketProgress() {
    const all = this.day.tickets || [];
    const done = all.filter((t) => this.state.tickets[t.id]).length;
    return { done: done === all.length && all.length > 0, n: done, total: all.length };
  }

  // ---------- triggers: alerts and encounters ----------
  checkTriggers() {
    if (this.ending) return;
    this.checkAlerts();
    this.checkEncounters();
  }

  checkAlerts() {
    const fired = this.state.soc.alerts;
    for (const a of this.day.alerts || []) {
      if (fired[a.id] != null || this.alertTimers[a.id]) continue;
      const tr = a.trigger || {};
      if (tr.when) {
        if (tr.when(this.state, this.minutes, this.state.campaign.carry)) this.fireAlert(a);
        continue;
      }
      const ready = tr.after ? this.isDone(tr.after) && !this.computer?.isOpen && !this.soc?.isOpen : false;
      const late = tr.fallbackAt != null && this.minutes >= tr.fallbackAt;
      if (ready || late) this.alertTimers[a.id] = this.time.delayedCall(ready ? tr.delayMs ?? 2500 : 0, () => this.fireAlert(a));
    }
  }

  fireAlert(a) {
    if (this.state.soc.alerts[a.id] != null) return;
    this.state.soc.alerts[a.id] = this.minutes;
    this.state.log('alert-fired', { id: a.id });
    this.sound?.play(a.main && this.day.crisis ? 'crisis' : 'alert');
    this.cameras.main.shake(a.main && this.day.crisis ? 500 : 220, a.main && this.day.crisis ? 0.006 : 0.003);
    // A quick red flash for urgency.
    const flash = this.ui(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xff3b3b, 0.22).setOrigin(0).setDepth(900));
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
    this.notify(a.notice || `🚨 SIEM alert: ${a.title}`);
    if (a.chat) this.say(a.chatFrom || 'Priya (chat)', a.chat);
    if (a.main && this.day.crisis) this.startCrisis();
    if (this.soc?.isOpen) this.soc.onAlertsChanged();
    this.updateObjective();
  }

  checkEncounters() {
    for (const enc of this.day.encounters || []) {
      const es = this.state.enc[enc.id];
      if (es || this.encTimers[enc.id]) continue;
      const ready = enc.after ? this.isDone(enc.after) : true;
      const late = enc.fallbackAt != null && this.minutes >= enc.fallbackAt;
      if (!ready && !late) continue;
      this.encTimers[enc.id] = this.time.delayedCall(enc.delayMs ?? 3000, () => this.startEncounter(enc));
    }
  }

  startEncounter(enc) {
    if (this.state.enc[enc.id]) return;
    if (enc.type === 'phone') {
      this.state.enc[enc.id] = { ringingAt: this.minutes };
      this.state.log('phone-ringing', { id: enc.id });
      this.notify(enc.notice || '☎ Your desk phone is ringing');
      this.sound?.play('phone');
      this.showRinging(true);
    } else {
      this.state.enc[enc.id] = { started: true };
      this.state.log('walkup-started', { id: enc.id });
      this.walkupQueue.push(enc);
    }
    this.updateObjective();
  }

  ringingEncounter() {
    return (this.day.encounters || []).find((e) => e.type === 'phone' && this.state.enc[e.id]?.ringingAt != null && !this.state.enc[e.id].done);
  }

  showRinging(on) {
    if (!this.ringIcon) {
      const desk = this.interactables.find((t) => t.id === 'my-desk');
      this.ringIcon = this.world(
        this.add.text(desk.px + 12, desk.py - 26, '☎', { fontFamily: FONT, fontSize: '9px', color: '#e8c547' }).setOrigin(0.5).setDepth(5001),
      );
      this.ringIcon.setResolution(3);
      this.tweens.add({ targets: this.ringIcon, angle: { from: -18, to: 18 }, duration: 90, yoyo: true, repeat: -1 });
    }
    this.ringIcon.setVisible(on);
  }

  answerPhone(enc) {
    const es = this.state.enc[enc.id];
    es.answered = true;
    this.showRinging(false);
    this.state.log('phone-answered', { id: enc.id });
    this.runConversation(enc.id, this.convOf(enc), (result) => {
      this.state.enc[enc.id] = { ...es, ...result, done: true };
      this.state.log('conversation', { id: enc.id, outcome: result.outcome });
      this.complete(enc.id);
      if (this.ringingEncounter()) this.showRinging(true);
      enc.onDone?.(this, result);
      this.checkTriggers();
    });
  }

  startWalkUp(enc) {
    this.walkupActive = true;
    const npc = enc.npc;
    if (enc.intro) this.dialog.open(this.npcInfo[npc]?.inter.name || npc, [enc.intro]);
    const p = this.player;
    const spots = [[p.x + 14, p.y], [p.x - 14, p.y], [p.x, p.y + 12], [p.x, p.y - 12]];
    const [tx, ty] = spots.find(([x, y]) => !this.nav.pointBlocked(x, y)) || spots[0];
    this.walkNpc(npc, tx, ty, () => {
      this.faceNpcToPlayer(npc);
      const go = () => {
        if (this.busy() || this.seated) return this.time.delayedCall(300, go);
        this.runConversation(enc.id, this.convOf(enc), (result) => {
          this.state.enc[enc.id] = { ...this.state.enc[enc.id], ...result, done: true };
          this.state.log('conversation', { id: enc.id, outcome: result.outcome });
          this.complete(enc.id);
          enc.onDone?.(this, result);
          const info = this.npcInfo[npc];
          this.time.delayedCall(800, () =>
            this.walkNpc(npc, info.home[0], info.home[1], () => {
              this.faceSprite(this.npcs[npc], info.face || 'down');
              this.walkupActive = false;
              this.checkTriggers();
            }),
          );
        });
      };
      go();
    });
  }

  convOf(enc) {
    return typeof enc.conv === 'function' ? enc.conv(this.state.campaign.carry || {}, this.state) : enc.conv;
  }

  faceNpcToPlayer(id) {
    const s = this.npcs[id];
    const dx = this.player.x - s.x;
    const dy = this.player.y - s.y;
    this.faceSprite(s, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
  }

  // Walk an NPC along a path. Its collision box is lifted while it moves and put back where it stops.
  walkNpc(id, tx, ty, onArrive) {
    const info = this.npcInfo[id];
    const s = info.sprite;
    info.zone.body.enable = false;
    const i = this.solidRects.indexOf(info.rect);
    if (i >= 0) this.solidRects.splice(i, 1);
    this.rebuildNav();
    const path = this.nav.findPath(s.x, s.y, tx, ty) || [];
    info.walking = true;
    const arrive = () => {
      s.anims.stop();
      this.faceSprite(s, 'down');
      info.zone.body.reset(s.x, s.y - 2.5);
      info.zone.body.enable = true;
      info.rect.x = s.x - 4;
      info.rect.y = s.y - 5;
      this.solidRects.push(info.rect);
      this.rebuildNav();
      info.inter.px = s.x;
      info.inter.py = s.y;
      info.walking = false;
      onArrive?.();
    };
    const step = () => {
      const pt = path.shift();
      if (!pt) return arrive();
      const dx = pt.x - s.x;
      const dy = pt.y - s.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
      s.setFlipX(dir === 'side' && dx < 0);
      s.anims.play(`${info.inter.sheet}-walk-${dir}`, true);
      this.tweens.add({ targets: s, x: pt.x, y: pt.y, duration: (Math.hypot(dx, dy) / 55) * 1000, onUpdate: () => s.setDepth(s.y), onComplete: step });
    };
    step();
  }

  // Play a conversation tree. Choices are logged; the merged result goes to onEnd.
  runConversation(convId, tree, onEnd) {
    const result = {};
    const play = (nodeId) => {
      const node = tree[nodeId];
      const segs = [...node.say];
      const next = () => {
        const [who, lines] = segs.shift();
        if (segs.length) return this.dialog.open(who, lines, next);
        if (node.choices) {
          this.dialog.ask(who, lines, node.choices, (c) => {
            Object.assign(result, c.set || {});
            this.state.log('choice', { conv: convId, node: nodeId, text: c.text });
            play(c.next);
          });
        } else {
          this.dialog.open(who, lines, () => onEnd(result));
        }
      };
      next();
    };
    play('start');
  }

  say(name, lines) {
    if (this.busy() || this.dialogQueue.length) this.dialogQueue.push({ name, lines });
    else this.dialog.open(name, lines);
  }

  flushQueuedDialog() {
    if (!this.dialogQueue.length || this.busy()) return;
    const { name, lines } = this.dialogQueue.shift();
    this.dialog.open(name, lines);
  }

  // ---------- SOC case ----------
  onCaseSubmitted() {
    this.complete('server-door'); // you were obviously in there
    const caseObj = this.day.objectives.find((o) => o.type === 'case');
    if (caseObj) this.complete(caseObj.id);
    this.sound?.play('success');
    this.notify('✔ Case sent to Priya');
    if (this.state.crisis && !this.state.crisis.stopped) {
      const main = this.day.alerts.find((a) => a.main);
      const cf = this.state.soc.cases[main.id];
      this.stopCrisis(this.day.crisis.stops(cf, this.state.campaign.carry));
    }
    this.checkTriggers();
  }

  // ---------- Day 5 crisis: a live damage counter ----------
  startCrisis() {
    if (this.state.crisis) return;
    this.state.crisis = { elapsed: 0, stopped: false };
    this.state.log('crisis-started');
    this.startCrisisFx();
  }

  startCrisisFx() {
    if (this.crisisFx) return;
    this.crisisFx = this.ui(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xff2020, 0).setOrigin(0).setDepth(5));
    this.tweens.add({ targets: this.crisisFx, fillAlpha: 0.13, duration: 700, yoyo: true, repeat: -1 });
    this.crisisText.setVisible(true);
  }

  stopCrisis(contained) {
    const c = this.state.crisis;
    c.stopped = true;
    c.contained = contained;
    c.filesAtStop = this.crisisFiles();
    this.sound?.play(contained ? 'success' : 'error');
    this.state.log('crisis-stopped', { contained, files: c.filesAtStop });
    if (this.crisisFx) {
      this.tweens.killTweensOf(this.crisisFx);
      this.crisisFx.setFillStyle(0x3fe07a, contained ? 0.06 : 0);
      this.tweens.add({ targets: this.crisisFx, fillAlpha: 0, duration: 1500 });
    }
    this.say('Priya (chat)', contained ? this.day.crisis.containedLines : this.day.crisis.notContainedLines);
  }

  crisisFiles() {
    const c = this.state.crisis;
    if (!c) return 0;
    const cfg = this.day.crisis;
    if (c.stopped && c.filesAtStop != null && c.contained) return c.filesAtStop;
    return Math.min(cfg.maxFiles, Math.floor(cfg.startFiles + c.elapsed * cfg.filesPerSec));
  }

  crisisStatus() {
    const c = this.state.crisis;
    if (!c) return null;
    const n = this.crisisFiles().toLocaleString('en-US');
    if (c.stopped && c.contained) return { stopped: true, text: `✔ Contained. ${n} files were encrypted before you stopped it.` };
    if (c.stopped) return { stopped: false, text: `🔥 Still spreading: ${n} files encrypted. Your response didn't cut it off.` };
    return { stopped: false, text: `🔥 ${this.day.crisis.label}: ${n} files encrypted and counting` };
  }

  // ---------- end of day ----------
  readyForDebrief() {
    return this.day.objectives.filter((o) => ['inbox', 'tickets', 'case', 'encounter', 'terminal'].includes(o.type)).every((o) => this.isDone(o.id));
  }

  debrief() {
    this.faceNpcToPlayer('priya');
    this.dialog.open('Priya (SOC lead)', this.day.debrief(this.state, this.state.campaign), () => this.endDay());
  }

  endDay() {
    const deb = this.day.objectives.find((o) => o.type === 'debrief');
    if (deb) this.complete(deb.id);
    this.state.dayOver = true;
    this.state.minutes = 17 * 60;
    this.state.log('day-over');
    this.state.save();
    this.ending = true;
    const card = this.ui(
      this.add
        .text(VIEW_W / 2, VIEW_H / 2, `${this.day.date.name}, 5:00 PM`, { fontFamily: FONT, fontSize: '50px', color: '#e6e6ea' })
        .setOrigin(0.5)
        .setDepth(1000)
        .setAlpha(0),
    );
    const shade = this.ui(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x12121c).setOrigin(0).setDepth(999).setAlpha(0));
    this.tweens.add({ targets: shade, alpha: 1, duration: 700 });
    this.tweens.add({ targets: card, alpha: 1, delay: 500, duration: 500, hold: 900, yoyo: true, onComplete: () => this.scene.start('Report', { state: this.state }) });
  }

  // ---------- clock + objectives ----------
  clockString() {
    const h24 = Math.floor(this.minutes / 60) % 24;
    const m = String(this.minutes % 60).padStart(2, '0');
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  updateClock() {
    this.clockText.setText(`${this.day.date.weekday}  ${this.clockString()}`);
  }

  objectiveList() {
    return this.day.objectives.map((o) => ({ ...o, done: this.isDone(o.id) }));
  }

  currentObjective() {
    return this.day.objectives.find((o) => !this.isDone(o.id)) || null;
  }

  updateObjective() {
    let cur = this.currentObjective();
    // Waiting for something that hasn't happened yet (a call, a visit)? Say so instead of pointing nowhere.
    if (cur?.type === 'encounter' && !this.state.enc[cur.id]) cur = { ...cur, text: cur.waitText || 'Keep an eye out. Something will come up.', target: null, waiting: true };
    if (cur?.type === 'case' || cur?.waitFor === 'alert') {
      const main = this.day.alerts.find((a) => a.main);
      if (main && this.state.soc.alerts[main.id] == null) cur = { ...cur, text: cur.waitText || 'Waiting on the SIEM. Look around.', target: null, waiting: true };
    }
    const done = this.day.objectives.filter((o) => this.isDone(o.id)).length;
    let text = cur ? cur.text : 'Done for the day.';
    if (cur?.type === 'inbox') {
      const p = this.inboxProgress();
      text += ` (${p.read}/${p.total} read)`;
    }
    if (cur?.type === 'tickets') {
      const p = this.ticketProgress();
      text += ` (${p.n}/${p.total})`;
    }
    this.objectiveText.setText(`> ${text}`);
    this.stepText.setText(cur ? `${done + 1}/${this.day.objectives.length}` : 'done');
    const targetId = cur && !cur.waiting ? cur.target || cur.id : null;
    this.markerTarget = targetId ? this.interactables.find((t) => t.id === targetId) : null;
  }

  complete(id) {
    if (this.isDone(id) || !this.objective(id)) return;
    this.sound?.play('chime');
    this.state.visited.push(id);
    this.state.log('objective', { id });
    this.updateObjective();
  }

  // ---------- input ----------
  buildInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ENTER,ESC,M');
    this.keys.M.on('down', () => this.toggleMute());
    this.input.keyboard.addKey('P').on('down', () => this.openMenu());
    const act = () => {
      if (this.overlayOpen() || this.ending) return;
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
      if (this.overlayOpen() || this.seated || this.ending || over.length) return;
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
        if (t.sprite.getBounds().contains(x, y)) return t;
      } else if (Math.abs(x - t.px) < 10 && Math.abs(y - (t.py - 6)) < 12) {
        return t;
      }
    }
    return null;
  }

  approachPoint(t) {
    if (t.isDoor && t.id === 'server-door') return [this.player.x < t.px ? t.px - 12 : t.px + 14, t.py + 6];
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
      const otherSide = door && x > door.px !== this.player.x > door.px;
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
    if (t.kind === 'npc' && this.npcInfo[t.id]?.walking) return;

    if (t.id === 'priya' && this.readyForDebrief() && !this.isDone('debrief')) return this.debrief();

    if (t.kind === 'npc') {
      this.faceNpcToPlayer(t.id);
      const lines = this.isDone(t.id) && t.again ? t.again : t.talk;
      this.dialog.open(t.name, lines, () => {
        if (t.effect) Object.assign(this.state.flags, t.effect);
        if (this.objective(t.id)?.type === 'talk') this.complete(t.id);
      });
      return;
    }

    const ringing = this.ringingEncounter();
    if (t.id === 'my-desk' && ringing) return this.answerPhone(ringing);
    if (t.kind === 'badge') return this.useBadge(t);
    if (t.kind === 'desk') return this.sitAt(t, this.computer);
    if (t.kind === 'soc') return this.sitAt(t, this.soc);

    const lines = this.isDone(t.id) && t.again ? t.again : t.talk;
    this.dialog.open(t.name, lines, () => {
      if (this.objective(t.id)?.type === 'talk') this.complete(t.id);
    });
  }

  sitAt(t, overlay) {
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
        if (t.kind === 'desk') this.complete(t.id);
        overlay.open(() => {
          this.seated = false;
          this.onStateChanged();
          this.flushQueuedDialog();
        });
      },
    });
  }

  useBadge(t) {
    if (!this.state.flags.badgeActive) {
      this.flashDoorLight(0xff4f4f);
      this.sound?.play('denied');
      this.dialog.open(t.name, t.locked);
      return;
    }
    if (this.flags.serverOpen) {
      this.dialog.open(t.name, ['The door is already open. It closes by itself behind you.']);
      return;
    }
    this.flashDoorLight(0x3fe07a);
    this.sound?.play('door');
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
    const npcInDoor = Object.values(this.npcInfo).some((n) => n.walking && n.sprite.x > left && n.sprite.x < right && n.sprite.y > top && n.sprite.y < bottom);
    const inDoorway = (p.x > left && p.x < right && p.y > top && p.y < bottom) || npcInDoor;
    this.doorClearMs = inDoorway || this.busy() ? 0 : this.doorClearMs + delta;
    if (this.doorClearMs > DOOR_CLOSE_MS) this.setServerDoor(false);
  }

  findNearest() {
    const fx = this.player.x;
    const fy = this.player.y - 2;
    let best = null;
    let bestD = Infinity;
    for (const t of this.interactables) {
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
    const free = !this.busy() && !this.seated && !this.ending;

    if (this.dialogQueue.length && free) this.flushQueuedDialog();
    if (this.walkupQueue.length && !this.walkupActive && free) this.startWalkUp(this.walkupQueue.shift());

    // Day 5: the counter only runs while you're actually able to act (not during dialogs or fades).
    const c = this.state.crisis;
    if (c && !c.stopped && !this.ending && !this.dialog.isOpen) {
      c.elapsed += delta / 1000;
      if (Math.floor(c.elapsed) !== this.lastCrisisSave) {
        this.lastCrisisSave = Math.floor(c.elapsed);
        if (this.lastCrisisSave % 5 === 0) this.state.save();
      }
    }
    const cs = this.crisisStatus();
    if (cs) this.crisisText.setText(cs.text).setVisible(!this.ending).setBackgroundColor(cs.stopped ? '#12201aee' : '#4a0f12ee');

    if (!this.busy() && !this.seated && !this.ending) {
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
      this.sound?.step(this.time.now);
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
