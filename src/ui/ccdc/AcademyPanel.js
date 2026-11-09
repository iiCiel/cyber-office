// Learn mode: a coach beside the consoles. It explains, points at what to type, then checks the box to see that it
// really happened. Progress is kept per browser; the game plays correctly without it.
import { h, clear } from '../dom.js';
import { LESSONS, SHEET, sheetHtml } from '../../data/ccdcAcademy.js';
import { gradeInject } from '../../game/ccdcLab.js';
import './academy.css';

const KEY = 'cyber-office.ccdc.academy';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* the panel works without it */ } };
const stop = (e) => e.stopPropagation();

export class AcademyPanel {
  constructor({ state, host }) {
    this.state = state;
    this.host = host; // { showVm, showWin, load, startLesson, ctx }
    this.progress = load();
    this.tab = 'lessons';
    this.lesson = null;
    this.body = h('div', { class: 'ac-body' });
    this.tabs = h('div', { class: 'ac-tabs' });
    this.collapse = h('button', { type: 'button', class: 'ac-collapse', 'aria-label': 'Hide coach', onclick: () => this.toggle() }, '>');
    this.el = h('aside', { class: 'ac', 'data-academy': '', onkeydown: stop, onkeyup: stop }, h('div', { class: 'ac-head' }, this.collapse, h('b', {}, 'Coach'), this.tabs), this.body);
    this.draw();
  }

  toggle() {
    const hidden = this.el.classList.toggle('ac-hidden');
    this.collapse.textContent = hidden ? '<' : '>';
    this.host.onToggle?.(hidden);
  }

  draw() {
    clear(this.tabs).append(...[['lessons', 'Lessons'], ['sheet', 'Cheat sheet']].map(([id, t]) => h('button', { type: 'button', class: `ac-tab${this.tab === id ? ' on' : ''}`, 'data-actab': id, onclick: () => { this.tab = id; this.draw(); } }, t)));
    clear(this.body);
    if (this.tab === 'sheet') this.drawSheet();
    else if (this.lesson) this.drawStep();
    else this.drawList();
  }

  doneCount() { return LESSONS.filter((l) => this.progress[l.id]).length; }

  drawList() {
    const n = this.doneCount();
    this.body.append(
      h('p', { class: 'ac-intro' }, 'Do these in order. Every step happens on the real consoles, and nothing here can hurt your score.'),
      h('div', { class: 'ac-prog', role: 'progressbar', 'aria-valuenow': String(n), 'aria-valuemax': String(LESSONS.length) }, h('i', { style: { width: `${(n / LESSONS.length) * 100}%` } })),
      h('div', { class: 'ac-progtext' }, `${n} of ${LESSONS.length} lessons done`),
      h('ol', { class: 'ac-list' }, LESSONS.map((l) => h('li', {}, h('button', { type: 'button', class: `ac-item${this.progress[l.id] ? ' done' : ''}`, 'data-lesson': l.id, onclick: () => this.start(l) }, h('span', {}, l.title), h('small', {}, this.progress[l.id] ? 'done' : `${l.mins} min`))))));
  }

  start(lesson) {
    this.lesson = lesson;
    this.i = -1;
    this.host.startLesson(lesson);
    this.next();
  }

  next() {
    this.i += 1;
    const s = this.step();
    if (!s) {
      this.progress[this.lesson.id] = true;
      save(this.progress);
      this.lesson = null;
      this.draw();
      return;
    }
    this.complete = false; this.revealed = false; this.answered = null; this.feedback = null; this.logMark = this.host.logSize();
    s.setup?.(this.state);
    if (s.vm) this.host.showVm(s.vm);
    if (s.open) this.host.showWin(s.open);
    this.check();
    this.drawStep();
  }

  step() { return this.lesson?.steps[this.i]; }

  ctx() { return this.host.ctx(this.logMark); }

  typed(s) { return typeof s.type === 'function' ? s.type(this.state) : s.type; }

  check() {
    const s = this.step();
    if (!s || this.complete) return false;
    if (s.ask || s.write) return false;
    if (!s.type && !s.done) { this.complete = true; return true; }
    const c = this.ctx();
    let ok;
    try { ok = s.done ? s.done(c) : c.ran(s.vm, this.typed(s)); } catch { ok = false; }
    if (ok) this.complete = true;
    else if (s.feedback) { const f = s.feedback(c); if (f !== this.feedback) { this.feedback = f; return true; } }
    return !!ok;
  }

  drawStep() {
    clear(this.body);
    const s = this.step();
    const L = this.lesson;
    this.body.append(h('div', { class: 'ac-crumb' }, h('button', { type: 'button', class: 'ac-back', onclick: () => { this.lesson = null; this.draw(); } }, '< All lessons'), h('span', {}, `${this.i + 1} / ${L.steps.length}`)), h('h3', {}, L.title));
    if (s.say) for (const p of s.say.split('\n\n')) this.body.append(h('p', { class: 'ac-say' }, p));
    const cmd = this.typed(s);
    if (cmd) {
      if (s.drill && !this.revealed && !this.complete) this.body.append(h('button', { type: 'button', class: 'ac-show', 'data-reveal': '', onclick: () => { this.revealed = true; this.drawStep(); } }, 'I am stuck. Show me'));
      else {
        this.body.append(h('div', { class: 'ac-cmdlabel' }, 'Type this:'), h('code', { class: 'ac-cmd' }, cmd));
        if (s.parts) this.body.append(h('table', { class: 'ac-parts' }, h('tbody', {}, s.parts.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b))))));
        if (s.vm && !this.complete) this.body.append(h('button', { type: 'button', class: 'ac-load', 'data-load': '', onclick: () => this.host.load(s.vm, cmd) }, 'Put it on the command line for me'));
      }
    }
    if (s.look && (cmd ? this.complete : true)) this.body.append(h('p', { class: 'ac-look' }, h('b', {}, 'Look at: '), s.look));
    if (s.ask) this.drawAsk(s);
    if (s.write) this.drawWrite(s);
    if (this.feedback) this.body.append(h('p', { class: 'ac-bad' }, this.feedback));
    if (this.complete) {
      if (s.after) this.body.append(h('p', { class: 'ac-after' }, s.after));
      this.body.append(h('button', { type: 'button', class: 'ac-next', 'data-next': '', onclick: () => this.next() }, this.i === L.steps.length - 1 ? 'Finish lesson' : 'Next'));
    } else if (!s.ask && !s.write) this.body.append(h('p', { class: 'ac-wait' }, 'Waiting for you to do this on the console...'));
    this.body.scrollTop = 0;
  }

  drawAsk(s) {
    const input = h('input', { class: 'ac-input', 'aria-label': 'Your answer', 'data-answer': '', value: this.answerText || '', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); } });
    const go = () => {
      this.answerText = '';
      const re = typeof s.ask.a === 'function' ? s.ask.a(this.state) : s.ask.a;
      if (re.test(input.value.trim())) { this.complete = true; this.answered = 'ok'; } else this.answered = 'no';
      this.drawStep();
    };
    this.body.append(h('p', { class: 'ac-q' }, s.ask.q));
    if (this.complete) { this.body.append(h('p', { class: 'ac-after' }, `Right. ${s.ask.why}`)); return; }
    this.body.append(input, h('button', { type: 'button', class: 'ac-check', 'data-check': '', onclick: go }, 'Check'));
    if (this.answered === 'no') this.body.append(h('p', { class: 'ac-bad' }, 'Not that. Read the output again.'));
    setTimeout(() => input.focus(), 0);
  }

  drawWrite(s) {
    const inj = this.state.injectList.find((i) => i.id === s.write.injectId);
    if (this.draft == null) this.draft = s.write.starter;
    const ta = h('textarea', { class: 'ac-ta', 'aria-label': 'Your memo', 'data-memo': '', oninput: () => { this.draft = ta.value; } }, this.draft);
    ta.value = this.draft;
    this.body.append(h('p', { class: 'ac-q' }, inj.prompt), ta);
    if (this.complete) { this.body.append(h('p', { class: 'ac-after' }, `Passed. A strong answer: ${inj.model}`)); this.draft = null; return; }
    this.body.append(h('button', { type: 'button', class: 'ac-check', 'data-grade': '', onclick: () => {
      const g = gradeInject(inj, ta.value, this.state);
      this.grade = g;
      this.complete = g.max ? g.pts / g.max >= 0.75 : false;
      this.feedback = this.complete ? null : (g.rejected ? 'That does not read as a memo yet. Write full sentences, at least 25 words.' : `Missing: ${g.missing.join('; ')}.`);
      this.drawStep();
    } }, 'Have the judge read it'));
  }

  drawSheet() {
    this.body.append(h('button', { type: 'button', class: 'ac-load', 'data-print': '', onclick: () => this.print() }, 'Print this sheet'), h('p', { class: 'ac-intro' }, 'Printed notes are allowed in the room. Electronics are not.'));
    for (const [t, rows] of SHEET) this.body.append(h('h4', {}, t), h('table', { class: 'ac-sheet' }, h('tbody', {}, rows.map(([a, b]) => h('tr', {}, h('td', {}, h('code', {}, a)), h('td', {}, b))))));
  }

  print() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(sheetHtml());
    w.document.close();
    w.focus();
    w.print();
  }

  refresh() {
    if (!this.lesson || this.tab !== 'lessons' || this.complete) return;
    if (this.check()) this.drawStep();
  }

  /** The scene calls this after every line typed anywhere. */
  onLine() { this.refresh(); }
}
