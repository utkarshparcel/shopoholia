import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IosForwardWizard } from './IosForwardWizard';

vi.mock('@/src/lib/sms', () => ({
  getSmsForwardingAddress: () => 'forward@inbox.shopoholia.app',
}));

describe('IosForwardWizard (W011)', () => {
  it('renders step 1 with address and no READ_SMS marketing', () => {
    render(<IosForwardWizard userKey="user-1" />);
    expect(screen.getByTestId('ios-forward-wizard')).toBeTruthy();
    expect(screen.getByText(/Create your forward address/i)).toBeTruthy();
    expect(screen.getByText('forward+user1@inbox.shopoholia.app')).toBeTruthy();
    expect(screen.getByTestId('ios-forward-wizard').textContent ?? '').not.toMatch(/READ_SMS/i);
  });

  it('advances through mail rule to test ping', () => {
    render(<IosForwardWizard />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(screen.getByText(/Add a Mail \/ Messages rule/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Send a test ping/i)).toBeTruthy();
    expect(screen.getByTestId('ios-forward-wizard').textContent ?? '').not.toMatch(/READ_SMS/i);
  });
});
