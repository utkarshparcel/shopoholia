import { describe, expect, it } from 'vitest';

import {
  buildInlineFixBody,
  draftFromActivityItem,
  parseMajorTotal,
} from './fixParseInline';

describe('W075 fix-parse inline', () => {
  it('parses major units into minor', () => {
    expect(parseMajorTotal('499.00')).toEqual({ ok: true, totalMinor: 49900 });
    expect(parseMajorTotal('0')).toEqual({ ok: true, totalMinor: 0 });
    expect(parseMajorTotal('')).toMatchObject({ ok: false });
    expect(parseMajorTotal('-1')).toMatchObject({ ok: false });
    expect(parseMajorTotal('abc')).toMatchObject({ ok: false });
  });

  it('builds correction body from draft', () => {
    const draft = draftFromActivityItem({
      merchant: 'Myntra',
      totalMinor: 12_345,
      currency: 'INR',
    });
    expect(draft).toEqual({
      merchant: 'Myntra',
      totalMajor: '123.45',
      currency: 'INR',
    });
    expect(buildInlineFixBody({ ...draft, totalMajor: '500.00' })).toEqual({
      ok: true,
      body: { merchant: 'Myntra', totalMinor: 50_000, currency: 'INR' },
    });
    expect(buildInlineFixBody({ merchant: '  ', totalMajor: '10', currency: 'USD' })).toEqual({
      ok: true,
      body: { merchant: undefined, totalMinor: 1000, currency: 'USD' },
    });
  });
});
