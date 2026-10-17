import { Overlay } from './Overlay.js';
import { h, clear } from './dom.js';
import { GAME_DATE } from '../data/office.js';

// The SOC console: a SIEM dashboard with a live tail of (benign, for now) log lines.
// Formats follow real sources: Linux auth.log (sshd), Windows Security events (4624/4634), postfix.
const USERS = ['dana.k', 'priya.r', 'm.chen', 'j.alvarez', 's.okafor', 'svc_backup'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ip = () => `10.0.${pick([2, 3, 4, 8])}.${10 + Math.floor(Math.random() * 200)}`;
const GENERATORS = [
  () => `web01 sshd[${2000 + Math.floor(Math.random() * 900)}]: Accepted publickey for deploy from ${ip()} port ${49152 + Math.floor(Math.random() * 16000)} ssh2`,
  () => `dc01 Security[4624]: An account was successfully logged on. Account: ${pick(USERS)} Logon Type: ${pick([2, 3, 10])} Source: ${ip()}`,
  () => `dc01 Security[4634]: An account was logged off. Account: ${pick(USERS)} Logon Type: 3`,
  () => `mail01 postfix/smtpd[${800 + Math.floor(Math.random() * 200)}]: connect from ${pick(['mail-sor-f41.google.com[209.85.220.41]', 'mail-bn8nam12on2088.outbound.protection.outlook.com[40.107.237.88]'])}`,
  () => `vpn01 openvpn[1187]: ${pick(USERS)}/${ip()} MULTI: primary virtual IP for ${pick(USERS)}: 172.16.0.${2 + Math.floor(Math.random() * 60)}`,
  () => `file01 smbd[3301]: ${pick(USERS)} opened file Shared/Claims/2026/Q4_summary.xlsx (read)`,
];

export class SocScreen extends Overlay {
  constructor(scene) {
    super(scene, { name: 'soc', bezel: 0x15151f });
    this.tail = h('pre', { class: 'soc-tail mono' });
    this.epm = h('div', { class: 'val' });
    this.root.append(
      h(
        'div',
        { class: 'soc' },
        h('div', { class: 'soc-head' }, h('b', {}, 'HALCYON SIEM'), h('span', { class: 'live' }, '● LIVE')),
        h(
          'div',
          { class: 'tiles' },
          h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Open alerts'), h('div', { class: 'val ok', 'data-stat': 'alerts' }, '0')),
          h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Events / min'), this.epm),
          h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Failed logins (1h)'), h('div', { class: 'val' }, '3')),
        ),
        h('div', { class: 'lbl' }, 'Live tail · all sources'),
        this.tail,
        h('div', { class: 'soc-foot' }, 'Quiet morning. Nothing to triage yet.'),
      ),
    );
    this.lines = [];
  }

  stamp() {
    const m = this.scene.minutes;
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    return `${GAME_DATE.month} ${GAME_DATE.day} ${hh}:${mm}:${ss}`;
  }

  push() {
    this.lines.push(`${this.stamp()} ${pick(GENERATORS)()}`);
    if (this.lines.length > 18) this.lines.shift();
    clear(this.tail).append(this.lines.join('\n'));
    this.epm.textContent = String(38 + Math.floor(Math.random() * 14));
  }

  onOpen() {
    if (!this.lines.length) for (let i = 0; i < 10; i++) this.push();
    this.timer = setInterval(() => this.push(), 650);
  }

  onCloseInternal() {
    clearInterval(this.timer);
  }
}
