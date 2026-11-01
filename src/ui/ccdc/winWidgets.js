import { h, clear } from '../dom.js';

// Small Windows-look building blocks shared by the apps in winApps.js: context menus, modal dialogs, message
// boxes, property-sheet tabs, list views and the MMC menu bar. DOM via h() only (textContent), classes `wd-*`.

const rootOf = (el) => el.closest('.wd') || document.body;

/** Context / drop-down menu. items: { label, onClick, disabled, sep, bold, shortcut }. */
export function contextMenu(anchor, x, y, items) {
  const root = rootOf(anchor);
  root.querySelectorAll(':scope > .wd-menu').forEach((m) => m.remove());
  const menu = h('div', { class: 'wd-menu', role: 'menu' });
  for (const it of items) {
    if (it.sep) { menu.append(h('div', { class: 'wd-menu-sep' })); continue; }
    menu.append(h('div', {
      class: `wd-menu-item${it.disabled ? ' off' : ''}${it.bold ? ' bold' : ''}`, role: 'menuitem', 'aria-disabled': it.disabled ? 'true' : null,
      onclick: (e) => { e.stopPropagation(); if (it.disabled) return; close(); it.onClick?.(); },
    }, h('span', { class: 'wd-menu-l' }, it.label), it.shortcut ? h('span', { class: 'wd-menu-k' }, it.shortcut) : (it.sub ? h('span', { class: 'wd-menu-k' }, '▸') : null)));
  }
  root.append(menu);
  const rr = root.getBoundingClientRect();
  const mw = menu.offsetWidth; const mh = menu.offsetHeight;
  menu.style.left = `${Math.max(0, Math.min(x - rr.left, rr.width - mw - 2))}px`;
  menu.style.top = `${Math.max(0, Math.min(y - rr.top, rr.height - mh - 2))}px`;
  const onDown = (e) => { if (!menu.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { menu.remove(); document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); }
  setTimeout(() => { document.addEventListener('pointerdown', onDown, true); document.addEventListener('keydown', onKey, true); }, 0);
  return close;
}

/** Context menu at the pointer for an event. */
export const menuAt = (e, items) => { e.preventDefault(); e.stopPropagation(); return contextMenu(e.currentTarget || e.target, e.clientX, e.clientY, items); };

/**
 * Modal dialog inside `host` (a position:relative element, usually the app). buttons: [{label, primary, onClick}];
 * onClick returning false keeps the dialog open. Returns { el, close, body }.
 */
export function dialog(host, { title, body, buttons = [], width = 380, icon = null, onClose }) {
  const wrap = h('div', { class: 'wd-dlgwrap' });
  const close = () => { wrap.remove(); onClose?.(); host.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => {
    const wraps = host.querySelectorAll(':scope > .wd-dlgwrap');
    if (wraps[wraps.length - 1] !== wrap) return; // only the top-most dialog reacts
    if (e.key === 'Escape' && wrap.isConnected) { e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && wrap.isConnected && !/TEXTAREA|BUTTON|SELECT/.test(e.target.tagName)) {
      const p = buttons.find((b) => b.primary);
      if (p) { e.preventDefault(); e.stopPropagation(); if (p.onClick?.() !== false) close(); }
    }
  };
  const btns = buttons.map((b) => h('button', {
    type: 'button', class: `wd-btn${b.primary ? ' primary' : ''}`, disabled: b.disabled,
    onclick: () => { if (b.onClick?.() !== false) close(); },
  }, b.label));
  const dlg = h('div', { class: 'wd-dlg', role: 'dialog', 'aria-label': title, style: { width: `${width}px` } },
    h('div', { class: 'wd-dlg-title' }, h('span', {}, title), h('button', { type: 'button', class: 'wd-dlg-x', 'aria-label': 'Close', onclick: close }, h('i', { class: 'wd-g wd-g-close' }))),
    h('div', { class: 'wd-dlg-body' }, icon ? h('div', { class: `wd-mbicon wd-mb-${icon}` }) : null, h('div', { class: 'wd-dlg-content' }, body)),
    btns.length ? h('div', { class: 'wd-dlg-foot' }, btns) : null);
  wrap.append(dlg);
  host.append(wrap);
  host.addEventListener('keydown', onKey, true);
  (btns.find((b) => b.classList.contains('primary')) || btns[0])?.focus();
  return { el: wrap, close, body: dlg.querySelector('.wd-dlg-content') };
}

/** Windows message box. kind: 'info' | 'warn' | 'error' | 'question'. */
export function msgBox(host, { title, text, kind = 'info', yes, no, ok }) {
  const buttons = yes
    ? [{ label: 'Yes', primary: true, onClick: yes }, { label: 'No', onClick: no }]
    : [{ label: 'OK', primary: true, onClick: ok }];
  return dialog(host, { title, body: h('div', { class: 'wd-mbtext' }, text), buttons, width: 360, icon: kind });
}

/** Property-sheet tab strip. */
export function tabStrip(names, active, onPick) {
  return h('div', { class: 'wd-tabs', role: 'tablist' }, names.map((n) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': n === active ? 'true' : 'false', class: `wd-tab${n === active ? ' on' : ''}`, onclick: () => onPick(n),
  }, n)));
}

/**
 * Report-style list view. cols: [{k,label,w,render?}]; rows: objects with `key`. opts: sel, onSel(key), onOpen(row),
 * onCtx(e,row), icon(row) -> class name for the first column, cls(row).
 */
export function listView(cols, rows, opts = {}) {
  const head = h('tr', {}, cols.map((c) => h('th', { style: c.w ? { width: `${c.w}px` } : null }, c.label)));
  const body = rows.map((r) => {
    // Selection is switched in place (no re-render) so a double-click still lands on the same row element.
    const pick = (e) => { const t = e.currentTarget; t.parentNode.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); t.classList.add('on'); opts.onSel?.(r.key, r); };
    const tr = h('tr', {
      class: `${opts.sel === r.key ? 'on' : ''} ${opts.cls?.(r) || ''}`, tabindex: '0', dataset: { key: r.key },
      onclick: pick,
      ondblclick: () => opts.onOpen?.(r),
      oncontextmenu: (e) => { pick(e); opts.onCtx?.(e, r); },
      onkeydown: (e) => { if (e.key === 'Enter') opts.onOpen?.(r); },
    }, cols.map((c, i) => h('td', {}, i === 0 && opts.icon ? h('i', { class: `wd-ic ${opts.icon(r)}` }) : null, c.render ? c.render(r) : String(r[c.k] ?? ''))));
    return tr;
  });
  return h('table', { class: 'wd-lv' }, h('thead', {}, head), h('tbody', {}, body));
}

/** MMC-style menu bar. menus: [{label, items: () => [...]}] */
export function menuBar(menus) {
  return h('div', { class: 'wd-mbar', role: 'menubar' }, menus.map((m) => h('span', {
    class: 'wd-mbar-i', role: 'menuitem', tabindex: '0',
    onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu(e.currentTarget, r.left, r.bottom, m.items()); },
  }, m.label)));
}

/** A row of flat toolbar buttons from icon-class names; null makes a separator. */
export function toolbar(buttons) {
  return h('div', { class: 'wd-tbar' }, buttons.map((b) => (b
    ? h('button', { type: 'button', class: 'wd-tb', title: b.title, 'aria-label': b.title, disabled: b.disabled, onclick: b.onClick }, h('i', { class: `wd-ic ${b.icon}` }))
    : h('span', { class: 'wd-tb-sep' }))));
}

export const field = (label, value, opts = {}) => h('label', { class: 'wd-field' }, h('span', {}, label), h('input', { type: 'text', value: value ?? '', readonly: opts.readonly !== false, class: 'wd-input' }));

export const check = (label, checked, onChange, disabled) => h('label', { class: `wd-check${disabled ? ' off' : ''}` }, h('input', { type: 'checkbox', checked: !!checked, disabled, onchange: (e) => onChange?.(e.target.checked) }), h('span', {}, label));

export { h, clear };
