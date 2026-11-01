import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_LAB } from '../data/ccdcLabScenario.js';
import { CCDC_SCENARIOS } from '../data/ccdcScenarios.js';
import {
  newGame, runLine, answerInject, runRedTeam, expire, score, recordBest,
  rolesFor, devicesForRole, injectsForRole, ROLES, MODES,
} from '../game/ccdcLab.js';
import { attachEngine, tickTo, notePasswordRotated, notePcrFiled } from '../game/ccdcEngine.js';
import { createSiem } from '../game/siemGen.js';
import { STORIES as SIEM_STORIES } from '../data/siemStories.js';
import { liveTeamScore, standings, roster } from '../game/ccdcTeams.js';
import { JumpBox } from '../ui/ccdc/JumpBox.js';
import { PuttyApp } from '../ui/ccdc/PuttyApp.js';
import { SiemApp } from '../ui/ccdc/SiemApp.js';
import { ScoreboardApp } from '../ui/ccdc/ScoreboardApp.js';
import { InjectsApp } from '../ui/ccdc/InjectsApp.js';
import { ChatApp } from '../ui/ccdc/ChatApp.js';
import { PfSenseApp, pfConsoleBanner } from '../ui/ccdc/PfSenseApp.js';
import { WinDesktop } from '../ui/ccdc/WinDesktop.js';
import { PlaybookApp } from '../ui/ccdc/PlaybookApp.js';
import '../ui/screen.css';
import '../ui/competitions.css';
import '../ui/ccdc/ccdcdoc.css';
import '../ui/ccdc/pfsense.css';

// CCDC as a full simulation. The player logs in to their team's jump box (a Windows 10 workstation) and works
// the round the way a real team does: PuTTY into the Linux boxes, Remote Desktop into the Windows boxes, the
// pfSense webConfigurator for the firewall, Splunk over millions of seeded log lines to find how the attacker got
// in, the scoring engine's scoreboard against the other teams, the inject portal, and the team chat. Every admin
// action — typed or clicked — goes through the same graded lab engine (runLine).
export class CcdcLabScene extends Phaser.Scene {
  constructor() { super('CcdcLab'); }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
    this.scenarios = CCDC_SCENARIOS;
    this.scenario = data?.scenario || this.scenarios[0] || CCDC_LAB;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true;
    this.role = ROLES.ALL;
    this.phase = 'brief';
    this.deadline = 0;
    this.root = h('div', { class: 'screen open ccdc-screen ccx', id: 'ccdclab' });
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
      this.jb?.destroy();
      this.root.remove();
      document.body.classList.remove('portrait-ok');
    });
    // Esc only leaves from the brief/debrief: in the jump box Esc belongs to the apps (menus, dialogs).
    this.input.keyboard.on('keydown-ESC', () => { if (this.phase !== 'play') this.exit(); });
  }

  update() {
    this.tick();
    if (!this.layout) return;
    const r = this.game.canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key !== this.canvasRect) { this.canvasRect = key; this.layout(); }
  }

  exit() { this.deadline = 0; this.sound2?.play('click'); this.scene.start(this.returnTo); }

  render() {
    this.jb?.destroy();
    this.jb = null;
    clear(this.root);
    this.root.scrollTop = 0;
    this.root.classList.toggle('ccx-playing', this.phase === 'play');
    if (this.phase === 'brief') this.renderBrief();
    else if (this.phase === 'play') this.renderPlay();
    else this.renderDebrief();
  }

  // ---- brief: the team packet ------------------------------------------------------------------------------
  // Real CCDC teams get a "team packet" PDF the morning of: the scenario, the topology table, the scored
  // services and the rules. This is that packet, open in a PDF viewer, with the seat/mode form at the end.
  renderBrief() {
    const sc = this.scenario;
    const seats = rolesFor(sc);
    const radio = (name, checked, onchange, label, sub) => h('label', { class: `ccx-radio${checked ? ' on' : ''}` },
      h('input', { type: 'radio', name, checked: checked || null, onchange }), h('span', {}, h('b', {}, label), sub ? h('small', {}, sub) : null));
    this.root.append(h('div', { class: 'ccx-pdf' },
      h('div', { class: 'ccx-pdfbar' },
        h('span', { class: 'ccx-pdf-name' }, `${sc.id}_team-packet.pdf`),
        h('span', { class: 'ccx-pdf-page' }, '1 / 1'),
        h('span', { class: 'ccx-pdf-zoom' }, '100%'),
        h('button', { type: 'button', class: 'ccx-pdf-btn', onclick: () => this.exit() }, 'Close')),
      h('div', { class: 'ccx-page ccx-doc' },
        h('div', { class: 'ccx-doc-head' },
          h('div', {}, h('div', { class: 'ccx-doc-org' }, 'Collegiate Cyber Defense Competition — Practice Round'), h('h1', {}, 'Blue Team Packet')),
          h('table', { class: 'ccx-doc-meta' }, h('tbody', {},
            h('tr', {}, h('th', {}, 'Team'), h('td', {}, this.tn())),
            h('tr', {}, h('th', {}, 'Round'), h('td', {}, `${Math.round((sc.clockSeconds || 900) / 60)} min`)),
            h('tr', {}, h('th', {}, 'Classification'), h('td', {}, 'Competitor')))))),
      h('div', { class: 'ccx-page ccx-doc' },
        h('h2', {}, '1. Scenario'),
        this.scenarios.length > 1 ? h('div', { class: 'ccx-form-row' }, h('span', { class: 'ccx-form-label' }, 'Company:'),
          this.scenarios.map((s) => radio('ccx-co', s.id === sc.id, () => { this.scenario = s; this.role = ROLES.ALL; this.render(); }, s.company, `${s.devices.length} hosts · ${s.findings.length} findings`))) : null,
        h('p', {}, h('b', {}, sc.company), ` — ${sc.tagline}`),
        h('p', {}, 'Your team has just been hired as the IT staff. The previous administrators left in a hurry and the network has been neglected. Keep the business services running, answer the business tasks (injects) that management sends, and defend the network from the Red Team. Assume the network is already compromised.'),
        h('h2', {}, '2. Network inventory'),
        h('table', { class: 'ccx-tbl' },
          h('thead', {}, h('tr', {}, ['Hostname', 'IP address', 'Operating system', 'Access', 'Seat'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sc.devices.map((d) => h('tr', {},
            h('td', {}, d.host), h('td', { class: 'mono' }, d.ip), h('td', {}, d.os),
            h('td', {}, d.kind === 'pwsh' ? 'RDP (3389)' : d.kind === 'firewall' ? `https://${d.ip}/ · SSH` : 'SSH (22)'), h('td', {}, d.role))))),
        h('h2', {}, '3. Scored services'),
        h('p', {}, 'The scoring engine (198.51.100.9) checks each service every 30 seconds. Three failed checks in a row is an SLA violation. Do not change the IP addresses of scored hosts.'),
        h('table', { class: 'ccx-tbl' },
          h('thead', {}, h('tr', {}, ['Service', 'Host', 'Port(s)', 'Check', 'Points'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sc.services.map((s) => h('tr', {},
            h('td', {}, s.name), h('td', { class: 'mono' }, `${s.host} (${s.ip})`), h('td', { class: 'mono' }, `${s.proto}/${s.ports.join(',')}`), h('td', {}, s.check || ''), h('td', { class: 'num' }, s.points))))),
        h('h2', {}, '4. Rules of the round'),
        h('ol', {},
          h('li', {}, 'Score = service uptime + inject points − SLA violations − Red Team compromises. You are ranked against the other teams live on the scoring engine.'),
          h('li', {}, 'The Red Team attacks in waves throughout the round. A foothold left open at the next wave becomes a confirmed compromise.'),
          h('li', {}, 'Injects arrive through the inject portal with deadlines. Late deliverables score zero.'),
          h('li', {}, 'Changing the password of a scored account without a Password Change Request breaks scoring for that service.'),
          h('li', {}, 'All team logs are forwarded to Splunk. Use it to find out how the attacker got in.')),
        h('h2', {}, '5. Your seat and round type'),
        h('div', { class: 'ccx-form-row ccx-seats' }, h('span', { class: 'ccx-form-label' }, 'Seat:'),
          seats.map((r) => radio('ccx-seat', this.role === r.id, () => { this.role = r.id; this.render(); }, r.name, this.seatBoxes(r.id)))),
        h('div', { class: 'ccx-form-row' }, h('span', { class: 'ccx-form-label' }, 'Round:'),
          radio('ccx-mode', this.guided, () => { this.guided = true; this.render(); }, 'Practice', 'No buzzer. A playbook with every step is on the desktop. Injects have no deadline.'),
          radio('ccx-mode', !this.guided, () => { this.guided = false; this.render(); }, `Competition · ${Math.round((sc.clockSeconds || 900) / 60)}:00 clock`, 'Live clock, injects with deadlines, no playbook. At 0:00 the round ends.')),
        h('div', { class: 'ccx-doc-actions' },
          h('button', { type: 'button', class: 'ccx-btn primary', onclick: () => this.startRound() }, `Log in to TEAM${this.tn()}-WS01`),
          h('button', { type: 'button', class: 'ccx-btn', onclick: () => this.exit() }, 'Back')))));
  }

  // The team number comes from the scoring engine's seeded roster, so the packet, the jump box and the scoreboard agree.
  tn() { if (this.seed == null) this.seed = Math.floor(Math.random() * 1e9); return String(roster({ seed: this.seed }).find((t) => t.you).no).padStart(2, '0'); }

  seatBoxes(roleId) {
    const ds = devicesForRole(this.scenario, roleId).map((d) => d.host);
    const inj = injectsForRole(this.scenario, roleId).length;
    return [...ds, inj ? `${inj} injects` : null].filter(Boolean).join(', ');
  }

  // ---- round lifecycle -------------------------------------------------------------------------------------
  startRound() {
    this.sound2?.play('select');
    const sc = this.scenario;
    this.state = newGame(sc, { seed: this.seed, mode: this.guided ? MODES.GUIDED : MODES.COMPETITION, role: this.role });
    // Both round types run the live scoring engine (the scoreboard and the other teams need a clock). Practice
    // has no buzzer and no inject deadlines; ending the round fast-forwards the remaining checks and red-team
    // waves against the boxes as they are, exactly like competition mode.
    attachEngine(this.state);
    if (this.guided) {
      this.state.timeLimitSec = sc.clockSeconds || 900;
      for (const t of Object.values(this.state.engine.injectTimers)) { t.released = true; t.releaseAt = 0; t.dueAt = Infinity; }
    }
    this.siem = createSiem(sc, { seed: this.state.seed });
    this.story = { hunt: this.siem.hunt || SIEM_STORIES[sc.id]?.hunt || [] };
    this.huntAnswers = {};
    this.sessions = {};
    for (const d of this.state.deviceList) this.sessions[d.id] = { buffer: [], history: [] };
    this.startedAt = Date.now();
    this.deadline = this.guided ? 0 : Date.now() + this.state.timeLimitSec * 1000;
    this.seenEvents = 0;
    this.lastSec = -1;
    this.phase = 'play';
    this.render();
  }

  elapsed() {
    if (!this.state) return 0;
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    return this.guided ? Math.min(sec, Math.max(0, this.state.timeLimitSec - 1)) : Math.min(sec, this.state.timeLimitSec);
  }

  // One graded line on a device, from any window (PuTTY, PowerShell, ADUC click, pfSense form, playbook).
  run(devId, line) {
    let res;
    try { res = runLine(this.state, devId, line); } catch (err) { res = { lines: [{ cls: 'err', text: `${err?.message || 'error'}` }], effects: {} }; }
    const e = res.effects || {};
    if (this.guided && e.why) res.lines = [...res.lines, { cls: 'note', text: `Coach: ${e.why}` }];
    if (e.pcrRotated) notePasswordRotated(this.state);
    if ((e.dropped && e.dropped.length) || e.trapId) this.jb?.toast({ app: 'Scoring Engine', title: 'Service check failing', text: `${(e.dropped || []).join(', ') || 'a service'} stopped answering after that change.`, cls: 'bad', open: 'score' });
    this.sound2?.play(e.fixed ? 'select' : (e.dropped && e.dropped.length) || e.trapId ? 'error' : 'click');
    return res;
  }

  windows() {
    const st = this.state;
    const sc = this.scenario;
    const wins = [];
    const fw = st.deviceList.find((d) => d.kind === 'firewall');
    wins.push({ id: 'score', kind: 'browser', icon: 'score', pinned: true, desktop: 'Scoring Engine', title: 'Scoring Engine', short: 'Scoreboard', tabLabel: 'Overview · Scoring Engine', url: 'https://scoring.ccdc.local/overview',
      create: () => new ScoreboardApp({ state: st, clock: () => this.elapsed() }) });
    if (st.injectList.length) {
      wins.push({ id: 'injects', kind: 'browser', icon: 'inject', pinned: true, desktop: 'Inject Portal', title: 'Inject Portal', short: 'Injects', tabLabel: `Injects · Team ${this.tn()}`, url: `https://injects.ccdc.local/team/${this.tn()}`,
        badge: () => (this.jb?.app('injects')?.unreadCount?.() ?? this.unreleasedUnread()),
        create: () => new InjectsApp({ state: st, guided: this.guided, clock: () => this.elapsed(), onSubmit: (id, text) => this.submitInject(id, text) }) });
    }
    wins.push({ id: 'siem', kind: 'browser', icon: 'splunk', pinned: true, desktop: 'Splunk', title: 'Splunk', short: 'Splunk', tabLabel: 'Search | Splunk 9.2.1', url: `https://siem.${sc.id.split('-')[0]}.local:8000/en-US/app/search/search`,
      create: () => new SiemApp({ siem: this.siem, hunt: this.story?.hunt || [], clock: () => this.elapsed(), onHuntAnswer: (qid, text) => this.huntAnswer(qid, text) }) });
    if (fw) {
      wins.push({ id: 'pf', kind: 'browser', icon: 'pf', pinned: true, desktop: 'pfSense', title: `${fw.host} - pfSense`, short: 'pfSense', tabLabel: `${fw.host}.localdomain - Firewall: Rules: WAN`, url: `https://${fw.ip}/firewall_rules.php?if=wan`,
        create: () => new PfSenseApp({ state: st, dev: fw, clock: () => this.elapsed(), run: (l) => this.run(fw.id, l) }) });
      wins.push({ id: `ssh-${fw.id}`, kind: 'putty', icon: 'putty', title: `${fw.ip} - PuTTY`, short: `${fw.host} (SSH)`,
        create: () => new PuttyApp({ dev: fw, session: this.sessions[fw.id], banner: pfConsoleBanner(fw), run: (l) => this.run(fw.id, l) }) });
    }
    for (const d of st.deviceList) {
      if (d.kind === 'bash') {
        wins.push({ id: `ssh-${d.id}`, kind: 'putty', icon: 'putty', pinned: true, title: `${d.user || 'analyst'}@${d.host}: ~`, short: d.host,
          create: () => new PuttyApp({ dev: d, session: this.sessions[d.id], run: (l) => this.run(d.id, l) }) });
      } else if (d.kind === 'pwsh') {
        wins.push({ id: `rdp-${d.id}`, kind: 'rdp', icon: 'rdp', pinned: true, title: `${d.host} - ${d.ip} - Remote Desktop Connection`, short: d.host,
          create: () => new WinDesktop({ state: st, dev: d, clock: () => this.elapsed(), termBuffer: this.sessions[d.id].buffer, termHistory: this.sessions[d.id].history, run: (l) => this.run(d.id, l) }) });
      }
    }
    wins.push({ id: 'chat', kind: 'app', icon: 'chat', pinned: true, title: `Discord — #general — CCDC Team ${this.tn()}`, short: 'Discord',
      badge: () => this.jb?.app('chat')?.unreadCount?.() || 0,
      create: () => new ChatApp({ state: st, clock: () => this.elapsed() }) });
    if (this.guided) {
      wins.push({ id: 'playbook', kind: 'app', icon: 'folder', pinned: true, desktop: 'playbook.txt', title: 'playbook.txt - Notepad', short: 'Playbook',
        create: () => new PlaybookApp({ state: st, onPick: (dev, line) => this.loadCommand(dev, line) }) });
    }
    return wins;
  }

  unreleasedUnread() { return 0; }

  // Playbook click: open the device's own window and put the command on its command line.
  loadCommand(dev, line) {
    if (dev.kind === 'bash' || dev.kind === 'firewall') {
      const s = this.sessions[dev.id];
      if (dev.kind === 'firewall') s.shell = true;
      const app = this.jb.open(`ssh-${dev.id}`);
      if (dev.kind === 'firewall') { app.inMenu = false; }
      app.setInput?.(line);
    } else {
      const app = this.jb.open(`rdp-${dev.id}`);
      const w = app.openApp?.('ps');
      setTimeout(() => w?.app?.tv?.setInput(line), 0);
    }
  }

  renderPlay() {
    this.jb = new JumpBox({
      hostname: `TEAM${this.tn()}-WS01 (Administrator)`,
      windows: this.windows(),
      tray: () => this.trayInfo(),
      onEnd: () => this.endRound(),
      onQuit: () => this.exit(),
    });
    this.root.append(this.jb.el);
    // Start where a real team starts: the scoreboard open, the first box behind it.
    const first = this.state.deviceList[0];
    if (first) this.jb.open(first.kind === 'pwsh' ? `rdp-${first.id}` : first.kind === 'firewall' ? 'pf' : `ssh-${first.id}`);
    this.jb.open('score');
    if (this.guided) this.jb.open('playbook');
    this.jb.toast({ app: 'Discord', title: 'Captain', text: this.guided ? 'Practice round. Playbook is on the desktop. Scoreboard is live.' : 'Clock is running. Check the scoreboard, then get on your boxes.', open: 'chat' });
  }

  trayInfo() {
    const st = this.state;
    if (!st?.engine) return {};
    let rank = '';
    let pts = '';
    try {
      const rows = standings(st, this.elapsed());
      const me = rows.find((r) => r.you);
      rank = me ? `${me.rank}/${rows.length}` : '';
      pts = Math.round(liveTeamScore(st)).toLocaleString('en-US');
    } catch { /* teams sim optional */ }
    const left = this.guided ? null : Math.max(0, this.deadline - Date.now());
    const fmt = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    return { rank, score: pts, time: this.guided ? 'Practice' : 'Time left', clock: this.guided ? fmt(this.elapsed() * 1000) : fmt(left), low: !this.guided && left <= 120000 };
  }

  tick() {
    if (this.phase !== 'play' || !this.state) return;
    const sec = this.elapsed();
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    tickTo(this.state, sec);
    this.siem?.liveAt?.(sec);
    this.drainEvents();
    if (!this.guided && Date.now() >= this.deadline) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finishRound(); return; }
    this.jb?.refresh();
  }

  // New engine events become what a real team would notice: toasts, Splunk lines for red-team activity.
  drainEvents() {
    const evs = this.state.engine.events;
    for (; this.seenEvents < evs.length; this.seenEvents++) {
      const e = evs[this.seenEvents];
      if (e.cls === 'inject') this.jb?.toast({ app: 'Inject Portal', title: 'New inject released', text: e.text, open: 'injects' });
      else if (e.cls === 'bad' && /SLA/.test(e.text)) this.jb?.toast({ app: 'Scoring Engine', title: 'SLA violation', text: e.text, cls: 'bad', open: 'score' });
      else if (e.cls === 'bad' && /Compromise/.test(e.text)) this.jb?.toast({ app: 'Discord', title: 'Linux lead', text: 'Something is very wrong on one of our boxes — check Splunk.', cls: 'bad', open: 'siem' });
      else if (e.cls === 'red') this.jb?.toast({ app: 'Splunk', title: 'Alert: spike in authentication failures', text: 'Inbound attack traffic is rising. Search the last 15 minutes.', cls: 'warn', open: 'siem' });
    }
    // Feed every probe/compromise into the SIEM so the red team's work is findable in the logs.
    const probes = this.state.engine.probes;
    this.fedProbes = this.fedProbes || {};
    for (const [fid, outcome] of Object.entries(probes)) {
      if (this.fedProbes[fid] === outcome) continue;
      this.fedProbes[fid] = outcome;
      try { this.siem?.onWave?.(fid, this.state.engine.clock, outcome); } catch (err) { console.error(err); }
    }
  }

  submitInject(id, text) {
    const r = answerInject(this.state, id, text);
    if (r.ok && r.isPcr) notePcrFiled(this.state);
    this.sound2?.play(r.ok ? 'select' : 'error');
    return { ...r, grade: this.state.injects[id]?.grade, late: this.state.injects[id]?.late };
  }

  huntAnswer(qid, text) {
    const q = (this.story?.hunt || []).find((x) => x.id === qid);
    if (!q) return { ok: false, msg: 'Unknown question.' };
    const ok = (Array.isArray(q.accept) ? q.accept : [q.accept]).some((re) => re.test(String(text || '').trim()));
    this.huntAnswers[qid] = { text, ok };
    this.sound2?.play(ok ? 'select' : 'error');
    return { ok, msg: ok ? 'Correct — logged to your incident timeline.' : 'Not what the logs show. Keep digging.' };
  }

  huntScore() {
    const qs = this.story?.hunt || [];
    const per = 10;
    const got = qs.filter((q) => this.huntAnswers?.[q.id]?.ok).length;
    return { got, total: qs.length, pts: got * per, max: qs.length * per };
  }

  endRound() { this.deadline = 0; runRedTeam(this.state); this.finishRound(); }

  finishRound() {
    this.grade = score(this.state);
    this.hunt = this.huntScore();
    try { this.finalStandings = standings(this.state, this.state.timeLimitSec); } catch { this.finalStandings = null; }
    recordBest(this.scenario.id, this.grade);
    this.sound2?.play(this.grade.letter === 'A' || this.grade.letter === 'B' ? 'select' : 'error');
    this.phase = 'debrief';
    this.render();
  }

  // ---- debrief: the after-action report -------------------------------------------------------------------
  renderDebrief() {
    const g = this.grade;
    const st = this.state;
    const compromised = new Set(g.compromises.map((c) => c.id));
    const me = this.finalStandings?.find((r) => r.you);
    const row = (cells, cls) => h('tr', { class: cls || '' }, cells.map((c) => h('td', {}, c)));
    this.root.append(h('div', { class: 'ccx-pdf' },
      h('div', { class: 'ccx-pdfbar' },
        h('span', { class: 'ccx-pdf-name' }, `team${this.tn()}_after-action_${this.scenario.id}.pdf`),
        h('span', { class: 'ccx-pdf-zoom' }, '100%'),
        h('button', { type: 'button', class: 'ccx-pdf-btn', onclick: () => this.exit() }, 'Close')),
      h('div', { class: 'ccx-page ccx-doc ccx-aar' },
        h('div', { class: 'ccx-doc-head' },
          h('div', {}, h('div', { class: 'ccx-doc-org' }, `${this.scenario.company} · Team ${this.tn()} · White Team scoring`), h('h1', {}, 'After-Action Report')),
          h('div', { class: `ccx-grade g${g.letter}` }, g.letter)),
        this.timedOut ? h('p', { class: 'ccx-note' }, 'Time expired. Whatever was still open at 0:00 is what the Red Team walked through.') : null,
        me ? h('p', { class: 'ccx-rank' }, `Final standing: ${me.rank} of ${this.finalStandings.length} teams.`) : null,
        h('h2', {}, '1. Score summary'),
        h('table', { class: 'ccx-tbl ccx-tally' },
          h('thead', {}, h('tr', {}, ['Category', 'Points', 'Detail'].map((t) => h('th', {}, t)))),
          h('tbody', {},
            g.serviceMax ? row(['Service uptime', `+${g.servicePts}`, `of ${g.serviceMax}, earned check by check`]) : null,
            g.injectMax ? row(['Injects', `+${g.injectPts}`, `of ${g.injectMax}, graded against the rubric`]) : null,
            g.serviceMax ? row(['SLA violations', g.slaPenalty ? `−${g.slaPenalty}` : '0', `${g.slaCount} SLA violation(s): 3 missed checks in a row each`], g.slaPenalty ? 'bad' : '') : null,
            g.findingsTotal ? row(['Red Team compromises', g.compromisePenalty ? `−${g.compromisePenalty}` : '0', `${g.compromises.length} breach(es)`], g.compromisePenalty ? 'bad' : '') : null,
            this.hunt.total ? row(['Threat hunt (Splunk)', `${this.hunt.got}/${this.hunt.total}`, `questions answered from the logs (${this.hunt.pts}/${this.hunt.max} bonus, not in the letter grade)`]) : null,
            h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', {}, String(g.raw)), h('td', {}, `of ${g.max} · ${g.pct}%`)))),
        h('p', {}, this.verdict(g)),
        this.finalStandings ? h('div', {}, h('h2', {}, '2. Final standings'),
          h('table', { class: 'ccx-tbl' },
            h('thead', {}, h('tr', {}, ['Rank', 'Team', 'Score', 'Uptime', 'SLA'].map((t) => h('th', {}, t)))),
            h('tbody', {}, this.finalStandings.map((r) => h('tr', { class: r.you ? 'you' : '' },
              h('td', { class: 'num' }, r.rank), h('td', {}, r.team), h('td', { class: 'num' }, Math.round(r.score).toLocaleString('en-US')), h('td', { class: 'num' }, `${r.uptimePct ?? ''}%`), h('td', { class: 'num' }, r.sla ?? '')))))) : null,
        Object.keys(st.services).length ? h('div', {}, h('h2', {}, '3. Scored services'),
          h('table', { class: 'ccx-tbl' },
            h('thead', {}, h('tr', {}, ['Service', 'At the buzzer', 'Uptime', 'Points'].map((t) => h('th', {}, t)))),
            h('tbody', {}, Object.values(st.services).map((s) => {
              const b = g.serviceBreakdown?.find((x) => x.id === s.id);
              const c = st.engine?.checks?.[s.id];
              const tot = c ? c.ok + c.fail : 0;
              return h('tr', { class: s.state === 'up' ? '' : 'bad' }, h('td', {}, s.name), h('td', {}, s.state === 'up' ? 'UP' : 'DOWN'),
                h('td', { class: 'num' }, tot ? `${Math.round((c.ok / tot) * 100)}%` : '—'), h('td', { class: 'num' }, b ? `${b.earned} / ${b.max}` : ''));
            })))) : null,
        g.compromises.length ? h('div', {}, h('h2', {}, '4. Red Team compromises'),
          h('table', { class: 'ccx-tbl' },
            h('thead', {}, h('tr', {}, ['Finding', 'Impact', 'Penalty'].map((t) => h('th', {}, t)))),
            h('tbody', {}, g.compromises.map((c) => h('tr', { class: 'bad' }, h('td', {}, c.title), h('td', {}, c.impact + (c.halved ? ' (halved: covered by an on-time incident report)' : '')), h('td', { class: 'num' }, `−${c.charged ?? c.penalty}`)))))) : null,
        g.injectResults.length ? h('div', {}, h('h2', {}, '5. Injects as the judges graded them'),
          g.injectResults.map((r) => {
            const inj = st.injectList.find((x) => x.id === r.id);
            return h('div', { class: 'ccx-inj', 'data-inject-review': r.id },
              h('h3', {}, `${r.title} — ${r.late ? `late · 0/${r.max} pts` : r.answered ? `${r.points}/${r.max} pts` : 'not submitted · 0 pts'}`),
              r.late ? h('p', { class: 'cc-inj-late' }, 'Submitted after the deadline — a late deliverable scores 0, however good it is.') : null,
              r.answered && r.missing.length ? h('p', {}, h('b', {}, 'Missing: '), r.missing.join('; ')) : null,
              h('p', { class: 'ccx-model' }, h('b', {}, 'A strong answer: '), inj.model));
          })) : null,
        this.story?.hunt?.length ? h('div', {}, h('h2', {}, '6. How the attacker got in (from the logs)'),
          h('table', { class: 'ccx-tbl' },
            h('thead', {}, h('tr', {}, ['Question', 'Your answer', 'Explanation'].map((t) => h('th', {}, t)))),
            h('tbody', {}, this.story.hunt.map((q) => {
              const a = this.huntAnswers[q.id];
              return h('tr', { class: a?.ok ? '' : 'bad' }, h('td', {}, q.q || q.question), h('td', { class: 'mono' }, a ? `${a.text} ${a.ok ? '✓' : '✗'}` : '—'), h('td', {}, q.explain || ''));
            })))) : null,
        st.findingList.length ? h('div', {}, h('h2', {}, '7. Every finding, reviewed'),
          h('table', { class: 'ccx-tbl ccx-findings' },
            h('thead', {}, h('tr', {}, ['Sev', 'Host', 'Finding', 'Result', 'The fix'].map((t) => h('th', {}, t)))),
            h('tbody', {}, st.findingList.map((f) => {
              const fixed = st.findings[f.id].status === 'fixed';
              const breached = compromised.has(f.id);
              return h('tr', { class: fixed ? '' : 'bad' }, h('td', {}, h('span', { class: `cc-sev s-${f.severity.toLowerCase()}` }, f.severity)), h('td', { class: 'mono' }, f.host), h('td', {}, f.title, h('div', { class: 'ccx-small' }, f.teach)),
                h('td', {}, fixed ? 'Hardened' : breached ? 'Breached' : 'Left open'), h('td', {}, f.fix.why));
            })))) : null,
        st.engine?.events?.length ? h('div', {}, h('h2', {}, '8. Round timeline'),
          h('table', { class: 'ccx-tbl ccx-timeline' }, h('tbody', {}, st.engine.events.map((e) => h('tr', { class: e.cls }, h('td', { class: 'mono' }, this.fmt(e.at)), h('td', {}, e.text)))))) : null,
        h('div', { class: 'ccx-doc-actions' },
          h('button', { type: 'button', class: 'ccx-btn primary', onclick: () => this.replay() }, 'Run the round again'),
          h('button', { type: 'button', class: 'ccx-btn', onclick: () => this.exit() }, 'Done')))));
  }

  fmt(sec) { return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; }

  verdict(g) {
    if (!g.findingsTotal) return g.pct >= 90 ? 'Captain-grade write-ups: every inject hit what the judges look for.' : 'Injects are graded item by item. Read what each one was missing below, then write them again.';
    if (g.pct >= 90) return 'Competition-ready. You hardened the boxes and kept the services serving.';
    if (g.pct >= 75) return 'Strong round. The finding you left open or the service you dropped is the gap to first place.';
    if (g.pct >= 60) return 'A real first attempt. The Red Team got in somewhere, or a service went down. Read the review and run it again.';
    return 'Rough round — exactly why teams practise. Work the boxes in order and watch the scoreboard after every risky change.';
  }

  replay() { this.sound2?.play('click'); this.phase = 'brief'; this.state = null; this.seed = null; this.render(); }
}
