import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import { notify } from '@/src/lib/confirm';

export type ShareTextInput = {
  message: string;
  /** iOS attaches it to the sheet; elsewhere it is appended to the copied text on fallback. */
  url?: string;
  title?: string;
};

/**
 * - `shared`: the share sheet ran (Android can't tell a dismissal apart, so this includes it).
 * - `dismissed`: the user closed the sheet or cancelled the browser share.
 * - `copied`: sharing wasn't available or failed, so the text went to the clipboard instead.
 * - `failed`: neither worked; the user has already been told.
 */
export type ShareTextResult = 'shared' | 'dismissed' | 'copied' | 'failed';

/** A browser's `navigator.share` rejects with an AbortError when the user cancels. */
function isUserCancel(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'AbortError') return true;
  return typeof message === 'string' && /\b(cancel(l)?ed|aborted)\b/i.test(message);
}

/**
 * Shares text through the system share sheet without ever throwing. Where sharing isn't
 * supported (react-native-web without `navigator.share` rejects with "Share is not supported in
 * this browser") or it fails, the text is copied to the clipboard and the user is told so.
 * A user cancel is a no-op.
 */
export async function shareText({ message, url, title }: ShareTextInput): Promise<ShareTextResult> {
  try {
    const result = await Share.share({
      message,
      ...(url ? { url } : {}),
      ...(title ? { title } : {}),
    });
    // Share.dismissedAction is 'dismissedAction' (iOS only).
    return result?.action === 'dismissedAction' ? 'dismissed' : 'shared';
  } catch (error) {
    if (isUserCancel(error)) return 'dismissed';
  }

  const text = url && !message.includes(url) ? `${message} ${url}` : message;
  let copied = false;
  try {
    copied = await Clipboard.setStringAsync(text);
  } catch {
    copied = false;
  }
  if (copied) {
    notify('Copied to clipboard', 'Sharing isn’t available here, so we copied it — paste it anywhere.');
    return 'copied';
  }
  notify('Couldn’t share', text);
  return 'failed';
}
