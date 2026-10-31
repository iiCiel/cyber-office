import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../config.js';
import { h, clear, placeOnCanvas } from '../ui/dom.js';
import { CCDC_LAB } from '../data/ccdcLabScenario.js';
import { CPTC_SCENARIO } from '../data/cptcScenario.js';
import { loadBests as loadCcdcBests } from '../game/ccdcLab.js';
import { loadBests as loadCptcBests } from '../game/cptc.js';
import '../ui/screen.css';
import '../ui/competitions.css';

// Competition training hub: the two headline modes Soliman wants to practise for real student competitions.
//   CCDC  (blue team / defence)  -> Ccdc scene
//   CPTC  (pentest report)       -> Cptc scene
// A simple two-card picker, HTML over the canvas. Shows each mode's best grade once earned.
export class CompetitionsScene extends Phaser.Scene {
  constructor() {
    super('Competitions');
  }

  init(data) {
    this.returnTo = data?.returnTo || 'Title';
  }

  create() {
    this.cameras.main.setBackgroundColor('#070b14');
    this.sound2 = this.game.registry.get('sound');
    this.root = h('div', { class: 'screen open comp-screen', id: 'competitions' });
    document.body.append(this.root);
    document.body.classList.add('portrait-ok'); // HTML screen: readable on an upright phone, skip the rotate prompt
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
    if (!this.layout) return;
    const r = this.game.canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key !== this.canvasRect) { this.canvasRect = key; this.layout(); }
  }

  exit() {
    this.sound2?.play('click');
    this.scene.start(this.returnTo);
  }

  go(scene) {
    this.sound2?.play('select');
    this.scene.start(scene, { returnTo: 'Competitions' });
  }

  render() {
    clear(this.root);
    const ccdcBest = loadCcdcBests()[CCDC_LAB.id];
    const cptcBest = loadCptcBests()[CPTC_SCENARIO.id];
    const stamp = (best) => best ? h('span', { class: `comp-stamp g${best.letter}`, title: `Best: ${best.pct}%` }, best.letter) : h('span', { class: 'comp-stamp none' }, 'NEW');

    const card = (opts) => h('button', { type: 'button', class: `comp-card ${opts.cls}`, 'data-mode': opts.mode, onclick: () => this.go(opts.scene) },
      h('div', { class: 'comp-card-top' },
        h('span', { class: 'comp-badge' }, opts.badge),
        h('span', { class: 'comp-side' }, opts.side),
        stamp(opts.best)),
      h('h2', {}, opts.name),
      h('p', { class: 'comp-tag' }, opts.tag),
      h('ul', { class: 'comp-learn' }, opts.learn.map((l) => h('li', {}, l))),
      h('span', { class: 'comp-go' }, opts.best ? 'Play again →' : 'Start →'));

    this.root.append(h('div', { class: 'comp-wrap' },
      h('header', { class: 'comp-head' },
        h('div', { class: 'comp-kicker' }, 'Competition training · simulated'),
        h('h1', {}, 'Compete'),
        h('p', { class: 'comp-lede' }, 'Two student cyber competitions, built to teach the real playbook. Everything is a self-contained simulation on documentation-only networks — nothing is scanned, attacked or executed.')),
      h('div', { class: 'comp-cards' },
        card({
          mode: 'ccdc', scene: 'CcdcLab', cls: 'blue', badge: 'CCDC', side: 'Blue team · hands-on', best: ccdcBest,
          name: 'Collegiate Cyber Defense',
          tag: 'Inherit a small business full of misconfigurations. Open each box’s own terminal — bash, PowerShell, a firewall rule editor — and TYPE the commands to harden it while keeping the scored services online and the red team out. Pick a role seat or play the whole team.',
          learn: ['Real terminals on every device', 'Harden without dropping a scored service', 'Five specialised role seats', 'Guided, or a 15-minute clock + red team'],
        }),
        card({
          mode: 'cptc', scene: 'Cptc', cls: 'red', badge: 'CPTC', side: 'Pentest · the report', best: cptcBest,
          name: 'Collegiate Penetration Testing',
          tag: 'The testing is done — now write the report that actually wins: scope calls, risk ratings, root-cause remediation and an executive summary a board can act on. Guided, or against a 10-minute clock.',
          learn: ['Rules-of-engagement judgment', 'Risk = likelihood × impact', 'Remediation that fixes the root cause', 'Executive writing that wins CPTC'],
        })),
      h('div', { class: 'comp-foot' },
        h('button', { type: 'button', class: 'comp-quit', onclick: () => this.exit() }, 'Back to title'))));
  }
}
