import { h, clear } from '../dom.js';
import { run } from '../../game/shell.js';
import { runPwsh, psPrompt, PWSH_BANNER } from '../../game/pwsh.js';

// The in-game Terminal, in two flavors:
//   bash  an Ubuntu jump host (the simulated shell in src/game/shell.js): analyst01@soc-jump01:~$
//   pwsh  a Windows PowerShell console (src/game/pwsh.js): PS C:\Users\analyst01>
// Up/Down walk through history, Tab completes, Ctrl+L clears. Every command is logged ('terminal-cmd'), so objectives
// and the report can tell whether you dug in yourself.
const UBUNTU_MOTD = (host, last, note) => [
  'Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)',
  '',
  ' * Documentation:  https://help.ubuntu.com',
  ' * Management:     https://landscape.canonical.com',
  ' * Support:        https://ubuntu.com/advantage',
  '',
  ` This host is the SOC jump box.${note ? ` ${note}` : ' Server logs are mirrored read-only under /var/log/remote/.'}`,
  '',
  `Last login: ${last} from 10.0.4.142`,
  '',
].join('\n');

export class TerminalApp {
  constructor({ state, day, changed, kind = 'bash' }) {
    this.state = state;
    this.day = day;
    this.changed = changed;
    this.kind = kind;
    this.cwd = kind === 'pwsh' ? 'C:\\Users\\analyst01' : '/home/analyst01';
    this.hIndex = null;
    this.out = h('pre', { class: 'term-out mono', 'aria-live': 'polite' });
    this.input = h('input', { class: 'term-in mono', 'aria-label': kind === 'pwsh' ? 'PowerShell command' : 'Terminal command', autocomplete: 'off', spellcheck: 'false' });
    this.promptEl = h('span', { class: 'term-prompt mono' });
    this.el = h('div', { class: `term ${kind}`, onclick: () => this.input.focus() }, this.out, h('div', { class: 'term-line' }, this.promptEl, this.input));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.reset();
  }

  get cfg() {
    return (this.kind === 'pwsh' ? this.day()?.powershell : this.day()?.terminal) || {};
  }

  get history() {
    return this.kind === 'pwsh' ? this.state.term.ps : this.state.term.history;
  }

  host() {
    return this.cfg.host || (this.kind === 'pwsh' ? 'WS-0142' : 'soc-jump01');
  }

  // The prompt as styled pieces (Ubuntu colors user@host green and the path blue).
  promptNodes() {
    if (this.kind === 'pwsh') return [psPrompt(this.cwd)];
    const short = this.cwd.replace(/^\/home\/analyst01/, '~');
    return [h('span', { class: 'pg' }, `analyst01@${this.host()}`), ':', h('span', { class: 'pb' }, short), '$ '];
  }

  reset() {
    clear(this.out).append(this.cfg.motd || (this.kind === 'pwsh' ? PWSH_BANNER : UBUNTU_MOTD(this.host(), 'Wed Oct 21 08:41:12 2026', this.cfg.note)));
    clear(this.promptEl).append(...this.promptNodes());
  }

  onKey(e) {
    const hist = this.history;
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
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    }
  }

  // Tab: complete the last word against commands (first word) or file names.
  complete() {
    const v = this.input.value;
    const m = v.match(/^(.*?)(\S*)$/s);
    const head = m[1];
    const word = m[2];
    let pool = [];
    if (this.kind === 'pwsh') {
      pool = [...Object.keys(this.cfg.winfs || {}).map((f) => f.split('\\').pop()), ...(head.trim() ? [] : ['Get-ADUser', 'Get-ADGroup', 'Get-ADGroupMember', 'Get-ADComputer', 'Get-WinEvent', 'Get-Content', 'Select-String', 'Where-Object', 'Select-Object', 'Sort-Object', 'Measure-Object', 'Format-Table', 'Format-List'])];
    } else {
      const files = Object.keys(this.cfg.files || {});
      const dir = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
      const base = dir.startsWith('/') ? '' : `${this.cwd}/`;
      const prefix = `${base}${dir}`.replace(/\/\.\//g, '/');
      pool = [...new Set(files.filter((f) => f.startsWith(prefix)).map((f) => `${dir}${f.slice(prefix.length).split('/')[0]}${f.slice(prefix.length).includes('/') ? '/' : ''}`))];
      if (!head.trim()) pool.push('ls', 'cat', 'grep', 'awk', 'sed', 'jq', 'head', 'tail', 'sort', 'uniq', 'whois', 'aws', 'az');
    }
    const hits = [...new Set(pool)].filter((p) => p.toLowerCase().startsWith(word.toLowerCase()));
    if (hits.length === 1) this.input.value = `${head}${hits[0]}`;
    else if (hits.length > 1) {
      this.out.append(h('span', { class: 'pg' }, `${this.promptNodes().map((n) => (typeof n === 'string' ? n : n.textContent)).join('')}${v}\n`), `${hits.join('  ')}\n`);
      this.scroll();
    }
  }

  exec(line) {
    const cfg = this.cfg;
    this.out.append(...this.promptNodes(), `${line}\n`);
    if (line.trim()) {
      this.history.push(line.trim());
      if (this.history.length > 200) this.history.shift();
      this.state.log('terminal-cmd', { cmd: line.trim().slice(0, 120), shell: this.kind });
    }
    let res;
    if (this.kind === 'pwsh') {
      res = runPwsh(line, {
        dir: this.day()?.directory,
        events: () => this.day()?.logs?.(this.state) || [],
        fs: cfg.winfs || {},
        cwd: this.cwd,
        user: 'analyst01',
        host: this.host(),
        home: 'C:\\Users\\analyst01',
        commands: cfg.commands,
      });
    } else {
      res = run(line, {
        fs: cfg.files || {},
        cwd: this.cwd,
        whois: cfg.whois,
        dns: cfg.dns,
        history: this.history,
        date: cfg.date,
        host: this.host(),
        commands: cfg.commands,
      });
    }
    if (res.clear) clear(this.out);
    else {
      // Keep the screen fast: very long outputs are trimmed (like scrolling past them).
      const out = res.out.length > 60000 ? `${res.out.slice(0, 60000)}\n... (output trimmed; try | head)\n` : res.out;
      this.out.append(out);
    }
    this.cwd = res.cwd;
    clear(this.promptEl).append(...this.promptNodes());
    this.changed?.();
    this.scroll();
  }

  scroll() {
    this.out.scrollTop = this.out.scrollHeight;
    this.el.scrollTop = this.el.scrollHeight;
  }

  focus() {
    setTimeout(() => this.input.focus(), 0);
  }
}
