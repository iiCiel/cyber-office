import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h } from '../ui/dom.js';
import { GameState, caseBests } from '../game/GameState.js';
import { CASES, COMING_SOON } from '../cases/index.js';
import '../ui/screen.css';

// Case Files: pick a real breach to replay. Each card is one recreation (src/cases). Rendered as HTML
// over the canvas, like the report card.
export class CaseFilesScene extends Phaser.Scene {
  constructor() {
    super('CaseFiles');
  }

  create() {
    this.cameras.main.setBackgroundColor('#0a0e0c');
    const bests = caseBests();
    const sound = this.game.registry.get('sound');

    const card = (c) => {
      const cf = c.caseFile;
      const best = bests[cf.id];
      return h(
        'div',
        { class: `case-card${c.comingSoon ? ' soon' : ''}`, 'data-case': cf.id },
        h('div', { class: 'when' }, cf.when, cf.kind === 'lab' ? h('span', { class: 'labtag' }, 'LAB · fictional') : null),
        h('div', { class: 'co' }, `${cf.company}: ${cf.title}`),
        h('p', { class: 'sub' }, cf.pitch),
        h('div', { class: 'tags' }, cf.tags.map((t) => h('span', { class: 'tag' }, t))),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'best' }, best ? `Best: ${best.grade} (${best.pct}%)` : `Difficulty: ${cf.difficulty}`),
          c.comingSoon
            ? h('button', { type: 'button', disabled: true }, 'Coming soon')
            : h('button', { type: 'button', 'data-action': 'open-case', onclick: () => this.open(cf.id) }, best ? '↻ Replay' : '▶ Open case'),
        ),
      );
    };

    const root = h(
      'div',
      { class: 'screen open cases-screen', id: 'cases' },
      h(
        'div',
        { class: 'cases' },
        h('h1', {}, '📁 Case Files'),
        h(
          'p',
          { class: 'intro' },
          'Real breaches, replayed. Each case rebuilds a documented incident from public reports: the same way in, the same mistakes, the same clues in the logs. ',
          "You're the analyst on shift. Afterwards you see what really happened, what it cost, the MITRE ATT&CK techniques, and how to stop it. Cards marked LAB are invented scenarios built from real techniques and real log formats (Active Directory, AWS).",
        ),
        h('div', { class: 'grid' }, [...CASES, ...COMING_SOON].map(card)),
        h(
          'footer',
          {},
          h('button', { type: 'button', 'data-action': 'back', onclick: () => this.back() }, '← Title screen'),
        ),
      ),
    );
    root.style.width = `${VIEW_W}px`;
    root.style.height = `${VIEW_H}px`;
    document.body.append(root);
    this.root = root;

    const layout = () => {
      const rect = this.game.canvas.getBoundingClientRect();
      root.style.left = `${rect.left}px`;
      root.style.top = `${rect.top}px`;
      root.style.transform = `scale(${rect.width / VIEW_W})`;
    };
    layout();
    window.addEventListener('resize', layout);
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', layout);
      this.scale.off('resize', layout);
      root.remove();
    });
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) sound?.play('click');
    });
    this.input.keyboard.on('keydown-ESC', () => this.back());
  }

  open(id) {
    this.game.registry.get('sound')?.play('select');
    GameState.clearSave(true);
    this.scene.start('Office', { caseMode: true, caseId: id });
  }

  back() {
    this.scene.start('Title');
  }
}
