import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CPTC_LAB } from '../data/cptcLabScenario.js';
import {
  newReport, runEnum, discoveredFindings, rate, setExecSummary, toReport, expire, score, progress, recordBest,
  severityFor, LEVELS, MODES, lockFinding, gradeText,
} from '../game/cptclab.js';
import '../ui/screen.css';
import '../ui/competitions.css';

// CPTC hands-on scene. The player PLAYS the pentest in a Kali terminal (type recon/exploit commands to discover
// findings), then WRITES the report from what they found — severity on a likelihood×impact matrix plus a
// free-text remediation and executive summary. No multiple-choice: the test itself is played and the report is
// written.
export class CptcLabScene extends Phaser.Scene {
  constructor() { super('CptcLab'); }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenario = data?.scenario || CPTC_LAB;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0710');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true;
    this.phase = 'brief';
    this.deadline = 0;
    this.lastClockText = '';
    this.out = [];
    this.cmdHist = [];
    this.histPos = 0;

    this.root = h('div', { class: 'screen open cptc-screen', id: 'cptclab' });
    document.body.append(this.root);
    document.body.classList.add('portrait-ok');
    this.render();

    const layout = () => placeOnCanvas(this.root, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W, minW: 400 });
    layout();
    this.layout = layout;
    this.canvasRect = '';
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      this.root.remove();
      document.body.classList.remove('portrait-ok');
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());
  }

  update() {
    this.tickClock();
    if (!this.layout) return;
    const r = this.game.canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key !== this.canvasRect) { this.canvasRect = key; this.layout(); }
  }

  exit() { this.deadline = 0; this.sound2?.play('click'); this.scene.start(this.returnTo); }

  render() {
    clear(this.root);
    const ph = this.state?.phase || 'brief';
    if (this.phase !== this.renderedPhase) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
    this.renderedPhase = this.phase;
    if (this.phase === 'brief') this.renderBrief();
    else if (this.phase === 'play' && ph === 'enum') this.renderEnum();
    else if (this.phase === 'play') this.renderReport();
    else this.renderDebrief();
  }

  header(kicker, right) {
    return h('header', { class: 'cx-head' },
      h('div', {}, h('div', { class: 'cx-kicker' }, kicker), h('div', { class: 'cx-org' }, this.scenario.client)),
      right || null);
  }

  clockLabel() { return `${Math.round((this.scenario.clockSeconds || 0) / 60)}-minute`; }

  // ---- brief ---------------------------------------------------------------
  renderBrief() {
    this.root.append(h('div', { class: 'cx-wrap' },
      this.header('CPTC · Red team · the pentest + the report'),
      h('div', { class: 'cx-panel' },
        h('h1', {}, this.scenario.client),
        h('p', { class: 'cx-lede' }, this.scenario.engagement),
        h('p', { class: 'cx-lede' }, 'You play the test, then write the report. First, a Kali terminal: TYPE recon and exploitation commands to find and confirm each weakness. Then switch to the report and write it up — rate every finding you confirmed on a likelihood×impact matrix, write its remediation, and draft the executive summary.'),
        h('div', { class: 'cx-scope' }, h('h2', {}, 'Rules of engagement / scope'), h('ul', {}, this.scenario.scope.map((l) => h('li', {}, l))))),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'How you want to play'),
        h('div', { class: 'cc-mode-row' },
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? ' on' : ''}`, onclick: () => { this.guided = true; this.render(); } },
            h('b', {}, 'Guided'), h('span', {}, 'Hints on what to enumerate next. Lock in each write-up to compare it with the model answer.')),
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? '' : ' on'}`, onclick: () => { this.guided = false; this.render(); } },
            h('b', {}, `Competition · ${this.clockLabel()} clock`), h('span', {}, 'A live countdown across the whole engagement. At 0:00 the report is graded as it stands.')))),
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-go', onclick: () => this.start() }, 'Open the Kali terminal →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Back'))));
  }

  start() {
    this.sound2?.play('select');
    this.state = newReport(this.scenario, { mode: this.guided ? MODES.GUIDED : MODES.COMPETITION });
    this.out = [
      { cls: 'sys', text: `assessor@kali — authorised engagement against ${this.scenario.client}. Simulated; nothing is executed.` },
      { cls: 'sys', text: 'Type "help" for the tools, "scope" for what is in bounds. Recon first: nmap the external range.' },
    ];
    this.cmdHist = [];
    this.histPos = 0;
    this.deadline = this.state.timeLimitSec ? Date.now() + this.state.timeLimitSec * 1000 : 0;
    this.lastClockText = '';
    this.phase = 'play';
    this.render();
  }

  // ---- enumeration terminal ------------------------------------------------
  renderEnum() {
    const p = progress(this.state);
    const input = h('input', { class: 'eg-input', type: 'text', 'aria-label': 'Kali command', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', onkeydown: (e) => this.termKey(e) });
    const screen = h('div', { class: 'eg-out', role: 'log', 'aria-live': 'polite', 'aria-label': 'Kali terminal output' }, this.out.map((l) => h('div', { class: `eg-line ${l.cls || ''}` }, l.text)));
    const term = h('div', { class: 'eg-term', onclick: (e) => { if (!e.target.closest('button')) input.focus(); } },
      screen, h('div', { class: 'eg-cmdline' }, h('span', { class: 'eg-prompt' }, this.scenario.prompt), input));

    const found = discoveredFindings(this.state);
    const side = h('aside', { class: 'cc-dev-side' },
      h('div', { class: 'cc-dev-brief' }, h('b', {}, 'Confirmed findings'), found.length ? h('ul', { class: 'cx-found' }, found.map((f) => h('li', {}, `✓ ${f.title}`))) : h('p', {}, 'None yet. Recon the in-scope range, then enumerate each service.')),
      this.guided ? h('div', { class: 'cc-checklist-box' },
        h('div', { class: 'cc-label' }, 'Try these (click to load)'),
        h('ul', { class: 'cc-check' }, ['nmap -sV 198.51.100.0/24', 'xfreerdp /v:198.51.100.20', "sqlmap -u https://portal.meridian.example/login --data=user=admin", 'nmap 10.20.0.0/16', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example'].map((c) =>
          h('li', {}, h('button', { type: 'button', class: 'cc-check-cmd', onclick: () => { input.value = c; input.focus(); } }, c))))) : h('div', { class: 'cc-checklist-box' }, h('p', { class: 'cc-sec-note' }, 'Competition: no hints. Use the standard tools. "scope" reminds you what is in bounds.')));

    this.root.append(h('div', { class: 'cx-wrap wide' },
      this.header('Phase 1 · enumerate + exploit (Kali terminal)', h('div', { class: 'cx-head-right' }, this.deadline ? this.clockEl() : null, h('span', { class: 'cx-found-count' }, `${p.found}/${p.total} confirmed`))),
      h('div', { class: 'cc-dev-grid' }, h('div', { class: 'cc-term-wrap' }, h('div', { class: 'cx-kicker' }, 'assessor@kali (simulated)'), term), side),
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-go', onclick: () => { toReport(this.state); this.phase = 'play'; this.sound2?.play('select'); this.render(); } }, found.length ? 'Done testing — write the report →' : 'Skip to the report →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Quit'))));

    const sc = this.root.querySelector('.eg-out');
    if (sc) sc.scrollTop = sc.scrollHeight;
    setTimeout(() => input.focus(), 0);
  }

  termKey(e) {
    e.stopPropagation();
    const input = e.currentTarget;
    if (e.key === 'Enter') { e.preventDefault(); this.execCmd(input.value); }
    else if (e.key === 'ArrowUp' && this.cmdHist.length) { e.preventDefault(); this.histPos = Math.max(0, this.histPos - 1); input.value = this.cmdHist[this.histPos] || ''; }
    else if (e.key === 'ArrowDown' && this.cmdHist.length) { e.preventDefault(); this.histPos = Math.min(this.cmdHist.length, this.histPos + 1); input.value = this.cmdHist[this.histPos] || ''; }
    else if (e.key === 'Escape') input.blur();
  }

  execCmd(text) {
    if (text.trim()) { this.cmdHist.push(text.trim()); this.histPos = this.cmdHist.length; }
    const r = runEnum(this.state, text);
    if (r.clear) { this.out = []; this.render(); return; }
    this.out.push({ cls: 'cmd', text: `${this.scenario.prompt} ${text}` });
    for (const l of r.lines) this.out.push(l);
    this.sound2?.play(r.discovered ? 'select' : 'click');
    this.render();
  }

  // ---- report step ---------------------------------------------------------
  renderReport() {
    const found = discoveredFindings(this.state);
    const p = progress(this.state);
    this.root.append(h('div', { class: 'cx-wrap' },
      this.header('Phase 2 · write the report', h('div', { class: 'cx-head-right' }, this.deadline ? this.clockEl() : null, h('span', { class: 'cx-found-count' }, `${p.rated}/${found.length} written up`))),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'Findings you confirmed'),
        h('p', { class: 'cx-sec-note' }, found.length ? 'For each finding you confirmed at the terminal: rate it on the likelihood×impact matrix and write a root-cause remediation. Only findings you actually discovered appear here.' : 'You did not confirm any findings. Go back and run the test — there is nothing to report.'),
        h('ul', { class: 'cx-report-list' }, found.map((f) => this.reportCard(f)))),
      h('div', { class: 'cx-panel' },
        h('h2', {}, 'Executive summary'),
        h('p', { class: 'cx-sec-note' }, 'The part the board reads. Lead with business risk and the critical issues in plain language; give them an action and an outcome.'),
        this.execField()),
      h('div', { class: 'cx-foot' },
        found.length ? h('button', { type: 'button', class: 'cx-quit', onclick: () => { this.state.phase = 'enum'; this.render(); } }, '← Back to the terminal') : null,
        h('button', { type: 'button', class: 'cx-go', onclick: () => this.finish() }, 'Submit the report →'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Quit'))));
  }

  reportCard(f) {
    const r = this.state.report[f.id];
    const sev = r.likelihood && r.impact ? severityFor(r.likelihood, r.impact) : null;
    const picker = (field) => h('div', { class: 'cx-rate' }, h('span', { class: 'cx-rate-label' }, field === 'likelihood' ? 'Likelihood' : 'Impact'),
      h('div', { class: 'cx-rate-btns' }, LEVELS.map((lvl) => h('button', { type: 'button', class: `cx-rate-btn${r[field] === lvl ? ' on' : ''}`, disabled: r.locked ? '' : undefined, onclick: () => { rate(this.state, f.id, field, lvl); this.render(); } }, lvl))));
    const ta = h('textarea', { class: 'cc-inj-ta', rows: '2', 'aria-label': `Remediation for ${f.title}`, placeholder: 'Write the root-cause remediation: which control fixes it, not just "fix it"…', disabled: r.locked ? '' : undefined, oninput: (e) => { rate(this.state, f.id, 'remediation', e.target.value); } }, r.remediation || '');
    const err = this.lockErr?.[f.id];
    return h('li', { class: 'cx-report-card' },
      h('div', { class: 'cx-rc-head' }, h('b', {}, f.title), h('span', { class: 'cx-rc-sys' }, f.system)),
      h('p', { class: 'cx-rc-ev' }, h('b', {}, 'Evidence: '), f.evidence),
      h('div', { class: 'cx-rate-row' }, picker('likelihood'), picker('impact'), sev ? h('span', { class: `cx-sevtag s-${sev.toLowerCase()}` }, sev) : h('span', { class: 'cx-sevtag none' }, 'rate it')),
      ta,
      // Guided mode: the model answer is revealed only AFTER the player commits their own rating + remediation.
      this.guided && !r.locked ? h('button', { type: 'button', class: 'cx-lock', onclick: () => this.lock(f.id) }, 'Lock in & compare with the model') : null,
      err ? h('p', { class: 'cc-flash bad', role: 'alert' }, err) : null,
      this.guided && r.locked ? this.remFeedback(f, gradeText(f.remediationRubric, r.remediation)) : null);
  }

  lock(id) {
    const res = lockFinding(this.state, id);
    this.lockErr = this.lockErr || {};
    if (!res.ok) { this.lockErr[id] = res.error; this.sound2?.play('error'); } else { delete this.lockErr[id]; this.sound2?.play('select'); }
    this.render();
  }

  remFeedback(f, g) {
    return h('div', { class: 'cx-rem-feedback' },
      h('p', { class: 'cx-rc-model' }, h('b', {}, 'Model rating: '), `${severityFor(f.refLikelihood, f.refImpact)} (${f.refLikelihood}×${f.refImpact}).`),
      h('div', { class: 'cc-rubric' },
        h('p', { class: 'cc-rubric-score' }, h('b', {}, `Remediation: ${Math.round(g.credit * 100)}%`), ` — ${g.hits.length}/${g.hits.length + g.missing.length} required controls`),
        g.hits.length ? h('ul', { class: 'cc-rubric-list ok' }, g.hits.map((t) => h('li', {}, `✓ ${t}`))) : null,
        g.missing.length ? h('ul', { class: 'cc-rubric-list bad' }, g.missing.map((t) => h('li', {}, `✗ missing: ${t}`))) : null,
        g.wrong.length ? h('ul', { class: 'cc-rubric-list bad' }, g.wrong.map((t) => h('li', {}, `✗ wrong control: ${t}`))) : null),
      h('p', { class: 'cx-rc-model' }, h('b', {}, 'Model remediation: '), f.modelRemediation));
  }

  execField() {
    const ta = h('textarea', { class: 'cc-inj-ta', rows: '4', 'aria-label': 'Executive summary', placeholder: 'Draft the executive summary…', oninput: (e) => setExecSummary(this.state, e.target.value) }, this.state.execSummary || '');
    // The model summary is shown in the debrief, after submission — never next to the box you are writing in.
    return h('div', {}, ta);
  }

  // ---- clock ---------------------------------------------------------------
  remainingMs() { return this.deadline ? Math.max(0, this.deadline - Date.now()) : 0; }
  fmtClock(ms) { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
  clockEl() {
    const ms = this.remainingMs();
    return h('div', { class: `cc-clock${ms <= 120000 ? ' low' : ''}`, role: 'timer', 'aria-label': 'Time left' }, h('span', { class: 'cc-clock-label' }, 'Time left'), h('b', { class: 'cc-clock-val' }, this.fmtClock(ms)));
  }

  tickClock() {
    if (!this.deadline || this.phase !== 'play') return;
    const ms = this.remainingMs();
    if (ms <= 0) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finish(); return; }
    const text = this.fmtClock(ms);
    if (text === this.lastClockText) return;
    this.lastClockText = text;
    const el = this.root?.querySelector('.cc-clock');
    if (el) { el.querySelector('.cc-clock-val').textContent = text; el.classList.toggle('low', ms <= 120000); }
  }

  finish() {
    this.deadline = 0;
    this.grade = score(this.state);
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.phase = 'debrief';
    this.render();
  }

  // ---- debrief -------------------------------------------------------------
  renderDebrief() {
    const g = this.grade;
    this.root.append(h('div', { class: 'cx-wrap' },
      h('header', { class: 'cx-head' },
        h('div', {}, h('div', { class: 'cx-kicker' }, `Engagement over · ${this.scenario.client}`), h('div', { class: 'cx-org' }, 'Report graded')),
        h('div', { class: `cc-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'cx-panel cx-scorecard' },
        h('h1', {}, 'Report scorecard'),
        this.timedOut ? h('p', { class: 'cc-timeout' }, '⏱ Time ran out. The report was graded as it stood at 0:00.') : null,
        h('div', { class: 'cc-tally' },
          this.tallyRow('Coverage', `+${g.coverage}`, `${g.foundCount}/${g.totalFindings} findings confirmed at the terminal`, g.coverage >= 25 ? 'ok' : 'bad'),
          this.tallyRow('Risk rating', `+${g.risk}`, 'severity vs the reference matrix', g.risk >= 20 ? 'ok' : 'bad'),
          this.tallyRow('Remediation', `+${g.remediation}`, 'the root-cause controls each finding needs', g.remediation >= 18 ? 'ok' : 'bad'),
          this.tallyRow('Executive summary', `+${g.exec}`, g.execOk ? 'business risk, both criticals, a timeframe' : 'missing what the board needs', g.exec ? 'ok' : 'bad'),
          h('div', { class: 'cc-tally-row total' }, h('span', {}, 'Total'), h('b', {}, `${g.pct}`), h('span', {}, `of 100 · ${g.pct}%`))),
        h('p', { class: 'cc-verdict' }, this.verdict(g))),
      g.ratingRows.length ? h('div', { class: 'cx-panel' },
        h('h2', {}, 'Your risk ratings vs the reference'),
        h('ul', { class: 'cc-review' }, g.ratingRows.map((r) => h('li', { class: r.credit === 1 ? 'ok' : r.credit ? 'warn' : 'bad' },
          h('div', { class: 'cx-rev-head' }, h('b', {}, r.title), h('span', {}, `you: ${r.yours || '—'} · reference: ${r.ref}`)),
          h('p', {}, r.credit === 1 ? 'Rated correctly.' : r.credit ? 'One step off — close.' : 'Off by two or more, or unrated. Re-read likelihood × impact.'))))) : null,
      g.remRows.length ? h('div', { class: 'cx-panel cx-rem-review' },
        h('h2', {}, 'Your remediations, graded'),
        h('ul', { class: 'cc-review' }, g.remRows.map((r) => {
          const f = this.scenario.findings.find((x) => x.id === r.id);
          return h('li', { class: r.credit >= 0.99 ? 'ok' : r.credit > 0 ? 'warn' : 'bad', 'data-rem': r.id },
            h('div', { class: 'cx-rev-head' }, h('b', {}, r.title), h('span', {}, `${Math.round(r.credit * 100)}% of the controls`)),
            h('p', {}, h('b', {}, 'You wrote: '), r.text || '(nothing)'),
            r.missing.length ? h('p', {}, h('b', {}, 'Missing: '), r.missing.join('; ')) : null,
            r.wrong.length ? h('p', {}, h('b', {}, 'Wrong control: '), r.wrong.join('; ')) : null,
            h('p', { class: 'cc-fix' }, h('b', {}, 'Model: '), f.modelRemediation));
        }))) : null,
      h('div', { class: 'cx-panel cx-exec-review' },
        h('h2', {}, 'Executive summary, graded'),
        h('p', {}, h('b', {}, `${g.exec}/10 · `), g.execGrade.hits.length ? `covered: ${g.execGrade.hits.join('; ')}` : 'covered nothing the board needs'),
        g.execGrade.missing.length ? h('p', {}, h('b', {}, 'Missing: '), g.execGrade.missing.join('; ')) : null,
        g.execGrade.wrong.length ? h('p', {}, h('b', {}, 'Cost points: '), g.execGrade.wrong.join('; ')) : null,
        h('p', { class: 'cc-fix' }, h('b', {}, 'What wins: '), this.scenario.execModel)),
      this.scenario.findings.length > g.foundCount ? h('div', { class: 'cx-panel' },
        h('h2', {}, 'What you missed'),
        h('ul', { class: 'cc-review' }, this.scenario.findings.filter((f) => !this.state.discovered[f.id]).map((f) => h('li', { class: 'bad' },
          h('div', { class: 'cx-rev-head' }, h('b', {}, f.title), h('span', {}, f.system)),
          h('p', {}, f.evidence))))) : null,
      h('div', { class: 'cx-foot' },
        h('button', { type: 'button', class: 'cx-again', onclick: () => { this.phase = 'brief'; this.render(); } }, '↻ Run it again'),
        h('button', { type: 'button', class: 'cx-quit', onclick: () => this.exit() }, 'Done'))));
  }

  tallyRow(label, value, sub, tone) {
    return h('div', { class: `cc-tally-row ${tone}` }, h('span', {}, label), h('b', {}, value), h('span', { class: 'cc-tally-sub' }, sub));
  }

  verdict(g) {
    if (g.pct >= 90) return 'A report that wins CPTC: you found the issues at the keyboard, rated them honestly, and wrote fixes and a summary a board can act on.';
    if (g.pct >= 75) return 'Strong. Either you missed a finding in enumeration or a severity rating drifted from the matrix — tighten both.';
    if (g.pct >= 60) return 'A real first pass. The biggest lever is coverage: the findings you never confirmed at the terminal cannot be in the report.';
    return 'Thin report. Go back and actually run the test — enumerate every in-scope service — then rate and write up everything you confirm.';
  }
}
