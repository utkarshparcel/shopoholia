import { act, fireEvent, render, screen } from '@testing-library/react';
import { Share } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStringAsync: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'tok' }),
}));

vi.mock('@/src/api/client', () => ({
  getMyReferral: vi.fn(async () => ({ referralCode: 'WORN42', referredCount: 1, earnedCoins: 100 })),
  applyReferral: vi.fn(),
}));

import ReferralScreen from '@/app/referral';
import { getMyReferral } from '@/src/api/client';

async function renderLoaded() {
  render(<ReferralScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText('WORN42')).toBeTruthy();
}

describe('ReferralScreen copy', () => {
  beforeEach(() => {
    mocks.setStringAsync.mockReset();
    vi.mocked(Share.share).mockClear();
  });

  it('copies the code to the clipboard, not the share sheet, then says Copied!', async () => {
    mocks.setStringAsync.mockResolvedValue(true);
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByText('Copy'));
    });
    expect(mocks.setStringAsync).toHaveBeenCalledWith('WORN42');
    expect(Share.share).not.toHaveBeenCalled();
    expect(screen.getByText('Copied!')).toBeTruthy();
  });

  it('does not say Copied! when the copy fails', async () => {
    mocks.setStringAsync.mockRejectedValue(new Error('no clipboard'));
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByText('Copy'));
    });
    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByText(/Could not copy/)).toBeTruthy();
  });

  it('keeps a separate Share action with the invite link', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByText('Share'));
    });
    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining('/r/WORN42'),
    });
  });

  it('copies the invite instead of throwing where sharing is unsupported (web)', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(
      new Error('Share is not supported in this browser'),
    );
    mocks.setStringAsync.mockResolvedValue(true);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByText('Share'));
    });
    expect(mocks.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('/r/WORN42'));
    alert.mockRestore();
  });
});

describe('ReferralScreen load failure', () => {
  it('says why in plain words and loads again on Try again', async () => {
    vi.mocked(getMyReferral).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ReferralScreen />);

    expect(await screen.findByText('Could not reach WORN. Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('WORN42')).toBeTruthy();
  });
});
