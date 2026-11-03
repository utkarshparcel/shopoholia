import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { suggestPickupSlots } from './returnsPolish';
import { parseInterviewEventAt } from './todayOccasionWow';
import { nextSaturdayMorning } from './vaultWow';

/** S2-10 — reminder and slot times follow the user's clock, not UTC. */
const originalTz = process.env.TZ;

function inZone<T>(zone: string, fn: () => T): T {
  process.env.TZ = zone;
  return fn();
}

function wallClock(d: Date | string, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(d));
}

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('local times (S2-10)', () => {
  it.each(['Asia/Kolkata', 'America/New_York'])('the weekend reminder is Saturday 10:00 in %s', (zone) => {
    const sat = inZone(zone, () => nextSaturdayMorning(new Date('2026-11-04T08:00:00.000Z')));
    expect(wallClock(sat, zone)).toBe('Sat 10:00');
  });

  it.each(['Asia/Kolkata', 'America/New_York'])('pickup slots are 10:00 and 14:00 in %s', (zone) => {
    const slots = inZone(zone, () => suggestPickupSlots(new Date('2026-11-04T08:00:00.000Z'), 2));
    expect(slots.map((s) => wallClock(s, zone).slice(4))).toEqual(['10:00', '14:00']);
  });

  it('a date-only interview lands at midday on that day in India', () => {
    const at = inZone('Asia/Kolkata', () => parseInterviewEventAt('2026-10-15'));
    expect(wallClock(at!, 'Asia/Kolkata')).toBe('Thu 12:00');
  });
});
