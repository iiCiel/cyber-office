import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h } from '../ui/dom.js';
import { GameState } from '../game/GameState.js';
import { getDay, LAST_DAY } from '../days/index.js';
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
    const day = getDay(st.day);
    const r = day.score(st, st.campaign);
    // Record the day in the week (idempotent: replaying a day replaces its entry).
    st.recordDay(r, day.carry ? day.carry(st, r) : {});
    if (!st.hasEvent('report-viewed')) st.log('report-viewed', { grade: r.grade, pct: r.pct });
    const last = st.day >= LAST_DAY;

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
    const next = !last ? getDay(st.day + 1) : null;
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
            h('div', { class: 'kicker' }, `${day.date.name}, 5:00 PM · Halcyon Mutual SOC · Day ${day.n} of ${LAST_DAY}`),
            h('h1', {}, `Day ${day.n} report`),
            h('p', { class: 'sum' }, `You handled ${caught} of ${r.items.length} things well. Cost to the company today: `, h('b', { class: r.cost > 20000 ? 'bad' : '' }, r.costText), '.'),
            r.capped ? h('p', { class: 'sum capped' }, 'Your points say A, but one outright miss caps the day at B.') : null,
          ),
          h('div', { class: `grade g${r.grade}`, 'data-grade': r.grade }, r.grade, h('small', {}, `${r.pct}%`)),
        ),
        last ? this.weekSection(st, day) : null,
        ...areas.map((a) => h('section', {}, h('h2', {}, a), r.items.filter((i) => i.area === a).map(item))),
        h(
          'section',
          {},
          h('h2', {}, 'What today cost Halcyon'),
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
        !last && day.teaser
          ? h('section', { class: 'teaser' }, h('h2', {}, `Tomorrow: ${next.date.name}`), day.teaser.map((l) => h('p', {}, l)))
          : null,
        h(
          'footer',
          {},
          next
            ? h('button', { type: 'button', class: 'again', 'data-action': 'next-day', onclick: () => this.nextDay() }, `▶ Start ${next.date.name}`)
            : h('button', { type: 'button', class: 'again', 'data-action': 'play-again', onclick: () => this.playAgain() }, '↻ Play the week again'),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'replay-day', onclick: () => this.replayDay() }, `↻ Replay ${day.date.name}`),
          next ? h('button', { type: 'button', class: 'secondary', 'data-action': 'play-again', onclick: () => this.playAgain() }, 'Start the week over') : null,
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
      this.scene.start('Office', { resume: true });
    });
  }

  playAgain() {
    this.leave(() => {
      GameState.clearSave();
      this.scene.start('Title');
    });
  }
}
