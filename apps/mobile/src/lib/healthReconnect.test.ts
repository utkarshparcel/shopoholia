import { describe, expect, it, vi } from 'vitest';

import { GMAIL_OAUTH_RETURN_URL, reconnectButtonLabel, startGmailReconnect } from './healthReconnect';

const oauthUrl = 'https://oauth.example/start';
const createSource = vi.fn(async () => ({ oauthUrl }));

function run(openAuthSession: (url: string, redirect: string) => Promise<{ type: string; url?: string }>) {
  return startGmailReconnect({ accessToken: 'tok', createSource, openAuthSession });
}

describe('W076 health reconnect', () => {
  it('labels busy vs idle', () => {
    expect(reconnectButtonLabel(false)).toBe('Reconnect');
    expect(reconnectButtonLabel(true)).toBe('Reconnecting…');
  });

  it('returns to the URL the API callback page links to', () => {
    // apps/api/src/routes/ingestion.ts APP_RETURN_URL
    expect(GMAIL_OAUTH_RETURN_URL).toBe('worn://connect-email');
  });

  it('runs OAuth in an auth session and reports success only when the callback says connecting', async () => {
    const openAuthSession = vi.fn(async () => ({
      type: 'success',
      url: 'worn://connect-email?status=connecting&sourceId=src-1',
    }));
    const result = await run(openAuthSession);
    expect(createSource).toHaveBeenCalledWith('tok', { kind: 'EMAIL', provider: 'gmail' });
    expect(openAuthSession).toHaveBeenCalledWith(oauthUrl, 'worn://connect-email');
    expect(result).toEqual({ status: 'success', oauthUrl, sourceId: 'src-1' });
  });

  it('S1-18: a browser that merely opened (Android openBrowserAsync) is not a finished OAuth', async () => {
    expect(await run(async () => ({ type: 'opened' }))).toMatchObject({ status: 'error' });
  });

  it('maps the callback statuses for denied and failed consent', async () => {
    expect(await run(async () => ({ type: 'success', url: 'worn://connect-email?status=cancelled' }))).toEqual({
      status: 'cancelled',
      oauthUrl,
    });
    expect(await run(async () => ({ type: 'success', url: 'worn://connect-email?status=failed' }))).toMatchObject({
      status: 'error',
    });
  });

  it('maps cancel / dismiss and errors', async () => {
    expect(await run(async () => ({ type: 'cancel' }))).toMatchObject({ status: 'cancelled' });
    expect(await run(async () => ({ type: 'dismiss' }))).toMatchObject({ status: 'cancelled' });
    expect(
      await startGmailReconnect({
        accessToken: 'tok',
        createSource: async () => {
          throw new Error('Missing EMAIL consent');
        },
        openAuthSession: async () => ({ type: 'success' }),
      }),
    ).toEqual({ status: 'error', message: 'Missing EMAIL consent' });
  });
});
