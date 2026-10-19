// World is drawn at 16px tiles and zoomed up; UI is drawn at full resolution so text stays crisp.
export const TILE = 16;
export const ZOOM = 3;
export const COLS = 20;
export const ROWS = 15;
export const VIEW_W = COLS * TILE * ZOOM; // 960
export const VIEW_H = ROWS * TILE * ZOOM; // 720

// In-world text uses VT323 (OFL, bundled via @fontsource, so it is self-hosted).
// Courier New stays as the fallback for symbols the pixel font lacks (e.g. the phone and menu glyphs).
export const FONT_NAME = 'VT323';
export const FONT = `"${FONT_NAME}", "Courier New", Courier, monospace`;
