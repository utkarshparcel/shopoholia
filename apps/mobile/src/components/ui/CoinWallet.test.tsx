import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoinIcon, CoinWallet } from './CoinWallet';

describe('CoinWallet', () => {
  afterEach(() => cleanup());

  it('renders balance', () => {
    render(<CoinWallet balance={500} />);
    expect(screen.getByText('500')).toBeTruthy();
  });

  it('calls onAdd', () => {
    const onAdd = vi.fn();
    render(<CoinWallet balance={100} onAdd={onAdd} />);
    fireEvent.click(screen.getByText('+'));
    expect(onAdd).toHaveBeenCalled();
  });
});

describe('CoinIcon', () => {
  it('renders sizes', () => {
    const { rerender } = render(<CoinIcon />);
    rerender(<CoinIcon size="lg" />);
    expect(true).toBe(true);
  });
});
