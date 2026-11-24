import { act, fireEvent, render, screen } from '@testing-library/react';
import { PanResponder } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderCard } from '@/src/api/client';

type Gesture = { dx: number; dy: number };
type Responder = { onPanResponderRelease: (e: unknown, g: Gesture) => void };

const h = vi.hoisted(() => ({
  responder: null as Responder | null,
  // What the last fly-out spring reports when it ends: finished, or interrupted.
  finishSpring: null as ((finished: boolean) => void) | null,
}));

vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const host = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return {
    default: { View: host, createAnimatedComponent: <T,>(c: T) => c },
    useSharedValue: <T,>(initial: T) => ({ value: initial }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: <T,>(value: T) => value,
    withRepeat: <T,>(value: T) => value,
    cancelAnimation: () => undefined,
    withSpring: <T,>(value: T, _config?: unknown, callback?: (finished: boolean) => void) => {
      h.finishSpring = callback ?? null;
      return value;
    },
    runOnJS: <T,>(fn: T) => fn,
    Easing: { linear: (t: number) => t },
  };
});

import { RevealDeck } from './RevealDeck';

const card = (id: string): RenderCard => ({
  id,
  orderItemId: 'item-1',
  scenario: id.toUpperCase(),
  imageUrl: null,
  isFree: true,
  unlocked: true,
  status: 'DONE',
});

const RENDERS = [card('studio'), card('street'), card('night')];

beforeEach(() => {
  vi.spyOn(PanResponder, 'create').mockImplementation(((config: Responder) => {
    h.responder = config;
    return { panHandlers: {} };
  }) as never);
});

describe('RevealDeck', () => {
  it('names its arrows for screen readers', () => {
    render(<RevealDeck onUnlock={vi.fn()} renders={RENDERS} />);
    expect(screen.getByLabelText('Previous look')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next look'));
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('moves on a finished swipe, and stays put when the fly-out was interrupted', () => {
    render(<RevealDeck onUnlock={vi.fn()} renders={RENDERS} />);

    act(() => h.responder!.onPanResponderRelease(null, { dx: -120, dy: 0 }));
    act(() => h.finishSpring!(false));
    expect(screen.getByText('1 / 3')).toBeTruthy();

    act(() => h.responder!.onPanResponderRelease(null, { dx: -120, dy: 0 }));
    act(() => h.finishSpring!(true));
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });
});
