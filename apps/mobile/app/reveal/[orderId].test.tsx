import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RevealScreen from './[orderId]';

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ orderId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@/src/hooks/reveal', () => ({
  useReveal: () => ({
    isLoading: false,
    data: {
      orderId: '11111111-1111-4111-8111-111111111111',
      renders: [
        {
          id: 'free-1',
          orderItemId: 'item-1',
          scenario: 'STUDIO',
          imageUrl: 'https://cdn.test/studio.jpg',
          isFree: true,
          unlocked: true,
          status: 'DONE',
        },
        {
          id: 'locked-1',
          orderItemId: 'item-1',
          scenario: 'STREET',
          imageUrl: null,
          isFree: false,
          unlocked: false,
          status: 'QUEUED',
          unlockCostCoins: 50,
        },
      ],
    },
  }),
  useUnlockRenders: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (state: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'token-1' }),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/src/api/client', () => ({
  submitRevealRating: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  useSharedValue: (initial: number) => ({ value: initial }),
  useAnimatedStyle: (fn: () => object) => fn(),
  withSpring: (value: number) => value,
  runOnJS: (fn: () => void) => fn,
}));

describe('RevealScreen', () => {
  it('renders swipe deck with free and locked cards', () => {
    render(<RevealScreen />);
    expect(screen.getByText('Your haul, on you')).toBeTruthy();
    expect(screen.getByText('STUDIO')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Download')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
  });

  it('shows unlock CTA when navigating to locked card', () => {
    render(<RevealScreen />);
    fireEvent.click(screen.getByText('→'));
    expect(screen.getByText('Locked look')).toBeTruthy();
    expect(screen.getByText('Unlock · 50 coins')).toBeTruthy();
  });

  it('renders reveal satisfaction survey', () => {
    render(<RevealScreen />);
    expect(screen.getByText('How did the reveal feel?')).toBeTruthy();
    expect(screen.getByText('Loved it')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('Meh')).toBeTruthy();
  });
});
