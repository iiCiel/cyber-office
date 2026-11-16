// Real terminal editors for the consoles. nano and vi behave the way they do on the boxes, because on the day there is
// no other way to change a file by hand: nano's ^O / ^X flow and vi's modes, with the keys people forget under pressure.
// A browser keeps Ctrl+W for itself, so nano's search is also on F6, as it is in real nano.
import { h } from '../dom.js';
import './termedit.css';

const NANO_KEYS = [['^G', 'Get Help'], ['^O', 'WriteOut'], ['^R', 'Read File'], ['^Y', 'Prev Page'], ['^K', 'Cut Text'], ['^C', 'Cur Pos'], ['^X', 'Exit'], ['^J', 'Justify'], ['^W', 'Where Is'], ['^V', 'Next Page'], ['^U', 'UnCut Text'], ['^T', 'To Spell']];

export class TermEditor {
  /** @param {{tool:'nano'|'vi', path:string, text:string, isNew:boolean, onSave:(t:string)=>string|null, onExit:()=>void}} o  onSave returns an error or null */
  constructor(o) {
    this.o = o;
    this.saved = o.text;
    this.modified = false;
    this.vi = o.tool !== 'nano';
    this.mode = 'normal'; this.pendingKey = ''; this.undo = []; this.reg = ''; this.pos = 0; this.lastFind = '';
    this.ta = h('textarea', { class: 'te-text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': `${o.tool} editor`, oninput: () => { this.modified = this.ta.value !== this.saved; this.drawHead(); }, onkeydown: (e) => this.key(e), onkeyup: (e) => e.stopPropagation() });
    this.ta.value = o.text;
    this.head = h('div', { class: 'te-head' });
    this.status = h('div', { class: 'te-status' });
    this.promptLabel = h('span', { class: 'te-plabel' });
    this.promptInput = h('input', { class: 'te-pinput', spellcheck: 'false', 'aria-label': 'Editor prompt', onkeydown: (e) => this.promptKey(e), onkeyup: (e) => e.stopPropagation() });
    this.promptBox = h('div', { class: 'te-prompt', hidden: true }, this.promptLabel, this.promptInput);
    this.keys = h('div', { class: 'te-keys' }, this.vi ? null : NANO_KEYS.map(([k, t]) => h('span', {}, h('b', {}, k), ` ${t}`)));
    this.el = h('div', { class: `te ${this.vi ? 'te-vi' : 'te-nano'}`, 'data-editor': o.tool }, this.vi ? null : this.head, this.ta, this.promptBox, this.status, this.keys);
    this.drawHead();
    if (this.vi) { this.setMode('normal'); this.msg(`"${o.path}"${o.isNew ? ' [New File]' : ` ${this.lines().length}L, ${o.text.length}C`}`); } else this.msg(o.isNew ? '[ New File ]' : `[ Read ${this.lines().length} lines ]`);
    setTimeout(() => this.focus(), 0);
  }

  focus() { this.ta.focus(); if (this.vi && this.mode === 'normal') this.paintCursor(); }
  lines() { return this.ta.value.replace(/\n$/, '').split('\n'); }
  msg(t) { this.status.textContent = t; }
  drawHead() { this.head.textContent = `  GNU nano 2.2.6          File: ${this.o.path}${this.modified ? '          Modified' : ''}`; }

  save() {
    const err = this.o.onSave(this.ta.value);
    if (err) return err;
    this.saved = this.ta.value;
    this.modified = false;
    this.drawHead();
    return null;
  }

  exit() { this.o.onExit(); }

  // ---- prompts -----------------------------------------------------------------------------------------------
  ask(label, value, fn) { this.promptLabel.textContent = label; this.promptInput.value = value; this.promptBox.hidden = false; this.answer = fn; setTimeout(() => this.promptInput.focus(), 0); }
  closePrompt() { this.promptBox.hidden = true; this.answer = null; this.ta.focus(); if (this.vi) this.paintCursor(); }

  promptKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const fn = this.answer; const v = this.promptInput.value; this.closePrompt(); fn?.(v); return; }
    if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) { e.preventDefault(); this.closePrompt(); this.msg(this.vi ? '' : '[ Cancelled ]'); return; }
    if (this.yesNo) {
      const k = e.key.toLowerCase();
      e.preventDefault();
      if (k === 'y' || k === 'n') { const fn = this.yesNo; this.yesNo = null; this.promptBox.hidden = true; fn(k === 'y'); }
    }
  }

  // ---- nano --------------------------------------------------------------------------------------------------
  key(e) {
    e.stopPropagation();
    if (this.vi) { this.viKey(e); return; }
    const k = e.key.toLowerCase();
    if (e.key === 'F6' || (e.ctrlKey && k === 'w')) { e.preventDefault(); this.ask('Search: ', this.lastFind, (v) => this.nanoFind(v)); return; }
    if (!e.ctrlKey) return;
    if (k === 'o') { e.preventDefault(); this.ask('File Name to Write: ', this.o.path, () => this.nanoWrite()); return; }
    if (k === 'x') { e.preventDefault(); this.nanoExit(); return; }
    if (k === 'k') { e.preventDefault(); this.nanoCut(); return; }
    if (k === 'u') { e.preventDefault(); this.nanoPaste(); return; }
    if (k === 'g') { e.preventDefault(); this.msg('^O save   ^X exit   ^K cut line   ^U paste   F6 search'); }
  }

  nanoWrite() {
    const err = this.save();
    this.msg(err ? `[ Error writing ${this.o.path}: ${err} ]` : `[ Wrote ${this.lines().length} lines ]`);
    return !err;
  }

  nanoExit() {
    if (!this.modified) { this.exit(); return; }
    this.promptLabel.textContent = 'Save modified buffer (ANSWERING "No" WILL DESTROY CHANGES) ? ';
    this.promptInput.value = '';
    this.promptBox.hidden = false;
    this.answer = null;
    this.yesNo = (yes) => {
      if (!yes) { this.exit(); return; }
      this.ask('File Name to Write: ', this.o.path, () => { if (this.nanoWrite()) this.exit(); });
    };
    setTimeout(() => this.promptInput.focus(), 0);
  }

  lineBounds(p = this.ta.selectionStart) {
    const v = this.ta.value;
    const a = v.lastIndexOf('\n', p - 1) + 1;
    const nl = v.indexOf('\n', p);
    return [a, nl < 0 ? v.length : nl + 1];
  }

  nanoCut() {
    const [a, b] = this.lineBounds();
    this.reg = this.ta.value.slice(a, b);
    this.ta.value = this.ta.value.slice(0, a) + this.ta.value.slice(b);
    this.ta.setSelectionRange(a, a);
    this.modified = this.ta.value !== this.saved;
    this.drawHead();
  }

  nanoPaste() {
    const p = this.ta.selectionStart;
    this.ta.value = this.ta.value.slice(0, p) + this.reg + this.ta.value.slice(p);
    this.ta.setSelectionRange(p + this.reg.length, p + this.reg.length);
    this.modified = this.ta.value !== this.saved;
    this.drawHead();
  }

  nanoFind(v) {
    this.lastFind = v;
    let i = this.ta.value.indexOf(v, this.ta.selectionEnd);
    if (i < 0) i = this.ta.value.indexOf(v);
    if (i < 0) { this.msg(`[ "${v}" not found ]`); return; }
    this.ta.setSelectionRange(i, i);
  }

  // ---- vi ----------------------------------------------------------------------------------------------------
  setMode(m) {
    this.mode = m;
    this.ta.readOnly = m === 'normal';
    this.el.classList.toggle('te-ins', m === 'insert');
    if (m === 'insert') { this.ta.setSelectionRange(this.pos, this.pos); this.msg('-- INSERT --'); } else { this.msg(''); this.paintCursor(); }
  }

  paintCursor() {
    const v = this.ta.value;
    this.pos = Math.max(0, Math.min(this.pos, Math.max(0, v.length - 1)));
    this.ta.setSelectionRange(this.pos, Math.min(v.length, this.pos + 1));
  }

  snapshot() { this.undo.push(this.ta.value); if (this.undo.length > 50) this.undo.shift(); }
  setText(t) { this.ta.value = t; this.modified = t !== this.saved; }
  bounds(p = this.pos) { const v = this.ta.value; const a = v.lastIndexOf('\n', p - 1) + 1; const nl = v.indexOf('\n', p); return [a, nl < 0 ? v.length : nl]; }

  viKey(e) {
    if (this.mode === 'insert') {
      if (e.key === 'Escape') { e.preventDefault(); this.pos = Math.max(0, this.ta.selectionStart - 1); this.setMode('normal'); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control') return;
    e.preventDefault();
    const key = e.key;
    const seq = this.pendingKey + key;
    const v = this.ta.value;
    const [a, b] = this.bounds();
    const move = (p) => { this.pos = p; this.paintCursor(); };
    const column = this.pos - a;
    const lineAt = (start) => { const nl = v.indexOf('\n', start); return nl < 0 ? v.length : nl; };
    if (seq === 'dd') { this.pendingKey = ''; this.snapshot(); const end = b < v.length ? b + 1 : b; const start = end === b && a > 0 ? a - 1 : a; this.reg = `${v.slice(a, b)}\n`; this.setText(v.slice(0, start) + v.slice(end)); move(start); return; }
    if (seq === 'yy') { this.pendingKey = ''; this.reg = `${v.slice(a, b)}\n`; this.msg('1 line yanked'); return; }
    if (seq === 'gg') { this.pendingKey = ''; move(0); return; }
    if (seq === 'ZZ') { this.pendingKey = ''; this.ex('wq'); return; }
    if (key === 'd' || key === 'y' || key === 'g' || key === 'Z') { this.pendingKey = key; return; }
    this.pendingKey = '';
    switch (key) {
      case 'i': this.snapshot(); this.setMode('insert'); return;
      case 'a': this.snapshot(); this.pos = Math.min(this.pos + 1, b); this.setMode('insert'); return;
      case 'A': this.snapshot(); this.pos = b; this.setMode('insert'); return;
      case 'I': this.snapshot(); this.pos = a; this.setMode('insert'); return;
      case 'o': this.snapshot(); this.setText(`${v.slice(0, b)}\n${v.slice(b)}`); this.pos = b + 1; this.setMode('insert'); return;
      case 'O': this.snapshot(); this.setText(`${v.slice(0, a)}\n${v.slice(a)}`); this.pos = a; this.setMode('insert'); return;
      case 'x': this.snapshot(); this.setText(v.slice(0, this.pos) + v.slice(this.pos + 1)); this.paintCursor(); return;
      case 'p': { this.snapshot(); const at = Math.min(b + 1, v.length); const body = b >= v.length ? `\n${this.reg.replace(/\n$/, '')}` : this.reg; this.setText(v.slice(0, at) + body + v.slice(at)); move(at); return; }
      case 'u': if (this.undo.length) { this.setText(this.undo.pop()); this.paintCursor(); } else this.msg('Already at oldest change'); return;
      case 'h': case 'ArrowLeft': if (this.pos > a) move(this.pos - 1); return;
      case 'l': case 'ArrowRight': if (this.pos < b - 1) move(this.pos + 1); return;
      case 'j': case 'ArrowDown': if (b < v.length) { const s = b + 1; move(Math.min(s + column, lineAt(s))); } return;
      case 'k': case 'ArrowUp': if (a > 0) { const prev = v.lastIndexOf('\n', a - 2) + 1; move(Math.min(prev + column, a - 1)); } return;
      case '0': case 'Home': move(a); return;
      case '$': case 'End': move(Math.max(a, b - 1)); return;
      case 'G': move(v.lastIndexOf('\n', v.length - 2) + 1); return;
      case 'n': this.viFind(this.lastFind); return;
      case '/': this.ask('/', '', (t) => this.viFind(t)); return;
      case ':': this.ask(':', '', (t) => this.ex(t)); return;
      default:
    }
  }

  viFind(t) {
    if (!t) return;
    this.lastFind = t;
    let i = this.ta.value.indexOf(t, this.pos + 1);
    if (i < 0) i = this.ta.value.indexOf(t);
    if (i < 0) { this.msg(`E486: Pattern not found: ${t}`); return; }
    this.pos = i; this.paintCursor();
  }

  ex(raw) {
    const c = raw.trim();
    const write = () => {
      const err = this.save();
      if (err) { this.msg(`"${this.o.path}" E212: Can't open file for writing`); return false; }
      this.msg(`"${this.o.path}" ${this.lines().length}L, ${this.ta.value.length}C written`);
      return true;
    };
    const sub = c.match(/^%s(.)(.*?)\1(.*?)(?:\1(g?))?$/);
    if (sub) {
      let re;
      try { re = new RegExp(sub[2], sub[4] ? 'gm' : 'm'); } catch { this.msg('E486: bad pattern'); return; }
      if (!re.test(this.ta.value)) { this.msg(`E486: Pattern not found: ${sub[2]}`); return; }
      this.snapshot();
      this.setText(this.ta.value.replace(new RegExp(sub[2], sub[4] ? 'gm' : 'm'), sub[3]));
      return;
    }
    if (/^\d+$/.test(c)) { let p = 0; for (let n = Number(c) - 1; n > 0; n--) { const i = this.ta.value.indexOf('\n', p); if (i < 0) break; p = i + 1; } this.pos = p; this.paintCursor(); return; }
    switch (c) {
      case 'w': case 'w!': write(); return;
      case 'wq': case 'wq!': case 'x': if (write()) this.exit(); return;
      case 'q': if (this.modified) this.msg('E37: No write since last change (add ! to override)'); else this.exit(); return;
      case 'q!': this.exit(); return;
      default: if (/^set\b/.test(c)) return; this.msg(`E492: Not an editor command: ${c}`);
    }
  }
}
