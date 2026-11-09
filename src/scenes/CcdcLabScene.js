import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_LAB } from '../data/ccdcLabScenario.js';
import { CCDC_SCENARIOS } from '../data/ccdcScenarios.js';
import {
  newGame, runLine, answerInject, runRedTeam, expire, score, recordBest, requestRevert,
  rolesFor, devicesForRole, injectsForRole, ROLES, MODES,
} from '../game/ccdcLab.js';
import { attachEngine, tickTo, notePasswordRotated, notePcrFiled } from '../game/ccdcEngine.js';
import { createSiem } from '../game/siemGen.js';
import { STORIES as SIEM_STORIES } from '../data/siemStories.js';
import { liveTeamScore, standings, roster } from '../game/ccdcTeams.js';
import { ROUND_LENGTHS, DAY_SECONDS } from '../game/ccdcRound.js';
import { gameTime, redLogSpecs } from '../game/ccdcRed.js';
import { DEFAULT_PASSWORD } from '../game/ccdcBox.js';
import { submitIncident } from '../game/ccdcIncident.js';
import { IncidentApp } from '../ui/ccdc/IncidentApp.js';
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
    this.lengthId = 'short';
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
            h('tr', {}, h('th', {}, 'Round'), h('td', {}, `${ROUND_LENGTHS[this.lengthId].seconds / 60} min (09:00 to 16:00 on the competition clock)`)),
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
        h('p', {}, 'The scoring engine checks each service every 30 seconds. Do not change the IP addresses of scored hosts. Your only view is your own team\'s service status: no running score and no comparison with other teams during the competition.'),
        h('p', {}, `All accounts start with the password `, h('code', {}, DEFAULT_PASSWORD), '.'),
        h('table', { class: 'ccx-tbl' },
          h('thead', {}, h('tr', {}, ['Service', 'Host', 'Port(s)', 'Check', 'Points'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sc.services.map((s) => h('tr', {},
            h('td', {}, s.name), h('td', { class: 'mono' }, `${s.host} (${s.ip})`), h('td', { class: 'mono' }, `${s.proto}/${s.ports.join(',')}`), h('td', {}, s.check || ''), h('td', { class: 'num' }, s.points))))),
        h('h2', {}, '4. Rules of the round'),
        h('ol', {},
          h('li', {}, 'Scoring: about 40% service uptime, 40% injects, 20% Red Team. Final standings are published after the competition.'),
          h('li', {}, 'Red Team is active from the drop flag. Expect disruption from 12:00 and destructive activity after 14:30.'),
          h('li', {}, 'Injects arrive through the inject portal with deadlines. Late deliverables score zero.'),
          h('li', {}, 'Incident reports can be filed at any time. A report with evidence, timestamps, remediation and prevention can win back the points that activity cost.'),
          h('li', {}, 'Tech Support can revert a virtual machine to its original state. Each revert costs points and undoes your work on that machine.'),
          h('li', {}, 'Changing the password of a scored account without a Password Change Request breaks scoring for that service.'),
          h('li', {}, 'All team logs are forwarded to Splunk. Use it to find out how the attacker got in.')),
        h('h2', {}, '5. Your seat and round type'),
        h('div', { class: 'ccx-form-row ccx-seats' }, h('span', { class: 'ccx-form-label' }, 'Seat:'),
          seats.map((r) => radio('ccx-seat', this.role === r.id, () => { this.role = r.id; this.render(); }, r.name, this.seatBoxes(r.id)))),
        h('div', { class: 'ccx-form-row', 'data-length': '' }, h('span', { class: 'ccx-form-label' }, 'Length:'),
          Object.values(ROUND_LENGTHS).map((l) => radio('ccx-length', this.lengthId === l.id, () => { this.lengthId = l.id; this.render(); }, `${l.label} · ${l.seconds / 60} min`, l.pool ? 'The whole day: 30 injects, Red Team over a full hour.' : 'The same day compressed: 5 injects, Red Team moves fast.'))),
        h('div', { class: 'ccx-form-row' }, h('span', { class: 'ccx-form-label' }, 'Round:'),
          radio('ccx-mode', this.guided, () => { this.guided = true; this.render(); }, 'Practice', 'No buzzer. A playbook with every step is on the desktop. Injects have no deadline.'),
          radio('ccx-mode', !this.guided, () => { this.guided = false; this.render(); }, 'Competition', 'Live clock and deadlines. No playbook and no hints: the terminals print only what the real commands print.')),
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
    this.state = newGame(sc, { seed: this.seed, mode: this.guided ? MODES.GUIDED : MODES.COMPETITION, role: this.role, length: this.lengthId });
    const scale = DAY_SECONDS / ROUND_LENGTHS[this.lengthId].seconds;
    this.siem = createSiem(sc, { seed: this.state.seed, liveRate: 60 / scale });
    // Both round types run the live scoring engine (the scoreboard and the other teams need a clock). Practice
    // has no buzzer and no inject deadlines; ending the round fast-forwards the remaining checks and red-team
    // waves against the boxes as they are, exactly like competition mode.
    attachEngine(this.state, typeof this.siem.attacker === 'string' ? this.siem.attacker : undefined);
    if (this.guided) {
      this.state.timeLimitSec = this.state.scenario.clockSeconds;
      for (const t of Object.values(this.state.engine.injectTimers)) { t.released = true; t.releaseAt = 0; t.dueAt = Infinity; }
    }
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

  gameElapsed() { return this.elapsed() * (this.state?.timeScale || 1); }

  revert(id) {
    requestRevert(this.state, id);
    this.sound2?.play('click');
    this.jb?.refresh();
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
    if (this.guided && ((e.dropped && e.dropped.length) || e.trapId)) this.jb?.toast({ app: 'Scoring Engine', title: 'Service check failing', text: `${(e.dropped || []).join(', ') || 'a service'} stopped answering after that change.`, cls: 'bad', open: 'score' });
    this.sound2?.play(!this.guided ? 'click' : e.fixed ? 'select' : (e.dropped && e.dropped.length) || e.trapId ? 'error' : 'click');
    return res;
  }

  windows() {
    const st = this.state;
    const sc = this.scenario;
    const wins = [];
    const fw = st.deviceList.find((d) => d.kind === 'firewall');
    wins.push({ id: 'score', kind: 'browser', icon: 'score', pinned: true, desktop: 'Scoring Engine', title: 'Scoring Engine', short: 'Scoreboard', tabLabel: this.guided ? 'Overview · Scoring Engine' : 'Services · Scoring Engine', url: `https://scoring.ccdc.local/${this.guided ? 'overview' : 'services'}`,
      create: () => new ScoreboardApp({ state: st, clock: () => this.elapsed(), full: this.guided, onRevert: (id) => this.revert(id) }) });
    if (st.injectList.length) {
      wins.push({ id: 'injects', kind: 'browser', icon: 'inject', pinned: true, desktop: 'NISE', title: 'NISE', short: 'NISE', tabLabel: 'National Inject Scoring Engine', url: 'https://nise.ccdc.local/injects',
        badge: () => (this.jb?.app('injects')?.unreadCount?.() ?? this.unreleasedUnread()),
        create: () => new InjectsApp({ state: st, guided: this.guided, clock: () => this.elapsed(), team: this.tn(), onNav: (w) => { if (w === 'services') this.jb.open('score'); }, onSubmit: (id, text) => this.submitInject(id, text) }) });
    }
    wins.push({ id: 'ir', kind: 'browser', icon: 'inject', pinned: true, desktop: 'Incident Reports', title: 'Incident Reports', short: 'Incidents', tabLabel: `Incident Reports · Team ${this.tn()}`, url: `https://injects.ccdc.local/team/${this.tn()}/incidents`,
      create: () => new IncidentApp({ state: st, guided: this.guided, onSubmit: (report) => submitIncident(st, report) }) });
    wins.push({ id: 'siem', kind: 'browser', icon: 'splunk', pinned: true, desktop: 'Splunk', title: 'Splunk', short: 'Splunk', tabLabel: 'Search | Splunk 9.2.1', url: `https://siem.${sc.id.split('-')[0]}.local:8000/en-US/app/search/search`,
      create: () => new SiemApp({ siem: this.siem, hunt: this.story?.hunt || [], clock: () => this.gameElapsed(), onHuntAnswer: (qid, text) => this.huntAnswer(qid, text) }) });
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
    this.jb.toast({ app: 'Discord', title: 'Captain', text: this.guided ? 'Practice round. Playbook is on the desktop. Scoreboard is live.' : 'Drop flag. Change the default passwords, then get the firewall up.', open: 'chat' });
  }

  trayInfo() {
    const st = this.state;
    if (!st?.engine) return {};
    const left0 = this.guided ? null : Math.max(0, this.deadline - Date.now());
    const wall = gameTime(st, this.elapsed());
    if (!this.guided) return { time: wall, clock: `${Math.ceil(left0 / 60000)} min left`, low: left0 <= 120000 };
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
    this.siem?.liveAt?.(sec * this.state.timeScale);
    this.drainEvents();
    if (!this.guided && Date.now() >= this.deadline) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finishRound(); return; }
    this.jb?.refresh();
  }

  // New engine events become what a real team would notice: toasts, Splunk lines for red-team activity.
  drainEvents() {
    const evs = this.state.engine.events;
    for (; this.seenEvents < evs.length; this.seenEvents++) {
      const e = evs[this.seenEvents];
      if (e.cls === 'inject') this.jb?.toast({ app: 'NISE', title: 'New inject released', text: e.text, open: 'injects' });
      else if (this.guided && e.cls === 'bad' && /SLA/.test(e.text)) this.jb?.toast({ app: 'Scoring Engine', title: 'SLA violation', text: e.text, cls: 'bad', open: 'score' });
      else if (this.guided && e.cls === 'redop') this.jb?.toast({ app: 'Coach', title: 'Red Team activity', text: e.text, cls: 'warn', open: 'siem' });
    }
    // Feed Red Team's work into Splunk, so it can be found by searching.
    const red = this.state.engine.red.events;
    const scale = this.state.timeScale;
    for (this.fedRed = this.fedRed || 0; this.fedRed < red.length; this.fedRed++) {
      const ev = red[this.fedRed];
      try {
        const at = ev.at * scale;
        if (ev.findingId) this.siem?.onWave?.(ev.findingId, at, 'compromised');
        this.siem?.addLines?.(redLogSpecs(this.state, ev, this.siem.epochOfClock(at)), at);
      } catch (err) { console.error(err); }
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
            g.findingsTotal ? row(['Red Team', `+${g.redKept}`, `of ${g.redPool}. Red Team got in ${g.compromises.length} way${g.compromises.length === 1 ? '' : 's'}${g.recovered ? `, ${g.recovered} points won back by incident reports` : ''}`], g.compromisePenalty ? 'bad' : '') : null,
            g.revertPenalty ? row(['Reverts', `−${g.revertPenalty}`, `${st.reverts.length} virtual machine(s) reverted by Tech Support`], 'bad') : null,
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
            h('tbody', {}, g.compromises.map((c) => h('tr', { class: 'bad' }, h('td', {}, c.title), h('td', {}, c.impact), h('td', { class: 'num' }, `−${c.charged ?? c.penalty}`)))))) : null,
        st.engine?.red?.events?.length ? h('div', { 'data-red-activity': '' }, h('h2', {}, '4a. What Red Team did'),
          h('table', { class: 'ccx-tbl' },
            h('thead', {}, h('tr', {}, ['Time', 'Host', 'Activity', 'Cost', 'Won back'].map((t) => h('th', {}, t)))),
            h('tbody', {}, st.engine.red.events.map((e) => h('tr', {}, h('td', { class: 'mono' }, gameTime(st, e.at)), h('td', { class: 'mono' }, e.host), h('td', {}, e.text), h('td', { class: 'num' }, `−${e.charged}`), h('td', { class: 'num' }, e.recovered ? `+${e.recovered}` : ''))))) ) : null,
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
          h('table', { class: 'ccx-tbl ccx-timeline' }, h('tbody', {}, st.engine.events.map((e) => h('tr', { class: e.cls }, h('td', { class: 'mono' }, gameTime(st, e.at)), h('td', {}, e.text)))))) : null,
        h('div', { class: 'ccx-doc-actions' },
          h('button', { type: 'button', class: 'ccx-btn primary', onclick: () => this.replay() }, 'Run the round again'),
          h('button', { type: 'button', class: 'ccx-btn', onclick: () => this.exit() }, 'Done')))));
  }

  verdict(g) {
    if (!g.findingsTotal) return g.pct >= 90 ? 'Captain-grade write-ups: every inject hit what the judges look for.' : 'Injects are graded item by item. Read what each one was missing below, then write them again.';
    if (g.pct >= 90) return 'Competition-ready. You hardened the boxes and kept the services serving.';
    if (g.pct >= 75) return 'Strong round. The finding you left open or the service you dropped is the gap to first place.';
    if (g.pct >= 60) return 'A real first attempt. The Red Team got in somewhere, or a service went down. Read the review and run it again.';
    return 'Rough round — exactly why teams practise. Work the boxes in order and check your services after every risky change.';
  }

  replay() { this.sound2?.play('click'); this.phase = 'brief'; this.state = null; this.seed = null; this.render(); }
}
