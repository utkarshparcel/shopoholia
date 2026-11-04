import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import RevealScreen from '@/app/reveal/[orderId]';
import { revealWaitCopy } from '@/src/lib/revealWait';

const revealState = vi.hoisted(() => ({ expectedReadyAt: null as string | null }));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ orderId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@/src/hooks/reveal', () => ({
  useReveal: () => ({
    isLoading: false,
    data: {
      orderId: '11111111-1111-4111-8111-111111111111',
      rendersWaiting: true,
      expectedReadyAt: revealState.expectedReadyAt,
      renders: [
        {
          id: 'free-1',
          orderItemId: 'item-1',
          scenario: 'STUDIO',
          imageUrl: null,
          isFree: true,
          unlocked: true,
          status: 'QUEUED',
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
  useGenerateRenders: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryRenders: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 } }),
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
    // Button.tsx wraps Pressable at import time.
    createAnimatedComponent: <T,>(component: T) => component,
  },
  useSharedValue: (initial: number) => ({ value: initial }),
  useAnimatedStyle: (fn: () => object) => fn(),
  withSpring: (value: number) => value,
  runOnJS: (fn: () => void) => fn,
}));

describe('RevealScreen while the renders wait for the render agent', () => {
  it('says when the reveal will be ready, in the local time, instead of a spinner', () => {
    revealState.expectedReadyAt = '2026-11-05T01:30:00.000Z';
    render(<RevealScreen />, { wrapper: Wrapper });
    const note = screen.getByTestId('reveal-wait');
    expect(note.textContent).toBe(revealWaitCopy('2026-11-05T01:30:00.000Z'));
    expect(note.textContent).toMatch(/^Delivered — your reveal is being styled .*will be ready by about .+\. We'll send you a push\.$/);
    expect(screen.queryByText('Still rendering looks — this updates automatically.')).toBeNull();
  });

  it('says shortly when there is no estimate', () => {
    revealState.expectedReadyAt = null;
    render(<RevealScreen />, { wrapper: Wrapper });
    expect(screen.getAllByTestId('reveal-wait').at(-1)!.textContent).toBe(
      "Delivered — your reveal is being styled and will be ready shortly. We'll send you a push.",
    );
  });
});
