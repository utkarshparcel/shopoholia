import { act, fireEvent, render, screen } from '@testing-library/react';
import { Alert, Linking } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipientsScreen from '@/app/(closet)/recipients';

const gift = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FEATURE_CLOSET: true,
}));
vi.mock('@/src/hooks/closet/useCloset', () => ({
  useRecipients: () => ({
    isLoading: false,
    data: { recipients: [{ id: 'r1', name: 'Asha', relationship: 'FRIEND', profile: { tasteTags: [] } }] },
  }),
  useCreateRecipient: () => ({ mutate: vi.fn(), isPending: false }),
  useRecipientIdeas: (id: string) => ({
    data: id ? { ideas: [{ id: 'l1', title: 'Silk scarf', category: 'accessories', reason: 'Likes silk' }] } : undefined,
  }),
  useCreateGiftOrder: () => gift,
}));

type GiftOpts = { onSuccess: (o: { affiliateLink: string | null }) => void; onError: (e: unknown) => void };

async function openIdeas() {
  render(<RecipientsScreen />);
  fireEvent.click(screen.getByText('Show ideas'));
}

beforeEach(() => {
  gift.mutate.mockReset();
  gift.isPending = false;
  vi.mocked(Alert.alert).mockReset();
  vi.mocked(Linking.openURL).mockClear();
});

describe('recipients "Gift this" (S1-20)', () => {
  it('opens the store link the gift order returns', async () => {
    await openIdeas();
    fireEvent.click(screen.getByText('Gift this'));
    expect(gift.mutate).toHaveBeenCalledWith({ recipientId: 'r1', listingId: 'l1' }, expect.any(Object));
    const opts = gift.mutate.mock.calls[0]![1] as GiftOpts;
    await act(async () => opts.onSuccess({ affiliateLink: 'https://www.myntra.com/scarf?aff=1' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.myntra.com/scarf?aff=1');
  });

  it('confirms when there is no link, and does not order the same idea twice', async () => {
    await openIdeas();
    fireEvent.click(screen.getByText('Gift this'));
    const opts = gift.mutate.mock.calls[0]![1] as GiftOpts;
    await act(async () => opts.onSuccess({ affiliateLink: null }));
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe('Gift saved');
    fireEvent.click(screen.getByLabelText('Gifted'));
    expect(gift.mutate).toHaveBeenCalledTimes(1);
  });

  it('sends no second order while the first is in flight', async () => {
    await openIdeas();
    fireEvent.click(screen.getByText('Gift this'));
    gift.isPending = true;
    fireEvent.click(screen.getByText('Selected'));
    fireEvent.click(screen.getByLabelText('Gift this'));
    expect(gift.mutate).toHaveBeenCalledTimes(1);
  });
});
