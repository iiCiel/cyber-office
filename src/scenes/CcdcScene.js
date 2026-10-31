import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_SCENARIO } from '../data/ccdcScenario.js';
import { newGame, applyAction, answerInject, runRedTeam, score, progress, recordBest, loadBests } from '../game/ccdc.js';
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
    this.guided = true; // guided (hints shown) by default; the brief lets you switch to timed/advanced
    this.state = newGame(this.scenario);
    this.phase = 'brief';
    this.flash = {}; // per-finding / per-inject transient feedback message

    this.root = h('div', { class: 'screen open ccdc-screen', id: 'ccdc' });
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

  // Phaser re-centres the canvas shortly after a resize; re-place the overlay whenever it moves.
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
            h('b', {}, 'Competition'), h('span', {}, 'No hints. Make the calls a real blue-teamer makes, then see the scorecard.')))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-go', onclick: () => { this.sound2?.play('select'); this.phase = 'defend'; this.render(); } }, 'Take the keyboard →'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Back')));
    this.root.append(panel);
  }

  // ---- defend workspace ----
  renderDefend() {
    const sc = score(this.state);
    const p = progress(this.state);
    const panel = h('div', { class: 'cc-wrap wide' },
      this.header('Defend · harden without dropping a service', this.serviceBar(sc)),
      h('div', { class: 'cc-progress' },
        h('span', {}, `Findings remediated: ${p.fixed}/${p.findingsTotal}`),
        h('span', {}, `Injects answered: ${p.injectsAnswered}/${p.injectsTotal}`),
        h('span', {}, `Services up: ${p.servicesUp}/${p.servicesTotal}`)),
      h('div', { class: 'cc-cols' },
        h('div', { class: 'cc-col-main' },
          h('h2', { class: 'cc-sec-title' }, 'Finding backlog'),
          h('p', { class: 'cc-sec-note' }, 'Pick the one action that actually remediates each finding. Some choices look helpful but drop a scored service or leave the hole open.'),
          h('ol', { class: 'cc-findings' }, this.scenario.findings.map((f) => this.findingCard(f)))),
        h('div', { class: 'cc-col-side' },
          h('h2', { class: 'cc-sec-title' }, 'Management injects'),
          h('p', { class: 'cc-sec-note' }, 'Business tasks from the white team. Each is worth points — do not skip them.'),
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
    const done = rec.status === 'fixed';
    const mis = rec.status === 'misfixed';
    const fl = this.flash[f.id];
    return h('li', { class: `cc-finding sev-${f.severity.toLowerCase()}${done ? ' fixed' : ''}${mis ? ' misfixed' : ''}`, 'data-finding': f.id },
      h('div', { class: 'cc-f-head' },
        h('span', { class: `cc-sev s-${f.severity.toLowerCase()}` }, f.severity),
        h('span', { class: 'cc-f-host' }, `${f.host} · ${f.ip}`),
        h('span', { class: 'cc-f-cat' }, f.category),
        done ? h('span', { class: 'cc-tag ok' }, '✓ Remediated') : mis ? h('span', { class: 'cc-tag bad' }, '⚠ Still open') : null),
      h('h3', { class: 'cc-f-title' }, f.title),
      h('p', { class: 'cc-f-ev' }, h('b', {}, 'What you found: '), f.evidence),
      this.guided ? h('p', { class: 'cc-f-teach' }, h('b', {}, 'Coach: '), f.teach) : null,
      h('div', { class: 'cc-actions' }, f.actions.map((a) =>
        h('button', {
          type: 'button',
          class: `cc-act${rec.chosen === a.id ? ' chosen' : ''}`,
          'data-act': a.id,
          disabled: done ? '' : undefined,
          onclick: () => this.doAction(f.id, a.id),
        }, a.label))),
      fl ? h('p', { class: `cc-flash ${fl.tone}` }, fl.msg) : null);
  }

  injectCard(i) {
    const ans = this.state.injects[i.id].answer;
    const fl = this.flash[i.id];
    return h('li', { class: `cc-inject${ans ? ' answered' : ''}`, 'data-inject': i.id },
      h('div', { class: 'cc-inj-head' }, h('span', { class: 'cc-inj-pts' }, `${i.points} pts`), h('span', { class: 'cc-inj-from' }, i.from)),
      h('h3', { class: 'cc-inj-title' }, i.title),
      h('p', { class: 'cc-inj-prompt' }, i.prompt),
      h('div', { class: 'cc-inj-choices' }, i.choices.map((c) =>
        h('button', { type: 'button', class: `cc-inj-choice${ans === c.id ? ' chosen' : ''}`, 'data-choice': c.id, onclick: () => this.doInject(i.id, c.id) }, c.label))),
      fl ? h('p', { class: `cc-flash ${fl.tone}` }, fl.msg) : null);
  }

  doAction(findingId, actionId) {
    const res = applyAction(this.state, findingId, actionId);
    if (!res.ok) return;
    const tone = res.outcome === 'fixed' ? 'ok' : res.outcome === 'misfix' || res.droppedService ? 'bad' : 'warn';
    this.sound2?.play(res.outcome === 'fixed' ? 'select' : res.droppedService ? 'error' : 'click');
    const f = this.scenario.findings.find((x) => x.id === findingId);
    const a = f.actions.find((x) => x.id === actionId);
    let msg = res.message;
    if (res.droppedService) msg += ' A scored service just went DOWN — fix the finding correctly to recover it.';
    if (this.guided || res.outcome !== 'fixed') msg += ` — ${a.why}`;
    this.flash[findingId] = { tone, msg };
    this.render();
    this.root.querySelector(`[data-finding="${findingId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  doInject(injectId, choiceId) {
    const res = answerInject(this.state, injectId, choiceId);
    if (!res.ok) return;
    this.sound2?.play(res.correct ? 'select' : 'click');
    this.flash[injectId] = { tone: res.correct ? 'ok' : 'warn', msg: res.message };
    this.render();
    this.root.querySelector(`[data-inject="${injectId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  endRound() {
    runRedTeam(this.state);
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
        h('div', { class: 'cc-tally' },
          this.tallyRow('Service uptime', `+${g.servicePts}`, `of ${g.serviceMax}`, 'ok'),
          this.tallyRow('Injects', `+${g.injectPts}`, `of ${g.injectMax}`, 'ok'),
          this.tallyRow('Compromises', g.compromisePenalty ? `−${g.compromisePenalty}` : '0', `${g.compromiseCount} breach${g.compromiseCount === 1 ? '' : 'es'}`, g.compromisePenalty ? 'bad' : 'ok'),
          h('div', { class: 'cc-tally-row total' }, h('span', {}, 'Total'), h('b', {}, `${g.total}`), h('span', {}, `of ${g.max} · ${g.pct}%`))),
        h('p', { class: 'cc-verdict' }, this.verdict(g))),
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Scored services at the buzzer'),
        h('ul', { class: 'cc-svc-review' }, g.services.map((s) =>
          h('li', { class: s.state },
            h('span', { class: `cc-dot ${s.state}`, 'aria-hidden': 'true' }),
            h('b', {}, s.name), h('span', { class: 'cc-svc-verdict' }, s.state === 'up' ? `UP — +${s.points} kept` : `DOWN — ${s.points} lost`),
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
    this.state = newGame(this.scenario);
    this.flash = {};
    this.phase = 'defend';
    this.render();
  }
}
