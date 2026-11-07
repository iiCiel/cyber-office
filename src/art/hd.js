// HD art: the detailed Codex-made textures in public/art/ (built by art-src/process.py).
// They are drawn at 4 texture pixels per world pixel and shown at 1/4 scale, so every footprint,
// collision box and object position stays exactly as it was with the 16px procedural art.
// If a file fails to load, the procedural texture with the same world size is used instead.
import Phaser from 'phaser';

export const HD = 4;
export const HD_SCALE = 1 / HD;
export const HD_PROPS = ['desk', 'desk-mine', 'desk-soc', 'chair', 'rack', 'plant', 'cooler', 'printer', 'bookshelf',
  'coffee', 'fridge', 'table', 'table-long', 'reception', 'whiteboard'];
export const HD_CHARS = ['player', 'coworker', 'manager', 'mike', 'theo', 'carla'];
const FRAMES = ['down', 'up', 'side'].flatMap((d) => ['idle', 'walk1', 'walk2'].map((s) => `${d}-${s}`));
// These HD desks already have their own chair drawn in, so no separate chair sprite goes in front.
export const HAS_CHAIR = new Set(['desk-mine', 'desk-soc']);

// ?art=classic in the URL keeps the original procedural art (used for before/after screenshots).
export const classicArt = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('art') === 'classic';

export function preloadHd(scene) {
  if (classicArt()) return;
  scene.load.image('tiles-hd', 'art/tiles-hd.png');
  for (const p of HD_PROPS) scene.load.image(`hd-${p}`, `art/prop-${p}.png`);
  for (const c of HD_CHARS) scene.load.image(`hd-src-${c}`, `art/char-${c}.png`);
}

// After generateTextures(): swap each character sheet for the HD one under the same key and frame names,
// so animations and setFrame() calls keep working. Characters are then shown at HD_SCALE.
export function installHdChars(scene) {
  const tm = scene.textures;
  for (const c of HD_CHARS) {
    if (!tm.exists(`hd-src-${c}`)) continue;
    const img = tm.get(`hd-src-${c}`).getSourceImage();
    const fw = 12 * HD;
    const fh = 16 * HD;
    if (img.width !== fw * FRAMES.length || img.height !== fh) continue;
    if (tm.exists(c)) tm.remove(c);
    const tex = tm.addImage(c, img);
    FRAMES.forEach((f, i) => tex.add(f, 0, i * fw, 0, fw, fh));
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  for (const k of ['tiles-hd', ...HD_PROPS.map((p) => `hd-${p}`)]) {
    if (tm.exists(k)) tm.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

export const isHdChar = (scene, key) => scene.textures.exists(`hd-src-${key}`) && scene.textures.get(key).source[0]?.width === 12 * HD * FRAMES.length;
export const charScale = (scene, key) => (isHdChar(scene, key) ? HD_SCALE : 1);

// A prop image at its world size: the HD version if it loaded, else the procedural one.
export function addProp(scene, x, y, tex) {
  const hd = `hd-${tex}`;
  if (!scene.textures.exists(hd) || !scene.textures.exists(tex)) return scene.add.image(x, y, tex);
  const base = scene.textures.get(tex).getSourceImage();
  return scene.add.image(x, y, hd).setDisplaySize(base.width, base.height);
}
export const hasHdProp = (scene, tex) => scene.textures.exists(`hd-${tex}`);

// Draw the given 16px tile layers again with the 64px HD tileset (same tile indices), at 1/4 scale.
// The original layers stay (hidden) for collision and tile lookups. Returns { name: hdLayer }.
export function addHdLayers(scene, map, names, x = 0, y = 0, scale = 1) {
  const out = {};
  if (!scene.textures.exists('tiles-hd')) return out;
  for (const name of names) {
    const src = map.getLayer(name);
    if (!src) continue;
    const data = src.data.map((row) => row.map((t) => (t ? t.index : -1)));
    const hm = scene.make.tilemap({ data, tileWidth: 16 * HD, tileHeight: 16 * HD });
    const ts = hm.addTilesetImage('tiles-hd', 'tiles-hd', 16 * HD, 16 * HD, 0, 0, map.tilesets[0]?.firstgid ?? 1);
    const layer = hm.createLayer(0, ts, x, y).setScale(scale / HD);
    out[name] = layer;
  }
  return out;
}
