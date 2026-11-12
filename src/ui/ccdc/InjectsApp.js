// The NISE team portal's main page, as Midwest teams see it (docs/reference/nise-injects-2026.png): blue nav, Recent
// Announcements, then the Injects table. Below it, the memo view with a deliverable box. Drafts live in a map so
// refresh() never disturbs typing.
//
//   const ij = new InjectsApp({ state, clock, guided, team, onNav, onSubmit: (id, text) => ({ ok, error?, late?, grade? }) })
import { h, clear } from '../dom.js';
import { clockAt, dayOf } from '../../game/ccdcRound.js';
import './injects.css';

const stripTitle = (t) => String(t).replace(/^Inject\s+\d+\s*[—–-]\s*/i, '');
const remaining = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `0d ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
};

export class InjectsApp {
  clockOf(sec) { return clockAt(this.state.scenario, sec * this.state.timeScale); }
  // Portal timestamps look like the real ones: 10/31 9:09.
  stamp(sec) { return `${dayOf(this.state.scenario).date} ${this.clockOf(sec).replace(/^0/, '')}`; }

  constructor({ state, onSubmit, guided = false, clock, team = '', onNav = null }) {
    this.state = state;
    this.team = team;
    this.onNav = onNav;
    this.onSubmit = onSubmit;
    this.guided = !!guided;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.drafts = {};
    this.seen = new Set();
    this.selected = null;
    this.rows = {}; // id -> { tr, status, left, score }
    this.results = {}; // id -> last submit result
    this.detailKey = null;
    this.el = h('div', { class: 'ij nise' });
    const nav = (label, go) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(); } }, label);
    this.annBody = h('tbody', {});
    this.annCount = -1;
    this.annPanel = h('section', { class: 'ni-panel' }, h('h2', {}, 'Recent Announcements'), h('div', { class: 'ni-body' },
      h('table', { class: 'ni-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', { class: 'ni-pub' }, 'Published'))), this.annBody)));
    this.tbody = h('tbody', {});
    this.table = h('table', { class: 'ni-table ij-table' },
      h('thead', {}, h('tr', {}, ['Title', 'Start', 'Due', 'Reject', 'Points', 'Submitted', 'Remaining'].map((t, i) => h('th', { class: `ni-c${i}` }, t)))), this.tbody);
    this.empty = h('div', { class: 'ij-empty' }, 'No injects have been released yet.');
    this.injPanel = h('section', { class: 'ni-panel' }, h('h2', {}, 'Injects'), h('div', { class: 'ni-body ni-scroll' }, this.table, this.empty));
    this.detail = h('div', { class: 'ij-detail ni-detail' });
    this.page = h('div', { class: 'ni-page' }, this.annPanel, this.injPanel, this.detail);
    this.el.append(h('nav', { class: 'ni-nav' },
      nav('SCOREBOARD', () => this.onNav?.('services')), nav('INJECTS', () => this.injPanel.scrollIntoView()),
      nav('ANNOUNCEMENTS', () => this.annPanel.scrollIntoView()), nav('SERVICES', () => this.onNav?.('services')),
      h('span', { class: 'ni-user' }, `TEAM${this.team}: LOGOUT`)), this.page);
    this.refresh();
  }

  _timer(id) { return this.state.engine?.injectTimers?.[id] || { released: true, releaseAt: 0, dueAt: 9999, overdue: false }; }
  _released() { return this.state.injectList.filter((i) => this._timer(i.id).released); }
  _num(i) { return this.state.injectList.indexOf(i) + 1; }

  _status(i) {
    const rec = this.state.injects[i.id];
    const t = this._timer(i.id);
    if (rec.done) return rec.late ? 'Late' : 'Submitted';
    if (t.overdue || this.clock() > t.dueAt) return 'Missed';
    return 'Open';
  }

  /** Released, unopened, unanswered injects (taskbar badge). */
  unreadCount() {
    return this._released().filter((i) => !this.seen.has(i.id) && !this.state.injects[i.id].done).length;
  }

  select(id) {
    this.selected = id;
    this.seen.add(id);
    this.detailKey = null;
    this.refresh();
    for (const [k, r] of Object.entries(this.rows)) r.tr.classList.toggle('ij-sel', k === id);
  }

  refresh() {
    const sec = this.clock();
    const rel = this._released();
    for (const i of rel) {
      let r = this.rows[i.id];
      if (!r) {
        r = this.rows[i.id] = {
          tr: h('tr', { class: 'ij-row', tabindex: '0', onclick: () => this.select(i.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.select(i.id); } } }),
          left: h('td', { class: 'ni-c6' }), sub: h('td', { class: 'ni-c5' }), score: h('td', { class: 'ni-c4' }),
          title: h('td', { class: 'ni-c0' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.select(i.id); } }, stripTitle(i.title))),
        };
        const t0 = this._timer(i.id);
        const due = Number.isFinite(t0.dueAt) ? this.stamp(t0.dueAt) : '';
        r.tr.append(r.title, h('td', { class: 'ni-c1' }, this.stamp(t0.releaseAt)), h('td', { class: 'ni-c2' }, due), h('td', { class: 'ni-c3' }, due), r.score, r.sub, r.left);
        this.tbody.append(r.tr);
      }
      const st = this._status(i);
      const rec = this.state.injects[i.id];
      const t = this._timer(i.id);
      r.score.textContent = rec.done && this.guided && rec.grade ? `${rec.grade.pts} / ${i.points}` : String(i.points);
      if (rec.done && !r.sub.textContent) r.sub.textContent = this.stamp(this.clock());
      r.left.textContent = st === 'Missed' ? 'Closed' : rec.done || !Number.isFinite(t.dueAt) ? '' : remaining(t.dueAt - sec);
      r.left.className = `ni-c6${!rec.done && t.dueAt - sec < 60 ? ' ij-urgent' : ''}`;
      r.tr.classList.toggle('ij-unread', !this.seen.has(i.id) && !rec.done);
    }
    this.empty.style.display = rel.length ? 'none' : '';
    this.table.style.display = rel.length ? '' : 'none';
    this._drawAnnouncements(sec);
    // Detail: rebuild only when selection or status class changes, never while the textarea is focused.
    if (this.selected) {
      const i = this.state.injectList.find((x) => x.id === this.selected);
      const key = `${i.id}|${this._status(i)}|${this.results[i.id] ? 'r' : ''}`;
      if (key !== this.detailKey) {
        const ta = this.detail.querySelector('textarea');
        if (!(ta && document.activeElement === ta && this.detailKey && this.detailKey.startsWith(i.id + '|') && !this.state.injects[i.id].done)) {
          this.detailKey = key;
          this._buildDetail(i);
        } else this.detailKey = key;
      } else this._updateDetailLive(i);
    } else if (!this.detail.firstChild) {
      this.detail.append(h('div', { class: 'ij-hint' }, 'Select an inject above to read it and submit your deliverable.'));
    }
  }

  // White Team notices, newest first. The real portal is where the drop flag is called.
  _drawAnnouncements(sec) {
    const limit = this.state.scenario.clockSeconds || 900;
    const all = [[0, 'Drop flag issued. The competition has started.'], [limit * (3 / 7), 'Lunch is available in the competition rooms.'], [limit * (6.5 / 7), 'Thirty minutes remaining. Check your open injects.']];
    const live = all.filter(([at]) => sec >= at).reverse();
    if (live.length === this.annCount) return;
    this.annCount = live.length;
    clear(this.annBody);
    for (const [at, title] of live) this.annBody.append(h('tr', {}, h('td', {}, h('a', { href: '#', onclick: (e) => e.preventDefault() }, title)), h('td', { class: 'ni-pub' }, this.stamp(at))));
  }

  _updateDetailLive(i) {
    const d = this.detail.querySelector('.ij-due-live');
    if (d) d.textContent = Number.isFinite(this._timer(i.id).dueAt) ? remaining(this._timer(i.id).dueAt - this.clock()) : '';
  }

  _buildDetail(i) {
    const rec = this.state.injects[i.id];
    const t = this._timer(i.id);
    const st = this._status(i);
    clear(this.detail);
    this.detail.append(h('div', { class: 'ij-memo' },
      h('div', { class: 'ij-memohead' }, `INJECT ${this._num(i)}`, h('span', { class: `ij-badge ij-b-${st.toLowerCase()}` }, st)),
      h('table', { class: 'ij-hdr' }, h('tbody', {},
        h('tr', {}, h('th', {}, 'From:'), h('td', {}, i.from)),
        h('tr', {}, h('th', {}, 'To:'), h('td', {}, 'Blue Team (all seats)')),
        h('tr', {}, h('th', {}, 'Date:'), h('td', {}, `Competition day, ${this.clockOf(t.releaseAt)}`)),
        h('tr', {}, h('th', {}, 'Due:'), h('td', {}, `${Number.isFinite(t.dueAt) ? this.clockOf(t.dueAt) : 'no deadline'}  `, rec.done || !Number.isFinite(t.dueAt) ? '' : h('span', { class: 'ij-due-live ij-urgent-soft' }, remaining(t.dueAt - this.clock())))),
        h('tr', {}, h('th', {}, 'Subject:'), h('td', { class: 'ij-subj' }, stripTitle(i.title))),
        h('tr', {}, h('th', {}, 'Worth:'), h('td', {}, `${i.points} points`)))),
      h('div', { class: 'ij-body' }, i.prompt),
    ));
    if (rec.done) {
      const res = this.results[i.id] || {};
      const box = h('div', { class: 'ij-result' }, h('div', { class: 'ij-resulthead' }, rec.late ? 'Submitted late. Late deliverables score 0.' : 'Submitted. Awaiting white team review.'));
      box.append(h('pre', { class: 'ij-answer' }, rec.answer || ''));
      const g = res.grade || rec.grade;
      if (this.guided && g) {
        box.append(h('div', { class: 'ij-rubric' },
          h('div', { class: 'ij-rubhead' }, `Judge's rubric: ${g.earned ?? g.pts} / ${i.points}${g.late ? ' (scored 0: late)' : ''}`),
          h('ul', {}, g.hits.map((x) => h('li', { class: 'ij-hit' }, x)), g.missing.map((x) => h('li', { class: 'ij-miss' }, x))),
          h('div', { class: 'ij-rubhead' }, 'Model answer'), h('div', { class: 'ij-model' }, i.model || '')));
      }
      this.detail.append(box);
      return;
    }
    const ta = h('textarea', {
      class: 'ij-ta', rows: '8', placeholder: 'Type your deliverable here (a short memo: what, who, when, how).', 'aria-label': 'Deliverable',
      oninput: () => { this.drafts[i.id] = ta.value; },
    });
    ta.value = this.drafts[i.id] || '';
    const err = h('div', { class: 'ij-err' });
    const btn = h('button', {
      class: 'ij-btn', type: 'button', onclick: () => {
        this.drafts[i.id] = ta.value;
        const r = this.onSubmit(i.id, ta.value);
        if (!r || !r.ok) { err.textContent = (r && r.error) || 'Submit failed.'; return; }
        this.results[i.id] = r;
        delete this.drafts[i.id];
        this.detailKey = null;
        this.refresh();
      },
    }, 'Submit');
    this.detail.append(h('div', { class: 'ij-form' }, h('label', { class: 'ij-label' }, 'Deliverable'), ta,
      h('div', { class: 'ij-actions' }, btn, h('span', { class: 'ij-note' }, st === 'Missed' ? 'Past the deadline: a late submission scores 0.' : 'Only one submission is accepted.')), err));
  }

  destroy() { this.el.remove(); }
}
