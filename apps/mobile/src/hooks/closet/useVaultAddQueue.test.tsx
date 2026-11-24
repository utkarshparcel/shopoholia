import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addCredit } from '@/src/api/client';
import { enqueueVaultAdd, VAULT_ADD_QUEUE_KEY } from '@/src/lib/vaultAddQueue';

import { useVaultAddQueue } from './useVaultAddQueue';

vi.mock('@/src/api/client', () => ({ addCredit: vi.fn(async () => ({ id: 'server-card' })) }));

let flushFromA: ((token: string) => Promise<unknown>) | null = null;

function QueueView({ label }: { label: string }) {
  const q = useVaultAddQueue('user-1');
  if (label === 'A') flushFromA = q.flush;
  return <span>{`${label}:${q.items.length}`}</span>;
}

beforeEach(async () => {
  await AsyncStorage.removeItem(VAULT_ADD_QUEUE_KEY);
  vi.mocked(addCredit).mockClear();
});

describe('useVaultAddQueue (S1-26)', () => {
  it('updates every view of the queue when one of them flushes, and refetches gift cards', async () => {
    await enqueueVaultAdd('user-1', { kind: 'GIFT_CARD', merchant: 'Nykaa', currency: 'INR', balanceMinor: 100 });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <QueueView label="A" />
        <QueueView label="B" />
      </QueryClientProvider>,
    );
    await screen.findByText('B:1');
    await act(async () => {
      await flushFromA!('tok');
    });
    await waitFor(() => expect(screen.getByText('B:0')).toBeTruthy());
    expect(screen.getByText('A:0')).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gift-cards'] });
  });

  it('shows a card queued elsewhere without a remount', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QueueView label="B" />
      </QueryClientProvider>,
    );
    await screen.findByText('B:0');
    await act(async () => {
      await enqueueVaultAdd('user-1', { kind: 'GIFT_CARD', merchant: 'Nykaa', currency: 'INR', balanceMinor: 100 });
    });
    await waitFor(() => expect(screen.getByText('B:1')).toBeTruthy());
  });

  it('does not refetch when nothing was sent', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <QueueView label="A" />
      </QueryClientProvider>,
    );
    await screen.findByText('A:0');
    await act(async () => {
      await flushFromA!('tok');
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
