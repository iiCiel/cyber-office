// Text colours on the light in-game apps must reach WCAG AA (4.5:1) against the background they sit on.
// Each entry: a CSS rule prefix in src/ui/screen.css and the lightest background that text appears on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CONTRAST_CSS lets you point the test at another copy (e.g. the old file) to prove it catches regressions.
const css = readFileSync(process.env.CONTRAST_CSS || new URL('../src/ui/screen.css', import.meta.url), 'utf8');

function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function colorOf(rule) {
  const line = css.split(/\r?\n/).find((l) => l.startsWith(rule + ' {'));
  assert.ok(line, 'rule not found in screen.css: ' + rule);
  const m = line.match(/(?:^|[ ;{])color:\s*(#[0-9a-fA-F]{3,6})\b/);
  assert.ok(m, 'no color in rule: ' + rule);
  return m[1];
}

const CHECKS = [
  ['.empty', '#eef0f5'], // "No tickets." sits on the grey ticket list
  ['.statusbar .jobs', '#ffffff'],
  ['.statusbar .okmark', '#ffffff'],
  ['.statusbar .err', '#ffffff'],
  ['.fcard .x', '#ffffff'],
  ['.meta .lookup', '#ffffff'],
  ['.evt-fields td.ty', '#ffffff'],
  ['.json .jv.null', '#ffffff'],
  ['.formmsg', '#ffffff'],
  ['.aduc .tw', '#ffffff'],
  ['.tile .val.ok', '#f7f8fa'],
  ['.tile .val.bad', '#f7f8fa'],
  ['.tnum', '#cfdcf7'], // the selected ticket row, the darkest of the ticket-list backgrounds
];

test('ratio() matches known WCAG values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(ratio('#777777', '#ffffff').toFixed(2), '4.48');
});

for (const [rule, bg] of CHECKS) {
  test(`AA contrast: ${rule} on ${bg}`, () => {
    const fg = colorOf(rule);
    const r = ratio(fg, bg);
    assert.ok(r >= 4.5, `${rule} ${fg} on ${bg} is ${r.toFixed(2)}:1, needs 4.5:1`);
  });
}
