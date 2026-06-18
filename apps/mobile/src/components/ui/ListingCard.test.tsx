import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ListingCard } from './ListingCard';

describe('ListingCard', () => {
  it('renders grid card', () => {
    render(
      <ListingCard brand="WORN" coinPrice={120} realPrice="₹2,499" tag="NEW" title="Linen Blazer" />,
    );
    expect(screen.getByText('Linen Blazer')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
  });

  it('handles quick add and favorite', () => {
    const onQuickAdd = vi.fn();
    const onFavorite = vi.fn();
    const { container } = render(
      <ListingCard
        brand="WORN"
        coinPrice={80}
        onFavorite={onFavorite}
        onQuickAdd={onQuickAdd}
        title="Silk Dress"
      />,
    );
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onFavorite).toHaveBeenCalled();
    expect(onQuickAdd).toHaveBeenCalled();
  });

  it('renders feed variant', () => {
    render(
      <ListingCard brand="WORN" coinPrice={90} title="Coat" tone="dusk" variant="feed" />,
    );
    expect(screen.getByText('Coat')).toBeTruthy();
  });
});
