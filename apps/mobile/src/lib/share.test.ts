import { Share } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStringAsync: vi.fn<(text: string) => Promise<boolean>>(),
  notify: vi.fn(),
}));

vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }));
vi.mock('@/src/lib/confirm', () => ({ notify: mocks.notify }));

import { shareText } from './share';

const share = vi.mocked(Share.share);

beforeEach(() => {
  share.mockReset();
  mocks.setStringAsync.mockReset();
  mocks.notify.mockReset();
});

describe('shareText', () => {
  it('opens the share sheet and reports shared', async () => {
    share.mockResolvedValue({ action: 'sharedAction' });
    await expect(shareText({ message: 'hi', title: 'T' })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ message: 'hi', title: 'T' });
    expect(mocks.setStringAsync).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('reports an iOS dismissal without copying', async () => {
    share.mockResolvedValue({ action: 'dismissedAction' });
    await expect(shareText({ message: 'hi' })).resolves.toBe('dismissed');
    expect(mocks.setStringAsync).not.toHaveBeenCalled();
  });

  it('does not throw where sharing is unsupported; copies and tells the user instead', async () => {
    // What react-native-web does without navigator.share.
    share.mockRejectedValue(new Error('Share is not supported in this browser'));
    mocks.setStringAsync.mockResolvedValue(true);
    await expect(
      shareText({ message: 'Join me', url: 'https://worn.app/r/X' }),
    ).resolves.toBe('copied');
    expect(mocks.setStringAsync).toHaveBeenCalledWith('Join me https://worn.app/r/X');
    expect(mocks.notify).toHaveBeenCalledWith('Copied to clipboard', expect.any(String));
  });

  it('does not duplicate a url already in the message when copying', async () => {
    share.mockRejectedValue(new Error('nope'));
    mocks.setStringAsync.mockResolvedValue(true);
    await shareText({ message: 'Go https://x.y/z', url: 'https://x.y/z' });
    expect(mocks.setStringAsync).toHaveBeenCalledWith('Go https://x.y/z');
  });

  it('treats a browser share cancel as a no-op', async () => {
    share.mockRejectedValue(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
    await expect(shareText({ message: 'hi' })).resolves.toBe('dismissed');
    expect(mocks.setStringAsync).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('shows the text when neither sharing nor copying works', async () => {
    share.mockRejectedValue(new Error('Share is not supported in this browser'));
    mocks.setStringAsync.mockRejectedValue(new Error('no clipboard'));
    await expect(shareText({ message: 'code WORN42' })).resolves.toBe('failed');
    expect(mocks.notify).toHaveBeenCalledWith('Couldn’t share', 'code WORN42');
  });
});
