import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CPTC_SCENARIO } from '../data/cptcScenario.js';
import {
  newReport, setRoe, setRisk, setRemediation, setExec, completeness, scoreReport, severityTally,
  severityFor, recordBest, LIKELIHOOD, IMPACT, SEVERITIES, RISK_MATRIX,
} from '../game/cptc.js';
import '../ui/screen.css';
import '../ui/competitions.css';

// CPTC mode: you are the pentest team writing the client report, which is what CPTC actually scores. Four
// phases rendered as HTML over the canvas:
//   scope  -> rules-of-engagement judgment calls
//   rate   -> for each finding, set Likelihood x Impact (severity derives from the shown matrix) + pick the fix
//   exec   -> choose the executive summary the board can act on
//   report -> the generated report (exec summary + risk-ranked findings + remediation) and your A-F grade
// Report-writing, risk rating and scope judgment — no attacking. All content derives from the scenario data.
export class CptcScene extends Phaser.Scene {
  constructor() {
    super('Cptc');
  }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenario = data?.scenario || CPTC_SCENARIO;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0a0a16');
    this.sound2 = this.game.registry.get('sound');
    this.state = newReport(this.scenario);
    this.flash = {};
    this.warn = '';

    this.root = h('div', { class: 'screen open cptc-screen', id: 'cptc' });
    document.body.append(this.root);
    this.render();

    const layout = () => placeOnCanvas(this.root, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W });
    layout();
    this.layout = layout;
    this.canvasRect = '';
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      this.root.remove();
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());
  }

  update() {
    if (!this.layout) return;
    const r = this.game.canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key !== this.canvasRect) { this.canvasRect = key; this.layout(); }
  }

  exit() {
    this.sound2?.play('click');
    this.scene.start(this.returnTo);
  }

  render() {
    clear(this.root);
    const phase = this.state.phase;
    if (phase !== this.renderedPhase) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
    this.renderedPhase = phase;
    if (phase === 'scope') this.renderScope();
    else if (phase === 'rate') this.renderRate();
    else if (phase === 'exec') this.renderExec();
    else this.renderReport();
  }

  head(kicker, right) {
    return h('header', { class: 'cx-head' },
      h('div', {}, h('div', { class: 'cx-kicker' }, kicker), h('div', { class: 'cx-client' }, `Client: ${this.scenario.client}`)),
      right || null);
  }

  steps(active) {
    const names = [['scope', 'Scope / RoE'], ['rate', 'Risk & remediation'], ['exec', 'Executive summary'], ['report', 'Report']];
    return h('ol', { class: 'cx-steps' }, names.map(([id, label], i) =>
      h('li', { class: `${id === active ? 'on' : ''}${names.findIndex((n) => n[0] === active) > i ? ' done' : ''}` }, `${i + 1}. ${label}`)));
  }

  // ---- scope / RoE ----
  renderScope() {
    const panel = h('div', { class: 'cx-wrap' },
      this.head('CPTC · penetration test report · rules of engagement'),
      this.steps('scope'),
      h('div', { class: 'cx-panel cx-intro' },
        h('h1', {}, 'Engagement brief'),
        h('p', { class: 'cx-lede' }, this.scenario.engagement),
        h('p', { class: 'cx-scope' }, h('b', {}, 'Scope: '), this.scenario.scopeNote),
        h('p', { class: 'cx-note' }, 'CPTC is won on the report, not the breach. Before you write it, make the rules-of-engagement calls the judges watch for — scope and sensitive-data handling decide more than any exploit.')),
      h('ol', { class: 'cx-roe' }, this.scenario.roe.map((d) => this.roeCard(d))),
      this.warn ? h('p', { class: 'cx-warn' }, this.warn) : null,
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-go', 'data-action': 'to-rate', onclick: () => this.toRate() }, 'Rate the findings →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Back')));
    this.root.append(panel);
  }

  roeCard(d) {
    const pick = this.state.roe[d.id];
    const fl = this.flash[d.id];
    return h('li', { class: `cx-roe-card${pick ? ' answered' : ''}`, 'data-roe': d.id },
      h('h3', {}, d.title),
      h('p', { class: 'cx-roe-sit' }, d.situation),
      h('div', { class: 'cx-choices' }, d.choices.map((c) =>
        h('button', { type: 'button', class: `cx-choice${pick === c.id ? ' chosen' : ''}`, 'data-choice': c.id, onclick: () => this.pickRoe(d.id, c.id) }, c.label))),
      fl ? h('p', { class: `cx-flash ${fl.tone}` }, fl.msg) : null);
  }

  pickRoe(id, choiceId) {
    setRoe(this.state, id, choiceId);
    const d = this.scenario.roe.find((x) => x.id === id);
    const c = d.choices.find((x) => x.id === choiceId);
    this.sound2?.play(c.correct ? 'select' : 'click');
    this.flash[id] = { tone: c.correct ? 'ok' : c.partial ? 'warn' : 'bad', msg: c.feedback };
    this.warn = '';
    this.render();
    this.root.querySelector(`[data-roe="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  toRate() {
    if (this.scenario.roe.some((d) => this.state.roe[d.id] == null)) {
      this.warn = 'Make every rules-of-engagement call first — these are scored too.';
      this.sound2?.play('error');
      return this.render();
    }
    this.sound2?.play('select');
    this.state.phase = 'rate';
    this.render();
  }

  // ---- risk rating + remediation ----
  renderRate() {
    const panel = h('div', { class: 'cx-wrap' },
      this.head('Risk rating · likelihood x impact', h('div', { class: 'cx-count' }, this.rateStatus())),
      this.steps('rate'),
      h('div', { class: 'cx-panel cx-matrix-panel' },
        h('h2', {}, 'The risk matrix'),
        h('p', { class: 'cx-note' }, 'Severity is not a feeling — it is Likelihood × Impact. Set both honestly and read the severity off this matrix. Judges reward a rating you can defend, and penalise inflating every finding to Critical.'),
        this.matrixTable()),
      h('ol', { class: 'cx-findings' }, this.scenario.findings.map((f) => this.findingCard(f))),
      this.warn ? h('p', { class: 'cx-warn' }, this.warn) : null,
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-ghost', onclick: () => { this.sound2?.play('click'); this.state.phase = 'scope'; this.render(); } }, '← RoE'),
        h('button', { type: 'button', class: 'cx-go', 'data-action': 'to-exec', onclick: () => this.toExec() }, 'Write the summary →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Quit')));
    this.root.append(panel);
  }

  matrixTable() {
    const cell = (l, i) => h('td', { class: `cx-m s${RISK_MATRIX[l][i]}` }, RISK_MATRIX[l][i]);
    return h('table', { class: 'cx-matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Likelihood ↓ / Impact →'), IMPACT.map((i) => h('th', {}, i)))),
      h('tbody', {}, [...LIKELIHOOD].reverse().map((l) => h('tr', {}, h('th', {}, l), IMPACT.map((i) => cell(l, i))))));
  }

  findingCard(f) {
    const rec = this.state.findings[f.id];
    const derived = rec.likelihood && rec.impact ? severityFor(rec.likelihood, rec.impact) : null;
    const dial = (field, opts) => h('div', { class: 'cx-dial', role: 'group', 'aria-label': field },
      h('span', { class: 'cx-dial-label' }, field === 'likelihood' ? 'Likelihood' : 'Impact'),
      h('div', { class: 'cx-dial-btns' }, opts.map((o) =>
        h('button', { type: 'button', class: `cx-dialbtn${rec[field] === o ? ' on' : ''}`, 'data-val': o, onclick: () => this.setDial(f.id, field, o) }, o))));
    return h('li', { class: 'cx-finding', 'data-finding': f.id },
      h('div', { class: 'cx-f-head' },
        h('span', { class: 'cx-f-cat' }, f.category),
        h('span', { class: 'cx-f-sys' }, f.system),
        derived ? h('span', { class: `cx-chip s${derived}` }, `${derived} risk`) : h('span', { class: 'cx-chip none' }, 'rate it')),
      h('h3', { class: 'cx-f-title' }, f.title),
      h('p', { class: 'cx-f-line' }, h('b', {}, 'Finding: '), f.evidence),
      h('p', { class: 'cx-f-line' }, h('b', {}, 'Business impact: '), f.businessImpact),
      h('div', { class: 'cx-dials' }, dial('likelihood', LIKELIHOOD), dial('impact', IMPACT),
        h('div', { class: 'cx-derived' }, derived ? h('span', { class: `cx-chip s${derived}` }, derived) : h('span', { class: 'cx-derived-none' }, 'severity appears here'))),
      h('div', { class: 'cx-rem' },
        h('span', { class: 'cx-rem-label' }, 'Recommended remediation:'),
        h('div', { class: 'cx-choices' }, f.remediations.map((c) =>
          h('button', { type: 'button', class: `cx-choice${rec.remediation === c.id ? ' chosen' : ''}`, 'data-rem': c.id, onclick: () => this.pickRem(f.id, c.id) }, c.label)))));
  }

  setDial(findingId, field, value) {
    setRisk(this.state, findingId, field, value);
    this.sound2?.play('click');
    this.warn = '';
    this.render();
    this.root.querySelector(`[data-finding="${findingId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  pickRem(findingId, choiceId) {
    setRemediation(this.state, findingId, choiceId);
    this.sound2?.play('click');
    this.warn = '';
    this.render();
    this.root.querySelector(`[data-finding="${findingId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  rateStatus() {
    const c = completeness(this.state);
    return `${c.findingsDone}/${c.findingsTotal} findings rated`;
  }

  toExec() {
    const incomplete = this.scenario.findings.find((f) => {
      const r = this.state.findings[f.id];
      return !r.likelihood || !r.impact || r.remediation == null;
    });
    if (incomplete) {
      this.warn = 'Every finding needs a likelihood, an impact and a remediation before the report can be written.';
      this.sound2?.play('error');
      this.render();
      this.root.querySelector(`[data-finding="${incomplete.id}"]`)?.scrollIntoView({ block: 'center' });
      return;
    }
    this.sound2?.play('select');
    this.state.phase = 'exec';
    this.render();
  }

  // ---- executive summary ----
  renderExec() {
    const tally = severityTally(this.state);
    const panel = h('div', { class: 'cx-wrap' },
      this.head('Executive summary · the part that wins CPTC'),
      this.steps('exec'),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'Your findings at a glance'),
        h('div', { class: 'cx-tally' }, tally.map((t) => h('span', { class: `cx-chip s${t.sev}` }, `${t.count} ${t.sev}`))),
        h('p', { class: 'cx-note' }, 'Now pick the executive summary that goes on page one. Same findings, three ways of telling the board. Only one lets them actually decide.')),
      h('ul', { class: 'cx-execs' }, this.scenario.execSummaries.map((e) => {
        const on = this.state.execChoice === e.id;
        return h('li', { class: `cx-exec${on ? ' chosen' : ''}`, 'data-exec': e.id },
          h('button', { type: 'button', class: 'cx-exec-pick', onclick: () => this.pickExec(e.id) },
            h('span', { class: 'cx-exec-label' }, h('i', { class: `cx-radio${on ? ' on' : ''}`, 'aria-hidden': 'true' }), e.label),
            h('p', { class: 'cx-exec-text' }, e.text)));
      })),
      this.warn ? h('p', { class: 'cx-warn' }, this.warn) : null,
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-ghost', onclick: () => { this.sound2?.play('click'); this.state.phase = 'rate'; this.render(); } }, '← Risk rating'),
        h('button', { type: 'button', class: 'cx-go', 'data-action': 'generate', onclick: () => this.generate() }, 'Generate the report →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Quit')));
    this.root.append(panel);
  }

  pickExec(id) {
    setExec(this.state, id);
    this.sound2?.play('click');
    this.warn = '';
    this.render();
  }

  generate() {
    if (this.state.execChoice == null) {
      this.warn = 'Choose an executive summary first.';
      this.sound2?.play('error');
      return this.render();
    }
    this.grade = scoreReport(this.state);
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.state.phase = 'report';
    this.state.submitted = true;
    this.render();
  }

  // ---- generated report + grade ----
  renderReport() {
    const g = this.grade;
    const exec = g.execChoice;
    const panel = h('div', { class: 'cx-wrap' },
      h('header', { class: 'cx-head' },
        h('div', {}, h('div', { class: 'cx-kicker' }, `Final report · ${this.scenario.client}`), h('div', { class: 'cx-client' }, 'Judged like CPTC')),
        h('div', { class: `cx-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'cx-panel cx-scorecard' },
        h('h1', {}, `Report score: ${g.total} / ${g.max} (${g.pct}%)`),
        h('div', { class: 'cx-dimbars' }, Object.values(g.dims).map((d) =>
          h('div', { class: 'cx-dim' },
            h('div', { class: 'cx-dim-top' }, h('span', {}, d.label), h('b', {}, `${d.pts}/${d.max}`), h('span', { class: 'cx-dim-raw' }, d.raw)),
            h('div', { class: 'cx-dim-bar' }, h('i', { style: { width: `${Math.round((d.pts / d.max) * 100)}%` } }))))),
        h('p', { class: 'cx-verdict' }, this.verdict(g))),
      h('div', { class: 'cx-panel cx-report' },
        h('h2', {}, 'Executive summary'),
        h('p', { class: `cx-report-exec ${exec?.correct ? 'ok' : exec?.partial ? 'warn' : 'bad'}` }, exec?.text || '(none selected)'),
        h('p', { class: 'cx-exec-note' }, exec?.feedback)),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'Findings — risk-ranked'),
        h('p', { class: 'cx-note' }, 'The reference rating (Likelihood × Impact) with your call noted. Green = you matched it, amber = off by one rank, red = re-rate.'),
        h('ol', { class: 'cx-report-findings' }, g.table.map((row) => this.reportRow(row, g)))),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'Rules of engagement, reviewed'),
        h('ul', { class: 'cx-roe-review' }, g.roeResults.map((r) => {
          const d = this.scenario.roe.find((x) => x.id === r.id);
          return h('li', { class: r.correct ? 'ok' : r.credit ? 'warn' : 'bad' },
            h('b', {}, d.title),
            r.choice ? h('p', {}, h('b', {}, 'You chose: '), r.choice.label, ' — ', r.choice.feedback) : h('p', {}, 'Unanswered.'));
        }))),
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-again', onclick: () => this.replay() }, '↻ Rewrite the report'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Done')));
    this.root.append(panel);
  }

  reportRow(row, g) {
    const f = row.finding;
    const rec = this.state.findings[f.id];
    const rem = f.remediations.find((c) => c.id === rec.remediation);
    const mark = row.exact ? 'ok' : row.close ? 'close' : 'miss';
    return h('li', { class: `cx-rep-row ${mark}` },
      h('div', { class: 'cx-rep-head' },
        h('span', { class: `cx-chip s${row.refSev}` }, row.refSev),
        h('span', { class: 'cx-f-sys' }, f.system),
        row.exact ? h('span', { class: 'cx-callok' }, '✓ your rating') : h('span', { class: 'cx-callmiss' }, `you rated ${row.derived || '—'} (${row.likelihood || '?'}×${row.impact || '?'})`)),
      h('h3', { class: 'cx-rep-title' }, f.title),
      h('p', { class: 'cx-rep-line' }, h('b', {}, 'Why this severity: '), f.riskRationale),
      h('p', { class: 'cx-rep-line rem' }, h('b', {}, 'Remediation: '), rem ? rem.label : '(none)', rem && !rem.correct ? h('span', { class: 'cx-rem-flag' }, ` — ${rem.note}`) : rem ? h('span', { class: 'cx-rem-ok' }, ` — ${rem.note}`) : null));
  }

  verdict(g) {
    if (g.pct >= 90) return 'A report a client would pay for and a CPTC team would win with: scoped cleanly, risk-rated defensibly, remediations that fix root causes, and an executive summary the board can act on.';
    if (g.pct >= 75) return 'Strong report. Tighten the risk ratings or remediations flagged below — in CPTC that gap is the difference between second place and first.';
    if (g.pct >= 60) return 'A workable report with real gaps. Check where you inflated or under-rated risk, and whether your remediations fix the root cause or just the symptom.';
    return 'This report would not win. Re-read the risk matrix (severity is likelihood × impact, not a vibe), match remediations to root causes, and lead the summary with business risk. Rewrite it.';
  }

  replay() {
    this.sound2?.play('click');
    this.state = newReport(this.scenario);
    this.flash = {};
    this.warn = '';
    this.render();
  }
}
