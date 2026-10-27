import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HouseholdScreen from '@/app/(closet)/household';

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

vi.mock('@/src/hooks/closet/useCloset', () => {
  const mutation = (mutate = vi.fn()) => ({ mutate, isPending: false });
  return {
    useHouseholds: () => ({
      data: { households: [{ id: H, name: 'Our home', inviteCode: 'ABCD12' }] },
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
            ],
            members: [{ userId: MEMBER, vaultAccess: 'VIEW', spendCapMinor: null, spentMinor: 0 }],
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
});
