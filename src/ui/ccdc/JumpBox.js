import { h, clear } from '../dom.js';
import './jumpbox.css';

// The team's jump-box workstation: a Windows 10 desktop with a taskbar, a small window manager and the frames
// real CCDC teams actually work in — browser windows (scoring engine, inject portal, Splunk, the pfSense
// webConfigurator), PuTTY sessions to the Linux boxes, Remote Desktop windows to the Windows boxes, and the
// team chat. JumpBox only draws the chrome; each window's body is an app object with `.el` (and optionally
// `.refresh()`, `.focus()`, `.destroy()`), created lazily the first time the window is opened.
//
// Window spec: { id, title, kind: 'browser'|'putty'|'rdp'|'app', icon: 'chrome'|'putty'|'rdp'|'chat'|...,
//                url?, tabLabel?, create: () => app, badge?: () => number }

const ICONS = {
  chrome: 'jb-ic-chrome', putty: 'jb-ic-putty', rdp: 'jb-ic-rdp', chat: 'jb-ic-chat', splunk: 'jb-ic-splunk',
  pf: 'jb-ic-pf', inject: 'jb-ic-inject', score: 'jb-ic-score', folder: 'jb-ic-folder',
};

export class JumpBox {
  /**
   * @param {object} o
   * @param {object[]} o.windows            window specs (see above)
   * @param {string} o.hostname             e.g. 'TEAM07-WS01'
   * @param {() => object} o.tray           { clock: 'mm:ss left', rank: '4/10', score: '1,234', low: bool }
   * @param {() => void} o.onEnd            "End round" (Start menu)
   * @param {() => void} o.onQuit
   * @param {boolean} [o.narrow]
   */
  constructor(o) {
    this.o = o;
    this.specs = new Map(o.windows.map((w) => [w.id, w]));
    this.wins = new Map(); // id -> { spec, app, el, min, max, z }
    this.z = 10;
    this.active = null;
    this.toasts = [];
    this.desk = h('div', { class: 'jb-desk' });
    this.taskApps = h('div', { class: 'jb-task-apps' });
    this.trayEl = h('div', { class: 'jb-tray' });
    this.toastBox = h('div', { class: 'jb-toasts', 'aria-live': 'polite' });
    this.startMenu = null;
    this.el = h('div', { class: 'jb' },
      this.desk,
      this.desktopIcons(),
      this.toastBox,
      h('div', { class: 'jb-taskbar', role: 'toolbar', 'aria-label': 'Taskbar' },
        h('button', { type: 'button', class: 'jb-start', 'aria-label': 'Start', onclick: (e) => { e.stopPropagation(); this.toggleStart(); } }, h('i', { class: 'jb-winlogo' })),
        h('div', { class: 'jb-search' }, h('i', { class: 'jb-search-ic' }), h('span', {}, 'Type here to search')),
        this.taskApps,
        this.trayEl));
    this.el.addEventListener('mousedown', (e) => { if (this.startMenu && !e.target.closest('.jb-startmenu, .jb-start')) this.closeStart(); });
    this.drawTaskbar();
    this.refreshTray();
  }

  desktopIcons() {
    return h('div', { class: 'jb-icons' },
      h('div', { class: 'jb-dicon' }, h('i', { class: 'jb-ic jb-ic-bin' }), h('span', {}, 'Recycle Bin')),
      [...this.specs.values()].filter((s) => s.desktop).map((s) =>
        h('button', { type: 'button', class: 'jb-dicon', ondblclick: () => this.open(s.id), onkeydown: (e) => { if (e.key === 'Enter') this.open(s.id); } },
          h('i', { class: `jb-ic ${ICONS[s.icon] || ''}` }), h('span', {}, s.desktop))));
  }

  // ---- windows -----------------------------------------------------------
  open(id) {
    const spec = this.specs.get(id);
    if (!spec) return null;
    let w = this.wins.get(id);
    if (!w) {
      const app = spec.create();
      w = { spec, app, min: false, max: true, z: 0 };
      w.el = this.frame(w);
      this.wins.set(id, w);
      this.desk.append(w.el);
    }
    w.min = false;
    w.el.hidden = false;
    this.focusWin(id);
    this.drawTaskbar();
    return w.app;
  }

  app(id) { return this.wins.get(id)?.app || null; }
  isOpen(id) { const w = this.wins.get(id); return !!w && !w.min; }

  focusWin(id) {
    const w = this.wins.get(id);
    if (!w) return;
    w.z = ++this.z;
    w.el.style.zIndex = String(w.z);
    this.active = id;
    for (const [k, x] of this.wins) x.el.classList.toggle('jb-inactive', k !== id);
    this.drawTaskbar();
    setTimeout(() => { if (this.active === id) w.app.focus?.(); }, 0);
  }

  minimize(id) {
    const w = this.wins.get(id);
    if (!w) return;
    w.min = true;
    w.el.hidden = true;
    const next = [...this.wins.entries()].filter(([, x]) => !x.min).sort((a, b) => b[1].z - a[1].z)[0];
    this.active = next ? next[0] : null;
    if (next) this.focusWin(next[0]);
    this.drawTaskbar();
  }

  close(id) {
    const w = this.wins.get(id);
    if (!w) return;
    // Closing keeps the session alive behind the scenes (like a minimised PuTTY); apps hold their own state.
    this.minimize(id);
  }

  toggleMax(id) {
    const w = this.wins.get(id);
    if (!w) return;
    w.max = !w.max;
    w.el.classList.toggle('jb-max', w.max);
    if (!w.max) {
      const r = this.desk.getBoundingClientRect();
      const s = this.el.offsetWidth ? r.width / this.el.offsetWidth : 1;
      const W = r.width / s; const H = r.height / s;
      Object.assign(w.el.style, { left: `${Math.round(W * 0.06)}px`, top: `${Math.round(H * 0.05)}px`, width: `${Math.round(W * 0.82)}px`, height: `${Math.round(H * 0.84)}px` });
    }
  }

  frame(w) {
    const { spec } = w;
    const ctl = h('div', { class: 'jb-ctl' },
      h('button', { type: 'button', class: 'jb-ctl-min', 'aria-label': 'Minimize', onclick: (e) => { e.stopPropagation(); this.minimize(spec.id); } }),
      h('button', { type: 'button', class: 'jb-ctl-max', 'aria-label': 'Maximize', onclick: (e) => { e.stopPropagation(); this.toggleMax(spec.id); } }),
      h('button', { type: 'button', class: 'jb-ctl-close', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); this.close(spec.id); } }));
    let titlebar;
    let body;
    if (spec.kind === 'browser') {
      titlebar = h('div', { class: 'jb-chrome-tabs' },
        h('div', { class: 'jb-chrome-tab' }, h('i', { class: `jb-fav ${ICONS[spec.icon] || ''}` }), h('span', {}, spec.tabLabel || spec.title), h('b', { 'aria-hidden': 'true' }, '×')),
        h('div', { class: 'jb-chrome-newtab', 'aria-hidden': 'true' }, '+'),
        h('div', { class: 'jb-grow' }), ctl);
      body = h('div', { class: 'jb-chrome' },
        h('div', { class: 'jb-chrome-bar' },
          h('span', { class: 'jb-nav' }, '←'), h('span', { class: 'jb-nav' }, '→'), h('span', { class: 'jb-nav' }, '⟳'),
          h('div', { class: 'jb-omni' }, h('span', { class: 'jb-lock' }, 'Not secure'), this.urlNode(spec.url || ''))),
        h('div', { class: 'jb-page' }, w.app.el));
    } else {
      titlebar = h('div', { class: `jb-title jb-title-${spec.kind}` },
        h('i', { class: `jb-tic ${ICONS[spec.icon] || ''}` }), h('span', { class: 'jb-title-text' }, spec.title), h('div', { class: 'jb-grow' }), ctl);
      body = h('div', { class: `jb-body jb-body-${spec.kind}` }, w.app.el);
    }
    const el = h('section', { class: `jb-win jb-k-${spec.kind} jb-max`, 'data-win': spec.id, role: 'dialog', 'aria-label': spec.title, onmousedown: () => { if (this.active !== spec.id) this.focusWin(spec.id); } }, titlebar, body);
    titlebar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.toggleMax(spec.id); });
    this.dragify(el, titlebar, w);
    return el;
  }

  // Chrome draws a self-signed https:// URL with the scheme struck through in red.
  urlNode(url) {
    const m = url.match(/^(https?):\/\/([^/]+)(.*)$/);
    if (!m) return h('span', { class: 'jb-url' }, url);
    return h('span', { class: 'jb-url' }, m[1] === 'https' ? h('s', { class: 'jb-scheme' }, 'https') : 'http', '://', h('span', { class: 'jb-host' }, m[2]), m[3]);
  }

  dragify(el, handle, w) {
    handle.addEventListener('pointerdown', (e) => {
      if (w.max || e.target.closest('button')) return;
      const s = this.el.getBoundingClientRect().width / (this.el.offsetWidth || 1);
      const sx = e.clientX; const sy = e.clientY;
      const ox = el.offsetLeft; const oy = el.offsetTop;
      const move = (ev) => { el.style.left = `${ox + (ev.clientX - sx) / s}px`; el.style.top = `${Math.max(0, oy + (ev.clientY - sy) / s)}px`; };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  // ---- taskbar / tray / start ------------------------------------------
  drawTaskbar() {
    clear(this.taskApps);
    for (const s of this.specs.values()) {
      if (!s.pinned && !this.wins.has(s.id)) continue;
      const w = this.wins.get(s.id);
      const n = s.badge ? s.badge() : 0;
      this.taskApps.append(h('button', {
        type: 'button', class: `jb-tb-app${w ? ' running' : ''}${this.active === s.id && w && !w.min ? ' active' : ''}`, title: s.title, 'data-open': s.id,
        onclick: () => { if (this.active === s.id && w && !w.min) this.minimize(s.id); else this.open(s.id); },
      }, h('i', { class: `jb-ic ${ICONS[s.icon] || ''}` }), h('span', { class: 'jb-tb-label' }, s.short || s.title), n ? h('b', { class: 'jb-badge' }, String(n)) : null));
    }
  }

  refreshTray() {
    const t = this.o.tray ? this.o.tray() : {};
    clear(this.trayEl).append(
      t.rank ? h('span', { class: 'jb-tray-score', title: 'Scoring engine standing' }, h('b', {}, `#${t.rank}`), ` ${t.score} pts`) : null,
      h('span', { class: 'jb-tray-ic', 'aria-hidden': 'true' }, '⌃'),
      h('span', { class: 'jb-tray-net', 'aria-hidden': 'true' }),
      h('span', { class: 'jb-tray-vol', 'aria-hidden': 'true' }),
      h('div', { class: `jb-clock${t.low ? ' low' : ''}`, role: 'timer', 'aria-label': 'Round time' }, h('span', {}, t.time || ''), h('span', {}, t.clock || '')),
      h('span', { class: 'jb-notif', 'aria-hidden': 'true' }));
  }

  refresh() {
    this.refreshTray();
    // Badges change with the game; redraw the cheap taskbar.
    this.drawTaskbar();
    for (const w of this.wins.values()) if (!w.min) { try { w.app.refresh?.(); } catch (err) { console.error(err); } }
  }

  toggleStart() { if (this.startMenu) this.closeStart(); else this.openStart(); }
  closeStart() { this.startMenu?.remove(); this.startMenu = null; }
  openStart() {
    const items = [...this.specs.values()];
    this.startMenu = h('div', { class: 'jb-startmenu', role: 'menu' },
      h('div', { class: 'jb-sm-rail' }, h('i', { class: 'jb-sm-user' }), h('i', { class: 'jb-sm-power' })),
      h('div', { class: 'jb-sm-list' },
        h('div', { class: 'jb-sm-head' }, this.o.hostname || 'Workstation'),
        items.map((s) => h('button', { type: 'button', class: 'jb-sm-item', role: 'menuitem', onclick: () => { this.closeStart(); this.open(s.id); } },
          h('i', { class: `jb-ic ${ICONS[s.icon] || ''}` }), s.title)),
        h('div', { class: 'jb-sm-sep' }),
        h('button', { type: 'button', class: 'jb-sm-item jb-sm-end', role: 'menuitem', onclick: () => { this.closeStart(); this.o.onEnd?.(); } }, h('i', { class: 'jb-ic jb-ic-flag' }), 'End the round (red team final sweep)'),
        h('button', { type: 'button', class: 'jb-sm-item', role: 'menuitem', onclick: () => { this.closeStart(); this.o.onQuit?.(); } }, h('i', { class: 'jb-ic jb-ic-power' }), 'Sign out (quit)')));
    this.el.append(this.startMenu);
  }

  // Windows 10 action-centre style toast, bottom right. Click opens a window.
  toast({ app, title, text, open, cls }) {
    const t = h('button', { type: 'button', class: `jb-toast ${cls || ''}`, onclick: () => { t.remove(); if (open) this.open(open); } },
      h('div', { class: 'jb-toast-app' }, app || 'Notification'), h('b', {}, title || ''), h('span', {}, text || ''));
    this.toastBox.append(t);
    while (this.toastBox.children.length > 3) this.toastBox.firstChild.remove();
    setTimeout(() => t.remove(), 7000);
  }

  destroy() { for (const w of this.wins.values()) { try { w.app.destroy?.(); } catch { /* ignore */ } } }
}
