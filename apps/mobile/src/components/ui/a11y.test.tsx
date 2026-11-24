import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from './Chip';
import { CoinIcon, CoinWallet } from './CoinWallet';
import { ListingCard } from './ListingCard';
import { CONNECTOR_LEFT } from './OrderTracker';

describe('Chip', () => {
  it('tells screen readers which chip is selected', () => {
    render(
      <>
        <Chip active label="dresses" />
        <Chip label="tops" />
      </>,
    );
    expect(screen.getByText('dresses').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('tops').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reaches a 44pt touch area around its ~31pt body', () => {
    render(<Chip label="tops" />);
    const slop = JSON.parse(screen.getByText('tops').closest('button')!.getAttribute('data-hitslop')!);
    expect(31 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
  });
});

describe('CoinWallet', () => {
  it('the 20pt "+" gets a 44pt touch area', () => {
    const onAdd = vi.fn();
    render(<CoinWallet balance={100} onAdd={onAdd} />);
    const plus = screen.getByLabelText('Get more coins');
    expect(20 + 2 * Number(plus.getAttribute('data-hitslop'))).toBeGreaterThanOrEqual(44);
    fireEvent.click(plus);
    expect(onAdd).toHaveBeenCalled();
  });
});

describe('CoinIcon', () => {
  it('draws the small and the large coin', () => {
    const { rerender } = render(<CoinIcon />);
    expect(screen.getByTestId('coin-icon-sm')).toBeTruthy();
    rerender(<CoinIcon size="lg" />);
    expect(screen.getByTestId('coin-icon-lg')).toBeTruthy();
    expect(screen.queryByTestId('coin-icon-sm')).toBeNull();
  });
});

describe('ListingCard', () => {
  it('names the photo button with the piece and its price', () => {
    const onPress = vi.fn();
    render(<ListingCard brand="WORN" coinPrice={40} onPress={onPress} title="Black Tee" />);
    fireEvent.click(screen.getByLabelText('Black Tee, 40 coins'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows no partner price when the listing has none', () => {
    render(<ListingCard brand="WORN" coinPrice={40} realPrice={null} title="Black Tee" />);
    expect(screen.queryByText(/₹/)).toBeNull();
  });
});

describe('OrderTracker', () => {
  it('runs the connector line through the dots’ centres (6pt padding + half of a 20pt dot)', () => {
    const connectorWidth = 2;
    expect(CONNECTOR_LEFT + connectorWidth / 2).toBe(6 + 20 / 2);
  });
});
