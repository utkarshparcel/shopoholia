import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmiDontMissCards } from './EmiDontMissCards';

const plan = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  userId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  provider: 'Simpl',
  merchant: 'Myntra',
  principalMinor: 10_000_00,
  remainingMinor: 4_000_00,
  installmentMinor: 2_000_00,
  nextDueOn: '2026-08-28',
  currency: 'INR',
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

vi.mock('@/src/hooks/closet/useCloset', () => ({
  useEmiPlans: vi.fn(() => ({ data: { plans: [plan] } })),
  usePayEmi: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateEmiFromSms: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/src/lib/closetAlert', () => ({
  alertClosetError: vi.fn(),
}));

describe('EmiDontMissCards (W030 / U007)', () => {
  it('renders SMS paste + due board with mark paid', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    render(<EmiDontMissCards now={now} highlightPlanId={plan.id} />);
    expect(screen.getByTestId('emi-dont-miss-cards')).toBeTruthy();
    expect(screen.getByTestId('emi-from-sms')).toBeTruthy();
    expect(screen.getByPlaceholderText('Paste EMI due SMS here…')).toBeTruthy();
    expect(screen.getByTestId('emi-due-board')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy();
  });
});
