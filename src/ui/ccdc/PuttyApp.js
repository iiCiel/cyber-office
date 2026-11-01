import { h } from '../dom.js';
import { TermView } from './TermView.js';

// A PuTTY SSH session to one box, driven by the lab engine (runLine). Linux boxes get the Ubuntu login banner
// and a coloured bash prompt. The pfSense firewall gets its real console menu first; option 8 drops to the
// shell (here: the WAN rule editor the lab grades).
export class PuttyApp {
  /**
   * @param {object} o
   * @param {object} o.dev           the scenario device
   * @param {(line:string) => {lines:object[], effects:object}} o.run
   * @param {{buffer:object[], history:string[]}} o.session   persistent per-device buffers
   * @param {string[]} [o.banner]    pfSense console menu lines (for kind 'firewall')
   * @param {(res:object, line:string) => void} [o.onRan]
   */
  constructor(o) {
    this.o = o;
    const d = o.dev;
    this.fw = d.kind === 'firewall';
    this.inMenu = this.fw && !o.session.shell;
    if (!o.session.buffer.length) o.session.buffer.push(...this.loginBanner());
    this.term = new TermView({
      theme: this.fw ? 'fbsd' : 'putty',
      label: `${d.name} SSH session`,
      buffer: o.session.buffer,
      history: o.session.history,
      prompt: () => this.prompt(),
      run: (line) => this.run(line),
      onRan: o.onRan,
      complete: this.fw ? ['show', 'pass', 'block', 'default', 'del', 'help', 'tcp', 'udp', 'any', 'port', 'from', 'scoring']
        : ['sudo', 'systemctl', 'cat', 'grep', 'ls', 'ss', 'netstat', 'journalctl', 'crontab', 'passwd', 'ufw', 'chmod', 'sed', 'tail', 'less', 'ps', 'last', 'who', 'find', '/etc/', '/var/log/', '/var/www/', '/home/'],
    });
    this.el = h('div', { class: 'jb-putty' }, this.term.el);
  }

  prompt() {
    const d = this.o.dev;
    if (this.inMenu) return 'Enter an option:';
    if (this.fw) return `[2.7.2-RELEASE][admin@${d.host}.localdomain]/root: rule-editor>`;
    return d.prompt || `${d.user || 'analyst'}@${d.host}:~$`;
  }

  loginBanner() {
    const d = this.o.dev;
    const t = (text, cls = 'sys') => ({ cls, text });
    if (this.fw) return [t(`Using username "admin".`), t(`Keyboard-interactive authentication prompts from server:`), t(`End of keyboard-interactive prompts from server`), ...(this.o.banner || []).map((x) => t(x))];
    const os = /ubuntu\s*([\d.]+)/i.exec(d.os || '');
    const ver = os ? os[1] : '20.04';
    return [
      t(`login as: ${d.user || 'analyst'}`),
      t(`${d.user || 'analyst'}@${d.ip}'s password:`),
      t(`Welcome to Ubuntu ${ver === '22.04' ? '22.04.4 LTS (GNU/Linux 5.15.0-105-generic x86_64)' : '20.04.6 LTS (GNU/Linux 5.4.0-182-generic x86_64)'}`),
      t(''),
      t(' * Documentation:  https://help.ubuntu.com'),
      t(' * Management:     https://landscape.canonical.com'),
      t(' * Support:        https://ubuntu.com/pro'),
      t(''),
      t(`  System information as of ${new Date().toUTCString().replace('GMT', 'UTC')}`),
      t(''),
      t(`  System load:  0.08               Processes:             141`),
      t(`  Usage of /:   41.7% of 19.56GB   Users logged in:       1`),
      t(`  Memory usage: 37%                IPv4 address for eth0: ${d.ip}`),
      t(''),
      t(`Last login: Fri Oct 30 23:51:07 2026 from 10.10.10.200`),
      t(`(Simulated competition box — nothing you type runs anywhere. Type "help" for what this box understands.)`, 'note'),
    ];
  }

  run(line) {
    const v = line.trim();
    if (this.inMenu) {
      if (v === '8') { this.inMenu = false; this.o.session.shell = true; return { lines: [{ text: '' }, { cls: 'note', text: 'Shell: WAN rule editor (type "help"). Type "exit" to return to the menu.' }] }; }
      if (v === '0') return { lines: [{ cls: 'warn', text: 'Logout refused — this is your only session to the firewall during the round.' }] };
      if (!v) return { lines: [] };
      return { lines: [{ cls: 'warn', text: `Option ${v} is not available to the blue team in this round. Use 8) Shell, or the webConfigurator (https://${this.o.dev.ip}/).` }] };
    }
    if (this.fw && (v === 'exit' || v === 'logout')) { this.inMenu = true; this.o.session.shell = false; return { lines: (this.o.banner || []).map((text) => ({ cls: 'sys', text })) }; }
    if (!this.fw && (v === 'exit' || v === 'logout')) return { lines: [{ cls: 'warn', text: 'logout refused: keep this session open — reconnecting costs you time on the day.' }] };
    const res = this.o.run(line);
    if (res?.effects?.clear) return { clear: true, ...res };
    return res;
  }

  focus() { this.term.focus(); }
  setInput(t) { this.term.setInput(t); }
  refresh() {}
}
