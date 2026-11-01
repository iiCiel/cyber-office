// The CCDC scoring-engine website (scoringengine/scoringengine look: dark Bootstrap navbar, light page, stat
// cards, a teams x services matrix, a trending column). Fills its parent. See docs/reference-ui/scoreboard.md.
//
//   const sb = new ScoreboardApp({ state, clock: () => seconds, injects: injectsApp /* optional */ });
//   host.append(sb.el); sb.show('overview'); setInterval(() => sb.refresh(), 1000);
import { h, clear } from '../dom.js';
import { standings } from '../../game/ccdcTeams.js';
import { CHECK_INTERVAL } from '../../game/ccdcEngine.js';
import './scoreboard.css';

const TABS = [['overview', 'Overview'], ['scoreboard', 'Scoreboard'], ['services', 'Services'], ['injects', 'Injects']];
const MEDAL = { 1: '#C98910', 2: '#A8A8A8', 3: '#965A38' };
const fmt = (n) => Number(n).toLocaleString('en-US');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function portsText(s) { return (s.ports || []).join(', ') || '-'; }

export class ScoreboardApp {
  constructor({ state, clock, injects = null, teamLabel = null }) {
    this.state = state;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.injectsApp = injects;
    this.tab = 'overview';
    this.built = null; // signature of the rows currently built
    this.navLinks = {};
    this.pages = {};
    const rows = this._rows();
    this.me = rows.find((r) => r.you);
    this.teamLabel = teamLabel || this.me.team.toLowerCase().replace(' ', '');
    this.el = h('div', { class: 'sb' });
    this._build();
    this.show('overview');
    this.refresh();
  }

  _rows() { return standings(this.state, Math.floor(this.clock())); }

  _build() {
    const nav = h('nav', { class: 'sb-nav' },
      h('a', { class: 'sb-brand', href: '#', onclick: (e) => { e.preventDefault(); this.show('overview'); } }, h('span', { class: 'sb-brand-icon' }, 'SE'), 'Scoring Engine'),
      h('ul', { class: 'sb-navlist' }, TABS.map(([id, label]) => {
        const a = h('a', { href: '#', class: 'sb-navlink', onclick: (e) => { e.preventDefault(); this.show(id); } }, label);
        this.navLinks[id] = a;
        return h('li', {}, a);
      })),
      h('div', { class: 'sb-navright' }, h('span', { class: 'sb-user' }, this.teamLabel), h('a', { href: '#', class: 'sb-navlink', onclick: (e) => e.preventDefault() }, 'Logout')),
    );
    this.main = h('div', { class: 'sb-main' });
    this.foot = h('div', { class: 'sb-foot' }, 'Scoring Engine - simulated competition, all data is fictional.');
    this.el.append(nav, this.main, this.foot);

    // --- overview
    this.ov = {
      round: h('div', { class: 'sb-statval' }), roundSub: h('div', { class: 'sb-statsub' }),
      up: h('div', { class: 'sb-statval sb-ok' }), down: h('div', { class: 'sb-statval sb-bad' }),
      leader: h('div', { class: 'sb-statval sb-leader' }), leaderSub: h('div', { class: 'sb-statsub' }),
      live: h('span', { class: 'sb-live' }), ends: h('span', { class: 'sb-ends' }),
      head: h('tr', {}), body: h('tbody', {}),
    };
    const card = (label, a, b) => h('div', { class: 'sb-stat' }, h('div', { class: 'sb-statlabel' }, label), a, b);
    this.pages.overview = h('div', { class: 'sb-page' },
      h('div', { class: 'sb-titlebar' }, h('h1', {}, 'Overview'), h('div', { class: 'sb-titleright' }, this.ov.ends, this.ov.live)),
      h('div', { class: 'sb-stats' },
        card('Round', this.ov.round, this.ov.roundSub),
        card('Services Up', this.ov.up, h('div', { class: 'sb-statsub' }, 'this round, all teams')),
        card('Services Down', this.ov.down, h('div', { class: 'sb-statsub' }, 'this round, all teams')),
        card('Leader', this.ov.leader, this.ov.leaderSub)),
      h('div', { class: 'sb-card sb-scroll' }, h('table', { class: 'sb-table sb-matrix' }, h('thead', {}, this.ov.head), this.ov.body)));

    // --- scoreboard
    this.sbp = { body: h('tbody', {}), rows: {} };
    this.pages.scoreboard = h('div', { class: 'sb-page' },
      h('div', { class: 'sb-titlebar' }, h('h1', {}, 'Scoreboard')),
      h('div', { class: 'sb-card sb-scroll' }, h('table', { class: 'sb-table sb-board' },
        h('thead', {}, h('tr', {}, h('th', { class: 'sb-c-rank' }, 'Place'), h('th', {}, 'Team'), h('th', { class: 'sb-r' }, 'Score'), h('th', { class: 'sb-c-chg sb-r' }, 'Last check'), h('th', { class: 'sb-r' }, 'Uptime'), h('th', { class: 'sb-r' }, 'SLA'), h('th', { class: 'sb-c-bar' }, 'Points'))),
        this.sbp.body)));

    // --- services (your team)
    this.sv = { stats: {}, body: h('tbody', {}), rows: {} };
    const sstat = (k, label) => { this.sv.stats[k] = h('div', { class: 'sb-statval' }); return h('div', { class: 'sb-stat' }, h('div', { class: 'sb-statlabel' }, label), this.sv.stats[k]); };
    this.pages.services = h('div', { class: 'sb-page' },
      h('div', { class: 'sb-titlebar' }, h('h1', {}, 'Services')),
      h('div', { class: 'sb-stats sb-stats6' }, sstat('team', 'Team'), sstat('place', 'Place'), sstat('score', 'Score'), sstat('up', 'Services Up'), sstat('down', 'Services Down'), sstat('uptime', 'Uptime')),
      h('div', { class: 'sb-card sb-scroll' }, h('table', { class: 'sb-table sb-svc' },
        h('thead', {}, h('tr', {}, ['Service', 'Host', 'Port', 'Status', 'Teams Up', 'Score Earned', 'Max Score', '% Earned', 'Pts Per Check', 'Trending'].map((t, i) => h('th', { class: i >= 4 && i <= 8 ? 'sb-r' : '' }, t)))),
        this.sv.body)));

    // --- injects (embedded portal)
    this.pages.injects = h('div', { class: 'sb-page sb-page-injects' });
  }

  show(tab) {
    if (!this.pages[tab]) tab = 'overview';
    this.tab = tab;
    for (const [id, a] of Object.entries(this.navLinks)) a.classList.toggle('active', id === tab);
    clear(this.main);
    this.main.append(this.pages[tab]);
    if (tab === 'injects') {
      clear(this.pages.injects);
      if (this.injectsApp) this.pages.injects.append(this.injectsApp.el);
      else this.pages.injects.append(h('div', { class: 'sb-card sb-pad' }, 'The inject portal is not attached.'));
    }
    this.refresh();
  }

  _recordHistory() {
    const eng = this.state.engine;
    if (!eng) return;
    const hist = (this.state._chkHist ||= { n: 0, svc: {} });
    const k = Math.floor(eng.clock / CHECK_INTERVAL);
    while (hist.n < k) {
      hist.n += 1;
      for (const s of this.state.serviceList) (hist.svc[s.id] ||= []).push(this.me.services[s.id] === 'up');
    }
  }

  refresh() {
    const sec = Math.floor(this.clock());
    const rows = this._rows();
    const me = rows.find((r) => r.you);
    this.me = me;
    this._recordHistory();
    const svcs = this.state.serviceList;
    const sig = rows.map((r) => r.no).sort((a, b) => a - b).join(',');
    const byNo = [...rows].sort((a, b) => a.no - b.no);
    const limit = this.state.timeLimitSec || this.state.scenario.clockSeconds || 900;
    const round = Math.floor(sec / CHECK_INTERVAL) + 1;

    if (this.tab === 'overview') {
      if (this.built !== sig) this._buildMatrix(byNo, svcs, sig);
      this.ov.round.textContent = String(round);
      this.ov.roundSub.textContent = `Check ${Math.min(round, limit / CHECK_INTERVAL)} of ${Math.floor(limit / CHECK_INTERVAL)}`;
      let up = 0, down = 0;
      for (const r of rows) for (const s of svcs) (r.services[s.id] === 'up' ? up++ : down++);
      this.ov.up.textContent = String(up);
      this.ov.down.textContent = String(down);
      this.ov.down.classList.toggle('sb-muted', down === 0);
      this.ov.leader.textContent = rows[0].team + (rows[0].you ? ' (you)' : '');
      this.ov.leaderSub.textContent = `${fmt(rows[0].score)} pts`;
      this.ov.live.textContent = sec >= limit ? `Final - Round ${round - 1}` : `Live - Round ${round}`;
      this.ov.live.classList.toggle('sb-final', sec >= limit);
      this.ov.ends.textContent = sec >= limit ? 'Competition over' : `Round ends in ${CHECK_INTERVAL - (sec % CHECK_INTERVAL)}s  |  Event ends in ${mmss(limit - sec)}`;
      for (const r of byNo) {
        const c = this.cells[r.no];
        c.score.textContent = fmt(r.score);
        c.place.textContent = String(r.rank);
        c.place.style.color = MEDAL[r.rank] || '';
        c.place.classList.toggle('sb-medal', !!MEDAL[r.rank]);
        const d = svcs.filter((s) => r.services[s.id] !== 'up').length;
        c.up.textContent = `${svcs.length - d} ↑`;
        c.down.textContent = d ? `${d} ↓` : '0';
        c.down.className = d ? 'sb-bad' : 'sb-muted';
        c.sla.textContent = r.sla ? `-${r.sla * (this.state.scenario.slaPenalty || 0)}` : '0';
        c.sla.className = r.sla ? 'sb-bad' : '';
        for (const s of svcs) {
          const dot = c.svc[s.id];
          const st = r.services[s.id];
          const cls = `sb-dot sb-dot-${st}`;
          if (dot.className !== cls) { dot.className = cls; dot.textContent = st === 'up' ? '✓' : '✕'; dot.title = `${r.team} ${s.name}: ${st.toUpperCase()}`; }
        }
      }
    } else if (this.tab === 'scoreboard') {
      this._refreshBoard(rows);
    } else if (this.tab === 'services') {
      this._refreshServices(rows, me);
    }
  }

  _buildMatrix(byNo, svcs, sig) {
    this.built = sig;
    clear(this.ov.head); clear(this.ov.body);
    this.cells = {};
    this.ov.head.append(h('th', {}, ''));
    for (const r of byNo) this.ov.head.append(h('th', { class: r.you ? 'sb-me' : '', title: r.team }, r.team + (r.you ? ' (you)' : '')));
    const meta = (label, key) => {
      const tr = h('tr', { class: 'sb-meta' }, h('th', { scope: 'row' }, label));
      for (const r of byNo) {
        const td = h('td', { class: r.you ? 'sb-me' : '' });
        const span = h('span', {});
        td.append(span);
        (this.cells[r.no] ||= { svc: {} })[key] = span;
        tr.append(td);
      }
      this.ov.body.append(tr);
    };
    meta('Current Score', 'score'); meta('Current Place', 'place'); meta('Services Up', 'up'); meta('Services Down', 'down'); meta('SLA Penalties', 'sla');
    for (const s of svcs) {
      const tr = h('tr', {}, h('th', { scope: 'row' }, s.name));
      for (const r of byNo) {
        const dot = h('span', { class: 'sb-dot sb-dot-up' }, '✓');
        this.cells[r.no].svc[s.id] = dot;
        tr.append(h('td', { class: r.you ? 'sb-me sb-svccell' : 'sb-svccell' }, dot));
      }
      this.ov.body.append(tr);
    }
  }

  _refreshBoard(rows) {
    const best = Math.max(1, ...rows.map((r) => r.score));
    for (const r of rows) {
      let e = this.sbp.rows[r.no];
      if (!e) {
        e = this.sbp.rows[r.no] = {
          tr: h('tr', { class: r.you ? 'sb-me-row' : '' }), rank: h('td', { class: 'sb-c-rank' }), team: h('td', {}, r.team + (r.you ? ' (you)' : '')),
          score: h('td', { class: 'sb-r' }), chg: h('td', { class: 'sb-r' }), up: h('td', { class: 'sb-r' }), sla: h('td', { class: 'sb-r' }),
          bar: h('div', { class: 'sb-bar' }),
        };
        e.tr.append(e.rank, e.team, e.score, e.chg, e.up, e.sla, h('td', { class: 'sb-c-bar' }, h('div', { class: 'sb-bartrack' }, e.bar)));
      }
      e.rank.textContent = String(r.rank);
      e.rank.style.color = MEDAL[r.rank] || '';
      e.score.textContent = fmt(r.score);
      e.chg.textContent = r.delta ? `${r.delta > 0 ? '+' : ''}${r.delta}` : '0';
      e.chg.className = `sb-r ${r.delta > 0 ? 'sb-ok' : r.delta < 0 ? 'sb-bad' : 'sb-muted'}`;
      e.up.textContent = `${r.uptimePct}%`;
      e.sla.textContent = String(r.sla);
      e.bar.style.width = `${Math.max(0, Math.round((r.score / best) * 100))}%`;
      e.bar.className = `sb-bar${r.you ? ' sb-bar-me' : ''}`;
      this.sbp.body.append(e.tr); // re-append keeps sorted order
    }
  }

  _refreshServices(rows, me) {
    const svcs = this.state.serviceList;
    const eng = this.state.engine;
    const per = Math.max(1, Math.floor((this.state.timeLimitSec || this.state.scenario.clockSeconds || 900) / CHECK_INTERVAL));
    const down = svcs.filter((s) => me.services[s.id] !== 'up').length;
    const st = this.sv.stats;
    st.team.textContent = me.team;
    st.place.textContent = String(me.rank);
    st.score.textContent = fmt(me.score);
    st.up.textContent = String(svcs.length - down);
    st.up.className = 'sb-statval sb-ok';
    st.down.textContent = String(down);
    st.down.className = `sb-statval ${down ? 'sb-bad' : 'sb-muted'}`;
    st.uptime.textContent = `${me.uptimePct}.0%`.replace('.0.0', '.0');
    const hist = this.state._chkHist?.svc || {};
    for (const s of svcs) {
      let e = this.sv.rows[s.id];
      if (!e) {
        e = this.sv.rows[s.id] = { tr: h('tr', {}), status: h('span', { class: 'sb-badge' }), rank: h('td', { class: 'sb-r' }), earned: h('td', { class: 'sb-r' }), pct: h('td', { class: 'sb-r' }), trend: h('td', { class: 'sb-trend' }) };
        e.tr.append(h('td', {}, h('a', { href: '#', onclick: (ev) => ev.preventDefault() }, s.name)), h('td', {}, `${s.host} (${s.ip})`), h('td', {}, portsText(s)), h('td', {}, e.status), e.rank, e.earned, h('td', { class: 'sb-r' }, fmt(s.points || 0)), e.pct, h('td', { class: 'sb-r' }, (Math.round(((s.points || 0) / per) * 100) / 100).toString()), e.trend);
        this.sv.body.append(e.tr);
      }
      const up = me.services[s.id] === 'up';
      e.status.className = `sb-badge ${up ? 'sb-badge-up' : 'sb-badge-down'}`;
      e.status.textContent = up ? 'UP' : 'DOWN';
      const c = eng?.checks?.[s.id] || { ok: 0, fail: 0 };
      const earned = Math.round(((s.points || 0) * c.ok) / per);
      e.earned.textContent = fmt(earned);
      e.pct.textContent = s.points ? `${(Math.round((earned / s.points) * 1000) / 10).toFixed(1)}%` : '-';
      e.rank.textContent = `${rows.filter((r) => r.services[s.id] === 'up').length} of ${rows.length}`;
      const last = (hist[s.id] || []).slice(-10);
      const sig = last.join('') + (up ? 'U' : 'D');
      if (e.trend.dataset.sig !== sig) {
        e.trend.dataset.sig = sig;
        clear(e.trend);
        for (const ok of last) e.trend.append(h('span', { class: ok ? 'sb-tick sb-ok' : 'sb-tick sb-bad' }, ok ? '✓' : '✕'));
        if (!last.length) e.trend.append(h('span', { class: 'sb-muted' }, 'no checks yet'));
      }
    }
  }

  destroy() { this.el.remove(); this.pages = {}; }
}
