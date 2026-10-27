import { describe, expect, it } from 'vitest';
import { eventStampByState, returnStatusTimeline } from './returnTimeline';

describe('returnStatusTimeline', () => {
  it('marks pipeline steps relative to current state', () => {
    const steps = returnStatusTimeline('CONFIRMED');
    expect(steps.map((s) => s.id)).toEqual([
      'REQUESTED',
      'INITIATED',
      'PICKUP_SCHEDULED',
      'CONFIRMED',
      'REFUNDED',
    ]);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'todo']);
  });

  it('stamps steps from events', () => {
    const steps = returnStatusTimeline('INITIATED', [
      { toState: 'REQUESTED', createdAt: '2026-01-01T10:00:00.000Z' },
      { toState: 'INITIATED', createdAt: '2026-01-02T10:00:00.000Z' },
    ]);
    expect(steps[0]!.at).toBe('2026-01-01T10:00:00.000Z');
    expect(steps[1]!.at).toBe('2026-01-02T10:00:00.000Z');
    expect(steps[1]!.state).toBe('current');
  });

  it('appends failed terminal for EXPIRED', () => {
    const steps = returnStatusTimeline('EXPIRED', [
      { toState: 'REQUESTED', createdAt: '2026-01-01T10:00:00.000Z' },
      { toState: 'INITIATED', createdAt: '2026-01-02T10:00:00.000Z' },
      { toState: 'EXPIRED', createdAt: '2026-01-10T10:00:00.000Z' },
    ]);
    expect(steps.at(-1)).toMatchObject({ id: 'EXPIRED', state: 'failed', label: 'Expired' });
    expect(steps.filter((s) => s.state === 'done').map((s) => s.id)).toEqual([
      'REQUESTED',
      'INITIATED',
    ]);
  });

  it('handles CANCELLED', () => {
    const steps = returnStatusTimeline('CANCELLED', [
      { toState: 'REQUESTED', createdAt: '2026-01-01T10:00:00.000Z' },
      { toState: 'CANCELLED', createdAt: '2026-01-03T10:00:00.000Z' },
    ]);
    expect(steps.at(-1)?.id).toBe('CANCELLED');
    expect(steps.at(-1)?.state).toBe('failed');
  });
});

describe('eventStampByState', () => {
  it('keeps first occurrence per state', () => {
    const stamps = eventStampByState([
      { toState: 'INITIATED', createdAt: '2026-01-02T10:00:00.000Z' },
      { toState: 'REQUESTED', createdAt: '2026-01-01T10:00:00.000Z' },
      { toState: 'INITIATED', createdAt: '2026-01-03T10:00:00.000Z' },
    ]);
    expect(stamps.REQUESTED).toBe('2026-01-01T10:00:00.000Z');
    expect(stamps.INITIATED).toBe('2026-01-02T10:00:00.000Z');
  });
});
