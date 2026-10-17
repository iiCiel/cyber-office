import { PLAYER_FRAMES, PLAYER_PALETTE, COWORKER_PALETTE, MANAGER_PALETTE } from './pixels.js';

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
  makeCharacterSheet(scene, 'manager', MANAGER_PALETTE);

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


  canvasTexture(scene, 'bookshelf', 28, 30, (_, r) => {
    r(0, 0, 28, 30, '#5d3a1a');
    r(2, 2, 24, 26, '#3a2410');
    const books = ['#b4643c', '#3b6fb6', '#e8c547', '#4fa84f', '#7a3e8f', '#d8d8d8'];
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 3 + shelf * 9;
      for (let i = 0; i < 7; i++) r(3 + i * 3, y + (i % 3 === 0 ? 1 : 0), 2, 7 - (i % 3 === 0 ? 1 : 0), books[(i + shelf) % books.length]);
      r(2, y + 7, 24, 1, '#5d3a1a');
    }
  });

  canvasTexture(scene, 'coffee', 20, 22, (_, r) => {
    r(0, 8, 20, 14, '#8b5a2b'); // counter
    r(0, 8, 20, 2, '#a0693a');
    r(4, 0, 10, 12, '#2d2d3a'); // machine
    r(5, 1, 8, 3, '#3a3a4a');
    r(6, 6, 6, 4, '#15151f');
    r(8, 8, 3, 2, '#f4f1e8'); // cup
    r(11, 2, 1, 1, '#3fe07a');
  });

  canvasTexture(scene, 'fridge', 16, 30, (_, r) => {
    r(0, 0, 16, 30, '#d8d8de');
    r(1, 1, 14, 28, '#ececf0');
    r(1, 11, 14, 1, '#b8b8c0');
    r(12, 4, 1, 5, '#9a9aa2');
    r(12, 14, 1, 8, '#9a9aa2');
    r(3, 15, 4, 4, '#ffe680'); // sticky note
  });

  canvasTexture(scene, 'table', 40, 18, (_, r) => {
    r(0, 0, 40, 12, '#a0693a');
    r(0, 0, 40, 2, '#b47c4a');
    r(2, 12, 3, 6, '#5d3a1a');
    r(35, 12, 3, 6, '#5d3a1a');
    r(8, 3, 5, 4, '#f4f1e8'); // mug
    r(24, 4, 8, 5, '#e8c547'); // donut box
  });

  canvasTexture(scene, 'table-long', 64, 22, (_, r) => {
    r(0, 0, 64, 16, '#5d3a1a');
    r(1, 1, 62, 14, '#7a4a24');
    r(1, 1, 62, 2, '#8b5a2b');
    r(3, 16, 3, 6, '#3a2410');
    r(58, 16, 3, 6, '#3a2410');
    r(28, 5, 8, 6, '#1b1b2a'); // conference phone
    r(31, 7, 2, 1, '#3fe07a');
  });

  canvasTexture(scene, 'reception', 48, 24, (_, r) => {
    r(0, 6, 48, 18, '#5b6577');
    r(0, 6, 48, 3, '#7a869a');
    r(2, 10, 44, 1, '#4a5466');
    r(30, 0, 12, 8, '#1b1b2a');
    r(31, 1, 10, 6, '#2b3f5c');
    r(6, 3, 6, 4, '#f4f1e8'); // visitor log
    r(14, 4, 4, 3, '#3b6fb6');
  });

  canvasTexture(scene, 'whiteboard', 48, 22, (_, r) => {
    r(0, 0, 48, 20, '#9a9aa2');
    r(1, 1, 46, 18, '#f4f4f4');
    r(4, 4, 18, 1, '#3f7fff');
    r(4, 7, 26, 1, '#3f7fff');
    r(4, 11, 12, 1, '#ff4f4f');
    r(32, 4, 10, 10, '#3fe07a'); // little bar chart
    r(32, 4, 10, 6, '#f4f4f4');
    r(34, 9, 2, 5, '#ff4f4f');
    r(38, 12, 2, 2, '#3f7fff');
    r(2, 20, 44, 2, '#7a7a82');
  });

  // UI: the little "E" prompt bubble (drawn at UI scale)
  canvasTexture(scene, 'prompt', 30, 30, (_, r) => {
    r(0, 0, 30, 26, '#1b1b2a');
    r(2, 2, 26, 22, '#f4f1e8');
    r(12, 26, 6, 4, '#1b1b2a');
  });
}
