// Round lengths. A real qualifier runs 09:00 to 16:00; these compress that day into 15 or 60 minutes and keep the
// shape: the competition clock on every screen runs 09:00 to 16:00, and Red Team's lunch and 14:30 phases land at
// the same point of the round. Points follow the real split: about 40% uptime, 40% injects, 20% Red Team.

import { injectPool } from '../data/ccdcInjectPool.js';
import { hash01 } from './ccdcHash.js';

export const ROUND_LENGTHS = {
  short: { id: 'short', label: 'Short', seconds: 900, pool: false },
  long: { id: 'long', label: 'Long', seconds: 3600, pool: true },
};
export const DAY_SECONDS = 7 * 3600;
export const UPTIME_POINTS = 400;
export const INJECT_POINTS = 400;
const BASE_SECONDS = 900;
const LUNCH = 3 / 7; // 12:00 as a fraction of the day

function inventoryItem(sc) {
  const hosts = sc.devices;
  const need = Math.min(4, hosts.length);
  return {
    label: `each host on its own line with its correct IP (at least ${need})`,
    check: (text) => hosts.filter((d) => String(text).split('\n').some((l) => l.includes(d.host) && l.includes(d.ip))).length >= need,
  };
}

/** A copy of the scenario set up for one round length. The base scenario is never changed. */
export function prepareScenario(base, lengthId = 'short', seed = 1) {
  const len = ROUND_LENGTHS[lengthId] || ROUND_LENGTHS.short;
  const stretch = len.seconds / BASE_SECONDS;
  const timeScale = DAY_SECONDS / len.seconds;
  const num = typeof seed === 'number' ? seed | 0 : String(seed).length;
  const own = base.injects.map((i) => {
    const copy = { ...i, releaseAt: Math.round((i.releaseAt || 0) * stretch) };
    if (i.id === 'inv-memo') { copy.format = 'table'; copy.rubric = [inventoryItem(base), ...i.rubric.slice(2)]; }
    return copy;
  });
  const extra = len.pool ? injectPool(base).map((p, k) => {
    // About a fifth land together at lunch, as real competitions do on purpose.
    const atLunch = hash01(num, 70, k) < 0.2;
    const frac = atLunch ? LUNCH + hash01(num, 71, k) * 0.03 : 0.04 + hash01(num, 72, k) * 0.86;
    return { ...p, title: p.title, releaseAt: Math.round(frac * len.seconds), window: Math.round((p.window * 60) / timeScale) };
  }) : [];
  const injects = [...own, ...extra].sort((a, b) => a.releaseAt - b.releaseAt);
  const each = Math.round(INJECT_POINTS / injects.length);
  return {
    ...base,
    length: len.id,
    clockSeconds: len.seconds,
    timeScale,
    injectWindow: Math.round((base.injectWindow || 300) * stretch),
    redWaves: (base.redWaves || []).map((w) => ({ ...w, at: Math.round(w.at * stretch) })),
    teamFeedStretch: stretch,
    services: base.services.map((s) => ({ ...s, points: Math.round(UPTIME_POINTS / base.services.length) })),
    injects: injects.map((i) => ({ ...i, points: each })),
  };
}
