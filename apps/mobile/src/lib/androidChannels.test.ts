import { afterEach, describe, expect, it } from 'vitest';
import {
  closetAndroidChannels,
  ensureAndroidNotificationChannels,
  listStubAndroidChannels,
  resetAndroidChannelStub,
} from './androidChannels';

describe('androidChannels (NOTIF-RICH)', () => {
  afterEach(() => {
    resetAndroidChannelStub();
  });

  it('defines one channel per category matching shared ids', () => {
    const channels = closetAndroidChannels();
    expect(channels.map((c) => c.id).sort()).toEqual(
      [
        'worn-credits',
        'worn-digest',
        'worn-outfits',
        'worn-returns',
        'worn-warranty',
      ].sort(),
    );
  });

  it('ensureAndroidNotificationChannels registers all categories', async () => {
    const registered = await ensureAndroidNotificationChannels();
    expect(registered).toHaveLength(5);
    expect(listStubAndroidChannels()).toHaveLength(5);
    expect(listStubAndroidChannels().find((c) => c.id === 'worn-returns')).toMatchObject({
      name: 'Returns',
      importance: 'high',
    });
  });
});
