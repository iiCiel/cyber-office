import { h, clear } from '../dom.js';
import { rate, lockFinding, setExecSummary, discoveredFindings, progress, severityFor, gradeText, LEVELS } from '../../game/cptclab.js';
import { splitScope, docRef, sevClass, findingNo, cvssBand, severityCounts } from './helpers.js';

// The report window: a white A4-style document (cover block, executive summary, scope and methodology, findings
// summary table with severity chips, one section per finding) wrapped in a document-viewer toolbar. All grading
// goes through the existing cptclab.js functions; this file only draws and forwards input.
export class ReportDoc {
  /** @param {{ getState:()=>object, scenario:object, guided:boolean, onSubmit:()=>void, sound?:{play:Function} }} o */
  constructor(o) {
    this.o = o;
    this.lockErr = {};
    this.status = h('span', { class: 'kx-rstatus' });
    this.submit = h('button', { type: 'button', class: 'kx-btn kx-primary kx-submit', onclick: () => o.onSubmit() }, 'Submit report to client');
    this.scroller = h('div', { class: 'kx-rscroll' });
    this.el = h('div', { class: 'kx-report' },
      h('div', { class: 'kx-rtools' }, h('span', { class: 'kx-rtool-name' }, 'Penetration Test Report (draft)'), this.status, this.submit),
      this.scroller);
    this.refresh();
  }

  get state() { return this.o.getState(); }

  updateStatus() {
    const p = progress(this.state);
    this.status.textContent = `${p.rated}/${p.found} findings written up`;
  }

  refresh() {
    const keep = this.scroller.scrollTop;
    clear(this.scroller).append(this.page());
    this.scroller.scrollTop = keep;
    this.updateStatus();
  }

  page() {
    const st = this.state, sc = this.o.scenario;
    const found = discoveredFindings(st);
    const rows = found.map((f, i) => {
      const r = st.report[f.id];
      return { f, i, r, no: findingNo(i), sev: r.likelihood && r.impact ? severityFor(r.likelihood, r.impact) : null };
    });
    const counts = severityCounts(rows);
    const scope = splitScope(sc.scope);
    const chip = (sev) => h('span', { class: `kx-chip ${sevClass(sev)}` }, sev || 'Unrated');

    return h('article', { class: 'kx-paper kx-rpt' },
      h('section', { class: 'kx-cover' },
        h('div', { class: 'kx-confid' }, 'CONFIDENTIAL'),
        h('h1', { class: 'kx-cover-title' }, 'Penetration Test Report'),
        h('div', { class: 'kx-cover-client' }, sc.client),
        h('div', { class: 'kx-cover-sub' }, sc.engagement),
        h('table', { class: 'kx-tbl kx-docctl' }, h('tbody', {},
          h('tr', {}, h('th', {}, 'Document reference'), h('td', {}, docRef(sc.client))),
          h('tr', {}, h('th', {}, 'Version'), h('td', {}, 'DRAFT 0.1')),
          h('tr', {}, h('th', {}, 'Date'), h('td', {}, '31 October 2026')),
          h('tr', {}, h('th', {}, 'Prepared by'), h('td', {}, 'Assessment team (you)')),
          h('tr', {}, h('th', {}, 'Classification'), h('td', {}, 'Client confidential'))))),
      h('h2', { class: 'kx-h' }, h('span', {}, '1'), 'Executive summary'),
      h('textarea', { class: 'kx-exec', rows: '5', 'aria-label': 'Executive summary', placeholder: 'Write for the board: business risk in plain language, the critical issues by name, what to do and by when, and the outcome once fixed.',
        oninput: (e) => setExecSummary(st, e.target.value) }, st.execSummary || ''),
      h('h2', { class: 'kx-h' }, h('span', {}, '2'), 'Scope and methodology'),
      h('p', {}, 'Testing was carried out under the signed Rules of Engagement. External and internal discovery, service enumeration and validation of weaknesses were performed from a Kali Linux assessment host. Evidence is redacted.'),
      h('ul', { class: 'kx-scopelist' }, scope.inScope.map((t) => h('li', {}, h('b', {}, 'In scope: '), t)), scope.outOfScope.map((t) => h('li', {}, h('b', {}, 'Out of scope: '), t))),
      h('h2', { class: 'kx-h' }, h('span', {}, '3'), 'Findings summary'),
      h('div', { class: 'kx-sevbar' }, ['Critical', 'High', 'Medium', 'Low', 'Unrated'].map((k) => h('span', { class: `kx-chip ${sevClass(k === 'Unrated' ? null : k)}` }, `${k} ${counts[k]}`))),
      h('table', { class: 'kx-tbl kx-summary' },
        h('thead', {}, h('tr', {}, ['Ref', 'Finding', 'Affected', 'Likelihood', 'Impact', 'Risk'].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.length ? rows.map((x) => h('tr', { 'data-f': x.f.id },
          h('td', {}, x.no), h('td', {}, x.f.title), h('td', {}, x.f.system), h('td', {}, x.r.likelihood || '-'), h('td', {}, x.r.impact || '-'), h('td', {}, chip(x.sev))))
          : h('tr', {}, h('td', { colspan: '6', class: 'kx-empty' }, 'No findings recorded yet. Test the in-scope hosts from the terminal; confirmed findings are added here.')))),
      h('h2', { class: 'kx-h' }, h('span', {}, '4'), 'Detailed findings'),
      rows.map((x) => this.finding(x, chip)));
  }

  select(x, field, label) {
    const locked = x.r.locked;
    return h('select', { class: `kx-sel kx-sel-${field}`, 'aria-label': `${label} for ${x.f.title}`, disabled: locked ? '' : undefined,
      onchange: (e) => { rate(this.state, x.f.id, field, e.target.value || null); this.refresh(); } },
      h('option', { value: '' }, '- select -'), LEVELS.map((l) => h('option', { value: l, selected: x.r[field] === l ? '' : undefined }, l)));
  }

  finding(x, chip) {
    const { f, r } = x;
    const err = this.lockErr[f.id];
    const ta = h('textarea', { class: 'kx-rem', rows: '3', 'aria-label': `Remediation for ${f.title}`, disabled: r.locked ? '' : undefined,
      placeholder: 'Root-cause remediation: which control fixes this, not just "fix it".',
      oninput: (e) => { rate(this.state, f.id, 'remediation', e.target.value); this.updateStatus(); } }, r.remediation || '');
    return h('section', { class: 'kx-finding', 'data-f': f.id },
      h('h3', {}, `4.${x.i + 1}  ${x.no}  ${f.title}`),
      h('table', { class: 'kx-tbl kx-fdetail' }, h('tbody', {},
        h('tr', {}, h('th', {}, 'Risk rating'), h('td', {}, chip(x.sev), h('span', { class: 'kx-cvss' }, x.sev ? ` CVSS v3.1 band ${cvssBand(x.sev)}` : ' rate likelihood and impact'))),
        h('tr', {}, h('th', {}, 'Likelihood'), h('td', {}, this.select(x, 'likelihood', 'Likelihood'))),
        h('tr', {}, h('th', {}, 'Impact'), h('td', {}, this.select(x, 'impact', 'Impact'))),
        h('tr', {}, h('th', {}, 'Affected hosts'), h('td', {}, f.system)),
        h('tr', {}, h('th', {}, 'Evidence'), h('td', { class: 'kx-evidence' }, f.evidence)),
        h('tr', {}, h('th', {}, 'Remediation'), h('td', {}, ta,
          this.o.guided && !r.locked ? h('button', { type: 'button', class: 'kx-btn kx-lock', onclick: () => this.lock(f.id) }, 'Lock in and compare with the model') : null,
          err ? h('p', { class: 'kx-err', role: 'alert' }, err) : null)))),
      this.o.guided && r.locked ? this.feedback(f, gradeText(f.remediationRubric, r.remediation)) : null);
  }

  lock(id) {
    const res = lockFinding(this.state, id);
    if (!res.ok) { this.lockErr[id] = res.error; this.o.sound?.play('error'); } else { delete this.lockErr[id]; this.o.sound?.play('select'); }
    this.refresh();
  }

  feedback(f, g) {
    return h('div', { class: 'kx-fb' },
      h('p', { class: 'kx-model' }, h('b', {}, 'Model rating: '), `${severityFor(f.refLikelihood, f.refImpact)} (${f.refLikelihood} x ${f.refImpact}).`),
      h('p', {}, h('b', {}, `Remediation: ${Math.round(g.credit * 100)}%`), ` - ${g.hits.length}/${g.hits.length + g.missing.length} required controls`),
      g.hits.length ? h('ul', { class: 'kx-fb-ok' }, g.hits.map((t) => h('li', {}, t))) : null,
      g.missing.length ? h('ul', { class: 'kx-fb-bad' }, g.missing.map((t) => h('li', {}, `missing: ${t}`))) : null,
      g.wrong.length ? h('ul', { class: 'kx-fb-bad' }, g.wrong.map((t) => h('li', {}, `wrong control: ${t}`))) : null,
      h('p', {}, h('b', {}, 'Model remediation: '), f.modelRemediation));
  }
}
