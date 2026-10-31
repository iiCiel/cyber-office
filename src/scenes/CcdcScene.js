import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_SCENARIO } from '../data/ccdcScenario.js';
import {
  newGame, applyAction, answerInject, runRedTeam, expire, score, progress, recordBest,
  actionsFor, choicesFor, isLocked, isInjectLocked, MODES,
} from '../game/ccdc.js';
import '../ui/screen.css';
import '../ui/competitions.css';

// CCDC blue-team mode: inherit a misconfigured small business and harden it under the real CCDC rules —
// keep the scored services up, fix the holes, handle management injects, and survive the red team at the end.
// Four phases, rendered as HTML over the canvas like Case Files / the Pentest Report Builder:
//   brief    -> the competitor briefing (first-15-minute playbook + the traps) and mode choice
//   defend   -> the workspace: scored-service status, the finding backlog with candidate fixes, injects
//   debrief  -> run the red team, then the scorecard (uptime + injects - compromises) with coaching on every item
// Defensive only: every action is an ordinary sysadmin fix. Nothing is attacked or executed.
export class CcdcScene extends Phaser.Scene {
  constructor() {
    super('Ccdc');
  }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenario = data?.scenario || CCDC_SCENARIO;
  }

  create() {
    this.cameras.main.setBackgroundColor('#06100c');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true; // guided (hints shown) by default; the brief lets you switch to the timed competition mode
    this.state = newGame(this.scenario);
    this.deadline = 0; // ms timestamp when the competition clock hits 0:00 (0 = no clock)
    this.phase = 'brief';
    this.flash = {}; // per-finding / per-inject transient feedback message

    this.root = h('div', { class: 'screen open ccdc-screen', id: 'ccdc' });
    document.body.append(this.root);
    document.body.classList.add('portrait-ok'); // HTML screen: readable on an upright phone, skip the rotate prompt
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

  // Phaser re-centres the canvas shortly after a resize; re-place the overlay whenever it moves.
  update() {
    this.tickClock();
    if (!this.layout) return;
    const r = this.game.canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key !== this.canvasRect) { this.canvasRect = key; this.layout(); }
  }

  exit() {
    this.deadline = 0;
    this.sound2?.play('click');
    this.scene.start(this.returnTo);
  }

  render() {
    clear(this.root);
    if (this.phase !== this.renderedPhase) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
    this.renderedPhase = this.phase;
    if (this.phase === 'brief') this.renderBrief();
    else if (this.phase === 'defend') this.renderDefend();
    else this.renderDebrief();
  }

  header(kicker, right) {
    return h('header', { class: 'cc-head' },
      h('div', {},
        h('div', { class: 'cc-kicker' }, kicker),
        h('div', { class: 'cc-org' }, this.scenario.company)),
      right || null);
  }

  // ---- brief ----
  renderBrief() {
    const b = this.scenario.briefing;
    const panel = h('div', { class: 'cc-wrap' },
      this.header('CCDC · Blue team · defensive engagement'),
      h('div', { class: 'cc-panel cc-intro' },
        h('h1', {}, this.scenario.company),
        h('p', { class: 'cc-lede' }, this.scenario.tagline),
        h('div', { class: 'cc-scored' },
          h('h2', {}, 'Scored services — keep these UP'),
          h('ul', { class: 'cc-scored-list' }, this.scenario.services.map((s) =>
            h('li', {}, h('span', { class: 'cc-svc-proto' }, s.proto), h('span', { class: 'cc-svc-name' }, s.name), h('span', { class: 'cc-svc-host' }, `${s.host} · ${s.ip}`)))),
          h('p', { class: 'cc-score-formula' }, 'Score  =  service uptime  +  injects  −  compromises'))),
      h('div', { class: 'cc-panel cc-briefing' },
        h('h2', {}, b.title),
        h('p', { class: 'cc-brief-intro' }, b.intro),
        h('ol', { class: 'cc-checklist' }, b.checklist.map((c) => h('li', {}, c))),
        h('h3', { class: 'cc-traps-title' }, 'The self-inflicted wounds that drop a scored service'),
        h('ul', { class: 'cc-traps' }, b.traps.map((t) => h('li', {}, t)))),
      h('div', { class: 'cc-panel cc-mode' },
        h('h2', {}, 'Choose how you want to play'),
        h('div', { class: 'cc-mode-row' },
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? ' on' : ''}`, onclick: () => { this.guided = true; this.render(); } },
            h('b', {}, 'Guided'), h('span', {}, 'Coaching hint on every finding and inject. Learn the playbook.')),
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? '' : ' on'}`, onclick: () => { this.guided = false; this.render(); } },
            h('b', {}, `Competition · ${this.clockLabel()} clock`), h('span', {}, 'No hints. Every call is final, no feedback until the debrief, and when the clock hits 0:00 the red team runs.')))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-go', onclick: () => this.startRound() }, 'Take the keyboard →'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Back')));
    this.root.append(panel);
  }

  // ---- defend workspace ----
  renderDefend() {
    const sc = score(this.state);
    const p = progress(this.state);
    const panel = h('div', { class: 'cc-wrap wide' },
      this.header(this.guided ? 'Defend · guided · harden without dropping a service' : 'Defend · competition · every call is final',
        h('div', { class: 'cc-head-right' }, this.guided ? null : this.clockEl(), this.serviceBar(sc))),
      h('div', { class: 'cc-progress' },
        h('span', {}, `Findings remediated: ${p.fixed}/${p.findingsTotal}`),
        h('span', {}, `Injects answered: ${p.injectsAnswered}/${p.injectsTotal}`),
        h('span', {}, `Services up: ${p.servicesUp}/${p.servicesTotal}`)),
      h('div', { class: 'cc-cols' },
        h('div', { class: 'cc-col-main' },
          h('h2', { class: 'cc-sec-title' }, 'Finding backlog'),
          h('p', { class: 'cc-sec-note' }, this.guided
            ? 'Pick the one action that actually remediates each finding. Some choices look helpful but drop a scored service or leave the hole open. If you drop a service, fixing that same finding correctly brings it back — but the outage already cost an SLA penalty.'
            : 'One pick per finding, and it is final. You will not be told whether it was right until the debrief — watch the scored-service bar, exactly like the real scoreboard.'),
          h('ol', { class: 'cc-findings' }, this.scenario.findings.map((f) => this.findingCard(f)))),
        h('div', { class: 'cc-col-side' },
          h('h2', { class: 'cc-sec-title' }, 'Management injects'),
          h('p', { class: 'cc-sec-note' }, this.guided ? 'Business tasks from the white team. Each is worth points — do not skip them.' : 'Business tasks from the white team. One submission each — no resubmits.'),
          h('ul', { class: 'cc-injects' }, this.scenario.injects.map((i) => this.injectCard(i))))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-go cc-endround', 'data-action': 'end-round', onclick: () => this.endRound() }, 'End the round — run the red team →'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Quit')));
    this.root.append(panel);
  }

  serviceBar(sc) {
    return h('div', { class: 'cc-svcbar', 'aria-label': 'Scored service status' },
      sc.services.map((s) => h('span', { class: `cc-svc-pill ${s.state}`, title: s.note || '' },
        h('i', { class: 'cc-dot', 'aria-hidden': 'true' }),
        h('b', {}, s.name.replace(/ \(.*\)$/, '')),
        h('span', { class: 'cc-svc-state' }, s.state === 'up' ? 'UP' : 'DOWN'))));
  }

  findingCard(f) {
    const rec = this.state.findings[f.id];
    // Competition mode never reveals right/wrong before the debrief: a pick just reads "submitted".
    const done = this.guided && rec.status === 'fixed';
    const mis = this.guided && rec.status === 'misfixed';
    const locked = isLocked(this.state, f.id);
    const submitted = !this.guided && rec.picks > 0;
    const fl = this.flash[f.id];
    return h('li', { class: `cc-finding sev-${f.severity.toLowerCase()}${done ? ' fixed' : ''}${mis ? ' misfixed' : ''}`, 'data-finding': f.id },
      h('div', { class: 'cc-f-head' },
        h('span', { class: `cc-sev s-${f.severity.toLowerCase()}` }, f.severity),
        h('span', { class: 'cc-f-host' }, `${f.host} · ${f.ip}`),
        h('span', { class: 'cc-f-cat' }, f.category),
        done ? h('span', { class: 'cc-tag ok' }, '✓ Remediated') : mis ? h('span', { class: 'cc-tag bad' }, '⚠ Still open') : submitted ? h('span', { class: 'cc-tag sub' }, '🔒 Submitted') : null),
      h('h3', { class: 'cc-f-title' }, f.title),
      h('p', { class: 'cc-f-ev' }, h('b', {}, 'What you found: '), f.evidence),
      this.guided ? h('p', { class: 'cc-f-teach' }, h('b', {}, 'Coach: '), f.teach) : null,
      h('div', { class: 'cc-actions' }, actionsFor(this.state, f).map((a) =>
        h('button', {
          type: 'button',
          class: `cc-act${rec.chosen === a.id ? ' chosen' : ''}`,
          'data-act': a.id,
          disabled: locked ? '' : undefined,
          onclick: () => this.doAction(f.id, a.id),
        }, a.label))),
      fl ? h('p', { class: `cc-flash ${fl.tone}` }, fl.msg) : null);
  }

  injectCard(i) {
    const ans = this.state.injects[i.id].answer;
    const fl = this.flash[i.id];
    const locked = isInjectLocked(this.state, i.id);
    return h('li', { class: `cc-inject${ans ? ' answered' : ''}`, 'data-inject': i.id },
      h('div', { class: 'cc-inj-head' }, h('span', { class: 'cc-inj-pts' }, `${i.points} pts`), h('span', { class: 'cc-inj-from' }, i.from)),
      h('h3', { class: 'cc-inj-title' }, i.title),
      h('p', { class: 'cc-inj-prompt' }, i.prompt),
      h('div', { class: 'cc-inj-choices' }, choicesFor(this.state, i).map((c) =>
        h('button', { type: 'button', class: `cc-inj-choice${ans === c.id ? ' chosen' : ''}`, 'data-choice': c.id, disabled: locked ? '' : undefined, onclick: () => this.doInject(i.id, c.id) }, c.label))),
      fl ? h('p', { class: `cc-flash ${fl.tone}` }, fl.msg) : null);
  }

  doAction(findingId, actionId) {
    const res = applyAction(this.state, findingId, actionId);
    if (!res.ok) return;
    const f = this.scenario.findings.find((x) => x.id === findingId);
    const a = f.actions.find((x) => x.id === actionId);
    const names = (ids) => ids.map((id) => this.state.services[id].name.replace(/ \(.*\)$/, '')).join(', ');
    if (!this.guided) {
      // Competition: the call is locked and nothing says whether it was right. The scored-service bar still
      // updates live, exactly like the real scoreboard — that is the only signal a real team gets.
      this.sound2?.play('click');
      this.flash[findingId] = { tone: 'sub', msg: 'Change submitted and locked. Its effect on your score is revealed in the debrief.' };
    } else {
      const dropped = res.droppedServices.length > 0;
      const tone = res.outcome === 'fixed' ? 'ok' : res.outcome === 'misfixed' || dropped ? 'bad' : 'warn';
      this.sound2?.play(res.outcome === 'fixed' ? 'select' : dropped ? 'error' : 'click');
      let msg = res.message;
      if (dropped) msg += ` DOWN now: ${names(res.droppedServices)}. Fix this finding correctly to bring ${res.droppedServices.length > 1 ? 'them' : 'it'} back (the outage still costs an SLA penalty).`;
      if (res.restoredServices.length) msg += ` Back UP: ${names(res.restoredServices)}.`;
      msg += ` — ${a.why}`;
      this.flash[findingId] = { tone, msg };
    }
    this.render();
    this.root.querySelector(`[data-finding="${findingId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  doInject(injectId, choiceId) {
    const res = answerInject(this.state, injectId, choiceId);
    if (!res.ok) return;
    if (!this.guided) {
      this.sound2?.play('click');
      this.flash[injectId] = { tone: 'sub', msg: 'Submitted to the white team. Graded in the debrief.' };
    } else {
      this.sound2?.play(res.correct ? 'select' : 'click');
      this.flash[injectId] = { tone: res.correct ? 'ok' : 'warn', msg: res.message };
    }
    this.render();
    this.root.querySelector(`[data-inject="${injectId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // ---- round lifecycle + competition clock ----
  startRound() {
    this.sound2?.play('select');
    this.state = newGame(this.scenario, { mode: this.guided ? MODES.GUIDED : MODES.COMPETITION });
    this.flash = {};
    this.deadline = this.state.timeLimitSec ? Date.now() + this.state.timeLimitSec * 1000 : 0;
    this.lastClockText = '';
    this.phase = 'defend';
    this.render();
  }

  clockLabel() {
    const sec = this.scenario.clockSeconds || 0;
    return `${Math.round(sec / 60)}-minute`;
  }

  remainingMs() {
    return this.deadline ? Math.max(0, this.deadline - Date.now()) : 0;
  }

  fmtClock(ms) {
    const t = Math.ceil(ms / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  clockEl() {
    const ms = this.remainingMs();
    return h('div', { class: `cc-clock${ms <= 120000 ? ' low' : ''}`, role: 'timer', 'aria-label': 'Time left in the round' },
      h('span', { class: 'cc-clock-label' }, 'Time left'),
      h('b', { class: 'cc-clock-val' }, this.fmtClock(ms)));
  }

  // Called every frame: refresh the countdown text in place (no full re-render) and end the round at 0:00.
  tickClock() {
    if (!this.deadline || this.phase !== 'defend') return;
    const ms = this.remainingMs();
    if (ms <= 0) {
      this.deadline = 0;
      expire(this.state);
      this.finishRound();
      return;
    }
    const text = this.fmtClock(ms);
    if (text === this.lastClockText) return;
    this.lastClockText = text;
    const el = this.root?.querySelector('.cc-clock');
    if (el) {
      el.querySelector('.cc-clock-val').textContent = text;
      el.classList.toggle('low', ms <= 120000);
    }
  }

  endRound() {
    this.deadline = 0;
    runRedTeam(this.state);
    this.finishRound();
  }

  finishRound() {
    this.grade = score(this.state);
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.phase = 'debrief';
    this.render();
  }

  // ---- debrief / scorecard ----
  renderDebrief() {
    const g = this.grade;
    const compromised = new Set(g.compromises.map((c) => c.findingId));
    const panel = h('div', { class: 'cc-wrap' },
      h('header', { class: 'cc-head' },
        h('div', {}, h('div', { class: 'cc-kicker' }, `Round over · ${this.scenario.company}`), h('div', { class: 'cc-org' }, 'Red team has run')),
        h('div', { class: `cc-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'cc-panel cc-scorecard' },
        h('h1', {}, 'Scorecard'),
        g.timedOut ? h('p', { class: 'cc-timeout' }, '⏱ Time ran out. The round ended at the buzzer: whatever was still open when the clock hit 0:00 is what the red team walked through.') : null,
        h('p', { class: 'cc-mode-note' }, this.state.mode === MODES.COMPETITION ? 'Competition round: every call was final and graded only now.' : 'Guided round.'),
        h('div', { class: 'cc-tally' },
          this.tallyRow('Service uptime', `+${g.servicePts}`, `of ${g.serviceMax}`, 'ok'),
          this.tallyRow('Injects', `+${g.injectPts}`, `of ${g.injectMax}`, 'ok'),
          this.tallyRow('SLA violations', g.slaPenalty ? `−${g.slaPenalty}` : '0', `${g.slaCount} outage${g.slaCount === 1 ? '' : 's'} you caused`, g.slaPenalty ? 'bad' : 'ok'),
          this.tallyRow('Compromises', g.compromisePenalty ? `−${g.compromisePenalty}` : '0', `${g.compromiseCount} breach${g.compromiseCount === 1 ? '' : 'es'}`, g.compromisePenalty ? 'bad' : 'ok'),
          h('div', { class: 'cc-tally-row total' }, h('span', {}, 'Total'), h('b', {}, `${g.total}`), h('span', {}, `of ${g.max} · ${g.pct}%`))),
        h('p', { class: 'cc-verdict' }, this.verdict(g))),
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Scored services at the buzzer'),
        h('ul', { class: 'cc-svc-review' }, g.services.map((s) =>
          h('li', { class: s.state },
            h('span', { class: `cc-dot ${s.state}`, 'aria-hidden': 'true' }),
            h('b', {}, s.name), h('span', { class: 'cc-svc-verdict' }, s.state === 'up' ? `UP — +${s.points} kept` : `DOWN — ${s.points} lost`),
            s.drops ? h('span', { class: 'cc-svc-sla' }, `${s.drops} outage${s.drops === 1 ? '' : 's'} you caused · −${s.drops * (this.scenario.slaPenalty || 0)} SLA`) : null,
            s.note ? h('span', { class: 'cc-svc-note' }, s.note) : null)))),
      g.compromises.length ? h('div', { class: 'cc-panel cc-breaches' },
        h('h2', {}, 'What the red team got in through'),
        h('ul', {}, g.compromises.map((c) =>
          h('li', {},
            h('b', {}, `${c.host}: ${c.title}`),
            h('p', {}, c.impact),
            c.persistence ? h('p', { class: 'cc-persist' }, h('b', {}, 'Persistence: '), c.persistence) : null,
            h('span', { class: 'cc-pen' }, `−${c.penalty}`)))) ) : null,
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Every finding, reviewed'),
        h('ul', { class: 'cc-review' }, this.scenario.findings.map((f) => {
          const rec = this.state.findings[f.id];
          const fixed = rec.status === 'fixed';
          const breached = compromised.has(f.id);
          const chosen = f.actions.find((a) => a.id === rec.chosen);
          const right = f.actions.find((a) => a.fixes);
          return h('li', { class: fixed ? 'ok' : breached ? 'bad' : 'warn' },
            h('div', { class: 'cc-rev-head' },
              h('span', { class: `cc-sev s-${f.severity.toLowerCase()}` }, f.severity),
              h('b', {}, `${f.host}: ${f.title}`),
              h('span', { class: `cc-rev-status ${fixed ? 'ok' : 'bad'}` }, fixed ? '✓ remediated' : breached ? '✗ breached' : '✗ left open')),
            chosen ? h('p', {}, h('b', {}, 'You chose: '), chosen.label, ' — ', chosen.why) : h('p', { class: 'cc-untouched' }, 'You never addressed this one.'),
            !fixed ? h('p', { class: 'cc-fix' }, h('b', {}, 'The fix: '), right.label) : null);
        }))),
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Injects, reviewed'),
        h('ul', { class: 'cc-review' }, this.scenario.injects.map((i) => {
          const ans = this.state.injects[i.id].answer;
          const r = g.injects.find((x) => x.id === i.id);
          const choice = i.choices.find((c) => c.id === ans);
          return h('li', { class: r.correct ? 'ok' : r.points ? 'warn' : 'bad' },
            h('div', { class: 'cc-rev-head' }, h('b', {}, i.title), h('span', { class: 'cc-rev-status' }, `${r.points}/${r.max}`)),
            choice ? h('p', {}, h('b', {}, 'You answered: '), choice.label, ' — ', choice.feedback) : h('p', { class: 'cc-untouched' }, 'Unanswered — 0 of its points.'));
        }))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-again', onclick: () => this.replay() }, '↻ Run the round again'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Done')));
    this.root.append(panel);
  }

  tallyRow(label, value, sub, tone) {
    return h('div', { class: `cc-tally-row ${tone}` }, h('span', {}, label), h('b', {}, value), h('span', { class: 'cc-tally-sub' }, sub));
  }

  verdict(g) {
    if (g.pct >= 90) return 'Competition-ready. You hardened the network, kept every service you could serving, and handled the business side — this is a winning round.';
    if (g.pct >= 75) return 'Strong round. Re-read the findings you left open or the service you dropped; those are the points between you and the top of the scoreboard.';
    if (g.pct >= 60) return 'A real blue-teamer\'s first attempt. The red team got in somewhere, or you knocked a service over. Check the reviews below and run it again.';
    return 'Rough round — exactly why you practise. Most of the loss is either dropped services (a fix that was actually a trap) or holes the red team walked through. Work the first-15-minute checklist in order next time.';
  }

  replay() {
    this.sound2?.play('click');
    this.startRound();
  }
}
