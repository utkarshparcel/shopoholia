import type { RenderCard } from '@/src/api/client';

type RenderState = Pick<RenderCard, 'isFree' | 'unlocked' | 'status'>;

/**
 * Whether this look is being generated. Locked paid renders sit QUEUED until they're unlocked,
 * so a locked one is waiting on the user, not rendering.
 */
export function isRenderInProgress(r: RenderState) {
  return (r.isFree || r.unlocked) && (r.status === 'QUEUED' || r.status === 'RUNNING');
}

/** Whether any look is still being generated (locked ones don't count: polling would never end). */
export function hasRendersInProgress(renders: RenderState[]) {
  return renders.some(isRenderInProgress);
}
