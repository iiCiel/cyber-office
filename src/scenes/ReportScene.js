import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h } from '../ui/dom.js';
import { GameState, recordCaseBest } from '../game/GameState.js';
import { getDay, loadDay, LAST_DAY } from '../days/index.js';
import { money } from '../game/scoring.js';
import '../ui/screen.css';

// End-of-day report card: what you caught, what you missed, what it cost, what you learned.
// After the last day it also shows the week: every day's grade, the total cost and how the story ended.
// Rendered as HTML over the canvas (same scaling trick as the in-game monitors).
const ICON = { good: '✓', ok: '~', bad: '✗' };
const LABEL = { good: 'Caught it', ok: 'Partly', bad: 'Missed' };
const DAY_GRADE = (pct) => (pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F');

export class ReportScene extends Phaser.Scene {
  constructor() {
    super('Report');
  }

  init(data) {
    this.gameState = data?.state;
  }

  create() {
    const st = this.gameState || new GameState();
    if (!this.gameState) st.load();
    this.gameState = st;
    const day = loadDay(st.day, st);
    const r = day.score(st, st.campaign);
    const cf = st.caseId ? day.caseFile : null; // Case Files mode: a real-breach recreation
    // Record the day in the week (idempotent: replaying a day replaces its entry), or the case's best score.
    if (cf) recordCaseBest(st.caseId, r);
    else st.recordDay(r, day.carry ? day.carry(st, r) : {});
    if (!st.hasEvent('report-viewed')) st.log('report-viewed', { grade: r.grade, pct: r.pct });
    const last = !cf && st.day >= LAST_DAY;

    const areas = [...new Set(r.items.map((i) => i.area))];
    const item = (i) =>
      h(
        'details',
        { class: `ritem ${i.outcome}`, open: i.outcome !== 'good', 'data-item': i.id },
        h(
          'summary',
          {},
          h('span', { class: 'ricon', 'aria-label': LABEL[i.outcome] }, ICON[i.outcome]),
          h('span', { class: 'rtitle' }, i.title),
          i.cost ? h('span', { class: `rcost ${i.outcome}` }, `-${money(i.cost.amount)}`) : null,
          h('span', { class: 'rpts' }, `${i.points}/${i.max}`),
        ),
        h('p', { class: 'rwhat' }, i.what),
        h('p', { class: 'rwhy' }, i.why),
        i.cost ? h('p', { class: 'rcosttext' }, `Cost: ${i.cost.text}.`) : null,
        h('p', { class: 'rtag' }, `Skill: ${i.teaches.skill} · Security+ ${i.teaches.secplus}`),
      );

    const caught = r.items.filter((i) => i.outcome === 'good').length;
    const next = !last && !cf ? getDay(st.day + 1) : null;
    const root = h(
      'div',
      { class: 'screen open report-screen', id: 'report', 'data-day': st.day },
      h(
        'div',
        { class: 'report' },
        h(
          'header',
          {},
          h(
            'div',
            {},
            h('div', { class: 'kicker' }, cf ? `Case file · ${cf.company} · ${cf.when}` : `${day.date.name}, 5:00 PM · Halcyon Mutual SOC · Day ${day.n} of ${LAST_DAY}`),
            h('h1', {}, cf ? `Case report: ${cf.title}` : `Day ${day.n} report`),
            h('p', { class: 'sum' }, `You handled ${caught} of ${r.items.length} things well. ${cf ? 'Cost in this replay' : 'Cost to the company today'}: `, h('b', { class: r.cost > 20000 ? 'bad' : '' }, r.costText), '.'),
            r.capped ? h('p', { class: 'sum capped' }, 'Your points say A, but one outright miss caps the day at B.') : null,
          ),
          h('div', { class: `grade g${r.grade}`, 'data-grade': r.grade }, r.grade, h('small', {}, `${r.pct}%`)),
        ),
        last ? this.weekSection(st, day) : null,
        ...areas.map((a) => h('section', {}, h('h2', {}, a), r.items.filter((i) => i.area === a).map(item))),
        h(
          'section',
          {},
          h('h2', {}, cf ? 'What your choices cost in this replay' : 'What today cost Halcyon'),
          r.costs.length
            ? h(
                'table',
                { class: 'costs' },
                r.costs.map((c) => h('tr', {}, h('td', {}, c.text), h('td', { class: 'amt' }, money(c.amount)))),
                h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', { class: 'amt' }, r.costText)),
              )
            : h('p', {}, 'Nothing. A clean day.'),
        ),
        h(
          'section',
          {},
          h('h2', {}, 'Skills you practiced'),
          h('div', { class: 'chips' }, r.skills.map((s) => h('span', { class: `chip ${s.outcome}` }, `${ICON[s.outcome]} ${s.skill}`, h('small', {}, `Security+ ${s.secplus}`)))),
        ),
        cf ? this.caseSections(cf, r) : null,
        !last && !cf && day.teaser
          ? h('section', { class: 'teaser' }, h('h2', {}, `Tomorrow: ${next.date.name}`), day.teaser.map((l) => h('p', {}, l)))
          : null,
        h(
          'footer',
          {},
          cf
            ? h('button', { type: 'button', class: 'again', 'data-action': 'case-files', onclick: () => this.leave(() => this.scene.start('CaseFiles')) }, '📁 Back to Case Files')
            : next
              ? h('button', { type: 'button', class: 'again', 'data-action': 'next-day', onclick: () => this.nextDay() }, `▶ Start ${next.date.name}`)
              : h('button', { type: 'button', class: 'again', 'data-action': 'play-again', onclick: () => this.playAgain() }, '↻ Play the week again'),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'replay-day', onclick: () => this.replayDay() }, cf ? '↻ Replay this case' : `↻ Replay ${day.date.name}`),
          cf ? h('button', { type: 'button', class: 'secondary', 'data-action': 'title', onclick: () => this.leave(() => this.scene.start('Title')) }, 'Title screen') : null,
          next && !cf ? h('button', { type: 'button', class: 'secondary', 'data-action': 'play-again', onclick: () => this.playAgain() }, 'Start the week over') : null,
          h('a', { href: 'https://github.com/iiCiel/cyber-office', target: '_blank', rel: 'noopener' }, 'How this game was made (GitHub)'),
        ),
      ),
    );
    root.style.width = `${VIEW_W}px`;
    root.style.height = `${VIEW_H}px`;
    document.body.append(root);
    this.root = root;

    const layout = () => {
      const rect = this.game.canvas.getBoundingClientRect();
      const k = rect.width / VIEW_W;
      root.style.left = `${rect.left}px`;
      root.style.top = `${rect.top}px`;
      root.style.transform = `scale(${k})`;
    };
    layout();
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      root.remove();
    });
    const sound = this.game.registry.get('sound');
    sound?.resume();
    sound?.play(r.grade === 'A' || r.grade === 'B' ? 'chime' : 'back');
    root.addEventListener('pointerdown', (e) => { if (e.target.closest('button, a')) sound?.play('click'); });
    this.input.keyboard.enabled = false;
    this.input.keyboard.disableGlobalCapture();
  }

  weekSection(st, day) {
    const hist = st.campaign.history;
    const total = hist.reduce((s, d) => s + d.cost, 0);
    const pts = hist.reduce((s, d) => s + d.points, 0);
    const max = hist.reduce((s, d) => s + d.max, 0);
    const pct = max ? Math.round((pts / max) * 100) : 0;
    const ending = day.weekEnding ? day.weekEnding(st, st.campaign) : null;
    return h(
      'section',
      { class: 'week', 'data-week': '' },
      h('h2', {}, 'Your week'),
      ending ? h('div', { class: `ending ${ending.tone}` }, h('h3', {}, ending.title), ending.lines.map((l) => h('p', {}, l))) : null,
      h(
        'table',
        { class: 'costs weekt' },
        h('tr', {}, h('th', {}, 'Day'), h('th', {}, 'Grade'), h('th', { class: 'amt' }, 'Cost')),
        hist.map((d) => h('tr', {}, h('td', {}, getDay(d.day).title), h('td', {}, `${d.grade} (${d.pct}%)`), h('td', { class: 'amt' }, money(d.cost)))),
        h('tr', { class: 'total' }, h('td', {}, 'The week'), h('td', { 'data-week-grade': DAY_GRADE(pct) }, `${DAY_GRADE(pct)} (${pct}%)`), h('td', { class: 'amt' }, money(total))),
      ),
    );
  }

  // The "what really happened" half of a case report: the real timeline, what went wrong at the real
  // company, the fixes mapped to MITRE ATT&CK, sources, and a resume line the player has actually earned.
  caseSections(cf, r) {
    const earned = ['A', 'B', 'C'].includes(r.grade);
    const resume = cf.resume.replace('{grade}', r.grade);
    const copyBtn = h('button', { type: 'button', class: 'secondary copy', 'data-action': 'copy-resume' }, 'Copy');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(resume).then(() => (copyBtn.textContent = 'Copied ✓'), () => (copyBtn.textContent = 'Select and copy it'));
    });
    return h(
      'div',
      { class: 'casefile', 'data-casefile': cf.id },
      h('section', {}, h('h2', {}, 'What really happened'), h('p', { class: 'cf-lede' }, cf.headline),
        h('ol', { class: 'timeline' }, cf.timeline.map((t) => h('li', {}, h('span', { class: 'when' }, t.when), h('span', {}, t.what))))),
      h('section', {}, h('h2', {}, `How it ended for ${cf.company}`), cf.realOutcome.map((l) => h('p', { class: 'cf-p' }, l))),
      h('section', {}, h('h2', {}, 'What went wrong (the real failures)'), h('ul', { class: 'cf-list bad' }, cf.failures.map((f) => h('li', {}, f)))),
      h('section', {}, h('h2', {}, 'How to stop it: techniques and fixes'),
        h('div', { class: 'attck' }, cf.attack.map((a) =>
          h('div', { class: 'tech' },
            h('a', { class: 'tid', href: `https://attack.mitre.org/techniques/${a.id.replace('.', '/')}/`, target: '_blank', rel: 'noopener' }, a.id),
            h('div', {}, h('b', {}, a.name), h('p', {}, a.fix)))))),
      h('section', { class: 'resume-box' }, h('h2', {}, 'Put it on your resume'),
        earned
          ? [h('p', { class: 'resume-line', 'data-resume': '' }, resume), copyBtn,
            h('p', { class: 'cf-note' }, 'Say "simulated" or "recreation". You investigated a faithful replay, not the real incident, and saying so is what makes the line credible in an interview.')]
          : h('p', { class: 'cf-note' }, `Get a C or better on this case to earn the resume line. You got ${r.grade}. Replay it: the debrief above shows what to look for.`)),
      h('section', {}, h('h2', {}, 'Sources (read these before an interview)'),
        h('ul', { class: 'cf-list sources' }, cf.sources.map((x) => h('li', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title))))),
      h('p', { class: 'cf-disclaimer' }, cf.disclaimer || 'A dramatized recreation based on public reporting. People in the office are fictional stand-ins; the attack chain, techniques and outcomes follow the sources above. Some details are simplified.'),
    );
  }

  leave(fn) {
    this.input.keyboard.enabled = true;
    this.input.keyboard.enableGlobalCapture();
    fn();
  }

  nextDay() {
    this.leave(() => {
      this.gameState.startDay(this.gameState.day + 1);
      this.scene.start('Office', { resume: true });
    });
  }

  replayDay() {
    this.leave(() => {
      this.gameState.startDay(this.gameState.day);
      this.scene.start('Office', { resume: true, caseMode: !!this.gameState.caseId });
    });
  }

  playAgain() {
    this.leave(() => {
      GameState.clearSave();
      this.scene.start('Title');
    });
  }
}
