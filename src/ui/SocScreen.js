import { Overlay } from './Overlay.js';
import { GAME_DATE } from '../data/office.js';

// The SOC console: a SIEM dashboard with a live tail of (benign, for now) log lines.
// Formats follow real sources: Linux auth.log (sshd), Windows Security events (4624/4634), postfix.
// M4 turns this into the real log viewer with the Day 1 alert.

const HOSTS_USERS = ['dana.k', 'priya.r', 'm.chen', 'j.alvarez', 's.okafor', 'svc_backup'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ip = () => `10.0.${pick([2, 3, 4, 8])}.${10 + Math.floor(Math.random() * 200)}`;

const GENERATORS = [
  () => `web01 sshd[${2000 + Math.floor(Math.random() * 900)}]: Accepted publickey for deploy from ${ip()} port ${49152 + Math.floor(Math.random() * 16000)} ssh2`,
  () => `dc01 Security[4624]: An account was successfully logged on. Account: ${pick(HOSTS_USERS)} Logon Type: ${pick([2, 3, 10])} Source: ${ip()}`,
  () => `dc01 Security[4634]: An account was logged off. Account: ${pick(HOSTS_USERS)} Logon Type: 3`,
  () => `mail01 postfix/smtpd[${800 + Math.floor(Math.random() * 200)}]: connect from mail-${pick(['sor-f41.google.com[209.85.220.41]', 'eopbgr750.outbound.protection.outlook.com[40.107.75.88]'])}`,
  () => `vpn01 openvpn[1187]: ${pick(HOSTS_USERS)}/${ip()} MULTI: primary virtual IP for ${pick(HOSTS_USERS)}: 172.16.0.${2 + Math.floor(Math.random() * 60)}`,
  () => `file01 smbd[3301]: ${pick(HOSTS_USERS)} opened file Shared/Claims/2026/Q4_summary.xlsx (read)`,
];

export class SocScreen extends Overlay {
  constructor(scene) {
    super(scene, { title: 'SOC console', screen: 0x0b120e, bezel: 0x15151f });
    const { sx, sy, sw } = this;

    this.text(sx + 20, sy + 16, 'HALCYON SIEM', { fontSize: '24px', color: '#3fe07a', fontStyle: 'bold' });
    this.status = this.text(sx + sw - 20, sy + 20, '● LIVE', { fontSize: '16px', color: '#3fe07a' }).setOrigin(1, 0);
    scene.tweens.add({ targets: this.status, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

    const tile = (i, label) => {
      const w = (sw - 80) / 3;
      const x = sx + 20 + i * (w + 20);
      this.rect(x, sy + 60, w, 90, 0x12201a).setStrokeStyle(1, 0x24533a);
      this.text(x + 14, sy + 70, label, { fontSize: '15px', color: '#7fae94' });
      return this.text(x + 14, sy + 96, '', { fontSize: '36px', color: '#e6e6ea', fontStyle: 'bold' });
    };
    this.alertsVal = tile(0, 'Open alerts');
    this.epmVal = tile(1, 'Events / min');
    this.failVal = tile(2, 'Failed logins (1h)');

    this.text(sx + 20, sy + 170, 'Live tail  ·  all sources', { fontSize: '15px', color: '#7fae94' });
    this.rect(sx + 20, sy + 194, sw - 40, 330, 0x050a07).setStrokeStyle(1, 0x24533a);
    this.tail = this.text(sx + 30, sy + 202, '', { fontSize: '14px', color: '#9fd8b4', lineSpacing: 5 });
    this.lines = [];
    this.text(sx + 20, sy + 534, 'Quiet morning. Nothing to triage yet.', { fontSize: '15px', color: '#6c7590' });
  }

  stamp() {
    const m = this.scene.minutes;
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    return `${GAME_DATE.month} ${GAME_DATE.day} ${hh}:${mm}:${ss}`;
  }

  push() {
    const line = `${this.stamp()} ${pick(GENERATORS)()}`;
    this.lines.push(line.length > 88 ? `${line.slice(0, 87)}…` : line);
    if (this.lines.length > 16) this.lines.shift();
    this.tail.setText(this.lines.join('\n'));
    this.epmVal.setText(String(38 + Math.floor(Math.random() * 14)));
  }

  onOpen() {
    this.alertsVal.setText('0').setColor('#3fe07a');
    this.failVal.setText('3');
    if (!this.lines.length) for (let i = 0; i < 10; i++) this.push();
    this.ticker = this.scene.time.addEvent({ delay: 650, loop: true, callback: () => this.push() });
  }

  onCloseInternal() {
    this.ticker?.remove();
  }
}
