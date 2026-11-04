import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HouseholdScreen from '@/app/(closet)/household';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';

const spendMutate = vi.fn();
const patchMutate = vi.fn();

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: true }));
vi.mock('@/src/hooks/closet/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

const H = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const ME = '44444444-4444-4444-8444-444444444444';

const state = vi.hoisted(() => ({
  me: null as string | null,
  ownerId: undefined as string | undefined,
  extraAccounts: [] as Record<string, unknown>[],
  extraMembers: [] as Record<string, unknown>[],
}));
vi.mock('@/src/hooks/closet/keys', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSessionUserId: () => state.me,
}));

vi.mock('@/src/hooks/closet/useCloset', () => {
  const mutation = (mutate = vi.fn()) => ({ mutate, isPending: false });
  return {
    useHouseholds: () => ({
      data: { households: [{ id: H, name: 'Our home', inviteCode: 'ABCD12', ownerId: state.ownerId }] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useCreateHousehold: () => mutation(),
    useJoinHousehold: () => mutation(),
    useHouseholdWardrobe: () => ({ data: { items: [] }, isError: false }),
    useHouseholdVault: (id: string | null) => ({
      isError: false,
      data: id
        ? {
            householdId: H,
            myAccess: 'SPEND',
            mySpendCapMinor: 500000,
            mySpentMinor: 0,
            accounts: [
              {
                id: ACCOUNT,
                ownerUserId: MEMBER,
                merchant: 'Myntra',
                kind: 'GIFT_CARD',
                currency: 'INR',
                balanceCacheMinor: 120000,
                expiresAt: null,
              },
              ...state.extraAccounts,
            ],
            members: [
              { userId: MEMBER, vaultAccess: 'VIEW', spendCapMinor: null, spentMinor: 0 },
              ...state.extraMembers,
            ],
          }
        : undefined,
    }),
    usePatchHouseholdVaultMember: () => mutation(patchMutate),
    useSpendHouseholdVault: () => mutation(spendMutate),
  };
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function openHousehold() {
  render(<HouseholdScreen />);
  fireEvent.click(screen.getByText('Open'));
}

async function confirmPrompt(field: string, value: string, confirmLabel: string) {
  fireEvent.change(screen.getByTestId(`prompt-field-${field}`), { target: { value } });
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('prompt-sheet')).getByText(confirmLabel));
  });
}

describe('household vault', () => {
  beforeEach(() => {
    spendMutate.mockReset();
    patchMutate.mockReset();
    state.me = null;
    state.ownerId = undefined;
    state.extraAccounts = [];
    state.extraMembers = [];
    useClosetPrefsStore.setState({ preferredCurrency: 'INR' });
    vi.mocked(Alert.alert).mockReset();
  });

  it('shows member access in words, not the raw enum', async () => {
    await openHousehold();
    expect(screen.getByText(/Member 1 · view only/)).toBeTruthy();
    expect(screen.queryByText(/VIEW/)).toBeNull();
  });

  it('asks how much was spent, rejects more than the balance, and sends a UUID key', async () => {
    await openHousehold();
    fireEvent.click(screen.getAllByText('Mark spent')[0]!);
    expect(spendMutate).not.toHaveBeenCalled();

    await confirmPrompt('amount', '1500', 'Mark spent');
    expect(screen.getByTestId('prompt-error').textContent).toMatch(/more than the ₹1,200/);
    expect(spendMutate).not.toHaveBeenCalled();

    await confirmPrompt('amount', '250', 'Mark spent');
    expect(spendMutate).toHaveBeenCalledTimes(1);
    const [body] = spendMutate.mock.calls[0]!;
    expect(body).toMatchObject({ accountId: ACCOUNT, amountMinor: 25000 });
    expect(body.idempotencyKey).toMatch(UUID);
  });

  it('retries a failed spend with the same key, and a new spend gets a new key', async () => {
    await openHousehold();
    fireEvent.click(screen.getAllByText('Mark spent')[0]!);
    await confirmPrompt('amount', '100', 'Mark spent');
    const first = spendMutate.mock.calls[0]![0].idempotencyKey;

    // The request fails: the alert's "Try again" re-sends the same action.
    act(() => spendMutate.mock.calls[0]![1].onError(new Error('network')));
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === 'Try again')!.onPress!());
    expect(spendMutate.mock.calls[1]![0].idempotencyKey).toBe(first);

    fireEvent.click(screen.getAllByText('Mark spent')[0]!);
    await confirmPrompt('amount', '100', 'Mark spent');
    expect(spendMutate.mock.calls[2]![0].idempotencyKey).not.toBe(first);
  });

  it('asks for a cap before allowing a member to spend', async () => {
    await openHousehold();
    fireEvent.click(screen.getAllByText('Allow spend')[0]!);
    expect(patchMutate).not.toHaveBeenCalled();
    await confirmPrompt('cap', '2000', 'Allow spend');
    expect(patchMutate.mock.calls[0]![0]).toEqual({
      userId: MEMBER,
      vaultAccess: 'SPEND',
      spendCapMinor: 200000,
    });
  });

  it('S1-28: types and shows the cap in the shared credits\' currency, not the viewer\'s preference', async () => {
    useClosetPrefsStore.setState({ preferredCurrency: 'USD' });
    await openHousehold();
    fireEvent.click(screen.getAllByText('Allow spend')[0]!);
    expect(screen.getByText('Spend cap in INR')).toBeTruthy();
    await confirmPrompt('cap', '2000', 'Allow spend');
    expect(patchMutate.mock.calls[0]![0].spendCapMinor).toBe(200000);
    expect(screen.queryByTestId('household-vault-mixed-currency')).toBeNull();
  });

  it('S1-28: warns that caps do not convert when shared credits mix currencies', async () => {
    state.extraAccounts = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        ownerUserId: MEMBER,
        merchant: 'Target',
        kind: 'GIFT_CARD',
        currency: 'USD',
        balanceCacheMinor: 5000,
        expiresAt: null,
      },
    ];
    await openHousehold();
    expect(screen.getByTestId('household-vault-mixed-currency').textContent).toMatch(/INR, USD/);
  });

  it('S1-28: marks you and the owner, and offers no access change on your own row', async () => {
    state.me = ME;
    state.ownerId = ME;
    state.extraMembers = [{ userId: ME, vaultAccess: 'SPEND', spendCapMinor: null, spentMinor: 0 }];
    await openHousehold();
    expect(screen.getByText(/You \(owner\) · can spend/)).toBeTruthy();
    expect(screen.getByText(/Member 1 · view only/)).toBeTruthy();
    // One button, for the other member; none to change your own access.
    expect(screen.getAllByText('Allow spend')).toHaveLength(1);
    expect(screen.queryByText('Make view-only')).toBeNull();
  });

  it('S1-28: a member who is not the owner sees the owner labelled and no access buttons', async () => {
    state.me = ME;
    state.ownerId = MEMBER;
    state.extraMembers = [{ userId: ME, vaultAccess: 'VIEW', spendCapMinor: null, spentMinor: 0 }];
    await openHousehold();
    expect(screen.getByText(/Owner · view only/)).toBeTruthy();
    expect(screen.getByText(/You · view only/)).toBeTruthy();
    expect(screen.queryByText('Allow spend')).toBeNull();
  });
});
