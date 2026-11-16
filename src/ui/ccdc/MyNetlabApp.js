// MyNETLAB, the pod portal team 14 worked from on Nov 14 (matched to docs/reference/netlab-*.png): breadcrumb
// "MyNETLAB > CCDC State Pod 16 > Reservation 24144 > 2027 State", a row of buttons (Topology, Content, Status, then
// one per VM with a dropdown) and the selected VM's console in a red frame. Consoles are separate sessions from
// SSH/RDP. The web console starts with the wrong keyboard layout, so Shift is lost and capitals arrive in lower case
// (it happened on the Splunk console that day) until the layout is set to en-us from the VM's dropdown.
// Power > Reboot goes through the game like typing reboot, so its traps apply (the router never comes back).
//   const app = new NetlabApp({ state, run: (devId, line) => r, makeDesktop: (dev) => WinDesktop, topo }); host.append(app.el)
import { h, clear } from '../dom.js';
import { TermView } from './TermView.js';
import { TakeoverScreen } from './TakeoverScreen.js';
import './mynetlab.css';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

// Console login text per OS, as each VM's tty shows it.
const CONSOLE_BANNER = {
  ecom: ['Rocky Linux 9.4 (Blue Onyx)', 'Kernel 5.14.0-427.13.1.el9_4.x86_64 on an x86_64', '', 'Ecomm login: sysadmin', 'Password:', 'Last login: Sat Nov 14 12:58:41 on tty1'],
  email: ['Ubuntu 22.04.5 LTS webmail tty1', '', 'webmail login: sysadmin', 'Password:', 'Last login: Sat Nov 14 12:40:02 UTC 2026 on tty1'],
  splunk: ['Debian GNU/Linux 12 Splunk tty1', '', 'Splunk login: sysadmin', 'Password:', 'Last login: Sat Nov 14 12:41:19 CST 2026 on tty1'],
  wkst: ['Ubuntu 22.04.5 LTS Ubuntu-Wkst tty1', '', 'Ubuntu-Wkst login: sysadmin', 'Password:'],
  kali: ['Kali GNU/Linux Rolling kali tty1', '', 'kali login: sysadmin', 'Password:'],
  pa: ['PA-VM login: admin', 'Password:', '', 'Number of failed attempts since last successful login: 0', ''],
  vyos: ['Welcome to VyOS - EdgeRouter ttyS0', '', 'EdgeRouter login: vyos', 'Password:', 'Last login: Sat Nov 14 05:12:41 CST 2026 on ttyS0'],
};

export class MyNetlabApp {
  /** @param {{ state, run:(devId:string,line:string)=>object, makeDesktop?:(dev)=>object, labels:Object<string,string>, crumbs:string[] }} o */
  constructor(o) {
    this.o = o;
    this.state = o.state;
    this.view = 'topology';
    this.layout = {}; // devId -> 'default' | 'en-us'
    this.consoles = {}; // devId -> { el, term?, desk?, buf, hist }
    this.menu = null;
    this.bar = h('div', { class: 'mnl-bar' });
    this.stage = h('div', { class: 'mnl-stage' });
    this.el = h('div', { class: 'mnl' },
      h('header', { class: 'mnl-top' }, h('b', { class: 'mnl-logo' }, 'ccdc'), h('span', { class: 'mnl-nav' }, '⌂ Home'), h('span', { class: 'mnl-nav' }, 'Pod ▾'), h('span', { class: 'mnl-nav' }, 'Reservations ▾')),
      h('div', { class: 'mnl-crumbs' }, (o.crumbs || []).map((c, i) => [i ? h('span', { class: 'mnl-sep' }, '›') : null, h('span', { class: i ? '' : 'mnl-c0' }, c)])),
      this.bar, this.stage);
    this.onDoc = (e) => { if (this.menu && !this.menu.contains(e.target) && !e.target.closest('.mnl-caret')) this.closeMenu(); };
    document.addEventListener('mousedown', this.onDoc);
    this.render();
  }

  devices() { return Object.keys(this.o.labels).map((id) => this.state.deviceList.find((d) => d.id === id)).filter(Boolean); }

  render() {
    clear(this.bar);
    const btn = (id, icon, label, caret) => h('span', { class: `mnl-btn${this.view === id ? ' on' : ''}`, 'data-view': id },
      h('span', { class: 'mnl-btn-main', onclick: () => this.show(id) }, h('i', { class: `mnl-ic mnl-ic-${icon}`, 'aria-hidden': 'true' }), label),
      caret ? h('span', { class: 'mnl-caret', 'data-menu': id, onclick: (e) => this.openMenu(id, e.currentTarget) }, '▾') : null);
    this.bar.append(btn('topology', 'img', 'Topology'), btn('content', 'book', 'Content', true), btn('status', 'chart', 'Status'),
      ...this.devices().map((d) => btn(d.id, this.view === d.id ? 'kbd' : 'pc', this.o.labels[d.id], true)));
    clear(this.stage);
    if (this.view === 'topology') this.stage.append(this.topology());
    else if (this.view === 'status') this.stage.append(this.status());
    else if (this.view === 'content') this.stage.append(this.content());
    else this.stage.append(this.console(this.view));
  }

  show(id) { this.closeMenu(); this.view = id; this.render(); this.consoles[id]?.term?.focus(); }

  // ---- per-VM dropdown ---------------------------------------------------------------------------------------
  openMenu(id, anchor) {
    this.closeMenu();
    const dev = this.state.deviceList.find((d) => d.id === id);
    const items = id === 'content'
      ? [['Team Packet (PDF)', () => this.show('content')], ['Topology', () => this.show('topology')]]
      : [['Console', () => this.show(id)],
        [`Keyboard: ${this.layout[id] === 'en-us' ? 'en-us ✓' : 'default (en-us ✗)'}`, () => { this.layout[id] = this.layout[id] === 'en-us' ? 'default' : 'en-us'; this.show(id); }],
        ['Send Ctrl+Alt+Del', () => this.show(id)],
        ['Power ▸ Reboot', () => this.reboot(dev)]];
    this.menu = h('div', { class: 'mnl-menu', role: 'menu' }, items.map(([label, fn]) => h('div', { class: 'mnl-mi', role: 'menuitem', 'data-mi': label.split(' ')[0].toLowerCase(), onclick: () => { this.closeMenu(); fn(); } }, label)));
    const r = anchor.getBoundingClientRect(); const host = this.el.getBoundingClientRect();
    Object.assign(this.menu.style, { left: `${r.left - host.left - 120}px`, top: `${r.bottom - host.top + 2}px` });
    this.el.append(this.menu);
  }

  closeMenu() { this.menu?.remove(); this.menu = null; }

  // Power cycling from the portal is the same as typing the reboot command on the box (same traps).
  reboot(dev) {
    const line = dev.kind === 'pwsh' ? 'Restart-Computer -Force' : 'reboot';
    const r = this.o.run(dev.id, line) || { lines: [] };
    const c = this.consoleFor(dev);
    c.term?.print([{ cls: 'sys', text: `[MyNETLAB] Power ▸ Reboot sent to ${this.o.labels[dev.id]}` }, ...(r.lines || [])]);
    this.show(dev.id);
  }

  // ---- console ---------------------------------------------------------------------------------------------
  consoleFor(dev) {
    if (this.consoles[dev.id]) return this.consoles[dev.id];
    const c = { buf: [], hist: [] };
    if (dev.kind === 'pwsh' && this.o.makeDesktop) {
      c.desk = this.o.makeDesktop(dev);
      c.el = h('div', { class: 'mnl-con mnl-con-win' }, c.desk.el);
    } else {
      c.buf.push(...(CONSOLE_BANNER[dev.id] || [`${dev.host} login: ${dev.user}`, 'Password:']).map((text) => ({ cls: '', text })));
      c.term = new TermView({
        theme: 'fbsd', label: `${this.o.labels[dev.id]} console`, buffer: c.buf, history: c.hist,
        prompt: () => (dev.id === 'kali' ? 'sysadmin@kali:~$' : dev.prompt || `${dev.user}@${dev.host}:~$`),
        run: (line) => this.o.run(dev.id, line),
        mapLine: (line) => (this.layout[dev.id] === 'en-us' ? line : line.toLowerCase()),
      });
      c.el = h('div', { class: 'mnl-con' }, c.term.el);
    }
    this.consoles[dev.id] = c;
    return c;
  }

  console(id) {
    const dev = this.state.deviceList.find((d) => d.id === id);
    // The router after the takeover: the console is gone (original animation, not the art from the day).
    if (id === 'vyos' && this.o.takenOver?.()) {
      this.takeover = this.takeover || new TakeoverScreen({ menu: !!this.o.rebooted?.() });
      return h('div', { class: 'mnl-frame' }, this.takeover.el);
    }
    const c = this.consoleFor(dev);
    const hint = dev.kind !== 'pwsh' && this.layout[id] !== 'en-us' ? h('div', { class: 'mnl-hint' }, 'Keyboard layout: default') : null;
    return h('div', { class: 'mnl-frame' }, c.el, hint);
  }

  // ---- other pages -----------------------------------------------------------------------------------------
  status() {
    const rows = this.devices().map((d) => {
      const dead = (d.id === 'vyos' && this.o.takenOver?.()) || this.o.down?.(d.id);
      return h('tr', {}, h('td', {}, this.o.labels[d.id]), h('td', {}, d.os), h('td', {}, h('span', { class: `mnl-pw ${dead ? 'bad' : 'ok'}` }, dead ? 'Running (no response)' : 'Running')), h('td', {}, d.ip));
    });
    return h('div', { class: 'mnl-page' }, h('h3', {}, 'Status'), h('table', { class: 'mnl-table' }, h('tr', {}, ['VM', 'OS', 'Power', 'Address'].map((t) => h('th', {}, t))), rows));
  }

  content() {
    return h('div', { class: 'mnl-page' }, h('h3', {}, 'Content'), h('ul', { class: 'mnl-docs' },
      h('li', {}, h('b', {}, 'MWCCDC Invitational Team Packet.pdf'), h('span', { class: 'mnl-muted' }, ' · default credentials, scored services, rules of engagement')),
      h('li', {}, h('b', {}, 'Topology.png'), h('span', { class: 'mnl-muted' }, ' · see Topology'))));
  }

  // Topology, redrawn in the style of the pod's diagram: internet, VyOS router (with the Kali workstation on its side),
  // firewall, then one switch with the servers and workstations below.
  topology() {
    const W = 1100; const H = 600;
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mnl-topo', role: 'img', 'aria-label': 'Pod topology' });
    const C = '#3b5998'; const L = '#4f87c9';
    const text = (x, y, lines) => lines.map((t, i) => s('text', { x, y: y + i * 17, 'text-anchor': 'middle', class: 'mnl-tl' }, t));
    const server = (x, y) => [s('rect', { x: x - 20, y, width: 40, height: 64, fill: C }), s('circle', { cx: x + 10, cy: y + 12, r: 3, fill: '#cfe0f5' }), ...[0, 1, 2].map((k) => s('rect', { x: x - 12, y: y + 34 + k * 6, width: 22, height: 2, fill: '#cfe0f5' }))];
    const pc = (x, y) => [s('rect', { x: x - 30, y, width: 60, height: 42, fill: C, rx: 2 }), s('rect', { x: x - 25, y: y + 5, width: 50, height: 32, fill: '#2d4b88' }), s('rect', { x: x - 4, y: y + 42, width: 8, height: 6, fill: C }), s('path', { d: `M${x - 34} ${y + 58} L${x - 28} ${y + 48} L${x + 28} ${y + 48} L${x + 34} ${y + 58} Z`, fill: C })];
    const cloud = s('path', { d: 'M520 80 a26 26 0 0 1 30 -32 a30 30 0 0 1 52 6 a22 22 0 0 1 20 34 Z', fill: C });
    g.append(cloud, s('line', { x1: 570, y1: 82, x2: 570, y2: 130, stroke: L, 'stroke-width': 2 }));
    g.append(s('rect', { x: 530, y: 130, width: 80, height: 30, fill: C, rx: 2 }), s('rect', { x: 586, y: 136, width: 18, height: 18, fill: '#9cc3ef' }), ...[0, 1, 2, 3].map((k) => s('rect', { x: 538 + k * 11, y: 140, width: 7, height: 4, fill: '#fff' })));
    g.append(s('line', { x1: 610, y1: 145, x2: 700, y2: 145, stroke: L, 'stroke-width': 2 }), ...pc(735, 118), ...text(735, 200, ['Wkst', 'Linux']), ...text(570, 188, ['VyOS   Router']));
    g.append(s('line', { x1: 570, y1: 160, x2: 570, y2: 225, stroke: L, 'stroke-width': 2 }));
    for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) g.append(s('rect', { x: 534 + k * 18 + (r % 2 ? 9 : 0) - (r % 2 && k === 3 ? 9 : 0), y: 225 + r * 10, width: 16, height: 8, fill: C }));
    g.append(s('line', { x1: 570, y1: 285, x2: 570, y2: 335, stroke: L, 'stroke-width': 2 }), ...text(605, 302, ['Firewall']));
    g.append(s('rect', { x: 200, y: 335, width: 720, height: 10, fill: C }));
    const nodes = [['Ecom', 'Rocky', 'Linux'], ['Email', 'Ubuntu', 'Server'], ['Splunk', 'Debian'], ['AD', 'Windows'], ['MSSQL', 'Windows'], ['Wkst', 'Ubuntu'], ['Wkst', 'Windows']];
    nodes.forEach((lbl, i) => {
      const x = 235 + i * 108;
      g.append(s('line', { x1: x, y1: 345, x2: x, y2: 400, stroke: L, 'stroke-width': 2 }), ...(i >= 5 ? pc(x, 402) : server(x, 400)), ...text(x, 488, lbl));
    });
    return h('div', { class: 'mnl-page mnl-topowrap' }, g);
  }

  refresh() {
    if (this.view === 'vyos' && this.o.takenOver?.() && !this.takeover) this.render();
    this.takeover?.tick?.();
    for (const c of Object.values(this.consoles)) c.desk?.refresh?.();
  }

  destroy() {
    document.removeEventListener('mousedown', this.onDoc);
    this.takeover?.destroy?.();
    for (const c of Object.values(this.consoles)) c.desk?.destroy?.();
  }
}
