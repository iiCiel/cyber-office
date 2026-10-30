import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { ENGAGEMENT, FLAG } from '../cases/halcyon-engagement.js';
import { newRun, runCommand, nextStep, history, buildSiem, detections, isEvidence, scoreRun, recordBest } from '../game/engage.js';
import { searchText } from '../game/siemfmt.js';
import '../ui/screen.css';

const attackUrl = (tid) => `https://attack.mitre.org/techniques/${tid.replace('.', '/')}/`;

// Red team engagement: one simulated pentest of Halcyon Mutual, end to end.
//   brief    -> rules of engagement
//   terminal -> a scripted terminal (whitelisted commands, canned output; src/game/engage.js)
//   debrief  -> the SOC's SIEM for the same night: find the log line each of your moves left
//   results  -> grade (hunt + stealth - strikes), alerts the SOC got, and the fix for every step
// Rendered as HTML over the canvas, like Case Files and the Pentest Report Builder.
export class EngageScene extends Phaser.Scene {
  constructor() {
    super('Engage');
  }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
  }

  create() {
    this.cameras.main.setBackgroundColor('#05080a');
    this.sound2 = this.game.registry.get('sound');
    this.reset();
    this.root = h('div', { class: 'screen open engage-screen', id: 'engage' });
    document.body.append(this.root);
    this.render();

    const layout = () => placeOnCanvas(this.root, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W });
    layout();
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    // Let W/A/S/D/Space reach the terminal input (the office captures them globally).
    this.input.keyboard.disableGlobalCapture();
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      this.input.keyboard.enableGlobalCapture();
      this.root.remove();
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());
  }

  reset() {
    this.run = newRun();
    this.phase = 'brief';
    this.out = [];
    this.cmdHist = [];
    this.histPos = 0;
    this.events_ = null;
    this.answers = {};
    this.misses = {};
    this.active = null;
    this.query = '';
  }

  exit() {
    this.sound2?.play('click');
    this.scene.start(this.returnTo);
  }

  render() {
    clear(this.root);
    if (this.phase === 'brief') this.renderBrief();
    else if (this.phase === 'terminal') this.renderTerminal();
    else if (this.phase === 'debrief') this.renderDebrief();
    else this.renderResults();
  }

  renderBrief() {
    this.root.append(h('div', { class: 'eg-wrap' },
      h('div', { class: 'eg-kicker' }, 'Red team engagement · simulated'),
      h('div', { class: 'eg-panel' },
        h('h1', {}, ENGAGEMENT.title),
        h('p', { class: 'eg-lede' }, 'You are the outside tester Halcyon hired. Break in the way a real attacker would, prove it, and stop. Then switch seats: open the SOC’s SIEM for the same night and find the trace every one of your moves left.'),
        h('h2', {}, 'Rules of engagement'),
        h('ul', { class: 'eg-roe' }, ENGAGEMENT.roe.map((l) => h('li', {}, l))),
        h('p', { class: 'eg-note' }, 'Everything here is fiction: made-up hosts on documentation-only IP ranges, canned output, nothing is executed. Each move is tagged with its MITRE ATT&CK technique.'),
        h('div', { class: 'eg-foot' },
          h('button', { type: 'button', class: 'eg-go', 'data-action': 'start', onclick: () => this.start() }, 'Open the terminal →'),
          h('button', { type: 'button', class: 'eg-quit', onclick: () => this.exit() }, 'Back')))));
  }

  start() {
    this.sound2?.play('select');
    this.phase = 'terminal';
    this.out = [
      { cls: 'sys', text: `Engagement ${ENGAGEMENT.id} — authorised window open. Simulated environment.` },
      { cls: 'sys', text: 'Type "help", or click a move on the right to put it on the command line.' },
    ];
    this.render();
  }

  // ------------------------------------------------------------------ terminal

  renderTerminal() {
    const step = nextStep(this.run);
    const screen = h('div', { class: 'eg-out', role: 'log', 'aria-live': 'polite', 'aria-label': 'Terminal output' },
      this.out.map((l) => h('div', { class: `eg-line ${l.cls || ''}` }, l.text)));
    const input = h('input', {
      class: 'eg-input', type: 'text', 'aria-label': 'Command', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      onkeydown: (e) => this.termKey(e),
    });
    const term = h('div', { class: 'eg-term', onclick: (e) => { if (!e.target.closest('button')) input.focus(); } },
      screen,
      this.run.finished
        ? h('button', { type: 'button', class: 'eg-go eg-term-next', 'data-action': 'debrief-term', onclick: () => this.toDebrief() }, 'Objective reached — open the SOC debrief →')
        : h('div', { class: 'eg-cmdline' }, h('span', { class: 'eg-prompt' }, this.run.prompt), input));

    const side = h('aside', { class: 'eg-side' },
      step ? h('div', { class: 'eg-goal' },
        h('div', { class: 'eg-label' }, `Step ${this.run.done.length + 1} of ${ENGAGEMENT.steps.length}`),
        h('p', {}, step.goal),
        h('div', { class: 'eg-tags' }, h('span', { class: 'eg-tactic' }, step.tactic), h('a', { class: 'eg-tid', href: attackUrl(step.tid), target: '_blank', rel: 'noopener' }, step.tid), h('span', { class: 'eg-tname' }, step.tname)),
        h('div', { class: 'eg-label' }, 'Moves'),
        h('div', { class: 'eg-moves' }, step.choices.map((c) => h('button', {
          type: 'button', class: `eg-move${c.loud ? ' loud' : ''}${c.violation ? ' risky' : ''}`, 'data-cmd': c.cmd,
          onclick: () => { input.value = c.cmd; input.focus(); },
        }, h('code', {}, c.cmd), h('span', {}, c.label), c.loud ? h('em', {}, 'LOUD') : null))))
        : h('div', { class: 'eg-goal done' },
          h('div', { class: 'eg-label' }, 'Objective reached'),
          h('p', {}, 'You read the proof file. Now see it from the other side.'),
          h('button', { type: 'button', class: 'eg-go', 'data-action': 'debrief', onclick: () => this.toDebrief() }, 'Open the SOC debrief →')),
      h('div', { class: 'eg-label' }, 'Your kill chain'),
      h('ol', { class: 'eg-chain' }, history(this.run).map(({ step: s, choice }) =>
        h('li', {}, h('span', { class: 'eg-tid' }, s.tid), ' ', s.tactic, choice.loud ? h('em', { class: 'eg-loudtag' }, ' loud') : null))),
      this.run.strikes ? h('p', { class: 'eg-strike' }, `Rules-of-engagement strikes: ${this.run.strikes}`) : null,
      h('button', { type: 'button', class: 'eg-quit', onclick: () => this.exit() }, 'Quit'));

    this.root.append(h('div', { class: 'eg-wrap wide' },
      h('div', { class: 'eg-kicker' }, `${ENGAGEMENT.title} · attacker terminal (simulated)`),
      h('div', { class: 'eg-grid' }, term, side)));
    screen.scrollTop = screen.scrollHeight;
    if (!this.run.finished) setTimeout(() => input.focus(), 0);
  }

  termKey(e) {
    e.stopPropagation();
    const input = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.exec(input.value);
    } else if (e.key === 'ArrowUp' && this.cmdHist.length) {
      e.preventDefault();
      this.histPos = Math.max(0, this.histPos - 1);
      input.value = this.cmdHist[this.histPos] || '';
    } else if (e.key === 'ArrowDown' && this.cmdHist.length) {
      e.preventDefault();
      this.histPos = Math.min(this.cmdHist.length, this.histPos + 1);
      input.value = this.cmdHist[this.histPos] || '';
    } else if (e.key === 'Escape') {
      input.blur();
    }
  }

  exec(text) {
    const prompt = this.run.prompt;
    if (text.trim()) {
      this.cmdHist.push(text.trim());
      this.histPos = this.cmdHist.length;
    }
    const r = runCommand(this.run, text);
    if (r.clear) this.out = [];
    else {
      this.out.push({ cls: 'cmd', text: `${prompt} ${text}` });
      if (r.kind === 'ok') this.out.push({ cls: 'tag', text: `[ATT&CK ${r.step.tid} · ${r.step.tactic} · ${r.step.tname}]${r.choice.loud ? '  !! loud' : ''}` });
      for (const l of r.lines) this.out.push({ cls: r.kind === 'violation' ? 'bad' : l.startsWith('#') ? 'note' : l.includes(FLAG) ? 'flag' : r.kind === 'refused' ? 'err' : '', text: l });
    }
    this.sound2?.play(r.kind === 'ok' ? 'select' : r.kind === 'violation' || r.kind === 'refused' ? 'error' : 'click');
    this.render();
  }

  // ------------------------------------------------------------------ debrief

  toDebrief() {
    this.sound2?.play('select');
    this.events_ = buildSiem(this.run);
    this.hay = this.events_.map((e) => searchText(e));
    this.active = history(this.run)[0].step.id;
    this.phase = 'debrief';
    this.render();
  }

  renderDebrief() {
    const hist = history(this.run);
    const foundAll = hist.every(({ step }) => isEvidence(this.events_, step.id, this.answers[step.id]));
    const cards = hist.map(({ step, choice }, i) => {
      const ok = isEvidence(this.events_, step.id, this.answers[step.id]);
      const ev = ok ? this.events_.find((e) => e.id === this.answers[step.id]) : null;
      return h('li', {
        class: `eg-card${this.active === step.id ? ' on' : ''}${ok ? ' found' : ''}`, 'data-step': step.id, tabindex: '0', role: 'button',
        'aria-pressed': this.active === step.id ? 'true' : 'false',
        onclick: () => { this.active = step.id; this.render(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.active = step.id; this.render(); } },
      },
      h('div', { class: 'eg-card-head' }, h('span', { class: 'eg-num' }, ok ? '✓' : String(i + 1)), h('span', { class: 'eg-tid' }, step.tid), h('span', { class: 'eg-tactic' }, step.tactic)),
      h('code', {}, choice.cmd),
      ok ? h('div', { class: 'eg-hit' }, `${ev.sourcetype}: ${ev.short.slice(0, 90)}`) : this.misses[step.id] ? h('div', { class: 'eg-missnote' }, `${this.misses[step.id]} wrong pick${this.misses[step.id] > 1 ? 's' : ''}`) : null);
    });

    const q = this.query.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const shown = this.events_.map((e, i) => [e, i]).filter(([, i]) => terms.every((t) => this.hay[i].includes(t)));
    const activeStep = hist.find(({ step }) => step.id === this.active)?.step;
    const list = h('ol', { class: 'eg-events', 'aria-label': 'SIEM results' }, shown.map(([e]) => {
      const picked = Object.entries(this.answers).find(([, id]) => id === e.id);
      return h('li', {},
        h('button', {
          type: 'button', class: `eg-ev${picked && isEvidence(this.events_, picked[0], e.id) ? ' good' : ''}`, 'data-ev': e.id,
          onclick: () => this.pick(e.id),
        }, h('span', { class: 'eg-ev-time' }, e.time.split(' ').pop()), h('span', { class: 'eg-ev-src' }, e.sourcetype), h('span', { class: 'eg-ev-host' }, e.host), h('span', { class: 'eg-ev-msg', title: e.short }, e.short)));
    }));
    const search = h('input', {
      class: 'eg-search', type: 'search', placeholder: 'search: e.g. svc_portal, 198.51.100.66, sshd, backup', 'aria-label': 'Search the SIEM', value: this.query,
      oninput: (e) => { this.query = e.target.value; this.renderKeepFocus(); },
      onkeydown: (e) => e.stopPropagation(),
    });

    this.root.append(h('div', { class: 'eg-wrap wide' },
      h('div', { class: 'eg-kicker' }, `SOC debrief · SIEM, ${'Fri Oct 30'} · index=* · ${this.events_.length} events`),
      h('p', { class: 'eg-lede small' }, 'Switch seats. You are the analyst on shift. For each move (left), find the log line it left (right) and click it. Search by anything you know about yourself: your IP, the account you used, the file you read.'),
      h('div', { class: 'eg-grid debrief' },
        h('div', { class: 'eg-cards-col' },
          h('ol', { class: 'eg-cards' }, cards),
          activeStep && !isEvidence(this.events_, activeStep.id, this.answers[activeStep.id])
            ? h('button', { type: 'button', class: 'eg-hint', onclick: () => this.hint(activeStep.id) }, 'Hint') : null,
          h('p', { class: 'eg-feedback', 'aria-live': 'polite' }, this.feedback || ''),
          h('button', { type: 'button', class: foundAll ? 'eg-go' : 'eg-quit', 'data-action': 'finish', onclick: () => this.finish() }, foundAll ? 'See the results →' : 'Finish (score what I found)')),
        h('div', { class: 'eg-siem' }, search, h('div', { class: 'eg-count' }, `${shown.length} of ${this.events_.length} events`), list))));
  }

  renderKeepFocus() {
    const pos = this.root.querySelector('.eg-search')?.selectionStart;
    this.render();
    const s = this.root.querySelector('.eg-search');
    if (s) { s.focus(); if (pos != null) s.setSelectionRange(pos, pos); }
  }

  hint(stepId) {
    const ev = this.events_.find((e) => e.key === stepId);
    this.feedback = `Hint: it is in sourcetype ${ev.sourcetype} on ${ev.host}.`;
    this.sound2?.play('click');
    this.render();
  }

  pick(eventId) {
    const stepId = this.active;
    if (!stepId) return;
    const hist = history(this.run);
    if (isEvidence(this.events_, stepId, this.answers[stepId])) {
      this.feedback = 'Already found. Pick another move on the left.';
      this.render();
      return;
    }
    this.answers[stepId] = eventId;
    if (isEvidence(this.events_, stepId, eventId)) {
      this.sound2?.play('select');
      const step = hist.find((x) => x.step.id === stepId).step;
      this.feedback = `✓ That is your ${step.tid} move. Defender’s view: ${step.defend}`;
      const next = hist.find(({ step: s }) => !isEvidence(this.events_, s.id, this.answers[s.id]));
      if (next) this.active = next.step.id;
    } else {
      this.sound2?.play('error');
      this.misses[stepId] = (this.misses[stepId] || 0) + 1;
      const e = this.events_.find((x) => x.id === eventId);
      this.feedback = e.noise ? '✗ That is ordinary traffic, not you. Try narrowing by your own IP or account.' : '✗ That is one of your traces, but from a different move.';
    }
    this.render();
  }

  finish() {
    this.sound2?.play('select');
    this.grade = scoreRun(this.run, this.events_, this.answers, this.misses);
    this.best = recordBest(ENGAGEMENT.id, this.grade);
    this.phase = 'results';
    this.render();
  }

  // ------------------------------------------------------------------ results

  renderResults() {
    const g = this.grade;
    const alerts = detections(this.events_);
    const rows = history(this.run).map(({ step, choice }) => {
      const ok = isEvidence(this.events_, step.id, this.answers[step.id]);
      const caught = alerts.filter((a) => a.key === step.id);
      return h('li', { class: `eg-res${ok ? ' ok' : ''}` },
        h('div', { class: 'eg-card-head' }, h('a', { class: 'eg-tid', href: attackUrl(step.tid), target: '_blank', rel: 'noopener' }, step.tid), h('span', { class: 'eg-tactic' }, step.tactic), h('span', { class: 'eg-tname' }, step.tname),
          h('span', { class: ok ? 'eg-callok' : 'eg-callmiss' }, ok ? (this.misses[step.id] ? '✓ found (after retries)' : '✓ found') : 'not found')),
        h('code', {}, choice.cmd),
        caught.length ? h('p', { class: 'eg-alert' }, `SOC alert: ${caught.map((a) => a.text).join('; ')}`) : h('p', { class: 'eg-quiet' }, 'No alert fired on this move.'),
        h('p', { class: 'eg-fix' }, h('b', {}, 'Fix: '), step.defend));
    });
    this.root.append(h('div', { class: 'eg-wrap' },
      h('div', { class: 'eg-head' }, h('div', { class: 'eg-kicker' }, `Engagement results · ${ENGAGEMENT.client}`), h('div', { class: `pt-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'eg-panel' },
        h('h1', {}, `${g.pct}%`),
        h('ul', { class: 'eg-score' },
          h('li', {}, `Hunt: found ${g.found} of ${g.total} of your own traces in the SIEM.`),
          h('li', {}, g.loud ? `Stealth: ${g.loud} loud move${g.loud > 1 ? 's' : ''} (-15 each).` : 'Stealth: no loud moves.'),
          h('li', {}, `The SOC got ${g.alerts} alert${g.alerts === 1 ? '' : 's'} tonight. A real attacker who hid better would have got fewer; a SOC that tuned its rules would have caught more.`),
          g.strikes ? h('li', { class: 'eg-strike' }, `Rules of engagement: ${g.strikes} strike${g.strikes > 1 ? 's' : ''} (-15 each). Prove access; never take the data.`) : null,
          this.run.finished ? h('li', {}, 'Proof token: ', h('code', { class: 'eg-flag' }, FLAG)) : null),
        this.best ? h('p', { class: 'eg-note' }, `Best so far: ${this.best.letter} (${this.best.pct}%)`) : null,
        h('p', { class: 'eg-lede' }, 'The one-line report: an old backup leaked a service-account password, the same password opened SSH from the internet and the internal file share, and nothing stopped the DMZ from reaching the LAN. Three cheap fixes (no secrets in the web root, no password SSH, segment the DMZ) break the whole chain.')),
      h('ol', { class: 'eg-results' }, rows),
      h('div', { class: 'eg-foot' },
        h('button', { type: 'button', class: 'eg-again', onclick: () => { this.sound2?.play('click'); this.reset(); this.start(); } }, '↻ Run it again'),
        h('button', { type: 'button', class: 'eg-quit', onclick: () => this.exit() }, 'Done'))));
  }
}
