import { h, clear } from '../dom.js';
import { TermView } from './TermView.js';
import { installWinIcons } from './winIcons.js';
import { contextMenu, dialog } from './winWidgets.js';
import { createAduc, createServices, createTasks, createLusr, createExplorer } from './winApps.js';
import { createEvents, createServerManager } from './winApps2.js';
import { initHostState } from '../../game/hostState.js';
import { adModel, isAdLine, hasAdGui, isServerOs, securityEvents, systemEvents, applicationEvents, ROUND_START, fmtClock, cmd } from '../../game/winGuiMap.js';
import './windesktop.css';

// A Windows Server / Windows 10 desktop as seen through a Remote Desktop (mstsc) session: the connection bar on
// top, wallpaper, desktop icons, a taskbar with a working Start menu and a small window manager. Apps:
// Windows PowerShell (TermView 'pwsh'), Server Manager, ADUC, Services, Task Scheduler, Event Viewer, Local Users
// and Groups, File Explorer. Every admin action a GUI performs is sent through `run(line)` as the equivalent
// PowerShell command (src/game/winGuiMap.js `cmd`); the GUIs never change state themselves.
//
//   new WinDesktop({ state, dev, run: (line) => ({lines, effects}), termBuffer, termHistory, clock: () => sec })
//   .el  .refresh()  .openApp(id)  .destroy()

const PS_WORDS = ['Get-ADUser', 'Get-ADGroupMember', 'Get-ADGroup', 'Get-ADComputer', 'Disable-ADAccount', 'Enable-ADAccount', 'Remove-ADGroupMember', 'Add-ADGroupMember', 'Get-Service', 'Stop-Service', 'Start-Service', 'Set-Service',
  'Get-ScheduledTask', 'Unregister-ScheduledTask', 'Disable-ScheduledTask', 'Get-LocalUser', 'Get-LocalGroupMember', 'Disable-LocalUser', 'Remove-LocalUser', 'Remove-LocalGroupMember', 'Get-WinEvent', 'Get-SmbServerConfiguration',
  'Set-SmbServerConfiguration', 'Get-Process', 'Get-ChildItem', 'Get-Content', 'Select-String', 'Select-Object', 'Where-Object', 'Format-Table', 'Get-Date', 'Get-Help', 'Clear-Host', 'Set-Location'];

const APPS = {
  ps: { title: 'Administrator: Windows PowerShell', icon: 'i-ps', size: [760, 440] },
  sm: { title: 'Server Manager', icon: 'i-sm', size: [960, 580] },
  aduc: { title: 'Active Directory Users and Computers', icon: 'i-aduc', size: [980, 600] },
  services: { title: 'Services', icon: 'i-gear', size: [1040, 520] },
  tasks: { title: 'Task Scheduler', icon: 'i-task', size: [1040, 620] },
  events: { title: 'Event Viewer', icon: 'i-evt', size: [1040, 580] },
  lusr: { title: 'lusrmgr - [Local Users and Groups (Local)]', icon: 'i-lusr', size: [820, 460] },
  explorer: { title: 'This PC', icon: 'i-explorer', size: [760, 460] },
};

export class WinDesktop {
  constructor({ state, dev, run, termBuffer, termHistory, clock }) {
    installWinIcons();
    this.state = state; this.dev = dev; this.runOwner = run; this.clock = clock || (() => 0);
    this.ds = state.devState[dev.id];
    this.buffer = termBuffer || []; this.history = termHistory || [];
    this.host = String(dev.host || dev.id).toUpperCase();
    this.isServer = isServerOs(dev);
    this.isDc = hasAdGui(dev);
    this.initialLive = initHostState(dev);
    const hist = this.ds?.history || [];
    const now = this.clock();
    this.cmdLog = hist.map((line, i) => ({ line, t: Math.max(0, now - (hist.length - i) * 6) }));
    this.wins = []; this.z = 10; this.cascade = 0; this.destroyed = false;
    this.cache = new Map();

    this.desk = h('div', { class: 'wd-desk', oncontextmenu: (e) => this.deskMenu(e) });
    this.taskApps = h('div', { class: 'wd-task-apps' });
    this.clockEl = h('div', { class: 'wd-clock' });
    this.start = null;
    this.root = h('div', { class: `wd ${this.isServer ? 'wd-srv' : 'wd-w10'}`, tabindex: '-1' });
    this.el = this.root;
    this.root.addEventListener('keydown', (e) => e.stopPropagation()); // keep Phaser's global key handling out
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('pointerdown', (e) => { if (this.start && !e.target.closest('.wd-start, .wd-startbtn')) this.closeStart(); }, true);
    this.build();
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    this.ro?.observe(this.root);
    this.refresh();
    if (this.isServer) this.openApp('sm'); // Server Manager opens by itself at sign-in on a server
  }

  // ---- context handed to the apps ----------------------------------------------------------------------
  appCtx(win) {
    const self = this;
    return {
      dev: this.dev, host: this.host, isServer: this.isServer,
      live: () => this.ds.live,
      model: () => { const k = `ad:${this.cmdLog.length}`; if (!this.cache.has(k)) { this.cache.set(k, adModel(this.dev.ctx.dir, this.cmdLog.map((c) => c.line).filter(isAdLine))); } return this.cache.get(k); },
      events: (log) => this.events(log),
      act: (line) => this.act(line),
      openApp: (id) => this.openApp(id),
      closeWin: () => win && this.closeWin(win),
      nowMs: () => ROUND_START + this.clock() * 1000,
      get self() { return self; },
    };
  }
  events(log) {
    const k = `ev:${log}:${this.cmdLog.length}`;
    if (!this.cache.has(k)) {
      const dir = this.dev.ctx?.dir;
      const o = { initialLive: this.initialLive, cmdLog: this.cmdLog, dir };
      this.cache.set(k, log === 'Security' ? securityEvents(this.dev, o) : log === 'System' ? systemEvents(this.dev, o) : applicationEvents(this.dev));
    }
    return this.cache.get(k);
  }
  /** Run one PowerShell line through the lab (grading identical to typing it) and refresh every window. */
  act(line) {
    this.cmdLog.push({ line, t: this.clock() });
    this.cache.clear();
    let res;
    try { res = this.runOwner(line); } catch (err) { res = { lines: [{ cls: 'err', text: String(err?.message || err) }], effects: {} }; }
    queueMicrotask(() => { if (!this.destroyed) this.refreshApps(true); });
    return res;
  }

  // ---- building the shell ---------------------------------------------------------------------------------
  build() {
    const year = /2022/.test(this.dev.os || '') ? ['Windows Server 2022 Standard Evaluation', 'Build 20348.fe_release.210507-1500'] : ['Windows Server 2019 Standard Evaluation', 'Build 17763.rs5_release.180914-1434'];
    const mark = this.isServer ? h('div', { class: 'wd-watermark' }, h('div', {}, year[0]), h('div', {}, 'Windows License is valid for 180 days'), h('div', {}, year[1])) : h('div', { class: 'wd-watermark big' }, h('div', { class: 'l1' }, 'Activate Windows'), h('div', {}, 'Go to Settings to activate Windows.'));
    this.icons = h('div', { class: 'wd-icons' }, this.deskIcon('Recycle Bin', 'i-recycle', () => this.openApp('explorer')));
    this.winLayer = h('div', { class: 'wd-winlayer' });
    this.desk.append(h('div', { class: 'wd-wallpaper' }), this.icons, this.winLayer, mark);
    this.rdp = h('div', { class: 'wd-rdp', role: 'toolbar', 'aria-label': 'Remote Desktop connection bar' },
      h('button', { type: 'button', class: 'wd-rdp-pin on', title: 'Click to unpin the connection bar', onclick: (e) => e.currentTarget.classList.toggle('on') }, h('i', {})),
      h('span', { class: 'wd-rdp-host' }, this.dev.ip || this.host),
      h('span', { class: 'wd-rdp-btns' }, h('button', { type: 'button', title: 'Minimize', 'aria-label': 'Minimize' }, h('i', { class: 'wd-g wd-g-min' })), h('button', { type: 'button', title: 'Restore Down', 'aria-label': 'Restore Down' }, h('i', { class: 'wd-g wd-g-restore' })), h('button', { type: 'button', title: 'Close', 'aria-label': 'Close', class: 'x' }, h('i', { class: 'wd-g wd-g-close' }))));
    this.startBtn = h('button', { type: 'button', class: 'wd-startbtn', 'aria-label': 'Start', title: 'Start', onclick: () => (this.start ? this.closeStart() : this.openStart()) }, h('i', { class: 'wd-winlogo' }));
    const search = h('div', { class: 'wd-search', onclick: () => this.openStart() }, h('i', { class: 'wd-mag' }), h('span', {}, 'Type here to search'));
    this.taskbar = h('div', { class: 'wd-taskbar' },
      this.startBtn, search, h('button', { type: 'button', class: 'wd-tvbtn', 'aria-label': 'Task View' }, h('i', { class: 'wd-taskview' })), this.taskApps,
      h('div', { class: 'wd-tray' }, h('span', { class: 'wd-tray-i chev' }), h('span', { class: 'wd-tray-i net' }), h('span', { class: 'wd-tray-i vol' }), this.clockEl, h('span', { class: 'wd-showdesk', title: 'Show desktop', onclick: () => this.minimiseAll() })));
    this.root.append(this.rdp, this.desk, this.taskbar);
  }
  deskIcon(label, icon, open) {
    return h('div', { class: 'wd-dicon', tabindex: '0', ondblclick: open, onclick: (e) => { this.icons.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel')); e.currentTarget.classList.add('sel'); }, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
      h('i', { class: `wd-ic-xl ${icon}` }), h('span', {}, label));
  }
  deskMenu(e) {
    if (e.target.closest('.wd-win')) return;
    e.preventDefault();
    const d = (label, extra = {}) => ({ label, disabled: true, ...extra });
    contextMenu(this.root, e.clientX, e.clientY, [d('View', { sub: true }), d('Sort by', { sub: true }), { label: 'Refresh', onClick: () => this.refreshApps(true) }, { sep: true }, d('Paste'), d('Paste shortcut'), { sep: true }, d('New', { sub: true }), { sep: true }, d('Display settings'), d('Personalize')]);
  }

  // ---- window manager -----------------------------------------------------------------------------------
  available(id) {
    if (id === 'aduc') return this.isDc;
    if (id === 'sm') return this.isServer;
    if (id === 'lusr') return !this.isDc;
    return !!APPS[id];
  }
  openApp(id) {
    if (this.destroyed || !this.available(id)) return null;
    let win = this.wins.find((w) => w.id === id);
    if (win) { this.restore(win); return win; }
    const meta = APPS[id];
    win = { id, meta, min: false, max: false, app: null };
    const ctx = this.appCtx(win);
    if (id === 'ps') win.app = this.makePs();
    else if (id === 'sm') win.app = createServerManager(ctx);
    else if (id === 'aduc') win.app = createAduc(ctx);
    else if (id === 'services') win.app = createServices(ctx);
    else if (id === 'tasks') win.app = createTasks(ctx);
    else if (id === 'events') win.app = createEvents(ctx);
    else if (id === 'lusr') win.app = createLusr(ctx);
    else win.app = createExplorer(ctx);
    const [w, hh] = meta.size;
    win.title = h('span', { class: 'wd-wtitle' }, meta.title);
    win.el = h('div', { class: 'wd-win', role: 'dialog', 'aria-label': meta.title, onpointerdown: () => this.focus(win) },
      h('div', { class: 'wd-wbar', ondblclick: (e) => { if (!e.target.closest('button')) this.toggleMax(win); } },
        h('i', { class: `wd-wico ic ${meta.icon}` }), win.title,
        h('span', { class: 'wd-wbtns' },
          h('button', { type: 'button', class: 'wd-wb', title: 'Minimize', 'aria-label': 'Minimize', onclick: (e) => { e.stopPropagation(); this.minimise(win); } }, h('i', { class: 'wd-g wd-g-min' })),
          h('button', { type: 'button', class: 'wd-wb max', title: 'Maximize', 'aria-label': 'Maximize', onclick: (e) => { e.stopPropagation(); this.toggleMax(win); } }, h('i', { class: 'wd-g wd-g-max' })),
          h('button', { type: 'button', class: 'wd-wb close', title: 'Close', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); this.closeWin(win); } }, h('i', { class: 'wd-g wd-g-close' })))),
      h('div', { class: 'wd-wbody' }, win.app.el));
    win.el.querySelector('.wd-wbar').addEventListener('pointerdown', (e) => this.dragStart(e, win));
    const dw = this.desk.clientWidth || 1000; const dh = this.desk.clientHeight || 600;
    const ww = Math.min(w, dw - 12); const wh = Math.min(hh, dh - 12);
    const off = (this.cascade++ % 6) * 26;
    Object.assign(win.el.style, { width: `${ww}px`, height: `${wh}px`, left: `${Math.max(0, Math.min(dw - ww, 92 + off))}px`, top: `${Math.max(0, Math.min(dh - wh, 30 + off))}px` });
    this.winLayer.append(win.el);
    this.wins.push(win);
    this.focus(win);
    this.renderTaskbar();
    return win;
  }
  makePs() {
    if (!this.buffer.length) {
      this.buffer.push(...['Windows PowerShell', 'Copyright (C) Microsoft Corporation. All rights reserved.', ''].map((text) => ({ text })));
    }
    const tv = new TermView({
      theme: 'pwsh', label: 'Windows PowerShell',
      prompt: () => `PS ${this.ds.cwd || 'C:\\Users\\Administrator'}>`,
      run: (line) => { this.cmdLog.push({ line, t: this.clock() }); this.cache.clear(); const r = this.runOwner(line); queueMicrotask(() => { if (!this.destroyed) this.refreshApps(true, 'ps'); }); return r; },
      buffer: this.buffer, history: this.history, complete: PS_WORDS,
    });
    return { el: tv.el, tv, focus: () => tv.focus(), refresh() {} };
  }
  focus(win) {
    // Called with no window by the jump box when the RDP window gains focus: focus the top window's content.
    if (!win) { const top = this.active || this.wins[this.wins.length - 1]; top?.app?.focus?.(); return; }
    if (win.min) return;
    this.wins.forEach((w) => w.el.classList.toggle('active', w === win));
    win.el.style.zIndex = String(++this.z);
    this.active = win;
    this.renderTaskbar();
    if (win.app.focus && !win.focusing) { win.focusing = true; setTimeout(() => { win.focusing = false; if (this.active === win) win.app.focus(); }, 0); }
  }
  restore(win) {
    if (win.min) { win.min = false; win.el.classList.remove('min'); }
    this.focus(win);
  }
  minimise(win) {
    win.min = true; win.el.classList.add('min'); win.el.classList.remove('active');
    if (this.active === win) this.active = null;
    const next = [...this.wins].filter((w) => !w.min).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
    if (next) this.focus(next); else this.renderTaskbar();
  }
  minimiseAll() { this.wins.forEach((w) => { w.min = true; w.el.classList.add('min'); w.el.classList.remove('active'); }); this.active = null; this.renderTaskbar(); }
  toggleMax(win) {
    win.max = !win.max;
    win.el.classList.toggle('max', win.max);
    win.el.querySelector('.wd-wb.max').title = win.max ? 'Restore Down' : 'Maximize';
    win.el.querySelector('.wd-wb.max .wd-g').className = `wd-g ${win.max ? 'wd-g-restore' : 'wd-g-max'}`;
  }
  closeWin(win) {
    win.el.remove();
    this.wins = this.wins.filter((w) => w !== win);
    if (this.active === win) { this.active = null; const next = [...this.wins].filter((w) => !w.min).pop(); if (next) this.focus(next); }
    this.renderTaskbar();
  }
  dragStart(e, win) {
    if (e.target.closest('button') || win.max || this.root.classList.contains('narrow') || e.button !== 0) return;
    const el = win.el; const startX = e.clientX; const startY = e.clientY; const l0 = el.offsetLeft; const t0 = el.offsetTop;
    const bar = e.currentTarget;
    bar.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      const dw = this.desk.clientWidth; const dh = this.desk.clientHeight;
      el.style.left = `${Math.max(-el.offsetWidth + 80, Math.min(dw - 60, l0 + ev.clientX - startX))}px`;
      el.style.top = `${Math.max(0, Math.min(dh - 30, t0 + ev.clientY - startY))}px`;
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  }
  layout() {
    const narrow = this.root.clientWidth > 0 && this.root.clientWidth < 700;
    this.root.classList.toggle('narrow', narrow);
  }

  // ---- taskbar / start ------------------------------------------------------------------------------------
  renderTaskbar() {
    const pinned = ['explorer', 'ps', ...(this.isServer ? ['sm'] : [])];
    const order = [...pinned, ...this.wins.map((w) => w.id).filter((id) => !pinned.includes(id))];
    clear(this.taskApps);
    for (const id of order) {
      if (!this.available(id)) continue;
      const win = this.wins.find((w) => w.id === id);
      this.taskApps.append(h('button', {
        type: 'button', class: `wd-tbtn${win ? ' run' : ''}${win && win === this.active && !win.min ? ' on' : ''}`, title: APPS[id].title.replace(/^Administrator: /, ''), 'aria-label': APPS[id].title,
        onclick: () => { if (!win) this.openApp(id); else if (win === this.active && !win.min) this.minimise(win); else this.restore(win); },
      }, h('i', { class: `wd-ic-tb ${APPS[id].icon}` })));
    }
  }
  openStart() {
    this.closeStart();
    const item = (id, label, icon) => (this.available(id) ? h('div', { class: 'wd-start-app', tabindex: '0', onclick: () => { this.closeStart(); this.openApp(id); }, onkeydown: (e) => { if (e.key === 'Enter') { this.closeStart(); this.openApp(id); } } }, h('i', { class: `wd-ic ${icon}` }), h('span', {}, label)) : null);
    const letter = (c) => h('div', { class: 'wd-start-letter' }, c);
    const tile = (id, label, icon, wide) => h('div', { class: `wd-start-tile${wide ? ' wide' : ''}${this.available(id) ? '' : ' off'}`, tabindex: '0', onclick: () => { if (this.available(id)) { this.closeStart(); this.openApp(id); } } }, h('i', { class: `wd-ic-xl ${icon}` }), h('span', {}, label));
    const power = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu(this.root, r.right + 4, r.top - 4, [{ label: 'Disconnect', onClick: () => this.closeStart() }, { label: 'Restart', onClick: () => this.powerPrompt('Restart') }, { label: 'Shut down', onClick: () => this.powerPrompt('Shut down') }]);
    };
    this.start = h('div', { class: 'wd-start', role: 'menu', 'aria-label': 'Start' },
      h('div', { class: 'wd-start-rail' }, h('button', { type: 'button', class: 'wd-rail-i menu', 'aria-label': 'Expand' }), h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'wd-rail-i user', 'aria-label': 'Administrator' }), h('button', { type: 'button', class: 'wd-rail-i gear', 'aria-label': 'Settings' }), h('button', { type: 'button', class: 'wd-rail-i pwr', 'aria-label': 'Power', onclick: power })),
      h('div', { class: 'wd-start-list' }, letter('A'), item('aduc', 'Active Directory Users and Computers', 'i-aduc'), letter('E'), item('events', 'Event Viewer', 'i-evt'), letter('F'), item('explorer', 'File Explorer', 'i-explorer'),
        letter('L'), item('lusr', 'Local Users and Groups', 'i-lusr'), letter('S'), item('sm', 'Server Manager', 'i-sm'), item('services', 'Services', 'i-gear'), letter('T'), item('tasks', 'Task Scheduler', 'i-task'), letter('W'), item('ps', 'Windows PowerShell', 'i-ps')),
      h('div', { class: 'wd-start-tiles' }, h('div', { class: 'wd-start-th' }, this.isServer ? 'Windows Server' : 'Productivity'), h('div', { class: 'wd-start-grid' },
        tile('sm', 'Server Manager', 'i-sm', true), tile('ps', 'Windows PowerShell', 'i-ps'), tile('explorer', 'File Explorer', 'i-explorer'), tile('events', 'Event Viewer', 'i-evt'), tile('services', 'Services', 'i-gear'))));
    this.root.append(this.start);
    this.startBtn.classList.add('on');
  }
  closeStart() { this.start?.remove(); this.start = null; this.startBtn?.classList.remove('on'); }
  powerPrompt(kind) {
    this.closeStart();
    dialog(this.root, {
      title: kind === 'Restart' ? 'Shut Down Windows' : 'Shut Down Windows', width: 380, icon: 'question',
      body: h('div', { class: 'wd-mbtext' }, `What do you want the computer to do?\n\n${kind}\n\nThis will end your remote session and take every service on ${this.host} offline until it is back.`),
      buttons: [{
        label: 'OK', primary: true,
        onClick: () => {
          this.act(kind === 'Restart' ? cmd.restart() : cmd.shutdown());
          const ov = h('div', { class: 'wd-restart' }, h('div', { class: 'spin' }), h('div', {}, kind === 'Restart' ? 'Restarting' : 'Shutting down'));
          this.root.append(ov);
          setTimeout(() => ov.remove(), 3500);
        },
      }, { label: 'Cancel' }],
    });
  }

  // ---- per-second refresh ---------------------------------------------------------------------------------
  refresh() {
    if (this.destroyed) return;
    this.layout();
    const c = fmtClock(this.clock());
    if (this._clk !== c.time + c.date) { this._clk = c.time + c.date; clear(this.clockEl).append(h('div', {}, c.time), h('div', {}, c.date)); }
    this.refreshApps(false);
  }
  refreshApps(force, except) {
    for (const w of this.wins) {
      if (w.id === except || w.id === 'ps') continue;
      try { w.app.refresh?.(force); } catch (err) { /* a broken refresh must never kill the session */ }
    }
  }
  destroy() {
    this.destroyed = true;
    this.ro?.disconnect();
    this.closeStart();
    this.wins.forEach((w) => w.el.remove());
    this.wins = [];
    this.root.remove();
  }
}
