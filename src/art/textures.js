import { TILE } from '../config.js';
import { PLAYER_FRAMES, PLAYER_PALETTE, COWORKER_PALETTE } from './pixels.js';

// Draw a palette-keyed pixel grid onto a 2D canvas context at (ox, oy).
function paint(ctx, rows, palette, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

function makeCharacterSheet(scene, key, palette) {
  const fw = PLAYER_FRAMES[0].rows[0].length;
  const fh = PLAYER_FRAMES[0].rows.length;
  const tex = scene.textures.createCanvas(key, fw * PLAYER_FRAMES.length, fh);
  const ctx = tex.getContext();
  PLAYER_FRAMES.forEach((f, i) => paint(ctx, f.rows, palette, i * fw, 0));
  PLAYER_FRAMES.forEach((f, i) => tex.add(f.name, 0, i * fw, 0, fw, fh));
  tex.refresh();
}

// Small helper: draw with canvas 2D calls into a new texture.
function canvasTexture(scene, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  draw(ctx, (x, y, rw, rh, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, rw, rh);
  });
  tex.refresh();
}

export function generateTextures(scene) {
  makeCharacterSheet(scene, 'player', PLAYER_PALETTE);
  makeCharacterSheet(scene, 'coworker', COWORKER_PALETTE);

  // --- Tiles ---
  canvasTexture(scene, 'floor', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#4a5470');
    r(0, 0, 16, 1, '#434c66');
    r(0, 0, 1, 16, '#434c66');
    r(4, 5, 1, 1, '#56617f');
    r(11, 10, 1, 1, '#56617f');
    r(8, 2, 1, 1, '#3f475f');
    r(2, 12, 1, 1, '#3f475f');
  });
  canvasTexture(scene, 'floor-server', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#2f3640');
    r(0, 0, 16, 1, '#3d4552');
    r(0, 0, 1, 16, '#3d4552');
    r(1, 1, 14, 14, '#323a45');
    r(7, 7, 2, 2, '#262c35'); // vent hole
  });
  canvasTexture(scene, 'wall-top', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#262636');
    r(0, 15, 16, 1, '#1b1b28');
  });
  canvasTexture(scene, 'wall-face', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#c9c2b2');
    r(0, 0, 16, 2, '#b3ab99');
    r(0, 13, 16, 3, '#8a8170'); // baseboard
  });
  canvasTexture(scene, 'window', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#c9c2b2');
    r(0, 13, 16, 3, '#8a8170');
    r(2, 2, 12, 10, '#5d4a3a');
    r(3, 3, 10, 8, '#7fb7e6');
    r(3, 3, 10, 2, '#a9d3f2');
    r(7, 3, 1, 8, '#5d4a3a');
  });
  canvasTexture(scene, 'door', TILE, TILE, (_, r) => {
    r(0, 0, 16, 16, '#4a5470');
    r(1, 0, 14, 16, '#8b5a2b');
    r(2, 1, 12, 14, '#a0693a');
    r(11, 8, 2, 2, '#e8c547');
  });

  // --- Furniture (sizes in px; bottom part is the collision footprint) ---
  // Desk with monitor + keyboard, 32x24
  const desk = (key, screen) =>
    canvasTexture(scene, key, 32, 24, (_, r) => {
      r(10, 0, 12, 9, '#1b1b2a'); // monitor bezel
      r(11, 1, 10, 7, screen);
      r(15, 9, 2, 3, '#1b1b2a'); // stand
      r(0, 11, 32, 9, '#8b5a2b'); // desktop
      r(0, 11, 32, 2, '#a0693a');
      r(11, 14, 10, 2, '#d8d8d8'); // keyboard
      r(23, 14, 3, 2, '#d8d8d8'); // mouse
      r(2, 20, 3, 4, '#5d3a1a'); // legs
      r(27, 20, 3, 4, '#5d3a1a');
    });
  desk('desk-mine', '#3fa7ff');
  desk('desk', '#2b3f5c');
  desk('desk-soc', '#1f8f4e');

  canvasTexture(scene, 'chair', 12, 12, (_, r) => {
    r(2, 0, 8, 6, '#2d2d3a');
    r(1, 6, 10, 3, '#3a3a4a');
    r(5, 9, 2, 2, '#1b1b2a');
    r(2, 11, 8, 1, '#1b1b2a');
  });

  canvasTexture(scene, 'rack', 16, 32, (_, r) => {
    r(0, 0, 16, 32, '#15151f');
    r(1, 1, 14, 30, '#22222e');
    for (let y = 3; y < 29; y += 4) {
      r(2, y, 12, 3, '#2e2e3c');
      r(3, y + 1, 1, 1, '#3fe07a'); // status LEDs
      r(5, y + 1, 1, 1, y % 8 === 3 ? '#ffb020' : '#3fe07a');
      r(9, y + 1, 4, 1, '#3c3c4c');
    }
  });

  canvasTexture(scene, 'plant', 14, 20, (_, r) => {
    r(5, 0, 4, 4, '#3f8f3f');
    r(1, 3, 5, 5, '#4fa84f');
    r(8, 3, 5, 5, '#4fa84f');
    r(3, 6, 8, 6, '#3f8f3f');
    r(6, 9, 2, 3, '#2f6f2f');
    r(3, 12, 8, 8, '#b4643c');
    r(3, 12, 8, 2, '#c8784c');
  });

  canvasTexture(scene, 'cooler', 12, 26, (_, r) => {
    r(2, 0, 8, 10, '#8fd0ff');
    r(3, 1, 3, 7, '#b5e2ff');
    r(1, 10, 10, 16, '#e6e6ea');
    r(1, 10, 10, 1, '#c8c8cf');
    r(4, 14, 2, 2, '#3f7fff');
    r(7, 14, 2, 2, '#ff4f4f');
  });

  canvasTexture(scene, 'printer', 22, 18, (_, r) => {
    r(0, 4, 22, 14, '#d0d0d6');
    r(0, 4, 22, 2, '#e4e4ea');
    r(3, 0, 16, 5, '#f4f4f4'); // paper
    r(15, 8, 4, 2, '#ff4f4f'); // error light
    r(2, 12, 18, 2, '#9a9aa2');
  });

  // UI: the little "E" prompt bubble (drawn at UI scale)
  canvasTexture(scene, 'prompt', 30, 30, (_, r) => {
    r(0, 0, 30, 26, '#1b1b2a');
    r(2, 2, 26, 22, '#f4f1e8');
    r(12, 26, 6, 4, '#1b1b2a');
  });
}
