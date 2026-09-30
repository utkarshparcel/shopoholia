import type { RenderCard } from '@/src/api/client';

/**
 * Whether any look is still being generated. Locked paid renders sit QUEUED until
 * they're unlocked, so they don't count: waiting on them would poll forever.
 */
export function hasRendersInProgress(renders: Pick<RenderCard, 'isFree' | 'unlocked' | 'status'>[]) {
  return renders.some(
    (r) => (r.isFree || r.unlocked) && (r.status === 'QUEUED' || r.status === 'RUNNING'),
  );
}
