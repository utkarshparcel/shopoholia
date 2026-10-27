/**
 * @deprecated The Android SMS inbox reader was removed (MOB 7, plan §11.7): Worn never reads
 * texts. This no-op stays only until connect-email.tsx drops its Android SMS card.
 */
export function ensureAndroidSmsInboxAdapterRegistered(): boolean {
  return false;
}
