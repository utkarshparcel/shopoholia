import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AccessorySlotToday } from './AccessorySlotToday';

vi.mock('@/src/hooks/closet/useCloset', () => ({
  useWardrobe: vi.fn(() => ({
    data: {
      items: [
        { id: 'j1', category: 'necklace', brand: 'Local' },
        { id: 'j2', category: 'earrings', brand: null },
      ],
    },
  })),
  usePatchWeekOutfit: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('AccessorySlotToday (W066)', () => {
  it('renders attach accessory CTA for today outfit', () => {
    render(
      <AccessorySlotToday
        itemIds={['t1']}
        items={[{ id: 't1', category: 'shirt', brand: 'X' }]}
        plannedFor="2026-08-26"
      />,
    );
    expect(screen.getByTestId('accessory-slot-today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach accessory' })).toBeTruthy();
  });

  it('renders swap when accessory already on outfit', () => {
    render(
      <AccessorySlotToday
        itemIds={['t1', 'j1']}
        items={[
          { id: 't1', category: 'shirt' },
          { id: 'j1', category: 'necklace', brand: 'Local' },
        ]}
        plannedFor="2026-08-26"
      />,
    );
    expect(screen.getByText(/Local · necklace/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Swap accessory' })).toBeTruthy();
  });
});
