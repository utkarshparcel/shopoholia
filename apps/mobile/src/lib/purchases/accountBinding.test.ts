import { describe, expect, it, vi } from 'vitest';

import { appAccountTokenFor, obfuscatedAccountIdFor, uuidV5 } from './accountBinding';

/** expo-crypto's digests need the native runtime; node:crypto computes the same hashes. */
vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  const name = (algorithm: string) => algorithm.replace('-', '').toLowerCase();
  return {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256' },
    digest: async (algorithm: string, data: Uint8Array) => {
      const out = createHash(name(algorithm)).update(data).digest();
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    },
    digestStringAsync: async (algorithm: string, data: string) => createHash(name(algorithm)).update(data).digest('hex'),
  };
});

/** Test vectors from iap-contract.md, section 2; the server computes the same values. */
describe('account binding', () => {
  it('uses a UUID user id as the appAccountToken, lowercased', async () => {
    await expect(appAccountTokenFor('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).resolves.toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
  });

  it('turns any other id into the UUID v5 of worn:user:<id>', async () => {
    await expect(appAccountTokenFor('user-42')).resolves.toBe('09014ab4-c6b0-5921-8946-33861b9ab243');
  });

  it('computes RFC 4122 v5 UUIDs', async () => {
    // RFC 4122 DNS namespace example.
    await expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).resolves.toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('uses the SHA-256 hex of the user id as the obfuscatedAccountId', async () => {
    await expect(obfuscatedAccountIdFor('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).resolves.toBe(
      '16362f566387b3cf5a6e92fb0a986c76ca20eb3a0c12cbdfbd0b29501e0c18df',
    );
  });
});
