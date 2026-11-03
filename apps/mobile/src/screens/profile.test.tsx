import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileScreen from '@/app/(tabs)/profile';
import {
  deleteAvatar,
  deleteVault,
  fetchOrders,
  getAvatar,
  logout,
  type OrderSummary,
} from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

type AlertButton = { text: string; style?: string; onPress?: () => void };

const rn = vi.hoisted(() => ({
  alert: vi.fn<(title: string, message?: string, buttons?: AlertButton[]) => void>(),
  openURL: vi.fn(async (_url: string) => true),
  platform: { OS: 'ios' as 'ios' | 'web' },
  push: vi.fn(),
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
    keyExtractor,
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
  }: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (info: { item: { id: string }; index: number }) => ReactNode;
    ListEmptyComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ListHeaderComponent?: ReactNode;
  }) => (
    <div>
      {ListHeaderComponent}
      {data.length === 0 ? ListEmptyComponent : null}
      {data.map((item, index) => (
        <div data-testid="order-row" key={keyExtractor(item)}>
          {renderItem({ item, index })}
        </div>
      ))}
      {ListFooterComponent}
    </div>
  ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Platform: rn.platform,
  Alert: { alert: rn.alert },
  Linking: { openURL: rn.openURL },
}));

// Whether the tab is showing; tests flip it to switch tabs away and back.
const focus = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    value: true,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(value: boolean) {
      focus.value = value;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock('expo-router', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useIsFocused: () => useSyncExternalStore(focus.subscribe, () => focus.value),
    useRouter: () => ({ push: rn.push, replace: vi.fn() }),
  };
});

vi.mock('@/src/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress} type="button">
      {label}
    </button>
  ),
  CoinWallet: ({ balance }: { balance: number }) => <span>{balance} coins</span>,
}));

vi.mock('@/src/hooks/orders', () => ({
  orderKeys: { list: (userId: string | null) => ['orders', userId] },
  useCoinBalance: () => ({ data: { balance: 500 } }),
}));

vi.mock('@/src/api/client', () => ({
  logout: vi.fn(async () => undefined),
  fetchOrders: vi.fn(async () => ({ orders: [] })),
  getAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  deleteVault: vi.fn(),
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
  return { title, message: message!, buttons: buttons! };
}

function pressDeleteAccount() {
  fireEvent.click(screen.getByText('Delete account'));
  const [title, message, buttons] = rn.alert.mock.lastCall!;
  return { title, message: message!, buttons: buttons! };
}

beforeEach(() => {
  focus.value = true;
  rn.alert.mockReset();
  rn.push.mockReset();
  vi.mocked(fetchOrders).mockReset().mockResolvedValue({ orders: [] });
  rn.platform.OS = 'ios';
  vi.mocked(getAvatar).mockReset().mockResolvedValueOnce(READY).mockResolvedValue(NONE);
  vi.mocked(deleteAvatar).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteVault).mockReset().mockResolvedValue(undefined);
  vi.mocked(logout).mockClear();
  rn.openURL.mockClear();
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
    await act(async () => {
      buttons[0]!.onPress?.();
    });
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

describe('ProfileScreen: sign out', () => {
  it('ends the session on the device and revokes the refresh token on the server', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    fireEvent.click(screen.getByText('Sign out'));

    expect(useSessionStore.getState()).toMatchObject({ accessToken: null, refreshToken: null });
    expect(logout).toHaveBeenCalledWith('refresh');
  });
});

describe('ProfileScreen: delete account', () => {
  it('says what gets deleted and that it is permanent, and does nothing if cancelled', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { title, message, buttons } = pressDeleteAccount();

    expect(title).toBe('Delete your account?');
    expect(message).toMatch(/permanently deletes your WORN account/);
    for (const what of [/avatar/, /photos you uploaded/, /orders/, /lookbook/, /coins/]) {
      expect(message).toMatch(what);
    }
    expect(message).toMatch(/can’t be undone/);
    expect(message).toMatch(/can’t be\s+refunded/);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete account', 'destructive'],
    ]);
    await act(async () => {
      buttons[0]!.onPress?.();
    });
    expect(deleteVault).not.toHaveBeenCalled();
    expect(useSessionStore.getState().accessToken).toBe('token-1');
  });

  it('deletes the account on the server once confirmed, then signs out', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { buttons } = pressDeleteAccount();
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')!.onPress!();
    });

    await waitFor(() => expect(useSessionStore.getState().accessToken).toBeNull());
    expect(deleteVault).toHaveBeenCalledWith('token-1');
    expect(useSessionStore.getState().refreshToken).toBeNull();
    expect(rn.alert).toHaveBeenLastCalledWith(
      'Account deleted',
      'Your WORN account and its data were deleted.',
    );
  });

  it('keeps the user signed in and explains when the deletion fails', async () => {
    vi.mocked(deleteVault).mockRejectedValueOnce(
      new Error('Your account couldn’t be deleted right now. Try again in a few minutes.'),
    );
    renderProfile();
    await screen.findByAltText('Your avatar');

    const { buttons } = pressDeleteAccount();
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')!.onPress!();
    });

    await screen.findByText(/Couldn’t delete your account\. Your account couldn’t be deleted right now/);
    expect(screen.getByText(/privacy@worncloset\.app/)).toBeTruthy();
    expect(useSessionStore.getState().accessToken).toBe('token-1');
    expect(screen.getByText('Delete account')).toBeTruthy();
  });

  it('confirms with the browser dialog on web', async () => {
    rn.platform.OS = 'web';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderProfile();
    await screen.findByAltText('Your avatar');

    fireEvent.click(screen.getByText('Delete account'));
    expect(deleteVault).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete account'));
    await waitFor(() => expect(useSessionStore.getState().accessToken).toBeNull());
    expect(deleteVault).toHaveBeenCalledWith('token-1');
    expect(confirm.mock.calls[0]![0]).toMatch(/^Delete your account\?/);
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/^Account deleted/));
    confirm.mockRestore();
    alert.mockRestore();
  });
});

describe('ProfileScreen: privacy policy', () => {
  it('opens the public privacy policy', async () => {
    renderProfile();
    await screen.findByAltText('Your avatar');

    fireEvent.click(screen.getByText('Privacy policy'));

    expect(rn.openURL).toHaveBeenCalledWith('https://worncloset.app/privacy');
  });
});

describe('ProfileScreen: orders', () => {
  const order = (
    id: string,
    state: OrderSummary['state'],
    placedAt: string,
    tier: OrderSummary['tier'] = 'STANDARD',
  ): OrderSummary => ({
    id,
    tier,
    state,
    coinTotal: 40,
    placedAt,
    rushAvailable: false,
    rushCostCoins: 0,
  });

  it('lists every reveal-ready haul so each can be opened, with tier names in words', async () => {
    vi.mocked(fetchOrders).mockResolvedValue({
      orders: [
        order('aaaaaaaa-transit', 'PACKED', '2026-06-18T12:05:00.000Z', 'SLOW_BURN'),
        order('bbbbbbbb-ready-old', 'REVEAL_READY', '2026-06-18T12:00:00.000Z', 'EXPRESS'),
        order('cccccccc-ready-new', 'REVEAL_READY', '2026-06-18T12:03:00.000Z'),
      ],
    });
    renderProfile();

    await waitFor(() => expect(screen.getAllByTestId('order-row')).toHaveLength(3));
    expect(screen.getAllByText('Ready')).toHaveLength(2);
    expect(screen.getByText('Slow burn delivery')).toBeTruthy();
    expect(screen.getByText('Express delivery')).toBeTruthy();
    expect(screen.queryByText(/SLOW_BURN/)).toBeNull();

    // The older ready haul has its own row that opens its reveal.
    fireEvent.click(screen.getByText('#bbbbbbbb'));
    expect(rn.push).toHaveBeenLastCalledWith('/reveal/bbbbbbbb-ready-old');
    fireEvent.click(screen.getByText('#aaaaaaaa'));
    expect(rn.push).toHaveBeenLastCalledWith('/order/aaaaaaaa-transit');

    // The banner opens the newest ready one.
    fireEvent.click(screen.getByText('Open reveal →'));
    expect(rn.push).toHaveBeenLastCalledWith('/reveal/cccccccc-ready-new');
  });

  it('refetches the orders when the tab is shown again, so a delivered haul stops showing as in transit', async () => {
    vi.mocked(fetchOrders).mockResolvedValue({
      orders: [order('dddddddd-on-its-way', 'OUT_FOR_DELIVERY', '2026-06-18T12:00:00.000Z', 'EXPRESS')],
    });
    renderProfile();
    await waitFor(() => expect(screen.getAllByTestId('order-row')).toHaveLength(1));
    expect(screen.queryByText('Ready')).toBeNull();

    // Away on another tab while the delivery timers finish on the server.
    act(() => focus.set(false));
    vi.mocked(fetchOrders).mockResolvedValue({
      orders: [order('dddddddd-on-its-way', 'REVEAL_READY', '2026-06-18T12:00:00.000Z', 'EXPRESS')],
    });
    act(() => focus.set(true));

    await waitFor(() => expect(screen.getAllByText('Ready')).toHaveLength(1));
    expect(fetchOrders).toHaveBeenCalledTimes(2);
  });
});
