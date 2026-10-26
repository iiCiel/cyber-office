// World is drawn at 16px tiles and zoomed up; UI is drawn at full resolution so text stays crisp.
export const TILE = 16;
export const ZOOM = 3;
export const COLS = 20;
export const ROWS = 15;

// Layout is designed for a 960x720 box (BASE). The game fills the whole window at the screen's
// real pixel density: the canvas is window size x devicePixelRatio, and every camera zooms by
// UI_SCALE so the layout maps onto it. VIEW_W/VIEW_H are the logical size of the whole window
// (at least 960x720; wider screens get a wider VIEW_W). They are live bindings: setView() updates
// them, and every module that imports them sees the new value.
export const BASE_W = COLS * TILE * ZOOM; // 960
export const BASE_H = ROWS * TILE * ZOOM; // 720
export let VIEW_W = BASE_W;
export let VIEW_H = BASE_H;
export let UI_SCALE = 1; // canvas pixels per logical pixel
export let DPR = 1; // canvas pixels per CSS pixel

// Biggest canvas we draw (pixels). Above this (a 4K screen at 2x), DPR is lowered to keep it fast.
const MAX_PIXELS = 3840 * 2400;

/** Measure the window and set the logical view size. Returns the canvas size in device pixels. */
export function measureView(win = window) {
  const cw = Math.max(1, win.innerWidth);
  const ch = Math.max(1, win.innerHeight);
  let dpr = win.devicePixelRatio || 1;
  if (cw * ch * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (cw * ch));
  const w = Math.round(cw * dpr);
  const h = Math.round(ch * dpr);
  const s = Math.min(w / BASE_W, h / BASE_H);
  DPR = dpr;
  UI_SCALE = s;
  VIEW_W = w / s;
  VIEW_H = h / s;
  return { w, h, dpr, s };
}

/**
 * Point a camera at logical space: it covers the whole canvas and zooms by UI_SCALE.
 * center: true puts the 960x720 BASE box in the middle of the window (title screen, menus);
 * false anchors logical (0,0) to the top-left corner (the in-game HUD).
 */
export function fitCamera(cam, { center = false } = {}) {
  cam.setOrigin(0, 0);
  cam.setViewport(0, 0, Math.round(VIEW_W * UI_SCALE), Math.round(VIEW_H * UI_SCALE));
  cam.setZoom(UI_SCALE);
  cam.setScroll(center ? -(VIEW_W - BASE_W) / 2 : 0, center ? -(VIEW_H - BASE_H) / 2 : 0);
}

// In-world text uses VT323 (OFL, bundled via @fontsource, so it is self-hosted).
// Courier New stays as the fallback for symbols the pixel font lacks (e.g. the phone and menu glyphs).
export const FONT_NAME = 'VT323';
export const FONT = `"${FONT_NAME}", "Courier New", Courier, monospace`;
