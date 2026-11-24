import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkCreditBalance, startWearChallenge } from './client';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'https://api.worn.test' } } },
}));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonHeaderWithoutBody(init: RequestInit | undefined): boolean {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers['Content-Type'] === 'application/json' && (init?.body == null || init.body === '');
}

describe('JSON POSTs always carry a body (Fastify answers an empty JSON body with 400)', () => {
  it('checkCreditBalance sends a JSON body', async () => {
    await checkCreditBalance('tok', 'c1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.worn.test/credits/c1/balance-check');
    expect(jsonHeaderWithoutBody(init)).toBe(false);
  });

  it('startWearChallenge sends a JSON body', async () => {
    await startWearChallenge('tok', 'w1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.worn.test/waste/w1/challenge');
    expect(jsonHeaderWithoutBody(init)).toBe(false);
  });

  it('no apiFetch call in client.ts sets a JSON content type without a body', () => {
    const src = fs.readFileSync(path.join(__dirname, 'client.ts'), 'utf8');
    const offenders: number[] = [];
    const re = /apiFetch\(([\s\S]*?)\);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const call = m[1]!;
      if (/application\/json/.test(call) && !/\bbody\s*[:,}]/.test(call)) {
        offenders.push(src.slice(0, m.index).split('\n').length);
      }
    }
    expect(offenders).toEqual([]);
  });
});
