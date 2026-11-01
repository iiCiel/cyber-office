import { h } from '../dom.js';
import { splitScope, clientDomain, docRef, sevClass } from './helpers.js';

// The two "paper" screens around the desktop: the client's Rules of Engagement letter (before) and the
// report review sheet (after). Plain white documents on a grey viewer background, no cards.

const row = (label, value) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, value));

export function renderBrief(ctx) {
  const sc = ctx.scenario;
  const scope = splitScope(sc.scope);
  const dom = clientDomain(sc.client);
  const ref = docRef(sc.client);
  const picker = ctx.scenarios.length > 1 ? h('table', { class: 'kx-tbl kx-pick', 'aria-label': 'Client engagements' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Client'), h('th', {}, 'Engagement'))),
    h('tbody', {}, ctx.scenarios.map((s) => h('tr', { class: s.id === sc.id ? 'on' : '' },
      h('td', {}, h('input', { type: 'radio', name: 'kx-client', 'aria-label': s.client, checked: s.id === sc.id ? '' : undefined, onchange: () => ctx.onPick(s) })),
      h('td', {}, h('b', {}, s.client)), h('td', {}, s.engagement))))) : null;

  return h('div', { class: 'kx-docview' },
    h('div', { class: 'kx-viewbar' }, h('span', {}, `Rules of Engagement - ${sc.client}.pdf`), h('span', { class: 'kx-viewbar-r' }, 'Page 1 of 1')),
    h('article', { class: 'kx-paper kx-roe' },
      h('div', { class: 'kx-letterhead' }, h('div', { class: 'kx-lh-name' }, sc.client), h('div', { class: 'kx-lh-sub' }, `Information Security Office - security@${dom}`)),
      h('div', { class: 'kx-confid' }, 'CONFIDENTIAL - FOR AUTHORISED TESTERS ONLY'),
      h('h1', { class: 'kx-doc-title' }, 'Rules of Engagement and Authorisation to Test'),
      h('table', { class: 'kx-tbl kx-meta' }, h('tbody', {},
        row('Reference', ref), row('Engagement', sc.engagement), row('Issued to', 'Assessment team (you)'), row('Status', 'Signed by client - testing authorised'))),
      h('h2', {}, '1. Authorised targets'),
      h('table', { class: 'kx-tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Scope'), h('th', {}, 'Target / restriction'))),
        h('tbody', {}, scope.inScope.map((t) => h('tr', {}, h('td', { class: 'kx-in' }, 'IN SCOPE'), h('td', {}, t))),
          scope.outOfScope.map((t) => h('tr', {}, h('td', { class: 'kx-out' }, 'OUT OF SCOPE'), h('td', {}, t))))),
      h('h2', {}, '2. Rules of engagement'),
      h('ol', { class: 'kx-rules' }, scope.rules.map((r) => h('li', {}, r)),
        h('li', {}, 'All findings are reported through the final report. Anything that stops a production service must be reported to the contact below immediately.')),
      h('h2', {}, '3. Testing window'),
      h('p', {}, ctx.guided ? 'Untimed practice engagement. Work at your own pace; hints are available in your notes.' : `Fixed ${ctx.clockLabel} window, started when you open the terminal. The report is collected when the clock reaches 0:00, finished or not.`),
      h('h2', {}, '4. Points of contact'),
      h('table', { class: 'kx-tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Role'), h('th', {}, 'Contact'))),
        h('tbody', {}, h('tr', {}, h('td', {}, 'Client sponsor (CISO)'), h('td', {}, `ciso@${dom}`)), h('tr', {}, h('td', {}, 'IT operations (emergencies)'), h('td', {}, `noc@${dom}`)), h('tr', {}, h('td', {}, 'Competition judge / white team'), h('td', {}, 'on the engagement bridge')))),
      h('h2', {}, '5. Engagement settings'),
      picker,
      h('fieldset', { class: 'kx-mode' }, h('legend', {}, 'Mode'),
        h('label', {}, h('input', { type: 'radio', name: 'kx-mode', value: 'guided', checked: ctx.guided ? '' : undefined, onchange: () => ctx.onMode(true) }), h('b', {}, ' Guided'), ' - untimed, hints in your notes, lock in each write-up to compare it with the model answer.'),
        h('label', {}, h('input', { type: 'radio', name: 'kx-mode', value: 'competition', checked: ctx.guided ? undefined : '', onchange: () => ctx.onMode(false) }), h('b', {}, ` Competition - ${ctx.clockLabel} clock`), ' - live countdown across the whole engagement, no hints.')),
      h('p', { class: 'kx-sign' }, `Authorised on behalf of ${sc.client}: ____________________   Date: 31 Oct 2026`),
      h('div', { class: 'kx-actions' },
        h('button', { type: 'button', class: 'kx-btn kx-primary kx-begin', onclick: ctx.onBegin }, 'Begin engagement: open the Kali desktop'),
        h('button', { type: 'button', class: 'kx-btn kx-quit', onclick: ctx.onBack }, 'Back'))));
}

const chip = (sev) => h('span', { class: `kx-chip ${sevClass(sev)}` }, sev || 'Unrated');

export function renderDebrief(ctx) {
  const { scenario: sc, state, grade: g } = ctx;
  const missed = sc.findings.filter((f) => !state.discovered[f.id]);
  const verdictClass = g.pct >= 70 ? 'pass' : 'fail';
  return h('div', { class: 'kx-docview' },
    h('div', { class: 'kx-viewbar' }, h('span', {}, `Report review - ${sc.client}.pdf`), h('span', { class: 'kx-viewbar-r' }, 'Reviewed')),
    h('article', { class: 'kx-paper kx-review' },
      h('div', { class: 'kx-letterhead' }, h('div', { class: 'kx-lh-name' }, 'Report Review Sheet'), h('div', { class: 'kx-lh-sub' }, `${sc.client} - ${docRef(sc.client)} - ${state.mode === 'competition' ? 'competition' : 'guided'} mode`)),
      ctx.timedOut ? h('p', { class: 'kx-timeout' }, 'Time ran out. The report was collected as it stood at 0:00.') : null,
      h('div', { class: 'kx-gradebox' },
        h('div', { class: `kx-grade g${g.letter} ${verdictClass}` }, g.letter),
        h('div', {}, h('div', { class: 'kx-grade-pct' }, `${g.pct} / 100`), h('p', { class: 'kx-verdict' }, ctx.verdict))),
      h('h2', {}, 'Scoring'),
      h('table', { class: 'kx-tbl kx-score' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Criterion'), h('th', {}, 'Awarded'), h('th', {}, 'Max'), h('th', {}, 'Reviewer note'))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Coverage'), h('td', {}, `${g.coverage}`), h('td', {}, '35'), h('td', {}, `${g.foundCount} of ${g.totalFindings} findings confirmed at the terminal`)),
          h('tr', {}, h('td', {}, 'Risk rating'), h('td', {}, `${g.risk}`), h('td', {}, '30'), h('td', {}, 'severity against the reference likelihood x impact matrix')),
          h('tr', {}, h('td', {}, 'Remediation'), h('td', {}, `${g.remediation}`), h('td', {}, '25'), h('td', {}, 'root-cause controls each finding needs')),
          h('tr', {}, h('td', {}, 'Executive summary'), h('td', {}, `${g.exec}`), h('td', {}, '10'), h('td', {}, g.execOk ? 'business risk, both criticals, a timeframe' : 'missing what the board needs'))),
        h('tfoot', {}, h('tr', {}, h('th', {}, 'Total'), h('th', {}, `${g.pct}`), h('th', {}, '100'), h('th', {}, `Grade ${g.letter}`)))),
      g.ratingRows.length ? h('div', {},
        h('h2', {}, 'Risk ratings against the reference'),
        h('table', { class: 'kx-tbl kx-ratings' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Finding'), h('th', {}, 'Your rating'), h('th', {}, 'Reference'), h('th', {}, 'Result'))),
          h('tbody', {}, g.ratingRows.map((r) => h('tr', {}, h('td', {}, r.title), h('td', {}, chip(r.yours)), h('td', {}, chip(r.ref)),
            h('td', {}, r.credit === 1 ? 'Correct' : r.credit ? 'One step off' : 'Off by two or more, or unrated')))))) : null,
      g.remRows.length ? h('div', { class: 'kx-rem-review' },
        h('h2', {}, 'Remediations, graded'),
        h('ul', { class: 'kx-revlist' }, g.remRows.map((r) => {
          const f = sc.findings.find((x) => x.id === r.id);
          return h('li', { class: r.credit >= 0.99 ? 'ok' : r.credit > 0 ? 'warn' : 'bad', 'data-rem': r.id },
            h('div', { class: 'kx-rev-head' }, h('b', {}, r.title), h('span', {}, `${Math.round(r.credit * 100)}% of the controls`)),
            h('p', {}, h('b', {}, 'You wrote: '), r.text || '(nothing)'),
            r.missing.length ? h('p', {}, h('b', {}, 'Missing: '), r.missing.join('; ')) : null,
            r.wrong.length ? h('p', {}, h('b', {}, 'Wrong control: '), r.wrong.join('; ')) : null,
            h('p', { class: 'kx-model-fix' }, h('b', {}, 'Model: '), f.modelRemediation));
        }))) : null,
      h('div', { class: 'kx-exec-review' },
        h('h2', {}, 'Executive summary, graded'),
        h('p', {}, h('b', {}, `${g.exec}/10 - `), g.execGrade.hits.length ? `covered: ${g.execGrade.hits.join('; ')}` : 'covered nothing the board needs'),
        g.execGrade.missing.length ? h('p', {}, h('b', {}, 'Missing: '), g.execGrade.missing.join('; ')) : null,
        g.execGrade.wrong.length ? h('p', {}, h('b', {}, 'Cost points: '), g.execGrade.wrong.join('; ')) : null,
        h('p', { class: 'kx-model-fix' }, h('b', {}, 'What wins: '), sc.execModel)),
      missed.length ? h('div', {},
        h('h2', {}, 'Findings not identified'),
        h('table', { class: 'kx-tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Finding'), h('th', {}, 'System'), h('th', {}, 'What was there'))),
          h('tbody', {}, missed.map((f) => h('tr', {}, h('td', {}, f.title), h('td', {}, f.system), h('td', {}, f.evidence)))))) : null,
      h('div', { class: 'kx-actions' },
        h('button', { type: 'button', class: 'kx-btn kx-primary kx-again', onclick: ctx.onAgain }, 'Run it again'),
        h('button', { type: 'button', class: 'kx-btn kx-quit', onclick: ctx.onDone }, 'Done'))));
}
