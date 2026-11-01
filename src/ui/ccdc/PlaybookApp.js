import { h } from '../dom.js';

// The team's printed playbook, open in Notepad (practice rounds only). Every command line is clickable: it opens
// that box's own window and puts the command on its command line, ready to run (nothing runs by itself).
export class PlaybookApp {
  constructor({ state, onPick }) {
    const sc = state.scenario;
    const lines = [];
    const add = (text, dev, cmd) => lines.push(cmd
      ? h('button', { type: 'button', class: 'np-cmd', 'data-dev': dev.id, onclick: () => onPick(dev, cmd) }, text)
      : h('div', { class: 'np-line' }, text || ' '));
    add(`# ${sc.company} — first 15 minutes playbook`);
    add('# Click a command to load it into that box. Read what it prints before you change anything.');
    add('');
    for (const d of state.deviceList) {
      const how = d.kind === 'pwsh' ? `RDP to ${d.ip}, open PowerShell (or use the GUI tools)` : d.kind === 'firewall' ? `https://${d.ip}/ (webConfigurator) or SSH → 8) Shell` : `PuTTY ${d.user || 'analyst'}@${d.ip}`;
      add(`== ${d.host} (${d.ip}) — ${d.os}`);
      add(`   access: ${how}`);
      add(`   ${d.brief || ''}`);
      for (const c of d.checklist || []) add(`   ${d.kind === 'pwsh' ? 'PS>' : d.kind === 'firewall' ? 'fw>' : '$'} ${c}`, d, c);
      add('');
    }
    if (state.injectList.length) {
      add('== Injects');
      add('   Open the Inject Portal (taskbar). Answer every inject before its deadline — late = 0.');
      add('');
    }
    add('== Threat hunt');
    add('   Splunk has every log since yesterday. Find who got in, how, and what they left behind.');
    add('   Try:  index=* sourcetype=linux_secure "Failed password" | stats count by src_ip');
    this.el = h('div', { class: 'np' },
      h('div', { class: 'np-menu' }, ['File', 'Edit', 'Format', 'View', 'Help'].map((m) => h('span', {}, m))),
      h('div', { class: 'np-text', tabindex: '0' }, lines),
      h('div', { class: 'np-status' }, h('span', {}, `Ln 1, Col 1`), h('span', {}, '100%'), h('span', {}, 'Windows (CRLF)'), h('span', {}, 'UTF-8')));
  }

  focus() {}
  refresh() {}
}
