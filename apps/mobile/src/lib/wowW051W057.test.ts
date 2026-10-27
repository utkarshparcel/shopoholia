/**
 * W051–W057 acceptance smoke (Today / wardrobe occasion polish).
 */
import { describe, expect, it } from 'vitest';
import {
  defaultWeddingSpan,
  interviewKitRemindConfirm,
  parseDateKey,
  parseInterviewEventAt,
  sanitizeTravelPackChecklist,
  seasonalSwapFeedback,
  travelPackSharePayload,
  wearPhotoErrorCopy,
  wearPhotoSnapTapBudget,
  wearPhotoWithinBudget,
  withCapsulePreference,
  workwearDayBadge,
  workwearRegenerateBody,
  workwearStripDays,
  weddingFestivalDayCount,
  weddingFestivalPlanSummary,
  WEAR_PHOTO_MAX_TAPS,
} from './todayOccasionWow';

describe('W051–W057 Today/wardrobe occasion polish', () => {
  it('W051 camera→upload→wear stays ≤3 taps + recoverable error', () => {
    expect(wearPhotoSnapTapBudget()).toBeLessThanOrEqual(WEAR_PHOTO_MAX_TAPS);
    expect(wearPhotoWithinBudget(1)).toBe(true);
    expect(wearPhotoWithinBudget(3)).toBe(true);
    expect(wearPhotoWithinBudget(4)).toBe(false);
    const err = wearPhotoErrorCopy('network down');
    expect(err.retryLabel).toBe('Retry');
    expect(err.body).toMatch(/network down/);
  });

  it('W052 capsule toggle flag constrains generate body', () => {
    expect(withCapsulePreference({ fillWeek: true }, true)).toEqual({
      fillWeek: true,
      preferCapsule: true,
    });
    expect(withCapsulePreference({ date: '2026-09-01' }, false).preferCapsule).toBe(false);
  });

  it('W053 workwear strip filters Mon–Fri WORK + unique regen', () => {
    const days = [
      { weekday: 'Mon', outfit: { occasion: 'WORK' } },
      { weekday: 'Tue', outfit: { occasion: 'CASUAL' } },
      { weekday: 'Sat', outfit: { occasion: 'WORK' } },
      { weekday: 'Wed', outfit: null },
      { weekday: 'Fri', outfit: { occasion: 'WORK' } },
    ];
    const strip = workwearStripDays(days);
    expect(strip.map((d) => d.weekday)).toEqual(['Mon', 'Fri']);
    expect(workwearDayBadge('WORK')).toBe('WORK');
    expect(workwearDayBadge('CASUAL')).toBeNull();
    expect(workwearRegenerateBody({ unique: true })).toMatchObject({
      commit: true,
      unique: true,
    });
  });

  it('W054 travel pack share strips PII', () => {
    const raw = [
      '# Travel pack',
      '- [ ] Uniqlo · shirt — me@worn.app',
      '- [ ] jeans — +91 98765 43210',
      '- [ ] sneaker — aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    ].join('\n');
    const scrubbed = sanitizeTravelPackChecklist(raw);
    expect(scrubbed).not.toMatch(/me@worn\.app/);
    expect(scrubbed).not.toMatch(/98765/);
    expect(scrubbed).not.toMatch(/aaaaaaaa-bbbb/);
    expect(scrubbed).toContain('[redacted]');
    const share = travelPackSharePayload(raw);
    expect(share.hasPii).toBe(true);
    expect(share.message).not.toMatch(/@/);
    expect(share.dialogTitle).toMatch(/Travel/);
  });

  it('W055 seasonal swap is Reduce Motion safe', () => {
    expect(seasonalSwapFeedback(false)).toMatchObject({
      animate: true,
      haptic: true,
      mode: 'motion_haptic',
    });
    expect(seasonalSwapFeedback(true)).toMatchObject({
      animate: false,
      haptic: true,
      mode: 'haptic_only',
    });
  });

  it('W056 interview kit confirm shows remindAt + edit/cancel', () => {
    const withRemind = interviewKitRemindConfirm({
      remindAt: '2026-10-14T20:00:00.000Z',
      reminderScheduled: true,
    });
    expect(withRemind.actions).toEqual(['keep', 'edit', 'cancel']);
    expect(withRemind.body).toMatch(/nudge/i);
    expect(withRemind.canCancel).toBe(true);

    const expired = interviewKitRemindConfirm({ remindAt: null });
    expect(expired.actions).toContain('edit');
    expect(expired.canCancel).toBe(false);

    expect(parseInterviewEventAt('2026-10-15')).toBe('2026-10-15T12:00:00.000Z');
    expect(parseInterviewEventAt('not-a-date')).toBeNull();
  });

  it('W057 wedding/festival date span → N days + envelope summary', () => {
    expect(weddingFestivalDayCount('2026-10-01', '2026-10-03')).toBe(3);
    expect(weddingFestivalDayCount('2026-10-03', '2026-10-01')).toBe(0);
    expect(parseDateKey('2026-10-01')).toBe('2026-10-01');
    expect(parseDateKey('10/01/2026')).toBeNull();
    const span = defaultWeddingSpan(new Date('2026-08-26T12:00:00.000Z'));
    expect(span.startDate).toBe('2026-08-26');
    expect(span.endDate).toBe('2026-08-28');
    expect(
      weddingFestivalPlanSummary({
        kind: 'wedding',
        dayCount: 3,
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        envelope: { status: 'OK' },
      }),
    ).toMatch(/3 wedding looks/);
    expect(
      weddingFestivalPlanSummary({
        kind: 'festival',
        dayCount: 2,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        envelope: null,
      }),
    ).not.toMatch(/envelope/);
  });
});
