// Quotient (the MWCCDC 2026 scoring engine, github.com/dbaseqp/Quotient) as a blue team saw it on Nov 14.
// Layout and behaviour follow Quotient's own templates (static/templates/partials/navbar.html, pages/services.html,
// pages/graphs.html, pages/pcr.html) and the team's screenshots (docs/reference/quotient-*.png):
//   - left sidebar (200px): purple brand block, Announcements / Graphs / Services / Injects / PCRs, user at the bottom;
//   - Services: team select, one card per check: Name, Uptime bar (green >= 80, yellow >= 50, red below), SLAs badge,
//     Last 10 Rounds (newest first; '?' for rounds not run yet). A card opens the round table for that service;
//   - Graphs: Service Status and Uptime Status heatmaps (every team, anonymized as "Team", your row first and in
//     purple), Scores Over Time, Leaderboard;
//   - PCRs: credential list, Update / Usernames / Help, all-or-nothing paste (quotient.submitPcr).
// The round icons and the logo are drawn here, not copied from Quotient's image files.
//   const app = new QuotientApp({ state, onSubmit: (list, text) => result, team: 14 });  host.append(app.el);
import { h, clear } from '../dom.js';
import { quotientLists } from '../../game/quotient.js';
import { teamsAt, scoreHistory } from '../../game/ccdcTeams.js';
import './quotient.css';

const DAY0 = Date.UTC(2026, 10, 14, 13, 0, 0);
const stamp = (sec) => {
  const d = new Date(DAY0 + sec * 1000);
  const hh = d.getUTCHours(); const h12 = ((hh + 11) % 12) + 1;
  return `11/14/2026, ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};
const SELF = '#775DD0';
const OTHERS = ['#008FFB', '#00E396', '#FEB019', '#FF4560'];
const NAV = [['announcements', 'Announcements', 'bi-broadcast'], ['graphs', 'Graphs', 'bi-graph'], ['services', 'Services', 'bi-speed'], ['injects', 'Injects', 'bi-env'], ['pcr', 'PCRs', 'bi-key']];

export class QuotientApp {
  constructor({ state, onSubmit, team = 14 }) {
    this.state = state;
    this.onSubmit = onSubmit;
    this.team = String(team).replace(/^0+/, '');
    this.lists = quotientLists(state.scenario);
    this.list = Object.keys(this.lists)[0];
    this.page = 'services';
    this.tab = 'update';
    this.alert = null;
    this.service = null;
    this.drafts = {};
    this.sigSeen = '';
    this.main = h('main', { class: 'qt-main' });
    this.side = h('nav', { class: 'qt-side' });
    this.el = h('div', { class: 'qt' }, this.side, h('div', { class: 'qt-divider' }), this.main);
    this.render();
  }

  // ---- chrome -----------------------------------------------------------------------------------------------
  renderSide() {
    clear(this.side);
    const on = this.page === 'service' ? 'services' : this.page;
    this.side.append(
      h('div', { class: 'qt-brand' }, h('i', { class: 'qt-logo', 'aria-hidden': 'true' })),
      h('div', { class: 'qt-theme' }, h('i', { class: 'qt-ic bi-sun', 'aria-hidden': 'true' })),
      ...NAV.map(([id, label, ic]) => h('a', { href: '#', class: `qt-nl${on === id ? ' active' : ''}`, 'data-page': id, onclick: (e) => { e.preventDefault(); this.go(id); } },
        h('i', { class: `qt-ic ${ic}`, 'aria-hidden': 'true' }), label)),
      h('div', { class: 'qt-grow' }),
      h('div', { class: 'qt-user' }, h('i', { class: 'qt-userdot', 'aria-hidden': 'true' }), `team${this.team}`, h('span', { class: 'qt-caret' }, '⌃')));
  }

  go(page) { this.saveDraft(); this.page = page; this.render(); }

  sig() { const e = this.state.engine; return JSON.stringify([e?.round, this.page, this.service]); }

  render() {
    this.sigSeen = this.sig();
    this.renderSide();
    clear(this.main);
    this.main.className = `qt-main qt-p-${this.page}`;
    const view = { pcr: () => this.pcrPage(), service: () => this.servicePage(), graphs: () => this.graphsPage(), announcements: () => this.announcementsPage(), injects: () => this.injectsPage() }[this.page] || (() => this.servicesPage());
    this.main.append(...view());
  }

  // ---- Services ---------------------------------------------------------------------------------------------
  servicesPage() {
    const e = this.state.engine;
    const sel = h('select', { class: 'qt-teamsel', 'aria-label': 'Team' }, h('option', {}, `team${this.team}`));
    const cards = this.state.serviceList.map((svc) => {
      const c = e?.checks?.[svc.id] || { ok: 0, fail: 0, violations: 0 };
      const n = c.ok + c.fail;
      const up = n ? Math.round((c.ok / n) * 100) : 0;
      const hist = [...(e?.history?.[svc.id] || [])].reverse().slice(0, 10);
      const icons = [];
      for (let i = 0; i < 10; i++) icons.push(h('i', { class: `qt-r ${hist[i] ? (hist[i].ok ? 'up' : 'down') : 'unk'}`, 'aria-label': hist[i] ? (hist[i].ok ? 'up' : 'down') : 'pending' }));
      return h('button', { type: 'button', class: 'qt-svc', 'data-svc': svc.id, onclick: () => { this.service = svc.id; this.page = 'service'; this.render(); } },
        h('div', { class: 'qt-col' }, h('b', {}, 'Name'), h('span', {}, svc.id)),
        h('div', { class: 'qt-col' }, h('b', {}, 'Uptime'), h('div', { class: 'qt-prog' }, h('div', { class: `qt-bar ${up >= 80 ? 'ok' : up >= 50 ? 'mid' : 'bad'}`, style: { width: `${up}%` } }), h('span', { class: 'qt-prog-t' }, `${up}%`))),
        h('div', { class: 'qt-col qt-col-sla' }, h('b', {}, 'SLAs'), h('span', { class: 'qt-badge' }, String(c.violations || 0))),
        h('div', { class: 'qt-col' }, h('b', {}, 'Last 10 Rounds'), h('div', { class: 'qt-rounds10' }, icons)));
    });
    return [h('div', { class: 'qt-container' }, h('div', { class: 'qt-teamrow' }, sel), cards)];
  }

  servicePage() {
    const hist = [...(this.state.engine?.history?.[this.service] || [])].reverse();
    return [h('div', { class: 'qt-container' },
      h('h2', { class: 'qt-title' }, h('a', { href: '#', class: 'qt-back', 'aria-label': 'Back', onclick: (e) => { e.preventDefault(); this.page = 'services'; this.render(); } }, '←'), `Service: ${this.service}`),
      h('table', { class: 'qt-table qt-rounds' }, h('thead', {}, h('tr', {}, ['Round', 'Time', 'Result', 'Debug', 'Error'].map((c) => h('th', {}, c)))),
        h('tbody', {}, hist.length ? hist.map((r) => h('tr', {}, h('td', {}, String(r.round)), h('td', {}, stamp(r.at)), h('td', {}, String(r.ok)), h('td', {}, ''), h('td', {}, ''))) : h('tr', {}, h('td', { colspan: 5, class: 'qt-muted' }, 'No rounds yet.')))))];
  }

  // ---- Graphs (every team; anonymized for a blue team) ------------------------------------------------------
  graphsPage() {
    const sec = this.state.engine?.clock || 0;
    const teams = teamsAt(this.state, sec);
    const rows = [...teams.filter((t) => t.you), ...teams.filter((t) => !t.you).sort((a, b) => ((a.no * 7919) % 13) - ((b.no * 7919) % 13))];
    const svcs = this.state.serviceList.map((x) => x.id);
    const started = (this.state.engine?.round || 0) > 0;
    const status = h('div', { class: 'qt-card' }, this.heatmap('Service Status', rows, svcs, (t, id) => (!started ? { c: '#777777' } : { c: t.services[id] === 'up' ? '#3D9970' : '#AA0707' })), this.cardBody('Service Status'));
    const shade = (v) => (v < 0 ? '#777777' : v < 50 ? '#AA0707' : v < 80 ? '#FFB200' : '#3D9970');
    const uptime = h('div', { class: 'qt-card' }, this.heatmap('Uptime Status', rows, svcs, (t, id) => { const v = t.svcUptime?.[id] ?? -1; return { c: shade(v), label: v < 0 ? 'N/A' : `${v}%`, op: v < 0 ? 1 : 0.55 + 0.45 * (v % 50) / 50 }; }), this.cardBody('Uptime Status'));
    const series = scoreHistory(this.state, sec);
    const scores = h('div', { class: 'qt-card' }, this.lineChart('Scores Over Time', series), this.cardBody('Scores Over Time'));
    const board = [...teams].sort((a, b) => b.score - a.score);
    const leader = h('div', { class: 'qt-card' }, this.barChart('Leaderboard', board), this.cardBody('Leaderboard'));
    return [h('div', { class: 'qt-container qt-graphs' }, h('p', {}, 'Last updated graphs at: ', h('span', {}, stamp(sec).split(', ')[1])), status, uptime, scores, leader)];
  }

  cardBody(label) {
    return h('div', { class: 'qt-card-body' }, h('p', {}, label), h('button', { type: 'button', class: 'qt-btn' }, 'Fullscreen'));
  }

  heatmap(title, rows, cols, cell) {
    const L = 64; const T = 34; const cw = 34; const ch = 26; const B = 96;
    const W = L + cols.length * cw + 10; const H = T + rows.length * ch + B;
    const g = s('svg', { class: 'qt-chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': title });
    g.append(s('text', { x: 10, y: 20, class: 'qt-ct' }, title));
    rows.forEach((t, r) => {
      g.append(s('text', { x: L - 8, y: T + r * ch + ch / 2 + 4, 'text-anchor': 'end', class: `qt-yl${t.you ? ' self' : ''}`, 'data-self': t.you ? '1' : null }, 'Team'));
      cols.forEach((id, c) => {
        const v = cell(t, id);
        g.append(s('rect', { x: L + c * cw, y: T + r * ch, width: cw, height: ch, fill: v.c, 'fill-opacity': v.op ?? 1, stroke: '#fff', 'stroke-width': 1, 'data-team': t.you ? 'self' : 'other', 'data-svc': id }));
        if (v.label) g.append(s('text', { x: L + c * cw + cw / 2, y: T + r * ch + ch / 2 + 3, 'text-anchor': 'middle', class: 'qt-cl' }, v.label));
      });
    });
    cols.forEach((id, c) => {
      const x = L + c * cw + cw / 2; const y = T + rows.length * ch + 8;
      g.append(s('text', { x, y, transform: `rotate(-55 ${x} ${y})`, 'text-anchor': 'end', class: 'qt-xl' }, id));
    });
    return h('div', { class: 'qt-chartwrap' }, g);
  }

  lineChart(title, series) {
    const W = 900; const H = 320; const L = 54; const T = 34; const R = 16; const B = 34;
    const n = Math.max(1, ...series.map((x) => x.data.length));
    const vals = series.flatMap((x) => x.data);
    const lo = Math.min(0, ...vals); const hi = Math.max(10, ...vals);
    const X = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
    const Y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    const g = s('svg', { class: 'qt-chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': title });
    g.append(s('text', { x: 10, y: 20, class: 'qt-ct' }, title));
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4; g.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'qt-grid' }), s('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'qt-yl' }, Math.round(v))); }
    const step = Math.max(1, Math.ceil(n / 12));
    for (let i = 0; i < n; i += step) g.append(s('text', { x: X(i), y: H - B + 16, 'text-anchor': 'middle', class: 'qt-yl' }, i + 1));
    const ordered = [...series.filter((x) => !x.you), ...series.filter((x) => x.you)];
    let oi = 0;
    for (const x of ordered) {
      if (!x.data.length) continue;
      const col = x.you ? SELF : OTHERS[oi++ % OTHERS.length];
      g.append(s('polyline', { points: x.data.map((v, i) => `${X(i)},${Y(v)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': x.you ? 5 : 2, 'data-self': x.you ? '1' : null }));
    }
    if (n <= 1 && !vals.length) g.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'qt-yl' }, 'No data yet'));
    return h('div', { class: 'qt-chartwrap' }, g);
  }

  barChart(title, board) {
    const W = 900; const L = 64; const T = 34; const bh = 22; const gap = 6; const R = 50;
    const H = T + board.length * (bh + gap) + 24;
    const hi = Math.max(10, ...board.map((t) => t.score));
    const lo = Math.min(0, ...board.map((t) => t.score));
    const X = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
    const g = s('svg', { class: 'qt-chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': title });
    g.append(s('text', { x: 10, y: 20, class: 'qt-ct' }, title));
    board.forEach((t, i) => {
      const y = T + i * (bh + gap);
      g.append(s('text', { x: L - 8, y: y + bh / 2 + 4, 'text-anchor': 'end', class: `qt-yl${t.you ? ' self' : ''}`, 'data-self': t.you ? '1' : null }, 'Team'),
        s('rect', { x: Math.min(X(0), X(t.score)), y, width: Math.abs(X(t.score) - X(0)), height: bh, fill: t.you ? SELF : OTHERS[0], 'data-rank': i + 1, 'data-self': t.you ? '1' : null }),
        s('text', { x: Math.max(X(0), X(t.score)) - 6, y: y + bh / 2 + 4, 'text-anchor': 'end', class: 'qt-bl' }, t.score));
    });
    return h('div', { class: 'qt-chartwrap' }, g);
  }

  // ---- Announcements / Injects (on Nov 14 injects came through NISE, not Quotient) --------------------------
  announcementsPage() {
    return [h('div', { class: 'qt-container' }, h('div', { class: 'qt-card qt-pad' }, h('b', {}, 'Welcome to the MWCCDC Invitational'),
      h('p', { class: 'qt-muted' }, 'Scoring is live. Injects are delivered through the NISE portal. Password changes for scored accounts must be submitted on the PCRs page before you change them.')))];
  }

  injectsPage() {
    return [h('div', { class: 'qt-container' }, h('div', { class: 'qt-card qt-pad' }, h('p', { class: 'qt-muted' }, 'No injects in Quotient for this event. Injects are delivered through the NISE inject portal.')))];
  }

  // ---- PCRs -------------------------------------------------------------------------------------------------
  pcrPage() {
    const out = [];
    if (this.alert) {
      out.push(h('div', { class: `qt-alert qt-alert-${this.alert.kind}`, role: 'alert' },
        h('i', { class: 'qt-alert-ic', 'aria-hidden': 'true' }, this.alert.kind === 'ok' ? '✓' : '!'), h('span', {}, this.alert.text),
        h('button', { type: 'button', class: 'qt-x', 'aria-label': 'Dismiss', onclick: () => { this.alert = null; this.render(); } }, '✕')));
    }
    const sel = h('select', { class: 'qt-select', 'data-f': 'list', onchange: (e) => { this.saveDraft(); this.list = e.target.value; this.render(); } },
      Object.keys(this.lists).map((n) => h('option', { value: n, selected: n === this.list }, n)));
    out.push(h('section', { class: 'qt-card qt-pad' }, h('h3', { class: 'qt-h' }, h('i', { class: 'qt-list-ic', 'aria-hidden': 'true' }, '☰'), 'Credential List'), sel, h('p', { class: 'qt-muted' }, 'Choose which service credentials to update.')));
    const tabs = [['update', 'Update'], ['usernames', 'Usernames'], ['help', 'Help']];
    const head = h('div', { class: 'qt-tabs' }, tabs.map(([id, label]) => h('a', { href: '#', class: `qt-tab${this.tab === id ? ' on' : ''}`, 'data-tab': id, onclick: (e) => { e.preventDefault(); this.saveDraft(); this.tab = id; this.render(); } }, label)));
    out.push(h('section', { class: 'qt-card qt-tabcard' }, head, h('div', { class: 'qt-tabbody' }, this[`${this.tab}Tab`]())));
    return [h('div', { class: 'qt-container qt-narrow' }, out)];
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

  refresh() { if (this.sig() !== this.sigSeen && this.page !== 'pcr') this.render(); }
  destroy() {}
}
