/**
 * W076 — one-tap account health reconnect (starts Gmail OAuth; caller refreshes status).
 *
 * S1-18 — OAuth runs in an auth session (`WebBrowser.openAuthSessionAsync`), which resolves
 * only when the browser reaches the app's return URL, carrying the callback's `status`.
 * A plain browser (`openBrowserAsync`) resolved 'cancel' on iOS whenever the sheet was closed,
 * even after consent, and 'opened' at once on Android, before OAuth had finished.
 */

/** Where the API's OAuth callback page sends the user (apps/api routes/ingestion.ts APP_RETURN_URL). */
export const GMAIL_OAUTH_RETURN_URL = 'worn://connect-email';

export type GmailReconnectResult =
  | { status: 'success'; oauthUrl: string; sourceId: string | null }
  | { status: 'cancelled'; oauthUrl: string }
  | { status: 'error'; message: string };

export type GmailReconnectDeps = {
  accessToken: string;
  createSource: (
    accessToken: string,
    body: { kind: 'EMAIL'; provider: string },
  ) => Promise<{ oauthUrl: string }>;
  /** `WebBrowser.openAuthSessionAsync`. */
  openAuthSession: (url: string, redirectUrl: string) => Promise<{ type: string; url?: string }>;
};

function returnStatus(url: string | undefined): { status: string | null; sourceId: string | null } {
  if (!url) return { status: null, sourceId: null };
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(query);
  return { status: params.get('status'), sourceId: params.get('sourceId') };
}

/** Create (or re-create) a Gmail source and run its OAuth in an auth session. */
export async function startGmailReconnect(
  deps: GmailReconnectDeps,
): Promise<GmailReconnectResult> {
  try {
    const { oauthUrl } = await deps.createSource(deps.accessToken, {
      kind: 'EMAIL',
      provider: 'gmail',
    });
    const result = await deps.openAuthSession(oauthUrl, GMAIL_OAUTH_RETURN_URL);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { status: 'cancelled', oauthUrl };
    }
    if (result.type !== 'success') {
      // 'locked': another auth session is open; anything else never reached the app.
      return { status: 'error', message: 'Could not finish Gmail sign-in. Try again.' };
    }
    const { status, sourceId } = returnStatus(result.url);
    if (status === 'connecting') return { status: 'success', oauthUrl, sourceId };
    if (status === 'cancelled') return { status: 'cancelled', oauthUrl };
    return { status: 'error', message: 'Gmail sign-in did not finish. Try again.' };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

export function reconnectButtonLabel(busy: boolean): string {
  return busy ? 'Reconnecting…' : 'Reconnect';
}
