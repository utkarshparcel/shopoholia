/** The murmur3 finaliser: spreads every input bit over the output. */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a, then the murmur3 finaliser: a stable 32-bit hash of a string. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix(h);
}

/** Where a fold of piece hashes starts. */
export const FOLD_START = 0x811c9dc5;

/** Folds one more piece hash in: `tieBreak` of a list is `tieOf` of its folds, in order. */
export function fold(h: number, x: number): number {
  return Math.imul(h ^ x, 0x01000193);
}

/** A fold as a tie-breaker in [0, 0.001): too small to outrank a real preference. */
export function tieOf(h: number): number {
  return (fmix(h) / 2 ** 32) * 1e-3;
}

/** Folds piece hashes, which already carry the seed, into a tie-breaker. */
export function tieBreak(hashes: readonly number[]): number {
  let h = FOLD_START;
  for (const x of hashes) h = fold(h, x);
  return tieOf(h);
}

/** A version-8 UUID derived from the seed and a key, so the same inputs always give the same id. */
export function seededUuid(seed: string, key: string): string {
  let hex = "";
  for (let i = 0; i < 4; i++) hex += hash32(`${seed}|${key}|${i}`).toString(16).padStart(8, "0");
  const variant = ((parseInt(hex.charAt(16), 16) & 3) | 8).toString(16);
  hex = `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
