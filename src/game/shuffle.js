// Seeded shuffle for the competition modes. Option order is shuffled once per game (so "always click the top
// button" stops working) but stays stable inside a round, so re-renders never move a button under the cursor.
// Pure and deterministic for a given seed, which keeps the engines unit-testable.

/** mulberry32: tiny, fast, good-enough PRNG for UI ordering (not for anything security-relevant). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates over a copy, driven by the given random() function. */
export function shuffled(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A fresh seed for a new round (time + entropy); tests pass their own. */
export function freshSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Order a list of {id} options by a stored id order (falls back to the data order for unknown ids). */
export function inOrder(options, idOrder) {
  if (!idOrder) return options;
  const pos = new Map(idOrder.map((id, i) => [id, i]));
  return [...options].sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
}
