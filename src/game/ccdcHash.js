/** Deterministic hash of integers -> [0,1). Shared by the rival teams and the Red Team. */
export function hash01(...vals) {
  let x = 2166136261;
  for (const v of vals) {
    x = Math.imul(x ^ (v | 0), 16777619);
    x ^= x >>> 15;
    x = Math.imul(x, 2246822519);
    x ^= x >>> 13;
  }
  x = Math.imul(x ^ (x >>> 16), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
