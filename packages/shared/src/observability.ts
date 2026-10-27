/** Runtime surfaces for Sentry / analytics tagging. */
export type WornSurface = "closet" | "play" | "api" | "worker";

export type WornSentryTagInput = {
  surface: WornSurface;
  /** Closet screen title or route id (e.g. "Vault", "today"). */
  screen?: string;
  /** Worker package short name (e.g. "expiry", "ingest"). */
  worker?: string;
};

/**
 * Stable tag bag for Closet-wide Sentry. Always includes `worn_surface`.
 */
export function wornSentryTags(input: WornSentryTagInput): Record<string, string> {
  const tags: Record<string, string> = { worn_surface: input.surface };
  if (input.screen) tags.closet_screen = input.screen;
  if (input.worker) tags.worker = input.worker;
  return tags;
}

/** Preview smoke event name — capture when SENTRY_SMOKE / EXPO_PUBLIC_SENTRY_SMOKE=1. */
export function sentrySmokeMessage(surface: WornSurface, detail?: string): string {
  return detail ? `worn.smoke.${surface}.${detail}` : `worn.smoke.${surface}`;
}
