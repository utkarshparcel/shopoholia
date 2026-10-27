/**
 * `inputsHash`: sha256 over canonical JSON. Plain TypeScript, so it runs wherever
 * `packages/shared` does (Node, workers and the phone) without a crypto dependency.
 */

function sortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

/**
 * JSON with object keys sorted and undefined values dropped, so equal data always gives equal
 * text. Integer-like keys come first in ascending order, as JavaScript enumerates them.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, sortedKeys) ?? "null";
}

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const UTF8 = new TextEncoder();

/**
 * UTF-8 bytes of `text` followed by sha256 padding, a whole number of 64-byte blocks. Lone
 * surrogates become U+FFFD. Sized for the worst case of three bytes per UTF-16 unit.
 */
function paddedUtf8(text: string): Uint8Array {
  const buffer = new Uint8Array(text.length * 3 + 72);
  const n = UTF8.encodeInto(text, buffer).written;
  const bytes = buffer.subarray(0, (((n + 8) >>> 6) + 1) << 6);
  bytes[n] = 0x80;
  const end = bytes.length;
  const hi = Math.floor(n / 0x20000000);
  const lo = (n * 8) >>> 0;
  bytes[end - 8] = hi >>> 24;
  bytes[end - 7] = hi >>> 16;
  bytes[end - 6] = hi >>> 8;
  bytes[end - 5] = hi;
  bytes[end - 4] = lo >>> 24;
  bytes[end - 3] = lo >>> 16;
  bytes[end - 2] = lo >>> 8;
  bytes[end - 1] = lo;
  return bytes;
}

/** Lowercase hex sha256 of the UTF-8 encoding of `text`. */
export function sha256Hex(text: string): string {
  const bytes = paddedUtf8(text);
  const w = new Int32Array(64);
  const h = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + (i << 2);
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let k = h[7];
    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (k + s1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += k;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) hex += (h[i] >>> 0).toString(16).padStart(8, "0");
  return hex;
}
