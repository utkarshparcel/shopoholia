/**
 * Light device-calendar event reader for N03 (calendar → outfit).
 *
 * Production injects an Expo Calendar adapter; Expo Go / tests use the
 * in-memory stub with sample interview / office / wedding events.
 */

export type DeviceCalendarEvent = {
  id?: string;
  title: string;
  startAt: string;
  endAt?: string;
};

export type DeviceCalendarAdapter = {
  listUpcoming(opts?: { daysAhead?: number; limit?: number }): Promise<DeviceCalendarEvent[]>;
};

let adapter: DeviceCalendarAdapter | null = null;

/** Deterministic sample events when no real calendar bridge is installed. */
export function stubUpcomingCalendarEvents(opts?: {
  daysAhead?: number;
  limit?: number;
  now?: Date;
}): DeviceCalendarEvent[] {
  const limit = Math.max(1, Math.min(opts?.limit ?? 5, 20));
  const now = opts?.now ?? new Date();
  const base = (days: number, hour: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const samples: DeviceCalendarEvent[] = [
    { id: 'stub-interview', title: 'Onsite interview', startAt: base(2, 10) },
    { id: 'stub-office', title: 'Office standup', startAt: base(1, 9) },
    { id: 'stub-wedding', title: 'Cousin shaadi reception', startAt: base(5, 18) },
  ];
  const daysAhead = opts?.daysAhead ?? 14;
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() + daysAhead);
  return samples
    .filter((e) => {
      const t = new Date(e.startAt).getTime();
      return t >= now.getTime() && t <= cutoff.getTime();
    })
    .slice(0, limit);
}

const memoryStub: DeviceCalendarAdapter = {
  async listUpcoming(opts) {
    return stubUpcomingCalendarEvents(opts);
  },
};

export function setDeviceCalendarAdapter(next: DeviceCalendarAdapter | null): void {
  adapter = next;
}

export function getDeviceCalendarAdapter(): DeviceCalendarAdapter {
  return adapter ?? memoryStub;
}

export function resetDeviceCalendarAdapter(): void {
  adapter = null;
}

export async function listUpcomingCalendarEvents(opts?: {
  daysAhead?: number;
  limit?: number;
}): Promise<DeviceCalendarEvent[]> {
  return getDeviceCalendarAdapter().listUpcoming(opts);
}
