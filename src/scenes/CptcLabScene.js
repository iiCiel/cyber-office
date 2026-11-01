import Phaser from 'phaser';
import { h, clear } from '../ui/dom.js';
import { CPTC_LAB } from '../data/cptcLabScenario.js';
import { CPTC_SCENARIOS } from '../data/cptcScenarios.js';
import { newReport, runEnum, discoveredFindings, toReport, expire, score, progress, recordBest, MODES } from '../game/cptclab.js';
import { TermView } from '../ui/ccdc/TermView.js';
import { Desktop } from '../ui/cptc/desktop.js';
import { ReportDoc } from '../ui/cptc/report.js';
import { renderBrief, renderDebrief } from '../ui/cptc/documents.js';
import { fmtClock, findingNo, splitScope } from '../ui/cptc/helpers.js';
import '../ui/cptc/cptc.css';

// CPTC hands-on scene, drawn as a Kali Linux desktop. The player PLAYS the pentest in a QTerminal window (type
// recon/exploit commands to discover findings), keeps notes in a Mousepad-style window, and WRITES the report in a
// document window. Everything the game decides (discovery, rating, grading) lives in game/cptclab.js.
const HINTS = ['nmap -sV 198.51.100.0/24', 'xfreerdp /v:198.51.100.20', 'sqlmap -u https://portal.meridian.example/login --data=user=admin', 'nmap 10.20.0.0/16', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example'];
const COMPLETE = ['nmap', 'sqlmap', 'smbclient', 'snmpwalk', 'sslscan', 'xfreerdp', 'help', 'scope', 'found', 'clear'];

export class CptcLabScene extends Phaser.Scene {
  constructor() { super('CptcLab'); }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenarios = CPTC_SCENARIOS;
    this.scenario = data?.scenario || this.scenarios[0] || CPTC_LAB;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0710');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true;
    this.phase = 'brief';
    this.deadline = 0;
    this.lastClockText = '';
    this.timedOut = false;

    this.root = h('div', { class: 'kx', id: 'cptclab' });
    document.body.append(this.root);
    document.body.classList.add('portrait-ok');
    this.render();

    this.events.once('shutdown', () => {
      this.desk?.destroy();
      this.root.remove();
      document.body.classList.remove('portrait-ok');
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());
  }

  update() { this.tickClock(); }

  exit() { this.deadline = 0; this.sound2?.play('click'); this.scene.start(this.returnTo); }

  render() {
    this.desk?.destroy();
    this.desk = null;
    clear(this.root);
    this.root.classList.toggle('kx-playing', this.phase === 'play');
    if (this.phase === 'brief') this.root.append(this.briefView());
    else if (this.phase === 'play') this.buildDesk();
    else this.root.append(this.debriefView());
    if (this.phase !== this.renderedPhase) window.scrollTo(0, 0);
    this.renderedPhase = this.phase;
  }

  clockLabel() { return `${Math.round((this.scenario.clockSeconds || 0) / 60)}-minute`; }

  // ---- brief: the rules-of-engagement letter -------------------------------
  briefView() {
    return renderBrief({
      scenario: this.scenario, scenarios: this.scenarios, guided: this.guided, clockLabel: this.clockLabel(),
      onPick: (sc) => { this.scenario = sc; this.render(); },
      onMode: (g) => { this.guided = g; this.render(); },
      onBegin: () => this.start(),
      onBack: () => this.exit(),
    });
  }

  start() {
    this.sound2?.play('select');
    this.state = newReport(this.scenario, { mode: this.guided ? MODES.GUIDED : MODES.COMPETITION });
    this.termBuf = [
      { cls: 'sys', text: `Authorised engagement against ${this.scenario.client}. Simulated: nothing is executed.` },
      { cls: 'sys', text: 'Type "help" for the tools and "scope" for what is in bounds. Recon first: nmap the external range.' },
    ];
    this.cmdHist = [];
    this.deadline = this.state.timeLimitSec ? Date.now() + this.state.timeLimitSec * 1000 : 0;
    this.lastClockText = '';
    this.timedOut = false;
    this.phase = 'play';
    this.render();
  }

  // ---- the desktop ---------------------------------------------------------
  buildDesk() {
    const desk = new Desktop({ menuExtra: [{ label: 'Log Out (quit engagement)', run: () => this.exit() }] });
    this.desk = desk;
    this.root.append(desk.el);

    this.term = new TermView({
      theme: 'kali', prompt: () => 'kali㉿kali ~', label: 'Kali terminal', buffer: this.termBuf, history: this.cmdHist, complete: COMPLETE,
      run: (line) => this.runLine(line),
    });
    const termBody = h('div', { class: 'kx-termwrap' }, h('div', { class: 'kx-termmenu', 'aria-hidden': 'true' }, ['File', 'Edit', 'View', 'Terminal', 'Help'].map((m) => h('span', {}, m))), this.term.el);
    this.notesBody = h('div', { class: 'kx-notes' });
    this.report = new ReportDoc({ getState: () => this.state, scenario: this.scenario, guided: this.guided, sound: this.sound2, onSubmit: () => this.finish() });

    const termW = (a) => Math.round(Math.min(a.w * 0.52, 720));
    desk.addWindow({ id: 'term', title: 'kali@kali: ~', glyph: '>_', body: termBody, menuLabel: 'Terminal Emulator',
      geom: (a) => ({ x: 84, y: 14, w: termW(a), h: a.h - 30 }) });
    desk.addWindow({ id: 'notes', title: 'engagement-notes.txt - Mousepad', glyph: 'N', body: this.notesBody, menuLabel: 'Mousepad (engagement notes)',
      geom: (a) => { const x = 84 + termW(a) + 14; return { x, y: 14, w: Math.max(300, a.w - x - 14), h: Math.min(a.h - 30, 470) }; } });
    const rw = desk.addWindow({ id: 'report', title: 'Penetration Test Report - draft', glyph: 'R', body: this.report.el, state: 'min', menuLabel: 'Report (document viewer)',
      geom: (a) => { const w = Math.min(a.w - 40, 940); return { x: Math.round((a.w - w) / 2), y: 10, w, h: a.h - 20 }; } });
    rw.onOpen = () => { toReport(this.state); this.report.refresh(); };

    this.refreshNotes();
    this.updateStatus();
    desk.open('term');
    setTimeout(() => this.term?.focus(), 0);
  }

  runLine(line) {
    const r = runEnum(this.state, line);
    if (r.clear) return { clear: true };
    this.sound2?.play(r.discovered ? 'select' : 'click');
    if (r.discovered) { this.refreshNotes(); this.report.refresh(); this.updateStatus(); }
    return { lines: r.lines };
  }

  refreshNotes() {
    const sc = this.scenario;
    const found = discoveredFindings(this.state);
    const scope = splitScope(sc.scope);
    const lines = [
      `ENGAGEMENT NOTES - ${sc.client}`,
      '='.repeat(Math.min(48, 19 + sc.client.length)),
      ...scope.inScope.map((t) => `in scope : ${t}`),
      ...scope.outOfScope.map((t) => `OUT      : ${t}`),
      '',
      `CONFIRMED FINDINGS (${found.length}/${sc.findings.length})`,
      '-'.repeat(30),
    ];
    const body = [];
    if (!found.length) body.push(h('div', { class: 'kx-nl dim' }, '(none yet - recon the range, then enumerate each service)'));
    found.forEach((f, i) => {
      body.push(h('div', { class: 'kx-nl kx-nfinding', 'data-f': f.id }, `[x] ${findingNo(i)}  ${f.title}`));
      body.push(h('div', { class: 'kx-nl dim' }, `      host: ${f.system}`));
      body.push(h('div', { class: 'kx-nl dim' }, `      ${f.evidence}`));
    });
    const hints = this.guided ? [
      h('div', { class: 'kx-nl' }, ''), h('div', { class: 'kx-nl' }, 'TODO / methodology (click to load into the terminal)'), h('div', { class: 'kx-nl' }, '-'.repeat(30)),
      HINTS.map((c) => h('button', { type: 'button', class: 'kx-hint', onclick: () => { this.desk.open('term'); this.term.setInput(c); } }, `[ ] ${c}`)),
    ] : [h('div', { class: 'kx-nl' }, ''), h('div', { class: 'kx-nl dim' }, 'Competition mode: no hints. "scope" in the terminal restates the rules.')];
    clear(this.notesBody).append(
      h('div', { class: 'kx-nmenu', 'aria-hidden': 'true' }, ['File', 'Edit', 'Search', 'View', 'Document', 'Help'].map((m) => h('span', {}, m))),
      h('div', { class: 'kx-ntext' }, lines.map((l) => h('div', { class: 'kx-nl' }, l || ' ')), body, hints),
      h('div', { class: 'kx-nstat' }, h('span', {}, `Ln ${lines.length + body.length}, Col 1`), h('span', {}, 'Plain Text')));
  }

  updateStatus() {
    const p = progress(this.state);
    this.desk.setStatus(
      this.deadline ? h('span', { class: `kx-timer${this.remainingMs() <= 120000 ? ' low' : ''}`, role: 'timer', 'aria-label': 'Time left' }, 'Time left ', h('b', { class: 'kx-timer-val' }, fmtClock(this.remainingMs()))) : null,
      h('span', { class: 'kx-found-count' }, `${p.found}/${p.total} confirmed`));
  }

  // ---- clock ---------------------------------------------------------------
  remainingMs() { return this.deadline ? Math.max(0, this.deadline - Date.now()) : 0; }

  tickClock() {
    if (!this.deadline || this.phase !== 'play') return;
    const ms = this.remainingMs();
    if (ms <= 0) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finish(); return; }
    const text = fmtClock(ms);
    if (text === this.lastClockText) return;
    this.lastClockText = text;
    const el = this.root?.querySelector('.kx-timer');
    if (el) { el.querySelector('.kx-timer-val').textContent = text; el.classList.toggle('low', ms <= 120000); }
  }

  finish() {
    this.deadline = 0;
    this.grade = score(this.state);
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.phase = 'debrief';
    this.render();
  }

  // ---- debrief: the report review sheet ------------------------------------
  debriefView() {
    return renderDebrief({
      scenario: this.scenario, state: this.state, grade: this.grade, timedOut: this.timedOut, verdict: this.verdict(this.grade),
      onAgain: () => { this.phase = 'brief'; this.render(); },
      onDone: () => this.exit(),
    });
  }

  verdict(g) {
    if (g.pct >= 90) return 'A report that wins CPTC: you found the issues at the keyboard, rated them honestly, and wrote fixes and a summary a board can act on.';
    if (g.remediation < 15) return 'Your remediations do not name the controls that actually fix each finding. Read "Missing" under each one below: that is where the points went.';
    if (g.pct >= 75) return 'Strong. Either you missed a finding in enumeration or a severity rating drifted from the matrix; tighten both.';
    if (g.pct >= 60) return 'A real first pass. The biggest lever is coverage: the findings you never confirmed at the terminal cannot be in the report.';
    return 'Thin report. Go back and actually run the test, enumerating every in-scope service, then rate and write up everything you confirm.';
  }
}
