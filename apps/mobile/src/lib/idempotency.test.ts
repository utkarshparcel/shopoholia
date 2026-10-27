import { describe, expect, it, vi } from 'vitest';
import { newIdempotencyKey } from './idempotency';

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => '0b6a3c1e-5d2f-4a8b-9c7d-1e2f3a4b5c6d'),
}));

describe('newIdempotencyKey', () => {
  it('returns a v4 UUID from expo-crypto', async () => {
    const { randomUUID } = await import('expo-crypto');
    expect(newIdempotencyKey()).toBe('0b6a3c1e-5d2f-4a8b-9c7d-1e2f3a4b5c6d');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('makes a new key on every call', async () => {
    const { randomUUID } = await import('expo-crypto');
    vi.mocked(randomUUID)
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
