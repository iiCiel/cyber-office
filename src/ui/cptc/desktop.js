import { h, clear } from '../dom.js';
import { panelClock } from './helpers.js';
import './cptc.css';

// A very small Xfce-style desktop: top panel (applications menu, one button per open window, status area, clock),
// draggable windows with minimise / maximise / close, focus order. On narrow screens (< 720 px) every window is
// maximised, only the focused one shows, and the panel's window list scrolls sideways.
export class Desktop {
  /** @param {{ menuExtra?: {label:string, run:() => void}[] }} o */
  constructor(o = {}) {
    this.o = o;
    this.wins = new Map();
    this.z = 10;
    this.focusId = null;
    this.menuBtn = h('button', { type: 'button', class: 'kx-menubtn', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: (e) => { e.stopPropagation(); this.toggleMenu(); } },
      h('span', { class: 'kx-dragon', 'aria-hidden': 'true' }, 'K'), h('span', { class: 'kx-menutext' }, 'Applications'));
    this.menu = h('div', { class: 'kx-menu', role: 'menu', hidden: '' });
    this.tasks = h('div', { class: 'kx-tasks', role: 'toolbar', 'aria-label': 'Open windows' });
    this.status = h('div', { class: 'kx-status' });
    this.clock = h('span', { class: 'kx-pclock' }, panelClock());
    this.panel = h('div', { class: 'kx-panel', role: 'toolbar' }, this.menuBtn, h('span', { class: 'kx-psep' }), this.tasks, this.status,
      h('span', { class: 'kx-tray', 'aria-hidden': 'true' }, h('i', {}, '⇅'), h('i', {}, '♪'), h('i', {}, '⚡')), this.clock);
    this.icons = h('div', { class: 'kx-icons', 'aria-hidden': 'true' },
      ['File System', 'Home', 'Trash'].map((n, i) => h('div', { class: 'kx-icon' }, h('span', { class: `kx-icon-img k${i}` }), h('span', {}, n))));
    this.area = h('div', { class: 'kx-area', onpointerdown: (e) => { if (e.target === this.area || this.icons.contains(e.target)) { this.focusId = null; this.syncFocus(); this.closeMenu(); } } }, this.icons);
    this.el = h('div', { class: 'kx-desk' }, this.panel, this.menu, this.area);
    this.docDown = (e) => { if (!this.menu.hidden && !this.menu.contains(e.target) && !this.menuBtn.contains(e.target)) this.closeMenu(); };
    document.addEventListener('pointerdown', this.docDown);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.el);
    }
    this.tick = setInterval(() => { this.clock.textContent = panelClock(); }, 15000);
  }

  destroy() { clearInterval(this.tick); this.ro?.disconnect(); document.removeEventListener('pointerdown', this.docDown); }

  get narrow() { return this.el.classList.contains('kx-narrow'); }

  measure() {
    const w = this.el.clientWidth;
    if (!w) return;
    const narrow = w < 720;
    if (narrow !== this.narrow) { this.el.classList.toggle('kx-narrow', narrow); this.syncFocus(); }
    if (!narrow) for (const win of this.wins.values()) this.clampWin(win);
  }

  /** Register a window. geom(area) -> {x,y,w,h}. */
  addWindow({ id, title, glyph, body, geom, state = 'open', menuLabel }) {
    const win = { id, title, glyph, geom, state, max: false, menuLabel: menuLabel || title };
    win.titleEl = h('span', { class: 'kx-wtitle' }, title);
    win.btnMin = h('button', { type: 'button', class: 'kx-wb', 'aria-label': `Minimise ${title}`, onclick: (e) => { e.stopPropagation(); this.minimise(id); } }, '–');
    win.btnMax = h('button', { type: 'button', class: 'kx-wb', 'aria-label': `Maximise ${title}`, onclick: (e) => { e.stopPropagation(); this.toggleMax(id); } }, '□');
    win.btnClose = h('button', { type: 'button', class: 'kx-wb kx-wclose', 'aria-label': `Close ${title}`, onclick: (e) => { e.stopPropagation(); this.close(id); } }, '×');
    win.bar = h('div', { class: 'kx-wbar', ondblclick: () => this.toggleMax(id) }, h('span', { class: 'kx-wglyph' }, glyph || ''), win.titleEl, h('span', { class: 'kx-wbtns' }, win.btnMin, win.btnMax, win.btnClose));
    win.body = body;
    win.el = h('section', { class: 'kx-win', 'data-win': id, role: 'dialog', 'aria-label': title, onpointerdown: () => this.focus(id) }, win.bar, h('div', { class: 'kx-wbody' }, body));
    win.task = h('button', { type: 'button', class: 'kx-task', 'data-task': id, onclick: () => this.taskClick(id) }, h('span', { class: 'kx-wglyph' }, glyph || ''), h('span', { class: 'kx-tasktext' }, title));
    this.tasks.append(win.task);
    this.area.append(win.el);
    this.wins.set(id, win);
    this.bindDrag(win);
    this.place(win);
    this.rebuildMenu();
    this.apply(win);
    return win;
  }

  setTitle(id, title) { const w = this.wins.get(id); if (!w) return; w.titleEl.textContent = title; w.task.querySelector('.kx-tasktext').textContent = title; }

  areaSize() { return { w: this.area.clientWidth || 1000, h: this.area.clientHeight || 600 }; }

  place(win) {
    const g = win.geom(this.areaSize());
    win.x = g.x; win.y = g.y; win.w = g.w; win.h = g.h;
    this.clampWin(win);
  }

  clampWin(win) {
    const a = this.areaSize();
    win.w = Math.min(win.w, a.w); win.h = Math.min(win.h, a.h);
    win.x = Math.max(0, Math.min(win.x, a.w - win.w)); win.y = Math.max(0, Math.min(win.y, a.h - win.h));
    this.apply(win);
  }

  apply(win) {
    const s = win.el.style;
    s.left = `${win.x}px`; s.top = `${win.y}px`; s.width = `${win.w}px`; s.height = `${win.h}px`;
    win.el.classList.toggle('kx-max', win.max);
    win.el.hidden = win.state !== 'open';
    win.task.hidden = win.state === 'closed';
    win.task.classList.toggle('kx-task-min', win.state === 'min');
  }

  bindDrag(win) {
    win.bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || win.max || this.narrow || e.button !== 0) return;
      const sx = e.clientX - win.x, sy = e.clientY - win.y;
      const move = (ev) => { win.x = ev.clientX - sx; win.y = ev.clientY - sy; this.clampWin(win); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  syncFocus() {
    for (const w of this.wins.values()) {
      const on = w.id === this.focusId && w.state === 'open';
      w.el.classList.toggle('kx-focus', on);
      w.task.classList.toggle('kx-task-on', on);
      w.task.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  focus(id) {
    const w = this.wins.get(id);
    if (!w || w.state !== 'open') return;
    this.focusId = id;
    w.el.style.zIndex = String(++this.z);
    this.syncFocus();
    this.closeMenu();
  }

  open(id) {
    const w = this.wins.get(id);
    if (!w) return;
    const wasClosed = w.state === 'closed';
    w.state = 'open';
    if (wasClosed) this.place(w);
    this.apply(w);
    this.focus(id);
    w.onOpen?.();
  }

  minimise(id) {
    const w = this.wins.get(id);
    if (!w) return;
    w.state = 'min'; this.apply(w);
    if (this.focusId === id) {
      const next = [...this.wins.values()].filter((x) => x.state === 'open').sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
      this.focusId = next ? next.id : null;
      if (next) next.el.style.zIndex = String(++this.z);
    }
    this.syncFocus();
  }

  close(id) { const w = this.wins.get(id); if (!w) return; this.minimise(id); w.state = 'closed'; this.apply(w); }

  toggleMax(id) { const w = this.wins.get(id); if (!w) return; w.max = !w.max; this.apply(w); this.focus(id); }

  taskClick(id) {
    const w = this.wins.get(id);
    if (w.state === 'min') this.open(id);
    else if (this.focusId === id && !this.narrow) this.minimise(id);
    else this.focus(id);
  }

  rebuildMenu() {
    clear(this.menu);
    for (const w of this.wins.values()) {
      this.menu.append(h('button', { type: 'button', role: 'menuitem', class: 'kx-mi', 'data-launch': w.id, onclick: () => { this.closeMenu(); this.open(w.id); } }, h('span', { class: 'kx-wglyph' }, w.glyph || ''), w.menuLabel));
    }
    for (const x of this.o.menuExtra || []) this.menu.append(h('div', { class: 'kx-msep' }), h('button', { type: 'button', role: 'menuitem', class: 'kx-mi', onclick: () => { this.closeMenu(); x.run(); } }, x.label));
  }

  toggleMenu() { if (this.menu.hidden) { this.menu.hidden = false; this.menuBtn.setAttribute('aria-expanded', 'true'); } else this.closeMenu(); }
  closeMenu() { this.menu.hidden = true; this.menuBtn.setAttribute('aria-expanded', 'false'); }

  setStatus(...nodes) { clear(this.status).append(...nodes.filter(Boolean)); }
}
