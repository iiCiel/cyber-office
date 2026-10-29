import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, placeOnCanvas } from '../ui/dom.js';
import { GameState, caseBests } from '../game/GameState.js';
import { CASES, COMING_SOON } from '../cases/index.js';
import { caseHaystack, matchCase, TOPICS } from '../cases/search.js';
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

    // Each case is a hanging folder in a drawer. Tabs step left, middle, right like a real drawer so
    // neighbouring folders stay readable; labs are blue folders (made-up company), a grade is a red stamp.
    const card = (c, i) => {
      const cf = c.caseFile;
      const best = bests[cf.id];
      const lab = cf.kind === 'lab';
      return h(
        'article',
        { class: `case-card${lab ? ' lab' : ''}${cf.fresh ? ' fresh' : ''}${c.comingSoon ? ' soon' : ''}`, 'data-case': cf.id, style: `--tab:${i % 3}` },
        h(
          'div',
          { class: 'tab' },
          h('span', { class: 'when' }, lab ? String(cf.when).replace(/\s*·\s*Lab$/i, '') : cf.when),
          lab ? h('span', { class: 'labtag' }, 'Practice lab') : null,
          cf.fresh ? h('span', { class: 'newtag' }, 'New') : null,
        ),
        h(
          'div',
          { class: 'folder-body' },
          h(
            'div',
            { class: 'main' },
            h('h2', { class: 'co' }, cf.company),
            h('p', { class: 'ttl' }, cf.title),
            h('p', { class: 'sub' }, cf.pitch),
            h('div', { class: 'tags' }, cf.tags.map((t) => h('button', { type: 'button', class: 'tag', title: `Show every case about ${t}`, onclick: () => setQuery(t) }, t))),
          ),
          h(
            'div',
            { class: 'side' },
            best ? h('div', { class: 'stamp', 'aria-hidden': 'true' }, best.grade) : null,
            h('span', { class: 'best' }, best ? `Best: ${best.grade} (${best.pct}%)` : `Level: ${cf.difficulty}`),
            c.comingSoon
              ? h('button', { type: 'button', disabled: true }, 'Coming soon')
              : h('button', { type: 'button', 'data-action': 'open-case', 'aria-label': `${best ? 'Replay' : 'Open'} ${cf.company}`, onclick: () => this.open(cf.id) }, best ? 'Replay' : 'Open case'),
            !c.comingSoon && cf.attackerView
              ? h('button', { type: 'button', class: 'redteam-btn', 'data-action': 'red-team', 'aria-label': `Red team drill: ${cf.company}`, title: 'Walk the attack from the attacker’s seat and name the control that breaks each step', onclick: () => this.redTeam(cf.id) }, '⚔ Red team it')
              : null,
          ),
        ),
      );
    };

    // Search: filter cards by topic, technique, company... (src/cases/search.js).
    const all = [...CASES, ...COMING_SOON];
    const cards = all.map((c, i) => ({ c, el: card(c, i), hay: caseHaystack(c) }));
    const grid = h('div', { class: 'grid' }, cards.map((x) => x.el));
    const count = h('div', { class: 'search-count', 'aria-live': 'polite' });
    const empty = h('div', { class: 'search-empty', hidden: true });
    const search = h('input', {
      type: 'search',
      id: 'case-search',
      placeholder: 'Search: ransomware, AWS, phishing, PHP, T1558...',
      'aria-label': 'Search Case Files',
      autocomplete: 'off',
      spellcheck: 'false',
      oninput: () => this.filter(),
    });
    this.filter = () => {
      const q = search.value;
      let n = 0;
      for (const x of cards) {
        const hit = matchCase(x.c, q, x.hay);
        x.el.hidden = !hit;
        if (hit) n++;
      }
      for (const b of root.querySelectorAll('.topic')) b.classList.toggle('on', b.dataset.topic.toLowerCase() === q.trim().toLowerCase());
      count.textContent = q.trim() ? `${n} of ${all.length} folders match "${q.trim()}"` : `${all.length} folders in the drawer`;
      empty.hidden = n > 0;
      empty.textContent = n ? '' : `Nothing on "${q.trim()}" yet. Try a broader word, or one of the topics above.`;
    };
    const setQuery = (q) => {
      search.value = search.value.trim().toLowerCase() === q.toLowerCase() ? '' : q;
      this.filter();
      root.scrollTop = 0;
    };
    this.search = search;

    const root = h(
      'div',
      { class: 'screen open cases-screen', id: 'cases' },
      h(
        'div',
        { class: 'cases' },
        h(
          'header',
          { class: 'drawer-front' },
          h('div', { class: 'label-holder' }, h('h1', {}, 'Case Files')),
          h(
            'p',
            { class: 'intro' },
            'Real breaches, rebuilt from public reports: the same way in, the same mistakes, the same clues in the logs. ',
            'You work the shift, then see what really happened, what it cost and how it could have been stopped. ',
            'Blue folders are practice labs: a made-up company, real techniques and real log formats.',
          ),
        ),
        h(
          'div',
          { class: 'case-search' },
          search,
          h('div', { class: 'topics' }, TOPICS.map((t) => h('button', { type: 'button', class: 'topic', 'data-topic': t, onclick: () => setQuery(t) }, t))),
          count,
        ),
        grid,
        empty,
        h(
          'footer',
          {},
          h('button', { type: 'button', 'data-action': 'back', onclick: () => this.back() }, 'Back to the title screen'),
        ),
      ),
    );
    document.body.append(root);
    this.root = root;

    // VIEW_W/VIEW_H are live: the page always covers the whole window, whatever its shape.
    const layout = () => placeOnCanvas(root, this.game.canvas, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { viewW: VIEW_W });
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
    this.filter();
    // The office captures W/A/S/D/Space globally; release them so they can be typed into the search box.
    this.input.keyboard.disableGlobalCapture();
    this.events.once('shutdown', () => this.input.keyboard.enableGlobalCapture());
    // Esc clears the search first, then leaves. "/" jumps to the search box.
    this.input.keyboard.on('keydown-ESC', () => {
      if (search.value) {
        search.value = '';
        this.filter();
        search.blur();
      } else this.back();
    });
    const slash = (e) => {
      if (e.key === '/' && document.activeElement !== search) {
        e.preventDefault();
        search.focus();
      }
    };
    window.addEventListener('keydown', slash);
    this.events.once('shutdown', () => window.removeEventListener('keydown', slash));
  }

  open(id) {
    this.game.registry.get('sound')?.play('select');
    GameState.clearSave(true);
    this.scene.start('Office', { caseMode: true, caseId: id });
  }

  redTeam(id) {
    this.game.registry.get('sound')?.play('select');
    this.scene.start('RedTeam', { caseId: id, returnTo: 'CaseFiles' });
  }

  back() {
    this.scene.start('Title');
  }
}
