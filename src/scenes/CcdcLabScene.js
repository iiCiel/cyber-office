import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_LAB } from '../data/ccdcLabScenario.js';
import {
  newGame, runLine, answerInject, runRedTeam, expire, score, progress, recordBest,
  rolesFor, devicesForRole, injectsForRole, ROLES, MODES,
} from '../game/ccdcLab.js';
import '../ui/screen.css';
import '../ui/competitions.css';

// CCDC hands-on blue-team scene. The player picks a role seat, then moves between the boxes that seat owns —
// each with its OWN working terminal (bash / PowerShell / firewall rule editor) — and TYPES the admin commands
// to inspect and harden them. Scored services update live from what they type. No multiple-choice: the only
// "choices" are the real commands they enter.
export class CcdcLabScene extends Phaser.Scene {
  constructor() { super('CcdcLab'); }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenario = data?.scenario || CCDC_LAB;
  }

  create() {
    this.cameras.main.setBackgroundColor('#06100c');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true;
    this.role = ROLES.ALL;
    this.phase = 'brief';
    this.deadline = 0;
    this.lastClockText = '';
    this.out = {}; // per-device terminal output buffer: { devId: [{cls,text}] }
    this.cmdHist = {}; // per-device command history
    this.histPos = {};
    this.activeDev = null;

    this.root = h('div', { class: 'screen open ccdc-screen', id: 'ccdclab' });
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
    if (this.phase !== this.renderedPhase) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
    this.renderedPhase = this.phase;
    if (this.phase === 'brief') this.renderBrief();
    else if (this.phase === 'play') this.renderPlay();
    else this.renderDebrief();
  }

  header(kicker, right) {
    return h('header', { class: 'cc-head' },
      h('div', {}, h('div', { class: 'cc-kicker' }, kicker), h('div', { class: 'cc-org' }, this.scenario.company)),
      right || null);
  }

  clockLabel() { return `${Math.round((this.scenario.clockSeconds || 0) / 60)}-minute`; }

  // ---- brief: pick a role seat + mode --------------------------------------
  renderBrief() {
    const seats = rolesFor(this.scenario);
    this.root.append(h('div', { class: 'cc-wrap' },
      this.header('CCDC · Blue team · hands-on defence'),
      h('div', { class: 'cc-panel cc-intro' },
        h('h1', {}, this.scenario.company),
        h('p', { class: 'cc-lede' }, this.scenario.tagline),
        h('p', { class: 'cc-lede' }, 'This is hands-on: you open each box’s own terminal and TYPE the commands to inspect and harden it — bash on the Linux boxes, PowerShell on the domain controller, a pfSense-style rule editor on the firewall. Keep the four scored services UP. A red team probes anything you leave open.'),
        h('div', { class: 'cc-scored' },
          h('h2', {}, 'Scored services — keep these UP'),
          h('ul', { class: 'cc-scored-list' }, this.scenario.services.map((s) =>
            h('li', {}, h('span', { class: 'cc-svc-proto' }, s.proto.toUpperCase()), h('span', { class: 'cc-svc-name' }, s.name), h('span', { class: 'cc-svc-host' }, `${s.host} · ${s.ip}`)))),
          h('p', { class: 'cc-score-formula' }, 'Score  =  service uptime  +  injects  −  compromises  −  SLA'))),
      h('div', { class: 'cc-panel cc-mode' },
        h('h2', {}, 'Pick your seat'),
        h('p', { class: 'cc-sec-note' }, 'Real CCDC is a team with specialised roles. Drill one seat, or play the whole team at once.'),
        h('div', { class: 'cc-roles' }, seats.map((r) =>
          h('button', { type: 'button', class: `cc-role-btn${this.role === r.id ? ' on' : ''}`, 'aria-pressed': this.role === r.id ? 'true' : 'false', onclick: () => { this.role = r.id; this.render(); } },
            h('b', {}, r.name),
            h('span', { class: 'cc-role-boxes' }, this.seatBoxes(r.id)),
            h('span', {}, r.blurb))))),
      h('div', { class: 'cc-panel cc-mode' },
        h('h2', {}, 'How you want to play'),
        h('div', { class: 'cc-mode-row' },
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? ' on' : ''}`, onclick: () => { this.guided = true; this.render(); } },
            h('b', {}, 'Guided'), h('span', {}, 'The checklist and coaching for every box are shown. Learn the playbook.')),
          h('button', { type: 'button', class: `cc-mode-btn${this.guided ? '' : ' on'}`, onclick: () => { this.guided = false; this.render(); } },
            h('b', {}, `Competition · ${this.clockLabel()} clock`), h('span', {}, 'A live countdown. At 0:00 the round ends and the red team runs.')))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-go', onclick: () => this.startRound() }, 'Sit down at the keyboard →'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Back'))));
  }

  seatBoxes(roleId) {
    const ds = devicesForRole(this.scenario, roleId).map((d) => d.name);
    const inj = injectsForRole(this.scenario, roleId).length;
    const bits = [...ds];
    if (inj) bits.push(`${inj} injects`);
    return bits.join(' · ');
  }

  // ---- round lifecycle -----------------------------------------------------
  startRound() {
    this.sound2?.play('select');
    this.state = newGame(this.scenario, { mode: this.guided ? MODES.GUIDED : MODES.COMPETITION, role: this.role });
    this.out = {};
    this.cmdHist = {};
    this.histPos = {};
    for (const d of this.state.deviceList) {
      this.out[d.id] = [{ cls: 'sys', text: `Connected to ${d.name} (${d.host} · ${d.ip}) — ${d.os}. Simulated; nothing is executed.` }, { cls: 'sys', text: 'Type "help", or click a checklist step on the right to put it on the command line.' }];
      this.cmdHist[d.id] = [];
      this.histPos[d.id] = 0;
    }
    this.activeDev = this.state.deviceList[0]?.id || null;
    this.deadline = this.state.timeLimitSec ? Date.now() + this.state.timeLimitSec * 1000 : 0;
    this.lastClockText = '';
    this.phase = 'play';
    this.render();
  }

  // ---- play workspace ------------------------------------------------------
  renderPlay() {
    const p = progress(this.state);
    const devices = this.state.deviceList;
    const dev = devices.find((d) => d.id === this.activeDev) || devices[0];
    const injects = this.state.injectList;

    this.root.append(h('div', { class: 'cc-wrap wide' },
      this.header(this.guided ? 'Defend · guided' : 'Defend · competition',
        h('div', { class: 'cc-head-right' }, this.deadline ? this.clockEl() : null, this.serviceBar())),
      h('div', { class: 'cc-progress' },
        h('span', {}, `Findings hardened: ${p.fixed}/${p.findingsTotal}`),
        injects.length ? h('span', {}, `Injects submitted: ${p.injectsDone}/${p.injectsTotal}`) : null,
        h('span', {}, `Services up: ${p.servicesUp}/${p.servicesTotal}`)),
      h('div', { class: 'cc-devtabs', role: 'tablist' }, devices.map((d) => {
        const openOnBox = this.state.findingList.filter((f) => f.host === d.id && this.state.findings[f.id].status !== 'fixed').length;
        return h('button', { type: 'button', role: 'tab', class: `cc-devtab k-${d.kind}${d.id === dev.id ? ' on' : ''}`, 'aria-selected': d.id === dev.id ? 'true' : 'false', onclick: () => { this.activeDev = d.id; this.render(); } },
          h('b', {}, d.name), h('span', { class: 'cc-devtab-host' }, d.host), openOnBox ? h('span', { class: 'cc-devtab-open' }, `${openOnBox} to fix`) : h('span', { class: 'cc-devtab-done' }, '✓'));
      })),
      this.devicePanel(dev),
      injects.length ? this.injectsPanel(injects) : null,
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-go cc-endround', onclick: () => this.endRound() }, 'End the round — run the red team →'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Quit'))));

    const screen = this.root.querySelector('.eg-out');
    if (screen) screen.scrollTop = screen.scrollHeight;
    if (this.phase === 'play') setTimeout(() => this.root.querySelector('.eg-input')?.focus(), 0);
  }

  devicePanel(dev) {
    const out = this.out[dev.id] || [];
    const input = h('input', { class: 'eg-input', type: 'text', 'aria-label': `Command for ${dev.name}`, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', onkeydown: (e) => this.termKey(e, dev.id) });
    const screen = h('div', { class: 'eg-out', role: 'log', 'aria-live': 'polite', 'aria-label': `${dev.name} terminal output` },
      out.map((l) => h('div', { class: `eg-line ${l.cls || ''}` }, l.text)));
    const term = h('div', { class: 'eg-term', onclick: (e) => { if (!e.target.closest('button')) input.focus(); } },
      screen,
      h('div', { class: 'eg-cmdline' }, h('span', { class: 'eg-prompt' }, dev.prompt || `${dev.user || 'analyst'}@${dev.host}:~$`), input));

    const side = h('aside', { class: 'cc-dev-side' },
      h('div', { class: 'cc-dev-brief' }, h('b', {}, `${dev.name} — ${dev.os}`), h('p', {}, dev.brief)),
      this.guided ? h('div', { class: 'cc-checklist-box' },
        h('div', { class: 'cc-label' }, 'First-15-minutes checklist (click to load a command)'),
        h('ul', { class: 'cc-check' }, (dev.checklist || []).map((c) => h('li', {},
          h('button', { type: 'button', class: 'cc-check-cmd', onclick: () => { input.value = c.split('  ')[0]; input.focus(); } }, c))))) : h('div', { class: 'cc-checklist-box' }, h('p', { class: 'cc-sec-note' }, 'Competition mode: no checklist. Investigate with real commands, then harden. Type "help".')));

    return h('div', { class: 'cc-dev-grid' }, h('div', { class: 'cc-term-wrap' }, h('div', { class: 'cc-kicker' }, `${dev.name} · ${dev.kind === 'pwsh' ? 'PowerShell' : dev.kind === 'firewall' ? 'firewall rule editor' : 'bash'} (simulated)`), term), side);
  }

  termKey(e, devId) {
    e.stopPropagation();
    const input = e.currentTarget;
    const hist = this.cmdHist[devId];
    if (e.key === 'Enter') { e.preventDefault(); this.exec(devId, input.value); }
    else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); this.histPos[devId] = Math.max(0, this.histPos[devId] - 1); input.value = hist[this.histPos[devId]] || ''; }
    else if (e.key === 'ArrowDown' && hist.length) { e.preventDefault(); this.histPos[devId] = Math.min(hist.length, this.histPos[devId] + 1); input.value = hist[this.histPos[devId]] || ''; }
    else if (e.key === 'Escape') input.blur();
  }

  exec(devId, text) {
    const dev = this.state.deviceList.find((d) => d.id === devId);
    const prompt = dev.prompt || `${dev.user || 'analyst'}@${dev.host}:~$`;
    const buf = this.out[devId];
    if (text.trim()) { this.cmdHist[devId].push(text.trim()); this.histPos[devId] = this.cmdHist[devId].length; }
    const res = runLine(this.state, devId, text);
    if (res.effects.clear) { this.out[devId] = []; this.render(); return; }
    buf.push({ cls: 'cmd', text: `${prompt} ${text}` });
    for (const l of res.lines) buf.push(l);
    // Guided mode: after a fix or a trap, show the coaching line so grading is learnable.
    if (this.guided && res.effects.why) buf.push({ cls: 'note', text: `Coach: ${res.effects.why}` });
    const e = res.effects;
    this.sound2?.play(e.fixed ? 'select' : (e.dropped && e.dropped.length) || e.trapId ? 'error' : e.stepId ? 'select' : 'click');
    this.render();
  }

  serviceBar() {
    const services = Object.values(this.state.services);
    return h('div', { class: 'cc-svcbar', 'aria-label': 'Scored service status' }, services.map((s) =>
      h('span', { class: `cc-svc-pill ${s.state}` },
        h('i', { class: 'cc-dot', 'aria-hidden': 'true' }), h('b', {}, s.name.replace(/ \(.*\)$/, '')),
        h('span', { class: 'cc-svc-state' }, s.state === 'up' ? 'UP' : 'DOWN'))));
  }

  // ---- injects (free-written deliverables) ---------------------------------
  injectsPanel(injects) {
    return h('div', { class: 'cc-panel' },
      h('h2', { class: 'cc-sec-title' }, 'Management injects (IR / captain)'),
      h('p', { class: 'cc-sec-note' }, 'Written business tasks from the white team. Draft each deliverable and submit it — worth real points.'),
      h('ul', { class: 'cc-injects' }, injects.map((i) => this.injectCard(i))));
  }

  injectCard(i) {
    const rec = this.state.injects[i.id];
    const ta = h('textarea', { class: 'cc-inj-ta', rows: '3', 'aria-label': i.title, placeholder: 'Write your deliverable…', disabled: rec.done ? '' : undefined }, rec.answer || '');
    return h('li', { class: `cc-inject${rec.done ? ' answered' : ''}`, 'data-inject': i.id },
      h('div', { class: 'cc-inj-head' }, h('span', { class: 'cc-inj-pts' }, `${i.points} pts`), h('span', { class: 'cc-inj-from' }, i.from)),
      h('h3', { class: 'cc-inj-title' }, i.title),
      h('p', { class: 'cc-inj-prompt' }, i.prompt),
      rec.done
        ? h('div', {}, h('p', { class: 'cc-flash ok' }, '✓ Submitted to the white team.'), this.guided ? h('p', { class: 'cc-inj-model' }, h('b', {}, 'A strong answer: '), i.model) : null)
        : h('div', {}, ta, h('button', { type: 'button', class: 'cc-inj-submit', onclick: () => { answerInject(this.state, i.id, ta.value); this.sound2?.play('select'); this.render(); } }, 'Submit deliverable')));
  }

  // ---- competition clock ---------------------------------------------------
  remainingMs() { return this.deadline ? Math.max(0, this.deadline - Date.now()) : 0; }
  fmtClock(ms) { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

  clockEl() {
    const ms = this.remainingMs();
    return h('div', { class: `cc-clock${ms <= 120000 ? ' low' : ''}`, role: 'timer', 'aria-label': 'Time left in the round' },
      h('span', { class: 'cc-clock-label' }, 'Time left'), h('b', { class: 'cc-clock-val' }, this.fmtClock(ms)));
  }

  tickClock() {
    if (!this.deadline || this.phase !== 'play') return;
    const ms = this.remainingMs();
    if (ms <= 0) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finishRound(); return; }
    const text = this.fmtClock(ms);
    if (text === this.lastClockText) return;
    this.lastClockText = text;
    const el = this.root?.querySelector('.cc-clock');
    if (el) { el.querySelector('.cc-clock-val').textContent = text; el.classList.toggle('low', ms <= 120000); }
  }

  endRound() { this.deadline = 0; runRedTeam(this.state); this.finishRound(); }

  finishRound() {
    this.grade = score(this.state);
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.phase = 'debrief';
    this.render();
  }

  // ---- debrief -------------------------------------------------------------
  renderDebrief() {
    const g = this.grade;
    const compromised = new Set(g.compromises.map((c) => c.id));
    this.root.append(h('div', { class: 'cc-wrap' },
      h('header', { class: 'cc-head' },
        h('div', {}, h('div', { class: 'cc-kicker' }, `Round over · ${this.scenario.company}`), h('div', { class: 'cc-org' }, 'Red team has run')),
        h('div', { class: `cc-grade g${g.letter}` }, g.letter)),
      h('div', { class: 'cc-panel cc-scorecard' },
        h('h1', {}, 'Scorecard'),
        this.timedOut ? h('p', { class: 'cc-timeout' }, '⏱ Time ran out. Whatever was still open when the clock hit 0:00 is what the red team walked through.') : null,
        h('div', { class: 'cc-tally' },
          this.tallyRow('Service uptime', `+${g.servicePts}`, `of ${g.serviceMax}`, 'ok'),
          this.tallyRow('Injects', `+${g.injectPts}`, `of ${g.injectMax}`, 'ok'),
          this.tallyRow('SLA violations', g.slaPenalty ? `−${g.slaPenalty}` : '0', `${g.slaCount} outage${g.slaCount === 1 ? '' : 's'} you caused`, g.slaPenalty ? 'bad' : 'ok'),
          this.tallyRow('Compromises', g.compromisePenalty ? `−${g.compromisePenalty}` : '0', `${g.compromises.length} breach${g.compromises.length === 1 ? '' : 'es'}`, g.compromisePenalty ? 'bad' : 'ok'),
          h('div', { class: 'cc-tally-row total' }, h('span', {}, 'Total'), h('b', {}, `${g.raw}`), h('span', {}, `of ${g.max} · ${g.pct}%`))),
        h('p', { class: 'cc-verdict' }, this.verdict(g))),
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Scored services at the buzzer'),
        h('ul', { class: 'cc-svc-review' }, Object.values(this.state.services).map((s) =>
          h('li', { class: s.state },
            h('span', { class: `cc-dot ${s.state}`, 'aria-hidden': 'true' }), h('b', {}, s.name),
            h('span', { class: 'cc-svc-verdict' }, s.state === 'up' ? `UP — +${s.points} kept` : `DOWN — ${s.points} lost`),
            s.drops ? h('span', { class: 'cc-svc-sla' }, `${s.drops} outage${s.drops === 1 ? '' : 's'} · −${s.drops * (this.scenario.slaPenalty || 0)} SLA`) : null)))),
      g.compromises.length ? h('div', { class: 'cc-panel cc-breaches' },
        h('h2', {}, 'What the red team got in through'),
        h('ul', {}, g.compromises.map((c) => h('li', {}, h('b', {}, c.title), h('p', {}, c.impact), h('span', { class: 'cc-pen' }, `−${c.penalty}`))))) : null,
      h('div', { class: 'cc-panel' },
        h('h2', {}, 'Every finding, reviewed'),
        h('ul', { class: 'cc-review' }, this.state.findingList.map((f) => {
          const fixed = this.state.findings[f.id].status === 'fixed';
          const breached = compromised.has(f.id);
          return h('li', { class: fixed ? 'ok' : breached ? 'bad' : 'warn' },
            h('div', { class: 'cc-rev-head' }, h('span', { class: `cc-sev s-${f.severity.toLowerCase()}` }, f.severity), h('b', {}, `${f.host}: ${f.title}`),
              h('span', { class: `cc-rev-status ${fixed ? 'ok' : 'bad'}` }, fixed ? '✓ hardened' : breached ? '✗ breached' : '✗ left open')),
            h('p', {}, h('b', {}, 'Coach: '), f.teach),
            h('p', { class: 'cc-fix' }, h('b', {}, 'The fix: '), f.fix.why));
        }))),
      h('div', { class: 'cc-foot' },
        h('button', { type: 'button', class: 'cc-again', onclick: () => this.replay() }, '↻ Run the round again'),
        h('button', { type: 'button', class: 'cc-quit', onclick: () => this.exit() }, 'Done'))));
  }

  tallyRow(label, value, sub, tone) {
    return h('div', { class: `cc-tally-row ${tone}` }, h('span', {}, label), h('b', {}, value), h('span', { class: 'cc-tally-sub' }, sub));
  }

  verdict(g) {
    if (g.pct >= 90) return 'Competition-ready. You hardened the boxes at the keyboard and kept the services serving — a winning round.';
    if (g.pct >= 75) return 'Strong round. Re-check the finding you left open or the service you dropped; those are the points to the top of the scoreboard.';
    if (g.pct >= 60) return 'A real first attempt. The red team got in somewhere, or you knocked a service over. Read the reviews and run it again.';
    return 'Rough round — exactly why you practise. Work the checklist in order, and watch the scored-service bar before every risky command.';
  }

  replay() { this.sound2?.play('click'); this.phase = 'brief'; this.render(); }
}
