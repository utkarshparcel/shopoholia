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
 * pages the website serves. The site is a static export on Cloudflare, which maps `/<x>/:code`
 * onto the page in apps/web/public/_redirects.
 */
const redirects = fs.readFileSync(path.resolve(__dirname, '../../../web/public/_redirects'), 'utf8');
const servedPrefixes = [...redirects.matchAll(/^\/([a-z]+)\/:code\s+\/\1\s+200\s*$/gm)].map((m) => m[1]);

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
