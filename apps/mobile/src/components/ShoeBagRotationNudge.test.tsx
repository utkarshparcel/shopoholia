import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ShoeBagRotationNudge } from './ShoeBagRotationNudge';

vi.mock('@/src/hooks/closet/useCloset', () => ({
  useShoeBagRotation: vi.fn(() => ({
    data: {
      suggestions: [
        {
          id: 's1',
          category: 'sneakers',
          brand: 'Nike',
          kind: 'shoes',
          wearCount: 0,
          reason: 'Never worn shoes — good rotation pick',
          colors: [],
          lastWornAt: null,
          score: 100,
        },
      ],
    },
    refetch: vi.fn(),
  })),
  useLogWear: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('ShoeBagRotationNudge (W067)', () => {
  it('renders nudge card from GET /wardrobe/rotation', () => {
    render(<ShoeBagRotationNudge />);
    expect(screen.getByTestId('shoe-bag-rotation-nudge')).toBeTruthy();
    expect(screen.getByText(/Rotate your shoes/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log a wear' })).toBeTruthy();
  });
});
