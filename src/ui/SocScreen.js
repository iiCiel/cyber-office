import { Overlay } from './Overlay.js';
import { h, clear } from './dom.js';
import { jsonTree } from './jsonTree.js';
import { ipLookup, hms } from '../game/logkit.js';
import { runSearch, fieldSummary, histogram, getField } from '../game/spl.js';

// The SOC console. It is modeled on Splunk Enterprise Security, because that is what a real SOC sits in front of:
//   Incident Review   the notable-event queue (alerts) with urgency counts; click one for its details and pivots
//   Search            Splunk's Search & Reporting page: SPL search bar, time range, timeline, fields sidebar, events
//                     (raw text exactly as the product wrote it, JSON trees, Event Actions) and a Statistics tab
//   Investigation     your verdict, your evidence (the lines you added to the investigation, ⚑) and your response
// Everything on screen comes from the day's data through textContent, never innerHTML.
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const compact = (e) => `${hms(e.t)} ${e.host.padEnd(6)} ${e.short}`;
const DEFAULT_SELECTED = ['host', 'source', 'sourcetype'];
const MAX_LINES = [5, 10, 20, 50, Infinity];
const RANGES = [
  ['All time', Infinity],
  ['Last 24 hours', 86400],
  ['Last 4 hours', 4 * 3600],
  ['Last 60 minutes', 3600],
  ['Last 15 minutes', 900],
];
const URGENCY = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
const pad2 = (n) => String(n).padStart(2, '0');

export class SocScreen extends Overlay {
  constructor(scene) {
    super(scene, { name: 'soc', bezel: 0x15151f });
    this.view = 'overview';
    this.query = '';
    this.onlyFlagged = false;
    this.expanded = new Set();
    this.fullText = new Set();
    this.page = 0;
    this.perPage = 20;
    this.range = 0; // index into RANGES
    this.bucket = null; // selected timeline bucket {from,to}
    this.zoom = null; // zoomed range {from,to}
    this.fieldPop = null;
    this.showAllFields = false;
    this.selected = [...DEFAULT_SELECTED];
    this.maxLines = 10;
    this.formatOpen = false;
    this.main =h('div', { class: 'soc-main' });
    this.tabs = h('div', { class: 'soc-tabs', role: 'tablist' });
    this.root.append(
      h(
        'div',
        { class: 'soc' },
        h(
          'div',
          { class: 'spl-top' },
          h('span', { class: 'spl-logo' }, 'splunk', h('b', {}, '>'), h('small', {}, 'enterprise')),
          h('span', { class: 'spacer' }),
          h('span', { class: 'nav' }, 'analyst01'),
          h('span', { class: 'nav' }, 'Messages ▾'),
          h('span', { class: 'nav' }, 'Settings ▾'),
          h('span', { class: 'nav' }, 'Activity ▾'),
          h('span', { class: 'nav' }, 'Help ▾'),
          h('span', { class: 'live' }, '● LIVE'),
        ),
        h('div', { class: 'spl-app' }, h('span', { class: 'appname' }, 'Enterprise Security'), this.tabs),
        this.main,
      ),
    );
  }

  get st() {
    return this.scene.state;
  }

  // Each alert shows up on its own schedule (the stolen-password one can come first).
  alerts() {
    const list = [];
    const fired = this.st.soc.alerts;
    for (const a of this.scene.day.alerts) if (fired[a.id] != null) list.push(a);
    list.sort((a, b) => fired[b.id] - fired[a.id]);
    return list;
  }

  // A new alert fired while the console is open: refresh the overview, but never wipe a half-filled form.
  onAlertsChanged() {
    if (this.view === 'overview') this.render();
  }

  logs() {
    return this.scene.day.logs(this.st);
  }

  get mainAlert() {
    return this.scene.day.alerts.find((a) => a.main);
  }

  get caseFile() {
    const m = this.mainAlert;
    return m ? this.st.soc.cases[m.id] : null;
  }

  go(view, opts = {}) {
    this.view = view;
    Object.assign(this, opts);
    if (opts.query !== undefined) {
      this.page = 0;
      this.bucket = null;
    }
    this.render();
  }

  render() {
    const tab = (id, label) =>
      h('button', { type: 'button', role: 'tab', class: `tab${this.view === id || (id === 'overview' && this.view === 'alert') ? ' on' : ''}`, 'data-tab': id, onclick: () => this.go(id) }, label);
    clear(this.tabs).append(tab('overview', 'Incident Review'), tab('search', 'Search'), tab('case', this.caseFile ? 'Investigation ✓' : 'Investigation'));
    clear(this.main);
    if (this.view === 'overview') this.renderOverview();
    else if (this.view === 'alert') this.renderAlert();
    else if (this.view === 'search') this.renderSearch();
    else if (this.view === 'case') this.renderCase();
  }

  // ---------- Incident Review ----------
  renderOverview() {
    const alerts = this.alerts();
    const open = this.caseFile ? alerts.filter((a) => !a.main) : alerts;
    const logs = this.logs();
    const failed24 = logs.filter((e) => e.msg.includes('EventID=4625') || e.msg.includes('Failed password')).length;
    this.epm = h('div', { class: 'val' }, String(38 + Math.floor(Math.random() * 14)));
    this.tail = h('pre', { class: 'soc-tail mono' });
    const count = (u) => open.filter((a) => (a.severity || 'High').toLowerCase() === u.toLowerCase()).length;
    const urgencyTile = (u) => h('div', { class: `tile urg ${u.toLowerCase()}` }, h('div', { class: 'val' }, String(count(u))), h('div', { class: 'lbl' }, u.toUpperCase()));
    this.main.append(
      this.crisisBanner() || '',
      h('h1', { class: 'spl-h1' }, 'Incident Review'),
      h(
        'div',
        { class: 'tiles' },
        h('div', { class: 'tile total' }, h('div', { class: 'val ' + (open.length ? 'bad' : 'ok'), 'data-stat': 'alerts' }, String(open.length)), h('div', { class: 'lbl' }, 'TOTAL EVENTS')),
        ...URGENCY.map(urgencyTile),
        h('div', { class: 'tile' }, h('div', { class: 'val' }, String(failed24)), h('div', { class: 'lbl' }, 'FAILED LOGINS TODAY')),
        h('div', { class: 'tile' }, this.epm, h('div', { class: 'lbl' }, 'EVENTS / MIN')),
      ),
      h('div', { class: 'lbl sect' }, `Notable events (${alerts.length})`),
      alerts.length
        ? h(
            'div',
            { class: 'alert-list' },
            h('div', { class: 'alert-head' }, h('span', { class: 'c-urg' }, 'Urgency'), h('span', { class: 'atitle' }, 'Title'), h('span', { class: 'astatus' }, 'Status')),
            alerts.map((a) =>
              h(
                'button',
                { type: 'button', class: 'alert-row', 'data-alert': a.id, onclick: () => this.go('alert', { alertId: a.id }) },
                h('span', { class: 'c-urg' }, h('span', { class: `sev ${(a.severity || 'High').toLowerCase()}` }, a.severity)),
                h('span', { class: 'atitle' }, a.title),
                h('span', { class: 'astatus' }, a.main && this.caseFile ? 'Closed' : 'New'),
              ),
            ),
          )
        : h('div', { class: 'quiet' }, 'No notable events match the current filters. Quiet morning.'),
      h('div', { class: 'lbl sect' }, 'Recent events · index=*'),
      this.tail,
    );
    this.renderTail();
  }

  renderTail() {
    if (!this.tail) return;
    const recent = this.logs().slice(-14);
    clear(this.tail).append(recent.map(compact).join('\n'));
  }

  // ---------- one notable event ----------
  renderAlert() {
    const a = this.scene.day.alerts.find((x) => x.id === this.alertId) || this.mainAlert;
    if (!this.st.soc.viewed?.includes(a.id)) {
      this.st.soc.viewed = [...(this.st.soc.viewed || []), a.id];
      this.st.log('alert-viewed', { id: a.id });
    }
    const valueCell = (v) => {
      const ip = v.match(IP_RE)?.[0];
      return h(
        'span',
        {},
        h('button', { type: 'button', class: 'pivot', title: 'Search the logs for this', onclick: () => this.go('search', { query: v.split(' ')[0], onlyFlagged: false }) }, v),
        ip ? this.ipButton(ip) : null,
      );
    };
    this.main.append(
      h(
        'div',
        { class: 'alert-detail' },
        h('button', { type: 'button', class: 'back', onclick: () => this.go('overview') }, '← Incident Review'),
        h('h2', {}, h('span', { class: `sev ${(a.severity || 'High').toLowerCase()}` }, a.severity), ' ', a.title),
        h('p', { class: 'rule' }, h('b', {}, 'Description: '), a.rule),
        h('div', { class: 'lbl sect' }, 'Additional fields'),
        h('table', { class: 'fields' }, h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'Value')), a.fields.map(([k, v]) => h('tr', {}, h('td', { class: 'fk' }, k), h('td', {}, valueCell(v))))),
        h('p', { class: 'hint' }, 'Click a value to search the logs for it. Click 🔎 next to an IP address to look it up in the threat intelligence framework.'),
        a.callout ? h('div', { class: 'callout bad' }, a.callout) : null,
        this.crisisBanner(),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'primary', 'data-action': 'investigate', onclick: () => this.go('search', { query: '', onlyFlagged: false }) }, 'Search the logs'),
          a.main && a.case ? h('button', { type: 'button', 'data-action': 'open-case', onclick: () => this.go('case') }, 'Open investigation') : null,
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
    const info = ipLookup(ip, this.scene.day.ipInfo);
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

  // ---------- Search & Reporting ----------
  /** Everything the search page shows, computed from the current query. */
  compute() {
    const nowSec = this.st.minutes * 60;
    const win = RANGES[this.range][1];
    let base = this.logs().filter((e) => (e.abs ?? e.t) >= nowSec - win);
    if (this.zoom) base = base.filter((e) => (e.abs ?? e.t) >= this.zoom.from && (e.abs ?? e.t) < this.zoom.to);
    const flagged = new Set(this.st.soc.flagged);
    const res = runSearch(this.query, base);
    let events = res.events;
    if (this.onlyFlagged) events = events.filter((e) => flagged.has(e.id));
    const hist = histogram(events, 36);
    const inBucket = this.bucket ? events.filter((e) => (e.abs ?? e.t) >= this.bucket.from && (e.abs ?? e.t) < this.bucket.to) : events;
    const shown = res.table ? inBucket : [...inBucket].reverse(); // Splunk lists the newest event first
    return { res, events, shown, hist, flagged, nowSec, base };
  }

  runNow(value) {
    this.query = value;
    this.page = 0;
    this.bucket = null;
    this.renderResults();
    if (this.query.trim()) this.st.log('log-search', { q: this.query.trim().slice(0, 60) });
  }

  renderSearch() {
    const input = h('input', {
      type: 'text',
      class: 'q mono',
      placeholder: 'enter search here...    e.g.  index=wineventlog EventCode=4625 | stats count by src_ip',
      value: this.query,
      'aria-label': 'Search logs',
      spellcheck: 'false',
      autocomplete: 'off',
    });
    input.value = this.query;
    this.input = input;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.runNow(input.value), 150);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        this.runNow(input.value);
      }
    });
    const range = h('select', { class: 'range', 'aria-label': 'Time range', onchange: () => { this.range = Number(range.value); this.bucket = null; this.renderResults(); } },
      RANGES.map(([label], i) => h('option', { value: i, selected: i === this.range }, label)));
    const flaggedToggle = h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: this.onlyFlagged, onchange: (e) => { this.onlyFlagged = e.target.checked; this.page = 0; this.renderResults(); } }),
      ' Only events in the investigation');
    this.status = h('div', { class: 'statusbar' });
    this.tabs2 = h('div', { class: 'tabs2' });
    this.timeline = h('div', { class: 'timeline' });
    this.sidebar = h('div', { class: 'fieldbar' });
    this.results = h('div', { class: 'results', role: 'table' });
    this.ipPanel = h('div', { class: 'ip-panel' });
    this.main.append(
      h('div', { class: 'spl-title' }, h('h1', {}, 'Search'), h('span', { class: 'hint' }, 'Search & Reporting · SPL: field=value, NOT, OR, wildcards *, | stats count by … | top | table | sort | head')),
      h('div', { class: 'searchbar' }, input, range, h('button', { type: 'button', class: 'go', 'aria-label': 'Search', title: 'Search', onclick: () => { clearTimeout(timer); this.runNow(input.value); } }, '⌕')),
      this.status,
      this.ipPanel,
      this.tabs2,
      h('div', { class: 'spl-body' }, this.sidebar, h('div', { class: 'spl-right' }, this.timeline, this.results)),
    );
    this.statsMode = false;
    this.statusFlag = flaggedToggle;
    this.renderResults();
    setTimeout(() => input.focus(), 0);
  }

  renderResults() {
    const { res, events, shown, hist, flagged, nowSec } = this.compute();
    this.last = { res, events, shown };
    const n = shown.length;
    const stamp = this.fmtNow(nowSec);

    // status line
    const flaggedToggle = this.statusFlag;
    clear(this.status).append(
      res.error
        ? h('span', { class: 'err' }, '✖ ', res.error)
        : h('span', { class: 'okmark' }, '✓ ', h('span', { class: 'count' }, `${res.table ? res.table.rows.length + (res.table.rows.length === 1 ? ' result' : ' results') : `${n} event${n === 1 ? '' : 's'}`}`), h('span', { class: 'before' }, ` (before ${stamp})  No Event Sampling ▾`)),
      h('span', { class: 'spacer' }),
      h('span', { class: 'jobs' }, 'Job ▾   ⏸   ■   ↗   ⤓   Smart Mode ▾'),
      flaggedToggle || '',
    );

    // tabs under the status line
    const hasStats = !!res.table;
    if (hasStats && this.autoStats !== this.query) {
      this.statsMode = true;
      this.autoStats = this.query;
    }
    if (!hasStats) {
      this.statsMode = false;
      this.autoStats = null;
    }
    const t2 = (label, on, onclick, disabled) => h('button', { type: 'button', class: `t2${on ? ' on' : ''}${disabled ? ' off' : ''}`, onclick: disabled ? null : onclick }, label);
    clear(this.tabs2).append(
      t2(`Events (${res.table ? shown.length : n})`, !this.statsMode, () => { this.statsMode = false; this.renderResults(); }, false),
      t2('Patterns', false, null, true),
      t2(`Statistics (${res.table ? res.table.rows.length : 0})`, this.statsMode, () => { this.statsMode = true; this.renderResults(); }, !hasStats),
      t2('Visualization', false, null, true),
    );

    this.renderTimeline(hist, events.length);
    this.renderSidebar(shown);

    if (this.statsMode && res.table) return this.renderStats(res);

    const pages = Math.max(1, Math.ceil(shown.length / this.perPage));
    this.page = Math.min(this.page, pages - 1);
    const rows = shown.slice(this.page * this.perPage, (this.page + 1) * this.perPage);
    const pager = h('div', { class: 'pager' },
      h('span', { class: 'fmt' }, 'List ▾ ',
        h('button', { type: 'button', class: 'fmtbtn', 'aria-expanded': String(this.formatOpen), onclick: () => { this.formatOpen = !this.formatOpen; this.renderResults(); } }, 'Format ▾'),
        this.formatOpen ? h('div', { class: 'fmtmenu', role: 'menu' },
          h('div', { class: 'fmt-h' }, 'Max lines'),
          MAX_LINES.map((n) => h('button', { type: 'button', class: `fmt-opt${this.maxLines === n ? ' on' : ''}`, 'data-maxlines': n === Infinity ? 'all' : n, onclick: () => { this.maxLines = n; this.formatOpen = false; this.renderResults(); } }, n === Infinity ? 'All lines' : `${n} lines`))) : null),
      h('select', { class: 'per', 'aria-label': 'Events per page', onchange: (e) => { this.perPage = Number(e.target.value); this.page = 0; this.renderResults(); } },
        [10, 20, 50, 100].map((p) => h('option', { value: p, selected: p === this.perPage }, `${p} Per Page`))),
      h('span', { class: 'spacer' }),
      pages > 1 ? h('span', { class: 'pg' },
        h('button', { type: 'button', disabled: this.page === 0, onclick: () => { this.page--; this.renderResults(); } }, '‹ Prev'),
        ...this.pageNumbers(pages).map((p) => (p === '…' ? h('span', {}, '…') : h('button', { type: 'button', class: p === this.page ? 'cur' : '', onclick: () => { this.page = p; this.renderResults(); } }, String(p + 1)))),
        h('button', { type: 'button', disabled: this.page >= pages - 1, onclick: () => { this.page++; this.renderResults(); } }, 'Next ›')) : '',
    );
    clear(this.results).append(
      pager,
      h('div', { class: 'colhead' }, h('span', { class: 'c-i' }, 'i'), h('span', { class: 'c-time' }, 'Time'), h('span', { class: 'c-evt' }, 'Event')),
      ...rows.map((e) => this.renderRow(e, flagged)),
      shown.length ? null : h('div', { class: 'quiet' }, res.error ? 'Fix the search and try again.' : 'No results found. Try expanding the time range, or check the field names in the sidebar.'),
    );
  }

  fmtNow(nowSec) {
    const d = this.scene.day.date;
    const h12 = Math.floor(nowSec / 3600) % 12 || 12;
    const ap = Math.floor(nowSec / 3600) % 24 < 12 ? 'AM' : 'PM';
    return `${pad2(this.monthNum(d.month))}/${pad2(d.day)}/${String(d.year || 2026).slice(2)} ${h12}:${pad2(Math.floor((nowSec % 3600) / 60))}:${pad2(nowSec % 60)}.000 ${ap}`;
  }

  monthNum(m) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m) + 1;
  }

  pageNumbers(pages) {
    const out = [];
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - this.page) <= 2) out.push(i);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  }

  // Splunk's timeline: one bar per time bucket; click a bar to narrow the events to it.
  renderTimeline(hist, total) {
    const max = Math.max(1, ...hist.buckets.map((b) => b.count));
    const bars = hist.buckets.map((b) =>
      h('button', {
        type: 'button',
        class: `bar${this.bucket && this.bucket.from === b.from ? ' sel' : ''}`,
        title: `${b.count} event${b.count === 1 ? '' : 's'} · ${hms(b.from % 86400)}-${hms(b.to % 86400)}`,
        style: { height: `${b.count ? Math.max(3, Math.round((b.count / max) * 38)) : 1}px` },
        onclick: () => {
          this.bucket = this.bucket && this.bucket.from === b.from ? null : { from: b.from, to: b.to };
          this.page = 0;
          this.renderResults();
        },
      }),
    );
    clear(this.timeline).append(
      h('div', { class: 'tl-ctl' },
        h('span', {}, 'Format Timeline ▾'),
        h('button', { type: 'button', disabled: !this.zoom, onclick: () => { this.zoom = null; this.bucket = null; this.renderResults(); } }, '− Zoom Out'),
        h('button', { type: 'button', disabled: !this.bucket, onclick: () => { this.zoom = { ...this.bucket }; this.bucket = null; this.renderResults(); } }, '+ Zoom to Selection'),
        h('button', { type: 'button', disabled: !this.bucket, onclick: () => { this.bucket = null; this.page = 0; this.renderResults(); } }, '✕ Deselect'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'tl-lbl' }, hist.label ? `${hist.label}` : ''),
      ),
      h('div', { class: 'bars' }, bars.length ? bars : h('span', { class: 'quiet' }, total ? '' : 'No events in this time range')),
    );
  }

  renderSidebar(events) {
    const fields = fieldSummary(events);
    const minPct = this.showAllFields ? 0 : 20;
    const interesting = fields.filter((f) => f.pct >= minPct && f.distinct > 0 && !this.selected.includes(f.name));
    const distinctOf = (name) => (['host', 'source', 'sourcetype'].includes(name) ? new Set(events.map((e) => getField(e, name)[0])).size : (fields.find((f) => f.name === name)?.distinct ?? 0));
    const sel = this.selected.map((n) => [n, distinctOf(n)]);
    const entry = (name, n, kind = 'a') => h('button', { type: 'button', class: `fld${this.fieldPop === name ? ' on' : ''}`, 'data-field': name, onclick: () => { this.fieldPop = this.fieldPop === name ? null : name; this.renderSidebar(events); } },
      h('span', { class: 'ft' }, kind), h('span', { class: 'fn' }, name), h('span', { class: 'fc' }, String(n)));
    clear(this.sidebar).append(
      h('div', { class: 'fh' }, 'SELECTED FIELDS'),
      ...sel.map(([n, c]) => entry(n, c)),
      h('div', { class: 'fh' }, this.showAllFields ? 'ALL FIELDS' : 'INTERESTING FIELDS'),
      ...interesting.map((f) => entry(f.name, f.distinct, /^[\d.]+$/.test(f.top[0]?.value ?? '') && f.name !== 'src_ip' ? '#' : 'a')),
      h('button', { type: 'button', class: 'fall', onclick: () => { this.showAllFields = !this.showAllFields; this.renderSidebar(events); } }, this.showAllFields ? '− Interesting fields only' : '+ All fields'),
    );
    if (this.fieldPop) this.sidebar.append(this.fieldCard(this.fieldPop, events, fields));
  }

  // The popup Splunk shows when you click a field name: how many values, and the top 10 (click one to search it).
  fieldCard(name, events, fields) {
    let top;
    let distinct;
    let cover;
    if (['host', 'source', 'sourcetype'].includes(name)) {
      const counts = new Map();
      for (const e of events) {
        const v = getField(e, name)[0];
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count }));
      distinct = counts.size;
      cover = 100;
    } else {
      const f = fields.find((x) => x.name === name);
      if (!f) return h('span');
      top = f.top;
      distinct = f.distinct;
      cover = f.pct;
    }
    return h('div', { class: 'fcard', role: 'dialog', 'aria-label': `Field ${name}` },
      h('div', { class: 'fcard-h' }, h('b', {}, name), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: () => { this.fieldPop = null; this.renderSidebar(events); } }, '✕')),
      h('div', { class: 'fcard-s' }, `${distinct} Value${distinct === 1 ? '' : 's'}, ${cover}% of events`),
      h('div', { class: 'fcard-sel' }, 'Selected ', h('button', { type: 'button', class: `seltog${this.selected.includes(name) ? ' yes' : ''}`, 'data-select': name, title: 'Selected fields are shown under every event', onclick: () => this.toggleSelected(name) }, this.selected.includes(name) ? 'Yes' : 'No')),
      h('table', {}, h('tr', {}, h('th', {}, 'Values'), h('th', {}, 'Count'), h('th', {}, '%')),
        top.map((t) => h('tr', {},
          h('td', {}, h('button', { type: 'button', class: 'val', title: `Add ${name}=${t.value} to the search`, onclick: () => this.addTerm(name, t.value) }, t.value)),
          h('td', {}, String(t.count)),
          h('td', {}, `${Math.round((t.count / Math.max(1, events.length)) * 1000) / 10}%`)))),
    );
  }

  toggleSelected(name) {
    this.selected = this.selected.includes(name) ? this.selected.filter((x) => x !== name) : [...this.selected, name];
    this.renderResults();
  }

  addTerm(field, value, exclude = false) {
    const term = `${field}${exclude ? '!=' : '='}${/[\s"|()=]/.test(value) ? `"${value.replace(/"/g, '')}"` : value}`;
    const q = this.query.trim();
    const [base, ...pipes] = q.split('|');
    const next = `${base.trim()} ${term}`.trim() + (pipes.length ? ` |${pipes.join('|')}` : '');
    this.query = next;
    if (this.input) this.input.value = next;
    this.fieldPop = null;
    this.page = 0;
    this.bucket = null;
    this.renderResults();
    this.st.log('log-search', { q: next.slice(0, 60) });
  }

  // ---------- one event ----------
  renderRow(e, flagged) {
    const isFlagged = flagged.has(e.id);
    const open = this.expanded.has(e.id);
    const ips = [...new Set((e.raw.match(IP_RE) || []).concat(e.ip ? [e.ip] : []))].slice(0, 4);
    const json = this.parseJson(e);
    const lines = e.raw.split('\n');
    const limit = this.maxLines;
    const full = open || this.fullText.has(e.id);
    const toggle = () => {
      if (this.expanded.has(e.id)) this.expanded.delete(e.id);
      else this.expanded.add(e.id);
      this.renderResults();
    };
    const body = json
      ? h('div', { class: `msg mono json-msg${open ? ' raw' : ''}`, onclick: (ev) => { if (!ev.target.closest('button')) toggle(); } }, jsonTree(json, { open: open ? 2 : 1 }))
      : h('div', { class: `msg mono${open ? ' raw' : ''}`, onclick: toggle }, (full ? lines : lines.slice(0, limit)).join('\n'));
    const more = !json && !full && lines.length > limit
      ? h('button', { type: 'button', class: 'showall', onclick: () => { this.fullText.add(e.id); this.renderResults(); } }, `Show all ${lines.length} lines`)
      : !json && this.fullText.has(e.id) && lines.length > limit
        ? h('button', { type: 'button', class: 'showall', onclick: () => { this.fullText.delete(e.id); this.renderResults(); } }, 'Show less')
        : null;
    const metaLink = (k, v) => h('span', { class: 'mk' }, `${k} = `, h('button', { type: 'button', class: 'mv', title: `Add ${k}=${v} to the search`, onclick: () => this.addTerm(k, v) }, v));
    const row = h(
      'div',
      { class: `row${isFlagged ? ' flagged' : ''}${open ? ' open' : ''}`, role: 'row', 'data-log': e.id, 'data-key': e.key || null },
      h('button', { type: 'button', class: 'flag', 'aria-pressed': String(isFlagged), title: isFlagged ? 'Remove from the investigation' : 'Add to the investigation (evidence)', onclick: () => this.toggleFlag(e) }, '⚑'),
      h('button', { type: 'button', class: 'exp', 'aria-expanded': String(open), 'aria-label': open ? 'Collapse event' : 'Expand event', onclick: toggle }, open ? '▾' : '▸'),
      h('span', { class: 'time mono' }, h('div', {}, e.splunkTime.split(' ')[0]), h('div', {}, e.splunkTime.split(' ').slice(1).join(' '))),
      h('div', { class: 'evt' },
        body,
        more,
        h('div', { class: 'meta' },
          ...this.selected.map((k) => metaLink(k, getField(e, k).join(', ') || '(none)')),
          e.note ? h('span', { class: 'lookup', title: 'Added by the asset and identity lookup' }, `lookup: ${e.note}`) : null,
          h('span', { class: 'ips' }, ips.map((ip) => this.ipButton(ip)))),
      ),
    );
    if (!open) return row;
    return h('div', { class: 'rowwrap' }, row, this.fieldTable(e));
  }

  parseJson(e) {
    if (e._json !== undefined) return e._json;
    let v = null;
    if (e.raw.trimStart().startsWith('{')) {
      try { v = JSON.parse(e.raw); } catch { v = null; }
    }
    e._json = v;
    return v;
  }

  // Splunk's expanded event: Type | Field | Value | Actions, grouped Selected / Event / Time / Default.
  fieldTable(e) {
    const sel = [['host', e.host], ['source', e.srcpath], ['sourcetype', e.sourcetype]];
    const evFields = Object.entries(e.fields || {}).filter(([k]) => !['host', 'source', 'sourcetype'].includes(k)).slice(0, 60);
    const def = [['index', e.index], ['linecount', String(e.linecount)], ['splunk_server', 'splunk-idx01']];
    const rowFor = (type, k, vals) => h('tr', {},
      h('td', { class: 'ty' }, type),
      h('td', { class: 'k' }, k),
      h('td', { class: 'v' }, [].concat(vals).map((v) => h('div', {}, h('button', { type: 'button', class: 'val', title: `Add ${k}=${v} to the search`, onclick: () => this.addTerm(k, v) }, String(v)),
        h('button', { type: 'button', class: 'pm', title: 'Add to search', onclick: () => this.addTerm(k, v) }, '＋'),
        h('button', { type: 'button', class: 'pm', title: 'Exclude from search', onclick: () => this.addTerm(k, v, true) }, '－')))),
      h('td', { class: 'ac' }, '▾'));
    return h('table', { class: 'evt-fields' },
      h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Field'), h('th', {}, 'Value'), h('th', {}, 'Actions')),
      ...sel.map(([k, v]) => rowFor('Selected', k, v)),
      ...evFields.map(([k, v]) => rowFor('Event', k, v)),
      rowFor('Time', '_time', e.utc.replace(/Z$/, '+00:00')),
      ...def.map(([k, v]) => rowFor('Default', k, v)));
  }

  // The Statistics tab: a plain table, like Splunk. Click a value in a "by" column to search for it.
  renderStats(res) {
    const t = res.table;
    clear(this.results).append(
      h('table', { class: 'stats' },
        h('tr', {}, t.columns.map((c) => h('th', {}, c))),
        t.rows.slice(0, 200).map((r) => h('tr', {}, t.columns.map((c, i) => {
          const v = r[c];
          const text = Array.isArray(v) ? v.join('\n') : String(v ?? '');
          const drill = i === 0 && !/^(count|percent)$/.test(c) && text && !text.includes('\n');
          return h('td', { class: /^\d+(\.\d+)?$/.test(text) ? 'num' : '' }, drill ? h('button', { type: 'button', class: 'val', title: `Search for ${c}=${text}`, onclick: () => this.runDrill(c, text) }, text) : text);
        })))),
      t.rows.length ? null : h('div', { class: 'quiet' }, 'No results found.'),
    );
  }

  runDrill(field, value) {
    const base = this.query.split('|')[0].trim();
    const q = `${base} ${field}="${value}"`;
    this.query = q;
    if (this.input) this.input.value = q;
    this.runNow(q);
  }

  toggleFlag(e) {
    const f = this.st.soc.flagged;
    const i = f.indexOf(e.id);
    if (i >= 0) f.splice(i, 1);
    else f.push(e.id);
    this.st.log(i >= 0 ? 'log-unflagged' : 'log-flagged', { id: e.id, key: e.key || null, attack: !!e.attack });
    this.renderResults();
  }

  // ---------- Investigation (the case write-up) ----------
  renderCase() {
    const cf = this.caseFile;
    const main = this.mainAlert;
    const CASE = main?.case;
    if (!CASE || this.st.soc.alerts[main.id] == null) {
      this.main.append(h('div', { class: 'quiet' }, 'No open investigations.'));
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
          if (!flaggedLines.length) return void (msg.textContent = 'Add at least one event to the investigation first (Search → ⚑).');
          if (!chosen.length) return void (msg.textContent = 'Pick at least one response.');
          this.st.soc.cases[main.id] = { verdict, actions: chosen, evidence: flaggedLines.map((e) => ({ id: e.id, key: e.key || null, attack: !!e.attack })), at: this.scene.minutes };
          this.st.log('case-submitted', { verdict, actions: chosen });
          this.scene.onCaseSubmitted();
          this.render();
        },
      },
      h('h2', {}, `Investigation: ${main.title}`),
      h('fieldset', {}, h('legend', {}, `1. ${CASE.question || 'What happened?'}`), verdicts),
      h(
        'fieldset',
        {},
        h('legend', {}, `2. Evidence (${flaggedLines.length} event${flaggedLines.length === 1 ? '' : 's'} added)`),
        flaggedLines.length
          ? h('pre', { class: 'evidence mono' }, flaggedLines.map(compact).join('\n'))
          : h('div', { class: 'quiet' }, 'Nothing added yet. Go to Search and add (⚑) the events that prove your answer.'),
        // Trainee difficulty: the case's key line, in plain words, behind a click.
        !cf && this.scene.difficulty?.hint && CASE.primaryEvidence?.note
          ? h(
              'details',
              { class: 'case-hint', 'data-hint': 'case', ontoggle: (ev) => ev.target.open && !this.st.hasEvent('hint-used') && this.st.log('hint-used', { id: main.id }) },
              h('summary', {}, 'Stuck? Show a hint (Trainee)'),
              h('p', {}, CASE.primaryEvidence.note),
            )
          : null,
      ),
      h('fieldset', {}, h('legend', {}, '3. What should we do? (pick all that apply)'), actions),
      cf
        ? h('div', { class: 'callout ok' }, `Submitted to Priya at ${this.scene.clockString()}. She'll go over it with you at the end of the day.`)
        : h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary', 'data-action': 'submit-case' }, 'Submit to Priya'), msg),
    );
    this.main.append(form);
  }

  // Day 5: a live counter while the ransomware is still running.
  crisisBanner() {
    const c = this.scene.crisisStatus?.();
    if (!c) return null;
    this.crisisEl = h('div', { class: `crisis ${c.stopped ? 'stopped' : ''}`, 'data-crisis': '' }, c.text);
    return this.crisisEl;
  }

  // ---------- lifecycle ----------
  onOpen() {
    if (this.view === 'alert' && !this.alertId) this.view = 'overview';
    this.render();
    this.timer = setInterval(() => {
      const c = this.scene.crisisStatus?.();
      if (c && this.crisisEl) {
        this.crisisEl.textContent = c.text;
        this.crisisEl.classList.toggle('stopped', !!c.stopped);
      }
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
