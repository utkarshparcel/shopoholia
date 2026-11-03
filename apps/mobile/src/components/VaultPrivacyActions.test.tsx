import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VaultPrivacyActions } from './VaultPrivacyActions';

const deleteMutate = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vault',
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/src/hooks/closet/useCloset', () => ({
  useExportVault: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteVault: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('VaultPrivacyActions', () => {
  beforeEach(() => deleteMutate.mockClear());

  it('confirms account deletion in a sheet that works on web too', async () => {
    render(<VaultPrivacyActions />);
    fireEvent.click(screen.getByText('Delete my account'));
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    // The same list as Worn Play's Delete account, plus what Closet holds.
    const message = screen.getByText(/permanently deletes your WORN account/).textContent ?? '';
    for (const what of [/photos you uploaded/, /coins/, /can’t be\s+refunded/, /Vault/, /can’t be undone/]) {
      expect(message).toMatch(what);
    }
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('prompt-sheet')).getByText('Cancel'));
    });
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete my account'));
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('prompt-sheet')).getByText('Delete'));
    });
    expect(deleteMutate).toHaveBeenCalledTimes(1);
  });
});
