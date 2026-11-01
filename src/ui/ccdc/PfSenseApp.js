// The pfSense 2.7 CE web GUI for the CCDC edge-firewall device. Looks like the real webConfigurator and is
// driven entirely through run(line), the rule-editor command callback, so grading stays in ccdcLab.runLine().
//   const app = new PfSenseApp({ state, dev, run: (line) => ({ lines, effects }), clock: () => seconds });
//   parent.append(app.el);  setInterval(() => app.refresh(), 1000);  app.destroy();
import { h, clear } from '../dom.js';
import {
  PF_VERSION, PROTO_CHOICES, buildRuleCommand, deleteCommands, defaultCommand, ruleCells, policyRow, hostAliases,
  scoringIpOf, logEntries, fmtBytes, clockToHms, portRange,
} from '../../game/pfsenseMap.js';

export { pfConsoleBanner, PF_CONSOLE_PROMPT } from '../../game/pfsenseMap.js';

// el(tag, class, [attrs], ...children): an optional plain-object first child is taken as extra attributes.
const el = (tag, cls, ...kids) => {
  const first = kids[0];
  const attrs = first && typeof first === 'object' && !(first instanceof Node) && !Array.isArray(first) ? kids.shift() : {};
  return h(tag, { class: cls, ...attrs }, ...kids);
};

const MENUS = [
  ['System', [['Advanced'], ['General Setup'], ['High Availability Sync'], ['Package Manager'], ['Routing'], ['Setup Wizard'], ['Update'], ['User Manager']]],
  ['Interfaces', [['Assignments'], ['WAN'], ['LAN']]],
  ['Firewall', [['Aliases', 'aliases'], ['NAT'], ['Rules', 'rules'], ['Schedules'], ['Traffic Shaper'], ['Virtual IPs']]],
  ['Services', [['Auto Config Backup'], ['DHCP Server'], ['DNS Forwarder'], ['DNS Resolver'], ['NTP'], ['Router Advertisement']]],
  ['VPN', [['IPsec'], ['L2TP'], ['OpenVPN']]],
  ['Status', [['Dashboard', 'dash'], ['DHCP Leases'], ['Gateways'], ['Interfaces', 'ifstatus'], ['Monitoring'], ['Services'], ['System Logs', 'logs'], ['Traffic Graph']]],
  ['Diagnostics', [['ARP Table'], ['Backup & Restore'], ['Command Prompt', 'cmd'], ['DNS Lookup'], ['Packet Capture'], ['Ping'], ['States'], ['Traceroute']]],
  ['Help', [['About this Page'], ['Bug Database'], ['Documentation'], ['Netgate Store']]],
];

const PAGE_CRUMBS = {
  dash: ['Status', 'Dashboard'],
  rules: ['Firewall', 'Rules'],
  ruleform: ['Firewall', 'Rules', 'Edit'],
  aliases: ['Firewall', 'Aliases', 'IP'],
  logs: ['Status', 'System Logs', 'Firewall', 'Normal View'],
  ifstatus: ['Status', 'Interfaces'],
  cmd: ['Diagnostics', 'Command Prompt'],
};

const protoFromRule = (r) => (r.proto === 'any' ? (r.port === 'any' ? 'any' : 'tcp/udp') : r.proto);

export class PfSenseApp {
  constructor({ state, dev, run, clock }) {
    this.state = state;
    this.dev = dev;
    this.runCmd = run;
    this.clock = clock || (() => 0);
    this.page = 'rules';
    this.tab = 'wan';
    this.pending = false;
    this.selected = new Set();
    this.form = null;
    this.formReadonly = false;
    this.formErrors = [];
    this.cmdOut = [];
    this.stubName = '';
    this.refs = {};
    this.renderedSig = '';
    this.alive = true;

    this.root = el('div', 'pf');
    this.root.setAttribute('data-device', dev.id);
    this.el = this.root;
    this.nav = el('nav', 'pf-navbar');
    this.main = el('div', 'pf-main');
    this.modalHost = el('div', 'pf-modal-host');
    this.root.append(this.nav, this.main, this.modalHost);
    this.onDocClick = (e) => { if (!this.nav.contains(e.target)) this.closeMenus(); };
    this.root.addEventListener('click', this.onDocClick);
    this.buildNav();
    this.render();
  }

  // ---- state access ------------------------------------------------------------------------------------
  get fw() { return this.state.devState[this.dev.id].firewall; }
  get scoringIp() { return scoringIpOf(this.state); }
  get aliases() { return hostAliases(this.state.scenario, this.scoringIp); }
  get host() { return this.dev.host || this.dev.id; }
  sig() { return JSON.stringify([this.fw.rules, this.fw.default]); }

  run(line) {
    const res = this.runCmd(line) || { lines: [] };
    const errs = (res.lines || []).filter((l) => l.cls === 'err').map((l) => l.text);
    return { res, errs };
  }

  // ---- chrome ------------------------------------------------------------------------------------------
  buildNav() {
    clear(this.nav);
    const brand = h('a', { class: 'pf-brand', href: '#', onclick: (e) => { e.preventDefault(); this.go('dash'); } },
      el('span', 'pf-logo', el('b', '', 'pf'), el('span', 'pf-logo-sense', 'sense')),
      el('span', 'pf-edition', 'COMMUNITY EDITION'));
    const toggle = h('button', { class: 'pf-nav-toggle', type: 'button', 'aria-label': 'Toggle navigation', onclick: () => this.nav.classList.toggle('pf-nav-open') },
      el('span', 'pf-bar'), el('span', 'pf-bar'), el('span', 'pf-bar'));
    const ul = el('ul', 'pf-menus');
    for (const [name, items] of MENUS) {
      const li = el('li', 'pf-menu');
      const a = h('a', { href: '#', class: 'pf-menu-a', onclick: (e) => { e.preventDefault(); const open = li.classList.contains('pf-open'); this.closeMenus(); if (!open) li.classList.add('pf-open'); } }, name, el('span', 'pf-caret'));
      const dd = el('ul', 'pf-dropdown');
      for (const [label, page] of items) {
        dd.append(el('li', '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.closeMenus(); this.nav.classList.remove('pf-nav-open'); if (page) this.go(page); else this.go('stub', label); } }, label)));
      }
      li.append(a, dd);
      ul.append(li);
    }
    this.nav.append(el('div', 'pf-nav-top', brand, toggle), ul);
  }

  closeMenus() { this.nav.querySelectorAll('.pf-open').forEach((n) => n.classList.remove('pf-open')); }

  go(page, extra) {
    this.page = page;
    if (page === 'stub') this.stubName = extra || '';
    if (page === 'rules') { this.formErrors = []; }
    this.render();
    this.root.scrollTop = 0;
  }

  crumbs(list) {
    const ol = el('ol', 'pf-breadcrumb');
    list.forEach((c, i) => ol.append(el('li', i === list.length - 1 ? 'pf-active' : '', c)));
    return ol;
  }

  render() {
    clear(this.main);
    this.refs = {};
    const c = el('div', 'pf-container');
    const p = this.page;
    if (p === 'dash') this.renderDash(c);
    else if (p === 'rules') this.renderRules(c);
    else if (p === 'ruleform') this.renderForm(c);
    else if (p === 'aliases') this.renderAliases(c);
    else if (p === 'logs') this.renderLogs(c);
    else if (p === 'ifstatus') this.renderIfStatus(c);
    else if (p === 'cmd') this.renderCmd(c);
    else this.renderStub(c);
    this.main.append(c, el('footer', 'pf-footer',
      el('span', '', 'pfSense is developed and maintained by '), h('a', { href: '#', onclick: (e) => e.preventDefault() }, 'Netgate'),
      el('span', '', '. © ESF 2004 - 2026 '), h('a', { href: '#', onclick: (e) => e.preventDefault() }, 'View license.')));
    this.renderedSig = this.sig();
  }

  panel(title, body, extraCls = '') {
    return el('div', `pf-panel ${extraCls}`, el('div', 'pf-panel-heading', el('h2', 'pf-panel-title', title)), el('div', 'pf-panel-body', body));
  }

  alertBox(kind, ...kids) { return el('div', `pf-alert pf-alert-${kind}`, ...kids); }

  // ---- Dashboard ---------------------------------------------------------------------------------------
  renderDash(c) {
    c.append(this.crumbs(PAGE_CRUMBS.dash));
    const bar = (key) => {
      const fill = el('div', 'pf-bar-fill');
      const txt = el('span', 'pf-bar-text');
      this.refs[key] = { fill, txt };
      return el('div', 'pf-progress', fill, txt);
    };
    const row = (k, v) => el('tr', '', el('th', '', k), el('td', '', v));
    const mk = (k) => { const s = el('span', ''); this.refs[k] = s; return s; };
    const sysInfo = el('table', 'pf-table pf-kv',
      row('Name', `${this.host}.home.arpa`),
      row('User', 'admin@10.10.10.50 (Local Database)'),
      row('System', el('span', '', 'VMware Virtual Machine', el('br'), 'Netgate Device ID: 3f9a1c7d2b84e56a0c1d')),
      row('BIOS', 'Vendor: Phoenix Technologies LTD, Version: 6.00, Release Date: 11/12/2020'),
      row('Version', el('span', '', `${PF_VERSION} (amd64)`, el('br'), 'built on Mon Dec 4 2023', el('br'), 'FreeBSD 14.0-CURRENT', el('br'), el('i', 'pf-ok', '✓ '), 'The system is on the latest version.')),
      row('CPU Type', el('span', '', 'Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz', el('br'), '2 CPUs: 1 package(s) x 2 core(s)', el('br'), 'AES-NI CPU Crypto: Yes (active)')),
      row('Hardware crypto', 'Inactive'),
      row('Kernel PTI', 'Enabled'),
      row('Uptime', mk('uptime')),
      row('Current date/time', mk('now')),
      row('DNS server(s)', el('span', '', '127.0.0.1', el('br'), '10.10.10.10')),
      row('Last config change', mk('cfg')),
      row('State table size', el('span', '', bar('states'))),
      row('MBUF Usage', el('span', '', bar('mbuf'))),
      row('Load average', '0.12, 0.09, 0.05'),
      row('CPU usage', bar('cpu')),
      row('Memory usage', bar('mem')),
      row('SWAP usage', bar('swap')),
      row('Disk usage (/)', bar('disk')));
    const ifs = el('table', 'pf-table pf-kv',
      el('tr', '', el('th', '', 'WAN'), el('td', '', el('i', 'pf-ok', '▲ '), '1000baseT <full-duplex>', el('br'), this.dev.ip || '203.0.113.2')),
      el('tr', '', el('th', '', 'LAN'), el('td', '', el('i', 'pf-ok', '▲ '), '1000baseT <full-duplex>', el('br'), '10.10.10.1')));
    const gw = el('table', 'pf-table',
      el('thead', '', el('tr', '', ...['Name', 'RTT', 'RTTsd', 'Loss', 'Status'].map((t) => el('th', '', t)))),
      el('tbody', '', el('tr', '', el('td', '', el('b', '', 'WAN_GW'), el('br'), '203.0.113.1'), el('td', '', '1.3ms'), el('td', '', '0.4ms'), el('td', '', '0.0%'), el('td', '', el('span', 'pf-label pf-label-ok', 'Online')))));
    const svc = el('table', 'pf-table',
      el('thead', '', el('tr', '', el('th', '', 'Service'), el('th', '', 'Description'), el('th', '', 'Action'))),
      el('tbody', '', ...[['dpinger', 'Gateway Monitoring Daemon'], ['ntpd', 'NTP clock sync'], ['sshd', 'Secure Shell Daemon'], ['syslogd', 'System Logger Daemon'], ['unbound', 'DNS Resolver']]
        .map(([n, d]) => el('tr', '', el('td', '', n), el('td', '', d), el('td', 'pf-ok', '✓ Running')))));
    c.append(el('div', 'pf-cols',
      el('div', 'pf-col', this.panel('System Information', sysInfo), this.panel('Services Status', svc)),
      el('div', 'pf-col', this.panel('Interfaces', ifs), this.panel('Gateways', gw))));
    this.updateDash();
  }

  setBar(key, pct, text) {
    const r = this.refs[key];
    if (!r) return;
    r.fill.style.width = `${Math.max(1, Math.min(100, pct))}%`;
    r.txt.textContent = text;
  }

  updateDash() {
    const r = this.refs;
    if (!r.uptime) return;
    const s = Math.floor(this.clock());
    const up = 2 * 86400 + 4 * 3600 + 12 * 60 + 55 + s;
    const p2 = (n) => String(n).padStart(2, '0');
    r.uptime.textContent = `${Math.floor(up / 86400)} Days ${p2(Math.floor(up / 3600) % 24)} Hours ${p2(Math.floor(up / 60) % 60)} Minutes ${p2(up % 60)} Seconds`;
    r.now.textContent = `Sat Oct 31 ${clockToHms(s)} UTC 2026`;
    r.cfg.textContent = `Sat Oct 31 08:41:07 UTC 2026`;
    const cpu = 3 + ((s * 7) % 9);
    const st = 300 + (s % 40) * 3;
    this.setBar('states', (st / 98000) * 100, `${((st / 98000) * 100).toFixed(0)}% (${st}/98000)`);
    this.setBar('mbuf', 1, '1% (1016/124000)');
    this.setBar('cpu', cpu, `${cpu}%`);
    this.setBar('mem', 17, '17% of 1982 MiB');
    this.setBar('swap', 1, '0% of 1023 MiB');
    this.setBar('disk', 3, '3% of 15GiB - UFS');
  }

  // ---- Firewall > Rules --------------------------------------------------------------------------------
  renderRules(c) {
    const tabName = { floating: 'Floating', wan: 'WAN', lan: 'LAN' }[this.tab];
    c.append(this.crumbs(['Firewall', 'Rules', tabName]));
    const tabs = el('ul', 'pf-tabs');
    for (const [k, label] of [['floating', 'Floating'], ['wan', 'WAN'], ['lan', 'LAN']]) {
      tabs.append(el('li', k === this.tab ? 'pf-active' : '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.tab = k; this.selected.clear(); this.render(); } }, label)));
    }
    c.append(tabs);
    if (this.pending) {
      c.append(this.alertBox('warning',
        h('button', { class: 'pf-btn pf-btn-success pf-apply', type: 'button', onclick: () => { this.pending = false; this.render(); } }, el('i', 'pf-ico', '✓'), ' Apply Changes'),
        el('div', '', 'The firewall rule configuration has been changed.', el('br'), 'The changes must be applied for them to take effect.')));
    }
    if (this.tab === 'wan') this.renderWanTable(c);
    else if (this.tab === 'lan') this.renderLanTable(c);
    else this.renderFloating(c);
    c.append(el('div', 'pf-legend',
      el('span', '', el('i', 'pf-ok', '✓'), ' pass'), el('span', '', el('i', 'pf-bad', '✕'), ' block'),
      el('span', '', el('i', 'pf-muted', '✕'), ' reject'), el('span', '', el('i', 'pf-muted', 'ⓘ'), ' log'),
      el('span', '', el('i', 'pf-muted', '⇄'), ' in'), el('span', '', el('i', 'pf-muted', '→'), ' out')));
  }

  thead(cols) { return el('thead', '', el('tr', '', ...cols.map((t) => el('th', '', t)))); }

  renderFloating(c) {
    c.append(this.panel('Rules (Drag to Change Order)', el('div', 'pf-scroll', el('table', 'pf-table pf-rules',
      this.thead(['', '', 'States', 'Protocol', 'Source', 'Port', 'Destination', 'Port', 'Gateway', 'Queue', 'Schedule', 'Description', 'Actions']),
      el('tbody', '', el('tr', '', el('td', 'pf-empty', { colspan: 13 }, 'No rules are currently defined for this interface.'))))), 'pf-nopad'));
  }

  renderLanTable(c) {
    const rule = (icon, proto, src, dst, descr) => el('tr', '',
      el('td', '', h('input', { type: 'checkbox', disabled: true })), el('td', 'pf-ok', '✓'), el('td', '', '0 / 0 B'), el('td', '', proto), el('td', '', src), el('td', '', '*'),
      el('td', '', dst), el('td', '', '*'), el('td', '', '*'), el('td', '', 'none'), el('td', '', ''), el('td', '', descr), el('td', 'pf-actions', el('span', 'pf-muted', 'read-only')));
    c.append(this.panel('Rules (Drag to Change Order)', el('div', 'pf-scroll', el('table', 'pf-table pf-rules',
      this.thead(['', '', 'States', 'Protocol', 'Source', 'Port', 'Destination', 'Port', 'Gateway', 'Queue', 'Schedule', 'Description', 'Actions']),
      el('tbody', '',
        rule('', '*', '*', 'LAN Address', 'Anti-Lockout Rule'),
        rule('', 'IPv4 *', 'LAN subnets', '*', 'Default allow LAN to any rule'),
        rule('', 'IPv6 *', 'LAN subnets', '*', 'Default allow LAN IPv6 to any rule')))), 'pf-nopad'));
  }

  renderWanTable(c) {
    const fw = this.fw;
    const clk = this.clock();
    const tbody = el('tbody', '');
    fw.rules.forEach((r, i) => {
      const cl = ruleCells(r, i, clk, this.scoringIp);
      const chk = h('input', { type: 'checkbox', 'aria-label': `Select rule ${cl.n}`, checked: this.selected.has(cl.n) || undefined,
        onchange: (e) => { if (e.target.checked) this.selected.add(cl.n); else this.selected.delete(cl.n); this.updateDeleteBtn(); } });
      if (this.selected.has(cl.n)) chk.checked = true;
      const states = el('td', 'pf-states', cl.states);
      states.dataset.i = String(i);
      const act = el('td', 'pf-actions',
        this.iconBtn('✎', 'Edit this rule', () => this.openForm(r, true)),
        this.iconBtn('❐', 'Add a new rule based on this one', () => this.openForm(r, false)),
        this.iconBtn('⊘', 'Disable this rule (not available in this lab)', null, true),
        this.iconBtn('✖', 'Delete this rule', () => this.confirmDelete([cl.n]), false, 'pf-act-del'));
      tbody.append(el('tr', cl.pass ? 'pf-row-pass' : 'pf-row-block',
        el('td', '', chk),
        el('td', cl.pass ? 'pf-ok pf-ico-cell' : 'pf-bad pf-ico-cell', cl.pass ? '✓' : '✕'),
        states,
        el('td', '', cl.proto), el('td', '', cl.sourceTitle ? h('a', { href: '#', title: cl.sourceTitle, onclick: (e) => { e.preventDefault(); this.go('aliases'); } }, cl.source) : cl.source), el('td', '', cl.srcPort),
        el('td', '', cl.dest === '*' ? '*' : h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.go('aliases'); } }, cl.dest)), el('td', '', cl.destPort),
        el('td', '', cl.gateway), el('td', '', cl.queue), el('td', '', cl.schedule), el('td', '', cl.descr), act));
    });
    const pr = policyRow(fw);
    tbody.append(el('tr', 'pf-row-default',
      el('td', '', h('input', { type: 'checkbox', disabled: true })),
      el('td', pr.pass ? 'pf-ok pf-ico-cell' : 'pf-bad pf-ico-cell', pr.pass ? '✓' : '✕'),
      el('td', '', '—'), el('td', '', 'IPv4 *'), el('td', '', '*'), el('td', '', '*'), el('td', '', '*'), el('td', '', '*'), el('td', '', '*'), el('td', '', 'none'), el('td', '', ''),
      el('td', 'pf-default-desc', el('b', '', pr.label), el('div', 'pf-small', pr.note)),
      el('td', 'pf-actions', h('button', { type: 'button', class: `pf-btn pf-btn-xs ${pr.toggleTo === 'block' ? 'pf-btn-primary' : 'pf-btn-default'}`, 'data-act': 'default',
        onclick: () => this.setDefault(pr.toggleTo) }, pr.toggleLabel))));
    const delBtn = h('button', { type: 'button', class: 'pf-btn pf-btn-danger', disabled: true, onclick: () => this.confirmDelete([...this.selected]) }, el('i', 'pf-ico', '✖'), ' Delete');
    this.refs.delBtn = delBtn;
    const addBtn = h('button', { type: 'button', class: 'pf-btn pf-btn-success', 'data-act': 'add', onclick: () => this.openForm(null) }, el('i', 'pf-ico', '↓'), ' Add');
    const body = el('div', '', el('div', 'pf-scroll', el('table', 'pf-table pf-rules',
      this.thead(['', '', 'States', 'Protocol', 'Source', 'Port', 'Destination', 'Port', 'Gateway', 'Queue', 'Schedule', 'Description', 'Actions']), tbody)));
    c.append(this.panel('Rules (Drag to Change Order)', body, 'pf-nopad'));
    c.append(el('div', 'pf-btnbar', addBtn, delBtn));
    this.updateDeleteBtn();
  }

  updateDeleteBtn() { if (this.refs.delBtn) this.refs.delBtn.disabled = this.selected.size === 0; }

  iconBtn(glyph, title, onclick, disabled = false, extra = '') {
    return h('button', { type: 'button', class: `pf-act ${extra}`, title, 'aria-label': title, disabled: disabled || undefined, onclick: disabled ? undefined : onclick }, glyph);
  }

  setDefault(policy) {
    const { errs } = this.run(defaultCommand(policy));
    if (!errs.length) this.pending = true;
    this.render();
  }

  confirmDelete(nums) {
    if (!nums.length) return;
    const body = el('div', 'pf-modal-body', nums.length === 1 ? 'Are you sure you want to delete this rule?' : `Are you sure you want to delete these ${nums.length} rules?`);
    this.openModal('Delete', body, [
      h('button', { type: 'button', class: 'pf-btn pf-btn-default', onclick: () => this.closeModal() }, 'Cancel'),
      h('button', { type: 'button', class: 'pf-btn pf-btn-danger', 'data-act': 'confirm-delete', onclick: () => {
        for (const cmd of deleteCommands(nums)) this.run(cmd);
        this.selected.clear();
        this.pending = true;
        this.closeModal();
        this.render();
      } }, 'Delete'),
    ]);
  }

  openModal(title, body, buttons) {
    clear(this.modalHost);
    this.modalHost.append(el('div', 'pf-modal-backdrop', el('div', 'pf-modal', { role: 'dialog' },
      el('div', 'pf-modal-header', el('b', '', title)), body, el('div', 'pf-modal-footer', ...buttons))));
  }
  closeModal() { clear(this.modalHost); }

  // ---- Add / edit rule ---------------------------------------------------------------------------------
  openForm(rule, readonly = false) {
    this.formReadonly = readonly && !!rule;
    this.formErrors = [];
    if (rule) {
      const p = protoFromRule(rule);
      const pr = String(rule.port);
      const m = pr.match(/^(\d+)-(\d+)$/);
      this.form = {
        action: rule.action, proto: p, source: rule.from && rule.from !== 'any' ? 'single' : 'any', sourceValue: rule.from && rule.from !== 'any' ? rule.from : '',
        dest: rule.dst, portFrom: pr === 'any' ? '' : m ? m[1] : pr, portTo: m ? m[2] : '',
      };
    } else {
      this.form = { action: 'pass', proto: 'tcp', source: 'any', sourceValue: '', dest: this.aliases[0]?.name || 'any', portFrom: '', portTo: '' };
    }
    this.page = 'ruleform';
    this.render();
    this.root.scrollTop = 0;
  }

  readForm() {
    const q = (n) => this.formEl.querySelector(`[name="${n}"]`);
    return {
      action: q('action').value, proto: q('proto').value, source: q('source').value, sourceValue: q('sourceValue').value,
      dest: q('dest').value, portFrom: q('portFrom').value, portTo: q('portTo').value,
    };
  }

  renderForm(c) {
    const f = this.form;
    const ro = this.formReadonly;
    c.append(this.crumbs(['Firewall', 'Rules', 'WAN', 'Edit']));
    if (this.formErrors.length) {
      c.append(this.alertBox('danger', el('b', '', 'The following input errors were detected:'), el('ul', '', ...this.formErrors.map((e) => el('li', '', e)))));
    }
    if (ro) c.append(this.alertBox('info', 'This lab does not edit a rule in place: the rule editor only appends rules. Use the copy icon on the rules list to add a changed copy, then delete the original.'));
    const sel = (name, opts, val, onchange) => {
      const s = h('select', { name, class: 'pf-control', disabled: ro || undefined, onchange }, ...opts.map(([v, l]) => h('option', { value: v }, l)));
      s.value = val;
      return s;
    };
    const inp = (name, val, ph, cls = '') => h('input', { name, type: 'text', class: `pf-control ${cls}`, value: val || '', placeholder: ph || '', disabled: ro || undefined, autocomplete: 'off', spellcheck: 'false' });
    const group = (label, ctl, help) => el('div', 'pf-group', el('label', 'pf-label-col', label), el('div', 'pf-ctl-col', ctl, help ? el('span', 'pf-help', help) : null));
    const dests = [['any', 'Any'], ...this.aliases.map((a) => [a.name, `${a.name} (${a.values})`])];
    const preview = el('div', 'pf-help pf-preview');
    const upd = () => {
      if (ro) return;
      const b = buildRuleCommand(this.readForm());
      preview.textContent = b.ok ? `This lab applies the rule as:  ${b.command}` : '';
    };
    const srcVal = inp('sourceValue', f.sourceValue, 'Address or alias, e.g. scoring');
    const srcSel = sel('source', [['any', 'Any'], ['single', 'Single host or alias']], f.source, () => { srcVal.style.display = srcSel.value === 'single' ? '' : 'none'; upd(); });
    srcVal.style.display = f.source === 'single' ? '' : 'none';
    const protoSel = sel('proto', PROTO_CHOICES.map((p) => [p.value, p.label]), f.proto, upd);
    const descr = h('input', { type: 'text', class: 'pf-control', disabled: true, value: 'Generated from the rule' });
    const form = h('form', { class: 'pf-form', autocomplete: 'off', oninput: upd, onsubmit: (e) => { e.preventDefault(); this.saveForm(); } },
      this.panel('Edit Firewall Rule', el('div', '',
        group('Action', sel('action', [['pass', 'Pass'], ['block', 'Block']], f.action, upd), 'Choose what to do with packets that match the criteria specified below. Hint: the difference between block and reject is that with reject, a packet (TCP RST or ICMP port unreachable for UDP) is returned to the sender, whereas with block the packet is dropped silently.'),
        group('Disabled', el('label', 'pf-check', h('input', { type: 'checkbox', disabled: true }), ' Disable this rule')),
        group('Interface', sel('iface', [['wan', 'WAN']], 'wan'), 'Choose the interface from which packets must come to match this rule.'),
        group('Address Family', sel('af', [['inet', 'IPv4']], 'inet'), 'Select the Internet Protocol version this rule applies to.'),
        group('Protocol', protoSel, 'Choose which IP protocol this rule should match.'))),
      this.panel('Source', el('div', '',
        group('Source', el('div', 'pf-inline', srcSel, srcVal), 'The scoring engine alias is "scoring" (a single host).'))),
      this.panel('Destination', el('div', '',
        group('Destination', sel('dest', dests, f.dest, upd)),
        group('Destination Port Range', el('div', 'pf-inline', el('span', 'pf-inl-label', 'From'), inp('portFrom', f.portFrom, 'any', 'pf-port'), el('span', 'pf-inl-label', 'To'), inp('portTo', f.portTo, '', 'pf-port')),
          'Specify the destination port or port range for this rule. The "To" field may be left empty if only filtering a single port. Leave both empty for any.'))),
      this.panel('Extra Options', el('div', '',
        group('Log', el('label', 'pf-check', h('input', { type: 'checkbox', disabled: true, checked: true }), ' Log packets that are handled by this rule')),
        group('Description', descr, 'A description may be entered here for administrative reference.'))),
      el('div', 'pf-btnbar pf-left',
        ro ? null : h('button', { type: 'submit', class: 'pf-btn pf-btn-primary', 'data-act': 'save' }, el('i', 'pf-ico', '✔'), ' Save'),
        h('button', { type: 'button', class: 'pf-btn pf-btn-default', 'data-act': 'cancel', onclick: () => this.go('rules') }, ro ? 'Back' : 'Cancel'),
        preview));
    this.formEl = form;
    c.append(form);
    upd();
  }

  saveForm() {
    const f = this.readForm();
    this.form = f;
    const b = buildRuleCommand(f);
    if (!b.ok) { this.formErrors = b.errors; this.render(); return; }
    const { errs } = this.run(b.command);
    if (errs.length) { this.formErrors = errs; this.render(); return; }
    this.pending = true;
    this.formErrors = [];
    this.page = 'rules';
    this.tab = 'wan';
    this.render();
  }

  // ---- Aliases -----------------------------------------------------------------------------------------
  renderAliases(c) {
    c.append(this.crumbs(PAGE_CRUMBS.aliases));
    const tabs = el('ul', 'pf-tabs');
    ['IP', 'Ports', 'URLs', 'All'].forEach((t, i) => tabs.append(el('li', i === 0 ? 'pf-active' : '', h('a', { href: '#', onclick: (e) => e.preventDefault() }, t))));
    c.append(tabs);
    const rows = this.aliases.map((a) => el('tr', '', el('td', '', a.name), el('td', '', a.values), el('td', '', a.descr),
      el('td', 'pf-actions', this.iconBtn('✎', 'Edit alias (not available in this lab)', null, true), this.iconBtn('✖', 'Delete alias (not available in this lab)', null, true))));
    c.append(this.panel('Firewall Aliases IP', el('div', 'pf-scroll', el('table', 'pf-table',
      this.thead(['Name', 'Values', 'Description', 'Actions']), el('tbody', '', ...rows))), 'pf-nopad'));
  }

  // ---- Logs --------------------------------------------------------------------------------------------
  logRows() {
    const hosts = (this.state.scenario.services || []).map((s) => ({ name: s.host, ip: s.ip, ports: s.ports, proto: s.proto }));
    const uniq = [...new Map(hosts.map((x) => [x.name, x])).values()];
    // one entry per host/port set: merge the ports of services on the same host
    for (const u of uniq) u.ports = [...new Set(hosts.filter((x) => x.name === u.name).flatMap((x) => x.ports))];
    return logEntries({ fw: this.fw, hosts: uniq, clock: this.clock(), count: 50, scoringIp: this.scoringIp });
  }

  fillLogBody(tbody) {
    clear(tbody);
    for (const e of this.logRows()) {
      tbody.append(el('tr', '', el('td', e.pass ? 'pf-ok pf-ico-cell' : 'pf-bad pf-ico-cell', e.pass ? '✓' : '✕'), el('td', '', e.time), el('td', '', e.iface),
        el('td', '', e.rule), el('td', '', e.src), el('td', '', e.dst), el('td', '', e.proto)));
    }
  }

  renderLogs(c) {
    c.append(this.crumbs(PAGE_CRUMBS.logs));
    const tabs = el('ul', 'pf-tabs');
    ['System', 'Firewall', 'DHCP', 'Authentication', 'IPsec', 'PPP', 'OpenVPN', 'NTP', 'Packages', 'Settings'].forEach((t) => tabs.append(el('li', t === 'Firewall' ? 'pf-active' : '', h('a', { href: '#', onclick: (e) => e.preventDefault() }, t))));
    const tabs2 = el('ul', 'pf-tabs pf-tabs-sub');
    ['Normal View', 'Dynamic View', 'Summary View'].forEach((t, i) => tabs2.append(el('li', i === 0 ? 'pf-active' : '', h('a', { href: '#', onclick: (e) => e.preventDefault() }, t))));
    const tbody = el('tbody', '');
    this.refs.logBody = tbody;
    this.fillLogBody(tbody);
    c.append(tabs, tabs2, this.panel('Last 50 Firewall Log Entries. (Maximum 50)', el('div', 'pf-scroll', el('table', 'pf-table pf-logs',
      this.thead(['Action', 'Time', 'Interface', 'Rule', 'Source', 'Destination', 'Proto']), tbody)), 'pf-nopad'));
  }

  // ---- Status > Interfaces -----------------------------------------------------------------------------
  renderIfStatus(c) {
    c.append(this.crumbs(PAGE_CRUMBS.ifstatus));
    const s = Math.floor(this.clock());
    const kv = (rows) => el('table', 'pf-table pf-kv', ...rows.map(([k, v]) => el('tr', '', el('th', '', k), el('td', '', v))));
    c.append(
      this.panel('WAN Interface (wan, em0)', kv([['Status', 'up'], ['MAC Address', '00:0c:29:7e:41:a2'], ['IPv4 Address', this.dev.ip || '203.0.113.2'], ['Subnet mask IPv4', '255.255.255.0'],
        ['Gateway IPv4', '203.0.113.1'], ['IPv6 Link Local', 'fe80::20c:29ff:fe7e:41a2%em0'], ['MTU', '1500'], ['Media', '1000baseT <full-duplex>'],
        ['In/out packets', `${48210 + s * 9}/${39877 + s * 7} (${fmtBytes((48210 + s * 9) * 740)}/${fmtBytes((39877 + s * 7) * 610)})`],
        ['In/out errors', '0/0'], ['Collisions', '0']])),
      this.panel('LAN Interface (lan, em1)', kv([['Status', 'up'], ['MAC Address', '00:0c:29:7e:41:ac'], ['IPv4 Address', '10.10.10.1'], ['Subnet mask IPv4', '255.255.255.0'],
        ['MTU', '1500'], ['Media', '1000baseT <full-duplex>'], ['In/out packets', `${30194 + s * 5}/${35662 + s * 6}`], ['In/out errors', '0/0'], ['Collisions', '0']])));
  }

  // ---- Diagnostics > Command Prompt --------------------------------------------------------------------
  renderCmd(c) {
    c.append(this.crumbs(PAGE_CRUMBS.cmd));
    const input = h('input', { type: 'text', class: 'pf-control', name: 'cmd', autocomplete: 'off', spellcheck: 'false', placeholder: 'show', 'aria-label': 'Shell command' });
    const out = el('pre', 'pf-pre', this.cmdOut.join('\n'));
    const exec = () => {
      const line = input.value.trim();
      if (!line) return;
      const res = this.runCmd(line) || { lines: [] };
      this.cmdOut = [`$ ${line}`, ...(res.lines || []).map((l) => l.text), ''];
      out.textContent = this.cmdOut.join('\n');
      input.value = '';
      this.pending = true;
    };
    c.append(this.panel('Execute Shell Command', el('form', 'pf-form', { onsubmit: (e) => { e.preventDefault(); exec(); } },
      el('div', 'pf-group', el('label', 'pf-label-col', 'Command'), el('div', 'pf-ctl-col', input,
        el('span', 'pf-help', 'Rule-editor commands: show, pass|block <proto> to <host> port <p> [from <src>], del <n>, default pass|block, help.'))),
      el('div', 'pf-btnbar pf-left', h('button', { type: 'submit', class: 'pf-btn pf-btn-primary', 'data-act': 'exec' }, 'Execute')))),
    this.panel('Output', out));
  }

  renderStub(c) {
    c.append(this.crumbs([this.stubName || 'Page']));
    c.append(this.alertBox('info', `${this.stubName || 'This page'} is part of the real pfSense GUI but is not used in this exercise. Firewall > Rules, Firewall > Aliases, Status > System Logs and Diagnostics > Command Prompt are live.`));
  }

  // ---- live ----------------------------------------------------------------------------------------------
  /** Once a second. Never rebuilds a form being edited and never moves focus. */
  refresh() {
    if (!this.alive) return;
    if (this.page === 'dash') this.updateDash();
    else if (this.page === 'logs' && this.refs.logBody) this.fillLogBody(this.refs.logBody);
    else if (this.page === 'rules' && this.tab === 'wan') {
      if (this.sig() !== this.renderedSig) { this.render(); return; }
      const clk = this.clock();
      this.main.querySelectorAll('td.pf-states').forEach((td) => {
        const i = +td.dataset.i;
        const r = this.fw.rules[i];
        if (r) td.textContent = ruleCells(r, i, clk, this.scoringIp).states;
      });
    }
  }

  destroy() {
    this.alive = false;
    this.root.removeEventListener('click', this.onDocClick);
    this.root.remove();
  }
}
