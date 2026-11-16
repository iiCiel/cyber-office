// Incident reports, filed through the team portal alongside injects. A report names one piece of Red Team activity;
// the white team grades it against what really happened, so this form only asks and never hints.
import { h, clear } from '../dom.js';
import './injects.css';

const FIELDS = [
  ['host', 'Affected host', 'input'],
  ['src', 'Attacker IP address', 'input'],
  ['time', 'Time of the activity (HH:MM)', 'input'],
  ['what', 'What happened', 'text'],
  ['evidence', 'Evidence (log lines, command output)', 'text'],
  ['remediation', 'What you did about it', 'text'],
  ['prevention', 'How it will be prevented', 'text'],
];

export class IncidentApp {
  constructor({ state, guided = false, onSubmit }) {
    this.state = state;
    this.guided = guided;
    this.onSubmit = onSubmit;
    this.values = {};
    this.el = h('div', { class: 'ij', 'data-incidents': '' });
    this.list = h('tbody', {});
    this.form = h('div', { class: 'ij-form' });
    this.el.append(
      h('div', { class: 'ij-titlebar' }, h('h1', {}, 'Incident Reports')),
      h('div', { class: 'ij-card ij-listcard' }, h('table', { class: 'ij-table' },
        h('thead', {}, h('tr', {}, ['#', 'Host', 'Submitted', 'Status'].map((t) => h('th', {}, t)))), this.list)),
      this.form);
    this.buildForm();
    this.drawList();
  }

  buildForm() {
    clear(this.form);
    this.form.append(h('label', { class: 'ij-label' }, 'New incident report'));
    for (const [key, label, kind] of FIELDS) {
      const el = h(kind === 'text' ? 'textarea' : 'input', { class: kind === 'text' ? 'ij-ta' : 'ij-ta ij-input', rows: kind === 'text' ? '3' : null, 'aria-label': label, 'data-field': key, oninput: () => { this.values[key] = el.value; } });
      el.value = this.values[key] || '';
      this.form.append(h('label', { class: 'ij-label' }, label), el);
    }
    this.form.append(h('div', { class: 'ij-actions' }, h('button', { class: 'ij-btn', type: 'button', onclick: () => this.submit() }, 'Submit report')));
  }

  submit() {
    this.onSubmit({ ...this.values });
    this.values = {};
    this.buildForm();
    this.drawList();
  }

  drawList() {
    clear(this.list);
    for (const r of this.state.incidents || []) {
      const status = this.guided ? `Graded ${r.hits.length}/7${r.missing.length ? `. Missing: ${r.missing.join(', ')}` : ''}${r.recovered ? `. +${r.recovered} points` : ''}` : 'Received by White Team';
      this.list.append(h('tr', {}, h('td', {}, String(r.n)), h('td', {}, r.report.host || ''), h('td', {}, r.report.time || ''), h('td', {}, status)));
    }
  }

  refresh() {}
  destroy() { this.el.remove(); }
}
