import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('renders label', () => {
    render(<Button label="Shop now" />);
    expect(screen.getByText('Shop now')).toBeTruthy();
  });

  it('fires onPress', () => {
    const onPress = vi.fn();
    render(<Button label="Tap" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders variants and sizes', () => {
    render(<Button label="Ghost" size="sm" variant="ghost" />);
    expect(screen.getByText('Ghost')).toBeTruthy();
  });

  it('disables press when disabled', () => {
    const onPress = vi.fn();
    render(<Button disabled label="Nope" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
