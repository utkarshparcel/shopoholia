import fs from 'node:fs';
import path from 'node:path';

import {
  buildHouseholdInviteUrl,
  buildReferralDeepLink,
  buildSwapInviteUrl,
  WEB_ORIGIN,
} from '@worn/shared';
import { describe, expect, it } from 'vitest';

/**
 * S1-29 — the links the app shares (household, swap circle, family found-money) must land on
 * pages the website serves. apps/web serves them through rewrites of `/<x>/:code`.
 */
const webConfig = fs.readFileSync(path.resolve(__dirname, '../../../web/next.config.js'), 'utf8');
const servedPrefixes = [...webConfig.matchAll(/source:\s*'\/([a-z]+)\/:code'/g)].map((m) => m[1]);

function pathOf(url: string | null): string[] {
  const u = new URL(url!);
  expect(u.origin).toBe(WEB_ORIGIN);
  return u.pathname.split('/').filter(Boolean);
}

describe('Closet invite links point at website pages', () => {
  it('the website serves /h, /c and /r share links', () => {
    expect(servedPrefixes).toEqual(expect.arrayContaining(['h', 'c', 'r']));
  });

  it.each([
    ['household', buildHouseholdInviteUrl('abcd1234'), 'h'],
    ['swap circle', buildSwapInviteUrl('swap1234'), 'c'],
    ['family share', buildReferralDeepLink('home01'), 'r'],
  ])('%s invite is /<prefix>/<code> on the website', (_name, url, prefix) => {
    const [first, code, ...rest] = pathOf(url);
    expect(first).toBe(prefix);
    expect(servedPrefixes).toContain(first);
    expect(code).toMatch(/^[A-Za-z0-9]+$/);
    expect(rest).toEqual([]);
  });
});
