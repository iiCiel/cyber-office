import { h, clear } from '../dom.js';
import './termview.css';

// A terminal emulator VIEW (no engine): an output buffer plus an input line that behaves like a real shell —
// Enter runs, Up/Down walk history, Ctrl+L clears, Ctrl+C abandons the line (prints ^C), Tab completes from
// a word list. It looks like the real client it stands in for, chosen by `theme`:
//   'putty'  PuTTY / xterm on a Linux box (black, #bbb text, green user@host, blue path — Ubuntu's bashrc colours)
//   'pwsh'   Windows PowerShell 5.1 console (#012456 blue, #eeedf0 text, Consolas)
//   'kali'   Kali's QTerminal with the two-line zsh prompt  ┌──(kali㉿kali)-[~]  └─$
//   'fbsd'   pfSense console over SSH (FreeBSD tcsh, black/grey)
// The owner keeps `buffer` and `history` arrays so a terminal survives being hidden and re-shown.
// Everything goes in through textContent (dom.h), never innerHTML.

const MAX_LINES = 1500;

export class TermView {
  /**
   * @param {object} o
   * @param {'putty'|'pwsh'|'kali'|'fbsd'} o.theme
   * @param {() => string} o.prompt         current prompt text (re-read after every command, so cd can change it)
   * @param {(line:string) => {lines?:{cls?:string,text:string}[], clear?:boolean}} o.run
   * @param {{cls?:string,text:string}[]} [o.buffer]   persistent output buffer (mutated)
   * @param {string[]} [o.history]                     persistent command history (mutated)
   * @param {string[]} [o.complete]                    words for Tab completion
   * @param {(res:object, line:string) => void} [o.onRan]
   * @param {string} [o.label]                         aria label
   */
  constructor(o) {
    this.o = o;
    this.buffer = o.buffer || [];
    this.history = o.history || [];
    this.hpos = this.history.length;
    this.input = h('input', {
      class: 'tv-input', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      'aria-label': o.label || 'Terminal input', onkeydown: (e) => this.key(e),
    });
    this.promptEl = h('span', { class: 'tv-prompt' });
    this.out = h('div', { class: 'tv-out', role: 'log', 'aria-live': 'polite', 'aria-label': `${o.label || 'Terminal'} output` });
    this.el = h('div', { class: `tv tv-${o.theme || 'putty'}`, onmousedown: (e) => { if (!e.target.closest('button, a, .tv-out *')) setTimeout(() => this.input.focus(), 0); } },
      this.out,
      h('div', { class: 'tv-cmdline' }, this.promptEl, this.input));
    this.el.addEventListener('click', () => { if (!window.getSelection()?.toString()) this.input.focus(); });
    this.redraw();
  }

  // Colourised prompt, the way each real shell draws it.
  promptNode(text) {
    const theme = this.o.theme;
    if (theme === 'putty') {
      const m = String(text).match(/^([^@\s]+@[^:\s]+):(\S*)([#$])\s*$/);
      if (m) return [h('b', { class: 'tv-c-ugreen' }, m[1]), ':', h('b', { class: 'tv-c-ublue' }, m[2]), `${m[3]} `];
    }
    if (theme === 'kali') {
      const m = String(text).match(/^(\S+)㉿(\S+)\s+(.*)$/);
      if (m) {
        return [h('span', { class: 'tv-c-kblue' }, '┌──('), h('b', { class: 'tv-c-kuser' }, `${m[1]}㉿${m[2]}`), h('span', { class: 'tv-c-kblue' }, ')-['), h('b', { class: 'tv-c-kpath' }, m[3]), h('span', { class: 'tv-c-kblue' }, ']'), '\n',
          h('span', { class: 'tv-c-kblue' }, '└─'), h('b', { class: 'tv-c-kuser' }, '$ ')];
      }
    }
    return [`${text}${/\s$/.test(text) ? '' : ' '}`];
  }

  lineNode(l) {
    if (l.cls === 'cmd' && l.prompt != null) return h('div', { class: 'tv-line cmd' }, this.promptNode(l.prompt), l.text);
    return h('div', { class: `tv-line ${l.cls || ''}` }, l.text);
  }

  redraw() {
    clear(this.out);
    for (const l of this.buffer) this.out.append(this.lineNode(l));
    clear(this.promptEl).append(...this.promptNode(this.o.prompt()));
    this.scroll();
  }

  scroll() { this.out.scrollTop = this.out.scrollHeight; }

  print(lines) {
    for (const l of lines) { this.buffer.push(l); this.out.append(this.lineNode(l)); }
    while (this.buffer.length > MAX_LINES) { this.buffer.shift(); this.out.firstChild?.remove(); }
    this.scroll();
  }

  focus() { this.input.focus(); }
  setInput(text) { this.input.value = text; this.input.focus(); }

  exec(line) {
    const prompt = this.o.prompt();
    if (line.trim()) { this.history.push(line); }
    this.hpos = this.history.length;
    let res;
    try { res = this.o.run(line) || {}; } catch (err) { res = { lines: [{ cls: 'err', text: `${err?.message || 'error'}` }] }; }
    if (res.clear) { this.buffer.length = 0; this.redraw(); this.o.onRan?.(res, line); return res; }
    this.print([{ cls: 'cmd', prompt, text: line }, ...(res.lines || [])]);
    clear(this.promptEl).append(...this.promptNode(this.o.prompt()));
    this.o.onRan?.(res, line);
    return res;
  }

  key(e) {
    e.stopPropagation();
    const inp = this.input;
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; inp.value = ''; this.exec(v); return; }
    if (e.key === 'ArrowUp') { if (!this.history.length) return; e.preventDefault(); this.hpos = Math.max(0, this.hpos - 1); inp.value = this.history[this.hpos] || ''; return; }
    if (e.key === 'ArrowDown') { if (!this.history.length) return; e.preventDefault(); this.hpos = Math.min(this.history.length, this.hpos + 1); inp.value = this.history[this.hpos] || ''; return; }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.buffer.length = 0; this.redraw(); return; }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !window.getSelection()?.toString()) {
      e.preventDefault(); this.print([{ cls: 'cmd', prompt: this.o.prompt(), text: `${inp.value}^C` }]); inp.value = ''; return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const words = this.o.complete || [];
      const m = inp.value.match(/(\S*)$/);
      const stem = m ? m[1] : '';
      if (!stem) return;
      const hits = words.filter((w) => w.toLowerCase().startsWith(stem.toLowerCase()));
      if (hits.length === 1) inp.value = inp.value.slice(0, inp.value.length - stem.length) + hits[0] + (this.o.theme === 'pwsh' ? '' : ' ');
      else if (hits.length > 1) this.print([{ cls: 'cmd', prompt: this.o.prompt(), text: inp.value }, { text: hits.join('  ') }]);
    }
  }
}
