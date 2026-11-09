// Round lengths. A real qualifier runs 09:00 to 16:00; these compress that day into 15 or 60 minutes and keep the
// shape: the competition clock on every screen runs 09:00 to 16:00, and Red Team's lunch and 14:30 phases land at
// the same point of the round. Points follow the real split: about 40% uptime, 40% injects, 20% Red Team.

import { injectPool } from '../data/ccdcInjectPool.js';
import { hash01 } from './ccdcHash.js';

export const ROUND_LENGTHS = {
  short: { id: 'short', label: 'Short', seconds: 900, pool: false },
  long: { id: 'long', label: 'Long', seconds: 3600, pool: true },
  real: { id: 'real', label: 'Real time', realTime: true, pool: true },
};
export const DAY_SECONDS = 7 * 3600;
export const DEFAULT_DAY = { start: 9, hours: 7, date: '10/31', iso: '2026-10-31' };
/** The competition day of a scenario: when the clock starts, how long it runs. */
export const dayOf = (sc) => ({ ...DEFAULT_DAY, ...(sc?.day || {}) });
/** Seconds of game clock the competition clock has reached, as HH:MM. */
export function clockAt(sc, gameSec) {
  const t = dayOf(sc).start * 3600 + Math.max(0, Math.floor(gameSec));
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
}
/** Real length of one round: a real-time round runs the whole competition block. */
export const roundSeconds = (len, sc) => (len.realTime ? dayOf(sc).hours * 3600 : len.seconds);
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
  const day = dayOf(base);
  const seconds = roundSeconds(len, base);
  const stretch = seconds / BASE_SECONDS;
  const timeScale = (day.hours * 3600) / seconds;
  const num = typeof seed === 'number' ? seed | 0 : String(seed).length;
  const own = base.injects.map((i) => {
    const copy = { ...i, releaseAt: Math.round((i.releaseAt || 0) * stretch) };
    if (i.id === 'inv-memo') { copy.format = 'table'; copy.rubric = [inventoryItem(base), ...i.rubric.slice(2)]; }
    return copy;
  });
  const extra = len.pool ? injectPool(base).slice(0, base.poolLimit ?? Infinity).map((p, k) => {
    // About a fifth land together at lunch, as real competitions do on purpose.
    const atLunch = hash01(num, 70, k) < 0.2;
    const frac = atLunch ? LUNCH + hash01(num, 71, k) * 0.03 : 0.04 + hash01(num, 72, k) * 0.86;
    return { ...p, title: p.title, releaseAt: Math.round(frac * seconds), window: Math.round((p.window * 60) / timeScale) };
  }) : [];
  const injects = [...own, ...extra].sort((a, b) => a.releaseAt - b.releaseAt);
  const each = Math.round(INJECT_POINTS / Math.max(1, injects.filter((i) => !i.welcome).length));
  return {
    ...base,
    day,
    length: len.id,
    clockSeconds: seconds,
    timeScale,
    injectWindow: Math.round((base.injectWindow || 300) * stretch),
    redWaves: (base.redWaves || []).map((w) => ({ ...w, at: Math.round(w.at * stretch) })),
    teamFeedStretch: stretch,
    services: base.services.map((s) => ({ ...s, points: Math.round(UPTIME_POINTS / base.services.length) })),
    injects: injects.map((i) => ({ ...i, points: i.welcome ? 0 : each })),
  };
}
