/**
 * W076 — one-tap account health reconnect (starts Gmail OAuth; caller refreshes status).
 */

export type GmailReconnectResult =
  | { status: 'success'; oauthUrl: string }
  | { status: 'cancelled'; oauthUrl: string }
  | { status: 'error'; message: string };

export type GmailReconnectDeps = {
  accessToken: string;
  createSource: (
    accessToken: string,
    body: { kind: 'EMAIL'; provider: string },
  ) => Promise<{ oauthUrl: string }>;
  openBrowser: (url: string) => Promise<{ type: string }>;
};

/** Create (or re-create) a Gmail source and open the OAuth browser session. */
export async function startGmailReconnect(
  deps: GmailReconnectDeps,
): Promise<GmailReconnectResult> {
  try {
    const { oauthUrl } = await deps.createSource(deps.accessToken, {
      kind: 'EMAIL',
      provider: 'gmail',
    });
    const result = await deps.openBrowser(oauthUrl);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { status: 'cancelled', oauthUrl };
    }
    return { status: 'success', oauthUrl };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

export function reconnectButtonLabel(busy: boolean): string {
  return busy ? 'Reconnecting…' : 'Reconnect';
}
