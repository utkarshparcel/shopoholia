/**
 * Worn never reads the SMS inbox (plan §11.7, MOB 7): the app asks for no SMS permission and has
 * no inbox sync, on any platform. Order and shipping texts reach Worn only when the user
 * forwards them to their forwarding address.
 */
export function supportsSmsInboxRead(): boolean {
  return false;
}

/**
 * The inbox forwarded texts go to, from the build's EXPO_PUBLIC_FORWARDING_ADDRESS, or null.
 * There is no fallback: an address that nothing reads must never be shown (S2-09), so with none
 * configured every forwarding prompt stays hidden.
 */
export function getSmsForwardingAddress(): string | null {
  const address = process.env.EXPO_PUBLIC_FORWARDING_ADDRESS?.trim();
  return address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

/** Forwarding copy for every platform (the app doesn't read texts itself), or null without an address. */
export function getIosSmsForwardingCopy(address?: string): string | null {
  const addr = address ?? getSmsForwardingAddress();
  if (!addr) return null;
  return (
    `WORN doesn't read your texts. Forward any order or shipping text to ${addr} — ` +
    `we'll parse it just like an email receipt. You can skip this and connect email only.`
  );
}

/**
 * @deprecated Inbox reading was removed (MOB 7). Always resolves to no ids and reads nothing;
 * kept only until connect-email.tsx drops its Android SMS card.
 */
export async function syncSmsInbox(_accessToken: string): Promise<string[]> {
  return [];
}
