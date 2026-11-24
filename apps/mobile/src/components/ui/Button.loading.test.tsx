import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const anim = vi.hoisted(() => ({
  withRepeat: vi.fn(<T,>(value: T) => value),
  cancelAnimation: vi.fn(),
}));

vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const host = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return {
    default: { View: host, createAnimatedComponent: <T,>(c: T) => c },
    useSharedValue: <T,>(initial: T) => ({ value: initial }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
    withRepeat: anim.withRepeat,
    cancelAnimation: anim.cancelAnimation,
    Easing: { linear: (t: number) => t },
  };
});

import { Button } from './Button';

describe('Button while loading', () => {
  it('keeps its label as the accessible name and marks itself busy', () => {
    render(<Button label="Pay with coins" loading />);
    const button = screen.getByRole('button', { name: 'Pay with coins' });
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('spins until it stops loading (a repeating animation, cancelled on unmount)', () => {
    const { unmount } = render(<Button label="Pay" loading />);
    expect(anim.withRepeat).toHaveBeenCalledWith(expect.anything(), -1, false);
    unmount();
    expect(anim.cancelAnimation).toHaveBeenCalled();
  });
});
