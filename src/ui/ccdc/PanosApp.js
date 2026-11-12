// The PAN-OS web interface on a PA-VM, matched to docs/reference/panos-policy-list.png, panos-rule-general.png and
// panos-commit.png. Policies > Security is the working page; every change goes through the same CLI engine, so a
// rule added here and one typed at the console land in the same candidate config. The vendor logo is left out.
import { h, clear } from '../dom.js';
import './panos.css';

const TABS = ['Dashboard', 'ACC', 'Monitor', 'Policies', 'Objects', 'Network', 'Device'];
const NAV = ['Security', 'NAT', 'QoS', 'Policy Based Forwarding', 'Decryption', 'Tunnel Inspection', 'Application Override', 'Authentication', 'DoS Protection'];
const DLG_TABS = ['General', 'Source', 'User', 'Destination', 'Application', 'Service/URL Category', 'Actions'];
const list = (v) => String(v || '').split(/[,\s]+/).filter(Boolean);
const quote = (a) => (a.length === 1 ? a[0] : `[ ${a.join(' ')} ]`);

export class PanosApp {
  constructor({ state, dev, run }) {
    Object.assign(this, { state, dev, runLine: run });
    this.ds = state.devState[dev.id];
    this.authed = false;
    this.tab = 'Policies';
    this.sel = null;
    this.el = h('div', { class: 'pa' });
    this.drawLogin();
  }

  get fw() { return this.ds.firewall; }
  cmd(l) { return this.runLine(`@config ${l}`); }

  drawLogin() {
    const user = h('input', { 'aria-label': 'Username', value: 'admin', onkeydown: (e) => e.stopPropagation() });
    const pass = h('input', { type: 'password', 'aria-label': 'Password', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); } });
    const err = h('div', { class: 'pa-login-err' });
    const go = () => {
      const c = this.ds.creds?.[user.value.toLowerCase()];
      if (c && c.pw === pass.value) { this.authed = true; this.drawMain(); } else err.textContent = 'Invalid username or password';
    };
    clear(this.el).append(h('div', { class: 'pa-login' }, h('div', { class: 'pa-login-box' },
      h('div', { class: 'pa-login-title' }, 'PA-VM'),
      h('label', {}, 'Username', user), h('label', {}, 'Password', pass), err,
      h('button', { type: 'button', class: 'pa-login-btn', onclick: go }, 'Log In'))));
    setTimeout(() => pass.focus(), 0);
  }

  drawMain() {
    this.table = h('tbody', {});
    this.toolbar = h('div', { class: 'pa-tools' });
    clear(this.el).append(
      h('div', { class: 'pa-head' },
        h('div', { class: 'pa-brand' }, 'PA-VM'),
        h('div', { class: 'pa-tabs' }, TABS.map((t) => h('button', { type: 'button', class: `pa-tab${t === this.tab ? ' on' : ''}`, onclick: () => { this.tab = t; this.drawMain(); } }, t))),
        h('div', { class: 'pa-actions' }, h('button', { type: 'button', class: 'pa-commit', 'data-commit': '', onclick: () => this.commitDialog() }, 'Commit'), h('span', {}, 'Config'), h('span', {}, 'Search'))),
      h('div', { class: 'pa-bar' }),
      this.tab === 'Policies' ? h('div', { class: 'pa-main' },
        h('div', { class: 'pa-nav' }, NAV.map((n) => h('div', { class: `pa-nav-i${n === 'Security' ? ' on' : ''}` }, n))),
        h('div', { class: 'pa-content' },
          h('div', { class: 'pa-filter' }, h('input', { 'aria-label': 'Filter', onkeydown: (e) => e.stopPropagation() })),
          h('div', { class: 'pa-tblwrap' }, h('table', { class: 'pa-tbl' },
            h('thead', {},
              h('tr', {}, h('th', { colspan: 4, class: 'pa-nogrp' }), h('th', { colspan: 4, class: 'pa-grp' }, 'Source'), h('th', { colspan: 2, class: 'pa-grp' }, 'Destination'), h('th', { colspan: 3, class: 'pa-nogrp' })),
              h('tr', {}, ['', 'Name', 'Tags', 'Type', 'Zone', 'Address', 'User', 'HIP Profile', 'Zone', 'Address', 'Application', 'Service', 'Action'].map((t) => h('th', {}, t)))),
            this.table)),
          this.toolbar))
        : h('div', { class: 'pa-other' }, `${this.tab} is not built in this practice firewall. Use Policies, or the console CLI.`));
    if (this.tab === 'Policies') this.drawRules();
  }

  drawRules() {
    const row = (r, i) => h('tr', { class: `${this.sel === r.name ? 'sel' : ''}${r.disabled ? ' off' : ''}`, 'data-rule': r.name, onclick: () => { this.sel = r.name; this.drawRules(); }, ondblclick: () => this.ruleDialog(r) },
      h('td', { class: 'num' }, String(i + 1)), h('td', {}, h('a', { onclick: (e) => { e.preventDefault(); this.ruleDialog(r); } }, r.name)), h('td', {}, 'none'), h('td', {}, 'universal'),
      h('td', {}, r.from.join(', ')), h('td', {}, r.source.join(', ')), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, r.to.join(', ')), h('td', {}, r.destination.join(', ')), h('td', {}, r.application.join(', ')), h('td', {}, r.service.join(', ')),
      h('td', { class: `act-${r.action === 'allow' ? 'ok' : 'no'}` }, h('i', {}), r.action === 'allow' ? 'Allow' : r.action === 'deny' ? 'Deny' : 'Drop'));
    const dflt = (name, type, zone, action) => h('tr', { class: 'dflt' }, h('td', { class: 'num' }), h('td', {}, name), h('td', {}), h('td', {}, type), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, zone), h('td', {}, 'any'), h('td', {}, 'any'), h('td', {}, 'any'), h('td', { class: `act-${action === 'Allow' ? 'ok' : 'no'}` }, h('i', {}), action));
    clear(this.table).append(...this.fw.candidate.rules.map(row), dflt('intrazone-default', 'intrazone', '(intrazone)', 'Allow'), dflt('interzone-default', 'interzone', 'any', 'Deny'));
    const btn = (label, fn, on = true) => h('button', { type: 'button', class: 'pa-tool', disabled: on ? null : true, 'data-tool': label, onclick: fn }, label);
    const s = this.fw.candidate.rules.find((r) => r.name === this.sel);
    clear(this.toolbar).append(
      btn('Add', () => this.ruleDialog(null)),
      btn('Delete', () => { this.cmd(`delete rulebase security rules ${s.name}`); this.sel = null; this.drawRules(); }, !!s),
      btn('Enable', () => { this.cmd(`set rulebase security rules ${s.name} disabled no`); this.drawRules(); }, !!s),
      btn('Disable', () => { this.cmd(`set rulebase security rules ${s.name} disabled yes`); this.drawRules(); }, !!s),
      btn('Move Top', () => { this.cmd(`move rulebase security rules ${s.name} top`); this.drawRules(); }, !!s),
      btn('Move Bottom', () => { this.cmd(`move rulebase security rules ${s.name} bottom`); this.drawRules(); }, !!s));
  }

  ruleDialog(r) {
    const val = (k, d) => (r ? r[k].join(', ') : d);
    const field = (label, v) => { const i = h('input', { 'aria-label': label, value: v, onkeydown: (e) => e.stopPropagation() }); return [i, h('label', { class: 'pa-f' }, h('span', {}, label), i)]; };
    const [name, nameF] = field('Name', r?.name || '');
    const [from, fromF] = field('Source Zone', val('from', 'any'));
    const [source, sourceF] = field('Source Address', val('source', 'any'));
    const [to, toF] = field('Destination Zone', val('to', 'any'));
    const [dest, destF] = field('Destination Address', val('destination', 'any'));
    const [app, appF] = field('Application', val('application', 'any'));
    const [svc, svcF] = field('Service', val('service', 'application-default'));
    const action = h('select', { 'aria-label': 'Action' }, ['allow', 'deny', 'drop'].map((a) => h('option', { selected: (r?.action || 'allow') === a ? true : null }, a)));
    const combo = (label, v) => h('label', { class: 'pa-f' }, h('span', {}, label), h('select', { disabled: true }, h('option', {}, v)));
    const blank = (label) => h('label', { class: 'pa-f pa-f-tall' }, h('span', {}, label), h('textarea', { onkeydown: (e) => e.stopPropagation() }));
    const pages = { General: [nameF, combo('Rule Type', 'universal (default)'), blank('Description'), combo('Tags', ''), combo('Group Rules By Tag', 'None'), blank('Audit Comment')], Source: [fromF, sourceF], User: [h('p', {}, 'Source User: any')], Destination: [toF, destF], Application: [appF], 'Service/URL Category': [svcF], Actions: [h('label', { class: 'pa-f' }, h('span', {}, 'Action'), action)] };
    const page = h('div', { class: 'pa-dlg-page' });
    const tabs = h('div', { class: 'pa-dlg-tabs' });
    let current = 'General';
    const show = () => {
      clear(tabs).append(...DLG_TABS.map((t) => h('button', { type: 'button', class: `pa-dt${t === current ? ' on' : ''}`, 'data-dt': t, onclick: () => { current = t; show(); } }, t)));
      clear(page).append(...pages[current]);
    };
    show();
    const err = h('div', { class: 'pa-err' });
    const dlg = this.dialog('Security Policy Rule', [tabs, page, err], [
      ['OK', () => {
        const n = name.value.trim();
        if (!n) { err.textContent = 'Name is required.'; return; }
        if (r) this.cmd(`delete rulebase security rules ${r.name}`);
        const res = this.cmd(`set rulebase security rules ${n} from ${quote(list(from.value))} to ${quote(list(to.value))} source ${quote(list(source.value))} destination ${quote(list(dest.value))} application ${quote(list(app.value))} service ${quote(list(svc.value))} action ${action.value}`);
        if (res.lines?.some((l) => l.cls === 'err')) { err.textContent = res.lines[0].text; return; }
        dlg.remove(); this.drawRules();
      }],
      ['Cancel', () => dlg.remove()],
    ]);
  }

  commitDialog() {
    const body = h('div', {}, h('p', {}, 'Doing a commit will overwrite the running configuration with the commit scope.'),
      h('div', { class: 'pa-radios' }, h('label', {}, h('input', { type: 'radio', name: 'pa-scope', checked: true }), ' Commit All Changes'), h('label', { class: 'dim' }, h('input', { type: 'radio', name: 'pa-scope', disabled: true }), ' Commit Changes Made By:(1) admin')),
      h('div', { class: 'pa-scopebox' }, h('table', { class: 'pa-scope' }, h('thead', {}, h('tr', {}, h('th', {}, 'Commit Scope'), h('th', {}, 'Location Type'))), h('tbody', {}, h('tr', {}, h('td', {}, 'policy-and-objects'), h('td', {})))),
        h('div', { class: 'pa-scopefoot' }, h('span', {}, 'Preview Changes'), h('span', {}, 'Change Summary'), h('span', {}, 'Validate Commit'), h('span', { class: 'r' }, 'Group By Location Type'))),
      h('div', { class: 'pa-note' }, "Note: This shows all the changes in login admin's accessible domain."),
      h('textarea', { class: 'pa-desc', placeholder: 'Description', onkeydown: (e) => e.stopPropagation() }));
    const dlg = this.dialog('Commit', [body], [
      ['Commit', () => {
        const res = this.cmd('commit');
        const bad = res.lines?.some((l) => l.cls === 'err');
        dlg.remove();
        this.status(res, bad);
      }],
      ['Cancel', () => dlg.remove()],
    ], 'pa-dlg-commit');
  }

  status(res, bad) {
    this.statusText = h('div', { class: 'pa-status' }, bad ? res.lines.map((l) => h('div', {}, l.text)) : 'Commit job in progress.');
    this.statusDlg = this.dialog('Commit Status', [this.statusText], [['Close', () => { this.statusDlg.remove(); this.statusDlg = null; }]]);
    this.statusBad = bad;
  }

  dialog(title, body, buttons, cls = '') {
    const d = h('div', { class: 'pa-mask' }, h('div', { class: `pa-dlg ${cls}` }, h('div', { class: 'pa-dlg-title' }, title), h('div', { class: 'pa-dlg-body' }, body), h('div', { class: 'pa-dlg-btns' }, buttons.map(([label, fn]) => h('button', { type: 'button', class: 'pa-btn', 'data-btn': label, onclick: fn }, label)))));
    this.el.append(d);
    return d;
  }

  refresh() {
    if (this.statusDlg && !this.statusBad && !this.fw.pendingCommit) { this.statusText.textContent = 'Operation: Commit   Status: Completed   Result: Successful'; this.drawRules?.(); this.statusBad = true; }
  }

  focus() {}
}
