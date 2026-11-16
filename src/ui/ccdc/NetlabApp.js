// NETLAB+ VE as Midwest teams use it (docs/reference/netlab-ve-menu-2026.png, netlab-ve-vm-menu-2026.png): the
// breadcrumb, then Topology, Content, Status and one button per virtual machine, each with its dropdown. There is
// no SSH from outside: a console opens at the login prompt and everything is typed through it. Revert is greyed
// out, as it is on the VE platform, and power cycling does not bring anything back.
import { h, clear } from '../dom.js';
import { TermView } from './TermView.js';
import { WinDesktop } from './WinDesktop.js';
import { TermEditor } from './TermEditor.js';
import { panosPrompt } from '../../game/panos.js';
import './netlab.css';

const stop = (e) => e.stopPropagation();

// A text console: tty login, then the shell. Also used for the firewall's CLI.
class TextConsole {
  constructor({ state, dev, run, onBrowser, session, noteLine }) {
    Object.assign(this, { state, dev, runOwner: run, onBrowser, noteLine });
    this.fw = dev.kind === 'firewall';
    this.ds = state.devState[dev.id];
    this.stage = 'login';
    this.user = '';
    this.boots = this.ds.live?.boots || 0;
    this.buffer = session.buffer;
    this.notice = h('div', { class: 'nl-notice', hidden: true });
    this.term = new TermView({
      theme: this.fw ? 'fbsd' : 'putty', label: `${dev.tab} console`, buffer: this.buffer, history: session.history,
      prompt: () => this.prompt(), run: (l) => this.run(l), secret: () => this.stage === 'password' || !!this.ds.pending,
      complete: this.fw ? ['configure', 'commit', 'show', 'set', 'delete', 'move', 'rulebase', 'security', 'rules', 'application-default', 'web-browsing', 'running', 'security-policy', 'jobs', 'exit']
        : ['service', 'systemctl', 'cat', 'grep', 'ls', 'ss', 'netstat', 'crontab', 'passwd', 'firewall-cmd', 'iptables', 'sed', 'tail', 'ps', 'last', 'who', 'find', '/etc/', '/var/log/', '/var/www/', '/home/'],
    });
    this.body = h('div', { class: 'nl-tty' }, this.term.el);
    this.el = h('div', { class: 'nl-con' }, this.notice, this.body);
    this.banner();
  }

  banner() {
    const fs = this.ds.fs;
    if (this.fw) this.term.print([{ text: '' }, { text: 'PA-VM login attempts are logged.' }, { text: '' }]);
    else {
      const issue = String(fs?.['/etc/issue'] || '').replace(/\\n/g, this.dev.host).replace(/\\l/g, 'tty1').replace(/\\r/g, '3.10.0').replace(/\\m/g, 'x86_64').trim();
      this.term.print([{ text: '' }, ...issue.split('\n').map((text) => ({ text })), { text: '' }]);
    }
  }

  prompt() {
    if (this.stage === 'login') return `${this.fw ? 'PA-VM' : this.dev.host} login:`;
    if (this.stage === 'password') return 'Password:';
    if (this.ds.pending) return '';
    if (this.fw) return panosPrompt(this.ds.firewall);
    const u = this.user;
    const cwd = this.ds.cwd === `/home/${u}` || (u === 'root' && this.ds.cwd === '/root') ? '~' : this.ds.cwd;
    return /yum|dnf/.test(this.dev.pkg || '') ? `[${u}@${this.dev.host} ${cwd === '~' ? '~' : cwd.split('/').pop() || '/'}]${u === 'root' ? '#' : '$'}` : `${u}@${this.dev.host}:${cwd}${u === 'root' ? '#' : '$'}`;
  }

  run(raw) {
    const line = raw.trim();
    if (this.stage === 'login') { if (line) { this.user = line; this.stage = 'password'; } return { lines: [] }; }
    if (this.stage === 'password') {
      const c = this.ds.creds?.[this.user.toLowerCase()];
      this.stage = 'login';
      if (c && !c.locked && c.pw === raw) {
        this.stage = 'shell';
        return { lines: this.fw ? [{ text: 'Last login: Fri Nov 13 16:41:02 2026' }, { text: 'Number of failed attempts since last successful login: 0' }, { text: '' }] : [{ text: 'Last login: Fri Nov 13 16:41:02 on tty1' }] };
      }
      return { lines: [{ cls: 'err', text: 'Login incorrect' }, { text: '' }] };
    }
    if (!this.fw && (line === 'exit' || line === 'logout') && !this.ds.pending) { this.logout(); return { lines: [] }; }
    const ed = !this.fw && !this.ds.pending && line.match(/^(?:sudo\s+)?(nano|vim?)\s+(\S+)$/);
    if (ed) { this.noteLine?.(this.dev.id, line); return this.openEditor(ed[1], ed[2]); }
    const fox = !this.fw && line.match(/^(?:firefox|chromium|google-chrome)\s+(\S+)/);
    if (fox) return this.dev.browser ? { lines: this.onBrowser(fox[1], this.dev.id, line) } : { lines: [{ cls: 'err', text: `bash: ${line.split(' ')[0]}: command not found` }] };
    const res = this.runOwner(line === '' && this.ds.pending ? '' : raw) || { lines: [] };
    if (res.effects?.clear) return { clear: true, ...res };
    if (res.effects?.logout) { setTimeout(() => this.logout(), 0); }
    return res;
  }

  openEditor(tool, arg) {
    if (tool === 'nano' && this.dev.noNano) return { lines: [{ cls: 'err', text: '-bash: nano: command not found' }] };
    const cwd = this.ds.cwd || '/';
    const parts = [];
    for (const p of (arg.startsWith('/') ? arg : `${cwd}/${arg}`).split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }
    const path = `/${parts.join('/')}`;
    const isNew = this.ds.fs[path] === undefined;
    const editor = new TermEditor({
      tool: tool === 'nano' ? 'nano' : 'vi', path, text: this.ds.fs[path] ?? '', isNew,
      onSave: (text) => {
        if (this.ds.live.immutable?.includes(path)) return 'Operation not permitted';
        this.ds.fs[path] = text;
        // Hand the save to the engine as a no-op write of that file, so hardening checks read what the editor left.
        this.runOwner(`printf '' | tee -a ${path}`);
        return null;
      },
      onExit: () => this.closeEditor(),
    });
    this.editor = editor;
    this.el.append(editor.el);
    this.body.hidden = true;
    return { lines: [] };
  }

  closeEditor() { this.editor?.el.remove(); this.editor = null; this.body.hidden = false; this.term.focus(); }

  logout() { this.closeEditor(); this.stage = 'login'; this.user = ''; this.ds.pending = null; if (this.ds.firewall) this.ds.firewall.mode = 'op'; this.banner(); this.term.redraw(); }

  refresh() {
    const L = this.ds.live;
    const clock = this.state.engine?.clock || 0;
    let msg = null;
    if (L?.off || this.ds.poweredOff) msg = 'This virtual machine is powered off.';
    else if (L?.bricked) msg = 'Welcome to emergency mode! After logging in, type "journalctl -xb" to view system logs.\nCannot open access to console, the root account is locked.\nFailed to mount /etc/fstab entries. Open a ticket with Tech Support to recover this VM.';
    else if (L && L.offlineUntil > clock) msg = 'Starting system...';
    this.notice.hidden = !msg;
    this.body.hidden = !!msg || !!this.editor;
    if (msg) this.notice.textContent = msg;
    const boots = L?.boots || 0;
    if (boots !== this.boots) { this.boots = boots; this.logout(); }
  }

  focus() { if (this.editor) this.editor.focus(); else this.term.focus(); }
  setInput(t) { this.term.setInput(t); }
  ctrlAltDel() {}
}

// A Windows console: the lock screen waits for Send CTRL+ALT+DEL, then a password, then the desktop.
class WinConsole {
  constructor({ state, dev, run, session, clock, clockLabel }) {
    Object.assign(this, { state, dev, run, session, clock, clockLabel });
    this.ds = state.devState[dev.id];
    this.boots = this.ds.live?.boots || 0;
    this.stage = 'locked';
    this.el = h('div', { class: 'nl-con nl-win' });
    this.draw();
  }

  draw() {
    clear(this.el);
    this.desktop?.destroy?.();
    this.desktop = null;
    if (this.stage === 'desktop') {
      this.desktop = new WinDesktop({ consoleMode: true, clockLabel: this.clockLabel, state: this.state, dev: this.dev, clock: this.clock, termBuffer: this.session.buffer, termHistory: this.session.history, run: this.run });
      this.el.append(this.desktop.el);
      return;
    }
    if (this.stage === 'locked') {
      this.el.append(h('div', { class: 'nl-lock' }, h('div', { class: 'nl-lock-time' }, '8:02'), h('div', { class: 'nl-lock-date' }, 'Saturday, November 14'), h('div', { class: 'nl-lock-hint' }, 'Press Ctrl+Alt+Delete to unlock.')));
      return;
    }
    const pw = h('input', { type: 'password', class: 'nl-pw', placeholder: 'Password', 'aria-label': 'Password', onkeydown: (e) => { stop(e); if (e.key === 'Enter') this.login(pw.value); } });
    this.err = h('div', { class: 'nl-login-err' });
    this.el.append(h('div', { class: 'nl-login' }, h('div', { class: 'nl-avatar' }), h('div', { class: 'nl-user' }, this.dev.login), pw, this.err));
    setTimeout(() => pw.focus(), 0);
  }

  login(pw) {
    const c = this.ds.creds?.[String(this.dev.login).toLowerCase()];
    if (c && c.pw === pw && !c.locked) { this.stage = 'desktop'; this.draw(); } else if (this.err) this.err.textContent = 'The password is incorrect. Try again.';
  }

  ctrlAltDel() { if (this.stage === 'locked') { this.stage = 'password'; this.draw(); } }
  focus() { this.desktop?.focus?.(); }
  setInput() {}

  refresh() {
    const L = this.ds.live;
    const boots = L?.boots || 0;
    if (boots !== this.boots) { this.boots = boots; this.stage = 'locked'; this.draw(); }
    const off = L?.off || (L && L.offlineUntil > (this.state.engine?.clock || 0));
    this.el.classList.toggle('nl-offline', !!off);
    this.desktop?.refresh?.();
  }

  openPs() { return this.desktop?.openApp?.('ps'); }
}

const MENU = (run) => [
  ['Send CTRL+ALT+DEL', 'cad'], null, ['Undock', 'undock'], null, ['Actual Size', 'actual'], ['Scale Display', 'scale'], ['Resize Display', null], null,
  ['Revert', null], null, ['Power On', 'on'], ['Power Off', 'off'], null, ['Take Screenshot', 'shot'],
].map((x) => (x ? { label: x[0], act: x[1], run } : null));

export class NetlabApp {
  constructor(o) {
    this.o = o;
    this.vms = o.state.deviceList;
    this.consoles = new Map();
    this.tab = 'topology';
    this.menu = null;
    this.undocked = new Set();
    this.scale = true;
    this.nav = h('div', { class: 'nl-tabs' });
    this.view = h('div', { class: 'nl-view' });
    this.el = h('div', { class: 'nl' },
      h('div', { class: 'nl-crumb' }, h('a', {}, 'MyNETLAB'), h('i', {}, '>'), `CCDC Team ${Number(o.team)}`, h('i', {}, '>'), `Reservation ${o.scenario.reservation}`, h('i', {}, '>'), o.scenario.labName),
      this.nav, this.view);
    this.el.addEventListener('pointerdown', (e) => { if (this.menu && !e.target.closest('.nl-menu, .nl-btn')) this.closeMenu(); }, true);
    this.draw();
  }

  locked() { return !!this.o.locked?.(); }

  /** Is someone signed in at this console? */
  loggedIn(id) {
    const c = this.consoles.get(id);
    return !!c && (c.stage === 'shell' || c.stage === 'desktop');
  }

  console(id) {
    let c = this.consoles.get(id);
    if (!c) {
      const dev = this.vms.find((d) => d.id === id);
      const args = { state: this.o.state, dev, session: this.o.sessions[id], run: (l) => this.o.run(id, l), clock: this.o.clock, clockLabel: this.o.clockLabel, noteLine: (i, l) => this.o.noteLine?.(i, l), onBrowser: (u, id, line) => this.o.onBrowser(u, id, line) };
      c = dev.kind === 'pwsh' ? new WinConsole(args) : new TextConsole(args);
      this.consoles.set(id, c);
    }
    return c;
  }

  button(id, label, opts = {}) {
    const on = this.tab === id;
    return h('div', { class: 'nl-btn-wrap' },
      h('button', { type: 'button', class: `nl-btn${on ? ' on' : ''}`, 'data-nl': id, onclick: (e) => (opts.menu && (opts.content || e.target.closest('.nl-caret-hit')) ? this.toggleMenu(id) : this.show(id)) },
        h('i', { class: `nl-i nl-i-${opts.icon || 'vm'}` }), label, opts.menu ? h('span', { class: 'nl-caret-hit' }, h('b', { class: 'nl-caret' })) : null),
      this.menu === id ? this.menuEl(id, opts) : null);
  }

  menuEl(id, opts) {
    if (opts.content) {
      return h('div', { class: 'nl-menu' }, ['Lab Manual', 'Network Topology', 'Team Packet'].map((t) => h('button', { type: 'button', class: 'nl-mi', onclick: () => { this.closeMenu(); this.show('content'); } }, t)));
    }
    return h('div', { class: 'nl-menu', role: 'menu' }, MENU().map((m) => (m ? h('button', { type: 'button', class: `nl-mi${m.act === 'scale' && this.scale ? ' sel' : ''}${m.act === 'actual' && !this.scale ? ' sel' : ''}`, disabled: m.act ? null : true, 'data-act': m.act || '', onclick: () => this.act(id, m.act) }, m.label) : h('div', { class: 'nl-sep' }))));
  }

  toggleMenu(id) {
    if (this.menu === id) { this.closeMenu(); return; }
    if (id !== 'content') this.show(id, true);
    this.menu = id;
    this.drawNav();
  }

  closeMenu() { this.menu = null; this.drawNav(); }

  act(id, a) {
    this.menu = null;
    const c = this.locked() ? null : this.console(id);
    if (a === 'cad') c?.ctrlAltDel();
    if (a === 'on' || a === 'off') this.o.onPower(id, a === 'on');
    if (a === 'undock' && c) this.undock(id);
    if (a === 'actual' || a === 'scale') { this.scale = a === 'scale'; this.view.classList.toggle('nl-actual', !this.scale); }
    this.drawNav();
    this.drawView();
  }

  undock(id) {
    const holder = this.o.undock(id);
    if (!holder) return;
    this.undocked.add(id);
    holder.el.append(this.console(id).el);
  }

  dock(id) { this.undocked.delete(id); this.o.closeUndock(id); this.drawView(); }

  show(id, keepMenu) { this.tab = id; if (!keepMenu) this.menu = null; this.draw(); if (this.consoles.has(id)) this.consoles.get(id).focus(); }
  openVm(id) { this.show(id); return this.locked() ? null : this.console(id); }

  draw() { this.drawNav(); this.drawView(); }

  drawNav() {
    clear(this.nav).append(this.button('topology', 'Topology', { icon: 'map' }), this.button('content', 'Content', { icon: 'book', menu: true, content: true }), this.button('status', 'Status', { icon: 'line' }), ...this.vms.map((d) => this.button(d.id, d.tab, { menu: true })));
  }

  statusRows() {
    const clock = this.o.state.engine?.clock || 0;
    return this.vms.map((d) => {
      const ds = this.o.state.devState[d.id];
      const off = ds.live?.off || ds.poweredOff;
      const boot = ds.live && ds.live.offlineUntil > clock && !off;
      return { d, state: off ? 'off' : boot ? 'booting' : 'on' };
    });
  }

  drawView() {
    clear(this.view);
    if (this.tab === 'topology') { this.view.append(this.topology()); return; }
    if (this.tab === 'content') { this.view.append(this.content()); return; }
    if (this.tab === 'status') {
      this.statusBody = h('tbody', {});
      this.view.append(h('div', { class: 'nl-page' }, h('h3', {}, 'Virtual Machine Status'), h('table', { class: 'nl-tbl' }, h('thead', {}, h('tr', {}, ['Virtual Machine', 'Operating System', 'Power'].map((t) => h('th', {}, t)))), this.statusBody)));
      this.fillStatus();
      return;
    }
    if (this.locked()) { this.view.append(h('div', { class: 'nl-wait' }, 'This console opens at the drop flag.', h('br'), 'Submit the Welcome Inject in NISE first.')); return; }
    if (this.undocked.has(this.tab)) { this.view.append(h('div', { class: 'nl-wait' }, 'This virtual machine is undocked. ', h('button', { type: 'button', class: 'nl-link', onclick: () => this.dock(this.tab) }, 'Dock it here'))); return; }
    this.view.append(this.console(this.tab).el);
  }

  fillStatus() {
    if (!this.statusBody) return;
    clear(this.statusBody).append(...this.statusRows().map(({ d, state }) => h('tr', {}, h('td', {}, d.tab), h('td', {}, d.os), h('td', { class: `nl-pw-${state}` }, state === 'on' ? 'Running' : state === 'off' ? 'Powered off' : 'Starting'))));
  }

  topology() {
    const zone = (name, net, list) => h('div', { class: 'nl-zone' }, h('div', { class: 'nl-zone-h' }, `${name}  ${net}`), h('div', { class: 'nl-zone-b' }, list.map((d) => h('button', { type: 'button', class: 'nl-node', onclick: () => this.show(d.id) }, h('b', {}, d.tab), h('span', {}, d.ip)))));
    const byZone = (z) => this.vms.filter((d) => d.zone === z);
    const fw = this.vms.find((d) => d.kind === 'firewall');
    return h('div', { class: 'nl-topo' },
      h('div', { class: 'nl-core' }, `Core  172.31.${20 + Number(this.o.team)}.1/29`),
      h('div', { class: 'nl-link-v' }),
      fw ? h('button', { type: 'button', class: 'nl-node nl-fw', onclick: () => this.show(fw.id) }, h('b', {}, fw.tab), h('span', {}, 'e1/1 Public  e1/2 Internal  e1/3 Core  e1/4 User')) : null,
      h('div', { class: 'nl-link-v' }),
      h('div', { class: 'nl-zones' }, zone('Public', '172.20.241.0/24', byZone('Public')), zone('Internal', '172.20.240.0/24', byZone('Internal')), zone('User', '172.20.242.0/24', byZone('User'))));
  }

  content() {
    return h('div', { class: 'nl-page' }, h('h3', {}, this.o.scenario.labName),
      h('table', { class: 'nl-tbl' }, h('thead', {}, h('tr', {}, ['Virtual Machine', 'Operating System', 'Internal Address', 'Public NAT', 'Zone'].map((t) => h('th', {}, t)))),
        h('tbody', {}, this.vms.map((d) => h('tr', {}, h('td', {}, d.tab), h('td', {}, d.os), h('td', {}, d.ip), h('td', {}, d.nat || '-'), h('td', {}, d.zone || '-'))))));
  }

  refresh() {
    for (const c of this.consoles.values()) c.refresh();
    if (this.tab === 'status') this.fillStatus();
    const lk = this.locked();
    if (lk !== this.wasLocked) { this.wasLocked = lk; if (this.tab !== 'topology' && this.tab !== 'content' && this.tab !== 'status') this.drawView(); }
  }

  focus() { this.consoles.get(this.tab)?.focus(); }
  destroy() { for (const c of this.consoles.values()) c.desktop?.destroy?.(); }
}
