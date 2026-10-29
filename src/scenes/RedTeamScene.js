import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CASES } from '../cases/index.js';
import { buildDrill, startDrill, answer, grade, recordBest, loadBests } from '../game/redteam.js';
import '../ui/screen.css';

// Red Team Drill: walk a case's kill chain from the attacker's seat and, at each step, name the control
// that breaks the chain there. All content comes from the case's Attacker's Playbook (caseFile.attackerView);
// this scene is only presentation. Rendered as HTML over the canvas, like the report card and Case Files.
export class RedTeamScene extends Phaser.Scene {
  constructor() {
    super('RedTeam');
  }

  init(data) {
    this.caseId = data?.caseId;
    this.returnTo = data?.returnTo || 'CaseFiles';
  }

  create() {
    this.cameras.main.setBackgroundColor('#140d10');
    this.sound2 = this.game.registry.get('sound');
    const found = CASES.find((c) => c.caseFile.id === this.caseId);
    this.cf = found?.caseFile;
    this.drill = this.cf?.attackerView ? buildDrill(this.cf.id, this.cf.attackerView) : null;
    this.state = this.drill ? startDrill(this.drill) : null;

    this.root = h('div', { class: 'screen open redteam-screen', id: 'redteam' });
    document.body.append(this.root);
    this.render();

    const layout = () => placeOnCanvas(this.root, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W });
    layout();
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      this.root.remove();
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());
  }

  exit() {
    this.sound2?.play('click');
    this.scene.start(this.returnTo, this.returnTo === 'Report' ? {} : undefined);
  }

  render() {
    clear(this.root);
    if (!this.drill) {
      this.root.append(
        h('div', { class: 'rt-wrap' },
          h('div', { class: 'rt-panel' },
            h('h1', {}, 'Red Team Drill'),
            h('p', {}, 'This case has no attacker playbook yet, so there is no drill to run.'),
            h('button', { type: 'button', onclick: () => this.exit() }, 'Back'))),
      );
      return;
    }
    if (this.state.status === 'playing') this.renderRound();
    else this.renderDebrief();
  }

  header() {
    const total = this.drill.rounds.length;
    const strikes = h('span', { class: 'rt-strikes', 'aria-label': `${this.state.strikes} of ${this.drill.maxStrikes} strikes` },
      ...Array.from({ length: this.drill.maxStrikes }, (_, i) =>
        h('span', { class: `rt-x${i < this.state.strikes ? ' on' : ''}`, 'aria-hidden': 'true' }, '✕')));
    return h('header', { class: 'rt-head' },
      h('div', { class: 'rt-kicker' }, `Red team · ${this.cf.company}`),
      h('div', { class: 'rt-progress' },
        h('span', {}, `Step ${Math.min(this.state.round + 1, total)} of ${total}`),
        strikes));
  }

  renderRound() {
    const r = this.drill.rounds[this.state.round];
    const first = this.state.round === 0;
    const options = h('div', { class: 'rt-options' },
      r.options.map((o) =>
        h('button', { type: 'button', class: 'rt-opt', 'data-opt': o.id, onclick: (e) => this.pick(o.id, e.currentTarget) },
          h('span', { class: 'rt-stop-label' }, 'Break it with:'),
          h('span', { class: 'rt-opt-text' }, o.text))));
    const panel = h('div', { class: 'rt-wrap' },
      this.header(),
      first ? h('p', { class: 'rt-goal' }, h('b', {}, 'Your objective as the attacker: '), this.drill.goal) : null,
      h('div', { class: 'rt-panel' },
        h('div', { class: 'rt-step-head' },
          h('span', { class: 'rt-phase' }, r.phase),
          h('a', { class: 'rt-tid', href: `https://attack.mitre.org/techniques/${r.tid.replace('.', '/')}/`, target: '_blank', rel: 'noopener' }, r.tid)),
        h('h2', { class: 'rt-step-title' }, r.title),
        h('p', { class: 'rt-how' }, h('b', {}, 'Your move: '), r.how),
        h('p', { class: 'rt-q' }, 'A defender gets one chance to cut the chain here. Which control actually breaks THIS step?'),
        options,
        h('p', { class: 'rt-feedback', 'aria-live': 'polite' })),
      h('footer', { class: 'rt-foot' },
        h('button', { type: 'button', class: 'rt-quit', onclick: () => this.exit() }, 'Quit drill')));
    this.root.append(panel);
    this.fb = panel.querySelector('.rt-feedback');
  }

  pick(optId, btn) {
    if (btn.disabled) return;
    const r = this.drill.rounds[this.state.round];
    const res = answer(this.drill, this.state, optId);
    if (res.correct) {
      this.sound2?.play('select');
      btn.classList.add('correct');
      for (const b of this.root.querySelectorAll('.rt-opt')) b.disabled = true;
      this.fb.className = 'rt-feedback good';
      this.fb.textContent = `Chain cut. In the real incident the trace at this step was: ${r.trace}`;
      this.time.delayedCall(950, () => this.render());
    } else {
      this.sound2?.play('error');
      btn.classList.add('wrong');
      btn.disabled = true;
      this.fb.className = 'rt-feedback bad';
      this.fb.textContent = this.state.status === 'caught'
        ? 'That control breaks a different link. The SOC caught you — drill over.'
        : 'That control matters elsewhere in this chain, but it does not break this step. Try again.';
      if (this.state.status === 'caught') this.time.delayedCall(950, () => this.render());
    }
  }

  renderDebrief() {
    const g = grade(this.drill, this.state);
    recordBest(this.cf.id, g);
    const won = this.state.status === 'won';
    const rows = this.drill.rounds.map((r, i) => {
      const cleared = i < this.state.round;
      return h('li', { class: `rt-row ${cleared ? 'ok' : 'stop'}` },
        h('div', { class: 'rt-row-head' },
          h('span', { class: 'rt-num' }, String(i + 1)),
          h('span', { class: 'rt-phase' }, r.phase),
          h('a', { class: 'rt-tid', href: `https://attack.mitre.org/techniques/${r.tid.replace('.', '/')}/`, target: '_blank', rel: 'noopener' }, r.tid),
          h('span', { class: 'rt-row-title' }, r.title)),
        h('p', { class: 'rt-row-line move' }, h('b', {}, 'Move: '), r.how),
        h('p', { class: 'rt-row-line trace' }, h('b', {}, 'Trace it left: '), r.trace),
        h('p', { class: 'rt-row-line stop' }, h('b', {}, 'The control that breaks it: '), r.stop));
    });
    const panel = h('div', { class: 'rt-wrap' },
      h('header', { class: 'rt-head' },
        h('div', { class: 'rt-kicker' }, `Red team debrief · ${this.cf.company}`),
        h('div', { class: `rt-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'rt-panel rt-result' },
        h('h1', {}, won ? 'You ran the whole chain.' : 'The SOC caught you.'),
        h('p', { class: 'rt-result-sum' },
          won
            ? `You named the chokepoint at all ${g.total} steps${g.strikes ? ` with ${g.strikes} wrong guess${g.strikes > 1 ? 'es' : ''}` : ' with no mistakes'}. A defender who sees these breaks the attack.`
            : `You cut ${g.cleared} of ${g.total} steps before the blue team spotted you. Replay it: the chain below shows where each step breaks.`),
        h('div', { class: 'rt-choke' }, h('b', {}, 'The one place to cut the whole chain: '), this.drill.chokepoint)),
      h('div', { class: 'rt-panel' },
        h('h2', {}, 'The full kill chain, both seats'),
        h('ol', { class: 'rt-chain' }, rows)),
      h('footer', { class: 'rt-foot' },
        h('button', { type: 'button', class: 'rt-again', onclick: () => this.restart() }, '↻ Run it again'),
        h('button', { type: 'button', class: 'rt-quit', onclick: () => this.exit() }, 'Done')));
    this.root.append(panel);
  }

  restart() {
    this.sound2?.play('click');
    this.state = startDrill(this.drill);
    this.render();
  }
}

export { loadBests as redTeamBests };
