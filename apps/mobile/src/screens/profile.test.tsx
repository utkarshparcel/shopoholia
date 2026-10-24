import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileScreen from '@/app/(tabs)/profile';
import { deleteAvatar, getAvatar } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

type AlertButton = { text: string; style?: string; onPress?: () => void };

const rn = vi.hoisted(() => ({
  alert: vi.fn<(title: string, message: string, buttons: AlertButton[]) => void>(),
  platform: { OS: 'ios' as 'ios' | 'web' },
}));

// The shared react-native mock has no FlatList or Alert, which this screen needs.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: ({ accessibilityLabel, source }: { accessibilityLabel?: string; source: { uri: string } }) => (
    <img alt={accessibilityLabel} src={source.uri} />
  ),
  Pressable: ({
    children,
    disabled,
    onPress,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button disabled={disabled} onClick={onPress} type="button">
      {children}
    </button>
  ),
  FlatList: ({
    data,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
  }: {
    data: unknown[];
    ListEmptyComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ListHeaderComponent?: ReactNode;
  }) => (
    <div>
      {ListHeaderComponent}
      {data.length === 0 ? ListEmptyComponent : null}
      {ListFooterComponent}
    </div>
  ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Platform: rn.platform,
  Alert: { alert: rn.alert },
}));

vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/src/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress} type="button">
      {label}
    </button>
  ),
  CoinWallet: ({ balance }: { balance: number }) => <span>{balance} coins</span>,
}));

vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 } }),
}));

vi.mock('@/src/api/client', () => ({
  fetchOrders: vi.fn(async () => ({ orders: [] })),
  getAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}));

const READY = { status: 'READY', referencePreviewUrl: 'https://cdn.test/avatar.jpg' };
const NONE = { status: 'NONE', referencePreviewUrl: null };

function renderProfile() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

function pressDeleteMyPhotos() {
  fireEvent.click(screen.getByText('Delete my photos'));
  const [title, message, buttons] = rn.alert.mock.lastCall!;
  return { title, message, buttons };
}

beforeEach(() => {
  rn.alert.mockReset();
  rn.platform.OS = 'ios';
  vi.mocked(getAvatar).mockReset().mockResolvedValueOnce(READY).mockResolvedValue(NONE);
  vi.mocked(deleteAvatar).mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().setSession({ accessToken: 'token-1', refreshToken: 'refresh' });
});

afterEach(() => {
  useSessionStore.getState().clear();
});

describe('ProfileScreen: delete my photos', () => {
  it('explains what gets deleted and does nothing if cancelled', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { title, message, buttons } = pressDeleteMyPhotos();

    expect(title).toBe('Delete your photos?');
    expect(message).toMatch(/permanently deletes the photos you uploaded and your avatar/);
    expect(message).toMatch(/try-on will need a new upload/);
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);
    expect(buttons[0]!.onPress).toBeUndefined();
    expect(deleteAvatar).not.toHaveBeenCalled();
  });

  it('deletes the photos once confirmed and clears the avatar', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { buttons } = pressDeleteMyPhotos();
    act(() => buttons.find((b) => b.style === 'destructive')!.onPress!());

    await screen.findByText('Your photos and avatar were deleted.');
    expect(deleteAvatar).toHaveBeenCalledWith('token-1');
    expect(screen.queryByAltText('Your avatar')).toBeNull();
    // The avatar query is refetched rather than left stale.
    await waitFor(() => expect(getAvatar).toHaveBeenCalledTimes(2));
  });

  it('shows the error and keeps the avatar when deleting fails', async () => {
    vi.mocked(deleteAvatar).mockRejectedValueOnce(new Error('Network request failed'));
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { buttons } = pressDeleteMyPhotos();
    act(() => buttons.find((b) => b.style === 'destructive')!.onPress!());

    await screen.findByText('Couldn’t delete your photos. Network request failed');
    expect(screen.getByAltText('Your avatar')).toBeTruthy();
    expect(screen.getByText('Delete my photos')).toBeTruthy();
  });

  it('confirms with the browser dialog on web', async () => {
    rn.platform.OS = 'web';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderProfile();
    await screen.findByAltText('Your avatar');

    fireEvent.click(screen.getByText('Delete my photos'));
    expect(deleteAvatar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete my photos'));
    await screen.findByText('Your photos and avatar were deleted.');
    expect(confirm.mock.calls[0]![0]).toMatch(/^Delete your photos\?/);
    expect(rn.alert).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
