import { h, clear } from '../dom.js';
import { run } from '../../game/shell.js';

// The in-game Terminal: a prompt over the simulated shell in src/game/shell.js.
// Up/Down walk through history. Every command is logged (the report can tell if you dug in yourself).
export class TerminalApp {
  constructor({ state, day, changed }) {
    this.state = state;
    this.day = day;
    this.changed = changed;
    this.cwd = '/home/analyst01';
    this.hIndex = null;
    this.out = h('pre', { class: 'term-out mono', 'aria-live': 'polite' });
    this.input = h('input', { class: 'term-in mono', 'aria-label': 'Terminal command', autocomplete: 'off', spellcheck: 'false' });
    this.promptEl = h('span', { class: 'term-prompt mono' });
    this.el = h('div', { class: 'term', onclick: () => this.input.focus() }, this.out, h('div', { class: 'term-line' }, this.promptEl, this.input));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.reset();
  }

  prompt() {
    const short = this.cwd.replace(/^\/home\/analyst01/, '~');
    return `analyst01@${this.day()?.terminal?.host || 'HALCYON-WS-0142'}:${short}$ `;
  }

  reset() {
    const t = this.day().terminal;
    clear(this.out).append(t?.motd || 'Type help to see what you can do.\n');
    this.promptEl.textContent = this.prompt();
  }

  onKey(e) {
    const hist = this.state.term.history;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.exec(this.input.value);
      this.input.value = '';
      this.hIndex = null;
    } else if (e.key === 'ArrowUp' && hist.length) {
      e.preventDefault();
      this.hIndex = this.hIndex === null ? hist.length - 1 : Math.max(0, this.hIndex - 1);
      this.input.value = hist[this.hIndex];
    } else if (e.key === 'ArrowDown' && this.hIndex !== null) {
      e.preventDefault();
      this.hIndex = this.hIndex + 1 >= hist.length ? null : this.hIndex + 1;
      this.input.value = this.hIndex === null ? '' : hist[this.hIndex];
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear(this.out);
    }
  }

  exec(line) {
    const t = this.day().terminal;
    this.out.append(`${this.prompt()}${line}\n`);
    if (line.trim()) {
      this.state.term.history.push(line.trim());
      if (this.state.term.history.length > 200) this.state.term.history.shift();
      this.state.log('terminal-cmd', { cmd: line.trim().slice(0, 120) });
    }
    const res = run(line, {
      fs: t?.files || {},
      cwd: this.cwd,
      whois: t?.whois,
      dns: t?.dns,
      history: this.state.term.history,
      date: t?.date,
      host: t?.host,
    });
    if (res.clear) clear(this.out);
    else {
      // Keep the screen fast: very long outputs are trimmed (like scrolling past them).
      const out = res.out.length > 60000 ? `${res.out.slice(0, 60000)}\n... (output trimmed; try | head)\n` : res.out;
      this.out.append(out);
    }
    this.cwd = res.cwd;
    this.promptEl.textContent = this.prompt();
    this.changed?.();
    this.out.scrollTop = this.out.scrollHeight;
    this.el.scrollTop = this.el.scrollHeight;
  }

  focus() {
    setTimeout(() => this.input.focus(), 0);
  }
}
