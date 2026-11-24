// Runs in plain Node (type stripping), no browser: `pnpm --filter @worn/web test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_KINDS, SHARE_PREFIX, shareCodeFromPath } from '../src/lib/share-links.ts';

test('referral and invite codes are read the way the app builds them', () => {
  assert.equal(shareCodeFromPath('referral', '/r/AB3K9Q'), 'AB3K9Q');
  assert.equal(shareCodeFromPath('referral', '/r/ab3k9q/'), 'AB3K9Q');
  assert.equal(shareCodeFromPath('swap', '/c/ABCD2345'), 'ABCD2345');
  assert.equal(shareCodeFromPath('household', '/h/WXYZ'), 'WXYZ');
  assert.equal(shareCodeFromPath('referral', '/r/AB%20C-D9'), 'ABCD9');
});

test('a missing, short, long or malformed code gives null', () => {
  assert.equal(shareCodeFromPath('referral', '/r'), null);
  assert.equal(shareCodeFromPath('referral', '/r/'), null);
  assert.equal(shareCodeFromPath('referral', '/r/ABC'), null);
  assert.equal(shareCodeFromPath('referral', `/r/${'A'.repeat(21)}`), null);
  assert.equal(shareCodeFromPath('referral', '/r/AB%E0%A4CD'), null);
  assert.equal(shareCodeFromPath('referral', '/r/ABCD/extra'), null);
  assert.equal(shareCodeFromPath('referral', '/c/ABCD'), null);
});

test('poll links keep their opaque token', () => {
  const token = 'Zx9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJK0'; // 43 chars, base64url
  assert.equal(shareCodeFromPath('outfit', `/p/outfit/${token}`), token);
  assert.equal(shareCodeFromPath('return', '/p/return/3f1c2a7e-1b2c-4d5e-8f90-123456789abc'), '3f1c2a7e-1b2c-4d5e-8f90-123456789abc');
  assert.equal(shareCodeFromPath('return', '/p/return/<script>'), null);
  assert.equal(shareCodeFromPath('outfit', `/p/return/${token}`), null);
});

test('every kind has a prefix and the copy its page needs', () => {
  for (const [kind, copy] of Object.entries(SHARE_KINDS)) {
    assert.ok(SHARE_PREFIX[kind].startsWith('/'), kind);
    for (const key of ['title', 'description', 'eyebrow', 'headline', 'body', 'ctaTitle', 'ctaBody']) {
      assert.ok(copy[key].length > 0, `${kind}.${key}`);
    }
    assert.ok(copy.steps.length > 0, kind);
    if (copy.showsCode) assert.ok(copy.codeLabel.length > 0, kind);
  }
});

test('the referral page is Worn Play copy, and Closet invites never say Closet is open', () => {
  const r = SHARE_KINDS.referral;
  assert.equal(r.list, 'play');
  assert.doesNotMatch(JSON.stringify(r), /Closet|gift card|cashback/i);
  assert.match(JSON.stringify(r), /100 coins/);
  for (const kind of ['swap', 'household', 'outfit', 'return']) {
    assert.equal(SHARE_KINDS[kind].list, 'closet');
    assert.match(SHARE_KINDS[kind].steps.join(' '), /hasn’t opened yet/);
  }
});

test('Cloudflare maps every share link onto its page, and leaves its share card alone', async () => {
  const { readFile } = await import('node:fs/promises');
  const rules = (await readFile(new URL('../public/_redirects', import.meta.url), 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/));
  const index = (from) => rules.findIndex(([source]) => source === from);
  for (const prefix of Object.values(SHARE_PREFIX)) {
    const codeRule = index(`${prefix}/:code`) >= 0 ? index(`${prefix}/:code`) : index(`${prefix}/:id`);
    assert.ok(codeRule >= 0, `${prefix}/:code is rewritten`);
    assert.deepEqual(rules[codeRule].slice(1), [prefix, '200'], `${prefix} keeps the address (200)`);
    // Rules match top-down: the card's own rule must come first or the code rule swallows it.
    const card = index(`${prefix}/opengraph-image`);
    assert.ok(card >= 0 && card < codeRule, `${prefix}/opengraph-image is served before the code rule`);
    assert.deepEqual(rules[card].slice(1), [`${prefix}/opengraph-image`, '200']);
  }
});
