import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VAULT_TRUST_STRIP_LABEL } from '@/src/lib/vaultTrustStrip';

import { VaultTrustStrip } from './VaultTrustStrip';

const push = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({ push }),
}));

describe('VaultTrustStrip', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('renders persistent trust copy and links', () => {
    render(<VaultTrustStrip />);
    expect(screen.getByTestId('vault-trust-strip')).toBeTruthy();
    expect(screen.getByText(VAULT_TRUST_STRIP_LABEL)).toBeTruthy();
    expect(screen.getByLabelText('Revoke')).toBeTruthy();
    expect(screen.getByLabelText('Export / Delete')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Revoke'));
    expect(push).toHaveBeenCalled();
    const arg = push.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      pathname: '/(closet)/consent',
      params: { focus: 'revoke' },
    });
  });
});
