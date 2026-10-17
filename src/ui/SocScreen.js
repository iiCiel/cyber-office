import { Overlay } from './Overlay.js';
import { h, clear } from './dom.js';
import { generateLogs, ALERT, ALERT_STOLEN, CASE, ipInfo, hms } from '../data/day1Logs.js';

// The SOC console (M4): a small SIEM.
//   Overview: stats, open alerts, live tail.  Alert: details with pivots (click a value to search it).
//   Search:   filter every log line, expand raw events, flag the lines that matter.
//   Case:     your verdict, your evidence (flagged lines) and your response. Priya reads it.
const SOURCES = [
  ['', 'All sources'],
  ['dc01', 'dc01 (Windows Security)'],
  ['vpn01', 'vpn01 (OpenVPN)'],
  ['file01', 'file01 (file shares)'],
  ['web01', 'web01 (SSH)'],
  ['mail01', 'mail01 (mail)'],
];
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const compact = (e) => `${hms(e.t)} ${e.host.padEnd(6)} ${e.short}`;

export class SocScreen extends Overlay {
  constructor(scene) {
    super(scene, { name: 'soc', bezel: 0x15151f });
    this.view = 'overview';
    this.query = '';
    this.source = '';
    this.onlyFlagged = false;
    this.expanded = null;
    this.main = h('div', { class: 'soc-main' });
    this.tabs = h('div', { class: 'soc-tabs', role: 'tablist' });
    this.root.append(
      h('div', { class: 'soc' }, h('div', { class: 'soc-head' }, h('b', {}, 'HALCYON SIEM'), this.tabs, h('span', { class: 'live' }, '● LIVE')), this.main),
    );
  }

  get st() {
    return this.scene.state;
  }

  // Each alert shows up on its own schedule (the stolen-password one can come first).
  alerts() {
    const list = [];
    if (this.st.soc.stolenAlertAt != null) list.push(ALERT_STOLEN);
    if (this.st.soc.alertAt != null) list.push(ALERT);
    return list;
  }

  // A new alert fired while the console is open: refresh the overview, but never wipe a half-filled form.
  onAlertsChanged() {
    if (this.view === 'overview') this.render();
  }

  logs() {
    return generateLogs({ nowMinutes: this.scene.minutes, phishedAt: this.st.phishedAt() });
  }

  go(view, opts = {}) {
    this.view = view;
    Object.assign(this, opts);
    this.render();
  }

  render() {
    const tab = (id, label) =>
      h('button', { type: 'button', role: 'tab', class: `tab${this.view === id || (id === 'overview' && this.view === 'alert') ? ' on' : ''}`, 'data-tab': id, onclick: () => this.go(id) }, label);
    clear(this.tabs).append(tab('overview', 'Overview'), tab('search', 'Search logs'), tab('case', this.st.soc.caseFile ? 'Case ✓' : 'Case'));
    clear(this.main);
    if (this.view === 'overview') this.renderOverview();
    else if (this.view === 'alert') this.renderAlert();
    else if (this.view === 'search') this.renderSearch();
    else if (this.view === 'case') this.renderCase();
  }

  // ---------- overview ----------
  renderOverview() {
    const alerts = this.alerts();
    const open = this.st.soc.caseFile ? alerts.filter((a) => a.id !== ALERT.id) : alerts;
    const logs = this.logs();
    const failed24 = logs.filter((e) => e.msg.includes('EventID=4625') || e.msg.includes('Failed password')).length;
    this.epm = h('div', { class: 'val' }, String(38 + Math.floor(Math.random() * 14)));
    this.tail = h('pre', { class: 'soc-tail mono' });
    this.main.append(
      h(
        'div',
        { class: 'tiles' },
        h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Open alerts'), h('div', { class: `val ${open.length ? 'bad' : 'ok'}`, 'data-stat': 'alerts' }, String(open.length))),
        h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Events / min'), this.epm),
        h('div', { class: 'tile' }, h('div', { class: 'lbl' }, 'Failed logins today'), h('div', { class: 'val' }, String(failed24))),
      ),
      h('div', { class: 'lbl' }, 'Alerts'),
      alerts.length
        ? h(
            'div',
            { class: 'alert-list' },
            alerts.map((a) =>
              h(
                'button',
                { type: 'button', class: 'alert-row', 'data-alert': a.id, onclick: () => this.go('alert', { alertId: a.id }) },
                h('span', { class: `sev ${a.severity.toLowerCase()}` }, a.severity),
                h('span', { class: 'atitle' }, a.title),
                h('span', { class: 'astatus' }, a.id === ALERT.id && this.st.soc.caseFile ? 'Closed by you' : 'New'),
              ),
            ),
          )
        : h('div', { class: 'quiet' }, 'No alerts. Quiet morning.'),
      h('div', { class: 'lbl' }, 'Live tail · all sources'),
      this.tail,
    );
    this.renderTail();
  }

  renderTail() {
    if (!this.tail) return;
    const recent = this.logs().slice(-14);
    clear(this.tail).append(recent.map(compact).join('\n'));
  }

  // ---------- one alert ----------
  renderAlert() {
    const a = [ALERT, ALERT_STOLEN].find((x) => x.id === this.alertId) || ALERT;
    if (!this.st.soc.viewed?.includes(a.id)) {
      this.st.soc.viewed = [...(this.st.soc.viewed || []), a.id];
      this.st.log('alert-viewed', { id: a.id });
    }
    const valueCell = (v) => {
      const ip = v.match(IP_RE)?.[0];
      return h(
        'span',
        {},
        h('button', { type: 'button', class: 'pivot', title: 'Search the logs for this', onclick: () => this.go('search', { query: v.split(' ')[0], source: '', onlyFlagged: false }) }, v),
        ip ? this.ipButton(ip) : null,
      );
    };
    this.main.append(
      h(
        'div',
        { class: 'alert-detail' },
        h('button', { type: 'button', class: 'back', onclick: () => this.go('overview') }, '← All alerts'),
        h('h2', {}, h('span', { class: `sev ${a.severity.toLowerCase()}` }, a.severity), ' ', a.title),
        h('p', { class: 'rule' }, h('b', {}, 'Rule: '), a.rule),
        h('table', { class: 'fields' }, a.fields.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, valueCell(v))))),
        h('p', { class: 'hint' }, 'Tip: click a value to search the logs for it. Click 🔎 next to an IP to look it up.'),
        a.id === ALERT_STOLEN.id
          ? h(
              'div',
              { class: 'callout bad' },
              'That is your account, logging in from Russia, a few minutes after you typed your password into that "IT Support" page. ',
              'Report it to Priya right away (she has been notified) and change your password.',
            )
          : null,
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'primary', 'data-action': 'investigate', onclick: () => this.go('search', { query: '', source: '', onlyFlagged: false }) }, 'Search the logs'),
          a.id === ALERT.id ? h('button', { type: 'button', 'data-action': 'open-case', onclick: () => this.go('case') }, 'Write up the case') : null,
        ),
        this.ipPanel = h('div', { class: 'ip-panel' }),
      ),
    );
  }

  ipButton(ip) {
    return h(
      'button',
      {
        type: 'button',
        class: 'iplookup',
        title: `Look up ${ip}`,
        'data-ip': ip,
        onclick: (e) => {
          e.stopPropagation();
          this.showIp(ip);
        },
      },
      '🔎',
    );
  }

  showIp(ip) {
    const info = ipInfo(ip);
    if (!this.st.soc.lookups?.includes(ip)) {
      this.st.soc.lookups = [...(this.st.soc.lookups || []), ip];
      this.st.log('ip-lookup', { ip });
    }
    const panel = this.ipPanel || this.main.querySelector('.ip-panel');
    if (!panel) return;
    clear(panel).append(
      h(
        'div',
        { class: `ipcard ${info.external ? 'ext' : 'int'}` },
        h('b', { class: 'mono' }, ip),
        h('div', {}, `${info.where} · ${info.owner}`),
        h('div', {}, info.note),
      ),
    );
  }

  // ---------- search ----------
  filtered() {
    const terms = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const flagged = new Set(this.st.soc.flagged);
    return this.logs().filter((e) => {
      if (this.source && e.host !== this.source) return false;
      if (this.onlyFlagged && !flagged.has(e.id)) return false;
      const line = e.line.toLowerCase();
      return terms.every((t) => (t.startsWith('-') && t.length > 1 ? !line.includes(t.slice(1)) : line.includes(t)));
    });
  }

  renderSearch() {
    const input = h('input', {
      type: 'search',
      class: 'q mono',
      placeholder: 'Search: e.g.  j.alvarez   4625   185.220   -web01   (all words must match, -word excludes)',
      value: this.query,
      'aria-label': 'Search logs',
    });
    input.value = this.query;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.query = input.value;
        this.renderResults();
        if (this.query.trim()) this.st.log('log-search', { q: this.query.trim().slice(0, 60) });
      }, 150);
    });
    const select = h('select', { 'aria-label': 'Source', onchange: () => { this.source = select.value; this.renderResults(); } },
      SOURCES.map(([v, label]) => h('option', { value: v, selected: v === this.source }, label)));
    const flaggedToggle = h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: this.onlyFlagged, onchange: (e) => { this.onlyFlagged = e.target.checked; this.renderResults(); } }),
      ' Only flagged');
    this.count = h('span', { class: 'count' });
    this.results = h('div', { class: 'results', role: 'table' });
    this.ipPanel = h('div', { class: 'ip-panel' });
    this.main.append(
      h('div', { class: 'searchbar' }, input, select, flaggedToggle),
      h('div', { class: 'resbar' }, this.count, h('span', { class: 'hint' }, 'Click ⚑ to flag a line as evidence. Click a line to see the raw event.'), this.ipPanel),
      this.results,
    );
    this.renderResults();
    setTimeout(() => input.focus(), 0);
  }

  renderResults() {
    const rows = this.filtered();
    const flagged = new Set(this.st.soc.flagged);
    const MAX = 400;
    this.count.textContent = `${rows.length} event${rows.length === 1 ? '' : 's'} · ${flagged.size} flagged`;
    clear(this.results).append(
      ...rows.slice(0, MAX).map((e) => {
        const isFlagged = flagged.has(e.id);
        const ips = [...new Set(e.line.match(IP_RE) || [])];
        const row = h(
          'div',
          { class: `row${isFlagged ? ' flagged' : ''}`, role: 'row', 'data-log': e.id, 'data-key': e.key || null },
          h('button', { type: 'button', class: 'flag', 'aria-pressed': String(isFlagged), title: isFlagged ? 'Unflag' : 'Flag as evidence', onclick: () => this.toggleFlag(e) }, '⚑'),
          h('span', { class: 'time mono' }, hms(e.t)),
          h('span', { class: 'host mono' }, e.host),
          h('span', { class: 'msg mono', onclick: () => { this.expanded = this.expanded === e.id ? null : e.id; this.renderResults(); } }, e.short),
          h('span', { class: 'ips' }, ips.map((ip) => this.ipButton(ip))),
        );
        if (this.expanded !== e.id) return row;
        return h('div', { class: 'rowwrap' }, row, h('pre', { class: 'raw mono' }, e.raw || e.line));
      }),
      rows.length > MAX ? h('div', { class: 'quiet' }, `Showing the first ${MAX}. Narrow your search.`) : null,
      rows.length ? null : h('div', { class: 'quiet' }, 'No events match.'),
    );
  }

  toggleFlag(e) {
    const f = this.st.soc.flagged;
    const i = f.indexOf(e.id);
    if (i >= 0) f.splice(i, 1);
    else f.push(e.id);
    this.st.log(i >= 0 ? 'log-unflagged' : 'log-flagged', { id: e.id, key: e.key || null, attack: !!e.attack });
    this.renderResults();
  }

  // ---------- case write-up ----------
  renderCase() {
    const cf = this.st.soc.caseFile;
    if (this.st.soc.alertAt == null) {
      this.main.append(h('div', { class: 'quiet' }, 'No open cases.'));
      return;
    }
    const byId = new Map(this.logs().map((e) => [e.id, e]));
    const flaggedLines = this.st.soc.flagged.map((id) => byId.get(id)).filter(Boolean);
    const disabled = !!cf;

    const verdicts = CASE.verdicts.map((v) =>
      h('label', { class: 'opt' }, h('input', { type: 'radio', name: 'verdict', value: v.id, checked: cf?.verdict === v.id, disabled }), ' ', v.text),
    );
    const actions = CASE.actions.map((a) =>
      h('label', { class: 'opt' }, h('input', { type: 'checkbox', name: 'action', value: a.id, checked: cf?.actions?.includes(a.id), disabled }), ' ', a.text),
    );
    const msg = h('div', { class: 'formmsg', 'aria-live': 'polite' });
    const form = h(
      'form',
      {
        class: 'case',
        onsubmit: (ev) => {
          ev.preventDefault();
          const verdict = form.querySelector('input[name=verdict]:checked')?.value;
          const chosen = [...form.querySelectorAll('input[name=action]:checked')].map((x) => x.value);
          if (!verdict) return void (msg.textContent = 'Pick what you think happened.');
          if (!flaggedLines.length) return void (msg.textContent = 'Flag at least one log line as evidence first (Search logs → ⚑).');
          if (!chosen.length) return void (msg.textContent = 'Pick at least one response.');
          this.st.soc.caseFile = { verdict, actions: chosen, evidence: flaggedLines.map((e) => ({ id: e.id, key: e.key || null, attack: !!e.attack })), at: this.scene.minutes };
          this.st.log('case-submitted', { verdict, actions: chosen });
          this.scene.onCaseSubmitted();
          this.render();
        },
      },
      h('h2', {}, `Case: ${ALERT.title}`),
      h('fieldset', {}, h('legend', {}, '1. What happened?'), verdicts),
      h(
        'fieldset',
        {},
        h('legend', {}, `2. Evidence (${flaggedLines.length} flagged line${flaggedLines.length === 1 ? '' : 's'})`),
        flaggedLines.length
          ? h('pre', { class: 'evidence mono' }, flaggedLines.map(compact).join('\n'))
          : h('div', { class: 'quiet' }, 'Nothing flagged yet. Go to Search logs and flag (⚑) the lines that prove your answer.'),
      ),
      h('fieldset', {}, h('legend', {}, '3. What should we do? (pick all that apply)'), actions),
      cf
        ? h('div', { class: 'callout ok' }, `Submitted to Priya at ${this.scene.clockString()}. She'll go over it with you at the end of the day.`)
        : h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary', 'data-action': 'submit-case' }, 'Submit to Priya'), msg),
    );
    this.main.append(form);
  }

  // ---------- lifecycle ----------
  onOpen() {
    if (this.view === 'alert' && !this.alertId) this.view = 'overview';
    this.render();
    this.timer = setInterval(() => {
      if (this.view === 'overview') {
        this.renderTail();
        if (this.epm) this.epm.textContent = String(38 + Math.floor(Math.random() * 14));
      }
    }, 1000);
  }

  onCloseInternal() {
    clearInterval(this.timer);
    this.st.save();
  }

  onKeyDown() {}

  back() {
    if (this.view === 'alert' || this.view === 'search' || this.view === 'case') return this.go('overview');
    this.close();
  }
}
