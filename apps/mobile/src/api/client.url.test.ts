import { describe, expect, it } from 'vitest';

import { resolveApiUrl } from './client';

describe('resolveApiUrl (Plan #4)', () => {
  it('takes EXPO_PUBLIC_API_URL first, then extra.apiUrl, without a trailing slash', () => {
    expect(resolveApiUrl('https://api.example.com/', 'https://other.example.com', null)).toBe(
      'https://api.example.com',
    );
    expect(resolveApiUrl(undefined, 'https://other.example.com', null)).toBe('https://other.example.com');
    expect(resolveApiUrl('  ', ' https://other.example.com ', null)).toBe('https://other.example.com');
  });

  it('falls back to localhost only when a dev fallback is given', () => {
    expect(resolveApiUrl(undefined, undefined, 'http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolveApiUrl(undefined, undefined, null)).toBeNull();
    expect(resolveApiUrl('', '', null)).toBeNull();
  });
});
