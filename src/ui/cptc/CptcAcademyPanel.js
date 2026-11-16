// Learn mode for the offensive side: a coach beside the Kali desktop. It explains, points at what to run, then
// checks the engine to see the finding was really confirmed, the rating matches the matrix, or the write-up covers
// the right controls. Progress is per browser; the game plays correctly without it.
import { h, clear } from '../dom.js';
import { LESSONS, SHEET, sheetHtml, EXAMS, examGoals, studyNext } from '../../data/cptcAcademy.js';
import { QUIZ } from '../../data/cptcQuiz.js';
import { gradeText, severityFor, LEVELS } from '../../game/cptclab.js';
import '../ccdc/academy.css';
import './cptcacademy.css';

const KEY = 'cyber-office.cptc.academy';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* works without it */ } };
const stop = (e) => e.stopPropagation();

export class CptcAcademyPanel {
  constructor({ host }) {
    this.host = host;
    this.progress = load();
    this.tab = 'lessons';
    this.lesson = null;
    this.exam = null;
    this.body = h('div', { class: 'ac-body' });
    this.tabs = h('div', { class: 'ac-tabs' });
    this.collapse = h('button', { type: 'button', class: 'ac-collapse', 'aria-label': 'Hide coach', onclick: () => this.toggle() }, '>');
    this.el = h('aside', { class: 'ac ac-kx', 'data-academy': '', onkeydown: stop, onkeyup: stop }, h('div', { class: 'ac-head' }, this.collapse, h('b', {}, 'Coach'), this.tabs), this.body);
    this.draw();
  }

  toggle() { const hidden = this.el.classList.toggle('ac-hidden'); this.collapse.textContent = hidden ? '<' : '>'; this.host.onToggle?.(hidden); }

  draw() {
    clear(this.tabs).append(...[['lessons', 'Lessons'], ['exams', 'Exams'], ['quiz', 'Quiz'], ['sheet', 'Sheet']].map(([id, t]) => h('button', { type: 'button', class: `ac-tab${this.tab === id ? ' on' : ''}`, 'data-actab': id, onclick: () => { this.tab = id; this.exam = null; this.draw(); } }, t)));
    clear(this.body);
    if (this.tab === 'sheet') this.drawSheet();
    else if (this.tab === 'quiz') this.drawQuiz();
    else if (this.tab === 'exams') { if (this.exam) this.drawExam(); else this.drawExams(); }
    else if (this.lesson) this.drawStep();
    else this.drawList();
  }

  doneCount() { return LESSONS.filter((l) => this.progress[l.id]).length; }

  drawList() {
    const n = this.doneCount();
    this.body.append(
      h('p', { class: 'ac-intro' }, 'Do these in order. Every step runs in the real Kali terminal, and nothing is executed anywhere.'),
      h('div', { class: 'ac-prog', role: 'progressbar', 'aria-valuenow': String(n), 'aria-valuemax': String(LESSONS.length) }, h('i', { style: { width: `${(n / LESSONS.length) * 100}%` } })),
      h('div', { class: 'ac-progtext' }, `${n} of ${LESSONS.length} lessons done`),
      h('ol', { class: 'ac-list' }, LESSONS.map((l) => h('li', {}, h('button', { type: 'button', class: `ac-item${this.progress[l.id] ? ' done' : ''}`, 'data-lesson': l.id, onclick: () => this.start(l) }, h('span', {}, l.title), h('small', {}, this.progress[l.id] ? 'done' : `${l.mins} min`))))));
  }

  start(lesson) { this.lesson = lesson; this.i = -1; this.host.startLesson(lesson); this.next(); }

  next() {
    this.i += 1;
    const s = this.step();
    if (!s) { this.progress[this.lesson.id] = true; save(this.progress); this.lesson = null; this.draw(); return; }
    this.complete = false; this.revealed = false; this.answered = null; this.feedback = null; this.draft = null; this.logMark = this.host.logSize();
    if (s.open) this.host.showTerm();
    if (s.rate) this.host.showReport?.();
    this.check();
    this.drawStep();
  }

  step() { return this.lesson?.steps[this.i]; }
  ctx() { return this.host.ctx(this.logMark); }
  typed(s) { return typeof s.type === 'function' ? s.type(this.ctx().st) : s.type; }
  scenario() { return this.ctx().st.scenario; }
  finding(id) { return this.scenario().findings.find((f) => f.id === id); }

  check() {
    const s = this.step();
    if (!s || this.complete) return false;
    if (s.ask || s.write || s.rate) return false;
    if (!s.type && !s.done) { this.complete = true; return true; }
    const c = this.ctx();
    let ok = false;
    try { ok = s.done ? s.done(c) : s.discovers ? c.found(s.discovers) : c.ran(s.match || this.typed(s)); } catch { ok = false; }
    if (ok) this.complete = true;
    return ok;
  }

  drawStep() {
    clear(this.body);
    const s = this.step();
    const L = this.lesson;
    this.body.append(h('div', { class: 'ac-crumb' }, h('button', { type: 'button', class: 'ac-back', onclick: () => { this.lesson = null; this.draw(); } }, '< All lessons'), h('span', {}, `${this.i + 1} / ${L.steps.length}`)), h('h3', {}, L.title));
    if (s.say) for (const p of s.say.split('\n\n')) this.body.append(h('p', { class: 'ac-say' }, p));
    const cmd = s.type ? this.typed(s) : null;
    if (cmd && !this.complete) {
      if (s.drill && !this.revealed) this.body.append(h('button', { type: 'button', class: 'ac-show', 'data-reveal': '', onclick: () => { this.revealed = true; this.drawStep(); } }, 'I am stuck. Show me'));
      else {
        this.body.append(h('div', { class: 'ac-cmdlabel' }, 'Run this:'), h('code', { class: 'ac-cmd' }, cmd));
        if (s.parts) this.body.append(h('table', { class: 'ac-parts' }, h('tbody', {}, s.parts.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b))))));
        this.body.append(h('button', { type: 'button', class: 'ac-load', 'data-load': '', onclick: () => this.host.load(cmd) }, 'Put it in the terminal for me'));
      }
    }
    if (s.look && (cmd ? this.complete : true)) this.body.append(h('p', { class: 'ac-look' }, h('b', {}, 'Look at: '), s.look));
    if (s.ask) this.drawAsk(s);
    if (s.rate) this.drawRate(s);
    if (s.write) this.drawWrite(s);
    if (this.feedback) this.body.append(h('p', { class: 'ac-bad' }, this.feedback));
    if (this.complete) {
      if (s.after) this.body.append(h('p', { class: 'ac-after' }, s.after));
      this.body.append(h('button', { type: 'button', class: 'ac-next', 'data-next': '', onclick: () => this.next() }, this.i === L.steps.length - 1 ? 'Finish lesson' : 'Next'));
    } else if (s.type && !s.ask && !s.rate && !s.write) this.body.append(h('p', { class: 'ac-wait' }, 'Waiting for you to run this...'));
    this.body.scrollTop = 0;
  }

  drawAsk(s) {
    const input = h('input', { class: 'ac-input', 'aria-label': 'Your answer', 'data-answer': '', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); } });
    const go = () => {
      const re = typeof s.ask.a === 'function' ? s.ask.a(this.ctx().st) : s.ask.a;
      if (re.test(input.value.trim())) { this.complete = true; this.answered = 'ok'; } else this.answered = 'no';
      this.drawStep();
    };
    this.body.append(h('p', { class: 'ac-q' }, s.ask.q));
    if (this.complete) { this.body.append(h('p', { class: 'ac-after' }, `Right. ${s.ask.why}`)); return; }
    this.body.append(input, h('button', { type: 'button', class: 'ac-check', 'data-check': '', onclick: go }, 'Check'));
    if (this.answered === 'no') this.body.append(h('p', { class: 'ac-bad' }, s.ask.seen ? 'Not that. Read the terminal output again.' : 'Not quite. Try again.'));
    setTimeout(() => input.focus(), 0);
  }

  drawRate(s) {
    const f = this.finding(s.rate.finding);
    const r = this.ctx().st.report[f.id];
    const row = (field) => h('div', { class: 'ac-raterow' }, h('span', {}, field === 'likelihood' ? 'Likelihood' : 'Impact'),
      LEVELS.map((v) => h('button', { type: 'button', class: `ac-rbtn${r[field] === v ? ' on' : ''}`, 'data-rate': `${field}:${v}`, onclick: () => { this.host.rate(f.id, field, v); this.drawStep(); } }, v)));
    this.body.append(h('p', { class: 'ac-q' }, `Rate: ${f.title}`), row('likelihood'), row('impact'));
    const sev = r.likelihood && r.impact ? severityFor(r.likelihood, r.impact) : null;
    const ref = severityFor(f.refLikelihood, f.refImpact);
    if (sev) {
      this.body.append(h('p', { class: 'ac-sev' }, 'That gives severity: ', h('b', {}, sev)));
      if (sev === ref) { this.complete = true; this.body.append(h('p', { class: 'ac-after' }, `Matches the reference (${ref}).`)); }
      else this.body.append(h('p', { class: 'ac-bad' }, `The reference is ${ref}. Reconsider how likely real exploitation is, and how bad the outcome.`));
    }
  }

  drawWrite(s) {
    const exec = !!s.write.exec;
    const f = exec ? null : this.finding(s.write.finding);
    const prompt = exec ? 'Executive summary' : `Remediation for: ${f.title}`;
    if (this.draft == null) this.draft = '';
    const ta = h('textarea', { class: 'ac-ta', 'aria-label': prompt, 'data-write': '', oninput: () => { this.draft = ta.value; } });
    ta.value = this.draft;
    this.body.append(h('p', { class: 'ac-q' }, prompt), ta);
    if (this.complete) { this.body.append(h('p', { class: 'ac-after' }, exec ? 'Good enough for the board.' : `Covers the controls. Model: ${f.modelRemediation}`)); return; }
    this.body.append(h('button', { type: 'button', class: 'ac-check', 'data-grade': '', onclick: () => {
      const rubric = exec ? this.scenario().execRubric : f.remediationRubric;
      const g = gradeText(rubric, ta.value);
      this.complete = g.credit >= (s.write.pass || 0.6);
      this.feedback = this.complete ? null : (g.missing.length ? `Missing: ${g.missing.join('; ')}.` : 'Name the specific controls.') + (g.wrong.length ? ` Wrong control: ${g.wrong.join('; ')}.` : '');
      this.drawStep();
    } }, 'Grade my write-up'));
  }

  // ---- exams ------------------------------------------------------------------------------------------------
  mmss(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  drawExams() {
    this.body.append(h('p', { class: 'ac-intro' }, 'A full engagement with no hints and the clock running. Find every issue, rate it, and write the summary. Beat the target, then do the others.'));
    for (const x of EXAMS) {
      const best = this.progress[`best-${x.id}`];
      this.body.append(h('button', { type: 'button', class: 'ac-item', 'data-exam': x.id, onclick: () => this.startExam(x) }, h('span', {}, x.title, h('br'), h('small', {}, x.blurb)), h('small', {}, best ? `best ${this.mmss(best)}` : `target ${x.minutes} min`)));
    }
  }

  startExam(x) { this.exam = x; this.examStart = Date.now(); this.examDone = null; this.logMark = this.host.logSize(); this.host.startLesson(x); this.host.showTerm(); this.draw(); }

  examGoalList() {
    const c = this.ctx();
    return examGoals(this.exam, c.st.scenario).map((g) => { let ok = false; try { ok = !!g.done(c); } catch { /* not yet */ } return { text: g.text, ok }; });
  }

  drawExam() {
    const x = this.exam;
    const goals = this.examGoalList();
    const n = goals.filter((g) => g.ok).length;
    const sec = this.examDone ?? (Date.now() - this.examStart) / 1000;
    this.examKey = goals.map((g) => (g.ok ? 1 : 0)).join('');
    this.examClock = h('div', { class: 'ac-clock', 'data-exam-clock': '' }, `${this.mmss(sec)} / ${x.minutes}:00`);
    this.body.append(h('button', { type: 'button', class: 'ac-back', onclick: () => { this.exam = null; this.draw(); } }, '< All exams'), h('h3', {}, x.title), this.examClock,
      h('div', { class: 'ac-progtext' }, `${n} of ${goals.length}`),
      h('ul', { class: 'ac-goals' }, goals.map((g) => h('li', { class: g.ok ? 'ok' : '' }, g.text))),
      h('p', { class: 'ac-intro' }, 'Open the Report window to rate findings and write the summary.'));
    if (n === goals.length && this.examDone == null) {
      this.examDone = sec;
      const key = `best-${x.id}`;
      if (!this.progress[key] || sec < this.progress[key]) { this.progress[key] = sec; save(this.progress); }
      this.body.append(h('p', { class: 'ac-after', 'data-exam-done': '' }, sec <= x.minutes * 60 ? 'Passed inside the target.' : 'All done, but past the target. Run it again.'));
    } else if (this.examDone != null) this.body.append(h('p', { class: 'ac-after', 'data-exam-done': '' }, 'Finished.'));
  }

  // ---- quiz -------------------------------------------------------------------------------------------------
  pickQuiz() {
    const seen = this.progress.quiz || {};
    const score = (x) => (seen[x.q]?.ok || 0) - 2 * (seen[x.q]?.bad || 0) + Math.random();
    this.quizItem = [...QUIZ].filter((x) => x !== this.quizItem).sort((a, b) => score(a) - score(b))[0];
    this.quizResult = null;
  }

  drawQuiz() {
    if (!this.quizItem) this.pickQuiz();
    const x = this.quizItem;
    const seen = this.progress.quiz || {};
    const known = QUIZ.filter((i) => (seen[i.q]?.ok || 0) > (seen[i.q]?.bad || 0)).length;
    const input = h('input', { class: 'ac-input', 'aria-label': 'Your answer', 'data-quiz-answer': '', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') (this.quizResult ? next : go)(); } });
    const go = () => {
      const ok = x.a.test(input.value.trim());
      const all = (this.progress.quiz ||= {});
      const r = (all[x.q] ||= { ok: 0, bad: 0 });
      if (ok) r.ok += 1; else r.bad += 1;
      save(this.progress);
      this.quizResult = ok ? 'ok' : 'no';
      this.draw();
    };
    const next = () => { this.pickQuiz(); this.draw(); };
    this.body.append(h('p', { class: 'ac-intro' }, `Mistakes come back more often. ${known} of ${QUIZ.length} known.`), h('p', { class: 'ac-tag' }, x.tag), h('p', { class: 'ac-q' }, x.q));
    if (this.quizResult) {
      this.body.append(h('p', { class: this.quizResult === 'ok' ? 'ac-after' : 'ac-bad' }, this.quizResult === 'ok' ? 'Right.' : `Answer: ${x.sample}`), x.why ? h('p', {}, x.why) : null, h('button', { type: 'button', class: 'ac-next', 'data-quiz-next': '', onclick: next }, 'Next'));
      return;
    }
    this.body.append(input, h('button', { type: 'button', class: 'ac-check', 'data-quiz-check': '', onclick: go }, 'Check'));
    setTimeout(() => input.focus(), 0);
  }

  // ---- sheet ------------------------------------------------------------------------------------------------
  drawSheet() {
    this.body.append(h('button', { type: 'button', class: 'ac-load', 'data-print': '', onclick: () => this.print() }, 'Print this sheet'), h('p', { class: 'ac-intro' }, 'Printed notes are commonly allowed; your own event\'s rules decide.'));
    for (const [t, rows] of SHEET) this.body.append(h('h4', {}, t), h('table', { class: 'ac-sheet' }, h('tbody', {}, rows.map(([a, b]) => h('tr', {}, h('td', {}, h('code', {}, a)), h('td', {}, b))))));
  }

  print() { const w = window.open('', '_blank'); if (!w) return; w.document.write(sheetHtml()); w.document.close(); w.focus(); w.print(); }

  refresh() {
    if (this.tab === 'exams' && this.exam) {
      const key = this.examGoalList().map((g) => (g.ok ? 1 : 0)).join('');
      if (key !== this.examKey && this.examDone == null) this.draw();
      else if (this.examDone == null && this.examClock) this.examClock.textContent = `${this.mmss((Date.now() - this.examStart) / 1000)} / ${this.exam.minutes}:00`;
      return;
    }
    if (!this.lesson || this.tab !== 'lessons' || this.complete) return;
    if (this.check()) this.drawStep();
  }

  onLine() { this.refresh(); }

  studyNext(state, grade) { return studyNext(state, grade); }
}
