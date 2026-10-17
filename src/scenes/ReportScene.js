import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h } from '../ui/dom.js';
import { GameState } from '../game/GameState.js';
import { scoreDay } from '../game/scoring.js';
import '../ui/screen.css';

// End-of-day report card (M6): what you caught, what you missed, what it cost, what you learned.
// Rendered as HTML over the canvas (same scaling trick as the in-game monitors).
const ICON = { good: '✓', ok: '~', bad: '✗' };
const LABEL = { good: 'Caught it', ok: 'Partly', bad: 'Missed' };

export class ReportScene extends Phaser.Scene {
  constructor() {
    super('Report');
  }

  init(data) {
    this.gameState = data?.state;
  }

  create() {
    if (!this.gameState) {
      this.gameState = new GameState();
      this.gameState.load();
    }
    const r = scoreDay(this.gameState);
    this.gameState.log('report-viewed', { grade: r.grade, pct: r.pct });

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
          i.cost ? h('span', { class: `rcost ${i.outcome}` }, `-$${i.cost.amount.toLocaleString('en-US')}`) : null,
          h('span', { class: 'rpts' }, `${i.points}/${i.max}`),
        ),
        h('p', { class: 'rwhat' }, i.what),
        h('p', { class: 'rwhy' }, i.why),
        i.cost ? h('p', { class: 'rcosttext' }, `Cost: ${i.cost.text}.`) : null,
        h('p', { class: 'rtag' }, `Skill: ${i.teaches.skill} · Security+ ${i.teaches.secplus}`),
      );

    const caught = r.items.filter((i) => i.outcome === 'good').length;
    const root = h(
      'div',
      { class: 'screen open report-screen', id: 'report' },
      h(
        'div',
        { class: 'report' },
        h(
          'header',
          {},
          h('div', {}, h('div', { class: 'kicker' }, 'Monday, 5:00 PM · Halcyon Mutual SOC'), h('h1', {}, 'Day 1 report'),
            h('p', { class: 'sum' }, `You handled ${caught} of ${r.items.length} things well. Cost to the company: `, h('b', { class: r.cost > 20000 ? 'bad' : '' }, r.costText), '.'),
            r.capped ? h('p', { class: 'sum capped' }, 'Your points say A, but one outright miss caps the day at B.') : null),
          h('div', { class: `grade g${r.grade}`, 'data-grade': r.grade }, r.grade, h('small', {}, `${r.pct}%`)),
        ),
        ...areas.map((a) => h('section', {}, h('h2', {}, a), r.items.filter((i) => i.area === a).map(item))),
        h(
          'section',
          {},
          h('h2', {}, 'What it cost Halcyon'),
          r.costs.length
            ? h('table', { class: 'costs' }, r.costs.map((c) => h('tr', {}, h('td', {}, c.text), h('td', { class: 'amt' }, `$${c.amount.toLocaleString('en-US')}`))),
                h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', { class: 'amt' }, r.costText)))
            : h('p', {}, 'Nothing. A clean day.'),
        ),
        h(
          'section',
          {},
          h('h2', {}, 'Skills you practiced'),
          h('div', { class: 'chips' }, r.skills.map((s) => h('span', { class: `chip ${s.outcome}` }, `${ICON[s.outcome]} ${s.skill}`, h('small', {}, `Security+ ${s.secplus}`)))),
        ),
        h(
          'section',
          { class: 'teaser' },
          h('h2', {}, 'Tomorrow'),
          h('p', {}, 'Tuesday, 8:57 AM. Priya pulled the code off that USB stick. Whoever made it knew our VPN address and the names of people in HR.'),
          h('p', {}, 'Same group as the 3 AM break-in? Day 2 is coming soon.'),
        ),
        h(
          'footer',
          {},
          h('button', { type: 'button', class: 'again', 'data-action': 'play-again', onclick: () => this.playAgain() }, '↻ Play Day 1 again'),
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
      root.remove();
    });
    this.input.keyboard.enabled = false;
    this.input.keyboard.disableGlobalCapture();
  }

  playAgain() {
    GameState.clearSave();
    this.input.keyboard.enabled = true;
    this.input.keyboard.enableGlobalCapture();
    this.scene.start('Title');
  }
}
