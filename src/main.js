import Phaser from 'phaser';
import '@fontsource/vt323/latin-400.css';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { OfficeScene } from './scenes/OfficeScene.js';
import { ReportScene } from './scenes/ReportScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { CaseFilesScene } from './scenes/CaseFilesScene.js';
import { VIEW_W, VIEW_H } from './config.js';
import { Sound } from './game/sound.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#12121c',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, OfficeScene, ReportScene, MenuScene, CaseFilesScene],
});

// One shared sound engine; scenes read game.registry for it.
const sound = new Sound();
game.registry.set('sound', sound);
// Audio needs a user gesture to start.
const unlock = () => sound.resume();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Background music follows the scene: calm on menus, a work groove in the office (the Office scene
// switches it to tense during alerts), a warm loop on the report card.
const MOOD_BY_SCENE = { Title: 'calm', CaseFiles: 'calm', Report: 'report' };
game.events.once('ready', () => {
  for (const [key, mood] of Object.entries(MOOD_BY_SCENE)) {
    game.scene.getScene(key)?.sys.events.on('create', () => sound.music.play(mood));
  }
});

// Handy for debugging and automated browser tests.
window.__game = game;
window.__sound = sound;
