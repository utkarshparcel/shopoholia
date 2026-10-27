import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'http://api.test' } } },
}));

describe('vault + accountant client helpers', () => {
  it('exportVaultData GETs /vault/export', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        grants: [],
        moneyAccounts: [],
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
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { exportVaultData } = await import('@/src/api/client');
    await exportVaultData('tok');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/vault/export',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('deleteVault DELETEs /vault and tolerates 204', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const { deleteVault } = await import('@/src/api/client');
    await expect(deleteVault('tok')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/vault',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('fetchAccountantExportCsv returns text body', async () => {
    const fetchMock = vi.fn(async () => new Response('a,b\n1,2\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchAccountantExportCsv } = await import('@/src/api/client');
    await expect(fetchAccountantExportCsv('tok')).resolves.toBe('a,b\n1,2\n');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/accountant/export.csv',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('deleteVault throws on failure', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'forbidden', message: 'Nope' }, { status: 403 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { deleteVault } = await import('@/src/api/client');
    await expect(deleteVault('tok')).rejects.toThrow('Nope');
  });
});
