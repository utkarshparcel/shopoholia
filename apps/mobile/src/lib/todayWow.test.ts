/**
 * W043–W050 acceptance smoke (Today outfit wow).
 */
import { describe, expect, it } from 'vitest';
import {
  AVATAR_REVEAL_MS,
  altSwipeOffset,
  avoidRepeatChips,
  calendarImportSuccessCopy,
  dirtyWardrobeItemIds,
  isMorningOutfitDeepLink,
  laundryStarvationPrompt,
  mergeGoesWithIntoOutfit,
  nextAltIndex,
  shouldAnimateAltSwipe,
  shouldAnimateAvatarReveal,
  weatherRerollBannerCopy,
  weekDayAssignPayload,
  weekStripPlanHint,
} from './todayWow';

describe('W043–W050 Today outfit wow', () => {
  it('W043 worn://today focuses outfit reveal; Reduce Motion skips motion', () => {
    expect(isMorningOutfitDeepLink({ url: 'worn://today' })).toBe(true);
    expect(isMorningOutfitDeepLink({ focus: 'outfit' })).toBe(true);
    expect(isMorningOutfitDeepLink({ focus: 'reveal' })).toBe(true);
    expect(isMorningOutfitDeepLink({ reveal: '1' })).toBe(true);
    expect(isMorningOutfitDeepLink({ focus: 'packages' })).toBe(false);
    expect(isMorningOutfitDeepLink({ url: 'worn://vault?focus=expiry' })).toBe(false);
    expect(shouldAnimateAvatarReveal(false)).toBe(true);
    expect(shouldAnimateAvatarReveal(true)).toBe(false);
    expect(AVATAR_REVEAL_MS).toBeGreaterThan(200);
  });

  it('W044 smooth alt index; Use this look commits at alt > 0', () => {
    expect(nextAltIndex(0, 1, { hasMore: true })).toBe(1);
    expect(nextAltIndex(0, 1, { hasMore: false })).toBeNull();
    expect(nextAltIndex(1, -1, { hasMore: false })).toBe(0);
    expect(nextAltIndex(0, -1, { hasMore: true })).toBeNull();
    expect(nextAltIndex(2, 1, { hasMore: false })).toBeNull();
    expect(altSwipeOffset(1)).toBeGreaterThan(0);
    expect(altSwipeOffset(-1)).toBeLessThan(0);
    expect(shouldAnimateAltSwipe(true)).toBe(false);
    expect(shouldAnimateAltSwipe(false)).toBe(true);
  });

  it('W045 weather re-roll banner copy has accept CTA', () => {
    const copy = weatherRerollBannerCopy();
    expect(copy.title).toMatch(/weather/i);
    expect(copy.cta).toMatch(/use this look/i);
  });

  it('W046 week strip assign payload PATCHes date + itemIds', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(
      weekDayAssignPayload('2026-08-28', { itemIds: [a, b], occasion: 'WORK' }),
    ).toEqual({
      date: '2026-08-28',
      itemIds: [a, b],
      occasion: 'WORK',
    });
    expect(weekStripPlanHint()).toMatch(/long-press/i);
  });

  it('W047 avoid-repeat chips only for exclusion lines', () => {
    const chips = avoidRepeatChips([
      'Matched your taste tags: casual',
      'Skipped 2 piece(s) worn in the last 7 days',
      'Picked clean wardrobe staples for today',
    ]);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.label).toMatch(/worn in the last 7 days/i);
  });

  it('W048 goes-with merge keeps anchor and adds match', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    expect(mergeGoesWithIntoOutfit([a, b], a, c)).toEqual([a, b, c]);
    expect(mergeGoesWithIntoOutfit([a, b], a, b)).toEqual([a, b]);
  });

  it('W049 calendar import toast includes N outfits + night-before note', () => {
    const withRemind = calendarImportSuccessCopy({
      events: [
        { outfit: { id: '1' }, reminderScheduled: true, remindAt: '2026-08-26T20:00:00.000Z' },
        { outfit: { id: '2' }, reminderScheduled: false, remindAt: null },
      ],
    });
    expect(withRemind.title).toBe('2 outfits planned');
    expect(withRemind.body).toMatch(/night-before/i);

    const one = calendarImportSuccessCopy({
      events: [{ outfit: { id: '1' }, reminderScheduled: false }],
    });
    expect(one.title).toBe('1 outfit planned');
    expect(one.body).not.toMatch(/night-before/i);
  });

  it('W050 laundry empty → mark clean or wear anyway', () => {
    expect(
      laundryStarvationPrompt([
        { laundryStatus: 'DIRTY' },
        { laundryStatus: 'IN_LAUNDRY' },
      ]),
    ).toMatchObject({
      dirtyCount: 2,
      markCleanCta: 'Mark clean',
      wearAnywayCta: 'Wear anyway',
    });
    expect(
      laundryStarvationPrompt([
        { laundryStatus: 'DIRTY' },
        { laundryStatus: 'CLEAN' },
      ]),
    ).toBeNull();
    expect(
      dirtyWardrobeItemIds([
        { id: 'a', laundryStatus: 'DIRTY' },
        { id: 'b', laundryStatus: 'CLEAN' },
        { id: 'c', laundryStatus: 'IN_LAUNDRY' },
      ]),
    ).toEqual(['a', 'c']);
  });
});
