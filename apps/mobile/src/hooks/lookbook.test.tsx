import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { fetchLookbook, saveToLookbook } from '@/src/api/client';
import { useLookbook } from '@/src/hooks/lookbook';
import { useLookbookStore } from '@/src/stores/lookbook';
import { useSessionStore } from '@/src/stores/session';

vi.mock('@/src/api/client', () => ({
  fetchLookbook: vi.fn(),
  saveToLookbook: vi.fn(async () => undefined),
  removeFromLookbook: vi.fn(async () => undefined),
}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function card(id: string) {
  return { id, title: 'Tee', category: 'Tops', coinPrice: 40, houseModelImageUrl: 'https://cdn.test/t.jpg' };
}

describe('useLookbook', () => {
  it('lists the saved cards and picks up a save once the server confirms it', async () => {
    vi.mocked(fetchLookbook).mockResolvedValue({ items: [card(A)] });
    useSessionStore.getState().setSession({ accessToken: 'token-1', refreshToken: 'refresh' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useLookbook(), { wrapper });
    await waitFor(() => expect(result.current.data?.map((item) => item.id)).toEqual([A]));
    expect(useLookbookStore.getState().isSaved(A)).toBe(true);

    vi.mocked(fetchLookbook).mockResolvedValue({ items: [card(B), card(A)] });
    await act(() => useLookbookStore.getState().toggle(B));

    expect(saveToLookbook).toHaveBeenCalledWith('token-1', B);
    await waitFor(() => expect(result.current.data?.map((item) => item.id)).toEqual([B, A]));
  });
});
