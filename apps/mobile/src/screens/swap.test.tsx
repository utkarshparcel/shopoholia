import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SwapScreen from '@/app/(closet)/swap';

const ME = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const CIRCLE = '33333333-3333-4333-8333-333333333333';

const m = vi.hoisted(() => ({
  borrow: { mutate: vi.fn(), isPending: false },
  giveBack: { mutate: vi.fn(), isPending: false },
  listings: [] as Record<string, unknown>[],
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FEATURE_CLOSET: true,
}));
vi.mock('@/src/hooks/closet/keys', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSessionUserId: () => ME,
}));
vi.mock('@/src/hooks/closet/useCloset', () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useSwapCircles: () => ({ isLoading: false, data: { circles: [{ id: CIRCLE, name: 'Friends', inviteCode: 'SWAP1234' }] } }),
    useCreateSwapCircle: idle,
    useJoinSwapCircle: idle,
    useBorrowSwapListing: () => m.borrow,
    useReturnSwapListing: () => m.giveBack,
    useSwapListings: (id: string | null) => ({ data: id ? { listings: m.listings } : undefined }),
    useWardrobe: () => ({ data: { items: [] }, hasNextPage: false }),
  };
});

function listing(id: string, status: string, ownerUserId: string, borrowerUserId: string | null = null) {
  return {
    id,
    circleId: CIRCLE,
    ownerUserId,
    wardrobeItemId: `${id}-item`,
    dispositionListingId: null,
    status,
    borrowerUserId,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SwapScreen />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('Open'));
}

beforeEach(() => {
  m.borrow.mutate.mockReset();
  m.giveBack.mutate.mockReset();
});

describe('swap circle listings (S1-22)', () => {
  it('lets the borrower return a borrowed piece', () => {
    m.listings = [listing('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BORROWED', FRIEND, ME)];
    open();
    fireEvent.click(screen.getByText('Return'));
    expect(m.giveBack.mutate).toHaveBeenCalledWith(
      { circleId: CIRCLE, listingId: 'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      expect.any(Object),
    );
  });

  it('lets the owner mark their lent piece returned, but not someone else’s loan', () => {
    m.listings = [
      listing('b1bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'BORROWED', ME, FRIEND),
      listing('c1cccccc-cccc-4ccc-8ccc-cccccccccccc', 'BORROWED', FRIEND, '44444444-4444-4444-8444-444444444444'),
    ];
    open();
    expect(screen.getAllByText('Mark returned')).toHaveLength(1);
    expect(screen.queryByText('Return')).toBeNull();
  });

  it('offers Borrow on friends’ pieces only, not on your own', () => {
    m.listings = [
      listing('d1dddddd-dddd-4ddd-8ddd-dddddddddddd', 'LISTED', ME),
      listing('e1eeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'LISTED', FRIEND),
    ];
    open();
    const buttons = screen.getAllByText('Borrow');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(m.borrow.mutate.mock.calls[0]![0]).toEqual({
      circleId: CIRCLE,
      listingId: 'e1eeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
  });
});
