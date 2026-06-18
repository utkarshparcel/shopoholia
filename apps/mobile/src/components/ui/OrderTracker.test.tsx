import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrderTracker } from './OrderTracker';

const steps = [
  { id: '1', label: 'Processing', state: 'done' as const },
  { id: '2', label: 'Packed', state: 'current' as const, detail: 'Soon' },
  { id: '3', label: 'Delivered', state: 'todo' as const },
];

describe('OrderTracker', () => {
  it('renders order id, eta, and steps', () => {
    render(<OrderTracker eta="12 min" orderId="#W-42" steps={steps} />);
    expect(screen.getByText('Order #W-42')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Soon')).toBeTruthy();
  });
});
