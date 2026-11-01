import { h, clear } from '../dom.js';
import { startSearch, splitPipes } from '../../game/siemSearch.js';
import { fmtSplunk, fmtLocal, fmtShort } from '../../game/siemGen.js';
import './siem.css';

// The SIEM search page, modelled on Splunk Enterprise's "Search & Reporting" app (see docs/reference-ui/siem.md):
// search bar + time picker, "✓ N events" status line with a job progress bar, Events / Statistics tabs, the
// timeline histogram, Selected / Interesting Fields sidebar, an "i | Time | Event" list with host/source/sourcetype
// under every event, and Prev 1 2 3 Next pagination. The event list only renders the rows in view.
//
//   const app = new SiemApp({ siem, hunt, onHuntAnswer(qid, text) -> {ok, msg}, clock: () => roundClockSec });
//   parent.append(app.el);  app.refresh() once a second;  app.focus();  app.destroy();

const fmt = (n) => Number(n).toLocaleString('en-US');
const PRESETS = [
  ['Last 15 minutes', 900], ['Last 60 minutes', 3600], ['Last 4 hours', 14400], ['Last 24 hours', 86400],
  ['Last 7 days', 604800], ['All time', null], ['During the round', 'round'],
];
const EXAMPLES = [
  ['Failed SSH logins by source', 'sourcetype=linux_secure "Failed password" | stats count by src_ip | sort - count | head 10'],
  ['Successful SSH logins', 'sourcetype=linux_secure Accepted | table _time host user src_ip'],
  ['Top web clients', 'sourcetype=access_combined | top limit=10 src_ip'],
  ['Rare user agents', 'sourcetype=access_combined | rare limit=15 useragent'],
  ['Windows account changes', 'sourcetype=WinEventLog:Security (EventCode=4720 OR EventCode=4722 OR EventCode=4728 OR EventCode=4732 OR EventCode=4698) | table _time host EventCode Target_Account_Name Group_Name'],
  ['Logon failures by account', 'EventCode=4625 | stats count by user | sort - count'],
  ['Firewall: outbound passes by destination', 'sourcetype=pfsense:filterlog action=pass dir=out | stats count by dest_ip dest_port | sort count | head 20'],
  ['Firewall: blocks by source', 'sourcetype=pfsense:filterlog action=block | top limit=10 src_ip'],
];
const HELP = [
  'field=value, field!=value, field>n, wildcards (*), "quoted phrase"',
  'AND is implied; use OR, NOT and ( ) to combine terms',
  '| stats count [by f1, f2]   | stats dc(f) by g   | top limit=N f   | rare f',
  '| table f1 f2   | sort - count   | where count>5   | head N   | dedup f',
  'Fields: host source sourcetype index src_ip dest_ip user action status uri EventCode ...',
];
const CLICK_FIELDS = ['src_ip', 'dest_ip', 'user', 'Account_Name', 'Target_Account_Name', 'Subject_Account_Name', 'uri', 'status', 'method', 'EventCode', 'Group_Name', 'Task_Name', 'Workstation_Name', 'database', 'dest_port', 'app'];
const isWord = (c) => /[A-Za-z0-9_]/.test(c || '');

function quoteVal(v) { v = String(v); return /[\s"()|=<>]/.test(v) ? `"${v.replace(/"/g, '')}"` : v; }

function highlightRegex(query) {
  const first = splitPipes(String(query || ''))[0].replace(/^search\s+/i, '');
  const toks = first.match(/"[^"]*"|\S+/g) || [];
  const parts = [];
  for (let t of toks) {
    t = t.replace(/[()]/g, '');
    if (!t || /^(AND|OR|NOT)$/.test(t)) continue;
    const m = t.match(/^[A-Za-z_][\w.]*(=|>=|<=|>|<)(.*)$/);
    if (/^[A-Za-z_][\w.]*!=/.test(t)) continue;
    if (m) { if (m[1] !== '=') continue; t = m[2]; }
    t = t.replace(/"/g, '');
    if (t.length < 2) continue;
    parts.push(t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*?'));
  }
  return parts.length ? new RegExp(parts.join('|'), 'gi') : null;
}

export class SiemApp {
  constructor({ siem, hunt = [], onHuntAnswer = () => ({ ok: false, msg: '' }), clock = () => 0 } = {}) {
    this.siem = siem; this.hunt = hunt; this.onHuntAnswer = onHuntAnswer; this.clock = clock;
    this.range = { key: 'All time', from: undefined, to: undefined, label: 'All time' };
    this.rangeStack = [];
    this.perPage = 20; this.page = 0; this.tab = 'events';
    this.job = null; this.query = ''; this.expanded = new Set(); this.fullRaw = new Set();
    this.hs = new Map(); this.rows = new Map(); this.evCache = new Map();
    this.huntState = new Map(); this.huntOpen = false; this.fieldsOpen = false; this.allFields = false;
    this.selBar = -1; this.hlRe = null; this.lastFieldPaint = 0; this.paintTimer = 0; this.destroyed = false;
    this._build();
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this._resize()) : null;
    if (this._ro) this._ro.observe(this.el);
    this._onDoc = (e) => { if (!this.timeMenu.contains(e.target) && !this.timeBtn.contains(e.target)) this.timeMenu.hidden = true; if (!this.exMenu.contains(e.target) && !this.exBtn.contains(e.target)) this.exMenu.hidden = true; };
    document.addEventListener('mousedown', this._onDoc);
    this.refresh();
  }

  // ---------------------------------------------------------------- DOM
  _build() {
    const siem = this.siem;
    this.liveEl = h('span', { class: 'sx-live-n' }, '0');
    this.huntBtn = h('button', { class: 'sx-nav sx-huntbtn', type: 'button', onclick: () => this._toggleHunt() }, 'Investigation');
    const nav = ['Search', 'Analytics', 'Datasets', 'Reports', 'Alerts', 'Dashboards'].map((n, i) => h('span', { class: 'sx-nav' + (i === 0 ? ' on' : '') }, n));
    const top = h('div', { class: 'sx-top' },
      h('span', { class: 'sx-logo' }, 'splunk', h('b', {}, '>'), h('small', {}, 'enterprise')),
      h('span', { class: 'sx-spacer' }),
      ...['Administrator', 'Messages', 'Settings', 'Activity', 'Help', 'Find'].map((t) => h('span', { class: 'sx-topi' + (t === 'Administrator' ? ' keep' : '') }, t + (t === 'Find' ? '' : ' ▾'))));
    const app = h('div', { class: 'sx-app' },
      h('span', { class: 'sx-appname' }, h('i', { class: 'sx-appicon' }), 'Search & Reporting'),
      h('div', { class: 'sx-navs' }, nav, this.huntBtn),
      h('span', { class: 'sx-spacer' }),
      h('span', { class: 'sx-live' }, h('i', { class: 'sx-dot' }), this.liveEl, ' events indexed'));

    // search row
    this.input = h('input', { class: 'sx-q', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', placeholder: 'enter search here...', 'aria-label': 'Search', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.run(); } } });
    this.timeBtn = h('button', { class: 'sx-time', type: 'button', onclick: () => { this.timeMenu.hidden = !this.timeMenu.hidden; } }, h('i', { class: 'sx-clock' }), h('span', { class: 'sx-timelbl' }, 'All time'), ' ▾');
    this.timeMenu = h('div', { class: 'sx-menu sx-timemenu', hidden: true },
      h('div', { class: 'sx-mh' }, 'Presets'),
      ...PRESETS.map(([label, sec]) => h('button', { type: 'button', class: 'sx-mi', onclick: () => { this._setPreset(label, sec); this.timeMenu.hidden = true; this.run(); } }, label)));
    this.goBtn = h('button', { class: 'sx-go', type: 'button', 'aria-label': 'Search', onclick: () => this.run() }, h('i', { class: 'sx-mag' }));
    this.exBtn = h('button', { class: 'sx-link sx-exbtn', type: 'button', onclick: () => { this.exMenu.hidden = !this.exMenu.hidden; } }, 'Saved Searches ▾');
    this.exMenu = h('div', { class: 'sx-menu sx-exmenu', hidden: true },
      h('div', { class: 'sx-mh' }, 'Example searches'),
      ...EXAMPLES.map(([t, q]) => h('button', { type: 'button', class: 'sx-mi sx-ex', title: q, onclick: () => { this.input.value = q; this.exMenu.hidden = true; this.run(); } }, h('b', {}, t), h('code', {}, q))),
      h('div', { class: 'sx-mh' }, 'Search help'),
      ...HELP.map((t) => h('div', { class: 'sx-help' }, t)));
    const title = h('div', { class: 'sx-title' }, h('h1', {}, 'New Search'), h('span', { class: 'sx-spacer' }), h('span', { class: 'sx-menuwrap' }, this.exBtn, this.exMenu), h('span', { class: 'sx-btn sx-off' }, 'Save As ▾'), h('span', { class: 'sx-btn sx-off' }, 'Close'));
    const bar = h('div', { class: 'sx-bar' }, this.input, h('span', { class: 'sx-menuwrap' }, this.timeBtn, this.timeMenu), this.goBtn);

    this.statusEl = h('span', { class: 'sx-status' }, 'Enter a search above and press Enter.');
    this.stopBtn = h('button', { class: 'sx-ib', type: 'button', title: 'Stop the search', disabled: true, onclick: () => { if (this.job) { this.job.cancel(); this._paint(true); } } }, '■');
    this.jobEl = h('span', { class: 'sx-job' }, h('span', { class: 'sx-link' }, 'Job ▾'), h('button', { class: 'sx-ib', type: 'button', disabled: true, title: 'Pause' }, '❚❚'), this.stopBtn, h('span', { class: 'sx-link sx-smart' }, 'Smart Mode ▾'));
    this.progEl = h('i', { class: 'sx-progfill' });
    const statusRow = h('div', { class: 'sx-statusrow' }, this.statusEl, h('span', { class: 'sx-spacer' }), this.jobEl);
    this.head = h('div', { class: 'sx-head' }, title, bar, statusRow, h('div', { class: 'sx-prog' }, this.progEl));

    // tabs
    this.tabEvents = h('button', { type: 'button', class: 'sx-tab on', onclick: () => this._setTab('events') }, 'Events (0)');
    this.tabStats = h('button', { type: 'button', class: 'sx-tab', onclick: () => this._setTab('stats') }, 'Statistics (0)');
    const tabs = h('div', { class: 'sx-tabs' }, this.tabEvents, h('span', { class: 'sx-tab off' }, 'Patterns'), this.tabStats, h('span', { class: 'sx-tab off' }, 'Visualization'));

    // timeline
    this.barsEl = h('div', { class: 'sx-bars' });
    this.axisEl = h('div', { class: 'sx-axis' });
    this.zoomOut = h('button', { class: 'sx-link', type: 'button', disabled: true, onclick: () => this._zoomOut() }, '− Zoom Out');
    this.perCol = h('span', { class: 'sx-percol' });
    this.timelineEl = h('div', { class: 'sx-timeline' },
      h('div', { class: 'sx-tlctl' }, h('span', { class: 'sx-link off' }, 'Format Timeline ▾'), this.zoomOut, h('span', { class: 'sx-link off' }, '+ Zoom to Selection'), h('span', { class: 'sx-link off' }, '× Deselect'), h('span', { class: 'sx-spacer' }), this.perCol),
      this.barsEl, this.axisEl);

    // work area
    this.fieldsEl = h('div', { class: 'sx-fields' });
    this.fcard = h('div', { class: 'sx-fcard', hidden: true });
    this.fieldsBtn = h('button', { class: 'sx-link sx-fieldsbtn', type: 'button', onclick: () => { this.fieldsOpen = !this.fieldsOpen; this.el.classList.toggle('sx-fopen', this.fieldsOpen); } }, 'Fields ▾');
    this.pagerEl = h('div', { class: 'sx-pager' });
    this.colHead = h('div', { class: 'sx-colhead' }, h('span', { class: 'sx-ci' }, 'i'), h('span', { class: 'sx-ct' }, 'Time'), h('span', { class: 'sx-ce' }, 'Event'));
    this.listEl = h('div', { class: 'sx-list' });
    this.emptyEl = h('div', { class: 'sx-empty' });
    this.resultsEl = h('div', { class: 'sx-results' }, this.pagerEl, this.colHead, this.listEl, this.emptyEl);
    this.work = h('div', { class: 'sx-work' }, this.fieldsEl, this.resultsEl);

    this.main = h('div', { class: 'sx-main' }, this.head, tabs, this.timelineEl, this.fieldsBtn, this.work, this.fcard);
    this.main.addEventListener('scroll', () => this._scheduleLayout());

    // hunt panel
    this.huntEl = h('aside', { class: 'sx-hunt', hidden: true });
    this._buildHunt();

    this.el = h('div', { class: 'sx' }, top, app, h('div', { class: 'sx-body' }, this.main, this.huntEl));
    this.input.value = '';
  }

  _buildHunt() {
    clear(this.huntEl);
    const done = [...this.huntState.values()].filter((s) => s.ok).length;
    this.huntBtn.textContent = this.hunt.length ? `Investigation (${done}/${this.hunt.length})` : 'Investigation';
    this.huntBtn.classList.toggle('on', this.huntOpen);
    this.huntEl.hidden = !this.huntOpen;
    this.huntEl.append(h('div', { class: 'sx-hh' }, h('b', {}, 'Investigation'), h('span', { class: 'sx-spacer' }), h('button', { class: 'sx-x', type: 'button', 'aria-label': 'Close', onclick: () => this._toggleHunt() }, '×')));
    this.huntEl.append(h('p', { class: 'sx-hintp' }, 'Someone got in. Find out how, using the logs. Answers are checked, not shown.'));
    this.hunt.forEach((q, n) => {
      const st = this.huntState.get(q.id) || {};
      const inp = h('input', { type: 'text', class: 'sx-hin', spellcheck: 'false', value: st.text || '', disabled: st.ok ? true : null, 'aria-label': q.q, onkeydown: (e) => { if (e.key === 'Enter') submit(); } });
      const submit = () => {
        const text = inp.value.trim(); if (!text) return;
        const res = this.onHuntAnswer(q.id, text) || { ok: false, msg: '' };
        this.huntState.set(q.id, { text, ok: !!res.ok, msg: res.msg || (res.ok ? 'Correct.' : 'Not quite. Keep looking in the logs.') });
        this._buildHunt();
      };
      this.huntEl.append(h('div', { class: 'sx-hq' + (st.ok ? ' ok' : st.msg ? ' bad' : '') },
        h('div', { class: 'sx-hqt' }, h('span', { class: 'sx-hn' }, String(n + 1)), q.q),
        h('div', { class: 'sx-hrow' }, inp, h('button', { type: 'button', class: 'sx-btn sx-prim', disabled: st.ok ? true : null, onclick: submit }, 'Submit')),
        st.msg ? h('div', { class: 'sx-hmsg' }, (st.ok ? '✓ ' : '✗ ') + st.msg) : null));
    });
  }

  _toggleHunt() { this.huntOpen = !this.huntOpen; this._buildHunt(); this._scheduleLayout(); }

  // ---------------------------------------------------------------- public API
  focus() { this.input.focus(); }
  refresh() {
    if (this.destroyed) return;
    const n = fmt(this.siem.count(this.clock()));
    if (this.liveEl.textContent !== n) this.liveEl.textContent = n;
  }
  destroy() {
    this.destroyed = true;
    if (this.job) this.job.cancel();
    clearTimeout(this.paintTimer);
    if (this._ro) this._ro.disconnect();
    document.removeEventListener('mousedown', this._onDoc);
    this.el.remove();
  }
  /** Set the search text and run it (used by the host and the tests). */
  search(q) { this.input.value = q; this.run(); }

  // ---------------------------------------------------------------- search control
  _nowEpoch() { return this.siem.epochOfClock(this.clock()); }
  _setPreset(label, sec) {
    const now = this._nowEpoch();
    this.rangeStack = [];
    if (sec === null) this.range = { key: label, from: undefined, to: undefined, label };
    else if (sec === 'round') this.range = { key: label, from: this.siem.roundStart, to: undefined, label };
    else this.range = { key: label, from: now - sec, to: undefined, label, rel: sec };
    this._updateTimeLabel();
  }
  _updateTimeLabel() { this.timeBtn.querySelector('.sx-timelbl').textContent = this.range.label; }

  run() {
    if (this.destroyed) return;
    if (this.job) this.job.cancel();
    this.query = this.input.value.trim();
    if (this.range.rel) this.range.from = this._nowEpoch() - this.range.rel; // relative presets slide with the clock
    this.page = 0; this.hs.clear(); this.expanded.clear(); this.fullRaw.clear(); this.evCache.clear(); this.selBar = -1;
    for (const [, el] of this.rows) el.remove();
    this.rows.clear();
    this.hlRe = highlightRegex(this.query);
    this.fcard.hidden = true;
    const maxIndex = this.siem.count(this.clock());
    this.maxIndexUsed = maxIndex;
    this.job = startSearch(this.siem, this.query, {
      from: this.range.from, to: this.range.to, maxIndex,
      onProgress: () => this._queuePaint(), onDone: () => this._paint(true),
    });
    this.tab = this.job.mode === 'table' ? 'stats' : 'events';
    this._paint(true);
  }

  _queuePaint() {
    if (this.paintTimer || this.destroyed) return;
    this.paintTimer = setTimeout(() => { this.paintTimer = 0; this._paint(false); }, 120);
  }

  // ---------------------------------------------------------------- painting
  _paint(final) {
    if (this.destroyed) return;
    clearTimeout(this.paintTimer); this.paintTimer = 0;
    const j = this.job; if (!j) return;
    const running = j.state === 'running';
    this.stopBtn.disabled = !running;
    this.progEl.style.width = (j.total ? Math.min(100, (j.scanned / j.total) * 100) : 100).toFixed(1) + '%';
    this.progEl.parentNode.classList.toggle('run', running);
    // status line
    clear(this.statusEl);
    if (j.state === 'error') this.statusEl.append(h('span', { class: 'sx-err' }, j.error));
    else {
      const range = this.range.key === 'All time' ? `before ${fmtSplunk(this.siem.tOf(Math.max(0, j.hi - 1)))}` : `${fmtSplunk(this.siem.tOf(j.lo))} to ${fmtSplunk(this.siem.tOf(Math.max(j.lo, j.hi - 1)))}`;
      if (running) this.statusEl.append(h('span', { class: 'sx-spin' }), h('span', { class: 'sx-count' }, `${fmt(j.matched)} events`), h('span', { class: 'sx-dim' }, ` (scanned ${fmt(j.scanned)} of ${fmt(j.total)})`));
      else this.statusEl.append(h('span', { class: j.state === 'canceled' ? 'sx-dim' : 'sx-okm' }, j.state === 'canceled' ? '■ ' : '✓ '), h('span', { class: 'sx-count' }, `${fmt(j.matched)} events`), h('span', { class: 'sx-dim' }, ` (${range})`), ...(j.state === 'canceled' ? [h('span', { class: 'sx-dim' }, ' – search canceled')] : []), h('span', { class: 'sx-dim sx-sec' }, ` ${(j.elapsedMs / 1000).toFixed(1)} s`));
      this.statusEl.append(h('span', { class: 'sx-link off sx-nes' }, 'No Event Sampling ▾'));
    }
    // tabs
    const stats = j.table ? j.table.rows.length : 0;
    this.tabEvents.textContent = `Events (${fmt(j.mode === 'events' ? j.collected : 0)})`;
    this.tabStats.textContent = `Statistics (${fmt(stats)})`;
    this.tabEvents.classList.toggle('on', this.tab === 'events');
    this.tabStats.classList.toggle('on', this.tab === 'stats');
    this.tabEvents.classList.toggle('off', j.mode === 'table');
    this.tabStats.classList.toggle('off', j.mode === 'events');
    this.timelineEl.hidden = this.tab !== 'events' || j.state === 'error';
    this._paintColHead();
    this.work.classList.toggle('sx-statsmode', this.tab === 'stats');
    if (!this.timelineEl.hidden) this._paintTimeline();
    const now = performance.now();
    if (final || now - this.lastFieldPaint > 450) { this.lastFieldPaint = now; this._paintFields(); }
    this._paintPager();
    this._paintEmpty();
    this._layout();
  }

  _paintColHead() {
    const j = this.job; const c = this.colHead; clear(c);
    if (this.tab === 'events') { c.classList.remove('stats'); c.style.gridTemplateColumns = ''; c.append(h('span', { class: 'sx-ci' }, 'i'), h('span', { class: 'sx-ct' }, 'Time'), h('span', { class: 'sx-ce' }, 'Event')); return; }
    c.classList.add('stats');
    const cols = j.table ? j.table.columns : [];
    c.style.gridTemplateColumns = `repeat(${Math.max(1, cols.length)}, minmax(90px, 1fr))`;
    cols.forEach((n) => c.append(h('span', { class: 'sx-hcell' }, n)));
  }

  _paintEmpty() {
    const j = this.job; let msg = '';
    if (j.state === 'error') msg = '';
    else if (this.tab === 'events' && j.state !== 'running' && j.collected === 0 && j.mode === 'events') msg = 'No results found. Try expanding the time range or relaxing the search.';
    else if (this.tab === 'stats' && j.state === 'done' && j.table && !j.table.rows.length) msg = 'No results found.';
    this.emptyEl.textContent = msg; this.emptyEl.hidden = !msg;
  }

  _paintTimeline() {
    const tl = this.job.timeline; if (!tl) return;
    const counts = tl.counts; const max = Math.max(1, ...counts);
    const frag = [];
    counts.forEach((c, k) => {
      const bt = tl.t0 + k * tl.bw;
      const b = h('button', { type: 'button', class: 'sx-bar1' + (k === this.selBar ? ' sel' : ''), style: { height: c ? `${Math.max(3, (c / max) * 100)}%` : '1px' }, title: `${fmt(c)} event${c === 1 ? '' : 's'} – ${fmtShort(bt)}`, 'aria-label': `${fmt(c)} events at ${fmtShort(bt)}`, onclick: () => this._zoomTo(k) });
      if (!c) b.classList.add('z');
      frag.push(b);
    });
    clear(this.barsEl); this.barsEl.append(...frag);
    clear(this.axisEl);
    const ticks = 4;
    for (let k = 0; k <= ticks; k++) this.axisEl.append(h('span', {}, fmtShort(tl.t0 + Math.round((counts.length * tl.bw * k) / ticks))));
    const bw = tl.bw;
    this.perCol.textContent = bw >= 86400 ? `${Math.round(bw / 86400)} day per column` : bw >= 3600 ? `${Math.round(bw / 3600)} hour${Math.round(bw / 3600) > 1 ? 's' : ''} per column` : bw >= 60 ? `${Math.round(bw / 60)} minute${Math.round(bw / 60) > 1 ? 's' : ''} per column` : `${bw} second${bw > 1 ? 's' : ''} per column`;
    this.zoomOut.disabled = !this.rangeStack.length;
  }

  _zoomTo(k) {
    const tl = this.job && this.job.timeline; if (!tl) return;
    this.rangeStack.push({ ...this.range });
    const from = tl.t0 + k * tl.bw; const to = from + tl.bw;
    this.range = { key: 'custom', from, to, label: `${fmtShort(from)} to ${fmtShort(to)}` };
    this._updateTimeLabel();
    this.run();
  }
  _zoomOut() {
    const prev = this.rangeStack.pop(); if (!prev) return;
    this.range = prev; this._updateTimeLabel();
    const keep = this.rangeStack.slice();
    this.run(); this.rangeStack = keep;
    this.zoomOut.disabled = !this.rangeStack.length;
  }
  _setTab(t) {
    if (!this.job) return;
    if (t === 'events' && this.job.mode === 'table') return;
    if (t === 'stats' && this.job.mode === 'events') return;
    this.tab = t; this.page = 0; this._clearRows(); this._paint(true);
  }

  // ---- fields sidebar
  _paintFields() {
    const j = this.job; clear(this.fieldsEl);
    const list = j.fieldSummary();
    const sample = j.sampled || 1;
    const sel = list.filter((f) => f.name === 'host' || f.name === 'source' || f.name === 'sourcetype');
    const rest = list.filter((f) => !sel.includes(f));
    const interesting = rest.filter((f) => f.count / sample >= 0.2);
    const others = rest.filter((f) => !interesting.includes(f));
    const row = (f) => {
      const numeric = f.top.length && f.top.every((x) => /^-?\d+(\.\d+)?$/.test(x.v));
      return h('button', { type: 'button', class: 'sx-fld', onclick: (e) => this._fieldCard(f, e.currentTarget) }, h('span', { class: 'sx-ft' }, numeric ? '#' : 'a'), h('span', { class: 'sx-fn' }, f.name), h('span', { class: 'sx-fc' }, f.capped || f.distinct >= 100 ? '100+' : String(f.distinct)));
    };
    this.fieldsEl.append(h('div', { class: 'sx-fh' }, 'SELECTED FIELDS'));
    if (!list.length) this.fieldsEl.append(h('div', { class: 'sx-dim sx-fpad' }, j.state === 'running' ? 'Searching…' : 'No fields'));
    sel.forEach((f) => this.fieldsEl.append(row(f)));
    if (interesting.length) this.fieldsEl.append(h('div', { class: 'sx-fh' }, 'INTERESTING FIELDS'), ...interesting.map(row));
    if (others.length) {
      this.fieldsEl.append(h('button', { class: 'sx-link sx-fall', type: 'button', onclick: () => { this.allFields = !this.allFields; this._paintFields(); } }, this.allFields ? '− Fewer Fields' : `+ All Fields (${others.length})`));
      if (this.allFields) this.fieldsEl.append(h('div', { class: 'sx-fh' }, 'OTHER FIELDS'), ...others.map(row));
    }
  }

  _fieldCard(f, anchor) {
    const c = this.fcard; clear(c);
    const pct = (n) => ((n * 100) / (f.sampled || 1)).toFixed(f.sampled > 1000 ? 1 : 0);
    c.append(
      h('div', { class: 'sx-fch' }, h('b', {}, f.name), h('span', { class: 'sx-spacer' }), h('button', { class: 'sx-x', type: 'button', 'aria-label': 'Close', onclick: () => { c.hidden = true; } }, '×')),
      h('div', { class: 'sx-dim' }, `${f.capped ? '100+' : f.distinct} Value${f.distinct === 1 ? '' : 's'}, ${pct(f.count)}% of events`),
      h('div', { class: 'sx-fct' }, `Top ${Math.min(10, f.top.length)} Values`, h('span', { class: 'sx-spacer' }), h('span', {}, 'Count'), h('span', { class: 'sx-fcp' }, '%')),
      ...f.top.map((t) => h('div', { class: 'sx-fv1' },
        h('button', { type: 'button', class: 'sx-val', onclick: () => { c.hidden = true; this.addTerm(f.name, t.v); } }, t.v),
        h('span', { class: 'sx-fvn' }, fmt(t.c)), h('span', { class: 'sx-fcp' }, pct(t.c) + '%'),
        h('i', { class: 'sx-fvb', style: { width: Math.max(2, (t.c / (f.top[0].c || 1)) * 100) + '%' } }))),
      h('div', { class: 'sx-fcf' }, h('button', { type: 'button', class: 'sx-link', onclick: () => { c.hidden = true; this.addPipe(`top limit=20 ${f.name}`); } }, 'Top values report'),
        h('span', { class: 'sx-dim' }, `from the first ${fmt(f.sampled)} matches`)));
    c.hidden = false;
    const mr = this.main.getBoundingClientRect(); const ar = anchor.getBoundingClientRect();
    const narrow = this.el.classList.contains('sx-narrow');
    c.style.left = narrow ? '8px' : `${Math.min(ar.right - mr.left + this.main.scrollLeft - 4, Math.max(8, mr.width - 300))}px`;
    c.style.top = `${ar.top - mr.top + this.main.scrollTop + 4}px`;
  }

  // ---- search text editing (clicking a value adds field=value, like Splunk)
  addTerm(field, value) {
    const term = `${field}=${quoteVal(value)}`;
    const parts = splitPipes(this.input.value.trim());
    if (parts[0].split(/\s+/).includes(term)) { this.run(); return; }
    parts[0] = (parts[0] ? parts[0] + ' ' : '') + term;
    this.input.value = parts.filter((p, i) => i === 0 || p).join(' | ');
    this.run();
  }
  addPipe(stage) {
    this.input.value = (this.input.value.trim() + ' | ' + stage).replace(/^\s*\|\s*/, '');
    this.run();
  }

  // ---- pager
  _total() { const j = this.job; return this.tab === 'events' ? j.collected : (j.table ? j.table.rows.length : 0); }
  _paintPager() {
    const p = this.pagerEl; clear(p);
    const total = this._total(); const pages = Math.max(1, Math.ceil(total / this.perPage));
    if (this.page >= pages) this.page = pages - 1;
    const go = (n) => { this.page = Math.max(0, Math.min(pages - 1, n)); this._clearRows(); this.resultsEl.scrollIntoView({ block: 'nearest' }); this._paintPager(); this._layout(); };
    const sel = h('select', { class: 'sx-pp', 'aria-label': 'Per page', onchange: (e) => { this.perPage = +e.target.value; this.page = 0; this._clearRows(); this._paintPager(); this._layout(); } },
      ...[10, 20, 50].map((n) => h('option', { value: n, selected: n === this.perPage ? true : null }, `${n} Per Page`)));
    const nums = [];
    const shown = new Set([0, pages - 1, this.page - 2, this.page - 1, this.page, this.page + 1, this.page + 2].filter((n) => n >= 0 && n < pages));
    let prev = -1;
    [...shown].sort((a, b) => a - b).forEach((n) => {
      if (n - prev > 1) nums.push(h('span', { class: 'sx-dots' }, '…'));
      nums.push(h('button', { type: 'button', class: 'sx-pg' + (n === this.page ? ' cur' : ''), onclick: () => go(n) }, String(n + 1)));
      prev = n;
    });
    p.append(h('span', { class: 'sx-link off' }, 'List ▾'), h('span', { class: 'sx-link off' }, 'Format ▾'), sel, h('span', { class: 'sx-spacer' }),
      h('button', { type: 'button', class: 'sx-pg', disabled: this.page === 0 ? true : null, onclick: () => go(this.page - 1) }, '« Prev'), ...nums,
      h('button', { type: 'button', class: 'sx-pg', disabled: this.page >= pages - 1 ? true : null, onclick: () => go(this.page + 1) }, 'Next »'));
  }

  // ---------------------------------------------------------------- virtualized list
  _clearRows() { for (const [, el] of this.rows) el.remove(); this.rows.clear(); this.hs.clear(); }
  _resize() {
    const w = this.el.clientWidth;
    this.el.classList.toggle('sx-narrow', w < 760);
    this.el.classList.toggle('sx-tiny', w < 480);
    if (this._lastW !== w) { this._lastW = w; this.hs.clear(); this._scheduleLayout(); }
  }
  _scheduleLayout() {
    if (this._raf || this.destroyed) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._layout(); });
  }
  _pageKs() {
    const total = this._total(); const ks = [];
    for (let k = this.page * this.perPage; k < Math.min(total, (this.page + 1) * this.perPage); k++) ks.push(k);
    return ks;
  }
  _ev(k) {
    let e = this.evCache.get(k);
    if (!e) { e = this.job.event(k); if (this.evCache.size > 300) this.evCache.clear(); this.evCache.set(k, e); }
    return e;
  }
  _est(k) {
    if (this.tab !== 'events') return 26;
    const e = this._ev(k);
    const cpl = Math.max(30, Math.floor(((this.resultsEl.clientWidth || 700) - 130) / 7));
    let lines = 0;
    const all = e.raw.split('\n');
    const shown = this.fullRaw.has(k) ? all : all.slice(0, 10);
    for (const l of shown) lines += Math.max(1, Math.ceil(l.length / cpl));
    return lines * 16 + 48 + (all.length > 10 && !this.fullRaw.has(k) ? 16 : 0) + (this.expanded.has(k) ? Object.keys(e.fields).length * 20 + 70 : 0);
  }
  _layout() {
    if (this.destroyed || !this.job) return;
    const ks = this._pageKs(); const list = this.listEl;
    const tops = []; let y = 0;
    for (const k of ks) { tops.push(y); y += this.hs.get(k) ?? this._est(k); }
    list.style.height = `${y}px`;
    const rel = this.main.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const vt = rel - 500; const vb = rel + this.main.clientHeight + 500;
    const want = new Set();
    ks.forEach((k, i) => { const hh = this.hs.get(k) ?? this._est(k); if (tops[i] + hh >= vt && tops[i] <= vb) want.add(k); });
    for (const [k, el] of this.rows) if (!want.has(k)) { el.remove(); this.rows.delete(k); }
    let changed = false;
    ks.forEach((k, i) => {
      if (!want.has(k)) return;
      let el = this.rows.get(k);
      if (!el) { el = this.tab === 'events' ? this._eventRow(k) : this._statRow(k); list.append(el); this.rows.set(k, el); }
      el.style.top = `${tops[i]}px`;
      const hh = el.offsetHeight;
      if (hh && Math.abs(hh - (this.hs.get(k) ?? -99)) > 1) { this.hs.set(k, hh); changed = true; }
    });
    this.rendered = this.rows.size;
    if (changed) {
      this._relayouts = (this._relayouts || 0) + 1;
      if (this._relayouts < 6) this._scheduleLayout();
    } else this._relayouts = 0;
  }

  // ---- one event row
  _eventRow(k) {
    const e = this._ev(k); const open = this.expanded.has(k);
    const [d, tm] = fmtSplunk(e.t).split(' ');
    const lines = e.raw.split('\n');
    const full = this.fullRaw.has(k) || lines.length <= 10;
    const text = full ? e.raw : lines.slice(0, 10).join('\n');
    const row = h('div', { class: 'sx-row' + (open ? ' open' : '') },
      h('button', { type: 'button', class: 'sx-chev', 'aria-label': open ? 'Collapse event' : 'Expand event', 'aria-expanded': String(open), onclick: () => { if (open) this.expanded.delete(k); else this.expanded.add(k); this.hs.delete(k); this._rerow(k); } }, open ? '▾' : '▸'),
      h('div', { class: 'sx-time1' }, d, h('br'), tm + ' ' + fmtSplunk(e.t).split(' ')[2]),
      h('div', { class: 'sx-ev' },
        h('div', { class: 'sx-raw' }, ...this._rawNodes(text, e)),
        !full ? h('button', { type: 'button', class: 'sx-link sx-showall', onclick: () => { this.fullRaw.add(k); this.hs.delete(k); this._rerow(k); } }, `Show all ${lines.length} lines`) : null,
        h('div', { class: 'sx-meta' }, ...[['host', e.host], ['source', e.source], ['sourcetype', e.sourcetype]].flatMap(([f, v], i) => [i ? h('span', { class: 'sx-sep' }, '|') : null, h('span', { class: 'sx-mk' }, f + ' = '), h('button', { type: 'button', class: 'sx-val', onclick: () => this.addTerm(f, v) }, v)])),
        open ? this._fieldTable(e) : null));
    return row;
  }
  _rerow(k) {
    const old = this.rows.get(k); if (old) { old.remove(); this.rows.delete(k); }
    this._layout();
  }
  _fieldTable(e) {
    const rows = [];
    const add = (type, f, v) => rows.push(h('tr', {}, h('td', { class: 'ty' }, type), h('td', { class: 'k' }, f), h('td', {}, h('button', { type: 'button', class: 'sx-val', onclick: () => (f === '_time' ? null : this.addTerm(f, v)) }, String(v)))));
    add('Selected', 'host', e.host); add('Selected', 'source', e.source); add('Selected', 'sourcetype', e.sourcetype);
    add('Event', 'index', e.index);
    for (const [f, v] of Object.entries(e.fields)) if (v !== '' && v !== undefined) add('Event', f, v);
    rows.push(h('tr', {}, h('td', { class: 'ty' }, 'Time'), h('td', { class: 'k' }, '_time'), h('td', {}, fmtLocal(e.t))));
    return h('table', { class: 'sx-evf' }, h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Field'), h('th', {}, 'Value'))), h('tbody', {}, rows));
  }

  // raw text -> nodes: search-term highlighting plus clickable field values
  _rawNodes(text, e) {
    const ranges = [];
    for (const f of CLICK_FIELDS) {
      const v = e.fields[f]; if (v === undefined || v === '') continue;
      const s = String(v); if (s.length < 2 || (f === 'status' && s.length < 3)) continue;
      let from = 0; let at = -1;
      while ((at = text.indexOf(s, from)) >= 0) {
        if (!isWord(text[at - 1]) && !isWord(text[at + s.length])) break;
        from = at + 1; at = -1;
      }
      if (at >= 0 && !ranges.some((r) => at < r.b && at + s.length > r.a)) ranges.push({ a: at, b: at + s.length, f, v: s });
    }
    ranges.sort((x, y) => x.a - y.a);
    const out = []; let pos = 0;
    const plain = (s) => { if (!s) return; if (!this.hlRe) { out.push(s); return; } this._hl(s, out); };
    for (const r of ranges) {
      plain(text.slice(pos, r.a));
      const inner = []; this._hlInto(text.slice(r.a, r.b), inner);
      out.push(h('span', { class: 'sx-fv', role: 'button', tabindex: '0', title: `${r.f}=${r.v}`, onclick: () => this.addTerm(r.f, r.v), onkeydown: (ev) => { if (ev.key === 'Enter') this.addTerm(r.f, r.v); } }, ...inner));
      pos = r.b;
    }
    plain(text.slice(pos));
    return out;
  }
  _hlInto(s, out) { if (this.hlRe) this._hl(s, out); else out.push(s); }
  _hl(s, out) {
    const re = new RegExp(this.hlRe.source, 'gi'); let last = 0; let m;
    while ((m = re.exec(s)) && m[0]) { if (m.index > last) out.push(s.slice(last, m.index)); out.push(h('mark', { class: 'sx-hl' }, m[0])); last = m.index + m[0].length; }
    if (last < s.length) out.push(s.slice(last));
  }

  // ---- one statistics row
  _statRow(k) {
    const t = this.job.table; const cols = t.columns.length;
    const cells = t.rows[k].map((v, ci) => {
      const col = t.columns[ci]; const num = typeof v === 'number';
      const isField = /^[A-Za-z_][\w.]*$/.test(col) && col !== 'count' && col !== 'percent' && col !== '_time' && v !== '' && !/^(count|dc|sum|avg|min|max|values)\(/.test(col);
      return h('div', { class: 'sx-cell' + (num ? ' num' : '') }, isField ? h('button', { type: 'button', class: 'sx-val', onclick: () => this.addTerm(col, v) }, String(v)) : String(v));
    });
    const row = h('div', { class: 'sx-srow' + (k % 2 ? ' alt' : ''), style: { gridTemplateColumns: `repeat(${cols}, minmax(90px, 1fr))` } }, ...cells);
    return row;
  }
}

