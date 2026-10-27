import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { wornInk } from '@/src/theme/tokens';

import { Button } from './Button';

// Reanimated's animated components ignore a style function (on web the button lost its
// background and height), so fail loudly if Button ever passes one again.
vi.mock('react-native-reanimated', () => {
  const identity = (t: number) => t;
  return {
    default: {
      View: 'div',
      createAnimatedComponent:
        (Component: React.ComponentType<Record<string, unknown>>) =>
        (props: Record<string, unknown>) => {
          if (typeof props.style === 'function') throw new Error('style function on an animated component');
          // Flatten like React Native does, so the DOM stand-in gets one style object.
          const style = Array.isArray(props.style)
            ? Object.assign({}, ...(props.style as unknown[]).flat(Infinity).filter(Boolean))
            : props.style;
          return React.createElement(Component, { ...props, style });
        },
    },
    useSharedValue: <T,>(initial: T) => ({ value: initial }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
    Easing: { linear: identity, bezier: () => identity },
  };
});

describe('Button style', () => {
  it('passes a plain style array, so the variant background reaches the view', () => {
    render(<Button label="Add a gift card" />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).not.toBe('');
    expect(button.style.backgroundColor).not.toBe('transparent');
    // jsdom normalises hex to rgb; compare against the token the same way.
    const probe = document.createElement('div');
    probe.style.backgroundColor = wornInk;
    expect(button.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it('still resolves a caller style function', () => {
    render(<Button label="Go" style={({ pressed }) => ({ marginTop: pressed ? 2 : 7 })} />);
    expect(screen.getByRole('button').style.marginTop).toBe('7px');
  });
});
