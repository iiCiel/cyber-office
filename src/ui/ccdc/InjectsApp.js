// The inject portal: scoring-engine "Injects" page (table with ID / Title / Score / Status / Time Remaining) plus
// the memo view with a deliverable box. Drafts live in a map so refresh() never disturbs typing.
//
//   const ij = new InjectsApp({ state, clock, guided, onSubmit: (id, text) => ({ ok, error?, late?, grade? }) })
import { h, clear } from '../dom.js';
import './injects.css';

const stripTitle = (t) => String(t).replace(/^Inject\s+\d+\s*[—–-]\s*/i, '');
const clockText = (sec) => {
  const t = 9 * 3600 + Math.max(0, Math.floor(sec));
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
};
const remaining = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `0d ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
};

export class InjectsApp {
  constructor({ state, onSubmit, guided = false, clock }) {
    this.state = state;
    this.onSubmit = onSubmit;
    this.guided = !!guided;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.drafts = {};
    this.seen = new Set();
    this.selected = null;
    this.rows = {}; // id -> { tr, status, left, score }
    this.results = {}; // id -> last submit result
    this.detailKey = null;
    this.el = h('div', { class: 'ij' });
    this.title = h('div', { class: 'ij-titlebar' }, h('h1', {}, 'Injects'), this.team = h('span', { class: 'ij-team' }, ''));
    this.tbody = h('tbody', {});
    this.table = h('table', { class: 'ij-table' },
      h('thead', {}, h('tr', {}, ['ID', 'Title', 'From', 'Score', 'Status', 'Time Remaining'].map((t, i) => h('th', { class: `ij-c${i}` }, t)))), this.tbody);
    this.empty = h('div', { class: 'ij-empty' }, 'No injects have been released yet. New injects appear here and in the team chat.');
    this.detail = h('div', { class: 'ij-detail' });
    this.el.append(this.title, h('div', { class: 'ij-card ij-listcard' }, this.table, this.empty), this.detail);
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
          status: h('span', { class: 'ij-badge' }), left: h('td', { class: 'ij-c5' }), score: h('td', { class: 'ij-c3' }),
          title: h('td', { class: 'ij-c1' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.select(i.id); } }, stripTitle(i.title))),
        };
        r.tr.append(h('td', { class: 'ij-c0' }, String(this._num(i))), r.title, h('td', { class: 'ij-c2' }, i.from), r.score, h('td', { class: 'ij-c4' }, r.status), r.left);
        this.tbody.append(r.tr);
      }
      const st = this._status(i);
      const rec = this.state.injects[i.id];
      const t = this._timer(i.id);
      r.status.className = `ij-badge ij-b-${st.toLowerCase()}`;
      r.status.textContent = st;
      r.score.textContent = rec.done && this.guided && rec.grade ? `${rec.grade.pts} / ${i.points}` : `${i.points} pts available`;
      r.left.textContent = rec.done ? '-' : remaining(t.dueAt - sec);
      r.left.className = `ij-c5${!rec.done && t.dueAt - sec < 60 ? ' ij-urgent' : ''}`;
      r.tr.classList.toggle('ij-unread', !this.seen.has(i.id) && !rec.done);
    }
    this.empty.style.display = rel.length ? 'none' : '';
    this.table.style.display = rel.length ? '' : 'none';
    this.team.textContent = `Team ${this.state.scenario.company ? '- ' + this.state.scenario.company : ''}`;
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

  _updateDetailLive(i) {
    const d = this.detail.querySelector('.ij-due-live');
    if (d) d.textContent = remaining(this._timer(i.id).dueAt - this.clock());
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
        h('tr', {}, h('th', {}, 'Date:'), h('td', {}, `Competition day, ${clockText(t.releaseAt)}`)),
        h('tr', {}, h('th', {}, 'Due:'), h('td', {}, `${clockText(t.dueAt)}  `, rec.done ? '' : h('span', { class: 'ij-due-live ij-urgent-soft' }, remaining(t.dueAt - this.clock())))),
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
