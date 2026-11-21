// The CCDC scoring-engine website, copied from the real scoringengine/scoringengine screens (Bootstrap 3):
// docs/reference/scoringengine-{overview,scoreboard,team_services}.png. Fills its parent.
// See docs/reference-ui/scoreboard.md.
//
//   const sb = new ScoreboardApp({ state, clock: () => seconds, injects: injectsApp /* optional */ });
//   host.append(sb.el); sb.show('overview'); setInterval(() => sb.refresh(), 1000);
//
// full=false is the competition portal: only your own Services page, no other teams' scores.
import { h, clear } from '../dom.js';
import { standings, scoreHistory, liveTeamScore } from '../../game/ccdcTeams.js';
import { CHECK_INTERVAL } from '../../game/ccdcEngine.js';
import './scoreboard.css';

const TABS = [['scoreboard', 'Scoreboard'], ['overview', 'Overview'], ['services', 'Services'], ['injects', 'Injects']];
// Team colours in the same spirit as the real page (Chart.js, one random-looking colour per team).
const COLORS = ['#ea6a5e', '#696636', '#a84240', '#5770dc', '#9c06e0', '#0a1f50', '#8ab0e2', '#7a0072', '#3c9c57', '#d98a1c', '#2b8c99', '#c2407e', '#6b4a2b', '#4d4d4d', '#9aa53b', '#e0559a'];
const SVG = 'http://www.w3.org/2000/svg';
const fmt = (n) => String(Math.round(Number(n)));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Wall-clock shown under "Round N" (the real page prints the round's timestamp). Fictional competition day.
const START = Date.UTC(2026, 1, 21, 9, 0, 0);
const stamp = (sec) => new Date(START + sec * 1000).toISOString().replace('T', ' ').slice(0, 19);
const teamName = (r) => r.team.replace(' ', '');
// The scoring engine checks each team through its own address range: 10.2.<team>.<host>, like the real overview.
const teamIp = (s, no) => `10.2.${no}.${String(s.ip || '').split('.').pop() || 1}`;
const firstPort = (s) => (s.ports && s.ports.length ? s.ports[0] : '');

function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) if (k != null) e.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}

// Round a max value up to a "nice" axis top and step, like Chart.js does.
function niceAxis(max) {
  const m = Math.max(10, max);
  const raw = m / 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw) || 10 * p;
  return { top: Math.ceil(m / step) * step, step };
}

export class ScoreboardApp {
  constructor({ state, clock, injects = null, teamLabel = null, full = true, onRevert = null }) {
    this.state = state;
    this.full = full;
    this.onRevert = onRevert;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.injectsApp = injects;
    this.tab = 'overview';
    this.built = null;
    this.navLinks = {};
    this.pages = {};
    this.sort = { key: 'score', dir: -1 };
    const rows = this._rows();
    this.me = rows.find((r) => r.you);
    this.teamLabel = teamLabel || `${teamName(this.me).toLowerCase()}user1`;
    this.el = h('div', { class: 'sb' });
    this._build();
    this.show(this.full ? 'overview' : 'services');
  }

  _rows() { return standings(this.state, Math.floor(this.clock())); }

  _build() {
    const nav = h('nav', { class: 'sb-nav' },
      h('a', { class: 'sb-brand', href: '#', onclick: (e) => { e.preventDefault(); this.show(this.full ? 'overview' : 'services'); } }, 'Scoring Engine'),
      h('ul', { class: 'sb-navlist' }, TABS.filter(([id]) => this.full || id === 'services').map(([id, label]) => {
        const a = h('a', { href: '#', class: 'sb-navlink', onclick: (e) => { e.preventDefault(); this.show(id); } }, label);
        this.navLinks[id] = a;
        return h('li', {}, a);
      })),
      h('ul', { class: 'sb-navlist sb-navright' },
        h('li', {}, h('a', { href: '#', class: 'sb-navlink', onclick: (e) => e.preventDefault() }, `${this.teamLabel} `, h('span', { class: 'sb-caret' }))),
        h('li', {}, h('a', { href: '#', class: 'sb-navlink', onclick: (e) => e.preventDefault() }, 'About'))),
    );
    this.main = h('div', { class: 'sb-main' });
    this.el.append(nav, this.main);

    // --- overview: Round N, timestamp, teams x services matrix of green/red ip:port cells
    this.ov = { round: h('h1', { class: 'sb-round' }), time: h('h4', { class: 'sb-time' }), live: h('div', { class: 'sb-live' }), head: h('tr', {}), body: h('tbody', {}) };
    this.pages.overview = h('div', { class: 'sb-page' },
      this.ov.round, this.ov.time, this.ov.live,
      h('div', { class: 'sb-scroll' }, h('table', { class: 'sb-table sb-matrix' }, h('thead', {}, this.ov.head), this.ov.body)),
      h('p', { class: 'sb-json' }, 'Want a json formatted version of this data (including ip addresses)? ', h('a', { href: '#', onclick: (e) => e.preventDefault() }, 'Here')));

    // --- scoreboard: bar chart of points, then each team's score per round
    this.sbp = { bars: h('div', { class: 'sb-chart' }), lines: h('div', { class: 'sb-chart' }), sig: '' };
    this.pages.scoreboard = h('div', { class: 'sb-page' },
      h('div', { class: 'sb-panel' }, this.sbp.bars, h('hr', {}), this.sbp.lines));

    // --- services (your team)
    this.sv = { team: h('h2', { class: 'sb-svc-team' }), place: h('div', {}), score: h('div', {}), body: h('tbody', {}), rows: {} };
    const cols = this.full
      ? ['Service', 'Host', 'Port', 'Status', 'Score Earned', 'Max Score', '% Earned', 'Trending']
      : ['Service', 'Host', 'Port', 'Status', 'Trending'];
    this.pages.services = h('div', { class: 'sb-page' },
      h('div', { class: 'sb-svc-head' }, this.sv.team, this.full ? h('div', { class: 'sb-svc-sub' }, this.sv.place, this.sv.score) : null),
      h('div', { class: 'sb-scroll' }, h('table', { class: 'sb-table sb-striped sb-svc' },
        h('thead', {}, h('tr', {}, cols.map((t) => h('th', {}, t, h('span', { class: 'sb-sorticon' }))))),
        this.sv.body)),
      this.onRevert ? h('div', { class: 'sb-scroll sb-vms' }, h('h3', {}, 'Virtual machines'), h('table', { class: 'sb-table sb-striped' },
        h('thead', {}, h('tr', {}, ['Virtual machine', 'Address', 'Tech Support'].map((t) => h('th', {}, t)))),
        h('tbody', {}, this.state.deviceList.map((d) => h('tr', {}, h('td', {}, d.host), h('td', {}, d.ip), h('td', {}, this._revertBtn(d))))))) : null);

    // --- injects (embedded portal)
    this.pages.injects = h('div', { class: 'sb-page sb-page-injects' });
  }

  // Reverting wipes your own work on the box too, so it takes a second click.
  _revertBtn(d) {
    const b = h('button', { type: 'button', class: 'sb-btn sb-revert', 'data-revert': d.id, onclick: () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirm revert'; return; }
      b.dataset.armed = ''; b.textContent = 'Request revert'; this.onRevert(d.id);
    } }, 'Request revert');
    return b;
  }

  show(tab) {
    if (!this.pages[tab] || (!this.full && tab !== 'services')) tab = this.full ? 'overview' : 'services';
    this.tab = tab;
    for (const [id, a] of Object.entries(this.navLinks)) a.parentElement.classList.toggle('active', id === tab);
    clear(this.main);
    this.main.append(this.pages[tab]);
    if (tab === 'injects') {
      clear(this.pages.injects);
      if (this.injectsApp) this.pages.injects.append(this.injectsApp.el);
      else this.pages.injects.append(h('div', { class: 'sb-pad' }, 'The inject portal is not attached.'));
    }
    this.sbp.sig = '';
    this.refresh();
  }

  _recordHistory() {
    const eng = this.state.engine;
    if (!eng) return;
    const k = Math.floor(eng.clock / CHECK_INTERVAL);
    const hist = (this.state._chkHist ||= { n: 0, svc: {} });
    while (hist.n < k) {
      hist.n += 1;
      for (const s of this.state.serviceList) (hist.svc[s.id] ||= []).push(this.me.services[s.id] === 'up');
    }
    // Your team's score at each finished round, for the line chart (the lab scene records these too).
    const samples = (this.state.scoreSamples ||= {});
    if (k && samples[k] === undefined) samples[k] = liveTeamScore(this.state);
  }

  refresh() {
    const sec = Math.floor(this.clock());
    const rows = this._rows();
    this.me = rows.find((r) => r.you);
    this._recordHistory();
    if (this.tab === 'overview') this._refreshOverview(rows, sec);
    else if (this.tab === 'scoreboard') this._refreshCharts(rows, sec);
    else if (this.tab === 'services') this._refreshServices(rows, this.me);
  }

  _limit() { return this.state.timeLimitSec || this.state.scenario.clockSeconds || 900; }

  _refreshOverview(rows, sec) {
    const svcs = this.state.serviceList;
    const limit = this._limit();
    const done = Math.min(Math.floor(sec / CHECK_INTERVAL), Math.floor(limit / CHECK_INTERVAL));
    this.ov.round.textContent = `Round ${done}`;
    this.ov.time.textContent = stamp(done * CHECK_INTERVAL);
    this.ov.live.textContent = sec >= limit ? 'Competition over. Final scores.' : `Next round in ${CHECK_INTERVAL - (sec % CHECK_INTERVAL)}s  ·  Competition ends in ${mmss(limit - sec)}`;
    const sig = rows.map((r) => r.no).sort((a, b) => a - b).join(',');
    if (this.built !== sig) this._buildMatrix(rows, svcs, sig);
    const sorted = [...rows].sort((a, b) => {
      const k = this.sort.key;
      if (k === 'team') return this.sort.dir * (a.no - b.no);
      if (k === 'score') return this.sort.dir * (a.score - b.score) || a.no - b.no;
      const v = (r) => (r.services[k] === 'up' ? 1 : 0);
      return this.sort.dir * (v(a) - v(b)) || b.score - a.score;
    });
    for (const r of sorted) {
      const c = this.cells[r.no];
      c.score.textContent = fmt(r.score);
      for (const s of svcs) {
        const td = c.svc[s.id];
        const cls = `sb-cell ${r.services[s.id] === 'up' ? 'sb-up' : 'sb-down'}`;
        if (td.className !== cls) { td.className = cls; td.title = `${r.team} ${s.name}: ${r.services[s.id] === 'up' ? 'UP' : 'DOWN'}`; }
      }
      this.ov.body.append(c.tr);
    }
  }

  _buildMatrix(rows, svcs, sig) {
    this.built = sig;
    clear(this.ov.head); clear(this.ov.body);
    this.cells = {};
    const th = (label, key) => {
      const icon = h('span', { class: 'sb-sorticon' });
      const e = h('th', { class: 'sb-sortable', onclick: () => { this.sort = { key, dir: this.sort.key === key ? -this.sort.dir : -1 }; this.refresh(); } }, label, icon);
      return e;
    };
    this.ov.head.append(th('Team Name', 'team'), th('Current Score', 'score'), ...svcs.map((s) => th(s.name, s.id)));
    for (const r of [...rows].sort((a, b) => a.no - b.no)) {
      const score = h('td', {});
      const svc = {};
      const tr = h('tr', { class: r.you ? 'sb-me' : '' }, h('td', {}, teamName(r)), score);
      for (const s of svcs) { svc[s.id] = h('td', { class: 'sb-cell sb-up' }, `${teamIp(s, r.no)}:${firstPort(s)}`); tr.append(svc[s.id]); }
      this.cells[r.no] = { tr, score, svc };
    }
  }

  // Two SVG charts like the real Chart.js ones: Points per team (bars), then score per round (lines).
  _refreshCharts(rows, sec) {
    const byNo = [...rows].sort((a, b) => a.no - b.no);
    const series = scoreHistory(this.state, sec);
    const rounds = series[0]?.data.length || 0;
    const sig = `${rounds}|${byNo.map((r) => r.score).join(',')}|${this.main.clientWidth}`;
    if (sig === this.sbp.sig) return;
    this.sbp.sig = sig;
    const color = (no) => COLORS[(no - 1) % COLORS.length];
    const W = Math.max(520, Math.min(1140, (this.main.clientWidth || 1000) - 60));

    // Bars
    {
      const H = 330, L = 58, R = 16, T = 34, B = 26;
      const { top, step } = niceAxis(Math.max(...byNo.map((r) => r.score)));
      const g = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'sb-svg', role: 'img', 'aria-label': 'Points per team' });
      g.append(svg('rect', { x: W / 2 - 40, y: 8, width: 40, height: 12, fill: '#ea6a5e' }), svg('text', { x: W / 2 + 6, y: 18, class: 'sb-ax' }, 'Points'));
      const y = (v) => T + (H - T - B) * (1 - v / top);
      for (let v = 0; v <= top; v += step) {
        g.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'sb-grid' }), svg('text', { x: L - 8, y: y(v) + 4, class: 'sb-ax', 'text-anchor': 'end' }, fmt(v)));
      }
      const slot = (W - L - R) / byNo.length;
      byNo.forEach((r, i) => {
        const x = L + i * slot;
        g.append(svg('line', { x1: x, x2: x, y1: T, y2: H - B + 6, class: 'sb-grid' }));
        const bw = slot * 0.72;
        const v = Math.max(0, r.score);
        g.append(svg('rect', { x: x + (slot - bw) / 2, y: y(v), width: bw, height: Math.max(0, y(0) - y(v)), fill: color(r.no), 'data-team': r.no }, svg('title', {}, `${teamName(r)}: ${fmt(r.score)}`)));
        g.append(svg('text', { x: x + slot / 2, y: H - 8, class: `sb-ax${r.you ? ' sb-ax-me' : ''}`, 'text-anchor': 'middle' }, teamName(r)));
      });
      clear(this.sbp.bars); this.sbp.bars.append(g);
    }

    // Lines
    {
      const H = 420, L = 58, R = 16, B = 62;
      const legendRows = Math.ceil(series.length / Math.max(1, Math.floor((W - 40) / 96)));
      const T = 18 + legendRows * 20;
      const max = Math.max(0, ...series.flatMap((s) => s.data));
      const { top, step } = niceAxis(max);
      const g = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'sb-svg', role: 'img', 'aria-label': 'Score per round' });
      // Legend, ordered by current score like the real one
      const per = Math.max(1, Math.floor((W - 40) / 96));
      const order = [...series].sort((a, b) => (b.data[b.data.length - 1] || 0) - (a.data[a.data.length - 1] || 0));
      order.forEach((s, i) => {
        const row = Math.floor(i / per), col = i % per;
        const n = Math.min(per, order.length - row * per);
        const x0 = W / 2 - (n * 96) / 2 + col * 96;
        g.append(svg('rect', { x: x0, y: 6 + row * 20, width: 36, height: 11, fill: 'none', stroke: color(s.no), 'stroke-width': 3 }),
          svg('text', { x: x0 + 42, y: 16 + row * 20, class: `sb-ax${s.you ? ' sb-ax-me' : ''}` }, s.team.replace(' ', '')));
      });
      const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / top);
      const n = rounds + 1; // Round 0 .. Round N
      const x = (i) => L + (n > 1 ? (W - L - R) * (i / (n - 1)) : 0);
      for (let v = 0; v <= top; v += step) g.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'sb-grid' }), svg('text', { x: L - 8, y: y(v) + 4, class: 'sb-ax', 'text-anchor': 'end' }, fmt(v)));
      const every = Math.max(1, Math.ceil(n / 18));
      for (let i = 0; i < n; i++) {
        if (i % every && i !== n - 1) continue;
        g.append(svg('line', { x1: x(i), x2: x(i), y1: T, y2: H - B + 5, class: 'sb-grid' }));
        g.append(svg('text', { x: x(i) + 4, y: H - B + 14, class: 'sb-ax', 'text-anchor': 'end', transform: `rotate(-45 ${x(i) + 4} ${H - B + 14})` }, `Round ${i}`));
      }
      for (const s of series) {
        const pts = [0, ...s.data].map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        g.append(svg('polyline', { points: pts, fill: 'none', stroke: color(s.no), 'stroke-width': s.you ? 3 : 2, 'stroke-linejoin': 'round', 'data-team': s.no }));
      }
      if (!rounds) g.append(svg('text', { x: W / 2, y: H / 2, class: 'sb-ax', 'text-anchor': 'middle' }, 'No rounds scored yet'));
      clear(this.sbp.lines); this.sbp.lines.append(g);
    }
  }

  _refreshServices(rows, me) {
    const svcs = this.state.serviceList;
    const eng = this.state.engine;
    const per = Math.max(1, Math.floor(this._limit() / CHECK_INTERVAL));
    this.sv.team.textContent = teamName(me);
    this.sv.place.textContent = `Place: ${me.rank}`;
    this.sv.score.textContent = `Score: ${fmt(me.score)} points`;
    const hist = this.state._chkHist?.svc || {};
    for (const s of svcs) {
      let e = this.sv.rows[s.id];
      if (!e) {
        e = this.sv.rows[s.id] = { tr: h('tr', {}), status: h('span', { class: 'sb-label' }), earned: h('td', {}), pct: h('td', {}), trend: h('td', { class: 'sb-trend' }) };
        e.tr.append(h('td', {}, h('a', { href: '#', onclick: (ev) => ev.preventDefault() }, s.name)), h('td', {}, s.ip || s.host), h('td', {}, (s.ports || []).join(', ')), h('td', {}, e.status),
          ...(this.full ? [e.earned, h('td', {}, fmt(s.points || 0)), e.pct] : []), e.trend);
        this.sv.body.append(e.tr);
      }
      const up = me.services[s.id] === 'up';
      e.status.className = `sb-label ${up ? 'sb-label-up' : 'sb-label-down'}`;
      e.status.textContent = up ? 'UP' : 'DOWN';
      const c = eng?.checks?.[s.id] || { ok: 0, fail: 0 };
      const earned = Math.round(((s.points || 0) * c.ok) / per);
      e.earned.textContent = fmt(earned);
      e.pct.textContent = s.points ? `${Math.round((earned / s.points) * 100)}%` : '-';
      const last = (hist[s.id] || []).slice(-10);
      const sig = last.join('');
      if (e.trend.dataset.sig !== sig || !e.trend.firstChild) {
        e.trend.dataset.sig = sig;
        clear(e.trend);
        for (const ok of last) e.trend.append(h('span', { class: ok ? 'sb-tick sb-tick-ok' : 'sb-tick sb-tick-bad', title: ok ? 'check passed' : 'check failed' }, ok ? '✔' : '✖'));
        if (!last.length) e.trend.append(h('span', { class: 'sb-muted' }, 'no checks yet'));
      }
    }
  }

  destroy() { this.el.remove(); this.pages = {}; }
}
