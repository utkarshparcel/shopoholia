import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MultiCardStack } from './MultiCardStack';

const now = new Date('2026-08-26T10:00:00.000Z');

const three = [
  {
    id: 'a1',
    merchant: 'Myntra',
    expiresAt: '2026-08-29T10:00:00.000Z',
    balanceCacheMinor: 50_000,
    currency: 'INR',
  },
  {
    id: 'a2',
    merchant: 'Amazon',
    expiresAt: '2026-08-27T12:00:00.000Z',
    balanceCacheMinor: 20_000,
    currency: 'INR',
  },
  {
    id: 'a3',
    merchant: 'Nykaa',
    expiresAt: null,
    balanceCacheMinor: 10_000,
    currency: 'INR',
  },
];

describe('MultiCardStack (W019)', () => {
  it('renders stack for ≥3 with a11y totals', () => {
    render(<MultiCardStack accounts={three} now={now} />);
    const stack = screen.getByTestId('multi-card-stack');
    expect(stack).toBeTruthy();
    expect(screen.getByLabelText(/3 credits stacked/)).toBeTruthy();
    expect(screen.getByText('Amazon')).toBeTruthy();
  });

  it('hides under 3 credits', () => {
    const { container } = render(
      <MultiCardStack accounts={three.slice(0, 2)} now={now} />,
    );
    expect(container.querySelector('[data-testid="multi-card-stack"]')).toBeNull();
  });
});
