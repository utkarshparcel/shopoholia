/**
 * W071 — declutter challenge progress ring math (N/goal).
 */

export function declutterRingRatio(progress: number, target: number): number {
  const t = Math.max(0, Math.floor(target));
  if (t <= 0) return 0;
  return Math.min(1, Math.max(0, Math.floor(progress)) / t);
}

/** Degrees of fill for a circular ring (0–360). */
export function declutterRingDegrees(progress: number, target: number): number {
  return Math.round(declutterRingRatio(progress, target) * 360);
}

export function declutterRingLabel(progress: number, target: number): string {
  const p = Math.max(0, Math.floor(progress));
  const t = Math.max(0, Math.floor(target));
  return `${Math.min(p, t)}/${t}`;
}
