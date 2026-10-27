import { describe, expect, it, vi } from 'vitest';

import { reconnectButtonLabel, startGmailReconnect } from './healthReconnect';

describe('W076 health reconnect', () => {
  it('labels busy vs idle', () => {
    expect(reconnectButtonLabel(false)).toBe('Reconnect');
    expect(reconnectButtonLabel(true)).toBe('Reconnecting…');
  });

  it('opens OAuth and reports success', async () => {
    const createSource = vi.fn(async () => ({ oauthUrl: 'https://oauth.example/start' }));
    const openBrowser = vi.fn(async () => ({ type: 'opened' }));
    const result = await startGmailReconnect({
      accessToken: 'tok',
      createSource,
      openBrowser,
    });
    expect(createSource).toHaveBeenCalledWith('tok', { kind: 'EMAIL', provider: 'gmail' });
    expect(openBrowser).toHaveBeenCalledWith('https://oauth.example/start');
    expect(result).toEqual({ status: 'success', oauthUrl: 'https://oauth.example/start' });
  });

  it('maps cancel / dismiss and errors', async () => {
    const createSource = vi.fn(async () => ({ oauthUrl: 'https://oauth.example/start' }));
    expect(
      await startGmailReconnect({
        accessToken: 'tok',
        createSource,
        openBrowser: async () => ({ type: 'cancel' }),
      }),
    ).toMatchObject({ status: 'cancelled' });

    expect(
      await startGmailReconnect({
        accessToken: 'tok',
        createSource: async () => {
          throw new Error('Missing EMAIL consent');
        },
        openBrowser: async () => ({ type: 'opened' }),
      }),
    ).toEqual({ status: 'error', message: 'Missing EMAIL consent' });
  });
});
