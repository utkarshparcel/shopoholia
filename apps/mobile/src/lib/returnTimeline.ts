/** Status timeline for a return request — pipeline + event stamps. */

export type ReturnTimelineState =
  | 'REQUESTED'
  | 'INITIATED'
  | 'CONFIRMED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | string;

export type ReturnTimelineStepState = 'done' | 'current' | 'todo' | 'failed';

export type ReturnTimelineStep = {
  id: string;
  label: string;
  state: ReturnTimelineStepState;
  /** ISO timestamp when this step was reached, if known from events */
  at?: string | null;
};

const PIPELINE: Array<{ id: ReturnTimelineState; label: string }> = [
  { id: 'REQUESTED', label: 'Requested' },
  { id: 'INITIATED', label: 'Initiated' },
  { id: 'PICKUP_SCHEDULED', label: 'Pickup booked' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'REFUNDED', label: 'Refunded' },
];

const PIPELINE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE.map((s, i) => [s.id, i]),
);

export type ReturnTimelineEvent = {
  toState: string;
  createdAt: string;
};

/** First time each pipeline state was reached (from events). */
export function eventStampByState(
  events: ReturnTimelineEvent[],
): Record<string, string> {
  const stamps: Record<string, string> = {};
  const ordered = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const e of ordered) {
    if (!stamps[e.toState]) stamps[e.toState] = e.createdAt;
  }
  return stamps;
}

/**
 * Build a solid status timeline from current state + optional events.
 * Terminal EXPIRED / CANCELLED replace the remaining pipeline as a failed step.
 */
export function returnStatusTimeline(
  state: ReturnTimelineState,
  events: ReturnTimelineEvent[] = [],
): ReturnTimelineStep[] {
  const stamps = eventStampByState(events);
  const idx = PIPELINE_INDEX[state];

  if (state === 'EXPIRED' || state === 'CANCELLED') {
    const lastGood = [...events]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((e) => e.toState)
      .filter((s) => s in PIPELINE_INDEX)
      .pop();
    const lastIdx = lastGood != null ? (PIPELINE_INDEX[lastGood] ?? -1) : -1;
    const steps: ReturnTimelineStep[] = PIPELINE.slice(0, Math.max(lastIdx + 1, 0)).map(
      (s, i) => ({
        id: s.id,
        label: s.label,
        state: i <= lastIdx ? 'done' : 'todo',
        at: stamps[s.id] ?? null,
      }),
    );
    steps.push({
      id: state,
      label: state === 'EXPIRED' ? 'Expired' : 'Cancelled',
      state: 'failed',
      at: stamps[state] ?? null,
    });
    return steps;
  }

  if (idx == null) {
    return [
      {
        id: state,
        label: state,
        state: 'current',
        at: stamps[state] ?? null,
      },
    ];
  }

  return PIPELINE.map((s, i) => {
    let stepState: ReturnTimelineStepState = 'todo';
    if (i < idx) stepState = 'done';
    else if (i === idx) stepState = 'current';
    return {
      id: s.id,
      label: s.label,
      state: stepState,
      at: stamps[s.id] ?? null,
    };
  });
}
