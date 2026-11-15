// NISE, the inject and incident-response portal used at MWCCDC 2026, as team 14 saw it on Nov 14 (all times CST).
// Inject page matched to the team's screenshot (docs/reference/nise-inject-srva07a.png): "Submissions Due",
// "Submissions Rejected", "Points Possible", the inject as a linked PDF, and the PDF open in the browser's viewer.
// The three document styles are the ones in the team's screenshots (Midwest "CCDC Inject", the "Collegiate Cyber
// Defense Competitions" header with rounded boxes, and the Description / Deliverables table). Answers are uploads,
// and only PDFs are accepted. The Incident Response tab files incident reports (game/incidents.js).
//   const app = new NiseApp({ state, clock, onSubmit: (id, text) => r, onIncident: (report) => r, team: 14 });
import { h, clear } from '../dom.js';
import './nise.css';

const DAY0 = Date.UTC(2026, 10, 14, 13, 0, 0);
const cst = (sec) => (!Number.isFinite(sec) ? '— (practice, no deadline)' : cstAt(sec));
const cstAt = (sec) => { const d = new Date(DAY0 + Math.max(0, sec) * 1000); return `11/14 ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const fileBase = (doc, i) => `${doc?.code || i.id.toUpperCase()}_-_${(doc?.name || i.title).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

export class NiseApp {
  constructor({ state, clock, onSubmit, onIncident, team = 14 }) {
    this.state = state;
    this.clock = clock || (() => state.engine?.clock || 0);
    this.onSubmit = onSubmit;
    this.onIncident = onIncident;
    this.team = team;
    this.tab = 'injects';
    this.sel = null;
    this.drafts = {};
    this.files = {}; // injectId -> [{ name, text }]
    this.pick = {};
    this.msg = {};
    this.seen = new Set();
    this.irMsg = null;
    this.sigSeen = '';
    this.body = h('div', { class: 'nz-body' });
    this.head = h('header', { class: 'nz-head' });
    this.el = h('div', { class: 'nz' }, this.head, this.body);
    this.render();
  }

  timer(id) { return this.state.engine?.injectTimers?.[id] || { released: true, releaseAt: 0, dueAt: 9999 }; }
  released() { return this.state.injectList.filter((i) => this.timer(i.id).released); }
  unreadCount() { return this.released().filter((i) => !this.seen.has(i.id)).length; }
  sig() { return JSON.stringify([this.released().map((i) => i.id), this.tab, this.sel, (this.state.incidentReports || []).length]); }

  render() {
    this.sigSeen = this.sig();
    clear(this.head).append(h('b', { class: 'nz-brand' }, 'NISE'), h('span', { class: 'nz-event' }, 'MWCCDC Invitational 2026'),
      h('nav', { class: 'nz-tabs' }, [['injects', 'Injects'], ['ir', 'Incident Response']].map(([id, label]) => h('a', { href: '#', class: `nz-tab${this.tab === id ? ' on' : ''}`, 'data-tab': id, onclick: (e) => { e.preventDefault(); this.saveDraft(); this.tab = id; this.render(); } }, label))),
      h('span', { class: 'nz-team' }, `Team ${this.team} · times CST`));
    clear(this.body);
    if (this.tab === 'ir') { this.body.append(this.irPage()); return; }
    const list = this.released();
    if (!this.sel && list.length) this.sel = list[0].id;
    const side = h('aside', { class: 'nz-list' }, list.length ? list.map((i) => {
      const t = this.timer(i.id); const rec = this.state.injects[i.id];
      return h('a', { href: '#', class: `nz-item${this.sel === i.id ? ' on' : ''}`, 'data-inject': i.id, onclick: (e) => { e.preventDefault(); this.saveDraft(); this.sel = i.id; this.render(); } },
        h('b', {}, i.doc?.code || i.id.toUpperCase()), h('span', {}, i.doc?.name || i.title.replace(/^.*?—\s*/, '')),
        h('small', { class: rec.done ? 'ok' : this.clock() > t.dueAt ? 'late' : '' }, rec.done ? 'Submitted' : Number.isFinite(t.dueAt) ? `Due ${cst(t.dueAt)}` : 'Open'));
    }) : h('p', { class: 'nz-muted' }, 'No injects released yet.'));
    this.body.append(side, this.sel ? this.detail(this.state.injectList.find((i) => i.id === this.sel)) : h('div'));
  }

  saveDraft() { if (this.ta && this.sel) this.drafts[this.sel] = this.ta.value; }

  detail(i) {
    this.seen.add(i.id);
    const t = this.timer(i.id); const rec = this.state.injects[i.id];
    const base = fileBase(i.doc, i);
    const meta = h('div', { class: 'nz-meta' },
      h('div', {}, `Submissions Due: ${cst(t.dueAt)}`), h('div', {}, `Submissions Rejected: ${cst(t.dueAt + 60)}`), h('div', {}, `Points Possible: ${i.points}`),
      h('div', { class: 'nz-file' }, 'Inject: ', h('a', { href: '#', onclick: (e) => e.preventDefault() }, `${base}.pdf`)));
    const viewer = h('div', { class: 'nz-viewer' },
      h('div', { class: 'nz-vbar' }, h('span', { class: 'nz-vi' }, '▥'), h('span', { class: 'nz-vi' }, '⌕'), h('span', { class: 'nz-vi' }, '︿'), h('span', { class: 'nz-vi' }, '﹀'), h('span', { class: 'nz-page' }, '1'), h('span', {}, 'of 1'),
        h('span', { class: 'nz-grow' }), h('span', { class: 'nz-vi' }, '−'), h('span', { class: 'nz-vi' }, '+'), h('span', { class: 'nz-zoom' }, 'Automatic Zoom ⌄'), h('span', { class: 'nz-grow' })),
      h('div', { class: 'nz-paper-wrap' }, this.paper(i)));
    return h('section', { class: 'nz-detail' }, meta, viewer, this.submitBox(i, rec, base));
  }

  // The inject document, in the style it arrived in.
  paper(i) {
    const d = i.doc || { style: 'midwest', name: i.title, code: i.id.toUpperCase(), description: [i.prompt], deliverable: ['Respond with a business memo.'] };
    const para = (arr) => arr.map((p) => h('p', {}, p));
    const idTable = (cls) => h('table', { class: cls }, h('tr', {}, h('th', {}, cls === 'nz-idt-mw' ? 'INJECT NAME' : 'Inject Name'), h('td', {}, d.name)), h('tr', {}, h('th', {}, cls === 'nz-idt-mw' ? 'INJECT ID' : 'Inject ID'), h('td', {}, d.code)));
    if (d.style === 'midwest') {
      return h('div', { class: 'nz-paper nz-mw' },
        h('div', { class: 'nz-mw-head' }, h('i', { class: 'nz-seal', 'aria-hidden': 'true' }, 'CCDC'), h('h1', {}, 'CCDC Inject')), idTable('nz-idt-mw'),
        h('h4', {}, 'INJECT DESCRIPTION:'), para(d.description), h('h4', {}, 'INJECT DELIVERABLE'), para(d.deliverable));
    }
    if (d.style === 'ccdc') {
      return h('div', { class: 'nz-paper nz-cc' },
        h('div', { class: 'nz-cc-head' }, h('i', { class: 'nz-seal nz-seal-c', 'aria-hidden': 'true' }, 'CCDC'), h('div', {}, h('h1', {}, 'Collegiate Cyber Defense Competitions'), idTable('nz-idt-cc'))),
        h('div', { class: 'nz-box' }, h('u', {}, 'Description'), para(d.description)), h('div', { class: 'nz-box' }, h('u', {}, 'Deliverable'), para(d.deliverable)));
    }
    return h('div', { class: 'nz-paper nz-tb' },
      h('div', { class: 'nz-cc-head' }, h('i', { class: 'nz-seal nz-seal-c', 'aria-hidden': 'true' }, 'CCDC'), h('div', {}, h('h1', {}, 'Collegiate Cyber Defense Competitions'), idTable('nz-idt-cc'))),
      h('table', { class: 'nz-dd' }, h('tr', {}, h('th', {}, 'Description'), h('td', {}, para(d.description))), h('tr', {}, h('th', {}, 'Deliverables'), h('td', {}, para(d.deliverable)))));
  }

  // Answers are files. The memo is written here, then saved as .docx or exported as PDF; only a PDF is accepted.
  submitBox(i, rec, base) {
    if (rec.done) {
      const g = rec.grade;
      return h('div', { class: 'nz-sub' }, h('h3', {}, 'Your submission'), h('p', { class: 'nz-ok' }, `${rec.file || `${base}_memo.pdf`} submitted${rec.late ? ' (late: scored 0)' : ''}.`), g ? h('p', { class: 'nz-muted' }, `Graded ${g.pts}/${g.max}.`) : null);
    }
    this.ta = h('textarea', { class: 'nz-ta', rows: 9, 'data-f': 'memo', placeholder: 'To: ...\nFrom: Team 14\nSubject: ...' });
    this.ta.value = this.drafts[i.id] || '';
    const files = this.files[i.id] || [];
    const save = (ext) => {
      this.drafts[i.id] = this.ta.value;
      if (this.ta.value.trim().length < 20) { this.msg[i.id] = { bad: true, text: 'Write the memo first.' }; this.render(); return; }
      const name = `${base}_memo.${ext}`;
      this.files[i.id] = [...files.filter((f) => f.name !== name), { name, text: this.ta.value }];
      this.pick[i.id] = name; this.msg[i.id] = null; this.render();
    };
    const upload = () => {
      this.drafts[i.id] = this.ta.value;
      const f = (this.files[i.id] || []).find((x) => x.name === this.pick[i.id]);
      if (!f) { this.msg[i.id] = { bad: true, text: 'Choose a file to upload.' }; this.render(); return; }
      if (!/\.pdf$/i.test(f.name)) { this.msg[i.id] = { bad: true, text: `Rejected: ${f.name}. Only PDF files are accepted.` }; this.render(); return; }
      const r = this.onSubmit ? this.onSubmit(i.id, f.text) : { ok: false, error: 'Not connected.' };
      if (!r.ok) { this.msg[i.id] = { bad: true, text: r.error || 'Upload failed.' }; this.render(); return; }
      this.state.injects[i.id].file = f.name;
      this.msg[i.id] = null; this.render();
    };
    const m = this.msg[i.id];
    return h('div', { class: 'nz-sub' }, h('h3', {}, 'Submit'),
      h('label', { class: 'nz-lbl' }, 'Memo (write it, then save it as a file)'), this.ta,
      h('div', { class: 'nz-row' }, h('button', { type: 'button', class: 'nz-btn2', 'data-btn': 'docx', onclick: () => save('docx') }, 'Save as .docx'), h('button', { type: 'button', class: 'nz-btn2', 'data-btn': 'pdf', onclick: () => save('pdf') }, 'Export as PDF')),
      h('div', { class: 'nz-files' }, files.length ? files.map((f) => h('label', { class: 'nz-fileopt' }, h('input', { type: 'radio', name: `nzf-${i.id}`, checked: this.pick[i.id] === f.name, onchange: () => { this.pick[i.id] = f.name; } }), f.name)) : h('span', { class: 'nz-muted' }, 'No file chosen')),
      h('button', { type: 'button', class: 'nz-btn', 'data-btn': 'upload', onclick: upload }, 'Upload'),
      m ? h('p', { class: m.bad ? 'nz-bad' : 'nz-ok', role: 'alert' }, m.text) : null);
  }

  // ---- Incident Response ------------------------------------------------------------------------------------
  irPage() {
    const reps = this.state.incidentReports || [];
    const f = (this.irForm ||= { title: '', hosts: [], time: '', source: '', description: '', actions: '' });
    const field = (key, label, multi) => {
      const el = h(multi ? 'textarea' : 'input', { class: 'nz-in', 'data-f': `ir-${key}`, rows: multi ? 4 : undefined, oninput: (e) => { f[key] = e.target.value; } });
      el.value = f[key];
      return h('label', { class: 'nz-field' }, h('span', {}, label), el);
    };
    const boxes = this.state.deviceList.filter((d) => d.role !== 'attacker').map((d) => h('label', { class: 'nz-chk' },
      h('input', { type: 'checkbox', 'data-host': d.id, checked: f.hosts.includes(d.id), onchange: (e) => { f.hosts = e.target.checked ? [...f.hosts, d.id] : f.hosts.filter((x) => x !== d.id); } }), d.name));
    const submit = () => {
      const r = this.onIncident ? this.onIncident({ ...f }) : { ok: false, msg: 'Not connected.' };
      this.irMsg = { bad: !r.ok, text: r.msg };
      if (r.ok) this.irForm = null;
      this.render();
    };
    return h('div', { class: 'nz-ir' },
      h('section', { class: 'nz-irform' }, h('h3', {}, 'New Incident Report'),
        h('p', { class: 'nz-muted' }, 'Report red team activity you found. The white team matches each report to real activity; an accurate report recovers part of the points the red team took.'),
        field('title', 'Title'), h('div', { class: 'nz-field' }, h('span', {}, 'Affected systems'), h('div', { class: 'nz-chks' }, boxes)),
        field('time', 'Time detected (CST)'), field('source', 'Source / indicators (IPs, accounts, files, processes)'),
        field('description', 'What happened and how you found it', true), field('actions', 'Containment and remediation', true),
        h('button', { type: 'button', class: 'nz-btn', 'data-btn': 'ir-submit', onclick: submit }, 'Submit Report'),
        this.irMsg ? h('p', { class: this.irMsg.bad ? 'nz-bad' : 'nz-ok', role: 'alert' }, this.irMsg.text) : null),
      h('section', { class: 'nz-irlist' }, h('h3', {}, 'Submitted reports'),
        reps.length ? h('table', { class: 'nz-table' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Title'), h('th', {}, 'Time'), h('th', {}, 'White team')),
          reps.map((r) => h('tr', {}, h('td', {}, String(r.n)), h('td', {}, r.report.title || '(untitled)'), h('td', {}, cst(r.at)), h('td', {}, r.matched ? `Matched · ${r.grade.pts}/${r.grade.max}` : 'No matching activity'))))
          : h('p', { class: 'nz-muted' }, 'None yet.')));
  }

  refresh() { if (this.sig() !== this.sigSeen && !(document.activeElement && this.el.contains(document.activeElement))) { this.saveDraft(); this.render(); } }
  destroy() {}
}
