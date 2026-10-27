import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useDeleteVault,
  useExportAccountantCsv,
  useExportVault,
} from './useCloset';
import {
  deleteVault,
  exportVaultData,
  fetchAccountantExportCsv,
} from '@/src/api/client';
import { shareTextFile } from '@/src/lib/shareFile';
import { trackEvent } from '@/src/lib/analytics';

const clearSession = vi.fn();

vi.mock('@/src/stores/session', () => {
  const store = {
    accessToken: 'test-token' as string | null,
    clear: () => clearSession(),
  };
  const useSessionStore = Object.assign(
    (selector: (s: typeof store) => unknown) => selector(store),
    { getState: () => store },
  );
  return { useSessionStore };
});

vi.mock('@/src/api/client', () => ({
  exportVaultData: vi.fn(async () => ({
    grants: [],
    moneyAccounts: [{ id: 'acc-1' }],
    moneyLedger: [],
    receipts: [],
    warranties: [],
    ingestionSources: [],
    merchantPurchases: [],
    merchantPurchaseItems: [],
    ingestionDocuments: [],
    orders: [],
    orderItems: [],
    carts: [],
    cartItems: [],
    sellers: [],
    listings: [],
    listingVariants: [],
    avatars: [],
    renders: [],
    tryonPreviews: [],
    pushEvents: [],
    coinLedger: [],
    iapReceipts: [],
    cashbackEvents: [],
    budgets: [],
    spendRollups: [],
    returnRequests: [],
    returnEvents: [],
    recipients: [],
    recipientProfiles: [],
    giftOrders: [],
    measurementProfiles: [],
    customizationTemplates: [],
    tailoringOrders: [],
    wardrobeItems: [],
    outfits: [],
    wearLog: [],
    itemMetrics: [],
    dispositionListings: [],
  })),
  deleteVault: vi.fn(async () => undefined),
  fetchAccountantExportCsv: vi.fn(async () => 'kind,amount\nSPEND,100\n'),
  // stubs required because useCloset imports the full client surface
  addCredit: vi.fn(),
  claimWarranty: vi.fn(),
  confirmReceipt: vi.fn(),
  confirmReturn: vi.fn(),
  createBudget: vi.fn(),
  deleteWardrobeItem: vi.fn(),
  disposeWasteItem: vi.fn(),
  fetchAccountantLedger: vi.fn(),
  fetchAccountantSummary: vi.fn(),
  fetchBudgets: vi.fn(),
  fetchCredits: vi.fn(),
  fetchReceipts: vi.fn(),
  fetchReturns: vi.fn(),
  fetchReturnDetail: vi.fn(),
  fetchTodayOutfit: vi.fn(),
  fetchWardrobe: vi.fn(),
  fetchWarranties: vi.fn(),
  fetchWasteDead: vi.fn(),
  fetchWasteSummary: vi.fn(),
  initiateReturn: vi.fn(),
  logWear: vi.fn(),
  spendCredit: vi.fn(),
  undoSpendCredit: vi.fn(),
  mergeCredits: vi.fn(),
  markCreditExpiryHandled: vi.fn(),
  tryOnWardrobeItem: vi.fn(),
  updateWardrobeItem: vi.fn(),
  uploadReceipt: vi.fn(),
  uploadWardrobeItem: vi.fn(),
  uploadWearPhoto: vi.fn(),
}));

vi.mock('@/src/lib/shareFile', () => ({
  shareTextFile: vi.fn(async () => ({ uri: 'file:///cache/out', shared: true })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

function MutProbe<T>({
  hook,
  onReady,
}: {
  hook: () => { mutateAsync: T };
  onReady: (mutate: T) => void;
}) {
  const mut = hook();
  onReady(mut.mutateAsync);
  return <span>ready</span>;
}

describe('vault export / delete / accountant CSV hooks', () => {
  beforeEach(() => {
    clearSession.mockClear();
    vi.mocked(exportVaultData).mockClear();
    vi.mocked(deleteVault).mockClear();
    vi.mocked(fetchAccountantExportCsv).mockClear();
    vi.mocked(shareTextFile).mockClear();
    vi.mocked(trackEvent).mockClear();
  });

  it('exports vault JSON via shareTextFile', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useExportVault>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <MutProbe
          hook={useExportVault}
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync();
    });

    expect(exportVaultData).toHaveBeenCalledWith('test-token');
    expect(shareTextFile).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/json',
        dialogTitle: 'Export my data',
        contents: expect.stringContaining('moneyAccounts'),
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith('vault_export');
  });

  it('deletes vault, clears session, and tracks vault_deleted', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const clearSpy = vi.spyOn(client, 'clear');
    let mutateAsync!: ReturnType<typeof useDeleteVault>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <MutProbe
          hook={useDeleteVault}
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync();
    });

    expect(deleteVault).toHaveBeenCalledWith('test-token');
    expect(clearSession).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('vault_deleted');
  });

  it('exports accountant CSV via shareTextFile', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useExportAccountantCsv>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <MutProbe
          hook={useExportAccountantCsv}
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await mutateAsync();
    });

    expect(fetchAccountantExportCsv).toHaveBeenCalledWith('test-token');
    expect(shareTextFile).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'text/csv',
        dialogTitle: 'Export CSV',
        contents: 'kind,amount\nSPEND,100\n',
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith('accountant_exported');
  });

  it('surfaces API errors from exportVaultData', async () => {
    vi.mocked(exportVaultData).mockRejectedValueOnce(new Error('Export blocked'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let mutateAsync!: ReturnType<typeof useExportVault>['mutateAsync'];
    render(
      <QueryClientProvider client={client}>
        <MutProbe
          hook={useExportVault}
          onReady={(m) => {
            mutateAsync = m;
          }}
        />
      </QueryClientProvider>,
    );

    await expect(
      act(async () => {
        await mutateAsync();
      }),
    ).rejects.toThrow('Export blocked');
    expect(shareTextFile).not.toHaveBeenCalled();
  });
});
