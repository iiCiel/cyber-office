import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_LAB } from '../data/ccdcLabScenario.js';
import { CCDC_SCENARIOS } from '../data/ccdcScenarios.js';
import {
  newGame, runLine, answerInject, runRedTeam, expire, score, recordBest, requestRevert, resetBoxes,
  rolesFor, devicesForRole, injectsForRole, ROLES, MODES,
} from '../game/ccdcLab.js';
import { attachEngine, tickTo, notePasswordRotated, notePcrFiled } from '../game/ccdcEngine.js';
import { createSiem } from '../game/siemGen.js';
import { STORIES as SIEM_STORIES } from '../data/siemStories.js';
import { liveTeamScore, standings, roster } from '../game/ccdcTeams.js';
import { ROUND_LENGTHS, clockAt, dayOf, roundSeconds } from '../game/ccdcRound.js';
import { gameTime, redLogSpecs } from '../game/ccdcRed.js';
import { DEFAULT_PASSWORD, setPower } from '../game/ccdcBox.js';
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
import { NetlabApp } from '../ui/ccdc/NetlabApp.js';
import { PanosApp } from '../ui/ccdc/PanosApp.js';
import { SupportApp, DocsApp } from '../ui/ccdc/SupportApp.js';
import { AcademyPanel } from '../ui/ccdc/AcademyPanel.js';
import { studyNext } from '../data/ccdcAcademyMore.js';
import { LESSONS } from '../data/ccdcAcademy.js';
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
    this.scenario = data?.scenario || this.scenarios.find((s) => s.netlab) || this.scenarios[0] || CCDC_LAB;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.sound2 = this.game.registry.get('sound');
    this.guided = true;
    this.learn = true;
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
            h('tr', {}, h('th', {}, 'Round'), h('td', {}, `${roundSeconds(ROUND_LENGTHS[this.lengthId], sc) / 60} min (${clockAt(sc, 0)} to ${clockAt(sc, dayOf(sc).hours * 3600)} on the competition clock)`)),
            h('tr', {}, h('th', {}, 'Classification'), h('td', {}, 'Competitor')))))),
      h('div', { class: 'ccx-page ccx-doc' },
        h('h2', {}, '1. Scenario'),
        this.scenarios.length > 1 ? h('div', { class: 'ccx-form-row' }, h('span', { class: 'ccx-form-label' }, 'Company:'),
          this.scenarios.map((s) => radio('ccx-co', s.id === sc.id, () => { this.scenario = s; this.role = ROLES.ALL; this.render(); }, s.company, `${s.devices.length} hosts · ${s.findings.length} findings`))) : null,
        h('p', {}, h('b', {}, sc.company), ` — ${sc.tagline}`),
        sc.netlab ? h('p', {}, 'Access is through NETLAB+ consoles only. NISE and Support Services are in the browser. Consoles open at the drop flag, after the Welcome Inject is submitted. The company and what is planted on the boxes are invented; the network follows the Midwest team packets.') : null,
        h('p', {}, 'Your team has just been hired as the IT staff. The previous administrators left in a hurry and the network has been neglected. Keep the business services running, answer the business tasks (injects) that management sends, and defend the network from the Red Team. Assume the network is already compromised.'),
        h('h2', {}, '2. Network inventory'),
        sc.netlab ? h('table', { class: 'ccx-tbl' },
          h('thead', {}, h('tr', {}, ['VM', 'Zone', 'Internal', 'Public NAT', 'Operating system', 'Login'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sc.devices.map((d) => h('tr', {}, h('td', {}, d.tab), h('td', {}, d.zone || '-'), h('td', { class: 'mono' }, d.ip), h('td', { class: 'mono' }, d.nat || '-'), h('td', {}, d.os), h('td', { class: 'mono' }, d.login || 'root / sysadmin')))))
          : h('table', { class: 'ccx-tbl' },
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
        sc.netlab ? h('ol', {},
          h('li', {}, 'Scored services are checked at intervals through the public addresses, for real function: page content, a login, a mail retrieved, a name resolved.'),
          h('li', {}, 'Do not filter or restrict public services by source address. Keep ICMP working on every public address. Each violation costs points.'),
          h('li', {}, 'Do not change internal addressing, VLANs, system names or public addresses without an inject saying so.'),
          h('li', {}, 'Staff passwords are the scored POP3 accounts. File a Password Change Request in Support Tickets, or POP3 fails after you change them.'),
          h('li', {}, 'The firewall web interface is at https://172.20.242.150 from a VM on the User network. Admin login admin / Changeme123.'),
          h('li', {}, `Red Team is active from the drop flag. Expect disruption from about ${clockAt(sc, (dayOf(sc).hours * 3600 * 3) / 7)} and destructive activity after ${clockAt(sc, (dayOf(sc).hours * 3600 * 5.5) / 7)}.`),
          h('li', {}, 'Injects arrive through NISE with deadlines. Late deliverables score zero. Incident reports need what happened, addresses, a timeline, what was affected and the fix.'),
          h('li', {}, 'Tech Support can restore a VM through a ticket. It costs points. Power cycling a VM from NETLAB+ does not restore anything.')) :
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
          Object.values(ROUND_LENGTHS).filter((l) => !l.realTime || sc.netlab).map((l) => radio('ccx-length', this.lengthId === l.id, () => { this.lengthId = l.id; this.render(); }, `${l.label} · ${roundSeconds(l, sc) / 60} min`, l.realTime ? 'The real thing: the whole block at real speed.' : l.pool ? 'The whole day: every inject, Red Team over a full hour.' : 'The same day compressed: 5 injects, Red Team moves fast.'))),
        h('div', { class: 'ccx-form-row' }, h('span', { class: 'ccx-form-label' }, 'Round:'),
          sc.netlab ? radio('ccx-mode', this.learn, () => { this.learn = true; this.guided = true; this.render(); }, 'Learn', 'Start here. Step-by-step lessons on the real consoles. No clock, no Red Team until a lesson brings one.') : null,
          radio('ccx-mode', this.guided && !this.learnOn(), () => { this.learn = false; this.guided = true; this.render(); }, 'Practice', 'No buzzer. A playbook with every step is on the desktop. Injects have no deadline.'),
          radio('ccx-mode', !this.guided, () => { this.learn = false; this.guided = false; this.render(); }, 'Competition', 'Live clock and deadlines. No playbook and no hints: the terminals print only what the real commands print.')),
        h('div', { class: 'ccx-doc-actions' },
          h('button', { type: 'button', class: 'ccx-btn primary', onclick: () => this.startRound() }, this.learnOn() ? 'Start learning' : sc.netlab ? 'Open the competition portals' : `Log in to TEAM${this.tn()}-WS01`),
          h('button', { type: 'button', class: 'ccx-btn', onclick: () => this.exit() }, 'Back')))));
  }

  // The team number comes from the scoring engine's seeded roster, so the packet, the jump box and the scoreboard agree.
  tn() { if (this.scenario.teamNumber) return String(this.scenario.teamNumber).padStart(2, '0'); if (this.seed == null) this.seed = Math.floor(Math.random() * 1e9); return String(roster({ seed: this.seed }).find((t) => t.you).no).padStart(2, '0'); }

  seatBoxes(roleId) {
    const ds = devicesForRole(this.scenario, roleId).map((d) => d.host);
    const inj = injectsForRole(this.scenario, roleId).length;
    return [...ds, inj ? `${inj} injects` : null].filter(Boolean).join(', ');
  }

  learnOn() { return !!this.learn && !!this.scenario.netlab; }

  // ---- round lifecycle -------------------------------------------------------------------------------------
  startRound() {
    this.sound2?.play('select');
    const sc = this.scenario;
    const learning = this.learnOn();
    this.state = newGame(sc, { seed: this.seed, mode: this.guided ? MODES.GUIDED : MODES.COMPETITION, role: learning ? ROLES.ALL : this.role, length: learning ? 'long' : this.lengthId });
    this.siem = createSiem(sc, { seed: this.state.seed, liveRate: 60 / this.state.timeScale });
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
    this.awaitingDrop = !learning && this.state.injectList.some((i) => i.welcome);
    this.lineLog = [];
    if (learning) { this.state.engine.red.next = Infinity; this.state.timeLimitSec = 1e7; }
    this.deadline = this.guided || this.awaitingDrop ? 0 : Date.now() + this.state.timeLimitSec * 1000;
    this.seenEvents = 0;
    this.lastSec = -1;
    this.phase = 'play';
    this.render();
  }

  // The clock starts here: the Welcome Inject is in, and the consoles open.
  dropFlag() {
    this.awaitingDrop = false;
    this.startedAt = Date.now();
    this.deadline = this.guided ? 0 : Date.now() + this.state.timeLimitSec * 1000;
    this.lastSec = -1;
    this.jb?.toast({ app: 'White Team', title: 'DROP FLAG', text: 'Your NETLAB+ consoles are open. Scoring has started.', open: 'netlab' });
    this.jb?.refresh();
  }

  onTicket({ category, vm, text, restore }) {
    this.sound2?.play('click');
    if (category === 'Password Change Request') {
      notePcrFiled(this.state);
      return { status: 'Resolved', reply: 'The scoring engine has the new passwords.' };
    }
    if (category === 'Tech Support') {
      if (restore && vm) { requestRevert(this.state, vm); this.jb?.refresh(); return { status: 'Resolved', reply: 'The VM was restored to its original state. A penalty was applied.' }; }
      return { status: 'Assigned', reply: 'Please include the VM and what you need. Tech Support cannot make configuration changes for you.' };
    }
    return { status: 'Assigned', reply: 'The check is running. We cannot tell you why a service is failing.' };
  }

  onBrowser(url) {
    const u = String(url).replace(/^https?:\/\//, '');
    if (u.startsWith('172.20.242.150')) { this.jb.open('pan-web'); return []; }
    if (u.startsWith('172.20.241.20')) { this.jb.open('siem'); return []; }
    return [{ cls: 'err', text: `The connection to ${u.split('/')[0]} timed out.` }];
  }

  netlabWindows(st, wins) {
    const sc = this.scenario;
    const tiles = [
      { id: 'chat', label: 'CCDC Chat', glyph: 'Z', glyphClass: 'chat', open: () => this.jb.open('chat') },
      { id: 'docs', label: 'CCDC Docs', glyph: 'O', glyphClass: 'docs', open: () => this.jb.open('docs') },
      { id: 'status', label: 'CCDC Status', glyph: 'S', glyphClass: 'status', open: () => this.jb.open('score') },
      { id: 'netlab', label: 'NETLAB', glyph: 'N', open: () => this.jb.open('netlab') },
      { id: 'nise', label: 'NISE (Inject Submission)', glyph: 'N', open: () => this.jb.open('injects') },
      { id: 'tickets', label: 'Support Tickets', glyph: 'T', glyphClass: 'tickets' },
    ];
    wins.push({ id: 'support', kind: 'browser', icon: 'chrome', pinned: true, desktop: 'Support Services', title: 'Support Services', short: 'Support', tabLabel: 'My applications', url: 'https://auth.ccdc.events/',
      create: () => new SupportApp({ tiles, vms: st.deviceList, onTicket: (t) => this.onTicket(t) }) });
    wins.push({ id: 'netlab', kind: 'browser', icon: 'chrome', pinned: true, desktop: 'NETLAB+', title: 'NETLAB+', short: 'NETLAB+', tabLabel: `${sc.labName} - NETLAB+`, url: 'https://netlab.ccdc.events/',
      create: () => new NetlabApp({
        state: st, scenario: sc, team: this.tn(), sessions: this.sessions, clock: () => this.elapsed(), locked: () => this.awaitingDrop,
        clockLabel: () => { const [hh, mm] = gameTime(st, this.elapsed()).split(':').map(Number); return { time: `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`, date: `${dayOf(sc).date}/2026` }; },
        run: (id, l) => this.run(id, l),
        noteLine: (id, line) => { this.lineLog?.push({ vm: id, line: String(line).trim().replace(/\s+/g, ' ') }); if (this.coach) setTimeout(() => this.coach?.onLine(), 0); },
        onBrowser: (u, id, line) => { this.lineLog?.push({ vm: id, line: String(line).trim().replace(/\s+/g, ' ') }); if (this.coach) setTimeout(() => this.coach?.onLine(), 0); return this.onBrowser(u); },
        onPower: (id, on) => { setPower(st, id, on); this.jb.refresh(); },
        undock: (id) => this.jb.open(`undock-${id}`), closeUndock: (id) => this.jb.minimize(`undock-${id}`),
      }) });
    wins.push({ id: 'docs', kind: 'browser', icon: 'folder', title: 'CCDC Docs', short: 'Docs', tabLabel: 'Files', url: 'https://docs.ccdc.events/', create: () => new DocsApp({ files: [['Team packet.pdf', 'Read it before the drop flag.'], ['Rules.pdf', ''], ['Inject templates/', 'Keep your memo header ready.']] }) });
    for (const d of st.deviceList) {
      wins.push({ id: `undock-${d.id}`, kind: 'browser', icon: 'chrome', title: `${d.tab} - NETLAB+`, short: d.tab, tabLabel: `${d.tab} - NETLAB+`, url: 'https://netlab.ccdc.events/console', create: () => ({ el: h('div', { class: 'nl-undock' }) }) });
    }
    const fw = st.deviceList.find((d) => d.panos);
    if (fw) wins.push({ id: 'pan-web', kind: 'browser', icon: 'chrome', title: 'PA-VM', short: 'PA-VM', tabLabel: 'PA-VM', url: `https://${fw.ip}/php/login.php`, create: () => new PanosApp({ state: st, dev: fw, run: (l) => this.run(fw.id, l) }) });
  }

  gameElapsed() { return this.elapsed() * (this.state?.timeScale || 1); }

  revert(id) {
    requestRevert(this.state, id);
    this.sound2?.play('click');
    this.jb?.refresh();
  }

  elapsed() {
    if (!this.state || this.awaitingDrop) return 0;
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    return this.guided ? Math.min(sec, Math.max(0, this.state.timeLimitSec - 1)) : Math.min(sec, this.state.timeLimitSec);
  }

  // One graded line on a device, from any window (PuTTY, PowerShell, ADUC click, pfSense form, playbook).
  run(devId, line) {
    let res;
    try { res = runLine(this.state, devId, line); } catch (err) { res = { lines: [{ cls: 'err', text: `${err?.message || 'error'}` }], effects: {} }; }
    const e = res.effects || {};
    this.lineLog?.push({ vm: devId, line: String(line).trim().replace(/\s+/g, ' ') });
    if (this.coach) setTimeout(() => this.coach?.onLine(), 0);
    if (this.guided && !this.learnOn() && e.why) res.lines = [...res.lines, { cls: 'note', text: `Coach: ${e.why}` }];
    if (e.pcrRotated) notePasswordRotated(this.state);
    if (this.guided && !this.learnOn() && ((e.dropped && e.dropped.length) || e.trapId)) this.jb?.toast({ app: 'Scoring Engine', title: 'Service check failing', text: `${(e.dropped || []).join(', ') || 'a service'} stopped answering after that change.`, cls: 'bad', open: 'score' });
    this.sound2?.play(!this.guided ? 'click' : e.fixed ? 'select' : (e.dropped && e.dropped.length) || e.trapId ? 'error' : 'click');
    return res;
  }

  windows() {
    const st = this.state;
    const sc = this.scenario;
    const wins = [];
    const fw = sc.netlab ? null : st.deviceList.find((d) => d.kind === 'firewall');
    if (sc.netlab) this.netlabWindows(st, wins);
    wins.push({ id: 'score', kind: 'browser', icon: 'score', pinned: true, desktop: 'Scoring Engine', title: 'Scoring Engine', short: sc.netlab ? 'CCDC Status' : 'Scoreboard', tabLabel: this.guided ? 'Overview · Scoring Engine' : 'Services · Scoring Engine', url: `https://scoring.ccdc.local/${this.guided ? 'overview' : 'services'}`,
      create: () => new ScoreboardApp({ state: st, clock: () => this.elapsed(), full: this.guided, onRevert: (id) => this.revert(id) }) });
    if (st.injectList.length) {
      wins.push({ id: 'injects', kind: 'browser', icon: 'inject', pinned: true, desktop: 'NISE', title: 'NISE', short: 'NISE', tabLabel: 'National Inject Scoring Engine', url: 'https://nise.ccdc.local/injects',
        badge: () => (this.jb?.app('injects')?.unreadCount?.() ?? this.unreleasedUnread()),
        create: () => new InjectsApp({ state: st, guided: this.guided, clock: () => this.elapsed(), team: this.tn(), onNav: (w) => { if (w === 'services') this.jb.open('score'); }, onSubmit: (id, text) => this.submitInject(id, text) }) });
      if (sc.netlab) wins[wins.length - 1].url = 'https://nise.ccdc.events/injects';
    }
    wins.push({ id: 'ir', kind: 'browser', icon: 'inject', pinned: true, desktop: 'Incident Reports', title: 'Incident Reports', short: 'Incidents', tabLabel: `Incident Reports · Team ${this.tn()}`, url: `https://injects.ccdc.local/team/${this.tn()}/incidents`,
      create: () => new IncidentApp({ state: st, guided: this.guided, onSubmit: (report) => submitIncident(st, report) }) });
    wins.push({ id: 'siem', kind: 'browser', icon: 'splunk', pinned: !sc.netlab, desktop: sc.netlab ? null : 'Splunk', title: 'Splunk', short: 'Splunk', tabLabel: 'Search | Splunk 9.2.1', url: `https://siem.${sc.id.split('-')[0]}.local:8000/en-US/app/search/search`,
      create: () => new SiemApp({ siem: this.siem, hunt: this.story?.hunt || [], clock: () => this.gameElapsed(), onHuntAnswer: (qid, text) => this.huntAnswer(qid, text) }) });
    if (fw) {
      wins.push({ id: 'pf', kind: 'browser', icon: 'pf', pinned: true, desktop: 'pfSense', title: `${fw.host} - pfSense`, short: 'pfSense', tabLabel: `${fw.host}.localdomain - Firewall: Rules: WAN`, url: `https://${fw.ip}/firewall_rules.php?if=wan`,
        create: () => new PfSenseApp({ state: st, dev: fw, clock: () => this.elapsed(), run: (l) => this.run(fw.id, l) }) });
      wins.push({ id: `ssh-${fw.id}`, kind: 'putty', icon: 'putty', title: `${fw.ip} - PuTTY`, short: `${fw.host} (SSH)`,
        create: () => new PuttyApp({ dev: fw, session: this.sessions[fw.id], banner: pfConsoleBanner(fw), run: (l) => this.run(fw.id, l) }) });
    }
    for (const d of sc.netlab ? [] : st.deviceList) {
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
    if (this.scenario.netlab) {
      this.jb.open('netlab');
      const c = this.jb.app('netlab').openVm(dev.id);
      if (dev.kind === 'pwsh') { const w = c?.openPs?.(); setTimeout(() => w?.app?.tv?.setInput(line), 0); } else c?.setInput?.(line);
      return;
    }
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
      hostname: this.scenario.netlab ? 'Competitor laptop' : `TEAM${this.tn()}-WS01 (Administrator)`,
      windows: this.windows(),
      tray: () => this.trayInfo(),
      onEnd: () => this.endRound(),
      onQuit: () => this.exit(),
    });
    this.root.append(this.jb.el);
    this.coach = null;
    if (this.learnOn()) {
      this.jb.open('netlab');
      this.coach = new AcademyPanel({ state: this.state, host: this.coachHost() });
      this.jb.el.classList.add('ac-on');
      this.jb.el.append(this.coach.el);
      return;
    }
    if (this.scenario.netlab) {
      this.jb.open('netlab');
      this.jb.open('injects');
      this.jb.toast({ app: 'White Team', title: 'Welcome Inject', text: 'Submit the Welcome Inject in NISE. Consoles open at the drop flag.', open: 'injects' });
      if (this.guided) this.jb.open('playbook');
      return;
    }
    // Start where a real team starts: the scoreboard open, the first box behind it.
    const first = this.state.deviceList[0];
    if (first) this.jb.open(first.kind === 'pwsh' ? `rdp-${first.id}` : first.kind === 'firewall' ? 'pf' : `ssh-${first.id}`);
    this.jb.open('score');
    if (this.guided) this.jb.open('playbook');
    this.jb.toast({ app: 'Discord', title: 'Captain', text: this.guided ? 'Practice round. Playbook is on the desktop. Scoreboard is live.' : 'Drop flag. Change the default passwords, then get the firewall up.', open: 'chat' });
  }

  coachHost() {
    const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
    return {
      logSize: () => this.lineLog.length,
      showVm: (id) => { this.jb.open('netlab'); this.jb.app('netlab').openVm(id); },
      showWin: (id) => { this.jb.open(id); },
      load: (id, line) => this.loadCommand(this.state.deviceList.find((d) => d.id === id), line),
      startLesson: (lesson) => { resetBoxes(this.state, lesson.vms); this.jb.refresh(); },
      onToggle: (hidden) => this.jb.el.classList.toggle('ac-closed', hidden),
      ctx: (mark) => ({
        st: this.state,
        ran: (vm, want) => this.lineLog.slice(mark).some((l) => l.vm === vm && (want instanceof RegExp ? want.test(l.line) : l.line === norm(want))),
        loggedIn: (vm) => !!this.jb.app('netlab')?.loggedIn(vm),
        lastIncident: () => this.state.incidents?.[this.state.incidents.length - 1],
      }),
    };
  }

  trayInfo() {
    const st = this.state;
    if (this.learnOn()) return { time: 'Learn', clock: 'no clock' };
    if (!st?.engine) return {};
    if (this.awaitingDrop) return { time: 'Before', clock: 'drop flag' };
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
    if (this.phase !== 'play' || !this.state || this.awaitingDrop) return;
    const sec = this.elapsed();
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    tickTo(this.state, sec);
    this.siem?.liveAt?.(sec * this.state.timeScale);
    this.drainEvents();
    if (!this.guided && Date.now() >= this.deadline) { this.deadline = 0; expire(this.state); this.timedOut = true; this.finishRound(); return; }
    this.jb?.refresh();
    this.coach?.refresh();
  }

  // New engine events become what a real team would notice: toasts, Splunk lines for red-team activity.
  drainEvents() {
    const evs = this.state.engine.events;
    for (; this.seenEvents < evs.length; this.seenEvents++) {
      const e = evs[this.seenEvents];
      if (e.cls === 'inject') this.jb?.toast({ app: 'NISE', title: 'New inject released', text: e.text, open: 'injects' });
      else if (this.learnOn()) continue;
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
    if (r.ok && this.awaitingDrop && this.state.injectList.find((i) => i.id === id)?.welcome) setTimeout(() => this.dropFlag(), 600);
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
        this.scenario.netlab ? this.studyBlock(g) : null,
        h('h2', {}, '1. Score summary'),
        h('table', { class: 'ccx-tbl ccx-tally' },
          h('thead', {}, h('tr', {}, ['Category', 'Points', 'Detail'].map((t) => h('th', {}, t)))),
          h('tbody', {},
            g.serviceMax ? row(['Service uptime', `+${g.servicePts}`, `of ${g.serviceMax}, earned check by check`]) : null,
            g.injectMax ? row(['Injects', `+${g.injectPts}`, `of ${g.injectMax}, graded against the rubric`]) : null,
            g.serviceMax ? row(['SLA violations', g.slaPenalty ? `−${g.slaPenalty}` : '0', `${g.slaCount} SLA violation(s): 3 missed checks in a row each`], g.slaPenalty ? 'bad' : '') : null,
            g.findingsTotal ? row(['Red Team', `+${g.redKept}`, `of ${g.redPool}. Red Team got in ${g.compromises.length} way${g.compromises.length === 1 ? '' : 's'}${g.recovered ? `, ${g.recovered} points won back by incident reports` : ''}`], g.compromisePenalty ? 'bad' : '') : null,
            g.violationPenalty ? row(['Rule violations', `−${g.violationPenalty}`, g.ruleViolations.map((v) => v.text).join(' ')], 'bad') : null,
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

  studyBlock(g) {
    const list = studyNext(this.state, g);
    if (!list.length) return h('div', { 'data-study': '' }, h('h2', {}, 'What to study next'), h('p', {}, 'Nothing obvious. Try a longer round.'));
    return h('div', { 'data-study': '' }, h('h2', {}, 'What to study next'),
      h('table', { class: 'ccx-tbl' }, h('thead', {}, h('tr', {}, ['Lesson', 'Why'].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((x) => h('tr', {}, h('td', {}, LESSONS.find((l) => l.id === x.lesson)?.title || x.lesson), h('td', {}, x.why))))));
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
