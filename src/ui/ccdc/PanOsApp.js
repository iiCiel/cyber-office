// The PAN-OS 11.0 web interface of the Palo Alto firewall (PA-VM), opened in a browser on the team workstation at
// the firewall's management IP, the way it was reached at the MWCCDC Invitational (Nov 14, 2026). Screens are
// matched to the team's own screenshots from that day (docs/reference/panos-*.png): Policies > Security and NAT,
// Objects > Security Profile Groups, Network > Zones, Device > Administrators, and the Commit / Commit Status
// dialogs.
//
// Every click that changes config becomes a PAN-OS CLI line sent through run(line), exactly what the PA console
// accepts, so grading stays in ccdcLab.runLine() (see game/panMap.js). Edits go to the candidate config; nothing
// is live until Commit.
//   const app = new PanOsApp({ dev, state, run: (line) => ({ lines, effects }) });  parent.append(app.el);
import { h, clear } from '../dom.js';
import { initialPan, PAN_PREDEFINED } from '../../game/panMap.js';

const TABS = ['Dashboard', 'ACC', 'Monitor', 'Policies', 'Objects', 'Network', 'Device'];
const TREES = {
  Policies: ['Security', 'NAT', 'QoS', 'Policy Based Forwarding', 'Decryption', 'Tunnel Inspection', 'Application Override', 'Authentication', 'DoS Protection', 'SD-WAN'],
  Objects: ['Addresses', 'Address Groups', 'Regions', 'Applications', 'Application Groups', 'Services', 'Service Groups', 'Tags', 'Antivirus', 'Anti-Spyware', 'Vulnerability Protection', 'URL Filtering', 'Security Profile Groups', 'Log Forwarding'],
  Network: ['Interfaces', 'Zones', 'VLANs', 'Virtual Wires', 'Virtual Routers', 'IPSec Tunnels', 'DHCP', 'DNS Proxy', 'Network Profiles'],
  Device: ['Setup', 'High Availability', 'Config Audit', 'Administrators', 'Admin Roles', 'Authentication Profile', 'Log Settings', 'Server Profiles', 'Software', 'Licenses'],
};
const START = { Policies: 'Security', Objects: 'Security Profile Groups', Network: 'Zones', Device: 'Administrators' };
const OPTIMIZER = [['New App Viewer', '1+'], ['Rules Without App Controls', '1'], ['Unused Apps', '0'], ['Log Forwarding for Security Services', '']];
const APPS = ['web-browsing', 'ssl', 'ping', 'icmp', 'smtp', 'imap', 'ssh', 'ntp', 'splunk', 'dns', 'ldap', 'ms-ds-smb', 'ms-rdp', 'mssql-db', 'msrpc'];
const ADDRESSES = ['172.20.240.10', '172.20.240.15', '172.20.240.20', '172.20.240.100', '172.20.240.120'];
const ZONES = ['external', 'internal'];

// Rules as found on Nov 14 (kept for anyone importing the old constant).
export const PAN_RULES_AS_FOUND = initialPan().candidate.rules.concat(PAN_PREDEFINED);

const link = (text, onclick) => h('span', { class: 'pan-link', onclick }, text);
const zoneTag = (z) => (ZONES.includes(z) ? h('span', { class: 'pan-link pan-zone' }, h('i', { class: 'pan-zone-ic', 'aria-hidden': 'true' }), z) : link(z));
const cellList = (list, fmt = link) => h('div', { class: 'pan-cell-list' }, (list || ['any']).map((x) => h('div', {}, fmt(x))));
const q = (name) => `"${name}"`;
const listArg = (arr) => (arr.length > 1 ? `[ ${arr.join(' ')} ]` : arr[0] || 'any');
const splitList = (v) => String(v || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

export class PanOsApp {
  constructor(o = {}) {
    this.o = o;
    this.tab = 'Policies';
    this.page = 'Security';
    this.sel = new Set();
    this.sigSeen = '';
    this.local = o.state ? null : initialPan(); // view-only fallback when opened without a game state
    this.el = h('div', { class: 'pan', 'data-device': o.dev?.id || 'pa' });
    this.top = h('header', { class: 'pan-top' });
    this.body = h('div', { class: 'pan-main' });
    this.modal = h('div', { class: 'pan-modal-host' });
    this.el.append(this.top, h('div', { class: 'pan-subbar' }, h('span', { class: 'pan-sub-ic', title: 'Refresh', onclick: () => this.render() }, '⟳'), h('span', { class: 'pan-sub-ic', title: 'Help' }, '?')), this.body, this.footer(), this.modal);
    this.render();
  }

  // ---- state ----------------------------------------------------------------------------------------------
  get pan() { return this.o.state?.devState?.[this.o.dev.id]?.pan || this.local; }
  get cfg() { return this.pan.candidate; }
  sig() { return JSON.stringify([this.pan.candidate, this.pan.dirty, this.pan.commits]); }
  send(line) {
    if (!this.o.run) return { errs: ['This firewall is view-only here.'] };
    const res = this.o.run(line) || { lines: [] };
    return { res, errs: (res.lines || []).filter((l) => l.cls === 'err').map((l) => l.text) };
  }
  // Send several lines; stop and show the first validation error, like the web UI's red error box.
  sendAll(lines) {
    for (const l of lines) {
      const { errs } = this.send(l);
      if (errs.length) { this.error(errs); return false; }
    }
    this.render();
    return true;
  }

  // ---- chrome ---------------------------------------------------------------------------------------------
  header() {
    clear(this.top);
    this.top.append(
      h('div', { class: 'pan-brand' }, h('i', { class: 'pan-brand-mark', 'aria-hidden': 'true' }), h('span', {}, this.o.dev?.panHost || 'PA-VM')),
      h('nav', { class: 'pan-tabs' }, TABS.map((t) => h('span', { class: `pan-tab${t === this.tab ? ' on' : ''}`, 'data-tab': t, onclick: () => this.go(t) }, t.toUpperCase()))),
      h('div', { class: 'pan-right' },
        h('button', { type: 'button', class: `pan-commit${this.pan.dirty ? ' pan-commit-on' : ''}`, title: 'Commit', onclick: () => this.commitDialog() }, h('i', { class: 'pan-commit-ic', 'aria-hidden': 'true' }), 'Commit ⌄'),
        h('span', { class: 'pan-hic' }, '▢'), h('span', { class: 'pan-hic' }, '▣⌄'), h('span', { class: 'pan-hic' }, '⌕')));
  }

  footer() {
    return h('footer', { class: 'pan-status' }, h('span', {}, 'admin'), h('span', {}, 'Logout'), h('span', {}, 'Last Login Time: 11/14/2026 06:47:15'), h('span', {}, 'Session Expire Time: 12/14/2026 06:47:56'),
      h('span', { class: 'pan-status-r' }, h('span', {}, '✉'), h('span', {}, 'Tasks'), h('span', {}, 'Language'), h('b', { class: 'pan-pa-logo' }, 'paloalto')));
  }

  go(tab, page) {
    this.tab = tab;
    this.page = page || START[tab] || '';
    this.sel.clear();
    this.render();
  }

  render() {
    this.sigSeen = this.sig();
    this.header();
    clear(this.body);
    const tree = TREES[this.tab];
    if (tree) this.body.append(this.nav(tree));
    this.body.append(h('section', { class: 'pan-content' }, this.view()));
  }

  nav(tree) {
    return h('aside', { class: 'pan-nav' },
      h('ul', { class: 'pan-tree' }, tree.map((n) => h('li', { class: n === this.page ? 'on' : '', 'data-page': n, onclick: () => this.go(this.tab, n) },
        h('i', { class: `pan-tree-ic pan-ti-${n.split(' ')[0].toLowerCase()}`, 'aria-hidden': 'true' }), n))),
      this.tab === 'Policies' ? h('div', { class: 'pan-opt' }, h('div', { class: 'pan-opt-h' }, h('span', {}, 'Policy Optimizer'), h('span', {}, '—')),
        h('ul', {}, OPTIMIZER.map(([n, c]) => h('li', {}, h('i', { class: 'pan-tree-ic pan-ti-opt', 'aria-hidden': 'true' }), h('span', {}, n), h('b', {}, c))))) : null,
      h('div', { class: 'pan-objaddr' }, h('span', {}, 'Object : Addresses'), h('span', {}, '+')));
  }

  view() {
    const key = `${this.tab}/${this.page}`;
    if (key === 'Policies/Security') return this.securityView();
    if (key === 'Policies/NAT') return this.natView();
    if (key === 'Objects/Security Profile Groups') return this.groupsView();
    if (key === 'Network/Zones') return this.zonesView();
    if (key === 'Device/Administrators') return this.adminsView();
    if (this.tab === 'Dashboard') return h('div', { class: 'pan-empty' }, h('h3', {}, 'General Information'), h('table', { class: 'pan-kv' }, [['Device Name', this.o.dev?.panHost || 'PA-VM'], ['MGT IP Address', this.o.dev?.ip || '172.20.240.200'], ['Model', 'PA-VM'], ['Software Version', '11.0.2'], ['Time', 'Sat Nov 14 13:02:11 2026']].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))));
    return h('div', { class: 'pan-empty' }, `${this.page || this.tab}: nothing to change here for this replay.`);
  }

  filterBar(n) {
    return h('div', { class: 'pan-filter' }, h('span', { class: 'pan-f-ic' }, '⌕'), h('div', { class: 'pan-f-box' }, h('span', {}, `${n} item${n === 1 ? '' : 's'}`)), h('span', { class: 'pan-f-ic' }, '→'), h('span', { class: 'pan-f-ic' }, '✕'));
  }

  toolbar(buttons) {
    return h('div', { class: 'pan-toolbar' }, buttons.map(([label, fn, on]) => h('button', { type: 'button', class: `pan-tb${on ? '' : ' off'}`, 'data-act': label, disabled: !on, onclick: fn }, h('i', { class: `pan-tb-ic pan-tb-${label.toLowerCase().split(' ')[0]}`, 'aria-hidden': 'true' }), label)));
  }

  // ---- Policies > Security ---------------------------------------------------------------------------------
  securityView() {
    const rules = this.cfg.rules.concat(this.cfg.defaults);
    const selRules = rules.filter((r) => this.sel.has(r.name));
    const one = selRules.length === 1 ? selRules[0] : null;
    const user = selRules.filter((r) => !r.predefined);
    const toggle = (r) => { if (this.sel.has(r.name)) this.sel.delete(r.name); else this.sel.add(r.name); this.render(); };
    const row = (r, i) => h('tr', { class: `${r.predefined ? 'pan-pre' : ''}${i % 2 ? ' pan-alt' : ''}${r.disabled ? ' pan-dis' : ''}${this.sel.has(r.name) ? ' pan-sel' : ''}`, 'data-rule': r.name, onclick: () => toggle(r) },
      h('td', { class: 'pan-num' }, String(i + 1)),
      h('td', {}, link(r.name, (e) => { e.stopPropagation(); this.ruleDialog(r); }), r.predefined ? h('i', { class: `pan-gear${r.action === 'deny' ? ' pan-gear-o' : ''}`, 'aria-hidden': 'true' }) : null),
      h('td', {}, link('none')), h('td', {}, r.type),
      h('td', {}, cellList(r.from, zoneTag)), h('td', {}, cellList(r.source)), h('td', {}, link('any')), h('td', {}, link('any')),
      h('td', {}, cellList(r.to, zoneTag)), h('td', {}, cellList(r.destination)), h('td', {}, link('any')),
      h('td', {}, cellList(r.application)), h('td', {}, cellList(r.service)),
      h('td', {}, h('span', { class: `pan-act pan-act-${r.action}` }, h('i', { 'aria-hidden': 'true' }), r.action === 'allow' ? 'Allow' : 'Deny')),
      h('td', {}, r.group ? h('span', { class: 'pan-prof', title: `Group: ${r.group}` }, h('i', { class: 'pan-prof-ic', 'aria-hidden': 'true' }), r.group) : link('none')),
      h('td', {}, r.logEnd ? h('i', { class: 'pan-log-ic', title: 'Log at Session End', 'aria-hidden': 'true' }) : null));
    const subCols = ['ZONE', 'ADDRESS', 'USER', 'DEVICE', 'ZONE', 'ADDRESS', 'DEVICE'];
    const table = h('table', { class: 'pan-grid' },
      h('thead', {},
        h('tr', { class: 'pan-grp' }, h('th', { rowspan: 2, class: 'pan-num' }, ''), h('th', { rowspan: 2 }, 'NAME'), h('th', { rowspan: 2 }, 'TAGS'), h('th', { rowspan: 2 }, 'TYPE'),
          h('th', { colspan: 4, class: 'pan-grp-h' }, 'Source'), h('th', { colspan: 3, class: 'pan-grp-h' }, 'Destination'),
          h('th', { rowspan: 2 }, 'APPLICATION'), h('th', { rowspan: 2 }, 'SERVICE'), h('th', { rowspan: 2 }, 'ACTION'), h('th', { rowspan: 2 }, 'PROFILE'), h('th', { rowspan: 2 }, 'OPTIONS')),
        h('tr', {}, subCols.map((c) => h('th', {}, c)))),
      h('tbody', {}, rules.map(row)));
    const moveMenu = (e) => { e.stopPropagation(); this.moveMenu(e.currentTarget, one); };
    const tb = this.toolbar([
      ['Add', () => this.ruleDialog(null), true],
      ['Delete', () => { if (this.sendAll(user.map((r) => `delete rulebase security rules ${q(r.name)}`))) { this.sel.clear(); this.render(); } }, user.length > 0],
      ['Clone', () => this.ruleDialog({ ...one, name: `${one.name}-1` }, true), !!one && !one.predefined],
      ['Override', () => this.ruleDialog(one), !!one && one.predefined],
      ['Revert', () => this.sendAll(PAN_PREDEFINED.filter((d) => this.sel.has(d.name)).map((d) => `set rulebase default-security-rules rules ${d.name} log-end ${d.logEnd ? 'yes' : 'no'} action ${d.action}`)), selRules.some((r) => r.predefined)],
      ['Enable', () => this.sendAll(user.map((r) => `set rulebase security rules ${q(r.name)} disabled no`)), user.some((r) => r.disabled)],
      ['Disable', () => this.sendAll(user.map((r) => `set rulebase security rules ${q(r.name)} disabled yes`)), user.some((r) => !r.disabled)],
      ['Move ▾', moveMenu, !!one && !one.predefined],
      ['PDF/CSV', () => {}, true],
    ]);
    tb.append(h('label', { class: 'pan-tb-chk' }, h('input', { type: 'checkbox' }), 'Highlight Unused Rules'), h('label', { class: 'pan-tb-chk' }, h('input', { type: 'checkbox' }), 'View Rulebase as Groups'));
    return [this.filterBar(rules.length), h('div', { class: 'pan-grid-wrap' }, table), tb];
  }

  moveMenu(anchor, rule) {
    const names = this.cfg.rules.map((r) => r.name);
    const i = names.indexOf(rule.name);
    const pick = (line) => { menu.remove(); this.sendAll([line]); };
    const base = `move rulebase security rules ${q(rule.name)}`;
    const menu = h('div', { class: 'pan-menu' },
      h('div', { onclick: () => pick(`${base} top`) }, 'Move Top'),
      h('div', { class: i > 0 ? '' : 'off', onclick: () => i > 0 && pick(`${base} before ${q(names[i - 1])}`) }, 'Move Up'),
      h('div', { class: i < names.length - 1 ? '' : 'off', onclick: () => i < names.length - 1 && pick(`${base} after ${q(names[i + 1])}`) }, 'Move Down'),
      h('div', { onclick: () => pick(`${base} bottom`) }, 'Move Bottom'));
    const r = anchor.getBoundingClientRect(); const host = this.el.getBoundingClientRect();
    Object.assign(menu.style, { left: `${r.left - host.left}px`, bottom: `${host.bottom - r.top + 2}px` });
    this.el.append(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  // Security Policy Rule dialog: General / Source / Destination / Application / Service/URL Category / Actions.
  ruleDialog(rule, isClone = false) {
    const pre = !!rule?.predefined;
    const isNew = !rule || isClone;
    const r = rule ? JSON.parse(JSON.stringify(rule)) : { name: '', from: ['any'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['application-default'], action: 'allow', logEnd: true };
    const tabs = pre ? ['General', 'Actions'] : ['General', 'Source', 'Destination', 'Application', 'Service/URL Category', 'Actions'];
    let tab = pre ? 'Actions' : 'General';
    const f = {};
    const body = h('div', { class: 'pan-dlg-body' });
    const groups = Object.keys(this.cfg.profileGroups);
    const multi = (key, label, opts) => {
      const anyBox = h('input', { type: 'checkbox', checked: r[key].includes('any'), 'data-f': `${key}-any` });
      const box = h('input', { type: 'text', class: 'pan-in', value: r[key].includes('any') ? '' : r[key].join(', '), placeholder: opts.join(', '), 'data-f': key, list: `pan-dl-${key}` });
      f[key] = () => (anyBox.checked || !splitList(box.value).length ? ['any'] : splitList(box.value));
      return h('div', { class: 'pan-fld' }, h('label', { class: 'pan-chk' }, anyBox, 'Any'), h('div', { class: 'pan-fld-h' }, label), box,
        h('datalist', { id: `pan-dl-${key}` }, opts.map((o) => h('option', { value: o }))));
    };
    const panes = {
      General: () => h('div', {}, h('div', { class: 'pan-row' }, h('label', {}, 'Name'), f.nameEl = h('input', { type: 'text', class: 'pan-in', value: r.name, disabled: !isNew, 'data-f': 'name' })),
        h('div', { class: 'pan-row' }, h('label', {}, 'Rule Type'), h('span', {}, pre ? r.type : 'universal (default)'))),
      Source: () => h('div', {}, multi('from', 'SOURCE ZONE', ZONES), multi('source', 'SOURCE ADDRESS', ['198.51.100.0/24'])),
      Destination: () => h('div', {}, multi('to', 'DESTINATION ZONE', ZONES), multi('destination', 'DESTINATION ADDRESS', ADDRESSES)),
      Application: () => multi('application', 'APPLICATIONS', APPS),
      'Service/URL Category': () => {
        const sel = h('select', { class: 'pan-in', 'data-f': 'service-mode' }, ['application-default', 'any', 'select'].map((v) => h('option', { value: v, selected: (r.service[0] === v) || (v === 'select' && !['any', 'application-default'].includes(r.service[0])) }, v)));
        const box = h('input', { type: 'text', class: 'pan-in', placeholder: 'tcp-5985, tcp-3389', value: ['any', 'application-default'].includes(r.service[0]) ? '' : r.service.join(', '), 'data-f': 'service' });
        f.service = () => (sel.value === 'select' ? splitList(box.value) : [sel.value]);
        return h('div', {}, h('div', { class: 'pan-fld-h' }, 'SERVICE'), sel, box);
      },
      Actions: () => {
        const act = h('select', { class: 'pan-in', 'data-f': 'action' }, ['allow', 'deny', 'drop'].map((v) => h('option', { value: v, selected: r.action === v }, v === 'allow' ? 'Allow' : v === 'deny' ? 'Deny' : 'Drop')));
        const ptype = h('select', { class: 'pan-in', 'data-f': 'profile-type', disabled: pre }, ['None', 'Group'].map((v) => h('option', { value: v, selected: (v === 'Group') === !!r.group }, v)));
        const grp = h('select', { class: 'pan-in', 'data-f': 'group', disabled: pre }, (groups.length ? groups : ['None']).map((g) => h('option', { value: g, selected: r.group === g }, g)));
        const log = h('input', { type: 'checkbox', checked: !!r.logEnd, 'data-f': 'log-end' });
        f.action = () => act.value; f.group = () => (ptype.value === 'Group' && groups.includes(grp.value) ? grp.value : null); f.logEnd = () => log.checked;
        return h('div', { class: 'pan-cols' },
          h('fieldset', {}, h('legend', {}, 'Action Setting'), h('div', { class: 'pan-row' }, h('label', {}, 'Action'), act)),
          h('fieldset', {}, h('legend', {}, 'Profile Setting'), h('div', { class: 'pan-row' }, h('label', {}, 'Profile Type'), ptype), h('div', { class: 'pan-row' }, h('label', {}, 'Group Profile'), grp),
            pre ? h('div', { class: 'pan-hint' }, 'Predefined rules keep their profile.') : !groups.length ? h('div', { class: 'pan-hint' }, 'No groups yet: Objects > Security Profile Groups > Add.') : null),
          h('fieldset', {}, h('legend', {}, 'Log Setting'), h('label', { class: 'pan-chk' }, h('input', { type: 'checkbox', disabled: true }), 'Log at Session Start'), h('label', { class: 'pan-chk' }, log, 'Log at Session End')));
      },
    };
    const built = {};
    const tabBar = h('div', { class: 'pan-dlg-tabs' });
    const show = () => {
      clear(tabBar); clear(body);
      tabs.forEach((t) => tabBar.append(h('span', { class: t === tab ? 'on' : '', 'data-dtab': t, onclick: () => { tab = t; show(); } }, t)));
      built[tab] = built[tab] || panes[tab]();
      body.append(built[tab]);
    };
    // Build every pane once so their getters exist even if the user never opens that tab.
    for (const t of tabs) built[t] = panes[t]();
    show();
    const ok = () => {
      const name = (f.nameEl?.value || r.name).trim();
      if (!name) { this.error(['Name is required.']); return; }
      if (isNew && this.cfg.rules.concat(this.cfg.defaults).some((x) => x.name.toLowerCase() === name.toLowerCase())) { this.error([`A rule named "${name}" already exists.`]); return; }
      const action = f.action ? f.action() : r.action;
      const logEnd = f.logEnd ? f.logEnd() : r.logEnd;
      let line;
      if (pre) line = `set rulebase default-security-rules rules ${r.name} action ${action} log-end ${logEnd ? 'yes' : 'no'}`;
      else {
        const g = f.group ? f.group() : r.group;
        line = [`set rulebase security rules ${q(name)}`, `from ${listArg(f.from())}`, `to ${listArg(f.to())}`, `source ${listArg(f.source())}`, `destination ${listArg(f.destination())}`,
          `application ${listArg(f.application())}`, `service ${listArg(f.service())}`, `action ${action}`, g ? `profile-setting group ${q(g)}` : 'profile-setting none', `log-end ${logEnd ? 'yes' : 'no'}`].join(' ');
      }
      if (this.sendAll([line])) close();
    };
    const close = this.dialog(pre ? `Security Policy Rule - predefined (Override)` : 'Security Policy Rule', h('div', {}, tabBar, body), [['OK', ok, true], ['Cancel', () => close()]], 'pan-dlg-rule');
  }

  // ---- Policies > NAT (as found: the Default NAT rule, disabled, shown greyed out) ------------------------------
  natView() {
    const head = ['NAME', 'TAGS', 'SOURCE ZONE', 'DESTINATION ZONE', 'DESTINATION INTERFACE', 'SOURCE ADDRESS', 'DESTINATION ADDRESS', 'SERVICE', 'SOURCE TRANSLATION', 'DESTINATION TRANSLATION'];
    const t = h('table', { class: 'pan-grid pan-nat' },
      h('thead', {}, h('tr', { class: 'pan-grp' }, h('th', { rowspan: 2, class: 'pan-num' }), h('th', { rowspan: 2 }, 'NAME'), h('th', { rowspan: 2 }, 'TAGS'), h('th', { colspan: 6, class: 'pan-grp-h' }, 'Original Packet'), h('th', { colspan: 2, class: 'pan-grp-h' }, 'Translated Packet')),
        h('tr', {}, head.slice(2).map((c) => h('th', {}, c)))),
      h('tbody', {}, h('tr', { class: 'pan-dis' }, h('td', { class: 'pan-num' }, '1'), h('td', {}, 'Default NAT'), h('td', {}, 'none'), h('td', {}, zoneTag('internal')), h('td', {}, zoneTag('external')),
        h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, cellList(['dynamic-ip-and-port', 'ethernet1/2', '172.16.0.1/24'], (x) => h('span', {}, x))), h('td', {}, 'none'))));
    return [this.filterBar(1), h('div', { class: 'pan-grid-wrap' }, t), h('div', { class: 'pan-note' }, 'VyOS does the inbound NAT in this network, so Security rules here match the inside (172.20.240.x) addresses.'),
      this.toolbar([['Add', null, false], ['Delete', null, false], ['Clone', null, false], ['Enable', null, false], ['Disable', null, false], ['PDF/CSV', () => {}, true]])];
  }

  // ---- Objects > Security Profile Groups -------------------------------------------------------------------
  groupsView() {
    const groups = Object.entries(this.cfg.profileGroups);
    const cols = ['NAME', 'LOCATION', 'ANTIVIRUS PROFILE', 'ANTI-SPYWARE PROFILE', 'VULNERABILITY PROTECTION PROFILE', 'URL FILTERING PROFILE', 'FILE BLOCKING PROFILE', 'DATA FILTERING PROFILE', 'WILDFIRE ANALYSIS PROFILE'];
    const sel = groups.filter(([n]) => this.sel.has(n));
    const t = h('table', { class: 'pan-grid pan-objs' },
      h('thead', {}, h('tr', {}, h('th', { class: 'pan-cb' }, h('input', { type: 'checkbox' })), cols.map((c) => h('th', {}, c)))),
      h('tbody', {}, groups.map(([n, g]) => h('tr', { class: this.sel.has(n) ? 'pan-sel' : '', 'data-group': n },
        h('td', { class: 'pan-cb' }, h('input', { type: 'checkbox', checked: this.sel.has(n), onchange: () => { if (this.sel.has(n)) this.sel.delete(n); else this.sel.add(n); this.render(); } })),
        h('td', {}, link(n, () => this.groupDialog(n, g))), h('td', {}, ''), h('td', {}, g.virus || ''), h('td', {}, g.spyware || ''), h('td', {}, g.vulnerability || ''), h('td', {}, ''), h('td', {}, ''), h('td', {}, ''), h('td', {}, '')))));
    return [this.filterBar(groups.length), h('div', { class: 'pan-grid-wrap' }, t),
      this.toolbar([['Add', () => this.groupDialog(null), true], ['Delete', () => { if (this.sendAll(sel.map(([n]) => `delete profile-group ${q(n)}`))) { this.sel.clear(); this.render(); } }, sel.length > 0], ['Clone', null, false], ['PDF/CSV', () => {}, true]])];
  }

  groupDialog(name, g = {}) {
    const nm = h('input', { type: 'text', class: 'pan-in', value: name || '', disabled: !!name, 'data-f': 'gname' });
    const pick = (key, label) => {
      const s = h('select', { class: 'pan-in', 'data-f': key }, ['None', 'default', 'strict'].map((v) => h('option', { value: v, selected: (g[key] || 'None') === v }, v)));
      return [h('div', { class: 'pan-row' }, h('label', {}, label), s), () => s.value];
    };
    const rows = [pick('virus', 'Antivirus Profile'), pick('spyware', 'Anti-Spyware Profile'), pick('vulnerability', 'Vulnerability Protection Profile')];
    const ok = () => {
      const n = nm.value.trim();
      if (!n) { this.error(['Name is required.']); return; }
      const parts = [['virus', rows[0][1]()], ['spyware', rows[1][1]()], ['vulnerability', rows[2][1]()]].filter(([, v]) => v !== 'None').map(([k, v]) => `${k} ${v}`);
      if (this.sendAll([`set profile-group ${q(n)} ${parts.join(' ')}`.trim()])) close();
    };
    const close = this.dialog('Security Profile Group', h('div', {}, h('div', { class: 'pan-row' }, h('label', {}, 'Name'), nm), rows.map((r) => r[0]),
      h('div', { class: 'pan-row' }, h('label', {}, 'URL Filtering Profile'), h('select', { class: 'pan-in', disabled: true }, h('option', {}, 'None')))), [['OK', ok, true], ['Cancel', () => close()]]);
  }

  // ---- Network > Zones -----------------------------------------------------------------------------------------
  zonesView() {
    const head = ['NAME', 'TYPE', 'INTERFACES / VIRTUAL SYSTEMS', 'ZONE PROTECTION PROFILE', 'ENABLE HEADER INSPECTION', 'PACKET BUFFER PROTECTION', 'LOG SETTING'];
    const chk = (on) => h('input', { type: 'checkbox', checked: on, disabled: true });
    const t = h('table', { class: 'pan-grid pan-objs' },
      h('thead', {}, h('tr', { class: 'pan-grp' }, h('th', { rowspan: 2, class: 'pan-cb' }, h('input', { type: 'checkbox' })), head.map((c) => h('th', { rowspan: 2 }, c)), h('th', { colspan: 3, class: 'pan-grp-h' }, 'User-ID'), h('th', { colspan: 3, class: 'pan-grp-h' }, 'Device-ID')),
        h('tr', {}, ['ENABLED', 'INCLUDED NETWORKS', 'EXCLUDED NETWORKS', 'ENABLED', 'INCLUDED NETWORKS', 'EXCLUDED NETWORKS'].map((c) => h('th', {}, c)))),
      h('tbody', {}, [['external', 'ethernet1/2'], ['internal', 'ethernet1/3']].map(([z, ifc], i) => h('tr', { class: i % 2 ? 'pan-alt' : '' },
        h('td', { class: 'pan-cb' }, h('input', { type: 'checkbox' })), h('td', {}, link(z)), h('td', {}, 'layer3'), h('td', {}, ifc), h('td', {}, ''), h('td', {}, chk(false)), h('td', {}, chk(true)), h('td', {}, ''),
        h('td', {}, chk(false)), h('td', {}, 'any'), h('td', {}, 'none'), h('td', {}, chk(false)), h('td', {}, 'any'), h('td', {}, 'none')))));
    return [this.filterBar(2), h('div', { class: 'pan-grid-wrap' }, t), this.toolbar([['Add', null, false], ['Delete', null, false], ['Clone', null, false], ['PDF/CSV', () => {}, true]])];
  }

  // ---- Device > Administrators ---------------------------------------------------------------------------------
  adminsView() {
    const t = h('table', { class: 'pan-grid pan-objs' },
      h('thead', {}, h('tr', {}, h('th', { class: 'pan-cb' }, h('input', { type: 'checkbox' })), ['NAME', 'ROLE', 'AUTHENTICATION PROFILE', 'PASSWORD PROFILE', 'CLIENT CERTIFICATE AUTHENTICATION (WEB)', 'PUBLIC KEY AUTHENTICATION (SSH)', 'LOCKED USER'].map((c) => h('th', {}, c)))),
      h('tbody', {}, h('tr', {}, h('td', { class: 'pan-cb' }, h('input', { type: 'checkbox' })), h('td', {}, link('admin', () => this.adminDialog())), h('td', {}, 'Superuser'), h('td', {}, ''), h('td', {}, ''), h('td', {}, h('input', { type: 'checkbox', disabled: true })), h('td', {}, h('input', { type: 'checkbox', disabled: true })), h('td', {}, ''))));
    return [this.filterBar(1), h('div', { class: 'pan-grid-wrap' }, t), this.toolbar([['Add', null, false], ['Delete', null, false], ['PDF/CSV', () => {}, true]])];
  }

  adminDialog() {
    const p1 = h('input', { type: 'password', class: 'pan-in', 'data-f': 'pw1' });
    const p2 = h('input', { type: 'password', class: 'pan-in', 'data-f': 'pw2' });
    const ok = () => {
      if (!p1.value) { this.error(['Password is required.']); return; }
      if (p1.value !== p2.value) { this.error(['Passwords do not match.']); return; }
      if (p1.value === 'Changeme123') { this.error(['That is the password printed in the team packet. Pick a new one.']); return; }
      if (this.sendAll(['set mgt-config users admin password'])) close();
    };
    const close = this.dialog('Administrator', h('div', {}, h('div', { class: 'pan-row' }, h('label', {}, 'Name'), h('input', { type: 'text', class: 'pan-in', value: 'admin', disabled: true })),
      h('div', { class: 'pan-row' }, h('label', {}, 'Password'), p1), h('div', { class: 'pan-row' }, h('label', {}, 'Confirm Password'), p2),
      h('div', { class: 'pan-row' }, h('label', {}, 'Administrator Type'), h('span', {}, 'Dynamic: Superuser'))), [['OK', ok, true], ['Cancel', () => close()]]);
  }

  // ---- Commit ----------------------------------------------------------------------------------------------
  commitDialog() {
    const changes = this.pan.dirty;
    const close = this.dialog('Commit', h('div', { class: 'pan-commit-body' },
      h('p', {}, 'Doing a commit will overwrite the running configuration with the commit scope. The commit is not reversible.'),
      h('label', { class: 'pan-chk' }, h('input', { type: 'radio', checked: true }), 'Commit All Changes'), h('label', { class: 'pan-chk' }, h('input', { type: 'radio', disabled: true }), 'Commit Changes Made By: (1) admin'),
      h('table', { class: 'pan-kv' }, h('tr', {}, h('th', {}, 'COMMIT SCOPE'), h('th', {}, 'LOCATION TYPE'), h('th', {}, 'OBJECT TYPE')),
        changes ? [['policy-and-objects', 'Virtual Systems', 'Policies, Objects'], ['device-and-network', 'Device', 'Device, Network']].map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))) : h('tr', {}, h('td', { colspan: 3 }, 'No pending changes'))),
      h('div', { class: 'pan-row' }, h('label', {}, 'Description'), h('input', { type: 'text', class: 'pan-in' }))),
    [['Commit', () => { close(); this.commitStatus(); }, true], ['Cancel', () => close()]], 'pan-dlg-commit');
  }

  // Commit Status: Queued / Pending first (his screenshot), then the job runs and the result lands.
  commitStatus() {
    const st = h('span', { 'data-f': 'commit-status' }, 'Queued');
    const res = h('span', { 'data-f': 'commit-result' }, 'Pending');
    const det = h('div', { class: 'pan-commit-det', 'data-f': 'commit-details' });
    const bar = h('div', { class: 'pan-commit-bar' }, h('i', {}));
    const close = this.dialog('Commit Status', h('div', {},
      h('table', { class: 'pan-kv pan-cs' }, h('tr', {}, h('td', {}, 'Operation'), h('td', {}, 'Commit')), h('tr', {}, h('td', {}, 'Status'), h('td', {}, st)), h('tr', {}, h('td', {}, 'Result'), h('td', {}, res)), h('tr', {}, h('td', {}, 'Details'), h('td', {}, det))),
      h('div', { class: 'pan-dlg-tabs' }, h('span', { class: 'on' }, 'Commit')), bar), [['Close', () => close()]], 'pan-dlg-cs');
    setTimeout(() => { st.textContent = 'Active'; bar.classList.add('run'); }, 500);
    setTimeout(() => {
      const { res: r, errs } = this.send('commit');
      const lines = (r?.lines || []).map((l) => l.text).filter((t) => !/Commit job|\.\.\.\.|Ctrl\+C/.test(t));
      st.textContent = 'Completed';
      res.textContent = errs.length ? 'Failed' : 'OK';
      res.className = errs.length ? 'pan-bad' : 'pan-ok';
      bar.classList.add('done');
      lines.forEach((t) => det.append(h('div', {}, t)));
      this.render();
    }, 1600);
  }

  // ---- dialogs ---------------------------------------------------------------------------------------------
  dialog(title, content, buttons, cls = '') {
    const wrap = h('div', { class: 'pan-veil' });
    const close = () => wrap.remove();
    wrap.append(h('div', { class: `pan-dlg ${cls}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'pan-dlg-h' }, h('span', {}, title), h('span', { class: 'pan-dlg-help' }, '?')),
      h('div', { class: 'pan-dlg-c' }, content),
      h('div', { class: 'pan-dlg-f' }, buttons.map(([label, fn, primary]) => h('button', { type: 'button', class: `pan-btn${primary ? ' pri' : ''}`, 'data-btn': label, onclick: fn }, label)))));
    this.modal.append(wrap);
    return close;
  }

  error(msgs) {
    const close = this.dialog('Error', h('div', { class: 'pan-err' }, msgs.map((m) => h('div', {}, m))), [['OK', () => close(), true]], 'pan-dlg-err');
  }

  refresh() {
    if (this.sig() !== this.sigSeen && !this.modal.childElementCount) this.render();
  }

  destroy() { this.modal.remove(); }
}
