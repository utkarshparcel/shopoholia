import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from './Chip';

describe('Chip', () => {
  it('renders label', () => {
    render(<Chip label="New in" />);
    expect(screen.getByText('New in')).toBeTruthy();
  });

  it('handles press', () => {
    const onPress = vi.fn();
    render(<Chip active label="Sale" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});
