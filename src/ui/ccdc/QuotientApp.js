// Quotient (the MWCCDC 2026 scoring engine) as the blue team used it on Nov 14: the Password Change Request page
// and the per-service round table. Matched to the team's screenshots (docs/reference/quotient-*.png):
//   PCR: amber alert, "Credential List" card with a select, a tabbed card (Update / Usernames / Help), the
//        Credentials textarea ("username,password, one per line"); Usernames lists the names the list accepts.
//   Service: "← Service: splunk-query" and a Round / Time / Result / Debug / Error table, newest first.
// Submitting goes through quotient.submitPcr (all-or-nothing), so the engine decides what breaks.
//   const app = new QuotientApp({ state, onSubmit: (list, text) => result });  host.append(app.el);
import { h, clear } from '../dom.js';
import { quotientLists } from '../../game/quotient.js';
import './quotient.css';

const DAY0 = Date.UTC(2026, 10, 14, 13, 0, 0); // round 1 at 1:00 PM on the day (shown as local wall time)
const stamp = (sec) => {
  const d = new Date(DAY0 + sec * 1000);
  const hh = d.getUTCHours(); const h12 = ((hh + 11) % 12) + 1;
  return `11/14/2026, ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};

export class QuotientApp {
  constructor({ state, onSubmit, team = 14 }) {
    this.state = state;
    this.onSubmit = onSubmit;
    this.team = team;
    this.lists = quotientLists(state.scenario);
    this.list = Object.keys(this.lists)[0];
    this.page = 'pcr';
    this.tab = 'update';
    this.alert = null;
    this.service = null;
    this.drafts = {};
    this.sigSeen = '';
    this.main = h('main', { class: 'qt-main' });
    this.el = h('div', { class: 'qt' }, this.nav(), this.main);
    this.render();
  }

  nav() {
    this.navEl = h('nav', { class: 'qt-nav' });
    return this.navEl;
  }

  renderNav() {
    clear(this.navEl);
    const link = (id, label) => h('a', { href: '#', class: `qt-nl${this.page === id || (id === 'services' && this.page === 'service') ? ' on' : ''}`, 'data-page': id, onclick: (e) => { e.preventDefault(); this.page = id; this.render(); } }, label);
    this.navEl.append(h('span', { class: 'qt-brand' }, 'Quotient'), link('services', 'Services'), link('pcr', 'PCR'), h('span', { class: 'qt-team' }, `team${this.team}`));
  }

  sig() { const e = this.state.engine; return JSON.stringify([e?.round, this.page, this.service]); }

  render() {
    this.sigSeen = this.sig();
    this.renderNav();
    clear(this.main);
    this.main.classList.toggle('qt-wide', this.page !== 'pcr');
    if (this.page === 'pcr') this.main.append(...this.pcrPage());
    else if (this.page === 'service') this.main.append(...this.servicePage());
    else this.main.append(...this.servicesPage());
  }

  // ---- PCR --------------------------------------------------------------------------------------------------
  pcrPage() {
    const out = [];
    if (this.alert) {
      out.push(h('div', { class: `qt-alert qt-alert-${this.alert.kind}`, role: 'alert' },
        h('i', { class: 'qt-alert-ic', 'aria-hidden': 'true' }, this.alert.kind === 'ok' ? '✓' : '!'), h('span', {}, this.alert.text),
        h('button', { type: 'button', class: 'qt-x', 'aria-label': 'Dismiss', onclick: () => { this.alert = null; this.render(); } }, '✕')));
    }
    const sel = h('select', { class: 'qt-select', 'data-f': 'list', onchange: (e) => { this.saveDraft(); this.list = e.target.value; this.render(); } },
      Object.keys(this.lists).map((n) => h('option', { value: n, selected: n === this.list }, n)));
    out.push(h('section', { class: 'qt-card' }, h('h3', { class: 'qt-h' }, h('i', { class: 'qt-list-ic', 'aria-hidden': 'true' }, '☰'), 'Credential List'), sel, h('p', { class: 'qt-muted' }, 'Choose which service credentials to update.')));
    const tabs = [['update', 'Update'], ['usernames', 'Usernames'], ['help', 'Help']];
    const head = h('div', { class: 'qt-tabs' }, tabs.map(([id, label]) => h('a', { href: '#', class: `qt-tab${this.tab === id ? ' on' : ''}`, 'data-tab': id, onclick: (e) => { e.preventDefault(); this.saveDraft(); this.tab = id; this.render(); } }, label)));
    out.push(h('section', { class: 'qt-card qt-tabcard' }, head, h('div', { class: 'qt-tabbody' }, this[`${this.tab}Tab`]())));
    return out;
  }

  saveDraft() { if (this.ta) this.drafts[this.list] = this.ta.value; }

  updateTab() {
    this.ta = h('textarea', { class: 'qt-ta', rows: 10, spellcheck: 'false', 'data-f': 'creds', placeholder: 'username,password' });
    this.ta.value = this.drafts[this.list] || '';
    const submit = () => {
      this.drafts[this.list] = this.ta.value;
      const r = this.onSubmit ? this.onSubmit(this.list, this.ta.value) : { ok: false, msg: 'Not connected.' };
      this.alert = { kind: r.ok ? 'ok' : 'warn', text: r.msg };
      if (r.ok) this.drafts[this.list] = '';
      this.render();
    };
    return [h('label', { class: 'qt-lbl' }, 'Credentials ', h('span', { class: 'qt-fmt' }, '(', h('code', {}, 'username,password'), ', one per line)')), this.ta,
      h('div', { class: 'qt-actions' }, h('button', { type: 'button', class: 'qt-btn', 'data-btn': 'submit', onclick: submit }, 'Submit'))];
  }

  usernamesTab() {
    this.ta = null;
    const users = this.lists[this.list]?.users || [];
    return [h('p', { class: 'qt-muted qt-lead' }, 'Available usernames for this credential list.'),
      h('table', { class: 'qt-table qt-users' }, h('thead', {}, h('tr', {}, h('th', {}, 'Username'))), h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, u))))),
      h('p', { class: 'qt-muted qt-count' }, h('i', { class: 'qt-info', 'aria-hidden': 'true' }, 'i'), `${users.length} usernames shown`)];
  }

  helpTab() {
    this.ta = null;
    return [h('p', {}, 'Paste one credential per line as username,password. Every username must exist in the selected credential list; if any line does not match, no credentials are updated.'),
      h('p', {}, 'Submit the change here before you change the password on the system, so the scoring engine never tries the old one.')];
  }

  // ---- Services ---------------------------------------------------------------------------------------------
  servicesPage() {
    const e = this.state.engine;
    const rows = this.state.serviceList.map((s) => {
      const hist = e?.history?.[s.id] || [];
      const last = hist[hist.length - 1];
      return h('tr', { class: 'qt-row', 'data-svc': s.id, onclick: () => { this.service = s.id; this.page = 'service'; this.render(); } },
        h('td', {}, h('span', { class: `qt-dot ${last ? (last.ok ? 'up' : 'down') : ''}` })), h('td', {}, s.id), h('td', {}, last ? String(last.ok) : '—'), h('td', {}, String(hist.filter((x) => x.ok).length)), h('td', {}, String(hist.length)));
    });
    return [h('h2', { class: 'qt-title' }, 'Services'), h('table', { class: 'qt-table' }, h('thead', {}, h('tr', {}, ['', 'Service', 'Last result', 'Passed', 'Rounds'].map((c) => h('th', {}, c)))), h('tbody', {}, rows))];
  }

  servicePage() {
    const hist = [...(this.state.engine?.history?.[this.service] || [])].reverse();
    return [h('h2', { class: 'qt-title' }, h('a', { href: '#', class: 'qt-back', 'aria-label': 'Back', onclick: (e) => { e.preventDefault(); this.page = 'services'; this.render(); } }, '←'), `Service: ${this.service}`),
      h('table', { class: 'qt-table qt-rounds' }, h('thead', {}, h('tr', {}, ['Round', 'Time', 'Result', 'Debug', 'Error'].map((c) => h('th', {}, c)))),
        h('tbody', {}, hist.length ? hist.map((r) => h('tr', {}, h('td', {}, String(r.round)), h('td', {}, stamp(r.at)), h('td', {}, String(r.ok)), h('td', {}, ''), h('td', {}, ''))) : h('tr', {}, h('td', { colspan: 5, class: 'qt-muted' }, 'No rounds yet.'))))];
  }

  refresh() { if (this.sig() !== this.sigSeen && this.page !== 'pcr') this.render(); }
  destroy() {}
}
